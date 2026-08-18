# 03 — Fight Engine

> Status: living document.
>
> **Calibration note.** The engine is calibrated against the roster the game *ships*
> (`tests/statistical/roster-profile.test.ts`), not against the synthetic archetypes in
> `balance.test.ts`. That distinction was worth a lot: the archetype suite passed throughout
> while the real population finished 77.7% of its fights, because seeded fighters carry the
> high Power and Durability values the effect curve is heavy-tailed in. Where it stands:
>
> | | before | now | real sport |
> | --- | --- | --- | --- |
> | finish rate | 77.7% | 61.5% | ~48% |
> | decisions | 21.7% | 36.7% | ~52% |
> | KO : submission | 8.4:1 | 3.3:1 | ~1.8:1 |
> | first-round finish | 44% | 32% | ~16% |
>
> Closer on every axis, all the way there on none. **The residual is structural**: a full
> hazard × superlinearity × referee-threshold sweep could not close it from anywhere in the
> grid, because every setting moves the roster and an even matchup in the same direction.
> Reaching a real ~48% needs the strike volume feeding the referee's unanswered-shot counter
> to come down — a change to the exchange model, not to a coefficient. That is the next piece
> of fight-engine work, and the same change is what would bring first-round finishes down.
>
> One calibration matched reality almost exactly (46.4% finishes, 1.84:1) and was **rejected**:
> it collapsed the bomber archetype's KO rate to ~40%. Design pillar 3 says Ngannou knocks
> almost everyone out once he catches them clean, and a population average bought by deleting
> the tail is not a better sport. Do not re-derive this by flattening `BASE_KD_HAZARD`.

## Shape of a fight

```
Fight  →  Rounds (3 or 5 × 5:00)  →  Exchanges (5–30s each)  →  Events (play-by-play lines)
```

The simulator is a loop over **exchanges**. An exchange is one meaningful beat of the fight:
a strike sequence, a takedown attempt, a scramble, thirty seconds of grinding on the fence.
Each consumes a variable slice of the clock and emits one or more timestamped events.

This granularity is chosen deliberately. Per-round abstraction cannot express "he stuffed
the first eleven takedowns and then his legs went"; second-by-second is 300× the cost for
no additional narrative resolution. Exchanges are the level at which MMA is actually
discussed.

## Position

Position is the spine of the whole model. Everything else is conditioned on it.

```
                  ┌──────────┐
      ┌──────────▶│ DISTANCE │◀──────────┐
      │           └────┬─────┘           │
      │  break         │ clinch entry    │ get-up / sweep-to-feet
      │                ▼                 │
      │           ┌────────┐             │
      └───────────┤ CLINCH ├─────────────┤
                  └───┬────┘             │
                      │ takedown         │
                      ▼                  │
                  ┌────────┐             │
                  │ GROUND ├─────────────┘
                  └────────┘
                 guard ▸ half ▸ side ▸ mount ▸ back
```

Ground carries a **sub-position ladder** (`guard → halfGuard → sideControl → mount → back`)
because "he's on top" and "he's on your back" are not the same sentence. Advancing the
ladder is what Ground Control buys you; the ladder is what makes Submissions dangerous.

**Where a takedown lands depends on how it was entered.** A trip puts the thrower past the legs;
a single leg does not, because they kept the other one between you. That is the mechanical
difference between a throwing art and a shooting art, and it is why the takedown entry is a
resolved fact rather than a phrase the commentary picks.

**The clinch is two-sided.** The fighter who is not in control can strike short or *reverse* the
tie-up and become the fighter who is; the referee separates a clinch nobody is working in. It was
one-sided until then — the held fighter's only branch was to try to leave — and it showed:
measured, the fight entered the clinch three times a night and got **0.66 landed strikes** out of
it. Not a rare phase, an empty one, and a transit lounge on the way to a takedown.

## What a strike is

Every strike carries a **weapon** — `punch`, `kick`, `knee`, `elbow` — chosen per shot, *together
with its target* rather than independently of it. `WEAPON_PROFILE` gives each one its own damage,
knockdown hazard, cut chance, and **which attribute decides whether it lands flush**: a kick's
flushness reads `kicking`, so a kicker's kicks land better than their hands instead of identically.

Nobody punches a leg, so a shot to the legs is a kick and the attribute that lands it is the one
the fighter trained for it. The clinch knee is a knee. The ground elbow is an elbow, and it cuts
three times as often as a jab.

The weapon is carried into the play-by-play, which is what makes the prose checkable: the narrator
is *told* what was thrown rather than choosing a technique of its own, and
`tests/statistical/commentary-parity.test.ts` proves no line names a technique the resolver did
not resolve. Two independent draws — one in the resolver, one in the narrator — would make that
test unwritable.

