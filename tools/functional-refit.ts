/**
 * Re-fit `functionalRating`'s constants against the current engine.
 *
 * `ratings/functional.ts` carries eight constants measured against a particular simulator, and its
 * own doc says "if the engine's cardio dependence is ever retuned, this constant must be
 * re-measured". Doc 36 retuned it. This re-measures.
 *
 * ## How
 *
 * The expensive part is the ground truth — who wins — and it does not depend on the rating at all.
 * So the three populations `tests/statistical/functional-rating.test.ts` builds are simulated
 * **once** and cached (`--rebuild` forces it). Then a copy of `functional.ts` with each constant read
 * from `globalThis` is searched: a random scatter over the box, then a compass search from the best
 * few — the same shape as `reduced-refit.ts`, and for the same reason (the constants interact).
 *
 * ## Objective
 *
 * Spearman rank correlation with win rate, pooled within cohorts exactly as the test does, summed
 * over the **general** and **matched-mean** populations. The **orthogonal** population is reported
 * and deliberately not fitted: it is built out of the engine's attribute imbalance, and the module's
 * own doc records why fitting to it would make the rating a description of the imbalance rather than
 * of fighters. For the same reason `cardioMax` is bounded at 0.5.
 *
 * ## Result after doc 36
 *
 * Against unplanned round robins, held to the design claims, nothing beat the old constants. Against
 * **planned** round robins (`--planned`, the world the rating describes) the old constants were no
 * better than `overallRating` on matched means, and a structural change — the route bill as a power
 * mean, `BILL_POWER` — plus a refit took matched means from 0.10 to 0.56 (hold-out 0.554 against
 * `overallRating`'s 0.154). Those are the shipped constants; see the note on `CARDIO_WEIGHT_MAX`.
 *
 * Usage:
 *   npx vite-node tools/functional-refit.ts --baseline
 *   npx vite-node tools/functional-refit.ts --planned --fit [--scatter 300] [--free-cardio]
 *   npx vite-node tools/functional-refit.ts --check v1,v2,... [--holdout]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTRIBUTE_KEYS,
  ELITE_LIFT,
  createRng,
  generateFighter,
  makeFighter,
  overallRating,
  planFor,
  simulateFight,
  type Attributes,
  type BandContext,
  type Fighter,
} from '@mmasim/engine';

const HERE = dirname(fileURLToPath(import.meta.url));
const RATINGS = join(HERE, '..', 'packages', 'engine', 'src', 'ratings');
const SOURCE = join(RATINGS, 'functional.ts');
const VARIANT = join(RATINGS, '__fit_functional.ts');
const CACHE_DIR = join(HERE, '..', 'node_modules', '.cache', 'functional-refit');
/** `--holdout` simulates the same populations on different seeds, to check a fit generalises. */
const HOLDOUT = process.argv.includes('--holdout');
/**
 * `--planned` gives every fighter the plan `planFor` would, as every AI fighter in the game has. The
 * rating describes fighters in that world — where an opponent's camp *does* target the hole — and the
 * unplanned round robin under-charges exploitability: measured, an exploitable striker beats a
 * level-70 all-rounder 59 % of the time unplanned and loses 60 % planned.
 */
const PLANNED = process.argv.includes('--planned');
const SEED_TAG = HOLDOUT ? 'holdout:' : '';
const CACHE = join(
  CACHE_DIR,
  `${HOLDOUT ? 'holdout' : 'populations'}${PLANNED ? '-planned' : ''}.json`,
);

// --- The parameters -----------------------------------------------------------------------------

const KEYS = [
  'wantTau',
  'rangeGateScale',
  'targetTau',
  'cardioMax',
  'durabilityMax',
  'gamePlanning',
  'contextPower',
  'panelTau',
  'billPower',
] as const;
type Key = (typeof KEYS)[number];
type Params = Record<Key, number>;

