/**
 * The Fighter entity.
 *
 * Plain serialisable data — no methods, no object references to other entities, no `Map`s.
 * Everything derived (overall rating, derived stats, current condition) is computed on
 * demand rather than stored, so it can never drift out of sync.
 */

import type { GameDay } from '../core/clock.js';
import { ageOn } from '../core/clock.js';
import type { CoachId, DivisionId, FighterId, GymId, PromotionId } from '../core/ids.js';
import type { Attributes, Naturals } from '../ratings/attributes.js';
import type { Personality } from './personality.js';
import type { TraitId } from './traits.js';
import type { Injury } from '../health/injuries.js';

/** How a bout ended, from the winner's perspective. */
export type FinishMethod =
  | 'ko'
  | 'tko'
  | 'submission'
  | 'decisionUnanimous'
  | 'decisionSplit'
  | 'decisionMajority'
  | 'draw'
  | 'noContest'
  | 'dq'
  | 'retirement'
  | 'doctorStoppage';

export type FightOutcome = 'win' | 'loss' | 'draw' | 'noContest';

/** One line of a fighter's record. Immutable once written. */
export interface FightRecordEntry {
  boutId: string;
  opponentId: FighterId;
  promotionId: PromotionId;
  day: GameDay;
  outcome: FightOutcome;
  method: FinishMethod;
  /** Round the fight ended in, 1-indexed. Equals the scheduled rounds for decisions. */
  round: number;
  /** Seconds into `round` at which it ended. */
  timeSeconds: number;
  divisionId: DivisionId;
  wasTitleFight: boolean;
  /** Set when the fighter took this on under two weeks' notice. */
  shortNotice?: boolean;
}

/** Career totals, denormalised for fast list rendering. Rebuildable from `record`. */
export interface RecordSummary {
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  koWins: number;
  submissionWins: number;
  decisionWins: number;
  koLosses: number;
  submissionLosses: number;
  /** Positive = current win streak, negative = current losing streak. */
  streak: number;
}

/**
 * Accumulated wear. This is what makes a career a career rather than a rating sheet.
 *
 * `headTrauma` permanently erodes the hidden `constitution` natural, which in turn pulls
 * the Durability *floor* down — the mechanical expression of "chins do not come back".
 */
export interface Condition {
  /** 0–1. Short-term damage from the last fight; recovers between bouts. */
  fatigue: number;
  /** 0–100. Cumulative career head trauma. Only ever goes up. */
  headTrauma: number;
  /** 0–100. Cumulative wear on joints and soft tissue. Drives chronic injury risk. */
  bodyWear: number;
  /** 1–100. Self-belief. Moves with results and with how fights ended. */
  confidence: number;
  /** 0–100. Non-fight-related life stress: contract disputes, legal, personal. */
  stress: number;
  /** 0–1. Sharpness from recent competition; decays during long layoffs. */
  ringRust: number;
}

/** A fighter's estimated ceiling in one attribute, as the *engine* knows it (true values). */
export type PotentialCeilings = Attributes;

export interface Fighter {
  id: FighterId;
  firstName: string;
  lastName: string;
  /** Fight nickname without quotes, e.g. `The Last Stylebender`. */
  nickname?: string;
  nationality: string;
  sex: 'male' | 'female';
  birthDay: GameDay;
  /** Natural walking weight in pounds, out of camp. Drives cut severity. */
  walkingWeightLbs: number;
  heightInches: number;
  reachInches: number;
  stance: 'orthodox' | 'southpaw' | 'switch';

  /** Division they currently compete in. Changing this changes no ratings. */
  divisionId: DivisionId;
  /** Divisions they have competed in, for career history display. */
  divisionHistory: readonly DivisionId[];

  attributes: Attributes;
  /** Hidden. Never rendered as numbers. */
  naturals: Naturals;
  /** Hidden true ceilings. The player only ever sees a scouted estimate. */
  potential: PotentialCeilings;
  personality: Personality;
  traits: readonly TraitId[];

  condition: Condition;
  /** Bouts fought *inside this simulation*. Seeded fighters start empty. */
  record: readonly FightRecordEntry[];
  /**
   * Career accrued before the simulation started, for seeded fighters.
   *
   * Kept separate rather than fabricating hundreds of synthetic bouts: the invariant is
   * `summary === merge(priorRecord, summariseRecord(record))`, which keeps the denormalised
   * summary rebuildable even for a fighter who debuted with a 24-1 record.
   */
  priorRecord?: RecordSummary;
  summary: RecordSummary;

  gymId?: GymId;
  headCoachId?: CoachId;
  promotionId?: PromotionId;

  /**
   * Acute injuries, active and historical.
   *
   * Kept in full rather than pruned: a knee that has gone twice is far more likely to go a
   * third time, and the recurrence system needs the history to know that.
   */
  injuries?: readonly Injury[];

  /** 1–100. What the market will pay to watch them. Independent of ability. */
  starPower: number;
  /** 1–100. How the media and fans rate them, which is not the same as how good they are. */
  reputation: number;

