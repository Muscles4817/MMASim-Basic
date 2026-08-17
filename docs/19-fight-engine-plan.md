# 19 — Making the fight engine express style

**Status:** **phases 0, 1, 2 and 3 have landed** (§7, §7.7, §8.1, §9.1). Phases 4–6 remain a proposal; D3–D6
in §4 are still open, and D1/D2 are answered.

Phase 2's prediction was recorded before the work and scored four of six (§8.1). The one that failed
is the one that matters: **`kickShare` is the only axis in the fingerprint with the range to meet
G1's threshold at all**, so a two-axis goal cannot be reached by any weapon or targeting change.
That is the strongest evidence yet that phase 6 — or at least phase 5's real game plans — is
load-bearing rather than optional, and it arrived four phases before §2 expected it.

Doc 20 (persistence and save size) is deferred by the owner rather than dropped: the quota failure it
measures is real but there is no player other than the developer, so a bug that costs a save nobody
is keeping ranks below the phase that makes the game worth saving. Revisit before anyone else plays.

> Findings marked **verified** were checked directly against source. The two measurements this
> plan leans on — the clinch rate and the 2026 roster profile — have both been independently
> reproduced (doc 18 §5), so §6's contingency branches do not fire.
>
> Phase 0 built the instrument the rest of the plan is unfalsifiable without, and it recorded a
> baseline sharper than the one argued for above: **no pair of the six disciplines is separated
> enough for a player to perceive it, and sixty rating points of `kicking` are worth −1.3 points
> of win rate.** It also found five things this plan did not know (§7.4). One — the discipline
> table charging forty points for an art that cannot use them — is a stronger argument for phase 1
> first than anything in §3. Another (**F7**) is a live correctness bug outside this programme
> entirely: **bouts are written to fighters' records twice**, and it may deserve to jump the queue
> ahead of phase 1.

---

## 0. Two findings not in any of the four reviews

**F1 — The counter burst is hardcoded to punches. (Verified.)**

```ts
// simulate.ts:723
const counter = throwBurst(ctx, target, actor, false, counterScale);
//                                                ^^^^^ isKick
```

Every counter in the game is a punch, resolved on `strikingOffence`. The `counter` approach's
0.90 counter-scale (`simulate.ts:722`) is the strongest single piece of style expression in the
engine — and it is structurally closed to kickers.

Meanwhile `origin.ts:209` gives the karate discipline `strikingOffence: 2`, deliberately the
lowest of the three striking arts, with a documented reason: a karateka who matched a boxer's
hands would simply be a better boxer, so the identity is speed and selection. **The karate origin
is built to counter-strike, and the counter mechanic resolves on the one attribute the origin
deliberately withholds.** Not a tuning problem — a self-defeating loop between two systems that
shipped days apart.

**F2 — The missing primitive is a `weapon` on the strike, not an attribute and not `isKick`.**

`isKick` is a boolean at the wrong scope: chosen per *exchange* (`simulate.ts:626`), while targets
are chosen per *shot* (`simulate.ts:755`), while damage sees neither.

| Resolution site | What it is | What the code calls it |
|---|---|---|
| distance burst | punch or kick | `isKick: boolean` |
| clinch strike | knee (hardcoded prose) | nothing |
| ground strike | punches/elbows (prose says both) | nothing |

Replace it with `type Weapon = 'punch' | 'kick' | 'knee' | 'elbow'` threaded into `applyStrike`,
and one ~30-line change unlocks four separate top recommendations from four different reviews:

1. Kicks carry their own flushness/damage/hazard profile — the headline fix.
2. Commentary can be **told** what happened instead of guessing — which is what makes a parity
   test writable at all.
3. `strikesByTarget` becomes weapon × target — the result-screen evidence, free.
4. Clinch and ground strikes become mechanically distinct without a new position or attribute:
   the knee becomes a knee, the elbow becomes an elbow and can cut.

It fixes F1 as a side effect — once weapon is per-shot, counters pick weapons like any other burst.

**Correction to doc 18 §4.4:** `PreppedRead.confidence` is not unread — `CampScreen.tsx:339`
renders it as the `ConfidenceChip`. It is unread *by the engine*. The table overstates it.

---

## 1. The long-term goal

Discipline count is a lagging indicator and a bad target. Twelve labels over six behaviours is
worse than six, and it is exactly what `origin.ts:118-127` was written to avoid. The goal is
separation, legibility, persistence and consequence — count falls out afterwards as a measurement.

> **A fight is style-expressive when an observer given only the play-by-play and the post-fight
> stats can name which discipline each fighter came from, better than chance — and when that
> identification still works twelve years into the fighter's career.**

| | Property | Current state | Target |
|---|---|---|---|
| **G1** | **Separation** — discipline pairs differ by more than the scouting error term | ≤0.09 max separation between the three striking arts, against a ~0.10–0.14 SD error term | ≥0.20 on ≥2 fingerprint axes for every pair |
| **G2** | **Legibility** — every mechanical distinction is named, and no line names a technique the resolver did not resolve | commentary reads zero fighter state | a passing parity test |
| **G3** | **Persistence** — fingerprint at 34 correlates with fingerprint at 24 | a kickboxer's striking/kicking gap closes to 0 in 24 camps | stated threshold in the long-sim suite |
| **G4** | **Consequence** — style changes *whether* you win, not just how | a 60-point `kicking` swing = 6.6× behaviour, ~1pp win rate | variance comparable to `wrestling`'s ~9pp |

Definition of done for the programme: a `tests/statistical/styles.test.ts` asserting G1–G4.
**Nothing in the codebase asserts stylistic differentiation today** — only outcome distributions —
which means every change below is currently unfalsifiable.

---

## 2. Two strategies

**Strategy A — weapon-first.** Make the strike a described object. One standing position;
expressiveness from what is thrown, at what, with what consequence, narrated truthfully.
Ceiling ~8–9 disciplines. Cannot reach karate vs TKD, out-fighter vs pressure, or Muay Thai vs
Dutch kickboxing *as clinch arts*. Weeks, in days-sized revertable steps.

**Strategy B — position-first.** Accept the systems review's structural argument: arts differ by
*which states they try to reach*. Add standing sub-states (`outside | pocket`) plus a real
two-sided clinch, then attach attributes. The only path to 12+, to the out-fighter/pressure axis,
and to a defensible fourth striking attribute. 3–6 weeks, touching the exchange loop, fatigue,
judging and the whole calibration.

**Recommendation: A now, B later — and be honest that B is eventually unavoidable.**

