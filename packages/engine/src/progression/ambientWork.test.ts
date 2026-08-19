/**
 * The training a fighter does when nobody is looking.
 *
 * A professional between bouts is in a gym, and `world.ts` has modelled that since the undercard
 * was found to be declining permanently. What it could not model was *how much*: the ambient block
 * was priced by `trainingBlocks`, which describes a **camp** — two weeks of ramp that produce
 * nothing, then diminishing returns as a single peak is approached — and it was handed out once
 * per call rather than per elapsed week.
 *
 * Both halves of that are wrong for continuous work, and together they made the fighter you get
 * out depend on how the caller chopped up the clock: measured across the callers that actually
 * exist, 15.5 blocks a year at a fortnight a step against 0.59 at a year a step. The player chose
 * it without knowing, because a four-week training block advances the world in four-week steps.
 */

import { describe, expect, it } from 'vitest';
import { makeFighter } from '../testing/fixtures.js';
import { AMBIENT_BLOCKS_PER_WEEK, forecastTraining, trainingBlocks } from './development.js';

const fighter = makeFighter({ age: 25 });
const ambient = (weeks: number) =>
  forecastTraining({
    fighter,
    focuses: ['wrestling'],
    weeks: 4,
    blocks: weeks * AMBIENT_BLOCKS_PER_WEEK,
    day: 0,
  }).totalExpected;

describe('ordinary work is not a camp', () => {
  it('has no dead ramp, because nobody warms up for a fortnight every fortnight', () => {
    /*
     * `trainingBlocks` charges two weeks of nothing before a camp produces anything, which is
     * true of a camp and absurd of continuous work. Priced that way, a caller stepping a
     * fortnight at a time trained the entire world for exactly zero.
     */
    expect(trainingBlocks(2)).toBe(0);
    expect(ambient(2)).toBeGreaterThan(0);
  });

  it('does not compound its own diminishing returns', () => {
    // A camp approaches one peak and slows; a year of ordinary work does not have a peak.
    expect(trainingBlocks(52) / trainingBlocks(26)).toBeLessThan(2);
    expect(ambient(52) / ambient(26)).toBeCloseTo(2, 1);
  });
});

describe('the same elapsed time gives the same fighter', () => {
  it('prices a year identically however the caller chops it up', () => {
    /*
     * The property the whole change exists for. Blocks accumulated per elapsed week add, so the
     * world no longer depends on whether the player trains in four-week or twelve-week blocks.
     *
     * Compared as a ratio rather than exactly, because `forecastTraining` reports each attribute
     * to two decimals: at one-week steps a single attribute's gain is a few hundredths, and
     * multiplying that rounding by fifty-two is what the residual is. The underlying arithmetic is
     * exactly linear — the coarser steps below show it converging.
     */
    const oneGo = ambient(52);
    for (const step of [1, 2, 4, 8, 13, 26]) {
      const stepped = (52 / step) * ambient(step);
      expect(Math.abs(stepped / oneGo - 1), `${step}-week steps`).toBeLessThan(0.06);
    }
    // Away from the rounding floor it is exact to the reported precision.
    for (const step of [13, 26]) {
      expect((52 / step) * ambient(step), `${step}-week steps`).toBeCloseTo(oneGo, 1);
    }
  });

  it('is linear in elapsed weeks, which is what makes that true', () => {
    expect(ambient(20) / ambient(10)).toBeCloseTo(2, 1);
    expect(ambient(40) / ambient(10)).toBeCloseTo(4, 1);
  });

  it('gives nothing for no time at all', () => {
    expect(ambient(0)).toBe(0);
  });
});

describe('and it is worth less than a camp', () => {
  it('rates a week of ordinary work below a week of fight camp', () => {
    // Otherwise nobody would ever need a camp, which is not the sport.
    const campPerWeek = trainingBlocks(8) / 8;
    expect(AMBIENT_BLOCKS_PER_WEEK).toBeLessThan(campPerWeek);
    expect(AMBIENT_BLOCKS_PER_WEEK).toBeGreaterThan(campPerWeek * 0.4);
  });
});
