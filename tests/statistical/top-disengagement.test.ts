/**
 * A fighter on top who would rather be standing.
 *
 * Until D2 there was no way out of top position that the fighter chose. A striker who landed a
 * counter-takedown, or inherited one off a failed shot, was made to play top-position MMA until his
 * opponent got up, the referee intervened or the round ended — and his corner had no say in any of
 * those. That is invariant 1 with a hole in it: the plan could ask for the fight to be standing
 * everywhere except the one place the fighter was in a position to do something about it.
 *
 * `standUpFromTop` closes it, and the whole of this file is about closing it *without* making top
 * position a revolving door. Two things have to be true at once and they pull in opposite
 * directions: a man who wants the fight standing must be able to get it, and a wrestler who fought
 * for the position must not start losing it because a new option appeared on the list.
 *
 * **On what is asserted where.** docs/01 forbids inferring a tactical preference from a clock
 * share or the reverse. Attempt rates and decision shares carry every claim about what a fighter
 * *tries*; time on top is used only for the one claim the mechanism genuinely links — a landed exit
 * ends the position, so choosing the exit more often does mean less top time — and that link is
 * named at the assertion rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  simulateFight,
  type Fighter,
  type GamePlan,
  type GroundPosition,
  type TacticalPlan,
} from '@mmasim/engine';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import { stanceOf } from '../../packages/engine/src/fight/policy.js';
import { actionShares } from '../../packages/engine/src/fight/decide.js';
import { topCandidates } from '../../packages/engine/src/fight/simulate.js';
import { disengageRange } from '../../packages/engine/src/fight/range.js';
import { GROUND_DOMINANCE } from '../../packages/engine/src/fight/types.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.9, ...t },
});

/** Wants the fight standing. Ends up on top anyway, because fights do that. */
const STANDING = plan({ preferredState: 'outside', entry: 'reactiveShot', topIntent: 'groundAndPound', bottomIntent: 'defend' });
/** Fought for top position and means to keep it. */
const GROUND = plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control', bottomIntent: 'defend' });
/** The man underneath, in every matchup below: he wants the fight exactly where it is. */
const OFF_HIS_BACK = plan({ preferredState: 'submission', entry: 'reactiveShot', topIntent: 'submit', bottomIntent: 'attack' });

const striker = (over: Partial<Fighter['attributes']> = {}): Fighter =>
  makeFighter({
    id: `f_str_${JSON.stringify(over)}`,
    lastName: 'Striker',
    attributes: {
      strikingOffence: 84, kicking: 80, strikingDefence: 78, power: 80, speed: 78,
      wrestling: 46, takedownDefence: 50, groundControl: 35, submissions: 32, scrambling: 55,
      cardio: 70, strength: 60, durability: 70, fightIq: 70, composure: 70,
      ...over,
    },
  });

const wrestler = makeFighter({
  id: 'f_wrestler', lastName: 'Wrestler',
  attributes: {
    strikingOffence: 58, kicking: 50, strikingDefence: 60, power: 60, speed: 62,
    wrestling: 84, takedownDefence: 80, groundControl: 82, submissions: 60, scrambling: 72,
    cardio: 76, strength: 74, durability: 72, fightIq: 68, composure: 68,
  },
});

const guardPlayer = (over: Partial<Fighter['attributes']> = {}): Fighter =>
  makeFighter({
    id: `f_guard_${JSON.stringify(over)}`, lastName: 'Guard',
    attributes: {
      strikingOffence: 55, kicking: 52, strikingDefence: 58, power: 52, speed: 60,
      wrestling: 55, takedownDefence: 45, groundControl: 60, submissions: 86, scrambling: 74,
      cardio: 72, strength: 58, durability: 68, fightIq: 72, composure: 74,
      ...over,
    },
  });

const FIGHTS = 2000;

interface Measured {
  /** Voluntary exits gone for, per minute actually spent on top. The intent axis. */
  attemptsPerTopMinute: number;
  /** Of those, the share that came off. The capability axis. */
  successRate: number;
  /** How many attempts that share was measured over. */
  attempts: number;
  /** Share of the fight spent in top position. */
  topShare: number;
  /** Seconds of top position per top-position beat. The clock-charging axis. */
  secondsPerBeat: number;
  /** Referee restarts per top-position beat. */
  refStandUpsPerBeat: number;
  /** Productive top-position output, per minute on top. */
  groundStrikesPerTopMinute: number;
  advancesPerTopMinute: number;
  submissionsPerTopMinute: number;
}

