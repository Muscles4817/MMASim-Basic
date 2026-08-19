# 27 — Generating the world

**Status:** proposal, nothing implemented. Supersedes doc 26's phasing; doc 26's measurements and
tier research stand and are referenced rather than repeated. Numbers here were re-measured after
PR #4 changed progression.

> **The short version.** The game should build its own sport. Not because generation is a nicer
> implementation than a seed, but because **the shipped game cannot use real names**, and because a
> generated pyramid is the only way to get the hundreds of promotions and thousands of fighters
> that doc 26 § 2 says the real sport has.
>
> The two hard problems are **coherent history** — a 19-3 fighter needs 22 opponents who existed —
> and **cost**. Both have the same answer: generate the world _earlier than the start date and
> simulate it forward_ at low fidelity. History becomes coherent by construction rather than by
> cleverness, and the cheap resolution that makes it affordable is the same machinery the running
> world needs for its own base tier.
>
> Everything downstream of that depends on one unmeasured number, so § 9 is a measurement rather
> than a feature.

---

## 1. Why generation, and what it changes

### 1.1 The legal constraint is the actual driver

The shipped game cannot use real fighters, promotions or venues. That makes generation the
**default and only** world the base game ships with, rather than an alternative to a curated one.

**This has a concrete consequence that must not be forgotten.** The `2026` era currently ships 164
hand-authored real fighters and real promotions, and it is `DEFAULT_ERA` — what a new player gets.
It cannot ship as it is. Either it is removed from the shipped build or every name in it is
replaced. Tracked here because it is the sort of thing that survives to release precisely _because_
it is the good-looking world.

### 1.2 What eras become

Not real-world snapshots. **Presets** — parameter sets the generator runs with:

| Preset          | What it generates                                                    |
| --------------- | -------------------------------------------------------------------- |
| **Modern**      | The sport as it is now: one apex, the full five-tier pyramid, mature |
| **Dawn of MMA** | No apex yet, a handful of promotions, low popularity, small gyms     |

The existing seeded worlds become what they already effectively are: a **testing artifact**, and
later the shape the mod space fills. Recreating the real sport becomes something a player _can_ do,
not something the game does for them.

### 1.3 What the player picks

Three things, and deliberately no more:

- **Seed** — a string. Same seed, same world, always.
- **Size** — Small / Medium / Large. Sets `SPORT_SIZE`, which sets everything downstream.
- **Preset** — Modern or Dawn of MMA.

Not a region picker. Where the pyramid sits should _fall out of_ the talent map rather than be
chosen. A later addition — picking the country you start in — is a different thing and belongs with
the career-start flow rather than with world generation.

---

## 2. The talent map

### 2.1 Named nations, and grouped regions

Modelled on how football management games handle scouting: the places with a real scene get
individual representation, and everywhere else is grouped at a coarser grain. That gives global
coverage without needing two hundred name pools.

- **Named nations (~30–35).** Where MMA has an actual scene or a feeder tradition: USA, Brazil,
  Russia, Japan, England, Ireland, Poland, Netherlands, France, Sweden, Georgia, Kazakhstan,
  Kyrgyzstan, Uzbekistan, Ukraine, Czechia, Mexico, Canada, Australia, New Zealand, China, South
  Korea, Thailand, Philippines, Nigeria, South Africa, Cameroon, Argentina, Cuba, Spain, Italy,
  Germany, Turkey, Iran, India.
- **Grouped regions (~10–12).** West Africa, East Africa, North Africa, Central America, Andean,
  Balkans, Baltics, Nordics, Southeast Asia, Middle East, Central Asia, Oceania.

`names.ts` currently carries **24 nations** with weights. This is expansion work, but it is data
rather than logic and can land incrementally — a region with no pool falls back to a neighbouring
one rather than breaking.

### 2.2 Talent is three dials, not one

The instinct behind this section is that the sport is full of people who would have been very good
and never got the chance, and that they are concentrated in places without money. That is right,
and the mechanism worth modelling is not "poorer countries produce more talent".

