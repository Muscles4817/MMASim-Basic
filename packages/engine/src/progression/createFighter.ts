/**
 * Creating the player's own fighter.
 *
 * The design problem: a create-a-fighter screen that hands out a points budget across
 * fifteen attributes invites min-maxing and produces incoherent people — Power 90 on a body
 * with no explosiveness, which the naturals layer says is impossible.
 *
 * So creation works the way generation does (doc 06): your **origin** sets your hidden
 * naturals, and the naturals decide your ceilings. A small discretionary allocation then
 * shapes where you already are within them. You are choosing what kind of athlete you are,
 * not buying numbers.
 *
 * Origin is three nested layers — talent, discipline, attainment — defined in `origin.ts`,
 * which is also where the reasoning for each layer lives. The flat `background` picker it
 * replaced is still accepted (see `resolveSpecOrigin`) because callers and saved fixtures
 * exist that use it, and because it is genuinely the same shape of input one layer down.
 */

import { birthDayForAge, type GameDay } from '../core/clock.js';
import { clamp } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { asFighterId } from '../core/ids.js';
import type { DivisionId, PromotionId } from '../core/ids.js';
import { type Sex } from '../domain/divisions.js';
import type { Fighter } from '../domain/fighter.js';
import { emptyRecordSummary, freshCondition } from '../domain/fighter.js';
import type { Personality } from '../domain/personality.js';
import { uniformPersonality } from '../domain/personality.js';
import type { TraitId } from '../domain/traits.js';
import { findTraitConflicts } from '../domain/traits.js';
import {
  ATTRIBUTE_KEYS,
  toRating,
  type AttributeKey,
  type Attributes,
  type Naturals,
} from '../ratings/attributes.js';
import { arrivalFactor, ceilingsFromNaturals, generateAptitudes } from './generation.js';
import {
  ATTAINMENT_META,
  DISCIPLINE_META,
  attainmentsForTalent,
  disciplinesForTalent,
  isAthleticOrigin,
  resolveOrigin,
  secondaryOptionsFor,
  type FighterOrigin,
  type ResolvedOrigin,
} from './origin.js';
import { isPhysical } from './development.js';
import { sampleBodyForDivision, walkingWeightLbs as walkingWeightOf } from './body.js';

/**
 * Where a fighter came from, flat.
 *
 * @deprecated Superseded by `CreateFighterSpec.origin` (talent / discipline / attainment).
 * Kept working, and kept producing bit-identical fighters for the same seed, because tests,
 * fixtures and the long-sim baselines were all built on it — see `resolveSpecOrigin`.
 */
export const BACKGROUNDS = [
  'wrestler',
  'boxer',
  'kickboxer',
  'grappler',
  'streetFighter',
  'athlete',
] as const;
export type Background = (typeof BACKGROUNDS)[number];

export interface BackgroundMeta {
  key: Background;
  label: string;
  blurb: string;
  /** Rating points added on top of the baseline, per attribute. */
  attributes: Readonly<Partial<Record<AttributeKey, number>>>;
  /** Naturals leaning, in rating points. */
  naturals: Readonly<Partial<Record<keyof Omit<Naturals, 'ageCurve'>, number>>>;
  /** The hole this background starts with, named plainly. */
  weakness: string;
}

