/**
 * Year-one cash growth for each autopilot policy over several worlds: the table the promoter
 * economy is tuned against (`tests/long-sim/promoter-economy.test.ts` pins it).
 *
 *   npx vite-node tools/economy-policies.ts [seeds]
 */

import type { Promotion } from '@mmasim/engine';
import { generateWorld } from '../packages/app/src/game/newWorld';
import { runAutopilot, takeTopRegional, type AutopilotPolicy } from '../tests/helpers/autopilot';

const SEEDS = Number(process.argv[2] ?? 6);
const POLICIES: AutopilotPolicy[] = ['idle', 'sloppy', 'sensible'];

for (let i = 0; i < SEEDS; i++) {
  const seed = `economy-${String.fromCharCode(97 + i)}`;
  const row: string[] = [];
  for (const policy of POLICIES) {
    const db = await generateWorld({ size: 'small', seed, yieldToUi: async () => {} });
    const player = takeTopRegional(db);
    const start = player.budget;
    const cards = runAutopilot({ db, promotionId: player.id as string, policy, days: 365 });
    const end = (db.promotions.findById(player.id as string) as unknown as Promotion).budget;
    const profits = cards.map((c) => c.profit);
    row.push(
      `${policy} ${(((end - start) / start) * 100).toFixed(1)}% (start ${start}, ` +
        `cards ${profits.join('/')})`,
    );
  }
  console.log(seed, row.join(' | '));
}
