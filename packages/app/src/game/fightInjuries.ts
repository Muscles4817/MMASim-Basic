/**
 * What a fight left a fighter with.
 *
 * This lived inside `runBookedFight` as a local closure, which meant it applied to exactly two
 * people in the sport: the player and whoever they had just fought. `world.ts` never called
 * `rollInjury` at all — not for camps, not for bouts — so eight hundred professional fighters went
 * through entire careers of wars and knockouts without ever picking up so much as a cut. The
 * player was the only person in the world who could get hurt.
 *
 * That is the same shape of defect as the camp-development one doc 24 recorded: a rule written for
 * one side of the game and never applied to the other. So it is a shared function now, and both
 * callers get identical treatment.
 */

import {
  activeInjuries,
  aggravate,
  aggravationChance,
  concussionFor,
  exposureFrom,
  fightInjuryChance,
  rollInjury,
  type Corner,
  type Fighter,
  type Injury,
  type ReducedFightResult,
  type Rng,
} from '@mmasim/engine';

export interface FightInjuryOutcome {
  fighter: Fighter;
  /** Plain-language lines for the post-fight report. Empty when nothing happened. */
  notes: readonly string[];
}

/**
 * Settle one corner's injuries for a finished fight.
 *
 * Three things happen, in order, and the order matters. Anything carried in can be aggravated by
 * having competed on it. A knockout produces a concussion outright rather than by dice. And the
 * exposure roll then runs for everything else, excluding a concussion the fighter has just been
 * given so a single knockout cannot produce two.
 */
export function settleFightInjuries(input: {
  fighter: Fighter;
  result: ReducedFightResult;
  corner: Corner;
  day: number;
  rng: Rng;
}): FightInjuryOutcome {
  const { fighter, result, corner, day, rng } = input;
  const exposure = exposureFrom(result, corner);
  const notes: string[] = [];

  // Anything carried in can be made worse by competing on it.
  let injuries: Injury[] = (fighter.injuries ?? []).map((injury) => {
    if (!activeInjuries([injury], day).length) return injury;
    const taken = exposure.headDamage + exposure.bodyDamage + exposure.legDamage;
    if (!rng.chance(aggravationChance(injury, taken))) {
      return { ...injury, foughtThrough: true };
    }
    notes.push(
      `${fighter.lastName} came in carrying that ${injury.type} and made it considerably worse.`,
    );
    return aggravate(injury, day, rng);
  });

  // A knockout is a concussion, not a probability.
  const lost = result.winnerId !== undefined && result.winnerId !== fighter.id;
  const concussion = concussionFor({
    fighter,
    method: result.method,
    lost,
    exposure,
    day,
    rng: rng.fork('concussion'),
  });
  if (concussion) {
    injuries = [...injuries, concussion];
    notes.push(`${fighter.lastName} was concussed and is suspended on medical grounds.`);
  }

  if (rng.chance(fightInjuryChance(fighter, exposure, day))) {
    const fresh = rollInjury({
      fighter,
      source: 'fight',
      day,
      rng: rng.fork(fighter.id as string),
      history: injuries,
      exposure,
    });
    // Not a second head injury on the same night. One knockout is one concussion.
    if (!(concussion && fresh.type === 'concussion')) {
      injuries = [...injuries, fresh];
      notes.push(`${fighter.lastName} leaves with a ${fresh.type} injury.`);
    }
  }

  return { fighter: { ...fighter, injuries }, notes };
}
