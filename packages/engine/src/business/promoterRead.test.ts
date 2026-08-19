/**
 * Reading a fighter as a promoter reads one.
 *
 * The tests that matter most here are the negative ones. `abilityRead` must not leak the overall
 * rating, because a screen that hands the player an integer to compare has replaced scouting with
 * arithmetic — and `careerArc` must be derived from what happened rather than from a class handed
 * out at generation, because "the same fighter is a hot prospect at 24 and a gatekeeper at 31" is
 * the whole design claim.
 */

import { describe, expect, it } from 'vitest';
import {
  abilityRead,
  availabilityOf,
  careerArc,
  conditionRead,
  scoutingRead,
  valueRead,
} from './promoterRead.js';
import { makeFighter, TEST_DAY } from '../testing/fixtures.js';
import { uniformAttributes } from '../ratings/attributes.js';
import type { Fighter, RecordSummary } from '../domain/fighter.js';
import { emptyRecordSummary } from '../domain/fighter.js';

const summary = (o: Partial<RecordSummary> = {}): RecordSummary => ({
  ...emptyRecordSummary(),
  ...o,
});

const withRecord = (fighter: Fighter, o: Partial<RecordSummary>): Fighter => ({
  ...fighter,
  summary: summary(o),
});

describe('ability, as a class rather than a number', () => {
  it('never returns the overall rating', () => {
    /*
     * The load-bearing assertion of the whole file. If the exact number reaches a screen, two
     * players can no longer reasonably disagree about the same fighter, and matchmaking judgement
     * stops being judgement.
     */
    for (const value of [12, 34, 47, 61, 73, 88, 99]) {
      const read = abilityRead(uniformAttributes(value));
      expect(JSON.stringify(read)).not.toContain(String(value));
    }
  });

  it('separates a championship fighter from a developmental one', () => {
    expect(abilityRead(uniformAttributes(85)).klass).toBe('championship');
    expect(abilityRead(uniformAttributes(35)).klass).toBe('developmental');
  });

  it('draws the same bar for everybody inside a class, so it cannot be read back as a score', () => {
    const low = abilityRead(uniformAttributes(66));
    const high = abilityRead(uniformAttributes(77));
    expect(low.klass).toBe(high.klass);
    expect(low.fill).toBe(high.fill);
  });
});

describe('the scouting read', () => {
  it('names a grappler a grappler', () => {
    const fighter = makeFighter({
      attributes: {
        wrestling: 82,
        takedownDefence: 78,
        groundControl: 80,
        submissions: 76,
        scrambling: 74,
        strikingOffence: 40,
        kicking: 38,
        strikingDefence: 42,
      },
    });
    expect(scoutingRead(fighter, TEST_DAY).tags).toContain('Grappler');
  });

  it('says when a record flatters the fighter behind it', () => {
    // The single most useful thing a matchmaker can be told, and the thing no roster screen has
    // ever said: reputation is what the sport believes, ability is what is true.
    const fighter = withRecord(makeFighter({ attributes: uniformAttributes(35), reputation: 70 }), {
      wins: 15,
      losses: 1,
    });
    expect(scoutingRead(fighter, TEST_DAY).summary).toMatch(/reads better than the fighter/i);
  });

  it('says when a fighter is better than their record', () => {
    const fighter = withRecord(makeFighter({ attributes: uniformAttributes(80), reputation: 25 }), {
      wins: 6,
      losses: 5,
    });
    expect(scoutingRead(fighter, TEST_DAY).summary).toMatch(/Better than the record suggests/i);
  });

  it('declines to judge a fighter with almost no career', () => {
    const fighter = withRecord(makeFighter(), { wins: 2 });
    expect(scoutingRead(fighter, TEST_DAY).summary).toMatch(/Too few fights/i);
  });

  it('only calls a genuinely poor attribute a weakness', () => {
    // A lowest-of-fifteen at 72 is not a hole, and calling it one teaches the player to distrust
    // the label.
    const strong = makeFighter({ attributes: uniformAttributes(75) });
    expect(scoutingRead(strong, TEST_DAY).weaknesses).toHaveLength(0);
  });
});

