# 16 — Contracts, Free Agency & Managers

> Status: **built**, except revenue points paying out, the bout agreement as a separate
> object, bundling, teammate refusal, and the retirement ledger.
>
> What ships: promotional agreements with a tolled clock, the championship extension bounded
> and priced, contract fairness driving resentment, renegotiation triggers, at-will release
> risk, managers as per-promotion connection vectors with a recorded advice track, free agency
> as a stratified near-monopsony, and unmatchable terms.
>
> Since: **the re-paper is live** — see below — and it is the mechanic that makes
> `MAX_FIGHTS_OWED` a cap on how long you can be trapped *without having said yes again*
> rather than a cap on captivity. **Release is live too**: promotions now actually cut people,
> and the hub tells the player when their place is slipping. See [17 — Money](./17-money.md) for
> the currency underneath it.
>
> Supersedes the contract sketch in [13 — Promoter Mode](./13-promoter-mode.md) and the
> manager layer proposed in [15 — Design Review Synthesis](./15-design-review-synthesis.md).
> The money layer this document depends on lives in [17 — Money](./17-money.md).
>
> Two independent critics reviewed the pre-critique draft — one briefed on realism, one on
> fun. Where this document and that draft disagree, this document wins. The rulings are
> recorded in Part 5.

## Why these three are one document

They are the same system seen from three sides. A contract is the *terms*; free agency is
what happens when the terms run out; a manager is the person who negotiated them and who
gets paid whether they were good terms or not.

Modelling any one alone produces something inert. Contracts without free agency are a number
on a screen. Free agency without managers is the player doing arithmetic against an AI that
has no opinion. Managers without contracts have nothing to manage.

Both critics endorsed the merge. It stands.

## The thesis

**A fighter's career is decided as much by what they signed as by what they can do.**

That is the claim, and it is the most under-modelled true thing in the sport. Fighters have
been made and ruined by contract terms — locked to a promotion at a purse that stopped being
fair three wins ago, unable to leave because of a clause they did not read, taking a fight on
eleven days because their manager needed the cheque. None of that is currently expressible.

The failure state to avoid is equally clear: **this must not become paperwork.** Every term
below exists because it produces a decision or a consequence the player can feel. Anything
that is merely accurate gets cut, and the previous draft was not ruthless enough about it.

## What the previous draft had wrong

Stated up front, because the corrections shape everything after them.

| The draft said | The sport actually does |
| -------------- | ----------------------- |
| "Term expiry protects the fighter who spent a year injured" | Contracts are **tolled**. The clock stops for injury, suspension, medical hold, refusal and retirement. Sitting out extends your captivity; it does not shorten it |
| Free agency is an auction where "every promotion that can afford them" bids | MMA is a **near-monopsony**. One dominant buyer, a fringe who cannot compete on prestige. The seed data already says so: Apex budget 42,000 against Frontier 900 |
| Matching rights make testing the market "mostly theatre" | The rival offer is the only price discovery in the system, and a matching right can only match terms the incumbent is **capable** of matching |
| The champion's clause extends the deal "indefinitely" and is a fixed feature | It is a tolling-plus-tail clause with a bounded end, and it is **negotiable** — high-leverage signings have had it removed |
| Managers take 10–20% | 8–15% on purse (modal 10). 15–20% is the rate on **sponsorship**, which the draft did not model at all |
| `integrity` decides whether advice "serves the fighter or the commission" | The athletic commission has no stake in a manager's advice. This was nonsense |
| Two or three losses and the promotion "is entitled to release you" | Release is an **at-will** clause. The losses convention is applied unevenly, and the unevenness is the interesting part |
| `marketValue` is "the same arithmetic `purseFor()` already uses" | `purseFor()` multiplies by `purseDemand`, which is what a fighter *asks*, not what they are *worth*. Reusing it silently inverts two existing traits |
| Stable size dilutes a manager's attention | Stable size produces **portfolio indifference**, which is a different and much worse thing |
| A manager's leverage over a promotion is refusing fights | The everyday use of a big stable is **bundling**, not blocking |

---

## Part 1 — Contracts

### Two documents, not one

The draft modelled a contract as one object. It is two, and separating them costs a type and
buys the mode its most-needed piece of legibility.

| | **Promotional agreement** | **Bout agreement** |
| --- | --- | --- |
| Signed | Once, on joining | Once per fight |
| Covers | Purse structure, fights owed, exclusivity, extension terms | Opponent, date, weight, rounds, card position, catchweight and rehydration terms |
| Duration | Months to years | One night |
| Refusing it means | You never joined | **You are under contract and you are still not fighting him for that** |

That last cell is the whole reason to bother. Doc 13's "offering a bout is a negotiation" and
doc 12's "can the player decline a card position?" are both *the bout agreement*. Without it,
a fighter refusing a fight is unexplained magic. With it, refusal is a document nobody signed
— and the consequence (the promotional clock tolls, see below) follows automatically.

### The terms

Nine terms survive. Each one changes a number the player can see or a door they can walk
through; the ones that did not are listed after the table with the reason.

| Term | What it is | The decision it creates | Range |
| ---- | ---------- | ----------------------- | ----- |
| **Show purse** | Paid to show, win or lose | Solvency. Camp is a fixed cost paid before the fight (doc 17), so show money is the part that keeps you training | 35–85% of total |
| **Win bonus** | Paid only on a win | Upside — and, because the **exchange rate is visible**, a scouting report on how the promotion rates you | see below |
| **Fights owed** | How many bouts the deal covers, **priced** | A long deal is safety if you plateau and a cage if you become a star, and it costs you money now either way | 1–6 |
| **Signing bonus** | Paid up front, in cash | The smaller promotion's one lever — and the richer promotion's unmatchable term when you are leaving a poor one | 0–1× annual purse |
| **Revenue share** | Points on the event's broadcast/PPV revenue | The term that separates "become a star" from "become a champion". Trading base for points is betting on your own draw | 0–5 points |
| **Championship extension** | Tolls while you hold a belt, plus a defined tail after you lose it | Priced and buyable-out at signing. This is the sharpest object in the mode and you take it knowingly | see below |
| **Matching rights** | The promotion may match a rival's *material terms* inside a fixed window | You **sell** these. The counterplay is structuring an offer they cannot match | ±12% show |
| **Exclusivity** | Whether you may fight elsewhere, and how often | Only earns its place because there is something on the other side of it — see below | boolean + carve-out |
| **Activity guarantee** | Bouts the promotion **owes you** per 12 months | Your only real counter to being shelved. Missing it stops the tolling and eventually voids the deal | 1–4 |