function measure(label: string, top: { fighter: Fighter; plan: GamePlan }, bottom: Fighter, salt = ''): Measured {
  let topSeconds = 0;
  let fightSeconds = 0;
  let attempted = 0;
  let landed = 0;
  let beats = 0;
  let refStandUps = 0;
  let advances = 0;
  let groundStrikes = 0;
  let submissions = 0;

  for (let i = 0; i < FIGHTS; i++) {
    const r = simulateFight({
      boutId: `topexit:${label}:${i}`,
      red: { fighter: top.fighter, plan: top.plan },
      blue: { fighter: bottom, plan: OFF_HIS_BACK },
      rounds: 3,
      seed: `topexit${salt}:${label}:${i}`,
    });
    const red = r.stats.red;
    topSeconds += red.controlSeconds - red.clinchControlSeconds;
    fightSeconds += (r.round - 1) * 300 + r.timeSeconds;
    attempted += red.topExitsAttempted;
    landed += red.topExitsLanded;
    beats += red.topBeats;
    submissions += red.submissionAttempts;
    for (const e of r.events) {
      if (e.kind === 'refStandUp') refStandUps++;
      else if (e.corner !== 'red') continue;
      else if (e.kind === 'positionAdvance') advances++;
      else if (e.kind === 'groundStrikes') groundStrikes++;
    }
  }

  const topMinutes = topSeconds / 60;
  return {
    attemptsPerTopMinute: attempted / topMinutes,
    successRate: attempted > 0 ? landed / attempted : 0,
    attempts: attempted,
    topShare: topSeconds / fightSeconds,
    secondsPerBeat: topSeconds / beats,
    refStandUpsPerBeat: refStandUps / beats,
    groundStrikesPerTopMinute: groundStrikes / topMinutes,
    advancesPerTopMinute: advances / topMinutes,
    submissionsPerTopMinute: submissions / topMinutes,
  };
}

/** The decision itself, with no fight attached. */
function topShares(f: Fighter, tactics: Partial<TacticalPlan>, position: GroundPosition = 'guard') {
  const a = createCombatant('red', f, plan(tactics));
  const b = createCombatant('blue', guardPlayer(), OFF_HIS_BACK);
  return actionShares(
    topCandidates(a, b, stanceOf(a, undefined, false), GROUND_DOMINANCE[position], 0.15),
  );
}

/* ------------------------------------------------------------------------------------------- */

const standing = measure('standing', { fighter: striker(), plan: STANDING }, guardPlayer());
const ground = measure('ground', { fighter: striker(), plan: GROUND }, guardPlayer());

describe('the plan decides how often he tries to stand back up', () => {
  const message =
    `standing plan ${standing.attemptsPerTopMinute.toFixed(2)} att/top-min against ` +
    `ground plan ${ground.attemptsPerTopMinute.toFixed(2)}`;

  it('separates a strike-oriented corner from a ground-oriented one, same fighter', () => {
    /*
     * The headline. One man, one set of attributes, two instructions: 0.54 attempts per minute of
     * top position against 0.08. Before D2 both numbers were zero and the distinction did not
     * exist.
     */
    expect(standing.attemptsPerTopMinute, message).toBeGreaterThan(ground.attemptsPerTopMinute * 3);
  });

  it('and does it in the decision, not just in the outcome', () => {
    // Same claim one layer down, where nothing but the plan can be responsible for it.
    const wantsUp = topShares(striker(), { preferredState: 'outside', topIntent: 'groundAndPound' });
    const wantsToStay = topShares(striker(), { preferredState: 'top', topIntent: 'control' });
    const m = `${(wantsUp.standUpFromTop * 100).toFixed(1)}% against ${(wantsToStay.standUpFromTop * 100).toFixed(1)}%`;
    expect(wantsUp.standUpFromTop, m).toBeGreaterThan(wantsToStay.standUpFromTop * 5);
  });

  it('leaves the striker a way off the floor that is his own decision', () => {
    /*
     * The defect D2 exists for, stated as the number that was previously unobtainable: a striker
     * who wants the fight standing goes for the exit about once every two minutes of top position
     * and lands roughly a third of them. He is no longer waiting on the referee or on his
     * opponent.
     */
    expect(standing.attemptsPerTopMinute, message).toBeGreaterThan(0.4);
    expect(standing.successRate).toBeGreaterThan(0.15);
  });

  it('costs him top position, which is the one clock claim the mechanism licenses', () => {
    /*
     * Allowed here and nowhere else in the file: every landed exit *ends* top position, so the
     * action share converts directly into a time share. This is the exception docs/01 names when
     * it forbids reading intent off the clock.
     */
    const m = `${(standing.topShare * 100).toFixed(1)}% of the fight against ${(ground.topShare * 100).toFixed(1)}%`;
    expect(standing.topShare, m).toBeLessThan(ground.topShare * 0.5);
  });
});

