/**
 * Events and fight cards.
 *
 * See docs/12-events-and-cards.md. A card is the unit that makes the business layer work:
 * a promoter does not book a fight, they build a night. It is also the container three other
 * systems have been queued behind — revenue points attach to an *event* rather than a bout,
 * the bonus pool needs a card to sit on, and `CARD_POSITION_PURSE` has been defined and
 * unreachable because nothing produced a card position.
 *
 * Two rulings from the design review are implemented here rather than in the UI, because
 * they are properties of the model:
 *
 *  - **Detail follows the player, not the broadcast.** An earlier draft resolved bouts in
 *    reverse order so the night read like a television show. Both critics rejected it: it
 *    means eight fights of dead time before the player's own, and it fails *worse* when the
 *    player is on the prelims, because then they watch their fight and spectate the main
 *    card. So a card resolves around the player's bout.
 *  - **The bonus pool is decided by what happened**, not by a die roll. Fight of the Night
 *    and Performance of the Night are how a prelim fighter doubles their pay, and they are
 *    what makes an exciting loss worth something in a game that otherwise pays only the
 *    raised hand.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { DivisionId, EventId, FighterId, PromotionId } from '../core/ids.js';
import { asId } from '../core/ids.js';
import type { Rng } from '../core/rng.js';
import type { FightResult } from '../fight/types.js';
import type { Promotion } from '../domain/organisations.js';
import type { CardPosition } from './money.js';

/** How the night reaches an audience, which decides the revenue model entirely. */
export type Broadcast = 'ppv' | 'televised' | 'streamed';

export interface Venue {
  name: string;
  city: string;
  country: string;
  capacity: number;
}

export interface CardBout {
  boutId: string;
  redId: FighterId;
  blueId: FighterId;
  divisionId: DivisionId;
  position: CardPosition;
  /** 0 is the main event, counting down the card. */
  order: number;
  rounds: 3 | 5;
  isTitleFight: boolean;
  /** Set once the night has been simulated. */
  resultId?: string;
}

export type EventStatus = 'scheduled' | 'complete' | 'cancelled';

/**
 * One night: one venue, one promotion, one card.
 *
 * Named `FightNight` rather than `Event` because `FightEvent` is already the play-by-play
 * beat type and `Event` is a DOM global. The domain language is on our side here anyway —
 * you do not book a fight, you build a night.
 */
export interface FightNight {
  id: EventId;
  promotionId: PromotionId;
  day: GameDay;
  name: string;
  venue: Venue;
  broadcast: Broadcast;
  status: EventStatus;
  /** Ordered. Index 0 is the main event. */
  bouts: readonly CardBout[];
  /** Thousands. Fight of the Night and Performance of the Night come out of this. */
  bonusPool: number;
}

export const eventId = (promotionId: PromotionId, day: GameDay): EventId =>
  asId<EventId>(`evt_${promotionId}_${day}`);

/**
 * Card shape.
 *
 * A main card of five and a prelim card of four is the standard night, and the numbers are
 * what make card position mean something: being a 12-0 prelim fighter is a real and
 * frustrating situation, and getting off the prelims is a genuine milestone.
 */
export const MAIN_CARD_SIZE = 5;
export const PRELIM_CARD_SIZE = 4;
export const CARD_SIZE = MAIN_CARD_SIZE + PRELIM_CARD_SIZE;

/** Where a bout sits, from its index down the card. */
export function positionFor(order: number, isTitleFight: boolean): CardPosition {
  if (order === 0) return 'mainEvent';
  if (order === 1) return 'coMain';
  if (order < MAIN_CARD_SIZE) return 'mainCard';
  // A title fight never goes on the prelims, whatever else is on the night.
  return isTitleFight ? 'mainCard' : 'prelim';
}

export interface BoutSeed {
  boutId: string;
  redId: FighterId;
  blueId: FighterId;
  divisionId: DivisionId;
  isTitleFight: boolean;
  /** Unitless. `drawWeight()` from heat.ts — how much of the demand this bout carries. */
  draw: number;
}

/**
 * Order a set of bouts into a card.
 *
 * Draw weight decides the running order, with one hard rule laid over it: **a title fight
 * always headlines.** A promotion that puts its own championship on the prelims is not a
 * promotion anybody believes in, and the exception is worth more than the tidiness of a pure
 * sort.
 */
