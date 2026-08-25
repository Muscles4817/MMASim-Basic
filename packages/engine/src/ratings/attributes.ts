/**
 * The 15 visible attributes and the 8 hidden naturals.
 *
 * See docs/02-attributes-and-ratings.md. The headline rule: ratings are **absolute**, not
 * weight-class relative. Power 78 is the same force at flyweight and at heavyweight; what
 * changes is the company you keep.
 */

import { clamp, round } from '../core/math.js';

/** A visible attribute rating. Always an integer in [1, 100]. */
export type Rating = number;

export const RATING_MIN = 1;
export const RATING_MAX = 100;

export const ATTRIBUTE_KEYS = [
  // Physical
  'power',
  'speed',
  'cardio',
  'durability',
  'strength',
  // Striking
  'strikingOffence',
  'kicking',
  'strikingDefence',
  // Grappling
  'wrestling',
  'takedownDefence',
  'groundControl',
  'submissions',
  'scrambling',
  // Mental
  'fightIq',
  'composure',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** A fighter's visible attribute block. Every key is required — no partial fighters. */
export type Attributes = Record<AttributeKey, Rating>;

export const ATTRIBUTE_GROUPS = ['physical', 'striking', 'grappling', 'mental'] as const;
export type AttributeGroup = (typeof ATTRIBUTE_GROUPS)[number];

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  group: AttributeGroup;
  /** One-line explanation shown on long-press / hover in the UI. */
  blurb: string;
  /**
   * Convexity of this attribute's effect curve. Higher = a bigger gap between elite and
   * all-time, i.e. the attribute rewards outliers more. See `curve.ts`.
   */
  convexity: number;
}

/**
 * Single source of truth for attribute presentation and curve shape.
 *
 * Convexity choices, in short:
 *  - 1.60 for the fight-ending attributes (Power, Ground Control, Submissions). These are
 *    the ones where an all-timer must feel categorically different, not incrementally so.
 *  - 1.20 for the attributes that *deny* — Cardio, Striking Defence, Takedown Defence.
 *    Elite defence should be genuinely hard to solve, but not literally impenetrable.
 *  - 0.90 for broad, everywhere-applied attributes (Speed, Fight IQ, Composure). These
 *    already touch every roll, so a steep curve on top would double-count them.
 */
export const ATTRIBUTE_META: Readonly<Record<AttributeKey, AttributeMeta>> = {
  power: {
    key: 'power',
    label: 'Power',
    group: 'physical',
    blurb: 'Absolute force on a clean strike. Fight-ending potential.',
    convexity: 1.6,
  },
  speed: {
    key: 'speed',
    label: 'Speed',
    group: 'physical',
    blurb: 'Hand and foot speed, reaction time, who lands first.',
    convexity: 0.9,
  },
  cardio: {
    key: 'cardio',
    label: 'Cardio',
    group: 'physical',
    blurb: 'Gas tank. How slowly you fade and how well you recover between rounds.',
    convexity: 1.2,
  },
  durability: {
    key: 'durability',
    label: 'Durability',
    group: 'physical',
    blurb: 'Chin and body. Absorbing damage without being hurt.',
    // Steeper than the other defensive attributes, and deliberately so: Power sits on a
    // 1.6 curve, so a flatter chin curve would mean knockout rates climb as a division
    // gets better, which is backwards. Elite chins have to keep pace with elite power.
    convexity: 1.45,
  },
  strength: {
    key: 'strength',
    label: 'Strength',
    group: 'physical',
    blurb: 'Functional grappling strength: clinch, top pressure, breaking grips.',
    convexity: 1.1,
  },
  strikingOffence: {
    key: 'strikingOffence',
    label: 'Striking',
    group: 'striking',
    blurb: 'Boxing craft: accuracy, combinations, shot selection in the pocket.',
    convexity: 1.1,
  },
  kicking: {
    key: 'kicking',
    label: 'Kicking',
    group: 'striking',
    blurb: 'Kick and knee arsenal, and the commitment to use it.',
    convexity: 1.1,
  },
  strikingDefence: {
    key: 'strikingDefence',
    label: 'Striking Def.',
    group: 'striking',
    blurb: 'Head movement, range management, guard — not being there to be hit.',
    convexity: 1.2,
  },
  wrestling: {
    key: 'wrestling',
    label: 'Wrestling',
    group: 'grappling',
    blurb: 'Takedown offence: entries, level changes, chaining, trips.',
    convexity: 1.2,
  },
  takedownDefence: {
    key: 'takedownDefence',
    label: 'TD Defence',
    group: 'grappling',
    blurb: 'Sprawl, underhooks, hips, wall defence.',
    convexity: 1.2,
  },
  groundControl: {
    key: 'groundControl',
    label: 'Ground Control',
    group: 'grappling',
    blurb: 'Holding top position, passing guard, landing ground-and-pound.',
    convexity: 1.6,
  },
  submissions: {
    key: 'submissions',
    label: 'Submissions',
    group: 'grappling',
    blurb: 'Submission offence: chains, transitions, finishing squeezes.',
    convexity: 1.6,
  },
  scrambling: {
    key: 'scrambling',
    label: 'Scrambling',
    group: 'grappling',
    blurb: 'Bottom game, guard, get-ups, wall-walking, transition speed.',
    convexity: 1.2,
  },
  fightIq: {
    key: 'fightIq',
    label: 'Fight IQ',
    group: 'mental',
    blurb: 'Reading the fight, adapting mid-round, executing the game plan.',
    convexity: 0.9,
  },
  composure: {
    key: 'composure',
    label: 'Composure',
    group: 'mental',
    blurb: 'Performing hurt, in deep water, in title rounds, in hostile buildings.',
    convexity: 0.9,
  },
};

