/**
 * Rival promotions with intent, over three years: guardrails. Doc 34 B4.
 *
 * Postures, counter-programming and poaching are each easy to get wrong in one direction or the
 * other: a sport where nobody ever books against anybody is the one this replaced, and one where
 * every date is contested and every champion is bought out is not a sport either. These hold the
 * rates inside the range the real one runs at, and check that every posture actually shows up.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import { POSTURES, postureOf, type FightNight, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';
import { createPlan, plansFor } from '../../packages/app/src/game/plans';
import { considerCounterProgramming } from '../../packages/app/src/game/counterProgramming';

const YEAR = 365;
const STEP = 28;

describe('rival promotions over three years', () => {
  it('show every posture, contest some dates, and poach the odd champion', () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const promotions = db.promotions.findAll() as unknown as Promotion[];
    const mine = promotions.find((p) => p.shortName === 'LFA')!;
    setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: mine.id });
    const start = getWorld(db).day;
    const end = start + 3 * YEAR;

    // A card every four weeks, in the player's own market.
    for (let day = start + 45; day < end; day += STEP) createPlan({ db, promotion: mine, day });

    const news = [];
    for (let day = start; day < end; day += STEP) {
      for (let d = day; d < day + STEP; d++) considerCounterProgramming(db, d);
      news.push(...advanceWorld(db, day, day + STEP, { promotionId: mine.id }).news);
      setWorld(db, { day: day + STEP });
    }

    // Every posture is somebody, and every posture ran cards.
    const events = db.events.findAll() as unknown as FightNight[];
    const ran = new Set(events.map((e) => e.promotionId as string));
    for (const posture of POSTURES) {
      const theirs = promotions.filter((p) => postureOf(p) === posture && p.id !== mine.id);
      expect(theirs.length, `nobody is a ${posture}`).toBeGreaterThan(0);
      expect(
        theirs.some((p) => ran.has(p.id as string)),
        `no ${posture} ran a card`,
      ).toBe(true);
    }

    // Counter-programming: some of the player's dates, never most of them.
    const plans = plansFor(db, mine.id as string).filter((p) => p.rivalsConsidered);
    const countered = plans.filter((p) => p.rivalCard);
    const share = countered.length / plans.length;
    expect(plans.length).toBeGreaterThan(30);
    expect(share, 'share of the player’s dates a rival booked against').toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.5);
    // And the rival actually ran its card on the day.
    expect(
      countered.some((p) =>
        events.some((e) => e.promotionId === p.rivalCard!.promotionId && e.day === p.day),
      ),
    ).toBe(true);

    // Poaching: rare. A champion bought out now and then — a regional champion called up by a
    // bigger promotion is the commonest kind — not a market in belts. Measured: 10 in three years.
    const poached = new Set(
      news.filter((n) => String(n.id).includes('poach:')).map((n) => n.id as string),
    ).size;
    expect(poached, 'champions bought out in three years').toBeGreaterThanOrEqual(1);
    expect(poached).toBeLessThanOrEqual(15);
  }, 900_000);
});
