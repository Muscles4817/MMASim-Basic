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
export * from './ratings/physicalScale.js';

// Domain
export * from './domain/fighter.js';
export * from './domain/personality.js';
export * from './domain/confidence.js';
export * from './domain/traits.js';
export * from './domain/disposition.js';
export * from './domain/divisions.js';
export * from './domain/nationalities.js';
export * from './domain/gameplan.js';
export * from './domain/tactics.js';
export * from './domain/officials.js';
export * from './domain/organisations.js';

// Fight
export * from './fight/types.js';
export * from './fight/profile.js';
export * from './fight/damage.js';
export * from './fight/stamina.js';
export * from './fight/scoring.js';
export * from './fight/fouls.js';
export * from './fight/broadcast.js';
export * from './fight/simulate.js';
export * from './fight/round.js';
/*
 * The policy layer stays private — it is the engine's own decision-making and nothing outside the
 * fight has any business calling it — except for this one function, which answers a question the
 * *interface* has to ask: given the state a player picked, which range were they asking for. The
 * post-fight inspector compares that against where the fight actually happened, and it has to be
 * the engine's own answer or the screen will confidently report a plan that was never run.
 */
export { rangeForState } from './fight/policy.js';

// Health
export * from './health/injuries.js';
export * from './health/freshness.js';

// Progression
export * from './progression/divisionMove.js';
export * from './progression/intensity.js';
export * from './progression/retirement.js';
export * from './progression/body.js';
export * from './progression/generation.js';
export * from './progression/names.js';
export * from './progression/ringRust.js';
export * from './progression/development.js';
export * from './progression/trainingPlan.js';
export * from './progression/origin.js';
export * from './progression/createFighter.js';

// Camp
export * from './camp/scouting.js';
export * from './camp/planner.js';

// Business
export * from './business/matchmaking.js';
export * from './business/aftermath.js';
export * from './business/lessons.js';
export * from './business/ladder.js';
export * from './business/heat.js';
export * from './business/money.js';
export * from './business/contracts.js';
export * from './business/patience.js';
export * from './business/standing.js';
export * from './business/managers.js';
export * from './business/freeAgency.js';
export * from './business/events.js';
export * from './business/eventPlans.js';
export * from './business/boutAgreements.js';
export * from './business/promotionCosts.js';
export * from './business/schedule.js';
export * from './business/inbox.js';
export * from './business/championships.js';
export * from './business/matchmakingStyle.js';
export * from './business/matchmakingIntent.js';
export * from './business/promoterRead.js';
export * from './business/news.js';

// Testing helpers (shared across the out-of-package test suites)
export * from './testing/fixtures.js';
