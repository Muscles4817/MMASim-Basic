# 17 — Money

> Status: **built**, except revenue points, the bonus pool, the locker-room bonus, the
> purchasable one-shots and the retirement ledger — all of which need doc 12's events or doc
> 16's contracts underneath them first.
>
> What ships: `marketValue()`, a show/win `purseFor()`, `minimumPurse`, the deduction chain,
> camp costs debited when a camp runs, sponsorship, weight-miss forfeiture, solvency, and the
> bank on the fighter. `boutValue()` is now `drawWeight()` and is no longer denominated in
> money.
>
> Split out of [16 — Contracts, Free Agency & Managers](./16-contracts-free-agency-managers.md)
> because contracts, purses, costs and the bank in one document is unreadable. Doc 16 owns the
> *terms*. This document owns the *currency* they are denominated in.

## Why this document exists

Both critics of doc 16 found the same hole from opposite ends, which is the strongest signal
a design review produces.

**The fun brief**: `purseFor()` is called in exactly two places and both are display. Nothing
in `packages/` accumulates earnings. There is no balance and nothing to spend it on. Every
term in doc 16 negotiates the allocation of a number that never leaves the screen, so the
entire contract layer is a menu the player has no reason to read.

**The realism brief**: fighters are independent contractors. They pay for their own camp,
coaches, strength and conditioning, nutrition, sparring partners, travel and tax. A fighter on
£12k to show and £12k to win nets a few thousand pounds for three months' work. It is the
single most-cited economic fact about the sport and doc 16 did not contain it.

One says *money is not a resource*; the other says *gross is not net*. They are the same hole.
This is the fix.

**The rule that keeps it honest**: money must have a **sink**, and the sink is the one system
the game already has and has just made load-bearing — **camp quality**. Money buys better
rooms; better rooms buy attributes; attributes are the whole game. Every pound in this
document eventually resolves to that.

---

## Part 1 — The bank

One field, and it is the field the whole design was missing.

```ts
// on Fighter
bank: number;          // thousands. Can go negative. That is the point.
lifetimeGross: number; // for the retirement ledger
lifetimeNet: number;
```

`Promotion.budget` already exists, is documented as "cash on hand, in thousands", and is
**never written to anywhere in the codebase**. Promoter mode makes it live.

The bank is not a score. It is a constraint that decides what kind of camp you can run, which
decides what kind of fighter you become. Its most important property is that it can go
negative, because that is when the game starts playing your desperation back at you.

---

## Part 2 — The purse

### What `purseFor()` gets wrong

Four defects, all confirmed against the shipped implementation
(`packages/engine/src/business/heat.ts:242`).

| Defect | Evidence | Consequence |
| ------ | -------- | ----------- |
| **Returns one number** | `purseFor(fighter, promotion, isTitleFight): number` | Doc 16's central security-versus-upside decision has nothing to attach to. The sport pays show and win |
| **Linear in star power** | `remap(starPower, 1, 100, 4, 250)` | 62:1 bottom-to-top in a straight line. Real MMA pay is a power law |
| **`tierFactor = prestige / 100`** | Frontier 0.22 against Apex 0.95 — a 4.3× spread | The formula contradicts the promotion table it reads from. The seed budgets say 47:1 and the seed prestiges say 4.3:1 |
| **No floor** | star 1 / rep 1 at Apex returns ~£5.7k | Below any global promotion's minimum. There is no `minimumPurse` field |

And two consequences specific to doc 16:

- **`purseDemand` must not be in `marketValue`.** `purseFor()` multiplies by
  `traitMul(traits, 'purseDemand')`, which is what a fighter *asks*, not what they are
  *worth*. A `Mercenary` (×1.35) is not worth 35% more. Reusing this for doc 16's fairness
  ratio would make every `Mercenary` permanently underpaid by construction and every
  `Company Man` permanently overpaid — silently inverting two of the three business traits,
  through the one number that drives resentment, relationship and re-signing.
- **`titleFactor = 1.5` cancels the grievance the docs promise.** Doc 08 says the pay model
  exists so "a promotion ends up paying a mediocre draw more than an excellent champion".
  Run the seed roster, which is built to produce exactly that pair, and the draw gets ~£233k
  against the champion's ~£253k. The ×1.5 rescues the champion and deletes the intended story.

