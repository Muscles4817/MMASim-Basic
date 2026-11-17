# Fight engine audit — diversity, ebb and flow, adjustment

**Date:** 2026-11-17 · **Scope:** `packages/engine/src/fight/` (the full-detail `simulateFight`, not the Reduced `round.ts` resolver)
**Method:** I read all of `simulate.ts`, `policy.ts`, `range.ts`, `stance.ts`, `damage.ts`, `stamina.ts`, `commentary.ts` and the tactics vocabulary. Then I ran about 25,000 seeded fights through two harnesses that are now in the repo:

- `tools/audit/fight-engine-audit.ts` covers 9 style matchups with AI game plans (`planFor`). It measures phase mix, technique variety, round-to-round swing, chaining and the event mix.
- `tools/audit/fight-engine-probes.ts` and `fight-engine-probes2.ts` are controlled experiments: output by round, stance, in-fight adaptation, targeting payoff, what a hurt fighter does, signature submissions and narration coverage.

Run either with `npx vite-node tools/audit/<file>.ts`. All runs are seeded and reproducible. The existing fight unit tests pass (67/67).

---

## Verdict

The engine has an unusually good **skeleton**. Position is the backbone. Standing has three ranges, the ground has five positions, and the clinch has two sides. Weapons are chosen shot by shot, and the narration reports what the engine actually resolved. Game plans have five separate parts, and conviction wears down over the fight. The documentation is excellent. Calibration work is everywhere.

What the engine lacks is **memory and sequence**. Every exchange is resolved on its own: who acts is re-drawn, the action is re-drawn, and every shot in a burst is an independent roll. Nothing that happened earlier in a fight changes what a fighter *chooses* next. Only the damage meters, fatigue and momentum carry over. That one missing piece is behind most of the gaps you asked about: no real combinations, no setups, no chain wrestling, no mid-fight adjustment, no reads, no corner. The diversity problem is mostly vocabulary. Submissions, clinch strikes and stance are each a short fixed list chosen at random, regardless of who is fighting.

| Question | Grade | One line |
|---|---|---|
| Diversity of combat (phases, styles) | **B** | Styles produce clearly different fights; inside each phase the menu is thin. |
| Ebb and flow | **C+** | Swings exist, but output halves after round 1 and comebacks after damage are rare. |
| Highs and lows | **C** | Knockdowns and deep submissions land. There is no "rally", and body/leg damage never produces a moment. |
| Tactical adjustments, setups, counters | **D** | Counters exist. Setups, feints, reads and between-round adjustments do not. |
| Distance control | **A−** | The best system in the engine. |
| Clinch | **C** | Two-sided, but knees only: no dirty boxing, elbows, frames or underhooks. |
| Chain wrestling | **D** | Measured as *anti*-chaining: a stuffed shot makes the next shot less likely. |
| Submissions (inventive, varied) | **D+** | 3–4 names per position, picked at random. No leg locks, no chains, no signature moves. |
| Minor injuries in-fight | **D** | Cuts, leg damage and body drag exist. There are no discrete in-fight injuries, and body/legs can never hurt someone. |
| Combinations | **D** | A "burst" is 1–7 independent shots. The `combination` event kind is never emitted. |
| Stances and their pros/cons | **D+** | Southpaw gets a flat bonus over orthodox. "Switch" does nothing. No stance has a cost. |

---

## 1. Diversity of combat

### What works

Matchups produce recognisably different fights. Each row is 300 fights, both sides on AI plans.

| Matchup | Distance / clinch / ground time | Finishes | Signature |
|---|---|---|---|
| Even (50s across the board) | 46 / 11 / 44 % | 18 % | mixed |
| Olympic boxer v point karateka | 83 / 5 / 13 % | 93 % KO/TKO | 36 % of landed strikes are kicks |
| Guard player v grinder | 12 / 4 / 83 % | 15 % sub | 13.8 sub attempts per fight |
| Striker v grinder | 23 / 4 / 73 % | 24 % sub, 15 % KO/TKO | 71 % takedown success |
| Guard player v striker | 48 / **19** / 33 % | 77 % KO/TKO | trips are the most common entry (38 %) |

Things that are genuinely good:

