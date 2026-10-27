/**
 * Do careers have a shape? Doc 34 C5.
 *
 * A generated world arrived as one cohort that had aged together: 7 of 844 fighters aged 23 or
 * under, against 141 of 858 in the hand-authored world. Every fighter's chin and body were those of
 * somebody who had never been hit, whatever their record, and fighters with four knockout losses
 * had a median head trauma of 13.7 out of 100. Every prospect of a given age developed in lockstep
 * with every other one. These assertions hold the shape that replaced that:
 *
 *  - a young end to the population;
 *  - head trauma that follows knockout losses;
 *  - an age curve with a peak: the young improve and the old decline;
 *  - a trend read that ranks who will improve;
 *  - no trait the ratings contradict.
 */

import { describe, expect, it } from 'vitest';
import { getWorld } from '@mmasim/data';
import {
  ELITE_LIFT,
  TRAITS,
  careerSummary,
  developmentTrend,
  fighterAge,
  overallRating,
  traitContradicts,
  type Fighter,
} from '@mmasim/engine';
import { generateWorld } from '../../packages/app/src/game/newWorld';
import { advanceWorld } from '../../packages/app/src/game/world';

const YEAR = 365;

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? NaN;
};
const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('a generated world’s careers', () => {
  it('arrive with a shape, and keep one', async () => {
    const db = await generateWorld({
      size: 'small',
      seed: 'careers-long-sim',
      yieldToUi: async () => {},
    });
    const day = getWorld(db).day;
    const active = () =>
      (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
    const start = active();
    const age = (f: Fighter) => fighterAge(f, day);

    // A young end. The hand-authored world holds 16% at 23 or under; this was under 1%.
    const young = start.filter((f) => age(f) <= 23).length / start.length;
    expect(young, 'share of the sport aged 23 or under').toBeGreaterThan(0.05);

    // A chin that remembers. Each knockout loss costs, at arrival as in play.
    const traumaWith = (n: number) =>
      median(
        start
          .filter((f) => {
            const k = careerSummary(f).koLosses;
            return n >= 3 ? k >= 3 : k === n;
          })
          .map((f) => f.condition.headTrauma),
      );
    expect(traumaWith(1)).toBeGreaterThan(traumaWith(0));
    expect(traumaWith(2)).toBeGreaterThan(traumaWith(1));
    expect(traumaWith(3)).toBeGreaterThan(traumaWith(0) * 2.5);

    const context = (f: Fighter) => ({
      divisionId: f.divisionId as string,
      sex: f.sex,
      eliteLift: ELITE_LIFT,
    });
    const contradicted = (fs: readonly Fighter[]) =>
      fs.filter((f) => f.traits.some((t) => traitContradicts(TRAITS[t], f.attributes, context(f))))
        .length;
    expect(contradicted(start), 'traits the ratings contradict, at arrival').toBe(0);

    const before = new Map(start.map((f) => [f.id as string, overallRating(f.attributes)]));
    const trend = new Map(start.map((f) => [f.id as string, developmentTrend(f, day).id]));
    const change = (fs: readonly Fighter[]) =>
      fs
        .filter((f) => before.has(f.id as string))
        .map((f) => overallRating(f.attributes) - before.get(f.id as string)!);

    // One year: does the trend read rank who improves?
    advanceWorld(db, day, day + YEAR, {});
    const afterYear = active();
    const byTrend = (ids: readonly string[]) =>
      mean(change(afterYear.filter((f) => ids.includes(trend.get(f.id as string) ?? ''))));
    // Each read on its own: fast ahead of steady, steady ahead of flat, flat ahead of slipping.
    const fast = byTrend(['improvingFast']);
    const rising = byTrend(['improving']);
    const flat = byTrend(['plateaued']);
    const slipping = byTrend(['slipping']);
    expect(fast, 'improving fast vs still improving').toBeGreaterThan(rising);
    expect(rising, 'still improving vs plateaued').toBeGreaterThan(flat);
    expect(flat, 'plateaued vs slipping').toBeGreaterThan(slipping);

    // Three years: an age curve with a peak.
    advanceWorld(db, day + YEAR, day + 3 * YEAR, {});
    const after = active();
    const band = (lo: number, hi: number) =>
      median(change(after.filter((f) => age(f) >= lo && age(f) <= hi)));
    expect(band(18, 23), 'the young improve fastest').toBeGreaterThan(band(24, 27));
    expect(band(24, 27)).toBeGreaterThan(band(28, 31));
    expect(band(28, 31)).toBeGreaterThan(band(32, 35));
    expect(band(18, 23)).toBeGreaterThan(1);
    expect(band(32, 50), 'past the peak, they decline').toBeLessThan(0);

    expect(contradicted(after), 'traits the ratings contradict, three years on').toBe(0);
  }, 900_000);
});
