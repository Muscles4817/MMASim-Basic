/**
 * The round-level fight resolver — doc 27 § 9's option C, the **Reduced** level of detail.
 *
 * `simulateFight` costs ~650µs because it resolves about eighty-three exchanges, and doc 27 § 9.2
 * measured that none of that cost is narration: suppressing every string and every event object
 * bought a 1.0× speedup. The only way to make a fight cheaper is to compute fewer of them, and the
 * coarsest granularity at which a round is still a real unit — with a scorecard, a stoppage point
 * and a clock — is one resolution per round.
 *
 * **What it must produce**, and what it must not:
 *
 *   result, method, round, time, damage, fight stats, scorecards   ← yes
 *   play-by-play, commentary, per-strike facts, fouls              ← no
 *
 * That list is not a convenience. A fighter at Reduced can be **promoted to Full** the moment they
 * enter the player's orbit (doc 27 § 5.2), and promotion is only seamless if the state they carry
 * is the state the full simulator would have left them with. So this shares the *actual*
 * primitives — `createCombatant`, `strikeDamage`, `knockdownHazard`, `accrueFatigue`,
 * `recoverBetweenRounds`, `buildScorecards`, `readDecision` — rather than approximating them.
 * What it replaces is only the **loop**: where `simulate.ts` asks "what happens next?" eighty-three
 * times, this asks "how did that round go?" three times, and answers with the expectation plus its
 * variance instead of the path.
 *
 * The constants below are set from `tools/round-profile.ts`, which measures what a round of
 * `simulateFight` actually looks like across six matchups spanning the rating range. Every one of
 * them is a column of that table. `tests/statistical/reduced-fidelity.test.ts` is what holds them
 * there.
 *
 * ### What is deliberately given up
 *
 * **Fouls.** An eye poke is a play-by-play event with a recovery window attached, and both of those
 * are things this level does not have. Fights resolved here never end in a disqualification or a
 * no contest — roughly 0.4% of fights in the full model — and `fouls` comes back empty.
 *
 * **Path.** Two fighters who trade a knockdown each in round two produce the same round here as
 * two who traded them in round three, because the round is the unit. That is the whole trade.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import { createRng, type Rng } from '../core/rng.js';
import type { FighterId } from '../core/ids.js';
import type { FinishMethod } from '../domain/fighter.js';
import { defaultGamePlan, normaliseGamePlan, riskProfile } from '../domain/gameplan.js';
import {
  controlResistance,
  expectedRangeFailure,
  expectedRangeMix,
  grapplingAppetite,
  strikingAppetite,
  submissionAppetite,
} from './policy.js';
import { ENTRY_EASE, RANGE_HAZARD, REFERENCE_MIX, expectedKickShare } from './range.js';
import { defaultJudges, defaultReferee } from '../domain/officials.js';
import { traitMul } from '../domain/traits.js';
import { effect, fatiguedEffect } from '../ratings/curve.js';
import { WEAPON_PROFILE, knockdownHazard, legImpairment, strikeDamage } from './damage.js';
import {
  createCombatant,
  effectiveComposure,
  kickLean,
  momentumMultiplier,
  roundBiasMultiplier,
  strikeLean,
  targetMix,
  type Combatant,
} from './profile.js';
import { buildScorecards, emptyTally, readDecision, type RoundTally } from './scoring.js';
import { accrueFatigue, recoverBetweenRounds, workRate } from './stamina.js';
import type { FightConfig } from './simulate.js';
import {
  OTHER_CORNER,
  type Corner,
  type DamageReport,
  type ReducedFightResult,
} from './types.js';

const ROUND_SECONDS = 300;

/** Local alias so `controlShare` can fold a range table without importing the whole type surface. */
const RANGES_FOR_MIX = ['outside', 'boxing', 'pocket'] as const;

/** The roster's typical `kickLean`, so the weapon-hazard blend below is level-free. */
const REFERENCE_KICK_LEAN = 0.38;


/* --------------------------------------------------------------------------------------------
 * Calibration constants. Every one is a column of `tools/round-profile.ts`.
 * ------------------------------------------------------------------------------------------ */

/**
 * The scale of a round's striking output.
 *
 * Not itself a measured count — the measured count is 12.3, and this is the number that produces it
 * once `workRate` has taken its cut over three rounds. Setting it to 12.3 directly gave 9.5, which
 * is the same mistake as reading a fighter's round-one output off their card.
 *
 * Trimmed from 15.5 when the tactical layer landed, and the reason is worth recording because it
 * is not about this level of detail at all. `defaultGamePlan()` used to carry `approach: 'pressure'`
 * — a 1.25× multiplier on striking that every "unplanned" fight in the game silently ran on — and
 * removing it lowered the full simulator's volume by a few per cent. These constants are measured
 * *against* the full simulator, so the calibration moved with it. 15.5 would now over-state a
 * Reduced round by just over the 30% the parity suite allows on its two most lopsided matchups.
 */
const BASE_ATTEMPTS = 15.0;

/**
 * How much of a round the two fighters can spend in controlling positions.
 *
 * Two ceilings, because the measurements say two different things. No single fighter ever exceeded
 * 0.74 of a round in control — the contender over a can — and the two of them together never
 * exceeded 0.77, in a fight where one of them was doing all of it. Without the per-fighter ceiling
 * a dominant grappler simply took whatever the joint cap allowed, which pushed the grinder to 0.78
 * against a measured 0.68 and made the striker unable to win a fight he wins a quarter of.
 */
const MAX_CONTROL_PER_FIGHTER = 0.74;
const MAX_TOTAL_CONTROL = 0.77;

/**
 * How lopsided a round's grappling is once somebody has imposed it.
 *
 * 0 splits the round's control evenly between the two of them every time; 1 gives all of it to
 * whoever won the round's grappling. Set from what a one-sided round has to look like for a judge
 * to score it 10-8 — see the block that uses it.
 */
const CONTROL_SWING = 0.8;

/**
 * What a knockdown does to the *rest* of the round.
 *
 * A dropped fighter spends `hurtDuration` seconds — ten to twenty of the round's three hundred —
 * doing nothing but surviving, and the man who dropped them spends it swarming. At exchange
 * granularity that falls out of the loop. At round granularity it has to be stated, and it is not
 * cosmetic: a judge scores a round from *shares*, so whether a knockdown round is also a round the
 * scorer won everything else in decides whether it is a 10-9 or a 10-8, which decides whether cards
 * tie, which decides the draw rate.
 */
