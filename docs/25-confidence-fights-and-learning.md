# 25 — Confidence, what a fight teaches, and when learning stops

**Status:** §1 is a defect report, measured and reproducible. §2–§4 are design proposals, not
implemented. Nothing in this document has been built yet.

Three findings that came out of tracing created careers through the 2026 world. They are filed
together because they are one story: **a career ends before it develops, and the things that
should develop it either do nothing or are switched off by a birthday.**

Read alongside [04 — personality](./04-personality.md),
[06 — development and potential](./06-development-and-potential.md) and
[23 — aptitudes and emergent plateaus](./23-aptitudes-and-emergent-plateaus.md).

> **A correction to doc 24 first.** [24 — three careers](./24-three-careers.md) finding 1 says the
> sport has no bottom rung and that every created fighter goes 0-5. That was measured on the
> **2020** world: `tools/career-trace.ts` calls `createNewGame({ adapter, seed })` with no era, and
> `newGame.ts:54` defaults to `'2020'`. The player-facing default is `'2026'` (`eras.ts:50`). The
> 2026 world has 858 fighters, 95 in men's lightweight spanning ratings 23–83, and a regional tier
> whose median fighter is rated 37.8. The bottom rung exists. Finding 1 describes the harness, not
> the game. Everything below is measured on 2026.

---

## 1. Confidence is a one-way ratchet — _defect_

### 1.1 What the code does

`condition.confidence` is written in exactly one place in the entire codebase:
`business/aftermath.ts:87-89`.

```ts
const swing = won ? 12 : drew ? 0 : -16 * lossImpactMultiplier(fighter.personality);
const finishBonus = won && isKoMethod(result.method) ? 5 : 0;
const confidence = clamp(fighter.condition.confidence + swing + finishBonus, 1, 100);
```

Nothing else in the game ever touches it. Not training, not a camp, not a coach, not a gym change,
not the passage of time. It is initialised to 60 (`domain/fighter.ts:316`) and from then on moves
only when a fight ends.

That is the defect, and it has four separate faces.

**1.1.1 — No recovery.** Every other field on `condition` heals. `fatigue` and `ringRust` are zeroed
after a fight, `headTrauma` and `bodyWear` are explicitly modelled as accumulating _because_ they do
not heal, and that contrast is the point. Confidence is a mood, not an injury. A fighter who loses,
takes nine months off, wins two regional fights and re-signs is not carrying the same self-belief
they had the night they were beaten. In the model, they are — exactly, to the point.

**1.1.2 — The arithmetic is net-negative.** A loss costs 16 (before personality); a win pays 12. A
fighter needs a **57% career win rate just to hold station**. Everyone below that trends
monotonically toward the floor no matter how long their career or how good they get. There is no
mean-reversion term to stop it.

**1.1.3 — Nothing about the loss matters except that it happened.** A five-round split decision in a
title fight and a nine-second head-kick knockout produce the identical −16. This is the part you
flagged, and it is the most obviously wrong of the four: everything needed to tell them apart is
already in scope at that line. `result.method` distinguishes all eleven finish types.
`result.scorecards` carries per-round scores and totals. `result.damage[corner]` carries
`knockdownsSuffered` and `wasFinishedByStrikes`. `result.stats` carries strikes, takedowns,
knockdowns and control time for both corners. `result.round` says when it ended. `opponent` is a
parameter. All of it is read for other purposes in the same function, and none of it reaches the
confidence line.

**1.1.4 — One personality axis out of eight, and no traits at all.** `lossImpactMultiplier` reads
`resilience` and only `resilience`. `ego` — documented as driving how a fighter receives correction
— is not consulted, and a fighter who genuinely believes the judges robbed them is a real and common
thing. No trait is consulted either, despite the trait table already carrying the exact concepts:
`fragileEgo` ("Losses cut deep"), `durableMind` ("came back exactly the same fighter"), `gunShy`,
`frontrunner`, `dog`. `durableMind` is _acquired specifically by surviving a knockout_ and then has
no bearing on what that knockout does to the fighter's confidence.

### 1.2 What it does to careers

`retirementUrge` (`progression/retirement.ts:43-44`) reads confidence and losing streak with **no
age gate**. Below 33 the age, trauma and wear terms are all zero, so for a young fighter the urge is
_entirely_ confidence and skid. Traced, 2026 world, identical created fighters:

```
fight  age  result  conf   urge   P(retire)/fight   overall
    1   22  loss      44  0.048    0.2%              51.0
    2   23  loss      28  0.188    3.5%              52.1
    3   23  loss      12  0.360   12.9%              52.1
    4   24  draw      12  0.217    4.7%              53.0
  ended: 0-3, retired at 24 — "Lost the desire for it and stepped away."
```

