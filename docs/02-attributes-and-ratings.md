# 02 — Attributes & Ratings

> Status: living document. This is the load-bearing document of the whole project.

## The three layers

```
┌─ NATURALS (hidden, ~fixed) ─────────────────────────────────────┐
│  Genetic/physiological substrate. Never shown as numbers.       │
│  Sets ceilings, learning rate, ageing curve, injury risk.       │
└─────────────────────────┬───────────────────────────────────────┘
                          │ with
┌─ BODY (hidden, slow-moving) ─────────────────────────────────────┐
│  Height, reach, skeleton, muscle, body fat, water tolerance.     │
│  Walking weight and division fall OUT of it, not into it.        │
└─────────────────────────┬───────────────────────────────────────┘
                          │ constrains, through the ladder
┌─ ATTRIBUTES (visible, 15) ───────────────────────────────────────┐
│  What the player sees on the fighter card. 1–100, ABSOLUTE.     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ feeds
┌─ DERIVED (computed, never stored) ───────────────────────────────┐
│  Clinch Off/Def, Sub Defence, Ground & Pound, Finishing,         │
│  Chain Wrestling. Recomputed on demand, never stored.            │
└──────────────────────────────────────────────────────────────────┘
```

Only the attribute layer is stored-and-edited. Naturals and body are storable but hidden.
Derived stats are _never_ stored — storing them is how rating systems rot.

**The body is a layer, not a stat.** It used to be one hidden number called `Frame`, computed as
`walkingWeight / 300`, which meant the division decided the physique rather than the other way
round: every lightweight scored frame 55 ± 3 and there was no such thing as a big lightweight. It is
now a real body that walking weight and division are _derived from_. The full treatment is
[31 — The Physical Ladder](./31-the-physical-ladder.md) § 12 step 4.

---

## Layer 2: The 15 attributes

Grouped into four blocks so a fighter card reads as four bars, not fifteen.

### Physical (5)

| #   | Attribute      | Means                                                                |
| --- | -------------- | -------------------------------------------------------------------- |
| 1   | **Power**      | Absolute force delivered on a clean strike. Fight-ending potential.  |
| 2   | **Speed**      | Hand/foot speed, reaction time, how often you land first.            |
| 3   | **Cardio**     | Gas tank. Rate of fatigue accrual and between-round recovery.        |
| 4   | **Durability** | Chin + body. Ability to absorb damage without being hurt.            |
| 5   | **Strength**   | Functional grappling strength. Clinch, top pressure, breaking grips. |

### Striking (3)

| #   | Attribute            | Means                                                            |
| --- | -------------------- | ---------------------------------------------------------------- |
| 6   | **Striking Offence** | Boxing. Accuracy, combinations, shot selection, in-pocket craft. |
| 7   | **Kicking**          | Kick arsenal & commitment: legs, body, head, knees.              |
| 8   | **Striking Defence** | Head movement, distance management, guard, not being there.      |

### Grappling (5)

| #   | Attribute            | Means                                                          |
| --- | -------------------- | -------------------------------------------------------------- |
| 9   | **Wrestling**        | Takedown offence: entries, chaining, level changes, trips.     |
| 10  | **Takedown Defence** | Sprawl, underhooks, hips, wall defence, getting back up.       |
| 11  | **Ground Control**   | Top position retention, passing, ground-and-pound.             |
| 12  | **Submissions**      | Submission offence: chains, transitions, finishing squeezes.   |
| 13  | **Scrambling**       | Bottom game, guard work, get-ups, transition speed, wall-walk. |

### Mental (2)

| #   | Attribute     | Means                                                                        |
| --- | ------------- | ---------------------------------------------------------------------------- |
| 14  | **Fight IQ**  | Reading the fight, adapting mid-round, executing the game plan.              |
| 15  | **Composure** | Performing while hurt, in deep water, in hostile buildings, in title rounds. |

### Why not more?

Clinch, submission defence, ground-and-pound, finishing and chain wrestling are all
**derived** rather than stored, because they are genuinely functions of the above and giving
them their own sliders would let the editor produce incoherent fighters (Strength 30, Clinch
90). There are six, and this is all of them:

