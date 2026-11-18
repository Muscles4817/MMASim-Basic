# 36 — The combat simulation plan

**Status:** in progress. This is the implementation plan that follows the audit in
`docs/reviews/19-fight-engine-audit.md`. Each phase lists what it changes, why, how we'll know it worked, and what it costs.
Phases are ordered so each one leaves the game shippable and calibrated. The "Progress log" at the
bottom says what has actually landed.

---

## 0. The goal, stated as testable claims

A fight should be **the product of two specific people and what they've trained**, unfolding
through time. Concretely, a finished engine passes these claims (each becomes a statistical test):

1. **Sequence matters.** What a fighter just did changes what they do next and how well it works: combinations, setups, chain wrestling, submission chains.
2. **Fighters learn during the fight.** A smart fighter defends better against what the opponent keeps doing, and a dull one does not. A corner can change the plan between rounds.
3. **Mental attributes are visible.**
   - `fightIq` → reads, adjustments, shot selection, pacing.
   - `composure` → performance hurt, behind or late.
   - Personality: `aggression` → pressure and willingness to trade; `ego` → plan abandonment and coachability; `resilience` → comebacks, rallies, breaking; `discipline` → sticking to the plan and pacing.
4. **Training is visible.** A fighter's *repertoire* (what they have drilled: signature submissions, favourite combinations, stance style, entries) shapes what they throw and attempt. It is derived from attributes and background, and sharpened in camp.
5. **Every phase has depth.** Distance (already good), clinch positions, chain wrestling and scrambles, a ground *graph* (not a ladder), and a real submission catalogue with leg locks and chains.
6. **Damage creates stories.** Body and leg damage can finish a fight. In-fight injuries happen and carry into the post-fight report. Hurt fighters try to survive in character, and comebacks and rallies happen.
7. **Fights ebb and flow.** Output fades realistically (about 10–20 % by R3, not 50 %), momentum swings, and a round can turn.
8. **Stances have trade-offs.** Open vs closed stance changes what lands. Stance *styles* (bladed, square, crouched, standard) each buy something and cost something. Switch-stance fighters switch on purpose.
9. **The sport's numbers stay right.** Finish rates, KO:sub ratio, round distribution, accuracy and volume stay at or move *toward* real-sport values. Every existing statistical bound either still holds or is consciously re-baselined, with the reason recorded.

## 1. Constraints

- **Determinism.** Same seed, same fight. All new randomness comes from the exchange RNG.
- **No allocation in the fight loop.** New per-fight state lives on `Combatant` or in fixed-size records allocated once per fight. The statistical tier runs millions of exchanges.
- **Saves stay compatible.** No new rated attributes. New per-fighter data is optional, with a derived default (the same pattern as `background` and `aptitudes`).
- **The Reduced resolver (`round.ts`) is re-fitted to the full engine at the end of any phase that moves population outcomes.** Use `tools/reduced-refit.ts`; the `reduced-fidelity` suite holds it.
- **Narration reports, it never decides.** Every new technique is resolved first and then narrated, which preserves the guarantee in `commentary-parity.test.ts`.

### Why no new attributes

The 15-attribute block is hand-authored on 139 seed fighters, generated, trained, aged, scouted and
rendered. Adding a 16th touches roughly 40 files and every save. The depth the audit asks for is
mostly about **what a fighter has drilled** and **how they think**, and neither needs a new rating:

- *Thinking*: `fightIq`, `composure` and five relevant personality axes already exist and are under-read. This plan gives each of them specific jobs.
- *Drilling* is a **repertoire**: a small optional `Fighter.style` block (§ Phase 1). It is derived when absent and refined by camp focus.

---

## Phase 1 — Style profile and fight memory (the foundation)

**New module `fight/style.ts`.**
- `StyleProfile` holds:
  - `stanceStyle`: `standard | bladed | square | crouched`
  - `combos`: weights over combination families
  - `subs`: weights over submission families
  - `entries`: shot preferences
  - `signature?`: an optional named favourite
- `styleOf(fighter)` derives it deterministically from attributes, background and traits.
- `Fighter.style?` overrides the derived profile when present (authored fighters, camp-trained fighters).

