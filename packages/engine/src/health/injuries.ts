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
const BASE_FIGHT_HAZARD = 0.07;

/** Probability that a camp produces an injury. */
export function campInjuryChance(fighter: Fighter, weeks: number, day: GameDay): number {
  const age = ageOn(fighter.birthDay, day);
  const proneness = remap(fighter.naturals.injuryProneness, 10, 92, 0.5, 1.9);
  const ageFactor = clamp(remap(age, 22, 40, 0.8, 1.7), 0.75, 1.8);
  const wear = 1 + fighter.condition.bodyWear / 130;
  const load = clamp(weeks / 8, 0.5, 1.6);

  return clamp01(
    BASE_CAMP_HAZARD *
      proneness *
      ageFactor *
      wear *
      load *
      traitMul(fighter.traits, 'campInjuryRisk'),
  );
}

/** Probability that a fight produces an injury, given how much damage was taken. */
export function fightInjuryChance(fighter: Fighter, damageTaken: number, day: GameDay): number {
  const age = ageOn(fighter.birthDay, day);
  const proneness = remap(fighter.naturals.injuryProneness, 10, 92, 0.6, 1.7);
  const ageFactor = clamp(remap(age, 22, 40, 0.85, 1.5), 0.8, 1.6);
  const damage = 1 + clamp01(damageTaken / 120);

  return clamp01(
    BASE_FIGHT_HAZARD *
      proneness *
      ageFactor *
      damage *
      traitMul(fighter.traits, 'fightInjuryRisk'),
  );
}

export interface RollInjuryInput {
  fighter: Fighter;
  source: Injury['source'];
  day: GameDay;
  rng: Rng;
  /** Existing injuries, so recurrence can be checked. */
  history?: readonly Injury[];
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
  const type = rng.pickWeighted(INJURY_TYPES, (t) => {
    const meta = INJURY_META[t];
    const base = weightOf(meta);
    return base * (priorTypes.has(t) ? 1 + meta.recurrence * 4 : 1);
  });

  const meta = INJURY_META[type];
  // Severity skews low: most injuries are a nuisance, a few are career-shaping.
  const severity = clamp01(rng.next() ** 1.6 * 0.9 + 0.1);

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
 * The chance that competing on an injury makes it materially worse.
 *
 * High enough that fighting hurt is a genuine gamble rather than a free choice with a small
 * modifier. An aggravated injury roughly doubles the remaining layoff.
 */
export function aggravationChance(injury: Injury, damageTaken: number): number {
  return clamp01(0.28 + injury.severity * 0.3 + clamp01(damageTaken / 200));
}

export function aggravate(injury: Injury, day: GameDay, rng: Rng): Injury {
  const remaining = Math.max(7, injury.healedDay - day);
  return {
    ...injury,
    severity: clamp01(injury.severity + rng.range(0.1, 0.3)),
    healedDay: day + Math.round(remaining * rng.range(1.6, 2.4)),
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
export function campImpairment(injuries: readonly Injury[], day: GameDay): number {
  const active = activeInjuries(injuries, day);
  if (active.length === 0) return 1;
  const worst = Math.max(...active.map((i) => i.severity));
  return clamp(1 - worst * 0.55, 0.3, 1);
}
