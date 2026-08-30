# 34 — Signing, ambition, and the climb

**Status:** proposal. Nothing in §3 onward is implemented — with one exception recorded in
[35 §0](./35-ways-to-build-doc-34.md): the inter-promotion mobility defect that prompted this
document was fixed on master by `50d1c1a`, and the fix measures well. Every claim in §2 was checked against
the source at `656b6d4`, and each row names the file and line it was read from.

> **Corrections, from three independent reviews of this document.** §2's audit was wrong in eight
> places, and the method that produced it — grepping `packages/` for `handling:` — is the reason
> for two of them: it excluded `.tsx`, and it missed ES6 shorthand. Each correction below has been
> verified at the named line. [35 — ways to build this](./35-ways-to-build-doc-34.md) records them
> in full and rules on what they change.
>
> 1. **`Fighter.handling` is not dead.** `PromoterRosterScreen.tsx:129-132` writes it and `:143`
>    clears it on a cut — the player-promoter has this control. No *simulation* code writes it, so
>    the AI has no plan for anybody. §5 is parity, not resurrection.
> 2. **`push` gets no risk shift.** `matchmaking.ts:193-194` is `test → +0.35`, `protect → −0.35`,
>    `push → 0`. Push changes slate composition only.
> 3. **There are three signing paths, not two.** `world.ts:1179-1229 resolveFreeAgency` uses
>    neither `promotionOffers` nor `offersFor` — it rolls its own affordability and prestige gate,
>    and it performs essentially every signing in the world.
> 4. **The matching-rights game is dead.** `canMatch` and `matchResponse` have callers only in
>    `freeAgency.test.ts`. §2.3 and §2.4 both overstate it.
> 5. **The phone call already exists.** `world.ts:1955-1995` raises a blocking `kind: 'offer'`
>    inbox decision with a named opponent, a stated purse and a priced refusal. §9 is that item
>    with two fields changed.
> 6. **`camp/scouting.ts` scouts tendencies, not potential.** §4.2 has no substrate: nothing
>    anywhere estimates `Fighter.potential`. That is a new subsystem, not wiring.
> 7. **A reservation price already exists.** `money.ts:172 askingPrice` — market value ×
>    `purseDemand` × loyalty — with test-only callers. §3.3 claims the game does not have one.
>    It is also a fourth dead money function §2.2 missed, and doc 35 makes it the recommended spine.
> 8. **§6.1 reopens a settled ruling.** Doc 13's Money section holds that purses are committed on
>    the contract and that at card time the only live money decisions are the bonus pool and the
>    marketing spend. A negotiated per-bout purse is out; see doc 35 for the derived form that is
>    not.
>
> Two further defects found by the reviews and not in §2 at all: **an idle world fighter's bank
> cannot move** (`world.ts:1046` applies money only inside fight resolution, with a flat 0.35 and a
> fake camp cost, while the player gets the real `netPurse` path at `app/src/game/money.ts:187`),
> and **`world.ts:1234` sets `resentment: 0` on every world re-signing**, so grievance can never
> accumulate across deals. The first makes §19.3 and §19.5 unreachable by construction.

> **The short version.** A career is not a ladder. Amateur → regional → major → champion is what
> happens when everything goes well, and it is the one path out of thousands that the game
> currently knows how to want. The interesting simulation is that **fighters, managers and
> promoters are making decisions under uncertainty with different incentives**, and the career is
> what those decisions leave behind.
>
> The game already models the *promoter's* half of that respectably — `matchmakingStyle` gives
> each promotion a shape, `favourFor` does the stylistic favours a push actually consists of, and
> `contenderQueue` means a spectacle promotion and a tournament promotion genuinely disagree about
> who is next. **The fighter's half barely exists.** In the world simulation a fighter cannot
> refuse a bout, cannot want anything, cannot be broke, cannot be protecting a roster spot, and
> cannot be told no. `acceptanceOf` — the one function that models a fighter saying no — is
> reachable only in promoter mode, and it has no term for money, age, rank, contract position or
> confidence.
>
> The proposal is two utility functions, both derived rather than stored, that collide at every
> booking and every signature.

