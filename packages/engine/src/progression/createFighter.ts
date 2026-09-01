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
import { bodyPriorFor, type FighterBackground } from './background.js';
import {
  ATTAINMENT_META,
  DISCIPLINE_META,
  isAthleticOrigin,
  resolveOrigin,
  secondaryOptionsFor,
  type FighterOrigin,
} from './origin.js';
import { isPhysical } from './development.js';
import {
  HEIGHT_RANGE,
  bodyFromChoices,
  campWeightLbs,
  cutChain,
  makeableDivisions,
  physiqueOf,
  walkingWeightLbs as walkingWeightOf,
  weighInFloorLbs,
  weightFit,
  type Body,
  type WeightFit,
} from './body.js';
import { getDivision } from '../domain/divisions.js';

/*
 * **The flat `BACKGROUNDS` picker and the three `BUILDS` were both deleted at doc 31 § 12 step 10.**
 *
 * `BACKGROUNDS` — wrestler, boxer, kickboxer, grappler, streetFighter, athlete — was the original
 * one-question creation screen. It was superseded by the layered origin two steps of design ago and
 * kept alive only so that fixtures and long-sim baselines built on it would keep compiling. Nothing
 * has sent one since; a deprecated path with no callers is a second creation model waiting to
 * disagree with the first.
 *
 * `BUILDS` — rangy, balanced, powerful — was a three-way proxy for a body, from before there was a
 * body. It leaned naturals from a *label*: rangy bought engine and gave up constitution, powerful
 * the reverse. That was the best available answer when `frame` was `walkingWeight / 300`, and doc 30
 * § 4.1 had already caught it telling a lie in the other direction, where rangy secretly meant slow.
 *
 * The player now states the three things a build was standing in for — how tall, how long, how
 * big-boned — and the physicals follow from them through the ladder rather than from a word. Three
 * continuous choices replace three discrete ones, and none of them is a number the model has to
 * translate.
 */

/**
 * Attributes the player may distribute their discretionary points across.
 *
 * **The five physicals left this list at doc 31 § 12 step 10**, and their removal is the point of
 * the step rather than a tightening of it. A physical is not a thing anybody has; it is a reading
 * taken off a body, on a scale where 43 points of Power is twice the impulse. So a creation point
 * spent on Power was a request for the model to disagree with itself: the ladder computes the
 * number from lean mass, and the point then overwrote it.
 *
 * The player buys the body instead — height, reach and frame, three measurable facts — and the
 * physicals follow. That is a strictly larger space of fighters than the eight points of Power ever
 * bought, and every one of them is a body the world could also have produced.
 *
 * The ten technical and mental attributes keep their points, because "I boxed a bit on the side"
 * is a true thing somebody can say about themselves and there is no equation that contradicts it.
 */
