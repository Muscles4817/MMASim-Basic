/**
 * The promoter's fight night, after it has run.
 *
 * The audit found the night produced a profit figure and a list of pairings: no winner, no belt,
 * no bonuses anybody chose, nothing in the sport's feed, and nothing to book from it. These pin
 * what replaced that at the game layer — the screens are walked in `tests/ui/promoter.test.tsx`.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  plannedBouts,
  withSlot,
  type Fighter,
  type FightNight,
  type Promotion,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { readNews } from '../../packages/app/src/game/world';
import { reviewSpan } from '../../packages/app/src/game/review';
import {
  bookingsFor,
  calloutsFor,
  confirmAwards,
  createPlan,
  nightResults,
  pencilCallout,
  planById,
  runPlan,
  savePlan,
} from '../../packages/app/src/game/plans';
import { agreed, filledPlan } from '../helpers/plans';

const game = () => createNewGame({ adapter: undefined, era: '2026' });

function ranCard() {
  const db = game();
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  const today = getWorld(db).day;
  const plan = agreed(db, filledPlan({ db, promotion, day: today + 21, today }));
  return { db, promotion, today, plan };
}

const nightOf = (db: ReturnType<typeof game>, id: string) => db.events.findById(id) as FightNight;

describe('the bonuses are the promoter’s call', () => {
  it('are held on the night as a suggestion, not paid, until the player confirms', () => {
    const { db, plan } = ranCard();
    const banks = new Map(
      plannedBouts(plan).flatMap((b) =>
        [b.redId, b.blueId].map((id) => [
          id as string,
          (db.fighters.findById(id as string) as Fighter).bank,
        ]),
      ),
    );
    const ran = runPlan({ db, plan })!;
    const night = nightOf(db, ran.night.id as string);
    expect(night.awards?.pending).toBe(true);

    // Purses moved the banks; nobody has a bonus line yet.
    for (const id of banks.keys()) {
      const fighter = db.fighters.findById(id) as Fighter;
      expect(fighter.record.some((e) => e.bonus !== undefined && e.day === plan.day)).toBe(false);
    }

    // The player picks the last bout on the card and its winner, not the matchmaker's choice.
    const last = night.bouts[night.bouts.length - 1]!;
    const row = nightResults(db, planById(db, plan.id)!).find(
      (r) => r.bout.boutId === last.boutId,
    )!;
    const winnerId = row.winner?.id as string | undefined;
    const before = (db.fighters.findById(last.redId as string) as Fighter).bank;

    expect(
      confirmAwards(db, night.id as string, {
        fightOfTheNight: last.boutId,
        performanceOfTheNight: winnerId ? [winnerId] : [],
      }),
    ).toBe(true);

    const after = nightOf(db, night.id as string);
    expect(after.awards?.pending).toBeUndefined();
    expect(after.awards?.fightOfTheNight).toBe(last.boutId);
    const red = db.fighters.findById(last.redId as string) as Fighter;
    expect(red.bank).toBeGreaterThan(before);
    expect(red.record.find((e) => e.boutId === last.boutId)?.bonus).toBeDefined();

    // Once.
    expect(confirmAwards(db, night.id as string, { performanceOfTheNight: [] })).toBe(false);
  });

  it('lets the suggestion stand once the clock moves', () => {
    const { db, plan } = ranCard();
    const ran = runPlan({ db, plan })!;
    advanceTo(db, getWorld(db).day + 1);
    const night = nightOf(db, ran.night.id as string);
    expect(night.awards?.pending).toBeUndefined();
  });
});

describe('the results', () => {
  it('say when a belt changed hands or was kept', () => {
    const { db, promotion, today } = ranCard();
    const [divisionId, championId] = Object.entries(promotion.champions)[0]!;
    const champion = db.fighters.findById(championId as string) as Fighter;
    const challenger = (db.fighters.findAll() as Fighter[]).find(
      (f) =>
        f.promotionId === promotion.id &&
        f.divisionId === champion.divisionId &&
        f.id !== champion.id &&
        f.retiredDay === undefined,
    )!;

    let plan = createPlan({ db, promotion, day: today + 60 });
    const main = plan.slots.find((s) => s.position === 'mainEvent')!;
    plan = savePlan(
      db,
      withSlot(plan, main.id, {
        redId: champion.id,
        blueId: challenger.id,
        divisionId: divisionId as never,
        status: 'agreed',
        titleKind: 'undisputed',
        rounds: 5,
      }),
    );

    runPlan({ db, plan });
    const top = nightResults(db, planById(db, plan.id)!)[0]!;
    if (top.winner) expect(['won', 'defended']).toContain(top.title);
    if (top.winner?.id === champion.id) expect(top.title).toBe('defended');
    if (top.winner?.id === challenger.id) expect(top.title).toBe('won');
  });

  it('put the player’s own night at the top of the sport’s feed, marked as theirs', () => {
    const { db, plan } = ranCard();
    const ran = runPlan({ db, plan })!;
    const loud = readNews(db)
      .filter((n) => n.weight !== 'minor')
      .slice(0, 8);
    const headline = loud.find((n) => (n.id as string).includes(`night:${ran.night.id}`));
    expect(headline?.involvesPlayer).toBe(true);
    expect(headline?.headline).toContain(ran.night.name);
  });

  it('keep the settled revenue split on the plan', () => {
    const { db, plan } = ranCard();
    const ran = runPlan({ db, plan })!;
    const outcome = planById(db, plan.id)!.outcome!;
    expect(outcome.gate! + outcome.broadcast! - outcome.costs!).toBeCloseTo(ran.profit, 0);
  });
});

describe('the callouts', () => {
  it('name somebody free, and go onto the next card with room in one step', () => {
    const { db, promotion, plan } = ranCard();
    runPlan({ db, plan });
    setWorld(db, { day: plan.day });

    const callouts = calloutsFor(db, planById(db, plan.id)!);
    expect(callouts.length).toBeGreaterThan(0);
    expect(callouts.length).toBeLessThanOrEqual(3);
    const booked = bookingsFor(db, promotion.id as string);
    for (const c of callouts) {
      expect(c.targetId).not.toBe(c.winnerId);
      expect(booked.has(c.targetId)).toBe(false);
    }

    // No card to put it on yet: said, not thrown.
    const none = pencilCallout(db, callouts[0]!);
    expect('reason' in none).toBe(true);

    const next = createPlan({ db, promotion, day: plan.day + 120 });
    const placed = pencilCallout(db, callouts[0]!);
    expect('plan' in placed && placed.plan.id).toBe(next.id);
    if ('plan' in placed) {
      const bout = placed.plan.slots.find((s) => s.id === placed.slotId)!.bout!;
      expect(bout.status).toBe('draft');
      expect([bout.redId, bout.blueId]).toContain(callouts[0]!.targetId);
    }
  });
});

describe('the week in review', () => {
  it('reports the roster’s results and the money over the span', () => {
    const { db, promotion, plan } = ranCard();
    const before = (db.promotions.findById(promotion.id as string) as Promotion).budget;
    const from = getWorld(db).day;
    advanceTo(db, plan.day);
    runPlan({ db, plan: planById(db, plan.id)! });
    advanceTo(db, plan.day + 3);

    const review = reviewSpan(db, from, getWorld(db).day, before);
    expect(review.moneyDelta).toBeDefined();
    expect(review.results.length).toBeGreaterThanOrEqual(plannedBouts(plan).length);
    for (const r of review.results) expect(r.day).toBeGreaterThanOrEqual(from);
  });
});
