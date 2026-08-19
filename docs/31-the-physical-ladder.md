# 31 — The physical ladder

**Status:** design, not yet implemented. This document defines what the five physical ratings
_mean_ before any code changes. Nothing below has been built; the measurements of the current
system are real and were taken against this repository.

> **The short version.** Physical ratings are absolute across the whole sport, so the number has to
> be defined by a physical quantity rather than by a percentile. This document defines each of the
> five as a **logarithmic scale over a measurable quantity**, gives each a **mass exponent**, and
> derives the divisional ladders as a consequence rather than authoring them. Rating 50 is the
> median professional. A heavyweight's _median_ Power is 63 and a flyweight's is 40; a heavyweight's
> median Speed is 43 and a flyweight's is 56. Those numbers are not typed in anywhere — they fall
> out of `walkingWeight^β`.
>
> The consequence that has to be accepted up front: per-clean-shot knockout hazard at the
> heavyweight median becomes **2.73×** the flyweight median, against 1.45× today. The real sport is
> near 2.6×. That is the point of the exercise.

---

## 0. What this document is for, and what it is not

It is the answer to one question: **what does Power 74 mean?** Until that has an answer that does
not mention a weight class, every other decision in the redesign is unanchored — generation has
nothing to aim at, the division ladders are opinions, and "absolute" is a slogan.

It is **not** an implementation plan for generation, the body model or character creation. Those
follow in §8, deliberately after the scale is settled.

Two rules govern everything below.

**The scale is defined by physics, and the divisional distributions are derived from it.** Nowhere
in this document is there a table saying "flyweight Power runs 38–50". There is a mass law, and
that table is its output. If the output looks wrong, the law changes — not the table.

**Existing seed data is evidence, not ground truth.** The hand-authored roster predates this
design. It is quoted below several times, always as corroboration after a number was derived
independently, and once (Strength) to say it is probably wrong.

---

## 1. Where the current model actually is

Measured over 20,000 debutants generated exactly as `world.ts:replenish` generates them:

```
                mean   p05  p50  p95  max   >=80    <=45
power           52.9    34   53   73   94   1.3%   27.2%
speed           53.8    31   53   78   99   3.8%   28.9%
cardio          48.6    26   48   72   95   1.5%   42.9%
durability      54.8    33   55   77   97   3.4%   25.4%
strength        51.4    35   51   70   98   0.8%   30.4%
```

The population spread is wider than it looks from playing — the compression is in the _created_
fighter, which is a separate code path and does cluster (Strength never exceeds 69 at any talent
tier). The defects that matter are structural rather than a matter of range.

**By division, mean / p95 / max:**

```
        power        speed        cardio     durability     strength
FLW    50/70/85     54/78/95     49/73/90     53/76/88     47/61/73
LW     52/72/86     54/78/91     50/73/93     54/78/94     51/66/78
HW     62/81/94     54/78/90     43/66/87     60/83/97     67/81/98
```

Speed is **identical at every weight** — mean 54, p95 78, at flyweight and at heavyweight alike.
`ceilingsFromNaturals` reads `cap(explosiveness, 0.25)` with no mass term at all. On a scale
`docs/02` declares absolute, that says a 255 lb man and a 136 lb man move at the same speed, which
is the single clearest violation of the design's central claim in the codebase.

Cardio carries only a `framePenalty` worth 6 points across the whole ladder. Power and Strength do
ladder — through `frame` — but `frame` is `walkingWeight / 300 × 100` and `walkingWeight` is
`limit × rng.range(1.04, 1.15)`, so **frame is a proxy for division and carries no independent
information**. Every lightweight has frame 55 ± 3. There is no big lightweight.

And the bodies are wrong. `heightInches = remap(limit, 115, 265, 63, 76)` is linear in weight where
mass scales as roughly height³:

```
              generated ht    hand-authored ht    hand-authored ape index
FLW               63.9"             65.4"              +2.5 (range 1..5)
LW                66.5"             70.1"              +2.4 (range -1..6)
MW                69.1"             72.3"              +3.0 (range 0..6)
HW                76.0"             75.6"              +3.1 (range 1..9)
```

Every generated fighter below heavyweight is three to four inches shorter than the fighters the
same game ships by hand, and generated reach is height plus noise where the real distribution runs
+2 to +3. Nobody has noticed because **height and reach are read by exactly one thing in the
codebase** — the tale-of-the-tape strip on `FightScreen`. They are currently cosmetic. That is
accepted as a reason to fix them, not as a reason to leave them.

