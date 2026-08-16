import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { JUDGE_ARCHETYPES, defaultJudges, type Judge } from '../domain/officials.js';
import { asOfficialId } from '../core/ids.js';
import {
  buildScorecards,
  emptyTally,
  readDecision,
  roundMargin,
  scoreRound,
  type RoundTally,
} from './scoring.js';
import type { Corner, Scorecard } from './types.js';

/**
 * Scoring had no direct coverage, which is how a 10-10 rule that ignored submission attempts
 * — and therefore turned a dominant grappling round into a drawn fight — survived.
 */

const tally = (overrides: Partial<RoundTally> = {}): RoundTally => ({ ...emptyTally(), ...overrides });

const judge = (bias: keyof typeof JUDGE_ARCHETYPES, consistency = 100): Judge => ({
  id: asOfficialId(`j_${bias}`),
  name: bias,
  bias: JUDGE_ARCHETYPES[bias]!,
  // Consistency 100 means zero noise, so these tests assert on the criteria rather than luck.
  consistency,
});

describe('roundMargin', () => {
  it('is zero when nothing happened', () => {
    expect(roundMargin(judge('balanced'), tally(), tally(), createRng('a'))).toBe(0);
  });

  it('favours the fighter who did more of what the judge rewards', () => {
    const red = tally({ damageDealt: 40, significantStrikes: 20 });
    const blue = tally({ damageDealt: 5, significantStrikes: 3 });
    expect(roundMargin(judge('damageFirst'), red, blue, createRng('a'))).toBeGreaterThan(0);
    expect(roundMargin(judge('damageFirst'), blue, red, createRng('a'))).toBeLessThan(0);
  });

  it('lets different judges genuinely disagree about the same round', () => {
    // The control wrestler grinds; the striker lands more. This is the whole reason three
    // bias vectors exist rather than one scoring function.
    const grinder = tally({ controlSeconds: 260, takedowns: 3, damageDealt: 12 });
    const striker = tally({ significantStrikes: 22, strikesAttempted: 50, damageDealt: 26 });

    expect(roundMargin(judge('controlFirst'), grinder, striker, createRng('a'))).toBeGreaterThan(0);
    expect(roundMargin(judge('volumeFirst'), grinder, striker, createRng('a'))).toBeLessThan(0);
  });

  it('counts a knockdown as damage on every judge’s card', () => {
    // Not that every judge *wins the round* for it — a volume judge can still prefer the
    // busier fighter, which is the point of having bias vectors. What must hold is that the
    // knockdown moves every card in the dropper's favour, because it is the most legible
    // evidence of damage a judge has.
    const busier = tally({ significantStrikes: 14, strikesAttempted: 30 });
    const without = tally({ significantStrikes: 4 });
    const withKd = tally({ significantStrikes: 4, knockdowns: 1 });

    for (const archetype of ['damageFirst', 'controlFirst', 'volumeFirst', 'balanced'] as const) {
      const before = roundMargin(judge(archetype), without, busier, createRng('a'));
      const after = roundMargin(judge(archetype), withKd, busier, createRng('a'));
      expect(after, `${archetype} ignored a knockdown`).toBeGreaterThan(before);
    }

    // And a judge who leads on damage should hand them the round outright.
    expect(roundMargin(judge('damageFirst'), withKd, busier, createRng('a'))).toBeGreaterThan(0);
  });

  it('adds noise for an inconsistent judge and none for a perfect one', () => {
    const red = tally({ significantStrikes: 10, damageDealt: 10 });
    const blue = tally({ significantStrikes: 9, damageDealt: 9 });
    const steady = new Set(
      Array.from({ length: 20 }, (_, i) => roundMargin(judge('balanced', 100), red, blue, createRng(`s${i}`))),
    );
    const erratic = new Set(
      Array.from({ length: 20 }, (_, i) => roundMargin(judge('balanced', 20), red, blue, createRng(`e${i}`))),
    );
    expect(steady.size).toBe(1);
    expect(erratic.size).toBeGreaterThan(10);
  });
});

