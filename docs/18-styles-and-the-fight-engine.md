# 18 — Styles and the fight engine

**Status:** description of the engine as it stands, revised after four independent reviews
([`reviews/`](reviews/)). Nothing here is a proposal.

The question this document exists to answer: **how much of a martial art can the simulator
currently tell apart, and where exactly does the distinction get lost?**

> **Revision note.** The first draft of this document answered that question wrongly. It blamed
> the clinch and recommended a clinch-striking attribute as "the cheapest real win". Measurement
> says the clinch resolves **0.68 landed strikes per fight** (measured directly, §5) — the rarest
> branch in the engine —
> and the real cause is somewhere else entirely (§4). Three other claims were also wrong and are
> corrected in place, flagged like this. The reviews are committed verbatim alongside this file
> because the corrections matter more than the original.

---

## 1. The short answer

There is **no style or discipline field the fight engine reads.** A fighter is 15 attribute
ratings, a trait list, and a game plan. Style is an *emergent property of the ratios between
them* — a boxer is not flagged as a boxer, they are somebody whose `strikingOffence` is far above
their `kicking` and `wrestling`, and the intent weighting then produces boxing-shaped behaviour
without ever naming it.

That is the right design and it should be kept. The rule it implies, sharpened by review:

> **Discipline may be an input to generation. It may never be an input to resolution.**

The reason is not data hygiene — you could validate a label against the ratios at generation, and
`findTraitConflicts` already does exactly that for traits. The reason is that **a resolution-time
enum cannot be trained, aged, injured, rusted or decayed.** Every mechanism that makes a career
interesting here operates on ratings: `applyTraining` moves them, `applyAgeing` decays them
non-uniformly, `INJURY_META.suppresses` suppresses them, `rustedAttributes` dulls them, `headroom`
gates them. A fighter could not slowly *become* a Muay Thai fighter, could not lose their kicks at
37 and drift into being a boxer. It would be the only field on a fighter that a career cannot
change, in a career game.

> **Correction.** The original claimed there was "no style, discipline, or background field" at
> all. There was no *stored* one, but `Background` was already a six-discipline enum consumed once
> at generation and discarded — which is precisely the permitted pattern, and the precedent the
> origin system (`progression/origin.ts`) now follows.

---

## 2. What a fighter is, to the engine

### 2.1 The 15 attributes

```
Physical    power  speed  cardio  durability  strength
Striking    strikingOffence  kicking  strikingDefence
Grappling   wrestling  takedownDefence  groundControl  submissions  scrambling
Mental      fightIq  composure
```

Striking has three; grappling has five. **This asymmetry is a symptom, not the cause** — see §4.2.

### 2.2 Derived ratings

| Derived | Composition | Consumed? |
|---|---|---|
| `clinchOffence` | strength 0.45, wrestling 0.35, strikingOffence 0.20 | yes |
| `clinchDefence` | strength 0.45, takedownDefence 0.40, strikingDefence 0.15 | yes |
| `submissionDefence` | scrambling 0.40, submissions 0.30, fightIq 0.20, strength 0.10 | yes |
| `groundAndPound` | groundControl 0.55, power 0.45 | yes |
| `chainWrestling` | wrestling 0.50, cardio 0.30, strength 0.20 | yes |
| `finishingInstinct` | — | yes |
| `cageIq` | — | **no — computed, displayed on the fighter card, read by nothing** |

### 2.3 Traits

26. **Three** touch technique — `headhunter`, `volumeMachine` and `gunShy`, the last two through
the `strikeOutput` hook. None is stylistic: there is no southpaw, no clinch specialist, no judoka.

**`takedownRate` is a declared trait hook, applied to every takedown attempt in the game, and no
trait declares it.** A stylistic trait using it is pure table data with zero engine change.

> **Correction.** The original said two traits touch technique and that the trait system was an
> unused extension point. Three do, and the socket is already soldered in.

### 2.4 Tendencies — and what they actually do

`deriveTendencies()` produces 15 propensities from attributes and traits:

```
leadHook  counterRight  calfKick  headKick  bodyWork  highVolume
singleLeg  doubleLeg  fenceClinch  bodyLock
guillotine  backTake  groundAndPound  guardPassing  wallGetUp
```

> **Correction, and the most consequential one.** The original described these as "what a fighter
> reaches for". **They drive no behaviour whatsoever.** `Combatant.tendencies` is read at exactly
> one site in the entire engine — `simulate.ts:588`, inside `prepBonus` — where it scales *the
> opponent's* prepared-read bonus.

