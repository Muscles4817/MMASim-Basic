/**
 * When the game is allowed to tell the promoter something, and how loudly.
 *
 * The promoter audit measured what the inbox was doing and it was not an inbox: "X can walk in N
 * days" was raised afresh every simulated day for every fighter it applied to — 7,928 items in two
 * years on the biggest promotion, over a hundred forced stops — and it kept being raised for
 * fighters who were already booked. A warning that arrives every day is not a warning, and a
 * clock that stops every day is not a clock.
 *
 * The rules this module holds:
 *
 *  **Once per subject, per stage.** A situation is announced when it first comes into view and
 *  once more when it is close: `STAGES` is thirty days and seven. The stage is part of the
 *  alert's identity, so neither is ever raised twice, however many days the condition stays
 *  true.
 *
 *  **Only a decision stops the clock.** An alert interrupts time when acting on it now can still
 *  change the outcome. Everything else is worth knowing and goes into the week's digest, which is
 *  one item with a line per subject rather than a row each.
 *
 *  **Alerts settle themselves.** A decision whose cause has gone — the fighter got booked, the
 *  counter was paid, the main event signed — is resolved by the game, not left blocking the badge
 *  until the player dismisses something that is no longer true.
 *
 *  **Two kinds of "already raised", on purpose.** `raise` (inbox.ts) is idempotent on an item's
 *  id, which suits one-off events whose id already says what they are — an offer answered on a
 *  given day. Alerts here are conditions that stay true for weeks and may be folded into a group
 *  or a digest under some other id, so they are deduplicated on their *key* instead:
 *  `raisedKeys` collects every key any item carries, whether as its own id (`alert:<key>`) or as
 *  a line inside a group or digest. A key is never raised twice by either route.
 *
 *  **A new save gets a grace period.** The roster a player inherits is somebody else's
 *  neglect: nobody can walk out over it for `GRACE_DAYS`, and nothing stops the clock until the
 *  thirty-day warnings for the end of that period are due.
 */

import { inboxId, type InboxEntry, type InboxItem, type InboxLink } from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import type { Fighter, PromotionalAgreement } from '@mmasim/engine';
import { readInbox } from './inbox';

type Stored = InboxItem & Entity;

/** How long a new promoter has before the roster they inherited can walk or stop the clock. */
export const GRACE_DAYS = 45;

/** The two warnings a situation gets: when it comes into view, and when it is close. */
export const STAGES = [30, 7] as const;
export type Stage = (typeof STAGES)[number];

/** Which warning, if any, a situation `left` days away is due. */
export const stageFor = (left: number): Stage | undefined =>
  left <= 7 ? 7 : left <= 30 ? 30 : undefined;

/** The first day of the save's grace period running out. */
export const graceEnds = (db: GameDb): number => {
  const world = getWorld(db);
  return (world.startedDay ?? world.day) + GRACE_DAYS;
};

/**
 * The day a fighter can first walk over the activity guarantee, if nothing changes.
 *
 * The question the old warning answered wrongly. It printed `365 - contractAge`, which is only
 * the deadline for a contract in its first year; for any older deal it went to zero and stayed
 * there, so a save opened on "put them on a card within 0 days" against a fourteen-day minimum
 * lead. The real rule (`enforceActivity`) is a full year since signing *and* fewer bouts than
 * the guarantee in the trailing year, and the second half moves as old fights age out of the
 * window: with the guarantee at `g`, the window falls short the day the `g`-th most recent fight
 * is a year old.
 *
 * Never earlier than the end of the save's grace period, because the clock holds the walk-out
 * until then too (see `activityHold` in `clock.ts`).
 */
export function walkDay(db: GameDb, fighter: Fighter, agreement: PromotionalAgreement): number {
  const recent = fighter.record.map((r) => r.day as number).sort((a, b) => b - a);
  const nth = recent[agreement.activityGuarantee - 1];
  const breach = Math.max(
    (agreement.signedDay as number) + 365,
    nth === undefined ? -Infinity : nth + 365,
  );
  return Math.max(breach, graceEnds(db));
}

// --- Raising --------------------------------------------------------------------------------------

/** Every subject-and-stage key already carried by an item, so nothing is raised twice. */
export function raisedKeys(db: GameDb): Set<string> {
  const keys = new Set<string>();
  for (const item of readInbox(db)) {
    if (item.id.startsWith('alert:')) keys.add(item.id.slice('alert:'.length));
    for (const entry of item.entries ?? []) keys.add(entry.key);
  }
  return keys;
}

