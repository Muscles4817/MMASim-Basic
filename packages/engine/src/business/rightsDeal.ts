/**
 * The television deal, as a counterparty with an opinion.
 *
 * Doc 13's failure state: promotions do not go bankrupt the way a shop does — they lose their
 * television deal, and then they get bought, or they shrink. The deal pays a fee for every card it
 * carries, wants a minimum number of cards a year, and wants them watched. How satisfied the
 * broadcaster is moves card by card against a ratings target; below `REVIEW_BELOW` the deal goes
 * under review with `REVIEW_CARDS` cards to recover, and a deal that does not recover — or ends a
 * year that unhappy — drops to streaming-only at a fraction of the fee.
 *
 * The trap doc 13 names is real here: the obvious recovery move after a bad year, running cheap
 * cards with nobody on them to save money, is exactly the card that rates badly.
 *
 * Pure: the world decides when a card ran and a year ended, and stores the deal on the promotion.
 */

import { clamp } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { Promotion } from '../domain/organisations.js';

export interface RightsDeal {
  /** Who carries the cards. */
  broadcaster: string;
  /** What the deal pays for each card it carries, in thousands, before a thin card's discount. */
  feePerCard: number;
  /** Cards the broadcaster expects in a deal year. */
  minimumCards: number;
  /** The rating (`cardRating`) an ordinary card is expected to reach. */
  ratingsTarget: number;
  /** 0–100. How the broadcaster feels about the deal. */
  satisfaction: number;
  /** The day the current deal year began. A renewal starts the next one. */
  startedDay: GameDay;
  /**
   * Cards left to turn it round, while the deal is under review. Absent when it is not.
   *
   * Stored rather than derived because it is the broadcaster's decision, made on a day, and the
   * countdown it starts is a fact the player is told.
   */
  reviewCardsLeft?: number;
  /** Dropped to a streaming deal: a fraction of the fee, and no television audience. */
  streamingOnly: boolean;
}

/** Satisfaction below which the broadcaster puts the deal under review. */
export const REVIEW_BELOW = 40;
/** Cards a deal under review has to recover in. */
export const REVIEW_CARDS = 3;
/** Satisfaction that takes a deal back out of review. */
export const REVIEW_CLEARED = 50;
/** What a streaming-only deal pays, as a share of the television fee it replaced. */
export const STREAMING_SHARE = 0.3;
/** The most a renewal moves the fee, either way. */
export const MAX_RENEWAL_SWING = 0.3;
/** Satisfaction at which a renewal leaves the fee where it was. */
const RENEWAL_PAR = 55;
/** Satisfaction a streaming-only deal needs at renewal to win television back. */
const BACK_ON_TV = 70;
/** How far one card moves satisfaction, per point of rating above or below the target. */
const SATISFACTION_PER_POINT = 0.8;
const MAX_CARD_SWING = 10;
/** What a year short of the minimum costs, at the extreme of running nothing at all. */
const SHORTFALL_PENALTY = 30;

const BROADCASTERS = [
  'Channel 9',
  'Prime Sports Network',
  'FightPass+',
  'Combat TV',
  'Allstar Sports',
  'Metro Sports',
  'Arena Network',
  'Ringside Plus',
] as const;

/**
 * How well a card rated, 0–100: the headline's draw, discounted for a thin card, the promotion's
 * attention, and a belt on the line. What a broadcaster sees, which is not what a promoter sees:
 * it does not care whether the fights were competitive or whether the card made money.
 */
export function cardRating(input: {
  promotion: Promotion;
  headlineDraw: number;
  /** `depthMultiplier` for the card. */
  depth: number;
  titleFights: number;
}): number {
  const { promotion, headlineDraw, depth, titleFights } = input;
  const belt = titleFights > 0 ? TITLE_RATING : 0;
  return Math.round(clamp(headlineDraw * 0.6 * depth + promotion.buzz * 0.4 + belt, 0, 100));
}

/** What a title fight adds to a card's rating. */
const TITLE_RATING = 8;

/**
 * What an ordinary card of this promotion's rates, which is what a broadcaster signs up for.
 *
 * An ordinary headline draws about the promotion's prestige (`drawWeight` with a typical pairing),
 * on a full card with no belt.
 */
export const ordinaryRating = (promotion: Promotion): number =>
  cardRating({ promotion, headlineDraw: promotion.prestige, depth: 1, titleFights: 0 });

/**
 * The deal a promotion starts the save with.
 *
 * The fee is what the promotion's broadcasting already earned — the deal changes what happens
 * next, not where it starts — and the minimum is what its schedule can deliver.
 */
