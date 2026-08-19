/**
 * A card as a plan, months before it is a card.
 *
 * The mode's central missing noun. `FightNight` is a *finished* thing — every bout is real,
 * ordered and about to be fought — so the only way to reach one was to assemble nine fights in
 * a single sitting and press go. That is not what running a promotion is. A promoter knows in
 * January that they want their lightweight champion to defend in April, and does not know who
 * the opponent is until March.
 *
 * So an `EventPlan` is a card with **holes in it that are allowed to stay there**. It is
 * authored state, not derived state — the one thing on the calendar the player has written
 * rather than the simulation — which is why it is stored rather than recomputed, and why every
 * question a screen asks about it (is it complete, does anybody clash, has anybody said yes) is
 * a pure function over the slots rather than a second field that can go stale.
 *
 * The plan becomes a `FightNight` exactly once, on the night, by handing its agreed bouts to
 * `buildCard`. Everything before that is planning.
 */

import type { GameDay } from '../core/clock.js';
import type { DivisionId, FighterId, PromotionId } from '../core/ids.js';
import type { Broadcast } from './events.js';
import { MAIN_CARD_SIZE, PRELIM_CARD_SIZE } from './events.js';
import type { CardPosition } from './money.js';

/**
 * How big a night this is meant to be.
 *
 * Not cosmetic: the shape decides how many slots exist, which decides how much matchmaking the
 * player has signed themselves up for. A promoter running a small hall show should not be asked
 * to make nine fights, and a promoter announcing their year's biggest card should not be capped
 * at the same nine as a Tuesday.
 */
export type EventScale = 'club' | 'standard' | 'flagship';

export interface EventScaleDef {
  id: EventScale;
  label: string;
  blurb: string;
  mainCard: number;
  prelims: number;
}

export const EVENT_SCALES: readonly EventScaleDef[] = [
  {
    id: 'club',
    label: 'Club show',
    blurb: 'Six fights in a small room. Cheap, quick to fill, and where prospects are made.',
    mainCard: 3,
    prelims: 3,
  },
  {
    id: 'standard',
    label: 'Standard card',
    blurb: 'The normal night: a main card of five and four prelims underneath it.',
    mainCard: MAIN_CARD_SIZE,
    prelims: PRELIM_CARD_SIZE,
  },
  {
    id: 'flagship',
    label: 'Flagship',
    blurb: 'Your biggest night of the year. Twelve fights, and the whole roster wants on it.',
    mainCard: 6,
    prelims: 6,
  },
];

export const eventScale = (id: EventScale): EventScaleDef =>
  EVENT_SCALES.find((s) => s.id === id) ?? EVENT_SCALES[1]!;

/**
 * Which belt, and in what state.
 *
 * `isTitleFight: boolean` cannot express the three situations a promoter actually deals with,
 * and the difference between them is a matchmaking decision rather than a label: an interim
 * belt exists because the champion cannot fight, and a vacant one because there is no champion
 * at all. A screen that cannot say which is asking the player to guess.
 */
export type TitleKind = 'undisputed' | 'interim' | 'vacant';

/** Where a corner stands on an offer. */
export type CornerVerdict = 'accepted' | 'declined' | 'countered';

export interface CornerAnswer {
  fighterId: FighterId;
  verdict: CornerVerdict;
  /** What they said, in their own terms. Never a probability. */
  note: string;
  /** Thousands. Present on a counter: what it would take. */
  askingPurse?: number;
}

/**
 * How far along one bout is.
 *
 * `draft` is the player's intention and costs nothing — a name pencilled into a slot, which is
 * the whole point of planning ahead. Nothing is offered to anybody until the player sends it.
 */
export type PlannedBoutStatus = 'draft' | 'offered' | 'agreed' | 'declined';

export interface PlannedBout {
  redId: FighterId;
  blueId: FighterId;
  divisionId: DivisionId;
  status: PlannedBoutStatus;
  titleKind?: TitleKind;
  /** Five only for a main event or a title fight, which is the sport's own rule. */
  rounds: 3 | 5;
  /** Agreed at a weight neither fighter's division owns. */
  catchweightLbs?: number;
  answers?: readonly CornerAnswer[];
  /** The day the offer went out, so short notice can be judged against the card date. */
  offeredDay?: GameDay;
}

