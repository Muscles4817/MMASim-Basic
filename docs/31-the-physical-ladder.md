# 31 — The physical ladder

**Status:** **provisionally signed off, v2.1.** The scale below is agreed and implementation may
proceed against it. Three groups of parameters are marked **calibration-sensitive** (§8.4) — they are
hypotheses to be tested, not settled truth. The measurements of the current system are real and were
taken against this repository.

> **Sequencing rule — read before touching any constant.** **No fight-engine constant is to be
> recalibrated until body geometry lands.** `BASE_KD_HAZARD`, the weapon table, `DECLINE_RATE` and
> every bound in `roster-profile.test.ts` stay exactly where they are through steps 2, 3 and 4 of
> §12.
>
> The ladder says what a rating should mean. It cannot be exercised until the generator is feeding
> it realistic humans, and today it is not: heights are three to four inches short below
> heavyweight, ape index is zero, and frame is a proxy for division. Calibrating the engine against
> an intermediate body model means calibrating it twice and believing the first answer in between.
> Step 7 is where the questions "does heavyweight knock out too much" and "have submissions
> collapsed at 205" become askable. Not before.

> **The short version.** Each physical rating is a **logarithmic scale over a measurable quantity**.
> Two numbers per attribute define it: `D`, points per doubling of that quantity, and `β`, its
> allometric exponent against body mass. Rating 50 is the median professional of that sex. Every
> divisional distribution in the game is then an output of those ten numbers rather than an authored
> table.
>
> Three things fall out that could not have been typed in. The median heavyweight's Power is 63 and
> the median flyweight's is 40. One standard deviation is **about ten rating points on all five
> attributes**, which nobody chose. And per-clean-shot knockdown hazard at the heavyweight median
> becomes **2.73×** the flyweight median, against 1.45× today — the real sport is near 2.6×.

**What changed in v2.** `D_strength` 50 → 46, because 50 pushed the best heavyweight past 100.
Standard deviations are now _derived_ from coefficient of variation rather than chosen. Power,
Strength and Durability read **lean** mass while Speed and Cardio read **total** mass, which is what
makes a bad bulk cost speed without buying force. The sex pivot is extended to all five physicals
and explicitly denied to the other ten attributes. And the parts v1 skipped — landmark meanings,
empirical anchors, full percentile distributions, named calibration placements, weight-move
arithmetic, a grounded/provisional split and a falsification list — are §3 through §9.

---

## 0. What this document is for

It answers one question: **what does Power 74 mean?** Until that has an answer that does not mention
a weight class, everything else in the redesign is unanchored — generation has nothing to aim at,
the division ladders are opinions, and "absolute" is a slogan.

Two rules govern everything below.

**The scale is defined by physics; the divisional distributions are derived from it.** Nowhere in
this document is there a hand-written table saying "flyweight Power runs 38–50". There is a mass
law, and that table is its output. If the output looks wrong, the law changes — not the table.

**Existing seed data is evidence, not ground truth.** The hand-authored roster predates this design.
It is quoted as corroboration, always after a number was derived independently, and once (Strength)
to say it is probably wrong.

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

**By division, mean / p95 / max:**

```
        power        speed        cardio     durability     strength
FLW    50/70/85     54/78/95     49/73/90     53/76/88     47/61/73
LW     52/72/86     54/78/91     50/73/93     54/78/94     51/66/78
HW     62/81/94     54/78/90     43/66/87     60/83/97     67/81/98
```

Speed is **identical at every weight** — mean 54, p95 78, at flyweight and at heavyweight alike.
`ceilingsFromNaturals` reads `cap(explosiveness, 0.25)` with no mass term at all. On a scale
`docs/02` declares absolute, that says a 255 lb man and a 136 lb man move at the same speed.

Cardio carries only a `framePenalty` worth 6 points across the whole ladder. Power and Strength do
ladder — through `frame` — but `frame` is `walkingWeight / 300 × 100` and `walkingWeight` is
`limit × rng.range(1.04, 1.15)`, so **frame is a proxy for division**. Every lightweight has frame
55 ± 3. There is no big lightweight.

And the bodies are wrong. `heightInches = remap(limit, 115, 265, 63, 76)` is linear in weight where
mass goes as roughly height³:

```
              generated ht    hand-authored ht    hand-authored ape index
FLW               63.9"             65.4"              +2.5 (range 1..5)
LW                66.5"             70.1"              +2.4 (range -1..6)
MW                69.1"             72.3"              +3.0 (range 0..6)
HW                76.0"             75.6"              +3.1 (range 1..9)
```

Every generated fighter below heavyweight is three to four inches shorter than the fighters the same
game ships by hand, and generated reach is height plus noise where the real distribution runs +2 to
+3. Nobody has noticed because height and reach are read by exactly one thing in the codebase — the
tale-of-the-tape strip on `FightScreen`.

---

## 2. How the scale is defined

### 2.1 Logarithmic in the underlying quantity

The engine already consumes ratings through `effect(r, K) = exp(K(r − 50) / 50)` — an exponential in
the rating. The rating is _already_ being treated as a log-scale quantity everywhere it is used.
Making that explicit costs nothing and buys the whole ladder:

```
quantity(r) = quantity(50) × 2^((r − 50) / D)
```

Equal steps in rating are equal _ratios_ of capability. A linear scale has to choose between
resolving the middle of the population and reaching the extremes; a log scale does not, which is
why Power 99 can be Ngannou and Power 40 can be an ordinary flyweight without the middle of the
scale collapsing.

### 2.2 The pivot: rating 50

**Rating 50 is the median professional of that sex, pooled across all divisions.** Pooled, not
per-division — that is precisely what makes the scale absolute.

- Median male professional: walks around **180 lb**.
- Median female professional: walks around **140 lb**.

"Professional" means the whole licensed population the game world contains, not the UFC. The UFC is
the top slice of it, and §4.2 quantifies by how much.

### 2.3 The sex pivot, and where it stops

Measured female-to-male ratios at **matched body mass**, converted into this scale:

| Attribute                | female / male | in rating points | in standard deviations | pivot?             |
| ------------------------ | ------------: | ---------------: | ---------------------: | ------------------ |
| Power                    |          ~60% |            −31.7 |                   2.8σ | **yes**            |
| Strength                 |          ~65% |            −28.6 |                   2.6σ | **yes**            |
| Cardio                   |          ~87% |            −11.1 |                   1.1σ | **yes**            |
| Speed                    |          ~92% |             −8.4 |                   0.8σ | yes (weakest case) |
| Durability               |          ~88% |             −8.3 |                   0.8σ | yes (weakest case) |
| The other ten attributes |             — |                — |                      — | **no**             |

The first two rows force the decision. On a single male-anchored scale the median women's
strawweight lands at **Power 5 and Strength −2**. Those numbers are arguably true and completely
unusable: the effect curve would turn every women's fight into a fifteen-minute decision and the
profile screen would read as an insult.

So the pivot is per sex, on all five physicals. Speed and Durability are below the one-sigma bar
that would justify a pivot on evidence alone, and they get one anyway for coherence — a women's
division showing three sex-anchored attributes beside two that are not would have no readable
interpretation at all.

**The other ten attributes get no pivot and never will.** There is no biological basis for a sex
difference in striking craft, wrestling technique, submission chains, fight IQ or composure, and
inventing one would be both wrong and offensive. A women's flyweight with Wrestling 85 is exactly as
good a wrestler as a men's flyweight with Wrestling 85, and the two numbers may be compared
directly.

The useful consequence: **cross-sex comparison is meaningful on the ten technical and mental
attributes and meaningless on the five physical ones.** `overallRating` is therefore partially
cross-sex comparable, which is worth knowing before anything sorts a mixed list.

### 2.4 The mass law, and which mass

```
rating = 50 + D · β · log₂(m_relevant / m_pivot) + individual
```

**Which mass differs by attribute, and this is load-bearing:**

| Attribute       | reads          | because                                             |
| --------------- | -------------- | --------------------------------------------------- |
| Power, Strength | **lean mass**  | fat tissue is not contractile and produces no force |
| Durability      | **lean mass**  | head and neck mass resisting acceleration is lean   |
| Speed, Cardio   | **total mass** | you have to move all of it, fat included            |

At the population level, where lean fraction is roughly constant, the split cancels and the two
formulations agree. It earns its keep in two places that matter enormously:

- **A bad bulk pays the full speed and cardio cost and buys almost no force.** §6 case B: +16 lb of
  mostly fat gives +1.5 Power and −1.8 Speed. The same 16 lb gained well gives +3.6 Power for the
  same −1.8 Speed.
- **A cut that strips muscle costs real force.** §6 case D loses 4.2 Power and 5.0 Strength where a
  clean fat-loss cut of identical scale loses 1.9 and 2.3.

That is the whole "quality of added mass" mechanic, and it is one term in one equation rather than a
system.

`individual` carries everything else — physiology, conditioning, technique, age, weight-cut
depletion — and is where all the variance lives.

### 2.5 Variance is derived, not chosen

For a log scale, a coefficient of variation in the quantity converts directly into a standard
deviation in rating points:

```
σ = D · log₂(1 + CV)
```

| Attribute  | CV within a division, trained athletes | **σ (rating points)** |
| ---------- | -------------------------------------: | --------------------: |
| Power      |                                    20% |              **11.3** |
| Strength   |                                    18% |              **11.0** |
| Speed      |                                    11% |              **10.5** |
| Cardio     |                                    13% |               **9.7** |
| Durability |                                    18% |              **10.7** |

Nobody chose those to agree. `D` was set per attribute from range and knockout-rate evidence (§3),
and `CV` comes from the underlying sports-science variation, and the product lands within 1.6 points
across all five. **One standard deviation is about ten rating points on every physical attribute**,
which makes the scale readable: +10 is "notably better", +20 is "best in the division", +30 is "one
of the best in the sport", on any attribute, in any division.

Treat that as a consistency check that passed, not as a design goal that was met.

The **whole-professional** population is wider than the UFC one, because selection truncates:
σ_pro ≈ 1.2 × σ_UFC, so roughly 12–13.5 points. That is the number generation has to hit.

---

## 3. The five attributes

Each section answers the same four questions: what it represents, what quantity it approximates and
why, what the landmark ratings mean, and what evidence supports `D` and `β`.

### 3.0 Landmark ratings, as a multiple of the median professional

|                  Rating |     Power |     Speed |    Cardio | Durability |  Strength |
| ----------------------: | --------: | --------: | --------: | ---------: | --------: |
|                       0 |     0.45× |     0.61× |     0.53× |      0.46× |     0.47× |
|                      25 |     0.67× |     0.78× |     0.73× |      0.68× |     0.69× |
|                  **50** | **1.00×** | **1.00×** | **1.00×** |  **1.00×** | **1.00×** |
|                      75 |     1.50× |     1.28× |     1.37× |      1.47× |     1.46× |
|                      90 |     1.91× |     1.49× |     1.66× |      1.85× |     1.83× |
|                      95 |     2.07× |     1.56× |     1.76× |      2.00× |     1.97× |
|                      99 |     2.20× |     1.62× |     1.85× |      2.13× |     2.09× |
|                     100 |     2.24× |     1.64× |     1.88× |      2.16× |     2.12× |
| **+10 points is worth** |      +17% |      +10% |      +13% |       +17% |      +16% |

The 25→99 span — weakest licensed professional to all-time outlier — is 3.30× for Power, 3.13× for
Durability, 3.05× for Strength, 2.54× for Cardio and **2.08× for Speed**.

That last figure is the single best sanity check in the document. Punch velocity among trained
fighters runs roughly 5 to 11 m/s: a little over 2×. The scale says the full 1–100 range of Speed
covers a 2.08× range of movement velocity, and it was not fitted to that. **Humans vary far less in
quickness than in force**, and a flat `D` across the five attributes — the obvious thing to do —
would have been the biggest available error.

### 3.1 Power

**Represents:** the absolute force a fighter can deliver into a target with a clean strike.

**Explicitly not:** punching effectiveness. That stays where `damage.ts` already computes it —
`raw power × mechanics × weapon × plantedness × fatigue × flushness`. `Power 88 / Striking 31` is a
fighter with enormous force and no reliable way to land it cleanly, and that fighter must exist.

**Quantity:** peak impulse transmitted to the target on a clean head strike. Chosen because it is
the quantity `knockdownHazard` actually consumes — the scale is defined by what the simulator reads,
not by what is easiest to describe.

|       |                                     |
| ----- | ----------------------------------- |
| **β** | **+0.60**                           |
| **D** | **43 points per doubling of force** |

**Evidence for β = 0.60.** Strike force is effective mass × velocity, and velocity is itself
mass-penalised (§3.3), so the exponent sits below the pure cross-sectional-area value of 0.67 that
governs static strength. This is physics-motivated rather than directly measured — see §8.

**Evidence for D = 43.** Pinned by the downstream knockout-rate ratio, which makes it the
best-grounded `D` of the five. `β_power` and `β_durability` together set how much more dangerous a
heavyweight is; `D` sets the magnitude. At 43 the model predicts a heavyweight-to-flyweight
knockdown-hazard ratio of 2.73× against a real-sport figure near 2.6× (§9). At 38 it predicts 2.41×;
at 50, 3.3×. The range check agrees: 25→99 spanning 3.3× of punch force is about right for
"weakest licensed professional" to "hardest recorded puncher".

**Landmarks:**

| Rating | Meaning                                                                     |
| -----: | --------------------------------------------------------------------------- |
| 99–100 | The hardest recorded hitters in the sport's history. One or two alive.      |
|  90–95 | Elite heavyweight force. Ends any fight in any division from any position.  |
|  82–89 | Enormous absolute force. Concentrated at 185 lb and above.                  |
|  72–81 | Genuinely dangerous anywhere. The best puncher in most lighter divisions.   |
|  62–71 | Above-average professional force. Comfortably fight-ending at welterweight. |
|     50 | Median professional, all divisions pooled.                                  |
|  38–49 | The whole flyweight and bantamweight middle. Not a flaw — a body mass.      |
|  20–37 | Cannot hurt a professional.                                                 |

Note the 38–49 row, and note that `RATING_BANDS` currently labels it "Below level — a hole opponents
will find". For a flyweight, Power 46 is not a hole. §7.3.

### 3.2 Strength

**Represents:** absolute functional force in a grappling exchange — grips, frames, clinch, top
pressure, breaking posture.

**Quantity:** maximal voluntary force production in grappling postures. Chosen because it is what
`clinchOffence`, `clinchDefence` and the contested-position rolls read.

|       |                                           |
| ----- | ----------------------------------------- |
| **β** | **+0.67**                                 |
| **D** | **46 points per doubling** (was 50 in v1) |

**Evidence for β = 0.67.** The classical cross-sectional-area exponent, and the one competitive
strength sports use to compare athletes across bodyweight. This is the best-grounded β in the
document.

**Evidence for D = 46.** Set by the top of the scale rather than by range intuition. The strongest
plausible human in the sport must land at 96–99, not past 100. Expected maximum over ~60 heavyweight
and light-heavyweight fighters is roughly the division median + 2.3σ; at `D` = 50 that came to 100.3,
which overflows. Solving for a maximum near 97 gives `D` ≈ 46.

**Landmarks:**

| Rating | Meaning                                                                        |
| -----: | ------------------------------------------------------------------------------ |
| 96–100 | The strongest men in the sport. Heavyweight only.                              |
|  85–95 | Elite absolute grappling strength. Effectively unavailable below middleweight. |
|  72–84 | Very strong for the sport as a whole. The best grapplers at 155–185.           |
|  60–71 | Strong professional.                                                           |
|     50 | Median professional.                                                           |
|  36–49 | Ordinary at flyweight and bantamweight.                                        |
|  25–35 | Weak even for a small division.                                                |

