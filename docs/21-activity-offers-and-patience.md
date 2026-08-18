# 21 — Activity, offers, and the promotion's patience

**Status:** proposal, approved in outline; §5 records the three decisions already taken. Written
after a player training between fights lost their contract without warning. Every number in §0 was
measured against this codebase or taken from a cited source; nothing here is estimated without
saying so.

> **The short version.** A fighter must have **three bouts in the trailing year** or their deal is
> in breach — and the world's own ceiling is **three bouts a year**. So the schedule that keeps a
> contract alive is the maximum the simulation permits, held every year, forever. The real UFC
> average is **1.69**. The consequence is not a tuning problem: **41%** of the roster's year-old
> deals are in breach at any moment, the world voids **2,776** contracts in three simulated years,
> and a player who trains for one month after a normal two-fight year is a free agent with no
> warning given.
>
> The fight frequency is not what is wrong. It is already realistic. The **contract term** is
> calibrated against a schedule that neither this game nor the sport produces.

---

## 0. What was measured

Method: `createNewGame` on the 2026 world, `advanceWorld` across three years, then a count over the
top-tier rosters (`tier: 'global' | 'major'`). Run twice — once advancing a year at a time and once a
fortnight at a time — because §0 turns out to depend on which, and that dependence is itself one of
the findings. Player-side behaviour was reproduced by seeding a fighter with a year-old deal and a
two-bout record and calling `advanceTo` in one-month steps, which is what a training block does.

**The world's fight frequency, final year:**

| | This world | Modern UFC |
|---|---|---|
| Mean, active fighters | 2.18 | 1.69 |
| Median, active fighters | 2 | 2 |
| Fighters with no bout that year | 13% | — |

Distribution across 199 top-tier fighters: `0 bouts: 26 · 1: 34 · 2: 74 · 3: 65`.

**This is a good result and it is the load-bearing measurement in the document.** The simulation's
schedule is close to the sport's. Every defect below is therefore in the contract layer, not in
matchmaking, and the fix must not touch how often fights happen.

**What the contract layer does with that schedule:**

| | Measured |
|---|---|
| Deals older than a year | 49 |
| …of those, in breach of their own activity guarantee | **20 (41%)** |
| Walk-outs across the roster, three years — advancing a year at a time | 281 |
| Walk-outs across the roster, three years — **advancing a fortnight at a time** | **2,776** |

That last pair is not two measurements of the same thing, and the gap between them is itself a
defect. `enforceActivity` rolls a flat 0.25–0.85 chance **once per `advanceWorld` call**, and the
clock moves in fortnights while a player advances — so the same simulated three years voids ten
times as many contracts depending only on how the player chopped up their time. A rule whose
severity depends on the caller's step size is not modelling anything.

**The player's case**, reproduced exactly: an established fighter, deal signed 400 days ago, two
bouts in the trailing year — the real-life median — whose last fight was four months ago. One month
of training later: `promo=NONE`, contract void, and the only notice is an inbox item raised *after*
the fact reading "You have no promotion". The news feed says **"Shavkat Rakhmonov walks out on
UFC"** about a fighter who did not walk out on anybody.

**The arithmetic behind all of it**, in two constants that were never read against each other:

- `organisations-2026.ts` — `activityGuarantee: 3` for both global promotions.
- `world.ts:182` — `const MAX_BOUTS_PER_YEAR = 3`.

There is no slack at all. A fighter must take every bout the world will allow them, every year, to
stay level with the floor of their own contract.

---

## 1. What is actually wrong

Four defects. Only the first is a number; the rest are structural.

**1.1 — The guarantee is set above what anybody achieves.** Three bouts a year is the *ceiling* of
this simulation and well above the sport's mean of 1.69. A term that the median career cannot meet
is not a demanding term, it is a term that is always breached, and 41% of year-old deals sitting in
breach is what that looks like from the inside.

**1.2 — The player is judged by a rule written for somebody else.** `enforceActivity` models one
specific thing: *the promotion shelved a fighter it owed bouts to, so that fighter may walk.* For an
AI fighter that is sound — the world books them, so bouts not happening is the promotion's doing.
For the player it is exactly inverted: the player books themselves, so bouts not happening is the
*player's* doing. Applying the same rule to both turns a fighter's protection into a punishment for
choosing to train. Every other loop in `advanceWorld` takes the player exclusion. This one does not.

**1.3 — The promotion never asks you to fight.** There is no mechanism anywhere by which a promotion
initiates. The player picks opponents off the hub via `getOffers`, and nothing in the world ever
proposes a bout, a date or a purse. So the game cuts a fighter for failing to take offers **that
were never made** — and the player's side of the most ordinary exchange in the sport, the matchmaker
ringing up with a name and a date, does not exist.

**1.4 — The warning exists and is pointed at the wrong person.** `inbox.ts` raises "X can walk in N
days" between contract days 300 and 365. It is inside `if (world.playerRole === 'promoter')` — it
warns a *promoter* about their roster. A player-fighter is never told anything before their deal
evaporates, which is the whole of why this reads as a bug rather than as a consequence.

Worth separating out: **`releaseRisk` is not implicated.** It fires only after a loss, it is
loss-streak driven, star power buys patience, and it is a good model of an at-will cut. Nothing below
changes it.

---

## 2. What the sport actually does

- **Frequency.** The modern UFC average is **1.69 fights per active fighter-year**; the median is 2,
  and **46.4% of active fighter-years contain a single fight**. Unranked fighters go as high as five;
  ranked fighters typically manage one or two.
- **Inactivity is normal and rarely terminal.** Leon Edwards passed 400 days without a fight and was
  removed from the *rankings* — not released.
