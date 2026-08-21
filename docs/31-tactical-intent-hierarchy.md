# 31 — The tactical intent hierarchy

**Status: F4, F1 and D1 landed. The rest are still findings and should be re-audited against the new
architecture before they are implemented — some may have changed shape.**

| | |
| --- | --- |
| F4 | **representation done.** Every decision surface goes through `fight/decide.ts` and `intentAuthority` makes the gap measurable. Choosing the baselines is a behaviour change and has not happened. |
| F1 | **done** for the two positions that needed it — bottom and the held clinch. Distance already had the architecture; holding-clinch and top do not need it. See the audit below. |
| D1 | **done.** `stall` is split into `maintainPosition`, which is capability-backed, and residual inactivity, which is no longer a candidate. |
| the rest | re-ranked by architectural dependency as **D2–D9** in § 3, which is the live register. F3 is largely resolved by F1 as a side effect; two new findings were raised by the F1 audit. |

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
                 an attribute read    exp(alignment ×   exploitFactor,
                 through effect(),    1.9 × urgency)    ENTRY_EASE, dominance,
                 so a multiplier                        submissionOpportunity
                 near 1 — or a bare
                 constant
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

**As of D2 the ground-top row reads** `advancePosition` `groundStrike` `submission`
`maintainPosition` `standUpFromTop`, and consults `topIntent` for the four in-state actions and
`preferredState` for the exit — because whether you want to be on the floor at all is not a question
`topIntent` can answer. The bottom row and the held-clinch row are now two decisions rather than one
(F1); the top row is deliberately still one (invariant 8c).

---

## 3. The register, after F4 and F1

Re-ranked by **architectural dependency** rather than by the order they were found. The original
numbering is kept as an identifier so earlier commits and comments still resolve, but it carries no
meaning about sequence.

The ordering principle: **settle what the action vocabularies are before calibrating how loudly the
plan speaks over them.** Every list that D1–D4 touches is a list D7 would otherwise have to
calibrate twice.

| # | finding | kind | depends on | changes fights? |
| --- | --- | --- | --- | --- |
| **D1** | F9 — `stall` conflates riding with residual | architectural + calibration | — | **yes, materially** |
| **D2** | F10 — a fighter on top cannot elect to disengage *(**done**)* | architectural | D1 (same list) | yes |
| **D3** | F2 — the clinch has no behaviour axis | architectural | D1 (same list) | yes |
| **D4** | F6 — no `bottom` desired state | architectural (vocabulary) | — | yes, mildly |
| **D5** | F7 — positional risk is not expressible | architectural | D3 | yes |
| **D6** | F3 — `recover` is still `standUp` | behavioural | D4 | yes, narrowly |
| **D7** | F4 (remainder) — authority is not comparable | calibration | D1–D5 | yes, materially |
| **D8** | F5 — `lead` is inert | cleanup | — | barely |
| **D9** | F8 — no badly-fatigued situation | cleanup (additive) | — | yes, situationally |
| **D10** | Reduced's plan sensitivity is inverted on the ground *(**done**)* | architectural (Reduced) | — | Reduced only |
| **D11** | Reduced books no clinch control at all | architectural (Reduced) | — | Reduced only |
| **D12** | Reduced under-produces knockdowns from standing time | calibration (Reduced) | — | Reduced only |

### D1 — `stall` conflated two concepts *(was F9; **done**)*

**Built.** `stall` is now `maintainPosition` on the ground and `clinchMaintain` in the tie-up, with a
capability that scales with the control rating that does the holding. Residual inactivity was left
exactly where it already was — in the failure branch of every other action — and is no longer a
selectable candidate.

`stall` bundles two things that are not the same:

1. **Deliberate positional maintenance** — riding top position, pinning a man on the fence, running
   clock. That is genuine fighter behaviour and a genuine game plan. Its capability should derive
   from the relevant control attribute — `groundControl`, `clinchOffence` — combined with tactical
   intent, exactly as every other real action does.
2. **Residual inactivity** — what is left when attempted actions fail. This should not be an action
   candidate at all. The engine already reaches it through every other action's failure branch: a
   failed advance books 15 stalled seconds, a failed escape 20, a failed break 8.

Today both live in one candidate backed by `BASE_GROUND_STALL = 0.35` and `BASE_CLINCH_STALL = 0.5`
— bare constants, unrelated to anything about the fighter. They are **not negligible**: at 0.35
against an `advancePosition` capability of 1.42, `stall` holds **32%** of a top-position decision
for a control plan.

