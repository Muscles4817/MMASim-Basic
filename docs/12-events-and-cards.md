# 12 — Events & Fight Cards

> Status: **built** in the world simulation. The player's own fight is not yet placed on a
> card — that is the next step, and it is what the event screen needs.
>
> What ships: cards ordered by draw weight with a title fight always headlining, card
> positions driving distance and purse, the bonus pool awarded from what actually happened,
> the gate/broadcast/costs equation, and `resolutionOrder()` implementing "detail follows the
> player, not the broadcast".
> Revisions follow [15 — Design Review Synthesis](./15-design-review-synthesis.md).

## Why cards exist

Right now a fight is a one-off: the player books it, fights it, and the world moves on. That
is enough for a fighter career and completely insufficient for everything else. A **card** is
the unit that makes the business layer work:

- It is what a promoter actually produces. You do not book a fight, you build a night.
- It is where a fighter's *position* becomes visible — the difference between opening the
  prelims and headlining is the whole point of climbing.
- It is what other fighters' results arrive inside, so the world moves while you are in camp.
- It is the container for money: one gate, one broadcast deal, one set of purses.

## The shape

```
Event  (one night, one venue, one promotion)
  ├─ Main card
  │    ├─ Main event         5 rounds
  │    ├─ Co-main event      3 rounds (5 if a title)
  │    └─ 2–3 further bouts
  └─ Preliminary card
       └─ 4–6 bouts
```

| Field | Notes |
| ----- | ----- |
| `id`, `promotionId`, `day` | |
| `name` | `AFC 248`, `AFC Fight Night: Reyes vs Blachowicz` |
| `venue`, `country`, `capacity` | Drives gate revenue and the crowd's allegiance |
| `bouts` | Ordered. Index 0 is the main event |
| `broadcast` | `ppv` \| `televised` \| `streamed` — sets the revenue model |
| `status` | `scheduled` \| `complete` \| `cancelled` |

A `Bout` gains `eventId`, `cardPosition` (`main` / `prelim`) and `order`.

## Card position matters mechanically

Not decoration. Position drives:

| Effect | Main event | Co-main | Main card | Prelim |
| ------ | ---------- | ------- | --------- | ------ |
| Star-power gain multiplier | 1.6× | 1.3× | 1.0× | 0.6× |
| Purse multiplier | 2.5× | 1.6× | 1.0× | 0.5× |
| Rounds | 5 | 3 (5 if title) | 3 | 3 |
| Crowd/pressure effect on Composure | High | Moderate | Low | Low |

So a fighter's *career* has a second axis beside their record: where on the card they are
placed. Being a 12-0 prelim fighter is a real and frustrating situation, and getting off the
prelims is a genuine milestone.

## Building a card

Two paths into the same structure:

**Automatic** (fighter mode). The world generates cards on a schedule so the divisions keep
moving while the player is in camp. The player's fight is slotted into a card at a position
determined by their star power and the stakes. This replaces `advanceRoster` in
`app/src/game/progression.ts`, which currently only ages people.

**Manual** (promoter mode). The player builds the card themselves — see
[13 — Promoter Mode](./13-promoter-mode.md).

### Automatic matchmaking rules

1. Pick a division that has not run recently and has ≥4 available fighters.
2. Offer bouts by rank proximity, weighted by the promotion's `matchmakingAggression`.
3. Title fights when a mandatory challenger has been sitting.
4. Fill remaining slots from the unranked pool.
5. Order by combined star power and stakes; a title fight always headlines.

## Simulating a card

An earlier draft resolved bouts in reverse order — prelims first — so the night read like a
broadcast. Both reviewers rejected it, from opposite directions: it means eight fights of
dead time before the player's own, and it fails *worse* when the player is on the prelims,
because then they watch their fight and spectate the entire main card.

**The rule instead: the player's fight is the detailed one, wherever it sits.**

| Position on the card | What the player gets |
| -------------------- | -------------------- |
| Bouts before theirs | Resolved first, delivered as readable results. The building fills up |
| Their own bout | Full exchange-by-exchange play-by-play |
| Bouts after theirs | Resolved once theirs is done, delivered as results |
| Any bout, on request | Expandable into full play-by-play |

That last row is the whole difference between *the game showed me eight fights* and *I chose
to watch two of them*. A rival you have history with, or the fight that decides your next
opponent, is worth watching. The other six are worth a line each.

The card produces a **results feed**: every fight, its method, and any upsets. This is what
makes the world feel alive rather than a static roster the player fights their way through.

## Money

```
gate       = min(capacity, demand) × ticketPrice(prestige, main-event star power)
broadcast  = model-specific: PPV buys × price, or a flat rights fee
costs      = purses + bonuses + production(venue, broadcast) + marketing
profit     = gate + broadcast − costs
```

Demand is driven by the main event's combined star power and heat (doc 08), the promotion's
`buzz`, and how well the last few cards delivered. A promotion that runs bad cards sees
demand fall for the next one — which is the feedback loop that makes matchmaking a real
decision rather than a formality.

**Purses are not set here.** They are contractual, agreed when the fighter signs (doc 13),
which is both how the sport works and the only way the card builder stays playable — nobody
wants to set fifteen purses a fortnight. Card position multiplies the contracted figure; it
does not replace it.

### The bonus pool

Both reviewers arrived at this independently, which is about as strong a signal as design
review produces.

| Award | Awarded to | Driven by |
| ----- | ---------- | --------- |
| **Fight of the Night** | Both fighters in one bout | Combined significant strikes, lead changes, damage taken, whether it went the distance close |
| **Performance of the Night** | Up to two individuals | Finish quality: speed, method, and the gap in ranking it closed |

The promoter sets the pool size per card; the *simulation* decides who gets it, from what
actually happened in the fight rather than a die roll. Two things fall out of this, and both
are important:

- A prelim fighter can double their night's pay by having the right kind of fight. That is
  the real mechanism by which the bottom of a roster survives, and it belongs in the game.
- **An exciting loss becomes worth something.** In a game that otherwise pays only the raised
  hand, this is what stops the correct strategy being to fight safe and win boring.

## What the player sees

**Fighter mode.** An event page for their own fight: the full card, their position on it,
the officials, and afterwards the whole night's results. Plus a light news feed of other
cards, so the division moves visibly.

**Promoter mode.** The card builder — see doc 13.

## Open questions

- How many cards per month per promotion tier? Too few and the world is static; too many and
  the roster is permanently injured. Probably 2/month for global, 1 for major, 1 per 6 weeks
  for regional.
- Co-promotion events. Interesting, rare, and probably a later addition.

### Resolved by review

- **Can the player decline a card position?** Yes — and it goes through their manager (doc
  15), which is what makes it feel like a negotiation rather than a menu. Refusing a prelim
  slot is a real thing fighters do; it costs promotion relationship and it sometimes works.
- **Simulation order.** Settled above: detail follows the player, not the broadcast.
- **Per-card purses.** Removed. Contracts, not cards.
