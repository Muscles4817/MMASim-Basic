# 22 — The attribute model, catalogued

**Status:** reference, not a proposal. Every number here was read out of the code rather than
recalled, and each is cited to the file that owns it. Written so the model can be argued with as a
whole, because it is currently defined across six files and no single place states what a fighter's
Power actually *is*.

> **The finding this was written for.** The engine contains **two different theories of how a young
> fighter's body works, and they contradict each other.** Generated fighters use `ARRIVAL`
> (`generation.ts:215`), which says a 21-year-old is already at 92–99% of their speed and chin and
> that "an athletic freak reads as one on the day they debut". Player-created fighters use
> `BASELINE + experience` (`createFighter.ts:412`), which starts every attribute at 46 and adds up
> to 7 points *for being older* — so a created 22-year-old is flatly slower, weaker, less durable
> and worse-conditioned than the same fighter created at 30. The second theory is the one the
> player meets, and it is the one the sport disagrees with.

---

## 0. How to read this

A fighter carries three parallel blocks of fifteen numbers:

- **`attributes`** — what they can do now. 1–100, integers, absolute across the whole sport (doc 02:
  Power 78 is the same force in any division).
- **`potential`** — the per-attribute ceiling. Never one number; a fighter can have a 90 wrestling
  ceiling and a 55 power ceiling, and those are different facts about their body.
- **`naturals`** — hidden physiology: `frame`, `explosiveness`, `engine`, `constitution`,
  `recovery`, `motorLearning`, `injuryProneness`, `ageCurve`. Never shown. These *set the ceilings*
  and nothing else — `explosiveness`, `engine` and `constitution` are read nowhere in the engine
  outside `generation.ts` and `createFighter.ts`.

Plus `trainingCarry`, which banks the fractional part of a camp's gain so tenths are not rounded away.

Bands (`attributes.ts:219`): **96+** all-time · **90** best in the world · **82** elite · **72** very
good · **62** solid · **50** average · **38** below level · **20** liability.

---

## 1. Where a starting number comes from

Three entirely separate paths, which is the root of §0.

### 1.1 Hand-authored roster — 139 named fighters

Typed in by hand, `seed/fighters-*.ts`. Measured distribution:

| | min | p10 | median | p90 | max |
|---|---|---|---|---|---|
| power | 40 | 48 | 66 | 84 | 99 |
| speed | 48 | 58 | 70 | 80 | 88 |
| cardio | 30 | 58 | 74 | 84 | 97 |
| durability | 40 | 58 | 70 | 82 | 90 |
| strength | 52 | 58 | 70 | 84 | 92 |

Overall: median **67.5**, floor 51.1, max 84.6.

### 1.2 Generated filler — the rest of the world

`generateFighter` (`generation.ts:231`). Ceiling first, then a fraction of it by age:

```
naturals  = normal(centre = remap(tier, 1,100 → 38,78), sd 12–16)
ceiling   = ceilingsFromNaturals(naturals)
attribute = ceiling × arrivalFactor(key, age) ± 3
```

`ARRIVAL` (`generation.ts:215`) — the fraction of the ceiling already reached, at age 20 → 30:

| attribute | at 20 | at 30 | rationale in the code |
|---|---|---|---|
| speed | **0.92** | 0.99 | "the most innate thing in the sport… everything after that is decline" |
| durability | **0.92** | 0.99 | "a chin is at its best before anybody has hit it" |
| power | **0.85** | 0.98 | "mostly explosiveness, with some technique in it" |
| strength | **0.78** | 0.97 | "the weight-room years are worth about a fifth, not a third" |
| cardio | **0.68** | 0.96 | "the most trainable quality a fighter has" |
| everything else | 0.55 | 0.85 | "wrestling and fight IQ take a decade" |

### 1.3 Player-created — `createPlayerFighter`

`createFighter.ts:412`. **Ceilings play no part.** The formula is additive from a flat base:

```
attribute = 46                                   BASELINE          createFighter.ts:301
          + disciplineBias × attainment.skill    0–17 × 0.8–1.3    origin.ts:542
          + allocation                           0–8 (24 total)    createFighter.ts:157
          + (age − 18)/17 × 7                    0–7               createFighter.ts:417
          + U[−2, +2)                                              createFighter.ts:418
          − 8 if every attribute rolled ≥ 50                       createFighter.ts:440
```

Then `potential[key] = max(rolledCeiling, value + 4)` — the ceiling is *raised to fit* rather than
constraining the start (`createFighter.ts:435`). The `Math.min(raised, value)` on the next line is
dead code: `raised` is always ≥ `value + 4`.

**Talent tier does not appear in that formula.** `freak`/`natural`/`grinder` set only
`naturalsCentre` — 78 / 73 / 68 (`origin.ts:89,98,113`) — which sets ceilings, which are then
overwritten upward. Two fighters with the same discipline, attainment, age and allocation debut
statistically identical whichever tier was chosen. **Build does not appear either**: `buildShift`
touches walking weight, two naturals, height and reach, and no attribute.