Replacing them with capability-backed behaviour will materially change fight distributions —
control time, referee stand-ups, finish rates. It is its own behavioural and calibration change with
its own evidence, and folding it into a structural pass would hide it.

*It ranks first because D2, D3 and D7 all touch the lists it lives in.*

#### What the constant was implicitly producing

Measured before anything changed, across the roster's real `groundControl` distribution
(p10 = 27, p50 = 44, p90 = 66, max = 94), share of the top-position decision, guard/mount:

| plan | p10 | p50 | p90 | max |
| --- | --- | --- | --- | --- |
| control-heavy | **46/39%** | 37/34% | 26/26% | **15/18%** |
| unplanned | 23/17% | 18/15% | 12/11% | 7/8% |
| damage-heavy | 13/8% | 10/7% | 7/5% | 4/3% |

**The gradient ran backwards.** The worse a fighter was at holding people down, the more of the
fight he spent doing it — three times more, at the extremes — because a fixed number keeps a larger
share of a list whose other members scale with the man. The clinch was the same: 22% at the 10th
percentile of strength against 14% at the top.

Time, per fight, over 1,800 fights between 120 roster fighters: top position ran 344 seconds, of
which the **explicit stall candidate was 34.6s and the failure branches 27.3s** — a ratio of 1.27,
so the two sources were the same order and both mattered. The clinch candidate was 7.6s.

#### What it produces now

| plan | p10 | p50 | p90 | max |
| --- | --- | --- | --- | --- |
| control-heavy | 25/27% | 29/34% | 33/42% | **37/52%** |
| unplanned | 11/10% | 13/15% | 16/21% | 20/29% |
| damage-heavy | 6/5% | 7/7% | 9/9% | 12/13% |

Rising with capability at every plan, and still moving four-fold with the plan at fixed capability.
Nothing is swallowed: a control-heavy fighter in a middling position splits advance 27% / strikes
29% / submissions 13% / maintenance 31%. The clinch gradient is corrected but mild — 14% to 17% —
because `clinchOffence` and `chainWrestling` share strength and wrestling, so the qualities that let
you hold a man on the fence are largely the ones that let you take him down from it. Its
plan-sensitivity is capped until **D3** gives the clinch a behaviour axis of its own.

#### The two calibration decisions, both measured

**The scale.** Sized so the population still spends about as much of the fight maintaining as it
did — the roster profile, action counts and referee restarts are what anchor it, not a target
percentage.

**The convexity, and this one was not in the original plan.** `groundControl` carries a convexity of
1.6, so its effect spans nine to one across the roster. Letting the *decision* inherit all of that
made the top of the distribution ride three and a half times more than the constant ever allowed,
which neither the sport's calibration nor the Reduced resolver could absorb: it pushed first-round
finishes past their bound and opened four separate parity gaps in the two matchups containing the
extreme grapplers. Damping it at 0.6 fixed both, and is the more honest model anyway — **control is
a skill with a ceiling as a decision.** Past a point, being better at holding somebody down does not
make a fighter choose it much more often; it makes the riding he already chose more effective, and
that half is modelled elsewhere in `topControlFocus` and the escape contest. What scales steeply is
how well it works, not how often it is picked.

#### What it cost

One parity allowance widened, from 1.40 to 1.42, on the striking-volume axis of
`guardPlayer-v-smotherer`. The knockout allowance is **unchanged**. Two Reduced terms were written
to close the gaps properly and both were deleted for moving their target by about a point — the
measurement instead names what a Reduced maintenance model would have to contain, which is not just
fewer submission attempts but the *conversion* those attempts lose.

### D2 — A fighter on top cannot elect to disengage *(was F10, raised by the F1 audit; **done**)*

**Built.** Top position gained `standUpFromTop`, a fifth candidate in the same flat list as the other
four, resolved by `resolveTopDisengage`.

The top position offered `advancePosition`, `groundStrike`, `submission` and `stall`, and **no exit**.
A striker who took somebody down by accident, or a fighter who wanted the fight back on the feet, had
no way to stand up: he waited for his opponent, for the referee or for the bell. Every other position
in the game had a way out. That is invariant 1 with a hole in it — the plan could ask for the fight
to be standing everywhere except the one place the fighter was in a position to do something about it.

#### Why it is a candidate and not a pre-beat

