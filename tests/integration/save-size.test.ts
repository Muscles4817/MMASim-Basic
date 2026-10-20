/**
 * How big a save is.
 *
 * Nothing in the suite measured this, which is precisely how a 2.80 MB fresh save shipped as
 * the default era against a `localStorage` budget of about 5 MB for the whole origin. The
 * number was invisible, so it grew until the game stopped starting on a phone. See
 * docs/20-persistence-and-save-size.md § 0 for the measurements and § 4 for the sequence.
 *
 * These are ceilings, not targets. The targets in doc 20 § 7 — under 100 KB fresh, under 2 MB
 * at ten years — need phases 3 to 5, which change *what* is stored. Moving to IndexedDB
 * changed only where it goes, so what is asserted here is today's size plus a little headroom:
 * enough that a real regression fails and a rounding change does not, and low enough that the
 * next person to add a division, an era or a field finds out immediately.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import type { StorageAdapter } from '@mmasim/data';

/** Records what the repositories actually write, in the UTF-16 bytes a quota counts. */
function measuringAdapter(): StorageAdapter & { sizes(): Map<string, number>; total(): number } {
  const rows = new Map<string, string>();
  return {
    read: (key) => rows.get(key),
    write: (key, value) => void rows.set(key, value),
    remove: (key) => void rows.delete(key),
    keys: () => [...rows.keys()],
    sizes: () => new Map([...rows].map(([key, value]) => [key, value.length * 2])),
    total: () => [...rows.values()].reduce((n, value) => n + value.length * 2, 0),
  };
}

const MB = 1024 * 1024;

describe('the size of a fresh save', () => {
  it('fits the 2026 world inside its budget', () => {
    const adapter = measuringAdapter();
    createNewGame({ adapter, era: '2026' });

    /*
     * 3.05 MB today, against 2.93 before doc 31 § 12 step 4. Doc 20 § 7 wants this under 100 KB,
     * which is phase 5's job.
     *
     * **The ceiling moved 3.0 → 3.2 MB, and this comment is the price of that.** Step 4 gave every
     * fighter a stored `physique` — skeleton, muscle, fat and water-cut capacity — and deleted
     * `naturals.frame`, for a net of three numbers. It cost **120.6 KB, or 4.0%**, which is about
     * 144 bytes a fighter and almost entirely JSON key names rather than data.
     *
     * Paid deliberately. `frame` was `walkingWeight / 300 × 100`, so before the body model it was a
     * proxy for the division, and it fed the Power, Strength, Durability and Cardio ceilings. Three
     * numbers is what it costs to replace a proxy with the thing it was standing in for.
     *
     * It comes back twice over. Step 11 makes `walkingWeightLbs` derived rather than stored, which
     * is another 25 characters a fighter; and doc 20 phases 3 to 5 rebuild the roster from its seed,
     * which deletes 90% of this file's subject outright.
     */
    /*
     * **Step 11 gave 37 KB of it back**, 3.186 -> 3.149 MB, by deleting `Fighter.walkingWeightLbs`
     * — a stored copy of a quantity derivable from `physique` and `heightInches`, which step 11 had
     * to remove because that is the step where its inputs start changing every camp. The ceiling
     * stays at 3.35 rather than tightening to match: it is a ceiling, and doc 20 phases 3 to 5 are
     * about to delete most of this file's subject anyway.
     *
     * **The ceiling moved 3.2 -> 3.35 MB at doc 31 § 12 step 9, and this is the price of that.**
     * Every fighter gained a `background` — the sport they came out of and how far they got at it —
     * which is what made styles possible in the generated world and what two of doc 31 § 10.3's
     * diagnostics had been waiting on since step 2.
     *
     * **It cost 99 KB**, 3.089 -> 3.186 MB, 3.2%. As with `physique` before it, almost all of that
     * is JSON key names rather than data: the payload is two short strings and an optional third.
     * Storing it packed would buy most of it back and would make the save unreadable, which doc 20
     * phases 3 to 5 make moot anyway by rebuilding the roster from its seed and deleting 90% of
     * this file's subject outright.
     */
    expect(adapter.total()).toBeLessThan(3.35 * MB);
  });

  it('fits the 2020 world inside its budget', () => {
    const adapter = measuringAdapter();
    createNewGame({ adapter, era: '2020' });

    // 0.53 MB today.
    expect(adapter.total()).toBeLessThan(0.7 * MB);
  });

  it('is almost entirely the seed roster, which is the thing to fix next', () => {
    /*
     * Not a size assertion so much as a signpost. Doc 00's non-negotiables say nothing derived
     * is ever stored, and the roster is a pure function of `buildSeedWorld('2026')` — so this
     * is the single largest violation in the codebase, and it is where the next order of
     * magnitude comes from.
     */
    const adapter = measuringAdapter();
    createNewGame({ adapter, era: '2026' });

    const fighters = adapter.sizes().get('fighters') ?? 0;
    expect(fighters / adapter.total()).toBeGreaterThan(0.9);
  });

  it('will not fit two 2026 careers in the old browser store', () => {
    /*
     * The failure a player actually hit, kept as a documented fact rather than a surprise: two
     * fresh 2026 saves are 5.6 MB and `localStorage` gives about 5 MB to the whole origin, so
     * the second one could not be written at all.
     *
     * This is why saves moved to IndexedDB, whose quota is a share of free disk. The day the
     * fresh save drops under about 2.5 MB this assertion becomes false and should be deleted
     * along with the fear it encodes — not inverted.
     */
    const adapter = measuringAdapter();
    createNewGame({ adapter, era: '2026' });

    expect(adapter.total() * 2).toBeGreaterThan(5 * MB);
  });
});
