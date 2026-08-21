/**
 * What needs the fighter, derived from everything the simulation already knows.
 *
 * `attention.ts` is this module's sibling and did this for promoter mode. Doc 29 argued the case
 * once and it applies verbatim here: a running world produces enormous amounts of state, and the
 * career hub turned that into eighteen regions rendered in DOM order at roughly equal weight. A
 * player could open it and not know whether the most important thing on the screen was a torn
 * knee, an expiring contract or a title shot, because nothing ranked them against each other.
 *
 * Nothing here is new simulation. Every item is a question asked of state that was already there:
 * `activeInjuries` against the clock, `freshnessOf` against the next camp, `rustFor` against the
 * record, `releaseRisk` against the promotion, `offersFor` against the market. The work is
 * entirely in **noticing**, which is exactly the work a management game should be doing for the
 * player rather than leaving on the desk.
 *
 * Three rules, the first two inherited from `attention.ts`:
 *
 *  **Every item says why it is here.** A row the player cannot act on is noise, so each carries a
 *  claim, a consequence and somewhere to go. The types enforce it: `detail` and `title` are not
 *  optional, and there is no way to construct a `CareerSituation` that is merely a notification.
 *
 *  **Urgency is comparative, not absolute.** The dashboard shows the top handful, so a score has
 *  to mean something against every other kind of item. A carried injury and an expiring contract
 *  are scored on one scale here rather than each region of the screen deciding it is the most
 *  important thing on the page.
 *
 *  **Exactly one item is dominant.** `dominant()` returns the single action the dashboard leads
 *  with. That is the fix for the audit's worst finding — six `variant="primary"` buttons on one
 *  screen, none of which knew the others existed. It is a rule about *this* screen, not a rule
 *  about screens: a surface with two genuinely independent decisions may have two.
 */

import {
  TRAUMA_CONCERN,
  TRAUMA_MEDICAL,
  WEAR_CONCERN,
  activeInjuries,
  daysSinceLastBout,
  describeFreshness,
  describeReleaseRisk,
  describeRust,
  describeSolvency,
  describeTrigger,
  displayName,
  freshnessOf,
  releaseRisk,
  renegotiationTriggers,
  rustFor,
  rustLabel,
  weeksUntilFit,
  type Fighter,
  type Gym,
} from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';
import type { Route } from '../state/router';
import { getBooking, getOffers } from '../game/career';
import {
  contractStanding,
  offersOnTheTable,
  repaperOnTheTable,
} from '../game/contracts';
import { getLadderStatus } from '../game/progression';
import { inboxCount } from '../game/inbox';
import { campCostFor, solvencyOf } from '../game/money';

export type CareerSituationKind =
  | 'injury'
  | 'freshness'
  | 'rust'
  | 'trauma'
  | 'wear'
  | 'unsigned'
  | 'jobRisk'
  | 'repaper'
  | 'renegotiate'
  | 'offers'
  | 'titleShot'
  | 'booked'
  | 'noOpponents'
  | 'inbox'
  | 'money';

export type CareerTone = 'danger' | 'warn' | 'info' | 'good';

export interface CareerSituation {
  id: string;
  kind: CareerSituationKind;
  tone: CareerTone;
  /** 0–100. Higher is more urgent, and comparable across kinds. */
  urgency: number;
  /** The claim. States what is true, never the category. */
  title: string;
  /** One sentence: what it costs, or what it is worth, if nothing is done. */
  detail: string;
  /**
   * What the player would do about it.
   *
   * A typed `Route` rather than the string `attention.ts` carries, because the promoter
   * dashboard has to cast its own action back to a route at the call site and that cast is
   * exactly the sort of thing that survives a rename and then does not work.
   */
  action?: { label: string; route: Route };
  /**
   * Whether this item can be the screen's single dominant action.
   *
   * Not every situation wants to be: a trauma warning is real and urgent and there is nothing to
   * press. Marking it here rather than inferring it from `action` keeps "the most urgent thing"
   * and "the thing the button does" as separate judgements, which they are.
   */
  canLead?: boolean;
}

/**
 * Everything the career should be looking at, most urgent first.
 *
 * `limit` is applied by the caller: the dashboard wants four or five and a full situation list
 * wants all of them, and truncating here would make the second impossible.
 */
