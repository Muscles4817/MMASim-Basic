/**
 * Acute injuries.
 *
 * Distinct from the accumulated career damage in `health` terms (doc 07): trauma and wear are
 * slow, permanent and invisible until they end a career, whereas an injury is a discrete
 * event with a name, a duration and a decision attached to it.
 *
 * The decision is the point. A hand broken in week six of camp is not a punishment — it is a
 * question: pull out, or take the fight hurt and tell nobody. Fighters genuinely make that
 * choice, and a system that only ever cancels the fight throws the interesting half away.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { ageOn, type GameDay } from '../core/clock.js';
import { asId, type InjuryId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { traitMul } from '../domain/traits.js';
import type { AttributeKey, Attributes } from '../ratings/attributes.js';
import { toRating } from '../ratings/attributes.js';
import type { Corner, ReducedFightResult } from '../fight/types.js';
import { isKoMethod, type FinishMethod } from '../domain/fighter.js';

export const INJURY_TYPES = [
  'hand',
  'knee',
  'shoulder',
  'rib',
  'cut',
  'concussion',
  'back',
  'ankle',
] as const;
export type InjuryType = (typeof INJURY_TYPES)[number];

export interface InjuryMeta {
  type: InjuryType;
  label: string;
  /** What it feels like, for the news line and the medical report. */
  blurb: string;
  /** Recovery in weeks, before the `recovery` natural and traits are applied. */
  weeks: [min: number, max: number];
  /** Attributes suppressed while carrying it, as a fraction removed at full severity. */
  suppresses: Readonly<Partial<Record<AttributeKey, number>>>;
  /** 0–1. How likely this recurs once it is on the record. */
  recurrence: number;
  /** Relative likelihood of occurring in camp. Cuts, for instance, never do. */
  campWeight: number;
  /** Relative likelihood of occurring in a fight. */
  fightWeight: number;
}

export const INJURY_META: Readonly<Record<InjuryType, InjuryMeta>> = {
  hand: {
    type: 'hand',
    label: 'Hand',
    blurb: 'Broken hand. The classic "he was hurt going in" excuse, and usually a true one.',
    weeks: [6, 14],
    suppresses: { strikingOffence: 0.22, power: 0.15 },
    recurrence: 0.35,
    campWeight: 1.4,
    fightWeight: 1.6,
  },
  knee: {
    type: 'knee',
    label: 'Knee ligament',
    blurb: 'Ligament damage. The one that takes a year and takes the explosiveness with it.',
    weeks: [20, 40],
    suppresses: { speed: 0.2, wrestling: 0.25, takedownDefence: 0.2, scrambling: 0.2 },
    recurrence: 0.45,
    campWeight: 1.2,
    fightWeight: 0.7,
  },
  shoulder: {
    type: 'shoulder',
    label: 'Shoulder',
    blurb: 'Torn labrum. Everything that involves an underhook now hurts.',
    weeks: [10, 20],
    suppresses: { wrestling: 0.2, submissions: 0.18, strength: 0.15 },
    recurrence: 0.35,
    campWeight: 1.1,
    fightWeight: 0.8,
  },
  rib: {
    type: 'rib',
    label: 'Ribs',
    blurb: 'Cracked ribs. Breathing is the problem, not the pain.',
    weeks: [4, 8],
    suppresses: { cardio: 0.2, composure: 0.1 },
    recurrence: 0.25,
    campWeight: 1.0,
    fightWeight: 1.2,
  },
  cut: {
    type: 'cut',
    label: 'Facial cut',
    blurb: 'A cut that needed stitches. It will open again the first time it is touched.',
    weeks: [2, 4],
    suppresses: {},
    recurrence: 0.6,
    // Cuts happen in fights, never in camp.
    campWeight: 0,
    fightWeight: 2.2,
  },
  concussion: {
    type: 'concussion',
    label: 'Concussion',
    blurb: 'A medical suspension, and a note on the record that follows you.',
    weeks: [8, 24],
    suppresses: { composure: 0.15, fightIq: 0.08 },
    recurrence: 0.4,
    campWeight: 0.3,
    fightWeight: 1.4,
  },
  back: {
    type: 'back',
    label: 'Back',
    blurb: 'A back that will now flare up every camp for the rest of the career.',
    weeks: [8, 16],
    suppresses: { strength: 0.18, power: 0.12, wrestling: 0.15 },
    recurrence: 0.5,
    campWeight: 1.3,
    fightWeight: 0.5,
  },
  ankle: {
    type: 'ankle',
    label: 'Ankle',
    blurb: 'A rolled ankle. Minor, until you have to stand on it and throw a kick.',
    weeks: [3, 7],
    suppresses: { kicking: 0.25, speed: 0.12 },
    recurrence: 0.3,
    campWeight: 1.0,
    fightWeight: 0.9,
  },
};

