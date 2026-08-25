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
| **D3** | F2 — the clinch has no behaviour axis *(**done**)* | architectural | D1, D11 (Reduced must represent the clinch first) | yes |
| **D4** | F6 — no `bottom` desired state *(**done**)* | architectural (vocabulary) | — | yes, mildly |
| **D5** | F7 — positional risk is not expressible *(shrunk: D3 absorbs the clinch slice)* | architectural | D3 | yes |
| **D6** | F3 — the bottom instructions are bunched *(**done**, with D4)* | behavioural | D4 | yes, narrowly |
| **D7** | F4 (remainder) — authority is not comparable | calibration | D4, D6 *(both done)* | yes, materially |
| **D8** | F5 — `lead` is inert | cleanup | — | barely |
| **D9** | F8 — no badly-fatigued situation | cleanup (additive) | — | yes, situationally |
| **D10** | Reduced's plan sensitivity is inverted on the ground *(**done**)* | architectural (Reduced) | — | Reduced only |
| **D11** | Reduced books no clinch control at all *(**done**)* | architectural (Reduced) | — | Reduced only |
| **D12** | Reduced under-produces knockdowns from standing time *(deferred)* | calibration (Reduced) | — | Reduced only |
| **D13** | The controlling fighter in a clinch cannot let go *(**done**)* | architectural | shipped with D3 | yes |
| **D14** | Reduced collapses the two grappling entries into one appetite | architectural (Reduced) | — | Reduced only |
| **D15** | A tie-up costs both men the same *(**done**)* | calibration | shipped with D3 | yes, sport-wide |

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

### D3 — The clinch has no behaviour axis *(was F2; **done**, with D13 and D15)*

**Built.** `clinchIntent: control | damage | takedown`, one field over both ends of the tie-up
through one alignment table; the controlling fighter gained a voluntary release (D13); and being
held on the fence stopped costing what holding it costs (D15). The design below is what shipped —
the sections that follow it record what the built thing measured.

**Re-audited after D10 and D11.** The finding survives and its shape is now precise: the clinch is
**the only position in the engine whose in-state behaviour is read off `preferredState`.** Everywhere
else the programme's central distinction — *where do I want the fight* against *what do I do having
arrived* — is carried by a dedicated field. On the floor that is `topIntent` and `bottomIntent`. In
the tie-up there is nothing, so one instruction is doing both jobs and neither well.

#### 1. What the controlling fighter can decide

Three candidates, in one flat draw (`controllingCandidates`):

| action | capability | intent from | resolves to |
| --- | --- | --- | --- |
| `takedown` | `chainWrestling` × trait × 1.2 | `CONTROLLING_ALIGNMENT.clinchTakedown[preferredState]` | `resolveTakedown(…, 'clinch')` → ground |
| `clinchStrike` | `strikingOffence` × 0.8 | `…clinchStrike[preferredState]`, with `finishOpportunity` | `throwClinchStrike(…, 1)` |
| `maintainPosition` | `clinchOffence ** 0.6` × 0.42 | `…clinchMaintain[preferredState]` | pins, books 10–20s, accrues stall toward the referee's break |

And **a fourth thing he cannot decide: to let go.** The controlling branch has no voluntary exit. He
leaves the tie-up when the referee separates them, when the held man escapes or reverses, or when he
takes the fight to the floor — never because his corner wanted the fight back at range. That is
exactly the hole D2 closed one position over, and it is recorded below as **D13** rather than folded
in silently.

The held fighter, for contrast, already has the full structure: a `CLINCH_EXIT` pre-beat (F1) and
three in-state actions (`clinchStrike` / `reverse` / `pummel`).

#### 2. In-state or transition

| action | kind | why |
| --- | --- | --- |
| `clinchStrike` | **in-state** | damage from where he is |
| `maintainPosition` | **in-state** | the position as the thing being done, post-D1 |
| `takedown` | **transition, deeper** | leaves the tie-up, moves *further* into grappling — the analogue of `advancePosition` on the floor, which `topIntent` owns |
| *(missing)* disengage | **transition, out** | leaves the tie-up back to the feet — the analogue of `standUpFromTop`, which `preferredState` owns |

That distinction settles where each one should be keyed, and it is D2's rule generalised rather than
a new one: **intents own what stays within or advances the grappling; `preferredState` owns the exits
back to the feet.** `topIntent` already contains `advance` and `submit`, both of which change the
state; `TOP_EXIT` is keyed on `preferredState` because *"do I want to be on the floor at all"* is not
a question `topIntent` can answer. The clinch splits the same way.

#### 3. Which plan fields reach the clinch today

| field | reaches the controlling clinch? | how |
| --- | --- | --- |
| `preferredState` | **yes, and it is the only in-state signal** | `CONTROLLING_ALIGNMENT`, all three rows |
| `conviction` | yes | `stance.urgency`, and through `placedBy` displacement |
| `entry` | partly | `tripsAndThrows` is a 1.6× opportunity on the clinch takedown — 22.1% of the draw to 31.2% |
| `finishing` | partly | through `finishOpportunity` on the strike's opportunity term |
| `situational` | yes, indirectly | `forceGrappling` / `survive` substitute `desired` before the tables are read |
| `topIntent` | **no** | — |
| `bottomIntent` | no | — |

#### 4. What `topIntent` means in the clinch

**Nothing whatsoever.** Measured on the decision itself, a clinch-preference fighter at conviction 0.9
produces identical shares under all four values:

| `topIntent` | takedown | strike | maintain |
| --- | --- | --- | --- |
| `control` | 22.1% | 64.0% | 13.9% |
| `groundAndPound` | 22.1% | 64.0% | 13.9% |
| `advance` | 22.1% | 64.0% | 13.9% |
| `submit` | 22.1% | 64.0% | 13.9% |

Not *weakly* — identically, to the last decimal. And that is correct rather than a bug to fix by
overloading it: `topIntent` means "having arrived on top", and a fighter is entitled to want to grind
in the tie-up and hunt from the floor. Reading `topIntent` in the clinch would collapse two axes the
engine deliberately keeps apart.

#### 5. Do we need a new field

Yes, and the alternatives were checked rather than dismissed:

