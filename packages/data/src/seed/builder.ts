/**
 * Seed-roster builder.
 *
 * Keeps each fighter entry to the numbers that actually differentiate them. Anything
 * omissible is derived: potential from age and naturals, naturals from the visible
 * attributes they must be consistent with, and the record summary from a `W-L-D` string.
 *
 * Deriving naturals rather than hand-authoring them matters — a hand-written `engine: 40`
 * on a fighter with `cardio: 90` is an incoherent human being, and nothing in the game
 * would ever catch it.
 */

import {
  ATTRIBUTE_KEYS,
  physiqueForMeasurements,
  asDivisionId,
  asFighterId,
  birthDayForAge,
  emptyRecordSummary,
  freshCondition,
  isoToGameDay,
  toRating,
  uniformAttributes,
  uniformPersonality,
  type AgeCurve,
  type Attributes,
  type Fighter,
  type Naturals,
  type Personality,
  type RecordSummary,
  type TraitId,
} from '@mmasim/engine';

/** The world begins on 1 January 2020; every seeded age is as of that date. */
export const SEED_DAY = isoToGameDay('2020-01-01');

export interface FighterSpec {
  id: string;
  first: string;
  last: string;
  nick?: string;
  nat: string;
  /** Age on 1 January 2020. */
  age: number;
  sex?: 'male' | 'female';
  div: string;
  /** Natural walking weight out of camp, in pounds. Drives cut severity. */
  walk: number;
  htIn: number;
  reachIn: number;
  stance?: 'orthodox' | 'southpaw' | 'switch';
  /** The 15 visible attributes. Every one is required — no partial fighters. */
  attrs: Attributes;
  /** Personality axes. Anything omitted sits at 50. */
  person?: Partial<Personality>;
  traits?: readonly TraitId[];
  /** `W-L-D` or `W-L-D-NC`, as of the seed date. */
  record: string;
  /** 1–100. What the market pays to watch them. Independent of ability. */
  star: number;
  /** 1–100. How the media rate them, which is not the same as how good they are. */
  rep: number;
  /** Career head trauma accrued before the sim, 0–100. */
  trauma?: number;
  /** Overrides for the derived naturals, where a fighter is a genuine outlier. */
  naturals?: Partial<Naturals>;
  /**
   * Remaining upside per attribute, in rating points, applied to the whole block. Young
   * prospects get more; a 38-year-old gets 0. Per-attribute overrides go in `ceilings`.
   */
  upside?: number;
  ceilings?: Partial<Attributes>;
  /** Mandatory: the two or three ratings a reader would push back on, and why. */
  notes: string;
}

function parseRecord(record: string): RecordSummary {
  const parts = record.split('-').map(Number);
  const [wins = 0, losses = 0, draws = 0, noContests = 0] = parts;
  const s = emptyRecordSummary();
  s.wins = wins;
  s.losses = losses;
  s.draws = draws;
  s.noContests = noContests;
  // Finish splits are not authored per fighter: nothing in the game reads a seeded
  // fighter's historical KO count, and inventing one would be fabricated precision.
  return s;
}

/**
 * Infer hidden naturals from the visible attributes they have to be consistent with.
 *
 * A fighter with Cardio 97 must have an enormous engine; a fighter with Power 99 must be
 * extraordinarily explosive. Deriving these keeps the two layers coherent by construction
 * and means the seed author cannot accidentally create a physiological impossibility.
 */
function deriveNaturals(spec: FighterSpec): Naturals {
  const a = spec.attrs;
  const ageCurve: AgeCurve =
    spec.naturals?.ageCurve ??
    (spec.age >= 34 ? 'longPeak' : spec.age <= 24 ? 'lateBloomer' : 'standard');

  return {
    explosiveness: toRating(a.power * 0.55 + a.speed * 0.35 + a.strength * 0.1),
    /*
     * Which way this fighter's neuromuscular system leans, read off the gap between the two
     * attributes that sit at either end of the force–velocity curve. A seeded fighter whose Speed
     * outruns his Strength is velocity-biased and vice versa, and one whose are level sits at 50 —
     * which is where the curve puts peak Power, so the derivation and the ceiling agree.
     */
    forceVelocityBias: toRating(50 + (a.speed - a.strength) * 0.6),
    engine: toRating(a.cardio * 0.85 + a.composure * 0.15),
    constitution: toRating(a.durability * 0.9 + a.strength * 0.1),
    recovery: toRating(a.cardio * 0.5 + a.durability * 0.3 + a.composure * 0.2),
    motorLearning: toRating(a.fightIq * 0.6 + a.speed * 0.25 + a.composure * 0.15),
    injuryProneness: 45,
    ageCurve,
    ...spec.naturals,
  };
}

