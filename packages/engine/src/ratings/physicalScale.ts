/**
 * What the five physical ratings mean, in physical units.
 *
 * Doc 31 is the argument; this file is the ten numbers it lands on, in one place, so that nothing
 * else in the codebase gets to hold a second opinion about them.
 *
 * **Nothing consumes this yet.** Doc 31 § 12 step 6 is where `ceilingsFromNaturals` starts reading
 * the mass law, and step 7 is the first step permitted to touch a fight-engine constant. It exists
 * now because the generated ladder tables and the falsification suite need a single source of truth
 * to be generated *from*, and a table typed into a document drifts from the parameters it is
 * supposed to illustrate the first time one of them moves.
 *
 * ---
 *
 * ## The scale
 *
 * Every physical rating is a **logarithmic scale over a measurable quantity**:
 *
 * ```
 *   quantity(r) = quantity(50) × 2^((r − 50) / D)
 * ```
 *
 * `D` is points per doubling. Equal steps in rating are equal *ratios* of capability, which is what
 * lets one scale hold both an ordinary flyweight's punching power and Ngannou's without the middle
 * of it collapsing. The engine already reads ratings exponentially — `effect(r, K) = exp(K(r−50)/50)`
 * — so this makes explicit a shape the simulator was assuming anyway.
 *
 * Rating **50 is the median professional of that sex**, pooled across every division. Pooled is what
 * makes the scale absolute: a division does not get its own 50.
 *
 * ## The mass law
 *
 * ```
 *   rating = 50 + D · β · log₂(mass / pivotMass) + individual
 * ```
 *
 * `β` is the allometric exponent of the quantity against body mass. Which mass differs by attribute
 * and is load-bearing rather than fussy: Power, Strength and Durability read **lean** mass, because
 * fat is not contractile and does not resist concussion, while Speed and Cardio read **total** mass,
 * because a fighter has to move all of it. At population level a roughly constant lean fraction makes
 * the two agree; the split earns its keep on individuals, where it is the entire reason a bad bulk
 * costs quickness without buying force.
 */

import type { AttributeKey } from './attributes.js';
import type { Sex } from '../domain/divisions.js';

/** The five attributes this scale governs. The other ten are not physical quantities. */
export const PHYSICAL_SCALE_KEYS = ['power', 'speed', 'cardio', 'durability', 'strength'] as const;
export type PhysicalScaleKey = (typeof PHYSICAL_SCALE_KEYS)[number];

export const isPhysicalScaleKey = (key: AttributeKey): key is PhysicalScaleKey =>
  (PHYSICAL_SCALE_KEYS as readonly string[]).includes(key);

/** Which mass an attribute's quantity scales against. */
export type MassBasis = 'lean' | 'total';

export interface PhysicalScaleEntry {
  key: PhysicalScaleKey;
  /** The physical quantity the rating measures, in one line. */
  quantity: string;
  /** Points per doubling of that quantity. */
  pointsPerDoubling: number;
  /** Allometric exponent against `basis` mass. */
  massExponent: number;
  basis: MassBasis;
  /** Coefficient of variation of the quantity within a division, among trained athletes. */
  coefficientOfVariation: number;
  /**
   * Whether this entry is held as a hypothesis rather than as evidence. Doc 31 § 8.4.
   *
   * A calibration-sensitive parameter may only be moved on the weight of the controlled experiments
   * in doc 31 § 9.1 — never by comparison against the pre-existing seed roster, which was authored
   * on a division-relative reading of the scale and cannot adjudicate an absolute one.
   */
  calibrationSensitive?: string;
}

/**
 * The parameters.
 *
 * Evidence for each is in doc 31 § 3 and its grounded/provisional split is § 8. In short:
 *
 *  - `D_speed = 70` is pinned by direct measurement — punch velocity among trained fighters spans a
 *    little over 2×, and 70 puts the whole 25→99 range at 2.08×.
 *  - `D_power = 43` is pinned by a downstream measurable, the heavyweight-to-flyweight knockdown
 *    ratio, which it predicts at 2.73× against a real ~2.6×.
 *  - `β_strength = +0.67` is the classical cross-sectional-area exponent that competitive strength
 *    sports use to compare athletes across bodyweight.
 *  - `β_cardio = −0.25` is 0.75 (aerobic capacity) minus 1.0 (the cost of moving your own body).
 *  - `β_durability = +0.10` is nearly mass-neutral and nearly unevidenced, and the asymmetry between
 *    it and `β_power` is the whole reason heavyweight is a more dangerous division.
 */
