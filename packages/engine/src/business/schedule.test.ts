/**
 * How often a promotion runs, and why it is not a constant.
 */

import { describe, expect, it } from 'vitest';
import { makePromotion } from '../testing/fixtures.js';
import { CARD_SIZE } from './events.js';
import { MAX_CARDS_PER_YEAR, cardsPerYear, daysBetweenCards } from './schedule.js';
import type { Promotion, PromotionTier } from '../domain/organisations.js';

const of = (tier: PromotionTier, over: Partial<Promotion> = {}): Promotion =>
  makePromotion({ tier, budget: 100_000, ...over });

describe('a promotion runs its own calendar', () => {
  it('gives the leader a show every few weeks and a regional one a month or more apart', () => {
    /*
     * The shipped 2026 shape: 204 fighters on the leader, 64 on a regional. The claim that matters
     * is the *ratio* — a promotion's calendar was a share of a global quota, so the leader ran only
     * two and a half times as often as the smallest promotion in the world while having three
     * times the roster, and adding a promotion anywhere took dates off everybody.
     */
    const leader = daysBetweenCards(of('global', { prestige: 97 }), 204);
    const regional = daysBetweenCards(of('regional', { prestige: 38 }), 64);
    expect(leader).toBeLessThan(28);
    expect(regional).toBeGreaterThan(40);
    expect(regional / leader).toBeGreaterThan(2);
  });

  it('does not care who else is in the world, which is the whole point', () => {
    /*
     * `advanceWorld` ran three cards a fortnight across the *entire sport* and drew whose night it
     * was from a prestige-weighted lottery, so founding a promotion took dates off every other
     * promotion in the game. This function takes no such argument, and that is the fix — the
     * assertion exists to stop one being added.
     */
    const promotion = of('global', { prestige: 97 });
    expect(cardsPerYear(promotion, 204)).toBe(cardsPerYear(promotion, 204));
    expect(cardsPerYear.length).toBe(2);
  });

  it('scales with the roster, because a card needs eighteen people who are fit to fight', () => {
    const promotion = of('regional');
    expect(cardsPerYear(promotion, 120)).toBeGreaterThan(cardsPerYear(promotion, 60) * 1.8);
  });

  it('stages nothing at all with nobody signed', () => {
    expect(cardsPerYear(of('regional'), 0)).toBe(0);
    expect(daysBetweenCards(of('regional'), 0)).toBe(Infinity);
  });

  it('caps a promotion at what a promotion of its size actually runs', () => {
    // A roster of two thousand does not make a regional show into the leader.
    expect(cardsPerYear(of('regional'), 5000)).toBeLessThanOrEqual(MAX_CARDS_PER_YEAR);
    expect(cardsPerYear(of('regional'), 5000)).toBeLessThan(cardsPerYear(of('global'), 5000));
  });

  it('never asks a roster for more bouts than it has fighters to supply', () => {
    // Every card is `CARD_SIZE` bouts and every bout is two people. A schedule that needs a
    // fighter more than about three times a year is a schedule the world tick will not fill.
    for (const tier of ['global', 'major', 'regional', 'developmental'] as const) {
      for (const roster of [30, 60, 120, 250, 600]) {
        const bouts = cardsPerYear(of(tier), roster) * CARD_SIZE;
        expect((bouts * 2) / roster, `${tier} at ${roster}`).toBeLessThan(3);
      }
    }
  });
});

describe('money is a schedule constraint', () => {
  it('cuts a promotion back when it cannot pay for the cards', () => {
    const roster = 100;
    const flush = cardsPerYear(of('regional', { budget: 500_000 }), roster);
    const broke = cardsPerYear(of('regional', { budget: 0 }), roster);
    expect(broke).toBeLessThan(flush);
  });

  it('never cuts it to nothing, because that would make insolvency permanent', () => {
    // `chargeCosts` bills whether or not anybody fights, so a promotion that stops running cards
    // has no way back. It cuts back; it does not close.
    expect(cardsPerYear(of('regional', { budget: 0 }), 100)).toBeGreaterThan(0);
  });
});
