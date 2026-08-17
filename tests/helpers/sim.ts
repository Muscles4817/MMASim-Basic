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
}

/**
 * Run `fights` bouts and count what happened, **without keeping the fights**.
 *
 * This used to retain every `FightResult` — each carrying its full play-by-play — on the summary it
 * returned, and nothing in the repo ever read them. Harmless at 400 fights; not harmless once the
 * suite grew to statistical files running 2,500–4,000 bouts each and the world started planning
 * (more exchanges, more events per fight). The integration tier began dying with
 * `Fatal process out of memory: Zone` when its files ran in parallel, while every one of them
 * passed alone — the signature of memory pressure rather than a defect, and the fix is to stop
 * building a monument to fights nobody looks at.
 *
 * A caller that wants the transcripts should loop `simulateFight` itself, as
 * `commentary-parity.test.ts` does.
 */
export function runMatchup(red: Fighter, blue: Fighter, opts: MatchupOptions = {}): MatchupSummary {
  const fights = opts.fights ?? 400;
  const prefix = opts.seedPrefix ?? `${red.id}-vs-${blue.id}`;
  const tally = emptyMatchupTally();

  for (let i = 0; i < fights; i++) {
    const config: FightConfig = {
      boutId: `${prefix}:${i}`,
      red: { fighter: red, plan: opts.redPlan },
      blue: { fighter: blue, plan: opts.bluePlan },
      rounds: opts.rounds ?? 3,
      seed: `${prefix}:${i}`,
    };
    accumulate(tally, simulateFight(config), red);
  }

  return finaliseMatchup(tally, fights);
}

interface MatchupTally {
  redWins: number;
  blueWins: number;
  draws: number;
  ko: number;
  sub: number;
  dec: number;
  round1Finishes: number;
  finishes: number;
  closeDecisions: number;
  roundSum: number;
}

function emptyMatchupTally(): MatchupTally {
  return {
    redWins: 0,
    blueWins: 0,
    draws: 0,
    ko: 0,
    sub: 0,
    dec: 0,
    round1Finishes: 0,
    finishes: 0,
    closeDecisions: 0,
    roundSum: 0,
  };
}

function accumulate(t: MatchupTally, r: FightResult, red: Fighter): void {
  if (!r.winnerId) t.draws++;
  else if (r.winnerId === red.id) t.redWins++;
  else t.blueWins++;

  if (isKoMethod(r.method)) {
    t.ko++;
    t.finishes++;
    if (r.round === 1) t.round1Finishes++;
  } else if (r.method === 'submission') {
    t.sub++;
    t.finishes++;
    if (r.round === 1) t.round1Finishes++;
  } else if (isDecisionMethod(r.method)) {
    t.dec++;
    if (r.method !== 'decisionUnanimous') t.closeDecisions++;
  }
  t.roundSum += r.round;
}

function finaliseMatchup(t: MatchupTally, n: number): MatchupSummary {
  return {
    fights: n,
    redWins: t.redWins,
    blueWins: t.blueWins,
    draws: t.draws,
    redWinRate: t.redWins / n,
    koRate: t.ko / n,
    submissionRate: t.sub / n,
    decisionRate: t.dec / n,
    finishRate: t.finishes / n,
    earlyFinishRate: t.finishes === 0 ? 0 : t.round1Finishes / t.finishes,
    closeDecisionRate: t.dec === 0 ? 0 : t.closeDecisions / t.dec,
    meanRound: t.roundSum / n,
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
