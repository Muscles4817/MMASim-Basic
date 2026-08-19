/**
 * Moving time, for every mode.
 *
 * The clock used to be a side effect of whichever screen happened to move it. Fighter mode
 * advanced inside "wait N weeks" and inside training; **promoter mode advanced nowhere at all**,
 * which is why its clock was frozen, every card overwrote the last one, and the entire
 * `promotionCosts` feature never fired for a player once. Time being nobody's responsibility is
 * how a mode ends up without any.
 *
 * So it is one function, it belongs to no screen, and it does three things no caller should be
 * repeating: it excludes the right things for the player's role, it advances in steps small
 * enough that consequences land in order, and **it stops when the player is needed**.
 */

import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  INJURY_META,
  applyAgeing,
  applyIdleDecay,
  blocking,
  createRng,
  fighterAge,
  freshnessOf,
  recoveryRate,
  type AttributeKey,
  type Fighter,
  type FighterId,
  type InboxItem,
  type PromotionId,
} from '@mmasim/engine';
import { advanceWorld, type WorldExclusion } from './world';
import { getBooking } from './career';
import { toll } from './contracts';
import { readInbox, scanForInbox } from './inbox';
import { scanPromoterInbox } from './plans';

/*
 * There is no step any more, and that is the change.
 *
 * This was `CHECK_STEP_DAYS = 14`, with a comment explaining that a finer step "silently did
 * nothing at all, because `advanceWorld` short-circuits any span shorter than its own step", and
 * concluding that "a fortnight is therefore the floor on interrupt precision". Both halves were
 * true and the conclusion was the problem: it made the player live in fortnights. "A day" on the
 * calendar moved the date and changed nothing, and an offer that arrived on the 3rd was not seen
 * until the 14th.
 *
 * The world ticks days now, so `advanceWorld` takes the stop test itself and reports the day it
 * reached. See docs/27 §11.
 */

export interface AdvanceResult {
  /** Where the clock actually stopped, which is not always where it was asked to stop. */
  day: number;
  /** True when something needs the player and the clock stopped early to say so. */
  interrupted: boolean;
  /** The items that stopped it. */
  waiting: readonly InboxItem[];
  fights: number;
  /** True when the world hit its own work budget rather than the requested span. */
  truncated: boolean;
  /** What the days did to the player's own fighter. Absent in promoter mode. */
  player?: PlayerElapsed;
}

/**
 * What passing time did to the person playing.
 *
 * The world tick deliberately excludes the player — `exclusionFor` says so, and it has to,
 * because the player's own camps, fights and decisions are run by the screens rather than by the
 * simulation. But *excluded from the simulation* had quietly become *exempt from time*: waiting
 * moved the calendar, aged the entire roster, and left the player's fighter byte-for-byte
 * unchanged. No decline, no decay, no contract tolling, and — the one that actually bites —
 * **no freshness recovery at all**.
 *
 * So a player who was flat and did the obvious thing about it got a later date and the same flat
 * fighter, and the only route in the game that returned freshness was the training screen's rest
 * button, which is three taps down and looks like a training option. Charging the days here means
 * every path through the clock charges them the same way.
 */
export interface PlayerElapsed {
  from: number;
  to: number;
  days: number;
  freshnessBefore: number;
  freshnessAfter: number;
  /** Points of freshness per day, so a caller can draw the days rather than only the total. */
  recoveryPerDay: number;
  /** What the layoff cost, if anything. Rest is recovery *and* decay. */
  losses: Partial<Record<AttributeKey, number>>;
  /** Injuries that reached full fitness, keyed by the day they did. */
  healedOn: ReadonlyMap<number, readonly string[]>;
}

/**
 * Charge the player for a span in which they did nothing in particular.
 *
 * Not exported: every caller should go through `advanceTo`, or the two paths through the clock
 * would charge different things again.
 */
function passTimeForPlayer(db: GameDb, from: number, to: number): PlayerElapsed | undefined {
  const world = getWorld(db);
  if (world.playerRole === 'promoter') return undefined;
  const id = world.playerFighterId as string | undefined;
  if (!id) return undefined;

  const fighter = db.fighters.findById(id) as Fighter | undefined;
  if (!fighter) return undefined;

  const days = Math.max(0, to - from);
  const before = freshnessOf(fighter);
  const existing = fighter.injuries ?? [];

  const healedOn = new Map<number, string[]>();
  for (const injury of existing) {
    if (injury.healedDay > from && injury.healedDay <= to) {
      const list = healedOn.get(injury.healedDay) ?? [];
      list.push(INJURY_META[injury.type].label);
      healedOn.set(injury.healedDay, list);
    }
  }

  if (days === 0) {
    return {
      from,
      to,
      days: 0,
      freshnessBefore: before,
      freshnessAfter: before,
      recoveryPerDay: 0,
      losses: {},
      healedOn,
    };
  }

  // Sitting out does not run a contract down. It stops the clock, which is what turns a
  // holdout from a reliable lever into a genuine gamble.
  toll(db, fighter, days);

  const rng = createRng(`${world.seed}:elapsed:${fighter.id}:${from}`);
  const decayed = applyIdleDecay(fighter, days, rng);
  const aged = applyAgeing(decayed, from, to, rng);

  const losses: Partial<Record<AttributeKey, number>> = {};
  for (const key of Object.keys(fighter.attributes) as AttributeKey[]) {
    const delta = aged.fighter.attributes[key] - fighter.attributes[key];
    if (delta < 0) losses[key] = delta;
  }

  db.fighters.upsert(aged.fighter);

  return {
    from,
    to,
    days,
    freshnessBefore: before,
    freshnessAfter: freshnessOf(aged.fighter),
    /*
     * The rate `applyAgeing` just charged once over the whole span, handed back so a screen can
     * show it accruing. Reconstructing it in the UI would be a second implementation of recovery
     * that could drift; taking it from the same function is what makes a day-by-day display of
     * this block agree with the fighter it produced.
     */
    recoveryPerDay: recoveryRate(fighter, fighterAge(fighter, to)),
    losses,
    healedOn,
  };
}

