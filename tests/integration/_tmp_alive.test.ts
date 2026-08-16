import { describe, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { rankDivision, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

describe('is the world alive', () => {
  it('measures a year', () => {
    const db = createNewGame({ adapter: undefined });
    const all = () => db.fighters.findAll() as Fighter[];
    const me = all()[0]!;
    const div = me.divisionId;
    const promo = (db.promotions.findAll() as unknown as Promotion[])[0]!;

    const before = all();
    const beforeFights = before.reduce((a, f) => a + f.record.length, 0);
    const beforeRank = rankDivision(before.filter(f => f.divisionId === div), div, promo.id, 0)
      .slice(0, 5).map(r => r.fighter.lastName);
    const beforeChamp = promo.champions[div];

    const t0 = Date.now();
    const out = advanceWorld(db, 0, 365, me.id);
    const ms = Date.now() - t0;

    const after = all();
    const afterFights = after.reduce((a, f) => a + f.record.length, 0);
    const p2 = (db.promotions.findAll() as unknown as Promotion[])[0]!;
    const afterRank = rankDivision(after.filter(f => f.divisionId === div && !f.retiredDay), div, p2.id, 365)
      .slice(0, 5).map(r => r.fighter.lastName);

    console.log(JSON.stringify({
      ms,
      fights: out.fights,
      truncated: out.truncated,
      newsItems: out.news.length,
      newFightsOnRecords: afterFights - beforeFights,
      rosterBefore: before.length, rosterAfter: after.length,
      retired: after.filter(f => f.retiredDay !== undefined).length,
      championChanged: p2.champions[div] !== beforeChamp,
      top5Before: beforeRank, top5After: afterRank,
      byWeight: out.news.reduce((a: Record<string, number>, n) => { a[n.weight] = (a[n.weight] ?? 0) + 1; return a; }, {}),
      byKind: out.news.reduce((a: Record<string, number>, n) => { a[n.kind] = (a[n.kind] ?? 0) + 1; return a; }, {}),
    }, null, 1));
  });
});
