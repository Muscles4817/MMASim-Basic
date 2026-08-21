# 32 — Mode architecture, the fighter dashboard, and starting a save

> Status: **approved, in implementation.** The audit stands as written; § 14 records the
> decisions taken on it and the two amendments made before work started.
> Read [10 — UX & Design System](./10-ux-and-design-system.md) for the vocabulary this uses and
> [29 — Promoter Mode UX](./29-promoter-mode-ux.md) for the pattern this generalises.

---

## 0. The short version

Promoter mode had this exact problem eighteen months of commits ago and doc 29 fixed it: screens
described **entities** when the player needed **situations**. That fix was applied to one mode and
one mode only. Fighter mode is still entity → raw data, and the career hub is where it shows.

Three structural findings, each grounded below:

1. **The fighter hub is the promoter dashboard before doc 29.** It renders every system the
   fighter has, inline, at roughly equal weight, in DOM order, on a 56rem column. There is no
   fighter equivalent of `game/attention.ts` — nothing anywhere asks *what needs the player.*
2. **There are two independent promotion-offer engines, and each has its own screen.** The hub
   renders `promotionOffers()`; the Offers screen renders `offersFor()`, whose own docstring says
   it *replaces* `promotionOffers()` because that function's filters were wrong. The dashboard and
   the contract screen are showing two different markets. This is not a placement problem.
3. **New-game selection commits on click, and in a generated world there is nothing to inspect
   anyway.** `generateWorld` builds every promotion as `{...template}` — a spread of the seed's
   first promotion — so ~170 promotions share one `notes`, one `baseCountry`, one
   `narrativeControl`, one `matchmakingAggression`. The promotion picker is not badly designed so
   much as faithfully rendering a world with no differences in it.

Finding 3 is the one place where good UX is currently blocked by the simulation, and per the
brief it is flagged rather than fixed.

---

## 1. Audit — the Fighter Career homepage

`packages/app/src/screens/HubScreen.tsx`, 1,227 lines, mounted at `#/hub` via
`<Shell title="Career">` — **without** the `wide` flag.

### 1.1 What is actually rendered, in order

| # | Region | Source | Notes |
|---|--------|--------|-------|
| 1 | Identity card (`raised`) | `displayName`, `getDivision`, `fighterAge`, `Flag` | name, division, age, nationality |
| 2 | `KeyStat` record | `recordString(summary)` + `StreakBadge` | the one correct primary on the page |
| 3 | `FighterRead` | `fighter.attributes` | wins with / vulnerable to |
| 4 | Facts row A | Overall, Star power, Bank, Confidence | 1 secondary, 3 tertiary |
| 5 | Full profile button + Champion chip | | |
| 6 | Facts row B | Freshness, Body age, Body wear, Head trauma, Last fought | 5 more facts |
| 7 | Freshness alert | `freshness < 30` | conditional |
| 8 | Trauma alert | `headTrauma >= TRAUMA_CONCERN` | conditional |
| 9 | `InjuryStatus` | `Recovery.tsx` | conditional alert + primary button |
| 10 | `RestCard` | `Recovery.tsx` | **always present between fights** |
| 11 | `LadderCard` | `getLadderStatus` | standing, tier chip, progress meter, `titleShot.reason` prose, **top-10 table**, **unbounded offers list**, lock alert |
| 12 | Release-request alert | `requestRelease` outcome | conditional |
| 13 | Title fight card | `titleShot.eligible` | primary button |
| 14 | "Between fights" card | prose + **Go to training** primary | |
| 15 | Next fight card **or** "Choose your next fight" | `getOffers` | **unbounded list**, rows expand inline |
| 16 | "Your situation" | `contractStanding` | free-agent alert / deal summary / fairness prose / rust / triggers / **repaper alert** / receipt / job-risk alert / tolled days / manager paragraph |
| 17 | "The sport" | `NewsFeed limit={8}` | |
| 18 | "Everywhere else" | 7 `HubLink` tiles | Training, Contract, Rankings, Profile, Roster, Editor, Settings |

That is eighteen regions, of which two are unbounded lists.

### 1.2 What works and must survive

These are good and should be carried into any redesign rather than rebuilt:

- **`KeyStat` on the record.** Exactly right: one primary number, toned by streak. Doc 10's rule,
  correctly applied.
- **`FighterRead`.** "Wins with / Vulnerable to" as badges is the single best piece of
  interpretation in the app. It belongs on the dashboard permanently.
- **`InjuryStatus` naming the suppressed attributes** ("costs you hand speed −18%"). This is the
  model for every other condition read on the page.
- **`RestCard` walking the clock day by day** rather than jumping. The file comment explains why,
  and it is right. Keep the mechanism; move the surface.
- **Two-step accepts.** Offer rows expand before they book; the repaper confirms; manager hiring
  confirms. Preserve all of it.
- **Money in the sticky header** (`Shell.tsx`). Every point of spending is within a glance of the
  balance. Keep.
- **The ladder table showing who is above you.** The comment is right that a rank you cannot see
  the rest of is a number, not a standing. It is on the wrong screen, not wrong.

### 1.3 Hierarchy problems

**Emphasis is exhausted.** Nine `Fact`s appear in the identity card, six of them
`emphasis="tertiary"`. Doc 10's own passover finding — *"a component that can express anything
expresses nothing"* — has recurred one layer down: the flat wall moved from `Chip` into `Fact`.

**The dashboard shows raw numbers; the profile shows the interpretation.** This is precisely
backwards under *card = diagnosis, detail = explanation*:

| Value | Hub renders | Profile renders | Engine has |
|-------|-------------|-----------------|------------|
| Freshness | `Worked · 56` ✓ | — | `describeFreshness` |
| Head trauma | `56 / 100` | `56 / 100` | `conditionRead` → label + detail + tone |
| Body wear | `31 / 100` | `31 / 100` | `conditionRead` |
| Confidence | `77` | `77` | *(no describe helper)* |
| Overall | `OverallRating` — **exact number** | `AbilityBand` — **deliberately never a number** | both |

The last row is a direct contradiction: `FighterScreen`'s header comment argues at length that an
exact overall makes matchmaking arithmetic instead of judgement, and then the hub prints the number
for the same fighter one route away. One of the two is wrong; the profile's reasoning is the
better one, so the hub should change.

`conditionRead` already returns exactly the `"56 — Worked"` shape the brief asks for. It is called
on `FighterScreen` and never on the hub.

**Ring rust is invisible in the state where it matters most.** In `HubScreen`, the
`{rust > 0 && …}` block sits inside the `else` branch of
`standing.freeAgent || !standing.agreement`. A **free agent** — the fighter who is by definition
not being booked — never sees `rustLabel`/`describeRust` at all. `13 months inactive — Ring rust`
is computable today and is suppressed for the one player who needs it.

