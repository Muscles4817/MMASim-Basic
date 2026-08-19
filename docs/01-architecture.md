# 01 — Architecture

> Status: living document.

## Package layout

This is an npm-workspaces monorepo. The dependency graph is a strict DAG — arrows point at
what a package is *allowed* to import.

```
@mmasim/app  ──────┐
   (React UI)      │
                   ├──▶  @mmasim/data  ──▶  @mmasim/engine
@mmasim/editor ────┘      (seed roster,        (pure sim,
   (route in app)          light DB)            zero deps)
```

| Package           | Path                | May import                | Contains                                                 |
| ----------------- | ------------------- | ------------------------- | -------------------------------------------------------- |
| `@mmasim/engine`  | `packages/engine`   | **nothing** (stdlib only) | Domain types, RNG, fight sim, camps, development, world tick |
| `@mmasim/data`    | `packages/data`     | `engine`                  | Light DB, repositories, seed rosters, save/load           |
| `@mmasim/app`     | `packages/app`      | `engine`, `data`          | React UI, screens, design system, editor                 |

### The one rule that matters

**`@mmasim/engine` has zero runtime dependencies and no I/O.** No `fetch`, no `localStorage`,
no `Date.now()`, no `Math.random()`. Everything it needs is passed in. This is what makes
the long-sim regression suite possible: the engine is a pure function of
`(state, inputs, seed) → newState`.

A lint rule enforces the import direction. A unit test asserts the engine bundle contains
no reference to `Math.random`.

## Determinism

Every stochastic decision goes through a seeded PRNG (`packages/engine/src/core/rng.ts`,
a `sfc32` variant). Rules:

1. The engine never reads ambient randomness or the wall clock.
2. An RNG is *forked* per subsystem (`rng.fork('fight:' + fightId)`) so that adding a new
   random call in the camp system does not shift the outcome of every future fight. This
   keeps regression baselines stable across unrelated changes.
3. Any saved game stores its root seed and its tick counter. Reloading and re-simulating
   the same tick produces byte-identical results.

Why this matters beyond testing: it lets us offer "re-watch this fight", show the player a
*seeded preview* of odds via Monte Carlo, and diff two game plans against the same opponent
using identical random draws — an A/B that is otherwise impossible.

## Time model

The world advances in **days**, but the player experiences it in **weeks**. A `WorldClock`
holds an integer day index from an epoch (`2020-01-01 = day 0`), so no `Date` object ever
enters the engine. Rendering to a human-readable date happens in the UI layer only.

Scheduled things (fights, camp phases, contract expiries, injury recovery) are stored as
absolute day indices, never as durations, so a save can be resumed without replaying.

## Layering inside the engine

```
packages/engine/src/
  core/          rng, math curves, ids, clock, result types   ← no domain knowledge
  domain/        Fighter, Promotion, Gym, Contract, Event…    ← types + invariants only
  ratings/       attribute scale, effect curves, derived stats
  fight/         the exchange-by-exchange simulator
  camp/          scouting, game plans, training blocks
  progression/   development, potential, ageing, decline
  health/        injuries, accumulated damage, weight cutting
  business/      heat, rivalries, marketing, contracts, matchmaking
  world/         the tick loop that drives all of the above
```

Lower layers never import upper ones. `domain/` is types and invariants — no behaviour that
needs an RNG.

## State shape & mutation

The world state is a plain, serialisable object tree. No classes with methods, no `Map`s in
persisted state (they don't survive `JSON.stringify`), no cyclic references — entities refer
to each other by **branded ID strings** (`FighterId`, `PromotionId`, …), never by object
reference.

```ts
type FighterId = string & { readonly __brand: 'FighterId' };
```

Branded IDs cost nothing at runtime and make it a compile error to pass a `GymId` where a
`FighterId` belongs — worth it in a codebase with a dozen entity types.

Systems are written as `(state, input) => Patch[]` where practical, applied by a single
reducer. Where a full immutable rewrite would be gratuitous (the fight simulator's inner
loop, which allocates hard), we use a local mutable scratch object and return an immutable
result. That exception is documented at the call site.

## Testing strategy

| Tier               | Location                     | Runs        | Guards                                     |
| ------------------ | ---------------------------- | ----------- | ------------------------------------------ |
| Unit               | `*.test.ts` beside source    | every commit| Pure functions, curves, invariants         |
| Integration        | `tests/integration/`         | every commit| A full fight, a full camp, a full event    |
| Statistical        | `tests/statistical/`         | every commit| 10k-fight distributions: KO rates, decisions, upset frequency |
| Playability        | `tests/ui/`                  | every commit| Mounts the real app in jsdom and drives it with real clicks |
| Long-sim regression| `tests/long-sim/`            | on demand + CI | 20 in-game years: no ratings inflation, sane career lengths, division health |

Statistical tests assert on *distributions with tolerances*, never on single outcomes.
Every one of them is seeded, so a failure is reproducible.

The **playability tier** exists because "it typechecks" and "the dev server returns 200"
answer neither of the questions that actually matter: does the UI render, and can a player
get from a cold start to a finished fight? It uses no mocks — real providers, real database,
real engine — and runs under `StrictMode`, so double-invoked effects and initialisers are
exercised too. It covers the full career loop, every screen, theme switching, save
persistence, corrupt-save recovery and the accessibility basics.

### Shape, not level

A rule with its own file, `tests/statistical/shape-not-level.test.ts`, because it was learned four
times in one change and each time it cost a day:

> **A modifier that shapes matchups must not move the sport.** Test it for both — that it makes a
> difference *between* fighters, and none *to the population* — unless moving the population is
> the explicit, named purpose of the thing.

The failure is always the same and never looks like itself. A table of multipliers is two things
at once: a *shape*, which says which state is favoured, and a *level*, which says how much the
whole thing is worth. Almost every table in this engine is written intending only the first, and a
table of `{0.5, 1.0, 1.55}` has a mean of about 1.0 only by luck — under the distribution it is
actually sampled at, that one means 0.84, so the mechanic it gates got 16% harder *everywhere*
while the author was thinking about which end was which. It surfaces months later as a roster
knockout rate that moved when nothing about knockouts was touched.

The fix is mechanical: divide the table by its own mean under a declared reference distribution,
and make the reference explicit so it can be checked. `shapeOnly()` in `fight/range.ts` and
`NEUTRAL_HABIT` in `fight/profile.ts` are the two implementations; the test file reflects over the
exports and fails anything indexed by a state that is not mean-1 and not on a named exceptions
list.

The second half of the rule needs populations rather than arithmetic, because the worst instance
of this bug was never a table at all — it was a bias folded into the engine on behalf of a default
that no longer existed, applied whether or not the fighter meant anything by it. The test for that
shape is: a plan with no conviction behind it must produce numerically identical fights to no plan,
and opposing plans must move the sport in opposite directions by comparable amounts. A modifier
that pushes only one way is a level wearing a shape's clothes.

## Editor

The editor is not a separate app. It is a route group inside `@mmasim/app` that operates on
the same repositories as the game, so there is exactly one definition of "a valid fighter".
It is gated behind a setting rather than a build flag, so players can use it too.

See [11 — Editor](./11-editor.md).