export interface PlanSlot {
  /** Stable across edits, so a React key and an offer can both point at the same slot. */
  id: string;
  position: CardPosition;
  bout?: PlannedBout;
}

export type PlanStatus = 'planning' | 'announced' | 'run' | 'cancelled';

export interface EventPlan {
  id: string;
  promotionId: PromotionId;
  day: GameDay;
  name: string;
  city: string;
  country: string;
  venueName?: string;
  scale: EventScale;
  broadcast: Broadcast;
  status: PlanStatus;
  slots: readonly PlanSlot[];
  /** The night this plan became, once it has been run. */
  nightId?: string;
}

// --- Building and editing ---------------------------------------------------------------------

/** The slot ladder for a scale: one main event, one co-main, then main card and prelims. */
export function slotsFor(scale: EventScale): PlanSlot[] {
  const def = eventScale(scale);
  const slots: PlanSlot[] = [
    { id: 'main', position: 'mainEvent' },
    { id: 'co', position: 'coMain' },
  ];
  // The main card holds everything above the prelims *except* the top two, which already exist.
  for (let i = 0; i < Math.max(0, def.mainCard - 2); i++) {
    slots.push({ id: `card-${i}`, position: 'mainCard' });
  }
  for (let i = 0; i < def.prelims; i++) {
    slots.push({ id: `prelim-${i}`, position: 'prelim' });
  }
  return slots;
}

/**
 * Change a plan's size without throwing away what is already booked.
 *
 * Shrinking a card that has fights on it is a real decision — the fights at the bottom come off
 * — so the bouts that survive are carried across by position and the overflow is returned rather
 * than silently deleted, which lets the screen say what the change would cost before it happens.
 */
export function rescale(
  plan: EventPlan,
  scale: EventScale,
): {
  plan: EventPlan;
  dropped: readonly PlannedBout[];
} {
  const next = slotsFor(scale);
  const dropped: PlannedBout[] = [];

  for (const position of ['mainEvent', 'coMain', 'mainCard', 'prelim'] as const) {
    const existing = plan.slots.filter((s) => s.position === position && s.bout);
    const targets = next.filter((s) => s.position === position);
    existing.forEach((slot, i) => {
      const target = targets[i];
      if (target) target.bout = slot.bout;
      else if (slot.bout) dropped.push(slot.bout);
    });
  }

  return { plan: { ...plan, scale, slots: next }, dropped };
}

export function withSlot(
  plan: EventPlan,
  slotId: string,
  bout: PlannedBout | undefined,
): EventPlan {
  return {
    ...plan,
    slots: plan.slots.map((slot) => (slot.id === slotId ? { ...slot, bout } : slot)),
  };
}

export const slotOf = (plan: EventPlan, slotId: string): PlanSlot | undefined =>
  plan.slots.find((s) => s.id === slotId);

export const plannedBouts = (plan: EventPlan): readonly PlannedBout[] =>
  plan.slots.map((s) => s.bout).filter((b): b is PlannedBout => b !== undefined);

/** Everybody the plan has a name written against, whether or not they have agreed. */
export function fightersIn(plan: EventPlan): Set<string> {
  const ids = new Set<string>();
  for (const bout of plannedBouts(plan)) {
    ids.add(bout.redId as string);
    ids.add(bout.blueId as string);
  }
  return ids;
}

/**
 * Five rounds for a main event or a belt, three for everything else.
 *
 * Derived rather than asked, because there is no promotion in the sport where this is a free
 * choice and a dropdown with one correct answer is not a decision.
 */
export const roundsFor = (position: CardPosition, titleKind?: TitleKind): 3 | 5 =>
  position === 'mainEvent' || titleKind !== undefined ? 5 : 3;

// --- Reading a plan ---------------------------------------------------------------------------

export interface PlanProgress {
  slots: number;
  /** Slots with a name in them, agreed or not. */
  filled: number;
  agreed: number;
  offered: number;
  declined: number;
  /** True when every slot holds a bout both corners have signed. */
  complete: boolean;
  hasMainEvent: boolean;
  titleFights: number;
}

