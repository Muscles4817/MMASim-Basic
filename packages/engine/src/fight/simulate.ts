/**
 * The fight simulator.
 *
 * A loop over *exchanges* — one meaningful beat of the fight each, consuming a variable
 * slice of the clock. See docs/03-fight-engine.md for the model and the reasoning behind
 * this granularity.
 *
 * The internal state is mutable for performance (10k-fight statistical tests need to stay
 * cheap) but never escapes this module: `simulateFight` is a pure function of its inputs
 * plus the seed.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import { createRng, type Rng } from '../core/rng.js';
import type { FighterId } from '../core/ids.js';
import type { Fighter, FinishMethod } from '../domain/fighter.js';
import type { GamePlan, ReadKey } from '../domain/gameplan.js';
import { PREP_MAX_BONUS, defaultGamePlan, normaliseGamePlan, prepValue, riskProfile } from '../domain/gameplan.js';
import { stanceEdge } from './stance.js';
import { chooseAction, type Candidate } from './decide.js';
import {
  ENTRY_EASE,
  RANGE_COUNTER,
  TRANSITION_RANGE,
  changeToward,
  decayStickiness,
  disengageRange,
  rangeChangeChance,
  stepRange,
  strikeSuitability,
  targetFitness,
} from './range.js';
import {
  bottomRouteBias,
  bottomWorkBias,
  bottomExitUrgency,
  clinchWorkBias,
  desiredRangeOf,
  groundDenial,
  rangeUrgency,
  recoveryIntensity,
  erodePlanIntegrity,
  finishOpportunity,
  clinchExitUrgency,
  clinchExitBias,
  isDisplaced,
  restorePlanIntegrity,
  situationOf,
  stanceOf,
  standingBias,
  submissionOpportunity,
  topBias,
  topControlFocus,
  topExitBias,
  type Stance,
} from './policy.js';
import type { Judge, Referee } from '../domain/officials.js';
import { defaultJudges, defaultReferee } from '../domain/officials.js';
import { traitMul } from '../domain/traits.js';
import { fatiguedEffect, repertoire } from '../ratings/curve.js';
import * as say from './commentary.js';
import { remember, resetRoundMemory } from './memory.js';
import {
  LEAD_DISCOUNT,
  PATTERN_NAMES,
  PATTERNS,
  TECHNIQUE_SHAPE,
  choosePattern,
  setupMultiplier,
  shotSeconds,
  type Technique,
} from './combos.js';
import { cornerAdvice, familyLean, inFightRead, notePattern, patternFamiliarity } from './mind.js';
import {
  MAX_CHAIN,
  backExposureChance,
  chainChance,
  chainEdge,
  chainedEntry,
  frontHeadlockChance,
  headlockChoke,
  headlockOption,
  matReturnChance,
  scramble,
} from './wrestling.js';
import {
  afterStrikeStory,
  checkedKick,
  cornerStops,
  maybeSecondWind,
  survivalRoute,
  survivedLock,
  type InFightInjury,
  type StoryContext,
} from './stories.js';
import {
  chooseSubmission,
  submissionsFrom,
  SUBMISSIONS as SUBMISSION_META,
  type SubmissionKey,
} from './submissions.js';
import {
  applyStrike,
  decayHurt,
  legImpairment,
  shouldRefereeStop,
  type StrikeOutcome,
} from './damage.js';
import {
  createCombatant,
  effectiveComposure,
  kickLean,
  momentumMultiplier,
  roundBiasMultiplier,
  targetMix,
  type Combatant,
} from './profile.js';
import {
  FOUL_META,
  describeFoul,
  recoveryBenefit,
  refereeRuling,
  rollFoul,
  rollNoContest,
  type FoulIncident,
} from './fouls.js';
import { buildScorecards, emptyTally, readDecision, type RoundTally } from './scoring.js';
import { accrueFatigue, chargeStrike, paceMultiplier, recoverBetweenRounds, workRate } from './stamina.js';
import {
  GROUND_DOMINANCE,
  ladderStep,
  OTHER_CORNER,
  STRIKE_TARGETS,
  emptyStats,
  type Corner,
  type Range,
  type DamageReport,
  type FightEvent,
  type FightEventKind,
  type FightResult,
  type GroundPosition,
  type Position,
  type StrikeTarget,
  type TakedownEntry,
  type Weapon,
} from './types.js';

export interface CornerConfig {
  fighter: Fighter;
  plan?: GamePlan;
}

export interface FightConfig {
  boutId: string;
  red: CornerConfig;
  blue: CornerConfig;
  rounds?: 3 | 5;
  roundSeconds?: number;
  referee?: Referee;
  judges?: readonly Judge[];
  /** Seed for this bout. Same seed + same inputs = byte-identical result. */
  seed?: string;
}

/** Mutable fight state. Local to one `simulateFight` call. */
interface FightState {
  position: Position;
  /** Corner on top, when on the ground. */
  groundTop?: Corner;
  groundPosition: GroundPosition;
  /** How far apart they are, while standing. Meaningless in the clinch or on the floor. */
  range: Range;
  /**
   * 0–1. How established the current range is.
   *
   * Set to 1 when somebody imposes a range and decayed every exchange. Without it the fight
   * strobes: A closes, B steps out, A closes, and the state flickers all night while neither man
   * achieves anything, which is worse than having no state. Taking the pocket off a pressure
   * fighter who has just walked you into it is an achievement, and this is what makes it one.
   */
  rangeSettled: number;
  /** Corner controlling the clinch, if either. */
  clinchControl?: Corner;
  /**
   * Who put the fight in its current position.
   *
   * `undefined` at the opening bell and after a referee stand-up — nobody chose those. Everything
   * else has an author, and `policy.ts` reads it: a fighter who is somewhere they did not choose
   * to be wants out of it harder than one who walked in.
   */
  placedBy?: Corner;
  /** Seconds the current ground position has run without meaningful action. */
  stalledSeconds: number;
  /** Unanswered strikes landed on a hurt fighter, per corner (as the *victim*). */
  unanswered: Record<Corner, number>;
  /** Cut severity 0–100 per corner. Feeds doctor stoppages. */
  cuts: Record<Corner, number>;
  deductions: Record<Corner, number>;
  /** Every foul this fight, called or missed. */
  fouls: FoulIncident[];
  /** Fouls the referee actually *called* per corner. Drives escalating punishment. */
  foulsCalled: Record<Corner, number>;
}

interface Ending {
  method: FinishMethod;
  winner?: Corner;
  submissionName?: string;
}

const DEFAULT_ROUND_SECONDS = 300;

/**
 * Peak per-attempt submission finish rate, for a total mismatch in the best position.
 *
 * Tuned against `tests/statistical/balance.test.ts`. Submissions are the easiest system in
 * the whole engine to over-tune, because attempts recur every ground exchange: a rate that
 * looks reasonable per attempt compounds into an implausible population sub rate.
 */
const SUBMISSION_FINISH_RATE = 0.47;

/**
 * How much each previous submission attempt by the same fighter dulls the next one.
 *
 * Without this, submission danger compounds across a fight: a grappler with ten attempts
 * converts at an implausible rate purely because the rolls are independent. They are not —
 * a defender who has survived the same look three times knows it is coming, and the corner
 * is screaming about it. This also caps the outlier case without flattening the specialist.
 */
const SUBMISSION_REPEAT_DECAY = 0.4;

/** Put the fighters back in the centre, on their feet. Used at the opening bell and each round. */
function resetToStanding(state: FightState): void {
  state.position = 'distance';
  // A neutral restart, so both men reset to their own distance. Organic transitions — a clinch
  // break, a scramble, a stuffed shot — inherit from what just happened; see `TRANSITION_RANGE`.
  state.range = TRANSITION_RANGE.neutral!;
  state.rangeSettled = 0;
  state.groundTop = undefined;
  state.groundPosition = 'guard';
  state.clinchControl = undefined;
  state.stalledSeconds = 0;
  // Nobody put anybody here: a reset is the referee's, and `policy.ts` reads `placedBy` to ask
  // whether a fighter chose to be where they are.
  state.placedBy = undefined;
}

export function simulateFight(config: FightConfig): FightResult {
  const rounds = config.rounds ?? 3;
  const roundSeconds = config.roundSeconds ?? DEFAULT_ROUND_SECONDS;
  const referee = config.referee ?? defaultReferee();
  const judges = config.judges ?? defaultJudges();
  const rng = createRng(config.seed ?? `bout:${config.boutId}`).fork('fight');

  const red = createCombatant(
    'red',
    config.red.fighter,
    normaliseGamePlan(config.red.plan ?? defaultGamePlan()),
  );
  const blue = createCombatant(
    'blue',
    config.blue.fighter,
    normaliseGamePlan(config.blue.plan ?? defaultGamePlan()),
  );
  const corners: Record<Corner, Combatant> = { red, blue };

  const state: FightState = {
    position: 'distance',
    range: TRANSITION_RANGE.neutral!,
    rangeSettled: 0,
    groundPosition: 'guard',
    stalledSeconds: 0,
    unanswered: { red: 0, blue: 0 },
    cuts: { red: 0, blue: 0 },
    deductions: { red: 0, blue: 0 },
    fouls: [],
    foulsCalled: { red: 0, blue: 0 },
  };
  resetToStanding(state);

  const events: FightEvent[] = [];
  const beat = { offset: 0 };
  // Lines from the stool — the corner, a second wind — told after the next bell rather than before it.
  const fromTheCorner: FightEvent[] = [];
  const tallies: Record<Corner, RoundTally>[] = [];
  let ending: Ending | undefined;
  let endRound: number = rounds;
  let endTime: number = roundSeconds;

  for (let round = 1; round <= rounds && !ending; round++) {
    const roundRng = rng.fork(`round:${round}`);
    resetRoundMemory(red);
    resetRoundMemory(blue);
    const tally: Record<Corner, RoundTally> = { red: emptyTally(), blue: emptyTally() };
    tallies.push(tally);

    let clock = 0;
    events.push({
      round,
      timeSeconds: 0,
      kind: 'roundStart',
      text: say.roundStartText(round, rounds),
    });
    events.push(...fromTheCorner);
    fromTheCorner.length = 0;

    while (clock < roundSeconds) {
      const emit = (
        kind: FightEventKind,
        text: string,
        corner?: Corner,
        emphasis?: FightEvent['emphasis'],
        fact?: { weapon?: Weapon; target?: StrikeTarget; takedown?: TakedownEntry },
      ) => {
        events.push({
          round,
          timeSeconds: Math.min(roundSeconds, Math.round(clock + beat.offset)),
          kind,
          text,
          corner,
          emphasis,
          weapon: fact?.weapon,
          target: fact?.target,
          takedown: fact?.takedown,
        });
      };

      beat.offset = 0;
      const exchange = resolveExchange({
        rng: roundRng,
        corners,
        state,
        tally,
        referee,
        round,
        totalRounds: rounds,
        secondsRemaining: roundSeconds - clock,
        clockSeconds: clock,
        roundSeconds,
        beat,
        emit,
        scoreSoFar: tallies,
      });

      clock = Math.min(roundSeconds, clock + exchange.seconds);

      if (exchange.ending) {
        ending = exchange.ending;
        endRound = round;
        endTime = Math.round(clock);
        // A disqualification or no contest has already announced itself in the foul line;
        // running it through finishText would produce "…by knockout" for an eye poke.
        if (ending.method !== 'dq' && ending.method !== 'noContest') {
          events.push({
            round,
            timeSeconds: endTime,
            kind: 'finish',
            emphasis: 'critical',
            text: say.finishText(
              exchange.ending.method as 'ko' | 'tko' | 'submission' | 'doctorStoppage' | 'retirement',
              corners[exchange.ending.winner!],
              corners[OTHER_CORNER[exchange.ending.winner!]],
              exchange.ending.submissionName,
            ),
          });
        }
        break;
      }
    }

    if (ending) break;

    events.push({ round, timeSeconds: roundSeconds, kind: 'roundEnd', text: `End of round ${round}.` });

    // The doctor looks at every round, including the last: a cut opened in round three is
    // still a cut, and only checking between rounds meant final-round cuts were ignored.
    const doctorVerdict = checkDoctor(rng.fork(`doctor:${round}`), state);
    if (doctorVerdict) {
      ending = doctorVerdict;
      endRound = round;
      endTime = roundSeconds;
      events.push({
        round,
        timeSeconds: roundSeconds,
        kind: 'finish',
        emphasis: 'critical',
        text: say.finishText(
          'doctorStoppage',
          corners[doctorVerdict.winner!],
          corners[OTHER_CORNER[doctorVerdict.winner!]],
        ),
      });
      break;
    }

    /*
     * The corner. A fighter too damaged to go on is pulled out on the stool (doc 36 phase 3) —
     * `'retirement'` was a finish method with narration and nothing that produced it.
     */
    if (round < rounds) {
      const cornerRng = rng.fork(`corner:${round}`);
      for (const corner of ['red', 'blue'] as const) {
        if (cornerStops(cornerRng, corners[corner])) {
          ending = { method: 'retirement', winner: OTHER_CORNER[corner] };
          endRound = round;
          endTime = roundSeconds;
          events.push({
            round,
            timeSeconds: roundSeconds,
            kind: 'finish',
            emphasis: 'critical',
            text: `${corners[corner].fighter.lastName}'s corner has seen enough — they will not come out for round ${round + 1}. ${say.fullDisplayName(corners[OTHER_CORNER[corner]])} wins.`,
          });
          break;
        }
      }
      if (ending) break;
    }

    // Between rounds: recover and reset to standing.
    if (round < rounds) {
      recoverBetweenRounds(red);
      recoverBetweenRounds(blue);
      // Sixty seconds and a corner shouting is worth some of the plan back. Never all of it.
      restorePlanIntegrity(red);
      restorePlanIntegrity(blue);
      // A fighter who just lost a round badly may come out of the corner different.
      const story: StoryContext = {
        round: round + 1,
        rng: rng.fork(`secondWind:${round}`),
        emit: (kind, text, corner, emphasis) =>
          fromTheCorner.push({ round: round + 1, timeSeconds: 0, kind, text, corner, emphasis }),
      };
      for (const corner of ['red', 'blue'] as const) {
        const mine = tally[corner];
        const theirs = tally[OTHER_CORNER[corner]];
        const of = (t: RoundTally) => t.damageDealt + t.significantStrikes + t.controlSeconds * 0.15;
        maybeSecondWind(story, corners[corner], of(theirs) > of(mine) * 1.5);
      }
      // And the one instruction the corner gets to give. See `mind.ts`.
      const adviceRng = rng.fork(`advice:${round}`);
      for (const corner of ['red', 'blue'] as const) {
        const advice = cornerAdvice(
          adviceRng,
          corners[corner],
          corners[OTHER_CORNER[corner]],
          tally[corner],
          tally[OTHER_CORNER[corner]],
        );
        if (advice) {
          fromTheCorner.push({ round: round + 1, timeSeconds: 0, kind: 'note', text: advice.text, corner });
        }
      }
      state.unanswered = { red: 0, blue: 0 };
      // Every round starts standing, in the centre. Carrying position across the bell is a
      // rules violation and a large one: without this, a round that ended in mount *begins*
      // in mount, and a control grappler never has to earn the position again.
      resetToStanding(state);
    }
  }

  // --- Resolve the result --------------------------------------------------------------

  let method: FinishMethod;
  let winnerId: FighterId | undefined;
  let submissionName: string | undefined;

  const scorecards = buildScorecards(
    { judges, rounds: tallies, deductions: state.deductions },
    rng.fork('scoring'),
  );

  if (ending) {
    method = ending.method;
    submissionName = ending.submissionName;
    winnerId = ending.winner ? corners[ending.winner].fighter.id : undefined;
  } else {
    const decision = readDecision(scorecards);
    method =
      decision.type === 'draw'
        ? 'draw'
        : decision.type === 'unanimous'
          ? 'decisionUnanimous'
          : decision.type === 'split'
            ? 'decisionSplit'
            : 'decisionMajority';
    winnerId = decision.winner ? corners[decision.winner].fighter.id : undefined;
    endRound = rounds;
    endTime = roundSeconds;
    events.push({
      round: rounds,
      timeSeconds: roundSeconds,
      kind: 'decision',
      emphasis: 'major',
      text: decisionText(decision.type, decision.winner ? corners[decision.winner] : undefined),
    });
  }

  return {
    boutId: config.boutId,
    redId: red.fighter.id,
    blueId: blue.fighter.id,
    winnerId,
    method,
    round: endRound,
    timeSeconds: endTime,
    submissionName,
    events,
    scorecards,
    stats: { red: red.stats, blue: blue.stats },
    /*
     * The judges' own evidence, kept rather than discarded.
     *
     * These were built for scoring and for the corner's read of the fight and then thrown away
     * at this line, which is why the app could only ever show whole-fight totals next to
     * per-round cards. Copied rather than passed by reference: `tallies` is mutated in place
     * throughout the fight and a caller holding a live reference to the engine's working state
     * is a bug waiting for its first mutation.
     */
    roundStats: tallies.map((t) => ({ red: { ...t.red }, blue: { ...t.blue } })),
    damage: { red: damageReport(red, method, winnerId), blue: damageReport(blue, method, winnerId) },
    fouls: state.fouls,
    deductions: { ...state.deductions },
    injuries: { red: red.injuries.slice(), blue: blue.injuries.slice() },
  };
}

