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

import { PHYSICAL_SCALE_KEYS, isPhysicalScaleKey, type PhysicalScaleKey } from './physicalScale.js';
import { ratingBand, type AttributeKey, type RATING_BANDS, type Rating } from './attributes.js';
import { competitiveRating, type CompetitiveContext } from './competitive.js';

/**
 * The reference a comparative band is taken against.
 *
 * The same object `competitive.ts` works in, aliased because a screen asks for a *band* and should
 * not have to know that the shift behind it is shared with the ranking and functional ratings.
 */
export type BandContext = CompetitiveContext;

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
  return ratingBand(competitiveRating(key, rating, context));
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