export interface Injury {
  id: InjuryId;
  type: InjuryType;
  /** Day it happened. */
  day: GameDay;
  /** Day it is fully healed. Carrying it past this point costs nothing. */
  healedDay: GameDay;
  /** 0–1. Scales how much it suppresses and how long it lasts. */
  severity: number;
  /** Where it came from, for the medical history. */
  source: 'camp' | 'fight' | 'weightCut';
  /** True once the fighter has competed while carrying it. */
  foughtThrough?: boolean;
}

/** Whether an injury is still active on a given day. */
export const isActiveInjury = (injury: Injury, day: GameDay): boolean => injury.healedDay > day;

export function activeInjuries(injuries: readonly Injury[], day: GameDay): Injury[] {
  return injuries.filter((i) => isActiveInjury(i, day));
}

/**
 * Baseline per-camp injury hazard.
 *
 * Tuned so a durable, disciplined 25-year-old gets through most camps intact and a fragile
 * 35-year-old with the `Injury Prone` trait does not. Camps are where most injuries actually
 * happen, which is the opposite of most players' intuition and worth the system saying.
 */
const BASE_CAMP_HAZARD = 0.1;

/**
 * How recovered a fighter is, read here rather than imported.
 *
 * `freshness.ts` imports this module for `exposureScore`, so importing `freshnessOf` back would be
 * a cycle. The read is two lines and the default is the same one `freshnessOf` documents: a save
 * written before freshness existed means *fresh*, not *empty*.
 */
const freshness = (fighter: Fighter): number => clamp(fighter.condition.freshness ?? 100, 0, 100);

/**
 * What being flat does to a body.
 *
 * The missing lever, and the reason the injury system read as weather. Age, wear, proneness and
 * traits are all facts about the fighter that the player cannot change this month; intensity was
 * the only dial, and it is buried inside a camp they have already decided to run. So the honest
 * answer to "how am I meant to avoid these" was *fight less and get younger*.
 *
 * Fatigue is the one input a player can move today, by resting, and it is also the one the sport
 * agrees with: injuries cluster at the end of hard camps and in fighters who came back too soon,
 * not uniformly across the calendar. Tying the hazard to `freshness` makes the rest button a
 * genuine piece of injury management rather than a slow way to lose sharpness.
 *
 * Neutral is deliberately *not* at 100. A fighter is almost never at 100 — a camp ends in the
 * fifties — so anchoring the multiplier there would have been a blanket nerf wearing a mechanic's
 * clothes. It sits at 1 around 70, which is where a rested fighter between camps actually lives,
 * so the median career's injury rate is roughly unchanged and the *spread* is what grew.
 */
export function fatigueFactor(value: number): number {
  return clamp(remap(value, 100, 25, 0.72, 1.5), 0.7, 1.55);
}
/*
 * Raised from 0.07 alongside the exposure model, which is a recalibration rather than a nerf.
 * The old `1 + damage/120` term sat at 1.0-2.0 and averaged around 1.4 across real fights;
 * `exposureScore` is normalised so an ordinary decision reads 1.0, so holding the ordinary fight
 * where it was requires the base to absorb the difference. Measured after: 12.0% for that decision
 * against 10.8% before the adjustment.
 */
const BASE_FIGHT_HAZARD = 0.078;

