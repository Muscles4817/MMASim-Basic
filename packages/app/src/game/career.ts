/**
 * The career loop, wired to the database.
 *
 * The engine owns every decision (who to offer, what a fight costs); this module owns the
 * plumbing — reading the pool out of repositories, storing the booked bout, and writing
 * results back. Keeping that split means the whole loop is testable without a database and
 * the database never contains game logic.
 */

import {
  applyAftermath,
  asPromotionId,
  createRng,
  defaultGamePlan,
  offerOpponents,
  readinessDelay,
  simulateFight,
  type Bout,
  type Fighter,
  type FightResult,
  type GamePlan,
  type Judge,
  type MatchupAppraisal,
  type Referee,
} from '@mmasim/engine';
import { getWorld, setWorld, type GameDb } from '@mmasim/data';

const BOOKING_KEY = 'mmasim:booking';
const RESULT_KEY = 'mmasim:lastResult';

/** A booked but unfought bout, plus the plan the player built for it. */
export interface Booking {
  bout: Bout;
  opponentId: string;
  plan: GamePlan;
  /** Day the camp started. Prep quality scales with how long the player has had. */
  campStartDay: number;
}

/**
 * Booking and last-result live in `sessionStorage` rather than the game DB.
 *
 * They are transient view state, not world state: a booking that has not been fought yet is
 * a decision in progress, and persisting it into the save would mean migrating it forever.
 * When the promoter mode lands and cards are scheduled weeks ahead, this moves into a real
 * `bouts` collection — which already exists in `COLLECTIONS` for exactly that reason.
 */
function readJson<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: the player loses an in-progress booking, not their career.
  }
}

export const getBooking = (): Booking | undefined => readJson<Booking>(BOOKING_KEY);
export const clearBooking = (): void => sessionStorage.removeItem(BOOKING_KEY);
export const getLastResult = (): FightResult | undefined => readJson<FightResult>(RESULT_KEY);

/** Opponent options for the player's next fight. */
export function getOffers(db: GameDb, fighter: Fighter): MatchupAppraisal[] {
  const world = getWorld(db);
  const promotion = db.promotions.findById(fighter.promotionId ?? 'p_apex');
  if (!promotion) return [];

  const pool = db.fighters.findAll() as Fighter[];
  const rng = createRng(`${world.seed}:offers:${fighter.id}:${world.day}`);
  return offerOpponents(fighter, pool, promotion, world.day, rng, {
    promotionId: fighter.promotionId as string | undefined,
  });
}

/** Book a fight. The camp screen then builds the plan against this opponent. */
export function bookFight(db: GameDb, fighter: Fighter, opponent: Fighter, weeks = 8): Booking {
  const world = getWorld(db);
  const rng = createRng(`${world.seed}:booking:${fighter.id}:${world.day}`);
  const referees = db.referees.findAll() as Referee[];
  const judges = db.judges.findAll() as Judge[];

  const bout: Bout = {
    id: `bout_${fighter.id}_${world.day}`,
    redId: fighter.id,
    blueId: opponent.id,
    divisionId: fighter.divisionId,
    promotionId: (fighter.promotionId ?? asPromotionId('p_apex')) as string,
    day: world.day + weeks * 7,
    rounds: 3,
    isTitleFight: false,
    // Officials are assigned at booking and shown before the fight, so a prepared player can
    // factor a stand-up-happy referee into their game plan. That is the point of showing it.
    refereeId: referees.length ? rng.pick(referees).id : undefined,
    judgeIds: judges.length ? rng.shuffle(judges).slice(0, 3).map((j) => j.id as string) : undefined,
    hype: 0,
  };

  const booking: Booking = {
    bout,
    opponentId: opponent.id as string,
    plan: defaultGamePlan(),
    campStartDay: world.day,
  };
  writeJson(BOOKING_KEY, booking);
  return booking;
}

export function saveBookingPlan(booking: Booking, plan: GamePlan): Booking {
  const next = { ...booking, plan };
  writeJson(BOOKING_KEY, next);
  return next;
}

