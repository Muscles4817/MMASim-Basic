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
  Commentator,
  Championship,
  FightNight,
  InboxItem,
  Judge,
  Manager,
  NewsItem,
  PromotionalAgreement,
  Promotion,
  Referee,
  Rivalry,
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
  'commentators',
  'rivalries',
  'news',
  'managers',
  'agreements',
  'events',
  'championships',
  'inbox',
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
  /**
   * Which starting world this save was created from.
   *
   * Recorded rather than inferred, because it is not recoverable after the fact: a 2026 save
   * played for six years and a 2020 save played for twelve are the same day number with
   * entirely different rosters, and the menu has to be able to say which is which.
   *
   * Absent on saves made before eras existed, which are all 2020 by definition.
   */
  era?: '2020' | '2026';
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
  commentators: Repository<Commentator & Entity>;
  rivalries: Repository<Rivalry & Entity>;
  news: Repository<NewsItem & Entity>;
  managers: Repository<Manager & Entity>;
  agreements: Repository<PromotionalAgreement & Entity>;
  events: Repository<FightNight & Entity>;
  /**
   * Belts, and every reign that has ever held one.
   *
   * `Promotion.champions` stays as the fast lookup — "who holds this" is asked on every
   * matchmaking pass — and this is the truth it is derived from. Same relationship the fighter
   * has between `summary` and `record`.
   */
  championships: Repository<Championship & Entity>;
  /**
   * Things waiting on the player.
   *
   * Stored rather than derived, unlike the calendar, because read/unread and answered/unanswered
   * are state that nothing else holds — and because the advance loop has to be able to ask
   * "is anything blocking" without recomputing the world.
   */
  inbox: Repository<InboxItem & Entity>;
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
  const commentators = make<Commentator & Entity>('commentators');
  const rivalries = make<Rivalry & Entity>('rivalries');
  const news = make<NewsItem & Entity>('news');
  const managers = make<Manager & Entity>('managers');
  const agreements = make<PromotionalAgreement & Entity>('agreements');
  const events = make<FightNight & Entity>('events');
  const championships = make<Championship & Entity>('championships');
  const inbox = make<InboxItem & Entity>('inbox');
  const world = make<WorldMeta>('world');

  const all: Flushable[] = [
    fighters,
    coaches,
    gyms,
    promotions,
    referees,
    judges,
    commentators,
    rivalries,
    news,
    managers,
    agreements,
    events,
    championships,
    inbox,
    world,
  ];

  return {
    fighters,
    coaches,
    gyms,
    promotions,
    referees,
    judges,
    commentators,
    rivalries,
    news,
    managers,
    agreements,
    events,
    championships,
    inbox,
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
