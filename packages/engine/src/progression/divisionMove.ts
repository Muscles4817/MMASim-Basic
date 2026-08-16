/**
 * Changing weight class.
 *
 * This is the system that only works because the ratings are **absolute**. A fighter's Power
 * is Power, not power-for-a-lightweight, so moving them into a heavier division changes
 * nothing about them and everything about what they are facing. No conversion table, no
 * rescaling, no fudge — the division changes and the same numbers now mean something else.
 *
 * That is the whole design bet, and this module is where it pays out.
 *
 * What *does* change is the body. Moving up means walking around heavier: real mass, gained
 * over months, worth a little Strength and costing a little Speed and Cardio. Moving down
 * means a harder cut: a genuine size advantage on fight night, paid for in the gas tank and
 * in the risk of missing weight entirely. Both of those already flow automatically from
 * `cutSeverity`, so all this module has to do is move the fighter honestly and say what will
 * happen first.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { DivisionId } from '../core/ids.js';
import {
  cutSeverity,
  divisionsFor,
  getDivision,
  type Division,
} from '../domain/divisions.js';
import type { Fighter } from '../domain/fighter.js';
import { weightMissRiskMultiplier } from '../domain/personality.js';
import { traitMul } from '../domain/traits.js';
import type { Attributes } from '../ratings/attributes.js';

/** Cut severity above which a division is simply not makeable. */
export const MAX_MAKEABLE_SEVERITY = 0.95;

/** Severity above which the game says so in plain language before letting it happen. */
export const DANGEROUS_SEVERITY = 0.72;

export type MoveDirection = 'up' | 'down' | 'same';

export interface DivisionMoveAppraisal {
  target: Division;
  direction: MoveDirection;
  /** Divisions crossed. Two at once is a genuinely different proposition from one. */
  steps: number;
  makeable: boolean;
  /** Cut severity after the move, at the fighter's *current* walking weight. */
  severity: number;
  /** Cut severity today, for comparison. */
  currentSeverity: number;
  /** 0–1. Chance of missing weight on the night, after personality and traits. */
  weightMissRisk: number;
  /**
   * Where they will sit against the new field, in overall rating points.
   *
   * Negative means the division is above them. This is the number that matters and the one
   * a player will not work out for themselves.
   */
  fieldGap: number;
  /** What months of gaining or losing real mass will do, once settled. */
  settledAttributeChange: Partial<Attributes>;
  /** Plain-language verdict, ordered most important first. */
  notes: readonly string[];
}

/** Walking weight a fighter would settle at in a division, given time to get there. */
export function settledWalkingWeight(division: Division): number {
  // ~7% above the limit is a routine, professional cut. Nobody walks around at the limit
  // and nobody sensible walks around 20% above it for long.
  return Math.round(division.limitLbs * 1.07);
}

/**
 * What months of real mass change does to a fighter.
 *
 * Deliberately small and deliberately double-edged. Adding fifteen pounds of usable weight
 * is worth a couple of points of Strength and costs a couple of points of Speed and Cardio —
 * it is a trade, not an upgrade, and a fighter who moves up twice has made that trade twice.
 *
 * Note this operates on *attributes*, never on naturals: the hidden athleticism underneath
 * is who they are and does not move because they ate differently.
 */
