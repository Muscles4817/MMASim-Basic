/**
 * Weight divisions.
 *
 * Divisions are a **matchmaking constraint**, not a stat modifier. A fighter's ratings do
 * not change when they change division — see docs/02-attributes-and-ratings.md. What
 * changes is the company they keep, and the physiological cost of getting to the weight.
 */

import type { DivisionId } from '../core/ids.js';
import { asDivisionId } from '../core/ids.js';

export type Sex = 'male' | 'female';

export interface Division {
  id: DivisionId;
  name: string;
  shortName: string;
  sex: Sex;
  /** Championship limit in pounds. Non-title bouts allow +1 lb. */
  limitLbs: number;
  /** Display order, lightest first within each sex. */
  order: number;
}

function div(id: string, name: string, shortName: string, sex: Sex, limitLbs: number, order: number): Division {
  return { id: asDivisionId(id), name, shortName, sex, limitLbs, order };
}

export const DIVISIONS: readonly Division[] = [
  div('mens-flyweight', "Men's Flyweight", 'FLW', 'male', 125, 1),
  div('mens-bantamweight', "Men's Bantamweight", 'BW', 'male', 135, 2),
  div('mens-featherweight', "Men's Featherweight", 'FW', 'male', 145, 3),
  div('mens-lightweight', "Men's Lightweight", 'LW', 'male', 155, 4),
  div('mens-welterweight', "Men's Welterweight", 'WW', 'male', 170, 5),
  div('mens-middleweight', "Men's Middleweight", 'MW', 'male', 185, 6),
  div('mens-light-heavyweight', "Men's Light Heavyweight", 'LHW', 'male', 205, 7),
  div('mens-heavyweight', "Men's Heavyweight", 'HW', 'male', 265, 8),
  div('womens-strawweight', "Women's Strawweight", 'WSW', 'female', 115, 1),
  div('womens-flyweight', "Women's Flyweight", 'WFLW', 'female', 125, 2),
  div('womens-bantamweight', "Women's Bantamweight", 'WBW', 'female', 135, 3),
  div('womens-featherweight', "Women's Featherweight", 'WFW', 'female', 145, 4),
];

const BY_ID = new Map(DIVISIONS.map((d) => [d.id as string, d]));

export function getDivision(id: DivisionId): Division {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown division: ${id}`);
  return d;
}

export function divisionsFor(sex: Sex): readonly Division[] {
  return DIVISIONS.filter((d) => d.sex === sex).sort((a, b) => a.order - b.order);
}

/** The division one step heavier, or undefined at heavyweight. */
export function divisionAbove(id: DivisionId): Division | undefined {
  const d = getDivision(id);
  return divisionsFor(d.sex).find((x) => x.order === d.order + 1);
}

/** The division one step lighter, or undefined at the bottom. */
export function divisionBelow(id: DivisionId): Division | undefined {
  const d = getDivision(id);
  return divisionsFor(d.sex).find((x) => x.order === d.order - 1);
}

/** Heavyweight has no meaningful floor, so treat the gap below it as the usual 20 lb. */
export function divisionSpanLbs(id: DivisionId): number {
  const d = getDivision(id);
  const below = divisionBelow(id);
  return below ? d.limitLbs - below.limitLbs : 20;
}

/**
 * Severity of the weight cut required, 0 (walks around at the limit) to 1 (dangerous).
 *
 * Driven by the hidden `frame` natural: a fighter whose natural walking weight sits far
 * above the division limit is cutting hard, gets a real size advantage on fight night, and
 * pays for it in Cardio and in the risk of missing weight.
 */
export function cutSeverity(walkingWeightLbs: number, id: DivisionId): number {
  const limit = getDivision(id).limitLbs;
  const excess = walkingWeightLbs - limit;
  if (excess <= 0) return 0;
  // ~8% of body weight is a routine hard cut; ~18% is the danger zone.
  const pct = excess / limit;
  return Math.min(1, pct / 0.18);
}

/** The lightest division a fighter with this walking weight can realistically make. */
export function lightestViableDivision(
  walkingWeightLbs: number,
  sex: Sex,
  maxSeverity = 0.95,
): Division {
  const divisions = divisionsFor(sex);
  for (const d of divisions) {
    if (cutSeverity(walkingWeightLbs, d.id) <= maxSeverity) return d;
  }
  return divisions[divisions.length - 1]!;
}