export const BACKGROUND_META: Readonly<Record<Background, BackgroundMeta>> = {
  wrestler: {
    key: 'wrestler',
    label: 'Collegiate Wrestler',
    blurb: 'Years on the mat. You already know how to make people go where you want.',
    attributes: { wrestling: 16, takedownDefence: 13, strength: 8, groundControl: 7, cardio: 5 },
    naturals: { explosiveness: 6, engine: 5 },
    weakness: 'You have never been punched in the face properly.',
  },
  boxer: {
    key: 'boxer',
    label: 'Amateur Boxer',
    blurb: 'Real hands, real footwork, and a head that moves.',
    attributes: { strikingOffence: 16, strikingDefence: 11, speed: 7, power: 6 },
    naturals: { explosiveness: 5 },
    weakness: 'Everything below the waist is a mystery to you.',
  },
  kickboxer: {
    key: 'kickboxer',
    label: 'Muay Thai / Kickboxer',
    blurb: 'Long weapons, a clinch, and shins that have been conditioned the hard way.',
    attributes: { kicking: 16, strikingOffence: 9, strikingDefence: 8, durability: 5 },
    naturals: { explosiveness: 4, constitution: 4 },
    weakness: 'The first competent double leg will be a shock.',
  },
  grappler: {
    key: 'grappler',
    label: 'Jiu-Jitsu Black Belt',
    blurb: 'You are dangerous everywhere on the ground, including off your back.',
    attributes: { submissions: 17, scrambling: 12, groundControl: 8, fightIq: 4 },
    naturals: { recovery: 5, motorLearning: 4 },
    weakness: 'You have to get it there first, and standing up you are a target.',
  },
  streetFighter: {
    key: 'streetFighter',
    label: 'Came Up Fighting',
    blurb: 'No pedigree, no technique, and absolutely no fear.',
    attributes: { power: 12, durability: 11, composure: 8, strikingOffence: 4 },
    naturals: { constitution: 8, explosiveness: 5 },
    weakness: 'Nothing you do is technically correct, and good opponents will show you that.',
  },
  athlete: {
    key: 'athlete',
    label: 'Elite Athlete, New To This',
    blurb: 'Extraordinary raw material. Almost no idea what you are doing yet.',
    attributes: { speed: 10, cardio: 9, strength: 8, power: 6 },
    // The highest ceilings in the game, attached to the lowest starting skill. The long game.
    naturals: { explosiveness: 10, engine: 9, motorLearning: 8, recovery: 6 },
    weakness: 'You are an athlete pretending to be a fighter. For now.',
  },
};

/** Physical build. Shifts naturals and walking weight within a division. */
export const BUILDS = ['rangy', 'balanced', 'powerful'] as const;
export type Build = (typeof BUILDS)[number];

type NaturalLean = Readonly<Partial<Record<'explosiveness' | 'engine' | 'constitution', number>>>;

/**
 * What a build leans, in rating points on the naturals it actually implies.
 *
 * This used to be one signed `buildShift` applied to two naturals at once: **rangy cost four
 * points of explosiveness**, and explosiveness is the driver of speed. So the game's own word for
 * "long and light" quietly meant *slower*, which is not what the label says, not what the sport
 * looks like, and the single most misleading thing on the creation screen — a player building a
 * rangy, quick striker was choosing the slowest version of him available.
 *
 * Length is not a speed penalty, so there is no longer one. What a build genuinely trades is
 * carried mass: a thicker fighter hits harder and takes a shot better, and pays for it with the
 * engine, which is exactly what `frame` and `engine` already model. Powerful keeps a small
 * explosiveness lean because mass really does move force; rangy does not need a matching penalty
 * to be balanced, because it is already paying in `frame` — which enters power, strength and
 * durability — and being repaid in reach.
 */
const BUILD_NATURALS: Readonly<Record<Build, NaturalLean>> = {
  rangy: { engine: 5, constitution: -2 },
  balanced: {},
  powerful: { explosiveness: 3, engine: -5, constitution: 3 },
};

export const BUILD_META: Readonly<Record<Build, { label: string; blurb: string }>> = {
  rangy: {
    label: 'Rangy',
    blurb: 'Long and light for the weight. More reach, a better engine, less to hit you with.',
  },
  balanced: { label: 'Balanced', blurb: 'No particular physical advantage or disadvantage.' },
  powerful: {
    label: 'Powerful',
    blurb: 'Thick and heavy for the weight. Hits harder, takes one better, tires sooner.',
  },
};

/** Attributes the player may distribute their discretionary points across. */
export const ALLOCATABLE: readonly AttributeKey[] = ATTRIBUTE_KEYS;

/**
 * Discretionary points.
 *
 * Small on purpose. It is enough to say "I am the wrestler who can also punch a bit", not
 * enough to build a finished fighter. What you become is decided by training.
 */
export const CREATION_POINTS = 24;
/** No single attribute may take more than this at creation. */
export const MAX_POINTS_PER_ATTRIBUTE = 8;

