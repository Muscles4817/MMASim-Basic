# 34 — Promoter audit: execution plan and tracker

> Status: **in progress**. This is the working plan for addressing the four-reviewer audit of
> promoter mode (promoter, UX, fighter, sim designer — the audit doc lives on claude.ai and its
> findings are restated here as numbered items so nothing depends on it). The tracker at the
> bottom is updated as each PR merges; it is the source of truth for what is done.

## Decisions taken before starting

| Question | Decision |
| --- | --- |
| Where PRs land | Straight to `master`, merged once CI is green **and** the reviewer passes it. Master deploys to Pages, so every merge is live. |
| Old saves | May break. Bump the save version; an old save must fail with a clear message, never a crash. No migration code. |
| Fail state | Owner sets yearly objectives. Confidence at zero → fired, offered a job at a weaker promotion, career continues. Cash at zero → bought out, lose top fighters, play on. |
| Naming | Real promotions in the 2026 seed stay. Generated-world placeholders ("national 7", "NAT7 1") get believable generated names. |

## How the work runs

- **Three builder lanes run at once**, each in its own git worktree, each owning a set of files
  so their PRs rarely collide. A lane works its items in order, one PR per item (or per tight
  pair), always branched from the latest `origin/master`.
- **One reviewer** reviews every PR before it merges: does it do what it says, does it break
  anything that worked, is it DRY and structured like the code around it, are there tests. It
  checks out the branch and runs typecheck, lint and the tests itself. It posts its review on the
  PR and returns PASS or CHANGES.
- **The coordinator** (the main session) owns this tracker: briefs the lanes, merges PRs, keeps
  lanes rebased after merges, does a content pass at the end of each phase, and makes sure every
  audit item below ends up done or explicitly deferred with a reason.
- **Commit as you go.** Builders commit and push to their branch at every solid step, not only
  at the end, so a lost session loses at most the step in progress. The coordinator commits this
  tracker after every merge.

### Branches

`claude/promoter-<lane>-<item>` — e.g. `claude/promoter-a-a1-fight-night`. PR into `master`.

### Gate for every PR

1. `npm run typecheck`, `npm run lint`, `npm test` all pass locally (the suite takes ~8 min).
2. Balance or world-generation changes also run `npm run test:long`.
3. New behaviour has tests at the tier that fits (engine unit, integration, playability).
4. Engine stays pure (no `Math.random`, no `Date`, no I/O) — lint enforces it.
5. CI green on the PR, reviewer PASS, then merge.

### File ownership (who may edit freely; others touch only with a small, called-out change)

| Lane | Owns |
| --- | --- |
| A — Fight night, time, card UX | `app/src/game/{clock,plans,attention,inbox,calendar,night}.ts`, `screens/{PlanScreen,CalendarScreen,PromotionHubScreen,InboxScreen,FightScreen,MenuScreen}.tsx`, `App.tsx`, `ui/*` |
| B — Economy, promotion, world | `engine/src/business/*` (except `boutAgreements`, `contracts`, `managers`, `freeAgency`), `app/src/game/{finances,money,world}.ts`, `data/src/seed/organisations*.ts`, `data/src/world/*` promotion parts, `screens/{StartPromoterScreen,ChampionsScreen,RankingsScreen}.tsx` |
| C — Fighters as people | `engine/src/{progression,domain,health}/*`, `business/{boutAgreements,contracts,managers,freeAgency,fighterRead}.ts`, `app/src/game/{progression,career,careerAttention,rivalries,contracts,withdrawals,fightInjuries}.ts`, `screens/{FighterView,PromoterRosterScreen,ContractScreen}.tsx` |

## Work items, in order per lane

Phase numbers follow the audit roadmap: 1 fix the loop, 2 economy and goals, 3 the night and the
week, 4 fighters as people, 5 development over time.

### Lane A — fight night, time, card UX

