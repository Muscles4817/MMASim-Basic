# 31 — The tactical intent hierarchy

**Status: F4 and F1 landed. The rest are still findings and should be re-audited against the new
architecture before they are implemented — some may have changed shape.**

| | |
| --- | --- |
| F4 | **representation done.** Every decision surface goes through `fight/decide.ts` and `intentAuthority` makes the gap measurable. Choosing the baselines is a behaviour change and has not happened. |
| F1 | **done** for the two positions that needed it — bottom and the held clinch. Distance already had the architecture; holding-clinch and top do not need it. See the audit below. |
| F2, F3, F5–F8 | untouched |

The range split (doc 05, doc 01 § invariants) fixed the standing half of a problem that is larger
than standing. This document is the audit of what is left, and it deliberately stops before the
redesign: the engine hierarchy is the work, the interface is what happens after it.

---

## 1. The problem, restated

The tactical layer that replaced `approach` is a real improvement and it is **not a hierarchy**. It
is five independent knobs that happen to be rendered on one screen, and each of them is read at a
different place in the engine with a different amount of authority. What is missing is a single
statement of what a fighter is trying to do, from which every decision in the fight descends.

The invariant it has to serve is already written down (doc 01 § 1):

> **The plan decides what the fighter wants to try. Attributes, current state, opponent behaviour
> and circumstances decide whether it succeeds.**

Range is the worked example of that invariant holding. A pressure plan raises range-change
*attempts* from 3.2 a fight to 9.1 and leaves the *success rate* at 52% against 54% — the plan
bought commitment, the fighters decided the outcome. The rest of the tactical layer does not
behave that way yet, and the sections below are where it does not.

---

## 2. How a decision is made today

Every choice in the fight is one shape:

```
weight(action) = capability(actor) × planBias(action) × localOpportunity
                 ↑                    ↑                 ↑
                 a raw attribute      exp(alignment ×   exploitFactor,
                 on the 25–95 scale,  1.9 × urgency)    ENTRY_EASE, dominance,
                 or a bare constant                     submissionOpportunity
```

…drawn with `rng.pickWeighted` over a flat list of actions. There are five such lists:

| position | actions offered | plan axis consulted |
| --- | --- | --- |
| distance | `strike` `kick` `takedown` `clinchUp` | `preferredState` (+ `entry` on the two grappling routes) |
| clinch, holding | `clinchTakedown` `clinchStrike` `clinchStall` | `preferredState` **only** |
| clinch, held | `breakAway` `clinchStrike` `reverse` | `preferredState` **only** |
| ground, top | `advancePosition` `groundStrike` `submission` `groundStall` | `topIntent` |
| ground, bottom | `standUp` `sweep` `submission` | `bottomIntent` |

The shape is sound. The problems are all in what the lists contain and what the plan is allowed to
say about them.

---

## 3. Findings

### F1 — Transitions and in-state behaviour compete for the same probability mass

Every one of the five lists mixes *what I do while I am here* with *how I leave*. At distance,
`strike`/`kick` are in-state and `takedown`/`clinchUp` are exits. Underneath, `submission` is
in-state and `standUp`/`sweep` are exits. They are drawn from one weighted list, so **wanting to
leave more necessarily means doing less while you are there**, as an arithmetic consequence rather
than as a modelled fact.

Measured, 1,200 paired fights, an 88-submissions fighter held down by a wrestler, changing only
`bottomIntent`:

| bottomIntent | get-ups | sweeps | sub attempts |
| --- | --- | --- | --- |
| `standUp` | 1.96 | 0.66 | 2.17 |
| `attack` | 0.63 | 1.24 | 4.96 |

Three times the get-ups bought less than half the submission attempts. That trade is *plausible*,
which is what makes it hard to see, but it is not chosen — nothing in the model says a fighter
scrambling for the exit also stops attacking, and the real answer depends on the fighter. A
desperate wrestler and a busy guard player are different people and this list cannot hold both.

This is the missing **layer 2**: transition intent has to be a separate question from in-state
behaviour, resolved before it rather than beside it.

#### F1 audit — which actions are in-state, which are exits, and what each costs

Done before touching the resolver, because the answer is not the same in every state and a generic
two-roll solution applied everywhere would break the ones that are already right.

| state | action | kind | what it consumes |
| --- | --- | --- | --- |
| **distance** | `strike`, `kick` | in-state | the beat |
| | `takedown`, `clinchUp` | **exit** | the beat — a level change *is* the moment |
| | *(range change)* | **exit, already separated** | nothing — a pre-beat |
| **clinch, held** | `clinchStrike` | in-state | the beat |
| | `reverse` | in-state | the beat — control changes, the *state* does not |
| | `breakAway` | **exit** | the beat, and produces nothing when it fails |
| **clinch, holding** | `clinchStrike` | in-state | the beat |
| | `stall` | see below | the beat |
| | `clinchTakedown` | **exit** | the beat — again a committed level change |
| **ground, top** | `advancePosition`, `groundStrike`, `submission` | in-state | the beat |
| | `stall` | see below | the beat |
| | — | **no exit exists** | a fighter on top cannot choose to disengage |
| **ground, bottom** | `submission` | in-state | the beat |
| | `standUp`, `sweep` | **exit** | the beat, and produces nothing when it fails |