const KNOCKDOWN_DOMINANCE = 0.6;

/**
 * How much of a round's head damage the round's *average* shot had already met.
 *
 * Half, which is the arithmetic answer for a quantity accruing evenly through the round. A third
 * was tried on the theory that the knockdown which ends a round comes early in it, and it cost the
 * bomber a fifth of his knockdowns while barely touching two average fighters — so the low-end
 * excess it was meant to fix is not here, and this is not the place to correct it from.
 */
const MID_ROUND_ACCUMULATION = 0.5;

/**
 * Landed strikes in the sequence that ends a fight.
 *
 * `shouldRefereeStop` needs between five and nine unanswered shots on a hurt fighter, and not every
 * one of them lands cleanly. Four is what reproduces the damage and the knockdown count the full
 * model records in the eighty seconds the bomber's fights actually last.
 */
const FINISH_BURST_STRIKES = 4;

/** `damage.ts`'s own multiplier for a strike landing on a fighter who is already hurt. */
const ALREADY_HURT = 1.8;

/** Control share a wholly average fighter takes against another. Measured 0.32. */
const BASE_CONTROL = 0.33;

/** Takedown attempts per round at `BASE_CONTROL`. Measured 1.58. */
const BASE_TAKEDOWN_ATTEMPTS = 1.6;

/**
 * Submission attempts per round: `SUBMISSION_FLOOR + SUBMISSION_PER_CONTROL × control share`.
 *
 * **Nearly nothing to do with how good at submissions the fighter is**, which is the second
 * counter-intuitive thing in the table and the second one a first draft got backwards. Measured
 * attempts against the submissions rating that produced them:
 *
 *   contender 65 → 4.3    smotherer 78 → 3.3    grinder 62 → 2.7    journeyman 50 → 1.5
 *   guard player 92 → 1.2    striker 38 → 0.9    can 32 → 0.3
 *
 * The best submission fighter in the table attempts fewer than the worst grappler, because he
 * spends the round underneath. Attempts are bought with position; the rating buys **conversion**,
 * which is where `submissionChance` puts it. Scaling attempts by the rating as well paid the
 * specialist twice and had the guard player beating a smotherer 28% of the time against a measured
 * 8.7%.
 */
const SUBMISSION_FLOOR = 0.2;
const SUBMISSION_PER_CONTROL = 3.8;

/**
 * Where a fighter's landed strikes go, as shares that sum to one.
 *
 * Read from `targetMix` — the same function `simulate.ts` draws each individual shot from — rather
 * than from a flat constant, because the mix is what decides what a fighter's damage is *worth*.
 * A headhunter throws a third of the body work and `BASE_DAMAGE` pays 2.2 for a head shot against
 * 2.6 for a body shot, so a fixed 56/44 split had the bomber dealing 114 damage a round against a
 * measured 90: aiming high is not the same as hitting hard.
 */
function damageMix(a: Combatant): { head: number; body: number; legs: number } {
  const mix = targetMix(a);
  const total = mix.head + mix.body + mix.legs;
  if (total <= 0) return { head: 0.6, body: 0.25, legs: 0.15 };
  return { head: mix.head / total, body: mix.body / total, legs: mix.legs / total };
}

/**
 * How much of a fighter's above-the-waist work is thrown with a shin.
 *
 * `pickShot` sends every leg strike out as a kick and rolls `kickLean × 0.3` for the rest, which is
 * what this reproduces without the draw.
 */
const HIGH_KICK_SHARE = 0.3;

/**
 * Turning a knockdown into a stoppage: `FINISH_FLOOR + FINISH_PER_DAMAGE × damage this round`.
 *
 * This is the one place the round granularity genuinely loses information, so it is the one place
 * the model is fitted rather than derived. A knockdown in the full simulator opens a
 * `hurtDuration` window in which the exchange loop swarms — the hurt fighter stops defending, the
 * attacker's accuracy jumps, and every follow-up carries `alreadyHurt` so a re-drop extends the
 * window again — and none of that is visible from a round's totals.
 *
 * So it is measured backwards. Solving `P(KO) = 1 − (1 − p)^knockdowns` across the six matchups of
 * `tools/round-profile.ts` gives the per-knockdown conversion the full model actually achieves,
 * and the predictor is **damage dealt per round**, almost exactly linearly:
 *
 *   | attacker (damage/round)      |  fitted p | measured p |
 *   | ---------------------------- | --------: | ---------: |
 *   | two average fighters (13.3)  |     0.105 |      0.105 |
 *   | smotherer (22.3)             |     0.148 |      0.121 |
 *   | striker (41.5)               |     0.240 |      0.238 |
 *   | contender (79.3)             |     0.420 |      0.419 |
 *   | bomber (89.9)                |     0.470 |      0.472 |
 *
 * Damage per round is power × accuracy × volume, which is exactly what fills a hurt window and
 * exactly what re-drops somebody, so the fit is not a coincidence — but it is a fit, and it is
 * why `reduced-fidelity.test.ts` asserts the KO rate rather than trusting the mechanism.
 *
 * The first attempt modelled the window explicitly, as `P(Poisson(landed × swarm × window) ≥
 * referee threshold)`. It was rejected by its own data: the grinder's Composure 78 and Recovery 85
 * give him the shortest hurt window of anybody in the table, so it predicted the striker converts
 * 2% of his knockdowns against a measured 24%. A defender's chin is already priced in — it is what
 * decides how many knockdowns there are at all — and pricing it a second time here double-counts it.
 */
const FINISH_FLOOR = 0.042;
const FINISH_PER_DAMAGE = 0.00477;

/**
 * How much a clear head is still worth once the fit above has had its say.
 *
 * Small on purpose. The exponent was set by what breaks: at 1.0 — a full hurt-window term — the
 * striker-versus-grinder cell is wrong by twelve times, and at 0 a fighter's Composure and Recovery
 * do nothing at all for them after they have been dropped, which is not true either.
 */
