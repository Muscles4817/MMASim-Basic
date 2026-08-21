/**
 * Does a generated world work?
 *
 * Doc 27's whole argument is that the game should build its own sport rather than ship a snapshot
 * of the real one — the legal constraint is the driver, but a generated world is also the only kind
 * that can be a *different* world the second time you play.
 *
 * The bar is not "it produced some data". It is that a player who starts one of these cannot tell
 * it from a hand-authored save: the pyramid has a shape, the records have opponents behind them,
 * the belts are held by people who won them, and the calendar says the date it is supposed to.
 *
 * Small only, because Medium is eleven seconds and Large is twenty-five (doc 27 § 10.6). The cost
 * of the larger sizes is measured by `tools/prehistory-cost.ts`, which is where a measurement
 * belongs; this is a correctness suite.
 */

import { describe, expect, it } from 'vitest';
import {
  DAY_2026,
  PREHISTORY_YEARS,
  WORLD_SIZE_META,
  getWorld,
  worldSizeMeta,
  type GenerationProgress,
} from '@mmasim/data';
import { fighterAge, overallRating, type Fighter, type Promotion } from '@mmasim/engine';
import { generateWorld } from '../../packages/app/src/game/newWorld';
import { advanceWorld } from '../../packages/app/src/game/world';

const progress: GenerationProgress[] = [];
const db = await generateWorld({
  size: 'small',
  seed: 'generated-world-test',
  // A frame that never comes is the whole suite hanging.
  yieldToUi: async () => {},
  onProgress: (p) => progress.push(p),
});

const fighters = db.fighters.findAll() as Fighter[];
const active = fighters.filter((f) => f.retiredDay === undefined);
const promotions = db.promotions.findAll() as unknown as Promotion[];
const byPrestige = promotions.slice().sort((a, b) => b.prestige - a.prestige);
const rosterOf = (p: Promotion) => active.filter((f) => f.promotionId === p.id);

describe('it builds a sport', () => {
  it('produces a world of about the size that was asked for', () => {
    const target = worldSizeMeta('small').fighters;
    expect(fighters.length).toBeGreaterThan(target * 0.7);
    expect(fighters.length).toBeLessThan(target * 1.4);
  });

  it('builds a pyramid rather than a plateau', () => {
    /*
     * Doc 26 § 2.2's most important structural fact: **there is only one apex.** The leader is not
     * the biggest of several majors, it is a different category — and a generator that produces
     * five promotions of roughly equal size has produced a different sport.
     */
    const apex = byPrestige[0]!;
    expect(promotions.filter((p) => p.tier === 'global')).toHaveLength(1);
    expect(rosterOf(apex).length).toBeGreaterThan(rosterOf(byPrestige[1]!).length);

    // And a base wider than the top, which is the other half of the shape.
    const bottom = promotions.filter((p) => p.prestige < 30);
    expect(bottom.length).toBeGreaterThan(promotions.filter((p) => p.prestige > 60).length);
  });

  /*
   * Every promotion can put on a card in every division it advertises.
   *
   * The generator used to hand each tier a fixed division count and divide the roster across it,
   * so the divisions got thinner as the promotions got smaller rather than the promotions running
   * fewer weight classes. Measured on this world before the change: every national show ran nine
   * divisions **four** fighters deep, every feeder seven with two, and every local show five with
   * **one** — and each of them advertised a women's division it had generated nobody for. A player
   * who signed for one found three other people at their weight, which is what
   * `offerOpponents`'s cross-promotional fallback was quietly papering over.
   */
  describe('runs the divisions it can actually staff', () => {
    const depthOf = (p: Promotion, divisionId: string) =>
      active.filter((f) => f.promotionId === p.id && f.divisionId === divisionId).length;

    it('never advertises a division it has nobody in', () => {
      const empty = promotions.flatMap((p) =>
        p.divisions.filter((d) => depthOf(p, d as string) === 0).map((d) => `${p.shortName} ${d}`),
      );
      expect(empty).toEqual([]);
    });

    it('never signs anybody to a promotion that does not stage their division', () => {
      // A signing nobody can ever book. The intake weighted by headcount alone and never asked
      // whether the promotion ran the weight class at all.
      const stranded = active.filter((f) => {
        const p = promotions.find((x) => x.id === f.promotionId);
        return p !== undefined && !p.divisions.includes(f.divisionId);
      });
      expect(stranded.map((f) => f.lastName)).toEqual([]);
    });

    it('keeps most divisions deep enough to make a card', () => {
      /*
       * Not all of them: eight years of pre-history retires people, and a division that dips to
       * five for a while is a living sport rather than a broken generator. A *third* of the sport
       * sitting below the floor is the generator.
       */
      const depths = promotions.flatMap((p) => p.divisions.map((d) => depthOf(p, d as string)));
      const thin = depths.filter((n) => n < 4);
      expect(thin.length / depths.length).toBeLessThan(0.2);
      expect(Math.min(...depths)).toBeGreaterThan(1);
    });

    it('puts the base of the sport across the weight classes, not all in one', () => {
      // A small promotion runs a few divisions rather than all of them, and taking "the first
      // few" every time stacked every local show in the world into flyweight.
      const base = promotions.filter((p) => p.prestige < 30);
      const staged = new Set(base.flatMap((p) => p.divisions.map((d) => d as string)));
      expect(base.length).toBeGreaterThan(4);
      expect(staged.size).toBeGreaterThan(4);
    });
  });

  it('names nobody real, which is the constraint the whole design starts from', () => {
    const banned =
      /ufc|ultimate fighting|bellator|\bone championship\b|pfl|rizin|ksw|cage warriors/i;
    for (const p of promotions) {
      expect(banned.test(p.name), p.name).toBe(false);
      expect(banned.test(p.shortName), p.shortName).toBe(false);
    }
  });
});

