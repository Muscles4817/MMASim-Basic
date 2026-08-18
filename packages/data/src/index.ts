/**
 * @mmasim/data — the light document DB, repositories, save/load and the seed roster.
 *
 * Application code should reach for `GameDb` and never for adapters, envelopes or
 * migrations directly. See docs/09-data-layer.md.
 */

export * from './db/types.js';
export * from './db/adapters.js';
export * from './db/backends.js';
export * from './db/saveStorage.js';
export * from './db/repository.js';
export * from './db/migrations.js';
export * from './db/gameDb.js';
export * from './db/saves.js';
export * from './seed/index.js';
export * from './world/newGame.js';
