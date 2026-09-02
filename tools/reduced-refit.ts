/**
 * The joint refit of the Reduced resolver's constants (doc 31 § D24).
 *
 * D22 established that `round.ts`'s constants are a mutually-compensating set: each was fitted
 * against the same six near-symmetric matchups with the others' errors already in place, so
 * correcting one exposes what it was cancelling and breaks parity bounds that the compensation had
 * been holding up. D23 built the fixture set that can hold the four rates apart. This fits them
 * together against it.
 *
 * ## How a variant is evaluated without a production seam
 *
 * The constants are module-level `const`s, so a single process cannot sweep them. Rather than open
 * an injection point in shipped code for a tool's benefit, this writes a *copy* of `round.ts` with
 * the constants substituted into the same directory — so its relative imports still resolve — and
 * imports that. The copy is deleted afterwards. Production keeps no seam it does not otherwise
 * need, and the fit stays reproducible by anyone who runs this file.
 *
 * ## What is fitted, and against what
 *
 * Full is the reference (invariant 6). For each corner of each calibration matchup the objective
 * is the log-ratio of Reduced's rate to Full's, over the four rates D23 named — volume, control,
 * hazard, conversion. Log because the constants are multiplicative and a 2x under-count and a 2x
 * over-count are the same size of error.
 *
 * Usage:
 *   npx tsx tools/reduced-refit.ts --baseline          # measure master, fit nothing
 *   npx tsx tools/reduced-refit.ts --fit               # the joint fit
 *   npx tsx tools/reduced-refit.ts --check p1,p2,...   # measure one parameter vector
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CALIBRATION_MATCHUPS,
  calibrationFighter,
  planFor,
  resolveFightByRound as shipped,
  simulateFight,
  type Fighter,
} from '@mmasim/engine';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIGHT_DIR = join(HERE, '..', 'packages', 'engine', 'src', 'fight');
const SOURCE = join(FIGHT_DIR, 'round.ts');

const arg = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
};
const FIGHTS = arg('--fights', 400);
/**
 * Which block of fights to measure. The objective is deterministic for a given parameter vector —
 * the same seeded fights are re-run — so the optimiser sees no noise, but it can overfit to this
 * particular sample. The fitted vector is re-measured on a block it was not fitted against.
 */
const SEED = (() => {
  const i = process.argv.indexOf('--seed');
  return i < 0 ? 'a' : (process.argv[i + 1] ?? 'a');
})();
const ROUND_SECONDS = 300;

/* ---------------------------------------------------------------------------------------------
 * The parameter vector.
 * ------------------------------------------------------------------------------------------- */

/**
 * The four constants that compensate for each other, plus the two shape parameters the D21 and
 * D12 corrections introduce.
 *
 * `controlDominance` and `hurtUplift`/`hurtHalfRate` are the two *mechanism* changes, not merely
 * new numbers: at `controlDominance` 0 the split keeps its old mean and at `hurtUplift` 1 the
 * hazard keeps its old constant rate, so the vector contains master as an interior point. That
 * matters — it means a fit that lands on the old behaviour would say so rather than being
 * excluded by construction.
 */