/**
 * Probability that a camp produces an injury.
 *
 * `intensity` is a plain multiplier rather than the `TrainingIntensity` union, so `health` does not
 * have to import `progression` — callers pass `INTENSITY_META[i].injury`. Defaults to 1, which is
 * standard, so every existing caller is unchanged.
 */
export function campInjuryChance(
  fighter: Fighter,
  weeks: number,
  day: GameDay,
  intensity = 1,
): number {
  const age = ageOn(fighter.birthDay, day);
  const proneness = remap(fighter.naturals.injuryProneness, 10, 92, 0.5, 1.9);
  const ageFactor = clamp(remap(age, 22, 40, 0.8, 1.7), 0.75, 1.8);
  const wear = 1 + fighter.condition.bodyWear / 130;
  /*
   * Proportional to the block, with a floor low enough to be worth reaching for.
   *
   * The floor used to be 0.5, which said a single week of drilling carried half the risk of a full
   * eight-week camp — so shortening a block bought almost nothing and "train less" was not a real
   * answer to anything. At 0.15 a short sharpener is genuinely a short sharpener.
   */
  const load = clamp(weeks / 8, 0.15, 1.6);

  return clamp01(
    BASE_CAMP_HAZARD *
      proneness *
      ageFactor *
      wear *
      load *
      intensity *
      fatigueFactor(freshness(fighter)) *
      traitMul(fighter.traits, 'campInjuryRisk'),
  );
}

/**
 * The same number, taken apart.
 *
 * A percentage on its own answers "how likely" and none of "what do I do about it", which is
 * precisely the complaint this exists to answer. Every term is returned with the direction it
 * pushes, so a screen can say *why* this camp is dangerous and which of the reasons the player
 * still has a say over.
 *
 * `movable` is the whole point of the split: age, wear and a fighter's own fragility are facts
 * about them, and rest, intensity and length are decisions. A driver that cannot be moved is
 * still worth naming — it is the difference between "you are unlucky" and "you are 37" — but it
 * must not be offered as advice.
 */
export interface RiskDriver {
  label: string;
  /** Multiplier on the base hazard. Above 1 raises the risk, below 1 lowers it. */
  factor: number;
  /** True when this is something the player can still decide about. */
  movable: boolean;
}

export interface CampRisk {
  /** 0–1. The chance this block ends with an injury. */
  chance: number;
  /** Sorted worst-first. */
  drivers: readonly RiskDriver[];
  /** One sentence naming the biggest thing the player could still do about it. */
  advice: string;
}

/**
 * Plain-language band for a hazard, so a screen is not left colouring a bare percentage.
 *
 * Calibrated against what the model actually produces rather than against round numbers. The
 * range a player can reach runs from about 3% — rested, light, a fortnight — to about 46% —
 * flat, overreaching, twelve weeks. A standard eight-week camp on a fresh 28-year-old sits at
 * 11%, and that is the ordinary case: a first pass at these boundaries called it "high", which
 * would have had the screen shouting at the player for doing the normal thing.
 */
export function riskBand(chance: number): 'low' | 'fair' | 'high' | 'severe' {
  if (chance < 0.06) return 'low';
  if (chance < 0.12) return 'fair';
  if (chance < 0.22) return 'high';
  return 'severe';
}

