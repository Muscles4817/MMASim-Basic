# 30 — Legibility of the body

**Status:** shipped. Every number below was measured against this codebase.

> **The short version.** Four player reports, one shape. The health model is good and almost none
> of it is visible or actionable. Injury risk is a product of six terms and showed none of them, so
> injuries read as weather. Freshness only ever appeared at the two ends of a four-week jump, so it
> read as invented. A carried injury lived on the training screen, and so did the only control that
> healed it. And a created fighter's physicals arrived 18% below where the same body arrives
> through the generator, so a player who built a fast fighter was shown a slow one and told his
> ceiling was 70.
>
> The fix in each case is the same fix: put the model where the decision is, and let the player's
> choices reach the thing they are choosing about.

---

## 1. Injuries you cannot see coming

### The report

> "Is the injury rate correct? On fighter career I have noticed I get a lot of injuries and it's
> not clear how if at all I'm meant to avoid them."

### What was there

`campInjuryChance` is a product of six terms — base, proneness, age, wear, block length, intensity
— and `fightInjuryChance` is a product of four. Three of the ten are decisions the player makes.
**None of the ten had ever been shown anywhere in the game.** The roll happened inside the camp,
the result arrived as a sentence in the report, and nothing connected the two.

So the rate was defensible and the experience was not. A risk you cannot see is indistinguishable
from a random punishment, and the honest answer to "how do I avoid these" was *fight less and get
younger* — neither of which is a move.

The block-length term made it worse: `clamp(weeks / 8, 0.5, 1.6)` floored a one-week block at half
the risk of a full camp, so shortening a block bought almost nothing.

### What changed

**Freshness enters both hazards.** `fatigueFactor` is the one input a player can move today, by
resting, and it is the one the sport agrees with — injuries cluster at the end of hard camps and in
fighters who came back too soon. It is neutral at freshness 70 rather than at 100, deliberately: a
camp ends in the fifties and nobody is ever at 100, so anchoring at the top would have been a
blanket nerf wearing a mechanic's clothes.

**The length floor drops to 0.15**, so a short block is genuinely a short block.

**The number is quoted before it is committed to**, on the training screen and on the fight-camp
screen, taken apart into what the player can still decide and what is simply a fact about them.
`campRiskBreakdown` returns the same figure the roll uses — a screen that quotes a different number
from the one the camp rolls is worse than a screen that quotes nothing.

### Measured

An eight-week camp, 28-year-old, average proneness, no wear:

| freshness | light | standard |  hard | overreach |
| --------: | ----: | -------: | ----: | --------: |
|       100 |  4.7% |     9.4% | 14.1% |     21.5% |
|        85 |  5.7% |    11.4% | 17.1% |     26.2% |
|        70 |  6.7% |    13.4% | 20.1% |     30.9% |
|        50 |  8.1% |    16.1% | 24.2% |     37.1% |
|        30 |  9.4% |    18.8% | 28.3% |     43.3% |
|        15 |  9.8% |    19.5% | 29.3% |     44.9% |

The same fighter previously sat at a flat **13.0%** for every row of the standard column. The
median career's rate is therefore roughly unchanged — freshness 70 is where a rested fighter
between camps actually lives — and what grew is the spread.

Block length at freshness 70, standard intensity: 2w **3.4%**, 4w 6.7%, 8w 13.4%, 12w 20.1%.

`riskBand` is calibrated against that spread rather than against round numbers — low below 6%, fair
below 12%, high below 22%, severe above it. A first pass at the boundaries called a standard
eight-week camp on a fresh fighter "high", which would have had the screen shouting at the player
for doing the ordinary thing.

Which makes the answer to the report a real one. A rested fighter running a light four-week block
carries **3.3%**; a flat one running twelve weeks of overreach carries **46%**. That is a
fourteen-fold range decided entirely by choices, against a two-to-three-fold range decided by who
you happen to be.

---

## 2. A month at a time

### The report

> "Because the game forces me to jump 4 weeks at a time the Freshness system looks like it jumps
> massively every time. I want the game to tick by day by day in some more visible manner."

### What was there

Two defects wearing one symptom.

**The granularity.** The shortest block on the training screen was four weeks, and the hub's wait
buttons were eight weeks and six months. Every control that moved the clock moved it by a month or
more, so freshness went from 48 to 96 between one frame and the next.

**And the deeper one: waiting did not recover anything at all.** The hub's wait called
`advanceWorld` directly with the player excluded, then set the date. The whole roster aged, fought,
retired and changed hands; the player's own fighter came back byte-for-byte identical. No decline,
no decay, no contract tolling and no freshness. The same was true of the calendar screen's
day/week/month buttons, which go through `advanceTo`. *Excluded from the simulation* had quietly
become *exempt from time* — so the most obvious response to being flat was the one route in the
game that did nothing about it.

### What changed

