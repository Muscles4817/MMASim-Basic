/**
 * The calibration roster: what an entry is, and how a rating is produced from one.
 *
 * Doc 31 § 12 step 5 and § 13.8. This is a **calibration instrument**, not a new source of truth by
 * fiat and not a roster the game ships. It exists so the physical ladder in `physicalScale.ts` can
 * be inspected against fighters somebody actually watched, and so that step 7 has a population whose
 * numbers were authored deliberately rather than emergently.
 *
 * ---
 *
 * ## Two claims, kept separate
 *
 * The central design decision. A calibration entry never states a rating. It states a **placement**:
 *
 * ```
 *   human claim   "Ngannou is about +2.6 sigma in Power among UFC heavyweights"
 *   model claim   "under the current male Power ladder that is rating 100, at 2.24x reference force"
 * ```
 *
 * The first is a judgement a person should make and defend; the second is arithmetic. Typing the
 * rating directly would fuse them, and when something later looked wrong there would be no way to
 * tell which layer was in error. It also means a calibration-sensitive parameter (§ 8.4) moving
 * re-derives all ninety entries in the same commit rather than silently invalidating them.
 *
 * ## Three kinds of input, and they do not carry equal authority
 *
 * `measured` is what the sport records — height, reach, division, sex. `estimated` is inference:
 * nobody publishes a walking weight, and body composition is a guess wearing a number. `placement`
 * is judgement. Keeping them in separate objects is not tidiness; it is so that a guessed walking
 * weight cannot acquire the authority of an official fight weight merely by both ending up as
 * numbers in the same fixture.
 *
 * ## The body model does not get the last word
 *
 * If `physiqueForMeasurements` reconstructs a body that `weightFit` calls `notViable` for a division
 * the fighter demonstrably competed in, **the disagreement is evidence about the model**, and the
 * entry records it rather than being quietly adjusted until the model is happy. A calibration set
 * that only contains cases the model already agrees with has calibrated nothing. See
 * `BodyModelDisagreement`.
 */

import {
  ELITE_LIFT,
  PHYSICAL_SCALE_KEYS,
  asDivisionId,
  getDivision,
  leanMassLbs,
  medianRatingAtMass,
  physiqueForMeasurements,
  quantityMultiple,
  ratingSd,
  toRating,
  walkingWeightLbs,
  weightFit,
  type Body,
  type PhysicalScaleKey,
  type Rating,
  type Sex,
  type WeightFit,
} from '@mmasim/engine';

/** Sigma placements, one per physical. Positive is above the division's major-promotion median. */
export type Placement = Readonly<Record<PhysicalScaleKey, number>>;

/**
 * How well sourced a walking weight is.
 *
 * Walking weight is never published, so every one of these is an inference from fight-week
 * reporting, corner interviews, visible size and how hard the fighter is known to cut. The tag says
 * how much of that there was, so a later reader can tell a well-attested 190 from a shrug.
 */
export type EstimateConfidence = 'good' | 'fair' | 'poor';

/**
 * Why the body model and a real fighter's competitive history disagree.
 *
 * The classification matters more than the fact. A real fighter who competed successfully in a
 * division the model calls impossible is telling us something, and which of these it is decides
 * whether the fix belongs in the estimate, the composition inference, or the cut model itself.
 */
export type BodyModelDisagreement =
  /** The walking weight we guessed is probably too high. The cheapest explanation, so check it first. */
  | 'walkingWeightEstimate'
  /** `physiqueForMeasurements` splits frame and muscle evenly, which is wrong for this body. */
  | 'compositionInference'
  /** The model's floor is too high: real fighters make weights it says they cannot. */
  | 'cutModelTooStrict'
  /** Real, and genuinely dangerous. The sport did this and should not have. */
  | 'historicalExtremeCut'
  /** The height or reach we have is wrong. */
  | 'sourceData';

export interface CalibrationEntry {
  id: string;
  name: string;

  /** What the sport records. Reliable where known. */
  measured: {
    sex: Sex;
    /** The division this entry calibrates — where the fighter did most of their work. */
    division: string;
    /** Official height, inches. */
    heightInches: number;
    /** Official reach, inches. */
    reachInches: number;
  };

  /** Inference. None of this is published anywhere; all of it is a judgement wearing a number. */
  estimated: {
    walkingWeightLbs: number;
    confidence: EstimateConfidence;
    /** 1–100 on the body model's scale. 50 is the middle of the trained band. */
    bodyFatIndex: Rating;
    /** 1–100. How much water this body sheds in fight week. */
    waterCutIndex: Rating;
  };

  /** The human claim. Sigmas above or below the division's major-promotion median. */
  placement: Placement;

  /**
   * Other divisions this fighter competed in, lightest first.
   *
   * The most valuable field in the file for step 7: a cross-division mover lets the mass law be
   * tested while holding the human being roughly constant, which no amount of comparing two
   * different fighters can do.
   */
  alsoFought?: readonly string[];

