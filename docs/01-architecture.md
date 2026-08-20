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

## Fight-engine invariants

Eight rules the fight engine is built on. Each names where it is enforced, because an invariant
nothing checks is a preference — and where one is *not* yet enforced it says so, which is the
honest version of the same thing.

### 1. A plan decides what a fighter *tries*. Attributes decide whether it works.

Nothing in the tactical layer makes anybody better at anything. A 25-wrestling fighter told to take
it to the floor shoots constantly, misses, gets countered and empties his tank — that is a *failed
game plan*, and producing it is the point. The clearest demonstration is range: a pressure plan
nearly triples how often a fighter attempts to change range (3.2 attempts to 9.1) and leaves the
success rate almost untouched (54% to 52%), because whether you get there is a contest between two
fighters and has nothing to do with what your corner asked for.

*Enforced by* `tests/statistical/tactics.test.ts` — "intent is not ability", and the six-plan
validation block.

### 2. Desired state and realised state are different things, and both are observable.

`tactics.preferredState` is what was asked for. `FightState.range` and `FightState.position` are
what happened. Conflating them is what made the old model unfalsifiable: when every plan settles on
the same distribution you cannot tell *"the plan failed"* from *"the plan did not matter"*, and
those are the two most different things a simulator can be doing.

This is why range keeps two counters rather than one — attempts and arrivals — and why the
post-fight inspector states the range asked for beside the share actually spent there. Eleven
attempts for two arrivals and three attempts for two are the same clock and a completely different
fighter.

*Enforced by* `stats.rangeChangesAttempted` / `rangeChangesLanded`, and the inspector test in
`tests/ui/fight-night.test.tsx`.

### 3. A modifier that shapes matchups must not move the sport.

Covered in full under **Shape, not level** below. Test both halves — that it differentiates between
fighters, and that it is neutral across the population — unless moving the population is the
explicit, named purpose.

*Enforced by* `tests/statistical/shape-not-level.test.ts`.

### 4. Standing is three states: `outside | boxing | pocket`.

Not two, and not one with a flag. Two was tried and could not carry a boxer — a rear straight is
not a pocket-only weapon, so a conventional boxer asked to choose between kicking range and chest
to chest picks the wrong one either way. The three are a *line*, walked one step at a time by
whoever wins the range contest, in the same way the ground is a ladder.

*Enforced by* `RANGES` in `fight/types.ts` and the reflective sweep in `shape-not-level.test.ts`,
which fails any range-indexed table that is not a mean-1 shape.

### 5. Initiative is not a destination.

`pressure`, `counter`, `lead` and `movement` describe *how you take space*. They are an entry
style, and they are orthogonal to which range you want the fight at. A pressure fighter who wants
to box at range and a pressure fighter who wants the pocket are both ordinary fighters, and the
old single-axis control could express neither.

`desiredRangeOf` reads `preferredState` and nothing else — deliberately. The day it starts reading
`entry` as well, this invariant is gone and the two axes have collapsed back into one.

*Enforced by* `rangeForState` in `fight/policy.ts` taking a `PreferredState` and no other argument.

### 6. Full is the reference implementation. Reduced approximates it, never the reverse.

The two fidelity levels must agree, and when they do not, the approximation is what is wrong. It is
genuinely tempting to close a parity gap from the other end — the fix is smaller, the diff looks
tidier, and the suite goes green — and it is always wrong, because it makes the fight a player
actually watches worse in order to flatter a resolver nobody sees.

This was tried once during the range work and reverted: the failed-entry counter was softened until
the parity cell fit. The gap that remains is documented as a per-cell allowance with its cause
(doc 27 § 5.1a), and the parity suite says a second entry in that list is the signal to build the
general mechanism rather than add a third.

*Enforced by* `tests/statistical/reduced-fidelity.test.ts`.

### 7. Intent authority must be comparable across decision surfaces.

A given conviction should not become dominant or irrelevant merely because one action list happens
to be expressed in 0.05 constants and another in 25–95 capability weights.

Every choice in a fight is a weighted draw, which is a softmax over
`ln(capability × opportunity) + alignment × strength × urgency`. The two terms are directly
comparable in that space, so **the plan's authority over a decision is the ratio of their spans** —
above 1 and a convinced corner can reorder the list, near 0 and the instruction is decorative
whatever it says. `intentAuthority` in `fight/decide.ts` computes it.

The rule exists because that ratio was set per list by whichever coefficients happened to be
written there, and nothing measured it. Measured now, at full conviction, it runs from 0.32 to
10.28 across the engine's seven decision surfaces — and the same bottom instruction is worth ten
times more in guard than in side control, purely because the submission candidate is
`submissions × 0.8` in one and the literal `0.05` in the other.

*Enforced by* `tests/statistical/intent-authority.test.ts`, which currently records the gap as
bounded, named debt rather than asserting the rule outright — closing it means choosing the
baselines, which is a behaviour change and its own piece of work.

### 8. Transition and in-state behaviour are separate decisions.

*State-transition intent and in-state behaviour are separate decisions unless the actions genuinely
compete for the same moment.*

They used to be drawn from one flat weighted list at every position, so wanting to leave more
*arithmetically* meant doing less while you were there: a fighter told to stand up managed 1.96
get-ups against 0.63 and paid for it with 2.17 submission attempts against 4.96. That trade was
plausible, which is what made it hard to see, and nothing in the model chose it — a desperate
wrestler and a busy guard player are different people and one list cannot hold both. Worse, a
*failed* exit produced nothing at all: a fighter who tried to stand and did not spent the whole
beat achieving zero.

**The exception in the rule is real and load-bearing**, and it is why this was not applied
uniformly. Two actions that genuinely occupy the same moment — you cannot throw a hand and shoot a
double at the same instant — belong in one draw, so `takedown` and `clinchUp` stay in the standing
list and the clinch takedown stays in the holding one. What does not belong is *how hard am I
trying to get out of here* competing with *what am I doing while I am here*.

Where they are split, the exit is a **pre-beat**: resolved first, consuming no time of its own,
and on failure the beat continues into the in-state work. That is the shape `resolveRangeBeat`
already had standing; the bottom position and the held clinch now have it too.

The urgency to leave is built from the plan and the fighter's conviction and **nothing about his
capability** — the corner decides how often he goes for the door, the two fighters decide whether
it opens. Its neutral is what an unplanned fighter does, not one half: getting up off your back is
a property of fighting rather than of planning, the same lesson `rangeUrgency` records about its
floor.

*Enforced by* `tests/statistical/transition-intent.test.ts`. Doc 31 § F1 is the audit.

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
