/**
 * How far apart two standing fighters are, and who gets to decide.
 *
 * `distance` used to be one bucket. It held a karateka bouncing at kicking range and two boxers
 * chest-to-chest throwing hooks, and told the engine they were the same place — which is why
 * three separate things could not work:
 *
 *  - **Outside and Pocket were the same physical location.** Two game plans that name opposite
 *    fights produced 267 and 268 seconds of "distance" apiece, differing only in what the policy
 *    biased them to throw.
 *  - **`reachInches` had no contest to win.** Authored on every fighter in both seed rosters,
 *    rendered on the fighter screen, and read by nothing in the simulator.
 *  - **Boxing, kickboxing and karate could only differ on "do you kick".** `kickShare` and
 *    `legTargetShare` are one axis wearing two hats, which is why kickboxing against karate sat
 *    at 0.090 on the styles fingerprint and the striking family never met G1.
 *
 * ### What range is, and what it is not
 *
 * Range is **state**, contested by both fighters, and skill decides it. The plan says which range
 * you want; footwork, anticipation and reach decide whether you get it. Telling a poor athlete to
 * stay outside against an elite pressure fighter must produce a man who *tries to disengage all
 * night and fails*, not one who is handed 80% outside time — that separation is the whole
 * philosophy of the tactical layer, applied to the one axis that previously had no state at all.
 *
 * Range is also **not pressure**. Walking somebody backwards and closing the gap to them are
 * related and not identical: a pressure kickboxer wants you retreating *at kicking range*. So
 * `desiredRange` comes from the plan's preferred state, and the entry style — pressure, movement,
 * lead, counter — acts on *who can give ground*, never on which range either man wants. Baking
 * "pressure means pocket" back in would reintroduce the exact conflation the old `approach`
 * control was replaced for.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import {
  GROUND_DOMINANCE,
  RANGES,
  RANGE_SEPARATION,
  STRIKE_TARGETS,
  type GroundPosition,
  type Range,
  type StrikeTarget,
  type Weapon,
} from './types.js';
import type { Combatant } from './profile.js';
import { stanceEdge } from './stance.js';

/**
 * How well a weapon works at a range, as a multiplier on how often it is *chosen*.
 *
 * **Suitability, never legality.** A first cut of this said "at long range, hands are the jab
 * only", which is simply false — a rear straight, an overhand entry and a long hook all live at
 * range — and the falseness was the signal that a two-state model was being stretched over three
 * ranges. Nothing here forbids a weapon anywhere; it makes some of them awkward.
 *
 * **Keyed by `(weapon, target)` because that is the taxonomy the engine has.** The distinction
 * that matters most — a low kick is not the same range problem as a head kick — is already
 * expressible, because targets are per-shot. What is *not* yet expressible is jab against cross
 * against hook against uppercut: `Weapon` is `punch | kick | knee | elbow`, so "hands" is one row
 * where it should eventually be four. That is the next weapon-taxonomy change and this table is
 * shaped to receive it — adding a `jab` weapon means adding rows here, not restructuring
 * anything. Until then the punch rows are the average of a hand game, which is honest about being
 * an average rather than pretending to a granularity the engine does not have.
 *
 * `knee` and `elbow` are clinch and ground weapons and never reach this table; they are listed at
 * 1 so the record is total rather than partial, and a future standing elbow finds a home.
 */
const SUITABILITY: Readonly<Record<Weapon, Readonly<Record<StrikeTarget, Record<Range, number>>>>> =
  {
    punch: {
      // Hands reach at boxing range and are awkward at the very end of them.
      head: { outside: 0.75, boxing: 1.25, pocket: 1.15 },
      body: { outside: 0.5, boxing: 1.1, pocket: 1.35 },
      legs: { outside: 1, boxing: 1, pocket: 1 },
    },
    kick: {
      // A head kick needs room to travel and a target who is not leaning on you.
      head: { outside: 1.4, boxing: 0.9, pocket: 0.25 },
      body: { outside: 1.25, boxing: 1, pocket: 0.4 },
      // The low kick is the exception that makes the table worth having: it is the one strike
      // that works at every range, and a model that treats "kicks" as one thing cannot say so.
      legs: { outside: 1.3, boxing: 1.15, pocket: 0.6 },
    },
    knee: { head: { outside: 1, boxing: 1, pocket: 1 }, body: { outside: 1, boxing: 1, pocket: 1 }, legs: { outside: 1, boxing: 1, pocket: 1 } },
    elbow: { head: { outside: 1, boxing: 1, pocket: 1 }, body: { outside: 1, boxing: 1, pocket: 1 }, legs: { outside: 1, boxing: 1, pocket: 1 } },
  };

