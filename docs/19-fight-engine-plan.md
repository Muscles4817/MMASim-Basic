# 19 — Making the fight engine express style

**Status:** proposal, produced from the four reviews in [`reviews/`](reviews/) plus an independent
trace of the engine. Not yet approved. Decision points in §4 are open.

> Findings marked **verified** were checked directly against source. The two measurements this
> plan leans on — the clinch rate and the 2026 roster profile — have both been independently
> reproduced (doc 18 §5), so §6's contingency branches do not fire.

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
| **0** | Era fix, draw-bound fix, knife-edge bounds, **fingerprint suite**, guard-player archetype | 3–4 days | none — pure measurement |
| **1** | **`Weapon` primitive**, kick profile, weapon×target stats, **commentary parity test** | 4–6 days | moves finish rate; 2 files |
| **2** | `strikeLean` fix, tendencies drive selection, takedown entry becomes a recorded fact | 4–6 days | first change to who wins |
| **3** | `takedownRate` traits, attribute-aware trait generation, `stance` consumer, kill `cageIq` | 3–4 days | low; stance magnitude is the variable |
| **4** | Split the striking training focus; persistence assertion | 1–2 weeks | career distributions; long-sim re-baseline |
| **5** | Real game plans for the world; reads from real tendencies; **re-ask granularity with a number** | 1–2 weeks | largest single distribution move; ship alone |
| **6** | Strategy B — standing sub-states, two-sided clinch, then attributes | 3–6 weeks | a real project |

**Phase 0** is first because without the fingerprint suite there is no falsifiable claim in the
rest of the plan, and without the era fix you tune against a 139-fighter world nobody plays.
Expect the 2026 profile to fail its first bounds — that is the point; you are recording a
baseline, not defending one.

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

## 4. Decision points — open, for the owner

**D1 — `Weapon` enum, or just thread `isKick`?** → *Recommend the enum.* Threading the boolean is
~2 days cheaper, re-entrenches the wrong scope, leaves the clinch knee and ground elbow
unnameable, leaves F1 unfixed, and makes the parity test harder to write because there is still no
ground-truth field to compare prose against.

**D2 — Does commentary read the fighter, or read the event?** → *Recommend the event, strongly.*
If the narrator picks the technique *and* the resolver picks the technique, they are two
independent draws that can disagree, with no ground truth — the parity test becomes literally
unwritable. Resolution decides, records, and passes. Same felt outcome, structurally different
code. This is the sharpest disagreement with any of the four reviews.

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

**The one-line version:** the engine's missing primitive is a named weapon on the strike, not a
new attribute — and the missing discipline is a test that can tell two fighting styles apart.
Build the second, then the first, and the case for growing past six disciplines makes itself.
