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
   *
   * **Three worlds rather than one**, and that is a repair rather than a widening. A decade of
   * the running world is chaotic: the matchmaker, the injuries and the retirements all consume
   * the same stream, so any change anywhere reorders the whole trajectory. Measured on five seeds
   * against an unmodified codebase, the marginality assertion below passed on **three of them** —
   * so a single draw was testing which seed it happened to be given as much as it was testing the
   * economy, and an unrelated change elsewhere in the sim could fail it without anything about
   * the money having moved.
   *
   * Averaging across worlds is what makes it a claim about the design. Each world is still a full
   * decade, and every one of them must stay solvent.
   */
  const SEEDS = ['economy-a', 'economy-b', 'economy-c'] as const;

  const decade = (seed: string) => {
    const db = createNewGame({ adapter: undefined, era: '2026', seed });
    const start = new Map(promotions(db).map((p) => [p.id as string, p.budget]));
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    for (let year = 0; year < 10; year++) {
      advanceWorld(db, 2192 + year * 365, 2192 + (year + 1) * 365, player.id);
    }
    const growth = (p: Promotion) => p.budget / start.get(p.id as string)! - 1;
    return {
      db,
      seed,
      growth,
      summary: promotions(db)
        .map((p) => `${p.shortName} ${start.get(p.id as string)}→${Math.round(p.budget)}`)
        .join(' | '),
    };
  };

  const worlds = SEEDS.map(decade);
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('leaves every promotion standing after a decade', () => {
    // Solvency is per world, not on average: one bankrupt sport is a bankrupt sport.
    for (const world of worlds) {
      for (const p of promotions(world.db)) {
        expect(p.budget, `${p.shortName} went broke on ${world.seed}. ${world.summary}`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves the bottom of the sport marginal rather than comfortable', () => {
    /*
     * Regional promotions genuinely are marginal businesses, and that pressure is the point of
     * the phase. What must not happen is them being comfortable, which would mean the costs are
     * not doing anything at all.
     *
     * **This assertion has now been rewritten three times, and twice by two people who did not
     * know the other was doing it.** That is worth recording, because all three rewrites were
     * fixing the same thing from different angles and only the third one is sign-safe.
     *
     *  1. *The smallest promotion ends poorer than it started.* A workable proxy only while the
     *     bottom of the sport was quietly collapsing. Promotions earn sponsorship now, so the
     *     bottom survives and the proxy stopped meaning anything.
     *  2. *The tier grows slower than half the leader's growth.* The natural reading of "does not
     *     keep pace", and it inverts: the leader shrinks on two decades in six, and **a fraction
     *     of a negative number is a stricter bound than zero**, so on exactly those draws the
     *     assertion silently demanded the regionals shrink *faster* than the top. Measured on six
     *     start days it held on two of six against master and four of six here; measured on five
     *     seeds elsewhere, three of five. It was never testing what it claimed.
     *  3. What the tier actually does, which is **hover**.
     *
     * On the three worlds this file runs, regional growth reads -0.183, +0.093, +0.331 for a mean
     * of **+0.080** — flat, with noise either side. Zeroing `periodCosts` and re-running the
     * identical three gives a mean of **+1.049**: without a cost base the tier doubles in a
     * decade. Those two regimes are a factor of thirteen apart and 0.4 sits between them, which
     * is what makes this a bound rather than a curve fitted to a draw. (Measured the same way on
     * six single-world decades before this file pooled: -0.173 to +0.213 with costs, +0.737 to
     * +1.210 without, on every draw.)
     *
     * That gap is the claim — a tier that compounds against one that does not — stated in a form
     * that cannot invert when the top of the sport has a bad decade.
     *
     * The relative phrasing is retired rather than kept alongside, because "not keeping pace with
     * the top" is only a claim at all while the top is growing, and whether it grows is a draw.
     * The half of it worth keeping — that the ladder survives — is the test below, which compares
     * final budgets and is monotone.
     */
    const regionalGrowth: number[] = [];
    for (const world of worlds) {
      const regionals = ranked(world.db).filter(
        (p) => p.tier === 'regional' || p.tier === 'developmental',
      );
      regionalGrowth.push(
        regionals.reduce((total, p) => total + world.growth(p), 0) / Math.max(1, regionals.length),
      );
    }

    expect(
      mean(regionalGrowth),
      `the bottom of the sport compounded instead of hovering. ${worlds
        .map((w) => `${w.seed}: ${w.summary}`)
        .join(' || ')}`,
    ).toBeLessThan(0.4);
  });

  it('keeps the leader clearly ahead, so the ladder survives', () => {
    for (const world of worlds) {
      const all = ranked(world.db);
      expect(all[0]!.budget, `${world.seed}: ${world.summary}`).toBeGreaterThan(
        all[all.length - 1]!.budget * 10,
      );
    }
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

    const walked = (db.news.findAll() as readonly { headline: string; detail?: string }[]).filter((n) =>
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

    const walked = (db.news.findAll() as readonly { headline: string }[]).filter((n) =>
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