### What was cut, and why

- **Term length as a negotiable.** Both critics killed it from opposite ends: the fun brief
  noted it is a safety net with no cost to the fighter, so the fighter always wants it and it
  is not a decision; the realism brief pointed out that tolling makes the calendar largely
  decorative anyway. **Replaced by a fixed rule** — every deal also expires 36 months after
  signing, tolled like everything else. One sentence, no negotiation, no screen.
- **"Cutting somebody and then bidding for them costs extra."** Accurate. Invisible. Produces
  no decision the player can see or plan around.
- **The fairness ratio as a displayed number.** The mechanic stays and is load-bearing. The
  number never appears. A ratio needs a paragraph; a sentence does not. See below.
- **`integrity` as a visible 1–100.** Kept as a hidden generator, exposed only through
  observable behaviour. See Part 3.
- **Stable size as a stat.** Expressed as a rule and a sentence instead.
- **Renegotiation as a separate flow.** It is the same offer sheet with one promotion on it.
  Two negotiation screens is one negotiation screen too many.
- **Ancillary rights, tune-up clauses, co-promotion.** Cut, cut, deferred. Ancillary rights
  produce no decision below superstar level. Tune-up clauses are not a written term — the
  behaviour is real but it is matchmaker practice, and `narrativeControl` and
  `matchmakingAggression` already carry it. Co-promotion is real but rare; it is deferred with
  a hook, because it is the archetypal unmatchable term (below).

### The win-bonus exchange rate is a scouting report on yourself

The single cheapest good idea in either critique. When the fighter moves money from show to
win, the promotion quotes a **rate**: how many pounds of win bonus they will give for each
pound of show purse surrendered.

```
   rate = clamp(0.55 / pWin, 0.6, 3.0)
```

where `pWin` is the promotion's own estimate of how often you win over the life of the deal,
built from `paperOdds()` against the opponents they actually intend to book you against.

| They quote | What they are telling you |
| ---------- | ------------------------- |
| 0.7× | They think you win. They are not paying you to do it |
| 1.1× | They have no strong opinion |
| 2.4× | **They have booked you to lose and they have priced it** |

The player never sees `pWin`. They see the rate, on the offer sheet, in one line. A generous
exchange rate is the most useful insult in the game.

The default split at signing is **50/50**, which is the historic convention ($10k/$10k,
$12k/$12k), drifting show-heavy at the top because a genuine star does not accept half their
money contingent on the judges.

### Fights owed must cost something

Unpriced, "how many fights?" is not a decision — the promotion wants long and the fighter
wants short and the number is decided by whoever is more stubborn. So price it, on the sheet,
in money the player can see:

```
   showPurse ×= 1 + 0.06 × (fightsOwed − 3)
```

Six fights buys you +18% on every show purse. One fight costs you −12% and you are back at
the table in five months. *"Eight fights at £40k or three at £30k"* is instantly readable and
has no correct answer, which is the test.

**Hard cap of 6.** At three fights a year, a six-fight deal is two years of play. Beyond that
regret stops being regret and becomes a debuff with a timer. The exception is the bottom of
the sport, where `fightsOwed: 1` is the *default* — see exclusivity.

### Contract quality is *relative*, and that is the point

Protected by both critics; the truest line in the original draft. A purse is not good or bad
in isolation. It is good or bad against **what you are worth now**, and what you are worth
changes while the contract does not.

```
   fairness = showPurse ÷ marketValue(fighter, promotion)
```

`marketValue` is *not* `purseFor()`. It is `purseFor()`'s arithmetic with two things removed
— `purseDemand`, which is a demand modifier and not a worth modifier, and `isTitleFight`,
which is a property of a bout and not of a person. Getting this wrong would make every
`Mercenary` permanently underpaid by construction and every `Company Man` permanently
overpaid, which silently inverts two of the three existing business traits. See doc 17.

**The fighter knows, and the player is told in words.** Fairness below ~0.7 accrues
`resentment`, a stored per-fighter number feeding relationship, willingness to re-sign, and —
for a high-ego fighter — public complaint that costs the promotion buzz. What the player sees
is never `0.68`. It is:

> *"You are being paid like a prospect and you are ranked #4."*

A deal signed at 22 and honoured at 27 after three finishes is *the* recurring grievance of
the sport, and it falls straight out of `valueAtSigning` without being scripted.

### The clock is tolled, and that changes everything

```
   fight ─────▶ clock runs
   injured ───▶ clock stops
   suspended ─▶ clock stops
   refused a bout agreement ─▶ clock stops
   retired ───▶ clock stops
   promotion offers you nothing ─▶ clock RUNS (see below)
```

`fightsRemaining` only moves when you fight. `expiresDay` is pushed out day for day for every
day you are unavailable. This is the actual mechanism, and it is also better design: it kills
"hold out until the deal runs down", which would otherwise be a dominant strategy the moment
free agency became attractive.

**Sitting out becomes a gamble instead of a lever.** You are betting that the promotion caves
before your bank does — and now that camp, coaches and living cost money (doc 17), your bank
is a number on screen going down. That is a real decision with a visible clock. The old
version was a free move.

### Contract jail, and the activity guarantee that answers it

The sharpest weapon a promoter has is not the champion's clause. It is **not booking you**.
Eighteen months on the shelf, exclusive, unable to fight elsewhere, clock tolled, earning
nothing while camp costs continue. It costs the promotion almost nothing and it is legal.

That is too strong without a counter, so the counter is the one the sport actually uses: the
promotion **owes** you bouts.

| Tier | Default activity guarantee | Missing it |
| ---- | -------------------------- | ---------- |
| Global | 2 bouts / 12 months | Tolling stops; the calendar clock runs against them |
| Major | 2 / 12 months | |
| Regional | 3 / 12 months | |
| Developmental | 4 / 12 months | |

Miss the guarantee and the deal stops tolling. Miss it by a further six months and the
fighter may terminate for breach, walk, and take nothing with them but their freedom. A
higher guarantee is negotiable at signing at a cost to show purse, and a promoter who signs a
fighter purely to shelve them has to pay for the privilege.

In promoter mode this is the mode's best antagonistic move and its best trap: shelving a
rival's future star is cheap right up to the point where you owe him two fights you do not
want to make.

### Renegotiation is a quest line, not a screen

The promotion is never obliged to reopen a deal. What gives a fighter **standing** is public,
listed on the hub, and chase-able:

| Trigger | Why it works |
| ------- | ------------ |
| Winning a title | Obvious, and it is where the extension bites |
| Three consecutive finishes | Visible from one finish away |
| Main-eventing a card whose gate beat forecast by 25%+ | You proved you are the draw, in their numbers |
| Fight of the Night on a card that sold | Cheap for the promotion to acknowledge, expensive to ignore |

The hub states the nearest one: *"Three consecutive finishes reopens your deal — you have
one."* That is the entire difference between a bad contract being a punishment and a bad
contract being a goal. It costs one string.

What the promotion weighs is cost against relationship, against the risk of a disgruntled
star walking at expiry anyway. A promotion with high `narrativeControl` can **stall** —
publicly insisting the fighter is being looked after — at a relationship cost that only
surfaces later.

### The re-paper — the ratchet, done honestly

The fun brief wanted a mechanic that delivers the champion's-clause sensation roughly fifteen
times a career instead of once, and proposed "each win extends this deal by a fight". The
sensation is right; an automatic per-win extension is not a term that exists.

The true near-neighbour is better, and it is everywhere in the sport: after a good win the
promotion offers to **tear up the deal and replace it**.

```
   win ──▶ "We'll rip that up. More money, starting now."
              +25–40% show purse
              fights owed reset to 4–6
              extension terms reattached
              a fresh valueAtSigning
```

More money today for more captivity tomorrow, offered at the exact moment you feel
invincible. Refusing costs nothing except that the offer may not return at that price;
accepting is how a career gets quietly extended by four years. It fires after most meaningful
wins, so it hits the frequency target — and unlike an automatic clause it is a **decision
every time**, which is strictly better than the thing it replaces.

The ratchet is also the honest answer to the pacing problem, because it means the six-fight
cap is not really a cap on how long you can be trapped. It is a cap on how long you can be
trapped *without having said yes again*.

### The championship extension

Renamed from "champion's clause" because the draft's version — indefinite — was both wrong
and unplayable.

```
   hold the belt      ──▶ clock tolled; the deal cannot expire
   lose the belt      ──▶ tail: 2 further bouts OR 12 months, whichever comes first
   buy it out at signing ──▶ costs 15% of show purse, for the life of the deal
```

Bounded, visible, countable down on the hub, and **negotiable**. This is not a design
concession; it is what actually happens — high-leverage signings have had the clause removed
or modified, and at least one very public negotiation collapsed on exactly this point. The
draft's instinct ("visible, explained, priced at signing") was correct and is protected.

Explained in one plain sentence, which is all it gets: **"You cannot leave while you hold the
belt."**

**It applies at every rung.** A regional belt carries it too. This is realistic — the small
promotion has one asset and protects it harder than the big one does — and it fixes the
pacing complaint that the clause otherwise fires for the 5% of created fighters who reach
champion level at the top tier. Regional and national belts bring that to roughly a quarter
of careers.

### Exclusivity, and the content that justifies it

As a bare boolean, exclusivity is flavour and should be cut. It survives on the condition
that both of these are built:

1. **Per-bout deals are the default at the bottom.** At developmental and regional level the
   norm is `fightsOwed: 1, exclusive: false`, and a fighter genuinely fights for three
   promotions in a year. This is not an edge case; it is the shape of the lower sport, and it
   means the player *starts* non-exclusive and learns what exclusivity took from them.
2. **The carve-out.** A negotiated right to one non-title bout elsewhere per 12 months, at
   about 10% of show purse. Then exclusivity has a live consequence: *£30k on three weeks'
   notice in Japan, six weeks before your eliminator.* That is a decision. A boolean is not.

If the outside-fight content is not built, delete exclusivity and make global deals silently
exclusive as a rule.

### Release and cutting

Release is an **at-will termination clause**, not a losses trigger. "Three straight and
you're gone" is a convention applied unevenly, and the unevenness is the truer and more
interesting thing: exciting fighters survive 0-3, boring winners get cut. The engine already
has the two numbers to express it.

```
   cutRisk = f(losing streak, damage, age)
           ÷ f(starPower, heat generated, promotion.narrativeControl)
```

A `Star 82 / Rep 66` fighter with thirteen career losses is safe. A `Star 48` champion is
not, once he stops being champion.

Cutting is cheap, immediate and permanent, and the fighter you release sometimes becomes a
champion elsewhere — which must be visible in the news feed specifically so it stings.
`world.ts` already produces that event.

For the player, being cut is the mode's real failure state: not a game over, but a fall down
the tiers and a climb back with a worse record. **The fall must have a floor and a shape**,
which the current engine does not provide. See Part 2.

---

## Part 2 — Free agency

### How a deal ends

1. **Fights exhausted.** The common case.
2. **The 36-month backstop.** Tolled, so it rarely fires first.
3. **Release.** At-will, either side.
4. **Breach.** The promotion missed the activity guarantee by six months.

…except while the championship extension is running, in which case it does not end at all
until the tail has run out.

### The market is a monopsony, and that is good news

The draft described an efficient auction. It does not exist. What exists is one structurally
dominant buyer, and a fringe who sign three populations:

- fighters the leader **cut**;
- fighters whose price the leader **declined to match**;
- **regional and international specialists** the leader never wanted.

The famous bidding wars are famous *because* they are rare, and nearly all of them are the
same shape: a fighter the leader let go signs with the number two. The seed data has said
this all along — Apex 42,000, Vanguard 14,000, Rising Sun 9,000, ECC 2,400, Frontier 900. A
47:1 budget spread is not a market. It is a monopsony with a fringe.

**Free agency should therefore feel like escaping, not like being courted.**

### Test: does the triangle survive monopsony? It gets sharper

The realism brief claimed the MONEY / OPPORTUNITY / LEVEL triangle *improves* under
monopsony. Tested, and the claim holds — for a reason worth writing down, because it is the
opposite of the intuitive answer.

