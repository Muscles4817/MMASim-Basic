# 25 — Fitness, fatigue, and what damage actually costs

**Status:** **phases 1-3 shipped** (§3.1 freshness, §3.2 intensity, §3.3 the matrix, §3.4 fight
night, §3.5 exposure, §3.6 KO to concussion, §3.7 the world, §3.8 the display); §4 remains a
proposal. Every number in §1 was measured against this codebase at the commit that
merged doc 24; nothing here is estimated without saying so. §9 records what phase 1 actually cost.

> **The short version.** Four observations turn out to be one missing idea. A career has no
> **freshness** — `condition.fatigue` exists but is reset to `0` after every fight and read only
> inside `simulateFight`, so being tired is a round-by-round concept and never a career one. Camps
> therefore have one dial, length, whose per-week return is flat from six to twelve weeks. Damage
> is inert: `headTrauma` and `bodyWear` never touch `applyAgeing`, and `naturals.recovery` is fixed
> for life. And **the injury roll barely notices what happened in the fight** — a thirty-second
> untouched submission win carries an 11.0% injury chance against 21.1% for being beaten for three
> rounds, a range narrower than the one `injuryProneness` alone spans.
>
> Adding a freshness resource, a training-intensity choice, and a fight-shaped exposure model gives
> camps a real trade, gives the veteran a reason to train _differently_ rather than merely less,
> and makes how you win matter as much as whether you win.

---

## 1. What is actually there

Written down first because most of what was checked is already right, and a design that rebuilds
working systems is worse than the thing it replaced.

### 1.1 Ageing and maintenance — right

`NEGLECT_STICKINESS` deliberately omits power, speed, strength and durability. Maintenance
**cannot** arrest physical decline; those four are governed by age alone through `PEAK_OFFSET` and
`DECLINE_RATE`. Cardio is the one physical on the neglect list, at the highest stickiness of 1.5,
which is the right exception: cardio is the physical quality that genuinely detrains in weeks.

"Technical decline can be stopped by maintenance, physical decline cannot" is already the shape of
the model. Nothing here changes it.

### 1.2 Injury rates — the overall level is sensible

Measured on a fixture at three ages, at three camps and two fights a year:

| Age | 8-week camp | 10-week camp | Fight (60 damage) | ≥1 injury in a year |
| --- | ----------: | -----------: | ----------------: | ------------------: |
| 23  |       11.8% |        14.8% |             11.9% |             **47%** |
| 30  |       20.1% |        25.1% |             17.9% |             **66%** |
| 37  |       20.1% |        25.1% |             17.9% |             **66%** |

The _level_ is believable. §1.6 is about the distribution, which is not.

Note also that 30 and 37 are identical: `ageFactor` clamps at 1.8 for camps and 1.6 for fights and
both saturate by 30, so the back half of a career gets no further escalation.

### 1.3 Minor and major injuries — captured properly

Eight types with real spreads — a facial cut at 2–4 weeks, a knee ligament at 20–40 — and severity
skewed low by `rng.next() ** 1.6`, so most are a nuisance and a few are career-shaping.
`recurrence` runs 0.25–0.6 and is checked _first_ in `rollInjury`, so one bad knee becomes a
pattern rather than an isolated event. Injuries suppress specific attributes at fight time via
`injuredAttributes`, are invisible to the opponent's scouting, and the player finds out from how
the fight looks. That last property is the best thing in the health model and nothing here touches
it.

### 1.4 Trauma and body wear are already fight-shaped

Worth stating precisely, because it narrows the problem. `damage.ts` accrues
`traumaIncrement += damage × 0.032` **on head strikes only**, and `aftermath.ts` accrues
`bodyWear += (bodyDamage + legDamage) × 0.06`. So a fighter who wins from top position taking
nothing already banks almost no trauma and almost no wear, and a fighter in a three-round war banks
a lot of both.

Those two channels are correct. The problem is confined to the third.

### 1.5 The camp-length trade-off — real, but one-dimensional and flat

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

Longer is not free — it costs injury risk, money and calendar, and a four-week camp is genuinely a
sharpening camp rather than a development one, exactly as the screen says. But between six and
twelve weeks the per-week return varies by **1.2%**. The efficiency curve is flat where the player
actually operates, so the choice collapses to "how much time can I afford", which is a scheduling
question rather than a training one.

### 1.6 The injury roll barely notices the fight

`fightInjuryChance(fighter, damageTaken, day)` takes one scalar — the sum of head, body and leg
damage — and turns it into `1 + clamp01(damageTaken / 120)`. Measured on a 28-year-old across every
fight the sim can produce:

| Chance | Fight                                             |
| -----: | ------------------------------------------------- |
|  11.0% | Thirty-second armbar, never touched               |
|  12.1% | Three rounds won entirely from top position       |
|  14.8% | An ordinary decision                              |
|  18.9% | A three-round war with both fighters hurt         |
|  21.1% | Beaten up for two rounds and stopped in the third |

**A 1.9× spread across the entire range of what can happen in a cage.** For comparison, the other
multipliers in the same function:

| Term              |     Range | Span |
| ----------------- | --------: | ---: |
| damage            | 1.00–2.00 | 2.0× |
| `injuryProneness` | 0.60–1.70 | 2.8× |
| `ageFactor`       | 0.85–1.50 | 1.8× |

So **who you are matters more than what happened to you**, which is backwards. It also ignores
everything the sim already records: how long the fight lasted, whether you were on top, whether you
were knocked down, whether you were finished, and what kind of damage it was.

The fighter who wins every round from top control and the fighter who eats two hundred head strikes
are, to this function, nearly the same person having nearly the same night.

### 1.7 What else is missing

- **`condition.fatigue` is a within-fight variable only.** `applyAftermath` sets it to `0` after
  every bout. Nothing outside `simulateFight` reads it. There is no career-level freshness at all.
- **Damage does not feed decline.** Neither `headTrauma` nor `bodyWear` appears anywhere in
  `applyAgeing`. Trauma erodes the chin _at fight time_ through `effectiveDurability` (up to −22
  points) and pushes `retirementUrge` past 45, and that is the whole of its effect. Two fighters
  the same age, one with 39 trauma and one with 5, decline identically.
- **`naturals.recovery` never changes.** `rollInjury` computes `remap(recovery, 10, 95, 1.35, 0.7)`
  from a value fixed at birth, so a 40-year-old heals as fast as a debutant.
- **A KO does not produce a concussion.** `readinessDelay` applies a 180-day floor for a KO loss,
  which is correct and matches commission practice — but the _injury_ is a separate roll which then
  picks a type by weight, so most KO losses leave nothing on the medical record.
- **AI fighters are never injured.** `world.ts` never calls `rollInjury`, in camp or in fights.
- **Nobody withdraws in fighter mode.** `pullOutRisk` is well-built — 5.5% base scaled by wear,
  discipline and cut risk — and is called only from `promoting.ts`.
- **The player cannot see any of it.** `HubScreen` shows confidence, and head trauma only once it
  passes 45. `FighterScreen` adds body wear. There is no form or fitness reading anywhere.

---

## 2. The idea

One new resource, and three existing systems given something to push on.

**Freshness** is how recovered a fighter is _right now_: 0–100, falls with hard training and hard
fights, returns with time. It is not fitness and it is not cardio — a fighter can have a
world-class engine and be flat. It is what a real camp is periodised around, and it is the missing
half of every decision on this list:

- **Training intensity** spends it, and buys development with it.
- **Fight night** reads it, as the fatigue you start the round with.
- **Damage and age** govern how fast it returns, which is how `bodyWear` finally gets teeth.

That last connection is what makes this one system rather than three patches. A 34-year-old with 60
body wear does not decline faster because a constant says so; he declines faster because every hard
camp costs him more than it used to and takes longer to come back from, so he trains less and less
hard, and doc 23 § 2.5's neglect model does the rest. Decline becomes a consequence rather than a
schedule.

Alongside it, **exposure**: the idea that what a fight costs you is a property of _that fight_,
not of a base rate. §1.4 shows two of the three damage channels already work this way. The third
should join them.

---

## 3. The design

### 3.1 `condition.freshness`

A new field on `Condition`, 0–100, starting at 100.

**It falls** from training (§3.2), from competing (§3.5), and from a hard weight cut.

**It returns** at a rate per day, scaled by three things a career accumulates:

```
recoveryRate = BASE_RECOVERY
             × (naturals.recovery / 60)          the fighter you were born as
             × (1 − bodyWear / 100 × 0.45)       what the miles cost
             × ageDrag(age)                      1.0 at 25, ~0.72 at 38
```

`ageDrag` is the honest expression of "you recover slower at 38", applied _here_ rather than by
decaying `naturals.recovery` itself, because naturals are what a fighter was born with and the
card should keep saying so — the same distinction `headTrauma` already observes against
`durability`.

**Migration.** Absent means fresh, exactly as `lastTrained` does in doc 23 § 2.5. Every fighter in
every existing save loads at 100 and nothing decays on the first tick.

### 3.2 Training intensity, and what each dial actually buys

A second dial on the camp screen. The critical design decision is that **length and intensity must
buy different things**, or the matrix collapses back to one line with twelve labels on it.

- **Length buys volume and _technical_ adaptation.** Motor learning is reps and sleep, not maximal
  effort. It costs money and calendar.
