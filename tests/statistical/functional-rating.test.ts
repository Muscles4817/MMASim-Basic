/**
 * **Does `functionalRating` predict fights better than a flat average does?**
 *
 * Doc 31 § 27. The acceptance criterion the whole module was built under, and the one that could
 * have discarded it: a rating that claims to measure functional ability has to be checkable
 * against the only ground truth the project has — who actually wins — and it has to beat the thing
 * it replaces, *including* a flat average with better weights.
 *
 * Three populations, because they ask three different questions and only the second one is really
 * about shape:
 *
 *  1. **A general population.** Eight divisions of generated fighters, round robin. Tests that
 *     nothing regressed: a new rating that is worse at ordering an ordinary roster is not an
 *     improvement whatever else it can do.
 *  2. **Matched means.** Cohorts in which every fighter has the *same arithmetic average* and
 *     differs only in shape. `overallRating` is very nearly a constant here by construction, so
 *     this is where the claim lives: among fighters a mean cannot distinguish, does this one
 *     predict who wins?
 *  3. **Orthogonal shapes.** One attribute moved ±24 against an even spread of the other
 *     fourteen, so nothing is confounded with anything. This is the diagnostic that measures the
 *     *engine*, and § 27.6 records what it found. The rating only ties here, for a reason worth
 *     writing down rather than tuning away.
 *
 * Every figure in the assertions below was measured before it was asserted, and the bars sit far
 * enough below the measurements to survive simulator noise while still failing on a real
 * regression. Spearman rank correlation throughout, pooled as within-cohort ranks so cohorts of
 * different difficulty are comparable.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  ELITE_LIFT,
  createRng,
  functionalRating,
  generateFighter,
  makeFighter,
  overallRating,
  simulateFight,
  type Attributes,
  type BandContext,
  type Fighter,
} from '@mmasim/engine';

/**
 * Yields to the event loop between opponents.
 *
 * Same reason `roster-profile.test.ts` does it: a worker that never yields cannot answer the
 * reporter's `onTaskUpdate` RPC, which vitest surfaces as an unhandled timeout alongside an
 * otherwise green run. The simulation is a pure function of its seed, so where the yields fall
 * changes nothing measured here.
 */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function ranksOf(values: readonly number[]): number[] {
  const ordered = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  ordered.forEach(([, i], rank) => (out[i] = rank));
  return out;
}

function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = ranksOf(a);
  const rb = ranksOf(b);
  const n = a.length;
  const d2 = ra.reduce((acc, _, i) => acc + (ra[i] - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** Every fighter against every other, `fights` times each, and who won. */
async function roundRobin(label: string, fighters: readonly Fighter[], fights: number) {
  const wins = new Array(fighters.length).fill(0);
  const bouts = new Array(fighters.length).fill(0);
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      for (let k = 0; k < fights; k++) {
        const seed = `${label}:${i}-${j}-${k}`;
        const result = simulateFight({
          boutId: seed,
          seed,
          rounds: 3,
          red: { fighter: fighters[i]! },
          blue: { fighter: fighters[j]! },
        });
        bouts[i]++;
        bouts[j]++;
        if (result.winnerId === fighters[i]!.id) wins[i]++;
        else if (result.winnerId === fighters[j]!.id) wins[j]++;
        else {
          wins[i] += 0.5;
          wins[j] += 0.5;
        }
      }
    }
    await breathe();
  }
  return wins.map((w, i) => w / bouts[i]);
}

interface Comparison {
  functional: number;
  overall: number;
  flatMean: number;
  perCohort: string[];
}

function compare(
  cohorts: readonly {
    winRates: readonly number[];
    attributes: readonly Attributes[];
    context?: BandContext;
  }[],
): Comparison {
  const pooled = { w: [] as number[], f: [] as number[], o: [] as number[], m: [] as number[] };
  const perCohort: string[] = [];
  for (const cohort of cohorts) {
    const f = cohort.attributes.map((a) => functionalRating(a, cohort.context));
    const o = cohort.attributes.map((a) => overallRating(a));
    const m = cohort.attributes.map(
      (a) => ATTRIBUTE_KEYS.reduce((acc, k) => acc + a[k], 0) / ATTRIBUTE_KEYS.length,
    );
    perCohort.push(
      `${spearman(f, cohort.winRates).toFixed(3)}/${spearman(o, cohort.winRates).toFixed(3)}`,
    );
    const rw = ranksOf(cohort.winRates);
    const rf = ranksOf(f);
    const ro = ranksOf(o);
    const rm = ranksOf(m);
    for (let i = 0; i < f.length; i++) {
      pooled.w.push(rw[i]!);
      pooled.f.push(rf[i]!);
      pooled.o.push(ro[i]!);
      pooled.m.push(rm[i]!);
    }
  }
  return {
    functional: spearman(pooled.f, pooled.w),
    overall: spearman(pooled.o, pooled.w),
    flatMean: spearman(pooled.m, pooled.w),
    perCohort,
  };
}

