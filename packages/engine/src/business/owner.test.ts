import { describe, expect, it } from 'vitest';
import type { GameDay } from '../core/clock.js';
import {
  CONFIDENCE_PER_MET,
  CONFIDENCE_PER_MISSED,
  newOwner,
  objectiveMet,
  OWNER_TEMPERAMENTS,
  setObjectives,
  STARTING_CONFIDENCE,
  yearEnd,
  type OwnerTemperament,
  type OwnerYear,
} from './owner.js';

const start = { day: 0 as GameDay, cash: 2000, buzz: 40, minimumCards: 6, averageCrowd: 2500 };
const goodYear: OwnerYear = {
  profit: 500,
  cards: 8,
  buzz: 50,
  dealSatisfaction: 70,
  vacantBelts: 0,
  averageCrowd: 3000,
};
const badYear: OwnerYear = {
  profit: -500,
  cards: 2,
  buzz: 20,
  dealSatisfaction: 30,
  vacantBelts: 4,
  averageCrowd: 900,
};

describe('the owner', () => {
  it('sets three objectives a year, chosen by temperament', () => {
    for (const temperament of Object.keys(OWNER_TEMPERAMENTS) as OwnerTemperament[]) {
      const objectives = setObjectives({ temperament, ...start });
      expect(objectives).toHaveLength(3);
      expect(objectives.map((o) => o.kind)).toEqual(OWNER_TEMPERAMENTS[temperament].wants);
    }
  });

  it('starts with some confidence in a new promoter', () => {
    const owner = newOwner({ pick: 7, ...start });
    expect(owner.confidence).toBe(STARTING_CONFIDENCE);
    expect(owner.yearStartCash).toBe(start.cash);
  });

  it('moves confidence on what was met, and sets next year against where things stand', () => {
    const owner = newOwner({ pick: 7, ...start });
    const good = yearEnd({ owner, year: goodYear, ...start, day: 365 as GameDay });
    expect(good.met).toBe(3);
    expect(good.owner.confidence).toBe(STARTING_CONFIDENCE + 3 * CONFIDENCE_PER_MET);
    expect(good.owner.yearStartDay).toBe(365);

    const bad = yearEnd({ owner, year: badYear, ...start, day: 365 as GameDay });
    expect(bad.missed).toBe(3);
    expect(bad.owner.confidence).toBe(Math.max(0, STARTING_CONFIDENCE - 3 * CONFIDENCE_PER_MISSED));
  });

  it('runs out of patience after two bad years', () => {
    let owner = newOwner({ pick: 7, ...start });
    for (let year = 1; year <= 2; year++) {
      owner = yearEnd({ owner, year: badYear, ...start, day: (365 * year) as GameDay }).owner;
    }
    expect(owner.confidence).toBe(0);
  });

  it('reads a vacant belt as the builder’s objective missed', () => {
    const [belts] = setObjectives({ temperament: 'builder', ...start });
    expect(objectiveMet(belts!, { ...goodYear, vacantBelts: 1 })).toBe(false);
    expect(objectiveMet(belts!, goodYear)).toBe(true);
  });
});