function decisionText(type: string, winner?: Combatant): string {
  if (!winner) return 'The judges cannot separate them — this one is a draw.';
  const label =
    type === 'unanimous' ? 'unanimous decision' : type === 'split' ? 'split decision' : 'majority decision';
  return `We go to the cards… and it is ${say.fullDisplayName(winner)} by ${label}.`;
}

function damageReport(c: Combatant, method: FinishMethod, winnerId?: FighterId): DamageReport {
  const lostByStrikes =
    winnerId !== c.fighter.id && (method === 'ko' || method === 'tko' || method === 'doctorStoppage');
  return {
    headDamage: c.damage.head,
    bodyDamage: c.damage.body,
    legDamage: c.damage.legs,
    knockdownsSuffered: c.knockdownsSuffered,
    wasFinishedByStrikes: lostByStrikes,
    // Being finished by strikes is worth far more career trauma than the raw damage total
    // suggests: it is the shots after the lights flicker that do the lasting harm.
    traumaIncrement: c.traumaIncrement * (lostByStrikes ? 1.6 : 1),
  };
}

// --- Exchange resolution ------------------------------------------------------------------

interface ExchangeContext {
  rng: Rng;
  corners: Record<Corner, Combatant>;
  state: FightState;
  tally: Record<Corner, RoundTally>;
  referee: Referee;
  round: number;
  totalRounds: number;
  secondsRemaining: number;
  /** Seconds elapsed in the current round. */
  clockSeconds: number;
  roundSeconds: number;
  /** Seconds into the current exchange, so each line of a burst carries its own time. */
  beat: { offset: number };
  emit: (
    kind: FightEventKind,
    text: string,
    corner?: Corner,
    emphasis?: FightEvent['emphasis'],
    fact?: { weapon?: Weapon; target?: StrikeTarget; takedown?: TakedownEntry },
  ) => void;
  scoreSoFar: readonly Record<Corner, RoundTally>[];
}

/** The fight clock in absolute seconds, for memory timestamps. */
function stochasticRound(rng: Rng, value: number): number {
  const floor = Math.floor(value);
  return floor + (rng.next() < value - floor ? 1 : 0);
}

function nowOf(ctx: ExchangeContext): number {
  return (ctx.round - 1) * ctx.roundSeconds + ctx.clockSeconds;
}

interface ExchangeOutcome {
  seconds: number;
  ending?: Ending;
}

function resolveExchange(ctx: ExchangeContext): ExchangeOutcome {
  const { corners, state } = ctx;

  // Who dictates this exchange. Speed and Fight IQ decide initiative; being hurt or gassed
  // hands it over. A fighter with the momentum keeps taking it.
  const initiative = pickInitiative(ctx);
  const actor = corners[initiative];
  const target = corners[OTHER_CORNER[initiative]];

  // Snapshot before anybody moves. A takedown is *distance* work that ends on the floor, and the
  // clock has to say so — see `exchangeStart`.
  const start = exchangeStart;
  start.position = state.position;
  start.range = state.range;
  start.groundTop = state.groundTop;
  start.groundPosition = state.groundPosition;
  start.clinchControl = state.clinchControl;

  const outcome =
    state.position === 'distance'
      ? resolveDistance(ctx, actor, target)
      : state.position === 'clinch'
        ? resolveClinch(ctx, actor, target)
        : resolveGround(ctx, actor, target);

  // Time, fatigue and hurt decay apply regardless of what happened.
  const seconds = Math.min(outcome.seconds, Math.max(1, ctx.secondsRemaining));
  applyPassiveEffects(ctx, seconds, start);

  // Fouls resolve after the exchange and after fatigue: it is the tired hand that pokes the
  // eye. A finish already in hand is not overturned by a foul that came with it.
  if (!outcome.ending) {
    const foulEnding = resolveFoul(ctx, actor, target, seconds);
    if (foulEnding) return { seconds, ending: foulEnding };
  }

  return { seconds, ending: outcome.ending };
}

/**
 * Fouls, and what they cost.
 *
 * The important part is `applyRecovery`: a foul stops the fight, and stopping the fight is
 * worth something to whoever needed it stopped. A fighter three seconds from being finished
 * gets two minutes and a doctor because their opponent's thumb was out. That is a real and
 * infuriating feature of the sport, and modelling it is most of the reason this exists.
 */
function resolveFoul(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  seconds: number,
): Ending | undefined {
  const { state, rng, referee, emit } = ctx;

  const type = rollFoul({
    rng,
    position: state.position,
    actorPersonality: actor.fighter.personality,
    actorFatigue: actor.fatigue,
    actorMomentum: actor.momentum,
    seconds,
  });
  if (!type) return undefined;

  const ruling = refereeRuling({
    rng,
    referee,
    type,
    priorCalled: state.foulsCalled[actor.corner],
  });

  const meta = FOUL_META[type];
  // An unseen foul buys no recovery — the referee never stopped anything.
  const recoverySeconds = ruling === 'unseen' ? 0 : meta.recoverySeconds;

  if (ruling !== 'unseen') {
    state.foulsCalled[actor.corner] += 1;
    applyRecovery(target, recoverySeconds);
  }
  if (ruling === 'pointDeduction') state.deductions[actor.corner] += 1;

  state.fouls.push({
    type,
    by: actor.corner,
    round: ctx.round,
    timeSeconds: Math.round(ctx.clockSeconds + seconds),
    ruling,
    recoverySeconds,
  });

  emit(
    ruling === 'pointDeduction' || ruling === 'disqualification' ? 'pointDeduction' : 'foul',
    describeFoul(type, actor.fighter.lastName, target.fighter.lastName, ruling),
    actor.corner,
    ruling === 'disqualification' ? 'critical' : ruling === 'pointDeduction' ? 'major' : 'minor',
  );

  if (ruling === 'disqualification') {
    return { method: 'dq', winner: target.corner };
  }

  // A no contest is the worst outcome for everybody and has to stay rare enough to be a
  // story rather than a nuisance.
  if (rollNoContest(rng, type, ruling)) {
    emit(
      'finish',
      `${target.fighter.lastName} cannot continue. That is a no contest — and nobody in the building is happy about it.`,
      undefined,
      'critical',
    );
    return { method: 'noContest' };
  }

  return undefined;
}

/** Hand back the fitness and clear-headedness a stoppage is worth. */
function applyRecovery(c: Combatant, seconds: number): void {
  if (seconds <= 0) return;
  const benefit = recoveryBenefit(c.fighter.naturals.recovery, seconds);
  // Being hurt is transient and a break clears most of it — this is the injustice.
  c.hurtSeconds = Math.max(0, c.hurtSeconds * (1 - benefit));
  // Fatigue only partially clears. Nobody gets their gas tank back from an eye poke.
  c.fatigue = Math.max(0, c.fatigue - benefit * 0.22);
}

/**
 * Where the exchange was fought, captured before the resolver moves anybody.
 *
 * The whole of F5 (docs/19 §7.4). `applyPassiveEffects` used to read `state` *after* resolution, so
 * an exchange's seconds were booked against the position it **ended** in: a takedown credited its
 * entire duration to the ground, a clinch entry credited its entire duration to the clinch, and the
 * fighter who changed position was charged for arriving as though they had already been there.
 * `distanceSeconds` is documented as a judging input, so this was not only a measurement defect.
 */
interface ExchangeStart {
  position: Position;
  /** The range the exchange was *fought at*, which is not always the one it ended at. */
  range: Range;
  groundTop?: Corner;
  groundPosition: GroundPosition;
  clinchControl?: Corner;
}

/**
 * One snapshot, reused for every exchange of every fight.
 *
 * Module-level and mutable, which is the same trade `Combatant` makes and for the same reason
 * stated at the top of this file: the fight loop must not allocate. A fresh object per exchange is
 * roughly fifty per fight and tens of millions across the statistical tier, and it took the
 * integration suite out of memory the first time this was written that way. Safe because
 * `simulateFight` is synchronous and single-threaded from the first exchange to the last.
 */
const exchangeStart: ExchangeStart = {
  position: 'distance',
  range: 'outside',
  groundPosition: 'guard',
};

function applyPassiveEffects(
  ctx: ExchangeContext,
  seconds: number,
  start: ExchangeStart,
): void {
  const { corners, state, tally } = ctx;

  /*
   * A range gets less sticky the longer nobody has done anything about it.
   *
   * The decay is what keeps `rangeSettled` a *recency* term rather than a permanent lock: a
   * pressure fighter who walked you into the pocket ninety seconds ago has no more claim on it
   * than anybody else, and without this a single early success would hold the range all round.
   */
  state.rangeSettled = decayStickiness(state.rangeSettled, seconds);

  for (const corner of ['red', 'blue'] as const) {
    const c = corners[corner];
    const isControlled =
      (start.position === 'ground' && start.groundTop === OTHER_CORNER[corner]) ||
      (start.position === 'clinch' && start.clinchControl === OTHER_CORNER[corner]);

    accrueFatigue(c, {
      position: start.position,
      range: start.range,
      groundPosition: start.groundPosition,
      isControlled,
      intensity:
        (start.position === 'distance' ? 1 : 1.15) *
        // The one term a plan has over the tank, and it only applies where it was asked for: a
        // fighter told to weather it from underneath, actually underneath. See `recoveryIntensity`.
        (isControlled && start.position === 'ground' ? recoveryIntensity(c) : 1),
      seconds,
    });
    // What tonight has done to the game plan, before the hurt state is decayed away — a fighter
    // who has just been rocked is exactly the one whose plan is coming apart.
    erodePlanIntegrity(c, seconds);
    const wasHurt = c.hurtSeconds > 0;
    decayHurt(c, seconds);
    // Clearing the hurt state clears the referee's count. Without this, unanswered shots
    // accumulate across the whole fight and a single wobble in round one becomes a stoppage
    // in round three — the referee is watching *this* sequence, not a career total.
    if (wasHurt && c.hurtSeconds <= 0) {
      state.unanswered[corner] = 0;
      ctx.emit('recovered', `${c.fighter.lastName} has recovered and is fighting back.`, corner);
    }

    if (start.position === 'distance') {
      c.stats.distanceSeconds += seconds;
      // The breakdown that makes a failed game plan diagnosable without reading the play-by-play.
      c.stats.rangeSeconds[start.range] += seconds;
    } else if (
      (start.position === 'ground' && start.groundTop === corner) ||
      (start.position === 'clinch' && start.clinchControl === corner)
    ) {
      c.stats.controlSeconds += seconds;
      if (start.position === 'clinch') c.stats.clinchControlSeconds += seconds;
      tally[corner].controlSeconds += seconds;
    }
  }
}

function pickInitiative(ctx: ExchangeContext): Corner {
  const { rng, corners, state, round, totalRounds } = ctx;
  const score = (c: Combatant): number => {
    const speed = fatiguedEffect(c.attrs.speed, 'speed', c.fatigue);
    const iq = fatiguedEffect(c.attrs.fightIq, 'fightIq', c.fatigue);
    const hurtPenalty = c.hurtSeconds > 0 ? 0.25 : 1;
    const positional =
      state.position === 'ground' && state.groundTop === c.corner
        ? 1.6
        : state.position === 'clinch' && state.clinchControl === c.corner
          ? 1.35
          : 1;
    return (
      speed *
      iq ** 0.5 *
      hurtPenalty *
      positional *
      momentumMultiplier(c) *
      roundBiasMultiplier(c, round, totalRounds) *
      workRate(c, needsFinish(ctx, c))
    );
  };
  const redScore = score(corners.red);
  const blueScore = score(corners.blue);
  return rng.chance(redScore / (redScore + blueScore)) ? 'red' : 'blue';
}

/** Is this fighter behind badly enough to need a finish? Drives desperation behaviour. */
function needsFinish(ctx: ExchangeContext, c: Combatant): boolean {
  if (ctx.round < ctx.totalRounds) return false;
  let deficit = 0;
  for (const roundTally of ctx.scoreSoFar) {
    const mine = roundTally[c.corner];
    const theirs = roundTally[OTHER_CORNER[c.corner]];
    const myScore = mine.damageDealt + mine.controlSeconds * 0.15 + mine.significantStrikes;
    const theirScore = theirs.damageDealt + theirs.controlSeconds * 0.15 + theirs.significantStrikes;
    if (theirScore > myScore * 1.15) deficit++;
  }
  return deficit >= Math.ceil(ctx.totalRounds / 2);
}

/**
 * The value of a defender's preparation against what the actor is about to do.
 *
 * Returns a 0–1 fraction of `PREP_MAX_BONUS`. Crucially it is gated on the *actor's actual
 * tendency*: drilling a calf-kick answer against someone who never kicks is wasted camp
 * time, by design. See docs/05.
 */
function prepBonus(defender: Combatant, actor: Combatant, reads: readonly ReadKey[]): number {
  let best = 0;
  for (const prepped of defender.plan.preppedReads) {
    if (!reads.includes(prepped.read)) continue;
    const value = prepValue(
      prepped,
      actor.tendencies[prepped.read],
      defender.adherence,
      defender.plan.campQuality,
    );
    if (value > best) best = value;
  }
  return best * PREP_MAX_BONUS;
}


// --- The tactical layer, as the simulator sees it -----------------------------------------

/**
 * **What the old `approachWeight` table was really doing, recorded because it cost a day to find.**
 *
 * Deleting it removed two things that looked like one. The first was the plan's grip on the
 * weights — intended, and what `policy.ts` replaces. The second was a *baseline nobody knew was
 * there*: `defaultGamePlan()` set `approach: 'pressure'`, whose row multiplied strikes by 1.25
 * and takedowns by 0.8, and every "unplanned" fight the statistical tier measures ran on it. So
 * the calibration baseline was never neutral; it leaned on the hands.
 *
 * The obvious fix — fold that row into the engine as a named constant — is wrong, and measuring
 * it is the only way to see why. World fights do not use the default plan; they use `planFor`,
 * which handed a wrestler `strike: 0.7`. Making 1.25 the engine's baseline therefore *doubled up*
 * on every planned fight: the roster's knockouts went from 29.5% to 37.5% and its first-round
 * finishes from 31.1% to 34.4%, because grapplers were now given a striker's baseline and then a
 * grappler's plan on top of it.
 *
 * So the baseline is genuinely 1.0 and `adaptive` genuinely means no preference. The G4 probes
 * lose the striking lean they were silently measured with — and still clear their bounds, at 8.9
 * points for the hands and 4.1 for the feet against floors of 8 and 4, because `topControlFocus`
 * being anchored at the default top intent gave back what the lean was worth. `BASE_KD_HAZARD`
 * was deliberately left alone: it absorbs this class of drift and did not need to.
 */

