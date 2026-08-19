# 27 — Confidence, what a fight teaches, and when learning stops

**Status:** §1 (confidence), §2 (what a fight teaches), §3 (the learning window), §8 (ambient
work), §11 (the day tick) and §10's mileage half (§12) are **built** — see §5, §6 and §7 for what each one measured. §7 also records one proposal from §3.4
that measurement rejected. §8 is the first of §7.4's two recorded defects, now **fixed**. §9 is the
next workstream and is **not started**.

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
| Marcus Bell   |        23 |        +10.9 |             +2.5 |   **81%** |
| Danil Orlov   |        23 |         +8.8 |             +2.8 |   **76%** |
| Tom Whitfield |        27 |         +2.1 |             +1.8 |       54% |

The share is inflated by there simply being more career before 30 than after it, which is why §7.1
measures the _rate_ per year instead. It is the right order of magnitude either way.

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

---

## 5. What was built

All three of §4, and nothing else. §2.2–§2.4 and §3 are untouched.

### 5.1 The changes

**`domain/confidence.ts`** (new) is the whole model. `confidenceSwing` takes the shape of a result —
method, scorecard margin, round, knockdowns suffered, the rating gap to the opponent, whether a belt
was on it — and returns a signed number. `recoverConfidence` drifts a fighter back toward their
baseline over elapsed time. It is kept in `domain/` and fed plain numbers rather than a
`FightResult` so it is testable without building a fight, and so `progression/` can reach the
recovery half without depending on `business/`.

The recovery is exponential rather than a step per call, and that is load-bearing rather than tidy:
`applyAgeing` is called with a fortnight by the world tick and ten weeks by a camp, so the same
elapsed time has to give the same fighter however it was chopped up. There is a test for exactly
that.

**`domain/personality.ts`** gains `confidenceBaseline`, `confidenceRecoveryYears`,
`egoDeflectionMultiplier` and `confidenceGainMultiplier`. Resilience still dominates; ego now
deflects a defeat and mildly inflates a win; ambition sits on the recovery rate rather than on the
hit, because wanting it back is what brings you back. The baseline is centred on 60 so a neutral
personality returns exactly to `initialCondition`.

**`domain/traits.ts`** gains a `confidenceLoss` multiplicative hook, wired to the six traits already
written to describe this behaviour: `fragileEgo` 1.45, `gunShy` 1.3, `frontrunner` 1.25, `dog` 0.75,
`gatekeeperMentality` 0.7, `durableMind` 0.7. The last of those was the sharpest case in §1.1.4 — it
is acquired by surviving a knockout and had no bearing on what that knockout cost. `durableMind` is
0.7 rather than the 0.6 first written because `domain.test.ts` guards purely-positive traits against
strong multipliers, which is the correct rule.

**`progression/development.ts`** applies the drift inside `applyAgeing`, which is the one function
every caller goes through — the world tick, a camp, a layoff, a fight.

**`progression/retirement.ts`** gains `retirementDrivers`, so the _reason_ is read off the same
arithmetic as the _decision_ rather than from a separate ladder of thresholds. §1.3's mismatch is
gone, and body wear finally has a reason string of its own.

**`career.ts` / `CampScreen.tsx`** put the fight camp's focus in the player's hands (§2.1).
`Booking.campFocus` is optional and `undefined` is a real value meaning "I have not chosen" — the
fighter then trains what they most need, which is what `pickTrainingFocus` was always for. Tapping
the selected focus again hands the decision back.

### 5.2 What it measured

Twelve identical created fighters — a natural, national-level wrestler debuting at 22 — driven
through the real 2026 world on the same paced schedule as §1.2. The middle column is the one-line
age-gate diagnostic from §1.2, kept here because it is the ceiling this change was aiming at.

|                     | Before | Age-gate diagnostic |  **Built** |
| ------------------- | -----: | ------------------: | ---------: |
| Mean retirement age |   32.8 |                37.9 |   **34.7** |
| Dead before 30      | 5 / 12 |              0 / 12 | **3 / 12** |
| Mean career growth  |   +7.3 |                +9.5 |   **+9.3** |
| Headroom used       |    40% |                 52% |    **51%** |

Development lands where the diagnostic said it could. Career length gets about half the way, and
that is the honest result rather than a shortfall: the three who still stop before 30 went 1-3, 3-7
and 1-9, and two of those are careers that should end. The blunt age gate rescued them by refusing
to let anybody under 30 quit, which is not a model of anything.

