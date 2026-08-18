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
  applyAgeing,
  applyTraining,
  forecastTraining,
  pickTrainingFocus,
  ATTRIBUTE_META,
  TRAINING_META,
  type AttributeKey,
  type Coach,
  type TrainingFocus,
  type TrainingForecast,
  displayName,
  fightNews,
  asPromotionId,
  createRng,
  defaultGamePlan,
  planFor,
  offerOpponents,
  readinessDelay,
  refuseBout,
  type PromotionalAgreement,
  retirementReason,
  retirementUrge,
  shouldRetire,
  activeInjuries,
  aggravate,
  aggravationChance,
  fightInjuryChance,
  injuredAttributes,
  rustFor,
  rustedAttributes,
  daysSinceLastBout,
  rollInjury,
  setChampion,
  campPurchaseEffects,
  cutSeverity,
  simulateFight,
  traitMul,
  weightMissForfeit,
  type PurchaseKey,
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
import { getWorld, setWorld, type Entity, type GameDb } from '@mmasim/data';
import { accrueHeatFromFight } from './rivalries';
import { campCostFor, currentPurse, settleFight } from './money';
import { afterFight, recordAdviceFor, settleManagerAdvice, type ManagerAdvice } from './contracts';
import { playerCardPosition, runSupportingCard } from './night';
import { recordPlayerNews } from './world';

const BOOKING_KEY = 'mmasim:booking';
const RESULT_KEY = 'mmasim:lastResult';

/** A booked but unfought bout, plus the plan the player built for it. */
export interface Booking {
  bout: Bout;
  opponentId: string;
  plan: GamePlan;
  /** Day the camp started. Prep quality scales with how long the player has had. */
  campStartDay: number;
  /**
   * What the player bought for this camp.
   *
   * Kept beside the plan rather than on it because it is spending, not tactics: it is debited
   * when the camp is committed and then only read to modify what the camp and the weigh-in
   * already do.
   */
  purchases?: readonly PurchaseKey[];
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

/**
 * Guarded like `readJson` and `writeJson` above, which these two were not.
 *
 * Every other door into session storage in this module tolerates its absence; these reached for
 * the global directly, so any environment without one — a locked-down browser, or the node test
 * tier that drives a real fight without a DOM — threw from inside `runBookedFight` *after* the
 * fight had been simulated and settled. Losing a booking is not worth losing a result over.
 */
const forget = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Nothing to clear, which is the state the caller wanted anyway. */
  }
};

export const clearBooking = (): void => forget(BOOKING_KEY);
export const clearResult = (): void => forget(RESULT_KEY);

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
  /**
   * Everything the night actually did to the fighter.
   *
   * Title changes, bonus awards, the weight-miss forfeit, what the purse cleared after the
   * camp and the taxman, new injuries, a grudge being born. All of this was computed and
   * then dropped on the floor: `runBookedFight` returned it and nothing read it, so a player
   * could win a belt and Fight of the Night and the app would say nothing.
   */
  notes?: readonly string[];
  /** The undercard, so the card has results on it rather than dashes. */
  undercard?: readonly { boutId: string; winnerName?: string; method: string; round: number }[];
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

// --- The fight camp develops you ---------------------------------------------------------------

/**
 * What the camp before a fight is worth, as development.
 *
 * It was worth nothing. `runBookedFight` aged the player, paid them and burned a fight off the
 * deal, and never once called `applyTraining` — while `world.ts:develop()` gave every AI fighter
 * a full eight-week block of it around every bout they took, under a comment reading "the same
 * loop the player is in". It was not the same loop. Measured over four years and eight fights,
 * an AI fighter gained +0.63 overall and +5.58 cardio from their camps; the player gained
 * exactly zero and aged at the same rate.
 *
 * So the fight camp now runs the identical call: same function, same weeks, same gym and coach,
 * same focus-picking. A player who fights twice a year develops like a fighter who fights twice
 * a year, which is the only defensible answer.
 *
 * The focus is picked the way the AI's is — what you are, and where you still have room — rather
 * than from the game plan. A camp for a wrestler is a wrestling camp whatever the plan says about
 * this particular opponent, and making the plan drive development would quietly turn a tactical
 * choice into a permanent one.
 */
