/**
 * Development, ageing and decay — how a fighter actually changes over a career.
 *
 * Without this the game has no arc: a career is a sequence of fights with a fixed fighter at
 * the centre of it. The whole point of hidden naturals and per-attribute ceilings (doc 06)
 * is that they decide *what a person can become*, and nothing decides anything until
 * something moves the numbers.
 *
 * Three forces, applied on different clocks:
 *   training  — in camp, directed by the player, gated by ceilings
 *   ageing    — continuous, and non-uniform: the body goes before the craft does
 *   decay     — out of camp, driven by Discipline
 */

import { ageOn, type GameDay } from '../core/clock.js';
import { clamp, remap, round } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';
import { campGainMultiplier, idleDecayMultiplier } from '../domain/personality.js';
import { coachEffectiveness, type Coach, type CoachSpecialism, type Gym } from '../domain/organisations.js';
import { traitMul } from '../domain/traits.js';
import {
  ATTRIBUTE_KEYS,
  toRating,
  type AgeCurve,
  type AttributeKey,
  type Attributes,
} from '../ratings/attributes.js';

/** What a training block concentrates on. Maps to coach specialisms. */
export const TRAINING_FOCUSES = [
  'boxing',
  'kicking',
  'wrestling',
  'submissions',
  'conditioning',
  'strategy',
] as const;
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];

export interface TrainingFocusMeta {
  key: TrainingFocus;
  label: string;
  blurb: string;
  /** Attributes this focus develops, and how strongly. */
  attributes: Readonly<Partial<Record<AttributeKey, number>>>;
  specialism: CoachSpecialism;
}

/**
 * What each focus actually trains.
 *
 * Weights are deliberately uneven and overlapping. A boxing camp builds the hands most, the
 * defence nearly as much, and a little speed — it does not raise five unrelated numbers by the
 * same amount, which is what makes choosing between focuses a real decision.
 *
 * **Striking is two focuses, since docs/19 phase 4.** It was one — `strikingOffence` at 1.0 and
 * `kicking` at 0.85 in the same block — and that made the game's own promise unkeepable: it offers
 * "Kickboxing / Muay Thai" as an identity and then hands the kickboxer a camp that moves them
 * toward being a boxer every time they take it. Measured, the gap closed to nothing inside
 * twenty-four camps. A fighter cannot persist as a kicker if the only striking camp available
 * makes them less of one, which is goal G3.
 *
 * Both halves map to the same `striking` coach specialism, deliberately: a striking coach coaches
 * striking, and splitting the *coach* table would have invalidated every gym in both seed rosters
 * to express something no player would ever see.
 *
 * **The weights sum to what a block is worth, not to what a discipline is worth.** `BASE_GAIN_PER_
 * BLOCK` applies to the primary attribute and the rest scale off it, so the *total* rating points a
 * camp delivers is the sum of its weights — 2.9 for wrestling, 2.35 for submissions, 2.3 for
 * conditioning. The first cut of this split summed to 2.1 and 2.05, which quietly made a striking
 * camp worth 30% less than the merged block it replaced: the long-sim caught it as careers peaking
 * a point and a half lower and the best created fighter no longer reaching champion level. A camp
 * is a camp, whatever is in it.
 */
