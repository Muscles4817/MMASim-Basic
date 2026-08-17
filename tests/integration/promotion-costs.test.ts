/**
 * What a promotion costs to exist, and what it costs to shelve somebody.
 *
 * `budget` was written in exactly one place in the entire codebase — inside `settleNight`, from
 * a card's profit — so a promotion that ran no cards had no outgoings at all. That made **doing
 * nothing strictly correct under pressure** and made hoarding a roster free, and both were on
 * the design review's list of dominant strategies. They share a root: every cost in the model
 * was incurred by *doing something*.
 *
 * `activityBreach()` had the same shape of problem from the other side. It has been written
 * since contracts shipped and had no caller anywhere, which left the most antagonistic move in
 * the sport free: signing somebody purely to keep them off a rival's card cost nothing at all.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  COST_PERIOD_DAYS,
  chargeCosts,
  createRng,
  offerOpponents,
  periodCosts,
  runwayCards,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const promotions = (db: ReturnType<typeof game>) =>
  db.promotions.findAll() as unknown as Promotion[];
const ranked = (db: ReturnType<typeof game>) =>
  promotions(db).slice().sort((a, b) => b.prestige - a.prestige);

describe('the bill for existing', () => {
  const db = game();

  it('charges a promotion that is doing nothing at all', () => {
    // The entire point. Every cost in the model used to be incurred by doing something.
    const p = ranked(db)[0]!;
    expect(periodCosts({ promotion: p, rosterSize: 0 }).total).toBeGreaterThan(0);
  });

  it('charges more for a bigger operation', () => {
    const all = ranked(db);
    const top = periodCosts({ promotion: all[0]!, rosterSize: 100 }).total;
    const bottom = periodCosts({ promotion: all[all.length - 1]!, rosterSize: 100 }).total;
    expect(top).toBeGreaterThan(bottom);
  });

  it('charges for a roster whether or not it is being used', () => {
    // What makes hoarding cost something. Signing people to keep them off a rival's card is
    // doc 16's best antagonistic move and was previously free.
    const p = ranked(db)[0]!;
    const empty = periodCosts({ promotion: p, rosterSize: 0 }).total;
    const full = periodCosts({ promotion: p, rosterSize: 200 }).total;
    expect(full).toBeGreaterThan(empty);
  });

  it('never charges a promotion into a negative budget', () => {
    /*
     * Floored for the same reason `settleNight` floors it: an insolvent promotion is a
     * different feature — it folds and its roster hits free agency — and inventing it as a
     * negative silently produces nonsense purses across the roster, since every purse derives
     * from the budget.
     */
    const p = { ...ranked(db)[0]!, budget: 10 };
    const { promotion } = chargeCosts({ promotion: p, rosterSize: 500, days: 3650 });
    expect(promotion.budget).toBe(0);
  });

  it('charges nothing for no time passing', () => {
    const p = ranked(db)[0]!;
    expect(chargeCosts({ promotion: p, rosterSize: 50, days: 0 }).charged).toBe(0);
  });

  it('scales with the time that passed', () => {
    const p = ranked(db)[0]!;
    const fortnight = chargeCosts({ promotion: p, rosterSize: 50, days: COST_PERIOD_DAYS }).charged;
    const year = chargeCosts({ promotion: p, rosterSize: 50, days: 365 }).charged;
    expect(year).toBeGreaterThan(fortnight * 20);
  });

  it('expresses the budget as cards rather than as a balance', () => {
    // A bank balance tells a player nothing about whether it is a lot. "Four more cards" tells
    // them what decision they are about to face.
    const p = ranked(db)[0]!;
    expect(
      runwayCards({ promotion: p, rosterSize: 50, netPerCard: 400, cardsPerYear: 12 }),
    ).toBeGreaterThan(0);
    // A promotion whose cards make money is not runway-constrained, and saying so is more
    // honest than a huge number a player would read as a target.
    expect(runwayCards({ promotion: p, rosterSize: 50, netPerCard: -5000, cardsPerYear: 12 })).toBe(
      Infinity,
    );
  });
});

