/**
 * World time.
 *
 * The engine measures time in integer days from a fixed epoch and never constructs a
 * `Date` — `Date` pulls in the host timezone, which would make the sim non-deterministic
 * across machines. Formatting to human-readable dates is a UI-layer concern.
 */

/** Days since the epoch. Day 0 is {@link EPOCH_ISO}. */
export type GameDay = number;

/** The world begins on 1 January 2020, matching the seed roster snapshot. */
export const EPOCH_ISO = '2020-01-01';
const EPOCH_UTC_MS = Date.UTC(2020, 0, 1);
const MS_PER_DAY = 86_400_000;

export const DAYS_PER_WEEK = 7;

/** Convert an ISO `YYYY-MM-DD` string to a game day. Used by seed data and the editor. */
export function isoToGameDay(iso: string): GameDay {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new TypeError(`isoToGameDay: expected YYYY-MM-DD, got "${iso}"`);
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Math.round((ms - EPOCH_UTC_MS) / MS_PER_DAY);
}

/** Convert a game day back to an ISO `YYYY-MM-DD` string. */
export function gameDayToIso(day: GameDay): string {
  const d = new Date(EPOCH_UTC_MS + day * MS_PER_DAY);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Calendar parts of a game day, all UTC. */
export interface CalendarDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0 = Sunday. */
  weekday: number;
}

export function toCalendar(day: GameDay): CalendarDate {
  const d = new Date(EPOCH_UTC_MS + day * MS_PER_DAY);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

/**
 * Age in whole years on `onDay`, given a birth day index (which may be negative for
 * anyone born before the epoch — i.e. everyone in the seed roster).
 */
export function ageOn(birthDay: GameDay, onDay: GameDay): number {
  const birth = toCalendar(birthDay);
  const now = toCalendar(onDay);
  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) age--;
  return age;
}

/** Birth day index for someone who is `age` years old on `onDay`, born on `month`/`day`. */
export function birthDayForAge(age: number, onDay: GameDay, month: number, day: number): GameDay {
  const now = toCalendar(onDay);
  const hadBirthday = now.month > month || (now.month === month && now.day >= day);
  const birthYear = now.year - age - (hadBirthday ? 0 : 1);
  return isoToGameDay(
    `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

export const weeksToDays = (weeks: number): number => Math.round(weeks * DAYS_PER_WEEK);
export const daysToWeeks = (days: number): number => days / DAYS_PER_WEEK;
