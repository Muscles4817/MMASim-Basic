# 14 — Coach Mode

> Status: design, revised after review. Nothing in this document is built yet.
> Revisions follow [15 — Design Review Synthesis](./15-design-review-synthesis.md).

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

### Developing — the camp is beats, and the beats are about the room

The first draft of this section was a focus dropdown, and both reviewers said so. The fun
brief wanted the camp broken into moments with decisions in them; the realism brief pointed
out that the actual mechanism of a fight camp is **who you put in the room**. Those are the
same fix.

A camp is **3–4 beats**. Each one is a decision, and the central decision is room composition:

| Beat | The decision | What it turns on |
| ---- | ------------ | ---------------- |
| **Opening block** | Focus, and how hard to go early | Their age, their injuries, whether they came in fit |
| **Sparring** | Who spars whom, and at what intensity | Style mimicry vs. injury risk vs. confidence |
| **Mid-camp check** | Something has gone wrong. Push through, adapt, or pull out | Professionalism, ego, what the fight is worth |
| **Fight week** | Cut management, sharpening, the last read on the opponent | Discipline, the plan, whether they are listening |

Sparring is the mechanism, and it is genuinely double-edged. Giving your prospect the
gym's best wrestler every week is how they learn to defend takedowns — and it is also how
they arrive at fight week beaten up and unconfident. Feeding them somebody they handle
easily builds confidence they have not earned. Neither is right, which is what makes it a
decision.

Room composition also means **who you have available to be that partner**, which is where
recruiting stops being a list of prospects and becomes a squad-building problem: a southpaw
striker on the roster is worth keeping partly because half the division is southpaw.

What is new beside the beats is **scarcity**: your attention is finite, coaching staff cost
money, and a specialist you hire for striking is not helping the wrestler. A gym with three
fighters gets each of them a real camp. A gym with twelve does not.

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

**And there is somebody else in their ear.** Review found managers missing from all three
mode documents; in coach mode a manager is the natural antagonist, and a far better one than
a rival gym because they are nominally on the same side. The manager wants the payday. You
want the fight that develops them. When you disagree, *the fighter chooses* — and how they
choose is their personality, their loyalty to you, and how much money is on the table. An
antagonist who is sometimes right is worth ten who are not.

### Gym business — the 6pm class pays for the building

The first draft had the gym funded by a percentage of fight purses. The realism review killed
it: a gym living off purses closes inside a year. Gyms are funded by **memberships** — by the
hobbyists in the evening classes — and fight purses are a rounding error against that.

That correction is also the mode's second real decision, because memberships are driven by
**public profile**, not by merit:

```
   memberships  ←  who is visibly at your gym, and whether people like them
   reputation   ←  who wins, and who you developed
```

Those two are not the same fighter.

| The fighter who wins | The fighter who fills the class |
| -------------------- | ------------------------------- |
| 15-1, sullen, will not do seminars | 8-5, charismatic, local, teaches Tuesdays |
| Pays you in reputation, ranking and title shots | Pays you in rent, staff wages and mats |
| Attracts serious prospects | Attracts the sixty people who fund all of it |

Slots are limited. Choosing between them is coach mode's version of the promoter's triangle —
and the correct answer changes as the gym grows, which is what stops it being solved. A
garage gym cannot afford to be principled; a super-gym cannot afford not to be.

Facilities cost money and raise `quality`, which caps development. There is no membership
*management* screen — membership is an outcome of who is on your roster and how they are
seen, and a number the player affects rather than a spreadsheet they visit.

## What the player actually does

| Screen | The decision |
| ------ | ------------ |
| **Gym** | Facilities, staff, monthly costs, and what the memberships are doing |
| **Roster** | Who to keep, who to cut, who to give the good camp to |
| **Scouting** | Which prospects to sign, on incomplete information |
| **Camp** | The beats: focus, the sparring room, and what to do when it goes wrong |
| **Fight week** | Build the plan; then watch, and correct between rounds |
| **Relationships** | Who is unhappy, what it will take, and what their manager is telling them |

### Cornering
A live, small decision during the fight: between rounds you pick one instruction, and
whether it lands depends on your `cornering` rating and their adherence. It is the only
moment in the mode where the player acts during a fight, and it stays small precisely
because of that.

The gamification review asked for a fuller round-by-round corner minigame with real leverage.
**Overruled**, and the reason is structural rather than fussy: the thesis of this mode is
that you cannot control the thing you are judged on. Handing the player a reliable in-fight
lever refutes the premise. A corner has sixty seconds and a fighter who may not be listening;
the leverage belongs at camp time, where the coach genuinely has some.

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
  fast-forwarding through six fighters' camps could get tedious. The beats help — but six
  fighters × four beats is twenty-four decisions a cycle, and that is too many. Likely
  answer: only fighters with a booked fight get beats; everyone else gets a summary the
  player can drill into if they care.
- **Can you coach the player's own fighter from a previous save?** Tempting, and probably a
  distraction.
- **Should you be able to poach?** It is what actually happens, and it makes the AI gyms feel
  alive — but it also means the player's best fighter is permanently at risk, which may be
  more stressful than fun.

### Resolved by review

- **"Press train, wait".** Answered by camp beats and room composition.
- **Gym funding.** Memberships, not purses — and the correction produced the mode's second
  real decision rather than costing it one.
- **Is cornering enough live interaction?** Yes, deliberately. See above.
