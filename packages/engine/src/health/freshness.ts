/**
 * How recovered a fighter is right now.
 *
 * The game had no such thing. `Condition.fatigue` exists, but `applyAftermath` sets it to `0`
 * after every bout and nothing outside `simulateFight` ever reads it — so being tired was a
 * round-by-round concept and never a career one. A fighter could take a fifteen-minute war,
 * spend ten weeks in the hardest camp available, and walk to the cage in exactly the state of a
 * man who had done nothing at all.
 *
 * Freshness is not fitness and it is not cardio. A fighter can have a world-class engine and be
 * flat; that is what a bad camp does to somebody. It is the thing a real camp is periodised
 * around, and it is the missing half of three separate decisions doc 25 is about: how hard to
 * train, when to fight, and what a career's accumulated mileage actually costs.
 *
 * **It is inert as of doc 25 phase 2.** It falls, it returns, and the hub shows it. Nothing reads
 * it to decide anything yet — training intensity spends it in phase 3 and fight night reads it in
 * the same phase. Shipping it alone is still worth doing, because a fighter who fights often, or
 * fights wars, becomes visibly flat and the player can see it before the mechanics arrive.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Fighter } from '../domain/fighter.js';
import { exposureScore, type FightExposure } from './injuries.js';

/** A fighter who has done nothing to themselves. */
export const FRESH = 100;

/**
 * Points of freshness returned per day by a 25-year-old with average recovery and no mileage.
 *
 * Set from §5's target: a standard eight-week camp should be fully recovered from in about five
 * weeks. That fixes this against `STANDARD_LOAD_PER_DAY` rather than leaving both free.
 */
const BASE_RECOVERY = 1.6;

/**
 * How much slower a body comes back with age.
 *
 * Applied here rather than by decaying `naturals.recovery`, because naturals are what a fighter
 * was born with and their card should keep saying so — the same distinction `headTrauma` already
 * observes against `durability`. A 38-year-old needs roughly 40% longer to come back than a
 * 25-year-old, which is what 0.72 buys.
 */
export function ageDrag(age: number): number {
  return clamp(remap(age, 25, 38, 1, 0.72), 0.62, 1.05);
}

/** Points of freshness this fighter gets back per day of doing nothing. */
export function recoveryRate(fighter: Fighter, age: number): number {
  return (
    BASE_RECOVERY *
    (fighter.naturals.recovery / 60) *
    (1 - clamp01(fighter.condition.bodyWear / 100) * 0.45) *
    ageDrag(age)
  );
}

/**
 * Points of freshness a day of camp costs.
 *
 * Above `recoveryRate` on purpose: a camp has to dig a hole, or there is nothing to periodise.
 * At 2.1 against a 25-year-old's 1.30, a standard eight-week camp finishes about 45 points down
 * and takes five weeks to clear — which is the §5 target, and which is also why a *light* camp in
 * phase 3 comes out freshness-positive without anything else being changed: 0.35 of this is 0.74,
 * and a fighter recovering at 1.30 gains while they train.
 */
export const STANDARD_LOAD_PER_DAY = 2.1;

/** What a training block of this length costs, before recovery over the same days. */
export function campFreshnessCost(days: number, intensity = 1): number {
  return Math.max(0, days) * STANDARD_LOAD_PER_DAY * intensity;
}

/**
 * What a fight costs, read off the same exposure the injury roll uses.
 *
 * One number for both is the point. A thirty-second submission where nothing landed should cost
 * almost no injury risk *and* almost no freshness; a three-round war should cost a great deal of
 * both. Calibrated so the war leaves a fighter flat for about two months and the quick finish for
 * a few days.
 */
export const FIGHT_FRESHNESS_PER_EXPOSURE = 32;

export function fightFreshnessCost(exposure: FightExposure): number {
  return exposureScore(exposure) * FIGHT_FRESHNESS_PER_EXPOSURE;
}

/**
 * Read the field, tolerating its absence — and clamping.
 *
 * Every fighter in every save written before this existed has no `freshness`, and absent must mean
 * *fresh* rather than *empty* — the same rule `lastTrained` follows in doc 23 § 2.5. Loading an old
 * career must not open with eight hundred exhausted fighters.
 *
 * The clamp on read is what makes `duringTraining` safe; see it for why the stored value is
 * allowed below zero in the first place.
 */
export const freshnessOf = (fighter: Fighter): number =>
  clamp(fighter.condition.freshness ?? FRESH, 0, FRESH);

/** Store a settled value, on the scale. */
export const withFreshness = (value: number): number => clamp(value, 0, FRESH);

/**
 * Store a mid-span value, which is allowed to be notionally below empty.
 *
 * A camp spends and the same days recover, and the two are charged by different functions —
 * `applyTraining` and `applyAgeing` — because every caller in the game already runs both over the
 * same span. Clamping the intermediate at zero breaks that: an eight-week camp charging 118 points
 * against 100 available bottoms out, loses the 18-point overshoot, and then recovery adds 73 to a
 * floor rather than to the true figure. Measured, that put a camp's end state at 67 where the
 * arithmetic says 55, and the distortion grows with camp length — precisely where the model most
 * needs to be right.
 *
 * So the mid-span value carries the overshoot and `freshnessOf` clamps on read.
 *
 * The floor is derived rather than picked, because the first attempt at it was picked — `-FRESH`,
 * which sounds generous and starts binding at a fourteen-week camp, at which point a *longer* camp
 * came out fresher than a shorter one. A year of unbroken camp is the bound: no real training
 * block approaches it, and a caller that trains for years without letting the clock move is
 * pathological rather than merely enthusiastic and should not be able to build a debt it takes the
 * rest of a career to work off.
 */
const MAX_TRAINING_DEBT = STANDARD_LOAD_PER_DAY * 365;

export const duringTraining = (value: number): number => clamp(value, -MAX_TRAINING_DEBT, FRESH);

/** Plain language, because a bare number out of a hundred tells a player nothing. */
export function describeFreshness(value: number): string {
  if (value >= 85) return 'Fresh';
  if (value >= 65) return 'Sharp';
  if (value >= 45) return 'Worked';
  if (value >= 25) return 'Flat';
  return 'Running on empty';
}
