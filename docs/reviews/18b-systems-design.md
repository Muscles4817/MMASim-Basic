# Review — attribute and systems design

> Angle: what is the right *shape* for this model if it needs to express roughly a dozen martial
> arts instead of six? Reviewer was given doc 18 plus the engine source and told to verify the doc.
> Unedited except for HTML-entity cleanup. See [README](README.md) for which claims I checked.

---

I verified the doc against the source. It is substantially accurate on mechanism but wrong on several load-bearing facts, and one of the errors changes the cost calculus completely.

---

# 1. Corrections to the doc

**Verified correct:** the 15 attributes and their grouping (`attributes.ts:17-37`, `182-193`); the derived table (`derived.ts:37-108`); 26 traits (`traits.ts:72-99`); the `strikeLean` formula exactly as written including the ±30 → 0.15–0.85 remap (`profile.ts:42-50`) and its four consumers; the six approaches and every multiplier in the table (`gameplan.ts:18-25`, `simulate.ts:676-686`); ground dominance 0.30/0.50/0.70/0.88/1.00 (`fight/types.ts:24-30`); the clinch intent weights (`simulate.ts:989-991`); the core claim that clinch striking resolves `clinchOffence` vs `clinchDefence` and never consults `kicking` (`simulate.ts:1001-1002`).

### E1 — "No stance concept anywhere in the engine" (§4.2) is false, and this is the most consequential error

`stance: 'orthodox' | 'southpaw' | 'switch'` is a **required** field on `Fighter` (`domain/fighter.ts:134`). It is rolled at generation with a 7 / 2.5 / 0.5 weighting (`generation.ts:194-196`), settable at creation (`createFighter.ts:150, 351`), part of the seed spec (`data/seed/builder.ts:51, 158`), hand-authored per fighter (`fighters-heavy.ts:253, 379, 485, 506`; `fighters-light.ts:110, 152, 238`; `fighters-small.ts:424`), and **rendered on the fighter card** (`app/src/screens/FighterScreen.tsx:80`).

The true statement is narrower and far more useful: *the concept is fully plumbed end-to-end and nothing in `packages/engine/src/fight/` reads it.* Same for `reachInches` and `heightInches` — stored (`fighter.ts:132-133`), authored for every seed fighter, displayed, and read by exactly zero simulator lines (the only non-generation reference in the whole repo is an assertion at `progression.test.ts:530`).

This matters because the doc's structural cause #3 ("no stance, no range") is really *"three declared identity fields with no fight-side consumer"* — which is the cheapest change class that exists, not the most expensive.

### E2 — "There is no style, discipline, or background field" (§1) is half-right, and the half that is wrong undercuts §5

There is no *stored* one. But `BACKGROUNDS` (`createFighter.ts:36-44`) already declares precisely the six-discipline enum the doc says would be a step backwards: `wrestler`, `boxer`, `kickboxer` (labelled "Muay Thai / Kickboxer"), `grappler`, `streetFighter`, `athlete`. It is a *generator* — it converts to attribute and naturals offsets (`BACKGROUND_META`, lines 58-108) and is then discarded.

So §5's "the proposed origin system (talent tier → discipline → attainment) can only be as expressive as this layer" describes a system that is already built, shipped and player-facing (`CreateFighterScreen.tsx`). This is the correct precedent for how a dozen arts should be added, and the doc misses it.

### E3 — "Exactly two traits touch technique" (§2.3): it is three, and one is described backwards

- `headhunter`: correct (`profile.ts:56-57`).
- `volumeMachine`: the doc says "raises output". It does (`strikeOutput: 1.3`) but *also* cuts accuracy (`strikeAccuracy: 0.88`, `traits.ts:293`), and is additionally read **by name** in the burst-size roll (`simulate.ts:749`) — making it the only trait with a hardcoded simulator branch rather than a data hook.
- **Missed: `gunShy`** (`strikeOutput: 0.75`, `traits.ts:197`), which flows into `highVolume` through the same `traitMul(t, 'strikeOutput')` at `profile.ts:58`.
- Also unremarked: `headhunter` *lowers* strikeOutput (0.85), so it suppresses volume as well as body work.

### E4 — There is a fourth technique hook already wired and dangling, and the doc misses it