**Alerts are load-bearing and too numerous.** Between freshness, trauma, injury, free agency,
renegotiation triggers, the repaper, the signed receipt, job risk and the release outcome, a
single hub render can produce **nine** `Alert`s. Alert is doc 10's "louder than a chip, quieter
than a modal" tier; nine of them is a wall.

### 1.4 Competing decisions

Doc 10: *"One primary action per screen. If two things are equally emphasised, neither is the
answer."* Concrete counter-example — an unsigned fighter, carrying a knock, between fights:

```
Rest until fit          primary sm   (InjuryStatus)
Rest 4 weeks            primary      (RestCard)
Go to training          primary block ("Between fights")
See what is on the table primary     ("Your situation", free agent)
Wait 8 weeks            primary sm   (no opponents available)
See the terms           primary sm   (LadderCard, if offers)
```

Six primaries, none ranked against the others, none of which knows the others exist. The
"which of these should I do?" question the brief asks about is not merely unanswered — the page
is structurally incapable of answering it, because nothing computes a comparison.

### 1.5 Duplication

| Information | Surfaces | Notes |
|---|---|---|
| Record | hub `KeyStat`, profile `KeyStat`, ladder table row, `FightRecordList`, rankings row | four renderings |
| Condition (body age / wear / trauma / confidence) | hub Facts row B, profile `ConditionFacts` | near-identical JSX, `readMileage` called twice |
| Divisional ranking | hub `LadderCard` top-10, `RankingsScreen` top-15 | different depth, different columns, same `rankDivision` |
| Contract standing | hub "Your situation", profile Contract tab, Offers screen banner | three renderings of one `contractStanding` |
| Manager | hub paragraph, Offers "Who negotiates for you", profile "Represented by" | three |
| **Promotion offers** | hub `LadderCard`, Offers screen | **two different engines** — see §3 |
| Bout offers | hub "Choose your next fight", Inbox `kind === 'offer'` | two doors, two interaction models |

### 1.6 Desktop

- `--content-max: 56rem` (896px). The hub is not `wide`, so on a 1920px display: 208px rail,
  896px column, **~816px of nothing**, against 6–10 viewport heights of scroll.
- **Only `promoter.css` contains desktop breakpoints.** Grep for `@media (min-width: 62rem)`:
  four hits, all in `promoter.css`. `ui.css` has 34rem and 30rem; `signals.css`, `Shell.css` and
  `global.css` have none above the 48rem rail. Fighter mode has, effectively, no desktop layout.
- `Console` (the 1.7fr / 1fr two-column grid with a sticky side rail) exists, works, and is used
  by `FighterScreen`, `PromotionHubScreen`, `PlanScreen`. The hub never uses it.
- Net effect: **the fighter's profile exploits desktop width and the fighter's home does not.**

### 1.7 Mobile

- The most important decision on the page (accept a fight) sits below three to four screens of
  state, and each expanded offer row pushes its own Accept button further down.
- `hub-nav` — seven tiles — sits *below* the news feed, i.e. after ~8 viewport heights. Two of its
  seven tiles (Roster, Settings) duplicate tab-bar destinations exactly.
- With ten bout offers the list alone is longer than the rest of the page.
- There is no persistent "what next" affordance; the sticky header carries only date and bank.

---

## 2. Audit — Fighter Profile

`FighterScreen.tsx`, 990 lines, `<Shell wide>`, tabs Overview / Career / Skills / Contract.

**This screen is largely right and should be preserved.** `Tabs` + `TabPanel` + `Console`,
`MiniRating` in a 2-column grid at ≥62rem, definitions behind one toggle for the whole page,
derived ratings behind another, `AbilityBand` instead of an overall number, condition high up,
strength-of-schedule as "Level faced" — all good, all keep.

The defect is **mode-blindness**, and it is one flag away from being fixed. `isPlayer` is already
computed. It is used exactly once, in the Skills tab, to show potential ceilings on physical
attributes. Everything else is written for a promoter scouting an NPC:

| Rendered | When you are that fighter |
|---|---|
| `"Where they stand"` (card title, `isYours ? 'Promoter status' : …`) | you are reading a scouting report on yourself |
| `"How they decide"` — dispositions | the game explaining your own temperament to you |
| `"What they want"` (Contract tab) | the game telling you what you want |
| `"How they see it"` — `describeFairness` | *they* is you |
| `"They fight here on a handshake, which means nothing holds them"` | |
| `"Unbooked for — Not since you took over"` | promoter framing, no promotion in fighter mode |
| `LedgerRow "Expected level"` | a card-position read a fighter would call *where I'd be booked* |

Two functional consequences beyond tone:

- `availability` is computed from `bookedOnPlans(db, world.playerPromotionId, …)`. In fighter mode
  `playerPromotionId` is `undefined`, so `booked` is always `false` and the availability chip is
  meaningless on every fighter page in the mode.
- The Contract tab shows the player *what they want* and *how they see it*, while everything a
  fighter actually negotiates with — `repaperOnTheTable`, `renegotiationTriggers`,
  `requestRelease`, `releaseRisk`, `tolledDays` — is rendered on the **hub**. The two are
  swapped.

The engine helpers behind all of this live in `business/promoterRead.ts`. `abilityRead`,
`conditionRead`, `scoutingRead`, `availabilityOf`, `valueRead` are not promoter concepts; they are
fighter reads with a promoter's filename. That file should be renamed and the mode framing should
live in the UI layer, not in the module name.

---

## 3. Audit — Offers, Contract, Rankings

### 3.1 Two markets

```
HubScreen → getLadderStatus() → promotionOffers()        engine/business/ladder.ts
              filters: step !== 1  AND  streak < 2 → []
              yields: { promotion, bonus, pitch }

OffersScreen → offersOnTheTable() → offersFor()          engine/business/freeAgency.ts
              filters: appetite() against a per-motive bar
              yields: { promotion, terms, money, route, level, unmatchable, motive }
```

`offersFor`'s own docstring:

> Replaces `promotionOffers()`'s two hard filters, both of which were rules about *signings*
> wrongly applied to *free agency*.

`promotionOffers` was replaced and its consumer was never migrated. The consequences are exactly
the symptoms in the brief:

- **The 22 near-identical cards.** `step !== 1` from a regional fighter selects *every national
  promotion in the world*. In a Medium world that is dozens; the hub `.map`s them unbounded, each
  card carrying `promotion.name`, a `pitch` drawn from one of two templates, and a bonus figure
  the hub's own comment concedes is not the real number.