describe('and eight years of it having happened', () => {
  it('opens on the era\u2019s start date', () => {
    // Pre-history runs *up to* the start date rather than past it, so the clock arrives where it
    // belongs instead of being wound back onto it.
    expect(getWorld(db).day).toBe(DAY_2026);
    expect(progress.some((p) => p.label.includes(String(PREHISTORY_YEARS)))).toBe(true);
  });

  it('anchors the day the player arrives, so \u201cnever booked here\u201d has a meaning', () => {
    expect(getWorld(db).startedDay).toBe(DAY_2026);
  });
});

/*
 * The world is dated, and the dates agree with each other.
 *
 * Every assertion in this block failed before the generator was rebased onto doc 27 § 4.2, and the
 * suite did not notice: the only clock test asserted `day > 0`. The population was built *at* the
 * start date, simulated eight years past it and the clock wound back — and the clock was the one
 * thing that wound back. Everything the run stamped in absolute game days stayed in what had
 * become the player's future, which left 90% of the roster serving a medical suspension ending
 * years after the game began, 53 children holding professional records, and a sport that staged
 * two cards in four months.
 */
describe('the world is internally dated', () => {
  const day = getWorld(db).day;

  it('has nobody whose last fight is in the future', () => {
    const ahead = active.filter((f) => (f.record[f.record.length - 1]?.day ?? -1) > day);
    expect(ahead.map((f) => f.lastName)).toEqual([]);
  });

  it('has no bout anywhere dated after the start date', () => {
    // Not only the last one: a single forward-dated entry means the whole history is misplaced.
    const worst = Math.max(day, ...fighters.flatMap((f) => f.record.map((r) => r.day)));
    expect(worst).toBeLessThanOrEqual(day);
  });

  it('carries only suspensions a real fight could have caused', () => {
    /*
     * `readinessDelay` caps at 260 days, so anything past a year is arithmetic rather than a
     * knockout — which is exactly the shape the wind-back produced, up to 3,063 days.
     */
    const longest = Math.max(0, ...active.map((f) => (f.readyOnDay ?? 0) - day));
    expect(longest).toBeLessThanOrEqual(365);
  });

  it('leaves most of the roster bookable on the day the player arrives', () => {
    // A third of a division carrying a suspension is the design (see `depth.ts`); nine in ten is
    // a broken world that no promoter can put a card together in.
    const bookable = active.filter((f) => (f.readyOnDay ?? 0) <= day);
    expect(bookable.length / active.length).toBeGreaterThan(0.5);
  });

  it('crowns nobody who has retired', () => {
    for (const promotion of promotions) {
      for (const championId of Object.values(promotion.champions)) {
        const champion = fighters.find((f) => f.id === championId);
        expect(champion?.retiredDay, `${promotion.shortName} champion has retired`).toBeUndefined();
      }
    }
  });
});