```
Clinch Offence     = 0.35·Strength + 0.25·Wrestling + 0.22·Scrambling + 0.18·Submissions
Clinch Defence     = 0.45·Strength + 0.40·TakedownDefence + 0.15·StrikingDefence
Submission Defence = 0.40·Scrambling + 0.30·Submissions + 0.20·FightIQ + 0.10·Strength
Ground & Pound     = 0.55·GroundControl + 0.45·Power
Finishing Instinct = 0.40·FightIQ + 0.30·Power + 0.15·Submissions + 0.15·Composure
Chain Wrestling    = 0.50·Wrestling + 0.30·Cardio + 0.20·Strength
```

Clinch Offence reads hand-fighting rather than being a second wrestling score. It was
`0.45·Strength + 0.35·Wrestling + 0.20·StrikingOffence`, which made the clinch a near-copy of
chain wrestling — the same two attributes deciding both — so **the engine could not tell a clinch
grappler from a shot grappler**, and judo and wrestling came out within three points of each other.
Strength still leads it, because you cannot hold somebody you cannot hold.

**Every key here must be read by something.** `Cage IQ` — Fight IQ 0.6 against Composure 0.4 —
was computed for both corners of every fight and read by nothing, because both of its inputs
were already read directly at four separate sites: it was a name for something the engine does
twice, not a capability of its own. It was deleted. A derived rating nothing consumes is not an
abstraction, it is a number on the player's screen that the simulator does not honour.

Exact weights live in `packages/engine/src/ratings/derived.ts` and are unit-tested against
a table of named archetypes.

---

## The scale

**1–100. Absolute. Cross-divisional. Not normalised to the fighter's weight class.**

| Band   | Meaning                                                               | Population        |
| ------ | --------------------------------------------------------------------- | ----------------- |
| 96–100 | All-time outlier. The thing people will still talk about in 30 years. | 0–3 alive at once |
| 90–95  | Best in the world at this, right now.                                 | ~5 per attribute  |
| 82–89  | Elite. Best-in-division tier.                                         | ~25               |
| 72–81  | Very good. Top-15 quality.                                            | ~90               |
| 62–71  | Solid, rostered, credible.                                            | ~250              |
| 50–61  | Average for a major-promotion roster.                                 | bulk              |
| 38–49  | Below major-promotion level. A hole opponents will find.              |                   |
| 20–37  | A genuine liability. This is how you lose.                            |                   |
| 1–19   | Effectively absent from their game.                                   |                   |

### Absoluteness in practice

**The five physicals are not ratings that happen to correlate with mass. Each one is a logarithmic
scale over a measurable physical quantity**, and mass enters through an allometric exponent because
that is how the quantity behaves. This is the locked scale; the derivation is
[31 — The Physical Ladder](./31-the-physical-ladder.md) § 2, and the parameters live in
`packages/engine/src/ratings/physicalScale.ts`.

| Attribute      | Quantity it measures                            |   D |     β |    σ | reads      |
| -------------- | ----------------------------------------------- | --: | ----: | ---: | ---------- |
| **Power**      | peak impulse delivered on a clean strike        |  43 | +0.60 | 11.3 | lean mass  |
| **Strength**   | maximal voluntary force in a grappling posture  |  46 | +0.67 | 11.0 | lean mass  |
| **Speed**      | limb and whole-body movement velocity           |  70 | −0.20 | 10.5 | total mass |
| **Cardio**     | sustainable work rate per unit of body carried  |  55 | −0.25 |  9.7 | total mass |
| **Durability** | impulse required to produce a concussive effect |  45 | +0.10 | 10.7 | lean mass  |

```
quantity(r) = quantity(50) · 2^((r − 50) / D)
rating      = 50 + D · β · log₂(mass / pivot) + individual · σ
```

`D` is **points per doubling** of the quantity: 43 points of Power is twice the impulse. `β` is the
allometric exponent against mass. `σ` is derived rather than chosen — `D · log₂(1 + CV)` from each
quantity's within-division coefficient of variation — and all five land between 9.7 and 11.3, so
**one standard deviation is about ten rating points on every physical attribute.** Nobody designed
that; it fell out.