---

## 2. How the scale is defined

### 2.1 The rating is logarithmic in the underlying quantity

The engine already consumes ratings through `effect(r, K) = exp(K(r − 50) / 50)` — an exponential
in the rating. So the rating is _already_ being treated as a log-scale quantity everywhere it is
used. Defining it that way explicitly costs nothing and buys the whole ladder:

```
quantity(r) = quantity(50) × 2^((r − 50) / D)
```

`D` is **points per doubling** and is the only free parameter per attribute. Equal steps in rating
are equal _ratios_ of physical capability, which is what makes the scale meaningful across a range
where a heavyweight punches twice as hard as a flyweight.

This also fixes a thing the current scale gets wrong by accident. A linear scale has to choose
between resolving the middle of the population and reaching the extremes; a log scale does not,
which is why Power 99 can be Ngannou and Power 40 can be a flyweight without the middle of the
scale becoming useless.

### 2.2 The pivot

**Rating 50 is the median professional of that sex, pooled across all divisions.**

Pooled, not per-division — that is what makes the scale absolute. The median male professional is
taken to walk around **180 lb** and the median female professional **140 lb**, both of which are
close to the middle of the respective division ladders.

Sex re-anchors the pivot and nothing else. This is a deliberate exception to absoluteness and it is
forced: on a single male-anchored scale, applying the honest strength and force ratios puts the
median women's strawweight at **Power 5 and Strength −2**. Those numbers are arguably true and are
completely unusable — the effect curve would make every women's fight a fifteen-minute decision,
and the profile screen would read as an insult. Men and women never fight each other, so no
mechanical consumer of the scale ever needs to compare across it. **Within a sex the scale is
strictly absolute across every division**, which is the property the design actually needs.

_(§9.1 records this as the one open question worth overruling me on.)_

### 2.3 The mass law

```
rating(fighter) = 50 + D · β · log₂(mass / pivotMass) + individual
```

`β` is the allometric exponent of the underlying quantity against body mass. `individual` is
everything else — physiology, training state, age, technique — and is where all the variance lives.

The mass term is not a bonus applied to a division. It is a term in the expression of an absolute
quantity, computed from **this fighter's current competing mass**, which is why moving weight class
changes it and why it changes by the right amount for the mass actually gained.

---

## 3. The five attributes

### 3.1 Power

> **Absolute peak force delivered into a target on a clean strike.**

Not punching effectiveness. Effectiveness remains `raw power × mechanics × weapon × plantedness ×
fatigue × flushness`, which is what `damage.ts` already computes. A fighter with Power 88 and
Striking 31 has enormous force and no reliable way to land it cleanly, and that fighter should
exist.

|          |                                               |
| -------- | --------------------------------------------- |
| Quantity | peak impulse delivered on a clean head strike |
| **β**    | **+0.60**                                     |
| **D**    | **43 points per doubling of force**           |

β = 0.60 rather than 0.67 because strike force is effective mass × velocity and velocity is itself
mass-penalised, so it sits below the pure cross-sectional-area exponent that governs Strength.

**Semantic anchors:**

| Rating | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| 99–100 | The hardest recorded hitters in the sport's history. Ngannou. One or two alive.      |
| 90–95  | Elite heavyweight force. Ends any fight in any division from any position.           |
| 82–89  | Enormous absolute force. Concentrated at 185 lb and above.                           |
| 72–81  | Genuinely dangerous anywhere. The best puncher in most lighter divisions.            |
| 62–71  | Above-average professional force. Comfortably fight-ending at welterweight.          |
| 50     | Median professional, all divisions pooled.                                           |
| 38–49  | The whole flyweight and bantamweight middle. Not a lack of ability — a lack of mass. |
| 20–37  | Cannot hurt a professional.                                                          |

Note the fifth row. **Most of the two lightest men's divisions sit in the 38–49 band**, and that
band's current label in `attributes.ts` is "Below level — a hole opponents will find". That label is
wrong under an absolute scale and is listed in §5 as a thing to replace: for a flyweight, Power 46
is not a hole, it is a flyweight.

### 3.2 Strength

> **Absolute functional force in a grappling exchange** — grips, frames, clinch, top pressure.

|          |                                     |
| -------- | ----------------------------------- |
| Quantity | maximal functional force production |
| **β**    | **+0.67**                           |
| **D**    | **50 points per doubling**          |