### The replacement

Two functions where there was one.

```ts
/**
 * What a fighter is WORTH to this promotion, per bout, in thousands.
 * Total package: show + win. No demand modifier, no title modifier — a title
 * is a property of a bout, not of a person, and demand is a property of the
 * negotiation, not of the worth.
 */
function marketValue(fighter: Fighter, promotion: Promotion): number {
  // Superlinear in star power because MMA pay is a power law, not a ramp.
  // Exponent 2.6 and a 700 ceiling put a star-100 at ~£670k against a £24k
  // floor at the same promotion — 28:1 on disclosed purse, before points.
  const star  = 3 + 700 * (fighter.starPower / 100) ** 2.6;

  // Merit stays near-linear and deliberately small. Being respected is worth
  // about a tenth of being famous, which is the sport's least comfortable truth.
  const merit = 2 + 55 * (fighter.reputation / 100);

  // Superlinear in prestige. The old prestige/100 gave a 4.3x spread between
  // developmental and global for the SAME fighter; the real spread is 10-20x
  // and it is structural (broadcast revenue). 2.2 gives 25:1.
  const tier  = (promotion.prestige / 100) ** 2.2;

  return (star + merit) * tier;
}

/** What they are actually PAID for this bout. Floor applies last. */
function purseFor(agreement, cardPosition, promotion): { show: number; win: number } {
  const mul = CARD_POSITION_PURSE[cardPosition];   // doc 12: 2.5 / 1.6 / 1.0 / 0.5
  const show = agreement.showPurse * mul;
  const win  = agreement.winBonus  * mul;
  const total = Math.max(show + win, promotion.minimumPurse);
  // ...rescaled to the floor keeping the negotiated split
}
```

`purseDemand` moves to the negotiation, where a `Mercenary` *asks* 35% more and a good
manager sometimes gets it. That is what the trait always meant.

`reSignDiscount(personality)` — currently dead code with no callers, running −15% to +30% off
loyalty — becomes live here, applied to the incumbent's offer at renewal. It is the only piece
of this system that already exists.

### Where it lands

Per bout, in thousands, show and win combined, **all at main-card position (×1.0)** so the two
columns compare like with like — the old model has no card-position system at all, since doc
12's multipliers are themselves unbuilt.

| Fighter | Promotion | Old `purseFor` | **New** | Real world | Verdict |
| ------- | --------- | -------------- | ------- | ---------- | ------- |
| Debutant (star 8, rep 5) | Frontier | 5.7 | **1.0** (floor) | £400–1,500, commonly £500/£500 | Was ~6× too high |
| Newcomer (star 12, rep 20) | Apex | 42 | **24** (floor) | £12k/£12k | Was ~1.8× high, and unfloored |
| Journeyman (star 25, rep 35) | ECC | 33 | **5.2** | £3k–£10k for a regional headliner | Was ~4× too high |
| Headliner (star 45, rep 60) | Vanguard | 99 | **50** | £50k–£100k at main event | Right once position is applied |
| Contender (star 55, rep 70) | Apex | 172 | **171** | £60k–£100k show, so £120k–£200k | Unchanged, and right |
| Champion (star 70, rep 92) | Apex, title | 329 *(incl. ×1.5)* | **297** *(no title factor)* | ~£500k **plus points** | See below |
| Superstar (star 100, rep 80) | Apex | 283 *(ceiling ~433)* | **669** | £3M disclosed **plus ~£30M points** | An order of magnitude recovered |

Apply doc 12's card-position multiplier and the top two rows land where the real numbers live:
a title fight is a main event, so the champion is on **£742k** and the superstar headliner on
**£1.67M**, with revenue points on top of both. The title money has moved out of a flat ×1.5 on
the base and into position and points, which is where it belongs — and which is what stops it
cancelling the champion-versus-draw grievance.

Note the middle of the table barely moves. That is deliberate: the model was never wrong about
a ranked contender. It was wrong at both ends, and wrong about the gap between promotions.

### The grievance the docs promise, which did not previously fire

Doc 08 states that the pay model exists so that "a promotion ends up paying a mediocre draw
more than an excellent champion, and then has to explain it to the champion". The seed roster
is built to produce exactly that pair — a `Star 82 / Rep 66` draw with thirteen career losses,
and a reigning champion at `Star 48`. Run them.