const DIVISIONS: readonly (readonly [string, 'male' | 'female'])[] = [
  ['mens-lightweight', 'male'],
  ['mens-welterweight', 'male'],
  ['mens-heavyweight', 'male'],
  ['mens-flyweight', 'male'],
  ['womens-bantamweight', 'female'],
];

describe('a general population', () => {
  /**
   * **Measured: functional 0.943, overall 0.897, flat unweighted mean 0.892** over these five
   * divisions and 13,000 fights, with functional ahead in all five. A wider sweep over eight
   * divisions and ~34,800 fights gave 0.930 against 0.902, ahead in seven and level in the eighth;
   * this run is the subset that fits the tier's time budget.
   *
   * Note what the baseline says about the thing being replaced: `overallRating`'s fifteen
   * hand-chosen weights predict **exactly as well as not weighting the attributes at all**. The
   * weights were doing nothing, which is its own argument for this change.
   */
  it('orders an ordinary roster at least as well as the flat average it replaces', async () => {
    const cohorts: { winRates: number[]; attributes: Attributes[]; context: BandContext }[] = [];
    for (const [divisionId, sex] of DIVISIONS) {
      const rng = createRng(`functional-general-${divisionId}`);
      const fighters: Fighter[] = [];
      for (let i = 0; i < 26; i++) {
        fighters.push(
          generateFighter(rng.fork(`f${i}`), {
            id: `${divisionId}-${i}`,
            sex,
            divisionId: divisionId as never,
            day: 0 as never,
            nationality: 'USA',
            age: 28,
            tier: 38 + (i % 10) * 6,
          }),
        );
      }
      const winRates = await roundRobin(`gen:${divisionId}`, fighters, 8);
      cohorts.push({
        winRates,
        attributes: fighters.map((f) => f.attributes),
        context: { divisionId, sex, eliteLift: ELITE_LIFT },
      });
    }

    const result = compare(cohorts);
    console.log(
      `general: functional ${result.functional.toFixed(4)}  overall ${result.overall.toFixed(4)}  ` +
        `flat mean ${result.flatMean.toFixed(4)}  per-division(f/o) ${result.perCohort.join(' ')}`,
    );
    expect(result.functional).toBeGreaterThan(result.overall);
    expect(result.functional).toBeGreaterThan(0.9);
  });
});

/**
 * Shapes for the matched-mean cohorts. Each is a set of deviations summing to zero across the
 * fifteen attributes, so applying one to a flat block changes shape and not level.
 *
 * The last three are holes rather than specialities, and they are the cases `overallRating` is
 * worst at: a fighter who is above level everywhere except one ruinous gap.
 */
const SHAPES: Readonly<Record<string, Partial<Record<keyof Attributes, number>>>> = {
  balanced: {},
  longRangeStriker: {
    kicking: 18,
    strikingDefence: 16,
    strikingOffence: 14,
    speed: 12,
    fightIq: 6,
    wrestling: -16,
    groundControl: -14,
    submissions: -12,
    takedownDefence: -10,
    scrambling: -8,
    strength: -6,
  },
  pressureFighter: {
    cardio: 18,
    strength: 12,
    wrestling: 12,
    durability: 12,
    composure: 8,
    groundControl: 6,
    kicking: -16,
    speed: -14,
    strikingDefence: -12,
    power: -10,
    submissions: -10,
    fightIq: -6,
  },
  topWrestler: {
    wrestling: 20,
    groundControl: 18,
    takedownDefence: 14,
    strength: 10,
    cardio: 8,
    kicking: -18,
    strikingOffence: -12,
    strikingDefence: -12,
    speed: -10,
    power: -10,
    submissions: -8,
  },
  submissionThreat: {
    submissions: 22,
    scrambling: 18,
    groundControl: 8,
    fightIq: 6,
    speed: 4,
    power: -14,
    strength: -12,
    kicking: -12,
    strikingOffence: -10,
    durability: -10,
  },
  pocketBrawler: {
    power: 20,
    strikingOffence: 14,
    durability: 14,
    composure: 8,
    strength: 6,
    wrestling: -12,
    takedownDefence: -10,
    submissions: -12,
    scrambling: -10,
    speed: -8,
    cardio: -10,
  },
  clinchGrinder: {
    strength: 20,
    wrestling: 14,
    cardio: 12,
    durability: 8,
    groundControl: 6,
    kicking: -16,
    speed: -12,
    power: -10,
    submissions: -12,
    fightIq: -4,
    strikingDefence: -6,
  },
  noTakedownDefence: {
    strikingOffence: 12,
    kicking: 12,
    strikingDefence: 12,
    speed: 10,
    power: 8,
    fightIq: 6,
    takedownDefence: -22,
    wrestling: -14,
    groundControl: -12,
    scrambling: -8,
    submissions: -4,
  },
  noCardio: {
    power: 14,
    strikingOffence: 12,
    speed: 10,
    wrestling: 10,
    groundControl: 8,
    submissions: 8,
    strength: 6,
    cardio: -34,
    durability: -14,
    composure: -8,
    scrambling: -6,
    fightIq: -6,
  },
  noChin: {
    speed: 14,
    strikingOffence: 12,
    kicking: 10,
    strikingDefence: 10,
    fightIq: 8,
    cardio: 8,
    durability: -34,
    power: -12,
    composure: -8,
    strength: -8,
  },
};

