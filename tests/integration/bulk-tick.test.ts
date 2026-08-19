/**
 * Does the cheap tick produce the same sport?
 *
 * Doc 27 § 10 measured pre-history at 137 seconds for a five-thousand-fighter world against a
 * ten-second budget, and found that the fight was 13% of it. The other 87% is the work *around*
 * each bout — ranking the whole division to decide what counts as an upset, writing news, settling
 * a gate, awarding bonuses, storing a card, running a camp — all of which is right for a fight
 * somebody watches and waste for a fight that exists so a 34-year-old has a plausible record.
 *
 * `detail: 'bulk'` skips all of it. These are the assertions that say it skipped the *presentation*
 * and not the sport: a fighter who comes out of fifteen years of bulk pre-history and walks into
 * the player's orbit has to be a person the full tick could have produced.
 *
 * Not identical, and never will be — the two paths consume the random stream differently, so the
 * same seed gives different fights. Every claim here is about a distribution.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { overallRating, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld, type WorldDetail } from '../../packages/app/src/game/world';

const YEARS = 6;
const START = 2192;

interface Shape {
  fights: number;
  bouts: number;
  activeFighters: number;
  retired: number;
  meanRecordLength: number;
  meanOverall: number;
  leaderRoster: number;
  championsHeld: number;
  meanHeadTrauma: number;
  wins: number;
  losses: number;
  newsItems: number;
  storedEvents: number;
}

function run(detail: WorldDetail): Shape {
  const db = createNewGame({ adapter: undefined, seed: 'bulk-vs-full', era: '2026' });
  const player = (db.fighters.findAll() as Fighter[])[0]!;
  let fights = 0;
  for (let year = 0; year < YEARS; year++) {
    fights += advanceWorld(db, START + year * 365, START + (year + 1) * 365, {
      fighterId: player.id,
      detail,
    }).fights;
  }

  const all = db.fighters.findAll() as Fighter[];
  const active = all.filter((f) => f.retiredDay === undefined);
  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const leader = promotions.slice().sort((a, b) => b.prestige - a.prestige)[0]!;

  /*
   * Counted off the `record` entries this run produced, not off `summary`.
   *
   * The seeded roster carries a summary — 15-3 and so on — with no bouts behind it, and those
   * wins have no matching losses anywhere in the save because the opponents were never in it. A
   * first version of this counted summaries and read a 62% imbalance in *both* ticks, which says
   * nothing about either of them.
   */
  let wins = 0;
  let losses = 0;
  let bouts = 0;
  for (const f of all) {
    for (const entry of f.record) {
      if (entry.day < START) continue;
      bouts++;
      if (entry.outcome === 'win') wins++;
      else if (entry.outcome === 'loss') losses++;
    }
  }

  return {
    fights,
    bouts,
    activeFighters: active.length,
    retired: all.length - active.length,
    meanRecordLength: bouts / all.length,
    meanOverall: active.reduce((t, f) => t + overallRating(f.attributes), 0) / active.length,
    leaderRoster: active.filter((f) => f.promotionId === leader.id).length,
    championsHeld: promotions.reduce((t, p) => t + Object.keys(p.champions).length, 0),
    meanHeadTrauma: active.reduce((t, f) => t + f.condition.headTrauma, 0) / active.length,
    wins,
    losses,
    newsItems: db.news.findAll().length,
    storedEvents: db.events.findAll().length,
  };
}

const full = run('full');
const bulk = run('bulk');

const describeBoth = (key: keyof Shape) => `${key}: full ${full[key]} bulk ${bulk[key]}`;
const within = (key: keyof Shape, tolerance: number) => {
  const ratio = (bulk[key] as number) / (full[key] as number);
  expect(ratio, describeBoth(key)).toBeGreaterThan(1 - tolerance);
  expect(ratio, describeBoth(key)).toBeLessThan(1 + tolerance);
};

