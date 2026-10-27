/**
 * Doc 34's B1: the money underneath promoter mode, one rule at a time.
 *
 * The long-sim suite (`tests/long-sim/promoter-economy.test.ts`) pins what these add up to over a
 * year of play. These pin the rules themselves, so a change to one shows up here first rather
 * than as a drift in a number nobody can attribute.
 */

import { describe, expect, it } from 'vitest';
import { asFighterId } from '../core/ids.js';
import { makePromotion } from '../testing/fixtures.js';
import { simulateFight } from '../fight/simulate.js';
import { ARCHETYPES } from '../testing/fixtures.js';
import {
  BUZZ_BASELINE,
  IDLE_GRACE_DAYS,
  MAX_BUZZ_SWING,
  MAX_MARKETING_UPLIFT,
  MIN_BUZZ,
  bonusPoolFor,
  eventRevenue,
  favouriteOf,
  idleBuzz,
  marketingUplift,
  settleNight,
  upsetsIn,
  venueFor,
  type EventRevenue,
} from './events.js';
import { homeMarket, marketOf, marketsFor, SMALL_MARKET_COST } from './markets.js';
import { periodCosts, staffLevel, STAFF_LEVEL_OVERHEADS } from './promotionCosts.js';
import { MAX_RESIGN_RAISE, reSignTerms } from './money.js';
import { createRng } from '../core/rng.js';

const regional = (over: Parameters<typeof makePromotion>[0] = {}) =>
  makePromotion({
    tier: 'regional',
    prestige: 52,
    buzz: 38,
    budget: 5000,
    minimumPurse: 6,
    revenueShareCapable: false,
    ...over,
  });

const night = (input: {
  promotion?: ReturnType<typeof regional>;
  city?: string;
  bouts?: number;
  draw?: number;
  purses?: number;
  marketing?: number;
}): EventRevenue => {
  const promotion = input.promotion ?? regional();
  const market = marketOf(input.city ?? 'Tulsa', 'USA');
  return eventRevenue({
    promotion,
    venue: venueFor(promotion, 2500, createRng('v'), market),
    broadcast: 'streamed',
    headlineDraw: input.draw ?? 45,
    bouts: input.bouts ?? 9,
    purses: input.purses ?? 120,
    bonuses: bonusPoolFor(promotion),
    marketing: input.marketing,
  });
};

describe('a card costs money to put on', () => {
  it('loses money with nothing on it', () => {
    // An empty card forecast +£53k: a flat broadcast fee and a free building.
    expect(night({ bouts: 0, purses: 0 }).profit).toBeLessThan(0);
    expect(night({ bouts: 0, purses: 0 }).attendance).toBe(0);
  });

  it('earns a regional promotion tens of thousands on a decent card, not hundreds', () => {
    const profit = night({}).profit;
    expect(profit).toBeGreaterThan(0);
    expect(profit).toBeLessThan(100);
  });

  it('makes a thin card a worse night than a full one, purse for purse', () => {
    // Two bouts' purses for a card of two: the room and the crew cost the same either way.
    // The two that are signed are the main event and the co-main, which are nearly half the
    // purses on a card (2.5 + 1.6 of 9.1 position units).
    const thin = night({ bouts: 2, purses: 55 });
    const full = night({ bouts: 9, purses: 120 });
    expect(thin.profit).toBeLessThan(full.profit);
    expect(thin.profit).toBeLessThan(0);
  });
});

describe('the market a card goes to', () => {
  it('prices Las Vegas at about two and a half times a small market', () => {
    expect(marketOf('Las Vegas', 'USA').costFactor / SMALL_MARKET_COST).toBeCloseTo(2.5, 1);
    expect(marketOf('Tulsa', 'USA').costFactor).toBe(SMALL_MARKET_COST);
  });

  it('charges more to stage the same card somewhere expensive', () => {
    expect(night({ city: 'Las Vegas' }).costs).toBeGreaterThan(night({ city: 'Tulsa' }).costs);
  });

  it('stages a promotion’s cards in its own city', () => {
    const promotion = regional({ homeCity: 'Tulsa' });
    expect(homeMarket(promotion).city).toBe('Tulsa');
    expect(venueFor(promotion, 2000, createRng('v')).city).toBe('Tulsa');
    expect(marketsFor(promotion)[0]!.city).toBe('Tulsa');
  });

  it('falls back on the country’s capital market for a promotion with no city', () => {
    expect(homeMarket(regional({ baseCountry: 'Japan' })).city).toBe('Tokyo');
  });
});

describe('marketing', () => {
  it('buys demand, with diminishing returns', () => {
    const p = regional();
    const first = marketingUplift(p, 10);
    const second = marketingUplift(p, 20) - first;
    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
    expect(marketingUplift(p, 10_000)).toBeLessThanOrEqual(MAX_MARKETING_UPLIFT);
    expect(marketingUplift(p, 0)).toBe(0);
  });

  it('sells more tickets and costs what it costs', () => {
    const plain = night({});
    const sold = night({ marketing: 15 });
    expect(sold.attendance).toBeGreaterThan(plain.attendance);
    expect(sold.costs - plain.costs).toBeGreaterThanOrEqual(15);
  });
});

