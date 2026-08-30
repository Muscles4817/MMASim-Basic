/**
 * Rating → effect curves.
 *
 * This module is the reason a 99 feels like a 99. A linear reading of a 1–100 scale makes
 * every elite fighter feel the same; the simulator therefore never consumes raw ratings for
 * physical resolution, only the convex *effect* of a rating.
 *
 *   effect(r) = exp(K · (r − 50) / 50)
 *
 * effect(50) is exactly 1.0 by construction, so "average" is the unit and every coefficient
 * elsewhere in the engine is expressed relative to an average fighter.
 *
 * See docs/02-attributes-and-ratings.md § "The effect curve".
 */

import { ATTRIBUTE_META, type AttributeKey, type Attributes, type Rating } from './attributes.js';

/** The pivot at which effect is exactly 1.0. */
export const EFFECT_PIVOT = 50;

/**
 * Convert a rating to a multiplier with an explicit convexity.
 *
 * Prefer {@link attributeEffect} in engine code so the per-attribute convexity from
 * `ATTRIBUTE_META` is applied consistently.
 */
export function effect(rating: Rating, convexity: number): number {
  return Math.exp((convexity * (rating - EFFECT_PIVOT)) / 50);
}

/** Effect multiplier for an attribute, using its declared convexity. */
export function attributeEffect(attrs: Attributes, key: AttributeKey): number {
  return effect(attrs[key], ATTRIBUTE_META[key].convexity);
}

/** Effect multiplier for a raw rating treated as the given attribute. */
export function ratingEffect(rating: Rating, key: AttributeKey): number {
  return effect(rating, ATTRIBUTE_META[key].convexity);
}

/**
 * The inverse: what rating produces this effect multiplier? Used by tuning tools and by the
 * editor's "show me what this change actually does" preview.
 */
export function effectToRating(multiplier: number, convexity: number): number {
  if (multiplier <= 0) return 0;
  return EFFECT_PIVOT + (50 * Math.log(multiplier)) / convexity;
}

/**
 * Ratio of two effects — "how much better is A than B at this?".
 *
 * Returned as a multiplier, so 1.0 is parity and 4.7 means A produces 4.7× the effect.
 * This is the number the simulator actually cares about in contested rolls.
 */
export function effectRatio(a: Rating, b: Rating, key: AttributeKey): number {
  return ratingEffect(a, key) / ratingEffect(b, key);
}

/**
 * Fatigue-adjusted rating.
 *
 * `fatigue` is 0 (fresh) to 1 (completely gone). Different attributes rot at different
 * rates: explosive output collapses long before craft does, and a tired fighter's chin goes
 * before their submission defence does. `sensitivity` is the fraction of the rating that
 * fatigue can eat at fatigue = 1.
 */
export const FATIGUE_SENSITIVITY: Readonly<Record<AttributeKey, number>> = {
  power: 0.35,
  speed: 0.4,
  cardio: 0.0, // Cardio *is* the tank; it is not itself drained.
  durability: 0.3,
  strength: 0.3,
  strikingOffence: 0.22,
  kicking: 0.35, // Kicks are the first thing to disappear when the legs go.
  strikingDefence: 0.3,
  wrestling: 0.35,
  takedownDefence: 0.3,
  groundControl: 0.25,
  submissions: 0.18, // Technique survives exhaustion better than athleticism does.
  scrambling: 0.4,
  fightIq: 0.12,
  composure: 0.15,
};

export function fatigued(rating: Rating, key: AttributeKey, fatigue: number): number {
  const f = fatigue < 0 ? 0 : fatigue > 1 ? 1 : fatigue;
  return rating * (1 - FATIGUE_SENSITIVITY[key] * f);
}

/** Fatigue-adjusted effect multiplier — the form the simulator uses most. */
export function fatiguedEffect(rating: Rating, key: AttributeKey, fatigue: number): number {
  return effect(fatigued(rating, key, fatigue), ATTRIBUTE_META[key].convexity);
}

/* ---------------------------------------------------------------------------------------------
 * The repertoire gate
 * ------------------------------------------------------------------------------------------ */

