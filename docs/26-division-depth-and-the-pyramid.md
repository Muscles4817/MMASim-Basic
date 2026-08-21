# 26 — Division depth, the promotion pyramid, and the unsigned pool

**Status:** proposal. **Superseded on phasing by [doc 27](./27-generating-the-world.md)**, which
takes the generated-world route; the measurements and the tier research below stand and doc 27
references them rather than repeating them. Every number in §1 was measured against this codebase at
the commit that closed doc 25; the figures in §2 are cited and their staleness is stated.

> **The short version.** The sport's population is set by a snapshot rather than by a shape.
> `newGame` writes `world.divisionTargets` from whatever the seed happened to create, so
> `replenish` only ever tops a division back **up to** that number and the population of the sport
> is frozen for the life of the save.
>
> Two things are wrong beneath that. Division depth is **flat** — the 2026 era carries 89 to 96 men
> in every one of its eight divisions, where the real sport spans **3.4×** from heavyweight to
> lightweight, and for a reason: it tracks how many men naturally sit at each weight. And the
> promotion pyramid is a **plateau** — one global, two majors and five promotions all labelled
> "regional", with no tier below them at all. The real sport has hundreds of promotions at its base,
> and they do not have rosters. They book from a pool.

---

## 0. A correction to the first draft of this document

The first version of §1 opened with a created fighter's first five offers pricing at **2%, 4%, 5%,
6% and 6%**, going 0-5, and quitting at 24 — and called that "every created fighter, not an unlucky
seed".

**That was measured on the wrong era.** `createNewGame` defaults to `'2020'` when no era is passed,
while `DEFAULT_ERA` — what the menu actually offers — is `'2026'`. Every probe behind that claim,
and doc 24's whole career trace, passed no era and therefore ran on the 139-fighter 2020 world.

Measured properly, the same created fighter at 52 gets:

| Era      | First offers      |
| -------- | ----------------- |
| **2020** | 6%, 8%, 13%       |
| **2026** | **27%, 58%, 74%** |

So the headline defect is real but **specific to the 2020 era**, and the 2026 world a player
actually starts in gives a debutant a perfectly sensible slate. The rest of this document is what
survives that correction, which is most of it — but the urgency was overstated and the record should
say so.

---

## 1. What is actually there

### 1.1 The two eras are different games

|                  |  2020 |    2026 |
| ---------------- | ----: | ------: |
| Promotions       |     5 |       8 |
| Fighters         |   139 | **858** |
| Men              |   107 |     741 |
| Unsigned         |     0 |  **70** |
| Men per division | 10–16 |   89–96 |

Most of 2026 is **already generated**. `seed/depth.ts` fills every promotion up to a per-division
target using `generateFighter`, so only ~139 of the 858 are hand-authored. The game is much closer
to generating its own world than it looks.

### 1.2 The quality pyramid is right in 2026 and inverted in 2020

Active fighters by overall rating, after a simulated year:

| Era  | <40 | 40–55 | 55–65 | 65–75 | 75+ |
| ---- | --: | ----: | ----: | ----: | --: |
| 2020 |   2 |     6 |    31 |    81 |  21 |
| 2026 | 202 |   429 |   128 |    70 |  27 |

2026 is a pyramid. **2020 is a diamond standing on its point** — 102 of its 141 active fighters are
rated 65 or better, and it has effectively no bottom. That, rather than `divisionTargets`, is why a
created fighter cannot get a winnable fight there.

### 1.3 Division depth is flat where it should not be

The 2026 era carries 96, 93, 89, 95, 91, 94, 93 and 90 men across its eight divisions — a spread of
**1.08×**. The real sport spans **3.4×** (§2.1), and heavyweight is always the thin one.

### 1.4 The promotion pyramid is a plateau

| Promotion          | Tier     | Fighters |
| ------------------ | -------- | -------: |
| Ultimate           | global   |      204 |
| Professional (PFL) | major    |      124 |
| ONE                | major    |      124 |
| RIZIN              | regional |       72 |
| Konfrontacja (KSW) | regional |       72 |
| Oktagon            | regional |       64 |
| Cage Warriors      | regional |       64 |
| Legacy (LFA)       | regional |       64 |

