# 03 — Fight Engine

> Status: living document.

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

- **Primary approach** — `pressure`, `counter`, `wrestle`, `grind`, `pointFight`, `finish`.
  Shifts intent weights.
- **Targeting** — head / body / legs distribution.
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
| `foulTolerance`    | Warning vs. point deduction for eye pokes, fence grabs, low blows.     |

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