`takedownRate` is a declared `MUL_HOOK` (`traits.ts:24`) and is applied to **every takedown attempt in the game** (`simulate.ts:935`). **No trait among the 26 declares it.** A `judoka` / `chainWrestler` / `sprawlAndBrawl` trait is pure table data with zero engine change. §4.3's "traits carry no technique — the obvious extension point is unused" is true but badly understated: the socket is already soldered in.

### E5 — The clinch conclusion is right; the mechanism as stated is incomplete, and the real gap is wider

Two omissions:

1. The *choice* to clinch-strike is weighted by raw `strikingOffence` (`simulate.ts:990`), so a striker does throw in the clinch more often — they are just no better at it. The doc reads as though striking is absent from the phase entirely.
2. Both sides of the clinch are passed through `fatiguedEffect(..., 'strength', ...)` (`simulate.ts:1001-1002`, also `641-643`, `979-980`). That applies Strength's convexity (1.1) *and* Strength's fatigue sensitivity (0.30, `curve.ts:74`) to a composite that is only 45% strength. The clinch is strength-shaped in curve behaviour as well as in composition.

And the gap is worse than the doc claims, because `ATTRIBUTE_META.kicking.blurb` (`attributes.ts:121`) reads *"Kick **and knee** arsenal, and the commitment to use it."* The attribute explicitly advertises the weapon that the only phase where knees occur never asks it for.

### E6 — §4.1's Karate/TKD row is wrong on its own terms, and reveals a structural point the doc misses

It claims the archetype "comes out as headKick, counterRight, low volume".

- `counterRight` is `p(strikingOffence) × f(fightIq)` (`profile.ts:54`). It reads **no** `kicking`. A high-kicking, low-hands karateka gets no counterRight at all.
- "Low volume" is not a consequence of the `counter` approach. `highVolume` is `p(cardio) × strikeOutput × strikeLean` (`profile.ts:58`); **approach never touches tendencies**.

The general fact underneath: `approach` shifts *intent weights* (`simulate.ts:676-686`) and `riskLevel` shifts *burst size* (`simulate.ts:748-752`), and neither writes back into the `TendencyProfile` that `scoutOpponent` reads (`camp/scouting.ts:57`). So **tactics are invisible to scouting**: you scout what a fighter *is*, never what they are going to do tonight. That is a defensible design choice, but it is unstated, and it is directly relevant to any plan that tries to express style through approaches.

### E7 — Minor

- `attributes.ts:2` says "the 8 hidden naturals"; `NATURAL_KEYS` has 7 (`242-250`), plus `ageCurve`.
- §2.2 elides `cageIq` / `finishingInstinct` / `chainWrestling` as "—". They are defined at `derived.ts:78-107`, and `chainWrestling` (wrestling 0.50 / cardio 0.30 / strength 0.20) is load-bearing for the doc's own argument: it is *why* judo, sambo and freestyle all resolve identically.

### E8 — §4.1 claims BJJ is distinguishable today, and nothing tests that

`ARCHETYPES` (`testing/fixtures.ts:110-283`) contains bomber, grinder, smotherer, striker, journeyman, journeyman2, contender, canFodder. There is **no guard-player / submission-specialist fixture**. `smotherer` is top control (`groundControl: 98`). The one archetype the doc lists as distinguishable is untested — and per §3 below, it is also actively mis-classified by `strikeLean`.

---

# 2. What actually breaks — traced, per change class

This is the cost model the ranking rests on.

### Adding one key to `ATTRIBUTE_KEYS`

**Hard compile errors** (full `Record<AttributeKey, …>`, cannot be skipped):
- `ATTRIBUTE_META` + `ATTRIBUTES_BY_GROUP` (`attributes.ts:71, 182`) — needs a convexity decision.
- `overallRating` weights (`attributes.ts:302-318`).
- `FATIGUE_SENSITIVITY` (`curve.ts:68`).
- `DECLINE_RATE` (`development.ts:448`) — needs an ageing decision.
- `ceilingsFromNaturals` returns a full literal (`generation.ts:95-111`) — needs a substrate + skill-weight decision, or the attribute has no potential model.
- `attrs()` is **positional with fixed tuple arity** (`data/seed/builder.ts:198-203`). A striking attribute changes `[number,number,number]` → 4-tuple, breaking **~230 hand-authored call sites** across eight files, each needing an authored value and ideally a `notes` justification.

