/**
 * Where the fight happens, as a decision the player actually gets to make.
 *
 * **The defect this suite was written against**, measured before the axis existed: an 84-striking,
 * 38-wrestling striker across from a wrestler spent **138 seconds of a 900-second fight at
 * distance and 368 being controlled**, and the seven approaches moved the first number between
 * 133 and 143. `approach` is a table of *offensive* intents — every row answers "what do I throw",
 * and not one of them reads on the takedown you are defending, the tie-up you are trying to leave
 * or the floor you are trying to get up off. So the player who built a striker and asked for a
 * striking fight was told, in effect, what to do during the fifteen per cent of the night they
 * were on their feet.
 *
 * `groundIntent` is that missing axis, and the four claims below are what make it a decision
 * rather than a buff. They are stated as *directions with margins* rather than as the measured
 * numbers, because the numbers move on any honest rebalance and the shape must not.
 *
 * Paired seeds throughout: both runs of a comparison use the same bout ids and the same opponent
 * plan, so the only difference between them is the dial.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultGamePlan,
  makeFighter,
  planFor,
  simulateFight,
  type Fighter,
  type FightConfig,
} from '@mmasim/engine';

/** A striker with the hole the complaint is about: no wrestling, no takedown defence, no scrambling. */
const striker = makeFighter({
  id: 'fighter_striker',
  lastName: 'Striker',
  attributes: {
    strikingOffence: 84,
    kicking: 80,
    strikingDefence: 78,
    power: 80,
    speed: 78,
    wrestling: 38,
    takedownDefence: 44,
    groundControl: 35,
    submissions: 32,
    scrambling: 40,
    cardio: 70,
    strength: 60,
    durability: 70,
    fightIq: 70,
    composure: 70,
  },
});

/** The man who exploits it. */
const wrestler = makeFighter({
  id: 'fighter_wrestler',
  lastName: 'Wrestler',
  attributes: {
    strikingOffence: 58,
    kicking: 50,
    strikingDefence: 60,
    power: 60,
    speed: 62,
    wrestling: 84,
    takedownDefence: 80,
    groundControl: 82,
    submissions: 60,
    scrambling: 72,
    cardio: 76,
    strength: 74,
    durability: 72,
    fightIq: 68,
    composure: 68,
  },
});

/** Somebody who was never going to shoot, which is where the plan is meant to be wrong. */
const boxer = makeFighter({
  id: 'fighter_boxer',
  lastName: 'Boxer',
  attributes: {
    strikingOffence: 80,
    kicking: 70,
    strikingDefence: 76,
    power: 78,
    speed: 76,
    wrestling: 45,
    takedownDefence: 62,
    groundControl: 45,
    submissions: 40,
    scrambling: 50,
    cardio: 72,
    strength: 62,
    durability: 72,
    fightIq: 68,
    composure: 68,
  },
});

interface Shape {
  winRate: number;
  /** Seconds of the fight this fighter spent at range. */
  distanceSeconds: number;
  /** Seconds spent underneath the other man on the floor. */
  heldOnFloor: number;
  takedownsConceded: number;
  takedownsStuffed: number;
  significantStrikes: number;
}

/**
 * Large, and it has to be.
 *
 * The first cut of this file ran 400 and read the striker's gain against the wrestler as +3.6
 * points on one seed prefix and −1.2 on another. Win rate over a fixed matchup has a standard
 * error near 2.5 points at that count, and every claim below is a few points wide, so 400 fights
 * measures the seed. The shape axes — floor time, stuffed shots — are far tighter and would have
 * been fine; the win-rate ones were not, and a suite that is right about five things and wrong
 * about the sixth is not a suite anybody trusts.
 */
const FIGHTS = 2500;

function shapeOf(fighter: Fighter, opponent: Fighter, groundIntent: number): Shape {
  const plan = { ...defaultGamePlan(), approach: 'counter' as const, groundIntent };
  const opponentPlan = planFor(opponent, fighter);
  const total = { wins: 0, distance: 0, floor: 0, conceded: 0, attempted: 0, strikes: 0 };

  for (let i = 0; i < FIGHTS; i++) {
    const config: FightConfig = {
      boutId: `groundIntent:${i}`,
      red: { fighter, plan },
      blue: { fighter: opponent, plan: opponentPlan },
      rounds: 3,
      seed: `groundIntent:${i}`,
    };
    const result = simulateFight(config);
    if (result.winnerId === fighter.id) total.wins++;
    total.distance += result.stats.red.distanceSeconds;
    total.floor += result.stats.blue.controlSeconds - result.stats.blue.clinchControlSeconds;
    total.conceded += result.stats.blue.takedownsLanded;
    total.attempted += result.stats.blue.takedownsAttempted;
    total.strikes += result.stats.red.significantStrikesLanded;
  }

  return {
    winRate: total.wins / FIGHTS,
    distanceSeconds: total.distance / FIGHTS,
    heldOnFloor: total.floor / FIGHTS,
    takedownsConceded: total.conceded / FIGHTS,
    takedownsStuffed: (total.attempted - total.conceded) / FIGHTS,
    significantStrikes: total.strikes / FIGHTS,
  };
}

const describeShape = (s: Shape) =>
  `win=${(s.winRate * 100).toFixed(1)}% distance=${s.distanceSeconds.toFixed(0)}s ` +
  `floor=${s.heldOnFloor.toFixed(0)}s td=${s.takedownsConceded.toFixed(2)} ` +
  `stuffed=${s.takedownsStuffed.toFixed(2)} sig=${s.significantStrikes.toFixed(1)}`;