Not because B is wrong about the endgame, but because B's payoff is unmeasurable until A's
fingerprint suite exists; A's phase 1 is a prerequisite for B regardless (a `pocket` node needs
weapons that behave differently, or it is two nodes running the same roll); and A is composed of
days-sized steps where B has no natural intermediate checkpoint. For a solo developer with a live
suite and a stated coherence worry, that last difference is the whole argument.

**Say the quiet part: if the real ambition is a dozen arts, A gets to about nine and stops.**
A is the instrument and foundation for B, not a substitute.

---

## 3. The sequence

| Phase | Lands | Effort | Risk |
|---|---|---|---|
| **0** ✅ | Era fix, draw-bound fix, knife-edge bounds, **fingerprint suite**, guard-player archetype | landed — §7 | none — no engine source touched |
| **1** ✅ | **`Weapon` primitive**, kick profile, weapon×target stats, **commentary parity test** | landed — §7.7 | moved finish rate +1.2pp after recalibration; 4 files |
| **2** ✅ | `strikeLean` fix, targeting reads the fighter, takedown entry becomes a recorded fact | landed — §8.1 | held: every population number moved under a point |
| **3** ✅ | `takedownRate` traits, attribute-aware trait generation, `stance` consumer, kill `cageIq` | landed — §9.1 | held; and it found F10, which is larger than the phase |
| **4** | Split the striking training focus; persistence assertion | 1–2 weeks | career distributions; long-sim re-baseline |
| **5** | Real game plans for the world; reads from real tendencies; **re-ask granularity with a number** | 1–2 weeks | largest single distribution move; ship alone |
| **6** | Strategy B — standing sub-states, two-sided clinch, then attributes | 3–6 weeks | a real project |

**Phase 0** is first because without the fingerprint suite there is no falsifiable claim in the
rest of the plan, and without the era fix you tune against a 139-fighter world nobody plays.
Expect the 2026 profile to fail its first bounds — that is the point; you are recording a
baseline, not defending one.

> **Scored.** Half right. Every outcome bound the 2026 profile inherited passed on the wider
> population, and two got *further* from their limits rather than closer (KO:sub 3.32 → 1.55
> against a `< 3.6` ceiling; five-round decisions 24% → 37.9%). The one that failed was the one
> nobody could see: the draw rate, at 2.97% against `< 3`, because that assertion had never been
> able to run at all (§7.4 F6). The prediction was right about needing a baseline and wrong about
> where it would hurt — the risk was not in the calibration, it was in the instrument.

**Phase 1's parity test lands before the distinctions exist**, so it guards them from birth rather
than being retrofitted onto a divergence already shipped. Expect finish rate and KO:sub to move:
kicks becoming more dangerous raises hazard, legs-as-punches becoming punches lowers it, and the
two do not cancel. `firstRoundPct` is the bound closest to its limit.

**Phase 2** comes after 1 because commentary must already be *told* before tendencies drive
selection — otherwise you wire the narrator to a formula that has a live bug and that phase 5 may
replace, and you do the wiring twice.

**Phase 4** is the first genuinely weeks-sized phase, and it is the only one that moves *career*
rather than *fight* distributions. The re-baselining is the work, not the edit. It is also the
only item in the plan that is a **broken promise** rather than a legibility gap.

**Phase 5 is deliberately last, against reviewer A's Tier 1 ranking.** A calls it "two lines, no
engine change, contained risk." It is two lines and it is the largest single distribution move in
the plan — it changes the approach table, the targeting split and the prep system for ~99% of
fights simultaneously, and the entire calibration was fitted to the population it replaces. Cheap
in lines is not cheap in risk.

---

## 4. Decision points

**D1 — `Weapon` enum, or just thread `isKick`?** → *Recommend the enum.* Threading the boolean is
~2 days cheaper, re-entrenches the wrong scope, leaves the clinch knee and ground elbow
unnameable, leaves F1 unfixed, and makes the parity test harder to write because there is still no
ground-truth field to compare prose against.

> **Decided: the enum. Implemented — §7.7.** `type Weapon = 'punch' | 'kick' | 'knee' | 'elbow'`,
> per shot, chosen *with* its target rather than independently of it, threaded into `applyStrike`
> and through `rollFlushness`, `strikeDamage` and `knockdownHazard`. One thing the write-up above
> underrated: the boolean's real cost was not the missing nouns, it was that **weapon and target
> were chosen by different systems that never spoke** — which is why "two thirds of leg damage is
> dealt by a boxing stat" was possible at all. An enum alone would not have fixed that; choosing
> them together is what did.

**D2 — Does commentary read the fighter, or read the event?** → *Recommend the event, strongly.*
If the narrator picks the technique *and* the resolver picks the technique, they are two
independent draws that can disagree, with no ground truth — the parity test becomes literally
unwritable. Resolution decides, records, and passes. Same felt outcome, structurally different
code. This is the sharpest disagreement with any of the four reviews.

> **Decided: the event. Implemented — §7.7.** `FightEvent` carries `weapon` and `target`, and
> `commentary.ts` selects prose from a table keyed by them.
> `tests/statistical/commentary-parity.test.ts` exists, which is the proof the argument was right:
> it could not have been written the other way round. It found three lies on its first run, all of
> them in the *vocabulary tables* rather than in the code — the punch list contained "a knee to the
> midsection" and "a chopping body kick", the kick list contained "a flying knee to the body", and
> `groundStrikesText` offered "works elbows from the top" on a branch that had never resolved an
> elbow. Every one of those lines was defensible on its own; nothing was comparing them to
> anything.

**D3 — Split the striking training focus?** → *Recommend yes*, but this is the defensible thing to
defer. If deferred, take G3 off the goal list explicitly rather than letting it quietly fail.

**D4 — Fix the volume/referee compensating error pair?** → *Recommend not now.* Burst size is
attribute-free, so the referee threshold sits at 5.5–9.5 unanswered shots while its own comment
says the real mark is three or four. Largest realism win available and largest calibration risk;
mixing it into a style programme destroys attribution for both. It is the natural home for a
fourth striking attribute later, which makes it phase 6's real content.

**D5 — When does `COMBAT_DISCIPLINES` grow past six?** → *Recommend after phase 5*, gated on the
fingerprint suite showing ≥0.20 separation for the proposed pair. Then `origin.ts:118-127` gets
rewritten with a measurement rather than an argument — which is this codebase's culture.

> The gate now exists and can be read: `tests/statistical/styles.test.ts`, baseline in §7.2. It
> currently answers *no* for all fifteen existing pairs, which makes this decision easy for the
> moment — and it sharpens the question. §7.4 F3 shows two of the six are not separated *and* not
> equally good, so the live problem is that six is already one or two more than the engine can
> honestly carry, not that six is too few.

