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
import {
  ALL_TRAITS,
  findTraitConflicts,
  type AffinityAttribute,
  type TraitDef,
  type TraitId,
} from '../domain/traits.js';
import {
  AGE_CURVES,
  ATTRIBUTE_KEYS,
  toRating,
  type AttributeKey,
  type Attributes,
  type Aptitudes,
  type Naturals,
} from '../ratings/attributes.js';
import { generateName } from './names.js';

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

/**
 * Roll the hidden physiology.
 *
 * `tier` shifts the whole distribution but never guarantees anything: a tier-90 prospect
 * with an unlucky Constitution roll is a future contender with a suspect chin, which is a
 * far more interesting fighter than a uniformly-scaled one.
 */
/**
 * Four learning rates, drawn around `motorLearning`.
 *
 * The mean is the fighter's general trainability — which is exactly what the single number always
 * meant — and the per-family deviation is what makes a direction of development a real choice
 * rather than a matter of when you get there. SD 12 is wide enough that a fighter can be genuinely
 * gifted at one thing and ordinary at another, which is the common case in the sport, without
 * producing anybody who cannot learn at all.
 */
export function generateAptitudes(rng: Rng, motorLearning: number): Aptitudes {
  const roll = () => toRating(rng.normalClamped(motorLearning, 12, 8, 98));
  return {
    striking: roll(),
    grappling: roll(),
    conditioning: roll(),
    strategy: roll(),
  };
}

/**
 * How far a talent tier stretches at the very top.
 *
 * `remap(tier, 1, 100, 38, 78)` was the old mapping and the 78 was the whole problem: a *perfect*
 * tier produced naturals centred on 78, and since ceilings are derived from naturals, the game
 * could not generate a fighter with a genuinely elite ceiling at all. Measured over 20,000
 * debutants rolled the way `replenish` rolls them, **1.5%** had an overall potential of 80 or
 * better and **0.2%** reached 85. There was nothing at the top of the sport to grow into, so the
 * top of the sport never changed.
 */
const NATURALS_TOP = 97;

/**
 * The floor stays where it was, because most people who turn professional are ordinary and the
 * model was never wrong about that.
 */
const NATURALS_FLOOR = 38;

/**
 * Curved rather than linear, and that is the entire point of the change.
 *
 * A straight remap to a higher top lifts the *whole* distribution — raising the ceiling for the
 * gifted also makes the median debutant better, which is not what the sport looks like. Measured:
 * a linear map to 97 moved median potential from 57 to 65 and made a third of all debutants
 * capable of reaching 70, which is nonsense.
 *
 * An exponent above one keeps the bottom of the range exactly where it was and spends all of the
 * new headroom on the tail. At 1.5 the median debutant is unchanged (57 → 58) while fighters with
 * 80+ potential go from 1.5% to 5.4% and 85+ from 0.2% to 1.8%.
 *
 * That is the shape the design wants, and it is a claim about *potential* rather than about
 * outcomes. Most people carrying an elite ceiling will never get near it — the personality that
 * will not train, the knee that goes, the three losses that take the belief — and the model has
 * all of those. It just had nothing for them to act on: you cannot have a story about wasted
 * talent in a world with no talent in it. Played long enough, a golden generation with several
 * genuinely elite fighters in one division should now be *possible* without being likely.
 */
const NATURALS_CURVE = 1.5;

const naturalsCentre = (tier: number): number =>
  NATURALS_FLOOR + (clamp(tier, 1, 100) / 100) ** NATURALS_CURVE * (NATURALS_TOP - NATURALS_FLOOR);

