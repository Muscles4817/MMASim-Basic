/**
 * Where a fighter came from, for the fighters nobody creates by hand.
 *
 * Doc 31 § 12 step 9. Until this landed, `origin.ts` was a **character-creation screen** rather
 * than a model: the player picked a discipline, its biases were folded into their naturals and
 * attributes, and the choice was then thrown away. Every one of the tens of thousands of fighters
 * the world generates had no sporting history at all, which had three consequences worth naming
 * because each of them is a bug the others hide:
 *
 *  1. **Nothing in the generated world had a style.** Technical ceilings are `motorLearning` plus
 *     six points of noise, so the wrestling and the kickboxing of a generated fighter differed by
 *     a coin flip. There were no wrestlers. There were fighters with slightly more wrestling.
 *  2. **The § 10.3 diagnostics could not be run.** Two of that section's rows — national sprinters
 *     against club jiu-jitsu players, distance runners' cardio floor — were written as permanent
 *     acceptance criteria for a dimension that did not exist.
 *  3. **Backgrounds could not be a body prior**, which is what `generation-profile.test.ts` says in
 *     its own comment it is waiting for: a rugby forward carrying more mass for his height than a
 *     distance runner.
 *
 * ## A background is a shape, not a bonus
 *
 * This is the load-bearing rule of the module and every exported function below enforces it.
 *
 * The obvious implementation — look up the discipline's biases and add them — inflates the world.
 * Wrestling is 24% of the intake and hands out `explosiveness +5, engine +5`; adding that raw does
 * not make wrestlers better than other fighters, it makes *the population* better, and the part
 * that looks like a wrestler is only the residual. The same is true of the body prior, the
 * realisation shares and the aptitude lean.
 *
 * So every prior is **re-centred against the population it is drawn from before it is applied**:
 * the intake-weighted mean bias for the fighter's own division is subtracted, leaving a
 * zero-sum redistribution. A wrestler is more explosive *than the fighters he is standing next
 * to*, not more explosive than he would have been with no history at all.
 *
 * Re-centring per **division** rather than globally is the deliberate half. Heavyweight draws more
 * throwers and rugby players than flyweight does (see `weightsFor`), and centring globally would
 * hand heavyweight a free lift on `constitution` and `explosiveness` — a caste claim about
 * divisions arriving through the back door of a background table. Within a division, backgrounds
 * are exactly zero-sum. Across divisions, the *mix* differs and nothing else does.
 *
 * `background.test.ts` asserts the zero-sum property directly, because it is the one thing here
 * that cannot be verified by reading.
 */

import { getDivision, type Sex } from '../domain/divisions.js';
import type { DivisionId } from '../core/ids.js';
import type { Rng } from '../core/rng.js';
import { PIVOT_WALKING_WEIGHT_LBS } from '../ratings/physicalScale.js';
import type { Aptitudes, AptitudeKey, AttributeKey, Naturals } from '../ratings/attributes.js';
import {
  ATTAINMENTS,
  ATTAINMENT_META,
  DISCIPLINES,
  DISCIPLINE_META,
  type Attainment,
  type BodyPrior,
  type Discipline,
  type OriginNaturalKey,
} from './origin.js';

/**
 * A fighter's sporting history, as stored.
 *
 * Three fields rather than four: `talent` is deliberately absent. It is a
 * character-creation concept — a dial on where the naturals roll centres — and once a fighter
 * exists their naturals *are* their talent. Storing it would be storing the input to a number
 * that is already stored, which is the mistake doc/02 records about derived ratings.
 */
export interface FighterBackground {
  discipline: Discipline;
  /** A second art, for the fighters who genuinely had one. */
  secondary?: Discipline;
  attainment: Attainment;
}

/**
 * How hard the division pulls on which backgrounds turn up in it.
 *
 * The weighting is `intake × exp(massAffinity × divisionZ × COUPLING)`, which is the standard way
 * to tilt a categorical distribution by a continuous covariate without inventing an eleven-by-twelve
 * table of hand-typed shares.
 *
 * At 0.75 a thrower is about eleven times likelier at heavyweight than at flyweight and a distance
 * runner about nine times likelier the other way, while the combat disciplines — whose affinities
 * sit between -0.3 and +0.3 — barely move at all. That last part is the check on the number: this
 * is meant to say "throwers are big", not to re-sort the entire sport by weight class.
 */
const MASS_COUPLING = 0.75;

/** Standard deviations of walking weight spanned by the division ladder, per sex. */
const DIVISION_MASS_SD = 0.42;

/**
 * Where a division sits on mass, in standard deviations from the median professional of that sex.
 *
 * Log-scaled because the ladder is: the divisions are roughly geometric in mass, so a linear
 * z-score would make heavyweight an outlier and squash everything below welterweight together.
 */
function divisionMassZ(divisionId: DivisionId): number {
  const division = getDivision(divisionId);
  const pivot = PIVOT_WALKING_WEIGHT_LBS[division.sex];
  return Math.log2(division.limitLbs / pivot) / DIVISION_MASS_SD;
}