Read alongside [16 — contracts, free agency and managers](./16-contracts-free-agency-managers.md)
(the contract layer this builds on), [21 — activity, offers and patience](./21-activity-offers-and-patience.md)
(the promotion's side of a fighter not fighting), [26 — division depth and the pyramid](./26-division-depth-and-the-pyramid.md)
(without which the bottom of this document has no population), and
[13 — promoter mode](./13-promoter-mode.md).

---

## 1. The thesis

Four fighters are 7–0.

- One desperately wants the call from the biggest promotion in the sport.
- One knows he is not ready and wants three more regional fights first.
- One needs £5,000 this month and will fight anybody who has it.
- One has quietly worked out he is never going to be elite, and wants the easiest fights available
  while he builds a following in his own city.

Meanwhile the promoters looking at those four have entirely different reasons for offering each of
them a fight, and the reasons have very little to do with who would win.

That is the whole design. Everything below is a consequence of it, and the single most important
consequence is negative:

> **There must be no career-path field, no archetype enum, and no `journeyman: true`.**

A journeyman is not a kind of fighter. It is what a 29-year-old at 5–4 with £1,200 in the bank and
a manager who has twenty-two other clients *does*, and it stops being what they do the week they
win three in a row. The moment the game stores the archetype instead of deriving it, every one of
these careers becomes a branch somebody has to author, and the interesting ones — the 12–14
Brazilian who submits your prospect, the 17–9 lunatic the promotion cannot afford to release —
stop happening on their own.

---

## 2. What the game already has

Verified against the source, not against the docs. Verdicts:

- **Built** — exists, is called, and does the job.
- **Partial** — exists and is called, but is missing the term this document needs.
- **Dead** — exists in the type system or the module, and nothing reads or writes it.
- **Absent** — no representation at all.

### 2.1 The promoter's side

| Capability                                   | Where                                    | Verdict     |
| -------------------------------------------- | ---------------------------------------- | ----------- |
| Promotions disagree about who is next         | `matchmakingStyle.ts:contenderQueue`     | **Built**   |
| Rank adherence / entertainment / domestic mix | `matchmakingStyle.ts:MATCHMAKING_STYLES` | **Built**   |
| Stylistic favours for a fighter being built   | `matchmakingStyle.ts:favourFor`          | **Built**   |
| An offer *slate* rather than one opponent     | `matchmaking.ts:offerOpponents`          | **Built**   |
| Risk appetite per promotion                   | `Promotion.matchmakingAggression`        | **Built**   |
| Release as at-will, bought off by star power  | `contracts.ts:releaseRisk`               | **Built**   |
| Patience with an inactive fighter             | `patience.ts:promotionPatience`          | **Built**   |
| Per-fighter push / test / protect             | `Fighter.handling`                       | **Partial** |
| Card need driving matchmaking                 | —                                        | **Absent**  |
| Market need (a Brazilian headliner in São Paulo) | `MatchmakingStyle.domesticBias` (queue only) | **Partial** |
| Contract situation changing who gets booked   | —                                        | **Absent**  |
| Cost as a matchmaking input                   | —                                        | **Absent**  |

`Fighter.handling` is the sharpest finding here, in a narrower form than this document first
claimed. It is documented at `domain/fighter.ts:228` as the per-person answer to doc 13's "building
stars", and it is read three times in `matchmaking.ts:193-220`, where `test` shifts risk appetite by
+0.35, `protect` by −0.35, `push` by nothing at all, and all three reshape the offer slate.

**The player writes it; the simulation does not.** `PromoterRosterScreen.tsx:129-132` exposes it as
a four-option control and `:143` clears it on a cut, so a human promoter already has this decision.
Every fighter on every *AI* roster is `undefined` — no promotion in the simulated world has a plan
for anybody. §5 is therefore about giving the AI a control the player already has, which is a better
starting position than a dead field: the vocabulary is built, rendered and understood.

It also means §5 and §16 contradict each other. §5 specifies the plan "per promotion per fighter";
`Fighter.handling` is a scalar with one owner. Under doc 26's pool a fighter has no promotion while
several evaluate them at once, and a stored map would be `F × P` of derived state. Doc 35 resolves
this at the read site instead.

### 2.2 The fighter's side

| Capability                                    | Where                                | Verdict     |
| --------------------------------------------- | ------------------------------------ | ----------- |
| Refusing a bout at all                         | `boutAgreements.ts:acceptanceOf`     | **Partial** |
| Appetite for a step up                         | `personality.ts:stepUpAcceptance`    | **Partial** |
| Grievance making a fighter hard to book        | `acceptanceOf` resentment term       | **Partial** |
| Manager conflict blocking a fight              | `acceptanceOf` conflict term         | **Built**   |
| Short-notice willingness                       | trait hook, promoter mode only       | **Partial** |
| Money as a reason to take a fight              | —                                    | **Absent**  |
| Age changing risk tolerance                    | —                                    | **Absent**  |
| Protecting a record vs protecting a roster spot| —                                    | **Absent**  |
| Wanting a specific opponent                    | —                                    | **Absent**  |
| Turning down a fight to wait for a better one  | —                                    | **Absent**  |
| Response to a bad loss beyond confidence       | `aftermath.ts` confidence swing      | **Partial** |
| Comeback from retirement                       | —                                    | **Absent**  |

Two of those rows deserve spelling out, because they are why this document exists.

**`acceptanceOf` is unreachable in the world.** Its only callers are `promoting.ts:575` and
`promoting.ts:689`, both inside promoter mode. `world.ts:buildNight` matches fighters at
`world.ts:536-550` by picking a subject, calling `offerOpponents`, and picking one of the returned
opponents — and then books it. No fighter in the simulated world has ever said no to anything. Every
duck, every hold-out, every "we are two fights from the call, absolutely not" is invisible outside
the mode where the player is the one making offers.

**`acceptanceOf` has no money term.** Its inputs are the fighter, the opponent, the promotion, the
manager, a notice flag and a title flag. Purse is not among them. `Fighter.bank` is documented at
`domain/fighter.ts:271` as the thing that makes "a fighter in the red take fights they would
otherwise turn down" — and `money.ts` has the functions for it: `desperationDiscount`,
`shortNoticeBonus` and `solvencyReSignPressure` at `business/money.ts:436-459`. **All three have
zero callers.** The economic engine of the lower half of the sport is written, tested, and wired to
nothing.

### 2.3 Signing and the ladder

| Capability                                  | Where                                   | Verdict     |
| ------------------------------------------- | --------------------------------------- | ----------- |
| Offer sheets with named futures             | `freeAgency.ts:offersFor`               | **Built**   |
| Monopsony market structure                  | `freeAgency.ts` (doc 16 Part 2)         | **Built**   |
| Unmatchable terms as the fighter's move     | `freeAgency.ts:unmatchableTerms`        | **Built**   |
| Outside standing discounted by the room     | `standing.ts:transferRate`              | **Built**   |
| Carry-in fading over six fights             | `standing.ts:carryWeight`               | **Built**   |
| Title-shot gating                           | `ladder.ts:titleShotEligibility`        | **Built**   |
| Scouting a fighter you might sign           | `camp/scouting.ts`                      | **Partial** |
| Being signed *up* a tier                    | `ladder.ts:promotionOffers`             | **Partial** |
| Divisional need driving signings            | `freeAgency.ts:appetite`                | **Built**   |
| Matching rights enforced                    | `freeAgency.ts:canMatch/matchResponse`  | **Dead**    |
| Free agency taking time                     | `world.ts:resolveFreeAgency`            | **Partial** |
| A blocking offer the player must answer     | `world.ts:1955-1995`                    | **Built**   |
| An amateur career                           | —                                       | **Absent**  |
| The short-notice call, in career mode       | —                                       | **Absent**  |

Three specifics:

**There are three parallel signing paths and they disagree.** `ladder.ts:promotionOffers` returns
nothing at all unless the fighter is on a two-fight win streak, and filters to promotions exactly
one tier up. `freeAgency.ts:offersFor` exists specifically to replace those two rules — its own
header comment says so at `freeAgency.ts:140-148` — and handles lateral moves and the fall. But
`promotionOffers` is still live: `app/src/game/progression.ts:99` calls it for the player's career
screen, while `app/src/game/contracts.ts:283` calls `offersFor`. The player sees offers from one
model on one screen and the other model on another.

And the third path is the one that matters most: **`world.ts:1179-1229 resolveFreeAgency` uses
neither.** It filters on affordability (`marketValue <= budget * 0.06`) and a `prestige <= 42 +
reputation * 0.9` gate, picks with 0.55 stickiness to the incumbent, and writes `defaultTerms`.
`appetite`, `motive`, the monopsony structure and the named futures never run for a world fighter —
so every signing in the simulated world happens under a model the player never sees. Unifying the
paths is half again as much work as §17 budgets.

**`FightRecordEntry.shortNotice` is never written.** The field exists (`domain/fighter.ts:69`),
`standing.ts:86` pays +2 standing for it, `ui/FightRecord.tsx:203` already renders `· short notice`,
and no code path anywhere sets it to `true` — a display waiting for a writer. Short notice is
modelled at `promoting.ts:694`, where a promoter looks for a replacement.

What §9 needs is smaller than this document first claimed, because **the phone call already
exists**: `world.ts:1955-1995` raises a blocking `kind: 'offer'` inbox decision — named opponent,
stated purse, eight weeks, Take the fight / Turn it down, with the cost of refusing written under
the button. The short-notice call is that item with the notice shortened and the search widened.

**Free agency is instantaneous.** `world.ts:resolveFreeAgency` re-signs everybody it touches in the
same quarterly tick, under a comment that names it honestly. Doc 26 §4.4 already flagged this. Being
cut therefore costs a world fighter nothing, which removes the entire population of §8.

### 2.4 What is genuinely good and should not be touched

Worth stating so this document is not read as a rewrite.

- **The manager data shape.** `connections` as a per-promotion vector rather than a scalar
  (`managers.ts:54`) is what stops "pick the best manager" being a solved problem, and the advice
  record (`managers.ts:146`) is the derived observable for hidden integrity. §7 adds an objective to
  this model; it changes nothing about the shape.
- **The monopsony.** `freeAgency.ts` is right that this sport is escaping rather than being courted,
  and it is why the money/route/level triangle survives.
- **`standingScore`.** Evidence from the room it was earned in, fading as real results replace it.
  §10's "how good actually is this person" question is largely already answered here.
- **Tolled contracts.** `contracts.ts:tollAgreement`. Sitting out extends captivity. That single
  rule is what makes a hold-out a gamble rather than a lever, and §12 depends on it.

---

## 3. The two utility functions

### 3.1 The fighter

Every decision a fighter makes about a fight or a contract scores against one function:

```
U = w_legacy·Legacy + w_money·Money + w_win·Winning + w_comp·Competition
  + w_fame·Fame + w_sec·Security + w_act·Activity + w_loyal·Loyalty + w_ego·Ego
  − w_risk·Risk − w_dmg·Damage − w_opp·OpportunityCost
```

The terms are cheap; **the weights are the design**. And the weights are *derived every time they
are needed*, from state the game already keeps:

| Weight        | Derived from                                                            |
| ------------- | ----------------------------------------------------------------------- |
| Legacy        | `personality.ambition`, rank, age, whether a belt is reachable           |
| Money         | `solvency(bank, nextCampCost)`, `lifetimeNet`, age, dependants           |
| Winning       | `condition.confidence`, streak, whether the record is still unblemished  |
| Competition   | `personality.aggression`, trait hooks                                    |
| Fame          | `personality.charisma`, `starPower` trajectory                           |
| Security      | contract `fightsRemaining`, `releaseRisk`, promotion tier                |
| Activity      | days idle, `patience.stage`, bank                                        |
| Loyalty       | `personality.loyalty`, `reSignDiscount`                                  |
| Ego           | `personality.ego`, recent result                                         |
| Risk          | age, `retirementDrivers.trauma`, rank, contract position                 |
| Damage        | `condition.headTrauma`, `bodyWear`, `freshness`                          |
| OpportunityCost | earnings outside the sport, camp cost, time to the next real offer     |

Nothing new is stored on `Fighter` for the weights themselves. That is not a space optimisation, it
is the same non-negotiable the repo already runs on: nothing derived is ever stored, so it can never
drift out of sync with the fighter it describes. It is also the only way §1's rule holds — a fighter
becomes a journeyman by their numbers changing, and stops being one the same way.

The essay's career-stage sketch, as a table of what should dominate:

| Situation                        | Dominant weights                        |
| -------------------------------- | --------------------------------------- |
| Broke 21-year-old, 0–0           | Money, Activity, OpportunityCost        |
| 26, 11–0, being scouted          | Legacy, Winning, Security (the call)    |
| 29, 5–4, no realistic ceiling    | Money, Activity, −Damage                |
| 31, ranked #5                    | Legacy, Winning, −Risk                  |
| 34, champion                     | Money, Legacy, −Risk                    |
| 38, former champion              | Money, −Damage, Competition (meaningful fights only) |

And personality modifies all of it, which is what stops two fighters in identical circumstances
being the same person.

### 3.2 The promoter

```
V = r_rev·Revenue + r_star·StarCreation + r_event·EventQuality + r_market·MarketGrowth
  + r_roster·RosterDevelopment + r_sport·SportingCredibility
  − r_cost·PurseCost − r_cancel·CancellationRisk − r_asset·AssetDestruction
```

Most of the inputs exist. The weights largely exist too, spread across fields that were each
introduced for their own reason:

| Weight              | Existing field                                                  |
| ------------------- | --------------------------------------------------------------- |
| Revenue             | `buzz`, `recentDelivery`, `drawWeight` in `world.ts`             |
| StarCreation        | `narrativeControl`, `MatchmakingStyle.entertainmentBias`         |
| EventQuality        | `recentDelivery` (a promotion is judged against its own standard)|
| MarketGrowth        | `MatchmakingStyle.domesticBias`, `baseCountry`                   |
| RosterDevelopment   | — (**absent**; this is what `handling` is for)                   |
| SportingCredibility | `MatchmakingStyle.rankAdherence`                                 |
| PurseCost           | `budget`, `minimumPurse`, `marketValue`                          |
| CancellationRisk    | `pullOutRisk` (exists, promoter mode only)                       |
| AssetDestruction    | — (**absent**; the missing half of matchmaking)                  |

So the promoter's function is closer to done than the fighter's. What is missing is the two negative
terms that make a matchmaker a matchmaker: what a fight costs, and who becomes less valuable if they
lose it.

The essay's promoter archetypes fall out of the weights rather than needing an enum, which matches
how `MATCHMAKING_STYLES` is already built:

| Promotion type | Dominant weights                                                    |
| -------------- | ------------------------------------------------------------------- |
| Tiny regional  | Revenue (ticket sales), −PurseCost, −CancellationRisk                |
| Developmental  | RosterDevelopment, StarCreation, −PurseCost                          |
| Prestige       | SportingCredibility, EventQuality                                    |
| Global         | All of them at once, which is what makes it hard                     |

### 3.3 Where they collide

Every booking is one function proposing and the other disposing:

> **Fighter:** I am 13–0. Why would I fight him?
> **Promoter:** Because I need to know whether you are actually good.
> **Fighter:** Pay me.
> **Promoter:** Fine. £15k more.
> **Fighter:** Title eliminator.
> **Promoter:** If you win.
> **Manager:** Get that in writing.

That exchange is four mechanics the game does not have: a fighter with a reservation price, a
promoter who can improve an offer rather than only make one, a non-monetary term (the eliminator
promise) with a value on both sides, and a manager who converts a promise into a contractual
condition. §6 and §12 specify them.

---

## 4. The bottom: is this even a career?

At the very beginning, MMA is not a career. It is a thing somebody is doing.

The game has a good creation layer for *who a fighter was before* — `origin.ts`'s three layers
(talent, discipline, attainment) are exactly the right shape, and `ATTAINMENT_META` already prices a
world-level amateur's name into `reputation` with `standingScore` fading it over six pro bouts. What
it does not have is the **decision** that layer describes the aftermath of.

The first questions are not about promotions:

1. Do I compete at all?
2. Do I turn professional?
3. How much of my life do I give it?

And the opportunity cost has to be real. A talented 20-year-old on £28k a year, with a partner, a
5–1 amateur record and a coach who thinks he is genuinely something, is being asked to cut his hours,
train twice a day, pay for coaching, diet, absorb injuries and fight for £500. Somebody with no job
and no alternative is being asked something completely different. That difference is the
`OpportunityCost` weight in §3.1, and it is the only weight in the model with no in-sport source —
it needs a life outside the cage.

### 4.1 Amateur careers are not XP farming

Four mindsets, all emergent from §3.1 weights plus a coach's influence:

- **The deliberate developer.** Fights up, deliberately, against varied problems: a wrestler, a
  southpaw, a pressure fighter, somebody physically bigger. Losing is not catastrophic. **A 9–3
  amateur is frequently a better prospect than a 4–0 one**, and the model must be able to say so —
  which it can, because `potential` and `aptitudes` are hidden and the record is not the evidence
  the engine ranks on.
- **The impatient prospect.** Turns pro at 3–0 because he thinks he is ready. Sometimes right.
  Sometimes you have just created a 21-year-old professional who has never learned to fight off the
  cage.
- **The amateur lifer.** Twenty-plus amateur fights, no professional intention. Provides opposition,
  which is exactly what doc 26's pool needs at the very bottom.
- **The delusional fighter.** The important one.

### 4.2 Fighters must not know their own potential

This is a non-negotiable and the game is already most of the way there: `Fighter.potential` is
documented as hidden true ceilings, the player sees a scouted estimate, and `camp/scouting.ts`
exists to produce that estimate with error.

The requirement this document adds is that **the fighter's own utility function must read the
scouted estimate, not the truth.** A 3–4 amateur who genuinely believes he has been unlucky turns
professional anyway, and a 7–0 prospect who has quietly understood his own ceiling starts optimising
for money at 26 rather than 31. Both are the same mechanism — self-assessment error — pointed in
opposite directions, and both are more interesting than accuracy.

Self-assessment error should be a function of `personality.ego`, `condition.confidence`, coach
quality and how much evidence exists (bout count). It should **shrink with results**, because losing
to people is how you find out.

---

## 5. The 0–0 professional, and the asymmetry underneath it

Two fighters, both officially 0–0 professional:

| | Fighter A | Fighter B |
| --- | --- | --- |
| Age | 22 | 28 |
| Amateur | 7–1 | 2–3 |
| Background | National-level wrestler | Average everywhere |
| Gym | Good | Nothing in particular |

The record says they are identical. The promoters do not. A regional promoter offers Fighter A an
0–2 opponent because they want to build him; Fighter B is offered *to* Fighter A, because his
economic role on that card is to be the opponent.

**This is what `Fighter.handling` is for, and it is why a dead field is the highest-value fix in
this document.** The plumbing beneath it is already built: `matchmaking.ts:194` shifts risk appetite
by ±0.35 on it, `matchmaking.ts:216-220` reorders and reshapes the entire offer slate by it, and
`favourFor` compounds it. Everything downstream of the decision works. Nothing makes the decision.

What should write it:

```
handlingFor(fighter, promotion) →
  'push'    when prospect value is high and cost is low, weighted by StarCreation
  'protect' when the fighter is an investment or a champion the promotion cannot afford to lose
  'test'    when the fighter has beaten four mediocre opponents and nobody knows what they are
  undefined for most of the roster, which is the honest default and already documented as such
```

Evaluated per promotion per fighter, on a slow cadence (re-evaluated after each of their fights
rather than every tick), and — crucially — **derived from what the promotion can see**: record,
age, finishes, gym, marketability, division need. Not from `potential`, which the promotion no more
knows than the fighter does.

---

## 6. The record-building phase: the slate is the decision

At 5–0, four offers:

| Opponent          | Record | Purse  | What it is       |
| ----------------- | -----: | -----: | ---------------- |
| Local journeyman  |   8–11 | £1,500 | Low risk         |
| Young prospect    |    6–0 | £2,500 | High risk        |
| Veteran           |   14–7 | £2,000 | Moderate         |
| Regional champion |   12–2 | £4,000 | Huge opportunity |

`offerOpponents` already returns a *spread* rather than a best match, and its header comment is
explicit that handing the player a pre-made decision is the failure mode. Two things are missing to
make the table above the thing it produces:

1. **Purse varies per offer.** Today an offer is an opponent; the money comes from the contract or
   from `defaultTerms`. A step up should *pay* more, because that is the trade being offered, and
   without it the decision is risk against nothing.
2. **The world's fighters evaluate the slate.** §2.2: they do not. Same slate, four fighters, four
   different answers is the whole point, and only the player currently gets to have an opinion.

One says "give me the champion". Another says "we are two fights from the call — absolutely not."
Both are correct, and neither is a difficulty setting.

---

## 7. The manager is a separate AI

Doc 16's manager model is good and this section does not touch its shape. It adds one field and one
weakness.

**An objective.** A manager should optimise for one of:

| Objective          | Reads as                                              |
| ------------------ | ----------------------------------------------------- |
| Career building    | Carefully graded progression, refuses premature steps |
| Money              | Maximises immediate purse, takes short notice         |
| Prestige           | Chases belts and name fights                          |
| Access             | Optimises specifically for a major-promotion call     |
| Activity           | Fight constantly, stay busy, stay paid                |
| Protection         | Avoids stylistically dangerous opponents              |
| Relationships      | Steers clients toward promoters they work with        |

The last one already half exists as the hidden `favour` vector, with `placementSummary` as its
derived observable. The rest is one field.

**Fallibility.** Managers must be **good or bad at evaluating fighters**, or management strategy
collapses into omniscient optimisation and the correct play is to find the manager with the biggest
numbers. The advice record (`managers.ts:146`) is already the right instrument: a manager who is
wrong is *visibly* wrong over time, and overruling him is a bet with a scoreboard. What is missing is
that his evaluation of an opponent should carry error drawn from his own competence — not from
`integrity`, which is a different failure (lying) with a different observable.

The fighter and the manager should also be allowed to **disagree**, with the fighter able to
overrule. A fighter who wants to fight everyone and a manager who says "you are 23 and 6–0, there is
no reason on earth to fight that 9–1 wrestler for £2,000" is one of the sport's most characteristic
scenes, and the game has both halves of it modelled separately and never in the same room.

---

## 8. The archetypes that must emerge, not be authored

Each of these is a prediction the design makes. If the weights in §3.1 are right, these appear
without anybody writing them; if they do not appear, the weights are wrong. That makes this section
the acceptance criteria for §3.

### The journeyman

Reaches 5–4 at 29. Not bad. The call is not coming. `Money` and `Activity` rise, `Legacy` falls,
`Risk` stops mattering because there is nothing left to protect. Starts accepting short notice.
Goes 5–5, 6–6, 7–8, 9–11 — and remains *useful*: knows how to fight, does not panic, makes weight,
tests prospects, says yes. Promoters love a dependable journeyman, and the promoter function should
say so explicitly through `−CancellationRisk`.

And occasionally the journeyman wins. Your carefully cultivated 7–0 prospect gets submitted by a
12–14 Brazilian you booked because you thought he was safe. `paperOdds` is already documented as the
thing that is supposed to be wrong sometimes; this is what it is for.

### The gatekeeper

The journeyman with better attributes. Beats everybody below a line and loses to everybody above it.
Emerges from a plateau in `potential` plus enough `Security` weight to keep taking the fight.

### The action fighter

17–9, eleven bonuses, a following. The promoter's function values him far above his record because
`Revenue` and `EventQuality` dominate his row — and `entertainmentValue` already computes exactly
this from what he does rather than from how famous he is, which keeps it non-circular. He survives
losses that would release somebody else, **and he knows it**, so his own weights shift toward putting
on a show. §15 is where that reaches the cage.

### The roster grinder

W L W W L W L W, forever, in the middle. Some stay obsessed with a belt. Some settle on "I am
probably never champion, but I can make £150k a year doing this" — which is a completely legitimate
emergent objective and should not be modelled as failure.

### The local legend

Regional star, sells 300 tickets in his own city, never leaves. The promoter's `Revenue` weight makes
him one of the most valuable people on a small roster while his ability sits at 61.

---

## 9. The short-notice lottery

This deserves to be a mechanic rather than a modifier, and career mode does not have it at all.

A major promotion loses a fighter. It searches for:

- correct weight class
- geographically available
- medically cleared (`Fighter.readyOnDay` already exists and is enforced)
- credible enough not to embarrass the card
- willing
- able to make the weight
- contractually available (`signingEligibility` already exists)

Suddenly a 10–3 fighter gets the phone call. Wednesday, for Saturday, against #27 in the world, and
he has 9kg to lose.

| Accepting                        | Costs                          |
| -------------------------------- | ------------------------------ |
| The opportunity itself           | No camp                        |
| A major-promotion contract       | A brutal cut                   |
| Visibility                       | Possibly a terrible matchup    |
| **Goodwill**                     | A substantial chance of losing |

Most of the machinery exists — `acceptanceOf` takes `notice`, `shortNoticeWillingness` is a live
trait hook with two traits pointing at it, `boutValue` pays +2 for it, `money.ts:shortNoticeBonus`
prices it. Three things are missing: the search itself in career mode, the writing of
`FightRecordEntry.shortNotice` (§2.3 — never set, so the credit is unreachable), and goodwill.

### Goodwill

> "Call Carlos. Carlos always says yes."

A hidden per-promotion resource on the fighter, raised by accepting and by taking short notice,
lowered by refusing. It buys: better card position, a call when a spot opens, patience during a bad
run, and a re-signing conversation rather than a release.

It must obey doc 16's house rule — **any hidden number must have a derived observable.** The
observable here is the promotion's own language: how they describe the fighter in the offer, whether
they say "we know you'll take it", whether the offers keep arriving during a skid. Never a bar.

---

## 10. Getting signed, and the bubble underneath it

A 10–1 regional fighter is not necessarily good enough. The record is **evidence, not truth**. 10–0
against weak opposition may mean very little; 8–3 against excellent opposition may mean a great deal.

`standingScore` already models this correctly and it is the best-built thing in the business layer —
outside credibility discounted by `transferRate(from, to)`, fading over six bouts via `carryWeight`.
What a scouting promotion should additionally read, none of which it currently does:

| Signal              | Available today                              |
| ------------------- | -------------------------------------------- |
| Opponent quality    | Yes — `record[].opponentId` plus the roster   |
| Age                 | Yes                                           |
| Finish rate         | Yes — `summary.koWins`, `submissionWins`      |
| Athleticism         | Partly — `naturals` are hidden, correctly     |
| Style               | Yes — attributes, `entertainmentValue`        |
| Marketability       | Yes — `starPower`, `personality.charisma`     |
| Nationality/market  | Yes — `nationality` vs `promotion.baseCountry`|
| Weight-class need   | Yes — `freeAgency.ts:appetite` divisional need|
| **Recent trajectory** | **No** — nothing reads direction of travel  |

Trajectory is the significant gap. A fighter improving fast and a fighter who peaked two years ago
look identical to `appetite`, and telling them apart is most of what scouting is.

And the need term should be allowed to be **ugly**: a promotion desperate for heavyweights hands
opportunities to mediocre heavyweights that elite lightweights cannot get. `appetite` already has
`need = 1 - divisionDepth/12`, so this is nearly free — it just needs the division shape from doc 26
§4.1 to make thin divisions genuinely thin.

---

## 11. After signing, the goal changes

### 11.1 The rookie

No longer protecting an undefeated record — protecting a **roster position**. That is a different
optimisation and the game cannot currently express it, because `Security` has no weight and
`releaseRisk` is not visible to the fighter's own decisions.

At 1–1 in the promotion, the next opponent matters enormously. Refusing a dangerous replacement is
correct and costs goodwill (§9). Accepting everything is also correct, and buys it.

### 11.2 The 0–2 danger zone

Sign at 11–2. Lose. Lose. Now 11–4, with roughly the same skills and a career in crisis. Fight three
is win-or-released, and `releaseRisk` already produces exactly that pressure and
`describeReleaseRisk` already says it in words.

What is missing is the **behavioural response**, which should differ by personality:

| Response              | Driven by                                     |
| --------------------- | --------------------------------------------- |
| Fight conservatively  | Low `aggression`, high `discipline`           |
| Hunt a finish         | High `aggression`, `Fame` weight              |
| Change camp           | High `ego` (already drives `gymSwitching`)    |
| Change division       | High `ambition` (already drives `weightMoves`)|
| Blame the coach       | High `ego`, low `professionalism`             |
| Drop back a level     | High `Security`, low `Legacy`                 |

Every driver in that right-hand column already exists. None of them are read at this moment.

### 11.3 The contender

At #11, `opponent value` starts to matter more than winning. Why fight #14? Risk exceeds reward.
He wants #7. #7 wants #3. #3 wants the champion.

**Everybody wants to fight upward**, so the promotion has to cajole. The levers, which are the
promoter's real toolkit and currently amount to "offer the bout":

- money
- main-event position
- an explicit title-eliminator promise
- a promise about what comes next
- short notice, which changes the whole calculation
- a rivalry, which makes the fight want itself (`rivalries.ts` exists)

### 11.4 The aging contender

The most interesting decision state in the sport. 34, ranked #6, and there may be **one run left**.
Wait for the right opponent? Fight #10 and risk everything? Demand #3? Change division? Take the
replacement?

A 24-year-old contender can absorb a setback. A 35-year-old cannot. **Age changes risk tolerance**,
and it is a single term in §3.1 — `Risk` weight rising with age — that produces most of the
behaviour in this section for free.

### 11.5 The champion

Not an enum. A weight profile:

| Champion type | Profile                                          |
| ------------- | ------------------------------------------------ |
| Fighting      | High Activity, low Risk aversion                 |
| Legacy        | Legacy dominant; wants the hardest challenger    |
| Business      | Money dominant; wants the biggest payday         |
| Protective    | Risk dominant; minimises exposure                |
| Double-champ  | Legacy + Ego; `weightMoves`                      |
| Record hunter | Legacy expressed as defence count                |
| Aging         | −Damage dominant; every fight could be the last  |
| Superstar     | The relationship inverts — the promotion needs *them*, and "no" becomes a real answer |

That last row is a genuine mechanic and not flavour: above some threshold of `starPower` relative to
the promotion's `buzz`, refusal stops costing goodwill and starts costing the *promotion*.

### 11.6 The promoter at championship level

The same booking, five answers:

| Lens        | Answer                                                  |
| ----------- | ------------------------------------------------------- |
| Sporting    | The #1 contender deserves it                             |
| Commercial  | The #4 contender sells three times as many buys          |
| Strategic   | Champion vs former champion is a much bigger event       |
| Market      | We need a Brazilian headliner for São Paulo              |
| Timing      | #1 is injured and we need a main event in six weeks      |

`contenderQueue` already blends the first two and part of the fourth. Strategic and timing are
absent, and timing is the one that produces the sport's strangest and most authentic bookings.

---

## 12. Contract games

Fighter A: 24, 14–1, ranked #8, on £40k/£40k, **one fight remaining**.

The promotion's options:

| Move       | What it is                                              |
| ---------- | ------------------------------------------------------- |
| Extend now | £100k before he gets more leverage                      |
| Delay      | No title fight until he re-signs                        |
| Risk it    | Book him against #4 and hope                            |
| Invest     | Push him anyway, because he could become a star         |

The fighter's counter is obvious and correct: one more win and his negotiating position explodes, so
he refuses the extension. That is an actual strategic game between two parties, and the pieces are
already on the board — `repaperOffer` is the "extend now" move in full, `matchingRights` is priced
and sold rather than assumed, `tollAgreement` means holding out is a gamble, and
`renegotiationTriggers` is the visible route the fighter can chase.

What is missing is that **the promotion never plays**. `repaperOffer` fires on the fighter's streak
and their contract's unfairness; it has no notion of leverage, no notion of "he is about to become
expensive", and no ability to withhold a title shot as a negotiating position. §3.2's promoter
function is where those decisions would live.

---

## 13. Results change people

The biggest single addition to the fighter model, and the one that turns §3.1's weights from static
personality into a career.

A 12–0 fighter who believed he was invincible is knocked out. Seven futures:

| Response             | Mechanism                                                    |
| -------------------- | ------------------------------------------------------------ |
| Healthy adaptation   | `lesson` on the record → the camp that follows (already built, doc 27 §2) |
| Confidence collapse  | `lossImpactMultiplier` (built) — but recovery now exists too  |
| Denial               | `egoDeflectionMultiplier` (built) — changes nothing, and that is the point |
| Camp blame           | Gym switch, `ego` drives `gymSwitching`                       |
| Weight blame         | Division move, `ambition` drives `weightMoves`                |
| Obsessive response   | Training intensity up, freshness down (`intensity.ts` exists) |
| Career reassessment  | **Absent** — Legacy weight falls, Money rises                 |
| Financial pivot      | **Absent** — takes whatever pays                              |

Five of eight already have mechanisms. The two absent ones are the two that change what kind of
career this becomes, and they are both single weight adjustments in §3.1.

Winning causes problems too, which is less obvious and equally important. An upset win produces
overconfidence: the fighter demands opponents he is nowhere near ready for. Or his manager says
"now — capitalise immediately", or "do not fight for six months, wait for the call". A 6–2 fighter
beating a former major-promotion veteran is a strategic event, and today it is a row in a table.

---

## 14. The end, and the thing after the end

### 14.1 Promotions can exploit decline

Ugly, and one of the fundamental mechanisms of combat-sports promotion. An aging famous fighter is
`starPower 85 / ability 58`. Book him against `ability 76 / starPower 31 / age 26`.

If the youngster wins: **"He beat the legend."** The veteran gets a good payday. The promotion has
transferred reputational capital from an asset that is depreciating to one that is appreciating.

The pieces exist — `starPower` and `overallRating` are already independent axes, and
`aftermath.ts`/`heat.ts` already move star power on results. What is absent is any promoter logic
that *seeks* this matchup, and it belongs squarely in `StarCreation`.

### 14.2 Retirement is not a threshold

`retirement.ts` is already much better than a threshold: `retirementDrivers` weighs age, trauma,
wear, skid and confidence, discounts them by ambition and resilience, and `driftUrge` models the
sport's commonest ending — nobody called, and one day that was that. `retirementReason` reads the
reason off the same arithmetic that produced the decision.

Four drivers from the essay are absent, and all four are economic or social rather than physical:

- **Money.** A 38-year-old millionaire former champion retires; a broke 41-year-old regional fighter
  cannot afford to. `bank` and `lifetimeNet` exist and neither is read here.
- **Family and identity.** No representation, and this is the same missing "life outside the cage"
  as §4's opportunity cost.
- **Employment opportunity.** Whether anybody is still offering. `driftUrge` approximates it through
  `reputation`, which is a decent proxy and probably enough.
- **Championship prospects.** A 39-year-old champion asking "why would I retire?" is not the same
  person as a 39-year-old on a four-fight skid, and the current model treats their ages identically.

### 14.3 Comebacks

Absent entirely, and cheap to add given `retiredDay` is a single optional field. The triggers write
themselves: money runs low, a promotion offers a number that changes everything, a rival calls them
out, the champion gets injured, they miss it, or they watch somebody they believe they can beat win
the belt.

A comeback should be a `driftUrge` in reverse: an urge, evaluated on a slow cadence, that most
fighters never act on.

---

## 15. The last connection: career state must reach the cage

This is what separates a management layer bolted onto a fight engine from one game.

The engine already accepts a `GamePlan` (`domain/gameplan.ts`), already has a pace dial
(`basePaceDial`), already reads `condition.freshness` and `headTrauma` into what a fighter brings in,
and already has `gamePlanAdherence` for whether they stick to it. Everything needed to receive this
is built. Nothing sends it.

| Career state                   | What should change in the cage                  |
| ------------------------------ | ------------------------------------------------ |
| Protecting a roster spot       | Lower risk, fewer exchanges, decision-seeking    |
| Reckless 22-year-old prospect  | Higher pace, higher risk, finish-seeking         |
| Final title run at 35          | Accepts risks a younger version would not        |
| Fighting hurt for needed money | Compromised body — freshness/injury already model this, if the *decision* to fight hurt exists |
| Contract expiring, needs a show| Chases the finish, takes exchanges               |

Note that the last row is where §9's goodwill, §12's contract games and §8's action fighter all
arrive at the same place: a fighter's incentive to be exciting is a career fact that changes how the
fight goes. That loop closing is the point of the whole document.

---

## 16. Data shapes

New fields, kept deliberately small. Everything else in this design is derived.

```ts
// On Fighter
handling?: FighterHandling;              // exists; needs a writer, not a field
goodwill?: Partial<Record<PromotionId, number>>;  // §9, hidden, observable through offer language
selfBelief?: number;                     // §4.2 — assessment error, shrinks with bouts
comebackUrge?: never;                    // derived, not stored

// On Manager
objective: ManagerObjective;             // §7
evaluation: number;                      // §7 — competence, distinct from integrity

// On PromotionalAgreement
promises?: readonly ContractPromise[];   // §11.3 — "title eliminator, if you win"

// On FightRecordEntry
shortNotice?: boolean;                   // exists; needs a writer (§2.3)
```

And one new pure module, `business/ambition.ts`, holding the fighter's utility function and the
weight derivation. It must be pure, take a fighter plus world context, and return a score plus the
single sentence explaining it — the same shape as `acceptanceOf`'s `{ chance, concern }`, which is
already the right precedent.

---

## 17. Phasing

Each phase is independently shippable and independently measurable. Phase 0 is the one to do first
regardless of whether the rest is ever built.

| Phase | What | Closes |
| ----: | ---- | ------ |
| **0** | Write `handling`. One function, per promotion per fighter, re-evaluated after each of their bouts. | §5. Un-deadens three existing code paths at once. |
| **1** | Call `acceptanceOf` in `world.ts:buildNight`. World fighters can refuse. | §2.2. Makes the sport's population have opinions. |
| **2** | Money reaches the decision: wire `solvency`, `desperationDiscount`, `shortNoticeBonus` into acceptance, and vary purse across the offer slate. | §6, §8. Three dead functions get callers. |
| **3** | `business/ambition.ts` — the fighter's utility function, replacing `acceptanceOf`'s ad-hoc terms with derived weights. | §3.1. |
| **4** | Age, rank and contract position as weights: risk tolerance by career stage. | §11.1, §11.2, §11.4. |
| **5** | The short-notice call in career mode, and goodwill. | §9. |
| **6** | The promoter's negative terms — purse cost and asset destruction — plus card need and timing. | §3.2, §11.6. |
| **7** | Manager objective and fallibility. | §7. |
| **8** | Results change weights: career reassessment and the financial pivot. | §13. |
| **9** | Retirement economics and comebacks. | §14. |
| **10** | Career state reaches the game plan. | §15. |

Phases 0–2 are small, are mostly wiring things that already exist, and between them produce most of
the visible change. They should be measured before phase 3 is written, on the same principle doc 26
§8 applies to its own phase 1.

**Dependency:** phases 1, 2 and 5 need doc 26's pool to have a population. A world where a fighter
can refuse but there is nobody else to book is worse than one where they cannot.

---

## 18. What must never happen

- **No career-path enum, no archetype field, no `isJourneyman`.** §1. If a career shape has to be
  stored, the weights are wrong.
- **No omniscient fighter.** The fighter's function reads the *scouted* potential, never the true
  one. §4.2.
- **No omniscient manager.** A manager who evaluates correctly turns management into arithmetic.
  §7.
- **No hidden number without a derived observable.** Doc 16's house rule, and it binds `goodwill`,
  `selfBelief` and `handling` alike.
- **No walls where a price would do.** Doc 16's other rule. A fighter who will not take a fight has
  a number that would change their mind, even if the promotion cannot pay it.
- **Promoters do not rig fights.** "Who do I need to lose?" means booking a veteran against
  somebody dangerous — never touching the result. If the veteran wins, he has earned it, and the
  promotion has to live with him.
- **A losing record must not be a dead end.** The sport is full of people who were 4–6 at 24 and
  19–8 at 32. `retirement.ts` already learned this lesson once (`careerStage`); nothing added here
  may unlearn it.
- **The player is never moved by the world.** `world.ts:1146` already had to learn this the hard
  way. Every mechanism in this document that acts on world fighters must take the exclusion.

---

## 19. Definition of done

Measurable, on a twenty-year world:

1. **`handling` is non-`undefined` for a minority of each roster**, and pushed fighters demonstrably
   receive softer slates than the promotion's average (measurable directly off `offerOpponents`
   output).