export function buildCard(bouts: readonly BoutSeed[]): CardBout[] {
  const sorted = [...bouts].sort((a, b) => {
    if (a.isTitleFight !== b.isTitleFight) return a.isTitleFight ? -1 : 1;
    return b.draw - a.draw;
  });

  return sorted.slice(0, CARD_SIZE).map((bout, order) => ({
    boutId: bout.boutId,
    redId: bout.redId,
    blueId: bout.blueId,
    divisionId: bout.divisionId,
    order,
    position: positionFor(order, bout.isTitleFight),
    // Five rounds for a main event or any title fight; three for everything else.
    rounds: order === 0 || bout.isTitleFight ? 5 : 3,
    isTitleFight: bout.isTitleFight,
  }));
}

/**
 * Which bouts a player sees in detail, and in what order the night arrives.
 *
 * The ruling both critics reached from opposite directions. Bouts before the player's resolve
 * first and are readable on arrival; the player's own is the detailed one wherever it sits;
 * the rest resolve once theirs is done. That is the difference between *the game showed me
 * eight fights* and *I chose to watch two of them*.
 */
export function resolutionOrder(card: readonly CardBout[], playerBoutId?: string): CardBout[] {
  if (!playerBoutId) {
    // No player on this card: it is a results feed, and a results feed reads top down.
    return [...card];
  }
  const index = card.findIndex((b) => b.boutId === playerBoutId);
  if (index < 0) return [...card];

  const before = card.slice(index + 1).reverse(); // Lower on the card runs earlier in the night.
  const after = card.slice(0, index).reverse();
  return [...before, card[index]!, ...after];
}

// --- The bonus pool ----------------------------------------------------------------------------

export interface BonusAwards {
  /** Both fighters in the most exciting bout of the night. */
  fightOfTheNight?: string;
  /** Up to two individuals, for the best finishes. */
  performanceOfTheNight: readonly FighterId[];
  /** Thousands, per recipient. */
  perAward: number;
}

/**
 * How exciting a fight was, from what actually happened in it.
 *
 * Deliberately rewards a *close, damaging, contested* fight rather than a one-sided finish —
 * which is what Fight of the Night means and why it is the mechanism that makes an exciting
 * loss worth something. A fighter who is losing has a reason to keep swinging.
 */
export function excitement(result: FightResult): number {
  const strikes =
    result.stats.red.significantStrikesLanded + result.stats.blue.significantStrikesLanded;
  const knockdowns = result.stats.red.knockdowns + result.stats.blue.knockdowns;
  const subs = result.stats.red.submissionAttempts + result.stats.blue.submissionAttempts;

  // A blowout is not a Fight of the Night however many strikes land in it.
  const oneSided =
    Math.abs(
      result.stats.red.significantStrikesLanded - result.stats.blue.significantStrikesLanded,
    ) / Math.max(1, strikes);
  const contested = 1 - clamp01(oneSided);

  const distance = result.round >= 3 ? 1.15 : 1;

  return (strikes * 0.6 + knockdowns * 22 + subs * 12) * (0.45 + contested * 0.9) * distance;
}

/** How good a finish was, for Performance of the Night. */
export function performanceScore(result: FightResult): number {
  if (result.method === 'ko') return 100 - result.timeSeconds / 10 + (result.round === 1 ? 25 : 0);
  if (result.method === 'tko') return 80 - result.timeSeconds / 12 + (result.round === 1 ? 20 : 0);
  if (result.method === 'submission') return 90 - result.timeSeconds / 12;
  // A decision is never a Performance of the Night, however wide.
  return 0;
}

/**
 * Award the pool, from what happened rather than from a die roll.
 *
 * Splits the pool four ways — two for Fight of the Night, two for Performance — which is the
 * convention and keeps a single award meaningful against a purse. At Apex's default pool a
 * Performance bonus is a full twelve-week camp at the best gym in the sport, which is what
 * makes it the "one more fight" hook rather than the contract.
 */
