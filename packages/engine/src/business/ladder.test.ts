import { describe, expect, it } from 'vitest';
import { asDivisionId, asFighterId, asPromotionId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import {
  RANKED_DEPTH,
  TIER_ORDER,
  careerProgress,
  rankDivision,
  rankOf,
  setChampion,
  titleShotEligibility,
} from './ladder.js';

const DIV = asDivisionId('mens-lightweight');


/** A fighter with a real record, so they qualify as ranked. */
const contender = (id: string, reputation: number, streak = 1): Fighter => {
  const base = makeFighter({ id, divisionId: 'mens-lightweight' });
  return {
    ...base,
    promotionId: asPromotionId('p_test'),
    reputation,
    priorRecord: { ...base.summary, wins: 10, losses: 2, streak },
    summary: { ...base.summary, wins: 10, losses: 2, streak },
  };
};

describe('rankDivision', () => {
  it('orders contenders by reputation and form', () => {
    const ranked = rankDivision(
      [contender('a', 40), contender('b', 80), contender('c', 60)],
      DIV,
      asPromotionId('p_test'),
      0,
    );
    expect(ranked.map((r) => r.fighter.id)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('puts the champion at position zero, above everyone', () => {
    const ranked = rankDivision(
      [contender('a', 90), contender('champ', 20)],
      DIV,
      asPromotionId('p_test'),
      0,
      asFighterId('champ'),
    );
    expect(ranked[0]!.fighter.id).toBe('champ');
    expect(ranked[0]!.position).toBe(0);
    expect(rankOf(ranked, asFighterId('a'))).toBe(1);
  });

  it('does not rank a fighter who has never competed', () => {
    // Otherwise a debutant on a thin roster is the "#1 contender" for turning pro.
    const debutant = { ...makeFighter({ id: 'new' }), promotionId: asPromotionId('p_test') };
    const ranked = rankDivision([debutant, contender('a', 50)], DIV, asPromotionId('p_test'), 0);
    expect(rankOf(ranked, asFighterId('new'))).toBeUndefined();
    expect(ranked).toHaveLength(1);
  });

  it('excludes other divisions, other promotions and the retired', () => {
    const elsewhere = { ...contender('x', 90), divisionId: asDivisionId('mens-welterweight') };
    const rival = { ...contender('y', 90), promotionId: asPromotionId('p_other') };
    const retired = { ...contender('z', 90), retiredDay: -1 };
    const ranked = rankDivision(
      [elsewhere, rival, retired, contender('a', 10)],
      DIV,
      asPromotionId('p_test'),
      0,
    );
    expect(ranked.map((r) => r.fighter.id)).toEqual(['a']);
  });

  it('punishes a losing run harder than it rewards a winning one', () => {
    const ranked = rankDivision(
      [contender('winner', 50, 3), contender('loser', 50, -3), contender('even', 50, 0)],
      DIV,
      asPromotionId('p_test'),
      0,
    );
    expect(ranked.map((r) => r.fighter.id)).toEqual(['winner', 'even', 'loser']);
  });
});

describe('titleShotEligibility', () => {
  const ranked = (playerReputation: number, streak: number) =>
    rankDivision(
      [
        contender('player', playerReputation, streak),
        contender('a', 90, 2),
        contender('b', 80, 2),
        contender('c', 70, 2),
        contender('d', 60, 2),
      ],
      DIV,
      asPromotionId('p_test'),
      0,
    );

  it('refuses an unranked fighter', () => {
    const debutant = { ...makeFighter({ id: 'new' }), promotionId: asPromotionId('p_test') };
    const verdict = titleShotEligibility(debutant, ranked(50, 2), makePromotion());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/unranked/i);
  });

  it('refuses a fighter outside the top three', () => {
    const list = ranked(10, 5);
    const verdict = titleShotEligibility(list.find((r) => r.fighter.id === 'player')!.fighter, list, makePromotion());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/top three/i);
  });

  it('refuses a top contender who is not currently winning', () => {
    const list = ranked(95, 1);
    const player = list.find((r) => r.fighter.id === 'player')!.fighter;
    const verdict = titleShotEligibility(player, list, makePromotion());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/two straight wins/i);
  });

  it('grants the shot to a top-three fighter on a run', () => {
    const list = ranked(95, 3);
    const player = list.find((r) => r.fighter.id === 'player')!.fighter;
    expect(titleShotEligibility(player, list, makePromotion()).eligible).toBe(true);
  });

  it('tells the champion to defend rather than chase', () => {
    const list = rankDivision(
      [contender('player', 50, 3)],
      DIV,
      asPromotionId('p_test'),
      0,
      asFighterId('player'),
    );
    const verdict = titleShotEligibility(list[0]!.fighter, list, makePromotion());
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/champion/i);
  });

  it('lets a star jump the queue in a promotion that pushes its faces', () => {
    const list = ranked(45, 3);
    const player = { ...list.find((r) => r.fighter.id === 'player')!.fighter, starPower: 95 };
    const pushy = titleShotEligibility(player, list, makePromotion({ narrativeControl: 100 }));
    const meritocratic = titleShotEligibility(player, list, makePromotion({ narrativeControl: 0 }));
    // Same fighter, same division, different promotional politics.
    expect(pushy.eligible).toBe(true);
    expect(meritocratic.eligible).toBe(false);
  });

  it('always explains itself, eligible or not', () => {
    const list = ranked(60, 2);
    const player = list.find((r) => r.fighter.id === 'player')!.fighter;
    expect(titleShotEligibility(player, list, makePromotion()).reason.length).toBeGreaterThan(15);
  });
});

describe('setChampion', () => {
  it('crowns and vacates without mutating the promotion', () => {
    const p = makePromotion();
    const crowned = setChampion(p, DIV, asFighterId('a'));
    expect(crowned.champions[DIV]).toBe('a');
    expect(p.champions[DIV], 'input was mutated').toBeUndefined();

    const vacated = setChampion(crowned, DIV, undefined);
    expect(vacated.champions[DIV]).toBeUndefined();
  });
});

describe('careerProgress', () => {
  it('is zero for the unsigned and one for a global champion', () => {
    expect(careerProgress(contender('a', 50), undefined, undefined, false)).toBe(0);
    expect(
      careerProgress(contender('a', 50), makePromotion({ tier: 'global' }), 0, true),
    ).toBe(1);
  });

  it('rises with tier and with rank', () => {
    const f = contender('a', 50);
    const regionalTop = careerProgress(f, makePromotion({ tier: 'regional' }), 1, false);
    const majorTop = careerProgress(f, makePromotion({ tier: 'major' }), 1, false);
    const majorLow = careerProgress(f, makePromotion({ tier: 'major' }), RANKED_DEPTH, false);

    expect(majorTop).toBeGreaterThan(regionalTop);
    expect(majorTop).toBeGreaterThan(majorLow);
  });

  it('stays inside 0–1 at every rung', () => {
    for (const tier of TIER_ORDER) {
      for (const position of [undefined, 0, 1, 8, RANKED_DEPTH]) {
        const value = careerProgress(contender('a', 50), makePromotion({ tier }), position, position === 0);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
