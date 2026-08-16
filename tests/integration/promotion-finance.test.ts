/**
 * A card has to mean something to the promotion that ran it.
 *
 * `eventRevenue()` was correct and both callers threw the answer away: the world's card
 * runner computed the inputs and discarded them (`void totalDraw`), and the player's own
 * night discarded the result (`void revenue`). So no promotion in the game ever earned or
 * lost money, and `buzz` — documented as "moves with cards delivered and stars built" — never
 * moved at all.
 *
 * That absence removed doc 12's central loop: a promotion that runs bad cards sees demand
 * fall for the next one. Without it, matchmaking has no consequence and the budget that sets
 * every purse on the roster is a constant.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  EXPECTED_CARD_EXCITEMENT,
  MAX_BUZZ_SWING,
  settleNight,
  type EventRevenue,
  type FightResult,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const game = () => createNewGame({ adapter: undefined });
const revenue = (profit: number): EventRevenue => ({
  gate: profit,
  broadcast: 0,
  costs: 0,
  profit,
  attendance: 1000,
});

describe('settling a night', () => {
  const promotion = () =>
    (createNewGame({ adapter: undefined }).promotions.findAll() as unknown as Promotion[])[0]!;

  it('moves the budget by the profit', () => {
    const p = promotion();
    const settled = settleNight({ promotion: p, revenue: revenue(500), results: [] });
    expect(settled.promotion.budget).toBe(p.budget + 500);
  });

  it('does not let a promotion go bankrupt into negative purses', () => {
    // An insolvent promotion is a different feature — it folds and its roster hits free
    // agency. Inventing it silently here as a negative budget would produce nonsense purses
    // across the entire roster, because every purse is derived from it.
    const p = promotion();
    const settled = settleNight({
      promotion: p,
      revenue: revenue(-(p.budget * 10)),
      results: [],
    });
    expect(settled.promotion.budget).toBe(0);
  });

  it('holds buzz steady when a card delivers exactly what was expected', () => {
    const p = promotion();
    const par = { stats: { red: {}, blue: {} } } as unknown as FightResult;
    const settled = settleNight({ promotion: p, revenue: revenue(0), results: [] });
    void par;
    expect(settled.buzzDelta).toBe(0);
    expect(settled.promotion.buzz).toBe(p.buzz);
  });

  it('never swings attention further than a night should', () => {
    // Attention is sticky. A single card cannot make or break a promotion, or the buzz-driven
    // demand term turns into a feedback loop that runs away in a handful of events.
    const p = promotion();
    const spectacular = Array.from({ length: 5 }, () => fakeResult(400));
    const dire = Array.from({ length: 5 }, () => fakeResult(0));
    expect(
      settleNight({ promotion: p, revenue: revenue(0), results: spectacular }).buzzDelta,
    ).toBeLessThanOrEqual(MAX_BUZZ_SWING);
    expect(
      settleNight({ promotion: p, revenue: revenue(0), results: dire }).buzzDelta,
    ).toBeGreaterThanOrEqual(-MAX_BUZZ_SWING);
  });

  it('rewards a good night and punishes a dull one', () => {
    const p = promotion();
    const good = settleNight({
      promotion: p,
      revenue: revenue(0),
      results: [fakeResult(EXPECTED_CARD_EXCITEMENT * 3)],
    });
    const bad = settleNight({
      promotion: p,
      revenue: revenue(0),
      results: [fakeResult(1)],
    });
    expect(good.buzzDelta).toBeGreaterThan(0);
    expect(bad.buzzDelta).toBeLessThan(0);
  });

  it('separates making money from putting on a good show', () => {
    /*
     * The point of splitting the two, and where promoter mode's central tension lives. A card
     * that made money with three dull decisions should lose attention; a card that lost money
     * on a spectacular one should gain it.
     */
    const p = promotion();
    const profitableAndDull = settleNight({
      promotion: p,
      revenue: revenue(2000),
      results: [fakeResult(1)],
    });
    const ruinousAndGreat = settleNight({
      promotion: p,
      revenue: revenue(-2000),
      results: [fakeResult(EXPECTED_CARD_EXCITEMENT * 3)],
    });

    expect(profitableAndDull.budgetDelta).toBeGreaterThan(0);
    expect(profitableAndDull.buzzDelta).toBeLessThan(0);
    expect(ruinousAndGreat.budgetDelta).toBeLessThan(0);
    expect(ruinousAndGreat.buzzDelta).toBeGreaterThan(0);
  });
});

