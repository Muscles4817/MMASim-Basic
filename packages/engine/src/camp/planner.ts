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
import {
  convictionFor,
  entriesFor,
  type BottomIntent,
  type EntryStyle,
  type PreferredState,
  type SituationalRules,
  type TacticalPlan,
  type ClinchIntent,
  type TopIntent,
} from '../domain/tactics.js';
import { deriveTendencies, strikeLean } from '../fight/profile.js';
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
 * The fight this corner is trying to create, given who is in front of them.
 *
 * Replaces `pickApproach`, which chose one of seven labels and therefore had to answer four
 * questions with one cascade. What went wrong there is instructive and is why this function is
 * shaped the way it is: a fighter whose game was `submissions` and `scrambling` had no wrestling
 * edge and no clinch edge, fell through every branch to the striking arm, and was handed
 * `pointFight` — **the row whose `submit` weight was the lowest in the table.** The engine was
 * telling its most dangerous grappler to point-fight, and no amount of care in the cascade could
 * fix it, because the cascade was answering the wrong question.
 *
 * Four independent decisions now, each answered from the thing that actually decides it:
 *
 *  1. **Where** — the fighter's own best phase, gated on the opponent being reachable there.
 *  2. **How** — their route into it, from whether they wrestle in space or in the tie-up.
 *  3. **What, once there** — top and bottom intent, from their floor game rather than their plan.
 *  4. **What changes** — the contingencies, from personality.
 *
 * Deterministic, no rng: two identical matchups must produce two identical fights, which is what
 * the whole statistical tier rests on.
 */
