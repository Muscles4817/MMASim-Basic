/**
 * Measure whether a fixture set can separate the constants a refit has to fit.
 *
 * The counterpart to `tools/submission-fit.ts`: that one derives a constant from Full, this one
 * checks that the fixtures being derived against can hold the constants apart in the first place.
 * It exists because D22's failure was not a bad fit, it was a fit that could not have succeeded —
 * `volume` and `conversion` correlate at r = 0.86 across the current six, so an error in one is
 * indistinguishable from the opposite error in the other.
 *
 * Everything is measured in log space, because the constants are multiplicative: a doubling is
 * one step wherever it happens, and on raw values a single high-damage corner dominates every
 * correlation in the set.
 *
 * Usage:
 *   npx tsx tools/fixture-coverage.ts                  # current parity set vs the calibration set
 *   npx tsx tools/fixture-coverage.ts --select 10      # re-select from the pool
 *   npx tsx tools/fixture-coverage.ts --fights 400     # tighten the measurement
 *   npx tsx tools/fixture-coverage.ts --matchups a-v-b,c-v-d
 *   npx tsx tools/fixture-coverage.ts --seed b          # a disjoint block of fights
 *
 * `--select` is a proposal, not a verdict. The score surface over candidate sets is flat — two
 * selection runs at 200 and 400 fights per pair agreed on only 4 of 10 matchups, because dozens
 * of sets score within measurement noise of each other and the argmax flips between them. So a
 * proposed set is always re-measured on its own at a higher fight count before being shipped,
 * which is what `--matchups` is for.
 */
import {
  ARCHETYPES,
  CALIBRATION_LEVERS,
  CALIBRATION_MATCHUPS,
  calibrationFighter,
  makeFighter,
  planFor,
  simulateFight,
  type Fighter,
} from '@mmasim/engine';

const arg = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
};
const FIGHTS = arg('--fights', 300);
/**
 * Which block of fights to measure. Selecting on one block and verifying on another is the only
 * way to tell a set that is genuinely independent from one that happened to look independent on
 * the fights it was chosen against.
 */
const SEED = (() => {
  const i = process.argv.indexOf('--seed');
  return i < 0 ? 'a' : (process.argv[i + 1] ?? 'a');
})();
const SELECT = process.argv.includes('--select') ? arg('--select', 10) : 0;
const ROUND_SECONDS = 300;

/** The four rates the Reduced constants price. See `testing/calibration.ts`. */
const RATES = ['volume', 'control', 'hazard', 'conversion'] as const;
type Rate = (typeof RATES)[number];
interface Corner extends Record<Rate, number> {
  pair: string;
  corner: 'red' | 'blue';
}

/**
 * A corner that never knocked anyone down has no measurable conversion rate. The floor of one
 * knockdown per twenty fights pulls it toward zero rather than leaving it undefined, which is the
 * honest reading: the set cannot see that corner's conversion, so it should not get a vote on it.
 */
const KD_FLOOR = 0.05;

/**
 * Log-space floors, one per rate, fixed rather than derived from the data.
 *
 * The first version of this took each floor as a fraction of the median of whatever rows were
 * being measured, which made the metric move with its own input: the same calibration set scored
 * |r| 0.61 against the candidate pool and 0.68 against the parity set, purely because the floor
 * shifted underneath it. A number that changes depending on what you compare it to cannot be
 * asserted in a test.
 *
 * So these are domain floors, and each says the same thing: below this, a difference is not
 * observable at any sample size this repo runs, so it should not be allowed to become a large
 * log-space distance.
 */
const RATE_FLOOR: Readonly<Record<Rate, number>> = {
  /** Strikes per round. Never zero in practice; the floor only guards a shut-out corner. */
  volume: 0.05,
  /** Share of the round. A second and a half out of five minutes. */
  control: 0.005,
  /** Knockdowns per landed strike. One in a thousand. */
  hazard: 0.001,
  /** Finishes per knockdown. One in fifty. */
  conversion: 0.02,
};