export interface Alert {
  /** Subject, kind and stage — `activity:<fighter>:<deadline>:30`. The identity. */
  key: string;
  title: string;
  body?: string;
  link?: InboxLink;
  kind: InboxItem['kind'];
  fighterId?: InboxItem['fighterId'];
  promotionId?: InboxItem['promotionId'];
}

/**
 * Raise decisions — things that stop the clock — once each.
 *
 * Several of the same kind on the same day become one item with a line per subject: a save
 * whose inherited roster all crosses the thirty-day mark together gets one stop, not forty.
 */
export function raiseDecisions(
  db: GameDb,
  day: number,
  alerts: readonly Alert[],
  group: { kind: string; title: (n: number) => string; body: string },
): number {
  const known = raisedKeys(db);
  const fresh = alerts.filter((a) => !known.has(a.key));
  if (fresh.length === 0) return 0;

  const actions = [
    { id: 'acknowledge', label: 'Understood', detail: 'Deal with it yourself.', isDismiss: true },
  ];

  if (fresh.length === 1) {
    const [alert] = fresh;
    db.inbox.upsert({
      id: `alert:${alert!.key}`,
      day,
      kind: alert!.kind,
      priority: 'decision',
      title: alert!.title,
      body: alert!.body,
      actions,
      link: alert!.link,
      fighterId: alert!.fighterId,
      promotionId: alert!.promotionId,
    } as Stored);
    return 1;
  }

  db.inbox.upsert({
    id: inboxId(day, `group:${group.kind}`),
    day,
    kind: fresh[0]!.kind,
    priority: 'decision',
    title: group.title(fresh.length),
    body: group.body,
    actions,
    entries: fresh.map(toEntry),
    promotionId: fresh[0]!.promotionId,
  } as Stored);
  return 1;
}

/**
 * Add lines to this week's digest.
 *
 * Worth knowing and not worth stopping for: a contract a month from its end, a card two weeks
 * short, a contender asking for the shot. One item per game week, with a line each, re-marked
 * unread when something new lands in it.
 */
export function addToDigest(db: GameDb, day: number, alerts: readonly Alert[]): number {
  const known = raisedKeys(db);
  const fresh = alerts.filter((a) => !known.has(a.key));
  if (fresh.length === 0) return 0;

  const weekStart = Math.floor(day / 7) * 7;
  const id = inboxId(weekStart, 'digest');
  const existing = db.inbox.findById(id) as Stored | undefined;
  const entries = [...(existing?.entries ?? []), ...fresh.map(toEntry)];

  db.inbox.upsert({
    id,
    day: existing?.day ?? day,
    kind: 'roster',
    priority: 'notable',
    title: `This week: ${entries.length} ${entries.length === 1 ? 'thing' : 'things'} worth a look`,
    entries,
    // New lines make it new again; a digest the player read on Monday does not hide Thursday.
    readDay: undefined,
  } as Stored);
  return fresh.length;
}

const toEntry = (alert: Alert): InboxEntry => ({
  key: alert.key,
  title: alert.title,
  link: alert.link,
});

// --- Settling ------------------------------------------------------------------------------------

/**
 * Resolve every open decision whose cause is gone.
 *
 * `stillTrue` answers per key, so a grouped item stays open while any one of its subjects still
 * needs the player. Keys the predicate does not recognise are left alone.
 */
export function settleDecisions(
  db: GameDb,
  day: number,
  stillTrue: (key: string) => boolean | undefined,
): void {
  for (const item of readInbox(db)) {
    if (item.priority !== 'decision' || item.resolvedDay !== undefined) continue;
    const keys = item.id.startsWith('alert:')
      ? [item.id.slice('alert:'.length)]
      : (item.entries ?? []).map((e) => e.key);
    if (keys.length === 0) continue;

    const verdicts = keys.map(stillTrue);
    if (verdicts.some((v) => v === undefined)) continue;
    if (verdicts.some((v) => v === true)) continue;

    db.inbox.upsert({
      ...item,
      resolvedDay: day,
      resolvedWith: 'settled',
      readDay: item.readDay ?? day,
    } as Stored);
  }
}