| At Apex, main card | Draw (82/66) | Champion (48/92), title | Result |
| ------------------ | ------------ | ----------------------- | ------ |
| Old model | 233 | 251 | **The champion out-earns the draw.** The story is cancelled |
| New model | 410 | 142 | **2.9:1.** The story fires, hard |

The ×1.5 title factor was rescuing the champion by almost exactly the amount the design
intended him to be short by. Removing it and steepening the star term is what makes doc 08's
central claim true in the arithmetic rather than only in the prose.

Which is the comparison that actually matters — the *same* fighter (star 45, rep 60),
everywhere, main card:

| | Frontier | ECC | Rising Sun | Vanguard | Apex | Spread |
| --- | --- | --- | --- | --- | --- | --- |
| Old | 33 | 57 | 87 | 99 | 142 | **4.3:1** |
| New | 4.5 | 15 | 38 | 50 | 112 | **25:1** |

The old spread contradicted the promotion table the function reads from: the same seed file
gives Apex a budget of 42,000 against Frontier's 900. A 4.3:1 pay spread across a 47:1 budget
spread is not a design decision, it is an oversight. 25:1 is the MONEY axis of doc 16's
triangle, and it is what makes "take the smaller cheque at the global promotion" a genuinely
painful decision rather than a rhetorical one.

### `minimumPurse`

One new field on `Promotion`. Total package (show + win), thousands, applied **after** the
card-position multiplier — otherwise an Apex prelim debutant lands on £12k, below the floor
the promotion advertises.

| Promotion | `minimumPurse` | Reads as |
| --------- | -------------- | -------- |
| Apex | 24 | £12k / £12k |
| Vanguard | 8 | £4k / £4k |
| Rising Sun | 8 | £4k / £4k |
| ECC | 3 | £1.5k / £1.5k |
| Frontier | 1 | £500 / £500 |

The floor is also a promoter-mode lever: raising it is expensive, visible, buys relationship
across the whole roster, and is exactly the thing a promotion under pressure quietly does not
do.

### The show/win split, and the exchange rate

Default 50/50 — the historic convention — drifting show-heavy at the top, because a genuine
star does not accept half their money contingent on the judges. The negotiation is doc 16's,
and the exchange rate the promotion quotes is a scouting report on how they rate you.

### Revenue points

The highest-value omission in the old design and the term that makes "become a star" a
mechanically different career from "become a champion".

```
   points are on the EVENT's broadcast/PPV revenue (doc 12), not on the bout
   main event only, or co-main by negotiation
   0-5 points
   requires promotion.revenueShareCapable
```

Attaching them to the event rather than the bout does three jobs at once: it is how PPV points
actually work (they are on buys), it is why a promotion without a platform structurally cannot
grant them — which is doc 16's unmatchable term — and it means the base purse formula does not
have to carry the entire power law on its own.

For a headliner, revenue share dominates disclosed purse by an order of magnitude. A fighter
trading base for points is betting on their own draw; a promotion granting points is admitting
the fighter is bigger than the brand. Both of those are stories.

### `boutValue()` is in the wrong units and should stop being currency

`boutValue()` caps at ~£570k for two star-100s in a maximally heated title fight. Two purses
for the same pair, under the new model at main-event position, come to ~£3.3M. Under the old
model they came to ~£866k against the same £570k. **The promotion loses money on its marquee
fights and profits on its prelims, which is precisely inverted**, and it was already inverted
before this document raised the top end.

The resolution is not to rescale it. It is that `boutValue()` was never the promotion's
revenue: doc 12's event equation is.

```
   gate      = min(capacity, demand) × ticketPrice(prestige, main-event star power)
   broadcast = PPV buys × price, or a flat rights fee
   costs     = purses + bonuses + production + marketing
```

So `boutValue()` should be reinterpreted and renamed as a **draw weight** — a unitless score
for how much of an event's demand this bout is responsible for, used to place bouts on the
card, to split attention, and as the basis for allocating revenue points. It must stop being
denominated in thousands, because two functions in different units of the same currency is a
bug waiting to be discovered by whoever builds promoter mode.

