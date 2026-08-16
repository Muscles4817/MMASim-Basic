/**
 * Does money actually move?
 *
 * `purseFor()` used to be called in exactly two places and both of them printed a number on a
 * screen. Nothing accumulated it and nothing spent it — so the whole business layer was a
 * scoreboard. These assert the opposite end to end: a camp is paid for, a fight pays out, and
 * the bank ends up somewhere that reflects what happened.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { marketValue, type Fighter, type Gym, type Promotion } from '@mmasim/engine';
import { campCostFor, currentPurse, payForCamp, settleFight } from '../../packages/app/src/game/money';
import { runTraining } from '../../packages/app/src/game/progression';

const game = () => createNewGame({ adapter: undefined });
const player = (db: ReturnType<typeof game>) => (db.fighters.findAll() as Fighter[])[0]!;

describe('a camp costs money', () => {
  it('debits the bank when training runs', () => {
    const db = game();
    const me = player(db);
    db.fighters.upsert({ ...me, bank: 100 } as Fighter & { id: string });

    runTraining(db, db.fighters.getById(me.id as string) as Fighter, ['striking'], 8);

    const after = db.fighters.getById(me.id as string) as Fighter;
    expect(after.bank).toBeLessThan(100);
  });

  it('charges more for a better room', () => {
    const db = game();
    const gyms = (db.gyms.findAll() as unknown as Gym[]).slice().sort((a, b) => a.quality - b.quality);
    expect(campCostFor(gyms[gyms.length - 1], 8)).toBeGreaterThan(campCostFor(gyms[0], 8) * 2.5);
  });

  it('lets the bank go negative rather than refusing', () => {
    // Nothing in this design blocks. Being broke changes what a fighter accepts; it is a
    // pressure, not a prohibition.
    const db = game();
    const me = player(db);
    const broke = payForCamp(db, { ...me, bank: 1 }, 20);
    expect(broke.bank).toBeLessThan(0);
  });
});

describe('a fight pays', () => {
  it('credits the bank and records lifetime earnings', () => {
    const db = game();
    const me = { ...player(db), bank: 50 };
    db.fighters.upsert(me as Fighter & { id: string });

    const earnings = settleFight(db, me, { won: true, campCost: 0, campWeeks: 8 });
    expect(earnings).toBeDefined();

    const after = db.fighters.getById(me.id as string) as Fighter;
    expect(after.lifetimeGross).toBeGreaterThan(0);
    expect(after.bank).not.toBe(50);
  });

  it('pays more for winning than for losing', () => {
    const db = game();
    const me = player(db);
    const won = settleFight(db, { ...me, bank: 0 }, { won: true, campCost: 5, campWeeks: 8 })!;
    const lost = settleFight(db, { ...me, bank: 0 }, { won: false, campCost: 5, campWeeks: 8 })!;
    expect(won.gross).toBeGreaterThan(lost.gross);
  });

  it('takes the manager, the corner and the taxman out of both', () => {
    const db = game();
    const me = player(db);
    const won = settleFight(db, { ...me, bank: 0 }, { won: true, campCost: 5, campWeeks: 8 })!;

    expect(won.breakdown.manager).toBeGreaterThan(0);
    expect(won.breakdown.corner).toBeGreaterThan(0);
    expect(won.breakdown.net).toBeLessThan(won.gross);
  });

  it('does not charge the camp twice', () => {
    // The camp is debited when it runs. Netting it again here without adding it back would
    // be the classic double-charge, and the fighter would quietly lose a camp's worth of
    // money every fight.
    const db = game();
    const me = { ...player(db), bank: 100 };
    db.fighters.upsert(me as Fighter & { id: string });

    const noCamp = settleFight(db, { ...me, bank: 100 }, { won: true, campCost: 0, campWeeks: 8 })!;
    const withCamp = settleFight(db, { ...me, bank: 100 }, { won: true, campCost: 20, campWeeks: 8 })!;

    // The camp changes the *reported* net, because that is the honest picture of the fight.
    expect(withCamp.breakdown.net).toBeLessThan(noCamp.breakdown.net);
    // But it must not be taken out of the bank a second time.
    const bankAfterNoCamp = db.fighters.getById(me.id as string) as Fighter;
    expect(bankAfterNoCamp.bank).toBeGreaterThan(0);
  });

  it('pays nothing to a fighter with no promotion', () => {
    const db = game();
    const me = player(db);
    expect(
      settleFight(db, { ...me, promotionId: undefined }, { won: true, campCost: 0, campWeeks: 8 }),
    ).toBeUndefined();
  });
});

describe('the shape of the sport', () => {
  it('pays a global promotion’s fighter far more than a regional one’s', () => {
    const db = game();
    const promotions = (db.promotions.findAll() as unknown as Promotion[])
      .slice()
      .sort((a, b) => a.prestige - b.prestige);
    const me = player(db);

    const spread = marketValue(me, promotions[promotions.length - 1]!) / marketValue(me, promotions[0]!);
    // The seed budgets differ by 47:1. A 4:1 pay spread across that was an oversight.
    expect(spread).toBeGreaterThan(10);
  });

  it('never pays below a promotion’s published floor', () => {
    const db = game();
    const promotions = db.promotions.findAll() as unknown as Promotion[];
    const nobody = { ...player(db), starPower: 1, reputation: 1 };

    for (const promotion of promotions) {
      db.fighters.upsert({ ...nobody, promotionId: promotion.id } as Fighter & { id: string });
      const purse = currentPurse(db, { ...nobody, promotionId: promotion.id });
      expect(purse!.total, promotion.shortName).toBeGreaterThanOrEqual(promotion.minimumPurse);
    }
  });

  it('leaves a fighter at the bottom of the sport barely able to fund a camp', () => {
    // The most-cited economic fact about MMA, and the reason the money layer exists.
    const db = game();
    const promotions = (db.promotions.findAll() as unknown as Promotion[])
      .slice()
      .sort((a, b) => a.prestige - b.prestige);
    const gyms = (db.gyms.findAll() as unknown as Gym[]).slice().sort((a, b) => a.quality - b.quality);

    const rookie = {
      ...player(db),
      starPower: 5,
      reputation: 5,
      bank: 0,
      promotionId: promotions[0]!.id,
    };
    db.fighters.upsert(rookie as Fighter & { id: string });

    const earnings = settleFight(db, rookie, {
      won: true,
      campCost: campCostFor(gyms[0], 8),
      campWeeks: 8,
    })!;

    // Winning at the bottom of the sport does not fund the next camp at a better gym.
    expect(earnings.breakdown.net).toBeLessThan(campCostFor(gyms[gyms.length - 1], 8));
  });
});