function measure(pair: string, makeRed: () => Fighter, makeBlue: () => Fighter): Corner[] {
  const blank = () => ({ kd: 0, landed: 0, control: 0, strikeFin: 0 });
  const acc = { red: blank(), blue: blank() };
  let rounds = 0;
  for (let i = 0; i < FIGHTS; i++) {
    const red = makeRed();
    const blue = makeBlue();
    const seed = `cov:${SEED}:${pair}:${i}`;
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
  return (['red', 'blue'] as const).map((c) => {
    const landedPerRound = acc[c].landed / rounds;
    return {
      pair,
      corner: c,
      volume: landedPerRound,
      control: acc[c].control / rounds / ROUND_SECONDS,
      hazard: acc[c].kd / Math.max(acc[c].landed, 1),
      conversion: acc[c].strikeFin / FIGHTS / (acc[c].kd / FIGHTS + KD_FLOOR),
    };
  });
}

function analyse(rows: Corner[]) {
  const lg = (r: Corner, k: Rate) => Math.log(r[k] + RATE_FLOOR[k]);
  const span = (k: Rate) => {
    const v = rows.map((r) => lg(r, k));
    return Math.max(...v) - Math.min(...v);
  };
  const corr = (a: number[], b: number[]) => {
    const n = a.length;
    if (n < 3) return 0;
    const ma = a.reduce((s, x) => s + x, 0) / n;
    const mb = b.reduce((s, x) => s + x, 0) / n;
    const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i]! - mb), 0);
    const va = a.reduce((s, x) => s + (x - ma) ** 2, 0);
    const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0);
    return va <= 0 || vb <= 0 ? 0 : cov / Math.sqrt(va * vb);
  };
  const pairsOf: { a: Rate; b: Rate; r: number }[] = [];
  for (let i = 0; i < RATES.length; i++)
    for (let j = i + 1; j < RATES.length; j++)
      pairsOf.push({
        a: RATES[i]!,
        b: RATES[j]!,
        r: corr(
          rows.map((x) => lg(x, RATES[i]!)),
          rows.map((x) => lg(x, RATES[j]!)),
        ),
      });
  return { span, pairs: pairsOf, worst: Math.max(...pairsOf.map((p) => Math.abs(p.r))) };
}

function report(label: string, rows: Corner[]) {
  const { span, pairs, worst } = analyse(rows);
  const matchups = new Set(rows.map((r) => r.pair)).size;
  console.log(
    `\n=== ${label}  (${matchups} matchups, ${rows.length} corners, ${FIGHTS} fights each)`,
  );
  for (const k of RATES) {
    const v = rows.map((r) => r[k]).sort((a, b) => a - b);
    console.log(
      `  ${k.padEnd(11)} ${v[0]!.toFixed(4)} … ${v[v.length - 1]!.toFixed(4)}   ${Math.exp(span(k)).toFixed(1)}x`,
    );
  }
  console.log(`  worst |r| ${worst.toFixed(2)}`);
  for (const p of pairs.filter((p) => Math.abs(p.r) > 0.7))
    console.log(
      `    ${p.a} vs ${p.b}  r = ${p.r.toFixed(2)}${Math.abs(p.r) > 0.85 ? '   <-- confounded' : ''}`,
    );
}

/** The matchups the parity suites currently calibrate and assert against. */
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

const MATCHUPS_ARG = (() => {
  const i = process.argv.indexOf('--matchups');
  return i < 0 ? undefined : (process.argv[i + 1] ?? '').split(',').filter(Boolean);
})();

