/**
 * Building a card, as the promoter.
 *
 * The shape is sections rather than nine equal slots: a main event, a co-main, three main-card
 * bouts and four prelims. That is how a card is actually assembled and it is also the answer
 * to the decision-density problem — nine individually-chosen fights is eighteen dropdowns and a
 * spreadsheet, while four sections with different stakes is four kinds of decision.
 *
 * Within a section the game proposes and the player disposes. Slots fill themselves from the
 * matchmaker so a card is never a blank form, and every filled slot can be swapped for another
 * proposal. The intent is that a player who only wants to pick the main event can do exactly
 * that and press go, and a player who wants to build all nine can.
 *
 * The ordering is *not* a decision, deliberately. `buildCard` already sorts by draw weight with
 * a title fight always headlining, so position falls out of what you booked — asking a player
 * to drag nine rows on a phone would be work without a choice inside it.
 */

import {
  DELIVERY_MEMORY,
  MAIN_CARD_SIZE,
  PRELIM_CARD_SIZE,
  awardBonuses,
  bonusPoolFor,
  buildCard,
  createRng,
  drawWeight,
  eventId,
  eventName,
  expectedDemand,
  eventRevenue,
  offerOpponents,
  paperOdds,
  settleNight,
  venueFor,
  type BoutSeed,
  type CardBout,
  type CardPosition,
  type Fighter,
  type FightNight,
  type FightResult,
  type NewsItem,
  type NightSettlement,
  type Promotion,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { appendNews, runCardBout } from './world';

/**
 * The sections of a card, in the order a promoter fills them.
 *
 * Sizes come from the engine's own card constants rather than being restated here, so a change
 * to `CARD_SIZE` cannot leave the builder quietly out of step with what `buildCard` produces.
 */
export interface CardSection {
  position: CardPosition;
  label: string;
  slots: number;
  /** What this section is *for*, in the promoter's terms. Shown on the builder. */
  purpose: string;
}

export const CARD_SECTIONS: readonly CardSection[] = [
  {
    position: 'mainEvent',
    label: 'Main event',
    slots: 1,
    purpose: 'Sells the night. Everything else on the card is judged against it.',
  },
  {
    position: 'coMain',
    label: 'Co-main event',
    slots: 1,
    purpose: 'The insurance. If the main event falls apart, this is what you have left.',
  },
  {
    position: 'mainCard',
    label: 'Main card',
    // Main card holds everything above the prelims except the top two.
    slots: MAIN_CARD_SIZE - 2,
    purpose: 'Where contenders are made and tested. Nobody buys the card for these; they remember them.',
  },
  {
    position: 'prelim',
    label: 'Preliminary card',
    slots: PRELIM_CARD_SIZE,
    purpose: 'Prospects, returns and people fighting for their job. Cheap, and it is where next year comes from.',
  },
];

/** One bout the player has placed, or could. */
export interface ProposedBout {
  redId: string;
  blueId: string;
  divisionId: string;
  isTitleFight: boolean;
  /** Unitless share of demand. Drives ordering and, for the headline, the whole gate. */
  draw: number;
  /** 0–1 chance the red corner wins on paper. Near 0.5 is a competitive fight. */
  redOdds: number;
}

/** A card in progress: one array of bouts per section, with holes where nothing is booked. */
export type CardDraft = Record<CardPosition, (ProposedBout | undefined)[]>;

export function emptyDraft(): CardDraft {
  const draft = {} as CardDraft;
  for (const section of CARD_SECTIONS) {
    draft[section.position] = Array.from({ length: section.slots }, () => undefined);
  }
  return draft;
}

export const draftBouts = (draft: CardDraft): ProposedBout[] =>
  CARD_SECTIONS.flatMap((s) => draft[s.position]).filter((b): b is ProposedBout => b !== undefined);

const usedIn = (draft: CardDraft): Set<string> => {
  const used = new Set<string>();
  for (const bout of draftBouts(draft)) {
    used.add(bout.redId);
    used.add(bout.blueId);
  }
  return used;
};

/**
 * Fights the promotion could make for one section, best first.
 *
 * Ranked by what the section is *for*, which is the whole reason sections beat nine equal
 * slots. A main event is ranked by draw, because that is the only thing it has to do. A prelim
 * is ranked by competitiveness, because nobody is buying the card for it and a close fight
 * between two unknowns is the cheapest good thing a promoter can put on.
 *
 * Excludes anybody already booked on this card, which is what stops the auto-fill putting the
 * same fighter in two bouts.
 */
export function proposalsFor(input: {
  db: GameDb;
  promotion: Promotion;
  position: CardPosition;
  draft: CardDraft;
  day: number;
  /** How many to return. The UI shows a handful, not a roster. */
  limit?: number;
}): ProposedBout[] {
  const { db, promotion, position, draft, day, limit = 8 } = input;
  const world = getWorld(db);
  const used = usedIn(draft);

  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) =>
      f.promotionId === promotion.id &&
      f.retiredDay === undefined &&
      (f.readyOnDay ?? 0) <= day &&
      !used.has(f.id as string),
  );

  const out: ProposedBout[] = [];
  const seen = new Set<string>();
  const rng = createRng(`${world.seed}:propose:${promotion.id}:${position}:${day}`);

  for (const subject of roster) {
    const offers = offerOpponents(subject, roster, promotion, day, rng.fork(subject.id as string), {
      promotionId: promotion.id,
    });

    for (const offer of offers) {
      // One entry per pairing rather than two — a bout is the same bout from either corner.
      const key = [subject.id as string, offer.opponent.id as string].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const champion = promotion.champions[subject.divisionId];
      const isTitleFight =
        position === 'mainEvent' &&
        champion !== undefined &&
        (champion === subject.id || champion === offer.opponent.id);

      out.push({
        redId: subject.id as string,
        blueId: offer.opponent.id as string,
        divisionId: subject.divisionId as string,
        isTitleFight,
        draw: drawWeight({
          promotion,
          red: subject,
          blue: offer.opponent,
          heat: 0,
          isRivalry: false,
          isTitleFight,
        }),
        redOdds: paperOdds(subject, offer.opponent),
      });
    }
  }

  return out.sort(rankFor(position)).slice(0, limit);
}