- **Intensity buys _physical_ adaptation.** You do not build a gas tank or explosive strength by
  going easy for twelve weeks. It costs freshness and injury risk.

So the gain splits, and the two dials weight the halves differently:

| Intensity     | Technical | Physical | Freshness | Injury risk |
| ------------- | --------: | -------: | --------: | ----------: |
| **Light**     |      0.85 |     0.35 | **+ 0.4** |        ×0.5 |
| **Standard**  |      1.00 |     1.00 |      −1.0 |        ×1.0 |
| **Hard**      |      1.05 |     1.50 |      −1.8 |        ×1.5 |
| **Overreach** |      0.90 |     1.90 |      −2.8 |        ×2.3 |

Two rows deserve explanation.

**Light is freshness-positive.** Light training is active recovery, which is a real and widely used
thing — and it makes a light block a genuine _option_ rather than a worse camp. It also resets the
neglect clock in full, because doc 23's `lastTrained` stamp does not care how hard a camp was.
That is the veteran lever asked for when neglect was designed: at 38, when `learningRate` has made
development nearly worthless, a light camp holds your level _and_ gives freshness back.

**Overreach is technically worse than hard.** You do not learn well when you are wrecked. That
makes overreach a specifically physical tool rather than a strictly better version of hard, which
is what stops the intensity dial from being a difficulty slider.

### 3.3 Why every combination has a place

The test of §3.2 is whether all twelve cells are somebody's correct answer. Written out:

|           | **Light**                                                                                                          | **Standard**                                        | **Hard**                                                                 | **Overreach**                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **4 wk**  | **Taper.** Net freshness gain, neglect clock reset, almost no risk. The month before a title fight.                | **Sharpen.** Small top-up against a named opponent. | **Shock.** Cheap physical bump with a short exposure window.             | **Fight-week cram.** Real physical gain, arrive flat. Right occasionally, wrong often. |
| **8 wk**  | **Hold.** The veteran's maintenance camp: full neglect reset at a third of the freshness cost.                     | **The default camp.**                               | **The build.** Best all-round development per week of calendar.          | **Peak.** Maximum physical gain, high injury risk, wants a taper after.                |
| **12 wk** | **The technical camp.** Best skill development in the game — time is what motor learning wants — at very low risk. | **Broad build.**                                    | **Serious build.** Strong on both halves; needs a light block behind it. | **Career-shortening.** The highest total gain available, and you will pay for it.      |

The two costs are deliberately in **different currencies**: long camps are gated by money and
calendar (`campCostFor` scales with weeks), hard camps by freshness and health. A broke young
fighter and a wealthy old one are constrained by different things and should reach for different
cells.

**Calibration target, stated so it can be tested:** no cell may dominate its row or column across a
career, and a well-played career should use at least six of the twelve. §5 says how that is
measured.

### 3.4 Fight night reads freshness

`simulateFight` currently starts every fighter at `fatigue: 0`. It should start them at a value
derived from freshness — 100 starts at 0 as today; 45 starts the first round already carrying some.
Gentle and capped: this must not become a second, hidden cardio attribute that decides fights.

Ring rust (`ringRust.ts`) already suppresses timing attributes on the same screen-invisible
principle, and the two are complementary rather than duplicative: rust is _late_, flatness is
_tired_. A fighter can be sharp and flat, or fresh and rusty.

### 3.5 The fight decides what the fight costs

The core of §1.6. `fightInjuryChance` should stop taking a damage scalar and start taking the
fight — all of which `FightResult` already carries in `stats` and `damage`.

**Exposure**, replacing the `1 + damage/120` term:

```
exposure = headDamage         × W_HEAD
         + bodyDamage         × W_BODY
         + legDamage          × W_LEG        the classic limp-off
         + knockdownsSuffered × W_KD
         + (wasFinishedByStrikes ? W_FINISHED : 0)
         + minutesFought      × W_MINUTE     time in there at all
         + scrambles          × W_SCRAMBLE   takedowns defended; wrestling wears joints
         − controlMinutes     × W_CONTROL    time on top is time not being hurt
```

`controlSeconds` and `clinchControlSeconds` are already tracked separately, so "winning from top
position" and "winning in the tie-up" are both expressible and can be weighted differently.

The band this must produce, replacing the 11.0%–21.1% measured in §1.6:

| Target | Fight                                             |
| -----: | ------------------------------------------------- |
|  ~2–3% | Thirty-second armbar, never touched               |
|  ~4–5% | Three rounds won entirely from top position       |
|   ~12% | An ordinary decision                              |
|   ~28% | A three-round war with both fighters hurt         |
|   ~38% | Beaten up for two rounds and stopped in the third |

