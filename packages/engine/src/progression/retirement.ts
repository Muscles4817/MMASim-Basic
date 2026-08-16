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
export function retirementUrge(fighter: Fighter, onDay: GameDay): number {
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

  const raw = (ageTerm + traumaTerm + wearTerm + skidTerm + confidenceTerm) * (2 - stubbornness) * 0.5;
  // Past the hard age the personality discount stops applying: bodies do not negotiate.
  return clamp01(Math.max(raw, overHard));
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

/** Plain-language reason, for the news feed and the career-summary screen. */
export function retirementReason(fighter: Fighter, onDay: GameDay): string {
  const age = ageOn(fighter.birthDay, onDay);
  if (fighter.condition.headTrauma >= 70) {
    return 'Walked away on medical advice after years of accumulated damage.';
  }
  if (age >= HARD_AGE) return 'Age finally caught up.';
  if (fighter.summary.streak <= -3) return 'Retired on a losing run, with nothing left to prove.';
  if (fighter.condition.confidence <= 20) return 'Lost the desire for it and stepped away.';
  return 'Retired on their own terms.';
}