The F1 split gave the bottom position and the held clinch a **pre-beat**: the exit is drawn first,
costs no time of its own, and on failure the beat continues into in-state work. The top exit is
deliberately *not* built that way, and invariant 8c is the reason. Underneath, hand-fighting for the
exit and framing, defending and hunting from guard genuinely occupy the same moment — they are the
same hands doing the same work. On top they do not: you cannot post, break the grips, step back and
also drop elbows in the same beat. Two actions that are mutually exclusive belong in one draw, which
is the same rule that keeps `takedown` competing with `strike` at range.

That has a consequence worth stating plainly: **a failed top disengagement costs the beat.** The
fighter tried to stand, was held there, and got nothing done — which is what stops the exit being
free, and is why the option does not turn top position into a revolving door.

#### The intent axis

`TOP_EXIT` is keyed on `preferredState`, not on `topIntent`. That is not an oversight. `topIntent`
answers *what do I do having arrived* — control, damage, advance, submit — and none of its four rows
can express "I would rather not be here"; whether a fighter wants to be on the floor at all is a
`preferredState` question, and the clinch's `breakAway` alignment is keyed the same way for the same
reason. The alignment runs `outside: 1`, `boxing: 0.85`, `pocket: 0.5`, `clinch: −0.35`, `top: −1`,
`submission: −0.9`.

Share of the top-position decision from guard, one striker, conviction 0.9:

| plan | share electing the exit |
| --- | --- |
| outside / damage | **16.7%** |
| pocket / damage | 9.4% |
| *unplanned* | *9.3%* |
| clinch / control | 4.3% |
| submission / submit | 1.9% |
| top / control | 1.8% |
| top / damage | **1.4%** |

A twelve-fold span from the plan alone. The level behind that span — `TOP_EXIT_SCALE` — is the one
number in D2 that had to be *chosen* rather than measured, because invariant 9 asks for the unplanned
baseline and before D2 the unplanned baseline was zero by construction: the action did not exist.
What stands in for it is the sport. At the level shipped, an unplanned fighter elects the exit on
about 5% of his top-position beats across the archetype fixtures and voluntarily gets up about once
every two fights; control time falls 1.5–5% depending on the matchup, knockouts rise 0.7 to 3 points
and submissions fall 1 to 3. Twice that level was measured and rejected — it took control time down
another 3% and read as a sport where top position was optional. Half of it was measured and rejected
too, for the opposite reason: at a 4% neutral, a striker who wants the fight standing gets up once
per nine minutes of top position, which is a feature that exists only in the constants.

#### The capability axis, and the damping that had to come with it

The first cut multiplied the candidate by `fatiguedEffect(scrambling)` at full strength, like every
other candidate in the list. `scrambling` carries a convexity of 1.2, so its effect spans 6.8:1 across
the roster, and the decision inherited all of it:

| scrambling | 15 | 25 | 45 | 55 | 70 | 85 | 95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| undamped share | 7.8% | 9.7% | 14.7% | 18.0% | 23.9% | 31.1% | **36.5%** |
| damped (0.25) | 13.6% | 14.4% | 15.9% | 16.7% | 18.0% | 19.4% | **20.3%** |

Undamped, *how often a fighter tries to stand up* was a property of the fighter rather than of his
corner — a 4.7:1 span on the attempt, against the 12:1 the plan is supposed to own. That is
invariant 1 with its two halves swapped, and it is the same failure D1 found in `maintainPosition`.
The fix is the same and is now written into docs/01 as **invariant 1a**: capability weighs strongly
on whether an action works and only lightly on whether it is chosen. `standUpFromTop` damps at an
exponent of 0.25 in the decision and uses `scrambling` at full strength in the contest.

The residual 1.5:1 is deliberate rather than tolerated: a fighter who knows he can get up is somewhat
readier to let the position go.

#### The contest

`scrambling` against `scrambling`. **`groundControl` deliberately does not appear on the actor's
side** — being good at holding somebody down is not what gets you off them, and letting it in would
have made the fighters who least want to leave the best at leaving. The man underneath does not have
to sweep to keep him there; he only has to stay attached, so his side is guard retention and grips,
scaled by how much of him there is to stay attached to: `1.6 − dominance × 0.7`, which runs 1.39 in a
closed guard down to 0.90 from the back. How hard the position makes the *decision* lives separately,
in the candidate's `opportunity` of `0.35 + dominance × 0.85`.

