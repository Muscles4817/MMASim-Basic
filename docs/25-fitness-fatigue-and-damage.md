# 25 — Fitness, fatigue, and what damage actually costs

**Status:** proposal, nothing implemented. Every number in §1 was measured against this codebase at
the commit that merged doc 24; nothing here is estimated without saying so.

> **The short version.** Three separate observations turn out to be one missing idea. A career has
> no **freshness** — `condition.fatigue` exists but is reset to `0` after every fight and read only
> inside `simulateFight`, so being tired is a round-by-round concept and never a career one. Camps
> therefore have exactly one dial, length, and its per-week return is flat from six to twelve
> weeks, so the decision is dull. And damage is inert: `headTrauma` and `bodyWear` never touch
> `applyAgeing`, and `naturals.recovery` is fixed for life, so a 40-year-old with 39 trauma
> declines and heals exactly like a 22-year-old with none.
>
> Adding a freshness resource and a training-intensity choice gives camps a real trade, gives the
> veteran a reason to train _differently_ rather than merely less, and — the part that matters —
> gives accumulated damage somewhere to bite.

---

## 1. What is actually there

Written down first because three of the five things below are already correct, and a design that
rebuilds them would be worse than the thing it replaced.

### 1.1 Ageing and maintenance — mostly right

`NEGLECT_STICKINESS` deliberately omits power, speed, strength and durability. Maintenance
**cannot** arrest physical decline; those four are governed by age alone through `PEAK_OFFSET` and
`DECLINE_RATE`. Cardio is the one physical on the neglect list, at the highest stickiness of 1.5,
which is the right exception: cardio is the physical quality that genuinely detrains in weeks.

So "technical decline can be stopped by maintenance, physical decline cannot" is already the shape
of the model. Nothing in this document changes it.

### 1.2 Injury rates — sensible

Measured on a fixture at three ages, at three camps and two fights a year:

| Age | 8-week camp | 10-week camp | Fight (60 damage) | ≥1 injury in a year |
| --- | ----------: | -----------: | ----------------: | ------------------: |
| 23  |       11.8% |        14.8% |             11.9% |             **47%** |
| 30  |       20.1% |        25.1% |             17.9% |             **66%** |
| 37  |       20.1% |        25.1% |             17.9% |             **66%** |

That is a believable sport. Note that 30 and 37 are identical: `ageFactor` clamps at 1.8 for camps
and 1.6 for fights, and both are already saturated by 30, so the back half of a career gets no
further injury escalation. Minor to call out rather than fix on its own.

### 1.3 Minor and major injuries — captured properly

Eight types with real spreads — a facial cut at 2–4 weeks, a knee ligament at 20–40 — and severity
skewed low by `rng.next() ** 1.6`, so most are a nuisance and a few are career-shaping.
`recurrence` runs 0.25–0.6 and is checked _first_ in `rollInjury`, so one bad knee becomes a
pattern rather than an isolated event. Injuries suppress specific attributes at fight time via
`injuredAttributes`, are invisible to the opponent's scouting, and the player finds out from how
the fight looks. That last property is the best thing in the health model and nothing here touches
it.

### 1.4 The camp-length trade-off — real, but one-dimensional and flat

`trainingBlocks(weeks) = ((weeks − 2) / 4) ^ BLOCK_CURVE`, and `campInjuryChance` scales with
`load = clamp(weeks / 8, 0.5, 1.6)`. Measured on a 27-year-old:

| Weeks | Blocks | Blocks **per week** | Camp injury risk | Expected gain |
| ----: | -----: | ------------------: | ---------------: | ------------: |
|     4 |   0.59 |               0.149 |             8.3% |          0.61 |
|     6 |   1.00 |               0.167 |            12.4% |          1.02 |
|     8 |   1.36 |           **0.169** |            16.6% |          1.39 |
|    10 |   1.68 |               0.168 |            20.7% |          1.73 |
|    12 |   1.99 |               0.166 |            24.8% |          2.04 |
|    16 |   2.56 |               0.160 |            26.5% |          2.63 |