export interface Params {
  /** `BASE_ATTEMPTS`. The scale of a round's striking output. */
  baseAttempts: number;
  /**
   * How far the control split moves from its old mean (`0.1 + 0.8·d`) toward `dominance` itself.
   * 0 is master; 1 is D21's fix.
   */
  controlDominance: number;
  /**
   * A flat multiplier on the per-strike knockdown hazard. 1 is master.
   *
   * Split out from the self-excitation term because the two were not separately identifiable and
   * a one-at-a-time search could never find them together: with `hurtUplift` at 1 the half-rate
   * has exactly zero gradient, so no single step could discover that a small half-rate *and* an
   * uplift above 1 beat both. The residual it exists to absorb is a level — with volume and
   * control corrected, Reduced's knockdowns per landed strike sit at a geometric mean of 0.78 of
   * Full's across the set, low in 15 of 20 corners.
   */
  hazardScale: number;
  /** Extra hazard at high knockdown rates — D12's self-excitation, on top of the scale. 0 is none. */
  hurtGain: number;
  /**
   * Exponent on the fighter's own striking effect in `attemptsFor`'s output term. 0 is master.
   *
   * The real third member of the compensating set, and it is a *modelling claim* rather than a
   * mis-set number. `attemptsFor`'s comment states it outright — "volume is a property of the
   * situation, not of the striker" — and that was measured across the six matchups, every one of
   * which pairs fighters whose striking sits between roughly 48 and 90. Across the range D23's set
   * covers it is false: Full has `outputNoPower` landing 24.3 a round and `grapplerNoGas` landing
   * 0.70, and `attemptsFor` carries no term at all for how good at striking the fighter is.
   *
   * The first attempt used `strikeLean`, which is wrong for a reason worth keeping: it clamps at
   * 0.15 for *every* grappler, so it cannot tell `smother` (striking 58, and Full has him landing
   * 6.0 a round) from `grapplerNoGas` (striking 40, landing 0.70). The distinction Full draws is
   * the absolute rating, not the balance of the fighter's game.
   */
  volumeStriking: number;
  /**
   * The floor on the `position` term in `attemptsFor`.
   *
   * Master is 0.3, and it is a third member of the compensating set that neither D21 nor D12
   * recorded. It stops a fighter who is being held down from ever throwing less than 30% of
   * baseline, so Reduced cannot represent "pinned and throwing nothing" at all: Full has
   * `grapplerNoGas` landing 0.70 strikes a round while `eliteGrappler` smothers him, and Reduced
   * books 3.89. Exactly D21's defect — an intercept the loser of the exchange cannot fall below —
   * in volume rather than in control.
   */
  positionFloor: number;
  /** Scale on the `underneath` penalty, i.e. how hard being controlled suppresses output. */
  underneathScale: number;
  /**
   * An additive floor on how much of a round ends up in contact, before the pulls are counted.
   *
   * **Not** `BASE_CONTROL`, which was the first thing tried and is not wrong: at the even matchup
   * where that constant is defined, Full gives each fighter 0.313 of the fight and Reduced 0.300
   * and 0.284. Left free, the fit drove it to its bound of 0.75 — which does not model anything,
   * it just saturates `MAX_TOTAL_CONTROL` for every matchup at once.
   *
   * What is actually wrong is the shape at the bottom. `controlPull` is a product, so two fighters
   * who both want nothing to do with the floor multiply toward zero: Full puts 9.8% of
   * `olympicBoxer-v-pointKarateka` in contact and Reduced puts 3.1%. Some grappling happens in any
   * fight whatever either man intends — a slip, a scramble, a fence tie-up on the way out of an
   * exchange — and a product has no way to say so. This is that irreducible share.
   */
  incidentalContact: number;
  /** Exponents on the two contests in `controlPull`, which set the spread away from even. */
  pushExponent: number;
  holdExponent: number;
  /** `FINISH_FLOOR`. */
  finishFloor: number;
  /** `FINISH_PER_DAMAGE`. */
  finishPerDamage: number;
}

/**
 * The shipped vector. `--check` against it is the shipped model, and the search starts from it.
 *
 * The values that shipped *before* the D24 refit are `15.0, 0, 0.3, 1, 0, 1, 0, 0.042, 0.00477` —
 * pass them to `--check` to reproduce the before column of that entry's table.
 */
export const MASTER: Params = {
  // Declared in `KEYS` order, so a vector passed to `--check` reads the same way as this literal.
  baseAttempts: 15.0,
  volumeStriking: 0,
  positionFloor: 0.06,
  underneathScale: 1.76,
  controlDominance: 0.47,
  incidentalContact: 0.06,
  pushExponent: 0.9,
  holdExponent: 0.8,
  hazardScale: 1.25,
  hurtGain: 0,
  finishFloor: 0.08,
  finishPerDamage: 0.00477,
};

/* ---------------------------------------------------------------------------------------------
 * Building a variant.
 * ------------------------------------------------------------------------------------------- */

const VARIANT = join(FIGHT_DIR, '__refit_variant.ts');

/**
 * Write `round.ts` with the parameter vector substituted in.
 *
 * The two mechanism changes are applied as source edits rather than as extra constants, because
 * each replaces an expression rather than a number. Both are written so the master value of the
 * parameter reproduces the master expression exactly — see `Params`.
 */
/**
 * Write `round.ts` once, with every fitted quantity read from `globalThis` at call time rather
 * than baked in as a constant.
 *
 * The first version substituted literals and re-imported per evaluation, which spent about 1.6s
 * of every 1.9s re-transpiling a 1300-line file. Reading the vector at call time means the module
 * is transpiled once and an evaluation costs only the fights it runs — which is what makes a
 * search over nine coupled parameters affordable at all, and coupling is the whole reason this
 * refit exists.
 *
 * Every substitution is written so the master vector reproduces the master expression exactly, and
 * `--verify` asserts that fight-for-fight rather than trusting it.
 */