**D6 — `reachInches` / `heightInches`?** → *Recommend nothing, and say so in the doc.* Unlike
stance, reach has no natural discrete contest until a range concept exists in phase 6. A small
additive term in the landing roll is a tuning coefficient wearing a style costume.

---

## 5. What not to do

**Not wire commentary to tendencies as the first move**, despite the expressiveness review
nominating it as the cheapest win with no calibration risk. Both halves are true *today* and both
stop being true the moment phase 2 lands — if narrator and resolver both pick, they diverge, which
manufactures the exact incoherence that review is complaining about, one layer down.

**Not add the three-element positional identity vector** from the systems review. The intent
weights are already `attribute × approachWeight × exploitFactor`; a preference vector *derived
from those same attributes* multiplies the attribute term by a monotone function of itself. It
sharpens existing differences rather than adding a dimension, double-counts, and weakens
`exploitFactor` in relative terms. That review is right that `strikeLean` is the wrong shape; the
proposed replacement is the wrong fix.

**Not add a new attribute at any point in this plan.** The *purpose* of an attribute is to be
trainable, ageable, injurable and suppressible. Until phases 1–5 show a distinction survives all
four, you do not know which attribute you want.

**Not add read keys before their resolution sites exist.** Going from 4-of-15 to 4-of-25 coverage
silently nerfs the prep system, which `balance.test.ts:235` guards.

**Not bundle the corner-stoppage / `retirement` work.** Good idea, wrong project — it moves the
finish distribution and destroys attribution.

**Not touch `origin.ts` until phase 5.** Running an engine expansion and an origin revision
simultaneously is how you lose the ability to say which one moved a number.

---

## 6. Where the reviews genuinely disagree

**The clinch — unresolved, and the plan takes a side.** The systems review ranks re-composing the
clinch as its **top recommendation**. The adversarial review measures the clinch at 0.68 landed
strikes per fight and calls it the rarest branch in the engine. The realism review splits it: fix
the clinch *mechanisms* first (stoppage path, options for the non-controller, a cost for being
pinned), and only then the resolution inside it.

These cannot all be right. With the clinch rate now reproduced, the systems review's top-ranked
option unlocks almost nothing, because the phase it improves barely happens. The realism review's
reconciliation is the coherent one — but its Tier 2 items are themselves a small project (a
two-sided clinch is a new intent lottery where there is currently a null action), which puts them
in phase 6. **This plan therefore does almost nothing to the clinch, and that is a considered
disagreement with the systems review's top recommendation, not an oversight.**

**The adversarial review contradicts itself.** Its §2A measures a 60-point `kicking` swing at ~1pp
win rate and concludes style attributes are "strategically inert". But its own §1.5 explains *why*
that number is 1pp: damage, flushness and hazard never see `isKick`. The inertness it measures is
not a property of style attributes — it is the specific bug it identifies two sections earlier.
Once phase 1 lands, that number should move, and G4 is the assertion that it did. The restraint
conclusion survives; the reason for it does not.

**Sequencing "give the world real plans."** Realism ranks it Tier 1 #1; expressiveness lists it as
one of four preconditions; the adversary does not rank it. This plan puts it at phase 5. If the
owner disagrees, disagree explicitly — it changes the risk profile of every phase after it.

---

## 7. Phase 0 — landed

Pure measurement, as promised: **not one line of engine, data or app behaviour changed.** The only
edits under `packages/` are a new fixture (`ARCHETYPES.guardPlayer`) and a new test file, both of
which ship in `src` by the existing convention for shared test builders. So every number below is
the engine exactly as it stood before this plan was written.

### 7.1 What shipped

| | |
|---|---|
| `tests/helpers/fingerprint.ts` | The instrument. Six 0–1 behavioural axes, measured against a fixed control opponent, with exemplars derived from `DISCIPLINE_META` so the suite measures the six arts the game actually offers rather than six hand-authored guesses. |
| `tests/statistical/styles.test.ts` | G1 and G4, with the baseline recorded in the header and three **tripwires** — assertions that state a defect and are meant to break when the phase that fixes them lands. 7s. |
| `tests/statistical/roster-profile.test.ts` | Profiles 2026 by name, counts draws through `FinishMethod`, bounds set where the engine honestly is, and no longer runs the 35,627-fight pass twice. 46s. |
| `ARCHETYPES.guardPlayer` + `fight/profile.test.ts` | The missing submission specialist, and the first test of `deriveTendencies`. Reproduces `strikeLean = 0.529` exactly. |
| `tsconfig.tests.json` | The tests tier is now typechecked. Not in the plan; see F4. |

`npm test` goes from 75s to ~90s, almost all of it the roster profile: 2026 is 44× the pairings of
2020. Bought deliberately — the alternative is sampling, and an exactly-reproducible population
number is worth fifteen seconds to a suite whose whole job is to be trusted. One wrinkle worth
knowing: nineteen seconds of uninterrupted synchronous simulation starves vitest's reporter RPC and
produces an unhandled `Timeout calling "onTaskUpdate"` on an otherwise green run, so the profile
loop yields every 2,000 fights.

### 7.2 The G1 baseline

Six exemplars, equal to `ARCHETYPES.contender()` in total rating points to within one, 400 fights
each against it, default game plans both sides:

```
             kickShare  legTarget  grappling  subMix  control  distance
boxing           0.081      0.115      0.132   0.622    0.224     0.318
kickboxing       0.265      0.120      0.134   0.618    0.175     0.324
karate           0.358      0.121      0.147   0.569    0.253     0.349
wrestling        0.127      0.097      0.209   0.415    0.334     0.323
jiuJitsu         0.171      0.112      0.200   0.600    0.266     0.315
judo             0.142      0.102      0.235   0.535    0.314     0.291
```

**Of fifteen pairs, zero meet G1** (0.20 on two axes) and five clear 0.20 on even one. Jiu-jitsu
against judo is 0.065 at its widest — less than half the scouting error term, two arts the engine
plays identically. Boxing against jiu-jitsu is 0.090.

The instrument is not simply blind: the same measurement separates `striker` from `smotherer` on
three axes at once (kickShare 0.282 vs 0.028, controlShare 0.157 vs 0.625).

One column is flat by construction: `pickTarget` reads the game plan and nothing else, so where a
fighter aims is a property of their plan, never of their art. It is in the fingerprint because it
is what phase 1's weapon × target stats are supposed to bring to life.

### 7.3 The G4 baseline

Sixty rating points on one attribute, everything else held at contender level, paired seeds:

| Attribute | 38 → 98 | Swing |
|---|---|---|
| `strikingOffence` | 41.7% → 56.3% | **+14.5pp** |
| `wrestling` | 40.8% → 54.4% | **+13.6pp** |
| `submissions` | 48.0% → 59.6% | +11.6pp |
| `kicking` | 48.9% → 47.7% | **−1.3pp** |

