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
  MAX_BUZZ_SWING,
  settleNight,
  type EventRevenue,
  type FightResult,
  type Fighter,
  trainingBlocks,
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
    const settled = settleNight({ promotion: p, revenue: revenue(0), results: [] });
    expect(settled.buzzDelta).toBe(0);
    expect(settled.promotion.buzz).toBe(p.buzz);
  });

  it('never swings attention further than a night should', () => {
    // Attention is sticky. A single card cannot make or break a promotion, or the buzz-driven
    // demand term turns into a feedback loop that runs away in a handful of events.
    const p = promotion();
    const spectacular = Array.from({ length: 5 }, () => aFinish());
    const dire = Array.from({ length: 5 }, () => aShutout());
    expect(
      settleNight({ promotion: p, revenue: revenue(0), results: spectacular }).buzzDelta,
    ).toBeLessThanOrEqual(MAX_BUZZ_SWING);
    expect(
      settleNight({ promotion: p, revenue: revenue(0), results: dire }).buzzDelta,
    ).toBeGreaterThanOrEqual(-MAX_BUZZ_SWING);
  });

  it('rewards a good night and punishes a dull one', () => {
    const p = promotion();
    const good = settleNight({ promotion: p, revenue: revenue(0), results: [aFinish()] });
    const bad = settleNight({ promotion: p, revenue: revenue(0), results: [aShutout()] });
    // A competitive decision is a good night too, which is the case the old metric got most
    // wrong — it rated a grinding decision above a knockout.
    const close = settleNight({ promotion: p, revenue: revenue(0), results: [aCloseDecision()] });
    expect(close.buzzDelta).toBeGreaterThan(0);
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
      results: [aShutout()],
    });
    const ruinousAndGreat = settleNight({
      promotion: p,
      revenue: revenue(-2000),
      results: [aFinish()],
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

/*
 * Results built by hand so the buzz maths is tested directly.
 *
 * These used to vary strike *volume*, which `deliveryScore` deliberately ignores — a close
 * decision is a close decision at twenty strikes or two hundred, and rewarding volume is how
 * the old metric ended up rating a grinding decision above a knockout. What matters now is
 * whether it finished and whether it was close, so those are what the fixtures vary.
 */
function aFinish(round = 2): FightResult {
  return {
    method: 'ko',
    round,
    timeSeconds: 120,
    winnerId: 'f_red',
    stats: {
      red: { significantStrikesLanded: 22, knockdowns: 1, submissionAttempts: 0 },
      blue: { significantStrikesLanded: 14, knockdowns: 0, submissionAttempts: 0 },
    },
  } as unknown as FightResult;
}

function aCloseDecision(): FightResult {
  return {
    method: 'decisionSplit',
    round: 3,
    timeSeconds: 900,
    stats: {
      red: { significantStrikesLanded: 78, knockdowns: 0, submissionAttempts: 1 },
      blue: { significantStrikesLanded: 71, knockdowns: 0, submissionAttempts: 0 },
    },
  } as unknown as FightResult;
}

function aShutout(): FightResult {
  return {
    method: 'decisionUnanimous',
    round: 3,
    timeSeconds: 900,
    stats: {
      red: { significantStrikesLanded: 95, knockdowns: 0, submissionAttempts: 0 },
      blue: { significantStrikesLanded: 11, knockdowns: 0, submissionAttempts: 0 },
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

describe('a camp cannot be gamed by splitting it', () => {
  it('makes one long camp beat three short ones', () => {
    /*
     * Diminishing returns within a camp, with no cost to starting a new one, made splitting
     * strictly correct: three four-week camps came to 3.00 blocks where one twelve-week camp
     * came to 2.28. A player who noticed got a 32% permanent advantage over one who read the
     * training screen and picked the long camp it recommends — the worst kind of hidden
     * mechanic, because it punishes playing the game as presented.
     */
    expect(trainingBlocks(4) * 3).toBeLessThan(trainingBlocks(12));
    expect(trainingBlocks(3) * 4).toBeLessThan(trainingBlocks(12));
    expect(trainingBlocks(2) * 6).toBeLessThan(trainingBlocks(12));

    /*
     * The general property, and the one worth stating: no way of splitting twelve weeks
     * carries a meaningful advantage over spending them in one camp.
     *
     * Two six-week camps land at 2.00 blocks against 1.99 for the single twelve — parity
     * rather than an exploit, and deliberately left there. Driving every split strictly
     * negative needs a ramp near 2.5 weeks, which pushes the efficiency peak out to ten weeks
     * and away from the eight the sport actually uses. A 0.6% edge nobody can perceive is a
     * better trade than a model whose optimum is wrong.
     */
    for (const [weeks, count] of [
      [2, 6],
      [3, 4],
      [4, 3],
      [6, 2],
    ] as const) {
      const split = trainingBlocks(weeks) * count;
      expect(
        split / trainingBlocks(12),
        `${count} x ${weeks}wk beats one 12wk camp by too much`,
      ).toBeLessThan(1.02);
    }
  });

  it('leaves eight weeks the most efficient camp there is', () => {
    // Falls out of the arithmetic rather than being chosen: maximising ((w−2)/4)^0.75 / w
    // gives w = 8 exactly. The model's optimum being the sport's standard camp length is a
    // good sign it is the right model.
    const perWeek = (w: number) => trainingBlocks(w) / w;
    for (const weeks of [3, 4, 5, 6, 7, 9, 10, 12, 16, 20]) {
      expect(perWeek(8), `${weeks} weeks beat eight`).toBeGreaterThan(perWeek(weeks));
    }
  });

  it('makes a very short camp worth little', () => {
    // Under the ramp a two-week camp develops nothing at all. That is the claim: a fortnight
    // is spent getting back to where you left off.
    expect(trainingBlocks(2)).toBe(0);
    expect(trainingBlocks(1)).toBe(0);
  });
});
