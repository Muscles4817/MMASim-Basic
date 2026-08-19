/**
 * Is there enough talent in the world for talent to be wasted?
 *
 * The sport's stories about potential — the prospect who never trained, the knee that went, the
 * three losses that took the belief — all need somebody to happen *to*. The model has every one of
 * those mechanisms and, until this, nothing for them to act on: `generateNaturals` mapped even a
 * perfect tier to naturals centred on 78, and since ceilings are derived from naturals, 1.5% of
 * debutants could ever reach an overall rating of 80 and 0.2% could reach 85. The top of the sport
 * never changed because there was nothing coming up behind it.
 *
 * These are assertions about the *shape* of the distribution, not about outcomes. Most people who
 * turn professional are ordinary and should stay ordinary; what has to exist is a real tail.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import { overallRating } from '../ratings/attributes.js';
import { generateFighter } from './generation.js';

/**
 * The intake exactly as `world.ts:replenish` rolls it: roughly one in twelve is drawn from a much
 * higher band, and everybody else takes the default.
 */
function intake(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const rng = createRng(`talent:${i}`);
    const tier = rng.chance(0.085) ? Math.round(rng.normalClamped(78, 9, 62, 97)) : undefined;
    const f = generateFighter(rng, {
      id: `f${i}`,
      divisionId: asDivisionId('mens-lightweight'),
      sex: 'male',
      day: 0,
      tier,
    });
    return overallRating(f.potential);
  }).sort((a, b) => a - b);
}

const POOL = intake(8000);
const pct = (p: number) => POOL[Math.min(POOL.length - 1, Math.floor(p * (POOL.length - 1)))]!;
const share = (floor: number) => POOL.filter((x) => x >= floor).length / POOL.length;

describe('most people who turn professional are ordinary', () => {
  it('keeps the median debutant where it has always been', () => {
    /*
     * The half of this that is easy to get wrong. Raising the ceiling for the gifted by remapping
     * tier linearly to a higher top lifts the *whole* distribution with it — measured, a linear map
     * to 97 moved the median from 57 to 65 and made a third of all debutants capable of reaching
     * 70. The curve exists so that the new headroom is spent entirely on the tail.
     */
    expect(pct(0.5)).toBeGreaterThan(52);
    expect(pct(0.5)).toBeLessThan(63);
  });

  it('leaves most of the intake unable to reach the top of the sport', () => {
    // Four in five debutants should have no business being ranked, ever.
    expect(share(70)).toBeLessThan(0.3);
  });
});

describe('and a few of them are not', () => {
  it('produces enough elite ceilings for a golden generation to be possible', () => {
    /*
     * Possible, not likely. At roughly 45 debutants a year this is about two fighters a year born
     * with the ceiling to be genuinely elite — most of whom will never get near it.
     */
    expect(share(80)).toBeGreaterThan(0.03);
    expect(share(85)).toBeGreaterThan(0.008);
  });

  it('does not hand it out, either', () => {
    // A world where a twentieth of debutants are future champions is not a sport.
    expect(share(85)).toBeLessThan(0.05);
    expect(share(90)).toBeLessThan(0.01);
  });

  it('can produce a ceiling at the very top of the scale at all', () => {
    // The old mapping could not: naturals centred on 78 put this permanently out of reach.
    expect(pct(0.999)).toBeGreaterThan(88);
  });
});