export function campRiskBreakdown(
  fighter: Fighter,
  weeks: number,
  day: GameDay,
  intensity = 1,
  intensityLabel = 'Training intensity',
): CampRisk {
  const age = ageOn(fighter.birthDay, day);
  const fresh = freshness(fighter);

  const drivers: RiskDriver[] = [
    { label: 'Freshness', factor: fatigueFactor(fresh), movable: true },
    { label: intensityLabel, factor: intensity, movable: true },
    { label: 'Block length', factor: clamp(weeks / 8, 0.15, 1.6), movable: true },
    { label: 'Age', factor: clamp(remap(age, 22, 40, 0.8, 1.7), 0.75, 1.8), movable: false },
    { label: 'Body wear', factor: 1 + fighter.condition.bodyWear / 130, movable: false },
    {
      label: 'How you are built',
      factor: remap(fighter.naturals.injuryProneness, 10, 92, 0.5, 1.9),
      movable: false,
    },
    {
      label: 'Traits',
      factor: traitMul(fighter.traits, 'campInjuryRisk'),
      movable: false,
    },
  ]
    .filter((d) => Math.abs(d.factor - 1) > 0.02)
    .sort((a, b) => b.factor - a.factor);

  const chance = campInjuryChance(fighter, weeks, day, intensity);
  const worstMovable = drivers.find((d) => d.movable && d.factor > 1.05);

  const advice = worstMovable
    ? worstMovable.label === 'Freshness'
      ? `You are running this flat, and a tired body is the thing that breaks. Resting first is worth more here than anything else on this screen.`
      : worstMovable.label === 'Block length'
        ? 'A shorter block carries proportionally less risk. Two short camps are not safer than one long one, but one short camp is.'
        : 'Backing the intensity off is the cheapest way to bring this down — a light block is half the risk of a standard one.'
    : riskBand(chance) === 'low'
      ? 'About as safe as training gets. Nothing here is worth changing.'
      : 'Nothing you can still decide is making this worse. What is left is age, mileage and the body you were born with.';

  return { chance, drivers, advice };
}

/**
 * What one fighter's night actually did to them.
 *
 * The thing this replaces took a single scalar — head plus body plus leg damage — and turned it
 * into `1 + clamp01(damage / 120)`, a term that could at most double the hazard. Measured on a
 * 28-year-old across every night the sim can produce, that put a thirty-second armbar where
 * nothing landed at **11.0%** and being beaten for two rounds and stopped in the third at
 * **21.1%**: a 1.9x spread across the entire range of what can happen in a cage, against the 2.8x
 * that `injuryProneness` alone spans. Who you were mattered more than what happened to you.
 *
 * It also ignored everything the simulation already records. How long you were in there, whether
 * you were on top, whether you were dropped, whether you were finished, and — the detail that
 * makes the difference between a career and a short one — whether the damage was to your head or
 * your legs.
 *
 * So the roll now takes the fight. Everything here comes off `FightResult`; nothing new is
 * measured during the bout.
 */
export interface FightExposure {
  headDamage: number;
  bodyDamage: number;
  legDamage: number;
  knockdownsSuffered: number;
  /** Stopped by strikes while unable to defend. Its own term, on top of the damage. */
  wasFinishedByStrikes: boolean;
  /** How long the fight lasted. Being in there at all costs something. */
  minutes: number;
  /** Of that, minutes spent in a controlling position. Time on top is time not being hurt. */
  controlMinutes: number;
  /** Takedowns the *opponent* attempted. Wrestling is hard on knees, shoulders and backs. */
  scrambles: number;
  /** Punches **this fighter** threw. You break your hand on somebody, not the other way round. */
  punchesThrown: number;
  /** Kicks this fighter threw, for the same reason — shins and ankles. */
  kicksThrown: number;
}

/** Read one corner's exposure off a finished fight. */
export function exposureFrom(result: ReducedFightResult, corner: Corner): FightExposure {
  const damage = result.damage[corner];
  const mine = result.stats[corner];
  const theirs = result.stats[corner === 'red' ? 'blue' : 'red'];
  const minutes = ((result.round - 1) * 5 * 60 + result.timeSeconds) / 60;

  return {
    headDamage: damage.headDamage,
    bodyDamage: damage.bodyDamage,
    legDamage: damage.legDamage,
    knockdownsSuffered: damage.knockdownsSuffered,
    wasFinishedByStrikes: damage.wasFinishedByStrikes,
    minutes,
    controlMinutes: mine.controlSeconds / 60,
    scrambles: theirs.takedownsAttempted,
    punchesThrown: mine.strikesByWeapon.punch,
    kicksThrown: mine.strikesByWeapon.kick,
  };
}