The suite is green — 1215 existing tests plus 32 new ones — including the twenty-year long-sim,
which is what guards the world against exactly this kind of change.

### 5.3 What this did not fix

Two things worth recording, because they were visible in the same traces and are not confidence.

**Realised win rate runs well below the offered odds.** The harness takes the offer nearest 55% and
still produces records like 5-15 and 6-16. Some of that is the harness accepting every inbox offer
regardless of price, but it is worth a proper look at whether `paperOdds` is optimistic against what
the simulator actually returns.

**"Lost the desire" is now the most common ending** (8 of 12), because confidence and the losing-skid
term are correlated by construction. For a fighter who went 5-15 that is a truthful reason. Whether
it should be the _modal_ one across a whole population is a separate question, and it will move on
its own once §2 gives fights something to contribute besides damage.

---

## 6. What a fight teaches — built

§2.1 shipped with §1 (above). §2.2, §2.3 and §2.4 shipped together, because they are one mechanic
seen from two ends: a fight gives you the thing a gym cannot, and it tells you what to take back to
the gym.

### 6.1 Octagon time

`progression/development.ts:applyRingExperience`. A fight now grants **fight IQ and composure and
nothing else** — the two qualities `PEAK_OFFSET` already marks as peaking six years after everything
physical, and the only two a fighter could previously acquire solely by standing in a gym. Nothing
physical: you do not get faster in a fight, you get damaged, and the model already charges that.

Three bounds, because the obvious version of this mechanic is an XP grind:

- **Time in the cage.** Scaled on seconds fought, so a twelve-second blowout is worth roughly a
  fortieth of a hard three-rounder.
- **A hard taper.** `1 / (1 + bouts / 6)` — a debut teaches enormously, the sixth fight half as
  much, the thirtieth about a sixth. Without this the optimal play is to fight every eight weeks
  forever.
- **Adversity, capped.** Knockdowns survived and submissions escaped are the most instructive thing
  that can happen to a fighter, up to a ceiling of +60%. Uncapped, the mechanic rewards taking
  horrific punishment.

It is applied inside `applyAftermath`, which is the single function all three fight paths already go
through — the player's career loop, the world tick and promoter mode. The last time a development
hook lived in only one of them, the entire undercard of the sport declined permanently and nobody
noticed for months.

A test asserts the gain from one fight is smaller than the gain from one camp. That is the balance
the whole thing turns on: fights are worth something, and the gym is still the engine.

### 6.2 The lesson

`business/lessons.ts`. This is §2.4's argument — being outwrestled for fifteen minutes does not make
anybody better at wrestling, it tells them expensively and in public that their wrestling is the
problem — so a fight grants **direction, not points**.

Six candidates are scored from `FightStats`, each as a ratio to its own threshold so that six
takedowns and four hundred absorbed strikes are comparable at all. Highest wins, and it has to clear
1:

| Lesson           | Read from                                            | A lesson at |
| ---------------- | ---------------------------------------------------- | ----------- |
| Takedown defence | their takedowns landed                               | 3 per fight |
| Scrambling       | their **floor** control time, clinch excluded        | 5 minutes   |
| Submissions      | their submission attempts, or being submitted        | 3 attempts  |
| Striking defence | their significant strikes, knockdowns, being stopped | 75 strikes  |
| Wrestling        | **your** takedown attempts landing under 25%         | 4 attempts  |
| Striking offence | **your** accuracy under 28% on real volume           | 40 attempts |

Everything is expressed per full fight, so a five-round war and a short one are measured on the same
scale. Three deliberate refusals: it does not fire on every bout (a clean night teaches nothing, and
a lesson on every result is noise — measured at **0.74 lessons per fight**); it ignores who won,
because you can win a decision having been put on your back six times; and a fight under 150 seconds
teaches nothing at all, because every rate goes silly on that denominator.

The lesson is written onto the `FightRecordEntry`, which is already immutable-once-written, so the
expiry is "was that fight recent" rather than a mutable countdown that can drift. It stays live for
200 days and is worth a **1.5x learning rate** on that attribute — passed into `rawGain` as a
parameter precisely so `applyTraining` and `forecastTraining` cannot disagree, and the forecast the
player sees is the camp they get.

