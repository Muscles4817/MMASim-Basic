/**
 * The person the promoter answers to.
 *
 * A promoter runs a promotion; somebody else owns it. The owner sets three objectives a year,
 * chosen by what kind of owner they are, and their confidence in the promoter moves on whether the
 * objectives were met. At zero the promoter is fired — the career goes on at a smaller promotion
 * that will have them, which is doc 34's decision and doc 13's "you keep playing, poorer and
 * smaller".
 *
 * Pure. The world measures the year (`OwnerYear`) and stores the owner on the promotion.
 */

import { clamp } from '../core/math.js';
import type { GameDay } from '../core/clock.js';

/** What the owner cares about, which decides which three objectives they set. */
export type OwnerTemperament = 'moneyman' | 'showman' | 'builder' | 'patient';

export type ObjectiveKind = 'profit' | 'cards' | 'buzz' | 'deal' | 'belts' | 'crowd';

export interface Objective {
  kind: ObjectiveKind;
  /** The number to reach: thousands for profit, a count, a level or a crowd. */
  target: number;
}

export interface Owner {
  name: string;
  temperament: OwnerTemperament;
  /** 0–100. At zero the promoter is out. */
  confidence: number;
  objectives: readonly Objective[];
  /** The day this year's objectives were set. */
  yearStartDay: GameDay;
  /** Cash on that day, which the profit objective is measured from. A fact, not a derivation. */
  yearStartCash: number;
}

/** How the year is measured, for every objective an owner can set. */
export interface OwnerYear {
  /** Thousands made or lost since the year began. */
  profit: number;
  cards: number;
  buzz: number;
  dealSatisfaction: number;
  vacantBelts: number;
  averageCrowd: number;
}

export const OWNER_TEMPERAMENTS: Readonly<
  Record<OwnerTemperament, { label: string; blurb: string; wants: readonly ObjectiveKind[] }>
> = {
  moneyman: {
    label: 'Moneyman',
    blurb: 'Bought it as an investment and reads the accounts before the results.',
    wants: ['profit', 'cards', 'deal'],
  },
  showman: {
    label: 'Showman',
    blurb: 'Wants full rooms and people talking. Will forgive a loss for a great night.',
    wants: ['buzz', 'crowd', 'deal'],
  },
  builder: {
    label: 'Builder',
    blurb: 'Wants a proper promotion: champions in every division and a schedule that runs.',
    wants: ['belts', 'cards', 'buzz'],
  },
  patient: {
    label: 'Patient',
    blurb: 'In it for the long run. Asks only that the business holds and the network stays happy.',
    wants: ['profit', 'deal', 'belts'],
  },
};

/** Where confidence starts, with a new promoter or a new owner. */
export const STARTING_CONFIDENCE = 60;
/** What one objective met or missed does to confidence at the year's end. */
export const CONFIDENCE_PER_MET = 10;
export const CONFIDENCE_PER_MISSED = 15;
/** What losing the television deal costs, the day it happens. */
export const CONFIDENCE_FOR_LOST_DEAL = 20;

const OWNER_NAMES = [
  'Victor Hale',
  'Dana Okoro',
  'Ray Castellano',
  'Miriam Stroud',
  'Glen Abernathy',
  'Priya Raman',
  'Curtis Bell',
  'Helena Varga',
] as const;

/** The year's objectives, set against where the promotion is when the year begins. */
export function setObjectives(input: {
  temperament: OwnerTemperament;
  cash: number;
  buzz: number;
  minimumCards: number;
  averageCrowd: number;
}): Objective[] {
  const { temperament, cash, buzz, minimumCards, averageCrowd } = input;
  const target: Record<ObjectiveKind, number> = {
    // A moneyman wants a return; everybody else wants it not to lose money.
    profit: temperament === 'moneyman' ? Math.round(cash * 0.05) : 0,
    cards: minimumCards,
    buzz: Math.round(Math.min(95, buzz + 3)),
    deal: 55,
    belts: 0,
    crowd: Math.round(averageCrowd * 1.1),
  };
  return OWNER_TEMPERAMENTS[temperament].wants.map((kind) => ({ kind, target: target[kind] }));
}

/** A new owner: the one a save starts with, or the one who buys a promotion. */
export function newOwner(input: {
  pick: number;
  day: GameDay;
  cash: number;
  buzz: number;
  minimumCards: number;
  averageCrowd: number;
}): Owner {
  const { pick, day, cash } = input;
  const temperaments = Object.keys(OWNER_TEMPERAMENTS) as OwnerTemperament[];
  const temperament = temperaments[Math.abs(pick) % temperaments.length]!;
  return {
    name: OWNER_NAMES[Math.abs(pick >> 3) % OWNER_NAMES.length]!,
    temperament,
    confidence: STARTING_CONFIDENCE,
    objectives: setObjectives({ ...input, temperament }),
    yearStartDay: day,
    yearStartCash: cash,
  };
}

/** Whether the year as it stands meets the objective. */
export function objectiveMet(objective: Objective, year: OwnerYear): boolean {
  switch (objective.kind) {
    case 'profit':
      return year.profit >= objective.target;
    case 'cards':
      return year.cards >= objective.target;
    case 'buzz':
      return year.buzz >= objective.target;
    case 'deal':
      return year.dealSatisfaction >= objective.target;
    case 'belts':
      return year.vacantBelts <= objective.target;
    case 'crowd':
      return year.averageCrowd >= objective.target;
  }
}

/** One line for the dashboard: the objective, in the owner's words. */
export function describeObjective(objective: Objective): string {
  switch (objective.kind) {
    case 'profit':
      return objective.target > 0
        ? `Make £${Math.round(objective.target)}k this year`
        : 'Do not lose money this year';
    case 'cards':
      return `Run at least ${objective.target} cards`;
    case 'buzz':
      return `Get attention up to ${objective.target}`;
    case 'deal':
      return `Keep the broadcaster at ${objective.target} or better`;
    case 'belts':
      return 'A champion in every division by the year’s end';
    case 'crowd':
      return `Average crowds of ${objective.target.toLocaleString('en-GB')}`;
  }
}

/** The year's end: confidence moves on what was met, and the next year's objectives are set. */
export function yearEnd(input: {
  owner: Owner;
  year: OwnerYear;
  day: GameDay;
  cash: number;
  buzz: number;
  minimumCards: number;
  averageCrowd: number;
}): { owner: Owner; met: number; missed: number } {
  const { owner, year, day } = input;
  const met = owner.objectives.filter((o) => objectiveMet(o, year)).length;
  const missed = owner.objectives.length - met;
  const confidence = clamp(
    owner.confidence + met * CONFIDENCE_PER_MET - missed * CONFIDENCE_PER_MISSED,
    0,
    100,
  );
  return {
    owner: {
      ...owner,
      confidence,
      objectives: setObjectives({ ...input, temperament: owner.temperament }),
      yearStartDay: day,
      yearStartCash: input.cash,
    },
    met,
    missed,
  };
}