This produces the widest divisional spread of the five — **28 points** flyweight to heavyweight. The
hand-authored roster says 11, and I think the hand-authored roster is wrong here specifically:
Strength is the attribute where division-relative thinking is hardest to resist, because "he is
unbelievably strong" is something you say about a fighter relative to his opponents. In absolute
terms a heavyweight grappler is not marginally stronger than a flyweight; he is about one and a half
times stronger. §8 lists this as the most provisional `β`/`D` pairing in practice, and §10 lists it
as the first thing play-testing should move.

### 3.3 Speed

**Represents:** neuromuscular quickness — hand and foot velocity, movement initiation, reaction
latency, level-change speed.

**Explicitly not:** technique, timing or shot selection. `Speed 91 / Striking 28` is an astonishing
athlete who cannot fight, and must be constructible.

**Quantity:** mean limb velocity through a strike, blended with movement-initiation latency. Chosen
because it is what decides who lands first and whether a strike can be evaded.

|       |                            |
| ----- | -------------------------- |
| **β** | **−0.20**                  |
| **D** | **70 points per doubling** |

**Evidence for β = −0.20.** Negative but small. Punch velocity falls with body mass across weight
classes at roughly m^−0.15; whole-body movement, footwork and level changes fall faster, nearer
m^−0.25. −0.20 is the blend. The published samples here are small — this is the second most
provisional β in the document.

**Evidence for D = 70.** The range test, and it is a strong one. Punch velocity among trained
fighters spans roughly 5 to 11 m/s, a little over 2×. `D` = 70 puts the 25→99 span at 2.08×.
Nothing else in the document is pinned this cleanly by direct measurement.

**Landmarks:**

| Rating | Meaning                                                                                             |
| -----: | --------------------------------------------------------------------------------------------------- |
| 96–100 | The fastest hands and feet the sport has seen.                                                      |
|  88–95 | Elite absolute quickness. Overwhelmingly, not exclusively, small fighters.                          |
|     80 | Extraordinary for a heavyweight (+2.8σ over his division). Elite-not-freak for a flyweight (+1.5σ). |
|  62–72 | Quick professional.                                                                                 |
|     50 | Median professional.                                                                                |
|     43 | The heavyweight median — a perfectly ordinary heavyweight, slow next to a lightweight.              |
|  30–42 | Slow in absolute terms. Ordinary among the largest men.                                             |

The third row is the design goal from the brief, produced as an output rather than asserted.

### 3.4 Cardio

**Represents:** MMA-specific sustained work capacity — how slowly a fighter fades and how well they
recover between rounds, carrying their own body.

**Quantity:** sustainable fraction of maximal work rate over 15–25 minutes, per unit of body carried.
Chosen because it is what `stamina.ts` consumes.

|       |                            |
| ----- | -------------------------- |
| **β** | **−0.25**                  |
| **D** | **55 points per doubling** |

**Evidence for β = −0.25.** This is `0.75 − 1.0`: absolute aerobic capacity scales as mass^0.75
(the Kleiber exponent; the literature range is roughly 0.71–0.78), and the metabolic cost of moving
your own body scales as mass^1.0. A fighter must move his own mass, so what matters is the
difference. This is the same physiology `strengthCardioCost` already models as the interference
effect, arriving from the other direction. Well grounded.

**Evidence for D = 55.** Relative VO₂max among trained athletes runs about 40 to 75 ml/kg/min, a
1.9× span; sustained work capacity compounds that with efficiency and fatigue resistance, so the
2.54× span the scale gives 25→99 is a little wider than raw VO₂max and should be. Moderately
grounded.

**Landmarks:**

| Rating | Meaning                                                           |
| -----: | ----------------------------------------------------------------- |
| 90–100 | The best engines in the sport's history. Concentrated at 135–170. |
|  80–89 | Elite conditioning. Wins fights in round three on its own.        |
|  68–79 | Very good professional gas tank.                                  |
|     50 | Median professional.                                              |
|  38–49 | Fades badly. The heavyweight middle sits here.                    |
|  25–37 | A liability past round one.                                       |

Cardio is the attribute where the **individual term should dominate the mass term**. The divisional
shift is 13 points; conditioning, `aptitudes.conditioning`, camp history and weight-cut depletion
should collectively swamp it. A heavyweight with a genuine engine must reach the low eighties (§5).

### 3.5 Durability

**Represents:** resistance to being stopped — the chin, and the body's tolerance of accumulated
trauma within a fight.

**Quantity:** impulse required to produce a given degree of concussive effect. Chosen because it is
literally the denominator of `knockdownHazard`.

|       |                            |
| ----- | -------------------------- |
| **β** | **+0.10**                  |
| **D** | **45 points per doubling** |

**Evidence for β = +0.10.** Almost mass-neutral. Head and neck mass resist head acceleration, giving
a small positive term; everything else about a chin is neurological and unrelated to body size. Four
points across the whole ladder. There is very little direct evidence here — this is the most
provisional β in the document, and §9 gives it a dedicated falsifier because it matters so much.

**The asymmetry between this and Power is the entire reason heavyweight is more dangerous.** β
+0.10 against +0.60. It is not a separate rule; it is arithmetic.

**Evidence for D = 45.** Chosen so the observable spectrum spans the range the design asks for — a
fighter who is stopped by shots that would not trouble anyone at 38, and a fighter who has never
been hurt at 91 — with the pooled roster maximum near 95.

**Landmarks:**

| Rating | Meaning                                                           |
| -----: | ----------------------------------------------------------------- |
| 90–100 | Has never been legitimately hurt. One or two per generation.      |
|  80–89 | Famously hard to stop. Absorbs championship rounds of punishment. |
|  68–79 | Solid professional chin.                                          |
|     50 | Median professional.                                              |
|  38–49 | Gets hurt by shots that others walk through.                      |
|  20–37 | One clean shot ends the night.                                    |

Durability keeps its existing career shape and gains no trainability: `ARRIVAL` already puts it at
0.97 of ceiling at twenty and the career erodes it through `headTrauma`. Only generation changes — a
broad initial spectrum from `neurologicalRobustness` and `structuralRobustness` rather than from a
single `constitution` roll.

### 3.6 The parameter table

```
attribute     quantity                            β      D      σ    reads
power         peak strike impulse             +0.60     43   11.3    lean mass
strength      maximal functional force        +0.67     46   11.0    lean mass
speed         limb & whole-body velocity      −0.20     70   10.5    total mass
cardio        mass-relative work capacity     −0.25     55    9.7    total mass
durability    impulse to concuss              +0.10     45   10.7    lean mass
```

Ten parameters (σ is derived, not free). Every distribution below is their consequence.

---

## 4. The divisional distributions

### 4.1 Medians of the whole professional population

This is the population the game world contains and the target for generation. Rating 50 is its
pooled median by construction.

**Men** (pivot 180 lb)

| Division          | walks at | Power | Speed | Cardio | Durability | Strength |
| ----------------- | -------: | ----: | ----: | -----: | ---------: | -------: |
| Flyweight         |      136 |    40 |    56 |     56 |         48 |       38 |
| Bantamweight      |      147 |    42 |    54 |     54 |         49 |       41 |
| Featherweight     |      158 |    45 |    53 |     53 |         49 |       44 |
| Lightweight       |      169 |    48 |    51 |     51 |         50 |       47 |
| Welterweight      |      185 |    51 |    49 |     49 |         50 |       51 |
| Middleweight      |      201 |    54 |    48 |     48 |         51 |       55 |
| Light Heavyweight |      222 |    58 |    46 |     46 |         51 |       59 |
| Heavyweight       |      255 |    63 |    43 |     43 |         52 |       65 |

**Women** (pivot 140 lb)

| Division      | walks at | Power | Speed | Cardio | Durability | Strength |
| ------------- | -------: | ----: | ----: | -----: | ---------: | -------: |
| Strawweight   |      126 |    46 |    52 |     52 |         49 |       45 |
| Flyweight     |      136 |    49 |    51 |     51 |         50 |       49 |
| Bantamweight  |      147 |    52 |    49 |     49 |         50 |       52 |
| Featherweight |      158 |    55 |    48 |     48 |         51 |       55 |

Spread: **σ_pro ≈ 12–13.5 points**, so a division's p05–p95 band is roughly ±21 around these.

### 4.2 The UFC-level lift

The calibration roster (§10) is UFC-only, so it needs its own reference. The UFC is roughly the top
1–2% of professionals **by fighting ability**, and each physical attribute is only one of fifteen
contributors to that. So the lift on any single physical is `ρ × selection intensity × σ_pro` with
ρ ≈ 0.3 and intensity ≈ 2.2 — about **+7 to +9 points**, not the +25 that selecting directly on the
attribute would give.

|                                       | Power | Speed | Cardio | Durability | Strength |
| ------------------------------------- | ----: | ----: | -----: | ---------: | -------: |
| UFC lift over the professional median |    +7 |    +8 |     +9 |         +7 |       +6 |

Cardio takes the largest lift because it is the most trainable and professional camps are where that
training happens; Strength the smallest because it contributes least directly to winning fights.
Selection also truncates the spread, which is why σ_UFC (§2.5) is below σ_pro.

### 4.3 UFC-level percentiles, men

`best/div` is the expected best of a thirty-fighter division, at +2.04σ.

**Power** (σ 11.3)

| Division          | p05 | p25 | p50 | p75 | p95 | best/div |
| ----------------- | --: | --: | --: | --: | --: | -------: |
| Flyweight         |  28 |  39 |  47 |  54 |  65 |       70 |
| Bantamweight      |  31 |  42 |  49 |  57 |  68 |       73 |
| Featherweight     |  34 |  45 |  52 |  60 |  71 |       75 |
| Lightweight       |  36 |  47 |  55 |  62 |  73 |       78 |
| Welterweight      |  39 |  50 |  58 |  66 |  77 |       81 |
| Middleweight      |  43 |  53 |  61 |  69 |  80 |       84 |
| Light Heavyweight |  46 |  57 |  65 |  72 |  83 |       88 |
| Heavyweight       |  51 |  62 |  70 |  78 |  89 |       93 |

**Speed** (σ 10.5)

| Division          | p05 | p25 | p50 | p75 | p95 | best/div |
| ----------------- | --: | --: | --: | --: | --: | -------: |
| Flyweight         |  46 |  57 |  64 |  71 |  81 |       85 |
| Bantamweight      |  45 |  55 |  62 |  69 |  79 |       84 |
| Featherweight     |  43 |  54 |  61 |  68 |  78 |       82 |
| Lightweight       |  42 |  52 |  59 |  66 |  77 |       81 |
| Welterweight      |  40 |  50 |  57 |  65 |  75 |       79 |
| Middleweight      |  38 |  49 |  56 |  63 |  73 |       77 |
| Light Heavyweight |  36 |  47 |  54 |  61 |  71 |       75 |
| Heavyweight       |  34 |  44 |  51 |  58 |  68 |       72 |

**Cardio** (σ 9.7)

| Division          | p05 | p25 | p50 | p75 | p95 | best/div |
| ----------------- | --: | --: | --: | --: | --: | -------: |
| Flyweight         |  49 |  58 |  65 |  71 |  81 |       84 |
| Bantamweight      |  47 |  56 |  63 |  70 |  79 |       83 |
| Featherweight     |  46 |  55 |  62 |  68 |  78 |       81 |
| Lightweight       |  44 |  54 |  60 |  67 |  76 |       80 |
| Welterweight      |  43 |  52 |  58 |  65 |  74 |       78 |
| Middleweight      |  41 |  50 |  57 |  63 |  73 |       77 |
| Light Heavyweight |  39 |  48 |  55 |  61 |  71 |       75 |
| Heavyweight       |  36 |  46 |  52 |  59 |  68 |       72 |

**Durability** (σ 10.7) — the flat one, by design.

| Division     | p05 | p25 | p50 | p75 | p95 | best/div |
| ------------ | --: | --: | --: | --: | --: | -------: |
| Flyweight    |  38 |  48 |  55 |  62 |  73 |       77 |
| Lightweight  |  39 |  49 |  57 |  64 |  74 |       79 |
| Middleweight |  40 |  50 |  58 |  65 |  75 |       80 |
| Heavyweight  |  42 |  52 |  59 |  67 |  77 |       81 |

**Strength** (σ 11.0)

| Division          | p05 | p25 | p50 | p75 | p95 | best/div |
| ----------------- | --: | --: | --: | --: | --: | -------: |
| Flyweight         |  25 |  36 |  44 |  51 |  62 |       66 |
| Bantamweight      |  29 |  40 |  47 |  54 |  65 |       69 |
| Featherweight     |  32 |  43 |  50 |  58 |  68 |       73 |
| Lightweight       |  35 |  46 |  53 |  61 |  71 |       76 |
| Welterweight      |  39 |  50 |  57 |  65 |  75 |       80 |
| Middleweight      |  43 |  54 |  61 |  68 |  79 |       83 |
| Light Heavyweight |  47 |  58 |  65 |  73 |  83 |       88 |
| Heavyweight       |  53 |  64 |  71 |  79 |  90 |       94 |

### 4.4 What the distributions have to satisfy, and do

**Overlap on every attribute.** No division may be strictly above or strictly below another on
anything. Checking the extreme pair:

| Attribute  | FLW p95 | HW p05 | FLW best-of-30 | HW median |
| ---------- | ------: | -----: | -------------: | --------: |
| Power      |      65 |     51 |             70 |        70 |
| Speed      |      81 |     34 |             85 |        51 |
| Cardio     |      81 |     36 |             84 |        52 |
| Durability |      73 |     42 |             77 |        59 |
| Strength   |      62 |     53 |             66 |        71 |

Every row overlaps. The best flyweight puncher exactly matches the median heavyweight, which is a
good place for that comparison to land. The strongest flyweight is still below the median
heavyweight — correct, and the one place the ladder is genuinely near-separating.

**The ladder rotates and also tilts.** Power + Strength runs 77 → 128 up the men's professional
ladder; Speed + Cardio runs 111 → 86. The rotation is the point. But it does not balance: mean
physical rises 47.6 → 53.2, about 5.6 points, because mass gives more to force than it takes from
quickness. That is true of real bodies and should not be tuned away. Its consequence is §7.1.

---

## 5. Where recognisable fighters land

**These are calibration estimates for anchoring a rating scale, not claims about the athletes.** Each
is stated as `division UFC median + n × σ`, so every number is auditable rather than asserted, and
`n` is the only judgement being made. `n = +2.0` means "best in a thirty-fighter division"; `n = +2.6`
means "one of one or two in the sport's history".