That is a **13× spread**, and it makes the difference between how you win and whether you win into
a career-length force. A fighter who finishes people early and controls from top has a long career;
a fighter in wars does not. That is the sport.

**The type of injury should be shaped too.** `rollInjury` weights types by a global `fightWeight`;
it should take the exposure profile and reweight:

| What happened                            | Made more likely     |
| ---------------------------------------- | -------------------- |
| Head damage, knockdowns, stopped         | Concussion, cut      |
| Leg damage taken                         | Ankle, knee          |
| Takedowns defended, scrambles            | Knee, shoulder, back |
| Body damage taken                        | Rib                  |
| **Punches _thrown_** (`strikesByWeapon`) | **Hand**             |
| **Kicks _thrown_**                       | **Ankle**            |

The last two are worth the trouble. You break your hand punching someone, not being punched — and
`stats[me].strikesByWeapon.punch` is already recorded. A heavy-handed brawler breaking his hand on
someone's skull is one of the sport's most characteristic injuries and it is currently unreachable.

**Freshness cost follows the same exposure number**, which is what gives §3.1 its fight-side input:
the thirty-second finish costs almost nothing and you can turn around quickly; the war costs a
great deal and you cannot.

### 3.6 A KO produces a concussion

Not a probability. If the method is a KO, or a TKO from head strikes, the loser gets a concussion
with severity drawn from the damage taken, on top of the existing 180-day readiness floor. The
exposure roll of §3.5 continues to run for everything else.

Small, unambiguous, and it makes `headTrauma` legible: a career of stoppage losses leaves a
_record_, not just a number climbing on a screen the player has to go looking for.

### 3.7 The world gets hurt too

`world.ts:develop()` should roll camp injuries the way `runTraining` does, and the world's fight
resolution should roll exposure-shaped fight injuries the way §3.5 describes. `pullOutRisk` should
be called in fighter mode so booked bouts fall apart.

Same class of asymmetry as the camp-development bug: a rule written for one side of the game and
never applied to the other. Worth measuring the per-tick cost before shipping; if resolving it for
eight hundred fighters is too expensive, a statistical resolution for fighters far from the player
is acceptable provided the _rate_ matches.

### 3.8 What the player can see

The whole thing is pointless if it is invisible. The fighter hub needs a condition block:

- **Freshness** as the primary reading, in plain language rather than a bare number — _fresh_,
  _worked_, _flat_, _running on empty_.
- **Body wear** and **head trauma** always, not only past a threshold. Hiding a number until it is
  bad means the player learns about it too late to act on it, which is the opposite of a resource.
- **Days since your last fight**, because rust is already modelled and already invisible.

Freshness in particular must be visible _before_ the camp screen commits, since choosing intensity
without it is choosing blind. The post-fight report should also say what the fight cost — "you came
through that one clean" versus "that was a hard night and you will feel it" — because §3.5 only
teaches the player anything if they can see it working.

---

## 4. Damage-driven decline

The remaining piece: fighters slow down, accumulate damage and lose durability, and recover worse.

Three of those four are handled above — recovery is §3.1, and slowing down is already `PEAK_OFFSET`
plus `DECLINE_RATE`, which doc 23 re-derived from the literature. What is missing is **durability
specifically**, and it should not be fixed by raising its `DECLINE_RATE`, which would charge every
fighter equally for damage only some of them took.

Instead `applyAgeing` takes a damage term for durability alone:

```
traumaDecline = TRAUMA_DECLINE_PER_YEAR × (headTrauma / 100) ^ 1.2 × years
```

Convex, so the first twenty points of trauma cost almost nothing and the last twenty cost a great
deal, which is how the real thing is understood. It sits alongside age decline rather than
replacing it, so the fighter who won by absorbing and returning pays for it and the one who never
got hit does not — which is exactly §3.5's exposure model showing up twenty years later.

This interacts with `effectiveDurability`, which already subtracts up to 22 points of chin at fight
time for the same reason. The two must be balanced or a damaged fighter is charged twice: the
fight-time erosion should shrink as the stored decline grows, so the total stays roughly where it
is today and only its _permanence_ changes.

---

## 5. Numbers to pick

Everything above with a multiplier on it is a starting guess. Each will be set the way doc 23 §4
set the decline rates — swept against a target and reported.

