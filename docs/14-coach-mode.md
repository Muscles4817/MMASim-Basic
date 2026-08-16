# 14 — Coach Mode

> Status: design. Nothing in this document is built yet.

## The fantasy

You run a gym. You take people nobody wanted and make them dangerous. Your reputation is
built entirely out of other people's careers, and the fighter you developed for six years
can walk out of the door for a better offer.

This is the most distinct of the three modes because **you never fight and you never book**.
Your entire influence is exerted through other people, before the cage door closes.

## The core tension

**You cannot control the thing you are judged on.**

```
   YOUR INPUT                      THE FILTER                  THE OUTCOME
   ──────────                      ──────────                  ───────────
   who you recruit                 their naturals, hidden      wins and losses
   what they train                 their motor learning        your reputation
   the game plan you build         their ego and adherence     their loyalty to you
   how you read the opponent       your own scouting error     whether they stay
```

Every one of those filters already exists in the engine. Coach mode is largely a matter of
putting the player on the other side of systems that are built: scouting accuracy, drill
quality, camp gains, game-plan adherence.

## The loop

```
  Recruit ──▶ Develop ──▶ Scout the opponent ──▶ Build the plan ──▶ Watch ──▶ Keep or lose
     ▲                                                                            │
     └────────────────────────────────────────────────────────────────────────────┘
```

## Systems

### Recruiting
The heart of the mode. You are buying **potential you cannot see**.

Your `scouting` rating determines how accurately you read a prospect's ceilings, and the
uncertainty band is wide — the same machinery as opponent scouting (doc 05), which is
deliberate: reading people is one skill. Two prospects shown `Wrestling 74 → 80 ± 9` can
have true ceilings of 71 and 89, and finding out costs you two years.

**The interesting decision**: gym slots are limited and every fighter costs money to keep.
Cutting a prospect at 24 who would have been a champion at 29 is the mistake the mode is
about.

### Developing
Assign focuses per fighter per camp, using the training system that exists. What is new is
**scarcity**: your attention is finite, coaching staff cost money, and a specialist you hire
for striking is not helping the wrestler.

A gym with three fighters gets each of them a real camp. A gym with twelve does not.

### Game planning
The player builds the plan the fighter takes into the cage — the camp screen that already
exists, but for someone else, and with the honest complication that **high-ego fighters
ignore you**. `gamePlanAdherence` is already personality-driven; in coach mode it becomes a
management problem rather than a modifier.

### Relationships
Fighters have opinions about you. Loyalty rises with wins, with time, and with being
listened to; it falls with losses, with being ignored for a better prospect, and with a
rival gym's offer. `Ego` clashes are already modelled in doc 04 — two high-ego personalities
in one room degrade both fighters' camp gains until one leaves.

**The gut-punch moment**: a fighter you developed from 40s to a title leaves for a bigger
gym, and you have to watch them win somewhere else.

### Gym business
Facilities cost money and raise `quality`, which caps development. Fees come from your
fighters' purses, so a gym with no winners cannot afford to make winners — a real
bootstrapping problem and the mode's difficulty curve.

## What the player actually does

| Screen | The decision |
| ------ | ------------ |
| **Gym** | Facilities, staff, monthly costs |
| **Roster** | Who to keep, who to cut, who to give the good camp to |
| **Scouting** | Which prospects to sign, on incomplete information |
| **Camp** | Focus assignment across the whole gym, with finite attention |
| **Fight week** | Build the plan; then watch, and correct between rounds |
| **Relationships** | Who is unhappy and what it will take |

### Cornering
A live, small decision during the fight: between rounds you pick one instruction, and
whether it lands depends on your `cornering` rating and their adherence. It is the only
moment in the mode where the player acts during a fight, and it should stay small precisely
because of that.

## Difficulty and starting position

- **Your own garage** — one prospect, no money, no reputation. The hardest and the best.
- **An established gym** — inherit a roster, a coach who resents you, and a wage bill.
- **A super-gym** — the resource problem inverted: too many fighters, not enough attention.

## What must never happen

- Coach mode reducing to "press train, wait". If the only interaction is a focus dropdown,
  it is a spreadsheet with a fight attached.
- Perfect scouting information. The mode dies the moment you can see true ceilings.
- Fighters never leaving. Loss has to be possible or loyalty is meaningless.

## Open questions

- **How much time passes per decision?** A coach's loop is slower than a fighter's, and
  fast-forwarding through six fighters' camps could get tedious.
- **Can you coach the player's own fighter from a previous save?** Tempting, and probably a
  distraction.
- **Should you be able to poach?** It is what actually happens, and it makes the AI gyms
  feel alive — but it also means the player's best fighter is permanently at risk, which may
  be more stressful than fun.
- **Is cornering enough live interaction?** Possibly the mode needs one more in-fight lever
  to stop the fight itself being purely spectator.