**What could not be modelled, stated rather than invented.** The audit asked whether fence position
should alter the contest. It should — a fighter with his back to the cage has less room to stand out
of — and it cannot be built today, because nothing in `FightState` knows where on the mat anybody is.
There is no ground geography at all; the fence exists only as a clinch concept. The term belongs with
whatever eventually gives the floor a position, and inventing a proxy for it now would be a modifier
with no mechanism behind it.

#### Where the fight restarts

The audit's question was *which standing range should a voluntary top disengagement produce*, and the
answer is that it depends on how the separation happened rather than resetting to anything universal:

| disengaged from | range booked | why |
| --- | --- | --- |
| guard, half guard | `boxing` | grips broken off his own hips; the other man comes up attached to him |
| side control, mount, back | `outside` | he stands off a man who is flat on his back — the most space any transition in the game creates |

Both are booked with 0.15 stickiness, *below* the 0.2 a bottom-position get-up carries, so the man on
the floor can contest the range on the very next beat. A fighter cannot buy a round at kicking range
by taking somebody down and letting them up. The mapping is `disengageRange()` in `fight/range.ts`,
split out of the resolver precisely so it can be asserted directly instead of inferred from a range
histogram three mechanisms downstream.

#### What it produces

1,200 fights per cell. `att/top-min` is attempts per minute actually spent in top position; `top
share` is the share of the fight clock.

| matchup and plan | top share before | after | att/top-min | success |
| --- | --- | --- | --- | --- |
| striker, outside plan | 12.0% | **9.4%** | 0.54 | 31.9% |
| striker, pocket plan | 16.9% | 15.8% | 0.31 | 34.1% |
| striker, submission plan | 36.2% | 35.2% | 0.10 | 34.7% |
| striker, top/control plan | 42.9% | 42.3% | 0.08 | 35.5% |
| wrestler, outside plan | 35.5% | **32.9%** | 0.28 | 46.0% |
| wrestler, top/control plan | 62.4% | **62.1%** | 0.03 | 43.6% |

The two rows that matter are the last two: the same wrestler, on two plans, differs by 29 points of
fight clock in top position and by nine-fold in how often he goes for the door, and the plan that
fought for the position keeps essentially all of it — three tenths of a point.

Attempts and success separate exactly as invariant 1 requires:

| varied | 25 | 55 | 85 |
| --- | --- | --- | --- |
| **his** scrambling — att/top-min | 0.44 | 0.55 | 0.59 |
| **his** scrambling — success | 20.7% | 37.3% | **50.3%** |
| **opponent's** scrambling — att/top-min | 0.56 | 0.54 | 0.53 |
| **opponent's** scrambling — success | 53.4% | 43.6% | **27.5%** |

The opponent row is the cleanest statement of the invariant in the change: nothing about the other man
reaches the decision at all, so the attempt rate is flat to within 5% — and slightly *downward*, which
is sampling — while the success rate falls by half.

**Suppression, bounded rather than argued.** Whatever the new candidate takes off the other four, it
takes exactly its own share — so a control plan's 1.4–1.8% share *is* the ceiling on how much it can
have cost them, in every position and without a simulation in between. Measured, the wrestler on a
control plan lost 1.5% of his advances, 1.6% of his ground-strike bursts and 1.9% of his submission
attempts per fight, and per minute of top position the three are flat.

**Time.** Referee restarts stay well inside the ceiling the mechanism sets: the default referee tolerates
57.5 stalled seconds and every failed action on the floor books 15, so four consecutive unproductive
beats are needed to earn a restart and the rate cannot exceed 0.25 per beat. Double-accrual — booking
the stall on the failed exit *and* on work that followed it, which is the mistake F1 made underneath —
would halve that ceiling and show immediately.

**The sport moved, and this is what it cost.** Measured with `tools/round-profile.ts`, which is the
calibration target for the whole round-level resolver:

| matchup | control/round | knockouts | submissions |
| --- | --- | --- | --- |
| even | 103.1 → **98.5** | 7.3% → 8.2% | 13.7% → 12.3% |
| striker-v-grinder | 201.7 → 196.2 | 26.3% → 27.5% | 15.8% → 15.7% |
| contender-v-canFodder | 230.9 → **219.2** | 53.2% → **56.3%** | 38.0% → **35.8%** |
| guardPlayer-v-smotherer | 205.8 → 202.7 | 3.0% → 3.2% | 23.8% → 20.7% |
| smotherer-v-striker | 201.1 → 198.1 | 24.5% → 25.2% | 26.7% → 25.2% |

