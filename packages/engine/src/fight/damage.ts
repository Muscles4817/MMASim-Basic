/**
 * Damage, knockdowns and the hurt state.
 *
 * Three damage regions with three genuinely different consequences (docs/03):
 *   head → erodes effective Durability, so later shots end fights; feeds career trauma
 *   body → accelerates fatigue and suppresses recovery: the slow way to break someone
 *   legs → cuts Speed, Kicking, Takedown Defence and mobility
 *
 * This is why a calf-kick plan against a wrestler is coherent strategy rather than merely
 * "less damage": you are removing the base he shoots from.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { traitMul } from '../domain/traits.js';
import { effect, fatiguedEffect, ratingEffect } from '../ratings/curve.js';
import { effectiveDurability, type Combatant } from './profile.js';
import type { StrikeTarget } from './types.js';

/** Damage points applied by a fully-clean strike from a Power-50 fighter, per region. */
const BASE_DAMAGE: Readonly<Record<StrikeTarget, number>> = {
  head: 2.2,
  body: 2.6,
  legs: 2.4,
};

/**
 * Baseline knockdown probability per clean head strike, average power vs average chin.
 *
 * Tuned against `tests/statistical/roster-profile.test.ts`, which profiles the roster the
 * game actually ships rather than the synthetic archetypes the balance suite uses. Change
 * this and that suite is the thing that tells you whether the whole game still works.
 *
 * Was 0.026 against a 6.5-strike referee threshold, which produced a sport that finished
 * 77.7% of its fights. See the calibration note on `shouldRefereeStop` below.
 */
export const BASE_KD_HAZARD = 0.019;

/**
 * Power is raised to this before the ratio is taken.
 *
 * A plain effect ratio already separates elite from average; this extra exponent is what
 * separates *all-time* from elite — the difference between "dangerous" and "the fight ends
 * the instant he touches you". See design pillar 3.
 */
const POWER_SUPERLINEARITY = 1.50;

/** Seconds a fighter stays in the hurt state after being badly rocked, before modifiers. */
const BASE_HURT_SECONDS = 14;

export interface StrikeOutcome {
  damage: number;
  /** 0–1 how flush it landed. Drives both damage and knockdown hazard. */
  flushness: number;
  knockdown: boolean;
  /** True if this strike put them into (or extended) the hurt state without dropping them. */
  hurt: boolean;
}

/**
 * How flush a landed strike is.
 *
 * Mean 1.0 with a heavy right tail: most landed shots are glancing or partially blocked,
 * and occasionally something lands perfectly. Squaring a uniform draw gives that shape
 * cheaply and keeps the tail fat enough that flush shots stay genuinely dangerous.
 */
export function rollFlushness(rng: Rng, attacker: Combatant, defender: Combatant): number {
  const u = rng.next();
  const base = 0.25 + u * u * 2.25;

  // Accuracy and defensive craft shift where in that distribution you tend to land.
  //
  // The exponent is deliberately small. Striking skill already decides *whether* a strike
  // lands; letting it also strongly decide how flush it lands stacks a second multiplier on
  // the same attribute, and since flushness feeds knockdown hazard which feeds the hurt
  // state which feeds hazard again, a modest accuracy edge compounds into a near-certain
  // knockout. Landing more often is the reward for accuracy; landing harder is Power's job.
  const accuracy = fatiguedEffect(attacker.attrs.strikingOffence, 'strikingOffence', attacker.fatigue);
  const evasion = fatiguedEffect(defender.attrs.strikingDefence, 'strikingDefence', defender.fatigue);
  const skew = clamp((accuracy / evasion) ** 0.18, 0.75, 1.35);

  return clamp(base * skew, 0.15, 3.0);
}

