/**
 * @mmasim/engine — pure, deterministic MMA simulation.
 *
 * No runtime dependencies, no I/O, no `Math.random`, no `Date`. Everything is a function of
 * `(state, inputs, seed)`. See docs/01-architecture.md.
 */

// Core
export * from './core/rng.js';
export * from './core/math.js';
export * from './core/ids.js';
export * from './core/clock.js';

// Ratings
export * from './ratings/attributes.js';
export * from './ratings/curve.js';
export * from './ratings/derived.js';

// Domain
export * from './domain/fighter.js';
export * from './domain/personality.js';
export * from './domain/traits.js';
export * from './domain/divisions.js';
export * from './domain/gameplan.js';
export * from './domain/officials.js';
export * from './domain/organisations.js';

// Fight
export * from './fight/types.js';
export * from './fight/profile.js';
export * from './fight/damage.js';
export * from './fight/stamina.js';
export * from './fight/scoring.js';
export * from './fight/simulate.js';

// Testing helpers (shared across the out-of-package test suites)
export * from './testing/fixtures.js';
