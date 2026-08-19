# 05 — Preparation & Camps

> Status: living document.

## The claim

**Preparation should be worth more than a handful of rating points.** That is how underdogs
win in real MMA, it is the entire reason a coach is worth hiring, and it is the difference
between this being a management game and a spreadsheet with a dice roller.

It is also, in isolation, a broken idea: if preparation reliably beats ability, ratings stop
mattering. The system works because preparation is *scarce*, *uncertain*, and *specific*.

## Three gates

```
     coach + footage              camp weeks + gym            personality + traits
            │                            │                            │
            ▼                            ▼                            ▼
   ┌─────────────────┐        ┌───────────────────┐        ┌──────────────────┐
   │ SCOUTING        │───────▶│ DRILLING          │───────▶│ ADHERENCE        │
   │ is the read     │        │ how sharp is the  │        │ do they actually │
   │ even correct?   │        │ answer?           │        │ do it?           │
   └─────────────────┘        └───────────────────┘        └──────────────────┘
                                        │
                                        ▼
                          value = tendency × drill × adherence × campQuality
                          bonus = value × PREP_MAX_BONUS
```

All three must go right. That is what stops preparation becoming a flat upgrade.

## Gate 1 — Scouting: is the read even correct?

The player never sees an opponent's true tendencies. They see a **report**, produced by
`scoutOpponent()` from the truth plus an error term whose size is set by the coach's Scouting
rating and by how much footage exists.

```
accuracy = f(coach.scouting) × f(footage)
error    ~ Normal(0, (1 − accuracy) × 0.35)
```

Two consequences worth stating plainly:

- **A bad report is not vaguer, it is wrong.** It will confidently tell you the opponent
  hunts the guillotine when they have never attempted one. Camp time spent on that is gone.
- **Confidence is not accuracy.** The report's stated confidence overlaps heavily with, but
  does not track, its correctness. A weak coach who is sure of himself is a real thing, and
  learning to distrust that is part of learning the game. A regression test asserts that
  confidently-wrong reads actually occur.

**Footage** matters independently of the coach. A fighter with three regional bouts is
genuinely hard to prepare for, which is why short-notice replacements are dangerous out of
proportion to their ratings — an elite coach cannot fix an absence of tape.

## Gate 2 — Drilling: how sharp is the answer?

A camp can drill at most `MAX_PREPPED_READS = 4` things, and drilling more blunts each:

```
drill = campQuality × 1/(1 + 0.22·(reads − 1)) × f(coach.gamePlanning)
```

`campQuality` itself comes from weeks (with diminishing returns — twelve weeks is not twice
six), gym quality, coach development, and the fighter's Discipline.

The four-read cap is presented in the UI as a budget being spent rather than a checkbox
list. The player should *feel* the trade-off rather than read about it.

## Gate 3 — Adherence: do they actually do it?

From personality (Ego) and traits (`Lone Wolf`, `Fragile Ego`). A high-Ego fighter abandons
the plan the moment it stops working; Discipline partially rescues this but never fully.

A `Lone Wolf` with Fight IQ 90 substitutes their own read, which is often better than the
plan. With Fight IQ 45 it is a disaster. Same trait, opposite outcome — which is the shape
every trait in this game should have.

## What a prepared read actually buys

At resolution time, when the opponent does a prepped thing:

```
bonus = clamp01(opponentTendency) × drillQuality × adherence × campQuality × PREP_MAX_BONUS
```

applied as a multiplier on the defender's rating in that phase. `PREP_MAX_BONUS` is 0.42 —
deliberately large.

The gating on `opponentTendency` is the crucial term: **a read is only worth what the
opponent actually gives you.** Drilling a calf-kick answer against a wrestler who never
kicks multiplies by ~0, no matter how well you drilled it.

## Weight cutting

Cut severity is a function of walking weight against the division limit, scaled by body
weight so ten pounds at flyweight is a far harder cut than at heavyweight.

| Effect                    | Direction                                              |
| ------------------------- | ------------------------------------------------------ |
| Size advantage in the cage | + effective Power and Strength                        |
| Cardio                    | − fatigue resistance, every second of every round      |
| Miss-weight risk          | × Discipline and Professionalism                       |

`Weight-Cut Gambler` amplifies all three. It is the archetypal double-edged trait: a real,
earned advantage and a real, recurring cost.

## The tactical plan

**`approach` is gone.** It was seven buttons answering four unrelated questions:

```
  Pressure / Counter          → initiative: how do you take the centre?
  Wrestle / Grind             → position:   where do you want the fight?
  Point Fight                 → risk:       what are you willing to lose?
  Hunt Submission / Finish    → finishing:  what ends it?
```