export function planProgress(plan: EventPlan): PlanProgress {
  const bouts = plannedBouts(plan);
  const main = plan.slots.find((s) => s.position === 'mainEvent');

  return {
    slots: plan.slots.length,
    filled: bouts.length,
    agreed: bouts.filter((b) => b.status === 'agreed').length,
    offered: bouts.filter((b) => b.status === 'offered').length,
    declined: bouts.filter((b) => b.status === 'declined').length,
    complete: bouts.length === plan.slots.length && bouts.every((b) => b.status === 'agreed'),
    hasMainEvent: main?.bout?.status === 'agreed',
    titleFights: bouts.filter((b) => b.titleKind !== undefined).length,
  };
}

/**
 * What is wrong with this card, in the order a promoter would care.
 *
 * Deliberately about the *plan* rather than about the world: whether a fighter is injured or
 * suspended depends on state this module cannot see, and the app layer adds those. What lives
 * here is everything answerable from the plan alone, which is what makes it testable without a
 * database and reusable by the calendar, the dashboard and the builder without three copies.
 */
export type PlanIssueKind =
  'noMainEvent' | 'emptySlots' | 'doubleBooked' | 'declined' | 'awaitingAnswer';

export interface PlanIssue {
  kind: PlanIssueKind;
  /** Higher sorts first. */
  urgency: number;
  message: string;
}

export function planIssues(plan: EventPlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const progress = planProgress(plan);
  const main = plan.slots.find((s) => s.position === 'mainEvent');

  if (!main?.bout) {
    issues.push({
      kind: 'noMainEvent',
      urgency: 100,
      message: 'No main event. Nothing sells this night yet.',
    });
  }

  if (progress.declined > 0) {
    issues.push({
      kind: 'declined',
      urgency: 90,
      message:
        progress.declined === 1
          ? 'One bout was turned down and the slot is still holding it.'
          : `${progress.declined} bouts were turned down.`,
    });
  }

  // Somebody written into two slots. Easy to do across three months of planning and impossible
  // to spot by reading nine rows.
  const seen = new Map<string, number>();
  for (const bout of plannedBouts(plan)) {
    for (const id of [bout.redId as string, bout.blueId as string]) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  const clashes = [...seen.values()].filter((n) => n > 1).length;
  if (clashes > 0) {
    issues.push({
      kind: 'doubleBooked',
      urgency: 95,
      message:
        clashes === 1
          ? 'Somebody is booked in two fights on this card.'
          : `${clashes} fighters are booked twice on this card.`,
    });
  }

  const empty = progress.slots - progress.filled;
  if (empty > 0) {
    issues.push({
      kind: 'emptySlots',
      urgency: 50,
      message: `${empty} slot${empty === 1 ? '' : 's'} still empty.`,
    });
  }

  if (progress.offered > 0) {
    issues.push({
      kind: 'awaitingAnswer',
      urgency: 30,
      message: `${progress.offered} offer${progress.offered === 1 ? '' : 's'} still out.`,
    });
  }

  return issues.sort((a, b) => b.urgency - a.urgency);
}

/** A one-line state for a calendar row: what this card looks like from a distance. */
export type PlanHealth = 'ready' | 'thin' | 'atRisk' | 'empty' | 'run' | 'cancelled';

export function planHealth(plan: EventPlan): PlanHealth {
  if (plan.status === 'run') return 'run';
  if (plan.status === 'cancelled') return 'cancelled';

  const progress = planProgress(plan);
  if (progress.filled === 0) return 'empty';
  if (!progress.hasMainEvent || progress.declined > 0) return 'atRisk';
  if (progress.agreed < progress.slots) return 'thin';
  return 'ready';
}

export function describeHealth(health: PlanHealth): string {
  switch (health) {
    case 'ready':
      return 'Card complete';
    case 'thin':
      return 'Still filling';
    case 'atRisk':
      return 'Needs a main event';
    case 'empty':
      return 'Nothing booked';
    case 'run':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
  }
}