The adversarial review measured ~1pp for `kicking` and called style attributes "strategically
inert". On paired seeds it is not small, it is *zero, pointing the wrong way*: the kicks land more
often and then do exactly what a jab does. G4 is met when that row looks like the `wrestling` row.

### 7.4 Five things the plan did not know

**F3 — The discipline table charges forty points for an art that cannot spend them. (Verified.)**

`DISCIPLINE_META` gives every combat discipline exactly 40 bias points, and `origin.ts` says why
in as many words: *"Equal totals are the point: the choice is shape, not quantity, so no
discipline is the strong pick."* Measured round-robin, 400 fights per cell, mean win rate against
the other five:

```
boxing 56.8%   karate 51.6%   wrestling 50.4%   jiuJitsu 48.5%   judo 43.8%   kickboxing 34.5%
```

A 22-point spread across six choices designed to be equal, and the art at the bottom is the one
that spends the most of its forty on `kicking` — sixteen points, where karate spends fifteen but
recovers most of it through eleven points of `speed`, which the engine reads everywhere. Head to
head, boxing beats kickboxing **66.5% to 30.5%**.

This is the same bug as §7.3 seen from the character-creation screen, and it is a *broken promise*
in the §3 sense rather than a legibility gap — the game offers "Kickboxing / Muay Thai" as a peer
of "Boxing" and hands over a fighter who loses two out of three. It strengthens the case for phase
1 without changing it: the fix is in `applyStrike`, not in the table, and §5's "not to touch
`origin.ts` until phase 5" still holds — after phase 1 the table may need no change at all, which
is exactly why it should not be touched first.

**F4 — The tests tier was never typechecked, and that is why the dead draw assertion survived.**

`npm run typecheck` covered `packages/engine`, `packages/data` and `packages/app`. It did not cover
`tests/`. TypeScript rejects `method === 'decisionDraw'` outright — `FinishMethod` has no such
member — so the defect doc 18 §5 found by reading was already detectable by the compiler and had
simply never been compiled. Adding `tsconfig.tests.json` surfaced 13 errors, of which two were
live defects in suites nobody suspected:

- `promotion-finance.test.ts` read `bouts[i].result` where the field is `outcome`, so
  `lostByStoppage` was always false and **the 30-day medical-suspension assertion had never once
  been evaluated.** Running it failed immediately — see F7.
- `championships.test.ts` called `defend(title)` without the `day` argument, writing
  `lastContestedDay: undefined` into a lineage the assertion never inspected.

The lesson generalises past this plan: an assertion that cannot fail is worse than no assertion,
and one whole tier of this repo's assertions was outside the tool that proves they can.

**F5 — `distanceSeconds` mis-credits every position change, and the judges read it.**

`applyPassiveEffects` books an exchange's seconds against the position the exchange *ended* in, and
it runs after the exchange resolves. So a takedown or a clinch entry credits its whole duration to
the ground or the clinch, and distance time is systematically under-counted for whoever changes
position. `FightStats.distanceSeconds` is documented as "used by judges assessing octagon control",
so this is not only a measurement defect. Left alone deliberately: fixing it moves scorecards, and
phase 0 moves nothing. `distanceShare` carries the caveat at its definition.

**F6 — The dead draw assertion was hiding a live number.**

Correcting the field alone would have failed the suite: the real 2026 draw rate is **2.97%** against
the bound of `< 3` that had never been reachable. Real MMA runs near 0.5%, so the engine draws three
to six times too often, and the cause is scoring arithmetic — every 10-8 round makes a card sum to
56 rather than 57 — exposed to far more samples by the recalibration that sent more fights to the
judges. Recorded at `< 4` with the reason, plus a floor of `> 0.5` so a metric can never silently
go dead again. Closing the gap is a scoring change and belongs with the judging work, not here.

**F7 — Bouts were written to fighters' records twice. (Fixed — §7.6.)**

Found by reviving the assertion in F4, which failed on the first run: `Ngannou fought 0d after
being stopped`. Diagnosed over a simulated year of the 2020 world — 45 cards, 139 fighters:

| | |
|---|---|
| Same-day record pairs | **65** |
| …of which the identical bout written twice | **52** (same day, same opponent, same method) |
| …two genuinely different bouts on one day | 13 |
| Fighters appearing twice on one day *in the schedule* | **0** |
| Suspension violations once same-day pairs are excluded | **0** — minimum real gap after a stoppage is **70 days** |
| Settled bouts still reading `result: undefined` on their night | **all of them** |