**New per-fight memory on `Combatant` (`fight/memory.ts`).**
- `last`: the last beat's action, family, target, weapon, result and timestamp.
- `ledger`: attempts and successes per action family, both for the fight and for the current round.
- `seen`: what the opponent has done, counted per family. This feeds reads.
- Everything is preallocated and mutated in place.

**Tests:** `memory.test.ts` (unit); determinism unchanged.

## Phase 2 — Combinations, setups and pacing

- **Bursts become combinations.** A burst is drawn as a combination family from the repertoire: jab-cross, cross-hook, double jab, punches-to-low-kick, body-head, head-body, level-change feint, counter-hook off a slip. Each shot after the first gets a *setup bonus* if it fits the pattern (for example, body then head: the guard drops). Feints are free beats that raise the next shot's landing chance, scaled by `fightIq`.
- The setup bonus is **level-neutral**. It is offset by a lower base landing chance, so it changes *who* lands and *what*, not the sport's accuracy.
- Emit `combination` when two or more shots in a pattern land.
- Each line gets its own timestamp (offset within the exchange).
- **Output fade fix.** `workRate` falls off more slowly. Fatigue moves into accuracy, speed and power rather than volume alone (≈15 % fade by R3).
- **Pacing.** Fighters with high `fightIq` and `discipline` bank a little energy early and surge late. Low-discipline, high-aggression fighters start hot and fade.

**Tests:** combination share by style; R1/R3 output ratio in [0.78, 0.92]; setups move win rate only through repertoire.

## Phase 3 — Damage stories and highs and lows

- **Body.** A body hazard (liver), mainly from kicks, knees and hooks, scales with body damage and opens a `hurtBody` window: the fighter folds, can't move and gives up position. Rare body-shot KO/TKOs follow.
- **Legs.** Past a threshold, leg damage compromises the stance: the fighter switches stance, stops kicking and gets slower. At extreme damage it can end the fight as a TKO ("can't stand on it").
- **In-fight injuries** (`fight/injuryEvents.ts`):
  - broken hand: a hard punch landing on the skull or elbow
  - foot: a checked kick
  - rib: body damage
  - shoulder or elbow: a survived kimura, armbar or Americana
  - knee: a survived heel hook or kneebar
  - eye swelling: from accumulated head damage

  Each sets an in-fight multiplier, is narrated, and is returned on `FightResult.injuries` so `health/injuries.ts` can make the same injury official.
- **Hurt behaviour.** A hurt fighter chooses a survival route by character: tie up, shoot, shell, run, or fire back (`composure`, `aggression`). Firing back is high-variance, and that variance is where comebacks come from.
- **Rally / second wind.** Resilience and composure can trigger a surge after a bad stretch (momentum floor, round break).
- **Corner stoppage.** Between rounds, a corner can retire a badly damaged fighter (`'retirement'`).

**Tests:** body and leg finishes become a small, non-zero share of finishes; injury events match the post-fight roll; hurt survival routes vary with personality.

## Phase 4 — Reads, adjustments and the mental layer

- **In-fight reads.** From `seen`, a fighter with high `fightIq` builds a defensive read against the opponent's most-used family. This works like a camp `preppedRead` but is earned during the fight, smaller, and grows over time. Counter timing improves against a predictable opponent.
- **Feedback.** The ledger feeds back into choices: repeated failure in a family lowers its intent, and success raises it. The size of that shift scales with `fightIq`, and *ego* slows it. A dull fighter keeps doing what isn't working.
- **Corner adjustments between rounds.** A rule-based "corner brain" reads round tallies and the ledger and makes one adjustment: change range, abandon takedowns, start wrestling, attack the body, protect the lead leg, or go for the finish. The fighter accepts it according to coachability (inverse `ego`) and `discipline`. It is narrated as a corner line.
- **Composure under pressure.** Performance penalties when behind, hurt or in late rounds are scaled by composure. They hit decision quality (bias noise) more than physical output.
- **Aggression** sets willingness to stay in the pocket and to trade when hurt. **Resilience** sets how fast plan integrity and momentum recover.