| Fighter                               | Division / walking wt |          Power |         Speed |        Cardio |    Durability |  Strength |
| ------------------------------------- | --------------------- | -------------: | ------------: | ------------: | ------------: | --------: |
| Francis Ngannou                       | HW 260                | **100** (+2.6) |     63 (+1.2) |     37 (−1.5) |     62 (+0.2) | 97 (+2.2) |
| Derrick Lewis                         | HW 265                |      96 (+2.2) |     47 (−0.3) |     40 (−1.2) |     66 (+0.6) | 86 (+1.2) |
| Cain Velasquez                        | HW 250                |      79 (+0.9) |     61 (+0.9) | **81** (+2.9) |     68 (+0.8) | 83 (+1.1) |
| Alex Pereira                          | LHW 230               |      91 (+2.2) |     68 (+1.4) |     58 (+0.4) |     73 (+1.3) | 77 (+0.9) |
| Jon Jones                             | LHW 230               |      80 (+1.2) |     73 (+1.9) |     66 (+1.2) |     79 (+1.9) | 84 (+1.6) |
| Israel Adesanya                       | MW 205                |      81 (+1.7) |     75 (+1.9) |     62 (+0.6) |     65 (+0.7) | 57 (−0.4) |
| Kamaru Usman                          | WW 190                |      66 (+0.6) |     65 (+0.8) |     83 (+2.6) |     73 (+1.5) | 80 (+2.0) |
| Colby Covington                       | WW 185                |      43 (−1.3) |     64 (+0.6) |     86 (+2.8) |     70 (+1.2) | 68 (+1.0) |
| Khabib Nurmagomedov                   | LW 175                |      60 (+0.4) |     66 (+0.7) |     78 (+1.9) |     74 (+1.6) | 77 (+2.0) |
| Tony Ferguson                         | LW 172                |      61 (+0.5) |     69 (+1.0) |     83 (+2.4) | **83** (+2.5) | 57 (+0.3) |
| Conor McGregor (at FW)                | FW 155                |      76 (+2.2) |     82 (+2.0) |     56 (−0.6) |     51 (−0.5) | 47 (−0.2) |
| Merab Dvalishvili                     | BW 155                |      46 (−0.5) |     73 (+1.1) | **90** (+2.9) |     71 (+1.4) | 65 (+1.4) |
| Deiveson Figueiredo                   | FLW 140               |      70 (+2.0) |     76 (+1.2) |     70 (+0.6) |     65 (+0.9) | 57 (+1.1) |
| Demetrious Johnson                    | FLW 136               |      49 (+0.2) | **89** (+2.4) |     84 (+2.0) |     62 (+0.6) | 48 (+0.4) |
| _An ordinary-bodied elite technician_ | MW 200                |      59 (−0.2) |     57 (+0.1) |     60 (+0.3) |     60 (+0.2) | 57 (−0.3) |

Six readings worth taking from that table, because each is a statement the design set out to make:

1. **Figueiredo 70 against Ngannou 100.** Thirty points is 1.6× the force. The flyweight hits
   extraordinarily hard for a flyweight and is not remotely in the same conversation. Doc 02
   currently rates him 60; the ladder says 70, and the ladder is the thing being calibrated.
2. **Ngannou's Speed 63 is above the median lightweight's 59** and well below an elite one's 81. He
   is a genuinely fast man who would be unremarkable at 155.
3. **Cain Velasquez's Cardio 81 is below Demetrious Johnson's 84.** The best heavyweight engine in
   the sport's history rates below a very good flyweight's, in absolute terms, and that is what
   "absolute" has to mean.
4. **Adesanya's Strength 57 is exactly the median welterweight's.** He is a middleweight carrying a
   welterweight's grappling strength, which is a real and well-known thing about that fighter, and
   it drops straight out of placing him at −0.4σ within his own division. Nobody typed "weak for a
   middleweight" anywhere.
5. **Covington's Power 43 sits in the band `RATING_BANDS` calls "a hole opponents will find"**, and
   that is exactly right for him — a very high-level fighter whose volume does little damage.
6. **The last row is a fighter with all five physicals between 57 and 60 who is elite.** The ladder
   has to permit that or the technical half of the game has no meaning.

---

## 6. What happens when body mass changes

The mass law applies to the fighter's current competing mass, so a weight move is not a special case
— it is the same equation evaluated at a different mass. Taking a fighter with Power 80, Speed 74,
Cardio 62, Durability 60, Strength 66:

| Case  | Move                           |       Power |       Speed |      Cardio | Durability |    Strength |
| ----- | ------------------------------ | ----------: | ----------: | ----------: | ---------: | ----------: |
| **A** | LW→WW, 169→185, good lean gain | 80 → **84** |     74 → 72 |     62 → 60 |    60 → 61 | 66 → **70** |
| **B** | LW→WW, same 16 lb, mostly fat  |     80 → 81 |     74 → 72 |     62 → 60 |    60 → 60 |     66 → 68 |
| **C** | WW→LW, 185→169, fat lost       |     80 → 78 | 74 → **76** | 62 → **64** |    60 → 60 |     66 → 64 |
| **D** | WW→LW, muscle stripped too     |     80 → 76 |     74 → 76 |     62 → 64 |    60 → 59 | 66 → **61** |
| **E** | MW→LHW, 201→222, done well     |     80 → 84 |     74 → 72 |     62 → 60 |    60 → 61 |     66 → 71 |
| **F** | MW→HW, 201→245, done well      | 80 → **87** |     74 → 70 |     62 → 58 |    60 → 61 | 66 → **75** |

Four things this produces without any bespoke code:

**A division move is worth two to five points of absolute physical change.** This is the important
one and it vindicates doc 02's founding claim. Moving up does not make you meaningfully worse; it
makes everyone across from you meaningfully bigger. The reason welterweight is hard for a lightweight
is not that he lost 2 points of Speed — it is that the median opponent gained 7 points of Power and 6
of Strength on him.

**A bad bulk is strictly worse than no bulk.** Case B pays the full −1.8 Speed and −1.8 Cardio and
collects +1.5 Power instead of A's +3.6. That is the "quality of added mass" mechanic, from the
lean/total split in §2.4, with no separate system.

**Stripping muscle to make weight is expensive and cutting fat is not.** Case D loses 4.2 Power and
5.0 Strength; case C, the same 16 lb removed from fat, loses 1.9 and 2.3.

**The big move is still only ±8.** Case F crosses two-plus divisions and moves Power +7.4 and
Strength +8.8 — visible, and nothing like a transformation. Underlying capability never moves at all;
this is expression at a different mass.

**Two things the mass law deliberately does not cover**, and which belong to the body model rather
than here:

- **Weight-cut depletion.** A fighter who has stripped 8% of body mass in fight week rehydrates to
  near his walking weight, so his mass term is nearly unchanged — but he is depleted. That is a
  penalty on the `individual` term, not a mass effect, and it is the mechanism by which a huge
  lightweight can have _worse_ fight-night Cardio at 155 than at 170.
- **Time.** Mass changes over months. `settleWeight` moves the body; the ratings re-express from it
  continuously. Nothing is ever applied as a one-off delta, which is what makes the double-counting
  in §11 impossible by construction rather than by discipline.

---

## 7. What the absolute scale breaks

Three things in the codebase assume, correctly under today's flat ladder, that a rating means the
same thing about _quality_ regardless of who holds it.

### 7.1 `overallRating` becomes division-biased

A flat weighted mean over fifteen absolute attributes, with the physical group carrying 4.9 of 14.9
weight. A 6.1-point shift in mean physical is worth roughly **+2.0 overall points to a heavyweight
over a flyweight**, before either has learned anything.

Consumed in ~20 places. Most are intra-division (`matchmaking`, `boutAgreements`, `heat`,
`aftermath`) and are unaffected. The cross-division consumers are the problem: `the-pyramid-holds`
ladders promotion tiers on pooled overall, `attention.ts` uses a global `>= 62` notability gate,
`generations.test.ts` asserts global 68/74/65 thresholds, `promoterRead` describes fighters against
absolute bands.

**Recommendation:** keep `overallRating` unchanged — it is domain-honest, a sum of absolute
qualities — and add a comparator:

```
competitiveRating(fighter)   // technical & mental absolute; physicals as a z-score
                             // against the fighter's own division ladder
```

Then migrate the cross-division consumers. This is the domain-truth / mode-presentation split applied
one level up: the _attribute_ is absolute truth; "how good is he" is a comparison, and a comparison
needs a reference population.

### 7.2 `traitFit` will hand traits out by division

```
fit *= 1 + (weight × (attributes[key] − 50)) / 20
```

The pivot is a hard-coded 50. Once heavyweight Power medians sit at 63 and flyweight Cardio medians
at 56, `powerPuncher` and `ironChin` migrate to heavyweights and `cardioMachine` to flyweights — not
because of who those fighters are, but because of where their division sits on the scale. A trait is
the most legible thing on a profile screen, so this would be highly visible.

**Fix:** read the deviation from the fighter's own division's expected value, not from 50.

### 7.3 The rating bands stop describing quality

`RATING_BANDS` calls 38–49 "Below level — a hole opponents will find". Under the new ladder that band
holds the ordinary Power of two entire men's divisions and the ordinary Strength of three.

**Fix:** bands stay absolute for the ten technical and mental attributes, where they remain true; the
five physicals are banded against the division ladder for display. Same split as §7.1 — the number is
absolute, the _adjective_ is comparative.

---

## 8. Grounded versus provisional

The single most useful thing in this document for the play-testing phase: which dials are evidence
and which are choices.

### Well grounded — change only with new evidence

| Parameter                              | Basis                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **β_strength = +0.67**                 | Classical cross-sectional-area scaling; the exponent competitive strength sports use to compare across bodyweight.     |
| **β_cardio = −0.25**                   | 0.75 (aerobic capacity, Kleiber; literature range 0.71–0.78) minus 1.0 (cost of locomotion).                           |
| **D_speed = 70**                       | Pinned by direct measurement: punch velocity among trained fighters spans ~2×, and this puts the 25→99 range at 2.08×. |
| **D_power = 43**                       | Pinned by a downstream measurable: the heavyweight/flyweight knockout-rate ratio. 2.73× predicted against ~2.6× real.  |
| Sex ratios for Power and Strength      | Large, consistent and well measured.                                                                                   |
| Ape-index distribution (+2 to +3 mean) | Directly observable from tale-of-the-tape data.                                                                        |

### Physics-motivated but not directly measured

| Parameter           | Basis and weakness                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **β_power = +0.60** | Reasoned from force = effective mass × velocity with velocity mass-penalised. The direction and rough size are secure; 0.60 versus 0.55 or 0.65 is not. |
| **β_speed = −0.20** | Punch velocity does fall across weight classes, but the published samples are small and mix technique with physiology.                                  |
| **D_cardio = 55**   | Anchored to relative VO₂max span (1.9×) then widened for efficiency and fatigue resistance. The widening is a judgement.                                |

### Provisional design assumptions — expect to move these

| Parameter                           | Why it is a choice                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **β_durability = +0.10**            | Very little direct evidence exists. Chosen small-and-positive because head/neck mass resists acceleration. §9 gives it a dedicated falsifier. |
| **D_durability = 45**               | Set to make the observable spectrum span 38 to 91, which is a design requirement rather than a measurement.                                   |
| **D_strength = 46**                 | Set by the top-of-scale constraint, not by a measured range. The 28-point divisional spread is the most contested number here.                |
| Pivot masses (180 / 140 lb)         | Estimates of the median professional's walking weight.                                                                                        |
| UFC selection lift (+6 to +9)       | Derived from a plausible ρ ≈ 0.3 and selection intensity 2.2, neither of which is measured.                                                   |
| CV values behind σ                  | Sports-science ranges, applied to a population they were not measured on.                                                                     |
| Sex ratios for Speed and Durability | Small effects with thin evidence; §2.3 pivots them for coherence rather than on evidence.                                                     |

### 8.4 Calibration-sensitive parameters

Three groups carry an explicit marker in the code and in every test that depends on them. They are
**held at their stated values and treated as hypotheses**, to be moved by controlled simulation in
step 7 — never by comparison against the pre-existing seeded roster, which was authored on a
division-relative reading of the scale and cannot adjudicate an absolute one.

| Group                                                                                  | Held at                | Falsified by                                                                           | If it moves                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **β_strength = +0.67, D_strength = 46** — the 28-point flyweight-to-heavyweight spread | as stated              | §9 tests **S1–S5**, which are controlled experiments rather than population statistics | most likely downward, to a 22–25 point spread. Only on the weight of S1–S5 together, never on one of them alone |
| **β_durability = +0.10, D_durability = 45**                                            | as stated              | §9 tests **1** and **D1**                                                              | either direction; there is almost no prior here                                                                 |
| **Female Speed and Durability pivots** (§2.3, 0.8σ each)                               | pivoted, for coherence | nothing in-game — this is an evidence question, not a simulation one                   | revisit only if better matched-mass data appears                                                                |

**The 28-point strength spread is not to be reduced because it looks large.** It looks large against
the hand-authored roster's 11, and that roster is the thing being replaced. Discovering through
controlled simulation that it should be 23 is a good outcome; shrinking it pre-emptively because 28
feels enormous next to a relative-scale artefact is the exact circular calibration §0 forbids.
---

## 9. What would falsify this ladder

Every entry is a measurement the simulation can produce that the ladder makes a prediction about,
and which the real sport independently answers. Where possible each isolates one parameter, because
a test that can only fail the whole model tells you nothing about what to change.

|   # | Measurement                                                         | Real sport                                      | Isolates                                                                             |
| --: | ------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
|   1 | **Knockdowns per 100 significant head strikes landed, by division** | rises steeply with weight                       | β_power − β_durability, isolated from pace and volume. **The cleanest single test.** |
|   2 | KO/TKO rate ratio, HW : FLW                                         | ~2.6×                                           | the same pair, plus D_power                                                          |
|   3 | Decision rate by division                                           | FLW/BW ~55–60%, HW ~30–35%                      | the same pair, through a different channel                                           |
|   4 | **Strike volume, round 1 versus round 3, by division**              | heavier divisions fade harder                   | **β_cardio**, directly and with nothing else in the way                              |
|   5 | Share of finishes occurring in round 3+, by division                | higher in heavier divisions                     | β_cardio again, as a cross-check on 4                                                |
|   6 | Mean fight duration by division                                     | falls with weight                               | the ladder as a whole                                                                |
|   7 | Best-in-division minus division median, per attribute               | should be ≈ 2σ ≈ 21 points                      | the CV assumptions behind σ                                                          |
|   8 | Overlap: light-division p95 versus heavy-division p50               | must overlap on every attribute                 | the β magnitudes collectively                                                        |
|   9 | **The same fighter simulated at two divisions**                     | physicals move 2–5 points; win rate moves a lot | the lean/total mass split and §6                                                     |
|  10 | Rate of "physically ordinary elite" fighters                        | roughly a third of champions                    | that the technical half still decides fights                                         |

Test 1 is the cleanest single measurement in the list. If it says heavyweight is only 1.4× more
dangerous, β_power is too low or β_durability too high.

Test 10 is the guard on the whole exercise. If the ladder is right and the game still produces only
physical freaks at the top, the problem is not the ladder.

### 9.1 Strength falsifiers, isolated

Strength gets its own group because it is the most calibration-sensitive parameter in the document
(§8.4) and because the obvious population statistic — "submissions collapse at heavyweight" — is a
**bad** sole diagnostic. Heavyweight submission rate is confounded by at least four things the
ladder also moves: fights end early to knockouts before the grappling develops (β_power), heavyweight
cardio is low so scrambles are shorter (β_cardio), takedown entries differ, and the real-sport
baseline for heavyweight submissions is itself noisy on small samples. A single number that four
parameters push on cannot tell you which one is wrong.

So the strength tests are **controlled experiments** — synthetic pairings where everything except
mass is held equal — plus population statistics only as corroboration.

| #      | Test                                                  | Design                                                                                                                                                                   | Predicted                                                                                              | Fails if                                                                                                                                   |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **S1** | **Matched-technique cross-mass grappling**            | Two fighters with _identical_ technical and mental ratings and identical non-strength physicals, differing only in competing mass by one division. Simulate 2,000 bouts. | The heavier man wins grappling exchanges clearly but not overwhelmingly — control time ratio ≈ 1.3–1.7 | ratio > 2.2 (β_strength too high) or < 1.15 (too low). **The primary Strength falsifier.**                                                 |
| **S2** | **Strength swing curve**                              | Hold a `contender` fixture fixed; sweep only Strength 38 → 98 against an unchanged opponent; measure win rate.                                                           | Monotone, smooth, worth roughly the same win-rate swing per point as an equivalent swing in Wrestling  | a step change, saturation below 80, or a swing more than 1.5× Wrestling's — Strength has become the master grappling stat                  |
| **S3** | **Clinch and top-control time by division**           | Population statistic, but on the grappling phase only, normalised per grappling exchange entered                                                                         | roughly flat across divisions                                                                          | rises steeply with weight — big men are winning position on mass rather than on wrestling                                                  |
| **S4** | **Escape and reversal rate from bottom, by division** | Per bottom-position minute, so it is independent of how often fights go to the ground                                                                                    | roughly flat, mild decline with weight                                                                 | collapses above middleweight — the same failure S1 detects, seen from underneath                                                           |
| **S5** | Submission rate by division                           | Population statistic                                                                                                                                                     | roughly flat, slight decline with weight                                                               | collapses at heavyweight — **corroborating only.** Never act on S5 alone; check S1 and S4 first, because three other parameters push on it |

