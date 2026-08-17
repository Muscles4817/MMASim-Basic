# Review — gameplay expressiveness

> Angle: does choosing a style change how the game *plays and feels*, or only which numbers are
> higher? Reviewer was given doc 18 plus the engine and app source and told to verify the doc.
> Unedited except for HTML-entity cleanup. See [README](README.md) for which claims I checked.

---

# 1. Corrections to `docs/18-styles-and-the-fight-engine.md`

The doc is broadly accurate — the approach table, derived-rating weights, `strikeLean`, `exploitFactor` and the clinch critique all check out against source. Nine corrections:

| § | Claim | Reality |
|---|---|---|
| 2.3 | "Exactly two [traits] touch technique — `headhunter` and `volumeMachine`" | **Four.** `deriveTendencies` multiplies `highVolume` by `traitMul(t,'strikeOutput')` (`profile.ts:58`), and `gunShy` (0.75) and `headhunter` (0.85) both carry that hook (`traits.ts:197,302`). `volumeMachine` also hard-codes a separate burst-size branch in the simulator (`simulate.ts:749`), which is a second, undocumented channel. Two more — `loneWolf` and `fragileEgo` — move `gamePlanAdherence`, i.e. how much of the chosen identity survives contact. |
| 2.4 | "`strikeLean` … is the **only** axis of stylistic identity the engine computes" | There is a second: **Fight IQ**. `counterRight` and `calfKick` are both gated on it (`profile.ts:54–55`), so a high-IQ striker has a materially different read profile from a low-IQ one at identical striking ratings. Minor, but it is the axis that separates "karate counter-striker" from "swinger" and the doc misses it. |
| 2.2 | `cageIq`, `finishingInstinct`, `chainWrestling` listed with composition "—" | `finishingInstinct` and `chainWrestling` are consumed. **`cageIq` is computed, rendered on the fighter profile (`FighterScreen.tsx:252–259`), and read by nothing in the engine** — grep returns only its definition. A visible dead number. |
| 3.2 | "Three intents: `takedown`, `clinchStrike`, `stall`" | Only for **the fighter who won the tie-up**. `resolveClinch` gives the non-controlling fighter exactly one option — try to escape (`simulate.ts:977–987`). This is a larger hole than the one the doc names: a Muay Thai fighter who is *clinched by* a wrestler cannot throw a single knee. The phase is not "resolved by strength", it is *unavailable* to whoever lost the entry. |
| 3.1 | Distance intent formulas | Correct, but omits that clinch entry itself is gated on `clinchOffence` (`simulate.ts:623–625`), which is 45% Strength / 35% Wrestling. So a Muay Thai specialist does not merely fight the clinch badly — **they largely cannot get there**, and getting there is a wrestling stat. |
| 4.1 | Karate/TKD "→ headKick, counterRight, **low volume**" | The `counter` approach does not reduce output. Its table is `strike 1.1, kick 1.1` — *higher* than pressure's kick weight. Output is moved only by `riskLevel`, `workRate` and `volumeMachine`. What `counter` actually does that no other approach does is raise the counter-burst scale from 0.55 to 0.90 (`simulate.ts:722`) — a real and undocumented mechanic, and the strongest single piece of style expression in the engine. |
| 4.1 | "Six [distinguishable archetypes]. Maybe seven" | Optimistic. Measured on the engine's own `deriveTendencies`, a Muay Thai fighter, a Dutch kickboxer and a karate counter-striker produce read profiles that differ by **≤0.09 on every one of the fifteen reads** (table in §2.7 below) — which is inside the scouting error term at almost any coach rating. The striking side of that list is closer to three archetypes than six. |
| 4.2 | "Southpaw vs orthodox — **no stance concept anywhere in the engine**" | Stance exists as a first-class field (`fighter.ts:134`), is rolled weighted 7 / 2.5 / 0.5 at generation (`generation.ts:194`), is hand-authored in the seed roster, and is **printed on every fighter profile** (`FighterScreen.tsx:80`). It is read by nothing. That is worse than absent: it is a visible, apparently-meaningful attribute that is pure decoration. (`CreateFighterSpec` even accepts a stance — `createFighter.ts:150` — and `CreateFighterScreen` never offers the control, so every player fighter is orthodox forever.) |
| 5 | "Character creation is the consumer… Six disciplines is what the engine currently supports honestly" | Understates the problem by looking only at the fight engine. The consumer that destroys discipline is **training**, not simulation — see §2.1. |

Also worth flagging from an adjacent doc: `docs/05` claims a `Lone Wolf` with Fight IQ 90 "substitutes their own read, which is often better than the plan." No such interaction exists; `loneWolf` is a flat −0.35 to adherence with no IQ term anywhere.