export const PHYSICAL_SCALE: Readonly<Record<PhysicalScaleKey, PhysicalScaleEntry>> = {
  power: {
    key: 'power',
    quantity: 'peak impulse delivered into a target on a clean strike',
    pointsPerDoubling: 43,
    massExponent: 0.6,
    basis: 'lean',
    coefficientOfVariation: 0.2,
  },
  strength: {
    key: 'strength',
    quantity: 'maximal voluntary force in a grappling posture',
    pointsPerDoubling: 46,
    massExponent: 0.67,
    basis: 'lean',
    coefficientOfVariation: 0.18,
    calibrationSensitive:
      'Doc 31 § 8.4. The 28-point flyweight-to-heavyweight spread is a hypothesis. Move it only on ' +
      'the weight of the controlled experiments S1, S2 and S4 in doc 31 § 9.1 taken together — ' +
      'never on heavyweight submission rate alone, which four separate parameters push on, and ' +
      'never against the hand-authored roster, which is the artefact being replaced.',
  },
  speed: {
    key: 'speed',
    quantity: 'limb and whole-body movement velocity',
    pointsPerDoubling: 70,
    massExponent: -0.2,
    basis: 'total',
    coefficientOfVariation: 0.11,
  },
  cardio: {
    key: 'cardio',
    quantity: 'sustainable work rate per unit of body carried',
    pointsPerDoubling: 55,
    massExponent: -0.25,
    basis: 'total',
    coefficientOfVariation: 0.13,
  },
  durability: {
    key: 'durability',
    quantity: 'impulse required to produce a given concussive effect',
    pointsPerDoubling: 45,
    massExponent: 0.1,
    basis: 'lean',
    coefficientOfVariation: 0.18,
    calibrationSensitive:
      'Doc 31 § 8.4. There is almost no direct evidence for either number; both are provisional in ' +
      'either direction. Doc 31 § 9.1 test D1 — matched-power cross-mass chin — is the falsifier.',
  },
};

/**
 * Walking weight of the median professional of each sex, in pounds. The pivot the scale reads from.
 *
 * Sex re-anchors the pivot and nothing else. It is the one deliberate exception to absoluteness, and
 * it is forced: on a single male-anchored scale the honest force ratios put the median women's
 * strawweight at Power 5 and Strength −2, which is arguably true and completely unusable. Men and
 * women never fight each other, so nothing mechanical ever compares across the two. Within a sex the
 * scale is strictly absolute across every division, which is the property the design needs.
 *
 * The other ten attributes get **no** sex pivot and never will: there is no biological basis for a
 * sex difference in striking craft, wrestling technique, fight IQ or composure. A women's flyweight
 * with Wrestling 85 is exactly as good a wrestler as a men's flyweight with Wrestling 85, and the two
 * numbers may be compared directly.
 */
export const PIVOT_WALKING_WEIGHT_LBS: Readonly<Record<Sex, number>> = {
  male: 180,
  female: 140,
};

/**
 * Lean fraction of the pivot body, per sex.
 *
 * Sex-specific, and it has to be: essential body fat is roughly twelve per cent for women against
 * three for men, so the median trained woman carries about twenty per cent body fat where the median
 * trained man carries thirteen. A single constant here silently mis-anchors every lean-basis
 * attribute for one sex — caught by `ladder-tables.test.ts`, which found the median female
 * professional rating 46.5 for Strength on a scale whose whole definition is that she rates 50.
 *
 * These match the midpoints of the body model's per-sex fat bands in `progression/body.ts`, and they
 * have to keep matching: this is the pivot the ladder measures from and that is the population it
 * measures.
 */
export const PIVOT_LEAN_FRACTION: Readonly<Record<Sex, number>> = {
  male: 0.87,
  female: 0.8,
};

