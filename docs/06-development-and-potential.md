# 06 — Development & Potential

> Status: living document. Generation, ageing shape and retirement are built; the
> attribute-development tick is designed here and not yet implemented.

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
