/**
 * Population-level foul rates.
 *
 * Every number in `fouls.ts` is a per-exchange hazard, and per-exchange hazards are
 * impossible to reason about by inspection — the first calibration of this module produced
 * a point deduction in 13.6% of fights and an eye-poke no contest in 2.1%, both of which
 * look entirely reasonable as a decimal and are absurd as a sport.
 *
 * These bounds are the actual specification. If a change to the exchange loop alters how
 * many exchanges a fight contains, this suite is what catches the knock-on.
 */

import { describe, expect, it } from 'vitest';
import { ARCHETYPES, simulateFight } from '@mmasim/engine';

interface FoulStats {
  fights: number;
  foulsPerFight: number;
  pctWithAnyFoul: number;
  pctWithDeduction: number;
  pctNoContest: number;
  pctDq: number;
}

function measure(fights: number): FoulStats {
  let total = 0;
  let withFoul = 0;
  let withDeduction = 0;
  let noContest = 0;
  let dq = 0;

  for (let i = 0; i < fights; i++) {
    const result = simulateFight({
      boutId: `foul_${i}`,
      seed: `foul_seed_${i}`,
      red: { fighter: ARCHETYPES.contender() },
      blue: { fighter: ARCHETYPES.journeyman() },
    });

    total += result.fouls.length;
    if (result.fouls.length > 0) withFoul++;
    if (result.fouls.some((f) => f.ruling === 'pointDeduction')) withDeduction++;
    if (result.method === 'noContest') noContest++;
    if (result.method === 'dq') dq++;
  }

  return {
    fights,
    foulsPerFight: total / fights,
    pctWithAnyFoul: (100 * withFoul) / fights,
    pctWithDeduction: (100 * withDeduction) / fights,
    pctNoContest: (100 * noContest) / fights,
    pctDq: (100 * dq) / fights,
  };
}

describe('foul rates across a population', () => {
  const stats = measure(3000);

  it('has a foul in a minority of fights, not most of them', () => {
    // Most of these are a verbal warning for the fence or the back of the head, which is
    // roughly how often a referee actually says something.
    expect(stats.pctWithAnyFoul).toBeGreaterThan(12);
    expect(stats.pctWithAnyFoul).toBeLessThan(35);
  });

  it('deducts a point at roughly the rate the sport does', () => {
    // Real point deductions land around 2% of fights. Anything approaching double figures
    // means the referee is the main character, which is a failure.
    expect(stats.pctWithDeduction).toBeGreaterThan(0.4);
    expect(stats.pctWithDeduction).toBeLessThan(3.5);
  });

  it('keeps the no contest a story rather than a nuisance', () => {
    expect(stats.pctNoContest).toBeLessThan(0.8);
  });

  it('almost never disqualifies anybody', () => {
    // A DQ should be a career anecdote. The unit suite proves the path works; this proves
    // the world does not use it.
    expect(stats.pctDq).toBeLessThan(0.5);
  });

  it('averages well under one foul per fight', () => {
    expect(stats.foulsPerFight).toBeLessThan(0.6);
  });
});

describe('fouls do not distort the result', () => {
  it('leaves the population finish profile essentially unchanged', () => {
    // The guard against a foul system that quietly became a fight-ending mechanic: if
    // recovery breaks were rescuing hurt fighters at scale, the KO rate would sag here.
    let ko = 0;
    let decision = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      // Two even fighters, because the finish profile the design is specified against is
      // the even matchup. A mismatch finishes far more often and would hide a regression.
      const r = simulateFight({
        boutId: `profile_${i}`,
        seed: `profile_${i}`,
        red: { fighter: ARCHETYPES.journeyman() },
        blue: { fighter: ARCHETYPES.journeyman2() },
      });
      if (r.method === 'ko' || r.method === 'tko') ko++;
      if (r.method.startsWith('decision')) decision++;
    }
    expect((100 * ko) / n).toBeGreaterThan(15);
    expect((100 * decision) / n).toBeGreaterThan(40);
  });
});
