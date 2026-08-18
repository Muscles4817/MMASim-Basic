/**
 * A save's storage: synchronous to read, asynchronous to write.
 *
 * The repositories are written against a synchronous `StorageAdapter` and every screen reads
 * through them during render, so the read path cannot become a promise without making the
 * whole UI async for no benefit. IndexedDB is asynchronous. This is where those two facts are
 * reconciled, and it is doc 20 § 5 D1's recommendation made concrete:
 *
 *   - **Reads are instant.** The namespace is loaded into memory once, before the game mounts.
 *     Nothing in a render ever waits on the backend.
 *   - **Writes are write-behind.** `write()` updates memory and queues a batch; the batch lands
 *     in one transaction on the next microtask. A save that touches nine collections is one
 *     commit, not nine.
 *   - **Failures are loud, but not fatal.** The old adapter threw from `write()`. That is the
 *     right instinct and the wrong mechanism: the throw arrived during a React render — the
 *     world is built in a `useState` initialiser — so a full storage quota did not show the
 *     player a warning, it unmounted the game and kept doing so on every reload. Errors now go
 *     to subscribers, which is a channel the UI can render instead of dying in.
 *
 * The cost of write-behind is that a tab killed between a write and its commit loses that
 * write. `flush()` exists for exactly that, and the app calls it on `pagehide` and whenever the
 * page is backgrounded — which on a phone is the only way a session ever ends.
 */

import type { StorageAdapter } from './types.js';
import {
  createLocalStorageBackend,
  defaultBackend,
  type BackendName,
  type KvBackend,
} from './backends.js';

export interface SaveStorage extends StorageAdapter {
  /** Where the bytes are actually going. Shown in Settings, and worth knowing in a bug report. */
  readonly backend: BackendName;
  /**
   * Wait for every queued write to reach the backend.
   *
   * Never rejects. A failure is reported to subscribers and left in `lastError()`, because the
   * callers are lifecycle handlers — `pagehide`, an unmount — and a rejection there is an
   * unhandled promise, not a message anybody reads.
   */
  flush(): Promise<void>;
  /** The last write failure, or undefined once a write succeeds again. */
  lastError(): Error | undefined;
  /** Called on every change to `lastError()`. Returns an unsubscribe. */
  subscribe(listener: (error: Error | undefined) => void): () => void;
  /** True while writes are queued but not yet committed. */
  hasPendingWrites(): boolean;
}

export interface OpenSaveStorageOptions {
  /** Override the backend. Tests use this; the app never does. */
  backend?: KvBackend;
  /**
   * Whether to look for an old `localStorage` save and move it across. On by default — it is
   * the entire reason an existing player's career survives this change.
   */
  migrate?: boolean;
}

/**
 * Open the storage for one save namespace, hydrating it before anything can read it.
 *
 * Asynchronous by necessity and only here: this is the one boundary the app awaits, and
 * everything downstream of it — repositories, `GameDb`, every screen — stays synchronous.
 */
export async function openSaveStorage(
  namespace: string,
  options: OpenSaveStorageOptions = {},
): Promise<SaveStorage> {
  const prefix = `${namespace}:`;
  const preferred = options.backend ?? defaultBackend();

  let backend = preferred;
  let rows = await load(backend, prefix);

  // A backend that cannot even be read is not one to write a career into.
  if (rows === undefined) {
    backend = createLocalStorageBackend();
    rows = (await load(backend, prefix)) ?? new Map<string, string>();
  } else if (rows.size === 0 && backend.name !== 'localstorage' && options.migrate !== false) {
    const moved = await migrateFromLocalStorage(backend, prefix);
    if (moved.rows) rows = moved.rows;
    if (moved.failed) {
      // The copy did not verify. The original is still in `localStorage`, untouched, so the
      // safe move is to go on using it rather than to open a save that is missing collections.
      backend = createLocalStorageBackend();
      rows = (await load(backend, prefix)) ?? new Map<string, string>();
    }
  }

  return createWriteBehindStorage(backend, prefix, rows);
}

