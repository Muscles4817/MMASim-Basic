# Review — adversarial

> Angle: argue as strongly as the evidence allows that expanding the style model is a mistake, and
> identify what breaks if it happens anyway. Explicitly told to be intellectually honest and to say
> so plainly if it concluded the expansion was worth doing. Reviewer was given doc 18, the engine,
> and the owner's stated concern about match/commentary coherence and testing.
> Unedited except for HTML-entity cleanup. See [README](README.md) for which claims I checked.
>
> **Note:** this reviewer read the tree while the origin-system implementation was still in flight.
> Its §2C criticism that `origin.ts` is untested was true at the time and is now stale — there are
> 38 unit tests and 12 UI tests for it.

---

**Verdict up front, honestly:** the expansion as framed in doc 18 is the wrong shape. But my conclusion is not "do nothing" — it is that **the three highest-value style fixes available all require zero new attributes, and the one change doc 18 explicitly recommends (a clinch-striking attribute) is the worst value on the list.** I can support that from measurements, below.

---

## 1. Corrections to `docs/18-styles-and-the-fight-engine.md`

The doc is unusually honest, but it overstates the problem in five places, and two of them are load-bearing.

### 1.1 "No stance concept anywhere in the engine" (§4.2) — false

`Fighter.stance: 'orthodox' | 'southpaw' | 'switch'` exists at `packages/engine/src/domain/fighter.ts:134`. It is generated (`progression/generation.ts:194`), settable on created fighters (`progression/createFighter.ts:150,351`) and set on test fixtures (`testing/fixtures.ts:73`). What is missing is a *consumer*, not a concept. Same for `reachInches`/`heightInches` (`fighter.ts:132-133`, generated at `generation.ts:192-193`), read by nothing in `packages/engine/src/fight/`.

This matters because it reclassifies stance from "schema change + 233 seed edits + migration" to "add one term to a contested roll." Entirely different cost bracket.

### 1.2 "`strikeLean` … is the only axis of stylistic identity the engine computes" (§2.4) — misleading in the way that matters most

`tendencies` is read in **exactly one place in the entire fight loop**: `simulate.ts:588`, inside `prepBonus`. Nothing else consults it. Confirmed by grep — the only other consumers are `camp/scouting.ts` and `CampScreen.tsx`.

So `strikeLean`, and the whole tendency profile, **do not drive fighting behaviour at all.** They determine what the *opponent's camp* can profitably drill against. In-fight identity actually comes from the four-way intent weighting at `simulate.ts:609-631`, which reads raw attributes × `approachWeight` × `exploitFactor` — a materially richer object than one scalar slider.

The practical consequence: the doc frames identity as one-dimensional and therefore in need of more dimensions. It isn't. Adding a `clinchStriking` attribute would add a *fifth intent weight*, and the marginal expressiveness of a fifth term in a `pickWeighted` over four is much lower than the doc's framing implies.

### 1.3 "Exactly two [traits] touch technique" (§2.3) — three, and there is a fourth already-wired hook nobody used

- `gunShy` (`traits.ts:197`, `strikeOutput: 0.75`) feeds `highVolume` via `traitMul` at `profile.ts:58`. Three traits, not two.
- More usefully: **`takedownRate` is a declared `MUL_HOOK` (`traits.ts:24`) that is read by the simulator at `simulate.ts:935` and implemented by no trait in the table.** It is a fully-wired, zero-cost style extension point sitting unused. `traitMul` returns 1.0 for it on every fighter alive.

The doc says "Traits carry no technique. The obvious extension point for flavour is unused." That is right, but it understates how cheap the fix is: adding a `judoka`-flavoured trait with `add: { takedownRate: 1.15 }` requires **no simulator change at all**, exactly as `traits.ts:3-7` promises. That is a genuinely free win the doc does not surface.

### 1.4 "The cheapest real win is a clinch-striking attribute" (§5) — measured, and it is the most expensive change landing on the least-used branch

I profiled every same-division pairing on the 2026 roster (4,000 bouts):

