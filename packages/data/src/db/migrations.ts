/**
 * Schema migrations.
 *
 * This file is what makes "light DB" a starting point rather than a liability. The seed
 * roster and any player's save will outlive several schema changes; each one gets a step
 * here and the loader walks a save forward to the current version.
 *
 * Rules:
 *  - Steps are ordered, one version apart, and never edited once shipped.
 *  - A save *newer* than the code is refused, not guessed at. Silently dropping fields a
 *    future version added is how saves get quietly corrupted.
 */

import type { CollectionEnvelope, Entity, StorageAdapter } from './types.js';

/**
 * The save format this build reads and writes.
 *
 * - **1** — the first format.
 * - **2** — the promoter audit's fight-night rework (docs/34, A1): a plan records how it ended
 *   (`outcome`, `cancelled`), and a card whose date passed unrun is cancelled rather than left
 *   in the past. A version-1 save can hold exactly that stranded card, with its fighters blocked
 *   for ever. Old saves were allowed to break for this rework, so there is deliberately no
 *   1 -> 2 step: a version-1 save is refused with `SaveTooOldError`.
 */
export const CURRENT_SCHEMA_VERSION = 2;

export interface Migration {
  from: number;
  to: number;
  /** Human-readable note; shown in the save screen when a migration runs. */
  description: string;
  migrate(collection: string, rows: Entity[]): Entity[];
}

/**
 * Ordered migration steps.
 *
 * Empty: version 2 deliberately broke version-1 saves rather than migrating them (see
 * `CURRENT_SCHEMA_VERSION`), so there is no step to walk. The loader, the refusal path and the
 * tests stay in place regardless, because adding the plumbing later, under pressure,
 * mid-schema-change, is how saves get lost.
 */
export const MIGRATIONS: readonly Migration[] = [];

/** A save that cannot be read at all: truncated, hand-edited, or written by another app. */
export class SaveCorruptError extends Error {
  constructor(
    readonly collection: string,
    reason: string,
    cause?: unknown,
  ) {
    super(`The saved "${collection}" data could not be read because ${reason}.`, { cause });
    this.name = 'SaveCorruptError';
  }
}

export class SaveTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      `Save was written by a newer version (schema ${found}; this build supports ${supported}). ` +
        'Update the game to open it.',
    );
    this.name = 'SaveTooNewError';
  }
}

/**
 * A save from a version of the game this build no longer reads.
 *
 * The other half of {@link SaveTooNewError}, and the honest outcome when a format change ships
 * without a migration: the save is untouched and the player is told plainly why it will not
 * open, rather than meeting a stack trace from inside a render.
 */
export class SaveTooOldError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      `This save was made by an older version of the game (save format ${found}; this build ` +
        `reads format ${supported}) and cannot be opened. Start a new game to keep playing.`,
    );
    this.name = 'SaveTooOldError';
  }
}

/**
 * Refuse a save this build cannot read, before anything tries to load it.
 *
 * Reads only the world envelope's version, which is a few hundred bytes, so the menu's gate can
 * say "too old" or "too new" without deserialising a roster. A save with no world yet (a slot
 * that is about to be built) passes.
 */
export function assertReadableSave(adapter: Pick<StorageAdapter, 'read'>): void {
  const raw = adapter.read('world');
  if (!raw) return;
  let found: number;
  try {
    found = (JSON.parse(raw) as Partial<CollectionEnvelope<Entity>>).schemaVersion ?? 0;
  } catch (cause) {
    throw new SaveCorruptError('world', 'it is not valid JSON', cause);
  }
  if (found > CURRENT_SCHEMA_VERSION) throw new SaveTooNewError(found, CURRENT_SCHEMA_VERSION);
  if (found < CURRENT_SCHEMA_VERSION && pendingMigrations(found).length === 0) {
    throw new SaveTooOldError(found, CURRENT_SCHEMA_VERSION);
  }
}

/**
 * Walk one collection forward to {@link CURRENT_SCHEMA_VERSION}.
 *
 * `expectedCollection` is what makes the envelope's `collection` field earn its place: it
 * exists so a blob stored under the wrong key is caught here rather than loading silently
 * and being laundered into a permanent corruption by the next save.
 */
export function migrateCollection<T extends Entity>(
  envelope: CollectionEnvelope<T>,
  expectedCollection?: string,
): T[] {
  if (expectedCollection !== undefined && envelope.collection !== expectedCollection) {
    throw new SaveCorruptError(
      expectedCollection,
      `it contains "${envelope.collection}" data instead`,
    );
  }

  const found = envelope.schemaVersion ?? 0;
  if (found > CURRENT_SCHEMA_VERSION) {
    throw new SaveTooNewError(found, CURRENT_SCHEMA_VERSION);
  }

  let rows: Entity[] = envelope.rows;
  let version = found;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    // No path forward is a save this build has stopped supporting, not a bug to throw raw.
    if (!step) throw new SaveTooOldError(found, CURRENT_SCHEMA_VERSION);
    // Guards against a mis-authored step that does not advance the version, which would
    // otherwise spin forever inside a render.
    if (step.to <= version) {
      throw new Error(`Migration ${step.from} -> ${step.to} does not advance the schema version.`);
    }
    rows = step.migrate(envelope.collection, rows);
    version = step.to;
  }

  return rows as T[];
}

/**
 * Migrations that would run for a given save version. Used by the save screen.
 *
 * Throws on a too-new save for the same reason the loader does: returning an empty list
 * would have the UI report "ready to load" for a save the loader is about to refuse.
 */
export function pendingMigrations(fromVersion: number): readonly Migration[] {
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new SaveTooNewError(fromVersion, CURRENT_SCHEMA_VERSION);
  }
  const out: Migration[] = [];
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    // A mis-authored step that does not advance the version would loop forever.
    if (!step || step.to <= version) break;
    out.push(step);
    version = step.to;
  }
  return out;
}
