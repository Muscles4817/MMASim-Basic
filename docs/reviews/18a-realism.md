# Review — fight realism

> Angle: how faithfully does the simulation reproduce what actually happens in MMA? Reviewer was
> given doc 18 plus the engine source and told to verify the doc.
> Unedited except for HTML-entity cleanup. See [README](README.md) for which claims I checked.

---

Read: `docs/18-styles-and-the-fight-engine.md`, `docs/03-fight-engine.md`, `fight/{simulate,profile,types,damage,stamina,scoring,commentary,fouls}.ts`, `ratings/{attributes,derived,curve}.ts`, `domain/{gameplan,traits,fighter}.ts`, plus the game-plan construction sites in `packages/app` and the statistical suite under `tests/`.

Doc 18 is broadly honest and its central claims about the derived tables, the approach table, `strikeLean` and the clinch are **correct as written**. The errors below are mostly errors of *scope* — the doc describes systems that exist but are not connected to anything.

---

## 1. Corrections to doc 18

**C1 — The single biggest one: tendencies do not drive behaviour.** Doc §2.4 calls `deriveTendencies()` "what a fighter reaches for" and says `strikeLean` "shifts `leadHook`, `highVolume`, `singleLeg` and `fenceClinch`" — implying it changes what happens in the cage. It does not. `Combatant.tendencies` is read at exactly **one** site in the whole engine: `simulate.ts:588`, inside `prepBonus`, where it scales *the opponent's* prepared-read bonus. Nothing a fighter does is conditioned on it.

The formula and the four affected keys are verified correct (`profile.ts:42-61`), but `strikeLean` is not "the only axis of stylistic identity the engine computes" — it is an axis of **scoutability**. It determines how valuable it is for an opponent to have drilled a counter to you, and nothing else. `profile.ts:5` ("what they actually do") and `gameplan.ts:250` ("A fighter's *actual* tendencies") are both inaccurate for the same reason.

Actual behaviour comes from four intent lotteries that never consult tendencies: `resolveDistance` (`simulate.ts:609-631`), `resolveClinch` (`989-996`), `resolveGround` (`1041-1054`), `resolveGroundTop` (`1095-1117`).

**C2 — Stance, reach and height are not "absent from the engine"; they are absent from the *simulator*.** Doc §4.2 says "No stance concept anywhere in the engine." In fact `Fighter` carries `heightInches`, `reachInches` and `stance: 'orthodox' | 'southpaw' | 'switch'` (`domain/fighter.ts:132-134`); generation populates all three (`progression/generation.ts:192-194`); and the shipped roster hand-authors southpaws and switch-stance fighters (`packages/data/src/seed/fighters-heavy.ts:253,379,485,506`, `fighters-light.ts:110,152,238`, `fighters-small.ts:424`). The simulator simply never reads any of them — the only non-generation reference in the repo is an assertion in `progression/progression.test.ts:530`. This matters for the expansion plan: the data plumbing is already done and already seeded.

**C3 — "Exactly two traits touch technique" (§2.3) undercounts.** Three traits move the tendency table (`headhunter` and, via `strikeOutput`, `volumeMachine` *and* `gunShy` — `profile.ts:56-58`). Four traits move fight behaviour directly: `volumeMachine` raises burst size (`simulate.ts:749`) and lowers accuracy (`:778`); `gunShy`/`headhunter` cut `workRate` output (`stamina.ts:101`); `finisher`/`headhunter`/`glassCannon`/`gunShy` move `finishingUrge` in the pursuit roll (`simulate.ts:873`).

**C4 — `headhunter`'s stated effect is not implemented.** Its blurb is "Ignores the body, ignores the legs." Target region is chosen *only* from the game plan (`simulate.ts:688-691`); no trait or attribute modifies `targeting` anywhere in the repo. The trait raises the `headKick` *tendency* (which is decorative, per C1) and lowers total output. It does not head-hunt.