- **The sparse Offers screen.** Different filter, different bar, different result set. A player
  can see interest from twenty-two promotions on the dashboard and "Nobody is calling" on the
  contract screen, and both are telling the truth about their own engine.
- **`bonus` vs `terms`.** The hub's chip says "Around £Xk to sign". The offers screen prices
  `fightsOwed`, `exclusive`, `outsideBouts`, `revenuePoints`, `matchingRights`,
  `championshipExtension` and computes `unmatchable`. The dashboard is advertising a number the
  actual market does not use.

**This must be resolved before any layout work.** Deleting `promotionOffers` and pointing the
dashboard at a summary of `offersFor` is a deduplication, not a mechanics change — the brief's
rule is respected. It needs an explicit yes.

### 3.2 Where negotiation currently lives

Every negotiating lever in the game is on the **dashboard**:

| Lever | Function | Rendered on |
|---|---|---|
| Re-paper offer | `repaperOnTheTable` / `acceptRepaperOffer` | hub, inside an `Alert` |
| Renegotiation grounds | `renegotiationTriggers` / `describeTrigger` | hub, inside an `Alert` |
| Ask for release | `requestRelease` | hub, inside `LadderCard`'s lock alert |
| Release risk | `releaseRisk` / `describeReleaseRisk` | hub |
| Fairness | `contractFairness` / `describeFairness` | hub **and** profile Contract tab |
| Sign a manager | `hire` / `managersWillingToRepresent` | Offers screen |
| Sign a deal | `sign` | Offers screen |

The Offers screen has sign-or-decline and nothing else. The hub has the entire negotiation. That
is the inversion, and it is worse than "cards in the wrong place".

Also: the hub tile labelled **"Contract"** navigates to `{ name: 'offers' }`. The label and the
route disagree, and there is no route in fighter mode that means *my deal*.

### 3.3 Rankings

`RankingsScreen` is in good shape. It calls the same `rankDivision` the title logic reads (the
comment documents fixing a divergent private copy), defaults its filters from `playerFighter`, and
explains its own sort order on the page. Keep the logic wholesale.

Issues are presentation only: not `wide`; two `<select>`s plus a `Segmented` in a "Filters" card
above the list, which on desktop spends a full band of vertical space on two dropdowns; capped at
15 with no way to page; and it duplicates `LadderCard`'s top-10.

---

## 4. Audit — New Game / Save Creation

### 4.1 The journey today

```
MenuScreen (outside the Shell, no GameDb)
   world: Generated | 2026 | 2020        size: Small | Medium | Large
   → onNew → SaveGate builds (3s / 11s / 25s desktop) → GameProvider
App.tsx: route 'hub' && !playerFighter → replace('start')
StartScreen
   [Create your own fighter]         → #/create
   list of regional promotions       → takeOver()      → career starts
   filters + search + fighter list   → choose()        → career starts
```

### 4.2 Browsing commits — confirmed, and worse on the promotion path

```js
const takeOver = (promotion) => {
  clearTransientCareerState();
  updateWorld({ playerRole: 'promoter', playerPromotionId: promotion.id, playerFighterId: undefined });
  navigate({ name: 'promotion' });        // no confirmation, ever
};

const choose = (fighter) => {
  if (world.playerFighterId && world.playerFighterId !== fighter.id) { setPending(fighter); return; }
  commitChoice(fighter);                   // fresh save → immediate
};
```

The fighter confirmation only fires when a career already exists — i.e. never on the flow this
screen was built for. The promotion path has no guard at all. One tap on any of hundreds of rows
starts the save.

### 4.3 Mode is not a step

`playerRole` is a side effect of which list you touched. There is no point at which the player
chooses to be a fighter, and no place a **Coach** entry point could go without another
`<Card><h2>Or…</h2>` in the stack. The type already supports it —
`playerRole?: 'fighter' | 'coach' | 'promoter'` in `gameDb.ts`, `saves.ts`, `generate.ts`,
`newGame.ts` — the UI is the only thing missing.

### 4.4 The promotion list has nothing to say — and that is a data problem

`packages/data/src/world/generate.ts`:

```js
const template = scaffolding.promotions[0]!;
…
promotions.push({
  ...template,
  id, name: `${spec.label} ${i + 1}`, shortName: …,
  tier: spec.tier, prestige, budget, divisions, champions: {},
});
```

Every generated promotion is a spread of the seed's first promotion. Across ~170 promotions,
**identical**: `baseCountry`, `notes`, `sponsorshipPolicy`, `revenueShareCapable`,
`activityGuarantee`, `minimumPurse`, `buzz`, `matchmakingAggression`, `matchmakingStyle`,
`narrativeControl`. **Varying**: `tier`, `prestige`, `budget`, `divisions`.

So `national 11 · USA · £3.1m to spend · [same description]` is an accurate rendering. The
seeded eras (10 and 16 hand-authored promotions with real `notes`, real countries, real
matchmaking postures) do differentiate; the *default* world does not.

> **Flagged, not fixed.** No amount of interface work makes generated promotions feel different
> from one another while they are the same object. Two honest options, both needing a decision:
> **(a)** the picker shows only the axes that genuinely vary — tier, prestige, budget, divisions
> run, roster depth, vacant belts, region — and stops implying character that is not there;
> **(b)** the generator varies the character fields, which is a simulation change and out of scope
> for this pass. Recommendation: ship (a) now, open (b) as its own doc.

### 4.5 Fighter selection

Preserve: the Contenders / Prospects / Everyone split (a real choice of three different games),
the visible `Segmented` hints, search, and "Just browse the roster instead".

Missing from a row: age, current promotion, contract situation, style, condition, career stage.
`FighterScreen` renders all of it and cannot be reused as-is — it reads `world.playerPromotionId`,
`playerFighter`, `bookedOnPlans`, and offers "Put them on a card". Reuse requires decoupling
(see §9.2), not copying.

The `contenders`/`prospects` threshold is `reputation >= 60` — an invisible cliff. The hints
carry the meaning, which is why rendering them visibly was the right call.

### 4.6 MenuScreen

- **The storage warning is last**, after the save list, as `tone="info"`. It is the most important
  sentence on the screen for a first-time player and reads as a footnote.
- **`WORLD_SIZE_META.fighters` and `.seconds` exist and are never rendered** (850/2500/5000 and
  3/11/25). The player chooses Small/Medium/Large against prose only.
- **The Large blurb contradicts its own data**: *"a hundred and seventy promotions and six
  thousand fighters"* against `fighters: 5000`.
- **"Generated / 2026 / 2020"** — labels come from `ERAS.map(e => e.name.split(' — ')[0])`, so two
  of three options are bare years. The blurb underneath explains; the control does not.
