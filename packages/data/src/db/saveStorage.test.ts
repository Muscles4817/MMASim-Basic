/**
 * Save storage: the write-behind adapter, and the migration off `localStorage`.
 *
 * These run in node, against injected backends, because the behaviour worth pinning down is
 * not IndexedDB's — it is what happens around it: that a failed write is reported rather than
 * thrown, that it is retried rather than dropped, and that a migration which cannot verify
 * itself leaves the original save exactly where it was.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalStorageBackend,
  createMemoryBackend,
  type Changes,
  type KvBackend,
} from './backends.js';
import { deleteSaveStorage, openSaveStorage } from './saveStorage.js';
import { StorageWriteError } from './adapters.js';

/** A `localStorage` good enough for the migration path, with an optional quota. */
function fakeLocalStorage(limitBytes = Infinity) {
  const map = new Map<string, string>();
  const used = (): number =>
    [...map].reduce((n, [key, value]) => n + (key.length + value.length) * 2, 0);

  const store: Storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const previous = map.get(key);
      map.delete(key);
      if (used() + (key.length + value.length) * 2 > limitBytes) {
        if (previous !== undefined) map.set(key, previous);
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
  return { store, map };
}

function install(store: Storage): void {
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
}

/** A backend that refuses to commit, so the failure path can be watched. */
function brokenBackend(base: KvBackend, failures = Infinity): KvBackend {
  let left = failures;
  return {
    ...base,
    commit: (changes: Changes) => {
      if (left-- <= 0) return base.commit(changes);
      return Promise.reject(new StorageWriteError('fighters', new Error('full')));
    },
  };
}

beforeEach(() => {
  const { store } = fakeLocalStorage();
  install(store);
});

describe('the write-behind adapter', () => {
  it('reads back a write immediately, before it has been committed', async () => {
    const storage = await openSaveStorage('mmasim:s:1', { backend: createMemoryBackend() });

    storage.write('fighters', 'rows');

    // The whole point of the in-memory mirror: every screen reads during render.
    expect(storage.read('fighters')).toBe('rows');
    expect(storage.hasPendingWrites()).toBe(true);
    await storage.flush();
    expect(storage.hasPendingWrites()).toBe(false);
  });

  it('hydrates what the backend already holds', async () => {
    const backend = createMemoryBackend(new Map([['mmasim:s:1:fighters', 'rows']]));
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    expect(storage.read('fighters')).toBe('rows');
    expect(storage.keys()).toEqual(['fighters']);
  });

  it('does not hydrate another save', async () => {
    const backend = createMemoryBackend(
      new Map([
        ['mmasim:s:1:fighters', 'mine'],
        ['mmasim:s:2:fighters', 'theirs'],
      ]),
    );
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    expect(storage.read('fighters')).toBe('mine');
  });

  it('coalesces one save across many collections into a single commit', async () => {
    const backend = createMemoryBackend();
    const commit = vi.spyOn(backend, 'commit');
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    // What `db.save()` does: a synchronous loop over fifteen repositories.
    storage.write('fighters', 'a');
    storage.write('events', 'b');
    storage.write('world', 'c');
    await storage.flush();

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write instead of throwing it', async () => {
    const backend = brokenBackend(createMemoryBackend());
    const storage = await openSaveStorage('mmasim:s:1', { backend });
    const seen: (Error | undefined)[] = [];
    storage.subscribe((error) => seen.push(error));

    // Throwing here is what took the app down: this call happens inside a React render.
    expect(() => storage.write('fighters', 'rows')).not.toThrow();
    await storage.flush();

    expect(storage.lastError()).toBeInstanceOf(StorageWriteError);
    expect(seen).toHaveLength(1);
  });

  it('retries a failed write, and clears the error once it lands', async () => {
    const backend = brokenBackend(createMemoryBackend(), 1);
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    storage.write('fighters', 'rows');
    await storage.flush();
    expect(storage.lastError()).toBeDefined();

    // Nothing new is written — the *same* pending batch has to survive its own failure, or a
    // player who frees space never gets their last hour back.
    await storage.flush();
    expect(storage.lastError()).toBeUndefined();
    expect(await backend.load('mmasim:s:1:')).toEqual(new Map([['mmasim:s:1:fighters', 'rows']]));
  });

  it('never lets a stale retry overwrite a newer value', async () => {
    const backend = brokenBackend(createMemoryBackend(), 1);
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    storage.write('fighters', 'old');
    await storage.flush();
    storage.write('fighters', 'new');
    await storage.flush();

    expect(await backend.load('mmasim:s:1:')).toEqual(new Map([['mmasim:s:1:fighters', 'new']]));
  });

  it('removes a key from the backend, not just from the cache', async () => {
    const backend = createMemoryBackend(new Map([['mmasim:s:1:news', 'rows']]));
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    storage.remove('news');
    await storage.flush();

    expect(storage.read('news')).toBeUndefined();
    expect(await backend.load('mmasim:s:1:')).toEqual(new Map());
  });
});

describe('moving an existing save off localStorage', () => {
  it('copies it across and frees the browser store', async () => {
    const { store, map } = fakeLocalStorage();
    install(store);
    store.setItem('mmasim:s:1:fighters', 'the roster');
    store.setItem('mmasim:s:1:world', 'the clock');
    store.setItem('mmasim:saves', '[]'); // The registry. Not part of any save's namespace.

    const backend = createMemoryBackend();
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    expect(storage.read('fighters')).toBe('the roster');
    expect(await backend.load('mmasim:s:1:')).toEqual(
      new Map([
        ['mmasim:s:1:fighters', 'the roster'],
        ['mmasim:s:1:world', 'the clock'],
      ]),
    );
    // Freeing the space is not tidiness. `localStorage` being full is what stopped the game
    // starting, and the registry and theme still live there.
    expect(map.has('mmasim:s:1:fighters')).toBe(false);
    expect(map.get('mmasim:saves')).toBe('[]');
  });

  it('keeps the original when the copy cannot be verified', async () => {
    const { store, map } = fakeLocalStorage();
    install(store);
    store.setItem('mmasim:s:1:fighters', 'the roster');

    // Commits, but loses the data — the shape of a backend that silently drops writes.
    const backend: KvBackend = {
      ...createMemoryBackend(),
      commit: () => Promise.resolve(),
      load: () => Promise.resolve(new Map()),
    };
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    expect(map.get('mmasim:s:1:fighters')).toBe('the roster');
    expect(storage.read('fighters')).toBe('the roster');
    expect(storage.backend).toBe('localstorage');
  });

  it('keeps the original when the copy cannot be written at all', async () => {
    const { store, map } = fakeLocalStorage();
    install(store);
    store.setItem('mmasim:s:1:fighters', 'the roster');

    const storage = await openSaveStorage('mmasim:s:1', {
      backend: brokenBackend(createMemoryBackend()),
    });

    expect(map.get('mmasim:s:1:fighters')).toBe('the roster');
    expect(storage.backend).toBe('localstorage');
  });

  it('leaves a save alone once it has already moved', async () => {
    const { store } = fakeLocalStorage();
    install(store);
    store.setItem('mmasim:s:1:fighters', 'stale leftovers');

    const backend = createMemoryBackend(new Map([['mmasim:s:1:fighters', 'the real one']]));
    const storage = await openSaveStorage('mmasim:s:1', { backend });

    expect(storage.read('fighters')).toBe('the real one');
  });

  it('falls back to localStorage when the backend cannot be read', async () => {
    const { store } = fakeLocalStorage();
    install(store);
    store.setItem('mmasim:s:1:fighters', 'the roster');

    const storage = await openSaveStorage('mmasim:s:1', {
      backend: { ...createMemoryBackend(), load: () => Promise.reject(new Error('no db')) },
    });

    expect(storage.backend).toBe('localstorage');
    expect(storage.read('fighters')).toBe('the roster');
  });
});

describe('deleting a save', () => {
  it('sweeps both stores, so a part-migrated save cannot survive its own deletion', async () => {
    const { store, map } = fakeLocalStorage();
    install(store);
    store.setItem('mmasim:s:1:fighters', 'left behind');
    store.setItem('mmasim:s:2:fighters', 'somebody else');

    const backend = createMemoryBackend(new Map([['mmasim:s:1:fighters', 'the copy']]));
    await deleteSaveStorage('mmasim:s:1', { backend });

    expect(await backend.load('mmasim:s:1:')).toEqual(new Map());
    expect(map.has('mmasim:s:1:fighters')).toBe(false);
    expect(map.get('mmasim:s:2:fighters')).toBe('somebody else');
  });
});

describe('the localStorage backend', () => {
  it('reports a quota refusal as a write error rather than swallowing it', async () => {
    const { store } = fakeLocalStorage(200);
    install(store);
    const backend = createLocalStorageBackend();

    await expect(
      backend.commit(new Map([['mmasim:s:1:fighters', 'x'.repeat(500)]])),
    ).rejects.toBeInstanceOf(StorageWriteError);
  });
});
