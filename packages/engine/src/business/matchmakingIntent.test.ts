/**
 * Why a promoter makes a fight.
 *
 * The claim under test: **the same two fighters are a good idea or a terrible one depending on
 * what the promoter is trying to do**, and the model has to be able to tell those apart and say
 * which. `offerOpponents` answers eligibility; this answers purpose, and until it existed the
 * matchmaker could propose nine fights and not say a word about any of them.
 */

import { describe, expect, it } from 'vitest';
import {
  GROUP_ORDER,
  appraiseMatchup,
  groupFor,
  matchIntent,
  scoreForIntent,
  MATCH_INTENTS,
} from './matchmakingIntent.js';
import { makeFighter, makePromotion, TEST_DAY } from '../testing/fixtures.js';
import { uniformAttributes } from '../ratings/attributes.js';
import { emptyRecordSummary } from '../domain/fighter.js';
import type { Fighter, RecordSummary } from '../domain/fighter.js';

const promotion = makePromotion();

const at = (value: number, o: Parameters<typeof makeFighter>[0] = {}): Fighter =>
  makeFighter({ attributes: uniformAttributes(value), ...o });

const withRecord = (fighter: Fighter, o: Partial<RecordSummary>): Fighter => ({
  ...fighter,
  summary: { ...emptyRecordSummary(), ...o },
});

const appraise = (
  subject: Fighter,
  opponent: Fighter,
  extra: Partial<Parameters<typeof appraiseMatchup>[0]> = {},
) => appraiseMatchup({ subject, opponent, promotion, day: TEST_DAY, ...extra });

describe('reading a pairing', () => {
  it('calls two fighters of the same standard competitive', () => {
    const read = appraise(at(60, { id: 'a' }), at(60, { id: 'b' }));
    expect(read.tags).toContain('competitive');
    expect(read.tags).not.toContain('mismatch');
  });

  it('calls a large gap one-sided', () => {
    const read = appraise(at(80, { id: 'a' }), at(40, { id: 'b' }));
    expect(read.tags).toContain('mismatch');
    expect(read.tags).toContain('stepDown');
  });

  it('rates a fight between two ranked fighters as meaning more than one between two unranked', () => {
    const ranked = appraise(at(65, { id: 'a' }), at(65, { id: 'b' }), {
      subjectRank: 2,
      opponentRank: 3,
    });
    const unranked = appraise(at(65, { id: 'c' }), at(65, { id: 'd' }));
    expect(ranked.sporting).toBeGreaterThan(unranked.sporting);
  });

  it('rates a fight between two names as more commercial than one between two unknowns', () => {
    const known = appraise(at(60, { id: 'a', starPower: 80 }), at(60, { id: 'b', starPower: 75 }));
    const unknown = appraise(at(60, { id: 'c', starPower: 8 }), at(60, { id: 'd', starPower: 6 }));
    expect(known.commercial).toBeGreaterThan(unknown.commercial);
  });
});

describe('risk is what a loss would cost, not only how likely it is', () => {
  it('rates the same fight as riskier for an unbeaten prospect than for a journeyman', () => {
    /*
     * The distinction that makes protecting somebody a coherent decision. A prospect losing to a
     * contender costs them a year; a journeyman losing to the same man costs nothing anybody will
     * remember, and a model that only reads the odds cannot say so.
     */
    const opponent = at(66, { id: 'opp' });
    const prospect = withRecord(at(58, { id: 'prospect', age: 24 }), { wins: 8, losses: 0 });
    const journeyman = withRecord(at(58, { id: 'journeyman', age: 32 }), { wins: 14, losses: 12 });

    expect(appraise(prospect, opponent).risk).toBeGreaterThan(appraise(journeyman, opponent).risk);
  });

  it('rates a dangerous finisher as riskier than an equally rated points fighter', () => {
    const subject = at(60, { id: 'subject' });
    const dangerous = makeFighter({
      id: 'dangerous',
      attributes: { ...uniformAttributes(60), power: 95, submissions: 90 },
    });
    const safe = makeFighter({
      id: 'safe',
      attributes: { ...uniformAttributes(60), power: 25, submissions: 20 },
    });

    expect(appraise(subject, dangerous).risk).toBeGreaterThan(appraise(subject, safe).risk);
  });
});

describe('purpose', () => {
  it('recognises a step up for a young winner as a prospect test', () => {
    const prospect = withRecord(at(55, { id: 'p', age: 23 }), { wins: 9, losses: 0, streak: 5 });
    const read = appraise(prospect, at(66, { id: 'o' }));
    expect(read.intents).toContain('testProspect');
  });

  it('recognises a soft touch for the same prospect as a build-up', () => {
    const prospect = withRecord(at(55, { id: 'p', age: 23 }), { wins: 9, losses: 0, streak: 5 });
    const read = appraise(prospect, at(45, { id: 'o' }));
    expect(read.intents).toContain('buildProspect');
  });

  it('recognises two top contenders as an eliminator', () => {
    const read = appraise(at(70, { id: 'a' }), at(70, { id: 'b' }), {
      subjectRank: 2,
      opponentRank: 3,
    });
    expect(read.intents).toContain('titleEliminator');
    expect(read.tags).toContain('titleEligible');
  });

  it('recognises a rising fighter against a fading name', () => {
    const rising = withRecord(at(62, { id: 'rising', age: 25 }), {
      wins: 10,
      losses: 1,
      streak: 5,
    });
    const fading = withRecord(at(58, { id: 'fading', age: 36, starPower: 78 }), {
      wins: 24,
      losses: 9,
      streak: -3,
    });
    expect(appraise(rising, fading).intents).toContain('changingOfTheGuard');
  });

  it('always says why, even when nothing special is going on', () => {
    // A suggestion the player cannot interrogate is the game playing itself.
    const read = appraise(at(50, { id: 'a' }), at(52, { id: 'b' }));
    expect(read.rationale.length).toBeGreaterThan(0);
  });
});

describe('scoring against a purpose', () => {
  it('re-ranks the same pairing when the purpose changes', () => {
    /*
     * The whole reason the intent picker is a real control rather than a label: the list does
     * not change, the order does.
     */
    const soft = appraise(at(60, { id: 'a' }), at(46, { id: 'b' }));
    expect(scoreForIntent(soft, 'buildProspect')).toBeGreaterThan(
      scoreForIntent(soft, 'testProspect'),
    );

    const hard = appraise(at(60, { id: 'c' }), at(74, { id: 'd' }));
    expect(scoreForIntent(hard, 'testProspect')).toBeGreaterThan(
      scoreForIntent(hard, 'buildProspect'),
    );
  });

  it('scores every purpose in range', () => {
    const read = appraise(at(60, { id: 'a' }), at(62, { id: 'b' }));
    for (const intent of MATCH_INTENTS) {
      const score = scoreForIntent(read, intent.id);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe('grouping', () => {
  it('puts every pairing in a group the picker knows how to render', () => {
    const read = appraise(at(60, { id: 'a' }), at(61, { id: 'b' }));
    expect(GROUP_ORDER).toContain(groupFor(read, false));
    expect(groupFor(read, true)).toBe('recommended');
  });
});

describe('the intent table', () => {
  it('falls back rather than throwing on an unknown purpose', () => {
    expect(matchIntent('nonsense' as never).id).toBe('competitive');
  });

  it('gives every purpose a promoter-facing sentence', () => {
    for (const intent of MATCH_INTENTS) {
      expect(intent.blurb.length, `${intent.id} has no explanation`).toBeGreaterThan(20);
    }
  });
});