export function awardBonuses(
  results: readonly { boutId: string; result: FightResult }[],
  pool: number,
): BonusAwards {
  if (results.length === 0 || pool <= 0) {
    return { performanceOfTheNight: [], perAward: 0 };
  }

  const perAward = Math.round((pool / 4) * 10) / 10;

  const fotn = [...results].sort((a, b) => excitement(b.result) - excitement(a.result))[0];

  const finishes = results
    .map(({ result }) => ({ result, score: performanceScore(result) }))
    .filter((r) => r.score > 0 && r.result.winnerId !== undefined)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return {
    fightOfTheNight: fotn?.boutId,
    performanceOfTheNight: finishes.map((f) => f.result.winnerId!),
    perAward,
  };
}

// --- Money -------------------------------------------------------------------------------------

export interface EventRevenue {
  gate: number;
  broadcast: number;
  /** Purses, bonuses, production and marketing. */
  costs: number;
  profit: number;
  attendance: number;
}

/** Ticket price a promotion can command, in whole currency units rather than thousands. */
export function ticketPrice(promotion: Promotion, headlineDraw: number): number {
  return Math.round(18 + promotion.prestige * 0.9 + clamp(headlineDraw, 0, 400) * 0.35);
}

/**
 * What the night made.
 *
 * This — not `drawWeight()` — is the promotion's revenue. The two were previously in
 * different units of the same currency, which meant the model lost money on its marquee
 * fights and profited on its prelims. Draw weight is now a unitless share of demand and
 * feeds *into* this rather than standing in for it.
 */
export function eventRevenue(input: {
  promotion: Promotion;
  venue: Venue;
  broadcast: Broadcast;
  /** Summed draw weight across the card. */
  totalDraw: number;
  /** Thousands. */
  purses: number;
  bonuses: number;
}): EventRevenue {
  const { promotion, venue, broadcast, totalDraw, purses, bonuses } = input;

  const demand = Math.round(totalDraw * 12 * (0.5 + promotion.buzz / 100));
  const attendance = Math.min(venue.capacity, demand);
  const gate = Math.round((attendance * ticketPrice(promotion, totalDraw)) / 1000);

  const broadcastRevenue =
    broadcast === 'ppv'
      ? Math.round(totalDraw * 1.8 * (promotion.prestige / 100) ** 2)
      : broadcast === 'televised'
        ? Math.round(promotion.prestige * 4)
        : Math.round(promotion.prestige * 0.8);

  // Production scales with the venue and the broadcast; marketing with ambition.
  const production = Math.round(venue.capacity / 120 + (broadcast === 'ppv' ? 260 : 60));
  const costs = Math.round(purses + bonuses + production);

  return {
    gate,
    broadcast: broadcastRevenue,
    costs,
    profit: gate + broadcastRevenue - costs,
    attendance,
  };
}

/** Revenue points pay out on the *event*, which is why a promotion needs a platform. */
export function revenueShareFor(points: number, revenue: EventRevenue): number {
  if (points <= 0) return 0;
  return Math.round(((revenue.gate + revenue.broadcast) * (points / 100)) * 10) / 10;
}

// --- Naming ------------------------------------------------------------------------------------

/**
 * What the night is called.
 *
 * Numbered for a pay-per-view, named after the main event otherwise — which is exactly how
 * the sport does it, and which tells a player at a glance how big the night is.
 */
export function eventName(input: {
  promotion: Promotion;
  broadcast: Broadcast;
  number: number;
  mainEventNames?: readonly [string, string];
}): string {
  const { promotion, broadcast, number, mainEventNames } = input;
  if (broadcast === 'ppv') return `${promotion.shortName} ${number}`;
  return mainEventNames
    ? `${promotion.shortName} Fight Night: ${mainEventNames[0]} vs ${mainEventNames[1]}`
    : `${promotion.shortName} Fight Night ${number}`;
}

/** Which broadcast model a promotion can run, given what is on the card. */
export function broadcastFor(promotion: Promotion, headlineDraw: number, rng: Rng): Broadcast {
  if (!promotion.revenueShareCapable) return 'streamed';
  if (promotion.tier === 'global' && headlineDraw > 120) return 'ppv';
  if (promotion.tier === 'global' || promotion.tier === 'major') {
    return rng.chance(0.25) ? 'ppv' : 'televised';
  }
  return 'streamed';
}