/** Drop a save's namespace from wherever it lives. Used by the menu's delete. */
export async function deleteSaveStorage(
  namespace: string,
  options: OpenSaveStorageOptions = {},
): Promise<void> {
  const prefix = `${namespace}:`;
  const backend = options.backend ?? defaultBackend();
  // Both, unconditionally. A save part-way through a migration exists in two places, and a
  // delete that clears one of them leaves a career the player thought they had destroyed.
  await Promise.allSettled([backend.clear(prefix), createLocalStorageBackend().clear(prefix)]);
}

/**
 * Move a save out of `localStorage` and into the real backend, then free the space.
 *
 * Copy, verify, *then* delete — in that order, and the order is the whole design. A save is a
 * career; deleting the only copy before confirming the new one is readable would trade a game
 * that will not start for a game that no longer exists.
 *
 * Freeing the old keys is not housekeeping either. `localStorage` being full is what broke the
 * app: the registry, the theme and the active-save pointer all live there too, and they cannot
 * be written while 2.8 MB of roster is sitting on the quota.
 */
async function migrateFromLocalStorage(
  backend: KvBackend,
  prefix: string,
): Promise<{ rows?: Map<string, string>; failed?: boolean }> {
  const legacy = createLocalStorageBackend();
  const existing = await load(legacy, prefix);
  if (!existing || existing.size === 0) return {};

  try {
    await backend.commit(existing);
    const verified = await backend.load(prefix);
    if (!sameContents(existing, verified)) return { rows: existing, failed: true };
    await legacy.clear(prefix);
    return { rows: verified };
  } catch {
    return { rows: existing, failed: true };
  }
}

/** Byte-for-byte, not row-count. A truncated value is exactly what verification is for. */
function sameContents(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

/** A read that reports failure as absence rather than throwing. */
async function load(backend: KvBackend, prefix: string): Promise<Map<string, string> | undefined> {
  try {
    return await backend.load(prefix);
  } catch {
    return undefined;
  }
}

function createWriteBehindStorage(
  backend: KvBackend,
  prefix: string,
  loaded: Map<string, string>,
): SaveStorage {
  // Keyed without the prefix, because that is what the repositories ask for.
  const cache = new Map<string, string>();
  for (const [key, value] of loaded) cache.set(key.slice(prefix.length), value);

  const pending = new Map<string, string | undefined>();
  const listeners = new Set<(error: Error | undefined) => void>();
  let queue: Promise<void> = Promise.resolve();
  let scheduled = false;
  let error: Error | undefined;

  const report = (next: Error | undefined): void => {
    if (next === error) return;
    error = next;
    for (const listener of listeners) listener(error);
  };

  const commit = (): Promise<void> => {
    if (pending.size === 0) return queue;
    const batch = new Map(pending);
    pending.clear();

    queue = queue.then(() =>
      backend.commit(batch).then(
        () => report(undefined),
        (cause: unknown) => {
          // Put the batch back so the next flush retries it — but never over a newer write for
          // the same key, which would resurrect a stale roster on top of a fresh one.
          for (const [key, value] of batch) if (!pending.has(key)) pending.set(key, value);
          report(cause instanceof Error ? cause : new Error(String(cause)));
        },
      ),
    );
    return queue;
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    // A microtask, so one `db.save()` — which flushes fifteen repositories in a synchronous
    // loop — becomes one transaction rather than fifteen.
    queueMicrotask(() => {
      scheduled = false;
      void commit();
    });
  };

  return {
    backend: backend.name,

    read: (key) => cache.get(key),

    write: (key, value) => {
      cache.set(key, value);
      pending.set(prefix + key, value);
      schedule();
    },

    remove: (key) => {
      cache.delete(key);
      pending.set(prefix + key, undefined);
      schedule();
    },

    keys: () => [...cache.keys()],

    flush: () => commit(),
    lastError: () => error,
    hasPendingWrites: () => pending.size > 0,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
