# 15 — Design Review: Synthesis

> Status: adjudicated. Docs 12, 13 and 14 have been revised to match this document.
> Where this document and an earlier draft disagree, this document wins.

Docs 12–14 were reviewed by two independent critics with deliberately opposed briefs: one
judging **realism** (does this resemble how the sport actually works?), one judging
**gamification** (is there a decision here, and is it fun?). This document records what they
found, where they agreed, where they conflicted, and — the part that matters — what was
decided and why.

The point of the exercise is that neither reviewer gets to win by default. A design that is
only realistic is an accounting package; a design that is only fun is a slot machine.

## Where they converged

Convergence from opposed briefs is the strongest signal available, and it was acted on
without argument in all four cases.

### 1. Reverse-order card simulation was wrong

**Fun**: simulating prelims first means eight fights of dead time before the player's own.
**Realism**: it also fails on its own terms — when the player is *on* the prelims, they watch
their fight and then sit through the whole main card as a spectator.

**Decided.** The player's fight is always the detailed one, wherever it sits on the card. The
rest of the night arrives as a results feed that streams in around it — bouts before theirs
resolve first and are readable on arrival, bouts after theirs resolve once it is done. Any
bout can be expanded into full play-by-play on demand, which is the difference between "the
game showed me eight fights" and "I chose to watch two of them".

### 2. There must be a bonus pool

Both reviewers proposed this independently, which is close to conclusive. Fight of the Night
and Performance of the Night are how a prelim fighter doubles their pay, and they are the
mechanism that makes an exciting loss worth something — a genuinely important thing for a
game that otherwise only rewards the hand being raised.

**Decided.** A per-card bonus pool, sized by the promoter, awarded by the simulation on
actual fight events rather than on a die roll.

### 3. Per-card purse-setting had to go

**Fun**: setting fifteen purses per card is unplayable by card three.
**Realism**: purses are contractual. A promoter does not decide a fighter's pay the week of
the event; they decided it when they signed them.

**Decided.** Purse negotiation moves to contract time, where it is a real negotiation against
a real personality, and happens perhaps twice a card rather than fifteen times. At card time
the only money decisions are the bonus pool and where the marketing spend goes. This is both
more accurate *and* less tedious, which is what a good constraint looks like.

### 4. Coach mode as drafted was "press train, wait"

**Fun**: the loop as written was a focus dropdown with a fight attached.
**Realism**: the actual mechanism of a fight camp is who you put in the room — sparring
partners, styles mimicked, bodies to grind against.

**Decided.** These are the same fix. A camp becomes 3–4 **beats**, and the central decision in
each is room composition: who spars whom, and how hard. See doc 14.

## Where they conflicted, and the rulings

### Gym economics

**Realism (M7)**: gyms are not funded by purse percentages. They are funded by memberships —
by the hobbyists at the 6pm class. A gym living off fight purses would close inside a year.

**Fun**: true, and also a wage-bill simulator is not a game. Coach mode needs the money to
create a *decision*, not a monthly subtraction.

**Ruling — both, joined at the hip.** Gym income is membership-driven, and membership is
driven by public profile. That converts the realistic funding model directly into the mode's
best decision: *the fighter who wins is not always the fighter who fills the 6pm class.* A
charismatic 8-5 local who does seminars pays for the building. A sullen 15-1 contender does
not, and pays you in reputation instead. Choosing between them, with limited slots, is coach
mode's version of the promoter's triangle.

### Bankruptcy

**Fun**: a hard game over after forty hours is a punishment, not a mechanic. There needs to
be a bounce.

**Realism**: promotions rarely go bankrupt in the way a shop does. They lose their television
deal, and then they get bought, or they shrink to a regional operation, or the owner sells.

**Ruling — realism supplies the mechanism, fun supplies the outcome.** The failure state is
**losing the rights deal**, visible several cards in advance and recoverable. If you cannot
recover, the consequence is acquisition or demotion to a lower tier with your best fighters
stripped — you keep playing, poorer and smaller, with your former roster fighting on
television for the company that bought you. That is worse than a game over screen in every
way that matters.

### How live coach mode should be

**Fun** wanted a round-by-round corner minigame with real leverage.
**Realism** pointed out that a corner has sixty seconds and a fighter who may not be
listening, and that overstating the corner's power is one of the most common sim errors.

**Ruling — largely realism, and I overrule the fun brief here.** Cornering stays one
instruction per round, and whether it lands depends on `cornering` and `gamePlanAdherence`.
The reason is that coach mode's whole thesis is *you cannot control the thing you are judged
on*; handing the player a reliable in-fight lever would refute the premise of the mode. The
tension is answered instead at camp time, where the coach genuinely does have leverage.

## The largest shared hole: managers

**Realism (M6)** flagged that managers and agents appear in none of the three documents, and
this is the single biggest omission across all of them. It is right. Fighters do not
negotiate their own contracts, do not choose their own opponents unaided, and a manager with
a stable of fighters is a real power centre that both a promoter and a coach have to deal
with.

**Decided — added as a cross-cutting layer**, not a fourth mode:

| Mode | What the manager is to you |
| ---- | -------------------------- |
| Fighter | Your negotiator. A good one gets better purses and better matchups; a bad one takes fights that get you hurt. Choosing and firing them is a real decision |
| Promoter | The person actually on the other side of every negotiation. Managers with several of your fighters have leverage and use it |
| Coach | A rival influence on your fighter. The manager wants the payday; you want the right fight. When you disagree, the fighter chooses |

That last row is worth the whole feature by itself: it gives coach mode an antagonist who is
not a cartoon.

## What was rejected, and why

Not every note survived. Rejecting well is part of the job.

| Note | From | Ruling |
| ---- | ---- | ------ |
| Model outfitting/sponsorship policy in detail | Realism | **Rejected.** Accurate, and it produces no decision. Texture without a choice is cost |
| Let the promoter fix fights and lean on judges | Fun | **Rejected for now.** Genuinely interesting, but modelling it fairly is a large piece of work and modelling it unfairly is worse than omitting it. Stays an open question in doc 13 |
| Full commission/licensing/medical-suspension paperwork | Realism | **Reduced.** Medical suspensions already exist via `readinessDelay`. The paperwork around them is not a game |
| Card-by-card ticket pricing | Fun | **Rejected.** It is a slider that has one correct answer per card, which is the definition of false choice. Venue and broadcast model carry that decision instead |
| Weekly gym-membership management screen | Fun | **Rejected.** Membership is an *outcome* of who is on the roster and how they are perceived, not a thing to be micromanaged. It should be a number the player affects, not a screen they visit |

## What must never happen — across all three modes

These are the consolidated failure conditions from both reviews:

- **A dominant strategy.** If one line of play wins in any mode, the design has collapsed.
- **A decision with one correct answer.** Sliders that always want to be at maximum are not
  decisions, and every reviewer found at least one.
- **Realism that produces no choice.** If the accurate version of a system is a subtraction
  the player watches happen, model it as a consequence rather than a screen.
- **Fun that requires a lie.** If a mechanic only works when the sport is misrepresented, it
  is the wrong mechanic — there is almost always a true one nearby that works better.