export interface CreateFighterSpec {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  nationality: string;
  sex: Sex;
  age: number;
  divisionId: DivisionId;
  /**
   * The three-layer origin. Preferred, and what the creation screen sends.
   *
   * Optional only so that the deprecated `background` route keeps compiling; a spec with
   * neither is rejected by `validateCreation` rather than silently defaulted, because a
   * fighter with no origin is not a sensible thing to build.
   */
  origin?: FighterOrigin;
  /** @deprecated Use `origin`. Ignored when `origin` is present. */
  background?: Background;
  /**
   * Physique, which is orthogonal to origin: a rangy boxer and a powerful boxer are both
   * real people. Defaults to `balanced`.
   */
  build?: Build;
  stance?: 'orthodox' | 'southpaw' | 'switch';
  /** Discretionary points per attribute. Must total at most `CREATION_POINTS`. */
  allocation?: Partial<Record<AttributeKey, number>>;
  personality?: Partial<Personality>;
  traits?: readonly TraitId[];
  promotionId?: PromotionId;
  gymId?: string;
  day: GameDay;
}

export interface CreationIssue {
  field: string;
  message: string;
}

/**
 * Everything the origin layers can be wrong about.
 *
 * Separated out because the creation screen wants to check an origin on its own while the
 * player is still typing their name, and because the layer-3 filter is the design's central
 * claim: it has to be enforced here rather than only hidden in the UI, or the rule is a
 * suggestion that the first caller with a hand-written spec quietly breaks.
 */
export function validateOrigin(origin: FighterOrigin, age?: number): CreationIssue[] {
  const issues: CreationIssue[] = [];
  const disciplineLabel = DISCIPLINE_META[origin.discipline]?.label ?? origin.discipline;

  if (!disciplinesForTalent(origin.talent).includes(origin.discipline)) {
    issues.push({
      field: 'origin.discipline',
      message: `${disciplineLabel} is only open to fighters who were exceptional athletes first.`,
    });
  }

  if (!attainmentsForTalent(origin.talent).includes(origin.attainment)) {
    issues.push({
      field: 'origin.attainment',
      message: `Nobody reaches ${ATTAINMENT_META[origin.attainment].label.toLowerCase()} without the athleticism to match.`,
    });
  }

  if (origin.secondary && !secondaryOptionsFor(origin.discipline).includes(origin.secondary)) {
    issues.push({
      field: 'origin.secondary',
      message: isAthleticOrigin(origin.discipline)
        ? `${disciplineLabel} means you have never trained a martial art at all.`
        : 'Your second discipline has to be a different one.',
    });
  }

  const minAge = ATTAINMENT_META[origin.attainment].minDebutAge;
  if (age !== undefined && age < minAge) {
    issues.push({
      field: 'age',
      message: `Getting that far takes years: you cannot debut before ${minAge}.`,
    });
  }

  return issues;
}

/** Validate a creation spec. Empty means it is buildable. */
export function validateCreation(spec: CreateFighterSpec): CreationIssue[] {
  const issues: CreationIssue[] = [];

  if (!spec.firstName.trim())
    issues.push({ field: 'firstName', message: 'First name is required.' });
  if (!spec.lastName.trim()) issues.push({ field: 'lastName', message: 'Last name is required.' });
  if (spec.age < 18 || spec.age > 35) {
    issues.push({ field: 'age', message: 'Debut age must be between 18 and 35.' });
  }

  if (spec.origin) {
    issues.push(...validateOrigin(spec.origin, spec.age));
  } else if (!spec.background) {
    issues.push({ field: 'origin', message: 'Choose where you came from.' });
  }

  const allocation = spec.allocation ?? {};
  const spent = Object.values(allocation).reduce((a, v) => a + (v ?? 0), 0);
  if (spent > CREATION_POINTS) {
    issues.push({ field: 'allocation', message: `Only ${CREATION_POINTS} points are available.` });
  }
  for (const [key, value] of Object.entries(allocation)) {
    if ((value ?? 0) < 0) {
      issues.push({ field: key, message: 'Points cannot be negative.' });
    }
    if ((value ?? 0) > MAX_POINTS_PER_ATTRIBUTE) {
      issues.push({
        field: key,
        message: `No more than ${MAX_POINTS_PER_ATTRIBUTE} points in one attribute.`,
      });
    }
  }

  const conflicts = findTraitConflicts(spec.traits ?? []);
  for (const [a, b] of conflicts) {
    issues.push({ field: 'traits', message: `${a} and ${b} contradict each other.` });
  }

  return issues;
}