export const TRAINING_META: Readonly<Record<TrainingFocus, TrainingFocusMeta>> = {
  boxing: {
    key: 'boxing',
    label: 'Boxing',
    blurb: 'Hands, head movement and the craft of not being there. Slow to build, slow to leave.',
    attributes: { strikingOffence: 1, strikingDefence: 0.9, speed: 0.4 },
    specialism: 'striking',
  },
  kicking: {
    key: 'kicking',
    label: 'Kicks',
    blurb: 'Shins, timing and range. The weapons that need a body built to throw them.',
    // `strength` where boxing takes `speed`: a kicking camp is conditioning for the legs as much
    // as it is technique, and it is what makes the two blocks feel different to spend a camp on.
    attributes: { kicking: 1, strikingDefence: 0.65, speed: 0.3, strength: 0.4 },
    specialism: 'striking',
  },
  wrestling: {
    key: 'wrestling',
    label: 'Wrestling',
    blurb: 'Entries, sprawls, and the strength to finish them.',
    attributes: { wrestling: 1, takedownDefence: 0.9, groundControl: 0.6, strength: 0.4 },
    specialism: 'wrestling',
  },
  submissions: {
    key: 'submissions',
    label: 'Submissions',
    blurb: 'Chains, transitions and getting out from underneath.',
    attributes: { submissions: 1, scrambling: 0.85, groundControl: 0.5 },
    specialism: 'submissions',
  },
  conditioning: {
    key: 'conditioning',
    label: 'Conditioning',
    blurb: 'The tank and the frame. The least glamorous camp and often the decisive one.',
    attributes: { cardio: 1, strength: 0.7, power: 0.35, durability: 0.25 },
    specialism: 'conditioning',
  },
  strategy: {
    key: 'strategy',
    label: 'Fight IQ',
    blurb: 'Film study, reads, and staying composed when the plan is failing.',
    attributes: { fightIq: 1, composure: 0.8, strikingDefence: 0.3, takedownDefence: 0.3 },
    specialism: 'strategy',
  },
};

/**
 * Rating points a four-week block adds to its primary attribute, before every modifier.
 *
 * Small, and compounding. The target is that one camp is barely visible on the fighter card
 * and two years of camps are transformative — a system where a single camp adds five points
 * makes the whole rating scale meaningless inside a season. Guarded by a test that asserts
 * both ends of that.
 */
const BASE_GAIN_PER_BLOCK = 3.474;

/**
 * How camp length converts into training blocks.
 *
 * Sub-linear, at `(weeks / 4) ^ 0.75`. The training screen has always told the player that
 * longer camps give more "with diminishing returns", doc 05 says the same about camp weeks,
 * and the formula was strictly linear in weeks — so the interface was describing behaviour
 * the engine did not have, and 4 / 8 / 12 was a false choice: three four-week camps and one
 * twelve-week camp came to precisely the same thing.
 *
 * With this, a short camp is more efficient per week and a long one is worth more in total,
 * which is what makes the duration an actual decision against ageing and injury risk. The
 * base gain above was raised from 0.55 to hold the common eight-week camp exactly where it
 * was, so this is a change in the *shape* of the curve rather than in its overall level.
 */
const BLOCK_CURVE = 0.75;

/**
 * Weeks at the start of any camp that produce no development.
 *
 * Diminishing returns *within* a camp, with no cost to starting a new one, made splitting
 * strictly correct: three four-week camps came to 3.00 blocks where one twelve-week camp came
 * to 2.28. The player who noticed got a 32% permanent advantage over the player who read the
 * screen and picked the long camp it recommends, which is the worst kind of hidden mechanic —
 * it punishes playing the game as presented.
 *
 * A ramp is the honest fix rather than an arbitrary penalty, because it is simply true: the
 * opening fortnight of a camp is spent getting back to where you left off, and every fighter
 * will tell you so. It gives the curve a fixed overhead per camp, which is what makes
 * consolidating worth doing.
 *
 * At two weeks the arithmetic inverts and stays inverted: 3 × 4wk = 1.78 blocks against
 * 1 × 12wk = 1.99. A four-week camp is now worth about 0.59 blocks rather than 1.00 — it is
 * a sharpening camp, not a development camp, which is exactly what four weeks is.
 *
 * `BASE_GAIN_PER_BLOCK` was raised from 2.8 to 3.474 alongside this, by exactly the ratio
 * that holds the standard eight-week camp where it was (2^0.75 / 1.5^0.75 = 1.2408) — the
 * same correction the original curve change made for the same reason. Without it this is a
 * 24% cut to all development rather than a change in shape, and the long-sim caught precisely
 * that: the best of forty simulated careers peaked at 75.1 against a champion bar of 78.4,
 * so a created fighter could no longer become champion at all.
 */
