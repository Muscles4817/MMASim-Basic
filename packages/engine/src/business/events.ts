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
import type { ReducedFightResult } from '../fight/types.js';
import type { Promotion, PromotionTier } from '../domain/organisations.js';
import { isKoMethod } from '../domain/fighter.js';
import type { CardPosition } from './money.js';
import { homeMarket, marketOf, type Market } from './markets.js';

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
  /**
   * How many were actually in the building.
   *
   * `eventRevenue` has computed this on every card ever run and it reached the gate receipt and
   * nothing else — so the game knew whether a fighter walked out in front of four hundred people
   * or a sold-out arena, and had no way to say so. Optional because a night settled before this
   * existed has none.
   */
  attendance?: number;
  /**
   * Fight and Performance of the Night, as given out.
   *
   * On the night itself rather than only in the purses they paid, so a card read back later can
   * say who earned them. `pending` while a promoter has not yet confirmed the matchmaker's
   * suggestion — the pool is held until they do, or until the clock next moves.
   */
  awards?: BonusAwards & { pending?: boolean };
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
  /**
   * Rounds already agreed for this bout, when something upstream has agreed them.
   *
   * The player's fight is booked, camped for and *fought* before a card is assembled around
   * it, so by the time `buildCard` runs the number of rounds is a matter of record rather than
   * a matter of policy. Without this the card applied the policy anyway and overwrote the
   * fact — it gave whatever topped the night five rounds, and the player's three-round bout
   * was listed as a five-rounder on the very screen that had just shown three rounds of it.
   */
  rounds?: 3 | 5;
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
    // Five rounds for a main event or any title fight; three for everything else — unless the
    // bout arrived with its rounds already settled, in which case that is not this function's
    // decision to make.
    rounds: bout.rounds ?? (order === 0 || bout.isTitleFight ? 5 : 3),
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
export function excitement(result: ReducedFightResult): number {
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
export function performanceScore(result: ReducedFightResult): number {
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
/**
 * What a promotion puts up in bonuses for one card.
 *
 * Was inlined identically in two places — the world's card runner and the player's night —
 * at `budget * 0.0012` with a floor of 4, which put the top promotion's individual award at
 * £12.5k. Real bonuses are $50k against a $12k prelim show purse, so the award was roughly a
 * quarter of what it should be and the design claim it exists to support did not hold: *a
 * prelim fighter can double their night's pay by having the right kind of fight.* At £12.5k
 * against a £12k show purse it was a rounding adjustment, not the mechanism by which the
 * bottom of a roster survives.
 *
 * It then became 0.48% of the budget, which tied a night's bonuses to the bank balance; it now
 * follows prestige (see the constants below), with the leader's award around £35k — several
 * times a debutant's show money — and a floor of half a minimum purse an award, which is what
 * keeps a bonus worth chasing at the bottom of the sport.
 *
 * The other half of why this matters is that it makes an *exciting loss* worth something. In
 * a game that otherwise pays only the raised hand, that is what stops the correct strategy
 * being to fight safe and win boring — which is also the trade `riskLevel` now offers, and
 * the two only work together.
 */
export function bonusPoolFor(promotion: Promotion): number {
  return Math.max(
    Math.round(promotion.minimumPurse * 2),
    Math.round(BONUS_POOL_SCALE * promotion.prestige ** BONUS_POOL_EXPONENT),
  );
}

/*
 * The pool follows the promotion's standing, not its bank balance: it was 0.48% of the budget,
 * so a promotion that had a good year paid bigger bonuses on the same card, and the same
 * promotion paid less as it went broke. Sized so the leader's award is still about £35k and a
 * regional's a few thousand, with the floor at half a minimum purse an award so a bonus is still
 * worth chasing at the bottom.
 */
const BONUS_POOL_SCALE = 0.00001;
const BONUS_POOL_EXPONENT = 3.6;

export function awardBonuses(
  results: readonly { boutId: string; result: ReducedFightResult }[],
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
  return Math.round(
    TICKET_BASE +
      promotion.prestige ** 2 * TICKET_PER_PRESTIGE_SQUARED +
      clamp(headlineDraw, 0, 400) * TICKET_PER_DRAW,
  );
}

/*
 * The ticket, in pounds. A regional card headlined by a decent fight sells at about £50 and the
 * leader's marquee nights at well over £100.
 *
 * Was 18 + 0.9 per prestige point + 0.35 per point of draw, which priced a regional show at nearly
 * £100 a seat. Against a crowd that the old flat buzz of 88 inflated as well, one three-fight
 * regional card in front of 4,461 people cleared £481k — a year's overheads in a night.
 *
 * Then 18 + 0.3 per point of draw, until matchmaking that sells fights (doc 34 A4) put more draw
 * on every card and a promotion's bank came down to a couple of years of costs: an autopilot
 * paying every counter grew a regional by a fifth in a year, and one running sensible cards by
 * three-quarters.
 */
const TICKET_BASE = 18;
/*
 * Convex in prestige: the gap between a town show and a regional is a few pounds, the gap between
 * a regional and the leader is the difference between a night out and an event. Linear, a price
 * low enough at the bottom was too low at the top, where a sold-out arena is the business.
 */
const TICKET_PER_PRESTIGE_SQUARED = 0.006;
const TICKET_PER_DRAW = 0.3;
/** How much of a market's cost premium its ticket prices carry: Las Vegas sells at about 1.26×. */
const TICKET_MARKET_SHARE = 0.25;

/**
 * How much of a card's demand comes from its depth rather than its headline.
 *
 * Saturating, and that shape is the whole point. `eventRevenue` used to key demand off the
 * *sum* of draw weight across the card, which had a consequence nobody intended: since
 * `marketValue()` is a 2.6-power law in star power while `drawWeight()` is linear in it,
 * costs were superlinear and demand was linear, so a card of nine anonymous mid-carders
 * out-earned one built around a marquee main event. Measured on the shipped seed: 3,573
 * profit against 2,878. The correct strategy was to never sign anybody famous.
 *
 * Depth should prevent a discount, not create a gate. Nobody buys a ticket because the card
 * is nine fights long rather than six; they refuse to buy one because it is three. So this
 * runs from a real penalty at two bouts up to 1.0, and is flat past a full card — the fifth
 * bout matters and the ninth does not.
 *
 * The penalty at the thin end was 0.72 for two bouts, which with nine purses' worth of costs
 * gone meant a card with two of its nine fights signed made more money than the full one. Under half
 * the crowd for a two-fight card is what that card is worth.
 */
export function depthMultiplier(bouts: number): number {
  if (bouts <= 0) return 0;
  // Saturating by design: ~0.47 at two bouts, ~0.85 at five, ~0.97 from nine.
  return clamp(0.2 + 0.8 * (1 - Math.exp(-(bouts - 1) / 2.4)), 0.2, 1);
}

/**
 * How much more demand a marketing spend buys, as a fraction: 0.2 is a fifth more people.
 *
 * The hook fight-week marketing spends into (doc 34, A5). Diminishing: the first money reaches
 * the people who would come if they knew, and every pound after it is spent persuading people
 * who would rather not. Scaled to the promotion, because the same £10k is a campaign for a town
 * show and a rounding error for the leader.
 */
export function marketingUplift(promotion: Promotion, spend: number): number {
  if (spend <= 0) return 0;
  const reach = MARKETING_REACH_BASE + promotion.prestige * MARKETING_REACH_PER_PRESTIGE;
  return MAX_MARKETING_UPLIFT * (1 - Math.exp(-spend / reach));
}

/** The most marketing can add to a card's demand, however much is spent. */
export const MAX_MARKETING_UPLIFT = 0.35;
/** Thousands it takes to reach about 63% of that, for a promotion of no standing. */
const MARKETING_REACH_BASE = 5;
const MARKETING_REACH_PER_PRESTIGE = 0.6;

/** What staging a night costs before anybody is paid to fight on it, in thousands. */
export function showCost(promotion: Promotion, market: Market): number {
  return Math.round(promotion.prestige * SHOW_COST_PER_PRESTIGE * Math.sqrt(market.costFactor));
}

/** About £23k a night for a regional show in a small market, £44k for the leader at home. */
const SHOW_COST_PER_PRESTIGE = 0.45;

/** Production, per this many seats in the building: lighting, staging, the crew to run them. */
const SEATS_PER_PRODUCTION_UNIT = 150;

/**
 * Production a broadcast needs before a seat is counted, in thousands. A pay-per-view is a
 * television event; a stream is a few cameras and a commentary desk.
 */
const PRODUCTION_BASE: Readonly<Record<Broadcast, number>> = {
  ppv: 300,
  televised: 90,
  streamed: 10,
};

/**
 * Hiring the room, per seat, in thousands, before the market's cost factor.
 *
 * The venue was free. Production scaled with capacity but nobody paid for the building, so the
 * only fixed cost of putting on a card was the cameras — which is how an empty card forecast a
 * profit of £53k.
 */
export const VENUE_HIRE_PER_SEAT = 0.006;

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
  /**
   * Draw weight of the *headline* bout — the fight that sells the night.
   *
   * Was `totalDraw`, the sum across the card, and that single choice inverted the economics.
   * See `depthMultiplier` for the measurement and the reasoning.
   */
  headlineDraw: number;
  /** How many bouts are on the card. Prevents a discount; does not create a gate. */
  bouts: number;
  /** Thousands. */
  purses: number;
  bonuses: number;
  /** Thousands spent selling the card. Costs what it costs; buys `marketingUplift` in demand. */
  marketing?: number;
}): EventRevenue {
  const { promotion, venue, broadcast, headlineDraw, bouts, purses, bonuses } = input;
  const marketing = Math.max(0, input.marketing ?? 0);
  // What the city charges, read off the room the card is in.
  const market = marketOf(venue.city, venue.country);

  /*
   * Demand is what the main event sells, discounted if the card beneath it is thin.
   *
   * The multiplier is larger than the old `× 12` because it now multiplies one bout's draw
   * rather than nine, and it is tuned so a full card headlined by a genuine star fills a big
   * building while the same card with a nobody on top does not.
   */
  const demand = Math.round(
    expectedDemand(promotion, headlineDraw, bouts) * (1 + marketingUplift(promotion, marketing)),
  );
  const attendance = Math.min(venue.capacity, demand);
  // `ticketPrice` is declared to take the *headline* draw and was being handed the card total,
  // which sails past its internal clamp of 400 for every real card — so the price a promotion
  // charged was a constant regardless of who was on top of the bill.
  // A big city's prices are its tickets' prices too — a little of the premium, not all of it.
  const gate = Math.round(
    (attendance * ticketPrice(promotion, headlineDraw) * market.costFactor ** TICKET_MARKET_SHARE) /
      1000,
  );

  /*
   * Broadcast, and it has to be the dominant line at the top of the sport.
   *
   * It was not. Measured on the shipped roster, a global promotion's marquee card took 2,482 at
   * the gate and 1,499 from pay-per-view — 30% of revenue from broadcast, against a real sport
   * where media rights and PPV are 70–85% for the market leader and the live gate is 10–15%.
   * The model was inverted at the top, and the consequence was concrete: **that card lost 315k**,
   * so the biggest promotion in the game lost money every time it ran its best show.
   *
   * It also has to be true before a rights deal can be a failure state at all. Losing a
   * television deal has to hurt, and taking away 21% of revenue is a bad quarter rather than an
   * existential threat.
   */
  /*
   * Discounted for a thin card like the gate is, and nothing at all for an empty one: a
   * broadcaster pays for a night of fights, and a stream of an empty cage is not one. A flat fee
   * whatever was on the card was the other half of an empty card forecasting a profit.
   */
  const depth = depthMultiplier(bouts);
  const broadcastRevenue = Math.round(
    depth *
      (broadcast === 'ppv'
        ? headlineDraw * PPV_PER_DRAW * (promotion.prestige / 100) ** 2
        : broadcast === 'televised'
          ? promotion.prestige * TV_FEE_PER_PRESTIGE
          : promotion.prestige * STREAM_FEE_PER_PRESTIGE),
  );

  /*
   * Production scales with the venue *and* with what is being made.
   *
   * The flat floor was 60 regardless of broadcast, which for a regional promotion streaming out
   * of a 3,000-seat hall was more than half its total costs and made every card it ran a small
   * loss. A stream is not a pay-per-view broadcast with fewer cameras; it is a fundamentally
   * cheaper product, and the cost base has to say so or the bottom of the sport cannot exist.
   */
  // A crew costs more in a big city, but it travels: production takes the square root of the
  // market's premium, where the building itself (below) takes all of it.
  const production = Math.round(
    (venue.capacity / SEATS_PER_PRODUCTION_UNIT + PRODUCTION_BASE[broadcast]) *
      Math.sqrt(market.costFactor),
  );
  // The building itself, at the city's prices.
  const venueHire = Math.round(venue.capacity * VENUE_HIRE_PER_SEAT * market.costFactor);
  /*
   * And the night: officials, the commission, medicals, insurance, the people who run it. Paid
   * for any card, full or empty, which is what makes a card with two fights on it a loss rather
   * than a cheap way to bank a gate.
   */
  const staging = showCost(promotion, market);
  /*
   * Sponsorship, which the model simply did not have.
   *
   * A promotion's income was gate plus broadcast and nothing else, and for anybody not selling
   * pay-per-view that is most of a business missing. Real regional promotions run on local
   * sponsors, venue and casino deals, and betting partnerships — banners, mat logos and cage
   * wraps are the visible half of it — and those scale with the size of the room and the
   * standing of the promotion rather than with how the card is broadcast.
   *
   * Measured before this, across three independent seeds, **every promotion below the top three
   * collapsed within a decade**: RIZIN from 5,400 to between 538 and 3,467, Cage Warriors from
   * 1,400 to between 151 and 281, and LFA from 1,200 to between 137 and 434. The bottom of the
   * sport could not survive, which makes a career that starts there unplayable and contradicts
   * the whole premise of the regional tier feeding the majors.
   *
   * It was hidden because the one solvency test in the suite ran a single seed and happened to
   * land on the draw where Cage Warriors finished a few thousand above zero — so an unrelated
   * change to *name generation* was enough to reshuffle the world and expose it.
   *
   * Scaled on attendance rather than gate, so it does not simply amplify the ticket price, and
   * only weakly on prestige. The weighting matters as much as the size: a first version leaned
   * hard on prestige and, because attendance already scales with the promotion, effectively
   * scaled twice — which fixed the bottom of the sport and then handed the top an even larger
   * share. Measured across eight years of the 2020 world, the gap between the biggest promotion
   * and the smallest went from 47x to 495x, with the smallest falling to a third of what it
   * started with. A cage wrap sells for broadly similar money whoever is putting the show on;
   * what differs is how many people are in the building.
   */
  const sponsorship = Math.round(
    (attendance / 1000) * (SPONSOR_PER_THOUSAND + promotion.prestige * SPONSOR_PER_PRESTIGE),
  );

  const costs = Math.round(purses + bonuses + production + venueHire + staging + marketing);

  return {
    gate,
    broadcast: broadcastRevenue + sponsorship,
    costs,
    profit: gate + broadcastRevenue + sponsorship - costs,
    attendance,
  };
}

