# 00 — Vision & Design Pillars

> Status: living document. Last updated at the Milestone 0 scaffold.

## What this is

A single-player MMA simulation you can play in short sessions on a phone, in one of three
career roles:

| Role         | Core loop                                                             |
| ------------ | --------------------------------------------------------------------- |
| **Fighter**  | Train → sign fights → run camp → fight → recover → manage career arc  |
| **Coach**    | Recruit/develop a gym roster → scout opponents → build game plans     |
| **Promoter** | Sign talent → book cards → build stars, heat and rivalries → survive  |

All three roles share one world: one calendar, one fighter pool, several competing
promotions, one simulation engine.

## Design pillars

### 1. Simple surface, deep water

The player sees **15 attributes** on a fighter, on a 1–100 scale. That is it. Everything
else — natural athleticism, motor-learning rate, accumulated brain trauma, per-attribute
potential ceilings, personality axes — sits *underneath* and is inferred, scouted or
guessed at, never shown as a raw number.

A screen should be readable in 3 seconds with one thumb. The *consequences* of what is on
that screen should take a season to fully understand.

### 2. Absolute stats, not weight-relative stats

**Power 78 means the same amount of force regardless of division.** A flyweight with Power
55 is a terrifying flyweight. A heavyweight with Power 55 is a heavyweight who cannot crack
an egg. This is non-negotiable and it buys us three things:

- Moving up or down in weight needs no rating conversion. The fighter is the fighter; what
  changes is the *company they keep* and the natural physiological trade-offs of the cut or
  the bulk.
- Cross-divisional comparisons ("could Ferguson beat Usman?") are meaningful.
- Extreme outliers are actually extreme. See pillar 3.

### 3. Outliers must feel like outliers

A generated or seeded 99 in an attribute is not "a bit better than 90". The rating→effect
curve is **deliberately non-linear and heavy-tailed**, so:

- **Ngannou (Power 99)** ends nearly anyone the moment he lands clean, in any division.
  Not "has a higher finish rate" — *ends them*.
- **Merab (Cardio 97 + Wrestling 88)** can throw takedown attempt #23 in round 3 with the
  same intent as #1, and only a genuinely elite, genuinely well-drilled takedown defence
  survives it.
- **Khabib (Ground Control 98)** is not "good on top". Once he is there, the round is over.

If two fighters both rated 90+ in something feel interchangeable, the curve is wrong.

### 4. Preparation is a first-class system

Camp is not a stat multiplier. Camp is where you *decide what fight you are trying to have*
and *what you are trying to take away*. A correctly-read, correctly-drilled game plan is
worth more than five rating points across the board — which is exactly how underdogs win in
real MMA, and exactly what makes a coach worth hiring.

Prep quality is gated by **scouting accuracy**, so the information you plan against may be
wrong. That is the game.

### 5. People, not spreadsheets

Fighters, coaches, referees and commentators have hidden personality axes and visible
traits. Personality drives: camp gains, weight-cut discipline, contract behaviour,
willingness to take short-notice fights, trash talk, rivalry formation, corner advice
quality, and how a fighter responds the first time they get badly hurt.

Referees have tendencies (early stoppage, late stoppage, stand-up happy). Commentators have
biases and catchphrases. The world should feel populated.

### 6. Honest, critical ratings

The seed roster is rated **critically**. Elite fighters have gaping holes. Popular fighters
have unflattering personality traits where the record supports it. Reputation and star
power are rated on what the market actually paid for, not on who is likeable. A rating
system that is polite is a rating system that is useless.

### 7. Long-horizon integrity

A 20-year sim must not drift into nonsense: no ratings inflation, no division collapse, no
600-fight careers, no immortal 45-year-old champions. This is enforced by an automated
**long-sim regression suite**, not by hope.

## Explicitly out of scope (for now)

- Multiplayer / online.
- 3D or animated fights. The fight is delivered as timestamped play-by-play text plus a
  live stat/momentum HUD.