**Silent failures** (`Partial` records — compile fine, behave wrong):
- `BACKGROUND_META.attributes` (`createFighter.ts:51`) — no background grants it, so it feels dead at creation.
- `ARCHETYPES` overrides (`fixtures.ts:27`) — every archetype silently sits at 50 on the new axis, quietly shifting balance measurements.
- `TRAINING_META` (`development.ts:45`) — untrainable unless added to a focus.
- `INJURY_META.suppresses` (`injuries.ts:42`) and `RUST_SUPPRESSES` (`ringRust.ts:57`) — a broken hand suppresses `strikingOffence` 0.22 but would not touch a new clinch-striking attribute.

**Free:** UI. `FighterScreen.tsx:233`, `EditorScreen.tsx:244`, `CreateFighterScreen.tsx:407, 472` all iterate `ATTRIBUTES_BY_GROUP`. But `CREATION_POINTS = 24` (`createFighter.ts:135`) across a 16th attribute is a silent dilution of every creation choice.

**Tests:** `attributes.test.ts:17` hard-asserts `toHaveLength(15)`. `seed.test.ts:115, 163, 172, 191` and `progression.test.ts:484` compute roster-wide min/mean across `ATTRIBUTE_KEYS`, so conservatively-authored new values move the distribution assertions. The real exposure is `roster-profile.test.ts`, which runs an all-play-all of the shipped roster and bounds `decisionPct` 35-62, `finishPct` 35-62, `koToSub < 3.6`, `subPct > 10`, `drawPct < 3`, `firstRoundPct < 34` — the last of which its own comment says sits at ~32 against a bound of 34. `balance.test.ts` bounds (`koRate > 0.7`, ratio `> 2.75`, prep ratio `> 1.35`) are documented at lines 92-99 as having *already* been knife-edges once.

**Critically:** `scoutOpponent` iterates `READ_KEYS`, not attributes (`scouting.ts:57`). **An attribute is invisible to the entire prep, scouting and camp system unless it also gets a tendency.** An attribute alone buys you a bar on a card.

### Adding a read key / tendency
`READ_KEYS` + `READ_META` (phase must be one of five existing), one line in `deriveTendencies`, one `prepBonus(...)` call site. Scouting covers it automatically (`scouting.ts:57`); `CampScreen.tsx:320-360` renders it automatically; `PHASE_DEFENCE` needs the phase mapped for `ExposureLine`. `aiPlanFor`'s read list is hardcoded (`app/src/game/career.ts:665-674`) and wants extending. **No data migration, no seed churn, no statistical movement unless given a resolution site.**

### Adding a trait
`TRAIT_IDS` + one `TRAITS` entry. On an existing hook: **zero engine change**. Generation picks it up automatically (`generation.ts:126`). Constrained by `CONFLICTING_TRAITS` and by the doubleEdged-majority rule (`traits.ts:106-108`). One real limitation: traits are drawn **uniformly at random** (`generation.ts:123-135`, 1-3 per fighter at line 205), so a stylistic trait lands on incoherent fighters.

### Adding a derived composite
One `DERIVED_KEYS` + `DERIVED_META` entry and a call site. Auto-rendered at `FighterScreen.tsx:252`. Zero data cost, zero generation cost, zero ageing cost. Can only recombine what exists.

---

# 3. Ranked design options

### 1. Re-compose the clinch into two contests — control and damage (derived only)
**Unlocks:** Muay Thai / Dutch kickboxing / Greco / collegiate wrestling stop collapsing into one shape, in the one phase where a whole discipline currently has zero expression. Add `clinchStriking` as a `DERIVED_KEY` weighted toward `kicking` and `strikingOffence`, use it at `simulate.ts:1001-1002` for the damage roll, keep `clinchOffence` / `clinchDefence` for entry (`641-643`), hold and escape (`979-980`). Switch the `fatiguedEffect` key at 1001 from `'strength'` to `'kicking'` so knees fade the way kicks do.
**Costs:** two `DERIVED_META` entries, ~6 lines in `simulate.ts`. No seed churn, no generation, no ageing, no UI work.
**Breaks:** clinch damage rate moves for everyone → `roster-profile` finish/decision split shifts; `firstRoundPct` is the bound closest to its limit.
**Risk: low.** One file, fully revertable.

