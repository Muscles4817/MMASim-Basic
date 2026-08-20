# 31 — The tactical intent hierarchy

**Status: audit. Nothing in this document is built yet.**

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

`capability` is sometimes an attribute on the 25–95 scale and sometimes a hand-tuned constant:

- `BASE_GROUND_STALL` and `BASE_CLINCH_STALL` are bare constants competing against `groundControl`
  and `clinchOffence`.
- Bottom submissions are `submissions × 0.8` **in guard** and the literal `0.05` everywhere else.

The second one is the sharpest case. Off guard, `subW` is `0.05 × bias` against a `getUpW` of
roughly `scrambling × 0.65 × bias` — about **900:1** before the plan says anything, and the plan's
whole range is `exp(±1.9)`, about 6.7:1. A submission specialist told to attack from underneath
side control is arithmetically incapable of being obeyed, and the exceptional-opportunity override
cannot rescue him either, because `submissionOpportunity` feeds the bias and not the 0.05.

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