describe('overheads follow the organisation, not the bank balance', () => {
  it('charges a rich promotion and a poorer one of the same standing the same', () => {
    const rich = periodCosts({ promotion: regional({ budget: 50_000 }), rosterSize: 0 });
    const poorer = periodCosts({ promotion: regional({ budget: 5_000 }), rosterSize: 0 });
    expect(rich.overheads).toBe(poorer.overheads);
  });

  it('charges a bigger organisation more', () => {
    expect(staffLevel(makePromotion({ prestige: 97, budget: 60_000 }))).toBe(5);
    expect(staffLevel(regional())).toBe(3);
    expect(STAFF_LEVEL_OVERHEADS[5]).toBeGreaterThan(STAFF_LEVEL_OVERHEADS[3]);
  });

  it('lays staff off when the money will not stretch to them', () => {
    expect(staffLevel(regional({ budget: 50 }))).toBeLessThan(staffLevel(regional()));
  });
});

describe('attention', () => {
  const result = (method: 'ko' | 'decisionUnanimous', winner = 'r') => ({
    ...simulateFight({
      boutId: 'b',
      seed: 'b',
      red: { fighter: ARCHETYPES.bomber() },
      blue: { fighter: ARCHETYPES.canFodder() },
    }),
    method,
    winnerId: asFighterId(winner),
  });
  const zero: EventRevenue = {
    gate: 0,
    broadcast: 0,
    sponsorship: 0,
    costs: 0,
    profit: 0,
    attendance: 0,
  };
  const settle = (input: Partial<Parameters<typeof settleNight>[0]>) =>
    settleNight({
      promotion: regional({ buzz: BUZZ_BASELINE.regional }),
      revenue: zero,
      results: [],
      ...input,
    });

  it('rises for a title fight', () => {
    expect(settle({ titleFights: 1 }).buzzDelta).toBeGreaterThan(settle({}).buzzDelta);
  });

  it('rises for upsets', () => {
    expect(settle({ upsets: 2 }).buzzDelta).toBeGreaterThan(settle({}).buzzDelta);
  });

  it('rises for finishes, against the same card won on points', () => {
    const delivered = [70, 70, 70];
    const finishes = settle({ results: [result('ko')], recentDelivery: delivered });
    const points = settle({ results: [result('decisionUnanimous')], recentDelivery: delivered });
    expect(finishes.buzzDelta).toBeGreaterThan(points.buzzDelta);
  });

  it('drifts back towards the tier’s level rather than ratcheting', () => {
    const hot = settle({ promotion: regional({ buzz: 90 }) });
    const cold = settle({ promotion: regional({ buzz: 5 }) });
    expect(hot.buzzDelta).toBeLessThan(0);
    expect(cold.buzzDelta).toBeGreaterThan(0);
  });

  it('never moves further than a night should, whatever happened', () => {
    const wild = settle({ titleFights: 5, upsets: 9, promotion: regional({ buzz: 5 }) });
    expect(Math.abs(wild.buzzDelta)).toBeLessThanOrEqual(MAX_BUZZ_SWING);
  });

  it('fades without cards, after a grace period, to a floor', () => {
    expect(idleBuzz(40, IDLE_GRACE_DAYS - 1, 14)).toBe(40);
    expect(idleBuzz(40, IDLE_GRACE_DAYS + 28, 14)).toBeLessThan(40);
    expect(idleBuzz(MIN_BUZZ, 400, 14)).toBe(MIN_BUZZ);
  });
});

describe('upsets', () => {
  it('knows the favourite before the fight and counts the ones who lost', () => {
    const red = { id: asFighterId('r') };
    const blue = { id: asFighterId('b') };
    expect(favouriteOf(red, blue, 0.8)).toBe(red.id);
    expect(favouriteOf(red, blue, 0.5)).toBeUndefined();
    const favourites = new Map([['x', red.id]]);
    expect(upsetsIn(favourites, [{ boutId: 'x', result: { winnerId: blue.id } }])).toBe(1);
    expect(upsetsIn(favourites, [{ boutId: 'x', result: { winnerId: red.id } }])).toBe(0);
  });
});

describe('re-signing after wins', () => {
  const market = { showPurse: 12, winBonus: 10 };
  const was = { showPurse: 12, winBonus: 8 };

  it('raises a winner on what they were on', () => {
    const terms = reSignTerms(market, was, 3);
    expect(terms.showPurse).toBeCloseTo(12 * 1.3, 5);
  });

  it('never pays less than the market', () => {
    expect(reSignTerms(market, { showPurse: 2, winBonus: 2 }, 1).showPurse).toBe(12);
    expect(reSignTerms(market, was, 0)).toEqual(market);
  });

  it('caps the raise, so a raise on a raise does not compound', () => {
    const terms = reSignTerms(market, { showPurse: 40, winBonus: 40 }, 9);
    expect(terms.showPurse).toBeLessThanOrEqual(market.showPurse * (1 + MAX_RESIGN_RAISE));
  });
});
