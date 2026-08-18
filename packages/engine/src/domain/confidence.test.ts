/**
 * What a result does to self-belief, and what time does to it afterwards.
 *
 * The model this replaces was `won ? 12 : -16 * lossImpactMultiplier(...)` with no recovery
 * term anywhere in the codebase. Every test here is a property that model could not satisfy —
 * see docs/27 §1.
 */

import { describe, expect, it } from 'vitest';
import { makeFighter } from '../testing/fixtures.js';
import { confidenceSwing, recoverConfidence, type ConfidenceSwingInput } from './confidence.js';
import { confidenceBaseline } from './personality.js';

const base: ConfidenceSwingInput = {
  personality: makeFighter().personality,
  traits: [],
  outcome: 'loss',
  method: 'decisionSplit',
  round: 3,
  knockdownsSuffered: 0,
  scoreMargin: -0.1,
  ratingStep: 0,
};

const swing = (o: Partial<ConfidenceSwingInput> = {}) => confidenceSwing({ ...base, ...o });

describe('how a fight ended', () => {
  it('charges a knockout far more than a split decision', () => {
    const razor = swing({ method: 'decisionSplit', scoreMargin: -0.05 });
    const flattened = swing({ method: 'ko', round: 1, scoreMargin: undefined });
    expect(flattened).toBeLessThan(razor * 2.5);
  });

  it('orders the finishes the way fighters do: KO worse than TKO worse than submission', () => {
    const of = (method: ConfidenceSwingInput['method']) =>
      -swing({ method, round: 2, scoreMargin: undefined });
    expect(of('ko')).toBeGreaterThan(of('tko'));
    expect(of('tko')).toBeGreaterThan(of('submission'));
    // Losing on a foul says nothing about whether you can fight.
    expect(of('dq')).toBeLessThan(of('submission'));
  });

  it('charges an early stoppage more than a late one', () => {
    const early = -swing({ method: 'tko', round: 1, scoreMargin: undefined });
    const late = -swing({ method: 'tko', round: 5, scoreMargin: undefined });
    expect(early).toBeGreaterThan(late);
  });

  it('treats a no-contest as the non-event it is', () => {
    expect(swing({ outcome: 'noContest', method: 'noContest' })).toBe(0);
  });
});

describe('how one-sided it was', () => {
  it('charges a shut-out more than a razor-thin decision', () => {
    const razor = -swing({ method: 'decisionUnanimous', scoreMargin: -0.05 });
    const sweep = -swing({ method: 'decisionUnanimous', scoreMargin: -1 });
    expect(sweep).toBeGreaterThan(razor);
  });

  it('pays more for a dominant win than a squeaker', () => {
    const squeaker = swing({ outcome: 'win', method: 'decisionSplit', scoreMargin: 0.05 });
    const sweep = swing({ outcome: 'win', method: 'decisionUnanimous', scoreMargin: 1 });
    expect(sweep).toBeGreaterThan(squeaker);
  });

  it('reads a draw off the cards, because who it favours depends on who was ahead', () => {
    // Robbed of a win they were clearly winning: it stings.
    expect(swing({ outcome: 'draw', method: 'draw', scoreMargin: 0.9 })).toBeLessThan(0);
    // Escaped with one they were losing: relief.
    expect(swing({ outcome: 'draw', method: 'draw', scoreMargin: -0.9 })).toBeGreaterThan(0);
  });
});

describe('who it was against', () => {
  it('does not punish a fighter for losing to somebody far better', () => {
    const upLevel = -swing({ method: 'tko', scoreMargin: undefined, ratingStep: 12 });
    const shouldHaveWon = -swing({ method: 'tko', scoreMargin: undefined, ratingStep: -12 });
    expect(shouldHaveWon).toBeGreaterThan(upLevel);
  });

  it('pays properly for beating somebody you had no business beating', () => {
    const upset = swing({ outcome: 'win', method: 'ko', scoreMargin: undefined, ratingStep: 12 });
    const routine = swing({
      outcome: 'win',
      method: 'ko',
      scoreMargin: undefined,
      ratingStep: -12,
    });
    expect(upset).toBeGreaterThan(routine);
  });
});

describe('being hurt, whatever the scorecards said', () => {
  it('takes something off a win the fighter was dropped twice in', () => {
    const clean = swing({ outcome: 'win', method: 'decisionUnanimous', scoreMargin: 0.6 });
    const survived = swing({
      outcome: 'win',
      method: 'decisionUnanimous',
      scoreMargin: 0.6,
      knockdownsSuffered: 2,
    });
    expect(survived).toBeLessThan(clean);
    // But it is still a win. Being dropped does not make winning a bad night.
    expect(survived).toBeGreaterThan(0);
  });
});