### 2. Make `stance` mechanical
**Unlocks:** the single most-discussed stylistic axis in the sport, at zero data cost, because generation, persistence, seed authoring, the editor and the fighter card already carry it (E1). Compute an open-stance flag once in `createCombatant`, feed a modest modifier into the `throwBurst` contest (`simulate.ts:770-789`), shift `calfKick`/`headKick` tendencies, and gate a familiarity term on `fightIq` the way `exploitFactor` already does (`simulate.ts:669-673`). Add `southpaw` as a `READ_KEY` so camps can drill it, which is what camps actually do.
**Costs:** one field read, one read key, one modifier. `switch` needs a rule — "never in open stance, no edge either way" is both cheap and true.
**Breaks:** structurally nothing.
**Risk: low-medium.** The risk is magnitude: seed stances are hand-authored and *not* randomly distributed, so a 20% edge would visibly distort specific divisions where a 5% edge would not.

### 3. Stylistic traits on existing hooks, including the dangling `takedownRate`
**Unlocks:** the fastest route from six arts to twelve, because an art becomes *(attribute shape × 1-2 traits)* rather than *(attribute shape)* alone. `chainWrestler` on the dangling `takedownRate` (E4) costs one table entry. One or two genuinely new hooks — `clinchRate`, `kickRate` — are one-line multipliers on intent weights already in place (`simulate.ts:609-625`, `989-991`).
**Costs:** near-zero code. The real cost is **generation coherence**: `generateTraits` (`generation.ts:123`) must take the attribute block and weight the pool, or you ship `chainWrestler` strikers. ~15 lines, contained.
**Breaks:** the doubleEdged-majority test caps how many pure-positive stylistic traits you can add.
**Risk: low.**

### 4. Split the readable surface finer — more tendencies, no new attributes
**Unlocks:** *legibility*, which is most of what "expressing twelve arts" means in play. `elbow`, `kneeInClinch`, `southpaw`, `frontKick`, `judoTrip`, `legLock`. A scouting report reading "hunts the elbow in the clinch, knees to the body" is most of the felt difference between Muay Thai and kickboxing before any resolution maths differs — and it arrives free via `scouting.ts:57`.
**Costs:** per key, a `READ_META` entry, a `deriveTendencies` line, a `prepBonus` site. `aiPlanFor` (`career.ts:665`) wants extending.
**Breaks:** the read *budget*. 4 of 15 is a 27% coverage rate; 4 of 25 is 16%, and `drillQuality`'s spread penalty (`scouting.ts:131`) already punishes breadth. Prep strength is tuned against the current ratio and guarded by `balance.test.ts:235` (`prep ratio > 1.35`).
**Risk: low**, provided `MAX_PREPPED_READS` is not raised blind.

### 5. Add one attribute: `clinchStriking`
**Unlocks:** genuine independence between "can pin you to the fence" and "will hurt you while doing it".
**Costs:** the entire long tail in §2 — ~230 seed re-authorings, a ceiling model, a decline rate, a fatigue sensitivity, an overall weight, a training focus, an injury suppression, a creation-points rebalance, and a full statistical re-baseline.
**Risk: high**, and mostly *content* risk. Worst unlock-per-cost ratio on this list, because option 1 buys ~85% of the behaviour for ~2% of the cost.

### 6. Add a range / footwork attribute (karate vs TKD, out-fighter vs pressure)
**Unlocks:** genuinely something nothing else can. `strikingDefence`'s blurb already claims "head movement, **range management**, guard" (`attributes.ts:128`) — one number doing three jobs.
**Costs:** the full attribute tail **plus** a fight-model change: `Position` is `distance | clinch | ground` (`fight/types.ts`) with no sub-state at distance, so there is nowhere for the attribute to act.
**Risk: high.** Right eventually, wrong now.

### 7. Declarative `style: 'muayThai'` read at resolution
Ranked last. See below.

---

# 4. Recommendation

**Do 1 + 2 + 3 + 4. Do not do 5, 6 or 7.**

### On the enum: I agree with the doc's conclusion and reject its argument