/**
 * Weights, in hazard points per unit.
 *
 * Legs are dearer than the body per point because a chopped-out leg is the classic limp-off, and
 * the head is dearer than either because of what it does to the rest of the model. Control is the
 * only negative term and it is deliberately worth more per minute than time itself costs — a
 * fighter who spends the round on top comes out ahead of one who spends it at distance, which is
 * the whole grappler's bargain.
 */
const EXPOSURE_WEIGHTS = {
  head: 0.01,
  body: 0.007,
  leg: 0.013,
  knockdown: 0.1,
  finished: 0.15,
  minute: 0.012,
  scramble: 0.02,
  control: -0.02,
} as const;

/**
 * There is no safe fight.
 *
 * A floor, because a thirty-second win still involves two people trying to hurt each other and
 * somebody lands awkwardly. Without it the model says a fast finish is free, which is nearly right
 * and therefore wrong in the way that matters: it would make one style risk-free rather than
 * cheap.
 */
const MIN_EXPOSURE = 0.18;

/** The score an ordinary three-round decision produces. Everything is read relative to it. */
const REFERENCE_EXPOSURE = 0.75;

/** How hard this night was, where an ordinary decision is 1. */
export function exposureScore(e: FightExposure): number {
  const raw =
    e.headDamage * EXPOSURE_WEIGHTS.head +
    e.bodyDamage * EXPOSURE_WEIGHTS.body +
    e.legDamage * EXPOSURE_WEIGHTS.leg +
    e.knockdownsSuffered * EXPOSURE_WEIGHTS.knockdown +
    (e.wasFinishedByStrikes ? EXPOSURE_WEIGHTS.finished : 0) +
    e.minutes * EXPOSURE_WEIGHTS.minute +
    e.scrambles * EXPOSURE_WEIGHTS.scramble +
    e.controlMinutes * EXPOSURE_WEIGHTS.control;

  return MIN_EXPOSURE + Math.max(0, raw) / REFERENCE_EXPOSURE;
}

/**
 * Probability that a fight produces an injury.
 *
 * The band this is calibrated to, on a median fighter, is doc 25 § 3.5: roughly 2-3% for an
 * untouched thirty-second finish, 4-5% for three rounds won from top position, 12% for an ordinary
 * decision, and close to 40% for a beating. That is a spread of well over ten times, and it is
 * what makes *how* a fighter wins matter as much as whether they win.
 */
export function fightInjuryChance(
  fighter: Fighter,
  exposure: FightExposure,
  day: GameDay,
): number {
  const age = ageOn(fighter.birthDay, day);
  const proneness = remap(fighter.naturals.injuryProneness, 10, 92, 0.6, 1.7);
  const ageFactor = clamp(remap(age, 22, 40, 0.85, 1.5), 0.8, 1.6);

  /*
   * The same fatigue term the camp roll uses, and for the same reason it belongs in both: a
   * fighter who walks to the cage flat is the one whose knee goes in a scramble he would
   * otherwise have won. It also closes the loop on intensity — an overreached camp now costs you
   * twice, once in the gym and once on the night, which is what makes periodisation a decision
   * rather than a slider with one consequence.
   */
  return clamp01(
    BASE_FIGHT_HAZARD *
      proneness *
      ageFactor *
      exposureScore(exposure) *
      fatigueFactor(freshness(fighter)) *
      traitMul(fighter.traits, 'fightInjuryRisk'),
  );
}

/**
 * How much each injury type is *this* fight's kind of injury.
 *
 * Without this, the type is drawn from a table of global weights, so a fighter whose legs were
 * chopped to pieces was as likely to walk out with a broken hand as a rib, and a fighter who had
 * never been touched could pick up a concussion. The drivers are all already recorded.
 *
 * Two of them read the fighter's **own** output rather than what they absorbed, which is the point
 * of doing this at all: you break your hand punching somebody's skull, and you hurt your shin
 * kicking their elbow. Neither was reachable before.
 */
