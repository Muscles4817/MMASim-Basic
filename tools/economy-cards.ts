/**
 * What a matchmaker-filled card is worth to every promotion in a world, on day one.
 *
 * For each promotion: the card the matchmaker would fill, its purses, its headline draw, the
 * crowd and the forecast profit, beside a year of the promotion's overheads. The quickest way to
 * see whether the money works at every level of the sport before a single night is run.
 *
 *   npx vite-node tools/economy-cards.ts [2026|small|medium|large] [seed]
 */

import { createNewGame, getWorld, type GameDb, type WorldSize } from '@mmasim/data';
import { periodCosts, type Fighter, type Promotion } from '@mmasim/engine';
import { generateWorld } from '../packages/app/src/game/newWorld';
import {
  applySuggestion,
  createPlan,
  forecastPlan,
  promoterContext,
  suggestFills,
} from '../packages/app/src/game/plans';

const WORLD = process.argv[2] ?? '2026';
const SEED = process.argv[3] ?? 'cards';

const db: GameDb =
  WORLD === '2026'
    ? createNewGame({ adapter: undefined, era: '2026', seed: SEED })
    : await generateWorld({ size: WORLD as WorldSize, seed: SEED, yieldToUi: async () => {} });

const day = getWorld(db).day;
const all = (db.promotions.findAll() as unknown as Promotion[]).sort(
  (a, b) => b.prestige - a.prestige,
);
for (const promotion of all.slice(0, 16)) {
  const ctx = promoterContext({ db, promotion, day });
  let plan = createPlan({ db, promotion, day: day + 56 });
  for (const s of suggestFills({ ctx, plan, scope: 'all' })) plan = applySuggestion(plan, s);
  const fc = forecastPlan({ ctx, plan });
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
  ).length;
  const overheads = Math.round((periodCosts({ promotion, rosterSize: roster }).total * 365) / 14);
  console.log(
    `${promotion.shortName.padEnd(6)} ${promotion.tier.padEnd(13)} p${promotion.prestige} buzz ${promotion.buzz} ` +
      `cash ${promotion.budget} bouts ${fc.bouts} purses ${fc.purses} draw ${fc.headlineDraw} ` +
      `crowd ${fc.expectedAttendance} profit ${fc.projectedProfit} overheads/yr ${overheads}`,
  );
}