So longer is not free — it costs injury risk and calendar, and a four-week camp is genuinely a
sharpening camp rather than a development one, exactly as the screen says. But between six and
twelve weeks the per-week return varies by **1.2%**. The efficiency curve is flat where the player
actually operates, so the choice collapses to "how much time can I afford", which is a scheduling
question rather than a training one.

### 1.5 What is missing, precisely

- **`condition.fatigue` is a within-fight variable only.** `applyAftermath` sets it to `0` after
  every bout. Nothing outside `simulateFight` reads it. There is no career-level freshness at all.
- **Damage does not feed decline.** Neither `headTrauma` nor `bodyWear` appears anywhere in
  `applyAgeing`. Trauma erodes the chin _at fight time_ through `effectiveDurability` (up to −22
  points) and pushes `retirementUrge` past 45, and that is the whole of its effect. Two fighters
  the same age, one with 39 trauma and one with 5, decline identically.
- **`naturals.recovery` never changes.** `rollInjury` computes
  `remap(recovery, 10, 95, 1.35, 0.7)` from a value fixed at birth, so a 40-year-old heals as fast
  as a debutant.
- **A KO does not produce a concussion.** `readinessDelay` applies a 180-day floor for a KO loss,
  which is correct and matches commission practice — but the _injury_ is a separate roll at
  `fightInjuryChance` (~12–18%) which then picks a type by weight. Most KO losses leave nothing on
  the medical record.
- **AI fighters are never injured.** `world.ts` never calls `rollInjury`, in camp or in fights.
- **Nobody withdraws in fighter mode.** `pullOutRisk` is well-built — 5.5% base scaled by wear,
  discipline and cut risk — and is called only from `promoting.ts`. In fighter mode neither the
  player's opponent nor anyone else ever pulls out of a booked bout.
- **The player cannot see any of it.** `HubScreen` shows confidence, and head trauma only once it
  passes 45. `FighterScreen` adds body wear. There is no form, fitness or freshness reading
  anywhere.

---

## 2. The idea

One new resource, and three existing systems given something to push on.

**Freshness** is how recovered a fighter is _right now_: 0–100, falls with hard training and hard
fights, returns with time. It is not fitness and it is not cardio — a fighter can have a
world-class engine and be flat. It is the thing a real camp is periodised around, and it is the
missing half of every decision on this list:

- **Training intensity** spends it, and buys development with it.
- **Fight night** reads it, as the fatigue you start the round with.
- **Damage** governs how fast it comes back, which is how `bodyWear` and age finally get teeth.

That last connection is the one that makes this worth doing rather than three separate patches. A
34-year-old with 60 body wear does not decline faster because a constant says so; he declines
faster because every hard camp costs him more than it used to and takes longer to come back from,
so he trains less, and less hard, and the neglect model from doc 23 § 2.5 does the rest. The
decline becomes a consequence rather than a schedule.

---

## 3. The design

### 3.1 `condition.freshness`

A new field on `Condition`, 0–100, starting at 100.

**It falls** from training (§3.2), from competing, and from a hard weight cut. A fight costs a
flat amount plus a share of damage taken, so a three-round war costs more than a first-round
finish.

**It returns** at a rate per day, scaled down by three things a career accumulates:

```
recoveryRate = BASE_RECOVERY
             × (naturals.recovery / 60)          the fighter you were born as
             × (1 − bodyWear / 100 × 0.45)       what the miles cost
             × ageDrag(age)                       1.0 at 25, ~0.72 at 38
```

`ageDrag` is the honest expression of "you recover slower at 38", and it is applied _here_ rather
than by decaying the `naturals.recovery` value itself, because naturals are what a fighter was born
with and the fighter card should keep saying so — the same distinction `headTrauma` already
observes against `durability`.

**Migration.** Absent means fresh, exactly as `lastTrained` does in doc 23 § 2.5. Every fighter in
every existing save loads at 100 and nothing decays on the first tick.

### 3.2 Training intensity

A second dial on the camp screen, alongside weeks.