/** The intake distribution over disciplines for one division. Sums to 1. */
export function weightsFor(divisionId: DivisionId): ReadonlyMap<Discipline, number> {
  const z = divisionMassZ(divisionId);
  const raw = DISCIPLINES.map(
    (d) =>
      [
        d,
        DISCIPLINE_META[d].intake * Math.exp(DISCIPLINE_META[d].massAffinity * z * MASS_COUPLING),
      ] as const,
  );
  const total = raw.reduce((acc, [, w]) => acc + w, 0);
  return new Map(raw.map(([d, w]) => [d, w / total]));
}

/**
 * The intake distribution over attainments for a fighter debuting at this age.
 *
 * Filtered by `minDebutAge` rather than scaled by it, for the reason `attainmentsForTalent` gives
 * about talent: you cannot medal at a world championship at twenty-one and also turn professional
 * at twenty-one. A 21-year-old debutant simply has no world-level rung available, and the
 * remaining shares renormalise. This is what stops the generated world filling with prodigies who
 * did not have time to become them.
 */
export function attainmentWeightsFor(age: number): ReadonlyMap<Attainment, number> {
  const open = ATTAINMENTS.filter((a) => age >= ATTAINMENT_META[a].minDebutAge);
  const total = open.reduce((acc, a) => acc + ATTAINMENT_META[a].intake, 0);
  return new Map(open.map((a) => [a, ATTAINMENT_META[a].intake / total]));
}

/** The population-weighted mean of one discipline field, for the re-centring rule. */
function meanOver<T extends string>(
  weights: ReadonlyMap<Discipline, number>,
  pick: (d: Discipline) => Readonly<Partial<Record<T, number>>>,
  key: T,
): number {
  let sum = 0;
  for (const [discipline, w] of weights) sum += w * (pick(discipline)[key] ?? 0);
  return sum;
}

/** The population-weighted mean realisation multiplier, for the same reason. */
function meanRealisation(age: number): number {
  let sum = 0;
  for (const [attainment, w] of attainmentWeightsFor(age)) {
    sum += w * ATTAINMENT_META[attainment].realisation;
  }
  return sum;
}

/**
 * Draw a background for a fighter of this division and age.
 *
 * A secondary art is offered to combat disciplines only and to about a fifth of them, which is the
 * same rule the creation screen uses (`secondaryOptionsFor`) and for the same reason: bolting a
 * sport onto an athletic origin would make the athletic branch a naturals bonus with no downside.
 */
export function sampleBackground(rng: Rng, divisionId: DivisionId, age: number): FighterBackground {
  const weights = weightsFor(divisionId);
  const discipline = rng.pickWeighted(DISCIPLINES, (d) => weights.get(d) ?? 0);
  const attainments = attainmentWeightsFor(age);
  const attainment = rng.pickWeighted([...attainments.keys()], (a) => attainments.get(a) ?? 0);

  const meta = DISCIPLINE_META[discipline];
  if (meta.kind === 'athletic' || rng.next() > 0.22) return { discipline, attainment };
  const others = DISCIPLINES.filter(
    (d) => d !== discipline && DISCIPLINE_META[d].kind === 'combat',
  );
  return { discipline, secondary: rng.pick(others), attainment };
}

/**
 * How much a secondary art is worth relative to the primary, everywhere in this module.
 *
 * The same 3:1 the creation screen uses. Conserving the total is what makes "a wrestler who can
 * box" and "a boxer who can wrestle" two different fighters rather than one fighter with more.
 */
const SECONDARY_SHARE = 0.25;

/** Blend a discipline field across a background's primary and secondary art. */
function blended<T extends string>(
  background: FighterBackground,
  pick: (d: Discipline) => Readonly<Partial<Record<T, number>>>,
  key: T,
): number {
  const primary = pick(background.discipline)[key] ?? 0;
  if (!background.secondary) return primary;
  return primary * (1 - SECONDARY_SHARE) + (pick(background.secondary)[key] ?? 0) * SECONDARY_SHARE;
}

/**
 * The body prior for this background, re-centred against its division.
 *
 * Returns the shift to apply to a sampled body, in index points (and inches for height). Every
 * component sums to zero over the division's intake — see the module comment.
 */
export function bodyPriorFor(background: FighterBackground, divisionId: DivisionId): BodyPrior {
  const weights = weightsFor(divisionId);
  const at = (key: keyof BodyPrior): number =>
    blended(background, (d) => DISCIPLINE_META[d].body, key) -
    meanOver(weights, (d) => DISCIPLINE_META[d].body, key);

  return {
    frameIndex: at('frameIndex'),
    muscleIndex: at('muscleIndex'),
    bodyFatIndex: at('bodyFatIndex'),
    heightInches: at('heightInches'),
  };
}

/**
 * The naturals lean for this background, re-centred against its division.
 *
 * Scaled by attainment's `skill` for the same reason the creation screen scales it: a national-team
 * wrestler was selected harder than a club one. The multiplier is re-centred too, or the scaling
 * would smuggle the inflation back in through the side the biases came out of.
 */
