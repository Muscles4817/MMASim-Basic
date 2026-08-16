/**
 * Rating → effect curves.
 *
 * This module is the reason a 99 feels like a 99. A linear reading of a 1–100 scale makes
 * every elite fighter feel the same; the simulator therefore never consumes raw ratings for
 * physical resolution, only the convex *effect* of a rating.
 *
 *   effect(r) = exp(K · (r − 50) / 50)
 *
 * effect(50) is exactly 1.0 by construction, so "average" is the unit and every coefficient
 * elsewhere in the engine is expressed relative to an average fighter.
 *
 * See docs/02-attributes-and-ratings.md § "The effect curve".
 */

import { ATTRIBUTE_META, type AttributeKey, type Attributes, type Rating } from './attributes.js';

/** The pivot at which effect is exactly 1.0. */
export const EFFECT_PIVOT = 50;

/**
 * Convert a rating to a multiplier with an explicit convexity.
 *
 * Prefer {@link attributeEffect} in engine code so the per-attribute convexity from
 * `ATTRIBUTE_META` is applied consistently.
 */
export function effect(rating: Rating, convexity: number): number {
  return Math.exp((convexity * (rating - EFFECT_PIVOT)) / 50);
}

/** Effect multiplier for an attribute, using its declared convexity. */
export function attributeEffect(attrs: Attributes, key: AttributeKey): number {
  return effect(attrs[key], ATTRIBUTE_META[key].convexity);
}

/** Effect multiplier for a raw rating treated as the given attribute. */
export function ratingEffect(rating: Rating, key: AttributeKey): number {
  return effect(rating, ATTRIBUTE_META[key].convexity);
}

/**
 * The inverse: what rating produces this effect multiplier? Used by tuning tools and by the
 * editor's "show me what this change actually does" preview.
 */
export function effectToRating(multiplier: number, convexity: number): number {
  if (multiplier <= 0) return 0;
  return EFFECT_PIVOT + (50 * Math.log(multiplier)) / convexity;
}

/**
 * Ratio of two effects — "how much better is A than B at this?".
 *
 * Returned as a multiplier, so 1.0 is parity and 4.7 means A produces 4.7× the effect.
 * This is the number the simulator actually cares about in contested rolls.
 */
export function effectRatio(a: Rating, b: Rating, key: AttributeKey): number {
  return ratingEffect(a, key) / ratingEffect(b, key);
}

/**
 * Fatigue-adjusted rating.
 *
 * `fatigue` is 0 (fresh) to 1 (completely gone). Different attributes rot at different
 * rates: explosive output collapses long before craft does, and a tired fighter's chin goes
 * before their submission defence does. `sensitivity` is the fraction of the rating that
 * fatigue can eat at fatigue = 1.
 */
export const FATIGUE_SENSITIVITY: Readonly<Record<AttributeKey, number>> = {
  power: 0.35,
  speed: 0.4,
  cardio: 0.0, // Cardio *is* the tank; it is not itself drained.
  durability: 0.3,
  strength: 0.3,
  strikingOffence: 0.22,
  kicking: 0.35, // Kicks are the first thing to disappear when the legs go.
  strikingDefence: 0.3,
  wrestling: 0.35,
  takedownDefence: 0.3,
  groundControl: 0.25,
  submissions: 0.18, // Technique survives exhaustion better than athleticism does.
  scrambling: 0.4,
  fightIq: 0.12,
  composure: 0.15,
};

export function fatigued(rating: Rating, key: AttributeKey, fatigue: number): number {
  const f = fatigue < 0 ? 0 : fatigue > 1 ? 1 : fatigue;
  return rating * (1 - FATIGUE_SENSITIVITY[key] * f);
}

/** Fatigue-adjusted effect multiplier — the form the simulator uses most. */
export function fatiguedEffect(rating: Rating, key: AttributeKey, fatigue: number): number {
  return effect(fatigued(rating, key, fatigue), ATTRIBUTE_META[key].convexity);
}
