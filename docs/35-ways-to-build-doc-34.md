# 35 — Ways to build doc 34

**Status:** decision document. Nothing implemented. Companion to
[34 — signing, ambition and the climb](./34-signing-ambition-and-the-climb.md), which describes
*what* should exist; this one describes *how*, at four different sizes, and records what three
independent reviews found wrong with doc 34 on the way.

> **The short version.** Doc 34 proposed twelve weights, two utility functions and eleven phases.
> Three reviews — realism, systems design, and game design — each produced their own candidate
> implementations, then cross-reviewed and converged. They converged on something smaller and
> differently shaped than doc 34 proposed:
>
> - **The spine is a price in pounds, not a weighted sum.** `money.ts:172 askingPrice` already
>   exists, already applies `purseDemand` and `reSignDiscount`, and has never been called. Doc 34's
>   twelve weights become multipliers on one number with a unit — which is cheaper to build, far
>   cheaper to tune, and satisfies doc 16's "always a price, never a wall" literally rather than by
>   analogy.
> - **`handling` is derived at the read site, never written.** A stored plan is exactly the derived
>   state doc 34's own rules forbid, it cannot express doc 26's unsigned fighters, and an AI writer
>   would stamp over the human promoter's own choices.
> - **Two things must come first, and neither is in doc 34's phasing.** An idle world fighter's
>   bank cannot move, so nobody is ever broke and half the design has no population to act on. And
>   no test in the repo drives `advanceWorld` on the default era, so doc 34 §19 cannot be measured
>   at all.
>
> **Route 0 has since shipped and is verified — see §0.** The down-to-up ratio went from 2.01:1 to
> **0.69:1**, lateral churn from 65% to 30%, and a regional starting cohort now puts 132 fighters
> into a major or the global promotion across a decade where it managed four. What remains open is
> the *volume* of movement, which nobody has examined.
>
> **And one thing all four of us missed.** Doc 34 was written from an essay about how fighters
> decide, but the concern that prompted it was that fighters do not *move between promotions*.
> Measured (§1.5), that turns out to be the opposite of what is happening: there are ~300 moves a
> year, running **two down for every one up**, with 65% pure lateral churn — because
> `resolveFreeAgency` picks a fighter's next promotion with a **uniform random draw** over a pool
> that is five-eighths regional. In ten years, **zero** fighters who started regional reached the
> global promotion, and **82 of 152** who started at the top ended up regional. None of the routes
> the reviewers converged on touch this. **Route 0** does, and it is one function's selection step.

## How this document was produced

Three reviewers were each given doc 34 and the source, told to verify rather than trust, and asked
for 4–6 candidate implementations spanning minimal to maximal. They then exchanged positions and
ruled on the conflicts. Every source claim reproduced here was independently checked at the named
line before being written down — including one an agent overclaimed, noted in §1.3.

---

## 1. What the reviews changed

### 1.1 Doc 34's audit was wrong in eight places

All eight are recorded in doc 34's own corrections block and verified at the named lines. The three
that change what is cheap and what is not:

| Correction | Consequence |
| --- | --- |
| `Fighter.handling` is written by the player, not by nobody (`PromoterRosterScreen.tsx:129-132`) | §5 is *parity* — giving the AI a control the player already has, with vocabulary already built and rendered |
| The blocking offer inbox item already exists (`world.ts:1955-1995`) | §9's phone call is an existing item with two fields changed, not a new mechanic |
| A reservation price already exists (`money.ts:172 askingPrice`, test-only callers) | §3's utility function has a cheaper alternative shape — see approach E |

### 1.2 Two defects doc 34 did not find at all

**An idle world fighter's bank cannot move.** `world.ts:1046` computes
`net = gross * 0.35 - campCost(8, 55)` — a flat multiplier and a camp at a gym they do not train at
— and it runs *only inside fight resolution*. There is no per-tick living cost for fighters
anywhere; `livingCostPerMonth` (`money.ts:254`) and the real `netPurse` breakdown are player-only,
reached through `app/src/game/money.ts:187`.

So being out of the cage is free, and only fighting can cost you money. That is the inverse of the
sport, and it has a specific consequence for doc 34: `solvency(bank, campCost)` flips on `bank < 0`,
world banks move only by a constant tied to purse size, and purse size is tied to promotion tier —
so **`solvency` today is a tier check wearing a costume.** Wire `desperationDiscount` onto it and
small-show fighters accept everything for reasons that have nothing to do with being broke. Doc 34
§19.3 ("a broke fighter takes fights a solvent one refuses") and §19.5 (journeymen) would both pass
for entirely the wrong reason, and §19.5's stated target — *rising* bank balances — is currently
satisfied by every fighter in the world, because banks only ever rise.

**Grievance is laundered on every re-signing.** `world.ts:1234` sets `resentment: 0` whenever a
world fighter signs, so the one situation term `acceptanceOf` already has can never accumulate
across deals.

### 1.3 One agent claim that did not survive checking

The systems reviewer reported `netPurse` as a second test-only function. It is not: it has a
production caller at `app/src/game/money.ts:187`. The true statement is the asymmetry above — the
player's money runs through `netPurse`, world fighters' does not. Recorded because this document's
whole method is that a claim is worth what its verification is worth.

