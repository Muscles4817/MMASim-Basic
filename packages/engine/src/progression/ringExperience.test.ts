/**
 * What a fight teaches, and what a fight then points the next camp at.
 *
 * Two mechanics from docs/27 §2. `applyRingExperience` is the part of a fight a gym cannot give
 * you — octagon time, landing on fight IQ and composure and on nothing else. `LESSON_BONUS` is
 * the other half: a fight names a hole, and the camp that follows works it harder.
 *
 * The measurement that motivated both: before this, a fighter taking 3.8 bouts a year developed
 * *less* than one taking 1.7, because fights contributed nothing and displaced camps.
 */

import { describe, expect, it } from 'vitest';
import { makeFighter } from '../testing/fixtures.js';
import {
  LESSON_BONUS,
  LESSON_WINDOW_DAYS,
  activeLesson,
  applyRingExperience,
  focusForAttribute,
  forecastTraining,
} from './development.js';
import type { AttributeKey } from '../ratings/attributes.js';
import type { Fighter, FightRecordEntry } from '../domain/fighter.js';

const hardThreeRounder = { secondsFought: 900, knockdownsSuffered: 0, submissionsFaced: 0, day: 0 };

const gainsFor = (fighter: Fighter, o: Partial<typeof hardThreeRounder> & { priorBouts: number }) =>
  applyRingExperience(fighter, { ...hardThreeRounder, ...o }).gains;

describe('octagon time', () => {
  it('gives fight IQ and composure, and nothing else at all', () => {
    /*
     * You do not get stronger or faster in a fight, you get damaged — and the model already
     * charges that. What a fight gives is the thing training cannot simulate.
     */
    const gains = gainsFor(makeFighter({ age: 23 }), { priorBouts: 0 });
    expect(Object.keys(gains).sort()).toEqual(['composure', 'fightIq']);
    expect(gains.fightIq!).toBeGreaterThan(0);
  });

  it('pays almost nothing for a fight that barely happened', () => {
    const blowout = gainsFor(makeFighter({ age: 23 }), { priorBouts: 0, secondsFought: 20 });
    const war = gainsFor(makeFighter({ age: 23 }), { priorBouts: 0 });
    expect(blowout.fightIq ?? 0).toBeLessThan((war.fightIq ?? 0) / 10);
  });

  it('tapers hard with experience, so it cannot become a grind', () => {
    /*
     * Without this the optimal play is to fight every eight weeks forever. A debut teaches
     * enormously; the fortieth fight teaches almost nothing.
     */
    const debut = gainsFor(makeFighter({ age: 23 }), { priorBouts: 0 }).fightIq!;
    const sixth = gainsFor(makeFighter({ age: 23 }), { priorBouts: 6 }).fightIq!;
    const thirtieth = gainsFor(makeFighter({ age: 30 }), { priorBouts: 30 }).fightIq!;
    expect(sixth).toBeLessThan(debut * 0.6);
    expect(thirtieth).toBeLessThan(debut * 0.25);
  });

  it('pays more for deep water than for a comfortable night', () => {
    const comfortable = gainsFor(makeFighter({ age: 23 }), { priorBouts: 2 }).fightIq!;
    const survived = gainsFor(makeFighter({ age: 23 }), {
      priorBouts: 2,
      knockdownsSuffered: 2,
      submissionsFaced: 2,
    }).fightIq!;
    expect(survived).toBeGreaterThan(comfortable);
  });

  it('saturates, so a fight cannot be arbitrarily educational', () => {
    /*
     * Uncapped, this rewards taking horrific punishment — the more times you were dropped the
     * more you learned, without limit. Three knockdowns already reaches the ceiling, so twelve
     * knockdowns and twelve submission escapes must be worth exactly the same.
     */
    const at = (knockdownsSuffered: number, submissionsFaced: number) =>
      gainsFor(makeFighter({ age: 23 }), { priorBouts: 2, knockdownsSuffered, submissionsFaced })
        .fightIq!;
    expect(at(12, 12)).toBe(at(3, 0));
    expect(at(3, 0)).toBeGreaterThan(at(0, 0));
  });

  it('is small enough that a camp still dwarfs it', () => {
    /*
     * The balance the whole mechanic turns on. Fights must be worth something and must not
     * become the way you train — the gym stays the engine, fights stay the reason.
     */
    const f = makeFighter({ age: 23 });
    const fight = gainsFor(f, { priorBouts: 0 }).fightIq!;
    const camp = forecastTraining({ fighter: f, focuses: ['strategy'], weeks: 8, day: 0 }).expected
      .fightIq!;
    expect(fight).toBeLessThan(camp);
  });

  it('banks the fraction rather than rounding it away', () => {
    // A single fight produces tenths, and `toRating` would discard every one of them.
    const f = makeFighter({ age: 23 });
    const after = applyRingExperience(f, { ...hardThreeRounder, priorBouts: 0 }).fighter;
    expect(after.trainingCarry?.fightIq ?? 0).toBeGreaterThan(0);
  });

  it('does nothing for a fighter who never got in there', () => {
    const f = makeFighter();
    expect(
      applyRingExperience(f, { ...hardThreeRounder, secondsFought: 0, priorBouts: 3 }).fighter,
    ).toBe(f);
  });
});