const HURT_WINDOW_EXPONENT = 0.3;

/**
 * The submission model is `simulate.ts`'s, unchanged: an attempt goes *deep* with probability
 * `edge`, and a deep one finishes at `SUBMISSION_FINISH_RATE × edge³ × familiarity`. Both
 * constants are that file's, and the shape is worth copying rather than approximating — the cube
 * is what keeps a genuine specialist dangerous while making an average grappler's attempt a
 * scoring event, and a first cut here that used a fitted power law instead had the guard player
 * submitting a smotherer three times as often as he does.
 */
const SUBMISSION_FINISH_RATE = 0.47;
const SUBMISSION_REPEAT_DECAY = 0.4;

/* --------------------------------------------------------------------------------------------
 * The round.
 * ------------------------------------------------------------------------------------------ */

/**
 * How much of the round this fighter spends in a controlling position.
 *
 * Two factors, because getting there and staying there are different skills and the sport is full
 * of people who can do one: `push` is whether they can impose the grappling at all, `hold` is
 * whether it stays imposed once it is. A wrestler who cannot hold produces scrambles, not control.
 */
function controlShare(a: Combatant, d: Combatant): number {
  /*
   * What they do, times what they were told to do.
   *
   * `tendencies` is the fighter; `grapplingAppetite` is the plan, read off the same alignment
   * table `simulate.ts` uses so the two levels of detail cannot disagree about what a plan means.
   * Clamped after the multiply rather than before, so a plan can push a middling grappler up to
   * the ceiling but never past it.
   */
  const wants = clamp01(
    ((a.tendencies.singleLeg +
      a.tendencies.doubleLeg +
      a.tendencies.fenceClinch +
      a.tendencies.bodyLock) /
      3) *
      grapplingAppetite(a),
  );

  /*
   * You still have to be close enough to shoot, at this level of detail too.
   *
   * `expectedRangeMix` is the same contest `simulate.ts` runs, collapsed to the share of the round
   * each range accounts for, so a rangy striker denies a wrestler entry in a bulk-simulated world
   * exactly as he does in one the player watches. Without it the two paths quietly produce
   * different sports — which this engine has already been caught doing once.
   */
  const mix = expectedRangeMix(a, d);
  const entryEase = RANGES_FOR_MIX.reduce((total, r) => total + ENTRY_EASE[r] * mix[r], 0);

  const push =
    (fatiguedEffect(a.derived.chainWrestling, 'wrestling', a.fatigue) * entryEase) /
    (fatiguedEffect(d.attrs.takedownDefence, 'takedownDefence', d.fatigue) * legImpairment(d));

  const hold =
    (fatiguedEffect(a.attrs.groundControl, 'groundControl', a.fatigue) +
      fatiguedEffect(a.derived.clinchOffence, 'strength', a.fatigue)) /
    ((fatiguedEffect(d.attrs.scrambling, 'scrambling', d.fatigue) +
      fatiguedEffect(d.derived.clinchDefence, 'takedownDefence', d.fatigue)) *
      // A man told to get up is a man you hold for less of the round.
      controlResistance(d));

  return clamp(
    BASE_CONTROL * (wants / 0.42) * push ** 0.9 * hold ** 0.8,
    0,
    MAX_CONTROL_PER_FIGHTER,
  );
}

/**
 * Who is dictating the exchanges.
 *
 * `simulate.ts` picks an initiative every exchange from Speed and Fight IQ, and the fighter who
 * wins it more often throws more of the round's strikes. At round granularity that is a share
 * rather than a draw, and it is the term that separates a contender from a can: without it the
 * two threw within 20% of each other, against a measured 24.4 to 5.2.
 */
function initiativeShare(a: Combatant, d: Combatant): number {
  const of = (c: Combatant) =>
    fatiguedEffect(c.attrs.speed, 'speed', c.fatigue) ** 0.6 *
    fatiguedEffect(c.attrs.fightIq, 'fightIq', c.fatigue) ** 0.4;
  const mine = of(a);
  return (2 * mine) / (mine + of(d));
}

/**
 * Significant strikes this fighter throws in the round.
 *
 * **Volume is a property of the situation, not of the striker.** That is the single most
 * counter-intuitive thing this table says, and it is not close: the striker throws 12.2 a round on
 * Striking 90 and Cardio 72, the journeyman throws 12.2 on fifty across, and the two fighters who
 * throw appreciably more — the contender at 24.2 and the bomber at 18.2 — do it because of who is
 * in front of them rather than because of what is on their card. Two earlier versions of this
 * function led with a cardio-driven "willingness" term and both had to be pulled: the first put the
 * contender at 44 attempts a round, and the shallower second still had the striker 40% over.
 *
 * So what is left is the four things that actually move it — how much gas is in the tank right now,
 * who is dictating, where the round is being fought, and whether the man opposite is still all
 * there. Cardio enters through `workRate` and nowhere else, which is the right number of times.
 */
function attemptsFor(
  a: Combatant,
  d: Combatant,
  ownControl: number,
  beingControlled: number,
  round: number,
  totalRounds: number,
  needsFinish: boolean,
): number {
  /*
   * Pressing a hurt opponent.
   *
   * `throwBurst` puts more shots in the air the moment somebody is compromised, and it is the
   * largest single term in the busiest matchup in the table: the bomber throws 18.2 a round against
   * a journeyman he has already hurt, on Cardio 42, which no willingness formula built out of
   * cardio can produce. Volume in this sport is not only how fit you are, it is whether the man in
   * front of you is still there.
   */
  const pressing = 1 + (d.damage.head / 100) * 0.28;

  const output =
    pressing *
    workRate(a, needsFinish) *
    roundBiasMultiplier(a, round, totalRounds) *
    momentumMultiplier(a) *
    initiativeShare(a, d) ** 0.7 *
    riskProfile(a.plan.riskLevel).exertion ** 0.5 *
    // Damped, because plenty of a grappler's volume comes from on top of somebody rather than
    // from choosing to strike at range, and `position` below already pays him for that.
    strikingAppetite(a) ** 0.35;

  /*
   * Top position is a place to work from; bottom position is a place to *survive* in — and how
   * much a fighter still throws from underneath is a question about who they are rather than about
   * how hard they are being held. See `strikeLean`: the striker and the guard player are pinned for
   * the same two thirds of a round and throw 12.4 against 4.8, which no single position penalty can
   * produce and this one does.
   */
  const underneath = 0.9 - strikeLean(a.fighter) * 0.85;
  const position = clamp(1 + ownControl * 0.26 - beingControlled * underneath, 0.3, 1.6);

  return Math.max(0, BASE_ATTEMPTS * output * position);
}