/** How many rating points a quantity ratio is worth on this attribute's scale. */
export function pointsForRatio(key: PhysicalScaleKey, ratio: number): number {
  if (ratio <= 0) return -Infinity;
  return PHYSICAL_SCALE[key].pointsPerDoubling * Math.log2(ratio);
}

/** The inverse: what multiple of the median professional's quantity a rating represents. */
export function quantityMultiple(key: PhysicalScaleKey, rating: number): number {
  return 2 ** ((rating - 50) / PHYSICAL_SCALE[key].pointsPerDoubling);
}

/**
 * The mass term: what competing at this mass is worth, in rating points, before anything about the
 * individual is considered.
 *
 * This is the whole reason a rating can be absolute and a division can still have a shape. It is not
 * a bonus applied to a weight class — it is a term in the expression of an absolute quantity,
 * evaluated at the mass this fighter is actually carrying, which is why moving up a division changes
 * it by exactly the amount the mass changed and not by a table lookup.
 */
export function massTerm(
  key: PhysicalScaleKey,
  sex: Sex,
  walkingWeightLbs: number,
  leanMassLbs: number,
): number {
  const entry = PHYSICAL_SCALE[key];
  const pivot = PIVOT_WALKING_WEIGHT_LBS[sex];

  const [mass, pivotMass] =
    entry.basis === 'lean'
      ? [leanMassLbs, pivot * PIVOT_LEAN_FRACTION[sex]]
      : [walkingWeightLbs, pivot];

  if (mass <= 0 || pivotMass <= 0) return 0;
  return entry.pointsPerDoubling * entry.massExponent * Math.log2(mass / pivotMass);
}

/**
 * The rating a *median* professional of this sex carries at this body mass.
 *
 * The divisional ladder, computed rather than tabulated. Half a real division sits above it and elite
 * fighters sit well above it — doc 31 § 4.2 puts the UFC-level median 6 to 9 points higher again.
 */
export function medianRatingAtMass(
  key: PhysicalScaleKey,
  sex: Sex,
  walkingWeightLbs: number,
  leanMassLbs: number,
): number {
  return 50 + massTerm(key, sex, walkingWeightLbs, leanMassLbs);
}

/**
 * Standard deviation of this attribute within a division, in rating points.
 *
 * Derived rather than chosen: a coefficient of variation in the quantity becomes a standard
 * deviation in rating points as `D · log₂(1 + CV)`. The five land within 1.6 points of each other,
 * which nobody designed — `D` was set per attribute from range and knockout evidence and `CV` comes
 * from the underlying variation, and the product agreeing is a consistency check that passed.
 *
 * The consequence is what makes the whole scale readable: one standard deviation is about ten points
 * on every physical attribute, so +10 is notably better, +20 is best in the division and +30 is one
 * of the best in the sport — on any attribute, in any division.
 */
export function ratingSd(key: PhysicalScaleKey): number {
  const entry = PHYSICAL_SCALE[key];
  return entry.pointsPerDoubling * Math.log2(1 + entry.coefficientOfVariation);
}

/**
 * How far above the professional median the top slice of the sport sits, per attribute.
 *
 * A major-promotion roster is roughly the top one to two per cent of professionals **by fighting
 * ability**, and any single physical attribute is one of fifteen contributors to that. So the lift is
 * `ρ × selection intensity × σ`, with ρ ≈ 0.3 and intensity ≈ 2.2 — six to nine points, not the
 * twenty-five that selecting directly on the attribute would give.
 *
 * Cardio takes the largest lift because it is the most trainable and professional camps are where
 * that training happens; Strength the smallest because it contributes least directly to winning.
 */
export const ELITE_LIFT: Readonly<Record<PhysicalScaleKey, number>> = {
  power: 7,
  speed: 8,
  cardio: 9,
  durability: 7,
  strength: 6,
};

/** Every parameter currently held as a hypothesis, with the reason. Doc 31 § 8.4. */
export function calibrationSensitiveParameters(): { key: PhysicalScaleKey; why: string }[] {
  return PHYSICAL_SCALE_KEYS.filter((k) => PHYSICAL_SCALE[k].calibrationSensitive).map((k) => ({
    key: k,
    why: PHYSICAL_SCALE[k].calibrationSensitive!,
  }));
}