/**
 * What holding a position is worth as a *choice*, relative to the fighter's control rating.
 *
 * These replace `BASE_GROUND_STALL = 0.35` and `BASE_CLINCH_STALL = 0.5`, which were bare constants
 * carrying two different ideas at once — deliberate riding and residual inactivity — and which
 * produced a gradient that ran backwards. Measured across the roster's real `groundControl`
 * distribution on a control-oriented plan, the old constant gave the **10th percentile a 46% share
 * of top-position decisions and the best controller in the game 15%**: the worse a fighter was at
 * holding people down, the more of the fight he spent doing it, because a fixed number keeps a
 * larger share of a list whose other members scale with the man.
 *
 * Now it scales with what actually does the holding. The multiplier is what keeps that a change of
 * *shape* rather than of *level*: it is sized so the population still spends about as much of the
 * fight in positional maintenance as it did, while which fighters are doing it inverts. See
 * doc 31 § D1 for the before-and-after.
 */
const MAINTAIN_TOP_SCALE = 0.39;
const MAINTAIN_CLINCH_SCALE = 0.42;

/**
 * How steeply the *choice* to ride follows the *ability* to.
 *
 * Below 1, and deliberately. `groundControl` carries a convexity of 1.6, so its effect spans nine
 * to one across the roster — and letting the decision to hold position inherit all of that made the
 * fighters at the very top of the distribution ride three and a half times more than the constant
 * ever let them, which is more change than the sport's calibration or the Reduced resolver could
 * absorb.
 *
 * The damping is not a fudge for that, it is the more honest model. Control is a skill with a
 * ceiling as a *decision*: past a point, being better at holding somebody down does not make a
 * fighter choose to do it much more often, it makes the riding he already chose more effective —
 * and that half is modelled elsewhere, in `topControlFocus` and in the escape contest. What scales
 * steeply is how well it works, not how often it is picked.
 */
const MAINTAIN_CONVEXITY = 0.6;

/**
 * What letting go of a tie-up is worth against the things a fighter could do with it instead.
 *
 * Sized the way `TOP_EXIT_SCALE` was and for the same reason: the action did not exist, so there is
 * no previous behaviour to match and the sport stands in for it. At this level an unplanned fighter
 * releases a tie-up on 11.6% of his controlling beats — a man with no instructions mostly works with
 * what he has — a fighter told to keep the fight at range on 18–33% depending on what else he was
 * told to do with the position, and one told to grind on the fence on 3.7%. The whole action costs
 * the sport 2 to 6% of its clinch time, which is the price of the position having a door.
 */
const CLINCH_EXIT_SCALE = 0.42;

/**
 * And how much of his own hand-fighting is allowed to decide that he picks it. Invariant 1a.
 *
 * `clinchDefence` is built on strength and takedown defence and spans a good deal across the roster;
 * letting the *decision* inherit that would make releasing a tie-up a property of the fighter rather
 * than of his corner. It weighs at full strength in the contest below, where it belongs.
 */
const CLINCH_EXIT_CONVEXITY = 0.25;

/**
 * How much easier it is to let go of a tie-up than to escape one.
 *
 * The man with the grips picks the moment and the other man is not expecting it. Sized so an even
 * matchup releases about six times in ten rather than the five the bare contest would give, which is
 * the asymmetry without making the exit free — the failure branch still costs him the beat.
 */
const RELEASE_EDGE = 1.5;

/**
 * What choosing to stand back up is worth against the things a fighter could do instead.
 *
 * The one number in D2 that had to be *chosen* rather than measured, because invariant 9 asks for
 * the unplanned baseline and before this the unplanned baseline was zero by construction: the
 * action did not exist. What stands in for it is the sport. Here an unplanned fighter elects the
 * exit on about 5% of his top-position beats and voluntarily gets up about once every two fights;
 * control time falls 1.5–5% by matchup, knockouts rise 0.7 to 3 points, submissions fall 1 to 3.
 * Twice this was measured and rejected — top position started reading as optional. Half of it was
 * measured and rejected too: at a 4% neutral a striker who wants the fight standing gets up once
 * per nine minutes on top, which is a feature that exists only in the constants. Doc 31 § D2.
 */
const TOP_EXIT_SCALE = 0.28;

/**
 * And how much of the fighter's scrambling is allowed to decide that he picks it.
 *
 * The same damping D1 applied to `maintainPosition`, for the same reason and stated as the general
 * rule it has become: **capability weighs strongly on whether an action works and only lightly on
 * whether it is chosen.** Undamped, `scrambling`'s convexity of 1.2 spans 6.8:1 across the roster,
 * and letting the decision inherit all of it made the top exit a property of the fighter rather
 * than of his corner — undamped it runs 7.8% of top-position beats at 15 scrambling against 36.5%
 * at 95, on the same instruction, against the twelve-fold span the plan is supposed to own. That is
 * invariant 1 with the two halves swapped. At 0.25 it runs 13.6% to 20.3%: a fighter who knows he
 * can get up is somewhat readier to let the position go, which is honest, and the rest of the
 * spread shows up where it belongs, in the contest below.
 */
const TOP_EXIT_CONVEXITY = 0.25;

/**
 * How the current round is going for this fighter, on the same arithmetic the judges use.
 *
 * Deliberately the *current* round rather than the fight: a corner between rounds talks about
 * the fight, but a fighter in the middle of one is reacting to the last ninety seconds. The
 * threshold is generous because this only chooses which contingency is in force, and a rule that
 * flickers on and off every exchange is a rule the player cannot see working.
 */
function roundStanding(ctx: ExchangeContext, c: Combatant): 'ahead' | 'behind' | 'level' {
  const mine = ctx.tally[c.corner];
  const theirs = ctx.tally[OTHER_CORNER[c.corner]];
  const of = (t: RoundTally) => t.damageDealt + t.significantStrikes + t.controlSeconds * 0.15;
  const my = of(mine);
  const their = of(theirs);
  if (my + their < 6) return 'level'; // Too early in the round to be losing it.
  if (their > my * 1.35) return 'behind';
  if (my > their * 1.35) return 'ahead';
  return 'level';
}

/**
 * What this fighter is trying to do, right here.
 *
 * Recomputed per decision rather than cached per round, because every input to it moves inside a
 * round — who is hurt, who is ahead, how much of the plan is left, and crucially *whether they
 * chose to be here*. `state.placedBy` is the last of those: the simulator has always known which
 * fighter caused the current position and never wrote it down, and "I walked into this clinch"
 * and "he put me here" are different positions with the same name.
 */
function stanceOfActor(
  ctx: ExchangeContext,
  actor: Combatant,
  where: 'distance' | 'clinch' | 'top' | 'bottom',
): Stance {
  const target = ctx.corners[OTHER_CORNER[actor.corner]];
  const standing = roundStanding(ctx, actor);
  const situation = situationOf({
    losing: standing === 'behind',
    winning: standing === 'ahead',
    secondsRemaining: ctx.secondsRemaining,
    hurt: actor.hurtSeconds > 0,
    opponentHurt: target.hurtSeconds > 0,
  });
  const forced = ctx.state.placedBy !== undefined && ctx.state.placedBy !== actor.corner;
  return stanceOf(
    actor,
    situation,
    isDisplaced(actor.plan.tactics.preferredState, where, forced),
  );
}

/**
 * How this fighter intends to *get* to the fight they want, as a weight on the two routes there.
 *
 * `preferredState` says a wrestler wants top position; it does not say whether he shoots for it
 * from range or walks you onto the fence and takes you down from the tie-up. Those are different
 * fighters who look nothing alike, and before this the plan had no way to tell them apart —
 * which is half of why judo and wrestling produced identical fingerprints (docs/19 §13.6).
 *
 * Returns 1 for a standing preference, where the entry style is about initiative rather than
 * route and is spent in `resolveStrikeExchange` instead.
 */
function entryWeight(actor: Combatant, route: 'takedown' | 'clinch'): number {
  switch (actor.plan.tactics.entry) {
    case 'proactiveWrestling':
      return route === 'takedown' ? 1.5 : 0.75;
    case 'clinchEntries':
      return route === 'takedown' ? 0.6 : 1.85;
    case 'tripsAndThrows':
      return route === 'takedown' ? 0.5 : 1.95;
    case 'reactiveShot':
      // The shot underneath a strike. Its moment is in `reactiveShot` at the striking exchange;
      // as a standing intent it is deliberately unremarkable, because a fighter waiting for the
      // level change is not the one initiating it.
      return route === 'takedown' ? 0.9 : 0.7;
    default:
      return 1;
  }
}

/** Does this fighter's entry style make them a counter-fighter? Replaces the old approach check. */
function isCounterFighter(c: Combatant): boolean {
  return c.plan.tactics.entry === 'counter' || c.plan.tactics.entry === 'reactiveShot';
}

// --- Range --------------------------------------------------------------------------------

/**
 * The range beat: before anybody throws anything, does the gap change?
 *
 * A modifier on the exchange rather than an exchange of its own, because footwork that consumed
 * its own slice of the clock would push the striking out of a fight to pay for the movement
 * between it. The actor gets the say — they won initiative, and initiative is exactly "who is
 * dictating" — and both fighters get plenty of turns.
 *
 * **A failed attempt is not free**, which is the difference between a range contest and a range
 * coin-flip. Getting caught coming in is how the sport punishes a bad entry, and stepping off
 * badly is how it punishes a bad exit; without a cost, a fighter with the wrong plan and no feet
 * would simply retry every exchange until the dice obliged, and a poor range manager would be
 * indistinguishable from a good one on everything except the count of attempts.
 *
 * Returns the exposure the *other* man earns from a failure — a multiplier on their next burst.
 */
function resolveRangeBeat(ctx: ExchangeContext, actor: Combatant, target: Combatant): number {
  const { rng, state, emit } = ctx;

  const desired = desiredRangeOf(actor);
  const change = changeToward(state.range, desired);
  const stance = stanceOfActor(ctx, actor, 'distance');
  const urgency = rangeUrgency(actor, stance);

  // Already where he wants to be, or too far gone to care where that is.
  if (!change || urgency <= 0.02) return 1;

  actor.stats.rangeChangesAttempted++;

  const chance = rangeChangeChance({
    mover: actor,
    holder: target,
    change,
    stickiness: state.rangeSettled,
    /*
     * Urgency buys *commitment*, not frequency.
     *
     * A first cut gated the attempt itself on `rng.chance(urgency)`, so a fighter with a modest
     * plan simply did not manage distance three exchanges in four — and since every reset puts
     * the fight at kicking range, the whole population sat there. Footwork is continuous; what
     * varies between a committed outside fighter and a vaguely-interested one is how hard they
     * work at it, not whether they bother.
     */
    intent: 0.75 + urgency * 1.15,
    denial: groundDenial(target, change === 'close' ? 'close' : 'retreat'),
  });

  const rangeFamily = change === 'close' ? 'rangeClose' : 'rangeRetreat';
  if (rng.chance(chance)) {
    remember(actor, target, rangeFamily, true, nowOf(ctx));
    const next = stepRange(state.range, change);
    state.range = next;
    state.rangeSettled = 1;
    actor.stats.rangeChangesLanded++;
    emit('range', say.rangeChangeText(rng, actor, target, change, next), actor.corner);
    return 1;
  }

  /*
   * Caught doing it. A failed close walks you onto something; a failed exit hands them the
   * combination you were trying to leave. Both are the same shape — the other man gets a better
   * look at you — and both are why trying to fight at a range you cannot hold is expensive rather
   * than merely futile.
   */
  remember(actor, target, rangeFamily, false, nowOf(ctx));
  state.rangeSettled = clamp01(state.rangeSettled + 0.25);
  emit('range', say.rangeFailText(rng, actor, target, change), target.corner);
  // A counter is thrown at 0.55 of a full burst, so a caught entry takes it to most of one.
  // Coming forward costs more than backing out badly, because a man walking onto a shot brings
  // his own weight to it.
  return change === 'close' ? 1.45 : 1.3;
}

/**
 * What a fighter could do from his feet, and how much of the choice is his corner's.
 *
 * Extracted so the list can be inspected without running a fight. `intentAuthority` needs the
 * candidates, and a decision nobody can measure is one nobody can hold to a rule.
 */
export function distanceCandidates(
  actor: Combatant,
  target: Combatant,
  range: Range,
  stance: Stance,
): Candidate<'strike' | 'kick' | 'takedown' | 'clinchUp'>[] {
  return [
    {
      key: 'strike',
      capability: fatiguedEffect(actor.attrs.strikingOffence, 'strikingOffence', actor.fatigue),
      intent: standingBias(stance, 'strike', finishOpportunity(actor, target)) * familyLean(actor, 'punch'),
      opportunity: exploitFactor(actor, actor.attrs.strikingOffence, target.attrs.strikingDefence),
      /*
       * **No gate, because this is the list's residual** — see `Candidate.repertoire`. Throwing
       * hands is what a fighter does at range when he is not electing to do something else, so it
       * is the thing the elective actions are gated *against*. A boxer with `kicking: 30` throws
       * more punches; he does not stop fighting.
       */
    },
    {
      key: 'kick',
      capability:
        fatiguedEffect(actor.attrs.kicking, 'kicking', actor.fatigue) * legImpairment(actor),
      intent: standingBias(stance, 'kick') * familyLean(actor, 'kick'),
      opportunity: exploitFactor(actor, actor.attrs.kicking, target.attrs.strikingDefence),
      /*
       * The gate that makes a boxer a boxer. `kicking: 30` is doc 02's *genuine liability* band,
       * and before D16 the only thing standing between him and a head kick was that his hands were
       * better — a ratio, so a fighter merely bad at both threw them evenly.
       */
      repertoire: repertoire(actor.attrs.kicking),
    },
    {
      key: 'takedown',
      capability: fatiguedEffect(actor.derived.chainWrestling, 'wrestling', actor.fatigue),
      intent: standingBias(stance, 'takedown') * familyLean(actor, 'takedown'),
      /*
       * Read off the derived rating the capability reads, not off `wrestling` — the two say
       * different things and the derived one is the honest answer here. `chainWrestling` averages
       * in cardio and strength, so a boxer's reads 46 rather than 25 and the gate barely touches
       * his shots: a man who cannot wrestle can still fall on somebody, and the three suppressing
       * `opportunity` terms below already price how badly it goes.
       */
      repertoire: repertoire(actor.derived.chainWrestling),
      /*
       * `takedownRate` is how often they shoot, which is what the trait means. It was on the
       * takedown *contest* instead — better shots rather than more of them — and no trait in the
       * game set it, so the hook had a reader and no writer for as long as it existed (docs/19
       * §9a). `ENTRY_EASE` is the other half: you have to be close enough to shoot, and the engine
       * had no concept of that until range existed.
       */
      opportunity:
        traitMul(actor.fighter.traits, 'takedownRate') *
        entryWeight(actor, 'takedown') *
        ENTRY_EASE[range] *
        exploitFactor(actor, actor.attrs.wrestling, target.attrs.takedownDefence),
    },
    {
      key: 'clinchUp',
      capability: fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue),
      intent: standingBias(stance, 'clinchUp') * familyLean(actor, 'clinchEntry'),
      repertoire: repertoire(actor.derived.clinchOffence),
      opportunity:
        entryWeight(actor, 'clinch') *
        ENTRY_EASE[range] *
        exploitFactor(actor, actor.derived.clinchOffence, target.derived.clinchDefence),
    },
  ];
}

/**
 * Three ways out of a tie-up you did not ask to be in, and one of them is the door.
 *
 * Weighted toward leaving, because that is what the sport does: a fighter with his back to the
 * fence is mostly trying to get off it, and the short shots and the reversal are what he does when
 * leaving is not working. The first cut had these coefficients at 0.55 and 0.8 and the clinch ate
 * enough distance time to drag `kicking`'s win-rate swing from 8.2 points to 5.9.
 *
 * The two coefficients are *baselines* rather than anything a fighter has, which is what makes
 * them worth naming as `opportunity` — they say what the position offers, not what he brings.
 */