export function generateNaturals(rng: Rng, tier: number, walkingWeightLbs: number): Naturals {
  const centre = naturalsCentre(tier);
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

  /*
   * Frame enters power and durability. Doc 23 § 4.4.
   *
   * On a scale doc 02 declares *absolute across divisions*, a 135 lb bantamweight and a 265 lb
   * heavyweight with the same explosiveness had identical punch-force ceilings. Body mass is a
   * primary determinant of peak punch force, and head and neck mass is what resists head
   * acceleration. `strength` already read `(explosiveness + frame)/2` and is the template.
   */
  const withFrame = (physical: number, frameWeight: number, skillWeight: number): number =>
    toRating(
      physical * (1 - frameWeight - skillWeight) +
        naturals.frame * frameWeight +
        skill * skillWeight +
        noise(),
    );

  /*
   * And it works against cardio, for the same physiology read the other way: aerobic capacity is
   * measured per kilogram, so a heavyweight does not have a lightweight's engine however he
   * trains. The same fact appears again as the interference effect in `development.ts`.
   */
  const framePenalty = Math.max(0, (naturals.frame - 60) / 40) * 8;

  return {
    power: withFrame(naturals.explosiveness, 0.25, 0.15),
    speed: cap(naturals.explosiveness, 0.25),
    cardio: toRating(cap(naturals.engine, 0.15) - framePenalty),
    durability: withFrame(naturals.constitution, 0.15, 0.05),
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

/**
 * How well a trait fits the fighter it is being considered for.
 *
 * A weight around 1, from the trait's `affinity` against the ratings already rolled. A trait with
 * no affinity always returns 1 and is therefore neither favoured nor penalised — most of the
 * business and camp traits say nothing about how good somebody is, and inventing a correlation
 * for them would be worse than the uniform draw this replaces.
 *
 * The band is deliberately wide but bounded. `TRAIT_FIT_FLOOR` above zero is the important end:
 * an unlikely trait has to stay *possible*, because "a heavyweight with no engine who fights like
 * a cardio machine anyway" is a fighter worth meeting occasionally, and a generator that can only
 * produce coherent people produces a roster with no texture.
 */
const TRAIT_FIT_FLOOR = 0.12;
const TRAIT_FIT_CEILING = 3;

export function traitFit(trait: TraitDef, attributes: Attributes): number {
  if (!trait.affinity) return 1;
  let fit = 1;
  for (const [key, weight] of Object.entries(trait.affinity) as [AffinityAttribute, number][]) {
    // Neutral at 50, doubled at 70, near zero at 30 for a weight of 1 — and it keeps going past
    // those, which is what puts an Iron Chin on the 95-durability fighter rather than merely on an
    // above-average one. The slope is steeper than it looks because generated debutants are
    // compressed: their attributes measure a mean of 42 with a standard deviation of 11, so a
    // rating of 70 is already exceptional rather than merely good.
    fit *= 1 + (weight * (attributes[key] - 50)) / 20;
  }
  return clamp(fit, TRAIT_FIT_FLOOR, TRAIT_FIT_CEILING);
}

/**
 * Roll traits, refusing any combination that contradicts itself.
 *
 * Weighted by `traitFit` since docs/19 phase 3. The uniform draw this replaces gave every fighter
 * a one-in-twelve chance per trait of each label in the table regardless of who they were, so the
 * roster carried cardio machines who gas, headhunters who cannot punch and chain wrestlers who
 * cannot wrestle at exactly the rate chance produces them — and a trait is the most *legible*
 * thing about a fighter, being what the scouting report and the profile screen lead with.
 */
export function generateTraits(rng: Rng, count = 2, attributes?: Attributes): TraitId[] {
  const traits: TraitId[] = [];
  // Acquired traits are earned in play, not handed out at generation.
  const pool = ALL_TRAITS.filter((t) => !t.acquirable);

  for (let attempt = 0; attempt < 30 && traits.length < count; attempt++) {
    const candidate = attributes
      ? rng.pickWeighted(pool, (t) => traitFit(t, attributes)).id
      : rng.pick(pool).id;
    if (traits.includes(candidate)) continue;
    if (findTraitConflicts([...traits, candidate]).length > 0) continue;
    traits.push(candidate);
  }
  return traits;
}

/**
 * How much of a given attribute's ceiling a fighter has already reached when they turn pro.
 *
 * One number per attribute, at 20 and at 30, because **"physical" is not one thing** and treating
 * it as one was the defect this replaces. Generation used a single `development` factor with a flat
 * +0.1 for the physical group, which put a 21-year-old's speed at **69% of their own ceiling** — a
 * debutant generated a third slower than they will ever be. Meanwhile the engine *already* models
 * the decline, in `PEAK_AGE` and the per-attribute decline rates in `development.ts`, so the young
 * were slow and the old were slow and peak speed landed somewhere near 28.
 *
 * The split is by how much of the quality is *built* rather than *born*:
 *
 *  - **`speed`** is the most innate thing in the sport. A 21-year-old is as fast as they will ever
 *    be, and everything after that is decline.
 *  - **`durability`** is a chin, and a chin is at its best before anybody has hit it. The engine
 *    erodes it separately through career `headTrauma`, so arriving near the ceiling is not a gift —
 *    it is the top of the only slope it has.
 *  - **`power`** is mostly explosiveness, with some technique in it.
 *  - **`strength`** is genuinely built, and the numbers still have to be sane: a 21-year-old
 *    professional who has been lifting since school is not at two thirds of their eventual max.
 *    The weight-room years are worth about a fifth, not a third — a first cut at 0.62 put **one
 *    per cent** of debutants above the median thirty-year-old's strength and produced no strong
 *    young fighters at all, which is not the sport. Brock Lesnar at 21 was stronger than most of
 *    the division's peak.
 *  - **`cardio`** is the most trainable quality a fighter has, and fight-specific conditioning is
 *    the thing camps exist for — but the same sanity check applies.
 *  - **Everything technical and mental** keeps the old `development` curve unchanged. Wrestling and
 *    fight IQ take a decade, which was never the part that was wrong.
 *
 * The consequence is deliberate and is the point: **an athletic freak now reads as one on the day
 * they debut.** The ceilings for it were always there — `explosiveness` rolls with a standard
 * deviation of 14 up to 97 — and arriving at 69% of them is what made every 21-year-old average.
 */
/**
 * Three points now — at 20, 26 and 34 — rather than two. Doc 23 § 4.3.
 *
 * A two-point band could only ever be monotonic in age, which meant every physical quality rose
 * from 20 to 30 and only then began to fall. For speed that is four years late; for **durability
 * it is simply backwards**, and the comment above this table has always said so while the numbers
 * said the opposite. MMA fighters aged 36–38 are knocked out at roughly twice the rate of 22–23
 * year olds. A chin has no peak to climb toward — it only ever has the top of its own slope.
 */
const ARRIVAL: Readonly<Partial<Record<AttributeKey, readonly [number, number, number]>>> = {
  speed: [0.91, 0.99, 0.94],
  durability: [0.97, 0.97, 0.9],
  power: [0.85, 0.99, 0.95],
  strength: [0.82, 0.95, 0.99],
  cardio: [0.78, 0.94, 0.99],
};

/**
 * Exported so `createPlayerFighter` uses the same curve rather than a second copy of it.
 *
 * `development` is optional here: a created fighter has no separate "how far along a career are
 * they" term, so the physical curve stands on its own. That is the point — a debutant is near
 * their physical ceiling and nowhere near their technical one, whichever door they came through.
 */
export function arrivalFactor(key: AttributeKey, age: number, development?: number): number {
  const band = ARRIVAL[key];
  if (!band) return development ?? 0;
  const [young, prime, old] = band;
  const physical = age <= 26 ? remap(age, 20, 26, young, prime) : remap(age, 26, 34, prime, old);
  if (development === undefined) return physical;
  // The same jitter the technical attributes get, so two fighters of the same age are not clones.
  return physical + (development - remap(age, 20, 30, 0.55, 0.85));
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
    const factor = arrivalFactor(key, age, development);
    // Clamped to the ceiling: the jitter could otherwise push a starting attribute a point
    // or two above its own potential, an invariant the seed roster is tested for.
    attributes[key] = toRating(
      Math.min(potential[key], potential[key] * clamp(factor, 0.35, 0.99) + rng.range(-3, 3)),
    );
  }

  const proBouts = Math.max(0, Math.round((age - 20) * rng.range(1.2, 2.8)));
  const losses = Math.round(proBouts * rng.range(0, 0.25));
  const summary = { ...emptyRecordSummary(), wins: proBouts - losses, losses, streak: 1 };

  /*
   * Name and nationality together, because they were drawn independently and it showed.
   *
   * The old pools were one flat list of thirty first names with no sex tagging and no link to
   * where anybody was from, so `rng.pick` produced men with women's names (231 of 661, measured)
   * and combinations like a Hiroshi Kowalski from Nigeria. `generateName` reads both.
   */
  const named = generateName(rng, options.sex, options.nationality);

  return {
    id: asFighterId(options.id),
    firstName: options.firstName ?? named.firstName,
    lastName: options.lastName ?? named.lastName,
    nationality: named.nationality,
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
    // Forked, so adding four rolls does not reshuffle every draw made after it and silently
    // move a decade of measured balance that has nothing to do with aptitudes.
    aptitudes: generateAptitudes(rng.fork('aptitudes'), naturals.motorLearning),
    potential,
    personality: generatePersonality(rng),
    traits: generateTraits(rng, rng.int(1, 3), attributes),

    condition: freshCondition(),
    record: [],
    priorRecord: summary,
    // A copy, not the same reference: aliasing these two is a trap waiting for the first
    // caller that mutates one of them.
    summary: { ...summary },

    promotionId: options.promotionId,

    // Nobody arrives famous. Star power is earned, and that is the point of having it.
    starPower: toRating(rng.normalClamped(12, 6, 1, 35)),
    bank: 0,
    lifetimeGross: 0,
    lifetimeNet: 0,
    resentment: 0,
    reputation: toRating(rng.normalClamped(25, 9, 5, 50)),

    /*
     * When they turned professional, which is not a fixed offset from how old they are.
     *
     * This was `age - 20` for everybody, so "years as a professional" carried no information that
     * age did not already carry — the two were the same number with a constant between them. That
     * matters now that mileage drives decline: the whole point is that a 30-year-old who turned
     * pro at 18 has more miles on him than a 30-year-old who turned pro at 25, and the model could
     * not tell them apart because it had decided they both turned pro at 20.
     *
     * Weighted toward the early twenties, with a real tail both ways: the teenager who came up
     * through a fight gym, and the wrestler who only turned to it after college.
     */
    proDebutDay: birthDayForAge(
      Math.max(0, age - Math.round(rng.normalClamped(21, 2.6, 17, 29))),
      options.day,
      1,
      1,
    ),
  };
}