Three losses is the whole career. Note the last column: **their rating was still climbing when they
quit.** Across twelve identical created fighters, five were dead before 27 with four to eight fights
each. A 0-3 start is an ordinary thing for a prospect and here it is terminal.

Counterfactual — gating only the confidence and skid terms on age ≥ 30, one line, nothing else
touched:

|                              | Before |      After |
| ---------------------------- | -----: | ---------: |
| Mean retirement age          |   32.8 |   **37.9** |
| Dead before 30               | 5 / 12 | **0 / 12** |
| Mean career growth (overall) |   +7.3 |   **+9.5** |
| Headroom used                |    40% |    **52%** |

The age gate is a diagnostic, not the proposed fix — it is a blunt instrument that would stop a
genuinely broken 27-year-old from ever walking away. It is here to establish that confidence is the
mechanism, not a symptom.

### 1.3 A smaller bug in the same file

`retirementReason` reports "Lost the desire for it" only at `confidence <= 20`, but the retirement
_decision_ fires on the urge, which is meaningfully non-zero from about 35. A fighter who retires at
confidence 24 is told they "retired on their own terms". Observed in the traces. Cosmetic, but it
misreports the one thing the player most needs to understand about what just happened.

### 1.4 What confidence should read

Not a specification — a statement of what the inputs ought to be, in rough order of how much they
should matter.

**The severity of the loss.** A scale, not a flag. Roughly: a competitive decision is a scratch; a
wide decision is a bad night; a submission is a technical defeat and a specific one, so it should
cut narrowly rather than deeply; a TKO on cuts or accumulation is worse; a clean knockout,
especially early, is the one that changes people. The finish-bonus asymmetry should mirror it —
`isKoMethod` already grants +5 for a knockout win and there is no equivalent for having _survived_
one.

**How one-sided it was.** The scorecards are right there. Losing every round 10-9 and losing a split
decision are different events for the person who lost them, and the current model cannot say so. The
same applies upward: beating somebody you were supposed to lose to should be worth more than 12.

**Who it was against.** Losing to the champion is not the same as losing to a debutant, and
`opponent` is in scope. This also self-corrects the net-negative arithmetic in 1.1.2 — a fighter
moving up and losing to better people should not be punished at the same rate as one losing to worse
ones.

**Personality, on more than one axis.** `resilience` as the primary term is right. `ego` should
blunt losses and inflate wins — the fighter who has an explanation ready. `ambition` plausibly
belongs in the recovery rate rather than the hit: wanting it back is what brings you back.

**Traits, through the existing hooks.** `fragileEgo`, `durableMind` and `gunShy` should all bear on
this, and the mechanism to do it already exists — `traitMul(traits, hook)` with a new
`confidenceLoss` entry in `MUL_HOOKS`, which is where `developmentRate`, `campGain` and
`headTraumaRate` already live. No new machinery.

**Time, and results in the gym.** The missing recovery term. A drift back toward a personal baseline
between fights, with the rate set by `resilience` and `ambition`, plus something small from a camp
that went well. This alone fixes 1.1.1 and 1.1.2 together, and it is the single highest-value change
in this section.

Worth stating explicitly, because it is the design risk: **confidence must stay able to end a
career.** A fighter who is finished in the head is one of the sport's real endings and the model
should keep it. The complaint is not that confidence is too harsh, it is that it is _undiscriminating_
— it cannot tell a 22-year-old learning their trade from a 34-year-old who has been knocked out
three times in a row, and those are the two cases it most needs to separate.

---

## 2. What should a fight actually improve?

You are right that fights should do something, and right that camps-attached-to-fights are not the
same question. Taking the second first, because it is a real and separate defect.

### 2.1 The fight camp trains a random thing

`career.ts:327` — `campDevelopmentPlan` picks the camp's focus with
`pickTrainingFocus(createRng(...), fighter)`. The player books a fight, spends eight weeks in camp,
and the game decides for them what those eight weeks were spent on. Every other training block in
the game is the player's choice. For the blocks attached to fights — which for an active fighter is
most of them — it is not. Whatever the fix to the rest of this document, that one is just wrong.

### 2.2 Fights currently develop nothing at all

A fight produces a record entry, a confidence swing, trauma, wear, reputation, money, and
occasionally an acquired trait. It produces **zero attribute development**. The only development in
the vicinity is the camp beforehand, and that would have happened anyway.