- **Release is at-will and often has nothing to do with activity.** Muhammad Mokaev was cut at 12-0
  after winning; Daniel Marcos was cut at 5-1. Dana White's stated reason in the first case was that
  "the matchmakers aren't big fans of his."
- **Refusal is the thing that actually costs you.** Fighters are offered specific bouts on specific
  dates and turn them down; Edwards reportedly declined a short-notice title fight and four other
  opponents. That — offer, refusal, patience running out — is the real mechanism, and it is the half
  this game is missing.

The correction is therefore **not** "make the guarantee gentler". It is that inactivity should be
judged against *offers that were made and refused*, because that is both what happens and the only
version of the rule that can fairly be applied to a player who chooses their own fights.

---

## 3. The design

**One sentence: the promotion asks, escalates, and only then acts.**

### 3.1 A ladder, measured from the last fight

| Stage | Idle | What the player gets |
|---|---|---|
| **Content** | < 6 months | Nothing. A full camp between fights is normal and must be silent. |
| **Nudged** | 6 months | *Notable.* "We'd like you active this year." No action, no clock stop. |
| **Pressing** | 9 months | *Decision.* A named opponent, a date, a purse. Take it or turn it down. |
| **Final** | 12 months | *Decision.* Another offer, and the sentence that says what refusing means. |
| **Cut** | 18 months **and** ≥2 refusals, or 24 months regardless | Released, with a news item that says why. |

Idle is measured from the last bout, not from the signing day — the current rule counts bouts in a
trailing year, which is why a fighter who had two fights nine months ago is in breach today for
something they cannot now fix.

### 3.2 The offer is a real object

An inbox decision carrying an opponent, a date and the purse. **Accept** books the fight and drops
the player into camp, exactly as the hub's own booking flow does. **Refuse** is recorded on the
agreement and costs nothing immediately — the second and third refusals are what spend the
promotion's patience.

This is the first thing in the game that stops the clock *to offer* rather than to warn, and it is
the point: training instead of fighting becomes a decision with a cost, rather than a silent trap.

### 3.3 Star power buys patience

Consistent with `releaseRisk`, which already encodes this and is right to. A draw gets asked more
politely and for longer; a fighter nobody is selling tickets to gets to the final stage faster. The
same unevenness, applied to the same currency.

### 3.4 The guarantee comes down to two

`activityGuarantee: 3 → 2` at the global and major promotions. Two is this world's measured median,
the sport's median, and — unlike three — a number a promotion can actually honour against a ceiling
of three. The promoter-mode trap that the guarantee exists to create survives: shelving a fighter for
a year still voids their deal. It stops being the default state of the roster.

### 3.5 The walk-out becomes a trickle

The breach roll is currently evaluated every fortnight at `0.25 + leverage * 0.6`, so a fighter who
enters breach is almost certain to walk within two steps. Recast as an annual hazard converted to the
step, so a breach is a growing risk rather than an immediate exit — which is also what it looks like
in the sport, where an aggrieved fighter complains publicly for months before anything happens.

---

## 4. What this deliberately does not change

- **Matchmaking and fight frequency.** §0 says they are already right. Nothing here touches
  `CARDS_PER_STEP`, `MAX_BOUTS_PER_YEAR` or the availability filter.
- **`releaseRisk`.** Losing three straight should still cost you your job, unevenly, with star power
  buying patience. That model is sound and stays.
- **Ring rust.** `SHARP_DAYS = 210` already prices a long layoff in sharpness. The patience ladder is
  deliberately pinned near it rather than duplicating it: the sport punishes a year out through
  *performance*, and this document only adds the contractual half.
- **The promoter's side of the guarantee.** Shelving somebody still loses them. That trap is doc 16's
  and it stays armed.

---

## 5. Decisions taken

**D1 — Is the approach an offer, a nudge, or an order?** → **A real offer that can be refused.**
A nudge leaves the player judged on offers that do not exist, which is defect 1.3 unfixed. An order
that tolls the contract on refusal is the most claustrophobic and the most faithful to a bad
promotional deal, and is worth revisiting once refusals exist as a tracked thing — but it makes the
first version punitive before the player has learned the rules.

**D2 — How long is the leash?** → **Real-life pacing**, per the table in §3.1. The alternative
considered was warn/offer/cut at 4/6/12 months, which keeps constant pressure on but makes a
twelve-week camp a gamble. Given §0 shows the median career is two fights a year, a leash shorter
than 18 months would go on punishing the ordinary case.

**D3 — Does idle time alone ever cost the deal?** → **Yes, at 24 months**, refusals or not. A fighter
two years out of the cage has stopped being a fighter, and a rule with no floor makes "never fight
again" a viable way to hold a roster spot forever.

**Open, and deliberately not decided here:** whether refusing should *toll* the contract — doc 16's
`TollReason: 'refusedBout'` exists in the type and nothing ever writes it. That is the honest
mechanism for holding out, and it belongs in its own change once refusals are recorded.

---

## 6. Definition of done

- A player with the sport's median schedule — two bouts a year — **never** loses a contract to
  inactivity.
- A player who stops fighting is **told at six months**, **offered a fight at nine**, and cannot lose
  the deal without having refused at least twice or sat out two years.
- The player is never described as having walked out on a promotion they did not walk out on.
- Across a three-year world sim advanced in fortnights, roster walk-outs fall from **2,776** to
  something a promotion could plausibly be responsible for, and the number no longer depends on how
  the player chopped up their advance.
- The measured fight-frequency figures in §0 do not move.

---

**The one-line version:** the schedule was right and the contract was written for a different sport —
so the fix is not to fight more, it is for the promotion to pick up the phone before it reaches for
the release form.
