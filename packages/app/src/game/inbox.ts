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
  agreementStatus,
  inboxId,
  isBlocking,
  resolve,
  markRead,
  type CornerAnswer,
  type EventPlan,
  type Fighter,
  type InboxItem,
  type PlannedBout,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { money } from '../ui/format';

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
  /*
   * Rewritten because almost none of it fired.
   *
   * `scanForInbox` runs **once**, at the end of an advance, with the final day — and the old
   * fighter checks were written as though it ran every day. "You are cleared to fight" required
   * `readyOnDay === day` exactly, an exact match against a clock that moves in fourteen-day steps
   * and in twelve-week jumps when a player trains, so it essentially never fired. The only other
   * item required an unexpired agreement to exist. A fighter's inbox was therefore empty almost
   * always, which is why it reads as broken: it was.
   *
   * So every check below describes a *state* rather than an instant. A state is still true at the
   * end of a long advance, which is the only moment this function is ever called, and the item id
   * is what stops it being raised twice.
   */
  if (world.playerRole === 'fighter' && world.playerFighterId) {
    const me = db.fighters.findById(world.playerFighterId) as Fighter | undefined;
    if (me) {
      const agreement = me.agreementId
        ? (db.agreements.findById(me.agreementId as string) as PromotionalAgreement | undefined)
        : undefined;
      const promotion = me.promotionId
        ? (db.promotions.findById(me.promotionId) as Promotion | undefined)
        : undefined;

      const status = agreement
        ? agreementStatus(agreement, day, {
            isChampion: promotion?.champions[me.divisionId] === me.id,
          })
        : undefined;

      /*
       * You are out of contract.
       *
       * The single most consequential thing that can happen to a fighter without them pressing a
       * button, and it was not reported anywhere. A player who trains through the end of their
       * deal finds out by noticing their own hub has changed — which is exactly the "it just gets
       * lost" failure the inbox was built to fix.
       *
       * A decision rather than a notice, so it blocks: being a free agent and not knowing it
       * means sitting idle, and sitting idle is how a career quietly ends.
       */
      /*
       * Two different situations wear the same name, and only one of them is an emergency.
       *
       * A fighter with no promotion at all is genuinely adrift and this must block the advance.
       * A fighter who has a promotion but no written agreement is the *seeded* default — every
       * fighter in the starting world is in that state — and blocking there would stop the clock
       * on the first step of every taken-over career for a situation that is not a problem.
       */
      const unattached = !me.promotionId;
      const lapsed = agreement !== undefined && status?.expired === true;

      if (unattached || lapsed) {
        raised += raise(db, {
          id: inboxId(Math.floor(day / 30) * 30, 'freeagent'),
          day,
          kind: 'contract',
          priority: unattached ? 'decision' : 'notable',
          title: promotion ? `You are out of contract at ${promotion.shortName}` : 'You have no promotion',
          body: promotion
            ? `Your deal with ${promotion.shortName} is done. Nobody is obliged to book you, and every week without a fight is a week your name gets smaller. See who wants you.`
            : 'You are not signed to anybody. No promotion has to offer you a fight, and time out of the cage costs you.',
          actions: unattached
            ? [
                {
                  id: 'acknowledge',
                  label: 'Understood',
                  detail: 'Handle it yourself.',
                  isDismiss: true,
                },
              ]
            : undefined,
          link: { route: 'offers' },
          fighterId: me.id,
        })
          ? 1
          : 0;
      } else if (status) {
        // The warning shot. Notable at two months, a decision inside one — the difference between
        // "worth knowing" and "act now" is what makes the priority mean anything.
        const daysLeft = status.daysRemaining;
        const nearlyOut = status.fightsRemaining <= 1 || daysLeft <= 60;

        if (nearlyOut) {
          raised += raise(db, {
            id: inboxId(Math.floor(day / 30) * 30, 'yourdeal'),
            day,
            kind: 'contract',
            priority: daysLeft <= 30 || status.fightsRemaining === 0 ? 'decision' : 'notable',
            title: `Your ${promotion?.shortName ?? 'contract'} deal is nearly up`,
            body: `${daysLeft} days and ${status.fightsRemaining} ${
              status.fightsRemaining === 1 ? 'fight' : 'fights'
            } left. Once it lapses you are a free agent and nobody owes you a booking — worth knowing what else is out there before then.`,
            actions:
              daysLeft <= 30 || status.fightsRemaining === 0
                ? [{ id: 'acknowledge', label: 'Understood', isDismiss: true }]
                : undefined,
            link: { route: 'offers' },
            fighterId: me.id,
          })
            ? 1
            : 0;
        }
      }

      /*
       * Off suspension. Keyed on the day the suspension *ends* rather than on today, so it is
       * raised exactly once no matter when the scan happens to catch it — which is the fix for
       * the exact-match bug that made this unreachable.
       */
      if (me.readyOnDay !== undefined && me.readyOnDay <= day) {
        raised += raise(db, {
          id: inboxId(me.readyOnDay, 'cleared'),
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

      // Healed up. Time passing is not only a cost, and nothing ever said so.
      const carrying = (me.injuries ?? []).filter((i) => i.healedDay > day);
      const lastHeal = (me.injuries ?? [])
        .map((i) => i.healedDay)
        .filter((d) => d <= day)
        .sort((a, b) => b - a)[0];
      if (carrying.length === 0 && lastHeal !== undefined) {
        raised += raise(db, {
          id: inboxId(lastHeal, 'healed'),
          day,
          kind: 'medical',
          priority: 'notable',
          title: 'You are fully fit',
          body: 'Nothing is carrying. This is as good as your body is going to feel before a camp.',
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


// --- Offers, answered ---------------------------------------------------------------------------

/**
 * Record what a corner said about a fight, so the answer survives the screen it arrived on.
 *
 * The inbox was the mode's thinnest system: two contract notices for a promoter and nothing
 * else, in a mode whose whole loop is now *offer, wait, hear back, decide*. An answer that only
 * exists as a chip on the card builder is an answer the player loses the moment they navigate,
 * and a counter-offer they never read is a fight that quietly does not happen.
 *
 * Deliberately keyed on the plan, the slot and the day, so re-sending an offer after changing
 * the terms writes a new item rather than silently overwriting the previous refusal.
 */
export function recordOfferOutcome(input: {
  db: GameDb;
  plan: EventPlan;
  slotId: string;
  bout: PlannedBout;
  accepted: boolean;
  answers: readonly CornerAnswer[];
}): void {
  const { db, plan, slotId, bout, accepted, answers } = input;
  const day = getWorld(db).day;

  const nameOf = (id: string): string => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : 'Somebody';
  };

  const red = nameOf(bout.redId as string);
  const blue = nameOf(bout.blueId as string);

  if (accepted) {
    raise(db, {
      id: inboxId(day, `offer:${plan.id}:${slotId}:accepted`),
      day,
      kind: 'offer',
      priority: 'routine',
      title: `${red} vs ${blue} is signed`,
      body: `Both corners have agreed${
        bout.titleKind ? ' — and it is for the belt' : ''
      }. It goes on ${plan.name}.`,
      link: { route: 'plan', id: plan.id },
      fighterId: bout.redId,
      opponentId: bout.blueId,
      promotionId: plan.promotionId,
    });
    return;
  }

  const counter = answers.find((a) => a.verdict === 'countered');
  const refusal = answers.find((a) => a.verdict === 'declined');

  if (counter) {
    raise(db, {
      id: inboxId(day, `offer:${plan.id}:${slotId}:counter`),
      day,
      kind: 'offer',
      // A counter is a decision with a price on it, and letting the clock run past one is how a
      // makeable fight becomes a hole in the card.
      priority: 'decision',
      title: `${nameOf(counter.fighterId as string)} wants ${money(counter.askingPurse ?? 0)}`,
      body: `${counter.note} The fight is ${red} vs ${blue} on ${plan.name}.`,
      actions: [
        { id: 'acknowledge', label: 'Understood', detail: 'Settle it on the card.', isDismiss: true },
      ],
      link: { route: 'plan', id: plan.id },
      fighterId: counter.fighterId,
      promotionId: plan.promotionId,
    });
    return;
  }

  if (refusal) {
    raise(db, {
      id: inboxId(day, `offer:${plan.id}:${slotId}:refused`),
      day,
      kind: 'offer',
      priority: 'notable',
      title: `${nameOf(refusal.fighterId as string)} turned the fight down`,
      body: `${refusal.note} ${red} vs ${blue} is off unless you change something.`,
      link: { route: 'plan', id: plan.id },
      fighterId: refusal.fighterId,
      promotionId: plan.promotionId,
    });
  }
}