/** A block at `level` with `shape` applied and the arithmetic mean corrected back to `level`. */
function withShape(level: number, shape: Partial<Record<keyof Attributes, number>>, scale: number) {
  const attrs = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) attrs[k] = level + Math.round((shape[k] ?? 0) * scale);
  // Rounding and the occasional clamp leave the mean a point or two adrift; walk it back so the
  // cohort really is matched. Without this the thing being tested leaks into the control.
  let drift = ATTRIBUTE_KEYS.reduce((acc, k) => acc + attrs[k], 0) - level * ATTRIBUTE_KEYS.length;
  for (const k of ATTRIBUTE_KEYS) {
    if (drift === 0) break;
    const step = drift > 0 ? -1 : 1;
    if (attrs[k] + step >= 1 && attrs[k] + step <= 99) {
      attrs[k] += step;
      drift += step;
    }
  }
  return attrs;
}

describe('fighters a flat average cannot tell apart', () => {
  /**
   * **The claim.** Measured over three levels and 13,050 fights: functional **0.68**, overall
   * **0.34**, and the flat unweighted mean **0.06** — near zero, as it must be when every fighter
   * has the same average. Functional is ahead at every level (0.82/0.25, 0.55/0.22, 0.67/0.56).
   *
   * `overallRating` is not quite constant here only because its fifteen weights are unequal, so a
   * matched *mean* is not a matched *weighted* mean. That residual is the whole of what it has to
   * work with, and it is worth a quarter of the available signal.
   */
  it('predicts who wins among fighters of equal average', async () => {
    const cohorts: { winRates: number[]; attributes: Attributes[] }[] = [];
    for (const level of [45, 58, 72]) {
      const fighters: Fighter[] = [];
      const attributes: Attributes[] = [];
      for (const [name, shape] of Object.entries(SHAPES)) {
        for (const [rep, scale] of [0.75, 1, 1.25].entries()) {
          const attrs = withShape(level, shape, scale);
          attributes.push(attrs);
          fighters.push(
            makeFighter({ id: `m${level}-${name}-${rep}`, lastName: name, attributes: attrs }),
          );
        }
      }
      for (const attrs of attributes) {
        const mean = ATTRIBUTE_KEYS.reduce((acc, k) => acc + attrs[k], 0) / ATTRIBUTE_KEYS.length;
        expect(mean).toBeCloseTo(level, 6);
      }
      cohorts.push({ winRates: await roundRobin(`matched:${level}`, fighters, 10), attributes });
    }

    const result = compare(cohorts);
    console.log(
      `matched means: functional ${result.functional.toFixed(4)}  overall ${result.overall.toFixed(4)}  ` +
        `flat mean ${result.flatMean.toFixed(4)}  per-level(f/o) ${result.perCohort.join(' ')}`,
    );
    expect(result.functional).toBeGreaterThan(result.overall + 0.2);
    expect(result.functional).toBeGreaterThan(0.5);
    // The control: a flat average of a matched-mean cohort carries no information at all.
    expect(Math.abs(result.flatMean)).toBeLessThan(0.2);
  });
});