- **`topIntent`** — collapses the tie-up and the floor into one instruction (§ 4).
- **`entry`** — invariant 5 says initiative is not a destination; `entry` describes *how you get
  there*, and `tripsAndThrows` already spends its influence at the entry moment. Using it for in-state
  behaviour re-merges the two axes that invariant exists to keep apart.
- **`finishing`** — a risk/urgency scalar that applies everywhere; it cannot say *which* of three
  things to do.
- **`preferredState` with more rows** — this is the status quo, and it is why the position reads
  "knee him" when a player asked for "hold him": a clinch preference currently spends **64% of its
  controlling beats striking and 13.9% maintaining**, and there is no way to say otherwise.

The clinch also has the **lowest plan authority of any decision surface in the engine**, measured at
full conviction with `intentAuthority`:

| surface | pressure | wrestle | submit | standUp | clinch |
| --- | --- | --- | --- | --- | --- |
| distance | 4.82 | 2.49 | 2.45 | 4.64 | 2.11 |
| clinch (held) | 2.09 | 2.96 | 2.09 | 3.66 | 4.18 |
| **clinch (controlling)** | **0.79** | **1.35** | **1.35** | **0.56** | **1.24** |
| bottom exits | 2.15 | 2.15 | 3.58 | 5.91 | 2.15 |
| top (guard) | 1.10 | 1.37 | 1.30 | 1.10 | 1.10 |

A fighter told to keep the fight standing who finds himself controlling a tie-up reads **0.56** — his
corner is close to inaudible in the one position where a striker most needs it. Note also that the
controlling surface's authority swings 2.4-fold depending on which plan is set, which is a second,
subtler defect: the same conviction is worth different amounts to different corners *at the same
decision*.

#### 6. Proposed vocabulary

`clinchIntent: 'control' | 'damage' | 'takedown'`, one field covering **both ends of the tie-up**
through two alignment tables.

One field rather than two, and this is the one place the design departs from the `topIntent` /
`bottomIntent` precedent. Top and bottom are separate fields because they are separate jobs a fighter
can be in for minutes at a time. The two ends of a clinch swap within seconds — the `reverse` action
exists precisely to swap them — and a corner does not give two different tie-up instructions. Two
tables, one instruction, read from whichever end the fighter is on.

Three values rather than four: there is no clinch analogue of `submit` (standing submissions are not
modelled, and inventing one here would be a mechanic smuggled in through a vocabulary change).

Proposed alignments, controlling side:

| action | `control` | `damage` | `takedown` |
| --- | --- | --- | --- |
| `clinchTakedown` | −0.2 | −0.35 | **1** |
| `clinchStrike` | −0.45 | **1** | −0.3 |
| `clinchMaintain` | **1** | −0.4 | −0.35 |

Held side:

| action | `control` | `damage` | `takedown` |
| --- | --- | --- | --- |
| `clinchStrike` | −0.3 | **1** | −0.25 |
| `reverse` | 0.85 | −0.2 | **1** |
| `pummel` | 0.4 | −0.3 | −0.1 |

`reverse` is the held man's route to *both* control and a takedown, because he cannot shoot from
underneath a tie-up — he has to take the position first. `pummel` is the hand-fighting that keeps a
tie-up alive without spending it, which is what `control` asks for from the wrong end.

And the two transitions stay on `preferredState`: the existing `CLINCH_EXIT` table for the held man's
break, and the same table for the controlling man's disengage (D13). *How badly do I want out of a
tie-up* does not depend on which end of it I am holding.

#### 7. What each choice would buy

Computed on the **real capabilities** from `controllingCandidates` and `heldWork`, with only the
intent term substituted — so these are the shares the change would actually produce, not a sketch:

| controlling, conviction 0.9 | takedown | strike | maintain | authority |
| --- | --- | --- | --- | --- |
| *today, clinch preference* | 22.1% | 64.0% | 13.9% | 1.24 |
| `control` | 35.9% | 18.4% | **45.7%** | 1.43 |
| `damage` | 19.0% | **76.1%** | 4.9% | 1.38 |
| `takedown` | **84.7%** | 11.2% | 4.1% | 1.33 |
| *unplanned* | 50.6% | 35.7% | 13.8% | — |

| held, conviction 0.9 | strike | reverse | pummel | authority |
| --- | --- | --- | --- | --- |
| `control` | 9.2% | 55.2% | 35.6% | 3.28 |
| `damage` | **63.0%** | 18.4% | 18.6% | 3.70 |
| `takedown` | 10.3% | **70.1%** | 19.6% | 3.56 |

Three things to note, each of which is an acceptance criterion in waiting:

- **The unplanned row is unchanged.** Every alignment is read through `bias`, which returns exactly 1
  at zero urgency, so the roster the sport is calibrated on does not move. Same property that made
  D1, D2, D10 and D11 level-neutral.
- **Authority stops depending on the plan.** 1.33–1.43 across the three intents, against today's
  0.56–1.35 across five preferences. The surface stops being the quietest in the engine and stops
  being differently quiet for different corners.
- **Capability still owns success.** At fixed `clinchIntent: 'takedown'`, sweeping strength 30 → 90
  moves the takedown *share* 83.0% → 85.8% — near flat, exactly as invariant 1 requires. Whether the
  takedown comes off is `resolveTakedown`, untouched; whether the knee lands is `throwClinchStrike`,
  untouched; whether the pin holds is the escape contest, untouched.

#### 8. What Reduced needs

Less than it looks, because D11 already built the shape. `clinchShareOfControl` is
`CLINCH_SHARE_OF_CONTROL × √(clinchLean × clinchPersistence) × retention`, and only one of those
three terms moves:

- **`clinchLean` stays on `preferredState`.** It is the entry route — of the grappling he wants, how
  much is aimed at the fence — and entry is not what `clinchIntent` governs.
- **`clinchPersistence` repoints from `preferredState` to `clinchIntent`.** It already reads
  `clinchMaintain` against `clinchTakedown`; those two rows simply move tables. Its neutral stays
  exactly 1, and its spread stays comparable: 1.65 / 0.97 / 0.30 for control / damage / takedown,
  against today's 1.41 / 1.07 / 0.38 for clinch / outside / top.