export function strikeSuitability(weapon: Weapon, target: StrikeTarget, range: Range): number {
  return SUITABILITY[weapon][target][range];
}

/**
 * How well a *target* is served by this range, as a shape rather than a level.
 *
 * The best of the two weapons that could deliver it, divided by the mean across all three
 * targets — which makes this a claim about where a range points a fighter and *not* about how
 * dangerous the range is. Without the division the table's absolute level leaks into target
 * selection: every column's best cell is the head, so the whole population aimed high more often
 * and the roster's knockouts went from 34.5% to 43.1% without any range being more dangerous
 * than another.
 *
 * The same correction `NEUTRAL_HABIT` makes in `profile.ts`, found the same way and for the same
 * reason: a table written as independent propensities is not a distribution over anything until
 * somebody normalises it.
 */
export function targetFitness(target: StrikeTarget, range: Range): number {
  const best = (t: StrikeTarget) =>
    Math.max(SUITABILITY.punch[t][range], SUITABILITY.kick[t][range]);
  const mean = (best('head') + best('body') + best('legs')) / 3;
  return best(target) / mean;
}

/**
 * The range mix the shipped roster actually produces, and why every table below is divided by it.
 *
 * **A table of per-range multipliers is a shape and a level, and only the shape was intended.**
 * `ENTRY_EASE` was authored as 0.5 / 1 / 1.55 — an entry is hard from kicking range and easy from
 * the pocket, which is true — and against a 45/43/12 range mix that weights out to **0.84**. So
 * it did not only move *where* grappling is easy; it made grappling 16% harder everywhere, and
 * the roster's knockouts went 39.1% → 43.1% and its first-round finishes 37.7% → 40.6% on that
 * alone. Isolating the four tables one at a time, `ENTRY_EASE` was the entire difference.
 *
 * Dividing each table through by its own mean under this mix makes every one of them level-free
 * by construction: they decide which range favours what, and none of them decides how much of
 * anything the sport has. The same correction `NEUTRAL_HABIT` makes for targeting habits and
 * `NEUTRAL_TENDENCY` makes for scouting reads — a third system, same defect, found the same way.
 *
 * Measured over all 35,627 pairings of the 2026 roster with the tables live. It moves a little
 * when they change, which is fine: a reference mix that is right to a few points does the job,
 * and being wrong by that much moves the level by well under a per cent.
 */
export const REFERENCE_MIX: Readonly<Record<Range, number>> = { outside: 0.45, boxing: 0.43, pocket: 0.12 };

/** Divide a per-range table through by its mean under the reference mix. Shape, never level. */
function shapeOnly(raw: Readonly<Record<Range, number>>): Readonly<Record<Range, number>> {
  const mean = RANGES.reduce((total, r) => total + raw[r] * REFERENCE_MIX[r], 0);
  return { outside: raw.outside / mean, boxing: raw.boxing / mean, pocket: raw.pocket / mean };
}

/**
 * How hard it is to shoot or tie up from here — the payoff nobody had to argue for.
 *
 * The engine had no concept of needing to *get close enough to grapple*, so a wrestler's shot
 * cost the same whether he was in somebody's chest or two metres away. With range, a rangy
 * striker can deny entry by refusing to be reachable, a pressure wrestler can use his hands to
 * force the pocket and then shoot from it, and a reactive wrestler can wait for the other man to
 * walk in. Reach, movement and wrestling finally interact.
 */