- **Takedown entries follow the plan.** `tripsAndThrows` fighters trip, wrestlers double and single, counter-fighters level-change on reactive shots. Entries also decide where the fight lands (`landingPosition`, `simulate.ts:1837`).
- **Weapons follow both the fighter and the range.** The `SUITABILITY` table in `range.ts` stops head kicks from the pocket and long punches from kicking range.
- **The narration reports only what the engine resolved.** The prose never names a technique that did not happen.

### Where it thins out

1. **A fighter's technique names are random.** The engine resolves weapon and target; the narrator then picks *which* punch or kick from a list. In the sample fight below, Grinder (a chain wrestler, kicking 50) "lands a spinning back kick — flush". Any fighter can be described throwing anything within a weapon/target cell. Nothing like "jab-heavy" or "lives on the lead hook" can come through, because those labels are not resolved anywhere.
2. **The clinch has one weapon.** `throwClinchStrike` (`simulate.ts:2000`) always throws a knee, aimed at the body 60 % of the time (hard-coded at `:2017`). There are no dirty-boxing punches, no elbows on the break, no frames, no underhook or overhook battle. Across all matchups, knees are **0.2–3.3 % of landed strikes**.
3. **Standing elbows, spinning attacks, flying knees, front kicks and teeps do not exist as resolved techniques.** Some appear in the vocabulary (`commentary.ts:56`), but only as random flavour for a generic kick.
4. **The ground ladder is one-way and linear.** `advancePosition` always moves up exactly one rung: guard → half guard → side control → mount → back (`simulate.ts:2452`). There is no turtle, front headlock, knee-on-belly, north-south, butterfly or open guard, and no leg entanglement. A back-take only happens from mount. A sweep always lands in closed guard (`:2358`). Scrambles have no outcome that can go either way.
5. **There is no pull-guard.** The tactics docs already acknowledge this. A `bottom` game plan cannot take the fight where it wants to go.

**Realism check (even matchup).** These are approximate public UFC averages, given for scale only:

| | Engine | Real-world approx. |
|---|---|---|
| Significant strikes landed per fight-minute, both fighters | 3.1 | ~7–8 |
| Significant strike accuracy | 52 % | ~45 % |
| Takedown attempts per 15 min | ~10 | ~3–4 |
| Submission attempts per fight | 4.4 | ~1 |
| Draws | 5.5 % | ~1 % |

Even fights are grappling-heavy and striking-light. The strike rate partly reflects the volume cut described in `damage.ts:312`. Combined with the fade in §2, it leaves the standing game sparse in rounds 2 and 3.

---

## 2. Ebb and flow

### The headline finding: output halves after round 1

In even matchups that go to decision (n = 432), strikes attempted per round, both fighters combined:

```
R1 41.3   R2 24.8   R3 20.0     (landed 21.1 / 13.1 / 10.5)
```

Control time stays flat (164 / 162 / 171 s). The same fade appears in every matchup: 42 → 20, 38 → 19, 107 → 35. Real fights lose maybe 10–20 % of output by round 3, not 50 %. The cause is `workRate` (`stamina.ts:113`): it scales every burst size by remaining gas, so fatigue from round 1 directly removes strikes. A fresh championship-rounds surge cannot happen. Rounds 2 and 3 are quieter versions of round 1, and the fights read front-loaded.

### Swings and comebacks

| Matchup | Fights with rounds split between the two fighters | R1 loser wins fight | Dropped fighter wins | Both fighters dropped |
|---|---|---|---|---|
| Even | 77 % | 25 % | 27 % | 4.3 % |
| Boxer v karateka | 19 % | 45 % | 23 % | **23 %** |
| Striker v grinder | 28 % | 26 % | 37 % | 3.7 % |
| Contender v journeyman | 2 % | 1.5 % | 4 % | 2.3 % |

Even fights do trade rounds, and striker-on-striker fights produce real wars, where both fighters get dropped in about a quarter of fights. Mismatches are flat, which is fine.

What is missing is **direction**. The damage lead (cumulative landed-strike differential) changes hands only **0.1–1.7 times per fight**. Momentum (`shiftMomentum`) is real but small (±0.05–0.55), and between rounds it is multiplied by 0.45. Nothing models a fighter *finding* something — a read, a timing, a weapon that works — and building on it. The ebb and flow you see comes from dice and fatigue, not from fighters solving each other.

