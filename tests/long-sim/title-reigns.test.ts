/**
 * Title reigns that last like title reigns. Doc 34 B6.
 *
 * Measured on master: across ten simulated years the median title reign was about a month, with
 * six hundred new reigns over seventy-four belts and 0.3 defences a champion. Real reigns run
 * about a year. It was not a measurement artefact. `advanceWorld` read every promotion once per
 * call and passed that object down, so a belt won early in an advance still read as vacant later
 * in it: another "vacant" title fight was booked, and its winner crowned over a champion who never
 * fought. The longer the advance, the worse the churn, which is why a decade in yearly calls was
 * the worst case. `runCardBout` and the card builder now read the promotion fresh.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld } from '@mmasim/data';
import type { Championship } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const YEAR = 365;

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

describe('a decade of title reigns', () => {
  it('runs reigns of most of a year, not a month, however the decade is advanced', () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const start = getWorld(db).day;
    // In whole years: the longest calls the game makes, and the worst case for a stale read.
    for (let year = 0; year < 10; year++) {
      advanceWorld(db, start + year * YEAR, start + (year + 1) * YEAR, {});
    }

    const titles = db.championships.findAll() as unknown as Championship[];
    const reigns = titles.flatMap((t) => t.lineage.filter((r) => r.wonDay >= start));
    const closed = reigns.filter((r) => r.lostDay !== undefined);
    const lengths = closed.map((r) => r.lostDay! - r.wonDay);

    const defences = closed.reduce((n, r) => n + r.defences, 0) / Math.max(1, closed.length);
    console.info(
      `title reigns over a decade: ${reigns.length} new across ${titles.length} belts, median ${median(lengths)} days, ${defences.toFixed(2)} defences per closed reign`,
    );

    expect(reigns.length, 'nobody won a belt in ten years').toBeGreaterThan(titles.length / 2);
    // A belt changing hands more than twice a year on average is churn, not a title picture.
    expect(reigns.length / titles.length / 10).toBeLessThan(2);
    expect(median(lengths), `median reign ${median(lengths)} days`).toBeGreaterThan(180);
    // A champion crowned the day another was is the stale-read bug's signature.
    expect(lengths.filter((n) => n < 14).length / Math.max(1, lengths.length)).toBeLessThan(0.05);
  }, 1_200_000);
});
