import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asOfficialId } from '../core/ids.js';
import type { Commentator } from '../domain/officials.js';
import { ARCHETYPES } from '../testing/fixtures.js';
import { callFight, describeCommentator, roundImpression } from './broadcast.js';
import { simulateFight } from './simulate.js';
import type { FightEvent } from './types.js';

const booth = (o: Partial<Commentator> = {}): Commentator => ({
  id: asOfficialId('cm_test'),
  name: 'Test Booth',
  styleBias: 0,
  hype: 50,
  companyLine: 50,
  catchphrases: ['Oh he is HURT!'],
  ...o,
});

const ev = (o: Partial<FightEvent> & Pick<FightEvent, 'kind'>): FightEvent => ({
  round: 1,
  timeSeconds: 60,
  text: '',
  ...o,
});

/** A round where red grapples and blue strikes, in equal measure. */
const evenButOpposite: readonly FightEvent[] = [
  ev({ kind: 'takedown', corner: 'red' }),
  ev({ kind: 'positionAdvance', corner: 'red' }),
  ev({ kind: 'groundStrikes', corner: 'red' }),
  ev({ kind: 'strike', corner: 'blue' }),
  ev({ kind: 'combination', corner: 'blue' }),
  ev({ kind: 'kick', corner: 'blue' }),
];

describe('what the booth thinks it watched', () => {
  it('calls an even round for whichever style it prefers', () => {
    // The same round. Two commentators. Two different winners. This is the whole module.
    expect(roundImpression(booth({ styleBias: 0.8 }), evenButOpposite, 1).says).toBe('blue');
    expect(roundImpression(booth({ styleBias: -0.8 }), evenButOpposite, 1).says).toBe('red');
  });

  it('leaves a neutral booth genuinely undecided', () => {
    const neutral = roundImpression(booth({ styleBias: 0 }), evenButOpposite, 1);
    expect(neutral.says).toBeUndefined();
    expect(neutral.conviction).toBe(0);
  });

  it('treats a knockdown as worth far more than a jab', () => {
    const impression = roundImpression(
      booth(),
      [ev({ kind: 'knockdown', corner: 'red' }), ev({ kind: 'strike', corner: 'blue' })],
      1,
    );
    expect(impression.says).toBe('red');
    expect(impression.conviction).toBeGreaterThan(0.3);
  });

  it('makes a hyped booth more certain about the same round', () => {
    const events = [
      ev({ kind: 'strike', corner: 'red' }),
      ev({ kind: 'strike', corner: 'red' }),
      ev({ kind: 'strike', corner: 'blue' }),
    ];
    const loud = roundImpression(booth({ hype: 95 }), events, 1).conviction;
    const quiet = roundImpression(booth({ hype: 10 }), events, 1).conviction;
    expect(loud).toBeGreaterThan(quiet);
  });

  it('ignores rounds it was not asked about', () => {
    const events = [ev({ kind: 'strike', corner: 'red', round: 2 })];
    expect(roundImpression(booth(), events, 1).says).toBeUndefined();
  });
});

describe('calling the fight', () => {
  const result = simulateFight({
    boutId: 'broadcast',
    seed: 'broadcast',
    red: { fighter: ARCHETYPES.smotherer() },
    blue: { fighter: ARCHETYPES.striker() },
  });

  const names = { red: 'Smotherer', blue: 'Striker' } as const;

  it('never mutates or reorders the fight it is calling', () => {
    const before = result.events.length;
    const called = callFight({ commentator: booth(), result, names, rng: createRng('a') });

    expect(result.events).toHaveLength(before);
    // Every original event survives, in order.
    const originals = called.filter((e) => e.kind !== 'colour');
    expect(originals).toEqual(result.events);
  });

  it('adds colour without changing a single outcome', () => {
    const called = callFight({ commentator: booth({ hype: 90 }), result, names, rng: createRng('b') });
    expect(called.filter((e) => e.kind === 'colour').length).toBeGreaterThan(0);
    expect(called.length).toBeGreaterThan(result.events.length);
  });

  it('stays chronological, so the replay screen needs no sorting', () => {
    const called = callFight({ commentator: booth({ hype: 90 }), result, names, rng: createRng('c') });
    for (let i = 1; i < called.length; i++) {
      const prev = called[i - 1]!;
      const cur = called[i]!;
      if (cur.round === prev.round) expect(cur.timeSeconds).toBeGreaterThanOrEqual(prev.timeSeconds);
      else expect(cur.round).toBeGreaterThan(prev.round);
    }
  });

  it('is deterministic for the same booth and seed', () => {
    const a = callFight({ commentator: booth({ hype: 88 }), result, names, rng: createRng('same') });
    const b = callFight({ commentator: booth({ hype: 88 }), result, names, rng: createRng('same') });
    expect(a.map((e) => e.text)).toEqual(b.map((e) => e.text));
  });

  it('gives a hyped booth its catchphrases on the big moments', () => {
    const knockdownFight = simulateFight({
      boutId: 'kd',
      seed: 'kd_seed_7',
      red: { fighter: ARCHETYPES.bomber() },
      blue: { fighter: ARCHETYPES.journeyman() },
    });
    const called = callFight({
      commentator: booth({ hype: 95, catchphrases: ['UNIQUE_CATCHPHRASE'] }),
      result: knockdownFight,
      names: { red: 'Bomber', blue: 'Journeyman' },
      rng: createRng('kd'),
    });
    const hadKnockdown = knockdownFight.events.some((e) => e.kind === 'knockdown');
    if (hadKnockdown) {
      expect(called.some((e) => e.text.includes('UNIQUE_CATCHPHRASE'))).toBe(true);
    }
  });
});

describe('the company man', () => {
  it('bends the round toward whoever the promotion is pushing', () => {
    const result = simulateFight({
      boutId: 'push',
      seed: 'push_seed',
      red: { fighter: ARCHETYPES.smotherer() },
      blue: { fighter: ARCHETYPES.striker() },
    });
    const names = { red: 'Smotherer', blue: 'Striker' } as const;

    const countMentions = (companyLine: number, pushed: 'red' | 'blue') => {
      const called = callFight({
        commentator: booth({ companyLine, styleBias: 0 }),
        result,
        names,
        pushedCorner: pushed,
        rng: createRng('push'),
      });
      return called.filter((e) => e.kind === 'colour' && e.text.includes(names[pushed])).length;
    };

    // Same fight, same booth, same seed — only the instruction differs.
    expect(countMentions(95, 'blue')).toBeGreaterThanOrEqual(countMentions(5, 'blue'));
  });
});

describe('characterisation', () => {
  it('says plainly what kind of booth this is', () => {
    expect(describeCommentator(booth({ styleBias: 0.8, hype: 90 }))).toMatch(/striking/i);
    expect(describeCommentator(booth({ styleBias: -0.8 }))).toMatch(/grappling/i);
    expect(describeCommentator(booth({ hype: 90 }))).toMatch(/volume/i);
    expect(describeCommentator(booth({ companyLine: 92 }))).toMatch(/message/i);
  });
});