export function massChangeEffect(deltaLbs: number): Partial<Attributes> {
  if (Math.abs(deltaLbs) < 4) return {};

  // Per 15lb, which is roughly one division at the middle of the scale.
  const steps = deltaLbs / 15;

  return {
    strength: round1(steps * 2.4),
    power: round1(steps * 1.6),
    speed: round1(-steps * 1.5),
    cardio: round1(-steps * 1.8),
    // Carrying more usable weight makes a fighter harder to move, in both directions.
    takedownDefence: round1(steps * 1.1),
    wrestling: round1(steps * 0.7),
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Honest appraisal of a proposed move.
 *
 * Says what will happen rather than whether it is a good idea, because whether it is a good
 * idea depends on things the game cannot see — how the division ages, who retires, whether
 * the player is chasing a belt or a payday.
 */
export function appraiseDivisionMove(
  fighter: Fighter,
  targetId: DivisionId,
  /** Overall ratings of the fighters already in the target division. */
  fieldOveralls: readonly number[],
  fighterOverall: number,
): DivisionMoveAppraisal {
  const target = getDivision(targetId);
  const current = getDivision(fighter.divisionId);

  const ladder = divisionsFor(fighter.sex);
  const currentIndex = ladder.findIndex((d) => d.id === current.id);
  const targetIndex = ladder.findIndex((d) => d.id === target.id);
  const steps = Math.abs(targetIndex - currentIndex);
  const direction: MoveDirection =
    targetIndex === currentIndex ? 'same' : target.limitLbs > current.limitLbs ? 'up' : 'down';

  const severity = cutSeverity(fighter.walkingWeightLbs, targetId);
  const currentSeverity = cutSeverity(fighter.walkingWeightLbs, fighter.divisionId);
  const makeable = severity <= MAX_MAKEABLE_SEVERITY;

  const weightMissRisk = clamp01(
    Math.pow(severity, 2.2) *
      0.55 *
      weightMissRiskMultiplier(fighter.personality) *
      traitMul(fighter.traits, 'weightMissRisk'),
  );

  const fieldAverage =
    fieldOveralls.length > 0
      ? fieldOveralls.reduce((a, b) => a + b, 0) / fieldOveralls.length
      : fighterOverall;
  const fieldGap = round1(fighterOverall - fieldAverage);

  const settledAttributeChange = massChangeEffect(
    settledWalkingWeight(target) - fighter.walkingWeightLbs,
  );

  const notes: string[] = [];

  if (direction === 'same') {
    notes.push('This is the division you already fight in.');
  } else if (!makeable) {
    notes.push(
      `You cannot make ${target.limitLbs}lb. At ${fighter.walkingWeightLbs}lb walking around, that cut would put you in hospital rather than on the scales.`,
    );
  } else {
    if (severity >= DANGEROUS_SEVERITY) {
      notes.push(
        'This is a dangerous cut. Expect to arrive flat, and expect the scales to be genuinely in doubt.',
      );
    } else if (severity <= 0.15 && direction === 'up') {
      notes.push('No cut worth the name. You will walk in fresh — and be the smaller man.');
    }

    if (direction === 'up') {
      notes.push(
        steps > 1
          ? `Two divisions is not one twice. You will be giving up real size to almost everybody in ${target.name}.`
          : `You will be the smaller fighter in ${target.name} more often than not.`,
      );
    } else {
      notes.push(
        `You will carry a size advantage into most fights at ${target.name}, and pay for it on the night.`,
      );
    }

    if (fieldGap > 4) {
      notes.push(`On paper you are above this division — roughly ${fieldGap} points clear of the field.`);
    } else if (fieldGap < -4) {
      notes.push(
        `This is a step up. The field here is about ${Math.abs(fieldGap)} points better than you, and absolute ratings mean that gap is real rather than relative.`,
      );
    } else {
      notes.push('You slot in about where you are now, relative to the field.');
    }

    if (weightMissRisk > 0.2) {
      notes.push(
        `Around a ${Math.round(weightMissRisk * 100)}% chance of missing weight, which forfeits part of the purse and follows you around.`,
      );
    }
  }

  return {
    target,
    direction,
    steps,
    makeable,
    severity,
    currentSeverity,
    weightMissRisk,
    fieldGap,
    settledAttributeChange,
    notes,
  };
}

/**
 * Actually move.
 *
 * The move is immediate; the *body* is not. Walking weight shifts a share of the way toward
 * where it will settle, and the attribute consequences apply in proportion — a fighter who
 * moves up does not wake up two points stronger, and one who moves down does not instantly
 * shed the mass. Call `settleWeight` again as camps pass to finish the job.
 */
export function moveDivision(fighter: Fighter, targetId: DivisionId, day: GameDay): Fighter {
  if (targetId === fighter.divisionId) return fighter;

  return {
    ...fighter,
    divisionId: targetId,
    divisionHistory: fighter.divisionHistory.includes(targetId)
      ? fighter.divisionHistory
      : [...fighter.divisionHistory, targetId],
    // Kept for the record even though nothing reads it yet — a fighter's division history is
    // exactly the sort of thing a profile page should show.
    lastDivisionChangeDay: day,
  } as Fighter;
}

/**
 * Move the body a share of the way toward where it should be for the current division.
 *
 * `share` is how much of the remaining journey one camp covers. Losing weight is faster than
 * gaining usable weight, which is why the two are not symmetric: dropping fifteen pounds is a
 * diet and adding fifteen usable pounds is a year.
 */
export function settleWeight(fighter: Fighter, share = 0.35): Fighter {
  const target = settledWalkingWeight(getDivision(fighter.divisionId));
  const gap = target - fighter.walkingWeightLbs;
  if (Math.abs(gap) < 1) return fighter;

  const rate = gap > 0 ? share * 0.6 : share;
  const delta = gap * rate;
  const nextWeight = Math.round(fighter.walkingWeightLbs + delta);

  const effect = massChangeEffect(delta);
  const attributes = { ...fighter.attributes };
  for (const [key, change] of Object.entries(effect) as [keyof Attributes, number][]) {
    // Never past the fighter's own ceiling, and never below a floor that would erase them.
    const ceiling = fighter.potential[key];
    attributes[key] = clamp(Math.min(ceiling, attributes[key] + change), 1, 100);
  }

  return { ...fighter, walkingWeightLbs: nextWeight, attributes };
}

/** Every division this fighter could realistically compete in today. */
export function viableDivisions(fighter: Fighter): Division[] {
  return divisionsFor(fighter.sex).filter(
    (d) => cutSeverity(fighter.walkingWeightLbs, d.id) <= MAX_MAKEABLE_SEVERITY,
  );
}