- **No preview before a 25-second build**, and no way back out of one.
- `max-width: var(--content-max, 40rem)` → 56rem, single column, no desktop treatment.

---

## 5. Proposed information architecture

### 5.1 The rule this generalises

Doc 29's rule, applied to the other two modes:

> The simulation produces huge amounts of data. The UX turns it into **situations, priorities and
> choices**.

Concretely, `game/attention.ts` needs a sibling. Everything a fighter dashboard should lead with
is already computable and nothing is asking:

```
game/careerAttention.ts       // fighter mode's attentionFor()
  → CareerSituation[] { id, kind, tone, urgency, title, detail, action }

  kinds and their existing sources
  ─────────────────────────────────────────────────────────────────────
  injury        activeInjuries + weeksUntilFit + INJURY_META.suppresses
  freshness     freshnessOf + describeFreshness
  rust          rustFor + rustLabel + describeRust     ← currently unreachable for free agents
  trauma        headTrauma vs TRAUMA_CONCERN / TRAUMA_MEDICAL
  unsigned      contractStanding.freeAgent
  jobRisk       releaseRisk + describeReleaseRisk
  repaper       repaperOnTheTable
  renegotiate   renegotiationTriggers + describeTrigger
  offers        offersFor (one engine — see §3.1)
  titleShot     getLadderStatus().titleShot
  booked        getBooking + campaign countdown
  noOpponents   getOffers().length === 0
  inbox         inboxCount().blocking
  money         solvencyOf against campCostFor
```

Same contract as `AttentionItem`: every row says what is true, what it costs, and where to go.
Urgency on one 0–100 scale so a torn knee can outrank a signing bonus. `AttentionRow` already
renders this shape and is already accessible.

### 5.2 Route-level IA

| Route | Owns | Moves in | Moves out |
|---|---|---|---|
| **`#/hub`** Career | situation feed, next-fight decision, condition strip, standing summary, camp/rest entry | — | promotion-offer cards → `#/contract`; ladder table → `#/rankings`; `hub-nav` grid → shell nav; news → collapsed |
| **`#/me`** *(new)* My fighter | the profile in first person: My career / Condition / Skills / My deal | contract negotiation from `#/hub`; potential ceilings | — |
| **`#/fighter/:id`** Fighter | third-person entity view, mode-framed | — | player self-view → `#/me` |
| **`#/training`** | camps, gyms, weight class, **rest & recovery** | `RestCard` from `#/hub` | — |
| **`#/contract`** *(renamed from `#/offers`)* | my deal, offer discovery, comparison, negotiation, manager | repaper, triggers, release, job risk, fairness from `#/hub`; "What they want" from profile | — |
| **`#/rankings`** | division ladders, my position marked | canonical ladder table | — |
| **`#/inbox`** | things awaiting an answer | bout offers stay | — |
| **`#/calendar`** | the clock, upcoming dates | — | — |

Rest belongs with training because they are the same decision from opposite ends: *do I spend
condition or restore it.* The hub keeps the diagnosis ("Flat — 34") and a single link.

### 5.3 What stays on the dashboard, and what it becomes

| Today | Tomorrow |
|---|---|
| 22 promotion-offer cards | `3 promotions interested · best: NFC, main-card money, #4 on arrival` + **Review offers** |
| Full top-10 ladder table | `#4 of 31 in AFC lightweight · two wins from a shot` + **Rankings** |
| 9 `Fact`s in the identity card | a **condition strip**: 4–5 interpreted states, `56 — Worked` form |
| Repaper alert with full terms | one situation row → `#/contract` |
| Manager paragraph | one line in the standing block → `#/contract` |
| `hub-nav` 7 tiles | deleted; the shell nav and situation actions replace it |
| 8 news items | 3, collapsed, with **More** |

---

## 6. Mode architecture

### SHARED — one implementation, no mode branch

`Shell`, `Card`, `Button`, `Chip`, `Segmented`, `ListItem`, `Empty`, `Alert`, `KeyStat`, `Fact`,
`Icon`, `RatingRow`, `MiniRating`, `AbilityBand`, `FighterRead`, `AttributeBadge`, `MethodBadge`,
`StreakBadge`, `Trend`, `Console`, `Tabs`, `Ledger`, `SubNav`, `AttentionRow`, `PipelineCard`,
`NewsFeed`, `FightRecordList`, `RecordSummaryBar`, `Flag`, `format.ts`, the token set;
**Rankings**, **Roster**, **Calendar**, **Fight night**, **Editor**, **Settings**, **Menu**.

Rankings genuinely is shared — one `rankDivision`, one ladder, one truth. What differs is a
default filter and one "You"/"Yours" marker, which is a prop.

Two renames, both mechanical:

- `ui/promoter.tsx` / `.css` → `ui/console.tsx` / `.css`. Nothing in it is promoter-specific and
  fighter mode needs all of it.
- `engine/business/promoterRead.ts` → `fighterRead.ts`. `abilityRead`, `conditionRead`,
  `scoutingRead`, `availabilityOf` are entity reads.

### SHARED ENTITY + MODE CONTEXT — one component, a context prop

`FighterView` — one canonical implementation taking `viewer: 'self' | 'coach' | 'promoter' | 'none'`:

| Layer | Behaviour |
|---|---|
| **Facts** — identity, record, skills, fight history, physical attributes, rivalries, strength of schedule | identical in every mode |
| **Framing** — headings, pronouns, which tab leads | `self`: My career / My condition / My skills / My deal. `coach`: Development / Condition / Training focus / Readiness. `promoter`: Scouting read / Availability / Marketability / Asking price. |
| **Actions** — the footer of each panel | `self`: negotiate, ask for release, change gym. `coach`: set focus, book camp, cut. `promoter`: put on a card, extend, release. |
| **Disclosure** | `self` sees own potential ceilings and carried injuries; `promoter` sees `scoutingRead` uncertainty; `coach` sees scouted ceilings at their own `scouting` accuracy (doc 14) |

The existing tab set survives as the `promoter` and `none` framing. `#/me` is
`FighterView viewer="self"` with a different route so the shell can title it *My fighter* and the
back stack behaves.

Also in this class: **Promotion view** (fighter: *who I might sign for* / promoter: *my business*
/ coach: *where my fighters are*); **Gym view**; **Contract/Offer view** (fighter: what I am being
offered / promoter: what I am offering / coach: what my fighter is being offered).

### MODE-SPECIFIC — bespoke, no sharing beyond primitives

| Mode | Home | Core workflow screens |
|---|---|---|
| Fighter | Career — *how is my career going, what next* | Camp, Fight night, Training, Contract |
| Coach | Gym — *who needs my attention* | Roster/stable, Scouting, Camp beats, Cornering |
| Promoter | Promotion — *what needs managing* | Card planning, Matchmaking, Championships, Roster & contracts |

