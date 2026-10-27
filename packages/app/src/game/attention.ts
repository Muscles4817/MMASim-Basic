/**
 * What needs the promoter, derived from everything the simulation already knows.
 *
 * The core UX principle of the mode, in one module. A running world produces enormous amounts of
 * state — two hundred contracts, four hundred fighters, a dozen belts, six months of scheduled
 * cards — and the old dashboard turned that into a roster count and a budget. The player was
 * expected to open twenty screens and read thirty ratings before discovering that their
 * lightweight champion had no defence booked and three deals expired next month.
 *
 * Nothing here is new simulation. Every item is a question asked of state that was already
 * there and that nothing was reading: `champions` against the plans, `activityGuarantee` against
 * the record, `expiresDay` against the clock, `starPower` against `overallRating`. The work is
 * entirely in *noticing*, which is exactly the work a management game should be doing for the
 * player instead of leaving on the desk.
 *
 * Two rules:
 *
 *  **Every item says why it is here.** A row a player cannot act on is noise, so each carries a
 *  subject, a sentence and somewhere to go.
 *
 *  **Urgency is comparative, not absolute.** The dashboard shows the top handful, so an item's
 *  score has to mean something against every other kind of item — which is why they are all
 *  scored on one scale here rather than each screen picking its own.
 */

import {
  agreementStatus,
  careerArc,
  displayName,
  getDivision,
  isActive,
  attributesSeenBy,
  overallRating,
  plannedBouts,
  planProgress,
  rankDivision,
  rankOf,
  type EventPlan,
  type Fighter,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';
import { bookingsFor, daysUnbookedBy, isSigned, planName, plansFor } from './plans';
import { holdsABeltAnywhere } from './world';
import { walkDay } from './alerts';
import type { InboxLink } from '@mmasim/engine';

export type AttentionKind =
  'card' | 'title' | 'activity' | 'contract' | 'morale' | 'medical' | 'opportunity' | 'money';

export type AttentionTone = 'danger' | 'warn' | 'info' | 'good';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: AttentionTone;
  /** 0–100. Higher is more urgent, comparable across kinds. */
  urgency: number;
  /** The headline. Names the subject, never the category. */
  title: string;
  /** One sentence: what is true, and what it costs if ignored. */
  detail: string;
  /** What the player would do about it. Carries a slot when the problem is one bout. */
  action?: { label: string } & InboxLink;
  fighterId?: string;
}

/**
 * Everything the promotion should be looking at, most urgent first.
 *
 * `limit` is applied by the caller rather than here: the dashboard wants five and the issues
 * screen wants all of them, and truncating in the producer would make the second impossible.
 */
export function attentionFor(db: GameDb, promotion: Promotion | undefined): AttentionItem[] {
  if (!promotion) return [];
  const world = getWorld(db);
  const day = world.day;
  const items: AttentionItem[] = [];

  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id && isActive(f, day),
  );
  const plans = plansFor(db, promotion.id as string);
  const upcoming = plans.filter((p) => p.day >= day);

  // Who is already on something, and where, so "needs booking" means what it says and a
  // suspension can be measured against the bout rather than against today.
  const booked = bookingsFor(db, promotion.id as string);

  const startedDay = world.startedDay ?? day;

  items.push(...cardIssues(db, upcoming, day));
  items.push(...titleIssues({ db, promotion, roster, upcoming, day, startedDay, booked }));
  items.push(...rosterIssues({ db, promotion, roster, day, startedDay, booked }));

  return items.sort((a, b) => b.urgency - a.urgency);
}

// --- Cards -------------------------------------------------------------------------------------

