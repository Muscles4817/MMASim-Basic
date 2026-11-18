/**
 * What each attribute is worth at a fixed budget, in game-planned fights.
 *
 * One attribute moved ±24 against an even spread of the other fourteen (the orthogonal cohort of
 * `functional-rating.test.ts`), each fighting a uniformly rated opponent of the same level with both
 * corners planned. Marginal = win rate at +24 minus win rate at −24, in points. Against one balanced
 * opponent rather than a round robin, so it is cheap and its noise is known: at N=600 per side the
 * standard error of a marginal is about 2.9 points.
 *
 * `--no-tax` instead moves one attribute ±12 on its own (the mean moves with it), which asks the
 * question a player training it asks: is more of this ever worse?
 *
 * Run: npx vite-node tools/audit/attribute-economy.ts [--n 600] [--levels 52,70] [--no-tax] [keys...]
 */
import {
  ATTRIBUTE_KEYS,
  makeFighter,
  planFor,
  simulateFight,
  type AttributeKey,
  type Attributes,
  type Fighter,
} from '@mmasim/engine';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1]!;
};
const N = Number(arg('--n', '600'));
const LEVELS = arg('--levels', '52,70').split(',').map(Number);
const named = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && !['--n', '--levels'].includes(all[i - 1] ?? ''));
const KEYS = (named.length ? named : ATTRIBUTE_KEYS) as readonly AttributeKey[];

/** `--no-tax`: move the attribute alone, so the mean moves with it. Is more of it ever worse? */
const NO_TAX = process.argv.includes('--no-tax');

function shaped(level: number, key: AttributeKey | undefined, sign: number): Attributes {
  const attrs = {} as Attributes;
  if (NO_TAX) {
    for (const k of ATTRIBUTE_KEYS) attrs[k] = level;
    if (key) attrs[key] = level + sign * 12;
    return attrs;
  }
  for (const k of ATTRIBUTE_KEYS) attrs[k] = level + (key ? Math.round(-sign * (24 / 14)) : 0);
  if (key) attrs[key] = level + sign * 24;
  // Hold the mean exactly.
  let drift = ATTRIBUTE_KEYS.reduce((a, k) => a + attrs[k], 0) - level * ATTRIBUTE_KEYS.length;
  for (const k of ATTRIBUTE_KEYS) {
    if (drift === 0) break;
    if (k === key) continue;
    const step = drift > 0 ? -1 : 1;
    attrs[k] += step;
    drift += step;
  }
  return attrs;
}

function rate(a: Fighter, b: Fighter, tag: string): number {
  let w = 0;
  let n = 0;
  for (let i = 0; i < N; i++) {
    const seed = `${tag}-${i}`;
    // Alternate corners so neither side owns red.
    const [red, blue] = i % 2 ? [a, b] : [b, a];
    const r = simulateFight({
      boutId: seed,
      seed,
      rounds: 3,
      red: { fighter: red, plan: planFor(red, blue) },
      blue: { fighter: blue, plan: planFor(blue, red) },
    });
    n++;
    if (r.winnerId === a.id) w++;
    else if (!r.winnerId) w += 0.5;
  }
  return w / n;
}

const rows: { key: AttributeKey; values: number[] }[] = [];
for (const key of KEYS) {
  const values: number[] = [];
  for (const level of LEVELS) {
    const opp = makeFighter({
      id: `econ-opp-${level}`,
      lastName: 'Opp',
      attributes: shaped(level, undefined, 0),
    });
    const up = makeFighter({
      id: `econ-${key}-up`,
      lastName: 'Up',
      attributes: shaped(level, key, 1),
    });
    const down = makeFighter({
      id: `econ-${key}-dn`,
      lastName: 'Dn',
      attributes: shaped(level, key, -1),
    });
    values.push(
      100 * (rate(up, opp, `econ:${key}:${level}:up`) - rate(down, opp, `econ:${key}:${level}:dn`)),
    );
  }
  rows.push({ key, values });
}
rows.sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0));
console.log(`marginal win-rate points of ±24 (N=${N}/side, levels ${LEVELS.join(', ')}):`);
for (const r of rows) {
  const mean = r.values.reduce((a, b) => a + b, 0) / r.values.length;
  console.log(
    `  ${r.key.padEnd(16)} ${mean.toFixed(1).padStart(6)}   [${r.values.map((v) => v.toFixed(1)).join(', ')}]`,
  );
}