Discipline bias, the only thing that moves a created fighter's physicals (`origin.ts:175-284`):

| discipline | power | speed | cardio | durability | strength |
|---|---|---|---|---|---|
| boxing | 5 | 6 | – | – | – |
| kickboxing | – | – | – | 5 | 2 |
| karate | – | 11 | – | – | – |
| wrestling *(the screen's default)* | – | – | 2 | – | 7 |
| jiu-jitsu | – | – | – | – | – |
| judo | – | – | – | – | 6 |
| track & field | 6 | 9 | – | – | 3 |
| contact sport | 4 | – | – | 6 | 8 |
| endurance sport | – | – | 11 | – | 3 |

Measured outcome, default screen state (natural / wrestling / regional, age 22, no points spent):
**power 46–50, speed 46–50, cardio 48–52, durability 46–50, strength 53–57**; overall ≈ 50.

---

## 2. The catalogue

Fifteen attributes. **Start** columns are the default-state created fighter and the generated
fighter's share of ceiling. **Trained by** is `TRAINING_META` (`development.ts:76`) — the weight is
relative to `BASE_GAIN_PER_BLOCK = 3.474` per block. **Decline** is `DECLINE_RATE`
(`development.ts:477`), multiplied by `BASE_DECLINE_PER_YEAR = 1.1` and an accelerating severity
past peak age.

### Physical

| attribute | created start | generated (20→30) | ceiling from | trained by | decline |
|---|---|---|---|---|---|
| **Power** | 46–50 | 0.85 → 0.98 | `explosiveness` ×0.85 + `motorLearning` ×0.15 | Conditioning **0.35** | 1.15 |
| **Speed** | 46–50 | 0.92 → 0.99 | `explosiveness` ×0.75 + skill ×0.25 | Boxing 0.4, Kicks 0.3 | **1.4** (fastest) |
| **Cardio** | 48–52 | 0.68 → 0.96 | `engine` ×0.85 + skill ×0.15 | Conditioning **1.0** | 0.7 |
| **Durability** | 46–50 | 0.92 → 0.99 | `constitution` ×**0.95** + skill ×0.05 | Conditioning **0.25** | 0.5 |
| **Strength** | 53–57 | 0.78 → 0.97 | (`explosiveness`+`frame`)/2 ×0.9 + skill ×0.1 | Conditioning 0.7, Kicks 0.4, Wrestling 0.4 | 0.9 |

### Striking

| attribute | created start | generated | ceiling from | trained by | decline |
|---|---|---|---|---|---|
| **Striking offence** | 46–50 (+17 boxing) | 0.55 → 0.85 | `explosiveness` ×0.3 + skill ×**0.7** | Boxing **1.0** | 0.45 |
| **Kicking** | 46–50 (+16 kickboxing) | 0.55 → 0.85 | `explosiveness` ×0.3 + skill ×0.7 | Kicks **1.0** | 0.9 |
| **Striking defence** | 46–50 (+12 boxing) | 0.55 → 0.85 | (`explosiveness`+`recovery`)/2 ×0.3 + skill ×0.7 | Boxing 0.9, Kicks 0.65, Fight IQ 0.3 | 0.6 |

### Grappling

| attribute | created start | generated | ceiling from | trained by | decline |
|---|---|---|---|---|---|
| **Wrestling** | 46–50 (+15 wrestling) | 0.55 → 0.85 | (`explosiveness`+`engine`)/2 ×0.4 + skill ×0.6 | Wrestling **1.0** | 0.8 |
| **Takedown defence** | 46–50 (+12 wrestling) | 0.55 → 0.85 | same | Wrestling 0.9, Fight IQ 0.3 | 0.7 |
| **Ground control** | 46–50 (+8 jiu-jitsu) | 0.55 → 0.85 | `engine` ×0.3 + skill ×0.7 | Wrestling 0.6, Submissions 0.5 | 0.4 |
| **Submissions** | 46–50 (+16 jiu-jitsu) | 0.55 → 0.85 | `recovery` ×0.15 + skill ×**0.85** | Submissions **1.0** | 0.15 |
| **Scrambling** | 46–50 (+11 jiu-jitsu) | 0.55 → 0.85 | (`explosiveness`+`engine`)/2 ×0.4 + skill ×0.6 | Submissions 0.85 | 1.0 |

### Mental

| attribute | created start | generated | ceiling from | trained by | decline |
|---|---|---|---|---|---|
| **Fight IQ** | 46–50 (+4 karate) | 0.55 → 0.85 | `motorLearning` ×0.1 + skill ×**0.9** | Fight IQ **1.0** | **0.0** |
| **Composure** | 46–50 (+4 jiu-jitsu) | 0.55 → 0.85 | `recovery` ×0.4 + skill ×0.6 | Fight IQ 0.8 | **0.0** |

---

## 3. How much a fighter can grow

### 3.1 One camp

```
gain = 3.474                                        BASE_GAIN_PER_BLOCK
     × blocks = ((weeks − 2) / 4) ^ 0.75            CAMP_RAMP_WEEKS = 2, BLOCK_CURVE = 0.75
     × focusWeight                                  the table in §2
     × focusShare                                   1.0 one focus, 0.65 each for two
     × motorLearning → 0.35–1.9
     × coach → 0.4–1.6  (0.55 with no coach)
     × gym quality → 0.5–1.35
     × personality × traits
     × learningRate(age) → 1.45 at 20, floor 0.55
     × headroom = ((ceiling − current) / ceiling) ^ 0.7
     × luck 0.75–1.3
```

Blocks by camp length: **4 weeks = 0.59**, 8 weeks = 1.68, 12 weeks = 2.99. A four-week camp is a
sharpening camp; the ramp is what stops splitting camps beating consolidating them.

`headroom` is asymptotic, so 60 → 70 is far easier than 80 → 85 and ceilings are approached, rarely
reached.

### 3.2 A career

`learningRate` (`development.ts:191`) runs 1.45 at age 20 down to a floor of 0.55 at peak + 8, so
learning never stops. Peak age by curve (`development.ts:178`): earlyBloomer 26, standard 29,
longPeak 31, lateBloomer 33 — drawn weighted 1.5 / 5 / 2 / 2.

### 3.3 Decline

Nothing declines before peak age. After it:

```
loss/year = 1.1 × DECLINE_RATE[key] × ((age − peak) / 6) ^ 1.35 × U[0.7, 1.3]
```

Floored at `max(12, ceiling × 0.4)` — a former elite is diminished, not a novice. Ranked fastest to
slowest: **speed 1.4**, power 1.15, scrambling 1.0, strength 0.9, kicking 0.9, wrestling 0.8, cardio
0.7, takedown defence 0.7, striking defence 0.6, **durability 0.5**, striking offence 0.45, ground
control 0.4, submissions 0.15, **fight IQ 0.0, composure 0.0**.

---

## 4. The contradictions, stated plainly

Not recommendations — observations, for the review this document exists to enable.

**4.1 — Two theories of youth, and the player gets the wrong one.** §1.2's `ARRIVAL` table and §1.3's
`experience` term are opposite claims about the same thing. `ARRIVAL` says a 21-year-old's speed and
chin are 92% built and their strength 78%; `experience` says every attribute rises 0.41 points per
year of age from 18 to 35, uniformly, physicals included. A created 22-year-old is 1.6 points into
that curve and a created 30-year-old is 4.9 — so **within the creation screen, being young is
strictly worse at everything**, including the two qualities the generation code explicitly says are
at their best when young.

**4.2 — Nobody is born strong.** Everything starts at 46 ± 2 before bias. The largest physical bias
available is +11 (endurance sport → cardio, or karate → speed), and the biggest reachable Power is
71 against a hand-authored roster median of 66 and max of 99. There is no created fighter who is
simply an athletic outlier at debut, because the outlier lives in the naturals and the naturals do
not touch the starting numbers.

**4.3 — Durability is nearly untrainable and nearly ungrowable.** Ceiling is 95% `constitution`;
trained only by Conditioning at weight 0.25, the lowest in the game; and for a created fighter the
ceiling is frequently `start + 4` (§1.3), which caps a whole career's chin development at four
points. Power is the same story at 0.35 and 0.15.

**4.4 — Speed peaks by construction, not by design.** It has the highest decline rate (1.4) and
starts at 92% of ceiling for generated fighters, so generated speed peaks in the early 20s. But
created fighters gain speed with `experience` until 35 while the decline only starts at 29 — two
different peaks for the same attribute depending on where the fighter came from.

**4.5 — Fight IQ and composure never decline.** Rate 0.0, deliberately. Worth flagging only because
it means an old fighter's overall is held up by two attributes that cannot fall.

**4.6 — The creation preview does not show the fighter you get.** `CreateFighterScreen.tsx:217`
previews with `createRng('preview:…')`; `:280` creates with `createRng('create:player_<Date.now()>')`.
Different streams: every attribute can differ by up to 4, and the naturals — which set every ceiling
— are an entirely separate draw.

---

## 5. What is *not* in question

- **Ratings are absolute.** Doc 02, and it holds throughout.
- **Nothing derived is stored.** `overallRating` and every derived rating are computed on read.
- **The camp arithmetic is shared.** `forecastTraining` and `applyTraining` call the same `rawGain`,
  so a forecast cannot drift from the camp it predicts.
- **Fight frequency.** Doc 21 §0 measured it as realistic and nothing here touches it.