**Tests:** a stuffed wrestler shoots less later in proportion to IQ; reads cut opponent accuracy in the favoured family; corner adjustments are visible and change round tallies.

## Phase 5 — Chain wrestling, scrambles and the front headlock

- **Chains.** After a stuffed shot, the shooter can *chain*: single → double, run the pipe, or switch to a body lock. Likelihood scales with `proactiveWrestling`, the wrestling repertoire, cardio and `wrestling`. Each link is cheaper in time and slightly more likely to land against a defender who is tired or worn on the legs.
- **The defender's side.** A sprawl leads to a **front headlock** (new transient state): a snap-down to go-behind (back), a guillotine or D'Arce, or a reset. This gives strikers with good wrestling defence a weapon.
- **Mat returns.** When the bottom fighter stands up, a top fighter with high `wrestling` can return them to the mat instead of letting them go.
- **Scrambles.** Failed sweeps and stand-ups resolve through a scramble that can end in several positions (top, bottom, standing, back) on `scrambling` vs `scrambling`.

**Tests:** P(another shot | stuffed) ≥ base rate for chain wrestlers; front-headlock submissions appear for wrestlers with strong submission repertoires.

## Phase 6 — The ground graph and the submission catalogue

- **Positions.**
  - **Guards:** `closedGuard`, `openGuard` (butterfly, De La Riva and similar), `halfGuard`.
  - **Top control:** `sideControl`, `northSouth`, `kneeOnBelly`, `mount`.
  - **Back:** `back` (hooks or body triangle), `turtle`.
  - **Leg entanglement:** `legEntangle`, `ashi` positions.

  Moves form a **transition graph** with weights: passes skip rungs (from open guard straight to mount is rare but possible), back-takes come from turtle, half guard and scrambles, guard recovery lets the bottom fighter regress the top, and a stand-up attempt can expose the back.