Each mode gets its own `attentionFor` — the shape is shared, the questions are not.

### Nav

`Shell.tsx` already forks `FIGHTER_NAV` / `PROMOTER_NAV` on `world.playerRole` with a comment
explaining why the shell itself is not forked. That is the right structure. Add `COACH_NAV`
alongside; extend `PromoterSubNav` into a generic `ModeSubNav` taking a places array, so fighter
mode can use it for Career / Training / Contract / Rankings.

---

## 7. Responsive strategy

Not breakpoints — a change of composition. Three tiers, and the existing 48rem/62rem breakpoints
are the right ones.

| | Phone `<48rem` | Tablet `48–62rem` | Desktop `≥62rem` |
|---|---|---|---|
| Nav | bottom tab bar | left rail | left rail + mode sub-nav |
| Composition | one column, **priority order ≠ desktop DOM order** | one column, wider rows | 2–3 regions |
| Lists | rows, expand in place | rows | table, more columns, sortable |
| Entity + detail | list → detail → back (`#/fighter/:id`) | same | **master/detail, list stays visible** |
| Context panel | inline, collapsed | inline | sticky side rail |
| Explanations | expandable `<details>` per item | tooltip + `<details>` | persistent side glossary panel |

Two rules to enforce, because this is where "just stack it" comes back:

1. **Priority order is a data decision, not a CSS one.** The dashboard's regions are ordered by
   computed urgency, and the top region on a phone is whatever `careerAttention` ranked first. The
   desktop grid places the same regions spatially. Neither is derived from the other's DOM order.
   `Console` already models this correctly — side column second in source, placed by grid.
2. **Density scales up, never down.** Mobile does not get a truncated table; it gets a different
   component (a row that expands) carrying the same data.

---

## 8. Proposed desktop Fighter Career homepage

`<Shell title="Career" wide>` → 82rem (`shell__main--wide` already exists in `promoter.css`).
Three regions on a 12-column grid at ≥62rem; two at 48–62rem (context drops below).

```
┌─ rail ─┬────────────────────────────────────────────────────────────────────────────┐
│        │ Career          14 Mar 2027                                  Bank  £48.2k  │  sticky
│ MMASIM ├────────────────────────────────────────────────────────────────────────────┤
│        │ ┌ IDENTITY BAND ───────────────────────────────────────────────────────┐   │
│ Career │ │ Liam Henderson   Lightweight · 27 · 🏴  │  16-3-0  W4  │  #4 of 31   │   │
│ Train  │ │ Wins with: Wrestling 84 · Cardio 81    Vulnerable to: Chin 52       │   │
│ Contr. │ └──────────────────────────────────────────────────────────────────────┘   │
│ Rank   │ ┌ MAIN (7 col) ─────────────────────┐ ┌ CONTEXT (5 col, sticky) ────────┐  │
│ Cal    │ │ NEEDS YOU                 3       │ │ CONDITION                       │  │
│ Inbox  │ │ ▲ Torn knee — 6 wks              │ │ Freshness   56 — Worked        │  │
│ ⚙      │ │   costs takedowns −18%  [Rest]   │ │ Body        29 — 2 yrs over    │  │
│        │ │ ▲ 13 months out — Ring rust      │ │ Head        18 — Pristine      │  │
│        │ │   sharpness, not power  [Fight]  │ │ Confidence  77 — High          │  │
│        │ │ ● 3 promotions interested        │ │ ─────────────────────────────  │  │
│        │ │   best: NFC  [Review offers]     │ │ STANDING                        │  │
│        │ ├──────────────────────────────────┤ │ AFC · fight 3 of 4 · fair deal │  │
│        │ │ NEXT FIGHT                       │ │ Rep by: Dana Cole (12%)        │  │
│        │ │ ┌ opponent ─┬ read ─┬ purse ─┬ ─┐│ │ [My deal]                      │  │
│        │ │ │ Sokolov   │ Even  │ £14+14 │  ││ │ ─────────────────────────────  │  │
│        │ │ │ #6 · 12-4 │ Grudge│ main   │→ ││ │ THE CLIMB                       │  │
│        │ │ ├───────────┼───────┼────────┼──┤│ │ ████████░░░ #4 → title          │  │
│        │ │ │ Vance     │ Step  │ £9+9   │→ ││ │ two wins from a shot            │  │
│        │ │ └───────────┴───────┴────────┴──┘│ │ [Rankings]                      │  │
│        │ │ 4 more                           │ │ ─────────────────────────────  │  │
│        │ │                                  │ │ THE SPORT              3 items  │  │
│        │ │  [ Go to camp ]  ← one primary   │ │ …                       [More] │  │
│        │ └──────────────────────────────────┘ └─────────────────────────────────┘  │
└────────┴────────────────────────────────────────────────────────────────────────────┘
```

**Above the fold at 1920×1080:** identity band, the whole *Needs you* feed, the top three rows of
the fight table, and the entire condition + standing rail. The player answers *how am I doing / am
I ready / am I signed / do I have offers / do I have a fight / is anything urgent* without
scrolling.

**Primary action:** exactly one, computed. Booked → **Go to camp**. Unbooked and fit → **Accept
this fight** on the selected row. Injured → **Rest until fit**. Unsigned with offers → **Review
offers**. Everything else is secondary or a link.

**Interactions**

- Fight offers become a **table** on desktop: opponent, rank/record, difficulty, heat, purse, slot.
  Comparison is the whole job and comparison wants columns. Selecting a row opens a detail panel
  *in the context column* — the promoter's matchmaking pattern from `PlanScreen`, reused. Nothing
  expands the page.
- Condition rows: value + interpreted state, `<details>` for the mechanic. `conditionRead` and
  `describeFreshness` supply the words.
- The context rail is `position: sticky` — `.console__side` already does this.

**Where current content goes**

| From | To |
|---|---|
| Facts rows A + B | condition strip (interpreted) + identity band |
| `RestCard` | `#/training`, surfaced by an injury/freshness situation row |
| `LadderCard` offers list | `#/contract`, summarised as one situation row |
| `LadderCard` ladder table | `#/rankings`, summarised as the climb block |
| Repaper / triggers / release / job risk | `#/contract`, each a situation row when live |
| Manager paragraph | standing block one-liner → `#/contract` |
| `hub-nav` grid | deleted |
| News (8) | 3 + More |
| Title-fight card | promoted into the situation feed at max urgency; keeps its own primary |

---

## 9. Proposed mobile Fighter Career homepage

Not the desktop stacked. Reordered by urgency, with a persistent action.

