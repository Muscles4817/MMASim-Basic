/**
 * The calendar.
 *
 * The game had a clock and no way to see it. `world.day` advanced inside whichever screen
 * happened to advance it — fighter mode's "wait N weeks", and nothing at all in promoter mode,
 * which is why promoter mode's clock was frozen and every card overwrote the last one. Time was
 * a side effect of other screens rather than a thing the player could look at and move.
 *
 * Entries are **derived, never stored**. Everything on this calendar already exists somewhere
 * as real state — a scheduled `FightNight`, a `Booking`, an agreement's `expiresDay`, a
 * fighter's `readyOnDay` — and a second copy would go stale the moment any of them changed. The
 * cost is recomputing on read; the benefit is that the calendar cannot lie, which for the
 * screen that owns the clock is worth more.
 *
 * The `ownership` field is what makes one screen work for three modes: a promoter's calendar
 * defaults to their promotion's, a fighter's to their own fights and camps, and the filter is
 * the same control in both.
 */

import {
  agreementStatus,
  displayName,
  type Fighter,
  type FightNight,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type GameDb, type WorldMeta } from '@mmasim/data';
import { getBooking } from './career';

export type CalendarKind =
  | 'card'
  | 'fight'
  | 'camp'
  | 'contract'
  | 'medical'
  | 'inactivity';

export interface CalendarEntry {
  day: number;
  kind: CalendarKind;
  title: string;
  detail?: string;
  /**
   * Whether this is the player's business.
   *
   * The whole reason one calendar serves every mode. `yours` is what the default filter shows;
   * `world` is everything else, which a player can opt into when they want to see what the sport
   * is doing around them.
   */
  ownership: 'yours' | 'world';
  /** Where tapping it goes. */
  link?: { route: string; id?: string };
  fighterId?: string;
  promotionId?: string;
}

export interface CalendarRange {
  from: number;
  /** Exclusive. */
  to: number;
}

/**
 * Everything scheduled in a window, soonest first.
 *
 * Deliberately not paged or capped here. The window is the cap — a screen asks for the next
 * ninety days and gets the next ninety days — because a calendar that silently truncates is
 * worse than one that scrolls.
 */
export function buildCalendar(db: GameDb, range: CalendarRange): CalendarEntry[] {
  const world = getWorld(db);
  const entries: CalendarEntry[] = [];
  const inRange = (day: number) => day >= range.from && day < range.to;

  const yourPromotion = world.playerPromotionId;
  const yourFighter = world.playerFighterId;

  // --- Scheduled cards ------------------------------------------------------------------------
  for (const night of db.events.findAll() as FightNight[]) {
    if (night.status !== 'scheduled' || !inRange(night.day)) continue;
    const promotion = db.promotions.findById(night.promotionId as string) as Promotion | undefined;
    const mine = yourPromotion !== undefined && night.promotionId === yourPromotion;

    entries.push({
      day: night.day,
      kind: 'card',
      title: night.name,
      detail: `${night.bouts.length} fights · ${night.venue.name}, ${night.venue.city}`,
      ownership: mine ? 'yours' : 'world',
      link: { route: 'card' },
      promotionId: promotion?.id as string | undefined,
    });
  }

  // --- The player's own fight and camp --------------------------------------------------------
  if (yourFighter) {
    const booking = getBooking(yourFighter);
    const me = db.fighters.findById(yourFighter) as Fighter | undefined;

    if (booking && me) {
      const opponent = db.fighters.findById(booking.opponentId) as Fighter | undefined;

      if (inRange(booking.bout.day)) {
        entries.push({
          day: booking.bout.day,
          kind: 'fight',
          title: opponent ? `You fight ${displayName(opponent)}` : 'Your fight',
          detail: booking.bout.isTitleFight ? 'For the title' : undefined,
          ownership: 'yours',
          link: { route: 'camp' },
          fighterId: yourFighter,
        });
      }

      /*
       * Camp is shown as the day it *ends*, not the day it started, because a calendar answers
       * "what is coming" — and a camp already under way is context rather than an appointment.
       */
      if (inRange(booking.campStartDay)) {
        entries.push({
          day: booking.campStartDay,
          kind: 'camp',
          title: 'Camp began',
          ownership: 'yours',
          link: { route: 'camp' },
          fighterId: yourFighter,
        });
      }
    }

    if (me?.readyOnDay !== undefined && inRange(me.readyOnDay) && me.readyOnDay > world.day) {
      entries.push({
        day: me.readyOnDay,
        kind: 'medical',
        title: 'Medically cleared to fight',
        detail: 'The suspension ends and you can be booked again.',
        ownership: 'yours',
        fighterId: yourFighter,
      });
    }
  }

  // --- Contracts ------------------------------------------------------------------------------
  for (const agreement of db.agreements.findAll() as PromotionalAgreement[]) {
    if (!inRange(agreement.expiresDay)) continue;

    const fighter = db.fighters.findById(agreement.fighterId as string) as Fighter | undefined;
    if (!fighter || fighter.retiredDay !== undefined) continue;

    const mine =
      (yourPromotion !== undefined && agreement.promotionId === yourPromotion) ||
      (yourFighter !== undefined && agreement.fighterId === yourFighter);

    // Only the player's own business. Two hundred rival contract expiries is noise, not a
    // calendar — and unlike a card, nobody can act on somebody else's.
    if (!mine) continue;

    const status = agreementStatus(agreement, world.day, {});
    entries.push({
      day: agreement.expiresDay,
      kind: 'contract',
      title:
        yourFighter === agreement.fighterId
          ? 'Your contract expires'
          : `${displayName(fighter)}'s contract expires`,
      detail: status.summary,
      ownership: 'yours',
      link: { route: yourFighter === agreement.fighterId ? 'offers' : 'promoterRoster' },
      fighterId: fighter.id as string,
      promotionId: agreement.promotionId as string,
    });
  }

  return entries.sort((a, b) => a.day - b.day || a.kind.localeCompare(b.kind));
}

/**
 * The next thing worth stopping for.
 *
 * What "advance to the next thing" advances to. Only the player's own entries count: a rival's
 * card is on the calendar so the player can see the sport moving around them, not so it can
 * interrupt them.
 */
export function nextStop(db: GameDb, fromDay: number, horizonDays = 365): number | undefined {
  const entries = buildCalendar(db, { from: fromDay + 1, to: fromDay + horizonDays }).filter(
    (e) => e.ownership === 'yours',
  );
  return entries[0]?.day;
}

/** What the calendar defaults to showing, which depends on what the player is. */
export function defaultFilter(world: WorldMeta): 'yours' | 'all' {
  return world.playerRole === undefined ? 'all' : 'yours';
}
