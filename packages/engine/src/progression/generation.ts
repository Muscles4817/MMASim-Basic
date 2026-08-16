/**
 * Fighter generation.
 *
 * New people have to enter the sport, or a long world simply empties as the seed roster
 * ages out — which is exactly what the long-sim suite caught.
 *
 * Generation runs **naturals first**. A generated fighter's hidden physiology is rolled,
 * and their visible attributes are then derived from it plus their age and training so far.
 * Doing it the other way round produces physiologically impossible people (Cardio 90 on a
 * body with no engine) and, worse, makes potential meaningless — because potential is a
 * function of the naturals the attributes were supposed to come from.
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
import { PERSONALITY_AXES } from '../domain/personality.js';
import { ALL_TRAITS, findTraitConflicts, type TraitId } from '../domain/traits.js';
import {
  AGE_CURVES,
  ATTRIBUTE_KEYS,
  toRating,
  type AttributeKey,
  type Attributes,
  type Naturals,
} from '../ratings/attributes.js';

export interface GenerationOptions {
  id: string;
  divisionId: DivisionId;
  sex: Sex;
  day: GameDay;
  /** Age at debut. Defaults to 21–26. */
  age?: number;
  /**
   * 1–100. How good this prospect is *going to be*, not how good they are now. A 90 here is
   * a future champion who may still be rated in the 50s on debut.
   */
  tier?: number;
  promotionId?: PromotionId;
  firstName?: string;
  lastName?: string;
  nationality?: string;
}

const FIRST_NAMES = [
  'Aiden', 'Bruno', 'Caleb', 'Dmitri', 'Elias', 'Farid', 'Gabriel', 'Hugo', 'Ivan', 'Jonas',
  'Kai', 'Lucas', 'Mateo', 'Niko', 'Omar', 'Pavel', 'Rashid', 'Sami', 'Tomas', 'Viktor',
  'Ana', 'Bianca', 'Carla', 'Daniela', 'Elena', 'Fatima', 'Gina', 'Hana', 'Irina', 'Jade',
];

const LAST_NAMES = [
  'Abara', 'Baptiste', 'Cordero', 'Duran', 'Espinoza', 'Falk', 'Gomes', 'Haddad', 'Ivanov',
  'Jensen', 'Kowal', 'Lindqvist', 'Marchetti', 'Novak', 'Okonkwo', 'Petrov', 'Quintero',
  'Reyes', 'Silva', 'Tanaka', 'Ulloa', 'Vega', 'Whitfield', 'Yamada', 'Zborowski',
];

const NATIONALITIES = [
  'USA', 'Brazil', 'Russia', 'England', 'Mexico', 'Japan', 'Poland', 'Nigeria', 'Australia',
  'France', 'Georgia', 'South Korea', 'Sweden', 'Canada', 'Kazakhstan',
];

/**
 * Roll the hidden physiology.
 *
 * `tier` shifts the whole distribution but never guarantees anything: a tier-90 prospect
 * with an unlucky Constitution roll is a future contender with a suspect chin, which is a
 * far more interesting fighter than a uniformly-scaled one.
 */
export function generateNaturals(rng: Rng, tier: number, walkingWeightLbs: number): Naturals {
  const centre = remap(tier, 1, 100, 38, 78);
  const roll = (sd = 12) => toRating(rng.normalClamped(centre, sd, 12, 97));

  return {
    frame: toRating(clamp((walkingWeightLbs / 300) * 100, 5, 99)),
    explosiveness: roll(14),
    engine: roll(14),
    constitution: roll(13),
    recovery: roll(12),
    // Motor learning gets the widest spread: it is the single biggest driver of who
    // actually reaches their ceiling, and it should be the thing scouts get wrong most.
    motorLearning: roll(16),
    injuryProneness: toRating(rng.normalClamped(48, 16, 10, 92)),
    ageCurve: rng.pickWeighted(AGE_CURVES, (c) =>
      c === 'standard' ? 5 : c === 'longPeak' ? 2 : c === 'lateBloomer' ? 2 : 1.5,
    ),
  };
}

/**
 * Per-attribute ceilings implied by a set of naturals.
 *
 * Each attribute is capped by the physical qualities it actually depends on, plus a skill
 * term from motor learning. This is why there is no single "potential" number: a fighter
 * can have a 90 ceiling in wrestling and a 55 ceiling in power, and those are different
 * facts about their body.
 */
export function ceilingsFromNaturals(naturals: Naturals, rng: Rng): Attributes {
  const skill = naturals.motorLearning;
  const noise = () => rng.range(-6, 6);

  const cap = (physical: number, skillWeight: number): number =>
    toRating(physical * (1 - skillWeight) + skill * skillWeight + noise());

  return {
    power: cap(naturals.explosiveness, 0.15),
    speed: cap(naturals.explosiveness, 0.25),
    cardio: cap(naturals.engine, 0.15),
    durability: cap(naturals.constitution, 0.05),
    strength: cap((naturals.explosiveness + naturals.frame) / 2, 0.1),
    strikingOffence: cap(naturals.explosiveness, 0.7),
    kicking: cap(naturals.explosiveness, 0.7),
    strikingDefence: cap((naturals.explosiveness + naturals.recovery) / 2, 0.7),
    wrestling: cap((naturals.explosiveness + naturals.engine) / 2, 0.6),
    takedownDefence: cap((naturals.explosiveness + naturals.engine) / 2, 0.6),
    groundControl: cap(naturals.engine, 0.7),
    submissions: cap(naturals.recovery, 0.85),
    scrambling: cap((naturals.explosiveness + naturals.engine) / 2, 0.6),
    fightIq: cap(naturals.motorLearning, 0.9),
    composure: cap(naturals.recovery, 0.6),
  };
}

