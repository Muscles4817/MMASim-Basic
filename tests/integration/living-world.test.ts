/**
 * Is the world alive?
 *
 * `advanceRoster` used to age the roster and nothing else, so the division a player climbed
 * was frozen at its seeded state: rankings never moved, belts never changed hands, and no
 * other fighter's record ever gained a line. These assert the opposite, and they assert the
 * bounds — a world that moves too fast is as broken as one that does not move at all.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { rankDivision, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld, readNews } from '../../packages/app/src/game/world';

const game = (seed = 'living') => createNewGame({ adapter: undefined, seed });
const fighters = (db: ReturnType<typeof game>) => db.fighters.findAll() as Fighter[];
const promos = (db: ReturnType<typeof game>) => db.promotions.findAll() as unknown as Promotion[];
const totalBouts = (db: ReturnType<typeof game>) =>
  fighters(db).reduce((a, f) => a + f.record.length, 0);

describe('the world moves', () => {
  it('runs fights the player had nothing to do with', () => {
    const db = game();
    const me = fighters(db)[0]!;
    const before = totalBouts(db);

    const out = advanceWorld(db, 0, 365, me.id);

    expect(out.fights).toBeGreaterThan(60);
    expect(totalBouts(db)).toBeGreaterThan(before);
  });

  it('leaves the player alone — their career is their own', () => {
    const db = game();
    const me = fighters(db)[0]!;
    const beforeRecord = me.record.length;

    advanceWorld(db, 0, 365, me.id);

    const after = db.fighters.findById(me.id as string) as Fighter;
    expect(after.record.length).toBe(beforeRecord);
  });

  it('reshuffles a division over a year', () => {
    const db = game();
    const me = fighters(db)[0]!;
    const division = me.divisionId;
    const promotion = promos(db)[0]!;

    const top = () =>
      rankDivision(fighters(db), division, promotion.id, 0, promotion.champions[division])
        .slice(0, 5)
        .map((r) => r.fighter.id as string)
        .join(',');

    const before = top();
    advanceWorld(db, 0, 365, me.id);
    expect(top()).not.toBe(before);
  });

  it('lets belts change hands without the player', () => {
    // Over five years somebody, somewhere, loses a title. If no belt ever moves, title
    // fights are not being generated and the ladder has no top.
    const db = game('belts');
    const me = fighters(db)[0]!;
    const before = JSON.stringify(promos(db).map((p) => p.champions));

    for (let year = 0; year < 5; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }

    expect(JSON.stringify(promos(db).map((p) => p.champions))).not.toBe(before);
  });

  it('retires people and replaces them, so divisions neither empty nor bloat', () => {
    const db = game('churn');
    const me = fighters(db)[0]!;
    const startingRoster = fighters(db).length;

    for (let year = 0; year < 8; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }

    const active = fighters(db).filter((f) => f.retiredDay === undefined);
    const retired = fighters(db).filter((f) => f.retiredDay !== undefined);

    expect(retired.length, 'nobody retired in eight years').toBeGreaterThan(5);
    // Replenishment keeps the sport populated without the roster exploding.
    expect(active.length).toBeGreaterThan(startingRoster * 0.6);
    expect(active.length).toBeLessThan(startingRoster * 2.5);
  });
});

describe('the world stays within its budget', () => {
  it('does nothing expensive for a short block', () => {
    const db = game();
    const me = fighters(db)[0]!;
    const out = advanceWorld(db, 0, 10, me.id);
    expect(out.fights).toBe(0);
  });

  it('caps the work in one call rather than freezing the tab', () => {
    const db = game('budget');
    const me = fighters(db)[0]!;
    // Twenty years in one go — nothing in the game does this, which is the point.
    const out = advanceWorld(db, 0, 365 * 20, me.id);
    expect(out.truncated).toBe(true);
    expect(out.fights).toBeLessThanOrEqual(220);
  });

  it('simulates a realistic camp quickly enough to sit behind a button', () => {
    const db = game('speed');
    const me = fighters(db)[0]!;
    const started = performance.now();
    advanceWorld(db, 0, 12 * 7, me.id);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('the world reports itself', () => {
  it('produces news, weighted rather than a flat wall', () => {
    const db = game('news');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);

    const news = readNews(db);
    expect(news.length).toBeGreaterThan(20);

    // A pyramid: a handful of things that matter, plenty that do not.
    const major = news.filter((n) => n.weight === 'major').length;
    const minor = news.filter((n) => n.weight === 'minor').length;
    expect(minor).toBeGreaterThan(major);
    expect(major).toBeGreaterThan(0);
  });

  it('keeps the feed bounded across a long career', () => {
    const db = game('bounded');
    const me = fighters(db)[0]!;
    for (let year = 0; year < 10; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }
    // Capped per weight, so it cannot grow without bound and cannot become a wall.
    expect(readNews(db).length).toBeLessThanOrEqual(300);
  });

  it('does not evict the history of the sport with its noise', () => {
    // Majors — belts moving, champions retiring — must survive years of ordinary results.
    const db = game('history');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);
    const earlyMajors = readNews(db).filter((n) => n.weight === 'major').length;

    for (let year = 1; year < 6; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }

    const majorsNow = readNews(db).filter((n) => n.weight === 'major');
    expect(majorsNow.length).toBeGreaterThanOrEqual(earlyMajors);
    // And the oldest surviving major should predate the most recent year.
    expect(Math.min(...majorsNow.map((n) => n.day))).toBeLessThan(365 * 5);
  });

  it('names real fighters in its headlines', () => {
    const db = game('names');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);

    const news = readNews(db);
    const names = new Set(fighters(db).map((f) => f.lastName));
    const mentionsSomebody = news.some((n) => [...names].some((name) => n.headline.includes(name)));
    expect(mentionsSomebody).toBe(true);
  });
});

describe('determinism', () => {
  it('produces the same world twice from the same seed', () => {
    const run = () => {
      const db = game('determinism');
      const me = fighters(db)[0]!;
      advanceWorld(db, 0, 365, me.id);
      return readNews(db)
        .map((n) => n.headline)
        .join('|');
    };
    expect(run()).toBe(run());
  });

  it('produces a different world from a different seed', () => {
    const run = (seed: string) => {
      const db = game(seed);
      const me = fighters(db)[0]!;
      advanceWorld(db, 0, 365, me.id);
      return readNews(db)
        .map((n) => n.headline)
        .join('|');
    };
    expect(run('alpha')).not.toBe(run('beta'));
  });
});

describe('the roster lives in the same economy the player does', () => {
  it('pays the fighters it simulates', () => {
    // The world used to simulate fights, ageing, belts and retirement while every fighter in
    // it had no money and no contract — so the player was the only person in the sport whose
    // deal could expire, and the market they negotiated in was one-sided.
    const db = game('economy');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);

    const earners = fighters(db).filter((f) => f.id !== me.id && f.lifetimeGross > 0);
    expect(earners.length).toBeGreaterThan(20);
  });

  it('puts the roster under contract, and moves people when deals end', () => {
    const db = game('deals');
    const me = fighters(db)[0]!;
    for (let year = 0; year < 3; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }

    const contracted = fighters(db).filter((f) => f.agreementId !== undefined);
    expect(contracted.length).toBeGreaterThan(30);

    // And somebody, somewhere, changed promotions.
    expect(readNews(db).some((n) => /leaves .* for /i.test(n.headline))).toBe(true);
  });

  it('leaves the bottom of the sport poor', () => {
    // The shape of the economy has to survive contact with the roster, not just the player.
    const db = game('poor');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365 * 2, me.id);

    const active = fighters(db).filter((f) => f.id !== me.id && f.retiredDay === undefined);
    const broke = active.filter((f) => f.bank <= 0);
    expect(broke.length).toBeGreaterThan(0);
  });
});