```
┌───────────────────────────┐
│ Career  14 Mar    £48.2k  │  sticky
├───────────────────────────┤
│ Liam Henderson            │  identity, compressed
│ LW · 27 · 16-3-0 W4 · #4  │
├───────────────────────────┤
│ NEEDS YOU              3  │  ← always first, whatever it is
│ ▲ Torn knee — 6 weeks     │
│   takedowns −18%   [Rest] │
│ ▲ 13 months out — rust    │
│ ● 3 promotions interested │
├───────────────────────────┤
│ NEXT FIGHT                │
│ Sokolov  #6 · 12-4        │
│ Even fight · Grudge       │
│ £14k + £14k · main event  │  tap → full-screen offer detail
│ 5 more offers          →  │
├───────────────────────────┤
│ CONDITION            ▾    │  collapsed; expands to 5 rows
│ Worked · fit to fight     │  one-line verdict when closed
├───────────────────────────┤
│ AFC · fight 3 of 4     →  │
│ #4 of 31 · 2 from a shot →│
├───────────────────────────┤
│ THE SPORT              ▾  │
├═══════════════════════════┤
│    [ Go to camp ]         │  sticky above the tab bar
├───────────────────────────┤
│ 🥊  📅  📥  👥  ⚙        │
└───────────────────────────┘
```

Deliberate mobile differences:

- **Situation feed first, always.** On desktop it is one of three regions; on mobile it is the
  screen's opening statement.
- **Condition collapses to a verdict.** One line — *"Worked · fit to fight"* — expanding to the
  five rows. Desktop shows all five permanently because the rail is free.
- **A sticky action bar** above the tab bar, carrying the same computed primary as desktop. It is
  the reason the page never needs scrolling to act.
- **Offers are rows that push a full-screen detail**, not rows that expand in place. Expansion is
  what currently buries the Accept button.
- **The climb and standing are single tappable lines**, not blocks.
- Everything below *The sport* is gone rather than scrolled past.

Above the fold on a 375×667 phone: identity, the top two situations, and the next-fight row.

---

## 10. Design-system changes

The system is good and mostly needs extension, not replacement. Doc 10 stays the source of truth;
this is the delta.

**Containers.** Three, not one. `Card` for a grouping that is genuinely a thing; **`Panel`**
(rule + section title, no border) for a region inside a console column; **bare** for a strip that
is not a container at all — the condition strip should be rows on the page, not five cards. The
brief's "card soup" is real: the hub is fourteen `Card`s deep.

**Emphasis.** `Fact` has three tiers and the hub uses `tertiary` six times in a row. Add a
**`StateRow`** — `label · value · interpreted state · optional <details>` — as the canonical way to
render an interpreted number. That is `56 — Worked` as a component. `Fact` goes back to being for
genuinely secondary values.

**Typography.** `--text-base: 0.9375rem` is right for a phone and slightly small for a 27-inch
display. Add `--text-base-lg: 1rem` and step body copy up at ≥62rem. Add `--text-2xs: 0.6875rem`
for table micro-labels. Enforce `.numeric` (tabular) on every column of digits; the offer table
needs it.

**Spacing.** Add `--space-0: 0.125rem`; add `--gutter` resolving to `--space-3` on mobile and
`--space-5` at ≥62rem so page padding stops being hard-coded per screen. Replace the ~40 inline
`style={{ marginTop: 'var(--space-3)' }}` uses in `HubScreen` with `gap` on a flex parent.

**Layout primitives.** `Console` is the good one — rename it out of `promoter.*` and add:
`Grid` (12-column, ≥62rem only, with span props); `Strip` (horizontally-scrolling row of compact
items, `.scroll-x`); `MasterDetail` (list + panel at ≥62rem, list → route on phone) which
new-game selection and the fight-offer table both need; `Collapse` (`<details>`-backed, styled,
default-open at ≥62rem and default-closed below).

**Semantic colour.** `--positive` / `--negative` / `--warning` / `--info` are correct and separate
from `--accent`. Two gaps: **urgency** needs its own scale for the situation feed
(`--urgency-critical / -high / -normal`, currently borrowing danger/warn/info), and the band
tokens are used for both ratings and unrelated states — keep `--band-*` for ratings only.

**Status treatments.** `AttentionRow`'s tone stripe is the right pattern and should become the
shared status treatment: a leading stripe, an icon, a bold claim, a consequence sentence, a cue.
Three channels, greyscale-safe, already accessible.

**Buttons.** Add a documented rule the code can be linted against: **one `variant="primary"` per
rendered screen**, chosen by the situation model. Add `variant="link"` for the "see the rest of
this system" affordance, which is currently `variant="ghost" size="sm"` in a dozen places.

**Tooltips and help.** Doc 10 already settled this — *"`title` is not an explanation"* — and
`Fact` renders hints visibly for that reason. That is right for onboarding and wrong on the fiftieth
visit. Proposal: a **`Help`** component wrapping `<details>`, with an `id`; open by default until
the player has expanded it once, then collapsed, persisted per save. Depth stays; the wall does
not. This is the only mechanism that satisfies both "explain the mechanic" and "stop printing the
manual".

**Tables.** There is no table component. `.list` + `ListItem` is the only list primitive, and it is
a mobile row. Add **`DataTable`** — semantic `<table>`, sticky header, `.scroll-x` container,
tabular numerals, sortable columns, and a phone renderer that emits `ListItem` rows from the same
column definitions. Rankings, the fight-offer list, offer comparison, roster and new-game
selection all want it.

---

## 11. New Game / Save Creation — proposed

### 11.1 The journey

```
MENU ─────────► WORLD ─────────► MODE ─────────► IDENTITY ─────────► CONFIRM ─────► play
continue      generated/era     fighter        create or take over   explicit
delete        size              coach          browse → inspect      "Take control of X"
storage       preview           promoter       compare
```

Four **concepts**, three **screens**. World and Mode share one screen (both are quick choices and
neither needs the width); Identity is its own master/detail; Confirm is a panel inside Identity,
not a page.

The build runs **after** mode selection and **before** identity selection, because identity
selection needs the world in memory. The player therefore commits to a 25-second wait having
already chosen who they will be, which makes the wait feel like part of the journey rather than a
gate in front of one.

### 11.2 World selection / generation

Keep: generation as the default, size as a separate axis, the size warning, the honest
"Generated / 2026 / 2020" split.

Fix:

- **Render `WORLD_SIZE_META.fighters` and `.seconds`.** `Medium — 2,500 fighters · ~11s to build`
  is a decision; "The default" is not. Correct the Large blurb, which contradicts `fighters: 5000`.
