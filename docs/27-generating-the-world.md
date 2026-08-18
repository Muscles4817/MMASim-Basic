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

Three bands:

| Band           | Who                                           | Fights resolved by    | Development     |
| -------------- | --------------------------------------------- | --------------------- | --------------- |
| **Foreground** | The player's promotion and division           | `simulateFight`, full | Per camp        |
| **Midground**  | The rest of the top tiers                     | `simulateFight`       | Per bout        |
| **Background** | The base tier, and anyone far from the player | Cheap resolver (§ 9)  | Quarterly, bulk |

A fighter is **promoted between bands** when they enter the player's orbit — signed to a promotion
the player is in, ranked, or offered as an opponent. What must match across the boundary is the
_distribution_ of outcomes, not the mechanism; that is testable and § 9 is where it gets tested.

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

Before any of the above is written, build a **cheap fight resolver** and measure it against
`simulateFight` on two axes:

1. **Fidelity.** Across many thousands of matchups spanning the rating range, the two must agree on
   win rate, method mix (KO / submission / decision), round distribution, and — because doc 25's
   whole health model reads it — damage taken. Not identical; _distributionally_ indistinguishable
   at the tolerances the statistical tier already uses.
2. **Speed.** How many times faster. That single ratio decides the pre-history length, the
   `SPORT_SIZE` ceiling, and where the background band's boundary sits.

If it is 20× or better, everything in this document is affordable. If it is 3×, pre-history has to
shrink and the Large world does not happen. **The design does not commit to a number until this is
measured.**

---

## 10. Definition of done

- A new game with no seed produces a complete, playable world: promotions across five tiers,
  fighters with coherent records, champions with reigns, gyms, coaches and officials.
- No real person, promotion or venue appears anywhere in the shipped build.
- The same seed string always produces the same world.
- Division depth follows doc 26 § 2.1's shape, heaviest at lightweight and thinnest at heavyweight.
- A national promotion's roster is drawn predominantly from its own region.
- A created fighter's opening offers sit in a 30–70% band in every preset and size.
- Background and foreground fights are distributionally indistinguishable.
- World creation completes inside the § 7 budget on a mid-range phone.

---

## 11. Phasing

0. **The cheap resolver, measured.** § 9. Nothing else starts until this number exists.
1. **Talent map.** Named nations, grouped regions, expanded name pools. Data, incremental, useful
   on its own — the existing seeded worlds get better nationality spread immediately.
2. **Promotion generation.** The five-tier pyramid from parameters, with `baseCountry` from the map.
3. **Fighter generation at scale**, with division shape and the roster-nationality link.
4. **Pre-history and the invariant check.** The piece that makes records real.
5. **Level of detail.** Band assignment, promotion between bands, the background tick.
6. **Presets.** Modern first; Dawn of MMA once churn exists, because a sport that starts in 1995
   and has no way to found new promotions cannot become the modern one.

Deferred to their own document, together: **promotion churn** and **dynamic national popularity**.
Dawn of MMA depends on both.
