# 06 — Development & Potential

> Status: living document. Generation, ageing, retirement and the training tick are all built —
> `applyTraining`, `applyAgeing` and `applyIdleDecay` in `progression/development.ts`, exercised
> by the long-sim tier. What this document still describes ahead of the code is called out where
> it occurs.

## What a fighter already is on debut

Potential is a ceiling; **arrival** is how much of it they have on the day they turn pro, and it
is one band per attribute rather than one number for the fighter. The split is by how much of the
quality is *built* rather than *born*:

| | at 20 | at 30 | why |
| --- | --- | --- | --- |
| `speed` | 0.92 | 0.99 | The most innate thing in the sport. Everything after is decline. |
| `durability` | 0.92 | 0.99 | A chin is at its best before anybody has hit it. |
| `power` | 0.85 | 0.98 | Mostly explosiveness, with some technique in it. |
| `strength` | 0.78 | 0.97 | Genuinely built — the weight-room years are worth about a fifth. |
| `cardio` | 0.68 | 0.96 | The most trainable quality a fighter has. |
| everything technical | 0.55 | 0.85 | Wrestling and fight IQ take a decade. |

This was one `development` factor applied to all sixteen attributes with a flat +0.1 for the
physical group, which put a 21-year-old's **speed at 69% of their own ceiling** — a debutant
generated a third slower than they will ever be. And the decline is modelled *separately*, in
`PEAK_AGE` and the per-attribute rates below, so youth was penalised at both ends and peak speed
landed near 28.

**The point of the change is the freak.** The ceilings always allowed one — `explosiveness` rolls
with a standard deviation of 14 up to 97 — and arriving at 69% of them is what made every
21-year-old average. Measured now: 42% of debutants are faster than the median thirty-year-old,
and in the heavyweight division the top of a 400-fighter cohort reaches the Elite band for
strength while the top 5% match the median peak fighter. Rare, and it happens.

A first cut had strength arriving at 0.62, which put **one per cent** of debutants above a median
thirty-year-old and produced no strong young fighters at all. A 21-year-old professional who has
been lifting since school is not at two thirds of his eventual maximum.

Guarded from both sides in `progression/arrival.test.ts`: the freak must occur, *and* the
technical gap between the cohorts must stay decisive — otherwise "physicals arrive early" has
quietly become "everybody arrives finished" and the climb the game is about disappears.

## There is no potential number

The single most important decision in this document: **potential is not a rating.** It is a
per-attribute ceiling vector, derived from hidden naturals, and the player never sees the
true values.

A single "Potential: 87" number is the wrong abstraction because it implies a fighter
improves uniformly. Real fighters do not. A prospect with an enormous engine and poor
motor learning becomes a cardio machine who never learns to strike — and that is a specific,
recognisable fighter that a single number cannot describe.

```
NATURALS (hidden)          →   CEILINGS (hidden)        →   SCOUTED ESTIMATE (shown)
explosiveness, engine,         one per attribute            a range, with a width set
constitution, recovery,        e.g. wrestling 89,           by scouting quality
motorLearning, frame,          power 61, cardio 74
injuryProneness, ageCurve
```

## Ceilings from naturals

`ceilingsFromNaturals()` caps each attribute by the physical qualities it actually depends
on, plus a skill term from motor learning:

| Attribute group        | Capped mostly by            | Skill weight |
| ---------------------- | --------------------------- | ------------ |
| Power, Speed           | Explosiveness               | 0.15–0.25    |
| Cardio                 | Engine                      | 0.15         |
| Durability             | Constitution                | 0.05         |
| Striking, Kicking      | Explosiveness               | 0.70         |
| Wrestling, TDD         | Explosiveness + Engine      | 0.60         |
| Submissions            | Recovery                    | 0.85         |
| Fight IQ               | Motor learning              | 0.90         |

Durability's near-zero skill weight is the important one: **you cannot train a chin.** You
can train everything else.

## Generation runs naturals-first

`generateFighter()` rolls the hidden physiology, derives ceilings from it, then derives
current attributes from the ceilings scaled by how much of a career the fighter has had.

Doing it the other way round — rolling visible attributes and back-filling naturals —
produces physiologically impossible people (Cardio 90 on a body with no engine) and makes
potential meaningless, because potential is a function of the naturals the attributes were
supposed to have come from.

A `tier` parameter shifts the whole distribution but guarantees nothing. A tier-90 prospect
with an unlucky Constitution roll is a future contender with a suspect chin — a far more
interesting fighter than a uniformly-scaled one.

Physical attributes arrive closer to their ceiling than technical ones. A 21-year-old is
already fast and strong; they are not yet a good wrestler.

## Scouting a prospect

The player sees an estimate with an uncertainty band whose width depends on their coach's
Scouting and on available footage. Two prospects both shown `Wrestling 74 → 80 ± 9` can have
true ceilings of 71 and 89.

This is the same uncertainty machinery as opponent scouting (doc 05), and deliberately so:
the skill of *reading people* is one skill, and a coach who is good at it is good at both.

## Development (designed, not yet built)

Per training block:

```
gain = base
     × f(motorLearning)                 the dominant term
     × coachEffectiveness(discipline)   specialists matter, generalists dilute
     × f(gymQuality)
     × campGainMultiplier(personality)  Discipline, mostly
     × traitMul('developmentRate')      Gym Rat, Gatekeeper Mentality
     × headroom(current, ceiling)       asymptotic: the last points are the hardest
     × ageFactor(age, ageCurve)
```

`headroom` is asymptotic rather than linear. Going from 60 to 70 is much easier than 80 to
85, and reaching a ceiling exactly should be rare. Without it, every fighter with a long
enough career converges on their ceiling and the population flattens.

