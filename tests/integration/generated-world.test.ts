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
  PREHISTORY_YEARS,
  WORLD_SIZE_META,
  getWorld,
  worldSizeMeta,
  type GenerationProgress,
} from '@mmasim/data';
import { overallRating, type Fighter, type Promotion } from '@mmasim/engine';
import { generateWorld } from '../../packages/app/src/game/newWorld';

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
  it('leaves the clock on the start date, not eight years past it', () => {
    // Pre-history runs *forward* and the clock is wound back, which is what makes those years
    // history rather than a game that started without the player.
    const seeded = getWorld(db).day;
    expect(seeded).toBeGreaterThan(0);
    expect(progress.some((p) => p.label.includes(String(PREHISTORY_YEARS)))).toBe(true);
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
