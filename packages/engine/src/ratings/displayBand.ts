/**
 * The adjective, as opposed to the number.
 *
 * Doc 31 § 7 names three places where an **absolute rating was being used as a comparison** with no
 * reference population, and § 7.3 is the one a player sees. `RATING_BANDS` calls 38–49 "Below level
 * — a hole opponents will find", which was true of every attribute under the old flat ladder and is
 * now false of the physicals: measured over 36,000 generated men, **44% of flyweights land in the
 * band labelled "Liability" for Power** and another 30% in "Below level", while a heavyweight at the
 * same place in his own division reads "Average". Nothing about those two fighters differs except
 * which weight class they were born into.
 *
 * The split this module implements is the one § 7.1 and § 7.3 both arrive at, and it is the same
 * domain-truth / mode-presentation split the project applies elsewhere:
 *
 * > **The number is absolute. The adjective is comparative.**
 *
 * So `ratingBand` stays exactly as it is — it is the honest reading of an absolute quantity, and
 * `quantityMultiple` will still tell you that Power 67 is 1.43× the median professional's impulse
 * whoever holds it. What changes is that a *label* now says which population it is comparing
 * against, because "is he good at this" is a question that cannot be answered without one.
 *
 * **Only the five physicals are re-centred.** There is no division term on Wrestling or Fight IQ
 * (§ 2.3), so banding those against a division would be inventing a reference the sport does not
 * support — and the ten technical and mental attributes keep their absolute bands unchanged, which
 * is not an omission but the other half of the claim.
 */

import {
  PHYSICAL_SCALE_KEYS,
  expectedPhysical,
  isPhysicalScaleKey,
  type PhysicalScaleKey,
} from './physicalScale.js';
import {
  ratingBand,
  toRating,
  type AttributeKey,
  type RATING_BANDS,
  type Rating,
} from './attributes.js';
import type { Sex } from '../domain/divisions.js';

/**
 * Where the band table's own reference population sits, in rating points.
 *
 * `RATING_BANDS` puts "Average" at 50–61 and doc/02 glosses it as "average for a major-promotion
 * roster", so that band's midpoint is what the table means by an ordinary rostered professional.
 * Re-centring a physical on 55 therefore makes it read the way the table already claims to read,
 * rather than inventing a new scale for the labels to sit on.
 */
const BAND_REFERENCE = 55;

/**
 * A physical rating, re-expressed as the equivalent rating for an ordinary professional.
 *
 * Shifts by the gap between this division's median and the band table's reference, so a fighter
 * exactly at his division's rostered median reads 55 — the middle of "Average" — whether he is a
 * flyweight or a heavyweight. A fighter twenty points clear of his own division reads 75 in both.
 *
 * `ELITE_LIFT` is added to `expectedPhysical` because the band table's reference is the rostered
 * population and `expectedPhysical` reports the whole professional one. Getting that wrong would
 * shift every physical label by seven to nine points, which is most of a band.
 */
function comparativeRating(
  key: PhysicalScaleKey,
  rating: Rating,
  divisionId: string,
  sex: Sex,
  eliteLift: number,
): Rating {
  const expected = expectedPhysical(key, divisionId, sex);
  if (expected === undefined) return rating;
  return toRating(rating - (expected + eliteLift - BAND_REFERENCE));
}

/** The reference a comparative band is taken against, named so a screen can say which it used. */
export interface BandContext {
  divisionId: string;
  sex: Sex;
  /**
   * Points added to the whole-population median to reach the rostered one, per attribute.
   *
   * Passed in rather than imported so this module does not have to decide *which* population a
   * given screen is comparing against — a regional promotion's roster is not the UFC's, and doc 31
   * § 4.2 is explicit that the lift between them is a measured quantity rather than a constant of
   * nature.
   */
  eliteLift: Readonly<Record<PhysicalScaleKey, number>>;
}

/**
 * The band to put beside an attribute on a screen.
 *
 * Absolute for the ten technical and mental attributes; comparative for the five physicals, against
 * the division in `context`. With no context it falls back to the absolute band, which is the right
 * failure: a label that cannot name its reference population should not pretend to have one.
 */
export function displayBand(
  key: AttributeKey,
  rating: Rating,
  context?: BandContext,
): (typeof RATING_BANDS)[number] {
  if (!context || !isPhysicalScaleKey(key)) return ratingBand(rating);
  return ratingBand(
    comparativeRating(key, rating, context.divisionId, context.sex, context.eliteLift[key]),
  );
}

/**
 * Whether this attribute's label is a comparison, so a screen can say so.
 *
 * A player reading "Average" needs to know whether it means average among humans or average among
 * the people they are about to be locked in with, and those are different claims. Exposing the
 * distinction is the point of the split; hiding it would be a third way of making the same mistake.
 */
export function bandIsComparative(key: AttributeKey, context?: BandContext): boolean {
  return context !== undefined && isPhysicalScaleKey(key);
}

/** Every attribute whose display band is comparative, for a screen's footnote. */
export const COMPARATIVE_BAND_KEYS: readonly PhysicalScaleKey[] = PHYSICAL_SCALE_KEYS;
