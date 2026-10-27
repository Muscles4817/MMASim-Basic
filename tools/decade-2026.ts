/**
 * Ten years of the 2026 era with nobody playing: each promotion's cash, staff level and cards a
 * year. What `promotion-costs.test.ts` holds to "the sport can still afford itself".
 *
 *   npx vite-node tools/decade-2026.ts [seed]
 */

import { createNewGame } from '@mmasim/data';
import { staffLevel, type FightNight, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../packages/app/src/game/world';

const db = createNewGame({ adapter: undefined, era: '2026', seed: process.argv[2] ?? 'economy-a' });
const player = (db.fighters.findAll() as Fighter[])[0]!;
const START = 2192;
for (let year = 0; year < 10; year++) {
  advanceWorld(db, START + year * 365, START + (year + 1) * 365, player.id);
  const nights = db.events.findAll() as FightNight[];
  const row = (db.promotions.findAll() as unknown as Promotion[])
    .map((p) => {
      const cards = nights.filter(
        (n) => n.promotionId === p.id && n.day >= START + year * 365,
      ).length;
      return `${p.shortName} ${Math.round(p.budget)} L${staffLevel(p)} c${cards}`;
    })
    .join(' | ');
  console.log(`Y${year + 1}: ${row}`);
}
