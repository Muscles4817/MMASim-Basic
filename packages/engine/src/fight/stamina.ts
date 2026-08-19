/**
 * Stamina.
 *
 * Fatigue is consumed by *action*, not by time. Sitting at range is cheap; grinding on the
 * fence and defending takedowns are expensive. That is what lets a high-output wrestler
 * drown someone who is nominally fitter but is spending every second defending.
 *
 * The Merab case, from two ratings: Cardio 97 gives a ~3.1× divisor on accrual, so takedown
 * attempt #23 in round three costs him what attempt #5 costs a Cardio-60 fighter — and
 * `chainWrestling` (Wrestling + Cardio + Strength) keeps the attempts coming.
 */

import { clamp, clamp01 } from '../core/math.js';
import { riskProfile } from '../domain/gameplan.js';
import { traitMul } from '../domain/traits.js';
import { RANGE_EXERTION } from './range.js';
import { effect } from '../ratings/curve.js';
import { bodyDrag } from './damage.js';
import { GROUND_BOTTOM_COST, POSITION_COST, type Combatant } from './profile.js';
import type { GroundPosition, Position, Range } from './types.js';

/** Fatigue added by one second of average-intensity action at distance, for Cardio 50. */
const BASE_FATIGUE_PER_SECOND = 0.0016;

/** Fraction of accumulated fatigue an average fighter sheds during a one-minute rest. */
const BASE_ROUND_RECOVERY = 0.28;

export interface FatigueContext {
  position: Position;
  /** Where they are standing, when they are. */
  range?: Range;
  groundPosition?: GroundPosition;
  /** True when this fighter is the one being controlled on the ground or against the fence. */
  isControlled: boolean;
  /** 0–1. How hard they worked this exchange. */
  intensity: number;
  seconds: number;
}

/** Accrue fatigue for one exchange. Mutates the combatant. */
export function accrueFatigue(c: Combatant, ctx: FatigueContext): void {
  const cardio = effect(c.attrs.cardio, 1.2);

  let positionCost = POSITION_COST[ctx.position];
  /*
   * The positional half of what the pocket costs, and small on purpose.
   *
   * Fighting inside is exhausting mostly because of what it makes you *do* — throw more, react
   * more, absorb more — and every one of those is already charged for by the action terms below.
   * What is left, and all this is, is the part that is genuinely about the position: there is
   * nowhere to rest. A large multiplier here would double-charge for the same physics and put the
   * calibration somewhere very strange.
   */
  if (ctx.position === 'distance' && ctx.range) positionCost *= RANGE_EXERTION[ctx.range];
  if (ctx.position === 'ground' && ctx.isControlled && ctx.groundPosition) {
    // Being underneath is far more exhausting than being on top. This is the mechanism by
    // which control time wins fights without ever landing a meaningful strike.
    positionCost *= GROUND_BOTTOM_COST[ctx.groundPosition];
  }

  // A hard weight cut is paid for here, every second of every round.
  const cutDrag = 1 + c.cutPenalty * 0.45;

  const delta =
    BASE_FATIGUE_PER_SECOND *
    ctx.seconds *
    clamp(ctx.intensity, 0.15, 2.5) *
    positionCost *
    cutDrag *
    bodyDrag(c) *
    traitMul(c.fighter.traits, 'fatigueRate') *
    // Swinging hard is expensive. The third leg of the `riskLevel` trade: recklessness buys
    // power now and pays for it in the championship rounds.
    riskProfile(c.plan.riskLevel).exertion *
    (1 / cardio);

  c.fatigue = clamp01(c.fatigue + delta);
}

/** Recover between rounds. Mutates the combatant. */
export function recoverBetweenRounds(c: Combatant, restSeconds = 60): void {
  const cardio = effect(c.attrs.cardio, 1.2);
  const recovery = effect(c.fighter.naturals.recovery, 0.9);

  const fraction =
    BASE_ROUND_RECOVERY *
    (restSeconds / 60) *
    cardio ** 0.6 *
    recovery ** 0.4 *
    traitMul(c.fighter.traits, 'recoveryRate') *
    // Body damage is what stops a fighter recovering on the stool — the reason investing
    // in the body pays off two rounds later.
    (1 / bodyDrag(c));

  c.fatigue = clamp01(c.fatigue * (1 - clamp01(fraction)));

  // A minute is usually, but not always, enough to clear a hurt state.
  c.hurtSeconds = Math.max(0, c.hurtSeconds - restSeconds * 0.9);

  // Momentum resets partially between rounds; a bad round still colours the next one.
  c.momentum *= 0.45;
}

/**
 * How hard this fighter is willing to work right now, 0–1.
 *
 * Distinct from fatigue: a fighter can be fresh and pacing themselves, or exhausted and
 * swinging for a finish because they know they are behind.
 */
export function workRate(c: Combatant, needsFinish: boolean): number {
  const gasLeft = 1 - c.fatigue;
  const desperation = needsFinish ? 0.35 : 0;
  const base = clamp01(gasLeft * 0.85 + 0.15 + desperation);
  return clamp01(base * traitMul(c.fighter.traits, 'strikeOutput'));
}
