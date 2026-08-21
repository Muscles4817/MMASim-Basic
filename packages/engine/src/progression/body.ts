/**
 * The body.
 *
 * Doc 31 § 12 step 2. This module generates an actual human being — height, skeletal frame, muscle,
 * body composition — and *derives* walking weight from it. That is the inversion the whole physical
 * redesign rests on, and it replaces two pieces of generation that had the causality backwards:
 *
 *   heightInches  = remap(division.limitLbs, 115, 265, 63, 76) ± 2
 *   walkingWeight = division.limitLbs × rng.range(1.04, 1.15)
 *   frame         = walkingWeight / 300 × 100
 *
 * Read that chain in order: the division decided the weight, the weight decided the frame, and the
 * frame is what `ceilingsFromNaturals` reads for Power, Strength and Durability. So the division
 * decided the physique, every lightweight had frame 55 ± 3, and **there was no such thing as a big
 * lightweight**. Here it runs the other way — frame and height are rolled first, walking weight
 * falls out of them, and which division a fighter competes in is a consequence of the body rather
 * than a cause of it.
 *
 * The height defect was independent and worse than it looked. `remap` is linear in the weight limit
 * where body mass goes as roughly height cubed, so the curve was wrong everywhere except at its
 * endpoints. Measured against the same game's hand-authored roster: generated lightweights came out
 * at 66.5" against a real 70.1", middleweights at 69.1" against 72.3". Every generated fighter below
 * heavyweight was three to four inches shorter than the fighters the game ships by hand, and
 * generated reach was height plus noise where the real distribution runs +2 to +3.
 *
 * **On calibrating against the seed roster.** Doc 31 § 0 is explicit that the hand-authored roster
 * is evidence rather than ground truth for *ratings*, because it predates the absolute scale. That
 * caution does not apply to heights, reaches and walking weights: those are real-world tale-of-the-
 * tape figures transcribed from actual fighters, not judgements about how hard somebody punches. So
 * the anthropometry here is fitted to them deliberately, and the ratings are not.
 */