/** Share of attempted strikes that land. */
function accuracyFor(
  a: Combatant,
  d: Combatant,
  ownControl: number,
  beingControlled: number,
): number {
  const offence = fatiguedEffect(a.attrs.strikingOffence, 'strikingOffence', a.fatigue);
  const defence = fatiguedEffect(d.attrs.strikingDefence, 'strikingDefence', d.fatigue);
  // Somebody pinned underneath cannot slip anything; somebody on their back cannot land flush.
  const posture = 1 + ownControl * 0.28 - beingControlled * 0.3;
  return clamp(0.53 * (offence / defence) ** 0.45 * posture, 0.12, 0.84);
}

/**
 * How flush this fighter's shots land on this opponent, on average.
 *
 * `rollFlushness` is a mean-1.0 draw multiplied by two things that are not random — an accuracy
 * skew and the commitment the game plan's risk level buys — and dropping them was worth 40% of the
 * striker's knockdowns. Damage and knockdown hazard are both linear in flushness, so the
 * expectation is all this level needs, and it must feed both or an accurate fighter hits harder
 * without being any more dangerous.
 */
/**
 * The round's hazard multiplier, from where it was fought and what was thrown there.
 *
 * Two corrections in one function, and the second is older than range.
 *
 * `knockdownHazard` is called at this level with `'punch'` hardcoded, so **a kicker's extra
 * danger has never reached the Reduced resolver at all** — the weapon table makes a kick 1.5×
 * as hazardous as a punch and the round model always asked about a punch. That was a small gap
 * while every fighter threw roughly the same mix; range widened it, because a rangy kicker now
 * spends the fight where kicks are the suitable weapon. Measured, the striker against the
 * smotherer came out at 24.7% knockouts at Full and 12.3% at Reduced, past the 12-point
 * agreement the parity suite allows.
 *
 * So the hazard is blended by `kickLean` — the same function `simulate.ts` draws each shot's
 * weapon from — and then by the range mix, which is mean-1 by construction and therefore only
 * says *which* range is dangerous, never how dangerous the sport is.
 */
/**
 * How much a fighter's failed entries are worth to the man in front of him, *relative to how
 * often anybody fails*.
 *
 * Shape-only, and the sixth time in this change a table of multipliers had to be turned from a
 * level into a shape. Nearly every pairing in the game fails an entry at about the same rate —
 * the fight keeps being reset to `outside` and roughly half of the walks back in do not come off
 * — so an absolute term reads 1.10 for everybody, which is not a differentiator, it is a hazard
 * rise for the whole sport. It showed up as the bomber finishing a round and a half early at
 * Reduced against a Full that took two.
 *
 * Referenced against `REFERENCE_ENTRY_FAILURE` it says only what it should: this pairing is one
 * where somebody spends the fight failing to impose a range, and the other man is eating him
 * alive on the way in.
 */
const FAILED_ENTRY_HAZARD = 0.6;

/** What a pairing with no particular range disagreement fails at. Measured, not chosen. */
const REFERENCE_ENTRY_FAILURE = 0.16;

function rangeHazardFor(a: Combatant, d: Combatant): number {
  const mix = expectedRangeMix(a, d);
  const positional = RANGES_FOR_MIX.reduce((total, r) => total + RANGE_HAZARD[r] * mix[r], 0);
  /*
   * The third correction, and the one range added: `a` is more dangerous in proportion to how
   * often `d` fails to get the range he wants, because in Full a failed entry is what buys the
   * counter that hurts people.
   *
   * The weight is measured rather than derived. Full punishes a failed entry by 1.30–1.45 on the
   * counter, but only that counter, in only that exchange — deriving the round-level equivalent
   * would mean modelling what share of a round's hazard-bearing volume is counters, which Reduced
   * deliberately does not track. `smotherer-v-striker` is the parity suite's worst case for this,
   * two men wanting opposite ranges for fifteen minutes, and it read 25.2% knockouts at Full
   * against 12.9% at Reduced before this term existed. It is near zero wherever the two men want
   * the same range, which is most of the roster and the whole reason it can be sized on the worst
   * case without moving everything else.
   */
  const punished =
    1 + (expectedRangeFailure(d, a) - REFERENCE_ENTRY_FAILURE) * FAILED_ENTRY_HAZARD;
  /*
   * Divided through by the same blend at the roster's typical lean, so this says *who* is more
   * dangerous and not *how dangerous the sport is* — the third time in this change that a table
   * of multipliers had to be turned from a level into a shape, and the same failure each time:
   * a bare blend of 1.0 and 1.5 hands every fighter in the game a hazard bonus.
   */
  /*
   * The weapon mix a fighter *realises* where he is actually standing, not the one his attributes
   * would suggest in the abstract. `kickLean` answers "what does this man reach for"; the fight
   * asks "and what is available when he reaches", and only the second one lands.
   *
   * Divided through by the same fighter's shot selection thrown by a roster-typical leaner at a
   * roster-typical range mix — a *per-fighter* reference rather than one constant for everybody.
   * A single constant cannot be right here, and getting it wrong is the level-versus-shape trap
   * this change fell into four separate times: a fighter who works the legs kicks more than one
   * who works the head no matter what his lean is, because nobody punches a leg, so a global
   * reference computed at an even target mix sat at 0.563 and quietly taxed every head-hunter in
   * the game. Holding the target mix fixed across numerator and denominator cancels it, and
   * leaves exactly the two things this term is for: who prefers his feet, and where he is
   * standing.
   */
  const targets = targetMix(a);
  const blend = (lean: number) =>
    (1 - lean) * WEAPON_PROFILE.punch.hazard + lean * WEAPON_PROFILE.kick.hazard;
  const feet = expectedKickShare(kickLean(a), targets, mix);
  const reference = expectedKickShare(REFERENCE_KICK_LEAN, targets, REFERENCE_MIX);
  return positional * punished * (blend(feet) / blend(reference));
}