/**
 * What a fighter does in a tie-up he did not ask to be in, while he is still in it.
 *
 * `reverse` counts as in-state rather than as an exit, and the distinction is the point: taking
 * the tie-up off somebody changes who is in charge of the clinch, not whether the fight is in one.
 *
 * The two coefficients are baselines rather than anything a fighter has. The first cut had them at
 * 0.55 and 0.8 and the clinch ate enough distance time to drag `kicking`'s win-rate swing from 8.2
 * points to 5.9.
 */
export function heldWork(
  actor: Combatant,
  target: Combatant,
  stance: Stance,
  breaking: boolean,
): Candidate<'clinchStrike' | 'reverse' | 'pummel'>[] {
  return [
    {
      key: 'clinchStrike',
      capability: fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue) * 0.32,
      intent: clinchWorkBias(actor, stance, 'clinchStrike', finishOpportunity(actor, target)),
      opportunity: breaking ? 0.6 : 1,
      repertoire: repertoire(actor.derived.clinchOffence),
    },
    {
      key: 'reverse',
      capability: fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) * 0.45,
      intent: clinchWorkBias(actor, stance, 'reverse'),
      opportunity: breaking ? 1.2 : 1,
      repertoire: repertoire(actor.attrs.scrambling),
    },
    {
      key: 'pummel',
      capability: fatiguedEffect(actor.derived.clinchDefence, 'strength', actor.fatigue) * 0.45,
      intent: clinchWorkBias(actor, stance, 'pummel'),
      opportunity: breaking ? 1.3 : 1,
      // The residual of this list. Hand-fighting is what being in a tie-up consists of.
    },
  ];
}

/**
 * What the man doing the holding does with it.
 *
 * `BASE_CLINCH_STALL` is the one candidate here with no attribute behind it — holding somebody on
 * the fence and doing nothing is not a skill — and a bare constant competing against the 25–95
 * scale is exactly the kind of baseline doc 31 § F4 is about. Naming it as `capability` does not
 * fix that; it makes it visible, and `intentAuthority` makes it measurable.
 */
export function controllingCandidates(
  actor: Combatant,
  target: Combatant,
  stance: Stance,
): Candidate<'takedown' | 'clinchStrike' | 'maintainPosition' | 'clinchDisengage'>[] {
  return [
    {
      key: 'takedown',
      capability:
        fatiguedEffect(actor.derived.chainWrestling, 'wrestling', actor.fatigue) *
        traitMul(actor.fighter.traits, 'takedownRate') *
        1.2,
      intent: clinchWorkBias(actor, stance, 'clinchTakedown'),
      // Trips and throws are *this* takedown — the one that comes out of a tie-up — so the entry
      // style that had no route at range gets its route here.
      opportunity: actor.plan.tactics.entry === 'tripsAndThrows' ? 1.6 : 1,
      repertoire: repertoire(actor.derived.chainWrestling),
    },
    {
      key: 'clinchStrike',
      capability:
        fatiguedEffect(actor.attrs.strikingOffence, 'strikingOffence', actor.fatigue) * 0.8,
      intent: clinchWorkBias(actor, stance, 'clinchStrike', finishOpportunity(actor, target)),
      repertoire: repertoire(actor.attrs.strikingOffence),
    },
    {
      key: 'maintainPosition',
      capability:
        fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue) **
          MAINTAIN_CONVEXITY *
        MAINTAIN_CLINCH_SCALE,
      intent: clinchWorkBias(actor, stance, 'clinchMaintain'),
      // The residual of this list: he already has the grips, and keeping them is the default.
    },
    {
      /*
       * Letting go on purpose — D2's hole, one position over, and it went unnoticed for as long as
       * it did because the *held* fighter's exit is so prominent. The man with the grips could take
       * the fight to the floor, hit, or hold, and left the tie-up only when the referee, his
       * opponent or the bell released him. A striker who ties somebody up, or who inherits the
       * tie-up when a reversal fails, played clinch MMA whatever his corner wanted.
       *
       * In the flat list rather than a pre-beat, and keyed on `preferredState` rather than on
       * `clinchIntent` — the two halves of D2's rule. Breaking grips and stepping back *is* the
       * beat; and whether you want a tie-up at all is not a question the in-state field can answer.
       */
      key: 'clinchDisengage',
      capability:
        fatiguedEffect(actor.derived.clinchDefence, 'strength', actor.fatigue) **
          CLINCH_EXIT_CONVEXITY *
        CLINCH_EXIT_SCALE,
      intent: clinchExitBias(stance),
    },
  ];
}

/**
 * Three locally reasonable things to do off your back.
 *
 * The submission row is the sharpest instance of doc 31 § F4 in the engine: `submissions × 0.8` in
 * guard and the literal `0.05` everywhere else, which is roughly 900:1 against getting up before
 * the plan says anything, against a plan whose whole range is 6.7:1. A submission specialist told
 * to attack from underneath side control is arithmetically incapable of being obeyed, and
 * `submissionOpportunity` cannot rescue him because it feeds the intent and not the constant.
 *
 * It stays exactly as it was here. Writing it down where `intentAuthority` can see it is the
 * point of this pass; changing it is a behaviour change and belongs to its own.
 */
export function bottomExits(
  actor: Combatant,
  stance: Stance,
  groundPosition: GroundPosition,
): Candidate<'standUp' | 'sweep'>[] {
  return [
    {
      key: 'standUp',
      capability:
        fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) * legImpairment(actor),
      intent: bottomRouteBias(stance, 'standUp'),
      opportunity: 1 - GROUND_DOMINANCE[groundPosition] * 0.7,
    },
    {
      key: 'sweep',
      capability: fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) * 0.6,
      intent: bottomRouteBias(stance, 'sweep'),
    },
  ];
}

/**
 * What a fighter does off his back while he is still on it.
 *
 * `defend` is new and it is the smallest honest thing that makes the invariant hold. Before it,
 * the only in-state action underneath was `submission`, so a striker who wanted to stand had a
 * choice between attempting an escape and hunting a choke he cannot finish — and when the escape
 * failed, which is most of the time, he did *nothing at all*.
 *
 * It is deliberately not a new damage or damage-prevention system: framing, denying the pass and
 * hand-fighting all resolve here as pressure toward the referee's stand-up, which is a real escape
 * route the engine already models and the one a defensive guard actually earns. Giving the bottom
 * position a proper vocabulary — a `playGuard` that is not `attack`, a `recover` that is not a weak
 * `standUp` — is doc 31 § F3 and is not this change.
 *
 * `escaping` is the analogue of range's `punished`: a fighter who has just burned most of the beat
 * on a failed get-up is scrambling, not hunting, and what he has left goes into staying safe.
 */
export function bottomWork(
  actor: Combatant,
  stance: Stance,
  groundPosition: GroundPosition,
  subChance: number,
  escaping: boolean,
): Candidate<'submission' | 'defend'>[] {
  return [
    {
      key: 'submission',
      capability:
        groundPosition === 'guard'
          ? fatiguedEffect(actor.attrs.submissions, 'submissions', actor.fatigue) * 0.8
          : 0.05,
      intent: bottomWorkBias(actor, stance, 'submission', subChance),
      opportunity: escaping ? 0.5 : 1,
      /*
       * **The row D16 was reported against.** Before this the share here was `effect(submissions)`
       * against `effect(scrambling)` and nothing else — a ratio, so an Olympic boxer's `submissions:
       * 12` was read against his `scrambling: 48` and came out a modest 3.2:1 rather than a
       * categorical absence, and improving the skill his whole game plan is built on made him hunt
       * *more* chokes.
       */
      repertoire: repertoire(actor.attrs.submissions),
    },
    {
      key: 'defend',
      /*
       * Sized against the submission candidate it sits beside rather than pulled out of the air:
       * `scrambling` is what frames and hand-fights, and the 0.8 matches the coefficient the
       * submission row already carries so that neither is a bare constant relative to the other.
       */
      capability: fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) * 0.8,
      intent: bottomWorkBias(actor, stance, 'defend'),
      opportunity: escaping ? 1.5 : 1,
      /*
       * **The residual, and leaving it ungated is what makes the gate work at all.**
       *
       * Gating both rows was tried first and was worse than gating neither: a weighted draw
       * renormalises, so suppressing framing *inflated* the submission. A fighter with
       * `submissions: 50` and `scrambling: 30` went from 28% of his beats hunting a submission to
       * **75%** — the man least able to frame became the man most committed to attacking, which is
       * the relativity D16 exists to remove, reproduced with an extra term.
       */
    },
  ];
}

/**
 * What a fighter does having got on top, where `topIntent` governs rather than `preferredState`.
 *
 * The dominance terms are `opportunity` in the strict sense: the same fighter with the same plan
 * has different things available in guard and on somebody's back. `BASE_GROUND_STALL` is the
 * other bare constant, and the same caveat applies as in the clinch.
 */
export function topCandidates(
  actor: Combatant,
  target: Combatant,
  stance: Stance,
  dominance: number,
  subChance: number,
): Candidate<
  'advancePosition' | 'groundStrike' | 'submission' | 'maintainPosition' | 'standUpFromTop'
>[] {
  return [
    {
      key: 'advancePosition',
      capability:
        fatiguedEffect(actor.attrs.groundControl, 'groundControl', actor.fatigue) * (1 - dominance),
      intent: topBias(actor, stance, 'advancePosition'),
      repertoire: repertoire(actor.attrs.groundControl),
    },
    {
      key: 'groundStrike',
      capability:
        fatiguedEffect(actor.derived.groundAndPound, 'groundControl', actor.fatigue) *
        (0.4 + dominance),
      intent: topBias(actor, stance, 'groundStrike', finishOpportunity(actor, target)),
      repertoire: repertoire(actor.derived.groundAndPound),
    },
    {
      key: 'submission',
      capability:
        fatiguedEffect(actor.attrs.submissions, 'submissions', actor.fatigue) * (0.3 + dominance),
      intent: topBias(actor, stance, 'submission', subChance),
      repertoire: repertoire(actor.attrs.submissions),
    },
    {
      /*
       * Getting off the floor on purpose — the one thing a fighter on top could not previously
       * elect to do, so a striker who landed or inherited a takedown was made to play top-position
       * MMA for the rest of the round whatever his corner wanted (doc 31 § D2).
       *
       * It sits in the flat list rather than in a pre-beat, because standing back out of somebody's
       * guard *is* the moment: you cannot post, break the grips, step back and also throw
       * ground-and-pound in the same beat. That is invariant 8c, and it is the same reasoning that
       * keeps `takedown` competing with `strike` at range.
       *
       * `scrambling` is the capability, the same one that governs getting up from underneath —
       * disentangling is disentangling, whichever end of it you are on.
       */
      key: 'standUpFromTop',
      capability:
        fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) ** TOP_EXIT_CONVEXITY *
        TOP_EXIT_SCALE,
      intent: topExitBias(stance),
      /*
       * **No `repertoire` here, and the omission is the rule rather than an oversight.** The gate
       * asks *is this technique in his game*, and it is applied to what a fighter **does** and
       * never to how he **leaves** - `clinchDisengage` and both `bottomExits` are the same.
       *
       * Two reasons, and the second is the one that would have bitten. Doc 31's own division says
       * exits belong to `preferredState` and are about wanting out rather than about a technique,
       * which is why `exitUrgency` takes no capability at all. And gating the door would charge a
       * fighter for his hole twice - once when the position is imposed on him and again when he
       * tries to leave it - so the man least able to survive on the floor would be the man least
       * able to get off it. That is not a repertoire model, it is a trap.
       */
      /*
       * How much of the position the other man still has hold of. Standing out of a closed guard
       * means breaking grips off your own hips; standing off side control or mount means standing
       * up. `GROUND_DOMINANCE` runs 0.3 in guard to 1.0 on the back, so this runs about 0.5 to 1.2.
       */
      opportunity: 0.35 + dominance * 0.85,
    },
    {
      key: 'maintainPosition',
      capability:
        fatiguedEffect(actor.attrs.groundControl, 'groundControl', actor.fatigue) **
          MAINTAIN_CONVEXITY *
        MAINTAIN_TOP_SCALE,
      intent: topBias(actor, stance, 'maintainPosition'),
      /*
       * Riding mount is easier than riding guard, and this is `opportunity` in the strict sense:
       * the same fighter with the same instruction has a different amount of the position
       * available to him depending where he is.
       */
      opportunity: 0.7 + dominance * 0.6,
      // The residual of this list: he is already on top, and staying there is the default.
    },
  ];
}

// --- Distance -----------------------------------------------------------------------------

function resolveDistance(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
): ExchangeOutcome {
  const { rng, state, emit } = ctx;

  // Footwork first: where this exchange happens is decided before what happens in it.
  const punished = resolveRangeBeat(ctx, actor, target);
  const range = state.range;

  /*
   * Three things decide what a fighter reaches for at range, and the order matters.
   *
   * The plan says what fight they came for. Their attributes say what they can actually do. And
   * `exploitFactor` says what the man in front of them cannot deal with — in-cage adaptation,
   * gated on Fight IQ, which is deliberately weaker than either.
   *
   * `standingBias` replaced a table called `approachWeight` whose largest row-to-row ratio was
   * about 3, applied to one of seven mutually-exclusive labels. Measured, that was not enough
   * force to change a fight: a striker's time at distance moved between 133 and 143 seconds of
   * 900 across all seven. The policy layer is exponential in urgency for exactly that reason,
   * and it is bounded by everything downstream of it — a plan can make a fighter shoot every
   * exchange and still not put anybody on the floor.
   */
  const stance = stanceOfActor(ctx, actor, 'distance');

  const intent = chooseAction(rng, distanceCandidates(actor, target, range, stance));

  switch (intent) {
    case 'strike':
    case 'kick':
      return resolveStrikeExchange(ctx, actor, target, intent === 'kick', punished);
    case 'takedown':
      return resolveTakedown(ctx, actor, target, 'distance');
    case 'clinchUp': {
      const bonus = prepBonus(target, actor, ['fenceClinch']) + inFightRead(target, 'clinchEntry');
      const attack = fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue);
      const defend =
        fatiguedEffect(target.derived.clinchDefence, 'strength', target.fatigue) * (1 + bonus);
      const tiedUp = rng.chance(attack / (attack + defend));
      remember(actor, target, 'clinchEntry', tiedUp, nowOf(ctx));
      if (tiedUp) {
        state.position = 'clinch';
        state.clinchControl = actor.corner;
        state.placedBy = actor.corner;
        state.stalledSeconds = 0;
        emit('clinch', say.clinchText(rng, actor), actor.corner);
        return { seconds: rng.int(8, 16) };
      }
      emit('clinchBreak', say.clinchBreakText(rng, target), target.corner);
      return { seconds: rng.int(5, 10) };
    }
  }
}

/**
 * How much a fighter leans into a phase where their opponent is weak.
 *
 * Fighters are not blind to a hole. A wrestler across from a 42-rated takedown defence is
 * going to shoot, plan or no plan — and without this, the simulator produces the absurd
 * result of an elite striker with no takedown defence being *out-struck to a 99% loss rate*
 * by a well-rounded wrestler who never once thought to shoot.
 *
 * Fight IQ gates it: a smart fighter finds the hole in round one, a dull one never does.
 * Note this is in-cage adaptation and is deliberately weaker than a prepared game plan —
 * noticing something mid-fight is worth less than having drilled the answer for eight weeks.
 */
function exploitFactor(actor: Combatant, ownAttack: number, opponentDefence: number): number {
  const awareness = clamp((actor.attrs.fightIq - 25) / 65, 0.15, 1);
  const gap = (ownAttack - opponentDefence) / 30;
  return clamp(1 + awareness * clamp(gap, -0.6, 1.2), 0.5, 2.1);
}