Three consequences the old prose only gestured at:

**Lean mass and carried mass are different inputs.** Power, Strength and Durability read _lean_ mass,
because fat is not contractile and does not punch. Speed and Cardio read _total_ mass, because you
have to move all of it. Two fighters on the same scale at the same weight are not the same fighter.

**The pivot is per sex.** Rating 50 is the median professional _of that sex_ — 180 lb walking for
men, 140 for women — so a woman's 70 is a claim about women. The pivot is denied to the other ten
attributes: there is no sex term on Wrestling or Fight IQ, and inventing one would be asserting
something the sport does not support.

**Cardio's exponent does the work `carriedPenalty` used to.** A heavyweight's engine falls out of the
same equation that raises his Power, rather than from a hand-drawn hinge that applied to nobody below
it.

### What that produces, by division

Major-promotion medians. The whole-population figures sit 6–9 points lower — that gap is
`ELITE_LIFT`, and it is why a rostered fighter reads above 50 on most things.

| Division | walks | Power | Speed | Cardio | Durability | Strength |
| -------- | ----: | ----: | ----: | -----: | ---------: | -------: |
| FLW      |   133 |    46 |    64 |     65 |         55 |       43 |
| BW       |   147 |    49 |    62 |     63 |         56 |       47 |
| FW       |   158 |    52 |    61 |     62 |         56 |       50 |
| LW       |   169 |    55 |    59 |     60 |         57 |       53 |
| WW       |   183 |    58 |    58 |     59 |         57 |       57 |
| MW       |   199 |    61 |    56 |     57 |         58 |       60 |
| LHW      |   217 |    63 |    54 |     55 |         58 |       63 |
| HW       |   242 |    67 |    52 |     53 |         59 |       68 |
| WSW      |   121 |    52 |    61 |     62 |         56 |       50 |
| WFLW     |   136 |    56 |    59 |     60 |         57 |       55 |
| WBW      |   147 |    59 |    57 |     58 |         57 |       58 |
| WFW      |   163 |    63 |    55 |     56 |         58 |       63 |

Read the ranges, not just the medians, and read them honestly — the overlap is not uniform:

- **Durability**: a flyweight at p95 reads 73 against a heavyweight median of 59. The divisions
  barely separate at all, 55 to 59, because β_durability is +0.10: a heavier head is harder to
  accelerate, but only a little.
- **Power**: a flyweight at p95 reads 64 against a heavyweight median of 67 — three points short.
  The best flyweight in a 600-fighter division (69) clears it. So the overlap exists, but only at
  the very top of the small division.
- **Strength**: it does not overlap. A flyweight p95 reads 61, the division's best 65, against a
  heavyweight median of 68. **No flyweight is as strong as a median heavyweight**, and the ladder
  says so deliberately: β_strength is +0.67, the steepest exponent in the table.

That last one is the ladder's most aggressive claim and it is the one held as a hypothesis below.
It is worth being uncomfortable with: a scale on which no small fighter can reach a large
fighter's median is a caste system on that attribute, and Strength is the only attribute where
this model asserts one. Whether that is right is an empirical question we do not yet have the
instrument to answer.

A flyweight with Durability 85 has an outstanding chin _for a human_, and would still be knocked
cold by an average heavyweight. The game does not let that fight happen; weight classes are a
**matchmaking constraint**, not a stat modifier.

### Moving up a division

The old text here said a move requires "no conversion whatsoever" and that a fighter keeps every
number. **That is no longer true, and the reason is the point of the ladder.** Physicals are computed
from the mass a fighter carries, so a lightweight who genuinely puts on welterweight mass gains Power
and Strength and loses Speed and Cardio — not by a scaler applied at the door, but because he is a
different size and the equation reads size.

What has not changed is that **there is no conversion table and no divisional normalisation.** The
numbers mean the same thing in every division; what moves is the fighter. A man who cuts to a lower
class without losing mass keeps his ratings exactly, and simply competes against smaller people.