Measured, twelve created fighters, the only variable being how often they took a fight:

| Schedule             | Fights/yr | Typical record      | Retirement age | Headroom used |
| -------------------- | --------: | ------------------- | -------------: | ------------: |
| Paced (150-day rest) |       1.7 | mixed               |           32.8 |       **40%** |
| Take everything      |       3.8 | 62-14, 58-22, 49-12 |           36.8 |       **29%** |

Doubling the reps produced better records, longer careers, and _less development_. That is the
model actively contradicting the intuition, and the intuition is the correct one.

### 2.3 What a fight teaches that a gym cannot

The honest answer is: not much that is physical, and quite a lot that is not.

You do not get stronger or faster in a fight — you get more damaged. What you get is the stuff a gym
genuinely cannot simulate: reading a live opponent who is trying to take your head off, adrenaline
management, cage craft, knowing what the fifth round feels like, and finding out what you do when
you are hurt. Fighters call it octagon time and treat it as a distinct currency from training, which
is exactly what it should be here.

That maps cleanly onto attributes the model already has:

- **Fight IQ** and **composure** — the two qualities `PEAK_OFFSET` already marks as peaking six years
  _after_ everything else (`development.ts:227-228`). They are the ones that ought to come
  disproportionately from fights rather than camps, and right now they come only from camps.
- **Nothing physical.** Power, speed, cardio, durability, strength should get nothing. A fight
  should be a net _negative_ on the body and that is already modelled.

Four constraints on any such mechanic, because the obvious version breaks the game:

**It must diminish hard with experience.** A debut teaches enormously; the fortieth fight teaches
almost nothing. Scale on fights already had, not on fights taken. Without this you have built an
XP grind and the optimal play is to fight every eight weeks forever.

**Damage is the counterweight.** Fights already cost trauma and wear. That is what stops the grind
being free, and it means the tuning question is honest: how much experience is a point of head
trauma worth? A model where the answer is "always worth it" is broken in one direction and one where
it is "never worth it" is broken in the other. Right now it is "never" — fights are pure cost.

**Depth of water, not the result.** A twelve-second knockout win teaches nobody anything. A hard
three rounds against a better fighter teaches a great deal, and losing it does not make that less
true. The signal should be rounds survived, damage taken, adversity faced — all available in
`result.stats` and `result.damage` — rather than the W or the L.

**Losses should teach at least as much as wins.** This is where it gets interesting, and where I
think there is a better mechanic than "a fight grants attribute points".

### 2.4 A better shape: a fight grants _direction_, not points

Realistically, being outwrestled for fifteen minutes does not make you better at wrestling. It tells
you — loudly, expensively, in public — that you need to fix your wrestling. The gain comes from the
camp that follows, and it comes because the fight told you where to point it.

That is a mechanic the codebase is already shaped for. `result.stats` records exactly what happened
to you: `takedownsLanded/Attempted`, `controlSeconds`, `submissionAttempts`,
`significantStrikesLanded`, `knockdowns`, per corner. So the game can say, truthfully and
specifically, "he took you down nine times and held you there for eleven minutes." That becomes:

- a **lesson** attached to the record entry, naming the attribute the fight exposed;
- a **temporary learning-rate bonus** on that attribute for the next camp or two — motivated,
  focused work on a hole you have just had your nose rubbed in;
- a **recommendation** on the camp screen, which is the player-facing half and the reason to do it
  this way rather than silently.

This gets several things at once. Fights matter without becoming an XP treadmill. Losses become
productive, which is what a prospect's early career actually is. The player is given information
rather than a number. It composes with the existing focus system instead of bypassing it. And it
gives §2.1's fix somewhere to point: the fight camp's focus should default to _the lesson from the
last fight_, with the player free to override.

The counterpart already exists and is worth naming — `ringRust` penalises inactivity. There is a
penalty for not fighting and no reward for fighting. Section 2 is largely about the missing half of
a mechanic that is already half-built.

---

## 3. The learning window is too fixed, and it is drawn against the wrong clock

### 3.1 The current curve

```ts
// development.ts:272
return clamp(remap(age, 20, peak + 8, 1.45, 0.55), 0.5, 1.45);
```

`PEAK_AGE` is 26/29/31/33 by `ageCurve`, plus a per-attribute `PEAK_OFFSET` from −4 (speed) to +6
(fight IQ, composure). For a standard curve that is **1.45 at 20, ~0.94 at 30, 0.55 by 37**.

Measured from doc 24's own tables, share of total career growth banked before turning 30:

| Fighter       | Debut age | Growth to 30 | Growth 30 → peak | Before 30 |
| ------------- | --------: | -----------: | ---------------: | --------: |
| Marcus Bell   |        22 |         +9.0 |             +3.3 |   **73%** |
| Danil Orlov   |        22 |         +8.5 |             +2.8 |   **75%** |
| Tom Whitfield |        26 |         +1.8 |             +2.2 |       45% |

### 3.2 No, people do not stop learning at 30

They don't, and the codebase already half-knows it. The comment above the curve says fighters
"demonstrably keep adding craft into their late thirties". `PEAK_OFFSET` pushes fight IQ and
composure six years past everything else precisely to express that. Doc 23's entire argument is that
skills should not have ceilings. And then the age curve applies a 0.55 multiplier to all of it.

Motor learning does not have a cliff at 30. What declines with age is the physical substrate —
reaction time, peak power, recovery between hard sessions — and the engine **already models that
separately**, in `DECLINE_RATE` and `applyAgeing`. Charging the learning rate as well is charging
age twice for the same thing. The sport is full of counterexamples: fighters who add an entire
discipline in their thirties, who win titles past 40, whose technical peak arrives a decade after
their athletic one.

### 3.3 The sharper problem: it is a ceiling reintroduced through the back door

Doc 23 replaced hard skill ceilings with a _rate_, on the argument that where a fighter ends up
should be an emergent equilibrium — the point where gains stop outrunning decline — rather than a
number written on them at birth.

But if the rate itself collapses on a fixed schedule against chronological age, then the equilibrium
point is set by age rather than by the fighter. That is a ceiling again; it is just drawn in a
different colour. It is consistent with what I measured: created fighters land at 29–52% of their
headroom regardless of talent, schedule, or record. The ceiling is back, and every fighter's is at
roughly the same place.

### 3.4 Training age, not chronological age

The clearest single change: **the steep part of the curve should be indexed on how long the fighter
has been doing this, not on how old they are.**

A 30-year-old with eight fights and six years of training is not the same learner as a 30-year-old
with forty fights and twenty years. The first is still in the steep phase; the second is refining.
Real learning curves are steep at the start _of the activity_, and that start is not everyone's
twentieth birthday.

The model already carries what is needed — a debut day, a record length, and an `origin` block with
the discipline and attainment the fighter arrived with, so a national-level wrestler can begin with
that clock already partly run down in wrestling and barely started in striking.

Tom Whitfield in the table above is the accidental evidence. He is the only one of the three who
banked more than half his growth after 30, because he debuted at 26 and still had room. The model
produced the right shape for him despite the age curve rather than because of it — `skillResistance`
carried him. Under the current curve a late starter is charged for years they did not spend
training, which is precisely backwards.

### 3.5 Three smaller adjustments in the same area

**Raise the floor for craft and let the body take the hit.** A single `0.55` floor across all fifteen
attributes says a 38-year-old learns submissions as poorly as they build speed. `PEAK_OFFSET`
already ranks them; the floor should follow it. Fight IQ and composure arguably want a floor near
1.0 — near-flat lifelong learning — while speed and power can fall away hard, since decline handles
them anyway.

**Let the curve be non-monotonic.** Real careers have step changes: a gym switch, the right coach, a
camp where something finally clicks. `gym` and `coach` multipliers exist but are smooth and
permanent. A breakthrough mechanic — rare, tied to a good camp or a new room — would give the player
something to chase in the back half of a career, which is currently a slow fade.

**Watch for double-charging.** Doc 23 introduced `skillResistance` so that skills slow as they get
high. The age curve slows them again. Whether both terms are wanted for skills is worth deciding
deliberately rather than by accretion; for physicals, `headroom` plus `DECLINE_RATE` plus the age
curve is three terms doing overlapping work, which is the most likely explanation for doc 24's
finding 3, that physical ceilings are close to decorative.

---

## 4. If only three things get done

1. **A confidence recovery term** — drift toward a personal baseline between fights, rated by
   `resilience` and `ambition`. Fixes 1.1.1 and 1.1.2 at once and is the change that stops careers
   dying at 24.
2. **Loss severity** — method, scorecard margin, knockdowns and opponent quality into the confidence
   swing, plus `ego` and the `confidenceLoss` trait hook. This is the one that makes the existing
   personality and trait systems pay for themselves.
3. **Let the player choose their fight camp's focus** (`career.ts:327`). Small, unambiguous, and it
   unblocks the lesson mechanic in §2.4 later.

§3 is a larger change and wants its own pass. It is also the one that decides whether a twenty-year
career is a story or a formality.