That is a real shift rather than a rounding error, and it is the intended price of a position that had
no door in it. It is not shape-versus-level contamination: `TOP_EXIT` reads exactly 1.0 for an
unplanned fighter, so nothing here is a hidden multiplier — it is a new action that unplanned fighters
sometimes take.

**Full/Reduced: three allowances widened and one added, none of them closeable from here.** Reduced has
no top-position decision to lose, so Full's clock moved and Reduced's did not, and four cells that had
been sitting under their bounds went over — two of them with a tenth of a point of headroom
beforehand, which is the usual tell.

| cell | before | now | bound |
| --- | --- | --- | --- |
| `striker-v-grinder` KO gap | 0.106 | 0.127 | 0.145 *(new)* |
| `smotherer-v-striker` KO gap | 0.124 | 0.134 | 0.145 *(was 0.13)* |
| `smotherer-v-striker` submission gap | 0.119 | 0.140 | 0.15 *(new)* |
| `guardPlayer-v-smotherer` volume ratio | 1.43 | 1.47 | 1.52 *(was 1.42)* |

The submission cell had never been reported at all: the parity loop asserts `ko`, `submission` and
`decision` in order and stops at the first failure, so the knockout gap had been hiding it — the same
short-circuit D1 found.

**Two Reduced fixes were built and both were deleted**, which between them say what the remaining gap
actually is:

- *Re-fitting `BASE_CONTROL`* against the new round profile. It changes nothing, because these matchups
  are lopsided enough that `controlShare` is pinned at `MAX_CONTROL_PER_FIGHTER` and the constant is
  not what decides them. Reduced's control clock already agrees with Full's to within 5 seconds a
  round in the failing cells. **The knockout gap is not a control-time gap** — it is that Reduced
  under-produces knockouts *from* standing time in striker-versus-grappler matchups, a pre-existing
  10.6-point gap that D2 pushed two points wider by handing those fights more standing time.
- *A `disengageAppetite` term*, dividing the holder's `hold` by his own `TOP_EXIT` bias — the same
  alignment table `simulate.ts` weighs the candidate with, exactly as `controlResistance` already reads
  the man underneath. Correct in principle and unmeasurable in practice: the same clamp swallows it, and
  it moved Reduced's control by under 1%. Deleted, per D1's rule that a modifier which cannot be
  measured is dead code with a comment.

#### The new counter

`FightStats` gains `topExitsAttempted` / `topExitsLanded` — the third attempt/landed pair for the third
transition, and for the same reason as the other two — and `topBeats`, the denominator that makes a
share of top-position *decisions* observable at all. Without it, "he stopped throwing because he was
busy standing up" and "he stopped throwing because he was on top for less of the fight" are the same
statistic, which is exactly the inference docs/01's testing rule now forbids.

**The UI is deliberately untouched.** The tactical inspector reports range attempts against arrivals
and nothing else; escapes have had the same pair since F1 and are not on the screen either. Adding one
transition's counters and not the other two would make the screen say something about the fight that
is not true of the other two thirds of it, and the exposure pass is its own piece of work.

*Enforced by* `tests/statistical/top-disengagement.test.ts`, fifteen assertions swept over eight seed
salts.

### D3 — The clinch has no behaviour axis *(was F2)*

**Changed by F1, and narrowed.** The held side gained `pummel` and now offers three in-state actions
driven by `preferredState`, which covers most of what the held fighter needs. **The controlling side
is untouched**: `clinchTakedown` / `clinchStrike` / `stall`, keyed on `preferredState` only. There is
still no `clinchIntent`, so "hold him here" and "hurt him here" remain two readings of one
instruction. Measured, all four `topIntent` values produce the same clinch: 141–147 seconds, 1.86–1.94
takedowns.

### D4 — No `bottom` desired state *(was F6)*

Unchanged by F1 in substance, though less acute: `bottomIntent` now carries real distinct behaviour,
so a guard player is at least expressible *once he is there*. What is still missing is the ability to
say he *wants* to be there. `preferredState: 'submission'` conflates "get it to the floor and hunt
from either position" with "fight off my back", which are different fighters.

### D5 — Positional risk is not expressible *(was F7)*

Unchanged, and more relevant than it was: F1 added axes for risk to apply to. Doc 05 records that
positional risk was folded into `topIntent` because "`control` against `advance` *is* that axis asked
where the fighter actually chooses" — true while the ground was the only position with a behaviour
layer, and false as soon as the clinch and standing get one. Depends on D3.

### D6 — `recover` is still `standUp` *(was F3, largely resolved by F1)*