function pickPreferredState(fighter: Fighter, opponent: Fighter): PreferredState {
  const a = fighter.attributes;
  const o = opponent.attributes;
  const mine = deriveRatings(a);
  const theirs = deriveRatings(o);

  /*
   * **The fighter's own game picks the phase; the opponent only decides which version they get.**
   *
   * The first cut of this function kept `pickApproach`'s shape — a cascade of *edges*, each
   * comparing one of the fighter's phases against the opponent's defence of it — and it
   * reproduced the exact defect that made the old model worth replacing. Measured: against the
   * wrestling exemplar, **the judo exemplar was handed `longRange` + `counter`**, because a
   * judoka's wrestling edge against 80 takedown defence is negative and his clinch edge did not
   * clear the striking branch's threshold, so he fell through to the striking arm. The engine was
   * telling a throwing specialist to kickbox, and jiu-jitsu against judo collapsed to 0.049 on
   * the styles fingerprint as a result — through the floor every pair in the game is held to.
   *
   * A cascade of edges cannot answer "what is this fighter" because every branch is really asking
   * "is this matchup favourable". So: rank the four phases against *this fighter's own average*,
   * then subtract what the opponent denies. A judoka whose best phase is the tie-up still wants
   * the tie-up against a good wrestler — he just wants it less, and only enough to change his
   * mind if something else is genuinely better.
   */
  const striking = Math.max(a.strikingOffence, a.kicking);
  const clinch = mine.clinchOffence;
  const top = (mine.chainWrestling + a.groundControl) / 2;
  const ground = (a.submissions + a.scrambling) / 2;
  const average = (striking + clinch + top + ground) / 4;

  // Denial is capped: a phase you are good at does not stop being your phase because the other
  // man defends it well, it just stops being free.
  const denied = (defence: number, offence: number) => clamp((defence - offence) / 2, 0, 12);

  const score = {
    striking: striking - average - denied(o.strikingDefence, striking),
    clinch: clinch - average - denied(theirs.clinchDefence, clinch),
    top: top - average - denied(o.takedownDefence, mine.chainWrestling),
    submission: ground - average - denied(o.scrambling, ground),
  };

  /*
   * The submission art needs a *margin*, not a ranking, because "my best phase is the floor" and
   * "I can finish people there" are different claims. Measured, a bare `>=` handed the judo
   * exemplar `submission` on an exact tie with its clinch score — sending a throwing specialist
   * to hunt off his back — and jiu-jitsu against judo read 0.049 on the styles fingerprint,
   * under the 0.05 floor every pair in the game is held to.
   */
  /*
   * **Every grappling branch has to beat the striking one by a margin, and that margin is the
   * whole correction.** With bare `>=` comparisons, ties and near-ties all fell into the
   * grappling arms and the shipped roster came out **65.7% clinch fighters** — two thirds of the
   * sport wanting to fight on the fence, which is not a sport anybody has watched. The cause is
   * that `clinchOffence` is derived from strength and wrestling, so it sits near a generic
   * fighter's own average and wins ties by default, while striking is the only phase the
   * opponent's defence reliably *denies*.
   *
   * Standing is the default a fighter has to be argued out of, because that is where MMA starts
   * and where most of it is spent.
   */
  const best = Math.max(score.striking, score.clinch, score.top);
  if (score.submission >= best + 1.5 && ground > 66) return 'submission';

  /*
   * **For a fighter who can hold people down, the clinch is a means and the floor is the end.**
   *
   * That is the whole of judo in this model, and it is why `top` takes the tie rather than
   * losing it: a judoka's clinch score beats his top score because grips are what he is best at,
   * but nobody works for an underhook in order to keep standing there. The version of him that
   * stops at the fence is a Muay Thai clinch fighter, and that is what the `groundControl` gate
   * separates — take the tie-up as an end only when there is nothing to do after it.
   */
  if (score.top >= score.striking - 1 && score.top >= score.clinch - 3 && a.groundControl > 55) {
    return 'top';
  }
  if (score.clinch >= score.striking + 5) return 'clinch';
  // A fighter whose game says floor but who cannot hold anybody there has picked the wrong plan;
  // the fence is the version of the same intent that does not require holding somebody down.
  if (score.top >= score.striking + 7) return 'clinch';

  /*
   * The standing split, which `approach` could not make at all: a rangy kicker and a pressure
   * boxer were both `pressure` or both `counter`, and the engine had one standing position, so
   * the two were the same fighter.
   *
   * Three answers now rather than two, and `boxing` is the honest middle rather than a fudge: a
   * fighter with good hands, no reach edge and nothing to hide from belongs where the hands work.
   * Reading `reachInches` here is the second place in the engine that field has ever been read —
   * `range.ts` is the first, and the one that gives it a contest.
   */
  const reachEdge = fighter.reachInches - opponent.reachInches;
  // Somebody who cannot afford to be hit stays where being hit is hardest, whatever else is true.
  if (a.durability < o.power - 6) return 'outside';
  if (a.kicking >= a.strikingOffence + 6 || reachEdge >= 4) return 'outside';
  // The pocket is for fighters built to be there: heavy hands, a chin, and the engine to hold it.
  if (a.power >= 66 && a.durability >= 62 && reachEdge <= 1) return 'pocket';
  return 'boxing';
}