describe('career arcs, derived rather than assigned', () => {
  it('reads a young winner as a hot prospect', () => {
    const fighter = withRecord(makeFighter({ age: 24 }), { wins: 8, streak: 5 });
    expect(careerArc({ fighter, day: TEST_DAY }).id).toBe('hotProspect');
  });

  it('reads the same record at 31, deep into a career, as something else entirely', () => {
    const fighter = withRecord(makeFighter({ age: 31 }), { wins: 14, losses: 6, streak: 1 });
    expect(careerArc({ fighter, day: TEST_DAY, rank: 9 }).id).not.toBe('hotProspect');
  });

  it('reads a champion as a champion whatever else is true', () => {
    const fighter = withRecord(makeFighter({ age: 36 }), { wins: 20, losses: 5, streak: -1 });
    expect(careerArc({ fighter, day: TEST_DAY, isChampion: true }).id).toBe('champion');
  });

  it('reads a name that still sells and no longer wins as a declining star', () => {
    const fighter = withRecord(makeFighter({ age: 36, starPower: 75 }), {
      wins: 22,
      losses: 8,
      streak: -3,
    });
    expect(careerArc({ fighter, day: TEST_DAY }).id).toBe('decliningStar');
  });

  it('reads somebody on a bad run as needing rebuilding', () => {
    const fighter = withRecord(makeFighter({ age: 29, starPower: 20 }), {
      wins: 10,
      losses: 6,
      streak: -2,
    });
    expect(careerArc({ fighter, day: TEST_DAY }).id).toBe('rebuilding');
  });

  it('reads a top-five fighter running out of time as an aging contender', () => {
    const fighter = withRecord(makeFighter({ age: 35 }), { wins: 18, losses: 4, streak: 2 });
    expect(careerArc({ fighter, day: TEST_DAY, rank: 3 }).id).toBe('agingContender');
  });
});

describe('availability', () => {
  it('is ready when nothing is stopping them', () => {
    expect(availabilityOf({ fighter: makeFighter(), day: 100 }).state).toBe('ready');
  });

  it('is booked when they already have a fight, whatever else is true', () => {
    expect(availabilityOf({ fighter: makeFighter(), day: 100, booked: true }).state).toBe('booked');
  });

  it('measures clearance against the card, not against today', () => {
    // The question a promoter is asking is never "can they fight now" — it is "will they be
    // cleared by April", and answering the first one is how a suspended fighter ends up booked.
    const fighter = { ...makeFighter(), readyOnDay: 150 };
    expect(availabilityOf({ fighter, day: 100, forDay: 200 }).state).toBe('ready');
    expect(availabilityOf({ fighter, day: 100, forDay: 120 }).state).not.toBe('ready');
  });
});

describe('condition', () => {
  it('calls a fresh young fighter fresh', () => {
    expect(conditionRead(makeFighter({ age: 24 }), TEST_DAY).tone).toBe('good');
  });

  it('calls a chin that has gone what it is', () => {
    const fighter = makeFighter({ age: 36, headTrauma: 70 });
    const read = conditionRead(fighter, TEST_DAY);
    expect(read.tone).toBe('bad');
    expect(read.label).toMatch(/chin has gone/i);
  });
});

describe('value for money', () => {
  it('calls somebody paid well under their worth a bargain', () => {
    expect(valueRead({ paid: 20, worth: 60 }).tone).toBe('good');
  });

  it('calls somebody paid well over it money you are not getting back', () => {
    expect(valueRead({ paid: 90, worth: 40 }).tone).toBe('bad');
  });

  it('does not price a fighter nobody has valued yet', () => {
    expect(valueRead({ paid: 20, worth: 0 }).tone).toBe('neutral');
  });
});
