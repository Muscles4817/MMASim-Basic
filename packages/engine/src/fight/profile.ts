/**
 * Turning a Fighter into a combatant the simulator can run.
 *
 * Two jobs:
 *  1. Derive the fighter's **tendencies** — what they actually do — from attributes and
 *     traits, so a scouting report is never separately authored (and therefore never
 *     separately wrong).
 *  2. Build the mutable per-fight `Combatant` scratch state.
 *
 * The `Combatant` is deliberately mutable. The fight loop allocates hard otherwise, and
 * 10k-fight statistical tests need to stay cheap. It is local to one `simulateFight` call
 * and never escapes, so the engine remains pure from the outside.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import { fatiguedEffect } from '../ratings/curve.js';
import { legImpairment } from './damage.js';
import type { GamePlan, TendencyProfile } from '../domain/gameplan.js';
import { READ_KEYS } from '../domain/gameplan.js';
import type { Fighter } from '../domain/fighter.js';
import { gamePlanAdherence } from '../domain/personality.js';
import { hasTrait, traitAdd, traitMul } from '../domain/traits.js';
import type { Attributes } from '../ratings/attributes.js';
import { deriveRatings, type DerivedRatings } from '../ratings/derived.js';
import { cutSeverity } from '../domain/divisions.js';
import { FRESH, freshnessOf } from '../health/freshness.js';
import type { Corner, DamageRegion, FightStats, StrikeTarget } from './types.js';
import { emptyStats, type GroundPosition, type Position } from './types.js';

/**
 * Does this fighter reach for striking or for grappling first? 0.15 … 0.85.
 *
 * Exported because it turns out to be the single most load-bearing thing about a fighter who is
 * *underneath* somebody. Measured, the striker and the guard player spend the same two thirds of a
 * round being controlled and throw 12.4 and 4.8 significant strikes in it — a 2.6× gap between two
 * men in the same predicament, and neither their cardio nor their striking rating explains it. What
 * does is that one of them is looking for a way back to his feet and the other is looking for an
 * arm. `round.ts` reads it for exactly that.
 *
 * The two sides are deliberately not the same shape, because the two phases are not.
 *
 * Striking is **one** phase — hands and feet are thrown from the same place, at the same opponent,
 * so how much a fighter wants to stand is the average of what they own standing.
 *
 * Grappling is **two games**. There is a top game — `wrestling` to get there, `groundControl` to
 * keep it there — and a bottom game — `submissions` off the back, `scrambling` to get up or
 * reverse — and *either one on its own* is a reason to want the fight on the floor. Averaging all
 * four made a fighter who owns one of them read as half a grappler, which is precisely the defect
 * this fixes (docs/19 §8a): a guard player with 92 submissions and 40 wrestling read 0.529,
 * striker-leaning, and every tendency scaled by this scalar was scaled the wrong way.
 */
export function strikeLean(f: Fighter): number {
  const a = f.attributes;
  const striking = (a.strikingOffence + a.kicking) / 2;
  const grappling = Math.max(
    (a.wrestling + a.groundControl) / 2,
    (a.submissions + a.scrambling) / 2,
  );
  return clamp01(remap(striking - grappling, -30, 30, 0.15, 0.85));
}

/**
 * How likely this fighter is to do each readable thing, 0–1.
 *
 * These are *propensities*, not probabilities of success. A fighter with `doubleLeg: 0.9`
 * shoots doubles constantly; whether they land is a separate contest.
 */