function typeAffinity(type: InjuryType, e: FightExposure): number {
  const head = e.headDamage / 60 + e.knockdownsSuffered * 0.5 + (e.wasFinishedByStrikes ? 0.6 : 0);
  const legs = e.legDamage / 25;
  const body = e.bodyDamage / 30;
  const grind = e.scrambles / 4 + e.minutes / 25;
  const punches = e.punchesThrown / 45;
  const kicks = e.kicksThrown / 20;

  switch (type) {
    case 'concussion':
      return head;
    case 'cut':
      return head * 0.8;
    case 'rib':
      return body;
    case 'ankle':
      return legs * 0.7 + kicks;
    case 'knee':
      return legs * 0.6 + grind * 0.8;
    case 'shoulder':
      return grind;
    case 'back':
      return grind * 0.7;
    case 'hand':
      return punches;
  }
}

/**
 * Floor under `typeAffinity`, so an unlikely injury stays unlikely rather than impossible.
 *
 * People do turn an ankle in a fight that never went to the legs. A zero here would make the type
 * table a lookup rather than a distribution, which is a worse model wearing a more confident face.
 */
const AFFINITY_FLOOR = 0.35;

export interface RollInjuryInput {
  fighter: Fighter;
  source: Injury['source'];
  day: GameDay;
  rng: Rng;
  /** Existing injuries, so recurrence can be checked. */
  history?: readonly Injury[];
  /** What the fight was like, when it was a fight. Shapes which injury this turns out to be. */
  exposure?: FightExposure;
  /** Force a type. Used by `concussionFor`, where the diagnosis is not in question. */
  type?: InjuryType;
  /** Force severity, 0-1, instead of drawing it. */
  severity?: number;
}

/**
 * Produce an injury.
 *
 * Recurrence is checked first and deliberately: a fighter with a knee on the record is far
 * more likely to hurt that knee again than to hurt something new, which is why one bad injury
 * so often turns into a career-shaping pattern rather than an isolated event.
 */
export function rollInjury(input: RollInjuryInput): Injury {
  const { fighter, source, day, rng } = input;
  const history = input.history ?? [];

  const weightOf = (meta: InjuryMeta) => (source === 'camp' ? meta.campWeight : meta.fightWeight);

  // A prior injury of the same type massively raises the odds of it being that one again.
  const priorTypes = new Set(history.map((i) => i.type));
  const type =
    input.type ??
    rng.pickWeighted(INJURY_TYPES, (t) => {
      const meta = INJURY_META[t];
      const base = weightOf(meta);
      const affinity = input.exposure
        ? AFFINITY_FLOOR + typeAffinity(t, input.exposure)
        : 1;
      return base * affinity * (priorTypes.has(t) ? 1 + meta.recurrence * 4 : 1);
    });

  const meta = INJURY_META[type];
  // Severity skews low: most injuries are a nuisance, a few are career-shaping.
  const severity = input.severity ?? clamp01(rng.next() ** 1.6 * 0.9 + 0.1);

  const [minWeeks, maxWeeks] = meta.weeks;
  const rawWeeks = minWeeks + (maxWeeks - minWeeks) * severity;
  const recovery = remap(fighter.naturals.recovery, 10, 95, 1.35, 0.7);
  const weeks = Math.max(
    1,
    rawWeeks * recovery * (1 / traitMul(fighter.traits, 'recoveryRate')),
  );

  return {
    id: asId<InjuryId>(`inj_${fighter.id}_${day}_${type}`),
    type,
    day,
    healedDay: day + Math.round(weeks * 7),
    severity,
    source,
  };
}

/**
 * Attributes as they actually are while carrying injuries.
 *
 * Applied at fight time, not stored — the fighter's card is unchanged, and this is the
 * version that steps into the cage. Nobody is told: the opponent's scouting report does not
 * know, and the player finds out from how the fight looks. That is how it works in reality
 * and it is the most interesting property of the whole system.
 */
export function injuredAttributes(
  attributes: Attributes,
  injuries: readonly Injury[],
  day: GameDay,
): Attributes {
  const active = activeInjuries(injuries, day);
  if (active.length === 0) return attributes;

  const out = { ...attributes };
  for (const injury of active) {
    const meta = INJURY_META[injury.type];
    for (const [key, fraction] of Object.entries(meta.suppresses) as [AttributeKey, number][]) {
      out[key] = toRating(out[key] * (1 - fraction * injury.severity));
    }
  }
  return out;
}