/**
 * Per-attribute ceilings.
 *
 * There is no single "potential" number by design (docs/06). Upside defaults by age, on the
 * blunt principle that a 22-year-old has room and a 38-year-old does not.
 */
function derivePotential(spec: FighterSpec): Attributes {
  const defaultUpside =
    spec.age <= 23 ? 14 : spec.age <= 26 ? 9 : spec.age <= 29 ? 5 : spec.age <= 32 ? 2 : 0;
  const upside = spec.upside ?? defaultUpside;

  const out = { ...uniformAttributes(50) };
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = toRating(spec.ceilings?.[key] ?? spec.attrs[key] + upside);
  }
  return out;
}

/**
 * @param onDay The world's start day, which every age in `spec` is stated as of.
 *
 * Defaulted to the 2020 seed day rather than made required, because the 2020 roster and its
 * tests were written against a module const and there is no reason to churn them. A second era
 * simply passes its own day.
 */
export function buildFighter(spec: FighterSpec, onDay: number = SEED_DAY): Fighter {
  const divisionId = asDivisionId(spec.div);
  const summary = parseRecord(spec.record);

  return {
    id: asFighterId(spec.id),
    firstName: spec.first,
    lastName: spec.last,
    nickname: spec.nick,
    nationality: spec.nat,
    sex: spec.sex ?? 'male',
    // Real birthdays are not modelled; a fixed 15 June keeps ages stable and reproducible.
    birthDay: birthDayForAge(spec.age, onDay, 6, 15),
    /*
     * Solved from the height and walking weight the spec transcribes, rather than authored.
     *
     * Doc 31 § 12 step 4 deleted `naturals.frame`, which this file used to compute as
     * `walk / 300 × 100`. A seed entry states a real fighter's real height and real walking weight —
     * measurements, not ratings — and the body model has to accept them and work out what
     * composition produces them, which is what `physiqueForMeasurements` does. Frame and muscle split
     * the difference evenly, because a tale of the tape says nothing about which of the two a given
     * fighter's mass is made of.
     *
     * `walkingWeightLbs` stopped being stored at doc 31 § 12 step 11, so `spec.walk` is now purely
     * an *input* to this solve — which is what it always was in spirit. Read it back with
     * `walkingWeightOf(fighter)`.
     */
    physique: physiqueForMeasurements(spec.sex ?? 'male', spec.htIn, spec.walk, 50, 50),
    heightInches: spec.htIn,
    reachInches: spec.reachIn,
    stance: spec.stance ?? 'orthodox',

    divisionId,
    divisionHistory: [divisionId],

    attributes: spec.attrs,
    naturals: deriveNaturals(spec),
    potential: derivePotential(spec),
    personality: { ...uniformPersonality(50), ...spec.person },
    traits: spec.traits ?? [],

    condition: { ...freshCondition(), headTrauma: spec.trauma ?? 0, confidence: 60 },
    record: [],
    priorRecord: summary,
    summary: { ...summary },

    starPower: spec.star,

    bank: 0,

    lifetimeGross: 0,

    lifetimeNet: 0,

    resentment: 0,
    reputation: spec.rep,

    // Debut is inferred from bouts fought: roughly two and a half fights a year, floored so
    // nobody debuts before they could legally compete.
    proDebutDay: birthDayForAge(
      Math.max(0, Math.min(spec.age - 18, Math.round((summary.wins + summary.losses) / 2.5))),
      onDay,
      6,
      15,
    ),

    notes: spec.notes,
  };
}

/** Shorthand so an attribute block reads as one line per group rather than fifteen. */
export function attrs(
  physical: [number, number, number, number, number],
  striking: [number, number, number],
  grappling: [number, number, number, number, number],
  mental: [number, number],
): Attributes {
  const [power, speed, cardio, durability, strength] = physical;
  const [strikingOffence, kicking, strikingDefence] = striking;
  const [wrestling, takedownDefence, groundControl, submissions, scrambling] = grappling;
  const [fightIq, composure] = mental;
  return {
    power,
    speed,
    cardio,
    durability,
    strength,
    strikingOffence,
    kicking,
    strikingDefence,
    wrestling,
    takedownDefence,
    groundControl,
    submissions,
    scrambling,
    fightIq,
    composure,
  };
}
