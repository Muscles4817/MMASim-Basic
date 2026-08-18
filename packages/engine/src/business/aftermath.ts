/**
 * What a fight does to the people in it.
 *
 * Kept separate from the simulator on purpose: `simulateFight` says what happened, this
 * says what it *cost*. That split means a fight can be re-watched, previewed or
 * Monte-Carlo'd without anybody's career being affected.
 */

import { clamp, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { GameDay } from '../core/clock.js';
import type { DivisionId, PromotionId } from '../core/ids.js';
import type { Fighter, FightRecordEntry, FinishMethod } from '../domain/fighter.js';
import { careerSummary, isKoMethod } from '../domain/fighter.js';
import { lossImpactMultiplier, starPowerGrowthMultiplier } from '../domain/personality.js';
import { findTraitConflicts, traitMul, type TraitId } from '../domain/traits.js';
import type { Corner, FightResult } from '../fight/types.js';
import { exposureFrom } from '../health/injuries.js';
import { fightFreshnessCost, freshnessOf, withFreshness } from '../health/freshness.js';

export interface AftermathInput {
  result: FightResult;
  red: Fighter;
  blue: Fighter;
  day: GameDay;
  divisionId: DivisionId;
  promotionId: PromotionId;
  /**
   * The prestige of the promotion the fight happened at, 0–100.
   *
   * Reputation used to move by a flat `2 + opponent.reputation / 40` wherever the fight took
   * place, so twenty wins on the regional circuit built exactly as much standing as twenty wins
   * at the top of the sport. Since reputation is what the rankings and the market both read,
   * that is how a fighter arrived from a feeder promotion already carrying a contender's
   * standing. Optional so older callers keep working; they get the neutral middle.
   */
  promotionPrestige?: number;
  isTitleFight?: boolean;
  rng: Rng;
}

export interface AftermathOutput {
  red: Fighter;
  blue: Fighter;
  /** Human-readable notes for the post-fight screen: injuries, acquired traits, milestones. */
  notes: readonly string[];
}

/** Apply a fight's consequences to both fighters. Returns new objects; inputs are untouched. */
export function applyAftermath(input: AftermathInput): AftermathOutput {
  const { result, day, divisionId, promotionId, rng } = input;
  const notes: string[] = [];

  const apply = (fighter: Fighter, corner: Corner): Fighter => {
    const opponent = corner === 'red' ? input.blue : input.red;
    const damage = result.damage[corner];
    const won = result.winnerId === fighter.id;
    const drew = result.winnerId === undefined;

    const entry: FightRecordEntry = {
      boutId: result.boutId,
      opponentId: opponent.id,
      promotionId,
      day,
      outcome: drew ? 'draw' : won ? 'win' : 'loss',
      method: methodFor(result.method, drew),
      round: result.round,
      timeSeconds: result.timeSeconds,
      divisionId,
      wasTitleFight: input.isTitleFight ?? false,
    };

    const record = [...fighter.record, entry];

    // --- Condition ---------------------------------------------------------------------
    const trauma = clamp(
      fighter.condition.headTrauma + damage.traumaIncrement,
      0,
      100,
    );
    const bodyWear = clamp(
      fighter.condition.bodyWear + (damage.bodyDamage + damage.legDamage) * 0.06,
      0,
      100,
    );

    // Confidence moves on results, and how much depends on the person. A resilient fighter
    // shrugs off a bad night; a fragile one does not recover for a year.
    const swing = won ? 12 : drew ? 0 : -16 * lossImpactMultiplier(fighter.personality);
    const finishBonus = won && isKoMethod(result.method) ? 5 : 0;
    const confidence = clamp(fighter.condition.confidence + swing + finishBonus, 1, 100);

    /*
     * What the night took out of them, read off the same exposure the injury roll uses.
     *
     * One number for both is deliberate: a thirty-second submission where nothing landed costs
     * almost no injury risk *and* almost no freshness, and a three-round war costs a great deal of
     * each. `fatigue` next to it is the within-fight variable, reset because the fight is over —
     * the two are different things and doc 25 § 1.7 is about how easily that was missed.
     */
    const spent = fightFreshnessCost(exposureFrom(result, corner));

    const condition = {
      ...fighter.condition,
      headTrauma: trauma,
      bodyWear,
      confidence,
      fatigue: 0,
      ringRust: 0,
      freshness: withFreshness(freshnessOf(fighter) - spent),
    };

    // --- Acquired traits ---------------------------------------------------------------
    let traits = [...fighter.traits];

    // Gun-Shy: a bad knockout loss on a fighter without the resilience to shake it off.
    // The conflict check matters: Durable Mind means "came back exactly the same fighter"
    // and is declared mutually exclusive with Gun-Shy. Generation already refuses that pair;
    // without this check aftermath was creating it on nearly half of qualifying KO losses.
    if (
      damage.wasFinishedByStrikes &&
      !traits.includes('gunShy') &&
      findTraitConflicts([...traits, 'gunShy']).length === 0 &&
      fighter.personality.resilience < 55 &&
      rng.chance(0.45)
    ) {
      traits.push('gunShy');
      notes.push(`${fighter.lastName} did not look the same after that — the confidence is gone.`);
    }

    // Chinny: accumulated head trauma crossing a threshold. Permanent, and it should be.
    //
    // Both numbers here are load-bearing and were caught by the long-sim suite. A lower
    // threshold or a higher rate produces a runaway: chins go, knockouts rise, trauma
    // accrues faster, more chins go. Twenty years in, half the roster was Chinny and the
    // population KO rate had climbed past 70%.
    if (trauma >= 78 && !traits.includes('chinny') && rng.chance(0.1)) {
      traits = traits.filter((t) => t !== 'ironChin');
      traits.push('chinny');
      notes.push(`The years are showing on ${fighter.lastName}'s chin now. That does not come back.`);
    }

    // Gun-Shy fades with clean wins and real resilience.
    if (
      traits.includes('gunShy') &&
      won &&
      !damage.wasFinishedByStrikes &&
      fighter.personality.resilience > 60 &&
      rng.chance(0.4)
    ) {
      traits = traits.filter((t) => t !== 'gunShy');
      notes.push(`${fighter.lastName} looks like their old self again.`);
    }

    // --- Star power & reputation --------------------------------------------------------
    const performanceValue = won ? (isKoMethod(result.method) || result.method === 'submission' ? 9 : 5) : -3;
    const opponentValue = opponent.starPower / 25;
    // Gains compress as star power rises. Getting noticed is easy; going from famous to
    // iconic is not, and without this the long-sim suite showed active fighters ratcheting
    // to 100 and staying there while everyone else stayed where they started.
    // Asymptotic rather than merely compressed: the divisor is the scale maximum, so the
    // last few points cost enormously more than the first few and 100 is effectively
    // unreachable by grinding. At 0.08 the long-sim suite still parked fifteen fighters at
    // 99+, which makes the top of the scale meaningless.
    const headroom = won ? clamp(1 - fighter.starPower / 100, 0.02, 1) : 1;
    const starPower = clamp(
      fighter.starPower +
        (performanceValue + (won ? opponentValue : 0)) *
          headroom *
          starPowerGrowthMultiplier(fighter.personality) *
          traitMul(fighter.traits as TraitId[], 'starPowerGrowth'),
      1,
      100,
    );

    /*
     * Reputation tracks results and the level of opposition, and moves far more slowly than
     * star power — that gap is the whole point of having both numbers.
     *
     * Now scaled by where the win happened. A win at the biggest promotion in the sport is worth
     * roughly two and a half times one on the regional circuit, which is the difference between
     * reputation meaning "people who matter rate you" and meaning "you have had a lot of fights".
     * Losses are *not* discounted: losing at a small show hurts your standing every bit as much,
     * and arguably more.
     */
    const prestige = input.promotionPrestige ?? 50;
    const level = clamp(remap(prestige, 30, 95, 0.6, 1.5), 0.5, 1.5);
    const reputation = clamp(
      fighter.reputation + (won ? (2 + opponent.reputation / 40) * level : -3),
      1,
      100,
    );

    const updated: Fighter = {
      ...fighter,
      record,
      condition,
      traits,
      starPower,
      reputation,
    };

    return { ...updated, summary: careerSummary(updated) };
  };

  return { red: apply(input.red, 'red'), blue: apply(input.blue, 'blue'), notes };
}

/** The method as it appears on *this* fighter's record. Both corners record the same one. */
function methodFor(method: FinishMethod, drew: boolean): FinishMethod {
  if (drew) return method === 'noContest' ? 'noContest' : 'draw';
  return method;
}