The mechanics of a real move — how much mass actually transfers, how long it takes, what it costs —
are [06 — Development](./06-development-and-potential.md)'s, and are being rebuilt at
[31](./31-the-physical-ladder.md) § 12 step 11.

### Two parameters are held as hypotheses

`D_strength` and `β_durability` have the weakest evidence in the table and are marked
calibration-sensitive in [31](./31-the-physical-ladder.md) § 8.4. `D_strength` moves only on the
controlled experiments S1, S2 and S4 taken together — never on heavyweight submission rate, which
four separate parameters push on. As of step 7, **S4 cannot be measured at all**: `FightStats` has no
bottom-position time and no reversal counter, so the Strength question is open and waiting on an
instrument rather than on an argument.

---

## The effect curve (why 99 ≠ "a bit better than 90")

A linear reading of the scale produces mush. Every attribute is converted to an **effect
multiplier** through a convex curve before the simulator uses it:

```
effect(r) = exp( K * (r - 50) / 50 )
```

with per-attribute `K` tuned so the tail matters as much as the domain demands.

| K    | effect(40) | effect(50) | effect(75) | effect(90) | effect(99) | Used for                                      |
| ---- | ---------- | ---------- | ---------- | ---------- | ---------- | --------------------------------------------- |
| 0.90 | 0.84       | 1.00       | 1.57       | 2.05       | 2.42       | Speed, Fight IQ, Composure                    |
| 1.10 | 0.80       | 1.00       | 1.73       | 2.41       | 2.94       | Strength, Striking, Kicking                   |
| 1.20 | 0.79       | 1.00       | 1.82       | 2.61       | 3.24       | Cardio, Striking Def., TD Defence, Scrambling |
| 1.45 | 0.75       | 1.00       | 2.06       | 3.19       | 4.14       | **Durability**                                |
| 1.60 | 0.73       | 1.00       | 2.23       | 3.60       | 4.80       | **Power**, Ground Control, Submissions        |

That is every one of the fifteen. `Durability` sits a rung below Power rather than level with
Cardio for a specific reason recorded in the source: Power is on the steepest curve, so a flat
chin curve would make knockout rates climb as a division's strikers improve, which is backwards.
An elite chin has to keep pace with elite power or the tail of the striking distribution eats
the sport.

At `K = 1.6`, Ngannou's Power 99 is **4.8× baseline** and **1.3× a Power-90 heavyweight**
per landed shot — compounded over a hazard roll, that is the difference between "dangerous"
and "your night ends the instant he touches you". Meanwhile a Power-40 fighter sits at
0.72×, meaning they need roughly six and a half times as many clean landings as Ngannou to
produce the same knockout hazard. That is the intended shape.

Curves are implemented once in `packages/engine/src/ratings/curve.ts` and are covered by
snapshot tests, so re-tuning `K` is a visible, reviewable diff rather than a silent
game-wide balance change.

### Where the curve is _not_ used

Fight scoring, rankings and the UI's "overall" display use raw ratings. The convex curve is
for physical resolution only — otherwise the tail double-counts.

---

## Layer 1: Naturals (hidden)

Seven hidden values on the 1–100 scale plus one categorical age shape, none of which the
player ever sees as a number. They are what make two fighters with identical visible attributes
have completely different futures.

| Natural               | Governs                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| **Explosiveness**     | Neuromuscular quality. Lifts Power, Speed and Strength together. Declines earliest.      |
| **ForceVelocityBias** | _Where_ on the force–velocity curve that quality sits. Low = Strength, high = Speed.     |
| **Engine**            | Ceiling for Cardio. Declines slowly. Merab-tier is ~97.                                  |
| **Constitution**      | Ceiling for Durability; also the _floor_ Durability decays toward as damage accumulates. |
| **Recovery**          | Injury healing speed, inter-round recovery, camp load tolerance.                         |
| **MotorLearning**     | Rate of skill acquisition — the single biggest driver of potential.                      |
| **InjuryProneness**   | Baseline acute-injury hazard in camp and in fights.                                      |
| **AgeCurve**          | Early-bloomer / long-peak / late-bloomer shape.                                          |