const CAMP_RAMP_WEEKS = 2;

/** Peak age by ageing curve. Learning slows toward it; the body declines after it. */
const PEAK_AGE: Readonly<Record<AgeCurve, number>> = {
  earlyBloomer: 26,
  standard: 29,
  longPeak: 31,
  lateBloomer: 33,
};

/**
 * How fast a fighter still learns, by age.
 *
 * Never reaches zero: a 38-year-old can still add a technique, they just cannot add much.
 * This is separate from decline — a veteran can be improving and shrinking at once, which is
 * exactly what a late-career technical fighter looks like.
 */
export function learningRate(age: number, curve: AgeCurve): number {
  const peak = PEAK_AGE[curve];
  if (age <= 20) return 1.45;
  /*
   * The tail is deliberately fat now, and this is a shape change rather than a level one.
   *
   * The old curve ran 1.45 at twenty to a 0.25 floor by roughly thirty-five, which meant a
   * career had about twenty productive camps in it before learning effectively stopped and
   * decline took over. Twenty camps is not enough to carry anybody from a debutant to a
   * champion at any per-camp gain that keeps a single camp from jumping a whole rating band
   * — so the two constraints were in direct conflict and the mode could not satisfy both.
   *
   * A floor of 0.55 rather than 0.25 roughly doubles the productive length of a career
   * without making any individual camp larger, which resolves it. It is also the more
   * truthful curve: fighters demonstrably keep adding craft into their late thirties, and
   * the engine already models the physical decline separately.
   */
  return clamp(remap(age, 20, peak + 8, 1.45, 0.55), 0.5, 1.45);
}

/**
 * Remaining headroom toward a ceiling, 0–1.
 *
 * Asymptotic on purpose. Going 60 → 70 is much easier than 80 → 85, and reaching a ceiling
 * exactly should be rare. A linear version has every long career converge on its ceilings
 * and the whole population flattens out.
 */
export function headroom(current: number, ceiling: number): number {
  if (ceiling <= current) return 0;
  return ((ceiling - current) / Math.max(1, ceiling)) ** 0.7;
}

export interface TrainingInput {
  fighter: Fighter;
  /** One or two focuses. Two splits the effort rather than doubling it. */
  focuses: readonly TrainingFocus[];
  weeks: number;
  gym?: Gym;
  coach?: Coach;
  day: GameDay;
  rng: Rng;
}

export interface TrainingResult {
  fighter: Fighter;
  /** Per-attribute change, for the post-camp report. Only non-zero entries. */
  gains: Partial<Record<AttributeKey, number>>;
  /** Plain-language notes: breakthroughs, plateaus, wasted camps. */
  notes: readonly string[];
}

/**
 * Run a training block.
 *
 * Gains are small and compounding by design — one camp should be barely visible, and two
 * years of camps should be transformative. A system where a single camp adds five points
 * makes ratings meaningless within a season.
 */
/** Weeks of camp, as effective training blocks. See `BLOCK_CURVE`. */
export const trainingBlocks = (weeks: number): number =>
  Math.pow(Math.max(0, weeks - CAMP_RAMP_WEEKS) / 4, BLOCK_CURVE);

/** The luck a camp can have, either way. Applied once per attribute per focus. */
const CAMP_LUCK: [min: number, max: number] = [0.75, 1.3];

/**
 * The deterministic core of a training gain, before luck.
 *
 * Extracted so `applyTraining` and `forecastTraining` are mathematically the same function.
 * A forecast computed from a second copy of this formula would drift the first time either
 * was tuned, and a forecast that lies is worse than no forecast at all.
 */
