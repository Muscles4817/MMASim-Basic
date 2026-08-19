/**
 * Two fighters born the same day do not age the same.
 *
 * Doc 27 §10. Decline was a pure function of age, so a 30-year-old who turned professional at 18
 * with thirty-five fights and several knockouts behind him declined at exactly the rate of one who
 * came to the sport at 28 and has had four. That is the one thing about ageing in this sport that
 * everybody who follows it knows to be false.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import { overallRating } from '../ratings/attributes.js';
import { applyAgeing, mileageYears } from './development.js';
import type { Fighter, FightRecordEntry } from '../domain/fighter.js';

const YEAR = 365;

/** A fighter with a history: when they turned pro, how many fights, and what it cost them. */
function withHistory(o: {
  age: number;
  turnedProAt: number;
  bouts: number;
  bodyWear?: number;
  headTrauma?: number;
}): Fighter {
  const f = makeFighter({ age: o.age });
  const record = Array.from(
    { length: o.bouts },
    (_, i) =>
      ({
        boutId: `b${i}`,
        opponentId: 'x',
        promotionId: 'p',
        day: -i * 120,
        outcome: 'win',
        method: 'decisionUnanimous',
        round: 3,
        timeSeconds: 300,
        divisionId: f.divisionId,
        wasTitleFight: false,
      }) as unknown as FightRecordEntry,
  );
  return {
    ...f,
    proDebutDay: f.birthDay + o.turnedProAt * YEAR,
    condition: {
      ...f.condition,
      bodyWear: o.bodyWear ?? 0,
      headTrauma: o.headTrauma ?? 0,
    },
    record,
  };
}

const CLEAN_34 = withHistory({ age: 34, turnedProAt: 25, bouts: 12, bodyWear: 8, headTrauma: 6 });
const WORN_30 = withHistory({ age: 30, turnedProAt: 18, bouts: 35, bodyWear: 45, headTrauma: 55 });
const FRESH_30 = withHistory({ age: 30, turnedProAt: 28, bouts: 4 });
const TYPICAL_30 = withHistory({
  age: 30,
  turnedProAt: 21,
  bouts: 16,
  bodyWear: 20,
  headTrauma: 25,
});

const declineOver = (f: Fighter, years: number) =>
  overallRating(f.attributes) -
  overallRating(applyAgeing(f, 0, years * YEAR, createRng('mileage')).fighter.attributes);

describe('what a career costs, beyond the birthdays', () => {
  it('reads every mile the model already knew about', () => {
    // A debutant has essentially none of it, whatever age they are. Not exactly zero only
    // because `birthDay` carries a month and a day, so "turned pro today" lands a few weeks out.
    expect(mileageYears(withHistory({ age: 30, turnedProAt: 30, bouts: 0 }), 0)).toBeLessThan(0.1);
    expect(mileageYears(WORN_30, 0)).toBeGreaterThan(mileageYears(TYPICAL_30, 0));
    expect(mileageYears(TYPICAL_30, 0)).toBeGreaterThan(mileageYears(FRESH_30, 0));
  });

  it('separates two fighters of exactly the same age', () => {
    /*
     * The whole point. Same birthday, different lives.
     */
    expect(declineOver(WORN_30, 3)).toBeGreaterThan(declineOver(FRESH_30, 3) * 1.5);
  });

  it('lets a well-kept thirty-four-year-old outlast a used thirty-year-old', () => {
    /*
     * The case the design is written around: a fighter who came to it at 25 and has taken little
     * is competitively younger than one who turned professional at 18 with thirty-five fights,
     * several knockouts and years of hard weight cuts behind him.
     */
    expect(mileageYears(WORN_30, 0)).toBeGreaterThan(mileageYears(CLEAN_34, 0));
    expect(declineOver(WORN_30, 3)).toBeGreaterThan(declineOver(CLEAN_34, 3));
  });

  it('takes it out of the body rather than the craft', () => {
    /*
     * Mileage shifts *when* decline starts, so it flows through `DECLINE_RATE` — which already
     * says speed and durability go and fight IQ and composure very nearly do not. A battered
     * fighter is slower and more brittle, not stupider.
     */
    const worn = applyAgeing(WORN_30, 0, 4 * YEAR, createRng('m')).fighter;
    const fresh = applyAgeing(FRESH_30, 0, 4 * YEAR, createRng('m')).fighter;

    expect(WORN_30.attributes.speed - worn.attributes.speed).toBeGreaterThan(
      FRESH_30.attributes.speed - fresh.attributes.speed,
    );
    // Composure never declines at all, and mileage must not change that.
    expect(worn.attributes.composure).toBe(WORN_30.attributes.composure);
    expect(worn.attributes.fightIq).toBeGreaterThanOrEqual(WORN_30.attributes.fightIq - 1);
  });

  it('does not make a young fighter old before their peak', () => {
    // A busy 24-year-old has miles on them, and should still be improving rather than fading.
    const busyYoung = withHistory({ age: 24, turnedProAt: 18, bouts: 14, bodyWear: 18 });
    expect(declineOver(busyYoung, 1)).toBeLessThan(1);
  });
});

describe('learning is not charged for it', () => {
  it('leaves a veteran able to be coached', () => {
    /*
     * Deliberate: `learningRate` still runs on the real age. Somebody who has been in wars is
     * slower and more brittle, not less able to be taught — and the sport is full of fighters who
     * added a whole discipline in their thirties precisely because they could no longer rely on
     * being the athlete in there.
     */
    const worn = applyAgeing(WORN_30, 0, YEAR, createRng('m')).fighter;
    expect(worn.attributes.fightIq).toBeGreaterThanOrEqual(WORN_30.attributes.fightIq - 1);
  });
});