| Intensity     |  Gain | Freshness cost | Injury risk | What it is                                       |
| ------------- | ----: | -------------: | ----------: | ------------------------------------------------ |
| **Light**     | ×0.45 |          ×0.35 |        ×0.6 | Maintenance. Holds what you have; builds little. |
| **Standard**  |  ×1.0 |           ×1.0 |        ×1.0 | A normal camp.                                   |
| **Hard**      | ×1.35 |           ×1.7 |        ×1.4 | A real build, and you will feel it.              |
| **Overreach** |  ×1.7 |           ×2.6 |        ×2.1 | Everything, now. Sometimes correct.              |

Three consequences worth stating plainly, because they are the point:

**Light intensity is the maintenance camp.** Doc 23's `lastTrained` stamp does not care how hard a
camp was, so a light camp resets the neglect clock in full. That is the veteran lever asked for
when neglect was designed: at 38, when `learningRate` has made development nearly worthless, a
light camp holds your level at a third of the freshness cost. Training _differently_ rather than
merely less.

**Overreaching into a fight is a real mistake you can make.** Freshness is read on fight night as
starting fatigue, so a twelve-week overreach camp ending the week of the bout means gassing in
round two against someone you should beat. That is a genuine and very common failure in the sport,
and the game currently cannot express it.

**It gives camp length a second dimension.** Long-and-light and short-and-hard become genuinely
different plans rather than points on one line, which is the fix for § 1.4.

### 3.3 Fight night reads it

`simulateFight` currently starts every fighter at `fatigue: 0`. It should start them at a value
derived from freshness — a fighter at 100 starts at 0 as today, and a fighter at 45 starts the
first round already carrying some. The mapping should be gentle and capped: this must not become a
second, hidden cardio attribute that decides fights on its own.

Ring rust already suppresses timing attributes on the same screen-invisible principle
(`ringRust.ts`), and the two are complementary rather than duplicative: rust is _late_, flatness is
_tired_. A fighter can be sharp and flat, or fresh and rusty.

### 3.4 A KO produces a concussion

Not a probability. If the method is a KO, or a TKO from head strikes, the loser gets a concussion
with severity drawn from the damage taken, on top of the existing 180-day readiness floor. The
independent `fightInjuryChance` roll continues to run for everything else.

This is small and unambiguous and should ship first. It also makes `headTrauma` legible: a career
of stoppage losses now leaves a _record_, not just a number quietly climbing on a screen the player
has to go looking for.

### 3.5 The world gets hurt too

`world.ts:develop()` should roll camp injuries the way `runTraining` does, and the world's fight
resolution should roll fight injuries the way `runBookedFight` does. `pullOutRisk` should be called
in fighter mode so booked bouts fall apart.

This is the same class of asymmetry as the camp-development bug: a rule written for one side of the
game and never applied to the other. It is worth measuring the cost before shipping — injuries for
eight hundred fighters is more per-tick work — and if it is too expensive, resolving it
statistically for fighters far from the player is an acceptable answer, provided the _rate_ matches.

### 3.6 What the player can see

The whole thing is pointless if it is invisible. The fighter hub needs a condition block:

- **Freshness**, as the primary reading, with plain language rather than a bare number — _fresh_,
  _worked_, _flat_, _running on empty_.
- **Body wear** and **head trauma** always, not only past a threshold. Hiding a number until it is
  bad means the player learns about it too late to act, which is the opposite of a resource.
- **Days since your last fight**, because rust is already modelled and already invisible.

Freshness in particular has to be visible _before_ the camp screen commits, since choosing
intensity without it is choosing blind.

---

## 4. Damage-driven decline

The remaining piece of the original observation: fighters slow down, accumulate damage and lose
durability, and recover worse.

Three of those four are handled above — recovery is § 3.1, and slowing down is already
`PEAK_OFFSET` plus `DECLINE_RATE`, which doc 23 re-derived from the literature. What is missing is
**durability specifically**, and it should not be fixed by raising its `DECLINE_RATE`, because that
would charge every fighter equally for damage only some of them took.

Instead, `applyAgeing` should take a damage term for durability alone:

```
traumaDecline = TRAUMA_DECLINE_PER_YEAR × (headTrauma / 100) ^ 1.2 × years
```

Convex, so the first twenty points of trauma cost almost nothing and the last twenty cost a great
deal, which is how the real thing is understood. It sits alongside the existing age decline rather
than replacing it, and it means the fighter who took the durability path — who won by absorbing
and returning — pays for it, while the one who never got hit does not.