export function naturalsLeanFor(
  background: FighterBackground,
  divisionId: DivisionId,
  age: number,
): Readonly<Partial<Record<OriginNaturalKey, number>>> {
  const weights = weightsFor(divisionId);
  const meanSkill = (() => {
    let sum = 0;
    for (const [a, w] of attainmentWeightsFor(age)) sum += w * ATTAINMENT_META[a].skill;
    return sum;
  })();
  const scale = ATTAINMENT_META[background.attainment].skill / meanSkill;

  const keys: OriginNaturalKey[] = [
    'explosiveness',
    'forceVelocityBias',
    'engine',
    'constitution',
    'recovery',
    'motorLearning',
  ];
  const out: Partial<Record<OriginNaturalKey, number>> = {};
  for (const key of keys) {
    const own = blended(background, (d) => DISCIPLINE_META[d].naturals, key);
    out[key] = own * scale - meanOver(weights, (d) => DISCIPLINE_META[d].naturals, key);
  }
  return out;
}

/** Apply a naturals lean to a rolled set of naturals. Pure. */
export function leanNaturals(
  naturals: Naturals,
  lean: Readonly<Partial<Record<OriginNaturalKey, number>>>,
): Naturals {
  const out = { ...naturals };
  for (const [key, delta] of Object.entries(lean) as [OriginNaturalKey, number][]) {
    out[key] = Math.max(1, Math.min(100, Math.round(out[key] + delta)));
  }
  return out;
}

/**
 * Extra share of their own ceiling this background has already realised, per attribute.
 *
 * Zero-sum against the division intake, exactly like the others: a wrestler is further along on
 * wrestling and *behind* on everything else, because a decade spent on one thing is a decade not
 * spent on the other fourteen. That subtraction is not a penalty bolted on to balance the bonus —
 * it is the same number, seen from the other side, and it is the reason a background cannot be
 * farmed by taking the one with the largest table.
 */
export function realisationFor(
  background: FighterBackground,
  divisionId: DivisionId,
  age: number,
): Readonly<Partial<Record<AttributeKey, number>>> {
  const weights = weightsFor(divisionId);
  const scale = ATTAINMENT_META[background.attainment].realisation;
  const meanScale = meanRealisation(age);

  const keys = new Set<AttributeKey>();
  for (const d of DISCIPLINES) {
    for (const k of Object.keys(DISCIPLINE_META[d].realises)) keys.add(k as AttributeKey);
  }

  const out: Partial<Record<AttributeKey, number>> = {};
  for (const key of keys) {
    const own = blended(background, (d) => DISCIPLINE_META[d].realises, key) * scale;
    const mean = meanOver(weights, (d) => DISCIPLINE_META[d].realises, key) * meanScale;
    out[key] = own - mean;
  }
  return out;
}

/**
 * The aptitude lean for this background, re-centred against its division.
 *
 * Realisation alone would be a debut artefact. Every generated fighter's technical ceilings sit
 * within a few points of each other, so a wrestler who merely *starts* further along on wrestling
 * converges on the same flat card by thirty and stops being a wrestler. The aptitude lean is what
 * makes the history durable, and it does it through the system doc 23 § 2.2 built for exactly this
 * — a rate of learning per family — rather than by raising a ceiling, which would make a background
 * a talent purchase.
 */
export function aptitudeLeanFor(
  background: FighterBackground,
  divisionId: DivisionId,
): Readonly<Partial<Record<AptitudeKey, number>>> {
  const weights = weightsFor(divisionId);
  const keys = new Set<AptitudeKey>();
  for (const d of DISCIPLINES) {
    for (const k of Object.keys(DISCIPLINE_META[d].aptitude)) keys.add(k as AptitudeKey);
  }
  const out: Partial<Record<AptitudeKey, number>> = {};
  for (const key of keys) {
    out[key] =
      blended(background, (d) => DISCIPLINE_META[d].aptitude, key) -
      meanOver(weights, (d) => DISCIPLINE_META[d].aptitude, key);
  }
  return out;
}

/** How a background reads on a fighter profile. Combat and non-combat say the rung differently. */
export function describeBackground(background: FighterBackground, sex?: Sex): string {
  void sex;
  const meta = DISCIPLINE_META[background.discipline];
  const attainment = ATTAINMENT_META[background.attainment];
  const rung = meta.kind === 'combat' ? attainment.label : attainment.athleticLabel;
  const primary = background.secondary
    ? `${meta.label} / ${DISCIPLINE_META[background.secondary].label}`
    : meta.label;
  return `${primary} (${rung})`;
}

/** Apply an aptitude lean to a rolled set of aptitudes. Pure. */
export function leanAptitudes(
  aptitudes: Aptitudes,
  lean: Readonly<Partial<Record<AptitudeKey, number>>>,
): Aptitudes {
  const out = { ...aptitudes };
  for (const [key, delta] of Object.entries(lean) as [AptitudeKey, number][]) {
    out[key] = Math.max(1, Math.min(100, Math.round(out[key] + delta)));
  }
  return out;
}
