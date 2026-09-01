/**
 * The calibration fixture set can separate the constants a refit has to fit.
 *
 * D22 established that `round.ts`'s constants are a mutually-compensating set, and that the
 * reason is the fixtures: each constant was fitted against the same six near-symmetric matchups
 * with the others' errors already in place. Two attempts to correct one constant at a time — the
 * control-split sign error (D21) and the hurt window (D12) — were proven right in isolation and
 * still broke parity bounds, because moving one member of a compensating set exposes what it was
 * cancelling.
 *
 * `testing/calibration.ts` is the fixture set built to break that. This file is what stops it
 * quietly stopping working. A fixture set is not a constant: nothing about it fails loudly when
 * the engine changes underneath it. Add a mechanic that couples finishes to output and this set
 * silently becomes as confounded as the six it replaced, and the next refit against it produces
 * another compensating set — with no symptom until someone measures a matchup off the fixtures,
 * which is exactly how the current situation arose.
 *
 * ## What is being asserted
 *
 * The constants are rates, not totals:
 *
 * | rate         | what it prices                       |
 * | ------------ | ------------------------------------ |
 * | `volume`     | significant strikes landed per round |
 * | `control`    | share of the round spent in control  |
 * | `hazard`     | knockdowns per landed strike         |
 * | `conversion` | strike finishes per knockdown        |
 *
 * Two claims, and both are needed. **Span**: each rate has to vary across the set, or the
 * constant pricing it is unobservable and the fit is free to put anything there. **Independence**:
 * the rates have to vary separately, or two constants are indistinguishable and a fit will place
 * a compensating pair — `hazard` and `conversion` multiply into the same observable, so this is
 * not a theoretical concern about them.
 *
 * The third test is the falsifier, and it is the one that gives the other two meaning: the
 * *current* six must still measure as confounded. Without it, a change that made every fixture
 * set look independent — a bug in the metric, a floor swallowing the variation — would leave the
 * first two tests passing while they measured nothing.
 *
 * ## Why the fight count is high
 *
 * 600 per matchup, which is dear for a statistical test, because the failure mode here is
 * one-directional: noise *dilutes* a correlation. The current six read |r| 0.67 at 250 fights and
 * 0.83 at 600. A cheap measurement does not make this test flaky, it makes it pass — it would
 * report a confounded set as a clean one. Measured across three disjoint blocks of fights at 600,
 * the current six give 0.83 / 0.83 / 0.85 and the calibration set 0.53 / 0.54 / 0.63.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  CALIBRATION_LEVERS,
  CALIBRATION_MATCHUPS,
  calibrationFighter,
  makeFighter,
  planFor,
  simulateFight,
  type CalibrationFighter,
  type Fighter,
} from '@mmasim/engine';

const FIGHTS = 600;
const ROUND_SECONDS = 300;

const RATES = ['volume', 'control', 'hazard', 'conversion'] as const;
type Rate = (typeof RATES)[number];

/**
 * Domain floors, fixed rather than derived from the data being measured.
 *
 * The first version of the tool behind this took each floor as a fraction of the median of
 * whatever rows it had been handed, which made the metric move with its own input — the same set
 * scored 0.61 against one comparison and 0.69 against another with nothing about the set changed.
 * A number that depends on what you compare it to cannot be asserted. Each of these instead says
 * "below this a difference is not observable at any sample size this repo runs", so it must not
 * be allowed to become a large distance in log space.
 *
 * Kept in step with `RATE_FLOOR` in `tools/fixture-coverage.ts`, which is how these numbers are
 * reproduced outside the suite.
 */
const RATE_FLOOR: Readonly<Record<Rate, number>> = {
  volume: 0.05,
  control: 0.005,
  hazard: 0.001,
  conversion: 0.02,
};

/** A corner that never knocked anyone down has no measurable conversion; the floor is one in twenty. */
const KD_FLOOR = 0.05;

interface CornerRates extends Record<Rate, number> {
  pair: string;
}