---

## Part 3 — Gross is not net

The cheapest high-value addition in the review. One multiplier chain, and it generates half a
dozen behaviours the game currently has to script.

| Deduction | Rate | Why this number |
| --------- | ---- | --------------- |
| **Manager** | 8–15% of purse, contracted | Modal MMA management fee is 10%. 20% is an outlier and regarded as predatory |
| **Coaches and corner** | 10% of purse | The standard gym cut. Note it is a *percentage*, which is why it never bankrupts you |
| **Camp** | **fixed**, £3k–£25k | The important one. See below |
| **Medicals, licensing, camp travel** | ~4% of purse, floored at £0.5k | One line, because the paperwork is not a game (doc 15) |
| **Tax** | 30% of purse minus deductible costs | Self-employment. One line, and it is why the win bonus is worth less than it looks |
| **Living** | `1.5 + 2.5 × (starPower/100)` per month | You live like the fighter people think you are. `Party Animal` ×2.2, professionals ×0.8 |

**Camp being a fixed cost is the load-bearing part.** Everything else scales with the purse
and therefore cannot hurt you. Camp does not: it is paid before the fight, in full, win or
lose. That is what converts doc 16's base-versus-win-bonus from an expected-value calculation
into a solvency decision — which is exactly what the fun brief said was missing and the realism
brief said was true.

### What it feels like: an Apex newcomer on £12k/£12k

Eight-week camp at Northgate (quality 62), three months of living costs.

| | **Wins** | **Loses** |
| --- | --- | --- |
| Gross | 24.0 | 12.0 |
| Manager (10%) | −2.4 | −1.2 |
| Corner (10%) | −2.4 | −1.2 |
| Camp | −6.5 | −6.5 |
| Medicals & travel | −1.0 | −0.5 |
| Tax (30% of the remainder) | −3.5 | −0.8 |
| Living, 3 months | −6.0 | −6.0 |
| **Net** | **+2.2** | **−4.2** |

That single table is the most-cited fact about the sport, and it is now in the game. It
produces, without any of them being written as a rule: taking short-notice fights, training
cheap, holding a day job, not pulling out when hurt, and fighting on three years too long.

Note what it does to the win bonus. Winning is worth £6.4k net against a headline £12k, because
the manager, the corner and the taxman are all paid out of it first. A fighter who loads the
win bonus at a generous exchange rate and then goes 1-1 has funded nothing.

---

## Part 4 — Income the old design did not have

### Sponsorship, and the outfitting policy

Doc 15 rejected modelling outfitting and sponsorship. It rejected the right *detail* and the
wrong *event*. Before 2015 an individual in-cage sponsor was a mid-tier fighter's largest
income stream; a single uniform deal abolished them across a whole promotion overnight and cut
real income for most of its roster. That is not texture. That is a repricing event.

One enum on `Promotion`, one income line on the fighter.

| Policy | Who has it | Fighter income per bout |
| ------ | ---------- | ----------------------- |
| `open` | ECC, Frontier, Rising Sun | `0.5 + 60 × (starPower/100)^1.6`, ×1.8 in the fighter's home country |
| `uniform` | Apex, Vanguard | Fixed tier by bouts with the promotion, plus a royalty on own-name merchandise |

Uniform tiers, thousands per bout: 1–3 bouts **2.5**, 4–5 **5**, 6–10 **10**, 11–15 **16**,
16–20 **21**, 21+ **26**, champion **40**.

Run the numbers on the journeyman at ECC: purse £5.2k, open sponsorship £7.0k. **His sponsors
pay him more than the promotion does.** That is accurate, it is a thing almost no sim
expresses, and it gives doc 16's MONEY-versus-LEVEL trade a second edge — the regional show
pays less *and* lets you keep your sponsors; the global one pays more *and* takes them.

It also creates the quiet manager misalignment doc 16 describes: he takes 15–20% of
sponsorship against 10% of purse, so he would rather you signed with the smaller promotion,
and he will not tell you that.

### The bonus pool

From doc 12, now wired to something. Fight of the Night and Performance of the Night, sized by
the promoter, awarded by the simulation on what actually happened.

