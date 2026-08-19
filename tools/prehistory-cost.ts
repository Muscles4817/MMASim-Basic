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
import { buildDepthFighters, createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  asFighterId,
  asPromotionId,
  resolveFightByRound,
  simulateFight,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';

const YEARS = Number(process.env.YEARS ?? 15);
/** Multiples of the shipped 2026 world's regional tier. 1 = as shipped. */
const SCALES = (process.env.SCALES ?? '1,3,6').split(',').map(Number);

/**
 * A world `scale` times the size of the shipped one.
 *
 * Grown by adding *promotions*, not by inflating existing rosters, because that is how the real
 * sport gets bigger and because it is the growth that actually costs: a promotion runs cards, and
 * cards are where matchmaking, ranking and fights all happen. Inflating a roster in place would
 * have measured a bigger number doing the same amount of work.
 */
function buildWorld(scale: number): GameDb {
  const db = createNewGame({ era: '2026', seed: `prehistory:${scale}` });
  if (scale <= 1) return db;

  const base = db.promotions.findAll() as unknown as Promotion[];
  // Everything below the top two: the tail is where a real pyramid gets wide.
  const templates = base.filter((p) => p.tier !== 'global').slice(0, 6);
  const added: Promotion[] = [];
  const targets: {
    promotionId: string;
    mens: number;
    womens: number;
    tier: number;
    spread: number;
  }[] = [];

  for (let copy = 1; copy < scale; copy++) {
    for (const [index, template] of templates.entries()) {
      const id = `${template.id}_x${copy}_${index}`;
      added.push({
        ...template,
        id: asPromotionId(id),
        name: `${template.name} ${copy + 1}`,
        shortName: `${template.shortName}${copy + 1}`,
        champions: {},
      });
      targets.push({ promotionId: id, mens: 8, womens: 0, tier: 34 - index, spread: 12 });
    }
  }

  db.promotions.upsertMany(added as never[]);

  const existing = db.fighters.findAll() as Fighter[];
  const depth = buildDepthFighters({
    targets,
    existing,
    day: getWorld(db).day,
    seed: `prehistory:${scale}`,
  }).map((f, i) => ({ ...f, id: asFighterId(`${f.id}_s${scale}_${i}`) }));
  db.fighters.upsertMany(depth as never[]);

  // `replenish` tops divisions back up to whatever shape the world started in, so the shape has
  // to be recomputed or a scaled world quietly shrinks back to the shipped one.
  const divisionTargets: Record<string, number> = {};
  for (const row of db.fighters.findAll()) {
    const f = row as { divisionId?: string; retiredDay?: number };
    if (!f.divisionId || f.retiredDay !== undefined) continue;
    divisionTargets[f.divisionId] = (divisionTargets[f.divisionId] ?? 0) + 1;
  }
  setWorld(db, { divisionTargets });
  return db;
}

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

function run(scale: number, resolver: 'full' | 'reduced'): Run {
  const db = buildWorld(scale);
  const start = getWorld(db).day;
  const fightersStart = (db.fighters.findAll() as Fighter[]).length;
  const resolve = resolver === 'reduced' ? resolveFightByRound : simulateFight;

  /*
   * A schedule the world can actually fill, rather than the shipped constant.
   *
   * `MAX_CARDS_PER_STEP` is 3 for the eight promotions the game ships with. Left alone, a
   * thirty-eight-promotion world runs the same seventy-eight cards a year and each promotion gets
   * two of them — so scaling the population would have measured a bigger world doing identical
   * work, which is the exact mistake this harness exists to avoid. Three cards per eight
   * promotions, held constant.
   */
  const promotions = (db.promotions.findAll() as unknown as Promotion[]).length;
  const cardsPerStep = Math.max(3, Math.round((promotions / 8) * 3));

  let fights = 0;
  let firstYear = 0;
  let lastYear = 0;
  const began = performance.now();
  for (let year = 0; year < YEARS; year++) {
    const from = start + year * 365;
    const yearBegan = performance.now();
    fights += advanceWorld(db, from, from + 365, { resolve, cardsPerStep }).fights;
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

console.log(`${YEARS} years of pre-history, per world size.\n`);
console.log(
  [
    'scale',
    'promos',
    'fighters',
    'end',
    'resolver',
    'fights',
    'total s',
    'ms/year',
    'yr1 s',
    'yrN s',
  ].join('\t'),
);

for (const scale of SCALES) {
  for (const resolver of ['full', 'reduced'] as const) {
    const r = run(scale, resolver);
    console.log(
      [
        `x${scale}`,
        r.promotions,
        r.fightersStart,
        r.fightersEnd,
        resolver.padEnd(8),
        r.fights,
        r.seconds.toFixed(2),
        ((r.seconds * 1000) / YEARS).toFixed(0),
        r.firstYear.toFixed(2),
        r.lastYear.toFixed(2),
      ].join('\t'),
    );
  }
}
