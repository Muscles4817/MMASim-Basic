# 28 — Fight night: the spectacle that never reaches the screen

> Player report, after a decision loss:
>
> *"There's no sense of Spectacle. No Fight Night feel. For one I think it sucks that we just
> go right to my fight when there are other fights on the card. I also think we need to have a
> better presentation of how the audience feels and reacts to the match, and the reactions to
> the result (it would help with certain results like the screenshot where it feels like i got
> screwed)."*

This is a presentation review, not a model review. Nothing below argues the simulation is
wrong. The argument is the opposite one, and it is uncomfortable: **almost everything the
player is asking for is already computed, and then discarded before it reaches a screen.**

---

## 1. What the night is today

The whole of fight night, end to end:

1. `CampScreen` — press **Yes — walk out**.
2. `runBookedFight()` simulates the bout, then `runSupportingCard()` invents and resolves the
   rest of the card *after the fact*, purely so bonuses and promotion revenue have something
   to be computed from.
3. `FightScreen` mounts. Two surnames, a playback-speed toggle, and a text feed starts
   dripping.
4. When the feed ends: Result → Afterwards → the card as a list of names → Fight statistics →
   Scorecards → **Back to career**.

There is no point in that sequence where a *night* happens. The player goes from a planning
screen to a text feed. The event they are fighting on is created after their fight is over and
shown to them as a table.

## 2. The pattern

| Already computed | Where it lives | What the player sees |
| --- | --- | --- |
| The card, in running order, with positions | `buildCard()`, `night.ts` | A list, after the fight |
| Event name — *"APEX 214: Jackman vs Landry"* | `eventName()` | One heading in the summary |
| Venue and capacity | `venueFor()`, `VENUES` | Name and city only |
| Attendance | `eventRevenue()` | **Nothing** — promoter mode shows it, fighter mode does not |
| Broadcast tier (PPV / TV / stream) | `broadcastFor()` | One word in the summary |
| Referee, and a written `reputation` line | `SEED_REFEREES` | **Nothing** — the field's own doc comment says "shown on the fight card" |
| Three judges, each a distinct archetype | `SEED_JUDGES`, `JUDGE_ARCHETYPES` | Three names, after the fight, on the card that beat you |
| Per-round statistics for both fighters | `tallies` in `simulateFight()` | **Nothing** — discarded when the function returns |
| Damage dealt — the *highest-weighted judging input* | `FightStats.damageDealt` | **Nothing** |
| How exciting the fight was | `excitement()` | Only as a bonus award |
| Whether the night delivered for the audience | `deliveryScore()`, `settleNight()` | **Nothing** — it moves promotion buzz silently |
| The order a night should arrive in | `resolutionOrder()` | **Nothing — zero production callers.** Unit-tested, never wired |
| Heat from a controversial result | `stokeHeat('controversialFinish')` — the largest heat source in the game | **Never raised in production** |

`resolutionOrder()` deserves its own line, because its docstring is the player's complaint,
written down and then not built:

> *"Bouts before the player's resolve first and are readable on arrival; the player's own is
> the detailed one wherever it sits; the rest resolve once theirs is done. That is the
> difference between* the game showed me eight fights *and* I chose to watch two of them."

Doc 12 § "What the player sees" promises "an event page for their own fight: the full card,
their position on it, the officials, and afterwards the whole night's results." No such page
exists.

---

## 3. Problem A — there is no night, only a fight

### What is wrong

The card is built **after** the player's bout resolves, which forces every card-shaped idea to
be retrospective. The player never stands in a building. They never see where they are on the
card before it matters, never see who is fighting after them, never see the room fill up.

Card position is the game's second career axis — doc 12 is emphatic that being a 12-0 prelim
fighter is a real and frustrating situation — and the player finds out where they were placed
*in a table after the fight is over*.

### What to do

**A1. Build the night before the night.** Move card construction ahead of the player's bout.
`runSupportingCard()` splits in two: build the card and run the bouts *below* the player, then
the player's fight, then run the bouts *above*. `resolutionOrder()` already returns exactly
this sequence and is already tested.

**A2. An event page, before the walkout.** Between the camp screen and the play-by-play:

```
APEX 214 — Riverside Hall, Manchester
Televised · 9,412 in a 12,000-seat hall

MAIN EVENT      Okafor vs Sandoval          — for the title
CO-MAIN         JACKMAN vs LANDRY   ← you
MAIN CARD       Reyes vs Traoré             Reyes, R2 (TKO)
PRELIM          Duarte vs Kim               Kim, decision
PRELIM          Novak vs Iyer               Novak, R1 (KO) — and the room woke up

Referee   Dan Corrigan — lets a fighter fight, sometimes past the point he should
Judges    Sandra Bell (balanced) · Warren Holt (control first) · Doug Frawley (pressure first)
Booth     Vince Moroni — a striking man through and through

                        [ WALK OUT ]
```

Everything in that mock is already in the database. The only genuinely new number is
attendance, which `eventRevenue()` computes and `FightNight` does not store — a one-field
addition.

**A3. Make the walkout a beat.** One button, one deliberate press, between knowing what you
are walking into and the first bell. The cost is nothing and it is most of the "fight night
feel" on its own — anticipation is a *pause*, not an animation.

**A4. Bouts above you land while you read your aftermath.** If you are on the prelims, the
main event happens after you and you find out how it went. If you *are* the main event,
nothing follows you — and that silence is the reward for headlining.

**A5. (Later) Any bout, expandable.** Doc 12's fourth row. `FightScreen` already renders a
stored `FightResult`; today the undercard keeps only `{winnerName, method, round}`. Keep the
full result for bouts the player has a reason to care about — a rival, or whoever wins the
fight that decides their next opponent — and let them open it.

---

## 4. Problem B — the audience is not in the building

### What is wrong

There is no crowd anywhere in the fight. The only mention of one in the entire play-by-play
layer is a single commentator line about a stalled ground position. Meanwhile the game
maintains a genuinely good model of *what an audience enjoys* — `deliveryScore()` — and uses
it solely to nudge a promotion's buzz number that the player never sees either.

Doc 12 also specifies a **crowd/pressure effect on Composure**, scaled by card position. It is
unimplemented: `FightConfig` takes no crowd, stakes or position input at all. So headlining
in front of 12,000 is mechanically identical to opening the prelims in front of 400.

### What to do

**B1. The crowd as a voice in the play-by-play.** `callFight()` is already a pure post-pass
over a finished result — it cannot change an outcome by construction, which makes it the safe
place to put this. Give it the room: capacity, attendance, broadcast tier, card position,
heat, and the venue's country against each fighter's nationality (doc 12 promises the venue
"drives the crowd's allegiance"; nothing implements it).

Beats worth having, all keyed off signals that already exist:

- A roar on a knockdown, scaled by how full the building is.
- The rise and fall around a near-finish — `jeopardy` in `deliveryScore()` is exactly this
  quantity.
- Restlessness through a stalled round, and boos when a fighter coasts a lead.
- A home crowd finding its voice for a local fighter, and turning on a visitor.
- The building noticeably louder in the championship rounds.

The discipline that keeps this from being wallpaper: **the crowd should react to the same
things `deliveryScore()` rewards.** Then what the audience enjoys and what the promotion gets
paid for are one model, and a player who learns to read the crowd has learned something true.

**B2. The crowd as pressure (bigger, and a balance change).** Add stakes to `FightConfig` —
attendance, position, hostility — and let it press on Composure for the opening round, hardest
on fighters who have never been there. This is what makes a first main event *feel* like one,
and it gives Composure and home advantage a job. It is a distribution change, so it needs the
same sweep-and-measure treatment as everything else in this repo, and it should land after the
presentational work rather than before it.

---

## 5. Problem C — the result is unexplained, and that is why it feels like a robbery

This is the one causing active pain, and it is the cheapest to fix.

### The screenshot, read carefully

| | Jackman | Landry |
| --- | --- | --- |
| Significant strikes | **30** of 52 | 18 of 60 |
| Takedowns | **3** of 6 | 3 of 5 |
| Control | 3:24 | 3:30 |
| Knockdowns | 0 | 0 |
| Submission attempts | 0 | **2** |

All three judges: 9–10, 9–10, 10–9 → **28–29, unanimous.**

Four separate failures are stacked here.

**C1. Whole-fight totals are shown beside per-round scores.** Judges score rounds. The panel
aggregates the fight. Jackman almost certainly banked that entire striking advantage in round
three — he won it on all three cards — and the display gives the player no way to see that.
The numbers and the verdict look irreconcilable because the player is being shown the wrong
resolution of the same data.

> `simulateFight()` already builds `tallies: Record<Corner, RoundTally>[]` — every input the
> judges score on, per round, per corner — uses it for scoring, and then **drops it on the
> floor when the function returns.** Putting `roundStats` on `FightResult` is a small change
> and it is the single highest-value fix in this document.