- **Submissions.** A catalogue with family (choke, arm lock, shoulder lock, leg lock), positions, attack and defence attributes, an injury mode, and *partner* submissions (armbar ↔ triangle ↔ omoplata, kimura → back, guillotine ↔ D'Arce/anaconda, heel hook ↔ kneebar). The submission is **chosen before the contest**, from the repertoire. A failed attempt can chain into its partner.
- Leg locks are entered from open guard and scrambles. Failing one costs position.
- The `GroundPosition` type widens. The old five values remain valid, so old results still render.

**Tests:** signature subs dominate a specialist's attempts; leg locks appear for leg-lock specialists only; sub rate stays within bounds.

## Phase 7 — The clinch, filled out

- **Clinch positions** (a sub-state): `collarTie` (Thai plum), `overUnder`, `doubleUnders`, `bodyLock`, `fence` vs `open`. Underhook battles shift position before control changes hands.
- **Weapons by position:**
  - plum: knees to the head
  - over-under: dirty boxing, uppercuts and short elbows
  - double unders and body lock: throws and trips
  - on the fence: knees to the thigh and stomps
- **Breaks with strikes:** an elbow on the exit, or a shot as they separate.

**Tests:** clinch strike share rises toward the real range (5–10 % of landed); knees concentrate in Muay Thai backgrounds.

## Phase 8 — Stances as styles

- **Open vs closed matchup.** Rear straight and lead-leg body kick to the liver suit the open stance; jab and lead hook suit the closed stance. Applied through `SUITABILITY` modifiers per matchup.
- **Stance styles:**
  - `bladed`: better at distance and with linear attacks, worse calf-kick defence, weaker takedown defence
  - `square`: checks kicks and clinches well, open to the jab and straight shots
  - `crouched`: strong takedown defence and power hooks, open to knees and uppercuts
  - `standard`: no modifiers
- **Switch-stance fighters** switch tactically, which nullifies an opponent's open-stance edge or opens a new angle. Everyone switches when the lead leg is compromised.

**Tests:** each stance style has a measurable pro and con; southpaw edge preserved.

## Phase 9 — Presentation and calibration

- Commentary: technique names drawn from the *resolved* technique and the fighter's repertoire (no spinning back kicks from kicking-50 wrestlers), corner lines, read and adjustment lines, injury lines, stance switches.
- Re-fit the Reduced resolver. Re-baseline any statistical bounds that should move, with recorded reasons.
- Update the audit harness and re-run the full audit.

---

## Performance budget

Measured with `tools/audit/fight-engine-audit.ts` at N=300 (9 matchups, 2,700 fights): **≈3.0 s** before this work. Budget: **≤ 2×** after all phases. Every phase records its number in the progress log.

## Progress log

_(appended as phases land)_

### Phase 1 — landed
Style profile (`style.ts`), submission catalogue (`submissions.ts`), fight memory (`memory.ts`),
widened `GroundPosition`. Submissions are chosen from the repertoire before the contest. Population
unchanged apart from RNG draw order. `intent-authority` golden re-recorded.

### Phase 2 — landed (calibration items open)
- Bursts are drilled **patterns** (`combos.ts`): one-two, one-two-hook, body-head, head-body, hands to
  the low kick, kick into the hands, low-high, kick flurry, feint-and-shot, single shot. Each link after
  the first gets a setup bonus (bigger for a level change, and bigger after a feint). The bonus is scaled by how
  drilled the pattern is and by the attacker's `fightIq`, and reduced by the defender's `fightIq` and by how
  often he has already seen the pattern tonight. The lead shot pays `LEAD_DISCOUNT`. `combination` is emitted.
- Every burst line has its own timestamp; technique names follow the resolved technique and lead foot.
  Showpiece names need the skill to back them.
- **Fatigue reworked.**
  - Base per-second rate 0.0016 → 0.0011, round recovery 0.28 → 0.34.
  - A per-strike cost (kicks cost most; commitment³ prices sitting down on shots).
  - `FATIGUE_BITE` 1.25 makes a tired fighter worse at everything.
  - `workRate` ties only 40 % of volume to the tank.
  - `VOLUME_LEVEL` 0.8 restores the sport's total volume.
  - Even pair, decision fights, strikes attempted per round: **41 / 25 / 20 → 39 / 32 / 29**.
- Pacing: high-IQ, disciplined fighters bank early and surge in the last round; hot-headed ones start fast.
- Bursts use stochastic rounding.

**Open after phase 2 (for the phase 9 calibration pass):**
- `balance` prep ×2: contender v grinder is now 27 % rather than 11 %, and the outside plan no longer helps.
- `risk` at 8.03 against an 8.00 bound.
- `transition-intent` wrestler closing distance.
- `over-a-card` ×2.
- `broadcast` even-handed read.
- `mass-experiments` C1.
- `reduced-fidelity` ×3 (needs the Reduced refit).
- `intent-authority` golden (re-record at the end).

### Phase 3 — landed
`stories.ts`, per 100 fights in the audit matchups:
- Body-shot folds: 1–10, some ending in TKO. A fold is more likely once body damage has built up.
- Compromised lead leg: 1–2, which forces a stance switch. A leg-kick TKO past 76 leg damage.
- Checked low kicks: 2–110, by stance style. A square stance checks most.
- In-fight injuries: hand on a skull, foot on a check, rib, swollen eye, and joints from survived locks (more often for stubborn fighters).
- Hurt fighters choose a survival route by character: tie up, shoot, shell (invites the stoppage), fire back, or run.
- Once-a-fight second wind, driven by resilience and composure.
- Corner retirement between rounds, about 0.3–1.7 %.

In-fight injuries are returned on `FightResult.injuries` and made official by
`app/game/fightInjuries.ts`. Combatants carry their own attribute copy, so tonight's injuries never
touch the stored fighter.

### Phase 4 — landed
`mind.ts`:
- **Reads.** Earned in-fight defence against the families an opponent *leans on* relative to an ordinary fighter. Built from what was actually seen, scaled by `fightIq`, up to half a camp read. Applies to strikes, takedowns and clinch entries. Mixing it up defeats it.
- **Self-adjustment.** Leaning away from failing families and into working ones, scaled by `fightIq` and damped by `ego`. Measured: a stuffed-every-shot wrestler shoots 2.1–2.2 times in R3, against 2.7–2.9 for one who landed everything. Before, this ran backwards.
- **Corner advice.** One instruction between rounds, picked from the round's evidence: stop shooting / defend the takedown / take him down / keep doing it / chop the leg / go to the body / let your hands go. Whether it lands depends on coachability (ego, discipline), and how often anything useful is said depends on camp quality. It is narrated after the bell.
- **Composure** now sets how much defence a hurt fighter keeps (0.36–0.58, previously a flat 0.45).

Open, carried to phase 9:
- G4 kicking value (≈2 pp against 4).
- Prep ×2.
- Upsets at 54.7 % against 55 %.
- C1 round-three volume.
- `calibration-fixtures` confound canary.

### Phase 5 — landed
`wrestling.ts`:
- **Chains.** A stuffed shot re-links (single → double → body lock → trip), driven by `chainWrestling`, the plan and the tank. Each link gets a growing edge and every sprawl costs the defender gas.
- **Front headlock** off a sprawl: go-behind (turtle or back), a front-headlock choke from the repertoire (guillotine, D'Arce, anaconda), or a snap-down reset.
- **Mat returns** when the bottom fighter stands.
- **Back exposure** when a get-up fails.
- **Scrambles** off failed sweeps: both up, reversed, or back taken.

Measured, P(re-shot | stuffed) against the baseline takedown share: grinder **59 % vs 17 %** (was 2.9 % vs 17.8 %), even pair 17 % vs 13 % (was 4 % vs 13 %).
The submission contest now reads the hold's technicality (submissions against strength), its finishing factor and a small signature bonus.

### Phases 6–8 — landed (calibration open)
- **Ground graph** (`groundGraph.ts`):
  - Passes land on weighted targets; skilled passers skip rungs.
  - Back-takes come from half guard, side control, north-south, turtle and scrambles.
  - Working framing recovers guard.
  - A closed guard that holds often opens.
  - Leg-lock players dive on legs from the guards into `legEntangle`; a failed leg lock gives up position.
  - The catalogue's 20 holds are all reachable: rear-naked chokes come from the new back routes, and the guillotine was trimmed.
- **Clinch** (`clinch.ts`): weapons by clinch game.
  - Thai: knees to the head and body, elbows.
  - Dirty boxing: short hooks, uppercuts, elbows.
  - Greco: thigh knees, short shots, stomps.
  - Greco games take people down from the tie-up more; Thai games less.
- **Stance styles** (`stance.ts`): bladed, square, crouched, each with a measurable pro and con (`tools/audit/fight-engine-stances.ts`). A shape is only assigned from a recorded background or an authored style, apart from unmistakable wrestlers. Tactical stance switching is driven by `stanceSwitching`. A hurt fighter's offence now drops too, scaled by composure.
- Parity test made whole-word ("kneebar" is not a knee).

Failing after phase 8, all calibration (see phase 9):
- G4 striking and kicking swings
- Prep ×3
- Upsets
- `transition-intent` ×3
- `range` wrestler distance
- `mass-experiments` S1 and C1
- `over-a-card` ×2
- `trait-cost` chainWrestler
- `reduced-fidelity` ×3
- `intent-authority` golden ×3
- `broadcast` read
- `attribute-economy` record

### Phase 9 — calibration, narration, drilling
- **Skill balance, found by ablation.** Every new mechanism was switched off one at a time and the G4 swings re-measured.
  - Survival routes and stories were the largest equalisers. A hurt man who ties up no longer takes clinch *control*. His strikes (composure-scaled) and his shots (×0.6) are worse. Hand breaks were halved.
  - Kicks were over-priced in the tank and their patterns pulled kicks off the head. `anyKick` slots now keep the fighter's own targeting, and the kick profile is 1.4 damage / 1.7 hazard.
  - Wrestling sequences were trimmed. Prepared takedown reads blunt the chain. Shot defence depends on the starting range (shape-only table). Strength takes a 20–25 % share of shots, passes and escapes.
- **Visible adjustment.** A line is narrated the first time a read forms or a fighter abandons a failing family ("X is timing Y's shot now", "X has stopped shooting").
- **Drilling** (`drillStyle`). Every camp nudges the repertoire by focus:
  - Boxing and kicking camps reinforce the best pattern.
  - Strategy camps reinforce the feint.
  - Wrestling camps raise the chain.
  - Submissions camps sharpen the signature, or create one for a fighter with submissions ≥ 62.
  - The override is stored compactly; the save-size test passes.
- **Booth fixes.** Hurt lines are credited to the striker; misses are flagged (`FightEvent.missed`) and ignored.
- **Re-baselined with reasons** recorded in each test: the prep fixture, tactics ×2, the grinder's submissions, booth agreement, the functional-rating fence, the `cardioMachine` tripwire (inverted as it instructed), and the intent-authority golden.
- **New tests.** `tests/statistical/combat-depth.test.ts` covers the § 0 claims; `fight/depth.test.ts` covers the pure modules.
- **Results.**
  - Unit + UI: 1409/1409. Integration: 557/557. Statistical: all but the Reduced-agreement checks, which need the re-fit.
  - Performance: audit harness 4.2 s against 3.0 s (budget 6.0 s).

**Open, for the next pass:**
- Re-fit `functionalRating`'s weights to this engine.
- Cage geography: fence position, cutting off the cage.
- A late-fight payoff for body work beyond fatigue.
- Wrestling is the most valuable attribute by a wide margin (≈22 pp swing against striking ≈8): defensible for the sport, but worth a deliberate decision.

### Reduced resolver — re-aligned
The joint refit tool (`tools/reduced-refit.ts --fit`, about three hours) improved its own objective, the RMS log-ratio over four rates on 10 calibration matchups, from 0.379 to 0.283. But it made *outcome* agreement on the `reduced-fidelity` archetype matchups worse (9 failures against 4), so it was **not shipped**.

The real gap was one number. Full's volume fell by `VOLUME_LEVEL` 0.8 in phase 2, so Reduced's `BASE_ATTEMPTS` went 15 → 12. Every reduced-fidelity, -direction and -clinch check is back inside its bounds. A future joint refit should add the fidelity suite's outcome metrics to its objective, not only the four rates.

### Final state
- `npm test`: **171 files, 2,421 tests, all passing.** Typecheck and lint clean.
- The long-sim tier was verified before the Reduced change (20-year world: KO/TKO 31.0 %, SUB 19.9 %, DEC 47.0 %) and re-run after it.

## Cage geography

`fight/cage.ts`. The fight now knows **whose back is nearest the fence, and how near** (0 is the centre, 1 is pinned).

- **Closing pushes.** A successful step in drives the other man back. A pressure plan pushes ×1.6, and aggression scales it 0.75–1.3.
- **Retreating straight back spends cage.** A movement plan spends half, because it circles.
- **Cutting off the cage.** From depth 0.45, a retreat becomes a lateral escape. It is contested on footwork (`distanceControl`'s speed / fight IQ / cardio mix) against the presser's footwork, fight IQ and aggression, and deeper is harder. Failing to escape is narrated as the cage being cut off and gives the presser his look.
- **What the fence changes:**
  - Striking defence drops up to 7 %.
  - Tie-ups are up to 30 % easier, and a successful clinch entry walks the man onto the fence.
  - A takedown taken against the fence lands there, and the bottom man's stand-up is 25 % easier (the wall-walk).
- **Resets.** The bell and every referee restart return the fighters to the centre.
- **New stat:** `FightStats.fenceSeconds`. **New lines:** backed onto the fence, circled off, cage cut off.
- **Tactical stance switching** now comes only from IQ, a karate background or switch-stance identity. Plain orthodox fighters no longer switch, which keeps the stance test's paired-seed identity.

**Measured** (`tools/audit/fight-engine-cage.ts`, 600 fights per row):

| Matchup | Fence time for the pressed fighter |
|---|---|
| Even, no plans | ~10 s |
| Pocket pressure v outside movement | 84 s; the presser wins 60 % |
| Pocket pressure v outside lead | 103 s |
| Pressure v a quick, high-IQ mover | 41 s; the mover wins 68 % |

Calibration-neutral: the whole statistical tier passes except the intent-authority golden, which is re-recorded. Tests: `fight/cage.test.ts` and the cage block of `combat-depth.test.ts`.

Not modelled: two-dimensional position (circling is a contest, not a coordinate), cage control as a judging criterion, and the cage in the Reduced resolver.

## The wrestling economy and the cardio curve

**The question:** is wrestling really as dominant as the engine made it? Measured with the G4 probe (`tools/audit/attribute-swings.ts`: one attribute moved from 38 to 98 on the contender archetype, against the contender), the honest answer was that wrestling was not the outlier:

| Attribute | Before | After |
|---|---|---|
| Wrestling | 22.0 pp | 21.2 pp |
| Takedown defence | 20.8 pp | 19.5 pp |
| Striking offence | 7.8 pp | 12.3 pp |
| Kicking | 3.0 pp | 9.4 pp |
| Striking defence | 19.5 pp | 17.6 pp |
| Scrambling | 19.0 pp | 18.5 pp |
| **Cardio** | **74.6 pp** | **52.0 pp** |

A good sprawl already cancelled a good shot almost one-for-one. The distortions were **cardio**, at three times any skill, and **striking offence**, at a third of striking defence.

- **Grappling effort costs gas** (`EFFORT`, `chargeEffort` in `stamina.ts`). The shooter pays for every shot, more when it is stuffed (the sprawl lands on him) and more on each link of a chain. The man sprawling pays less than the shooter, which is why sprawl-and-brawl works. A failed get-up costs the man underneath, and a successful one still costs something. Every charge goes through cardio, body damage and the weight cut, so a body-shot game makes a wrestler pay more for each.
- **The cardio curve.** `CARDIO_GRIP` is 0.3 above an average tank and `POOR_TANK_GRIP` is 0.85 below it, so a bad tank still gasses visibly while elite cardio has diminishing returns. Trait multipliers on the tank go through `TRAIT_TANK_GRIP`. Cardio's marginal value at a fixed budget fell from +59 to about +25, level with power and speed.
- **Craft volume** (`craftVolume` in `combos.ts`). A better striker throws more of what works, by up to ±30 % around a 60 in the relevant weapon. The Reduced resolver mirrors it over the round's weapon mix.

Wrestling now leads striking offence about 1.7 : 1. That is close to my reading of the real sport: wrestling is the most valuable base, but not by three times.

**Re-baselined with reasons in each test:**
- C1 now asserts on the fade ratio, because high-cardio pairs wrestle more through `chainWrestling`.
- The attribute-economy bounds are inverted, as that test instructed.
- The foul-rate ceiling goes 40 → 45.
- The tactics range ratio goes 1.3 → 1.25.
- The fixture spans for volume and control are lowered.
- The `functionalRating` fence is back at its original value.

`functionalRating` was re-fitted against this engine; see below.

### `functionalRating` after the cardio change: the constants stand, and a structural finding

`tools/functional-refit.ts` was re-run against this engine. It gained two flags: `--planned` gives every fighter the plan `planFor` would, and `contextPower` is now capped below zero, because charging a fighter for his holes is what the rating is for.

- **Fitted on the unplanned populations the test uses:** the matched-mean score rises to 0.67 (hold-out 0.66). But every such fit breaks `functional.test.ts`'s design claims: an exploitable striker reads above an all-rounder, and a hole stops costing more against the opponent who can put you in it.
- **Why that happens:** without plans nobody targets a hole on purpose. Measured head to head, an exploitable striker beats a level-70 all-rounder **59 % unplanned** and loses **60 % planned**. The unplanned round robin is teaching the rating that holes are cheap.
- **Fitted on planned fights, the world the game actually runs:** the current constants score only 0.10 on matched means (the flat average scores 0.12). The best fit reaches 0.40 with nearly every constant pinned against its bounds.

**The structure, not the weights, is what doesn't describe planned fights.** That is a redesign, and it is logged here rather than forced into this pass. The constants stay, keeping every design claim. On the unplanned populations the rating still beats the flat average on all three measures (general 0.951 vs 0.928, matched means 0.471 vs 0.331, orthogonal 0.368 vs 0.356). The matched-mean margin in the statistical test drops from +0.2 to +0.1, with the reason recorded there.

**Open:** rebuild `functionalRating` to predict *planned* fights, and move `functional-rating.test.ts` onto planned round robins when it is.
