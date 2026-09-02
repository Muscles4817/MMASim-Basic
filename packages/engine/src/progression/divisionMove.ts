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

import { clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { DivisionId } from '../core/ids.js';
import { divisionsFor, getDivision, type Division } from '../domain/divisions.js';
import {
  bodyOf,
  cutChain,
  makeableDivisions,
  massExpressionShift,
  physiqueOf,
  settledBody,
  stepTowardBody,
  walkingWeightLbs as walkingWeightOfBody,
  weighInFloorLbs,
  type Body,
} from './body.js';
import { PHYSICAL_SCALE_KEYS } from '../ratings/physicalScale.js';
import type { Fighter } from '../domain/fighter.js';
import { weightMissRiskMultiplier } from '../domain/personality.js';
import { traitMul } from '../domain/traits.js';
import { toRating, type AttributeKey, type Attributes } from '../ratings/attributes.js';

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
  /** What months of gaining or losing real mass will do, once settled. Physicals only. */
  settledAttributeChange: Partial<Attributes>;
  /** Where their walking weight ends up once the body has finished moving. */
  settledWalkingWeightLbs: number;
  /** Plain-language verdict, ordered most important first. */
  notes: readonly string[];
}

/**
 * **`settledWalkingWeight` and `massChangeEffect` were both deleted at doc 31 § 12 step 11.**
 *
 * `settledWalkingWeight(division)` returned `division.limitLbs * 1.07`, and it was the last
 * surviving copy of the thing the entire ladder exists to remove: the division deciding the body.
 * Two fighters eight inches apart moving to welterweight both settled at exactly 182 lb. It lived
 * this long because it lived in the one module where mass actually moves, which is also the reason
 * it had to be the last thing fixed rather than the first. Its replacement is `settledBody` in
 * `body.ts`, which moves the two primitives a career can move and leaves height and frame alone.
 *
 * `massChangeEffect(deltaLbs)` paid a flat table — `+2.4 strength, +1.6 power, −1.5 speed,
 * −1.8 cardio, +1.1 takedownDefence, +0.7 wrestling` per fifteen pounds — added once to the current
 * rating. Three things were wrong with it and only the first was visible:
 *
 *  - **It double-counted.** § 11's own table said so: once mass feeds expression through the
 *    ladder, a separate table applying mass effects is the same effect charged twice.
 *  - **It was a one-off delta rather than a re-reading.** Applying it twice for two half-steps gave
 *    a different answer from once for the whole, and reversing the move did not reverse the
 *    ratings. A fighter who went up and came back was not the fighter who never left.
 *  - **It moved two skills.** `takedownDefence` and `wrestling` are capability. Being heavier makes
 *    somebody harder to take down, and that is Strength doing its job in the engine — not a
 *    fighter who got better at sprawling because he ate differently.
 *
 * Its replacement is `massExpressionShift`, which is the difference between the median rating for
 * the new body and for the old one, applied to the five physicals only.
 */

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

  /*
   * Severity and makeability now come from the body, not from a remap on a scalar weight.
   *
   * `cutSeverity` was `(walking − limit) / limit / 0.18` — a percentage against a hand-drawn danger
   * line, which cannot tell a lean fighter from a fat one of the same weight and therefore cannot
   * say *why* a cut is hard. `weighInFloorLbs` is the calibrated answer (§ 15) and it is the one
   * the creation screen and the generator already use, so this module joining them is the last
   * consumer to stop having its own opinion about weight.
   */
  const body = bodyOf(fighter);
  const severity = cutSeverityOf(body, targetId);
  const currentSeverity = cutSeverityOf(body, fighter.divisionId);
  const makeable = weighInFloorLbs(body) <= target.limitLbs;

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

  /*
   * What the fighter looks like once the body has finished moving, rather than what one camp does.
   *
   * The appraisal is a forecast, so it reads the *whole* journey — `settledBody` for the target
   * division against the body today — while `settleWeight` below walks a share of it per camp. Both
   * go through the same two functions, which is what stops the screen promising something the
   * simulation then does not deliver.
   */
  const settled = settledBody(body, target.limitLbs);
  const shift = massExpressionShift(body, settled);
  const settledAttributeChange: Partial<Attributes> = {};
  for (const key of PHYSICAL_SCALE_KEYS) {
    const change = round1(shift[key]);
    if (Math.abs(change) >= 0.1) settledAttributeChange[key] = change;
  }
  const settledWalkingWeightLbs = Math.round(walkingWeightOfBody(settled));

  const notes: string[] = [];

  if (direction === 'same') {
    notes.push('This is the division you already fight in.');
  } else if (!makeable) {
    notes.push(
      `You cannot make ${target.limitLbs}lb. At ${Math.round(walkingWeightOfBody(body))}lb walking around, the lightest you could ever weigh in is ${Math.round(weighInFloorLbs(body))}lb — that is a floor, not a hard camp.`,
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
      notes.push(
        `On paper you are above this division — roughly ${fieldGap} points clear of the field.`,
      );
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
    settledWalkingWeightLbs,
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
    lastDivisionChangeDay: day,
  };
}