- **One addition, mirroring D10's fourth finding.** `groundStrikeAppetite` exists because `topIntent`
  reached Reduced's striking volume through nothing at all. `clinchIntent: 'damage'` would have the
  same problem: a clinch-damage plan and a clinch-control plan would throw identically. A
  `clinchStrikeAppetite`, read off the same table at a neutral situation and applied to the clinch
  share of the control term, is the whole of it.

No new Reduced structure, no new phase, no constant retuned. And **the directional guard is already
written** — `reduced-direction.test.ts` gains one claim (a `damage` clinch plan raises striking volume
at both levels) rather than a new suite.

#### 9. Does this fix the `grapplingAppetite` conflation

**No, and it should not be sold as doing so.** The vocabulary already distinguishes the two entries —
`STANDING_ALIGNMENT` has separate `takedown` and `clinchUp` rows, reading 0.15 and 1.0 for a clinch
preference. What loses the distinction is Reduced *averaging those two rows into one scalar*:

```
grapplingAppetite = (standingBias(takedown) + standingBias(clinchUp)) / 2
```

So a clinch plan and a top plan arrive at `controlPull` as similar numbers, and Reduced grants the
clinch plan 444.6 seconds a fight of control against Full's 242. `clinchIntent` does not touch that
expression and cannot: it governs what happens *after* the tie-up exists.

What it does do is **reduce the consequence**. Today the misallocated time is stuck: a fighter's fence
share is a function of the same `preferredState` that inflated his total. With `clinchIntent`, the
share becomes steerable independently, so a `preferredState: 'top'` fighter told to grind in the
tie-up is modelled as spending his control on the fence — currently impossible. The residual is a
magnitude error in *how much* control a fence-first plan buys, and it is recorded as **D14**.

#### 10. Order and dependencies, revised

- **D5 shrinks and stays behind D3.** Its content is "risk is one scalar and positional risk is not
  expressible". `damage` against `control` in the tie-up *is* positional risk in the clinch — accept a
  reversal to land knees — so D3 absorbs the clinch slice of D5 outright. What is left of D5 is the
  ground slice (accept a pass to hunt a submission) and the standing slice.
- **D7 stays last and gets easier.** The controlling clinch is one of the two ends of the 0.11–5.94
  spread D7 exists to close, and D3 moves it to 1.33–1.43 by construction. D7's remaining work is the
  bottom-position lists.
- **D13 should ship with D3** — same list, same file, and the design above already places it.
- **D9 acquires a companion.** "What changes when the tank is empty" needs the tank to move, and in
  the tie-up it does not (D15).
- **D4, D6, D8 unaffected.**

#### What the built thing measures

The design above shipped with one number changed, and it is the semantic one. `clinchTakedown` under
`control` moved from −0.2 to **−0.55**, which is the answer to the question the design put up:

> **`control` means *this tie-up*, not grappling in general.** Decision A, not B.

The first draft implemented B by accident — 36% takedowns against 46% holding — and it was rejected
because three intents that overlap are three intents that do not separate, and separating them is the
entire finding. A player who asks for `control` and gets a fighter shooting a third of the time has
been given `takedown` with extra steps. The screen therefore says *"Keep the tie-up. Wear them out
against the fence."* and the table means it.

It is not zero and should not be. A quarter of a controlling fighter's beats are still a takedown
under `control`, because the takedown's *capability* is in the draw and a good wrestler is a good
wrestler whatever he was told. That is invariant 1, not a leak: what the instruction buys is the
emphasis, and holding outweighs shooting two to one.

Shares at conviction 0.9, on the real capabilities:

| plan | takedown | strike | maintain | release | authority |
| --- | --- | --- | --- | --- | --- |
| *before D3, clinch preference* | 22.1% | 64.0% | 13.9% | — | 1.24 |
| clinch / `control` | 25.4% | 20.3% | **50.6%** | 3.7% | 1.90 |
| clinch / `damage` | 18.6% | **74.5%** | 4.8% | 2.1% | 1.90 |
| clinch / `takedown` | **83.3%** | 11.0% | 4.0% | 1.7% | 1.90 |
| outside / `control` | 17.6% | 14.1% | 35.0% | **33.3%** | 1.47 |
| outside / `damage` | 14.9% | 59.5% | 3.8% | **21.8%** | 1.33 |
| top / `takedown` | 80.4% | 10.7% | 3.9% | 5.1% | 1.28 |
| *unplanned* | 44.7% | 31.5% | 12.2% | 11.6% | 0.00 |

And held, where the same instruction is read from the other end:

| plan | strike | reverse | pummel | authority |
| --- | --- | --- | --- | --- |
| `control` | 7.7% | 56.1% | **36.1%** | 3.70 |
| `damage` | **63.0%** | 18.4% | 18.6% | 3.70 |
| `takedown` | 9.7% | **70.6%** | 19.7% | 3.70 |

**Authority.** The controlling clinch was the quietest decision surface in the engine at 0.56–1.35
across five preferences; it now reads **1.28–1.90** across twelve plan combinations. Not calibrated
to a universal value — comparability is D7's job and this is not it — but off the floor, and no
longer *differently* quiet for different corners, which was the subtler half of the defect.

**Capability still owns success.** At a fixed instruction, sweeping strength 30 → 90 moves the
takedown share 81.5% → 84.4%. Whether the takedown comes off is `resolveTakedown`, whether the knee
lands is `throwClinchStrike`, whether the pin holds is the escape contest. None was touched.

**The unplanned row did not move**, because every alignment is read through `bias`, which returns
exactly 1 at zero urgency. The clearest evidence of what the axis was worth is what the *old* engine
did with the two plans it could not tell apart: `clinch / control` and `clinch / damage` produced
**192.6 seconds of tie-up each, the same win rate and the same knockout rate, to the last decimal.**
They were the same fight.

#### What Reduced took

Exactly what the audit said it would, and nothing else:

- `clinchLean` stays on `preferredState`. It is the entry route.
- `clinchPersistence` repointed to `clinchIntent` — the two rows it reads moved tables. Its neutral
  is still exactly 1 and its spread is comparable: 1.65 / 0.97 / 0.30 for control / damage / takedown
  against the 1.41 / 1.07 / 0.38 it read for clinch / outside / top.