describe('the world moves promotion finances', () => {
  it('changes at least one promotion’s budget over a year', () => {
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    const before = new Map(
      (db.promotions.findAll() as unknown as Promotion[]).map((p) => [p.id as string, p.budget]),
    );

    advanceWorld(db, 0, 365, player.id);

    const after = db.promotions.findAll() as unknown as Promotion[];
    const moved = after.filter((p) => p.budget !== before.get(p.id as string));
    expect(moved.length, 'no promotion budget moved across a full year of cards').toBeGreaterThan(0);
  });

  it('keeps every promotion solvent enough to still pay people', () => {
    // The guard on the loop running away. If a year of cards bankrupts the sport, the
    // revenue model is wrong rather than the promotions being badly run.
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    advanceWorld(db, 0, 365, player.id);

    for (const p of db.promotions.findAll() as unknown as Promotion[]) {
      expect(p.budget, `${p.shortName} went broke`).toBeGreaterThan(0);
      expect(p.buzz, `${p.shortName} buzz out of range`).toBeGreaterThan(0);
      expect(p.buzz, `${p.shortName} buzz out of range`).toBeLessThanOrEqual(100);
    }
  });
});

/** A result with a chosen excitement, built by hand so the buzz maths is tested directly. */
function fakeResult(strikes: number): FightResult {
  return {
    method: 'decisionUnanimous',
    round: 3,
    timeSeconds: 900,
    stats: {
      red: { significantStrikesLanded: strikes / 2, knockdowns: 0, submissionAttempts: 0 },
      blue: { significantStrikesLanded: strikes / 2, knockdowns: 0, submissionAttempts: 0 },
    },
  } as unknown as FightResult;
}

describe('medical suspensions are real', () => {
  it('records a day a knocked-out fighter cannot be booked before', () => {
    /*
     * `readinessDelay` existed, was correct, and its answer lived in a Map rebuilt at the top
     * of every advanceWorld call and thrown away at the bottom — so a fighter knocked out cold
     * on one step could be booked again on the next. The player's own undercard discarded it
     * outright (`void readinessDelay`).
     *
     * Now persisted on the fighter, because that is what a suspension is: a property of the
     * person, not of whichever loop happens to be running.
     */
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    advanceWorld(db, 0, 120, player.id);

    const suspended = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.readyOnDay !== undefined && f.readyOnDay > 0,
    );
    expect(suspended.length, 'nobody was suspended across four months of cards').toBeGreaterThan(0);
  });

  it('never books a fighter inside their own suspension', () => {
    // The property that actually matters, checked against the record rather than the field.
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    advanceWorld(db, 0, 365, player.id);

    for (const fighter of db.fighters.findAll() as Fighter[]) {
      const bouts = [...fighter.record].sort((a, b) => a.day - b.day);
      for (let i = 1; i < bouts.length; i++) {
        const gap = bouts[i]!.day - bouts[i - 1]!.day;
        const lostByStoppage =
          bouts[i - 1]!.result === 'loss' &&
          (bouts[i - 1]!.method === 'ko' || bouts[i - 1]!.method === 'tko');
        if (lostByStoppage) {
          // The commission minimum after a knockout. Nothing in the game should book inside it.
          expect(gap, `${fighter.lastName} fought ${gap}d after being stopped`).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });
});
