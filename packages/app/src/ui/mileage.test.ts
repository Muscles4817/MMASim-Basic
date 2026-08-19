/**
 * Can a player see a worn fighter?
 *
 * Doc 27 §12 made a career cost something beyond the birthdays, and §13.3 recorded that none of it
 * reached a screen — so a worn thirty-year-old and a fresh one looked identical, which is the one
 * distinction the mechanic exists to draw.
 */

import { describe, expect, it } from 'vitest';
import { makeFighter, type Fighter, type FightRecordEntry } from '@mmasim/engine';

import { readMileage } from './mileage';

const YEAR = 365;

const withHistory = (o: {
  age: number;
  turnedProAt: number;
  bouts: number;
  bodyWear?: number;
  headTrauma?: number;
}): Fighter => {
  const f = makeFighter({ age: o.age });
  return {
    ...f,
    proDebutDay: f.birthDay + o.turnedProAt * YEAR,
    condition: {
      ...f.condition,
      bodyWear: o.bodyWear ?? 0,
      headTrauma: o.headTrauma ?? 0,
    },
    record: Array.from(
      { length: o.bouts },
      (_, i) =>
        ({
          boutId: `b${i}`,
          opponentId: 'x',
          promotionId: 'p',
          day: -i * 90,
          outcome: 'win',
          method: 'decisionUnanimous',
          round: 3,
          timeSeconds: 300,
          divisionId: f.divisionId,
          wasTitleFight: false,
        }) as unknown as FightRecordEntry,
    ),
  };
};

const FRESH_30 = withHistory({ age: 30, turnedProAt: 28, bouts: 4, bodyWear: 2, headTrauma: 1 });
const WORN_30 = withHistory({ age: 30, turnedProAt: 18, bouts: 35, bodyWear: 45, headTrauma: 55 });
const CLEAN_34 = withHistory({ age: 34, turnedProAt: 25, bouts: 12, bodyWear: 8, headTrauma: 6 });

describe('two fighters the same age no longer look the same', () => {
  it('shows the worn one carrying years the fresh one is not', () => {
    expect(readMileage(WORN_30, 0).body).toBeGreaterThan(readMileage(FRESH_30, 0).body + 4);
  });

  it('reads a worn thirty-year-old as older than a well-kept thirty-four-year-old', () => {
    // The case doc 27 §12 is written around, now visible rather than only true.
    expect(readMileage(WORN_30, 0).body).toBeGreaterThan(readMileage(CLEAN_34, 0).body);
  });

  it('flags the worn one and leaves the fresh one alone', () => {
    expect(readMileage(WORN_30, 0).heavy).toBe(true);
    expect(readMileage(FRESH_30, 0).notable).toBe(false);
  });
});

describe('it says what did it, not just that something did', () => {
  it('names the bouts when the bouts are the story', () => {
    expect(readMileage(WORN_30, 0).because).toMatch(/35 professional bouts/);
  });

  it('says there is nothing to worry about when there is not', () => {
    const debutant = withHistory({ age: 22, turnedProAt: 22, bouts: 0 });
    expect(readMileage(debutant, 0).body).toBe(22);
    expect(readMileage(debutant, 0).because).toMatch(/not been asked for much/i);
  });

  it('never assumes the fighter is a man', () => {
    /*
     * The sport in this game has women's divisions, and this copy is shown for every fighter on
     * it. An earlier draft said "not on his age".
     */
    for (const f of [FRESH_30, WORN_30, CLEAN_34]) {
      expect(readMileage(f, 0).because).not.toMatch(/\b(he|his|him|she|her|hers)\b/i);
    }
  });
});
