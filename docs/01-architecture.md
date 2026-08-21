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

Nine rules the fight engine is built on. Each names where it is enforced, because an invariant
nothing checks is a preference — and where one is *not* yet enforced it says so, which is the
honest version of the same thing.

### 1. A plan decides what a fighter *tries*. Attributes decide whether it works.

Stated precisely, because the two halves land in different places in the code:

> **Tactical intent primarily controls attempt selection and frequency. Capability and opposition
> primarily control success.**

Nothing in the tactical layer makes anybody better at anything. A 25-wrestling fighter told to take
it to the floor shoots constantly, misses, gets countered and empties his tank — that is a *failed
game plan*, and producing it is the point. The clearest demonstration is range: a pressure plan
nearly triples how often a fighter attempts to change range (3.2 attempts to 9.1) and leaves the
success rate almost untouched (54% to 52%), because whether you get there is a contest between two
fighters and has nothing to do with what your corner asked for.

**1a. Capability weighs strongly on whether an action works and only lightly on whether it is
chosen.** The corollary that keeps the rule true inside a single weighted draw. When intent and
capability multiply into one weight, an attribute with a steep convexity quietly takes the decision
over: `groundControl` spans 9:1 across the roster and `scrambling` 6.8:1, and letting either through
undamped made the choice a property of the fighter rather than of his corner — undamped,
`standUpFromTop` is picked on 7.8% of top-position beats at 15 scrambling and 36.5% at 95, on the
same instruction, against the twelve-fold span the plan is supposed to own. Both actions therefore damp the capability term in the *decision* — `maintainPosition`
by an exponent of 0.6, `standUpFromTop` by 0.25 — and use it at full strength in the *contest* that
follows. The damping is not a fudge factor: it is the statement that knowing you can do a thing
makes you somewhat readier to try it, and much better at it.

*Enforced by* `tests/statistical/tactics.test.ts` — "intent is not ability", and the six-plan
validation block; and by `tests/statistical/top-disengagement.test.ts` for the damping, which holds
attempt rates inside 1.5:1 across the roster's whole scrambling range while success spans 2.4:1.

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

**6a. They may differ about how much. They may not differ about which way.**

> For any tactical instruction with a clearly directional mechanism, Full and Reduced must agree on
> the sign of its effect under controlled fighters.

The quantitative half of parity is deliberately loose and always will be: Reduced resolves a round
at a time and gives up path, so it will never reproduce Full's magnitudes and nothing needs it to.
Causality is a different thing. A quantitative gap makes Reduced a coarser version of the same
sport; a sign flip makes it a **different sport**, and since a world simulated at Reduced is where
the player's opponents come from, careers get built there under tactical incentives that do not
exist in the game the player is shown.

It was broken, and by a clamp. `controlShare` returned a fighter's grappling *pull*, which the round
loop divides by the sum of both pulls to decide who imposes the round — and it was capped at the
ceiling belonging to the realised *share*. Every fighter good enough at grappling to exceed the cap
returned exactly the cap whatever his corner had asked for, while his opponent's pull was not
saturated and still moved with his plan. So a grinder told to take the fight to the floor got *less*
control at Reduced detail than the same grinder told to stand and strike: 168 seconds a round against
152, where Full gave 137 against 217.

The general lesson, and it is worth stating separately because it produced the same bug three times
in one function: **a clamp on an intermediate quantity destroys information about everything above
it.** Where a ceiling is real, apply it to the thing it is a ceiling *on* — here the round's own
capacity, in the round loop, where it always belonged.

Where a Reduced abstraction genuinely cannot carry a magnitude, say so in the allowance table and
move on. It still has to carry the sign.

*Enforced by* `tests/statistical/reduced-fidelity.test.ts` for magnitude and
`tests/statistical/reduced-direction.test.ts` for direction; `tools/reduced-direction.ts` is the
instrument. Doc 31 § D10 is the diagnosis.

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

Three rules follow from it, and each was learned by getting it wrong first:

**8a. Exit intent is independent of the number and weight of in-state actions.** Adding another way
to work from a position must not make a fighter less interested in leaving it. The first cut derived
the urgency from the ratio of intents across the two lists, so introducing `pummel` — an action that
*helps a striker leave* — dropped his break attempts from 91% of beats to 51%, because the new
candidate landed on the "staying" side of a ratio it had no business being in.

**8b. Time is charged once for a resolved beat.** Parallel decision layers must not independently
advance the clock, or accrue stalled time, for the same period of action. Booking stalled seconds on
both the failed exit and the in-state work made a bottom beat accrue 20–32 seconds where it used to
accrue 20, which raised referee restarts across the whole sport.

**8c. Split only where the decisions are genuinely simultaneous.** Mutually exclusive actions stay
competitors: `takedown` and `clinchUp` remain in the standing list because you cannot throw a hand
and shoot a double in the same instant, and the clinch takedown stays in the holding list for the
same reason. A generic two-roll structure applied everywhere would break the positions that are
already right.

*Enforced by* `tests/statistical/transition-intent.test.ts`. Doc 31 § F1 is the audit.

### 9. Neutral means the unplanned baseline, not the midpoint of a range.

Every scale in the tactical layer has a value that represents *no instruction*, and it is whatever
the sport does on its own — never the arithmetic middle of the range the scale happens to span. A
neutral may legitimately be 0.80, or 0.56, or 0.38.

The engine is calibrated on a roster that mostly has no game plan, so the unplanned value is not a
default in the programming sense, it is **the number the whole sport is balanced around**. Choosing
a tidy midpoint instead silently rebalances the game:

- `rangeUrgency` floors at 0.3 because a fighter with no instructions still manages distance;
  without it, 63% of every unplanned fight sat at kicking range with the range beat never firing.