### Highs and lows

Present:
- Knockdowns, hurt states, a pursuit flurry and the referee count.
- "Deep" submissions that are survived.
- Point-deduction fouls that break up a finishing sequence.
- Doctor stoppages from elbow cuts.

Missing or weak:
- **Only head strikes can hurt or drop anyone** (`damage.ts:200`, `:265`). There are no liver-shot folds, no body-kick crumples and no leg-kick TKOs. In a controlled even-pair test, a body-first plan **lowered** KO/TKO wins from 5.7 % to 2.3 % and produced no late-round payoff (13 % of its KOs come in R3, against 16 % for the default plan). A leg-first plan lost more fights (46.5 % win rate). Body work costs the opponent gas through `bodyDrag`, which is a real mechanism, but no player will ever see "the body work paid off in round three".
- **Hurt fighters do not change behaviour.** In the 30 seconds after being hurt or dropped, the victim initiated 0.29 strikes and 0.20 kicks, against 0.04 clinches and 0.04 takedowns. They do not tie up, shoot or run unless their plan's situational table says `survive`. Crafty survival is mostly absent.
- **No rally, no corner stoppage.** `'retirement'` is a finish method with narration but is never produced (no corner pulls a fighter between rounds). `'combination'` is a declared event kind that is never emitted.
- **Many events share one timestamp.** Every line in a burst and its counter is stamped with the exchange's *start* time (`simulate.ts:269`). The play-by-play reads as bursts at :00, :14, :20 rather than a continuous fight.

---

## 3. Tactical adjustments, setups and counters

### Counters: present

`resolveStrikeExchange` always gives the defender a return burst, larger for counter-fighters and for the pocket. A failed range entry hands over a 1.3–1.45× counter. This is the best tactical interplay in the engine.

### Adjustment: absent

- The plan is fixed for the whole fight. Between rounds only `restorePlanIntegrity` runs (`simulate.ts:350`), and it can only recover some of the original plan, never change it. No corner reads the scorecards and changes the plan.
- `exploitFactor` (`:1492`) adapts to the opponent's *ratings*, not to what has happened in the fight. It produces the same value at second 1 and minute 15.
- **Measured.** A wrestler whose shots were all stuffed in R1 then shot **more** in R3 (2.63 attempts) than one who landed every R1 shot (2.46). The only within-fight learning is that each repeat of the same submission becomes less effective.
- `needsFinish` only exists in the final round and only raises output. It never changes *what* the fighter does.
- The situational rules (`policy.ts` `situationOf`) are the closest thing to adjustment. They are pre-written triggers with a fixed priority order, and they read only the current round.

### Setups: absent

- There are no feints. Nothing raises the hit chance of shot B because shot A was thrown.
- Every shot in a burst is independently rolled for target, weapon and landing (`pickShot`, `simulate.ts:1519`). A jab does not set up the right hand, the body shot does not bring the guard down for the head, and no strike masks a level change. `reactiveShot` is an entry *label* and does not depend on the opponent having just thrown.
- Prepared reads (`preppedReads`) are the one thing a fighter "expects", and they are fixed at camp.

### Chain wrestling: inverted

`P(the next action is another takedown by the same fighter | his shot was just stuffed)` against that fighter's baseline takedown share of standing actions:

| Matchup | After a stuffed shot | Baseline |
|---|---|---|
| Even | 4.0 % | 13.4 % |
| Striker v grinder | 2.9 % | 17.8 % |
| Guard player v grinder | 6.8 % | 42.7 % |

A stuffed shot moves momentum to the defender (`simulate.ts:1959`). Initiative is then re-drawn, and the shooter usually ends back at range. The `proactiveWrestling` entry ("Chain wrestling: force entry after entry") raises *how often* a fighter shoots. It does nothing to *link* one shot to the next. There is no single-to-double, no mat return, no re-shot off the sprawl, and no switch from a body lock to a trip when the first throw fails.

---

## 4. Distance control (the strongest system)

