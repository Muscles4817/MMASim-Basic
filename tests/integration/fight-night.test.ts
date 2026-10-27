/**
 * Fight night is unmissable.
 *
 * The promoter audit found the loop broken at its most important point. Nothing stopped the clock
 * on the player's own card day, so "a month" from the week before a show walked past it; the
 * card, now dated in the past, vanished from the dashboard and the calendar (both read forward
 * from today) while every fighter on it stayed blocked as booked on another card — for ever,
 * because nothing would ever run it. And a card that *had* run could be run again.
 *
 * These pin the four properties that close it: the clock stops on the night, walking past the
 * night cancels the card and costs something, a cancelled card frees its fighters, and a card
 * runs exactly once.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  plannedBouts,
  relationshipWith,
  type Fighter,
  type NewsItem,
  type Promotion,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { readInbox } from '../../packages/app/src/game/inbox';
import {
  MISSED_CARD_BUZZ,
  blockerFor,
  createPlan,
  fightNightOn,
  nightResults,
  planById,
  planName,
  plansFor,
  promoterContext,
  runPlan,
} from '../../packages/app/src/game/plans';
import { advanceThrough, agreed, filledPlan } from '../helpers/plans';

const game = () => createNewGame({ adapter: undefined, era: '2026' });

const asPromoter = (db: ReturnType<typeof game>) => {
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return promotion;
};

/** A promoter with one fully signed card three weeks out. */
function withCard() {
  const db = game();
  const promotion = asPromoter(db);
  const today = getWorld(db).day;
  const plan = agreed(db, filledPlan({ db, promotion, day: today + 21, today }));
  return { db, promotion, today, plan };
}

describe('the clock stops on fight night', () => {
  it('will not run through the player’s own card, however far it is asked to go', () => {
    const { db, plan, today } = withCard();

    const result = advanceThrough(db, today + 60);

    expect(result.day).toBe(plan.day);
    expect(getWorld(db).day).toBe(plan.day);
    expect(result.fightNight?.id).toBe(plan.id);
    expect(fightNightOn(db, plan.promotionId as string, plan.day)?.id).toBe(plan.id);
  });

  it('does not stop for a card that has already run', () => {
    const { db, plan, today } = withCard();
    runPlan({ db, plan });

    const result = advanceTo(db, today + 60);
    expect(result.day).toBe(today + 60);
    expect(result.fightNight).toBeUndefined();
  });
});

describe('a card nobody ran', () => {
  it('is cancelled once its date has passed, rather than left in the past', () => {
    const { db, plan } = withCard();
    advanceThrough(db, plan.day);
    // Named on the night: a main event that fell out in the run-up changes the name.
    const name = planName(db, planById(db, plan.id)!);
    advanceTo(db, plan.day + 1);

    const after = planById(db, plan.id)!;
    expect(after.status).toBe('cancelled');
    // Keeps the name it had: derived after the fact it would take the next live card's number.
    expect(after.cancelled).toEqual({ day: plan.day, reason: 'missed', name });
    expect(planName(db, after)).toBe(name);
    expect(plansFor(db, plan.promotionId as string).map((p) => p.id)).not.toContain(plan.id);
  });

  it('frees everybody who was on it', () => {
    /*
     * The audit's sharpest symptom: the fighters on a missed card read "Booked on another card
     * within six weeks" against every card the player tried to build afterwards.
     */
    const { db, promotion, plan } = withCard();
    const someone = db.fighters.findById(plannedBouts(plan)[0]!.redId as string) as Fighter;

    const later = createPlan({ db, promotion, day: plan.day + 30 });
    const blocker = (day: number) =>
      blockerFor({ ctx: promoterContext({ db, promotion, day }), fighter: someone, plan: later });
    expect(blocker(plan.day)).toMatch(/another card/i);

    advanceThrough(db, plan.day);
    advanceTo(db, plan.day + 1);

    expect(blocker(plan.day + 1) ?? '').not.toMatch(/another card/i);
  });

  it('costs buzz and goodwill, and says so', () => {
    const { db, promotion, plan } = withCard();

    advanceThrough(db, plan.day);
    const name = planName(db, planById(db, plan.id)!);
    // Whoever is still signed on the night: anybody who fell out in the run-up is not on it.
    const signedId = plannedBouts(planById(db, plan.id)!)[0]!.redId as string;
    const before = db.fighters.findById(signedId) as Fighter;
    const buzzBefore = (db.promotions.findById(promotion.id as string) as Promotion).buzz;
    const result = advanceTo(db, plan.day + 1);

    expect(result.missed?.map((p) => p.id)).toEqual([plan.id]);

    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.buzz).toBe(Math.max(1, buzzBefore - MISSED_CARD_BUZZ));

    // Remembered rather than added to a number the next settlement recomputes. Doc 34 C3.
    const fighter = db.fighters.findById(signedId) as Fighter;
    expect(fighter.ledger?.slice(-1)[0]).toMatchObject({
      kind: 'cardCancelled',
      promotionId: promotion.id,
    });
    expect((before.ledger ?? []).length).toBeLessThan(fighter.ledger!.length);
    expect(relationshipWith(fighter, promotion.id, plan.day + 1).score).toBeLessThan(0);

    const news = db.news.findAll() as NewsItem[];
    expect(news.some((n) => n.kind === 'cancellation' && n.headline.includes(name))).toBe(true);
    expect(name).not.toMatch(/undefined/);
    expect(readInbox(db).some((i) => i.link?.id === plan.id && /cancelled/i.test(i.title))).toBe(
      true,
    );
  });
});

describe('a card that ran', () => {
  it('runs once', () => {
    const { db, plan } = withCard();
    expect(runPlan({ db, plan })).toBeDefined();
    expect(runPlan({ db, plan: planById(db, plan.id)! })).toBeUndefined();
    // The stale copy a screen might still be holding cannot do it either.
    expect(runPlan({ db, plan: { ...plan, status: 'run' } })).toBeUndefined();
  });

  it('keeps its results and what it made, to be read back later', () => {
    const { db, plan } = withCard();
    const ran = runPlan({ db, plan })!;

    const stored = planById(db, plan.id)!;
    expect(stored.outcome).toEqual({
      profit: ran.profit,
      buzzDelta: ran.buzz,
      gate: ran.revenue.gate,
      broadcast: ran.revenue.broadcast,
    });
    expect(ran.night.attendance).toBe(ran.attendance);

    const results = nightResults(db, stored);
    expect(results).toHaveLength(ran.night.bouts.length);
    for (const row of results) {
      expect(row.how.length).toBeGreaterThan(0);
      if (row.winner) expect([row.red?.id, row.blue?.id]).toContain(row.winner.id);
    }
  });
});