```
2026 roster, per fight:  distance strikes 21.2 | kicks 3.7 | clinch entries 6.85
                         LANDED CLINCH STRIKES 0.67 | takedowns 5.53 | ground 7.88 | subs 5.99
```

**The average fight in the shipped world contains two thirds of one landed clinch strike.** Clinch entries happen ~7 times a fight, but inside `resolveClinch` the strike intent (`simulate.ts:990`, `strikingOffence × 0.8`) competes against takedown (`chainWrestling × 1.2`, `:989`) and stall (`:991`), and the controlled fighter's escape branch (`:977-987`) consumes many of the exchanges outright. It converts to <1 landed knee per bout.

Even at archetype extremes the number does not move: journeyman-vs-journeyman is 0.83/fight; smotherer-vs-striker is 0.41.

An attribute added here would be the highest-cost change in the document (schema, 233 seed fighters, migration, training table, generation, seven exhaustive `Record<AttributeKey,…>` literals) attached to the rarest resolved event in the engine. If it were free it would still be low-value; it is not free.

### 1.5 "Striking has 3 attributes against grappling's 5" (§4.3 #1) — right count, wrong diagnosis. This is the real finding.

The doc treats the striking/grappling asymmetry as an attribute-count problem. It isn't. Read the strike resolution path:

- `damage.ts:91-100` `strikeDamage(attacker, target, flushness)` — **`isKick` is not a parameter.** Damage is `BASE_DAMAGE[target] × power × size × flushness`.
- `damage.ts:110-134` `knockdownHazard(...)` — also never sees `isKick`. Hazard is power/chin.
- `damage.ts:79` `rollFlushness` skews accuracy by **`attacker.attrs.strikingOffence`** — *even when the strike is a kick*.

So `kicking` gates only *whether the attempt is chosen* (`simulate.ts:614-617`) and *which attribute contests the landing roll* (`simulate.ts:772`). Every consequence downstream is computed from `strikingOffence` and `power`.

**A head kick from a Kicking-95 / StrikingOffence-40 fighter lands as flush as that fighter's jab, does identical damage, and carries identical knockout hazard.** BASE_DAMAGE is head 2.2 / body 2.6 / legs 2.4 — a punch to the legs and a calf kick are the same event.

That is why Muay Thai and Dutch kickboxing collapse together. Not the clinch. In this engine **a kick is a punch with a different noun.**

And it is cheap to fix: thread `isKick` into `strikeDamage`/`rollFlushness` and give kicks their own damage/flushness profile — higher variance, higher head-kick hazard, lower volume. No new attribute, no schema change, no migration, no seed edit. The existing `kicking` attribute immediately becomes a *different* weapon rather than a differently-named one, and the statistical suite can measure the result on the existing archetypes.

### 1.6 The doc misses that style already reaches booking

`business/matchmakingStyle.ts:71-91` `entertainmentValue()` reads style straight off attributes — `finishing` from power/submissions, `recklessness` from strikingOffence vs strikingDefence, `grind` from groundControl/wrestling — and it is consumed by `contenderQueue` (`:197-215`) and `favourFor` (`:252-278`). Style is not fight-local today; it already decides who gets pushed. The doc's §5 claim that "character creation is the consumer" is too narrow, and it means a new attribute has a second, unmentioned blast radius.

---

## 2. The case against expansion, at its strongest

### 2A. The engine already renders style visibly. What it does not do is make style *decide fights* — and that is a balance property, not a granularity one.

I ran uniform-50 fighters against a uniform-50 opponent, varying one attribute (n=3,000 each):

| Variant | red win | KO rate | red kicks/fight |
|---|---|---|---|
| `kicking: 30` | 45.3% | 6.3% | 1.38 |
| `kicking: 50` (control) | 45.7% | 7.3% | 2.94 |
| `kicking: 90` | 46.2% | 11.8% | 9.05 |
| `strikingOffence: 90` | 52.6% | 17.9% | 1.72 |
| `wrestling: 90` | 54.9% | 4.2% | 1.71 |

(win rates sit near 46% not 50% because identical fighters draw ~8% of the time — see `balance.test.ts:38`.)

