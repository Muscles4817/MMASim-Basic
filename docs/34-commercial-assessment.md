# 34 — Commercial assessment

> Status: assessment, not a design document. Written 22 August 2026 against the tree at
> `e78602c`. It contains no design decisions and nothing in it is binding on any other doc.

Everything below was verified by running the thing: the full test suite (1,916 tests across
127 files, green in 356s), a production build, and driving the live app end to end on a
390×844 viewport — world generation, fighter selection, career hub, camp, fight night.
Promoter mode was read in source but not played through, and its score is marked provisional
for that reason.

## 1. The one-line answer

The simulation is better than most MMA management games that have shipped commercially.
Everything wrapped around it — art, audio, onboarding, legal clearance, a storefront — is
roughly at zero. The gap between those two facts, not the simulation, is what decides whether
this earns five figures or none.

## 2. What blocks a paid build today

**The seed rosters.** The 2020 and 2026 worlds ship 139 real fighters under their real names
and real nicknames, with ratings and authored notes about their weaknesses attached to each:

```
packages/data/src/seed/fighters-heavy.ts        23
packages/data/src/seed/fighters-light.ts        23
packages/data/src/seed/fighters-small.ts        21
packages/data/src/seed/fighters-depth-mens.ts   50
packages/data/src/seed/fighters-depth-womens.ts 22
packages/data/src/seed/fighters-2026-*.ts       (same names, current era)
```

Selling a product built on named, living, professionally represented athletes is a
right-of-publicity exposure. The promotions are already fictionalised — _Apex Fighting
Championship_, _Vanguard MMA_ — so the instinct was right, it stopped one layer short.

The fix is cheap and it is the genre standard: **ship the generated world only.** Generation
already produces a full five-tier pyramid with eight years of history, and built an
850-fighter world in 3.8s in this container. `EditorScreen` already exists. Publish the
name-pack format and let the community author and trade rosters, the way Total Extreme
Wrestling has for twenty years. Same experience, no liability, no annual maintenance.

## 3. Scorecard

| Dimension             | Score | Note                                                                                                                       |
| --------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------- |
| Simulation depth      |     9 | Camp game plans, range/intent hierarchies, scouting with stated confidence, injury risk broken into visible multipliers.   |
| Engineering rigour    |     9 | 1,916 tests. Determinism and layering enforced by lint. Career traces regenerate as a doc, so a model change is a diff.    |
| Information design    |     8 | Fight night — tale of the tape, named officials, the full card, "Make the walk" — is genuinely well composed.              |
| Fighter loop          |     7 | Closes: take over → offers → camp → fight night → aftermath. Careers run to retirement in the long-sim traces.             |
| Promoter loop         |     6 | Screens exist and doc 29 is thorough. Provisional — not played through.                                                    |
| Coach loop            |     0 | `available: false` in `StartScreen.tsx`. One of three pillars in the README.                                               |
| Visual identity       |     2 | Two SVGs is the entire art budget. No portraits, no promotion marks, no belts, no dark mode. Emoji in the nav bar.         |
| Audio                 |     0 | None. A walkout and a crowd swell are the two cheapest units of drama a text sim has.                                      |
| First-hour experience |     3 | No tutorial. The camp screen presents six focuses, eight scouted tendencies and ~20 tactical options at once, unexplained. |
| Retention hooks       |     1 | No achievements, no records book, no shareable results, no cross-save meta.                                                |
| Commercial readiness  |     2 | Real names, no store page, no desktop layout, no cloud saves. "MMA Sim" is unsearchable.                                   |

Two smaller findings from the playthrough:

- The play-by-play repeated _"keeps them pinned against the fence, working the body"_ three
  times consecutively inside one round. Commentary variety is what sells a text fight.
- A generated small world offered a **championship bout against a 4-4-0 opponent for £18k** —
  a matchmaking plausibility gap a reviewer would screenshot.

Also minor: `vite build` ships a 3.7 MB sourcemap into `dist/` alongside the 878 kB bundle
(279 kB gzipped).

## 4. Route

| Route                               | Verdict          | Why                                                                                                                                                                                              |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F2P mobile with IAP                 | Reject           | Needs a server, accounts, art and UA spend. The pillars ("seed ratings are honest", "every save is a different world") are anti-monetisation by construction.                                    |
| Premium mobile, $4.99–6.99          | Later, as a port | Brutal without an existing audience. Nearly free to do once Steam exists — a second revenue line, never the launch.                                                                              |
| **Steam Early Access, $9.99–12.99** | **Recommended**  | Management-sim buyers live there, pay premium for text-dense games, and accept EA as normal in this genre. Ships before Coach mode is done. Wishlists forecast revenue months before committing. |

There is no _Total Extreme Wrestling_ for MMA, and that gap is why the depth here is worth
something. It cuts both ways: the gap may be unfilled partly because MMA fans want the
fighting, not the booking. Fighter mode is the hedge and the thing to lead with.

### Sequence

1. **Months 0–2, free, validation.** Strip the real names. Rename to something ownable. Ship
   the web build free to r/MMA, the Grey Dog forums and Sherdog; open a Discord. **Instrument
   it** — where players quit in the first hour is the most valuable number available and it is
   a week of work. Gate: do 500+ people play and do any return? If not, stop, two months in
   rather than a year.
2. **Months 2–7, build, wishlists.** Steam page up immediately, well before ready — wishlist
   accumulation time cannot be bought back. Desktop layout pass. Art and audio pass. Onboarding
   and a records book. Decide on Coach mode: build it or cut it from the pitch.
3. **Month 8+, launch.** EA at $11.99 once wishlists clear 7,000; below 2,000, delay. Mobile
   premium port six months later. Web build stays free and limited as a demo funnel.

## 5. Money

At $11.99, net after platform cut, regional pricing and VAT is roughly **$6.50/unit**.
Scenarios hang off launch wishlists, using the standard heuristic that first-week units land
near 10–20% of wishlists and lifetime runs 2–4× first week.

| Scenario                                          | Wishlists |   Units |        Net | Odds |
| ------------------------------------------------- | --------: | ------: | ---------: | ---: |
| Quiet launch — ship as-is, no audience work       |    <1,000 | 300–800 |     $2k–5k |  35% |
| Modest — the plan above executed, no outside luck |      5–8k |  2.5–5k |   $16k–33k |  40% |
| Good — genre gap noticed, streamer pickup         |    15–25k |  12–25k |  $78k–163k |  20% |
| Breakout — becomes "the TEW of MMA"               |      40k+ | 60–120k | $390k–780k |   5% |

- **Median: ~$20k** over two to three years. This is the number to plan around.
- **Probability-weighted: ~$60k.** Dragged up by the tail; unlikely to be experienced.
- **Today: $0.** Nothing to sell and nowhere to sell it.

These are heuristic bands from how niche management sims generally perform, not measured
comparables. Before committing to phase 2, pull real numbers for five adjacent titles off
SteamDB or Gamalytic and re-run the table.

## 6. The short version

- Do not monetise now — not for quality reasons, but because the build contains 139 real
  athletes and there is no store to sell it in.
- Engineering has not been the constraint for a while. 17,400 lines of design documentation
  against 28,400 lines of app, and doc 19 is on phase 6 of 6. The next 20k lines of engine
  work move revenue by approximately zero; the first 2k lines of onboarding move it a lot.
- Two months to a free public build is the cheapest information available about whether this
  deserves a year.
- The strongest argument for continuing is not the revenue. The engine, the determinism
  discipline and the world generator are reusable across every other game in the portfolio,
  and as infrastructure they are worth more than this will earn.
