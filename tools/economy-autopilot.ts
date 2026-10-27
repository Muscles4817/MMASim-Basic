/**
 * The promoter economy, measured by an autopilot.
 *
 * Generates a world, hands the autopilot its strongest regional promotion, and prints every card
 * it runs and, each year, how the rest of the sport's cash and attention moved by tier. This is
 * the measurement doc 34's B1 was tuned against; `tests/long-sim/promoter-economy.test.ts` pins
 * the result.
 *
 *   npx vite-node tools/economy-autopilot.ts [years] [policy] [seed] [size]
 *
 * `policy` is `sloppy` (pays every counter) or `sensible` (turns them down and refills).
 */

import { createNewGame, getWorld, type WorldSize } from '@mmasim/data';
import type { Promotion } from '@mmasim/engine';
import { generateWorld } from '../packages/app/src/game/newWorld';
import { runOneCard, takeTopRegional, type AutopilotPolicy } from '../tests/helpers/autopilot';

const YEARS = Number(process.argv[2] ?? 2);
const POLICY = (process.argv[3] ?? 'sloppy') as AutopilotPolicy;
const SEED = process.argv[4] ?? 'audit';
/** A generated world's size, or `2026` for the hand-authored era. */
const SIZE = (process.argv[5] ?? 'small') as WorldSize | '2026';

const db =
  SIZE === '2026'
    ? createNewGame({ adapter: undefined, era: '2026', seed: SEED })
    : await generateWorld({ size: SIZE, seed: SEED, yieldToUi: async () => {} });
const promotions = () => db.promotions.findAll() as unknown as Promotion[];
const player = takeTopRegional(db);
const startCash = new Map(promotions().map((p) => [p.id as string, p.budget]));
const start = getWorld(db).day;

const median = (xs: readonly number[]) =>
  xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

function bySport(): string {
  return (['global', 'major', 'regional', 'developmental'] as const)
    .map((tier) => {
      const ps = promotions().filter((p) => p.tier === tier && p.id !== player.id);
      if (ps.length === 0) return '';
      const cash = ps.map((p) => p.budget / Math.max(1, startCash.get(p.id as string)!));
      const buzz = ps.map((p) => p.buzz);
      return (
        `  ${tier} (${ps.length}): cash× ${Math.min(...cash).toFixed(2)} / ${median(cash).toFixed(2)} / ` +
        `${Math.max(...cash).toFixed(2)}, shrinking ${cash.filter((c) => c < 1).length}, ` +
        `broke ${ps.filter((p) => p.budget <= 0).length}, buzz ${Math.min(...buzz)} / ` +
        `${median(buzz)} / ${Math.max(...buzz)}`
      );
    })
    .filter(Boolean)
    .join('\n');
}

console.log(
  `${player.name}: prestige ${player.prestige}, cash ${player.budget}k, buzz ${player.buzz}`,
);
console.log(bySport());

let year = 0;
for (let n = 1; getWorld(db).day < start + YEARS * 365; n++) {
  const card = runOneCard({ db, promotionId: player.id as string, policy: POLICY });
  console.log(
    `card ${n}: ${card.agreed}/${card.slots} signed, ${card.paid}/${card.countered} counters paid, forecast ${card.forecast} (empty ${card.emptyForecast}), ` +
      `profit ${card.profit}, crowd ${card.attendance}, buzz ${card.buzz}, cash ${card.cash}`,
  );
  const reached = Math.floor((getWorld(db).day - start) / 365);
  if (reached > year) {
    year = reached;
    console.log(
      `YEAR ${year}: player cash× ${(card.cash / startCash.get(player.id as string)!).toFixed(3)}`,
    );
    console.log(bySport());
  }
}