**Substantially changed, and worth re-stating honestly.** F1 added `defend` and split the exit, which
fixed most of this finding as a side effect. Measured over 1,200 fights, before and after:

| bottomIntent | get-ups (before → after) | sub attempts (before → after) |
| --- | --- | --- |
| `standUp` | 1.96 → 1.90 | 2.17 → 2.07 |
| `recover` | 1.40 → 1.45 | 3.20 → 2.29 |
| `scramble` | 0.98 → 1.07 | 3.04 → 3.02 |
| `playGuard` | 0.65 → 0.68 | 4.62 → 3.48 |
| `attack` | 0.63 → 0.67 | 4.58 → 4.58 |

- **`playGuard` is no longer `attack`.** It was 0.65/4.62 against 0.63/4.58 — indistinguishable.
  It now attacks 32% less per beat of in-state work (0.349 against 0.456) while staying down just as
  readily, which is a recognisable difference between a guard player and a finisher.
- **`recover` is still `standUp`.** 1.37 exit attempts a minute against 1.45, and the second-lowest
  submission rate. The cause has changed, though: it is no longer that recover has no action of its
  own — it has `defend` — but that what should distinguish it is *lowered output and damage
  avoidance*, and the engine has no representation of a fighter deliberately doing less. That is a
  different and smaller finding than the one originally recorded.

Depends on D4 only in the sense that both are bottom-position vocabulary and are cheaper done
together.

### D8 — `lead` is inert *(was F5)*

Unchanged. `tactics.entry` has five readers in the engine — `groundDenial`, `entryWeight`,
`isCounterFighter`, and two `tripsAndThrows` checks — and none of them mentions `lead`. It is a
defensible neutral presented as a peer of three options that do something.

### D9 — No badly-fatigued situation *(was F8)*

Unchanged. `SITUATIONS` covers losing the round, winning it, being badly hurt, the opponent being
hurt, and the final minute. Not being able to say *what changes when the tank is empty* omits the
most common real reason a game plan gets abandoned, and the one the engine already models in most
detail.

---

### D10 — Reduced's ground-control plan sensitivity is inverted *(found during D2; **done**)*

**Built.** `controlShare` is now `controlPull`, three clamps came out of it, contests are resolved
the way Full resolves them, and `topIntent` reaches Reduced's striking model for the first time.

Not a tactical-layer finding and not caused by D2 — found because D2 put a measurement next to it.
`resolveFightByRound` reads the plan through the same alignment tables Full does, which is what
makes the two levels agree on *how much* grappling a plan wants. It did not agree on the sign.

The same grinder against the same guard player, control seconds per round for the grinder:

| his plan | Full | Reduced (before) | Reduced (after) |
| --- | --- | --- | --- |
| outside / stand-and-strike | 138 | **168** | 117 |
| top / control | 224 | **152** | 193 |

Full separates the two plans by 86 seconds a round in the direction anybody would predict. Reduced
separated them by 16 in the *opposite* one, and now separates them by 76 in the right one.

It matters beyond parity. A world simulated at Reduced is where the player's opponents come from, and
a resolver that rewards a wrestler for *not* asking for the floor builds careers that could not have
been built at Full. That is invariant 6 failing quietly, which is the failure mode it was written
for, and it is now **invariant 6a**.

#### The decomposition

The diagnosis before any fix, over the causal chain a control-time claim actually passes through.
1,200 fights a cell, grinder against guard player, stand-and-strike against take-it-down:

| axis | Full stand | Full top | | Reduced stand | Reduced top | |
| --- | --- | --- | --- | --- | --- | --- |
| 1 appetite (`grapplingAppetite`) | 0.277 | 2.857 | + | *the same function* | | + |
| 2 takedown attempts / standing-min | 1.06 | 3.73 | + | 2.13 | 1.93 | **opposite** |
| 3 takedown success rate | 0.77 | 0.76 | − | 0.99 | 0.52 | − |
| 4 control sec / landed takedown | 86.7 | 104.5 | + | 76.6 | 144.2 | + |
| 5 submission attempts / fight | 1.96 | 2.63 | + | 4.42 | 2.98 | **opposite** |
| 6 opponent control sec / round | 51.4 | 28.8 | − | 39.7 | 61.3 | **opposite** |
| — control sec / round | 139.6 | 226.2 | + | 187.3 | 167.0 | **opposite** |
| — clinch control sec / fight | 24.5 | 11.7 | − | 0.00 | 0.00 | *(see D11)* |