The doc's reason (§5) is that an enum "would let a fighter's label contradict their numbers, and every scouting report would need separate authoring and would drift." That is a *data hygiene* argument and it does not survive contact — you could validate the enum against the ratios at generation and refuse incoherent combinations, exactly as `findTraitConflicts` (`traits.ts:411`) already does for traits.

The real reason is stronger and points somewhere different: **a resolution-time enum destroys the property that style is continuous, trainable, ageable and suppressible.** Every mechanism that makes a career interesting in this codebase operates on ratings — `applyTraining` moves them (`development.ts:271`), `applyAgeing` decays them *non-uniformly* (`development.ts:448-464`: `speed` 1.4, `strikingOffence` 0.45, `submissions` 0.15), `applyIdleDecay` erodes them, `INJURY_META.suppresses` suppresses them, `rustedAttributes` dulls them, `headroom` gates them against ceilings. An enum participates in none of it. A fighter could not slowly *become* a Muay Thai fighter, could not lose their kicks at 37 and drift into being a boxer, could not have their style suppressed by a knee. It would be the only field on a fighter that a career cannot change — in a career game.

And the precedent that proves the point is already in the repo: `Background` **is** a declarative discipline enum, and it is fine, because it is consumed once at t=0 and thrown away (E2). So the rule is not "no enums". It is:

> **Discipline may be an input to generation. It may never be an input to resolution.**

Which means expanding `BACKGROUNDS` from 6 to 12 is not merely permitted — it is the right move, costs one table, and is precisely the layer §5 is worried about.

### On the 3-vs-5 asymmetry: symptom, and the diagnosis is backwards

Count resolution sites rather than group membership. The five grappling attributes are not five aspects of one skill — they are five *phases* with five distinct resolution sites: `wrestling` → takedown entry (`simulate.ts:933` via `chainWrestling`), `takedownDefence` → the other side of that contest (`939`), `groundControl` → passing and holding (`1096`, `1123`, `1064`), `submissions` → an entirely separate finish path (`1206`), `scrambling` → escapes and sweeps (`1042-1045`, `1060`).

Grappling has five attributes **because the engine models five grappling positions.** Striking has three because the engine models *one* striking position — `distance` — with a single boolean (`isKick`) hanging off it.

So the asymmetry is downstream of the **position model**, not the attribute list. Adding a fourth and fifth striking attribute against an unchanged one-node standing model produces two more numbers feeding the same `offence / (offence + defence)` roll at `simulate.ts:789`: more inputs, identical structure, no new distinguishable arts. That is exactly what already happened to `kicking` — it is a genuinely independent attribute and it buys you only "throws kicks instead of punches", because there is nowhere for kicks to *be different*.

The generative test: **what distinguishes two arts is not which attributes they use, it is which states they try to reach.** BJJ ≠ wrestling here precisely because `back` and `mount` are distinct states with distinct payoffs (`types.ts:24-30`). Muay Thai = wrestling in the clinch precisely because clinch is one state with one contest. Hence option 1 — splitting the clinch into control and damage — buys more expressiveness than option 5, which adds an attribute to an undifferentiated contest.

### On `strikeLean`: wrong axis, but a vector is not the fix either — and it has a live bug

`strikeLean` reads **4 of 15 attributes** (`profile.ts:44-49`). `submissions` and `scrambling` — the two attributes that define a guard player — are absent from the grappling side. Take the most grappling-committed fighter the game can express: `submissions: 92, scrambling: 85, wrestling: 40, groundControl: 45`. Striking side `(50 + 40) / 2 = 45`; grappling side `(40 + 45) / 2 = 42.5`; difference `+2.5` → `remap(2.5, -30, 30, 0.15, 0.85) = 0.529`. **Above neutral.** The engine classifies a pure BJJ player as striker-leaning, boosts their `leadHook` (×0.765) and suppresses their `singleLeg` (×0.68). The only identity computation in the engine mis-classifies the archetype §4.1 claims is distinguishable — and per E8 there is no fixture that would catch it.

Its four consumers are also unevenly weighted in an undocumented way: it multiplies `highVolume` *directly* (floor 0.15) but scales `leadHook` by `0.5 + lean × 0.5` (floor 0.575) and `singleLeg` by `1 − lean × 0.6` (floor 0.49). The dominant stylistic effect of the identity axis is on **output rate**, which is not what it is for.