Read this carefully, because it cuts both ways and both cuts favour restraint:

**A 60-point swing in `kicking` changes visible behaviour by 6.6× (1.38 → 9.05 kicks per fight) and changes who wins by ~1 percentage point.** By contrast `strikingOffence` moves the win rate ~7pp and `wrestling` ~9pp.

- The optimistic reading: the emergent-from-ratios model already does the job doc 18 wants. A player watching a Kicking-90 fighter sees a fighter who kicks nine times a fight instead of one. That *is* legible style, produced with no style field, exactly as §5 hopes.
- The pessimistic reading, which is the real argument: **`kicking` is already nearly outcome-neutral, and a new style attribute would be more so.** `overallRating` weights `kicking` at 0.7 — joint-lowest with `strength` (`attributes.ts:308,306`). A new clinch or range attribute would enter that table at a similarly small weight or at zero. Either way it is strategically inert: the player has no reason to train it (`development.ts` focus tables), the AI has no reason to matchmake around it, and it does not change results. You will have paid full schema price for cosmetics.

If the goal is "Muay Thai should *feel* different," the lever is §1.5 — make kicks behave differently — not a new number. If the goal is "Muay Thai should *win* differently," a new attribute weighted at 0.7 will not deliver that either.

### 2B. Commentary is already less accurate than the simulation, and granularity multiplies the divergence

`commentary.ts` is a pure noun-picker over `Rng`, entirely disconnected from the fighter. Three divergences exist **today**:

1. **Missed kicks are narrated as missed punches.** `simulate.ts:790` emits `emit('strike', say.strikeMissed(rng, actor, strikeTarget))` — `isKick` is in scope and is not passed. `commentary.ts:93-95` `strikeMissed` reads `STRIKES[target]`, never `KICKS`. A fighter who throws and misses a head kick is announced as "swings and misses with a right hand down the pipe."
2. **A boxer's punches to the legs are narrated as leg kicks.** `pickTarget` (`simulate.ts:688-691`) selects head/body/legs from the game plan for punches *and* kicks. `commentary.ts:52` sets `STRIKES.legs = LEG_STRIKES`. With the default targeting split (`gameplan.ts:227`, legs 0.15), roughly one punch in seven from a pure boxer is narrated as "a calf kick" or "a low kick to the thigh."
3. **Takedown entries are random and ignore the tendencies the engine already computed.** `commentary.ts:118` picks uniformly from `['a double leg','a single leg','a body lock','a reactive shot','a trip']`. A judoka whose `bodyLock` tendency is 0.8 and `doubleLeg` 0.2 is narrated as hitting a double leg one time in five. Same for `SUBMISSIONS[position]` (`commentary.ts:70-76`), picked at random rather than from `guillotine`/`backTake`.
4. `groundStrikesText` (`commentary.ts:176`) says "works elbows from the top" — elbows are not modelled anywhere.

The load-bearing point, in `broadcast.ts`'s own words (`:5-7`): *"in a text sim the commentary is the player's only view of the fight."* Style granularity that exists in the numbers and not in the prose is **invisible to the player by construction**. And style granularity that exists in the prose and not in the numbers is a lie.

Right now the engine cannot tell a judoka from a wrestler, and neither can the commentary — which is coherent. Add the discrimination to the engine only, and you get an engine that models a judoka narrated as hitting double legs: *incoherent, and worse than today.* Every new mechanical distinction obliges a matching commentary distinction, and there is no test anywhere that would catch a mismatch. `broadcast.test.ts` and `tests/statistical/broadcast.test.ts` test the booth's *bias*, not its *accuracy about what happened*.

### 2C. There is 722 lines of uncommitted work that assumes exactly six disciplines

> *(Stale — see the note at the top of this file. The tests it asks for now exist.)*

`git status` shows `packages/engine/src/progression/origin.ts` (566 lines, untracked) plus 156 changed lines in `createFighter.ts`. `origin.ts` is the three-layer origin system doc 18 §5 anticipates — talent → discipline → attainment — and its header comment is explicit (`origin.ts:22-27`):

