/**
 * The inbox.
 *
 * The game had one channel for telling the player anything: the news feed, which is a
 * chronological list of things that happened to other people. Anything that needed the
 * *player's attention* — a fighter about to walk, a contract expiring, an offer on the table, a
 * main event falling out — went into that same stream and was lost among sixty results.
 *
 * Two jobs, and the second is the one that did not exist:
 *
 * 1. **A staging ground.** Everything that matters to you, in one place, kept until you deal
 *    with it rather than scrolled past.
 * 2. **An interrupt.** Some items are decisions, and time must not run past a decision. A
 *    simulation that advances four weeks and then tells you your champion left in week one has
 *    taken the choice away and called it a notification.
 *
 * That second job is why this lives in the engine rather than in a React store: the advance
 * loop has to be able to stop on one, and the advance loop is not a screen.
 */

import type { GameDay } from '../core/clock.js';
import type { DivisionId, FighterId, PromotionId } from '../core/ids.js';

/**
 * How much this interrupts.
 *
 * Deliberately three levels rather than a numeric priority. A number invites sorting and
 * threshold-tuning; what the advance loop actually needs to know is a single yes/no — does this
 * stop the clock — and what the screen needs is whether to shout.
 */
export type InboxPriority =
  /** A decision. Time stops here until it is answered or explicitly dismissed. */
  | 'decision'
  /** Worth knowing before you carry on, but the clock does not stop. */
  | 'notable'
  /** A receipt. Read it or do not. */
  | 'routine';

export type InboxKind =
  | 'offer'
  | 'contract'
  | 'medical'
  | 'roster'
  | 'card'
  | 'result'
  | 'money'
  | 'career';

/** One action a decision offers. The handler lives in the app; this is the label and the id. */
export interface InboxAction {
  id: string;
  label: string;
  /** Shown under the label. States what it costs, rather than asking "are you sure". */
  detail?: string;
  /** True for the option that closes the item without doing anything. */
  isDismiss?: boolean;
}

export interface InboxItem {
  id: string;
  day: GameDay;
  kind: InboxKind;
  priority: InboxPriority;
  /** One line. Reads on its own, with no context. */
  title: string;
  body?: string;
  /** Present when this is a decision. */
  actions?: readonly InboxAction[];
  /** Where tapping the item goes, when it is not a decision. A route name plus params. */
  link?: { route: string; id?: string };

  fighterId?: FighterId;
  promotionId?: PromotionId;
  divisionId?: DivisionId;

  readDay?: GameDay;
  /** Set when a decision has been answered, with which action. */
  resolvedDay?: GameDay;
  resolvedWith?: string;
}

/**
 * Whether this item stops an advance.
 *
 * An unresolved decision does. A resolved one does not, however recently it was answered —
 * otherwise answering a decision would leave the clock jammed against it.
 */
export const isBlocking = (item: InboxItem): boolean =>
  item.priority === 'decision' && item.resolvedDay === undefined;

export const unread = (items: readonly InboxItem[]): InboxItem[] =>
  items.filter((i) => i.readDay === undefined);

export const blocking = (items: readonly InboxItem[]): InboxItem[] => items.filter(isBlocking);

/**
 * Sort for the screen: decisions first, then by recency.
 *
 * Not by recency alone. An unanswered decision from three weeks ago outranks a result from this
 * morning, because one of them is still waiting on the player and the other is history.
 */
export function inboxOrder(a: InboxItem, b: InboxItem): number {
  const rank = (i: InboxItem) => (isBlocking(i) ? 0 : i.readDay === undefined ? 1 : 2);
  return rank(a) - rank(b) || b.day - a.day;
}

/** A stable id, so the same event on the same day cannot produce two items. */
export const inboxId = (day: GameDay, key: string): string => `inbox_${day}_${key}`;

export function markRead(item: InboxItem, day: GameDay): InboxItem {
  return item.readDay === undefined ? { ...item, readDay: day } : item;
}

export function resolve(item: InboxItem, actionId: string, day: GameDay): InboxItem {
  return { ...item, resolvedDay: day, resolvedWith: actionId, readDay: item.readDay ?? day };
}
