/**
 * Departments a promotion funds, in a running world. Doc 34 B5.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import { type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';
import { financialSnapshot } from '../../packages/app/src/game/finances';
import { medicalFactorFor, setInvestment } from '../../packages/app/src/game/investment';
import {
  createPlan,
  placeBout,
  promoterContext,
  sendOffer,
} from '../../packages/app/src/game/plans';

function as(shortName: string) {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const mine = (db.promotions.findAll() as unknown as Promotion[]).find(
    (p) => p.shortName === shortName,
  )!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: mine.id });
  return { db, mine, day: getWorld(db).day };
}
const reread = (db: ReturnType<typeof as>['db'], id: string) =>
  db.promotions.findById(id) as Promotion;

describe('funding a department', () => {
  it('costs money every month, shown in the books, and more the bigger the operation', () => {
    const small = as('LFA');
    const big = as('UFC');
    for (const w of [small, big]) {
      setInvestment(w.db, w.mine.id as string, 'medical', 2);
    }
    const smallCost = financialSnapshot({
      db: small.db,
      promotion: reread(small.db, small.mine.id as string),
    }).departments;
    const bigCost = financialSnapshot({
      db: big.db,
      promotion: reread(big.db, big.mine.id as string),
    }).departments;
    expect(smallCost).toBeGreaterThan(0);
    expect(bigCost).toBeGreaterThan(smallCost * 5);

    // Charged as time passes: the same three months cost a funded promotion more than an unfunded one.
    const control = as('LFA');
    advanceWorld(small.db, small.day, small.day + 90, { promotionId: small.mine.id });
    advanceWorld(control.db, control.day, control.day + 90, { promotionId: control.mine.id });
    expect(reread(small.db, small.mine.id as string).budget).toBeLessThan(
      reread(control.db, control.mine.id as string).budget,
    );
  });

  it('cuts the injury and withdrawal risk of its own fighters with medical staff, nobody else’s', () => {
    const { db, mine } = as('UFC');
    const all = db.fighters.findAll() as Fighter[];
    const ours = all.find((f) => f.promotionId === mine.id)!;
    const theirs = all.find((f) => f.promotionId && f.promotionId !== mine.id)!;
    expect(medicalFactorFor(db, ours)).toBe(1);
    setInvestment(db, mine.id as string, 'medical', 3);
    expect(medicalFactorFor(db, ours)).toBeLessThan(1);
    expect(medicalFactorFor(db, theirs)).toBe(1);
  });

  it('holds buzz up with marketing', () => {
    const { db, mine, day } = as('LFA');
    db.promotions.upsert({ ...reread(db, mine.id as string), buzz: 5 } as never);
    setInvestment(db, mine.id as string, 'marketing', 3);
    advanceWorld(db, day, day + 30, { promotionId: mine.id });
    expect(reread(db, mine.id as string).buzz).toBeGreaterThanOrEqual(35);
  });

  it('gets more corners to say yes with a matchmaker', () => {
    const count = (level: 0 | 3) => {
      const { db, mine, day } = as('UFC');
      if (level > 0) setInvestment(db, mine.id as string, 'matchmaker', level);
      const promotion = reread(db, mine.id as string);
      const ctx = promoterContext({ db, promotion, day });
      const roster = (db.fighters.findAll() as Fighter[]).filter(
        (f) => f.promotionId === mine.id && f.retiredDay === undefined,
      );
      let yes = 0;
      for (let i = 0; i + 1 < Math.min(roster.length, 120); i += 2) {
        const [a, b] = [roster[i]!, roster[i + 1]!];
        let plan = createPlan({ db, promotion, day: day + 60 + i });
        plan = placeBout({
          plan,
          slotId: 'main',
          redId: a.id as string,
          blueId: b.id as string,
          divisionId: a.divisionId as string,
        });
        const out = sendOffer({ ctx, plan, slotId: 'main' });
        const answers = out?.plan.slots.find((s) => s.id === 'main')?.bout?.pending ?? [];
        yes += answers.filter((x) => x.verdict === 'accepted').length;
      }
      return yes;
    };
    expect(count(3)).toBeGreaterThan(count(0));
  });
});
