/**
 * The IndexedDB backend, against a real IndexedDB implementation.
 *
 * `saveStorage.test.ts` covers the behaviour *around* the backend with injected fakes, which
 * is the right shape for retries and migration policy and the wrong shape for this: none of
 * it touches a transaction, a cursor or a key range, and those are where an IndexedDB backend
 * actually goes wrong. `fake-indexeddb` is the W3C test-suite implementation, so what is
 * exercised here is the same API a phone runs.
 *
 * What it cannot cover is a quota refusal — no implementation of the spec has a size limit,
 * and neither does this one. That path is tested at the `localStorage` backend, where a limit
 * can be imposed, and end to end in `tests/ui/storage.test.tsx`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory, IDBKeyRange as FakeKeyRange } from 'fake-indexeddb';
import {
  closeIndexedDb,
  createIndexedDbBackend,
  createLocalStorageBackend,
  indexedDbAvailable,
} from './backends.js';
import { openSaveStorage } from './saveStorage.js';

/**
 * A fresh database per test. Cheaper and far clearer than trying to clean one out.
 *
 * `IDBKeyRange` goes on the global too, and is easy to forget: every prefix scan in the
 * backend builds one, so without it the reads fail and `openSaveStorage` quietly falls back to
 * `localStorage` — a passing-looking suite that tests the wrong backend entirely.
 */
function freshIndexedDb(): void {
  closeIndexedDb();
  const global = globalThis as unknown as { indexedDB: IDBFactory; IDBKeyRange: unknown };
  global.indexedDB = new IDBFactory();
  global.IDBKeyRange = FakeKeyRange;
}

function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  freshIndexedDb();
  (globalThis as unknown as { localStorage: Storage }).localStorage = fakeLocalStorage();
});

afterEach(() => closeIndexedDb());

describe('the IndexedDB backend', () => {
  it('is detected when the environment has one', () => {
    expect(indexedDbAvailable()).toBe(true);
  });

  it('round-trips a batch', async () => {
    const backend = createIndexedDbBackend();
    await backend.commit(
      new Map([
        ['mmasim:s:1:fighters', 'the roster'],
        ['mmasim:s:1:world', 'the clock'],
      ]),
    );

    expect(await backend.load('mmasim:s:1:')).toEqual(
      new Map([
        ['mmasim:s:1:fighters', 'the roster'],
        ['mmasim:s:1:world', 'the clock'],
      ]),
    );
  });

  it('loads one save without dragging in its neighbours', async () => {
    // The key range is the whole of the isolation between two careers. An off-by-one in the
    // bound would hand a player somebody else's roster under their own name.
    const backend = createIndexedDbBackend();
    await backend.commit(
      new Map([
        ['mmasim:s:1:fighters', 'mine'],
        ['mmasim:s:2:fighters', 'theirs'],
        ['mmasim:s:10:fighters', 'a longer id'],
      ]),
    );

    expect([...(await backend.load('mmasim:s:1:')).keys()]).toEqual(['mmasim:s:1:fighters']);
  });

  it('deletes a key when the batch says undefined', async () => {
    const backend = createIndexedDbBackend();
    await backend.commit(new Map([['mmasim:s:1:news', 'rows']]));
    await backend.commit(new Map([['mmasim:s:1:news', undefined]]));

    expect(await backend.load('mmasim:s:1:')).toEqual(new Map());
  });

  it('clears one save and leaves the others', async () => {
    const backend = createIndexedDbBackend();
    await backend.commit(
      new Map([
        ['mmasim:s:1:fighters', 'mine'],
        ['mmasim:s:2:fighters', 'theirs'],
      ]),
    );

    await backend.clear('mmasim:s:1:');

    expect(await backend.load('mmasim:s:1:')).toEqual(new Map());
    expect(await backend.load('mmasim:s:2:')).toEqual(new Map([['mmasim:s:2:fighters', 'theirs']]));
  });

  it('holds a save far larger than localStorage would take', async () => {
    /*
     * The whole point of the move. A fresh 2026 roster is 2.80 MB and the browser store gives
     * the origin about 5 MB for every save put together, so two of them could not coexist —
     * which is what a player hit, as a game that stopped starting.
     */
    const backend = createIndexedDbBackend();
    const roster = 'x'.repeat(1_500_000); // ~3 MB in UTF-16, about one 2026 roster.

    await backend.commit(
      new Map([
        ['mmasim:s:1:fighters', roster],
        ['mmasim:s:2:fighters', roster],
      ]),
    );

    expect((await backend.load('mmasim:s:1:')).get('mmasim:s:1:fighters')).toHaveLength(1_500_000);
    expect((await backend.load('mmasim:s:2:')).get('mmasim:s:2:fighters')).toHaveLength(1_500_000);
  });
});

describe('opening a save on a device that has IndexedDB', () => {
  it('prefers it over the browser store', async () => {
    const storage = await openSaveStorage('mmasim:s:1');
    expect(storage.backend).toBe('indexeddb');
  });

  it('moves an existing browser-store save across, and frees the space', async () => {
    localStorage.setItem('mmasim:s:1:fighters', 'the roster');
    localStorage.setItem('mmasim:s:1:world', 'the clock');
    localStorage.setItem('mmasim:saves', '[]');

    const storage = await openSaveStorage('mmasim:s:1');

    expect(storage.backend).toBe('indexeddb');
    expect(storage.read('fighters')).toBe('the roster');
    expect(localStorage.getItem('mmasim:s:1:fighters')).toBeNull();
    // The registry is not part of any save's namespace and must survive untouched.
    expect(localStorage.getItem('mmasim:saves')).toBe('[]');
    expect(await createIndexedDbBackend().load('mmasim:s:1:')).toEqual(
      new Map([
        ['mmasim:s:1:fighters', 'the roster'],
        ['mmasim:s:1:world', 'the clock'],
      ]),
    );
  });

  it('survives a reopen, which is what a reload is', async () => {
    const first = await openSaveStorage('mmasim:s:1');
    first.write('fighters', 'the roster');
    await first.flush();

    const second = await openSaveStorage('mmasim:s:1');

    expect(second.read('fighters')).toBe('the roster');
    expect(await createLocalStorageBackend().load('mmasim:s:1:')).toEqual(new Map());
  });
});
