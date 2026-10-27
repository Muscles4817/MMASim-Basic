/**
 * The people a promoter answers to: the broadcaster and the owner (doc 34 B2).
 *
 * The engine holds the rules (`business/rightsDeal.ts`, `business/owner.ts`); this decides when
 * they run against the world. A card the player runs is rated for the broadcaster. Each deal year
 * ends in a renewal and each owner's year in a verdict. An owner who has lost confidence fires the
 * promoter, and the career carries on at a smaller promotion that will have them.
 *
 * The failure state for every promotion, the player's or not, is in here too: a promotion whose
 * cash runs out is bought, and the buyer sells its three best fighters to pay the debts.
 *
 * Imports neither the planner nor the world, both of which call into it.
 */

import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import {
  afterCard,
  annualCosts,
  broadcastFee,
  cardRating,
  cardsPerYear,
  CONFIDENCE_FOR_LOST_DEAL,
  dealHealth,
  depthMultiplier,
  describeObjective,
  displayName,
  expectedDemand,
  inboxId,
  leavingPromotion,
  newOwner,
  newsId,
  objectiveMet,
  openingDeal,
  OWNER_TEMPERAMENTS,
  overallRating,
  renew,
  renewalDay,
  REVIEW_CARDS,
  REVIEW_CLEARED,
  STREAMING_SHARE,
  yearEnd,
  type FightNight,
  type Fighter,
  type GameDay,
  type NewsItem,
  type Objective,
  type Owner,
  type OwnerYear,
  type Promotion,
  type PromotionalAgreement,
  type RightsDeal,
} from '@mmasim/engine';
import { raise } from './inbox';
import { money } from '../ui/format';

type StoredPromotion = Promotion & Entity;

const YEAR = 365;

/** Broadcast follows the promotion's platform, which is not yet a player decision. */
export const broadcastFor = (promotion: Promotion): FightNight['broadcast'] =>
  promotion.tier === 'global' ? 'ppv' : promotion.tier === 'major' ? 'televised' : 'streamed';