/**
 * How much healing left a fighter will still go through with it.
 *
 * Eight weeks sounds generous until you remember what the sport actually looks like: people fight
 * with broken hands, torn labrums and knees that need surgery afterwards, and the game models what
 * that costs them — `injuredAttributes` gives them their real numbers rather than their card,
 * `aggravationChance` can turn it into something far worse on the night, and nobody is told.
 * Setting this low does not make the game more realistic, it deletes that entire mechanic by
 * cancelling every fight it would have applied to.
 *
 * The number is swept rather than chosen, against the sport's own withdrawal rate of roughly one
 * booked bout in eight; `withdrawals.ts` records the sweep.
 *
 * It lives here, in `health`, because it is a fact about what a body will take rather than about
 * the player's booking — and because the *world* has to hold its own fighters to it too. It was
 * previously an app-layer constant that only the player's bout consulted, which is how eight
 * hundred professionals ended up being matched while carrying knees that would not heal for a
 * year. See `canFightOn`.
 */
export const FIGHT_THROUGH_WEEKS = 8;

/**
 * Whether this fighter would take a bout on the given day, given what they are carrying.
 *
 * The rule both corners are held to. A fighter carrying something that will still be badly there
 * on the night pulls out; anything shorter than that, they fight on and nobody is told.
 */
export function canFightOn(injuries: readonly Injury[], day: GameDay): boolean {
  return weeksUntilFit(injuries, day) <= FIGHT_THROUGH_WEEKS;
}

/**
 * The chance that competing on an injury makes it materially worse.
 *
 * High enough that fighting hurt is a genuine gamble rather than a free choice with a small
 * modifier. An aggravated injury roughly doubles the remaining layoff.
 */
export function aggravationChance(injury: Injury, damageTaken: number): number {
  return clamp01(0.28 + injury.severity * 0.3 + clamp01(damageTaken / 200));
}

/**
 * How far past its own worst natural case an injury can be driven by competing on it.
 *
 * The bound was missing, and the compounding it allowed was the single worst number in the health
 * model. `aggravate` multiplies the *remaining* layoff by 1.6–2.4, so a fighter who is repeatedly
 * matched while hurt has that layoff doubled once per bout: measured across eight years of
 * generated pre-history, a torn knee reached **995 weeks** — nineteen years — and 76% of the
 * roster was carrying something at any moment. Every one of the worst cases was `severity: 1` and
 * `foughtThrough: true`, which is the compounding signature.
 *
 * Two things fix it and both are needed. The world now refuses to book a fighter who would pull
 * out (`canFightOn`), which stops the loop being entered over and over. And an aggravated injury
 * is bounded here, because "worse" has to mean worse rather than unbounded: at 2, a torn knee's
 * absolute worst case is eighty weeks, which ends careers and is a thing that happens, against
 * nineteen years, which is not.
 */
const AGGRAVATION_CEILING = 2;

export function aggravate(injury: Injury, day: GameDay, rng: Rng): Injury {
  const remaining = Math.max(7, injury.healedDay - day);
  const worsened = remaining * rng.range(1.6, 2.4);
  const ceiling = INJURY_META[injury.type].weeks[1] * 7 * AGGRAVATION_CEILING;

  return {
    ...injury,
    severity: clamp01(injury.severity + rng.range(0.1, 0.3)),
    healedDay: day + Math.round(Math.min(worsened, ceiling)),
    foughtThrough: true,
  };
}

/** Plain-language medical summary, for the camp report and the fighter profile. */
export function describeInjury(injury: Injury, day: GameDay): string {
  const meta = INJURY_META[injury.type];
  const weeksLeft = Math.max(0, Math.ceil((injury.healedDay - day) / 7));
  const severity =
    injury.severity > 0.7 ? 'Serious' : injury.severity > 0.4 ? 'Significant' : 'Minor';

  if (weeksLeft === 0) return `${meta.label.toLowerCase()} injury, fully healed.`;
  return `${severity} ${meta.label.toLowerCase()} injury — ${weeksLeft} week${
    weeksLeft === 1 ? '' : 's'
  } to full fitness. ${meta.blurb}`;
}