export function deriveTendencies(f: Fighter): TendencyProfile {
  const a = f.attributes;
  const t = f.traits;

  // Normalise an attribute to a 0–1 propensity, with 50 sitting around 0.4 so that being
  // merely average at something does not read as "this is their signature move".
  const p = (rating: number) => clamp01(remap(rating, 25, 95, 0.05, 0.95));

  const lean = strikeLean(f);

  const tendencies: TendencyProfile = {
    leadHook: p(a.strikingOffence) * (0.5 + lean * 0.5),
    counterRight: p(a.strikingOffence) * clamp01(remap(a.fightIq, 40, 90, 0.3, 1)),
    calfKick: p(a.kicking) * clamp01(remap(a.fightIq, 40, 90, 0.4, 1)),
    headKick: p(a.kicking) * (hasTrait(t, 'headhunter') ? 1.2 : 0.85),
    bodyWork: p((a.strikingOffence + a.fightIq) / 2) * (hasTrait(t, 'headhunter') ? 0.35 : 0.9),
    highVolume: p(a.cardio) * traitMul(t, 'strikeOutput') * lean,
    singleLeg: p(a.wrestling) * (1 - lean * 0.6),
    doubleLeg: p(a.wrestling) * clamp01(remap(a.strength, 40, 90, 0.6, 1.1)),
    fenceClinch: p((a.strength + a.wrestling) / 2) * (1 - lean * 0.4),
    bodyLock: p((a.strength + a.wrestling) / 2) * 0.85,
    guillotine: p(a.submissions) * 0.7,
    backTake: p((a.submissions + a.scrambling) / 2),
    groundAndPound: p((a.groundControl + a.power) / 2),
    guardPassing: p(a.groundControl),
    wallGetUp: p((a.scrambling + a.takedownDefence) / 2),
  };

  for (const key of READ_KEYS) tendencies[key] = clamp01(tendencies[key]);
  return tendencies;
}

/** Per-fight mutable state for one fighter. Never escapes `simulateFight`. */
export interface Combatant {
  corner: Corner;
  fighter: Fighter;
  attrs: Attributes;
  derived: DerivedRatings;
  plan: GamePlan;
  tendencies: TendencyProfile;

  /** 0–1. Consumed by action, not by time. */
  fatigue: number;
  /** Damage meters, 0–100, per region. */
  damage: Record<DamageRegion, number>;
  /** Transient hurt state; counts down in seconds. 0 = not hurt. */
  hurtSeconds: number;
  /** Number of times they have been dropped this fight. */
  knockdownsSuffered: number;
  /** −1 (being dominated) to +1 (dominating). Feeds frontrunner/dog behaviour. */
  momentum: number;

  /** 0–1. How much of the plan they are executing. Fixed at bout start. */
  adherence: number;
  /**
   * 0.25–1. How much of the game plan has survived the fight so far.
   *
   * `adherence` is who they are; this is what tonight has done to it. It erodes while they are
   * hurt, carrying head damage or losing badly, recovers partially between rounds, and multiplies
   * into every policy decision — so a natural brawler told to stay outside holds the instruction
   * for as long as staying outside is comfortable, and stops the moment it is not. See
   * `policy.ts`.
   */
  planIntegrity: number;
  /** Rating points of effective Power/Strength from rehydrating above the limit. */
  sizeAdvantage: number;
  /** 0–1. Cardio penalty baked in from the weight cut. */
  cutPenalty: number;

  stats: FightStats;
  /** Cumulative career trauma this fight has produced so far. */
  traumaIncrement: number;
}

/**
 * Effective Durability right now: the number the knockdown hazard actually divides by.
 *
 * Three things pull it down — accumulated head damage tonight, career head trauma, and
 * fatigue — and traits set a floor. This is the mechanical statement of "chins go, and they
 * do not come back".
 */
export function effectiveDurability(c: Combatant): number {
  const base = c.attrs.durability;
  const traits = c.fighter.traits;

  /*
   * Career trauma erodes the ceiling — and now some of that erosion is already permanent.
   *
   * Reduced from 22 because doc 25 § 4 makes trauma take durability off the stored attribute
   * through `applyAgeing`. Leaving this where it was would charge a damaged fighter twice for the
   * same damage: once on the card and once again on the night. What changes is the *permanence*,
   * not the total — a fighter who has just been in a war is hurt about as much as before, and one
   * who has been in wars for a decade is hurt considerably more, because part of it never came
   * back.
   */
  const careerErosion = (c.fighter.condition.headTrauma / 100) * 14;
  // Tonight's damage erodes it further, and compounds — the tenth clean shot lands on a
  // worse chin than the first.
  const tonightErosion = (c.damage.head / 100) * 30 * traitMul(traits, 'durabilityDecay');
  const fatigueErosion = c.fatigue * 12;

  const floor = clamp(
    base * 0.35 + traitAdd(traits, 'durabilityFloorShift'),
    1,
    Math.max(1, base),
  );

  return clamp(base - careerErosion - tonightErosion - fatigueErosion, floor, 100);
}

/** Effective Composure, lifted by traits that keep a fighter switched on while hurt. */
export function effectiveComposure(c: Combatant): number {
  return clamp(
    c.attrs.composure + traitAdd(c.fighter.traits, 'compositionUnderFire'),
    1,
    100,
  );
}

