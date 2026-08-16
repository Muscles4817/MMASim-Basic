/**
 * The repository implementation.
 *
 * Rows live in an in-memory `Map` for O(1) lookup and are flushed to the storage adapter
 * on write. Flushes are debounced by a dirty flag rather than a timer, so the caller (or a
 * save action) decides when durability actually happens — a per-write JSON serialisation of
 * an 800-fighter roster is not something to do on every keystroke in the editor.
 */

import { CURRENT_SCHEMA_VERSION, migrateCollection } from './migrations.js';
import type { CollectionEnvelope, Entity, Query, Repository, StorageAdapter } from './types.js';

export interface RepositoryOptions {
  /** Skip loading existing rows. Used when seeding a brand-new world. */
  fresh?: boolean;
}

export function createRepository<T extends Entity>(
  name: string,
  adapter: StorageAdapter,
  options: RepositoryOptions = {},
): Repository<T> & { flush(): void; isDirty(): boolean } {
  const rows = new Map<string, T>();
  let dirty = false;

  if (!options.fresh) {
    const raw = adapter.read(name);
    if (raw) {
      const envelope = JSON.parse(raw) as CollectionEnvelope<T>;
      for (const row of migrateCollection<T>(envelope)) rows.set(row.id, row);
    }
  }

  const flush = (): void => {
    if (!dirty) return;
    const envelope: CollectionEnvelope<T> = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      collection: name,
      rows: [...rows.values()],
    };
    adapter.write(name, JSON.stringify(envelope));
    dirty = false;
  };

  const applyQuery = (q?: Query<T>): readonly T[] => {
    let out = [...rows.values()];

    if (q?.where) {
      const entries = Object.entries(q.where) as [keyof T, unknown][];
      out = out.filter((row) => entries.every(([key, value]) => row[key] === value));
    }
    if (q?.filter) out = out.filter(q.filter);

    if (q?.sort?.length) {
      out.sort((a, b) => {
        for (const { key, dir } of q.sort!) {
          const av = a[key];
          const bv = b[key];
          if (av === bv) continue;
          // Missing values sort last regardless of direction — an unranked fighter should
          // not leapfrog a ranked one just because the sort flipped.
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          const cmp = (av as never) < (bv as never) ? -1 : 1;
          return dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }

    const offset = q?.offset ?? 0;
    if (offset > 0 || q?.limit !== undefined) {
      out = out.slice(offset, q?.limit === undefined ? undefined : offset + q.limit);
    }
    return out;
  };

  return {
    name,

    findById: (id) => rows.get(id),

    getById: (id) => {
      const row = rows.get(id);
      if (!row) throw new Error(`${name}: no row with id "${id}"`);
      return row;
    },

    findAll: () => [...rows.values()],

    query: applyQuery,

    findOne: (q) => applyQuery({ ...q, limit: 1 })[0],

    count: (q) => (q ? applyQuery(q).length : rows.size),

    upsert: (row) => {
      rows.set(row.id, row);
      dirty = true;
      return row;
    },

    upsertMany: (incoming) => {
      for (const row of incoming) rows.set(row.id, row);
      dirty = true;
      return incoming;
    },

    patch: (id, changes) => {
      const existing = rows.get(id);
      if (!existing) throw new Error(`${name}: cannot patch missing row "${id}"`);
      const updated = { ...existing, ...changes, id: existing.id };
      rows.set(id, updated);
      dirty = true;
      return updated;
    },

    remove: (id) => {
      const removed = rows.delete(id);
      if (removed) dirty = true;
      return removed;
    },

    clear: () => {
      rows.clear();
      dirty = true;
    },

    flush,
    isDirty: () => dirty,
  };
}