/** The shipped constants. Before doc 36's planned refit: 10, 18, 10, 0.4, 0.18, 0.45, −2, 12, 1. */
export const MASTER: Params = {
  wantTau: 5.4,
  rangeGateScale: 30,
  targetTau: 14.2,
  cardioMax: 0.4,
  durabilityMax: 0.3,
  gamePlanning: 0.356,
  contextPower: -0.556,
  panelTau: 23.8,
  billPower: -1.8,
};

const BOUNDS: Readonly<Record<Key, readonly [number, number]>> = {
  wantTau: [4, 20],
  rangeGateScale: [8, 30],
  targetTau: [4, 20],
  /*
   * Held at 0.4 by default — the module's principled cap, not a fitted value. Left free, the search
   * runs straight to its upper bound, which is the engine's cardio imbalance (doc 31 § 27.6) being
   * written into the rating; `--free-cardio` lets it, for measuring that cost.
   */
  cardioMax: process.argv.includes('--free-cardio') ? [0.15, 0.5] : [0.4, 0.4],
  durabilityMax: [0.05, 0.3],
  /*
   * Floored at 0.35: below it the rating stops charging a specialist who cannot impose for the hole
   * an opponent would target, and `functional.test.ts`'s design claims fail ("a specialist who
   * cannot impose reads below his flat average"). The search wants 0.15 here; that is the engine
   * rewarding a fighter's own preference, not a reason to stop describing exploitability.
   */
  gamePlanning: [0.35, 0.8],
  /*
   * Capped at −0.5: a power mean at or above zero stops charging a fighter for his weakest context,
   * and `functional.test.ts`'s design claims fail with it ("charges a hole to whoever can put you in
   * it"). Charging holes is what the rating is for, so it is a constraint and not a fitted value.
   */
  contextPower: [-5, -0.5],
  panelTau: [5, 25],
  billPower: [-6, 1],
};

const ANCHORS: Readonly<Record<Key, string>> = {
  wantTau: 'const WANT_TAU = ',
  rangeGateScale: 'const RANGE_GATE_SCALE = ',
  targetTau: 'const TARGET_TAU = ',
  cardioMax: 'const CARDIO_WEIGHT_MAX = ',
  durabilityMax: 'const DURABILITY_WEIGHT_MAX = ',
  gamePlanning: 'const GAME_PLANNING = ',
  contextPower: 'const CONTEXT_POWER = ',
  panelTau: 'const PANEL_TAU = ',
  billPower: 'const BILL_POWER = ',
};

/** A copy of `functional.ts` whose constants are read from `globalThis` at call time. */
function writeVariant(): void {
  let s = readFileSync(SOURCE, 'utf8');
  for (const key of KEYS) {
    const anchor = ANCHORS[key];
    const i = s.indexOf(anchor);
    if (i < 0) throw new Error(`anchor missing: ${anchor}`);
    const end = s.indexOf(';', i);
    const name = anchor.replace('const ', '').replace(' = ', '');
    s = s.slice(0, i) + `const ${name}_FIT = 0` + s.slice(end);
    // Every use of the constant reads the live parameter instead.
    s = s.replace(new RegExp(`\\b${name}\\b(?!_FIT)`, 'g'), `(globalThis as any).__fit.${key}`);
  }
  writeFileSync(VARIANT, s);
}

// --- Ground truth -------------------------------------------------------------------------------

interface Cohort {
  winRates: number[];
  attributes: Attributes[];
  context?: BandContext;
}
interface Populations {
  general: Cohort[];
  matched: Cohort[];
  orthogonal: Cohort[];
}

