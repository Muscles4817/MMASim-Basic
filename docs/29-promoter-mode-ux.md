# 29 — Promoter Mode: situations, decisions, detail

> Status: **built**. This document describes what shipped, and why the shape changed.
> Read [13 — Promoter Mode](./13-promoter-mode.md) first for the fantasy and the economics;
> this is the interaction design that finally serves them.

## The defect

Promoter mode worked, and it read as **entity → raw data**.

Every screen was a true and complete description of a thing in the database. The promotion
screen described a promotion: name, budget, roster count, the six highest star-power fighters.
The fighter screen described a fighter: forty-four ratings, each with an explanatory sentence
printed underneath it. The calendar described the calendar. Nothing anywhere described a
_situation_, and a situation is the only thing a promoter can act on.

So the player was doing the simulation's own work. To discover that their lightweight champion
had not defended in eleven months, they had to remember who the champion was, open the fighter,
read the record, and do the arithmetic. To discover that eight fighters were inside a year of an
activity guarantee they were about to breach, they had to open eight contracts. Everything the
game needed to say was in the save; nothing was asking.

The three worst symptoms, in order:

1. **The card builder decided the card.** Pressing _Build a card_ filled all nine slots from the
   matchmaker before the screen had rendered, and the same button both booked and ran the night.
   The single most interesting decision in the mode — who fights whom — had been made, and the
   player's job was to disagree with it. That is proof-reading, not promoting.
2. **A card could not be planned.** There was nowhere to keep an April card that exists in
   January with three names on it, because the only card-shaped object in the game was a
   `FightNight`, which is a _finished_ thing. Forward planning — the actual job — was
   unrepresentable.
3. **The fighter page answered the wrong question.** It answered _how good is this fighter_ in
   enormous detail and did not answer _what do I do with them_: contract, availability, wants,
   condition, cost, and whether they are improving or declining were at the bottom or absent.

## The rule

> The simulation produces huge amounts of data. The UX turns it into **situations, priorities and
> choices**.

Applied literally: any fact the player would have to derive by opening several screens is a fact
the game should be stating. That is the whole of `game/attention.ts`, and it is why almost none
of this rework is new simulation — it is reading state that was already there and that nothing
was reading.

---

## 1. Cards are planned objects

The load-bearing change, and everything else follows from it.

`EventPlan` (engine `business/eventPlans.ts`, stored in the new `plans` collection) is a card
**with holes in it that are allowed to stay there**. It has a date, a market, a size, and a list
of slots. A slot may be empty for months.

```
January     create the April card                    12 slots, all empty
February    book the champion                        1 agreed
March       agree a challenger, add two prospects    4 agreed
April       autofill the last three prelims          11 agreed
the week of a withdrawal                             10 agreed, one hole to fill
```

A plan becomes a `FightNight` exactly once, on the night, by handing its **agreed** bouts to
`buildCard`. A draft nobody was offered and a bout somebody turned down are both _not fights_,
and putting them on the card anyway would make the offer system decorative.

The plan is the one thing in the save the player **wrote** rather than the simulation produced,
which is why it is stored rather than derived — and why every question asked about it (is it
complete, does anybody clash, has anybody answered) is a pure function over the slots rather
than a second field that can go stale.

## 2. Matchmaking is a sequence of decisions

Filling a slot is: **pick the slot → pick who you want → pick who they fight → designate it →
pencil it in or offer it.**

The opponent list is the part that matters. It is not an alphabetical roster with a search box,
because a matchmaker is choosing between _kinds of fight_ before they are choosing between
names. So `business/matchmakingIntent.ts` appraises every pairing and the screen groups them:

| Group                   | What it means                                |
| ----------------------- | -------------------------------------------- |
| Recommended             | Best few for the purpose the player selected |
| Ranking appropriate     | Within four places of each other             |
| Competitive matchup     | Close on paper                               |
| Prospect test           | A real step up for somebody young            |
| Build-up fight          | Credible opposition they should beat         |
| Commercially attractive | Somebody the audience knows                  |
| High risk               | The kind of loss that costs a year           |

Every row carries the rank, the record, the ability class, what it costs, what is left on their
deal, whether they will take it, their single biggest reservation — and **one sentence saying
why the matchmaker put them there**. A suggestion the player cannot interrogate is the game
playing itself.

The purpose picker (`MATCH_INTENTS`: build a prospect, test a prospect, title eliminator, build
a star, veteran showcase, rebuild, changing of the guard, fill the card, sell the room) does not
change the list. It changes the _order and the headline_, which is exactly how a matchmaker's
thinking works: the same fifteen fighters are a different shortlist depending on what you are
trying to do.