describe('bulk runs the same sport', () => {
  it('holds the same number of fights', () => within('fights', 0.15));

  it('gives everybody the same length of record', () => {
    // The thing pre-history exists to produce. A world whose fighters arrive at the start date
    // with half the record they should have is a world that did not happen.
    within('bouts', 0.15);
    within('meanRecordLength', 0.15);
  });

  it('keeps the records coherent, with a loss for every win', () => {
    // Not approximately. Every bout produces exactly one winner and one loser unless it is drawn,
    // and a statistical shortcut that forgets this is a shortcut that invents wins.
    expect(bulk.wins).toBeGreaterThan(0);
    expect(Math.abs(bulk.wins - bulk.losses) / bulk.wins, describeBoth('wins')).toBeLessThan(0.02);
  });

  it('keeps the same number of people in the sport', () => {
    within('activeFighters', 0.1);
    within('retired', 0.35);
  });

  it('develops them to the same standard', () => {
    // Bulk skips the per-bout fight camp and lets the annual pass cover everybody. That is a real
    // fidelity loss and it must stay a small one, or the world hands the start date a roster of
    // people who never grew into themselves.
    within('meanOverall', 0.06);
  });

  it('wears them down about as much', () => {
    // Damage feeds injuries, retirement and the chin a fighter brings to their next fight, so a
    // bulk career that costs nothing physically is a different career.
    within('meanHeadTrauma', 0.3);
  });

  it('leaves the pyramid the same shape', () => {
    within('leaderRoster', 0.2);
    expect(bulk.championsHeld, describeBoth('championsHeld')).toBeGreaterThan(
      full.championsHeld * 0.8,
    );
  });
});

describe('and none of the presentation', () => {
  it('writes no news', () => {
    expect(full.newsItems).toBeGreaterThan(0);
    expect(bulk.newsItems).toBe(0);
  });

  it('awards no bonuses, because nobody is watching to give them out', () => {
    // Structural rather than timed, and it catches the failure that matters: a bulk tick that has
    // quietly become a full one.
    const db = createNewGame({ adapter: undefined, seed: 'bonus', era: '2026' });
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    advanceWorld(db, START, START + 365, { fighterId: player.id, detail: 'bulk' });
    const bonuses = (db.fighters.findAll() as Fighter[]).flatMap((f) =>
      f.record.filter((r) => r.day >= START && r.bonus !== undefined),
    );
    expect(bonuses).toHaveLength(0);
  });

  it('stores no cards', () => {
    // Fifteen years of a seventy-promotion world is on the order of twenty-two thousand events.
    // Keeping them is a save nobody will ever open.
    expect(full.storedEvents).toBeGreaterThan(0);
    expect(bulk.storedEvents).toBe(0);
  });
});

describe('it is actually faster, which is the entire point', () => {
  it('runs a year of the world faster, though not here, which is the honest part', () => {
    const time = (detail: WorldDetail) => {
      const db = createNewGame({ adapter: undefined, seed: 'speed', era: '2026' });
      const player = (db.fighters.findAll() as Fighter[])[0]!;
      const began = performance.now();
      for (let year = 0; year < 3; year++) {
        advanceWorld(db, START + year * 365, START + (year + 1) * 365, {
          fighterId: player.id,
          detail,
        });
      }
      return performance.now() - began;
    };
    /*
     * Very loose, and deliberately so: **this is the world where bulk helps least.**
     *
     * The saving is in the work done per *bout*, and the shipped 2026 era runs eight promotions
     * and about ninety cards a year, so the per-step costs that bulk does not touch — ageing the
     * roster, the quarterly intake, free agency — are most of its tick. Measured on the world this
     * is actually for, doc 27 § 10's 5,082-fighter pyramid, fifteen years costs 137 seconds at
     * full detail and 49 at bulk. Here it is closer to 1.2×, and a shared CI box is not a
     * benchmark either way.
     *
     * So this is a guard against the bulk path quietly becoming the full one, not a measurement.
     * `tools/prehistory-cost.ts` is the measurement.
     */
    expect(time('full') / time('bulk')).toBeGreaterThan(1.05);
  });
});
