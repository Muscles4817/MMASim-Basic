import { describe, expect, it, vi } from 'vitest';
import { createMemoryAdapter, createLocalStorageAdapter, StorageWriteError } from './adapters.js';
import { createRepository } from './repository.js';
import {
  CURRENT_SCHEMA_VERSION,
  SaveCorruptError,
  SaveTooNewError,
  migrateCollection,
} from './migrations.js';
import type { Entity } from './types.js';

/**
 * The data layer had no tests, which is exactly why its most damaging bugs survived: a save
 * that silently discarded itself, a sort comparator that corrupted its own results, and a
 * corrupt blob that white-screened the app.
 */

interface Row extends Entity {
  name: string;
  rank?: number | null;
  division?: string;
}

const rows: Row[] = [
  { id: 'a', name: 'Alpha', rank: 3, division: 'lw' },
  { id: 'b', name: 'Bravo', rank: 1, division: 'lw' },
  { id: 'c', name: 'Charlie', division: 'ww' },
  { id: 'd', name: 'Delta', rank: 2, division: 'ww' },
];

const seeded = () => {
  const repo = createRepository<Row>('rows', createMemoryAdapter());
  repo.upsertMany(rows);
  return repo;
};

describe('repository queries', () => {
  it('finds by id, and throws only where a miss is a bug', () => {
    const repo = seeded();
    expect(repo.findById('a')?.name).toBe('Alpha');
    expect(repo.findById('nope')).toBeUndefined();
    expect(() => repo.getById('nope')).toThrow(/no row with id/);
  });

  it('filters by equality', () => {
    expect(seeded().query({ where: { division: 'lw' } })).toHaveLength(2);
  });

  it('sorts ascending and descending', () => {
    const repo = seeded();
    const asc = repo.query({ sort: [{ key: 'name' }] }).map((r) => r.id);
    expect(asc).toEqual(['a', 'b', 'c', 'd']);
    const desc = repo.query({ sort: [{ key: 'name', dir: 'desc' }] }).map((r) => r.id);
    expect(desc).toEqual(['d', 'c', 'b', 'a']);
  });

  it('sorts missing values last in both directions', () => {
    const repo = seeded();
    // An unranked fighter must not leapfrog a ranked one just because the sort flipped.
    expect(repo.query({ sort: [{ key: 'rank' }] }).at(-1)?.id).toBe('c');
    expect(repo.query({ sort: [{ key: 'rank', dir: 'desc' }] }).at(-1)?.id).toBe('c');
  });

  it('produces a stable ordering for incomparable values', () => {
    // The comparator must be a strict weak ordering. Mapping "not equal and not less-than"
    // to 1 makes cmp(a,b) and cmp(b,a) both 1 for NaN and mixed types, which does not merely
    // misplace a tie — it corrupts the entire result and makes it input-order dependent.
    const repo = createRepository<Row>('odd', createMemoryAdapter());
    repo.upsertMany([
      { id: '1', name: 'x', rank: 3 },
      { id: '2', name: 'x', rank: Number.NaN },
      { id: '3', name: 'x', rank: 1 },
      { id: '4', name: 'x', rank: null },
      { id: '5', name: 'x', rank: 2 },
    ]);
    const sorted = repo.query({ sort: [{ key: 'rank' }] }).map((r) => r.id);
    // The comparable values must come out in order regardless of what sits between them.
    const comparable = sorted.filter((id) => ['1', '3', '5'].includes(id));
    expect(comparable).toEqual(['3', '5', '1']);
    // And null sorts last, with everything still present exactly once.
    expect(sorted).toHaveLength(5);
    expect(new Set(sorted).size).toBe(5);
  });

  it('applies limit and offset', () => {
    const repo = seeded();
    expect(repo.query({ sort: [{ key: 'name' }], limit: 2 }).map((r) => r.id)).toEqual(['a', 'b']);
    expect(repo.query({ sort: [{ key: 'name' }], offset: 2 }).map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('counts matches, ignoring limit the way SQL COUNT does', () => {
    const repo = seeded();
    expect(repo.count()).toBe(4);
    expect(repo.count({ where: { division: 'lw' } })).toBe(2);
    expect(repo.count({ where: { division: 'lw' }, limit: 1 })).toBe(2);
  });
});

describe('repository mutation and dirty tracking', () => {
  it('marks itself dirty on write and clean after a successful flush', () => {
    const repo = createRepository<Row>('rows', createMemoryAdapter());
    expect(repo.isDirty()).toBe(false);
    repo.upsert({ id: 'a', name: 'Alpha' });
    expect(repo.isDirty()).toBe(true);
    repo.flush();
    expect(repo.isDirty()).toBe(false);
  });

  it('does not clear the dirty flag when the write fails', () => {
    // The single most damaging failure mode in this layer: reporting a successful save for
    // data that was never persisted.
    const adapter = createMemoryAdapter();
    const repo = createRepository<Row>('rows', adapter);
    repo.upsert({ id: 'a', name: 'Alpha' });
    vi.spyOn(adapter, 'write').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => repo.flush()).toThrow('quota');
    expect(repo.isDirty(), 'a failed write must leave the collection dirty').toBe(true);
  });

  it('patches without losing the id, and refuses to patch a missing row', () => {
    const repo = seeded();
    expect(repo.patch('a', { name: 'Renamed', id: 'hacked' } as Partial<Row>).id).toBe('a');
    expect(repo.findById('a')?.name).toBe('Renamed');
    expect(() => repo.patch('nope', { name: 'x' })).toThrow(/cannot patch missing row/);
  });

  it('removes and clears', () => {
    const repo = seeded();
    expect(repo.remove('a')).toBe(true);
    expect(repo.remove('a')).toBe(false);
    repo.clear();
    expect(repo.count()).toBe(0);
  });

  it('round-trips through storage', () => {
    const adapter = createMemoryAdapter();
    const first = createRepository<Row>('rows', adapter);
    first.upsertMany(rows);
    first.flush();

    const second = createRepository<Row>('rows', adapter);
    expect(second.count()).toBe(rows.length);
    expect(second.getById('b').name).toBe('Bravo');
  });
});

describe('save integrity', () => {
  it('refuses a save written by a newer version rather than guessing', () => {
    const adapter = createMemoryAdapter({
      rows: JSON.stringify({ schemaVersion: 999, collection: 'rows', rows: [] }),
    });
    expect(() => createRepository<Row>('rows', adapter)).toThrow(SaveTooNewError);
  });

  it('reports corrupt JSON as a typed error, not a raw parse failure', () => {
    const adapter = createMemoryAdapter({ rows: '{not json' });
    expect(() => createRepository<Row>('rows', adapter)).toThrow(SaveCorruptError);
  });

  it('reports a well-formed envelope with no rows as corrupt', () => {
    // This one used to throw "undefined is not iterable" from inside a React render.
    const adapter = createMemoryAdapter({
      rows: JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, collection: 'rows' }),
    });
    expect(() => createRepository<Row>('rows', adapter)).toThrow(SaveCorruptError);
  });

  it('detects a blob stored under the wrong collection key', () => {
    // The envelope's `collection` field exists solely so this can be caught. Loading it
    // silently would launder the corruption permanently on the next save.
    const adapter = createMemoryAdapter({
      rows: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        collection: 'coaches',
        rows: [],
      }),
    });
    expect(() => createRepository<Row>('rows', adapter)).toThrow(/coaches/);
  });

  it('accepts a well-formed current-version envelope', () => {
    const adapter = createMemoryAdapter({
      rows: JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        collection: 'rows',
        rows: [{ id: 'a', name: 'Alpha' }],
      }),
    });
    expect(createRepository<Row>('rows', adapter).count()).toBe(1);
  });

  it('passes a current-version collection through migration untouched', () => {
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      collection: 'rows',
      rows: [{ id: 'a', name: 'Alpha' }],
    };
    expect(migrateCollection(envelope, 'rows')).toEqual(envelope.rows);
  });
});

describe('storage adapters', () => {
  it('memory adapter reads back what it wrote', () => {
    const adapter = createMemoryAdapter();
    adapter.write('k', 'v');
    expect(adapter.read('k')).toBe('v');
    expect(adapter.keys()).toContain('k');
    adapter.remove('k');
    expect(adapter.read('k')).toBeUndefined();
  });

  it('localStorage adapter surfaces a quota failure instead of swallowing it', () => {
    const store = new Map<string, string>();
    let full = false;
    vi.stubGlobal('localStorage', {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new DOMException('QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    });

    const adapter = createLocalStorageAdapter('test');
    adapter.write('k', 'v');
    expect(adapter.read('k')).toBe('v');

    full = true;
    expect(() => adapter.write('k', 'v2')).toThrow(StorageWriteError);

    vi.unstubAllGlobals();
  });
});
