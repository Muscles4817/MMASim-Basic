/**
 * A generated world several times the size of the one the game ships with.
 *
 * Shared by `prehistory-cost.ts` and `schedule-shape.ts`, which ask different questions of the
 * same thing: how long does it take to simulate, and does anybody get a sensible calendar out of
 * it. A stand-in for doc 27 § 6's real generator, which does not exist yet — it grows the pyramid
 * by cloning the tail rather than by drawing promotions from a talent map, which is enough to
 * measure cost and schedule shape and is not enough to play.
 */

import { buildDepthFighters, createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import { asFighterId, asPromotionId, type Fighter, type Promotion } from '@mmasim/engine';

/**
 * A world `scale` times the size of the shipped one.
 *
 * Grown by adding *promotions*, not by inflating existing rosters, because that is how the real
 * sport gets bigger and because it is the growth that actually costs: a promotion runs cards, and
 * cards are where matchmaking, ranking and fights all happen. Inflating a roster in place would
 * have measured a bigger number doing the same amount of work.
 */
export function buildScaledWorld(scale: number): GameDb {
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