if (MATCHUPS_ARG !== undefined) {
  const rows = MATCHUPS_ARG.flatMap((m) => {
    const [a, b] = m.split('-v-') as [string, string];
    return measure(
      m,
      () => calibrationFighter(a),
      () => calibrationFighter(b),
    );
  });
  report('named set', rows);
} else if (SELECT > 0) {
  // Re-selection: measure every pair in the pool, then choose the set that spans the rates and
  // confounds them least. Coverage is a constraint rather than a term — a rate the set cannot see
  // prices nothing, so it is not available to trade against independence.
  const names = Object.keys(CALIBRATION_LEVERS);
  const rows: Corner[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      rows.push(
        ...measure(
          `${a}-v-${b}`,
          () => calibrationFighter(a),
          () => calibrationFighter(b),
        ),
      );
      process.stdout.write('.');
    }
  console.log();
  const poolSpan = Object.fromEntries(RATES.map((k) => [k, analyse(rows).span(k)])) as Record<
    Rate,
    number
  >;
  const allPairs = [...new Set(rows.map((r) => r.pair))];
  const of = (chosen: string[]) => rows.filter((r) => chosen.includes(r.pair));
  const coverage = (rs: Corner[]) => {
    const { span } = analyse(rs);
    return Math.min(...RATES.map((k) => span(k) / poolSpan[k]));
  };

  /**
   * Two constraints, not one, and the second was learned the hard way.
   *
   * `coverage` is a minimum across the four rates, so a set can satisfy it at 90% while one
   * particular rate sits at 82% — which is what happened: the first selection spanned control by
   * 20x where the six it was replacing spanned it by 30x, and the coverage figure never noticed
   * because control was not the binding rate. A set that sees *less* of a rate than the set it
   * replaces is not an improvement whatever its correlations look like, so that is a hard
   * constraint of its own, measured against the incumbent rather than against the pool.
   */
  const COVERAGE_FLOOR = 0.9;
  const currentSpan = (() => {
    const { span } = analyse(CURRENT.flatMap(([n, r, b]) => measure(n, r, b)));
    return Object.fromEntries(RATES.map((k) => [k, span(k)])) as Record<Rate, number>;
  })();
  /**
   * The margin matches the shipped test in `tests/statistical/calibration-fixtures.test.ts`, and
   * it is a margin rather than a straight `>=` because the incumbent's control span comes from
   * pairing one extreme matchup against a different matchup's near-zero corner. Demanding it be
   * met exactly would have the selection contort the whole set to chase one number.
   *
   * It is a fraction of the *log* span — 90% of the incumbent's decades — because that is the
   * space the constants live in. The first version compared raw ratios here and log spans in the
   * test, which are not the same criterion: 24x against an incumbent 32x is 74% of the ratio and
   * 92% of the log span, so the tool passed a set the test then rejected.
   */
  const INCUMBENT_MARGIN = 0.9;
  const beatsIncumbent = (rs: Corner[]) => {
    const { span } = analyse(rs);
    return RATES.every((k) => span(k) >= currentSpan[k] * INCUMBENT_MARGIN);
  };
  const score = (rs: Corner[]) =>
    rs.length < 6 || coverage(rs) < COVERAGE_FLOOR || !beatsIncumbent(rs)
      ? -1
      : 1 - analyse(rs).worst;

  const chosen: string[] = [];
  while (chosen.length < SELECT) {
    let best = '';
    let bestScore = -Infinity;
    for (const p of allPairs) {
      if (chosen.includes(p)) continue;
      const trial = of([...chosen, p]);
      // Until the set covers the space there is nothing to decorrelate, so climb coverage first,
      // counting how many rates already out-span the incumbent so the climb has somewhere to go.
      const { span } = analyse(trial);
      const beaten = RATES.filter((k) => span(k) >= currentSpan[k]).length / RATES.length;
      const s = score(trial) >= 0 ? 1 + score(trial) : (coverage(trial) + beaten) / 2;
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    chosen.push(best);
  }
  for (let pass = 0; pass < 60; pass++) {
    let improved = false;
    for (let i = 0; i < chosen.length; i++)
      for (const p of allPairs) {
        if (chosen.includes(p)) continue;
        const trial = chosen.slice();
        trial[i] = p;
        if (score(of(trial)) > score(of(chosen)) + 1e-9) {
          chosen[i] = p;
          improved = true;
        }
      }
    if (!improved) break;
  }
  // The greedy falls back to a coverage climb while no set satisfies the constraints. If it never
  // got out of that fallback the result is not a selection, and saying so is the difference
  // between a tool that reports failure and one that hands back a confounded set labelled as good.
  if (score(of(chosen)) < 0) {
    const { span } = analyse(of(chosen));
    console.log('\nNO SET SATISFIES THE CONSTRAINTS. The pool cannot reach them; widen it.');
    for (const k of RATES)
      if (span(k) < currentSpan[k] * INCUMBENT_MARGIN)
        console.log(
          `  ${k}: best ${Math.exp(span(k)).toFixed(1)}x vs incumbent ${Math.exp(currentSpan[k]).toFixed(1)}x`,
        );
    process.exitCode = 1;
  }
  console.log('selected:');
  for (const p of chosen.slice().sort()) console.log(`  ${p}`);
  report('re-selected', of(chosen));
  console.log(`  coverage ${(coverage(of(chosen)) * 100).toFixed(0)}% of pool span`);
} else {
  const currentRows = CURRENT.flatMap(([n, r, b]) => measure(n, r, b));
  const calibrationRows = CALIBRATION_MATCHUPS.flatMap(([a, b]) =>
    measure(
      `${a}-v-${b}`,
      () => calibrationFighter(a),
      () => calibrationFighter(b),
    ),
  );
  report('current parity set', currentRows);
  report('calibration set', calibrationRows);
}
