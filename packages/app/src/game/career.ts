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
  activeInjuries,
  aggravate,
  aggravationChance,
  fightInjuryChance,
  injuredAttributes,
  rollInjury,
  setChampion,
  cutSeverity,
  simulateFight,
  traitMul,
  weightMissForfeit,
  weightMissRiskMultiplier,
  type Bout,
  type Commentator,
  type Fighter,
  type Gym,
  type FightResult,
  type GamePlan,
  type Judge,
  type MatchupAppraisal,
  type Promotion,
  type Referee,
} from '@mmasim/engine';
import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import { accrueHeatFromFight } from './rivalries';
import { campCostFor, currentPurse, settleFight } from './money';
import { afterFight, recordAdviceFor, settleManagerAdvice, type ManagerAdvice } from './contracts';
import { runSupportingCard } from './night';

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

/**
 * The booking for a given fighter.
 *
 * Validated against who the player actually controls. Without the check, switching fighters
 * or resetting the world leaves a booking naming the *previous* fighter in session storage —
 * and the hub will happily offer to send someone else's career into it.
 */
export function getBooking(playerFighterId?: string): Booking | undefined {
  const booking = readJson<Booking>(BOOKING_KEY);
  if (!booking) return undefined;
  if (playerFighterId !== undefined && (booking.bout.redId as string) !== playerFighterId) {
    clearBooking();
    return undefined;
  }
  return booking;
}

export const clearBooking = (): void => sessionStorage.removeItem(BOOKING_KEY);
export const clearResult = (): void => sessionStorage.removeItem(RESULT_KEY);

/** Clear all transient career state. Call when switching fighters or resetting the world. */
export function clearTransientCareerState(): void {
  clearBooking();
  clearResult();
}

/**
 * The last fight, plus who called it.
 *
 * The commentator is stored beside the result rather than baked into it: the booth is a
 * *view* of the fight, and keeping it separate means the replay screen can re-call the same
 * events without re-simulating anything. See engine `fight/broadcast.ts`.
 */
export interface StoredResult {
  result: FightResult;
  commentatorId?: string;
}

export const getLastResult = (): FightResult | undefined =>
  readJson<StoredResult>(RESULT_KEY)?.result;

export const getLastBroadcast = (): StoredResult | undefined => readJson<StoredResult>(RESULT_KEY);

/**
 * Opponent options for the player's next fight.
 *
 * Falls back progressively rather than returning nothing. A thin division — women's
 * featherweight seeds with a single fighter — would otherwise hand the player a terminal
 * screen at fight zero, with no way out because the calendar only advances by fighting.
 * A cross-promotional bout or a rematch is always better than a locked career.
 */
export function getOffers(db: GameDb, fighter: Fighter): MatchupAppraisal[] {
  const world = getWorld(db);
  const promotion = db.promotions.findById(fighter.promotionId ?? 'p_apex');
  if (!promotion) return [];

  const pool = db.fighters.findAll() as Fighter[];
  const seed = `${world.seed}:offers:${fighter.id}:${world.day}`;

  const samePromotion = offerOpponents(fighter, pool, promotion, world.day, createRng(seed), {
    promotionId: fighter.promotionId as string | undefined,
  });
  if (samePromotion.length > 0) return samePromotion;

  const anyPromotion = offerOpponents(fighter, pool, promotion, world.day, createRng(seed));
  if (anyPromotion.length > 0) return anyPromotion;

  // Last resort: allow an immediate rematch rather than stranding the career.
  return offerOpponents(fighter, pool, promotion, world.day, createRng(seed), {
    rematchCooldownDays: 0,
  });
}

/** Divisions with too few active fighters to sustain a career. Surfaced on the start screen. */
export function activeDivisionPeers(db: GameDb, fighter: Fighter): number {
  return (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.id !== fighter.id && f.divisionId === fighter.divisionId && f.retiredDay === undefined,
  ).length;
}

export interface BookingOptions {
  weeks?: number;
  /** A championship bout: five rounds, a belt on the line, and a different kind of camp. */
  isTitleFight?: boolean;
  /** What the manager said about this one, so it can be checked against the result later. */
  advice?: ManagerAdvice;
}