export const ENTRY_EASE = shapeOnly({ outside: 0.5, boxing: 1, pocket: 1.55 });

/**
 * A small positional hazard term — and the emphasis is on *small*.
 *
 * The pocket is dangerous mostly because of what happens there: shorter reaction time, more
 * reciprocal exchanges, heavier weapons becoming the suitable ones, and disengagement being a
 * contest rather than a step. All of that is modelled elsewhere and produces knockouts on its
 * own. Making `range === 'pocket'` itself radioactive would double-charge for the same physics
 * and put the calibration somewhere very strange very quickly, so this is a nudge on top of
 * behaviour rather than the mechanism.
 */
export const RANGE_HAZARD = shapeOnly({ outside: 0.92, boxing: 1, pocket: 1.08 });

/** Counter opportunity by range: in the pocket everything comes back. */
export const RANGE_COUNTER = shapeOnly({ outside: 0.8, boxing: 1, pocket: 1.25 });

/**
 * The positional half of the fatigue cost, and small for the same reason `RANGE_HAZARD` is.
 *
 * Fighting in the pocket is exhausting mostly because of what it makes you do — throw more,
 * react more, absorb more, and be unable to step away — and `accrueFatigue` already charges for
 * action. This is only the part that is genuinely about the position itself: you cannot rest
 * where you are.
 */
export const RANGE_EXERTION = shapeOnly({ outside: 0.94, boxing: 1, pocket: 1.12 });

// --- Who controls the range ------------------------------------------------------------------

/**
 * A fighter's ability to manage distance.
 *
 * **This function is the seam for a future Footwork attribute**, and it is written as one on
 * purpose. `speed` is already carrying hand speed, reaction time and who lands first; cage
 * movement is a fourth job it should not have, and a fighter with astonishing hands and heavy
 * feet is a real and common fighter this model currently cannot describe. When a movement rating
 * lands, it enters here and nowhere else.
 *
 * Reach is deliberately **not** a term in the sum. Long arms are threat geometry, not footwork —
 * they make closing on you dangerous, which is a different claim from being good at maintaining
 * distance, and somebody can have an 80-inch reach and terrible feet. It multiplies as a capped
 * leverage on the skill instead, so it amplifies a good range manager and cannot manufacture one.
 */
export function rangeControl(c: Combatant): number {
  const a = c.attrs;
  // Quickness to move, anticipation to know when, and the tank to keep doing it for 15 minutes.
  return (
    remap(a.speed, 25, 95, 25, 95) * 0.5 +
    remap(a.fightIq, 25, 95, 25, 95) * 0.3 +
    remap(a.cardio, 25, 95, 25, 95) * 0.2
  );
}

/**
 * What reach is worth to whoever is trying to *keep* the fight at range, as a capped multiplier.
 *
 * Capped at ±12% over the roster's realistic spread, which is a real edge and cannot carry a
 * fighter on its own — `range.test.ts` asserts exactly that by putting a long mediocre mover
 * against a short excellent one and requiring the short one to win the range. Reach that beat
 * skill would quietly become the best attribute in the game, bought free at generation.
 */
export function reachLeverage(holder: Combatant, other: Combatant): number {
  const inches = holder.fighter.reachInches - other.fighter.reachInches;
  return 1 + clamp(inches / 6, -1, 1) * 0.12;
}

export type RangeChange = 'close' | 'retreat';

/**
 * Whether a range change comes off, as a 0–1 chance.
 *
 * Both directions are the same contest read from opposite ends: the mover's range control against
 * the holder's, with reach leverage going to whichever of them wants the fight *further apart*.
 * Closing on a long fighter is hard because he can touch you on the way in; backing away from a
 * short one is hard because he is already inside your arms.
 *
 * `stickiness` is what stops the fight strobing. Without it the two fighters simply alternate —
 * A closes, B retreats, A closes — every exchange, and the state flickers without either man
 * achieving anything, which is worse than no state at all. A range that has just been imposed is
 * defended harder, decaying over the next few beats: taking the pocket off a pressure fighter is
 * an achievement, and so is re-closing on somebody who has just circled out.
 */