export interface FightOutcome {
  result: FightResult;
  notes: readonly string[];
}

/**
 * Run the booked fight, apply the consequences, and advance the calendar.
 *
 * The opponent gets a plausible AI game plan rather than the neutral default — an opponent
 * who never prepares makes the player's own preparation meaningless.
 */
export function runBookedFight(db: GameDb, booking: Booking): FightOutcome {
  const world = getWorld(db);
  const red = db.fighters.getById(booking.bout.redId as string) as Fighter;
  const blue = db.fighters.getById(booking.bout.blueId as string) as Fighter;

  const referee = booking.bout.refereeId
    ? (db.referees.findById(booking.bout.refereeId) as Referee | undefined)
    : undefined;
  const judges = booking.bout.judgeIds
    ?.map((id) => db.judges.findById(id) as Judge | undefined)
    .filter((j): j is Judge => j !== undefined);

  const result = simulateFight({
    boutId: booking.bout.id,
    red: { fighter: red, plan: booking.plan },
    blue: { fighter: blue, plan: aiPlanFor(blue, red) },
    rounds: booking.bout.rounds,
    referee,
    judges: judges && judges.length === 3 ? judges : undefined,
    seed: `${world.seed}:${booking.bout.id}`,
  });

  const aftermath = applyAftermath({
    result,
    red,
    blue,
    day: booking.bout.day,
    divisionId: booking.bout.divisionId,
    promotionId: red.promotionId ?? asPromotionId('p_apex'),
    rng: createRng(`${world.seed}:aftermath:${booking.bout.id}`),
  });

  db.fighters.upsert(aftermath.red);
  db.fighters.upsert(aftermath.blue);
  setWorld(db, { day: booking.bout.day + readinessDelay(aftermath.red) });
  db.save();

  writeJson(RESULT_KEY, result);
  clearBooking();
  return { result, notes: aftermath.notes };
}

/**
 * A plausible plan for an AI fighter.
 *
 * Chosen from their own strengths against the opponent's weaknesses, so the player is
 * facing someone who also had a camp. Reads are drawn from the opponent's real tendencies,
 * which means the AI is *correctly* prepared — the player has to beat a plan, not a blank.
 */
export function aiPlanFor(fighter: Fighter, opponent: Fighter): GamePlan {
  const a = fighter.attributes;
  const o = opponent.attributes;

  const wrestlingEdge = a.wrestling - o.takedownDefence;
  const strikingEdge = a.strikingOffence - o.strikingDefence;

  const approach =
    wrestlingEdge > strikingEdge + 8
      ? a.groundControl > 70
        ? 'wrestle'
        : 'grind'
      : strikingEdge > 8
        ? 'pressure'
        : 'counter';

  // Attack the legs of anyone who needs their base, and the body of anyone with a tank.
  const targeting =
    o.wrestling > 70
      ? { head: 0.45, body: 0.2, legs: 0.35 }
      : o.cardio > 80
        ? { head: 0.45, body: 0.4, legs: 0.15 }
        : { head: 0.6, body: 0.25, legs: 0.15 };

  const reads = (
    [
      o.wrestling > 65 ? ('doubleLeg' as const) : undefined,
      o.wrestling > 65 ? ('singleLeg' as const) : undefined,
      o.kicking > 75 ? ('calfKick' as const) : undefined,
      o.strikingOffence > 75 ? ('leadHook' as const) : undefined,
      o.groundControl > 75 ? ('guardPassing' as const) : undefined,
      o.submissions > 75 ? ('guillotine' as const) : undefined,
    ].filter(Boolean) as ('doubleLeg' | 'singleLeg' | 'calfKick' | 'leadHook' | 'guardPassing' | 'guillotine')[]
  ).slice(0, 3);

  return {
    approach,
    targeting,
    riskLevel: 0.5,
    campQuality: 0.7,
    preppedReads: reads.map((read) => ({ read, drillQuality: 0.7, confidence: 0.7 })),
  };
}