Two problems. **The tier vocabulary collapses two different things**: RIZIN, KSW, Oktagon and Cage
Warriors are _national_ promotions with their own champions, their own audiences and fighters who
stay by choice; LFA is a _feeder_ whose function is to graduate people. Calling them all "regional"
means the game cannot tell those stories apart.

And **there is no tier below them**. The base of the real pyramid is hundreds of promotions running
two to eight shows a year, and the game has none.

### 1.5 The target never moves

```
divisionTargetFor = max(DIVISION_FLOOR(sex), world.divisionTargets[divisionId] ?? 0)
```

`newGame` sets `divisionTargets` by counting what the seed made, so the target _is_ the seed. The
sport can never grow, shrink, or change shape across a twenty-year save. The intake exists and is
well built; it only ever backfills.

### 1.6 What the model already supports

Worth stating, because it narrows the work considerably.

- **`Fighter.promotionId` is already optional**, and the 2026 era already ships **70 unsigned
  fighters**. The pool partly exists.
- **Free agency already exists**: `contracts.ts` has a `freeAgent` state, and `world.ts` cuts
  fighters after a skid and voids deals on activity breaches.
- **But nobody stays unsigned.** `resolveFreeAgency` re-signs everybody every quarter, under a
  comment that names it honestly: "a free agent takes the best offer on the table, which is usually
  the promotion they were already at — a monopsony rehiring its own."

### 1.7 What it costs to run

Measured over one simulated year (26 fortnightly ticks):

| Era  | Fighters | Fights | Per year | Per tick |
| ---- | -------: | -----: | -------: | -------: |
| 2020 |      139 |    153 |    516ms |   19.8ms |
| 2026 |      858 |    606 |   1981ms |   76.2ms |

**Cost tracks fights, not population.** 6.2× the fighters produced 4.0× the fights and 3.8× the
cost. That is the single most useful number in this document: population is nearly free, and the
expensive thing is how many bouts get simulated. A far larger world is affordable provided the card
count does not scale with it.

---

## 2. What the real sport looks like

### 2.1 Division depth, and its shape

Compiled from UFC's own rankings-eligible athlete list. **This snapshot is from early 2025** and is
therefore around eighteen months stale; it is used for _shape_, which is stable across years.

| Division          | UFC | Share | Relative to the mean |
| ----------------- | --: | ----: | -------------------: |
| Heavyweight       |  30 |  5.5% |             **0.44** |
| Light Heavyweight |  40 |  7.3% |                 0.58 |
| Flyweight         |  50 |  9.1% |                 0.73 |
| Middleweight      |  68 | 12.4% |                 0.99 |
| Bantamweight      |  84 | 15.3% |                 1.23 |
| Featherweight     |  85 | 15.5% |                 1.24 |
| Welterweight      |  89 | 16.2% |                 1.30 |
| Lightweight       | 102 | 18.6% |             **1.49** |

Men's total **548**; 674 including the women's divisions. Heavyweight is always thin and lightweight
always bloated, in every promotion and every era, because it tracks the underlying population of men
at each weight.

### 2.2 The promotion pyramid has five tiers, not three

Fight Matrix frames the sport as roughly **25–30 ranked promotions across five tiers**, while other
sources describe **"thousands of promotions"** worldwide. Those answer different questions: 25–30 is
"promotions that matter to a ranking system"; thousands is "entities that have put on a licensed
show". The gap between them is the base.

| Tier                       |       Count | Events/yr each | Examples                                        |
| -------------------------- | ----------: | -------------: | ----------------------------------------------- |
| **Apex**                   |       **1** |            40+ | UFC                                             |
| **Major**                  |     **3–5** |          15–25 | PFL (absorbed Bellator, 2023), ONE, RIZIN, ACA  |
| **National / continental** |   **10–20** |           8–15 | KSW, Cage Warriors, OKTAGON, Brave CF, Pancrase |
| **Feeder / development**   |   **20–40** |          10–24 | LFA, CFFC, Fury FC                              |
| **Regional / local**       | **200–600** |            2–8 | state- and city-level shows                     |