What identity needs is not one scalar and not fifteen. It needs **three, matching the three positions the engine already has**: a normalised distance/clinch/ground preference vector, computed once in `createCombatant`, applied **as a multiplier on the intent weights** at `simulate.ts:609-625`, `989-991`, `1095-1105` — *not* on tendencies. That is the correct injection point because `approach` already multiplies exactly those weights, so positional identity and per-bout tactics compose naturally, and it is a shape the engine already understands. It requires no stored field, no data cost, and it subsumes `strikeLean`, which then survives only as a display concept.

But fix the `submissions` / `scrambling` omission **first**, as a one-line change, independently of everything else — it is a live mis-classification affecting every guard-shaped fighter in the game.

### What I would explicitly not do

- Not a resolution-time `style` field.
- Not a range/footwork attribute before `distance` has sub-states to spend it on.
- Not `clinchStriking` as a *stored* attribute until option 1 has been measured and shown insufficient.
- Not raise `MAX_PREPPED_READS` to compensate for more read keys without re-measuring `balance.test.ts:235`.
- Not touch `attrs()`'s tuple arity in the same release as any balance change.

---

# 5. Migration and rollout shape

**Phase 0 — instrument before changing anything.** There is currently **no test that asserts stylistic differentiation** — only outcome distributions. Add `tests/statistical/styles.test.ts` measuring behavioural *fingerprints*, not win rates: share of exchanges at distance / clinch / ground, strike-vs-kick split, takedown attempt rate, submission attempt rate. Every input already exists in `FightStats` (`distanceSeconds`, `controlSeconds`, `takedownsAttempted`, `submissionAttempts`) plus the round tally. Assert that arts which *should* differ produce different fingerprints. Also add the missing guard-player archetype (E8). Without this, every later phase is unfalsifiable — you cannot distinguish "added expressiveness" from "added numbers". Costs nothing; highest-value step on this list.

**Phase 1 — free wins, no data churn, independently revertable.**
- 1a. Fix `strikeLean` to include `submissions`/`scrambling` (`profile.ts:44-49`). One line. Expect a small sub-rate shift in `roster-profile`.
- 1b. Add stylistic traits on existing hooks, including one using `takedownRate`. Table only.
- 1c. Make `generateTraits` attribute-aware (`generation.ts:123`) so they land coherently.

Each moves exactly one statistical bound, which is what makes them individually diagnosable.

**Phase 2 — clinch re-composition.** Land `clinchStriking` as a derived key, switch `simulate.ts:1001-1002`, add `elbow` / `kneeInClinch` read keys. Re-baseline `roster-profile` afterward. Expect KO share to rise slightly; `firstRoundPct < 34` is the bound most at risk.

**Phase 3 — stance, in two commits.** Ship the `southpaw` read key **first, resolving to a zero bonus** — inert but fully plumbed through scouting, `CampScreen` and `ExposureLine`, with no balance risk. Turn on the resolution modifier in a second commit. This ordering is what keeps the game playable and the failure attributable.

**Phase 4 — expand `BACKGROUNDS` from 6 to ~12** (`createFighter.ts:36`). Pure table: attribute offsets, naturals offsets, 1-2 granted stylistic traits, a weakness sentence. This is the player-facing payoff and it must land **last**. A `muayThai` background is only meaningfully different from `kickboxer` once phase 2 exists; shipping it first produces twelve labels over six behaviours, which is exactly the failure the doc fears.

**Phase 5 — only now ask whether an attribute is needed.** Re-run the phase-0 fingerprint test across the twelve backgrounds. If two arts still fingerprint identically, you have a *measured* case for a specific attribute and you know which one. Paying the ~230-fighter cost at that point is a known price for a proven need rather than a guess.

One useful safety property to lean on throughout: `ARCHETYPES` is built on `uniformAttributes(50)` (`fixtures.ts:58`), so anything new defaults to neutral there. `balance.test.ts` bounds will hold still while `roster-profile.test.ts` — which runs the *shipped* roster — moves. That asymmetry is the signal: if a change moves the archetype suite, it is a mechanism change; if it moves only the roster suite, it is a content-distribution change.