**C5 — "The plan is *tactics*, chosen fresh each bout" (§2.5) is not what the world does.** Every AI-vs-AI fight in the simulated world passes `defaultGamePlan()` — `packages/app/src/game/world.ts:746-747` and `night.ts:176-177`. That is `approach: 'pressure'`, `targeting {head 0.6, body 0.25, legs 0.15}`, `riskLevel 0.5`, **no prepped reads**, `campQuality 0.5` (`gameplan.ts:223-231`). Only the player's own opponent gets `aiPlanFor` (`packages/app/src/game/career.ts:642-684`), and even that never produces `pointFight` or `finish`. `tests/statistical/roster-profile.test.ts` — the suite the engine is calibrated against — also passes no plan.

So §4.1's "Karate/TKD = high kicking + speed, **`counter` approach**" is not reachable in the simulated world at all, and neither is the grinder. The approach layer is effectively inert outside the player's five fights a year.

**C6 — Even the one AI planner derives targeting from the *opponent*, not the fighter.** `career.ts:659-664` picks legs-heavy vs a wrestler and body-heavy vs a big tank, regardless of whether the fighter can kick. A boxer with `kicking` 30 is handed a 35%-legs plan against a wrestler.

**C7 — §3.4 "per-action fatigue (not per-second)" is backwards.** Fatigue is strictly per-second × a position constant × a hardcoded intensity of `1` at distance / `1.15` everywhere else (`simulate.ts:509`, `stamina.ts:51-63`). A 7-punch burst costs exactly what a 1-punch burst costs. Relatedly, doc 03's "defending takedowns are expensive" is false: `isControlled` only raises cost when `position === 'ground'` (`stamina.ts:42`), so being pinned on the fence costs identically to doing the pinning.

**C8 — §3.2 is right, and understates the problem.** Verified: `clinchOffence` = strength 0.45 / wrestling 0.35 / strikingOffence 0.20 (`derived.ts:38-47`); `resolveClinch` resolves `clinchStrike` as `clinchOffence` vs `clinchDefence` (`simulate.ts:1001-1002`); `kicking` is never read in the clinch. See R5 below for how much worse it is than "no `kicking` term".

**C9 — §5's "cheapest real win is a clinch-striking attribute" is the wrong first move.** The clinch generates roughly one strike attempt per ~3 clinch exchanges against 2–7 per distance exchange, and has no path to a stoppage. An attribute feeding a phase with ~5% of the striking volume and 0% of the finishes buys almost nothing until the phase itself has mechanics worth resolving.

**Verified correct and worth keeping:** the derived-ratings table (§2.2) is exact; the approach multiplier table (§2.5) matches `approachWeight` (`simulate.ts:677-684`) exactly; the `strikeLean` formula and its four consumers are exact; 26 traits is exact; the distance intent formulae in §3.1 are exact.

---

## 2. Realism failures, ranked by distortion

### R1. Every fight in the simulated world is fought by a pressure-boxing clone
**Mechanism:** `world.ts:746-747`, `night.ts:176-177` → `defaultGamePlan()`.

Consequences, all simultaneous, for ~99% of the fights the game produces:
- `approachWeight('pressure')` = strike 1.25, kick 0.9, **takedown 0.8**, clinch 1.1. The entire roster is biased *against* shooting and *toward* punching. A 95-wrestling grinder is handed the tactical instructions of a pressure boxer.
- Targeting is universally 60/25/15. Since `knockdownHazard` returns 0 for non-head targets (`damage.ts:116`), this fixes every fighter's KO exposure at the same 60% and makes the leg game — which docs 03 and 18 both hold up as the flagship strategic idea — statistically irrelevant outside the player's own bouts.
- No prepped reads, so the `prepBonus` system (the best-designed system in the engine) is dormant across the world.

This is also the population the calibration was fitted to. Any change to style modelling that gives the world real plans will move `roster-profile.test.ts` before it changes a single engine line.

### R2. Style has no behavioural expression beyond one four-way lottery
**Mechanism:** C1, plus `resolveDistance` (`simulate.ts:609-631`).