## Stance

`stance` is read in the landing contest. A southpaw takes a small edge against an orthodox
fighter, scaled down by that fighter's Fight IQ, because the mechanism is unfamiliarity rather
than geometry and a smart fighter solves it inside a round. A switch-stance fighter neither takes
the edge nor gives it, which is what stops `switch` being strictly the best stance to be born
with. Measured over paired seeds: +1.9 points of win rate against a dull opponent, +1.2 against an
average one, +0.2 against a smart one.

## The exchange loop

Per exchange, for each fighter:

1. **Intent** — pick what they are trying to do, weighted by their *fight profile*
   (below), their game plan, adherence, fatigue, momentum and the score situation. A
   fighter who knows they are down two rounds hunts a finish; that is a real, modelled
   behaviour, not flavour.
2. **Resolve** — position-specific resolution. Contested rolls read attributes through the
   convex effect curve (doc 02), never raw.
3. **Apply** — damage by region, fatigue, position change, control-time accounting.
4. **Check** — knockdown, hurt window, submission finish, referee stoppage, doctor stoppage.
5. **Narrate** — emit events.

## Damage: three regions, three different consequences

Damage is not one number. This is where a lot of the qualitative depth lives.

| Region   | Accumulates              | Consequence                                             |
| -------- | ------------------------ | ------------------------------------------------------- |
| **Head** | `headDamage` (0–100)     | Lowers effective Durability → later shots end the fight; feeds career `headTrauma` |
| **Body** | `bodyDamage` (0–100)     | Accelerates fatigue accrual and suppresses recovery — the slow way to break someone |
| **Legs** | `legDamage` (0–100)      | Cuts Speed, Kicking, Takedown Defence and mobility      |

So a calf-kick game plan against a wrestler is a genuinely coherent strategy: you are not
"doing less damage", you are removing the base he takes you down from. And a body-snatcher
does nothing visible in round one and wins the fight in round three.

### Being hurt

Separate from cumulative damage, a fighter has a transient **hurt** state with a decaying
timer. Entering it is a hazard roll on a clean landing:

```
hazard = BASE
       · effect(Power, K=1.6)
       / effect(effectiveDurability, K=1.2)
       · cleanness              (how flush it landed, 0–1)
       · (1 + headDamage / 60)  (accumulated damage compounds)
```

`effectiveDurability` is the fighter's Durability, pulled down by accumulated head damage,
fatigue and career `headTrauma`, and floored by traits (`Iron Chin` +10, `Chinny` −18).

**This equation is where design pillar 3 lives.** With `K = 1.6` on Power and `K = 1.2` on
Durability, a Power-99 heavyweight generates roughly 4.8× the baseline hazard, while even a
Durability-90 opponent only divides it by 2.6. The maths says: if he lands clean, you are
in serious trouble, and no chin in the world fully solves it. That is Ngannou.

Conversely a Power-45 fighter (0.87×) against a Durability-85 chin (2.32×) produces a
hazard so low that they realistically cannot knock that person out — they have to win
another way. Which is correct and forces style diversity.

### Finishing a hurt opponent

Being hurt does not end a fight; **pursuit** does. The attacker rolls against their
`finishingInstinct` derived rating (doc 02) modified by the `finisher` / `headhunter` /
`gunShy` traits. A fighter with elite power and poor instinct lets people off the hook —
which is a real and recognisable fighter archetype.

## Stamina

`fatigue` runs 0 (fresh) → 1 (gone). It is consumed by action, not by time:

```
Δfatigue = intensity
         · POSITION_COST[position]
         / effect(Cardio, K=1.2)
         · (1 + bodyDamage / 50)
         · cutSeverityPenalty
         · traitMul('fatigueRate')
```

Grinding on the fence and defending takedowns are expensive; sitting at range is cheap.
Between rounds a fighter recovers by `effect(Cardio) · recoveryNatural · traitMul`,
suppressed by body damage.

Fatigue then feeds back through `FATIGUE_SENSITIVITY` (doc 02): kicks and scrambling
disappear first, Fight IQ and submission technique last. A gassed fighter does not become
uniformly worse — they become a *different, worse fighter*, which is exactly how it looks.

**Merab's engine is expressed here**: Cardio 97 gives a 3.1× divisor on fatigue accrual, so
takedown attempt #23 in round three costs him what attempt #5 costs a Cardio-60 fighter.
Combined with `chainWrestling` (doc 02), that is the whole phenomenon, from two ratings.