function expectedFlush(a: Combatant, d: Combatant, weapon: 'punch' | 'kick'): number {
  const attribute = weapon === 'kick' ? 'kicking' : 'strikingOffence';
  const accuracy = fatiguedEffect(a.attrs[attribute], attribute, a.fatigue);
  const evasion = fatiguedEffect(d.attrs.strikingDefence, 'strikingDefence', d.fatigue);
  const skew = clamp((accuracy / evasion) ** 0.18, 0.75, 1.35);
  return clamp(skew * riskProfile(a.plan.riskLevel).commitment, 0.15, 3);
}

interface CornerRound {
  attempts: number;
  landed: number;
  headLanded: number;
  damage: number;
  byRegion: { head: number; body: number; legs: number };
  knockdowns: number;
  takedownsAttempted: number;
  takedownsLanded: number;
  submissionAttempts: number;
  controlSeconds: number;
}

interface RoundEnding {
  method: FinishMethod;
  winner: Corner;
  /** Seconds into the round. */
  at: number;
}

/**
 * Sample a count around an expectation, with the spread a round's worth of exchanges has.
 *
 * Not a Poisson draw: the full model's per-round counts are far tighter than Poisson, because the
 * clock bounds them — a round has room for about a dozen strikes whatever the dice say. A normal
 * with sd proportional to sqrt(mean), floored at zero, matches the measured spread and costs one
 * `normal()`.
 */
/**
 * Round to an integer without losing the mean.
 *
 * `Math.round` on a count whose expectation is 0.06 gives zero almost always and its expectation is
 * not 0.06 — it is whatever fraction of the noise clears 0.5, which measured 15% low on knockdowns
 * across every matchup where they are rare. That is most of them.
 */
function stochasticRound(rng: Rng, value: number): number {
  const floor = Math.floor(value);
  return floor + (rng.next() < value - floor ? 1 : 0);
}

/**
 * A count of independent rare events — Knuth, and λ never leaves single digits here.
 *
 * Knockdowns are exactly this: N head strikes, each with its own small hazard. They were drawn
 * through `around` and it was silently wrong in the one place it mattered. `around` floors its
 * normal draw at zero, and for a mean of 0.083 with a standard deviation of 0.317 that truncation
 * does not merely reshape the distribution, it **more than doubles its mean** — two average
 * fighters came out at 0.62 knockdowns a fight against a measured 0.46, and the knockout rate
 * followed it. A distribution that cannot go negative must not be made out of one that can.
 */