export interface CampDevelopment {
  focus: TrainingFocus;
  weeks: number;
  gym?: Gym;
  coach?: Coach;
}

/** Camp length in whole weeks, from the booking. The one definition, used by both sides. */
export const campWeeksOf = (booking: Booking): number =>
  Math.max(1, Math.round((booking.bout.day - booking.campStartDay) / 7));

/**
 * The plan for this camp's development.
 *
 * Seeded on the bout rather than on the day, so the forecast the player is shown on the camp
 * screen and the training actually applied at the fight are the same camp. A forecast computed
 * from a different draw would be a lie told with real arithmetic.
 */
export function campDevelopmentPlan(
  db: GameDb,
  fighter: Fighter,
  booking: Booking,
): CampDevelopment {
  const world = getWorld(db);
  return {
    focus: pickTrainingFocus(
      createRng(`${world.seed}:campdev:${booking.bout.id}`),
      fighter,
    ),
    weeks: campWeeksOf(booking),
    gym: fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined,
    coach: fighter.headCoachId
      ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
      : undefined,
  };
}

/** What the camp is expected to build, for the screen the player looks at during it. */
export function forecastCampDevelopment(
  db: GameDb,
  fighter: Fighter,
  booking: Booking,
): TrainingForecast & { focus: TrainingFocus } {
  const plan = campDevelopmentPlan(db, fighter, booking);
  return {
    ...forecastTraining({
      fighter,
      focuses: [plan.focus],
      weeks: plan.weeks,
      gym: plan.gym,
      coach: plan.coach,
      day: getWorld(db).day,
    }),
    focus: plan.focus,
  };
}

/**
 * Answer a bout the promotion put in front of you.
 *
 * The other half of doc 21. Until now nothing in the game ever offered the player a fight — they
 * picked opponents off the hub and the promotion was silent — so being cut for inactivity was
 * being judged on offers that did not exist. An offer that cannot be accepted or refused is a
 * notification, so this is what makes it a decision: taking it books the camp exactly as the hub
 * does, and turning it down is *recorded*, which is what the promotion's patience is actually
 * spent on.
 *
 * Returns the booking when one was made, so the caller knows whether to send the player to camp.
 */
export function answerBoutOffer(
  db: GameDb,
  fighter: Fighter,
  item: { opponentId?: string },
  actionId: string,
): Booking | undefined {
  const opponent = item.opponentId
    ? (db.fighters.findById(item.opponentId) as Fighter | undefined)
    : undefined;

  if (actionId === 'accept') {
    // Without an opponent there is nothing to book — a roster can lose somebody to retirement
    // between the offer being made and the player answering it, and silently booking nobody
    // would be worse than the offer quietly lapsing.
    if (!opponent) return undefined;
    const booking = bookFight(db, fighter, opponent);
    db.save();
    return booking;
  }

  if (actionId === 'decline') {
    const agreement = fighter.agreementId
      ? (db.agreements.findById(fighter.agreementId as string) as
          | (PromotionalAgreement & Entity)
          | undefined)
      : undefined;
    if (agreement) {
      db.agreements.upsert(refuseBout(agreement) as PromotionalAgreement & Entity);
      db.save();
    }
  }

  return undefined;
}

export function saveBookingPlan(booking: Booking, plan: GamePlan): Booking {
  const next = { ...booking, plan };
  writeJson(BOOKING_KEY, next);
  return next;
}

/**
 * Remember what was bought, for the same reason the plan is written down as it is built.
 *
 * Leaving the camp screen for any reason must not silently unbuy things — and since the bank
 * is only debited when the camp is committed, a purchase that vanished on navigation would
 * be a decision the player made twice and paid for once.
 */