**There is only one apex.** That is the most important structural fact and the easiest to get wrong:
the UFC is not the biggest of several majors, it is a different category. The majors can outbid for
some talent but not for the top, and they do not set the ceiling.

The base-tier count is derived, not cited. Tapology logs "dozens of events around the world every
week" — call it 30–50, so 1,500–2,600 pro events a year. Subtract the top four tiers (~630 events)
and 900–2,000 remain, at two to eight shows each. It should be treated as an order of magnitude
rather than a figure.

### 2.3 LFA — the finding that changes the design

LFA has no published roster count, and that is not a gap in the research. **LFA does not maintain an
exclusive roster.** It runs twenty-odd events a year and books fighters per event out of the regional
scene. What it has instead is a pipeline: **257 LFA alumni have gone on to the UFC**, and 166 have
fought on Dana White's Contender Series.

So the tier the game models as "a promotion with a roster of 64" is, in reality, a promoter with a
phone book.

### 2.4 Two things that sit outside the tiers

**Captive feeders.** Dana White's Contender Series and Road to UFC are not independent promotions —
they are the apex running its own trials. A fighter there is auditioning, not building leverage,
which is a materially different relationship from LFA.

**Churn.** The base tier is not a stable set. Regional promotions appear, run three shows and fold. A
twenty-year save with a fixed list of eight promotions cannot express that, and whether to model it
is a real decision rather than an oversight.

### 2.5 ONE — deliberately not used as a reference

ONE publishes no per-division MMA roster counts, and the comparison would mislead even if it did.
Their roster spans MMA, Muay Thai, kickboxing and submission grappling, so a signed fighter is not
necessarily an MMA fighter; and their weight classes are hydration-tested walking weight, so ONE
lightweight is 170 lb — UFC _welterweight_. Recorded so nobody repeats the search.

---

## 3. The idea

Three changes, in increasing order of size.

**Depth becomes a shape.** `divisionTargets` stops being a snapshot of what the seed made and
becomes `SPORT_SIZE × DIVISION_SHARE[division]`, with the shares from §2.1. A property of the sport,
not of the save.

**The tier vocabulary gains the missing rung.** `national` sits between `major` and
`developmental`, so KSW and LFA stop being the same kind of thing.

**A division's population belongs to the sport, not to the promotions.** Today a division contains
exactly the fighters signed to somebody, which makes the population a function of contract
bookkeeping. An **unsigned pool** — professionals with no promotion, who exist, train, age, and are
bookable by anyone prepared to have them — makes three currently unreachable things possible:

- The **base tier can exist** without anybody signing hundreds of people.
- **Being cut means something**, because there is somewhere to be cut _to_.
- The **2020 era becomes playable**, because there is a level below its inverted diamond.

---

## 4. The design

### 4.1 Depth from a shape

```
target(division) = SPORT_SIZE × DIVISION_SHARE[division]
```

`DIVISION_SHARE` from §2.1. `SPORT_SIZE` is one number the world carries, so a small era can be
small without every division being re-tuned by hand. `DIVISION_FLOOR` stays as the guard that a
division must always be able to make a card.

### 4.2 Five tiers

`PromotionTier` gains `national`. The existing `regional` label moves down to mean what it says, and
the four national promotions currently mislabelled are re-tiered. This is mostly a data change and
it unlocks §4.3.

### 4.3 Promotions book, they do not only roster

`offerOpponents` already takes an optional `promotionId` filter and `getOffers` already falls back to
the whole world when a promotion has nobody. The change is to make that fallback **deliberate and
tiered** rather than a last resort:

| Tier     | Books from                                     |
| -------- | ---------------------------------------------- |
| Apex     | Its own roster, essentially exclusively        |
| Major    | Its own roster, plus the top of the pool       |
| National | A real roster, plus the pool in its own region |
| Feeder   | A small roster, mostly the pool                |
| Regional | Almost entirely the pool                       |

That is the real sport's structure, and it is what makes the ladder a ladder: the level you can be
booked at is the level you have earned.