describe('what the engine pays for, one attribute at a time', () => {
  /**
   * **A diagnostic, and a recorded debt rather than a target.** Doc 31 § 27.6.
   *
   * One attribute moved ±24 against an even spread of the other fourteen, so no shape is
   * confounded with any other. The marginal value of those 48 rating points, in win-rate points,
   * measured at three levels and stable across them:
   *
   * ```
   *   cardio          +62 … +68      strikingDefence    0 … +4
   *   power           +19 … +33      wrestling         −6 … +4
   *   speed           +20 … +32      durability        −4 … +4
   *   fightIq          +7 … +13      strength          −7 … −2
   *   takedownDefence  −3 … +6       composure        −13 … −7
   *   submissions      −1 … +7       kicking          −14 … −4
   *   groundControl    −3 … +4       strikingOffence  −13 … −5
   * ```
   *
   * A fighter at +24 cardio wins 82–88% of his bouts; the same fighter at −24 wins 14–26%.
   * `strikingOffence`, `kicking` and `composure` have *negative* marginal value: at a fixed budget
   * the engine pays you to take points out of them.
   *
   * **This is a defect in the simulator's balance, not a specification for a rating.** Fitted to
   * it, `functionalRating` would output "cardio, plus a little power and speed", score about 0.95
   * here, and be worthless as a description of a fighter. So `CARDIO_WEIGHT_MAX` takes the part of
   * the measurement that is also a claim about fighting and stops.
   *
   * **And this is the one population where the rating loses: 0.22 against `overallRating`'s
   * 0.36.** Said plainly rather than dressed up, because the reason is the point. This cohort is
   * *built* out of the imbalance — every fighter in it differs from every other along exactly the
   * axis the engine misprices — so the better predictor here is whichever rating happens to track
   * cardio, power and speed most closely, and `overallRating`'s flat treatment of fifteen
   * attributes accidentally does that better than a rating that reads shape. The bar below
   * therefore fences the size of the loss rather than asserting a win; if the attribute economy is
   * ever flattened, this is the test that should turn around.
   *
   * The bounds below fail if the imbalance gets *worse*, which is the regression worth catching
   * while the fix is pending. Fixing it will fail this test on purpose, and the fix is to flatten
   * the spread: `cardio` under +45, and no attribute's marginal value below −8.
   */
  it('records the attribute economy, and does not fit it', async () => {
    const DELTA = 24;
    const marginals: Record<string, number[]> = {};
    for (const key of ATTRIBUTE_KEYS) marginals[key] = [];
    const cohorts: { winRates: number[]; attributes: Attributes[] }[] = [];

    for (const level of [52, 70]) {
      const fighters: Fighter[] = [];
      const attributes: Attributes[] = [];
      const labels: string[] = [];
      for (const key of ATTRIBUTE_KEYS) {
        for (const sign of [1, -1]) {
          const shape: Partial<Record<keyof Attributes, number>> = {};
          for (const other of ATTRIBUTE_KEYS) shape[other] = -sign * (DELTA / 14);
          shape[key] = sign * DELTA;
          const attrs = withShape(level, shape, 1);
          attributes.push(attrs);
          labels.push(`${sign > 0 ? '+' : '-'}${key}`);
          fighters.push(makeFighter({ id: `o${level}-${key}-${sign}`, attributes: attrs }));
        }
      }
      const winRates = await roundRobin(`ortho:${level}`, fighters, 10);
      for (const key of ATTRIBUTE_KEYS) {
        const up = winRates[labels.indexOf(`+${key}`)]!;
        const down = winRates[labels.indexOf(`-${key}`)]!;
        marginals[key]!.push((up - down) * 100);
      }
      cohorts.push({ winRates, attributes });
    }

    const ordered = ATTRIBUTE_KEYS.map((k) => ({
      key: k,
      value: marginals[k]!.reduce((a, b) => a + b, 0) / marginals[k]!.length,
    })).sort((a, b) => b.value - a.value);
    console.log(
      'marginal win-rate value of ±24 points:\n' +
        ordered.map((r) => `  ${r.key.padEnd(18)} ${r.value.toFixed(1).padStart(6)}`).join('\n'),
    );

    const result = compare(cohorts);
    console.log(
      `orthogonal: functional ${result.functional.toFixed(4)}  overall ${result.overall.toFixed(4)}`,
    );

    // The debt, bounded. These fail if the imbalance widens — and on purpose when it is fixed.
    const cardio = ordered.find((r) => r.key === 'cardio')!.value;
    expect(cardio).toBeGreaterThan(45);
    expect(cardio).toBeLessThan(85);
    expect(Math.min(...ordered.map((r) => r.value))).toBeGreaterThan(-22);

    // And the honest outcome on a population built out of that imbalance: a loss, fenced rather
    // than hidden. Measured at 0.22 against 0.36; the bound catches it getting materially worse.
    expect(result.functional).toBeGreaterThan(result.overall - 0.25);
    expect(result.functional).toBeGreaterThan(0.1);
  });
});