> **Six combat disciplines, not more.** doc/18 §4.1 enumerates exactly what the fight engine can tell apart… A seventh art would be a label over numbers identical to one of those six.

`COMBAT_DISCIPLINES` (`origin.ts:125`) is boxing / kickboxing / karate / wrestling / jiuJitsu / judo, each with an `attributes` bias map (`origin.ts:180,190,203,213,223,233`) built against the current 15 keys.

Three consequences:
- Expanding the style model invalidates this file's central design justification *before it has shipped*.
- Every one of those six bias maps would need re-authoring against a changed attribute set.
- **`origin.ts` has no test file.** `find . -name "origin*.test.ts"` returns nothing. 566 lines of new balance surface, untested, and the expansion would rewrite it.

Finishing and testing `origin.ts` against the current six is strictly cheaper than expanding the engine and *then* finishing it.

### 2D. The calibration baseline is measuring a roster nobody plays

This is the finding I'd most want the owner to see, and it is independent of the style question.

`tests/statistical/roster-profile.test.ts:35` calls `createNewGame({ adapter: undefined })` with **no era**. `newGame.ts:54` defaults to `'2020'`. But `eras.ts:50` sets `DEFAULT_ERA = '2026'` — that is what the menu offers and what a new player gets.

| | 2020 (what the test profiles) | 2026 (what the player starts in) |
|---|---|---|
| roster | 139 fighters | 858 fighters |
| same-division pairings | 801 | 35,627 |
| finish rate | 64.3% | **49.6%** |
| KO/TKO | 50.8% | **29.7%** |
| submission | 13.5% | **20.0%** |
| decisions | 34.8% | **46.8%** |
| KO : sub | 3.77 : 1 | **1.48 : 1** |
| first-round finish | 33.5% | 32.5% |
| draw rate | 0.75% | **2.99%** |

(measured directly; the 2026 column has never been measured by any test in the repo.)

The suite's own docstring says it exists *"so the shipped roster is the thing under test"* and the `shouldRefereeStop` calibration table in `damage.ts:229-241` records the honest gap as 61.5% finishes / 36.7% decisions / 3.3:1 against a real ~48% / ~52% / ~1.8:1.

**On the roster the player actually plays, the engine is already at 49.6% / 46.8% / 1.48:1 — essentially on target.** The gap the calibration comments agonise over is an artefact of profiling the 139-fighter legacy world.

`newGame.ts:39-47` documents the 2020 default deliberately and correctly ("changing what they build would not make them wrong, it would make them test something else while still passing"). The bug is not the default — it is that `roster-profile.test.ts` was written to profile the shipped roster and does not pass an era.

Why this bears on the style question: **any style expansion will be tuned against the wrong population.** You would spend weeks moving numbers to satisfy a suite measuring a world with 6× less division depth and a fundamentally different attribute distribution, and the world the player sees would move somewhere you never looked.

### 2E. Cost, honestly scaled

From a full trace of the blast radius of one new `ATTRIBUTE_KEYS` entry:

**Compile-enforced (you cannot forget these — 7 exhaustive `Record<AttributeKey,…>` literals):**
`attributes.ts:71` `ATTRIBUTE_META` (incl. convexity) · `attributes.ts:302` `overallRating` weights · `curve.ts:68` `FATIGUE_SENSITIVITY` · `development.ts:448` `DECLINE_RATE` · `generation.ts:95-111` `ceilingsFromNaturals` · `builder.ts:199-226` the `attrs()` tuple helper · `Attributes` itself (`attributes.ts:42`).

**233 hand-authored seed fighters** each need a new number: `fighters-depth-mens.ts` (50), `fighters-2026-heavy.ts` (35), `fighters-2026-small.ts` (30), `fighters-2026-light.ts` (29), `fighters-heavy.ts` (23), `fighters-light.ts` (23), `fighters-depth-womens.ts` (22), `fighters-small.ts` (21). Widening the fixed-arity tuple at `builder.ts:199-204` turns **all 233 call sites into type errors simultaneously**. Each number is a judgement call about a real fighter's clinch game — this is not mechanical work.

