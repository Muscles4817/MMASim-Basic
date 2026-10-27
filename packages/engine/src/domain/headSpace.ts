/**
 * Where a fighter's head is, and the fight that put it there. Doc 34 C6.
 *
 * Confidence was a number on the condition card: "Confidence 31". It never said why, and a
 * promoter cannot manage a number. What a promoter knows is that the knockout in March is still in
 * his head, and that is what this reads. It names the fight, says how bad it is, and offers what a
 * promotion can actually do about it: a tune-up, time away, or (once a promotion has the staff) a
 * sports psychologist.
 */

import type { GameDay } from '../core/clock.js';
import type { FighterId } from '../core/ids.js';
import { clamp } from '../core/math.js';
import { isKoMethod, type Fighter, type FinishMethod } from './fighter.js';
import { recoverConfidence } from './confidence.js';

export type HeadSpaceLevel = 'settled' | 'shaken' | 'fragile';

/** Confidence under which a fighter is shaken, and under which fragile. */
export const SHAKEN_BELOW = 45;
export const FRAGILE_BELOW = 30;

/** How far back a fight can still be the one in their head. */
const CAUSE_LOOKBACK = 4;

export type HeadSpaceOptionId = 'tuneUp' | 'timeOff' | 'psychologist';

export interface HeadSpaceOption {
  id: HeadSpaceOptionId;
  label: string;
  detail: string;
  /** False when the promotion cannot offer it yet: the psychologist waits on B5's staff budget. */
  available: boolean;
}

export interface HeadSpaceRead {
  level: HeadSpaceLevel;
  /** The fight that did it, when one did. */
  cause?: { opponentId: FighterId; day: GameDay; method: FinishMethod; stopped: boolean };
  /** One sentence, naming the fight. The caller supplies the opponent's name. */
  sentence: string;
  options: readonly HeadSpaceOption[];
}

/**
 * Read it. `nameOf` turns the cause's opponent into a name; `supportAvailable` is the hook for a
 * promotion that employs a sports psychologist (B5), off until that exists.
 */
export function headSpaceRead(
  fighter: Pick<Fighter, 'condition' | 'record' | 'lastName'>,
  nameOf: (id: FighterId) => string,
  supportAvailable = false,
): HeadSpaceRead {
  const confidence = fighter.condition.confidence;
  const level: HeadSpaceLevel =
    confidence < FRAGILE_BELOW ? 'fragile' : confidence < SHAKEN_BELOW ? 'shaken' : 'settled';
  if (level === 'settled') {
    return { level, sentence: `${fighter.lastName} is in a good place.`, options: [] };
  }

  const recent = fighter.record.slice(-CAUSE_LOOKBACK).reverse();
  const losses = recent.filter((r) => r.outcome === 'loss');
  const stopped = (m: FinishMethod) => isKoMethod(m) || m === 'submission';
  const pick = losses.find((r) => stopped(r.method)) ?? losses[0];
  const cause = pick
    ? {
        opponentId: pick.opponentId,
        day: pick.day,
        method: pick.method,
        stopped: stopped(pick.method),
      }
    : undefined;

  const how = cause
    ? cause.stopped
      ? isKoMethod(cause.method)
        ? `the knockout against ${nameOf(cause.opponentId)}`
        : `being submitted by ${nameOf(cause.opponentId)}`
      : `the loss to ${nameOf(cause.opponentId)}`
    : undefined;
  const sentence =
    level === 'fragile'
      ? how
        ? `${fighter.lastName} has not got over ${how}. Another bad night now could finish them.`
        : `${fighter.lastName} has lost belief, and no single fight explains it.`
      : how
        ? `${how[0]!.toUpperCase()}${how.slice(1)} is still in ${fighter.lastName}’s head.`
        : `${fighter.lastName} is not quite right, and no single fight explains it.`;

  return {
    level,
    cause,
    sentence,
    options: [
      {
        id: 'tuneUp',
        label: 'A tune-up',
        detail: 'Book a fight they should win. A win is the quickest way back.',
        available: true,
      },
      {
        id: 'timeOff',
        label: 'Time off',
        detail: `${TIME_OFF_DAYS / 7} weeks away from the cage to reset. Not bookable until then.`,
        available: true,
      },
      {
        id: 'psychologist',
        label: 'A sports psychologist',
        detail: supportAvailable
          ? 'Work on it properly, with somebody who does this for a living.'
          : 'Needs performance staff the promotion does not have yet.',
        available: supportAvailable,
      },
    ],
  };
}

/** How long time off is. */
export const TIME_OFF_DAYS = 56;

/**
 * What time off does: away from the cage, confidence recovers as it would over twice the time —
 * rest that is chosen is worth more than idleness that happens.
 */
export function afterTimeOff(confidence: number, personality: Fighter['personality']): number {
  return clamp(recoverConfidence(confidence, personality, (TIME_OFF_DAYS * 2) / 365), 1, 100);
}