- `clinchStrikeAppetite` added, the clinch twin of `groundStrikeAppetite`, blended into
  `attemptsFor`'s control term by D11's own clinch share. Without it `damage` and `control` would
  have thrown identically at round granularity while Full separated them four-fold.

No new phase, no new state, no constant retuned. Reduced's unplanned fixtures are **bit-identical**
before and after.

#### What it cost

| matchup (unplanned, Full) | clinch sec/f | control sec/f | KO% | SUB% |
| --- | --- | --- | --- | --- |
| even | 103.3 → 101.4 | 504.1 → 491.3 | 6.8 → 6.4 | 13.4 → 14.2 |
| striker-v-grinder | 43.6 → 41.1 | 468.1 → 465.1 | 25.6 → 27.0 | 20.0 → 18.6 |
| guardPlayer-v-smotherer | 74.6 → 72.4 | 627.9 → 621.7 | 2.6 → 3.4 | 19.4 → 19.0 |
| contender-v-canFodder | 25.3 → 24.7 | 223.0 → 219.9 | 63.2 → 62.2 | 30.8 → 31.4 |

Two to six per cent of the sport's clinch time, which is the price of the position having a door, and
it is D13's bill rather than D3's. One Full/Reduced allowance widened — `smotherer-v-striker`'s
knockout gap from 0.145 to 0.16 — with the cause named: Reduced has no tie-up to release from,
because the clinch exists there as a share of control rather than as a phase, which is D11's stated
limitation working exactly as documented.

The golden fingerprint's fourth re-recording is the smallest of the four: **only `punches` moved**, by
0.3% to 1.1%, following the time back out to range.

*Enforced by* `tests/statistical/clinch-intent.test.ts`, nineteen assertions swept over six seed
salts.

### D4 — No `bottom` desired state *(was F6; **done**, with D6)*

**Built.** `preferredState` gained `bottom`; the bottom's exit urgency and exit route moved onto it;
and `bottomIntent` became an in-state axis of three values with `recover` finally meaning something.

The original finding said `preferredState: 'submission'` conflated *get it to the floor and hunt from
either position* with *fight off my back*. True, and it was the smaller half. The larger half only
became visible with the post-D3 authority measurement: **`bottomIntent` was answering three
questions.** How urgently he wanted off the floor (`BOTTOM_EXIT`), which way he went when he went
(`standUp` against `sweep`) and what he did while he stayed (`submission` against `defend`) — one
field carrying *where do I want the fight*, *how do I get there* and *what do I do here*. That is the
defect D3 removed from the clinch, and the bottom had it worse by one.

The two findings are one change. The exit cannot move off `bottomIntent` without a `preferredState`
to move it to, and the vocabulary cannot be un-bunched while three of its five values differ only on
the axis that is leaving.

#### What moved where

| question | before | after |
| --- | --- | --- |
| how badly do I want off the floor | `bottomIntent` → `BOTTOM_EXIT` | **`preferredState`** → `BOTTOM_EXIT` |
| which way out do I go for | `bottomIntent` → `BOTTOM_ALIGNMENT.standUp/sweep` | **`preferredState`** → `BOTTOM_ROUTE` |
| what do I do while I am here | `bottomIntent` → `BOTTOM_ALIGNMENT.submission/defend` | `bottomIntent` → `BOTTOM_WORK_ALIGNMENT` |

`BOTTOM_CONVICTION` was deleted rather than re-keyed. It existed to express *how much a fighter minds
being underneath*, which the alignment alone could not say while the field was overloaded; once
minding-it moved to `preferredState` it was two ways of saying the same thing about the same three
rows, and a table whose job another table already does is a second place to get it wrong.

#### The exit, and the route, are different questions

Measured at full conviction. The point is the pair of columns, not either one:

| `preferredState` | exit urgency | stand up | sweep |
| --- | --- | --- | --- |
| outside | 0.909 | **89%** | 11% |
| boxing | 0.898 | 87% | 13% |
| pocket | 0.882 | 81% | 19% |
| clinch | 0.865 | 53% | 47% |
| top | 0.887 | 16% | **84%** |
| **bottom** | **0.372** | 18% | 82% |
| submission | 0.500 | 18% | 82% |
| *adaptive* | *0.800* | *57%* | *43%* |

A striker and a wrestler underneath are **equally keen to leave** — 0.909 against 0.887 — and are not
going to the same place. That sentence could not be said before: the only way to ask for the sweep was
`scramble`, which also meant *and I do not mind being here much*, so a wrestler could not be given a
wrestler's exit at a striker's urgency. The unplanned rate is still 0.800, which is the neutral F1
measured, carried through a change of field.

#### The vocabulary, un-bunched

Three of the old five sat in an exit band of 0.816 to 0.909 — `standUp`, `scramble` and `recover`,
separated by nine hundredths on an axis that has now left this field. What is left spans the work
axis end to end:

| `bottomIntent` | submission | defend | what it buys |
| --- | --- | --- | --- |
| `attack` | **91%** | 9% | the finish, and the position it costs |
| `defend` | 17% | 83% | frames, hand-fighting, denying the pass |
| `recover` | 9% | **91%** | and a **fifth off the fatigue** of every beat |

`recover` earning its place is D6. It used to be a softer `standUp` — 0.816 against 0.909 and within a
point of it on everything else — so it was a word rather than an instruction, and D4 took away the
only axis it differed on. It now buys what the word means: `accrueFatigue` has taken an `intensity`
since it was written and nothing had ever asked a *plan* for one. `recoveryIntensity` is the only
place in the engine that reads it per fighter rather than per position, and that is the point — it is
what a plan can do about the tank. The price is in the alignment: he threatens nothing while he does
it.

#### What it cost: nothing, measured

Every alignment reads exactly 1 at zero urgency and `recoveryIntensity` returns 1 unless it was
asked for, so the roster the sport is calibrated on is untouched. Over four matchups at both fidelity
levels — control seconds, clinch seconds, distance seconds, knockout rate, submission rate and mean
end round — the numbers are **bit-identical** before and after. The golden fingerprint did not move.

#### Two tests that were right about the claim and wrong about the field

Both are worth recording, because they are the rule working rather than the change breaking:

- **`styles.test.ts` — wrestling against jiu-jitsu now separates.** The assertion said whatever
  same-family pair clears must come from the *striking* family, with a comment naming the grappling
  pair as below the bar. D4 is exactly the reason it was: `preferredState` offered `top` and
  `submission`, both of which mean *get it to the floor*, and the only field that could say *and I
  mean to be underneath* was doing two other jobs. The two arts stop being the same instruction with
  different attributes.
- **A clock claim in the new suite that is simply false.** *A man who asks to be underneath spends
  more of the fight underneath* — measured, 59.8% against 62.3% the other way. Two mechanisms pull on
  that number and only one is this instruction: fewer escapes make each episode longer, but a bottom
  preference also reads `takedown` 0.35 on the standing list, so he shoots more and shooting lands
  him on top. The second effect is larger. The claim lives at *seconds per episode*, and the draft
  that asserted it on the fight clock was docs/01's own rule biting on a test rather than on the
  engine.

#### What D7 inherits

The bottom in-state list was the worst surface in the engine at **0.11** under side control — a
20-to-30:1 capability gap against an intent range of seven to one, so whatever he was told, once he
was passed he framed. Three intents spanning the work axis lift it to **0.52–0.82** without touching a
capability. Still ∞ in guard, where the two candidates carry identical capability and the plan decides
everything, and the `0.05` literal is still there. D7 is where that gets dealt with; it now starts
from a much smaller problem.

#### The gap this leaves, stated rather than papered over

**There is no entry to the bottom.** The grappling entries are all routes to the top — shoot, chain,
tie up, throw — and the engine has no pull-guard. A bottom preference therefore takes the floor by
whatever route it can and gets where it wants when the position turns over, which is honest and
incomplete. Inventing an entry would be inventing a mechanic, and that is not what a vocabulary pass
is for.

*Enforced by* `tests/statistical/bottom-vocabulary.test.ts`, fifteen assertions swept over five seed
salts.

*The original finding follows.* `preferredState: 'submission'` conflated "get it to the floor and hunt
from either position" with "fight off my back", which are different fighters.

### D5 — Positional risk is not expressible *(was F7)*

Unchanged, and more relevant than it was: F1 added axes for risk to apply to. Doc 05 records that
positional risk was folded into `topIntent` because "`control` against `advance` *is* that axis asked
where the fighter actually chooses" — true while the ground was the only position with a behaviour
layer, and false as soon as the clinch and standing get one. Depends on D3.

### D6 — The bottom instructions are bunched *(was F3; **done**, with D4)*

Shipped as one change with D4 — see above for the measurement. In short: the five values were three
questions wearing one hat, `recover` differed from `standUp` by nine hundredths on an axis that has
since moved to `preferredState`, and it now differs by a fifth of the fatigue of every beat instead.

*The original finding follows.*

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

### D11 — Reduced books no clinch control at all *(found during D10; **done**)*

**Built.** `resolveRound` now partitions the control it already computes into a tie-up share and a
floor share, from three terms read off the tables `simulate.ts` already uses. It does **not** add a
clinch phase.

`clinchControlSeconds` was never written by `resolveFightByRound`: 0.00 for every fighter in every
Reduced fight, while Full books 18% of an unplanned fighter's control time on the fence and 32% of a
clinch fighter's. Reduced had one control number and no notion of *where* the control happened.

#### Which of the four it was

The brief asked whether Reduced omits the clinch as a state, folds it into generic control,
approximates only clinch takedowns, or has the ingredients and never accounts for the clock. Grepping
the resolver, the clinch appeared in exactly **three** places, all of them inside `controlPull`:
`tendencies.fenceClinch` as one of four entry tendencies feeding `wants`, and `clinchOffence` /
`clinchDefence` added to `groundControl` / `scrambling` in the `hold` term.

So it is the second and the fourth together: **folded into generic control, with the ingredients
present and the clock never accounted for.** And the folding is not neutral — it actively
mis-attributes. Measured before the change, a clinch plan gave Reduced *more ground control than a
top plan did* (444.6 seconds a fight against 438.1), where Full gives it far less (172.5 against
287.8). A clinch fighter did not merely lose his tie-up in the accounting; he was reported as a
top-position grappler.

It also reaches the career layer. `lessonFrom` reads `controlSeconds − clinchControlSeconds` to decide
whether a beaten fighter's hole is *scrambling*, so every career built in a Reduced-simulated world
was diagnosed on the assumption that all of its control happened on the floor.

#### The decomposition

1,200 fights a cell. `F` is Full, `R` is Reduced, before the change:

| axis | F neutral | F clinch | F outside | F top | | R neutral | R clinch | R outside | R top |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1/2 clinch entries won / fight | 1.65 | 2.59 | 0.65 | 1.05 | | — | — | — | — |
| 2 clinch breaks / fight | 0.59 | 0.62 | 0.41 | 0.66 | | — | — | — | — |
| 3 clinch control sec (his) | 35.8 | 69.7 | 14.4 | 17.9 | | **0.00** | **0.00** | **0.00** | **0.00** |
| 3 clinch control sec (theirs) | 10.4 | 12.4 | 5.5 | 9.4 | | **0.00** | **0.00** | **0.00** | **0.00** |
| 4 clinch sec per entry won | 21.7 | 26.9 | 22.3 | 17.0 | | — | — | — | — |
| 5 sig strikes landed / fight | 13.8 | 17.3 | 13.3 | 14.2 | | 15.7 | 17.9 | 16.1 | 16.5 |
| 6 takedown attempts / fight | 4.9 | 4.6 | 2.0 | 8.1 | | 4.1 | 6.3 | 1.6 | 6.2 |
| 7 escapes attempted / fight | 1.07 | 0.95 | 0.58 | 1.15 | | — | — | — | — |
| 7 ref separations / fight | 0.75 | 0.95 | 0.25 | 1.52 | | — | — | — | — |
| 9 ground control sec / fight | 173.6 | 172.5 | 66.0 | 287.8 | | 248.8 | **444.6** | 60.4 | 438.1 |
| 9 clinch share of fight clock | 9.5% | 15.8% | 7.1% | 4.6% | | 0% | 0% | 0% | 0% |

