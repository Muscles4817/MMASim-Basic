/**
 * The Fighter entity.
 *
 * Plain serialisable data — no methods, no object references to other entities, no `Map`s.
 * Everything derived (overall rating, derived stats, current condition) is computed on
 * demand rather than stored, so it can never drift out of sync.
 */

import type { GameDay } from '../core/clock.js';
import { ageOn } from '../core/clock.js';
import type {
  AgreementId,
  CoachId,
  DivisionId,
  FighterId,
  GymId,
  ManagerId,
  PromotionId,
} from '../core/ids.js';
import type { AttributeKey, Attributes, Aptitudes, Naturals } from '../ratings/attributes.js';
import type { Personality } from './personality.js';
import type { TraitId } from './traits.js';
import type { Injury } from '../health/injuries.js';
import type { Physique } from '../progression/body.js';

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
/**
 * What a promotion is trying to do with a fighter.
 *
 * - `push` — favourable matchmaking and a better card position than results justify. Builds a
 *   star faster than they earn it, and creates the `Hype Merchant` trap: a pushed fighter who
 *   gets exposed takes the promotion's standing down with them.
 * - `test` — the opposite bet. Book them hard and find out early, which is cheaper than finding
 *   out in a main event.
 * - `protect` — keep them away from anybody who could beat them, usually because they are an
 *   investment or a champion you are not ready to lose.
 */