So the schedule is right and the suspension system is right; the **record** is wrong. One
fighter's year reads `day 28 loss/ko vs dos Santos`, `day 28 win/ko vs Cormier`, `day 98
loss/tko vs Blaydes`, `day 98 loss/tko vs Blaydes` — against exactly two scheduled bouts, and the
dos Santos fight has no scheduled counterpart at all. A duplicated bout inflates records, KO
counts, rankings and purses, which makes this a correctness bug rather than a cosmetic one.

The mechanism turned out to be one line's worth of assumption, in `advanceWorld`. **Every card in a
step was stamped with the step's own `day`** — three shows on one date, a fortnight apart from the
next three. `eventId` is `evt_${promotionId}_${day}` and the promotion is drawn independently per
card, so two of the three cards drawing the same promotion produced the *same event id*, and
`db.events.upsert` silently overwrote the first night after it had already been simulated and
written to everybody's record. The schedule looked spotless because the row that would have shown
the collision had been overwritten by the row that collided with it.

Underneath that, `available` was built once per fortnight and never pruned as fighters were booked.
`used` only ever kept a fighter off *this* night, so the same fighter could be matched onto two of
the three cards — the 13 different-opponent pairs. That defect would have survived the date fix on
its own, as two bouts inside one fortnight instead of two on one day.

Fixed in §7.6, against the plan's own rule about attribution rather than in spite of it: it is not
a fight-engine change, it does not touch a damage constant or a resolution site, and leaving a live
double-counting defect underneath a measurement programme would corrupt every career-level number
the later phases are supposed to move.

### 7.5 What to expect when phase 1 lands

> **Scored: one of three, and the two that held are the finding.** Written before phase 1; kept as
> written, because a prediction edited after the fact is worth nothing.
>
> **(2) broke, as expected** — the kicking swing inverted from −1.3pp to +9.7pp and the assertion
> inverted with it. **(1) did not.** Pairs did *not* start clearing G1; the count is still 0 of 15,
> because `kickShare` is one axis and G1 asks for two. **(3) did not.** Kickboxing is still the
> worst discipline in the game — 35.5% mean win rate against boxing's 56.5%, boxing still beats it
> 63% head to head — but the *cause* has changed, and that is worth more than the tripwire firing
> would have been. It is no longer that `kicking` is worthless; it is that kickboxing spends 7 of
> its 40 points on `durability` and `strength` while boxing spends 29 on `strikingOffence` and
> `strikingDefence`. F3 is now a claim about which *attributes* are worth having, not about a bug.
>
> `firstRoundPct` broke exactly as called, at 34.7%, and was brought back to 32.7% by recalibrating
> `BASE_KD_HAZARD` rather than by softening the weapon table.

Three tripwires should break, and each is a checkpoint rather than a regression:

1. `styles.test.ts` — "does not yet separate a single pair on two axes". Pairs starting to clear
   G1 is the headline result of phase 1.
2. `styles.test.ts` — "makes being a far better kicker worth nothing at all". Raise the bound
   toward the `wrestling` yardstick rather than deleting the test.
3. `styles.test.ts` — "charges the same forty points … does not deliver the same fighter". Tighten
   toward parity; this one is a promise to the player.

`roster-profile.test.ts`'s `firstRoundPct < 34` is the bound closest to its limit at 31.96%, and
phase 1 pushes it from both directions. A fourth tripwire waits on phase 2: `profile.test.ts`
asserts that a pure guard player scouts as the busier striker, which the `strikeLean` fix inverts.

**And phases 1–6 remain unapproved.** D1 (`Weapon` enum vs threading `isKick`) and D2 (does
commentary read the fighter or the event?) both gate phase 1, and D2 in particular cannot be
deferred past it: if the narrator and the resolver each pick a technique independently, the parity
test that phase 1 is supposed to land is unwritable. Phase 0 does not settle either — it makes them
answerable, which is different.

### 7.6 F7, fixed

Two changes in `advanceWorld`, neither of them in the fight engine.

**Cards in a step get their own dates.** Spread across whatever part of the step is actually being
simulated, so a short call cannot date a card past the day it was asked to stop at. This is what
breaks the `eventId` collision, and it is also just true of the sport — three shows on one night was
never right.

**A fighter on tonight's card leaves the step's available pool.** `used` kept them off one night;
this keeps them off the fortnight.

Measured over a simulated year, both eras:

| | 2020 before | 2020 after | 2026 before | 2026 after |
|---|---|---|---|---|
| Same-day record pairs | 65 | **0** | 87 | **0** |
| Identical bout written twice | 52 | **0** | 50 | **0** |
| Pairs inside a fortnight | 65 | **0** | 87 | **0** |
| Shortest gap between bouts | 0d | **47d** | 0d | **51d** |
| Suspension violations | 9 | **0** | 12 | **0** |
| Cards that survived to the schedule | 45 | **53** | 68 | **74** |
| Distinct card dates | 26 | **53** | 27 | **74** |
| Total bouts recorded | 394 | 374 | 1210 | 1134 |

The last three rows are the interesting ones. Eight cards a year in 2020 were being destroyed after
they had been fought — the fights counted, the event they happened at did not — and the world's whole
schedule ran on 26 dates rather than 53. Recorded bouts fall about 5%, which is the double-counting
going away.

Guarded in `living-world.test.ts` by the two invariants rather than by the numbers: nobody fights
twice inside a fortnight, and no two cards share a promotion and a date. The revived suspension
assertion in `promotion-finance.test.ts` now runs at full strength with no same-day exclusion.

One thing deliberately left: `CardBout.resultId` is documented "Set once the night has been
simulated" and is written by nothing, in either card runner. It is the field that would have made a
re-run detectable, and pointing it at something means deciding to store fight results — a save-size
and retention question rather than a bug fix. Recorded here rather than answered.

**And a note on where this was covered from.** `twenty-years.test.ts` — the suite whose name
suggests it would catch this — drives its *own* booking loop rather than `advanceWorld`, so the
production world loop has no twenty-year coverage at all. The multi-year confidence for this fix
comes from `generations.test.ts`, which does advance the real loop year by year, plus twelve
integration and statistical files.

Worth sitting with: that private harness already contained the fix. `for (const id of [red.id,
blue.id]) { ... available.splice(index, 1) }`, under the comment *"Both are now booked; do not book
them again in this block."* The correct behaviour was written down, in a test file, next to a loop
standing in for the one that did not do it.

### 7.7 Phase 1 — landed

D1 and D2 as recommended, and the answer to both was the same shape: **the missing thing was not a
noun, it was that weapon and target were chosen by different systems that never spoke.**

**What changed.** `WEAPON_PROFILE` in `damage.ts` — four numbers per weapon (damage, knockdown
hazard, cut chance, and *which attribute decides flushness*), and the last is the load-bearing one:
a kick's flushness now reads `kicking`, so a kicker's kicks land better than their hands instead of
identically. `pickShot` chooses weapon and target together, so a shot to the legs is a kick and the
attribute that lands it is the one the fighter trained for it. The clinch knee is a knee, the ground
elbow is an elbow and cuts three times as often as a jab, and cut chance moved out of `simulate.ts`
— where it was a flat 0.14 for every strike in the game — into the weapon that decides it.

**F1 fixed, as a side effect exactly as predicted.** `throwBurst(ctx, target, actor, false, …)` —
that fourth argument was `isKick`, so every counter in the game was a punch. Once weapons are
per-shot the counter picks its own, off the counter-fighter's own ratios, and the karate origin
built to counter-strike is no longer served by the one attribute the origin withholds.

**G4: met.** Sixty rating points, paired seeds, against a contender:

| Attribute | Before | After |
|---|---|---|
| `strikingOffence` | +14.5pp | **+12.1pp** |
| `kicking` | **−1.3pp** | **+9.7pp** |
| `wrestling` | +13.6pp | +10.9pp |
| `submissions` | +11.6pp | +11.7pp |

Kicking went from worth *nothing, pointing the wrong way* to comparable with wrestling. Striking as
a whole became more consequential — 21.8 points across the two striking attributes against 13.2
before — and is now split across both rather than concentrated in the hands. Grappling gave up
ground in relative terms because the striking half of the sport got more dangerous, which is the
trade phase 1 was asking for rather than a regression.

**G1: not met, and it barely moved. Still 0 of 15 pairs.** This is the important result, and it was
not the expected one. `kickShare` roughly doubled and spread (boxing 0.081 → 0.163, karate 0.358 →
0.430), and `legTargetShare` came alive as a style axis — a boxer aims low on 3% of shots against a
karateka's 7%, where before every fighter sat at 0.115 because the default plan sends 15% of
*everybody's* shots at the legs. Two pairs now clear 0.20 on `kickShare` alone. But G1 asks for two
axes, and the other four are position and targeting axes that phase 1 never touched.

One pair got **worse**: kickboxing against karate fell from 0.109 to 0.066, because both are now
high-kick fighters and the one axis that finally works saturates for both of them. That is
Strategy A's ceiling arriving precisely where §2 said it would — *"cannot reach karate vs TKD"* —
and it arrived in phase 1 rather than phase 5. Jiu-jitsu against judo remains the worst pair in the
game at 0.058, untouched, because it is a position problem and always was.

**The recalibration.** `BASE_KD_HAZARD` 0.019 → 0.0158. The weapon table sets *relative* danger and
this constant sets *absolute*, so a table where kicks and knees are harder than punches necessarily
raises the population's hazard: finishes went 49.5% → 52.7% and first-round finishes 32.0% → 34.7%,
breaking the one bound §3 predicted would break. Absorbing it in the global constant rather than by
softening the weapon table is why the two are separate — the style expression survives untouched.

| | Before | After |
|---|---|---|
| Finishes | 49.5% | 50.7% |
| KO/TKO | 30.1% | 31.0% |
| Submission | 19.4% | 19.8% |
| Decisions | 46.9% | 45.8% |
| KO : submission | 1.55:1 | 1.57:1 |
| First-round | 32.0% | 32.7% |

Landed weapon mix across the whole roster: **punch 65%, kick 25%, knee 2.4%, elbow 7.7%** — against
roughly 70/20/small in the real sport, from a table that was never fitted to it.

**Three knife-edge bounds broke in suites phase 1 does not own**, and one of them is worth naming
because it was not a regression at all. `broadcast.test.ts` asserts that a booth agrees with the
judges less the more biased it is, over four bias levels at 400 fights. Measured, adjacent levels
differ by about one point of agreement, and at 400 fights the first two are *inverted* — so the
monotone chain had been passing on luck. At 1,600 and at 4,000 it is clean and identical in both.
The file's own header describes this happening to its 150-fight ancestor: *"the effect was real and
the sample simply could not resolve it."* It happened again, one order of magnitude up. The other
two — a draw ceiling for two identical fighters, and the preparation ratio — were re-stated with
their measurements and, in the prep case, from both sides at once, because a ratio bound and an
absolute bound are each hostage to the other's denominator.

**What phase 1 says about the plan.** §2 argued Strategy A reaches "about nine" disciplines and
stops. Phase 1 is the first evidence, and it points slightly worse than that: the weapon axis is
*one* axis, it saturates, and the arts that need separating most (Muay Thai vs Dutch kickboxing,
karate vs TKD, judo vs sambo) are the ones it cannot separate because they all sit at the same end
of it. G1 needs the position and targeting axes, which is phases 2, 5 and 6. The plan's ordering
still holds — G4 was unreachable without this, and phase 2 wires the narrator to a formula that is
now correct — but the case that **B is unavoidable** is stronger than when it was written.

---

## 8. Phase 2 — the prediction, written first

Three edits, in this order, each revertable on its own. §3 sizes the phase at 4–6 days and calls it
the first change to *who wins*.

**(a) `strikeLean` reads the whole grappling game.** `profile.ts:42` weighs striking against
`wrestling` and `groundControl` only, so a fighter whose entire game is `submissions` and
`scrambling` reads 0.529 — striker-leaning — and every tendency scaled by that scalar is scaled the
wrong way (§7.4's fourth tripwire, asserted at `profile.test.ts:39`).

**(b) Targeting stops being one table for the whole roster.** `pickTarget` reads
`plan.targeting` and nothing else, so *where* a fighter aims is a property of their plan and never
of their art — the flat column §7.2 named at the baseline. Phase 1 gave `legTargetShare` a pulse
indirectly, through `pickShot` refusing to punch a leg; this makes it a choice. The fighter's own
`calfKick` / `bodyWork` / `headKick` tendencies blend with the plan, gated on `adherence`, so a
disciplined fighter follows the corner and a headhunter follows their habits.

This is the one place tendencies can drive selection without the double-count §5 rejects in the
positional identity vector: the plan's targeting table is not attribute-derived, so blending against
it adds `fightIq` and the trait layer to a decision that currently sees neither, rather than
multiplying an attribute by a monotone function of itself. The intent lottery is deliberately left
alone for exactly that reason.

**(c) The takedown entry becomes a recorded fact.** `commentary.ts:152` picks the entry itself —
`rng.pick(['a double leg', 'a single leg', 'a body lock', 'a reactive shot', 'a trip'])` — which is
D2's defect one layer down and in a phase D2 never audited, because phase 1's parity test only ever
compared *strikes*. The entry becomes a resolved value chosen from `singleLeg` / `doubleLeg` /
`bodyLock`, gated by whether the shot came from distance or the clinch, carried on the event and
narrated from the record.

**What should happen, so it can be scored:**

1. **(a) inverts the fourth tripwire and moves almost nothing else.** Tendencies reach the engine at
   exactly one site — `prepBonus` — so the live consequence is confined to prep value against
   submission-shaped grapplers. `balance.test.ts`'s prep bounds should hold without re-statement.
2. **(b) is where G1 gets its second axis or fails to.** `legTargetShare` sits in a 0.030–0.074 band
   across the six arts; it should spread wide enough that boxing/karate and boxing/kickboxing — both
   already clear on `kickShare` — clear on two axes, which breaks the G1 tripwire at
   `styles.test.ts:153`. **If `legTargetShare` does not clear the error term after this, Strategy A
   has one axis and not two, and phase 6 should move up the queue.** That is the falsifiable claim
   in this phase.
3. **jiu-jitsu against judo does not move.** It is a position problem and (b) is a targeting change.
   The grappling tripwire at `styles.test.ts:177` should still pass, and if it breaks, suspect the
   measurement rather than celebrating.
4. **F3's discipline spread does not narrow much.** Since phase 1 it is a claim about which
   *attributes* are worth having, not about a bug, and targeting does not change what an attribute
   is worth. Kickboxing should stay the worst of the six.
5. **The outcome bounds move less than phase 1 moved them.** Phase 1 raised the population's hazard
   because kicks and knees are harder than punches in absolute terms; (b) *redistributes* where
   shots go without making any shot more dangerous, so `firstRoundPct` — 32.7% against a `< 34`
   ceiling, still the closest bound in the suite — should stay inside it without a recalibration. A
   second `BASE_KD_HAZARD` change in two phases would mean (b) is doing something it was not asked
   to do.
6. **(c) finds at least one lie.** The entry list is offered whole to a resolver that knows whether
   the shot came from the clinch, so "a trip" and "a body lock" are already narrating distance
   shots. Parity tests have found something on every run so far; assume this one does too.

### 8.1 Phase 2 — landed, and scored four of six

All three edits landed. The suite is green at 1,087 tests and no bound was re-fitted.

| | Predicted | Happened |
|---|---|---|
| 1 | (a) inverts the fourth tripwire, moves nothing else | ✅ 0.333 → 0.094 against the control wrestler's 0.117 |
| 2 | (b) gives G1 its second axis | ❌ **and this is the phase's finding** — see below |
| 3 | jiu-jitsu against judo does not move | ✅ 0.058 → 0.066, still inside the error term |
| 4 | F3's spread does not narrow | ✅ boxing still beats kickboxing 65% |
| 5 | the outcome bounds hold without a recalibration | ✅ every population number moved by under a point |
| 6 | (c) finds at least one lie | ➖ it found one, and the liar was the test |

**The failed prediction is the useful one.** `legTargetShare` widened — boxing against karate went
0.044 → 0.080, and a boxer now aims low on 2.6% of shots against a karateka's 10.6% — but G1 is
still 0 of 15 pairs, and the probe says it always will be from here. Driven across the plausible
attribute range, the axis runs **0.003 for a hands-only fighter to 0.132 for a pure kicker**: its
ceiling is the plan's own `legs` weight of 0.15, and ~99% of the game's fights use the default
plan. **`kickShare` is the only axis in the fingerprint with the dynamic range to clear 0.20 at
all**, and G1 asks for two.

So the honest statement after two phases of Strategy A is sharper than §2's "about nine and stops":
*the weapon axis is the only axis Strategy A owns, and one axis cannot satisfy a two-axis goal.*
The second axis has to come from plans that differ per fighter (phase 5) or from positions
(phase 6). Neither is a tuning problem, and neither is available cheaply.

**What phase 2 cost, and it is worth naming.** `kicking`'s win-rate swing fell from 9.7 to 8.2
points. Targeting now reads the fighter, so a fighter who cannot kick **stops aiming at the legs**
rather than throwing kicks they are bad at — the low end of the swing rose 1.4 points while the
high end barely moved. That is adaptive behaviour compressing an attribute's consequence, which is
a permanent tension between G4 and realism rather than a bug: every piece of "fighters play to
their strengths" the engine grows will do this. Measured, the alternative is worse — dropping the
relative gate returns `kicking` to 9.5 and drops `strikingOffence` to 8.6, buying the number back
by making the feet beat the hands.

**Two things nobody predicted.**

**F8 — `risk.test.ts` was measuring a quarter-point effect at 1,200 fights.** Its "recklessness
gets you finished more too" assertion inverted under an unrelated reseed. Measured over 12,000
fights the effect is real and tiny: 3.98% knocked out against 3.74%. Restated on knockdowns
suffered at 4,000 fights (0.262 against 0.246) with the finding recorded at the site — **at
journeyman level recklessness is close to free**, buying 4× the finishes for a 6% rise in getting
dropped, and what keeps the dial honest is `exertion` and shorter fights rather than the counters
it eats. That belongs to whoever owns D4, not to a style phase. Third instrument defect this
programme has found in a suite nobody suspected, after F4 and F6.

**F9 — the engine throws four times too few leg strikes.** Population landed targeting is
**67.9% head / 28.1% body / 4.0% legs** against a real sport that runs roughly 62/22/16. The plan
asks for 15% legs, the honesty gate halves it, and leg kicks then land less often than the shots
above the waist. Recorded rather than fixed: it is a *plans* problem before it is an engine one,
which puts it with phase 5, and moving it moves the whole damage distribution.

**And the trip does not read as judo.** The takedown entry mix separates a wrestler from a striker
(singles 35% against 25%; reactive shots 12% against 21%) but not a judoka from anybody — trips run
10.9% for judo against boxing's 11.6%, because trips are clinch-only and the clinch barely happens
(§6). The plan's considered decision to leave the clinch alone has a visible cost, and this is it.

---

## 9. Phase 3 — the prediction, written first

Four items, and unlike phase 2 they share only a theme: **things the engine declares and does not
read.** §3 sizes it at 3–4 days and calls the stance magnitude the variable.

**(a) `takedownRate` is a hook nothing pulls.** It is declared in `MUL_HOOKS`, read at
`resolveTakedown`, and **no trait in the table sets it** — a resolution site with no source, the
mirror image of §5's "no read keys before their resolution sites exist". Two traits fill it, and
the hook moves to the *intent* weight where its name says it belongs: `takedownRate` should mean
how often a fighter shoots, not how well the shot goes, and putting it in both would pay twice.

**(b) Trait generation ignores the fighter it is decorating.** `generateTraits` picks uniformly
from 24 non-acquirable traits, so a `cardioMachine` with 30 `cardio` and a `headhunter` who cannot
punch are both one roll away, at roughly the rate you would expect from chance. Traits gain an
`affinity` — data, like everything else about a trait — and generation weights the pool by how well
each fits the ratings already rolled.

**(c) `stance` is stored, seeded by hand on real fighters, rendered on the fighter screen, and read
by nothing.** An open-stance matchup gives the southpaw a small edge in the landing contest,
reduced by the orthodox fighter's `fightIq` because the whole mechanism is unfamiliarity and a
smart fighter solves it. A switch-stance fighter neither gets it nor gives it.

**(d) `cageIq` is computed for every combatant in every fight and read by nobody.** It is deleted.
Its inputs — `fightIq` and `composure` — are already read directly at four sites, which is why it
was never wired up: it is a name for a thing the engine already does twice.

**What should happen:**

1. **(a) and (b) are career-shaped, not fight-shaped.** Neither moves a population outcome bound;
   what they move is how *coherent* a generated fighter reads. The measurable claim for (b) is that
   the correlation between a trait and the attribute it implies goes from ~0 to something a test
   can assert, across a generated roster.
2. **(c) is the only one that can move a distribution**, and it should move a small one: with
   southpaws at 25% of generated fighters, a stance edge worth a point or two of win rate in mixed
   matchups is worth a fraction of a point across the population. **If `firstRoundPct` or the
   finish rate moves by more than that, the magnitude is wrong and it comes down.**
3. **(d) changes no behaviour at all**, and if any test fails when it goes, that test was asserting
   the existence of a dead rating rather than a live one.
4. **Nothing here touches G1.** Phase 2 established that the fingerprint's second axis is not
   available to weapons, targeting or traits. Phase 3 is legibility and coherence work, and the
   plan should stop pretending any of it is separation work.

### 9.1 Phase 3 — landed, and it found something bigger than itself

All four items landed. The suite is green at 1,102 tests across 67 files, and every prediction held
— including the one that mattered, that the population's outcome numbers would not move: finishes
50.2% against 49.7% before, first-round 32.6% against 32.3%, which at 10,356 fights is the
resampling noise of having changed the order the dice come out in.

| | Predicted | Happened |
|---|---|---|
| 1 | (a) and (b) move coherence, not outcomes | ✅ a Cardio Machine now averages 50.2 `cardio` against the roster's 41.8; the two were the same number before |
| 2 | (c) is small, or the magnitude comes down | ✅ +1.9 / +1.2 / +0.2 points against a dull, average and smart opponent |
| 3 | (d) changes no behaviour | ✅ nothing failed when `cageIq` was deleted |
| 4 | nothing here touches G1 | ✅ and it did not pretend to |

Two things worth keeping from the work itself. The stance magnitude was **set by measurement**: 6%
on the offence term read 0.90 / 0.63 / 0.30 points, which is inside the noise of anything cheaper
than six thousand fights, and an edge nobody can measure is a field that is still dead — 10% reads
cleanly at a quarter of the sample. And `stance.test.ts` reproduced the phase-2 lesson about
*pairing*: its first cut put the stance in the seed prefix, reseeded every fight, and measured
−0.1 points while the mechanism was working perfectly.

**F10 — a trait is worth more than an attribute, and nothing had ever priced one.**

Measuring the new traits against a control turned up the scale of the old ones. Against an
identical contender over paired seeds:

```
cardioMachine     +23.4pp        chainWrestler      −1.1pp
volumeMachine     +14.6pp        lateStarter        −8.2pp
sprawlAndBrawl     +0.6pp        fastStarter       −10.5pp
ironChin           +0.6pp        headhunter        −16.1pp
finisher           +0.4pp        weightCutGambler  −16.5pp
```

**Sixty rating points of `wrestling` are worth 13.6 points of win rate. `cardioMachine` is worth
23.4, and a generated fighter can be handed three traits.** The two hooks doing it are
`fatigueRate` and `strikeOutput`, and their sensitivity is the finding underneath the finding:
`fatigueRate` 1.12 measured **−11 points** and 1.05 still measured −5.8, so every trait carrying
one as its "cost" is paying far more than whoever wrote it can have intended — which is also why
the first cut of `chainWrestler` read −8.2 while the hook it was written to exercise is worth +2.9
on its own.

Recorded rather than fixed, in `tests/statistical/trait-cost.test.ts` with two tripwires, for the
same reason phase 0 recorded rather than fixed: re-scaling those hooks moves every population
distribution in the game, and doing it inside a programme that depends on attribution would
destroy the attribution. It belongs with D4's volume/referee work, and it is now the largest
unaddressed defect the programme has found — larger than anything phases 3 through 5 propose to do.

---

## 10. What real game plans would buy — measured, before deciding when to build them

Phase 2 established that **`kickShare` is the only fingerprint axis with the range to clear G1's
0.20 threshold**, and inferred from that that the second axis has to come from phase 5 (plans) or
phase 6 (positions). That inference had a hole in it: nobody had checked whether plans could move
the *position* axes, and the check is cheap, because the mechanism already exists.

`approachWeight` (`simulate.ts`) is a real table — `wrestle` weights takedowns at 2.0 where
`pressure` weights them 0.8, and `grind` weights the clinch at 2.0 against `counter`'s 0.6. It
feeds the intent lottery directly, which is what `grapplingShare`, `controlShare` and
`submissionMix` measure. **Every AI fighter in the game carries `approach: 'pressure'`**, so that
table is a constant across the entire roster — the same shape of defect phase 2 found in targeting,
one level up.

Probed: each exemplar given the approach its art implies, against the same control on the default
plan, 400 fights per cell.

| | G1 pairs (≥0.20 on two axes) | What comes alive |
|---|---|---|
| Default plan, as shipped | **0 of 15** | `kickShare` only, on three pairs |
| Approach per art | **3 of 15** | `grapplingShare`, `controlShare`, `submissionMix` |
| Approach **and** targeting per art | **4 of 15** | the above, plus `legTargetShare` clearing its old ceiling |

```
approach per art        kickShare legTarget grapplng   subMix  control distance
boxing                      0.174    0.029    0.135    0.605    0.223    0.324
kickboxing                  0.447    0.087    0.127    0.529    0.173    0.319
karate                      0.523    0.108    0.113    0.605    0.209    0.368
wrestling                   0.224    0.039    0.309    0.392    0.413    0.265
jiuJitsu                    0.263    0.049    0.332    0.527    0.333    0.265
judo                        0.277    0.046    0.292    0.410    0.344    0.271
```

`grapplingShare` spreads from 0.13–0.24 to 0.11–0.33 and `controlShare` from 0.18–0.34 to
0.17–0.41 — on **one field per fighter**, with no engine change at all.

**Three things this settles and one it does not.**

1. **Phase 5 is a G1 phase, not only a realism phase.** It is worth three pairs on its own and four
   with targeting, where phases 1, 2 and 3 together were worth zero.
2. **Phase 6 is still needed, and now for a smaller and better-defined job.** The pairs that stay at
   zero are the *same-family* ones — jiu-jitsu against judo, kickboxing against karate — which are
   exactly the pairs §2 said Strategy A could never reach. Plans separate families; only positions
   separate members of a family.
3. **The ordering should change.** Phase 4 is the only phase that moves *career* distributions and
   §3 says its re-baselining is the work; phase 5 moves *fight* distributions for the whole world,
   and fight distributions propagate into careers. Running 4 before 5 pays the long-sim
   re-baselining twice. **5 before 4.**

What it does not settle is the cost. This probe gives every fighter a plan and leaves the control on
the default, so part of what it measures is *having a plan against somebody who has not got one* —
which is the real situation for a player with a camp, and not the situation between two AI fighters.
And the approaches here were hand-assigned by me rather than derived from the fighter, which is the
actual phase 5 problem. Neither weakens the result: **the axes moved, and they are the axes G1
needs.** What the probe cannot tell you is what happens to the finish rate when the whole world
starts wrestling, and §3's warning about that stands unchanged.

---

**The one-line version:** the engine's missing primitive is a named weapon on the strike, not a
new attribute — and the missing discipline is a test that can tell two fighting styles apart.
Build the second, then the first, and the case for growing past six disciplines makes itself.

Phase 0 built the second, and the instrument's first reading is that **the engine expresses style
in what a fighter throws and in the prose describing it, and then makes it strategically
irrelevant** — 0.277 of separation between boxing and karate on shot selection, −1.3 points of win
rate for sixty points of the attribute doing the selecting.