The player-facing half: the camp screen names the hole, and an untouched camp now defaults to
working it — `booking.campFocus ?? lessonFocus ?? pickTrainingFocus(...)`. §2.1's change is what made
that possible.

### 6.3 What it measured

Same twelve created fighters, same 2026 world, camp length held constant at 8 weeks so that only
fight frequency varies:

| Fights/yr | Retire | Growth | Headroom | Fight IQ | Composure |
| --------: | -----: | -----: | -------: | -------: | --------: |
|       1.2 |   37.0 |   +9.0 |      49% |     +6.2 |      +5.3 |
|       1.7 |   34.1 |   +8.7 |      47% |     +4.2 |      +3.4 |
|       2.3 |   31.6 |   +8.7 |      47% |     +5.1 |      +4.4 |
|       3.3 |   38.3 |   +6.2 |      34% |     +9.5 |      +7.7 |

**Fights now build what fights should build.** The busiest schedule produces more than double the
fight IQ and composure of the quietest — measured, not asserted.

**Camps are still the engine, and the busiest fighter still develops least overall.** That is not a
shortfall, and it should not be tuned away. A fighter taking three or four bouts a year genuinely
does not develop technically like one taking two with full camps; that is true of the sport and the
model is now right to say it. What was wrong before was that fights contributed _nothing at all_.

It also produces an archetype the sport is full of and the model previously could not express: the
busy regional fighter who is ring-smart, hard to rattle, and technically raw. `overallRating`
averages fifteen attributes, so a two-attribute specialisation is structurally under-rewarded by
that yardstick — which is a comment on the yardstick as much as on the fighter, and the same caveat
doc 24 finding 4 raises about breadth.

### 6.4 Still not done

§3 — the learning window — is untouched, and it is now the largest thing left in this document. It
is also the one that decides whether a twenty-year career is a story or a formality.

---

## 7. The learning window — built

### 7.1 What changed: the floor, not the clock

`learningRate` was `clamp(remap(age, 20, peak + 8, 1.45, 0.55), 0.5, 1.45)` — one floor for all
fifteen attributes, which says a 38-year-old learns submissions exactly as poorly as they build top
speed. `LEARNING_CURVE` replaces that single number with a per-attribute pair, and the floors follow
`PEAK_OFFSET`'s own ranking of how much of each quality is craft and how much is body:

|                                   | Floor |            | Floor |
| --------------------------------- | ----: | ---------- | ----: |
| Fight IQ, composure               |  0.95 | Cardio     |  0.55 |
| Submissions                       |  0.88 | Strength   |  0.50 |
| Ground control                    |  0.85 | Durability |  0.45 |
| Striking offence                  |  0.82 | Power      |  0.40 |
| Striking def., wrestling, TD def. |  0.78 | Speed      |  0.35 |
| Kicking 0.70, scrambling 0.65     |       |            |       |

Measured at 38 against 22, a fighter now keeps **75% of their capacity to learn tactics and 27% of
their capacity to build speed**. Under the old flat floor both were 58%. That is the shape
`PEAK_OFFSET`'s comment already described — a rising skill curve crossing a falling physical one —
and it is what §3.3 argued the flat floor had quietly undone, by reintroducing through the back
door the ceiling doc 23 removed.

At the career level, with camp length held constant so only the curve varies:

|        | Pre-30 /yr | Post-30 /yr | Front-loading | Peak age |
| ------ | ---------: | ----------: | ------------: | -------: |
| Before |       1.22 |        0.13 |      **9.3x** |     31.7 |
| After  |       1.12 |        0.23 |      **4.8x** |     32.8 |

Post-30 development nearly doubles and the front-loading roughly halves, which is the whole point
of §3.2.

### 7.2 What measurement rejected

**§3.4's training-age term was not built, and should not be.** The proposal was to index the steep
early phase on how long a fighter has been doing this rather than how old they are. It is a real
distinction, and the model already draws it twice: `skillResistance` makes the next point harder as
a function of the rating itself, so somebody genuinely new to a thing is genuinely faster at it, and
`aptitudeRate` carries how fast _this_ fighter learns _this_ family — which is what separates
somebody who has drilled wrestling for eight years and is simply bad at it from somebody who has
never tried. A third clock measuring the same thing would double-count it. What was actually wrong
was the floor.

