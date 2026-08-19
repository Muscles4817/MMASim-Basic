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

## Approaches

Seven, each shifting intent weights in the simulator:

| Approach     | The fight you are trying to have                         |
| ------------ | -------------------------------------------------------- |
| Pressure     | Walk them down, take the centre, never let them breathe   |
| Counter      | Give them the centre and punish everything they throw     |
| Wrestle      | Get it to the mat early and often; chain the attempts     |
| Grind        | Fence, clinch, control. Win ugly and drain them           |
| Point Fight  | Bank rounds, take no risks, get out with the decision     |
| Hunt Sub     | Get it to the floor and go looking                        |
| Hunt Finish  | Swing for it, and accept the damage that comes with that  |

## Where the fight happens

**Every row of that table answers "what do I throw", and none of them answers "where is this
fight".** That is not a nuance; it is the difference between a plan and a shot selection, and
until `groundIntent` landed the plan did not carry it.

Measured before the axis existed, an 84-striking, 38-wrestling striker across from a wrestler
spent **138 seconds of a 900-second fight at distance and 368 being controlled** — and the seven
approaches moved the first number between 133 and 143. A player who built a striker and picked
`Counter` was not saying *keep it standing*. They were being told what to do during the fifteen
per cent of the night they were on their feet, and the approach table had nothing to say about
the takedown they were defending, the tie-up they were trying to leave, or the floor they were
trying to get up off. So the screen that promises a considered decision was, on the single
question the player most wanted answered, not listening.

`groundIntent` is a 0–1 dial alongside `riskLevel`, and 0.5 is a mathematically exact no-op.
`phaseProfile` turns it into six multipliers, three of which are the lever and three the price:

| Term         | What it moves                                          | Which half pays |
| ------------ | ------------------------------------------------------- | --------------- |
| `entry`      | How hard you look for the takedown and the tie-up       | both            |
| `sprawl`     | What your takedown defence is worth when they shoot     | refusing only   |
| `escape`     | How urgently you leave the fence and the floor          | refusing only   |
| `output`     | How much you throw                                      | chasing only    |
| `exposure`   | How open you are to the counter                         | both            |
| `exertion`   | What the night costs you in the tank                    | both            |

**`sprawl` and `escape` are one-sided on purpose, and the reason is the most useful thing this
section records.** The first cut made both symmetric — a fighter chasing the takedown was 18%
easier to take down and 45% less interested in standing back up. Both read plausibly and both
were wrong. A wrestler is still a wrestler when you shoot back, and *nobody* wants to be
underneath: wanting the fight on the floor is not the same as wanting to be on the bottom of
it, and conflating the two took 18 points off every world grappler's takedown defence and
flattened the striker/grappler control-time gap that `styles.test.ts` G1 protects.

**The price is not a flat tax, and four attempts at one failed before that was clear.** Charging
`output`, `commitment` or `exertion` against the refusing half each cancelled precisely what the
plan was buying: less volume and softer shots undo the striking fight you bought, and faster
fatigue degrades the takedown defence you bought it with — a penalty that compounds against its
own lever is not a price, it is a bug with a rationale. What makes this a decision is structural
rather than taxed: **picking the wrong end means choosing to fight in the phase where the other
man is better**, and that is expensive enough on its own.

Measured at n=4000, for the striker above:

|                             | vs the wrestler | vs another striker |
| --------------------------- | --------------- | ------------------ |
| Keep it standing, win rate  | 38.1% → 42.4%   | 58.7% → 57.4%      |
| Seconds held on the floor   | 337 → 304       | 155 → 89           |
| Takedowns stuffed           | 1.47 → 2.15     | 1.50 → 1.38        |
| Time at distance            | 136s → 148s     | 201s → 186s        |

Which is the shape the whole thing is for: **against the man built to exploit your hole it is
worth four points and a visibly different fight; against a man who was never going to shoot it
is worth nothing at all.** The same asymmetry the prepped reads have, on the axis that did not
have it — and note the second column carefully, because refusing the floor still cuts that
fight's ground time by 43%. Choosing where the fight happens *always* changes the fight. It only
pays when somebody was trying to put you there.

The other end of the dial is where the real punishment lives: a striker who asks for the floor
loses 14 to 19 points, and a wrestler who refuses it loses 13. That is what makes this a
decision without needing a tax bolted onto it.

### What the world gets

`planFor` gives every AI corner a lean on this axis — a wrestler above neutral, a counter-striker
below — but a **deliberately faint one**, ±0.06 rather than the ±0.5 the player can reach. The
width is measured, and the second measurement was the surprise. At ±0.24 the world's regional
promotions ended a decade with mean budget growth of **0.167 against 0.043 before this axis
existed**, over twelve start days, while the leader's was unchanged: strikers who sprawl are held
less, grapplers who are sprawled on hold less, the sport's fights get marginally more decisive,
and the bottom of the sport quietly stops being marginal — which is the thing
`promotion-costs.test.ts` exists to prevent. At ±0.12 the mean returns to 0.043 but two start days
in ten bankrupt a regional where none did before. At ±0.06 neither shows, and the styles
separation `styles.test.ts` G1 protects is unchanged at all three widths.

So the world leans and the player commits, and that asymmetry is not a compromise — it is the
same one `pickRisk` already makes, for the same reason: the extremes belong to whoever is
choosing them against a named opponent and paying knowingly.

**The round-level resolver does not model this axis**, and joins `approach` on doc 27 § 9's list
of what the Reduced level gives up. Wiring it in was tried and measured backwards: control at that
level is a clamped share of a round rather than a sequence of positions, so a fighter already near
the control ceiling absorbed a 30% cut to both grappling terms without moving, while the
second-order effects did move — a striker refusing the floor came out with *more* of the round
spent underneath, 0.570 → 0.590, where the full simulator gave 0.658 → 0.639. A term that survives
only where it does not matter is not fidelity. Since `planFor` keeps the world within ±0.06 and
anything in the player's orbit is resolved at Full, the gap costs almost nothing in practice.

**What is still open**, and it is the honest limit of this change: against an elite wrestler the
striker still spends 300 seconds underneath, because the base rate of takedowns in this engine is
high — a merely rounded 66-wrestling opponent books 2.6 takedowns and four minutes of control
against a 44-takedown-defence striker over fifteen minutes. The dial makes that a choice the
player can push against. It does not make it a choice they can win, and whether the base rate
itself is right is a separate question this change deliberately did not answer.

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