## 3. Nothing is booked until both corners agree

Placing a fighter in a slot is an intention (`draft`). Sending it is an offer, and the answer
comes back with a name and a reason. `acceptanceOf` already knew how to say no; nothing had ever
asked it twice for the same bout.

A refusal is not always final. A fighter who rates money above loyalty **counters** with a price,
and the player can pay it and close the fight — the negotiation the mode never had. Somebody who
flatly declined cannot be bought, which is what keeps a refusal meaningful.

Offers are seeded on the plan, the slot and both fighters, so re-reading the screen cannot reroll
the answer. A promoter who could refresh until everybody said yes is back to a card that always
fills.

## 4. Autofill is a tool, never the game

Every autofill is **scoped** — everything left, main event, co-main, main card, prelims — and has
two verbs:

- **Suggest fights** — proposals the player approves one at a time.
- **Fill them in** — pencils them onto the card, and still offers nobody anything.

The intended shape: book the main event, the co-main and two prospect fights by hand, then
_autofill prelims_. The matchmaker handles the undercard nobody bought a ticket for and the
player keeps every decision that matters.

## 5. Title fights are designated, not inferred

`isTitleFight: boolean` cannot express the three situations a promoter actually deals with, so
`TitleKind` is `undisputed | interim | vacant` and the screen says which are available **and why
the others are not**:

- an undisputed fight needs the champion in it;
- a vacant fight needs there to be no champion, and two ranked contenders;
- an interim fight needs a champion who _cannot defend_ — offering it while they are fit and
  available would make an interim belt free prestige, which is exactly what makes real ones
  contentious.

## 6. The dashboard is a command centre

Four things, in this order: **the event pipeline, what needs you, important roster situations,
the money** — with champions, contenders and the sport beside them on desktop.

`attentionFor()` asks the questions nobody was asking, scored on one comparable urgency scale so
a champion with no defence booked can outrank three expiring contracts:

- a card with no main event, getting louder as the date approaches
- a card that is short, inside six weeks
- bouts that were turned down and are still sitting in their slots
- a vacant belt in a division with two contenders in it
- a champion who has not fought in a year with nothing booked
- a #1 contender on a run who has not been given the shot
- fighters inside an activity guarantee they are about to breach
- deals ending after the next fight
- fighters unhappy enough that it is already making them hard to book
- somebody booked on a card they will not be cleared for
- a prospect on a run who is ready for a step up
- a name that still sells and no longer wins

Every row says what is true, what it costs if ignored, and where to go. A row without that is a
notification, and the old dashboard was made of notifications.

## 7. Money reads as a position, not a balance

One number is not a financial position. The books card shows cash, monthly burn split into
overheads and roster upkeep, what is already committed to booked fights, what the roster would
cost if everybody fought, and what the next card is forecast to return — plus a runway sentence,
because "Infinity months" is not a thing to show anybody.

Every figure in the game now goes through `ui/format.money`. The header said `£5.4m` and the
dashboard said `£5,400k` for the same number, which is a formatting bug and a symptom: nobody had
decided what the figure was _for_. A five-digit `£…k` anywhere is now a test failure.

## 8. The fighter page answers promoter questions

Ordered: identity → record and form → career situation → contract, availability and wants →
condition → scouting read → results → personality → detailed skills → derived ratings.

Four tabs (Overview, Career, Skills, Contract) on **every** width, because the grouping is
conceptual rather than a phone concession and a second desktop layout is a second thing to
maintain.

Three specific judgements:

**No exact overall rating.** `abilityRead` returns one of six wide classes and a sentence, never
the number. A player who can compare 34 against 47 across two screens is not scouting anybody,
and the whole interest of matchmaking is that two players should be able to look at the same
fighter and reasonably disagree about what to do with them. Every underlying rating is still on
the page for anyone who wants to form their own view — which is the version where the
disagreement is _informed_.

**Condition is near the top.** A 36-year-old with a body age of 41 and 67 points of trauma is a
completely different asset from a fresh 24-year-old, and that is a contract decision.

**Ratings are compressed.** `MiniRating` is a quarter the height of `RatingRow`, definitions move
behind one toggle for the whole page and each label's tooltip, and the derived ratings sit behind
_Advanced analysis_. Always-visible prose is reserved for analysis of _this_ fighter — the
scouting read, which is synthesised rather than templated:

> A well-rounded fighter who is very hard to put away. The record reads better than the fighter
> does — the level has flattered them. The hole is fight IQ and striking defence, and anybody
> good enough will find it.

## 9. Personality describes tendencies