Axes 1, 2, 4 and 7 do not exist at round granularity at all: there is no entry event, no episode and
no break, because there is no tie-up state to enter, hold or leave. Axes 5 and 6 exist but are
generic — a clinch strike is a strike and a clinch takedown is a takedown. Axis 3 and 9 are the ones
that could be answered and were not.

#### What was added, and what deliberately was not

A **partition**, not a phase:

```
clinchControlSeconds = controlSeconds × clinchShareOfControl(a, d)
```

`controlSeconds` is untouched, so nothing is created and nothing is counted twice — the takedowns and
strikes that same control already paid for are exactly as they were. Verified rather than asserted:
across four plans and three matchups, `controlSeconds`, takedown attempts, strikes landed and
knockout counts are **bit-identical** before and after, and `clinchControlSeconds ≤ controlSeconds`
in every fight.

The share is three terms, each read off a table Full already uses and each worth exactly **1** to a
fighter with no plan:

| term | what it asks | clinch plan | outside | top |
| --- | --- | --- | --- | --- |
| `clinchLean` | of the grappling he wants, how much is aimed at the fence — a *transition* | 1.51 | 0.93 | 0.65 |
| `clinchPersistence` | having got there, keep the tie-up or convert it — an *in-state* decision | 1.41 | 1.07 | 0.38 |
| retention | and can he hold it — a *contest*, not a preference | — | — | — |

The two intent terms are combined as a **geometric mean rather than a product**, and that is not a
softening. Both are read off `preferredState`, so the fighter who routes to the fence is by
construction the same fighter who stays on it, and multiplying them charges for one preference twice
— the error `STANDING_ALIGNMENT` already warns about in its own header. Each table alone gets one end
of the range and misses the other: `clinchLean` separates an outside plan from a clinch plan and puts
a top-position fighter at 11.7% against Full's 6.4%; `clinchPersistence` gets that one right and has
a clinch plan at 25.3% against Full's 31.8%. Together, geometrically:

| | Full | Reduced |
| --- | --- | --- |
| unplanned | 18.0% | 17.5% |
| clinch plan | 31.8% | 25.1% |
| outside plan | 18.2% | 17.3% |
| top plan | 6.4% | 8.9% |

**What is deliberately absent.** There is no clinch phase, so clinch striking and clinch takedowns
stay folded into the generic ones, and axes 1, 2, 4 and 7 remain unrepresented. That is a magnitude
limitation and it is stated rather than approximated: a `clinchSecondsModifier` fitted to Full's
numbers would have produced the same table and taught the resolver nothing.

#### Where desire stops and the fighters start

The acceptance brief asked that capability affect success and retention **more than raw desire to
attempt**. Measured at Full first, because the obvious phrasing turns out not to be what Full does:

| quantity | intent span | his capability | the opponent |
| --- | --- | --- | --- |
| clinch seconds a fight | **5.6:1** | 1.9:1 | — |
| share of his control that is tie-up | 1.75:1 | 1.39:1 | 1.56:1 |
| whose tie-up it is (his ÷ theirs) | 3.3:1 | 3.7:1 | 3.4:1 |

So on **how much** tie-up there is, desire wins and always did — that is invariant 1's ordinary shape,
the plan owning the attempt. On **whose it is**, capability wins by twelve to one against three. Both
statements are now asserted, at both levels, and the criterion is honoured on the half of it that is
true rather than forced onto the half that is not.

One bound moved during that work and the reason is worth keeping. The ownership ratio is the intuitive
number and the wrong one to bound, because it multiplies this mechanism by how much total control each
plan bought — which is D10's machinery, and where Reduced's remaining magnitude gap lives. Bounding
the compound measures that gap and calls it this one; on one seed salt in five it failed for exactly
that reason. The assertion sits on the share, which is what `clinchShareOfControl` actually computes.

#### The residual, named

Reduced still over-credits a clinch plan with *total* control: 444.6 seconds a fight against Full's
242, because `grapplingAppetite` averages `takedown` and `clinchUp` and cannot tell a fence entry from
a level change. The partition puts that time in the right column and does not shrink it. It shows up
as the one clinch claim that has to be asserted on the share rather than on seconds — wanting the
floor moves Full's clinch time down 45% and Reduced's down 1%, because Reduced's top-plan control
total runs 1.9 to Full's 1.5 and cancels the share drop.

It is a magnitude gap with the direction intact, which is what invariant 6a allows, and it belongs to
whatever eventually gives `grapplingAppetite` two routes instead of one — most likely D3, which is
now unblocked.

#### What it cost

Nothing on the level and nothing on the sport: `controlSeconds` is bit-identical, no constant was
retuned, the D10 directional guards are green, and the whole existing suite passes with no allowance
widened. The one behavioural consequence is in the career layer, and it is a correction: `lessonFrom`
now sees a Reduced fighter's fence time as fence time, so it stops diagnosing *scrambling* as the hole
in fights that were spent against the cage.

*Enforced by* `tests/statistical/reduced-clinch.test.ts` for the partition and the authority split,
and three more claims in `tests/statistical/reduced-direction.test.ts` for the direction.

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

### D13 — The controlling fighter in a clinch cannot let go *(found in the D3 re-audit; **done**)*

**Built with D3**, and the design was D2's transposed without amendment: a fourth candidate in the
same flat list, keyed on `preferredState` through the existing `CLINCH_EXIT` table, `clinchDefence`
against `clinchOffence` for the contest, the beat consumed either way.

Measured: a fighter who wants the fight at range releases a tie-up he is holding on **18–33%** of his
controlling beats depending on what else he was told to do with it, one who came for the clinch on
**3.7%**, and one with no instructions at all on 11.6%. The release share never exceeds 5% for any
fighter who wants to stay, which bounds what it can have taken off the other three. Success runs 51%
to 66% across a full sweep of the three ratings `clinchDefence` is built from, against an attempt
rate that moves by a third — plan owns the attempt, the two fighters own the outcome.

Two details worth keeping. `clinchOffence` deliberately does **not** appear on the actor's side: being
good at holding people is not what gets you away from them, and letting it in would make the fighters
who least want to leave the best at leaving. And the range it books is `boxing`, the same as the held
man's break, because two men who are both already standing when they separate are within arm's reach
however it happened — what differs is the stickiness, 0.45 against 0.35, because this man picked the
moment and is balanced when the space appears. That is *how the separation happened* reflected in the
mechanism it actually changes, rather than in a range label.