function cardIssues(db: GameDb, plans: readonly EventPlan[], day: number): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (plans.length === 0) {
    items.push({
      id: 'card:none',
      kind: 'card',
      tone: 'danger',
      urgency: 96,
      title: 'Nothing on the calendar',
      detail:
        'You have no cards planned. Overheads are being paid either way, and a promotion that is not running shows is a promotion that is shrinking.',
      action: { label: 'Plan a card', route: 'calendar', id: 'new' },
    });
    return items;
  }

  for (const plan of plans) {
    const away = plan.day - day;
    const bouts = plannedBouts(plan);
    const progress = planProgress(plan);
    const mainSlot = plan.slots.find((s) => s.position === 'mainEvent');
    const empty = plan.slots.length - bouts.length;
    const name = planName(db, plan);

    // The closer the card, the louder the same problem gets. A card in ten weeks with no main
    // event is a plan; the same card in ten days is an emergency.
    const pressure = away <= 21 ? 1 : away <= 56 ? 0.65 : 0.35;

    /*
     * Signed, not merely pencilled. This used to ask whether the main slot held *anything*, while
     * every other screen asked whether it was signed — so a card could read "Main event:
     * Confirmed" on one row and "has no main event" on the next.
     */
    if (!progress.hasMainEvent) {
      items.push({
        id: `card:main:${plan.id}`,
        kind: 'card',
        tone: away <= 28 ? 'danger' : 'warn',
        urgency: Math.round(60 + 38 * pressure),
        title: mainSlot?.bout ? `${name}'s main event is not signed` : `${name} has no main event`,
        detail: `${away} days out and nothing signed is topping the card. The main event sells the night; everything else stops it being a discount.`,
        action: { label: 'Book it', route: 'plan', id: plan.id, slot: mainSlot?.id },
      });
    }

    if (empty > 0 && away <= 45) {
      items.push({
        id: `card:empty:${plan.id}`,
        kind: 'card',
        tone: away <= 21 ? 'warn' : 'info',
        urgency: Math.round(35 + 30 * pressure),
        title: `${name} is ${empty} fight${empty === 1 ? '' : 's'} short`,
        detail: `${away} days to fill them. A thin card is worth less at the gate, and short notice costs more in purses.`,
        action: { label: 'Fill the card', route: 'plan', id: plan.id },
      });
    }

    const declined = bouts.filter((b) => b.status === 'declined').length;
    const firstDeclined = plan.slots.find((s) => s.bout?.status === 'declined');
    if (declined > 0) {
      items.push({
        id: `card:declined:${plan.id}`,
        kind: 'card',
        tone: 'warn',
        urgency: 72,
        title: `${declined} bout${declined === 1 ? '' : 's'} turned down on ${name}`,
        detail:
          'Those slots are still holding fights nobody agreed to. Replace them or send a better offer.',
        action: { label: 'Fix the card', route: 'plan', id: plan.id, slot: firstDeclined?.id },
      });
    }
  }

  return items;
}

// --- Belts -------------------------------------------------------------------------------------