// --- The lesson --------------------------------------------------------------------------

const taught = (key: AttributeKey, day: number): Fighter => {
  const f = makeFighter({ age: 26 });
  const entry = {
    boutId: 'b1',
    opponentId: 'other',
    promotionId: 'p',
    day,
    outcome: 'loss',
    method: 'decisionUnanimous',
    round: 3,
    timeSeconds: 300,
    divisionId: f.divisionId,
    wasTitleFight: false,
    lesson: key,
  } as unknown as FightRecordEntry;
  return { ...f, record: [entry] };
};

describe('the lesson a fight left behind', () => {
  it('is live for the camp that follows', () => {
    expect(activeLesson(taught('takedownDefence', 0), 60)).toBe('takedownDefence');
  });

  it('fades, because nobody stays that motivated about one hole forever', () => {
    expect(activeLesson(taught('takedownDefence', 0), LESSON_WINDOW_DAYS + 1)).toBeUndefined();
  });

  it('makes the next camp work that thing harder', () => {
    const day = 60;
    const plain = makeFighter({ age: 26 });
    const shown = taught('takedownDefence', 0);
    const of = (f: Fighter) =>
      forecastTraining({ fighter: f, focuses: ['wrestling'], weeks: 8, day }).expected
        .takedownDefence!;
    // Forecast figures are rounded to two places, so compare the ratio within a percent.
    expect(of(shown) / of(plain)).toBeGreaterThan(LESSON_BONUS * 0.99);
    expect(of(shown) / of(plain)).toBeLessThan(LESSON_BONUS * 1.01);
  });

  it('bonuses only the thing that was exposed, not the whole camp', () => {
    const day = 60;
    const plain = makeFighter({ age: 26 });
    const shown = taught('takedownDefence', 0);
    const of = (f: Fighter) =>
      forecastTraining({ fighter: f, focuses: ['wrestling'], weeks: 8, day }).expected.wrestling!;
    expect(of(shown)).toBeCloseTo(of(plain), 2);
  });

  it('points at a camp the player can actually be offered', () => {
    expect(focusForAttribute('takedownDefence')).toBe('wrestling');
    expect(focusForAttribute('fightIq')).toBe('strategy');
    expect(focusForAttribute('submissions')).toBe('submissions');
    expect(focusForAttribute('cardio')).toBe('conditioning');
  });

  it('leaves a fighter who has never fought alone', () => {
    expect(activeLesson(makeFighter(), 500)).toBeUndefined();
  });
});

describe('more fights now beat fewer, which is the whole point', () => {
  it('leaves a busy fighter ahead on the qualities cage time builds', () => {
    /*
     * Measured before this existed: 3.8 bouts a year produced *less* development than 1.7. That
     * ordering was the model contradicting the reason anybody fights on the regional circuit.
     */
    let busy = makeFighter({ age: 23 });
    for (let i = 0; i < 6; i++) {
      busy = applyRingExperience(busy, {
        secondsFought: 900,
        priorBouts: i,
        knockdownsSuffered: 0,
        submissionsFaced: 0,
        day: i * 120,
      }).fighter;
    }
    const quiet = makeFighter({ age: 23 });
    expect(busy.attributes.fightIq).toBeGreaterThan(quiet.attributes.fightIq);
  });
});