/**
 * How a section ranks its options.
 *
 * The differences are the point. Ranking every section by draw would make the builder one
 * decision repeated four times, and would also be wrong: a promoter who puts their four
 * biggest remaining fights on the prelims has wasted them.
 */
function rankFor(position: CardPosition): (a: ProposedBout, b: ProposedBout) => number {
  const competitiveness = (bout: ProposedBout) => 1 - Math.abs(bout.redOdds - 0.5) * 2;

  switch (position) {
    case 'mainEvent':
      // Draw, and nothing else. A title fight beats everything by construction.
      return (a, b) => Number(b.isTitleFight) - Number(a.isTitleFight) || b.draw - a.draw;
    case 'coMain':
      // Draw still matters, but a co-main that is a foregone conclusion is a wasted slot.
      return (a, b) => b.draw * competitiveness(b) - a.draw * competitiveness(a);
    case 'mainCard':
      // Where contenders are tested: competitiveness first, draw as the tiebreak.
      return (a, b) => competitiveness(b) - competitiveness(a) || b.draw - a.draw;
    case 'prelim':
      // Nobody is buying the card for these, so the only thing worth optimising is whether
      // they are good fights.
      return (a, b) => competitiveness(b) - competitiveness(a);
  }
}

/**
 * Fill every empty slot with the best remaining option for its section.
 *
 * Top-down, so the main event takes the best fight available before the prelims get a chance
 * at it. A player who only wants to choose the headline can press this and be done, which is
 * the intended shape: the game proposes a whole card and the player disagrees with the parts
 * they care about.
 */
export function autoFill(input: {
  db: GameDb;
  promotion: Promotion;
  draft: CardDraft;
  day: number;
}): CardDraft {
  let draft: CardDraft = { ...input.draft };

  for (const section of CARD_SECTIONS) {
    const slots = [...draft[section.position]];
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]) continue;
      const [best] = proposalsFor({ ...input, draft, position: section.position, limit: 1 });
      if (!best) break;
      slots[i] = best;
      draft = { ...draft, [section.position]: slots };
    }
    draft = { ...draft, [section.position]: slots };
  }

  return draft;
}

/** What the card looks like as a business proposition, before it is committed. */
export interface CardForecast {
  bouts: number;
  headlineDraw: number;
  expectedAttendance: number;
  /** Thousands. What the promotion is committing to pay. */
  purses: number;
  bonusPool: number;
}