---

# 2. Where style evaporates in the player's loop, ranked by cost to the experience

## 2.1 — Training dissolves the background you chose. *(worst)*

`TRAINING_FOCUSES` has five entries and one of them is `striking`, which trains `strikingOffence: 1, kicking: 0.85, strikingDefence: 0.8, speed: 0.3` in a single bundle (`development.ts:57–63`). **You cannot train hands without training kicks.** And because gains scale with `headroom(current, ceiling)` (`development.ts:189–192`, `rawGain` line 248), the attribute you are *worse* at grows *faster*.

Running the repo's own arithmetic forward on the two striking backgrounds:

```
              Amateur Boxer            Muay Thai / Kickboxer
camps   striking / kicking  gap   striking / kicking  gap
   0        64 / 48        +16        57 / 64        −7
   8        74 / 61        +13        69 / 73        −4
  16        80 / 71         +9        78 / 79        −1
  24        84 / 78         +6        83 / 83         0
```

The kickboxer background — the one whose blurb promises "long weapons, a clinch, and shins conditioned the hard way" — is a **balanced striker by mid-career and indistinguishable from a boxer by the end of one**. The boxer keeps a residue, but a +6 gap does not survive `deriveTendencies`' `p()` normalisation into any visible behavioural difference.

This is the most expensive problem in the game, because it makes the one identity choice the player is asked to make at creation *self-erasing*. The player picks Muay Thai, spends ten years becoming a Muay Thai fighter, and ends up as a generic striker — and nothing in the UI ever tells them that was structurally inevitable. Everything else in this report is a legibility problem; this one is a broken promise.

**Code:** `packages/engine/src/progression/development.ts:56–92` (`TRAINING_META`), `:189–192` (`headroom`), `:246–249` (`rawGain`); surfaced at `packages/app/src/screens/TrainingScreen.tsx:322–386`.

## 2.2 — Commentary narrates events, never fighters.

The doc's own broadcast module says it plainly: *"in a text sim the commentary is the player's only view of the fight."* And the commentary module cannot see the fighter at all.

- `strikeLanded` picks a weapon **uniformly at random** from a fixed pool by target region (`commentary.ts:78–91`). A karate counter-striker and a wrestler who threw one desperate kick both get "a question-mark kick" at the same rate. `Combatant` is in scope; `tendencies` is on it; nothing reads it.
- `takedownText` picks the entry at random from `['a double leg','a single leg','a body lock','a reactive shot','a trip']` (`commentary.ts:118`) — **while `singleLeg`, `doubleLeg` and `bodyLock` already exist as computed per-fighter propensities**. The data needed to make a judoka's takedowns read as trips and a wrestler's read as doubles is sitting one property away and is discarded.
- Every clinch strike in the game, from anyone, is `"digs a knee to the {target} in the clinch"` — a hardcoded string, no variation (`simulate.ts:1014`). The one line where a Muay Thai fighter's identity could appear is identical for a collegiate wrestler.
- **Bug:** missed kicks are narrated as missed punches. `throwBurst` calls `say.strikeMissed(rng, actor, strikeTarget)` without the `isKick` flag (`simulate.ts:790`), and `strikeMissed` always draws from `STRIKES`, never `KICKS` (`commentary.ts:93–95`). A head-kick specialist who misses is described "swinging and missing with a stiff jab."

Net: **you cannot tell what kind of fighter you are watching from the play-by-play.** You can only tell what phase the fight is in. That is the definition of a distinction the player cannot perceive.

## 2.3 — The booth's model of a fight has exactly two categories, and the clinch is in neither.

`broadcast.ts:30–37` sorts every event into `STRIKING_KINDS` or `GRAPPLING_KINDS`. `clinch` and `clinchBreak` appear in neither set, and the clinch-stall line is emitted with **no corner** (`simulate.ts:1028`), so it is filtered out at `broadcast.ts:62` before scoring. A round where a fighter walked their opponent to the fence, held them there and drained them registers as **zero beats for the commentator** — the booth says nothing, and `summariseRound` bails at conviction < 0.18.

`STRIKING_KINDS` also lists `'combination'`, a `FightEventKind` the simulator never emits.

So the only opinion the game offers about *how* a fight was won collapses to one axis — striker vs grappler — which is the same single axis `strikeLean` computes. The engine and its narrator agree on a one-dimensional model of style, and it is the wrong dimension for the clinch-based arts.

## 2.4 — Half the read/counter system is one-directional.