- **Say what an era *is*.** `Generated — a sport nobody has played` / `2026 — the sport as it is
  now` / `2020 — the sport as it was`, each with its promotion count.
- **Promote the storage warning** out of the bottom `Alert` into a persistent line under the save
  list. Keep every word of it — it is a technical warning, not clutter.
- **Desktop:** two columns at ≥62rem — continue + saves left, new-world configuration right. The
  menu currently spends a 1920px screen on a 40rem column.
- **Mobile:** Continue at the top, new-world as a `<details>` below, saves list, storage line.

### 11.3 Mode selection

One screen, three cards, no scrolling. Each states the fantasy, the loop and the first decision:

```
FIGHTER      You are the fighter. One body, fifteen years, and every choice costs something.
             → create a fighter, or take over somebody who exists
COACH        You run a gym. Your reputation is built out of other people's careers.
             → coming soon                                             (visible, aria-disabled)
PROMOTER     You run a promotion. Make money or make the sport — you will not do both.
             → take control of a regional promotion
```

Coach is **shown and marked unavailable**, not hidden. Doc 10: *"Disabled is not the same as
unavailable"* — `aria-disabled` plus a handler that explains, never a real `disabled`. This is what
makes the flow survive Coach mode landing: the screen already has its slot.

Sets `playerRole` **as an intent**, before any entity is chosen. The subsequent screen is chosen by
mode, which is what makes fighter/coach/promoter selection genuinely different experiences instead
of three lists in one page.

### 11.4 Fighter selection — desktop master/detail

```
┌ CANDIDATES (4 col) ──────┐ ┌ PREVIEW (8 col) ───────────────────────────┐
│ [Contenders|Prospects|All]│ │ Liam Henderson                             │
│ [search…]                 │ │ LW · 27 · 🏴 · orthodox · Apex FC          │
│ ─────────────────────────│ │ 16-3-0  W4     Rising contender            │
│ ▸ Henderson  27 LW 16-3  │ │ ─────────────────────────────────────────  │
│   Sokolov    31 LW 22-6  │ │ Wins with: Wrestling 84 · Cardio 81        │
│   Vance      24 LW  8-1  │ │ Vulnerable: Chin 52                        │
│   …                       │ │ Body 29 · Head 18 — pristine               │
│                           │ │ Fight 3 of 4 with Apex · fair deal          │
│                           │ │ Last 5: W W L W W                          │
│                           │ │ [Skills] [Record] [Situation]              │
│                           │ │ ─────────────────────────────────────────  │
│                           │ │ Ranked #4 · two wins from a title shot     │
│                           │ │ [ Take control of Liam Henderson ]         │
│                           │ │ Browsing. Nothing starts until you press.  │
└───────────────────────────┘ └────────────────────────────────────────────┘
```

The list stays visible; the preview swaps. This is the master/detail case the brief asks about and
the one desktop layout that actually beats a phone here.

**Mobile:** `list → full-screen preview → [Take control] → confirm`. Standard push/pop, back
returns to the list with scroll position and filter intact.

**Inspectable, all from existing data:** age, nationality, division, record and `priorRecord`,
divisional rank, reputation, `scoutingRead` strengths/weaknesses, `abilityRead` band, style and
stance, traits, `conditionRead` (body age, wear, trauma), fight history, current promotion and
`contractStanding`, `careerArc` stage, gym, manager, thin-division warning.

**Comparison:** pin up to three candidates into a compare tray (`DataTable`, one column each).
Justified — the choice is explicitly a comparison and the data is dense and homogeneous.

### 11.5 Promotion selection

Same master/detail. The list becomes a **table**, because the promoter's choice is comparative and
the current vertical stack of near-identical rows is the worst possible rendering of it:

| Promotion | Tier | Region | Budget | Divisions | Roster | Belts vacant | Prestige |
|---|---|---|---|---|---|---|---|
| national 11 | National | USA | £3.1m | 8 | 64 | 3 | 41 |

Preview panel, all from existing data: `financialSnapshot` + `describeRunway`; roster depth by
division; champions and vacancies; `attentionFor(db, promotion)` — **which already works for any
promotion, not just the player's**, and is the single best thing available for "what problem am I
inheriting"; contracts expiring; `styleOf` / `describeStyle`; recent events.

An honest **"Why this is a different job"** block, generated from the axes that actually vary:
*"Deep money, thin roster, three vacant belts, and nobody the audience knows."*

**And it must stop there** until §4.4 is resolved. Rendering `notes` as a differentiator when all
170 promotions share one string is worse than omitting it.

Also: **say the regional-only rule out loud.** The code documents why (payroll and broadcaster
pressure are inert at the top of the sport); the player is never told.

### 11.6 Coach selection — the slot that keeps the design from being torn apart

Same `MasterDetail`, same confirmation, different entity: gyms instead of fighters or promotions.
Per doc 14's three starting positions — *your own garage*, *an established gym*, *a super-gym* —
this is a difficulty-shaped choice within the entity list, and the preview panel shows quality,
prestige, specialisms, `monthlyCost`, head coach, and the current stable. Every field exists on
`Gym` today.

Nothing about the Fighter or Promoter flow needs to change when this lands, because the entity
list, preview and confirm are one parameterised flow with three configurations.

### 11.7 Explicit commitment

The rule, stated as a rule: **selection is never a side effect of navigation.**

- Clicking a row selects it for preview and changes nothing.
- Career start requires a named, explicit control: `[ Take control of Liam Henderson ]`,
  `[ Run Apex Fighting Championship ]`.
- The preview panel always carries a browsing indicator — *"Nothing starts until you press
  this."*
- Second step required when a career already exists (the existing `pending` confirmation,
  extended to the promotion path, which has none).
- `updateWorld({ playerRole, playerFighterId, playerPromotionId })` is called from exactly one
  place — the confirm handler — not from three list callbacks.

### 11.8 Reuse without coupling

`FighterScreen` cannot be dropped into new-game selection: it reads `world.playerPromotionId`,
`playerFighter` and `bookedOnPlans`, and offers "Put them on a card". The fix is the §6 refactor,
which this flow needs anyway:

```
FighterView({ fighter, viewer, actions })         // pure, no useGame()
  viewer: 'self' | 'coach' | 'promoter' | 'none'
  actions: ReactNode                              // caller supplies the footer

  #/me                → viewer="self",     actions=<MyDealActions/>
  #/fighter/:id       → viewer=<role>,     actions=<ModeActions/>
  new-game preview    → viewer="none",     actions=<TakeControl/>
```

`viewer="none"` is the honest state for pre-career browsing: no promoter context, no self
disclosure, no "put them on a card". Same facts, no career coupling.

---

## 12. Implementation plan

### 12.1 Sequencing

