# 08 — Promotions, Marketing, Heat & Rivalries

> Status: design. Promotions, star power, reputation and matchmaking are built; the money,
> heat and rivalry systems are designed here and not yet implemented.

## The idea

The business layer is not a scoreboard attached to the fighting. It is the reason fights
happen at all, and it should regularly want things the sporting logic does not.

A promotion wants the fight that sells. A matchmaker wants a competitive card. A fighter
wants the belt, or the money, or to be protected. **Those wants must genuinely conflict**,
or promoter mode is just a spreadsheet with a calendar.

## Star power vs. reputation

Two numbers, deliberately, and the gap between them is where most of the interesting
management problems live.

| | **Star Power** | **Reputation** |
| --- | --- | --- |
| Means | What the market pays to watch them | What the sport thinks of them |
| Driven by | Charisma, aggression, spectacle, narrative | Results, and the level of opposition |
| Moves | Fast | Slowly |
| Rankings use | No | Yes |
| Revenue uses | Yes | Barely |

The seed roster is built to exercise both directions: drawing cards who are mediocre
fighters (Star 82 / Rep 66 with thirteen career losses) and excellent fighters nobody buys
(a reigning champion at Star 48). A test asserts both populations exist, because a roster
where the two correlate perfectly has wasted a system.

Star power gains compress asymptotically as the number rises — getting noticed is easy,
going from famous to iconic is not. Without that, the long-sim suite showed every active
fighter ratcheting to 100 and the top of the scale becoming meaningless.

## Competing promotions (built)

Five promotions across four tiers. They differ in the three things that actually change
decisions:

| Promotion | Tier | Prestige | Budget | Matchmaking aggression |
| --------- | ---- | -------- | ------ | ---------------------- |
| Apex FC | global | 95 | 42,000 | 72 — books what sells, including fights that damage its own stars |
| Vanguard MMA | major | 66 | 14,000 | 40 — protects its handful of names because it cannot afford to lose them |
| Rising Sun Combat | major | 58 | 9,000 | 78 — spectacle first, grand prix tournaments, hard on fighters |
| European Cage Circuit | regional | 38 | 2,400 | 58 — the main feeder |
| Frontier Fights | developmental | 22 | 900 | 66 — where careers start and quietly end |

`matchmakingAggression` is the single number that makes them feel different: it shifts how
heavily the opponent-offer weighting favours hype over safety.

## Heat (designed)

`heat` is directional, per-pair, 0–100: how much the audience wants to see *these two*
specifically. It is separate from either fighter's star power, which is why a heated fight
between two mid-carders can outdraw a title fight nobody asked for.

Heat accrues from:

| Source | Weight |
| ------ | ------ |
| Trash talk (Charisma × Aggression, gated by the `Trash Talker` trait) | High |
| A previous fight between them, especially a controversial one | High |
| A refused or ducked fight | Medium |
| Contrasting styles or personalities | Medium |
| Shared division and both on win streaks | Low |
| Time since it was last stoked | Decays |

`heatGeneration` is already a trait hook. `Trash Talker` multiplies it by 1.9 and damages the
promotion relationship doing it — the trade-off that makes the trait double-edged.

## Rivalries (designed)

A rivalry is heat that has become **persistent and personal**. It ignites when heat crosses
a threshold and both fighters' `rivalryIgnition()` (Aggression and Ego) clears a roll.

Effects, all mechanical:

- Large revenue multiplier on any bout between them.
- Both fighters accept the fight almost regardless of the paper odds.
- Increased Aggression and risk-taking inside the fight, which raises finish rates *and*
  damage taken — rivalry fights are more exciting and more costly.
- A loss to a rival costs far more confidence than an ordinary loss.
- Rivalries persist across promotions. A fighter leaving does not end it; if anything it
  raises the price of the eventual rematch.

## Money (designed)

```
revenue = base(promotion.prestige)
        × f(card star power, heat, title stakes)
        × market(baseCountry, venue)
        − purses − production − marketing
```

Purses scale with star power far more than with reputation — which is the mechanism by
which a promotion ends up paying a mediocre draw more than an excellent champion, and having
to explain it to the champion.

`purseDemand` already exists as a trait hook: `Mercenary` ×1.35, `Company Man` ×0.85.

## Contracts & free agency (designed)

- Fixed number of fights, an expiry, and an optional champion's clause.
- `reSignDiscount(personality)` from Loyalty: from −15% (a fighter who wants *more* to stay)
  to +30% (a fighter who takes less to stay where they were made).
- On expiry, rival promotions bid. Their appetite scales with the fighter's star power and
  their own budget and prestige.
- A promotion can lose its champion to a rival, which should be a genuine disaster and a
  genuine story.

## Commentary and narrative (partially built)

Commentators do not change outcomes. They change *perception*, which changes star power,
which changes money. Each has a style bias, a hype level, and a company-line rating.

A commentator who buries your fighter's grinding decision wins slows their star growth.
Choosing to fight somewhere the booth likes your style is therefore a real consideration —
which is the sort of texture that makes a world feel populated rather than tabulated.

## What must never happen

- Money that only ever goes up, making the business layer trivially solved.
- Heat that is purely a function of star power, which would make it a redundant number.
- Rivalries that are cosmetic — if a rivalry does not change how a fight is fought and what
  it pays, it is flavour text and does not ship.
