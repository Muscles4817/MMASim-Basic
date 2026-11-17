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
import {
  ATTRIBUTE_KEYS,
  createRng,
  crossoverThemesOf,
  fighterAge,
  NICKNAME_SOURCES,
  nicknamePoolOf,
  rollNickname,
  type Attributes,
  type Fighter,
} from '@mmasim/engine';
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

describe('the nickname tables', () => {
  it('holds every name in exactly one place', () => {
    // A name in two tables would be offered under a theme it does not describe. Names that fit
    // several kinds of fighter are crossovers, which list their themes explicitly instead.
    const seen = new Map<string, number>();
    for (const name of NICKNAME_SOURCES) seen.set(name, (seen.get(name) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([name]) => name)).toEqual([]);
  });

  it('stays clear of the sport’s famous real nicknames', () => {
    const famous = [
      'Bones',
      'The Spider',
      'Notorious',
      'The Notorious',
      'Rush',
      'The Eagle',
      'Stylebender',
      'The Last Stylebender',
      'Poatan',
      'Blessed',
      'The Great',
      'Gamebred',
      'Borrachinha',
      'El Cucuy',
      'The Predator',
      'The Black Beast',
      'Cyborg',
      'The Iceman',
      'Shogun',
      'Minotauro',
      'The Dragon',
      'Suga',
      'The Diamond',
      'Cowboy',
      'Jacare',
      'The Reaper',
      'The Korean Zombie',
      'The Answer',
      'Rowdy',
      'The Natural',
      'Chaos',
      'Do Bronx',
      'Bigi Boy',
      'The Last Emperor',
      'Mighty Mouse',
      'Wonderboy',
      'The Mauler',
      'Bam Bam',
      'Thugnasty',
    ];
    expect(NICKNAME_SOURCES.filter((name) => famous.includes(name))).toEqual([]);
  });

  it('gives every attribute a theme deep enough to share across a whole sport', () => {
    for (const name of ['Lightning', 'The Python', 'The Sprawl', 'The Professor', 'Iron']) {
      expect(nicknamePoolOf(name).length, name).toBeGreaterThanOrEqual(12);
    }
  });

  it('offers a name that fits several kinds of fighter under each of them', () => {
    // The Spider Monkey reads as a submission artist, a scrambler or just somebody very fast.
    expect(crossoverThemesOf('The Spider Monkey')).toEqual(['submissions', 'scrambling', 'speed']);
    const alternatives = nicknamePoolOf('The Spider Monkey');
    expect(alternatives).toContain('Lightning'); // speed
    expect(alternatives).toContain('The Python'); // submissions
    expect(alternatives).toContain('The Eel'); // scrambling
  });

  it('only ever names a pure speedster after speed — crossovers included', () => {
    const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 50])) as Attributes;
    const input = {
      attributes: { ...attributes, speed: 85 },
      heightInches: 70,
      reachInches: 70,
      muscleIndex: 50,
      stance: 'orthodox' as const,
      sex: 'male' as const,
      age: 30,
    };
    const names = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const name = rollNickname(createRng(`speedster:${i}`), input);
      if (name) names.add(name);
    }
    const speed = nicknamePoolOf('Lightning');
    expect([...names].filter((n) => !speed.includes(n))).toEqual([]);
    // …and the crossovers are really in play, not just listed.
    expect([...names].some((n) => crossoverThemesOf(n).length > 0)).toBe(true);
  });
});