### Ageing

`AgeCurve` selects the shape:

| Curve          | Peak    | Notes                                                    |
| -------------- | ------- | -------------------------------------------------------- |
| `earlyBloomer` | 25–28   | Sharp decline after. Often the physical freaks            |
| `standard`     | 28–32   |                                                          |
| `longPeak`     | 29–35   | The fighters who seem not to age                          |
| `lateBloomer`  | 31–35   | Technical fighters who keep learning                      |

Decline is **not uniform**. Explosiveness goes first, which takes Power and Speed with it.
The engine goes slowly. Craft — Fight IQ, Submissions, Composure — can still be *rising*
while the body falls, which is exactly what a veteran's career looks like.

`Constitution` is the exception to naturals being fixed: it is permanently eroded by
knockouts and accumulated head trauma. That is why chins go and never come back, and why
`Iron Chin` is double-edged — the fighters who can absorb the most are the ones nobody saves.

### Decay out of camp

`idleDecayMultiplier(personality)` runs from 1.6× (undisciplined) to 0.45× (professional).
A `Party Animal` on a long layoff comes back a visibly worse fighter, which is a real and
recognisable phenomenon.

## Retirement (built)

`retirementUrge()` combines age, head trauma, body wear, a losing skid and collapsed
confidence, discounted by Ambition and Resilience — a stubborn fighter keeps going long past
the point a fragile one would stop.

The urge is **squared** before becoming a probability, so a fighter who is merely thinking
about it usually carries on and only a fighter who is genuinely finished actually stops.
That preserves the "one fight too many" story, which is most of the drama in a career sim.

Past the hard age (46) the personality discount stops applying: bodies do not negotiate.

## Replenishment (built)

New fighters enter the sport continuously. The long-sim suite found this the hard way: a
fixed roster plus working retirement is a world that quietly empties, and by year fifteen
half the divisions had died. The sport now replaces the people who leave.

## What the long-sim suite guards

- **No ratings inflation.** Currently asserted as exact stability, since nothing moves
  attributes yet. When development lands this becomes a bounded-drift check — and it will
  catch the day development starts quietly ratcheting the whole roster upward.
- No 600-fight careers, no immortal champions, no division collapse.
- Acquired traits occur but never consume the roster.
- Star power does not collapse into a single runaway name.

## The audit that found the mode was unwinnable

An independent analysis was asked one question — *does training move a fighter enough to
matter, and is there a test that takes a created fighter and develops them into a champion?*
The answer to the second was **no**, and finding out why answered the first.

### It was not difficult to become champion. It was impossible.

Verified directly across 2000 rolls: a created fighter's *potential*-overall — the rating
they would have with every attribute trained to its ceiling and infinite time to do it —
topped out at **71.2**, with a median of 61.2. The seeded champions rate **78.4 to 84.6**.

No amount of play could close that. The central promise of the mode was unreachable by
construction, and nothing tested it because no test had ever developed a created fighter past
a single camp.

### Four separate things were wrong

| Defect | Effect |
| ------ | ------ |
| Naturals centred at 52 | Ceilings capped ~14 points below champion level. Nothing in play raises a ceiling |
| Starting baseline of 32 | Debut at overall 36 — fifteen points below the *worst* professional on the roster |
| Fractions rounded away each camp | At the game's own starting gym, **32 of 40 consecutive camps moved nothing at all** |
| `learningRate` floored at 0.25 by ~35 | About twenty productive camps in an entire career |

The last two compounded viciously: the opening hours of the game were inert, and the window
in which training worked was too short to recover.

### What changed

- **Naturals centred at 73**, and rolled on a normal distribution with a fat tail rather than
  a flat ±9. Most created fighters have the ceiling of a roster fighter, a few of a
  contender, and a rare one is the real thing. That variance *is* the design — the brief
  asked for extreme outliers to be genuinely extreme, and that has to apply to the player.
- **Debut baseline of 46**, so a created fighter turns pro at around 50 — at the bottom of
  the professional roster rather than below any professional level.
- **Fractional training progress is banked** on the fighter as `trainingCarry`. A poor room
  is now *slow* rather than *inert*, which is the difference between a difficulty curve and
  a broken system. It also fixed a quieter lie: the camp report had been showing gains that
  never happened.
- **Every attribute is guaranteed room at debut.** Clamping starting attributes down to a
  low ceiling roll had silently eaten the player's background and allocated points.
- **`learningRate` floored at 0.55**, roughly doubling the productive length of a career
  without making any single camp larger. That resolved a direct conflict: no per-camp gain
  small enough to keep one camp modest could carry a debutant to a champion in twenty camps.
- **Gain per block raised to 2.8** from 0.654.

### Where it landed

Forty full careers, played *pessimistically* — rotating focus rather than specialising:

| | Overall |
| --- | --- |
| Debut | 49.8 |
| Median career peak | 68.2 |
| Best of forty | 79.7 |
| Worst of forty | 56.4 |
| Reached contender level (71+) | 25% |
| Reached champion level (78+) | 5% |

That is the shape the mode wants: the belt is a hard, uncertain target that a good roll
played well can reach and a poor roll cannot.

### The test that was pinning it

`'makes one camp barely visible and two years transformative'` asserted a single camp added
under four rating points — measured on a fixture with all attributes at 40 and all ceilings
at 85, a forty-five-point gap no real fighter carries. An absolute bound on the most extreme
possible case was, in practice, a bound on the gain constant itself, and it held the whole
system below the level where a career could function.

It now measures the **share of available room** a camp closes, which is what the claim was
always about, and the absolute question is asked in `tests/long-sim/created-career.test.ts`
against a fighter who can actually exist.