This has an obvious interaction with `effectiveDurability`, which already subtracts up to 22 points
of chin at fight time for the same reason. Those two must be balanced against each other or a
damaged fighter is charged twice; the fight-time erosion should shrink as the stored decline grows,
so the total stays roughly where it is today and only its _permanence_ changes.

---

## 5. Numbers to pick

Everything in §3 marked with a multiplier is a starting guess, not a measurement. Each will be set
the way doc 23 § 4 set the decline rates — swept against a target and reported:

| Constant                        | First guess          | Calibrated against                                                           |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `BASE_RECOVERY` (freshness/day) | 1.6                  | A standard eight-week camp is fully recovered from in ~5 weeks at 25         |
| Fight freshness cost            | 25 + damage/4        | A three-round war leaves a fighter flat for about two months                 |
| `ageDrag(38)`                   | 0.72                 | A 38-year-old needs roughly 40% longer to come back than a 25-year-old       |
| Intensity multipliers           | table in § 3.2       | No intensity is strictly dominant across a career                            |
| `TRAUMA_DECLINE_PER_YEAR`       | 0.5                  | Doc 24's traced careers keep their peaks; only the heavily damaged lose more |
| Starting fatigue from freshness | ≤0.25 at freshness 0 | Freshness never outweighs cardio in deciding a fight                         |

The last two are the risky ones and both are guarded by existing suites: the long-sim's champion
bar catches decline that has become too harsh, and the fight-engine statistical tier catches a new
input that has started deciding fights.

---

## 6. What could go wrong

**Freshness becomes a second cardio.** The failure mode is a fight decided by a resource the player
managed on a menu rather than by the fighter they built. Mitigation: cap its fight-night effect
hard (§ 5), and keep it a _starting_ condition rather than a rate — it changes where you begin, not
how fast you tire.

**Intensity becomes a solved puzzle.** If one row of the § 3.2 table dominates, the dial is
decoration. The calibration target is explicit: no intensity may be best across a whole career.
Light should win for a 37-year-old, hard should win for a 24-year-old with room, and overreach
should be right occasionally and wrong often.

**Micromanagement.** Four intensities × three lengths × six focuses is 72 combinations per camp,
which is a spreadsheet rather than a decision. Mitigation: the screen should recommend, and the
recommendation should be good — most players should be able to press the suggested plan every camp
and have a decent career.

**More decline on top of doc 23.** Careers already got about 1.5 points harder from the banking
fix. This adds a third downward force, and the champion bar has already moved once. It must be
measured before and after on the same seeds, and if the bar moves again the intensity multipliers
should absorb it rather than the assertion.

---

## 7. Definition of done

- A fighter who runs three hard twelve-week camps back to back is measurably flat, and the screen
  said so before the third one started.
- A 38-year-old on light camps holds his level longer than the same fighter on standard camps, and
  loses less to neglect than one who trains less often.
- Overreaching into a fight is visibly worse than arriving fresh, in a way a player can learn from
  a single fight report.
- Every KO loss has a concussion on the record and a suspension to match.
- AI fighters get injured, and booked bouts fall apart, at rates within the § 1.2 band.
- Two fighters of the same age with 5 and 39 head trauma no longer decline identically.
- Doc 24's three careers regenerate with peaks within a point of where they are now, or the reason
  they moved is stated.

---

## 8. Phasing

1. **§ 3.4 and § 3.5** — KO to concussion, injuries and withdrawals for the world. Small,
   self-contained, unambiguously correct, and independent of everything else here.
2. **§ 3.1 and § 3.6** — freshness as a field, recovery, and the hub display. Shipped without
   intensity it already does something: a fighter who fights often is visibly flat.
3. **§ 3.2 and § 3.3** — intensity, and fight night reading freshness. The gameplay payload.
4. **§ 4** — damage-driven durability decline, last, because it is the one most likely to need
   re-balancing against the long-sim.

Each phase is independently shippable and independently revertible. Nothing after phase 1 should
start before doc 24 has been regenerated against phase 1, so every step is measured against the
last rather than against a memory of it.