describe('the person it happened to', () => {
  it('charges a fragile fighter more than a resilient one for the same loss', () => {
    const fragile = makeFighter({ personality: { resilience: 5 } }).personality;
    const tough = makeFighter({ personality: { resilience: 95 } }).personality;
    expect(-swing({ personality: fragile })).toBeGreaterThan(-swing({ personality: tough }));
  });

  it('lets a big ego deflect a loss the same fighter would otherwise carry', () => {
    const humble = makeFighter({ personality: { ego: 5 } }).personality;
    const arrogant = makeFighter({ personality: { ego: 95 } }).personality;
    expect(-swing({ personality: arrogant })).toBeLessThan(-swing({ personality: humble }));
  });

  it('reads the traits that were written to describe exactly this', () => {
    const plain = -swing({ method: 'ko', scoreMargin: undefined });
    // `durableMind` is acquired by surviving a knockout and, until docs/27, had no bearing on
    // what that knockout cost.
    expect(-swing({ method: 'ko', scoreMargin: undefined, traits: ['durableMind'] })).toBeLessThan(
      plain,
    );
    expect(
      -swing({ method: 'ko', scoreMargin: undefined, traits: ['fragileEgo'] }),
    ).toBeGreaterThan(plain);
  });
});

describe('recovery', () => {
  const p = makeFighter().personality;

  it('brings a beaten fighter back toward their baseline', () => {
    const after = recoverConfidence(12, p, 1);
    expect(after).toBeGreaterThan(12);
    expect(after).toBeLessThan(confidenceBaseline(p));
  });

  it('cools an inflated fighter back down too, so it cannot ratchet upward', () => {
    expect(recoverConfidence(100, p, 1)).toBeLessThan(100);
    expect(recoverConfidence(100, p, 1)).toBeGreaterThan(confidenceBaseline(p));
  });

  it('never overshoots, however long the span', () => {
    expect(recoverConfidence(1, p, 50)).toBeCloseTo(confidenceBaseline(p), 5);
    expect(recoverConfidence(100, p, 50)).toBeCloseTo(confidenceBaseline(p), 5);
  });

  it('gives the same answer however the elapsed time was chopped up', () => {
    /*
     * Load-bearing rather than tidy. `applyAgeing` is called with a fortnight by the world tick
     * and with ten weeks by a camp, so a fighter aged in small steps must not end up anywhere
     * different from one aged in a single jump.
     */
    const oneGo = recoverConfidence(20, p, 1);
    let stepped = 20;
    for (let i = 0; i < 26; i++) stepped = recoverConfidence(stepped, p, 1 / 26);
    expect(stepped).toBeCloseTo(oneGo, 6);
  });

  it('brings a resilient fighter back faster than a fragile one', () => {
    const fragile = makeFighter({ personality: { resilience: 5, ambition: 5 } }).personality;
    const tough = makeFighter({ personality: { resilience: 95, ambition: 95 } }).personality;
    const gap = (q: typeof p) =>
      (recoverConfidence(10, q, 0.5) - 10) / (confidenceBaseline(q) - 10);
    expect(gap(tough)).toBeGreaterThan(gap(fragile));
  });

  it('does nothing when no time has passed', () => {
    expect(recoverConfidence(37, p, 0)).toBe(37);
  });
});

describe('the arithmetic that killed careers', () => {
  /*
   * The old model paid 12 for a win and charged 16 for a loss with no recovery, so a fighter
   * needed a 57% win rate merely to hold station and everybody below it bled to the floor. The
   * fix is not a bigger win — belief really is easier to damage than to build — it is that time
   * passes between fights. This is the property that matters, and it is why the recovery term
   * rather than the swing table is the load-bearing half of the change.
   */
  it('leaves a .500 fighter fighting twice a year stable rather than doomed', () => {
    const p = makeFighter().personality;
    let confidence = confidenceBaseline(p);
    for (let i = 0; i < 20; i++) {
      const won = i % 2 === 0;
      confidence += swing({
        personality: p,
        outcome: won ? 'win' : 'loss',
        method: won ? 'decisionUnanimous' : 'decisionUnanimous',
        scoreMargin: won ? 0.4 : -0.4,
      });
      confidence = recoverConfidence(Math.max(1, confidence), p, 0.5);
    }
    // Not thriving — a .500 record should not feel good — but nowhere near the floor that
    // `retirementUrge` reads as a finished fighter.
    expect(confidence).toBeGreaterThan(35);
  });
});