export function openingDeal(input: {
  promotion: Promotion;
  /** The non-pay-per-view broadcast fee the promotion earns today, per card, in thousands. */
  fee: number;
  /** Cards a year its schedule runs (`cardsPerYear`). */
  cardsPerYear: number;
  day: GameDay;
  /** Picks the broadcaster's name; any stable number. */
  pick: number;
}): RightsDeal {
  const { promotion, fee, cardsPerYear, day, pick } = input;
  return {
    broadcaster: BROADCASTERS[Math.abs(pick) % BROADCASTERS.length]!,
    feePerCard: Math.round(fee * 10) / 10,
    minimumCards: Math.max(2, Math.floor(cardsPerYear * 0.75)),
    ratingsTarget: ordinaryRating(promotion),
    satisfaction: 60,
    startedDay: day,
    streamingOnly: false,
  };
}

/** What the broadcaster thinks after a card, and whether the review it may be in has resolved. */
export function afterCard(
  deal: RightsDeal,
  rating: number,
): { deal: RightsDeal; event?: 'review' | 'cleared' | 'dropped' } {
  const swing = clamp(
    (rating - deal.ratingsTarget) * SATISFACTION_PER_POINT,
    -MAX_CARD_SWING,
    MAX_CARD_SWING,
  );
  const satisfaction = Math.round(clamp(deal.satisfaction + swing, 0, 100) * 10) / 10;
  let next: RightsDeal = { ...deal, satisfaction };

  if (deal.reviewCardsLeft !== undefined) {
    if (satisfaction >= REVIEW_CLEARED) {
      next = { ...next, reviewCardsLeft: undefined };
      return { deal: next, event: 'cleared' };
    }
    const left = deal.reviewCardsLeft - 1;
    if (left <= 0) return { deal: dropToStreaming(next), event: 'dropped' };
    return { deal: { ...next, reviewCardsLeft: left } };
  }

  if (!deal.streamingOnly && satisfaction < REVIEW_BELOW) {
    return { deal: { ...next, reviewCardsLeft: REVIEW_CARDS }, event: 'review' };
  }
  return { deal: next };
}

function dropToStreaming(deal: RightsDeal): RightsDeal {
  return {
    ...deal,
    feePerCard: Math.round(deal.feePerCard * STREAMING_SHARE * 10) / 10,
    streamingOnly: true,
    satisfaction: 50,
    reviewCardsLeft: undefined,
  };
}

/**
 * The end of a deal year: a shortfall on the minimum costs satisfaction, and the deal renews on
 * terms that follow it — up to `MAX_RENEWAL_SWING` either way — or drops to streaming-only if the
 * broadcaster is unhappy enough. A streaming deal that has earned it goes back on television.
 */
export function renew(input: {
  deal: RightsDeal;
  promotion: Promotion;
  cardsThisYear: number;
  day: GameDay;
  /** The television fee a fresh deal would pay today, for a streaming deal that wins it back. */
  freshFee: number;
}): { deal: RightsDeal; outcome: 'renewed' | 'dropped' | 'restored' } {
  const { deal, promotion, cardsThisYear, day, freshFee } = input;
  const shortfall = clamp(1 - cardsThisYear / Math.max(1, deal.minimumCards), 0, 1);
  const satisfaction = clamp(deal.satisfaction - shortfall * SHORTFALL_PENALTY, 0, 100);
  const base = {
    ...deal,
    satisfaction,
    startedDay: day,
    ratingsTarget: ordinaryRating(promotion),
    reviewCardsLeft: undefined,
  };

  if (deal.streamingOnly) {
    if (satisfaction >= BACK_ON_TV) {
      return {
        deal: { ...base, feePerCard: freshFee, streamingOnly: false, satisfaction: 60 },
        outcome: 'restored',
      };
    }
    return { deal: base, outcome: 'renewed' };
  }

  if (satisfaction < REVIEW_BELOW) return { deal: dropToStreaming(base), outcome: 'dropped' };

  const change = clamp((satisfaction - RENEWAL_PAR) / 100, -MAX_RENEWAL_SWING, MAX_RENEWAL_SWING);
  return {
    deal: { ...base, feePerCard: Math.round(deal.feePerCard * (1 + change) * 10) / 10 },
    outcome: 'renewed',
  };
}

/** The day the deal is up for renewal. */
export const renewalDay = (deal: RightsDeal): GameDay => (deal.startedDay + 365) as GameDay;

/** How the deal reads at a glance, for the dashboard and the preview. */
export function dealHealth(deal: RightsDeal): 'healthy' | 'watching' | 'review' | 'streaming' {
  if (deal.streamingOnly) return 'streaming';
  if (deal.reviewCardsLeft !== undefined) return 'review';
  return deal.satisfaction < REVIEW_CLEARED ? 'watching' : 'healthy';
}