  /**
   * Why these placements and not others. Mandatory, and the actual deliverable.
   *
   * A note that does not say why a number is what it is has justified nothing, and the numbers are
   * downstream of the reasoning rather than the other way round.
   */
  notes: string;

  /** Recorded when the body model rejects a division this fighter demonstrably competed in. */
  disagreement?: {
    kind: BodyModelDisagreement;
    note: string;
  };
}

/** One physical, taken apart so an absurd placement is visible rather than merely present. */
export interface ResolvedPhysical {
  key: PhysicalScaleKey;
  /** Where the division's major-promotion median sits on the absolute scale. */
  divisionMedian: number;
  /** The authored judgement, in sigmas. */
  sigma: number;
  /** What the ladder makes of that. */
  rating: Rating;
  /**
   * The same before `toRating` clamps it to 1–100.
   *
   * Tracked so that clipping is *visible*. A placement that resolves to 101.4 and is silently
   * reported as 100 has stopped being auditable — the scale can no longer distinguish that fighter
   * from one who hits harder, and nobody reading the report would know. Doc 31 § 13.8's second
   * acceptance criterion allows exactly one kind of exception, a deliberate near-human-limit anchor,
   * and this is what makes the difference between the two cases checkable.
   */
  unclippedRating: number;
  /** The underlying quantity, as a multiple of the median professional of this sex. */
  quantityMultiple: number;
  /** Where this fighter sits inside their own division, 0–100. */
  divisionPercentile: number;
}

export interface ResolvedEntry {
  entry: CalibrationEntry;
  body: Body;
  /** Recomputed from the physique, so a stated walking weight that the body cannot make shows up. */
  impliedWalkingWeightLbs: number;
  leanMassLbs: number;
  fit: WeightFit;
  physicals: Record<PhysicalScaleKey, ResolvedPhysical>;
}

/**
 * The normal CDF, for turning a sigma placement into a within-division percentile.
 *
 * Abramowitz and Stegun 7.1.26, which is accurate to about 1.5e-7 — far past what a diagnostic
 * needs, and cheap enough not to think about.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Turn a calibration entry into the numbers it implies.
 *
 * Nothing here is stored. The entry states a body and a set of judgements; this is the arithmetic
 * that connects them to the ladder, and running it is how the ladder gets inspected.
 */
export function resolveEntry(entry: CalibrationEntry): ResolvedEntry {
  const { sex, heightInches, reachInches, division } = entry.measured;
  const { walkingWeightLbs: stated, bodyFatIndex, waterCutIndex } = entry.estimated;

  const body: Body = {
    sex,
    heightInches,
    reachInches,
    ...physiqueForMeasurements(sex, heightInches, stated, bodyFatIndex, waterCutIndex),
  };

  const implied = walkingWeightLbs(body);
  const lean = leanMassLbs(body);
  const divisionId = asDivisionId(division);

  const physicals = {} as Record<PhysicalScaleKey, ResolvedPhysical>;
  for (const key of PHYSICAL_SCALE_KEYS) {
    const divisionMedian = medianRatingAtMass(key, sex, implied, lean) + ELITE_LIFT[key];
    const sigma = entry.placement[key];
    const unclipped = divisionMedian + sigma * ratingSd(key);
    const rating = toRating(unclipped);
    physicals[key] = {
      key,
      divisionMedian,
      sigma,
      rating,
      unclippedRating: unclipped,
      quantityMultiple: quantityMultiple(key, rating),
      divisionPercentile: 100 * normalCdf(sigma),
    };
  }

  return {
    entry,
    body,
    impliedWalkingWeightLbs: implied,
    leanMassLbs: lean,
    fit: weightFit(body, divisionId),
    physicals,
  };
}

/** One fighter's five physicals, as an auditable block. */
export function describeEntry(resolved: ResolvedEntry): string {
  const { entry } = resolved;
  const division = getDivision(asDivisionId(entry.measured.division));
  const lines = [
    `${entry.name}  —  ${division.shortName}  ${entry.measured.heightInches}" / ${entry.measured.reachInches}" reach` +
      `  ·  walks ~${entry.estimated.walkingWeightLbs} lb (${entry.estimated.confidence})` +
      `  ·  ${resolved.fit}`,
  ];
  for (const key of PHYSICAL_SCALE_KEYS) {
    const p = resolved.physicals[key];
    const sign = p.sigma >= 0 ? '+' : '−';
    const clipped = Math.abs(p.unclippedRating - p.rating) > 0.5;
    lines.push(
      `    ${key.padEnd(11)}` +
        `median ${p.divisionMedian.toFixed(0).padStart(3)}` +
        `  ${sign}${Math.abs(p.sigma).toFixed(1)}σ` +
        ` → rating ${String(p.rating).padStart(3)}` +
        (clipped ? ` (CLIPPED from ${p.unclippedRating.toFixed(1)})` : '') +
        ` → ${p.quantityMultiple.toFixed(2)}× reference` +
        ` → ${p.divisionPercentile.toFixed(1)}th pct ${division.shortName}`,
    );
  }
  return lines.join('\n');
}