Strip it back and a fighter's entire striking identity at distance is: *what fraction of exchanges are `strike` rather than `kick`*, driven by `effect(strikingOffence)·1.25` vs `effect(kicking)·0.9`. Everything else — which strikes, at what range, in what rhythm, off what setup — is either fixed or comes from the plan. Muay Thai, Dutch kickboxing, karate and taekwondo collapse to one scalar as doc 18 says, but so do *boxing and kickboxing* at the level of shot selection, because target region is plan-driven and burst size is attribute-free (R4).

### R3. Only head strikes can end a fight — and leg damage is dealt with boxing skill
**Mechanism:** `damage.ts:116` (`if (target !== 'head') return 0`), and `simulate.ts:756-762`.

Two separate failures:

**(a) Body and leg finishes are impossible.** `knockdownHazard` is head-only; `hurt` is derived from it (`damage.ts:161-164`); `shouldRefereeStop` requires `hurtSeconds > 0` (`damage.ts:207`). Body damage only inflates fatigue via `bodyDrag`; leg damage only multiplies `legImpairment`, floored at 0.6 (`damage.ts:255`). So **the liver-shot KO and the leg-kick TKO do not exist in this sport** — two of the most recognisable finishes of the last decade. Body and leg investment can only ever win you a decision.

**(b) Punches to the legs.** `pickTarget` (`simulate.ts:688-691`) is called inside `throwBurst` *independently of `isKick`*. When `intent === 'strike'` and the plan rolls `legs`, the engine resolves the shot on `strikingOffence` vs `strikingDefence` (`:770-781`), applies `BASE_DAMAGE.legs`, and narrates it from `LEG_STRIKES` — "a calf kick", "an inside leg kick" (`commentary.ts:36-52`). For a typical fighter (SO 70, kicking 55, pressure plan) the strike/kick split is roughly 2:1, so **about two thirds of all leg damage in the game is dealt by `strikingOffence`, with `kicking` never consulted.** The showcase calf-kick-versus-wrestler strategy is majority a boxing stat. The same applies to the body: `BODY_STRIKES` includes "a knee to the midsection" and "a chopping body kick" thrown on a punch roll.

### R4. Volume and pace are attribute-free
**Mechanism:** `throwBurst` `simulate.ts:747-753`.

```
base  = rng.int(2, volumeMachine ? 7 : 5) * riskProfile(riskLevel).output
burst = base * scale * workRate(actor)
```
No attribute enters. `workRate` reads only fatigue and the `strikeOutput` trait hook (`stamina.ts:97-102`). Two fresh fighters throw identical bursts unless one carries `volumeMachine`, `gunShy` or `headhunter`, and in the world every fighter has `riskLevel` pinned at 0.5. Real MMA shows 2–4× spreads in significant strikes per minute between fighters of comparable cardio; here the spread is a trait coin-flip. The pressure fighter who drowns you and the sniper who lands 25 clean shots are the same fighter with different accuracy.

This also feeds the engine's known calibration residual. Doc 03 correctly identifies "strike volume feeding the referee's unanswered-shot counter" as the structural blocker — and `shouldRefereeStop` ships a threshold of 5.5–9.5 unanswered shots (`damage.ts:248`) while its own comment states "three or four is the real-world mark." That is a compensating error pair: the burst model over-concentrates strikes, so the referee had to be made unrealistically tolerant.

### R5. The clinch is a one-sided, low-output, non-finishing phase
**Mechanism:** `resolveClinch` `simulate.ts:973-1030`.

Beyond the verified `kicking` omission:
- **The non-controller has exactly one option: escape** (`:977-987`). They cannot strike, cannot attempt a takedown, cannot reverse the position. `state.clinchControl` is only ever set to the fighter who *initiated* the clinch (`:646`) and is only ever cleared on a break. So a fighter can never be reversed on the fence or taken down by the man he pushed there — one of the most common events in the sport.
- **One strike attempt per exchange** (`:1003-1005`), against 2–7 at distance.
- **No stoppage path.** Compare the distance burst (`:829-834`) and ground-and-pound (`:1170-1176`), both of which increment `state.unanswered` and test `shouldRefereeStop`. The clinch branch does neither. A clinch strike can only end a fight by rolling a knockdown and then converting through `resolveKnockdown`. **The TKO by knees in the clinch is effectively impossible.**
- **No elbows, and therefore no cuts from the clinch or the ground.** `state.cuts` is written at exactly one place (`:802`), inside the distance burst. The elbow is the sport's dominant cut-producer; here doctor stoppages can only come from a flush punch or kick at range.
- **Being pinned costs the same as pinning** (C7). The clinch's real currency — draining the man on the fence — is not modelled.

