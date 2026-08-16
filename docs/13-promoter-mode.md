# 13 — Promoter Mode

> Status: design, revised after review. Nothing in this document is built yet.
> Revisions follow [15 — Design Review Synthesis](./15-design-review-synthesis.md).

## The fantasy

You run a fight promotion. You decide who fights whom, who gets pushed, who gets protected,
and who gets cut. You are trying to make money *and* build a company that lasts — and those
two goals pull against each other constantly.

## The core tension

**Every fight you book is a trade between three things that cannot all be maximised.**

```
        MONEY                    COMPETITION                 CONTROL
   book the fight that      book the fight that is       book the fight that
   sells the most tickets   the best contest             protects your investment

   ↓ burns out stars        ↓ nobody buys it             ↓ fans notice, buzz falls
   ↓ risks your draw        ↓ no revenue to reinvest     ↓ rivals sign your name
```

That triangle is the game. A promoter who only chases money destroys their own roster; one
who only books competitive fights goes broke; one who only protects stars becomes a
laughing stock and loses the audience.

## The loop

```
  ┌─ Build a card ──────────────────────────────────────────┐
  │  pick a date, a venue, a broadcast model                │
  │  offer bouts → managers accept or refuse                │
  │  set the bonus pool and where the marketing goes        │
  └──────────────────────┬──────────────────────────────────┘
                         ▼
  ┌─ Sell it ───────────────────────────────────────────────┐
  │  marketing spend, press conferences, stoking heat       │
  └──────────────────────┬──────────────────────────────────┘
                         ▼
  ┌─ Run it ────────────────────────────────────────────────┐
  │  the card simulates; results, injuries, new stars       │
  └──────────────────────┬──────────────────────────────────┘
                         ▼
  ┌─ Live with it ──────────────────────────────────────────┐
  │  revenue, buzz change, contracts expire, rivals poach   │
  └─────────────────────────────────────────────────────────┘
```

## Systems

### Roster management
Sign, cut and re-sign. Contracts have a fight count, an expiry and a purse. Free agency is
real and rivals bid. `reSignDiscount(personality)` already exists: a loyal fighter takes
less to stay, a `Mercenary` holds out.

**The interesting decision**: cutting a fighter is cheap and permanent, and the fighter you
cut sometimes becomes a champion somewhere else. That should be visible in the news feed
specifically so it stings.

### Contracts — where the money is actually decided

Review moved purse-setting off the card and into the contract, for two reasons that happen
to agree: it is how the sport works, and setting fifteen purses a fortnight is unplayable.

A contract negotiation is the mode's one genuinely adversarial conversation, and it happens
perhaps twice a card rather than fifteen times:

| Term | The tension |
| ---- | ----------- |
| Base purse | What you can afford against what their manager thinks they are worth |
| Win bonus | Cheap if they lose. The lever for a fighter you are not sure about |
| Fight count | Long deals are cheap now and ruinous if they become a star |
| Champion's clause | Lets you keep a champion who wants out. Costs relationship the moment you use it |
| Matching rights | You can match a rival's offer. Rivals know this and overbid to bleed you |

The champion's clause is the sharpest object in the mode: it is entirely legal, entirely
standard, and using it makes the fighter and the audience hate you. That is the correct
feeling.

### Matchmaking
Offering a bout is a negotiation, not a command — and after review it is a negotiation with a
**manager**, not with the fighter directly. A fighter's `stepUpAcceptance` decides whether
they take it; `shortNoticeWillingness` decides whether they save your card when someone pulls
out. High-ego fighters refuse fights beneath them; ambitious ones take fights they should not.

Managers change the texture of this considerably. One who has four of your fighters can hold
a card hostage over one of them, and knows it. See doc 15.

### Building stars
The most interesting long-game system. A promotion's `narrativeControl` lets you *push*
someone — favourable matchmaking, better card position, marketing spend — and star power
grows faster than results justify. It works, and it is also a trap: the `Hype Merchant` trait
exists for exactly this, and a pushed fighter who gets exposed takes the promotion's buzz
down with them.

### Money
Per doc 12. The pressure is that purses are committed *seasons* before the revenue is known —
you signed that contract eighteen months ago, and the fighter has since become either a star
or a liability. At card time the only live money decisions are the bonus pool and the
marketing spend.

### Rival promotions
The other promotions run their own cards on their own schedule, sign fighters you let go,
and occasionally counter-programme your event on the same night — which splits the audience
and is a genuinely hostile act you can also commit.

## What the player actually does, screen by screen

| Screen | The decision |
| ------ | ------------ |
| **Calendar** | When to run, where, and on what broadcast model |
| **Card builder** | Which fights, in which order, and how big the bonus pool is |
| **Roster** | Who to sign, cut, push, protect |
| **Contracts** | Who is expiring, what their manager wants, and what it will cost |
| **Finances** | Where the money went, whether the last card worked, and the state of the rights deal |
| **News** | What rivals did, who got hurt, who left |

## Difficulty and starting position

You do not start at the top. Options:

- **Regional promoter** — small budget, no names, build from nothing. The default.
- **Established major** — inherit a roster and its problems.
- **Take over the giant** — most money, most scrutiny, most to lose.

## The failure state

Promotions do not really go bankrupt the way a shop does. **They lose their television deal**,
and then they get bought, or they shrink, or the owner sells. That is the mechanism, and it is
a better one than a balance hitting zero because it is visible, negotiable and survivable.

```
   rights deal healthy ──▶ under review ──▶ not renewed ──▶ acquired / demoted
        ▲                       │
        └── deliver ratings ────┘
```

Your broadcaster is a **counterparty with an opinion**. It wants ratings, stars, and cards
that deliver what they promised; it does not care whether the fights were competitive. When
the deal goes under review you can see it coming several cards out, and the recovery move —
running cheap cards with no stars to save money — is exactly the thing that gets the deal
cancelled. That is the trap, and it is a real one.

If you fail to recover: acquisition or demotion to a lower tier, your best fighters stripped
by the buyer. **You keep playing**, poorer and smaller, watching your former roster fight on
television for the company that bought you. Worse than a game-over screen in every way that
matters, which is the point.

## What must never happen

- A dominant strategy. If "always book the biggest fight" or "always protect the champion"
  wins, the triangle has collapsed and the mode is solved.
- Money that only goes up. Revenue growth must be beatable by cost growth.
- A card builder that is a spreadsheet. The decision should feel like matchmaking, not data
  entry — which means the game must *tell you what a fight is worth* before you book it, and
  be wrong sometimes.

## Open questions

- Should the player be able to fix fights, or otherwise cheat? Interesting, dark, and a large
  amount of work to model *fairly* — and modelling it unfairly is worse than omitting it.
  Deferred rather than rejected.
- Co-promotion, and whether a rival can be persuaded into it rather than only fought.

### Resolved by review

- **How much micro-management is too much?** Answered by moving purses to contracts. The test
  applied: a decision the player makes fifteen times a card had better be fifteen different
  decisions, and purses were not.
- **Bankruptcy or demotion?** Neither, quite — the rights deal is the failure state, and
  acquisition or demotion is its consequence.
