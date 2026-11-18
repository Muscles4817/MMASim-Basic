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
import { CLINCH_HELD_COST, GROUND_BOTTOM_COST, POSITION_COST, type Combatant } from './profile.js';
import type { GroundPosition, Position, Range, Weapon } from './types.js';

/**
 * Fatigue added by one second of average-intensity action at distance, for Cardio 50.
 *
 * Doc 36 phase 2: 0.0016 → 0.0010, with `BASE_ROUND_RECOVERY` 0.28 → 0.38. Measured on an even
 * pair of 50-cardio fighters on AI plans, the old pair averaged **0.77 fatigue through round two and
 * 0.91 through round three** — an average professional was all but empty halfway through a
 * three-round fight, which is where the halving of output came from. Now 0.17 / 0.46 / 0.68: tired
 * by the third, and still a fighter.
 */
const BASE_FATIGUE_PER_SECOND = 0.0011;

/** How much of output is tied to the tank. See `workRate`. */
export const WORK_RATE_GAS = 0.5;

/** Fraction of accumulated fatigue an average fighter sheds during a one-minute rest. */
const BASE_ROUND_RECOVERY = 0.34;

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
  // And the same on the fence, which this function computed `isControlled` for and then ignored
  // until D15. See `CLINCH_HELD_COST`.
  if (ctx.position === 'clinch' && ctx.isControlled) positionCost *= CLINCH_HELD_COST;

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
  /*
   * Doc 36 phase 2: the fade. This was `gasLeft × 0.85 + 0.15`, which spent the whole tank on
   * *volume* — an average fighter threw half as much in round three as in round one (41 → 20 strikes
   * attempted, docs/reviews/19 §2), where the sport loses perhaps a sixth. Fatigue already costs
   * speed, accuracy, power and defence through `fatiguedEffect`; volume is the part a tired fighter
   * holds on to longest, because he can still choose to throw. A gassed fighter still slows down —
   * about a third of his output at an empty tank — but the fade lives mostly in *quality* now.
   */
  const base = clamp01(gasLeft * WORK_RATE_GAS + (1 - WORK_RATE_GAS) + desperation);
  return clamp01(base * traitMul(c.fighter.traits, 'strikeOutput'));
}

/**
 * How a fighter spreads his output across the fight. Doc 36 phase 2.
 *
 * A smart, disciplined fighter paces: a little under full output while the fight is long, and a
 * surge when the end is in sight. An aggressive, undisciplined one comes out hot and pays for it.
 * Small on purpose — the tank is `cardio`'s job; this is the *choice* of how to spend it.
 */
export function paceMultiplier(c: Combatant, round: number, totalRounds: number): number {
  const p = c.fighter.personality;
  const planner = clamp01(((c.attrs.fightIq - 50) / 45) * 0.6 + ((p.discipline - 50) / 50) * 0.4);
  const hothead = clamp01(((p.aggression - 55) / 45) * 0.7 + ((50 - p.discipline) / 50) * 0.3);
  const last = round === totalRounds;
  const first = round === 1;
  return (
    (first ? 1 + hothead * 0.08 - planner * 0.05 : 1) * (last ? 1 + planner * 0.08 - hothead * 0.04 : 1)
  );
}

/**
 * What one thrown strike costs the tank, for Cardio 50. Kicks cost more: a missed kick is a leg
 * swung through the air and a body rotated with it.
 *
 * Doc 36 phase 2. Fatigue used to be charged per *second* only, so a volume puncher and a man
 * standing still at the same range tired identically, and the only thing that made throwing more
 * expensive was `riskLevel`'s small exertion term. Once volume stopped being the thing fatigue
 * removed, nothing at all priced output — and the reckless plan, which buys its output for free,
 * became the correct answer (`risk.test.ts`). About a quarter of an average round's fatigue now
 * comes from what a fighter throws; the per-second rate was reduced to match.
 */
const STRIKE_COST: Readonly<Record<Weapon, number>> = {
  punch: 0.00176,
  kick: 0.00180,
  knee: 0.00248,
  elbow: 0.00138,
};

export function chargeStrike(c: Combatant, weapon: Weapon): void {
  const cardio = effect(c.attrs.cardio, 1.2);
  c.fatigue = clamp01(
    c.fatigue +
      (STRIKE_COST[weapon] *
        // Sitting down on a shot costs more than flicking it — the other half of `commitment`.
        riskProfile(c.plan.riskLevel).commitment ** 3 *
        (1 + c.cutPenalty * 0.45) *
        bodyDrag(c) *
        traitMul(c.fighter.traits, 'fatigueRate')) /
        cardio,
  );
}