export type FighterHandling = 'push' | 'test' | 'protect';

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
  /**
   * A bonus the promotion paid for this performance, if any.
   *
   * `awardBonuses` has been picking Performance and Fight of the Night since the events layer
   * shipped and the award was paid and then forgotten — it reached the purse and never the
   * record, so nothing downstream could ever know a fighter had won one. It is the promotion
   * publicly calling a night one of the best on the card, which is exactly the thing that moves
   * somebody up a queue faster than their bare record justifies.
   */
  bonus?: 'performance' | 'fight';
  /**
   * The hole this fight exposed, if it exposed one clearly.
   *
   * A fight does not make anybody better at wrestling — being outwrestled for fifteen minutes
   * tells them, expensively and in public, that their wrestling is the problem. The gain comes
   * from the camp that follows, which is why this is a *direction* rather than a gain: see
   * docs/27 §2.4, `business/lessons.ts` for how it is read off the stats, and
   * `progression/development.ts:LESSON_BONUS` for what it is worth.
   *
   * Optional and frequently absent. A fight in which nothing was clearly exposed teaches
   * nothing, and saying so is the point — a lesson on every bout would be noise.
   */
  lesson?: AttributeKey;
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
 * `headTrauma` is read at fight time by `effectiveDurability`, where it subtracts up to 22 points
 * from the chin a fighter actually brings into the cage — the mechanical expression of "chins do
 * not come back".
 *
 * It does **not** touch the stored `durability` attribute or the hidden `constitution` natural,
 * which is what this comment used to claim. The distinction matters to anybody reading a fighter
 * card: the number there is what they were born with, not what is left of it.
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
  /**
   * 0–100. How recovered they are right now. Falls with training and fighting, returns with time.
   *
   * Optional because every save written before doc 25 phase 2 lacks it, and absent must mean
   * *fresh* rather than *empty* — read it through `freshnessOf`, never directly. See
   * `health/freshness.ts`, which also explains why this is not the same thing as `fatigue`.
   */
  freshness?: number;
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
  /**
   * Natural walking weight in pounds, out of camp. Drives cut severity.
   *
   * Derivable from `physique` and `heightInches` via `walkingWeightLbs(bodyOf(fighter))`, and stored
   * anyway until doc 31 § 12 step 11 — which is when mass starts genuinely *moving* over a career
   * and a cached copy could go stale. `body.test.ts` asserts the two agree, so it cannot drift in
   * the meantime.
   */
  walkingWeightLbs: number;
  heightInches: number;
  reachInches: number;
  /**
   * Structural body composition: skeleton, muscle, fat, and how much water comes off in fight week.
   *
   * Doc 31 § 12 step 4. These are the primitives the body is made of — lean mass and walking weight
   * are computed from them plus height, rather than the other way round, and the Power, Strength,
   * Durability and Cardio ceilings read them through the indices in `progression/body.ts`.
   *
   * `muscleIndex` is the only one that moves over a career; the rest are facts about the person.
   */
  physique: Physique;
  stance: 'orthodox' | 'southpaw' | 'switch';

  /** Division they currently compete in. Changing this changes no ratings. */
  divisionId: DivisionId;
  /** Divisions they have competed in, for career history display. */
  divisionHistory: readonly DivisionId[];
  /** When they last changed weight class. Absent for a fighter who never has. */
  lastDivisionChangeDay?: GameDay;

  attributes: Attributes;
  /**
   * Fractional training progress not yet worth a whole rating point.
   *
   * Ratings are integers, and camps produce fractions. Rounding the fraction away at the end
   * of every camp meant that at a poor gym — including the one the game starts you in —
   * four camps out of five moved nothing at all and the work was silently discarded. Banking
   * the remainder means a slow room is *slow*, rather than a room where training does not
   * happen. Never rendered; the rating is what the player sees.
   */
  trainingCarry?: Partial<Record<AttributeKey, number>>;
  /** Hidden. Never rendered as numbers. */
  naturals: Naturals;
  /**
   * How fast this fighter learns each family of things. Doc 23 § 2.2.
   *
   * Optional because every save written before this existed has none; `aptitudesOf` derives a
   * sensible set from `motorLearning` for those fighters, which is exactly what the single number
   * used to mean.
   */
  aptitudes?: Aptitudes;
  /**
   * The last day each kind of camp was run. Doc 23 § 2.5.
   *
   * Six numbers rather than fifteen: training is chosen by focus, so a focus is the thing that
   * actually has a date. An attribute's freshness is derived from whichever focus that trains it
   * ran most recently.
   *
   * Optional, and absent means *fresh* rather than *never*. A save written before neglect existed
   * must not have its whole roster decay the moment it is opened.
   */
  lastTrained?: Partial<Record<string, GameDay>>;
  /** Hidden true ceilings. The player only ever sees a scouted estimate. */
  /**
   * For the five physical attributes this is a real ceiling and always was.
   *
   * For the ten skills it is now a **projection** rather than a wall — where this fighter would
   * settle on their current trajectory, given their aptitude and what age is taking away. Nothing
   * enforces it: `skillResistance` makes the next point harder without ever making it impossible.
   * See doc 23 § 2.3.
   */
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

  /**
   * How the promotion is handling this fighter.
   *
   * `narrativeControl` exists on the promotion and doc 13 calls building stars the mode's most
   * interesting long game — but a promotion-wide constant cannot express the thing that
   * actually happens, which is a promotion pushing *this* fighter and protecting *that* one at
   * the same time. This is that decision, per person.
   *
   * Absent means the promotion has no particular plan for them, which is the honest default and
   * true of most of any roster.
   */
  handling?: FighterHandling;

  /**
   * The day this fighter is medically cleared to compete again.
   *
   * `readinessDelay()` computes this — a knockout carries a real suspension, and the model
   * has always known it — but the world held the answer in a Map rebuilt on every call and
   * discarded at the end of it, and the player's undercard threw it away outright
   * (`void readinessDelay`). So a fighter knocked out cold on a Saturday could be booked
   * again in the next world step, and the mandatory KO suspension that exists in every
   * athletic commission in the sport existed nowhere in the game.
   *
   * Persisted on the fighter because that is what it is: a property of the person, not of
   * whichever loop happens to be running.
   */
  readyOnDay?: GameDay;

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

  /**
   * Cash on hand, in thousands. Can go negative, and that is the point — a fighter in the
   * red takes fights they would otherwise turn down, and the game plays that back at them
   * rather than blocking anything. See docs/17-money.md.
   */
  bank: number;
  /** Career earnings before deductions, for the retirement ledger. */
  lifetimeGross: number;
  /** Career earnings after the manager, the corner, the camp and the taxman. */
  lifetimeNet: number;
  /**
   * 0–100. How badly they feel they are being paid relative to what they are now worth.
   *
   * Drives relationship, willingness to re-sign and — for a high-ego fighter — public
   * complaint. Rises when the contract stops matching the fighter, which is the recurring
   * grievance of the sport and falls straight out of arithmetic rather than a script.
   */
  resentment: number;
  /** The promotional agreement they are under, if any. Unsigned is a real state. */
  agreementId?: AgreementId;
  /** Who negotiates for them. Unmanaged is a real state, and the debutant default. */
  managerId?: ManagerId;
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
  return {
    fatigue: 0,
    headTrauma: 0,
    bodyWear: 0,
    confidence: 60,
    stress: 10,
    ringRust: 0,
    freshness: 100,
  };
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
  const recentBouts = recent.wins + recent.losses + recent.draws + recent.noContests;
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
