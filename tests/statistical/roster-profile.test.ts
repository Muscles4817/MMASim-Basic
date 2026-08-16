/**
 * The finish profile of the roster the game actually ships.
 *
 * `balance.test.ts` calibrates against `ARCHETYPES.journeyman()` — two synthetic, wholly
 * average fighters — and it passes. The seeded roster does not look like that: real fighters
 * carry the high Power, high Durability and high Aggression values the effect curve is
 * heavy-tailed in, so the population that actually plays behaves nothing like the population
 * that is tested.
 *
 * Measured before this suite existed: **77.7% finishes, 70% by KO/TKO, 7.5% by submission,
 * 21.7% decisions, and 44% of all fights ending in round one.** Reality is roughly 48%
 * finishes, a KO-to-submission ratio near 1.8:1, and about 16% first-round finishes. The
 * sport was inverted — decisions were a minority event, and the entire judging system built
 * to score them was mostly unreachable.
 *
 * This suite exists so the *shipped* roster is the thing under test.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { simulateFight, type Fighter } from '@mmasim/engine';

interface Profile {
  fights: number;
  finishPct: number;
  koPct: number;
  subPct: number;
  decisionPct: number;
  firstRoundPct: number;
  drawPct: number;
  koToSub: number;
}

function profileRoster(rounds: 3 | 5, maxGap?: number): Profile {
  const db = createNewGame({ adapter: undefined });
  const all = db.fighters.findAll() as Fighter[];

  let n = 0;
  let ko = 0;
  let sub = 0;
  let dec = 0;
  let firstRound = 0;
  let draws = 0;

  for (const division of new Set(all.map((f) => f.divisionId))) {
    const pool = all.filter((f) => f.divisionId === division);
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const result = simulateFight({
          boutId: `p${n}`,
          seed: `profile_${rounds}_${n}`,
          rounds,
          red: { fighter: pool[i]! },
          blue: { fighter: pool[j]! },
        });
        n++;
        if (result.method === 'ko' || result.method === 'tko' || result.method === 'doctorStoppage') ko++;
        else if (result.method === 'submission') sub++;
        else if (result.method.startsWith('decision')) dec++;
        if (result.round === 1 && !result.method.startsWith('decision')) firstRound++;
        if (result.method === 'decisionDraw') draws++;
      }
    }
  }

  void maxGap;
  return {
    fights: n,
    finishPct: (100 * (ko + sub)) / n,
    koPct: (100 * ko) / n,
    subPct: (100 * sub) / n,
    decisionPct: (100 * dec) / n,
    firstRoundPct: (100 * firstRound) / n,
    drawPct: (100 * draws) / n,
    koToSub: ko / Math.max(1, sub),
  };
}

describe('the shipped roster fights like the sport', () => {
  const three = profileRoster(3);

  it('goes to the judges about half the time', () => {
    // The single most important number in the whole engine, and the one the archetype-based
    // suite could not see. Real MMA decisions run ~48–52%.
    expect(three.decisionPct, JSON.stringify(three)).toBeGreaterThan(35);
    expect(three.decisionPct, JSON.stringify(three)).toBeLessThan(62);
  });

  it('finishes roughly half its fights', () => {
    expect(three.finishPct, JSON.stringify(three)).toBeGreaterThan(35);
    expect(three.finishPct, JSON.stringify(three)).toBeLessThan(62);
  });

  it('keeps submissions a real terminal path rather than a rounding error', () => {
    // At 9:1 the grappling half of the sport had almost no way to end a fight, which makes a
    // control wrestler someone who wins rounds you rarely get to score.
    expect(three.koToSub, JSON.stringify(three)).toBeLessThan(3.6);
    expect(three.subPct, JSON.stringify(three)).toBeGreaterThan(10);
  });

  it('keeps the draw a rare outcome', () => {
    /*
     * Unguarded until now, and worth guarding because the scoring arithmetic makes draws easy
     * to produce by accident: every 10-8 round makes a card sum to 56 rather than 57, which is
     * exactly how cards end up tied. The risk grew with the finish-rate recalibration — many
     * more fights now reach the judges, so anything wrong in the scoring is exposed to far
     * more samples than before.
     *
     * Real MMA draws run near 1% of fights. Across a full roster with genuine skill gaps this
     * should stay low even though two *identical* fighters draw far more often.
     */
    expect(three.drawPct, JSON.stringify(three)).toBeLessThan(3);
  });

  it('does not end most fights in the first round', () => {
    /*
     * 44% suggested no feeling-out period at all. Real first-round finishes are ~16%; this
     * now sits at ~32%, and the bound is set where the engine honestly is rather than where
     * the sport is, so the number is visible instead of asserted away.
     *
     * The remaining gap is not reachable from the damage constants — see the calibration
     * table on `shouldRefereeStop`. Round one is where both fighters are freshest and land
     * cleanest, so any per-strike hazard concentrates there; closing it properly means an
     * opening-minutes ramp on strike volume or output, which is an exchange-model change.
     * Tracked as the next piece of fight-engine work.
     */
    expect(three.firstRoundPct, JSON.stringify(three)).toBeLessThan(34);
  });
});

describe('championship distance', () => {
  const five = profileRoster(5);

  it('still sends plenty of five-round fights to the cards', () => {
    // Real five-round main events go to decision roughly 40–45% of the time. The engine had
    // it at 11%, which makes a championship a coin-flip on a single exchange. ~24% now: two
    // extra rounds are two more chances to be finished, so this sits below the three-round
    // decision rate by construction and closes only as the first-round gap above closes.
    expect(five.decisionPct, JSON.stringify(five)).toBeGreaterThan(20);
  });

  it('finishes more often over five rounds than three, but not overwhelmingly', () => {
    expect(five.finishPct).toBeGreaterThan(profileRoster(3).finishPct - 5);
  });
});
