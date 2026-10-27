/**
 * Weigh-ins on the player's cards. Doc 34 C6.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import { withSlot, type EventPlan, type Fighter, type Promotion } from '@mmasim/engine';
import {
  answerWeighIn,
  createPlan,
  placeBout,
  plansFor,
  resolveMissedWeight,
  rollWeighIns,
  savePlan,
  settleWeighIns,
  weighInLines,
} from '../../packages/app/src/game/plans';

const FLY = 'mens-flyweight';

/**
 * A heavyweight-bodied, undisciplined fighter booked at flyweight against a flyweight: a miss as
 * near certain as the model makes one, from the honest formula rather than a stub.
 */
function heavyOnFlyweight() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: promotion.id });
  const day = getWorld(db).day;
  const all = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
  const heavy = all.find((f) => f.divisionId === 'mens-heavyweight')!;
  const fly = all.find((f) => f.divisionId === FLY && f.id !== heavy.id)!;
  db.fighters.upsert({
    ...heavy,
    personality: { ...heavy.personality, discipline: 2, professionalism: 2 },
  } as never);

  let plan = createPlan({ db, promotion, day: day + 10 });
  plan = placeBout({
    plan,
    slotId: 'main',
    redId: heavy.id as string,
    blueId: fly.id as string,
    divisionId: FLY,
  });
  const slot = plan.slots.find((s) => s.id === 'main')!;
  plan = savePlan(db, withSlot(plan, 'main', { ...slot.bout!, status: 'agreed' }));
  return { db, promotion, plan, heavy, fly, day };
}

const reread = (db: ReturnType<typeof heavyOnFlyweight>['db'], plan: EventPlan) =>
  plansFor(db, plan.promotionId as string).find((p) => p.id === plan.id)!;
const mainOf = (plan: EventPlan) => plan.slots.find((s) => s.id === 'main')!.bout!;

describe('the weigh-in', () => {
  it('is read as weigh-in day begins, once, and a miss is a decision with the opponent’s reaction', () => {
    const { db, plan, heavy } = heavyOnFlyweight();
    expect(rollWeighIns(db, plan.day - 3), 'too early').toBe(0);
    expect(mainOf(reread(db, plan)).weighIn).toBeUndefined();

    expect(rollWeighIns(db, plan.day - 2)).toBe(1);
    const weighed = mainOf(reread(db, plan));
    const miss = weighed.weighIn!.results.find((r) => r.fighterId === heavy.id)!;
    expect(miss.made).toBe(false);
    expect(miss.overLbs).toBeGreaterThan(0);

    // Again: not reweighed.
    expect(rollWeighIns(db, plan.day - 2)).toBe(0);
    expect(mainOf(reread(db, plan)).weighIn).toEqual(weighed.weighIn);

    const decision = db.inbox
      .findAll()
      .find((i) => String(i.id).endsWith(`weighin:${plan.id}:main`))!;
    expect(decision.priority).toBe('decision');
    expect(decision.actions!.map((a) => a.id)).toContain('weighIn:cancel');
    const said = db.news.findAll().find((n) => String(n.id).includes(`weighin:${plan.id}`));
    expect(said?.kind).toBe('voice');
  });

  it('can be cancelled by the promoter, and the fighter who made weight remembers', () => {
    const { db, plan, fly } = heavyOnFlyweight();
    rollWeighIns(db, plan.day - 2);
    const item = db.inbox.findAll().find((i) => String(i.id).endsWith(`weighin:${plan.id}:main`))!;
    expect(answerWeighIn(db, item as never, 'weighIn:cancel')).toBe(true);

    const bout = mainOf(reread(db, plan));
    expect(bout.status).toBe('declined');
    expect(bout.weighIn).toMatchObject({ choice: 'cancel', settled: true, defaulted: false });
    const remembered = (db.fighters.findById(fly.id as string) as Fighter).ledger ?? [];
    expect(remembered.some((e) => e.kind === 'cardCancelled')).toBe(true);
    expect(weighInLines(db, reread(db, plan))[0]).toMatch(/cancelled/);
    // Decided; not decidable again.
    expect(resolveMissedWeight(db, plan.id, 'main', 'catchweight')).toBeUndefined();
  });

  it('is decided by fight night when nobody chose — and says so', () => {
    const { db, plan, heavy, fly } = heavyOnFlyweight();
    rollWeighIns(db, plan.day - 2);
    const before = mainOf(reread(db, plan)).weighIn!;
    const banks = [heavy, fly].map((f) => (db.fighters.findById(f.id as string) as Fighter).bank);

    const settled = savePlan(db, settleWeighIns(db, reread(db, plan), plan.day));
    const bout = mainOf(settled);
    expect(bout.weighIn!.defaulted).toBe(true);
    expect(bout.weighIn!.choice).toBe(before.opponentAccepts ? 'catchweight' : 'cancel');
    expect(weighInLines(db, settled)[0]).toMatch(/by default/);
    const news = db.news
      .findAll()
      .find((n) => String(n.id).includes(`weighin-settled:${plan.id}:main`))!;
    expect(news.detail).toMatch(/Nobody made the call/);

    const decision = db.inbox
      .findAll()
      .find((i) => String(i.id).endsWith(`weighin:${plan.id}:main`))!;
    expect(decision.resolvedDay).toBeDefined();

    if (before.opponentAccepts) {
      const forfeit = before.results.find((r) => !r.made)!.forfeit;
      expect(bout.status).toBe('agreed');
      expect(bout.catchweightLbs).toBeGreaterThan(125);
      const after = [heavy, fly].map((f) => (db.fighters.findById(f.id as string) as Fighter).bank);
      expect(after[0]).toBeCloseTo(banks[0]! - forfeit, 1);
      expect(after[1]).toBeCloseTo(banks[1]! + forfeit, 1);
    } else {
      expect(bout.status).toBe('declined');
    }

    // Settled once.
    const again = settleWeighIns(db, settled, plan.day);
    expect(mainOf(again)).toEqual(bout);
  });
});