**A two-ended curve was tried and reverted.** An intermediate version also brought the _young_ end
down for craft, on the theory that a steep young-age bonus on a skill is novice gains by another
name. The theory is sound and the measurement rejected it: over ten world years at the app's own
cadence it cost the sport its top end, taking fighters rated 75 or better from 18 to 8. Whatever the
young-age term is standing in for, the elite is built out of it.

### 7.3 A regression from §1, and the mechanic that should have been there

Fixing confidence broke the sport's renewal, and it took a world-scale measurement to see it.

`shouldRetire` is only ever consulted **after a fight**. A fighter who stops getting booked
therefore never retired — they sat on the roster ageing forever. That gap had been invisible because
the old confidence ratchet retired those people by accident: they lost a few, their belief collapsed
with no way back, and they walked. Repairing confidence removed the accident and left nothing in its
place. And because `replenish` only tops a division back up to its target, **every fighter who fails
to retire is a debutant who never gets generated**:

| Ten world years        | master | after §1 | after `driftUrge` |
| ---------------------- | -----: | -------: | ----------------: |
| Retirements            |    524 |  **305** |               464 |
| New fighters generated |    501 |  **294** |               454 |
| Best generated fighter |   80.5 | **73.6** |              82.5 |

`driftUrge` is the missing mechanic: the sport's most common ending, which is not a retirement but a
fight falling through, then another, and one day it has been two years and nobody has called. It
reads idleness past eighteen months, scaled by age, by ambition — what keeps somebody ringing their
manager — and by reputation, because the phone does not stop ringing for people who sell tickets.
Champions are exempt outright, the same rule `enforceActivity` already applies.

Two things it caught:

- **An empty record means _fresh_, not _never_.** Both seeded worlds ship every fighter with an
  empty `record` — their history is backstory, not rows — while `proDebutDay` runs back nineteen
  years before the save starts. Judged from the debut day, **811 of 858 fighters** had a non-zero
  drift urge on day one of a new game. The same rule `neglectDays` already applies to `lastTrained`.
- **Champions must be exempt.** Without that, belts sat vacant for years while the division rebuilt
  its contenders. Caught by `championships.test.ts`, which allows three stale vacancies a decade and
  saw five.

### 7.4 Two defects found and not fixed

**`ageEveryone` trains a flat four weeks per _call_, not per elapsed week.** _(Fixed — §8.)_ So the fighter you get
out depends on how the caller chopped up the time — the same defect `recoverConfidence` was written
to avoid. The app advances in camp-length spans, so this is four weeks per eight; the long-sim
harness advances a _year_ per call, and every unbooked fighter in the world trains for one month of
it while ageing a full twelve. A fix was written, measured, and reverted: scaling it is a real
balance change that moves the whole world's development and wants its own measured pass rather than
being smuggled in at the end of this one.

**`generations.test.ts`'s development assertion has never actually run.** It filters for active
generated fighters with four or more bouts and returns early when that set is empty — and on master
it is empty, so `expect(best).toBeGreaterThan(68)` has never been evaluated. It only started
asserting once these changes let newcomers survive long enough to accumulate a record, which is how
the `ageEveryone` defect above surfaced at all. A guard that passes vacuously is worse than no guard,
because it reads as coverage.

---

## 8. Ambient work, priced per week — built

§7.4's first defect. `ageEveryone` gave every unbooked fighter a flat four weeks of training **per
call**, and priced it through `trainingBlocks`, which describes a _camp_: two weeks of ramp that
produce nothing, then diminishing returns as a single peak is approached.

Both halves are wrong for continuous work, and together they meant the world depended on how the
caller happened to chop up the clock:

| Caller span | Calls a year | Blocks per call | **Blocks a year** |
| ----------- | -----------: | --------------: | ----------------: |
| 14 days     |         26.1 |           0.595 |         **15.50** |
| 28 days     |         13.0 |           0.595 |          **7.75** |
| 56 days     |          6.5 |           0.595 |          **3.88** |
| 84 days     |          4.3 |           0.595 |          **2.58** |
| 365 days    |          1.0 |           0.595 |          **0.59** |

Twenty-six times apart, on the same fighter in the same game — and the player was choosing it
without knowing, because a four-week training block advances the world in four-week steps and a
twelve-week one in twelve. It is also why the ramp made the naive fix worse: scaling `weeks` down
to two produces _exactly zero_, because `trainingBlocks(2)` is 0.

