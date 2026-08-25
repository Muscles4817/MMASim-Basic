import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  MAX_PREPPED_READS,
  convictionFor,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  type GamePlan,
  planFor,
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
    expect(s.finishRate, describeSummary(s)).toBeGreaterThan(0.12);
    // Draws are a real outcome but a rare one. This assertion exists because the scoring
    // arithmetic makes them easy to produce accidentally: every 10-8 round makes a card
    // sum to 56 rather than 57, which is exactly how cards end up tied.
    const draws = s.draws / s.fights;
    /*
     * Two *identical* fighters are the maximum-draw case by construction, so this bound is a
     * ceiling on the pathological end rather than a reading of the sport. The population number —
     * which is the one that matters — is asserted over the shipped roster in
     * roster-profile.test.ts, where it is 2.9%.
     *
     * 0.1 → 0.12 when phase 1 recalibrated `BASE_KD_HAZARD` from 0.019 to 0.0158: fewer knockdowns
     * means more rounds reaching the cards, and for two fighters with identical numbers the cards
     * are exactly where draws come from. Measured 10.1% here against 2.9% across the real roster,
     * which is the gap between "two clones" and "a sport with skill gaps in it".
     */
    expect(draws, describeSummary(s)).toBeLessThan(0.12);
  });

  it('is symmetric between corners for identical fighters', () => {
    /*
     * **Stated between the two corners rather than against a fixed band, because the band was
     * quietly wrong.**
     *
     * It asserted `redWinRate` inside 0.44–0.56, which is a claim centred on 0.50 — and 0.50 is only
     * the symmetric answer when nobody draws. Two clones draw about 12% of the time (see the test
     * above), so the symmetric answer is (1 − 0.12) / 2 ≈ 0.44: **the centre of the distribution
     * was sitting exactly on the lower bound**, and the assertion had been passing on the margin
     * between 0.44 and whatever the draw rate happened to be that phase. Step 6.0 moved the clock
     * by less than a point and it fell over, reading 0.4395.
     *
     * Share of *decisive* fights is the claim that was always meant: neither corner may be favoured
     * by the initiative or the scoring code, whatever fraction of fights ends in a draw. Measured
     * 49.9%.
     */
    const s = runMatchup(
      makeFighter({ id: 'fighter_a', lastName: 'A' }),
      makeFighter({ id: 'fighter_b', lastName: 'B' }),
      { fights: 2000, seedPrefix: 'symmetry' },
    );
    const decisive = s.redWins + s.blueWins;
    const redShare = s.redWins / decisive;
    expect(redShare, `${describeSummary(s)} redShare=${(redShare * 100).toFixed(1)}%`).toBeGreaterThan(0.45);
    expect(redShare, `${describeSummary(s)} redShare=${(redShare * 100).toFixed(1)}%`).toBeLessThan(0.55);
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
      fights: 2500,
      seedPrefix: 'ko-cmp-a',
    });
    const average = runMatchup(ARCHETYPES.journeyman(), ARCHETYPES.journeyman2(), {
      fights: 2500,
      seedPrefix: 'ko-cmp-b',
    });

    // This was a single `ratio > 3` at 800 fights, which is a knife edge: the measured
    // design value is 2.98, so whether it passed came down to sampling noise, and it
    // silently started failing when fouls added recovery breaks. Three bounds at a sample
    // size that can actually resolve them says more, and says it stably.
    expect(bomber.koRate, describeSummary(bomber)).toBeGreaterThan(0.7);
    expect(average.koRate, describeSummary(average)).toBeLessThan(0.32);
    expect(bomber.koRate / average.koRate).toBeGreaterThan(2.75);
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
    // The threshold moved down from 0.60 when rounds started resetting to standing, as they
    // must. Position used to carry across the bell, so a round that ended in mount *began*
    // in mount and the grappler never had to earn it again. Every point of that edge was
    // coming from a rules violation.
    expect(s.redWinRate, describeSummary(s)).toBeGreaterThan(0.55);
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
  /**
   * A plan that has correctly read the opponent's actual weapons.
   *
   * The tactics half is not decoration and was not always here: this fixture used to say
   * `approach: 'counter'`, and when `approach` became `TacticalPlan` the field stopped being read
   * — so the "prepared" corner silently lost its counter-striking instruction and kept only its
   * drills. Preparation measured 1.19× against a 1.25 bound, and the missing quarter was not the
   * reads at all. A camp is a plan *and* a set of answers; measuring one while accidentally
   * deleting the other is how a test starts describing something nobody plays.
   */
  const preparedAgainstWrestler = (): GamePlan => ({
    ...defaultGamePlan(),
    tactics: {
      ...defaultTactics(),
      preferredState: 'outside',
      entry: 'counter',
      bottomIntent: 'defend',
      conviction: convictionFor('outside'),
    },
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
    /*
     * Identical fighters, identical seeds — the only difference is the camp.
     *
     * Measured as a *relative* improvement rather than as a fixed number of percentage
     * points. The claim is "preparation meaningfully improves an underdog's chances", and an
     * absolute bound measures that only while the underdog's base rate stays put: when the
     * engine was recalibrated against the shipped roster the base fell from ~14% to ~8%, and
     * a +5-point bar silently became a demand for a 60% relative swing rather than the ~35%
     * it originally encoded. Same mistake the KO-ratio assertion made, same fix.
     */
    /*
     * Both forms of this bound, because each alone is hostage to the other's denominator.
     *
     * The ratio was 1.35 and now measures 1.29 — while the *absolute* gain grew, from +2.8 points
     * of win rate to +2.9. Phase 1's hazard recalibration lifted the underdog's unprepared base
     * from ~8.0% to 9.7% (fewer flash knockdowns for the smaller wrestler to lose to), so the same
     * camp buys the same points and reads as a smaller multiple. That is the mirror image of the
     * failure this test was rewritten to avoid — an absolute bound silently becoming a demand for a
     * larger relative swing — and the fix for both is to state the claim twice.
     */
    expect(
      prepared.redWinRate / base.redWinRate,
      `unprepared ${describeSummary(base)} vs prepared ${describeSummary(prepared)}`,
    ).toBeGreaterThan(1.25);
    expect(
      (prepared.redWinRate - base.redWinRate) * 100,
      `prep bought ${((prepared.redWinRate - base.redWinRate) * 100).toFixed(1)} points`,
    ).toBeGreaterThan(2);
  });

  it('is worth less when the other man also had a camp, which is the world the player fights in', () => {
    /*
     * The test above measures a prepared player against an opponent with no plan at all. That was
     * the whole world until docs/19 phase 5 — `defaultGamePlan()` in both corners of every fight
     * the game simulated — and it is now the world *nowhere*, so this measures the same camp
     * against the same opponent under the plan `planFor` would give them.
     *
     * Measured, 2,500 fights per cell, the same underdog matchup:
     *
     * ```
     *                     base   +1 read   +4 reads
     * opponent unplanned   9.4%     13.4%      13.8%
     * opponent planned     7.5%      8.7%       9.8%
     * ```
     *
     * **The camp is worth about half what it was: +4.4 points becomes +2.3.** Both halves of that
     * are the design working — the underdog's base falls because the grinder now has a plan built
     * to exploit them, and the camp still buys a real edge on top of a harder fight. It is recorded
     * here because it is the kind of movement that would otherwise show up as "preparation feels
     * weaker" three months later with nothing to point at.
     */
    const bluePlan = planFor(ARCHETYPES.grinder(), ARCHETYPES.contender());
    const base = runMatchup(ARCHETYPES.contender(), ARCHETYPES.grinder(), {
      fights: 1500,
      bluePlan,
      seedPrefix: 'prep-world',
    });
    const prepared = runMatchup(ARCHETYPES.contender(), ARCHETYPES.grinder(), {
      fights: 1500,
      redPlan: preparedAgainstWrestler(),
      bluePlan,
      seedPrefix: 'prep-world',
    });

    expect(
      prepared.redWinRate,
      `unprepared ${describeSummary(base)} vs prepared ${describeSummary(prepared)}`,
    ).toBeGreaterThan(base.redWinRate);
  });

  it('buys almost nothing for a second read in a phase the camp already covers', () => {
    /*
     * **The granularity question docs/19 §11d asks, answered with a number.**
     *
     * `prepBonus` takes the *best* matching read rather than the sum, so two reads that resolve at
     * the same site are one read. Measured against the unplanned opponent: one read (`doubleLeg`)
     * buys +4.0 points, and adding `singleLeg` — the other takedown-phase read, drilled to the same
     * quality — buys **+0.0**. All four together buy +4.4, and the extra 0.4 comes from the two
     * that cover *ground* phases the first two do not.
     *
     * Fifteen read keys over eight resolution sites, and a camp holds four. So the read space is
     * not too coarse, it is **too fine in the phases the engine resolves most often**: a player who
     * drills the single and the double has spent half their camp twice, and nothing in the game
     * tells them so. That is a UI and read-table problem rather than an engine one, which is why it
     * is recorded here rather than fixed inside a phase about game plans.
     */
    const one = runMatchup(ARCHETYPES.contender(), ARCHETYPES.grinder(), {
      fights: 1500,
      redPlan: { ...preparedAgainstWrestler(), preppedReads: preparedAgainstWrestler().preppedReads.slice(0, 1) },
      seedPrefix: 'prep-granularity',
    });
    const two = runMatchup(ARCHETYPES.contender(), ARCHETYPES.grinder(), {
      fights: 1500,
      redPlan: { ...preparedAgainstWrestler(), preppedReads: preparedAgainstWrestler().preppedReads.slice(0, 2) },
      seedPrefix: 'prep-granularity',
    });

    expect(
      Math.abs(two.redWinRate - one.redWinRate) * 100,
      `one read ${describeSummary(one)} vs two ${describeSummary(two)}`,
    ).toBeLessThan(1.5);
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