export function careerAttention(db: GameDb, fighter: Fighter): CareerSituation[] {
  const world = getWorld(db);
  const day = world.day;
  const items: CareerSituation[] = [];

  const booking = getBooking(fighter.id as string);
  const standing = contractStanding(db, fighter);
  const ladder = getLadderStatus(db, fighter);

  items.push(...bodyIssues(fighter, day, booking !== undefined));
  items.push(...activityIssues(db, fighter, day, booking !== undefined));
  items.push(...contractIssues(db, fighter, standing, ladder));
  items.push(...opportunityIssues(db, fighter, ladder, booking));
  items.push(...deskIssues(db, fighter));

  return items.sort((a, b) => b.urgency - a.urgency);
}

/**
 * The one thing the dashboard's primary button does.
 *
 * Deliberately a separate function rather than `careerAttention()[0]`: the most urgent situation
 * is often not the most actionable one. Accumulated head trauma outranks nearly everything on
 * the page and there is no button for it — the fighter's options are to keep going or to stop,
 * and neither is a control this screen owns.
 */
export function dominantAction(situations: readonly CareerSituation[]):
  | { label: string; route: Route; because: string }
  | undefined {
  const lead = situations.find((s) => s.canLead && s.action);
  if (!lead?.action) return undefined;
  return { label: lead.action.label, route: lead.action.route, because: lead.title };
}

// --- The body ----------------------------------------------------------------------------------

function bodyIssues(fighter: Fighter, day: number, booked: boolean): CareerSituation[] {
  const items: CareerSituation[] = [];
  const carrying = activeInjuries(fighter.injuries ?? [], day);

  if (carrying.length > 0) {
    const weeks = weeksUntilFit(carrying, day);
    const worst = carrying.reduce((a, b) => (a.severity >= b.severity ? a : b));
    items.push({
      id: 'injury',
      kind: 'injury',
      tone: worst.severity > 0.55 ? 'danger' : 'warn',
      // Carrying something into a booked fight is worse than carrying it between them, because
      // there is a date attached to it.
      urgency: (worst.severity > 0.55 ? 88 : 72) + (booked ? 6 : 0),
      title:
        carrying.length === 1
          ? `You are hurt — ${weeks} week${weeks === 1 ? '' : 's'} until you are fit`
          : `You are carrying ${carrying.length} injuries — ${weeks} week${weeks === 1 ? '' : 's'} until fit`,
      detail: booked
        ? 'You have a fight booked. Fighting hurt costs you the attributes the injury touches, and nobody outside your camp knows.'
        : 'Resting until you are fit costs weeks. Fighting through it costs the attributes the injury touches, and your opponent will not be told.',
      action: { label: 'Rest until fit', route: { name: 'training' } },
      canLead: true,
    });
  }

  const freshness = freshnessOf(fighter);
  if (freshness < 45) {
    items.push({
      id: 'freshness',
      kind: 'freshness',
      tone: freshness < 25 ? 'danger' : 'warn',
      urgency: freshness < 15 ? 80 : freshness < 25 ? 66 : 48,
      title: `Running on empty — ${describeFreshness(freshness)}`,
      detail:
        'Nothing about your ability has changed. You have not recovered from what you have already done, and it comes back more slowly the more miles you have on you.',
      action: { label: 'Rest', route: { name: 'training' } },
      // Only when it is bad enough to be the actual answer. Below that it is context for a
      // decision rather than the decision.
      canLead: freshness < 25 && !booked,
    });
  }

  /*
   * Damage, which is a fact rather than a task.
   *
   * No action, and `canLead` is never set. There is no button for accumulated trauma: the
   * fighter's options are to keep going or to stop, and the screen would be lying if it offered
   * a control that made it better. It is here because it has to outrank an offer in the ranking,
   * not because it is something to press.
   */
  if (fighter.condition.headTrauma >= TRAUMA_CONCERN) {
    const medical = fighter.condition.headTrauma >= TRAUMA_MEDICAL;
    items.push({
      id: 'trauma',
      kind: 'trauma',
      tone: medical ? 'danger' : 'warn',
      urgency: medical ? 84 : 52,
      title: medical ? 'Your chin is going' : 'Damage is accumulating',
      detail: `Head trauma ${Math.round(fighter.condition.headTrauma)} of 100. It only ever goes up, and it permanently lowers what your chin can absorb.`,
    });
  }

  if (fighter.condition.bodyWear >= WEAR_CONCERN) {
    items.push({
      id: 'wear',
      kind: 'wear',
      tone: fighter.condition.bodyWear >= 55 ? 'warn' : 'info',
      urgency: fighter.condition.bodyWear >= 55 ? 46 : 28,
      title: `The body is wearing — ${Math.round(fighter.condition.bodyWear)} of 100`,
      detail:
        'Joints and soft tissue. It raises the chance a camp hurts you and slows how fast you come back from everything else.',
    });
  }

  return items;
}

