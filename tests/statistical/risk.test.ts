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
  }
  return {
    winRate: redWins / n,
    koFor: redKos / n,
    koAgainst: redKod / n,
    decisionRate: decisions / n,
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

describe('risk in a fight', () => {
  const reckless = run(0.95, 0.5, 1200, 'rk');
  const careful = run(0.05, 0.5, 1200, 'cf');

  it('finishes more when you sit down on your shots', () => {
    expect(reckless.koFor, JSON.stringify(reckless)).toBeGreaterThan(careful.koFor);
  });

  it('gets you finished more too', () => {
    // The whole point. If this ever inverts, recklessness is free and the slider is a trap.
    expect(reckless.koAgainst, JSON.stringify(reckless)).toBeGreaterThan(careful.koAgainst);
  });

  it('sends fewer fights to the judges', () => {
    expect(reckless.decisionRate, JSON.stringify(reckless)).toBeLessThan(careful.decisionRate);
  });

  it('does not make either extreme the correct answer', () => {
    /*
     * The assertion that matters. Both settings are measured against an identical neutral
     * opponent, so if either produced a materially better win rate it would simply be the
     * right setting and the choice would be fake.
     *
     * The band is wide because 1200 fights is noisy at this resolution; it is tight enough to
     * catch a dial that hands over a decisive edge.
     */
    expect(Math.abs(reckless.winRate - careful.winRate), `reckless ${JSON.stringify(reckless)} careful ${JSON.stringify(careful)}`).toBeLessThan(0.08);
  });
});