Raw athletic ability is a genetic lottery with no particular reason to correlate with a country's
wealth in either direction. Two _other_ things vary a great deal, and between them they produce the
effect:

| Layer                                  | Varies with                                                   | What it decides                                 |
| -------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| **Raw talent** — `naturals`, aptitudes | Nothing. Uniform worldwide.                                   | The lottery                                     |
| **Selection into MMA**                 | Alternative-sport pull, combat tradition, MMA popularity      | _How many_ gifted athletes end up in MMA at all |
| **Development**                        | Gym quality, coach quality — tracks wealth and infrastructure | Whether talent becomes a 78 or stalls at 55     |

**Selection** is the layer that does the work. Where football, basketball, athletics and tennis pay
better and cost less physically, a gifted athlete goes there; where there is a wrestling tradition
and fewer alternatives, the same athlete wrestles. That is an economic argument rather than a
biological one, and it is why combat sports draw as they do.

**Development** is the layer that strands people. Gyms and coaches are capital, and `applyTraining`
already multiplies gains by both.

The result is the one asked for: a country can be full of 80-potential fighters sitting at 55
because there is nowhere good to train — and, usefully, so can a _wealthy_ country where nobody
watches MMA, which a straight wealth axis could not express.

### 2.3 The scouting trap

If talent is high and gyms are bad in cheap countries, and the player can look there, scouting the
cheapest country becomes a dominant strategy and Coach Mode collapses into a spreadsheet. The
friction has to be real and it has to be _informational_ rather than only financial:

- **You do not know.** Scouting returns an uncertain read, and it is less certain the further from
  a developed scene you look. The `scouted.confidence` machinery already exists.
- **Moving costs.** Money, and time out of the gym.
- **They may not come.** A fighter with a life somewhere is not an asset waiting to be collected.

Stated here because the mechanic is worth nothing without it.

### 2.4 Popularity is dynamic — and deferred

MMA's popularity in a country should move: a promotion based there running good cards raises it, a
star from there at the apex raises it a lot, and popularity feeds back into how many good athletes
select into the sport. That loop is genuinely the thing that would make a thirty-year save feel
alive.

It is also a **system rather than a parameter**, and it is coupled to promotions being founded and
folding — which is the churn piece. **Both are deferred together to their own document.** For this
one, popularity is a static per-region number and promotions persist.

---

## 3. The pyramid

Counts from doc 26 § 2.2, scaled by `SPORT_SIZE`.

| Tier                       | Modern preset | Books from                                     |
| -------------------------- | ------------: | ---------------------------------------------- |
| **Apex**                   |         **1** | Its own roster, essentially exclusively        |
| **Major**                  |           3–5 | Its own roster, plus the top of the pool       |
| **National / continental** |         10–20 | A real roster, plus the pool in its own region |
| **Feeder / development**   |         20–40 | A small roster, mostly the pool                |
| **Regional / local**       |   scaled, 50+ | Almost entirely the pool                       |

**There is exactly one apex.** Not the biggest of several majors — a different category, which sets
the ceiling and which everybody else feeds.

Each promotion draws a `baseCountry` from the talent map, weighted so the apex lands in a large
developed market and the national tier spreads across the named nations. The **country → roster
nationality** link is what separates a world that feels designed from one that feels shuffled: a
national promotion in Poland whose roster is 80% American is instantly wrong.

Division depth comes from doc 26 § 4.1 — `SPORT_SIZE × DIVISION_SHARE[division]` — which fixes the
measured 1.08× flatness against the real sport's 3.4×.

---

## 4. History, by construction

### 4.1 The problem

Seeded fighters carry a _summary_ (15-3) and **zero `record` entries**: the W-L is a number with no
fights behind it. Generation would inherit that, and it matters more than it looks —
`offerOpponents` reads `record` for rematch cooldowns, rivalries read it, head-to-head reads it, and
the profile screen shows it.

Generating records directly is the obvious approach and it is a trap. A 19-3 fighter needs 22
opponents who existed; wins must balance losses across the whole world; and A-beat-B, B-beat-C,
C-beat-A rings appear immediately unless something prevents them.