/** Their route in. For a striker this is initiative; for a grappler it is space against grips. */
function pickEntry(fighter: Fighter, opponent: Fighter, state: PreferredState): EntryStyle {
  const a = fighter.attributes;
  const o = opponent.attributes;
  const allowed = entriesFor(state);

  if (!allowed.includes('lead')) {
    // Grappling entries. `wrestling` shoots in space; `strength` and the tie-up throw from grips.
    const derived = deriveRatings(fighter.attributes);
    /*
     * Grips against space, and the margin is zero on purpose.
     *
     * It was `+6`, and the judo exemplar missed it by four points — `clinchOffence` 78 against
     * `chainWrestling` 76 — so the throwing art was routed to `proactiveWrestling` and **shot
     * doubles all night**. Its clinch control share fell from 0.299 to 0.084 and the
     * wrestling/judo separation §13.7 bought went with it. A fighter who is *as good* from grips
     * as from space throws; needing to be six points better was an invented threshold that only
     * ever excluded the one art it was written for.
     */
    /*
     * The tie-up is a route for a wrestler and a judoka, and not for a guard player.
     *
     * `clinchOffence` is derived from strength and wrestling, so it reads high on plenty of
     * fighters whose game has nothing to do with grips — including the jiu-jitsu exemplar, which
     * was routed through `clinchEntries` and came out doing *more* fence work than the judoka.
     * That put jiu-jitsu against judo at 0.046 on the fingerprint, under the floor, with the two
     * arts separated by the wrong sign on the one axis that should tell them apart.
     */
    if (state !== 'submission' && derived.clinchOffence >= derived.chainWrestling) {
      /*
       * The throw is a wrestler's tool used from grips, not a submission player's. Gated on real
       * wrestling for that reason: without it the jiu-jitsu exemplar — whose clinch rating is
       * incidentally high because `clinchOffence` reads strength — was told to throw people, and
       * a guard player who leads with uchi-mata is not a fighter anybody has seen.
       */
      return a.wrestling > 70 ? 'tripsAndThrows' : 'clinchEntries';
    }
    // Shooting into a good takedown defence all night is how a wrestler loses a fight he should
    // win, so a corner facing one waits for the strike instead.
    if (o.takedownDefence > derived.chainWrestling + 8) return 'reactiveShot';
    return a.fightIq > 68 && a.speed < o.speed ? 'reactiveShot' : 'proactiveWrestling';
  }

  /*
   * Standing entries. The same reading `pickApproach` used to make, kept because it was right —
   * *including* the striking-edge clause, which a first cut of this function dropped.
   *
   * That clause is doing more work than it looks. `counter` is the only entry the fight engine
   * treats as a mechanic rather than a weight: `resolveStrikeExchange` scales a counter-fighter's
   * return burst by 0.9 against everybody else's 0.55, a 64% swing in counter volume. Handing it
   * to every quick, smart fighter instead of only to those who are *not* already the better
   * striker took the roster's first-round finishes from 32.7% to 34.8% and its knockouts-to-
   * submissions ratio from 1.57 to 2.60 — a visibly more explosive sport, from one dropped
   * conjunct in a function that was only supposed to be renaming things.
   */
  const strikingEdge = Math.max(a.strikingOffence, a.kicking) - o.strikingDefence;
  if (a.fightIq > 58 && a.speed >= o.speed && strikingEdge < 16) return 'counter';
  if (a.cardio > 70 && a.strikingOffence >= o.strikingDefence - 4) return 'pressure';
  return a.durability < o.power ? 'movement' : 'lead';
}

/** What they do on top, from their floor game rather than from their plan. */
function pickTopIntent(fighter: Fighter): TopIntent {
  const a = fighter.attributes;
  /*
   * Read against the fighter's own top game, not an absolute bar — the same correction
   * `pickBottomIntent` needed, found the same way. `submissions > 68` is rare enough on the
   * shipped roster that almost everybody was handed `control`, and since `topBias` suppresses
   * submissions hard for a controller, **the sport's submission rate fell from 19.6% to 16.1%
   * and its knockout-to-submission ratio rose from 1.51 to 2.18.** A default that quiet is a
   * design decision nobody made.
   */
  if (a.submissions > a.groundControl + 2) return 'submit';
  if (a.power + a.groundControl > 150) return 'groundAndPound';
  return a.groundControl > 68 ? 'advance' : 'control';
}

/**
 * And in a tie-up, read off the same three things the position is actually about.
 *
 * The order matters and is the same lesson `pickTopIntent` records: read against the fighter's own
 * game rather than an absolute bar, or one branch swallows the roster. A man whose wrestling is the
 * best thing he does in a tie-up uses it as a route down; a man whose strength and striking are
 * better than his wrestling hits from it; and the fighters left over are the ones who hold, which
 * after D15 is a real strategy rather than a way to pass the time.
 */
function pickClinchIntent(fighter: Fighter): ClinchIntent {
  const a = fighter.attributes;
  const clinchGame = (a.strength + a.wrestling) / 2;
  if (a.wrestling > clinchGame + 4) return 'takedown';
  if (a.strikingOffence + a.power > a.wrestling + a.strength + 8) return 'damage';
  return a.strength > 62 ? 'control' : 'takedown';
}

