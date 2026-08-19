/**
 * How many cards each promotion actually runs in a simulated year.
 *
 * The number nobody had looked at. `pickPromotion` weights a global draw by prestige, which is a
 * *lottery* rather than a schedule — so a promotion's calendar depends on who else exists in the
 * world, and the sport's total card count is a constant however big the pyramid gets.
 */
import { advanceWorld } from '../packages/app/src/game/world';
import { createNewGame, getWorld } from '@mmasim/data';
import { buildScaledWorld } from './scaled-world';
import type { Promotion } from '@mmasim/engine';

const YEARS = Number(process.env.YEARS ?? 5);

const SCALES = (process.env.SCALES ?? '1').split(',').map(Number);

for (const scale of SCALES) {
  const db =
    scale <= 1 ? createNewGame({ era: '2026', seed: 'schedule' }) : buildScaledWorld(scale);
  const start = getWorld(db).day;
  for (let y = 0; y < YEARS; y++) advanceWorld(db, start + y * 365, start + (y + 1) * 365, {});

  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const events = db.events.findAll() as unknown as { promotionId: string }[];
  const byPromotion = new Map<string, number>();
  for (const e of events) byPromotion.set(e.promotionId, (byPromotion.get(e.promotionId) ?? 0) + 1);

  console.log(
    `\nscale x${scale}: ${promotions.length} promotions, ${YEARS} years, ` +
      `${events.length} cards (${(events.length / YEARS).toFixed(0)}/yr)\n`,
  );
  console.log(['promotion'.padEnd(12), 'tier'.padEnd(14), 'prestige', 'cards/yr'].join('\t'));
  for (const p of [...promotions].sort((a, b) => b.prestige - a.prestige).slice(0, 10)) {
    console.log(
      [
        p.shortName.padEnd(12),
        p.tier.padEnd(14),
        String(p.prestige).padStart(8),
        ((byPromotion.get(p.id as string) ?? 0) / YEARS).toFixed(1).padStart(8),
      ].join('\t'),
    );
  }
}
