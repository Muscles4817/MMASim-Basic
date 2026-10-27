/**
 * Nicknames across a whole generated sport. Doc 34 C1.
 *
 * Each fighter's nickname is rolled alone, so the generator cannot know who else is in the room —
 * and two well-known fighters in one division both called "TNT" is the sort of thing that breaks
 * the illusion faster than any rating. These hold the world-level properties: one of each per
 * division, no name everywhere, and about the share of the sport the design asks for.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld } from '@mmasim/data';
import { fighterAge, type Fighter } from '@mmasim/engine';
import { generateWorld } from '../../packages/app/src/game/newWorld';

const medium = await generateWorld({ size: 'medium', seed: 'nicknames-medium' });
const day = getWorld(medium).day;
const active = (medium.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);

const duplicatesByDivision = (fighters: readonly Fighter[]): string[] => {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const f of fighters) {
    if (!f.nickname || f.retiredDay !== undefined) continue;
    const key = `${f.divisionId}:${f.nickname}`;
    if (seen.has(key)) dupes.push(`${key} (${seen.get(key)} and ${f.id})`);
    else seen.set(key, f.id as string);
  }
  return dupes;
};

describe('nicknames in a generated Medium world', () => {
  it('never gives two active fighters in one division the same nickname', () => {
    expect(duplicatesByDivision(active)).toEqual([]);
  });

  it('has no nickname everywhere', () => {
    const counts = new Map<string, number>();
    for (const f of active)
      if (f.nickname) counts.set(f.nickname, (counts.get(f.nickname) ?? 0) + 1);
    const [name, most] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    expect(most / active.length, `${name} × ${most} of ${active.length}`).toBeLessThanOrEqual(0.01);
  });

  it('names a minority of the sport, more of its veterans', () => {
    const share = (list: readonly Fighter[]) =>
      list.filter((f) => f.nickname).length / Math.max(1, list.length);
    expect(share(active)).toBeGreaterThan(0.25);
    expect(share(active)).toBeLessThan(0.5);
    expect(share(active.filter((f) => fighterAge(f, day) >= 30))).toBeGreaterThan(
      share(active.filter((f) => fighterAge(f, day) < 27)),
    );
  });
});

describe('nicknames in the seeded eras', () => {
  it('keeps them unique per division, real fighters’ own names first', () => {
    for (const era of ['2020', '2026'] as const) {
      expect(duplicatesByDivision(createNewGame({ era }).fighters.findAll() as Fighter[])).toEqual(
        [],
      );
    }
  });
});
