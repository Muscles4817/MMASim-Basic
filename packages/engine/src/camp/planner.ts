/**
 * The plan a fighter's corner brings to a fight.
 *
 * Every fight in the game used to run on `defaultGamePlan()` — one approach, one targeting split,
 * `riskLevel` 0.5, no prepped reads — for both corners, in every bout the world simulated and
 * every bout on the player's card except the player's own. A version of this function lived in the
 * app and was called once per card, for the player's opponent (docs/19 §11).
 *
 * That single default is what made the fight engine flat. Measured (docs/19 §10): with the shipped
 * default, **no pair of the six disciplines meets the G1 separation target on two axes; with one
 * approach per art, three do** — the game plan is worth more style expression than the weapon
 * primitive, the targeting rewrite and the trait work put together, because `approachWeight` is a
 * table with a factor of three across it and the whole roster was reading the same row.
 *
 * Three rules, and the second is the one that makes this a *plan* rather than a fingerprint:
 *
 *  1. **The fighter's own game decides the approach they want.** A wrestler wants it on the floor.
 *  2. **The opponent decides which version of it they get.** A wrestler across from 90 takedown
 *     defence does not shoot into it all night; a corner that ignores the other man is not a camp.
 *  3. **The reads come from what the opponent actually does**, which is `deriveTendencies`, not
 *     from their attributes. Those are different numbers — traits, `fightIq` and `strikeLean` sit
 *     between the two — and `prepValue` is gated on the tendency, so a read chosen off an attribute
 *     can be drilled all camp against a threat the man does not carry.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Fighter } from '../domain/fighter.js';
import type { GamePlan, ReadKey } from '../domain/gameplan.js';
import { MAX_PREPPED_READS, READ_KEYS, normaliseTargeting } from '../domain/gameplan.js';
import { deriveTendencies } from '../fight/profile.js';
import { deriveRatings } from '../ratings/derived.js';

/**
 * How many reads a camp drills.
 *
 * Three of the four `MAX_PREPPED_READS` allows, so a real camp is not automatically at the
 * ceiling: the fourth slot is what a *good* camp buys, and the player's is the one with a coach
 * attached. This is also the number docs/19 §11d re-asks with a measurement.
 */
const AI_READS = 3;

/**
 * How sure a corner is, and how well they drilled it.
 *
 * Fixed rather than derived, and it is the honest gap in this function: drill quality should come
 * off the fighter's gym and head coach, which are business-layer facts the engine deliberately
 * cannot see. Recorded here rather than faked from ratings.
 */
const AI_DRILL_QUALITY = 0.7;
const AI_CONFIDENCE = 0.7;
const AI_CAMP_QUALITY = 0.7;

/**
 * Where this fighter wants the fight, given who is in front of them.
 *
 * Reads the *derived* grappling ratings rather than raw `wrestling`, so the chain wrestler and the
 * fighter who merely has the attribute are told apart, and gates the grappling approaches on being
 * able to do something once they arrive — a fighter who takes people down and cannot hold them
 * there has picked the wrong plan, which the engine will then punish them for.
 */
function pickApproach(fighter: Fighter, opponent: Fighter): GamePlan['approach'] {
  const a = fighter.attributes;
  const o = opponent.attributes;
  const derived = deriveRatings(a);

  const wrestlingEdge = derived.chainWrestling - o.takedownDefence;
  const strikingEdge = Math.max(a.strikingOffence, a.kicking) - o.strikingDefence;
  const clinchEdge = derived.clinchOffence - deriveRatings(o).clinchDefence;

  // Grappling first, because a takedown ends the striking exchange and the reverse is not true.
  if (wrestlingEdge > strikingEdge + 6) {
    // A fighter better in the tie-up than on the shot is told to work there. Before this, every
    // grappler in the game was sent to `wrestle` and judo and wrestling were handed identical
    // plans — which is half of why the fingerprint could not tell them apart (docs/19 §13.6).
    if (clinchEdge > wrestlingEdge) return 'grind';
    // `wrestle` means "put them down and keep them there", so it is gated on being able to do
    // something once you arrive. The gate was 68/72 in the first cut and handed 2% of the roster
    // the approach — a table row nobody reads is the defect this whole phase is about.
    return a.groundControl > 60 || a.submissions > 66 ? 'wrestle' : 'grind';
  }
  if (clinchEdge > strikingEdge + 10) return 'grind';

  // Striking, and the order matters: a fighter who is quicker and sharper than the man in front of
  // them counters rather than pressing, even when they could press. `counter` was behind the
  // `pressure` gate in the first cut and 0.5% of the roster ever saw it, which quietly denied the
  // karate origin the one approach it was designed around (docs/19 §0 F1).
  if (a.fightIq > 58 && a.speed >= o.speed && strikingEdge < 16) return 'counter';
  if (strikingEdge > 8) return 'pressure';
  return a.durability > o.power + 8 ? 'pressure' : 'pointFight';
}

/**
 * Where this fighter aims, given what they own and what the other man cannot afford.
 *
 * The corner's half of a decision the fighter also has a say in: `pickTarget` bends this split by
 * the fighter's own habits at resolution time (docs/19 §8b), so what is expressed here is the
 * instruction rather than the behaviour. Legs against anybody who needs a base, body against
 * anybody with a tank, and neither if the fighter cannot kick — telling a boxer to chop the legs
 * is a plan that gets your fighter hurt.
 */