### 4.4 Free agency slows down

`resolveFreeAgency` re-signs everybody, so being cut costs nothing and the pool would drain the
moment it filled. It should sign only fighters a promotion would actually want — by standing, record
and divisional need — and leave the rest. Being cut and having to rebuild on the regional scene is
one of the sport's most characteristic arcs and the game cannot currently tell it.

### 4.5 Cost, and what makes it affordable

§1.7 is the answer: **cost tracks fights, not population.** A pool of several thousand is affordable
provided it does not multiply the number of simulated bouts. Two levers:

- **The pool fights less.** A regional fighter has two or three bouts a year, and those bouts do not
  need `simulateFight`'s full play-by-play — a cheap resolution that produces the same _distribution_
  of outcomes is sufficient for somebody the player has never heard of.
- **The pool develops in bulk.** Ageing and training on a quarterly cadence rather than per bout,
  provided the rates match. Same bargain doc 25 § 3.7 made about injuries for the world.

Both are testable: the rates and distributions are what must match, not the mechanism.

---

## 4.6 Built: schedules, and the pyramid that would not stay up

Doc 27 § 10 needed the sport to get bigger, and § 4.3's "promotions book, they do not only roster"
turned out to be blocked by something nobody had looked at.

### The schedule was a global quota

`advanceWorld` ran **three cards a fortnight across the entire sport** and decided whose night it
was with a prestige-weighted draw. So:

- **A promotion's calendar depended on its competitors.** Founding a regional show took dates off
  the promotion at the top of the sport, because the draw is relative.
- **The sport could not get bigger.** Handed the same seventy-eight cards a year, a 74-promotion
  pyramid gives each promotion two. Measured, that world produced **0.86 bouts per fighter per
  year** against a real sport's two to three — a generated world that looks right and is inert.
- **The schedule had no relationship to the roster.** A promotion with two hundred fighters and one
  with twenty drew from the same lottery.

`cardsPerYear` replaces it: a promotion runs as many cards as its roster can fill, capped by what a
promotion of its size actually stages and braked by whether it can pay. Nothing about it reads the
rest of the world. Measured on the shipped 2026 era, the leader runs a card every seventeen days and
a regional every six weeks, and the sport now scales — the 74-promotion world went from 32,761
fights over fifteen years to **61,628**, and from 0.86 bouts per fighter to 1.62.

### Then the pyramid fell over

Giving promotions schedules they have to _fill_ made a pre-existing bug visible immediately. One
simulated year of the 2026 world:

|       | start | after 1 year |
| ----- | ----: | -----------: |
| UFC   |   204 |           56 |
| PFL   |   124 |           63 |
| ONE   |   124 |          128 |
| RIZIN |    72 |          121 |
| KSW   |    72 |           93 |
| LFA   |    64 |          126 |

**The sport inverted inside a year** and stayed inverted. It had been invisible because nothing
downstream read roster size — under the lottery the leader kept running the most shows in the sport
off a roster a third the size of a regional's.

Three independent causes, each correct in isolation:

1. **No seeded fighter had a contract.** 788 of them carry a `promotionId` and nothing behind it,
   and free agency reads the agreement to decide who is free — so on the first quarterly tick every
   fighter not holding a belt was a free agent at once. Fixed with an _implicit_ term rather than
   788 stored agreements, which would have added 750 KB to a save doc 20 § 7 already wants an order
   of magnitude smaller.
2. **The reputation gate excluded the top promotions' own rosters.** A fighter reached a promotion
   of prestige `42 + reputation × 0.9`, and reputation does not discriminate between the tiers of
   this sport at all: the median is 25 to 27 everywhere except the leader's 40. **Only 50 of the
   leader's 204 fighters could have re-signed with their own promotion.** Every expiring contract at
   the top was a one-way ticket down.
3. **Nothing moved anybody up.** `replenish` puts every debutant on the regional circuit, correctly,
   and there was no counter-flow. A fighter who goes 5-0 on the regional circuit gets a call from
   the biggest promotion that will have them, and that arc — the one the game is _about_ — was not
   in the model.