describe('the sport can still afford itself', () => {
  /*
   * The guard on the whole change, and it caught a real failure. A first pass sized against a
   * *forecast* of an idealised card charged the leader 14,950k a year against a real card income
   * nearer 8,600k, and bankrupted every promotion in the game inside six years. The world's
   * matchmaker picks from a spread of offers rather than always taking the biggest fight, so a
   * forecast and the running world diverge sharply — and only the running world is real.
   */
  const db = game();
  const start = new Map(promotions(db).map((p) => [p.id as string, p.budget]));
  const player = (db.fighters.findAll() as Fighter[])[0]!;
  for (let year = 0; year < 10; year++) {
    advanceWorld(db, 2192 + year * 365, 2192 + (year + 1) * 365, player.id);
  }

  const summary = promotions(db)
    .map((p) => `${p.shortName} ${start.get(p.id as string)}→${Math.round(p.budget)}`)
    .join(' | ');

  it('leaves every promotion standing after a decade', () => {
    for (const p of promotions(db)) {
      expect(p.budget, `${p.shortName} went broke. ${summary}`).toBeGreaterThan(0);
    }
  });

  it('leaves the bottom of the sport marginal rather than comfortable', () => {
    /*
     * Regional promotions genuinely are marginal businesses, and that pressure is the point of
     * the phase. What must not happen is them being comfortable, which would mean the costs are
     * not doing anything at all.
     *
     * Measured as *relative* growth rather than as absolute decline. The original bound asked
     * that the smallest promotion end poorer than it started, which was a workable proxy only
     * while the bottom of the sport was quietly collapsing — measured across three seeds, every
     * promotion below the top three fell to near zero within a decade, and the single-seed
     * solvency test above passed only because that one draw happened to leave Cage Warriors a
     * few thousand above the line. Promotions now earn sponsorship, so the bottom survives, and
     * "marginal" has to mean what it actually means: not keeping pace with the top.
     */
    const all = ranked(db);
    const smallest = all[all.length - 1]!;
    const leader = all[0]!;

    // Growth *over* the starting position, in proportional terms, so a promotion that shrinks
    // scores negative and one that merely holds station scores zero. Comparing the multiples
    // directly would demand the bottom shrink whenever the top grows, which is the absolute
    // bound this replaced.
    const growth = (p: (typeof all)[number]) => p.budget / start.get(p.id as string)! - 1;

    expect(growth(smallest), `${summary} — the bottom kept pace with the top`).toBeLessThan(
      growth(leader) * 0.5,
    );
  });

  it('keeps the leader clearly ahead, so the ladder survives', () => {
    const all = ranked(db);
    expect(all[0]!.budget, summary).toBeGreaterThan(all[all.length - 1]!.budget * 10);
  });
});

describe('a fighter you never book can walk', () => {
  it('voids the deal of somebody shelved for a year', () => {
    /*
     * `activityBreach()` has had no caller since contracts shipped. Doc 16 names shelving a
     * rival's future star as promoter mode's best antagonistic move *and* its best trap, and
     * only the first half existed.
     *
     * The consequence is the deal voiding rather than a fine, deliberately: a fine is a number,
     * and a fighter walking out and turning up somewhere else is a story.
     */
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    for (let year = 0; year < 4; year++) {
      advanceWorld(db, 2192 + year * 365, 2192 + (year + 1) * 365, player.id);
    }

    const walked = (db.news.findAll() as { headline: string; detail?: string }[]).filter((n) =>
      /walks out on/i.test(n.headline),
    );
    expect(walked.length, 'nobody ever walked out over inactivity').toBeGreaterThan(0);
    // And the reason is stated in the fighter's terms rather than as a rule number.
    expect(walked[0]!.detail).toMatch(/Owed \d+ bouts a year/i);
  });

  it('does not void a deal in its first year', () => {
    /*
     * The guarantee is bouts *per twelve months*. Checking from the day a deal is signed would
     * void every contract in the world on the first tick, since nobody has fought yet.
     */
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    advanceWorld(db, 2192, 2192 + 200, player.id);

    const walked = (db.news.findAll() as { headline: string }[]).filter((n) =>
      /walks out on/i.test(n.headline),
    );
    expect(walked).toHaveLength(0);
  });
});

describe('how a promotion handles a fighter', () => {
  it('offers a protected fighter easier fights than a tested one', () => {
    /*
     * `narrativeControl` is a promotion-wide constant, and doc 13 calls building stars the mode's
     * most interesting long game — but a constant cannot express the thing that actually happens,
     * which is a promotion pushing *this* fighter and protecting *that* one at the same time.
     */
    const db = game();
    const promotion = ranked(db)[0]!;
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id,
    );
    const subject = roster[0]!;
    const pool = roster.filter((f) => f.divisionId === subject.divisionId);

    const offersFor = (handling: Fighter['handling']) =>
      offerOpponents({ ...subject, handling }, pool, promotion, 2192, createRng('handling'), {
        promotionId: promotion.id,
      });

    const protectedSteps = offersFor('protect').map((o) => o.step);
    const testedSteps = offersFor('test').map((o) => o.step);

    expect(Math.max(...protectedSteps)).toBeLessThanOrEqual(Math.max(...testedSteps));
  });
});
