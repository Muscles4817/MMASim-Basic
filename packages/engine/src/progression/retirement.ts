/**
 * Retirement.
 *
 * Careers have to end, and they have to end for the right reasons. A fighter walks away
 * because of some combination of age, accumulated damage, a run of losses and a collapse in
 * self-belief — and how much each of those weighs depends on the person. A high-Resilience
 * fighter with high Ambition keeps going long past the point a fragile one would stop.
 *
 * Without this, a twenty-year world produces sixty-year-old contenders, which the long-sim
 * suite catches and this module fixes.
 */

import { ageOn, type GameDay } from '../core/clock.js';
import { clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';

/** Age at which decline begins to weigh on the decision at all. */
const DECLINE_AGE = 33;
/** Age past which almost nobody is still competing at a meaningful level. */
const HARD_AGE = 46;

/**
 * How strongly this fighter wants to walk away, 0–1.
 *
 * Not a probability — feed it to {@link shouldRetire}, which converts urge into a decision
 * on a per-fight basis. Keeping the two separate means the UI can show a fighter who is
 * "thinking about it" before they actually go.
 */
/**
 * The separate pressures behind a retirement decision, each 0–1 before weighting.
 *
 * Split out from {@link retirementUrge} so the *reason* can be read off the same arithmetic that
 * produced the *decision*. It could not before: `retirementReason` re-derived its answer from a
 * fixed set of thresholds — `confidence <= 20` among them — while the decision fired on the urge,
 * which is meaningfully non-zero long before any of those thresholds are crossed. A fighter who
 * quit at confidence 24 was told they had "retired on their own terms", which is the opposite of
 * what happened and the one thing the player most needs to understand. See docs/25 §1.3.
 */
export interface RetirementDrivers {
  age: number;
  trauma: number;
  wear: number;
  skid: number;
  confidence: number;
  /** Past {@link HARD_AGE}, where the personality discount stops applying. */
  overHard: number;
  /** The combined urge, 0–1 — what {@link retirementUrge} returns. */
  urge: number;
}

export function retirementDrivers(fighter: Fighter, onDay: GameDay): RetirementDrivers {
  const age = ageOn(fighter.birthDay, onDay);

  // Age is the dominant term and is deliberately steep past the hard age.
  const ageTerm = age < DECLINE_AGE ? 0 : clamp01(remap(age, DECLINE_AGE, HARD_AGE, 0, 0.85));
  const overHard = age > HARD_AGE ? clamp01((age - HARD_AGE) / 6) : 0;

  // Damage, and specifically the knowledge of it.
  const traumaTerm = clamp01(remap(fighter.condition.headTrauma, 45, 95, 0, 0.5));
  const wearTerm = clamp01(remap(fighter.condition.bodyWear, 50, 100, 0, 0.25));

  // A skid, and the confidence collapse that comes with it.
  const skid = Math.min(0, fighter.summary.streak);
  const skidTerm = clamp01(Math.abs(skid) / 5) * 0.35;
  const confidenceTerm = clamp01(remap(fighter.condition.confidence, 40, 5, 0, 0.4));

  // Personality decides how much of that a fighter is willing to sit with. Ambition keeps
  // them chasing; resilience keeps them from being talked out of it by a bad night.
  const stubbornness =
    clamp01(remap(fighter.personality.ambition, 10, 95, 0.6, 1.0)) *
    clamp01(remap(fighter.personality.resilience, 10, 95, 0.65, 1.0));

  const raw =
    (ageTerm + traumaTerm + wearTerm + skidTerm + confidenceTerm) * (2 - stubbornness) * 0.5;

  return {
    age: ageTerm,
    trauma: traumaTerm,
    wear: wearTerm,
    skid: skidTerm,
    confidence: confidenceTerm,
    overHard,
    // Past the hard age the personality discount stops applying: bodies do not negotiate.
    urge: clamp01(Math.max(raw, overHard)),
  };
}

/**
 * How strongly this fighter wants to walk away, 0–1.
 *
 * Not a probability — feed it to {@link shouldRetire}, which converts urge into a decision
 * on a per-fight basis. Keeping the two separate means the UI can show a fighter who is
 * "thinking about it" before they actually go.
 */
export function retirementUrge(fighter: Fighter, onDay: GameDay): number {
  return retirementDrivers(fighter, onDay).urge;
}

/**
 * Whether this fighter retires now. Evaluated after a fight, not continuously.
 *
 * The urge is squared before it becomes a probability, so a fighter who is merely thinking
 * about it usually carries on and only a fighter who is genuinely finished actually stops.
 * That keeps the "one fight too many" story available, which is most of the drama.
 */
export function shouldRetire(fighter: Fighter, onDay: GameDay, rng: Rng): boolean {
  if (fighter.retiredDay !== undefined) return true;
  const urge = retirementUrge(fighter, onDay);
  return rng.chance(urge ** 2);
}

/**
 * Days out of the cage before a fighter is drifting rather than resting.
 *
 * Eighteen months, set from the world's own booking rate rather than from taste. The schedule
 * gives the average fighter a bout roughly every eleven months, so a year idle is an ordinary
 * trough rather than a career ending — but past eighteen months, most people who are going to
 * come back already have. Measured over ten world years it produces 469 retirements against the
 * 524 the sport was managing before the confidence fix removed the accidental mechanism that had
 * been carrying that load.
 */
export const DRIFT_GRACE_DAYS = 540;

/**
 * Ceiling on the per-quarter chance of drifting, before idleness, age and ambition scale it.
 *
 * Tuned against the turnover the sport needs rather than chosen: `replenish` generates exactly as
 * many fighters as retire, so this number *is* the rate at which the next generation arrives. At
 * 0.5 it emptied the roster; the target is a total turnover near 500 a decade, which is what the
 * world managed before the confidence fix removed the accidental mechanism that had been carrying
 * it.
 */
const DRIFT_PER_QUARTER = 0.12;

/**
 * How likely a fighter is to simply stop, evaluated quarterly. 0-1.
 *
 * The sport's most common ending, and until now the model could not produce it. `shouldRetire` is
 * only ever consulted **after a fight**, so a fighter who stopped getting booked never retired --
 * they sat on the roster ageing forever. Most professionals do not retire; they have a fight fall
 * through, then another, and one day it has been two years and nobody has called.
 *
 * That gap was hidden until the confidence model was fixed. Confidence used to be a one-way
 * ratchet with no recovery (docs/25 SS1), so the people who were not getting booked lost their
 * belief and retired quickly -- the right outcome reached by the wrong mechanism. Repairing
 * confidence removed the accident and left nothing in its place: measured over ten world years,
 * retirements fell from 524 to 305 and, because `world.ts:replenish` only tops a division back up
 * to its target, the intake fell with it from 501 new fighters to 294. The sport stopped renewing
 * itself. This is the mechanism that should have been carrying that load all along.
 *
 * Ambition is the axis that matters: it is what keeps somebody ringing their manager after a year
 * of nothing. Age compounds it, because a 36-year-old two years out is finished whether or not
 * anybody has said so.
 */
export function driftUrge(fighter: Fighter, onDay: GameDay): number {
  if (fighter.retiredDay !== undefined) return 0;

  /*
   * No recorded bouts means *fresh*, not *never*.
   *
   * The same rule `neglectDays` applies to `lastTrained`, and for the same reason. Every fighter
   * in both seeded worlds ships with an empty `record` — their history is backstory, not rows —
   * while `proDebutDay` runs back nineteen years before the save even starts. Measured against
   * the 2026 seed: judging idleness from the debut day gave **811 of 858 fighters** a non-zero
   * drift urge on the first day of a new game, so a new save would have quietly retired fifty-odd
   * of its own roster in the opening quarter, before the player had done anything at all.
   *
   * It costs the handful of generated fighters who are never booked, who now never drift. That is
   * the right way round: this mechanic exists to end careers that stalled, and a career that has
   * not started cannot have stalled.
   */
  if (fighter.record.length === 0) return 0;

  const last = fighter.record.reduce((latest, bout) => Math.max(latest, bout.day), 0);
  const since = onDay - last;
  if (since <= DRIFT_GRACE_DAYS) return 0;

  // Ramps over the following eighteen months rather than switching on.
  const idle = clamp01((since - DRIFT_GRACE_DAYS) / 730);
  const age = ageOn(fighter.birthDay, onDay);
  const ageTerm = clamp01(remap(age, 26, 40, 0.7, 1.4));
  const stillTrying = clamp01(remap(fighter.personality.ambition, 10, 95, 1.15, 0.55));

  /*
   * Whether anybody still wants them, which is most of what this mechanic is actually about.
   *
   * Drifting out is not something a fighter decides, it is something that happens to them when
   * the phone stops ringing — and it does not stop ringing for people who sell tickets. Without
   * this term the sweep was blind to standing and quietly ate the top of the sport: measured over
   * ten years, fighters rated 80 or better fell from the seeded eight to two, because a contender
   * who happened to go two years between bouts drifted out exactly as readily as a journeyman
   * nobody had called since their debut.
   *
   * Reputation rather than rating, deliberately. It is what the promotions themselves read, and a
   * former contender coming off two years out is still a name worth putting on a poster.
   */
  const stillWanted = clamp01(remap(fighter.reputation, 20, 80, 1.1, 0.25));

  return clamp01(idle * ageTerm * stillTrying * stillWanted * DRIFT_PER_QUARTER);
}

/**
 * Whether this fighter has quietly stopped being one. Evaluated quarterly by the world.
 *
 * Separate from {@link shouldRetire}, which is a decision somebody makes in a dressing room after
 * a fight. This one is a decision nobody announces.
 */
export function hasDriftedOut(fighter: Fighter, onDay: GameDay, rng: Rng): boolean {
  return rng.chance(driftUrge(fighter, onDay));
}

/**
 * Plain-language reason, for the news feed and the career-summary screen.
 *
 * Read off {@link retirementDrivers} — whichever pressure was actually the largest at the moment
 * they stopped — rather than from a separate ladder of thresholds that the decision never
 * consulted. A fighter who walks away with their belief gone is told so, whatever the number
 * happens to be.
 */
export function retirementReason(fighter: Fighter, onDay: GameDay): string {
  const age = ageOn(fighter.birthDay, onDay);
  const drivers = retirementDrivers(fighter, onDay);

  // Two absolutes first. Both are statements about the body that outrank whatever else was
  // weighing on them, and neither is a matter of degree.
  if (fighter.condition.headTrauma >= 70) {
    return 'Walked away on medical advice after years of accumulated damage.';
  }
  if (age >= HARD_AGE) return 'Age finally caught up.';

  // Nobody called, and one day that was that. Checked before the weighted terms because it is a
  // statement about the sport's relationship with them rather than about how they were feeling.
  if (driftUrge(fighter, onDay) > 0) {
    return 'Drifted out of the sport without ever announcing it.';
  }

  const ranked = (
    [
      ['confidence', drivers.confidence],
      ['skid', drivers.skid],
      ['trauma', drivers.trauma],
      ['wear', drivers.wear],
      ['age', drivers.age],
    ] as const
  ).reduce((best, next) => (next[1] > best[1] ? next : best));

  // Nothing was really pushing them. Somebody who stops here chose to.
  if (ranked[1] < 0.05) return 'Retired on their own terms.';

  switch (ranked[0]) {
    case 'confidence':
      return 'Lost the desire for it and stepped away.';
    case 'skid':
      return 'Retired on a losing run, with nothing left to prove.';
    case 'trauma':
      return 'Walked away on medical advice after years of accumulated damage.';
    case 'wear':
      return 'The body stopped answering — too many camps, too many hard nights.';
    default:
      return 'Retired on their own terms.';
  }
}
