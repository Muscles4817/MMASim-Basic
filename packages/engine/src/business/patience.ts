/**
 * How long a promotion waits before it stops asking.
 *
 * See docs/21-activity-offers-and-patience.md. The defect this exists to fix is not a number
 * being too harsh — it is a rule written for the wrong subject. `activityBreach` models one
 * thing: *the promotion shelved a fighter it owed bouts to, so that fighter may walk*. For a
 * fighter the world books, bouts not happening is the promotion's doing and the rule is sound.
 * For the player, who books themselves, bouts not happening is the **player's** doing — so the
 * same rule ran backwards and voided their contract for choosing to train.
 *
 * The half that was missing is the one the sport actually runs on: somebody rings up with a
 * name and a date, and what costs you your job is turning it down. Measured against real
 * schedules — a modern UFC average of 1.69 bouts per active fighter-year, a median of 2 — a
 * fighter idle for eight months is having an ordinary year, not a crisis. What is not ordinary
 * is refusing three fights in a row.
 *
 * So patience runs on two counters at once, and neither is sufficient alone. Time alone gets you
 * asked, and eventually — at two years, when you have stopped being a fighter — dropped.
 * Refusals are what actually spend it.
 */

import { clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';

/**
 * The ladder, in days idle since the last bout.
 *
 * Measured from the last fight rather than from the signing day, which is the other half of the
 * old rule being wrong: counting bouts in a trailing year means a fighter who had two fights nine
 * months ago is in breach *today* for something no amount of fighting now can fix.
 *
 * Pinned deliberately near `SHARP_DAYS` (210) rather than duplicating it. The sport already
 * punishes a long layoff through performance; this is only the contractual half, and it should
 * start speaking at roughly the point the body starts to.
 */
export const PATIENCE = {
  /** Nothing is said before this. A full twelve-week camp between fights must be silent. */
  nudge: 180,
  /** They put a name and a date in front of you. */
  press: 270,
  /** The offer comes with what refusing it means, spelled out. */
  final: 365,
  /** Refusals plus this much idleness ends it. */
  cut: 540,
  /** And this much ends it whatever you have or have not turned down. */
  hardCut: 730,
} as const;

/** Refusals that, with `PATIENCE.cut` days idle, are enough to be let go. */
export const REFUSALS_BEFORE_CUT = 2;

/**
 * Where a fighter stands with their promotion.
 *
 * Ordered by severity, and the order is load-bearing — the app compares stages to decide whether
 * anything has escalated since it last spoke.
 */
export type PatienceStage = 'content' | 'nudged' | 'pressing' | 'final' | 'cut';

export const PATIENCE_ORDER: readonly PatienceStage[] = [
  'content',
  'nudged',
  'pressing',
  'final',
  'cut',
];

export interface PatienceInput {
  /** Days since the last bout. */
  daysIdle: number;
  /** Bouts this fighter has turned down on this deal. */
  refusals: number;
  /** 0–100. A draw is asked more politely and for longer. */
  starPower: number;
  /** A champion is never cut for inactivity — they are the one fighter always being chased. */
  isChampion?: boolean;
  /** Somebody with a fight already booked is not idle, whatever the clock says. */
  hasBookedFight?: boolean;
}

export interface Patience {
  stage: PatienceStage;
  /** How the promotion would put it. Empty at `content`. */
  reason: string;
}

/**
 * Star power stretches the ladder.
 *
 * The same unevenness `releaseRisk` already encodes and is right to: patience is a commercial
 * decision, not a disciplinary one. A genuine draw gets 40% longer at every rung; somebody
 * nobody is selling tickets to gets asked sooner and dropped sooner.
 *
 * Bounded well away from zero, because a stretch factor that can approach it would turn an
 * unknown prospect's first quiet year into an instant release.
 */
function stretch(starPower: number): number {
  return 0.85 + clamp01(starPower / 100) * 0.55;
}

/**
 * What the promotion thinks of your schedule.
 *
 * Pure, and takes days rather than a clock — the engine owns no `Date` and this is called from
 * both the world loop and the tests that pin the ladder down.
 */
export function promotionPatience(input: PatienceInput): Patience {
  const { daysIdle, refusals, starPower, isChampion = false, hasBookedFight = false } = input;

  // A booked fight ends the conversation. The camp *is* the answer to "when are you fighting".
  if (hasBookedFight) return { stage: 'content', reason: '' };

  const scale = stretch(starPower);
  const at = (rung: number): boolean => daysIdle >= rung * scale;

  /*
   * The champion exemption, and it is narrower than it looks: a champion is not exempt from
   * being *asked*. They are exempt from being cut, because a promotion does not release the
   * holder of its own belt for being inactive — it books them a defence, which is precisely
   * what the escalating offers are.
   */
  const cuttable = !isChampion;

  if (cuttable && at(PATIENCE.hardCut)) {
    return {
      stage: 'cut',
      reason: 'Two years out of the cage. Whatever you are now, it is not one of their fighters.',
    };
  }
  if (cuttable && at(PATIENCE.cut) && refusals >= REFUSALS_BEFORE_CUT) {
    return {
      stage: 'cut',
      reason: `They put ${refusals} fights in front of you and you took none of them. They are done asking.`,
    };
  }
  if (at(PATIENCE.final)) {
    return {
      stage: 'final',
      reason: 'A year out. They want an answer, and they have said what a no means.',
    };
  }
  if (at(PATIENCE.press)) {
    return {
      stage: 'pressing',
      reason: 'They have a name and a date for you, and they would like you to take it.',
    };
  }
  if (at(PATIENCE.nudge)) {
    return {
      stage: 'nudged',
      reason: 'They would like to see you active this year.',
    };
  }
  return { stage: 'content', reason: '' };
}

/** Whether `next` is further along the ladder than `previous`. */
export function hasEscalated(previous: PatienceStage | undefined, next: PatienceStage): boolean {
  if (previous === undefined) return next !== 'content';
  return PATIENCE_ORDER.indexOf(next) > PATIENCE_ORDER.indexOf(previous);
}

/**
 * Days since this fighter last fought.
 *
 * Falls back to the day they signed rather than to zero. A fighter who has never fought at all is
 * not infinitely idle — they are as idle as their deal is old, which is the only span anybody
 * could hold against them.
 */
export function daysIdle(
  lastBoutDay: GameDay | undefined,
  signedDay: GameDay,
  today: GameDay,
): number {
  return Math.max(0, today - (lastBoutDay ?? signedDay));
}

/**
 * The purse a promotion puts on an offer it is chasing you for.
 *
 * Slightly over the signed show purse, because this is a promotion trying to get somebody into a
 * cage rather than one negotiating. It is not a renegotiation and must not read as one — the
 * uplift is small enough to be a sweetener and far below what the re-paper pays.
 */
export function chaseUplift(stage: PatienceStage): number {
  return stage === 'final' ? 0.15 : stage === 'pressing' ? 0.08 : 0;
}
