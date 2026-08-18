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
  activityBreach,
  bonusPoolFor,
  championshipId,
  contenderQueue,
  crown,
  defend,
  lastContested,
  describeVacancy,
  vacate,
  chargeCosts,
  DELIVERY_MEMORY,
  broadcastFor,
  buildCard,
  campCost,
  consumeFight,
  contractFairness,
  createAgreement,
  debutNews,
  planFor,
  pickTrainingFocus,
  defaultTerms,
  displayName,
  fighterAge,
  drawWeight,
  eventId,
  eventName,
  fightNews,
  generateFighter,
  offerOpponents,
  rankDivision,
  readinessDelay,
  newsId,
  nextContender,
  releaseRisk,
  chaseUplift,
  clamp01,
  daysIdle,
  inboxId,
  promotionPatience,
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
  type Championship,
  type VacancyReason,
  type CardPosition,
  type Coach,
  type DivisionId,
  type FightNight,
  type FightResult,
  type Fighter,
  type FighterId,
  type PromotionId,
  type Gym,
  type NewsItem,
  type Promotion,
  type PromotionalAgreement,
  type Rng,
  eventRevenue,
  expectedDemand,
  venueFor,
  settleNight,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { currentPurse } from './money';
import { raise, scanForInbox } from './inbox';

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
 * Fights the loop will simulate per fortnight of elapsed time.
 *
 * The flat cap above was written when a card was one or two bouts, and the 2026 roster made it
 * bind immediately: a full nine-bout card times three cards a fortnight is 27 fights, so a
 * one-year call wants ~700 and got 220 — which truncated the world to six cards a year for the
 * leader against a real schedule of twenty-odd, and quietly starved every division of activity.
 *
 * Proportional to the span requested rather than flat, because the two callers want different
 * things: a twelve-week camp is six steps and should cost about what it always did, while a
 * long simulation should be allowed to actually run. `MAX_FIGHTS_PER_CALL` survives as the
 * backstop against somebody advancing twenty years in one go.
 */
const FIGHTS_PER_STEP_BUDGET = 30;

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
 * Days between title fights for the same belt.
 *
 * Roughly two and a half defences a year at the ceiling, which is what a busy champion actually
 * manages. It is also what makes a *reign* a thing rather than a coin flip repeated fortnightly.
 */
const TITLE_DEFENCE_INTERVAL_DAYS = 150;

/**
 * Bouts a fighter will take in a rolling twelve months.
 *
 * Three is already busy by modern standards — the elite average is closer to two — but the
 * bottom of a roster genuinely does fight more, and a hard ceiling here is what stops a
 * favourite accumulating a 63-fight record in a decade.
 */
const MAX_BOUTS_PER_YEAR = 3;

/**
 * Bodies each division tries to keep across the whole sport.
 *
 * This was a constant — 9 for men, 6 for women — and `replenish` counts **every promotion
 * together**, so a division holding seventy-odd fighters at the start of a save had to lose sixty
 * of them before a single replacement was generated. Measured over ten simulated years: the
 * active roster fell from 858 to 232, light heavyweight from 74 to 19, fighters rated 70 or
 * better from 48 to 12, and the intake produced **one fighter in the entire decade**.
 *
 * It cannot be a constant, either, because the eras are not the same size: the 2026 world seeds
 * around seventy per men's division and the 2020 world around eleven, so any single number
 * starves one or inflates the other several-fold. The target is therefore the shape the save was
 * *born* with, recorded at creation, with a conservative floor for saves made before that existed
 * and for a division the seed did not populate at all.
 */
const DIVISION_FLOOR = (sex: 'male' | 'female'): number => (sex === 'female' ? 6 : 9);

const divisionTargetFor = (
  world: { divisionTargets?: Record<string, number> },
  divisionId: string,
  sex: 'male' | 'female',
): number => Math.max(DIVISION_FLOOR(sex), world.divisionTargets?.[divisionId] ?? 0);

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
/**
 * What the world must not touch, because the player is doing it themselves.
 *
 * Was a bare `FighterId`, which is the whole assumption of fighter mode: exactly one person is
 * the player's and everything else is the world's. A promoter owns a *promotion* — the world
 * must not book its cards, because the player books them, and it must still run everybody
 * else's.
 */
export interface WorldExclusion {
  /** The player's fighter, in fighter mode. Never booked by the world. */
  fighterId?: FighterId;
  /** The player's promotion, in promoter mode. The world runs no cards for it. */
  promotionId?: PromotionId;
  /**
   * Whether the player already has a fight booked.
   *
   * Passed in rather than read here, and the reason is a dependency rather than a preference:
   * the booking lives in session state owned by `career.ts`, and `career.ts` imports this
   * module. Reaching the other way would close the cycle. `clock.ts` sits above both and is the
   * natural place to answer the question.
   *
   * It matters because a fighter in camp is not idle whatever the calendar says, and a
   * promotion chasing somebody for a fight they have already taken is nonsense.
   */
  playerHasBooking?: boolean;
}