/**
 * Baseline a debutant starts from, before background, build and allocation.
 *
 * At 32 a created fighter debuted at an overall rating of about 36 — fifteen points below
 * the *worst* professional on the seeded roster and thirty below its median. That is not a
 * prospect, it is an amateur, and it made the climb arithmetically unclosable: a career is
 * roughly twenty-four useful camps before the learning rate collapses at thirty, and no
 * per-camp gain small enough to keep "one camp is barely visible" true can cover forty-two
 * points in twenty-four camps.
 *
 * At 46 they debut around 50 — at or just below the bottom of the professional roster,
 * plainly not ready for anybody ranked, and with a career's worth of growth between them
 * and a belt. The climb is still the game; it is now a climb that can actually be finished.
 *
 * Down to 44 with the physical rewrite above, and the two numbers have to be read together. That
 * change raises the five physicals by nine or ten points apiece, which on a fifteen-attribute
 * average is worth about three points of overall — so leaving this at 46 would have quietly moved
 * a created fighter's debut *past* the bottom of the professional roster and made the climb two
 * fights shorter.
 *
 * What changed is the **shape**, not the level. A created fighter used to be uniformly mediocre:
 * a little below average at everything, including the things nobody has to be taught. They now
 * debut as what they actually are — an athlete with a novice's hands — at the same overall the
 * design has always put them at. That is a better fighter to be handed, and it is the honest one:
 * the growth in a career comes from the technical half, and the technical half is where a
 * debutant genuinely has nothing.
 */
const BASELINE = 44;

/**
 * How much of their own physical ceiling a debutant has already reached, per attribute.
 *
 * This replaces a single flat `RAW_ATHLETE = 0.82` applied to all five physicals and described as
 * "the discount for never having been in a professional room". Two things were wrong with it.
 *
 * **It was an asymmetry, not a discount.** A *generated* debutant's physicals are
 * `potential × arrivalFactor` with nothing else applied — 0.91 of their speed ceiling at twenty.
 * A created fighter got 0.82 of that, so an identical body coming through the create screen was
 * eighteen per cent slower than the same body coming out of the generator, forever. The player's
 * own fighter was the one person in the world charged for it.
 *
 * **And it charged the wrong qualities.** `ARRIVAL` in `generation.ts` is explicit that "physical"
 * is not one thing: speed and a chin are *born*, and a twenty-one-year-old has all of both.
 * Strength and cardio are genuinely *built*, and a professional room is genuinely where that
 * happens. So the discount survives only where it was ever true, and at a size that reads as a
 * couple of years of proper strength and conditioning rather than as a tax on being new.
 *
 * The visible consequence is the one this exists for: a fighter built as fast **is fast on debut**.
 * Their hands and their wrestling are still a novice's, which is where a career's growth was always
 * supposed to come from.
 */
const RAW_ROOM: Readonly<Partial<Record<AttributeKey, number>>> = {
  speed: 1,
  durability: 1,
  power: 0.97,
  strength: 0.92,
  cardio: 0.92,
};

/**
 * How much of a discipline's physical bias is a fact about the body rather than about the training.
 *
 * A taekwondo background hands out eleven points of `speed`, and until now every one of them was
 * added to the *current* rating and then, if it happened to overshoot, quietly used to raise the
 * ceiling onto it. So the player's headline choice bought a number with no room left above it: the
 * screen said speed 66 against a ceiling of 70, which reads — correctly — as "the game has decided
 * you are not going to be fast".
 *
 * That is backwards for a physical. Nobody trains their way to being quick; the fast ones were
 * selected for being fast, by the sport they came out of. So half the bias goes into the *ceiling*
 * and the fighter then arrives at it on the normal age curve, which raises where they start **and**
 * leaves them somewhere to go.
 *
 * Half rather than all, because a discipline's bias is doing two jobs at once — a karateka is
 * quick partly because he is quick and partly because he has spent ten years learning to move —
 * and only the first half is a claim about the body.
 */
const ORIGIN_TO_BODY = 0.5;