| Constant                        | First guess          | Calibrated against                                                        |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `BASE_RECOVERY` (freshness/day) | 1.6                  | A standard 8-week camp is recovered from in ~5 weeks at 25                |
| `ageDrag(38)`                   | 0.72                 | A 38-year-old needs ~40% longer to come back than a 25-year-old           |
| Intensity multipliers           | §3.2 table           | No cell dominates; a good career uses ≥6 of the 12                        |
| Exposure weights                | —                    | The §3.5 band, top to bottom                                              |
| Fight freshness cost            | exposure-derived     | A three-round war leaves a fighter flat for ~2 months; a 30s finish, days |
| `TRAUMA_DECLINE_PER_YEAR`       | 0.5                  | Doc 24's careers keep their peaks; only the heavily damaged lose more     |
| Starting fatigue from freshness | ≤0.25 at freshness 0 | Freshness never outweighs cardio in deciding a fight                      |

**How "no cell dominates" gets measured.** Extend `tools/career-trace.ts` with a policy that picks
greedily from all twelve cells each camp, run it across many seeds, and count which cells it
chooses. A dial where one cell takes more than half the picks, or where three cells take none, is a
dial that failed. This is cheap because the trace harness already plays whole careers through the
real game.

The riskiest constants are the last two, and both are guarded by existing suites: the long-sim's
champion bar catches decline that has become too harsh, and the fight-engine statistical tier
catches a new input that has started deciding fights.

---

## 6. What could go wrong

**Freshness becomes a second cardio.** The failure mode is a fight decided by a resource managed on
a menu rather than by the fighter you built. Mitigation: cap its fight-night effect hard (§5), and
keep it a _starting_ condition rather than a rate — it changes where you begin, not how fast you
tire.

**Exposure makes grapplers strictly better.** If controlling from top removes most injury risk,
wrestling becomes the dominant style for career-length reasons on top of its fight-night value.
Mitigation: `W_SCRAMBLE` exists precisely for this — wrestling is hard on knees, shoulders and
backs, so the grappler trades concussion risk for joint risk rather than avoiding risk. The styles
suite should confirm no style's long-run win share moves materially.

**The intensity matrix collapses.** §3.3 is the whole argument and §5 is the test. If the
measurement says three cells are never chosen, the fix is the multipliers, not the doc.

**Micromanagement.** Four intensities × three lengths × six focuses is 72 combinations per camp,
which is a spreadsheet rather than a decision. Mitigation: the screen recommends, and the
recommendation is good enough that pressing it every camp gives a decent career.

**More decline on top of doc 23.** Careers already got ~1.5 points harder from the banking fix.
This adds a third downward force and the champion bar has already moved once. Measure before and
after on the same seeds; if the bar moves again, the intensity multipliers absorb it rather than
the assertion.

---

## 7. Definition of done

- A fighter who wins three fights by first-round finish is in far better shape than one who won
  three decisions in wars, and the difference is visible on the hub without opening a menu.
- The thirty-second-armbar and beaten-for-three-rounds cases sit at roughly the §3.5 band.
- A brawler who throws heavy punches sometimes breaks his hand.
- A fighter who runs three hard twelve-week camps back to back is measurably flat, and the screen
  said so before the third one started.
- A 38-year-old on light camps holds his level longer than the same fighter on standard camps, and
  loses less to neglect than one who trains less often.
- Across many seeded careers the greedy policy picks at least six of the twelve intensity × length
  cells, and no cell takes more than half the picks.
- Every KO loss has a concussion on the record and a suspension to match.
- AI fighters get injured, and booked bouts fall apart, at rates within the §1.2 band.
- Two fighters of the same age with 5 and 39 head trauma no longer decline identically.
- No style's long-run win share moves materially.
- Doc 24's three careers regenerate with peaks within a point of where they are now, or the reason
  they moved is stated.

---

## 8. Phasing

1. **§3.5 exposure, §3.6 KO to concussion, §3.7 the world.** The health model, self-contained and
   independent of freshness. Biggest realism gain per line changed, and it makes doc 24's careers
   immediately more honest.
2. **§3.1 freshness and §3.8 the display.** Shipped without intensity it already does something: a
   fighter who fights often, or fights wars, is visibly flat.
3. **§3.2–3.4 intensity and fight night.** The gameplay payload, and the part §5's cell-usage
   measurement gates.
4. **§4 damage-driven durability decline.** Last, because it is the piece most likely to need
   rebalancing against the long-sim, and because it wants §3.5's exposure model to have been
   running first so the trauma it reads is trauma that was earned honestly.

Each phase is independently shippable and revertible. Doc 24 should be regenerated after each one,
so every step is measured against the last rather than against a memory of it.

---

## 9. Phase 1, as shipped

§3.5, §3.6 and §3.7 are in. What follows is measured rather than intended.

### The band came out where §3.5 asked for it

On a median 28-year-old, against the targets in §3.5:

| Measured | Target | Fight                                             |
| -------: | -----: | ------------------------------------------------- |
|     2.5% |  ~2-3% | Thirty-second armbar, never touched               |
|     3.9% |  ~4-5% | Three rounds won entirely from top position       |
|    12.0% |   ~12% | An ordinary decision                              |
|    29.0% |   ~28% | A three-round war with both fighters hurt         |
|    39.5% |   ~38% | Beaten up for two rounds and stopped in the third |

A **16.1x spread**, against the 1.9x it replaced. `BASE_FIGHT_HAZARD` moved 0.07 to 0.078, which is
a recalibration rather than a buff: the old damage term averaged around 1.4 across real fights and
`exposureScore` is normalised so an ordinary decision reads 1.0, so the base has to absorb the
difference to hold the ordinary fight where it was.

### Two things the design did not anticipate

**Matchmaking was booking people in casts.** The moment the world could be injured, `getOffers`
started handing the player opponents who were already out — 15 of 121 booked bouts collapsed for
that reason alone, which is not a withdrawal rate, it is a matchmaker who does not check. The pool
is now filtered by the same `FIGHT_THROUGH_WEEKS` threshold the withdrawal rule uses, so the two
cannot disagree.

**Withdrawing on any active injury deleted the best mechanic in the health model.** The first
version pulled an opponent out of anything unhealed. Fighting hurt is already modelled properly —
`injuredAttributes` gives a fighter their real numbers rather than their card, `aggravationChance`
can turn a knock into something far worse on the night, and nobody is told — and a strict threshold
means no opponent ever fights hurt, so the player never gets the fight that goes strangely for
reasons they cannot see. `FIGHT_THROUGH_WEEKS` was then swept against `pullOutRisk`'s own stated
rate of "around one bout in eight":

| Threshold | Booked bouts that collapse |
| --------: | -------------------------- |
|   3 weeks | 20.6%, 1 in 4.9            |
|   5 weeks | 18.3%, 1 in 5.5            |
|   6 weeks | 16.8%, 1 in 5.9            |
|   8 weeks | **12.0%, 1 in 8.3**        |

Eight weeks sounds generous until you remember people fight with broken hands.

### What it cost, honestly

Measured on twelve seeded careers through the real game, before and after:

|                     | Before | After |
| ------------------- | -----: | ----: |
| Mean career length  |  10.5y |  8.7y |
| Mean retirement age |   32.6 |  30.8 |
| Earliest retirement |     27 |    22 |

Careers are **17% shorter**, which is the honest price of a sport that can now hurt you. The tail is
the part worth arguing about: five of twelve careers now end between 22 and 26, where before none
ended under 27.

That is **not** the injury model being too harsh. It runs at 1.09 injuries per career-year, the top
of the band §1.2 was already designed around, and only 9% of fights are fought carrying one. It is
that `retirementUrge` has exactly one route for a disrupted career — lost fights, collapsed
confidence, walk away — so every kind of adversity comes out as the same exit. A fighter whose year
was wrecked by a knee should come back at 28 having lost time, not quit at 24 having lost heart.

Doc 24 finding 6 already said nobody retires hurt. Phase 1 made that the more pressing half of the
same defect, so it was fixed before going further — see §10.

---

## 10. Retirement, fixed before phase 2

Phase 1 did not create the retirement problem; it made it impossible to ignore. `retirementUrge`
turned out to have two independent defects, both invisible until somebody counted endings across
whole worlds.

### The skid did not know how old you were

An identical five-fight skid with the confidence gone produced the **same** urge at 23 as at 34 —
both landing on 23.2% per fight. Nothing in the function knew how much career was left to come back
to, so every kind of adversity had exactly one exit. Across three twenty-year worlds and 525
retirements, **31% happened before 28**.

That is not what a bad run means at 23. It means you get cut, drop a level and fight on; the sport
is full of people who were 4-6 at 24 and 19-8 at 32. The skid and confidence terms are now weighted
by a `careerStage` factor that runs 0 at 24 to 1 at 36, so a young fighter feels a fraction of what
a veteran feels from the same losses.

### Damage could not end a career

`traumaTerm` began at 45 and `wearTerm` at 50. Measured across the same 525 retirements, head
trauma runs p50 17 / p90 63, and body wear runs p50 8 / p90 22 with a **maximum of 51** — so the
wear term was dead code that a full career could not clear once, and trauma fired for barely the top
decile. `retirementReason` compounded it by requiring trauma ≥ 70 to say "medical", above the 90th
percentile, so a fighter genuinely driven out by damage was told they had retired on a losing run.

Trauma now reads from 25 to 85, wear from 20 to 65, and the medical label from 55.

### What changed, measured

| Across three twenty-year worlds  | Before |    After |
| -------------------------------- | -----: | -------: |
| Retirements before 28            |    31% | **4.8%** |
| Mean retirement age              |   32.6 |     36.1 |
| Medical retirements              |     5% |  **20%** |
| Oldest active fighter at year 20 |     59 |   **55** |

