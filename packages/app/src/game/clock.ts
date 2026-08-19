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
  blocking,
  type FighterId,
  type InboxItem,
  type PromotionId,
} from '@mmasim/engine';
import { advanceWorld, type WorldExclusion } from './world';
import { getBooking } from './career';
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

  const fresh = blocking(readInbox(db)).filter((i) => !alreadyWaiting.has(i.id));
  if (fresh.length > 0) {
    db.save();
    return { day, interrupted: true, waiting: fresh, fights, truncated };
  }

  db.save();
  return { day, interrupted: false, waiting: [], fights, truncated };
}

/** Named spans, so a screen offers choices rather than a number field. */
export const ADVANCE_STEPS = [
  { id: 'day', label: 'A day', days: 1 },
  { id: 'week', label: 'A week', days: 7 },
  { id: 'fortnight', label: 'A fortnight', days: 14 },
  { id: 'month', label: 'A month', days: 30 },
] as const;

export type AdvanceStepId = (typeof ADVANCE_STEPS)[number]['id'];
