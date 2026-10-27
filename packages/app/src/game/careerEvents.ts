/**
 * Career events, where the player meets them. Doc 34 C6.
 *
 * The rules live in the engine (`retirement.ts`, `headSpace.ts`); the world applies them to
 * everybody (`world.ts`). This is the part the promoter sees: a fighter on their roster thinking
 * about stopping, a former fighter of theirs coming back, and the one thing the promotion can do
 * about a fighter's head — give them time off.
 */

import {
  TIME_OFF_DAYS,
  afterTimeOff,
  displayName,
  inboxId,
  isConsideringRetirement,
  voiceFor,
  wantsFarewell,
  type Fighter,
  type InboxItem,
  type NewsItem,
} from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';
import { raise } from './inbox';
import { applyDivisionMove } from './world';
import { bookingsFor } from './plans';

/** What being kept at a weight they asked to leave costs the relationship. */
export const MOVE_REFUSED_RESENTMENT = 8;

/**
 * Time off for a fighter's head: not bookable for `TIME_OFF_DAYS`, and the reset it buys applied
 * now, when the break is decided. Returns the updated fighter.
 */
export function takeTimeOff(db: GameDb, fighterId: string): Fighter | undefined {
  const fighter = db.fighters.findById(fighterId) as Fighter | undefined;
  if (!fighter) return undefined;
  const day = getWorld(db).day;
  if ((fighter.restUntil ?? 0) > day) return fighter;
  const rested: Fighter = {
    ...fighter,
    restUntil: (day + TIME_OFF_DAYS) as never,
    condition: {
      ...fighter.condition,
      confidence: afterTimeOff(fighter.condition.confidence, fighter.personality),
    },
  };
  db.fighters.upsert(rested as never);
  db.save();
  return rested;
}

/**
 * Tell the promoter about career events on their side of the sport, as they happen. Run by the
 * clock each day; each item is raised once (a fighter considering it, once a year).
 */
export function scanCareerEvents(db: GameDb, day: number): void {
  const world = getWorld(db);
  const promotionId = world.playerPromotionId;
  if (!promotionId) return;

  for (const fighter of db.fighters.findAll() as Fighter[]) {
    if (fighter.promotionId !== promotionId || fighter.retiredDay !== undefined) continue;
    if (!isConsideringRetirement(fighter, day as never)) continue;
    const farewell = wantsFarewell(fighter, day as never);
    const situation = farewell ? 'farewellFight' : 'consideringRetirement';
    raise(db, {
      id: inboxId(Math.floor(day / 365) as never, `considering:${fighter.id}`),
      day: day as never,
      kind: 'career',
      priority: 'notable',
      title: farewell
        ? `${displayName(fighter)} wants a farewell fight`
        : `${displayName(fighter)} is thinking about retirement`,
      body: `“${voiceFor(fighter, situation, day as never).text}”${
        farewell
          ? ' One more big night, and they will probably call it a career after it.'
          : ' One more bad night could be the last.'
      }`,
      link: { route: 'fighter', id: fighter.id as string },
      fighterId: fighter.id,
      promotionId: promotionId as never,
    });
  }

  // Somebody who retired under this promotion's banner is coming back today.
  for (const item of db.news.findAll() as NewsItem[]) {
    if (item.kind !== 'comeback' || item.day !== day || item.promotionId !== promotionId) continue;
    const fighterId = item.fighterIds[0];
    const fighter = fighterId
      ? (db.fighters.findById(fighterId as string) as Fighter | undefined)
      : undefined;
    if (!fighter) continue;
    raise(db, {
      id: inboxId(day as never, `comeback:${fighter.id}`),
      day: day as never,
      kind: 'career',
      priority: 'notable',
      title: `${displayName(fighter)} is coming back — and is a free agent`,
      body: `${item.detail ?? ''} They retired with you. Make them an offer before somebody else does.`,
      link: { route: 'fighter', id: fighter.id as string },
      fighterId: fighter.id,
      promotionId: promotionId as never,
    });
  }
}

/**
 * Answer a fighter's request to change division (doc 34 C6, #63 review): allowing it is the same
 * move the world makes; refusing keeps them at the weight, and they resent it. True when the item
 * was one.
 */
export function answerDivisionMove(db: GameDb, item: InboxItem, actionId: string): boolean {
  if (!actionId.startsWith('move:') || !item.fighterId) return false;
  const fighter = db.fighters.findById(item.fighterId as string) as Fighter | undefined;
  if (!fighter || fighter.retiredDay !== undefined) return true;
  if (actionId === 'move:refuse') {
    db.fighters.upsert({
      ...fighter,
      resentment: Math.min(100, fighter.resentment + MOVE_REFUSED_RESENTMENT),
    } as never);
    db.save();
    return true;
  }
  // Booked onto a card since they asked: the bout was made at this weight, so the move waits.
  if (bookingsFor(db, getWorld(db).playerPromotionId).get(fighter.id as string)?.signed) {
    return true;
  }
  const target = actionId.slice('move:allow:'.length);
  if (target && target !== fighter.divisionId) {
    applyDivisionMove(db, fighter, target as Fighter['divisionId'], getWorld(db).day);
    db.save();
  }
  return true;
}
