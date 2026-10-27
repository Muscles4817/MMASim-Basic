/**
 * Departments a promotion funds. Doc 34 B5.
 */

import { describe, expect, it } from 'vitest';
import type { Promotion } from '../domain/organisations.js';
import { scoutedRating } from './fighterRead.js';
import {
  INVESTMENTS,
  departmentCost,
  hasPsychologist,
  investmentCost,
  investmentLevel,
  marketingFloor,
  matchmakerAcceptance,
  medicalFactor,
  scoutingAccuracy,
  withInvestment,
} from './investment.js';

const promotion = { id: 'p', investments: undefined } as unknown as Promotion;

describe('what a department costs', () => {
  it('scales with the organisation, with a floor for the smallest', () => {
    expect(departmentCost('medical', 0, 100)).toBe(0);
    expect(departmentCost('medical', 2, 100)).toBe(departmentCost('medical', 1, 100) * 2);
    expect(departmentCost('medical', 1, 1000)).toBeGreaterThan(departmentCost('medical', 1, 10));
    expect(departmentCost('scouting', 1, 0)).toBeGreaterThan(0);
  });

  it('adds up across what is funded, and nothing when nothing is', () => {
    expect(investmentCost(promotion, 100)).toBe(0);
    const funded = withInvestment(withInvestment(promotion, 'medical', 2), 'marketing', 1);
    expect(investmentCost(funded, 100)).toBeCloseTo(
      departmentCost('medical', 2, 100) + departmentCost('marketing', 1, 100),
      1,
    );
  });

  it('is stored only as what was decided', () => {
    const funded = withInvestment(promotion, 'scouting', 3);
    expect(investmentLevel(funded, 'scouting')).toBe(3);
    expect(withInvestment(funded, 'scouting', 0).investments).toBeUndefined();
  });
});

describe('what it buys', () => {
  it('gets better with every level, for every department', () => {
    for (const level of [1, 2, 3] as const) {
      expect(scoutingAccuracy(level)).toBeLessThan(scoutingAccuracy((level - 1) as 0));
      expect(medicalFactor(level)).toBeLessThan(medicalFactor((level - 1) as 0));
      expect(marketingFloor(level)).toBeGreaterThan(marketingFloor((level - 1) as 0));
      expect(matchmakerAcceptance(level)).toBeGreaterThan(matchmakerAcceptance((level - 1) as 0));
    }
    expect(hasPsychologist(promotion)).toBe(false);
    expect(hasPsychologist(withInvestment(promotion, 'psychologist', 1))).toBe(true);
    expect(INVESTMENTS).toHaveLength(5);
  });

  it('narrows a scout’s range around the same estimate', () => {
    const fighter = {
      id: 'f1',
      attributes: { power: 60 },
      summary: { wins: 2, losses: 1, draws: 0 },
    } as never;
    const raw = scoutedRating(fighter, 'power' as never);
    const scouted = scoutedRating(fighter, 'power' as never, scoutingAccuracy(3));
    expect(scouted.high - scouted.low).toBeLessThan(raw.high - raw.low);
    expect(Math.abs(scouted.estimate - 60)).toBeLessThanOrEqual(Math.abs(raw.estimate - 60));
  });
});