describe('the dial changes the fight, not just the win rate', () => {
  it('lets a striker refuse the floor against the man built to put him there', () => {
    /*
     * The headline claim, and the one the complaint was about. Note it is asserted on *shape*
     * first and win rate second: a plan that made the striker win more while still spending two
     * thirds of the night on his back would not have answered anything.
     */
    const neutral = shapeOf(striker, wrestler, 0.5);
    const standing = shapeOf(striker, wrestler, 0);
    const message = `neutral ${describeShape(neutral)} | standing ${describeShape(standing)}`;

    // Measured at n=4000: stuffs 1.47 → 2.15, floor 337s → 304s, distance 136s → 148s,
    // significant strikes 12.9 → 13.8, win rate 38.1% → 42.4%. Bounds set well inside each.
    expect(standing.takedownsStuffed, message).toBeGreaterThan(neutral.takedownsStuffed * 1.25);
    expect(standing.heldOnFloor, message).toBeLessThan(neutral.heldOnFloor * 0.97);
    expect(standing.distanceSeconds, message).toBeGreaterThan(neutral.distanceSeconds * 1.05);
    expect(standing.significantStrikes, message).toBeGreaterThan(neutral.significantStrikes);
    expect(standing.winRate, message).toBeGreaterThan(neutral.winRate + 0.01);
  });

  it('buys nothing with the same plan against a man who was never going to shoot', () => {
    /*
     * The asymmetry `prepValue` already has, on the axis that did not have it: preparation is
     * only worth what the opponent gives you, and a camp spent bracing for a level change from
     * somebody who does not change levels is a camp spent on nothing.
     *
     * **The claim is a comparison, and it is stated that way because a bare direction is not
     * something these sample sizes can carry.** An earlier cut asserted the plan *costs* win rate
     * here. Measured twice at n=4000 on different seed prefixes it came back −1.3 points and
     * +0.7: the effect against a non-wrestler is zero to within the noise, and a test asserting
     * its sign is a test that passes on the seed. What is far outside the noise is the *gap* —
     * roughly +4.3 points against the wrestler against roughly nothing here — so that is what is
     * asserted, with the two runs sharing seeds so the comparison is paired.
     *
     * The shape assertion is the more interesting one anyway, and it is enormous: the fight goes
     * from 152 seconds underneath to 87. Refusing the floor *always* changes the fight. It only
     * pays when somebody was trying to put you there.
     */
    const neutralVsBoxer = shapeOf(striker, boxer, 0.5);
    const standingVsBoxer = shapeOf(striker, boxer, 0);
    const neutralVsWrestler = shapeOf(striker, wrestler, 0.5);
    const standingVsWrestler = shapeOf(striker, wrestler, 0);

    const againstBoxer = standingVsBoxer.winRate - neutralVsBoxer.winRate;
    const againstWrestler = standingVsWrestler.winRate - neutralVsWrestler.winRate;
    const message =
      `vs boxer ${describeShape(neutralVsBoxer)} → ${describeShape(standingVsBoxer)} ` +
      `(${(againstBoxer * 100).toFixed(1)}pp) | vs wrestler ${(againstWrestler * 100).toFixed(1)}pp`;

    expect(againstWrestler - againstBoxer, message).toBeGreaterThan(0.03);
    expect(againstBoxer, message).toBeLessThan(0.02);
    expect(standingVsBoxer.heldOnFloor, message).toBeLessThan(neutralVsBoxer.heldOnFloor * 0.75);
  });

  it('punishes a striker who asks for the fight he cannot have', () => {
    // The other end of the dial, against both kinds of opponent. You do not get to choose to be
    // a grappler; the attributes decide that and the plan only decides whether you try.
    for (const opponent of [wrestler, boxer]) {
      const neutral = shapeOf(striker, opponent, 0.5);
      const floor = shapeOf(striker, opponent, 1);
      const message = `vs ${opponent.lastName}: neutral ${describeShape(neutral)} | floor ${describeShape(floor)}`;

      expect(floor.winRate, message).toBeLessThan(neutral.winRate - 0.05);
      expect(floor.heldOnFloor, message).toBeGreaterThan(neutral.heldOnFloor);
    }
  });

  it('punishes a wrestler who gives up his own best phase', () => {
    /*
     * The dial is self-limiting, and this is where that is proved. It carries no flat tax — an
     * earlier cut charged one and it kept cancelling exactly what the plan was buying — because
     * the cost of picking the wrong end is that you have chosen to fight in the phase where the
     * other man is better. A fighter who is *right* about which fight he wants should be right.
     */
    const neutral = shapeOf(wrestler, striker, 0.5);
    const standing = shapeOf(wrestler, striker, 0);
    const message = `neutral ${describeShape(neutral)} | standing ${describeShape(standing)}`;

    expect(standing.winRate, message).toBeLessThan(neutral.winRate - 0.05);
  });

  it('moves the fight monotonically, so the middle of the slider is the middle of the range', () => {
    // A dial whose midpoints do not sit between its ends is a dial the player cannot reason
    // about, however good its extremes look.
    const floorTime = [0, 0.25, 0.5, 0.75, 1].map((v) => shapeOf(striker, wrestler, v).heldOnFloor);
    for (let i = 1; i < floorTime.length; i++) {
      expect(
        floorTime[i],
        `held on the floor by setting: ${floorTime.map((s) => s.toFixed(0)).join(' ')}`,
      ).toBeGreaterThan(floorTime[i - 1]! * 0.99);
    }
  });
});
