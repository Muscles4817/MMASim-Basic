/**
 * Rankings that make sense. Doc 34 B6.
 *
 * What the audit found on the ladder: a #1 contender who dropped out of the spot while waiting for
 * the title shot, a 4-7 veteran ranked #2 on an old reputation, and a 10-0 fighter sent to the
 * back of the queue by one draw. And underneath, wins counted the same whoever they were against.
 */

import { describe, expect, it } from 'vitest';
import { asDivisionId, asFighterId, asPromotionId } from '../core/ids.js';
import { summariseRecord, type Fighter, type FightRecordEntry } from '../domain/fighter.js';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import { rankDivision, titleShotEligibility } from './ladder.js';
import { INACTIVITY_GRACE_DAYS, winningRun } from './standing.js';
import { scoutedRating, scoutingRead } from './fighterRead.js';

const DIV = asDivisionId('mens-lightweight');
const P = asPromotionId('p_test');
const promotions = [makePromotion()];

const bout = (
  day: number,
  outcome: FightRecordEntry['outcome'],
  opponentId = 'opp',
): FightRecordEntry => ({
  boutId: `b_${opponentId}_${day}`,
  opponentId: asFighterId(opponentId),
  promotionId: P,
  day,
  outcome,
  method: outcome === 'draw' ? 'decisionSplit' : 'decisionUnanimous',
  round: 3,
  timeSeconds: 300,
  divisionId: DIV,
  wasTitleFight: false,
});

/** A fighter whose standing comes only from the bouts given, here. */
function withRecord(id: string, record: FightRecordEntry[], reputation = 50): Fighter {
  const base = makeFighter({ id, divisionId: 'mens-lightweight' });
  return {
    ...base,
    promotionId: P,
    reputation,
    starPower: 30,
    record,
    priorRecord: undefined,
    summary: summariseRecord(record),
  };
}

const order = (fighters: Fighter[], day: number) =>
  rankDivision(fighters, DIV, P, day, undefined, promotions).map((r) => r.fighter.id as string);

describe('the #1 contender', () => {
  it('does not drop out of the spot while waiting for a fight', () => {
    const one = withRecord('one', [bout(100, 'win'), bout(200, 'win'), bout(300, 'win')]);
    const two = withRecord('two', [bout(150, 'win'), bout(250, 'win'), bout(320, 'win', 'weak')]);
    const field = [one, two, withRecord('three', [bout(310, 'win')])];

    const now = order(field, 330);
    // Six months and then most of a year waiting: nobody fought, nothing moved.
    expect(order(field, 330 + 180)).toEqual(now);
    expect(order(field, 300 + INACTIVITY_GRACE_DAYS)).toEqual(now);
  });

  it('does slip once the wait is far longer than a normal gap between fights', () => {
    const idle = withRecord('idle', [bout(100, 'win'), bout(200, 'win'), bout(300, 'win')]);
    // Inside the year, the better record holds the spot against a busier, lesser one...
    const busy = withRecord('busy', [bout(450, 'win'), bout(550, 'win')]);
    expect(order([idle, busy], 600)[0]).toBe('idle');
    // ...and well past it, somebody who kept fighting goes by.
    const late = 300 + INACTIVITY_GRACE_DAYS + 400;
    const kept = withRecord('busy', [bout(450, 'win'), bout(550, 'win'), bout(late - 10, 'win')]);
    expect(order([idle, kept], late)[0]).toBe('busy');
  });
});

describe('a losing record', () => {
  it('is never ranked above a winning one, whatever the reputation', () => {
    const veteranRecord = [
      ...Array.from({ length: 4 }, (_, i) => bout(10 + i, 'win')),
      ...Array.from({ length: 7 }, (_, i) => bout(20 + i, 'loss')),
    ];
    const veteran = withRecord('veteran', veteranRecord, 95);
    const prospects = ['a', 'b', 'c'].map((id) =>
      withRecord(id, [bout(25, 'win'), bout(26, 'win')], 20),
    );
    const ranked = order([veteran, ...prospects], 30);
    expect(ranked.indexOf('veteran')).toBe(ranked.length - 1);
  });
});

describe('a draw', () => {
  it('pauses a run rather than ending it', () => {
    const unbeaten = withRecord('u', [
      ...Array.from({ length: 10 }, (_, i) => bout(i * 10, 'win')),
      bout(120, 'draw'),
    ]);
    expect(unbeaten.summary.streak).toBe(0);
    expect(winningRun(unbeaten)).toBe(10);

    const ranked = rankDivision([unbeaten], DIV, P, 130, undefined, promotions);
    const verdict = titleShotEligibility(unbeaten, ranked, makePromotion({ narrativeControl: 0 }));
    expect(verdict.eligible).toBe(true);
    expect(verdict.reason).toMatch(/10-fight run/);
  });

  it('a loss still ends it', () => {
    const f = withRecord('f', [bout(1, 'win'), bout(2, 'win'), bout(3, 'loss'), bout(4, 'win')]);
    expect(winningRun(f)).toBe(1);
  });
});

describe('quality of wins', () => {
  it('counts a win over somebody respected for more than a win over a name nobody knows', () => {
    const respected = withRecord('respected', [], 90);
    const unknown = withRecord('unknown', [], 10);
    const beatGood = withRecord('good', [
      bout(10, 'win', 'respected'),
      bout(20, 'win', 'respected'),
      bout(30, 'win', 'respected'),
    ]);
    const beatNobody = withRecord('nobody', [
      bout(10, 'win', 'unknown'),
      bout(20, 'win', 'unknown'),
      bout(30, 'win', 'unknown'),
    ]);
    // The two opponents are in the pool so their standing can be read; they are unranked here.
    const ranked = order([beatNobody, beatGood, respected, unknown], 40);
    expect(ranked.indexOf('good')).toBeLessThan(ranked.indexOf('nobody'));
  });
});

describe('what the outside world can see', () => {
  it('calls strengths and holes from the scouted read, not the true ratings', () => {
    const f = withRecord('scouted', [bout(1, 'win')]);
    const read = scoutingRead(f, 10);
    expect(read.strengths.length).toBeGreaterThan(0);
    for (const call of [...read.strengths, ...read.weaknesses]) {
      expect(call.value).toBe(scoutedRating(f, call.key).estimate);
    }
  });
});
