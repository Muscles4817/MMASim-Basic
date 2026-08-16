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

Six, each shifting intent weights in the simulator:

| Approach     | The fight you are trying to have                         |
| ------------ | -------------------------------------------------------- |
| Pressure     | Walk them down, take the centre, never let them breathe   |
| Counter      | Give them the centre and punish everything they throw     |
| Wrestle      | Get it to the mat early and often; chain the attempts     |
| Grind        | Fence, clinch, control. Win ugly and drain them           |
| Point Fight  | Bank rounds, take no risks, get out with the decision     |
| Hunt Finish  | Swing for it, and accept the damage that comes with that  |

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