The old trait blurbs read like internal simulation rules — _"beats everyone below them and loses
to everyone above. Never changes."_ — which is both untrue of the model and the wrong register
for somebody you are about to negotiate with. They now describe tendencies, and
`domain/disposition.ts` derives the promoter-facing read from the personality axes:

> **Money Motivated** — Financial terms weigh more heavily than loyalty or prestige when they
> assess an offer.
>
> **Protective of Record** — Prefers lower-risk matchmaking and may push back on a significant
> step up.

Emergent, not stored: nothing anywhere sets "Money Motivated", and the same fighter's read
changes as the simulation moves them. Same rule as `careerArc`, which recognises _hot prospect_,
_gatekeeper_, _aging contender_, _declining star_, _journeyman_, _attraction_ and the rest from
what actually happened rather than from a class handed out at generation.

## 10. Desktop width carries parallel context

`Console` is a two-column grid: the work on the left, the standing context beside it. Mobile is
one column in the same source order, so nothing needs a media query to _undo_.

| Screen    | Main                                         | Side                                  |
| --------- | -------------------------------------------- | ------------------------------------- |
| Dashboard | Pipeline, attention, roster situations, news | Money, champions, the promotion       |
| Card      | The slot board, issues                       | Forecast, autofill, send/run          |
| Fighter   | Scouting, condition, form                    | Promoter status, dispositions, traits |

Stretching a paragraph to 1600px is worse than leaving the space empty, so `wide` is opt-in per
route rather than a global change to `--content-max`.

## 11. Navigation grew without growing the tab bar

Five tabs is what a thumb can hit, and forking the shell to add a sixth would mean maintaining
the rail/tab-bar breakpoint and the focus handling twice. So the promoter's other systems —
events, championships, roster and contracts — live on a chip row at the top of the promoter's own
screens. The set will keep growing; the tab bar will not.

## What did not change

The visual language. Dark theme, restrained red accent, simple cards, compact management-game
type, mobile bottom nav, desktop rail. This was never an art-direction problem.

## What is still open

- **Withdrawals** currently roll on the night rather than during the weeks before it. The scene
  works — the slot empties and the player fixes it in the same matchmaking screen they built the
  card with — but a fighter falling out _while time advances_ would be better, and now that a
  card exists in the save there is finally somewhere for that to happen.
- **Counter-offers** are a single price, take it or leave it. A real negotiation has more than
  one round.
- **Rival counter-programming**: the world runs its own cards and the player can see them, but
  scheduling against one is not yet a decision with consequences.
- **Marketing spend and the bonus pool** are still not player levers, so a card's commercial
  outcome is decided entirely by who is on it.

## Blocked on a defect that is not this rework's

**Promoter mode cannot book anybody on a _generated_ world**, which since doc 27 is the default a
new player gets. This is not caused by anything here — it is the same on `master`, where the old
card builder fills **0 of 9 slots** on a generated world — but the planning screens surface it
starkly instead of quietly, so it is recorded here.

`generateWorld` runs eight years of pre-history _forward_ from the world's start day and then winds
the clock back, which is a deliberate and well-argued choice: the records, reigns and rankings stay
and the calendar reads as the era says it should. What winds back with the clock, though, is only
the clock. Everything pre-history stamped in absolute game days stays where it was written, and two
of those matter. Measured on a Small generated world, 824 active fighters:

|                                        |                              |
| -------------------------------------- | ---------------------------- |
| Last fight dated _after_ the start day | 745 (90%)                    |
| Consequently medically suspended       | 745, by up to **3,063 days** |
| Fighters under 18                      | 99 (minimum age 13)          |

`readyOnDay` is an absolute day stamped by `readinessDelay` during pre-history, so winding the
clock back leaves nine fighters in ten serving a suspension that ends years after the game begins —
and every matchmaking path in the game, the world's own included, filters on it. That is why
advancing a fresh generated world 120 days produces two cards across the entire sport. The ages
are the same root cause seen from the other end: a fighter generated at 13 who debuted at 19
during pre-history is 13 again afterwards, holding a professional record.

The fix is one step in the same function that already winds the clock back — rebase what
pre-history stamped forward, rather than only the clock. Which of the two readings is right is a
question for doc 27 rather than for this document:

- **Clear the suspensions and shift the birthdays**, so the roster is fit on day one and everybody
  is the age they fought at. Cheapest, and it keeps the design comment's promise that the eight
  years are history.
- **Shift every stamped day back by the pre-history span** — records, `readyOnDay`, reigns and
  birthdays together — so the history genuinely sits _before_ the start date. More faithful, and a
  larger change.

Deliberately not fixed here: it is world generation rather than promoter UX, it is somebody else's
current work, and the choice above changes what a generated world _is_.