// --- Activity ----------------------------------------------------------------------------------

function activityIssues(
  db: GameDb,
  fighter: Fighter,
  day: number,
  booked: boolean,
): CareerSituation[] {
  const items: CareerSituation[] = [];

  /*
   * Ring rust, which the hub could not previously say at all to the person who most needed it.
   *
   * `describeRust` was rendered inside the *contracted* branch of the old hub's contract card, so
   * a free agent — by definition the fighter nobody is booking — never saw it. That is the exact
   * inversion this module exists to prevent: the state is computed for everybody, so it is
   * reported for everybody.
   */
  const daysSince = daysSinceLastBout(fighter.record, day);
  const rust = rustFor(daysSince ?? 0);
  if (rust > 0 && daysSince !== undefined) {
    const months = Math.round(daysSince / 30);
    items.push({
      id: 'rust',
      kind: 'rust',
      tone: rust > 0.5 ? 'warn' : 'info',
      urgency: 40 + Math.round(rust * 34),
      title: `${months} months inactive — ${rustLabel(rust)}`,
      detail: describeRust(rust),
      action: booked ? undefined : { label: 'Find a fight', route: { name: 'hub' } },
    });
  }

  if (!booked && getOffers(db, fighter).length === 0) {
    items.push({
      id: 'noOpponents',
      kind: 'noOpponents',
      tone: 'warn',
      urgency: 62,
      title: 'Nobody available to fight',
      detail:
        'Everybody you can be matched with has been fought too recently. Sitting out a few weeks changes the picture, and costs you sharpness while it does.',
      action: { label: 'Sit it out', route: { name: 'training' } },
      canLead: true,
    });
  }

  return items;
}

// --- The deal ----------------------------------------------------------------------------------

function contractIssues(
  db: GameDb,
  fighter: Fighter,
  standing: ReturnType<typeof contractStanding>,
  ladder: ReturnType<typeof getLadderStatus>,
): CareerSituation[] {
  const items: CareerSituation[] = [];

  if (standing.freeAgent || !standing.agreement) {
    items.push({
      id: 'unsigned',
      kind: 'unsigned',
      tone: 'warn',
      urgency: 76,
      title: 'You are a free agent',
      detail:
        'Nobody is obliged to offer you anything. Every week without a booking is a week your name gets smaller and your timing gets worse.',
      action: { label: 'See what is on the table', route: { name: 'contract' } },
      canLead: true,
    });
    return items;
  }

  const promotion = standing.promotion;
  if (promotion) {
    const risk = releaseRisk(fighter, promotion);
    if (risk > 0) {
      items.push({
        id: 'jobRisk',
        kind: 'jobRisk',
        tone: risk >= 0.45 ? 'danger' : 'warn',
        urgency: risk >= 0.45 ? 82 : 58,
        title: risk >= 0.45 ? 'You are fighting for your job' : 'Your place is slipping',
        detail: describeReleaseRisk(risk),
        action: { label: 'Your deal', route: { name: 'contract' } },
      });
    }
  }

  const repaper = repaperOnTheTable(db, fighter);
  if (repaper) {
    items.push({
      id: 'repaper',
      kind: 'repaper',
      tone: 'good',
      urgency: 70,
      title: 'They want to tear your contract up',
      detail: `${Math.round(repaper.uplift * 100)}% more from your next fight, in exchange for restarting the deal at ${repaper.terms.fightsOwed} fights owed. The offer may not come back at this price.`,
      action: { label: 'Read the terms', route: { name: 'contract' } },
      canLead: true,
    });
  }

  if (standing.agreement && promotion) {
    const triggers = renegotiationTriggers(standing.agreement, fighter, promotion, {
      isChampion: ladder.isChampion,
    });
    if (triggers.length > 0 && !repaper) {
      items.push({
        id: 'renegotiate',
        kind: 'renegotiate',
        tone: 'info',
        urgency: 50,
        title: 'You have grounds to reopen your deal',
        detail: describeTrigger(triggers[0]!),
        action: { label: 'Your deal', route: { name: 'contract' } },
      });
    }

    // Free agency approaching is anticipation rather than a problem, and it is the cheapest
    // anticipation in the design — a countdown makes free agency *arrive* rather than happen.
    const left = standing.status?.fightsRemaining ?? 0;
    if (left > 0 && left <= 1) {
      items.push({
        id: 'expiring',
        kind: 'renegotiate',
        tone: 'info',
        urgency: 54,
        title: 'One fight left on your deal',
        detail: `Win it and you are a free agent with leverage. Lose it and ${promotion.shortName} decide whether there is another one.`,
        action: { label: 'Your deal', route: { name: 'contract' } },
      });
    }
  }

  return items;
}