import { clamp, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { DivisionId } from '../core/ids.js';
import { divisionsFor, getDivision, type Division, type Sex } from '../domain/divisions.js';
import { toRating, type Rating } from '../ratings/attributes.js';

/**
 * A generated human body.
 *
 * Five numbers, each with a job no other one can do — doc 31's rule for adding a hidden variable.
 * `frameIndex` and `muscleIndex` both raise lean mass and are still separate, because the pair
 * "large skeleton carrying little muscle" and "small skeleton carrying a lot" are different people
 * who need different amounts of time to change, and only the second can be trained.
 */
export interface Body {
  sex: Sex;
  heightInches: number;
  reachInches: number;
  /** Skeletal size for height, 1–100. Bone and joint structure. Never changes. */
  frameIndex: Rating;
  /** Muscle currently carried, 1–100. Moves across a career; the trainable half of mass. */
  muscleIndex: Rating;
  /** Body fat carried out of camp, 1–100. Higher is fatter. */
  bodyFatIndex: Rating;
  /** How much water and glycogen this body can shed in fight week, 1–100. */
  waterCutIndex: Rating;
}

// --- Composition -------------------------------------------------------------------------

/**
 * Lean mass goes as **height cubed**, not height squared.
 *
 * The obvious measure to reach for is fat-free mass index — lean kilograms over height in metres
 * squared — because it is what the sports-science literature reports. It is the wrong shape here,
 * and the hand-authored roster says so plainly. Fitting `lean / height^n` against its eight men's
 * divisions, which are transcribed real heights and walking weights rather than authored ratings:
 *
 * ```
 *   n = 2.0   19.5  20.3  21.3  21.7  22.3  23.4  23.7  26.6     spread 1.36
 *   n = 2.5   15.2  15.5  16.1  16.2  16.5  17.2  17.1  19.2     spread 1.26
 *   n = 3.0   11.8  11.9  12.1  12.2  12.3  12.7  12.4  13.8     spread 1.18
 * ```
 *
 * At n = 2 the coefficient climbs by a third from flyweight to heavyweight, which means a
 * height-squared model has to *invent* a correlation between height and build to reproduce real
 * bodies. At n = 3 it is flat to within eight per cent across the first seven divisions — mass
 * scales as volume scales as length cubed, which is not a surprise — and frame and muscle can then
 * be rolled independently of height, which is the entire point of having them.
 *
 * The residual is heavyweight, and it is real rather than error: heavyweight is the one division
 * with no upper limit, so its fighters carry mass deliberately and some of them carry it as fat.
 * The model reproduces that through selection rather than through a heavyweight coefficient.
 */
interface Composition {
  /** Lean kilograms per cubic metre of height, at zero frame and zero muscle. */
  base: number;
  fromFrame: number;
  fromMuscle: number;
  /** Body fat out of camp, at index 1 and index 100. */
  fatFloor: number;
  fatCeiling: number;
}

/**
 * Sex enters here rather than as a multiplier, for the same reason doc 31 § 2.3 gives the physical
 * ratings a per-sex pivot: women are not scaled-down men. Lean mass per unit height is lower and
 * essential body fat is roughly twelve per cent against three, so both the mass coefficient and the
 * fat band move, and they move by different amounts.
 *
 * Both sets are fitted to the roster's real anthropometry: the men's coefficient sits at 12.4 median
 * against a measured 11.8–12.7 across the first seven divisions, and the women's at 10.6 against a
 * measured 10.2–10.8 across all four.
 */
const COMPOSITION: Readonly<Record<Sex, Composition>> = {
  male: { base: 9.5, fromFrame: 2.6, fromMuscle: 3.2, fatFloor: 0.08, fatCeiling: 0.18 },
  female: { base: 8.2, fromFrame: 2.2, fromMuscle: 2.6, fatFloor: 0.15, fatCeiling: 0.25 },
};

/** Lean kilograms per cubic metre of height. The single number that says how much body this is. */
export function massCoefficient(body: Body): number {
  const c = COMPOSITION[body.sex];
  return c.base + (body.frameIndex / 100) * c.fromFrame + (body.muscleIndex / 100) * c.fromMuscle;
}

/** Body fat carried out of camp, as a fraction. */
export function bodyFatFraction(body: Body): number {
  const c = COMPOSITION[body.sex];
  return remap(body.bodyFatIndex, 1, 100, c.fatFloor, c.fatCeiling);
}

const KG_PER_LB = 0.45359237;
const M_PER_INCH = 0.0254;

/**
 * The part of a body a fighter carries around with them.
 *
 * `Body` also holds sex, height and reach, all three of which `Fighter` already stores, so storing a
 * whole `Body` would put three fields in two places and invite them to disagree. `bodyOf` reassembles
 * one when a caller needs the full API.
 */
export type Physique = Omit<Body, 'sex' | 'heightInches' | 'reachInches'>;

/** Lean body mass in pounds. Everything that is not fat. */
export function leanMassLbs(body: Body): number {
  const heightM = body.heightInches * M_PER_INCH;
  return (massCoefficient(body) * heightM ** 3) / KG_PER_LB;
}

/**
 * Natural walking weight out of camp, in pounds.
 *
 * The number the rest of the game already consumes — `cutSeverity`, the fight-night size advantage,
 * weight-miss risk — and the one that used to be handed down from the division limit.
 */
export function walkingWeightLbs(body: Body): number {
  return leanMassLbs(body) / (1 - bodyFatFraction(body));
}

// --- Making weight ------------------------------------------------------------------------

/**
 * Body fat at the end of a hard camp, before any water comes off.
 *
 * Fight camps end lean, and this is where they end. Below it a fighter is losing performance faster
 * than weight, which is the physiological reason a cut has a floor at all. Sex-specific because
 * essential fat is: a woman at seven per cent is not a lean athlete, she is in trouble.
 */
const CAMP_BODY_FAT: Readonly<Record<Sex, number>> = { male: 0.07, female: 0.13 };

/** Weight at the end of camp, dieted down but fully hydrated. */
export function campWeightLbs(body: Body): number {
  return leanMassLbs(body) / (1 - CAMP_BODY_FAT[body.sex]);
}

/**
 * Share of camp weight that can come off as water and glycogen in fight week.
 *
 * Four to nine per cent. The upper end is a genuinely dangerous cut performed by somebody whose body
 * tolerates it; the lower end is a fighter who simply cannot dehydrate that far without falling
 * apart, and who therefore has a higher division floor than his size alone suggests.
 */
export function waterCutFraction(body: Body): number {
  return remap(body.waterCutIndex, 1, 100, 0.04, 0.09);
}

/**
 * The lightest weight this body could conceivably hit on a scale, in pounds.
 *
 * A hard physiological floor rather than a comfortable target: a fighter at this number has dieted
 * to seven per cent body fat and taken off every pound of water he has. Nobody does this twice a
 * year. It exists so the creator can say *no* to a body that cannot make a division at all —
 * doc 31 § 12 step 10's "not viable" verdict — without a hard-coded height cap per class.
 */
export function weighInFloorLbs(body: Body): number {
  return campWeightLbs(body) * (1 - waterCutFraction(body));
}

/**
 * Signed margin against a limit, as a fraction of walking weight. Positive means over.
 *
 * The raw quantity, useful because it is monotone and comparable in both directions. **It is not a
 * cut**, and reporting it as one produced a diagnostic row reading `HW walking 243, cut % −9.3` —
 * which describes a 243 lb heavyweight performing a negative weight cut rather than a man who simply
 * competes under a 265 lb ceiling. Use `cutRequiredFraction` or `underLimitFraction` for anything a
 * human reads.
 */
export function weightMarginFraction(body: Body, limitLbs: number): number {
  const walking = walkingWeightLbs(body);
  return (walking - limitLbs) / walking;
}

/**
 * How much of their walking weight a fighter has to shed to make a limit. Never negative.
 *
 * Zero means no cut is required, which is a different statement from a small cut and should read as
 * one everywhere it is shown.
 */
export function cutRequiredFraction(body: Body, limitLbs: number): number {
  return Math.max(0, weightMarginFraction(body, limitLbs));
}

/**
 * How far under the class ceiling a fighter walks around, as a fraction. Never negative.
 *
 * The other half of the same measurement, and the one that means something in a division with no
 * floor: a heavyweight is not cutting −9%, he is walking 9% below the maximum. Zero for anybody who
 * has to cut at all.
 */
export function underLimitFraction(body: Body, limitLbs: number): number {
  return Math.max(0, -weightMarginFraction(body, limitLbs));
}

/** The same, in pounds, for a diagnostic that reads better in the sport's own units. */
export function underLimitLbs(body: Body, limitLbs: number): number {
  return Math.max(0, limitLbs - walkingWeightLbs(body));
}

// --- Decomposing the cut ---------------------------------------------------------------------

/**
 * The cut, taken apart term by term.
 *
 * Diagnostic rather than mechanism: nothing in the engine consumes this, and `weighInFloorLbs` is
 * still the single source of the answer. It exists because doc 31 § 14.6 asks a question the scalar
 * floor cannot answer — *which* assumption is rejecting a fighter who demonstrably made the weight.
 * A number that says 187.1 when the limit is 185 tells you that something is wrong by 2.1 lb and
 * nothing at all about what.
 *
 * The chain runs walking weight → camp weight → weigh-in floor, and each step removes a named pool.
 * Printing the pools beside each other is what makes it possible to say "his fat pool is 5 lb
 * because he is 9% body fat, and that is the whole shortfall" rather than "the model says no".
 */
export interface CutChain {
  /** Where the fighter lives between camps. */
  walkingWeightLbs: number;
  bodyFatFraction: number;
  /** Fat carried at walking weight. */
  fatMassLbs: number;
  /** Everything that is not fat. */
  leanMassLbs: number;
  /** Fat the model lets a camp burn: walking weight down to `CAMP_BODY_FAT`. */
  dietableFatLbs: number;
  /** End of camp, dieted down and fully hydrated. */
  campWeightLbs: number;
  /** Fat the model insists on keeping. Essential, and the reason a cut has a floor at all. */
  retainedFatLbs: number;
  /** Water and glycogen shed in fight week. The model's only transient pool. */
  transientLbs: number;
  transientFraction: number;
  /** Everything the model will not remove under any circumstances. */
  protectedMassLbs: number;
  /** The lightest number this body could put on a scale. */
  weighInFloorLbs: number;
}

/** Take the chain apart for one body. */
export function cutChain(body: Body): CutChain {
  const walking = walkingWeightLbs(body);
  const fatFraction = bodyFatFraction(body);
  const lean = leanMassLbs(body);
  const camp = campWeightLbs(body);
  const transient = camp * waterCutFraction(body);
  return {
    walkingWeightLbs: walking,
    bodyFatFraction: fatFraction,
    fatMassLbs: walking - lean,
    leanMassLbs: lean,
    dietableFatLbs: walking - camp,
    campWeightLbs: camp,
    retainedFatLbs: camp - lean,
    transientLbs: transient,
    transientFraction: waterCutFraction(body),
    protectedMassLbs: camp - transient,
    weighInFloorLbs: weighInFloorLbs(body),
  };
}

/**
 * What each assumption would have to become for this body to make this limit.
 *
 * The point of the exercise, and the reason it is a separate function from `cutChain`. When the
 * model rejects somebody, four different numbers could be at fault and the floor alone cannot say
 * which. This asks each in turn: *hold everything else, and what would you have to be?* An answer
 * inside the range the sport actually contains indicts that term; an answer outside it exonerates
 * it. A required camp body fat of 4% is a real number that lean fighters hit; a required walking
 * weight 15 lb below the estimate is an accusation against the estimate.
 *
 * All four are returned rather than a verdict, because reading them together is what identifies
 * interaction — the case where no single term is implausible but their product is.
 */
export interface CutRequirement {
  /** Pounds the floor sits above the limit. Zero or negative means the body already makes it. */
  shortfallLbs: number;
  /** Camp body fat this body would need to reach, holding everything else. */
  campBodyFat: number;
  /** Fight-week transient loss it would need, as a fraction of camp weight. */
  transientFraction: number;
  /** Walking weight the estimate would have to be, in pounds. */
  walkingWeightLbs: number;
  /** Out-of-camp body fat it would need to carry, as a fraction. */
  bodyFatFraction: number;
}

export function cutRequirement(body: Body, limitLbs: number): CutRequirement {
  const chain = cutChain(body);
  const lean = chain.leanMassLbs;
  const campFat = CAMP_BODY_FAT[body.sex];
  const water = chain.transientFraction;
  const fat = chain.bodyFatFraction;

  return {
    shortfallLbs: chain.weighInFloorLbs - limitLbs,
    // limit = lean / (1 - campFat') * (1 - water)
    campBodyFat: 1 - (lean * (1 - water)) / limitLbs,
    // limit = camp * (1 - water')
    transientFraction: 1 - limitLbs / chain.campWeightLbs,
    // limit = W' * (1 - fat) / (1 - campFat) * (1 - water)
    walkingWeightLbs: (limitLbs * (1 - campFat)) / ((1 - fat) * (1 - water)),
    // limit = W * (1 - fat') / (1 - campFat) * (1 - water)
    bodyFatFraction: 1 - (limitLbs * (1 - campFat)) / (chain.walkingWeightLbs * (1 - water)),
  };
}

export type WeightFit = 'comfortable' | 'typical' | 'severe' | 'extreme' | 'notViable';

/**
 * What making this division would cost this body.
 *
 * Bands measured against the hand-authored roster's real cuts, which run a mean of 8.2% over the
 * limit with a 90th percentile of 13.8% and a maximum of 20.7%. So `typical` covers the bulk of the
 * sport, `severe` is the top decile, and `extreme` is the handful of fighters everybody in the sport
 * worries about.
 */
export function weightFit(body: Body, divisionId: DivisionId): WeightFit {
  const limit = getDivision(divisionId).limitLbs;
  if (weighInFloorLbs(body) > limit) return 'notViable';
  const cut = weightMarginFraction(body, limit);
  if (cut <= 0.04) return 'comfortable';
  if (cut <= 0.11) return 'typical';
  if (cut <= 0.16) return 'severe';
  return 'extreme';
}

/** Every division this body could physiologically make, however unpleasantly. */
export function makeableDivisions(body: Body, sex: Sex): Division[] {
  return divisionsFor(sex).filter((d) => weighInFloorLbs(body) <= d.limitLbs);
}

/**
 * Which division this person actually competes in, or `undefined` if none of them will have them.
 *
 * Fighters go down until it hurts, not until it is impossible, so the first term is a *tolerance*
 * rather than the physiological floor — and the tolerance is individual, which is why two men of
 * identical size end up a division apart. `cutTolerance` is the largest cut this fighter would make
 * habitually.
 *
 * **`undefined` is a real answer and callers must handle it.** An earlier draft returned the heaviest
 * division as a fallback, on the reasoning that heavyweight has no ceiling — and it is wrong twice.
 * The women's ladder stops at 145 lb, so a woman whose floor is 150 is not a lighter-than-usual
 * featherweight, she is somebody this sport has no division for; the model must be able to say so
 * rather than quietly booking her at a weight she cannot make. Men run out at 265 far more rarely and
 * for the same reason. `body.test.ts` caught this as a generated women's featherweight walking 186 lb
 * whose own `weightFit` said `notViable`.
 */
export function chosenDivision(body: Body, sex: Sex, cutTolerance: number): Division | undefined {
  for (const division of divisionsFor(sex)) {
    if (weighInFloorLbs(body) > division.limitLbs) continue;
    if (weightMarginFraction(body, division.limitLbs) <= cutTolerance) return division;
  }
  // Nothing was within tolerance. If any division is physiologically makeable at all, the heaviest
  // body still fights — at the lightest one it can actually make, cheerfully over its tolerance.
  const makeable = makeableDivisions(body, sex);
  return makeable[0];
}

// --- Generation ---------------------------------------------------------------------------

/**
 * Height, in inches, of the population the sport draws from.
 *
 * Fitted to the hand-authored roster pooled across divisions, which is transcribed real-world data.
 * Men mean 70.5 and women 65.2, both with a standard deviation near 3 — a little wider than the
 * general population because combat sports select at both tails, the very small finding a home at
 * 125 and the very large at heavyweight.
 */
const HEIGHT: Readonly<Record<Sex, { mean: number; sd: number; min: number; max: number }>> = {
  male: { mean: 70.5, sd: 3.1, min: 61, max: 84 },
  female: { mean: 66.0, sd: 2.4, min: 58, max: 76 },
};

/**
 * Ape index — reach minus height — in inches.
 *
 * Mean +2.4 with a standard deviation of 2, measured off the hand-authored roster, whose per
 * division means run +1.3 to +3.1 and whose extremes run −2 to +9. Generation currently produces
 * roughly zero, which is why no generated fighter has ever had a reach advantage worth the name.
 *
 * Independent of frame on purpose: limb proportion and skeletal bulk are unrelated, and tying them
 * together would quietly make every big-framed fighter long-limbed as well.
 */
const APE_INDEX = { mean: 2.4, sd: 2.0, min: -3, max: 9 };

/**
 * How large a cut a fighter is habitually willing to make.
 *
 * Centred at 13%, which is a claim about *achieved* cuts rather than about willingness. A fighter
 * competes in the lightest division his tolerance allows, so the cut he actually makes is bounded
 * above by his tolerance and usually well below it — the binding constraint is normally where the
 * division limits happen to fall rather than what he would accept. Measured over the forward
 * population, a tolerance of 13% produces achieved cuts averaging 8–9%, against the hand-authored
 * roster's real 8.2% mean and 13.8% ninetieth percentile.
 *
 * It is a temperament as much as a physiology — some fighters accept a brutal camp for the size
 * advantage and some will not — and it is why two identical bodies compete a division apart.
 */
const CUT_TOLERANCE = { mean: 0.13, sd: 0.035, min: 0.04, max: 0.2 };

export function sampleCutTolerance(rng: Rng): number {
  return rng.normalClamped(
    CUT_TOLERANCE.mean,
    CUT_TOLERANCE.sd,
    CUT_TOLERANCE.min,
    CUT_TOLERANCE.max,
  );
}

/**
 * Roll a body, with no division in mind.
 *
 * This is the forward model and the only one there is. `sampleBodyForDivision` filters its output
 * rather than using a second set of numbers, which is what stops the create-a-fighter screen and the
 * world's newgen intake drifting into two different species — the failure doc 31 § 12 step 4 calls
 * out by name.
 */
export function sampleBody(rng: Rng, sex: Sex): Body {
  const h = HEIGHT[sex];
  const heightInches = Math.round(rng.normalClamped(h.mean, h.sd, h.min, h.max));
  const ape = Math.round(
    rng.normalClamped(APE_INDEX.mean, APE_INDEX.sd, APE_INDEX.min, APE_INDEX.max),
  );

  return {
    sex,
    heightInches,
    reachInches: heightInches + ape,
    frameIndex: toRating(rng.normalClamped(50, 18, 3, 99)),
    muscleIndex: toRating(rng.normalClamped(50, 16, 5, 99)),
    bodyFatIndex: toRating(rng.normalClamped(50, 18, 3, 99)),
    waterCutIndex: toRating(rng.normalClamped(50, 18, 3, 99)),
  };
}

/**
 * Attempts before `sampleBodyForDivision` gives up and reshapes rather than rerolls.
 *
 * Rejection sampling keeps the forward model's distribution exactly, which is the whole point, but a
 * division in the tail of the height distribution can reject for a long time. The fallback below is
 * reached rarely enough not to distort the population and often enough to matter for heavyweight.
 */
const REJECTION_ATTEMPTS = 60;

/**
 * A body that competes in a given division.
 *
 * Rejection sampling on `sampleBody`, so the population of any division is exactly the slice of the
 * general population that would have chosen it — not a separate distribution that happens to have
 * been given the same name.
 *
 * The fallback matters and is deliberately crude. When rejection fails, the body is nudged toward
 * the division by scaling height and frame rather than by rolling a fresh "heavyweight-shaped"
 * person, so the result is still a body from this model rather than from a second one. Its share of
 * the population is asserted in `body.test.ts`, because a fallback that fires often has silently
 * become the generator.
 */
export function sampleBodyForDivision(rng: Rng, sex: Sex, divisionId: DivisionId): Body {
  return sampleBodyForDivisionWithStats(rng, sex, divisionId).body;
}

/** A sampled body, with what it cost to get one. */
export interface BodySample {
  body: Body;
  /** How many forward draws were made. 1 means the first person rolled belonged here. */
  attempts: number;
  /** Whether rejection gave up and `forceIntoDivision` built the body instead. */
  fellBack: boolean;
}

/**
 * The same sampling, reporting what it cost.
 *
 * Split out for the permanent diagnostic rather than for callers. The fallback narrows the
 * distribution it replaces — it draws height from a tight normal around the division's implied
 * height instead of from the population — so a division where it fires often has quietly stopped
 * being sampled from the forward model at all, and that is invisible from the outside. Doc 31 § 10.3
 * asks for the rate to be reported by sex and division; `generation-profile.test.ts` prints it.
 *
 * It costs nothing on the hot path: `sampleBodyForDivision` is a thin wrapper and the counters are
 * two integers on the stack.
 */
export function sampleBodyForDivisionWithStats(
  rng: Rng,
  sex: Sex,
  divisionId: DivisionId,
): BodySample {
  const target = getDivision(divisionId);

  for (let attempt = 1; attempt <= REJECTION_ATTEMPTS; attempt++) {
    const body = sampleBody(rng, sex);
    const tolerance = sampleCutTolerance(rng);
    if (chosenDivision(body, sex, tolerance)?.id === target.id) {
      return { body, attempts: attempt, fellBack: false };
    }
  }

  return {
    body: forceIntoDivision(rng, sex, target),
    attempts: REJECTION_ATTEMPTS,
    fellBack: true,
  };
}

/**
 * Last resort: build a body around the division's mass instead of finding one that fits it.
 *
 * Solves for the lean mass a fighter of this division needs, then picks a height and lets frame and
 * muscle carry the remainder. The distribution this produces is narrower than the true conditional
 * one, which is exactly why the test bounds how often it runs.
 */
function forceIntoDivision(rng: Rng, sex: Sex, division: Division): Body {
  const h = HEIGHT[sex];
  const c = COMPOSITION[sex];
  const ladder = divisionsFor(sex);

  // Walking weight a fighter of this division typically carries: a little over the limit, and under
  // it in the terminal division, which has no ceiling and whose fighters do not cut to make it.
  const isTerminal = division.id === ladder[ladder.length - 1]!.id;
  const targetWalking =
    division.limitLbs * (isTerminal ? rng.range(0.88, 1.0) : rng.range(1.05, 1.14));

  const heightInches = Math.round(
    rng.normalClamped(heightForWalkingWeight(targetWalking, sex), 1.6, h.min, h.max),
  );
  const ape = Math.round(
    rng.normalClamped(APE_INDEX.mean, APE_INDEX.sd, APE_INDEX.min, APE_INDEX.max),
  );
  const bodyFatIndex = toRating(rng.normalClamped(50, 18, 3, 99));
  const fatFraction = remap(bodyFatIndex, 1, 100, c.fatFloor, c.fatCeiling);

  // Invert the composition chain for the coefficient this body needs, then split what is above the
  // base between frame and muscle at a ratio drawn the way `sampleBody` draws them.
  const heightM = heightInches * M_PER_INCH;
  const leanKg = targetWalking * (1 - fatFraction) * KG_PER_LB;
  const needed = clamp(leanKg / heightM ** 3, c.base, c.base + c.fromFrame + c.fromMuscle);
  const above = needed - c.base;
  const frameShare = rng.normalClamped(0.45, 0.15, 0.1, 0.9);

  const built: Body = {
    sex,
    heightInches,
    reachInches: heightInches + ape,
    frameIndex: toRating(((above * frameShare) / c.fromFrame) * 100),
    muscleIndex: toRating(((above * (1 - frameShare)) / c.fromMuscle) * 100),
    bodyFatIndex,
    waterCutIndex: toRating(rng.normalClamped(50, 18, 3, 99)),
  };

  /*
   * The clamp above can saturate — a height drawn well above the one this weight implies cannot be
   * brought down to the target by composition alone, because the coefficient bottoms out at `base`.
   * When that happens the body comes out heavier than asked for, and for a light division that means
   * a fighter who cannot make the weight he was generated for.
   *
   * So shrink the one dimension that always works. This is the crudest thing in the module and it is
   * confined to the last resort of a fallback, which `body.test.ts` bounds the frequency of.
   */
  let final = built;
  while (weighInFloorLbs(final) > division.limitLbs && final.heightInches > h.min) {
    final = { ...final, heightInches: final.heightInches - 1, reachInches: final.reachInches - 1 };
  }
  return final;
}

/**
 * Roughly how tall somebody who walks around at this weight tends to be.
 *
 * Only used by the fallback above. Derived from the model rather than tabulated: at the median
 * coefficient and median body fat, mass goes as height cubed, so height goes as the cube root of it.
 */
function heightForWalkingWeight(walkingLbs: number, sex: Sex): number {
  const c = COMPOSITION[sex];
  const median = c.base + (c.fromFrame + c.fromMuscle) * 0.5;
  const medianFat = (c.fatFloor + c.fatCeiling) / 2;
  const leanKg = walkingLbs * (1 - medianFat) * KG_PER_LB;
  const heightM = Math.cbrt(leanKg / median);
  return clamp(heightM / M_PER_INCH, HEIGHT[sex].min, HEIGHT[sex].max);
}

/**
 * The body a created fighter gets, from the choices the creation screen offers.
 *
 * Height, reach and frame are the player's; muscle, body fat and water tolerance are not, because
 * those are the parts a player would min-max and doc 31 § 12 step 10 removes exactly that. Passing
 * `undefined` for any of the three rolls it, so the same function serves a partly-filled creation
 * screen.
 */
export function bodyFromChoices(
  rng: Rng,
  sex: Sex,
  choices: { heightInches?: number; reachInches?: number; frameIndex?: number },
): Body {
  const rolled = sampleBody(rng, sex);
  const heightInches = choices.heightInches ?? rolled.heightInches;
  return {
    sex,
    heightInches,
    reachInches: choices.reachInches ?? heightInches + (rolled.reachInches - rolled.heightInches),
    frameIndex: choices.frameIndex !== undefined ? toRating(choices.frameIndex) : rolled.frameIndex,
    muscleIndex: rolled.muscleIndex,
    bodyFatIndex: rolled.bodyFatIndex,
    waterCutIndex: rolled.waterCutIndex,
  };
}

// --- What the rating ceilings read ---------------------------------------------------------

/**
 * The denominator that turns a mass in pounds into a 0–100 index.
 *
 * Chosen so the new indices land where `naturals.frame` used to, which is the whole point of the
 * number: `frame` was `walkingWeight / 300 × 100` and fed the Power, Strength, Durability and Cardio
 * ceilings with coefficients tuned against that scale. Replacing the *variable* without preserving
 * the *scale* would have silently retuned four ceilings at once and made the change unattributable.
 *
 * At a typical thirteen per cent body fat the two agree to about a point across the whole ladder:
 *
 * ```
 *   division    old frame (walk/300)    new lean index (lean/260)
 *   FLW                         44.7                         44.6
 *   LW                          56.3                         56.4
 *   HW                          80.7                         79.6
 * ```
 *
 * What is new is that they now come apart *within* a division. Two 180 lb fighters had identical
 * frames; a lean one and a soft one now differ by six points of the number that feeds their Power
 * and Strength ceilings, which is the entire reason the body model exists.
 */
const LEAN_INDEX_DIVISOR = 260;

/** Total mass on the same scale. Kept at `walkingWeight / 300` — the number `frame` always was. */
const CARRIED_INDEX_DIVISOR = 300;

/**
 * Contractile mass, as a 0–100 index.
 *
 * What the Power, Strength and Durability ceilings should always have been reading. Fat is not
 * contractile and does not resist head acceleration, so a soft heavyweight and a lean one of the
 * same scale weight are not the same puncher — a distinction `walkingWeight / 300` could not make.
 */
export function leanMassIndex(body: Body): number {
  return clamp((leanMassLbs(body) / LEAN_INDEX_DIVISOR) * 100, 5, 99);
}

/**
 * Everything the fighter has to move, as a 0–100 index.
 *
 * What the Cardio penalty reads, because relative aerobic capacity is measured per kilogram of
 * whatever is actually there — fat included, and fat especially.
 */
export function carriedMassIndex(body: Body): number {
  return clamp((walkingWeightLbs(body) / CARRIED_INDEX_DIVISOR) * 100, 5, 99);
}

/**
 * Absolute skeletal size, as a 0–100 index — the structural half of the body, with muscle removed.
 *
 * Computed as the lean mass this frame would carry at *median* muscle, so it moves with height and
 * `frameIndex` and not with how much the fighter currently lifts. That is what
 * `development.ts:carriedStrength` is actually asking: how much muscle this skeleton supports before
 * more of it starts costing cardio. Feeding it current muscle instead would make the interference
 * effect self-cancelling — get bigger, and the threshold for being too big moves with you.
 *
 * Note it is deliberately **not** `frameIndex`. That number is skeletal size *for height*, so a
 * large-framed flyweight scores the same as a large-framed heavyweight, and a flyweight does not
 * carry a heavyweight's muscle.
 */
export function skeletalIndex(body: Body): number {
  return leanMassIndex({ ...body, muscleIndex: 50 });
}

/** Reassemble a full `Body` from the parts a `Fighter` stores. */
export function bodyOf(fighter: {
  sex: Sex;
  heightInches: number;
  reachInches: number;
  physique: Physique;
}): Body {
  return {
    sex: fighter.sex,
    heightInches: fighter.heightInches,
    reachInches: fighter.reachInches,
    ...fighter.physique,
  };
}

/** The storable part of a rolled body. */
export function physiqueOf(body: Body): Physique {
  return {
    frameIndex: body.frameIndex,
    muscleIndex: body.muscleIndex,
    bodyFatIndex: body.bodyFatIndex,
    waterCutIndex: body.waterCutIndex,
  };
}

/**
 * Solve for a physique that produces a given height and walking weight.
 *
 * The seed roster hand-authors real fighters' heights and walking weights, and those are transcribed
 * measurements rather than model output — so the model has to accept them rather than overwrite them.
 * This inverts the composition chain: pick a body-fat level, work out the lean mass that implies, and
 * split what the base coefficient does not cover between frame and muscle.
 *
 * The split is deliberately even. Nothing in a tale of the tape says whether a 205 lb man is
 * big-boned or heavily muscled, so inventing a lean either way would be putting a number where there
 * is no information.
 */
export function physiqueForMeasurements(
  sex: Sex,
  heightInches: number,
  walkingWeightLbs: number,
  bodyFatIndex: Rating,
  waterCutIndex: Rating,
): Physique {
  const c = COMPOSITION[sex];
  const heightM = heightInches * M_PER_INCH;
  const fatFraction = remap(bodyFatIndex, 1, 100, c.fatFloor, c.fatCeiling);
  const leanKg = walkingWeightLbs * (1 - fatFraction) * KG_PER_LB;
  const needed = clamp(leanKg / heightM ** 3, c.base, c.base + c.fromFrame + c.fromMuscle);
  const above = needed - c.base;

  // Half each, in coefficient units, then converted back to the index each one is expressed in.
  return {
    frameIndex: toRating(((above * 0.5) / c.fromFrame) * 100),
    muscleIndex: toRating(((above * 0.5) / c.fromMuscle) * 100),
    bodyFatIndex,
    waterCutIndex,
  };
}