Those are not alternatives. A pressure fighter who wants it on the fence and takes no risks is an
extremely common fighter, and the old control made the player pick *one* of the four things that
describe him. And because the answer was a single row in a weight table with a factor of three
across it, the engine could only read it as a nudge. Measured: an 84-striking, 38-wrestling
fighter across from a wrestler spent **138 seconds of a 900-second fight at distance, and all
seven approaches moved that number between 133 and 143.** Every plan produced the same fight —
which meant "the plan failed" and "the plan did not matter" were indistinguishable, and the second
one was always the truth.

A plan now answers five questions. `domain/tactics.ts` is the vocabulary; `fight/policy.ts` is
what makes the engine obey it.

### 1. Where do you want the fight?

| | |
| --- | --- |
| **Outside** | Kicking range. Make them come to you, and make coming expensive. |
| **Boxing range** | Where the hands work and the kicks still reach. Neither hiding nor trading. |
| **Pocket** | Chest to chest. Short shots, heavy exchanges, no room to step off. |
| **Clinch** | Fence and tie-up. Dirty box, knees, trips, control. |
| **Ground — Top** | Take them down and stay on top of them. |
| **Ground — Submission** | Get it to the floor and go hunting, from either position. |
| **Adaptive** | Take what the opponent gives you. Applies no bias at all. |

Three of the seven are standing, and that is deliberate. Two were tried first — long and pocket —
and they could not carry a boxer: a rear straight is not a pocket-only weapon, and asking a
conventional boxer to choose between "kicking range" and "chest to chest" makes him pick the wrong
one either way. `boxing` is where most fights actually happen, which is also what makes it the
most forgiving state to be told to hold.

### 2. How do you get it there?

Standing preferences pick from **Lead / Counter / Pressure / Movement**; grappling ones from
**Reactive shots / Chain wrestling / Clinch first / Trips and throws**. The pair
`(preferredState, entry)` is where the expressiveness lives: `pocket`+`pressure` is a pressure
boxer, `top`+`pressure` is a relentless chain wrestler, `top`+`counter` is a reactive wrestler who
shoots when you overextend. One axis could say none of that.

### 3. What do you do once you are there?

On top: **Control / Damage / Advance / Submit.** Underneath: **Stand up / Scramble / Play guard /
Recover / Attack.**

The bottom list is what the whole rework exists for. A striker with 32 submissions used to get
taken down and *hunt a guillotine*, because the three bottom actions were drawn from weights that
happened to be close together and the game plan was not in the room.

### 4. Finishing

**Stay disciplined / Press advantages / Hunt the finish** — how much the plan is abandoned the
moment somebody is hurt. Exchange risk is `riskLevel`, which already exists and is already
measured; positional risk was folded into the top intent, because `control` against `advance`
*is* that axis asked where the fighter actually chooses.

### 5. What changes when the fight does

Five contingencies — losing the round, winning it, badly hurt, opponent hurt, final minute — each
taking one response from a shared vocabulary (hold the plan, raise output, raise risk, lower risk,
force grappling, hunt the finish, survive, secure position). Folded away on the screen by default:
unset situations behave exactly as they did before this existed.

## How intent becomes behaviour

Every decision in the simulator is a weighted draw over locally reasonable actions. The policy
layer scores each candidate for **alignment** with the fight the corner asked for, in −1…+1, and
multiplies:

```
  bias = exp(alignment × 1.9 × urgency)
```

Exponential rather than linear because the ends must be reciprocal — at full urgency, doubling
what you want has to halve what you don't, or every plan quietly becomes "do more of everything".

**`urgency` is derived, never a dial.** It is the plan's own conviction, scaled by whether the
fighter can execute a plan at all (discipline × fight IQ), by how much of the plan is left
(`planIntegrity`, which erodes while hurt or losing and only partly recovers between rounds), and
by whether they are somewhere they did not choose to be. A slider reading "how much do you mean
it?" is not a question anybody can answer.

Two rules keep it from becoming a straitjacket:

- **Exceptional opportunities override suppression.** A man on his back told to stand up still
  takes a fight-ending choke if one is genuinely there — `submissionOpportunity` is built from the
  *gap* and the position, so a 90-submissions fighter gets an exemption when the position offers
  one, not a permanent licence.
- **Intent is not ability.** Nothing here makes anybody better at anything. A 25-wrestling fighter
  told to take it to the floor shoots constantly, misses, gets countered and empties his tank.
  That is a *failed game plan*, and it is the outcome the old model could not produce.

## Range is a fight state, not a label

`FightState` carries a `range` — `outside | boxing | pocket` — and it is *contested*, once per
exchange, by whoever wants it moved. This is the piece the plan needed underneath it. Before it
existed, "where do you want the fight" could only be answered on the floor, because standing up
the engine had exactly one place to stand.