export function forecastCard(input: {
  db: GameDb;
  promotion: Promotion;
  draft: CardDraft;
  purseOf: (fighterId: string, position: CardPosition) => number;
}): CardForecast {
  const { promotion, draft, purseOf } = input;
  const bouts = draftBouts(draft);
  const headlineDraw = draft.mainEvent[0]?.draw ?? Math.max(0, ...bouts.map((b) => b.draw));

  let purses = 0;
  for (const section of CARD_SECTIONS) {
    for (const bout of draft[section.position]) {
      if (!bout) continue;
      purses += purseOf(bout.redId, section.position) + purseOf(bout.blueId, section.position);
    }
  }

  return {
    bouts: bouts.length,
    headlineDraw,
    expectedAttendance: expectedDemand(promotion, headlineDraw, bouts.length),
    purses: Math.round(purses),
    bonusPool: bonusPoolFor(promotion),
  };
}

/**
 * Turn a draft into the seeds the engine's card builder consumes.
 *
 * Position is *not* passed through. `buildCard` sorts by draw weight with a title fight always
 * headlining, so where a bout ends up is a consequence of who is in it — which means a player
 * who puts their biggest fight in the prelim section will find it has headlined anyway. That is
 * correct rather than a bug: a promoter does not get to decide that the fight everybody wants
 * is the opener.
 */
export function seedsFrom(draft: CardDraft, cardId: string): BoutSeed[] {
  return draftBouts(draft).map((bout, i) => ({
    boutId: `${cardId}:${i}`,
    redId: bout.redId as never,
    blueId: bout.blueId as never,
    divisionId: bout.divisionId as never,
    isTitleFight: bout.isTitleFight,
    draw: bout.draw,
  }));
}

/** A scheduled, unrun card. `status: 'scheduled'` had never been written by anything. */
export function scheduleCard(input: {
  db: GameDb;
  promotion: Promotion;
  draft: CardDraft;
  day: number;
  broadcast: FightNight['broadcast'];
}): FightNight {
  const { db, promotion, draft, day, broadcast } = input;
  const id = eventId(promotion.id, day);
  const card = buildCard(seedsFrom(draft, id as string));
  const world = getWorld(db);
  const rng = createRng(`${world.seed}:card:${id}`);

  const headline = card[0];
  const red = headline ? (db.fighters.findById(headline.redId as string) as Fighter | undefined) : undefined;
  const blue = headline ? (db.fighters.findById(headline.blueId as string) as Fighter | undefined) : undefined;

  const night: FightNight = {
    id,
    promotionId: promotion.id,
    day,
    name: eventName({
      promotion,
      broadcast,
      number: Math.floor(day / 14) + 1,
      mainEventNames:
        red && blue ? [red.lastName, blue.lastName] : undefined,
    }),
    /*
     * Booked to the crowd the card will actually draw, using the same function and the same
     * demand arithmetic the world's own cards use.
     *
     * The first version of this hardcoded `capacity: 0`, which meant attendance was
     * `min(0, demand)` and no card a player promoted could ever sell a single ticket. The test
     * caught it immediately, which is the entire argument for testing this layer before
     * putting a screen on top of it.
     */
    venue: venueFor(
      promotion,
      expectedDemand(promotion, headlineDrawOfDraft(draft), card.length),
      rng.fork('venue'),
    ),
    broadcast,
    status: 'scheduled',
    bouts: card,
    bonusPool: bonusPoolFor(promotion),
  };

  db.events.upsert(night as FightNight & Entity);
  db.save();
  return night;
}

/**
 * Run a card the player built.
 *
 * Uses the world's own `runCardBout` rather than a promoter-specific copy, because a card the
 * player promoted has to have exactly the same consequences as one the world ran — ranks,
 * belts, ageing, retirement, medical suspensions and pay. Two implementations of that would
 * drift within a week and the divergence would be invisible until somebody noticed the player's
 * champions never aged.
 */
export interface CardOutcome {
  night: FightNight;
  results: readonly { bout: CardBout; result: FightResult }[];
  settlement: NightSettlement;
  news: readonly NewsItem[];
}

