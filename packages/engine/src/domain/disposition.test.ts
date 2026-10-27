/**
 * What a fighter wants, read from where they stand.
 *
 * Two of doc 34 C1's contradictions landed here: a champion (rank 0) fell through to "Somebody
 * ranked", and the fighter page passed `daysIdle: 0` so "To be booked" could never appear. The
 * second is the page's bug; this pins the rule it now reaches.
 */

import { describe, expect, it } from 'vitest';
import { wantsOf } from './disposition.js';
import { makeFighter } from '../testing/fixtures.js';

const ambitious = (streak = 3) => {
  const f = makeFighter({ personality: { ambition: 80 } });
  return { ...f, summary: { ...f.summary, streak } };
};

describe('wantsOf', () => {
  it('gives a champion a champion’s want, not a contender’s', () => {
    const want = wantsOf({ fighter: ambitious(), day: 0, rank: 0, daysIdle: 30 });
    expect(want.id).toBe('worthyChallenger');
    expect(want.label).not.toMatch(/somebody ranked/i);
  });

  it('still sends a ranked contender after ranked opposition', () => {
    expect(wantsOf({ fighter: ambitious(1), day: 0, rank: 7, daysIdle: 30 }).id).toBe(
      'rankedOpponent',
    );
  });

  it('wants to be booked after a long spell on the shelf', () => {
    expect(wantsOf({ fighter: ambitious(1), day: 0, rank: 7, daysIdle: 300 }).id).toBe('activity');
  });
});