**The plan decides what range you want. Skills decide whether you get it.** `rangeChangeChance`
is a push-versus-resist contest: the mover's range control against the holder's, scaled by the
mover's intent, the holder's ability to deny ground, and how established the current range is.
Reach tilts it — a 12% swing across a six-inch difference — but is deliberately not a term in
range control itself, so a long fighter with no feet is still a long fighter with no feet.

Range control today reads `speed × 0.5 + fightIq × 0.3 + cardio × 0.2`. That expression is a seam:
it is what a **Footwork** attribute would replace if the attribute model ever gains one, and it is
written in one function so that change is one function.

Measured over 900 fights on two identical 70-across fighters, by what each corner was told:

| plans | outside | boxing | pocket | kick share | takedowns |
| --- | --- | --- | --- | --- | --- |
| Outside vs outside | 91% | 8% | 1% | 52% | 2.50 |
| Boxing vs boxing | 19% | 79% | 2% | 34% | 3.84 |
| Pocket vs pocket | 20% | 29% | 50% | 23% | 4.41 |
| Outside vs pocket | 52% | 33% | 15% | 44% | 2.85 |

Two things in that table are the point. The **kick share halves** from 52% to 23% without a word
about kicks in any plan — a head kick from someone's chest is a bad idea and the engine now knows
it, which is most of why a kickboxer and a karateka used to produce the same fight. And the
contested row sits between the two agreed ones rather than at either: two fighters who want
opposite things get a fight neither of them asked for.

### Getting there is a skill, and failing costs

The same instruction given to two different fighters:

| | outside | boxing | pocket | kick share |
| --- | --- | --- | --- | --- |
| 88-speed, 86-IQ, told to stay outside | 68% | 26% | 7% | 51% |
| 40-speed, 40-IQ, told to stay outside | 38% | 36% | 26% | 39% |

Both are trying equally hard — urgency comes from the plan, not from the attributes — and one of
them spends a quarter of the fight in a phone booth he was told to avoid. A failed entry is not
free either: a fighter who lunges and does not arrive hands the other man a counter at 1.45× the
usual scale, because getting caught coming in is how the sport charges for a bad entry.

### What range does not do

Pocket danger is *emergent*. There is no global "the pocket is 40% more dangerous" multiplier: the
positional hazard table runs 0.92 to 1.08 and is mean-1 under a reference mix, so it says which
range is dangerous and never how dangerous the sport is. The pocket hurts because of what is
available there — hands over kicks, more counters, more exertion — which is a fight explaining
itself rather than a constant asserting something.

Range also **persists**. `rangeSettled` decays on a 22-second half-life, so a range that was just
imposed resists being changed back on the very next exchange, and the fight stops flickering. And
it distinguishes a referee reset, which returns everybody to `outside`, from an organic one: a
scramble to the feet lands in the pocket, a clean break from the clinch lands at boxing range. A
fighter who scrambles up with the other man attached is not magically at kicking range.

### Both fidelity levels

`resolveFightByRound` had to learn all of this in the same pass, because fighters are promoted
from the Reduced resolver to the Full one and a promotion must not change how somebody fights. It
estimates the range mix the same way — including the share of a round nobody chose, which is the
walk back in from every reset — and reads the weapon mix a fighter *realises* where he is standing
rather than the one his attributes suggest in the abstract. `tests/statistical/reduced-fidelity.test.ts`
holds the two levels to 12 points on every axis, and names the one cell where range
outran what a round-granularity model can see.

## What proves it

`tests/statistical/tactics.test.ts` holds the fighters and the seeds fixed and changes only the
plan. On two identical 70-across fighters:

| plan | distance | top | takedowns tried | subs tried | kick share |
| --- | --- | --- | --- | --- | --- |
| Outside + movement | 267s | 117s | 2.25 | 1.71 | 41% |
| Pressure boxer | 268s | 133s | 2.59 | 1.89 | 27% |
| Clinch grinder | 214s | 209s | 3.88 | 2.56 | 20% |
| Point wrestler | 189s | 338s | 6.91 | 3.35 | 17% |
| Submission hunter | 167s | 295s | 5.18 | **9.69** | 27% |

And the plan has to *suit* the fighter. Win rate by (fighter, plan) against the same opponent:

| plan | striker | grappler | balanced |
| --- | --- | --- | --- |
| no plan (adaptive) | 66 | 79 | 71 |
| outside striker | **76** | 65 | 63 |
| counter striker | **77** | 67 | 67 |
| point wrestler | 57 | 82 | 74 |
| ground and pound | 66 | **86** | 80 |

A 20-point swing for picking the plan that matches who you are, and a real penalty for picking
against it.

## What it cost

Two things worth stating plainly.