Net: the clinch is a control-time faucet and a takedown launcher. It is not a striking phase. The Muay Thai problem is real but it is a symptom; the phase itself is hollow.

### R6. The bottom fighter has no offence, and there is no standing grappling
**Mechanism:** `resolveGround` `simulate.ts:1041-1054`; `GROUND_POSITIONS` `types.ts:20`; `resolveTakedown` `:950-954`.

- The bottom fighter's intents are `standUp`, `sweep`, `submission` (guard only; 0.05 weight elsewhere). **No strikes from the bottom, ever.** No elbows from guard, no upkicks — even though `illegalUpkick` is a modelled foul (`fouls.ts:101-103`). A fighter can spend three rounds on his back cutting his opponent open and score a literal zero in the tally.
- A takedown always lands in `guard`, or `halfGuard` if `groundControl > 80` on a 35% roll. Position only ever advances one rung. **The standing back-take → RNC is impossible**, as is any submission from a standing position: no guillotine on a shot, no standing arm-triangle, no anaconda off a sprawl. `guillotine` and `backTake` are read keys with no offensive mechanism behind them.
- A stuffed takedown costs 0.15 momentum and nothing else (`:961`). There is no front headlock, no giving up the back in the scramble — no counter-grappling punishment for a bad entry, which is one of the two ways real wrestlers actually lose.

### R7. Speed does almost nothing; reach does nothing
**Mechanism:** `attrs.speed` appears at exactly one site in the whole engine — `pickInitiative` (`simulate.ts:537`).

Speed does not affect whether you land, how flush you land, how hard you are to hit, or your ability to get out of the way. A speed-99 fighter simply acts first more often. `reachInches` is never read, so there is no range-management contest of any kind: no "he can't get inside", no jab-and-move, no closing-the-distance cost. Combined with R4, the entire out-fighter / pressure-fighter axis — the oldest stylistic dichotomy in combat sports — has no mechanism.

### R8. The late-round breakdown is mechanically suppressed
**Mechanism:** `FATIGUE_SENSITIVITY.power = 0.35` (`curve.ts:69`) × `POWER_SUPERLINEARITY = 1.5` (`damage.ts:47`), against `workRate` (`stamina.ts:97-101`).

