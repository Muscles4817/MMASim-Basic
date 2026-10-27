import { describe, expect, it } from 'vitest';
import type { GameDay } from '../core/clock.js';
import { makePromotion } from '../testing/fixtures.js';
import {
  afterCard,
  cardRating,
  dealHealth,
  MAX_RENEWAL_SWING,
  openingDeal,
  ordinaryRating,
  renew,
  renewalDay,
  REVIEW_BELOW,
  REVIEW_CARDS,
  STREAMING_SHARE,
  type RightsDeal,
} from './rightsDeal.js';

const promotion = makePromotion({ tier: 'regional', prestige: 45, buzz: 40 });
const day = 1000 as GameDay;
const deal: RightsDeal = openingDeal({ promotion, fee: 90, cardsPerYear: 8, day, pick: 3 });

describe('a television deal', () => {
  it('opens at what the promotion already earns, asking for most of its schedule', () => {
    expect(deal.feePerCard).toBe(90);
    expect(deal.minimumCards).toBe(6);
    expect(deal.ratingsTarget).toBe(ordinaryRating(promotion));
    expect(dealHealth(deal)).toBe('healthy');
    expect(renewalDay(deal)).toBe(1365);
  });

  it('rates a card on its headline, its depth and a belt — not on whether it made money', () => {
    const full = cardRating({ promotion, headlineDraw: 60, depth: 1, titleFights: 0 });
    const thin = cardRating({ promotion, headlineDraw: 60, depth: 0.4, titleFights: 0 });
    const belt = cardRating({ promotion, headlineDraw: 60, depth: 1, titleFights: 1 });
    expect(thin).toBeLessThan(full);
    expect(belt).toBeGreaterThan(full);
  });

  it('goes under review after bad cards, and drops to streaming if they keep coming', () => {
    let current: RightsDeal = deal;
    const events: (string | undefined)[] = [];
    for (let i = 0; i < 10 && !current.streamingOnly; i++) {
      const next = afterCard(current, 0);
      events.push(next.event);
      current = next.deal;
    }
    expect(events).toContain('review');
    expect(events.at(-1)).toBe('dropped');
    // The review gives exactly `REVIEW_CARDS` cards to recover.
    expect(events.length - events.indexOf('review') - 1).toBe(REVIEW_CARDS);
    expect(current.feePerCard).toBeCloseTo(deal.feePerCard * STREAMING_SHARE, 1);
    expect(dealHealth(current)).toBe('streaming');
  });

  it('clears a review with cards that win the broadcaster back — more than one great night', () => {
    const inReview: RightsDeal = { ...deal, satisfaction: REVIEW_BELOW - 1, reviewCardsLeft: 3 };
    const first = afterCard(inReview, 100);
    expect(first.event).toBeUndefined();
    const second = afterCard(first.deal, 100);
    expect(second.event).toBe('cleared');
    expect(second.deal.reviewCardsLeft).toBeUndefined();
  });

  it('renews within thirty per cent either way, on how the year went', () => {
    const happy = renew({
      deal: { ...deal, satisfaction: 100 },
      promotion,
      cardsThisYear: 8,
      day: renewalDay(deal),
      freshFee: 90,
    });
    const grumpy = renew({
      deal: { ...deal, satisfaction: 45 },
      promotion,
      cardsThisYear: 8,
      day: renewalDay(deal),
      freshFee: 90,
    });
    expect(happy.outcome).toBe('renewed');
    expect(happy.deal.feePerCard).toBeGreaterThan(deal.feePerCard);
    expect(happy.deal.feePerCard).toBeLessThanOrEqual(deal.feePerCard * (1 + MAX_RENEWAL_SWING));
    expect(grumpy.deal.feePerCard).toBeLessThan(deal.feePerCard);
    expect(happy.deal.startedDay).toBe(renewalDay(deal));
  });

  it('holds a short schedule against the deal at renewal', () => {
    const full = renew({ deal, promotion, cardsThisYear: 8, day, freshFee: 90 });
    const none = renew({ deal, promotion, cardsThisYear: 0, day, freshFee: 90 });
    expect(none.deal.satisfaction).toBeLessThan(full.deal.satisfaction);
    expect(none.outcome).toBe('dropped');
  });

  it('puts a streaming deal back on television once it has earned it', () => {
    const streaming: RightsDeal = {
      ...deal,
      streamingOnly: true,
      feePerCard: 27,
      satisfaction: 90,
    };
    const back = renew({ deal: streaming, promotion, cardsThisYear: 8, day, freshFee: 90 });
    expect(back.outcome).toBe('restored');
    expect(back.deal.feePerCard).toBe(90);
    expect(back.deal.streamingOnly).toBe(false);
  });
});