**Axis 1 cannot disagree**: both levels call `grapplingAppetite`, which is the point of that
function existing. The first opposite sign is at **axis 2**.

But axis 2 is not where the *cause* is, and this is the part that mattered. Reduced does not compute
takedown attempts and derive control from them — it computes the control share first and derives the
attempts from it (`grapple = own / BASE_CONTROL`). Axes 2, 3, 4, 5 and 6 are all downstream of one
number. **The plan has exactly one way into this resolver, and that is `controlShare`.** So the sign
has to be right there, and anything that flattens that term flattens every instruction at once.

#### Where the sign was actually lost, in three clamps

Decomposing `controlShare` itself, for the same fighter under the same two plans:

| term | standing | top | |
| --- | --- | --- | --- |
| `tendency` | 0.9999 | 0.9999 | = |
| `grapplingAppetite` | 0.277 | 2.857 | + |
| `wants` = tendency × appetite | 0.277 | 2.857 | + |
| `wants` **after `clamp01`** | 0.277 | **1.000** | + (compressed 10.3:1 → 3.6:1) |
| `push` (contest ratio) | 2.67 | 3.41 | + |
| `hold` (contest ratio) | 2.46 | 2.46 | = |
| raw product | 1.084 | 4.876 | + |
| **after `clamp(…, 0, MAX_CONTROL_PER_FIGHTER)`** | **0.740** | **0.740** | **=** |

The returned number is *identical* under both plans. Not compressed — identical. And the round loop
then does this:

```
pull        = redPull + bluePull
redImposes  = chance(redPull / pull)
```

`redPull` is pinned. `bluePull` is not — it still moves with red's plan, through red's `bottomIntent`
feeding `controlResistance(red)` and through `expectedRangeMix(blue, red)` putting more of the round
in the pocket. Measured: 0.093 against 0.222. So `P(red imposes)` fell from 0.888 to 0.769 when the
grinder was told to grapple, and the round arithmetic done by hand at the mean swing predicts 187
seconds against 163 — against 187.3 and 167.0 measured. The inversion is fully accounted for.

Three separate clamps were doing the same wrong thing, and the fix is the same statement each time:

1. **`clamp(…, 0, MAX_CONTROL_PER_FIGHTER)` on the return.** A ceiling belonging to the realised
   share, applied to a pull. Removed; the ceiling moved into the round loop, onto the round's own
   capacity, where `grappled = min(pull, MAX_TOTAL_CONTROL)` — below the ceiling that is the
   identity, so nothing about an ordinary round changed.
2. **`clamp01` on `wants`.** `wants` is a term in a pull, not a share. A grinder's tendencies already
   average 1.0, so an *unplanned* grinder came out at the ceiling and no instruction could move him:
   telling the best wrestler in the game to wrestle did nothing. Removed.
3. **`push` and `hold` used as raw ratios.** Not a clamp but the reason the other two bit.
   `simulate.ts` resolves every contest in the fight as `mine / (mine + theirs)` — bounded, worth at
   most certainty. Reduced was handed the same two quantities and multiplied by `mine / theirs`,
   which grows without limit as the mismatch does. **The two levels disagreed about what a mismatch
   is worth**, so an elite grappler's raw pull came out at 1.08 of a 1.00 round *on a plan telling
   him to stand and strike*, and saturated whatever was downstream. `asContest(r) = 2r / (1 + r)` is
   the same number in Full's currency, rescaled so an even contest still reads exactly 1: being twice
   the man is worth a third more, not twice as much.

Removing only the first restored the sign and left the response at 0.5–2.8%, inside sampling noise
and flipping from salt to salt. All three together give Reduced a 62% response against Full's 63%.

#### The fourth finding: `topIntent` did not reach Reduced at all

Not a sign inversion — an absence, which is worse, because a flat response has no sign to be wrong.
`topIntent` reached this resolver through exactly one term, submission attempts, and through nothing
else. A fighter told to ride for control and one told to posture up and hit threw the **same** number
of strikes a round, while at Full detail they threw 2.83 a minute against 1.03.

`groundStrikeAppetite` is the third of these functions, alongside `controlResistance` and
`submissionAppetite`, and is built the same way: `topBias(c, stance, 'groundStrike')` at a neutral
situation, so an unplanned fighter reads exactly 1. It multiplies the `ownControl` term in
`attemptsFor` — the one whose comment already said *"plenty of a grappler's volume comes from on top
of somebody"*. On the ride-versus-hit instruction Reduced now moves 2.93 significant strikes a
minute to 2.06, against Full's 2.83 to 1.03 — under-reacting, which is allowed, rather than not
reacting, which is not.