`applyTraining` now takes an optional `blocks`, and the ambient path passes
`elapsedWeeks × AMBIENT_BLOCKS_PER_WEEK` — **linear**, so blocks add and the same elapsed time gives
the same fighter however it arrives. Camps are untouched and still priced by `trainingBlocks`.

### 8.1 Choosing the rate, and a correction

Once training is proportional to elapsed time, the per-week rate has to be chosen. It was first set
by matching the old behaviour at 56-day steps on a single seed, and **that was wrong twice over**.

**It was fitted to noise.** Across three seeds rather than one, 56-day steps produced 38 fighters
rated 70+ before the change, not the 45 a single seed had shown. So the rate that looked like it
preserved the world in fact raised development at that cadence by about a quarter.

**And there was no single world to preserve.** Before the change the sport's quality was a function
of the clock, so "the old world" was five different worlds. Calibrating against one of them was
calibrating against nothing.

`AMBIENT_BLOCKS_PER_WEEK` is therefore a **dial**, set at 0.1 — a week of ordinary work worth a
little under 60% of a week of fight camp — which lands the now-consistent world between the old
extremes. It is a judgement, not a derived value, and it is the number to move if the sport should
be deeper or shallower overall.

### 8.2 What it measured

Fighters rated 70+ after ten world years, three seeds per cell, mean in bold:

| Clock step | Before              | After               |
| ---------- | ------------------- | ------------------- |
| 28 days    | 66, 59, 57 → **61** | 47, 47, 43 → **46** |
| 56 days    | 35, 39, 40 → **38** | 46, 41, 53 → **47** |
| 365 days   | 24, 23, 17 → **21** | 32, 33, 35 → **33** |

The two cadences the app actually uses now agree — 46 against 47, inside seed noise, where they
previously differed by 60%. Across the whole range the spread falls from **2.9x to 1.4x**.

**The residual is not training.** `enforceActivity`, `playerActivity`, `scanForInbox` and
`vacateAbandonedBelts` all still run once per _call_ rather than per elapsed step, so a
year-per-call caller runs them a thirteenth as often. That is what is left of the 365-day column,
and it is a smaller and separate defect of the same family.

---

## 9. The roster does not move — not started

The talent fix (`generateNaturals`, curved to 97) put real potential in the world, and §8 lets it
develop consistently. Over twenty years the top fifteen fighters in the sport are now entirely
home-grown. But the sport's _shape_ is still wrong at the top, and it is no longer a progression
problem:

> After twenty years the leading promotion's roster is down to **50 fighters, median rating 54, with
> five rated 70+** — while **71 fighters in the world** are rated 70+.

The good fighters exist. They are not on the big show. `replenish` weights debutants to the bottom
of the ladder, which is right, and nothing pulls the risen talent back up it.

Two halves, and both are missing:

**What a fighter wants.** Ambition and reputation should make somebody actively seek the biggest
room that will have them — chase the better promotion, take the fight that gets them seen, leave a
regional deal that has stopped serving them. Right now a fighter's promotion is close to an accident
of where they debuted.

**What a promotion wants.** A promotion should be _scouting_: identifying the best unsigned or
poorly-signed fighters in a division and bidding real money for them, with the bid scaled to
prestige and budget. `freeAgency.ts` resolves deals that expire; nothing goes looking.

Until both exist, the leading promotion is a retirement home for whoever it happened to sign a
decade ago, and the ladder the whole career mode is built around does not actually connect.

---

## 10. Peak age — the target, recorded

Measured after §8: the average generated fighter is **still improving at 36** and does not turn over
until about 38. That is too late, and it is the same complaint doc 24 finding 2 raised. This records
what "right" looks like so the next pass has a target rather than a taste.

**Overall peak for men is roughly 30–32.** MMA peaks later than sports built on raw athleticism,
because a fighter needs years to accumulate striking, grappling, defensive instinct, tactical
judgement and composure, and physical decline around 30 is not severe — so there is a window where
experience and athleticism overlap.

| Age   | Stage                                                   |
| ----- | ------------------------------------------------------- |
| 18–22 | Athletic development, usually technically inexperienced |
| 23–26 | Rapid improvement, approaching elite physical ability   |
| 27–29 | Entering prime                                          |
| 30–32 | **Overall peak**                                        |
| 33–34 | Still prime for many elite fighters                     |
| 35–36 | Decline increasingly common                             |
| 37–39 | Significant decline for most                            |
| 40+   | Well past prime, heavyweight excepted                   |

