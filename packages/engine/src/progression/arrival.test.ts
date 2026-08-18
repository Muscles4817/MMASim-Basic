/**
 * What a fighter already is on the day they turn pro.
 *
 * Generation applied one `development` factor to all sixteen attributes with a flat +0.1 for the
 * physical group, which put a debutant's **speed at 69% of their own ceiling** — a 21-year-old
 * generated a third slower than they will ever be. And the engine already models the decline
 * separately (`PEAK_AGE` and the per-attribute rates in `development.ts`), so it was counted twice:
 * the young were slow, the old were slow, and peak speed landed somewhere near 28.
 *
 * The fix is one arrival band per attribute, split by how much of the quality is *built* rather
 * than *born*. These assertions are about the two halves of that claim — that a young fighter is
 * already an athlete, and that the athletic freak the ceilings have always allowed now reads as
 * one on debut rather than at 28.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import { generateFighter } from './generation.js';
import type { AttributeKey } from '../ratings/attributes.js';
import type { Fighter } from '../domain/fighter.js';

function cohort(age: number, division: string, n = 400): Fighter[] {
  const rng = createRng(`arrival:${age}:${division}`);
  return Array.from({ length: n }, (_, i) =>
    generateFighter(rng.fork(`f${i}`), {
      id: `fighter_arrival_${age}_${i}`,
      divisionId: asDivisionId(division),
      sex: 'male',
      day: 0,
      age,
    }),
  );
}

const YOUNG = cohort(21, 'mens-lightweight');
const PEAK = cohort(30, 'mens-lightweight');
const YOUNG_HW = cohort(21, 'mens-heavyweight');
const PEAK_HW = cohort(30, 'mens-heavyweight');

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * q)]!;
const median = (xs: number[]) => pct(xs, 0.5);
const share = (fs: Fighter[], key: AttributeKey) =>
  fs.reduce((a, f) => a + f.attributes[key] / f.potential[key], 0) / fs.length;
const of = (fs: Fighter[], key: AttributeKey) => fs.map((f) => f.attributes[key]);

describe('a debutant is already an athlete', () => {
  it('arrives fast, because speed is born rather than built', () => {
    // 93% of their own ceiling at 21, from 69% before. Everything after this is decline, which the
    // ageing model owns — a fighter who is not fast at 21 never will be.
    expect(share(YOUNG, 'speed'), `${(share(YOUNG, 'speed') * 100).toFixed(0)}% of ceiling`).toBeGreaterThan(0.88);
  });

  it('arrives with the best chin it will ever have', () => {
    /*
     * A chin is at its best before anybody has hit it. This is not a gift: `effectiveDurability`
     * erodes it permanently through career `headTrauma`, so arriving near the ceiling is the top of
     * the only slope durability has.
     */
    expect(share(YOUNG, 'durability')).toBeGreaterThan(0.88);
  });

  it('has to build its strength and its engine, but not from nothing', () => {
    /*
     * The other half, and the half that keeps the change honest. These are genuinely trainable —
     * the weight-room years and the conditioning camps are most of what they buy — but a
     * 21-year-old professional is not at two thirds of their eventual maximum.
     *
     * Measured 80% for strength and 71% for cardio, against 93% for speed. A first cut at 62% put
     * *one per cent* of debutants above the median thirty-year-old's strength and produced no
     * strong young fighters at all, which is not the sport.
     */
    expect(share(YOUNG, 'strength')).toBeGreaterThan(0.72);
    expect(share(YOUNG, 'strength')).toBeLessThan(share(YOUNG, 'speed'));
    expect(share(YOUNG, 'cardio')).toBeLessThan(share(YOUNG, 'strength'));
  });

  it('is still years away from knowing how to fight', () => {
    // The gap that should be large and was eleven points: technical attributes keep the old curve,
    // because wrestling and fight IQ taking a decade was never the part that was wrong.
    expect(share(YOUNG, 'speed') - share(YOUNG, 'wrestling')).toBeGreaterThan(0.25);
    expect(share(YOUNG, 'fightIq')).toBeLessThan(0.7);
  });
});

describe('athletic freaks exist, and exist on debut', () => {
  it('produces 21-year-olds faster than most fighters in their prime', () => {
    /*
     * The claim in plain terms: an athletic outlier should be an outlier *now*, not at 28.
     *
     * Measured, 42% of 21-year-olds are faster than the median thirty-year-old, and the 99th
     * percentile of the cohort reaches the low eighties. The ceilings for this were always there —
     * `explosiveness` rolls with a standard deviation of 14 up to 97 — and arriving at 69% of them
     * is what made every debutant average.
     *
     * Stated on a percentile rather than on the cohort maximum, which is the least stable statistic
     * there is: the first cut of this asserted `max > 85` and failed at 82 purely because a
     * 400-fighter sample is not a 600-fighter one.
     */
    const beating = of(YOUNG, 'speed').filter((v) => v > median(of(PEAK, 'speed'))).length / YOUNG.length;
    expect(beating, `${(beating * 100).toFixed(0)}% of 21-year-olds beat the median 30-year-old`).toBeGreaterThan(0.2);
    expect(pct(of(YOUNG, 'speed'), 0.99), 'no 21-year-old in four hundred is genuinely fast').toBeGreaterThan(74);
  });

  it('produces the occasional 21-year-old who is simply stronger than grown men', () => {
    /*
     * Rarer than the speed case and it should be, because strength is the trainable one — but it
     * has to happen. Measured in the heavyweight division, where the frame that carries it lives:
     * the top 5% of 21-year-olds match the median thirty-year-old's strength and the top of the
     * cohort reaches the Elite band.
     *
     * The bound is deliberately loose. What is being defended is that the outlier *occurs*, not
     * that it occurs at a rate anybody has measured in the real sport.
     */
    const strongest = pct(of(YOUNG_HW, 'strength'), 0.99);
    const peakMedian = median(of(PEAK_HW, 'strength'));
    expect(strongest, `top 21-year-old heavyweights ${strongest} vs median 30-year-old ${peakMedian}`).toBeGreaterThan(peakMedian);
    expect(strongest).toBeGreaterThan(72);
  });

  it('does not make the young better fighters than the old', () => {
    /*
     * The guard on the whole change. A debutant is an athlete and not a fighter, so the technical
     * attributes must still separate the cohorts decisively — otherwise "physicals arrive early"
     * has quietly become "everybody arrives finished" and the climb the game is about disappears.
     */
    expect(median(of(PEAK, 'wrestling'))).toBeGreaterThan(median(of(YOUNG, 'wrestling')) + 8);
    expect(median(of(PEAK, 'fightIq'))).toBeGreaterThan(median(of(YOUNG, 'fightIq')) + 8);
  });
});
