# 18 — Styles and the fight engine

**Status:** description of the engine as it stands today, written as the input to a design
conversation about expanding it. Nothing here is a proposal. Where the engine cannot express
something, that is stated plainly rather than softened.

The question this document exists to answer: **how much of a martial art can the simulator
currently tell apart, and where exactly does the distinction get lost?**

---

## 1. The short answer

There is **no style, discipline, or background field on a fighter that the fight engine reads.**
A fighter is 15 attribute ratings, a trait list, and a game plan. Style is an *emergent property
of the ratios between those ratings* — a boxer is not flagged as a boxer, they are somebody whose
`strikingOffence` is far above their `kicking` and `wrestling`, and the simulator's weighting
maths then produces boxing-shaped behaviour without ever naming it.

That is a genuinely good design and it is why the engine feels responsive to attributes. It is
also the reason the discipline granularity is hard-capped: two arts that map to the same ratios
are, to the simulator, the same art.

---

## 2. What a fighter is, to the engine

### 2.1 The 15 attributes

```
Physical    power  speed  cardio  durability  strength
Striking    strikingOffence  kicking  strikingDefence
Grappling   wrestling  takedownDefence  groundControl  submissions  scrambling
Mental      fightIq  composure
```

Note the asymmetry, because it is the single most important fact in this document:
**striking has three attributes and grappling has five.** The grappling game is modelled with
roughly twice the resolution of the striking game.

### 2.2 Derived ratings

Composites the simulator uses directly, defined in `ratings/derived.ts`:

| Derived | Composition |
|---|---|
| `clinchOffence` | strength 0.45, wrestling 0.35, strikingOffence 0.20 |
| `clinchDefence` | strength 0.45, takedownDefence 0.40, strikingDefence 0.15 |
| `submissionDefence` | scrambling 0.40, submissions 0.30, fightIq 0.20, strength 0.10 |
| `groundAndPound` | groundControl 0.55, power 0.45 |
| `cageIq`, `finishingInstinct`, `chainWrestling` | — |

### 2.3 Traits

26 of them. They are **personality and durability flavoured**, not stylistic: `ironChin`,
`glassCannon`, `gunShy`, `cardioMachine`, `volumeMachine`, `headhunter`, `finisher`,
`weightCutGambler`, `frontrunner`, `dog`.

Exactly two touch technique at all — `headhunter` (raises `headKick`, suppresses `bodyWork`) and
`volumeMachine` (raises output). **There is no trait that says "Muay Thai", "southpaw",
"sprawl-and-brawl", or "judoka".**

### 2.4 Tendencies

`deriveTendencies()` turns attributes and traits into 15 propensities — what a fighter reaches
for. These are *not* success probabilities; landing is a separate contest.

```
leadHook  counterRight  calfKick  headKick  bodyWork  highVolume
singleLeg  doubleLeg  fenceClinch  bodyLock
guillotine  backTake  groundAndPound  guardPassing  wallGetUp
```

The load-bearing line inside it is `strikeLean`:

```
strikeLean = f( (strikingOffence + kicking)/2  −  (wrestling + groundControl)/2 )
```

A single scalar, striker ⟷ grappler. It shifts `leadHook`, `highVolume`, `singleLeg` and
`fenceClinch`. **This is the only axis of stylistic identity the engine computes.**

### 2.5 The game plan

Chosen per fight: an `approach`, a head/body/legs targeting split, and a short list of drilled
`reads` (specific things you prepared a counter for). Six approaches, each a table of multipliers:

| Approach | strike | kick | takedown | clinch | advance | submit |
|---|---|---|---|---|---|---|
| pressure | 1.25 | 0.9 | 0.8 | 1.1 | 1.1 | 0.9 |
| counter | 1.1 | 1.1 | 0.7 | 0.6 | 0.9 | 0.9 |
| wrestle | 0.7 | 0.5 | 2.0 | 1.3 | 1.2 | 1.0 |
| grind | 0.7 | 0.5 | 1.3 | 2.0 | 1.4 | 0.8 |
| pointFight | 1.1 | 1.1 | 1.0 | 0.8 | 0.8 | 0.6 |
| finish | 1.4 | 1.2 | 0.9 | 0.8 | 1.3 | 1.5 |

The plan is *tactics*, chosen fresh each bout. It is not identity — a boxer can pick `wrestle`
and will simply be bad at it.

---

## 3. How a fight actually runs

Position is the spine. Every resolution is conditioned on it.

```
distance  ⟷  clinch  ⟷  ground → guard → halfGuard → sideControl → mount → back
                                  (0.30    0.50        0.70        0.88    1.00 dominance)
```

### 3.1 At distance

Four intents, weighted and sampled:

```
strike   = strikingOffence × approach.strike   × exploit(strikingOffence vs their strikingDefence)
kick     = kicking         × approach.kick     × exploit(kicking vs their strikingDefence)
          × legImpairment
takedown = chainWrestling  × approach.takedown × exploit(wrestling vs their takedownDefence)
clinchUp = clinchOffence   × approach.clinch   × exploit(clinchOffence vs their clinchDefence)
```