export function generatePersonality(rng: Rng): Personality {
  const p = {} as Personality;
  for (const axis of PERSONALITY_AXES) {
    p[axis] = toRating(rng.normalClamped(50, 18, 5, 98));
  }
  return p;
}

/** Roll traits, refusing any combination that contradicts itself. */
export function generateTraits(rng: Rng, count = 2): TraitId[] {
  const traits: TraitId[] = [];
  // Acquired traits are earned in play, not handed out at generation.
  const pool = ALL_TRAITS.filter((t) => !t.acquirable);

  for (let attempt = 0; attempt < 30 && traits.length < count; attempt++) {
    const candidate = rng.pick(pool).id;
    if (traits.includes(candidate)) continue;
    if (findTraitConflicts([...traits, candidate]).length > 0) continue;
    traits.push(candidate);
  }
  return traits;
}

/**
 * Generate a debuting fighter.
 *
 * Current attributes are their ceiling scaled by how much of a career they have had. A
 * 21-year-old debutant sits well below their ceiling everywhere, which is the entire point:
 * the interesting question about them is not what they are, it is what they might become.
 */
export function generateFighter(rng: Rng, options: GenerationOptions): Fighter {
  const tier = options.tier ?? toRating(rng.normalClamped(45, 18, 5, 95));
  const age = options.age ?? rng.int(21, 26);
  const division = getDivision(options.divisionId);

  // Walk around above the limit, by an amount that itself varies — some fighters cut hard.
  const walkingWeightLbs = Math.round(division.limitLbs * rng.range(1.04, 1.15));

  const naturals = generateNaturals(rng, tier, walkingWeightLbs);
  const potential = ceilingsFromNaturals(naturals, rng);

  // How developed they already are. Older debutants are further along but have less left.
  const development = clamp(remap(age, 20, 30, 0.55, 0.85) + rng.range(-0.06, 0.06), 0.4, 0.92);

  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    // Physical attributes arrive closer to their ceiling than technical ones — a 21-year-old
    // is already fast and strong, and is not yet a good wrestler.
    const physical: AttributeKey[] = ['power', 'speed', 'cardio', 'durability', 'strength'];
    const factor = physical.includes(key) ? development + 0.1 : development;
    // Clamped to the ceiling: the jitter could otherwise push a starting attribute a point
    // or two above its own potential, an invariant the seed roster is tested for.
    attributes[key] = toRating(
      Math.min(potential[key], potential[key] * clamp(factor, 0.35, 0.98) + rng.range(-3, 3)),
    );
  }

  const proBouts = Math.max(0, Math.round((age - 20) * rng.range(1.2, 2.8)));
  const losses = Math.round(proBouts * rng.range(0, 0.25));
  const summary = { ...emptyRecordSummary(), wins: proBouts - losses, losses, streak: 1 };

  return {
    id: asFighterId(options.id),
    firstName: options.firstName ?? rng.pick(FIRST_NAMES),
    lastName: options.lastName ?? rng.pick(LAST_NAMES),
    nationality: options.nationality ?? rng.pick(NATIONALITIES),
    sex: options.sex,
    birthDay: birthDayForAge(age, options.day, rng.int(1, 12), rng.int(1, 28)),
    walkingWeightLbs,
    heightInches: Math.round(remap(division.limitLbs, 115, 265, 63, 76) + rng.range(-2, 2)),
    reachInches: Math.round(remap(division.limitLbs, 115, 265, 63, 79) + rng.range(-2, 3)),
    stance: rng.pickWeighted(['orthodox', 'southpaw', 'switch'] as const, (s) =>
      s === 'orthodox' ? 7 : s === 'southpaw' ? 2.5 : 0.5,
    ),

    divisionId: options.divisionId,
    divisionHistory: [options.divisionId],

    attributes,
    naturals,
    potential,
    personality: generatePersonality(rng),
    traits: generateTraits(rng, rng.int(1, 3)),

    condition: freshCondition(),
    record: [],
    priorRecord: summary,
    // A copy, not the same reference: aliasing these two is a trap waiting for the first
    // caller that mutates one of them.
    summary: { ...summary },

    promotionId: options.promotionId,

    // Nobody arrives famous. Star power is earned, and that is the point of having it.
    starPower: toRating(rng.normalClamped(12, 6, 1, 35)),
    reputation: toRating(rng.normalClamped(25, 9, 5, 50)),

    proDebutDay: birthDayForAge(Math.max(0, age - 20), options.day, 1, 1),
  };
}
