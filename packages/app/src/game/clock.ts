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
import { readInbox } from './inbox';

/**
 * How far one call of the loop moves before checking whether to stop.
 *
 * Must be at least the world's own `STEP_DAYS`. A first version used a week, reasoning that a
 * finer step gives a more precise interrupt — and it silently did nothing at all, because
 * `advanceWorld` short-circuits any span shorter than its own step and only ages people. Cards
 * stopped happening, costs stopped being charged, and the whole loop became an expensive way to
 * increment a number.
 *
 * A fortnight is therefore the floor on interrupt precision, and that is fine: it is also the
 * resolution at which the world decides anything, so there is no finer truth to interrupt.
 */
const CHECK_STEP_DAYS = 14;

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

  while (day < targetDay) {
    const to = Math.min(targetDay, day + CHECK_STEP_DAYS);
    const advance = advanceWorld(db, day, to, exclusion);
    fights += advance.fights;
    truncated ||= advance.truncated;

    day = to;
    setWorld(db, { day });

    const fresh = blocking(readInbox(db)).filter((i) => !alreadyWaiting.has(i.id));
    if (fresh.length > 0) {
      db.save();
      return { day, interrupted: true, waiting: fresh, fights, truncated };
    }
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
