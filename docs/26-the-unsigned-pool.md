# 26 — The unsigned pool, and how deep a division should be

**Status:** proposal, nothing implemented. Every number in §1 was measured against this codebase at
the commit that closed doc 25; the figures in §2 are cited and their staleness is stated.

> **The short version.** Doc 24's first finding is still open, and it is the one that stops a
> created fighter having a career at all: `newGame` sets `world.divisionTargets` to the seeded
> headcount, so `replenish` only ever tops a division back **up to** the number the seed happened
> to make. The seed made 107 men across eight divisions and put **106 of them in one promotion**.
> The four feeder promotions have no men at all in seven of eight divisions.
>
> The obvious fix — raise the targets and sign more people to the small shows — is modelling the
> wrong thing. **The real sport's lower tier is not a roster, it is a pool.** LFA does not sign
> forty lightweights; it books whoever is available. The game has no way to express that, because
> every fighter must belong to a promotion, so a division's population is capped by what the
> promotions carry between them.

---

## 1. What is actually there

### 1.1 The seed, measured

| Division          | Seeded | Global | Major | Regional | Developmental | Rating range |
| ----------------- | -----: | -----: | ----: | -------: | ------------: | ------------ |
| Flyweight         |     10 |     10 |     0 |        0 |             0 | 62–72        |
| Bantamweight      |     14 |     14 |     0 |        0 |             0 | 63–78        |
| Featherweight     |     12 |     11 |     1 |        0 |             0 | 63–80        |
| Lightweight       |     15 |     14 |     1 |        0 |             0 | 65–79        |
| Welterweight      |     15 |     15 |     0 |        0 |             0 | 65–78        |
| Middleweight      |     13 |     13 |     0 |        0 |             0 | 62–76        |
| Light Heavyweight |     12 |     12 |     0 |        0 |             0 | 57–85        |
| Heavyweight       |     16 |     16 |     0 |        0 |             0 | 51–76        |

**107 men. 106 of them at Apex.** European Cage Circuit and Frontier Fights — the regional and the
developmental, the two whose entire function is to produce the next generation — have **zero men**.

### 1.2 Why it never fills in

```
divisionTargetFor = max(DIVISION_FLOOR(sex), world.divisionTargets[divisionId] ?? 0)
```

and `newGame` sets `divisionTargets` by counting the fighters the seed created. So the target _is_
the seed, and `replenish` — which generates debutants rated 23–63 and weights them hard toward the
small shows — only fires when somebody retires. The intake exists, is well built, and almost never
runs.

### 1.3 What it costs a created fighter

Measured on the unmodified world: a created fighter debuts around 52, and their first five offers
price at **2%, 4%, 5%, 6% and 6%**. They go 0-5 and the career ends at 24. That is every created
fighter, not an unlucky seed — there is nobody in the world for them to fight.

Doc 24 works around it by raising the target to 40 in its own world and says so. That workaround is
why the three traced careers exist at all.

### 1.4 What the model already supports

Worth stating, because it narrows the work considerably.

- **`Fighter.promotionId` is already optional.** Nothing in the type system requires a fighter to
  belong to anybody.
- **Free agency already exists.** `contracts.ts` has a `freeAgent` state, and `world.ts` cuts
  fighters after a skid and voids deals on activity breaches.
- **But nobody stays unsigned.** `resolveFreeAgency` re-signs everybody every quarter, under a
  comment that names it honestly: "a free agent takes the best offer on the table, which is usually
  the promotion they were already at — a monopsony rehiring its own." So the unsigned state is a
  moment between contracts rather than a place in the sport.

---

## 2. What the real sport looks like

### 2.1 UFC — depth, and its shape

Compiled from UFC's own rankings-eligible athlete list. **This snapshot is from early 2025** and is
therefore around eighteen months stale at the time of writing; it is used for _shape_ rather than
for absolute numbers, and the shape is stable across years.

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

Men's total **548**; 674 including the women's divisions.