function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 12) return Math.max(0, Math.round(lambda + rng.normal() * Math.sqrt(lambda)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = rng.next();
  while (product > limit && k < 40) {
    k++;
    product *= rng.next();
  }
  return k;
}

function around(rng: Rng, mean: number, spread = 0.55): number {
  if (mean <= 0) return 0;
  return Math.max(0, mean + rng.normal() * spread * Math.sqrt(mean));
}

/**
 * `FightConfig` minus the round length, which this level does not vary — the round is its unit, and
 * a resolver calibrated on five-minute rounds has nothing to say about three-minute ones.
 */
export type ReducedFightConfig = Omit<FightConfig, 'roundSeconds'>;

export function resolveFightByRound(config: ReducedFightConfig): ReducedFightResult {
  const rounds = config.rounds ?? 3;
  const referee = config.referee ?? defaultReferee();
  const judges = config.judges ?? defaultJudges();
  const rng = createRng(config.seed ?? `bout:${config.boutId}`).fork('reduced');

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

  const tallies: Record<Corner, RoundTally>[] = [];
  const subAttemptsSoFar: Record<Corner, number> = { red: 0, blue: 0 };

  let ending: RoundEnding | undefined;
  let endRound: number = rounds;
  let endTime = ROUND_SECONDS;

  for (let round = 1; round <= rounds && !ending; round++) {
    const roundRng = rng.fork(`r${round}`);
    const tally: Record<Corner, RoundTally> = { red: emptyTally(), blue: emptyTally() };
    tallies.push(tally);

    /*
     * --- Where the round was fought ------------------------------------------------------
     *
     * One fighter imposes the grappling in a round and the other mostly does not. That is how the
     * sport works — whoever gets the takedown holds them there — and modelling it as a smooth split
     * of the two men's pulling power was wrong in a way that showed up somewhere unexpected: with
     * both corners on ninety seconds of control every round of every fight, no judge ever saw a
     * one-sided round, **no round ever scored 10-8, and no fight ever ended in a draw** against a
     * measured 9.1% between two clones.
     *
     * So the pulls decide *who* imposes it, with a draw, and `CONTROL_SWING` decides how lopsided
     * the round is once they have. The expectation is unchanged — two even fighters still average
     * a third of the round each — and only the variance is right now.
     */
    const redPull = controlShare(red, blue);
    const bluePull = controlShare(blue, red);
    const pull = redPull + bluePull;
    const redImposes = pull <= 0 ? roundRng.chance(0.5) : roundRng.chance(redPull / pull);
    const swing = clamp(CONTROL_SWING * (1 + roundRng.normal() * 0.3), 0, 0.95);
    let cRed = pull * (redImposes ? (1 + swing) / 2 : (1 - swing) / 2);
    let cBlue = pull - cRed;
    cRed = Math.min(cRed, MAX_CONTROL_PER_FIGHTER);
    cBlue = Math.min(cBlue, MAX_CONTROL_PER_FIGHTER);
    const total = cRed + cBlue;
    if (total > MAX_TOTAL_CONTROL) {
      cRed = (cRed / total) * MAX_TOTAL_CONTROL;
      cBlue = (cBlue / total) * MAX_TOTAL_CONTROL;
    }
    const share: Record<Corner, number> = { red: cRed, blue: cBlue };
    const distanceSeconds = (1 - cRed - cBlue) * ROUND_SECONDS;

    // --- What each of them did with it ----------------------------------------------------
    const work = {} as Record<Corner, CornerRound>;
    for (const corner of ['red', 'blue'] as const) {
      const a = corners[corner];
      const d = corners[OTHER_CORNER[corner]];
      const own = share[corner];
      const under = share[OTHER_CORNER[corner]];

      // Behind on the cards and running out of rounds: the desperation term the full model
      // reads out of `scoreSoFar`.
      const needsFinish = round === rounds && a.momentum < -0.2;

      /*
       * How he showed up tonight, for this round.
       *
       * The full model's round-to-round variance comes from eighty-three independent exchanges;
       * this level has one, so without a form term every round of a fight is won by the same
       * fighter by the same margin — and the visible consequence was that **no fight ever ended in
       * a draw**, against a measured 9.8% between two clones. Draws come from cards that disagree,
       * and cards only disagree when rounds do.
       */
      const form = 1 + roundRng.normal() * 0.16;
      const attempts = Math.max(
        0,
        around(roundRng, attemptsFor(a, d, own, under, round, rounds, needsFinish) * form),
      );
      const landed = Math.min(
        attempts,
        around(roundRng, attempts * accuracyFor(a, d, own, under), 0.35),
      );
      const headLanded = landed * damageMix(a).head;

      // Damage. Mean flushness is 1.0 by construction (`rollFlushness`), so the expectation is
      // one strike's damage times the count — the variance that matters lives in the count and
      // in the knockdown rolls, not here.
      const mix = damageMix(a);
      const highKick = kickLean(a) * HIGH_KICK_SHARE;
      const fistFlush = expectedFlush(a, d, 'punch');
      const shinFlush = expectedFlush(a, d, 'kick');
      const byRegion = {
        head:
          landed *
          mix.head *
          (strikeDamage(a, 'head', fistFlush, 'punch') * (1 - highKick) +
            strikeDamage(a, 'head', shinFlush, 'kick') * highKick),
        body:
          landed *
          mix.body *
          (strikeDamage(a, 'body', fistFlush, 'punch') * (1 - highKick) +
            strikeDamage(a, 'body', shinFlush, 'kick') * highKick),
        legs: landed * mix.legs * strikeDamage(a, 'legs', shinFlush, 'kick'),
      };
      /*
       * How flush the round's shots were, as one draw.
       *
       * `rollFlushness` has mean 1.0 and standard deviation 0.67, so a round of L landed strikes
       * carries about `0.67 / sqrt(L)` of relative noise on top of the count — a quarter of the
       * total at seven landed. Without it a round's damage is a smooth function of two fighters'
       * ratings, and smooth damage is the other reason nothing drew: 10-8 rounds need a round that
       * went badly, and every round went averagely.
       */
      const flush = Math.max(0.25, 1 + roundRng.normal() * (0.67 / Math.sqrt(Math.max(1, landed))));
      byRegion.head *= flush;
      byRegion.body *= flush;
      byRegion.legs *= flush;
      const damage = byRegion.head + byRegion.body + byRegion.legs;

      /*
       * **Wanting it buys attempts, not takedowns** — the same separation `simulate.ts` enforces
       * by leaving every contest untouched, stated at this level of detail.
       *
       * `own` is control share *after* the plan has pushed on it, so deriving both the attempt
       * count and the conversion rate from it paid a committed wrestler twice: he shot more and
       * landed a higher share of what he shot. Measured against the full simulator, that is
       * precisely backwards — a fighter chasing takedowns against somebody expecting them
       * converts *worse*, not better.
       *
       * So attempts scale with the plan and conversion reads the control share the fighter would
       * have had without it. A 25-wrestling fighter told to take it to the floor now shoots all
       * night at this level too, and still does not get anybody down.
       */
      const grapple = own / Math.max(BASE_CONTROL, 0.05);
      const takedownsAttempted = around(roundRng, BASE_TAKEDOWN_ATTEMPTS * grapple ** 0.7, 0.4);
      const unplanned = own / Math.max(0.2, grapplingAppetite(a));
      const takedownsLanded = takedownsAttempted * clamp01(0.35 + unplanned * 0.75);
      /*
       * A guard player is dangerous off his back, so a *little* of it comes from being underneath
       * — and the two positions read different halves of the plan, because "hunt from top" and
       * "attack off your back" are different instructions and `simulate.ts` treats them as such.
       */
      const submissionAttempts = around(
        roundRng,
        (SUBMISSION_FLOOR +
          SUBMISSION_PER_CONTROL *
            (own * submissionAppetite(a, true) + under * 0.15 * submissionAppetite(a, false))) *
          (0.75 + a.tendencies.backTake * 0.5),
        0.4,
      );

      work[corner] = {
        attempts,
        landed,
        headLanded,
        damage,
        byRegion,
        knockdowns: 0,
        takedownsAttempted,
        takedownsLanded,
        submissionAttempts,
        controlSeconds: own * ROUND_SECONDS,
      };
    }

    // --- Did anybody finish it, and when --------------------------------------------------
    //
    // Before the round is *booked*, not after. A knockout forty seconds in must not credit either
    // fighter with five minutes of work: the first version applied the whole round and then ended
    // it, which inflated every per-round rate in the fastest matchups by a factor of three and
    // made a fight that finished early look like the busiest round in the sport.
    for (const corner of ['red', 'blue'] as const) {
      const a = corners[corner];
      const d = corners[OTHER_CORNER[corner]];
      const w = work[corner];

      /*
       * The hazard the round's *average* shot met, not the hazard its first one did.
       *
       * `knockdownHazard` compounds on accumulated head damage — the tenth clean shot lands on a
       * worse chin than the first — so evaluating it at the state the round opened in
       * systematically under-counts. The bomber came out at 2.2 knockdowns a fight against a
       * measured 2.8 for exactly this reason. Half the round's head damage is booked, the hazard
       * is read there, and the rest follows below.
       */
      const half = w.byRegion.head * MID_ROUND_ACCUMULATION;
      d.damage.head = clamp(d.damage.head + half, 0, 100);
      const hazard =
        knockdownHazard(a, d, 'head', expectedFlush(a, d, 'punch'), 'punch') * rangeHazardFor(a, d);
      d.damage.head -= Math.min(half, d.damage.head);
      w.knockdowns = poisson(roundRng, w.headLanded * hazard);

      /*
       * Each knockdown at its own moment in the round, in order.
       *
       * Not a fresh uniform draw per knockdown, which is what this did first and which is wrong in
       * a way that only showed up two columns away. Taking the earliest of three independent
       * uniforms puts the finish a third of the way into the round on average, so the bomber's
       * fights ended at 1.29 rounds against a measured 1.54 — and because the round's stats are
       * prorated to the finish, every per-round rate in that matchup came out nearly double.
       * Knockdowns are spread through a round; the finish is the first one the referee acts on.
       */
      for (let k = 0; k < w.knockdowns; k++) {
        if (!roundRng.chance(strikeFinishChance(a, d, w.damage, referee.stoppageTrigger))) continue;
        const at = ((k + roundRng.next()) / w.knockdowns) * ROUND_SECONDS;
        /*
         * The ones after it never happened.
         *
         * A round's hazard says how many times this fighter *would* drop the other over five
         * minutes; the fight stops at the first one the referee acts on, so the count the fight
         * records is the index of that one. Prorating the full count by the clock instead — which
         * is right for strikes, control and damage, all of which accrue evenly — took the bomber
         * from 2.7 knockdowns a fight to 1.3, because his rounds end early and his hazard is high.
         */
        w.knockdowns = k + 1;
        if (!ending || at < ending.at) ending = { method: 'tko', winner: corner, at };
        break;
      }

      const perAttempt = submissionChance(
        a,
        d,
        share[corner],
        share[corner] >= share[OTHER_CORNER[corner]],
      );
      const attempts = Math.round(w.submissionAttempts);
      for (let s = 0; s < attempts; s++) {
        const familiarity = 1 / (1 + SUBMISSION_REPEAT_DECAY * subAttemptsSoFar[corner]);
        subAttemptsSoFar[corner] += 1;
        if (roundRng.chance(perAttempt * familiarity)) {
          const at = ((s + roundRng.next()) / attempts) * ROUND_SECONDS;
          if (!ending || at < ending.at) ending = { method: 'submission', winner: corner, at };
          break;
        }
      }
    }

    // A knockdown takes the round with it. See `KNOCKDOWN_DOMINANCE`.
    for (const corner of ['red', 'blue'] as const) {
      const w = work[corner];
      if (w.knockdowns <= 0) continue;
      const v = work[OTHER_CORNER[corner]];
      const lift = 1 + KNOCKDOWN_DOMINANCE * w.knockdowns;
      const sink = Math.max(0.15, 1 - KNOCKDOWN_DOMINANCE * 1.4 * w.knockdowns);
      w.attempts *= lift;
      w.landed *= lift;
      w.damage *= lift;
      w.byRegion.head *= lift;
      w.byRegion.body *= lift;
      w.byRegion.legs *= lift;
      v.attempts *= sink;
      v.landed *= sink;
      v.damage *= sink;
      v.byRegion.head *= sink;
      v.byRegion.body *= sink;
      v.byRegion.legs *= sink;
      // Half, not all: a knockdown ends the grappling the victim was doing, it does not
      // retrospectively undo the two minutes of it they had already banked.
      const grapplingSink = (1 + sink) / 2;
      v.controlSeconds *= grapplingSink;
      v.takedownsLanded *= grapplingSink;
      v.submissionAttempts *= grapplingSink;
    }

    // Everything the round produced is booked for as long as the round actually lasted.
    const lasted = ending ? clamp(ending.at, 5, ROUND_SECONDS) / ROUND_SECONDS : 1;
    if (lasted < 1) {
      for (const corner of ['red', 'blue'] as const) {
        const w = work[corner];
        /*
         * Knockdowns prorate only for the corner that did not end it — the finisher's count was
         * already truncated at the one that did, above. Without any proration at all the bomber
         * left the cage credited with five knockdowns a fight against a measured 2.8, having been
         * given a full round's worth for a round he ended in forty seconds.
         */
        // A corner that did not finish the fight only had the round the fight allowed it.
        const finisher = ending?.winner === corner;
        if (!finisher) w.knockdowns = stochasticRound(roundRng, w.knockdowns * lasted);
        w.attempts *= lasted;
        w.landed *= lasted;
        w.headLanded *= lasted;
        w.damage *= lasted;
        w.byRegion.head *= lasted;
        w.byRegion.body *= lasted;
        w.byRegion.legs *= lasted;
        w.takedownsAttempted *= lasted;
        w.takedownsLanded *= lasted;
        w.submissionAttempts *= lasted;
        w.controlSeconds *= lasted;
      }
    }

    /*
     * The finishing sequence, which the clock does not contain.
     *
     * A stoppage is not the moment a round stops accruing — it is a burst of unanswered strikes on
     * a fighter who has stopped defending, and `shouldRefereeStop` needs five to nine of them
     * before it waves anything off. At exchange granularity that is just more loop. Here the round
     * has already been prorated to the finish, so without this the bomber left the cage having dealt
     * 44 head damage against a measured 68 and scored 1.3 knockdowns against 2.7: **most of what a
     * knockout does to somebody happens after the knockdown that caused it.**
     *
     * The burst is charged at the same hazard the rest of the round was, times `alreadyHurt` —
     * `damage.ts`'s own multiplier for a fighter who is already compromised — so a power outlier
     * chains re-drops inside it and an average fighter mostly just lands.
     */
    if (ending?.method === 'tko') {
      const a = corners[ending.winner];
      const d = corners[OTHER_CORNER[ending.winner]];
      const w = work[ending.winner];
      if (w.landed > 0) {
        const perStrike = w.byRegion.head / Math.max(1e-6, w.landed * damageMix(a).head);
        const burstHead = FINISH_BURST_STRIKES * damageMix(a).head;
        w.landed += FINISH_BURST_STRIKES;
        w.attempts += FINISH_BURST_STRIKES * 1.35;
        w.byRegion.head += burstHead * perStrike;
        w.damage += burstHead * perStrike;
        w.knockdowns += poisson(
          roundRng,
          burstHead *
            knockdownHazard(a, d, 'head', expectedFlush(a, d, 'punch'), 'punch') *
            rangeHazardFor(a, d) *
            ALREADY_HURT,
        );
      }
    }

    // --- Apply it -------------------------------------------------------------------------
    for (const corner of ['red', 'blue'] as const) {
      const a = corners[corner];
      const d = corners[OTHER_CORNER[corner]];
      const w = work[corner];

      // Damage lands on the meters in the proportions the strikes did, so `bodyDrag`,
      // `legImpairment` and `effectiveDurability` all read what they would have read.
      d.damage.head = clamp(d.damage.head + w.byRegion.head, 0, 100);
      d.damage.body = clamp(d.damage.body + w.byRegion.body, 0, 100);
      d.damage.legs = clamp(d.damage.legs + w.byRegion.legs, 0, 100);
      d.traumaIncrement += w.byRegion.head * 0.032 * traitMul(d.fighter.traits, 'headTraumaRate');

      a.stats.significantStrikesAttempted += w.attempts;
      a.stats.significantStrikesLanded += w.landed;
      a.stats.damageDealt += w.damage;
      a.stats.takedownsAttempted += w.takedownsAttempted;
      a.stats.takedownsLanded += w.takedownsLanded;
      a.stats.submissionAttempts += w.submissionAttempts;
      a.stats.controlSeconds += w.controlSeconds;
      a.stats.distanceSeconds += distanceSeconds * lasted;

      accrueFatigue(a, {
        position:
          share[corner] > 0.35 || share[OTHER_CORNER[corner]] > 0.35 ? 'ground' : 'distance',
        groundPosition: 'halfGuard',
        isControlled: share[OTHER_CORNER[corner]] > share[corner],
        intensity: clamp(w.attempts / lasted / BASE_ATTEMPTS, 0.3, 2),
        seconds: ROUND_SECONDS * lasted,
      });

      d.knockdownsSuffered += w.knockdowns;
      a.stats.knockdowns += w.knockdowns;
    }

    for (const corner of ['red', 'blue'] as const) {
      const w = work[corner];
      tally[corner] = {
        damageDealt: w.damage,
        significantStrikes: w.landed,
        controlSeconds: w.controlSeconds,
        takedowns: w.takedownsLanded,
        submissionAttempts: w.submissionAttempts,
        knockdowns: w.knockdowns,
        strikesAttempted: w.attempts,
      };
    }

    // Momentum, so the next round knows how this one went.
    const shift = clamp((work.red.damage - work.blue.damage) / 60, -0.6, 0.6);
    red.momentum = clamp(red.momentum * 0.5 + shift, -1, 1);
    blue.momentum = clamp(blue.momentum * 0.5 - shift, -1, 1);

    if (ending) {
      endRound = round;
      endTime = Math.round(ending.at);
      break;
    }

    if (round < rounds) {
      recoverBetweenRounds(red);
      recoverBetweenRounds(blue);
    }
  }

  // --- Read the result ------------------------------------------------------------------
  const scorecards = buildScorecards(
    { judges, rounds: tallies, deductions: { red: 0, blue: 0 } },
    rng.fork('scoring'),
  );

  let method: FinishMethod;
  let winnerId: FighterId | undefined;

  if (ending) {
    method = ending.method;
    winnerId = corners[ending.winner].fighter.id;
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
    endTime = ROUND_SECONDS;
  }

  return {
    boutId: config.boutId,
    redId: red.fighter.id,
    blueId: blue.fighter.id,
    winnerId,
    method,
    round: endRound,
    timeSeconds: endTime,
    scorecards,
    stats: { red: red.stats, blue: blue.stats },
    damage: { red: report(red, method, winnerId), blue: report(blue, method, winnerId) },
    // Fouls are a play-by-play event with a recovery window attached. This level has neither.
    fouls: [],
    deductions: { red: 0, blue: 0 },
  };
}

/**
 * Probability that one knockdown becomes a stoppage.
 *
 * The hurt window is the full model's, and so is the referee's threshold — what this replaces is
 * the exchange loop that would have filled the window. See `SWARM_MULTIPLIER`.
 */
function strikeFinishChance(
  a: Combatant,
  d: Combatant,
  damageThisRound: number,
  stoppageTrigger: number,
): number {
  const composure = effect(effectiveComposure(d), 0.9);
  const recovery = effect(d.fighter.naturals.recovery, 0.9);
  const window = ((14 / (composure * recovery) ** 0.5) * (1 + d.fatigue * 0.8)) / 14;

  // A referee quick to wave it off finishes more of them. `shouldRefereeStop`'s own scale.
  const officiating = clamp(9.5 - (stoppageTrigger / 100) * 4, 5.5, 9.5) / 7.5;

  return clamp01(
    ((FINISH_FLOOR + FINISH_PER_DAMAGE * damageThisRound) * window ** HURT_WINDOW_EXPONENT) /
      officiating,
  );
}

/**
 * Chance one attempt ends the fight — `resolveSubmission`'s own arithmetic, minus the position.
 *
 * `fromTop` stands in for the ground-position ladder: this level knows who is controlling the round
 * but not whether they are in mount or half guard, so the control share is mapped onto the same
 * `0.6 + dominance` range that ladder produces.
 */
function submissionChance(
  a: Combatant,
  d: Combatant,
  ownControl: number,
  fromTop: boolean,
): number {
  const attack =
    fatiguedEffect(a.attrs.submissions, 'submissions', a.fatigue) *
    (fromTop
      ? 0.6 + clamp(remap(ownControl, 0.05, MAX_CONTROL_PER_FIGHTER, 0.28, 0.7), 0.28, 0.7)
      : 0.75);
  const defend = fatiguedEffect(d.derived.submissionDefence, 'submissions', d.fatigue);
  const edge = clamp01(attack / (attack + defend));
  // The attempt has to go deep before it can finish, which is the first factor of the two.
  return edge * clamp01(SUBMISSION_FINISH_RATE * edge ** 3);
}

function report(c: Combatant, method: FinishMethod, winnerId?: FighterId): DamageReport {
  const lostByStrikes =
    winnerId !== c.fighter.id &&
    (method === 'ko' || method === 'tko' || method === 'doctorStoppage');
  return {
    headDamage: c.damage.head,
    bodyDamage: c.damage.body,
    legDamage: c.damage.legs,
    knockdownsSuffered: c.knockdownsSuffered,
    wasFinishedByStrikes: lostByStrikes,
    traumaIncrement: c.traumaIncrement * (lostByStrikes ? 1.6 : 1),
  };
}