The rule §8.4 states, restated as a procedure: **move `D_strength` only on the weight of S1, S2 and
S4 together.** S5 alone is not evidence, and the hand-authored roster is not evidence at all.

A parallel note for Durability, which is equally under-evidenced:

| #      | Test                              | Design                                                                                                                                    | Predicted                                                                  | Fails if                                                                                                     |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **D1** | **Matched-power cross-mass chin** | Identical fighters differing only in mass, each struck by an _identical absolute_ Power value, measuring knockdowns per clean head strike | the heavier man is only slightly harder to drop — a few per cent, not tens | the heavier man is materially harder to drop, which would mean β_durability is carrying weight it should not |

---

## 10. Calibration methodology

**A — Ladder.** This document. Settle §3.6's parameters and the two pivots before anything is built.

**B — Calibration roster.** A fresh, deliberately-authored UFC-only roster rated against §3–§5 from
scratch. Explicitly **not** derived from the existing seed ratings, and the existing `attrs()` values
are not to be consulted while authoring — that is how the old scale would be laundered into the new
one. Around 90 fighters, a dozen per men's division and six per women's, and it must contain by
construction:

- two heavyweight athletic freaks (Speed 68+ at 250 lb) and two heavyweight plodders
- a flyweight whose Power is freakish for a flyweight — near 70 — and nowhere near a heavyweight's
- cardio outliers at both ends of the ladder, so §5's Velasquez/Johnson comparison is testable
- at least one physically ordinary elite technician per weight band (all five physicals 52–62, ranked)
- a huge lightweight with a brutal cut and a small welterweight with none
- an unusually strong grappler at 145 and an unusually weak one at 205
- at least one fighter per division whose profile contradicts their division's median shape

Each entry carries a `notes` field justifying its numbers against §3's landmarks and stating its `n ×
σ` placement, exactly as §5 does. That justification is the deliverable; the numbers are downstream
of it.

**C — Simulate and play.** Run the engine over that roster and take every measurement in §9.
Statistical output _and_ individual fights: does a heavyweight fight feel more dangerous, does a
freak heavyweight feel freakish without holding 90s everywhere, does a division move read as a body
change.

**D — Iterate.** Change β and D. Do **not** distort `damage.ts` constants to preserve targets that
were measured under the old model.

**E — Lock, then rebuild the world.**

### 10.1 Division-aware calibration, as a general rule

> **Where a metric varies by division in the real sport, calibrate and assert it by division. The
> pooled aggregate is a secondary sanity check, never the primary target.**

The current suite inverts this, and not marginally: **19 of the 29 division references in the entire
test suite are `mens-lightweight`.** Two are heavyweight, two flyweight, one each for welterweight,
middleweight and light heavyweight. `roster-profile.test.ts` pools all 35,627 same-division pairings
into six global bounds. It would pass unchanged on a world where every division behaved identically —
which is the exact failure this redesign exists to leave.

Per-division: KO/TKO, submission, decision, finish and first-round rates; knockdown frequency; mean
duration; strike volume and accuracy; takedown attempts and success; control time; every physical
distribution. Pooled: draw rate, scoring consistency, determinism, corner symmetry, record integrity,
save size.

### 10.2 Bound style

Per-division bounds on a ~90-fighter roster are noisier than pooled bounds on 35,627 fights. So
assert **orderings and ratios** rather than absolute levels wherever possible —
`koRate(HW) > koRate(FLW) × 1.8` survives roster churn where `koRate(HW) ∈ [42%, 52%]` does not — and
put the measured value in every failure message.

### 10.3 Permanent diagnostics

A new `tests/statistical/generation-profile.test.ts`, reporting by division, background and
attainment: height, reach, ape index, walking weight, cut severity, and all five physicals as mean /
p05 / p50 / p95 / max / share above 80. Asserting:

| Check                                                          | Guards against                              |
| -------------------------------------------------------------- | ------------------------------------------- |
| height ↔ walking weight, ρ > 0.5                               | bodies decoupling from geometry             |
| frame ↔ walking weight at fixed height, ρ > 0.4                | frame collapsing back into a division proxy |
| frame ↔ division, ρ < 0.7                                      | the same, from the other side               |
| division ↔ Power, ↔ Strength strongly positive                 | the ladder flattening                       |
| division ↔ Speed, ↔ Cardio clearly negative                    | today's defect returning                    |
| 0.3 < ρ(Power, Strength) < 0.8                                 | one master athletic scalar                  |
| 0.1 < ρ(Power, Speed) < 0.6                                    | the same                                    |
| ρ(Cardio, Power) < 0.4                                         | the same                                    |
| no division strictly above another on any attribute            | the ladder becoming a lookup table          |
| σ per attribute within 10–14 points                            | the population compressing again            |
| national sprinters faster than club BJJ players by > 12 points | backgrounds not selecting                   |
| national distance runners: Cardio p05 > 55                     | selection effects being cosmetic            |
| bantamweight mean height ∈ [66", 69"]                          | anthropometry regressing                    |

The last row is the cheap one that would have caught today's three-inch height defect on the day it
shipped.

### 10.4 Every reported value carries both readings

A diagnostic that prints only the absolute rating cannot show the ladder working, and one that
prints only the percentile cannot show it drifting. **Every physical figure the diagnostics report
is printed twice: the absolute rating, and its percentile within the fighter's own sex and
division.**

```
LW   power   abs 55  (div p50)     HW   power   abs 70  (div p50)
     speed   abs 59  (div p50)          speed   abs 51  (div p50)
```

The absolute column is the domain truth and the thing the ladder is a claim about. The percentile
column is what tells you whether a fighter is good _at his own weight_, which is the only question
matchmaking, the AI and the player ever actually ask. Both readings, always, on the same line — the
whole design rests on their not being the same number, and a report that shows one of them lets that
distinction quietly rot.

### 10.5 The percentile tables are generated, not typed

The tables in §4.1 and §4.3 are **output**. They are produced by
`tests/statistical/ladder-tables.test.ts`, which computes them from §3.6's parameters and prints
them by sex and division, for both the professional and UFC-level populations, on every run.

Two reasons this matters more than it looks. A hand-typed table drifts from the parameters the
moment one of them moves, and then the document lies — which is exactly how a scale ends up
justified by a table that was justified by the scale. And when a calibration-sensitive parameter
(§8.4) does move, the tables move with it in the same commit, so the reviewer sees the consequence
of the change rather than the change alone.

The test asserts only structural properties — every division overlaps every other on every
attribute, σ stays in band, no value exceeds the scale — so it fails when the ladder becomes
incoherent and not merely when it is retuned.

---

## 11. Test and constant classification

### Still valid

| Item                                                                                      | Note                                                                                    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ratings/curve.test.ts`                                                                   | Pure maths.                                                                             |
| `balance.test.ts` — symmetry, close decisions, prep value, upset bounds                   | Archetype-based; depends on the archetypes being coherent (below).                      |
| `styles.test.ts`, `risk.test.ts`, `fouls.test.ts`, `stance.test.ts`, `trait-cost.test.ts` | Archetype-based.                                                                        |
| `broadcast.test.ts`, `commentary-parity.test.ts`, `reduced-fidelity.test.ts`              | Presentation and fidelity parity.                                                       |
| `arrival.test.ts` — share-of-ceiling assertions                                           | Ratio claims the new model preserves. **Extend** with background-dependent realisation. |
| `generation.test.ts` — `traitFit` direction                                               | True once the pivot is fixed.                                                           |
| `save-size.test.ts`                                                                       | Ceilings, not targets.                                                                  |

### Should become division-aware

| Item                                                       | Currently                                   | Should become                                                   |
| ---------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `roster-profile.test.ts`, all six bounds                   | Pooled over 35,627 pairings                 | Per-division profile; pooled bound demoted to a secondary check |
| `twenty-years.test.ts` — finish distribution, rating drift | Global                                      | Per-division                                                    |
| `generations.test.ts` — 68 / 74 / 65 thresholds            | Global `overallRating`                      | `competitiveRating`, per division                               |
| `the-pyramid-holds.test.ts` — "standard laddered"          | Pooled `overallRating`                      | `competitiveRating`, or division-mix corrected                  |
| `talentSpread.test.ts`                                     | 8,000 fighters, all lightweight             | Sampled across the ladder                                       |
| `attention.ts` — `overallRating >= 62` gate                | Global absolute threshold                   | `competitiveRating`                                             |
| `promoterRead.ts`                                          | Absolute `ratingBand` phrasing on physicals | Division-relative for physicals, absolute for technical         |

### Encodes an old assumption — replace

| Item                                                                   | Why                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `generateNaturals`: `frame = walkingWeight / 300 × 100`                | Frame is a division proxy. The relationship inverts.                                         |
| `generateFighter`: `walkingWeight = limit × rng.range(1.04, 1.15)`     | Division determines the body. Backwards.                                                     |
| `heightInches` / `reachInches` linear remaps, both generators          | Linear in weight where mass goes as height³; fighters 3–4" short, ape index ≈ 0.             |
| `settledWalkingWeight = limit × 1.07`                                  | Replaces the body model with the division.                                                   |
| `ceilingsFromNaturals`: `speed: cap(explosiveness, 0.25)`              | No mass term. The clearest violation of absoluteness in the codebase.                        |
| `naturalsCentre(tier)` driving all five naturals                       | One scalar makes a fighter athletic, coachable and promotion-worthy at once.                 |
| `TALENT_TIERS` (Freak / Natural / Grinder)                             | Removed by decision; only three consumers.                                                   |
| `BUILDS` + `BUILD_NATURALS`                                            | Replaced by height / reach / frame.                                                          |
| Physical keys in `ALLOCATABLE`                                         | Head Start stops buying genetics.                                                            |
| `traitFit` pivot at 50                                                 | §7.2.                                                                                        |
| `overallRating` as cross-division comparator                           | §7.1.                                                                                        |
| `RATING_BANDS` applied to physicals                                    | §7.3.                                                                                        |
| `massChangeEffect` flat table                                          | Double-counts once mass feeds expression. §12 step 11.                                       |
| `cutSeverity`'s single `0.18` denominator                              | One fixed percentage for every body; ignores frame, lean mass and what is actually cuttable. |
| `BASE_KD_HAZARD = 0.0158`                                              | Needs a **global** re-anchor after the ladder lands. Must remain one constant.               |
| `ARCHETYPES.bomber` — Power 99, Strength 88, lightweight, 170 lb       | Not a person under absoluteness. Must become a heavyweight.                                  |
| `makeFighter` defaults — 170 lb, 70", 72", frame 50 for every division | Every test fighter has the same body whatever division it is placed in.                      |

---

## 12. Implementation plan

Steps 2 to 6 are **body work only**. The rule from the header restated where it will actually be
disobeyed: **no fight-engine constant moves until step 7.** Not `BASE_KD_HAZARD`, not the weapon
table, not a `roster-profile.test.ts` bound. Those tests will start failing somewhere around step 6
and the correct response is to let them fail loudly with the measured value in the message, not to
edit the constant they defend. The ladder cannot be judged against a half-built body model, and an
engine tuned against one has to be tuned again.

1. **Ladder** — this document. Agreement on §3.6, the pivots, and §14.
2. **Body geometry — landed.** `progression/body.ts`: height per sex, ape index, skeletal frame,
   muscle, body composition, water-cut tolerance, and `walkingWeight` derived from all of them.
   Replaces both remaps and the `limit × 1.04–1.15` walking weight in both generators.
   `ratings/physicalScale.ts` holds §3.6's parameters, consumed so far only by the generated tables.
   `tests/statistical/ladder-tables.test.ts` and `generation-profile.test.ts` are the §10.3–10.5
   instruments. Measured against the roster's real anthropometry, every division's mean height is
   now within about an inch, against three to four inches out before. §14 records what it found.
3. **Split the talent axes — landed.** `tier` now centres the **learning** axis and reaches the body
   only through `ATHLETIC_TIER_LOADING = 0.45`. `replenish` and `depth.ts` need no change: `tier`
   already means "where this fighter belongs", and that is now a statement about ability rather than
   about genetics. `tests/statistical/talent-axes.test.ts` is the acceptance suite. §13.5 records
   what it measured. **`createPlayerFighter` is deliberately untouched** — its `talent` layer is a
   claim the player makes about themselves rather than a promotion-quality signal, the defect this
   step names cannot occur on that path, and step 10 deletes the layer outright.
4. **Replace `naturals.frame` — landed.** `Fighter.physique` stores the four composition primitives;
   `naturals.frame` is deleted; the ceilings read `leanMassIndex`, `carriedMassIndex` and
   `skeletalIndex`. §13.6 records what it measured. **The `constitution` split into
   `neurologicalRobustness` and `structuralRobustness` moved out of this step** — it is physiology
   decoupling, which belongs with the Power/Strength work in step 6, and folding it in here would
   have made neither measurable on its own.
5. **Calibration roster** — §10 Phase B, **restated at §13.8** against the code steps 2–4 left
   behind. In short: ratings are computed from `physicalScale.ts` at a stated `n × σ` rather than
   typed, bodies are solved by `physiqueForMeasurements` and checked by `weightFit`, and the roster
   is validated for coherence against the ladder rather than against the generator — which cannot
   yet produce what it will state, because the mass law is step 6.
6. **Mass effects.** `ceilingsFromNaturals` gains §2.4's law with the lean/total split for all five.
7. **Simulate, play, iterate** (§9, §10) — **the first step allowed to touch an engine constant.**
   Run §9's twelve measurements plus S1–S5 and D1. `roster-profile.test.ts` rewritten per division;
   `BASE_KD_HAZARD` re-anchored globally, once, against a finished body model.
   **Done — see §20.** Two departures from the plan, both recorded there: the per-division rewrite
   landed as `ladder-falsifiers.test.ts` rather than in `roster-profile.test.ts`, so the roster is
   not simulated twice for one answer; and `BASE_KD_HAZARD` was **not** re-anchored, because the
   measurements say it does not need to be. S4 could not be measured at all.
8. **Lock the scale.** `docs/02` rewritten to match.
9. **Backgrounds → priors and realisation.** `arrivalFactor(key, age)` becomes
   `arrivalFactor(key, age, history)`. Split `trackAndField` into sprint/jumps and throws;
   `enduranceSport` into rowing and distance running.
10. **Character creation.** Remove talent tiers, builds, physical allocation. Add height, reach,
    frame, live Weight Fit panel.
11. **Weight-class movement.** `massChangeEffect` deleted; `settleWeight` moves mass and the physicals
    re-express from it continuously. Capability never moves.
12. **Rebuild the world.**

Steps 2, 3 and 6 carry most of the value and none of them require the creator work.

**RNG and baselines.** Every new roll gets its own `rng.fork(label)`, so adding a physiological
variable does not reshuffle unrelated draws. Long-sim baselines and seeded fixtures will still move at
steps 4 and 6; that re-baselining is deliberate.

---

## 13. What step 2 found

Three things the instrument surfaced on its first run that were not in the plan. None is acted on
here — steps 3, 4 and 6 own them — and all three are recorded where whoever does those steps will
meet them.