**What could not be modelled, stated rather than invented:** whether either man has his back to the
fence. `FightState` knows they are tied up and not where in the cage they are — the same gap the top
disengage records on the floor.

*The original finding follows.*


D2's sibling, one position over, and it went unnoticed because the *held* fighter's exit is so
prominent. `resolveClinch`'s controlling branch offers a takedown, a strike and the position, and no
way back to the feet. A striker who ties somebody up — or who is *given* the tie-up when his opponent
fails a reversal — plays clinch MMA until the referee, the other man, or the bell releases him.

The fix is D2's, transposed: a fourth candidate in the same flat list, keyed on `preferredState`
through the existing `CLINCH_EXIT` table, with `clinchDefence` against `clinchOffence` as the contest
and a `TRANSITION_RANGE` entry that reflects how the separation happened. It is small, it belongs in
the same file as D3, and it should be built with it.

### D14 — Reduced collapses the two grappling entries into one appetite *(found in the D3 re-audit)*

`grapplingAppetite` averages `standingBias(takedown)` and `standingBias(clinchUp)`, so Reduced cannot
tell *"I want the fence"* from *"I want the floor"* — a distinction the vocabulary makes in full and
the resolver then discards. Measured: a clinch plan buys Reduced 444.6 seconds of control a fight
against Full's 242, and the top plan it should sit well below (438.1 against Full's 306) instead sits
level with it.

D11 put that time in the right column and did not shrink it, which is the honest split of the two
findings: **D11 was about *where* the control is reported, D14 is about *how much* of it a fence-first
plan should buy.** It is not a D11 blocker and it must not be papered over with a local Reduced
multiplier — the shape of the fix is two appetites where there is now one, with the `hold` term
weighted by which route dominates, because a fence hold is shorter-lived than a floor hold.

Architectural debt against the transition-intent vocabulary, and the natural place to pay it is
alongside whatever next touches `controlPull`.

### D15 — A tie-up costs both men the same *(found in the D3 re-audit; **done**)*

**Built with D3.** `accrueFatigue` now reads the `isControlled` it has been computing for the clinch
all along: `CLINCH_HELD_COST = 1.4`, applied the same way `GROUND_BOTTOM_COST` is applied on the
floor. `POSITION_COST` is untouched, so the tie-up remains the most expensive place in the fight for
both men, which it should be and already was — the earlier note calling that an oddity was wrong, and
this corrects it.

Calibrated against the analogous ground distinction rather than chosen: side control charges the man
underneath 1.5× the man on top, and the fence charges 1.4× — a little less, because a man on the
fence still has his feet under him and can hand-fight, which is more than a man under side control
has.

**The payoff, isolated.** Toggling the constant alone, 800 fights of an 84-strength clinch fighter
against a better boxer:

| plan | `CLINCH_HELD_COST` 1.0 | 1.4 |
| --- | --- | --- |
| clinch / `control` | 72.5% | **78.0%** |
| clinch / `damage` | 78.8% | 81.0% |
| boxing / `counter` | 74.0% | 74.9% |
| outside / `movement` | 60.9% | 61.6% |

Five and a half points to the plan that holds people and under a point to the plans that do not,
which is the shape a positional attrition term should have. The opponent's *first*-round output falls
with it, 17.5 attempts to 16.4, because he is carrying weight from the opening minute. Without this,
`clinchIntent: 'control'` would have bought clock and judges' points and nothing else.

That experiment is documented rather than asserted, because separating it inside a test would mean
toggling the constant, which a test cannot do — so the suite asserts the mechanism exactly (a second
of being held costs 1.4 seconds of holding) and the docs carry the behaviour. Asserting a behavioural
claim a fixture cannot carry is the mistake docs/01 § 6b exists to stop.

*The original finding follows.*


`accrueFatigue` computes `isControlled` for the clinch and then never reads it: `GROUND_BOTTOM_COST`
is applied only when `position === 'ground'`. Measured over sixty seconds for an average fighter:

| position | holding | being held |
| --- | --- | --- |
| ground, side control | 0.158 | **0.237** |
| clinch | 0.199 | **0.199** |

Being held on the floor costs half again as much as holding; being held on the fence costs exactly
what holding costs. Two consequences. First, `control` as a `clinchIntent` would buy clock and judges'
points but no attrition, which is most of what pinning a man on the fence is *for*. Second — and this
is the part that reads as a defect rather than a gap — holding a tie-up is currently more tiring than
holding side control (0.199 against 0.158), so the engine charges a grinder more for the cheaper
position.

Not scoped here: it is a sport-wide calibration change with its own evidence, and it wants measuring
against Full's fatigue curves rather than bundling into a vocabulary change. It is a **prerequisite
for `clinchIntent: 'control'` being a real strategy rather than a stalling one**, and it is related to
D9.

## 3b. The register re-ranked, after D3

Measured against the shipped engine rather than argued from the previous ranking. Two things moved
materially and one finding changed shape entirely.

### D7 stopped being an engine-wide problem and became a bottom-position one

The authority landscape at full conviction, across six plans and eight surfaces:

| surface | before D3 | now |
| --- | --- | --- |
| distance | 2.11 – 4.82 | 2.11 – 4.82 |
| clinch, held | 2.09 – 4.18 | **4.53** (flat) |
| **clinch, controlling** | **0.56 – 1.35** | **1.38 – 2.05** |
| bottom work, guard | ∞ | **∞** |
| bottom work, side control | 0.11 | **0.11** |
| bottom exits | 2.15 – 5.91 | 2.15 – 5.91 |
| top | 1.10 – 1.60 | 1.10 – 1.60 |

The finite spread is still 0.11 to 5.91, and reporting that as "unchanged" would miss what happened:
**one of the two low ends is gone and the other is now unambiguous.** Every remaining pathology is in
one function.

`bottomWork` returns two candidates, and its submission row reads `submissions × 0.8` in guard and
the literal `0.05` everywhere else, beside a `defend` row at `scrambling × 0.8`. So the same list
gives the plan *everything* in guard — identical capabilities, authority ∞ — and *nothing* under side
control, where a 20-to-30:1 capability gap faces an intent range of about seven to one. Whatever a
fighter was told, once he has been passed he frames.

