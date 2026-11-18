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

/**
 * How strongly `cardio` governs the tank, as an exponent on its effect curve. Doc 36, the
 * wrestling-economy pass.
 *
 * At 1 an elite tank tired about two and a half times slower than a poor one on every charge in the
 * fight — time, strikes, shots, get-ups — and recovered faster on the stool too, which made cardio
 * worth 75 points of win rate from 38 to 98 on the G4 probe: three times wrestling, nine times
 * striking offence. Cardio is the most load-bearing physical in the sport; it is not three skills.
 */
export const CARDIO_GRIP = 0.3;
/**
 * And below an average tank, how hard a poor one bites. Asymmetric on purpose: a bad gas tank is a
 * fight-losing hole — the man is visibly empty by the third — while the difference between a very
 * good tank and an elite one is real and smaller. Meets `CARDIO_GRIP` at Cardio 50, where the effect
 * curve is 1, so the average fighter is untouched.
 */
export const POOR_TANK_GRIP = 0.85;

/**
 * Trait multipliers on the tank (`cardioMachine`, `chainWrestler`, ...) go through the same flattening,
 * or a trait would keep the full force the attribute just lost: `cardioMachine` read 22.8 points of
 * win rate against wrestling's 21 once `CARDIO_GRIP` landed — the defect `trait-cost.test.ts` guards.
 */
export const TRAIT_TANK_GRIP = 0.6;

export function tankTraitMul(c: Combatant): number {
  return traitMul(c.fighter.traits, 'fatigueRate') ** TRAIT_TANK_GRIP;
}

export function tankEffect(c: Combatant): number {
  const e = effect(c.attrs.cardio, 1.2);
  return e ** (e < 1 ? POOR_TANK_GRIP : CARDIO_GRIP);
}

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
  const cardio = tankEffect(c);

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
    tankTraitMul(c) *
    // Swinging hard is expensive. The third leg of the `riskLevel` trade: recklessness buys
    // power now and pays for it in the championship rounds.
    riskProfile(c.plan.riskLevel).exertion *
    (1 / cardio);

  c.fatigue = clamp01(c.fatigue + delta);
}

/** Recover between rounds. Mutates the combatant. */
export function recoverBetweenRounds(c: Combatant, restSeconds = 60): void {
  const cardio = tankEffect(c);
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
  const cardio = tankEffect(c);
  c.fatigue = clamp01(
    c.fatigue +
      (STRIKE_COST[weapon] *
        // Sitting down on a shot costs more than flicking it — the other half of `commitment`.
        riskProfile(c.plan.riskLevel).commitment ** 3 *
        (1 + c.cutPenalty * 0.45) *
        bodyDrag(c) *
        tankTraitMul(c)) /
        cardio,
  );
}

/**
 * What a grappling effort costs the tank, for Cardio 50. Doc 36, the wrestling-economy pass.
 *
 * Before this, a stuffed shot cost the *defender* a little and the shooter nothing, a chained second
 * and third link cost nothing at all, and a failed get-up was free. The sport runs the other way:
 * driving through a sprawl with the other man's weight on your head is the most expensive thing in
 * the fight, a chain wrestler spends his tank to spend yours, and fighting your way up a wall over
 * and over empties the man underneath. Every figure here goes through the same cardio, body-damage
 * and weight-cut terms as everything else, so a body-shot game makes a wrestler pay more for each.
 */
export const EFFORT = {
  /** Shooting at all: level change, penetration step. */
  shot: 0.005,
  /** On top of `shot` when it is stuffed: the sprawl lands on him. */
  stuffed: 0.009,
  /** Each further link of a chain, on top of the above. */
  chainLink: 0.004,
  /** Sprawling and whizzering a shot. Less than the shooter pays, which is why sprawl-and-brawl works. */
  sprawl: 0.005,
  /** A get-up attempt that fails: wall-walk, hand-fight, and back down. */
  failedGetUp: 0.009,
  /** A get-up that works. Still work. */
  getUp: 0.005,
} as const;

export function chargeEffort(c: Combatant, amount: number): void {
  const cardio = tankEffect(c);
  c.fatigue = clamp01(
    c.fatigue +
      (amount * (1 + c.cutPenalty * 0.45) * bodyDrag(c) * tankTraitMul(c)) /
        cardio,
  );
}