/** Book a fight. The camp screen then builds the plan against this opponent. */
export function bookFight(
  db: GameDb,
  fighter: Fighter,
  opponent: Fighter,
  options: BookingOptions = {},
): Booking {
  const weeks = options.weeks ?? (options.isTitleFight ? 10 : 8);
  const isTitleFight = options.isTitleFight ?? false;
  const world = getWorld(db);
  const rng = createRng(`${world.seed}:booking:${fighter.id}:${world.day}`);
  const referees = db.referees.findAll() as Referee[];
  const judges = db.judges.findAll() as Judge[];
  const commentators = db.commentators.findAll() as Commentator[];

  const bout: Bout = {
    id: `bout_${fighter.id}_${world.day}`,
    redId: fighter.id,
    blueId: opponent.id,
    divisionId: fighter.divisionId,
    promotionId: (fighter.promotionId ?? asPromotionId('p_apex')) as string,
    day: world.day + weeks * 7,
    // Championship bouts are five rounds. That is not cosmetic: it is where a gas tank and
    // a late-round game plan stop being a nice-to-have.
    rounds: isTitleFight ? 5 : 3,
    isTitleFight,
    // Officials are assigned at booking and shown before the fight, so a prepared player can
    // factor a stand-up-happy referee into their game plan. That is the point of showing it.
    refereeId: referees.length ? rng.pick(referees).id : undefined,
    judgeIds: judges.length ? rng.shuffle(judges).slice(0, 3).map((j) => j.id as string) : undefined,
    // The booth is part of the card too, and a biased one will misread the fight in front
    // of the player. See engine `fight/broadcast.ts`.
    commentatorId: commentators.length ? rng.pick(commentators).id : undefined,
    hype: 0,
  };

  // Put the manager on the record. He has an opinion about every fight and until now he
  // never went on record with it, which made the advice track — the entire mechanism by
  // which he is held to account — unreachable.
  if (options.advice) recordAdviceFor(db, fighter, bout.id, options.advice);

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

  // Injured fighters compete with their real attributes, not their card. Nobody is told —
  // the opponent's scouting report does not know, and the player finds out from how the
  // fight looks. That is how it works in reality and it is the point of the system.
  const day = booking.bout.day;
  const redHurt: Fighter = {
    ...red,
    attributes: injuredAttributes(red.attributes, red.injuries ?? [], day),
  };
  const blueHurt: Fighter = {
    ...blue,
    attributes: injuredAttributes(blue.attributes, blue.injuries ?? [], day),
  };

  /*
   * The scales, before the cage.
   *
   * `weightMissRisk` has been computed since weight classes shipped, the trait hook has
   * existed since the domain was written, and the game warned about it and then nothing ever
   * happened. Missing weight now costs 20% of the show purse to the opponent — which is what
   * makes `Weight-Cut Gambler` a business trait as well as a fight-night one, and gives the
   * nutritionist a payback period.
   */
  const weighInRng = createRng(`${world.seed}:weigh:${booking.bout.id}`);
  const cutRisk = Math.min(
    1,
    Math.pow(cutSeverity(red.walkingWeightLbs, red.divisionId), 2.2) *
      0.55 *
      weightMissRiskMultiplier(red.personality) *
      traitMul(red.traits, 'weightMissRisk'),
  );
  const missedWeight = weighInRng.chance(cutRisk);
  const weighInNotes: string[] = [];

  if (missedWeight) {
    const promotion = db.promotions.findById(
      (red.promotionId ?? asPromotionId('p_apex')) as string,
    ) as Promotion | undefined;
    const purse = promotion ? currentPurse(db, red) : undefined;
    const forfeit = purse ? weightMissForfeit(purse.show) : 0;

    if (forfeit > 0) {
      db.fighters.upsert({
        ...(db.fighters.getById(red.id as string) as Fighter),
        bank: Math.round(((db.fighters.getById(red.id as string) as Fighter).bank - forfeit) * 10) / 10,
      } as Fighter & { id: string });
    }
    weighInNotes.push(
      `You missed weight. £${forfeit}k of your show purse goes to ${blue.lastName}, the fight is at catchweight, and everybody now knows you cannot make the division.`,
    );
  }

  const result = simulateFight({
    boutId: booking.bout.id,
    red: { fighter: redHurt, plan: booking.plan },
    blue: { fighter: blueHurt, plan: aiPlanFor(blueHurt, redHurt) },
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
    isTitleFight: booking.bout.isTitleFight,
    rng: createRng(`${world.seed}:aftermath:${booking.bout.id}`),
  });

  const injuryRng = createRng(`${world.seed}:injury:${booking.bout.id}`);
  const injuryNotes: string[] = [];

  const settleInjuries = (fighter: Fighter, corner: 'red' | 'blue'): Fighter => {
    const damage = result.damage[corner];
    const taken = damage.headDamage + damage.bodyDamage + damage.legDamage;
    let injuries = [...(fighter.injuries ?? [])];

    // Anything carried in can be made worse by competing on it.
    injuries = injuries.map((injury) => {
      if (!activeInjuries([injury], day).length) return injury;
      if (!injuryRng.chance(aggravationChance(injury, taken))) {
        return { ...injury, foughtThrough: true };
      }
      injuryNotes.push(
        `${fighter.lastName} came in carrying that ${injury.type} and made it considerably worse.`,
      );
      return aggravate(injury, day, injuryRng);
    });

    if (injuryRng.chance(fightInjuryChance(fighter, taken, day))) {
      const fresh = rollInjury({
        fighter,
        source: 'fight',
        day,
        rng: injuryRng.fork(fighter.id as string),
        history: injuries,
      });
      injuries.push(fresh);
      injuryNotes.push(`${fighter.lastName} leaves with a ${fresh.type} injury.`);
    }

    return { ...fighter, injuries };
  };

  db.fighters.upsert(settleInjuries(aftermath.red, 'red'));
  db.fighters.upsert(settleInjuries(aftermath.blue, 'blue'));

  // Pay the man. Until this existed the purse was printed on two screens and discarded.
  const playerWon = result.winnerId === red.id;
  const earnings = settleFight(db, db.fighters.getById(red.id as string) as Fighter, {
    won: playerWon,
    // Already debited when the camp ran; passed in so the report can net it honestly.
    campCost: campCostFor(
      red.gymId ? (db.gyms.findById(red.gymId) as Gym | undefined) : undefined,
      Math.max(1, Math.round((booking.bout.day - booking.campStartDay) / 7)),
    ),
    campWeeks: Math.max(1, Math.round((booking.bout.day - booking.campStartDay) / 7)),
    position: booking.bout.isTitleFight ? 'mainEvent' : 'mainCard',
    isChampion: booking.bout.isTitleFight && playerWon,
  });

  // Burn a fight off the deal, and re-read how aggrieved the fighter is now that their worth
  // has moved and their terms have not. Then settle what the manager said about it.
  afterFight(db, db.fighters.getById(red.id as string) as Fighter);
  settleManagerAdvice(db, red, booking.bout.id, playerWon);

  // The fight builds its own rematch. A close, controversial or brutal night generates heat
  // between these two specifically, which is what makes a division produce grudges without
  // anybody scripting them. See engine `business/heat.ts`.
  const heatNotes = accrueHeatFromFight(db, {
    result,
    red,
    blue,
    day,
    isTitleFight: booking.bout.isTitleFight,
    seed: `${world.seed}:heat:${booking.bout.id}`,
  });

  // The belt changes hands, or it does not. A draw leaves it with the champion, which is
  // the rule and also the source of a great deal of real-world grievance.
  const titleNotes: string[] = [];
  if (booking.bout.isTitleFight && result.winnerId) {
    const promotion = db.promotions.findById(booking.bout.promotionId) as Promotion | undefined;
    if (promotion) {
      const previousChampion = promotion.champions[booking.bout.divisionId];
      const winner = result.winnerId === red.id ? aftermath.red : aftermath.blue;

      if (previousChampion !== winner.id) {
        db.promotions.upsert(
          setChampion(promotion, booking.bout.divisionId, winner.id) as never,
        );
        titleNotes.push(
          previousChampion
            ? `${winner.lastName} is the new champion.`
            : `${winner.lastName} claims the vacant title.`,
        );
      } else {
        titleNotes.push(`${winner.lastName} retains the title.`);
      }
    }
  }
  // The player only sits out a suspension if they were the one stopped.
  const playerLost = result.winnerId !== undefined && result.winnerId !== red.id;
  setWorld(db, {
    day: booking.bout.day + readinessDelay(aftermath.red, playerLost ? result.method : undefined),
  });
  db.save();

  // The night the fight sat on. Built after the bout because the bonus pool is decided by
  // what happened across the whole card, and the player's fight is part of that comparison.
  const promotionForNight = db.promotions.findById(
    (red.promotionId ?? asPromotionId('p_apex')) as string,
  ) as Promotion | undefined;

  const night = promotionForNight
    ? runSupportingCard(db, {
        playerBoutId: booking.bout.id,
        player: db.fighters.getById(red.id as string) as Fighter,
        opponent: blue,
        playerResult: result,
        promotion: promotionForNight,
        day,
        isTitleFight: booking.bout.isTitleFight,
      })
    : undefined;

  db.save();
  writeJson(RESULT_KEY, { result, commentatorId: booking.bout.commentatorId });
  clearBooking();
  return {
    result,
    notes: [
      ...titleNotes,
      ...weighInNotes,
      ...(night?.notes ?? []),
      ...(earnings?.notes ?? []),
      ...injuryNotes,
      ...heatNotes,
      ...aftermath.notes,
    ],
  };
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
