# 07 — Injuries & Health

> Status: built. Acute injuries, recurrence, fighting hurt and aggravation all ship.

## Three timescales

Injury in MMA is not one system. Conflating these is why a lot of sims get it wrong.

| Timescale     | What it is                                    | Built?                    |
| ------------- | --------------------------------------------- | ------------------------- |
| **Tonight**   | Damage meters within a fight; the hurt state  | Yes (doc 03)              |
| **Weeks**     | Acute injuries: breaks, tears, cuts, layoffs  | Yes                       |
| **Career**    | `headTrauma` and `bodyWear`; permanent erosion | Yes                       |

## Career damage (built)

Two accumulators that only ever go up:

- **`headTrauma`** (0–100). Accrues from head strikes taken, at a rate modified by
  `headTraumaRate` traits, and increased when a fight ends with the fighter finished by
  strikes — it is the shots after the lights flicker that do the lasting harm. It
  permanently erodes effective Durability and, past a threshold, can convert `Iron Chin`
  into `Chinny`.
- **`bodyWear`** (0–100). Accrues from body and leg damage. Drives chronic injury risk and
  lengthens layoffs.

### The runaway that had to be tamed

Trauma → worse chin → more knockouts → more trauma is a genuine positive feedback loop, and
the first implementation ran away with itself: by year twenty of the long-sim suite half the
roster carried `Chinny` and the population KO rate had climbed past 70%.

Three numbers hold it in check, and all three are load-bearing:

| Value                        | Setting | Effect of getting it wrong                        |
| ---------------------------- | ------- | ------------------------------------------------- |
| Trauma per point of damage   | 0.032   | Too high and every career ends in five years       |
| `Chinny` threshold           | 78      | Too low and the whole roster acquires it           |
| `Chinny` chance per fight    | 0.10    | Too high and it becomes universal rather than sad  |

This is exactly the class of problem that cannot be found by inspection, which is why the
long-sim tier exists.

## Layoffs (built)

`readinessDelay()` sets days until a fighter can compete again, from a base of ~70 days,
lengthened by accumulated trauma and shortened by the `recovery` natural. A knockout loss
carries a mandatory medical suspension regardless of how the fighter feels — realistic, and
the mechanism that stops a career being a treadmill.

## Acute injuries (built)

### Where they happen

| Source          | Hazard driven by                                                    |
| --------------- | ------------------------------------------------------------------- |
| In camp         | `injuryProneness`, camp intensity, age, `Gym Rat` / `Injury Prone`   |
| In the fight    | `fightInjuryRisk` traits, damage taken, specific actions             |
| Weight cut      | Cut severity, Discipline, Professionalism                           |

Camp injuries are the most interesting because they create a **decision**: pull out of the
fight, or take it hurt. Taking it hurt should be a real option with a real cost, not a
punishment — that is a choice fighters genuinely make.

### Injury types

| Injury            | Duration     | While carrying it                                    |
| ----------------- | ------------ | ---------------------------------------------------- |
| Hand / wrist      | 6–14 weeks   | −Striking Offence, −Power; the classic "he was hurt" |
| Knee (ligament)   | 20–40 weeks  | −Speed, −Wrestling, −Takedown Defence, −Scrambling   |
| Shoulder          | 10–20 weeks  | −Wrestling, −Submissions, −Clinch                    |
| Rib               | 4–8 weeks    | −Cardio, −Composure under body attack                |
| Cut (in fight)    | 2–4 weeks    | Reopens easily; raises doctor-stoppage risk          |
| Concussion        | 8–24 weeks   | +`headTrauma`, mandatory suspension                  |
| Back              | 8–16 weeks   | −Strength, −Explosiveness; chronic recurrence        |

Each has a **recurrence chance** that rises with `bodyWear`. A fighter with three knee
injuries on the record is a fighter whose camps keep collapsing — Dominick Cruz's hidden
`injuryProneness: 88` in the seed roster exists to make that specific career shape possible.

### Fighting hurt

If a fighter takes a bout while carrying an injury:

- The affected attributes are suppressed for that fight.
- Aggravation risk is high, and aggravation extends the layoff substantially.
- **Nobody is told.** The opponent's scouting report does not know. The player finds out
  from how the fight looks, which is exactly how it works in reality.

### Pull-outs

A pull-out costs money, promotion relationship, and momentum, and is heavily influenced by
Professionalism and Ambition. A low-professionalism fighter pulls out of fights they could
have taken; a high-ambition one takes fights they should not.

## Weight-cut failures (partially built)

`weightMissRiskMultiplier()` exists and is driven by Discipline and Professionalism,
amplified by the `Weight-Cut Gambler` trait. Consequences to implement:

- Missing weight: purse forfeit, fight proceeds at catchweight, reputation hit.
- A badly botched cut: severe Cardio penalty on the night, and a real hospitalisation risk.
- Repeated misses: forced division change.

## What must never happen

- An injury that silently makes a fighter unbeatable or unusable with no visible cause.
- Injuries so frequent that the player cannot plan, or so rare that `injuryProneness` and
  the health traits are decorative.
- A permanent effect that is not surfaced somewhere the player can find it.