/**
 * How much of the remaining journey one camp covers, coming down.
 *
 * Fat comes off on a timescale a camp actually works on. Eight weeks of a real professional diet is
 * most of the way to where somebody is going, which is why the number is this large.
 */
const SETTLE_SHARE_DOWN = 0.35;

/**
 * The same, going up — and deliberately slower.
 *
 * Dropping fifteen pounds is a diet; adding fifteen pounds of usable mass is most of a year. The
 * asymmetry was in the old implementation too, as `share * 0.6`, and it is one of the few things
 * about that function worth keeping.
 */
const SETTLE_SHARE_UP = 0.21;

/**
 * Move the body a share of the way toward where it settles for the current division, and re-read
 * the physicals from it.
 *
 * **This used to move a number and then add a table to the ratings.** It set
 * `walkingWeightLbs` directly — a field derived from `physique` everywhere else in the game, so the
 * two quietly diverged the moment anybody changed weight class — and then applied
 * `massChangeEffect` as a one-off increment. Doc 31 § 12 step 11.
 *
 * Now it moves `muscleIndex` and `bodyFatIndex`, which are the primitives a career can move, and
 * the five physicals are **re-read** from the new body through `massExpressionShift`. Walking
 * weight is not set at all, because it is no longer stored: it falls out of the body, as it does
 * for every other fighter in the game.
 *
 * The ceiling takes the same shift as the rating. That is the point of the whole step: a fighter
 * who moves up is not closer to their limit, they are the same distance from a limit that has moved
 * with them — because `potential` is a reading at a mass exactly as `attributes` is.
 */
export function settleWeight(fighter: Fighter, share?: number): Fighter {
  const body = bodyOf(fighter);
  const division = getDivision(fighter.divisionId);
  const settled = settledBody(body, division.limitLbs);

  const gap = walkingWeightOfBody(settled) - walkingWeightOfBody(body);
  if (Math.abs(gap) < 1) return fighter;

  const rate = share ?? (gap > 0 ? SETTLE_SHARE_UP : SETTLE_SHARE_DOWN);
  const next = stepTowardBody(body, settled, clamp01(rate));
  const shift = massExpressionShift(body, next);

  const attributes = { ...fighter.attributes };
  const potential = { ...fighter.potential };
  const carry: Partial<Record<AttributeKey, number>> = { ...fighter.trainingCarry };

  for (const key of PHYSICAL_SCALE_KEYS) {
    /*
     * **Banked, or the whole effect rounds to nothing.**
     *
     * A move is worth about two rating points and settles over six or eight camps, so the shift is
     * a third of a point at a time and `toRating` rounds every one of them away. Measured before
     * this line existed: a lightweight settled into welterweight over forty camps and gained *one*
     * point of Strength against a forecast of 2.3. That is the same defect `trainingCarry` was
     * introduced to fix for camps and `applyAgeing` for decline, arriving a third time — see the
     * field's own comment.
     */
    const banked = (carry[key] ?? 0) + shift[key];
    const whole = Math.trunc(banked);
    carry[key] = banked - whole;
    if (whole === 0) continue;

    /*
     * The ceiling moves first and the rating follows it, never past it.
     *
     * A fighter already at their ceiling for Strength who puts on fifteen pounds should gain
     * Strength — the old code clamped the gain to a ceiling that had not moved, so mass bought
     * nothing for exactly the fighters it should have bought the most for.
     */
    potential[key] = toRating(potential[key] + whole);
    attributes[key] = toRating(Math.min(potential[key], attributes[key] + whole));
  }

  return { ...fighter, physique: physiqueOf(next), attributes, potential, trainingCarry: carry };
}

/**
 * Every division this fighter could physiologically make today.
 *
 * `makeableDivisions` rather than a severity threshold: the question "could this body ever weigh
 * that" has an exact answer in the cut model, and a scalar severity line was a proxy for it from
 * before there was one.
 */
export function viableDivisions(fighter: Fighter): Division[] {
  return makeableDivisions(bodyOf(fighter), fighter.sex);
}

/**
 * Cut severity, on the calibrated model rather than on a percentage.
 *
 * Kept as a 0–1 scalar because the appraisal, the personality weight-miss roll and several screens
 * read it that way — but the number underneath is now how far through the *removable* mass a cut
 * reaches, which is a question about this body rather than about its weight. 1.0 means the weigh-in
 * floor: the point where there is nothing left to take.
 */
export function cutSeverityOf(body: Body, divisionId: DivisionId): number {
  const limit = getDivision(divisionId).limitLbs;
  const chain = cutChain(body);
  const removable = chain.walkingWeightLbs - chain.weighInFloorLbs;
  if (removable <= 0) return chain.walkingWeightLbs > limit ? 1 : 0;
  return clamp01((chain.walkingWeightLbs - limit) / removable);
}