// --- What is on offer ---------------------------------------------------------------------------

function opportunityIssues(
  db: GameDb,
  fighter: Fighter,
  ladder: ReturnType<typeof getLadderStatus>,
  booking: ReturnType<typeof getBooking>,
): CareerSituation[] {
  const items: CareerSituation[] = [];

  if (booking) {
    const opponent = db.fighters.findById(booking.opponentId) as Fighter | undefined;
    const away = booking.bout.day - getWorld(db).day;
    items.push({
      id: 'booked',
      kind: 'booked',
      tone: 'info',
      urgency: 68,
      title: opponent
        ? `${booking.bout.isTitleFight ? 'Title fight' : 'Fight'} booked — ${displayName(opponent)}`
        : 'You have a fight booked',
      detail: `${away} days out, over ${booking.bout.rounds} rounds. The camp is where it is won.`,
      action: { label: 'Go to camp', route: { name: 'camp' } },
      canLead: true,
    });
  }

  /*
   * The market, summarised rather than reproduced.
   *
   * The old hub rendered every interested promotion as a card — twenty-two of them in a Medium
   * world — from a second offer engine that has now been deleted. One row, from the canonical
   * market, saying how many and what the best of them is.
   */
  const offers = offersOnTheTable(db, fighter);
  if (offers.length > 0) {
    const best = offers[0]!;
    items.push({
      id: 'offers',
      kind: 'offers',
      tone: 'good',
      urgency: 64,
      title: `${offers.length} promotion${offers.length === 1 ? '' : 's'} interested`,
      // `offersFor` sorts best money first, so `offers[0]` is the headline without this
      // module re-deciding what "best" means — which is how two screens end up disagreeing.
      detail: `Best of them is ${best.promotion.shortName}. ${best.money}${
        best.unmatchable.length > 0 ? ' They are offering something nobody else can match.' : ''
      }`,
      action: { label: 'Review offers', route: { name: 'contract' } },
      canLead: true,
    });
  }

  if (!booking && ladder.titleShot.eligible) {
    items.push({
      id: 'titleShot',
      kind: 'titleShot',
      tone: 'good',
      // Above everything except a body that cannot answer the bell. This is what the climb was
      // for, and burying it under a contract note would be absurd.
      urgency: 90,
      title: ladder.champion
        ? `You have earned a shot at ${displayName(ladder.champion)}`
        : 'You have earned a shot at the vacant title',
      detail: 'Five rounds, a ten-week camp, and the belt on the line.',
      action: { label: 'Take the title fight', route: { name: 'hub' } },
      canLead: true,
    });
  }

  return items;
}

// --- Waiting on you ------------------------------------------------------------------------------

function deskIssues(db: GameDb, fighter: Fighter): CareerSituation[] {
  const items: CareerSituation[] = [];

  const { blocking } = inboxCount(db);
  if (blocking > 0) {
    items.push({
      id: 'inbox',
      kind: 'inbox',
      tone: 'warn',
      // Above everything actionable: time will not move past these, so nothing else the player
      // presses is going to work until they are answered.
      urgency: 92,
      title: `${blocking} thing${blocking === 1 ? '' : 's'} waiting on an answer`,
      detail: 'Time will not move past these. Nothing else on this page happens until they are dealt with.',
      action: { label: 'Open the inbox', route: { name: 'inbox' } },
      canLead: true,
    });
  }

  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const solvency = solvencyOf(fighter, campCostFor(gym, 8));
  if (solvency !== 'comfortable') {
    items.push({
      id: 'money',
      kind: 'money',
      tone: solvency === 'desperate' || solvency === 'broke' ? 'danger' : 'warn',
      urgency: solvency === 'desperate' ? 74 : solvency === 'broke' ? 60 : 38,
      title:
        solvency === 'tight'
          ? 'You cannot afford the room you train in'
          : solvency === 'broke'
            ? 'You are in the red'
            : 'You need a payday',
      // The engine's own sentence rather than a second one written here. Money copy that
      // exists in two places is money copy that will disagree in one of them.
      detail: describeSolvency(solvency),
      action: { label: 'Camps and gyms', route: { name: 'training' } },
    });
  }

  return items;
}