/**
 * The same, for the points the player spends themselves.
 *
 * Slightly higher than the origin's share because it is a more direct statement of intent: a
 * player putting points into speed is saying "this fighter is fast", not "this fighter trained".
 * It is still not 1, or the allocation would be a ceiling purchase and the twenty-four points
 * would decide a career on their own.
 */
const ALLOCATION_TO_BODY = 0.6;

/** Room every physical keeps at debut, so no part of the body is finished before the first fight. */
const MIN_PHYSICAL_HEADROOM = 3;

/**
 * Build the player's fighter.
 *
 * Starts deliberately low. A created fighter is a genuine prospect — below major-promotion
 * level almost everywhere — because the game being offered is the climb, and a fighter who
 * starts at 70 has nowhere to go.
 */
/**
 * Where a created fighter's hidden athleticism is centred.
 *
 * This number decides the *ceiling* of the whole mode, because ceilings are derived from
 * naturals and nothing in play ever raises a ceiling. At its original 52 a created fighter's
 * potential-overall topped out at 71.2 across 2000 rolls, while the seeded champions rate
 * 78.4 to 84.6 — so becoming champion was not difficult, it was arithmetically impossible,
 * and the entire premise of the mode was unreachable by construction.
 *
 * At 66 a typical created fighter has the ceiling of a ranked contender and a good roll has
 * the ceiling of a champion. That is the correct shape: the belt should be a hard, uncertain
 * target rather than either a formality or a lie. It leaves them at roughly the equivalent
 * of a tier-76 generated prospect — a real talent, not the best athlete alive.
 *
 * Note this raises what they can *become*, not what they start as. Starting attributes come
 * from `BASELINE` plus background and allocation, and a created fighter still turns pro well
 * below anybody on a major roster.
 */
const NATURALS_BASELINE = 73;

/** Rating points of room every attribute has at debut, however the ceilings rolled. */
const MINIMUM_DEBUT_HEADROOM = 4;

/**
 * Turn whichever origin the spec carries into the one shape the builder below reads.
 *
 * The deprecated `background` route maps onto exactly the numbers it always used — the same
 * attribute table, the same naturals leaning, the same 73 centre, the same 5 reputation and
 * 1 star power — so an old spec and a seed produce the fighter they produced before. That
 * matters more than it looks: the long-sim career suite asserts a *distribution* over forty
 * seeded careers built through this path, and every one of those bounds was measured.
 */
function resolveSpecOrigin(spec: CreateFighterSpec): ResolvedOrigin {
  if (spec.origin) return resolveOrigin(spec.origin);

  // Only reachable through a spec `validateCreation` has already rejected, which
  // `createPlayerFighter` throws on — but `resolveSpecOrigin` must still be total.
  const background = BACKGROUND_META[spec.background ?? 'wrestler'];
  return {
    naturalsCentre: NATURALS_BASELINE,
    naturals: background.naturals,
    attributes: background.attributes,
    reputation: 5,
    starPower: 1,
  };
}