export const ATTRIBUTES_BY_GROUP: Readonly<Record<AttributeGroup, readonly AttributeKey[]>> = {
  physical: ['power', 'speed', 'cardio', 'durability', 'strength'],
  striking: ['strikingOffence', 'kicking', 'strikingDefence'],
  grappling: ['wrestling', 'takedownDefence', 'groundControl', 'submissions', 'scrambling'],
  mental: ['fightIq', 'composure'],
};

/** Force a value into a valid integer rating. */
export function toRating(value: number): Rating {
  return clamp(Math.round(value), RATING_MIN, RATING_MAX);
}

/** Clamp every attribute in a block to a valid rating. */
export function normaliseAttributes(attrs: Attributes): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = toRating(attrs[key]);
  return out;
}

/** Build an attribute block where every key has the same value. Handy in tests. */
export function uniformAttributes(value: Rating): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = toRating(value);
  return out;
}

// --- Descriptive bands ------------------------------------------------------------------
// The bands in docs/02 are not decoration: the UI colours by them, scouting reports phrase
// themselves with them, and a statistical test asserts the seeded roster's distribution
// across them. Keep the two in sync.

export const RATING_BANDS = [
  { min: 96, key: 'allTime', label: 'All-time', short: 'ATG' },
  { min: 90, key: 'worldBest', label: 'Best in the world', short: 'Elite+' },
  { min: 82, key: 'elite', label: 'Elite', short: 'Elite' },
  { min: 72, key: 'veryGood', label: 'Very good', short: 'Strong' },
  { min: 62, key: 'solid', label: 'Solid', short: 'Solid' },
  { min: 50, key: 'average', label: 'Average', short: 'Avg' },
  { min: 38, key: 'belowLevel', label: 'Below level', short: 'Weak' },
  { min: 20, key: 'liability', label: 'Liability', short: 'Poor' },
  { min: RATING_MIN, key: 'absent', label: 'Absent', short: 'None' },
] as const;

export type RatingBandKey = (typeof RATING_BANDS)[number]['key'];

export function ratingBand(rating: Rating): (typeof RATING_BANDS)[number] {
  for (const band of RATING_BANDS) {
    if (rating >= band.min) return band;
  }
  return RATING_BANDS[RATING_BANDS.length - 1]!;
}

// --- Hidden naturals --------------------------------------------------------------------

export const NATURAL_KEYS = [
  'explosiveness',
  'forceVelocityBias',
  'engine',
  'constitution',
  'recovery',
  'motorLearning',
  'injuryProneness',
] as const;

export type NaturalKey = (typeof NATURAL_KEYS)[number];

/**
 * Families of skill, and how fast this fighter picks each of them up.
 *
 * Doc 23 § 2.2. The old model had one `motorLearning` number governing every kind of learning at
 * once, and a hard per-attribute ceiling deciding where it stopped — so what a fighter trained
 * decided *when* they arrived and never *where*, and two fighters who spent a decade training
 * differently converged on the same place.
 *
 * A rate per family is what makes a direction of development a real choice. A fighter with
 * grappling 85 and striking 40 who boxes every camp still improves — at roughly a quarter of the
 * rate — and ends a career a good striker rather than a great one. Nothing forbids it. The cost is
 * the career they did not have instead.
 */
export const APTITUDE_KEYS = ['striking', 'grappling', 'conditioning', 'strategy'] as const;
export type AptitudeKey = (typeof APTITUDE_KEYS)[number];

/** Hidden, like the naturals they are drawn around. 1–100. */
export type Aptitudes = Record<AptitudeKey, Rating>;

