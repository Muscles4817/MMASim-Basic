/**
 * Heat as the game actually accrues it.
 *
 * `business/heat.ts` is unit-tested against the rules; this tests the wiring — that fighting
 * somebody twice produces a rivalry the world can see, that it survives a save, and that a
 * gracious loser does not manufacture a feud out of nothing.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { currentHeat, uniformPersonality, type Fighter } from '@mmasim/engine';
import {
  accrueHeatFromFight,
  getRivalry,
  previousMeetings,
  rivalriesFor,
} from '../../packages/app/src/game/rivalries';
import { simulateFight } from '@mmasim/engine';

function twoFighters(db: ReturnType<typeof createNewGame>): [Fighter, Fighter] {
  const all = db.fighters.findAll() as Fighter[];
  const division = all[0]!.divisionId;
  const inDivision = all.filter((f) => f.divisionId === division);
  return [inDivision[0]!, inDivision[1]!];
}

function fightThem(
  db: ReturnType<typeof createNewGame>,
  red: Fighter,
  blue: Fighter,
  seed: string,
  personality?: Partial<ReturnType<typeof uniformPersonality>>,
) {
  const loserPersonality = personality
    ? { ...uniformPersonality(50), ...personality }
    : undefined;

  const result = simulateFight({
    boutId: `riv_${seed}`,
    seed,
    red: { fighter: red },
    blue: { fighter: blue },
  });

  const withPersonality = (f: Fighter): Fighter =>
    loserPersonality ? { ...f, personality: loserPersonality } : f;

  return accrueHeatFromFight(db, {
    result,
    red: withPersonality(red),
    blue: withPersonality(blue),
    day: 0,
    isTitleFight: false,
    seed: `heat_${seed}`,
  });
}

describe('a fight builds its own rematch', () => {
  it('starts every pairing cold', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);
    expect(currentHeat(getRivalry(db, a.id, b.id, 0), 0)).toBe(0);
  });

  it('generates heat from having happened at all', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);

    fightThem(db, a, b, 'seed_one');
    expect(currentHeat(getRivalry(db, a.id, b.id, 0), 0)).toBeGreaterThan(0);
  });

  it('compounds when they keep meeting', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);

    fightThem(db, a, b, 'seed_one');
    const afterOne = currentHeat(getRivalry(db, a.id, b.id, 0), 0);
    fightThem(db, a, b, 'seed_two');
    const afterTwo = currentHeat(getRivalry(db, a.id, b.id, 0), 0);

    expect(afterTwo).toBeGreaterThan(afterOne);
  });

  it('persists, so the world remembers a grudge', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);
    fightThem(db, a, b, 'seed_one');
    db.save();

    // Read back through the repository rather than the in-memory object.
    const stored = db.rivalries.findAll();
    expect(stored.length).toBe(1);
    expect(stored[0]!.fighterIds).toContain(a.id);
    expect(stored[0]!.fighterIds).toContain(b.id);
  });

  it('files the pairing under one rivalry however the two are ordered', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);

    fightThem(db, a, b, 'seed_one');
    fightThem(db, b, a, 'seed_two');

    expect(db.rivalries.findAll()).toHaveLength(1);
  });
});

describe('who takes it personally', () => {
  it('does not manufacture a feud out of a placid loser', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);

    // Ten meetings, and the loser is somebody who shakes hands and goes home.
    for (let i = 0; i < 10; i++) {
      fightThem(db, a, b, `calm_${i}`, { aggression: 3, ego: 3 });
    }

    expect(getRivalry(db, a.id, b.id, 0).isRivalry).toBe(false);
  });

  it('lets a hothead turn the same fights into a grudge', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);

    for (let i = 0; i < 10; i++) {
      fightThem(db, a, b, `hot_${i}`, { aggression: 97, ego: 97 });
    }

    expect(getRivalry(db, a.id, b.id, 0).isRivalry).toBe(true);
  });
});

describe('what the profile screen reads', () => {
  it('lists a hot pairing and hides a cold one', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);

    expect(rivalriesFor(db, a.id, 0)).toHaveLength(0);

    for (let i = 0; i < 3; i++) fightThem(db, a, b, `hot_${i}`, { aggression: 90, ego: 90 });

    const listed = rivalriesFor(db, a.id, 0);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.otherId).toBe(b.id);
  });

  it('forgets an old pairing nobody maintained', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);
    fightThem(db, a, b, 'seed_one');

    // Two years later, with nothing said in between.
    expect(rivalriesFor(db, a.id, 730)).toHaveLength(0);
  });
});

describe('previous meetings', () => {
  it('counts nothing for two fighters who have never met', () => {
    const db = createNewGame({ adapter: undefined });
    const [a, b] = twoFighters(db);
    expect(previousMeetings(a, b.id).total).toBe(0);
  });
});
