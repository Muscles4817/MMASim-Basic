/**
 * The first-week checklist ticks itself off from the save. The player never ticks anything;
 * they do the thing, and the list notices.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import { withSlot, type Promotion } from '@mmasim/engine';
import {
  FIRST_WEEK,
  dismiss,
  firstWeek,
  firstWeekOver,
} from '../../packages/app/src/game/onboarding';
import { createPlan, planById, runPlan, savePlan } from '../../packages/app/src/game/plans';
import { agreed, filledPlan } from '../helpers/plans';

function promoter() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return { db, promotion, today: getWorld(db).day };
}

const done = (db: ReturnType<typeof promoter>['db']) =>
  Object.fromEntries(firstWeek(db).map((s) => [s.id, s.done]));

describe('the first week', () => {
  it('starts with nothing done', () => {
    const { db } = promoter();
    expect(Object.values(done(db))).toEqual([false, false, false, false, false]);
    expect(firstWeekOver(db)).toBe(false);
  });

  it('ticks each step from what has actually happened, in order', () => {
    const { db, promotion, today } = promoter();

    createPlan({ db, promotion, day: today + 30 });
    expect(done(db)).toMatchObject({ plan: true, main: false });

    // Pencilling a main event is enough for "put a main event on it"; offering it is the next.
    const filled = filledPlan({ db, promotion, day: today + 40, today });
    expect(done(db)).toMatchObject({ main: true, offers: false });

    const main = filled.slots.find((s) => s.position === 'mainEvent')!;
    savePlan(db, withSlot(filled, main.id, { ...main.bout!, status: 'offered' }));
    expect(done(db)).toMatchObject({ offers: true, night: false });

    // The first card is the soonest; signing it and walking the clock to it is the next step.
    const first = agreed(db, filledPlan({ db, promotion, day: today + 20, today }));
    setWorld(db, { day: first.day });
    expect(done(db)).toMatchObject({ night: true, run: false });

    runPlan({ db, plan: planById(db, first.id)! });
    expect(done(db).run).toBe(true);
    expect(firstWeekOver(db)).toBe(true);
  });

  it('can be put away before it is finished', () => {
    const { db } = promoter();
    dismiss(db, FIRST_WEEK);
    expect(firstWeekOver(db)).toBe(true);
    expect(getWorld(db).dismissed).toContain(FIRST_WEEK);
  });

  it('points the next step at where it is done', () => {
    const { db } = promoter();
    expect(firstWeek(db)[0]!.link).toEqual({ route: 'calendar', id: 'new' });
  });
});