/**
 * How much this fighter reaches for their feet rather than their hands, 0–1.
 *
 * Fatigued and leg-impaired, because both are reasons somebody stops kicking. A 50/50 striker
 * sits at 0.5 and a pure kicker near 0.8; chewed-up legs drag it toward the hands, which is the
 * other half of what a calf-kick game plan buys.
 */
/**
 * What this shot is thrown with, chosen *together* with where it is going.
 *
 * The scope fix. `isKick` was chosen once per exchange while `pickTarget` ran per shot and the
 * two never spoke, so a punching exchange that rolled `legs` applied leg damage through
 * `strikingOffence` and was then narrated as a calf kick — roughly two thirds of all leg damage
 * in the game was dealt by a boxing stat (doc 18 §4.1).
 *
 * Nobody punches a leg, so a shot to the legs is a kick and the attribute that lands it is
 * `kicking`. Above the waist the exchange's lean decides, with the odd shot from the other
 * toolbox, because a burst is a combination rather than four copies of one strike — you throw a
 * hand to set up the kick.
 */
function pickShot(
  rng: Rng,
  actor: Combatant,
  prefersKick: boolean,
  range: Range,
): { target: StrikeTarget; weapon: Weapon } {
  /*
   * Where they are decides what is available, before what they want decides what they reach for.
   *
   * `targetMix` is the corner's instruction bent by the fighter's habits; `strikeSuitability` is
   * the geometry, and it goes on top of both. A head kick from somebody's chest and a low kick
   * from the same place are not the same proposition, and until range existed the engine had no
   * way to say so — which is most of why a kickboxer and a karateka produced the same fight.
   */
  const mix = targetMix(actor);
  // `targetFitness` is shape-only — mean 1 across the three targets at every range — so a range
  // decides where a fighter aims without deciding how much danger the fight carries.
  const target = rng.pickWeighted(STRIKE_TARGETS, (k) => mix[k] * targetFitness(k, range));
  const lean = kickLean(actor);

  /*
   * Nobody punches a leg, so a shot to the legs is a kick and the attribute that lands it is
   * `kicking`. Unconditional since phase 2: `pickTarget` now carries `kickLean` itself, so a
   * fighter who cannot kick rarely aims low in the first place, and the redirect that used to
   * live here — aim low, then throw a hand upstairs instead — was the same question asked twice.
   */
  if (target === 'legs') return { target, weapon: 'kick' };

  // Above the waist the exchange's lean decides, nudged by what this fighter actually owns, with
  // the odd shot from the other toolbox — a burst is a combination, not four copies of one strike.
  // Then the range arbitrates between the two, which is what stops head kicks landing in a phone
  // booth and hands reaching from two metres.
  const base = prefersKick ? 0.55 + lean * 0.4 : lean * 0.3;
  const kickFit = strikeSuitability('kick', target, range);
  const punchFit = strikeSuitability('punch', target, range);
  const kickChance = clamp01((base * kickFit) / Math.max(1e-6, base * kickFit + (1 - base) * punchFit));
  return { target, weapon: rng.chance(kickChance) ? 'kick' : 'punch' };
}

/**
 * A striking exchange: the actor throws, and the fighter in front of them throws back.
 *
 * Two-way exchanges matter for more than realism. Volume is load-bearing in this engine —
 * judges score on *share of total*, so when a round contains only a handful of landed
 * strikes those shares swing wildly, 10-8 rounds become routine and cards start tying. And
 * a low total landed count forces each individual strike to carry an unrealistic share of
 * the knockout hazard, which turns any accuracy edge into a near-certain knockout. Real
 * three-round fights land 50–100 significant strikes between them.
 */
/**
 * The two survival routes that change the position rather than the exchange: grab hold, or shoot.
 * Returns the outcome when the route resolved the beat, otherwise nothing.
 */
function trySurvive(
  ctx: ExchangeContext,
  attacker: Combatant,
  hurt: Combatant,
  route: ReturnType<typeof survivalRoute>,
): ExchangeOutcome | undefined {
  const { rng, state, emit } = ctx;
  if (route === 'tieUp') {
    const grab = fatiguedEffect(hurt.derived.clinchOffence, 'strength', hurt.fatigue) * 0.8;
    const deny = fatiguedEffect(attacker.derived.clinchDefence, 'strength', attacker.fatigue);
    if (rng.chance(grab / (grab + deny))) {
      state.position = 'clinch';
      state.clinchControl = hurt.corner;
      state.placedBy = hurt.corner;
      state.stalledSeconds = 0;
      emit('clinch', `${hurt.fighter.lastName} grabs hold to survive — smothering the follow-up.`, hurt.corner);
      return { seconds: rng.int(6, 12) };
    }
    return undefined;
  }
  if (route === 'shoot') return resolveTakedown(ctx, hurt, attacker, 'distance');
  return undefined;
}

function resolveStrikeExchange(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  prefersKick: boolean,
  /** What the target earned from the actor's failed range change, as a scale on their counter. */
  punished = 1,
): ExchangeOutcome {
  const { rng } = ctx;
  const seconds = rng.int(6, 14);

  /*
   * A hurt man being come at does something about it, and what he does is who he is (doc 36 phase 3,
   * `survivalRoute`). Before this he did nothing at all: no counter, no clinch, no shot — he stood
   * there at 0.45 of his defence and waited for the referee.
   */
  let route: ReturnType<typeof survivalRoute> | undefined;
  if (target.hurtSeconds > 0 && ctx.state.position === 'distance') {
    route = survivalRoute(rng, target);
    const survived = trySurvive(ctx, actor, target, route);
    if (survived) return survived;
  }

  const lead = throwBurst(ctx, actor, target, prefersKick, route === 'run' ? 0.5 : 1, route === 'shell' ? 1.35 : 1);
  if (lead.ending) return { seconds, ending: lead.ending };
  // Covering up is how fights get stopped: nothing is coming back, and the referee is counting.
  if (route === 'shell' && lead.landedAny) ctx.state.unanswered[target.corner]++;
  if (route === 'fireBack' && ctx.state.position === 'distance') {
    const swing = throwBurst(ctx, target, actor, rng.chance(kickLean(target)), 0.75);
    if (swing.ending) return { seconds, ending: swing.ending };
  }

  // The counter. Smaller than the lead burst — you are reacting, not initiating — unless
  // countering is the whole plan, which is what makes the `counter` approach worth picking.
  if (ctx.state.position === 'distance' && target.hurtSeconds <= 0) {
    // The other half of `riskLevel`: how open the *leading* fighter left themselves. A
    // fighter sitting down on their shots is stationary at the exact moment the counter
    // comes back, which is where fights turn.
    /*
     * Range enters the fight on the counter rather than as a global multiplier on damage, which
     * is what keeps the pocket dangerous *because of what happens in it* instead of by decree.
     * `RANGE_COUNTER` is shape-only, so trading in the pocket does not raise the counter rate of
     * the sport as a whole — it moves it out of the outside range and into the phone booth.
     *
     * `punished` arrives from the same beat's failed range change. A fighter who lunged in and
     * did not get there is mid-stride with their feet crossed, and this is the moment that costs
     * them: not a penalty applied to them, but a free look handed to the man in front.
     */
    const counterScale =
      (isCounterFighter(target) ? 0.9 : 0.55) *
      riskProfile(actor.plan.riskLevel).exposure *
      RANGE_COUNTER[ctx.state.range] *
      punished;
    /*
     * The counter is thrown with the counter-fighter's own weapons.
     *
     * This argument was the literal constant `false` — `isKick` — so **every counter in the game
     * was a punch, resolved on `strikingOffence`** (doc 19 §0 F1). That closed the strongest
     * piece of style expression in the engine, the `counter` approach's 0.90 counter-scale, to
     * every kicker in the game. And `origin.ts` gives the karate discipline the lowest
     * `strikingOffence` of the three striking arts on purpose, so the origin built to
     * counter-strike was the one the counter mechanic could not serve: two systems that shipped
     * days apart, each defeating the other.
     *
     * Once a weapon is per-shot the fix is free — a counter picks weapons like any other burst.
     */
    const counter = throwBurst(ctx, target, actor, rng.chance(kickLean(target)), counterScale);
    if (counter.ending) return { seconds, ending: counter.ending };
  }

  return { seconds };
}

interface BurstOutcome {
  landedAny: boolean;
  ending?: Ending;
}

/**
 * The sport's striking volume, as a level.
 *
 * Doc 36 phase 2 moved the fade out of volume and into quality (`workRate`, the fatigue rates), which
 * left rounds two and three throwing far more than they did — an even pair went from 86 strikes
 * attempted across three rounds to 113, and every finish rate in the roster profile went with it.
 * Volume is load-bearing for calibration (see `shouldRefereeStop`), so the *total* is put back here
 * and only the *shape* across rounds changes: the same fight, spread evenly instead of front-loaded.
 */
const VOLUME_LEVEL = 0.8;

function throwBurst(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  prefersKick: boolean,
  scale: number,
  /** A defender covering up is harder to hit cleanly. */
  defenceScale = 1,
): BurstOutcome {
  const { rng, state, tally, emit, referee } = ctx;

  // How much they let go. The fourth leg of the `riskLevel` trade, and the one that makes
  // staying safe cost something: a fighter hitting and moving throws less and loses rounds.
  const base = Math.max(
    1,
    Math.round(
      rng.int(2, actor.fighter.traits.includes('volumeMachine') ? 7 : 5) *
        riskProfile(actor.plan.riskLevel).output,
    ),
  );
  // Stochastic rather than nearest rounding: bursts are small integers, and rounding 1.4 down every
  // time throws away exactly the proportional differences `riskLevel` and fatigue exist to make.
  const burst = Math.max(
    1,
    stochasticRound(
      rng,
      base *
        scale *
        VOLUME_LEVEL *
        workRate(actor, false) *
        paceMultiplier(actor, ctx.round, ctx.totalRounds),
    ),
  );
  let landedAny = false;

  /*
   * What he throws is a pattern, not a list of independent shots (doc 36 phase 2, `combos.ts`).
   * Slots past the end of the pattern are free shots, chosen exactly as they always were, so a
   * long burst from a volume puncher is a combination and then whatever he has left.
   */
  const pattern = choosePattern(
    rng,
    actor.style,
    prefersKick,
    ctx.state.range,
    actor.plan.targeting,
    kickLean(actor),
  );
  const techniques = PATTERNS[pattern];
  const drilled = actor.style.combos[pattern];
  const familiar = patternFamiliarity(target, pattern);
  let slot = 0;
  let prev: StrikeTarget | 'feint' | undefined;
  let run = 0;
  let bestRun = 0;
  let thrownInPattern = 0;

  for (let i = 0; i < burst; i++) {
    let technique: Technique | undefined = slot < techniques.length ? techniques[slot] : undefined;
    const inPattern = slot < techniques.length;
    slot++;
    if (technique === 'feint') {
      // A feint costs a beat and throws nothing; what it buys is the next shot.
      prev = 'feint';
      technique = slot < techniques.length ? techniques[slot] : undefined;
      slot++;
    }

    let strikeTarget: StrikeTarget;
    let weapon: Weapon;
    const shape = technique ? TECHNIQUE_SHAPE[technique as Exclude<Technique, 'feint'>] : undefined;
    // A drilled technique the range will not allow is not thrown; he improvises instead.
    if (shape && strikeSuitability(shape.weapon, shape.target, ctx.state.range) >= 0.45) {
      strikeTarget = shape.target;
      weapon = shape.weapon;
    } else {
      technique = undefined;
      ({ target: strikeTarget, weapon } = pickShot(rng, actor, prefersKick, ctx.state.range));
    }
    const isKick = weapon === 'kick';
    const reads: ReadKey[] = isKick
      ? strikeTarget === 'legs'
        ? ['calfKick']
        : strikeTarget === 'head'
          ? ['headKick']
          : ['bodyWork']
      : strikeTarget === 'body'
        ? ['bodyWork', 'highVolume']
        : ['leadHook', 'counterRight', 'highVolume'];

    const bonus = prepBonus(target, actor, reads) + inFightRead(target, isKick ? 'kick' : 'punch');

    // The setup: a shot thrown into a reacting defence. The lead of a multi-shot pattern pays for it.
    const setup =
      inPattern && prev !== undefined
        ? setupMultiplier({
            prev,
            next: strikeTarget,
            drilled,
            actorIq: actor.attrs.fightIq,
            defenderIq: target.attrs.fightIq,
            familiar,
          })
        : inPattern && techniques.length > 1
          ? LEAD_DISCOUNT
          : 1;

    const offence =
      fatiguedEffect(
        isKick ? actor.attrs.kicking : actor.attrs.strikingOffence,
        isKick ? 'kicking' : 'strikingOffence',
        actor.fatigue,
      ) *
      (isKick ? legImpairment(actor) : 1) *
      momentumMultiplier(actor) *
      stanceEdge(actor, target) *
      setup *
      traitMul(actor.fighter.traits, 'strikeAccuracy');

    const defence =
      fatiguedEffect(target.attrs.strikingDefence, 'strikingDefence', target.fatigue) *
      (1 + bonus) *
      (target.hurtSeconds > 0 ? hurtDefence(target) : 1) *
      defenceScale *
      legImpairment(target);

    actor.stats.significantStrikesAttempted++;
    tally[actor.corner].strikesAttempted++;
    ctx.beat.offset += shotSeconds(rng);
    chargeStrike(actor, weapon);

    const connects = rng.chance(offence / (offence + defence));
    remember(actor, target, isKick ? 'kick' : 'punch', connects, nowOf(ctx), strikeTarget, weapon);
    const wasFeint = prev === 'feint';
    // Thrown into the guard, landed or not: either way he made the other man react.
    prev = strikeTarget;
    if (inPattern) thrownInPattern++;
    if (!connects) {
      run = 0;
      if (weapon === 'kick' && strikeTarget === 'legs' && checkedKick(storyOf(ctx), actor, target)) {
        emit('note', `${target.fighter.lastName} checks the kick — that one hurt the kicker.`, target.corner);
      }
      // A missed kick is now narrated as a missed kick. `strikeMissed` never received `isKick`,
      // so every miss in the game read as a missed punch.
      if (i === 0) {
        emit(
          'strike',
          say.strikeMissed(rng, actor, strikeTarget, weapon, technique),
          actor.corner,
          undefined,
          { weapon, target: strikeTarget },
        );
      }
      continue;
    }
    if (inPattern) {
      run++;
      if (run > bestRun) bestRun = run;
    }

    landedAny = true;
    actor.stats.significantStrikesLanded++;
    tally[actor.corner].significantStrikes++;

    const result = applyStrike(rng, actor, target, strikeTarget, weapon, state.range);
    tally[actor.corner].damageDealt += result.damage;

    // Cuts end fights via the doctor, not the referee. Which weapon opened it is decided in
    // `applyStrike` now, because an elbow and a jab are not the same risk.
    if (result.cut) state.cuts[target.corner] += rng.range(8, 22);

    emit(
      isKick ? 'kick' : 'strike',
      say.strikeLanded(rng, actor, strikeTarget, weapon, result.flushness, technique, wasFeint),
      actor.corner,
      result.flushness >= 2 ? 'major' : undefined,
      { weapon, target: strikeTarget },
    );

    if (result.knockdown) {
      tally[actor.corner].knockdowns++;
      state.unanswered[target.corner] = 0;
      shiftMomentum(actor, target, 0.55);
      emit('knockdown', say.knockdownText(rng, actor, target), actor.corner, 'critical');

      const ko = resolveKnockdown(ctx, actor, target, result.flushness);
      if (ko) return { landedAny: true, ending: ko };
      break;
    }

    const story = afterStrike(ctx, actor, target, strikeTarget, weapon, result);
    if (story) return { landedAny: true, ending: story };

    if (result.hurt) {
      shiftMomentum(actor, target, 0.35);
      emit('hurt', say.hurtText(rng, target), target.corner, 'major');
    }

    if (target.hurtSeconds > 0) {
      state.unanswered[target.corner]++;
      if (shouldRefereeStop(target, referee.stoppageTrigger, state.unanswered[target.corner])) {
        return { landedAny: true, ending: { method: 'tko', winner: actor.corner } };
      }
    }
  }

  if (bestRun >= 2 && thrownInPattern >= 2) {
    emit('combination', say.combinationText(rng, actor, PATTERN_NAMES[pattern], bestRun), actor.corner);
  }
  notePattern(actor, target, pattern);

  if (landedAny) {
    shiftMomentum(actor, target, 0.12);
    state.unanswered[actor.corner] = 0;
  } else {
    shiftMomentum(target, actor, 0.05);
  }

  return { landedAny };
}