  /** Day they turned professional. */
  proDebutDay: GameDay;
  retiredDay?: GameDay;

  /** Rating justification for seeded fighters. Shown in the editor, not in the game. */
  notes?: string;
}

export const fullName = (f: Pick<Fighter, 'firstName' | 'lastName'>): string =>
  `${f.firstName} ${f.lastName}`;

export const displayName = (f: Pick<Fighter, 'firstName' | 'lastName' | 'nickname'>): string =>
  f.nickname ? `${f.firstName} "${f.nickname}" ${f.lastName}` : `${f.firstName} ${f.lastName}`;

export const fighterAge = (f: Pick<Fighter, 'birthDay'>, onDay: GameDay): number =>
  ageOn(f.birthDay, onDay);

export const isActive = (f: Pick<Fighter, 'retiredDay'>, onDay: GameDay): boolean =>
  f.retiredDay === undefined || f.retiredDay > onDay;

/** `24-1-0` or `24-1-0 (1 NC)`. */
export function recordString(s: RecordSummary): string {
  const base = `${s.wins}-${s.losses}-${s.draws}`;
  return s.noContests > 0 ? `${base} (${s.noContests} NC)` : base;
}

export function emptyRecordSummary(): RecordSummary {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    noContests: 0,
    koWins: 0,
    submissionWins: 0,
    decisionWins: 0,
    koLosses: 0,
    submissionLosses: 0,
    streak: 0,
  };
}

export function freshCondition(): Condition {
  return { fatigue: 0, headTrauma: 0, bodyWear: 0, confidence: 60, stress: 10, ringRust: 0 };
}

const KO_METHODS: ReadonlySet<FinishMethod> = new Set(['ko', 'tko', 'doctorStoppage']);
const DECISION_METHODS: ReadonlySet<FinishMethod> = new Set([
  'decisionUnanimous',
  'decisionSplit',
  'decisionMajority',
]);

export const isKoMethod = (m: FinishMethod): boolean => KO_METHODS.has(m);
export const isDecisionMethod = (m: FinishMethod): boolean => DECISION_METHODS.has(m);
export const isFinish = (m: FinishMethod): boolean =>
  isKoMethod(m) || m === 'submission' || m === 'retirement';

/**
 * Rebuild the denormalised summary from the full record.
 *
 * The summary exists so a roster list of 800 fighters does not recompute this per frame,
 * but it is always reconstructable — that is what makes it safe to denormalise.
 */
export function summariseRecord(record: readonly FightRecordEntry[]): RecordSummary {
  const s = emptyRecordSummary();
  for (const e of record) {
    switch (e.outcome) {
      case 'win':
        s.wins++;
        if (isKoMethod(e.method)) s.koWins++;
        else if (e.method === 'submission') s.submissionWins++;
        else if (isDecisionMethod(e.method)) s.decisionWins++;
        break;
      case 'loss':
        s.losses++;
        if (isKoMethod(e.method)) s.koLosses++;
        else if (e.method === 'submission') s.submissionLosses++;
        break;
      case 'draw':
        s.draws++;
        break;
      case 'noContest':
        s.noContests++;
        break;
    }
  }

  // Streak runs backwards from the most recent bout. Draws and no-contests break a streak
  // without starting a new one, matching how records are read in the sport.
  let streak = 0;
  for (let i = record.length - 1; i >= 0; i--) {
    const outcome = record[i]!.outcome;
    if (outcome === 'win') {
      if (streak < 0) break;
      streak++;
    } else if (outcome === 'loss') {
      if (streak > 0) break;
      streak--;
    } else {
      break;
    }
  }
  s.streak = streak;
  return s;
}

/** Add two record summaries. Streak comes from the later one unless it is empty. */
export function mergeSummaries(prior: RecordSummary, recent: RecordSummary): RecordSummary {
  const recentBouts =
    recent.wins + recent.losses + recent.draws + recent.noContests;
  return {
    wins: prior.wins + recent.wins,
    losses: prior.losses + recent.losses,
    draws: prior.draws + recent.draws,
    noContests: prior.noContests + recent.noContests,
    koWins: prior.koWins + recent.koWins,
    submissionWins: prior.submissionWins + recent.submissionWins,
    decisionWins: prior.decisionWins + recent.decisionWins,
    koLosses: prior.koLosses + recent.koLosses,
    submissionLosses: prior.submissionLosses + recent.submissionLosses,
    // A fighter who has fought in-sim carries that streak; otherwise their seeded one holds.
    streak: recentBouts > 0 ? recent.streak : prior.streak,
  };
}

/** The authoritative career record: seeded history plus everything fought in-sim. */
export function careerSummary(f: Pick<Fighter, 'record' | 'priorRecord'>): RecordSummary {
  const recent = summariseRecord(f.record);
  return f.priorRecord ? mergeSummaries(f.priorRecord, recent) : recent;
}