**Division matters, and the model does not know it.** Flyweight and bantamweight peak earlier
because speed and reactions dominate — around 27–30. Featherweight and lightweight 28–31,
welterweight 29–32, middleweight 30–33, light heavyweight 31–34, heavyweight easily 32–36 and
beyond. `PEAK_AGE` is currently a function of `ageCurve` alone and has no idea what somebody weighs.

**Physical peak and fighting peak are different things**, and this the model already gets right in
principle: `PEAK_OFFSET` puts speed four years early and fight IQ six years late, so a fighter can
have their best explosiveness at 26 and be a substantially better fighter at 31. The structure is
sound; §3's floors made the second half too generous and pushed the composite out past 36.

**Decline should not be a smooth age curve — mileage should dominate it.** A 34-year-old who came to
the sport at 25 and has taken little damage is competitively younger than a 30-year-old who turned
professional at 18 with 35 fights, several knockouts, repeated injuries and years of hard weight
cuts. The model has all of those facts — `record.length`, `headTrauma`, `bodyWear`, the injury
history — and `applyAgeing` reads none of them. Decline is a pure function of birthdays.

So the fix is **not** a `peakAge` number to tune. It is:

1. shift `PEAK_AGE` by division, so a flyweight and a heavyweight do not share a prime;
2. make decline read mileage and damage alongside age, so two fighters the same age decline
   differently; and
3. re-check that the composite then turns over at 30–32 on its own, as an emergent result of the
   per-attribute curves crossing rather than because a constant says so.

---

## 11. The world ticks days now

The sport did not have a clock. It had a **chunk simulator**: "give me a fortnight and I will invent
three cards inside it, charge everybody once, and age everybody once." Nothing was scheduled on a
date, so nothing could happen _on_ a date.

That one decision produced every symptom in this document's §7.4 and §8, and one the player feels
directly:

- `advanceWorld` **did nothing at all** for a span under fourteen days — it aged people and
  returned. So `CHECK_STEP_DAYS` in the clock had to be fourteen too, with a comment concluding
  that "a fortnight is therefore the floor on interrupt precision".
- Which meant **"a day" on the calendar moved the date and changed nothing**, and an offer that
  arrived on the 3rd was not seen until the 14th.
- And everything else had to be per-chunk, which is why training was worth the same whether a call
  spanned a fortnight or a year (§8), and why `enforceActivity` and friends ran once per call
  regardless of how much time that call covered.

### 11.1 What changed

**Cards happen on dates.** The daily loop asks "is there a show today?" at the rate the step model
produced — `MAX_CARDS_PER_STEP` shows every `STEP_DAYS`, so about eighty nights a year across the
sport, exactly as before.

**The expensive pass is paid only on show days.** Filtering the whole roster for who is available is
O(roster), and paying it on the four days in five with no card is what a daily tick is always
accused of costing. It runs when a card runs.

**Everything that is genuinely per-span stays per-span.** Ageing, promotion costs, activity and
contract enforcement all still happen once for the whole advance — they walk all 850 fighters, and
doing that daily would be 3.1 million passes a decade. They now run over `reached`, the day the loop
actually got to.

**The clock asks the world to stop.** `advanceWorld` takes an `onDayEnd` predicate and reports
`reached`. `clock.ts` passes one that raises the inbox for that day and stops if something new is
waiting — so the world does not decide what is worth interrupting for, which is right, because
"should the player be stopped" is a question about the player.

### 11.2 What it measured

**The world is now the same world however it is advanced.** Two simulated years, caller stepping one
day at a time against fifty-six: median rating 47.7 against 47.4, fighters rated 70+ 61 against 60.
Before this, the same comparison differed by 60%.

**It is fast enough.** Every button on the calendar screen is about a tenth of a second:

| Advance     |  Time |
| ----------- | ----: |
| A day       |  86ms |
| A week      | 135ms |
| A fortnight | 107ms |
| A month     | 124ms |

**The calendar stops on real days.** Traced across eight advances of "a year": stops at +19 and +30
days, rather than only ever at multiples of fourteen.

**The inbox is not spammed** by scanning daily. Nine items across three years — raising is
idempotent on a stable id, which the inbox was already built for.

