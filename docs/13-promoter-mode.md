# 13 — Promoter Mode

> Status: design. Nothing in this document is built yet.

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
  │  offer bouts → fighters accept or refuse                │
  │  set purses within a budget                             │
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

### Matchmaking
Offering a bout is a negotiation, not a command. A fighter's `stepUpAcceptance` decides
whether they take it; `shortNoticeWillingness` decides whether they save your card when
someone pulls out. High-ego fighters refuse fights beneath them; ambitious ones take fights
they should not.

### Building stars
The most interesting long-game system. A promotion's `narrativeControl` lets you *push*
someone — favourable matchmaking, better card position, marketing spend — and star power
grows faster than results justify. It works, and it is also a trap: the `Hype Merchant` trait
exists for exactly this, and a pushed fighter who gets exposed takes the promotion's buzz
down with them.

### Money
Per doc 12. The pressure is that purses are committed before revenue is known.

### Rival promotions
The other promotions run their own cards on their own schedule, sign fighters you let go,
and occasionally counter-programme your event on the same night — which splits the audience
and is a genuinely hostile act you can also commit.

## What the player actually does, screen by screen

| Screen | The decision |
| ------ | ------------ |
| **Calendar** | When to run, where, and on what broadcast model |
| **Card builder** | Which fights, in which order, at what purses |
| **Roster** | Who to sign, cut, push, protect |
| **Contracts** | Who is expiring and what it will cost to keep them |
| **Finances** | Where the money went and whether the last card worked |
| **News** | What rivals did, who got hurt, who left |

## Difficulty and starting position

You do not start at the top. Options:

- **Regional promoter** — small budget, no names, build from nothing. The default.
- **Established major** — inherit a roster and its problems.
- **Take over the giant** — most money, most scrutiny, most to lose.

## The failure state

You can go bankrupt. That has to be genuinely possible or none of the money decisions
matter. Warning signs are visible for several cards beforehand, and the recovery move —
running cheap cards with no stars — visibly costs you buzz, which is the trap.

## What must never happen

- A dominant strategy. If "always book the biggest fight" or "always protect the champion"
  wins, the triangle has collapsed and the mode is solved.
- Money that only goes up. Revenue growth must be beatable by cost growth.
- A card builder that is a spreadsheet. The decision should feel like matchmaking, not data
  entry — which means the game must *tell you what a fight is worth* before you book it, and
  be wrong sometimes.

## Open questions

- How much micro-management is too much? Setting fifteen individual purses per card is
  probably tedious by card three.
- Should the player be able to fix fights, or otherwise cheat? Interesting, dark, and a
  large amount of work to model fairly.
- Is bankruptcy a game over, or a demotion to a lower tier? The latter is probably kinder
  and more interesting.
