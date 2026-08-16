/**
 * Creating a new world.
 *
 * One function, so "new game" means the same thing everywhere: the app's start screen, the
 * editor's reset, and the long-sim test harness all go through here.
 */

import { CURRENT_SCHEMA_VERSION } from '../db/migrations.js';
import { createGameDb, setWorld, type GameDb } from '../db/gameDb.js';
import { createMemoryAdapter } from '../db/adapters.js';
import type { Entity, StorageAdapter } from '../db/types.js';
import { buildSeedWorld } from '../seed/index.js';
import type { Coach, Fighter, Gym, Judge, Promotion, Referee } from '@mmasim/engine';

export interface NewGameOptions {
  /** Root RNG seed. Same seed + same tick count reproduces the world exactly. */
  seed?: string;
  playerRole?: 'fighter' | 'coach' | 'promoter';
  playerFighterId?: string;
  playerGymId?: string;
  playerPromotionId?: string;
  /** Defaults to memory, so tests and the sim harness need no browser. */
  adapter?: StorageAdapter;
  /** ISO timestamp for the save's creation. Passed in — the engine layer owns no clock. */
  createdAtIso?: string;
}

export function createNewGame(options: NewGameOptions = {}): GameDb {
  const adapter = options.adapter ?? createMemoryAdapter();
  const db = createGameDb(adapter, true);
  const seed = buildSeedWorld();

  db.fighters.upsertMany(seed.fighters as (Fighter & Entity)[]);
  db.promotions.upsertMany(seed.promotions as unknown as (Promotion & Entity)[]);
  db.gyms.upsertMany(seed.gyms as unknown as (Gym & Entity)[]);
  db.coaches.upsertMany(seed.coaches as unknown as (Coach & Entity)[]);
  db.referees.upsertMany(seed.referees as unknown as (Referee & Entity)[]);
  db.judges.upsertMany(seed.judges as unknown as (Judge & Entity)[]);

  setWorld(db, {
    day: seed.day,
    seed: options.seed ?? 'mmasim-2020',
    playerRole: options.playerRole,
    playerFighterId: options.playerFighterId,
    playerGymId: options.playerGymId,
    playerPromotionId: options.playerPromotionId,
    createdAtIso: options.createdAtIso,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  db.save();
  return db;
}

/** Load an existing world, or create a fresh one if the storage is empty. */
export function loadOrCreateGame(adapter: StorageAdapter, options: NewGameOptions = {}): GameDb {
  const db = createGameDb(adapter);
  if (db.fighters.count() > 0) return db;
  return createNewGame({ ...options, adapter });
}