describe('the people are plausible', () => {
  const day = getWorld(db).day;
  const ages = active.map((f) => fighterAge(f, day));

  it('has no children on the roster, and certainly none with a professional record', () => {
    // Ageing is the one thing pre-history definitely does to everybody, so a population built with
    // the ages the player should end up seeing arrives eight years too old — and the fighters who
    // *debuted* during the run come out the other side as children holding records.
    const young = active.filter((f) => fighterAge(f, day) < 18);
    expect(young.map((f) => f.lastName)).toEqual([]);
  });

  it('looks like the roster a person wrote by hand', () => {
    /*
     * The hand-authored 2026 era, measured: min 20, median 28, max 42. The generated world is
     * held to the same band rather than to a number of its own, because "is this a plausible
     * roster" has exactly one reference in the codebase and this is it.
     */
    const sorted = [...ages].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(25);
    expect(median).toBeLessThanOrEqual(32);
    expect(sorted[sorted.length - 1]!).toBeLessThanOrEqual(46);
  });
});

describe('the sport is still moving when the player arrives', () => {
  it('stages cards once the clock starts', () => {
    /*
     * The consequence that made the defect worth chasing rather than merely noting. Every
     * matchmaking path filters on `readyOnDay`, so a roster that is 90% suspended does not
     * produce a quieter sport, it produces a stopped one.
     */
    const day = getWorld(db).day;
    const before = db.events.findAll().length;
    advanceWorld(db, day, day + 120, {});
    expect(db.events.findAll().length - before).toBeGreaterThan(5);
  });

  it('gives fighters records with real opponents behind them', () => {
    const withHistory = active.filter((f) => f.record.length >= 3);
    expect(withHistory.length / active.length).toBeGreaterThan(0.5);

    // Every bout names somebody, and that somebody exists. A record of ghosts is doc 27 § 4's
    // whole reason for simulating pre-history instead of generating summaries.
    const ids = new Set(fighters.map((f) => f.id as string));
    const sample = withHistory.slice(0, 50).flatMap((f) => f.record);
    expect(sample.length).toBeGreaterThan(0);
    for (const entry of sample) expect(ids.has(entry.opponentId as string)).toBe(true);
  });

  it('balances every win against a loss', () => {
    let wins = 0;
    let losses = 0;
    for (const f of fighters) {
      for (const entry of f.record) {
        if (entry.outcome === 'win') wins++;
        else if (entry.outcome === 'loss') losses++;
      }
    }
    expect(wins).toBeGreaterThan(0);
    expect(Math.abs(wins - losses) / wins).toBeLessThan(0.02);
  });

  it('crowns champions who won their belts', () => {
    const held = promotions.flatMap((p) =>
      Object.entries(p.champions).map(([divisionId, id]) => ({ p, divisionId, id })),
    );
    expect(held.length).toBeGreaterThan(0);
    // Every one of them beat somebody for it, rather than being handed it at world creation.
    const earned = held.filter(({ id }) =>
      active.find((f) => f.id === id)?.record.some((r) => r.wasTitleFight && r.outcome === 'win'),
    );
    expect(earned.length / held.length).toBeGreaterThan(0.85);
  });

  it('leaves the standard of the sport laddered', () => {
    const standard = (p: Promotion) => {
      const roster = rosterOf(p);
      return roster.length === 0
        ? 0
        : roster.reduce((t, f) => t + overallRating(f.attributes), 0) / roster.length;
    };
    const bottom = promotions.filter((p) => p.prestige < 30);
    const tierMean = bottom.reduce((t, p) => t + standard(p), 0) / Math.max(1, bottom.length);
    expect(standard(byPrestige[0]!)).toBeGreaterThan(tierMean + 5);
  });
});

describe('the player is told how long it will take', () => {
  it('reports progress that starts at nothing and reaches the end', () => {
    expect(progress[0]!.done).toBe(0);
    expect(progress[progress.length - 1]!.done).toBe(1);
    // Monotonic, or the bar goes backwards in front of somebody.
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!.done).toBeGreaterThanOrEqual(progress[i - 1]!.done);
    }
  });

  it('warns about the size that needs a warning, and only that one', () => {
    const warned = WORLD_SIZE_META.filter((s) => s.warning !== undefined);
    expect(warned.map((s) => s.id)).toEqual(['large']);
  });
});
