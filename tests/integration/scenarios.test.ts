/**
 * Scenarios, difficulty and standing orders. Doc 34 B6.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import type { Fighter, Promotion, PromotionalAgreement } from '@mmasim/engine';
import {
  applyScenario,
  wantsOutChampion,
  scenarioBlocker,
} from '../../packages/app/src/game/scenario';
import {
  ownerPatience,
  purseInflation,
  rivalAggression,
} from '../../packages/app/src/game/difficulty';
import {
  PRELIMS_FROM_DAYS,
  RENEW_WITHIN_DAYS,
  runStandingOrders,
} from '../../packages/app/src/game/standingOrders';
import { createPlan, planById } from '../../packages/app/src/game/plans';
import { readInbox } from '../../packages/app/src/game/inbox';
import { formaliseExistingDeal } from '../../packages/app/src/game/contracts';

const NORMAL = {
  purseInflation: 'normal',
  rivalAggression: 'normal',
  ownerPatience: 'normal',
} as const;

function promoter() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .filter((p) => p.tier === 'regional')
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return { db, promotion, day: getWorld(db).day };
}

const promotionOf = (db: ReturnType<typeof promoter>['db'], p: Promotion) =>
  db.promotions.findById(p.id as string) as Promotion;

describe('scenarios', () => {
  it('a bankrupt rescue starts nearly broke and unloved, and says so', () => {
    const { db, promotion } = promoter();
    const setup = applyScenario(db, promotion.id as string, {
      scenario: 'bankruptRescue',
      ...NORMAL,
    });
    const after = promotionOf(db, promotion);
    expect(setup.scenario).toBe('bankruptRescue');
    expect(after.budget).toBeLessThan(promotion.budget * 0.1);
    expect(after.buzz).toBeLessThanOrEqual(15);
    expect(getWorld(db).promoterSetup?.scenario).toBe('bankruptRescue');
    expect(readInbox(db).some((i) => /nearly broke/.test(i.title))).toBe(true);
  });

  it('an upstart is a smaller name, with a named giant, and rivals one step harder', () => {
    const { db, promotion } = promoter();
    const setup = applyScenario(db, promotion.id as string, { scenario: 'upstart', ...NORMAL });
    expect(promotionOf(db, promotion).prestige).toBeLessThan(promotion.prestige);
    expect(setup.rivalId).toBeDefined();
    expect(setup.rivalId).not.toBe(promotion.id);
    expect(setup.rivalAggression).toBe('hard');
    expect(rivalAggression(db)).toBeGreaterThan(1);
  });

  it('a champion who wants out is unhappy, near the end of the deal, and a decision', () => {
    const { db, promotion, day } = promoter();
    const champion = wantsOutChampion(db, promotion);
    if (!champion) {
      expect(scenarioBlocker(db, promotion, 'championWantsOut')).toMatch(/no champion/);
      return;
    }
    const setup = applyScenario(db, promotion.id as string, {
      scenario: 'championWantsOut',
      ...NORMAL,
    });
    expect(setup.championId).toBe(champion.id);
    const after = db.fighters.findById(champion.id as string) as Fighter;
    expect(after.resentment).toBeGreaterThanOrEqual(70);
    if (after.agreementId) {
      const deal = db.agreements.findById(after.agreementId as string) as PromotionalAgreement;
      expect(deal.expiresDay).toBeLessThanOrEqual(day + 60);
    }
    const item = readInbox(db).find((i) => /wants out/.test(i.title));
    expect(item?.priority).toBe('decision');
  });

  it('falls back to the standard start when the scenario cannot be played here', () => {
    const { db, promotion } = promoter();
    db.promotions.upsert({ ...promotion, champions: {} } as never);
    const setup = applyScenario(db, promotion.id as string, {
      scenario: 'championWantsOut',
      ...NORMAL,
    });
    expect(setup.scenario).toBe('standard');
  });
});

describe('difficulty', () => {
  it('turns three dials, and reads as normal on a save that never set them', () => {
    const { db, promotion } = promoter();
    expect([purseInflation(db), rivalAggression(db), ownerPatience(db)]).toEqual([1, 1, 1]);
    applyScenario(db, promotion.id as string, {
      scenario: 'standard',
      purseInflation: 'hard',
      rivalAggression: 'gentle',
      ownerPatience: 'hard',
    });
    expect(purseInflation(db)).toBeGreaterThan(1);
    expect(rivalAggression(db)).toBeLessThan(1);
    expect(ownerPatience(db)).toBeLessThan(1);
  });
});

describe('standing orders', () => {
  it('the matchmaker fills and offers the prelims inside six weeks, and leaves the main card alone', () => {
    const { db, promotion, day } = promoter();
    setWorld(db, { standingOrders: { matchmakerOwnsPrelims: true } });
    const near = createPlan({ db, promotion, day: day + PRELIMS_FROM_DAYS - 10 });
    const far = createPlan({ db, promotion, day: day + PRELIMS_FROM_DAYS + 30 });

    runStandingOrders(db, day);

    const filled = planById(db, near.id)!;
    const prelims = filled.slots.filter((s) => s.position === 'prelim');
    expect(prelims.some((s) => s.bout)).toBe(true);
    for (const s of prelims) {
      if (s.bout) expect(s.bout.status).not.toBe('draft');
    }
    expect(filled.slots.filter((s) => s.position !== 'prelim').every((s) => !s.bout)).toBe(true);
    expect(planById(db, far.id)!.slots.every((s) => !s.bout)).toBe(true);
  });

  it('re-signs whoever the order covers as the deal runs down, and leaves the unwilling to you', () => {
    const { db, promotion, day } = promoter();
    // Seeded fighters carry their deal informally; write two of them down.
    const signed = (db.fighters.findAll() as Fighter[])
      .filter((f) => f.promotionId === promotion.id && f.retiredDay === undefined)
      .slice(0, 2)
      .map((f) => formaliseExistingDeal(db, f));
    const [willing, unwilling] = signed;
    for (const f of [willing!, unwilling!]) {
      const deal = db.agreements.findById(f.agreementId as string) as PromotionalAgreement;
      db.agreements.upsert({ ...deal, expiresDay: day + RENEW_WITHIN_DAYS - 10 } as never);
    }
    db.fighters.upsert({ ...willing!, resentment: 0, ledger: [] } as never);
    db.fighters.upsert({ ...unwilling!, resentment: 80 } as never);
    setWorld(db, { standingOrders: { autoRenew: 'everyone' } });

    runStandingOrders(db, day);

    const renewed = db.fighters.findById(willing!.id as string) as Fighter;
    expect(renewed.agreementId).not.toBe(willing!.agreementId);
    const deal = db.agreements.findById(renewed.agreementId as string) as PromotionalAgreement;
    expect(deal.expiresDay).toBeGreaterThan(day + RENEW_WITHIN_DAYS);

    const kept = db.fighters.findById(unwilling!.id as string) as Fighter;
    expect(kept.agreementId).toBe(unwilling!.agreementId);
    expect(
      readInbox(db).some(
        (i) => i.fighterId === unwilling!.id && /will not be re-signed/.test(i.title),
      ),
    ).toBe(true);
  });
});