describe('scoreRound', () => {
  it('awards 10-9 for a clear but ordinary round', () => {
    expect(scoreRound(0.3, tally({ significantStrikes: 12 }), tally())).toEqual({
      red: 10,
      blue: 9,
    });
  });

  it('requires corroboration as well as a wide margin for a 10-8', () => {
    const busy = tally({ significantStrikes: 40, damageDealt: 30 });
    // Wide margin, but no knockdown, no heavy control, and not a 5x damage edge.
    expect(scoreRound(0.9, busy, tally({ significantStrikes: 4, damageDealt: 12 })).blue).toBe(9);
    // The same margin with a knockdown is a 10-8.
    expect(scoreRound(0.9, tally({ knockdowns: 1, damageDealt: 30 }), tally()).blue).toBe(8);
  });

  it('reserves 10-7 for two knockdowns and near-total dominance', () => {
    expect(scoreRound(0.95, tally({ knockdowns: 2, damageDealt: 60 }), tally()).blue).toBe(7);
    expect(scoreRound(0.95, tally({ knockdowns: 1, damageDealt: 60 }), tally()).blue).toBe(8);
  });

  it('scores 10-10 only when literally nothing separated them', () => {
    expect(scoreRound(0, tally(), tally(), true)).toEqual({ red: 10, blue: 10 });
    expect(scoreRound(0.2, tally({ significantStrikes: 5 }), tally(), false).blue).toBe(9);
  });

  it('does not call a round even when one fighter attacked submissions', () => {
    // The even-round check must cover every field roundMargin scores. Omitting this one made
    // a round with four submission attempts and nothing else different score 10-10 on all
    // three cards — and the fight a draw.
    const red = tally({ submissionAttempts: 4 });
    const cards = buildScorecards(
      { judges: defaultJudges(), rounds: [{ red, blue: tally() }], deductions: { red: 0, blue: 0 } },
      createRng('subs'),
    );
    expect(readDecision(cards).winner).toBe('red');
  });
});

describe('readDecision', () => {
  const card = (red: number, blue: number, name = 'J'): Scorecard => ({
    judgeName: name,
    rounds: [],
    redTotal: red,
    blueTotal: blue,
  });

  it('reads a unanimous decision', () => {
    expect(readDecision([card(30, 27), card(29, 28), card(30, 27)])).toEqual({
      type: 'unanimous',
      winner: 'red',
    });
  });

  it('reads a split decision', () => {
    expect(readDecision([card(29, 28), card(28, 29), card(29, 28)])).toEqual({
      type: 'split',
      winner: 'red',
    });
  });

  it('reads a majority decision when one card is level', () => {
    expect(readDecision([card(29, 28), card(28, 28), card(29, 28)])).toEqual({
      type: 'majority',
      winner: 'red',
    });
  });

  it('reads a draw when no fighter has a majority', () => {
    expect(readDecision([card(29, 28), card(28, 29), card(28, 28)]).type).toBe('draw');
  });

  it('reads a unanimous draw', () => {
    expect(readDecision([card(28, 28), card(28, 28), card(28, 28)]).type).toBe('draw');
  });
});

describe('buildScorecards', () => {
  const rounds: Record<Corner, RoundTally>[] = [
    { red: tally({ significantStrikes: 15, damageDealt: 20 }), blue: tally({ significantStrikes: 5 }) },
    { red: tally({ significantStrikes: 4 }), blue: tally({ significantStrikes: 16, damageDealt: 22 }) },
    { red: tally({ significantStrikes: 14, damageDealt: 18 }), blue: tally({ significantStrikes: 6 }) },
  ];

  it('produces one card per judge with one row per round, and totals that add up', () => {
    const cards = buildScorecards(
      { judges: defaultJudges(), rounds, deductions: { red: 0, blue: 0 } },
      createRng('cards'),
    );
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      expect(c.rounds).toHaveLength(3);
      expect(c.redTotal).toBe(c.rounds.reduce((a, r) => a + r.red, 0));
      expect(c.blueTotal).toBe(c.rounds.reduce((a, r) => a + r.blue, 0));
    }
  });

  it('applies point deductions to the totals', () => {
    const clean = buildScorecards(
      { judges: defaultJudges(), rounds, deductions: { red: 0, blue: 0 } },
      createRng('d'),
    );
    const docked = buildScorecards(
      { judges: defaultJudges(), rounds, deductions: { red: 1, blue: 0 } },
      createRng('d'),
    );
    expect(docked[0]!.redTotal).toBe(clean[0]!.redTotal - 1);
  });

  it('is deterministic for the same seed', () => {
    const a = buildScorecards(
      { judges: defaultJudges(), rounds, deductions: { red: 0, blue: 0 } },
      createRng('same'),
    );
    const b = buildScorecards(
      { judges: defaultJudges(), rounds, deductions: { red: 0, blue: 0 } },
      createRng('same'),
    );
    expect(a).toEqual(b);
  });
});