/**
 * How badly an injury compromises a camp.
 *
 * Returns a 0–1 multiplier on camp quality. A fighter who trains through a serious injury
 * gets a fraction of the camp they think they are getting, which is the quiet way this
 * system decides fights.
 */
/**
 * Weeks until every current injury has healed. 0 when fit.
 *
 * The camp-impairment number told a player *that* training hurt and never *how long* to wait,
 * so "should I rest?" had no answerable form. This gives the question an answer.
 */
export function weeksUntilFit(injuries: readonly Injury[], day: GameDay): number {
  const active = activeInjuries(injuries, day);
  if (active.length === 0) return 0;
  const latest = Math.max(...active.map((i) => i.healedDay));
  return Math.ceil((latest - day) / 7);
}

/**
 * A plain sentence about resting, given what the fighter is carrying.
 *
 * Rest is the most misread control in the game: it looks like recovery and it is also skill
 * decay, so a healthy fighter who rests is simply getting worse. Saying which situation the
 * player is in is the whole job.
 */
export function restAdvice(injuries: readonly Injury[], day: GameDay): string {
  const weeks = weeksUntilFit(injuries, day);
  if (weeks === 0) {
    return 'You are fit. Resting now just lets sharpness bleed away — there is nothing to heal.';
  }
  return weeks === 1
    ? 'About a week until you are fully healed. Resting through it is usually the cheaper option.'
    : `About ${weeks} weeks until you are fully healed. Training through it costs you most of the camp, and risks making it worse.`;
}

export function campImpairment(injuries: readonly Injury[], day: GameDay): number {
  const active = activeInjuries(injuries, day);
  if (active.length === 0) return 1;
  const worst = Math.max(...active.map((i) => i.severity));
  return clamp(1 - worst * 0.55, 0.3, 1);
}

/**
 * A knockout is a concussion. It is not a dice roll.
 *
 * `readinessDelay` already floors a KO loss at 180 days, which matches how commissions actually
 * suspend people — but the *injury* was a separate roll at 12-18% which then picked a type by
 * weight, so the overwhelming majority of knockouts left nothing whatsoever on the medical record.
 * The suspension happened and the diagnosis did not, which is the wrong way round: the suspension
 * exists **because** of the diagnosis.
 *
 * Severity comes off the head damage and how they went out, so being starched cold in the first
 * exchange and being worn down and stopped late are different injuries, as they are in life.
 *
 * Returns `undefined` when the fight was not that kind of fight.
 */
export function concussionFor(input: {
  fighter: Fighter;
  method: FinishMethod;
  /** True for the fighter who was stopped, false for the winner. */
  lost: boolean;
  exposure: FightExposure;
  day: GameDay;
  rng: Rng;
}): Injury | undefined {
  const { fighter, method, lost, exposure, day, rng } = input;
  if (!lost) return undefined;

  /*
   * A KO is unambiguous. A TKO or a doctor's stoppage only counts when the fighter was actually
   * being hit — `wasFinishedByStrikes` is what separates being battered from a corner throwing in
   * the towel over a cut or a fighter turning away from leg kicks.
   */
  const byHead =
    isKoMethod(method) &&
    (method === 'ko' || exposure.wasFinishedByStrikes);
  if (!byHead) return undefined;

  // A clean cold knockout is worse than a late accumulation stoppage, and both are worse than the
  // floor. `ko` outranks `tko` here because the method itself carries the information.
  const fromDamage = clamp01(exposure.headDamage / 140);
  const base = method === 'ko' ? 0.45 : 0.28;
  const severity = clamp01(base + fromDamage * 0.45 + rng.range(-0.06, 0.1));

  return rollInjury({
    fighter,
    source: 'fight',
    day,
    rng,
    type: 'concussion',
    severity,
    exposure,
  });
}
