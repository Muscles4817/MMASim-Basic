/**
 * The terms doc 34 C3 added to bout acceptance: what they want, and what is in the bank.
 *
 * Measured as ratios against the same offer without the term, on a short-notice fight so the
 * answer is never pinned at a certain yes — a term that only ever shows up once `clamp01` has
 * swallowed it is a term nobody can see.
 */

import { describe, expect, it } from 'vitest';
import {
  BANK_BROKE,
  BANK_RICH,
  RICH_BANK,
  RICH_STEP,
  WANT_MET,
  WANT_UNMET,
  acceptanceOf,
} from './boutAgreements.js';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import { uniformAttributes } from '../ratings/attributes.js';
import type { FighterId } from '../core/ids.js';

const promotion = makePromotion();
const DAY = 1000;
const even = makeFighter({ id: 'opp', attributes: uniformAttributes(50) });
const better = makeFighter({ id: 'better', attributes: uniformAttributes(50 + RICH_STEP + 6) });

const chance = (fighter: ReturnType<typeof makeFighter>, opponent = even, extra = {}) =>
  acceptanceOf({ fighter, opponent, promotion, notice: 'short', day: DAY, ...extra }).chance;

describe('the bank', () => {
  const base = makeFighter({ id: 'f', attributes: uniformAttributes(50) });

  it('makes a broke fighter keener', () => {
    expect(chance({ ...base, bank: -10 }) / chance({ ...base, bank: 0 })).toBeCloseTo(
      BANK_BROKE,
      5,
    );
  });

  it('makes a rich fighter choosier about a step up, and only about a step up', () => {
    const rich = { ...base, bank: RICH_BANK + 1 };
    expect(chance(rich, better) / chance(base, better)).toBeCloseTo(BANK_RICH, 5);
    expect(chance(rich, even)).toBeCloseTo(chance(base, even), 5);
  });
});

describe('what they want', () => {
  it('is keener on the fight they want, cooler on the one they do not', () => {
    // Lost a split decision, resilient and ambitious: wants the rematch with `rival`.
    const rival = makeFighter({ id: 'rival', attributes: uniformAttributes(50) });
    const fighter = {
      ...makeFighter({ id: 'f2', personality: { ambition: 80, resilience: 80 } }),
      record: [
        {
          boutId: 'b',
          opponentId: 'rival' as FighterId,
          outcome: 'loss',
          method: 'decisionSplit',
          day: DAY - 100,
        } as never,
      ],
    };
    const noWants = { ...fighter, record: [] };
    expect(chance(fighter, rival) / chance(noWants, rival)).toBeCloseTo(WANT_MET, 5);
    expect(chance(fighter, even) / chance(noWants, even)).toBeCloseTo(WANT_UNMET, 5);
  });
});