**Silent orphans — no compile error, no test failure, wrong behaviour:**

| Surface | File:line | Failure mode |
|---|---|---|
| `TRAINING_META` (Partial) | `development.ts:56-92`, iterated at `:289,:394` | **The attribute is permanently untrainable.** The loops iterate the *focus's* keys, never `ATTRIBUTE_KEYS`. Highest severity. |
| `BACKGROUND_META` (Partial) | `createFighter.ts:51,95-101` | All six creation backgrounds give it 0 — the kickboxer has no clinch bonus. Exactly the incoherence the change was meant to fix. |
| `ARCHETYPES` (Partial over `uniformAttributes(50)`) | `fixtures.ts:27,58` | All eight archetypes silently get **50**. `balance.test.ts` then calibrates a new fight dimension at dead parity, and every win-rate band it asserts shifts for reasons invisible in the diff. |
| `ATTRIBUTES_BY_GROUP` | `attributes.ts:182` | Not type-total. A key missing here is invisible in the editor, fighter screen and creation screen. Only `attributes.test.ts:31-33` catches it. |
| `RUST_SUPPRESSES` / injury `suppresses` | `ringRust.ts:57`, `injuries.ts:42` | Never rusts, never injured. |
| `CREATION_POINTS = 24` | `createFighter.ts:138` | `ALLOCATABLE = ATTRIBUTE_KEYS` (`:127`) auto-widens; the budget does not. Every new key dilutes the player's ability to shape their fighter. |

**Test that fails immediately:** `attributes.test.ts:16-18` — `expect(ATTRIBUTE_KEYS).toHaveLength(15)`, commented *"design pillar 1: simple surface."* That assertion is a design decision being deleted, and it deserves to be argued rather than edited away.

Realistic solo-developer cost: **2–4 weeks** for one attribute done properly (schema, 233 fighters authored honestly, generation coherence, training, backgrounds, tendencies, scouting reads, commentary, migration, recalibration). Against an opportunity cost that includes: fixing `origin.ts`'s missing tests, pointing `roster-profile` at 2026, the `isKick` damage split, and the commentary/simulation divergences in §2B — all four of which are days, not weeks, and all four of which deliver more perceived style per hour.

### 2F. Balance risk: where the exploit appears

The dominant-build risk is not "a new attribute is too strong." It is the opposite, and it is structural:

- `overallRating` (`attributes.ts:302-325`) is the spine of matchmaking (`matchmaking.ts:57,64,165`), bout-agreement step (`boutAgreements.ts:83`), fight heat (`heat.ts:231-232`), champion seeding (`championships.ts:59`) and every roster/ranking sort in the UI. A new attribute must be given a weight there. **Give it a low weight and it is free power the matchmaker cannot see** — the player dumps points into a clinch attribute, gets a real in-cage edge, and is still booked as if they hadn't. Give it a high weight and every existing fighter's overall shifts, moving title churn, offer spread and `paperOdds`.
- The specific exploit shape: `CREATION_POINTS = 24` with `MAX_POINTS_PER_ATTRIBUTE = 8` (`createFighter.ts:138,140`). A new attribute that is (a) allocatable by default, (b) cheap in `overallRating`, and (c) mechanically live is a strictly-optimal dump stat. `tests/statistical/risk.test.ts:81-91` guards exactly this class of bug for `riskLevel` — "does not make either extreme the correct answer" — and **there is no equivalent test for attribute allocation.**
- `exploitFactor` (`simulate.ts:669-673`) compounds it. Every new attribute adds a new hole for the opponent to lean into, gated on Fight IQ, capped at 2.1×. More attributes means more variance in whether the AI finds your hole, which widens outcome distributions across the board — and every bound in `balance.test.ts` is a distribution bound.

---

## 3. Concrete breakage analysis

### Tests that would fail loudly (good — these are working)

