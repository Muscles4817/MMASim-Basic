/**
 * A promoter's first week, as a checklist that ticks itself.
 *
 * A new promoter landed on a dashboard of alerts with no idea what the loop was: that a card is a
 * date first, that a main event is what it sells, that nothing is booked until it is offered, and
 * that the clock runs to fight night and stops there. Five steps say all of that, in order, and
 * each one is read off the save — the player never ticks anything, they just do it.
 *
 * Dismissal lives on the save (`WorldMeta.dismissed`) with the tips', so a career's first week is
 * dismissed once and a second save gets its own.
 */

import type { EventPlan, InboxLink } from '@mmasim/engine';
import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import { allPlans } from './plans';

export interface FirstWeekStep {
  id: 'plan' | 'main' | 'offers' | 'night' | 'run';
  label: string;
  /** What doing it involves, for the step that is next. */
  hint: string;
  done: boolean;
  /** Where to go to do it. */
  link: InboxLink;
}

export const FIRST_WEEK = 'first-week';

/** The five steps of the loop, ticked from what the save says has happened. */
export function firstWeek(db: GameDb): FirstWeekStep[] {
  const world = getWorld(db);
  const mine = allPlans(db).filter((p) => p.promotionId === world.playerPromotionId);
  const live = mine.filter((p) => p.status !== 'run' && p.status !== 'cancelled');
  const next: EventPlan | undefined = [...live].sort((a, b) => a.day - b.day)[0];
  const ran = mine.some((p) => p.status === 'run');
  const anyBout = (test: (status: string) => boolean, slot?: 'mainEvent') =>
    mine.some((p) =>
      p.slots.some((s) => s.bout && (!slot || s.position === slot) && test(s.bout.status)),
    );
  const toCard: InboxLink = next
    ? { route: 'plan', id: next.id }
    : { route: 'calendar', id: 'new' };

  return [
    {
      id: 'plan',
      label: 'Plan your first card',
      hint: 'Pick a date months out. It can stay empty for weeks — that is what planning is.',
      done: mine.length > 0,
      link: { route: 'calendar', id: 'new' },
    },
    {
      id: 'main',
      label: 'Put a main event on it',
      hint: 'The main event sells the night. Your champion, or the two best you can make.',
      done: ran || anyBout(() => true, 'mainEvent'),
      link: next
        ? {
            route: 'plan',
            id: next.id,
            slot: next.slots.find((s) => s.position === 'mainEvent')?.id,
          }
        : toCard,
    },
    {
      id: 'offers',
      label: 'Send the offers',
      hint: 'Nothing is booked until both corners agree. Send what you have pencilled in.',
      done: ran || anyBout((status) => status !== 'draft'),
      link: toCard,
    },
    {
      id: 'night',
      label: 'Advance to fight night',
      hint: 'The calendar runs the days. It stops when something needs you, and on the night.',
      done: ran || (next !== undefined && world.day >= next.day),
      link: { route: 'calendar' },
    },
    {
      id: 'run',
      label: 'Run the card',
      hint: 'Only signed fights go on. Then see what the night made.',
      done: ran,
      link: toCard,
    },
  ];
}

/** Whether every step is done, or the player put the list away. */
export const firstWeekOver = (db: GameDb): boolean =>
  isDismissed(db, FIRST_WEEK) || firstWeek(db).every((s) => s.done);

export const isDismissed = (db: GameDb, id: string): boolean =>
  (getWorld(db).dismissed ?? []).includes(id);

export function dismiss(db: GameDb, id: string): void {
  const dismissed = getWorld(db).dismissed ?? [];
  if (!dismissed.includes(id)) setWorld(db, { dismissed: [...dismissed, id] });
}