function roundRobin(label: string, fighters: readonly Fighter[], fights: number): number[] {
  const wins = new Array<number>(fighters.length).fill(0);
  const bouts = new Array<number>(fighters.length).fill(0);
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      for (let k = 0; k < fights; k++) {
        const seed = `${SEED_TAG}${label}:${i}-${j}-${k}`;
        const r = simulateFight({
          boutId: seed,
          seed,
          rounds: 3,
          red: {
            fighter: fighters[i]!,
            plan: PLANNED ? planFor(fighters[i]!, fighters[j]!) : undefined,
          },
          blue: {
            fighter: fighters[j]!,
            plan: PLANNED ? planFor(fighters[j]!, fighters[i]!) : undefined,
          },
        });
        bouts[i]!++;
        bouts[j]!++;
        if (r.winnerId === fighters[i]!.id) wins[i]!++;
        else if (r.winnerId === fighters[j]!.id) wins[j]!++;
        else {
          wins[i]! += 0.5;
          wins[j]! += 0.5;
        }
      }
    }
  }
  return wins.map((w, i) => w / bouts[i]!);
}

function withShape(level: number, shape: Partial<Record<keyof Attributes, number>>, scale: number) {
  const attrs = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) attrs[k] = level + Math.round((shape[k] ?? 0) * scale);
  let drift = ATTRIBUTE_KEYS.reduce((a, k) => a + attrs[k], 0) - level * ATTRIBUTE_KEYS.length;
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

/** The test's shapes, verbatim, so the fit and the acceptance test measure the same thing. */
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

function build(): Populations {
  const general: Cohort[] = [];
  const divisions: readonly (readonly [string, 'male' | 'female'])[] = [
    ['mens-lightweight', 'male'],
    ['mens-welterweight', 'male'],
    ['mens-heavyweight', 'male'],
    ['mens-flyweight', 'male'],
    ['womens-bantamweight', 'female'],
    // Three more than the test runs, so the fit is not tuned to the test's own sample.
    ['mens-middleweight', 'male'],
    ['mens-featherweight', 'male'],
    ['womens-strawweight', 'female'],
  ];
  for (const [divisionId, sex] of divisions) {
    const rng = createRng(`${SEED_TAG}functional-general-${divisionId}`);
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
    console.log(`  general ${divisionId}`);
    general.push({
      winRates: roundRobin(`gen:${divisionId}`, fighters, 8),
      attributes: fighters.map((f) => f.attributes),
      context: { divisionId, sex, eliteLift: ELITE_LIFT } as BandContext,
    });
  }

  const matched: Cohort[] = [];
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
    console.log(`  matched ${level}`);
    matched.push({ winRates: roundRobin(`matched:${level}`, fighters, 10), attributes });
  }

  const orthogonal: Cohort[] = [];
  for (const level of [52, 70]) {
    const fighters: Fighter[] = [];
    const attributes: Attributes[] = [];
    for (const key of ATTRIBUTE_KEYS) {
      for (const sign of [1, -1]) {
        const shape: Partial<Record<keyof Attributes, number>> = {};
        for (const other of ATTRIBUTE_KEYS) shape[other] = -sign * (24 / 14);
        shape[key] = sign * 24;
        const attrs = withShape(level, shape, 1);
        attributes.push(attrs);
        fighters.push(makeFighter({ id: `o${level}-${key}-${sign}`, attributes: attrs }));
      }
    }
    console.log(`  orthogonal ${level}`);
    orthogonal.push({ winRates: roundRobin(`ortho:${level}`, fighters, 10), attributes });
  }
  return { general, matched, orthogonal };
}