/** Damage dealt by a landed strike, before it is applied. */
export function strikeDamage(
  attacker: Combatant,
  target: StrikeTarget,
  flushness: number,
): number {
  const power = fatiguedEffect(attacker.attrs.power, 'power', attacker.fatigue);
  // Rehydrating well above the limit is real, transferable force.
  const size = effect(50 + attacker.sizeAdvantage, 1.6) / effect(50, 1.6);
  return BASE_DAMAGE[target] * power * size * flushness;
}

/**
 * Probability that a clean head strike drops the opponent.
 *
 * This equation is where design pillar 3 lives. With Power on a K=1.6 curve raised to 1.15
 * and Durability on a gentler K=1.2 curve, an all-time power outlier generates roughly five
 * times the hazard of an average fighter, while even a world-class chin only halves it.
 * The maths says: no chin fully solves that man, which is the intended statement.
 */
export function knockdownHazard(
  attacker: Combatant,
  defender: Combatant,
  target: StrikeTarget,
  flushness: number,
): number {
  if (target !== 'head') return 0;

  const power =
    fatiguedEffect(attacker.attrs.power, 'power', attacker.fatigue) ** POWER_SUPERLINEARITY;
  const size = effect(50 + attacker.sizeAdvantage, 1.6) / effect(50, 1.6);
  // Read through the attribute's declared convexity so there is one source of truth.
  const chin = ratingEffect(effectiveDurability(defender), 'durability');

  // Accumulated damage compounds: the tenth clean shot lands on a worse chin than the first.
  const accumulation = 1 + defender.damage.head / 90;
  // Being already hurt is by far the most dangerous state in a fight. Kept deliberately
  // moderate: this multiplier compounds with the hurt-window roll below, and a large value
  // here makes every wobble a death sentence and every accuracy edge a knockout edge.
  const alreadyHurt = defender.hurtSeconds > 0 ? 1.8 : 1;

  return clamp01(
    BASE_KD_HAZARD * (power / chin) * size * flushness * accumulation * alreadyHurt,
  );
}

/** Apply a landed strike: mutates the defender's damage meters and returns what happened. */
export function applyStrike(
  rng: Rng,
  attacker: Combatant,
  defender: Combatant,
  target: StrikeTarget,
): StrikeOutcome {
  const flushness = rollFlushness(rng, attacker, defender);
  const damage = strikeDamage(attacker, target, flushness);

  defender.damage[target] = clamp(defender.damage[target] + damage, 0, 100);
  attacker.stats.damageDealt += damage;
  attacker.stats.strikesByTarget[target]++;

  if (target === 'head') {
    // Rate tuned against the long-sim suite: a full twenty-year career should leave a
    // busy fighter visibly damaged without the whole roster degrading into glass.
    defender.traumaIncrement +=
      damage * 0.032 * traitMul(defender.fighter.traits, 'headTraumaRate');
  }

  const knockdown = rng.chance(knockdownHazard(attacker, defender, target, flushness));

  // A shot short of a knockdown can still rock someone — a separate, lower hazard that only
  // opens the hurt window rather than putting them on the mat.
  const hurt =
    !knockdown &&
    target === 'head' &&
    rng.chance(knockdownHazard(attacker, defender, target, flushness) * 1.5);

  if (knockdown) {
    defender.knockdownsSuffered++;
    attacker.stats.knockdowns++;
    // Max, not assignment: a second knockdown on a fighter who is already badly hurt must
    // never shorten the window they are in.
    defender.hurtSeconds = Math.max(defender.hurtSeconds, hurtDuration(defender) * 1.4);
  } else if (hurt) {
    defender.hurtSeconds = Math.max(defender.hurtSeconds, hurtDuration(defender));
  }

  return { damage, flushness, knockdown, hurt };
}

/** How long this fighter stays compromised after being rocked. */
export function hurtDuration(c: Combatant): number {
  // Composure and Recovery both shorten it; being deep into a fight lengthens it.
  const composure = effect(c.attrs.composure, 0.9);
  const recovery = effect(c.fighter.naturals.recovery, 0.9);
  const fatigueDrag = 1 + c.fatigue * 0.8;
  return clamp((BASE_HURT_SECONDS / (composure * recovery) ** 0.5) * fatigueDrag, 4, 45);
}