/**
 * **Is this technique in the fighter's game at all?**
 *
 * `effect` answers *how well would it go*. This answers *would he reach for it*, and they are
 * different questions that the engine spent its whole life conflating. Doc 31 § D16 is the
 * report — a former Olympic boxer with `submissions: 12` hunting chokes — and the mechanism is
 * that `effect` is a **multiplier and never a gate**: across the whole 1–100 scale it spans about
 * 13:1 and bottoms out at 0.24 rather than at 0. A weighted draw is a softmax over the log of the
 * capability terms, so a candidate's share is decided by the *ratio* between the attribute that
 * names it and whatever attribute happens to name the candidate beside it. Measured, a fighter
 * with `submissions: 70` reached for a submission **less often** than one with `submissions: 30`,
 * provided he was the better scrambler.
 *
 * ### The anchors are doc 02's, not new ones
 *
 * The scale table in doc 02 § "The scale" already says this in words and nothing ever read it:
 *
 * ```
 *   38–49   Below major-promotion level. A hole opponents will find.  → his. The gate is 1.
 *   20–37   A genuine liability. This is how you lose.               → the ramp.
 *    1–19   Effectively absent from their game.                      → the floor.
 * ```
 *
 * So the gate spans **exactly the band doc 02 calls a genuine liability**, and neither end is a
 * tuning value: below it the doc says the technique is not in his game, above it the doc says he
 * has it and does it badly — and *does it badly* is a thing `effect` has always been able to say.
 *
 * **`REPERTOIRE_OWNED` is 38 and not 50, and the difference is the whole safety of the term.** The
 * first cut anchored it at the bottom of *average for a major-promotion roster*, which reads
 * correctly and is a statement about the wrong population: the shipped 2026 world is a pyramid of
 * 858 fighters from regional to elite, and **its median sits at 44 on every attribute with more
 * than 60% below 50.** At the higher anchor the mean gate over the roster was 0.60 on *striking
 * offence* — the sport's most basic act — so the term stopped being a gate on a missing technique
 * and became a tax on being an ordinary fighter. Measured, it did exactly what such a tax does:
 * because each list's residual is ungated by design, and the residual at range is throwing hands,
 * **every fighter in the world became a puncher and the roster's knockout rate went from 31% to
 * 50%.** A regional fighter with `kicking: 44` has a kicking game. He is not good at it, which is
 * `effect`'s job and not this one.
 *
 * ### Why it must be its own term
 *
 * It is **not** capability — folding it into `effect` would change every contest in the game, and
 * a 12-submissions fighter who somehow locks up an armbar should still have his tiny chance. It is
 * **not** intent — intent is what a fighter *wants*, and no instruction should be able to give a
 * boxer a submission game or take a specialist's away. It sits on the capability side of a draw
 * as its own named factor, so `intentAuthority` reads it correctly and so nothing can quietly
 * fold it into a coefficient beside it. See `Candidate.repertoire` in `fight/decide.ts`.
 *
 * ### It costs nothing at the default
 *
 * `repertoire(38) === 1`, and it is 1 for every rating above that — so the term is **exactly inert
 * for roughly three quarters of the shipped roster and for every fighter the player will ever be
 * booked against**. That is the same
 * rule `topControlFocus` records: a new term must cost nothing at the neutral or it is not a new
 * term, it is a rebalance wearing one. What it changes is the bottom of the scale, which is
 * precisely where nothing could previously be said.
 */
export const REPERTOIRE_ABSENT = 19;
export const REPERTOIRE_OWNED = 38;

/**
 * How sharply the gate falls away through the two bands between absent and owned.
 *
 * Set by reading the band rather than by taste. Doc 02's *genuine liability* runs 20–37 and is not
 * one claim end to end — a 21 is a man who has seen the technique and a 36 is a man with a poor
 * one — so the ramp through it is convex rather than straight:
 *
 * ```
 *   19 → 0.03      28 → 0.22      32 → 0.45      36 → 0.79      38 → 1.00
 * ```
 *
 * A linear ramp would read 0.50 at the midpoint and would say a fighter with `submissions: 28`
 * hunts half as often as one with a real submission game, which is not what *this is how you lose*
 * means.
 */
const REPERTOIRE_CONVEXITY = 2.2;

/**
 * Nothing is ever strictly impossible, and this is the number that says so.
 *
 * Three reasons it is not zero, in ascending order of how badly zero breaks things. A boxer who
 * once grabbed a neck in a scramble is a real fight and the model should be able to produce one.
 * A candidate at exactly zero cannot be told from one that is *unavailable*, which is a
 * distinction `intentAuthority` depends on. And a fighter terrible at everything on a list would
 * hand `pickWeighted` a total of zero, which is not a fight, it is a crash.
 *
 * Small enough to mean *once in a career*: at 0.03 the Olympic boxer's share of his bottom beats
 * falls from 3.9% to about 0.1%, and his measured submission attempts from one fight in five to
 * one fight in a hundred.
 */
const REPERTOIRE_FLOOR = 0.03;

/**
 * The gate itself, 0–1. See the block comment above for where the anchors come from.
 *
 * Deliberately takes a bare rating rather than an `AttributeKey`: unlike `effect`, this does not
 * vary per attribute. *Is it in his game* is the same question about a head kick and a heel hook,
 * and a per-attribute table here would be fifteen more numbers nobody could defend individually.
 * It is applied to derived ratings too, which are on the same scale by construction (`toRating`)
 * — and which regress toward the middle, so a derived capability is rarely gated hard. That is
 * correct and worth noticing: `chainWrestling` averages in cardio and strength, so a boxer's reads
 * 46 rather than his `wrestling` 25, and the gate barely touches his takedowns. The gate bites
 * hardest exactly where one raw attribute is the whole story, which is where D16 was found.
 */
export function repertoire(rating: Rating): number {
  const span = REPERTOIRE_OWNED - REPERTOIRE_ABSENT;
  const x = (rating - REPERTOIRE_ABSENT) / span;
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x;
  return REPERTOIRE_FLOOR + (1 - REPERTOIRE_FLOOR) * clamped ** REPERTOIRE_CONVEXITY;
}

/*
 * **There is deliberately no fatigue-adjusted form of this**, and the first cut had one.
 *
 * It read `repertoire(fatigued(rating, ...))`, on the argument that a tired fighter stops throwing
 * what he is not sure of. That argument is about *execution*, which `fatiguedEffect` already
 * prices, and reading fatigue here charges it a second time — the same double-count the exits are
 * kept clear of. A black belt is still a black belt in round three; what he has lost is the ability
 * to finish the thing, not the knowledge of it.
 *
 * It also quietly broke the property the whole term rests on. `FATIGUE_SENSITIVITY` for wrestling
 * is 0.35, so a `wrestling: 40` fighter reads 35.8 at fatigue 0.3 and drops through the gate in the
 * second round — so a term advertised as inert above 38 was in fact firing on most of the roster
 * for most of every fight. It was found by `reduced-fidelity.test.ts`, which is exactly the guard
 * that should have found it: Full's head damage in one matchup moved 4% while Reduced's did not.
 */
