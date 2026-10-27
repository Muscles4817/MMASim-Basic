/**
 * A promoter out of a job, taking the next one (doc 34 B2).
 *
 * Fired is not game over. The owner's letter comes with offers from promotions below the one that
 * let the promoter go, and taking one moves the save there: its own roster, its own broadcaster,
 * a new owner with three new objectives. The cards the promoter had planned at the old promotion
 * are called off — they were somebody else's to run now.
 *
 * Its own module because it needs the planner (to call those cards off) and the boardroom (to
 * open the new one), and the planner already imports the boardroom.
 */

import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import type { InboxItem, Promotion } from '@mmasim/engine';
import { closeBoardroom, openBoardroom } from './boardroom';
import { readInbox } from './inbox';
import { cancelPlan, isLive, plansFor } from './plans';

const JOB = 'job:';

/** The promotion a job action takes, if it is one. */
export const jobIn = (actionId: string | undefined): string | undefined =>
  actionId?.startsWith(JOB) ? actionId.slice(JOB.length) : undefined;

/** Move the promoter to `promotionId`, leaving the old promotion to the world. */
export function takeJob(db: GameDb, promotionId: string): void {
  const world = getWorld(db);
  const from = world.playerPromotionId as string | undefined;
  if (from === promotionId || !db.promotions.findById(promotionId)) return;

  if (from) {
    for (const plan of plansFor(db, from)) if (isLive(plan)) cancelPlan(db, plan.id as string);
    closeBoardroom(db, from);
  }
  setWorld(db, { playerPromotionId: promotionId });
  openBoardroom(db, promotionId, world.day);
}

/**
 * Apply a job taken from the letter by any route that only resolved the item.
 *
 * The inbox screen takes the job as it answers; this catches everything else that answers an
 * item without knowing what its actions do, so a promoter is never left running the promotion
 * that fired them.
 */
export function settleJobChoices(db: GameDb): void {
  const world = getWorld(db);
  for (const item of readInbox(db) as InboxItem[]) {
    const to = jobIn(item.resolvedWith);
    if (!to || item.promotionId !== world.playerPromotionId) continue;
    // Only from the promotion that fired them: a letter is not a standing order.
    const left = db.promotions.findById(item.promotionId as string) as Promotion | undefined;
    if (left?.owner?.firedDay === undefined) continue;
    takeJob(db, to);
  }
}
