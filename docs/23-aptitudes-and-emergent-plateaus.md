# 23 — Aptitudes, emergent plateaus, and what a body will not do

**Status:** design, approved in outline, implemented in the same pass. Supersedes the _mechanism_ of
doc 22 §3 while keeping its catalogue accurate as a record of what came before. The physiological
numbers come from the realism review of doc 22; the structure comes from a simpler observation than
any of them, which is that **a fighter does not have a number written on them saying how good they
are allowed to get.**

> **The change in one sentence.** A skill's hard ceiling is replaced by a **rate** — how fast this
> fighter learns this family of things — and where they end up becomes the point at which their
> gains stop outrunning their decline. Physicals keep their ceilings, because a chin and a
> fast-twitch profile really are written down at birth.

---

## 1. Why the ceiling had to go

The old model stored `potential[key]` per attribute and multiplied every gain by
`headroom = ((ceiling − current) / ceiling) ^ 0.7`, which reaches exactly zero at the ceiling. Three
consequences, and only the third is about realism.

**1.1 — It made talent invisible and then final.** A fighter's whole career was decided by fifteen
numbers rolled before they ever trained. Doc 22 §1.3 showed the created path then _overwrote_ those
numbers to `start + 4` whenever the roll came out low, so a created fighter could have four points of
chin available for an entire career and no way to know or change it.

**1.2 — It made every choice reversible into the same place.** With a hard ceiling, what you train
decides _when_ you arrive, never _where_. Two fighters with identical ceilings who trained
differently for a decade converge. That is the opposite of what the sport looks like, and it is why
doc 19 §12 had to add `pickTrainingFocus` to stop the whole roster drifting to the same shape.

**1.3 — Nobody has a ceiling.** They have a rate, and a career length, and a body that starts taking
things away in their late twenties. Where a fighter tops out is the point where those cross. That is
not a modelling convenience — it is the actual mechanism, and modelling it directly gets the
population shape for free instead of having to roll it.

---

## 2. The model

### 2.1 Two kinds of attribute, and they work differently

**Physical — power, speed, cardio, durability, strength.** Keep a hard ceiling from naturals. These
are genuinely capped: explosive power is 74–84% heritable, muscle fibre composition ~50%, and no
amount of work makes a chin out of nothing. Unchanged in kind, though §4 changes the numbers.

**Skill — the eight technical and two mental attributes.** No ceiling at all. Gains are governed by

```
resistance(current) = ((100 − current) / 80) ^ 1.4
```

Calibrated against the `headroom` curve it replaces rather than invented — the divisor and exponent
were fitted so the two agree through the band where development actually happens, then checked
against the twenty-year long-sim:

| current                           | 40   | 50   | 60   | 70   | 80   | 90    | 95    |
| --------------------------------- | ---- | ---- | ---- | ---- | ---- | ----- | ----- |
| **resistance**                    | 0.67 | 0.52 | 0.38 | 0.25 | 0.14 | 0.054 | 0.021 |
| old `headroom` (vs an 85 ceiling) | 0.64 | 0.54 | 0.43 | 0.30 | 0.14 | **0** | **0** |

Within a few percent at 40 and 80, slightly under through the middle, and then it keeps going where
the old curve fell off a cliff. A fighter at 90 gains at 10% of the rate they did at 50. Reaching 95
is possible and takes a career of doing nothing else — which is what a genuine specialist looks like.

Both constants matter and they were tuned against opposing tests, which is worth recording: a
shallower curve let a career reach champion level but made a single camp on a raw prospect too big,
and a steeper one did the reverse. The pair that satisfies both is the pair that matches the old
curve's _shape_ at the bottom while extending past 85.

### 2.2 Aptitudes — the rate, and there are four of them

Hidden, 1–100, rolled at generation and creation:

| aptitude       | governs                         |
| -------------- | ------------------------------- |
| `striking`     | Boxing and Kicks camps          |
| `grappling`    | Wrestling and Submissions camps |
| `conditioning` | Conditioning camps              |
| `strategy`     | Fight IQ camps                  |

Drawn around `motorLearning` as the mean with a per-family deviation of SD 12, so `motorLearning`
keeps its documented job — "rate of skill acquisition, the biggest single driver" — and gains the
texture the old single number could not express. The multiplier is

