/**
 * Talking terms. Doc 34 C4.
 *
 * The shape that matters: a fair offer closes, a lowball ends the talking, and everything between
 * gets a counter that is personal — the ambitious want the deal short and the belt clause gone,
 * the money-minded want a bonus, and somebody who remembers being wronged wants paying for it.
 */

import { describe, expect, it } from 'vitest';
import {
  counterLimit,
  isHoldingOut,
  makeOffer,
  openingTerms,
  preferredFights,
  readTerms,
  reservation,
  takeCounter,
  termsValue,
  type TableContext,
} from './negotiation.js';
import { acceptanceOf, replyDelayDays, shapeBoutCounter } from './boutAgreements.js';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import { withLedgerEntry } from '../domain/relationship.js';
import type { Fighter } from '../domain/fighter.js';

const promotion = makePromotion();
const DAY = 2000;
const table = (fighter: Fighter, incumbent = false): TableContext => ({
  fighter,
  promotion,
  day: DAY,
  incumbent,
});
const fighter = { ...makeFighter({ id: 'neg' }), starPower: 40 };
const scaled = (f: Fighter, k: number) => {
  const t = openingTerms(f, promotion);
  return { ...t, showPurse: t.showPurse * k, winBonus: t.winBonus * k };
};

describe('the terms sheet', () => {
  it('prices the length of the deal against what they want', () => {
    const ambitious = makeFighter({ personality: { ambition: 80 } });
    const loyal = makeFighter({ personality: { loyalty: 80, ambition: 40 } });
    expect(preferredFights(ambitious)).toBeLessThan(preferredFights(loyal));
    const t = openingTerms(ambitious, promotion);
    expect(termsValue(ambitious, t)).toBeGreaterThan(
      termsValue(ambitious, { ...t, fightsOwed: 6 }),
    );
  });

  it('reads a generous offer as a yes and a lowball as a waste of time', () => {
    expect(readTerms(table(fighter), scaled(fighter, 1.6)).chance).toBe(1);
    expect(readTerms(table(fighter), scaled(fighter, 0.4)).chance).toBe(0);
  });
});

describe('the talking', () => {
  it('closes a fair offer, walks from an insult, and counters in between', () => {
    expect(makeOffer(table(fighter), undefined, scaled(fighter, 1.6)).state).toBe('agreed');
    const insult = makeOffer(table(fighter), undefined, scaled(fighter, 0.4));
    expect(insult.state).toBe('walked');
    expect(insult.quote).toBeTruthy();

    const close = makeOffer(table(fighter), undefined, scaled(fighter, 0.88));
    expect(close.state).toBe('countered');
    expect(close.ask!.showPurse).toBeGreaterThan(scaled(fighter, 0.88).showPurse);
    // Their counter is one they would sign.
    expect(readTerms(table(fighter), close.ask!).chance).toBeGreaterThanOrEqual(0.9);
    expect(takeCounter(close)).toMatchObject({ state: 'agreed', agreed: close.ask });
  });

  it('shapes the counter by who is asking', () => {
    const ambitious = {
      ...makeFighter({ id: 'amb', personality: { ambition: 85 } }),
      starPower: 40,
    };
    const counter = makeOffer(table(ambitious), undefined, {
      ...scaled(ambitious, 1.05),
      fightsOwed: 4,
    }).ask!;
    expect(counter.championshipExtension).toBe('none');
    expect(counter.fightsOwed).toBe(preferredFights(ambitious));
  });

  it('stops counting after one or two counters, by temperament', () => {
    const proud = makeFighter({ personality: { ego: 80 } });
    expect(counterLimit(proud)).toBe(1);
    let talks = makeOffer(table(proud), undefined, scaled(proud, 0.88));
    expect(talks.state).toBe('countered');
    talks = makeOffer(table(proud), talks, scaled(proud, 0.88));
    expect(talks.state).toBe('walked');
  });

  it('charges for what they remember, on a re-sign', () => {
    const wronged = {
      ...fighter,
      ledger: withLedgerEntry(undefined, {
        day: DAY,
        promotionId: promotion.id,
        kind: 'titleShotSkipped',
      }),
    };
    expect(reservation(table(wronged, true))).toBeGreaterThan(reservation(table(fighter, true)));
  });
});

describe('holding out', () => {
  it('refuses every bout, title or not, until the deal is redone', () => {
    const aggrieved = { ...makeFighter({ personality: { ego: 70 } }), resentment: 80 };
    expect(isHoldingOut(aggrieved)).toBe(true);
    const read = acceptanceOf({
      fighter: aggrieved,
      opponent: makeFighter({ id: 'o' }),
      promotion,
      isTitleFight: true,
      day: DAY,
    });
    expect(read.chance).toBe(0);
    expect(read.holdout).toBe(true);
    expect(isHoldingOut({ ...aggrieved, resentment: 0 })).toBe(false);
  });
});

describe('bout replies', () => {
  it('take two to seven days, the same every time for the same offer', () => {
    const days = Array.from({ length: 40 }, (_, i) =>
      replyDelayDays(fighter, undefined, promotion.id, `offer:${i}`),
    );
    expect(Math.min(...days)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...days)).toBeLessThanOrEqual(7);
    expect(replyDelayDays(fighter, undefined, promotion.id, 'k')).toBe(
      replyDelayDays(fighter, undefined, promotion.id, 'k'),
    );
  });

  it('counter with a slot, five rounds or an opponent before money', () => {
    const read = { chance: 0.5 };
    const star = { ...makeFighter({ personality: { ego: 70 } }), starPower: 60 };
    expect(
      shapeBoutCounter({
        fighter: star,
        read,
        position: 'prelim',
        rounds: 3,
        show: 10,
        buyable: true,
      }),
    ).toEqual({ kind: 'slot', position: 'mainCard' });

    const hungry = makeFighter({ personality: { ambition: 80, ego: 30 } });
    expect(
      shapeBoutCounter({
        fighter: hungry,
        read,
        position: 'coMain',
        rounds: 3,
        show: 10,
        buyable: true,
      }),
    ).toEqual({ kind: 'rounds', rounds: 5 });

    const plain = makeFighter({ personality: { ambition: 40, ego: 40 } });
    expect(
      shapeBoutCounter({
        fighter: plain,
        read,
        position: 'mainCard',
        rounds: 3,
        show: 10,
        buyable: true,
      })?.kind,
    ).toBe('money');
    expect(
      shapeBoutCounter({
        fighter: plain,
        read,
        position: 'mainCard',
        rounds: 3,
        show: 10,
        buyable: false,
      }),
    ).toBeUndefined();

    const champ = makeFighter({ id: 'champ', firstName: 'The', lastName: 'Champ' });
    expect(
      shapeBoutCounter({
        fighter: plain,
        read,
        position: 'mainCard',
        rounds: 3,
        show: 10,
        buyable: true,
        want: { id: 'titleShot', label: 'A title shot', detail: '' },
        preferred: champ,
      }),
    ).toMatchObject({ kind: 'opponent', preferredId: champ.id });
  });
});