### 11.3 The rest of the per-call work — and what it turned out to be

Written first as "four functions still run once per call and should be monthly sweeps". Reading them
properly, three of the four needed nothing, and the fourth needed something different from a sweep.

**`enforceActivity` was already right.** It converts an annual hazard to the span being simulated —
`chance = 1 - (1 - perYear) ** (span / 365)` — which composes exactly: thirteen monthly calls and one
yearly call give the same probability of a fighter walking. There is a comment above it recording
that this was itself a fix, for the same class of bug, made when a call was always a fortnight.

**`playerActivity` was already right.** It reads a _state_ — how long the player has been idle, what
stage the promotion's patience has reached — and raises an inbox item keyed on day zero rather than
today, deliberately, "the stage is what must happen once". Calling it every day raises it once.

**`chargePromotions` was already right**, being proportional to elapsed days.

**`vacateAbandonedBelts` was the real one, and not for the reason given.** The problem was not that it
ran once per call, but that it ran at the _end_. A champion who retired in March kept the belt until
the following March, and a division cannot stage a title fight while its belt sits on somebody who is
filtered out of every card — which is the exact failure the function exists to prevent, one
timescale up. It now runs at the end of each simulated day. Eight promotions by twelve divisions,
with every already-vacant slot costing nothing, so the calendar is unaffected: a day 79ms, a week
129ms, a fortnight 100ms, a month 162ms.

`CARDS_PER_STEP` went with it. It sat beside `MAX_CARDS_PER_STEP` and was always the larger of the
two, so it never decided anything — the cap did.

Nothing in the world loop is now priced per call rather than per day.

---

## 12. Decline reads the miles now — §10 item 2

`applyAgeing` decided decline from the birthday alone. Two fighters born the same day declined
identically however they had spent the years between — which is the one thing about ageing in this
sport that everybody who follows it knows to be false.

### 12.1 A dimension that did not exist

The first thing measurement found was that half the intended input was not in the data.
`generateFighter` set `proDebutDay` to `age - 20` for **everybody**, and the seed's median age at
turning professional is exactly 20.0. So "years as a professional" was age with a constant
subtracted, and the model could not tell a fighter who came up through a gym at 18 from one who
turned to it at 25 — because it had decided they both started at 20.

Debut age is now drawn properly: median 21, quartiles 20 and 22, tails to 17 and 26.

### 12.2 The model

`mileageYears` returns how much older than their birthday a fighter's body is, from four things the
model already knew and never read:

| Term                    | Per unit | Why                                                                               |
| ----------------------- | -------: | --------------------------------------------------------------------------------- |
| Years as a professional |     0.10 | The clock that starts when you turn pro, not when you were born                   |
| Professional bouts      |     0.10 | A fight week is a cut, a camp, and fifteen minutes of somebody trying to hurt you |
| Body wear               |     0.03 | The grind — the cuts, the injuries, the miles                                     |
| Head trauma             |    0.015 | Small _here_: trauma already has its own channel straight into durability         |

Decline then runs on `age + mileageYears` rather than `age`. Because that shifts _when_ decline
starts, it flows through `DECLINE_RATE` automatically — a battered fighter loses speed and
durability much faster and fight IQ barely quicker at all, since those were already the rates.

**Learning still runs on the real age**, deliberately. Somebody who has been in wars is slower and
more brittle, not less able to be taught, and the sport is full of fighters who added a whole
discipline in their thirties precisely because they could no longer rely on being the athlete.

### 12.3 What it measured

Same starting attributes, three years of ageing:

| Fighter                                      | Mileage | Decline over 3y |
| -------------------------------------------- | ------: | --------------: |
| Fresh 30 — pro at 28, 4 bouts, no damage     |   +0.7y |       **−1.90** |
| Typical 30 — pro at 21, 16 bouts, moderate   |   +3.5y |           −2.80 |
| Clean 34 — pro at 25, 12 bouts, light damage |   +2.5y |           −3.80 |
| Worn 30 — pro at 18, 35 bouts, heavy damage  |   +6.9y |       **−4.20** |

The case the design is written around holds: **the worn 30-year-old now declines faster than the
clean 34-year-old**, and a fresh 30-year-old declines at less than half the rate of a worn one.

Across a 25-year world, individual peak age (each fighter's own best year, which is the honest
measure — a population average is confounded by who retired):