**Phase 0 — decisions required before any code**

1. Resolve the two offer engines (§3.1). Removing `promotionOffers` changes which promotions
   appear on the dashboard. It is a deduplication, not a mechanics change, but it needs a yes.
2. Decide §4.4: ship the honest promotion picker now, or vary the generator first.
3. Confirm the hub should stop printing an exact overall (§1.3), aligning with `FighterScreen`.

**Phase 1 — foundations, no visible change** *(low risk)*
`ui/promoter.*` → `ui/console.*`; `promoterRead.ts` → `fighterRead.ts`; add `Grid`,
`MasterDetail`, `Collapse`, `StateRow`, `Help`, `DataTable`; add the spacing/type tokens.
Pure renames and additions. Existing screens keep working.

**Phase 2 — `game/careerAttention.ts`** *(medium)*
The fighter's situation model. Pure function over `db` + `fighter`, unit-testable in isolation
against the existing integration fixtures, shipped before anything renders it.

**Phase 3 — `#/contract`** *(medium)*
Rename `#/offers`, move negotiation off the hub, wire to the single offer engine, add comparison.
Doing this before the hub redesign means the hub has somewhere to send people.

**Phase 4 — the Fighter Career dashboard** *(high)*
Rebuild `HubScreen` on `Console` + `Grid` + the situation feed. `<Shell wide>`. This is where the
1,227 lines shrink; most of what is deleted has already moved.

**Phase 5 — `FighterView` + `#/me`** *(medium)*
Extract the pure view, add `viewer`, add the self route. `#/fighter/:id` keeps working throughout.

**Phase 6 — new game** *(medium)*
Mode selection screen, `MasterDetail` selection, explicit confirm, menu improvements.

**Phase 7 — `#/rankings` and `#/training`** *(low)*
Desktop tables, absorb `RestCard`.

Phases 1–3 are independently shippable and leave the game in a better state even if phase 4 is
deferred.

### 12.2 Refactor vs reuse

| Reuse unchanged | Refactor | Delete |
|---|---|---|
| `Console`, `Ledger`, `Tabs`, `AttentionRow`, `AbilityBand`, `MiniRating`, `SubNav` | `HubScreen` → dashboard + situation feed | `hub-nav` grid + `HubLink` |
| `signals.tsx` whole vocabulary | `FighterScreen` → `FighterView(viewer)` | `promotionOffers` *(pending §3.1)* |
| `Shell` nav fork (add `COACH_NAV`) | `OffersScreen` → `ContractScreen` | `LadderCard`'s embedded offer list |
| `RankingsScreen` logic | `StartScreen` → mode + `MasterDetail` | duplicate `ConditionFacts` |
| `Recovery.tsx` mechanism | `MenuScreen` → two-column, data-backed | |
| `attention.ts` shape | `promoterRead.ts` → `fighterRead.ts` | |

### 12.3 Risks

**UI tests are coupled to copy.** `tests/ui/playable.test.tsx` and friends assert on
`/The climb/`, `/Choose your next fight/`, `/Or take over an existing fighter/`, `/Wins with/`,
`/Head trauma/`. Phase 4 and phase 6 break these. Mitigation: move assertions to `data-testid` and
roles **in phase 1**, before anything moves, so a green suite through phases 2–3 means something.

**The situation model can become a second wall.** `attentionFor` is disciplined because every item
must carry a subject, a consequence and an action. `careerAttention` must enforce the same
contract in its types, or the dashboard becomes the old hub with stripes.

**Deep-link and back-stack.** `#/offers` → `#/contract` needs a parse alias; the router's
`depth` counter must survive `MasterDetail` selection, which should be state, not a route push.

**Doc 10 needs updating with it.** It currently states "Hub: show who you are and the single next
decision" — the intent was always right and the screen drifted. The screen-intent table and the
component inventory should be revised in the same PR, or the doc becomes the next thing that is
true on paper only.

**Mode-specific duplication is the long-term risk.** Three rules to hold the line:

1. **No `world.playerRole` branch inside a shared component.** Mode arrives as a prop
   (`viewer`, `actions`), decided at the route boundary. One place to look, one place to add
   Coach.
2. **Mode-specific code lives in mode-specific files.** `screens/fighter/`, `screens/coach/`,
   `screens/promoter/`, with `screens/shared/` for the rest. Today `HubScreen` and
   `PromotionHubScreen` sit in one flat folder and the boundary is folklore.
3. **The third implementation is the signal.** Two modes doing something similarly is fine.
   The moment a third needs it, extract — that is the point at which the shape is actually known.

---

## 13. What this deliberately does not do

- **No mechanics change.** No rating, contract, matchmaking, recovery, progression or economic
  rule is altered. The two items that touch simulation-adjacent code — removing the superseded
  `promotionOffers` and the generated-promotion sameness — are both flagged for explicit approval
  rather than done.
- **No depth removed.** Every value on the hub today survives; the raw number stays beside the
  interpretation, and the mechanic stays behind a `Help`. The change is which layer it lives at.
- **No mode forced into another's interface.** The three dashboards are bespoke by design. What is
  shared is the vocabulary, the entity facts, and the layout primitives — never the shape of the
  home screen.

---

## 14. Decisions taken

The three Phase 0 questions in § 12.1 were answered before implementation began.

**1. Offer engines — approved.** `offersFor()` is the single canonical market. `promotionOffers()`
is removed and every consumer migrated. The Career dashboard *summarises* the canonical market
rather than computing a second one.

**2. Generated promotions — option (a).** Build the honest picker around the axes that genuinely
vary today. Do not invent differentiation in the interface, and do not touch world generation in
this pass. The template cloning is recorded as a real world-generation weakness in
[33 — Generated promotions have no identity](./33-generated-promotion-identity.md), to be
addressed separately.

**3. Overall rating — approved.** The exact Overall comes off the Career hub in favour of
`AbilityBand`, consistent with `FighterScreen`. The underlying granular attributes stay exactly
where they are; this removes a *summary* number, not information.

### Amendments to the proposal

**One primary action is a dashboard rule, not a lint rule.** § 10 proposed "one
`variant="primary"` per rendered screen, lintable". Overreach. The rule adopted is **one dominant
action per decision context**, and specifically **one computed dominant action on the Career
dashboard**. A screen with two genuinely independent decisions on it may have two primaries.
Nothing is linted; unrelated future screens are not constrained.

**The comparison tray is deferred.** § 11.4 proposed pinning up to three candidates into a compare
table. Build the master/detail selection experience first — browse freely, inspect a full preview,
explicitly take control. Comparison is not added merely because `DataTable` makes it cheap; it
lands only if the selection experience turns out to want it.