#### What it cost

**Nothing, on the level.** All four changes are exactly neutral for an unplanned fighter — every
appetite function returns 1 at zero urgency, and `asContest(1) = 1` — so the roster the constants
were measured on is untouched. Measured against `tools/round-profile.ts`, Reduced's control-time RMSE
across the six calibration matchups is **39.87 seconds a round against 39.95 before**: unchanged, and
the residual is pre-existing and unrelated. No constant was re-fitted; `BASE_CONTROL` was tried at
0.30–0.65 during the diagnosis and moves nothing in the failing cells, because they are pinned by
`MAX_TOTAL_CONTROL` rather than by it.

The whole existing suite — 1,773 tests including every Full/Reduced parity cell — passes unchanged,
with no allowance widened.

*Enforced by* `tests/statistical/reduced-direction.test.ts`, seven claims each carrying a fixture
guard. `tools/reduced-direction.ts` is the instrument.

---

### D11 — Reduced books no clinch control at all *(found during D10)*

`clinchControlSeconds` is never written by `resolveFightByRound`: it is 0 for every fighter in every
Reduced fight, while Full books 24.5 seconds a fight for a grinder on a standing plan and 11.7 on a
top plan. Reduced has one `controlSeconds` number and no notion of *where* the control happened.

It is excluded from the directional invariant, and deliberately so — but honestly rather than
conveniently, because a flat zero fails direction as surely as a sign flip would. The reason it is
excluded is that the tie-up is not a *thinner* model at round granularity, it is an absent one:
there is no clinch phase in `resolveRound` to give a share of. Adding one is a modelling change with
its own evidence, not a term.

It matters for the same reason D10 did. A judoka and a wrestler are the same fighter to this
resolver, and D3 — which gives the clinch a behaviour axis — will have nothing to reach at Reduced
detail when it lands.

### D12 — Reduced under-produces knockdowns from standing time *(pre-existing; **not** D10's cause)*

The ~10.6-point standing-knockout deficit, investigated on its own terms. **It does not share a cause
with D10**, and the measurement says so rather than the argument:

| matchup | level | distance sec/round | strikes landed/distance-min | **knockdowns/distance-min** | KO% |
| --- | --- | --- | --- | --- | --- |
| even | Full | 103.1 | 6.70 | **0.093** | 6.8 |
| even | Reduced | 116.7 | 5.23 | **0.073** | 2.6 |
| striker-v-grinder | Full | 69.8 | 11.51 | **0.387** | 25.6 |
| striker-v-grinder | Reduced | 63.7 | 12.51 | **0.264** | 15.2 |
| smotherer-v-striker | Full | 68.4 | 11.07 | **0.368** | 27.4 |
| smotherer-v-striker | Reduced | 61.1 | 12.00 | **0.205** | 10.2 |
| bomber-v-journeyman | Full | 71.9 | 7.91 | **1.234** | 78.8 |
| bomber-v-journeyman | Reduced | 57.9 | 9.37 | **1.789** | 83.6 |

The two levels **agree on standing time** — within 10% in every row — and Reduced lands *more*
strikes per standing minute than Full does. So this is not a control-time gap and D10 could not have
been causing it. What differs is knockdowns per landed strike, by 30–45% in the wrong direction.

And the sign of *that* gap depends on the matchup: Reduced under-converts in the even and
striker-versus-grappler rows and **over-converts by 45% for the bomber**. A gap that changes sign
with the fighter is the signature of a nonlinearity evaluated at a mean rather than integrated over a
distribution — `knockdownHazard` compounds on accumulated head damage, and `MID_ROUND_ACCUMULATION`
reads it once, at half the round's damage. That is the eighth axis of the D10 audit brief applied to
a different quantity, and it wants its own pass.

**Deliberately not fixed here.** The fix is a change to how Reduced integrates a convex hazard, it
will move knockout rates across the whole sport, and bundling it into a change whose entire claim is
*"the level did not move"* would make both unprovable.

## 4. The original findings, as recorded

Kept for the reasoning and the measurements. Where F4 or F1 changed a finding, the section above is
the current statement of it.

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

## 5. What the target model implies

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

## 6. Proposed sequencing

**Superseded by the register in § 3**, which re-ranks what is left by architectural dependency. The
principle below still holds and is why the interface is not in the ordering at all.

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
