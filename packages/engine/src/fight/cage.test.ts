import { describe, expect, it } from 'vitest';
import { makeFighter } from '../testing/fixtures.js';
import { defaultGamePlan } from '../domain/gameplan.js';
import { createCombatant } from './profile.js';
import {
  ON_FENCE,
  centre,
  circleOutChance,
  depthOf,
  fenceClinchEase,
  fenceDefence,
  onFence,
  push,
  type CageState,
} from './cage.js';

const cage = (): CageState => ({ backed: undefined, depth: 0 });

describe('the cage state', () => {
  it('pushes a fighter toward his fence and walks back through the centre the other way', () => {
    const c = cage();
    push(c, 'blue', 0.5);
    push(c, 'blue', 0.4);
    expect(c.backed).toBe('blue');
    expect(depthOf(c, 'blue')).toBeCloseTo(0.9);
    expect(onFence(c, 'blue')).toBe(true);
    expect(depthOf(c, 'red')).toBe(0);
    push(c, 'red', 1.2);
    expect(c.backed).toBe('red');
    expect(depthOf(c, 'red')).toBeCloseTo(0.3);
    centre(c);
    expect(c.backed).toBeUndefined();
  });

  it('charges the fighter on the fence, and only him', () => {
    const c = cage();
    push(c, 'blue', ON_FENCE);
    expect(fenceDefence(c, 'blue')).toBeLessThan(1);
    expect(fenceDefence(c, 'red')).toBe(1);
    expect(fenceClinchEase(c, 'blue')).toBeGreaterThan(1);
  });
});

describe('cutting off the cage', () => {
  it('lets fast, smart feet get off the fence more often than slow ones, and deeper is harder', () => {
    const presser = createCombatant('red', makeFighter({ id: 'fighter_p' }), defaultGamePlan());
    const quick = createCombatant(
      'blue',
      makeFighter({ id: 'fighter_q', attributes: { speed: 90, fightIq: 85 } }),
      defaultGamePlan(),
    );
    const slow = createCombatant(
      'blue',
      makeFighter({ id: 'fighter_s', attributes: { speed: 35, fightIq: 40 } }),
      defaultGamePlan(),
    );
    expect(circleOutChance(quick, presser, 0.8)).toBeGreaterThan(
      circleOutChance(slow, presser, 0.8) * 1.3,
    );
    expect(circleOutChance(quick, presser, 1)).toBeLessThan(circleOutChance(quick, presser, 0.5));
  });
});
