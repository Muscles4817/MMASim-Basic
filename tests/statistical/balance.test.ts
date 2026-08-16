import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  MAX_PREPPED_READS,
  defaultGamePlan,
  makeFighter,
  type GamePlan,
} from '@mmasim/engine';
import { describeSummary, runMatchup } from '../helpers/sim.js';

/**
 * Population-level balance.
 *
 * Every assertion here is a claim about a *distribution* with an explicit tolerance. These
 * are the tests that tell us whether the game still works after any tuning change — see
 * docs/03-fight-engine.md.
 */

describe('overall finish distribution', () => {
  it('produces a plausible KO / submission / decision split for even matchups', () => {
    const s = runMatchup(ARCHETYPES.journeyman(), ARCHETYPES.journeyman2(), {
      fights: 1500,
      seedPrefix: 'even',
    });
    // Real major-promotion cards land roughly 45–60% decisions. Two identical, wholly
    // average fighters should sit at the decision-heavy end of that.
    expect(s.decisionRate, describeSummary(s)).toBeGreaterThan(0.4);
    expect(s.decisionRate, describeSummary(s)).toBeLessThan(0.8);
    expect(s.finishRate, describeSummary(s)).toBeGreaterThan(0.2);
    // Draws are a real outcome but a rare one. This assertion exists because the scoring
    // arithmetic makes them easy to produce accidentally: every 10-8 round makes a card
    // sum to 56 rather than 57, which is exactly how cards end up tied.
    const draws = s.draws / s.fights;
    expect(draws, describeSummary(s)).toBeLessThan(0.08);
  });

  it('is symmetric between corners for identical fighters', () => {
    const s = runMatchup(
      makeFighter({ id: 'fighter_a', lastName: 'A' }),
      makeFighter({ id: 'fighter_b', lastName: 'B' }),
      { fights: 2000, seedPrefix: 'symmetry' },
    );
    // No corner advantage may leak in from the initiative or scoring code.
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.44);
    expect(s.redWinRate, describeSummary(s)).toBeLessThan(0.56);
  });

  it('produces close decisions often enough to be dramatic, but not constantly', () => {
    // Two evenly-matched fighters: the only situation where close cards should be common.
    const s = runMatchup(ARCHETYPES.journeyman(), ARCHETYPES.journeyman2(), {
      fights: 1200,
      seedPrefix: 'cards',
    });
    expect(s.closeDecisionRate, describeSummary(s)).toBeGreaterThan(0.05);
    expect(s.closeDecisionRate, describeSummary(s)).toBeLessThan(0.6);
  });
});

describe('design pillar 3 — outliers are outliers', () => {
  it('lets an all-time power outlier knock out almost anyone he catches', () => {
    const s = runMatchup(ARCHETYPES.bomber(), ARCHETYPES.journeyman(), {
      fights: 1200,
      seedPrefix: 'bomber-vs-avg',
    });
    // Not "a higher finish rate" — he ends people. This is the Ngannou statement.
    expect(s.koRate, describeSummary(s)).toBeGreaterThan(0.5);
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.65);
  });

  it('makes that dominance overwhelmingly early — his fights do not go long', () => {
    const s = runMatchup(ARCHETYPES.bomber(), ARCHETYPES.journeyman(), {
      fights: 800,
      seedPrefix: 'bomber-early',
    });
    expect(s.meanRound, describeSummary(s)).toBeLessThan(2.2);
  });

  it('gives an average fighter nothing like that knockout power', () => {
    const bomber = runMatchup(ARCHETYPES.bomber(), ARCHETYPES.journeyman(), {
      fights: 800,
      seedPrefix: 'ko-cmp-a',
    });
    const average = runMatchup(ARCHETYPES.journeyman(), ARCHETYPES.journeyman2(), {
      fights: 800,
      seedPrefix: 'ko-cmp-b',
    });
    expect(bomber.koRate).toBeGreaterThan(average.koRate * 3);
  });

  it('still punishes the bomber’s holes — a grappler drags him into deep water', () => {
    // Power 99 with Cardio 42, Wrestling 40 and Submissions 30 must be beatable, or the
    // outlier stops being interesting and becomes broken.
    const s = runMatchup(ARCHETYPES.bomber(), ARCHETYPES.smotherer(), {
      fights: 1000,
      seedPrefix: 'bomber-vs-grappler',
    });
    expect(s.redWinRate, describeSummary(s)).toBeLessThan(0.55);
    // …but he is never safe to fight. Once he is on his back against a 98 Ground Control
    // the fight is effectively over, so the puncher's chance is small — it lives almost
    // entirely in the opening exchanges. Small is the point; zero would be wrong.
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.03);
  });
});

