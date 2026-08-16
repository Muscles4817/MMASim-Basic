/**
 * Creating the player's own fighter.
 *
 * The design problem: a create-a-fighter screen that hands out a points budget across
 * fifteen attributes invites min-maxing and produces incoherent people — Power 90 on a body
 * with no explosiveness, which the naturals layer says is impossible.
 *
 * So creation works the way generation does (doc 06): you choose a **background** and a
 * **physical build**, those set your hidden naturals, and the naturals decide your ceilings.
 * A small discretionary allocation then shapes where you already are within them. You are
 * choosing what kind of athlete you are, not buying numbers.
 */

import { birthDayForAge, type GameDay } from '../core/clock.js';
import { clamp, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { asFighterId } from '../core/ids.js';
import type { DivisionId, PromotionId } from '../core/ids.js';
import { getDivision, type Sex } from '../domain/divisions.js';
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
import { ceilingsFromNaturals } from './generation.js';

/** Where a fighter came from. Sets their starting shape and their natural leanings. */
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

export const BUILD_META: Readonly<Record<Build, { label: string; blurb: string }>> = {
  rangy: {
    label: 'Rangy',
    blurb: 'Long and light for the weight. More reach, less to hit you with.',
  },
  balanced: { label: 'Balanced', blurb: 'No particular physical advantage or disadvantage.' },
  powerful: {
    label: 'Powerful',
    blurb: 'Thick and heavy for the weight. Hits harder, cuts harder, tires sooner.',
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
  background: Background;
  build: Build;
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

/** Validate a creation spec. Empty means it is buildable. */
export function validateCreation(spec: CreateFighterSpec): CreationIssue[] {
  const issues: CreationIssue[] = [];

  if (!spec.firstName.trim()) issues.push({ field: 'firstName', message: 'First name is required.' });
  if (!spec.lastName.trim()) issues.push({ field: 'lastName', message: 'Last name is required.' });
  if (spec.age < 18 || spec.age > 35) {
    issues.push({ field: 'age', message: 'Debut age must be between 18 and 35.' });
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
 */
const BASELINE = 46;

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

export function createPlayerFighter(spec: CreateFighterSpec, rng: Rng): Fighter {
  const issues = validateCreation(spec);
  if (issues.length > 0) {
    throw new Error(`Cannot create fighter: ${issues.map((i) => i.message).join(' ')}`);
  }

  const division = getDivision(spec.divisionId);
  const background = BACKGROUND_META[spec.background];

  const buildShift = spec.build === 'powerful' ? 1 : spec.build === 'rangy' ? -1 : 0;
  const walkingWeightLbs = Math.round(division.limitLbs * (1.07 + buildShift * 0.035));

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
  const naturals: Naturals = {
    frame: toRating(clamp((walkingWeightLbs / 300) * 100, 5, 99)),
    explosiveness: toRating(
      rng.normalClamped(NATURALS_BASELINE + (background.naturals.explosiveness ?? 0) + buildShift * 4, 11, 30, 96),
    ),
    engine: toRating(
      rng.normalClamped(NATURALS_BASELINE + (background.naturals.engine ?? 0) - buildShift * 4, 11, 30, 96),
    ),
    constitution: toRating(
      rng.normalClamped(NATURALS_BASELINE + (background.naturals.constitution ?? 0), 11, 30, 96),
    ),
    recovery: toRating(rng.normalClamped(NATURALS_BASELINE + (background.naturals.recovery ?? 0), 11, 30, 96)),
    // The single most important hidden number, and the one the player has least say over.
    motorLearning: toRating(
      rng.normalClamped(NATURALS_BASELINE + (background.naturals.motorLearning ?? 0), 14, 28, 97),
    ),
    injuryProneness: toRating(rng.normalClamped(46, 15, 12, 88)),
    ageCurve: rng.pickWeighted(['standard', 'longPeak', 'lateBloomer', 'earlyBloomer'] as const, (c) =>
      c === 'standard' ? 5 : c === 'longPeak' ? 2.5 : c === 'lateBloomer' ? 2 : 1.5,
    ),
  };

  const potential = ceilingsFromNaturals(naturals, rng);

  // --- Current attributes ------------------------------------------------------------------
  const allocation = spec.allocation ?? {};
  const attributes = {} as Attributes;

  for (const key of ATTRIBUTE_KEYS) {
    const fromBackground = background.attributes[key] ?? 0;
    const fromAllocation = allocation[key] ?? 0;
    // Older debutants arrive slightly further along; they have less runway to use it.
    const experience = remap(spec.age, 18, 35, 0, 7);

    const value = BASELINE + fromBackground + fromAllocation + experience + rng.range(-2, 2);

    /*
     * A debutant has finished developing nowhere.
     *
     * The invariant is that an attribute never exceeds its ceiling, and the obvious way to
     * enforce it — clamping the starting value down to the ceiling — is subtly wrong at
     * creation: a low ceiling roll silently ate the player's background and their allocated
     * points, so a boxer who put everything into striking could debut with the striking of
     * a wrestler and never learn why. It also meant some attributes started *at* their
     * ceiling, so the very first camp could never move them.
     *
     * Raising the ceiling instead keeps every choice the player made visible and guarantees
     * there is somewhere to grow. The ceiling is hidden anyway; what the player sees is that
     * their choices took.
     */
    const raised = toRating(Math.max(potential[key], value + MINIMUM_DEBUT_HEADROOM));
    potential[key] = raised;
    attributes[key] = toRating(Math.min(raised, value));
  }

  // A created fighter must have a real hole, like everyone else on the roster.
  const lowest = Math.min(...ATTRIBUTE_KEYS.map((k) => attributes[k]));
  if (lowest >= 50) {
    const weakest = ATTRIBUTE_KEYS.reduce((a, b) => (attributes[a] <= attributes[b] ? a : b));
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
    heightInches: Math.round(
      remap(division.limitLbs, 115, 265, 63, 76) - buildShift * 1.5 + rng.range(-1, 1),
    ),
    reachInches: Math.round(
      remap(division.limitLbs, 115, 265, 63, 79) - buildShift * 2 + rng.range(-1, 1),
    ),
    stance: spec.stance ?? 'orthodox',

    divisionId: spec.divisionId,
    divisionHistory: [spec.divisionId],

    attributes,
    naturals,
    potential,
    personality: { ...uniformPersonality(50), ...spec.personality },
    traits: spec.traits ?? [],

    condition: freshCondition(),
    record: [],
    priorRecord: summary,
    summary: { ...summary },

    promotionId: spec.promotionId,
    gymId: spec.gymId as Fighter['gymId'],

    // Nobody knows who you are. That is the whole point.
    starPower: 1,
    bank: 0,
    lifetimeGross: 0,
    lifetimeNet: 0,
    resentment: 0,
    reputation: 5,

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
    upside > 320 ? 'an enormous amount of room to grow' :
    upside > 220 ? 'real room to grow' :
    upside > 130 ? 'some room to grow' :
    'not a great deal of room left';

  return `Strongest right now in ${best}, weakest in ${worst}, with ${ceiling}.`;
}