The read system is genuinely good — scarce (4), gated on the opponent's *actual* tendency so a wrong read multiplies to ~0 (`gameplan.ts:270–279`), and confidence deliberately decoupled from accuracy. It is the best system in the game. But:

- `aiPlanFor` (`career.ts:666–675`) draws from a **hardcoded six-item list**: `doubleLeg, singleLeg, calfKick, leadHook, guardPassing, guillotine`, gated on raw attribute thresholds. **Nine of the fifteen reads are never drilled by any opponent, ever** — including `fenceClinch`, `bodyLock`, `headKick`, `bodyWork`, `highVolume`, `counterRight`, `backTake`, `groundAndPound`, `wallGetUp`.
- Consequence: **a clinch fighter's, a head-kick specialist's and a counter-striker's signature threats are never game-planned against.** The player's own style is never respected by the world. If you build the Muay Thai clinch destroyer, nobody in the sport ever prepares for the clinch, so the archetype is never validated — the fantasy dies of being ignored rather than of being beaten.
- The AI also never picks `pointFight` or `finish` (`career.ts:649–656`) and hardcodes `riskLevel: 0.5` (`:680`). Two of six approaches and the entire commitment axis are player-only.

## 2.5 — The result screen cannot show you the fight you asked for.

The camp screen's targeting sliders promise real consequence — *"Legs cut mobility and takedown defence. Body drains the tank."* (`CampScreen.tsx:456–459`) — and that promise is honoured mechanically (`damage.ts:253–261`).

`applyStrike` even records the split: `attacker.stats.strikesByTarget[target]++` (`damage.ts:148`). **Nothing in the app ever reads it.** The post-fight stats show significant strikes, takedowns, control time, knockdowns and submission attempts (`FightScreen.tsx:433–474`) — five numbers, four of which are grappling or generic. There is no head/body/legs breakdown, no punch/kick split, no distance/clinch/ground strike split.

So the player sets a 35% legs game plan, watches a fight, and receives **no evidence whatsoever that the plan was executed**. The tactical lever with the clearest mechanical payoff is the one with zero feedback. The data is already collected.

## 2.6 — Kicking decides *whether* a kick lands; Striking decides how hard.

`rollFlushness` skews on `attacker.attrs.strikingOffence` regardless of weapon (`damage.ts:79–81`), and `strikeDamage` reads only `power` and the region's `BASE_DAMAGE` (`damage.ts:91–100`). A pure kicker — Kicking 90, Striking 55 — lands kicks constantly and lands them **glancingly**, and the head kick that ends fights in reality carries the same base damage as a jab. Mechanically significant, completely invisible, and it directly punishes the specialisation the creation screen invites.

## 2.7 — The scouting report cannot separate two strikers.

Computing `deriveTendencies` for three archetypes the player would consider entirely different fighters:

```
read            Muay Thai   Dutch KB   Karate counter
leadHook          0.60        0.69         0.60
counterRight      0.42        0.47         0.49
calfKick          0.59        0.58         0.65
headKick          0.71        0.69         0.69
bodyWork          0.54        0.58         0.59
highVolume        0.60        0.62         0.59
fenceClinch       0.30        0.26         0.27
```

Maximum separation on any read: 0.09. `scoutOpponent`'s error term at a mid-tier coach is `(1−accuracy)×0.35` ≈ 0.10–0.14 SD (`scouting.ts:55`) — **the noise is larger than the signal between three supposedly different martial arts.** And the report is sorted by estimate and truncated to eight (`CampScreen.tsx:312`), so the player sees a broadly similar top-8 against most opponents.

Note the Muay Thai fighter's `fenceClinch` is 0.30 — the *lowest* meaningful read on their own profile. Their defining phase is the thing they are scouted as least likely to do.

## 2.8 — Smaller, still real

- **Stance** — stored, generated, seeded, displayed, never read; not even offered at creation (§1).
- **`PreppedRead.confidence`** — set from the scouting report, multiplied by purchases, persisted, and read by **zero** engine code. Only `drillQuality`, `adherence` and `campQuality` reach `prepValue`. Not a bug for the mechanic (accuracy is baked into the shown estimate, which is the right design) but the field is a lie about what it does.
- **No self-scouting.** `deriveTendencies` is called on opponents only (`CampScreen.tsx:89`). The player can never see their own tendency profile — there is no screen anywhere in the app that answers *"what kind of fighter am I?"*. `FighterRead` ("Wins with / Vulnerable to", `signals.tsx:259`) names the three highest *attributes*, which is the closest thing and is not an identity.

## Where style genuinely survives — worth protecting