```
aptitudeRate = clamp(remap(aptitude, 20, 95, 0.45, 1.85), 0.4, 1.9)
```

which replaces the `motorLearning` term that used to sit in `rawGain`.

**This is what "develop in a direction of your choice" means mechanically.** A fighter with
grappling 85 and striking 40 who spends every camp boxing will still improve — at roughly a quarter
of the rate — and after ten years will be a good striker rather than a great one. Nothing stops them.
The cost is the career they did not have.

### 2.3 The plateau is emergent

A fighter stops improving where a camp's gain equals what a year takes away. That point falls out of
`aptitudeRate × resistance(current) × learningRate(age)` against `DECLINE_RATE × severity(age)`, and
it moves: a fighter who changes gym, finds a better coach, or simply gets older has a different
plateau than they had last year.

`potential[key]` **survives as a field but changes meaning for skills.** It is now a _projection_ —
where this fighter would settle on their current trajectory — recomputed rather than rolled, and
never enforced. Everything that reads it (scouting, the ceiling tick on the fighter card, the
training screen's "room" chips, `pickTrainingFocus`) keeps working and now describes something
truer: not a wall, but where the slope runs out. For physicals it still means exactly what it
always did.

Keeping the field is deliberate. Removing it would touch nineteen files to express something the
field can express perfectly well with a different derivation behind it, and the scouting layer's
entire point is that a _projection_ is uncertain — which is now literally true rather than a
fiction about a number that was exact all along.

### 2.4 What a body will not do — concurrent-training interference

Training strength past what a frame carries costs cardio. This is the interference effect and it is
well documented: hypertrophy adds mass, relative VO₂max is per kilogram, and the adaptations compete
for the same recovery.

```
carried   = 45 + (frame − 45) × 0.55          strength this frame carries without cost
excess    = clamp01((strength − carried) / 25)
cardioCost = strengthGain × 0.6 × excess
```

Below `carried` there is no penalty at all — a light fighter getting functionally strong is free.
Above it, every point of strength costs up to 0.6 of a point of cardio, and the two settle against
each other. A heavyweight built like a powerlifter genuinely does gas, and now the model says so.

The same physiology gets a second expression in §4: the cardio _ceiling_ takes a negative frame term,
because a 265 lb man does not have a lightweight's engine per kilogram no matter how he trains.

---

## 3. What this fixes from doc 22 §4

| doc 22 finding                      | resolution                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| §4.2 nobody is born strong          | Created physicals become ceiling-derived like everybody else's (§4.6)                                 |
| §4.3 durability capped at start + 4 | `MINIMUM_DEBUT_HEADROOM` no longer applies to skills; physicals are ceiling-derived so it never fires |
| §4.1 two theories of youth          | One theory: `ARRIVAL` for physicals, aptitude-driven growth for skills, both paths identical          |
| §4.5 IQ and composure never decline | Fight IQ gets 0.1; composure stays 0.0                                                                |
| §4.6 preview ≠ created fighter      | Preview and creation share a seed                                                                     |

---

## 4. The numbers

All from the realism review, with sources in its own record. Everything here is a change.

### 4.1 `PEAK_OFFSET` — new. Years relative to `PEAK_AGE[curve]`

The highest-value change in the whole document. `PEAK_AGE` was one number for all fifteen
attributes, so every quality peaked on the same birthday. In reality the _onset_ is what varies most:
reaction time peaks at 24, sprint speed 25.3, weightlifting 26, powerlifting 28–35, marathon 30, and
craft never peaks at all.

| offset | attributes                           | peak at standard 29 |
| ------ | ------------------------------------ | ------------------- |
| −4     | speed, durability                    | 25                  |
| −3     | power, scrambling                    | 26                  |
| −2     | strikingDefence, kicking             | 27                  |
| −1     | strength, wrestling, takedownDefence | 28                  |
| +1     | cardio                               | 30                  |
| +2     | strikingOffence, groundControl       | 31                  |
| +4     | submissions                          | 33                  |
| +6     | fightIq, composure                   | 35                  |

`PEAK_AGE` itself is untouched — mean 29.7 against a UFC top-15 mean of 31.8 ± 3.8. The composite
still lands there, but now by a **rising skill curve crossing a falling physical one** rather than
everything moving together. That is what lets the engine finally express the 25-year-old freak who
cannot yet fight, and the 34-year-old technician winning on craft with an empty tank.

### 4.2 `DECLINE_RATE` — re-derived, not copied

**The review's slopes could not be applied as given, and finding out why was the most instructive
part of the implementation.** Total decline by 35 is

```
rate × (6 / 2.35) × ((35 − peak) / 6) ^ 2.35
```

and `severity` is convex, so moving speed's onset from 29 to 25 multiplies its accumulated loss by
**3.3**. The review's 14% rate cut (1.4 → 1.2) went nowhere near covering that; applied naively, a
fighter lost roughly two and a half times as much speed by 35 as the balance envelope was built on,
and the long-sim caught it immediately as careers that could no longer reach champion level.

So each rate starts from the value that _preserves_ that attribute's career-total loss at its new
onset, and the review's directional judgements are applied on top of that baseline:

| attribute           | was  | now      | career-total loss by 35 (was → now)                     |
| ------------------- | ---- | -------- | ------------------------------------------------------- |
| speed               | 1.4  | **0.42** | 3.57 → 3.56                                             |
| power               | 1.15 | **0.44** | 2.94 → 2.91                                             |
| strength            | 0.9  | **0.55** | 2.30 → 2.02                                             |
| cardio              | 0.7  | **0.85** | 1.79 → 1.41                                             |
| **durability**      | 0.5  | **0.30** | 1.28 → **2.54** — deliberately doubled, per the KO data |
| wrestling           | 0.8  | **0.56** | 2.04 → 2.05                                             |
| scrambling          | 1.0  | **0.45** | 2.55 → 2.98                                             |
| takedownDefence     | 0.7  | **0.40** | 1.79 → 1.47                                             |
| kicking             | 0.9  | **0.46** | 2.30 → 2.31                                             |
| **strikingOffence** | 0.45 | **0.70** | 1.15 → **0.69** — hands outlast kicks by 3.4× in total  |
| **strikingDefence** | 0.6  | **0.55** | 1.53 → **2.76** — the reflexes go first                 |
| groundControl       | 0.4  | **0.45** | 1.02 → 0.44                                             |
| submissions         | 0.15 | **0.20** | 0.38 → 0.04                                             |
| fightIq             | 0.0  | **0.10** | craft holds, read speed does not                        |
| composure           | 0.0  | keep     | —                                                       |

Read the rates against the totals, not on their own: a _lower_ number against an onset four years
earlier is a _steeper_ career.

### 4.3 `ARRIVAL` — three points, at 20 / 26 / 34

| attribute  | was (20→30) | now (20 / 26 / 34)     |
| ---------- | ----------- | ---------------------- |
| speed      | 0.92 → 0.99 | **0.91 / 0.99 / 0.94** |
| durability | 0.92 → 0.99 | **0.97 / 0.97 / 0.90** |
| power      | 0.85 → 0.98 | **0.85 / 0.99 / 0.95** |
| strength   | 0.78 → 0.97 | **0.82 / 0.95 / 0.99** |
| cardio     | 0.68 → 0.96 | **0.78 / 0.94 / 0.99** |

Durability's slope now runs **down**, which is what the comment above the table always claimed and
the table never did.

### 4.4 `ceilingsFromNaturals` — frame enters

| attribute  | was                                 | now                                                   |
| ---------- | ----------------------------------- | ----------------------------------------------------- |
| power      | `explosiveness ×0.85 + skill ×0.15` | **`explosiveness ×0.60 + frame ×0.25 + skill ×0.15`** |
| durability | `constitution ×0.95 + skill ×0.05`  | **`constitution ×0.80 + frame ×0.15 + skill ×0.05`**  |
| cardio     | `engine ×0.85 + skill ×0.15`        | same, **minus up to 8 for a heavyweight frame**       |

On a scale doc 02 declares absolute across divisions, a 135 lb bantamweight and a 265 lb heavyweight
with the same explosiveness had identical punch-force ceilings. Body mass is a primary determinant of
peak punch force. `strength` already did this correctly and is the template.

### 4.5 `TRAINING_META`

| focus        | change                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| boxing       | **+ `power: 0.30`** — effective mass is technique, and technique is coached                                                                              |
| kicking      | **+ `power: 0.25`**, strength 0.4 → **0.30**                                                                                                             |
| wrestling    | **+ `durability: 0.15`**, strength 0.4 → **0.30** — neck strength is a wrestling-room product, and it is the one evidenced protection against concussion |
| conditioning | strength 0.7 → **0.50**, power 0.35 → **0.25**, durability 0.25 → **0.45**                                                                               |
| submissions  | scrambling 0.85 → **0.55**; wrestling gains **`scrambling: 0.30`**                                                                                       |

### 4.6 Created fighters

Physicals stop being a flat 46 and become ceiling-derived, exactly like every other fighter in the
world:

```
physical = ceilingsFromNaturals(naturals)[key] × arrivalFactor(key, age) × 0.94
         + disciplineBias × attainment.skill
         + allocation

skill    = 46 + disciplineBias × attainment.skill + allocation
         + min(4, (age − 18) × 0.25)      ← experience, technical and mental only
         + U[−2, +2)
```

The `× 0.94` is "a raw athlete who is not yet a fighter" — slightly behind an equivalent generated
prospect who has been in a professional room.

| constant                 | was                                       | now                                                                                                    |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `experience`             | `remap(age, 18, 35, 0, 7)` on all fifteen | **`min(4, (age−18) × 0.25)`, skills only**                                                             |
| `naturalsCentre`         | 78 / 73 / 68                              | **76 / 70 / 64** — physicals are visible now, so the centre comes down to hold debut overall at ~52–56 |
| `MINIMUM_DEBUT_HEADROOM` | 4, all attributes                         | **skills only**, and now a projection floor rather than a cap                                          |
| physical variance        | `U(−2,2)`, SD ≈ 1.16                      | inherited from the ceiling roll, **SD ≈ 10–11**                                                        |
| all-≥50 → −8 penalty     | any attribute                             | **skills only**                                                                                        |

That last row is the one that answers "some people are just strong". A created `freak` who rolls
explosiveness 85 previously debuted with power ~48 while a generated fighter with the identical
ceiling debuted at 77.5. They now debut in the same place, because they are the same fighter.

### 4.7 The documentation defect

`fighter.ts:100` says `headTrauma` "permanently erodes the hidden `constitution` natural". It does
not. Trauma is applied at fight time inside `effectiveDurability` and the stored `durability` and
`constitution` are never touched — so a fighter's card showed an intact chin however many times they
had been knocked cold. The comment is corrected to describe what the code does, and the mechanism
itself stays: it is the physiologically correct one, since the CTE literature names knockouts and
fight count alongside age.

---

## 5. What is deliberately not done

- **`PEAK_AGE` is untouched.** Mean 29.7 is a good match and the offsets do the work.
- **No cap on skills, at all.** A 99 in submissions is reachable. It takes a career of nothing else,
  which is the correct price.
- **Physicals keep hard caps.** The user's distinction, and the physiology agrees: rate models
  learning, not genetics.
- **Interference is one-directional.** Strength above frame costs cardio; heavy cardio does not
  suppress strength. The evidence for the reverse is weaker and one honest mechanism beats two
  speculative ones.
- **Fight frequency, matchmaking, contracts.** Doc 21's territory, untouched.

---

## 6. Definition of done

- A 21-year-old debutant is at or near their physical best and nowhere near their technical best,
  on both creation paths.
- Two created fighters of the same tier differ in physicals by roughly the same spread the generated
  world shows (SD ≈ 10), not ±2.
- A fighter with high grappling aptitude who trains only striking gets better at striking, slowly,
  and is never told they cannot.
- A heavy strength emphasis measurably costs cardio; a light one costs nothing.
- Speed and durability peak in the mid-twenties; submissions and fight IQ keep rising into the
  mid-thirties; the composite still peaks 29–32.
- The twenty-year long-sim still produces champions, still retires people at plausible ages, and its
  existing assertions hold.