**13.1 Power and Strength are nearly the same number — and the target for it is provisional.** ρ =
0.85 across the generated population, and
Power against Speed is 0.89. The cause is visible in `ceilingsFromNaturals`:

```
power    = explosiveness × 0.60 + frame × 0.25 + skill × 0.15
strength = explosiveness × 0.45 + frame × 0.45 + skill × 0.10
```

Two near-identical linear combinations of the same two naturals, so "explosive but not especially
strong" and "very strong but not explosive" — two of the most ordinary fighters in the sport — are
both close to impossible to generate. This is exactly the master-scalar failure step 3 exists to
prevent, arriving one layer lower than expected. `generation-profile.test.ts` bounds it where the
code is. The target this originally carried — tighten to ρ ≈ 0.7 at step 6 — has been **withdrawn**;
§ 16 says what replaced it and why a coefficient was the wrong thing to aim at.

**13.2 `chosenDivision` had no answer for a body the ladder cannot hold.** A woman whose weigh-in
floor is 150 lb is not a lighter-than-usual featherweight — the women's ladder stops at 145 and she
is somebody the sport has no division for. The first draft returned the heaviest division as a
fallback and generated a women's featherweight walking 186 lb whose own `weightFit` said
`notViable`. It now returns `undefined` and callers handle it; about 2% of rolled bodies are dropped.

**13.3 Two existing tests were passing on luck, and one economy assertion had no signal.**

`matchmaking-style.test.ts` asserted that a tournament promotion's queue equals the merit order
exactly, but `tournament` is `rankAdherence 92, entertainmentBias 12, domesticBias 10` — eight per
cent of the weight sits elsewhere by design, so adjacent contenders separated by a small merit gap
can swap. It now asserts what 92 promises: the head of the queue is the number-one contender and
nobody is displaced by more than one place, plus a new test that a showman promotion displaces more.

`promotion-costs.test.ts` compared mean regional ten-year budget growth against half the leader's.
Measured across eight seeds on an **unmodified** checkout, that rule passed on five of eight, and the
leader's own growth ranged from +7% to +67% — a bound whose denominator swings tenfold on the seed
is measuring the draw. It now uses the leader's share of the sport's total budget, which held between
47.7% and 64.8% unmodified and 38.6% and 54.9% with the body model.

That last comparison surfaced a real effect worth re-measuring at step 7: the body model moved mean
regional growth from **+2% to +24%** across those eight seeds. Regionals finished a decade negative
on four of eight seeds before and one of eight after. The likely path is `naturals.frame`, still
`walkingWeight / 300` and therefore moved for every fighter in the world when walking weight stopped
being a function of the division — heavyweight frames fell furthest. Step 4 deletes `frame`, so
tuning the economy against it now would be tuning against a number that is about to disappear.

### 13.5 What step 3 found

**The defect, measured.** Over 12,000 fighters drawn the way `depth.ts` draws them, with the career
age spread it seeds rather than debutants only:

```
                                 before    after
rho(tier, athletic naturals)      0.841    0.277
rho(tier, current ability)        0.699    0.510
rho(athletic, learning)           0.459    0.138
share of local-level fighters
  with any physical ceiling ≥80    0.8%     7.9%
```

The first two rows are the whole argument. **A fighter's promotion predicted his genetics better
than it predicted his fighting ability** — the sport's hierarchy was a genetics hierarchy wearing a
results hierarchy's clothes. The ordering is now the right way round by a factor of 1.8.

**The absolute correlation is capped near 0.54 and that is deliberate.** `rho(tier, motorLearning)`
measures 0.54 whatever the loading, because `motorLearning` is rolled with a standard deviation of 16
so that it is the thing scouts get wrong most, and everything downstream inherits that noise. Raising
the promotion-to-ability signal further means narrowing that spread, which is a different design
question — how legible talent should be — and is not step 3's to answer. `talent-axes.test.ts`
asserts the ordering rather than the level, for that reason.

**The loading was chosen by sweep, not by taste.** Every column trades against every other, and 0.45
keeps promotion level saying roughly twice as much about ability as about the body while leaving a
weak-but-real link between athleticism and coachability:

```
loading   rho(tier, ability)   rho(tier, body)   rho(body, learning)   local elite bodies
0.35                   0.497             0.223                 0.126                8.1%
0.45                   0.518             0.281                 0.157                6.8%
0.60                   0.542             0.361                 0.209                4.9%
```

**Diversity widened rather than narrowed**, which is the failure a decoupling usually hides: the
athletic axis carries its own spread on top of the per-natural rolls, so every physical attribute's
standard deviation is slightly larger than before.

**`talentSpread.test.ts` was measuring genetics as talent.** It bounded
`overallRating(potential)` — a flat mean over all fifteen attributes, five of which sit on an
absolute physical scale. Once elite fighters stopped automatically getting elite bodies, the share
above 85 fell from 1.5% to 0.75% and the bound broke. Measured the same day, **2.5% carry a
technical ceiling of 85 or better**. The elite are there; the lens was wrong, in exactly the way
§7.1 predicts a flat mean would be. Every bound in that file now points at the ten fighting
attributes and every one of them passes unchanged.

**Two more single-seed tests failed and neither was step 3's fault.** The exposure end-to-end test
compares two seventy-fighter subpopulations on one seed and held on six of six seeds before and five
of six after; it now averages three worlds. And a promotion reached the zero floor on one economy
seed — where the poorest promotion had already been finishing a decade on **238** before this change.
`chargeCosts` clamps at `Math.max(0, ...)`, so that assertion was testing "never touched the floor"
rather than "went out of business"; it now hard-fails only for the top half of the pyramid.

That last one is the same thread as §13.3's regional-growth movement, and it is **deliberately not
tuned**. Both run through `naturals.frame`, still `walkingWeight / 300`, which step 4 deletes. Tuning
either now would be tuning against a number that is about to disappear. **Re-measure both after step
4**, together.

### 13.6 What step 4 found

**The substitution was clean, and that was the design goal.** `LEAN_INDEX_DIVISOR` is set so the new
index lands where `walkingWeight / 300 × 100` landed — within a point across the whole ladder at a
typical body fat — because `frame` fed four ceilings with coefficients tuned against that scale.
Replacing the variable without preserving the scale would have retuned Power, Strength, Durability
and Cardio at once and made the change unattributable.

Measured before and after, on the same base:

- **Physical distributions: unchanged.** Every division's median moved by at most one point, on one
  attribute, in one direction.
- **Step 3's axes: byte-identical.** ρ(athletic, learning) 0.138, ρ(tier, ability) 0.510, ρ(tier,
  body) 0.277 — all four figures the same to three decimals.
- **Body-sampler rejection and fallback rates: byte-identical**, every row of the sex × division
  table. Step 4 changed how the ceilings _read_ a body, not how bodies are _sampled_, so viability
  and division selection are untouched by construction rather than by hope.

What is new is what the number can now see. Two fighters at the same scale weight had identical
frames; a lean one and a soft one now differ by 6.4 points of carried mass — the full width of the
model's 8%-to-18% body-fat band — while their contractile mass is identical. That distinction is the
reason the body model exists and `frame` could not make it.

**Frame is not a "bigger is better" scalar**, and `body.test.ts` now asserts it: |ρ| between
`frameIndex` and each of explosiveness, engine, motor learning and recovery must stay under 0.15.
Mass buys Power and Strength, which doc 31 § 3 says it should; it must buy nothing else, or the
master scalar step 3 removed would be back wearing a body's clothes.

**The deferred economy finding resolved itself.** §13.3 recorded that the body model moved mean
regional ten-year growth from +2% to +24% and predicted the path ran through `naturals.frame`.
Measured across eight seeds on the same base with `frame` deleted:

```
                        before step 4   after step 4
mean regional growth             +1%            −7%
mean leader growth              +32%           +10%
worlds with a promotion
  at the zero floor              2/8            3/8
```

The +24% excursion is gone and the tier is back to hovering, which is what
`promotion-costs.test.ts` asserts. **Not tuned**, per the instruction, and it did not need to be.
The leader figure moved too, and both sit inside a band this measurement has repeatedly shown is
seed-dominated — the leader's ten-year growth ranged +7% to +67% across seeds on an untouched
checkout earlier in this work. The floor count is 2/8 against 3/8, which is the same marginal
bottom-of-the-sport either way and not a step-4 effect.

**It cost 120.6 KB of save**, 4.0%, about 144 bytes a fighter and almost entirely JSON key names.
The `save-size.test.ts` ceiling moved 3.0 → 3.2 MB with the number recorded, which is what that
file's own comment asks the next person to add a field to do. It comes back twice: step 11 makes
`walkingWeightLbs` derived rather than stored, and doc 20 phases 3 to 5 rebuild the roster from its
seed and delete 90% of the save outright.

**One thing deliberately left stored.** `Fighter.walkingWeightLbs` is now derivable from `physique`
and `heightInches`, and is kept anyway until step 11 — which is when mass starts genuinely moving
over a career and a cached copy could go stale. Deriving it now would force a rewrite of
`settleWeight`, which is step 11's work. `body.test.ts` asserts the stored value agrees with the one
the body implies, so it cannot drift in the meantime.

### 13.7 The body-model baseline

Taken after step 4 landed and before step 5 begins. The reason is attribution: the next layers change
**how the body is fed** rather than what the body model does — step 9 gives sporting backgrounds a
body prior, step 11 makes mass move over a career — and without a reading taken while nothing else is
moving there is no way to say which of them moved what.

Regenerate with `tests/statistical/body-baseline.test.ts`. The tables below are a transcription of
one run; when a later step moves them, re-run it, put the new numbers beside these, and name the
change that did it.

> **Superseded twice since.** § 15 lowered the weigh-in floor and § 18 gave the mass and body-fat
> scales a curve. The current numbers are at § 18.5, with the movement attributed. These are kept as
> the step 4 reading rather than updated in place, which is what makes the attribution possible.

**Men, 40,000 forward-sampled bodies**

| div | share |       height |        reach |  ape |       walking | lean | camp | floor | cut % |
| --- | ----: | -----------: | -----------: | ---: | ------------: | ---: | ---: | ----: | ----: |
| FLW |  4.9% | 64.7 (62–67) | 67.1 (63–71) | +2.4 | 133 (119–143) |  116 |  125 |   117 |   5.8 |
| BW  |  7.8% | 66.6 (65–69) | 69.1 (65–73) | +2.5 | 148 (140–155) |  129 |  138 |   129 |   8.4 |
| FW  | 12.4% | 68.0 (66–70) | 70.4 (67–74) | +2.4 | 158 (150–166) |  138 |  148 |   139 |   8.3 |
| LW  | 16.3% | 69.3 (67–71) | 71.7 (68–76) | +2.4 | 169 (161–178) |  148 |  159 |   148 |   8.4 |
| WW  | 24.5% | 70.8 (69–73) | 73.2 (69–77) | +2.4 | 183 (172–193) |  159 |  171 |   160 |   6.9 |
| MW  | 18.3% | 72.5 (70–75) | 74.9 (71–79) | +2.4 | 199 (188–210) |  173 |  186 |   174 |   6.8 |
| LHW | 11.7% | 74.2 (72–77) | 76.6 (73–81) | +2.4 | 217 (204–231) |  188 |  203 |   189 |   5.3 |
| HW  |  4.0% | 76.6 (74–79) | 79.1 (75–83) | +2.4 | 243 (226–267) |  211 |  226 |   212 |  −9.3 |

**Women, 40,000**

| div  | share |       height |        reach |       walking | lean | body fat % | cut % |
| ---- | ----: | -----------: | -----------: | ------------: | ---: | ---------: | ----: |
| WSW  | 34.3% | 63.7 (61–66) | 66.1 (62–70) | 121 (105–132) |   97 |       19.8 |   4.1 |
| WFLW | 25.9% | 65.9 (64–68) | 68.3 (64–72) | 136 (129–144) |  109 |       19.9 |   8.1 |
| WBW  | 21.3% | 67.2 (65–69) | 69.6 (66–73) | 147 (138–156) |  118 |       20.1 |   8.1 |
| WFW  | 14.1% | 68.5 (67–71) | 71.0 (67–75) | 159 (149–169) |  127 |       20.3 |   8.6 |

**Physique and the three ceiling inputs, men**

| div |      frame |     muscle | body fat | coefficient | lean index | carried index | skeletal index |
| --- | ---------: | ---------: | -------: | ----------: | ---------: | ------------: | -------------: |
| FLW | 41 (14–70) | 41 (16–65) |       48 |       11.88 |       44.6 |          44.4 |           45.8 |
| LW  | 48 (19–76) | 48 (23–73) |       49 |       12.28 |       56.7 |          56.5 |           57.1 |
| WW  | 50 (22–79) | 50 (26–75) |       50 |       12.42 |       61.2 |          61.0 |           61.2 |
| HW  | 60 (33–86) | 60 (34–84) |       53 |       12.96 |       81.0 |          81.0 |           79.2 |

**Spread within a division** — the measure step 2 existed to move, since under the old model a
division held an eleven per cent band of one shape:

| div | height sd | walking sd | lean sd | frame sd | walking p05–p95 |
| --- | --------: | ---------: | ------: | -------: | --------------: |
| FLW |      1.48 |        7.3 |     6.2 |     17.0 |           24 lb |
| LW  |      1.33 |        5.1 |     4.2 |     17.1 |           17 lb |
| WW  |      1.41 |        6.5 |     5.5 |     17.0 |           21 lb |
| HW  |      1.64 |       12.8 |    11.1 |     16.4 |           41 lb |

#### Three readings worth recording

**Frame ladders, and that is selection rather than a defect.** `frameIndex` runs 41 to 60 up the
men's divisions, and `muscleIndex` runs identically. Division is chosen on mass, and mass is height,
frame and muscle together, so conditioning on division selects on all three — a model where frame did
not ladder would be one where frame contributed nothing to how heavy somebody is. What says it is
still a body variable rather than a division label is the spread: **16.4 to 17.1 standard deviation
against a population 18**, so selection has barely narrowed it, and flyweight frames span 14 to 70
against heavyweight's 33 to 86. Under `naturals.frame` every lightweight scored 55 ± 3.

The first draft of the baseline test asserted the _gradient_ was small and failed on its first run.
The assertion was the thing in error; it now bounds the spread and the overlap instead.

**The lean and carried indices agree for men and diverge for women.** Men: `carried − lean` runs −0.3
to −0.0 across the ladder, by construction — `LEAN_INDEX_DIVISOR` was calibrated so the new index lands where
`walkingWeight / 300` did. Women: **+3.0 to +4.3**, because they carry about 20% body fat against
13% while both indices use the same divisors.

That is not a live defect — every woman's carried index sits below 60, which is where the Cardio
penalty starts, so it currently costs nothing. It will matter at step 6, when the mass law replaces
these ad-hoc terms and both indices start being read against a sex-specific pivot. **Flagged for step
6**, not fixed here.

And read the −0.3 correctly: it is the _population mean_ of a difference, not the size of the effect.
Two individuals at the same scale weight differ by up to 6.4 points of carried index with identical
lean mass, which is the distinction the split exists for.

**4.3% of rolled female bodies have no division.** Zero male bodies do. The women's ladder stops at
145 lb, so a woman whose weigh-in floor is 150 is somebody this sport has no home for; the men's runs
to 265 and almost nobody exceeds it. Inside the 6% bound the baseline asserts, and worth knowing
before step 9 starts pushing mass around with background priors.

---

### 13.8 Step 5, restated against the code as it now stands

Steps 2 to 4 moved four assumptions Phase B was written on. What follows replaces § 10 Phase B; the
composition requirements there still hold and are repeated as acceptance criteria at the end.

#### What changed underneath it