The last row is the one worth noticing. Fewer retirements would normally mean an ageing roster, and
the mean age of the active population does drift up by 0.9 years across two decades — but the
_oldest_ fighter comes down, because damage now retires people the skid never reached. The long-sim's
"no active 60-year-olds" assertion was previously passing by a single year.

And on twelve seeded player careers through the real game, the whole arc of phases 1 and 10:

|                     | Before phase 1 | After phase 1 | After §10 |
| ------------------- | -------------: | ------------: | --------: |
| Mean career length  |          10.5y |          8.7y | **14.4y** |
| Mean retirement age |           32.6 |          30.8 |  **36.4** |
| Earliest retirement |             27 |            22 |    **29** |

Careers are now materially longer than before any of this, which is the correct direction: the
disruption is real, and the response to it is lost time rather than a lost career. Fourteen years is
on the generous side, and the harness that produces it never takes a hard fight and never chooses to
stop — worth revisiting once §3.2's intensity choice gives a career something else to spend.

`retirement.ts` had no tests at all before this. It has fifteen now.

---

## 11. Phase 2, as shipped

`condition.freshness` exists, falls, returns, and the hub shows it. **It is still inert**: nothing
reads it to decide anything, because §3.2's intensity dial and §3.4's fight-night hook are phase 3.
That was the plan and it is worth restating, because the readout is now visible and a player could
reasonably assume it is doing something.

### Every §5 target came out on the nose

| Measured                         | Target        |
| -------------------------------- | ------------- |
| 8-week camp at 25, time to clear | **5 weeks**   | ~5 weeks  |
| Same camp at 34, with mileage    | **8 weeks**   | longer    |
| `ageDrag(38)`                    | **0.72**      | 0.72      |
| A three-round war                | **8.3 weeks** | ~2 months |
| A thirty-second finish           | **0.7 weeks** | days      |

The fight cost reads `exposureScore` — the same number phase 1's injury roll uses — so one measure
of how hard a night was decides both what it broke and how long it takes to come back from. That is
the join the whole design was for.

### Where the mileage finally bites

`recoveryRate` takes `naturals.recovery`, `bodyWear` and age, and the spread is the point:

| Fighter     | Recovery |
| ----------- | -------: |
| 25, no wear | 1.30/day |
| 30, wear 20 | 1.08/day |
| 34, wear 60 | 0.78/day |
| 38, wear 40 | 0.79/day |

So the same eight-week camp costs a 34-year-old eight weeks to clear against a 25-year-old's five,
without a single constant saying "old fighters decline faster". `ageDrag` is applied here rather
than by decaying `naturals.recovery` itself, because naturals are what a fighter was born with and
the card should keep saying so — the same distinction `headTrauma` already observes against
`durability`.

### A bug worth recording

The load is charged by `applyTraining` and the recovery for the same days by `applyAgeing`, because
every caller in the game already runs both over the same span. Clamping the intermediate at zero
breaks that: an eight-week camp charging 118 points against 100 available bottoms out, loses the
overshoot, and then credits recovery against a floor. Measured, that put a camp's end state at 67
where the arithmetic says 57 — and the error grew with camp length, so at sixteen weeks a _longer_
camp came out fresher than a shorter one. The mid-span value now carries the overshoot and
`freshnessOf` clamps on read.

### The finding: nobody can sustain camp intensity

Back-to-back eight-week blocks with no rest at all, which is what the game currently offers:

| Fighter     | Net per block | Freshness after each block |
| ----------- | ------------: | -------------------------- |
| 24, no wear |           −45 | 55 → 11 → 0 → 0 → 0        |
| 30, wear 15 |           −55 | 45 → 0 → 0 → 0 → 0         |
| 37, wear 40 |           −72 | 28 → 0 → 0 → 0 → 0         |

**Even a 24-year-old floors out after three.** That is the model correctly demanding periodisation,
and it is the strongest argument yet for §3.2: real fighters do train year-round, but not at _camp_
intensity year-round, and the game currently has no way to express anything else. `runTraining`
charges a general block at the same rate as a fight camp because there is nothing else to charge it
at yet.

In actual play it is less stark, because fights bring layoffs and medical suspensions with them.
Doc 24's traced careers show freshness moving 100 → 88 → 11 → 80 → 97 → 63 → 0 → 46 → 76 across a
career, which is a readable signal rather than a flat line. But the trace also shows a 37-year-old
ground into the floor by a schedule that does not respect what he can recover from, and until phase
3 the player has no lever to do anything about it.

---

## 12. Phase 3, as shipped

