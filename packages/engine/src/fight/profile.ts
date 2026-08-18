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
import type { GamePlan, TendencyProfile } from '../domain/gameplan.js';
import { READ_KEYS } from '../domain/gameplan.js';
import type { Fighter } from '../domain/fighter.js';
import { gamePlanAdherence } from '../domain/personality.js';
import { hasTrait, traitAdd, traitMul } from '../domain/traits.js';
import type { Attributes } from '../ratings/attributes.js';
import { deriveRatings, type DerivedRatings } from '../ratings/derived.js';
import { cutSeverity } from '../domain/divisions.js';
import { FRESH, freshnessOf } from '../health/freshness.js';
import type { Corner, DamageRegion, FightStats } from './types.js';
import { emptyStats, type GroundPosition, type Position } from './types.js';

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

  /*
   * Relative preference: does this fighter reach for striking or for grappling first?
   *
   * The two sides are deliberately not the same shape, because the two phases are not.
   *
   * Striking is **one** phase — hands and feet are thrown from the same place, at the same
   * opponent, so how much a fighter wants to stand is the average of what they own standing.
   *
   * Grappling is **two games**. There is a top game — `wrestling` to get there, `groundControl`
   * to keep it there — and a bottom game — `submissions` off the back, `scrambling` to get up or
   * reverse — and *either one on its own* is a reason to want the fight on the floor. Averaging
   * all four made a fighter who owns one of them read as half a grappler, which is precisely the
   * defect this fixes (docs/19 §8a): a guard player with 92 submissions and 40 wrestling read
   * 0.529, striker-leaning, and every tendency scaled by this scalar was scaled the wrong way.
   * Only jiu-jitsu and the guard-player fixture move; the other five disciplines' best grappling
   * route is their top game either way.
   */
  const striking = (a.strikingOffence + a.kicking) / 2;
  const grappling = Math.max(
    (a.wrestling + a.groundControl) / 2,
    (a.submissions + a.scrambling) / 2,
  );
  const strikeLean = clamp01(remap(striking - grappling, -30, 30, 0.15, 0.85));

  const tendencies: TendencyProfile = {
    leadHook: p(a.strikingOffence) * (0.5 + strikeLean * 0.5),
    counterRight: p(a.strikingOffence) * clamp01(remap(a.fightIq, 40, 90, 0.3, 1)),
    calfKick: p(a.kicking) * clamp01(remap(a.fightIq, 40, 90, 0.4, 1)),
    headKick: p(a.kicking) * (hasTrait(t, 'headhunter') ? 1.2 : 0.85),
    bodyWork: p((a.strikingOffence + a.fightIq) / 2) * (hasTrait(t, 'headhunter') ? 0.35 : 0.9),
    highVolume: p(a.cardio) * traitMul(t, 'strikeOutput') * strikeLean,
    singleLeg: p(a.wrestling) * (1 - strikeLean * 0.6),
    doubleLeg: p(a.wrestling) * clamp01(remap(a.strength, 40, 90, 0.6, 1.1)),
    fenceClinch: p((a.strength + a.wrestling) / 2) * (1 - strikeLean * 0.4),
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
    // Cutting hard makes you physically bigger in the cage — a real, earned advantage that
    // the fighter pays for in the cardio penalty below.
    sizeAdvantage: traitAdd(traits, 'sizeAdvantage') + severity * 4,
    cutPenalty: severity,

    stats: emptyStats(),
    traumaIncrement: 0,
  };
}

/** Position-specific stamina cost multipliers. Grinding is expensive; range is cheap. */
export const POSITION_COST: Readonly<Record<Position, number>> = {
  distance: 0.75,
  clinch: 1.45,
  ground: 1.15,
};

/** Extra stamina cost for the fighter *underneath*: being controlled is exhausting. */
export const GROUND_BOTTOM_COST: Readonly<Record<GroundPosition, number>> = {
  guard: 1.1,
  halfGuard: 1.3,
  sideControl: 1.5,
  mount: 1.7,
  back: 1.6,
};
