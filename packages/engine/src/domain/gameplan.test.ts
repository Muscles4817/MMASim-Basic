/**
 * The game plan's two dials, and the invariants that keep them decisions rather than buffs.
 *
 * `riskProfile` has had a statistical test since it landed (tests/statistical/risk.test.ts) and
 * no unit test, which is fine for a question about distributions and not fine for the three
 * structural claims underneath it — neutral is a no-op, the ends are opposites, and an old save
 * that carries neither field behaves exactly as it did. Those are cheap to state here and they
 * are the ones that break silently.
 */

import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_GROUND_INTENT,
  defaultGamePlan,
  normaliseGamePlan,
  phaseProfile,
  riskProfile,
} from './gameplan.js';

describe('phaseProfile', () => {
  it('is a complete no-op at the neutral setting', () => {
    /*
     * The load-bearing one. Every fight the world ran before this axis existed is a fight on a
     * plan with no `groundIntent`, and the whole statistical tier is calibrated against those
     * numbers — so neutral must be exactly 1.0 on every term, not approximately.
     */
    for (const profile of [phaseProfile(NEUTRAL_GROUND_INTENT), phaseProfile(undefined)]) {
      for (const [term, value] of Object.entries(profile)) expect([term, value]).toEqual([term, 1]);
    }
  });

  it('reads a missing value as neutral, so an old booking fights as it always did', () => {
    expect(phaseProfile(undefined)).toEqual(phaseProfile(NEUTRAL_GROUND_INTENT));
  });

  it('buys defence at one end and entries at the other', () => {
    const standing = phaseProfile(0);
    const floor = phaseProfile(1);

    expect(standing.sprawl).toBeGreaterThan(1);
    expect(standing.escape).toBeGreaterThan(1);
    expect(standing.entry).toBeLessThan(1);

    expect(floor.entry).toBeGreaterThan(1);
    expect(floor.sprawl).toBe(1);
    expect(floor.escape).toBe(1);
  });

  it('charges each half for what that half buys, and never for the other', () => {
    const standing = phaseProfile(0);
    const floor = phaseProfile(1);

    // Chasing the takedown costs volume, and only the chasing half pays it: an earlier cut
    // charged the refusing half too, which cancelled exactly the striking fight it was buying.
    expect(floor.output).toBeLessThan(1);
    expect(standing.output).toBe(1);

    // Committing either way leaves you more open to what you are not watching for, and costs
    // more in the tank than fighting whatever turns up.
    expect(standing.exposure).toBeGreaterThan(1);
    expect(floor.exposure).toBeGreaterThan(1);
    expect(standing.exertion).toBeGreaterThan(1);
    expect(floor.exertion).toBeGreaterThan(1);
  });

  it('never charges a defensive fighter for defence they cannot use', () => {
    /*
     * `sprawl` is deliberately one-sided. A wrestler who commits to taking you down is still a
     * wrestler when you shoot back, and an earlier cut that made `sprawl` symmetric took 18% off
     * every world grappler's takedown defence — which flattened the striker/grappler control-time
     * gap the styles programme protects (tests/statistical/styles.test.ts G1) without anybody
     * asking for a rebalance.
     */
    expect(phaseProfile(0.75).sprawl).toBe(1);
    expect(phaseProfile(1).sprawl).toBe(1);
  });

  it('moves monotonically, so the slider means what its position says', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(phaseProfile);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.entry).toBeGreaterThan(steps[i - 1]!.entry);
      expect(steps[i]!.sprawl).toBeLessThanOrEqual(steps[i - 1]!.sprawl);
      expect(steps[i]!.escape).toBeLessThanOrEqual(steps[i - 1]!.escape);
    }
  });

  it('clamps rather than extrapolating off the end of the dial', () => {
    expect(phaseProfile(-3)).toEqual(phaseProfile(0));
    expect(phaseProfile(4)).toEqual(phaseProfile(1));
  });
});

describe('riskProfile', () => {
  it('is a no-op at the neutral setting', () => {
    for (const [term, value] of Object.entries(riskProfile(0.5))) {
      expect([term, value]).toEqual([term, 1]);
    }
  });
});

describe('the plan itself', () => {
  it('ships neutral on both axes', () => {
    const plan = defaultGamePlan();
    expect(plan.riskLevel).toBe(0.5);
    expect(plan.groundIntent).toBe(NEUTRAL_GROUND_INTENT);
  });

  it('normalises a plan that carries no ground intent to the neutral one', () => {
    const plan = normaliseGamePlan({ ...defaultGamePlan(), groundIntent: undefined });
    expect(plan.groundIntent).toBe(NEUTRAL_GROUND_INTENT);
  });

  it('clamps an out-of-range ground intent instead of passing it through', () => {
    expect(normaliseGamePlan({ ...defaultGamePlan(), groundIntent: 9 }).groundIntent).toBe(1);
    expect(normaliseGamePlan({ ...defaultGamePlan(), groundIntent: -9 }).groundIntent).toBe(0);
  });
});