So the tendency profile is an axis of **scoutability**, not of behaviour. It decides how valuable
it is for somebody else to have drilled a counter to you, and nothing else. `profile.ts:5` and
`gameplan.ts:250` both describe it inaccurately for the same reason.

`strikeLean`, the scalar inside it, also carries a live bug: it reads 4 of 15 attributes and
**omits `submissions` and `scrambling`**, so a pure guard player (submissions 92, scrambling 85,
wrestling 40, groundControl 45) scores 0.529 — *striker-leaning*. No fixture would catch it;
`ARCHETYPES` has no submission specialist.

### 2.5 The game plan — and who actually gets one

Six approaches, each a table of intent multipliers:

| Approach | strike | kick | takedown | clinch | advance | submit |
|---|---|---|---|---|---|---|
| pressure | 1.25 | 0.9 | 0.8 | 1.1 | 1.1 | 0.9 |
| counter | 1.1 | 1.1 | 0.7 | 0.6 | 0.9 | 0.9 |
| wrestle | 0.7 | 0.5 | 2.0 | 1.3 | 1.2 | 1.0 |
| grind | 0.7 | 0.5 | 1.3 | 2.0 | 1.4 | 0.8 |
| pointFight | 1.1 | 1.1 | 1.0 | 0.8 | 0.8 | 0.6 |
| finish | 1.4 | 1.2 | 0.9 | 0.8 | 1.3 | 1.5 |

> **Correction.** The original called the plan "tactics, chosen fresh each bout". **Every AI-vs-AI
> fight in the world passes `defaultGamePlan()`** — `world.ts:746-747`, `night.ts:176-177`. That is
> `pressure`, targeting fixed at 60/25/15, `riskLevel 0.5`, **no prepped reads**. Only the player's
> own opponent gets `aiPlanFor`, and even that never selects `pointFight` or `finish`.

So for ~99% of the fights the game produces, the entire roster is handed the tactical instructions
of a pressure boxer — biased *against* shooting — and the read/counter system, the best-designed
system in the engine, is dormant. The statistical suite is calibrated against that population.

---

## 3. How a fight runs

Position is the spine.

```
distance  ⟷  clinch  ⟷  ground → guard → halfGuard → sideControl → mount → back
                                  (0.30    0.50        0.70        0.88    1.00 dominance)
```

**At distance**, four intents weighted by `attribute × approachWeight × exploitFactor`, each
fatigue-scaled. `exploitFactor` — fighters lean into whatever their opponent cannot deal with,
gated on `fightIq` and deliberately weaker than a drilled plan — is the best idea in the engine.

**In the clinch**, three intents (`takedown`, `clinchStrike`, `stall`) *for the fighter who won the
tie-up only*. The other fighter's sole option is to escape. Clinch striking resolves
`clinchOffence` vs `clinchDefence`, so `kicking` is never consulted — knees and elbows are a
strength-and-wrestling contest. There is **no stoppage path**: the clinch branch never increments
`unanswered` and never calls `shouldRefereeStop`.

**On the ground**, a five-rung ladder. The bottom fighter cannot strike at all. Takedowns always
land in guard (or half-guard on a roll), so there is no standing back-take and no submission from
a standing position.

---

## 4. Where styles actually collapse

### 4.1 The real cause: a kick is a punch with a different noun

```
rollFlushness(rng, attacker, defender)           ← no isKick
strikeDamage(attacker, target, flushness)        ← no isKick
knockdownHazard(attacker, …, target, flushness)  ← no isKick
```

`isKick` gates only *whether the attempt is chosen* and *which attribute contests the landing
roll*. Accuracy is skewed by `strikingOffence` even for kicks; damage and knockout hazard read
`power` and `BASE_DAMAGE[target]` only.

**A head kick from a Kicking-95 / Striking-40 fighter lands as flush as that fighter's jab, does
identical damage, and carries identical knockout hazard.** `BASE_DAMAGE` is head 2.2 / body 2.6 /
legs 2.4, so a punch to the legs and a calf kick are the same event.

That is why Muay Thai and Dutch kickboxing collapse together — and why boxing and kickboxing
collapse at the level of shot selection too.

Worse: `pickTarget` runs independently of `isKick`, so a punch exchange that rolls "legs" resolves
on `strikingOffence`, applies leg damage, and is narrated as a calf kick. **Roughly two thirds of
all leg damage in the game is dealt by a boxing stat.**

