# 04 — Personality

> Status: living document.

Personality is not flavour text. Every axis and trait in this document has a mechanical
hook in at least one system. If a trait cannot change an outcome, it does not ship.

## Two layers

```
AXES (hidden, 1–100, ~stable)   →  the underlying person
TRAITS (discrete, discoverable) →  the specific, named behaviours that produce mechanics
```

Axes are continuous and never shown. Traits are discrete tags the player *discovers*: a
fighter you have coached for two years shows all their traits; a fighter you have just
scouted shows only the obvious ones. Discovery is driven by observation count and by the
scouting quality of whoever is looking.

## The eight axes

| Axis                | Low end                          | High end                         |
| ------------------- | -------------------------------- | -------------------------------- |
| **Discipline**      | Shows up out of shape            | Lives like a professional        |
| **Ego**             | Genuinely coachable              | Knows better than the coach      |
| **Aggression**      | Patient, point-conscious         | Comes to hurt people             |
| **Resilience**      | A bad loss derails a career      | Bounces back, rebuilds           |
| **Professionalism** | Missed weight, missed tests      | Never a problem, never late      |
| **Ambition**        | Content banking cheques          | Wants the belt, will move weight |
| **Loyalty**         | Leaves for the next offer        | Dies with the gym that made them |
| **Charisma**        | Cannot sell a fight              | Sells a fight nobody asked for   |

### What each axis actually drives

| Axis            | Feeds                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| Discipline      | Camp gains, weight-cut success, out-of-camp attribute decay, injury risk      |
| Ego             | Game-plan adherence, willingness to change gym/coach, reaction to correction  |
| Aggression      | In-fight pace and risk-taking, rivalry ignition, trash-talk frequency         |
| Resilience      | Post-loss confidence recovery, retirement decisions, response to being hurt   |
| Professionalism | Weight misses, drug-test failures, pull-out rate, contract disputes           |
| Ambition        | Fight acceptance (steps up vs. ducks), weight-class moves, title-shot pushing |
| Loyalty         | Gym-switching, re-signing discounts, free-agency behaviour                    |
| Charisma        | Star power growth rate, PPV/gate contribution, promo segment quality          |

Note that **Charisma and fighting ability are completely independent**. That is deliberate:
the roster must contain drawing cards who are mediocre fighters and elite fighters nobody
will pay to watch. Both create real, interesting management problems.

## Traits

Traits are data, not code — defined in `packages/engine/src/domain/traits.ts` as a table of
`{ id, label, blurb, category, polarity, hooks }`. The simulator queries hooks by name; a
new trait needs no simulator change if it reuses an existing hook.

### Categories

| Category    | Applies in                                            |
| ----------- | ----------------------------------------------------- |
| `camp`      | Training blocks, weight cut, injury risk              |
| `fight`     | In-cage behaviour, damage, momentum                   |
| `mental`    | Adversity, confidence, momentum swings                |
| `business`  | Contracts, marketing, heat, loyalty                   |
| `health`    | Injury, recovery, ageing                              |

### Polarity

Traits are `positive`, `negative` or **`double-edged`**. The last category is the
interesting one and should be the largest: *Weight-Cut Gambler* gives a real size advantage
and a real chance of missing weight and gassing. *Lone Wolf* improvises off the game plan —
which is a gift with Fight IQ 90 and a catastrophe with Fight IQ 45.

A trait that is purely good with no cost is a balance bug.

### Selected traits (full table lives in code)

| Trait                | Pol. | Mechanic                                                                 |
| -------------------- | ---- | ------------------------------------------------------------------------ |
| Gym Rat              | ±    | +35% camp gains; +injury risk from overtraining; declines faster if idle  |
| Lone Wolf            | ±    | Ignores game plan; substitutes own Fight IQ read instead                  |
| Weight-Cut Gambler   | ±    | +Strength/Power vs. division; miss-weight risk; heavy Cardio penalty      |
| Frontrunner          | ±    | Big bonus while ahead on momentum; big penalty while behind               |
| Dog                  | ±    | Performs *better* hurt or behind; takes more damage getting there         |
| Trash Talker         | ±    | Fast heat/gate growth; ignites rivalries; damages promotion relationship  |
| Iron Chin            | ±    | Chin holds up per shot — but nobody saves them, so trauma accrues 40% faster |
| Glass Cannon         | −    | Durability floor is low regardless of rating                              |
| Gun-Shy              | −    | Acquired after a bad KO loss; −offence, +distance, −finishing             |
| Fragile Ego          | −    | Confidence craters after losses; refuses corrections; blames the camp     |
| Party Animal         | −    | −camp gains; out-of-camp attribute decay; professionalism incidents       |
| Company Man          | +    | Takes short-notice fights; re-signs cheap; never a headache               |
| Mercenary            | −    | Leaves for money; holds out; will not take a favour fight                 |
| Late Starter         | ±    | −R1 output, +R3+ output                                                   |
| Chinny              | −    | Explicit low Durability floor; every clean shot is a real threat          |
| Cardio Machine       | +    | Fatigue accrues more slowly than Cardio alone would suggest               |
| Gatekeeper Mentality | −    | Development plateaus early regardless of remaining potential              |

### Acquired traits

Some traits are not born, they *happen*. `Gun-Shy` is acquired after a knockout loss when
Resilience is low. `Chinny` is acquired when accumulated head trauma crosses a threshold.
`Hype Merchant` is acquired by winning three straight in spectacular fashion.

Acquired traits can also be lost — `Gun-Shy` fades after two clean wins with high
Resilience. This gives the career arc a shape that ratings alone cannot express.

## Non-fighter personalities

### Coaches

Coaches carry the same eight axes, plus three coach-specific competencies (these *are*
visible, since you hire them): **Scouting**, **Game Planning**, **Development**. Plus a
`specialisms` list (striking, wrestling, submissions, conditioning) that determines which
attributes they can move and how well they can read an opponent's corresponding threat.

A coach's Ego determines whether they clash with a high-Ego fighter — a real relationship
system, not a number. Two high-Ego personalities in one gym degrade both fighters' camp
gains until one leaves.

### Referees

Three tendencies, all hidden until you have seen a ref work a few times:

- **Stoppage Trigger** — early vs. late. A low-trigger ref saves careers and produces
  "he was still in it!" complaints. A high-trigger ref produces highlight reels and CTE.
- **Stand-Up Speed** — how long they let a stalled ground position run. This is the single
  biggest external modifier on a control-based wrestler's game plan.
- **Foul Tolerance** — eye pokes, fence grabs, groin shots: warning vs. point deduction.

Referee assignment is per-bout and is visible on the fight card *before* you accept, so a
prepared player can factor it in. That is a genuine strategic layer.

### Commentators

Commentators do not affect outcomes. They affect *narrative*, which affects perception,
which affects star power. Each has a bias vector (favours strikers/grapplers, favours the
promotion's chosen star, over-reacts to volume), a hype level, and a catchphrase bank.

A commentator who buries your fighter's grinding decision wins slows their star growth.
Choosing to fight in a promotion whose booth loves your style is a real consideration.

## Editor

Every axis and trait is editable. The editor warns — but does not block — on incoherent
combinations (Discipline 90 + Party Animal), because deliberately incoherent people exist.
