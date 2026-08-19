/**
 * Fights fall apart, and until now they only fell apart for promoters.
 *
 * `pullOutRisk` has existed since the bout-agreement layer was written — a properly built model
 * scaling a 5.5% base by body wear, discipline and cut risk — and the promoter's card planner was
 * its only caller. So in promoter mode a card lost a fighter roughly one bout in eight, exactly as
 * the sport does, and in fighter mode **every booked fight happened, always**. The single most
 * recurring disappointment in the sport was unreachable by the person playing it.
 *
 * The other half of the fix is that opponents can now actually be injured (see
 * `fightInjuries.ts`), which means the commonest real cause of a withdrawal is no longer a
 * fiction the roll has to invent: a fighter carrying a knee that will not heal before fight day
 * pulls out *because of the knee*, and it is the same knee the scouting report could have told
 * you about.
 */

import type { GameDb } from '@mmasim/data';
import {
  FIGHT_THROUGH_WEEKS,
  campInjuryChance,
  describePullOut,
  pullOutRisk,
  rollInjury,
  weeksUntilFit,
  type Fighter,
  type GameDay,
  type Injury,
  type PullOut,
  type PullOutReason,
  type Rng,
} from '@mmasim/engine';
import type { Booking } from './career';

/**
 * How much healing left a fighter will still go through with it.
 *
 * Moved into the engine, and re-exported here so the callers that named it through this module
 * keep working. It moved because the *world* has to hold its own fighters to the same rule: as an
 * app-layer constant only the player's bout ever consulted it, so eight hundred professionals were
 * matched while carrying knees that would not heal for a year — and every one of those bouts ran
 * `aggravate` on the knee. See `canFightOn` and `AGGRAVATION_CEILING`.
 *
 * The sweep behind the number, retained because it is the justification for it. `pullOutRisk`
 * states the sport's rate as "around one bout in eight losing a fighter", and measured across
 * eight full careers with both corners able to withdraw:
 *
 *   3 weeks -> 20.6% of booked bouts collapse, 1 in 4.9
 *   5 weeks -> 18.3%, 1 in 5.5
 *   6 weeks -> 16.8%, 1 in 5.9
 *   8 weeks -> 12.0%, 1 in 8.3   <- the documented target
 */
export { FIGHT_THROUGH_WEEKS };

/**
 * Whether the player's opponent is still going to be there.
 *
 * Two independent routes, checked in order because they answer different questions.
 *
 * An opponent carrying an injury that will not have healed by fight day withdraws outright rather
 * than probabilistically — that is not bad luck, it is a fact about their leg. Everything else
 * goes through `pullOutRisk`, which covers the illness, the missed weight and the personal
 * disaster that a simulation cannot see coming and neither can the player.
 */
/**
 * What the player's own fight camp did to them.
 *
 * `runTraining` has rolled `campInjuryChance` since camps existed, but the camp inside
 * `runBookedFight` — the one that runs before every single fight the player takes, and therefore
 * the majority of all the training they ever do — rolled nothing. So a player who never opened the
 * training screen was immune to camp injury, which is both the wrong incentive and the last
 * survivor of the family of asymmetries doc 24 started pulling on.
 *
 * Returns the injury and whether it is bad enough to take the fight with it.
 */
export function playerCampInjury(input: {
  fighter: Fighter;
  weeks: number;
  /** `INTENSITY_META[i].injury`, so a hard camp hurts people more often than a light one. */
  intensity?: number;
  day: GameDay;
  rng: Rng;
}): { injury: Injury; withdraws: boolean } | undefined {
  const { fighter, weeks, day, rng } = input;
  if (!rng.chance(campInjuryChance(fighter, weeks, day, input.intensity ?? 1))) return undefined;

  const injury = rollInjury({
    fighter,
    source: 'camp',
    day,
    rng: rng.fork('type'),
    history: fighter.injuries ?? [],
  });

  /*
   * Whether it takes the fight with it.
   *
   * Same threshold the opponent is held to, because a rule that lets the world fight hurt and
   * makes the player withdraw — or the reverse — is the asymmetry this whole change is about.
   */
  return { injury, withdraws: weeksUntilFit([injury], day) > FIGHT_THROUGH_WEEKS };
}

export function opponentWithdrawal(input: {
  db: GameDb;
  booking: Booking;
  rng: Rng;
}): PullOut | undefined {
  const { db, booking, rng } = input;
  const opponent = db.fighters.findById(booking.opponentId) as Fighter | undefined;
  if (!opponent) return undefined;

  const fightDay = booking.bout.day;
  const off = (reason: PullOutReason): PullOut => ({
    fighterId: opponent.id,
    boutId: booking.bout.id,
    reason,
    note: describePullOut(reason, opponent),
  });

  /*
   * Carrying something that will still be badly there on the night.
   *
   * Deliberately *not* "any active injury". The first version of this withdrew on anything
   * unhealed, and measured across six careers that produced 17 injury withdrawals in 123 booked
   * bouts — but worse than the rate, it quietly deleted the best thing in the health model.
   * Fighters carrying something into the cage is already modelled properly: `aggravationChance`,
   * `foughtThrough`, and `injuredAttributes` giving them their real numbers rather than their
   * card, with nobody told. Withdrawing on a two-week cut means no opponent ever fights hurt, and
   * the player never gets the fight that goes strangely for reasons they cannot see.
   *
   * So the line is drawn at what a fighter would actually pull out for — see
   * `FIGHT_THROUGH_WEEKS`, which is swept against the sport's own withdrawal rate.
   */
  if (weeksUntilFit(opponent.injuries ?? [], fightDay) > FIGHT_THROUGH_WEEKS) return off('injury');

  if (!rng.chance(pullOutRisk(opponent))) return undefined;

  /*
   * Which of the remaining causes it was.
   *
   * Injury is deliberately still on this list even though the branch above handles the *known*
   * ones: most camp injuries in the sport happen to fighters nobody was tracking, and a withdrawal
   * the player could have predicted from a scouting report is a different event from one they
   * could not.
   */
  return off(
    rng.pickWeighted(
      ['injury', 'illness', 'weight', 'personal'] as const,
      (reason) => ({ injury: 5, illness: 2, weight: 2, personal: 1 })[reason],
    ),
  );
}