function rawGain(input: {
  fighter: Fighter;
  focus: TrainingFocus;
  key: AttributeKey;
  weight: number;
  current: number;
  blocks: number;
  focusShare: number;
  gym?: Gym;
  coach?: Coach;
  age: number;
}): number {
  const { fighter, focus, key, weight, current, blocks, focusShare, gym, coach, age } = input;

  const room = headroom(current, fighter.potential[key]);
  if (room <= 0) return 0;

  const meta = TRAINING_META[focus];
  const coachFactor = coach
    ? clamp(coachEffectiveness(coach, meta.specialism) / 60, 0.4, 1.6)
    : 0.55; // Training yourself works, badly.

  return (
    BASE_GAIN_PER_BLOCK *
    blocks *
    weight *
    focusShare *
    clamp(remap(fighter.naturals.motorLearning, 20, 95, 0.4, 1.8), 0.35, 1.9) *
    coachFactor *
    clamp(remap(gym?.quality ?? 40, 20, 95, 0.55, 1.3), 0.5, 1.35) *
    campGainMultiplier(fighter.personality) *
    traitMul(fighter.traits, 'developmentRate') *
    learningRate(age, fighter.naturals.ageCurve) *
    room
  );
}

export function applyTraining(input: TrainingInput): TrainingResult {
  const { fighter, weeks, gym, coach, day, rng } = input;
  const focuses = input.focuses.slice(0, 2);
  const notes: string[] = [];
  const gains: Partial<Record<AttributeKey, number>> = {};

  const age = ageOn(fighter.birthDay, day);
  const blocks = trainingBlocks(weeks);

  // Splitting focus costs: two focuses get 65% each, not 100% each.
  const focusShare = focuses.length > 1 ? 0.65 : 1;

  const attributes: Attributes = { ...fighter.attributes };
  const carry: Partial<Record<AttributeKey, number>> = { ...fighter.trainingCarry };

  for (const focus of focuses) {
    const meta = TRAINING_META[focus];

    for (const [key, weight] of Object.entries(meta.attributes) as [AttributeKey, number][]) {
      const current = attributes[key];
      const raw = rawGain({
        fighter,
        focus,
        key,
        weight,
        current,
        blocks,
        focusShare,
        gym,
        coach,
        age,
      });
      if (raw <= 0) continue;

      // A little noise so two identical camps are not identical. Never negative: a camp can
      // be wasted, but it cannot make you worse at the thing you drilled.
      const gain = Math.max(0, raw * rng.range(CAMP_LUCK[0], CAMP_LUCK[1]));
      if (gain <= 0) continue;

      /*
       * Bank the fraction rather than rounding it away.
       *
       * Ratings are integers and a camp produces tenths, so `toRating(current + gain)` threw
       * the remainder away every time. Measured at The Basement — the gym the game actually
       * starts a created fighter in, quality 44 and no head coach — that discarded 32 of 40
       * consecutive camps: four-fifths of the opening hours of the game moved nothing at
       * all. Worse, any attribute a focus trains at low weight could never move, because its
       * per-camp gain was permanently below the rounding threshold.
       *
       * With the carry, a poor room is *slow* instead of *inert*, which is the difference
       * between a difficulty curve and a broken system.
       */
      const banked = (carry[key] ?? 0) + gain;
      const whole = Math.floor(banked);
      carry[key] = round(banked - whole, 4);

      if (whole > 0) attributes[key] = toRating(current + whole);
      gains[key] = round((gains[key] ?? 0) + gain, 2);
    }
  }

  // --- Notes -----------------------------------------------------------------------------
  const total = Object.values(gains).reduce((a, v) => a + v, 0);
  const applied = ATTRIBUTE_KEYS.filter((k) => attributes[k] !== fighter.attributes[k]);

  if (total < 0.4) {
    notes.push(
      focuses.some((f) => headroomExhausted(fighter, f))
        ? 'Nothing left to learn there — that part of the game is as good as it is going to get.'
        : 'A flat camp. Very little to show for the weeks.',
    );
  } else if (total > 4) {
    notes.push('A breakthrough camp — genuine, visible improvement.');
  }

  if (!coach) notes.push('Training without a head coach costs a great deal of progress.');
  if (applied.length === 0) notes.push('No measurable change.');

  return {
    fighter: { ...fighter, attributes, trainingCarry: carry },
    gains,
    notes,
  };
}