|                             |           Before |            After |
| --------------------------- | ---------------: | ---------------: |
| Peak age p25 / median / p75 | 33 / **34** / 36 | 32 / **33** / 35 |
| Average rating at 42        |             67.9 |             54.5 |
| Fighters rated 70+          |              102 |               72 |

The late-career shape is the bigger change. The population average used to _climb_ to 68.2 at 43 —
survivorship of fighters who essentially never declined — and now flattens around 57 and turns
down.

### 12.4 What it did not fix

Median peak age moved 34 → 33 against a target of 30–32. Mileage differentiates fighters; it does
not by itself set where the sport peaks. The remaining levers are §10's other two items — peaks
that shift by division, and re-checking §3's learning floors, which are what pushed the composite
out past 36 in the first place.

Vacancies also became rare enough to make a test flaky: champions now tend to lose the belt in the
cage before they are old enough to abandon it, so `championships.test.ts` drives a vacancy
deliberately rather than hoping a decade produces one.

---

## 13. The screens and the model disagreed

Prompted by one question — does the game still tell the player they have a ceiling in a skill? It
does not any more, and looking for the answer turned up a pattern rather than an incident.

### 13.1 The ceiling that was not there

Doc 23 replaced the hard skill ceiling with a rate. `difficulty` has honoured that from the
beginning:

```ts
isPhysical(key)
  ? headroom(current, fighter.potential[key]) // a real wall
  : skillResistance(current); // only ever gets harder
```

For a skill, `potential[key]` is **never read**. It is a projection. But three screens reached past
that and treated it as a wall for all fifteen attributes.

Measured over twenty world years, across 858 active fighters:

|           | Values above their stated ceiling |
| --------- | --------------------------------: |
| Skills    |                         **1,928** |
| Physicals |                                 1 |

The worst was a fighter with **fight IQ 92 against a displayed ceiling of 27**. Sixty-five points
over. This was not a soft guide the player could discount; it was noise presented as fact.

Three sites, and the third is the one that mattered:

1. **`FighterScreen`** drew a ceiling tick on every attribute, labelled to screen readers as
   "scouted ceiling N".
2. **The camp report** computed `potential[key] − current` for every trained attribute and said "at
   your ceiling" at zero — so the fighter with fight IQ 92 was told they were finished with the
   thing they were improving fastest at.
3. **`TrainingScreen`** ranked which camp to take by calling the _physical_ `headroom()` on skills.
   That is advice, and it disagreed with the arithmetic that would actually run. **The AI's own
   planner had the correct split all along** — `trainingPlan.room` has always branched on
   `isPhysical` — so the world's fighters were being advised honestly and the player was not.

Fixed by giving all of them one shared answer: `attributeRoom(fighter, key)`, exported from the
engine, which is `difficulty` under a public name. `attributeIsSpent` goes with it, and
`headroomExhausted` now uses it rather than restating the branch.

### 13.2 Three sets of numbers for one fact

The audit that followed found the same shape again in the damage displays:

|                 | Warns at | Serious at |
| --------------- | -------: | ---------: |
| `FighterScreen` |       45 |         65 |
| `HubScreen`     |       30 |         55 |
| The engine      |   **25** |     **55** |

A player reading both screens got two different accounts of the same fighter, and neither matched
what the model does. `TRAUMA_CONCERN`, `TRAUMA_MEDICAL` and `WEAR_CONCERN` are now exported from
`retirement.ts` — the module that decides what damage means — and both screens read them. Body wear
was shown as a bare number on the profile and a coloured one on the hub; it is now the same on both.

### 13.3 Left alone, and why

**`effectiveDurability` is invisible.** Career trauma erodes the chin at fight time by
`(headTrauma / 100) × 14`, so a fighter with 65 trauma walks out with about nine points less
durability than their profile shows. That is a real thing the player cannot see. It is arguably
_meant_ to be hidden — the chin going is something you discover — but it is a candidate for the
fight preview rather than the profile.

**Mileage has no UI at all.** §12 made a fighter's body older than their birthday, and nothing shows
it. The player cannot tell a worn 30-year-old from a fresh one, which is precisely the distinction
the mechanic exists to draw.

**The editor still shows a ceiling for every attribute**, and that is correct: it is a data editor
and `potential` is a real stored field. The label is the only thing that overstates it.