β = 0.67 is the classical cross-sectional-area exponent and the one competitive strength sports use
to compare athletes across bodyweight. Nothing here is invented.

This produces the widest divisional spread of the five — **31 rating points** from flyweight to
heavyweight — and it is the number most likely to feel wrong on first reading. The hand-authored
roster puts it at 11 points. I think the hand-authored roster is wrong here specifically, and the
reason is instructive: Strength is the attribute where division-relative thinking is hardest to
resist, because "he is unbelievably strong" is a thing you say about a fighter _relative to his
opponents_. In absolute terms a heavyweight grappler is not marginally stronger than a flyweight
grappler; he is roughly one and a half times stronger, and the scale says so.

This is the parameter I would expect Phase C play-testing to move first, and §8 treats `D` and `β`
as tunables rather than as facts.

### 3.3 Speed

> **Neuromuscular quickness** — hand and foot velocity, movement initiation, reaction.

Explicitly not technique. `Speed 91 / Striking 28` is an astonishing athlete who cannot fight, and
that fighter must be constructible.

|          |                                       |
| -------- | ------------------------------------- |
| Quantity | limb and whole-body movement velocity |
| **β**    | **−0.20**                             |
| **D**    | **70 points per doubling**            |

Two things about this row. The exponent is **negative but small** — mass costs quickness, but far
less than it buys force. And `D` is much larger than Power's, which is the important half:
**humans vary far less in quickness than in force.** A doubling of hand speed is not a thing that
happens between two trained athletes; a doubling of punch force plainly is. A flat `D` across the
five attributes would have been the single biggest error available here.

The negative exponent covers both limb velocity (weakly mass-penalised) and whole-body movement,
level changes and footwork (more strongly penalised). −0.20 is the blend.

**Semantic anchors:**