`advanceTo` now charges the player for the days, once, in one place, for every route through the
clock (`PlayerElapsed`). It returns the per-day recovery rate it just applied, so a screen can draw
the days rather than only the total.

`restDays` walks that into a day-by-day timeline and the hub's rest card ticks through it — frame
capped, so eight weeks off is not four seconds of watching and three days off is not over before
the eye lands on it.

The values are **not an animation of the result**. Freshness recovers at a flat rate per day and an
injury heals on the day its `healedDay` arrives, so walking the block and jumping it produce the
same fighter. `rest-and-recovery.test.ts` asserts that the last frame equals the stored value,
because if the two could drift the card would be animating a number the game does not believe in —
which is the original complaint restated in a nicer font.

Two weeks joins the training screen's block lengths, and the rest steps run from three days to
eight weeks.

---

## 3. Being hurt, where you can see it

### The reports

> "When I'm injured I think that really should show on the main page. It's hidden in GO Training
> right now."
>
> "I should be able to rest X amount of time from the main page as well instead of scrolling all
> the way down to Go Training then scrolling all the way down to the rest option."

### What changed

`InjuryStatus` leads the hub whenever the fighter is carrying something, and renders nothing when
they are not — a permanent "you are healthy" panel is a panel the player learns to stop reading,
which is exactly the state you need them reading it in.

It also says what fighting hurt would actually cost, attribute by attribute. `injuredAttributes`
applies the suppression silently at fight time and tells nobody, which is the right rule for what
an *opponent* knows and the wrong one for what a fighter knows about their own knee.

`RestCard` sits directly beneath it, offering three days to eight weeks plus "until fit", and
refusing to run past a booked fight. The training screen shares the same injury panel rather than
keeping its own, so the two screens can no longer say different things about the same knee.

---

## 4. The body you said you were building

### The report

> "The game is still way too harsh about your starting physical. I made a rangy natural taekwondo
> guy and put a few points into speed and it still says in game my ceiling is like 70 for speed and
> I start at 66. This seems ridiculous. If I am a fast person my starting speed shouldn't be
> flipping 66. I'd start in the high 70s if I'm fast. If I'm freak maybe I'd start in the 80s."

The report is right, and reproducing it found three separate causes.

### 4.1 Rangy secretly meant slow

`buildShift` applied one signed number to two naturals: rangy cost **four points of
explosiveness**, and explosiveness is the driver of speed. So the game's own word for "long and
light" meant *slower* — not what the label says, not what the sport looks like, and the single most
misleading choice on the creation screen, because a player building a rangy quick striker was
picking the slowest version of him on offer.

Build now leans the naturals it actually implies (`BUILD_NATURALS`). Length is not a speed penalty,
so there is no longer one; rangy trades frame for engine, powerful trades engine for mass and a
little explosiveness. Rangy needs no matching penalty, because it already pays in `frame` — which
enters power, strength and durability — and is repaid in reach.

### 4.2 Investing in a physical closed the door above it

The discipline's bias and the allocated points were added to the **current** rating, and the
ceiling was then raised onto the result only if it overshot. Karate hands out eleven points of
speed; five allocated points added five more; the ceiling stayed where the naturals put it. Hence
exactly the reading in the report: speed 66, ceiling 70, with the player's own investment having
bought four points and shut the door behind them.

That is backwards for a physical. Nobody trains their way to being quick — the fast ones were
selected for being fast, by the sport they came out of. So half the discipline bias and 60% of the
allocation now buy **body**: they raise the ceiling, and the fighter arrives at that raised ceiling
on the normal age curve. Half rather than all, because a discipline's bias does two jobs at once —
a karateka is quick partly because he is quick and partly because he has spent ten years learning
to move — and only the first is a claim about the body.

### 4.3 Created fighters paid a discount nobody else paid

`RAW_ATHLETE = 0.82` multiplied every physical, described as "the discount for never having been in
a professional room". But a *generated* debutant's physicals are `potential × arrivalFactor` with
nothing else applied. An identical body coming through the create screen was eighteen per cent
slower than the same body coming out of the generator, forever, and the player's own fighter was
the one person in the world charged for it.

It also charged the wrong qualities. `ARRIVAL` is explicit that "physical" is not one thing: speed
and a chin are *born*, and a twenty-one-year-old has all of both; strength and cardio are genuinely
built, and a professional room is genuinely where that happens. `RAW_ROOM` keeps the discount only
where it was ever true — 1.00 on speed and durability, 0.97 on power, 0.92 on strength and cardio.

### 4.4 And the level did not move

Those three changes are worth about three points of overall on a fifteen-attribute average, which
would have pushed a created fighter past the bottom of the roster they are supposed to be joining.
The skill `BASELINE` came down from 46 to 44 against it.