/*
 * Sponsorship per thousand people in the building, in thousands: a base, and a little more for a
 * promotion people have heard of. The base was 18 when a regional show drew twice the crowd it
 * does now that buzz starts where the tier is, and 16 while offers were answered on the spot; once
 * corners took days to reply and a card waited for them, more of every card got signed.
 */
const SPONSOR_PER_THOUSAND = 11;
const SPONSOR_PER_PRESTIGE = 0.12;

/*
 * Pay-per-view per point of headline draw, and a television fee per prestige point. Were 20 and
 * 12: with the leader's tickets and crowd as they were, a generated world's leader banked well
 * over a million a card and grew half again in a year.
 */
const PPV_PER_DRAW = 15;
const TV_FEE_PER_PRESTIGE = 10;

/** A stream's rights fee per prestige point, in thousands. Was 2, on a card that did not have to exist. */
const STREAM_FEE_PER_PRESTIGE = 2;

/** Revenue points pay out on the *event*, which is why a promotion needs a platform. */
export function revenueShareFor(points: number, revenue: EventRevenue): number {
  if (points <= 0) return 0;
  return Math.round((revenue.gate + revenue.broadcast) * (points / 100) * 10) / 10;
}

// --- Naming ------------------------------------------------------------------------------------

/**
 * What the night is called.
 *
 * The promotion's short name and the card's number, and the main event once there is one —
 * `LFA 190`, then `LFA 190: Reyes vs Blachowicz` — which is how every promotion below the leader
 * numbers its shows, and how the leader names its biggest. A card the promoter has titled
 * themselves keeps that title in place of the number.
 *
 * It used to say "Fight Night" for everything that was not pay-per-view, which at a regional
 * show is the leader's house style borrowed by a promotion that streams to a few thousand.
 */