// --- Scoring ------------------------------------------------------------------------------------

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
  const d2 = ra.reduce((acc, _, i) => acc + (ra[i]! - rb[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
type Rating = (a: Attributes, c?: BandContext) => number;
function pooled(cohorts: readonly Cohort[], rate: Rating): number {
  const w: number[] = [];
  const f: number[] = [];
  for (const c of cohorts) {
    const rw = ranksOf(c.winRates);
    const rf = ranksOf(c.attributes.map((a) => rate(a, c.context)));
    for (let i = 0; i < rw.length; i++) {
      w.push(rw[i]!);
      f.push(rf[i]!);
    }
  }
  return spearman(f, w);
}

const owAt = process.argv.indexOf('--orthogonal-weight');
const ORTHOGONAL_WEIGHT = owAt < 0 ? 0.25 : Number(process.argv[owAt + 1]);

// --- Main ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  let pops: Populations;
  if (existsSync(CACHE) && !process.argv.includes('--rebuild')) {
    pops = JSON.parse(readFileSync(CACHE, 'utf8')) as Populations;
  } else {
    console.log('simulating the three populations (once) ...');
    pops = build();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE, JSON.stringify(pops));
  }

  writeVariant();
  const mod = (await import(VARIANT)) as { functionalRating: Rating };
  const apply = (p: Params) => ((globalThis as unknown as { __fit: Params }).__fit = p);
  const score = (p: Params) => {
    apply(p);
    return {
      general: pooled(pops.general, mod.functionalRating),
      matched: pooled(pops.matched, mod.functionalRating),
      orthogonal: pooled(pops.orthogonal, mod.functionalRating),
    };
  };
  const objective = (p: Params) => {
    const s = score(p);
    // A small weight on the orthogonal cohort: not chased, but not allowed to collapse either.
    return s.general + s.matched + ORTHOGONAL_WEIGHT * s.orthogonal;
  };
  const overall = (a: Attributes) => overallRating(a);
  const report = (label: string, p: Params) => {
    const s = score(p);
    console.log(
      `${label.padEnd(9)} general ${s.general.toFixed(4)}  matched ${s.matched.toFixed(4)}  ` +
        `orthogonal ${s.orthogonal.toFixed(4)}  | overallRating ${pooled(pops.general, overall).toFixed(4)} / ` +
        `${pooled(pops.matched, overall).toFixed(4)} / ${pooled(pops.orthogonal, overall).toFixed(4)}`,
    );
  };

  report('master', MASTER);
  const checkAt = process.argv.indexOf('--check');
  if (checkAt >= 0) {
    const values = (process.argv[checkAt + 1] ?? '').split(',').map(Number);
    report('check', Object.fromEntries(KEYS.map((k, i) => [k, values[i] ?? MASTER[k]])) as Params);
  }
  if (!process.argv.includes('--fit')) return;

  const scatterAt = process.argv.indexOf('--scatter');
  const SCATTER = scatterAt < 0 ? 300 : Number(process.argv[scatterAt + 1]);
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const scored: { p: Params; s: number }[] = [{ p: { ...MASTER }, s: objective(MASTER) }];
  for (let i = 0; i < SCATTER; i++) {
    const p = Object.fromEntries(
      KEYS.map((k) => [k, BOUNDS[k][0] + rand() * (BOUNDS[k][1] - BOUNDS[k][0])]),
    ) as Params;
    scored.push({ p, s: objective(p) });
  }
  scored.sort((a, b) => b.s - a.s);

  const clampTo = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));
  const descend = (from: Params) => {
    let cur = { ...from };
    let best = objective(cur);
    let step = 0.2;
    while (step > 0.004) {
      let improved = false;
      for (const k of KEYS) {
        for (const dir of [1, -1]) {
          const [lo, hi] = BOUNDS[k];
          const next = { ...cur, [k]: clampTo(cur[k] + dir * step * (hi - lo), BOUNDS[k]) };
          const s = objective(next);
          if (s > best + 1e-5) {
            cur = next;
            best = s;
            improved = true;
          }
        }
      }
      if (!improved) step /= 2;
    }
    return { p: cur, s: best };
  };

  let winner = { p: { ...MASTER }, s: objective(MASTER) };
  for (const start of [{ ...MASTER }, ...scored.slice(0, 5).map((x) => x.p)]) {
    const r = descend(start);
    console.log(`  start: ${r.s.toFixed(4)}`);
    if (r.s > winner.s) winner = r;
  }
  report('fitted', winner.p);
  console.log(
    JSON.stringify(
      Object.fromEntries(KEYS.map((k) => [k, Number(winner.p[k].toPrecision(3))])),
      null,
      2,
    ),
  );
}

void main().finally(() => rmSync(VARIANT, { force: true }));
