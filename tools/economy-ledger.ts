/**
 * Where each promotion's money goes, a year at a time, with nobody playing.
 *
 * For every promotion: cards run, what those cards netted, what the overheads cost, and the cash
 * at the end of the year. The question it answers is whether a promotion's schedule pays for its
 * organisation — the balance doc 34's B1 tuned overheads against.
 *
 *   npx vite-node tools/economy-ledger.ts [years] [era|generated-size] [seed]
 */

import { createNewGame, getWorld, type GameDb, type WorldSize } from '@mmasim/data';
import {
  periodCosts,
  type FightNight,
  type Fighter,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { generateWorld } from '../packages/app/src/game/newWorld';
import { advanceWorld } from '../packages/app/src/game/world';

const YEARS = Number(process.argv[2] ?? 3);
const WORLD = process.argv[3] ?? '2026';
const SEED = process.argv[4] ?? 'ledger';

const db: GameDb =
  WORLD === '2026' || WORLD === '2020'
    ? createNewGame({ adapter: undefined, era: WORLD, seed: SEED })
    : await generateWorld({ size: WORLD as WorldSize, seed: SEED, yieldToUi: async () => {} });

const promotions = () => db.promotions.findAll() as unknown as Promotion[];
const roster = (p: Promotion) =>
  (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === p.id && f.retiredDay === undefined,
  ).length;
const anchor = (db.fighters.findAll() as Fighter[])[0]!.id;

for (let year = 0; year < YEARS; year++) {
  const from = getWorld(db).day;
  const cash = new Map(promotions().map((p) => [p.id as string, p.budget]));
  const overheads = new Map(
    promotions().map((p) => [
      p.id as string,
      Math.round((periodCosts({ promotion: p, rosterSize: roster(p) }).total * 365) / 14),
    ]),
  );
  advanceWorld(db, from, from + 365, anchor);
  db.world.upsert({ ...getWorld(db), day: from + 365 } as never);

  const nights = (db.events.findAll() as FightNight[]).filter(
    (n) => n.day >= from && n.day < from + 365,
  );
  console.log(`YEAR ${year + 1}`);
  for (const p of promotions()
    .sort((a, b) => b.prestige - a.prestige)
    .slice(0, 14)) {
    const before = cash.get(p.id as string)!;
    const cost = overheads.get(p.id as string)!;
    const cards = nights.filter((n) => n.promotionId === p.id).length;
    const netCards = p.budget - before + cost;
    const deals = (db.agreements.findAll() as readonly PromotionalAgreement[]).filter(
      (a) => a.promotionId === p.id,
    );
    const avgShow = deals.reduce((t, a) => t + a.showPurse, 0) / Math.max(1, deals.length);
    const mine = nights.filter((n) => n.promotionId === p.id);
    const bouts = mine.reduce((t, n) => t + n.bouts.length, 0) / Math.max(1, mine.length);
    const titles = mine.reduce((t, n) => t + n.bouts.filter((b) => b.isTitleFight).length, 0);
    console.log(
      `  ${p.shortName.padEnd(6)} ${p.tier.padEnd(13)} p${p.prestige} roster ${roster(p)} cards ${cards} ` +
        `cards net ${Math.round(netCards)} (${cards ? Math.round(netCards / cards) : 0}/card) ` +
        `overheads ${cost} show≈${avgShow.toFixed(1)} bouts ${bouts.toFixed(1)} titles ${titles} cash ${Math.round(before)}→${Math.round(p.budget)} buzz ${p.buzz}`,
    );
  }
}