export function rangeChangeChance(input: {
  mover: Combatant;
  holder: Combatant;
  change: RangeChange;
  /** 0–1. How established the current range is, from `FightState.rangeSettled`. */
  stickiness: number;
  /** Multiplier from the mover's plan and entry style. */
  intent: number;
  /** Multiplier from the holder's ability to deny ground — `pressure` walks people down. */
  denial: number;
}): number {
  const { mover, holder, change, stickiness, intent, denial } = input;

  // Reach helps whoever wants the greater separation.
  const reach =
    change === 'retreat' ? reachLeverage(mover, holder) : 1 / reachLeverage(holder, mover);

  /*
   * The open stance, in the contest it belongs to.
   *
   * Where a southpaw and an orthodox fighter can stand relative to one another is most of what
   * the matchup *is* — the lead feet decide who owns the outside angle, and the man who owns it
   * both closes when he wants to and refuses to be walked down. It applies to the mover's push
   * and the holder's resistance for that reason: it is one advantage, spent in whichever
   * direction its owner is trying to go.
   */
  const push = rangeControl(mover) * reach * intent * stanceEdge(mover, holder);
  const resist = rangeControl(holder) * denial * (1 + stickiness * 0.55) * stanceEdge(holder, mover);

  return clamp(push / (push + resist), 0.05, 0.9);
}

/**
 * The share of a fighter's shots that are kicks, as an expectation rather than a draw.
 *
 * This mirrors `pickShot` exactly — the same two-branch lean, the same suitability arbitration,
 * the same rule that a shot to the legs is always a kick — and exists because the Reduced
 * resolver has to know a fighter's weapon mix without throwing any individual shot.
 *
 * `kickLean` on its own is not that number, and the difference is the whole point of range. A
 * striker's bare lean says what he reaches for; where he is standing says what is available when
 * he reaches. The two diverge most for exactly the fighter the parity suite cares about — a rangy
 * striker kept at kicking range throws far more kicks than his attributes alone predict — and
 * that divergence was worth 0.89 knockdowns a fight at Full against 0.60 at Reduced.
 */
export function expectedKickShare(
  lean: number,
  targets: Record<StrikeTarget, number>,
  mix: Record<Range, number>,
): number {
  // Above the waist, the odds this particular shot comes off a foot. `pickShot`'s arithmetic.
  const kickOdds = (base: number, target: StrikeTarget, range: Range): number => {
    const kickFit = strikeSuitability('kick', target, range);
    const punchFit = strikeSuitability('punch', target, range);
    return clamp01((base * kickFit) / Math.max(1e-6, base * kickFit + (1 - base) * punchFit));
  };

  let share = 0;
  for (const range of RANGES) {
    const weight = mix[range];
    if (weight <= 0) continue;

    // `pickWeighted` normalises, so the target odds are the weights over their own sum.
    const weights = STRIKE_TARGETS.map((t) => Math.max(0, targets[t]) * targetFitness(t, range));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;

    STRIKE_TARGETS.forEach((target, i) => {
      const p = (weights[i] ?? 0) / total;
      if (p <= 0) return;
      // Nobody punches a leg.
      const kick =
        target === 'legs'
          ? 1
          : // The exchange picks a stance for the burst first, and that decides which branch of
            // `pickShot`'s base the shot is drawn from.
            lean * kickOdds(0.55 + lean * 0.4, target, range) +
            (1 - lean) * kickOdds(lean * 0.3, target, range);
      share += weight * p * kick;
    });
  }
  return clamp01(share);
}

/** One step toward or away, since ranges are ordered rather than adjacent-by-name. */
export function stepRange(from: Range, change: RangeChange): Range {
  if (change === 'close') return from === 'outside' ? 'boxing' : 'pocket';
  return from === 'pocket' ? 'boxing' : 'outside';
}