Intensity is a real dial on both the training screen and the camp screen, `forecastTraining` obeys
it, `campInjuryChance` obeys it, and `simulateFight` starts a fighter at a fatigue derived from
their freshness. The design is §3.2 as written; what follows is what measuring it changed.

### §5's own test failed, and the test was wrong

The stated criterion was "a greedy policy over all twelve cells uses at least six". Run as written
it used **five**, never picked a twelve-week camp, and never picked overreach.

That was the scorer, not the model. It charged _total_ injury risk against _per-week_ gain, which
is dimensionally wrong and penalises length twice — once through the divisor and once through a
risk that scales with weeks. Corrected, the same policy uses **7 of 12** with a largest share of
43%, which passes.

But the deeper lesson is that a greedy policy only ever measures its own objective function, so
"six of twelve" was never strong evidence. The assertion that actually ships is **domination**: a
cell is dominated if some other cell delivers at least as much of _both_ kinds of gain, for no more
calendar, no more injury risk and no more freshness. A dominated cell can never be anybody's right
answer, whatever they are optimising — and it needs no invented objective to check.

**Zero of twelve cells are dominated.** Every one is on the frontier:

| Cell           | Craft | Body | Camp risk | Net freshness |
| -------------- | ----: | ---: | --------: | ------------: |
| 4wk light      |  1.07 | 0.22 |      3.1% |           +15 |
| 4wk standard   |  1.25 | 0.65 |      6.2% |           −23 |
| 4wk hard       |  1.31 | 0.98 |      9.3% |           −52 |
| 4wk overreach  |  1.13 | 1.24 |     14.3% |           −82 |
| 8wk light      |  2.42 | 0.52 |      6.2% |           +30 |
| 8wk standard   |  2.85 | 1.49 |     12.4% |           −46 |
| 8wk hard       |  3.01 | 2.23 |     18.6% |          −105 |
| 8wk overreach  |  2.57 | 2.83 |     28.6% |          −164 |
| 12wk light     |  3.56 | 0.77 |      9.3% |           +45 |
| 12wk standard  |  4.19 | 2.19 |     18.6% |           −69 |
| 12wk hard      |  4.41 | 3.28 |     27.9% |          −157 |
| 12wk overreach |  3.77 | 4.14 |     42.9% |          −246 |

The two rows that carry the design are visible in it. Light is the only freshness-positive column,
and it still resets the neglect clock in full. Overreach buys the most body of anything on the
board and _less_ craft than hard, which is what stops the dial being a difficulty slider.

**A fixture bug nearly hid all of it.** The first domination run said overreach was dominated at
every length — because `makeFighter` defaults `potential` to `attributes`, so every physical gain
was exactly zero and the comparison was of a fighter who could not build a physical if he wanted
to. With no body column, overreach is strictly worse than standard by construction. The test now
builds a fighter with real room in both halves and says why.

### The veteran's lever, in a real career

Doc 24's Tom Whitfield trains hard while young and switches to **light** at 32. His freshness:

| Age   |  27 |    28 |  29 |  30 |    31 |  32 |  33 |  34 |  35 |  36 |
| ----- | --: | ----: | --: | --: | ----: | --: | --: | --: | --: | --: |
| Fresh |  80 | **0** |  76 |  75 | **0** |  71 | 100 |  88 | 100 | 100 |

He bottoms out twice before the switch and never dips below 88 after it — while his overall keeps
_climbing_, 54.9 to 55.7, because light keeps 85% of technical gain and he is past the age where the
physicals were coming anyway. That is the thing the whole mechanic was asked for, and it now reads
straight off the table.

### Two defects found on the way in

**`forecastTraining` ignored intensity.** It takes `Omit<TrainingInput, 'rng'>`, so `intensity`
type-checked and was silently dropped — the camp screen would have promised a standard camp's gains
and delivered an overreach camp's. That is the exact class of defect doc 24 recorded against the
creation-screen preview, in the one function written specifically not to have it.

**A near-miss import cycle.** `intensity.ts` reached for `development.ts`'s `isPhysical`, and
`development.ts` imports `intensity.ts`. It compiled and would very probably have worked, because
the call sits in a function body rather than at module initialisation — which is exactly the kind
of safety that survives until somebody moves one line. It reads the canonical list from `ratings`
instead.

### Fight night

`createCombatant` set `fatigue: 0` flatly, so a fighter who had just overreached for twelve weeks
and one who had tapered walked to the cage identically. Starting fatigue is now derived from
freshness and capped at **0.25** — a quarter of the way to gassed at nothing left in the tank. The
cap is the guard against the whole idea: freshness must change _where you begin_, not how fast you
tire, or it becomes a second hidden cardio attribute deciding fights from a menu.