export function saveBookingPurchases(booking: Booking, purchases: readonly PurchaseKey[]): Booking {
  const next = { ...booking, purchases };
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

  /*
   * The camp, before the cage.
   *
   * Applied here rather than at booking because a camp that has not happened yet should not
   * have improved anybody — and applied *before* the fighter is read for the simulation,
   * because you walk in having done the work rather than having it credited afterwards.
   */
  const campPlan = campDevelopmentPlan(
    db,
    db.fighters.getById(booking.bout.redId as string) as Fighter,
    booking,
  );
  const camp = applyTraining({
    fighter: db.fighters.getById(booking.bout.redId as string) as Fighter,
    focuses: [campPlan.focus],
    weeks: campPlan.weeks,
    gym: campPlan.gym,
    coach: campPlan.coach,
    day: world.day,
    rng: createRng(`${world.seed}:campgain:${booking.bout.id}`),
  });
  db.fighters.upsert(camp.fighter as Fighter & { id: string });

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
  const boughtEffects = campPurchaseEffects(booking.purchases ?? []);

  /*
   * Rust, applied on top of injury.
   *
   * `Condition.ringRust` was written into the fighter model and never once read or written, so
   * time out of the cage cost nothing whatsoever — which is the whole reason free agency did not
   * feel like a threat. It suppresses timing rather than ability, so a fighter back from two
   * years out hits exactly as hard and sees it coming much later.
   */
  const rustOf = (f: Fighter) => rustFor(daysSinceLastBout(f.record, day) ?? 0);

  const redHurt: Fighter = {
    ...red,
    attributes: rustedAttributes(
      injuredAttributes(red.attributes, red.injuries ?? [], day),
      rustOf(red),
    ),
    // The recovery block. Applied to the condition the fighter *walks in with* rather than to
    // anything inside the fight, because that is what it buys: physio, soft tissue work and
    // time, so a body that would have arrived worn arrives closer to fresh. It cannot make
    // anyone fresher than fresh.
    condition: {
      ...red.condition,
      fatigue: Math.max(0, red.condition.fatigue * boughtEffects.wear),
      bodyWear: Math.max(0, red.condition.bodyWear * boughtEffects.wear),
    },
  };
  const blueHurt: Fighter = {
    ...blue,
    attributes: rustedAttributes(
      injuredAttributes(blue.attributes, blue.injuries ?? [], day),
      rustOf(blue),
    ),
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
      traitMul(red.traits, 'weightMissRisk') *
      // The nutritionist pays for itself here, which is the payback period the forfeit above
      // was written to create.
      boughtEffects.cutPenalty,
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
    // Where it happened, so reputation is worth what the room is worth.
    promotionPrestige: (
      red.promotionId
        ? (db.promotions.findById(red.promotionId) as Promotion | undefined)
        : undefined
    )?.prestige,
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

  /*
   * The opponent's medical suspension.
   *
   * The player's own is handled by advancing the world clock below, but the fighter they just
   * knocked out got nothing at all — so the game's most common suspension, the one the player
   * personally caused, was the one that did not exist. They could be rebooked immediately.
   */
  const opponentLost = result.winnerId !== undefined && result.winnerId === red.id;
  db.fighters.upsert({
    ...settleInjuries(aftermath.blue, 'blue'),
    readyOnDay:
      booking.bout.day +
      readinessDelay(aftermath.blue, opponentLost ? result.method : undefined),
  } as Fighter & { id: string });

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
    // The real slot, from the same function the card uses. This was hardcoded, so the 0.5x
    // prelim and 1.6x co-main rungs were unreachable for the player and "get off the
    // prelims" — doc 12's second axis of a career — was worth nothing.
    position: playerCardPosition(red, blue, booking.bout.isTitleFight),
    isChampion: booking.bout.isTitleFight && playerWon,
  });

  /*
   * The player gets older too.
   *
   * `applyAgeing` ran only inside `runTraining` and `runLayoff`, and the world explicitly
   * skipped the player — so the eight to ten weeks of every fight camp, which is the majority
   * of career time, aged the entire sport except the person playing it. That produced a
   * dominant and degenerate strategy: train to your peak, then never open the training screen
   * again and fight forever with a frozen prime body. Opting out of training opted you out of
   * decline, and pillar 7 was enforced on the roster and not on the player.
   */
  const agedPlayer = applyAgeing(
    db.fighters.getById(red.id as string) as Fighter,
    booking.campStartDay,
    day,
    createRng(`${world.seed}:age:${red.id}:${day}`),
  );
  db.fighters.upsert(agedPlayer.fighter as Fighter & { id: string });

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

  /*
   * Careers end.
   *
   * `shouldRetire` was called only for AI fighters, so the player's career had no terminal
   * state at all — and `retirementUrge` was exported specifically so a UI could show a
   * fighter *thinking about it* before they go, with no callers anywhere. A mode about
   * climbing needs somewhere for the climb to stop.
   */
  const retiring = shouldRetire(
    agedPlayer.fighter,
    day,
    createRng(`${world.seed}:retire:${red.id}:${day}`),
  );
  const retirementNotes: string[] = [];
  if (retiring) {
    const reason = retirementReason(agedPlayer.fighter, day);
    db.fighters.upsert({
      ...(db.fighters.getById(red.id as string) as Fighter),
      retiredDay: day,
      notes: reason,
    } as Fighter & { id: string });
    retirementNotes.push(`That is the end. ${reason}`);
  } else {
    const urge = retirementUrge(agedPlayer.fighter, day);
    if (urge > 0.35) {
      retirementNotes.push(
        'You have started thinking about how this ends. Not yet — but you have thought about it.',
      );
    }
  }

  /*
   * What the camp built, said out loud.
   *
   * The camp is the majority of a career's elapsed time and it used to report nothing, because
   * it did nothing. Now that it develops the fighter, staying silent about it would be the same
   * failure in a new place — a system the player cannot see is a system they cannot plan around.
   */
  const campNotes: string[] = [];
  const campGains = (Object.entries(camp.gains) as [AttributeKey, number][])
    .filter(([, gain]) => gain >= 0.05)
    .sort((a, b) => b[1] - a[1]);
  if (campGains.length > 0) {
    campNotes.push(
      `${campPlan.weeks} weeks of ${TRAINING_META[campPlan.focus].label.toLowerCase()}: ` +
        campGains
          .map(([key, gain]) => `${ATTRIBUTE_META[key].label} +${Math.round(gain * 10) / 10}`)
          .join(', '),
    );
  }
  campNotes.push(...camp.notes);

  const notes = [
    ...titleNotes,
    ...campNotes,
    ...weighInNotes,
    ...(night?.notes ?? []),
    ...(earnings?.notes ?? []),
    ...injuryNotes,
    ...heatNotes,
    ...aftermath.notes,
  ];

  // The player's own career belongs in their own news feed. `recordPlayerNews` existed with
  // no callers, and `NewsFeed` styled a "You" badge that could never fire — so the hub
  // reported on everybody in the sport except the person playing it.
  const playerItem = fightNews({
    day,
    boutId: booking.bout.id,
    winnerName: playerWon ? displayName(red) : displayName(blue),
    loserName: playerWon ? displayName(blue) : displayName(red),
    winnerId: playerWon ? red.id : blue.id,
    loserId: playerWon ? blue.id : red.id,
    method: result.method,
    round: result.round,
    submissionName: result.submissionName,
    divisionId: booking.bout.divisionId,
    promotionId: red.promotionId,
    isTitleFight: booking.bout.isTitleFight,
    titleChangedHands: titleNotes.length > 0,
    involvesPlayer: true,
  });
  if (playerItem) recordPlayerNews(db, [playerItem]);

  db.save();
  writeJson(RESULT_KEY, {
    result,
    commentatorId: booking.bout.commentatorId,
    notes,
    undercard: (night?.undercard ?? []).map(({ bout, result: r }) => ({
      boutId: bout.boutId,
      winnerName: r.winnerId
        ? (db.fighters.findById(r.winnerId as string) as Fighter | undefined)?.lastName
        : undefined,
      method: r.method,
      round: r.round,
    })),
  });
  clearBooking();
  return { result, notes };
}

/**
 * A plausible plan for an AI fighter.
 *
 * Moved into the engine as `planFor` by docs/19 phase 5, and kept here as a name because the
 * *interesting* half of that move was where it was called from rather than what it did: this
 * function existed, worked, and was applied to exactly one fight in the game — the player's
 * opponent — while `night.ts` and `world.ts` handed both corners `defaultGamePlan()`.
 */
export const aiPlanFor = planFor;