function writeVariant(): void {
  let s = readFileSync(SOURCE, 'utf8');
  const sub = (from: string, to: string) => {
    if (!s.includes(from)) throw new Error(`refit anchor missing: ${from}`);
    s = s.replace(from, to);
  };

  sub(
    "import { clamp, clamp01, remap } from '../core/math.js';",
    `import { clamp, clamp01, remap } from '../core/math.js';
const _P = (): Record<string, number> =>
  (globalThis as unknown as { __refit: Record<string, number> }).__refit;`,
  );

  sub('BASE_ATTEMPTS * output * position', '_P().baseAttempts * output * position');
  sub(
    'BASE_CONTROL * (wants / 0.42) * asContest(push) ** 0.9 * asContest(hold) ** 0.8',
    'BASE_CONTROL * (wants / 0.42) * asContest(push) ** _P().pushExponent * ' +
      'asContest(hold) ** _P().holdExponent',
  );
  sub(
    'const grappled = Math.min(pull + INCIDENTAL_CONTACT, MAX_TOTAL_CONTROL);',
    'const grappled = Math.min(pull + _P().incidentalContact, MAX_TOTAL_CONTROL);',
  );
  sub('w.attempts / lasted / BASE_ATTEMPTS', 'w.attempts / lasted / _P().baseAttempts');
  sub(
    '((FINISH_FLOOR + FINISH_PER_DAMAGE * damageThisRound) * window ** HURT_WINDOW_EXPONENT) /',
    '((_P().finishFloor + _P().finishPerDamage * damageThisRound) * window ** HURT_WINDOW_EXPONENT) /',
  );

  // Volume: a term for the fighter's own striking, absent from master. Exponent 0 is master.
  sub(
    "import { effect, fatiguedEffect, repertoire } from '../ratings/curve.js';",
    "import { attributeEffect, effect, fatiguedEffect, repertoire } from '../ratings/curve.js';",
  );
  sub(
    '    strikingAppetite(a) ** 0.35;',
    `    strikingAppetite(a) ** 0.35 *
    attributeEffect(a.attrs, 'strikingOffence') ** _P().volumeStriking;`,
  );

  // Volume: how hard being controlled suppresses output, and the floor under it.
  sub(
    `  const position = clamp(
    1 + ownControl * 0.26 * workAppetite - beingControlled * underneath * UNDERNEATH_SCALE,
    0.06,
    1.6,
  );`,
    `  const position = clamp(
    1 + ownControl * 0.26 * workAppetite - beingControlled * underneath * _P().underneathScale,
    _P().positionFloor,
    1.6,
  );`,
  );

  // D21: blend the old draw's mean toward `dominance` itself, keeping the old spread.
  sub(
    'let cRed = grappled * (oldMean + CONTROL_DOMINANCE_BLEND * (dominantMean - oldMean));',
    'let cRed = grappled * (oldMean + _P().controlDominance * (dominantMean - oldMean));',
  );

  // D12: the self-excitation uplift on the per-strike hazard, saturating in the base rate.
  sub(
    `      const hazard =
        knockdownHazard(a, d, 'head', expectedFlush(a, d, 'punch'), 'punch') *
        rangeHazardFor(a, d) *
        HAZARD_SCALE;`,
    `      const _bare =
        knockdownHazard(a, d, 'head', expectedFlush(a, d, 'punch'), 'punch') * rangeHazardFor(a, d);
      const _lambda = _bare * w.landed;
      const HURT_HALF_RATE = 0.2;
      const hazard =
        _bare * _P().hazardScale * (1 + _P().hurtGain * (_lambda / (_lambda + HURT_HALF_RATE)));`,
  );

  writeFileSync(VARIANT, s);
}

let cachedRun: Resolver | undefined;
async function runner(): Promise<Resolver> {
  if (cachedRun === undefined) {
    writeVariant();
    const mod = await import(VARIANT);
    cachedRun = mod.resolveFightByRound as unknown as Resolver;
  }
  return cachedRun;
}

/** Install a parameter vector for the next measurement. */
function apply(p: Params): void {
  (globalThis as unknown as { __refit: Params }).__refit = p;
}

/* ---------------------------------------------------------------------------------------------
 * Measurement.
 * ------------------------------------------------------------------------------------------- */