describe('his attributes decide whether it works', () => {
  const weak = measure('weak', { fighter: striker({ scrambling: 25 }), plan: STANDING }, guardPlayer());
  const strong = measure('strong', { fighter: striker({ scrambling: 85 }), plan: STANDING }, guardPlayer());
  const message =
    `25 scrambling: ${weak.attemptsPerTopMinute.toFixed(2)} att/top-min at ${(weak.successRate * 100).toFixed(1)}% | ` +
    `85: ${strong.attemptsPerTopMinute.toFixed(2)} at ${(strong.successRate * 100).toFixed(1)}%`;

  it('barely changes how often he goes for it', () => {
    /*
     * Invariant 1a. `scrambling` spans 6.8:1 across the roster and an undamped capability term
     * handed all of that to the *decision* — 7.8% of top beats at 15 scrambling against 36.5% at
     * 95, on identical instructions, against the twelve-fold span the plan is supposed to own.
     * Damped to an exponent of 0.25 it spans about 1.5:1 in the attempt rate, which is the honest
     * residual: a man who knows he can get up is somewhat readier to try.
     */
    expect(strong.attemptsPerTopMinute, message).toBeLessThan(weak.attemptsPerTopMinute * 1.6);
  });

  it('and decides whether he gets there', () => {
    expect(strong.successRate, message).toBeGreaterThan(weak.successRate * 1.5);
  });
});

describe('and so does the man underneath', () => {
  const looseFoe = measure('loose', { fighter: striker(), plan: STANDING }, guardPlayer({ scrambling: 25 }));
  const stickyFoe = measure('sticky', { fighter: striker(), plan: STANDING }, guardPlayer({ scrambling: 85 }));
  const message =
    `foe 25: ${looseFoe.attemptsPerTopMinute.toFixed(2)} att/top-min at ${(looseFoe.successRate * 100).toFixed(1)}% | ` +
    `foe 85: ${stickyFoe.attemptsPerTopMinute.toFixed(2)} at ${(stickyFoe.successRate * 100).toFixed(1)}% ` +
    `(n=${looseFoe.attempts}/${stickyFoe.attempts})`;

  it('without the opponent touching how often he tries', () => {
    /*
     * The cleanest form of the invariant in the whole file: nothing about the other man reaches
     * the decision at all, so the two attempt rates differ only by sampling — 0.56 against 0.53,
     * and if anything the wrong way round.
     */
    const ratio = stickyFoe.attemptsPerTopMinute / looseFoe.attemptsPerTopMinute;
    expect(ratio, message).toBeGreaterThan(0.85);
    expect(ratio, message).toBeLessThan(1.15);
  });

  it('while deciding almost entirely whether it opens', () => {
    /*
     * 53% against 28%: guard retention is the other half of the contest. The bound is 1.4 rather
     * than the measured 1.9 because this is the thinnest sample in the file — a striker on a
     * standing plan is only on top for about twenty seconds a fight, so a few hundred attempts is
     * all six salts produce, and one of them came in at 1.40.
     */
    expect(looseFoe.successRate, message).toBeGreaterThan(stickyFoe.successRate * 1.4);
  });
});

describe('the man who fought for the position keeps it', () => {
  const grinder = measure('grinder', { fighter: wrestler, plan: GROUND }, guardPlayer());

  it('does not start letting people up because the option exists', () => {
    const m =
      `${grinder.attemptsPerTopMinute.toFixed(2)} att/top-min, ` +
      `${(grinder.topShare * 100).toFixed(1)}% of the fight on top`;
    expect(grinder.attemptsPerTopMinute, m).toBeLessThan(0.2);
    expect(grinder.topShare, m).toBeGreaterThan(0.5);
  });

  it('and the option cannot suppress his work by more than it is worth', () => {
    /*
     * The bound that makes "no material suppression" checkable rather than rhetorical. Whatever
     * `standUpFromTop` takes off the other four candidates, it takes exactly its own share — so
     * asserting the share is small *is* asserting the suppression is small, in every position and
     * without a simulation in between.
     */
    for (const position of ['guard', 'halfGuard', 'sideControl', 'mount', 'back'] as const) {
      const s = topShares(wrestler, { preferredState: 'top', topIntent: 'control' }, position);
      expect(s.standUpFromTop, `${position}: ${(s.standUpFromTop * 100).toFixed(1)}%`).toBeLessThan(0.05);
      expect(
        s.groundStrike + s.advancePosition + s.submission + s.maintainPosition,
        position,
      ).toBeGreaterThan(0.95);
    }
  });

  it('and keeps working at the same rate while he is up there', () => {
    /*
     * Per minute of top position rather than per fight, because the two plans do not spend the same
     * amount of time there and a per-fight count would be measuring that instead (docs/01, "where a
     * rate is used, normalise by exposure").
     */
    const grinderWorking = measure('grinder-strike', { fighter: wrestler, plan: plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'groundAndPound' }) }, guardPlayer());
    const m =
      `control ${grinder.groundStrikesPerTopMinute.toFixed(2)} gnp/top-min, ` +
      `${grinder.advancesPerTopMinute.toFixed(2)} adv, ${grinder.submissionsPerTopMinute.toFixed(2)} sub | ` +
      `damage plan ${grinderWorking.groundStrikesPerTopMinute.toFixed(2)} gnp/top-min`;
    expect(grinderWorking.groundStrikesPerTopMinute, m).toBeGreaterThan(grinder.groundStrikesPerTopMinute);
    expect(grinder.advancesPerTopMinute, m).toBeGreaterThan(0.2);
    expect(grinder.submissionsPerTopMinute, m).toBeGreaterThan(0.1);
  });
});