function measure(pair: string, makeRed: () => Fighter, makeBlue: () => Fighter): CornerRates[] {
  const blank = () => ({ kd: 0, landed: 0, control: 0, strikeFin: 0 });
  const acc = { red: blank(), blue: blank() };
  let rounds = 0;
  for (let i = 0; i < FIGHTS; i++) {
    const red = makeRed();
    const blue = makeBlue();
    const seed = `cov:a:${pair}:${i}`;
    const f = simulateFight({
      boutId: seed,
      seed,
      rounds: 3,
      red: { fighter: red, plan: planFor(red, blue) },
      blue: { fighter: blue, plan: planFor(blue, red) },
    });
    for (const c of ['red', 'blue'] as const) {
      acc[c].kd += f.stats[c].knockdowns;
      acc[c].landed += f.stats[c].significantStrikesLanded;
      acc[c].control += f.stats[c].controlSeconds;
    }
    rounds += f.round;
    const winner = f.winnerId === undefined ? undefined : f.winnerId === red.id ? 'red' : 'blue';
    if (
      winner !== undefined &&
      (f.method === 'ko' || f.method === 'tko' || f.method === 'doctorStoppage')
    )
      acc[winner].strikeFin += 1;
  }
  return (['red', 'blue'] as const).map((c) => ({
    pair,
    volume: acc[c].landed / rounds,
    control: acc[c].control / rounds / ROUND_SECONDS,
    hazard: acc[c].kd / Math.max(acc[c].landed, 1),
    conversion: acc[c].strikeFin / FIGHTS / (acc[c].kd / FIGHTS + KD_FLOOR),
  }));
}

/** Log space: the constants are multiplicative, so a doubling is one step wherever it happens. */
const lg = (r: CornerRates, k: Rate) => Math.log(r[k] + RATE_FLOOR[k]);

const spread = (rows: CornerRates[], k: Rate) =>
  Math.exp(Math.max(...rows.map((r) => lg(r, k))) - Math.min(...rows.map((r) => lg(r, k))));

const corr = (a: number[], b: number[]) => {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i]! - mb), 0);
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0);
  return va <= 0 || vb <= 0 ? 0 : cov / Math.sqrt(va * vb);
};

function worstPair(rows: CornerRates[]): { a: Rate; b: Rate; r: number } {
  let worst = { a: RATES[0], b: RATES[1], r: 0 } as { a: Rate; b: Rate; r: number };
  for (let i = 0; i < RATES.length; i++)
    for (let j = i + 1; j < RATES.length; j++) {
      const r = corr(
        rows.map((x) => lg(x, RATES[i]!)),
        rows.map((x) => lg(x, RATES[j]!)),
      );
      if (Math.abs(r) > Math.abs(worst.r)) worst = { a: RATES[i]!, b: RATES[j]!, r };
    }
  return worst;
}

const calibrationRows = CALIBRATION_MATCHUPS.flatMap(([a, b]) =>
  measure(
    `${a}-v-${b}`,
    () => calibrationFighter(a),
    () => calibrationFighter(b),
  ),
);

/**
 * The set the parity suites currently calibrate and assert against — the compensating set D22
 * named. Kept here so the falsifier compares like with like on the same metric and fight count.
 */
const CURRENT: [string, () => Fighter, () => Fighter][] = [
  [
    'even',
    () => makeFighter({ id: 'fighter_a', lastName: 'A' }),
    () => makeFighter({ id: 'fighter_b', lastName: 'B' }),
  ],
  ['striker-v-grinder', ARCHETYPES.striker, ARCHETYPES.grinder],
  ['bomber-v-journeyman', ARCHETYPES.bomber, ARCHETYPES.journeyman],
  ['contender-v-canFodder', ARCHETYPES.contender, ARCHETYPES.canFodder],
  ['guardPlayer-v-smotherer', ARCHETYPES.guardPlayer, ARCHETYPES.smotherer],
  ['smotherer-v-striker', ARCHETYPES.smotherer, ARCHETYPES.striker],
];

