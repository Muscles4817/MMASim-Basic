# Reviews of doc 18 — styles and the fight engine

Four independent reviews of [`../18-styles-and-the-fight-engine.md`](../18-styles-and-the-fight-engine.md),
each given the doc plus the engine source and told to **verify the doc against the code rather than
trust it**. That instruction earned its keep: three of the doc's claims were wrong, and one of them
was the headline diagnosis.

| Review | Angle | File |
|---|---|---|
| Realism | Faithfulness to the real sport | [18a-realism.md](18a-realism.md) |
| Systems design | Attribute/trait/derived architecture and expansion cost | [18b-systems-design.md](18b-systems-design.md) |
| Expressiveness | Whether the player can perceive style at all | [18c-expressiveness.md](18c-expressiveness.md) |
| Adversarial | The case against expanding, with measurements | [18d-adversarial.md](18d-adversarial.md) |

## What I verified myself

Claims below were checked directly against the source rather than taken on the agents' word.
Everything else in these reports is the agent's own work and is **unverified**.

| Claim | Status |
|---|---|
| `stance` exists on `Fighter`, is generated/seeded/displayed, read by nothing in the engine | **Confirmed** |
| `tendencies` is read at exactly one line in the engine (`simulate.ts:588`, inside `prepBonus`) | **Confirmed** |
| `isKick` is absent from `rollFlushness`, `strikeDamage` and `knockdownHazard` | **Confirmed** |
| Every AI-vs-AI fight uses `defaultGamePlan()` (`world.ts:746-747`, `night.ts:176-177`) | **Confirmed** |
| `takedownRate` is a wired trait hook (`simulate.ts:935`) with no trait declaring it | **Confirmed** |
| `strikeLean` omits `submissions` and `scrambling` | **Confirmed** |
| The `striking` training focus bundles `strikingOffence`, `kicking`, `strikingDefence`, `speed` | **Confirmed** |
| `commentary.ts` contains zero references to `tendencies` | **Confirmed** |
| `strikeMissed` never receives `isKick`, so missed kicks are narrated as punches | **Confirmed** |
| `roster-profile.test.ts:61` counts `'decisionDraw'`, which is not a `FinishMethod` | **Confirmed** |
| Clinch produces ~0.67 landed strikes per fight | Agent's measurement, **not independently reproduced** |
| The 2026 roster profiles at 49.6% finish / 1.48:1 KO:sub | Agent's measurement, **not independently reproduced** |
| Training convergence figures (boxer and kickboxer indistinguishable within a career) | Mechanism confirmed; **specific figures not reproduced** |

## Corrections to doc 18

Three of mine, in descending order of consequence:

1. **"`deriveTendencies` is what a fighter reaches for"** — false. Tendencies drive no behaviour
   whatsoever. They are a *scoutability* axis: they scale the opponent's prepared-read bonus and
   nothing else.
2. **"The cheapest real win is a clinch-striking attribute"** — measured at 0.67 landed clinch
   strikes per fight, the clinch is the rarest branch in the engine. The real cause of Muay Thai
   and kickboxing collapsing together is that `isKick` never reaches the damage functions, so a
   head kick is a jab with a different noun.
3. **"No stance concept anywhere in the engine"** — stance exists, is generated, hand-authored in
   the seed roster, and printed on the fighter card. It has no *consumer*, which is a much cheaper
   problem than an absent concept.

Also: three traits touch technique, not two (`gunShy` was missed); and `Background` already was a
six-discipline enum consumed at generation, which is the precedent the origin system follows.

## Where the four converge

All four independently recommend **not** adding a new attribute yet, for four different reasons —
the player couldn't perceive it, the position model has nowhere to put it, the phase has no
stoppage path, and it is the most expensive change landing on the rarest branch.

All four agree a discipline enum must never reach fight resolution.

The strongest shared finding is that the engine already contains far more style machinery than it
uses: tendencies computed and ignored, game plans never given to the world, stance and reach seeded
and unread, `takedownRate` soldered in with no trait, `cageIq` displayed and dead, `strikesByTarget`
collected and never shown.