### 4.2 The asymmetry is downstream of the position model

Grappling has five attributes **because the engine models five grappling positions**, each with a
distinct resolution site. Striking has three because the engine models *one* striking position —
`distance` — with a boolean hanging off it.

> **What distinguishes two arts is not which attributes they use, it is which states they try to
> reach.** BJJ ≠ wrestling because `back` and `mount` are distinct states with distinct payoffs.
> Muay Thai = wrestling in the clinch because clinch is one state with one contest.

Adding striking attributes to an undifferentiated standing model yields more inputs into the same
`offence / (offence + defence)` roll. That is exactly what already happened to `kicking`.

> **Since built.** `FightState.range` splits standing into `outside`, `boxing` and `pocket`, and
> the prediction above held exactly: no attribute was added, and the striking arts separated
> anyway. The G1 matrix went 3 separated pairs → 6 with the tactical layer → **8 with range**, and
> the pair this document names as the hardest in the file, boxing against karate, cleared for the
> first time — on `outsideShare` as much as on `kickShare`, because the two arts stopped fighting
> in the same place. Doc 05 and `fight/range.ts` carry the mechanism.

### 4.3 What the engine can and cannot express

| Distinguishable | Not distinguishable |
|---|---|
| Boxing · Kickboxing/Muay Thai · Karate/TKD · Wrestling · BJJ · Judo/Sambo | Muay Thai vs Dutch kickboxing · Karate vs TKD · Judo vs Sambo · Capoeira · southpaw vs orthodox · head movement vs guard vs footwork · out-fighter vs pressure |

Six, and the striking half of that list is closer to three: measured on `deriveTendencies`, a Muay
Thai fighter, a Dutch kickboxer and a karate counter-striker differ by **≤0.09 on every one of the
fifteen reads** — inside the scouting error term at almost any coach rating.

### 4.4 Declared, seeded, displayed — and read by nothing

> **Correction.** The original said "no stance concept anywhere in the engine". Stance exists.

| Field | Status |
|---|---|
| `stance` (orthodox/southpaw/switch) | generated weighted, hand-authored across the seed roster, printed on the fighter card, **read by no simulator line** |
| `reachInches`, `heightInches` | generated, authored, displayed, **never read** |
| `cageIq` | computed, displayed, **never read** |
| `takedownRate` trait hook | wired into every takedown, **no trait declares it** |
| `tendencies` | computed per fighter, **one read site, scouting only** |
| `strikesByTarget` | recorded every fight, **never displayed** |
| `PreppedRead.confidence` | rendered in the camp screen, **never read by the engine** |
| `FinishMethod: 'retirement'` | commentary and news copy exist, **no code path produces it** |

That is not an absent concept. It is a much cheaper class of problem — and the reason the reviews
converge on wiring up what exists before adding anything new.

### 4.5 Style survives the engine and is then deleted by training

The `striking` focus trains `strikingOffence 1, kicking 0.85, strikingDefence 0.8, speed 0.3` as
one bundle — **you cannot drill hands without drilling kicks**. Because gains scale on `headroom`,
the attribute you are worse at grows faster, so specialists converge on generalists over a career.
A player picks Muay Thai, spends ten years becoming it, and ends up a generic striker.

### 4.6 The player cannot see any of it

`commentary.ts` contains **zero** references to `tendencies`. Weapon selection is a uniform draw
from a pool. `takedownText` picks randomly from doubles/singles/body locks/trips while
`doubleLeg`, `singleLeg` and `bodyLock` sit computed one property away. Missed kicks are narrated
as missed punches (`strikeMissed` never receives `isKick`). Every clinch strike in the game is the
same hardcoded string.

Per `broadcast.ts`'s own comment, *"in a text sim the commentary is the player's only view of the
fight."* A distinction the prose cannot carry does not exist for the player — and a distinction the
prose carries that the simulation did not make is a lie. **Nothing in the test suite compares
commentary text to what the simulator actually resolved.**

---

## 5. The calibration measures a world nobody plays

`roster-profile.test.ts` calls `createNewGame()` with no era, defaulting to 2020 (139 fighters).
`DEFAULT_ERA` is 2026 (858 fighters) — what the menu offers and what a new player gets.

**Measured directly**, using the suite's own pairing rule, seed scheme and method classification —
801 pairings for 2020, 35,627 for 2026:

