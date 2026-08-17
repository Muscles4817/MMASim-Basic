/**
 * `riskLevel` has to be a decision, not a difficulty setting.
 *
 * The field sat on `GamePlan` from the start, hardcoded to 0.5 by both the camp screen and
 * the AI, and read exactly zero times by the simulator. A dial the player cannot turn and the
 * fight does not read is worse than no dial: it advertises a choice that is not being made.
 *
 * These assert the property that makes it worth having — that neither extreme wins. If
 * recklessness simply won, everybody would set it to 1 and the slider would be a tax on
 * players who did not notice.
 */

import { describe, expect, it } from 'vitest';
import { ARCHETYPES, defaultGamePlan, riskProfile, simulateFight, type Fighter } from '@mmasim/engine';

function run(redRisk: number, blueRisk: number, n = 1200, tag = 'r') {
  let redWins = 0;
  let redKos = 0;
  let redKod = 0;
  let decisions = 0;
  let kdSuffered = 0;
  for (let i = 0; i < n; i++) {
    const red = ARCHETYPES.journeyman() as Fighter;
    const blue = ARCHETYPES.journeyman2() as Fighter;
    const result = simulateFight({
      boutId: `${tag}${i}`,
      seed: `${tag}_${redRisk}_${blueRisk}_${i}`,
      red: { fighter: red, plan: { ...defaultGamePlan(), riskLevel: redRisk } },
      blue: { fighter: blue, plan: { ...defaultGamePlan(), riskLevel: blueRisk } },
    });
    const finish = result.method === 'ko' || result.method === 'tko';
    if (result.winnerId === red.id) {
      redWins++;
      if (finish) redKos++;
    } else if (result.winnerId === blue.id && finish) redKod++;
    if (result.method.startsWith('decision')) decisions++;
    kdSuffered += result.damage.red.knockdownsSuffered;
  }
  return {
    winRate: redWins / n,
    koFor: redKos / n,
    koAgainst: redKod / n,
    decisionRate: decisions / n,
    kdSuffered: kdSuffered / n,
  };
}

describe('the risk profile', () => {
  it('is exactly neutral at the default', () => {
    // An unset plan must behave precisely as it did before this existed, or every existing
    // calibration silently moved.
    const p = riskProfile(0.5);
    expect(p.commitment).toBe(1);
    expect(p.exposure).toBe(1);
    expect(p.exertion).toBe(1);
  });

  it('trades in opposite directions', () => {
    const reckless = riskProfile(1);
    const careful = riskProfile(0);
    expect(reckless.commitment).toBeGreaterThan(careful.commitment);
    expect(reckless.exposure).toBeGreaterThan(careful.exposure);
    expect(reckless.exertion).toBeGreaterThan(careful.exertion);
  });
});

/*
 * 4,000 fights per setting, raised from 1,200 by docs/19 phase 2.
 *
 * Not a change of heart about sample sizes — a measurement. The downside of recklessness is a
 * far smaller effect than this file assumed, and 1,200 fights could not resolve it in either
 * direction: measured over 12,000, the reckless fighter is knocked out on 3.98% of fights
 * against the careful fighter's 3.74%, a gap of a quarter of a point that a 1,200-fight sample
 * reported as **0.0342 against 0.0458 — inverted, and passing only because the seeds happened
 * to fall the other way before an unrelated change reseeded them.** Same shape as the
 * broadcast-bias chain in phase 1: the effect was real and the sample could not see it.
 *
 * So the KO-suffered assertion below is stated on **knockdowns** suffered instead, which is the
 * same exposure mechanism counted an order of magnitude more often, and the file costs about
 * eight seconds more than it did.
 */
describe('risk in a fight', () => {
  const reckless = run(0.95, 0.5, 4000, 'rk');
  const careful = run(0.05, 0.5, 4000, 'cf');

  it('finishes more when you sit down on your shots', () => {
    // The one loud effect in the file: 7.0% of fights won by knockout against 1.75%. Four times.
    expect(reckless.koFor, JSON.stringify(reckless)).toBeGreaterThan(careful.koFor);
  });

  it('gets you dropped more too', () => {
    /*
     * The whole point. If this ever inverts, recklessness is free and the slider is a trap.
     *
     * Measured 0.262 knockdowns suffered per fight against 0.246 — a 6% cost against a 300%
     * gain, which is worth saying plainly: **at journeyman level recklessness is close to free
     * on this axis**, and what actually keeps the dial honest is `exertion` and the shorter
     * fights it produces rather than the counters it eats. That is a finding about the risk
     * system rather than about this test, and it belongs to whichever phase owns the
     * volume/referee pair (docs/19 §4 D4), not to a style phase.
     */
    expect(reckless.kdSuffered, JSON.stringify(reckless)).toBeGreaterThan(careful.kdSuffered);
  });

  it('sends fewer fights to the judges', () => {
    // 68.2% against 72.3%.
    expect(reckless.decisionRate, JSON.stringify(reckless)).toBeLessThan(careful.decisionRate);
  });

  it('does not make either extreme the correct answer', () => {
    /*
     * The assertion that matters. Both settings are measured against an identical neutral
     * opponent, so if either produced a materially better win rate it would simply be the
     * right setting and the choice would be fake.
     *
     * Measured 48.9% for the reckless fighter against 43.1% for the careful one — a 5.8-point
     * gap, inside the band but consistently pointing the same way (4.1 points before phase 2,
     * and the difference between those two numbers is about 1.5 standard errors, so treat them
     * as one number rather than as a movement). Recklessness is mildly correct at this level.
     * The band is what catches a dial that hands over a *decisive* edge.
     */
    expect(
      Math.abs(reckless.winRate - careful.winRate),
      `reckless ${JSON.stringify(reckless)} careful ${JSON.stringify(careful)}`,
    ).toBeLessThan(0.08);
  });
});