| Test | Why |
|---|---|
| `ratings/attributes.test.ts:17` | `toHaveLength(15)` |
| `ratings/attributes.test.ts:31-33` | group partition must equal `ATTRIBUTE_KEYS` |
| `tsc -p packages/engine` / `packages/data` | 7 exhaustive Records + 233 seed call sites |
| `tests/statistical/balance.test.ts` (16 assertions) | every band is a measured distribution; archetypes silently gain a 50 |
| `tests/statistical/roster-profile.test.ts:85-97` | `decisionPct` 35–62, `finishPct` 35–62, `koToSub` < 3.6, `subPct` > 10 |
| `tests/long-sim/twenty-years.test.ts:328-339` | KO 0.15–0.6, sub > 0.03, dec > 0.2, draw < 0.06, and the **exhaustiveness assertion** at `:339` |
| `tests/long-sim/generations.test.ts:162,171-172` | `overallRating` bounds (>68, >74, top-20 avg >65) — these move the instant `overallRating`'s weight table changes, even if no fight behaves differently |

### Tests that would *silently stop being meaningful* — the dangerous list

1. **`tests/statistical/roster-profile.test.ts:61` is already dead.** It counts `result.method === 'decisionDraw'`. `FinishMethod` (`fighter.ts:26-37`) has no such member — it is `'draw'`. `drawPct` is **always exactly 0**, so `it('keeps the draw a rare outcome')` at `:101-113` asserts `0 < 3` and has never tested anything. The true 2026 draw rate is **2.99%** against that 3% bound. Fix the typo and point it at 2026 and it passes by 0.01 percentage points. Any scoring perturbation from a style change tips it, and right now nothing would tell you.

2. **`roster-profile.test.ts` bounds are inside seed noise.** At n=801, `koToSub` measures 3.77 on my seed against a bound of `< 3.6` on theirs. Same population, different seed prefix, opposite sides of the line. `firstRoundPct` measures 33.5% against `< 34`. These are not distribution bounds; they are coin flips dressed as bounds. `balance.test.ts:92-95` already learned this lesson explicitly ("a single `ratio > 3` at 800 fights, which is a knife edge") and fixed it there — the lesson did not propagate here.

3. **`testing/fixtures.ts:58` `{ ...uniformAttributes(50), ...o.attributes }`.** Eight archetypes silently acquire a new attribute at 50. `balance.test.ts` is then measuring a new fight dimension where every archetype is identical — so every one of its 16 assertions continues to pass, continues to be about the *old* dimensions, and quietly stops covering the new one. The suite reports green on a change it cannot see.

4. **`tests/statistical/broadcast.test.ts` tests bias, not fidelity.** `impressionAccuracy` (`broadcast.ts:112-130`) compares the booth to the *judges*. Nothing anywhere compares the commentary text to what the simulator actually resolved. Every divergence in §2B is invisible to the entire 887-assertion suite.

5. **`development.ts` `TRAINING_META` orphaning is untested by construction.** No test asserts that every `ATTRIBUTE_KEYS` entry appears in at least one training focus. An untrainable attribute passes the full suite.

6. **`tests/long-sim/twenty-years.test.ts` runs the 2020 roster too** (`runLongSim` → `createNewGame({ adapter, seed })`, no era). Every long-horizon bound — career lengths, ratings drift, finish distribution, trauma, title churn — is measured on 139 fighters. `generations.test.ts` is the only long test on 2026, and it does not check finish distribution.

### Systems that change without any test noticing

- **Fighter generation** (`generation.ts:88-112`): `ceilingsFromNaturals` is a hand-written 15-line literal that is the *only* thing making generated fighters coherent. There is no archetype system at generation — differentiation is `±6` noise (`:90`) plus `±3` jitter (`:167`). A new attribute must be given a naturals derivation there or every generated fighter's value for it is `NaN` (`toRating(Math.min(undefined,…))`). Nothing tests that generated fighters are *stylistically* coherent; only that they are in range.
- **Scouting** (`camp/scouting.ts:57-72`): derived from `READ_KEYS`, not `ATTRIBUTE_KEYS`. A new attribute produces **no scouting signal at all** unless a matching `READ_KEYS` entry + `READ_META` prose (`gameplan.ts:73-89,103+`) + `deriveTendencies` line (`profile.ts:52-68`) all land together. Miss any one and the coach system silently stops knowing about a whole dimension of the sport.
- **Coaches** (`organisations.ts:112-119`): `COACH_SPECIALISMS` is a 1:1 mirror of `TRAINING_FOCUSES`. A dedicated "clinch" focus forces a new specialism, which every seeded coach lacks — so at launch no coach in the world can teach it.
- **UI**: genuinely fine. Every attribute surface is `ATTRIBUTES_BY_GROUP`- or `DERIVED_META`-driven (`FighterScreen.tsx:231-260`, `EditorScreen.tsx:240-256`, `CreateFighterScreen.tsx:407-478`). Cards get longer; nothing breaks. This is the one place the architecture fully pays off.