- **`exploitFactor`** (`simulate.ts:669–673`) is the best idea in the engine and the doc is right about it.
- **The `counter` approach's 0.90 counter-burst** (`simulate.ts:722`) — the one place a fighting *philosophy* changes the shape of an exchange rather than a weight.
- **The ground ladder** — `groundControl` and `submissions` genuinely produce different fights, and the sub-position names in the play-by-play make it legible.
- **`entertainmentValue`** (`matchmakingStyle.ts:71–91`) — style has real *economic* consequence: a grinder is buried by a `showman` promotion and a finisher jumps the queue. This is the single most successful expression of style in the game and it lives entirely outside the fight engine.

---

# 3. What would have to be true for expanded style modelling to be *felt*

Adding attributes without these is adding accuracy nobody can perceive. Each of the four channels below has to carry the new distinction, or it does not exist.

**A. The play-by-play has to name the fighter's weapons, not the region's.**
`strikeLanded` must select from a pool weighted by the actor's tendencies rather than uniformly. Same for `takedownText`, which already has the data. Concretely: a fighter with `headKick 0.8` should draw "a switch high kick" often and "a stiff jab" rarely; a `bodyLock 0.7` grappler should trip and drag, not shoot doubles. This is a change to `commentary.ts` alone, with a `Combatant` already in the signature — no engine change, no rebalancing, no statistical-suite exposure. **It is the cheapest legibility win in the project by an order of magnitude, and it makes every existing distinction visible for the first time.**

**B. The result screen has to prove the plan happened.**
Add to `FightStats`: strikes by target (already collected), punches vs kicks, and strikes by position (distance / clinch / ground). Show them beside the existing five. A player who set 35% legs should see *"legs 24 of 61"* and a leg-damage bar on the opponent. Without this, no amount of extra style modelling changes what the player experiences after the bell.

**C. Training has to let you refuse to become well-rounded.**
Split `striking` into at least `boxing` (strikingOffence, strikingDefence, speed) and `kicking/clinch` (kicking, strength, strikingDefence). This is the load-bearing change: it converts style from a starting condition that decays into **a choice the player re-makes every eight weeks**. It also creates the trade the game currently lacks — staying a specialist means accepting a permanent hole, which is exactly what the creation screen's "weakness" line promises and the training system then quietly repairs.

**D. The world has to respect the style back.**
`aiPlanFor` must draw reads from the opponent's *actual* top tendencies rather than a hardcoded six. One-line-ish change (`career.ts:666`), and it makes all fifteen reads live. The moment a scouting report says *"he wants the fence — we drilled the underhook"* against a clinch fighter, the archetype becomes real. Style-vs-style texture is not something the read system lacks the machinery for; it is machinery that is only wired up on one side.

**E. If new attributes are added, each one needs an intent it uniquely gates.**
A `clinchStriking` attribute is only felt if it (i) opens the clinch to the fighter who *lost* the tie-up, (ii) drives its own commentary lines, and (iii) appears in the read list as a threat the AI will prepare for. An attribute that only shifts an existing contest's inputs is a tuning change wearing a costume.

**F. Give the fantasy a name the game will say back.**
The tendency profile already computes an identity; nothing surfaces it. A derived one-line read on the fighter profile — *"A kicker who fights long and does not want the fence"* — costs nothing, contradicts nothing (it is derived, per the doc's own "emergent-not-declared" principle, which is correct and should be kept), and is the only way the player ever hears the game acknowledge what they built.

---

# 4. The highest-value change for player experience

**Make the commentary read `tendencies`.** (`commentary.ts:78–128`, plus the `isKick` bug at `simulate.ts:790`.)

Not because it is the biggest system, but because **the engine already models more style than the player can see, and this is the only thing standing between them.** Everything in §2.7's table is a real, computed, per-fighter difference; today all of it is narrated by a uniform random draw. The distinctions the doc worries the engine *cannot* express are less costly than the ones it *does* express and then hides.

It is contained to one module that is architecturally forbidden from affecting outcomes, so it cannot move a single statistic in the balance suite — which makes it the only high-impact change here with no calibration risk at all.

Second-highest, and the one to do next: **split the striking training focus** (§3C). That is the change that stops the game deleting the player's chosen identity over the course of a career.

Note that neither is what a realism review will nominate — the realism answer is the clinch-striking attribute, and the doc is right that it is the cheapest *accuracy* win. But a clinch attribute added today would be narrated by the same hardcoded `"digs a knee"` line, would produce no new numbers on the result screen, would never be drilled against by an opponent, and would be trained away by the same bundled focus. It would be a more accurate simulation of a fight the player still cannot tell apart.