### 4.2 The answer

**Do not generate history. Generate the world earlier and simulate forward.**

Build the population at start-date minus _N_ years, then run the sport at low fidelity up to the
start date. Every record has real opponents. Every win has a matching loss. Champions have reigns,
rivalries have fights behind them, rankings have a past, and veterans are veterans because they
actually did the miles.

Coherence by construction rather than by cleverness — and the cheap resolution that makes it
affordable is the _same machinery_ § 5 needs for the running world's base tier. It is not throwaway
code.

### 4.3 The two real problems with it

**You do not control the outcome.** A run can produce no credible heavyweights, or an apex champion
who is 39 and about to retire. The mitigation is invariant checks after the run — every division has
a champion of a plausible age and rating, the quality pyramid has the right shape, no division is
starved — with a re-roll or a targeted patch when they fail. That needs designing; it is not free.

**Cost.** § 9.

---

## 5. Level of detail

Doc 26 § 1.7, re-measured after PR #4:

| Era  | Fighters | Fights | One sim-year | Per tick |
| ---- | -------: | -----: | -----------: | -------: |
| 2020 |      139 |    171 |        596ms |   22.9ms |
| 2026 |      858 |    571 |       2180ms |   83.8ms |

**6.2× the population produced 3.3× the fights and 3.7× the cost.** Cost tracks _fights_, not
population. That is what makes 3,000–5,000 fighters plausible, and it is also the trap: any design
that scales card count with headcount throws the advantage away.

There is a second measurement that changes where the effort goes, and it cuts the other way. In a
_running_ world, fights are only **14% of a tick** (609 fights × 649µs = 395ms of a 2211ms sim-year;
the rest is matchmaking, training, ageing and ranking). The tick is budget-bound rather than
population-bound: 200, 400 and 858 active fighters cost 2154 / 2168 / 2080ms, because the promotions
run the same number of cards either way.

So cheap resolution is not primarily a running-world optimisation. **It is what makes pre-history
affordable** — fifteen years of simulated past where nothing but the results is kept, and where the
fight is the only thing being computed. That is the workload the levels below are shaped for.

### 5.1 Three levels, not two bands

An earlier draft of this section had three _bands_ that differed in how much of the world got
simulated. That was the wrong axis. The right one is **how much a fight has to produce**, and there
are exactly three honest answers.

| Level       | Used for                              | Must produce                                                        | Budget |
| ----------- | ------------------------------------- | ------------------------------------------------------------------- | -----: |
| **Full**    | The player's orbit (§ 5.2)            | Play-by-play, commentary, scorecards, stats, damage, news, purses   | ~650µs |
| **Reduced** | The current world outside their orbit | Result, method, round, damage, **fight stats** — no play-by-play    |  ~50µs |
| **Bulk**    | Pre-history                           | Result, method, damage. No stats, no scorecards, no news, no purses |  ~10µs |

The dividing line between Full and Reduced is **narration**: whether a human will ever read the
round-by-round. The line between Reduced and Bulk is **the historical record**: whether anyone will
ever open the fight and look at significant strikes landed. A fight from eleven years before the
start date is a row in a record and a contribution to accumulated damage; nobody is going to audit
its takedown accuracy, and computing it is pure waste multiplied by fifteen years of cards.

Bulk is not a worse Reduced. It answers a smaller question, which is the only reason it can be
cheaper — and the same reasoning says Reduced must not be a worse Full. What has to match across
every boundary is the **distribution** of outcomes, not the mechanism. A fighter who arrives in the
player's orbit with a 14-3 record built at Bulk must have a record that could have been built at
Full. That is testable, and § 9 is where it gets tested.

### 5.2 What "orbit" means

Orbit is a **relationship**, not a geography. A fighter is in it if any of:

- they are signed to a promotion the player is in;
- they are in the player's division _and_ ranked in a promotion the player could plausibly reach;
- the player has fought them, is booked against them, or has been offered them;
- they hold or challenge for a title at the apex, because everyone in the sport watches that;
- the player has scouted them (Coach Mode — § 2.3).

