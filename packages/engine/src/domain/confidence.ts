/**
 * What a result does to a fighter's self-belief, and what time does to it afterwards.
 *
 * Confidence used to be four lines inside `applyAftermath`:
 *
 * ```ts
 * const swing = won ? 12 : drew ? 0 : -16 * lossImpactMultiplier(fighter.personality);
 * const finishBonus = won && isKoMethod(result.method) ? 5 : 0;
 * ```
 *
 * — and nothing else in the entire codebase ever wrote the field. docs/25 §1 sets out why that
 * was wrong in four separate ways; this module is the answer to all four.
 *
 * **It is a mood, not an injury.** Trauma and wear accumulate because they genuinely do not heal.
 * Confidence does, and without {@link recoverConfidence} a fighter carried the worst night of
 * their life at full weight for twenty years. That single omission is what ended careers at
 * twenty-four: three losses put a debutant at 12, `retirementUrge` reads confidence with no age
 * gate, and nothing in the game could ever bring them back up.
 *
 * **Losses are not interchangeable.** A nine-second head kick and a five-round split decision
 * both cost exactly 16 before this. Everything needed to tell them apart — the method, the
 * scorecards, the knockdowns, the round, the opponent — was already in scope at that line and
 * none of it was read.
 *
 * **The people are not interchangeable either.** One personality axis of eight was consulted and
 * no trait at all, in a model that has `fragileEgo`, `durableMind` and `gunShy` sitting in the
 * table describing this exact behaviour.
 *
 * Kept in `domain/` and fed plain numbers rather than a `FightResult` so it stays testable
 * without building a fight, and so `progression/` can reach the recovery half without taking a
 * dependency on `business/`. The extraction from a real result lives in `business/aftermath.ts`,
 * which is the only place that has one.
 */

import { clamp, remap } from '../core/math.js';
import {
  confidenceBaseline,
  confidenceGainMultiplier,
  confidenceRecoveryYears,
  egoDeflectionMultiplier,
  lossImpactMultiplier,
  type Personality,
} from './personality.js';
import { traitMul, type TraitId } from './traits.js';
import type { FinishMethod } from './fighter.js';

/**
 * How far a defeat by each method moves somebody, before anything else is applied.
 *
 * The ordering is the argument: what shakes a fighter is not losing, it is *how far* they were
 * from being in the fight at the moment it ended. A split decision says the night was close. A
 * clean knockout says their opponent found the off switch, and there is nothing to review.
 *
 * A submission sits deliberately below a TKO despite both being finishes. Being submitted is a
 * technical defeat and fighters treat it as one — it exposes a specific hole rather than a
 * general inadequacy, and the hole is trainable. Being stopped on strikes is neither specific
 * nor trainable.
 *
 * `dq` is the outlier and is nearly free: losing on a point deduction says nothing about whether
 * you can fight. `retirement` — quitting on the stool — is the one a fighter has to explain to
 * themselves afterwards, so it is charged above the stoppage it replaced.
 */
const LOSS_BY_METHOD: Readonly<Record<FinishMethod, number>> = {
  ko: 22,
  tko: 16,
  doctorStoppage: 12,
  retirement: 18,
  submission: 12,
  decisionUnanimous: 10,
  decisionMajority: 7,
  decisionSplit: 6,
  dq: 4,
  draw: 0,
  noContest: 0,
};

/**
 * And how far a win by each method moves somebody.
 *
 * A tighter range than the loss table, and that asymmetry is deliberate rather than an accident
 * of tuning: belief is easier to damage than to build. It is also why the old flat `+12 / −16`
 * was net-negative for anybody under a 57% win rate — an asymmetry is correct, but it has to be
 * paid for by the recovery term rather than by a slow bleed nobody can arrest.
 *
 * Winning a decision you were losing on two cards is worth less than sweeping one; that comes
 * from the scorecard margin below rather than from this table.
 */
const WIN_BY_METHOD: Readonly<Record<FinishMethod, number>> = {
  ko: 16,
  tko: 14,
  doctorStoppage: 11,
  retirement: 11,
  submission: 13,
  decisionUnanimous: 10,
  decisionMajority: 7,
  decisionSplit: 6,
  dq: 4,
  draw: 0,
  noContest: 0,
};

export interface ConfidenceSwingInput {
  personality: Personality;
  traits: readonly TraitId[];
  outcome: 'win' | 'loss' | 'draw' | 'noContest';
  method: FinishMethod;
  /** Round it ended in, 1-indexed. */
  round: number;
  /** Times this fighter was put down. Shakes them even in a fight they won. */
  knockdownsSuffered: number;
  /**
   * Mean per-round scorecard margin from this fighter's point of view, or `undefined` when the
   * fight did not reach the judges. Positive means they were winning it.
   *
   * Per round rather than in total so a three- and a five-rounder are on the same scale: a
   * clean sweep is +1, a shut-out with a 10-8 in it goes past that, and a razor-thin decision
   * sits near zero from both corners.
   */
  scoreMargin?: number;
  /**
   * Overall rating of the opponent minus this fighter's own. Positive means they were the
   * underdog on paper.
   */
  ratingStep: number;
  isTitleFight?: boolean;
}