export function advanceWorld(
  db: GameDb,
  fromDay: number,
  toDay: number,
  except: FighterId | WorldExclusion,
): WorldAdvance {
  // Accepts a bare id so fighter mode's dozens of call sites and tests stay as they are; the
  // object form is what promoter mode passes.
  const exclusion: WorldExclusion = typeof except === 'object' ? except : { fighterId: except };
  const exceptId = exclusion.fighterId;
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

  /*
   * Scaled to the span, capped by the absolute backstop. See `FIGHTS_PER_STEP_BUDGET`.
   */
  const steps = Math.max(1, Math.ceil((toDay - fromDay) / STEP_DAYS));
  const fightBudget = Math.min(MAX_FIGHTS_PER_CALL * 12, steps * FIGHTS_PER_STEP_BUDGET);

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
      news.push(...replenish(db, day, rng, promotions));
      // Deals run out across the roster too, so the market has other people in it.
      news.push(...resolveFreeAgency(db, day, rng, promotions, exceptId));
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

    /*
     * Every card in a step used to be stamped with the step's own `day`, and that one fact was
     * three defects.
     *
     * `eventId` is `evt_${promotionId}_${day}`, and the promotion is drawn per card, so two of
     * the three cards in a fortnight landing on the same promotion produced the *same event id* —
     * and `db.events.upsert` silently overwrote the first night after it had already been
     * simulated and written to everybody's record. Measured over a simulated year of the 2020
     * world: 65 same-day record pairs across 139 fighters, 52 of them the identical bout written
     * twice, against a schedule in which no fighter appeared twice on any day. The schedule was
     * clean because the evidence had been overwritten; the records were not.
     *
     * Three shows on one date was also simply wrong about the sport. Cards inside a step now land
     * on different dates, spread across whatever part of the step is actually being simulated so
     * a short call cannot date a card past the day it was asked to stop at.
     */
    const span = Math.min(STEP_DAYS, toDay - day);
    const cardsThisStep = Math.max(1, Math.min(CARDS_PER_STEP, MAX_CARDS_PER_STEP, span));

    for (let card = 0; card < cardsThisStep; card++) {
      if (available.length < 2) break;
      if (fights >= fightBudget) {
        truncated = true;
        break;
      }

      const cardDay = day + Math.floor((card * span) / cardsThisStep);

      /*
       * A night, not a loose bout.
       *
       * The world used to simulate individual fights with no container, which meant card
       * position did not exist, the bonus pool had nowhere to sit, and revenue points — which
       * attach to an *event* — could never pay out. Bouts are collected, ordered by draw
       * weight with a title fight always headlining, and then run as one card.
       */
      const bookable = promotions.filter((p) => p.id !== exclusion.promotionId);
      if (bookable.length === 0) break;
      const promotion = pickPromotion(bookable, rng.fork(`who:${day}:${card}`));
      const built = buildNight({
        db,
        day: cardDay,
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

  /*
   * The bill for existing.
   *
   * `budget` was written in exactly one place in the codebase — inside `settleNight`, from a
   * card's profit — so a promotion that ran no cards had no outgoings at all. That made doing
   * nothing strictly correct under pressure and made hoarding a roster free, which were two of
   * the dominant strategies the design review found. Every cost in the model was incurred by
   * *doing something*.
   *
   * Charged to every promotion including the player's: this is a rule of the sport rather than
   * a difficulty applied to whoever is playing.
   */
  chargePromotions(db, toDay - fromDay);

  // And the deals of anybody the world forgot to book. See `enforceActivity`.
  news.push(...enforceActivity(db, fromDay, toDay, rng.fork('breach'), exceptId));

  // The player's own side of the same question, which is a conversation rather than a rule.
  news.push(
    ...playerActivity(db, toDay, exceptId, exclusion.playerHasBooking ?? false, rng.fork('chase')),
  );

  /*
   * Anything that now needs the player.
   *
   * Raised here rather than on a screen, because the whole point is that these arrive *while
   * time is passing* — and because `advanceTo` stops the clock on an unresolved decision, which
   * it can only do if the decision exists by the time the step finishes.
   */
  /*
   * Reconcile the belts last, so the world always leaves itself consistent.
   *
   * This was a quarterly sweep near the top of the step, which left the champion map stale in
   * two ways at once: for up to three months at a time, and — worse — for the *rest of every
   * step*, because free agency runs afterwards and can move a champion out of the promotion
   * whose belt they are still recorded as holding. A fighter listed as champion somewhere they
   * have already left is a belt nobody can defend and a division that cannot stage a title
   * fight. Running it at the end is both cheap and the only placement that cannot be stale.
   */
  news.push(...vacateAbandonedBelts(db, toDay));

  scanForInbox(db, toDay);

  const stored = appendNews(db, news);
  db.save();

  return { fights, news: stored, truncated };
}

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
  exceptId: FighterId | undefined;
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
  const roster = available.filter(
    (f) =>
      f.promotionId === promotion.id &&
      // Readiness is re-checked against *this card's* date, not the step's. `available` is built
      // once per fortnight, so a fighter cleared on the 8th was treated as bookable on the 1st —
      // a medical gate with a two-week tolerance, which is the same class of mistake as the
      // suspension map that used to be thrown away at the end of every call.
      Math.max(readyOn.get(f.id as string) ?? 0, f.readyOnDay ?? 0) <= day,
  );

  /*
   * A vacant belt is the first thing a promotion books.
   *
   * This used to be a rider on the random matchmaker — `contestsVacant && seeds.length === 0`,
   * which only fired if the randomly-picked first subject happened to be in the empty division.
   * Across seventy-four divisions that essentially never happened, and belts stayed vacant
   * forever: measured, thirty-one of seventy-four empty after four years, in a sport where a
   * promotion leaves a division without a champion for months at most.
   *
   * So it is deliberate and it goes first, from the two best available contenders — which is
   * exactly what a matchmaker does when a title comes free.
   */
  for (const divisionId of promotion.divisions) {
    // Up to two per night. A promotion with several empty divisions is in an unusual situation
    // and books its way out of it quickly; more than two title fights on one card is a gimmick.
    if (seeds.length >= 2) break;
    if (promotion.champions[divisionId] !== undefined) continue;

    const ranked = rankDivision(
      roster.filter((f) => !used.has(f.id as string)),
      divisionId,
      promotion.id,
      day,
      undefined,
      db.promotions.findAll() as unknown as Promotion[],
    );
    /*
     * Two, because two is what a title fight takes.
     *
     * This was four, reasoning that a belt should only be contested in a credible division —
     * and it is measured against the *available* roster, of which roughly a third of any
     * division is bookable on a given date. A six-deep division therefore almost never had four
     * free at once, so thin divisions stayed vacant indefinitely: measured, ten of thirteen
     * vacancies had stood for over a year and one for five and a half.
     */
    if (ranked.length < 2) continue;

    // Ordered by this promotion's own priorities rather than by the bare ranking, so a
    // spectacle promotion fills a vacant belt with the fight it wants to sell.
    const queued = contenderQueue({ ranked, promotion });
    const [first, second] = [queued[0]!.fighter, queued[1]!.fighter];
    used.add(first.id as string);
    used.add(second.id as string);

    seeds.push({
      boutId: `night:${day}:${promotion.id}:vacant`,
      redId: first.id,
      blueId: second.id,
      divisionId,
      isTitleFight: true,
      draw: drawWeight({
        promotion,
        red: first,
        blue: second,
        heat: 0,
        isRivalry: false,
        isTitleFight: true,
      }),
    });
  }

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

    /*
     * A belt is contested a few times a year, not on every card it can be.
     *
     * Without a cooldown the champion was put in a title fight essentially every time the
     * matchmaker picked them, and since a title fight is close to a coin flip the belt churned:
     * measured, a **median reign of 98 days** and 605 of 789 reigns ending without a single
     * defence. Real champions defend two or three times a year and the long reign — the thing
     * a division's history is actually made of — could never happen.
     *
     * Read off the lineage, which is the only place the last title bout is recorded.
     */
    const title =
      champion !== undefined
        ? (db.championships.findById(championshipId(promotion.id, subject.divisionId)) as
            | Championship
            | undefined)
        : undefined;
    // From the last time the belt was *contested*, not from when the reign began — see
    // `Reign.lastContestedDay`.
    const lastTitleBout = title ? lastContested(title) : 0;
    const beltIsFree = day - lastTitleBout >= TITLE_DEFENCE_INTERVAL_DAYS;

    /*
     * A title fight is the champion against the contender *this promotion* would pick.
     *
     * It used to be the champion against whoever the matchmaker happened to draw, which is why
     * a belt changed hands on a coin flip roughly every hundred days: the challenger was as
     * likely to be the twelfth-best fighter in the division as the first, and `rankDivision` —
     * which has existed since the ladder shipped — was never consulted by anything.
     *
     * Whose queue it is matters as much as that there is one. A tournament promotion's next
     * contender is the number one; the biggest promotion in the sport takes rankings seriously
     * for two or three places and then books whoever people want to watch.
     */
    let isTitleFight = false;
    if (champion !== undefined && beltIsFree && (champion === subject.id || champion === opponent.id)) {
      const challengerId = champion === subject.id ? opponent.id : subject.id;
      const wanted = nextContender({
        ranked: rankDivision(
          db.fighters.findAll() as Fighter[],
          subject.divisionId,
          promotion.id,
          day,
          champion as FighterId,
          db.promotions.findAll() as unknown as Promotion[],
        ),
        promotion,
        championId: champion as string,
      });
      isTitleFight = wanted === undefined || wanted.fighter.id === challengerId;
    }

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

  /*
   * Nobody on tonight's card is available for another card in this step.
   *
   * `used` only ever kept a fighter off *this* night. `available` is built once per fortnight and
   * was never pruned, so the same fighter could be matched onto two of the three cards in a step —
   * which, before cards had distinct dates, meant two bouts on one day, and now would mean two
   * bouts inside a fortnight. Both are impossible in the sport, and the second is the one that
   * would have survived the date fix on its own.
   */
  if (used.size > 0) {
    for (let i = available.length - 1; i >= 0; i--) {
      if (used.has(available[i]!.id as string)) available.splice(i, 1);
    }
  }

  if (seeds.length === 0) return undefined;

  const card = buildCard(seeds);
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
    // Booked to the crowd it will actually draw. See `venueFor`: both card runners used to
    // pick uniformly from one list, so the smallest promotion in the game took an
    // 18,000-seat arena as often as the global one and paid arena overheads to put four
    // hundred people in it.
    venue: venueFor(
      promotion,
      expectedDemand(promotion, headlineDraw, card.length),
      rng.fork('venue'),
    ),
    broadcast,
    status: 'complete',
    bouts: card,
    // A promotion pays what it can afford to. See `bonusPoolFor` for why the floor matters
    // as much as the rate.
    bonusPool: bonusPoolFor(promotion),
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

    /*
     * The award goes on the record as well as into the bank, exactly as it does on the player's
     * own cards. Without this the world's fighters would build standing purely on results while
     * the player's benefited from bonuses too, and the rankings would quietly favour the player
     * for reasons nobody could see.
     */
    const kind: 'performance' | 'fight' = awards.performanceOfTheNight.includes(fighter.id)
      ? 'performance'
      : 'fight';
    const record = fighter.record.map((entry) =>
      entry.day === day && entry.promotionId === promotion.id ? { ...entry, bonus: kind } : entry,
    );

    db.fighters.upsert({
      ...fighter,
      record,
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
      // The headline sells the night; the depth of the card stops it being discounted.
      headlineDraw,
      bouts: card.length,
      purses: cardPurses(db, card),
      bonuses: night.bonusPool,
    }),
    results: results.map((r) => r.result),
    recentDelivery: current.recentDelivery,
  });
  db.promotions.upsert(rememberDelivery(settled.promotion, settled.delivered) as Promotion & Entity);

  return { fights, news };
}