Each term is fatigue-scaled per attribute.

**`exploitFactor` is the best idea in the engine.** A fighter leans into whatever their opponent
cannot deal with, gated by `fightIq` — a smart fighter finds the hole in round one, a dull one
never does, and it is deliberately weaker than a drilled game plan because noticing something
mid-fight is worth less than having prepared for it for eight weeks. Without it the simulator
produced elite strikers with no takedown defence being *out-struck* by wrestlers who never
thought to shoot.

### 3.2 In the clinch

Three intents: `takedown`, `clinchStrike`, `stall`.

```
takedown     = chainWrestling  × 1.2
clinchStrike = strikingOffence × 0.8
stall        = …
```

and if `clinchStrike` is chosen, it resolves as:

```
clinchOffence  vs  clinchDefence
   ↓                  ↓
strength 0.45      strength 0.45
wrestling 0.35     takedownDefence 0.40
strikingOffence 0.20   strikingDefence 0.15
```

**This is the single biggest gap.** Knees and elbows in the clinch — the defining phase of Muay
Thai — are resolved as a **strength and wrestling contest with a 20% striking garnish**.
`kicking` is not consulted at all. A Muay Thai specialist and a collegiate wrestler of equal
strength produce nearly identical clinch output.

### 3.3 On the ground

A five-rung dominance ladder with advance/sweep/stand-up/submission resolution. This part is
detailed and works: `groundControl` and `submissions` mean genuinely different things, and the
sub-position ladder is what makes them differ.

### 3.4 Everything else

Per-action fatigue (not per-second), damage by region (head/body/legs) with leg damage
suppressing mobility and body damage inflating fatigue, knockdown hazard against an *effective*
durability that erodes with tonight's damage plus career trauma, fouls, doctor stoppages,
10-point-must scoring.

---

## 4. What the engine can and cannot express

### 4.1 Genuinely distinguishable today

| Archetype | Expressed as | Comes out as |
|---|---|---|
| Boxer | high `strikingOffence` + `strikingDefence`, low `kicking` | leadHook, counterRight, bodyWork; picks `strike` over `kick` |
| Kickboxer / Muay Thai | high `kicking` + `strikingOffence` | headKick, calfKick |
| Karate / TKD | high `kicking` + `speed`, `counter` approach | headKick, counterRight, low volume |
| Wrestler | high `wrestling` + `strength` + `groundControl` | doubleLeg, fenceClinch, groundAndPound |
| BJJ | high `submissions` + `scrambling` | guillotine, backTake, guardPassing |
| Judo / Sambo | `wrestling` + `submissions` | bodyLock, backTake |

Six. Maybe seven if you count a pure grinder separately.

### 4.2 Not distinguishable, and why

| Cannot tell apart | Because |
|---|---|
| Muay Thai vs Dutch kickboxing | Clinch striking ignores `kicking` entirely and runs on strength/wrestling. No elbow or knee concept. |
| Karate vs Taekwondo | Both are "`kicking` + `speed`". No range-management or blitz concept. |
| Judo vs Sambo vs freestyle wrestling | All takedowns resolve through `chainWrestling`. `bodyLock`/`singleLeg`/`doubleLeg` are *tendencies* that feed the same contest. |
| Capoeira, Wushu, anything exotic | Nothing to attach them to. They would be a label over kicking. |
| Southpaw vs orthodox | No stance concept anywhere in the engine. |
| Head movement vs high guard vs footwork | One `strikingDefence` number for all defensive styles. |
| Pressure fighter vs out-fighter | Partly available via `approach`, but that is tactics per bout, not identity. |

### 4.3 The structural causes, ranked

1. **Striking has 3 attributes against grappling's 5.** Everything downstream inherits this.
2. **Clinch striking is not a striking skill.** It reads `clinchOffence`, which is 45% strength.
3. **No stance, no range, no defensive style.** Three real axes of striking identity, absent.
4. **Traits carry no technique.** The obvious extension point for flavour is unused.
5. **`strikeLean` is one scalar.** Identity is a single striker⟷grappler slider.

---

## 5. Notes for the expansion conversation

Things worth holding onto when this gets redesigned:

- **Emergent-not-declared is right.** Adding a `style: 'muayThai'` enum that the simulator
  branches on would be a step backwards — it would let a fighter's label contradict their
  numbers, and every scouting report would need separate authoring and would drift.
  New *attributes* and new *traits* keep the property that a scouting report is derived.
- **The engine is honest about what it does not know.** `exploitFactor`, the ground ladder and
  the read/counter system are all better than the striking model they sit next to. The gap is
  specific, not general.
- **The cheapest real win is a clinch-striking attribute**, because it converts the one phase
  where a whole major discipline currently has no expression.
- **Anything added has to survive the statistical suite.** New attributes shift finish rates,
  decision splits and title churn, and there are existing bounds on all three.
- **Character creation is the consumer.** The proposed origin system (talent tier → discipline →
  attainment) can only be as expressive as this layer. Six disciplines is what the engine
  currently supports honestly; more would be labels over identical numbers.
