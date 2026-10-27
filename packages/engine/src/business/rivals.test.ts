/**
 * Rival promotions with intent: the rules. Doc 34 B4.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import type { Promotion } from '../domain/organisations.js';
import {
  COUNTER_SPLIT_MAX,
  COUNTER_SPLIT_MIN,
  POSTURES,
  afterCounterProgramming,
  bidInterest,
  counterProgrammingChance,
  counterSplit,
  matchmakingWeights,
  poachChance,
  postureOf,
  promotionCharacter,
} from './rivals.js';

const promotion = (over: Partial<Promotion> = {}): Promotion =>
  ({
    id: 'p1',
    name: 'Test',
    shortName: 'TST',
    tier: 'major',
    baseCountry: 'USA',
    prestige: 60,
    budget: 15_000,
    minimumPurse: 10,
    sponsorshipPolicy: 'open',
    revenueShareCapable: true,
    activityGuarantee: 2,
    buzz: 50,
    divisions: [],
    champions: {},
    matchmakingAggression: 60,
    narrativeControl: 50,
    ...over,
  }) as Promotion;

describe('posture', () => {
  it('is what was stored, or the same reading of the identity every time', () => {
    expect(postureOf(promotion({ posture: 'developer' }))).toBe('developer');
    const p = promotion({ id: 'stable' as never });
    expect(postureOf(p)).toBe(postureOf({ ...p }));
  });

  it('leans aggressive at the top of the sport and developmental at the bottom', () => {
    const count = (tier: Promotion['tier'], budget: number) => {
      const tally = { aggressor: 0, developer: 0, moneyball: 0 };
      for (let i = 0; i < 300; i++) {
        tally[postureOf(promotion({ id: `x${i}` as never, tier, budget }))] += 1;
      }
      return tally;
    };
    const top = count('global', 60_000);
    const bottom = count('developmental', 900);
    expect(top.aggressor).toBeGreaterThan(top.developer);
    expect(bottom.developer).toBeGreaterThan(bottom.aggressor);
  });
});

describe('a generated promotion’s character', () => {
  it('is deterministic, and differs across the sport', () => {
    const a = promotionCharacter({ id: 'p_regional_0', tier: 'regional', prestige: 40, seed: 's' });
    expect(
      promotionCharacter({ id: 'p_regional_0', tier: 'regional', prestige: 40, seed: 's' }),
    ).toEqual(a);
    const many = Array.from({ length: 60 }, (_, i) =>
      promotionCharacter({ id: `p_regional_${i}`, tier: 'regional', prestige: 40, seed: 's' }),
    );
    expect(new Set(many.map((c) => c.baseCountry)).size).toBeGreaterThan(4);
    expect(new Set(many.map((c) => c.posture)).size).toBe(POSTURES.length);
    expect(new Set(many.map((c) => c.matchmakingStyle)).size).toBeGreaterThan(2);
  });

  it('puts the very top of the sport in America', () => {
    expect(
      promotionCharacter({ id: 'g', tier: 'global', prestige: 95, seed: 's' }).baseCountry,
    ).toBe('USA');
  });
});

describe('counter-programming', () => {
  it('only happens in a shared market, and an aggressor is the one who does it', () => {
    const target = promotion({ prestige: 40 });
    const aggressor = promotion({ id: 'r' as never, posture: 'aggressor', prestige: 60 });
    const developer = promotion({ id: 'd' as never, posture: 'developer', prestige: 60 });
    expect(counterProgrammingChance(aggressor, target, 'UK')).toBe(0);
    expect(counterProgrammingChance(aggressor, target, 'USA')).toBeGreaterThan(
      counterProgrammingChance(developer, target, 'USA') * 5,
    );
  });

  it('splits the gate by 20 to 35 percent', () => {
    for (let i = 0; i < 50; i++) {
      const split = counterSplit(
        promotion({ prestige: 10 + i }),
        promotion({ prestige: 60 }),
        createRng(`split:${i}`),
      );
      expect(split).toBeGreaterThanOrEqual(COUNTER_SPLIT_MIN);
      expect(split).toBeLessThanOrEqual(COUNTER_SPLIT_MAX);
    }
    const after = afterCounterProgramming(
      { gate: 100, broadcast: 50, costs: 80, profit: 70, attendance: 5000 },
      0.25,
    );
    expect(after).toEqual({ gate: 75, broadcast: 50, costs: 80, profit: 45, attendance: 3750 });
  });
});

describe('who a rival wants', () => {
  it('is a name to an aggressor, youth to a developer, and value to a moneyball outfit', () => {
    const star = { starPower: 70, reputation: 70 };
    const unknown = { starPower: 10, reputation: 20 };
    const young = { age: 22, overall: 60, ranked: false, champion: false };
    const vet = { age: 32, overall: 60, ranked: false, champion: false };
    expect(bidInterest(promotion({ posture: 'aggressor' }), star, vet)).toBeGreaterThan(
      bidInterest(promotion({ posture: 'aggressor' }), unknown, vet),
    );
    expect(bidInterest(promotion({ posture: 'developer' }), unknown, young)).toBeGreaterThan(0);
    expect(bidInterest(promotion({ posture: 'developer' }), unknown, vet)).toBe(0);
    expect(bidInterest(promotion({ posture: 'moneyball' }), unknown, vet)).toBeGreaterThan(
      bidInterest(promotion({ posture: 'moneyball' }), star, vet),
    );
  });

  it('weighs a booking by draw for an aggressor, by draw per cost for moneyball, not at all for a developer', () => {
    const c = [
      { draw: 10, cost: 1 },
      { draw: 40, cost: 20 },
    ];
    const [a1, a2] = matchmakingWeights('aggressor', c);
    const [m1, m2] = matchmakingWeights('moneyball', c);
    expect(a2!).toBeGreaterThan(a1!);
    expect(m1!).toBeGreaterThan(m2!);
    expect(matchmakingWeights('developer', c)).toEqual([1, 1]);
  });

  it('poaches only as an aggressor, and only with the money', () => {
    const champion = { starPower: 70 };
    expect(poachChance(promotion({ posture: 'developer' }), champion, 100)).toBe(0);
    expect(poachChance(promotion({ posture: 'aggressor', budget: 100 }), champion, 100)).toBe(0);
    expect(
      poachChance(promotion({ posture: 'aggressor', budget: 50_000 }), champion, 100),
    ).toBeGreaterThan(0);
  });
});
