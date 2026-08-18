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

    // 2.80 MB today. Doc 20 § 7 wants this under 100 KB, which is phase 5's job.
    expect(adapter.total()).toBeLessThan(3.0 * MB);
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