/**
 * What they do underneath — and this is the one the whole rework is for.
 *
 * A striker with no bottom game is told to get up, and now *does*, because `policy.ts` treats it
 * as an instruction rather than one weight among three. The threshold is deliberately generous:
 * being content on your back is a specialist's property, and most of the roster is not one.
 */
function pickBottomIntent(fighter: Fighter): BottomIntent {
  const a = fighter.attributes;
  const bottomGame = (a.submissions + a.scrambling) / 2;
  const topGame = (a.wrestling + a.groundControl) / 2;

  /*
   * Read relative to the fighter, never against a fixed number — and the first cut of this
   * function proves why. It asked `submissions > 58 && scrambling > 55`, which at exemplar level
   * is most of the roster, so **the boxing, kickboxing, karate and wrestling exemplars were all
   * told to play guard.** That is the player's original complaint, generated by the very
   * function meant to fix it: a striker on his back, content to stay there.
   *
   * `strikeLean` is the honest test, because it already knows the difference between a fighter
   * who owns a submission game and one who merely has the attribute.
   */
  if (strikeLean(fighter) > 0.55) return a.scrambling > 62 ? 'scramble' : 'standUp';
  if (a.submissions > 66 && a.submissions > topGame + 2) return 'attack';
  if (a.submissions > 56 && bottomGame > topGame + 2) return 'playGuard';
  if (a.scrambling > 62) return 'scramble';
  return a.scrambling < 45 && a.takedownDefence < 55 ? 'recover' : 'standUp';
}

/**
 * The contingencies, from personality rather than from ability.
 *
 * What a fighter does when the fight goes wrong is a question about who they are, and the game
 * already has the numbers: `aggression` decides whether being behind means more risk or more
 * output, `discipline` decides whether being ahead means coasting or holding the plan, and
 * `resilience` — the axis for how somebody handles adversity — decides whether being hurt means
 * tying up and surviving or swinging back out of it.
 */
function pickSituational(fighter: Fighter): SituationalRules {
  const p = fighter.personality;
  return {
    losingRound:
      p.aggression > 65 ? 'raiseRisk' : p.aggression > 45 ? 'raiseOutput' : 'holdThePlan',
    winningRound: p.discipline > 60 ? 'secureControl' : 'holdThePlan',
    badlyHurt: p.resilience > 62 ? 'survive' : p.aggression > 70 ? 'raiseRisk' : 'forceGrappling',
    opponentHurt: p.aggression > 55 ? 'huntFinish' : 'raiseOutput',
    finalMinute: p.discipline > 55 ? 'secureControl' : 'raiseOutput',
  };
}

function pickTactics(fighter: Fighter, opponent: Fighter): TacticalPlan {
  const preferredState = pickPreferredState(fighter, opponent);
  return {
    preferredState,
    entry: pickEntry(fighter, opponent, preferredState),
    topIntent: pickTopIntent(fighter),
    bottomIntent: pickBottomIntent(fighter),
    clinchIntent: pickClinchIntent(fighter),
    /*
     * Hunting the finish is a *characterisation*, not a default, and the threshold says so.
     *
     * `finishOpportunity` lifts the plan's suppression when the other man is hurt, so a corner
     * that hunts is a corner whose fighter piles on. Handing that to everyone above the roster's
     * median aggression pushed the sport's first-round finishes measurably up — the bound
     * `roster-profile.test.ts` calls the one closest to its limit. Above 78 it is the fighters
     * the trait is actually about.
     */
    finishing:
      fighter.personality.aggression > 78
        ? 'huntFinish'
        : fighter.personality.aggression > 55
          ? 'pressAdvantage'
          : 'disciplined',
    situational: pickSituational(fighter),
    /*
     * The world commits, but less than the player does.
     *
     * `convictionFor` is the plan's natural conviction; three quarters of it is what a corner
     * that has not met this opponent before brings. The extremes belong to the player, who is
     * choosing them against a named man with a scouting report in front of them — the same
     * reasoning `pickRisk` uses, and the same reason its band is narrow.
     */
    conviction: convictionFor(preferredState) * 0.75,
  };
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
    tactics: pickTactics(fighter, opponent),
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