`range.ts` and `resolveRangeBeat` are excellent:
- Three standing ranges.
- Range "stickiness" that fades over time.
- Reach leverage, and an asymmetry between closing and retreating.
- Failed entries that cost something.
- Range-specific weapon suitability and transition ranges after breaks, stand-ups and stuffed shots.
- Stats that let a player tell whether the game plan actually happened.

The point karateka v boxer fight produces 15 range events per fight and reads like a range fight. Gaps:
- No cage geography. Doc 31 already notes this. Cutting off the cage, a back to the fence and circling out cannot exist.
- No lateral movement or angles: range is one axis.

---

## 5. Submissions

- **The submission name is `rng.pick` from a per-position list** (`simulate.ts:2552`, `commentary.ts:87`), chosen *after* the contest decides the result. A guard player with 90+ submissions attempts the omoplata, triangle, armbar and guillotine at **20.6 / 20.5 / 20.4 / 19.8 %**, almost perfectly uniform. Nobody has a signature submission. Every submission is resolved the same way.
- The whole repertoire is 16 names. There are **no leg locks** (heel hook, kneebar, ankle lock, toe hold), no standing guillotine or front-headlock series, no Von Flue or anaconda, no wrist locks, and no twister or calf slicer for the "inventive" end.
- **No chains.** Armbar → triangle → omoplata, or kimura → back-take, cannot happen. A failed bottom attempt only gives up one rung of position (`:2590`).
- **Repetition.** 31–53 % of attempts repeat a submission the same fighter already tried in that fight. In the sample round, the grinder attempts the "mounted guillotine" four times in 80 seconds.
- Submission attempts happen only on the ground. Clinch and front-headlock submissions (guillotine off a sprawl, D'Arce off a shot) cannot exist.

---

## 6. Stances

- `Fighter.stance` is `orthodox | southpaw | switch`, and its only effect is `stanceEdge` (`stance.ts:62`): a flat ×1.14 on the southpaw's landing and range contests against an orthodox opponent, reduced by the opponent's fight IQ.
- **Measured (8,000 fights, IQ-40 opponent):** southpaw 51.9 % against orthodox 50.1 %. The edge is real but small, as designed. At IQ 45 and 2,000 fights it disappears into the noise (51.0 % against 50.3 %).
- **Southpaw against southpaw, and orthodox against orthodox, behave identically.** "Switch" gives nothing and costs nothing. There are no open-stance weapons (lead-leg body kick to the liver, rear straight down the middle, lead-foot outside position), no closed-stance pattern, and no mid-fight stance switch, for example after the lead leg is damaged.
- **No stance has a cost.** There are no stance *styles*: bladed karate (great for distance, weak to calf kicks), square Muay Thai (good for checking kicks and clinching, open to the jab), wrestler's crouch (good takedown defence, eats uppercuts and knees) or crab-walk/shell. Your question asked about exactly these tradeoffs, and the engine currently cannot express them.
- Fixture bug: `ARCHETYPES.southpawSniper` is **orthodox** (`testing/fixtures.ts:423` sets no `stance`). Anything using it as the southpaw exemplar is testing an orthodox fighter.

---

## 7. Minor injuries in the fight

Present:
- Damage meters by region.
- Cuts by weapon, with elbows the most likely to cut, leading to doctor stoppages.
- `legImpairment` (up to −40 % on kicks, movement and takedown defence) and `bodyDrag` (more fatigue, less recovery).
- Fouls with recovery time.
- After the fight, `health/injuries.ts` rolls named injuries (hand, knee, rib, concussion…) from exposure.

Absent: **discrete injuries during the fight.** A broken hand in R1 that changes the rest of the fight, a rolled ankle, a dislocated shoulder from a kimura, an eye swelling shut on one side, a rib that makes body shots unbearable: none of these exist. The post-fight roll never feeds back into the fight it came from. Leg damage never makes a fighter switch stance, stop kicking or start wrestling. It only lowers a multiplier.

---

## 8. Play-by-play texture (one real round)

Contender v Grinder, round 2, unedited excerpt:

```
  0 strike     Contender lands a hook to the liver — flush, and that hurt.
  0 kick       Grinder lands a spinning back kick — flush, and that hurt.
 14 kick       Grinder lands a head kick.
 14 knockdown  Contender is DROPPED — and Grinder is swarming!
 20 clinch     Grinder forces the tie-up and walks them back to the cage.
 30 takedown   Grinder gets the body lock and dumps them — down they go, Grinder in guard.
 83 positionAdvance  Grinder advances — now in half guard.
 99 positionAdvance  Grinder advances — now in side control.
124 positionAdvance  Grinder advances — now in mount.
134–260      six submission attempts from mount (arm-triangle, armbar, mounted guillotine ×4)
```

The good: the round has a shape — strike, knockdown, clinch, takedown, pass, mount, hunt.
The weak:
- A "flush" liver hook that "hurt" has no effect, because body shots cannot hurt.
- A wrestler throws a spinning back kick.
- Six lines share the timestamp 0.
- The pass is always one rung at a time.
- The fighter on the bottom does nothing visible for 170 seconds in mount.
- The round scored 10-9 despite a knockdown and mount for half of it.

About **58 % of thrown strikes appear in the play-by-play** (only the first miss in each burst is narrated). That is a sensible choice for readability.

---

## Recommendations, by value for effort

Each recommendation stays inside the existing architecture. Every phase so far has been re-calibrated against `tests/statistical/`, and these should be too.

1. **Exchange memory (adds sequence).** Add a small `lastBeat` record per corner in `FightState`: last action, landed or not, target, weapon. Then let:
   - a stuffed takedown boost an immediate re-shot or switch for `proactiveWrestling` (real chain wrestling);
   - the previous shot's target shape the next shot's defence, so the body shot opens the head and the jab opens the right hand (setups and combinations);
   - a landed or blocked strike shape the reactive-shot chance (a real `reactiveShot`).

   Emit `combination` when a burst contains a set-up pattern. This one change touches most of the "D" grades.
2. **Between-round corner adjustment.** At the bell, read the round tallies, which already exist, plus the attempt/landed counters per phase, which also already exist. Apply bounded nudges: lower takedown intent after 0/N, raise it after N/N, change range preference if range changes keep failing, tie up if hurt. Gate it on the coach (or fight IQ) and plan integrity. This creates visible adjustments and makes coaches matter.
3. **Fix the output fade.** Have `workRate` fall off more slowly with fatigue, or make fatigue cost accuracy and power rather than volume. Then re-measure the population against `roster-profile`. The target is roughly a 15 % drop R1→R3, not 50 %.
4. **Body and leg finishes.** Give `knockdownHazard` a small body term (liver, scaled by body damage, kicks and knees) and a leg term (a "can't stand on it" TKO when leg damage passes a threshold). These are rare, but they are what makes a body-first or leg-kick plan exciting.
5. **Signature submissions and a deeper menu.** Pick the name *before* the contest, weighted by fighter tendencies such as `guillotine`, `backTake` and a new `legLocks` tendency. Let the name set the attack and defence weights. Add leg locks (with a failure mode that can lose position) and a front-headlock submission off a stuffed shot. Add a two-step chain: after a failed attempt from guard, a chance to switch into its partner.
6. **Fill out the clinch.** Add dirty-boxing punches and elbows to `throwClinchStrike`, with weapon chosen from fighter attributes, plus an underhook contest that shifts `clinchControl` gradually.
7. **Stance as a style, not a bonus.** Add a separate `stanceStyle` (bladed, square, crouched, standard) that changes `SUITABILITY`, kick-check rate, takedown defence and which targets are open. Give switch-stance fighters a small edge in range changes against same-stance opponents, so the choice has a reason. Let heavy lead-leg damage trigger a stance switch.
8. **In-fight injuries.** Give a rare chance, after hard blocked kicks, punches to the skull and kimura attempts, to apply a named injury that sets a multiplier for the rest of the fight. Then feed that injury into the post-fight roll so it is the same injury.
9. **Small fixes:**
   - Timestamp each burst line by its offset within the exchange.
   - Make the vocabulary weight technique names by the fighter (no spinning back kicks from kicking-50 wrestlers).
   - Give `ARCHETYPES.southpawSniper` the southpaw stance.
   - Make a hurt fighter's default include a survival tie-up even without a situational rule.