---

## 0. Status: Route 0 has landed, and it worked

**Written before `50d1c1a`; verified after it.** Route 0 (§4) was specified here and then
implemented independently on master by `50d1c1a` — "One market for offers, a floor under generated
divisions, and a tape that does not know the result" — which arrived at the same diagnosis from the
same evidence. Its own comments record the symptom this document measured: *"over five simulated
years the leader went from 204 fighters to 57"*, against §1.5's finding that 82 of 152 fighters who
started at the top ended up regional.

What it changed, all of which §4's Route 0 asked for:

- `fRng.pick(pool)` — the uniform draw — replaced by a step-up branch (70% take a step up when one
  is on the table), then incumbent stickiness, then a need-weighted draw over who has room.
- The `prestige <= 42 + reputation * 0.9` gate replaced by `standardOf` — the promotion's own
  signing standard against the fighter's overall rating — because reputation could not tell a
  regional journeyman from a contender (median 25–27 on every promotion but the leader's 40).
- The incumbent is always in the pool, closing the one-way valve where a fighter could not re-sign
  where they already were.
- Seeded rosters get written contracts, with implicit terms staggered across three years, so the
  roster is no longer scattered on the first quarterly tick.

It went further than Route 0 specified in one respect: division-depth weighting, so a promotion at
its roster target but two deep at 185 still signs a middleweight.

### Re-measured, same tool, same seed

`npx vite-node tools/mobility-trace.ts`, ten years, 2026 era, seed `mobility`:

| Criterion (§4's acceptance test) | Target | Before | After |
| --- | --- | --- | --- |
| Down-to-up ratio | < 1.3:1 | 2.01:1 | **0.69:1** |
| Lateral share of tier moves | < 35% | 65% | **29.6%** |
| Regional cohort reaching major or global in ten years | 15+ | 4 | **132** |
| Global cohort still global | 60%+ | 17% | **57%** |

| Started | Still active | Ended global | major | regional |
| --- | ---: | ---: | ---: | ---: |
| regional | 277 | 67 | 65 | 139 |
| major | 210 | 70 | 69 | 68 |
| global | 159 | 90 | 37 | 31 |

Three of four pass, the fourth by two points. **The ladder now runs upward**: 1,146 up-moves against
789 down over a decade, where it was 311 up against 625 down.

### What the re-measurement leaves open

Three things, none of which block anything, all of which are now the interesting questions:

1. **Retention at the top is 57%, not 60%.** Probably correct rather than a miss — under merit-based
   movement a fighter who declines *should* fall, and 90 of 159 holding a global roster spot across
   a decade is a defensible number for the sport. Recorded rather than tuned; the criterion was
   written blind, before anyone knew what good looked like.
2. **The volume of movement did not change, only its direction.** ~300 moves a year among ~850
   fighters, and 79% of fighters end the decade somewhere other than where they started — against
   83% before. Roughly a third of the sport changes promotion every year, which is a great deal more
   than the real sport does. Direction was the defect; **volume is now the open question**, and
   nobody has looked at it.
3. **Reputation still decays** — p50 26 at the start, 19 after ten years. It no longer gates
   signings, so it matters less than it did, but `standingScore` and the rankings still read it.

### What this does to the rest of this document

Route 0 is **done**. Route 3's ordering (`P1 → M → …`) becomes `P1 → …`, and P1 — the harness —
is now the only remaining prerequisite. Everything else below stands as written.

---

## 1.5 The measurement none of us took, and what it found

Doc 34 was written from an essay about how fighters and promoters *decide*. The concern that
prompted it was narrower and different: **fighters do not move between promotions as their
circumstances change.** Neither doc 34 nor any of the three reviews measured that, and all four
approach sets were shaped around decision-making instead. `tools/mobility-trace.ts` measures it —
ten years of the real `advanceWorld` loop on the 2026 era, seed `mobility`, counting where every
fighter *goes* rather than where they are.

The result inverts the premise.

| Year | Moves | Up a tier | Down a tier | Lateral |
| ---: | ----: | --------: | ----------: | ------: |
| 1 | 542 | 31 | 291 | 125 |
| 2 | 266 | 18 | 57 | 138 |
| 5 | 299 | 35 | 43 | 165 |
| 10 | 276 | 36 | 27 | 165 |

**Ten-year totals: 311 up, 625 down, 1,737 lateral.** 83% of surviving fighters end up somewhere
other than where they started.

There is not too little movement. There is a great deal of movement, and it is the wrong *shape*:
**two moves down for every one up, and 65% of all tier-classified movement is lateral churn** —
fighters bouncing between same-tier promotions for no reason anybody could narrate.

Where each starting cohort ended up after a decade:

| Started | Still active | Ended global | major | regional |
| --- | ---: | ---: | ---: | ---: |
| regional | 258 | **0** | **4** | 243 |
| major | 182 | 26 | 31 | 122 |
| global | 152 | **26** | 41 | **82** |

Two findings, and the second is the serious one:

- **The upward ladder is effectively closed.** Of 258 fighters who started regional and are still
  fighting, four reached a major promotion and *none* reached the global one, in ten years.
- **The top drains downward.** Of 152 who started at the global promotion, 26 are still there and
  **82 are now regional.** That is not a sport with a hard top rung; it is a sport whose top rung
  leaks.

### Why — and it is one line of code

`world.ts:1179-1229 resolveFreeAgency` is the third signing path (§1.1), it performs essentially
every signing in the world, and its selection step is:

```ts
const earned = affordable.filter((p) => p.prestige <= 42 + fighter.reputation * 0.9);
const pool = earned.length > 0 ? earned : affordable.length > 0 ? affordable : candidates;
const next = promotion && fRng.chance(0.55) && pool.includes(promotion) ? promotion : fRng.pick(pool);
```

**`fRng.pick(pool)` is a uniform random draw.** Merit never enters it. `offersFor`, `appetite`,
`motive`, `standingScore`, the monopsony structure and the named futures — the entire free-agency
model doc 16 specifies and this repo built — are bypassed for every fighter in the world.

And the pool it draws from is bottom-heavy by construction. Measured on the 2026 seed:

| Promotion | Tier | Prestige | Reputation needed to reach it |
| --- | --- | ---: | ---: |
| UFC | global | 97 | **61** |
| PFL | major | 68 | 29 |
| ONE | major | 64 | 24 |
| RIZIN / KSW / OKT / CW / LFA | regional | 52→36 | 11 → 0 |

**Five of eight promotions are regional.** Median reputation is 27 at the start and *falls to 20* by
year ten, so the median fighter's gate admits five or six promotions of which five are regional. A
uniform draw over that pool lands regional roughly four times in five, whoever you are — so a
lapsed contract at the top is a dice roll that usually ends two tiers down, protected only by a 55%
stickiness coin flip. That is the 2:1 downward ratio and the 1,737 lateral moves, exactly.

Only **73 of 822** active fighters ever clear reputation 61, so the top gate is shut for 91% of the
sport while the trapdoor beneath it is wide open.

Two aggravating factors, both cheap to fix:

- **No seeded fighter holds an agreement** (measured: 0 of 858). So the entire roster falls through
  to the signing branch on the first quarterly tick — which is year 1's 542 moves and 291
  down-moves. The seed roster is scattered before the player has done anything.
- **Reputation is the gate, and reputation decays.** `standingScore` already exists and already
  discounts credibility by the gap between the rooms it was earned in — it is the right input and
  it is not consulted here.

### What this means for the routes below

**Routes 1, 2 and 3 do not fix this.** They were built around doc 34's framing. Route 1 is a UI fix;
route 2 changes matchmaking *within* a promotion; route 3's price governs which *fights* a fighter
accepts, not which *promotion* signs them. Route 4 fixes it only incidentally, buried among twenty
other sections. Hence **Route 0**, below, which is new, small, and is the only one aimed at the
problem.

---

## 2. Two prerequisites

Neither is optional, neither is in doc 34's §17, and both are small.

### 2.1 P1 — The harness (`tests/long-sim/world-tick.test.ts`)

Doc 34 §19 says its criteria are "measurable on a twenty-year world". They are not measurable at
all today:

- `tests/long-sim/twenty-years.test.ts` **never calls `advanceWorld`** — it drives its own booking
  loop — so §19's criteria 1, 2, 5, 6 and 9, all of which are claims about `buildNight`, are
  invisible to it.
- The repo's only timing assertion (`living-world.test.ts:135`) runs `game()`, which defaults to the
  **2020** era of ~139 fighters. The player-facing default is 2026, at 858. §19.12 ("per-tick cost
  measured and stated") has no instrument.

**What it is:** a new long-sim file driving `advanceWorld(db, 0, 365, playerId)` on `DEFAULT_ERA`
with a fixed seed, asserting three groups —

1. **Cost, recorded rather than merely bounded.** Wall time, plus two deterministic proxies that do
   not depend on CI noise: a count of `findAll` invocations and a count of `offerOpponents` calls.
   Those two are the real complexity drivers (44 `findAll`/`findById` sites in `world.ts`, several
   inside per-bout loops). Log the exact figures so every later phase can state before and after.
2. **Chain liveness** — each currently zero, so *the file fails the day it is written*, which is the
   precedent doc 20 §4 set for its own phase 0. Non-zero counts of: `refusedBouts > 0`; fighters cut
   via refusals rather than idleness; `shortNotice === true` anywhere; `handling !== undefined` on an
   AI roster; fighters whose bank moved without fighting.
3. **Invariants that must not move** — median rating of each division's top 15, median title reign,
   median career bout count, active headcount at year 10. Their job is to turn every later movement
   into a stated diff rather than a discovery.

**Cost:** small. Estimated 25–60 s for the one-year variant, 6–15 min for a decade; on-demand tier,
not per-commit.

### 2.2 P2 — The money fix (`world.ts:1046`)

Split, and only the cheap half is required.

- **Required, ~10 lines.** Debit `livingCostPerMonth(fighter)` per quarter for every non-retired
  fighter, inside the quarterly block that already exists at `world.ts:293-304`. This alone makes
  idleness cost money, which is the entire point: in the sport the man who is not fighting is the
  one going broke, and right now he is the only one who cannot.
- **Deferrable, its own commit and its own re-baseline.** Replace the flat `0.35` and
  `campCost(8, 55)` with `netPurse` and the fighter's real gym — `develop()` already looks up
  `fighter.gymId`, so the rating is to hand.

One objection to pre-empt: the comment at `world.ts:1016` defends the lightweight version by citing
doc 17 on the cost of "full bookkeeping every tick" for hundreds of fighters. That does not apply
here — `netPurse` per *bout* is ~27 calls per step, and living cost per *quarter* is 4×F a year.
The commit should say so rather than appear to override a documented decision.

**Anything that reads `solvency` is blocked on P2.** Anything that does not — the slate display,
handling, the wiring — is not.

---

## 3. The approach catalogue

Eight approaches, from three reviewers, after convergence. Each is independently shippable.

### A — The Slate Shows What It Pays

> The player's central decision is degenerate, because all three options pay the same number.

**The defect.** `HubScreen.tsx:432` computes one `currentPurse(db, fighter)` and passes it
identically to every offer card. `currentPurse` (`app/src/game/money.ts:96`) already takes a
`position` argument defaulting to `mainCard`; `night.ts:384`, `world.ts:1694`, `CampScreen` and
`CardBuilderScreen` all pass one — **the hub is the only caller that omits it.** So the risk axis on
the game's most frequent decision trades against nothing, and taking the regional champion over the
journeyman is pure downside.

**Scope.** Render three numbers that already exist, per offer card: position-adjusted purse
(`CARD_POSITION_PURSE` spans 0.5→2.5, a 5× swing on the same contract), expected value
(`show + win × winChance`, and `MatchupAppraisal.winChance` is already on every offer and already
displayed), and the existing heat hint.

**Covers:** §6 in its correct form. **Drops:** everything else.

**Cost:** small. No engine change, no new state, no new field.

| Pros | Cons |
| --- | --- |
| Fixes a live shipping defect on the decision the player makes every fight | Career mode only; promoter mode unaffected |
| Every pound comes off the signed agreement, so doc 13's ruling is untouched | Does not make anybody refuse anything |
| Models the real trade correctly: a step up pays more because it is a co-main, and less in expectation because you are likelier to lose the win bonus | Needs A to be *visible* as a trade, which is a UI judgement, not a number |

**Measurement.** Across 20 careers, what fraction of accepted offers are not the lowest-step option?
If it does not move, the spread is too narrow to be a trade.

> **Note.** Doc 34 §6.1 proposed a *negotiated* per-bout purse. That reopens doc 13's ruling that
> purses are committed on the contract and that at card time the only live money decisions are the
> bonus pool and the marketing spend. It is rejected. The derived form above is not a money
> decision at card time — it is arithmetic on money already agreed.

### B — Handling, derived at the read site

> The promotion has no plan for anybody, and the machinery for having one is finished.

**Scope.** `handlingFor({ fighter, promotion, rank, divisionDepth, day })` — a pure function of what
a promotion can *see*: record, age, finish rate, `entertainmentValue`, `starPower`, nationality
against `baseCountry`, divisional need. It never reads `potential`. Resolution at the read site
inside `offerOpponents`:

```
options.handling ?? subject.handling ?? handlingFor(subject, promotion, ctx)
```

**Why the read site and not a writer.** Three reasons, and all three reviewers converged on it:

1. A promotion's plan is derived from record, age and need — all of which change under it. Storing
   it is precisely the drift doc 34 §3.1 forbids.
2. `Fighter.handling` is a **scalar**, but doc 34 §5 specifies the plan "per promotion per fighter".
   Under doc 26's pool a fighter has no promotion while several evaluate them at once. A stored map
   would be `F × P` of derived state.
3. The field already has an owner. An AI writer would stamp over the human promoter's own
   push/protect choices, because `world.ts`'s player exclusion covers the player's *fighter*, not
   their *promotion*. Read-site resolution puts the player's explicit choice first, where it belongs
   — for their promotion, the matchmaker *is* the player.

**Covers:** §5, §2.1's absent rows, §14.1, part of §8. **Drops:** the whole fighter side.

**Cost:** medium-small. One pure function, one optional field on an existing options object.

| Pros | Cons |
| --- | --- |
| Un-deadens `matchmaking.ts:193-220`, `favourFor` and `buildingUp` at once | Cannot produce a journeyman — a journeyman is defined by what he *accepts* |
| No new stored state, no save migration, no re-tuning of the economy | Cannot produce a duck, a hold-out or a title-shot standoff |
| Situation-shaped by construction, so it cannot be misread as the fighter model | Every fighter stays infinitely available, and real matchmaking is mostly the plan failing |
| Survives doc 26 unchanged | |

**Measurement.** Fraction of each AI roster with non-`undefined` handling (target 10–20%), and mean
`step` of offers to `push` fighters against the promotion's own mean. Read straight off
`offerOpponents`.

### C — Slate-level acceptance

> The refusal → patience → cut chain is already fully wired and permanently receives zero.

`PromotionalAgreement.refusedBouts`, `refuseBout()`, `TollReason: 'refusedBout'` and
`world.ts:1925-1927`'s pass into `promotionPatience` are all built. Only the player ever increments
the counter (`career.ts:460`), so `patience.ts:130`'s refusal-driven cut branch is unreachable for
the entire world.

**Scope, amended.** Do **not** gate the pick. Replace `rng.pick(offers)` at `world.ts:546` with
`rng.pickWeighted(offers, m => acceptanceOf({...}).chance)`, and fire `refuseBout` only when the
whole slate is below a floor.

**Why the amendment is load-bearing.** `offerOpponents` returns the slate sorted by step descending
(`matchmaking.ts:234`), and `stepTerm` is `acceptanceOf`'s dominant term. A per-bout gate would
refuse the step-up preferentially and visibly *narrow* the world's matchmaking toward level fights —
a behavioural regression, not merely an unmeasurable number. Weighting reallocates toward the fight
the fighter wants instead of deleting the interesting one, and a whole-slate floor is the hold-out
case, which is situation-shaped by construction.

**Covers:** §2.2, §11.1 partially. **Drops:** §3, and every situation term.

**Cost:** small, ~40 lines.

| Pros | Cons |
| --- | --- |
| Lands a chain that is built, tested and starved | `acceptanceOf` has six matchup terms and one situation term, so refusals are shaped by *opponent*, not by circumstance — which is backwards |
| The consequence (patience → cut) needs no new code | Risks measuring a broken model and believing it |
| Uses a bout-seeded rng, so the parent stream is untouched | Forces one deliberate long-sim re-baseline |

**Measurement — and a hard constraint on it.** Phase C's test asserts **chain liveness and cost
only**, and is *forbidden* from asserting a refusal rate or its distribution. Those belong to E.
Card fill is a hard ceiling: bouts per night must not fall.

### D — Call Carlos (goodwill, on the agreement)

> The most defensible mechanic in doc 34, because matchmakers describe it out loud.

**Scope.** Three counters alongside the existing `refusedBouts` — `acceptedCount`,
`acceptedShortNotice`, and recency — **on `PromotionalAgreement`, not on `Fighter`.** Two reviewers
reached that independently: a per-promotion map on 850 fighters is ~170 KB against doc 20's 100 KB
target for a whole save, and it is state that cannot be rebuilt from the seed, which is what doc 20
phase 5 depends on. Putting it on the agreement is also honest — goodwill dies with the deal.

Plus the career-mode short-notice call: reuse `promoting.ts:667 replacementsFor` in the world's
pull-out path, and write `shortNotice: true` through `AftermathInput` so `standing.ts:86`'s +2 and
`FightRecord.tsx:203`'s existing display both come alive.

**One realism correction to doc 34 §9:** the real predictor of who takes a short-notice fight is
*camp state* — already in camp, fought recently, walking around near the limit — not personality.
The game has `freshness`, `lastTrained`, `readyOnDay` and `walkingWeightLbs`, and §9 names none of
them.

**Covers:** §9 in full, §11.1, part of §8. **Drops:** §3, §4, §5, §12–§15.

**Cost:** small-medium. Three integers on an existing entity, one derived function, one reuse.

| Pros | Cons |
| --- | --- |
| Unambiguous real-world referent, and the sport's single most characteristic event | Doc 34 overstates what goodwill buys — it buys card position and the next call, not much patience during a skid |
| Uses the blocking inbox item that already exists and is already good | Authored moments repeat: the same scene twice in one career reads as a script |
| No save-size exposure once it is on the agreement | Needs C and P2 to mean anything |

**Measurement.** `shortNotice === true` on 4–8% of world bouts per simulated year, skewed to
unranked, recently active, low-bank fighters. Uniform across the roster means the search is wrong.

### E — The reservation price

> Replace doc 34 §3's twelve-weight sum with one number in pounds. The weights become multipliers.

**Scope.** Extend `money.ts:172 askingPrice` — which already returns
`marketValue × purseDemand × loyalty` and already has a test file — with situation multipliers, each
one line: step, age past 30, an unbeaten record, `releaseRisk` (a roster spot at stake makes you
*cheaper*), solvency, short notice, resentment, title. Then
`promotionCeiling(promotion, fighter, cardPosition, need)` from `budget`, `minimumPurse` and
`CARD_POSITION_PURSE`. `acceptanceOf` becomes roughly `clamp01(ceiling / price)` with the binding
multiplier as its existing `concern` string — **signature unchanged**, so `promoting.ts:575/689` and
`CardBuilderScreen.tsx:621` are untouched.

Doc 34 §3.3's whole negotiation collapses into one comparison: `askingPrice` against `marketValue`.

**Why this beats doc 34 §3's kernel, on all three axes:**

- **Cheaper to build.** ~60 lines in an existing module with an existing test file, against ~1,500
  for a kernel plus two weight-vector modules.
- **Cheaper to tune.** A weight in a twelve-term sum is unitless and interpretable only against the
  other eleven — doc 34 §20 concedes they "need measuring rather than choosing". A multiplier on a
  price is interpretable alone: *"desperation cuts the ask 40%"* is checkable against
  `desperationDiscount`'s existing 0.4 and against the sport.
- **Cheaper to be wrong about.** A bad weight produces globally strange behaviour with no culprit. A
  bad multiplier produces a wrong number in pounds — printable, quotable in a news item, obvious.

It also satisfies doc 16's "always a price, never a wall" literally, and gives the derived
observable doc 16 demands for free: the ask, quoted in money.

**Covers:** §3.1 and §3.2 in substance, §3.3 in full, §6.1, §11.1–11.4, §12's leverage.
**Drops:** §4, §13, §14.3, §15.

**Cost:** medium.

| Pros | Cons |
| --- | --- |
| Gives callers to `askingPrice`, `desperationDiscount`, `shortNoticeBonus`, `solvencyReSignPressure` | A scalar cannot price a non-preference: "I want #7, not #14" and "not my teammate at any price" are not prices |
| One output, one unit, one dimension to bisect when it is wrong | Money is not the only currency — a title eliminator and a main-event slot are not convertible to pounds for a fighter who wants the belt |
| Caches perfectly: price is per-(fighter, promotion); step and conflict stay per-opponent | Blocked on P2, or it is a constant wearing a variable's name |
| Signature-compatible, so no UI churn | |

The honest shape is therefore **price plus a small residual of non-priceable terms** — `stepTerm`
stays, `stableConflictCost` stays (already amplified 6× at `boutAgreements.ts:131` precisely because
it is a wall in a price's clothing). Still a fraction of twelve weights.

**Measurement.** Distribution of `ceiling / price` over 500 world offers. A healthy sport clusters
0.8–1.3 with a long right tail. Above 2, nothing is scarce; below 0.7, nothing gets made.

### F — Promises, and the non-monetary term

> Two of the four moves in doc 34 §3.3's negotiation are not money.

**Scope.** `PromotionalAgreement.promises` — *"title eliminator, if you win"* — with a renderer on
the hub, a countdown, and a breach path at a stated relationship cost. Plus the manager converting a
promise into a written term, which is the fourth move in §3.3 and the thing that stops him being a
tax. Plus the one-line merge of the player-facing signing path (`progression.ts:99` →`offersFor`).

**Covers:** §11.3, §12 both sides, §2.3's parallel-path defect. **Drops:** the rest.

**Cost:** small-medium. One nullable array with a renderer and a breach path.

| Pros | Cons |
| --- | --- |
| The fighter who takes less money for the eliminator is the sport's most characteristic trade | Adds a stored field to an entity doc 20 already flags as never pruned |
| Makes doc 16's money/route/level triangle work at card level, not just at signing | Only meaningful once E exists to trade against |
| Fixes a shipping defect (two signing models on two screens) in one line | |

### G — Five people in a room

> Doc 34 §20 asks whether a promoter's multi-objective score can be shown without becoming a
> spreadsheet, and declines to answer. This is the answer.

**Scope.** The two missing negative terms — `PurseCost` and `AssetDestruction` — plus card need and
timing as matchmaking inputs. Then a panel on `CardBuilderScreen` where booking a bout produces five
*sentences that contradict each other*, never a score:

> **Sporting:** Adebayo is #1 and has waited fourteen months.
> **Commercial:** Vasquez sells three times what Adebayo sells.
> **Market:** São Paulo is in nine weeks and neither of them is Brazilian.
> **Risk:** Adebayo is 34. If he loses he is worth nothing to you.
> **Timing:** Vasquez is cleared. Adebayo is not, until March.

**Covers:** §3.2, §11.6, §14.1. **Drops:** the fighter side entirely.

**Cost:** medium.

| Pros | Cons |
| --- | --- |
| Exactly the shape doc 13 demands, and the precedent already works (`describeLevel`, `unmatchableTerms` are prose, not numbers) | Career mode gets almost nothing |
| Answers a doc 34 open question for free | Five sentences on a nine-bout card is nine screens of reading on a phone — restrict to main and co-main |
| Builds on B, which it needs anyway | Promoter mode has fewer players than career mode |

**Measurement.** Do two promotions with different `MATCHMAKING_STYLES` produce measurably different
main events from the same roster over 20 cards? And: does the player ever *change their mind* after
opening the panel? If it never flips a decision it is decoration.

### H — The consequence bus

> Doc 34 §13 is not a utility function. It is a subscriber list.

**Scope.** A `CareerEvent` union emitted from `runCardBout`, `resolveFreeAgency` and `releaseIfCut`,
with small pure handlers for career reassessment, the financial pivot, comebacks and goodwill.

**Covers:** §13, §14.3. **Drops:** everything else.

**Cost:** large, and larger than it looks — `runCardBout` currently mutates `db` directly across
~200 lines, so emitting patches means refactoring that first.

| Pros | Cons |
| --- | --- |
| The only approach whose cost is bounded by *fights* rather than by population, which is what doc 26's 5–10× will eventually demand | Requires the `runCardBout` refactor before anything ships |
| Right shape for the two sections nothing else covers | Patch *order* becomes load-bearing, a class of bug the repo does not currently have |
| Each handler is independently testable | §13 happens to world fighters, so the player cannot perceive any of it |

**Verdict: deferred, not dropped.** Revisit after E.

---

## 4. The routes

### Route 0 — Movement (the one aimed at the actual problem) — **SHIPPED in `50d1c1a`**

> Kept as written, because it is the specification the shipped change is measured against. See
> §0 for what actually landed and what it measured.

**P1 + M.**

`M` is a rebuild of `resolveFreeAgency`'s selection step, and nothing else:

1. **Merit replaces the dice.** Call `offersFor` — which already computes `appetite` from divisional
   need, market value, manager access and marketability, and already assigns a `motive` of
   ascend / lateral / fall — and take the best offer rather than a uniform draw. The function
   exists, is tested, and is currently reachable only from the player's own contract screen.
2. **`standingScore` replaces raw reputation in the gate.** It already discounts what you did
   elsewhere by the gap between the rooms, and already fades the carry-in over six bouts. It is the
   input this gate was always supposed to have.
3. **Seeded fighters get agreements at world creation.** Stops the entire roster falling through the
   signing branch on the first quarterly tick.
4. **A move down needs a cause.** Being cut, or a lapsed deal with no better offer — never a coin
   flip. This is what kills the lateral churn, which is 65% of all movement and narrates as nothing.

- **Covers:** the originating concern directly. Doc 34 §10 (getting signed), §2.3's three-signing-path
  defect, and the parts of §8 that are about *where* a career goes rather than what it accepts.
- **Drops:** everything about how fighters choose fights. Nobody refuses anything, nobody has a
  price, promotions still have no plan for anybody.
- **Cost:** small-medium. One function's selection step, one gate input, one seed change. No new
  stored state, no new module, no save migration.
- **Risk:** it will move every long-sim population number at once, because it changes where 300
  fighters a year end up. That is what P1's invariant group exists to catch.

| Pros | Cons |
| --- | --- |
| The only route that targets the measured defect | Does nothing for doc 34's fighter model |
| Gives `offersFor`, `appetite` and `standingScore` their first world-side callers | Needs P1 first, or you cannot tell whether it worked |
| Makes the ladder a ladder: up requires merit, down requires a cause | Exposes doc 26's real gap — if the regional tier has nobody worth signing, merit-based promotion has nothing to promote |

**Measurement (the acceptance test).** Re-run `tools/mobility-trace.ts`. Success is:
down-to-up ratio below **1.3:1** (from 2.01), lateral share below **35%** of tier-classified moves
(from 65%), at least **15** of a regional starting cohort of ~250 reaching a major promotion in ten
years (from 4), and the global cohort retaining **60%+** of its starters rather than 17%.

### Route 1 — Easiest (a weekend)

**P1 + A.**

Ship the harness, then make the offer slate show what each fight actually pays. Nothing else.

- **Covers:** doc 34 §6, and the measurement infrastructure everything else needs.
- **Drops:** all twenty other sections.
- **Why it is defensible on its own:** it fixes a decision the player makes every fight that is
  currently degenerate, and it costs no new state, no migration and no re-tuning. If the project
  stops here, the game is strictly better.
- **Risk:** none worth naming.

### Route 2 — Minimal viable (the promoter half)

**P1 + P2(required half) + A + B.**

Add: the promotions get a plan, and idleness costs money.

- **Covers:** §5, §6, §14.1, parts of §2.1 and §8.
- **Drops:** the entire fighter side — nobody refuses anything, nobody holds out, nobody is
  desperate.
- **Why this shape:** B is situation-shaped, promoter-side, and needs no fighter model, so it is the
  one first slice that cannot be misread. P2 is here rather than later because it moves every
  balance number at once and is cheaper to absorb while few assertions are pinned to current figures.
- **Risk:** it produces a world where the plan always executes, which is the opposite of real
  matchmaking. It will look right and be half a model.

### Route 3 — Recommended (the converged set)

**P1 + M + P2 + A + B + C + E + D**, in that order, measuring after each.

> **Amended after §1.5.** The three reviewers converged on this set without `M`, because none of
> them had measured mobility and doc 34 does not name it. `M` goes second — immediately after the
> harness — because it is the originating concern, because it is small, and because every later
> step is easier to read once movement has a shape.

This is what all three reviewers signed off. Roughly: measure, then make promotions have plans, then
let fighters have a price, then let them say no, then let the relationship remember.

- **Covers:** §2.2, §3 in substance, §5, §6, §8, §9, §11.1–11.4, §12's leverage, §14.1 —
  most of doc 34's load-bearing content.
- **Drops:** §4 (amateur careers), §13 (results change people), §15 (career state reaches the cage),
  §7 (manager objective — the advice record already carries the observable).
- **Why this order:** every step is measurable before the next is written, which is doc 34 §17's own
  instruction and the safest sentence in that document. E before D because goodwill is only
  meaningful once refusal has a reason behind it.
- **Risk:** E is where the tuning lives. If `ceiling / price` does not cluster sensibly, the
  multipliers are wrong and the fix is local — which is exactly why the price beat the kernel.

### Route 4 — Maximal

**Route 3 + F + G + H + doc 26 + the amateur layer.**

- **Covers:** all twenty sections.
- **Drops:** nothing.
- **Why it is not recommended as a plan:** doc 26 is a hard prerequisite for anything involving
  refusal at scale (a world where you can refuse but nobody else is bookable is worse than one where
  you cannot). §4's amateur career is a new *mode*, not a section. H needs the `runCardBout`
  refactor. And doc 34 §20 concedes that `OpportunityCost` has no in-sport source at all.
- **Honest framing:** this is a destination, not a route. Each piece is reachable from Route 3 when
  something needs it.

### Rejected

| Rejected | Why |
| --- | --- |
| **Doc 34 §3's twelve-weight kernel** | Superseded by E on build cost, tuning cost and diagnosis cost. All three reviewers dropped their own version of it. |
| **A negotiated per-bout purse (§6.1)** | Reopens doc 13's contract ruling. The derived form in A gets the decision without the conflict. |
| **"Bright neighbourhood"** (run the real model only near the player) | Buys performance with determinism: the world's evolution becomes a function of who the player is. Its own acceptance test requires building the full model anyway, and every mechanic gets written twice, forever. |
| **Shipping the simulation with no UI** | The repo already contains six written, tested, never-called functions. Doc 34 §2 is substantially a catalogue of them. The correct test is not visible-vs-invisible but **specified-vs-speculative**: substrate earns its place when a moment the player will experience is already specified and blocked on it. |
| **`Fighter.selfBelief` as a stored field (§16)** | Stored derived state. The free correct answer is a content-addressed seed — `createRng(worldSeed:self:fighterId:record.length)` is deterministic, costs zero bytes, and delivers §4.2's "shrinks with results" because the bout count is in the key. Strike it from §16. |

---

## 5. Where the reviewers disagreed, and how it resolved

| Conflict | Resolution |
| --- | --- |
| Game design wanted per-offer purses; realism said doc 13 forbids it | **Both right.** Doc 13 forbids a money *decision* at card time, not differing displayed numbers. Card position and win probability are contract-derived. Approach A. |
| Systems ranked wiring first; realism ranked it fifth ("you will measure a broken model") | **Systems conceded rank, realism conceded safety.** Wiring is safe once amended to slate-level weighting, and phase C's test is *forbidden* from asserting a refusal rate. The baseline systems needs is mechanical; the claim realism fears is behavioural. Different artifacts. |
| Realism wanted a `handling` writer; systems wanted a read-site override | **Read site, unanimously.** Realism supplied the decisive argument against its own position: a stored plan is the derived-state drift doc 34's own §3.1 forbids, and a matchmaker does not hold a persistent dossier — they form a view when they sit down to build a card. |
| Doc 34 said refusals should be "a few percent"; realism first said 25–50% | **Realism withdrew its own figure** as conflating refusal with slot-filling. Settled at 12–20% of proposed pairings, with three binding conditions that matter more than the headline. |
| Where goodwill lives | **Converged independently on the agreement**, from opposite directions — realism on "goodwill dies with the deal", systems on doc 20's save-size budget. |

---

## 6. Hard gates

Non-negotiable for any implementation, in descending order of how likely each is to bite.

1. **No wall on a control the player has already used.** No world-fighter refusal ships unless
   either the hub slate is filtered by acceptance *before* rendering, so a fighter who will refuse
   never appears, or the refusal arrives carrying the number that would change it. A "no" on a
   button the player already pressed is doc 16's forbidden wall.
2. **`handling` needs a tell in career mode.** A promotion silently deciding to protect the player
   changes every offer they receive with nothing on any screen. One hub line — *"They are being
   careful with you"* / *"They want to find out what you are"* — is what makes B legal.
3. **Card fill is a ceiling.** Bouts per night must not fall when refusal lands.
4. **The refusal-rate claim stays open until situation terms exist.** Phase C asserts liveness and
   cost, never a rate.
5. **Nothing derived is stored.** It binds `handling`, `selfBelief` and any promoter plan.
6. **The player is never moved by the world** — and note the exclusion covers the player's *fighter*,
   not their *promotion*.

## 7. Deliberately not covered by any route below 4

Stated so the gap is a decision rather than an oversight.

- **§4, amateur careers.** A mode, not a section. Its one portable insight — a 9–3 amateur can be a
  better prospect than a 4–0 one — is a creation-screen fact and is already served by
  `origin.ts`'s attainment layer.
- **§4.2, self-assessment error.** Has no substrate: `camp/scouting.ts` scouts *tendencies* for camp
  prep, and nothing anywhere estimates `Fighter.potential`.
- **§13, results change people.** Happens to world fighters, and the player has no window into it.
  Five of its eight responses already have mechanisms; the two absent ones are weight adjustments
  that E's multipliers can carry when the time comes.
- **§15, career state reaches the cage.** Route it through `gamePlanAdherence` — a filter the player
  manages and can see failing — never through `basePaceDial`, which would override a plan the player
  committed in camp and refute doc 05's central pillar.

## 8. Open questions

- **What does the eliminator promise cost, in pounds?** F only works if a non-monetary term has a
  price on both sides, and E's unit forces the question. The title multiplier at ×0.3 is a
  hard-coded fact rather than an emergent one — defensible, because it is a hard fact in the sport.
- **Does the fighter model advise the player or act for them?** Doc 34 §20 leaves this open;
  `world.ts:780-783` on `runCardBout` arguably already settled it — one function, two call sites,
  because "a second implementation would drift within a week".
- **Is 12–20% right?** Nobody knows, and the honest observable is not a rate: *in a 20-year sim, at
  least one top-2 contender pairing in some division goes unmade for twelve months.* That is what a
  fan would recognise as the sport.
