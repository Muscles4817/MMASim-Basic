/**
 * Save slots.
 *
 * The game had one save, in one namespace, created implicitly on first load — so starting a
 * second career meant destroying the first, and there was no point at which anybody could
 * choose which world they were starting.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteSave,
  listSaves,
  namespaceFor,
  nextSaveId,
  SAVE_REGISTRY_KEY,
  upsertSave,
  writeSaves,
  type SaveSummary,
} from './saves.js';

/** A `Storage` good enough to test against, without pulling in jsdom. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

const save = (over: Partial<SaveSummary> = {}): SaveSummary => ({
  id: 's1',
  name: 'Marcus Okafor',
  era: '2026',
  createdAtIso: '2026-01-01T00:00:00.000Z',
  lastPlayedIso: '2026-01-01T00:00:00.000Z',
  day: 0,
  ...over,
});

let storage: Storage;
beforeEach(() => {
  storage = fakeStorage();
});

describe('the registry', () => {
  it('starts empty rather than undefined', () => {
    expect(listSaves(storage)).toEqual([]);
  });

  it('round-trips a save', () => {
    upsertSave(storage, save());
    expect(listSaves(storage)).toHaveLength(1);
    expect(listSaves(storage)[0]!.name).toBe('Marcus Okafor');
  });

  it('updates in place rather than duplicating', () => {
    upsertSave(storage, save());
    upsertSave(storage, save({ day: 400 }));
    const all = listSaves(storage);
    expect(all).toHaveLength(1);
    expect(all[0]!.day).toBe(400);
  });

  it('lists the most recently played first, so the menu needs no sort', () => {
    upsertSave(storage, save({ id: 'old', lastPlayedIso: '2026-01-01T00:00:00.000Z' }));
    upsertSave(storage, save({ id: 'new', lastPlayedIso: '2026-06-01T00:00:00.000Z' }));
    expect(listSaves(storage).map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('survives a corrupt registry rather than taking the menu down with it', () => {
    /*
     * A menu that cannot render because one row of JSON went bad is a worse failure than a
     * menu missing a row — and the saves themselves live in different keys and are unaffected,
     * so throwing here would lose the player access to data that is perfectly intact.
     */
    storage.setItem(SAVE_REGISTRY_KEY, '{not json');
    expect(listSaves(storage)).toEqual([]);
    storage.setItem(SAVE_REGISTRY_KEY, '{"nope":true}');
    expect(listSaves(storage)).toEqual([]);
  });

  it('drops rows that are not saves rather than rendering them', () => {
    writeSaves(storage, [save(), null as unknown as SaveSummary, { nope: 1 } as unknown as SaveSummary]);
    expect(listSaves(storage)).toHaveLength(1);
  });
});

describe('deleting a save', () => {
  it('removes the row and everything in its namespace', () => {
    upsertSave(storage, save({ id: 'a' }));
    upsertSave(storage, save({ id: 'b' }));
    storage.setItem(`${namespaceFor('a')}:fighters`, '[...]');
    storage.setItem(`${namespaceFor('a')}:world`, '{...}');
    storage.setItem(`${namespaceFor('b')}:fighters`, '[...]');

    deleteSave(storage, 'a');

    expect(listSaves(storage).map((s) => s.id)).toEqual(['b']);
    expect(storage.getItem(`${namespaceFor('a')}:fighters`)).toBeNull();
    expect(storage.getItem(`${namespaceFor('a')}:world`)).toBeNull();
  });

  it('leaves other saves entirely alone', () => {
    upsertSave(storage, save({ id: 'a' }));
    upsertSave(storage, save({ id: 'b' }));
    storage.setItem(`${namespaceFor('b')}:fighters`, 'keep me');

    deleteSave(storage, 'a');
    expect(storage.getItem(`${namespaceFor('b')}:fighters`)).toBe('keep me');
  });

  it('sweeps the namespace even when the registry has already lost the row', () => {
    /*
     * The registry is a summary; the slot is the truth. A row lost to a failed write would
     * otherwise strand a whole roster in storage forever — invisible, un-deletable, and
     * quietly eating the quota that caused the failed write in the first place.
     */
    storage.setItem(`${namespaceFor('ghost')}:fighters`, '[...]');
    deleteSave(storage, 'ghost');
    expect(storage.getItem(`${namespaceFor('ghost')}:fighters`)).toBeNull();
  });
});

describe('naming a new save', () => {
  it('derives an id from the clock it is given rather than from randomness', () => {
    // The engine forbids Math.random and the data layer keeps the same discipline, so a test
    // can create three saves and know exactly what they are called.
    expect(nextSaveId([], '2026-08-16T12:30:45.000Z')).toBe('20260816123045');
  });

  it('never collides with an existing save', () => {
    const first = nextSaveId([], '2026-08-16T12:30:45.000Z');
    const second = nextSaveId([save({ id: first })], '2026-08-16T12:30:45.000Z');
    expect(second).not.toBe(first);
  });

  it('gives every save its own namespace', () => {
    expect(namespaceFor('a')).not.toBe(namespaceFor('b'));
    // And no slot's namespace can collide with the registry key.
    expect(namespaceFor('a').startsWith(SAVE_REGISTRY_KEY)).toBe(false);
  });
});