/** What the world must leave alone, worked out from the role rather than passed in. */
function exclusionFor(db: GameDb): WorldExclusion {
  const world = getWorld(db);
  if (world.playerRole === 'promoter') {
    return { promotionId: world.playerPromotionId as PromotionId | undefined };
  }
  return {
    fighterId: world.playerFighterId as FighterId | undefined,
    /*
     * Answered here because this is the only layer that can. The booking is session state owned
     * by `career.ts`, which imports the world — so the world cannot ask, and a fighter already
     * in camp would otherwise be chased for a fight they have taken.
     */
    playerHasBooking: getBooking(world.playerFighterId as string | undefined) !== undefined,
  };
}

/**
 * Advance to a target day, stopping early if the player is needed.
 *
 * The interrupt is the point. A simulation that runs four weeks and then reports that your
 * champion walked out in week one has taken the decision away and called it a notification —
 * so the loop checks after every step and stops on the first unresolved decision.
 *
 * Idempotent about the past: asking to advance to a day that has already passed does nothing
 * rather than running the world backwards.
 */
export function advanceTo(db: GameDb, targetDay: number): AdvanceResult {
  const start = getWorld(db).day;
  if (targetDay <= start) {
    return { day: start, interrupted: false, waiting: [], fights: 0, truncated: false };
  }

  const exclusion = exclusionFor(db);
  let day = start;
  let fights = 0;
  let truncated = false;

  // Anything already waiting when the player pressed advance must not immediately re-stop it —
  // they have seen it, and refusing to move would be a lock rather than an interrupt.
  const alreadyWaiting = new Set(blocking(readInbox(db)).map((i) => i.id));

  /*
   * One call, stopped on the exact day something happened.
   *
   * This used to walk forward a fortnight at a time and check the inbox between hops, because
   * `advanceWorld` did nothing at all for a shorter span. That is what made the player live in
   * fortnights: "a day" on the calendar moved the clock and changed nothing, and an offer that
   * arrived on the 3rd was not seen until the 14th.
   *
   * The world ticks days now, so the check moves inside it. Everything that has to be paid over a
   * whole span — ageing, promotion costs, activity and contract enforcement — still happens once,
   * for however far the loop actually got, which is what `reached` reports.
   */
  const advance = advanceWorld(db, day, targetDay, exclusion, (onDay) => {
    // Raise anything the player needs to answer *on the day it becomes true*, then stop only if
    // it is something they have not already seen.
    //
    // Two scanners rather than one, because the promoter's half reads planned cards and the
    // inbox module must not import the planner — plans already write offer outcomes into the
    // inbox, and a cycle between the two would be a module-evaluation order bug waiting to
    // happen. This is the one place that legitimately knows about both.
    scanForInbox(db, onDay);
    scanPromoterInbox(db, onDay);
    return blocking(readInbox(db)).some((i) => !alreadyWaiting.has(i.id));
  });

  fights += advance.fights;
  truncated ||= advance.truncated;
  day = advance.reached;
  setWorld(db, { day });

  // Charged over the span the clock actually covered, not the one it was asked for: a player
  // whose advance was interrupted on day three has lived three days, not thirty.
  const player = passTimeForPlayer(db, start, day);

  const fresh = blocking(readInbox(db)).filter((i) => !alreadyWaiting.has(i.id));
  if (fresh.length > 0) {
    db.save();
    return { day, interrupted: true, waiting: fresh, fights, truncated, player };
  }

  db.save();
  return { day, interrupted: false, waiting: [], fights, truncated, player };
}

/** Named spans, so a screen offers choices rather than a number field. */
export const ADVANCE_STEPS = [
  { id: 'day', label: 'A day', days: 1 },
  { id: 'week', label: 'A week', days: 7 },
  { id: 'fortnight', label: 'A fortnight', days: 14 },
  { id: 'month', label: 'A month', days: 30 },
] as const;

/**
 * The same spans a fighter thinks in when they are deciding how long to sit out.
 *
 * Shorter at the bottom and longer at the top than `ADVANCE_STEPS`, because these two controls
 * answer different questions. The calendar's is "move me forward"; this one is "how long am I
 * resting for", and the honest answers to that run from a few days off after a hard week to the
 * two months a torn-up knee needs.
 */
export const REST_STEPS = [
  { id: 'threeDays', label: '3 days', days: 3 },
  { id: 'week', label: '1 week', days: 7 },
  { id: 'fortnight', label: '2 weeks', days: 14 },
  { id: 'month', label: '4 weeks', days: 28 },
  { id: 'twoMonths', label: '8 weeks', days: 56 },
] as const;

export type AdvanceStepId = (typeof ADVANCE_STEPS)[number]['id'];