/**
 * The confidence a result is worth, signed. Add it to the current value and clamp.
 *
 * Returns 0 for a no-contest: nothing was settled, so there is nothing to feel about it.
 */
export function confidenceSwing(input: ConfidenceSwingInput): number {
  const { outcome, method, personality, traits } = input;
  if (outcome === 'noContest') return 0;

  /*
   * A draw is not nothing, but what it is depends on who you are.
   *
   * A fighter who was clearly ahead on the cards and did not get the nod is bruised by it; one
   * who was being beaten and escaped with a draw is relieved. That is entirely the score margin,
   * so a draw is scored from the margin alone at a fraction of a real result's weight.
   */
  if (outcome === 'draw') {
    const margin = input.scoreMargin ?? 0;
    return clamp(-margin * 4, -5, 5);
  }

  const won = outcome === 'win';
  const base = won ? WIN_BY_METHOD[method] : LOSS_BY_METHOD[method];
  if (base === 0) return 0;

  /*
   * How one-sided it was, for the fights that reached the judges.
   *
   * Undefined for a finish — a stoppage is already fully described by its method and its round,
   * and the partial cards behind an early finish are not what anybody remembers about it.
   */
  const margin = input.scoreMargin;
  const oneSidedness =
    margin === undefined
      ? 1
      : won
        ? clamp(remap(margin, 0, 1, 0.85, 1.25), 0.85, 1.3)
        : clamp(remap(margin, 0, -1, 0.8, 1.35), 0.75, 1.4);

  /*
   * When it ended.
   *
   * Only meaningful for a stoppage, and only for the fighter on the wrong end of one: being put
   * away inside a round is a different experience from being worn down over five. A late
   * stoppage is a fight you were losing anyway; an early one is a fight you were never in.
   */
  const earliness =
    margin !== undefined || won ? 1 : clamp(remap(input.round, 1, 5, 1.15, 0.9), 0.9, 1.15);

  /*
   * Who it was against.
   *
   * This is what stops a fighter being punished for moving up. Losing to somebody ten points
   * better is information about the level, not about you; losing to somebody ten points worse is
   * the one that keeps people awake. The win side is the mirror, with a wider top end because
   * beating a fighter you had no business beating is the single most transformative thing that
   * can happen to a career.
   */
  const level = won
    ? clamp(remap(input.ratingStep, -10, 10, 0.65, 1.6), 0.6, 1.7)
    : clamp(remap(input.ratingStep, -10, 10, 1.3, 0.62), 0.6, 1.35);

  /*
   * Getting dropped, whatever the result said.
   *
   * A fighter who wins a decision having been put down twice does not come out of it feeling
   * quite as they would otherwise. Flat points rather than a multiplier, because the effect does
   * not scale with how the fight was eventually scored.
   */
  const knockdowns = Math.max(0, input.knockdownsSuffered) * 1.6;

  // A belt on the line amplifies both directions. It is the night the whole career was for.
  const stakes = input.isTitleFight ? 1.15 : 1;

  if (won) {
    const gain =
      (base * oneSidedness * level * stakes - knockdowns * 0.5) *
      confidenceGainMultiplier(personality);
    return Math.max(0, round1(gain));
  }

  const loss =
    (base * oneSidedness * earliness * level * stakes + knockdowns) *
    lossImpactMultiplier(personality) *
    egoDeflectionMultiplier(personality) *
    traitMul(traits, 'confidenceLoss');
  return -round1(loss);
}

/**
 * Drift confidence back toward this fighter's baseline over elapsed time.
 *
 * Exponential rather than a fixed step per call, and that is load-bearing rather than tidy:
 * `applyAgeing` is called with a fortnight by the world tick and with ten weeks by a camp, and
 * the same elapsed time has to produce the same fighter either way. Exponential decay composes —
 * two half-years give exactly the same answer as one whole one — and it can never overshoot the
 * baseline, so no clamping is needed to stop a long layoff inverting somebody's mood.
 *
 * It pulls in both directions on purpose. A fighter riding a ten-fight streak at 100 who then
 * sits out a year comes back believing in themselves rather less than the night they last won,
 * which is as true as the other direction and is what stops confidence ratcheting upward instead.
 */
export function recoverConfidence(
  current: number,
  personality: Personality,
  years: number,
): number {
  if (years <= 0) return current;
  const baseline = confidenceBaseline(personality);
  const tau = confidenceRecoveryYears(personality);
  return clamp(baseline + (current - baseline) * Math.exp(-years / tau), 1, 100);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
