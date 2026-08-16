/**
 * Helpers for running many fights and describing the outcomes.
 *
 * Every statistical assertion in this repo is a claim about a *distribution* with an
 * explicit tolerance, never about a single fight — and every run is seeded, so a failure is
 * always reproducible from the message alone.
 */

import {
  isDecisionMethod,
  isKoMethod,
  simulateFight,
  type Fighter,
  type FightConfig,
  type FightResult,
  type GamePlan,
} from '@mmasim/engine';

export interface MatchupOptions {
  fights?: number;
  rounds?: 3 | 5;
  redPlan?: GamePlan;
  bluePlan?: GamePlan;
  seedPrefix?: string;
}

export interface MatchupSummary {
  fights: number;
  redWins: number;
  blueWins: number;
  draws: number;
  redWinRate: number;
  koRate: number;
  submissionRate: number;
  decisionRate: number;
  finishRate: number;
  /** Fraction of finishes that came in round 1. */
  earlyFinishRate: number;
  /** Fraction of decisions that were split or majority. */
  closeDecisionRate: number;
  meanRound: number;
  results: readonly FightResult[];
}

export function runMatchup(red: Fighter, blue: Fighter, opts: MatchupOptions = {}): MatchupSummary {
  const fights = opts.fights ?? 400;
  const prefix = opts.seedPrefix ?? `${red.id}-vs-${blue.id}`;
  const results: FightResult[] = [];

  for (let i = 0; i < fights; i++) {
    const config: FightConfig = {
      boutId: `${prefix}:${i}`,
      red: { fighter: red, plan: opts.redPlan },
      blue: { fighter: blue, plan: opts.bluePlan },
      rounds: opts.rounds ?? 3,
      seed: `${prefix}:${i}`,
    };
    results.push(simulateFight(config));
  }

  return summarise(results, red, blue);
}

export function summarise(
  results: readonly FightResult[],
  red: Fighter,
  _blue: Fighter,
): MatchupSummary {
  const n = results.length;
  let redWins = 0;
  let blueWins = 0;
  let draws = 0;
  let ko = 0;
  let sub = 0;
  let dec = 0;
  let round1Finishes = 0;
  let finishes = 0;
  let closeDecisions = 0;
  let roundSum = 0;

  for (const r of results) {
    if (!r.winnerId) draws++;
    else if (r.winnerId === red.id) redWins++;
    else blueWins++;

    if (isKoMethod(r.method)) {
      ko++;
      finishes++;
      if (r.round === 1) round1Finishes++;
    } else if (r.method === 'submission') {
      sub++;
      finishes++;
      if (r.round === 1) round1Finishes++;
    } else if (isDecisionMethod(r.method)) {
      dec++;
      if (r.method !== 'decisionUnanimous') closeDecisions++;
    }
    roundSum += r.round;
  }

  return {
    fights: n,
    redWins,
    blueWins,
    draws,
    redWinRate: redWins / n,
    koRate: ko / n,
    submissionRate: sub / n,
    decisionRate: dec / n,
    finishRate: finishes / n,
    earlyFinishRate: finishes === 0 ? 0 : round1Finishes / finishes,
    closeDecisionRate: dec === 0 ? 0 : closeDecisions / dec,
    meanRound: roundSum / n,
    results,
  };
}

/** Compact one-line description, used in assertion messages so failures are diagnosable. */
export function describeSummary(s: MatchupSummary): string {
  return [
    `n=${s.fights}`,
    `redWin=${(s.redWinRate * 100).toFixed(1)}%`,
    `KO=${(s.koRate * 100).toFixed(1)}%`,
    `SUB=${(s.submissionRate * 100).toFixed(1)}%`,
    `DEC=${(s.decisionRate * 100).toFixed(1)}%`,
    `finish=${(s.finishRate * 100).toFixed(1)}%`,
  ].join(' ');
}