/**
 * How much momentum swings this fighter's performance.
 *
 * A `frontrunner` gets a real lift while ahead and craters when it turns; a `dog` inverts
 * the sign entirely and performs *better* under pressure. Returns a multiplier around 1.
 */
export function momentumMultiplier(c: Combatant): number {
  const sensitivity = traitAdd(c.fighter.traits, 'momentumSensitivity');
  if (sensitivity === 0) return 1;
  return clamp(1 + c.momentum * sensitivity, 0.55, 1.5);
}

/** Output multiplier for the current round, honouring fast/late-starter traits. */
export function roundBiasMultiplier(c: Combatant, round: number, totalRounds: number): number {
  const bias = traitAdd(c.fighter.traits, 'lateRoundBias');
  if (bias === 0) return 1;
  // -1 in round one, +1 in the final round.
  const progress = totalRounds <= 1 ? 0 : ((round - 1) / (totalRounds - 1)) * 2 - 1;
  return clamp(1 + bias * progress, 0.6, 1.45);
}

/**
 * How much of the first round a fighter has already spent before it starts.
 *
 * At most `MAX_STARTING_FATIGUE` — a quarter of the way to gassed at nothing left in the tank,
 * which is enough to matter in a hard fight and nowhere near enough to beat a real engine.
 */
export const MAX_STARTING_FATIGUE = 0.25;

export function startingFatigue(fighter: Fighter): number {
  return clamp01((1 - freshnessOf(fighter) / FRESH) * MAX_STARTING_FATIGUE);
}

export function createCombatant(
  corner: Corner,
  fighter: Fighter,
  plan: GamePlan,
): Combatant {
  const traits = fighter.traits;
  const severity = cutSeverity(fighter.walkingWeightLbs, fighter.divisionId);

  return {
    corner,
    fighter,
    attrs: fighter.attributes,
    derived: deriveRatings(fighter.attributes),
    plan,
    tendencies: deriveTendencies(fighter),

    /*
     * You start the fight in the state your camp left you in. Doc 25 § 3.4.
     *
     * This was flatly `0` for everybody, so a fighter who had just overreached for twelve weeks
     * and one who had tapered walked to the cage identically. Deliberately gentle and capped:
     * freshness must change *where you begin*, not how fast you tire, or it becomes a second
     * hidden cardio attribute deciding fights from a menu.
     */
    fatigue: startingFatigue(fighter),
    damage: { head: 0, body: 0, legs: 0 },
    hurtSeconds: 0,
    knockdownsSuffered: 0,
    momentum: 0,

    adherence: clamp01(
      gamePlanAdherence(fighter.personality) + traitAdd(traits, 'gamePlanAdherence'),
    ),
    planIntegrity: 1,
    // Cutting hard makes you physically bigger in the cage — a real, earned advantage that
    // the fighter pays for in the cardio penalty below.
    sizeAdvantage: traitAdd(traits, 'sizeAdvantage') + severity * 4,
    cutPenalty: severity,

    stats: emptyStats(),
    traumaIncrement: 0,
  };
}

/**
 * How much of this fighter's striking goes to the feet right now.
 *
 * Shared rather than private to `simulate.ts` because the round-level resolver needs the same
 * answer: which weapon a fighter throws decides what their damage is worth, and two definitions of
 * that would be two different sports.
 */
export function kickLean(c: Combatant): number {
  const hands = fatiguedEffect(c.attrs.strikingOffence, 'strikingOffence', c.fatigue);
  const feet = fatiguedEffect(c.attrs.kicking, 'kicking', c.fatigue) * legImpairment(c);
  return clamp01(feet / Math.max(1e-6, feet + hands));
}

/**
 * The average fighter's targeting habit, as a shape rather than a level.
 *
 * `pickTarget` divides by this, which is what makes the change it implements a **shape-only**
 * change: a fighter whose habits match the roster's average aims exactly where the engine already
 * had them aiming, and only a deviation from the average bends the plan. Without it, the arbitrary
 * constants inside the tendency formulas — `bodyWork`'s 0.9 against `headKick`'s 0.85 — would leak
 * into the population's damage distribution, because those numbers were written as independent
 * propensities for a scouting report and were never a distribution over anything.
 *
 * Measured over both shipped rosters, mean-normalised so it is level-free, then divided by the
 * split the engine produced before this existed (60/25/15 with half the leg shots redirected
 * upstairs, so effectively 65/27/7.5):
 *
 * ```
 *          head   body   legs        → divided through
 * 2020    1.190  1.310  0.500          1.09  1.20  1.00
 * 2026    1.151  1.391  0.458          1.06  1.28  0.92
 * ```
 *
 * Two rosters that differ enormously in level — 139 hand-authored fighters against 858 — agree on
 * the shape to within a few per cent, which is what makes a baked constant a measurement rather
 * than a fit. The midpoint is used, and being wrong by the width of that disagreement moves the
 * population's leg share by well under a point.
 */
