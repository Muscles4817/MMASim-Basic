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

import type { CollectionEnvelope, Entity } from './types.js';

export const CURRENT_SCHEMA_VERSION = 1;

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
 * Empty at version 1 — deliberately kept rather than deferred, because the loader, the
 * refusal path and the tests all exist and are exercised from day one. Adding the plumbing
 * later, under pressure, mid-schema-change, is how saves get lost.
 */
export const MIGRATIONS: readonly Migration[] = [];

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

/** Walk one collection forward to {@link CURRENT_SCHEMA_VERSION}. */
export function migrateCollection<T extends Entity>(envelope: CollectionEnvelope<T>): T[] {
  const found = envelope.schemaVersion ?? 0;
  if (found > CURRENT_SCHEMA_VERSION) {
    throw new SaveTooNewError(found, CURRENT_SCHEMA_VERSION);
  }

  let rows: Entity[] = envelope.rows;
  let version = found;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) {
      throw new Error(
        `No migration from schema ${version} to ${version + 1} for collection "${envelope.collection}".`,
      );
    }
    rows = step.migrate(envelope.collection, rows);
    version = step.to;
  }

  return rows as T[];
}

/** Migrations that would run for a given save version. Used by the save screen. */
export function pendingMigrations(fromVersion: number): readonly Migration[] {
  const out: Migration[] = [];
  let version = fromVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) break;
    out.push(step);
    version = step.to;
  }
  return out;
}