**Under an efficient auction the three axes collapse into one.** If everybody bids, the
richest promotion is also the highest level, and — being where the belts that matter are —
also the best opportunity. It wins all three axes simultaneously and the "choice" is a
dominated comparison. That is exactly the failure the draft warned about ("free agency as a
menu") and the draft's own market model was the thing causing it.

**Under monopsony the axes are forced apart, structurally:**

```
        MONEY                    OPPORTUNITY                 LEVEL
   the leader pays 5–20×    the leader offers you       the leader's roster is
   what the fringe can       the WORST route: #14       the only real test in
   ──────────────────        of 15, champion is 27      the sport
                             and just re-signed
   the fringe can only      the fringe can promise      the fringe cannot give
   compete on terms the      a title shot inside a      you a career-defining
   leader won't grant        year, in writing           win
```

The fringe's *only* strategy is to offer what the leader structurally will not: a contracted
title shot, revenue share, non-exclusivity, a home-market main event, co-promotion. So the
trade becomes real and permanent rather than a transient artefact of who happened to bid.

A regional promotion offering double and a title shot inside a year is a genuinely attractive
trap: you get rich and ranked, and your reputation among people who matter goes nowhere.
Taking the smaller cheque at the global promotion and starting on the prelims is often
correct and never obviously so.

**And the fun brief's demand survives too, better funded.** It wanted offers presented as
competing *named futures* rather than numbers. Monopsony makes that affordable: you cannot
write three specific lines of world-state for nine bidders, and you easily can for two. Fewer
offers is what pays for better offers.

### The offer sheet

Every offer, however few there are, reads as three lines built from state the sim already
computes:

> **Vanguard MMA** — 4 fights
> **Money.** £62k show / £62k win. £40k to sign. No points.
> **Route.** You would be roughly #3. The champion is Adebayo, 34, and he has one defence left in him.
> **Level.** Their #10 would be ranked #6 at Apex.

*"The champion is 34"* tells the player the belt is available in two years. That is the
lean-in moment, and every number in it comes out of `rankDivision()` and the world sim
unchanged.

### The two windows, and unmatchable terms

The draft treated matching rights as a term whose function is to nullify the outcome of the
mode's best scene. The fun brief wanted them cut for exactly that reason. **Overruled**, and
the realism brief's version turns out to be the fun fix as well — this is the same pattern as
doc 15's bankruptcy ruling, where realism supplied the mechanism and fun supplied the
outcome.

The real structure is two windows:

```
   ── last 45 days of the term ──────────────────────────────────
      EXCLUSIVE NEGOTIATION. You may not talk to anybody else.
      The incumbent's offer here is the only one on the table.
   ── expiry ───────────────────────────────────────────────────
      OPEN. Rivals may present bona fide offers.
   ── a rival offer is presented ────────────────────────────────
      MATCH WINDOW, 5 days. The incumbent may match its
      MATERIAL TERMS. All of them, or none.
```

And here is the inversion that makes it the best scene in the mode rather than the worst:

> **A matching right can only match terms the incumbent is capable of matching.**

The canonical case is a fighter's contract being "matched" with revenue share on a broadcast
platform the matching promotion did not operate. It went to court, because it was not a
match.

So the fighter's move is **offer structure, not offer size**:

| Unmatchable term | Who cannot match it, and why |
| ---------------- | ---------------------------- |
| Points on PPV revenue | Any promotion without a PPV platform. `revenueShareCapable: false` |
| A contracted title shot inside 12 months | A promotion whose champion has just re-signed |
| A co-promoted event | Anybody without a partner. Deferred, but this is its hook |
| Non-exclusivity | A global promotion, which will never grant it |
| A £400k signing bonus, in cash, on signature | A promotion with `budget: 2,400` |
| A home-market main event | A promotion that does not run in that country |

That last-but-one is the fun brief's own counterplay — *structure the rival offer as a heavy
signing bonus a poorer promotion literally cannot cover* — and it is exactly right when you
are escaping a regional deal for a global one. The mechanic runs in both directions, which is
how you know it is the right one.

**Matching rights are therefore sold, not assumed.** They are consideration, not a default.
Granting them is worth about +12% on show purse; refusing to grant them costs you the same.
And matching must be on material terms in full — the incumbent pays the whole rival number or
loses you. There is no "match minus".

The scene the player is playing changes from *"your choice is deleted"* to **"engineer an
offer they cannot match"**. That is a puzzle with pieces, and the pieces are on the sheet.

### The free-agency clock

A **30-day window**. Offers land on different days and expire.

| Tier | Typically moves | Why |
| ---- | --------------- | --- |
| Developmental / regional | day 1–7 | They need to know now; they have one slot |
| Major | day 6–20 | |
| Global | day 18–28 | They are waiting to see who else is interested, and they can afford to |

A good offer on day 3 that dies on day 10 is a real gamble, and *"the global promotion
usually moves late"* is knowledge the player earns and then bets on. Holding out acquires a
number.

### The fall, and the floor under it

Being cut is the best failure state this design has, and the current engine turns it into a
dead end rather than a fall. `promotionOffers()` hard-filters to exactly one tier *up* and
bails entirely on a losing streak, so a cut fighter has `promotionId: undefined`, a purse of
zero, a title-shot verdict of "you are not signed to a promotion", and an empty offer list.

That must change (see Part 4). What replaces it:

- **The low tier is busy, not empty.** Post-cut, the regional scene offers *more* fights,
  *faster*, at worse money. Being 34 and taking three fights in seven months at ECC for £4k a
  time is a real career state and it should be available within a fortnight of being cut.
- **The climb back has a stated shape.** Win three straight inside 18 months and the tier
  above calls. The hub says so.
- **The news feed rubs it in both directions.** The man who replaced you gets knocked out. The
  man you beat on the way down wins a title.

#### Built: the fall was still a dead end, one layer down

`promotionOffers()` is gone and `offersFor` replaced it, and being cut was **still** a dead end —
for a different reason, which had been sitting in the replacement since it shipped.

Every motive is a *step* from the fighter's own tier, and the fighter's own tier came from the
incumbent: `incumbent ? tierRank(incumbent.tier) : -1`. A cut fighter has no incumbent. So their
level was −1, below the bottom of the sport, and the smallest promotion in the world read as a
promotion *above* them while everything else read as a two-tier `reach` — which is gated on star
power ≥ 70. Measured: a released contender got **one** offer, from a developmental show, and
waiting did not change it, because nothing about it was going to change.

Three things now hold the floor up:

- **A free agent is priced at the level they last fought at**, from their own promotion, their last
  agreement, or the last bout on their record, in that order. Somebody who has never fought at all
  is priced at the bottom rung, which is where a professional debut happens.
- **The player's contract is real from the first screen.** A fighter taken over from the seed
  carries a `promotionId` and no agreement — the world models that as an implicit term, which is
  right for the eight hundred people nobody is looking at and switches the whole contract layer off
  for the one the player picked. Adopting a fighter now writes the deal down.
- **An unsigned fighter can still be booked.** `getOffers` resolved the matchmaking promotion as
  `promotionId ?? 'p_apex'`, and there is no `p_apex` in a generated world, so a released player got
  an empty opponent list on the screen whose empty state advises waiting a few weeks. It falls back
  to the smallest promotion that runs their division instead.

#### Built: the market is a shortlist, because the sport got bigger

Doc 16 says two or three callers, and that was true of an eight-promotion era. A generated Medium
world is over a hundred promotions, and a fighter near the top of it clears the `fall` bar at
almost all of them: measured, **thirty** offers for a fighter on a national show, thirty-four for
one on a major. Each renders as a card naming a champion, a projected rank and a level, because an
offer is a future rather than a number — and thirty futures is a scroll rather than a decision.

`shortlistOffers` takes the best offer at each *level* of the sport first and fills the remaining
slots by money, capped at four with at most two from any one tier, and returns a count of everybody
else. Stratified rather than truncated, deliberately: the four biggest purses would be the leader
and three majors, and the fringe promotion offering points on the revenue the leader cannot match
is the most interesting row on the screen. The hub shows a subset of the same list — never a
superset, which is the bug that started this — filtered to offers that are a step up or more money
than the deal in hand.

---

## Part 3 — Managers

### What a manager is for

A fighter does not negotiate their own contract, does not choose their own opponents unaided,
and does not hear about the short-notice opportunity first. A manager is the interface
between a fighter and the business, and they take a percentage for it.

Protected by the realism brief as true, non-obvious, and something most sims get wrong: **the
negotiation counterparty is the manager, not the fighter.**

### Attributes

The draft's five attributes were four monotone numbers and one hidden coin-flip, which makes
"choosing a manager" identical to "pick the biggest number the gate allows". The fix is a
data-shape fix, and the two critics arrived at it from opposite ends.

| Attribute | Shape | What it does |
| --------- | ----- | ------------ |
| **Negotiation** | 1–100 | Purse achieved against `marketValue`. 0.8× to 1.3×. This one is monotone and that is fine — it is the price of the percentage |
| **Connections** | `Record<PromotionId, number>` | Who takes their call. **Per-promotion**, not a scalar |
| **Favour balance** | `Record<PromotionId, number>` | How soft they are on a promotion that feeds them bookings. Hidden. Real. Invisible to the fighter — but see the observable rule below |
| **Standing** | 1–100 | Whether a promotion fears annoying them. Drives short-notice offers and favourable matchmaking |
| **Integrity** | 1–100, hidden | Whether they will lie to you. Never shown. Exposed only through the advice record and catchable lies |
| **Stable** | `clientIds` | Not a stat. Two rules: bundling leverage, and portfolio indifference |

**`connections` as a per-promotion vector is the whole fix.** A scalar collapses into a tier
gate; a vector cannot be ordered, so there is no "best manager" — only a manager who is good
*for the career you are trying to have*. The realism brief asked for it because the real thing
is a relationship with a specific matchmaker at a specific promotion; the fun brief asked for
managers to be shapes rather than tiers. **These are the same change**, and there is engine
precedent: `Rivalry` is already per-pair and persists (`heat.ts`).

### The percentage, and where the misalignment actually is

| Income | Rate | Note |
| ------ | ---- | ---- |
| Fight purse | **8–15%**, modal 10 | 20% is an outlier and regarded as predatory. The draft's 10–20% was skewed high |
| Sponsorship & endorsement | **15–20%** | The higher rate lives here, on income doc 17 introduces |

"A manager is paid on money, not on career" is directionally right and too crude to be the
whole story. A manager on 10% of a *single* client has a strong long-horizon interest in that
client not being brain-damaged at 26; repeat business is the asset.

**The real misalignment is the stable.** A manager with thirty clients runs a portfolio. Any
individual fighter is expendable, throughput beats care, and taking the short-notice fight for
client #22 is entirely rational even if it ends him. That is the mechanic, and it replaces the
draft's "attention dilution", which was the wrong effect attached to the right number.

The player is told in a sentence, never a stat: *"He has fourteen fighters. You are not the
priority."*

And there is a second, quieter misalignment doc 17 creates: a manager takes 15–20% of
sponsorship and 10% of purse, so **he would rather you signed with a promotion that lets you
keep your sponsors** — which is usually the smaller one. He will not tell you that.

### Managers are shapes

No global ordering. Each of these is the correct choice for somebody.

| Archetype | Shape | The career it buys |
| --------- | ----- | ------------------ |
| **The super-agency** | Connections 60–75 everywhere, standing 90, thirty clients | You get booked. You are also #22 of 30, and you will be bundled onto a prelim to get their champion a main event |
| **The company man** | Connections 90 at exactly one promotion, ~20 elsewhere | Signing him partly chooses your next five years. Superb until you want to leave |
| **The shark** | Negotiation 90, favour balance poor everywhere | The best money in the sport and a list of matchmakers who will not take his call in three years |
| **The old-school guy** | Standing 85, negotiation 55 | Short-notice title shots, mediocre money. A career made of opportunities you had no business getting |
| **The lawyer** | Negotiation 88, connections ~15 everywhere | An excellent deal at a promotion that does not book you |
| **The gym manager** | Your head coach also manages you. Narrow connections, high integrity | Collapses the manager-vs-coach conflict into **one person with two interests** — and he also wants you to stay at his gym |
| **The believer** | Negotiation 60, takes 8%, never leaves | Nobody else takes that call when you are 4-6 |
| **Family** | 0%, connections 0 | Not a bad manager. A **non-manager**. Extremely common, and the honest default for a debutant |

### The mechanic that saves the role: a recorded advice track

"The manager who is right" is the only thing that stops the role reading as a tax, and it
only works if the player can **check**.

Every offer he brings carries one falsifiable line:

> *"Don't take this one. He's too big for you right now."*

The outcome is logged. The hub shows:

> **Your manager has been right 7 of 10 times.**

That single number does four jobs at once: it makes overruling him a bet with a scoreboard,
it makes integrity observable without ever showing it, it *is* the relationship, and *"my
manager told me not to take that fight"* becomes a story a player tells someone else. One
line of text and a tally.

It also gives us a general rule worth stating, because it resolves the standing disagreement
between the two briefs about hidden numbers:

> **Any hidden number must have a derived observable.** `integrity` is hidden and readable
> through the advice record. `favour balance` is hidden and readable through placement
> history — *he has placed nine of his last twelve fighters at Apex*. A hidden number with no
> tell is noise, not depth; a hidden number with a tell is the game.

Lying is allowed, and **only catchable lies are allowed**. He says "that is the best on the
table"; a news item three weeks later shows the offer he never brought you. An uncatchable lie
is just noise on the player's numbers.

### The three refusals — bundling, blocking, teammates

The draft had one conflict (blocking) and had it backwards.

**1. Bundling — the everyday one.** A manager with several clients at a promotion trades
across them. *"You want my champion on the main event, you take my prospect on the prelim."*
This is what a big stable is actually for, and it is offensive leverage, not a defensive
block. It has two faces:

- In fighter mode you are sometimes the prospect being carried, which is a **benefit** you did
  not earn — and it costs you, because the favour gets spent and next time it is spent on
  somebody else.
- In promoter mode it is the manager as a real counterparty, and crucially the promoter can
  **pay to resolve it**. That is a decision. A wall is not.

**2. Blocking — the rare one, and always priced.** A manager will not put two of his own
together. The fun brief's rule is adopted without qualification: **always a price, never a
wall.** Force it and he books it resentfully, takes an extra 5% for the rest of the deal, or
drops you and you are unrepresented for six months. Any of those is a decision; a removed
option with no counterplay is the intermediary problem in its purest form.

**3. Teammates — the binding one, and it is free.** Fighters from the same gym refuse to
fight each other constantly, and it holds when the manager, the promotion and the money all
want it otherwise. It is far more common than a stable conflict, far more emotionally legible,
and `Fighter.gymId` already exists.

This one *is* a wall, and it is the single exception to "always price, never block" — because
the price is paid somewhere else and it is enormous: **you change gyms.** Fighters have done
exactly that to take a title shot. Doc 17 makes the gym a costed, load-bearing choice, so
leaving one is a genuine career decision with a number attached, not a menu toggle. That is a
better answer than pricing the refusal directly, and it is the true one.

### Choosing, firing, and self-managing

**Getting your first manager.** The draft said a debutant gets whoever will take them, which
is nobody good. That is half true and it produces a no-choice opening in a game whose opening
hours were already found to be inert (doc 06). Good managers **speculate on prospects**, early,
on a respected coach's recommendation. So the gate is not current `reputation`; it is hidden
`potential` filtered through `gym.prestige`.

*"A good manager signed me because my coach vouched for me"* is truer than a reputation grind
and is a far better reward for the gym choice the player already made.

**The first contract is the tutorial.** Exactly two live terms — show versus win, and four
fights versus six — with the manager explaining both, and every other term pre-set and
readable. Everything else in this document arrives later, one term at a time, as the player
climbs.

**Firing.** Switching costs a fee, a cooling-off period, and — with a well-connected manager —
a quiet reduction in what promotions offer for a while, because his favour balance was doing
work you could not see. **Firing a good manager because he told you something true is a
mistake the game should allow**, and the advice record is what makes it a mistake the player
can later identify as one.

**Self-managing.** Yes, as visible hard mode. Keep 100%; negotiate at ×0.85 of what a manager
would achieve; no connections at all, so only promotions that already know you make offers;
and you never hear about short-notice work. A legitimate late-career build for a fighter whose
name does the negotiating.

### What managers are in each mode

| Mode | The manager is |
| ---- | -------------- |
| Fighter | Your negotiator, your first source of bad advice, and a running scoreboard of how often he was right |
| Promoter | The counterparty in every negotiation. One with four of your fighters bundles, and you can pay him to stop |
| Coach | A rival influence on your own fighter who is sometimes right — and, if he is the gym manager, he is you |

---

## Part 4 — Data shapes and what the engine has to change

### Types

```ts
interface PromotionalAgreement {
  id; fighterId; promotionId;
  /** Thousands. Split is negotiated; default 50/50. */
  showPurse; winBonus; signingBonus;
  /** Points on the event's broadcast revenue. 0 for almost everybody. */
  revenuePoints: number;              // 0–5

  fightsOwed; fightsRemaining;
  signedDay;
  /** 36 months from signing, pushed out day-for-day by every tolled day. */
  expiresDay;
  /** Days the clock has been stopped. Shown, because captivity should be legible. */
  tolledDays: number;

  championshipExtension: 'none' | 'standard';   // tolled + 2 bouts / 12 months
  matchingRights: boolean;                       // sold, not assumed
  exclusive: boolean;
  /** Non-title bouts elsewhere permitted per 12 months. 0 unless bought. */
  outsideBouts: number;
  /** Bouts the promotion owes per 12 months. Breach voids the deal. */
  activityGuarantee: number;

  /** Snapshot of marketValue at signing, so drift is measurable. THE key field. */
  valueAtSigning: number;
}

interface BoutAgreement {
  id; promotionalAgreementId; boutId;
  opponentId; day; weightLimit; rounds;
  cardPosition: 'main' | 'prelim';
  /** Agreed purse for this bout, after card-position multipliers (doc 12). */
  showPurse; winBonus;
  catchweight?: number;
  /** Signed, offered, or refused. Refusal tolls the promotional clock. */
  status: 'offered' | 'signed' | 'refused';
}

interface Manager {
  id; name;
  negotiation; standing; integrity;              // 1–100; integrity hidden
  connections: Record<PromotionId, number>;      // 0–100, per promotion
  favour: Record<PromotionId, number>;           // hidden; observable via placements
  purseRate;          // 0.08–0.15
  sponsorshipRate;    // 0.15–0.20
  clientIds: readonly FighterId[];
  personality: Personality;
  /** Falsifiable predictions and their outcomes. Drives the one visible number. */
  advice: readonly { day; boutId; recommended: boolean; wasRight?: boolean }[];
}
```

`Fighter` gains `agreementId?`, `managerId?`, `resentment: number`, and (doc 17) `bank`. All
nullable where they should be: an unsigned, unmanaged fighter is a real state, and it is the
state every created fighter starts in.

### Code this design requires changing

Called out explicitly, because several of these are load-bearing and none of them are cosmetic.

| Where | What is wrong now | What this design needs |
| ----- | ----------------- | ---------------------- |
| `ladder.ts` `promotionOffers()` | Hard-filters `step !== 1`, so you can *only* be offered exactly one tier up | Allow step 0 (a lateral move — the everyday free-agency case), step −1 (the fall after being cut), and rarely step +2 for a genuine star. One rung at a time was a rule about *signings*, not about free agency |
| `ladder.ts` `promotionOffers()` | Returns `[]` when `streak < 2` | Free agency happens when a contract ends, not when you are winning. A cut fighter on a 0-3 skid must receive offers *down* the ladder or the fall is a dead end |
| `ladder.ts` `promotionOffers()` | Returns `{promotion, bonus, pitch}` | Must return a whole offer: purse split, fights owed, points, extension, matching rights, expiry day, and the three named-future lines |
| `heat.ts` `purseFor()` | Returns one number | Must return `{show, win}`. The document's central security-vs-upside decision has nothing to attach to otherwise |
| `heat.ts` `purseFor()` | Linear in star power; `tierFactor = prestige/100` | Power law. See doc 17 |
| `heat.ts` `purseFor()` | Multiplies by `traitMul(traits,'purseDemand')` | A new `marketValue(fighter, promotion)` that **strips `purseDemand` and drops `isTitleFight`**. `purseDemand` moves to the negotiation, where a `Mercenary` *asks* for more — which is what the trait means |
| `heat.ts` `purseFor()` | `titleFactor = 1.5` on the base | Comes off the base. It is currently cancelling the champion-vs-draw grievance docs 08 and 16 both promise. Title money moves into points and the card-position multiplier |
| `heat.ts` `boutValue()` | Two `purseFor()` calls exceed it for a marquee pair, and fall short of it for two debutants | The model currently loses money on its main events and profits on its prelims. Either `boutValue` is marginal and doc 12's event revenue is the real number — in which case say so — or it needs rescaling. Revenue points attach to the **event**, not the bout |
| `organisations.ts` `Promotion` | — | Gains `minimumPurse`, `sponsorshipPolicy: 'open' \| 'uniform'`, `revenueShareCapable: boolean`, `activityGuarantee: number` |
| `divisionMove.ts` | `weightMissRisk` is computed and warned about, and nothing happens | Wire to purse forfeiture: 20% of show purse to the opponent, 30% if egregious. Makes `Weight-Cut Gambler` a business trait, nearly free |
| `matchmaking.ts` `offerOpponents()` | Offers go to the fighter | Offers go through the manager, and become `BoutAgreement`s that can be refused |
| `titleShotEligibility()` | Says "you are not signed to a promotion" | Fine, but the state must be brief. See the post-cut floor |
| App / UI | `purseFor` is called in exactly two places and both are display | Money must accumulate. Doc 17 |

---

## Part 5 — The critique, and the rulings

Recorded in the style of [doc 15](./15-design-review-synthesis.md), because the exercise only
pays for itself if the reasoning survives the decision.

### Where they converged

Convergence from opposed briefs is the strongest signal available. Two cases, and both were
acted on without argument.

#### 1. Money is not a resource — and gross is not net

**Fun**: `purseFor()` is rendered on two screens and thrown away. Nothing accumulates. Every
term in Part 1 negotiates the allocation of a number that never leaves the display, so the
document is a menu the player has no reason to read.

**Realism**: fighters are independent contractors who pay their own camp, coaches, S&C,
nutrition, sparring, travel and tax. A fighter on £12k/£12k nets a few thousand for three
months' work. It is the single most-cited economic fact about the sport and the draft did not
contain it.

Two critics, opposite briefs, the same hole from opposite sides. **Decided without
qualification**, and it is significant enough to have taken its own document —
[17 — Money](./17-money.md). The sink is the fun brief's proposal and the right one: money
buys **camp quality**, which is the one system the game already has and the one the training
audit just made load-bearing. The contract becomes upstream of development, base-versus-win
becomes solvency-versus-upside instead of an EV calculation, and a fighter who loads the win
bonus and then loses twice trains at a worse gym next camp. A death spiral you can see coming
three months out.

#### 2. The champion's clause should be bounded, not infinite

The strongest finding in the review, because neither critic could see the other's reasoning.

**Fun** arrived at it from pacing and player experience: indefinite regret is punishment
rather than regret, so bound it and show the countdown — *"extends while you hold the belt, up
to three defences"*.

**Realism** arrived at it from the paperwork: the actual clause is a **tolling-plus-tail**
mechanism with a defined end, paired with an obligation on the promotion to offer bouts, and
it is negotiable — high-leverage signings have had it removed.

Same conclusion, different evidence, no contact between them. **Decided**: bounded extension,
priced and buyable-out at signing, applied at every rung so it fires for a quarter of careers
rather than a twentieth. The draft's instinct that it must be visible and never a gotcha was
protected by both briefs, and it turns out that instinct was not a concession to playability —
it is what the sport does.

### Where they conflicted, and the rulings

#### Matching rights

**Fun**: cut them. A term whose function is to nullify the outcome of the mode's most exciting
scene, and the draft admits it — *"makes testing the market mostly theatre"*.

**Realism**: they are the actual mechanism, and the draft has the insight backwards. A matching
right can only match terms the incumbent is **capable** of matching. Revenue share on a
platform they do not operate is not matchable, and the Alvarez/Bellator case is the proof.

**Ruling — realism, and it is also the fun fix.** This is doc 15's bankruptcy pattern again:
realism supplies the mechanism, fun supplies the outcome. Unmatchable terms convert the scene
from *"your choice is deleted"* into *"engineer an offer they cannot match"*, which is a
puzzle with visible pieces rather than a cancellation. The fun brief's own suggested
counterplay — structure the rival offer as a signing bonus a poorer promotion cannot cover —
is a special case of the general mechanic, which is the strongest possible evidence that the
general mechanic is the right one. Matching rights are additionally **sold rather than
assumed**, which was the fun brief's inversion and is also how consideration works.

#### The shape of free agency

**Fun**: offers must be competing named futures, chosen between.

**Realism**: MMA is a near-monopsony. Free agency is escaping, not being courted, and the seed
data's 47:1 budget spread already says so.

**Ruling — realism on the market, fun on the presentation, and they are not in tension.**
Tested in Part 2 and the realism brief's claim holds: an efficient auction *collapses* the
triangle, because the richest buyer wins all three axes at once. Monopsony forces the axes
apart structurally and permanently, because the fringe's only strategy is to offer what the
leader will not. And fewer offers is precisely what pays for the fun brief's named futures —
three lines of specific world-state per offer is affordable at two offers and impossible at
nine. The fun requirement was never a requirement about *how many* bidders there are.

#### Sitting out as leverage

**Draft**: the fighter's one lever against a promotion that holds all the others.

**Realism**: contracts are tolled, so sitting out mostly extends your captivity. That is more
interesting, because it turns a reliable lever into a genuine gamble and kills what would
otherwise be a dominant strategy.

**Fun**: a bad deal must have a visible route out the player can chase, or it stops being
regret and becomes punishment.

**Ruling — realism's mechanism, fun's requirement honoured through a different door.** Tolling
is correct and is adopted whole; the holdout becomes a bet against your own bank, which doc 17
makes a real and visible number. Fun's route out is delivered three ways instead, all of them
true: the **activity guarantee** (their obligation, breachable, and the only real answer to
contract jail), the **renegotiation triggers promoted to a hub quest line**, and the
**re-paper**. The route out of a bad deal is performance, not absence — which is a better
story than a holdout anyway, and it is the one the sport actually tells.

#### The champion's-clause ratchet

**Fun**: add "each win extends the deal by one fight", to deliver the trap-tightening
sensation ~15 times a career instead of once.

**Realism**: silent on it — but its account of the clause implies no such automatic term
exists.

**Ruling — adopt the sensation, reject the mechanism, substitute the true one.** The
**re-paper** is real, extremely common, fires after every meaningful win, and is strictly
better than the proposal because it is a *decision* every time rather than a passive clause
the player watches happen. More money now for more captivity later, offered at the moment you
feel invincible. It also honours "never a gotcha", which an automatic extension would violate.

#### Manager percentage and incentive

**Realism**: 8–15% on purse, higher on sponsorship; and the real misalignment is portfolio
indifference in a large stable, not simple greed.

**Fun**: managers must be shapes not tiers, and the role is only saved by a falsifiable,
recorded advice track record.

**Ruling — both, entirely, and they solve each other.** The numbers are realism's. The stable
mechanic is realism's, and it replaces the draft's attention-dilution, which was the wrong
effect on the right number. The archetypes and the advice record are fun's and are adopted
verbatim in spirit. And the two briefs independently produced the same structural fix without
noticing: realism wanted `connections` to become `Record<PromotionId, number>` because the real
thing is a relationship with a specific matchmaker; fun wanted managers to have no global
ordering. A per-promotion vector **cannot be ordered**. One change, both problems.

The disagreement about hidden stats — realism wants favour balance hidden because invisibility
is the right property; fun says hidden stats you cannot play around are noise — is settled by
the rule in Part 3: **any hidden number must have a derived observable.**

#### Stable conflicts

**Fun**: never block, always price. A removed option with no counterplay is the intermediary
problem.

**Realism**: blocking is the minor case. **Bundling** is the everyday one and it is offensive
leverage, not a defensive wall — and the more binding real conflict is **teammates**, which is
free in the data model because `Fighter.gymId` exists.

**Ruling — realism reframes it, fun sets the constraint, and one exception is granted.**
Bundling becomes the primary mechanic, which is much better for promoter mode because the
promoter can pay to resolve it. Manager blocking is always priced, never a wall. Teammate
refusal is granted the one exception to that rule — because its price is real, enormous, and
paid in a currency doc 17 has just made load-bearing: **you change gyms.** Fighters have
genuinely done this to take title shots.

### What was rejected, and why

| Note | From | Ruling |
| ---- | ---- | ------ |
| Cut matching rights | Fun | **Rejected.** Overruled above. The realism version is also the fun version |
| Cut exclusivity outright | Fun | **Rejected conditionally.** It survives only because per-bout non-exclusive deals become the default at the bottom of the sport and the outside-fight carve-out gets built. If neither ships, cut it |
| An automatic per-win extension clause | Fun | **Rejected.** The sensation is right and the mechanism does not exist. Replaced by the re-paper |
| Modelling ancillary rights (likeness, archive footage, video game) | Realism | **Rejected.** Real, central to the antitrust case, and produces no decision below superstar level. Doc 15 rejected outfitting *detail* for the same reason and was right |
| Tune-up and comeback clauses | Realism | **Rejected.** Not a written term. The behaviour is matchmaker practice and `narrativeControl` and `matchmakingAggression` already carry it |
| Territory, visas, licensing and the medical clearance battery | Realism | **Reduced.** Compressed into one flag on `connections` — *"he cannot get you fights in the US"* — which is the only part of it that is a decision. The paperwork around it is not a game, which is the ruling doc 15 already made about medical suspensions |
| Show the fairness ratio | Draft | **Rejected**, per fun. The mechanic is protected; the number never appears |
| Co-promotion | Realism | **Deferred**, with a hook. It is the archetypal unmatchable term, so the moment unmatchable terms exist it has somewhere to land |
| Three of the draft's four open questions | Draft | **Rejected as questions.** They all asked for *more manager*. Answered in Part 3 instead: self-management yes as hard mode, lying yes but only catchable, `connections` dynamic and per-promotion |

---

## What must never happen

- **Paperwork.** If a term does not change a decision or produce a consequence, it is deleted.
  Applied properly this time: five things from the previous draft are gone.
- **A dominant contract strategy.** "Always hold out" was one, and tolling killed it. If
  "always take the money" or "always sign short" starts winning, the triangle has collapsed.
- **A manager who is only a tax.** If the optimal play is to fire them and self-manage, the
  role has failed. The advice record exists to make that measurable rather than a feeling.
- **Free agency as a menu.** Choosing between offers must be choosing between *futures*. If it
  reads as two numbers, the offer sheet is wrong, not the market.
- **The championship extension as a gotcha.** Visible, explained in one sentence, priced,
  buyable-out, and counting down on the hub.
- **A hidden number with no tell.** Depth the player cannot play around is noise.
- **A removed option with no counterplay.** Price it. The single exception is a teammate
  refusal, whose price is a gym change.

## Open questions

- **What does a fighter under contract who wants out actually pay to be released?** Buyouts
  exist and are rare. There may be a real decision here or there may be a wall with a price
  tag on it, which is not the same thing.
- **Should a promotion be able to trade a contract to another promotion?** It happens when
  promotions are bought (doc 13's failure state produces exactly this), and it is the most
  brutal thing that can happen to a fighter who chose where to sign. Probably yes, only
  through acquisition.
- **How much of the offer sheet should a debutant be allowed to see?** Being handed a
  take-it-or-leave-it deal is authentic and unfun. The current answer — the first contract is
  a two-term tutorial — dodges rather than settles it.
- **Does the AI ever engineer an unmatchable offer against the player in promoter mode?** It
  should, or the mechanic is a player-only toy. The difficulty is making it legible when it
  happens to you rather than by you.