- Real-money monetisation systems.

## Non-goals disguised as goals

- **Not a fight-picking simulator.** The player's decisions between fights should matter as
  much as the fights.
- **Not an accuracy contest.** The 2020 seed is a *starting position*, not a prediction
  engine. It needs to be plausible and honest, not to reproduce actual results.

## Reference index

| Doc                                                   | Covers                                        |
| ----------------------------------------------------- | --------------------------------------------- |
| [01 — Architecture](./01-architecture.md)             | Packages, boundaries, data flow, determinism  |
| [02 — Attributes & Ratings](./02-attributes-and-ratings.md) | The 15 attributes, scale, curves, naturals |
| [03 — Fight Engine](./03-fight-engine.md)             | Exchange loop, phases, damage, scoring        |
| [04 — Personality](./04-personality.md)               | Axes, traits, role-specific behaviour         |
| [05 — Prep & Camps](./05-prep-and-camps.md)           | Scouting, game plans, weight cuts             |
| [06 — Development & Potential](./06-development-and-potential.md) | Growth, ceilings, ageing, decline |
| [07 — Injuries](./07-injuries.md)                     | Acute, chronic, accumulated damage            |
| [08 — Promotions, Marketing & Heat](./08-promotions-marketing-heat.md) | Business layer, rivalries |
| [09 — Data Layer](./09-data-layer.md)                 | The light DB and its migration path           |
| [10 — UX & Design System](./10-ux-and-design-system.md) | Theming, layout, mobile rules               |
| [11 — Editor](./11-editor.md)                         | Editing the world, and why it warns not blocks |
| [12 — Events & Cards](./12-events-and-cards.md)       | The unit that makes the business layer work   |
| [13 — Promoter Mode](./13-promoter-mode.md)           | Money vs competition vs control               |
| [14 — Coach Mode](./14-coach-mode.md)                 | Judged on outcomes you cannot control         |
| [15 — Design Review Synthesis](./15-design-review-synthesis.md) | Docs 12–14 adjudicated after review |
| [16 — Contracts, Free Agency & Managers](./16-contracts-free-agency-managers.md) | What you signed, and who signed it |
| [17 — Money](./17-money.md)                           | Purses, net pay, the bank and the sink        |

## Build status

| System | State |
| ------ | ----- |
| Ratings, curves, derived stats | Built |
| Personality & traits | Built |
| Fight engine | Built and calibrated |
| Fouls, warnings, point deductions | Built — and `dq`/`noContest` can now actually happen |
| Commentary & the booth | Built — a biased commentator genuinely misleads |
| Scouting, game plans, prep | Built |
| Matchmaking & aftermath | Built |
| Retirement & fighter generation | Built |
| Create-a-fighter | Built — background and build set your ceilings |
| Training & attribute development | Built, and recalibrated: a created fighter can now reach a belt |
| Ageing, decline & idle decay | Built |
| Acute injuries | Built — recurrence, fighting hurt, aggravation |
| Weight-class changes | Built — the payoff for ratings being absolute |
| The ladder: rankings, signings, title shots | Built |
| Heat, rivalries & purse calculation | Built (doc 08) |
| The living world | Built — the roster fights, ages, retires and takes belts without you |
| News feed | Built — weighted, and capped per weight so history is not evicted by noise |
| Light DB, save/load, migrations | Built |
| Seed roster (139 fighters, real 2020 champions) | Built |
| Fighter career mode | Playable: create, train, climb, fight, retire |
| Editor | Built — fighters, promotions, gyms, coaches, referees, judges, commentators |
| PWA / offline | Built — manifest, icons, hand-written service worker |
| Events & fight cards | Designed (doc 12). Not built |
| Contracts, free agency, managers | Designed (doc 16). Not built |
| Money as a resource | Designed (doc 17). `purseFor()` is display-only today |
| Coach & promoter modes | Designed (docs 13–14). Not started — both reuse the systems above |