export const ALLOCATABLE: readonly AttributeKey[] = ATTRIBUTE_KEYS.filter((k) => !isPhysical(k));

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
  /** What you trained and how far you got at it. Two layers since step 10 deleted `talent`. */
  origin: FighterOrigin;
  /**
   * The body, as far as the player gets to choose it: how tall, how long, how big-boned.
   *
   * Every field is optional and an omitted one is rolled, so a half-filled creation screen is a
   * valid spec and the preview can be live from the first keystroke. What is deliberately *not*
   * here is muscle, body fat and water tolerance — see `bodyFromChoices`. Muscle is the one
   * primitive that moves over a career, so letting a debutant buy it would be selling them the
   * thing the next ten years are for; body fat is a camp variable rather than an identity; and
   * water-cut tolerance is a hidden fact you find out the first time you miss weight, which is
   * worth far more as a discovery than as a slider.
   */
  physique?: { heightInches?: number; reachInches?: number; frameIndex?: number };
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

  /*
   * The two talent gates that used to live here are gone with the layer that fed them.
   *
   * `disciplinesForTalent` kept the athletic branch off the menu below Natural, and
   * `attainmentsForTalent` kept Olympic off it below Freak. Both were the same idea — an elite
   * attainment is a claim about an elite athlete — expressed as a filter, and with `talent` deleted
   * there is nothing left to filter against. The claim itself survives as
   * `ATTAINMENT_META.naturals`, which is the honest direction for it to run.
   *
   * The `minDebutAge` check below is what now stops "Olympic" being the free pick, and it always
   * was the real balance: a fighter who arrives with a name arrives having spent the years it took
   * to build it.
   */
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

  issues.push(...validateOrigin(spec.origin, spec.age));
  issues.push(...validatePhysique(spec));

  const allocation = spec.allocation ?? {};
  const spent = Object.values(allocation).reduce((a, v) => a + (v ?? 0), 0);
  if (spent > CREATION_POINTS) {
    issues.push({ field: 'allocation', message: `Only ${CREATION_POINTS} points are available.` });
  }
  for (const [key, value] of Object.entries(allocation)) {
    if (isPhysical(key as AttributeKey)) {
      issues.push({
        field: key,
        message: `${key} is read off your body, not bought. Change your height, reach or frame instead.`,
      });
    }
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
 * How far a point of the discipline's Speed-over-Strength emphasis moves the force-velocity bias.
 *
 * Taekwondo's eleven points of Speed against no Strength is a clear statement, and it should land a
 * fighter most of a standard deviation toward the velocity end — enough to be the fighter the
 * discipline implies, not so much that the roll stops mattering.
 */
const BIAS_PER_LEAN_POINT = 2.4;

/** Room every physical keeps at debut, so no part of the body is finished before the first fight. */
const MIN_PHYSICAL_HEADROOM = 3;

/**
 * Build the player's fighter.
 *
 * Starts deliberately low. A created fighter is a genuine prospect — below major-promotion
 * level almost everywhere — because the game being offered is the climb, and a fighter who
 * starts at 70 has nowhere to go.
 */
/** Rating points of room every attribute has at debut, however the ceilings rolled. */
const MINIMUM_DEBUT_HEADROOM = 4;

/**
 * The body a created fighter gets.
 *
 * Doc 31 § 12 step 10, and the single largest change on this path since the ladder started.
 *
 * It was `sampleBodyForDivision`, which rejection-samples the forward model until it finds a body
 * that belongs in the division the player picked. That was right for step 2's purpose — it stopped
 * the creator and the world's intake being two species — but it means **the division chooses the
 * body**, which is the exact inversion the whole ladder exists to undo. The player said
 * "lightweight" and the game handed back a lightweight-shaped person.
 *
 * Now the player states the body and the division is a consequence they have to live with. Three
 * choices, all measurable: how tall, how long, how big-boned. Everything else is rolled, and the
 * division they asked for is checked against what that body can actually make (`validatePhysique`)
 * rather than quietly guaranteed.
 *
 * The discipline's body prior still applies, re-centred exactly as it is for the world's intake, so
 * a created thrower is built like the throwers around him. It shifts the *rolled* parts and the
 * unchosen ones; a height the player typed is the height they get.
 */
function bodyForCreation(rng: Rng, spec: CreateFighterSpec, background: FighterBackground): Body {
  /*
   * The prior shifts what is *rolled* and never what is typed.
   *
   * A player who types 74" gets 74". Folding the discipline's height prior into a stated height
   * would mean the slider and the fighter disagreed, which is the same class of bug as a division
   * choosing a body — the screen says one thing and the model does another.
   */
  return bodyFromChoices(
    rng,
    spec.sex,
    spec.physique ?? {},
    bodyPriorFor(background, spec.divisionId),
  );
}

/** What making the chosen division would cost the chosen body, for the creation screen's panel. */
export interface WeightFitPreview {
  walkingWeightLbs: number;
  campWeightLbs: number;
  fightWeekLossLbs: number;
  weighInFloorLbs: number;
  /** Fraction of camp weight that has to come off. Negative when the fighter is already under. */
  cutFraction: number;
  fit: WeightFit;
  /** Every division this body could physiologically make, lightest first. */
  makeable: readonly { id: DivisionId; shortName: string; limitLbs: number }[];
}

/**
 * The live Weight Fit panel, computed.
 *
 * The payoff of the ladder on this screen and the reason the body choices are worth offering at
 * all: a player moving the height slider watches their walking weight move, watches divisions drop
 * off the makeable list, and watches the cut they signed up for go from `typical` to `extreme`.
 * That is the model made legible, and it replaces a division dropdown that used to be free.
 *
 * Deterministic for a fully specified physique and stable enough to render on every keystroke for a
 * partial one, because the seed is the spec rather than a fresh roll.
 */
export function previewWeightFit(spec: CreateFighterSpec, rng: Rng): WeightFitPreview {
  const background: FighterBackground = {
    discipline: spec.origin.discipline,
    secondary: spec.origin.secondary,
    attainment: spec.origin.attainment,
  };
  const body = bodyForCreation(rng.fork('body'), spec, background);
  const chain = cutChain(body);
  const limit = getDivision(spec.divisionId).limitLbs;

  return {
    walkingWeightLbs: Math.round(walkingWeightOf(body)),
    campWeightLbs: Math.round(campWeightLbs(body)),
    fightWeekLossLbs: Math.round(chain.transient.totalLbs),
    weighInFloorLbs: Math.round(weighInFloorLbs(body)),
    cutFraction: (campWeightLbs(body) - limit) / campWeightLbs(body),
    fit: weightFit(body, spec.divisionId),
    makeable: makeableDivisions(body, spec.sex).map((d) => ({
      id: d.id,
      shortName: d.shortName,
      limitLbs: d.limitLbs,
    })),
  };
}

/**
 * Everything the three body choices can be wrong about.
 *
 * The height bound is the forward model's own, so a created fighter cannot be a size the world
 * could never produce. The division check is the one that matters and it is new: a body whose
 * weigh-in floor is above the limit **cannot make that weight at all**, not with a hard camp and
 * not with a bad one, and the old screen had no way to say so because the division was choosing
 * the body. It is stated as a fixable problem rather than a rejection — the panel next to it lists
 * the divisions that do work.
 */
export function validatePhysique(spec: CreateFighterSpec): CreationIssue[] {
  const issues: CreationIssue[] = [];
  const chosen = spec.physique ?? {};
  const range = HEIGHT_RANGE[spec.sex];

  if (chosen.heightInches !== undefined) {
    if (chosen.heightInches < range.min || chosen.heightInches > range.max) {
      issues.push({
        field: 'physique.heightInches',
        message: `Height has to be between ${range.min}" and ${range.max}".`,
      });
    }
  }
  if (chosen.reachInches !== undefined && chosen.heightInches !== undefined) {
    const ape = chosen.reachInches - chosen.heightInches;
    if (ape < -4 || ape > 10) {
      issues.push({
        field: 'physique.reachInches',
        message: 'Reach has to be within four inches under and ten over your height.',
      });
    }
  }
  if (chosen.frameIndex !== undefined && (chosen.frameIndex < 1 || chosen.frameIndex > 100)) {
    issues.push({ field: 'physique.frameIndex', message: 'Frame has to be between 1 and 100.' });
  }

  return issues;
}

export function createPlayerFighter(spec: CreateFighterSpec, rng: Rng): Fighter {
  const issues = validateCreation(spec);
  if (issues.length > 0) {
    throw new Error(`Cannot create fighter: ${issues.map((i) => i.message).join(' ')}`);
  }

  const origin = resolveOrigin(spec.origin);
  const allocation = spec.allocation ?? {};

  const background: FighterBackground = {
    discipline: spec.origin.discipline,
    secondary: spec.origin.secondary,
    attainment: spec.origin.attainment,
  };

  const body = bodyForCreation(rng.fork('body'), spec, background);
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
    explosiveness: toRating(
      rng.normalClamped(centre + (origin.naturals.explosiveness ?? 0), 11, 30, 96),
    ),
    /*
     * Where on the force–velocity curve the sport this fighter came out of has put them.
     *
     * Drawn flat like every generated fighter's, then moved by the discipline. Doc 31 § 19.3 makes
     * this the axis that separates Speed from Strength, so leaving it to the dice would mean a
     * created taekwondo player rolling force-biased half the time and getting a slow fighter
     * anyway — which is exactly what the origin tests caught the moment step 6 landed.
     *
     * **The allocation term left this expression at step 10** along with physical allocation
     * itself. It read the difference between points spent on Speed and points spent on Strength,
     * which was the closest thing the old screen had to "which kind of athlete am I" — and it was a
     * player buying a body through the attribute list. The discipline still says it, and now the
     * body says the rest of it directly.
     */
    forceVelocityBias: toRating(
      rng.normalClamped(50, 17.5, 5, 95) +
        BIAS_PER_LEAN_POINT * ((origin.attributes.speed ?? 0) - (origin.attributes.strength ?? 0)) +
        (origin.naturals.forceVelocityBias ?? 0),
    ),
    engine: toRating(rng.normalClamped(centre + (origin.naturals.engine ?? 0), 11, 30, 96)),
    constitution: toRating(
      rng.normalClamped(centre + (origin.naturals.constitution ?? 0), 11, 30, 96),
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

  const potential = ceilingsFromNaturals(naturals, body, rng);

  // --- Current attributes ------------------------------------------------------------------
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
       * The discipline's bias still buys body — it raises the ceiling, and the fighter then arrives
       * at that raised ceiling on the same age curve everybody else uses. Adding it to the current
       * rating instead, as this once did, produced the exact reading the change exists to remove: a
       * fighter built for speed who starts at 66 against a stated ceiling of 70, with his own
       * investment having bought four points and closed the door behind them.
       *
       * **The allocation term is gone at step 10.** `ALLOCATABLE` no longer contains a physical, so
       * `fromAllocation` was structurally zero here; what took its place is that the player chooses
       * the body the ceiling is computed from in the first place, which is a larger lever and an
       * honest one.
       */
      const ceiling = potential[key] + fromOrigin * ORIGIN_TO_BODY;
      const arrived = ceiling * arrivalFactor(key, spec.age) * (RAW_ROOM[key] ?? 1) + rng.range(-2, 2);

      // A ceiling can only ever be raised to fit what the player chose, never lowered onto it —
      // and it always keeps a little room, so no physical is finished before the first fight.
      potential[key] = toRating(Math.max(ceiling, arrived + MIN_PHYSICAL_HEADROOM));

      /*
       * **The scale ends at 100, and the headroom guarantee above did not know that.**
       *
       * `toRating` clamps, so a fighter whose ceiling saturates got `potential = 100` while the
       * attribute kept whatever it computed — and at the very top of the created range that is 100
       * as well. `origin.test.ts` asserts every created fighter has somewhere to grow in every
       * attribute, and this is the one place that could quietly be false: it needed an origin good
       * enough to push a physical into the clamp, and until step 10 gave the best athletic origins
       * their full lean, nothing did.
       *
       * When the ceiling saturates, the room has to come out of the attribute instead. A fighter
       * who debuts at their own limit is not a very good fighter, they are a finished one.
       */
      attributes[key] = toRating(Math.min(arrived, potential[key] - MIN_PHYSICAL_HEADROOM));
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
    physique: physiqueOf(body),
    stance: spec.stance ?? 'orthodox',
    background,

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