/** Tick the transient hurt state forward. */
export function decayHurt(c: Combatant, seconds: number): void {
  if (c.hurtSeconds <= 0) return;
  c.hurtSeconds = Math.max(0, c.hurtSeconds - seconds);
}

/**
 * Whether the referee stops it.
 *
 * `stoppageTrigger` is the referee's tendency, 1–100: low saves careers and draws "he was
 * still in it!" complaints, high produces highlight reels. A hurt fighter who keeps taking
 * shots is the trigger condition; cumulative damage alone never stops a fight, because in
 * this sport it does not.
 */
export function shouldRefereeStop(
  defender: Combatant,
  stoppageTrigger: number,
  consecutiveUnansweredStrikes: number,
): boolean {
  if (defender.hurtSeconds <= 0) return false;

  // Higher trigger = quicker to stop it. Threshold in unanswered strikes on a hurt fighter.
  //
  // Calibration note: this number governs how often a knockdown becomes a finish, which is
  // the single biggest driver of the population KO rate. Set it too high and knockdowns
  // become a scoring event that nobody ever loses from; too low and every wobble is a
  // stoppage. Three or four unanswered shots on a hurt opponent is the real-world mark.
  /*
   * How many unanswered shots on a hurt fighter before the referee steps in.
   *
   * Raised from 2.5–6.5 after measuring the *shipped roster* rather than the synthetic
   * archetypes the balance suite calibrates against. The seeded roster carries the high Power
   * and Durability values the effect curve is heavy-tailed in, so the population that plays
   * the game behaved nothing like the population under test: 77.7% finishes, 70% by KO, a
   * 8.4:1 KO-to-submission ratio and 44% of all fights ending in round one. Decisions were a
   * minority event and the entire judging system was mostly unreachable.
   *
   * This constant is the dominant lever on all four of those numbers — far more so than
   * BASE_KD_HAZARD, which mostly rescales without reshaping.
   *
   * Where it landed, and the honest gap. Measured across every same-division pairing on the
   * shipped roster:
   *
   *   |                    | before | now  | real sport |
   *   | finish rate        | 77.7%  | 61.5% | ~48%      |
   *   | decisions          | 21.7%  | 36.7% | ~52%      |
   *   | KO : submission    | 8.4:1  | 3.3:1 | ~1.8:1    |
   *   | first-round finish | 44%    | 32%   | ~16%      |
   *
   * Closer on every axis, all the way there on none. The residual is structural rather than a
   * matter of these constants: a (hazard × superlinearity × threshold) sweep could not close
   * it from anywhere in the grid, because every setting moves the roster and an even matchup
   * in the same direction. Reaching a real ~48% needs the *strike volume* feeding this counter
   * to come down, which is a change to the exchange model rather than to a coefficient.
   *
   * The one calibration that did match reality exactly — a flat BASE_KD_HAZARD of 0.0092 —
   * was rejected because it collapsed the bomber archetype's KO rate to ~40%. "Ngannou is
   * absurdly powerful and knocks almost everyone out once he catches them clean" is design
   * pillar 3, and a population average bought by deleting the tail is not a better sport.
   */
  const threshold = clamp(9.5 - (stoppageTrigger / 100) * 4, 5.5, 9.5);
  const damageUrgency = defender.damage.head / 100;
  return consecutiveUnansweredStrikes >= threshold * (1 - damageUrgency * 0.45);
}

/** Leg damage suppresses mobility, kicks and takedown defence. Returns a 0–1 multiplier. */
export function legImpairment(c: Combatant): number {
  return clamp(1 - (c.damage.legs / 100) * 0.35, 0.6, 1);
}

/** Body damage suppresses recovery and inflates fatigue accrual. Returns a multiplier ≥ 1. */
export function bodyDrag(c: Combatant): number {
  return 1 + (c.damage.body / 100) * 0.9;
}