/**
 * What happens after a knockdown.
 *
 * A knockdown is not a finish; **pursuit** is. A fighter with elite power and poor finishing
 * instinct lets people off the hook, which is a real and recognisable archetype.
 */
function resolveKnockdown(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  flushness: number,
): Ending | undefined {
  const { rng, state, referee, emit } = ctx;

  // A genuinely flush shot from a genuine puncher ends it on impact, no follow-up needed.
  // This branch is where "he knocks out almost everyone he catches clean once" lives: at
  // Power 99 the power edge is roughly 4.8, which saturates this roll outright.
  const powerEdge =
    fatiguedEffect(actor.attrs.power, 'power', actor.fatigue) /
    fatiguedEffect(target.attrs.durability, 'durability', target.fatigue);
  if (flushness >= 1.7 && rng.chance(clamp01(0.16 * powerEdge * (flushness - 1.2)))) {
    return { method: 'ko', winner: actor.corner };
  }

  const instinct =
    fatiguedEffect(actor.derived.finishingInstinct, 'fightIq', actor.fatigue) *
    traitMul(actor.fighter.traits, 'finishingUrge');
  const survival =
    fatiguedEffect(effectiveComposure(target), 'composure', target.fatigue) *
    fatiguedEffect(target.fighter.naturals.recovery, 'cardio', target.fatigue) ** 0.5;

  // Follow-up flurry: each landed shot on a hurt fighter pushes the referee closer.
  //
  // These shots must reach the scorecards. They are the most decisive sequence in a fight,
  // and if they only touch `stats` and not `tally` the judges score the round as though the
  // knockdown flurry never happened — which also puts 10-7 (two tallied knockdowns) out of
  // reach even in a total mismatch.
  const attempts = rng.int(3, 8);
  for (let i = 0; i < attempts; i++) {
    if (target.hurtSeconds <= 0) break;
    ctx.tally[actor.corner].strikesAttempted++;
    actor.stats.significantStrikesAttempted++;
    if (!rng.chance(clamp01(instinct / (instinct + survival)))) continue;

    // Hands. A pursuit flurry on a hurt fighter is a fighter swinging, not picking head kicks.
    const result = applyStrike(rng, actor, target, 'head', 'punch');
    actor.stats.significantStrikesLanded++;
    ctx.tally[actor.corner].significantStrikes++;
    ctx.tally[actor.corner].damageDealt += result.damage;
    state.unanswered[target.corner]++;

    if (result.knockdown) {
      ctx.tally[actor.corner].knockdowns++;
      emit('knockdown', say.knockdownText(rng, actor, target), actor.corner, 'critical');
      if (rng.chance(0.4)) return { method: 'ko', winner: actor.corner };
    }

    if (shouldRefereeStop(target, referee.stoppageTrigger, state.unanswered[target.corner])) {
      return { method: 'tko', winner: actor.corner };
    }
  }

  if (target.hurtSeconds > 0 && rng.chance(0.3)) {
    emit('recovered', say.recoveredText(target), target.corner);
  }
  return undefined;
}

/**
 * How much of his defence a hurt fighter keeps. Was a flat 0.45 for everybody; composure is
 * exactly the attribute for this — "performing hurt" is its blurb — and it now decides it, around
 * the old value for an average fighter.
 */
function hurtDefence(c: Combatant): number {
  return remap(effectiveComposure(c), 30, 95, 0.36, 0.58);
}

function storyOf(ctx: ExchangeContext): StoryContext {
  return { round: ctx.round, rng: ctx.rng, emit: ctx.emit };
}

/** What a landed strike does beyond its damage. See `stories.ts`. */
function afterStrike(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  strikeTarget: StrikeTarget,
  weapon: Weapon,
  result: StrikeOutcome,
): Ending | undefined {
  const method = afterStrikeStory(storyOf(ctx), actor, target, strikeTarget, weapon, result);
  return method ? { method, winner: actor.corner } : undefined;
}

function shiftMomentum(gainer: Combatant, loser: Combatant, amount: number): void {
  gainer.momentum = clamp(gainer.momentum + amount, -1, 1);
  loser.momentum = clamp(loser.momentum - amount, -1, 1);
}

// --- Takedowns ----------------------------------------------------------------------------

/**
 * Where a takedown puts you, which depends on how you got there.
 *
 * Phase 2c made the entry a resolved fact and deliberately left it descriptive: *"giving a trip a
 * different landing position than a double leg is a real idea and a distribution move, which makes
 * it somebody else's phase"*. This is that phase (docs/19 §13.6b), and it is the judo identity the
 * fingerprint could not see — `wrestling` against `judo` measured 0.077 at its widest, the closest
 * pair in the game, because both arts arrived on the floor in exactly the same place.
 *
 * A throw lands you past the legs; a shot lands you in front of them. That is the whole of it, and
 * it is why a judoka's takedown is worth more than a wrestler's while a wrestler gets more of them.
 * `groundControl` still helps everybody, because knowing what to do on landing is its own skill.
 */
function landingPosition(rng: Rng, actor: Combatant, entry: TakedownEntry): GroundPosition {
  const skilled = actor.attrs.groundControl > 80 && rng.chance(0.35);
  switch (entry) {
    case 'trip':
      // Over the hip and past the guard. The best landing in the game, and the rarest.
      if (rng.chance(0.3)) return 'sideControl';
      return rng.chance(0.45) || skilled ? 'halfGuard' : 'guard';
    case 'bodyLock':
      // Chest to chest on the way down: you land heavy, but in front of the hips.
      return rng.chance(0.35) || skilled ? 'halfGuard' : 'guard';
    case 'singleLeg':
      // You have one leg, so they keep the other between you.
      return skilled && rng.chance(0.5) ? 'halfGuard' : 'guard';
    default:
      return skilled ? 'halfGuard' : 'guard';
  }
}

/**
 * How this fighter is trying to put them down, chosen before the contest is resolved.
 *
 * Where the shot starts decides what is available — you cannot double-leg somebody you are already
 * chest to chest with, and you cannot trip somebody you have no grip on — and inside that, the
 * fighter's own tendencies decide. A wrestler doubles, a judoka trips, a strong man body-locks, and
 * a smart one takes the shot the exchange gave him.
 *
 * `reactiveShot` reads `fightIq` and the `counter` approach rather than a tendency, because it is
 * the one entry that is a property of *timing* rather than of technique, and there is no read for
 * it — deliberately, since adding a read key before its resolution site exists nerfs the prep
 * system's coverage (docs/19 §5).
 */
function pickTakedownEntry(
  rng: Rng,
  actor: Combatant,
  from: 'distance' | 'clinch',
): TakedownEntry {
  const t = actor.tendencies;
  const a = actor.attrs;

  if (from === 'clinch') {
    /*
     * The plan finally reaches the entry it names.
     *
     * `tripsAndThrows` and `clinchEntries` were separated by nothing but two decimal places in
     * `entryWeight` — 0.5/1.95 against 0.6/1.85 — so a corner that said *throw them* and one that
     * said *walk them onto the fence and take them down* produced the same fight, and jiu-jitsu
     * against judo sat at 0.046 on the styles fingerprint, under the floor every pair is held to.
     *
     * The distinction is real and the engine could already express it: `landingPosition` puts a
     * trip in side control and a shot in guard. What was missing was the plan being allowed to
     * say which one it wants, so a judoka's throws now actually land him past the hips.
     */
    const wantsThrows = actor.plan.tactics.entry === 'tripsAndThrows';
    return rng.pickWeighted(['bodyLock', 'trip', 'singleLeg'] as const, (entry) =>
      entry === 'bodyLock'
        ? t.bodyLock * clamp01(remap(a.strength, 40, 90, 0.5, 1.2)) * (wantsThrows ? 0.6 : 1)
        : entry === 'trip'
          ? // A throw is a grip and a hip, not a level change. This read `doubleLeg` — which is
            // `p(wrestling) × f(strength)` — so the one entry that is supposed to be judo's was
            // gated on the *shot* attributes, and a judoka tripped less often than a wrestler did.
            clamp01(remap(a.scrambling, 40, 90, 0.2, 1.15)) *
            clamp01(remap(a.submissions, 40, 90, 0.35, 1.35)) *
            (wantsThrows ? 3.2 : 1)
          : t.singleLeg * 0.5 * (wantsThrows ? 0.4 : 1),
    );
  }

  return rng.pickWeighted(['doubleLeg', 'singleLeg', 'reactiveShot'] as const, (entry) =>
    entry === 'doubleLeg'
      ? t.doubleLeg
      : entry === 'singleLeg'
        ? t.singleLeg
        : clamp01(remap(a.fightIq, 40, 90, 0.15, 0.7)) *
          (isCounterFighter(actor) ? 1.8 : 0.7),
  );
}

function resolveTakedown(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  from: 'distance' | 'clinch',
  /** The entry this link of a chain is forced to, when it is one. */
  chained?: TakedownEntry,
): ExchangeOutcome {
  const { rng, state, tally, emit } = ctx;
  const depth = actor.mem.chainDepth;

  const reads: ReadKey[] = from === 'clinch' ? ['bodyLock', 'fenceClinch'] : ['singleLeg', 'doubleLeg'];
  const bonus = prepBonus(target, actor, reads) + inFightRead(target, 'takedown');

  const offence =
    fatiguedEffect(actor.derived.chainWrestling, 'wrestling', actor.fatigue) *
    momentumMultiplier(actor) *
    (from === 'clinch' ? 1.25 : 1) *
    chainEdge(actor, depth);

  const defence =
    fatiguedEffect(target.attrs.takedownDefence, 'takedownDefence', target.fatigue) *
    (1 + bonus) *
    // Chewed-up legs are a chewed-up base. This is the payoff for a calf-kick game plan.
    legImpairment(target) *
    (target.hurtSeconds > 0 ? 0.5 : 1);

  actor.stats.takedownsAttempted++;
  const entry = chained ?? pickTakedownEntry(rng, actor, from);

  const lands = rng.chance(offence / (offence + defence));
  remember(actor, target, 'takedown', lands, nowOf(ctx));
  if (lands) {
    actor.stats.takedownsLanded++;
    tally[actor.corner].takedowns++;
    state.position = 'ground';
    state.groundTop = actor.corner;
    state.placedBy = actor.corner;
    state.groundPosition = landingPosition(rng, actor, entry);
    state.stalledSeconds = 0;
    shiftMomentum(actor, target, 0.25);
    actor.mem.chainDepth = 0;
    emit(
      'takedown',
      say.takedownText(rng, actor, state.groundPosition, entry),
      actor.corner,
      'major',
      { takedown: entry },
    );
    return { seconds: rng.int(6, 12) };
  }

  shiftMomentum(target, actor, 0.15);
  emit(
    'takedownStuffed',
    say.takedownStuffedText(rng, actor, target, entry),
    target.corner,
    undefined,
    { takedown: entry },
  );
  // Every sprawl costs the man sprawling. Chain wrestling is how a wrestler spends your tank.
  target.fatigue = clamp01(target.fatigue + 0.008);

  /*
   * The chain (doc 36 phase 5, `wrestling.ts`). The stuffed shot is the setup for the next one:
   * the single becomes a double, the double a body lock, and the defender's weight is already
   * committed to the first.
   */
  if (depth < MAX_CHAIN && rng.chance(chainChance(actor, depth))) {
    actor.mem.chainDepth = depth + 1;
    const next = chainedEntry(rng, entry);
    emit('note', say.chainText(rng, actor, next), actor.corner);
    const link = resolveTakedown(ctx, actor, target, from === 'clinch' || next === 'bodyLock' || next === 'trip' ? 'clinch' : 'distance', next);
    actor.mem.chainDepth = 0;
    return { seconds: Math.min(20, link.seconds + rng.int(2, 5)), ending: link.ending };
  }
  actor.mem.chainDepth = 0;

  // The other side of the sprawl: he came up holding a head.
  if (from === 'distance' && rng.chance(frontHeadlockChance(target))) {
    return resolveFrontHeadlock(ctx, target, actor);
  }

  // A stuffed shot from the clinch usually ends up back at distance.
  if (from === 'clinch' && rng.chance(0.5)) {
    state.position = 'distance';
    state.clinchControl = undefined;
    state.placedBy = target.corner;
    // A stuffed shot that ends up back on the feet leaves them right on top of each other.
    state.range = TRANSITION_RANGE.stuffedTakedown!;
    state.rangeSettled = 0.25;
  }
  return { seconds: rng.int(6, 12) };
}

/**
 * A head in his arms after a sprawl: go behind, choke, or snap him down and reset.
 *
 * The beat that gives a wrestler's *defence* an offence of its own, and the home of the guillotine,
 * the D'Arce and the anaconda — chokes that live off a stuffed shot and that the old engine could
 * only ever narrate from guard.
 */
function resolveFrontHeadlock(ctx: ExchangeContext, holder: Combatant, shooter: Combatant): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  emit('note', say.frontHeadlockText(rng, holder, shooter), holder.corner);
  const option = headlockOption(rng, holder);

  if (option === 'choke') {
    const key = headlockChoke(rng, holder);
    const result = lockContest(ctx, holder, shooter, key, 0.95, ['guillotine']);
    if (result.ending) return { seconds: rng.int(8, 16), ending: result.ending };
    // Survived it: usually they are left tangled on the floor with the choker underneath.
    if (rng.chance(0.5)) {
      state.position = 'ground';
      state.groundTop = shooter.corner;
      state.groundPosition = 'guard';
      state.placedBy = holder.corner;
      state.stalledSeconds = 0;
      return { seconds: rng.int(8, 14) };
    }
    return { seconds: rng.int(8, 14) };
  }

  if (option === 'goBehind') {
    const spin = fatiguedEffect(holder.attrs.scrambling, 'scrambling', holder.fatigue);
    const turn = fatiguedEffect(shooter.attrs.scrambling, 'scrambling', shooter.fatigue);
    if (rng.chance(spin / (spin + turn))) {
      state.position = 'ground';
      state.groundTop = holder.corner;
      state.groundPosition = rng.chance(0.35) ? 'back' : 'turtle';
      state.placedBy = holder.corner;
      state.stalledSeconds = 0;
      ctx.tally[holder.corner].takedowns++;
      holder.stats.takedownsLanded++;
      holder.stats.takedownsAttempted++;
      shiftMomentum(holder, shooter, 0.25);
      emit('takedown', say.goBehindText(rng, holder, state.groundPosition), holder.corner, 'major');
      return { seconds: rng.int(6, 12) };
    }
  }

  // Snapped down and let up, or the go-behind did not come off: back to their feet, close.
  state.range = TRANSITION_RANGE.stuffedTakedown!;
  state.rangeSettled = 0.25;
  return { seconds: rng.int(5, 9) };
}

// --- Clinch -------------------------------------------------------------------------------

/**
 * How long a stalled tie-up survives before the referee breaks it.
 *
 * The ground has had `maybeRefStandUp` since the beginning and the clinch had nothing, so a fighter
 * who won the tie-up and did nothing paid nothing — which made `grind` a plan with no ceiling
 * (docs/19 §13.6c). Shorter tolerance than the ground's: a referee will let a top position run and
 * will not watch two men lean on the fence.
 */
