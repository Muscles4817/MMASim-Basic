/**
 * An absolute rating, re-expressed against the population a fighter actually competes in.
 *
 * Doc 31 § 7.1 named this `competitiveRating` and § 7.3 shipped the first half of it as the
 * display band. The two are the same operation applied for two different reasons, so they are one
 * function here rather than two:
 *
 * > **The number is absolute. The adjective is comparative.** And so is any *judgement* built on
 * > the number — a band, a ranking score, a functional rating.
 *
 * The ladder (doc 31 § 4) makes a physical rating a reading of a measurable quantity, which means
 * a heavyweight reads 12 points above a flyweight for Power because he *is* that much more
 * powerful. True, and useless to anyone asking "is he good at this". `competitiveRating` answers
 * the second question by shifting a physical by the gap between its divisional expectation and the
 * band table's own reference population, so a fighter exactly at his division's rostered median
 * reads `COMPETITIVE_REFERENCE` whoever he is.
 *
 * **Only the five physicals move.** There is no division term on Wrestling or Fight IQ (§ 2.3), so
 * re-centring those would be inventing a reference the sport does not support. The ten technical
 * and mental attributes pass through untouched, and that is the other half of the claim rather
 * than an omission.
 */

import { isPhysicalScaleKey, expectedPhysical, type PhysicalScaleKey } from './physicalScale.js';
import {
  ATTRIBUTE_KEYS,
  toRating,
  type AttributeKey,
  type Attributes,
  type Rating,
} from './attributes.js';
import type { Sex } from '../domain/divisions.js';

/**
 * Where the reference population sits, in rating points.
 *
 * `RATING_BANDS` puts "Average" at 50–61 and doc/02 glosses it as "average for a major-promotion
 * roster", so that band's midpoint is what the table means by an ordinary rostered professional.
 * Re-centring a physical on 55 therefore makes it read the way the table already claims to read,
 * rather than inventing a second scale for the labels — and for anything else — to sit on.
 */
export const COMPETITIVE_REFERENCE = 55;

/** The reference a comparison is taken against, named so a screen can say which it used. */
export interface CompetitiveContext {
  divisionId: string;
  sex: Sex;
  /**
   * Points added to the whole-population median to reach the rostered one, per attribute.
   *
   * Passed in rather than imported so this module does not have to decide *which* population a
   * given caller is comparing against — a regional promotion's roster is not the UFC's, and doc 31
   * § 4.2 is explicit that the lift between them is a measured quantity rather than a constant of
   * nature.
   */
  eliteLift: Readonly<Record<PhysicalScaleKey, number>>;
}

/**
 * A physical rating, re-expressed as the equivalent rating for an ordinary professional.
 *
 * `ELITE_LIFT` is added to `expectedPhysical` because the reference is the *rostered* population
 * and `expectedPhysical` reports the whole professional one. Getting that wrong would shift every
 * physical by seven to nine points, which is most of a band.
 */
export function competitiveRating(
  key: PhysicalScaleKey,
  rating: Rating,
  context: CompetitiveContext,
): Rating {
  const expected = expectedPhysical(key, context.divisionId, context.sex);
  if (expected === undefined) return rating;
  return toRating(rating - (expected + context.eliteLift[key] - COMPETITIVE_REFERENCE));
}

/**
 * A whole attribute block in competitive terms: physicals re-centred, everything else as authored.
 *
 * With no context it returns the block unchanged, which is the right failure rather than a
 * fallback — a comparison that cannot name its reference population should not invent one.
 */
export function competitiveAttributes(attrs: Attributes, context?: CompetitiveContext): Attributes {
  if (!context) return attrs;
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = isPhysicalScaleKey(key) ? competitiveRating(key, attrs[key], context) : attrs[key];
  }
  return out;
}

/** Whether this attribute's competitive reading differs from its absolute one. */
export function isCompetitivelyRecentred(key: AttributeKey): boolean {
  return isPhysicalScaleKey(key);
}