const RATES = ['volume', 'control', 'hazard', 'conversion'] as const;
type Rate = (typeof RATES)[number];
type Row = Record<Rate, number> & { pair: string; corner: 'red' | 'blue' };

/** Floors shared with `tools/fixture-coverage.ts`; see D23 for why they are fixed. */
const RATE_FLOOR: Readonly<Record<Rate, number>> = {
  volume: 0.05,
  control: 0.005,
  hazard: 0.001,
  conversion: 0.02,
};
const KD_FLOOR = 0.05;

type Resolver = (c: Parameters<typeof simulateFight>[0]) => {
  round: number;
  method: string;
  winnerId?: string;
  timeSeconds: number;
  stats: Record<
    'red' | 'blue',
    {
      knockdowns: number;
      significantStrikesLanded: number;
      controlSeconds: number;
      damageDealt: number;
      submissionAttempts: number;
    }
  >;
};

interface RichRow {
  pair: string;
  corner: 'red' | 'blue';
  kdPerFight: number;
  strikeFinRate: number;
  damagePerRound: number;
  subAttPerRound: number;
  subFinRate: number;
}
let rich: RichRow[] = [];

function measure(run: Resolver, tag: string, seedOverride?: string): Row[] {
  const rows: Row[] = [];
  rich = [];
  for (const [an, bn] of CALIBRATION_MATCHUPS) {
    const pair = `${an}-v-${bn}`;
    const blank = () => ({
      kd: 0,
      landed: 0,
      control: 0,
      strikeFin: 0,
      damage: 0,
      subAtt: 0,
      subFin: 0,
    });
    const acc = { red: blank(), blue: blank() };
    let rounds = 0;
    for (let i = 0; i < FIGHTS; i++) {
      const red: Fighter = calibrationFighter(an);
      const blue: Fighter = calibrationFighter(bn);
      const seed = `refit:${seedOverride ?? SEED}:${pair}:${i}`;
      const f = run({
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
        acc[c].damage += f.stats[c].damageDealt;
        acc[c].subAtt += f.stats[c].submissionAttempts;
      }
      /*
       * Elapsed time, not whole rounds.
       *
       * A round ending in a stoppage has its stats prorated to the moment of the stoppage, so
       * dividing by `f.round` charges a fighter five minutes for thirty seconds of work and
       * understates every rate in exactly the matchups that finish early. D24 used whole rounds
       * and its `control` target carried the artefact: measured that way the residual floor-time
       * error has no structure at all (best predictor |r| 0.32), and against elapsed time the same
       * fights give a level of 0.71x and a slope of +0.64 against Full's own floor time. See
       * doc 31 § D25.
       */
      rounds += ((f.round - 1) * ROUND_SECONDS + f.timeSeconds) / ROUND_SECONDS;
      const w = f.winnerId === undefined ? undefined : f.winnerId === red.id ? 'red' : 'blue';
      if (
        w !== undefined &&
        (f.method === 'ko' || f.method === 'tko' || f.method === 'doctorStoppage')
      )
        acc[w].strikeFin += 1;
      if (w !== undefined && f.method === 'submission') acc[w].subFin += 1;
    }
    for (const c of ['red', 'blue'] as const) {
      rich.push({
        pair,
        corner: c,
        kdPerFight: acc[c].kd / FIGHTS,
        strikeFinRate: acc[c].strikeFin / FIGHTS,
        damagePerRound: acc[c].damage / rounds,
        subAttPerRound: acc[c].subAtt / rounds,
        subFinRate: acc[c].subFin / FIGHTS,
      });
      rows.push({
        pair,
        corner: c,
        volume: acc[c].landed / rounds,
        control: acc[c].control / rounds / ROUND_SECONDS,
        hazard: acc[c].kd / Math.max(acc[c].landed, 1),
        conversion: acc[c].strikeFin / FIGHTS / (acc[c].kd / FIGHTS + KD_FLOOR),
      });
    }
  }
  void tag;
  return rows;
}

/**
 * The sampling noise in each rate, subtracted from every residual below.
 *
 * Without this the objective is dominated by whichever rate is hardest to measure rather than by
 * whichever the model gets most wrong — and that is not hypothetical, it is what the first two
 * fits did. At 400 fights a matchup, `conversion` carries an RMS of 0.44 between two runs of Full
 * against *itself*, against a measured Reduced-versus-Full error of 0.58. Three quarters of it was
 * the sample. It was 35% of the objective, and the optimiser spent its budget chasing it.
 *
 * A Full-versus-Full comparison has two independent samples in it, so it measures 2 sigma^2; the
 * same for Reduced. A Full-versus-Reduced residual carries one of each, so its noise is
 * `sqrt((fullPair^2 + reducedPair^2) / 2)`, and true error follows by subtraction in quadrature
 * since the two are independent.
 */
let NOISE: Record<Rate, number> | undefined;

/** Per-rate RMS log-ratio of Reduced against Full, and the worst single corner. */
function agreement(full: Row[], reduced: Row[]) {
  const per = {} as Record<Rate, { rms: number; raw: number; worst: number; where: string }>;
  for (const k of RATES) {
    let sum = 0,
      worst = 0,
      where = '';
    for (let i = 0; i < full.length; i++) {
      const lr = Math.log((reduced[i]![k] + RATE_FLOOR[k]) / (full[i]![k] + RATE_FLOOR[k]));
      sum += lr * lr;
      if (Math.abs(lr) > Math.abs(worst)) {
        worst = lr;
        where = `${full[i]!.pair}/${full[i]!.corner}`;
      }
    }
    const raw = Math.sqrt(sum / full.length);
    const n = NOISE?.[k] ?? 0;
    per[k] = {
      rms: Math.sqrt(Math.max(raw * raw - n * n, 0)),
      raw,
      worst: Math.exp(worst),
      where,
    };
  }
  // The four rates weigh equally. Weighting by how wrong master happens to be would bake the
  // compensating set's own priorities into the thing meant to replace it.
  const overall = Math.sqrt(RATES.reduce((s, k) => s + per[k].rms ** 2, 0) / RATES.length);
  return { per, overall };
}

function report(label: string, full: Row[], reduced: Row[]) {
  const { per, overall } = agreement(full, reduced);
  console.log(`\n=== ${label}   overall RMS log-ratio ${overall.toFixed(3)}`);
  for (const k of RATES)
    console.log(
      `  ${k.padEnd(11)} RMS ${per[k].rms.toFixed(3)}  (raw ${per[k].raw.toFixed(3)}, noise ${(NOISE?.[k] ?? 0).toFixed(3)})` +
        `   worst ${per[k].worst.toFixed(2)}x  (${per[k].where})`,
    );
  return overall;
}

/* ---------------------------------------------------------------------------------------------
 * Run.
 * ------------------------------------------------------------------------------------------- */

const KEYS = [
  'baseAttempts',
  'volumeStriking',
  'positionFloor',
  'underneathScale',
  'controlDominance',
  'hazardScale',
  'hurtGain',
  'incidentalContact',
  'pushExponent',
  'holdExponent',
  'finishFloor',
  'finishPerDamage',
] as const;

/**
 * Search box.
 *
 * Every range contains master as an interior point or an endpoint, so a fit that lands back on the
 * shipped behaviour would say so rather than being excluded by construction.
 */
const BOUNDS: Record<keyof Params, [number, number]> = {
  baseAttempts: [8, 26],
  volumeStriking: [0, 1.2],
  positionFloor: [0.02, 0.5],
  underneathScale: [0.5, 2.6],
  controlDominance: [0, 1],
  hazardScale: [0.6, 2.2],
  hurtGain: [0, 2],
  incidentalContact: [0, 0.2],
  pushExponent: [0.5, 1.3],
  holdExponent: [0.5, 1.3],
  finishFloor: [0, 0.25],
  finishPerDamage: [0, 0.015],
};

/**
 * Parameters to freeze at their master values.
 *
 * `finishFloor` and `finishPerDamage` are held by default, and the reason is a result rather than
 * a convenience: at any fight count this search can afford, `conversion` is almost entirely
 * sampling noise — 0.59 of a measured 0.59 at 300 fights a matchup — so the objective carries no
 * information about them. Left free, the fit walked them to 0.22 and 0.0003, five times and one
 * seventeenth of the values `round-profile.ts` measured, purely because that flattens a term the
 * noise correction then clips to zero. A constant with a real derivation behind it is not improved
 * by refitting it against noise.
 */
const HELD = (() => {
  const i = process.argv.indexOf('--hold');
  const raw = i < 0 ? 'finishFloor,finishPerDamage' : (process.argv[i + 1] ?? '');
  return new Set(raw.split(',').filter(Boolean));
})();

const parse = (v: number[]): Params =>
  Object.fromEntries(KEYS.map((k, i) => [k, v[i]!])) as unknown as Params;

async function main() {
  const run = await runner();
  console.log(`measuring Full over ${CALIBRATION_MATCHUPS.length} matchups x ${FIGHTS} fights ...`);
  const full = measure(simulateFight as unknown as Resolver, 'full');
  const fullRich = rich;

  /*
   * Measure the noise floor before anything is fitted, so every number this tool prints is a model
   * error rather than a model error plus a sample. Cheap: four measurements, once.
   */
  const fullB = measure(simulateFight as unknown as Resolver, 'full', 'noise-b');
  apply(MASTER);
  const redA = measure(run, 'r');
  const redB = measure(run, 'r', 'noise-b');
  const fullPair = agreement(full, fullB).per;
  const redPair = agreement(redA, redB).per;
  NOISE = Object.fromEntries(
    RATES.map((k) => [k, Math.sqrt((fullPair[k].raw ** 2 + redPair[k].raw ** 2) / 2)]),
  ) as Record<Rate, number>;
  console.log('sampling noise: ' + RATES.map((k) => `${k} ${NOISE![k].toFixed(3)}`).join('  '));
  if (HELD.size > 0) console.log(`held at master: ${[...HELD].join(', ')}`);

  const evaluate = (p: Params) => {
    apply(p);
    return agreement(full, measure(run, 'r'));
  };

  /*
   * The master vector must reproduce shipped behaviour exactly, or every number below is measured
   * against a model nobody ships. Asserted fight-for-fight rather than argued from the diff.
   */
  if (process.argv.includes('--verify')) {
    apply(MASTER);
    let same = 0;
    let diff = 0;
    for (const [an, bn] of CALIBRATION_MATCHUPS) {
      for (let i = 0; i < 60; i++) {
        const r = calibrationFighter(an);
        const b = calibrationFighter(bn);
        const cfg = {
          boutId: `v${i}`,
          seed: `verify:${an}:${bn}:${i}`,
          rounds: 3 as const,
          red: { fighter: r, plan: planFor(r, b) },
          blue: { fighter: b, plan: planFor(b, r) },
        };
        const key = (f: ReturnType<Resolver>) =>
          JSON.stringify([f.method, f.winnerId, f.round, f.stats.red, f.stats.blue]);
        if (key(shipped(cfg)) === key(run(cfg))) same++;
        else diff++;
      }
    }
    console.log(`variant at master: identical ${same}, different ${diff}`);
    rmSync(VARIANT, { force: true });
    if (diff > 0) process.exitCode = 1;
    return;
  }

  /*
   * The noise floor of the objective.
   *
   * Full measured against Full on a disjoint block of fights. Nothing about the model differs, so
   * whatever RMS this reports is what the *sample* contributes — and a fit that reaches it has
   * extracted everything the fixture set can say. Without this number a residual of 0.5 cannot be
   * told from a model that is wrong by 0.5, which is the difference between "refit the constants"
   * and "the functional form is wrong".
   */

  /*
   * Re-derive the finish conversion, the way it was originally derived.
   *
   * Per-corner, `conversion` is almost all sampling noise, so the joint objective carries no
   * information about `FINISH_FLOOR` and `FINISH_PER_DAMAGE` and they are held. That does not mean
   * they are right — `smotherer-v-striker` has Full producing 165 strike stoppages against
   * Reduced's 86 — it means the *ratio estimator* cannot see them. Pooling can.
   *
   * `round-profile.ts` solved `P(strike finish) = 1 - (1 - p)^knockdowns` for the per-knockdown
   * conversion Full achieves, then regressed `p` on damage per round. That inversion is biased
   * here: the calibration set is full of grapplers, so a great many fights end by submission
   * before the knockdowns that would have converted ever happen, and the expression has no term
   * for a competing risk.
   *
   * `finishes / knockdowns` has no such problem and needs no inversion. A fight stops at the first
   * knockdown the referee acts on, so the knockdowns are Bernoulli trials stopped at the first
   * success, and Wald's identity gives `E[finishes] = p x E[knockdowns]` exactly — whatever else
   * ends the fight, and whatever the round cap. Every corner contributes one point, weighted by
   * the knockdowns behind it.
   */
  if (process.argv.includes('--conversion')) {
    const pts: { x: number; p: number; w: number; label: string }[] = [];
    for (const row of fullRich) {
      if (row.kdPerFight < 0.05) continue;
      const p = row.strikeFinRate / row.kdPerFight;
      pts.push({ x: row.damagePerRound, p, w: row.kdPerFight, label: `${row.pair}/${row.corner}` });
    }
    pts.sort((a, b) => a.x - b.x);
    console.log('\nper-knockdown conversion Full achieves');
    for (const q of pts)
      console.log(
        `  ${q.label.padEnd(40)} dmg/r ${q.x.toFixed(1).padStart(6)}   p ${q.p.toFixed(3)}`,
      );
    const sw = pts.reduce((s, q) => s + q.w, 0);
    const mx = pts.reduce((s, q) => s + q.w * q.x, 0) / sw;
    const mp = pts.reduce((s, q) => s + q.w * q.p, 0) / sw;
    const slope =
      pts.reduce((s, q) => s + q.w * (q.x - mx) * (q.p - mp), 0) /
      pts.reduce((s, q) => s + q.w * (q.x - mx) ** 2, 0);
    const floor = mp - slope * mx;
    const ss = pts.reduce((s, q) => s + q.w * (q.p - mp) ** 2, 0);
    const rss = pts.reduce((s, q) => s + q.w * (q.p - (floor + slope * q.x)) ** 2, 0);
    console.log(
      `\n  fitted   FINISH_FLOOR ${floor.toFixed(4)}   FINISH_PER_DAMAGE ${slope.toFixed(6)}` +
        `   R2 ${(1 - rss / ss).toFixed(3)}   n ${pts.length}`,
    );
    console.log('  shipped  FINISH_FLOOR 0.042    FINISH_PER_DAMAGE 0.00477');
    rmSync(VARIANT, { force: true });
    return;
  }

  /*
   * Submissions, pooled across the set.
   *
   * Two separate quantities and they fail in the same direction, so a per-corner ratio cannot tell
   * them apart: how many attempts a position buys (`SUBMISSION_PER_CONTROL`) and how many attempts
   * become taps (`SUBMISSION_FINISH_RATE`). Pooling the numerators and denominators over the whole
   * set gives each one enough events to be worth a decimal place.
   */
  if (process.argv.includes('--submissions')) {
    apply(MASTER);
    measure(run, 'r');
    const redRich = rich;
    const sum = (rs: RichRow[], f: (r: RichRow) => number) => rs.reduce((s, r) => s + f(r), 0);
    for (const [label, rs] of [
      ['full', fullRich],
      ['reduced', redRich],
    ] as const)
      console.log(
        `  ${label.padEnd(8)} attempts/round ${(sum(rs, (r) => r.subAttPerRound) / rs.length).toFixed(3)}` +
          `   finishes/fight ${(sum(rs, (r) => r.subFinRate) / rs.length).toFixed(4)}` +
          `   finish per attempt ${((sum(rs, (r) => r.subFinRate) / sum(rs, (r) => r.subAttPerRound)) * 100).toFixed(2)}%`,
      );
    console.log('\n  per matchup (full -> reduced), attempts/round then finishes/fight');
    for (let i = 0; i < fullRich.length; i++) {
      const f = fullRich[i]!;
      const r = redRich[i]!;
      console.log(
        `  ${`${f.pair}/${f.corner}`.padEnd(40)} ` +
          `${f.subAttPerRound.toFixed(2)}->${r.subAttPerRound.toFixed(2)}   ` +
          `${f.subFinRate.toFixed(3)}->${r.subFinRate.toFixed(3)}`,
      );
    }
    rmSync(VARIANT, { force: true });
    return;
  }

  const checkAt = process.argv.indexOf('--check');
  const vector =
    checkAt >= 0 ? parse((process.argv[checkAt + 1] ?? '').split(',').map(Number)) : MASTER;

  if (process.argv.includes('--residuals')) {
    apply(vector);
    const red = measure(run, 'r');
    console.log('\nper-corner Reduced/Full ratio');
    console.log('  matchup/corner'.padEnd(42) + RATES.map((k) => k.padStart(11)).join(''));
    for (let i = 0; i < full.length; i++) {
      const f = full[i]!;
      const r = red[i]!;
      const cells = RATES.map((k) =>
        `${((r[k] + RATE_FLOOR[k]) / (f[k] + RATE_FLOOR[k])).toFixed(2)}x`.padStart(11),
      ).join('');
      console.log(`  ${`${f.pair}/${f.corner}`.padEnd(40)}${cells}`);
    }
    console.log('\nabsolute (full -> reduced)');
    for (let i = 0; i < full.length; i++) {
      const f = full[i]!;
      const r = red[i]!;
      console.log(
        `  ${`${f.pair}/${f.corner}`.padEnd(40)}` +
          RATES.map((k) => `${f[k].toFixed(3)}->${r[k].toFixed(3)}`.padStart(18)).join(''),
      );
    }
    rmSync(VARIANT, { force: true });
    return;
  }

  const baseline = report('master', full, (apply(MASTER), measure(run, 'r')));
  if (checkAt >= 0) {
    report(JSON.stringify(vector), full, (apply(vector), measure(run, 'r')));
    rmSync(VARIANT, { force: true });
    return;
  }
  if (!process.argv.includes('--fit')) {
    rmSync(VARIANT, { force: true });
    return;
  }

  /*
   * Two phases, because the failure this refit exists to fix is coupling and a coordinate method
   * cannot see it.
   *
   * A first attempt used coordinate descent and it did exactly what the compensating set does: it
   * moved `baseAttempts` up on the first sweep, then spent every later sweep paying for that with
   * the other eight — and finished worse than a run that never touched the volume terms at all.
   * One parameter at a time is how the set was built; it is not how it can be taken apart.
   *
   * So: a random scatter over the whole box to find basins, then a compass search that steps every
   * parameter from a common centre and only accepts a move that improves the whole objective.
   */
  const SCATTER = arg('--scatter', 500);
  const rand = (() => {
    let x = 12345;
    return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  })();

  // Scatter, keeping the whole leaderboard rather than only its top row.
  const scored: { p: Params; s: number }[] = [{ p: { ...MASTER }, s: baseline }];
  for (let i = 0; i < SCATTER; i++) {
    const p = parse(
      KEYS.map((k) =>
        HELD.has(k) ? MASTER[k] : BOUNDS[k][0] + rand() * (BOUNDS[k][1] - BOUNDS[k][0]),
      ),
    );
    scored.push({ p, s: evaluate(p).overall });
  }
  scored.sort((a, b) => a.s - b.s);
  console.log(`scatter best ${scored[0]!.s.toFixed(4)}, 8th ${scored[7]!.s.toFixed(4)}`);

  /*
   * Compass search from several starts, not one.
   *
   * A single start is what the previous version did, and on this surface it is a coin flip: two
   * runs of it landed on 0.341 and 0.359 with quite different vectors — `underneathScale` 1.72
   * against 1.02 — because the scatter's best point is not reliably in the best basin. Descending
   * from the top of the leaderboard *and* from master turns that into the best of nine tries.
   */
  const descend = (from: Params) => {
    let cur = { ...from };
    let curScore = evaluate(cur).overall;
    let step = 0.25;
    while (step > 0.004) {
      let improved = false;
      for (const k of KEYS) {
        if (HELD.has(k)) continue;
        const [lo, hi] = BOUNDS[k];
        for (const dir of [1, -1]) {
          const next = { ...cur, [k]: clampTo(cur[k] + dir * step * (hi - lo), lo, hi) };
          if (next[k] === cur[k]) continue;
          const sc = evaluate(next).overall;
          if (sc < curScore - 1e-5) {
            cur = next;
            curScore = sc;
            improved = true;
          }
        }
      }
      if (!improved) step /= 2;
    }
    return { p: cur, s: curScore };
  };

  const startAt = process.argv.indexOf('--start');
  const starts: Params[] = [
    ...(startAt >= 0 ? [parse((process.argv[startAt + 1] ?? '').split(',').map(Number))] : []),
    { ...MASTER },
    ...scored.slice(0, 8).map((x) => x.p),
  ];
  let best = { ...MASTER };
  let bestScore = baseline;
  for (const [i, from] of starts.entries()) {
    const r = descend(from);
    console.log(`  start ${i}: ${r.s.toFixed(4)}`);
    if (r.s < bestScore) {
      best = r.p;
      bestScore = r.s;
    }
  }

  console.log(`\nbaseline ${baseline.toFixed(3)}  ->  fitted ${bestScore.toFixed(3)}`);
  console.log(KEYS.map((k) => Number(best[k].toPrecision(4))).join(','));
  console.log(JSON.stringify(best, null, 2));
  report('fitted', full, (apply(best), measure(run, 'r')));
  rmSync(VARIANT, { force: true });
}

const clampTo = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

void main().finally(() => rmSync(VARIANT, { force: true }));
