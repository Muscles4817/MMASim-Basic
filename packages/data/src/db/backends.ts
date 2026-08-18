/**
 * Where a save's bytes actually go.
 *
 * `localStorage` gave the game about 5 MB for every save on the origin put together, and a
 * fresh 2026 world is 2.80 MB before a single fight is booked. A second save could not be
 * written at all, and a first save reached the ceiling inside one in-game year — at which
 * point *every* write threw, including the ones the app performs while booting, so the game
 * stopped starting. See docs/20-persistence-and-save-size.md § 0.
 *
 * IndexedDB is the same device, the same origin and the same offline guarantees, with a quota
 * that is a share of free disk rather than a fixed 5 MB. That is the whole of the fix: nothing
 * here makes the save smaller (doc 20 phases 3–5 do that), it just stops the box being the
 * wrong size.
 *
 * A backend is deliberately not the adapter. It is asynchronous, batch-oriented and knows
 * nothing about collections or namespaces beyond a key prefix; `saveStorage.ts` is what turns
 * one into the synchronous `StorageAdapter` the rest of the data layer is written against.
 */

import { StorageWriteError } from './adapters.js';

export type BackendName = 'indexeddb' | 'localstorage' | 'memory';

/**
 * A batch of changes. `undefined` means delete — distinct from a key that is simply absent
 * from the map, which means leave it alone.
 */
export type Changes = ReadonlyMap<string, string | undefined>;

export interface KvBackend {
  readonly name: BackendName;
  /** Every key beginning with `prefix`, keyed absolutely. */
  load(prefix: string): Promise<Map<string, string>>;
  /** Apply a batch atomically where the backend can, and reject if it cannot be persisted. */
  commit(changes: Changes): Promise<void>;
  /** Drop every key beginning with `prefix`. */
  clear(prefix: string): Promise<void>;
}

/** The upper bound of a prefix scan: no key of ours sorts above this. */
const upperBound = (prefix: string): string => `${prefix}￿`;

// --- IndexedDB ---------------------------------------------------------------------------

const DB_NAME = 'mmasim';
const DB_VERSION = 1;
const STORE = 'saves';

/** True when this environment has a usable IndexedDB. Node and jsdom do not. */
export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * One connection, reused.
 *
 * Cached as the promise rather than the database, so twenty near-simultaneous opens during a
 * cold start share one connection attempt instead of racing twenty `onupgradeneeded` handlers.
 * Cleared on close so a connection dropped by the browser — which happens when storage is
 * cleared from another tab — is reopened rather than failing forever.
 */
let connection: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => void (connection = undefined);
      // Another tab is upgrading. Close so it can, rather than blocking it indefinitely.
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  }).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });

  return connection;
}

/** Only exported for tests, which need a clean connection between cases. */
export function closeIndexedDb(): void {
  const pending = connection;
  connection = undefined;
  void pending?.then((db) => db.close()).catch(() => {});
}

export function createIndexedDbBackend(): KvBackend {
  return {
    name: 'indexeddb',

    load: async (prefix) => {
      const db = await openDatabase();
      return new Promise<Map<string, string>>((resolve, reject) => {
        const rows = new Map<string, string>();
        const tx = db.transaction(STORE, 'readonly');
        const request = tx
          .objectStore(STORE)
          .openCursor(IDBKeyRange.bound(prefix, upperBound(prefix)));

        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value: unknown = cursor.value;
          if (typeof value === 'string') rows.set(String(cursor.key), value);
          cursor.continue();
        };
        // Resolving on the transaction rather than the last cursor callback: a cursor walk
        // that is interrupted mid-way still fires `oncomplete`, and reading a partial save as
        // if it were the whole one is how a roster silently loses half its fighters.
        tx.oncomplete = () => resolve(rows);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read aborted'));
      });
    },

    commit: async (changes) => {
      if (changes.size === 0) return;
      const db = await openDatabase();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        // One transaction for the whole batch, so a save is all-or-nothing: a world row that
        // landed without the fighters it describes is a corrupt save, not a partial one.
        for (const [key, value] of changes) {
          if (value === undefined) store.delete(key);
          else store.put(value, key);
        }
        tx.oncomplete = () => resolve();
        const fail = () => reject(new StorageWriteError(firstKey(changes), tx.error));
        tx.onerror = fail;
        tx.onabort = fail;
      });
    },

    clear: async (prefix) => {
      const db = await openDatabase();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(IDBKeyRange.bound(prefix, upperBound(prefix)));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'));
      });
    },
  };
}

// --- localStorage ------------------------------------------------------------------------

/** The backing store, or undefined where a browser refuses to hand one over. */
function localStore(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The old home, kept for two reasons: it is where existing saves still are, and it is the
 * fallback for a browser with no IndexedDB. Synchronous underneath, promise-shaped here.
 */
export function createLocalStorageBackend(): KvBackend {
  return {
    name: 'localstorage',

    load: (prefix) => {
      const rows = new Map<string, string>();
      const store = localStore();
      if (!store) return Promise.resolve(rows);
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key?.startsWith(prefix)) continue;
        const value = store.getItem(key);
        if (value !== null) rows.set(key, value);
      }
      return Promise.resolve(rows);
    },

    commit: (changes) => {
      const store = localStore();
      if (!store) return Promise.resolve();
      try {
        for (const [key, value] of changes) {
          if (value === undefined) store.removeItem(key);
          else store.setItem(key, value);
        }
      } catch (cause) {
        return Promise.reject(new StorageWriteError(firstKey(changes), cause));
      }
      return Promise.resolve();
    },

    clear: (prefix) => {
      const store = localStore();
      if (!store) return Promise.resolve();
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(prefix)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
      return Promise.resolve();
    },
  };
}

// --- Memory ------------------------------------------------------------------------------

/** For tests and for a browser that will persist nothing at all. Playable, not durable. */
export function createMemoryBackend(seed?: Map<string, string>): KvBackend {
  const rows = new Map<string, string>(seed);
  return {
    name: 'memory',
    load: (prefix) => Promise.resolve(new Map([...rows].filter(([key]) => key.startsWith(prefix)))),
    commit: (changes) => {
      for (const [key, value] of changes) {
        if (value === undefined) rows.delete(key);
        else rows.set(key, value);
      }
      return Promise.resolve();
    },
    clear: (prefix) => {
      for (const key of [...rows.keys()]) if (key.startsWith(prefix)) rows.delete(key);
      return Promise.resolve();
    },
  };
}

/**
 * The best backend this device offers.
 *
 * IndexedDB where it exists, because that is the only one of the three with a quota worth
 * having; `localStorage` where it does not, because a small save still beats no save.
 */
export function defaultBackend(): KvBackend {
  return indexedDbAvailable() ? createIndexedDbBackend() : createLocalStorageBackend();
}

/** A key to name in an error. The batch is one save, so any of them identifies it. */
function firstKey(changes: Changes): string {
  for (const key of changes.keys()) return key;
  return '(nothing)';
}