/**
 * What a camp is likely to be worth, before it is run.
 *
 * The player was previously choosing a focus and a duration completely blind — the screen
 * offered "4 / 8 / 12 weeks" with a sentence about diminishing returns and no way to see
 * them. That is a decision with no information in it.
 *
 * This is deliberately a *range* rather than a number, computed from the same formula the
 * camp actually runs and the same luck bounds. A camp is not a purchase and should not read
 * like one — but "roughly +1.4 to +2.4 Striking Offence" is a real basis for choosing
 * between eight weeks and twelve, and it cannot drift from the truth because it shares the
 * arithmetic.
 */
export interface TrainingForecast {
  /** Per-attribute expected gain, at average luck. Only non-zero entries. */
  expected: Partial<Record<AttributeKey, number>>;
  /** Same attributes, at worst and best luck. */
  low: Partial<Record<AttributeKey, number>>;
  high: Partial<Record<AttributeKey, number>>;
  /** Summed expected gain across everything. The headline number. */
  totalExpected: number;
  /** True when every attribute the chosen focuses train is already at its ceiling. */
  atCeiling: boolean;
}

export function forecastTraining(input: Omit<TrainingInput, 'rng'>): TrainingForecast {
  const { fighter, weeks, gym, coach, day } = input;
  const focuses = input.focuses.slice(0, 2);

  const age = ageOn(fighter.birthDay, day);
  const blocks = trainingBlocks(weeks);
  const focusShare = focuses.length > 1 ? 0.65 : 1;

  const expected: Partial<Record<AttributeKey, number>> = {};
  const low: Partial<Record<AttributeKey, number>> = {};
  const high: Partial<Record<AttributeKey, number>> = {};

  for (const focus of focuses) {
    for (const [key, weight] of Object.entries(TRAINING_META[focus].attributes) as [
      AttributeKey,
      number,
    ][]) {
      const raw = rawGain({
        fighter,
        focus,
        key,
        weight,
        current: fighter.attributes[key],
        blocks,
        focusShare,
        gym,
        coach,
        age,
      });
      if (raw <= 0) continue;

      const mid = (CAMP_LUCK[0] + CAMP_LUCK[1]) / 2;
      expected[key] = round((expected[key] ?? 0) + raw * mid, 2);
      low[key] = round((low[key] ?? 0) + raw * CAMP_LUCK[0], 2);
      high[key] = round((high[key] ?? 0) + raw * CAMP_LUCK[1], 2);
    }
  }

  return {
    expected,
    low,
    high,
    totalExpected: round(
      Object.values(expected).reduce((a, v) => a + v, 0),
      2,
    ),
    atCeiling: focuses.length > 0 && focuses.every((f) => headroomExhausted(fighter, f)),
  };
}

/** True when every attribute a focus trains is already at its ceiling. */
function headroomExhausted(fighter: Fighter, focus: TrainingFocus): boolean {
  return Object.keys(TRAINING_META[focus].attributes).every(
    (key) => headroom(fighter.attributes[key as AttributeKey], fighter.potential[key as AttributeKey]) <= 0,
  );
}

// --- Ageing --------------------------------------------------------------------------------

/**
 * How fast each attribute declines past peak, as a multiplier on the base rate.
 *
 * Deliberately non-uniform. Explosiveness goes first and takes Power and Speed with it; the
 * engine fades slowly; and craft — Fight IQ, Submissions, Composure — can still be *rising*
 * while the body falls. That divergence is what a veteran's career actually looks like, and
 * a uniform decline curve cannot express it.
 */