2. **World fighters refuse bouts**, at a rate somewhere near the sport's — a few percent of offers,
   concentrated in ranked fighters and in fighters with grievances.
3. **A broke fighter takes fights a solvent one refuses.** Two identical fighters, differing only in
   `bank`, produce different acceptance rates.
4. **Four 7–0 prospects with different personalities and circumstances produce four distinguishable
   career shapes** over the following five years, without any archetype being stored.
5. **A journeyman population exists**: fighters with losing records, positive bout counts, and
   *rising* bank balances, who are still being booked at 33.
6. **A journeyman beats a prospect** at a non-trivial rate, and the prospect's career visibly
   changes afterwards.
7. **Being cut lands a fighter in the pool** and re-signing takes more than one quarter (doc 26 §4.4
   is a prerequisite).
8. **A short-notice acceptance is recorded** — `FightRecordEntry.shortNotice` is `true` somewhere in
   a simulated year, and `boutValue`'s +2 is reachable.
9. **Ranked fighters decline fights below them** and the promotion's cajoling levers move the answer.
10. **Retirement reasons diversify**: money and championship prospects appear alongside age, trauma
    and drift.
11. **At least one comeback** occurs per simulated decade, for a stated reason.
12. **`advanceWorld` per-tick cost is measured before and after each phase**, and stated.

---

## 20. Open questions

- **Where does life outside the cage live?** §4's opportunity cost and §14's family/identity both
  need a fighter to have something other than fighting. The cheapest honest version is a single
  derived "what else they have" figure from origin, age and education — but it is new state in a
  model that has resisted new state, and it may be that the right answer is to model only the
  *money* side and let the rest stay off-screen.
- **Does the player get the same machinery?** Career mode is a fighter making these decisions
  manually. The utility function should probably *advise* the player through the manager and never
  act for them — but that means the AI and the player are running different code, which the repo has
  generally avoided.
- **How much error is right in self-assessment?** Too little and every fighter is a rational agent;
  too much and careers become noise. This needs measuring rather than choosing.
- **Should goodwill be per-promotion or per-matchmaker?** Per-promotion is cheaper and probably
  enough, but the real thing is a relationship with a person, which is also what `Manager.connections`
  decided to model as per-promotion for the same reason.
- **Does the promoter's function need to be visible in promoter mode?** Doc 13 forbids the
  spreadsheet. A multi-objective score shown as numbers is exactly that spreadsheet; shown as five
  competing opinions in a room, it is the mode's best screen. That is a UI question with a design
  answer and it is not settled.
