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
 *
 * The quantity is a **fighting** ceiling — the ten technical and mental attributes — rather than a
 * flat mean over all fifteen. See `FIGHTING_KEYS` below for why that changed at doc 31 § 12 step 3
 * and why it makes every bound here stricter rather than looser.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import { ATTRIBUTES_BY_GROUP, overallRating } from '../ratings/attributes.js';
import { generateFighter } from './generation.js';

/**
 * The ten attributes a career is actually spent building.
 *
 * **This file measured `overallRating(potential)` until doc 31 § 12 step 3**, and that is a flat mean
 * over all fifteen — including the five physicals, which sit on an absolute scale. Two things were
 * wrong with it, and splitting the talent axes made the second one bite.
 *
 * A flat mean is division-biased by construction: on an absolute physical scale a heavyweight's
 * Power and Strength are genuinely higher numbers than a flyweight's, so the same fighting talent
 * reads about two points of overall higher at heavyweight (doc 31 § 7.1). And once athletic talent
 * stopped being a function of competitive tier, an elite *fighter* no longer came with an elite
 * *body* attached — so "share of debutants above 85 overall" fell from 1.5% to 0.75%, not because
 * the sport ran out of talent but because the measurement was counting genetics as talent.
 *
 * Measured the same day over the same 8,000: **2.5% carry a technical ceiling of 85 or better**
 * against 0.75% by the flat mean. The elite are there; the lens was wrong. Every bound below is the
 * one this file already asserted, re-pointed at the thing it was always about.
 */
const FIGHTING: readonly (keyof typeof ATTRIBUTES_BY_GROUP)[] = ['striking', 'grappling', 'mental'];
const FIGHTING_KEYS = FIGHTING.flatMap((group) => ATTRIBUTES_BY_GROUP[group]);

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
    return FIGHTING_KEYS.reduce((sum, key) => sum + f.potential[key], 0) / FIGHTING_KEYS.length;
  }).sort((a, b) => a - b);
}

/** The old flat-mean reading, kept only so the two can be compared when a bound moves. */
function flatOveralls(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const rng = createRng(`talent:${i}`);
    const tier = rng.chance(0.085) ? Math.round(rng.normalClamped(78, 9, 62, 97)) : undefined;
    return overallRating(
      generateFighter(rng, {
        id: `f${i}`,
        divisionId: asDivisionId('mens-lightweight'),
        sex: 'male',
        day: 0,
        tier,
      }).potential,
    );
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

describe('the two readings, so a moved bound can be attributed', () => {
  it('reports fighting potential against the flat fifteen-attribute mean', () => {
    const flat = flatOveralls(8000);
    const at = (xs: number[], p: number) =>
      xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1)))]!;
    const above = (xs: number[], floor: number) => xs.filter((x) => x >= floor).length / xs.length;
    const row = (label: string, xs: number[]) =>
      `${label.padEnd(10)} p50 ${at(xs, 0.5).toFixed(1)}  p999 ${at(xs, 0.999).toFixed(1)}` +
      `  >=70 ${(100 * above(xs, 70)).toFixed(1)}%  >=80 ${(100 * above(xs, 80)).toFixed(2)}%` +
      `  >=85 ${(100 * above(xs, 85)).toFixed(2)}%  >=90 ${(100 * above(xs, 90)).toFixed(2)}%`;
    console.log('\n' + row('fighting', POOL));
    console.log(row('flat mean', flat));
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