## Game plans and preparation

The camp produces a `GamePlan` (see [05 — Prep & Camps](./05-prep-and-camps.md)) that
enters the fight as:

- **Primary approach** — `pressure`, `counter`, `wrestle`, `grind`, `pointFight`, `submit`,
  `finish`. Shifts intent weights.

  `submit` exists because a submission specialist could not reach any of the other six. The
  planner's cascade tested a wrestling edge, then a clinch edge, then striking — and a fighter
  whose game is `submissions` and `scrambling` has neither of the first two, so the submission
  art fell through to the striking arm and was handed `pointFight`, whose `submit` weight is the
  lowest in the table. The engine was telling its most dangerous grappler to point-fight.

- **Targeting** — head / body / legs distribution, bent at resolution time by the fighter's own
  habits. The plan sets the shape; a headhunter with a third of the body work aims higher than
  their corner asked, and a fighter who cannot kick rarely aims at legs at all.
- **Prepped counters** — up to N specific reads on the opponent (`expectsLeadHook`,
  `expectsSingleLeg`, `expectsFenceClinch`, …).

When the opponent actually does the prepped thing, the defender gets a meaningful bonus in
that resolution. The bonus is scaled by:

```
value = PREP_MAX · scoutingAccuracy · adherence · drillQuality
```

`scoutingAccuracy` can be *wrong* — a poor scouting report produces counters for things the
opponent does not do, which is worse than no plan at all because intent weights shifted for
nothing. That asymmetry is what makes a good coach worth paying for, and what lets a
technically inferior fighter beat a better one.

`adherence` comes from personality (Ego) and traits (`Lone Wolf`). A `Lone Wolf` with Fight
IQ 90 substitutes their own read, which is often better than the plan. With Fight IQ 45 it
is a disaster.

## Referees

The assigned referee is visible before the bout and materially changes it:

| Tendency           | Effect                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `stoppageTrigger`  | Damage threshold at which a hurt fighter is saved. Low = careers saved, "he was fine!" complaints. High = highlight reels. |
| `standUpSpeed`     | How long a stalled ground position runs before a stand-up. The single biggest external modifier on a control wrestler. |
| `foulTolerance`    | Warning vs. point deduction for eye pokes, fence grabs, low blows. Also whether the foul is seen at all. |

## Fouls (built)

Six fouls, gated by position: eye poke and low blow on the feet or in the clinch, fence grab
in the clinch or on the ground, illegal knee in the clinch, strikes to the back of the head
and illegal upkicks on the ground.

**Nobody chooses to foul.** The hazard falls out of Discipline (the dominant term),
Professionalism, and fatigue — which is superlinear, because it is the last two minutes that
produce the fence grabs. *Cynical* fouls (fence grab, illegal knee, upkick) carry a second
multiplier from `desperation()`, which is exactly 1 while a fighter is winning: nobody grabs
the fence from in front.

### The point of the whole system

**A foul stops the fight, and stopping the fight is worth something.** A fighter three
seconds from being finished gets up to five minutes and a doctor because their opponent's
thumb was out. That is not a bug to be balanced away; it is one of the genuine injustices of
the sport, and it is the reason the module exists at all. `recoveryBenefit()` decides how
much of the break is actually worth having, driven by the `recovery` natural — a second
visible consequence for a hidden stat.

It never fully resets: a five-minute break clears most of the hurt state and only a fraction
of the fatigue. Being fouled while hurt must be *lucky*, never *better than not being fouled*.

### The referee decides three things

1. **Did he see it?** Driven by `foulTolerance` against how conspicuous the foul is. A
   permissive official misses fouls outright, which is where "how did he not see that?"
   comes from. An unseen foul buys no recovery, because nothing was stopped.
2. **Warning or point?** The first foul is essentially always a warning — referees talk
   before they take points, and a game where the first fence grab costs a point reads as a
   bug. Cynical fouls are punished on *cheating* rather than harm, so a trivial fence grab
   costs a point long before a far more damaging accidental eye poke does.
3. **Is that enough?** A disqualification needs a severe foul, a repeat offender and a strict
   official. It should be a career anecdote.

### Calibrated rates

Per-exchange hazards cannot be reasoned about by inspection. The first calibration looked
entirely reasonable as a set of decimals and produced a point deduction in **13.6%** of
fights and a no contest in **2.1%** — an absurd sport. `tests/statistical/fouls.test.ts` is
the actual specification:

| Measure                        | Shipped | Bound       |
| ------------------------------ | ------- | ----------- |
| Fights with any foul           | 25.1%   | 12–35%      |
| Fights with a point deduction  | 1.4%    | 0.4–3.5%    |
| No contest                     | 0.23%   | < 0.8%      |
| Disqualification               | ~0      | < 0.5%      |

## Scoring

Three judges, each with an independent **bias vector**, score every round 10-9 / 10-8 /
10-7. Judges weigh five inputs differently:

| Input               | "Damage" judge | "Control" judge | "Volume" judge |
| ------------------- | -------------- | --------------- | -------------- |
| Damage dealt        | 0.50           | 0.25            | 0.25           |
| Significant strikes | 0.20           | 0.15            | 0.40           |
| Control time        | 0.10           | 0.35            | 0.10           |
| Takedowns / subs    | 0.15           | 0.20            | 0.15           |
| Aggression          | 0.05           | 0.05            | 0.10           |

This produces genuine split decisions and genuine robberies from the *same* fight data,
which is both realistic and dramatically valuable. Judge assignment is per-bout and seeded.

A 10-8 requires clear dominance (a wide margin plus either a knockdown or dominant control);
10-7 requires near-finishing dominance.

## Output

`simulateFight()` returns a `FightResult`:

```ts
{
  method, round, timeSeconds, winnerId,
  events: FightEvent[],        // timestamped play-by-play
  scorecards: Scorecard[],     // per judge, per round
  stats: PerFighterStats,      // strikes landed/attempted by region, TDs, control time, KDs
  damageReport,                // what each fighter leaves with — feeds injuries & career wear
}
```

The UI replays `events` with a live HUD. The same array is the fight's permanent record, so
"re-watch" costs nothing and needs no re-simulation.

## Calibration, and what tuning taught us

The engine was tuned against `tests/statistical/balance.test.ts`. Four findings were
structural rather than cosmetic, and are recorded here because each one is easy to
reintroduce:

**1. Volume is load-bearing.** An early build produced ~20 landed significant strikes per
fight. That breaks two things at once. Judges score on *share of total*, so with tiny counts
the shares swing wildly, 10-8 rounds become routine, and — because every 10-8 makes a card
sum to 56 rather than 57 — roughly one fight in seven ended in a draw. Separately, a low
landed count forces each strike to carry an absurd share of the knockout hazard, so any
accuracy edge compounds into a near-certain knockout. Fixed by making exchanges **two-way**
(the fighter in front throws back) and shortening grappling exchanges.

**2. Submission danger must not compound freely.** Attempts recur every ground exchange, so
a per-attempt rate that looks sane in isolation produced a 93% submission rate in the worst
matchup. Fixed with a cubic conversion curve plus a **familiarity decay**: a defender who
has survived the same look three times knows it is coming.

**3. The hurt state was a death spiral.** The referee's "unanswered strikes" counter never
reset when a fighter recovered, so a single wobble in round one produced a stoppage in round
three. It now clears with the hurt state — the referee is watching *this* sequence.

**4. Durability's curve has to keep pace with Power's.** Power sits on a K=1.6 curve; with
Durability on 1.2, knockout rates *rose* as a division got better, which is backwards.
Durability is now K=1.45. The Ngannou statement survives intact (Power 99 still generates
~2.8× the hazard against a world-class chin) while elite-vs-elite stops being a coin toss on
who lands first.

**5. Fighters must exploit obvious holes without being told.** With purely self-referential
intent weights, a well-rounded wrestler across from a 42-rated takedown defence would stand
and strike, and lose 99% of the time. `exploitFactor` gates in-cage adaptation on Fight IQ —
and is deliberately weaker than a prepared game plan, because noticing something mid-fight
is worth less than having drilled the answer for eight weeks.

### Current population behaviour

| Matchup                       | Winner  | KO    | SUB   | DEC   |
| ----------------------------- | ------- | ----- | ----- | ----- |
| Two average fighters          | 47/47   | 24%   | 9%    | 61%   |
| Power outlier vs average      | 83%     | 76%   | 4%    | 17%   |
| Top control vs exploitable striker | 62% | 46%   | 20%   | 33%   |
| Elite striker vs contender    | ~72%    | —     | —     | —     |

Known gaps, honestly stated: the submission rate for evenly-matched fighters sits a little
below the real ~15%, and volume is still short of a real three-round fight. Neither is
distorting outcomes, and both are tracked in the statistical suite.

## Determinism & performance

The whole simulation is driven by one forked RNG (`rng.fork('bout:' + boutId)`). A single
fight is a few thousand random draws and allocates one mutable scratch state, so 10,000
fights run in a few seconds — which is what makes the statistical and long-sim test tiers
practical.