function titleIssues(input: {
  db: GameDb;
  promotion: Promotion;
  roster: readonly Fighter[];
  upcoming: readonly EventPlan[];
  day: number;
  startedDay: number;
  booked: ReadonlyMap<string, unknown>;
}): AttentionItem[] {
  const { db, promotion, roster, upcoming, day, startedDay, booked } = input;
  const items: AttentionItem[] = [];
  const fighters = db.fighters.findAll() as Fighter[];
  const promotions = db.promotions.findAll() as unknown as Promotion[];

  /*
   * Champions with nothing booked, collected rather than pushed one at a time.
   *
   * A promotion with eight divisions and no cards planned produces eight identical rows, which
   * buries everything specific under a wall of the same sentence. One row that says "six belts
   * are going undefended" is the thing a promoter actually needs to know; the individual ones
   * only earn their place once there are a couple of them.
   */
  const undefended: { champion: Fighter; divisionId: string; idle: number }[] = [];

  for (const divisionId of promotion.divisions) {
    const championId = promotion.champions[divisionId];
    const ranked = rankDivision(fighters, divisionId, promotion.id, day, championId, promotions);

    /*
     * A vacant belt in a division with contenders in it. The single most obvious thing a
     * promotion has to do, and nothing in the game ever mentioned it.
     */
    if (!championId) {
      const contenders = ranked.filter((r) => r.position > 0).slice(0, 2);
      if (contenders.length === 2) {
        items.push({
          id: `title:vacant:${divisionId}`,
          kind: 'title',
          tone: 'warn',
          urgency: 78,
          title: `The ${getDivision(divisionId).name} belt is vacant`,
          detail: `${displayName(contenders[0]!.fighter)} and ${displayName(
            contenders[1]!.fighter,
          )} are the top two. A division without a champion has nothing to climb toward.`,
          action: { label: 'Make the fight', route: 'calendar' },
        });
      }
      continue;
    }

    const champion = db.fighters.findById(championId as string) as Fighter | undefined;
    if (!champion) continue;

    const idle = daysUnbookedBy(champion, day, startedDay);
    const hasDefence = booked.has(champion.id as string);

    if (!hasDefence && idle > 180) {
      undefended.push({ champion, divisionId: divisionId as string, idle });
    }

    /*
     * A #1 contender on a run with nothing to fight for. The queue backing up is the other half
     * of the same problem, and it is what makes a division feel alive or stagnant.
     */
    const top = ranked.find((r) => r.position === 1);
    if (
      top &&
      !booked.has(top.fighter.id as string) &&
      top.fighter.summary.streak >= 3 &&
      top.fighter.personality.ambition >= 50
    ) {
      items.push({
        id: `title:contender:${divisionId}`,
        kind: 'opportunity',
        tone: 'info',
        urgency: 58,
        title: `${displayName(top.fighter)} wants a title shot`,
        detail: `#1 at ${getDivision(divisionId).name} on a ${top.fighter.summary.streak}-fight run, unbooked. They have done what you asked. The division is watching what you do about it.`,
        action: { label: 'Look at the fight', route: 'fighter', id: top.fighter.id as string },
        fighterId: top.fighter.id as string,
      });
    }
  }

  undefended.sort((a, b) => b.idle - a.idle);

  if (undefended.length > 2) {
    items.push({
      id: 'title:undefended',
      kind: 'title',
      tone: 'warn',
      urgency: 82,
      title: `${undefended.length} belts are going undefended`,
      detail: `${undefended
        .slice(0, 3)
        .map((u) => displayName(u.champion))
        .join(
          ', ',
        )} and the rest have nothing booked. A belt nobody defends stops meaning anything.`,
      action: { label: 'Open championships', route: 'champions' },
    });
  } else {
    for (const { champion, divisionId, idle } of undefended) {
      items.push({
        id: `title:defence:${divisionId}`,
        kind: 'title',
        tone: idle > 330 ? 'danger' : 'warn',
        urgency: idle > 330 ? 88 : 70,
        title: `${displayName(champion)} has no defence booked`,
        detail: `${Math.round(idle / 30)} months since the ${getDivision(divisionId as never).name} champion last fought, and nothing on any card. A belt nobody defends stops meaning anything.`,
        action: { label: 'Book a defence', route: 'fighter', id: champion.id as string },
        fighterId: champion.id as string,
      });
    }
  }

  void upcoming;
  void roster;
  return items;
}

// --- People ------------------------------------------------------------------------------------

