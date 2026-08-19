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
import { buildSeedWorld, type EraId } from '../seed/index.js';
import type {
  Coach,
  Commentator,
  Fighter,
  Gym,
  Judge,
  Manager,
  Championship,
  Promotion,
  Referee,
} from '@mmasim/engine';

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
  /**
   * Which starting world.
   *
   * Defaults to `2020`, not to the menu's default. That looks backwards and is deliberate:
   * this function is the *engine* entry point, and every existing test, fixture and long-sim
   * was written against the 2020 roster and measures it by name. Silently changing what they
   * build would not make them wrong, it would make them test something else while still
   * passing — which is the worst possible outcome for a suite this one relies on.
   *
   * The player-facing default lives in `DEFAULT_ERA` and is chosen at the menu, which is where
   * a decision about what a new player should see actually belongs.
   */
  era?: EraId;
}

export function createNewGame(options: NewGameOptions = {}): GameDb {
  const adapter = options.adapter ?? createMemoryAdapter();
  const db = createGameDb(adapter, true);
  const era = options.era ?? '2020';
  const seed = buildSeedWorld(era);

  db.fighters.upsertMany(seed.fighters as (Fighter & Entity)[]);
  db.promotions.upsertMany(seed.promotions as unknown as (Promotion & Entity)[]);
  db.gyms.upsertMany(seed.gyms as unknown as (Gym & Entity)[]);
  db.coaches.upsertMany(seed.coaches as unknown as (Coach & Entity)[]);
  db.referees.upsertMany(seed.referees as unknown as (Referee & Entity)[]);
  db.judges.upsertMany(seed.judges as unknown as (Judge & Entity)[]);
  db.commentators.upsertMany(seed.commentators as unknown as (Commentator & Entity)[]);
  db.managers.upsertMany(seed.managers as unknown as (Manager & Entity)[]);
  db.championships.upsertMany(seed.championships as unknown as (Championship & Entity)[]);

  /*
   * The shape the sport starts in, so the intake can hold it.
   *
   * Measured rather than assumed: the two eras differ by a factor of six in division depth, and
   * a custom world could differ by more again.
   */
  const divisionTargets: Record<string, number> = {};
  const rosterTargets: Record<string, number> = {};
  for (const row of db.fighters.findAll()) {
    const fighter = row as { divisionId?: string; promotionId?: string; retiredDay?: number };
    if (fighter.retiredDay !== undefined) continue;
    if (fighter.divisionId) {
      divisionTargets[fighter.divisionId] = (divisionTargets[fighter.divisionId] ?? 0) + 1;
    }
    if (fighter.promotionId) {
      rosterTargets[fighter.promotionId] = (rosterTargets[fighter.promotionId] ?? 0) + 1;
    }
  }

  setWorld(db, {
    day: seed.day,
    divisionTargets,
    rosterTargets,
    seed: options.seed ?? `mmasim-${era}`,
    era,
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

/**
 * Load an existing world, or create a fresh one if the storage is empty.
 *
 * Probes the `world` row rather than the fighter count. "No fighters" is not the same
 * question as "no save": `Repository.clear()` is public and documented for the editor, so a
 * player who cleared the roster to author their own would have their clock, seed, promotions
 * and gyms silently destroyed and re-seeded on the next reload.
 */
export function loadOrCreateGame(adapter: StorageAdapter, options: NewGameOptions = {}): GameDb {
  const db = createGameDb(adapter);
  if (db.world.findById('world') !== undefined) {
    backfillCommentators(db);
    repairContractMismatch(db);
    return db;
  }
  return createNewGame({ ...options, adapter });
}

/**
 * Put fighters back at the promotion they are actually signed to.
 *
 * A fighter carries two facts about who they fight for: `promotionId`, which drives matchmaking
 * and rankings, and `agreementId`, which points at the signed deal. They are supposed to agree,
 * and two separate defects used to pull them apart.
 *
 * The hub's old `signWith` set `promotionId` alone, leaving the fighter at a new promotion on
 * the old one's contract. And `resolveFreeAgency` — the one loop in `advanceWorld` that did not
 * take the player exclusion — would pick a promotion at random and sign the *player* to it every
 * quarter. Together they produced saves where a fighter owed one promotion three fights while
 * being ranked, matched and offered title shots by another.
 *
 * Both causes are fixed, but saves made before the fixes still carry the damage, and the damage
 * is invisible until it produces something absurd. The agreement wins because it is the signed
 * document: a `promotionId` with no agreement behind it is the corruption, not the truth.
 */
function repairContractMismatch(db: GameDb): void {
  for (const row of db.fighters.findAll()) {
    const fighter = row as Entity & { promotionId?: string; agreementId?: string };
    if (!fighter.agreementId) continue;

    const agreement = db.agreements.findById(fighter.agreementId) as
      (Entity & { promotionId?: string }) | undefined;
    if (!agreement?.promotionId) continue;
    if (agreement.promotionId === fighter.promotionId) continue;

    db.fighters.upsert({ ...fighter, promotionId: agreement.promotionId } as never);
  }
  db.save();
}

/**
 * Give an older save the commentator roster it never had.
 *
 * Commentators were added as a collection after the first saves existed. A missing booth
 * degrades gracefully — the replay simply has no colour — but silently losing a feature on
 * load is the kind of thing nobody ever notices is broken, so it is backfilled instead.
 *
 * Deliberately additive and idempotent: it never touches a collection that already has
 * anything in it, so a player who edited or deleted the booth keeps their edit.
 */
function backfillCommentators(db: GameDb): void {
  if (db.commentators.count() > 0) return;
  db.commentators.upsertMany(buildSeedWorld().commentators as unknown as (Commentator & Entity)[]);
  db.save();
}