### 4. The seam: existing saves

There is a schema version and it is not wired to attributes.

`migrations.ts:16` `CURRENT_SCHEMA_VERSION = 1`; `migrations.ts:33` `MIGRATIONS = []` — the plumbing exists, zero steps shipped. The load path (`repository.ts:26-43`) `JSON.parse`s, checks only that `rows` is an array (`:38`), runs `migrateCollection` (`:41`), and casts. **There is no per-row field validation anywhere** — no zod, no `Number.isFinite`, no `normaliseAttributes` on load.

Two doors, both bad:

- **Add the key, leave the version at 1:** saves load. Every legacy fighter has `attributes.newKey === undefined`. `overallRating` (`attributes.ts:322`) returns **`NaN`** for all of them. `deriveRatings` → NaN (`derived.ts:112`). `fatiguedEffect` → NaN into the fight sim. And it **fails soft, misleadingly**: `clamp` (`core/math.ts:4-6`) passes NaN straight through both comparisons, so `toRating` cannot repair it; `ratingBand(NaN)` (`attributes.ts:233-238`) falls through every `>=` to `'absent'`, so a corrupted legacy fighter renders as a fully **Absent** fighter rather than as an error. `RosterScreen.tsx:54` and `StartScreen.tsx:44` sort on `overallRating(b) - overallRating(a)` → NaN comparator → non-transitive sort → arbitrary roster order.
- **Bump to 2 without a migration:** `migrations.ts:88-92` throws `No migration from schema 1 to 2` for all 15 collections. **Every existing save becomes unloadable.**

The seam for the fix already exists and has precedent: `newGame.ts:106-113` `loadOrCreateGame` already runs `backfillCommentators` (`:158-162`) and `repairContractMismatch` (`:134+`). There is just no attribute backfill.

---

## 5. If it proceeds anyway — the non-negotiables

Ordered. Each is a gate; do not pass one until it holds.

**Gate 0 — fix the measuring instrument first. Nothing else is meaningful until this is done.**
1. Fix `roster-profile.test.ts:61` (`'decisionDraw'` → `'draw'`) and re-set the draw bound against a real measurement.
2. Add an `era: '2026'` profile to `roster-profile.test.ts` alongside the 2020 one, with its own bounds. 35,627 pairings runs in ~17s — this is affordable.
3. Raise the sample size or widen the knife-edge bounds (`koToSub < 3.6`, `firstRoundPct < 34`) so they are not seed-dependent. `balance.test.ts:92-95` documents exactly how to do this.
4. Record the current 2026 numbers as the baseline you must not move: **49.6% finish / 29.7% KO / 20.0% sub / 46.8% dec / 1.48:1 / 32.5% R1 / 2.99% draw.**

**Gate 1 — exhaust the zero-schema wins first, and measure each one.**
5. Thread `isKick` into `rollFlushness` and `strikeDamage` (`damage.ts:68,91`). This is the actual cause of Muay-Thai-equals-kickboxing (§1.5) and costs no schema, no migration, no seed edit.
6. Give `stance` (`fighter.ts:134`) a consumer — a modest term in the striking contest for the orthodox/southpaw mismatch. The field already exists on every fighter, generated and persisted.
7. Implement the dead `takedownRate` hook (`traits.ts:24`) with one or two style traits. Zero simulator change, by `traits.ts:3-7`'s own contract.