const NEUTRAL_HABIT: Readonly<Record<StrikeTarget, number>> = {
  head: 1.08,
  body: 1.24,
  legs: 0.96,
};

/**
 * Where this fighter's shots go: the corner's plan, bent by their own habits.
 *
 * Returns relative weights over the three targets rather than drawing one, because the two callers
 * want different things from the same answer — `simulate.ts` draws a shot from it, and the
 * round-level resolver takes the whole distribution at once. It read only the plan once, which
 * made *where a fighter aims* a property of their game plan and never of their art (docs/19 §7.2),
 * and every AI fight in the game uses the same default plan (doc 18 §2.5).
 *
 * The plan still sets the shape and the population still lands where it landed before. What the
 * fighter adds is *deviation*: a headhunter with a third of the body work aims high more than the
 * corner asked, a karateka goes low twice as often as a boxer, and a fighter whose legs have been
 * chewed up stops aiming at legs at all.
 *
 * `legs` carries `kickLean` because going low means throwing a kick, so whether a fighter aims
 * there is a question about their feet — including a tired fighter's feet and a chewed-up base.
 *
 * `counterRight` rather than `leadHook` for the hand half, deliberately: `leadHook` carries
 * `strikeLean`, which reads the grappling attributes, and a fighter's wrestling has no business
 * deciding where their punches go. Measured, that channel was worth 4 points of win rate to a
 * 98-`wrestling` fighter.
 */
export function targetMix(actor: Combatant): Record<StrikeTarget, number> {
  const plan = actor.plan.targeting;
  const t = actor.tendencies;

  const habit: Record<StrikeTarget, number> = {
    head: (t.counterRight + t.headKick) / 2,
    body: t.bodyWork,
    legs: t.calfKick * kickLean(actor),
  };
  const mean = (habit.head + habit.body + habit.legs) / 3;
  if (mean <= 0) return { head: plan.head, body: plan.body, legs: plan.legs };

  return {
    head: plan.head * (habit.head / mean / NEUTRAL_HABIT.head),
    body: plan.body * (habit.body / mean / NEUTRAL_HABIT.body),
    legs: plan.legs * (habit.legs / mean / NEUTRAL_HABIT.legs),
  };
}

/** Position-specific stamina cost multipliers. Grinding is expensive; range is cheap. */
export const POSITION_COST: Readonly<Record<Position, number>> = {
  distance: 0.75,
  clinch: 1.45,
  ground: 1.15,
};

/**
 * Extra stamina cost for the fighter being held on the fence: carrying somebody is exhausting.
 *
 * D15. The engine has computed `isControlled` for the clinch since the tie-up got two sides, and
 * then never read it — `GROUND_BOTTOM_COST` was applied only on the floor, so a man pinned against
 * the cage paid exactly what the man pinning him paid. Two things follow from fixing it, and the
 * second is the one that matters: `clinchIntent: 'control'` stops being an instruction that buys
 * only clock and judges' points, because wearing somebody out against the fence is most of what
 * holding them there is *for*.
 *
 * Calibrated against the analogous ground distinction rather than chosen: the floor charges the man
 * underneath 1.5× the man on top in side control, and this reads 1.4 — a little less, because a man
 * on the fence still has his feet under him and can hand-fight, which is more than a man under side
 * control has. `POSITION_COST.clinch` is untouched, so the tie-up remains the most expensive place
 * in the fight for *both* men, which it should be and already was.
 */
export const CLINCH_HELD_COST = 1.4;

/** Extra stamina cost for the fighter *underneath*: being controlled is exhausting. */
export const GROUND_BOTTOM_COST: Readonly<Record<GroundPosition, number>> = {
  guard: 1.1,
  halfGuard: 1.3,
  sideControl: 1.5,
  mount: 1.7,
  back: 1.6,
};