Two things to take from it. Depth is **roughly 3.4× from thinnest to deepest**, and the ordering is
not arbitrary — it tracks how many men naturally sit at each weight. Heavyweight is always thin and
lightweight is always bloated, in every promotion in the sport and in every era of it.

The game's seed spans **0.75 to 1.19** — nearly flat — and inverts the ends: its deepest men's
division is heavyweight and its thinnest is flyweight, which is exactly backwards.

### 2.2 LFA — the finding that changes the design

LFA has no published roster count, and that is not a gap in the research. **LFA does not maintain an
exclusive roster.** It runs twenty-odd events a year and books fighters per event out of the
regional scene. What it has instead is a pipeline: **257 LFA alumni have gone on to the UFC**, and
166 have fought on Dana White's Contender Series.

So the tier the game models as "a promotion with an empty roster" is, in reality, a promoter with a
phone book.

### 2.3 ONE — deliberately not used as a reference

ONE publishes no per-division MMA roster counts, and the comparison would mislead even if it did.
Their roster spans MMA, Muay Thai, kickboxing and submission grappling, so a signed fighter is not
necessarily an MMA fighter; and their weight classes are hydration-tested walking weight, so ONE
lightweight is 170 lb — UFC _welterweight_. The division names do not line up. Recorded here so
nobody re-does the search expecting it to be useful.

---

## 3. The idea

**A division's population is the sport's, not the promotions'.**

Today a division contains exactly the fighters signed to the five promotions. That makes the game's
population a function of contract bookkeeping, and it is why the bottom of the sport is empty: the
seed did not write contracts for regional fighters, so regional fighters do not exist.

The proposal is an **unsigned pool** — professional fighters with `promotionId` undefined, who
exist, train, age, and are bookable by any promotion prepared to have them. That single change makes
three separate things possible that are currently unreachable:

- A **created fighter has opponents**, because the pool is where somebody rated 52 belongs.
- **Regional promotions can put on shows** without anybody having to sign forty people.
- **Being cut means something**, because there is somewhere to be cut _to_ — rather than the
  monopsony immediately rehiring you.

---

## 4. The design

### 4.1 `divisionTargets` becomes a shape, not a snapshot

Replace the seeded headcount with a target derived from two things: how big the sport is, and how
that weight class sits in it.

```
target(division) = SPORT_SIZE × DIVISION_SHARE[division]
```

`DIVISION_SHARE` comes from §2.1 and is a property of the sport rather than of the save.
`SPORT_SIZE` is a single number the world can carry, so a custom or small-era world can be smaller
without every division having to be re-tuned by hand.

The `DIVISION_FLOOR` guard stays: a division must never fall below what makes a card.

### 4.2 The pool

A generated fighter is signed to a promotion **only if somebody wants them**. Everybody else stays
unsigned. That inverts the current default — `replenish` currently signs every debutant it creates
via `pickStartingPromotion` — and it is the whole of the change in one sentence.

The pool needs three things to be a place rather than a leak:

- **It ages and trains.** `world.ts:develop()` already runs for anybody who fights; the pool needs
  the same treatment on a cheaper cadence so an unsigned prospect can improve into somebody worth
  signing.
- **It fights.** Regional and developmental promotions book from it. That is what those tiers are.
- **It empties upward.** A fighter who wins in the pool gets signed; the existing `signFirstDeal`
  and ladder machinery is the right shape for this already.

### 4.3 Promotions book, they do not only roster

`offerOpponents` already takes an optional `promotionId` filter, and `getOffers` already falls back
to the whole world when a promotion has nobody. The change is to make that fallback **deliberate
and tiered** rather than a last resort:

| Tier          | Books from                               |
| ------------- | ---------------------------------------- |
| Global        | Its own roster, essentially exclusively  |
| Major         | Its own roster, plus the top of the pool |
| Regional      | A small roster, plus the pool            |
| Developmental | Almost entirely the pool                 |

That is the real sport's structure, and it is what makes the ladder a ladder: the level you can be
booked at is the level you have earned.

### 4.4 Free agency stops being instantaneous

