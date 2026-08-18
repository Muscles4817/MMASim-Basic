/**
 * What a skill loses when nobody works on it.
 *
 * The plateau model had exactly one downward force — age — so a fighter who reached their level
 * held every part of it for free, and the only cost of spreading a career thin was the gains not
 * taken. Neglect is the second force, and it is what turns the model into a set of choices: a camp
 * is both an investment and a maintenance payment, and a fighter with four things to keep sharp
 * and two camps a year cannot keep all four.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import {
  NEGLECT_GRACE_DAYS,
  applyAgeing,
  applyTraining,
  neglectDays,
  neglectLoss,
} from './development.js';
import type { Fighter } from '../domain/fighter.js';

const YEAR = 365;

/** A fighter who last did each named camp on the given day. */
function trained(
  history: Record<string, number>,
  overrides: Parameters<typeof makeFighter>[0] = {},
): Fighter {
  return { ...makeFighter({ age: 28, ...overrides }), lastTrained: history } as Fighter;
}

const loseOver = (fighter: Fighter, key: Parameters<typeof neglectLoss>[0]['key'], day: number, years: number, age = 28) =>
  neglectLoss({ fighter, key, day, years, age });

describe('a fighter who has never trained', () => {
  it('loses nothing, so opening an old save does not decay the roster', () => {
    /*
     * `lastTrained` is absent on every fighter written before this existed. Absent must mean
     * *fresh* rather than *never*, or upgrading the game would quietly take a chunk out of eight
     * hundred careers on the first tick.
     */
    const legacy = makeFighter({ age: 30 });
    expect(legacy.lastTrained).toBeUndefined();
    expect(neglectDays(legacy, 'wrestling', 5000)).toBe(0);
    expect(loseOver(legacy, 'wrestling', 5000, 5)).toBe(0);
  });
});

describe('the grace period', () => {
  it('costs nothing across an ordinary camp-and-fight cycle', () => {
    // Two fights a year is the sport's median. A fighter on it must never be told they are
    // neglecting the thing they are actively doing.
    const f = trained({ wrestling: 0 });
    expect(loseOver(f, 'wrestling', NEGLECT_GRACE_DAYS - 1, 0.4)).toBe(0);
  });

  it('starts costing once the gap is genuinely long', () => {
    const f = trained({ wrestling: 0 });
    expect(loseOver(f, 'wrestling', NEGLECT_GRACE_DAYS + 200, 1)).toBeGreaterThan(0);
  });
});

describe('it accumulates', () => {
  it('takes more per year the longer something has been left', () => {
    /*
     * "Slow but accumulates" is the whole shape. A year off costs a little; the fourth year off
     * costs several times what the first did, because the rate itself is a function of how long
     * it has been.
     */
    const f = trained({ wrestling: 0 });
    const firstYear = loseOver(f, 'wrestling', YEAR, 1);
    const fourthYear = loseOver(f, 'wrestling', 4 * YEAR, 1);
    expect(fourthYear).toBeGreaterThan(firstYear * 2.5);
  });
});

describe('what fades and what sticks', () => {
  it('takes cardio fastest of everything', () => {
    // Detraining is measurable in weeks, which is why cardio is the one physical on the list.
    const f = trained({ boxing: 0, conditioning: 0, wrestling: 0, submissions: 0, strategy: 0 });
    const cardio = loseOver(f, 'cardio', 3 * YEAR, 1);
    for (const key of ['wrestling', 'submissions', 'fightIq'] as const) {
      expect(cardio, `${key} faded faster than cardio`).toBeGreaterThan(loseOver(f, key, 3 * YEAR, 1));
    }
  });

  it('barely touches what a fighter knows rather than what they have', () => {
    // A submission you know you still know. Timing a slip is something you had last month.
    const f = trained({ boxing: 0, submissions: 0, strategy: 0 });
    expect(loseOver(f, 'strikingDefence', 3 * YEAR, 1)).toBeGreaterThan(
      loseOver(f, 'fightIq', 3 * YEAR, 1) * 3,
    );
  });

  it('leaves power, speed, strength and durability to age alone', () => {
    /*
     * Charging them twice for the same physiology would make every quiet year cost double, and
     * `PEAK_OFFSET` plus `DECLINE_RATE` already model them properly.
     */
    const f = trained({ boxing: 0, conditioning: 0, wrestling: 0 });
    for (const key of ['power', 'speed', 'strength', 'durability'] as const) {
      expect(loseOver(f, key, 5 * YEAR, 1), key).toBe(0);
    }
  });
});

describe('maintenance', () => {
  it('is what a camp buys as well as improvement', () => {
    const f = trained({ wrestling: 0 });
    const stale = loseOver(f, 'wrestling', 3 * YEAR, 1);
    const maintained = loseOver(trained({ wrestling: 3 * YEAR - 60 }), 'wrestling', 3 * YEAR, 1);
    expect(maintained).toBe(0);
    expect(stale).toBeGreaterThan(0);
  });

  it('counts a light-touch focus for less than the camp that is really about it', () => {
    /*
     * Conditioning trains durability at 0.45 and cardio at 1.0, so a fighter who only ever
     * conditions holds their tank completely and still slowly loses their chin. Weighting the gap
     * is what stops one camp maintaining everything it brushes against.
     */
    const f = trained({ conditioning: 0 });
    expect(neglectDays(f, 'durability', 400)).toBeGreaterThan(neglectDays(f, 'cardio', 400));
  });

  it('matters more to an old fighter than a young one', () => {
    // The lever the whole idea turns on: detraining is faster later, so a veteran's camp slot is
    // worth spending on keeping what they have when developing something new no longer pays.
    const f = trained({ wrestling: 0 });
    const young = loseOver(f, 'wrestling', 3 * YEAR, 1, 24);
    const old = loseOver(f, 'wrestling', 3 * YEAR, 1, 38);
    expect(old).toBeGreaterThan(young * 1.4);
  });
});

describe('through the real functions', () => {
  it('a camp resets the clock on what it worked, and only that', () => {
    const before = trained({}, { age: 27 });
    const after = applyTraining({
      fighter: before,
      focuses: ['wrestling'],
      weeks: 8,
      day: 1000,
      rng: createRng('c'),
    }).fighter;

    expect(after.lastTrained?.wrestling).toBe(1000);
    expect(after.lastTrained?.boxing).toBeUndefined();
  });

  it('ageing charges it, and names the thing that was dropped', () => {
    const f = trained({ boxing: 0, conditioning: 0 }, { age: 33 });
    const result = applyAgeing(f, 4 * YEAR, 5 * YEAR, createRng('n'));

    expect(result.fighter.attributes.strikingDefence).toBeLessThan(f.attributes.strikingDefence);
    expect(result.notes.join(' ')).toMatch(/nobody has worked on/i);
  });

  it('never takes a skill below half of what the fighter could be', () => {
    // Skills fade; they do not evaporate. Nobody forgets how to wrestle.
    let f = trained({ wrestling: 0 }, { age: 30 });
    for (let year = 1; year <= 20; year++) {
      f = applyAgeing(f, (year - 1) * YEAR, year * YEAR, createRng(`y${year}`)).fighter;
    }
    expect(f.attributes.wrestling).toBeGreaterThanOrEqual(
      Math.min(f.potential.wrestling * 0.5, f.attributes.wrestling),
    );
    expect(f.attributes.wrestling).toBeGreaterThan(14);
  });
});
