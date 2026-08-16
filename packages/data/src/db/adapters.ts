/** Storage adapters. Everything above these is backend-agnostic. */

import type { StorageAdapter } from './types.js';

/** In-memory. Used by tests, by the sim harness, and as the base for any cached adapter. */
export function createMemoryAdapter(seed?: Record<string, string>): StorageAdapter {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    read: (key) => store.get(key),
    write: (key, value) => void store.set(key, value),
    remove: (key) => void store.delete(key),
    keys: () => [...store.keys()],
  };
}

/**
 * Browser `localStorage`, namespaced.
 *
 * Writes are mirrored into an in-memory map so reads never touch `localStorage` — which is
 * synchronous, blocking, and measurably slow when a screen reads the roster on every
 * render. A quota failure degrades to memory-only with a console warning rather than
 * throwing mid-save and losing the player's game.
 */
/** Thrown when a write cannot be persisted. Never swallowed — see the comment on `write`. */
export class StorageWriteError extends Error {
  constructor(
    readonly key: string,
    cause?: unknown,
  ) {
    super(`Could not persist "${key}". Storage may be full.`, { cause });
    this.name = 'StorageWriteError';
  }
}

export function createLocalStorageAdapter(namespace = 'mmasim'): StorageAdapter {
  const prefix = `${namespace}:`;
  const cache = new Map<string, string>();

  const backing: Storage | undefined =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined;

  if (backing) {
    for (let i = 0; i < backing.length; i++) {
      const raw = backing.key(i);
      if (raw?.startsWith(prefix)) {
        const value = backing.getItem(raw);
        if (value !== null) cache.set(raw.slice(prefix.length), value);
      }
    }
  }

  return {
    read: (key) => cache.get(key),
    /**
     * Writes through to `localStorage` and **throws if it cannot**.
     *
     * Swallowing a quota failure here was the single most damaging bug in the data layer:
     * the repository would go on to clear its dirty flag, `hasUnsavedChanges()` would report
     * false, and the player would be told their game was saved while nothing had been
     * written. A save that fails loudly is recoverable; one that fails silently is not.
     */
    write: (key, value) => {
      cache.set(key, value);
      if (!backing) return;
      try {
        backing.setItem(prefix + key, value);
      } catch (cause) {
        throw new StorageWriteError(key, cause);
      }
    },
    remove: (key) => {
      cache.delete(key);
      backing?.removeItem(prefix + key);
    },
    keys: () => [...cache.keys()],
  };
}

/**
 * True when this adapter will survive a page reload.
 *
 * Probes the *backing store* directly rather than round-tripping through the adapter. The
 * obvious implementation — write, read back, compare — reads out of the in-memory cache and
 * so returns true for a pure memory adapter, which is precisely when the answer is no.
 */
export function isPersistent(): boolean {
  try {
    const store = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    if (!store) return false;
    const probe = '__mmasim_probe__';
    store.setItem(probe, '1');
    const ok = store.getItem(probe) === '1';
    store.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}
