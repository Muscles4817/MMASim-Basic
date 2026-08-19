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
  it('runs a short block without doing a fortnight of work', () => {
    /*
     * This used to assert that ten days produced **zero** fights, because `advanceWorld`
     * short-circuited any span under its own fourteen-day step and only aged people. That was the
     * assumption the whole clock was built on, and it was why "a day" on the calendar moved the
     * date and changed nothing, and why an offer that arrived on the 3rd was not seen until the
     * 14th. The world ticks days now.
     *
     * What still has to be true is the thing the test was really guarding: a short block is
     * *cheap* and *proportional*. Ten days is ten days of sport, not a fortnight's worth.
     */
    const db = game();
    const me = fighters(db)[0]!;
    const short = advanceWorld(db, 0, 10, me.id);
    expect(short.reached).toBe(10);

    const fresh = game();
    const other = fighters(fresh)[0]!;
    const fortnight = advanceWorld(fresh, 0, 14, other.id);

    // Fewer days, fewer cards. Never more.
    expect(short.fights).toBeLessThanOrEqual(fortnight.fights);
  });

  it('stops on the exact day it is asked to, so the calendar can interrupt', () => {
    // `reached` is what lets `advanceTo` return the day something happened rather than the end
    // of a block the player never chose.
    const db = game();
    const me = fighters(db)[0]!;
    let seen = 0;
    const out = advanceWorld(db, 0, 100, me.id, () => ++seen >= 30);
    expect(seen).toBe(30);
    expect(out.reached).toBe(30);
  });

  it('caps the work in one call rather than freezing the tab', () => {
    /*
     * On the 2026 roster, because the backstop is a guard against *volume* and the 2020 world
     * cannot produce enough of it to reach one — 139 fighters across five promotions run out
     * of bookable matchups long before any budget binds. Testing the cap on a world that can
     * never hit it proves nothing.
     */
    const db = createNewGame({ adapter: undefined, seed: 'budget', era: '2026' });
    const me = fighters(db)[0]!;
    // Twenty years in one go — nothing in the game does this, which is the point.
    const out = advanceWorld(db, 0, 365 * 20, me.id);
    expect(out.truncated).toBe(true);
    /*
     * The budget is now proportional to the span rather than flat, because a flat 220 was
     * written when a card was one or two bouts and the 2026 roster made it bind immediately —
     * a one-year call wants around 700 fights and got 220, which starved the world to six
     * cards a year for the leader. `MAX_FIGHTS_PER_CALL * 12` survives as the absolute
     * backstop this test exists to prove, and twenty years is far past it.
     *
     * Still a soft ceiling: the budget is checked before each night and a card is atomic, so
     * a call can overshoot by at most one card. Stopping mid-event would leave unresolved
     * bouts on a card, which is worse than nine extra simulations.
     */
    expect(out.fights).toBeLessThanOrEqual(220 * 12 + 9);
    // And it must actually bind, or "truncated" is meaningless.
    expect(out.fights).toBeLessThan(365 * 20 * 0.5);
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

describe('the world behaves like a sport, not a burst', () => {
  it('runs cards all year rather than emptying the calendar in March', () => {
    // The fight budget used to be a total rather than a rate, so it bound in the first
    // quarter and every fight in the world happened in the first three months — followed by
    // nine months of nothing but ageing. A player booking a fight in June could not be on a
    // card, and the rankings froze.
    const db = game('calendar');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);

    const events = db.events.findAll() as readonly { day: number }[];
    const quarters = new Set(events.map((e) => Math.floor(e.day / 91)));
    expect(quarters.size).toBeGreaterThan(2);
  });

  it('never fights the same person twice on one night, or twice in a fortnight', () => {
    /*
     * Every card in a step used to carry the step's own `day`, and `eventId` is
     * `evt_${promotionId}_${day}` — so two of the three cards in a fortnight drawing the same
     * promotion produced the same event id, and the second `upsert` overwrote a night that had
     * already been simulated and written to everybody's record. `available` was also built once
     * per fortnight and never pruned, so one fighter could be matched onto two of those cards.
     *
     * Measured over a simulated year of the 2020 world, before the fix: **65 same-day record
     * pairs across 139 fighters, 52 of them the identical bout written twice** — while the
     * schedule looked spotless, because the row that would have shown the collision had been
     * overwritten by the row that collided with it. A duplicated bout inflates records, KO
     * counts, rankings and purses, so this was silent double-counting rather than cosmetic.
     *
     * The fortnight bound is the stronger claim and the one that survives the date fix on its
     * own: distinct dates stop two bouts landing on one day, but only pruning stops a fighter
     * being booked twice in the same step. Measured after: zero of both, and a minimum gap of
     * 47 days on 2020 and 51 on 2026.
     */
    const db = game('double-booking');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);

    for (const fighter of fighters(db)) {
      const record = [...fighter.record].sort((a, b) => a.day - b.day);
      for (let i = 1; i < record.length; i++) {
        const gap = record[i]!.day - record[i - 1]!.day;
        expect(
          gap,
          `${fighter.lastName} fought on day ${record[i - 1]!.day} and again on ${record[i]!.day}`,
        ).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it('gives every card its own date rather than stacking the fortnight on one night', () => {
    // The other half of the same defect, asserted where it is unambiguous: a promotion cannot
    // run two shows on one night, and an event id encodes exactly that pair. Before the fix a
    // simulated year of 2020 ran its cards on 26 distinct dates; it now uses 53.
    const db = game('dates');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 365, me.id);

    const events = db.events.findAll() as readonly { id: string; promotionId: string; day: number }[];
    const slots = new Set(events.map((e) => `${e.promotionId}:${e.day}`));

    expect(slots.size, 'two cards share a promotion and a date').toBe(events.length);
    expect(new Set(events.map((e) => e.day)).size).toBeGreaterThan(events.length / 2);
  });

  it('books a promotion’s own fighters, because exclusivity is the binding term', () => {
    // 91% of bouts previously had at least one fighter not signed to the card's promotion.
    // A contracted fighter appearing on a rival's card is not rare, it is impossible.
    const db = game('exclusive');
    const me = fighters(db)[0]!;
    advanceWorld(db, 0, 200, me.id);

    const events = db.events.findAll() as readonly {
      promotionId: string;
      bouts: readonly { redId: string; blueId: string }[];
    }[];

    let cross = 0;
    let total = 0;
    for (const event of events) {
      for (const bout of event.bouts) {
        total++;
        const red = db.fighters.findById(bout.redId) as Fighter | undefined;
        const blue = db.fighters.findById(bout.blueId) as Fighter | undefined;
        if (red?.promotionId !== event.promotionId || blue?.promotionId !== event.promotionId) {
          cross++;
        }
      }
    }
    /*
     * Not zero, and the reason matters: this is measured *after the fact*, and free agency moves
     * people between a card happening and the test looking at it. So the number is not "bouts
     * booked wrongly", it is "bouts booked correctly plus everybody who has moved since" — and
     * it drifts upward whenever the world runs more cards or moves more people, neither of which
     * is a regression in exclusivity.
     *
     * The bound is therefore a smoke test against the original 91% failure rather than a precise
     * claim, and the precise claim is asserted where it can be: `promoting.test.ts` checks that
     * every bout a promotion is *offered* involves only its own fighters, at the moment of
     * offering, which is the only point at which the question has a definite answer.
     */
    expect(cross / Math.max(1, total)).toBeLessThan(0.5);
  });

  it('never leaves a belt on somebody who has retired', () => {
    // Retirees are filtered out of every card, so a belt on one kills its division forever.
    const db = game('belts2');
    const me = fighters(db)[0]!;
    for (let year = 0; year < 10; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }

    for (const promotion of promos(db)) {
      for (const championId of Object.values(promotion.champions)) {
        if (!championId) continue;
        const champion = db.fighters.findById(championId as string) as Fighter | undefined;
        expect(champion?.retiredDay, `${promotion.shortName} belt on a retired fighter`).toBeUndefined();
      }
    }
  });

  it('gives more than one promotion a champion', () => {
    // Four of five promotions seeded with `champions: {}`, and a title fight required an
    // existing champion — so no champion meant no title fight meant no champion, forever.
    const db = game('belts3');
    const me = fighters(db)[0]!;
    for (let year = 0; year < 6; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }
    const withBelts = promos(db).filter((p) => Object.keys(p.champions).length > 0);
    expect(withBelts.length).toBeGreaterThan(1);
  });

  it('keeps careers to a plausible length', () => {
    // readinessDelay is a medical gate, not a schedule. On its own it let the top of the
    // roster fight five or six times a year for a decade and reach 63-fight records.
    const db = game('records');
    const me = fighters(db)[0]!;
    for (let year = 0; year < 10; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, me.id);
    }
    const longest = Math.max(...fighters(db).map((f) => f.record.length));
    expect(longest).toBeLessThan(40);
  });
});
