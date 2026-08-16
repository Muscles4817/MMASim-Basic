/**
 * The world, moving on without you.
 *
 * Until now `advanceRoster` aged the roster and nothing else, which meant the division a
 * player was climbing was frozen in January 2020: rankings never moved, champions were
 * permanent unless the player took the belt, and every other fighter's record stayed exactly
 * as it was seeded no matter how many years went by. You were climbing a ladder where
 * nothing above you ever shifted.
 *
 * The loop below is not new. It is the driver that `tests/long-sim/twenty-years.test.ts` has
 * run for twenty simulated years — matchmaking, fights, aftermath, development, ageing,
 * retirement and replenishment — lifted out of the test harness and into the game, where it
 * should have been. That suite is what proves it does not run away: rating drift, career
 * length, trauma accumulation and division survival are all asserted there.
 *
 * Two things are added on the way across:
 *
 *  - It produces **news**, because a world that moves and never says so has not moved as far
 *    as the player is concerned.
 *  - It is **budgeted**. The long-sim runs for minutes in a test; this runs while somebody
 *    waits for a screen, so the amount of work is capped per call.
 */

import {
  DIVISIONS,
  applyAftermath,
  applyAgeing,
  applyTraining,
  createRng,
  CARD_SIZE,
  agreementStatus,
  awardBonuses,
  broadcastFor,
  buildCard,
  campCost,
  consumeFight,
  contractFairness,
  createAgreement,
  debutNews,
  defaultGamePlan,
  defaultTerms,
  displayName,
  drawWeight,
  eventId,
  eventName,
  fightNews,
  generateFighter,
  offerOpponents,
  rankDivision,
  readinessDelay,
  recordString,
  marketValue,
  purseFor,
  resentmentFrom,
  retirementNews,
  retirementReason,
  signingNews,
  setChampion,
  shouldRetire,
  simulateFight,
  streakNews,
  trimFeed,
  type BoutSeed,
  type CardBout,
  type CardPosition,
  type Coach,
  type DivisionId,
  type FightNight,
  type FightResult,
  type Fighter,
  type FighterId,
  type Gym,
  type NewsItem,
  type Promotion,
  type PromotionalAgreement,
  type Venue,
  type Rng,
  eventRevenue,
  settleNight,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { currentPurse } from './money';

type StoredNews = NewsItem & Entity;

/**
 * How much simulated time one step of the world covers.
 *
 * A fortnight, matching the long-sim. Shorter and the loop runs more times for the same
 * elapsed days at no benefit; longer and fighters sit idle past the point they were ready.
 */
const STEP_DAYS = 14;

/**
 * Cards run per fortnight across every promotion.
 *
 * The one number that decides whether the world feels busy or empty. At six, a division of
 * roughly a dozen sees each fighter out around three times a year, which is what a real
 * schedule looks like.
 */
const CARDS_PER_STEP = 6;

/**
 * Ceiling on fights simulated in a single call.
 *
 * A soft ceiling rather than a hard one, because a card is atomic: the budget is checked
 * before a night starts and the night then runs to completion, so a call can overshoot by at
 * most one card. Stopping halfway through an event would leave a card with unresolved bouts
 * on it, which is worse than nine extra simulations.
 *
 * The player is waiting for a screen. A twelve-week camp is six steps and ~36 fights, which
 * is comfortable; a player who somehow advances five years at once gets a world that moved
 * plausibly rather than a frozen tab. When the budget binds, time still passes and people
 * still age — it is the fights that thin out, which is the right thing to lose.
 */
const MAX_FIGHTS_PER_CALL = 220;

/**
 * Cards run per fortnight, across every promotion.
 *
 * The budget above is a total, and a total is the wrong shape: measured over a simulated
 * year it bound in March and produced **every fight in the world in the first quarter**,
 * followed by nine months of nothing but ageing. A player who booked a fight in June could
 * not be on a card and the rankings froze for three quarters.
 *
 * So the real limiter is per-fortnight, and the total is only a backstop against somebody
 * advancing twenty years in one call.
 */
const MAX_CARDS_PER_STEP = 3;

/**
 * Bouts a fighter will take in a rolling twelve months.
 *
 * Three is already busy by modern standards — the elite average is closer to two — but the
 * bottom of a roster genuinely does fight more, and a hard ceiling here is what stops a
 * favourite accumulating a 63-fight record in a decade.
 */
const MAX_BOUTS_PER_YEAR = 3;

/** Bodies each division tries to keep, so cards can be made without endless rematches. */
const divisionTarget = (sex: 'male' | 'female'): number => (sex === 'female' ? 6 : 9);

export interface WorldAdvance {
  /** Fights simulated across the whole roster. */
  fights: number;
  /** News generated, newest first. */
  news: NewsItem[];
  /** True when the budget bound and some fights were skipped. */
  truncated: boolean;
}

/**
 * Run the world from one day to another.
 *
 * `exceptId` is the player: their fights are their own business and are simulated by the
 * career loop, not here. Everything else in the sport carries on.
 */
export function advanceWorld(
  db: GameDb,
  fromDay: number,
  toDay: number,
  exceptId: FighterId,
): WorldAdvance {
  const world = getWorld(db);
  const news: NewsItem[] = [];
  let fights = 0;
  let truncated = false;

  // Nothing meaningful happens in under a fortnight, and the common case — a four-week camp
  // — should not pay for a loop that cannot produce a card.
  if (toDay - fromDay < STEP_DAYS) {
    ageEveryone(db, fromDay, toDay, exceptId);
    return { fights: 0, news, truncated: false };
  }

  const rng = createRng(`${world.seed}:world:${fromDay}`);
  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const readyOn = new Map<string, number>();
  const lastSeen = new Map<string, number>();

  for (let day = fromDay; day < toDay; day += STEP_DAYS) {
    // Quarterly intake, matching how a promotion actually signs people.
    if (Math.floor(day / 91) !== Math.floor((day - STEP_DAYS) / 91)) {
      // A belt held by somebody who is never getting in a cage again kills its division,
      // because retirees are filtered out of every card. Swept rather than only handled at
      // the moment of retirement, because a fighter can reach that state by more than one
      // route and the cost of being sure is one pass over five promotions.
      vacateAbandonedBelts(db);
      news.push(...replenish(db, day, rng, promotions));
      // Deals run out across the roster too, so the market has other people in it.
      news.push(...resolveFreeAgency(db, day, rng, promotions));
    }

    /*
     * Availability, with a real activity ceiling.
     *
     * `readinessDelay` is a *medical* gate — how long until a fighter is cleared. It is not
     * a schedule, and on its own it let the top of the roster fight five or six times a year
     * for a decade: measured, ten years produced records of 63-0 and a 47-year-old champion.
     * Elite fighters average one and a half to two and a half bouts a year, and the ceiling
     * is availability of *opponents and dates*, not of medical clearance.
     */
    const available = (db.fighters.findAll() as Fighter[]).filter((f) => {
      if (f.id === exceptId || f.retiredDay !== undefined) return false;
      // Both the in-call map and the persisted day, because a suspension handed out by the
      // player's own card in a previous session is every bit as binding as one from this loop.
      if (Math.max(readyOn.get(f.id as string) ?? 0, f.readyOnDay ?? 0) > day) return false;
      const inLastYear = f.record.filter((r) => day - r.day < 365).length;
      return inLastYear < MAX_BOUTS_PER_YEAR;
    });

    for (let card = 0; card < Math.min(CARDS_PER_STEP, MAX_CARDS_PER_STEP); card++) {
      if (available.length < 2) break;
      if (fights >= MAX_FIGHTS_PER_CALL) {
        truncated = true;
        break;
      }

      /*
       * A night, not a loose bout.
       *
       * The world used to simulate individual fights with no container, which meant card
       * position did not exist, the bonus pool had nowhere to sit, and revenue points — which
       * attach to an *event* — could never pay out. Bouts are collected, ordered by draw
       * weight with a title fight always headlining, and then run as one card.
       */
      const promotion = rng.pick(promotions);
      const built = buildNight({
        db,
        day,
        rng: rng.fork(`night:${day}:${card}`),
        promotion,
        available,
        readyOn,
        lastSeen,
        exceptId,
      });
      if (!built) continue;
      fights += built.fights;
      news.push(...built.news);
    }

    if (truncated) break;
  }

  // Everyone who never got booked still gets older. Without this, a fighter who sat out the
  // whole period would be returned to the player at exactly the age they were.
  ageEveryone(db, fromDay, toDay, exceptId, lastSeen);

  const stored = appendNews(db, news);
  db.save();

  return { fights, news: stored, truncated };
}

const VENUES: readonly Venue[] = [
  { name: 'The Arena', city: 'Las Vegas', country: 'USA', capacity: 18000 },
  { name: 'Riverside Hall', city: 'Manchester', country: 'UK', capacity: 12000 },
  { name: 'Metro Dome', city: 'Tokyo', country: 'Japan', capacity: 15000 },
  { name: 'Civic Centre', city: 'Sacramento', country: 'USA', capacity: 6000 },
  { name: 'The Warehouse', city: 'Rotterdam', country: 'Netherlands', capacity: 3000 },
];

/**
 * Build and run one night.
 *
 * Bouts are matched first, then ordered into a card, then simulated. That order matters: card
 * position is a property of the whole night, so it cannot be known until every bout on it is.
 */
function buildNight(ctx: {
  db: GameDb;
  day: number;
  rng: Rng;
  promotion: Promotion;
  available: Fighter[];
  readyOn: Map<string, number>;
  lastSeen: Map<string, number>;
  exceptId: FighterId;
}): { fights: number; news: NewsItem[] } | undefined {
  const { db, day, rng, promotion, available, readyOn, lastSeen } = ctx;

  // --- Matchmaking: collect the bouts before deciding where any of them sit ----------------
  const seeds: BoutSeed[] = [];
  const used = new Set<string>();

  /*
   * Only this promotion's own fighters.
   *
   * `offerOpponents` was called with the whole roster and no promotion filter, so 91% of
   * bouts in a simulated year had at least one fighter who was not signed to the card's
   * promotion — AFC-contracted fighters headlining Frontier Fights shows. Exclusivity is the
   * most binding term in the sport; a fighter appearing on a rival's card is not a rare
   * event, it is an impossible one. `night.ts` already did this correctly for the player.
   */
  const roster = available.filter((f) => f.promotionId === promotion.id);

  for (let attempt = 0; attempt < CARD_SIZE * 2 && seeds.length < CARD_SIZE; attempt++) {
    const pool = roster.filter((f) => !used.has(f.id as string));
    if (pool.length < 2) break;

    const subject = rng.pick(pool);
    const offers = offerOpponents(subject, pool, promotion, day, rng.fork(`m:${attempt}`), {
      promotionId: promotion.id,
    });
    if (offers.length === 0) continue;

    const opponent = rng.pick(offers).opponent;
    if (used.has(opponent.id as string)) continue;

    used.add(subject.id as string);
    used.add(opponent.id as string);

    /*
     * A title fight needs a champion, and four of five promotions seeded with none.
     *
     * `champions: {}` on VMA, RSC, ECC and FF meant no champion, therefore no title fight,
     * therefore no champion — forever. Measured over ten years: AFC held 12 belts and the
     * other four promotions held zero between them, while ECC's own seed note describes
     * winning its belt as the thing that gets you a call from Apex.
     *
     * So a vacant belt in a division with real contenders gets contested, which is exactly
     * what a promotion does.
     */
    const champion = promotion.champions[subject.divisionId];
    const contestsVacant =
      champion === undefined &&
      rankDivision(
        db.fighters.findAll() as Fighter[],
        subject.divisionId,
        promotion.id,
        day,
      ).length >= 4;

    const isTitleFight =
      champion !== undefined
        ? champion === subject.id || champion === opponent.id
        : contestsVacant && seeds.length === 0;

    seeds.push({
      boutId: `night:${day}:${promotion.id}:${seeds.length}`,
      redId: subject.id,
      blueId: opponent.id,
      divisionId: subject.divisionId,
      isTitleFight,
      draw: drawWeight({
        promotion,
        red: subject,
        blue: opponent,
        heat: 0,
        isRivalry: false,
        isTitleFight,
      }),
    });
  }

  if (seeds.length === 0) return undefined;

  const card = buildCard(seeds);
  const totalDraw = seeds.reduce((a, s) => a + s.draw, 0);
  const headlineDraw = card[0] ? (seeds.find((s) => s.boutId === card[0]!.boutId)?.draw ?? 0) : 0;
  const broadcast = broadcastFor(promotion, headlineDraw, rng.fork('broadcast'));

  const night: FightNight = {
    id: eventId(promotion.id, day),
    promotionId: promotion.id,
    day,
    name: eventName({
      promotion,
      broadcast,
      number: Math.floor(day / 14) + 1,
    }),
    venue: rng.pick(VENUES),
    broadcast,
    status: 'complete',
    bouts: card,
    // A promotion pays what it can afford to. The floor is what makes a bonus worth chasing
    // at the bottom of the sport rather than only at the top.
    bonusPool: Math.max(4, Math.round(promotion.budget * 0.0012)),
  };

  // --- Run it ------------------------------------------------------------------------------
  const news: NewsItem[] = [];
  const results: { boutId: string; result: FightResult }[] = [];
  let fights = 0;

  for (const bout of card) {
    const outcome = runCardBout({
      db,
      day,
      rng: rng.fork(`bout:${bout.boutId}`),
      promotion,
      bout,
      readyOn,
      lastSeen,
    });
    if (!outcome) continue;
    fights++;
    results.push({ boutId: bout.boutId, result: outcome.result });
    news.push(...outcome.news);
  }

  // --- The bonuses, decided by what actually happened ---------------------------------------
  const awards = awardBonuses(results, night.bonusPool);
  const bonusRecipients = new Set<string>(awards.performanceOfTheNight.map((id) => id as string));
  const fotn = card.find((b) => b.boutId === awards.fightOfTheNight);
  if (fotn) {
    bonusRecipients.add(fotn.redId as string);
    bonusRecipients.add(fotn.blueId as string);
  }

  for (const id of bonusRecipients) {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    if (!fighter) continue;
    db.fighters.upsert({
      ...fighter,
      bank: round1(fighter.bank + awards.perAward),
      lifetimeGross: round1(fighter.lifetimeGross + awards.perAward),
      lifetimeNet: round1(fighter.lifetimeNet + awards.perAward * 0.55),
    } as Fighter & { id: string });
  }

  db.events.upsert(night as FightNight & Entity);

  /*
   * What the night did to the promotion that ran it.
   *
   * `totalDraw` was computed and thrown away here, so no card the world ran ever earned or
   * cost a promotion anything and `buzz` never moved. Doc 12's central loop — a promotion
   * that runs bad cards sees demand fall for the next one — did not exist.
   */
  /*
   * Re-read rather than reusing the `promotion` captured at the top of this function.
   *
   * Bouts on this card may have changed a title, and `finalise` writes that to the stored
   * promotion. Settling against the stale object and upserting it would silently roll the new
   * champion back — which is exactly what happened when this was first written, and it showed
   * up as belts that never changed hands across five simulated years.
   */
  const current =
    (db.promotions.findById(promotion.id as string) as Promotion | undefined) ?? promotion;

  const settled = settleNight({
    promotion: current,
    revenue: eventRevenue({
      promotion,
      venue: night.venue,
      broadcast,
      totalDraw,
      purses: cardPurses(db, card),
      bonuses: night.bonusPool,
    }),
    results: results.map((r) => r.result),
  });
  db.promotions.upsert(settled.promotion as Promotion & Entity);

  return { fights, news };
}

/** One bout on a card, start to finish, including everything it changes. */
function runCardBout(ctx: {
  db: GameDb;
  day: number;
  rng: Rng;
  promotion: Promotion;
  bout: CardBout;
  readyOn: Map<string, number>;
  lastSeen: Map<string, number>;
}): { news: NewsItem[]; result: FightResult } | undefined {
  const { db, day, rng, promotion, bout, readyOn, lastSeen } = ctx;

  const red = db.fighters.findById(bout.redId as string) as Fighter | undefined;
  const blue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;
  if (!red || !blue) return undefined;

  // Ranks *before* the fight, which is what makes an upset an upset.
  const divisionRanked = rankDivision(
    (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.divisionId === red.divisionId && f.retiredDay === undefined,
    ),
    red.divisionId,
    promotion.id,
    day,
    promotion.champions[red.divisionId],
  );
  const rankOfId = (id: FighterId): number | undefined => {
    const index = divisionRanked.findIndex((r) => r.fighter.id === id);
    return index >= 0 ? index + 1 : undefined;
  };
  const champion = promotion.champions[red.divisionId];
  const isTitleFight = bout.isTitleFight;

  const boutId = bout.boutId;
  const result = simulateFight({
    boutId,
    red: { fighter: red, plan: defaultGamePlan() },
    blue: { fighter: blue, plan: defaultGamePlan() },
    // Card position decides the distance, which is one of the things having a card buys.
    rounds: bout.rounds,
    seed: `${getWorld(db).seed}:${boutId}`,
  });

  const after = applyAftermath({
    result,
    red,
    blue,
    day,
    divisionId: red.divisionId,
    promotionId: red.promotionId ?? promotion.id,
    isTitleFight,
    rng: rng.fork('aftermath'),
  });

  // The belt moves, or it does not. A draw leaves it with the champion, which is the rule.
  let titleChangedHands = false;
  if (isTitleFight && result.winnerId && champion !== (result.winnerId as string)) {
    db.promotions.upsert(
      setChampion(promotion, red.divisionId, result.winnerId) as never,
    );
    titleChangedHands = true;
  }

  const redWon = result.winnerId === red.id;
  const developed = {
    red: settleRosterFighter(
      db,
      develop(db, after.red, day, rng.fork(`dev:${red.id}`), lastSeen),
      redWon,
      day,
      bout.position,
    ),
    blue: settleRosterFighter(
      db,
      develop(db, after.blue, day, rng.fork(`dev:${blue.id}`), lastSeen),
      result.winnerId === blue.id,
      day,
      bout.position,
    ),
  };

  const news: NewsItem[] = [];
  const winner = result.winnerId === red.id ? developed.red : result.winnerId === blue.id ? developed.blue : undefined;
  const loser = winner ? (winner.id === red.id ? developed.blue : developed.red) : undefined;

  const item = fightNews({
    day,
    boutId,
    winnerName: winner ? displayName(winner) : undefined,
    loserName: loser ? displayName(loser) : undefined,
    winnerId: winner?.id,
    loserId: loser?.id,
    method: result.method,
    round: result.round,
    submissionName: result.submissionName,
    divisionId: red.divisionId,
    promotionId: promotion.id,
    winnerRank: winner ? rankOfId(winner.id) : undefined,
    loserRank: loser ? rankOfId(loser.id) : undefined,
    isTitleFight,
    titleChangedHands,
  });
  if (item) news.push(item);

  if (winner) {
    const streak = streakNews({
      day,
      fighterId: winner.id,
      name: displayName(winner),
      streak: winner.summary.streak,
      divisionId: winner.divisionId,
    });
    if (streak) news.push(streak);
  }

  // Careers end, and they end after a fight, which is when a fighter actually decides.
  const retireRng = rng.fork('retire');
  for (const fighter of [developed.red, developed.blue]) {
    const finalised = finalise(db, fighter, day, retireRng.fork(fighter.id as string), promotion);
    if (finalised.news) news.push(finalised.news);
    db.fighters.upsert(finalised.fighter as Fighter & Entity);
  }

  /*
   * The medical suspension, now written down.
   *
   * This used to live only in the in-memory `readyOn` Map, which is rebuilt at the top of
   * every `advanceWorld` call and discarded at the bottom of it — so a fighter knocked out
   * cold could be booked again by the very next step. Persisting it on the fighter makes the
   * suspension a property of the person rather than of whichever loop is running, and means
   * the player's own card honours it too.
   */
  const redLost = result.winnerId !== undefined && result.winnerId !== red.id;
  const blueLost = result.winnerId !== undefined && result.winnerId !== blue.id;
  for (const [fighter, lost] of [
    [after.red, redLost],
    [after.blue, blueLost],
  ] as const) {
    const until = day + readinessDelay(fighter, lost ? result.method : undefined);
    readyOn.set(fighter.id as string, until);
    const stored = db.fighters.findById(fighter.id as string) as Fighter | undefined;
    if (stored) db.fighters.upsert({ ...stored, readyOnDay: until } as Fighter & Entity);
  }

  return { news, result };
}

/**
 * Pay an AI fighter, and move their deal on.
 *
 * The world simulated fights, ageing, belts and retirement while every fighter in it had no
 * contract, no manager and no money — so the player was the only person in the sport whose
 * deal could expire, and the market they negotiated in was one-sided. This closes it.
 *
 * Deliberately lightweight. The player's economy is itemised because a player reads it; the
 * roster's is a single net figure, because four hundred fighters of full bookkeeping every
 * tick is the thing doc 17 flagged as the reason not to do this naively.
 */
function settleRosterFighter(
  db: GameDb,
  fighter: Fighter,
  won: boolean,
  day: number,
  position: CardPosition = 'mainCard',
): Fighter {
  const promotion = fighter.promotionId
    ? (db.promotions.findById(fighter.promotionId) as Promotion | undefined)
    : undefined;
  if (!promotion) return fighter;

  const agreement = fighter.agreementId
    ? (db.agreements.findById(fighter.agreementId as string) as
        | (PromotionalAgreement & Entity)
        | undefined)
    : undefined;

  // The signed terms, not what they are worth today — the whole point of a contract.
  const terms = agreement
    ? { showPurse: agreement.showPurse, winBonus: agreement.winBonus }
    : defaultTerms(fighter, promotion);
  const purse = purseFor(terms, promotion, position);
  const gross = purse.show + (won ? purse.win : 0);

  // One multiplier rather than the full chain: roughly what is left after everybody's cut and
  // a camp. The shape is what matters here, not the itemisation.
  const net = gross * 0.35 - campCost(8, 55);

  if (agreement) {
    db.agreements.upsert(consumeFight(agreement) as PromotionalAgreement & Entity);
  }

  return {
    ...fighter,
    bank: round1(fighter.bank + net),
    lifetimeGross: round1(fighter.lifetimeGross + gross),
    lifetimeNet: round1(fighter.lifetimeNet + net),
    resentment: agreement
      ? resentmentFrom(contractFairness(agreement, fighter, promotion))
      : fighter.resentment,
  };
  void day;
}

/**
 * Contracts end, and somebody signs them next.
 *
 * Without this the roster would drift into a world where every deal had run out and nobody
 * was under contract to anybody. A free agent takes the best offer on the table, which is
 * usually the promotion they were already at — a monopsony rehiring its own.
 */
function resolveFreeAgency(db: GameDb, day: number, rng: Rng, promotions: readonly Promotion[]): NewsItem[] {
  const news: NewsItem[] = [];
  const fighters = db.fighters.findAll() as Fighter[];

  for (const fighter of fighters) {
    if (fighter.retiredDay !== undefined) continue;

    const agreement = fighter.agreementId
      ? (db.agreements.findById(fighter.agreementId as string) as
          | (PromotionalAgreement & Entity)
          | undefined)
      : undefined;

    const promotion = fighter.promotionId
      ? (db.promotions.findById(fighter.promotionId) as Promotion | undefined)
      : undefined;

    // Under contract with fights left: nothing to do.
    if (agreement && promotion) {
      const isChampion = promotion.champions[fighter.divisionId] === fighter.id;
      if (!agreementStatus(agreement, day, { isChampion }).expired) continue;
    }

    // Cut, or out of contract. Where do they land?
    const fRng = rng.fork(`fa:${fighter.id}:${day}`);
    const candidates = promotions.filter((p) => p.divisions.includes(fighter.divisionId));
    if (candidates.length === 0) continue;

    // Weighted toward whoever they were already with, then by prestige they can justify.
    const worth = marketValue(fighter, candidates[0]!);
    const affordable = candidates.filter(
      (p) => marketValue(fighter, p) <= p.budget * 0.06 || p.tier === 'developmental',
    );
    const pool = affordable.length > 0 ? affordable : candidates;
    const next = promotion && fRng.chance(0.55) && pool.includes(promotion) ? promotion : fRng.pick(pool);

    const terms = defaultTerms(fighter, next);
    const signed = createAgreement({
      fighter,
      promotion: next,
      terms: {
        showPurse: terms.showPurse,
        winBonus: terms.winBonus,
        signingBonus: 0,
        revenuePoints: 0,
        fightsOwed: fRng.int(3, 5),
        championshipExtension: next.tier === 'global' || next.tier === 'major' ? 'standard' : 'none',
        matchingRights: fRng.chance(0.5),
        exclusive: next.tier !== 'regional' && next.tier !== 'developmental',
        outsideBouts: next.tier === 'regional' || next.tier === 'developmental' ? 2 : 0,
      },
      day,
    });
    db.agreements.upsert(signed as PromotionalAgreement & Entity);
    db.fighters.upsert({
      ...fighter,
      promotionId: next.id,
      agreementId: signed.id,
      resentment: 0,
    } as Fighter & { id: string });

    // Only worth reporting when somebody actually moved.
    if (promotion && next.id !== promotion.id) {
      news.push(
        signingNews({
          day,
          fighterId: fighter.id,
          name: displayName(fighter),
          divisionId: fighter.divisionId,
          promotionId: next.id,
          fromName: promotion.shortName,
          toName: next.shortName,
        }),
      );
    }
    void worth;
  }

  return news;
}

/** Between fights, fighters train and age — the same loop the player is in. */
function develop(
  db: GameDb,
  fighter: Fighter,
  day: number,
  rng: Rng,
  lastSeen: Map<string, number>,
): Fighter {
  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const coach = fighter.headCoachId
    ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
    : undefined;

  const trained = applyTraining({
    fighter,
    focuses: [rng.pick(['striking', 'wrestling', 'submissions', 'conditioning', 'strategy'] as const)],
    weeks: 8,
    gym,
    coach,
    day,
    rng,
  }).fighter;

  // Age over real elapsed time. Ageing a fixed amount per fight double-counts it: a busy
  // fighter would lose several extra years of physical prime purely for having fought often.
  const since = lastSeen.get(fighter.id as string) ?? day;
  lastSeen.set(fighter.id as string, day);
  return applyAgeing(trained, since, day, rng).fighter;
}

function finalise(
  db: GameDb,
  fighter: Fighter,
  day: number,
  rng: Rng,
  _promotion: Promotion,
): { fighter: Fighter; news?: NewsItem } {
  if (!shouldRetire(fighter, day, rng)) return { fighter };

  const reason = retirementReason(fighter, day);

  /*
   * Vacate every belt they hold, at every promotion.
   *
   * Checking only the *card's* promotion was the bug: a fighter retiring on an AFC show who
   * held a VMA belt kept it forever, and that division could never stage another title fight
   * because retirees are filtered out of every future card. Scanning all promotions is
   * cheap and cannot get this wrong.
   */
  const allPromotions = db.promotions.findAll() as unknown as Promotion[];
  const heldBelts = allPromotions.filter((p) => p.champions[fighter.divisionId] === fighter.id);
  const wasChampion = heldBelts.length > 0;

  /*
   * A retiring champion vacates.
   *
   * Without this the belt stayed on somebody who is filtered out of every future card, so
   * the division could never stage another title fight — measured, six of twelve AFC belts
   * were held by retired fighters after ten years and those divisions were permanently dead.
   * `setChampion(p, div, undefined)` existed, was unit-tested, and had no caller.
   */
  for (const held of heldBelts) {
    db.promotions.upsert(setChampion(held, fighter.divisionId, undefined) as never);
  }

  return {
    fighter: { ...fighter, retiredDay: day, notes: reason },
    news: retirementNews({
      day,
      fighterId: fighter.id,
      name: displayName(fighter),
      reason,
      divisionId: fighter.divisionId,
      record: recordString(fighter.summary),
      wasChampion,
    }),
  };
}

/** Take every belt off anybody who has retired. */
function vacateAbandonedBelts(db: GameDb): void {
  for (const promotion of db.promotions.findAll() as unknown as Promotion[]) {
    let updated = promotion;
    for (const [divisionId, championId] of Object.entries(promotion.champions)) {
      if (!championId) continue;
      const champion = db.fighters.findById(championId as string) as Fighter | undefined;
      if (!champion || champion.retiredDay !== undefined) {
        updated = setChampion(updated, divisionId as never, undefined);
      }
    }
    if (updated !== promotion) db.promotions.upsert(updated as never);
  }
}

/** Replace retirees so divisions do not quietly empty out over a long career. */
function replenish(
  db: GameDb,
  day: number,
  rng: Rng,
  promotions: readonly Promotion[],
): NewsItem[] {
  const news: NewsItem[] = [];
  const all = db.fighters.findAll() as Fighter[];

  for (const division of DIVISIONS) {
    const active = all.filter(
      (f) => f.divisionId === division.id && f.retiredDay === undefined,
    );
    const target = divisionTarget(division.sex);

    for (let i = active.length; i < target; i++) {
      const promotion = rng.pick(promotions);
      const born = generateFighter(rng.fork(`gen:${day}:${division.id}:${i}`), {
        id: `gen_${day}_${division.id}_${i}`,
        divisionId: division.id,
        sex: division.sex,
        day,
        promotionId: promotion.id,
      });
      db.fighters.upsert(born as Fighter & Entity);
      news.push(
        debutNews({
          day,
          fighterId: born.id,
          name: displayName(born),
          divisionId: division.id,
          promotionId: promotion.id,
          promotionName: promotion.shortName,
        }),
      );
    }
  }
  return news;
}

/**
 * Age everyone the loop did not touch.
 *
 * A fighter who was never booked still gets a year older, and a fighter who was booked has
 * already been aged up to their last bout — `lastSeen` is what stops the second group being
 * aged twice over the same days.
 */
function ageEveryone(
  db: GameDb,
  fromDay: number,
  toDay: number,
  exceptId: FighterId,
  lastSeen?: Map<string, number>,
): void {
  const world = getWorld(db);
  for (const fighter of db.fighters.findAll() as Fighter[]) {
    if (fighter.id === exceptId || fighter.retiredDay !== undefined) continue;
    const since = lastSeen?.get(fighter.id as string) ?? fromDay;
    if (since >= toDay) continue;
    const rng = createRng(`${world.seed}:age:${fighter.id}:${since}`);
    const aged = applyAgeing(fighter, since, toDay, rng);
    if (aged.fighter !== fighter) db.fighters.upsert(aged.fighter as Fighter & Entity);
  }
}

// --- Storage ---------------------------------------------------------------------------------

/** Add to the feed and trim it, so a twenty-year career does not grow an unbounded table. */
export function appendNews(db: GameDb, items: readonly NewsItem[]): NewsItem[] {
  if (items.length === 0) return readNews(db);
  for (const item of items) db.news.upsert(item as StoredNews);

  const trimmed = trimFeed(db.news.findAll() as StoredNews[]);
  const keep = new Set(trimmed.map((i) => i.id as string));
  for (const existing of db.news.findAll() as StoredNews[]) {
    if (!keep.has(existing.id as string)) db.news.remove(existing.id as string);
  }
  return trimmed;
}

export const readNews = (db: GameDb): NewsItem[] => trimFeed(db.news.findAll() as StoredNews[]);

/** Record something the player did, so their own career reads back as part of the world. */
export function recordPlayerNews(db: GameDb, items: readonly NewsItem[]): void {
  appendNews(
    db,
    items.map((item) => ({ ...item, involvesPlayer: true })),
  );
}

/** Every division the world currently keeps alive, for a "is my division healthy" read. */
export function divisionHealth(db: GameDb, divisionId: DivisionId): number {
  return (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.divisionId === divisionId && f.retiredDay === undefined,
  ).length;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * What the promotion paid the card, so the night's profit is a real number.
 *
 * Reads each fighter's signed terms rather than their market value, for the same reason
 * `settleFight` does: the whole economic grievance of the sport is that terms are fixed while
 * worth is not, and a promotion's costs are its contracts.
 */
function cardPurses(db: GameDb, card: readonly CardBout[]): number {
  let total = 0;
  for (const bout of card) {
    for (const id of [bout.redId, bout.blueId]) {
      const fighter = db.fighters.findById(id as string) as Fighter | undefined;
      if (!fighter) continue;
      const purse = currentPurse(db, fighter, bout.position);
      // Show money is paid either way; the win bonus is paid once, so half the card collects
      // it. Averaging is both correct in aggregate and cheaper than resolving who won here.
      if (purse) total += purse.show + purse.win * 0.5;
    }
  }
  return Math.round(total);
}