Three conclusions, and they are different from each other:

**Distance is already right, and is the template.** `resolveRangeBeat` runs *before* the action
list every exchange, changes the state on its own, consumes no time of its own, and a failure costs
something concrete — the other man gets a counter at 1.45×. That is exactly the architecture F1
needs, built once already, working. And the exits that *remain* in the flat list belong there: you
cannot throw a jab and shoot a double in the same instant, so `takedown` and `clinchUp` genuinely
consume the same decision opportunity as striking does. **Distance needs no change.**

**Bottom and held-clinch are the two that are wrong**, and they are wrong in the same way. In both,
the exit is drawn against the in-state work, so wanting out suppresses everything else — and worse,
a *failed* exit produces nothing at all. A fighter who tried to stand and did not spent the entire
beat achieving zero. That is where the invariant breaks:

> **Wanting to leave a state must not automatically suppress all useful behaviour within it.**

Bottom has a second problem that makes the first one acute: **its only in-state action is
`submission`.** There is nothing to frame with, nothing to defend with, nothing to deny the pass
with. So a striker underneath has a choice between attempting an escape and hunting a choke he
cannot finish, and nothing else exists.

**Holding-clinch and top need no split.** Their only exit is a committed takedown, which does
consume the moment. Top has no exit at all, which is a real gap — a fighter on top cannot elect to
stand back up — but it is a missing action rather than a mis-structured decision, and it belongs
with the vocabulary work in F2/F3.

#### The stall constants, determined

The question was whether `stall` is an action candidate at the same conceptual level as
strike/takedown/submission, or the absence of one. Measured rather than argued:

| | capability | weight | share of the decision |
| --- | --- | --- | --- |
| `groundStall`, control plan, top in guard | 0.35 | 1.54 | **32%** |
| `clinchStall`, outside plan, holding | 0.50 | 0.30 | 13% |

It is not marginal, so this is a conceptual question and not a scaling one. The answer is **both,
and that is the defect**: `stall` bundles two different things.

1. **Deliberate positional riding** — holding somebody down and running clock. That is a real
   in-state action and a real game plan; Khabib rode position for entire rounds. Its capability is
   *not* a constant, though: holding a man down is `groundControl`, and pinning him on the fence is
   `clinchOffence`.
2. **The residual** — what happens when nothing productive comes off. This one is **already
   modelled twice over**: a failed `advancePosition` adds 15 stalled seconds and checks for a
   referee stand-up, a failed escape adds 20, a failed `breakAway` adds 8. The engine already
   reaches stalling through every other action's failure branch.

So the residual half should not be a candidate at all — it is double-counting a state the engine
arrives at anyway — and the productive half is misnamed and mis-based. The honest version is a
`ride` action whose capability is control.

**Not changed in F1.** Rebasing it from 0.35 to `groundControl` is a four-fold change to a
candidate holding a third of the top-position decision, which is a calibration exercise with its
own evidence, not a side effect of restructuring the bottom. It is recorded here as the next
behaviour change to make deliberately.

#### What F1 built

The exit became a **pre-beat** at the two positions that needed it, mirroring `resolveRangeBeat`:
resolved first, consuming no time of its own, and on failure the beat carries on into the in-state
work rather than ending in nothing.

- **`exitUrgency`** takes an alignment and the fighter's conviction and nothing else. A first cut
  derived it from the *ratio of intents* across the two lists and that was wrong in an instructive
  way: adding `pummel` to the held clinch — an action that helps a striker *leave* — dropped his
  break attempts from 91% of beats to 51%, because the new candidate landed on the "staying" side
  of a ratio it had no business being in. How much you want out cannot be a function of how many
  things there are to do while you are in.
- **The neutral is what an unplanned fighter does**, measured from the old engine at 0.80 on the
  bottom and 0.56 in the clinch — not 0.5. Centring it at a half made every unplanned fighter in
  the game stop trying to stand, and cost the striking attributes two points of win-rate swing.
- **Two new in-state actions**, because the invariant cannot hold without them. Underneath there
  was *nothing* to do but hunt a submission; `defend` is framing and hand-fighting, resolved as
  pressure toward the referee's stand-up. In the held clinch, removing `breakAway` from the draw
  left only a short strike and a reversal, so an outside fighter whose break failed *took over the
  tie-up* 59% of the time; `pummel` is a striker's answer instead of a grappler's.