function clinchBreakThreshold(ctx: ExchangeContext): number {
  return clamp(55 - (ctx.referee.standUpSpeed / 100) * 30, 25, 55);
}

/**
 * One knee, from whoever is throwing it.
 *
 * Pulled out of the controller's branch so the fighter being held can throw too. Being held is a
 * real disadvantage and `heldPenalty` is where it lives: short shots from underneath land, and they
 * land less than the ones coming down on top of you.
 */
function throwClinchStrike(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  heldPenalty: number,
): Ending | undefined {
  const { rng, state, tally, emit } = ctx;

  const offence =
    fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue) * heldPenalty;
  const defence = fatiguedEffect(target.derived.clinchDefence, 'strength', target.fatigue);
  actor.stats.significantStrikesAttempted++;
  tally[actor.corner].strikesAttempted++;

  const connects = rng.chance(offence / (offence + defence));
  remember(actor, target, 'clinchStrike', connects, nowOf(ctx));
  if (!connects) return undefined;

  // Clinch work is body-and-knees work; it is how you drain someone standing up.
  const strikeTarget: StrikeTarget = rng.chance(0.6) ? 'body' : 'head';
  const result = applyStrike(rng, actor, target, strikeTarget, 'knee');
  actor.stats.significantStrikesLanded++;
  tally[actor.corner].significantStrikes++;
  tally[actor.corner].damageDealt += result.damage;
  state.stalledSeconds = 0;
  if (result.cut) state.cuts[target.corner] += rng.range(8, 22);
  emit('strike', say.clinchStrikeText(rng, actor, strikeTarget), actor.corner, undefined, {
    weapon: 'knee',
    target: strikeTarget,
  });

  if (result.knockdown) {
    tally[actor.corner].knockdowns++;
    emit('knockdown', say.knockdownText(rng, actor, target), actor.corner, 'critical');
    return resolveKnockdown(ctx, actor, target, result.flushness);
  }
  return afterStrike(ctx, actor, target, strikeTarget, 'knee', result);
}

/**
 * Standing back up out of somebody's guard, on purpose.
 *
 * The contest is disentangling against being held: `scrambling` on both sides, because retaining a
 * guard and breaking out of one are the same skill pointed in opposite directions, and the man
 * underneath is spending the beat trying to keep hold of hips and wrists. `groundControl` deliberately
 * does not appear on the actor's side — being good at *holding somebody down* is not what gets you
 * off them, and letting it in would make the fighters who least want to leave the best at it.
 *
 * Position decides most of it, and that lives in the candidate's `opportunity` rather than here:
 * how hard this is was already settled when the action was chosen. What is left is whether the man
 * underneath can keep hold.
 *
 * **What the engine cannot model, stated rather than invented:** there is no fence on the floor. A
 * fighter with his back to the cage genuinely has less room to stand out of, and nothing in
 * `FightState` knows where on the mat anybody is. It belongs with whatever eventually gives the
 * ground a geography.
 */
function resolveTopDisengage(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  const position = state.groundPosition;
  actor.stats.topExitsAttempted++;

  const breaking = fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue);
  /*
   * Guard retention, grips, a leg hooked. The man underneath does not have to sweep to keep him
   * there — he only has to stay attached, and how much of him there is to stay attached to is the
   * position: 1.39 in a closed guard down to 0.90 from the back, a little over half again.
   */
  const holding =
    fatiguedEffect(target.attrs.scrambling, 'scrambling', target.fatigue) *
    (1.6 - GROUND_DOMINANCE[position] * 0.7);

  if (rng.chance(breaking / (breaking + holding))) {
    actor.stats.topExitsLanded++;
    state.position = 'distance';
    state.groundTop = undefined;
    state.groundPosition = 'guard';
    state.placedBy = actor.corner;
    /*
     * Where the fight restarts is a function of how the separation happened, not a universal
     * reset. Out of a guard he had to break grips off his own hips and the other man comes up
     * attached to him; off side control, mount or the back he simply stands off a man who is flat
     * on his back. Same decision, two different amounts of space (doc 31 § D2).
     */
    state.range = disengageRange(position);
    state.rangeSettled = 0.15;
    state.stalledSeconds = 0;
    emit('standUp', say.topDisengageText(rng, actor), actor.corner);
    return { seconds: rng.int(8, 16) };
  }

  /*
   * Held there. The beat is spent and the position is unchanged — which is the honest outcome of
   * trying to stand out of a guard somebody is determined to keep you in, and is also what stops
   * this being a free exit. Stalled time accrues because nothing happened, the same as any other
   * failed action on the floor.
   */
  state.stalledSeconds += 15;
  return maybeRefStandUp(ctx, rng.int(8, 16));
}

/**
 * Letting go of a tie-up, on purpose.
 *
 * The contest is shoving off against staying attached: the actor's `clinchDefence` — the rating that
 * already governs getting *out* of a tie-up — against the other man's `clinchOffence`. It is the held
 * fighter's escape contest with the roles swapped, which is the point: the wish is the same from
 * both ends (`CLINCH_EXIT`) and only the grip is different. **`clinchOffence` deliberately does not
 * appear on the actor's side**; being good at holding people is not what gets you away from them,
 * and letting it in would make the fighters who least want to leave the best at leaving.
 *
 * It is easier than the held man's escape and should be: he has the grips, he picks the moment, and
 * the other man is not expecting it. That lives in `RELEASE_EDGE` rather than in a separate contest.
 *
 * **What the engine cannot model, stated rather than invented:** whether either man has his back to
 * the fence. `FightState` knows the two of them are tied up and not where in the cage they are, and
 * a man pinned against the fence genuinely has less room to be released into. It belongs with
 * whatever eventually gives the cage a geography, alongside the same gap on the floor (doc 31 § D2).
 */
function resolveClinchDisengage(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  actor.stats.clinchExitsAttempted++;

  const pushing =
    fatiguedEffect(actor.derived.clinchDefence, 'strength', actor.fatigue) * RELEASE_EDGE;
  const clinging = fatiguedEffect(target.derived.clinchOffence, 'strength', target.fatigue);

  if (rng.chance(pushing / (pushing + clinging))) {
    actor.stats.clinchExitsLanded++;
    state.position = 'distance';
    state.clinchControl = undefined;
    state.placedBy = actor.corner;
    state.stalledSeconds = 0;
    /*
     * Hands range, like every separation of two men who are both already standing — and *unlike*
     * the top disengage, where the other man starts from the floor and there is real space to be
     * had. What differs from the held man's break is not where they end up but who is balanced when
     * they get there: this man chose the moment and is set, so he holds the range he made for a
     * little longer. That is the stickiness, not the range.
     */
    state.range = TRANSITION_RANGE.clinchRelease!;
    state.rangeSettled = 0.45;
    emit('clinchBreak', say.clinchReleaseText(rng, actor), actor.corner);
    return { seconds: rng.int(5, 12) };
  }

  /*
   * He could not shake him off. The beat is spent and the tie-up is unchanged, which is what stops
   * this being a free exit — and the stalled seconds accrue because nothing happened, the same as
   * any other unproductive beat in a tie-up.
   */
  state.stalledSeconds += 7;
  return { seconds: rng.int(5, 12) };
}

/**
 * The clinch, from both sides.
 *
 * It used to have one side. The fighter in control chose between shooting, a knee and standing
 * there; the fighter being held had a single branch, which was to try to leave. Measured, that
 * produced a position the fight entered **three times a night and got 0.66 landed strikes out of**
 * (docs/19 §13.2) — not a rare phase, an empty one: a transit lounge on the way to a takedown.
 *
 * Both fighters have a fight now. The held man can strike short, or **reverse** the tie-up and
 * become the man in control, which is what makes the position two-sided rather than a countdown to
 * somebody else's takedown. And the referee separates a tie-up in which neither of them does
 * anything, which is the ceiling the `grind` approach never had.
 */
function resolveClinch(ctx: ExchangeContext, actor: Combatant, target: Combatant): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  const controlling = state.clinchControl === actor.corner;

  if (!controlling) {
    /*
     * Being held is not the same as being finished with. Three ways out and only one of them is the
     * door: leave, land something short, or take the position off them.
     *
     * The reversal reads `scrambling` against the holder's `clinchOffence` — hand-fighting and hip
     * position rather than raw strength, which is what separates a fighter who is *comfortable* in
     * a tie-up from one who is merely strong in it.
     *
     * The stance decides which of the three a fighter reaches for, and this is one of the two
     * places where being *put* somewhere matters most: an outside fighter walked onto the fence
     * did not choose this, and `heldBias` reads that through `placedBy`.
     */
    const stance = stanceOfActor(ctx, actor, 'clinch');

    /*
     * The same split as underneath: how hard he is working for the break, asked before and apart
     * from what he does in the tie-up. A fighter creating the separation is still pummelling and
     * still hand-fighting while he does it — and a break that does not come off used to produce
     * nothing at all.
     */
    let breaking = false;

    if (rng.chance(clinchExitUrgency(stance))) {
      actor.stats.escapesAttempted++;
      const escape = fatiguedEffect(actor.derived.clinchDefence, 'strength', actor.fatigue);
      const hold = fatiguedEffect(target.derived.clinchOffence, 'strength', target.fatigue);
      const out = rng.chance(escape / (escape + hold));
      remember(actor, target, 'escape', out, nowOf(ctx));
      if (out) {
        actor.stats.escapesLanded++;
        state.position = 'distance';
        state.clinchControl = undefined;
        state.placedBy = actor.corner;
        state.stalledSeconds = 0;
        // A clean break out of a tie-up puts two people at hands range, not at kicking range.
        state.range = TRANSITION_RANGE.clinchBreak!;
        state.rangeSettled = 0.35;
        emit('clinchBreak', say.clinchBreakText(rng, actor), actor.corner);
        return { seconds: rng.int(6, 14) };
      }
      // Charged by the in-state work below, not here. See the note underneath.
      breaking = true;
    }

    const work = chooseAction(rng, heldWork(actor, target, stance, breaking));

    if (work === 'clinchStrike') {
      // 0.75: a short shot from underneath is a real weapon and a worse one.
      const ending = throwClinchStrike(ctx, actor, target, 0.75);
      state.stalledSeconds += 6;
      return { seconds: rng.int(6, 12), ending };
    }

    if (work === 'pummel') {
      /*
       * Fighting the hands, resolved as pressure toward the referee's break rather than as a new
       * mechanic — the same shape as `defend` underneath, and the same reasoning: a tie-up nobody
       * is working in is one the referee separates, and that is the out a striker actually earns.
       */
      const hands = fatiguedEffect(actor.derived.clinchDefence, 'strength', actor.fatigue);
      const grip = fatiguedEffect(target.derived.clinchOffence, 'strength', target.fatigue);
      const stifled = rng.chance(hands / (hands + grip));
      state.stalledSeconds += stifled ? 16 : 7;
      if (stifled) emit('note', `${say.surname(actor)} fights the hands and gives them nothing.`);
      if (state.stalledSeconds >= clinchBreakThreshold(ctx)) {
        state.position = 'distance';
        state.clinchControl = undefined;
        state.placedBy = undefined;
        state.range = TRANSITION_RANGE.refSeparation!;
        state.rangeSettled = 0;
        state.stalledSeconds = 0;
        emit('refStandUp', say.clinchSeparationText());
      }
      return { seconds: rng.int(6, 12) };
    }

    const attack = fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue);
    const hold = fatiguedEffect(target.derived.clinchOffence, 'strength', target.fatigue);
    if (rng.chance(attack / (attack + hold))) {
      state.clinchControl = actor.corner;
      state.placedBy = actor.corner;
      state.stalledSeconds = 0;
      shiftMomentum(actor, target, 0.2);
      emit('clinch', say.clinchReversalText(rng, actor, target), actor.corner);
      return { seconds: rng.int(6, 12) };
    }
    state.stalledSeconds += 8;
    return { seconds: rng.int(6, 12) };
  }

  const stance = stanceOfActor(ctx, actor, 'clinch');
  const intent = chooseAction(rng, controllingCandidates(actor, target, stance));

  if (intent === 'takedown') return resolveTakedown(ctx, actor, target, 'clinch');

  if (intent === 'clinchStrike') {
    const ending = throwClinchStrike(ctx, actor, target, 1);
    return { seconds: rng.int(6, 14), ending };
  }

  if (intent === 'clinchDisengage') return resolveClinchDisengage(ctx, actor, target);

  // Pinning him on the fence: cheap for nobody, more expensive for the fighter pinned — and on a
  // clock, because a referee who will stand two men up off the floor will not watch them lean on
  // the fence indefinitely.
  const seconds = rng.int(10, 20);
  state.stalledSeconds += seconds;
  emit('note', `${say.surname(actor)} keeps them pinned against the fence, working the body.`);

  if (state.stalledSeconds >= clinchBreakThreshold(ctx)) {
    state.position = 'distance';
    state.clinchControl = undefined;
    state.placedBy = undefined;
    // The referee steps between them and waves them on: that *is* a neutral reset.
    state.range = TRANSITION_RANGE.refSeparation!;
    state.rangeSettled = 0;
    state.stalledSeconds = 0;
    emit('refStandUp', say.clinchSeparationText());
  }
  return { seconds };
}

// --- Ground -------------------------------------------------------------------------------

