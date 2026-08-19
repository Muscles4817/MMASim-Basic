/**
 * How long does pre-history need to be?
 *
 * Doc 27 § 10.3's fourth lever, and the one that is arithmetic rather than engineering — which
 * makes it the one most likely to be picked by guessing. Fifteen years was chosen so that "a
 * 35-year-old at the start date has a full career behind them", and that reason turns out not to
 * hold: `generateFighter` already gives everybody a synthetic `priorRecord` of roughly
 * `(age - 20) × 2` bouts, so the deep past is covered whatever this number is.
 *
 * What pre-history actually has to produce is the part a player can *look at*: champions with
 * reigns behind them, rankings that came from results, rivalries with fights in them, and an apex
 * roster somebody climbed to rather than one that was generated in place. This measures those
 * against the clock.
 *
 *   npx vite-node tools/prehistory-length.ts
 *   SCALE=6 LENGTHS=4,8,12 npx vite-node tools/prehistory-length.ts
 */

import { advanceWorld } from '../packages/app/src/game/world';
import { createNewGame, getWorld } from '@mmasim/data';
import { overallRating, resolveFightByRound, type Fighter, type Promotion } from '@mmasim/engine';
import { buildScaledWorld } from './scaled-world';
import { buildPyramidWorld } from './pyramid-world';

const SCALE = Number(process.env.SCALE ?? 6);
const LENGTHS = (process.env.LENGTHS ?? '4,6,8,10,12,15').split(',').map(Number);
/** Below this prestige a promotion's fights are resolved from ratings. See doc 27 § 10.4. */
const STATISTICAL_BELOW = Number(process.env.STAT_BELOW ?? 40);
/** Build a doc 26 § 2.2-shaped pyramid instead of a scaled copy of the shipped world. */
const PYRAMID = process.env.PYRAMID === '1';

interface Shape {
  seconds: number;
  fights: number;
  /** Mean bouts in the *simulated* record — what the player can open and read. */
  meanRecord: number;
  /** Share of active fighters with enough real bouts for rivalries and rematch cooldowns. */
  withRealHistory: number;
  /** Share of the apex roster who joined it during pre-history rather than starting there. */
  climbed: number;
  /** Belts whose current holder won them during pre-history. */
  earnedBelts: number;
  totalBelts: number;
  meanOverall: number;
  active: number;
}

function run(years: number): Shape {
  const db = PYRAMID
    ? buildPyramidWorld(SCALE * 850)
    : SCALE <= 1
      ? createNewGame({ era: '2026', seed: 'length' })
      : buildScaledWorld(SCALE);
  const start = getWorld(db).day;

  const apex = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  const startedAtApex = new Set(
    (db.fighters.findAll() as Fighter[])
      .filter((f) => f.promotionId === apex.id)
      .map((f) => f.id as string),
  );

  let fights = 0;
  const began = performance.now();
  for (let year = 0; year < years; year++) {
    fights += advanceWorld(db, start + year * 365, start + (year + 1) * 365, {
      resolve: resolveFightByRound,
      detail: 'bulk',
      statisticalBelowPrestige: STATISTICAL_BELOW,
    }).fights;
  }
  const seconds = (performance.now() - began) / 1000;

  const active = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
  const apexRoster = active.filter((f) => f.promotionId === apex.id);
  const promotions = db.promotions.findAll() as unknown as Promotion[];

  let totalBelts = 0;
  let earnedBelts = 0;
  for (const p of promotions) {
    for (const championId of Object.values(p.champions)) {
      if (!championId) continue;
      totalBelts++;
      const champion = active.find((f) => f.id === championId);
      // Won here, during pre-history, rather than holding it since the world was built.
      if (champion?.record.some((r) => r.wasTitleFight && r.outcome === 'win')) earnedBelts++;
    }
  }

  return {
    seconds,
    fights,
    meanRecord: active.reduce((t, f) => t + f.record.length, 0) / active.length,
    withRealHistory: active.filter((f) => f.record.length >= 5).length / active.length,
    climbed:
      apexRoster.length === 0
        ? 0
        : apexRoster.filter((f) => !startedAtApex.has(f.id as string)).length / apexRoster.length,
    earnedBelts,
    totalBelts,
    meanOverall: active.reduce((t, f) => t + overallRating(f.attributes), 0) / active.length,
    active: active.length,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(6);
console.log(
  `pre-history length, scale x${SCALE} (statistical below prestige ${STATISTICAL_BELOW})\n`,
);
console.log(
  [
    'years',
    'seconds',
    'fights',
    'active',
    'record',
    '5+bouts',
    'climbed',
    'belts won',
    'overall',
  ].join('\t'),
);
for (const years of LENGTHS) {
  const s = run(years);
  console.log(
    [
      String(years).padStart(5),
      s.seconds.toFixed(1).padStart(7),
      String(s.fights).padStart(6),
      String(s.active).padStart(6),
      s.meanRecord.toFixed(1).padStart(6),
      pct(s.withRealHistory),
      pct(s.climbed),
      `${s.earnedBelts}/${s.totalBelts}`.padStart(9),
      s.meanOverall.toFixed(1).padStart(7),
    ].join('\t'),
  );
}
