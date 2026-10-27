/**
 * Career events: division moves, the move-up want, retirement's stages, head space, medical
 * history. Doc 34 C6.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { wantsOf } from '../domain/disposition.js';
import { headSpaceRead } from '../domain/headSpace.js';
import { medicalHistory } from '../health/medicalHistory.js';
import { generateFighter } from './generation.js';
import { MOVE_SETTLE_DAYS, chooseDivisionMove, cutSeverityOf } from './divisionMove.js';
import { bodyOf } from './body.js';
import { nicknameOnArrival } from './nicknames.js';
import {
  comebackChance,
  isConsideringRetirement,
  retirementUrge,
  wantsFarewell,
} from './retirement.js';

const DAY = 365 * 30;

const make = (division: string, i: number, age = 28): Fighter =>
  generateFighter(createRng(`c6:${division}:${i}`), {
    id: `c6_${division}_${i}`,
    divisionId: asDivisionId(division),
    sex: 'male',
    day: DAY,
    age,
  });

/** A middleweight's body entered at lightweight: a cut nobody should be making. */
const overweight = (i: number): Fighter => ({
  ...make('mens-middleweight', i),
  divisionId: asDivisionId('mens-lightweight'),
});

describe('the world’s division moves', () => {
  const choose = (
    fighter: Fighter,
    extra: Partial<Parameters<typeof chooseDivisionMove>[0]> = {},
  ) =>
    chooseDivisionMove({
      fighter,
      day: DAY as never,
      isChampion: false,
      fieldOf: () => [50],
      fighterOverall: 50,
      age: 28,
      rng: createRng(`choose:${fighter.id}`),
      ...extra,
    });

  it('moves somebody killing themselves at the weight up, and only up one', () => {
    const fighters = Array.from({ length: 60 }, (_, i) => overweight(i)).filter(
      (f) => cutSeverityOf(bodyOf(f), f.divisionId) >= 0.7,
    );
    expect(fighters.length).toBeGreaterThan(10);
    const moves = fighters.map((f) => choose(f)).filter((m) => m !== undefined);
    expect(moves.length).toBeGreaterThan(fighters.length * 0.2);
    for (const m of moves) {
      expect(m!.target).toBe('mens-welterweight');
      expect(m!.reason).toBe('cut');
    }
  });

  it('never moves a champion, nor somebody who moved recently', () => {
    for (let i = 0; i < 40; i++) {
      const f = overweight(i);
      expect(choose(f, { isChampion: true })).toBeUndefined();
      expect(
        choose({ ...f, lastDivisionChangeDay: (DAY - MOVE_SETTLE_DAYS + 10) as never }),
      ).toBeUndefined();
    }
  });

  it('leaves a taken nickname at the door', () => {
    expect(nicknameOnArrival('The Hammer', new Set(['The Hammer']))).toBeUndefined();
    expect(nicknameOnArrival('The Hammer', new Set(['Iron']))).toBe('The Hammer');
    expect(nicknameOnArrival(undefined, new Set())).toBeUndefined();
  });

  it('gives a fighter struggling with the cut the want to move up', () => {
    const f = overweight(0);
    const want = wantsOf({ fighter: { ...f, resentment: 0 }, day: DAY, daysIdle: 0 });
    expect(['moveUp', 'farewell']).toContain(want.id);
  });
});

describe('retirement, in stages', () => {
  const veteran = (i: number): Fighter => {
    const f = make('mens-lightweight', i, 39);
    return {
      ...f,
      starPower: 60,
      personality: { ...f.personality, ego: 70 },
      summary: { ...f.summary, wins: 20, losses: 9, streak: -3 },
      condition: { ...f.condition, confidence: 25, bodyWear: 40, headTrauma: 30 },
    };
  };

  it('has a fighter consider it before they go, and the proud ones ask for a farewell', () => {
    const v = veteran(1);
    expect(retirementUrge(v, DAY as never)).toBeGreaterThan(0.45);
    expect(isConsideringRetirement(v, DAY as never)).toBe(true);
    expect(wantsFarewell(v, DAY as never)).toBe(true);
    expect(wantsOf({ fighter: v, day: DAY, daysIdle: 0 }).id).toBe('farewell');
    const quiet = { ...v, personality: { ...v.personality, ego: 20 } };
    expect(wantsFarewell(quiet, DAY as never)).toBe(false);
  });

  it('brings some back: never too soon, more often when broke or proud, never on medical grounds', () => {
    const retired = { ...veteran(2), retiredDay: (DAY - 365) as never };
    const at = (f: Fighter, off: number) =>
      comebackChance({ ...f, retiredDay: (DAY - off) as never }, DAY as never);
    const young = { ...retired, birthDay: (DAY - 33 * 365) as never };
    expect(at(young, 30)).toBe(0);
    expect(at(young, 365)).toBeGreaterThan(0);
    expect(at({ ...young, bank: -20 }, 365)).toBeGreaterThan(at({ ...young, bank: 500 }, 365));
    expect(at({ ...young, condition: { ...young.condition, headTrauma: 70 } }, 365)).toBe(0);
    expect(at(young, 365 * 5)).toBe(0);
  });
});

describe('head space', () => {
  it('names the fight that put it there', () => {
    const f = make('mens-lightweight', 3);
    const read = headSpaceRead(
      {
        ...f,
        condition: { ...f.condition, confidence: 25 },
        record: [
          {
            opponentId: 'a' as never,
            outcome: 'loss',
            method: 'decisionUnanimous',
            day: 10,
          } as never,
          { opponentId: 'b' as never, outcome: 'loss', method: 'ko', day: 20 } as never,
          {
            opponentId: 'c' as never,
            outcome: 'win',
            method: 'decisionUnanimous',
            day: 30,
          } as never,
        ],
      },
      (id) => (id === 'b' ? 'Bruno Silva' : 'Somebody'),
    );
    expect(read.level).toBe('fragile');
    expect(read.cause?.opponentId).toBe('b');
    expect(read.sentence).toMatch(/knockout against Bruno Silva/);
    expect(read.options.map((o) => o.id)).toEqual(['tuneUp', 'timeOff', 'psychologist']);
    expect(read.options.find((o) => o.id === 'psychologist')!.available).toBe(false);
  });

  it('says nothing when they are fine', () => {
    const f = make('mens-lightweight', 4);
    expect(
      headSpaceRead({ ...f, condition: { ...f.condition, confidence: 70 } }, () => '').options,
    ).toEqual([]);
  });
});

describe('medical history', () => {
  it('lists layoffs newest first and flags what keeps coming back', () => {
    const injury = (id: string, type: 'hand' | 'knee', day: number, weeks: number) =>
      ({ id, type, day, healedDay: day + weeks * 7, severity: 0.5, source: 'fight' }) as never;
    const history = medicalHistory(
      {
        injuries: [
          injury('i1', 'hand', 100, 8),
          injury('i2', 'knee', 400, 20),
          injury('i3', 'hand', 800, 10),
        ],
      },
      1000 as never,
    );
    expect(history.entries.map((e) => e.injury.id)).toEqual(['i3', 'i2', 'i1']);
    expect(history.entries[0]!.recurrence).toBe(true);
    expect(history.entries[2]!.recurrence).toBe(false);
    expect(history.recurring).toEqual([{ type: 'hand', label: 'Hand', times: 2 }]);
    expect(history.weeksOut).toBe(38);
    expect(history.longestLayoff).toBe(20);
  });
});