- **Stalled time is charged once.** Booking it on both the failed exit and the in-state work made a
  bottom beat accrue 20–32 seconds where it used to accrue 20, which raised referee restarts across
  the whole sport and compressed the gap between a striking plan and a wrestling one.

Measured: a striker told to stand up goes for the exit **1.51 times a minute against 0.98** for one
told to work from his back, does in-state work on **nearly every beat either way**, and the two
plans differ by under six points on *success* rate — which 40 scrambling against 82 ground control
decides, not the corner.

### F2 — The clinch has no behaviour layer at all

`HELD_ALIGNMENT` and `CONTROLLING_ALIGNMENT` are keyed on `PreferredState`. There is no
`clinchIntent`. What a fighter does in a tie-up is derived entirely from where he said he wanted
the fight, so "hold him here" and "hurt him here" are not expressible — they are two readings of
the same instruction, and only for the fighter whose preferred state is `clinch` in the first
place.

Measured, same fighter, same clinch-seeking plan, changing only `topIntent`:

| topIntent | clinch seconds | clinch takedowns |
| --- | --- | --- |
| `control` | 147 | 1.94 |
| `groundAndPound` | 143 | 1.93 |
| `advance` | 143 | 1.91 |
| `submit` | 141 | 1.86 |

Flat, as expected — those are ground instructions. The point is that **nothing else is offered**.
The ground has `topIntent` and `bottomIntent`; the clinch, which is a two-sided position with a
control side and a held side, has neither.

### F3 — Two of the five bottom instructions are aliases

`BOTTOM_INTENTS` offers five choices. `BottomAction` offers three actions. The mapping does not
survive contact:

| bottomIntent | get-ups | sweeps | sub attempts |
| --- | --- | --- | --- |
| `standUp` | 1.96 | 0.66 | 2.17 |
| `recover` | 1.40 | 0.90 | 3.20 |
| `scramble` | 0.98 | 1.36 | 3.04 |
| `playGuard` | 0.65 | 1.33 | 4.62 |
| `attack` | 0.63 | 1.24 | 4.96 |

- **`playGuard` is `attack`.** 0.65/1.33/4.62 against 0.63/1.24/4.96. A player who picks "play
  guard" has picked "hunt submissions" and has not been told.
- **`recover` is a diluted `standUp`.** It sits between `standUp` and `scramble` on every axis
  because it has no action of its own: there is nothing in the list for *protect yourself, deny
  the pass, give up nothing, get to the bell*, which is what recovering actually looks like.

Five names over three actions is a menu that promises more than the engine can do — the same
defect class as the seven `approach` buttons, one layer down.

### F4 — The weights are not commensurable, so the plan's authority varies by decision

> **Since audited.** The representation half is built. All five lists go through `chooseAction`,
> every term is declared as `capability`, `intent` or `opportunity`, and `intentAuthority` turns the
> finding below into a number. Measured at full conviction across seven decision surfaces it runs
> **0.32 to 10.28**, and the same bottom instruction is worth **7.33 in guard against 0.71 in side
> control**. The refactor changed nothing: 7,500 fights across five matchups, 223 counters, every
> one bit-identical. The numbers themselves are unchanged and still wrong.

> **Correction, made during F1.** The first version of this section said capability was "on the
> 25–95 scale" and put the bottom-submission gap at 900:1. **Both are wrong.** `fatiguedEffect`
> does not return a rating — it returns `effect()`, which is `exp(convexity × (rating − 50) / 50)`,
> a multiplier of roughly **0.5 to 2.0**. A 70-rated attribute reads about 1.5, not 70.
>
> Everything downstream of the *measurement* was right, because `intentAuthority` reads the actual
> values; it was the prose arithmetic that was invented. The corrected numbers are below, and they
> change the character of the finding: the bare constants are not negligible next to the attribute
> terms, they are the same order of magnitude. `stall` is 32% of a top-position decision, not a
> rounding error. What is wrong with them is that they are *arbitrary* — unrelated to anything
> about the fighter — not that they are small.

`capability` is sometimes an attribute effect and sometimes a hand-tuned constant, and the two are
closer together than they look:

| candidate | capability | against |
| --- | --- | --- |
| `groundStall` | `BASE_GROUND_STALL` = 0.35 | `advancePosition` at 1.42 — **4:1** |
| `clinchStall` | `BASE_CLINCH_STALL` = 0.5 | `clinchTakedown` at 1.99 — **4:1** |
| bottom `submission`, in guard | `submissions × 0.8` = 1.29 | `standUp` at 1.28 — **even** |
| bottom `submission`, elsewhere | the literal `0.05` | `standUp` at 0.82 — **16:1** |

