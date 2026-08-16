/**
 * The game database: one repository per entity type, plus save/load.
 *
 * This is the only object the UI reaches for. Screens never touch adapters, envelopes or
 * migrations — swapping the whole persistence layer means changing `createGameDb` and
 * nothing else.
 */

import type {
  Coach,
  Fighter,
  Gym,
  Judge,
  Promotion,
  Referee,
} from '@mmasim/engine';
import { createRepository } from './repository.js';
import type { Entity, Repository, StorageAdapter } from './types.js';
import { CURRENT_SCHEMA_VERSION } from './migrations.js';

/**
 * Every persisted key. Must match the repositories `createGameDb` actually builds — any
 * future export, import or delete that iterates this list would otherwise silently skip the
 * world clock and RNG seed, or look for collections that do not exist.
 */
export const COLLECTIONS = [
  'fighters',
  'coaches',
  'gyms',
  'promotions',
  'referees',
  'judges',
  'world',
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/** World-level state that is not a collection. */
export interface WorldMeta extends Entity {
  id: 'world';
  /** Current day index. See engine `core/clock`. */
  day: number;
  /** Root RNG seed. Together with `day` this reproduces the world exactly. */
  seed: string;
  /** Which role the player is in. */
  playerRole?: 'fighter' | 'coach' | 'promoter';
  playerFighterId?: string;
  playerGymId?: string;
  playerPromotionId?: string;
  createdAtIso?: string;
  schemaVersion: number;
}

type Flushable = { flush(): void; isDirty(): boolean };

export interface GameDb {
  fighters: Repository<Fighter & Entity>;
  coaches: Repository<Coach & Entity>;
  gyms: Repository<Gym & Entity>;
  promotions: Repository<Promotion & Entity>;
  referees: Repository<Referee & Entity>;
  judges: Repository<Judge & Entity>;
  world: Repository<WorldMeta>;
  /** Persist every dirty collection. Call at save points, not on every mutation. */
  save(): void;
  /** True if anything has changed since the last `save()`. Drives the unsaved-work prompt. */
  hasUnsavedChanges(): boolean;
  /** Wipe everything. Used by "new game" and by the editor's reset. */
  reset(): void;
}

export function createGameDb(adapter: StorageAdapter, fresh = false): GameDb {
  const make = <T extends Entity>(name: string) =>
    createRepository<T>(name, adapter, { fresh });

  const fighters = make<Fighter & Entity>('fighters');
  const coaches = make<Coach & Entity>('coaches');
  const gyms = make<Gym & Entity>('gyms');
  const promotions = make<Promotion & Entity>('promotions');
  const referees = make<Referee & Entity>('referees');
  const judges = make<Judge & Entity>('judges');
  const world = make<WorldMeta>('world');

  const all: Flushable[] = [fighters, coaches, gyms, promotions, referees, judges, world];

  return {
    fighters,
    coaches,
    gyms,
    promotions,
    referees,
    judges,
    world,
    save: () => {
      for (const repo of all) repo.flush();
    },
    hasUnsavedChanges: () => all.some((repo) => repo.isDirty()),
    reset: () => {
      for (const repo of all as unknown as Repository<Entity>[]) repo.clear();
      for (const repo of all) repo.flush();
    },
  };
}

/** Read world meta, or a sensible empty world. */
export function getWorld(db: GameDb): WorldMeta {
  return (
    db.world.findById('world') ?? {
      id: 'world',
      day: 0,
      seed: 'mmasim',
      schemaVersion: CURRENT_SCHEMA_VERSION,
    }
  );
}

export function setWorld(db: GameDb, changes: Partial<WorldMeta>): WorldMeta {
  const next: WorldMeta = { ...getWorld(db), ...changes, id: 'world' };
  db.world.upsert(next);
  return next;
}