**What changed is the shape, not the level.** A created fighter used to be uniformly mediocre — a
little below average at everything, including the things nobody has to be taught. They now debut as
what they actually are, an athlete with a novice's hands, at the same overall the design has always
put them at. That is the better fighter to be handed and it is the honest one: a career's growth
comes from the technical half, and the technical half is where a debutant genuinely has nothing.

### Measured

A rangy karateka at 22 with five points in speed, against a seed roster whose floor is 51.1, median
67.5 and champion bar 78.4:

| talent  |     speed |   p10–p90 | ceiling | share of physical ceiling | overall |
| ------- | --------: | --------: | ------: | ------------------------: | ------: |
| grinder |      72.0 |     61–82 |    77.5 |                       86% |    51.1 |
| natural |  **77.1** |     65–88 |    82.8 |                       86% |    52.5 |
| freak   |  **81.7** |     71–92 |    87.5 |                       86% |    53.8 |

Against **66** before, at every tier, with the ceiling sitting on top of it. High seventies for a
natural and low eighties for a freak is what the report asked for, and it arrives with six points
of room still above them.

The debut overall stays inside every bound the long-sim suite already asserted: below the roster
floor plus two on the standard case, and below the roster median by eleven points at the strongest
corner of the design.

---

## 4b. Two world-side injury bugs found while measuring the above

Neither was in the report. Both were found by measuring what the injury system actually produces
over time, which is what "is the injury rate correct" turns into once you go and look.

### The aggravation runaway

`aggravate` multiplies the **remaining** layoff by 1.6–2.4 and nothing bounded it. Meanwhile the
world's matchmaker gated on `readyOnDay` — a medical suspension, a function of how the last fight
ended — which knows nothing about injuries. So the world matched fighters with torn knees, they
fought on them, the knee doubled, and the next card booked them again.

Measured over eight years of generated pre-history: **76% of the roster carrying something**, worst
case a knee **995 weeks** — nineteen years — from healed, and every one of the worst cases
`severity: 1`, `foughtThrough: true`. That is a compounding signature, not bad luck.

Both halves are fixed. `canFightOn` is now the single rule both the player's bout and the world's
matchmaking use, and `AGGRAVATION_CEILING` bounds an aggravated injury at twice its own worst
natural case — eighty weeks for a torn knee, which ends careers and is a thing that happens.

### The injury roll was charged per call, not per elapsed week

`ageEveryone` develops the whole roster and passes `develop` a flat `weeks = 4`. The training half
of that was fixed when `AMBIENT_BLOCKS_PER_WEEK` landed, and its comment records the half that was
left: *"`weeks` is still passed either way because camp injury risk reads it."*

So how often the world got hurt depended entirely on how the caller chopped up the clock —
twenty-six rolls a year at a fortnight a step against one at a year a step. `develop` now takes an
`injuryWeeks` separate from the block length, and `ageEveryone` passes the time that actually
elapsed.

Measured on a year of a seeded world, share of the roster too hurt to be booked at any moment:
**42%** before either fix, 36% with the matchmaking gate, **17%** with both. Seventeen per cent is
what a professional roster looks like.

---

## 5. What did not change

- **The injury *types*, durations, recurrence and suppression.** All of it was already right; none
  of it was visible.
- **The exposure model.** How a fight hurts you is doc 25 §3.5's work and it is good.
- **Ceilings stay hidden.** doc/06's rule holds: the creation screen still shows no ceiling, and a
  physical ceiling appears only on the player's own profile.
- **The world's own injury rate.** `campInjuryChance` is shared with the AI's camps, so the
  freshness term applies to everybody — which it should, and which is why the neutral point was
  chosen to keep the population rate where it was rather than to buy the player a discount.

---

## 6. Found, measured, and deliberately not fixed here

**`generateWorld` winds the clock back and leaves every timestamp in the future.** Pre-history runs
eight years forward from the start day and then `setWorld(db, { day: start })` puts the calendar
back, so that the roster is the age the generator intended. Nothing else moves with it.

Measured on a Small generated world, on the day the player arrives (day 2192):

- fight records dated **2375–5101** — all of them in the future
- `readyOnDay` up to **5214**, so 750 of 824 active fighters are medically suspended
- injuries dated 2193–5112, so 748 are carrying something unhealed
- **35 of 824 active fighters are bookable at all**
- `daysSinceLastBout` returns 0 for everybody, and the youngest active fighters are **13**

That is a defect in world generation rather than in the health model — the injury fixes above
cannot reach it, because from the player's day-one vantage none of those injuries has happened yet,
let alone healed. Fixing it means normalising every stamped day the pre-history wrote (records,
suspensions, injuries, reigns, agreements, news) against the wind-back, and answering two design
questions this change has no business answering on its own: what a fighter born during pre-history
should be when the clock returns, and how a record dated before its own `proDebutDay` should read.

The seeded eras (2020, 2026) are hand-authored and unaffected.