If 5–7 do not deliver the perceived style difference, that is the evidence that a new attribute is needed. If they do, you have saved the schema change entirely.

**Gate 2 — commentary parity is a hard precondition, not a follow-up.**
8. Fix `simulate.ts:790` to pass `isKick` to `strikeMissed`.
9. Make `takedownText` (`commentary.ts:117`) and `SUBMISSIONS` selection (`simulate.ts:1200`) read `actor.tendencies` instead of `rng.pick`. The tendency profile is already computed and already correct.
10. Split leg-strike vocabulary by `isKick` so a boxer's leg punches are not narrated as calf kicks (`commentary.ts:46,52`).
11. **Add the missing test class:** an assertion that no commentary line names a technique the resolving branch did not use. Without it, every subsequent style addition can silently lie to the player, and nothing in 887 tests will notice. This is the single most important new test in the whole plan.

**Gate 3 — if a new attribute still goes in.**
12. One attribute at a time, each landing on a branch you have first *measured* as frequent. The clinch is 0.67 events per fight; do not start there.
13. Close every silent orphan in the same commit: `TRAINING_META` (`development.ts:56-92`), `BACKGROUND_META` (`createFighter.ts:95-101`), `ATTRIBUTES_BY_GROUP`, `deriveTendencies` + `READ_KEYS` + `READ_META`, `ceilingsFromNaturals`, `RUST_SUPPRESSES`, injury `suppresses`.
14. Add a guard test asserting every `ATTRIBUTE_KEYS` entry appears in at least one `TRAINING_META` focus and one `ATTRIBUTES_BY_GROUP` group. Cheap, and it makes the whole orphan class impossible.
15. **Set the eight `ARCHETYPES` (`fixtures.ts:112-282`) by hand.** Never let them default to 50. If the new attribute does not differentiate the striker from the smotherer in the fixtures, `balance.test.ts` is calibrating a dimension it cannot see.
16. Decide `overallRating`'s weight explicitly and defend it (`attributes.ts:302`). Then re-baseline every downstream bound: `generations.test.ts:162,171-172`, matchmaking step (`matchmaking.ts:57`), heat (`heat.ts:231`), champion seeding (`championships.ts:59`).
17. **Add the missing balance guard:** a test in the shape of `risk.test.ts:81-91` asserting that no single attribute is a dominant point sink at creation. Without it, `CREATION_POINTS = 24` across a widening `ALLOCATABLE` is an unguarded exploit surface.

**Gate 4 — the save seam.**
18. Write the first `MIGRATIONS` entry (`migrations.ts:33`) *before* touching `ATTRIBUTE_KEYS`, and backfill from existing attributes so a legacy Muay Thai fighter gets a defensible clinch number rather than a default. Hook it at `newGame.ts:106-113` alongside the existing repair passes.
19. Add a `Number.isFinite` guard to `toRating` (`attributes.ts:196`) or a `normaliseAttributes` pass on load. Today NaN travels the whole system and surfaces as a fighter rendered "Absent" — the worst possible failure mode, because it looks like data rather than corruption.
20. Add a load-an-old-save test. `saves.test.ts` and `db.test.ts` exist; no test currently loads a save written against a previous attribute set.

**Gate 5 — finish what is already open.**
21. `origin.ts` is 566 uncommitted, untested lines whose central design comment cites the six-discipline cap. Either finish and test it against six, or accept that the expansion rewrites it. Do not run both in flight.

---

**The one-line version:** doc 18 correctly identifies that the engine cannot tell Muay Thai from kickboxing, and then misdiagnoses why. It is not the clinch — measured at 0.67 events per fight, that is the rarest branch in the engine. It is that `strikeDamage` and `knockdownHazard` never see `isKick`, so a head kick is a jab with a different noun. That is a three-file change with no schema, no migration and no seed edits, and it buys more felt style than a new attribute would. Do that, fix the commentary so it stops narrating techniques the simulator didn't use, point the calibration suite at the roster people actually play — and then re-ask whether six is really the limit.