The last row is still the sharpest case, and 16:1 is still past what the plan can argue with: the
whole intent range is `exp(±1.9)`, about 6.7:1 end to end. A submission specialist told to attack
from underneath side control still cannot be fully obeyed, and `submissionOpportunity` still cannot
rescue him, because it feeds the intent and not the constant. The effect is a tenth of what this
document originally claimed and it is real.

In practice this rarely bites — bottom time is mostly guard time, and an attempt to demonstrate it
behaviourally moved submission attempts only from 5.55 to 4.77 — so it is a **latent** override
rather than a live bug. It is listed because it is the clearest example of the general problem:
when the baseline scales are arbitrary, the plan's authority is arbitrary too, and nobody can tell
from reading the code which instructions are strong and which are decorative.

### F5 — One of the four standing entry styles does nothing

`tactics.entry` has exactly five readers in the engine: `groundDenial`, `entryWeight`,
`isCounterFighter`, and two `tripsAndThrows` checks. Cross-referencing them:

| entry | what reads it |
| --- | --- |
| `pressure` | `groundDenial` — denies the retreat, eases the close |
| `movement` | `groundDenial` — the reverse |
| `counter` | `isCounterFighter` — a 0.9 counter scale instead of 0.55 |
| `lead` | **nothing** |

`lead` is the neutral baseline, which is a defensible thing to have and is not what the interface
says it is: four peers, one of which is silently "no answer". Whatever replaces this needs
initiative to be a real axis with a real neutral, not three options and a placeholder.

### F6 — The desired-state vocabulary has no bottom

`PREFERRED_STATES` runs `outside | boxing | pocket | clinch | top | submission | adaptive`. A
fighter who genuinely wants to fight off his back — a guard player, which is a real and coherent
game plan — has to pick `submission`, which also means "get it to the floor and hunt from either
position". Two different fighters, one word.

### F7 — Risk is one scalar and an enum, and positional risk is not expressible

`riskLevel` is a 0–1 number spent in `riskProfile` on exchange behaviour; `finishing` is three
values about what happens when somebody is hurt. Doc 05 records that positional risk was folded
into `topIntent` because "`control` against `advance` *is* that axis asked where the fighter
actually chooses" — which was true when the ground was the only place with a behaviour layer, and
stops being true the moment the clinch and standing get one. There is no way to say "take
positional risks standing, none on the floor".

### F8 — No fatigue contingency

`SITUATIONS` covers losing the round, winning it, being badly hurt, the opponent being hurt, and
the final minute. It does not cover **being badly fatigued**, which is the single most common
reason a real game plan gets abandoned, and the one the engine already models in most detail.

---

## 4. What the target model implies

The five layers, and what each one has to become:

1. **Desired fight state** — `outside | boxing | pocket | clinch | top | bottom | adaptive`, with
   the `bottom` state F6 is missing and `submission` retired into it as an *engagement* rather than
   a destination.
2. **Transition intent** — new, and the largest piece. *If I am not where I want to be, what am I
   trying to do about it?* `close`, `disengage`, `clinch`, `shoot`, `counterWrestle`, `standUp`,
   `scramble`, `reverse`. Resolved **before** in-state behaviour rather than against it (F1).
3. **Behaviour once in state** — per position, including the clinch (F2), with an action list that
   covers every name the vocabulary offers (F3).
4. **Risk posture** — conservative / balanced / aggressive, with positional and finishing risk
   separable if the engine needs them (F7).
5. **Situational adaptation** — the existing five plus fatigue (F8).

And the structural requirement underneath all five, from F4: **every action list must be scored on
a common scale**, so that a given conviction buys the same authority wherever it is spent. That is
the difference between a hierarchy and five knobs.

---

## 5. Proposed sequencing

Engine first, interface last — the current screen can keep rendering the current vocabulary while
the layers underneath it are rebuilt, and a UI designed against a half-migrated engine would have
to be designed twice.

1. **Commensurable weights.** Normalise every action list so capability enters as a share rather
   than as a raw magnitude, and delete the bare constants. Nothing about behaviour should change;
   this is the change that makes the rest measurable, and `shape-not-level.test.ts` is the guard
   that it did not quietly move the sport.
2. **Split transition from behaviour.** Two resolutions per beat where there is currently one:
   am I trying to change state, and what am I doing meanwhile. F1 closes here.
3. **Clinch behaviour layer.** F2, and it is the piece with no prior art in the file to copy —
   the clinch is two-sided, so it needs both a controlling and a held vocabulary.
4. **Bottom vocabulary.** F3 and F6: a real `playGuard` that is not `attack`, a real `recover`
   that is not a weak `standUp`, and `bottom` as a desired state.
5. **Risk and situations.** F7 and F8, which are small once the layers above exist.
6. **Then the screen.**

Each step keeps the existing statistical suite green, and each adds the assertion that its own
layer is expressible — that two different instructions produce two different fights, and that
neither of them moves the sport.