describe('the beat is charged once', () => {
  it('accrues stalled time at most once per unproductive beat', () => {
    /*
     * Invariant 8b, asserted against a ceiling the mechanism hands us rather than a number fitted
     * to a draw. The default referee's tolerance is 57.5 seconds and every failed action on the
     * floor books 15, so it takes four consecutive unproductive beats to earn a restart and the
     * restarts-per-beat rate cannot exceed 0.25. Accruing the stall twice on a beat — once on the
     * failed exit and once on the work that followed it, which is precisely how F1 got the bottom
     * position wrong the first time — would halve that to two beats and put the rate above it.
     *
     * Measured against the plan that elects the exit most, because that is the plan that would
     * expose the double charge.
     */
    const m =
      `standing ${standing.refStandUpsPerBeat.toFixed(3)} ref/beat | ` +
      `ground ${ground.refStandUpsPerBeat.toFixed(3)} ref/beat`;
    expect(standing.refStandUpsPerBeat, m).toBeLessThan(0.25);
    expect(ground.refStandUpsPerBeat, m).toBeLessThan(0.25);
  });

  it('and charges the clock once, for the branch that was actually taken', () => {
    /*
     * `standUpFromTop` is not a pre-beat: it competes for the moment and consumes it, won or lost,
     * booking 8–16 seconds from either branch. That is the shortest band on offer up there — riding
     * a position books 14–26 — so a plan that elects it five times as often must come out with a
     * *shorter* mean beat, and would come out longer if the branch charged the clock and then let
     * the beat continue.
     */
    const m =
      `standing ${standing.secondsPerBeat.toFixed(2)}s/beat against ground ${ground.secondsPerBeat.toFixed(2)}s/beat`;
    expect(standing.secondsPerBeat, m).toBeLessThan(ground.secondsPerBeat);
    // And inside the widest band any single top-position branch can book.
    expect(standing.secondsPerBeat, m).toBeGreaterThan(8);
    expect(standing.secondsPerBeat, m).toBeLessThan(26);
  });
});

describe('where the fight restarts depends on how the separation happened', () => {
  it('books hands range out of a guard and open space out of the dominant positions', () => {
    /*
     * The question is not "which range does standing up reset to" — it is *how did he get off him*.
     * Out of a closed or half guard he broke grips off his own hips and the other man came up
     * attached to him, which is the same amount of space the bottom man's wall-walk produces. Off
     * side control, mount or the back he stood off somebody who was flat on his back, which is the
     * most space any transition in the game creates.
     */
    expect(disengageRange('guard')).toBe('boxing');
    expect(disengageRange('halfGuard')).toBe('boxing');
    expect(disengageRange('sideControl')).toBe('outside');
    expect(disengageRange('mount')).toBe('outside');
    expect(disengageRange('back')).toBe('outside');
  });

  it('and it is contested immediately rather than granted', () => {
    /*
     * Booked with 0.15 stickiness against the 0.2 a bottom-position get-up carries, so a fighter
     * cannot buy a round at kicking range by taking somebody down and letting them up: the man on
     * the floor closes it back down on the very next range beat if he is the better mover.
     */
    const closer = measure('closer', { fighter: striker(), plan: STANDING }, guardPlayer({ speed: 80, wrestling: 75 }));
    expect(closer.attemptsPerTopMinute).toBeGreaterThan(0.3);
  });
});