| | 2020 (tested) | 2026 (played) | real UFC |
|---|---|---|---|
| Finish rate | 61.5% | **49.5%** | ~48% |
| KO/TKO | 47.3% | **30.1%** | ~31% |
| Submission | 14.2% | **19.4%** | ~17% |
| Decisions | 36.7% | **46.9%** | ~52% |
| KO : sub | 3.32 : 1 | **1.55 : 1** | ~1.8 : 1 |
| First-round finish | 32.1% | 32.0% | — |
| Draw | 1.25% | 2.97% | ~0.5% |

**On the roster the player actually plays, the engine is already close to the real sport on every
axis except the draw rate.** The calibration gap the code comments agonise over — and that doc 03
deliberately refused to close by deleting the power tail — is an artefact of profiling the legacy
roster. The 2020 column reproduces `damage.ts`'s own calibration table exactly.

Two further things fell out of reproducing this:

- **The clinch rate holds**: 0.68 landed clinch strikes per fight on 2026, 0.57 on 2020.
- **The knife-edge bounds are real.** The adversarial review measured 2020's KO:sub at 3.77 on its
  seed; this measurement gets 3.32 on the suite's own seed scheme. The bound is `< 3.6`. Same
  population, different seed, opposite sides of the assertion.

Also: `roster-profile.test.ts:61` counts `method === 'decisionDraw'`, which is not a member of
`FinishMethod`. `drawPct` is permanently 0 and that assertion has never tested anything.

> **Update (phase 0, doc 19 §7).** All of the above is now what the suite measures: the profile
> asks for 2026 by name and the draw count reads the real method. Two things the original missed.
> **The dead assertion was hiding a live number** — 2.97% against a bound of `< 3`, so correcting
> the field alone would have failed the suite; the honest bound is recorded at 4 with the reason.
> And **the cause was not a typo, it was an unchecked tier**: TypeScript rejects
> `FinishMethod === 'decisionDraw'` outright, but `npm run typecheck` covered `packages/` and not
> `tests/`. Adding `tsconfig.tests.json` found a second permanently-dead assertion and one
> mis-called function in suites nobody suspected. Five-round decisions on 2026 are 37.9%, against
> 24% on the legacy roster — an axis the table above does not carry.

---

## 6. Where the four reviews converge

All four independently recommend **not adding a new attribute yet**, for four different reasons:
the player could not perceive it; the position model has nowhere to put it; the phase has no
stoppage path; and it is the most expensive change landing on the rarest branch. All four agree
discipline must never reach resolution.

The shared conclusion is that **the engine already contains far more style machinery than it
uses**, and wiring that up dominates adding anything new — on value, on risk, and on the
coherence question specifically.

Sequencing, distilled from the reviews (their full reasoning is in [`reviews/`](reviews/)):

**Fix the instrument first.** Point the profile at 2026, fix the dead draw assertion, widen the
seed-dependent bounds, record the real baseline. Add fingerprint tests that measure *behavioural*
differentiation — position share, strike/kick split, takedown and submission rates — because no
test currently asserts stylistic differentiation at all, only outcome distributions. Without them
every later change is unfalsifiable.

**Then the zero-schema wins.** Thread `isKick` into the damage path. Fix `strikeLean`'s missing
`submissions`/`scrambling`. Wire `tendencies` into behaviour *and* into commentary. Give the world
real game plans. Give `stance` a consumer. Add a trait on `takedownRate`. Split the striking
training focus so a career stops erasing the style the player chose.

**Commentary parity is a gate, not a follow-up.** Every new mechanical distinction obliges a
matching narrative one, and a test asserting no commentary line names a technique the resolving
branch did not use is the single most valuable test in the plan.

**Only then** re-ask whether six is the limit — with an instrument that can answer it.

---

## 7. What is worth protecting

Named because an expansion should not trample them: `exploitFactor`; the five-rung ground ladder;
`effectiveDurability` (chin eroding from tonight's damage, career trauma and fatigue, with a
trait-set floor); knockdown-is-not-finish with a separate pursuit roll; three judges with
independent bias vectors producing honest disagreement; per-attribute fatigue sensitivity; fouls
buying recovery without ever being *better* than not being fouled; the round reset to standing;
and `entertainmentValue`, which already gives style real economic consequence in matchmaking and
is the most successful expression of style in the game — living entirely outside the fight engine.
