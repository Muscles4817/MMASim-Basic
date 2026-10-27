/**
 * Career trajectories: breakouts, stalls and a pace of one's own. Doc 34 C5.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { generateFighter } from './generation.js';
import { BREAKOUT_CHANCE, STALL_CHANCE, developmentTrend, trajectoryOf } from './trajectory.js';

const DAY = 365 * 30;

function fighterAged(age: number, i: number, curve?: Fighter['naturals']['ageCurve']): Fighter {
  const f = generateFighter(createRng(`trajectory-test:${i}`), {
    id: `traj_${age}_${i}`,
    divisionId: asDivisionId('mens-lightweight'),
    sex: 'male',
    day: DAY,
    age,
  });
  return curve ? { ...f, naturals: { ...f.naturals, ageCurve: curve } } : f;
}

describe('a trajectory', () => {
  it('moves nobody on average: the mean rate across careers and years is 1', () => {
    let sum = 0;
    let n = 0;
    const phases = { breakout: 0, stalled: 0, steady: 0 };
    for (let i = 0; i < 400; i++) {
      for (let year = 0; year < 10; year++) {
        const t = trajectoryOf(
          { id: `f${i}` as never, birthDay: 0 as never },
          (365 * (20 + year) + 100) as never,
        );
        sum += t.rate;
        n += 1;
        phases[t.phase] += 1;
      }
    }
    expect(sum / n).toBeGreaterThan(0.95);
    expect(sum / n).toBeLessThan(1.05);
    expect(phases.breakout / n).toBeCloseTo(BREAKOUT_CHANCE, 1);
    expect(phases.stalled / n).toBeCloseTo(STALL_CHANCE, 1);
  });

  it('lasts the year, and changes with it', () => {
    const who = { id: 'steady_hand' as never, birthDay: 0 as never };
    const a = trajectoryOf(who, (365 * 24 + 10) as never);
    const b = trajectoryOf(who, (365 * 24 + 300) as never);
    expect(b).toEqual(a);
    // Across fifty careers of twelve years each, every kind of year turns up.
    const kinds = new Set<string>();
    for (let i = 0; i < 50; i++) {
      for (let year = 0; year < 12; year++) {
        kinds.add(
          trajectoryOf(
            { id: `k${i}` as never, birthDay: 0 as never },
            (365 * (20 + year) + 5) as never,
          ).phase,
        );
      }
    }
    expect(kinds.size).toBe(3);
  });
});

describe('the trend a scout reads', () => {
  it('reads the young as improving and the worn veteran as slipping', () => {
    const young = Array.from({ length: 40 }, (_, i) => fighterAged(21, i, 'standard'));
    const old = Array.from({ length: 40 }, (_, i) => fighterAged(37, i, 'standard'));
    const rising = young.filter((f) =>
      ['improving', 'improvingFast'].includes(developmentTrend(f, DAY).id),
    ).length;
    expect(rising).toBeGreaterThan(30);
    expect(old.every((f) => developmentTrend(f, DAY).id === 'slipping')).toBe(true);
  });

  it('marks a young fighter in a breakout year as improving fast', () => {
    for (let i = 0; i < 200; i++) {
      const f = fighterAged(21, i, 'standard');
      if (trajectoryOf(f, DAY).phase !== 'breakout') continue;
      expect(developmentTrend(f, DAY).id).toBe('improvingFast');
      return;
    }
    throw new Error('no breakout year among 200 young fighters');
  });
});
