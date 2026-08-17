/**
 * The inbox, as the game writes to it.
 *
 * The engine owns what an inbox item *is* and whether it blocks; this owns when one is raised
 * and where it is kept. The split matters because the advance loop has to be able to ask "is
 * anything blocking" without knowing anything about a database.
 *
 * Raising is deliberately idempotent on a stable id. The world is simulated in steps and a
 * condition — a contract about to expire, a fighter idle long enough to walk — is *true for
 * days*, so a naive writer would raise the same item every step and bury the player in copies
 * of one problem. The id encodes the day and the subject, and re-raising an item that already
 * exists does nothing.
 */

import {
  displayName,
  inboxId,
  isBlocking,
  resolve,
  markRead,
  type Fighter,
  type InboxItem,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';

type Stored = InboxItem & Entity;

export const readInbox = (db: GameDb): InboxItem[] => db.inbox.findAll() as Stored[];

/**
 * Raise an item, unless it is already there.
 *
 * Returns whether anything was written, so a caller batching a simulation step can avoid
 * saving when nothing changed.
 */
export function raise(db: GameDb, item: InboxItem): boolean {
  if (db.inbox.findById(item.id) !== undefined) return false;
  db.inbox.upsert(item as Stored);
  return true;
}

export function markItemRead(db: GameDb, id: string): void {
  const item = db.inbox.findById(id) as Stored | undefined;
  if (!item) return;
  db.inbox.upsert(markRead(item, getWorld(db).day) as Stored);
}

export function resolveItem(db: GameDb, id: string, actionId: string): void {
  const item = db.inbox.findById(id) as Stored | undefined;
  if (!item) return;
  db.inbox.upsert(resolve(item, actionId, getWorld(db).day) as Stored);
}

/** How many things are waiting, for the badge on the tab. */
export function inboxCount(db: GameDb): { unread: number; blocking: number } {
  const all = readInbox(db);
  return {
    unread: all.filter((i) => i.readDay === undefined).length,
    blocking: all.filter(isBlocking).length,
  };
}

/**
 * Scan the world and raise anything that needs the player.
 *
 * Called from the world loop rather than from a screen, because the whole point is that these
 * arrive while time is passing. What is raised here is deliberately narrow: things that are
 * **about the player**, and that they can do something about. A rival promotion's contract
 * problems belong in the news feed, not here — an inbox that fills with other people's business
 * is the news feed with fewer items and more ceremony.
 */
export function scanForInbox(db: GameDb, day: number): number {
  const world = getWorld(db);
  let raised = 0;

  // --- Promoter: your own roster --------------------------------------------------------------
  if (world.playerRole === 'promoter' && world.playerPromotionId) {
    const promotion = db.promotions.findById(world.playerPromotionId) as Promotion | undefined;
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === world.playerPromotionId && f.retiredDay === undefined,
    );

    for (const fighter of roster) {
      const agreement = fighter.agreementId
        ? (db.agreements.findById(fighter.agreementId as string) as
            | PromotionalAgreement
            | undefined)
        : undefined;
      if (!agreement) continue;

      /*
       * A fighter about to walk over inactivity. A decision, not a notice: the player can still
       * book them, and finding out from the news feed *after* they left is exactly the failure
       * this system exists to fix.
       */
      const boutsThisYear = fighter.record.filter((r) => day - r.day < 365).length;
      const owed = agreement.activityGuarantee - boutsThisYear;
      const contractAge = day - agreement.signedDay;

      if (contractAge > 300 && contractAge < 365 && owed > 0) {
        raised += raise(db, {
          id: inboxId(day, `activity:${fighter.id}`),
          day,
          kind: 'roster',
          priority: 'decision',
          title: `${displayName(fighter)} can walk in ${365 - contractAge} days`,
          body: `You owe them ${agreement.activityGuarantee} bouts a year and they have had ${boutsThisYear}. Put them on a card or lose them for nothing.`,
          actions: [
            { id: 'acknowledge', label: 'Understood', detail: 'Deal with it yourself.', isDismiss: true },
          ],
          link: { route: 'promoterRoster' },
          fighterId: fighter.id,
          promotionId: promotion?.id,
        })
          ? 1
          : 0;
      }

      // A deal running out. Notable rather than blocking — losing somebody at the end of their
      // contract is a normal part of the sport, not an emergency.
      const daysLeft = agreement.expiresDay - day;
      if (daysLeft > 0 && daysLeft <= 60) {
        raised += raise(db, {
          id: inboxId(Math.floor(day / 30) * 30, `expiring:${fighter.id}`),
          day,
          kind: 'contract',
          priority: 'notable',
          title: `${displayName(fighter)} is out of contract soon`,
          body: `${daysLeft} days left, ${agreement.fightsRemaining} fights owed.`,
          link: { route: 'promoterRoster' },
          fighterId: fighter.id,
        })
          ? 1
          : 0;
      }
    }
  }

  // --- Fighter: your own career -----------------------------------------------------------------
  if (world.playerRole === 'fighter' && world.playerFighterId) {
    const me = db.fighters.findById(world.playerFighterId) as Fighter | undefined;
    if (me) {
      const agreement = me.agreementId
        ? (db.agreements.findById(me.agreementId as string) as PromotionalAgreement | undefined)
        : undefined;

      if (agreement) {
        const daysLeft = agreement.expiresDay - day;
        if (daysLeft > 0 && daysLeft <= 60) {
          raised += raise(db, {
            id: inboxId(Math.floor(day / 30) * 30, 'yourdeal'),
            day,
            kind: 'contract',
            priority: 'notable',
            title: 'Your contract is nearly up',
            body: `${daysLeft} days and ${agreement.fightsRemaining} fights left. Worth knowing what else is out there.`,
            link: { route: 'offers' },
            fighterId: me.id,
          })
            ? 1
            : 0;
        }
      }

      if (me.readyOnDay !== undefined && me.readyOnDay === day) {
        raised += raise(db, {
          id: inboxId(day, 'cleared'),
          day,
          kind: 'medical',
          priority: 'notable',
          title: 'You are cleared to fight',
          body: 'The suspension is served. You can take a booking again.',
          link: { route: 'hub' },
          fighterId: me.id,
        })
          ? 1
          : 0;
      }
    }
  }

  return raised;
}
