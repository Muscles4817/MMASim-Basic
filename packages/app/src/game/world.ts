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
  agreementStatus,
  campCost,
  consumeFight,
  contractFairness,
  createAgreement,
  debutNews,
  defaultGamePlan,
  defaultTerms,
  displayName,
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
  type Coach,
  type DivisionId,
  type Fighter,
  type FighterId,
  type Gym,
  type NewsItem,
  type Promotion,
  type PromotionalAgreement,
  type Rng,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';

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
 * Hard ceiling on fights simulated in a single call.
 *
 * The player is waiting for a screen. A twelve-week camp is six steps and ~36 fights, which
 * is comfortable; a player who somehow advances five years at once gets a world that moved
 * plausibly rather than a frozen tab. When the budget binds, time still passes and people
 * still age — it is the fights that thin out, which is the right thing to lose.
 */
const MAX_FIGHTS_PER_CALL = 220;

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
      news.push(...replenish(db, day, rng, promotions));
      // Deals run out across the roster too, so the market has other people in it.
      news.push(...resolveFreeAgency(db, day, rng, promotions));
    }

    const available = (db.fighters.findAll() as Fighter[]).filter(
      (f) =>
        f.id !== exceptId &&
        f.retiredDay === undefined &&
        (readyOn.get(f.id as string) ?? 0) <= day,
    );

    for (let card = 0; card < CARDS_PER_STEP; card++) {
      if (available.length < 2) break;
      if (fights >= MAX_FIGHTS_PER_CALL) {
        truncated = true;
        break;
      }

      const item = runOneBout({
        db,
        day,
        rng: rng.fork(`bout:${day}:${card}`),
        promotions,
        available,
        readyOn,
        lastSeen,
        exceptId,
      });
      if (!item) continue;
      fights++;
      if (item.news) news.push(...item.news);
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

interface BoutContext {
  db: GameDb;
  day: number;
  rng: Rng;
  promotions: readonly Promotion[];
  available: Fighter[];
  readyOn: Map<string, number>;
  lastSeen: Map<string, number>;
  exceptId: FighterId;
}

/** One bout, start to finish, including everything it changes. */
function runOneBout(ctx: BoutContext): { news: NewsItem[] } | undefined {
  const { db, day, rng, promotions, available, readyOn, lastSeen } = ctx;

  const promotion = rng.pick(promotions);
  const subject = rng.pick(available);
  const offers = offerOpponents(subject, available, promotion, day, rng.fork('match'));
  if (offers.length === 0) return undefined;

  const opponent = rng.pick(offers).opponent;
  const red = db.fighters.findById(subject.id as string) as Fighter | undefined;
  const blue = db.fighters.findById(opponent.id as string) as Fighter | undefined;
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
  const redRank = rankOfId(red.id);
  const blueRank = rankOfId(blue.id);

  // A title is on the line when the champion is in there against a ranked contender.
  const champion = promotion.champions[red.divisionId];
  const isTitleFight =
    champion !== undefined &&
    (champion === (red.id as string) || champion === (blue.id as string)) &&
    (redRank !== undefined || blueRank !== undefined);

  const boutId = `world:${day}:${red.id}:${blue.id}`;
  const result = simulateFight({
    boutId,
    red: { fighter: red, plan: defaultGamePlan() },
    blue: { fighter: blue, plan: defaultGamePlan() },
    rounds: isTitleFight ? 5 : 3,
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
    ),
    blue: settleRosterFighter(
      db,
      develop(db, after.blue, day, rng.fork(`dev:${blue.id}`), lastSeen),
      result.winnerId === blue.id,
      day,
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

  const redLost = result.winnerId !== undefined && result.winnerId !== red.id;
  const blueLost = result.winnerId !== undefined && result.winnerId !== blue.id;
  readyOn.set(red.id as string, day + readinessDelay(after.red, redLost ? result.method : undefined));
  readyOn.set(blue.id as string, day + readinessDelay(after.blue, blueLost ? result.method : undefined));

  return { news };
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
): Fighter {
  const promotion = fighter.promotionId
    ? (db.promotions.findById(fighter.promotionId) as Promotion | undefined)
    : undefined;
  if (!promotion) return fighter;

  const terms = defaultTerms(fighter, promotion);
  const purse = purseFor(terms, promotion);
  const gross = purse.show + (won ? purse.win : 0);

  // One multiplier rather than the full chain: roughly what is left after everybody's cut and
  // a camp. The shape is what matters here, not the itemisation.
  const net = gross * 0.35 - campCost(8, 55);

  const agreement = fighter.agreementId
    ? (db.agreements.findById(fighter.agreementId as string) as
        | (PromotionalAgreement & Entity)
        | undefined)
    : undefined;

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
  promotion: Promotion,
): { fighter: Fighter; news?: NewsItem } {
  if (!shouldRetire(fighter, day, rng)) return { fighter };

  const reason = retirementReason(fighter, day);
  const wasChampion = promotion.champions[fighter.divisionId] === fighter.id;

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
  void db;
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