/**
 * One bout on a card, start to finish, including everything it changes.
 *
 * Exported for promoter mode, which runs the player's own cards and must produce exactly the
 * same consequences as the world does — ranks, belts, ageing, retirement, suspensions and pay.
 * A second implementation would drift within a week and the divergence would be invisible.
 */
export function runCardBout(ctx: {
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
    db.promotions.findAll() as unknown as Promotion[],
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
    // Both corners bring a plan built from who they are and who is in front of them. Every
    // fight the world simulates used to run on the neutral default (docs/19 §11).
    red: { fighter: red, plan: planFor(red, blue) },
    blue: { fighter: blue, plan: planFor(blue, red) },
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
    promotionPrestige: promotion.prestige,
    isTitleFight,
    rng: rng.fork('aftermath'),
  });

  // The belt moves, or it does not. A draw leaves it with the champion, which is the rule.
  /*
   * The belt moves, or it is defended, and either way the lineage records it.
   *
   * Both halves matter. A championship used to be one id in a map, so a belt changing hands
   * overwrote the only trace of who had held it — there was no reign length, no defence count,
   * and nothing the sport could say about a division's history.
   */
  let titleChangedHands = false;
  if (isTitleFight) {
    const title = db.championships.findById(
      championshipId(promotion.id, red.divisionId),
    ) as Championship | undefined;

    if (result.winnerId && champion !== (result.winnerId as string)) {
      db.promotions.upsert(setChampion(promotion, red.divisionId, result.winnerId) as never);
      titleChangedHands = true;
      if (title) {
        db.championships.upsert(
          crown({
            title,
            fighterId: result.winnerId,
            day,
            wonBy: {
              opponentId: champion as FighterId | undefined,
              method: result.method,
              round: result.round,
            },
          }) as Championship & Entity,
        );
      }
    } else if (title && result.winnerId) {
      // A champion who wins, or a draw, keeps it — and a win is a defence, which is the number
      // the sport actually measures a reign by.
      db.championships.upsert(defend(title, day) as Championship & Entity);
    }
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

    /*
     * And some of them are ended for you. Checked after `finalise` so a fighter who has just
     * retired is not also cut — being released on your way out of the sport is noise, not a
     * story — and only after a loss, because a promotion does not cut a winner.
     */
    if (finalised.fighter.retiredDay === undefined && finalised.fighter.summary.streak < 0) {
      const cut = releaseIfCut(
        db,
        finalised.fighter,
        promotion,
        day,
        retireRng.fork(`cut:${fighter.id}`),
      );
      if (cut) news.push(cut);
    }
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
 * Cut a fighter who has run out of rope.
 *
 * `releaseRisk` had no callers anywhere — not in the world, not in the UI. So no promotion in
 * the game ever released anybody, which quietly removed the entire downward half of a career:
 * a roster could only be joined, never fallen out of, and free agency only ever handled people
 * whose contracts had run their term.
 *
 * The realism correction it encodes matters, and it is why this is worth wiring rather than
 * deleting: release is an at-will clause, not a losses trigger. Star power buys patience that
 * a good record does not, so an exciting fighter survives 0-3 and a boring winner does not.
 */
function releaseIfCut(
  db: GameDb,
  fighter: Fighter,
  promotion: Promotion,
  day: number,
  rng: Rng,
): NewsItem | undefined {
  // Nobody cuts their own champion. A promotion that has just put its belt on somebody does not
  // release them for a bad run — it books them a defence.
  if (holdsABeltAnywhere(db, fighter)) return undefined;

  const risk = releaseRisk(fighter, promotion);
  if (risk <= 0 || rng.next() > risk) return undefined;

  const agreement = fighter.agreementId
    ? (db.agreements.findById(fighter.agreementId as string) as
        | (PromotionalAgreement & Entity)
        | undefined)
    : undefined;
  if (agreement) db.agreements.upsert({ ...agreement, status: 'terminated' } as never);

  db.fighters.upsert({
    ...fighter,
    promotionId: undefined,
    agreementId: undefined,
  } as Fighter & Entity);

  const skid = Math.max(0, -fighter.summary.streak);
  return {
    id: newsId(day, `cut:${fighter.id}`),
    day,
    kind: 'release',
    weight: 'minor',
    headline: `${promotion.shortName} release ${displayName(fighter)}`,
    detail: `Cut after ${skid} straight ${skid === 1 ? 'defeat' : 'defeats'}. A free agent at ${fighterAge(fighter, day)}.`,
    fighterIds: [fighter.id],
    divisionId: fighter.divisionId,
    promotionId: promotion.id,
  };
}

/**
 * Contracts end, and somebody signs them next.
 *
 * Without this the roster would drift into a world where every deal had run out and nobody
 * was under contract to anybody. A free agent takes the best offer on the table, which is
 * usually the promotion they were already at — a monopsony rehiring its own.
 */
function resolveFreeAgency(
  db: GameDb,
  day: number,
  rng: Rng,
  promotions: readonly Promotion[],
  exceptId: FighterId | undefined,
): NewsItem[] {
  const news: NewsItem[] = [];
  const fighters = db.fighters.findAll() as Fighter[];

  for (const fighter of fighters) {
    /*
     * The player is not moved by the world. This was the one loop in `advanceWorld` that did not
     * take the exclusion — matchmaking took it, ageing took it, free agency did not — so any
     * advance long enough to reach a quarterly tick would pick a promotion for the player's
     * fighter at random and sign them to it behind their back.
     *
     * Reported from play, and it reads exactly as absurdly as it is: signed with one promotion,
     * trained for thirty-six weeks, and came out of camp ranked fourth in the UFC with a title
     * shot they had never agreed to. Who the player fights for is the single decision career mode
     * is *about*, and the simulation was making it for them every quarter.
     */
    if (fighter.id === exceptId) continue;
    if (fighter.retiredDay !== undefined) continue;

    const agreement = fighter.agreementId
      ? (db.agreements.findById(fighter.agreementId as string) as
          | (PromotionalAgreement & Entity)
          | undefined)
      : undefined;

    const promotion = fighter.promotionId
      ? (db.promotions.findById(fighter.promotionId) as Promotion | undefined)
      : undefined;

    /*
     * A champion does not walk out of the promotion whose belt they are holding.
     *
     * This check used to live inside the `agreement` branch below, which meant it only applied
     * to fighters who had a written contract — and no seeded fighter has one, so every champion
     * in the game fell straight through into free agency and left. Measured: after four years,
     * **thirty-three of seventy-four belts were vacant and every single one was `leftPromotion`**.
     *
     * Doc 16's championship extension is precisely this rule — "you cannot leave while you hold
     * the belt" — and it was written, tested, and unreachable for the entire roster.
     */
    if (holdsABeltAnywhere(db, fighter)) continue;

    // Under contract with fights left: nothing to do.
    if (agreement && promotion) {
      if (!agreementStatus(agreement, day, { isChampion: false }).expired) continue;
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
    /*
     * Affordable is not the same as deserved.
     *
     * The filter above asks only whether a promotion could pay this fighter, and a fighter with
     * no record is cheap — so the biggest promotion in the sport could always "afford" a
     * debutant, and a uniform pick then put them on its roster. Measured: four of thirty winless
     * fighters sat on the leader's roster after ten years, having never fought anywhere.
     *
     * Reputation is the gate, because it is what the rest of the business layer already uses to
     * mean "people who matter rate you". A debutant reaches the regional circuit; somebody who
     * has beaten real opposition reaches the top. The floor keeps the bottom of the sport open
     * to everybody, which is what the bottom of the sport is for.
     */
    /*
     * Calibrated so the ladder is climbable rather than sealed. A debutant on reputation 5 reaches
     * the regional circuit and nothing above it; a solid regional fighter on 40 reaches the
     * majors; an established one on 61 reaches the biggest promotion in the sport. The first
     * version used 0.65 here, which required reputation 85 for the leader — so nearly nobody ever
     * qualified, big-promotion rosters thinned, and their cards lost most of a bout each.
     */
    const earned = affordable.filter((p) => p.prestige <= 42 + fighter.reputation * 0.9);

    const pool = earned.length > 0 ? earned : affordable.length > 0 ? affordable : candidates;
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
  /** Eight is a fight camp. A shorter block is the general work everyone does anyway. */
  weeks = 8,
): Fighter {
  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const coach = fighter.headCoachId
    ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
    : undefined;

  const trained = applyTraining({
    fighter,
    // What they are, and where they still have room — not `rng.pick` over the five, which is what
    // this was and which pulled every fighter in the world toward the same shape (docs/19 §12).
    focuses: [pickTrainingFocus(rng, fighter)],
    weeks,
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
function vacateAbandonedBelts(db: GameDb, day: number): NewsItem[] {
  const news: NewsItem[] = [];

  for (const promotion of db.promotions.findAll() as unknown as Promotion[]) {
    let updated = promotion;

    for (const [divisionId, championId] of Object.entries(promotion.champions)) {
      if (!championId) continue;
      const champion = db.fighters.findById(championId as string) as Fighter | undefined;

      /*
       * A vacancy is always a consequence, and the reason is what makes it a story.
       *
       * This used to strip a belt only for retirement and record nothing about why — so the
       * division simply had an empty slot one day, with no news item and no way for anybody to
       * find out what had happened. "The belt is vacant" is not a story; "he is out for a year
       * and they have stripped him" is.
       */
      const reason: VacancyReason | undefined = !champion
        ? 'leftPromotion'
        : champion.retiredDay !== undefined
          ? 'retired'
          : champion.promotionId !== promotion.id
            ? 'leftPromotion'
            : champion.divisionId !== (divisionId as unknown as typeof champion.divisionId)
              ? 'movedDivision'
              : (champion.readyOnDay ?? 0) - day > 365
                ? 'injured'
                : undefined;

      if (!reason) continue;

      updated = setChampion(updated, divisionId as never, undefined);

      const title = db.championships.findById(
        championshipId(promotion.id, divisionId as never),
      ) as Championship | undefined;
      if (title) {
        db.championships.upsert(vacate({ title, day, reason }) as Championship & Entity);
      }

      news.push({
        id: newsId(day, `vacated:${promotion.id}:${divisionId}`),
        day,
        kind: 'titleChange',
        weight: 'major',
        headline: `${promotion.shortName} ${divisionLabel(divisionId)} title vacated`,
        detail: champion
          ? `${displayName(champion)} has ${describeVacancy(reason)}. The division is without a champion.`
          : `The champion has ${describeVacancy(reason)}. The division is without a champion.`,
        fighterIds: champion ? [champion.id] : [],
        divisionId: divisionId as never,
        promotionId: promotion.id,
      });
    }

    if (updated !== promotion) db.promotions.upsert(updated as never);
  }

  return news;
}

/** A division id as it reads in a headline. */
const divisionLabel = (divisionId: string): string =>
  divisionId.replace(/^mens-/, '').replace(/^womens-/, "women's ").replace(/-/g, ' ');

/**
 * Which promotion a debutant signs with.
 *
 * Inverse to prestige, steeply. A fighter turning professional is not a UFC signing, and the
 * regional circuit existing as a genuine feeder depends on that being true in the model rather
 * than only in the fiction.
 */
function pickStartingPromotion(promotions: readonly Promotion[], rng: Rng): Promotion {
  const weights = promotions.map((p) => Math.max(1, 100 - p.prestige) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);

  let roll = rng.range(0, total);
  for (const [index, weight] of weights.entries()) {
    roll -= weight;
    if (roll <= 0) return promotions[index]!;
  }
  return promotions[promotions.length - 1]!;
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
    const target = divisionTargetFor(getWorld(db), division.id as string, division.sex);

    for (let i = active.length; i < target; i++) {
      /*
       * Where a debutant starts.
       *
       * Uniform `rng.pick` made a 21-year-old with four amateur fights as likely to début in the
       * biggest promotion in the sport as in a regional one, which is both absurd and corrosive:
       * it fills the top of the sport with people who have not earned a place there, and it
       * leaves the feeders — whose entire function is to produce the next generation — empty.
       *
       * Weighted hard toward the bottom instead. Almost everybody starts small, a few start at a
       * major, and the leader signs essentially nobody straight out of the amateurs.
       */
      const promotion = pickStartingPromotion(promotions, rng.fork(`start:${day}:${division.id}:${i}`));
      /*
       * Most people who turn professional are never going to be anything. A few are.
       *
       * `generateFighter` defaults to a tier drawn around 45, which produces a population whose
       * ceilings sit comfortably below elite — so with the intake finally running, the sport
       * still had nobody capable of *becoming* elite. Measured over ten years: population held at
       * 627 while fighters rated 70 or better fell from 48 to 13, because the seeded elite aged
       * out and the intake could not replace them at that level.
       *
       * The sport does not work by lifting everybody. It works by a small number of genuine
       * prospects arriving each year among a great many who will spend a career on regional
       * cards — so roughly one in twelve is drawn from a much higher band, and the rest are
       * left exactly as they were.
       */
      const genRng = rng.fork(`gen:${day}:${division.id}:${i}`);
      const isProspect = genRng.chance(0.085);

      const born = generateFighter(genRng, {
        id: `gen_${day}_${division.id}_${i}`,
        divisionId: division.id,
        sex: division.sex,
        day,
        promotionId: promotion.id,
        tier: isProspect ? Math.round(genRng.normalClamped(78, 9, 62, 97)) : undefined,
      });
      /*
       * A gym, and with it a head coach.
       *
       * `replenish` created fighters with no `gymId` and no `headCoachId`, and nothing ever gave
       * them one — so every fighter generated during a save trained at the no-gym default of
       * quality 40 with no coach for their entire career. That is a development multiplier of
       * about 0.4 against roughly 1.9 in a good room with the right specialist: a quarter speed,
       * permanently.
       *
       * It is why the sport's elite kept emptying out even once the intake was running and the
       * prospects were real. Measured after ten years: 327 generated fighters alive, the best of
       * them carrying a potential of 88, and **not one had reached a rating of 70** — the best
       * actual rating in the entire generated population was 67. They were not failing to arrive.
       * They were arriving and then never being allowed to grow.
       */
      const rooms = db.gyms.findAll() as unknown as Gym[];
      const room = rooms.length > 0 ? genRng.pick(rooms) : undefined;
      const placed: Fighter = room
        ? { ...born, gymId: room.id, headCoachId: room.headCoachId }
        : born;

      db.fighters.upsert(placed as Fighter & Entity);
      news.push(
        debutNews({
          day,
          fighterId: placed.id,
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
  // Optional: in promoter mode there is no player fighter to leave alone.
  exceptId: FighterId | undefined,
  lastSeen?: Map<string, number>,
): void {
  const world = getWorld(db);
  for (const fighter of db.fighters.findAll() as Fighter[]) {
    if (fighter.id === exceptId || fighter.retiredDay !== undefined) continue;
    const since = lastSeen?.get(fighter.id as string) ?? fromDay;
    if (since >= toDay) continue;
    const rng = createRng(`${world.seed}:age:${fighter.id}:${since}`);

    /*
     * Everyone trains, not only the people who got booked.
     *
     * `develop` — which trains *and* ages — was called from exactly one place: the fight
     * resolution path, for the two fighters in a bout. Everybody else came through here and got
     * `applyAgeing` alone, which only ever takes attributes away. So the entire undercard of the
     * sport declined permanently and no generated prospect could ever grow into their ceiling,
     * because reaching it requires camps and camps only happened to people already being booked.
     *
     * Measured over ten years with the intake fixed but this still broken: fighters rated 70 or
     * better fell from 48 to 11, so the top of the sport emptied out even while the population
     * held. A professional fighter between bouts is in a gym, and now the model says so.
     *
     * Four weeks rather than eight: this is the general work everyone does, not a fight camp.
     */
    const trained = develop(db, fighter, toDay, rng, new Map([[fighter.id as string, since]]), 4);
    if (trained !== fighter) db.fighters.upsert(trained as Fighter & Entity);
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

/**
 * Keep the last few cards' delivery scores on the promotion.
 *
 * This is what makes `buzz` a judgement against a moving standard rather than a ratchet
 * against a fixed one. Newest last, capped, and stored on the promotion because it is a
 * property of the promotion's reputation rather than of any one night.
 */
function rememberDelivery(promotion: Promotion, delivered: number): Promotion {
  return {
    ...promotion,
    recentDelivery: [...(promotion.recentDelivery ?? []), delivered].slice(-DELIVERY_MEMORY),
  };
}

/**
 * Whose night this is.
 *
 * Was `rng.pick(promotions)`, i.e. uniform — so the smallest promotion in the game ran as many
 * cards a year as the global one. Two things went wrong with that. A developmental promotion
 * putting on twenty-odd shows a year is not a thing that happens, and it drained the bottom of
 * the sport: measured, the two smallest promotions were insolvent inside eight simulated
 * years, on a schedule they could never have afforded.
 *
 * Weighted by prestige, which gives roughly the cadence doc 12 asks for — around two cards a
 * month for a global promotion down to one every six weeks for a regional one — without
 * hard-coding a calendar that would then have to be kept in step with the tiers.
 */
function pickPromotion(promotions: readonly Promotion[], rng: Rng): Promotion {
  return rng.pickWeighted(promotions, (p) => Math.max(1, p.prestige) ** 1.6);
}

/**
 * Charge every promotion for the time that has passed.
 *
 * See `periodCosts` for why this is overheads rather than a payroll: MMA fighters are paid per
 * bout, and a monthly wage bill would be the wrong model dressed up as realism. What a
 * promotion pays between cards is staff, premises and the administration of a roster, and those
 * scale with the size of the operation rather than with how busy it is.
 */
function chargePromotions(db: GameDb, days: number): void {
  if (days <= 0) return;
  const all = db.fighters.findAll() as Fighter[];

  for (const promotion of db.promotions.findAll() as unknown as Promotion[]) {
    const rosterSize = all.filter(
      (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
    ).length;
    const { promotion: charged } = chargeCosts({ promotion, rosterSize, days });
    db.promotions.upsert(charged as Promotion & Entity);
  }
}

/**
 * A fighter the promotion never books can walk.
 *
 * `activityBreach()` has been written since contracts shipped and had no caller anywhere, which
 * left the most antagonistic move in the sport free: signing somebody purely to keep them off a
 * rival's card cost nothing at all, and doc 16 names that as promoter mode's best trap while
 * leaving the trap half unimplemented.
 *
 * The consequence is deliberately the deal voiding rather than a fine. A fine is a number; a
 * fighter walking out of the door and turning up somewhere else is a story, and the news item
 * that carries it is the same one that already exists for a release.
 */
function enforceActivity(
  db: GameDb,
  fromDay: number,
  day: number,
  rng: Rng,
  exceptId: FighterId | undefined,
): NewsItem[] {
  const news: NewsItem[] = [];

  for (const fighter of db.fighters.findAll() as Fighter[]) {
    /*
     * Never the player, and this is the whole of doc 21 § 1.2.
     *
     * This rule asks whether the *promotion* fell short of what it owed. That is a real question
     * about a fighter the world books, and a meaningless one about the player, who books
     * themselves: a player with no bouts this year has not been shelved, they have been training.
     * Running it over them anyway voided the contract of anybody who took a normal two-fight year
     * and then a camp — and framed it in the news as the player walking out on a promotion they
     * had not walked out on.
     *
     * The player's side of this lives in `promotionPatience`, which asks first.
     */
    if (fighter.id === exceptId) continue;
    if (fighter.retiredDay !== undefined || !fighter.promotionId || !fighter.agreementId) continue;

    const agreement = db.agreements.findById(fighter.agreementId as string) as
      | PromotionalAgreement
      | undefined;
    if (!agreement) continue;

    /*
     * Only once the deal has had a full year to be honoured. Checking from the day it was
     * signed would void every contract in the world on the first tick, since nobody has fought
     * yet — the guarantee is bouts *per twelve months*, not bouts immediately.
     */
    if (day - agreement.signedDay < 365) continue;

    /*
     * A champion is never inactive by the promotion's choice — they are the one fighter it is
     * always trying to book — so the guarantee does not give them a way out. Doc 16's
     * championship extension says the same thing from the other side.
     */
    if (holdsABeltAnywhere(db, fighter)) continue;

    const boutsInLastYear = fighter.record.filter((r) => day - r.day < 365).length;
    if (!activityBreach(agreement, boutsInLastYear)) continue;

    /*
     * A breach gives the fighter the *right* to walk. It does not make them walk.
     *
     * Enforcing it automatically was measurably wrong: on the thin 2020 roster it voided 62% of
     * every contract in the world, because a small sport cannot give everybody three bouts a
     * year and the guarantee is written as though it can. That is not a promotion being
     * punished for shelving somebody, it is the whole sport dissolving.
     *
     * So it is a decision, and the thing that decides it is whether there is anywhere to go.
     * A ranked fighter with a name walks and gets picked up; a prospect nobody has heard of
     * stays, because a bad deal that exists beats free agency that does not lead anywhere.
     * That is also simply what happens.
     */
    const leverage =
      Math.min(1, fighter.starPower / 70) * Math.max(0, 1 - fighterAge(fighter, day) / 42);

    /*
     * An annual hazard, converted to the span actually being simulated.
     *
     * It was a flat per-call chance of 0.25–0.85, and `enforceActivity` runs once per
     * `advanceWorld` — which is every fortnight while the player advances. A fighter who entered
     * breach was therefore near-certain to be gone inside a month, and the roster shed 281 deals
     * across three simulated years. Nothing in the sport moves that fast: an aggrieved fighter
     * complains publicly for months first, and most of them are still there at the end of it.
     *
     * Expressed per year and scaled by the span, so the same underlying risk no longer depends on
     * how the player happened to chop up their advance.
     */
    /*
     * Scaled by how far short the promotion actually fell, because "in breach" is not one
     * condition. Owed two and given one is a fighter with a grievance; owed two and given none
     * is a fighter who has been shelved for a year, and only the second is what this rule was
     * written about. Treating them identically is most of why the roster shed 281 deals in
     * three years — a single missed bout was enough to void a contract.
     */
    const shortfall = clamp01(
      (agreement.activityGuarantee - boutsInLastYear) / Math.max(1, agreement.activityGuarantee),
    );
    const perYear = (0.08 + leverage * 0.3) * shortfall;
    const span = Math.max(1, day - fromDay);
    const chance = 1 - (1 - perYear) ** (span / 365);
    if (!rng.fork(`breach:${fighter.id}:${day}`).chance(chance)) continue;

    const promotion = db.promotions.findById(fighter.promotionId) as Promotion | undefined;
    db.agreements.upsert({ ...agreement, status: 'terminated' } as never);
    db.fighters.upsert({
      ...fighter,
      promotionId: undefined,
      agreementId: undefined,
    } as Fighter & Entity);

    news.push({
      id: newsId(day, `breach:${fighter.id}`),
      day,
      kind: 'release',
      weight: 'minor',
      headline: `${displayName(fighter)} walks out on ${promotion?.shortName ?? 'their promotion'}`,
      detail: `Owed ${agreement.activityGuarantee} bouts a year and given ${boutsInLastYear}. The deal is void and ${fighter.lastName} is a free agent.`,
      fighterIds: [fighter.id],
      divisionId: fighter.divisionId,
      promotionId: promotion?.id,
    });
  }

  return news;
}

/**
 * The promotion notices you are not fighting, and says so.
 *
 * Doc 21 in one function. `enforceActivity` asks whether the promotion fell short of what it
 * owed, which is a real question about a fighter the world books and a meaningless one about the
 * player — who books themselves, and whose quiet year is a choice rather than a shelving. Asking
 * it of the player anyway is what cut a career short for taking one camp after an ordinary
 * two-fight year, and it did so with no warning at all: the only notice was raised *after* the
 * contract was already gone.
 *
 * So this is the half that was missing. The promotion escalates — a word at six months, a named
 * opponent and a date at nine, the same offer with the consequence spelled out at a year — and
 * only lets somebody go after they have turned fights down, or after two years in which they have
 * stopped being a fighter at all.
 *
 * Every rung is idempotent on the stage rather than on the day, so each thing is said exactly
 * once per deal however finely the player chops up their advance.
 */
function playerActivity(
  db: GameDb,
  day: number,
  playerId: FighterId | undefined,
  hasBookedFight: boolean,
  rng: Rng,
): NewsItem[] {
  if (!playerId) return [];

  const me = db.fighters.findById(playerId as string) as Fighter | undefined;
  if (!me || me.retiredDay !== undefined || !me.promotionId || !me.agreementId) return [];

  const agreement = db.agreements.findById(me.agreementId as string) as
    | (PromotionalAgreement & Entity)
    | undefined;
  const promotion = db.promotions.findById(me.promotionId) as Promotion | undefined;
  if (!agreement || !promotion) return [];

  // A deal already run out is free agency, which the inbox reports separately. Chasing somebody
  // for a fight on a contract that no longer obliges either party is the wrong conversation.
  const isChampion = holdsABeltAnywhere(db, me);
  if (agreementStatus(agreement, day, { isChampion }).expired) return [];

  const lastBout = me.record.length ? Math.max(...me.record.map((r) => r.day)) : undefined;
  const idle = daysIdle(lastBout, agreement.signedDay, day);

  const patience = promotionPatience({
    daysIdle: idle,
    refusals: agreement.refusedBouts ?? 0,
    starPower: me.starPower,
    isChampion,
    hasBookedFight,
  });

  if (patience.stage === 'content') return [];

  const key = `${agreement.id}:${patience.stage}`;
  const months = Math.floor(idle / 30);

  if (patience.stage === 'nudged') {
    raise(db, {
      // Day zero in the id, not today: the stage is what must happen once, and keying on the
      // day would raise it again every fortnight for as long as the condition held.
      id: inboxId(0, `chase:${key}`),
      day,
      kind: 'career',
      priority: 'notable',
      title: `${promotion.shortName} would like you active`,
      body: `${months} months since you last fought. Nobody is unhappy yet — they would just like to see you on a card this year.`,
      link: { route: 'hub' },
      fighterId: me.id,
      promotionId: promotion.id,
    });
    return [];
  }

  if (patience.stage === 'pressing' || patience.stage === 'final') {
    const opponent = chaseOpponent(db, me, promotion, day, rng);
    if (!opponent) return [];

    const uplift = 1 + chaseUplift(patience.stage);
    const purse = Math.round(agreement.showPurse * uplift);
    const isFinal = patience.stage === 'final';

    const raised = raise(db, {
      id: inboxId(0, `chase:${key}`),
      day,
      kind: 'offer',
      // A decision, so the clock stops on it. That is the point of the whole change: the player
      // finds out that a choice is being made *while* they can still make it.
      priority: 'decision',
      title: `${promotion.shortName} want you on a card`,
      body:
        `${displayName(opponent)}, in eight weeks. £${purse}k to show.` +
        (isFinal
          ? ` You have been out ${months} months. They have been clear about this one: turn it down and they start looking at the roster spot.`
          : ` ${months} months is a long time to be away, and they would like you back.`),
      actions: [
        {
          id: 'accept',
          label: 'Take the fight',
          detail: 'Books the bout and starts your camp.',
        },
        {
          id: 'decline',
          label: 'Turn it down',
          detail: isFinal
            ? 'They will remember this one.'
            : 'Costs you nothing today. It is not free forever.',
        },
      ],
      link: { route: 'hub' },
      fighterId: me.id,
      opponentId: opponent.id,
      promotionId: promotion.id,
    });

    if (raised) {
      db.agreements.upsert({ ...agreement, lastOfferedDay: day } as PromotionalAgreement & Entity);
    }
    return [];
  }

  // --- Cut ------------------------------------------------------------------------------------
  db.agreements.upsert({ ...agreement, status: 'terminated' } as never);
  db.fighters.upsert({
    ...me,
    promotionId: undefined,
    agreementId: undefined,
  } as Fighter & Entity);

  raise(db, {
    id: inboxId(0, `chase:${key}`),
    day,
    kind: 'contract',
    priority: 'decision',
    title: `${promotion.shortName} have let you go`,
    body: `${patience.reason} You are a free agent. Somebody will still want you — but the longer you are out, the fewer of them there are.`,
    actions: [{ id: 'acknowledge', label: 'Understood', isDismiss: true }],
    link: { route: 'offers' },
    fighterId: me.id,
    promotionId: promotion.id,
  });

  return [
    {
      id: newsId(day, `chasecut:${me.id}`),
      day,
      kind: 'release',
      weight: 'minor',
      // Named for what it is. The old path put "walks out on" in the feed for a fighter who had
      // done nothing of the kind, which is the single most misleading line the game produced.
      headline: `${promotion.shortName} release ${displayName(me)}`,
      detail: `Inactive for ${months} months. ${patience.reason}`,
      fighterIds: [me.id],
      divisionId: me.divisionId,
      promotionId: promotion.id,
      involvesPlayer: true,
    },
  ];
}

/**
 * Somebody for the promotion to put in front of the player.
 *
 * Their own roster first, which is what a matchmaker would do, falling back to the wider pool
 * rather than giving up: an offer that cannot name anybody is not an offer, and a thin division
 * would otherwise silently skip the whole escalation and go straight to the release.
 */
function chaseOpponent(
  db: GameDb,
  me: Fighter,
  promotion: Promotion,
  day: number,
  rng: Rng,
): Fighter | undefined {
  const pool = db.fighters.findAll() as Fighter[];
  const samePromotion = offerOpponents(me, pool, promotion, day, rng.fork('same'), {
    promotionId: promotion.id as string,
  });
  const anyone =
    samePromotion.length > 0
      ? samePromotion
      : offerOpponents(me, pool, promotion, day, rng.fork('any'));
  return anyone[0]?.opponent;
}

/**
 * Whether this fighter is champion *anywhere*, not just where they are signed.
 *
 * Checking only their current promotion was subtly wrong and produced a real failure: a fighter
 * can briefly hold promotion A's belt while the map still says so and already be signed to B —
 * the sweep that reconciles the two runs quarterly, not continuously. Asking B whether they are
 * B's champion answers no, and they were free to move again, so a belt could be orphaned by a
 * fighter the guard was supposed to be protecting.
 *
 * `finalise` already scans every promotion for exactly this reason, with the same comment.
 */
function holdsABeltAnywhere(db: GameDb, fighter: Fighter): boolean {
  return (db.promotions.findAll() as unknown as Promotion[]).some(
    (p) => p.champions[fighter.divisionId] === fighter.id,
  );
}
