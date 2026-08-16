# 02 — Attributes & Ratings

> Status: living document. This is the load-bearing document of the whole project.

## The three layers

```
┌─ NATURALS (hidden, ~fixed) ─────────────────────────────────────┐
│  Genetic/physiological substrate. Never shown as numbers.       │
│  Sets ceilings, learning rate, ageing curve, injury risk.       │
└─────────────────────────┬───────────────────────────────────────┘
                          │ constrains
┌─ ATTRIBUTES (visible, 15) ───────────────────────────────────────┐
│  What the player sees on the fighter card. 1–100, ABSOLUTE.     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ feeds
┌─ DERIVED (computed, never stored) ───────────────────────────────┐
│  Clinch, Sub Defence, Chin-right-now, Gas-right-now, Fight IQ    │
│  applied to a specific opponent. Recomputed on demand.           │
└──────────────────────────────────────────────────────────────────┘
```

Only the middle layer is stored-and-edited. Naturals are storable but hidden. Derived stats
are *never* stored — storing them is how rating systems rot.

---

## Layer 2: The 15 attributes

Grouped into four blocks so a fighter card reads as four bars, not fifteen.

### Physical (5)

| # | Attribute      | Means                                                                  |
| - | -------------- | ---------------------------------------------------------------------- |
| 1 | **Power**      | Absolute force delivered on a clean strike. Fight-ending potential.    |
| 2 | **Speed**      | Hand/foot speed, reaction time, how often you land first.              |
| 3 | **Cardio**     | Gas tank. Rate of fatigue accrual and between-round recovery.          |
| 4 | **Durability** | Chin + body. Ability to absorb damage without being hurt.              |
| 5 | **Strength**   | Functional grappling strength. Clinch, top pressure, breaking grips.   |

### Striking (3)

| # | Attribute            | Means                                                            |
| - | -------------------- | ---------------------------------------------------------------- |
| 6 | **Striking Offence** | Boxing. Accuracy, combinations, shot selection, in-pocket craft.  |
| 7 | **Kicking**          | Kick arsenal & commitment: legs, body, head, knees.               |
| 8 | **Striking Defence** | Head movement, distance management, guard, not being there.       |

### Grappling (5)

| #  | Attribute             | Means                                                          |
| -- | --------------------- | -------------------------------------------------------------- |
| 9  | **Wrestling**         | Takedown offence: entries, chaining, level changes, trips.      |
| 10 | **Takedown Defence**  | Sprawl, underhooks, hips, wall defence, getting back up.        |
| 11 | **Ground Control**    | Top position retention, passing, ground-and-pound.              |
| 12 | **Submissions**       | Submission offence: chains, transitions, finishing squeezes.    |
| 13 | **Scrambling**        | Bottom game, guard work, get-ups, transition speed, wall-walk.  |

### Mental (2)

| #  | Attribute      | Means                                                                |
| -- | -------------- | -------------------------------------------------------------------- |
| 14 | **Fight IQ**   | Reading the fight, adapting mid-round, executing the game plan.       |
| 15 | **Composure**  | Performing while hurt, in deep water, in hostile buildings, in title rounds. |

### Why not more?

Clinch, submission defence, ground-and-pound and cage control are all **derived** rather
than stored, because they are genuinely functions of the above and giving them their own
sliders would let the editor produce incoherent fighters (Strength 30, Clinch 90).

```
Clinch Offence   = 0.45·Strength + 0.35·Wrestling + 0.20·StrikingOffence
Clinch Defence   = 0.45·Strength + 0.40·TakedownDefence + 0.15·StrikingDefence
Submission Def   = 0.40·Scrambling + 0.30·Submissions + 0.20·FightIQ + 0.10·Strength
Ground & Pound   = 0.55·GroundControl + 0.45·Power
Cage IQ          = 0.60·FightIQ + 0.40·Composure
```

Exact weights live in `packages/engine/src/ratings/derived.ts` and are unit-tested against
a table of named archetypes.

---

## The scale

**1–100. Absolute. Cross-divisional. Not normalised to the fighter's weight class.**

| Band     | Meaning                                                       | Population         |
| -------- | ------------------------------------------------------------- | ------------------ |
| 96–100   | All-time outlier. The thing people will still talk about in 30 years. | 0–3 alive at once |
| 90–95    | Best in the world at this, right now.                          | ~5 per attribute   |
| 82–89    | Elite. Best-in-division tier.                                  | ~25                |
| 72–81    | Very good. Top-15 quality.                                     | ~90                |
| 62–71    | Solid, rostered, credible.                                     | ~250               |
| 50–61    | Average for a major-promotion roster.                          | bulk               |
| 38–49    | Below major-promotion level. A hole opponents will find.       |                    |
| 20–37    | A genuine liability. This is how you lose.                     |                    |
| 1–19     | Effectively absent from their game.                            |                    |

### Absoluteness in practice

Power is force, so it correlates with mass — and that is *correct*, not a bug:

| Division      | Typical Power | Divisional best  | Note                                    |
| ------------- | ------------- | ---------------- | --------------------------------------- |
| Heavyweight   | 68–80         | Ngannou **99**   | Even a mediocre HW out-hits a great FW  |
| Middleweight  | 58–70         | Adesanya 79      |                                         |
| Lightweight   | 50–62         | Ferguson 61 / Poirier 66 |                                 |
| Flyweight     | 38–50         | Figueiredo 60    | Figueiredo's 60 is *freakish* at 125    |

Durability is absolute too. A flyweight with Durability 85 has an outstanding chin *for a
human*, and would still be knocked cold by an average heavyweight. The game does not let
that fight happen; weight classes are a **matchmaking constraint**, not a stat modifier.

Consequence: moving up in weight requires **no conversion whatsoever**. A lightweight who
moves to welterweight keeps every number. What changes is that his Power 60 now buys him a
lot less, and his Strength 65 is now below the room. The natural physiological trade-offs of
the move (a little more Power and Strength from carrying real mass; a little less Speed and
Cardio) are applied by the weight-change system in
[06 — Development](./06-development-and-potential.md), not by a scaler.

---

## The effect curve (why 99 ≠ "a bit better than 90")

A linear reading of the scale produces mush. Every attribute is converted to an **effect
multiplier** through a convex curve before the simulator uses it:

```
effect(r) = exp( K * (r - 50) / 50 )
```

with per-attribute `K` tuned so the tail matters as much as the domain demands.

| K    | effect(50) | effect(75) | effect(90) | effect(99) | Used for                    |
| ---- | ---------- | ---------- | ---------- | ---------- | --------------------------- |
| 0.90 | 1.00       | 1.57       | 2.05       | 2.42       | Speed, Fight IQ, Composure  |
| 1.20 | 1.00       | 1.82       | 2.61       | 3.24       | Cardio, Striking Def, TDD   |
| 1.60 | 1.00       | 2.23       | 3.60       | 4.80       | **Power**, Ground Control, Submissions |

At `K = 1.6`, Ngannou's Power 99 is **4.8× baseline** and **1.3× a Power-90 heavyweight**
per landed shot — compounded over a hazard roll, that is the difference between "dangerous"
and "your night ends the instant he touches you". Meanwhile a Power-40 fighter sits at
0.72×, meaning they need roughly six and a half times as many clean landings as Ngannou to
produce the same knockout hazard. That is the intended shape.

Curves are implemented once in `packages/engine/src/ratings/curve.ts` and are covered by
snapshot tests, so re-tuning `K` is a visible, reviewable diff rather than a silent
game-wide balance change.

### Where the curve is *not* used

Fight scoring, rankings and the UI's "overall" display use raw ratings. The convex curve is
for physical resolution only — otherwise the tail double-counts.

---

## Layer 1: Naturals (hidden)

Eight hidden values, 1–100, that the player never sees as numbers. They are what make two
fighters with identical visible attributes have completely different futures.

| Natural            | Governs                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| **Frame**          | Natural walking weight → which divisions are viable, and cut severity.  |
| **Explosiveness**  | Ceiling for Power and Wrestling burst. Declines earliest with age.      |
| **Engine**         | Ceiling for Cardio. Declines slowly. Merab-tier is ~97.                 |
| **Constitution**   | Ceiling for Durability; also the *floor* Durability decays toward as damage accumulates. |
| **Recovery**       | Injury healing speed, inter-round recovery, camp load tolerance.        |
| **MotorLearning**  | Rate of skill acquisition — the single biggest driver of potential.     |
| **InjuryProneness**| Baseline acute-injury hazard in camp and in fights.                     |
| **AgeCurve**       | Early-bloomer / long-peak / late-bloomer shape.                         |

Naturals are near-fixed. `Constitution` is the exception: it is permanently eroded by
knockouts and accumulated head trauma, which is how chins go and why they never come back.

### How naturals become potential

There is **no single "potential" number**. Potential is a *per-attribute ceiling vector*
derived from naturals + age + personality, and the player only ever sees a **scouted
estimate with an uncertainty band** whose width depends on the quality of their coach and
how much footage exists. Two fighters shown "Wrestling: 74 → 80±9" can have true ceilings of
71 and 89.

Full treatment in [06 — Development & Potential](./06-development-and-potential.md).

---

## Layer 3: Derived, in-fight, live state

Distinct from the static derived stats above: during a fight, several attributes are read
through *live* modifiers.

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
3. **Recency honesty.** The seed is a snapshot of *2020 form*, not career peak. Fighters
   visibly past it are rated past it.
4. **Personality is not sanitised.** Documented professionalism problems, weight-cut
   failures, drug-test history and public conduct produce negative traits. See
   [04 — Personality](./04-personality.md).
5. **Ratings are justified.** Every seeded fighter carries a short `notes` field explaining
   the two or three ratings a reader would push back on.

A statistical test asserts the seeded population's per-attribute distribution matches the
band table above — so we cannot accidentally inflate the whole roster over time.
