/**
 * The light DB contract.
 *
 * Application code sees `Repository` and nothing else. Everything below it — the JSON
 * envelope, the storage adapter, the migration walk — is replaceable. See docs/09.
 */

/** Every stored row is identified by a string id. */
export interface Entity {
  id: string;
}

export type SortDir = 'asc' | 'desc';

/**
 * Deliberately minimal, and deliberately expressible in SQL.
 *
 * `where` is equality-only and maps directly to a SQL `WHERE`. `filter` is the escape
 * hatch: it is arbitrary JS, cannot be pushed down to a real database, and every use of it
 * is a thing a future SQL backend must fetch-and-filter. Keeping it a separate, obvious
 * field means those uses are greppable rather than hidden inside a query builder.
 */
export interface Query<T extends Entity> {
  where?: Partial<Record<keyof T, unknown>>;
  filter?: (row: T) => boolean;
  sort?: readonly { key: keyof T; dir?: SortDir }[];
  limit?: number;
  offset?: number;
}

export interface Repository<T extends Entity> {
  readonly name: string;
  findById(id: string): T | undefined;
  /** Throws if absent. For the many call sites where a missing row is a bug, not a case. */
  getById(id: string): T;
  findAll(): readonly T[];
  query(q?: Query<T>): readonly T[];
  /** First match, or undefined. */
  findOne(q?: Query<T>): T | undefined;
  count(q?: Query<T>): number;
  upsert(row: T): T;
  upsertMany(rows: readonly T[]): readonly T[];
  /** Shallow-merges a patch into an existing row. Throws if the row is absent. */
  patch(id: string, changes: Partial<T>): T;
  remove(id: string): boolean;
  clear(): void;
}

/** A collection as persisted: rows plus the schema version they were written at. */
export interface CollectionEnvelope<T extends Entity = Entity> {
  schemaVersion: number;
  collection: string;
  rows: T[];
}

/**
 * Persistence primitive. Synchronous by design: the whole game world is a few hundred KB
 * and every consumer is a UI render path that would otherwise need to be async for no
 * benefit. A future remote backend would sit behind an explicit load/save boundary rather
 * than making every read a promise.
 */
export interface StorageAdapter {
  read(key: string): string | undefined;
  write(key: string, value: string): void;
  remove(key: string): void;
  keys(): readonly string[];
}