export function createPlayerFighter(spec: CreateFighterSpec, rng: Rng): Fighter {
  const issues = validateCreation(spec);
  if (issues.length > 0) {
    throw new Error(`Cannot create fighter: ${issues.map((i) => i.message).join(' ')}`);
  }

  const origin = resolveSpecOrigin(spec);

  const build = BUILD_NATURALS[spec.build ?? 'balanced'];

  /*
   * The player's fighter gets a body from the same forward model every other fighter does.
   *
   * Doc 31 § 12 step 2, and specifically its rule that the creator and the world's intake must not
   * be able to diverge: one model, sampled two ways. Height, reach and walking weight all used to be
   * computed here from `division.limitLbs` and `buildShift`, which is a second body model that
   * happened to agree with nothing.
   *
   * `build` still leans the naturals below and no longer touches the body at all — doc 31 § 12 step
   * 10 removes it outright in favour of height, reach and frame the player chooses directly.
   */
  const body = sampleBodyForDivision(rng.fork('body'), spec.sex, spec.divisionId);
  const walkingWeightLbs = Math.round(walkingWeightOf(body));

  // --- Naturals: background leaning, build, and a roll the player does not control --------
  /*
   * The roll is normal rather than uniform, and deliberately wide.
   *
   * A flat ±9 gave every created fighter almost the same ceiling: the distribution had no
   * tail, so nobody was ever exceptional and nobody was ever hopeless. The brief for this
   * game is that extreme outliers are genuinely extreme, and that has to be true of the
   * player's own fighter too — most people who turn pro have the ceiling of a solid roster
   * fighter, a few have the ceiling of a contender, and a rare one is the real thing.
   *
   * Motor learning gets the widest spread of all, because it is the number that decides how
   * much of the ceiling ever gets reached and the one the player has least say over. That is
   * the roll a career is quietly decided by.
   */
  const centre = origin.naturalsCentre;
  const naturals: Naturals = {
    frame: toRating(clamp((walkingWeightLbs / 300) * 100, 5, 99)),
    explosiveness: toRating(
      rng.normalClamped(
        centre + (origin.naturals.explosiveness ?? 0) + (build.explosiveness ?? 0),
        11,
        30,
        96,
      ),
    ),
    engine: toRating(
      rng.normalClamped(centre + (origin.naturals.engine ?? 0) + (build.engine ?? 0), 11, 30, 96),
    ),
    constitution: toRating(
      rng.normalClamped(
        centre + (origin.naturals.constitution ?? 0) + (build.constitution ?? 0),
        11,
        30,
        96,
      ),
    ),
    recovery: toRating(rng.normalClamped(centre + (origin.naturals.recovery ?? 0), 11, 30, 96)),
    // The single most important hidden number, and the one the player has least say over.
    motorLearning: toRating(
      rng.normalClamped(centre + (origin.naturals.motorLearning ?? 0), 14, 28, 97),
    ),
    injuryProneness: toRating(rng.normalClamped(46, 15, 12, 88)),
    ageCurve: rng.pickWeighted(
      ['standard', 'longPeak', 'lateBloomer', 'earlyBloomer'] as const,
      (c) => (c === 'standard' ? 5 : c === 'longPeak' ? 2.5 : c === 'lateBloomer' ? 2 : 1.5),
    ),
  };

  const potential = ceilingsFromNaturals(naturals, rng);

  // --- Current attributes ------------------------------------------------------------------
  const allocation = spec.allocation ?? {};
  const attributes = {} as Attributes;

  for (const key of ATTRIBUTE_KEYS) {
    const fromOrigin = origin.attributes[key] ?? 0;
    const fromAllocation = allocation[key] ?? 0;

    if (isPhysical(key)) {
      /*
       * Physicals come from the body, exactly like every other fighter in the world's do.
       *
       * They used to start at a flat 46 and rise 0.41 points per year of *age*, which said that
       * being 22 made you slower, weaker and less durable than the same person at 30 — the
       * opposite of what `ARRIVAL` says two files away and the opposite of the sport. It also
       * gave created starting physicals a standard deviation of 1.16 against the generated
       * world's 11, so no created fighter could ever be a physical outlier: a `freak` who rolled
       * explosiveness 85 debuted with power ~48 while a generated fighter with the identical
       * ceiling debuted at 77.5. Doc 23 § 4.6.
       *
       * What is new is *where the player's choices land*. Both the discipline's bias and the
       * allocated points now buy body — they raise the ceiling, and the fighter then arrives at
       * that raised ceiling on the same age curve everybody else uses. Adding them to the current
       * rating instead, as this did, produced the exact reading the whole change exists to remove:
       * a fighter built for speed who starts at 66 against a stated ceiling of 70, with the
       * player's own investment having bought four points and closed the door behind them.
       */
      const ceiling =
        potential[key] + fromOrigin * ORIGIN_TO_BODY + fromAllocation * ALLOCATION_TO_BODY;
      const arrived = ceiling * arrivalFactor(key, spec.age) * (RAW_ROOM[key] ?? 1);
      attributes[key] = toRating(arrived + rng.range(-2, 2));
      // A ceiling can only ever be raised to fit what the player chose, never lowered onto it —
      // and it always keeps a little room, so no physical is finished before the first fight.
      potential[key] = toRating(Math.max(ceiling, attributes[key] + MIN_PHYSICAL_HEADROOM));
      continue;
    }

    /*
     * Skills keep the flat base, because a debutant genuinely has not learned anything yet, and
     * keep a reduced experience term because an older debutant genuinely has. Capped at four
     * points rather than seven, and applied only here: mat time is what this number means, and
     * mat time does not make anybody's chin better.
     */
    const experience = Math.min(4, (spec.age - 18) * 0.25);
    const value = BASELINE + fromOrigin + fromAllocation + experience + rng.range(-2, 2);

    /*
     * The projection is raised to leave room, never lowered onto the value.
     *
     * A low roll used to silently eat the player's background and their allocated points, so a
     * boxer who put everything into striking could debut with the striking of a wrestler and
     * never learn why. Since doc 23 this ceiling is a *projection* rather than a wall, so the
     * headroom is a statement about where they would settle rather than a promise about what
     * they are allowed to reach.
     */
    potential[key] = toRating(Math.max(potential[key], value + MINIMUM_DEBUT_HEADROOM));
    attributes[key] = toRating(value);
  }

  /*
   * A created fighter must have a real hole, like everyone else on the roster — but the hole has
   * to be something they have not learned, not something their body cannot do. Punishing a
   * physical outlier for being one is exactly the behaviour this rewrite exists to remove.
   */
  const skills = ATTRIBUTE_KEYS.filter((k) => !isPhysical(k));
  const lowest = Math.min(...skills.map((k) => attributes[k]));
  if (lowest >= 50) {
    const weakest = skills.reduce((a, b) => (attributes[a] <= attributes[b] ? a : b));
    attributes[weakest] = toRating(attributes[weakest] - 8);
  }

  const summary = emptyRecordSummary();

  return {
    id: asFighterId(spec.id),
    firstName: spec.firstName.trim(),
    lastName: spec.lastName.trim(),
    nickname: spec.nickname?.trim() || undefined,
    nationality: spec.nationality,
    sex: spec.sex,
    birthDay: birthDayForAge(spec.age, spec.day, rng.int(1, 12), rng.int(1, 28)),
    walkingWeightLbs,
    heightInches: body.heightInches,
    reachInches: body.reachInches,
    stance: spec.stance ?? 'orthodox',

    divisionId: spec.divisionId,
    divisionHistory: [spec.divisionId],

    attributes,
    naturals,
    aptitudes: generateAptitudes(rng.fork('aptitudes'), naturals.motorLearning),
    potential,
    personality: { ...uniformPersonality(50), ...spec.personality },
    traits: spec.traits ?? [],

    condition: freshCondition(),
    record: [],
    priorRecord: summary,
    summary: { ...summary },

    promotionId: spec.promotionId,
    gymId: spec.gymId as Fighter['gymId'],

    /*
     * How well known you are on the day you turn pro — layer 3's real payload.
     *
     * Almost nobody, for almost everybody: a club-level debutant still starts at 1 and 5,
     * which is where every created fighter used to start. An Olympic medallist does not,
     * and `standingScore` is where that shows up — outside reputation carries into a new
     * promotion's rankings at a quarter of face value and fades over six bouts, so a name
     * gets you seeded above the nobodies and then six fights to justify it.
     */
    starPower: toRating(origin.starPower),
    bank: 0,
    lifetimeGross: 0,
    lifetimeNet: 0,
    resentment: 0,
    reputation: toRating(origin.reputation),

    proDebutDay: spec.day,
  };
}

/**
 * A short, honest read on a freshly-created fighter.
 *
 * Uses the same uncertainty machinery the player will meet everywhere else: this is what a
 * coach thinks looking at you, not a printout of your hidden ceilings.
 */
export function creationSummary(fighter: Fighter): string {
  const best = ATTRIBUTE_KEYS.reduce((a, b) =>
    fighter.attributes[a] >= fighter.attributes[b] ? a : b,
  );
  const worst = ATTRIBUTE_KEYS.reduce((a, b) =>
    fighter.attributes[a] <= fighter.attributes[b] ? a : b,
  );
  const upside = ATTRIBUTE_KEYS.reduce(
    (acc, k) => acc + (fighter.potential[k] - fighter.attributes[k]),
    0,
  );

  const ceiling =
    upside > 320
      ? 'an enormous amount of room to grow'
      : upside > 220
        ? 'real room to grow'
        : upside > 130
          ? 'some room to grow'
          : 'not a great deal of room left';

  return `Strongest right now in ${best}, weakest in ${worst}, with ${ceiling}.`;
}