function pickTargeting(fighter: Fighter, opponent: Fighter): GamePlan['targeting'] {
  const a = fighter.attributes;
  const o = opponent.attributes;

  const canKick = clamp01(remap(a.kicking, 45, 85, 0, 1));
  const needsBase = clamp01(remap(o.wrestling, 55, 85, 0, 1));
  const hasTank = clamp01(remap(o.cardio, 65, 90, 0, 1));

  return normaliseTargeting({
    head: 0.6,
    body: 0.22 + 0.18 * hasTank,
    legs: 0.06 + 0.3 * canKick * (0.45 + 0.55 * needsBase),
  });
}

/**
 * How much they let go.
 *
 * Aggression sets it and discipline pulls it back toward the corner's instruction, which is the
 * same pair `gamePlanAdherence` reads — a reckless fighter with a disciplined head is a fighter
 * who fights recklessly *on purpose*. Kept inside a band on purpose: the extremes belong to the
 * player, who is choosing them, and `risk.test.ts` measures recklessness as mildly correct at even
 * money, so handing the whole world 0.95 would be a silent buff to everybody.
 */
function pickRisk(fighter: Fighter): number {
  const p = fighter.personality;
  const raw = (p.aggression - p.discipline) / 100;
  return clamp(0.5 + raw * 0.3, 0.3, 0.7);
}

/**
 * What an average fighter's tendency for each read looks like, as a shape rather than a level.
 *
 * `pickReads` divides by this, and the first cut of that function did not — which produced a
 * corner that drilled `wallGetUp`, `guardPassing` and `backTake` against **every opponent in the
 * game**, because those three formulas simply return the largest numbers. Ranking raw tendencies
 * ranks the formulas, not the fighter: the same defect the targeting habit vector hit in docs/19
 * §8b, in a second system, found the same way — by looking at what the thing actually chose.
 *
 * Measured over both shipped rosters, each read's mean divided by the mean across all fifteen:
 *
 * ```
 *                  2020   2026            2020   2026
 * leadHook         1.03   0.93   bodyLock         1.04   1.17
 * counterRight     0.98   0.66   guillotine       0.74   0.85
 * calfKick         0.89   0.69   backTake         1.10   1.21
 * headKick         1.03   1.07   groundAndPound   1.18   1.34
 * bodyWork         1.11   1.03   guardPassing     1.15   1.22
 * highVolume       0.68   0.71   wallGetUp        1.22   1.21
 * singleLeg        0.82   0.86   fenceClinch      0.99   1.12
 * ```
 *
 * The two rosters disagree most on `counterRight` and `calfKick`, both of which read `fightIq` and
 * are therefore sensitive to the 2026 roster's depth being less capable. The midpoint is used.
 */
const NEUTRAL_TENDENCY: Readonly<Record<ReadKey, number>> = {
  leadHook: 0.98,
  counterRight: 0.82,
  calfKick: 0.79,
  headKick: 1.05,
  bodyWork: 1.07,
  highVolume: 0.69,
  singleLeg: 0.84,
  doubleLeg: 0.98,
  fenceClinch: 1.06,
  bodyLock: 1.11,
  guillotine: 0.8,
  backTake: 1.16,
  groundAndPound: 1.26,
  guardPassing: 1.19,
  wallGetUp: 1.21,
};

/**
 * What to drill, from what the opponent actually does more than other people do it.
 *
 * Two decisions, and both were wrong in an earlier version of this code:
 *
 * **Tendencies, not attributes.** `prepValue` gates the camp's payoff on the opponent's *tendency*
 * for the read, so a read chosen off a rating — `wrestling > 65`, as the app's version did — drills
 * the threat a number implies rather than the one the fighter carries. They come apart exactly
 * where the interesting fighters are: a 92-`submissions` guard player reads as a takedown threat by
 * attribute and as a strangle threat by tendency.
 *
 * **Relative, not absolute.** What a corner wants is what this man does *unusually*, which is his
 * tendency against the roster's. Absolute ranking hands everybody the same three reads.
 */
function pickReads(opponent: Fighter, count: number): ReadKey[] {
  const tendencies = deriveTendencies(opponent);
  const standout = (key: ReadKey) => tendencies[key] / NEUTRAL_TENDENCY[key];
  return [...READ_KEYS]
    .sort((x, y) => standout(y) - standout(x))
    .slice(0, Math.min(count, MAX_PREPPED_READS));
}

/**
 * A plan for a fighter the player is not controlling.
 *
 * Deterministic — no rng — because two identical matchups must produce two identical fights, which
 * is what the whole statistical tier rests on.
 */
export function planFor(fighter: Fighter, opponent: Fighter): GamePlan {
  return {
    approach: pickApproach(fighter, opponent),
    targeting: pickTargeting(fighter, opponent),
    riskLevel: pickRisk(fighter),
    campQuality: AI_CAMP_QUALITY,
    preppedReads: pickReads(opponent, AI_READS).map((read) => ({
      read,
      drillQuality: AI_DRILL_QUALITY,
      confidence: AI_CONFIDENCE,
    })),
  };
}