`resolveFreeAgency` re-signs everybody, so being cut costs nothing and the pool would drain into the
promotions the moment it filled. It needs to sign only fighters a promotion would actually want —
by standing, record and division need — and leave the rest in the pool. Being cut and having to
rebuild on the regional scene is one of the sport's most characteristic career arcs and the game
cannot currently tell that story.

### 4.5 Cost

This is the risk that decides whether the design is viable, and it should be measured before any of
it is written. Going from 107 men to a realistic pool is roughly a 5–10× population increase, and
`advanceWorld` already does per-fighter work every tick.

The mitigation, if it is needed, is that **the pool does not need the same fidelity as the roster.**
A fighter nobody has heard of, in a division the player is not in, can be aged and developed in
bulk on a quarterly cadence rather than per-bout — provided the _rates_ match, which is testable.
That is the same bargain doc 25 § 3.7 made about injuries for the world.

---

## 5. Numbers to pick

| Constant                   | First guess  | Calibrated against                                      |
| -------------------------- | ------------ | ------------------------------------------------------- |
| `SPORT_SIZE` (men)         | 400          | A created fighter always has 3+ credible opponents      |
| `DIVISION_SHARE`           | § 2.1 shares | Heavyweight thinnest, lightweight deepest, ~3.4× spread |
| Share of population signed | ~35%         | The global promotion stays selective and hard to reach  |
| Pool tick cadence          | quarterly    | Per-tick cost stays within the current budget           |
| Regional booking mix       | § 4.3 table  | A debut fight prices at 40–60%, not 2–6%                |

The headline acceptance number is the last one. Doc 24's finding 1 is the reason this document
exists, and the measurement that closes it is a created fighter's opening offers.

---

## 6. What could go wrong

**The world gets slower.** The most likely failure, and the one that would kill the design. Measure
`advanceWorld` per-tick cost before and after; if the pool must be cheaper than the roster, say so
and make it cheaper deliberately rather than discovering it under a profiler later.

**The pool becomes a dumping ground.** If nothing ever leaves it upward, it is a memory leak with
names. The signing path has to be as real as the cutting path, and the test is that a good fighter
who starts unsigned ends up signed.

**Ratings inflation or collapse.** Adding several hundred fighters rated 23–63 moves every
population statistic the long-sim asserts on — median rating, champion bar, division health. Those
assertions describe the _top_ of the sport and mostly should not move; where they do, the reason has
to be stated rather than the bound widened.

**The player's own ladder gets easier.** More opponents at a created fighter's level is the point,
but it must not turn into an easy run to the top. Doc 24's traced careers are the guard: if the
climb gets materially faster, the matchmaking bands need tightening rather than the population
shrinking.

---

## 7. Definition of done

- A created fighter's first five offers price in the 40–60% band rather than at 2–6%, and doc 24
  regenerates without the harness having to raise any target itself.
- Every men's division carries a population within a reasonable factor of § 2.1's shape, with
  heavyweight thinnest and lightweight deepest.
- The regional and developmental promotions put on cards, from the pool, without a large roster.
- A fighter cut after a bad run lands in the pool rather than being re-signed within the quarter,
  and a fighter who then wins in the pool gets signed again.
- The twenty-year long-sim's assertions about the top of the sport hold, or each movement is
  explained.
- `advanceWorld`'s per-tick cost is measured before and after and is stated.

---

## 8. Phasing

1. **`DIVISION_SHARE` and `SPORT_SIZE`.** Replace the seeded snapshot with a shape. On its own this
   already fixes the inverted division depths and lets the intake run, and it is a small change with
   a large measurable effect.
2. **The pool exists.** Generated fighters stay unsigned by default; they age and develop.
3. **Promotions book from it**, tiered by § 4.3. This is the phase that closes doc 24's finding 1.
4. **Free agency slows down**, so being cut has consequences and the pool has a population.

Phase 1 is worth measuring on its own before anything else is written: it may close more of the gap
than expected, and if it does, phases 2–4 are about _fidelity_ rather than about making created
careers playable.