function rosterIssues(input: {
  db: GameDb;
  promotion: Promotion;
  roster: readonly Fighter[];
  day: number;
  startedDay: number;
  booked: ReturnType<typeof bookingsFor>;
}): AttentionItem[] {
  const { db, promotion, roster, day, startedDay, booked } = input;
  const items: AttentionItem[] = [];

  /*
   * Ranks once per division, not once per fighter.
   *
   * `rankDivision` walks the whole fighter table. Calling it inside the per-fighter loop made the
   * dashboard quadratic in roster size — two hundred fighters meant two hundred full-table scans
   * on every navigation — for an answer that is identical for everybody in the same division.
   */
  const fighters = db.fighters.findAll() as Fighter[];
  const ranks = new Map<string, ReturnType<typeof rankDivision>>();
  for (const divisionId of new Set(roster.map((f) => f.divisionId as string))) {
    ranks.set(
      divisionId,
      rankDivision(
        fighters,
        divisionId as never,
        promotion.id,
        day,
        promotion.champions[divisionId as never],
      ),
    );
  }

  let owedSoon = 0;
  let expiring = 0;
  const declining: AttentionItem[] = [];

  for (const fighter of roster) {
    const agreement = fighter.agreementId
      ? (db.agreements.findById(fighter.agreementId as string) as PromotionalAgreement | undefined)
      : undefined;
    const idle = daysUnbookedBy(fighter, day, startedDay);
    const id = fighter.id as string;

    // --- The activity guarantee, which is a promise with a penalty attached --------------
    if (agreement) {
      /*
       * Measured from the day they can actually walk (`walkDay`), not from the contract's age.
       * The old arithmetic was `365 - contractAge`, which reads zero for every deal older than a
       * year — "put them on a card within 0 days", from the first day of a save, against a
       * fourteen-day minimum lead.
       */
      const left = walkDay(db, fighter, agreement) - day;

      // Signed, not pencilled: the same test the clock holds them on (`isSigned`).
      if (left <= 60 && !isSigned(booked, id) && !holdsABeltAnywhere(db, fighter)) {
        owedSoon += 1;
        if (left <= 30) {
          items.push({
            id: `activity:${id}`,
            kind: 'activity',
            tone: 'danger',
            urgency: 92,
            title:
              left <= 0
                ? `${displayName(fighter)} can walk for nothing`
                : `${displayName(fighter)} can walk in ${left} days`,
            detail:
              left <= 0
                ? `You owe them ${agreement.activityGuarantee} bouts a year and have not delivered. They are free to leave any day; a booking is the only thing that holds them.`
                : `You owe them ${agreement.activityGuarantee} bouts a year and have not delivered. Book them before then and they stay.`,
            action: { label: 'Book them', route: 'fighter', id },
            fighterId: id,
          });
        }
      }

      // --- Contracts running out ---------------------------------------------------------
      const status = agreementStatus(agreement, day, {
        isChampion: promotion.champions[fighter.divisionId] === fighter.id,
      });
      if (status.fightsRemaining <= 1 && !status.heldByBelt) {
        expiring += 1;
        // Only the ones worth keeping earn a row of their own; the rest are counted below.
        // Worth keeping as a promoter can judge it: from the scouted read, never the true ratings.
        if (fighter.starPower >= 40 || overallRating(attributesSeenBy(fighter, 'promoter')) >= 62) {
          items.push({
            id: `contract:${id}`,
            kind: 'contract',
            tone: status.fightsRemaining === 0 ? 'danger' : 'warn',
            urgency: status.fightsRemaining === 0 ? 84 : 66,
            title:
              status.fightsRemaining === 0
                ? `${displayName(fighter)} is free to talk to anybody`
                : `${displayName(fighter)} has one fight left`,
            detail:
              status.fightsRemaining === 0
                ? 'Their obligations are met. Somebody else can sign them tomorrow, and you get nothing for it.'
                : 'One more and the deal is done. Extend now or find out what they are worth on the open market.',
            action: { label: 'Open their deal', route: 'fighter', id },
            fighterId: id,
          });
        }
      }
    }

    // --- Unhappy ----------------------------------------------------------------------------
    if (fighter.resentment > 60) {
      items.push({
        id: `morale:${id}`,
        kind: 'morale',
        tone: 'warn',
        urgency: 62,
        title: `${displayName(fighter)} is unhappy with the deal`,
        detail:
          'They believe the contract has stopped matching the fighter. It is already making them harder to book.',
        action: { label: 'Look at it', route: 'fighter', id },
        fighterId: id,
      });
    } else if (idle > 300 && !booked.has(id) && fighter.record.length > 0) {
      items.push({
        id: `idle:${id}`,
        kind: 'activity',
        tone: 'warn',
        urgency: 55,
        title: `${displayName(fighter)} is unhappy with the inactivity`,
        detail: `${Math.round(idle / 30)} months without a fight and nothing booked. Fighters do not wait quietly, and layoffs cost them sharpness you are paying for.`,
        action: { label: 'Find them a fight', route: 'fighter', id },
        fighterId: id,
      });
    }

    // --- Medical -----------------------------------------------------------------------------
    /*
     * Against the bout, not against today. Comparing with today flagged every fighter booked
     * while still serving a suspension that would be long over by fight night — "suspended 27
     * days" against a card 84 days away — which is most of why booking a card made the alert
     * count jump.
     */
    const booking = booked.get(id);
    if (booking && (fighter.readyOnDay ?? 0) > booking.plan.day) {
      items.push({
        id: `medical:${id}`,
        kind: 'medical',
        tone: 'danger',
        urgency: 90,
        title: `${displayName(fighter)} is booked and will not be cleared`,
        detail: `Their suspension runs ${(fighter.readyOnDay ?? 0) - booking.plan.day} days past ${planName(db, booking.plan)}, so they cannot fight on it. Replace them, or move the bout.`,
        action: {
          label: 'Look at the bout',
          route: 'plan',
          id: booking.plan.id,
          slot: booking.slotId,
        },
        fighterId: id,
      });
    }

    // --- Opportunities ------------------------------------------------------------------------
    const rank = rankOf(ranks.get(fighter.divisionId as string) ?? [], fighter.id);
    const arc = careerArc({ fighter, day, rank });

    if (arc.id === 'hotProspect' && !booked.has(id)) {
      items.push({
        id: `prospect:${id}`,
        kind: 'opportunity',
        tone: 'good',
        urgency: 48,
        title: `${displayName(fighter)} is ready for a step up`,
        detail: `${fighter.summary.wins}–${fighter.summary.losses} and ${fighter.summary.streak} straight. Test them now or keep building — either is a decision, and doing nothing is not.`,
        action: { label: 'Match them', route: 'fighter', id },
        fighterId: id,
      });
    }

    if (arc.id === 'decliningStar') {
      declining.push({
        id: `decline:${id}`,
        kind: 'opportunity',
        tone: 'warn',
        urgency: 44,
        title: `${displayName(fighter)} still sells and no longer wins`,
        detail:
          'The name is worth more than the fighter now. There is money in that for a while, and there is a point past which there is not.',
        action: { label: 'Look at them', route: 'fighter', id },
        fighterId: id,
      });
    }
  }

  /*
   * Fading names, folded together past a couple. The biggest promotion opened its first day on
   * seven separate "still sells and no longer wins" rows, which is a fact about the roster's age
   * profile rather than seven decisions.
   */
  if (declining.length > 2) {
    items.push({
      id: 'decline:many',
      kind: 'opportunity',
      tone: 'warn',
      urgency: 44,
      title: `${declining.length} names still sell and no longer win`,
      detail:
        'The names are worth more than the fighters now. There is money in that for a while, and a point past which there is not.',
      action: { label: 'Open the roster', route: 'promoterRoster' },
    });
  } else {
    items.push(...declining);
  }

  // Aggregate rows rather than forty individual ones. A promoter needs to know that eight
  // people are owed a bout; they do not need eight rows saying so.
  if (owedSoon >= 3) {
    items.push({
      id: 'activity:many',
      kind: 'activity',
      tone: 'warn',
      urgency: 75,
      title: `${owedSoon} fighters are owed a bout`,
      detail:
        'Each of them is inside a year of their activity guarantee with nothing booked. Every one you miss walks for free.',
      action: { label: 'Open the roster', route: 'promoterRoster' },
    });
  }

  if (expiring >= 3) {
    items.push({
      id: 'contract:many',
      kind: 'contract',
      tone: 'info',
      urgency: 52,
      title: `${expiring} contracts end after the next fight`,
      detail: 'Decide who you are keeping before somebody else does it for you.',
      action: { label: 'Open the roster', route: 'promoterRoster' },
    });
  }

  return items;
}