export const APTITUDE_META: Readonly<Record<AptitudeKey, { label: string; blurb: string }>> = {
  striking: { label: 'Striking aptitude', blurb: 'How fast hands and kicks come.' },
  grappling: { label: 'Grappling aptitude', blurb: 'How fast wrestling and submissions come.' },
  conditioning: { label: 'Athletic aptitude', blurb: 'How well the body answers physical work.' },
  strategy: { label: 'Fight brain', blurb: 'How fast reads, plans and composure come.' },
};

/**
 * How hard the next point is, for a skill with no ceiling.
 *
 * Calibrated against the `headroom` curve it replaces rather than invented: through the 50–70 band
 * where most development actually happens it sits just under the old values, so careers keep their
 * shape. Above 80 it is far harsher, and it never reaches zero — so nothing is ever forbidden, it
 * simply gets slower. At 90 a fighter gains at 5.7% of the rate they did at 50, which is why
 * reaching 95 takes a career of doing nothing else and is what a genuine specialist looks like.
 *
 * This replaces `headroom` for skills. Physicals keep a real ceiling and keep `headroom`, because a
 * chin and a fast-twitch profile really are written down at birth.
 */
export const RESISTANCE_DIVISOR = 80;
export const RESISTANCE_EXPONENT = 1.4;

export function skillResistance(current: number): number {
  return Math.max(0, (100 - current) / RESISTANCE_DIVISOR) ** RESISTANCE_EXPONENT;
}

/** Ageing shape. Drives when a fighter peaks and how sharply they fall off. */
export const AGE_CURVES = ['earlyBloomer', 'standard', 'longPeak', 'lateBloomer'] as const;
export type AgeCurve = (typeof AGE_CURVES)[number];

/**
 * Hidden physiological substrate. Never rendered as numbers — the player infers these from
 * behaviour, scouting reports and years of watching a fighter.
 *
 * **`frame` left this block at doc 31 § 12 step 4.** It was `walkingWeight / 300 × 100` — a number
 * about the body wearing a natural's clothes, and one that was a proxy for the division before the
 * body model landed. Structural size now lives on `Fighter.physique`, where it is a real primitive
 * rather than something recomputed from a weight that the division had chosen; the ceilings read it
 * through `leanMassIndex`, `carriedMassIndex` and `skeletalIndex` in `progression/body.ts`.
 *
 * What is left here is what the word was always supposed to mean: things a fighter was born with
 * that no amount of training or dieting moves.
 */
export interface Naturals extends Record<NaturalKey, Rating> {
  ageCurve: AgeCurve;
}

export const NATURAL_META: Readonly<Record<NaturalKey, { label: string; blurb: string }>> = {
  explosiveness: {
    label: 'Explosiveness',
    blurb: 'Fast-twitch ceiling. Caps Power and wrestling burst. First thing age takes.',
  },
  forceVelocityBias: {
    label: 'Force–velocity bias',
    blurb: 'Whether that fast twitch comes out as strength or as speed. Middle is best for Power.',
  },
  engine: { label: 'Engine', blurb: 'Aerobic ceiling. Caps Cardio. Declines slowly.' },
  constitution: {
    label: 'Constitution',
    blurb: 'Chin ceiling — and the floor Durability decays toward as damage accumulates.',
  },
  recovery: {
    label: 'Recovery',
    blurb: 'Injury healing, between-round recovery, tolerance for heavy camps.',
  },
  motorLearning: {
    label: 'Motor learning',
    blurb: 'Rate of skill acquisition. The biggest single driver of potential.',
  },
  injuryProneness: {
    label: 'Injury proneness',
    blurb: 'Baseline hazard of breaking down in camp or mid-fight. Higher is worse.',
  },
};

/**
 * An overall rating, for list sorting and at-a-glance display only.
 *
 * Deliberately **not** used by the fight simulator: a single number cannot express that
 * Khabib beats a striker of equal "overall" nine times in ten. Weights lean toward the
 * attributes that decide fights most often across the whole population.
 */
export function overallRating(attrs: Attributes): number {
  const weights: Record<AttributeKey, number> = {
    power: 1.1,
    speed: 1.0,
    cardio: 1.1,
    durability: 1.0,
    strength: 0.7,
    strikingOffence: 1.2,
    kicking: 0.7,
    strikingDefence: 1.1,
    wrestling: 1.1,
    takedownDefence: 1.1,
    groundControl: 0.9,
    submissions: 0.8,
    scrambling: 0.8,
    fightIq: 1.2,
    composure: 1.0,
  };
  let acc = 0;
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) {
    acc += attrs[key] * weights[key];
    total += weights[key];
  }
  return round(acc / total, 1);
}
