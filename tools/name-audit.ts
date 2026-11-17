/**
 * How repetitive is a generated roster's naming?
 *
 * Prints, for one generated world: how many full names, surnames and first names repeat, the
 * most-worn of each, how many fighters carry a nickname, the most-worn nicknames across the whole
 * sport, and how much of each nationality's pool is actually in use. The question it answers is the
 * one a player asks scrolling a roster — "haven't I seen this guy before?" — so it counts across
 * the world, not per division.
 *
 *   npx vite-node tools/name-audit.ts
 *   SIZE=large SEED=other npx vite-node tools/name-audit.ts
 */

import { NAME_POOLS, type Fighter } from '@mmasim/engine';
import { generateWorld } from '../packages/app/src/game/newWorld';

const SIZE = (process.env.SIZE ?? 'medium') as 'small' | 'medium' | 'large';
const SEED = process.env.SEED ?? 'name-audit';

const db = await generateWorld({ size: SIZE, seed: SEED });
const fighters = db.fighters.findAll() as Fighter[];
const active = fighters.filter((f) => f.retiredDay === undefined);

function tally(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function report(label: string, values: readonly string[], top = 8): void {
  const counts = tally(values);
  const repeated = counts.filter(([, n]) => n > 1);
  const inRepeats = repeated.reduce((sum, [, n]) => sum + n, 0);
  console.log(
    `\n${label}: ${counts.length} distinct across ${values.length}; ${repeated.length} repeated, ` +
      `worn by ${inRepeats} (${((inRepeats / Math.max(1, values.length)) * 100).toFixed(1)}%)`,
  );
  console.log('  most worn: ' + counts.slice(0, top).map(([v, n]) => `${v} ×${n}`).join(', '));
}

console.log(`${SIZE} world, seed "${SEED}": ${fighters.length} fighters, ${active.length} active`);
report('Full names', fighters.map((f) => `${f.firstName} ${f.lastName}`));
report('Surnames', fighters.map((f) => f.lastName));
report('First names', fighters.map((f) => f.firstName));

const nicknamed = active.filter((f) => f.nickname);
console.log(
  `\nNicknamed: ${nicknamed.length} of ${active.length} active ` +
    `(${((nicknamed.length / active.length) * 100).toFixed(1)}%)`,
);
report('Nicknames (whole sport, active)', nicknamed.map((f) => f.nickname!), 12);

console.log('\nPool use by nationality (fighters / male+female+surnames):');
for (const pool of NAME_POOLS) {
  const n = fighters.filter((f) => f.nationality === pool.nationality).length;
  console.log(
    `  ${pool.nationality.padEnd(12)} ${String(n).padStart(4)} fighters · ` +
      `${pool.male.length}m ${pool.female.length}f ${pool.surnames.length}s`,
  );
}
