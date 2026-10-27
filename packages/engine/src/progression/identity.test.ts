/**
 * Identity: nicknames, the local room, and names that do not repeat themselves. Doc 34 C1.
 *
 * The load-bearing test is the one about training. `localRoom` names a gym and a coach for
 * fighters the world gave neither, and the page shows them — so if that gym and coach were worth
 * anything different from the engine's no-gym default, the page and the model would disagree about
 * the same fighter. The forecast must be identical to the penny.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asGymId } from '../core/ids.js';
import { TRAINING_FOCUSES, forecastTraining } from './development.js';
import { generateFighter, traitContradicts } from './generation.js';
import { hometownOf, localRoom } from './identity.js';
import { earnedNickname, isHighlightFinish, nicknameChance } from './nicknames.js';
import { generateName, NAME_POOLS } from './names.js';
import { makeFighter, TEST_DAY } from '../testing/fixtures.js';
import { TRAITS } from '../domain/traits.js';
import { ELITE_LIFT } from '../ratings/physicalScale.js';
import type { FightRecordEntry } from '../domain/fighter.js';
import { asDivisionId } from '../core/ids.js';

const lightweight = asDivisionId('mens-lightweight');

const generated = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    generateFighter(createRng(`identity:${i}`), {
      id: `id_${i}`,
      divisionId: lightweight,
      sex: 'male',
      day: TEST_DAY,
    }),
  );

describe('the local room', () => {
  const fighter = generated(1)[0]!;

  it('names a gym and a head coach for a generated fighter without one, the same every time', () => {
    const room = localRoom(fighter);
    expect(room?.gym.name).toBeTruthy();
    expect(room?.coach.lastName).toBeTruthy();
    expect(localRoom(fighter)).toEqual(room);
  });

  it('stays out of the way of a real gym, and of seeded fighters', () => {
    expect(localRoom({ ...fighter, gymId: asGymId('g_summit') })).toBeUndefined();
    expect(localRoom({ ...fighter, background: undefined })).toBeUndefined();
    expect(hometownOf({ ...fighter, background: undefined })).toBeUndefined();
  });

  it('trains a fighter exactly as having no gym does', () => {
    const room = localRoom(fighter)!;
    for (const focus of TRAINING_FOCUSES) {
      const input = { fighter, focuses: [focus], weeks: 8, day: TEST_DAY };
      expect(forecastTraining({ ...input, gym: room.gym, coach: room.coach })).toEqual(
        forecastTraining(input),
      );
    }
  });

  it('puts some teammates in the same room', () => {
    const rooms = generated(120)
      .filter((f) => f.nationality === 'USA')
      .map((f) => localRoom(f)!.gym.id);
    expect(new Set(rooms).size).toBeLessThan(rooms.length);
  });
});

describe('nicknames', () => {
  it('goes to a minority of debutants, more of them older and better', () => {
    const share = generated(400).filter((f) => f.nickname).length / 400;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.45);
    expect(nicknameChance(32, 80)).toBeGreaterThan(nicknameChance(21, 40));
  });

  it('is part of the generated fighter, so the same seed gives the same name', () => {
    const [a, b] = [generated(30), generated(30)];
    expect(a.map((f) => f.nickname)).toEqual(b.map((f) => f.nickname));
  });

  const finish = (o: Partial<FightRecordEntry> = {}): FightRecordEntry =>
    ({
      boutId: 'b',
      outcome: 'win',
      method: 'ko',
      round: 1,
      timeSeconds: 40,
      wasTitleFight: false,
      ...o,
    }) as FightRecordEntry;

  it('can be earned with a highlight finish, and only with one', () => {
    expect(isHighlightFinish(finish())).toBe(true);
    expect(isHighlightFinish(finish({ round: 3, timeSeconds: 200 }))).toBe(false);
    expect(isHighlightFinish(finish({ method: 'decisionUnanimous', wasTitleFight: true }))).toBe(
      false,
    );
    expect(isHighlightFinish(finish({ round: 3, timeSeconds: 200, wasTitleFight: true }))).toBe(
      true,
    );

    const star = { ...makeFighter(), starPower: 90 };
    const earned = Array.from({ length: 40 }, (_, i) =>
      earnedNickname(star, finish(), createRng(`earn:${i}`)),
    ).filter(Boolean);
    expect(earned.length).toBeGreaterThan(10);
    // Somebody who already has a name keeps it.
    expect(earnedNickname({ ...star, nickname: 'Iron' }, finish(), createRng('x'))).toBeUndefined();
  });
});

describe('names and traits that contradict themselves', () => {
  it('never produces a first name repeated as the surname', () => {
    for (const pool of NAME_POOLS) {
      for (let i = 0; i < 300; i++) {
        const name = generateName(createRng(`${pool.nationality}:${i}`), 'male', pool.nationality);
        expect(name.firstName).not.toBe(name.lastName);
      }
    }
  });

  it('never hands out a trait the fighter’s own ratings flatly contradict', () => {
    for (const f of generated(300)) {
      for (const id of f.traits) {
        const context = { divisionId: f.divisionId as string, sex: f.sex, eliteLift: ELITE_LIFT };
        expect(traitContradicts(TRAITS[id], f.attributes, context), `${f.id} ${id}`).toBe(false);
      }
    }
  });

  it('calls a Liability cardio a contradiction of Cardio Machine', () => {
    const f = makeFighter({ attributes: { cardio: 30 } });
    expect(traitContradicts(TRAITS.cardioMachine, f.attributes)).toBe(true);
    expect(
      traitContradicts(
        TRAITS.glassCannon,
        makeFighter({ attributes: { durability: 85 } }).attributes,
      ),
    ).toBe(true);
  });
});