| Rating | Meaning                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| 99–100 | The fastest hands and feet in the sport, at any weight.                                                      |
| 90+    | Elite quickness in absolute terms. Overwhelmingly, but not exclusively, small fighters.                      |
| 80     | Extraordinary for a heavyweight (+37 over his division's median). Elite-but-not-freak for a flyweight (+24). |
| 50     | Median professional.                                                                                         |
| 43     | The heavyweight median. A perfectly ordinary heavyweight, and slow next to a lightweight.                    |

That third row is the design goal from the brief, stated as an output of the model rather than as an
aspiration.

### 3.4 Cardio

> **MMA-specific sustained work capacity**, mass-relative.

|          |                                                |
| -------- | ---------------------------------------------- |
| Quantity | sustainable work rate per unit of body carried |
| **β**    | **−0.25**                                      |
| **D**    | **55 points per doubling**                     |

β = −0.25 is `0.75 − 1.0`: absolute aerobic capacity scales as mass^0.75, and the cost of moving
your own body scales as mass^1.0. A fighter must move his own mass, so what matters is the
difference. This is the same physiology `strengthCardioCost` already models as the interference
effect, arriving from the other direction.

Cardio is the attribute where the **individual term should dominate the mass term** — conditioning,
`aptitudes.conditioning`, camp history and weight-cut depletion should collectively swamp 13 points
of divisional shift. A heavyweight with a genuine engine must be able to reach the seventies.

### 3.5 Durability

> **Resistance to being stopped by accumulated and acute trauma.**

|          |                                                                 |
| -------- | --------------------------------------------------------------- |
| Quantity | impulse required to produce a given degree of concussive effect |
| **β**    | **+0.10**                                                       |
| **D**    | **45 points per doubling**                                      |

Almost mass-neutral, which is the design claim from the brief and is also the physically honest
answer: head and neck mass resist head acceleration, so there is a small positive term, and
everything else about a chin is neurological and unrelated to body size. Four points across the
whole ladder.

The asymmetry between this (β = +0.10) and Power (β = +0.60) **is** the reason heavyweight is more
dangerous. It is not a separate rule; it is arithmetic.

Durability stays visible. What it does _not_ get is trainability: `ARRIVAL` already arrives at 0.97
of ceiling at twenty and the career erodes it through `headTrauma`, and that is the correct shape.
Generation is the only part that needs work — a broad initial spectrum, 38 to 91, from
`neurologicalRobustness` and `structuralRobustness` rather than from a single `constitution`.

### 3.6 The parameter table

```
attribute     quantity                              β        D     coefficient
                                                                 (pts per ln mass)
power         peak strike impulse                +0.60      43        +37.2
strength      maximal functional force           +0.67      50        +48.3
speed         limb & whole-body velocity         −0.20      70        −20.2
cardio        mass-relative work capacity        −0.25      55        −19.8
durability    impulse to concuss                 +0.10      45         +6.5
```

Ten numbers. Every divisional distribution in the game is a consequence of these ten numbers, the
pivot masses, and the individual variance around them.

---

## 4. The ladders, derived

These tables are **outputs**, not inputs. They describe the _median professional_ of each division —
half of a real division sits above each row, and elite fighters sit well above it.

### Men (pivot 180 lb)

| Division          | walks at | Power | Speed | Cardio | Durability | Strength | mean |
| ----------------- | -------: | ----: | ----: | -----: | ---------: | -------: | ---: |
| Flyweight         |      136 |    40 |    56 |     56 |         48 |       36 | 47.1 |
| Bantamweight      |      147 |    42 |    54 |     54 |         49 |       40 | 47.9 |
| Featherweight     |      158 |    45 |    53 |     53 |         49 |       44 | 48.6 |
| Lightweight       |      169 |    48 |    51 |     51 |         50 |       47 | 49.3 |
| Welterweight      |      185 |    51 |    49 |     49 |         50 |       51 | 50.3 |
| Middleweight      |      201 |    54 |    48 |     48 |         51 |       55 | 51.1 |
| Light Heavyweight |      222 |    58 |    46 |     46 |         51 |       60 | 52.2 |
| Heavyweight       |      255 |    63 |    43 |     43 |         52 |       67 | 53.6 |

### Women (pivot 140 lb)

| Division      | walks at | Power | Speed | Cardio | Durability | Strength | mean |
| ------------- | -------: | ----: | ----: | -----: | ---------: | -------: | ---: |
| Strawweight   |      126 |    46 |    52 |     52 |         49 |       45 | 48.9 |
| Flyweight     |      136 |    49 |    51 |     51 |         50 |       49 | 49.7 |
| Bantamweight  |      147 |    52 |    49 |     49 |         50 |       52 | 50.5 |
| Featherweight |      158 |    55 |    48 |     48 |         51 |       56 | 51.3 |

### 4.1 The ladder rotates, and also tilts

Power + Strength runs **76 → 130** up the men's ladder. Speed + Cardio runs **112 → 86**. So the
composition rotates hard, which is the whole point — but the rotation does not balance: the mean
physical rating rises **47.1 → 53.6**, about 6.5 points.

That is correct and should not be tuned away. A heavyweight is more physical animal than a
flyweight in absolute terms; he is not a better fighter. But it has a consequence, in §5.

### 4.2 Overlap is preserved and must be checked for

These are _medians_. With individual standard deviations in the 10–14 range the distributions
overlap heavily, which is required: a freakish heavyweight at Speed 70 is genuinely quicker than a
median lightweight at 51, and the diagnostics in §6.4 assert that this remains possible rather than
merely permitted.

The rule the diagnostics enforce: **no division may be strictly above or strictly below another on
any attribute.** If every featherweight is faster than every middleweight, the model has become a
lookup table.

### 4.3 Corroboration

Derived independently above, then compared with the hand-authored roster:

| Attribute  | derived FLW→HW shift | hand-authored FLW→HW shift |
| ---------- | -------------------: | -------------------------: |
| Power      |                  +23 |                        +24 |
| Cardio     |                  −13 |                        −17 |
| Speed      |                  −13 |                        −10 |
| Durability |                   +4 |                         −3 |
| Strength   |              **+31** |                    **+11** |

Four of five land close. Strength does not, and §3.2 argues the hand-authored value is the one in
error. This is corroboration and nothing more — none of these parameters was fitted to that roster.

### 4.4 What it does to knockouts

Per-clean-head-strike knockdown hazard, at each division's median fighter against himself, relative
to the pooled median pair:

| Division          | Power | Durability | hazard |
| ----------------- | ----: | ---------: | -----: |
| Flyweight         |    40 |         48 |  ×0.64 |
| Bantamweight      |    42 |         49 |  ×0.72 |
| Featherweight     |    45 |         49 |  ×0.81 |
| Lightweight       |    48 |         50 |  ×0.90 |
| Welterweight      |    51 |         50 |  ×1.04 |
| Middleweight      |    54 |         51 |  ×1.19 |
| Light Heavyweight |    58 |         51 |  ×1.40 |
| Heavyweight       |    63 |         52 |  ×1.74 |

**Heavyweight / flyweight = 2.73×.** Today it is 1.45×. Real UFC KO/TKO rates by division run
roughly 18% at flyweight to 47% at heavyweight — a ratio near 2.6×.

The model was not fitted to that. It is what `β_power = 0.60` against `β_durability = 0.10` produces
when read through the engine's existing curve constants. It is the strongest single piece of
evidence that the parameter set is close to right, and it is the reason `roster-profile.test.ts`
must break.

`BASE_KD_HAZARD` will still need a **global re-anchor** after this lands — the pooled mean hazard
moves, even though the pooled mean rating does not — but it must not acquire per-division variants.
One constant, division-aware _tests_.

---

## 5. What the absolute scale breaks

Three things in the codebase assume, correctly under today's flat ladder, that a rating means the
same thing about _quality_ regardless of who holds it. Under a rotating ladder they stop being true.

### 5.1 `overallRating` becomes division-biased

`overallRating` is a flat weighted mean over all fifteen absolute attributes. The physical group
carries 4.9 of 14.9 weight, so a 6.5-point shift in mean physical is worth roughly **+2.1 overall
points to a heavyweight over a flyweight**, for free, before either of them has learned anything.

It is consumed in ~20 places. Most are intra-division (matchmaking, `boutAgreements`, `heat`,
`aftermath` all compare two fighters in the same division) and are unaffected. The cross-division
consumers are the problem: `the-pyramid-holds` ladders promotion tiers on pooled overall,
`attention.ts` uses a global `>= 62` notability threshold, `generations.test.ts` asserts global
thresholds of 68/74/65, and `promoterRead` describes fighters against absolute bands.

**Recommendation:** keep `overallRating` exactly as it is — it is domain-honest, a sum of absolute
qualities — and add a second function for comparisons:

```
competitiveRating(fighter)   // technical & mental absolute; physicals read as a
                             // z-score against the fighter's own division ladder
```

Then migrate every cross-division consumer to it. This is the user's own domain-truth /
mode-presentation split applied one level up: the _attribute_ is absolute truth, and "how good is
he" is a comparison, and a comparison needs a reference population.

### 5.2 `traitFit` will hand traits out by division

```
fit *= 1 + (weight × (attributes[key] − 50)) / 20
```

The pivot is a hard-coded 50. Once heavyweight Power medians sit at 63 and flyweight Cardio medians
at 56, `powerPuncher` and `ironChin` migrate to heavyweights and `cardioMachine` migrates to
flyweights — not because of who those fighters are, but because of where their division sits on the
scale. Since a trait is the most legible thing on a profile screen, this would be highly visible.

**Fix:** `traitFit` reads the fighter's deviation from _their own division's_ expected value, not
from 50.

### 5.3 The rating bands stop describing quality

`RATING_BANDS` calls 38–49 "Below level — a hole opponents will find". Under the new ladder that
band contains the ordinary Power of two entire men's divisions. The bands are consumed by the UI's
colouring, by scouting report phrasing, and by a statistical test.

**Fix:** bands stay absolute for the technical and mental attributes, where they are still true, and
physical attributes are banded against the division ladder for display. Same split as §5.1 — the
number is absolute, the _adjective_ is comparative.

---

## 6. Calibration methodology

### 6.1 Phase order

**A — Ladder.** This document. Settle the ten parameters and the pivots before anything is built.

**B — Calibration roster.** A fresh, deliberately-authored UFC-only roster rated against §3 and §4
from scratch. Explicitly **not** a copy of the existing seed ratings, and existing `attrs()` values
are not to be consulted while authoring, because that is how the old scale would be laundered into
the new one. Target ~90 fighters, roughly a dozen per men's division and six per women's, and it
must contain by construction:

- two heavyweight athletic freaks (Speed 68+ at 250 lb) and two heavyweight plodders
- a flyweight whose Power is freakish _for a flyweight_ — 62 or so, and nowhere near a heavyweight's
- two cardio outliers at opposite ends of the ladder
- a physically unremarkable elite technician in a middle division (all five physicals 45–58, ranked)
- a huge lightweight with a brutal cut and a small welterweight with none
- an unusually strong grappler at 145 and an unusually weak one at 205
- at least one fighter per division whose profile contradicts their division's median shape

Each entry carries a `notes` field justifying its numbers against §3's anchors, exactly as the
current seed files do. That justification is the actual deliverable; the numbers are downstream of
it.

**C — Simulate and play.** Run the engine over that roster. Statistical output _and_ individual
fights. The questions are the ones in the brief and they are not all statistical: does a heavyweight
fight feel more dangerous; does a freak heavyweight feel freakish without holding 90s everywhere;
does a division move read as a body change.

**D — Iterate the ladder.** Change `β` and `D`. Do **not** distort `damage.ts` constants to preserve
targets that were measured under the old model.

**E — Lock, then rebuild the world.** Only after C and D converge does the wider generated roster
get regenerated against the ladder.

### 6.2 Division-aware calibration, as a general rule

> **Where a metric varies by division in the real sport, calibrate and assert it by division. The
> pooled aggregate is a secondary sanity check, never the primary target.**

The current suite inverts this, and it is not close: **19 of the 29 division references in the entire
test suite are `mens-lightweight`.** Two are heavyweight, two flyweight, one each for welterweight,
middleweight and light heavyweight. `roster-profile.test.ts` pools all 35,627 same-division pairings
into six global bounds. It is a single-division test suite wearing a population's clothes, and it
would pass unchanged on a world where every division behaved identically — which is exactly the
failure mode this redesign is trying to leave.

Metrics that should become per-division: KO/TKO rate, submission rate, decision rate, finish rate,
first-round finish rate, knockdown frequency, mean fight duration, significant-strike volume and
accuracy, takedown attempts and success, control time, and every physical attribute distribution.

Metrics that should stay pooled: draw rate, scoring consistency, determinism, corner symmetry,
record integrity, save size.

### 6.3 The bound style

Per-division bounds on a ~90-fighter calibration roster are noisier than pooled bounds on 35,627
fights. Two consequences: assert **ordering and ratios** wherever possible rather than absolute
levels (`koRate(HW) > koRate(FLW) × 1.8` survives roster churn in a way that
`koRate(HW) ∈ [42%, 52%]` does not), and put the measured value in the failure message so a broken
bound is diagnosable without re-running the measurement by hand.

### 6.4 Permanent diagnostics

A new `tests/statistical/generation-profile.test.ts`, reporting by division, by background and by
attainment:

- height, reach, ape index, walking weight, cut severity
- Power, Speed, Cardio, Durability, Strength — mean, p05, p50, p95, max, and share above 80

and asserting the correlation structure that the current model has lost:

| Check                                                           | Guards against                              |
| --------------------------------------------------------------- | ------------------------------------------- |
| height ↔ walking weight, ρ > 0.5                                | bodies decoupling from geometry             |
| frame ↔ walking weight at fixed height, ρ > 0.4                 | frame collapsing back into a division proxy |
| frame ↔ division, ρ < 0.7                                       | the same, from the other side               |
| division ↔ Power, ↔ Strength: strongly positive                 | the ladder flattening                       |
| division ↔ Speed, ↔ Cardio: clearly negative                    | the current defect returning                |
| Power ↔ Strength, 0.3 < ρ < 0.8                                 | one master athletic scalar                  |
| Power ↔ Speed, 0.1 < ρ < 0.6                                    | the same                                    |
| Cardio ↔ Power, ρ < 0.4                                         | the same                                    |
| no division strictly above another on any attribute             | the ladder becoming a lookup table          |
| national sprinters faster than club BJJ players, by > 12 points | backgrounds not selecting                   |
| national distance runners: Cardio p05 > 55                      | selection effects being cosmetic            |
| bantamweight mean height ∈ [66", 69"]                           | the anthropometry regressing                |

The last row is the cheap one that would have caught the current three-inch height defect on the day
it shipped.

---

## 7. Test and constant classification

### Still valid

These assert engine behaviour given ratings, and are ratings-agnostic.

| Item                                                                         | Note                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ratings/curve.test.ts`                                                      | Pure maths.                                                                                                                                                                                |
| `balance.test.ts` — symmetry, close decisions, prep/camp value, upset bounds | Archetype-based. Depends on the archetypes being coherent (see below).                                                                                                                     |
| `styles.test.ts`                                                             | Fingerprint separation between disciplines. Archetype-based throughout.                                                                                                                    |
| `risk.test.ts`, `fouls.test.ts`, `stance.test.ts`, `trait-cost.test.ts`      | Archetype-based.                                                                                                                                                                           |
| `broadcast.test.ts`, `commentary-parity.test.ts`, `reduced-fidelity.test.ts` | Presentation and fidelity parity.                                                                                                                                                          |
| `arrival.test.ts` — share-of-ceiling assertions                              | Ratio claims, which the new model preserves. **Extend** with the background-dependent cases (a wrestler realising ~0.9 of his strength ceiling against a distance runner realising ~0.65). |
| `generation.test.ts` — `traitFit` direction                                  | Still true once the pivot is fixed.                                                                                                                                                        |
| `save-size.test.ts`                                                          | Ceilings, not targets.                                                                                                                                                                     |

### Should become division-aware

| Item                                                        | Currently                                   | Should become                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `roster-profile.test.ts` — all six bounds                   | Pooled over 35,627 same-division pairings   | Per-division finish/KO/sub/decision/first-round profile, plus the pooled bound as a secondary check |
| `twenty-years.test.ts` — finish distribution, rating drift  | Global                                      | Per-division, with divisional drift bounds                                                          |
| `generations.test.ts` — overall thresholds 68 / 74 / 65     | Global `overallRating`                      | `competitiveRating`, per division                                                                   |
| `the-pyramid-holds.test.ts` — "keeps the standard laddered" | Pooled `overallRating` across tiers         | `competitiveRating`, or division-mix-corrected                                                      |
| `talentSpread.test.ts`                                      | 8,000 fighters, all lightweight             | Sampled across the ladder; assert potential shape per division                                      |
| `attention.ts` — `overallRating >= 62` notability gate      | Global absolute threshold                   | `competitiveRating`                                                                                 |
| `promoterRead.ts`                                           | Absolute `ratingBand` phrasing on physicals | Division-relative phrasing for physicals, absolute for technical                                    |

### Encodes an old assumption — replace

| Item                                                                            | Why it has to go                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateNaturals`: `frame = walkingWeight / 300 × 100`                         | Frame is a division proxy. The relationship inverts: frame is primitive, walking weight is derived.                                          |
| `generateFighter`: `walkingWeight = limit × rng.range(1.04, 1.15)`              | Division determines the body. Backwards.                                                                                                     |
| `heightInches` / `reachInches` linear remaps, both generators                   | Linear in weight where mass scales as height³; produces fighters 3–4" short of the hand-authored roster, and ape index ≈ 0.                  |
| `settledWalkingWeight = limit × 1.07`                                           | Replaces the body model with the division. Blocks every weight-fit mechanic.                                                                 |
| `ceilingsFromNaturals`: `speed: cap(explosiveness, 0.25)`                       | No mass term. The clearest violation of absoluteness in the codebase.                                                                        |
| `naturalsCentre(tier)` driving all five naturals                                | One scalar makes a fighter simultaneously athletic, coachable and worthy of a better promotion. Split into athletic and skill-learning axes. |
| `TALENT_TIERS` (Freak / Natural / Grinder)                                      | Removed by decision. Only consumed by `disciplinesForTalent`, `attainmentsForTalent` and the naturals centre — a small removal.              |
| `BUILDS` (Rangy / Balanced / Powerful) + `BUILD_NATURALS`                       | Replaced by height / reach / frame.                                                                                                          |
| Physical keys in `ALLOCATABLE`                                                  | Head Start stops buying genetics. Two-line change plus UI.                                                                                   |
| `traitFit` pivot at 50                                                          | §5.2. Hands traits out by division once the ladder rotates.                                                                                  |
| `overallRating` as the cross-division comparator                                | §5.1. Keep the function, add `competitiveRating`, migrate the cross-division callers.                                                        |
| `RATING_BANDS` applied to physicals                                             | §5.3. "Below level" would describe the ordinary Power of two divisions.                                                                      |
| `massChangeEffect` flat table                                                   | Double-counts once mass feeds expression directly. §8, step 11.                                                                              |
| `cutSeverity`'s single `0.18` denominator                                       | One fixed percentage for every body. Ignores frame, lean mass and how much of the excess is actually cuttable.                               |
| `BASE_KD_HAZARD = 0.0158`                                                       | Not wrong in kind — needs a global re-anchor after the ladder lands. Must stay one constant.                                                 |
| `ARCHETYPES.bomber` — Power 99, Strength 88, `mens-lightweight`, walking 170 lb | Under absoluteness this is not a person. Must become a heavyweight.                                                                          |
| `makeFighter` defaults — 170 lb, 70", 72", frame 50, for every division         | Every test fighter has the same body regardless of the division they are placed in.                                                          |

---

## 8. Implementation plan

Mapped to the agreed sequence. File-level, so the shape of each step is visible before it starts.

**1. Ladder** _(this document)_ — agreement on §3's ten parameters, the two pivots, and the sex
question in §9.

**2. Body geometry.** `progression/body.ts` (new): height distributions per sex, ape index
distribution, and the `walkingWeight = f(height, frame, composition)` relation. Replaces the remaps
in `generation.ts` and `createFighter.ts`. Diagnostics from §6.4 land with it, so the next nine steps
are measured rather than asserted.

**3. Split the talent axes.** `GenerationOptions.tier` becomes two: an athletic axis and a
skill-learning axis, weakly correlated (ρ ≈ 0.3). `world.ts:replenish` and `depth.ts` select on the
skill axis, because a promotion signs fighters, not genotypes. This alone produces most of the
diversity the brief asks for.

**4. Body model.** Frame becomes an independent natural; walking weight is derived. `cutSeverity`,
`lightestViableDivision` and a new weight-fit appraisal read the derived body. `Naturals` gains
`skeletalFrame`, `musclePotential`, `leanness`, splits `constitution` into `neurologicalRobustness`
and `structuralRobustness`, and folds `injuryProneness` into the latter — 7 fields to 10, about
64 KB on an 858-fighter save, roughly 2%.

The forward model is the _only_ body model: `sampleBodyForDivision(division, rng)` is rejection
sampling on it, so newgen and creator provably cannot diverge.

**5. Calibration roster.** Per §6.1 Phase B.

**6. Mass effects on the absolute physicals.** `ceilingsFromNaturals` gains the §3.6 mass law for all
five. Speed and Cardio are the new ones; Power and Strength are re-derived rather than assumed
correct.

**7. Simulate, play, iterate.** Per-division calibration. `roster-profile.test.ts` rewritten,
`BASE_KD_HAZARD` re-anchored globally.

**8. Lock the scale.** `docs/02` rewritten to match; this document becomes canonical.

**9. Backgrounds → priors and realisation.** `arrivalFactor(key, age)` becomes
`arrivalFactor(key, age, history)`. Split `trackAndField` into sprint/jumps and throws, and
`enduranceSport` into rowing and distance running. `DISCIPLINE_META.naturals` becomes a distribution
shift rather than a fixed lean.

**10. Character creation.** Remove talent tiers, builds and physical allocation. Add height, reach,
frame and a live Weight Fit panel with the five verdicts from the brief.

**11. Weight-class movement.** `massChangeEffect` deleted; `settleWeight` moves _mass_ and the
physicals re-express from it. Underlying capability never moves.

**12. Rebuild the world.**

Steps 2, 3 and 6 carry most of the value and none of them require the creator work.

### RNG and baselines

Every new roll gets its own `rng.fork(label)`, per the existing convention, so that adding a
physiological variable does not reshuffle unrelated draws. Long-sim baselines and seeded fixtures
will still move at steps 4 and 6, and that re-baselining is deliberate rather than a regression.

---

## 9. Open questions

**9.1 The sex pivot.** §2.2 re-anchors the pivot per sex, because a single male-anchored scale puts
the median women's strawweight at Power 5. The alternative — one scale for everybody, women's
divisions rating 20–35 lower on Power and Strength — is strictly more absolute and, I think,
unplayable. This is the decision most worth overruling me on, and it should be made before the
calibration roster is authored, because it changes every women's entry in it.

**9.2 Strength's spread.** 31 points from flyweight to heavyweight is the derived figure and the
hand-authored roster says 11. §3.2 argues the roster is wrong. If play-testing disagrees, `D` for
Strength is the first parameter to move.

**9.3 The mean-physical tilt.** §4.1: heavyweights end up 6.5 points of mean physical above
flyweights, because mass gives more to Power and Strength than it takes from Speed and Cardio. The
recommendation is to accept it and fix `overallRating` (§5.1) rather than to bend the exponents.
Worth confirming that is the preferred trade.

**9.4 Where the physical ladder stops applying.** Cardio is the one attribute whose mass term
(−13 points) is small next to its individual variance. It may be better modelled as capacity
(mass-scaled) × conditioning (not mass-scaled), which is a slightly different equation from the
other four. Deferred to step 6.
