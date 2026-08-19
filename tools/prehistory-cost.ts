/**
 * What fifteen years of pre-history actually costs.
 *
 * Doc 27 § 4 wants generated worlds to earn their records by *simulating* them rather than
 * authoring them, and § 9 measured the piece everyone assumes is the expensive one — the fight.
 * It is not. A simulated year of the shipped world runs 609 fights at 650µs each, which is 395ms
 * of a 2211ms year: **fights are 14% of a tick.** Making them nine times cheaper cannot move a
 * number that is 86% something else.
 *
 * So this measures the whole thing, at three population sizes, with both resolvers. What comes out
 * is the answer to the only question that matters for § 7's world-creation budget: how many seconds
 * does a player wait at the "creating your world" spinner, and does the cheap resolver change it.
 *
 *   npx vite-node tools/prehistory-cost.ts
 *   YEARS=5 SCALES=1,4 npx vite-node tools/prehistory-cost.ts
 */

import { advanceWorld } from '../packages/app/src/game/world';
import { createNewGame, getWorld } from '@mmasim/data';
import { resolveFightByRound, simulateFight, type Fighter, type Promotion } from '@mmasim/engine';
import { buildScaledWorld } from './scaled-world';
import { buildPyramidWorld, describePyramid } from './pyramid-world';

const YEARS = Number(process.env.YEARS ?? 15);
/** Multiples of the shipped 2026 world's regional tier. 1 = as shipped. */
const SCALES = (process.env.SCALES ?? '1,3,6').split(',').map(Number);
/** Build a doc 26 § 2.2-shaped pyramid instead of a scaled copy of the shipped world. */
const PYRAMID = process.env.PYRAMID === '1';
/** Below this prestige, resolve from ratings. Only meaningful in a bulk run. */
const STAT_BELOW = Number(process.env.STAT_BELOW ?? 40);

interface Run {
  seconds: number;
  /** Seconds for the first year and the last, so a cost that grows with the records shows up. */
  firstYear: number;
  lastYear: number;
  fights: number;
  fightersStart: number;
  fightersEnd: number;
  promotions: number;
}

type Mode = 'full' | 'reduced' | 'bulk' | 'bulk+stat';

function run(scale: number, mode: Mode): Run {
  const db = PYRAMID
    ? buildPyramidWorld(scale * 850)
    : scale <= 1
      ? createNewGame({ era: '2026', seed: 'prehistory:1' })
      : buildScaledWorld(scale);
  if (PYRAMID && mode === MODES[0]) console.log(`  ${describePyramid(db)}`);
  const start = getWorld(db).day;
  const fightersStart = (db.fighters.findAll() as Fighter[]).length;
  const resolve = mode === 'full' ? simulateFight : resolveFightByRound;
  const detail = mode === 'full' || mode === 'reduced' ? undefined : ('bulk' as const);
  const statisticalBelowPrestige = mode === 'bulk+stat' ? STAT_BELOW : undefined;

  let fights = 0;
  let firstYear = 0;
  let lastYear = 0;
  const began = performance.now();
  for (let year = 0; year < YEARS; year++) {
    const from = start + year * 365;
    const yearBegan = performance.now();
    fights += advanceWorld(db, from, from + 365, {
      resolve,
      detail,
      statisticalBelowPrestige,
    }).fights;
    const took = (performance.now() - yearBegan) / 1000;
    if (year === 0) firstYear = took;
    lastYear = took;
  }
  const seconds = (performance.now() - began) / 1000;

  const alive = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
  return {
    seconds,
    firstYear,
    lastYear,
    fights,
    fightersStart,
    fightersEnd: alive.length,
    promotions: (db.promotions.findAll() as unknown as Promotion[]).length,
  };
}

console.log(
  `${YEARS} years of pre-history, per world size.${PYRAMID ? ` Pyramid shape, statistical below prestige ${STAT_BELOW}.` : ''}\n`,
);
console.log(
  [
    'scale',
    'promos',
    'fighters',
    'end',
    'mode'.padEnd(10),
    'fights',
    'total s',
    'ms/year',
    'yr1 s',
    'yrN s',
  ].join('\t'),
);

const MODES = (process.env.MODES ?? 'full,reduced,bulk,bulk+stat').split(',') as Mode[];

for (const scale of SCALES) {
  for (const resolver of MODES) {
    const r = run(scale, resolver);
    console.log(
      [
        `x${scale}`,
        r.promotions,
        r.fightersStart,
        r.fightersEnd,
        resolver.padEnd(10),
        r.fights,
        r.seconds.toFixed(2),
        ((r.seconds * 1000) / YEARS).toFixed(0),
        r.firstYear.toFixed(2),
        r.lastYear.toFixed(2),
      ].join('\t'),
    );
  }
}
