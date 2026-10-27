/**
 * Star power, read rather than printed. Doc 34 C2.
 *
 * The negative test leads, as it does for `abilityRead`: the number must not leave. After that,
 * each read has to follow what actually happened — a trend off the record, a persona off the axes —
 * because a stored or scripted label is wrong the day after the fighter changes.
 */

import { describe, expect, it } from 'vitest';
import {
  TREND_BONUS_EXTRA,
  TREND_TITLE_EXTRA,
  drawRead,
  fightSells,
  personaOf,
  starMomentum,
  starTrend,
} from './starPower.js';
import { starPerformanceValue } from './aftermath.js';
import { makeFighter, TEST_DAY } from '../testing/fixtures.js';
import type { Fighter, FightRecordEntry } from '../domain/fighter.js';
import { emptyRecordSummary, summariseRecord } from '../domain/fighter.js';
import type { FighterId, PromotionId } from '../core/ids.js';
import { asDivisionId } from '../core/ids.js';

const DAY = 2000;

const bout = (
  i: number,
  outcome: FightRecordEntry['outcome'],
  method: FightRecordEntry['method'] = 'decisionUnanimous',
  day = DAY - 300 + i * 60,
): FightRecordEntry => ({
  boutId: `b${i}`,
  opponentId: 'x' as FighterId,
  promotionId: 'p' as PromotionId,
  day,
  outcome,
  method,
  round: 3,
  timeSeconds: 300,
  divisionId: asDivisionId('mens-lightweight'),
  wasTitleFight: false,
});

const withRecord = (f: Fighter, record: FightRecordEntry[]): Fighter => ({
  ...f,
  record,
  priorRecord: emptyRecordSummary(),
  summary: summariseRecord(record),
});

describe('the draw', () => {
  it('never returns the star-power number', () => {
    for (const starPower of [3, 22, 41, 58, 77, 96]) {
      const read = drawRead({ ...makeFighter(), starPower }, DAY);
      expect(JSON.stringify(read)).not.toContain(`:${starPower}`);
      expect(read.label).not.toMatch(/\d/);
    }
  });

  it('bands from unknown to headliner', () => {
    expect(drawRead({ ...makeFighter(), starPower: 5 }, DAY).klass).toBe('unknown');
    expect(drawRead({ ...makeFighter(), starPower: 55 }, DAY).klass).toBe('mainCard');
    expect(drawRead({ ...makeFighter(), starPower: 85 }, DAY).klass).toBe('headliner');
  });

  it('knows a home fighter from the market being asked about', () => {
    const f = makeFighter();
    expect(drawRead(f, DAY, f.nationality).atHome).toBe(true);
    expect(drawRead(f, DAY, 'Japan').atHome).toBe(false);
    expect(drawRead(f, DAY).atHome).toBeUndefined();
  });
});

describe('the trend', () => {
  it('rises on finishes, fades on losses, and fades out of sight', () => {
    const f = makeFighter();
    expect(
      starTrend(withRecord(f, [bout(1, 'win', 'ko'), bout(2, 'win', 'submission')]), DAY).id,
    ).toBe('rising');
    expect(starTrend(withRecord(f, [bout(1, 'loss'), bout(2, 'loss')]), DAY).id).toBe('fading');
    expect(starTrend(withRecord(f, [bout(1, 'win', 'ko', DAY - 500)]), DAY).id).toBe('fading');
    expect(starTrend(f, DAY).id).toBe('steady');
  });

  it('weighs a result exactly as the aftermath moves star power, plus the named extras', () => {
    // One function, shared: the trend cannot drift from the number it describes.
    for (const outcome of ['win', 'loss', 'draw', 'noContest'] as const) {
      for (const method of ['ko', 'submission', 'decisionUnanimous', 'draw'] as const) {
        expect(starMomentum(bout(1, outcome, method))).toBe(
          starPerformanceValue(outcome === 'win', method),
        );
      }
    }
    const titleBonus = {
      ...bout(1, 'win', 'ko'),
      wasTitleFight: true,
      bonus: 'performance' as const,
    };
    expect(starMomentum(titleBonus)).toBe(
      starPerformanceValue(true, 'ko') + TREND_TITLE_EXTRA + TREND_BONUS_EXTRA,
    );
    // Extras are for winning nights only.
    expect(starMomentum({ ...bout(1, 'loss'), wasTitleFight: true })).toBe(
      starPerformanceValue(false, 'decisionUnanimous'),
    );
  });
});

describe('the persona', () => {
  it('comes from who they are, not from a label handed out', () => {
    expect(personaOf(makeFighter({ traits: ['trashTalker'] }), TEST_DAY).id).toBe('heel');
    expect(personaOf(makeFighter({ personality: { charisma: 80, ego: 30 } }), TEST_DAY).id).toBe(
      'fanFavourite',
    );
    const finisher = withRecord(
      makeFighter({ personality: { charisma: 20 } }),
      [1, 2, 3, 4, 5].map((i) => bout(i, 'win', 'ko')),
    );
    expect(personaOf(finisher, DAY).id).toBe('quietKiller');
    expect(personaOf(makeFighter(), TEST_DAY).id).toBe('professional');
  });
});

describe('what a fight sells', () => {
  it('leads with the belt, and names the star who carries it', () => {
    const star = { ...makeFighter({ lastName: 'Star' }), starPower: 80 };
    const nobody = { ...makeFighter({ lastName: 'Nobody' }), starPower: 5 };
    const titled = fightSells({ a: star, b: nobody, day: DAY, isTitleFight: true });
    expect(titled.headline).toBe('A belt on the line');
    expect(fightSells({ a: star, b: nobody, day: DAY }).headline).toMatch(/Star’s name/);
  });

  it('puts a villain against a favourite on the poster', () => {
    const heel = makeFighter({ traits: ['trashTalker'] });
    const hero = makeFighter({ personality: { charisma: 80, ego: 30 } });
    expect(fightSells({ a: heel, b: hero, day: DAY }).hooks).toContain(
      'A villain to boo and a favourite to back',
    );
  });

  it('admits when there is nothing to sell', () => {
    const a = { ...makeFighter(), starPower: 5 };
    expect(fightSells({ a, b: a, day: DAY }).headline).toMatch(/hardcore/);
  });
});