**The old default plan was not neutral.** `defaultGamePlan()` carried `approach: 'pressure'`,
which multiplied striking by 1.25 and takedowns by 0.8 — and every "unplanned" fight the whole
statistical tier is calibrated against ran on it. Removing it is a correctness fix and it moved
real numbers; `BASE_ATTEMPTS` in the round resolver came down from 15.5 to 15.0 to follow it.

**The sport is more decisive.** When every fighter commits to the phase they are best in, more
fights end. Across the whole 2026 roster:

```
                    before   after     real sport
  finishes           49.1%    52.5%       ~48%
  decisions          47.7%    44.1%      ~48-52%
  KO : submission     1.51     1.91       ~1.8
  first round        31.1%    35.1%       ~16%
```

The knockout-to-submission ratio moved *toward* the real sport; the first-round rate moved away
from it. That gap is the next piece of work and it is not reachable from the tactical layer —
absorbing it in `BASE_KD_HAZARD` was tried and rejected, because it takes the kicking attribute's
win-rate swing under the floor `styles.test.ts` holds it to.

**What it bought**, measured on the styles fingerprint: G1 separation went from **3 of 15 pairs to
6**, and wrestling finally separated from jiu-jitsu — the pair whose whole difference is what you
do having arrived on the floor, which the one-axis model had no vocabulary for.

## Targeting

The head/body/legs split is not a damage-flavour choice — the three regions have genuinely
different consequences (doc 03):

- **Legs** cut Speed, Kicking and Takedown Defence. A calf-kick plan against a wrestler
  removes the base he shoots from.
- **Body** accelerates fatigue and suppresses between-round recovery. Nothing visible
  happens in round one; the fight is won in round three.
- **Head** ends fights.

## What proves this works

`tests/statistical/balance.test.ts` asserts, on identical fighters with identical seeds:

- a correct, well-drilled read measurably improves an underdog's win rate;
- the same camp effort spent on the wrong reads does not;
- and preparation still cannot overturn a genuinely enormous gap.

If any of those three stops holding, the system is broken regardless of how good the numbers
look in isolation.

## Not yet built

- Training blocks that move attributes during camp (see doc 06).
- Camp injuries and overtraining.
- Sparring partners, and the gym-quality effect on them.
- Multi-coach corners with per-discipline specialists.

## What the journey pass changed

A UX pass walked the training and fight-camp screens as a player does, rather than reviewing
them as components. Two of the findings were not presentation problems at all — they were
failures in what happens *between* screens, which is exactly the class a component review
cannot see.

### Training could walk past a booked fight

`runTraining` advances the world clock by the whole block, and the training screen had no
idea a fight was booked. A twelve-week camp with a fight in eight walked the calendar
straight past fight night. Verified, silent, and now both warned about and refused.

The general lesson: **any control that moves the world clock has to know what is already on
the calendar.**

### The fight plan was not written down until you fought

The camp plan — every drilled read, the approach, all three targeting sliders — was persisted
only inside `startFight`. Leaving the screen for any reason (checking the opponent's profile,
an accidental back gesture) silently discarded it and restored a default plan the player had
never chosen, on the one screen whose entire purpose is a considered decision. It now saves
as it is built.

### The interface promised something the engine did not do

The training screen said longer camps give more "with diminishing returns", and doc 05 says
the same about camp weeks. The development formula was strictly **linear** in weeks, so three
four-week camps and one twelve-week camp came to precisely the same thing and the duration
was a false choice. `trainingBlocks()` now applies `(weeks / 4) ^ 0.75`, with the base gain
raised so the common eight-week camp lands exactly where it did — a change to the *shape* of
the curve, not its level.

This was found by writing the forecast, not by reading the code: the forecast test asserted
"per-week value falls as camps get longer" and it did not.

### The decision screens did not show the decision

Neither screen showed the player their own fighter. Training asked what to work on without
displaying any rating; fight camp showed a scouting report on the opponent and nothing about
you, so "does this threat matter?" had to be answered from memory of a screen two taps away.
Each read now states the player's own defence in that phase, in words: *"Your takedown
defence is weak (44) — this one will hurt you."*

### Rest was a trap

Resting is skill decay. The control was labelled "Rest instead" and explained nowhere, so a
healthy fighter's player would reasonably read it as recovery and quietly get worse.
`restAdvice()` says which situation you are in, and `weeksUntilFit()` gives the injured
player the number the game already knew and never told them.

### The forecast shares its arithmetic with the camp

`forecastTraining()` and `applyTraining()` compute gains through the same `rawGain()`
function, and a test brackets 300 real camps inside the forecast's range. A forecast built
from a second copy of the formula would drift the first time either was tuned, and **a
forecast that lies is worse than no forecast at all.**