Geography deliberately does not appear. A Polish regional prospect two tiers below the player is not
in their orbit merely because they share a country; the apex champion on the other side of the world
is, because the player will see them on television. Orbit membership is recomputed each tick and a
fighter is **promoted to Full** the moment they enter it — which is the one hard constraint on the
Reduced level: it must keep enough state that promotion is seamless. Damage, injuries, freshness and
attributes are all carried at Reduced for exactly this reason.

Sized against doc 26 § 2's pyramid, orbit is **100–300 fighters** even in a 5,000-fighter world.
Everything else runs Reduced.

### 5.3 What each level runs

| Level   | Fight resolution               | Development     | Injuries            |
| ------- | ------------------------------ | --------------- | ------------------- |
| Full    | `simulateFight`                | Per camp        | Full, per doc 25    |
| Reduced | Round-level resolver (§ 9's C) | Per bout        | Full, per doc 25    |
| Bulk    | Statistical resolver (§ 9's B) | Annual, batched | Damage accrual only |

Injuries stay full-fidelity at Reduced on purpose. Doc 25 built `FightExposure` so that how a night
went decides what it costs, and a world where only the player's orbit can get hurt in a war is the
same family of asymmetry doc 24 spent its length closing.

---

## 6. What gets built, and in what order

```
seed + size + preset
  ↓
talent map            named nations and grouped regions, with weights
  ↓
promotions            the pyramid; each draws a baseCountry from the map
  ↓
divisions per promo   the apex runs all twelve; a regional runs four
  ↓
gyms + coaches        placed proportional to the map; quality tracks development infrastructure
  ↓
fighters              SPORT_SIZE × DIVISION_SHARE, nationality from the map
  ↓
pre-history           N years at low fidelity — §4
  ↓
invariant check       champions, quality pyramid, division depth — re-roll or patch
  ↓
officials, managers   scaled to promotion count
```

Everything except pre-history and the invariant check already exists in some form:
`generateFighter`, `generateName`, and `buildDepthFighters` do most of the fighter work today, and
**719 of the 2026 era's 858 fighters are already generated**. The step is smaller than it looks.

---

## 7. Numbers to pick

| Constant                   | First guess | Calibrated against                                        |
| -------------------------- | ----------- | --------------------------------------------------------- |
| `SPORT_SIZE` — Small       | ~800        | Roughly today's 2026 era; a fast world for weak devices   |
| `SPORT_SIZE` — Medium      | ~2,500      | The default                                               |
| `SPORT_SIZE` — Large       | ~5,000      | Doc 26 § 2's realistic pyramid                            |
| Pre-history length         | 12–15 years | A 35-year-old at start date has a full career behind them |
| Share of population signed | ~40%        | The apex stays selective; the base is mostly unsigned     |
| World-creation budget      | **< 10s**   | With a progress indicator; it happens once per save       |

---

## 8. What could go wrong

**Generation is slower than a seed by orders of magnitude.** A seed loads; a generated world runs a
fifteen-year simulation first. § 7's budget is 10 seconds and § 9 is the measurement that says
whether that is reachable.

**The generated world is boring.** A seed can be hand-tuned so the champion is interesting and the
divisions have stories. Generation gets whatever it gets. The invariant check (§ 4.3) is the floor,
but "not degenerate" is not the same as "interesting", and that gap is a real product risk rather
than a technical one.

**The cheap resolver and the real one disagree.** If background fights produce a different
distribution of outcomes, the base tier quietly becomes a different sport and fighters arrive in the
player's orbit with records that could not have happened. § 9 tests distributions, not vibes.

**Nationality becomes cosmetic.** If a Polish promotion's roster is drawn from the global pool, the
talent map is a name generator with extra steps. The country → roster link needs an actual test.

**The real-name era ships by accident.** § 1.1.

---

## 9. Phase 0 — the measurement that gates everything

### 9.1 The four candidates

| Option | What it is                                                                      | Verdict         |
| ------ | ------------------------------------------------------------------------------- | --------------- |
| **A**  | `simulateFight` with a coarser exchange clock — same model, fewer steps         | Superseded by C |
| **B**  | Statistical: one roll from ratings gives winner, method and round. No fight.    | **Bulk**        |
| **C**  | Round-level: one resolution per round, carrying damage and fatigue between them | **Reduced**     |
| **D**  | Quiet mode: `simulateFight` with commentary and event objects suppressed        | **Dead — 9.2**  |

### 9.2 Option D is dead, and the measurement says why

D was the tempting one because it changes no model behaviour at all. Measured on `simulateFight`:

|                                | µs/fight |    Share |
| ------------------------------ | -------: | -------: |
| Baseline `simulateFight`       |      649 |     100% |
| Commentary string generation   |       13 |       2% |
| `FightEvent` object allocation |        3 |     0.5% |
| **Quiet-mode ceiling**         |  **633** | **1.0×** |

Suppressing every byte of output the fight produces buys **nothing**. The cost is not narration; it
is `resolveExchange`, run about 83 times per fight at ~8µs each, and it scales cleanly with duration:

| Fight length | Fight time simulated |  Cost |
| ------------ | -------------------: | ----: |
| 1 round      |                 274s | 359µs |
| 3 rounds     |                 722s | 687µs |
| 5 rounds     |                1088s | 903µs |

So a cheap resolver has to **do fewer steps**, not print less. That is exactly what C and B are, and
it is why A collapses into C: once you are coarsening the clock, "one step per round" is the natural
stopping point, and it is the coarsest granularity at which the round is still a real unit with
scorecards and a stoppage point.

### 9.3 C, built and measured

`packages/engine/src/fight/round.ts`. One resolution per round, sharing the full model's actual
primitives — `createCombatant`, `strikeDamage`, `knockdownHazard`, `accrueFatigue`,
`recoverBetweenRounds`, `buildScorecards`, `readDecision` — and replacing only the loop.

**Speed: 733µs → 79µs, a 9.3× speedup.** Short of the 50µs / 13× target and comfortably enough:
Reduced now costs less than the matchmaking that books the fight.

**Fidelity**, across six matchups spanning the rating range, 1,000 fights each. The largest
disagreement on any win rate or method share is **11.3 points**, in the most lopsided pairings the
game will never book:

| Matchup                | win% (full → C) | KO% (full → C) | SUB% (full → C) | knockdowns (full → C) |
| ---------------------- | --------------- | -------------- | --------------- | --------------------- |
| even                   | 45.2 → 50.9     | 5.8 → 5.0      | 12.7 → 15.0     | 0.47 → 0.36           |
| striker v grinder      | 28.7 → 34.1     | 26.4 → 17.5    | 17.8 → 22.9     | 1.17 → 0.75           |
| bomber v journeyman    | 89.1 → 90.5     | 82.6 → 81.8    | 3.8 → 6.2       | 2.69 → 2.26           |
| contender v can        | 100 → 99.5      | 60.1 → 53.2    | 33.7 → 30.8     | 1.70 → 1.56           |
| guard player v smother | 8.7 → 12.3      | 5.4 → 5.3      | 24.0 → 22.7     | 0.40 → 0.36           |
| smotherer v striker    | 70.1 → 74.6     | 24.4 → 13.1    | 30.4 → 40.4     | 0.83 → 0.58           |

`tests/statistical/reduced-fidelity.test.ts` holds all of it: win rate and method mix to 12 points,
mean finishing round to 0.35, damage and knockdowns and per-round fight stats to a stated ratio, and
the speedup to a loose 3× that catches the regression that matters — somebody making the Reduced
level call into the exchange loop.

### 9.4 What building it actually taught us

Five things, each of which was a defect before it was a finding, and three of which are statements
about the **full** model that nobody had made before:

**Volume is a property of the situation, not of the striker.** The striker throws 12.2 significant
strikes a round on Striking 90 and Cardio 72; the journeyman throws 12.2 on fifty across. What moves
output is who is dictating, where the round is being fought, and whether the man opposite is still
all there. Two versions of the resolver led with a cardio-driven willingness term and both had to be
pulled.

**Submission attempts are bought with position, not with submissions.** The guard player, at 92
submissions, attempts 1.2 a round — fewer than the striker's grinder opponent at 62, because he
spends the round underneath. The rating buys conversion. Paying the specialist in both had him
beating a smotherer 28% of the time against a measured 8.7%.

**How much a fighter throws from underneath is a question about who they are.** The striker and the
guard player are pinned for the same two thirds of a round and throw 12.4 against 4.8. No position
penalty produces that; `strikeLean` does, and it is now exported for the purpose.

**Most of what a knockout does to somebody happens after the knockdown that caused it.** Prorating a
round to its finish and stopping there left the bomber having dealt 44 head damage against a
measured 68. The finishing sequence — four or so unanswered strikes at `alreadyHurt` — is where the
rest of it is.

**A distribution that cannot go negative must not be made out of one that can.** Knockdown counts
were drawn from a normal floored at zero. For a mean of 0.083 with a standard deviation of 0.317
that truncation more than _doubles_ the mean, and two average fighters came out at 0.62 knockdowns a
fight against a measured 0.46. Poisson.

### 9.5 What is left in C

Two cells carry the residual, both a striker against a grappler: **C under-counts the striker's
knockdowns by about a third**, which shows up as the KO rate reading 13% where the full model reads
24%. The mechanism is legible — an elite striker's case against a wrestler is what happens in the
seconds before the takedown, and a round has no seconds in it. It is recorded rather than hidden:
the test asserts the gap it currently has.

---

## 10. Phase 0, part two — what pre-history actually costs

**C was measured against the wrong thing, and so was option B.** § 9 measured the fight. This
measures the fifteen years. `tools/prehistory-cost.ts`, three world sizes, both resolvers, real
`advanceWorld` ticks:

| World                         | Fights | 15 years, full | 15 years, with C |
| ----------------------------- | -----: | -------------: | ---------------: |
| 858 fighters, 8 promotions    |  7,684 |          13.6s |             8.4s |
| 2,778 fighters, 38 promotions | 27,636 |          62.1s |            41.7s |
| 5,082 fighters, 74 promotions | 32,761 |          99.6s |            66.9s |

§ 7's world-creation budget is **10 seconds**, and these are desktop numbers — a mid-range phone is
three to five times slower. So the realistic-size world is 20–30× over budget, and **C's 9× fight
speedup buys 33% of a tick.**

### 10.1 Why the 9× only bought 33%

Because the fight was never the expensive part. Profiled at the Reduced level over four simulated
years of a 2,778-fighter world:

| Phase                                                     | Share of the tick |
| --------------------------------------------------------- | ----------------: |
| Running cards (`buildNight`)                              |             71.4% |
| — of which one bout (`runCardBout`)                       |             58.3% |
| — — of which **the fight itself**                         |         **13.2%** |
| — — the rest: ranking, development, purses, news, records |              ~45% |
| Matchmaking (`offerOpponents`)                            |              2.8% |
| Ageing everybody who did not fight                        |              5.1% |
| Quarterly intake, free agency, retirements                |              3.7% |
| Serialising the save                                      |              4.4% |

`rankDivision` runs **once per bout**, over every fighter in the division, to establish the ranks an
upset is measured against. `develop` runs per bout for both corners. `applyAftermath` computes
lessons, momentum, freshness and trauma. Every one of those is right for a fight somebody watches,
and every one is waste for a fight that exists only so a 34-year-old has a plausible record.

**So option B is not the answer either.** Going from C's 79µs to B's 10µs takes 66.9s to roughly
60s. What pre-history needs is not a cheaper _fight_, it is a cheaper **tick**.

### 10.2 Three things this turned up that were not about cost

**The sport's card rate is a constant.** `MAX_CARDS_PER_STEP` is 3 — three cards a fortnight across
_every promotion in the world_. That is a schedule for the eight promotions the game ships with.
Hand it to a 74-promotion pyramid and each promotion runs two cards a **year**: the sport gets
bigger without anybody fighting more. Doc 26 § 2's pyramid is unreachable until this scales, and it
is not a performance question — a generated world would look right and be inert. `advanceWorld` now
takes a `cardsPerStep` override; the default is unchanged.

**Even with the rate scaled, the world does not fight enough.** At 74 promotions and 27 cards a
fortnight, the 5,082-fighter world produced 2,184 bouts a year — **0.86 per fighter**, against a real
sport's two to three. A pre-history that ran today would hand a 34-year-old an 11-4 record built
over fifteen years. Getting the records right needs roughly 2.5× more fights again, which makes
every number in the table above worse.

**The cost grows as the records do.** Year one of the 5,082-fighter world costs 5.9s and year
fifteen costs 7.5s, a 27% drift. Availability is decided by `f.record.filter(r => day - r.day < 365)`
for every fighter on every step, so the check gets slower every year the sport runs.

### 10.3 What to do instead

Not one thing — the gap is 20–30× and nothing on this list is worth 20× alone.

1. **A bulk tick, not a bulk fight.** Skip what nobody will read: per-bout ranking, news, purses,
   bonuses, scorecards. Batch development annually instead of per bout. This is where the 45% is,
   and it is the same argument doc 27 § 5.1 makes about Bulk — applied to the tick rather than to
   the resolver, which is where it should have been applied first.
2. **Shorten pre-history.** Fifteen years is a choice, not a requirement. Eight still gives a
   35-year-old a full career behind them, and it halves everything above.
3. **Do not generate the whole pyramid at depth.** The base tier of a 5,000-fighter world exists so
   that people can climb out of it. It does not need fifteen years of individually simulated bouts.
4. **Stop saving during generation.** `db.save()` serialises every collection; at 5,000 fighters
   that is ~250ms, and during world creation there is nothing to be durable about.
5. **Only then, B.** It is worth about 10% of a bulk tick, which is worth having once the tick is
   the right shape and worth nothing before that.

**What this does not change:** C stays. It is the Reduced level for the _running_ world, where it
was always aimed, and there it is a straight 33% off every tick outside the player's orbit.

---

## 11. Definition of done

- A new game with no seed produces a complete, playable world: promotions across five tiers,
  fighters with coherent records, champions with reigns, gyms, coaches and officials.
- No real person, promotion or venue appears anywhere in the shipped build.
- The same seed string always produces the same world.
- Division depth follows doc 26 § 2.1's shape, heaviest at lightweight and thinnest at heavyweight.
- A national promotion's roster is drawn predominantly from its own region.
- A created fighter's opening offers sit in a 30–70% band in every preset and size.
- Background and foreground fights are distributionally indistinguishable.
- World creation completes inside the § 7 budget on a mid-range phone. **Currently 20–30× over —
  § 10.**
- Every fighter in a generated world averages two to three bouts a year of pre-history, not 0.86.

---

## 12. Phasing

0. **The cheap resolvers, measured.** § 9 and § 10. C is built. B is deferred — § 10.1 measured it
   as worth ~10% of a pre-history tick, which is not where the problem is.
   0b. **The bulk tick.** § 10.3. The piece that decides whether pre-history is affordable at all, and
   the thing to build before any of the below.
1. **Talent map.** Named nations, grouped regions, expanded name pools. Data, incremental, useful
   on its own — the existing seeded worlds get better nationality spread immediately.
2. **Promotion generation.** The five-tier pyramid from parameters, with `baseCountry` from the map.
3. **Fighter generation at scale**, with division shape and the roster-nationality link.
4. **Pre-history and the invariant check.** The piece that makes records real.
5. **Level of detail.** Orbit membership, promotion to Full, and the Reduced tick — § 5.
6. **Presets.** Modern first; Dawn of MMA once churn exists, because a sport that starts in 1995
   and has no way to found new promotions cannot become the modern one.

Deferred to their own document, together: **promotion churn** and **dynamic national popularity**.
Dawn of MMA depends on both.