`Frame` used to be the ninth. It was deleted at step 4 of the physical ladder and replaced by
the body layer above: mass is now a measured quantity, not a natural.

**Why `ForceVelocityBias` exists.** With `Explosiveness` alone, Power, Speed and Strength were
effectively the same draw wearing three labels, and the roster came out with no light-punching
speed merchants and no slow heavy hitters. A single quality term cannot produce both, because
the real trade-off is not how much athleticism a fighter has but where it sits on the
force–velocity curve. `ForceVelocityBias` is drawn flat and independently of `Explosiveness`,
pushes Speed and Strength in opposite directions, and costs Power at either extreme — peak
punching power is slightly to the force side of centre, not at the end of it. Derivation in
[31 — The Physical Ladder](./31-the-physical-ladder.md) § 19.

Naturals are near-fixed. `Constitution` is the exception: it is permanently eroded by
knockouts and accumulated head trauma, which is how chins go and why they never come back.

### How naturals become potential

There is **no single "potential" number**. Potential is a _per-attribute ceiling vector_
derived from naturals + age + personality, and the player only ever sees a **scouted
estimate with an uncertainty band** whose width depends on the quality of their coach and
how much footage exists. Two fighters shown "Wrestling: 74 → 80±9" can have true ceilings of
71 and 89.

Full treatment in [06 — Development & Potential](./06-development-and-potential.md).

---

## Layer 3: Derived, in-fight, live state

Distinct from the static derived stats above: during a fight, several attributes are read
through _live_ modifiers.

```
effectiveDurability = Durability · f(damageTaken, roundsDeep, Composure)
effectiveSpeed      = Speed      · f(fatigue, legDamage)
effectiveCardio     = Cardio     · f(weightCutSeverity, campQuality, damageTaken)
effectiveWrestling  = Wrestling  · f(fatigue, gamePlanMatch)
```

A fighter is never "their card" — they are their card filtered through what has happened to
them so far tonight. Detailed in [03 — Fight Engine](./03-fight-engine.md).

---

## Rating the seed roster honestly

Rules the seeder must follow (enforced by review, and partly by lint tests):

1. **Flaws are mandatory.** Every fighter, including champions, has a real exploitable
   weakness. Usually that is an attribute below 55. For the rare fighter who genuinely has
   no in-cage hole — Jon Jones' lowest rating is Power 70 — the flaw sits outside the cage
   and is every bit as career-defining: a collapsed professionalism or discipline axis, or a
   negative trait. Inventing a fake attribute hole for those fighters would be as dishonest
   as inflating everyone else. A test enforces both the rule and the rarity of the exemption.
2. **No reputation laundering.** Star Power reflects what the market paid, not likeability.
   Draws who are bad fighters get high Star Power and low ratings, and vice versa.
3. **Recency honesty.** The seed is a snapshot of _2020 form_, not career peak. Fighters
   visibly past it are rated past it.
4. **Personality is not sanitised.** Documented professionalism problems, weight-cut
   failures, drug-test history and public conduct produce negative traits. See
   [04 — Personality](./04-personality.md).
5. **Ratings are justified.** Every seeded fighter carries a short `notes` field explaining
   the two or three ratings a reader would push back on.

`seed.test.ts` guards the distribution against slow inflation: all-time ratings under 0.5% of
all attribute values, elite ratings under 24%, and genuine weaknesses (below 55) over 10%. Those
thresholds are deliberately looser than the population bands above, because the seed is a
snapshot of ranked fighters rather than a full roster — a pool that is almost entirely champions
and contenders _should_ be elite-heavy. What must not happen is all-time ratings becoming common
or weaknesses disappearing.

The physicals are no longer rated by hand at all. Since the ladder landed they are read off a
fighter's body, which is why a heavyweight and a flyweight can no longer be given the same
Strength by an author who liked them equally. Whether the seed's authored numbers agree with the
ladder is measured against a 115-fighter calibration roster of real, documented fighters, in
[31 — The Physical Ladder](./31-the-physical-ladder.md) § 13.