At Apex the default is **£50k**, which is a full twelve-week camp at Summit and change. That is
the "one more fight" hook — not the contract — and it is the mechanism by which an exciting
loss is worth something in a game that otherwise pays only the raised hand.

### The locker-room bonus

Signing bonuses are comparatively rare in MMA. What is ubiquitous is the **undisclosed
discretionary post-card bonus** — off the books, unenforceable, never in the contract, handed
over in an envelope. It is a genuine loyalty instrument and it is cheap, deniable and
deeply legible.

10–100% of show purse, at the promoter's discretion, after the card. It interacts directly
with doc 16's `resentment`: a fighter who has been given one before and does not get one this
time **has been sent a message**, and knows it.

### Weight-miss forfeiture

Nearly free, because all the plumbing exists — `weightMissRisk` is already computed in
`divisionMove.ts`, already has a trait hook, and `Weight-Cut Gambler` already multiplies it by
2.6. Currently the game warns about it and then nothing happens.

**20% of show purse forfeited to the opponent. 30% if egregious.** That makes
`Weight-Cut Gambler` a *business* trait as well as a fight-night one, and it makes the
nutritionist below a purchase with a payback period.

---

## Part 5 — The sink

Money that only accumulates is a score. The sink is camp, because camp is the one system that
converts money into the thing the game is actually about.

### Camp costs

```
   weeklyRate(gym) = 0.15 + 2.2 × (gym.quality / 100)^2.5      // thousands per week
   campCost = weeks × weeklyRate(gym)
```

| Gym | Quality | 8-week camp | 12-week camp |
| --- | ------- | ----------- | ------------ |
| The Basement | 44 | 3.5 | 5.2 |
| Northgate Fight Club | 62 | 6.5 | 9.8 |
| Blackwater Muay Thai | 80 | 11.4 | 17.1 |
| Atlantic Jiu-Jitsu | 82 | 12.1 | 18.1 |
| Ironworks MMA | 84 | 12.6 | 18.9 |
| Red Star Combat | 88 | 14.2 | 21.3 |
| Summit Combat Academy | 92 | 15.5 | 23.2 |

Superlinear in quality, because the whole point is that the best rooms should be out of reach
rather than merely expensive. A created fighter starts at The Basement (quality 44, no head
coach) signed to Frontier Fights, earning £1k a bout. Getting to Summit is a *project*.

**`GymPicker` gains a second gate.** It currently gates on reputation alone —
`required = max(0, gym.prestige − 35)`, so Summit needs reputation 55 — and once you are in,
you are in forever. Adding "and can you fund a camp there?" stops the best rooms being a
one-way ratchet, and means a fighter who loses twice trains somewhere worse next camp. A death
spiral you can see coming three months out is a far better thing than one that arrives.

### Purchasable one-shots

Each of these plugs into a system that is already built, which is the criterion for being on
this list at all.

| Purchase | Cost | Effect | Plugs into |
| -------- | ---- | ------ | ---------- |
| **Specialist coach, one camp** | 25 | +40% gains in one focus | `coachEffectiveness()` |
| **Full scouting report** | 8 | Halves the uncertainty band on the opponent | `scoutOpponent()`, doc 05 |
| **Recovery block** | 15 | Halves `weeksUntilFit` | Injuries, doc 07 |
| **Imported sparring partner** | 6 | One extra effective prepped read | `drillQuality()`, the 4-read cap |
| **Nutritionist for the cut** | 4 | `weightMissRisk` ×0.55 | `divisionMove.ts` |

The scouting report is the interesting one, because it is the only purchase that buys
*information* rather than *capability*, and doc 05's entire thesis is that a confidently wrong
read is worse than an admitted unknown.

---

## Part 6 — Solvency, and the game playing your desperation

The bank can go negative, and when it does the game does not show a fail screen. It quietly
changes what you are willing to do.

| Bank state | What happens |
| ---------- | ------------ |
| Comfortable | Nothing. You choose your camp and your fights |
| Under one camp's cost | Warned, explicitly and in advance: *"You cannot fund eight weeks at Northgate. The Basement is £3.5k."* |
| Negative | `shortNoticeWillingness` +0.3. Your reservation price on any offer drops 25%. Camp auto-downgrades to the best room you can actually pay for |
| Deeply negative | Your manager starts bringing you fights he would not otherwise bring you, and the advice record shows him recommending them |

