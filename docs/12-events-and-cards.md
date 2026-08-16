# 12 — Events & Fight Cards

> Status: design. Nothing in this document is built yet.

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

Bouts resolve in reverse order — prelims first — so the play-by-play reads the way a real
broadcast does, and so the player's own fight lands last with the building already hot.

The card produces a **results feed**: every fight, its method, and any upsets. This is what
makes the world feel alive rather than a static roster the player fights their way through.

## Money

```
gate       = min(capacity, demand) × ticketPrice(prestige, main-event star power)
broadcast  = model-specific: PPV buys × price, or a flat rights fee
costs      = purses + production(venue, broadcast) + marketing
profit     = gate + broadcast − costs
```

Demand is driven by the main event's combined star power and heat (doc 08), the promotion's
`buzz`, and how well the last few cards delivered. A promotion that runs bad cards sees
demand fall for the next one — which is the feedback loop that makes matchmaking a real
decision rather than a formality.

## What the player sees

**Fighter mode.** An event page for their own fight: the full card, their position on it,
the officials, and afterwards the whole night's results. Plus a light news feed of other
cards, so the division moves visibly.

**Promoter mode.** The card builder — see doc 13.

## Open questions

- How many cards per month per promotion tier? Too few and the world is static; too many and
  the roster is permanently injured. Probably 2/month for global, 1 for major, 1 per 6 weeks
  for regional.
- Should the player be able to *decline* a card position? Refusing a prelim slot is a real
  thing fighters do, and it should cost promotion relationship.
- Co-promotion events. Interesting, rare, and probably a later addition.