describe('calibration fixtures span the rates a refit has to fit', () => {
  /**
   * Declared as a floor rather than a range because a *wider* span is never a regression — it is
   * the direction the set is trying to go. The numbers are the measurement at seed block `a`
   * rounded down hard, so a real narrowing trips this long before the set becomes unusable.
   */
  const DECLARED_SPREAD: Readonly<Record<Rate, number>> = {
    volume: 20, // measured 35.3x
    control: 15, // measured 23.9x, and 20.1x on the worst of three fight blocks
    hazard: 60, // measured 159.1x
    conversion: 20, // measured 43.8x
  };

  it.each(RATES)('%s varies across the set', (rate) => {
    const measured = spread(calibrationRows, rate);
    expect(
      measured,
      `${rate} spans only ${measured.toFixed(1)}x across the calibration set: a constant priced ` +
        `on it is unobservable over that range, and a fit is free to put anything there`,
    ).toBeGreaterThan(DECLARED_SPREAD[rate]);
  });

  /**
   * Compared as a fraction of the incumbent's *log* span, which is the space the constants live
   * in — 85% of its decades, not 85% of its ratio. The two are very different criteria (24x
   * against an incumbent 32x is 74% of the ratio and 92% of the log span), and having the
   * selection tool use one while this test used the other meant the tool proposed sets this
   * rejected. `tools/fixture-coverage.ts` now uses the same criterion at a stricter 0.9, so a
   * proposal arrives with headroom against this bound rather than sitting on it.
   *
   * A margin at all, rather than a straight `>=`, because the incumbent's control span comes from
   * pairing its one extreme matchup against a different matchup's near-zero corner. Chasing that
   * exact number would contort the whole set for one rate — and control is the only rate where
   * the six are ahead. On the two that carry the confound they are far behind: conversion 20x
   * against 44x, hazard 47x against 159x.
   */
  const INCUMBENT_MARGIN = 0.85;

  it('spans every rate about as widely as the current parity set does', () => {
    const currentRows = CURRENT.flatMap(([n, r, b]) => measure(n, r, b));
    const narrower = RATES.filter(
      (k) =>
        Math.log(spread(calibrationRows, k)) < Math.log(spread(currentRows, k)) * INCUMBENT_MARGIN,
    );
    expect(
      narrower,
      `the calibration set sees less of ${narrower.join(', ')} than the six it is meant to improve ` +
        `on: ${narrower.map((k) => `${k} ${spread(calibrationRows, k).toFixed(1)}x vs ${spread(currentRows, k).toFixed(1)}x`).join('; ')}`,
    ).toEqual([]);
  });
});

describe('calibration fixtures vary the rates independently', () => {
  /**
   * 0.70, against a measurement of 0.53 / 0.54 / 0.63 over three disjoint blocks of fights.
   *
   * Not tighter, because the set is not the argmax of anything stable: the score surface over
   * candidate sets is flat, two selection runs at different fight counts agreed on only 4 of 10
   * matchups, and asserting near the measurement would be asserting on which near-optimal set
   * happened to win. Not looser, because 0.75 is where the current six already sit.
   */
  const CONFOUNDED = 0.7;

  it('keeps every pair of rates below the confounding bound', () => {
    const { a, b, r } = worstPair(calibrationRows);
    expect(
      Math.abs(r),
      `${a} and ${b} correlate at r = ${r.toFixed(2)} across the calibration set. A fit cannot ` +
        `tell an error in one from the opposite error in the other, so it will place a ` +
        `compensating pair — which is the defect this set exists to remove, not to reproduce`,
    ).toBeLessThan(CONFOUNDED);
  });

  /**
   * The falsifier.
   *
   * Everything above is a claim that a number stayed small. That is only worth something if the
   * number is capable of being large — and the honest way to show it is to point the same metric
   * at the set that is known to be confounded and watch it say so. If this ever fails, the two
   * tests above have stopped measuring anything and should not be trusted, whatever they report.
   */
  it('still reports the current parity set as confounded', () => {
    const { a, b, r } = worstPair(CURRENT.flatMap(([n, red, blue]) => measure(n, red, blue)));
    expect(
      Math.abs(r),
      `the current six now measure as independent (worst pair ${a} vs ${b}, r = ${r.toFixed(2)}). ` +
        `Either the engine changed so that they no longer compensate — in which case D22 needs ` +
        `revisiting — or this metric has stopped working and the assertions above mean nothing`,
    ).toBeGreaterThan(0.75);
  });
});

describe('the calibration set stays a set', () => {
  it('draws every matchup from the pool', () => {
    const names = new Set(Object.keys(CALIBRATION_LEVERS));
    const used = CALIBRATION_MATCHUPS.flat() as CalibrationFighter[];
    expect(used.filter((n) => !names.has(n))).toEqual([]);
  });

  it('has no repeated matchup', () => {
    const keys = CALIBRATION_MATCHUPS.map(([a, b]) => [a, b].sort().join('-v-'));
    expect(new Set(keys).size).toBe(CALIBRATION_MATCHUPS.length);
  });

  it('builds fighters whose attributes are all in range', () => {
    for (const name of Object.keys(CALIBRATION_LEVERS) as CalibrationFighter[]) {
      const f = calibrationFighter(name);
      for (const [attr, value] of Object.entries(f.attributes))
        expect(value, `${name}.${attr} is ${value}`).toBeGreaterThanOrEqual(1);
    }
  });
});