- **A1 (P1) Fight night is unmissable.** `advanceTo` hard-stops on any player card day; the
  primary CTA becomes "Run fight night: <event>". A card whose date passes unrun is cancelled with
  consequences (buzz, fighter goodwill, it shows in the news). A card that has run is read-only
  and shows its results. Continue on a promoter save opens the dashboard; the save list shows the
  right date and a name. Old-version saves fail with a clear message.
- **A2 (P1) Alert hygiene.** One alert per subject and kind (no daily re-raise); booked fighters
  count as booked; suspensions compared with the bout date (`attention.ts:419`); "within 0 days"
  impossible (respect `MINIMUM_LEAD_DAYS`) and a grace period at the start of a save; only items
  where a decision changes the outcome stop the clock — the rest go in a weekly digest; inbox
  "Take me there" deep-links to the slot or fighter. Fix contradictory card labels ("main event
  set" vs "Needs a main event").
- **A3 (P3) The fight-night show and recap.** Bout by bout from the prelims to the main event:
  winner, method, round, a belt moment, buzz and money ticking up; each bout links to FightScreen.
  Recap: revenue split (gate / TV / sponsors), Fight and Performance of the Night chosen by the
  player, 2–3 post-fight callouts each bookable in one tap. Last-event card on the dashboard,
  week-in-review after an advance, toasts after actions. Your own events appear in The Sport feed.
- **A4 (P3) Matchmaking UX.** Scroll/focus to each step; default to a title fight when a
  champion is in it; autofill never puts a champion in a non-title bout, respects suspensions and
  serves open alerts (vacant belts, #1 contenders) first; tale of the tape when a pair is picked;
  desktop three-pane card builder (slots · picker · comparison); counter-offers labelled "Wants
  £8.5k", not "Turned down".
- **A5 (P3) Fight week.** In the last 7 days: press conference with choices (trash talk / civil
  / staged confrontation → heat vs risk of a scuffle or fine), weigh-in misses on promoter cards
  (catchweight with purse penalty, or cancel), withdrawals rolled during the run-up rather than on
  the night, short-notice replacement market, marketing spend per card (uses B1's demand hook).
- **A6 (P1/P3) Onboarding and readability.** First-week checklist with dismissable tips; "Plan
  a card" opens the new-card form; body text ≥ 14px, chips ≥ 44px, `aria-live` for offer and
  advance results; weight classes spelled out where space allows; chip row scroll hint; remove
  duplicated nav.

### Lane B — economy, promotion, world

- **B0 (P1) Content: generated names.** Generated promotions get believable names and short
  names (no "national 7"); events are named "<SHORT> <n>: <A> vs <B>"; fix lowercased names in
  CTAs; label the unlabelled numbers on the start screen. Coordinator reviews the content.
- **B1 (P2) Economy rebalance and buzz.** Regional nights earn tens of thousands, not £481k;
  overheads follow a staff/facility level, not cash; market sets venue/production cost; purse
  inflation on re-signing after wins; an empty card forecasts a loss. Buzz starts 30–45 for
  regionals, decays without cards, swings on title fights, finishes and upsets; rivalry heat
  feeds the draw (`runPlan` stops passing `heat: 0`). A demand hook for marketing spend (used by
  A5). Long-sim test: a sloppy autopilot ends year 1 at 0 to −10%, sensible play ahead.
- **B2 (P2) Broadcaster and owner.** `RightsDeal` (fee per card, minimum cards a year, ratings
  target, 0–100 satisfaction, review at < 40 with a 3-card warning, renewal ± fee). Owner with 3
  yearly objectives and confidence; fired at zero → job offers at weaker promotions; cash at zero
  → buyout, lose top 3 fighters, play on. Dashboard shows objectives and deal health.
- **B3 (P2) Prestige and tiers move.** Prestige drifts with delivery, champion quality and the
  deal; tier thresholds unlock PPV, bigger deals and raise costs and expectations.
- **B4 (P5) Rival promotions with intent.** Postures (Aggressor / Developer / Moneyball);
  counter-programming dates; bids on your expiring stars with a matching window; named moves in
  the news, including "the fighter you cut won a belt at X".
- **B5 (P5) Investment and the season.** Matchmaker, scouting network, medical staff, marketing
  department as monthly costs with visible effects; a flagship card each year; December awards;
  Grand Prix for a vacant belt; Contender Night for prospects; scouting board across promotions.
- **B6 (P5) History, scenarios, rankings.** Title lineage, promotion timeline, hall of fame,
  "where are they now"; rankings that weigh quality of wins and inactivity (no #1 drop without a
  fight, no 4-7 at #2, a draw doesn't zero a 10-0 streak); strip a champion; cross-division
  superfights; scenarios and difficulty settings; standing orders for busywork.

### Lane C — fighters as people

- **C1 (P4) Identity on the page.** Generated nicknames (and earned ones after highlight
  finishes, announced in the news); a gym and coach for every fighter; an identity strip (origin,
  gym, coach, height, reach, walk-around weight, flag, silhouette avatar). Fix FighterView
  contradictions: duplicate Champion chip, Free agent vs fights left, Recovering vs Fresh,
  champion read as "not troubling the ranked fighters", `daysIdle: 0`, champion wants, overview
  vs contract pay, recent form showing the whole career, true ratings shown in promoter mode.
  No duplicate first/last names ("Preston Preston"); traits that contradict ratings.
- **C2 (P4) Star power surfaced.** Draw rating with trend and home market, a persona (heel, fan
  favourite, quiet killer…), shown on the fighter page and on every picker row with "what this
  fight sells".
- **C3 (P4) Memory, wants and voice.** A fighter–promoter relationship ledger (title shots
  given or skipped, idle spells, mismatches, pay, protection, cuts) weighted by personality,
  feeding bout acceptance and re-signing. Richer wants (money fight, legacy, superfight, move up,
  rematch, one last run) that weigh into acceptance; `bank` affects acceptance. Personality
  drift after milestones. A templated voice layer: callouts, demands, refusals with reasons in
  the news and inbox.
- **C4 (P4) Negotiation.** Contract negotiation with the manager: purse, win bonus, fights,
  PPV share, champion's clause, matching rights; 1–2 counters shaped by personality; holdouts;
  re-sign action for expiring fighters; rival bids with a match window (with B4). Bout offers
  answered over 2–7 days with counters for money, card slot, rounds or a different opponent.
- **C5 (P5) Real careers over time.** Wear written into generated pre-history; KO losses cost
  the chin more; fix the world's age skew; AI fighters develop, peak and decline visibly; trend
  read on the scouting card. Long-sim assertions for the shape.
- **C6 (P5) Career events.** AI division moves; "considering retirement" with farewell fights
  and comebacks; medical history on the Career tab; a head-space read naming the fight that
  caused it; rivalries from trilogies, split decisions and callouts.

## Tracker

| Item | Phase | Lane | Status | PR |
| --- | --- | --- | --- | --- |
| A1 Fight night unmissable | 1 | A | Not started | |
| A2 Alert hygiene | 1 | A | Not started | |
| B0 Generated names (content) | 1 | B | Not started | |
| C1 Identity on the page | 4 | C | Not started | |
| B1 Economy and buzz | 2 | B | Not started | |
| B2 Broadcaster and owner | 2 | B | Not started | |
| B3 Prestige and tiers | 2 | B | Not started | |
| A3 Fight-night show and recap | 3 | A | Not started | |
| A4 Matchmaking UX | 3 | A | Not started | |
| A5 Fight week | 3 | A | Not started | |
| A6 Onboarding and readability | 1/3 | A | Not started | |
| C2 Star power surfaced | 4 | C | Not started | |
| C3 Memory, wants and voice | 4 | C | Not started | |
| C4 Negotiation | 4 | C | Not started | |
| C5 Real careers over time | 5 | C | Not started | |
| C6 Career events | 5 | C | Not started | |
| B4 Rival promotions | 5 | B | Not started | |
| B5 Investment and season | 5 | B | Not started | |
| B6 History, scenarios, rankings | 5 | B | Not started | |
| Content pass after each phase | all | Coordinator | Not started | |