describe('style matchups behave the way the sport does', () => {
  it('lets a suffocating top-control grappler beat a striker with no takedown defence', () => {
    const s = runMatchup(ARCHETYPES.smotherer(), ARCHETYPES.striker(), {
      fights: 1000,
      seedPrefix: 'grappler-vs-striker',
    });
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.6);
  });

  it('lets a bottomless gas tank grind down a better but less durable fighter', () => {
    const s = runMatchup(ARCHETYPES.grinder(), ARCHETYPES.striker(), {
      fights: 1000,
      seedPrefix: 'grinder-vs-striker',
    });
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.5);
  });

  it('makes the grinder’s edge grow over five rounds, not shrink', () => {
    // Measured against a well-rounded contender rather than the exploitable striker: when
    // the three-round win rate is already 80%+ there is no headroom left for the cardio
    // edge to show, and the test would be asserting against a ceiling.
    const three = runMatchup(ARCHETYPES.grinder(), ARCHETYPES.contender(), {
      fights: 1200,
      rounds: 3,
      seedPrefix: 'grind-3',
    });
    const five = runMatchup(ARCHETYPES.grinder(), ARCHETYPES.contender(), {
      fights: 1200,
      rounds: 5,
      seedPrefix: 'grind-5',
    });
    // Championship rounds belong to the engine, and that must show up in the numbers.
    expect(five.redWinRate).toBeGreaterThan(three.redWinRate);
  });

  it('makes a clearly worse fighter clearly lose', () => {
    const s = runMatchup(ARCHETYPES.striker(), ARCHETYPES.canFodder(), {
      fights: 800,
      seedPrefix: 'level-gap',
    });
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.85);
  });

  it('still allows upsets in a realistically-booked fight', () => {
    // Deliberately not elite-vs-can: no promotion books a 50-point rating gap, so asserting
    // upset frequency there tests a matchup the game will never generate. An elite striker
    // against a top-15 contender is a real main-card fight, and the underdog has to win it
    // sometimes or the sim is not modelling MMA.
    const s = runMatchup(ARCHETYPES.striker(), ARCHETYPES.contender(), {
      fights: 1500,
      seedPrefix: 'upsets',
    });
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.55);
    expect(s.redWinRate, describeSummary(s)).toBeLessThan(0.92);
  });
});

describe('preparation is worth more than a few rating points', () => {
  /** A plan that has correctly read the opponent's actual weapons. */
  const preparedAgainstWrestler = (): GamePlan => ({
    ...defaultGamePlan(),
    approach: 'counter',
    campQuality: 0.95,
    preppedReads: [
      { read: 'doubleLeg', drillQuality: 0.95, confidence: 0.9 },
      { read: 'singleLeg', drillQuality: 0.95, confidence: 0.9 },
      { read: 'guardPassing', drillQuality: 0.9, confidence: 0.85 },
      { read: 'groundAndPound', drillQuality: 0.9, confidence: 0.85 },
    ],
  });

  /** The same camp effort, spent on things this opponent never does. */
  const preparedForTheWrongFight = (): GamePlan => ({
    ...defaultGamePlan(),
    approach: 'counter',
    campQuality: 0.95,
    preppedReads: [
      { read: 'headKick', drillQuality: 0.95, confidence: 0.9 },
      { read: 'calfKick', drillQuality: 0.95, confidence: 0.9 },
      { read: 'counterRight', drillQuality: 0.9, confidence: 0.85 },
      { read: 'highVolume', drillQuality: 0.9, confidence: 0.85 },
    ],
  });

  it('never lets a camp drill more reads than the design allows', () => {
    expect(preparedAgainstWrestler().preppedReads.length).toBeLessThanOrEqual(MAX_PREPPED_READS);
  });

  it('meaningfully improves an underdog’s chances when the read is right', () => {
    // A contender who is the smaller wrestler against a chain-wrestling grinder: an
    // underdog, but a live one. Preparation is measured here rather than against the
    // smotherer because a 50-point takedown-defence gap cannot be drilled away in eight
    // weeks, and the test below asserts exactly that.
    const base = runMatchup(ARCHETYPES.contender(), ARCHETYPES.grinder(), {
      fights: 1500,
      seedPrefix: 'prep-base',
    });
    const prepared = runMatchup(ARCHETYPES.contender(), ARCHETYPES.grinder(), {
      fights: 1500,
      redPlan: preparedAgainstWrestler(),
      seedPrefix: 'prep-base',
    });
    // Identical fighters, identical seeds — the only difference is the camp.
    expect(
      prepared.redWinRate,
      `unprepared ${describeSummary(base)} vs prepared ${describeSummary(prepared)}`,
    ).toBeGreaterThan(base.redWinRate + 0.05);
  });

  it('wastes the camp entirely when the read is wrong', () => {
    const right = runMatchup(ARCHETYPES.striker(), ARCHETYPES.smotherer(), {
      fights: 1200,
      redPlan: preparedAgainstWrestler(),
      seedPrefix: 'prep-wrong',
    });
    const wrong = runMatchup(ARCHETYPES.striker(), ARCHETYPES.smotherer(), {
      fights: 1200,
      redPlan: preparedForTheWrongFight(),
      seedPrefix: 'prep-wrong',
    });
    // Drilling calf-kick answers against a wrestler who never kicks buys nothing. This
    // asymmetry is what makes scouting — and therefore a good coach — worth paying for.
    expect(
      wrong.redWinRate,
      `right-read ${describeSummary(right)} vs wrong-read ${describeSummary(wrong)}`,
    ).toBeLessThan(right.redWinRate);
  });

  it('cannot overturn a truly enormous gap on its own', () => {
    // Preparation should let an underdog win, not let a bad fighter beat a great one.
    const s = runMatchup(ARCHETYPES.canFodder(), ARCHETYPES.striker(), {
      fights: 1000,
      redPlan: {
        ...defaultGamePlan(),
        campQuality: 1,
        preppedReads: [
          { read: 'leadHook', drillQuality: 1, confidence: 1 },
          { read: 'counterRight', drillQuality: 1, confidence: 1 },
          { read: 'calfKick', drillQuality: 1, confidence: 1 },
          { read: 'highVolume', drillQuality: 1, confidence: 1 },
        ],
      },
      seedPrefix: 'prep-ceiling',
    });
    expect(s.redWinRate, describeSummary(s)).toBeLessThan(0.35);
  });
});