/** Which way this fighter needs to move to get the fight where they want it. */
export function changeToward(current: Range, desired: Range): RangeChange | undefined {
  const gap = RANGE_SEPARATION[desired] - RANGE_SEPARATION[current];
  if (gap === 0) return undefined;
  return gap < 0 ? 'close' : 'retreat';
}

/**
 * Where a fight lands after a transition that is not a referee reset.
 *
 * A fighter who scrambles to his feet with the other man attached is not magically at kicking
 * range, and a clean push-off out of a tie-up does not put two people in each other's chest. The
 * bell and the referee produce a neutral restart; everything else inherits from what just
 * happened, and saying so is the difference between a range model and a range label.
 */
export const TRANSITION_RANGE: Readonly<Record<string, Range>> = {
  /**
   * A fighter on top choosing to let the other man up and step back — from a position he was not
   * tangled in.
   *
   * The most space-creating transition in the game, and the reason it is not `boxing` like the
   * bottom man's get-up: the man doing the standing is the one who chose it, he is on his feet
   * first, and the other man is starting from the floor. What he does with the space is then his
   * own problem — the stickiness this is booked with is deliberately low, so the opponent can
   * contest it on the very next beat rather than being walked out to kicking range for free.
   */
  topDisengage: 'outside',
  /**
   * The same decision taken out of a guard, which is not the same separation.
   *
   * *Where you end up depends on how you got out*, and out of a closed or half guard you got out
   * by peeling somebody's legs off your hips while he held them there. He comes up with you and he
   * is within arm's reach when he does — so this books hands range, exactly like the bottom man's
   * wall-walk, rather than the clean step-off the dominant positions give.
   */
  topDisengageTangled: 'boxing',
  /** Round start, referee restart, ref stand-up: everybody resets to their own corner's distance. */
  neutral: 'outside',
  /** A clean break out of the tie-up. Hands range, not kicking range. */
  clinchBreak: 'boxing',
  /**
   * The man *holding* the tie-up choosing to let go of it.
   *
   * Hands range too, and that is not laziness: two men who are both already standing when they
   * separate are within arm's reach of each other however it happened, which is exactly what the
   * top disengage is not. What differs is booked in the stickiness instead — this man picked the
   * moment and is balanced when the space appears, so he keeps it a little longer than somebody who
   * has just wrestled his way free.
   */
  clinchRelease: 'boxing',
  /** The referee separating a stalled tie-up: he steps between them and waves them on. */
  refSeparation: 'outside',
  /** Wall-walked up with the other man disengaging. */
  standUp: 'boxing',
  /** Both men popping up out of a scramble — nobody has had time to find their range. */
  scramble: 'pocket',
  /** A stuffed shot that ends up back on the feet: you are right on top of each other. */
  stuffedTakedown: 'pocket',
};

/**
 * Where a voluntary top disengagement puts the fight, given where it was disengaged *from*.
 *
 * The question this answers is "how did the separation happen", not "reset to what" — see the two
 * `TRANSITION_RANGE` entries for the reasoning. Split out of the resolver so the mapping can be
 * asserted directly rather than inferred from a range histogram three mechanisms downstream.
 */
export function disengageRange(position: GroundPosition): Range {
  return GROUND_DOMINANCE[position] >= GROUND_DOMINANCE.sideControl
    ? TRANSITION_RANGE.topDisengage!
    : TRANSITION_RANGE.topDisengageTangled!;
}

/**
 * How much of a fighter's plan is about range at all.
 *
 * A grappling preference wants the pocket, because that is where entries live — but it wants it
 * *as a route*, not as a destination, which is why this is weaker than a striking preference's
 * claim on its own range. A fighter who wants the fight on the floor is not fussy about being at
 * boxing range on the way there.
 */
export function rangeUrgencyScale(desired: Range, isGrapplingPlan: boolean): number {
  if (isGrapplingPlan) return 0.65;
  return desired === 'boxing' ? 0.8 : 1;
}

/** Convert 0–1 stickiness into the decay applied once per exchange. */
export function decayStickiness(current: number, seconds: number): number {
  return clamp01(current * Math.exp(-seconds / 22));
}