function resolveGround(ctx: ExchangeContext, actor: Combatant, target: Combatant): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  const onTop = state.groundTop === actor.corner;

  if (onTop) return resolveGroundTop(ctx, actor, target);

  /*
   * **The decision this whole layer was built for.**
   *
   * Three locally reasonable things to do off your back, and until `bottomBias` existed the only
   * thing choosing between them was which numbers happened to come out larger. A striker with 32
   * submissions rolled the guillotine a fair share of the time — not a bad decision, a fighter
   * with *no decision*, while the player's game plan sat on the camp screen saying counter-strike.
   *
   * `bottomIntent` is the instruction, and the submission's opportunity term is the exception
   * that keeps it sane: told to get up, this fighter gets up — unless what is actually available
   * is a fight-ending choke, which he takes, because a policy that cannot say that has replaced
   * one kind of stupid with a worse one.
   */
  const stance = stanceOfActor(ctx, actor, 'bottom');
  const subChance = submissionOpportunity(actor, target, state.groundPosition, false);

  /*
   * **Two decisions, not one.**
   *
   * How hard he is working for the exit is asked first and separately, exactly as the range beat
   * asks it standing: `transitionUrgency` reads the plan and nothing else, so the corner decides
   * how often he goes for the door and the two fighters decide whether it opens.
   *
   * What this replaced drew the exits against the in-state work in one list, which meant a fighter
   * told to stand up bought his get-ups by giving up everything else — and a *failed* get-up, which
   * is most of them, produced nothing whatsoever. He spent the beat achieving zero and the model
   * had no way to say he was still fighting. That is doc 01 § 8 and it is the whole of F1.
   */
  const exits = bottomExits(actor, stance, state.groundPosition);
  const goingForIt = rng.chance(clamp01(bottomExitUrgency(stance) * actor.mem.lean.escape));

  let escaping = false;
  if (goingForIt) {
    const route = chooseAction(rng, exits);
    actor.stats.escapesAttempted++;

    const bonus = prepBonus(target, actor, route === 'standUp' ? ['wallGetUp'] : ['guardPassing']);
    const escape =
      fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) *
      legImpairment(actor) *
      (1 - GROUND_DOMINANCE[state.groundPosition] * 0.5);
    const hold =
      fatiguedEffect(target.attrs.groundControl, 'groundControl', target.fatigue) *
      (1 + bonus) *
      // What the man on top is doing with his weight. Hitting you is not holding you.
      topControlFocus(target);

    const out = rng.chance(escape / (escape + hold));
    remember(actor, target, 'escape', out, nowOf(ctx));
    if (out) {
      actor.stats.escapesLanded++;
      if (route === 'sweep') {
        state.groundTop = actor.corner;
        state.groundPosition = 'guard';
        state.placedBy = actor.corner;
        shiftMomentum(actor, target, 0.3);
        emit('sweep', say.sweepText(rng, actor), actor.corner, 'major');
      } else if (rng.chance(matReturnChance(target, actor))) {
        /*
         * Up — and straight back down. The mat return is what makes a wrestler's top game a cage
         * rather than a position: the get-up succeeds and costs the man everything he spent on it.
         */
        state.groundPosition = rng.chance(0.3) ? 'back' : rng.chance(0.5) ? 'turtle' : 'halfGuard';
        state.placedBy = target.corner;
        target.stats.takedownsAttempted++;
        target.stats.takedownsLanded++;
        ctx.tally[target.corner].takedowns++;
        actor.fatigue = clamp01(actor.fatigue + 0.02);
        emit('takedown', say.matReturnText(rng, target, actor), target.corner, 'major');
        state.stalledSeconds = 0;
        return { seconds: rng.int(8, 14) };
      } else {
        state.position = 'distance';
        state.groundTop = undefined;
        state.groundPosition = 'guard';
        state.placedBy = actor.corner;
        // Wall-walked back up with the other man disengaging. Nobody is at kicking range yet.
        state.range = TRANSITION_RANGE.standUp!;
        state.rangeSettled = 0.2;
        shiftMomentum(actor, target, 0.15);
        emit('standUp', say.standUpText(rng, actor), actor.corner);
      }
      state.stalledSeconds = 0;
      return { seconds: rng.int(8, 16) };
    }

    /*
     * It did not come off, and the beat is not over. He is still down there and still fighting.
     *
     * No stalled time is booked here on purpose. Stalling is a property of what the beat achieved,
     * and the in-state work below is what decides that — charging it twice made a bottom beat
     * accrue 20 to 32 seconds where it used to accrue 20, which raised referee stand-ups across
     * the whole sport and quietly compressed the gap between a striking plan and a wrestling one.
     */
    escaping = true;

    // Getting up the hard way gives up the back to a quick man on top (doc 36 phase 5).
    if (route === 'standUp' && state.groundPosition !== 'back' && rng.chance(backExposureChance(target))) {
      const to = GROUND_DOMINANCE[state.groundPosition] >= GROUND_DOMINANCE.sideControl ? 'back' : 'turtle';
      state.groundPosition = to;
      shiftMomentum(target, actor, 0.15);
      emit('positionAdvance', say.backExposedText(rng, actor, target, to), target.corner);
      return { seconds: rng.int(8, 14) };
    }
    // A sweep that does not come off cleanly often turns into a scramble, and anything can come of one.
    if (route === 'sweep' && rng.chance(0.3)) {
      const outcome = scramble(rng, actor, target);
      if (outcome !== 'held') {
        emit('note', say.scrambleText(rng, actor, target, outcome), outcome === 'backTaken' ? target.corner : actor.corner);
        if (outcome === 'bothUp') {
          state.position = 'distance';
          state.groundTop = undefined;
          state.groundPosition = 'guard';
          state.placedBy = undefined;
          state.range = TRANSITION_RANGE.standUp!;
          state.rangeSettled = 0;
        } else if (outcome === 'reversed') {
          state.groundTop = actor.corner;
          state.groundPosition = 'halfGuard';
          state.placedBy = actor.corner;
          shiftMomentum(actor, target, 0.25);
        } else {
          state.groundPosition = 'back';
          shiftMomentum(target, actor, 0.25);
        }
        state.stalledSeconds = 0;
        return { seconds: rng.int(8, 14) };
      }
    }
  }

  const work = chooseAction(
    rng,
    bottomWork(actor, stance, state.groundPosition, subChance, escaping),
  );
  actor.stats.bottomWorkBeats++;
  if (work === 'submission') return resolveSubmission(ctx, actor, target, true);

  /*
   * Framing and hand-fighting, resolved as pressure toward a referee stand-up rather than as a new
   * damage system. A guard nobody can work in is how a fight gets restarted on the feet, and that
   * is the escape a defensive bottom game actually earns.
   */
  const frame =
    fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) * legImpairment(actor);
  const press =
    fatiguedEffect(target.attrs.groundControl, 'groundControl', target.fatigue) *
    topControlFocus(target);
  /*
   * Sized against what the beat used to charge. The branch this replaced booked a flat 20 stalled
   * seconds for any failed escape, and that number is load-bearing: stalled time is what draws the
   * referee's stand-up, which is a real route back to the feet. Splitting it into a contest and
   * letting the loser accrue only 8 cut the stand-up rate for exactly the fighters who need it
   * most — a 40-scrambling striker under an 88-groundControl wrestler gained **48 seconds a fight**
   * on his back. Measured back to within 5% of the old rate, with the contest still worth a third
   * more stalled time to the man who wins it.
   */
  const held = rng.chance(frame / (frame + press));
  state.stalledSeconds += held ? 24 : 18;
  if (held) emit('note', `${say.surname(actor)} frames and hand-fights, giving them nothing.`);
  return maybeRefStandUp(ctx, rng.int(10, 20));
}

function resolveGroundTop(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
): ExchangeOutcome {
  const { rng, state, tally, emit } = ctx;
  const dominance = GROUND_DOMINANCE[state.groundPosition];

  /*
   * On top, `topIntent` governs rather than `preferredState` — the fight is already where it is,
   * and what remains is what you do having arrived. Keeping the two apart is what lets a wrestler
   * who wants top position also be told to sit on it, or to hunt from it, without those being
   * three different game plans.
   */
  const stance = stanceOfActor(ctx, actor, 'top');
  const subChance = submissionOpportunity(actor, target, state.groundPosition, true);

  const intent = chooseAction(rng, topCandidates(actor, target, stance, dominance, subChance));
  actor.stats.topBeats++;

  if (intent === 'submission') return resolveSubmission(ctx, actor, target, false);

  if (intent === 'standUpFromTop') return resolveTopDisengage(ctx, actor, target);

  if (intent === 'advancePosition') {
    const bonus = prepBonus(target, actor, ['guardPassing', 'backTake']);
    const pass = fatiguedEffect(actor.attrs.groundControl, 'groundControl', actor.fatigue);
    const retain =
      fatiguedEffect(target.attrs.scrambling, 'scrambling', target.fatigue) * (1 + bonus);

    const passes = rng.chance(pass / (pass + retain));
    remember(actor, target, 'pass', passes, nowOf(ctx));
    if (passes) {
      const next = ladderStep(state.groundPosition);
      if (next !== state.groundPosition) {
        state.groundPosition = next;
        state.stalledSeconds = 0;
        shiftMomentum(actor, target, 0.2);
        emit('positionAdvance', say.advanceText(actor, next), actor.corner);
        return { seconds: rng.int(10, 20) };
      }
    }
    state.stalledSeconds += 15;
    return maybeRefStandUp(ctx, rng.int(8, 16));
  }

  if (intent === 'groundStrike') {
    const bonus = prepBonus(target, actor, ['groundAndPound']);
    const offence =
      fatiguedEffect(actor.derived.groundAndPound, 'groundControl', actor.fatigue) *
      (0.6 + dominance);
    const defence =
      fatiguedEffect(target.attrs.scrambling, 'scrambling', target.fatigue) * (1 + bonus) * 0.8;

    const shots = rng.int(1, 4);
    let landed = 0;
    let landedElbow = false;
    for (let i = 0; i < shots; i++) {
      actor.stats.significantStrikesAttempted++;
      tally[actor.corner].strikesAttempted++;
      const connects = rng.chance(offence / (offence + defence));
      remember(actor, target, 'groundStrike', connects, nowOf(ctx), undefined, undefined);
      if (!connects) continue;
      landed++;
      /*
       * Punches and elbows, and the position decides which.
       *
       * The prose said "punches and elbows" and resolution knew about neither. From guard you are
       * throwing hands; from mount or the back an elbow is available, and an elbow is how a
       * ground-and-pound fight ends in the doctor's hands rather than the referee's.
       */
      const groundWeapon: Weapon = rng.chance(dominance * 0.5) ? 'elbow' : 'punch';
      const groundTarget: StrikeTarget = rng.chance(0.75) ? 'head' : 'body';
      const result = applyStrike(rng, actor, target, groundTarget, groundWeapon);
      if (groundWeapon === 'elbow') landedElbow = true;
      actor.stats.significantStrikesLanded++;
      tally[actor.corner].significantStrikes++;
      tally[actor.corner].damageDealt += result.damage;
      if (result.cut) state.cuts[target.corner] += rng.range(8, 22);

      // A knockdown from top position counts exactly as much as one on the feet: it is the
      // most legible evidence of damage a judge has, and the 10-8 gate reads this field.
      // Without it a fighter could drop someone twice from mount and lose the round.
      if (result.knockdown) {
        tally[actor.corner].knockdowns++;
        shiftMomentum(actor, target, 0.4);
        emit('knockdown', say.knockdownText(rng, actor, target), actor.corner, 'critical');
      }

      const story = afterStrike(ctx, actor, target, groundTarget, groundWeapon, result);
      if (story) return { seconds: 10, ending: story };

      if (result.knockdown || target.hurtSeconds > 0) {
        state.unanswered[target.corner]++;
        if (shouldRefereeStop(target, ctx.referee.stoppageTrigger, state.unanswered[target.corner])) {
          emit(
            'groundStrikes',
            say.groundStrikesText(rng, actor, true, landedElbow),
            actor.corner,
            'critical',
          );
          return { seconds: 10, ending: { method: 'tko', winner: actor.corner } };
        }
      }
    }
    if (landed > 0) {
      state.stalledSeconds = 0;
      emit(
        'groundStrikes',
        say.groundStrikesText(rng, actor, landed >= 3, landedElbow),
        actor.corner,
      );
    } else {
      state.stalledSeconds += 15;
    }
    return maybeRefStandUp(ctx, rng.int(8, 16));
  }

  /*
   * Riding the position: control time without offence. Effective on the cards, and a stand-up risk.
   *
   * The stalled time is charged here because this is the beat that produced it — a fighter holding
   * somebody down and doing nothing else is exactly what a referee stands up. It is *not* the same
   * accounting as the residual inactivity from a failed advance or a whiffed ground strike, which
   * those branches charge for themselves. Both are stalled time; only this one was chosen.
   */
  state.stalledSeconds += 25;
  return maybeRefStandUp(ctx, rng.int(14, 26));
}

function resolveSubmission(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  fromBottom: boolean,
): ExchangeOutcome {
  const { rng, state } = ctx;
  const dominance = GROUND_DOMINANCE[state.groundPosition];
  const key =
    chooseSubmission(
      rng,
      actor.style.subs,
      submissionsFrom(state.groundPosition, !fromBottom),
      actor.mem.lastSubFailed,
    ) ?? 'guillotine';

  const reads: ReadKey[] = state.groundPosition === 'back' ? ['backTake'] : ['guillotine'];
  const result = lockContest(ctx, actor, target, key, fromBottom ? 0.75 : 0.6 + dominance, reads);
  if (result.ending) return { seconds: rng.int(8, 20), ending: result.ending };

  /*
   * A failed attack off the back usually costs position — and a failed leg lock costs more than
   * that: the man who escapes a heel hook comes out on top, past the legs.
   */
  if (fromBottom) {
    if (state.groundPosition === 'legEntangle') {
      state.groundPosition = rng.chance(0.5) ? 'halfGuard' : 'sideControl';
    } else if (rng.chance(0.35)) {
      state.groundPosition = ladderStep(state.groundPosition);
    }
  }
  state.stalledSeconds = 0;
  return { seconds: rng.int(9, 18) };
}

/**
 * The submission contest itself: deep or not, finished or not, and what a survived lock costs.
 *
 * Shared by the floor and the front headlock. The hold's own profile enters the contest
 * (`submissions.ts`): a technical hold leans on `submissions` alone and a pressure hold lets
 * `strength` carry part of it; a back choke finishes more often once deep than a kneebar does.
 * A drilled hold — a signature — is executed a little cleaner, and only a little.
 */
function lockContest(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  key: SubmissionKey,
  positionScale: number,
  reads: ReadKey[],
): { deep: boolean; ending?: Ending } {
  const { rng, tally, emit } = ctx;
  const meta = SUBMISSION_META[key];
  const name = meta.label;
  const bonus = prepBonus(target, actor, reads);

  const craft = fatiguedEffect(actor.attrs.submissions, 'submissions', actor.fatigue);
  const squeeze = fatiguedEffect(actor.attrs.strength, 'strength', actor.fatigue);
  const drilled = actor.style.signatureSub === key ? 1.08 : 1;
  const attack =
    craft ** (0.7 + 0.3 * meta.technicality) *
    squeeze ** (0.3 - 0.3 * meta.technicality) *
    drilled *
    positionScale *
    (target.hurtSeconds > 0 ? 1.5 : 1);
  const defend =
    fatiguedEffect(target.derived.submissionDefence, 'submissions', target.fatigue) * (1 + bonus);

  actor.stats.submissionAttempts++;
  tally[actor.corner].submissionAttempts++;

  const edge = clamp01(attack / (attack + defend));
  const deep = rng.chance(edge);
  remember(actor, target, 'submission', deep, nowOf(ctx));
  emit('submissionAttempt', say.submissionAttemptText(actor, target, name, deep), actor.corner, deep ? 'major' : undefined);

  if (deep) {
    shiftMomentum(actor, target, 0.3);
    // Deep does not mean finished — most tight submissions are survived, which is why
    // grapplers rack up attempts and still go to the cards.
    //
    // The exponent matters more than the coefficient: a linear conversion here makes every
    // competent grappler a submission machine and pushes the population sub rate past 50%.
    // Cubing it keeps a genuine specialist dangerous while making an average grappler's
    // attempt what it should be — a scoring event, not a fight-ender.
    const priorAttempts = Math.max(0, actor.stats.submissionAttempts - 1);
    const familiarity = 1 / (1 + SUBMISSION_REPEAT_DECAY * priorAttempts);
    const finishChance = clamp01(SUBMISSION_FINISH_RATE * edge ** 3 * familiarity * meta.finishing);
    if (rng.chance(finishChance)) {
      return { deep, ending: { method: 'submission', winner: actor.corner, submissionName: name } };
    }
  }

  actor.mem.lastSubFailed = key;
  // A deep lock that was survived rather than escaped may have cost the joint.
  if (deep) survivedLock(storyOf(ctx), target, meta.injury, edge);
  emit('submissionEscape', say.submissionEscapeText(rng, target), target.corner);
  return { deep };
}

/** Referee stand-up when the ground position has stalled. Their tendency decides how fast. */
function maybeRefStandUp(ctx: ExchangeContext, seconds: number): ExchangeOutcome {
  const { state, referee, emit } = ctx;
  if (state.position !== 'ground') return { seconds };

  // standUpSpeed 1 → ~90s of tolerance; 100 → ~25s. The single biggest external modifier on
  // a control-based wrestler's game plan, and it is visible before the fight.
  const threshold = clamp(90 - (referee.standUpSpeed / 100) * 65, 25, 90);
  if (state.stalledSeconds < threshold) return { seconds };

  state.position = 'distance';
  state.groundTop = undefined;
  state.placedBy = undefined;
  state.groundPosition = 'guard';
  state.stalledSeconds = 0;
  // The referee's decision, so a neutral restart like the bell.
  state.range = TRANSITION_RANGE.neutral!;
  state.rangeSettled = 0;
  emit('refStandUp', say.refStandUpText());
  return { seconds };
}

// --- Doctor -------------------------------------------------------------------------------

function checkDoctor(rng: Rng, state: FightState): Ending | undefined {
  for (const corner of ['red', 'blue'] as const) {
    const severity = state.cuts[corner];
    if (severity < 30) continue;
    if (rng.chance(clamp01((severity - 30) / 70))) {
      return { method: 'doctorStoppage', winner: OTHER_CORNER[corner] };
    }
  }
  return undefined;
}

export { emptyStats };
