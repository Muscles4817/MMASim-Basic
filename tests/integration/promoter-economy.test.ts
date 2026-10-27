/**
 * Doc 34's B1, where the rules meet the save: the market a card is staged in, the rivalry on top
 * of it, the counter-offer a promoter pays, and the attention a promotion loses by doing nothing.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  createAgreement,
  defaultTerms,
  emptyRivalry,
  homeMarket,
  type EventPlan,
  type Fighter,
  type PromotionalAgreement,
  type Promotion,
} from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';
import { currentPurse } from '../../packages/app/src/game/money';
import {
  acceptCounter,
  createPlan,
  forecastPlan,
  promoterContext,
  runPlan,
  savePlan,
} from '../../packages/app/src/game/plans';
import { agreed, filledPlan } from '../helpers/plans';

function setup() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[]).find(
    (p) => p.tier === 'regional',
  )!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return { db, promotion, today: getWorld(db).day };
}

const mainEvent = (plan: EventPlan) => plan.slots.find((s) => s.position === 'mainEvent')!;

describe('where a card is staged', () => {
  it('defaults to the promotion’s own city, and the night is held there', () => {
    const { db, promotion, today } = setup();
    const plan = agreed(db, filledPlan({ db, promotion, day: today + 30, today }));
    expect(plan.city).toBe(homeMarket(promotion).city);

    const ran = runPlan({ db, plan });
    expect(ran?.night.venue.city).toBe(plan.city);
  });

  it('costs more in Las Vegas than at home', () => {
    const { db, promotion, today } = setup();
    const ctx = promoterContext({ db, promotion, day: today });
    const home = filledPlan({ db, promotion, day: today + 30, today });
    const vegas = savePlan(db, {
      ...home,
      id: `${home.id}_vegas`,
      city: 'Las Vegas',
      country: 'USA',
    });
    expect(forecastPlan({ ctx, plan: vegas }).projectedProfit).toBeLessThan(
      forecastPlan({ ctx, plan: home }).projectedProfit,
    );
  });

  it('forecasts a loss for a card with nothing on it', () => {
    const { db, promotion, today } = setup();
    const ctx = promoterContext({ db, promotion, day: today });
    const plan = createPlan({ db, promotion, day: today + 60 });
    expect(forecastPlan({ ctx, plan }).projectedProfit).toBeLessThan(0);
  });
});

describe('a grudge sells', () => {
  it('draws more for the same main event once there is heat between them', () => {
    const { db, promotion, today } = setup();
    const ctx = promoterContext({ db, promotion, day: today });
    const plan = filledPlan({ db, promotion, day: today + 30, today });
    const bout = mainEvent(plan).bout!;
    const cold = forecastPlan({ ctx, plan }).headlineDraw;

    db.rivalries.upsert({
      ...emptyRivalry(bout.redId, bout.blueId, plan.day as never),
      heat: 80,
      isRivalry: true,
    } as never);
    expect(forecastPlan({ ctx, plan }).headlineDraw).toBeGreaterThan(cold);
  });
});

describe('paying a counter-offer', () => {
  it('repapers the contract at its own rate, not at the slot’s', () => {
    /*
     * The ask is for the slot — a main event's 2.5× is in it. Writing it straight into the
     * contract applied that again on the fighter's next main event, which is how an autopilot that
     * paid every counter took a regional card's purses from £265k to £2m in a year.
     */
    const { db, promotion, today } = setup();
    const ctx = promoterContext({ db, promotion, day: today });
    const plan = filledPlan({ db, promotion, day: today + 30, today });
    const slot = mainEvent(plan);
    const signed = db.fighters.findById(slot.bout!.redId as string) as Fighter;
    // Paper them first: a seeded fighter is under an implicit deal with nothing to repaper.
    const agreement = createAgreement({
      fighter: signed,
      promotion,
      terms: {
        ...defaultTerms(signed, promotion),
        signingBonus: 0,
        revenuePoints: 0,
        fightsOwed: 4,
        championshipExtension: 'none',
        matchingRights: false,
        exclusive: false,
        outsideBouts: 2,
      },
      day: today as never,
    });
    db.agreements.upsert(agreement as never);
    const fighter = { ...signed, agreementId: agreement.id } as Fighter;
    db.fighters.upsert(fighter as never);

    const atSlot = currentPurse(db, fighter, 'mainEvent')!.show;
    const ask = Math.round(atSlot * 1.5 * 10) / 10;
    const countered = savePlan(db, {
      ...plan,
      slots: plan.slots.map((s) =>
        s.id === slot.id
          ? {
              ...s,
              bout: {
                ...s.bout!,
                status: 'offered' as const,
                answers: [
                  {
                    fighterId: fighter.id,
                    verdict: 'countered' as const,
                    note: '',
                    askingPurse: ask,
                  },
                ],
              },
            }
          : s,
      ),
    });
    acceptCounter({ ctx, plan: countered, slotId: slot.id });

    const after = db.agreements.findById(agreement.id as string) as PromotionalAgreement;
    expect(after.showPurse).toBeCloseTo(agreement.showPurse * 1.5, 0);
    expect(currentPurse(db, fighter, 'mainEvent')!.show).toBeCloseTo(ask, 0);
  });
});

describe('attention', () => {
  it('fades for a promotion that puts on no cards', () => {
    const { db, promotion, today } = setup();
    // Nothing in the diary for four months, and the player's promotion runs nothing on its own.
    advanceWorld(db, today, today + 120, { promotionId: promotion.id });
    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.buzz).toBeLessThan(promotion.buzz);
  });
});