**1. The ratings can now be computed instead of typed, and should be.** `ratings/physicalScale.ts`
did not exist when Phase B was written. It holds the ten parameters, `medianRatingAtMass`,
`ratingSd` and `ELITE_LIFT`, and § 5 already demonstrates the method on fifteen fighters: state a
placement as `division median + n × σ` and let the number fall out.

That is the change to the deliverable. **A calibration entry states a body and a set of `n × σ`
placements; the five physical ratings are computed from them.** Ninety hand-typed rating blocks would
be ninety opportunities to drift from the scale they are supposed to be calibrating, and worse, they
would silently stop tracking a calibration-sensitive parameter the moment one moved (§ 8.4). Computed
placements move with it in the same commit.

The judgement being recorded is `n` — how far above his division this fighter sits — which is exactly
the thing a human should be authoring and a formula should not.

**2. `FighterSpec` needs a body, and the body model can solve for it.** Entries carry `htIn` and
`walk` as transcribed measurements; `physiqueForMeasurements` inverts the composition chain to get
the physique. Nothing new is required of the author — but the author is now constrained: a stated
height and walking weight must produce a body that can actually make the division, and
`weightFit(body, division)` will say `notViable` if it cannot. **The roster can no longer contain a
fighter the body model rejects**, which is a real check Phase B could not have had.

**3. The hand-authored path bypasses the talent axes entirely, and that is correct.**
`deriveNaturals` reads a spec's _attributes_ and works backwards to naturals; `tier` and
`ATHLETIC_TIER_LOADING` are never consulted. So step 3's split does not touch the calibration roster,
and the roster cannot be used to check step 3's work. Those are two separate populations answering
two separate questions, and conflating them would make both unreadable.

**4. The generator cannot yet produce what the roster will state, and must not be made to.** This is
the important one. The roster is authored against § 3's ladder; `ceilingsFromNaturals` is still on
the pre-ladder equations, because the mass law is step 6. So a heavyweight authored at Power 88 is a
rating the generator currently has no route to.

That gap is the point rather than a problem — **the roster is the target and step 6 moves the
generator toward it** — but it has a consequence for acceptance: step 5 cannot be validated by "does
the generator produce this". It can only be validated for internal coherence against the ladder. The
comparison between authored and generated populations is step 7's, and it is one of the things step 7
is for.

#### The target

A **UFC-only calibration roster of about 90 fighters** — a dozen per men's division, six per women's
— every physical rating computed from `physicalScale.ts` at a stated `n × σ`, every body solved from
a stated height and walking weight, and every entry carrying a `notes` field that justifies its
placements against § 3's landmarks.

Explicitly not derived from the existing seed ratings, and the existing `attrs()` values are not to
be consulted while authoring. That is how the old scale would be laundered into the new one, and
§ 0's second rule forbids it.

#### Acceptance criteria

Structural, and mostly checkable by a test rather than by reading:

1. **Every entry's physicals reproduce from its stated placement.** Recompute
   `medianRatingAtMass + ELITE_LIFT + n × ratingSd` from the entry's own body and `n` values, and it
   must equal the stored rating. This is what stops the roster drifting from the scale, and it is what
   makes a calibration-sensitive parameter's movement visible.
2. **Every entry is a body the model accepts.** `weightFit` is never `notViable`, and the stated
   walking weight agrees with the physique the height implies.
3. **The composition requirements from Phase B are all present**, each as a named assertion rather
   than a hope: two heavyweight athletic freaks at Speed 68+ and two plodders; a flyweight near Power
   70; cardio outliers at both ends so § 5's Velasquez–Johnson comparison is testable; at least one
   physically ordinary elite technician per weight band with all five physicals between 52 and 62; a
   huge lightweight with a brutal cut and a small welterweight with none; an unusually strong grappler
   at 145 and an unusually weak one at 205; and at least one fighter per division whose profile
   contradicts their division's median shape.
4. **The roster's per-division physical medians land within about 5 points of § 4.3's
   major-promotion percentile table.** It is a _sample_ of ninety against a distribution, so it will
   not match exactly; a systematic offset in one direction would mean the authoring drifted.
5. **No entry exceeds the scale.** Nothing above 99, and the 96–100 band is occupied only by fighters
   whose `n` is 2.4 or higher — the once-in-a-generation draw § 3 reserves it for.
6. **Every `notes` field states its placements.** The justification is the deliverable; the numbers
   are downstream of it, and a note that does not say why `n = 2.2` has not justified anything.

#### What step 5 must not do

No fight-engine constant, per the sequencing rule — step 7 is the first that may. No changes to
`ceilingsFromNaturals`, which is step 6. No `constitution` split and no Power↔Strength work, which
remain deferred to the physiology step. And the roster does not replace the shipped seed rosters: it
is a calibration instrument that lives beside them until the scale is locked at step 8.

---

### 13.9 What step 5 found

The roster landed at **115 fighters** — 88 men across the eight men's divisions, 27 women across the
four women's — every physical stated as a sigma placement against its division's major-promotion
median and computed through `physicalScale.ts`. `packages/data/src/calibration/` holds it;
`tests/statistical/calibration-roster.test.ts` prints the audit and asserts the criteria. Four things
came out of authoring it that were not in the plan.

**13.9.1 The authoring drifted, exactly the way § 13.8's criterion 4 was built to catch.** The first
draft ran a mean of **+8.7 rating points above the § 4.3 divisional p50**, with Power sitting at
**+1.2σ to +1.5σ in every men's division** — the roster's median heavyweight was being placed at his
own division's 95th percentile for punching force, which ten fighters cannot all be.

The cause was one specific confusion rather than general optimism: _famous finisher_ was being read
as _hardest hitter_. Knockouts come from timing, accuracy and the opponent's chin at least as much as
from force, and Power is defined here as peak strike impulse. The pattern in the drift is itself the
evidence — Power was the most inflated attribute and Durability the least, which is what selecting on
fame does, because highlight reels are made of knockouts.

Two corrections. Placements were re-authored downward wherever the evidence was a highlight reel
rather than a physical fact — 187 values in one pass — and **thirteen fighters were added**, because
part of the problem was the sample rather than the numbers: Volkov, Gane, Tybura and Arlovski at
heavyweight, Vera, Munhoz and Font at bantamweight, Formiga and Schnell at flyweight, dos Anjos and
Dariush at lightweight, Nate Diaz and Condit at welterweight. Mean drift now **+5.0 points**, mean
placement **+0.51σ**.

The residual is correct rather than tolerated, and the reasoning is worth writing down because the
criterion will be re-run: a calibration roster cannot sit _at_ its divisions' medians, because a
landmark is by definition somebody worth watching. A few points of positive drift is the right
answer. Eight is not.

**13.9.2 The body model rejects ten fighters who demonstrably competed where they competed, and the
pattern is diagnostic.** Per the step 5 amendment these are recorded as classified disagreements
rather than trimmed away, and they fall into two mechanisms.

_Very lean bodies are penalised twice._ `physiqueForMeasurements` puts everything that is not fat
into the lean column, camp weight is lean over 0.93, and the weigh-in floor rises with it. So the
leanest fighters in the file are the ones the model says cannot make weight — **Yoel Romero is
rejected at a 9.8% cut**, which is barely above the hand-authored roster's 8.2% mean and nowhere near
anything the sport considers dangerous. Pereira (10.8%) and Chandler (11.4%) fail the same way.
Whatever else is true, a sub-10% cut must not resolve to `notViable`.

_The women's floor is systematically too high._ **Four of the nine strawweights are rejected**, at
cuts of 13.4%, 14.2%, 15.4% and 18.5% — Zhang, Suarez, Jędrzejczyk and Dern. That is not four
authoring errors. `COMPOSITION.female` sets `fatFloor` 0.15 against the male 0.08 and
`CAMP_BODY_FAT.female` is 0.13, so a female body has proportionally less water to shed than a male
one of the same relative size, and the lightest women's division is where it surfaces first. The
model needs to be able to call a cut _dangerous_ without calling it _impossible_, and at strawweight
it currently cannot.

Two rejections are the model being right and are kept as controls: Figueiredo, who missed 125 lb more
than once and moved up, and Harrison, whose cut to 135 was described as dangerous at the time by
people who were not exaggerating.

**None of this is fixed here.** Step 5 does not touch the body model, and the disagreements are the
deliverable — a calibration set containing only cases the model already agrees with has calibrated
nothing. They are step 6's and step 11's input.

**13.9.3 The archetype problem is a generator problem, not a conceptual one.** § 13.1 measured
ρ = 0.85 for Power × Strength and 0.89 for Power × Speed in the generated population. Across the 115
authored placements the same pairs come out at **0.34 and 0.30**, and the largest correlation
anywhere in the matrix is Power × Cardio at **−0.52** — negative, because heavy hitters carry mass
and mass costs work capacity, which is the mass law showing up in human judgement before it has been
implemented in code. Nothing in the authoring was constrained to produce this; each attribute was
assessed on its own. So ρ ≈ 0.7 is not merely reachable, it is loose — the people the ladder is meant
to describe are far less correlated than that. But the roster is a _selected_ sample and these
coefficients are not targets either; § 16 replaces the numeric goal with the thing it was standing
in for.

**13.9.4 The Cardio ceiling wants a fifth attribute more than the others do.** Velasquez at +2.9σ and
Dvalishvili at +2.9σ are the two highest placements in the file on any attribute, and both are
placements about _pace maintained under a specific style_ rather than about aerobic capacity as such.
§ 14.4 already flags Cardio's equation shape as the one that may not match the other four; the
roster agrees, from the opposite direction.

---

## 14. Open questions

**14.1 The sex pivot on Speed and Durability.** §2.3 pivots all five physicals. Power, Strength and
Cardio clear the one-sigma bar on evidence; Speed and Durability do not, and get a pivot for
coherence. The alternative — three sex-anchored attributes beside two that are not — seems worse, but
it is a judgement.

**14.2 `D_strength` and the 28-point spread.** Provisionally signed off and held (§8.4). The derived
figure against the hand-authored roster's 11; §3.2 argues the roster is wrong and §8.4 forbids using
it to adjudicate. §9.1's S1–S5 are the test, and S1 — matched-technique
cross-mass grappling — is the one that decides it. Heavyweight submission rate alone (S5) is
corroborating evidence and nothing more; four parameters push on it.

**14.3 The mean-physical tilt.** §4.4: heavyweights end up 6.1 points of mean physical above
flyweights. The recommendation is to accept it and fix `overallRating` (§7.1) rather than bend the
exponents. Confirm that is the preferred trade.

**14.4 Cardio's equation shape.** Cardio's mass term (13 points) is small next to its individual
variance, and it may be better modelled as capacity (mass-scaled) × conditioning (not mass-scaled)
rather than as a single additive term like the other four. Deferred to step 6, but flagged now
because it is the one attribute whose form may not match the others.

**14.5 The pivot population.** Rating 50 is the median of the whole licensed professional population,
which the game world contains but which is hard to observe in reality. The alternative — anchoring 50
to the median UFC fighter — is directly observable but would put most of the game's own world below
50 on everything. §4.2's lift exists to bridge the two; if the lift turns out to be doing too much
work, this is the assumption to revisit.

**14.6 The weigh-in floor.** § 13.9.2 raised it and it is now **closed**, with the work and the
findings written up at § 15. In short: one defect rather than the two § 13.9.2 claimed, the female
half of that diagnosis was wrong, and a third defect turned up that nobody was looking for. The
coefficient ceiling § 15.4 describes is handed to step 6 and is the only part still open.

**14.7 Whether the calibration roster should ever become shipped data.** It is a measuring instrument
and § 13.8 says so, but 115 hand-authored fighters with real anthropometry and defended placements is
also the best-documented population in the repository. The temptation to seed a world from it will
recur. The argument against is that it would put the sport's hundred-odd most memorable athletes into
every save, which is a different game; the argument for is that step 12 has to rebuild the world from
something. Decide at step 8, when the scale locks.

---

## 15. What the body-viability correction found

Doc 31 § 14.6's follow-up, done as its own change between steps 5 and 6 and under one rule: **a
reliably documented fighter successfully making a division is evidence against the model.** No
fighter was altered to satisfy it, and no rating, `n × σ` placement or fight-engine constant moved.

The method mattered more than usual here, because the obvious fix — raise the ceiling until the ten
rejected careers pass — produces something worse than the original. A model that agrees with every
fighter who ever existed has stopped being able to say anything. So the first commit changed nothing
and only took the chain apart.

### 15.1 The decomposition, and what it ruled out

`cutChain` itemises walking weight → fat → lean → camp → transient → floor. `cutRequirement` asks
each assumption in turn what it would have to become for a given fighter to make a given limit. Both
live in `body.ts` as diagnostics; `tests/statistical/cut-model-decomposition.test.ts` prints them.

Three things came out that the § 13.9.2 write-up had not seen.

**Eight of the ten rejections miss by under two and a half pounds, and three by under one.** Pereira
missed light heavyweight by **0.4 lb** on a 230 lb body — under two parts in a thousand, on a chain
whose every input is inferred and whose walking weight is explicitly a guess. Declaring a career
physiologically impossible on that margin is the model claiming a precision it does not have.

**No single term is badly wrong.** The camp body fat those men would need runs 5.9–6.8% against an
assumed 7.0%; the walking weights they would need sit within two pounds of the estimates. That is the
shape of a model slightly short everywhere, not one wrong in a single place, and it is why moving one
constant until the examples pass would have been the wrong repair.

**The binding constraint is the ceiling, and it is too low by a wide margin.** Since
`floor / walking = (1 − bodyFat) / (1 − campFat) × (1 − transient)`, the largest cut a body can make
is set by exactly two of its own numbers. A male at 8% body fat could not lose more than **10.0%** of
his walking weight under any setting the model contained — against a hand-authored roster whose
ninetieth-percentile cut is 13.8% and whose maximum is 20.7%. The model was telling the leanest
fighters in the sport that they could not do what the sport demonstrably does, and the men who
perform the biggest cuts are not the fat ones.

### 15.2 § 13.9.2's second finding was wrong

It read four rejected strawweights as evidence that the female composition constants were harsher
than the male ones. They are not. At their respective leanest a woman can lose 11.1% of her walking
weight and a man 10.0%; at mid-band, 16.3% against 14.9%. The female side was never the stricter one.

The pattern is the **division ladder**. Strawweight asks a mean cut of 12.3% across the calibration
roster where every other division asks 8.5–11.4%, because a ten-pound step at 115 lb is a larger
share of a smaller body. So WSW was simply the first place a ceiling that was too low for everybody
showed up, and there was never a separate women's defect to fix.

This is the second time the step 5 instrument produced a correct falsifier attached to a wrong
explanation — § 13.9.1 was the first. Both times the numbers were right and the story was not, which
is an argument for decomposing before theorising rather than after.

### 15.3 The fix: three pools where there was one

The fight-week term was a single number — "water and glycogen", 4–9% of camp weight — that stood in
for three separate physiological processes and had been calibrated as though it covered one, so it
came out roughly the size of the largest of them. It is now itemised:

| pool                     | size                    | scales with   |
| ------------------------ | ----------------------- | ------------- |
| gut content              | 1.2%                    | camp weight   |
| glycogen and bound water | 4.0%                    | **lean mass** |
| acute dehydration        | 3–8% on `waterCutIndex` | camp weight   |

Naming them fixes the magnitude and, more importantly, the **shape**. Glycogen lives in muscle, so a
fighter carrying more muscle has more of it — which is the mechanism the undifferentiated term was
missing, and the reason the old model was hardest on exactly the lean, dense bodies that in reality
cut best. Nothing else moved: not the fat floors, not the camp body fat, not the ladder.

Nine of the 115 entries reclassified, every one of them out of `notViable`:

| fighter             |   cut | before    | after       | headroom |
| ------------------- | ----: | --------- | ----------- | -------: |
| Alex Pereira        | 10.9% | notViable | typical     |   8.1 lb |
| Yoel Romero         |  9.9% | notViable | typical     |   6.8 lb |
| Michael Chandler    | 11.4% | notViable | severe      |   6.2 lb |
| Merab Dvalishvili   | 12.8% | notViable | severe      |   4.4 lb |
| Deiveson Figueiredo | 13.8% | notViable | severe      |   4.8 lb |
| Zhang Weili         | 13.6% | notViable | severe      |   3.1 lb |
| Tatiana Suarez      | 14.0% | notViable | severe      |   3.2 lb |
| Joanna Jędrzejczyk  | 15.6% | notViable | severe      |   2.2 lb |
| Mackenzie Dern      | 18.5% | notViable | **extreme** |   0.4 lb |

The controls held. **Kayla Harrison is still `notViable`** at 21.5%, which is the intended verdict for
a cut the sport itself treated as beyond the pale. Dern sits at `extreme` with four tenths of a pound
of margin — the tightest in the file, and the right place for a fighter who repeatedly missed the
weight. Figueiredo reads `severe` with under five pounds of headroom. Nothing became `comfortable`,
and nothing above 11% became `typical`.

**The population moved, and it was supposed to.** `chosenDivision` walks the ladder lightest-first
and skips any division whose limit sits below the body's floor, so a lower floor makes bodies
eligible for divisions that previously refused them and fighters shift **down** — about a point of
share per division, three at strawweight, none upward. The women the ladder cannot house at all fall
from 4.0% to 1.8%, which is a side effect rather than a fix: § 13.2's tail is still there. Male
heavyweight sampling went 23.5 → 26.2 draws and 9.1% → 13.0% fallback, because a body that can now
make light heavyweight is no longer a heavyweight. The fallback rate is the number to watch against
its 15% bound, and step 6 will move it again.

### 15.4 The defect nobody was looking for — and it is step 6's

Found by an acceptance test asserting that no rating had moved, which failed for a reason that had
nothing to do with the cut model.

`physiqueForMeasurements` inverts the composition chain to solve a physique from a transcribed height
and walking weight, and it **clamps**. Hand it a body outside the model's range and it returns a
smaller person without saying so — after which walking weight, lean mass and all five physical
ratings describe that person instead. **Mark Hunt was sitting in the calibration roster as a 226 lb
man**, resolving his Power and Strength against a 226 lb heavyweight's divisional median, and nothing
anywhere said a word about it.

Half of it was cheap and is fixed. The inversion split the _coefficient_ evenly between frame and
muscle, which sounds neutral and is not: muscle contributes 3.2 coefficient units per index point
against frame's 2.6, so half each saturated `frameIndex` at 100 while `muscleIndex` was still at 91,
and the body silently stopped growing a fifth of the way short of the range the model can express.
Splitting so both **indices** are equal — the more natural reading of "no information either way" —
lets them saturate together and took five failures down to three.

The rest is the coefficient ceiling itself, and it is genuinely too low:

| fighter         | measurements  | needs | ceiling | reconstructs |
| --------------- | ------------- | ----: | ------: | -----------: |
| Mark Hunt       | 5'10", 265 lb | ~18.0 |    15.3 |       −39 lb |
| Cain Velasquez  | 6'1", 250 lb  |  15.8 |    15.3 |        −7 lb |
| Jessica Andrade | 5'1", 136 lb  |  13.6 |    13.0 |        −6 lb |

All three are extreme mass-for-height, which is the one dimension the ceiling truncates — and two of
them are in the roster _because_ they are extreme mass-for-height, so the model fails exactly where
it is asked the hardest question. They are filed under a new `outsideBodyModelRange` disagreement and
**are not calibration evidence for the ladder until the ceiling moves**.

That fix belongs to step 6, which owns `COMPOSITION`'s coefficients: raising them here would shift
the entire generated population's mass against a § 13.7 baseline taken to measure precisely that.

### 15.5 What this leaves for step 6

- The coefficient ceiling above, and Hunt, Velasquez and Andrade with it.
- Male heavyweight's 13.0% sampler fallback, which the mass law will move again.
- § 13.9.2's note that lean and carried indices diverge by +3.0 to +4.3 for women.

---

## 16. What step 6 is actually aiming at

Two corrections to how the calibration roster gets read, made before step 6 starts so that step 6 is
not tuned against a misreading of it.

### 16.1 The roster is not a population sample, and its mean is not a target

§ 13.9.1 corrected the authoring from +8.7 rating points of drift to +5.0, and the roster still
averages about **+0.51σ** across the five physicals. That residual is correct and must not be read as
a specification.

A calibration roster is a set of **landmarks**. It is drawn from the fighters people have watched,
which selects hard for being worth watching, so it sits above the divisional median by construction —
a roster that averaged 0.0σ would be the suspicious one. The two questions are separate and only one
of them is answered here:

- **Do recognisable real fighters land in sensible places on the ladder?** — the roster answers this.
- **What is the population distribution of UFC fighters?** — it does not, and § 4.3's percentile
  tables are what speak to that.

So "the generator should average +0.51σ" is not a claim this document makes anywhere. Step 7 compares
the generated population against § 4.3; the roster is for checking that a rating of 88 means what
somebody thinks it means.

### 16.2 The Power-correlation goal is no longer a coefficient

§ 13.1 recorded ρ = 0.85 for Power × Strength and 0.89 for Power × Speed in the generated population
and carried "tighten to 0.7 at step 6". That number is withdrawn. It was written down before there
was any evidence about what the right value is, and keeping it merely because it had been written
down is how a placeholder becomes a specification.

The roster's own coefficients are the best evidence available and are **not** the replacement target
either, for the reason § 16.1 gives:

| pair                |    roster | generator today |
| ------------------- | --------: | --------------: |
| power × strength    |     +0.34 |            0.85 |
| power × speed       |     +0.30 |            0.89 |
| power × cardio      | **−0.52** |               — |
| cardio × durability |     +0.46 |               — |
| speed × strength    |     −0.05 |               — |

What they establish is direction rather than destination: the generator is still collapsing distinct
athletic profiles onto one shared latent, and the gap is far too large to be a sampling artefact.

**The requirement, restated.** Shared physiology should produce sensible correlations, and no
preselected coefficient is truth. What step 6 has to deliver is that these archetypes are all
_common_ rather than merely possible:

- powerful but not especially fast
- fast but not especially powerful
- strong but not explosive
- powerful with poor cardio
- technically elite and physically ordinary
- physically freakish and uneven

Let the coefficients fall out of the mass law and the physiology, then compare them against the
roster as evidence. A step-6 test that hits ρ = 0.70 while still making "strong but not explosive"
rare has failed; one that lands at 0.55 with all six archetypes populated has succeeded.

---

## 17. The extreme placements, and the risk that is left

The calibration roster's architecture is settled. What is left in it is human, and it is one specific
thing: **reputation leaking into a raw physical attribute.**

Each of the five is supposed to describe physiology — peak strike impulse, limb velocity,
mass-relative work capacity — and each has a confound that produces an identical highlight reel.
Technique, timing, accuracy, defence, tactical style, and damage accumulated over a career all make a
fighter look like a physical outlier without making him one. A fighter who lands first is not
necessarily faster; one who is never hurt may be hard to hit rather than hard to concuss.

So every placement at **|nσ| ≥ 1.8** now carries its own `defence` field saying which it is, and the
roster test refuses to pass without one. Fifty qualify. A handful below the threshold are defended
too, where the risk is specific rather than general — Rousey's Durability at −1.6, Nunes' Cardio at
−0.3, Arlovski, Garbrandt and Schnell.

**Durability is the one where the confound is structural.** The game already degrades durability
through accumulated damage, so a calibration entry describes a fighter at a chosen prime point and a
placement read off a late-career decline would count the same fact twice — once in the rating, again
in the system that erodes it. Every Durability defence has to say explicitly whether it is a
prime-point reading, and a regex-backed test enforces it. Ferguson's +2.5 and Holloway's +2.2 both
say so; so does Arlovski's −1.5, which is the entry where the temptation is strongest and where the
placement is deliberately not lower for exactly that reason.

### 17.1 The tail that is missing

Reported rather than fixed, because it is the shape a reputation bias leaves behind.

Fifty placements sit at or beyond ±1.8σ. **None of them is negative.** The five lowest in the whole
file are Rousey's Durability at −1.6, Ngannou's Cardio and Arlovski's Durability at −1.5, and
Waterson's Power and Strength at −1.5.

The mechanism is obvious once stated: a landmark roster is a roster of people worth watching, and
nobody is watched for being the slowest man in his division. Inventing a −2.0σ fighter to balance the
file would be authoring to a shape instead of to evidence, which is the error § 13.9.1 caught once
already. What it means in practice is that **the bottom of the ladder is calibrated more weakly than
the top**, and step 7 should not read the roster as bounding it.

---

## 18. Can the model build the bodies it is judged against?

Step 6 tunes the equations that turn a body into Power, Strength and Speed, so it has to start from
a body model that can represent the bodies those equations will be measured against. § 15.4 found
that it could not, and found it by accident. This is the deliberate version, done before any physical
equation is touched. `tests/statistical/body-range-audit.test.ts` is the instrument.

### 18.1 What clamps, and what each clamp means

Four things in the composition chain can stop a body being built. **Only one of them is a statement
about human beings**; the other three are artefacts of how the model is parameterised, and the whole
difficulty was that all four presented identically — as a silent clip.

| clamp               | what it was                     | what it is                                     |
| ------------------- | ------------------------------- | ---------------------------------------------- |
| body-fat ceiling    | 18% male / 25% female           | 30% / 32%, on a curve                          |
| index scale ceiling | `base + fromFrame + fromMuscle` | same shape, wider, on a curve                  |
| index granularity   | integer, ≈ ½ lb                 | unchanged                                      |
| human limit         | **none existed**                | `MAX_FAT_FREE_MASS_INDEX` — 29 male, 23 female |

### 18.2 The finding: a population coefficient was being used as an individual bound

`massCoefficient` works in lean kilograms per cubic metre of height because § 2 fitted the
_population_ that way, and that fit is good. But the scale ceiling was a **constant in those units**,
and a constant there is not a constant limit. Divide it out into a fat-free mass index — lean kg over
height squared, the height-independent way to say how muscular somebody is — and the ceiling the
model was actually enforcing was:

|        |  58" |  61" |  64" |  68" |  70" |  73" |  76" |  79" |
| ------ | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| male   |    — | 23.9 | 24.9 | 26.4 | 27.2 | 28.4 | 29.5 | 30.7 |
| female | 19.2 | 20.1 | 21.1 | 22.4 | 23.1 |    — |    — |    — |

Untrained men sit near FFMI 19 and elite natural athletes near 25. So the model was telling a 4'10"
woman she could not be more muscular than an untrained adult, and a 6'7" man that he could exceed
anything reached without pharmacology. Nobody chose that shape. It fell out of using a population
coefficient as an individual bound — **and it is why every body the model could not build was a short
one.**

### 18.3 The three failures, classified

| fighter         | measurements               | implied FFMI | verdict                               |
| --------------- | -------------------------- | -----------: | ------------------------------------- |
| Mark Hunt       | 5'10", 265 lb at 15.9% fat |     **32.0** | `implausible` — the estimate is wrong |
| Cain Velasquez  | 6'1", 250 lb at 11.4% fat  |     **29.2** | `implausible` — the estimate is wrong |
| Jessica Andrade | 5'1", 136 lb at 17.9% fat  |         21.1 | `aboveScale` — the model is too small |

That split is the deliverable, and the two halves need opposite fixes.

**Hunt and Velasquez describe nobody.** 265 lb at 15.9% fat is 223 lb of lean mass on a 5'10" frame.
But the estimates were not really judgements about them — they were artefacts of a body-fat band that
stopped at 18% and could not express a heavyweight carrying real fat, which is the one division with
no upper weight limit and therefore the one that keeps them. Re-authored at 26% and 15%, both build
exactly, at FFMI 28.1 and 28.0. Hunt's Power and Strength now resolve _lower_ than before, because a
fat 265 lb man has less contractile mass than a lean one — which is the lean-versus-carried split
doing precisely its job.

**Andrade is an ordinary body the scale could not hold.** FFMI 21.1 against a female limit of 23, and
the scale ceiling at her height was 20.1. She is the only plausible body in the roster that the model
could not express, and she is what sized the correction.

### 18.4 What changed, and what deliberately did not

Both fixes are the same device: an exponent that lets a range reach further at the top **without
moving its middle**, so the generated population's median is exactly where § 13.7 measured it.

- `fatCurve` — band widened to 30% (male) and 32% (female); index 50 still maps to 12.9% and 19.9%.
- `massCurve` — span widened from 5.8 to 6.7 (male) and 4.8 to 6.0 (female); index 50 still maps to
  coefficient 12.40 and 10.60.
- `MAX_FAT_FREE_MASS_INDEX` — the first thing in the model that says what a person cannot be.
- `solvePhysique` replaces the silent clip and returns `none` / `belowScale` / `aboveScale` /
  `implausible`, so a caller can tell "the model is too small" from "the measurements are wrong".
- Every authored `bodyFatIndex` was re-derived to preserve the _fat fraction_ it stood for, so no
  fighter's body changed when the curve did. Only Hunt and Velasquez were deliberately re-estimated.

**The artefact is reduced rather than eliminated, and it is worth saying so.** The index scale now
sits above the human limit for men taller than 70.5" and women taller than 63.8"; below those heights
it still binds first. No fighter in the roster falls in the gap — the shortest are 63" and 61" — and
a test bounds that. Closing it completely would mean widening the scale until index 100 described a
body nobody has, which trades a visible artefact for an invisible one.

**`base`, and the coefficient range itself, were not touched.** The audit checked whether they needed
to be and they do not: the roster's required coefficients put the median at 44–56% of the band by
sex, which is a distribution sitting in the middle of its range rather than pressed against the top.
The instruction not to raise `COMPOSITION` until Hunt fits was the right one — raising it would have
been fixing the wrong thing, since Hunt's problem was never that he was too muscular to represent.

What the population does now: bodies below the median come out slightly lighter and those above it
slightly heavier, because the curve replaces a linear scale with a right-skewed one — which is what
mass distributions look like. Body fat now rises across the divisions on its own, 12.2% at flyweight
to 16.7% at heavyweight, which nothing put there deliberately: heavier bodies come from higher
indices, and higher indices are fatter under the curve.

### 18.5 The baseline, re-run

| div |       walking | lean | body fat | camp | floor | cut req |
| --- | ------------: | ---: | -------: | ---: | ----: | ------: |
| FLW | 135 (120–147) |  118 |    12.2% |  127 |   114 |    7.5% |
| LW  | 172 (161–182) |  149 |    13.2% |  160 |   144 |    9.7% |
| WW  | 185 (173–198) |  160 |    13.6% |  172 |   154 |    8.2% |
| HW  | 247 (226–279) |  206 |    16.7% |  221 |   198 |    0.6% |
| WSW | 121 (104–134) |   97 |    19.6% |  112 |   100 |    6.0% |
| WFW | 162 (149–178) |  127 |    21.3% |  146 |   132 |   10.2% |

Against § 13.7: walking weights up two to four pounds, floors down six to fourteen (that is § 15's
cut model, not this change), lean broadly unchanged. Frame remains a body variable rather than a
division label — within-division sd 16.2–17.1 against a population 18.

### 18.6 Step 6 can now proceed

The mass law, physiology decoupling, the Power/Strength/Speed correlation problem, the sex-specific
pivots and the generator-versus-roster comparison. Two things carry forward unchanged:

**The withdrawn ρ ≈ 0.7 target stays withdrawn** (§ 16.2). The step 5 correlation matrix is evidence
that distinct archetypes must be common, not a set of coefficients to fit.

**The lower tail is less strongly calibrated than the upper one** (§ 17.1). All fifty extreme roster
placements are positive, and none was invented to balance that. Absence of landmarks at the bottom is
not evidence of absence of weak athletes, and population work must not read it as such.

---

## 19. Step 6: the ladder reaches the generator

The change the whole redesign has been building toward. Until now the ladder existed in
`physicalScale.ts` and in the calibration roster, and the generator computed its physicals a
completely different way — five ad-hoc linear blends on a 1–100 index scale, every coefficient a
guess:

```
power    = explosiveness × 0.60 + lean × 0.25 + skill × 0.15
strength = (explosiveness + lean) / 2 × 0.90 + skill × 0.10
cardio   = engine × 0.85 + skill × 0.15 − max(0, (carried − 60) / 40) × 8
```

Each of the five is now the ladder itself:

```
rating = medianRatingAtMass(key, sex, walking, lean) + individual × ratingSd(key)
```

### 19.1 What comes for free, and what left

**The sex pivot arrives in generation.** `medianRatingAtMass` takes a sex and reads
`PIVOT_WALKING_WEIGHT_LBS`, so § 2.3's per-sex pivot finally applies to the world and not only to
the roster. Before this, a 135 lb woman and a 135 lb man got the same Power ceiling from the same
`explosiveness`. Nothing in the new code says "female" anywhere.

**Lean against carried stops being a coefficient.** Power, Strength and Durability read lean mass;
Speed and Cardio read everything the fighter has to move. That is `PHYSICAL_SCALE[key].basis`.

**`carriedPenalty` is gone.** Cardio's mass exponent is −0.25, so a heavyweight's engine falls out of
the same equation that raises his Power. The old hinge at carried-index 60 was that fact drawn by
hand, and it applied to nobody below the hinge.

**Motor learning leaves the physicals.** All five blended it at 5–25%, making every physical partly a
function of how fast the fighter learns _skills_ — a shared latent inflating § 13.1's correlations,
and a category error besides.

### 19.2 The mass law alone made the correlation problem worse

Worth recording because it is counter-intuitive and it is the reason the decoupling could not be
skipped. Power × Strength went from **0.85 to 0.92**: both read `explosiveness`, and now both also
read lean mass with a positive exponent, so the ladder added a second shared term to a pair that
already had one.

### 19.3 The force–velocity curve

Maximal force and unloaded velocity are two ends of one curve and a muscle cannot sit at both. So
`explosiveness` keeps its job as _how good the neuromuscular system is_, and one new natural —
**`forceVelocityBias`** — says _where on the curve it sits_. Drawn flat and independent of
`athletic`, because it is not a quality: a world-class athlete is no likelier to be force-biased
than a club fighter, and centring it on athleticism would have made it a fifth measure of how good
somebody is.

Three consequences, in order of how much work they do:

**Peak Power sits on the force side of the curve, not the middle.** The textbook vertex is central,
and the first draft put it there — which made "powerful but not especially fast" a 2.3% shape
against "fast but not especially powerful" at 5.3%, because a force-biased fighter was docked as
hard as a velocity-biased one. The sport says otherwise and so does the mechanics: a strike lands
momentum and the mass behind it is part of the product. The three hardest hitters in the roster are
Ngannou, Lewis and Hunt, and none of them is quick. The vertex moves half a sigma toward force.

**Strength reads muscle share.** Maximal force scales with contractile cross-section, and
`frameIndex` and `muscleIndex` are already independent body variables saying exactly that. Their
_difference_ is used, because total lean mass is in the ladder's mass term already and reading it
twice would count the same fact twice. This is what makes "strong but not explosive" — gym strength
with no snap, one of the most ordinary shapes in the sport — reachable at all.

**Speed and Strength take a smaller share of `explosiveness` than Power does**, which is what lets
the ends of the curve separate from its middle.

### 19.4 The acceptance criterion is archetype frequency, not a coefficient

Per § 16.2. `tests/statistical/physical-archetypes.test.ts` measures the population directly, on
within-division percentiles, because the question is about the fighter and not his weight class.

| archetype                               | share | per 30-man division |
| --------------------------------------- | ----: | ------------------: |
| powerful, not especially fast           |  4.6% |                 1.4 |
| fast, not especially powerful           |  7.8% |                 2.3 |
| strong, not explosive                   |  3.3% |                 1.0 |
| powerful, poor cardio                   |  3.6% |                 1.1 |
| technically gifted, physically ordinary |  1.6% |                 0.5 |
| freakish and uneven                     |  7.5% |                 2.3 |

And the other half, which stops the criterion being satisfiable by making everything independent
noise: **4.2%** of fighters are uniformly strong or uniformly weak across all five. Five independent
attributes would give 0.5%; one shared scalar would give most of the roster. Shared physiology is
supposed to be visible, and it is.

The correlations that fell out — never fitted to:

| pair                | before step 6 |     after | roster |
| ------------------- | ------------: | --------: | -----: |
| power × strength    |          0.85 |  **0.72** |   0.65 |
| power × speed       |          0.89 |  **0.20** |  −0.10 |
| speed × strength    |             — | **−0.22** |  −0.33 |
| cardio × durability |             — |      0.35 |   0.33 |
| power × cardio      |             — |      0.21 |  −0.65 |

### 19.5 Two things the comparison itself got wrong

**§ 13.9.3 compared the wrong columns.** It read the roster's ρ = 0.34 for Power × Strength against
the generator's 0.85 — but 0.34 was measured on the **sigma placements**, which exclude the mass
term entirely, and 0.85 on ratings, which do not. The comparable roster figure is 0.65. The
conclusion that the generator was collapsing distinct profiles was right; the size of the gap was
overstated by roughly half.

**Power × Cardio still disagrees in sign** — roster −0.65, generator +0.21 — and the cause is
composition rather than physiology. The roster holds nine to fourteen fighters in every division, so
mass variation dominates it; a quarter of generated men are welterweights, so mass varies less and
the shared `athletic` centre shows through. Recorded rather than tuned away, because the shape it
stands for is measured directly: "powerful with poor cardio" is 3.6% of the population.

### 19.6 The landmarks are rare, and that is arithmetic

An early draft of `generator-vs-roster.test.ts` asserted every roster rating fell inside the range of
a 600-fighter generated division. It failed on eleven entries, nine of them Cardio — and the
assertion was wrong, not the generator. A roster entry is placed in sigmas above his _major
promotion_ division; a generated division is everybody. Dvalishvili at +2.9σ over the UFC median sits
at **+3.54σ** over the population one, which is rarer than one in six hundred by construction.

Asked properly — how far into its own tail must the generator reach? — the answer is that the most
extreme landmark in the file is Covington's Cardio at **+3.80σ**, and nothing exceeds four. These are
fighters the world will produce given enough of them, which is what a landmark should be.

### 19.7 What it broke, and why each break was correct

Five tests failed, and none of them was re-baselined without an argument.

**Player builds had no say in the force–velocity bias.** A created fighter who spent every
discretionary point on Speed rolled his bias at random and got a slow fighter half the time —
a karate natural built for speed debuted at 64 against an expected 77. The bias is now moved by the
difference between what was spent on Speed and what was spent on Strength, from discipline and
allocation together. That is a real trade rather than a free upgrade: velocity bias costs maximal
force, and either extreme costs a little Power.

**Talent separates the physicals less than it did**, and should. Freak against grinder on Speed was
a five-point gap and is now 4.2. Every physical used to blend in `motorLearning` at 5–25%, so a
talent tier reached Speed _twice_ — once through explosiveness and again through how fast the
fighter learns skills. The freak is still visibly quicker; he is no longer quicker _because he is a
fast learner_.

**"Elite physical ceiling ≥ 80" stopped being a sensible threshold.** `talent-axes.test.ts` wanted
more than 3% of local-level fighters to clear it, and the old model gave 6.8%. On the absolute
ladder that reading says one regional fighter in fifteen is better than the best lightweight in the
UFC — § 4.3 puts a major-promotion lightweight's best-of-thirty Power at 78. The requirement it stood
for is kept and asked against the population instead: what share of local fighters are top-5% of the
whole sport at something?

**The physical spread bound pointed at an artefact.** It bounded each physical against what the
pre-ladder generator happened to produce — cardio 13.8, which was `engine × 0.85 + motorLearning ×
0.15` inheriting the widest natural in the model. The ladder states the answer: within a population
at one mass the spread is `ratingSd(key)`, 9.7 to 11.3. Bounding against the doc's own number is
bounding against the design.

**One golden fighter moved**, and the movement is step 6 in a single case: Power 62 → 57, Speed
80 → 42, Cardio 65 → 57, Durability 77 → 63, with the ten technical attributes almost unmoved. His
motor learning is 67, and a quarter of it used to be counted as Speed.

### 19.8 Still open

- **`constitution` has not been split** into neurological and structural robustness (§ 14).
- **Cardio's equation shape** (§ 14.4) — capacity × conditioning rather than one additive term.
- **The residual index-scale artefact below 70.5" / 63.8"** (§ 18.4).
- **The lower tail of the roster is weakly calibrated** (§ 17.1) — all fifty extreme placements are
  positive, and population work must not read that as evidence about weak athletes.

---

## 20. Step 7: the ladder, measured against the fights it produces

Everything before this validated the ladder against itself. § 9's ten measurements and § 9.1's
controlled experiments ask the only question that finally matters: **does a world built on this
ladder fight like the sport does?**

Two instruments. `ladder-falsifiers.test.ts` runs every same-division pairing in the shipped 2026
roster — **35,627 fights across twelve divisions** — and reports § 9 by division.
`mass-experiments.test.ts` builds fighters identical in every rating and differing only in the one
variable under test, because a population statistic can say something is wrong and is very bad at
saying what.

### 20.1 The population, by division

```
  div     fights    KD/100 head   KO%   sub%   dec%   R3+ finishes   mean sec   R3:R1
  FLW      4,560          3.06   25.2   18.1   53.9           12.4        632    0.552
  BW       4,278          4.85   39.6   13.3   44.2           11.3        554    0.549
  FW       3,916          4.92   36.3   14.8   46.0           10.6        567    0.563
  LW       4,465          4.81   31.5   17.7   48.0           13.0        587    0.569
  WW       4,095          5.38   40.8   14.5   42.7           11.4        537    0.590
  MW       4,371          5.92   39.3   16.0   41.9           11.9        552    0.600
  LHW      4,278          7.74   49.4    8.3   39.1            9.1        498    0.624
  HW       4,005          7.42   46.3   10.9   39.4            8.3        509    0.621
```

**Measurement 1, the cleanest single test, passes.** Knockdowns per 100 head strikes landed run
**3.06 at flyweight to 7.42 at heavyweight, a ratio of 2.42×**. § 9 says this isolates
β_power − β_durability from pace and volume, and that the ladder fails if heavyweight comes out only
1.4× a flyweight. It does not.

**Measurements 2, 3, 6 and 8 pass.** KO rate 25.2% → 46.3% (1.84× against a real ≈ 2.6×, directionally
right and short); decisions 53.9% → 39.4% against a real 55–60% → 30–35%, with the flyweight end
exact and the heavyweight end conservative; mean duration falls 632s → 509s; and a flyweight at p95
still reaches a heavyweight's median on every one of the five, so the divisions overlap and the
ladder has not become a caste system.

**S3 and S5 pass.** Control time per grappling exchange runs 48.7 → 55.6 seconds across the men's
ladder, a 1.14× spread — flat, as § 9.1 predicts, so big men are not winning position on mass.
Submission finish rate declines mildly, 18.1% → 10.9%, which is the predicted shape and is never
acted on alone anyway.

**D1 passes.** Two points of Durability against identical absolute Power move the drop rate by
**−3.1%** — a few per cent, not tens, exactly as § 9.1 predicts for an exponent of +0.10.

### 20.2 Measurement 4 cannot be taken from a population

§ 9 calls round-3 volume decay the measurement that isolates β_cardio "directly and with nothing else
in the way". Over the roster it does no such thing, and it comes out backwards: flyweights fall to
0.552 of their round-one volume and heavyweights only to 0.621.

The confound is survivorship and it is large. A fight contributes only if it _reached_ round three,
and heavyweight fights mostly do not — 8.3% of heavyweight finishes come in round three or later
against 12.4% at flyweight, on a mean duration of 509 seconds against 632. The heavyweight bouts that
see a third round are the ones between two men who could still stand, which is a sample selected on
precisely the trait being measured.

So it is reported rather than asserted, and the question moved to a controlled experiment where
nothing is selected.

### 20.3 Two disagreements, both engine-side

**Strength barely reaches the grappling (S1, S2).** Eight points of Strength — roughly two divisions
on the ladder — with every other rating held identical produces a control-time ratio of **1.07**
against § 9.1's predicted 1.3–1.7, and the stronger man wins **48.3%** of 1,200 bouts. Swept from 38
to 98 against an unchanged opponent, Strength moves the win rate **8.4 points where Wrestling moves
21.6** — it is worth 39% of Wrestling.

Two readings fit and one experiment cannot choose between them. Either the engine under-reads
Strength, or § 9.1's band was set by intuition and predicts an effect larger than the wiring can
deliver: Strength enters the clinch at 0.35 of `clinchOffence` and 0.45 of `clinchDefence`, so eight
points move those by 2.8 and 3.6 out of 55, and a five per cent edge producing a 40% control swing
would be the engine _over_-reading it.

§ 8.4's rule is that `D_strength` moves only on S1, S2 and S4 together — and **S4 cannot be measured
yet**. `FightStats` has no bottom-position time and no reversal counter, so escape rate from bottom
is not available without a position-transition counter that does not exist. Recorded as a gap rather
than approximated, because an approximation here would look like evidence about β_strength and would
not be.

**Cardio is wired but under-powered (C1).** With both fighters in each pair matched, so nothing is
selected on conditioning:

```
  cardio   round 1   round 3   R3:R1
      25      20.2      11.2   0.553
      55      21.6      10.9   0.504
      85      20.9      12.9   0.619
```

Round one is flat, as it should be. Round three moves from 11.2 to 12.9 — **sixty points of Cardio,
six standard deviations, the entire width of the professional population, buys about 15% more
third-round output.** In the sport the difference between a gas tank and no gas tank late is not 15%.

Note also that the _ratio_ column is U-shaped and misleading: two exhausted fighters at Cardio 25
throw little when fresh and little when tired, which flatters their decay. Absolute third-round
volume is the question the sport asks.

### 20.4 `BASE_KD_HAZARD` was not re-anchored, and that is the finding

§ 12 step 7 anticipated re-anchoring it once against a finished body model. The measurements say it
does not need it. Measurement 1 passes at 2.42×, and `roster-profile.test.ts` — which is what the
constant was tuned against — still reports the shipped roster at 49.5% finishes and 30.1% KO against
a real sport at roughly 48% and 31%.

A constant the plan expected to move and the evidence says to leave alone is worth recording as
plainly as one that moved. **No fight-engine constant changed in step 7.**

### 20.5 What step 8 inherits

The scale is ready to lock on the evidence of § 20.1: the ladder's predictions about how fighting
changes with weight are borne out on 35,627 fights, on the measurement § 9 nominated as the cleanest
single test, and on the two controlled experiments that could be run.

The two disagreements in § 20.3 are **engine consumption**, not ladder shape. Neither indicts an
exponent, a pivot or a `D`. They are the next decision rather than part of this one, and they need
what step 7 could not build: S4's position-transition counter, so that the Strength question has the
second witness § 8.4 requires before anything moves.