### The gate that ate itself

The first replacement gated on the mean overall rating of the promotion's own roster, which reads
well and **erodes itself**: a promotion signing at its own mean minus twelve lowers its mean, so
next quarter it signs twelve below _that_. Over ten years the leader's standard fell from 60.2 to
51.9 while the smallest promotion in the world rose to 57.1 — the ladder did not flatten, it
**inverted**.

The standard is anchored to the population instead. Rank the promotions by prestige, walk down them
spending their roster targets, and each claims the slice of the sport's fighters at its own depth:
the leader's 204 of 788 is the top 26%, so it signs from the 74th percentile up. That cannot drift,
and it needs no constant that would have to be re-tuned for a generated world — which § 4 makes a
requirement rather than a nicety.

`tests/integration/the-pyramid-holds.test.ts` runs ten years and asserts the shape survives.

### What this cost, and what it did not buy

The schedule level is calibrated against the **economy**, not against the sport. A first cut used
realistic activity — 1.9 to 2.4 bouts per fighter per year — and ran the sport 60% busier than the
cost model could carry: the fourth-smallest promotion went insolvent inside ten simulated years, and
two of them inside twelve. Cutting a struggling promotion's schedule makes it _worse_, because
`periodCosts` bills for staff, premises and a contracted roster whether or not anybody fights.

So the shipped level holds the sport at about seventy cards a year — what it ran before — and
`TIER_BOUTS_PER_FIGHTER` is the single knob for a busier sport. Turning it up needs the economics of
a card at the bottom of the sport looked at first. That is the next piece of work here, and it is a
finding about the cost model rather than about the schedule.

---

## 4.7 Built: the generated pyramid could not fill its own divisions

§4.6 fixed the shape of the *rosters*. The shape of the **divisions inside them** was still set the
other way round: `generatePyramid` gave every promotion in a tier a fixed division count and divided
its roster across whatever that came to. Rosters shrink faster than counts (`scaled()`, and that is
correct), so the divisions got thinner instead of the promotions running fewer weight classes.

Measured on a generated **Small** world, before pre-history:

| Tier     | Divisions run | Fighters per division |
| -------- | ------------: | --------------------: |
| Apex     |            12 |                 6–11  |
| Major    |            11 |                  3–6  |
| National |             9 |               **4** (and 0 in the women's division it advertised) |
| Feeder   |             7 |                  **2** |
| Local    |             5 |                  **1** |

Three separate defects behind it, each visible in play:

1. **A division count fixed by tier.** A promotion that cannot put six fighters — `MIN_DIVISION_DEPTH`,
   derived in `seed/depth.ts` from what it takes to fill a card — into a weight class should run
   fewer weight classes, which is also what small promotions do in life. It now runs as many as it
   can staff with one spare each, and no more.
2. **Divisions advertised and never populated.** `divisions: 9` is the eight men's divisions plus
   women's strawweight, and the women's target for those promotions was `0`. Every national show in
   the world listed a division containing nobody.
3. **The base of the sport stacked into one weight class.** A small promotion took "the first N"
   divisions, and `DIVISIONS` starts at flyweight — so all seventy-five local shows in a Medium
   world ran flyweight through welterweight and **no promotion below prestige 30 ran a heavyweight
   at all**. The window now starts at the promotion's own index and wraps.

Two more, in the world loop, which is what let it erode again over eight years of pre-history:

- **`buildDepthFighters` ignored which divisions a promotion runs**, filling all twelve for every
  target. With the floors raised that turned a Small world of 850 into 2,504, most of them signed to
  a promotion that does not stage their division and therefore unbookable by anyone, ever.
- **The intake and free agency read headcount, never divisional need.** A promotion at its roster
  target can be two deep at 185, and both `pickStartingPromotion` and `resolveFreeAgency` chose
  destinations on totals alone — the first of them without even checking that the promotion ran the
  division, which left seventeen fighters stranded per Small world. Restricting the intake to
  promotions that stage the division needed the roster-room term floored the way free agency's
  already was: every women's division in the 2026 world is run by exactly three promotions, and a
  hard zero for "full" handed all of that division's debutants to whichever one had room. The
  long-sim caught it — winless fighters on the leader's roster went from half the uniform rate to
  exactly it.

Medium world, per-division depth on the day the player arrives (after pre-history):

|               | before | after |
| ------------- | -----: | ----: |
| Regional under 6 | 56% (min 0) | 28% (min 2) |
| Developmental under 6 | 87% (min 0) | 29% (min 2) |
| Stranded signings | 21 | 0 |
| Men's divisions staged by the base tier | 5 of 8 | 8 of 8 |

One thing found on the way and fixed with it: **every generated promotion was a copy of the seed's
leader** for every field the pyramid did not name, including `minimumPurse` and
`revenueShareCapable`. So the smallest local show in the world quoted the leader's purse floor and
could grant points on the revenue — which flattened free agency's money (a four-offer shortlist
spanning three tiers came back at £33k, £33k, £30k, £30k) and deleted the fringe's one unmatchable
term. Both are derived from the promotion's own budget and tier now, and the same shortlist reads
£24k, £14k, £8k, £4k.