export function runScheduledCard(input: {
  db: GameDb;
  night: FightNight;
  purses: number;
}): CardOutcome | undefined {
  const { db, night } = input;
  const promotion = db.promotions.findById(night.promotionId as string) as Promotion | undefined;
  if (!promotion) return undefined;

  const world = getWorld(db);
  const rng = createRng(`${world.seed}:run:${night.id}`);
  const readyOn = new Map<string, number>();
  const lastSeen = new Map<string, number>();

  const results: { bout: CardBout; result: FightResult }[] = [];
  const news: NewsItem[] = [];

  /*
   * Prelims first, main event last — the one place a promoter's card resolves in broadcast
   * order rather than "detail follows the player". There is no player bout on this card, so
   * the reason for that rule does not apply, and a promoter watching their own show wants the
   * night to build the way a night builds.
   */
  for (const bout of [...night.bouts].reverse()) {
    const outcome = runCardBout({
      db,
      day: night.day,
      rng: rng.fork(bout.boutId),
      promotion,
      bout,
      readyOn,
      lastSeen,
    });
    if (!outcome) continue;
    results.push({ bout, result: outcome.result });
    news.push(...outcome.news);
  }

  const awards = awardBonuses(
    results.map((r) => ({ boutId: r.bout.boutId, result: r.result })),
    night.bonusPool,
  );
  for (const id of new Set<string>([
    ...awards.performanceOfTheNight.map((f) => f as string),
    ...(awards.fightOfTheNight
      ? [night.bouts.find((b) => b.boutId === awards.fightOfTheNight)?.redId as string,
         night.bouts.find((b) => b.boutId === awards.fightOfTheNight)?.blueId as string]
      : []),
  ])) {
    const fighter = id ? (db.fighters.findById(id) as Fighter | undefined) : undefined;
    if (!fighter) continue;
    db.fighters.upsert({
      ...fighter,
      bank: Math.round((fighter.bank + awards.perAward) * 10) / 10,
      lifetimeGross: Math.round((fighter.lifetimeGross + awards.perAward) * 10) / 10,
    } as Fighter & Entity);
  }

  // Re-read: bouts on this card may have changed a title, and settling against the promotion
  // captured above would silently roll the new champion back.
  const current =
    (db.promotions.findById(promotion.id as string) as Promotion | undefined) ?? promotion;

  const settlement = settleNight({
    promotion: current,
    revenue: eventRevenue({
      promotion: current,
      venue: night.venue,
      broadcast: night.broadcast,
      headlineDraw: headlineDrawOf(db, current, night),
      bouts: night.bouts.length,
      purses: input.purses,
      bonuses: night.bonusPool,
    }),
    results: results.map((r) => r.result),
    recentDelivery: current.recentDelivery,
  });

  db.promotions.upsert({
    ...settlement.promotion,
    recentDelivery: [...(current.recentDelivery ?? []), settlement.delivered].slice(
      -DELIVERY_MEMORY,
    ),
  } as Promotion & Entity);

  const ran: FightNight = { ...night, status: 'complete' };
  db.events.upsert(ran as FightNight & Entity);
  appendNews(db, news);
  db.save();

  return { night: ran, results, settlement, news };
}

/**
 * Draw weight of whatever tops the card, which is what sells it.
 *
 * Recomputed from the two fighters rather than carried on the night. `CardBout` deliberately
 * does not store the seed's draw — it is derived state, and a stored copy would go stale the
 * moment a fighter's star power moved between the card being scheduled and being run, which is
 * exactly the window promoter mode puts a player inside.
 */
function headlineDrawOf(db: GameDb, promotion: Promotion, night: FightNight): number {
  const top = night.bouts[0];
  if (!top) return 0;
  const red = db.fighters.findById(top.redId as string) as Fighter | undefined;
  const blue = db.fighters.findById(top.blueId as string) as Fighter | undefined;
  if (!red || !blue) return 0;

  return drawWeight({
    promotion,
    red,
    blue,
    heat: 0,
    isRivalry: false,
    isTitleFight: top.isTitleFight,
  });
}

/** What the draft's headline draws, before the card has been ordered. */
function headlineDrawOfDraft(draft: CardDraft): number {
  const bouts = draftBouts(draft);
  return bouts.length === 0 ? 0 : Math.max(...bouts.map((b) => b.draw));
}