That last row is the design in one line: **being broke is how a fighter ends up taking the
fight that ruins them**, and the game should model it as a pressure rather than a prohibition.
Nothing is blocked. Everything gets slightly worse, and you can see it happening.

It is also the counterweight that keeps doc 16's holdout honest. Sitting out to force a
renegotiation costs you a living, and the contract is tolled while you do it. That is a real
gamble with two visible clocks.

---

## Part 7 — The retirement ledger

The shareable artefact this design was otherwise missing, and it costs almost nothing because
every number in it is already stored.

At retirement, one screen:

- Every contract signed, with `valueAtSigning` against what you were actually worth by the end.
- Lifetime gross against lifetime net, and the gap between them.
- The largest single purse, and the camp it paid for.
- **The counterfactuals**, from the world sim's own record of what happened to the offers you
  turned down:

> *"You turned down £1.2M from Apex in 2027. They folded in 2029."*
> *"Vanguard made three champions in the years you were not there."*
> *"You earned £4.1M and kept £1.6M."*

The last of those three is the point of this entire document.

---

## What must never happen

- **Money that only goes up.** Revenue growth must be beatable by cost growth, in every mode.
  Doc 08 and doc 13 both say this; camp costs are what make it true for a fighter.
- **A balance with nothing to spend it on.** If the bank ever stops mattering to the next camp,
  the sink has failed and this document was pointless.
- **Two functions in different units of the same currency.** `boutValue()` versus `purseFor()`
  is the live example and it must be resolved before promoter mode is built on top of it.
- **A number that produces a subtraction the player watches happen.** Every line in Part 3
  exists because it changes a decision; if one of them ever reads as an accounting entry it
  should be folded into another.
- **Bankruptcy as a fail screen.** Being broke changes what you accept. It does not end the
  game. Doc 13 made the same ruling about promotions and for the same reason.

## What this requires from the engine

| Where | Change |
| ----- | ------ |
| `domain/fighter.ts` | `bank`, `lifetimeGross`, `lifetimeNet`, `resentment` |
| `domain/organisations.ts` | `Promotion` gains `minimumPurse`, `sponsorshipPolicy`, `revenueShareCapable` |
| `business/heat.ts` | Split `purseFor()` into `marketValue()` (no `purseDemand`, no `isTitleFight`) and a contract-driven `purseFor()` returning `{show, win}` |
| `business/heat.ts` | Star term becomes `700 × (sp/100)^2.6`; tier term becomes `(prestige/100)^2.2`; title factor comes off the base entirely |
| `business/heat.ts` | `boutValue()` renamed and reinterpreted as a unitless draw weight. It must stop returning thousands |
| `domain/personality.ts` | `reSignDiscount()` currently has no callers. It gets its first one |
| `progression/development.ts` | `applyTraining` needs the camp cost debited, and needs to fail loudly if the fighter cannot pay for the room they selected |
| `progression/divisionMove.ts` | `weightMissRisk` gets a consequence: 20% of show purse to the opponent |
| `app/game/progression.ts` | `runTraining` and `joinGym` become money-aware. `joinGym` currently sets two fields and checks nothing |
| `screens/TrainingScreen.tsx` | `GymPicker` gains a funding gate beside the existing `gym.prestige − 35` reputation gate |
| `screens/HubScreen.tsx` | The bank, the contract counter, and the manager's advice record. Purse stops being decoration |
| `data/world/newGame.ts` | World state has no money fields at all. It needs them |

## Open questions

- **Does the player ever see the tax line, or is it folded into a single "costs" figure?**
  Six deductions is honest and is also six rows on a phone. Probably: one number on the hub,
  expandable once, and never again.
- **What happens to the bank between careers?** A retired fighter's money should mean something
  in coach mode — buying a gym with what you earned in the cage is the truest career arc in the
  sport — but that couples two modes that are otherwise independent.
- **Should the AI roster run this economy too, or only the player?** Running it for everybody is
  what makes a 38-year-old with no money take a fight he should not. Running it for everybody is
  also 400 fighters of bookkeeping every tick.
- **Is 30% tax one number for a world with five countries in it?** Almost certainly not, and
  almost certainly it should be, because the alternative is a residency mini-game.