`tests/integration/generated-world.test.ts` holds all of it.

---

## 5. Numbers to pick

| Constant                   | First guess  | Calibrated against                                         |
| -------------------------- | ------------ | ---------------------------------------------------------- |
| `SPORT_SIZE` (men, 2026)   | 740          | Roughly where the era already sits; changes shape not size |
| `DIVISION_SHARE`           | § 2.1 shares | Heavyweight thinnest, lightweight deepest, ~3.4× spread    |
| Share of population signed | ~50%         | The apex stays selective; the base is mostly unsigned      |
| Pool tick cadence          | quarterly    | Per-tick cost stays within § 1.7's budget                  |

---

## 6. What could go wrong

**The world gets slower.** §1.7 says cost tracks fights, so the failure mode is a design that
accidentally scales card count with population. Measure per-tick cost before and after; if the pool
must be cheaper than the roster, make it cheaper deliberately rather than discovering it later.

**The pool becomes a dumping ground.** If nothing leaves it upward it is a memory leak with names.
The signing path has to be as real as the cutting path, and the test is that a good fighter who
starts unsigned ends up signed.

**2026 gets worse while 2020 gets better.** The 2026 era is not broken — §0 — and a change aimed at
2020's problems must not damage the world people actually play. Both eras get measured on every
change.

**Ratings statistics move.** The long-sim asserts on median rating, champion bar and division health.
Those describe the _top_ of the sport and mostly should not move; where they do, the reason gets
stated rather than the bound widened.

---

## 7. Definition of done

- Every men's division carries a population within a reasonable factor of § 2.1's shape, with
  heavyweight thinnest and lightweight deepest, in both eras.
- The **2020** era gives a created fighter opening offers in a 30–70% band rather than 6–13%.
- The **2026** era's opening offers do not get materially easier than the 27/58/74% they already are.
- `PromotionTier` distinguishes national from feeder, and the four mislabelled promotions are
  correctly tiered.
- A fighter cut after a bad run lands in the pool rather than being re-signed within the quarter, and
  a fighter who then wins in the pool gets signed again.
- Doc 24 regenerates without its harness having to raise any target itself.
- `advanceWorld`'s per-tick cost is measured before and after and stated in both eras.

---

## 8. Phasing

1. **`DIVISION_SHARE` and `SPORT_SIZE`.** Replace the snapshot with a shape. Small change, large
   measurable effect, and it fixes the flat division depth in both eras on its own.
2. **The fifth tier.** Add `national`, re-tier the four promotions that are mislabelled. Mostly data.
3. **The pool exists.** Generated fighters stay unsigned by default; they age and develop on a cheap
   cadence.
4. **Promotions book from it**, tiered by § 4.3.
5. **Free agency slows down**, so being cut has consequences and the pool retains a population.

Phase 1 is worth measuring alone before anything else is written. Given §0, it may close more of the
gap than expected — and if it does, phases 3–5 are about _fidelity and story_ rather than about
making careers playable.
