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
export function createLocalStorageAdapter(namespace = 'mmasim'): StorageAdapter {
  const prefix = `${namespace}:`;
  const cache = new Map<string, string>();
  let persistent = true;

  const backing: Storage | undefined =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined;

  if (!backing) persistent = false;

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
    write: (key, value) => {
      cache.set(key, value);
      if (!persistent || !backing) return;
      try {
        backing.setItem(prefix + key, value);
      } catch {
        persistent = false;
        console.warn(
          '[mmasim] Storage quota exceeded — continuing in memory only. Progress will not persist.',
        );
      }
    },
    remove: (key) => {
      cache.delete(key);
      backing?.removeItem(prefix + key);
    },
    keys: () => [...cache.keys()],
  };
}

/** True when this adapter will survive a page reload. Surfaced in the UI's save screen. */
export function isPersistent(adapter: StorageAdapter): boolean {
  const probe = '__mmasim_probe__';
  adapter.write(probe, '1');
  const ok = adapter.read(probe) === '1';
  adapter.remove(probe);
  return ok;
}