export function eventName(input: {
  promotion: Promotion;
  number: number;
  title?: string;
  mainEventNames?: readonly [string, string];
}): string {
  const { promotion, number, title, mainEventNames } = input;
  const base = title ?? `${promotion.shortName} ${number}`;
  return mainEventNames ? `${base}: ${mainEventNames[0]} vs ${mainEventNames[1]}` : base;
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

// --- What a night does to the promotion that ran it ------------------------------------------

/**
 * The consequence of a card.
 *
 * `eventRevenue()` existed and was correct, and both callers threw the answer away — the
 * world's card runner did not even compute it (`void totalDraw`), and the player's night
 * discarded it (`void revenue`). So promotions never earned, never lost, and their `buzz`
 * never moved, despite the field being documented as "moves with cards delivered and stars
 * built".
 *
 * That absence quietly removed the loop doc 12 is built around: *a promotion that runs bad
 * cards sees demand fall for the next one*. Without it, matchmaking has no consequence, a
 * promotion cannot be run into the ground or built up, and the budget that sets every purse
 * on the roster is a constant. It is also the entire economic substrate promoter mode needs,
 * so it is worth having right before that lands rather than after.
 *
 * Two things move:
 *
 * **Budget** takes the profit directly. A promotion that loses money on a card has less to
 * pay with on the next one, which is the mechanism by which overspending on a marquee fight
 * is a real decision rather than a free one.
 *
 * **Buzz** moves on how the night *delivered*, not on what it earned. This is deliberate and
 * it is the more interesting half: a card that made money with three dull decisions should
 * lose attention, and a card that lost money on a spectacular one should gain it. That gap
 * between "profitable" and "good" is where promoter mode's central tension lives.
 */
export interface NightSettlement {
  revenue: EventRevenue;
  /** The promotion after the night. Callers persist it. */
  promotion: Promotion;
  budgetDelta: number;
  buzzDelta: number;
  /** What this card scored, so the caller can feed it back as future history. */
  delivered: number;
}

/**
 * Average excitement at which a card is judged to have met expectations.
 *
 * Below this the audience drifts, above it they come back. Calibrated against `excitement()`,
 * where a competitive three-round decision scores roughly here and a one-sided early finish
 * scores well under.
 */
export const EXPECTED_CARD_EXCITEMENT = 55;

/**
 * Delivery score a card is judged against when a promotion has no history yet.
 *
 * Roughly what a competitive three-round decision scores, so a promotion's first card is
 * measured against "a decent night" rather than against a war.
 */
export const PAR_CARD_DELIVERY = 62;

/** How many past cards the relative baseline averages over. */
export const DELIVERY_MEMORY = 6;

/**
 * How well one fight served the *promotion*, as opposed to how good a fight it was.
 *
 * These are two different questions and `settleNight` used one function for both. Measured
 * against `excitement()`'s own par of 55: a first-round knockout scored 27 and a first-round
 * submission 16, while a dull 44–30 decision scored 60. **So finishes lowered a promotion's
 * buzz and forgettable decisions raised it** — the single number a promoter-mode player would
 * spend forty hours optimising against, pointing backwards.
 *
 * `excitement()` is not wrong; it is the right metric for Fight of the Night, where a
 * three-round war genuinely is the answer. It is the wrong metric for "did this card deliver",
 * because an audience that watched four highlight-reel knockouts did not have a bad night.
 *
 * This scores the two things an audience actually goes home talking about — **something
 * ended, or it was close** — and refuses to reward the thing that flatters a volume metric
 * without entertaining anybody: a wide, one-sided decision.
 */
export function deliveryScore(result: ReducedFightResult): number {
  const red = result.stats.red;
  const blue = result.stats.blue;
  const strikes = red.significantStrikesLanded + blue.significantStrikesLanded;

  // How close it was, on the scorecard rather than on volume alone.
  const oneSided =
    Math.abs(red.significantStrikesLanded - blue.significantStrikesLanded) / Math.max(1, strikes);
  const contested = 1 - clamp01(oneSided);

  const finished = !result.method.startsWith('decision');
  const knockdowns = red.knockdowns + blue.knockdowns;
  const subAttempts = red.submissionAttempts + blue.submissionAttempts;

  /*
   * A finish is worth a lot and worth slightly *more* when it comes late, because a fight that
   * built to it entertained for longer than one that ended before the crowd sat down. That is
   * the opposite of `performanceScore`, which rewards speed — correctly, because it is
   * answering "how good was that finish" rather than "did the audience get a night out".
   */
  const finishValue = finished ? 55 + Math.min(25, result.round * 8) : 0;

  // Near-finishes count even when they do not land. A round somebody nearly ended is the
  // reason people come back.
  const jeopardy = Math.min(30, knockdowns * 11 + subAttempts * 6);

  /*
   * A competitive decision is a good night; a wide one is the thing this metric exists to stop
   * rewarding, so the contested term is squared rather than applied linearly.
   *
   * The coefficient sits above `PAR_CARD_DELIVERY` on purpose. At 62 a decision could at best
   * exactly meet par, which meant a card of genuine three-round wars was scored as merely
   * adequate and could never move a promotion forward — the same failure as the metric this
   * replaces, one notch less severe. A fight people argue about afterwards is a good night
   * even though nobody got finished.
   */
  const contestValue = finished ? contested * 15 : contested * contested * 90;

  return finishValue + jeopardy + contestValue;
}

/**
 * How far buzz can move on a single night, in points, all causes together. Attention is sticky.
 *
 * Was 3, and buzz moved on one thing — whether the card beat the promotion's own recent form —
 * so every promotion in a generated world sat between 88 and 91 for ever. Title fights, finishes
 * and upsets are the nights people talk about, and they move it now as well.
 */
export const MAX_BUZZ_SWING = 6;

/** The most the delivery comparison alone can move buzz. */
const DELIVERY_BUZZ_SWING = 3;

/** A title fight on the card, and each one after the first. */
const TITLE_FIGHT_BUZZ = 0.8;
const EXTRA_TITLE_FIGHT_BUZZ = 0.3;
/** Each knockout or submission, up to a cap: a card of finishes is a highlight reel. */
const FINISH_BUZZ = 0.2;
const MAX_FINISH_BUZZ = 1;
/** Each upset, up to a cap. Nothing gets a promotion talked about like the favourite losing. */
const UPSET_BUZZ = 0.5;
const MAX_UPSET_BUZZ = 1.5;

/**
 * Where a tier's attention settles: the level a promotion of this size holds by running cards
 * that are about what it usually runs.
 */
export const BUZZ_BASELINE: Readonly<Record<PromotionTier, number>> = {
  global: 68,
  major: 48,
  regional: 32,
  developmental: 16,
};

/**
 * How far each card pulls buzz back towards its tier's baseline.
 *
 * Without it the spectacle terms ratchet: they only ever add, so a promotion running title fights
 * and finishes climbs to 100 and stays there — the failure the relative delivery baseline was
 * written to remove. A breakout night still lifts a promotion for months; it just does not lift
 * it for ever.
 */
const BUZZ_REVERSION = 0.15;

/**
 * Attention lost per fortnight without a card. A promotion nobody has seen in two months is a
 * promotion people have started to forget.
 */
export const IDLE_BUZZ_DECAY = 1;

/** How long a promotion can go between cards before it starts to be forgotten. */
export const IDLE_GRACE_DAYS = 42;

/** The floor attention decays to. Somebody always remembers. */
export const MIN_BUZZ = 5;

/**
 * Buzz after a span with no card, or the same buzz if a card has been run recently enough.
 * Pure, so the world tick and a forecast can both ask it.
 */
export function idleBuzz(buzz: number, daysSinceLastCard: number, days: number): number {
  const idle = Math.min(days, daysSinceLastCard - IDLE_GRACE_DAYS);
  if (idle <= 0 || buzz <= MIN_BUZZ) return buzz;
  return Math.max(MIN_BUZZ, Math.round((buzz - (idle / 14) * IDLE_BUZZ_DECAY) * 10) / 10);
}

export function settleNight(input: {
  promotion: Promotion;
  revenue: EventRevenue;
  /** Every result on the card, in any order. */
  results: readonly ReducedFightResult[];
  /**
   * Delivery scores of this promotion's recent cards, for the relative baseline.
   *
   * Empty for a promotion with no history, which is then judged against par.
   */
  recentDelivery?: readonly number[];
  /** Title bouts on the card. */
  titleFights?: number;
  /** Bouts the favourite lost (`upsetsIn`). */
  upsets?: number;
}): NightSettlement {
  const { promotion, revenue, results, recentDelivery = [], titleFights = 0, upsets = 0 } = input;

  const delivered =
    results.length === 0
      ? PAR_CARD_DELIVERY
      : results.reduce((a, r) => a + deliveryScore(r), 0) / results.length;

  /*
   * Judged against its own recent form, not against a fixed constant.
   *
   * With a global par, every promotion's buzz ratcheted monotonically to 100 and stayed there
   * — measured across eight simulated years, the top three all pinned at maximum by year
   * eight, at which point the sole feedback signal in the whole model stopped discriminating
   * between them. A promotion that has been putting on great cards for two years is *expected*
   * to put on another one, and gets no credit for meeting its own standard.
   *
   * Relative expectation makes "you are only as good as your last card" literally true, gives
   * a breakout night at the bottom of the sport somewhere to go, and removes the ratchet.
   * A promotion with no history is judged against par, which is the only fair thing to do.
   */
  const baseline =
    recentDelivery.length > 0
      ? recentDelivery.reduce((a, n) => a + n, 0) / recentDelivery.length
      : PAR_CARD_DELIVERY;

  /*
   * Scaled by prestige, so buzz is harder to move at the top. A global promotion is judged
   * against what it has already shown people; a regional one gains attention from a good
   * night more easily than a major one does, which is how the bottom of the sport actually
   * grows and why a breakout card matters more to a small promotion.
   */
  const missRatio = (delivered - baseline) / Math.max(1, baseline);
  const stickiness = 0.6 + (promotion.prestige / 100) * 0.8;
  const delivery = clamp(missRatio / stickiness, -1, 1) * DELIVERY_BUZZ_SWING;

  // What gets talked about whatever the promotion usually does — damped by size like delivery is.
  const finishes = results.filter((r) => isKoMethod(r.method) || r.method === 'submission').length;
  const spectacle =
    ((titleFights > 0 ? TITLE_FIGHT_BUZZ + (titleFights - 1) * EXTRA_TITLE_FIGHT_BUZZ : 0) +
      Math.min(MAX_FINISH_BUZZ, finishes * FINISH_BUZZ) +
      Math.min(MAX_UPSET_BUZZ, upsets * UPSET_BUZZ)) /
    stickiness;

  const reversion = (BUZZ_BASELINE[promotion.tier] - promotion.buzz) * BUZZ_REVERSION;
  const buzzDelta =
    Math.round(clamp(delivery + spectacle + reversion, -MAX_BUZZ_SWING, MAX_BUZZ_SWING) * 10) / 10;

  return {
    revenue,
    budgetDelta: revenue.profit,
    buzzDelta,
    delivered: Math.round(delivered * 10) / 10,
    promotion: {
      ...promotion,
      // Floored at zero rather than allowed negative: an insolvent promotion is a different
      // feature (it folds, and its roster hits free agency), and inventing it silently here
      // as a negative number would produce nonsense purses across the whole roster.
      budget: Math.max(0, Math.round(promotion.budget + revenue.profit)),
      buzz: clamp(Math.round((promotion.buzz + buzzDelta) * 10) / 10, 1, 100),
    },
  };
}

/**
 * The fighter the money was on, if anybody's was: paper odds of two to one or better.
 *
 * Read before the bouts are fought, because the fight changes the ratings it is judged on.
 */
export function favouriteOf(
  red: { id: FighterId },
  blue: { id: FighterId },
  redOdds: number,
): FighterId | undefined {
  if (redOdds >= UPSET_ODDS) return red.id;
  if (redOdds <= 1 - UPSET_ODDS) return blue.id;
  return undefined;
}

const UPSET_ODDS = 2 / 3;

/** How many of these results went against the favourite. */
export function upsetsIn(
  favourites: ReadonlyMap<string, FighterId>,
  results: readonly { boutId: string; result: { winnerId?: FighterId } }[],
): number {
  return results.filter(({ boutId, result }) => {
    const favourite = favourites.get(boutId);
    return (
      favourite !== undefined && result.winnerId !== undefined && result.winnerId !== favourite
    );
  }).length;
}

// --- Venues ------------------------------------------------------------------------------------

/**
 * The buildings the sport runs in, smallest first.
 *
 * Lived as a duplicated const in both card runners, and both picked from it uniformly at
 * random — so the smallest promotion in the game booked an 18,000-seat arena as often as the
 * global one. Since production cost scales with capacity, a regional promotion was paying
 * arena overheads to put four hundred people in the building, and it is the largest single
 * reason the bottom two promotions went insolvent inside eight simulated years.
 */
export const VENUES: readonly Omit<Venue, 'city' | 'country'>[] = [
  { name: 'Social Club', capacity: 1500 },
  { name: 'The Warehouse', capacity: 3000 },
  { name: 'Exhibition Hall', capacity: 4500 },
  { name: 'Civic Centre', capacity: 6000 },
  { name: 'Convention Hall', capacity: 12000 },
  { name: 'Metro Arena', capacity: 15000 },
  { name: 'The Arena', capacity: 18000 },
];

/**
 * A building this promotion could plausibly fill, given what it is drawing.
 *
 * Real promoters book to demand. Nobody takes an arena for a card that will sell four
 * thousand seats, because the empty seats cost money *and* look worse on television than a
 * full small room — which is why a regional show in a packed 3,000-seat hall is a better night
 * than the same show rattling around an arena.
 *
 * Picks the smallest venue that comfortably holds the expected crowd, so a promotion grows
 * into bigger buildings as its draw grows rather than being handed one at random.
 */
export function venueFor(
  promotion: Promotion,
  expectedDemand: number,
  rng: Rng,
  /**
   * The city the card is in. Defaults to the promotion's home market.
   *
   * The buildings used to come with their cities attached — five rooms in five countries — so a
   * promotion based in the American Midwest ran its cards in Rotterdam and Tokyo by turns.
   */
  market: Market = homeMarket(promotion),
): Venue {
  // A little headroom, so a good night is not capped by the room rather than by the draw.
  const wanted = expectedDemand * 1.15;

  /*
   * The smallest room that fits, with no randomness among the ones that do.
   *
   * An earlier version picked at random between the two smallest that fit, for variety. That
   * is wrong in a way worth recording: the venue list steps steeply — 3k, 6k, 12k, 15k, 18k —
   * so "the second smallest that fits" is routinely double the crowd, and a promotion drawing
   * four thousand ended up booking a twelve-thousand-seat hall. Variety is not worth a
   * two-thirds-empty building, and the interesting variation belongs in the *draw*, not in a
   * die roll over rooms.
   */
  void rng;
  const room = VENUES.find((v) => v.capacity >= wanted) ?? VENUES[VENUES.length - 1]!;
  return { ...room, city: market.city, country: market.country };
}

/**
 * Roughly how many people this promotion will draw, before a venue is chosen.
 *
 * Deliberately the same shape as the demand term in `eventRevenue` so the venue decision and
 * the gate agree with each other. Duplicating the arithmetic would let them drift, and a
 * promotion booking a building it cannot fill is exactly the failure this exists to prevent.
 */
export function expectedDemand(promotion: Promotion, headlineDraw: number, bouts: number): number {
  return Math.round(headlineDraw * 62 * depthMultiplier(bouts) * (0.5 + promotion.buzz / 100));
}
