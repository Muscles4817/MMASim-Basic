/**
 * What a fight told a fighter about themselves.
 *
 * The claim under test is docs/27 §2.4: a fight grants direction rather than points, the
 * direction is already fully recorded in the stats, and it does not depend on who won.
 */

import { describe, expect, it } from 'vitest';
import { emptyStats, type DamageReport, type FightStats } from '../fight/types.js';
import { lessonFrom, type LessonInput } from './lessons.js';

const damage = (o: Partial<DamageReport> = {}): DamageReport => ({
  headDamage: 0,
  bodyDamage: 0,
  legDamage: 0,
  knockdownsSuffered: 0,
  wasFinishedByStrikes: false,
  traumaIncrement: 0,
  ...o,
});

const stats = (o: Partial<FightStats> = {}): FightStats => ({ ...emptyStats(), ...o });

/** A competitive fifteen minutes in which nothing much went wrong. */
const clean: LessonInput = {
  mine: stats({ significantStrikesLanded: 40, significantStrikesAttempted: 90 }),
  theirs: stats({ significantStrikesLanded: 38, significantStrikesAttempted: 95 }),
  damage: damage(),
  method: 'decisionUnanimous',
  lost: false,
  secondsFought: 900,
};

const read = (o: Partial<LessonInput> = {}) => lessonFrom({ ...clean, ...o });

describe('a fight that exposed nothing', () => {
  it('teaches nothing, because a lesson on every bout is noise', () => {
    expect(read()).toBeUndefined();
  });

  it('teaches nothing when it was over too fast to have shown anything', () => {
    /*
     * A twelve-second blowout says the other man landed something. It does not say you have a
     * hole in your wrestling, and on a denominator that small every rate in the model goes silly.
     */
    expect(
      read({
        secondsFought: 12,
        lost: true,
        method: 'ko',
        damage: damage({ knockdownsSuffered: 1, wasFinishedByStrikes: true }),
      }),
    ).toBeUndefined();
  });
});

describe('what the stats actually said', () => {
  it('names takedown defence for a fighter who was put down at will', () => {
    expect(read({ theirs: stats({ takedownsLanded: 6, takedownsAttempted: 9 }) })?.key).toBe(
      'takedownDefence',
    );
  });

  it('separates being taken down from being unable to get up', () => {
    // One takedown and eleven minutes on the floor is a scrambling problem, not a sprawl one.
    const held = read({
      theirs: stats({ takedownsLanded: 1, takedownsAttempted: 1, controlSeconds: 660 }),
    });
    expect(held?.key).toBe('scrambling');
  });

  it('does not read clinch time as being held on the floor', () => {
    // Control against the fence is a different place to be losing, and `clinchControlSeconds`
    // exists precisely so the two are distinguishable.
    const clinched = read({
      theirs: stats({ controlSeconds: 600, clinchControlSeconds: 600 }),
    });
    expect(clinched?.key).not.toBe('scrambling');
  });

  it('names submissions for a fighter who spent the night in trouble on the floor', () => {
    expect(read({ theirs: stats({ submissionAttempts: 4 }) })?.key).toBe('submissions');
  });

  it('names striking defence for a fighter who was there to be hit', () => {
    expect(
      read({ theirs: stats({ significantStrikesLanded: 130, significantStrikesAttempted: 220 }) })
        ?.key,
    ).toBe('strikingDefence');
  });

  it('names striking defence for being dropped, even in a fight that was otherwise even', () => {
    expect(read({ damage: damage({ knockdownsSuffered: 2 }) })?.key).toBe('strikingDefence');
  });

  it('reads an offensive failure too, not only what was done to them', () => {
    // Shooting eight times and landing one is its own lesson, and it is about your wrestling.
    expect(read({ mine: stats({ takedownsAttempted: 8, takedownsLanded: 1 }) })?.key).toBe(
      'wrestling',
    );
  });

  it('does not call good wrestling a wrestling problem', () => {
    expect(read({ mine: stats({ takedownsAttempted: 8, takedownsLanded: 6 }) })?.key).not.toBe(
      'wrestling',
    );
  });
});

describe('the loudest signal wins', () => {
  it('picks being finished on strikes over a lesser complaint in the same fight', () => {
    const both = read({
      lost: true,
      method: 'tko',
      secondsFought: 400,
      theirs: stats({ takedownsLanded: 2, significantStrikesLanded: 60 }),
      damage: damage({ knockdownsSuffered: 1, wasFinishedByStrikes: true }),
    });
    expect(both?.key).toBe('strikingDefence');
  });

  it('measures per full fight, so a short fight is not flattered by its own length', () => {
    // Four takedowns in five minutes is a worse night than four in fifteen, and only the rate
    // says so.
    expect(read({ secondsFought: 300, theirs: stats({ takedownsLanded: 2 }) })?.key).toBe(
      'takedownDefence',
    );
    expect(read({ secondsFought: 900, theirs: stats({ takedownsLanded: 2 }) })).toBeUndefined();
  });
});

describe('who won is not the question', () => {
  it('still names the hole in a fight the fighter won', () => {
    /*
     * The point of the mechanic. You can win a decision having been put on your back six times,
     * and that is exactly the thing to go and fix before somebody better does it to you.
     */
    const won = read({ lost: false, theirs: stats({ takedownsLanded: 6 }) });
    expect(won?.key).toBe('takedownDefence');
  });

  it('gives the same reading either way when the stats are the same', () => {
    const theirs = stats({ takedownsLanded: 6 });
    expect(read({ lost: false, theirs })?.key).toBe(read({ lost: true, theirs })?.key);
  });
});

describe('the note', () => {
  it('says something specific enough to act on', () => {
    const lesson = read({ theirs: stats({ takedownsLanded: 6 }) });
    expect(lesson?.note).toMatch(/back|sprawl/i);
  });
});
