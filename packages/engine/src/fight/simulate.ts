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

import { clamp, clamp01 } from '../core/math.js';
import { createRng, type Rng } from '../core/rng.js';
import type { FighterId } from '../core/ids.js';
import type { Fighter, FinishMethod } from '../domain/fighter.js';
import type { GamePlan, ReadKey } from '../domain/gameplan.js';
import { PREP_MAX_BONUS, defaultGamePlan, normaliseGamePlan, prepValue } from '../domain/gameplan.js';
import type { Judge, Referee } from '../domain/officials.js';
import { defaultJudges, defaultReferee } from '../domain/officials.js';
import { traitMul } from '../domain/traits.js';
import { fatiguedEffect } from '../ratings/curve.js';
import * as say from './commentary.js';
import {
  applyStrike,
  decayHurt,
  legImpairment,
  shouldRefereeStop,
} from './damage.js';
import {
  createCombatant,
  effectiveComposure,
  momentumMultiplier,
  roundBiasMultiplier,
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
import { accrueFatigue, recoverBetweenRounds, workRate } from './stamina.js';
import {
  GROUND_DOMINANCE,
  GROUND_POSITIONS,
  OTHER_CORNER,
  emptyStats,
  type Corner,
  type DamageReport,
  type FightEvent,
  type FightEventKind,
  type FightResult,
  type GroundPosition,
  type Position,
  type StrikeTarget,
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
  /** Corner controlling the clinch, if either. */
  clinchControl?: Corner;
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
const SUBMISSION_FINISH_RATE = 0.34;

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
  state.groundTop = undefined;
  state.groundPosition = 'guard';
  state.clinchControl = undefined;
  state.stalledSeconds = 0;
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
  const tallies: Record<Corner, RoundTally>[] = [];
  let ending: Ending | undefined;
  let endRound: number = rounds;
  let endTime: number = roundSeconds;

  for (let round = 1; round <= rounds && !ending; round++) {
    const roundRng = rng.fork(`round:${round}`);
    const tally: Record<Corner, RoundTally> = { red: emptyTally(), blue: emptyTally() };
    tallies.push(tally);

    let clock = 0;
    events.push({
      round,
      timeSeconds: 0,
      kind: 'roundStart',
      text: say.roundStartText(round, rounds),
    });

    while (clock < roundSeconds) {
      const emit = (
        kind: FightEventKind,
        text: string,
        corner?: Corner,
        emphasis?: FightEvent['emphasis'],
      ) => {
        events.push({ round, timeSeconds: Math.round(clock), kind, text, corner, emphasis });
      };

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

    // Between rounds: recover and reset to standing.
    if (round < rounds) {
      recoverBetweenRounds(red);
      recoverBetweenRounds(blue);
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
    damage: { red: damageReport(red, method, winnerId), blue: damageReport(blue, method, winnerId) },
    fouls: state.fouls,
    deductions: { ...state.deductions },
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
  emit: (
    kind: FightEventKind,
    text: string,
    corner?: Corner,
    emphasis?: FightEvent['emphasis'],
  ) => void;
  scoreSoFar: readonly Record<Corner, RoundTally>[];
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

  const outcome =
    state.position === 'distance'
      ? resolveDistance(ctx, actor, target)
      : state.position === 'clinch'
        ? resolveClinch(ctx, actor, target)
        : resolveGround(ctx, actor, target);

  // Time, fatigue and hurt decay apply regardless of what happened.
  const seconds = Math.min(outcome.seconds, Math.max(1, ctx.secondsRemaining));
  applyPassiveEffects(ctx, seconds);

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

function applyPassiveEffects(ctx: ExchangeContext, seconds: number): void {
  const { corners, state, tally } = ctx;

  for (const corner of ['red', 'blue'] as const) {
    const c = corners[corner];
    const isControlled =
      (state.position === 'ground' && state.groundTop === OTHER_CORNER[corner]) ||
      (state.position === 'clinch' && state.clinchControl === OTHER_CORNER[corner]);

    accrueFatigue(c, {
      position: state.position,
      groundPosition: state.groundPosition,
      isControlled,
      intensity: state.position === 'distance' ? 1 : 1.15,
      seconds,
    });
    const wasHurt = c.hurtSeconds > 0;
    decayHurt(c, seconds);
    // Clearing the hurt state clears the referee's count. Without this, unanswered shots
    // accumulate across the whole fight and a single wobble in round one becomes a stoppage
    // in round three — the referee is watching *this* sequence, not a career total.
    if (wasHurt && c.hurtSeconds <= 0) {
      state.unanswered[corner] = 0;
      ctx.emit('recovered', `${c.fighter.lastName} has recovered and is fighting back.`, corner);
    }

    if (state.position === 'distance') {
      c.stats.distanceSeconds += seconds;
    } else if (
      (state.position === 'ground' && state.groundTop === corner) ||
      (state.position === 'clinch' && state.clinchControl === corner)
    ) {
      c.stats.controlSeconds += seconds;
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

// --- Distance -----------------------------------------------------------------------------

function resolveDistance(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  const plan = actor.plan;

  // Intent weights. Approach shifts them; the fighter's own attributes dominate; and a
  // switched-on fighter leans toward whatever their opponent cannot deal with.
  const strikeW =
    fatiguedEffect(actor.attrs.strikingOffence, 'strikingOffence', actor.fatigue) *
    approachWeight(plan.approach, 'strike') *
    exploitFactor(actor, actor.attrs.strikingOffence, target.attrs.strikingDefence);
  const kickW =
    fatiguedEffect(actor.attrs.kicking, 'kicking', actor.fatigue) *
    legImpairment(actor) *
    approachWeight(plan.approach, 'kick') *
    exploitFactor(actor, actor.attrs.kicking, target.attrs.strikingDefence);
  const takedownW =
    fatiguedEffect(actor.derived.chainWrestling, 'wrestling', actor.fatigue) *
    approachWeight(plan.approach, 'takedown') *
    exploitFactor(actor, actor.attrs.wrestling, target.attrs.takedownDefence);
  const clinchW =
    fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue) *
    approachWeight(plan.approach, 'clinch') *
    exploitFactor(actor, actor.derived.clinchOffence, target.derived.clinchDefence);

  const intent = rng.pickWeighted(
    ['strike', 'kick', 'takedown', 'clinchUp'] as const,
    (i) =>
      i === 'strike' ? strikeW : i === 'kick' ? kickW : i === 'takedown' ? takedownW : clinchW,
  );

  switch (intent) {
    case 'strike':
    case 'kick':
      return resolveStrikeExchange(ctx, actor, target, intent === 'kick');
    case 'takedown':
      return resolveTakedown(ctx, actor, target, 'distance');
    case 'clinchUp': {
      const bonus = prepBonus(target, actor, ['fenceClinch']);
      const attack = fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue);
      const defend =
        fatiguedEffect(target.derived.clinchDefence, 'strength', target.fatigue) * (1 + bonus);
      if (rng.chance(attack / (attack + defend))) {
        state.position = 'clinch';
        state.clinchControl = actor.corner;
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

/** How strongly each approach pulls toward each kind of action. */
function approachWeight(approach: GamePlan['approach'], action: string): number {
  const table: Record<GamePlan['approach'], Record<string, number>> = {
    pressure: { strike: 1.25, kick: 0.9, takedown: 0.8, clinch: 1.1, advance: 1.1, submit: 0.9 },
    counter: { strike: 1.1, kick: 1.1, takedown: 0.7, clinch: 0.6, advance: 0.9, submit: 0.9 },
    wrestle: { strike: 0.7, kick: 0.5, takedown: 2.0, clinch: 1.3, advance: 1.2, submit: 1.0 },
    grind: { strike: 0.7, kick: 0.5, takedown: 1.3, clinch: 2.0, advance: 1.4, submit: 0.8 },
    pointFight: { strike: 1.1, kick: 1.1, takedown: 1.0, clinch: 0.8, advance: 0.8, submit: 0.6 },
    finish: { strike: 1.4, kick: 1.2, takedown: 0.9, clinch: 0.8, advance: 1.3, submit: 1.5 },
  };
  return table[approach][action] ?? 1;
}

function pickTarget(rng: Rng, actor: Combatant): StrikeTarget {
  const t = actor.plan.targeting;
  return rng.pickWeighted(['head', 'body', 'legs'] as const, (k) => t[k]);
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
function resolveStrikeExchange(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  isKick: boolean,
): ExchangeOutcome {
  const { rng } = ctx;
  const seconds = rng.int(6, 14);

  const lead = throwBurst(ctx, actor, target, isKick, 1);
  if (lead.ending) return { seconds, ending: lead.ending };

  // The counter. Smaller than the lead burst — you are reacting, not initiating — unless
  // countering is the whole plan, which is what makes the `counter` approach worth picking.
  if (ctx.state.position === 'distance' && target.hurtSeconds <= 0) {
    const counterScale = target.plan.approach === 'counter' ? 0.9 : 0.55;
    const counter = throwBurst(ctx, target, actor, false, counterScale);
    if (counter.ending) return { seconds, ending: counter.ending };
  }

  return { seconds };
}

interface BurstOutcome {
  landedAny: boolean;
  ending?: Ending;
}

function throwBurst(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  isKick: boolean,
  scale: number,
): BurstOutcome {
  const { rng, state, tally, emit, referee } = ctx;

  const base = rng.int(2, actor.fighter.traits.includes('volumeMachine') ? 7 : 5);
  const burst = Math.max(1, Math.round(base * scale * workRate(actor, false)));
  let landedAny = false;

  for (let i = 0; i < burst; i++) {
    const strikeTarget = pickTarget(rng, actor);
    const reads: ReadKey[] = isKick
      ? strikeTarget === 'legs'
        ? ['calfKick']
        : strikeTarget === 'head'
          ? ['headKick']
          : ['bodyWork']
      : strikeTarget === 'body'
        ? ['bodyWork', 'highVolume']
        : ['leadHook', 'counterRight', 'highVolume'];

    const bonus = prepBonus(target, actor, reads);

    const offence =
      fatiguedEffect(
        isKick ? actor.attrs.kicking : actor.attrs.strikingOffence,
        isKick ? 'kicking' : 'strikingOffence',
        actor.fatigue,
      ) *
      (isKick ? legImpairment(actor) : 1) *
      momentumMultiplier(actor) *
      traitMul(actor.fighter.traits, 'strikeAccuracy');

    const defence =
      fatiguedEffect(target.attrs.strikingDefence, 'strikingDefence', target.fatigue) *
      (1 + bonus) *
      (target.hurtSeconds > 0 ? 0.45 : 1) *
      legImpairment(target);

    actor.stats.significantStrikesAttempted++;
    tally[actor.corner].strikesAttempted++;

    if (!rng.chance(offence / (offence + defence))) {
      if (i === 0) emit('strike', say.strikeMissed(rng, actor, strikeTarget), actor.corner);
      continue;
    }

    landedAny = true;
    actor.stats.significantStrikesLanded++;
    tally[actor.corner].significantStrikes++;

    const result = applyStrike(rng, actor, target, strikeTarget);
    tally[actor.corner].damageDealt += result.damage;

    // Flush head shots open cuts. Cuts end fights via the doctor, not the referee.
    if (strikeTarget === 'head' && result.flushness > 1.8 && rng.chance(0.14)) {
      state.cuts[target.corner] += rng.range(8, 22);
    }

    emit(
      isKick ? 'kick' : 'strike',
      say.strikeLanded(rng, actor, strikeTarget, isKick, result.flushness),
      actor.corner,
      result.flushness >= 2 ? 'major' : undefined,
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

    const result = applyStrike(rng, actor, target, 'head');
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

function shiftMomentum(gainer: Combatant, loser: Combatant, amount: number): void {
  gainer.momentum = clamp(gainer.momentum + amount, -1, 1);
  loser.momentum = clamp(loser.momentum - amount, -1, 1);
}

// --- Takedowns ----------------------------------------------------------------------------

function resolveTakedown(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  from: 'distance' | 'clinch',
): ExchangeOutcome {
  const { rng, state, tally, emit } = ctx;

  const reads: ReadKey[] = from === 'clinch' ? ['bodyLock', 'fenceClinch'] : ['singleLeg', 'doubleLeg'];
  const bonus = prepBonus(target, actor, reads);

  const offence =
    fatiguedEffect(actor.derived.chainWrestling, 'wrestling', actor.fatigue) *
    momentumMultiplier(actor) *
    traitMul(actor.fighter.traits, 'takedownRate') *
    (from === 'clinch' ? 1.25 : 1);

  const defence =
    fatiguedEffect(target.attrs.takedownDefence, 'takedownDefence', target.fatigue) *
    (1 + bonus) *
    // Chewed-up legs are a chewed-up base. This is the payoff for a calf-kick game plan.
    legImpairment(target) *
    (target.hurtSeconds > 0 ? 0.5 : 1);

  actor.stats.takedownsAttempted++;

  if (rng.chance(offence / (offence + defence))) {
    actor.stats.takedownsLanded++;
    tally[actor.corner].takedowns++;
    state.position = 'ground';
    state.groundTop = actor.corner;
    // A dominant wrestler lands in better positions, not merely more often.
    state.groundPosition =
      actor.attrs.groundControl > 80 && rng.chance(0.35) ? 'halfGuard' : 'guard';
    state.stalledSeconds = 0;
    shiftMomentum(actor, target, 0.25);
    emit('takedown', say.takedownText(rng, actor, state.groundPosition), actor.corner, 'major');
    return { seconds: rng.int(6, 12) };
  }

  shiftMomentum(target, actor, 0.15);
  emit('takedownStuffed', say.takedownStuffedText(rng, actor, target), target.corner);
  // A stuffed shot from the clinch usually ends up back at distance.
  if (from === 'clinch' && rng.chance(0.5)) {
    state.position = 'distance';
    state.clinchControl = undefined;
  }
  return { seconds: rng.int(6, 12) };
}

// --- Clinch -------------------------------------------------------------------------------

function resolveClinch(ctx: ExchangeContext, actor: Combatant, target: Combatant): ExchangeOutcome {
  const { rng, state, tally, emit } = ctx;
  const controlling = state.clinchControl === actor.corner;

  if (!controlling) {
    // The controlled fighter is trying to get out.
    const escape = fatiguedEffect(actor.derived.clinchDefence, 'strength', actor.fatigue);
    const hold = fatiguedEffect(target.derived.clinchOffence, 'strength', target.fatigue);
    if (rng.chance(escape / (escape + hold))) {
      state.position = 'distance';
      state.clinchControl = undefined;
      emit('clinchBreak', say.clinchBreakText(rng, actor), actor.corner);
    }
    return { seconds: rng.int(6, 14) };
  }

  const takedownW = fatiguedEffect(actor.derived.chainWrestling, 'wrestling', actor.fatigue) * 1.2;
  const strikeW = fatiguedEffect(actor.attrs.strikingOffence, 'strikingOffence', actor.fatigue) * 0.8;
  const stallW = actor.plan.approach === 'grind' ? 1.6 : 0.5;

  const intent = rng.pickWeighted(
    ['takedown', 'clinchStrike', 'stall'] as const,
    (i) => (i === 'takedown' ? takedownW : i === 'clinchStrike' ? strikeW : stallW),
  );

  if (intent === 'takedown') return resolveTakedown(ctx, actor, target, 'clinch');

  if (intent === 'clinchStrike') {
    const offence = fatiguedEffect(actor.derived.clinchOffence, 'strength', actor.fatigue);
    const defence = fatiguedEffect(target.derived.clinchDefence, 'strength', target.fatigue);
    actor.stats.significantStrikesAttempted++;
    tally[actor.corner].strikesAttempted++;
    if (rng.chance(offence / (offence + defence))) {
      // Clinch work is body-and-knees work; it is how you drain someone standing up.
      const strikeTarget: StrikeTarget = rng.chance(0.6) ? 'body' : 'head';
      const result = applyStrike(rng, actor, target, strikeTarget);
      actor.stats.significantStrikesLanded++;
      tally[actor.corner].significantStrikes++;
      tally[actor.corner].damageDealt += result.damage;
      emit(
        'strike',
        `${say.surname(actor)} digs a knee to the ${strikeTarget} in the clinch.`,
        actor.corner,
      );
      if (result.knockdown) {
        tally[actor.corner].knockdowns++;
        emit('knockdown', say.knockdownText(rng, actor, target), actor.corner, 'critical');
        const ko = resolveKnockdown(ctx, actor, target, result.flushness);
        if (ko) return { seconds: 12, ending: ko };
      }
    }
    return { seconds: rng.int(6, 14) };
  }

  // Stalling on the fence: cheap for nobody, but far more expensive for the fighter pinned.
  emit('note', `${say.surname(actor)} keeps them pinned against the fence, working the body.`);
  return { seconds: rng.int(10, 20) };
}

// --- Ground -------------------------------------------------------------------------------

function resolveGround(ctx: ExchangeContext, actor: Combatant, target: Combatant): ExchangeOutcome {
  const { rng, state, emit } = ctx;
  const onTop = state.groundTop === actor.corner;

  if (onTop) return resolveGroundTop(ctx, actor, target);

  // Bottom: get up, sweep, or attack a submission off the back foot.
  const getUpW =
    fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) *
    legImpairment(actor) *
    (1 - GROUND_DOMINANCE[state.groundPosition] * 0.7);
  const sweepW = fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) * 0.6;
  const subW =
    state.groundPosition === 'guard'
      ? fatiguedEffect(actor.attrs.submissions, 'submissions', actor.fatigue) * 0.8
      : 0.05;

  const intent = rng.pickWeighted(
    ['standUp', 'sweep', 'submission'] as const,
    (i) => (i === 'standUp' ? getUpW : i === 'sweep' ? sweepW : subW),
  );

  if (intent === 'submission') return resolveSubmission(ctx, actor, target, true);

  const bonus = prepBonus(target, actor, intent === 'standUp' ? ['wallGetUp'] : ['guardPassing']);
  const escape =
    fatiguedEffect(actor.attrs.scrambling, 'scrambling', actor.fatigue) *
    legImpairment(actor) *
    (1 - GROUND_DOMINANCE[state.groundPosition] * 0.5);
  const hold =
    fatiguedEffect(target.attrs.groundControl, 'groundControl', target.fatigue) * (1 + bonus);

  if (rng.chance(escape / (escape + hold))) {
    if (intent === 'sweep') {
      state.groundTop = actor.corner;
      state.groundPosition = 'guard';
      shiftMomentum(actor, target, 0.3);
      emit('sweep', say.sweepText(rng, actor), actor.corner, 'major');
    } else {
      state.position = 'distance';
      state.groundTop = undefined;
      state.groundPosition = 'guard';
      shiftMomentum(actor, target, 0.15);
      emit('standUp', say.standUpText(rng, actor), actor.corner);
    }
    state.stalledSeconds = 0;
    return { seconds: rng.int(8, 16) };
  }

  state.stalledSeconds += 20;
  return maybeRefStandUp(ctx, rng.int(10, 20));
}

function resolveGroundTop(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
): ExchangeOutcome {
  const { rng, state, tally, emit } = ctx;
  const dominance = GROUND_DOMINANCE[state.groundPosition];

  const advanceW =
    fatiguedEffect(actor.attrs.groundControl, 'groundControl', actor.fatigue) *
    (1 - dominance) *
    approachWeight(actor.plan.approach, 'advance');
  const gnpW =
    fatiguedEffect(actor.derived.groundAndPound, 'groundControl', actor.fatigue) * (0.4 + dominance);
  const subW =
    fatiguedEffect(actor.attrs.submissions, 'submissions', actor.fatigue) *
    (0.3 + dominance) *
    approachWeight(actor.plan.approach, 'submit');
  const stallW = actor.plan.approach === 'grind' || actor.plan.approach === 'pointFight' ? 1.2 : 0.35;

  const intent = rng.pickWeighted(
    ['advancePosition', 'groundStrike', 'submission', 'stall'] as const,
    (i) =>
      i === 'advancePosition'
        ? advanceW
        : i === 'groundStrike'
          ? gnpW
          : i === 'submission'
            ? subW
            : stallW,
  );

  if (intent === 'submission') return resolveSubmission(ctx, actor, target, false);

  if (intent === 'advancePosition') {
    const bonus = prepBonus(target, actor, ['guardPassing', 'backTake']);
    const pass = fatiguedEffect(actor.attrs.groundControl, 'groundControl', actor.fatigue);
    const retain =
      fatiguedEffect(target.attrs.scrambling, 'scrambling', target.fatigue) * (1 + bonus);
    if (rng.chance(pass / (pass + retain))) {
      const idx = GROUND_POSITIONS.indexOf(state.groundPosition);
      const next = GROUND_POSITIONS[Math.min(idx + 1, GROUND_POSITIONS.length - 1)]!;
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
    for (let i = 0; i < shots; i++) {
      actor.stats.significantStrikesAttempted++;
      tally[actor.corner].strikesAttempted++;
      if (!rng.chance(offence / (offence + defence))) continue;
      landed++;
      const result = applyStrike(rng, actor, target, rng.chance(0.75) ? 'head' : 'body');
      actor.stats.significantStrikesLanded++;
      tally[actor.corner].significantStrikes++;
      tally[actor.corner].damageDealt += result.damage;

      // A knockdown from top position counts exactly as much as one on the feet: it is the
      // most legible evidence of damage a judge has, and the 10-8 gate reads this field.
      // Without it a fighter could drop someone twice from mount and lose the round.
      if (result.knockdown) {
        tally[actor.corner].knockdowns++;
        shiftMomentum(actor, target, 0.4);
        emit('knockdown', say.knockdownText(rng, actor, target), actor.corner, 'critical');
      }

      if (result.knockdown || target.hurtSeconds > 0) {
        state.unanswered[target.corner]++;
        if (shouldRefereeStop(target, ctx.referee.stoppageTrigger, state.unanswered[target.corner])) {
          emit('groundStrikes', say.groundStrikesText(rng, actor, true), actor.corner, 'critical');
          return { seconds: 10, ending: { method: 'tko', winner: actor.corner } };
        }
      }
    }
    if (landed > 0) {
      state.stalledSeconds = 0;
      emit('groundStrikes', say.groundStrikesText(rng, actor, landed >= 3), actor.corner);
    } else {
      state.stalledSeconds += 15;
    }
    return maybeRefStandUp(ctx, rng.int(8, 16));
  }

  // Stall: control time without action. Effective on the cards, and a stand-up risk.
  state.stalledSeconds += 25;
  return maybeRefStandUp(ctx, rng.int(14, 26));
}

function resolveSubmission(
  ctx: ExchangeContext,
  actor: Combatant,
  target: Combatant,
  fromBottom: boolean,
): ExchangeOutcome {
  const { rng, state, tally, emit } = ctx;
  const dominance = GROUND_DOMINANCE[state.groundPosition];
  const name = rng.pick(say.SUBMISSIONS[state.groundPosition]);

  const reads: ReadKey[] = state.groundPosition === 'back' ? ['backTake'] : ['guillotine'];
  const bonus = prepBonus(target, actor, reads);

  const attack =
    fatiguedEffect(actor.attrs.submissions, 'submissions', actor.fatigue) *
    (fromBottom ? 0.75 : 0.6 + dominance) *
    (target.hurtSeconds > 0 ? 1.5 : 1);
  const defend =
    fatiguedEffect(target.derived.submissionDefence, 'submissions', target.fatigue) * (1 + bonus);

  actor.stats.submissionAttempts++;
  tally[actor.corner].submissionAttempts++;

  const edge = clamp01(attack / (attack + defend));
  const deep = rng.chance(edge);
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
    const finishChance = clamp01(SUBMISSION_FINISH_RATE * edge ** 3 * familiarity);
    if (rng.chance(finishChance)) {
      return { seconds: rng.int(8, 20), ending: { method: 'submission', winner: actor.corner, submissionName: name } };
    }
  }

  emit('submissionEscape', say.submissionEscapeText(rng, target), target.corner);
  // A failed submission from the bottom often costs position; from the top it costs little.
  if (fromBottom && rng.chance(0.35)) {
    const idx = GROUND_POSITIONS.indexOf(state.groundPosition);
    state.groundPosition = GROUND_POSITIONS[Math.min(idx + 1, GROUND_POSITIONS.length - 1)]!;
  }
  state.stalledSeconds = 0;
  return { seconds: rng.int(9, 18) };
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
  state.groundPosition = 'guard';
  state.stalledSeconds = 0;
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