- `exitUrgency` centres at 0.80 underneath and 0.56 in the clinch, both measured from what the
  engine did before the transition split. Centring them at a half made every unplanned fighter in
  the game stop trying to stand, and cost the striking attributes two points of win-rate swing.

The corollary is that a neutral is **measured, not chosen**: it is what the previous behaviour
produced, recorded at the point of change.

*Enforced by* `tests/statistical/transition-intent.test.ts` for the exit rates, and by the
statistical tier at large for the range floor.

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
| Long-sim regression| `tests/long-sim/`            | on demand   | 20 in-game years: no ratings inflation, sane career lengths, division health |

Statistical tests assert on *distributions with tolerances*, never on single outcomes.
Every one of them is seeded, so a failure is reproducible.

The **playability tier** exists because "it typechecks" and "the dev server returns 200"
answer neither of the questions that actually matter: does the UI render, and can a player
get from a cold start to a finished fight? It uses no mocks — real providers, real database,
real engine — and runs under `StrictMode`, so double-invoked effects and initialisers are
exercised too. It covers the full career loop, every screen, theme switching, save
persistence, corrupt-save recovery and the accessibility basics.

### Continuous integration

Two workflows, and the distinction between them is the point.

| Workflow | Trigger | Runs | Answers |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `pull_request`, plus `push` to master | `lint`, `typecheck`, `test` | *Is this change safe to merge?* |
| `.github/workflows/pages.yml` | `push` to master | `typecheck`, `test`, build, deploy | *Is this branch safe to publish?* |

`ci.yml` exists because `pages.yml` alone is not a gate. It triggers on `push` to master, so it
runs after the merge button, on code already on the default branch — it can tell you master is
broken, and it cannot stop master from breaking. `ci.yml` runs the same checks on the pull request,
where a red result is still actionable. The two overlap deliberately: the deploy keeps its own
gate so a direct push or a re-run cannot publish a broken build.

`ci.yml` also runs `npm run lint`, which the deploy does not. It runs every step even after one
fails, so a red test does not hide a lint error you would only meet on the next push.

**`npm test` is capped at two workers** (`maxWorkers` in `vitest.config.ts`). Vitest's default is
one per core, and on a four-core runner that starves its own main thread until the reporter RPC
times out — `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`, counted as an unhandled
error, exit 1, every test passing. It failed six consecutive deploys that way. The cap costs
almost nothing, because at ~720s of test CPU over a ~335s wall the suite was achieving about 2.1x
parallelism on four cores regardless.

The long-sim tier runs in neither workflow: twenty in-game years is minutes of CPU, and it guards
drift over time rather than the correctness of a diff. Run it with `npm run test:long` before
anything that touches progression, ageing or matchmaking.

### Assert as close as possible to the mechanism

A claim should be tested on the quantity that carries it, not on something downstream that
correlates with it today.

> **Time-share tests are for positional occupancy. Attempt- and action-share tests are for
> tactical preference. Do not infer one from the other unless the mechanism actually links them.**

- **Clock share** is the right axis for a claim about *time allocation* — a striking plan spends
  more of the fight standing than a wrestling plan does.
- **Attempt counts and rates** are the right axis for a claim about *tactical intent* — told to get
  up, a fighter goes for the exit more often. How long he then spends underneath is settled by 40
  scrambling against 82 ground control, and asserting the plan on it is asserting the plan on
  somebody else's attributes.

The inference this forbids is the one the old tactical suite was built on: *does more submissions*
therefore *must spend more seconds on his back*. That held only while wanting a thing and doing
nothing else were the same act, and it stopped holding the moment the decisions were separated. A
fighter told to hunt submissions from the bottom now attacks more **and** gets up more, because
those are two axes of one plan rather than two ends of one slider; a fighter on top told he would
rather be standing keeps hitting at the same rate per minute of top position and simply has fewer
of them. Neither of those is visible to a seconds-in-position bound, and a bound that reads them as
a regression is measuring a coupling the engine no longer has.

Where the mechanism *does* link them, say which one, in the test. Voluntary top disengagement
genuinely converts an action share into a clock share — every exit that lands ends the position —
so `top-disengagement.test.ts` asserts both, and names the conversion as the reason it is allowed
to.

Three assertions moved from the clock to the attempt during the transition split, and each had
looked fine for months because the two axes were coupled: choosing to stand up *also* meant not
doing anything else, so an instruction bought time off the floor by suppressing everything that kept
him there. Separating the decisions broke the correlation and the tests failed — correctly. Two of
the three had under 1% headroom before the change, which is the tell: a downstream proxy passes
until the day the coupling it depends on is removed.

Where a rate is used, normalise by exposure. Escape attempts *per fight* read 8.2 against 5.9
between two plans while the rates read 1.51 against 0.98 a minute, because the fighter told to stay
down is underneath for longer and accumulates attempts he never chose to make.

### Deterministic equivalence is exact; statistical claims get tolerances

Two kinds of test live in `tests/statistical/` and they are not the same kind of test.

- A **deterministic equivalence** claim — the same seeds must produce the same fights — is asserted
  with **exact equality**, and is deliberately fitted to one draw. That is what makes it a strong
  statement. Re-seeding such a test is a category error: it compares two different samples and calls
  the difference a regression. The golden fingerprint in `intent-authority.test.ts` is the example,
  and it caught a 0.1% perturbation of a single constant when tested against one.
- A **statistical** claim — about a distribution — gets an explicit tolerance and is **swept across
  several seed salts** before its bound is set. Never fit a bound to one draw. Four assertions in
  this repo failed that sweep on at least one salt; two of them were pre-existing bounds sitting on
  under 1% headroom.

If a deterministic test needs more statistical power, the answer is more fights, not a wider bound.

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