By round 3 at fatigue ≈ 0.5, a Power-70 fighter's hazard term drops to roughly 55% of its round-1 value (fatigued to 57.75, `effect(K=1.6)` 1.9 → 1.28, then `^1.5`), while `workRate` cuts his volume to ~0.58×. Against that, the defender's side gains: `accumulation` ≈ 1.28 and `effectiveDurability` erosion (tonight's damage + fatigue) ≈ 1.4–1.5×. Net per-round KO hazard in round 3 is roughly **0.6× that of round 1**.

So "he broke him down over three rounds and got him late" is a *less* likely story than an early finish, by construction — the attacker's power decays as fast as the defender's chin. That is backwards for the arc that makes late finishes narratively and statistically important, and it is the mechanism behind the 32%-first-round figure the docs flag (`roster-profile.test.ts:127`).

### R9. Exchanges are memoryless — no setups, no chains
Intent is re-sampled independently every exchange from static weights. There is no state carrying "he just showed the shot, so the head kick is open", no punch-to-takedown or takedown-to-punch chain, no feint, no ring generalship, no option to *decline* an exchange. Momentum, fatigue, damage and position are the only carriers between beats. Real MMA offence is almost entirely combinational; this engine's is a sequence of independent draws.

### R10. Cumulative damage never ends a fight, and there is no corner
`shouldRefereeStop` requires `hurtSeconds > 0` (`damage.ts:207`); `checkDoctor` only reads cuts (`simulate.ts:1266-1275`). So there is no doctor pulling a fighter for a closed eye, no referee stopping a beating that never produced a discrete wobble, and **no corner stoppage at all** — `FinishMethod` includes `'retirement'`, `commentary.ts:214` and `news.ts:73` ("when the corner pulled him out after round X") have copy for it, and `isFinish` counts it, but **no code path ever produces it**.

### R11. Population method mix
From the shipped calibration (61.5% finishes, KO:sub 3.3:1): ≈47% KO/TKO, ≈14% submission, ≈37% decision. Real UFC sits near 31% KO/TKO, 17% submission, 52% decision. The submission rate is close; **the KO/TKO rate is about 50% too high**, and that surplus is where the decision deficit comes from. R4 (volume) and R8 (round arc) are the mechanisms; R3(a) makes it worse by funnelling all finish pressure through the head.

### R12. Submission familiarity is keyed too coarsely
`familiarity = 1 / (1 + 0.4 · priorAttempts)` uses `actor.stats.submissionAttempts` — a fight-wide counter across all submissions and all positions (`simulate.ts:1228-1229`). A round-3 rear-naked choke is discounted 62% because the fighter tried three guillotines in round 1. The *shape* is right; the key should be per-position or per-submission-name.

---

## 3. What the engine gets genuinely right

This is a better fight model than most shipped MMA sims, and several of its ideas I have not seen elsewhere.

- **Position as the spine, at exchange granularity.** The choice in doc 03 is correct and the code honours it — every resolution is genuinely conditioned on position, and the exchange is the right unit.
- **`exploitFactor` (`simulate.ts:669-673`).** The best idea in the engine, and its stated justification is real: without in-cage adaptation gated on Fight IQ, the simulator produces the absurdity it describes. Making it deliberately weaker than a drilled plan is exactly the right call.
- **Round reset to standing (`simulate.ts:270`).** A rule many sims get wrong, and the comment explains precisely why it matters.
- **`effectiveDurability` (`profile.ts:113-131`).** Chin eroding from tonight's damage *and* career trauma *and* fatigue, with a trait-set floor, is the mechanical statement of "chins go and don't come back". This is genuinely good.
- **Damage by region with three different downstream consequences**, and `legImpairment` feeding `takedownDefence` at `simulate.ts:942`. The strategic logic is real and actually implemented — the only problem is that the plan layer that would express it is dormant (R1) and the resolution attribute is wrong (R3b).
- **Knockdown ≠ finish; pursuit is a separate roll against `finishingInstinct`** (`simulate.ts:853-912`). "Elite power, poor killer instinct" is a real archetype and it is modelled.
- **Three judges with independent bias vectors scoring the same tally** (`scoring.ts:52-74`). Split decisions and robberies emerge from honest disagreement rather than a controversy roll. `isTrulyEven` (`:96-108`) is a sharp piece of thinking, and the comment explaining why judging on the noisy margin produces one draw in seven is the kind of reasoning that only comes from having measured it.
- **The submission cubic + repeat decay** (`simulate.ts:1226-1230`). The right shape for the right reason; only the key is wrong (R12).
- **Referee `standUpSpeed` as a pre-fight visible variable** (`simulate.ts:1247-1262`). Real, consequential, rarely modelled, and correct that it is the largest external modifier on a control wrestler.
- **Fouls buying recovery** (`simulate.ts:487-494`), with the explicit rule that being fouled while hurt must be lucky and never *better* than not being fouled. That is a genuine injustice of the sport and almost nobody models it.
- **Per-attribute `FATIGUE_SENSITIVITY`** (`curve.ts:68-84`) — a gassed fighter becomes a different worse fighter, not a uniformly worse one. Right idea, correctly ordered (kicks and scrambling first, IQ and submission technique last).
- **The calibration honesty.** Doc 03 names its residual, refuses the calibration that matched reality by deleting the power tail, and records *why*. That is unusually disciplined.
- **Emergent-not-declared.** Doc 18 §5 is right and I would not change it. A `style: 'muayThai'` enum would let a label contradict the numbers. The expansion should be attributes, traits and mechanisms — never a discipline field the simulator branches on.

---

## 4. Smallest set of changes buying the most realism, ranked by value per unit of risk

**Tier 1 — high value, no engine change, contained risk**

1. **Give AI-vs-AI fights a real plan.** Two lines: `world.ts:746-747` and `night.ts:176-177`, calling an attribute-derived planner (extend `aiPlanFor`, and move it into the engine). This single change activates the approach table, the targeting split and the prep system for the whole world. It is also the only change here that will move `roster-profile.test.ts` on its own — expect finish rate and KO:sub to shift, and re-baseline deliberately rather than tuning back to the old numbers.
2. **Derive targeting from the fighter as well as the opponent.** `aiPlanFor` currently reads only the opponent (`career.ts:659-664`). A kicker should have a legs-heavy default; `headhunter` should actually head-hunt. Zero engine risk — it only moves plan construction.
3. **Fix punches-to-the-legs.** In `throwBurst`, either make `pickTarget` conditional on `isKick`, or force `isKick = true` when `strikeTarget === 'legs'`. Two lines around `simulate.ts:756`. This makes `kicking` the attribute that chops legs, which is what everyone assumes it already is.

**Tier 2 — small mechanism additions, moderate value, contained blast radius**

4. **Let clinch strikes reach the referee.** Increment `state.unanswered` and call `shouldRefereeStop` in the clinch branch (`simulate.ts:1000-1024`), mirroring the ground branch at `:1170-1176`. Makes the clinch-knee TKO possible. Cheap.
5. **Give the non-controller clinch options** — dirty boxing and a reversal roll, at minimum (`simulate.ts:977-987`). Without this, no clinch attribute can express anything, because half the clinch is a null action.
6. **Make the pinned fighter pay.** Apply an `isControlled` cost multiplier in the clinch, not only on the ground (`stamina.ts:41-45`). One line, and it is the mechanism by which fence work actually wins fights.
7. **Wire `tendencies` into `pickTarget` and burst size.** Blend the plan's targeting with the fighter's `calfKick`/`bodyWork`/`headKick` tendencies, and let a volume tendency scale `base` in `throwBurst`. This closes C1 without adding a single attribute, and it is the change that makes the doc's own description true.
8. **Route clinch striking through `kicking`.** Add a `clinchStriking` derived rating (e.g. kicking 0.4, strikingOffence 0.25, strength 0.2, wrestling 0.15) used for the clinch *strike* contest while `clinchOffence` keeps the *positional* contest. Do this **after** 4–6, not before — see C9.

**Tier 3 — new attributes and finish paths, higher value, higher calibration risk**

9. **A striking output/pace attribute** (the fourth striking attribute). It is the missing axis behind R4, R7 and half of R11, and it is the one addition that makes pressure-vs-movement expressible. It will move volume, which moves the referee counter, which moves the finish rate — sequence it *after* the referee threshold has been brought back toward its stated real-world value of 3–4.
10. **Body and leg finish paths.** Allow a TKO when `bodyDamage`/`legDamage` crosses a high threshold and the fighter is losing badly. Restores two real methods and gives body/leg investment a ceiling other than the scorecards.
11. **Reach.** The cheapest possible use: a small additive term in the distance landing contest and a small resistance term against `clinchUp`. The field is already populated across the seeded roster and generation.
12. **Stance.** An orthodox-vs-southpaw asymmetry term gated on `fightIq`, so the smart fighter solves the mirror faster. Field already exists and is hand-authored in the seeds.
13. **Corner stoppage → `retirement`.** Between rounds, on high cumulative damage plus a corner-quality/composure roll. The method, the commentary and the news copy all already exist; only the trigger is missing.
14. **Key submission familiarity per position/name** rather than per fight (`simulate.ts:1228`). One line, strictly an improvement.

**Do not do:** add a `style`/`discipline` enum the simulator branches on. Doc 18 §5 has this right, and every failure above is fixable with mechanisms and attributes that keep the scouting report derived.