That reframes D7's dependency. It was ranked behind D1–D5 because every list those touched was a list
D7 would otherwise calibrate twice. Three of those are now shipped, the clinch lists are done, and
what is left of D7 is almost entirely the bottom in-state list — which is **D4 and D6's territory**,
not D5's. D7 now depends on the bottom vocabulary and on very little else.

### D5 shrank further than the re-audit expected

D3 absorbed the clinch slice, as predicted. But the register entry claims the ground slice too, and
the measurement does not support it: `topIntent` already carries positional risk on the floor —
`control` against `advance` is *accept a scramble to improve position*, and `submit` is *accept a pass
to hunt the finish* — and `bottomIntent` carries it underneath, `attack` against `playGuard`. Doc 05's
original note said this was true "while the ground was the only position with a behaviour layer".
Every position now has one, and each of them expresses its own positional risk.

What is genuinely left of D5 is **standing** risk — there is no way to say *accept being countered to
close distance*, which is the striking equivalent — and that is a much smaller finding than the one
that was ranked. It should be re-scoped or folded into D8, which is the other standing-entry finding.

### D8 is bigger than "`lead` is inert", and exactly measurable

All four *standing* entry styles produce **identical** shares on the distance list — strike 41.9%,
kick 21.4%, takedown 20.5%, clinch 16.1% — because `entryWeight` switches only on the four grappling
entries and the rest fall through to 1. Tracing every place `entry` is read:

| entry | `entryWeight` | `groundDenial` | `isCounterFighter` | clinch takedown |
| --- | --- | --- | --- | --- |
| `pressure` | — | 1.35 / 0.85 | — | — |
| `movement` | — | 0.80 / 1.30 | — | — |
| `counter` | — | — | **yes** | — |
| **`lead`** | — | — | — | — |
| `proactiveWrestling` | 1.5 / 0.75 | — | — | — |
| `clinchEntries` | 0.6 / 1.85 | 1.25 / 0.90 | — | — |
| `tripsAndThrows` | 0.5 / 1.95 | — | — | **1.6×** |
| `reactiveShot` | 0.9 / 0.70 | — | **yes** | — |

`lead` is the only value in the entire tactical vocabulary that reaches nothing at all. That is the
finding, now with a table behind it, and it is a cleanup rather than an architectural change: the row
needs a mechanism, and *taking the initiative first* most naturally lands on the range beat and on who
throws first, neither of which it currently touches.

### D6 is no longer an alias, and is now a crowding problem

F1 gave the five bottom instructions distinct behaviour, and they are distinct:

| `bottomIntent` | exit urgency | exits (standUp / sweep) | in-state (submission / defend) |
| --- | --- | --- | --- |
| `standUp` | 0.909 | 87 / 13 | 17 / 83 |
| `scramble` | 0.876 | 42 / 58 | 42 / 58 |
| `recover` | 0.816 | 69 / 31 | 16 / 84 |
| `playGuard` | 0.415 | 33 / 67 | 56 / 44 |
| `attack` | 0.372 | 33 / 67 | 90 / 10 |

`recover` is not an alias of `standUp` any more — it is a softer one, and on the in-state axis the two
are within a point of each other. Three of the five instructions sit in an exit band of 0.816–0.909.
So the finding survives with a different complaint: not *two values mean the same thing* but **the
vocabulary is bunched at one end**, and `recover` in particular has no mechanism of its own. The
obvious place for it to acquire one is D9 — *what changes when the tank is empty* is precisely what
"recover" should mean, and D15 has just given the tank something to say.

### D14 confirmed as predicted: consequence reduced, cause untouched

`grapplingAppetite` is **identical** across `clinchIntent` at a fixed preference, because it averages
two `preferredState` rows and nothing else:

| plan | `grapplingAppetite` | `clinchLean` | `clinchPersistence` |
| --- | --- | --- | --- |
| clinch / control | 2.819 | 1.557 | 1.817 |
| clinch / takedown | 2.819 | 1.557 | 0.239 |
| top / control | 3.167 | 0.614 | 1.817 |
| top / takedown | 3.167 | 0.614 | 0.239 |

A clinch plan and a top plan still arrive at `controlPull` as 2.82 against 3.17 — nearly the same
number for two fighters Full separates by a third of the fight. What D3 bought is the third column:
the *split* of that control is now fully steerable, 7.6:1 across the intent. Exactly the split of the
two findings the re-audit predicted, and D14 is unchanged in substance.

### The ranking

| # | finding | kind | depends on | why here |
| --- | --- | --- | --- | --- |
| **D4** | no `bottom` desired state *(**done**)* | architectural (vocabulary) | — | the bottom vocabulary gates D6 and now gates D7 |
| **D6** | the bottom instructions are bunched *(**done**, with D4)* | behavioural | D4 | same vocabulary, same pass |
| **D7** | authority is not comparable | calibration | D4, D6 | now one list, at the far end of that vocabulary |
| **D9** | no badly-fatigued situation | additive | D15 *(done)* | gives `recover` a mechanism; unblocked by D15 |
| **D8** | `lead` is inert *(+ what remains of D5)* | cleanup | — | independent; the standing-entry pass |
| **D5** | standing positional risk *(re-scoped, much smaller)* | architectural | — | fold into D8 unless it grows |
| **D14** | Reduced collapses the two grappling entries | architectural (Reduced) | — | deferred |
| **D12** | Reduced under-produces standing knockdowns | calibration (Reduced) | — | deferred |

The change from the previous ranking: **D4 and D6 move ahead of D5**, because D7 — the finding with
the most effect on the sport — now depends on the bottom vocabulary rather than on positional risk;
D5 drops and shrinks; D9 rises because D15 unblocked it; D8 gains a table and stays a cleanup.

*Measured, not implemented.* **D4 and D6 have since shipped as one vocabulary pass** — see the
D4 section above for what moved and what it cost. D7 is next, and starts from a much smaller
problem than the one measured here: the bottom in-state list lifted from 0.11 to 0.52–0.82 under
side control without a capability being touched.

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