**C2. Damage is invisible.** `damageDealt` carries the heaviest weight on every judge
archetype (0.25 balanced, 0.5 damage-first) and it is the one statistic the panel does not
show. Landry threw 60 to Jackman's 52 and landed 18: fewer, and quite possibly much harder.
The player cannot see the evidence the judges used. A bar labelled *Damage* — or even a
sentence, *"Landry did the heavier work"* — closes the gap.

**C3. The judges are strangers.** Sandra Bell, Warren Holt and Doug Frawley are three
deliberately different people: balanced/consistency 90, control-first/74, and
pressure-first/consistency 42 — the latter carrying the seed comment *"the judge everyone
complains about."* The player meets them for the first time on the scorecard that just beat
them. Introduce them on the event page and the same card reads as a fact about Frawley rather
than a fact about the game being unfair.

**C4. The caption is wrong.** Under three identical scorecards, the screen says *"Judges weigh
damage, control and volume differently, which is why they disagree."* They did not disagree.
Say what happened — unanimous, split, or majority — and when they did disagree, say which
round they disagreed on.

### And then let the player be angry about it

`stokeHeat` has a `controversialFinish` source worth 26 points, the largest in the game,
annotated *"a robbery or a controversial stoppage is the best build-up money cannot buy."*
**It is never raised in production.** `accrueHeatFromFight()` only flags controversy when the
decision was *labelled* split or a no contest — so a unanimous card that contradicts the
evidence, which is the exact fight in the screenshot, generates nothing.

**C5. Measure controversy against the evidence, not the label.** A result where the loser
carried the visible statistics is controversial whether or not a judge dissented. Then:

- The crowd boos the reading of the decision.
- The booth says so — and a striking-biased commentator siding with the striker who lost on
  control is an *ally*, which is worth more here than accuracy.
- Heat is stoked, the rivalry becomes real, and a rematch appears as a live offer.

That converts the worst feeling the game can produce into the best story hook it has. It is
also the honest answer to "I got screwed": not to make the judges nicer, but to let the sport
respond the way it actually does.

---

## 6. Reactions to the result

Beyond the decision itself, the night currently ends with a bulleted `notes` list. Things
worth a moment of their own:

- **The crowd's verdict** — the roar for a finish, the boos for a decision they hated.
- **The booth's verdict** — whether they thought it was right, in their own biased voice.
- **The promotion's verdict** — `delivered` and `buzzDelta` are computed every single night
  and shown to nobody. *"The card delivered; Apex leaves Manchester in better shape than it
  arrived"* is a sentence the game already knows to be true.
- **Fight of the Night / Performance of the Night** — currently a line in a list. This is the
  mechanism doc 12 built to make an exciting loss worth something; it should land like an
  award, not like a receipt.
- **Where it leaves you** — ranking movement, what the loss cost, whether a rematch is on the
  table.

---

## 7. Suggested order

| | Work | Why here |
| --- | --- | --- |
| **1** | **C1–C4**: per-round stats on the result, damage in the panel, judges introduced, caption fixed | The active pain. Mostly plumbing data that already exists; no balance risk |
| **2** | **A1–A4**: build the card first, event page, walkout beat, bouts-above-you afterwards | The largest spectacle payoff. `resolutionOrder()` is already written and tested |
| **3** | **B1**: the crowd in the play-by-play | Pure presentation pass over a finished result; cannot change an outcome |
| **4** | **C5**: controversy measured from evidence, and heat from it | Small, and it needs the crowd and the booth from steps 2–3 to land properly |
| **5** | **A5**: any bout expandable into full play-by-play | Nice-to-have; needs undercard results kept in full |
| **6** | **B2**: crowd pressure on Composure | A real distribution change. Sweep and measure it like doc 21 and doc 27 did |

Steps 1–3 are the ones that answer the report. Everything after is upside.

## 8. Open questions

- **How long should a night be?** If the bouts below you resolve as results first, is that two
  lines or six? There is a real risk of rebuilding the dead time doc 12 rejected.
- **Watchable undercard?** Worth it for a rival or a number-one contender fight; probably not
  worth it for all eight.
- **Should the crowd change outcomes, or only describe them?** B1 alone is safe and probably
  gets most of the feel. B2 is the version where headlining is genuinely harder.
- **Should a disputed decision open a rematch path?** It is the strongest available answer to
  the screenshot, and it makes losing badly *interesting* rather than only expensive.