const DECLINE_RATE: Readonly<Record<AttributeKey, number>> = {
  speed: 1.4,
  power: 1.15,
  strength: 0.9,
  cardio: 0.7,
  durability: 0.5, // Mostly eroded by trauma rather than by years. See `health`.
  wrestling: 0.8,
  scrambling: 1.0,
  takedownDefence: 0.7,
  kicking: 0.9,
  strikingOffence: 0.45,
  strikingDefence: 0.6,
  groundControl: 0.4,
  submissions: 0.15,
  fightIq: 0.0,
  composure: 0.0,
};

/** Rating points lost per year at one year past peak, before per-attribute rates. */
const BASE_DECLINE_PER_YEAR = 1.1;

export interface AgeingResult {
  fighter: Fighter;
  losses: Partial<Record<AttributeKey, number>>;
  notes: readonly string[];
}

/**
 * Apply ageing over a span of days.
 *
 * Called by the world tick, not per fight, so a fighter who sits out for two years ages the
 * same as one who fought four times.
 */
export function applyAgeing(fighter: Fighter, fromDay: GameDay, toDay: GameDay, rng: Rng): AgeingResult {
  const years = (toDay - fromDay) / 365;
  if (years <= 0) return { fighter, losses: {}, notes: [] };

  const age = ageOn(fighter.birthDay, toDay);
  const peak = PEAK_AGE[fighter.naturals.ageCurve];
  if (age <= peak) return { fighter, losses: {}, notes: [] };

  const yearsPast = age - peak;
  // Decline accelerates: the second five years past peak cost far more than the first.
  const severity = (yearsPast / 6) ** 1.35;

  const attributes: Attributes = { ...fighter.attributes };
  const losses: Partial<Record<AttributeKey, number>> = {};

  for (const key of ATTRIBUTE_KEYS) {
    const rate = DECLINE_RATE[key];
    if (rate <= 0) continue;

    const loss = BASE_DECLINE_PER_YEAR * years * rate * severity * rng.range(0.7, 1.3);
    if (loss <= 0) continue;

    // Decline has a floor: a former elite wrestler at 42 is diminished, not a novice. The
    // outer `min` matters — for a fighter whose ceiling in something is already below the
    // floor, a bare `max` would *raise* the attribute past its own ceiling. Ageing may only
    // ever take away.
    const floor = Math.max(12, fighter.potential[key] * 0.4);
    const next = toRating(Math.min(attributes[key], Math.max(floor, attributes[key] - loss)));
    if (next !== attributes[key]) {
      losses[key] = round(attributes[key] - next, 2);
      attributes[key] = next;
    }
  }

  const notes: string[] = [];
  const totalLoss = Object.values(losses).reduce((a, v) => a + v, 0);
  if (totalLoss > 3) notes.push(`${fighter.lastName} has visibly slowed down.`);

  return { fighter: { ...fighter, attributes }, losses, notes };
}

// --- Idle decay ----------------------------------------------------------------------------

/**
 * Skills fade out of camp, at a rate set by Discipline.
 *
 * This is what makes a `Party Animal` come back from a long layoff a visibly worse fighter,
 * and what makes a long inactive stretch a real cost rather than a free rest.
 */
export function applyIdleDecay(fighter: Fighter, days: number, rng: Rng): Fighter {
  // Under six weeks off is rest, not decay.
  const idleWeeks = days / 7;
  if (idleWeeks < 6) return fighter;

  const rate = 0.06 * (idleWeeks - 6) * idleDecayMultiplier(fighter.personality);
  if (rate <= 0) return fighter;

  const attributes: Attributes = { ...fighter.attributes };
  for (const key of ATTRIBUTE_KEYS) {
    // Conditioning goes fastest out of camp; technique is stickier.
    const sensitivity = key === 'cardio' ? 1.6 : key === 'speed' || key === 'strength' ? 1.1 : 0.5;
    const loss = rate * sensitivity * rng.range(0.7, 1.2);
    const floor = Math.max(10, fighter.attributes[key] * 0.75);
    attributes[key] = toRating(Math.max(floor, attributes[key] - loss));
  }
  return { ...fighter, attributes };
}