/** A stable number from a string, for picking names without a random draw. */
function pickFrom(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const promotionOf = (db: GameDb, id: string): Promotion | undefined =>
  db.promotions.findById(id) as Promotion | undefined;

const activeRoster = (db: GameDb, promotionId: string): Fighter[] =>
  (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotionId && f.retiredDay === undefined,
  );

/** The promotion's nights that ran in `[from, to]`. */
function nightsBetween(db: GameDb, promotionId: string, from: number, to: number): FightNight[] {
  return (db.events.findAll() as FightNight[]).filter(
    (n) => n.promotionId === promotionId && n.status === 'complete' && n.day >= from && n.day <= to,
  );
}

/**
 * The crowd the promotion draws: its average over the last year, or what an ordinary card of
 * its would draw when it has run nothing since the save began.
 */
function typicalCrowd(db: GameDb, promotion: Promotion, day: number): number {
  const nights = nightsBetween(db, promotion.id as string, day - YEAR, day);
  if (nights.length > 0) return averageCrowd(nights);
  return Math.round(expectedDemand(promotion, promotion.prestige, 6));
}

const averageCrowd = (nights: readonly FightNight[]): number =>
  nights.length === 0
    ? 0
    : Math.round(nights.reduce((sum, n) => sum + (n.attendance ?? 0), 0) / nights.length);

function minimumCardsFor(db: GameDb, promotion: Promotion): number {
  return promotion.rightsDeal?.minimumCards ?? openingMinimum(db, promotion);
}

const openingMinimum = (db: GameDb, promotion: Promotion): number =>
  Math.max(
    2,
    Math.floor(cardsPerYear(promotion, activeRoster(db, promotion.id as string).length) * 0.75),
  );

/**
 * Give the player's promotion a television deal and an owner if it has none: on taking a job,
 * and lazily for a save from before either existed.
 */
export function openBoardroom(db: GameDb, promotionId: string, day: number): void {
  const promotion = promotionOf(db, promotionId);
  if (!promotion || (promotion.rightsDeal && promotion.owner)) return;
  const seed = `${getWorld(db).seed}:${promotionId}:${day}`;
  const rosterSize = activeRoster(db, promotionId).length;

  const rightsDeal =
    promotion.rightsDeal ??
    openingDeal({
      promotion,
      fee: broadcastFee(promotion, broadcastFor(promotion)),
      cardsPerYear: cardsPerYear(promotion, rosterSize),
      day: day as GameDay,
      pick: pickFrom(`${seed}:deal`),
    });
  const owner =
    promotion.owner ??
    newOwner({
      pick: pickFrom(`${seed}:owner`),
      day: day as GameDay,
      cash: promotion.budget,
      buzz: promotion.buzz,
      minimumCards: rightsDeal.minimumCards,
      averageCrowd: typicalCrowd(db, promotion, day),
    });
  db.promotions.upsert({ ...promotion, rightsDeal, owner } as StoredPromotion);
}

/** Take the deal and the owner off a promotion the player has left; the world runs it now. */
export function closeBoardroom(db: GameDb, promotionId: string): void {
  const promotion = promotionOf(db, promotionId);
  if (!promotion) return;
  const { rightsDeal: _deal, owner: _owner, ...rest } = promotion;
  void _deal;
  void _owner;
  db.promotions.upsert(rest as StoredPromotion);
}

// --- After a card ---------------------------------------------------------------------------------

/**
 * The broadcaster's verdict on a card the player ran. Returns what the feed should say.
 *
 * A deal under review that runs out of cards drops to streaming-only, and losing the television
 * deal is the one thing an owner reacts to on the day rather than at the year's end.
 */
export function rateCard(
  db: GameDb,
  input: { promotionId: string; day: number; headlineDraw: number; bouts: number; titles: number },
): NewsItem[] {
  const promotion = promotionOf(db, input.promotionId);
  const deal = promotion?.rightsDeal;
  if (!promotion || !deal || getWorld(db).playerPromotionId !== input.promotionId) return [];

  const rating = cardRating({
    promotion,
    headlineDraw: input.headlineDraw,
    depth: depthMultiplier(input.bouts),
    titleFights: input.titles,
  });
  const { deal: next, event } = afterCard(deal, rating);
  let owner = promotion.owner;
  if (event === 'dropped' && owner) {
    owner = { ...owner, confidence: Math.max(0, owner.confidence - CONFIDENCE_FOR_LOST_DEAL) };
  }
  db.promotions.upsert({ ...promotion, rightsDeal: next, owner } as StoredPromotion);

  const day = input.day as GameDay;
  const news: NewsItem[] = [];
  if (event === 'review') {
    raise(db, {
      id: inboxId(day, `deal-review:${input.promotionId}`),
      day,
      kind: 'money',
      priority: 'notable',
      title: `${deal.broadcaster} has put the deal under review`,
      body:
        `That card rated ${rating} against the ${deal.ratingsTarget} they signed up for, and ` +
        `they are at ${Math.round(next.satisfaction)} out of 100. The next ${next.reviewCardsLeft} ` +
        `cards have to get them back to ${REVIEW_CLEARED}, or the deal drops to streaming at ` +
        `${Math.round(STREAMING_SHARE * 100)}% of the fee. A cheap card with nobody on it is exactly what rates worst.`,
      promotionId: promotion.id,
      link: { route: 'promotion' },
    });
  }
  if (event === 'cleared') {
    raise(db, {
      id: inboxId(day, `deal-cleared:${input.promotionId}`),
      day,
      kind: 'money',
      priority: 'routine',
      title: `${deal.broadcaster} is happy again`,
      body: `That card rated ${rating}. The review is over.`,
      promotionId: promotion.id,
      link: { route: 'promotion' },
    });
  }
  if (event === 'dropped') {
    raise(db, {
      id: inboxId(day, `deal-dropped:${input.promotionId}`),
      day,
      kind: 'money',
      priority: 'notable',
      title: `${deal.broadcaster} has dropped you to streaming`,
      body:
        `${REVIEW_CARDS} cards to turn it round and they did not. Every card now earns ` +
        `${money(next.feePerCard)} from the stream instead of ${money(deal.feePerCard)}` +
        (owner ? `, and ${owner.name} has heard about it.` : '.'),
      promotionId: promotion.id,
      link: { route: 'promotion' },
    });
    news.push({
      id: newsId(day, `deal-dropped:${input.promotionId}`),
      day,
      kind: 'business',
      weight: 'normal',
      headline: `${deal.broadcaster} drops ${promotion.shortName} to streaming.`,
      fighterIds: [],
      promotionId: promotion.id,
    });
  }
  news.push(...fireIfOut(db, input.promotionId, day));
  return news;
}

// --- Over time ------------------------------------------------------------------------------------

/** What the owner's year looks like so far, measured from the world. */
export function ownerYear(db: GameDb, promotion: Promotion, owner: Owner, day: number): OwnerYear {
  const nights = nightsBetween(db, promotion.id as string, owner.yearStartDay, day);
  return {
    profit: Math.round(promotion.budget - owner.yearStartCash),
    cards: nights.length,
    buzz: promotion.buzz,
    dealSatisfaction: promotion.rightsDeal?.satisfaction ?? 0,
    vacantBelts: promotion.divisions.filter((d) => promotion.champions[d] === undefined).length,
    averageCrowd: averageCrowd(nights),
  };
}

/**
 * Renewals and the owner's verdict, for every year that has ended by `day`. Returns news.
 *
 * Called once at the end of every advance; a long advance that crossed a year boundary settles
 * it on the day the clock stopped, which is within a step of the anniversary.
 */
export function tickBoardroom(db: GameDb, day: number): NewsItem[] {
  const world = getWorld(db);
  if (world.playerRole !== 'promoter' || !world.playerPromotionId) return [];
  const id = world.playerPromotionId as string;
  openBoardroom(db, id, day);

  const news: NewsItem[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const promotion = promotionOf(db, id);
    const deal = promotion?.rightsDeal;
    if (!promotion || !deal || day < renewalDay(deal)) break;
    news.push(...renewDeal(db, promotion, deal, renewalDay(deal)));
  }
  for (let guard = 0; guard < 10; guard++) {
    const promotion = promotionOf(db, id);
    const owner = promotion?.owner;
    if (!promotion || !owner || owner.firedDay !== undefined) break;
    if (day < owner.yearStartDay + YEAR) break;
    news.push(...closeOwnerYear(db, promotion, owner, owner.yearStartDay + YEAR));
  }
  news.push(...fireIfOut(db, id, day as GameDay));
  return news;
}

function renewDeal(db: GameDb, promotion: Promotion, deal: RightsDeal, day: number): NewsItem[] {
  const cardsThisYear = nightsBetween(db, promotion.id as string, deal.startedDay, day).length;
  const { deal: next, outcome } = renew({
    deal,
    promotion,
    cardsThisYear,
    day: day as GameDay,
    freshFee: broadcastFee(promotion, broadcastFor(promotion)),
  });
  let owner = promotion.owner;
  if (outcome === 'dropped' && owner) {
    owner = { ...owner, confidence: Math.max(0, owner.confidence - CONFIDENCE_FOR_LOST_DEAL) };
  }
  db.promotions.upsert({ ...promotion, rightsDeal: next, owner } as StoredPromotion);

  const short =
    cardsThisYear < deal.minimumCards
      ? ` You ran ${cardsThisYear} cards against the ${deal.minimumCards} they wanted.`
      : '';
  const title =
    outcome === 'dropped'
      ? `${deal.broadcaster} will not renew on television`
      : outcome === 'restored'
        ? `${deal.broadcaster} puts you back on television`
        : next.feePerCard >= deal.feePerCard
          ? `${deal.broadcaster} renews at ${money(next.feePerCard)} a card`
          : `${deal.broadcaster} renews, for less: ${money(next.feePerCard)} a card`;
  raise(db, {
    id: inboxId(day as GameDay, `deal-renewal:${promotion.id as string}`),
    day: day as GameDay,
    kind: 'money',
    priority: 'notable',
    title,
    body:
      `The deal year is over: satisfaction ${Math.round(deal.satisfaction)} out of 100, ` +
      `${money(deal.feePerCard)} a card becomes ${money(next.feePerCard)}.${short}`,
    promotionId: promotion.id,
    link: { route: 'promotion' },
  });
  return outcome === 'renewed'
    ? []
    : [
        {
          id: newsId(day as GameDay, `deal-renewal:${promotion.id as string}`),
          day: day as GameDay,
          kind: 'business',
          weight: 'normal',
          headline:
            outcome === 'dropped'
              ? `${deal.broadcaster} drops ${promotion.shortName} to streaming.`
              : `${promotion.shortName} is back on ${deal.broadcaster}.`,
          fighterIds: [],
          promotionId: promotion.id,
        },
      ];
}

function closeOwnerYear(db: GameDb, promotion: Promotion, owner: Owner, day: number): NewsItem[] {
  const year = ownerYear(db, promotion, owner, day);
  const {
    owner: next,
    met,
    missed,
  } = yearEnd({
    owner,
    year,
    day: day as GameDay,
    cash: promotion.budget,
    buzz: promotion.buzz,
    minimumCards: minimumCardsFor(db, promotion),
    averageCrowd: typicalCrowd(db, promotion, day),
  });
  db.promotions.upsert({ ...promotion, owner: next } as StoredPromotion);

  const lines = owner.objectives.map(
    (o) => `${objectiveMet(o, year) ? 'Met' : 'Missed'}: ${describeObjective(o)}.`,
  );
  raise(db, {
    id: inboxId(day as GameDay, `owner-year:${promotion.id as string}`),
    day: day as GameDay,
    kind: 'career',
    priority: 'notable',
    title: `${owner.name}'s verdict on the year: ${met} of ${met + missed}`,
    body:
      `${lines.join(' ')} Confidence ${Math.round(owner.confidence)} → ` +
      `${Math.round(next.confidence)}. Next year: ` +
      `${next.objectives.map((o) => describeObjective(o).toLowerCase()).join('; ')}.`,
    promotionId: promotion.id,
    link: { route: 'promotion' },
  });
  return [];
}

// --- Fired ----------------------------------------------------------------------------------------

/** The jobs a fired promoter is offered: promotions below the one they lost, best first. */
export function jobOffers(db: GameDb, fromId: string): Promotion[] {
  const from = promotionOf(db, fromId);
  const everyone = (db.promotions.findAll() as unknown as Promotion[]).filter(
    (p) => p.id !== fromId,
  );
  const staffed = everyone.filter((p) => activeRoster(db, p.id as string).length >= 8);
  // A promotion with nobody on it is not a job; failing that, any promotion is better than none.
  const others = staffed.length > 0 ? staffed : everyone;
  const below = others
    .filter((p) => !from || p.prestige < from.prestige)
    .sort((a, b) => b.prestige - a.prestige);
  const pool = below.length > 0 ? below : others.slice().sort((a, b) => a.prestige - b.prestige);
  return pool.slice(0, 3);
}

/** Out of a job, if the owner has run out of confidence and has not already said so. */
function fireIfOut(db: GameDb, promotionId: string, day: GameDay): NewsItem[] {
  const promotion = promotionOf(db, promotionId);
  const owner = promotion?.owner;
  if (!promotion || !owner || owner.confidence > 0 || owner.firedDay !== undefined) return [];

  db.promotions.upsert({ ...promotion, owner: { ...owner, firedDay: day } } as StoredPromotion);
  const offers = jobOffers(db, promotionId);
  raise(db, {
    id: inboxId(day, `fired:${promotionId}`),
    day,
    kind: 'career',
    priority: 'decision',
    title: `${owner.name} has let you go`,
    body:
      `${OWNER_TEMPERAMENTS[owner.temperament].label} owners do not wait for a third bad year. ` +
      `You are out at ${promotion.shortName}. These promotions will have you.`,
    promotionId: promotion.id,
    actions: offers.map((p) => ({
      id: `job:${p.id as string}`,
      label: `Take the ${p.shortName} job`,
      detail: `${p.name}, prestige ${p.prestige}, ${money(p.budget)} in the bank.`,
    })),
  });
  return [
    {
      id: newsId(day, `fired:${promotionId}`),
      day,
      kind: 'business',
      weight: 'major',
      headline: `${promotion.shortName} parts company with its promoter.`,
      fighterIds: [],
      promotionId: promotion.id,
    },
  ];
}

// --- Bought out -----------------------------------------------------------------------------------

/** Years of running costs a buyer puts in, so a promotion it buys can keep the doors open. */
const BUYOUT_RUNWAY_YEARS = 2;
/** Fighters a buyer sells to pay the debts. */
const SOLD_ON_BUYOUT = 3;

/**
 * Every promotion whose cash has run out is bought.
 *
 * A promotion at zero used to stay at zero for ever, staging nothing and paying nothing. Doc 13
 * says what actually happens: somebody buys it, cheaply, and sells the best of the roster to pay
 * what was owed. The buyer puts in enough to run the place for a while, and the promotion goes on
 * smaller. The player's promotion is no exception — the new owner keeps them on, for now.
 */
export function buyOutTheBroke(db: GameDb, day: number): NewsItem[] {
  const news: NewsItem[] = [];
  const all = db.promotions.findAll() as unknown as Promotion[];
  for (const promotion of all) {
    if (promotion.budget > 0) continue;
    const id = promotion.id as string;
    const roster = activeRoster(db, id);
    const sold = roster
      .slice()
      .sort((a, b) => overallRating(b.attributes) - overallRating(a.attributes))
      .slice(0, SOLD_ON_BUYOUT);

    const movedTo: string[] = [];
    for (const fighter of sold) {
      const buyer = all
        .filter((p) => p.id !== promotion.id && p.divisions.includes(fighter.divisionId))
        .sort((a, b) => b.budget - a.budget)[0];
      if (!buyer) continue;
      const agreement = fighter.agreementId
        ? (db.agreements.findById(fighter.agreementId as string) as
            PromotionalAgreement | undefined)
        : undefined;
      if (agreement) {
        db.agreements.upsert({ ...agreement, promotionId: buyer.id } as PromotionalAgreement &
          Entity);
      }
      db.fighters.upsert({
        ...fighter,
        promotionId: buyer.id,
        ...(fighter.ledger ? { ledger: leavingPromotion(fighter.ledger, promotion.id) } : {}),
      } as Fighter & Entity);
      movedTo.push(`${displayName(fighter)} to ${buyer.shortName}`);
    }

    const rosterSize = roster.length - movedTo.length;
    const injection = Math.max(
      10,
      Math.round(annualCosts({ promotion, rosterSize }) * BUYOUT_RUNWAY_YEARS),
    );
    const isPlayer = getWorld(db).playerPromotionId === id;
    const owner = isPlayer
      ? newOwner({
          pick: pickFrom(`${getWorld(db).seed}:${id}:buyout:${day}`),
          day: day as GameDay,
          cash: injection,
          buzz: promotion.buzz,
          minimumCards: minimumCardsFor(db, promotion),
          averageCrowd: typicalCrowd(db, promotion, day),
        })
      : promotion.owner;
    db.promotions.upsert({ ...promotion, budget: injection, owner } as StoredPromotion);

    const detail =
      movedTo.length > 0
        ? `Sold to pay the debts: ${movedTo.join(', ')}.`
        : 'Nobody on the roster was worth selling.';
    news.push({
      id: newsId(day as GameDay, `buyout:${id}`),
      day: day as GameDay,
      kind: 'business',
      weight: 'major',
      headline: `${promotion.shortName} runs out of money and is bought.`,
      detail,
      fighterIds: sold.map((f) => f.id),
      promotionId: promotion.id,
    });
    if (isPlayer) {
      raise(db, {
        id: inboxId(day as GameDay, `buyout:${id}`),
        day: day as GameDay,
        kind: 'money',
        priority: 'notable',
        title: `${promotion.shortName} has been bought${owner ? ` by ${owner.name}` : ''}`,
        body: `The money ran out. ${detail} The new owner puts in ${money(injection)} and keeps you on.`,
        promotionId: promotion.id,
        link: { route: 'promotion' },
      });
    }
  }
  return news;
}

// --- Read model -----------------------------------------------------------------------------------

export interface Boardroom {
  owner: {
    name: string;
    temperament: string;
    blurb: string;
    confidence: number;
    objectives: { label: string; met: boolean }[];
    yearEndsDay: number;
  };
  deal: {
    broadcaster: string;
    feePerCard: number;
    satisfaction: number;
    health: ReturnType<typeof dealHealth>;
    reviewCardsLeft?: number;
    minimumCards: number;
    cardsThisYear: number;
    ratingsTarget: number;
    renewsDay: number;
  };
}

/** The owner's objectives and the deal's health, as the dashboard shows them. */
export function boardroom(db: GameDb, promotion: Promotion, day: number): Boardroom | undefined {
  const { owner, rightsDeal: deal } = promotion;
  if (!owner || !deal) return undefined;
  const year = ownerYear(db, promotion, owner, day);
  return {
    owner: {
      name: owner.name,
      temperament: OWNER_TEMPERAMENTS[owner.temperament].label,
      blurb: OWNER_TEMPERAMENTS[owner.temperament].blurb,
      confidence: owner.confidence,
      objectives: owner.objectives.map((o: Objective) => ({
        label: describeObjective(o),
        met: objectiveMet(o, year),
      })),
      yearEndsDay: owner.yearStartDay + YEAR,
    },
    deal: {
      broadcaster: deal.broadcaster,
      feePerCard: deal.feePerCard,
      satisfaction: deal.satisfaction,
      health: dealHealth(deal),
      reviewCardsLeft: deal.reviewCardsLeft,
      minimumCards: deal.minimumCards,
      cardsThisYear: nightsBetween(db, promotion.id as string, deal.startedDay, day).length,
      ratingsTarget: deal.ratingsTarget,
      renewsDay: renewalDay(deal),
    },
  };
}
