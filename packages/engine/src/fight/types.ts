/**
 * Fight simulation types.
 *
 * See docs/03-fight-engine.md. Position is the spine of the model: every resolution is
 * conditioned on it, and the ground sub-position ladder is what makes Ground Control and
 * Submissions mean different things.
 */

import type { FighterId } from '../core/ids.js';
import type { FinishMethod } from '../domain/fighter.js';

export type Corner = 'red' | 'blue';

export const OTHER_CORNER: Readonly<Record<Corner, Corner>> = { red: 'blue', blue: 'red' };

export type Position = 'distance' | 'clinch' | 'ground';

/** Ground sub-position ladder, ascending in dominance for the top fighter. */
export const GROUND_POSITIONS = ['guard', 'halfGuard', 'sideControl', 'mount', 'back'] as const;
export type GroundPosition = (typeof GROUND_POSITIONS)[number];

/** Dominance value of a ground position for the controlling fighter, 0–1. */
export const GROUND_DOMINANCE: Readonly<Record<GroundPosition, number>> = {
  guard: 0.3,
  halfGuard: 0.5,
  sideControl: 0.7,
  mount: 0.88,
  back: 1.0,
};

export type StrikeTarget = 'head' | 'body' | 'legs';

export type DamageRegion = StrikeTarget;

/** What a fighter is trying to do this exchange. */
export type Intent =
  | 'strike'
  | 'counter'
  | 'kick'
  | 'clinchUp'
  | 'takedown'
  | 'clinchStrike'
  | 'breakAway'
  | 'advancePosition'
  | 'groundStrike'
  | 'submission'
  | 'escape'
  | 'sweep'
  | 'standUp'
  | 'stall'
  | 'recover';

/** A timestamped play-by-play line. The permanent record of the fight. */
export interface FightEvent {
  round: number;
  /** Seconds elapsed within the round. */
  timeSeconds: number;
  /** Corner the event is *about*, when there is one. */
  corner?: Corner;
  kind: FightEventKind;
  text: string;
  /** Set for significant moments the UI should emphasise. */
  emphasis?: 'minor' | 'major' | 'critical';
}

export type FightEventKind =
  | 'roundStart'
  | 'roundEnd'
  | 'strike'
  | 'combination'
  | 'kick'
  | 'knockdown'
  | 'hurt'
  | 'recovered'
  | 'takedown'
  | 'takedownStuffed'
  | 'clinch'
  | 'clinchBreak'
  | 'positionAdvance'
  | 'sweep'
  | 'standUp'
  | 'refStandUp'
  | 'submissionAttempt'
  | 'submissionEscape'
  | 'groundStrikes'
  | 'foul'
  | 'pointDeduction'
  | 'doctorCheck'
  | 'finish'
  | 'decision'
  | 'note';

/** Per-fighter accumulated statistics for one fight. */
export interface FightStats {
  significantStrikesLanded: number;
  significantStrikesAttempted: number;
  strikesByTarget: Record<StrikeTarget, number>;
  knockdowns: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  submissionAttempts: number;
  /** Seconds of controlling position (top ground or dominant clinch). */
  controlSeconds: number;
  /** Seconds spent at distance. Used by judges assessing octagon control. */
  distanceSeconds: number;
  /** Cumulative damage dealt, in the same units as the opponent's damage meters. */
  damageDealt: number;
}

/** Damage a fighter leaves the cage with. Feeds injuries and permanent career wear. */
export interface DamageReport {
  headDamage: number;
  bodyDamage: number;
  legDamage: number;
  knockdownsSuffered: number;
  /** True if the fight ended with them unconscious or unable to intelligently defend. */
  wasFinishedByStrikes: boolean;
  /** Career head-trauma increment produced by this fight. */
  traumaIncrement: number;
}

export interface RoundScore {
  round: number;
  red: number;
  blue: number;
}

export interface Scorecard {
  judgeName: string;
  rounds: readonly RoundScore[];
  redTotal: number;
  blueTotal: number;
}

export interface FightResult {
  boutId: string;
  redId: FighterId;
  blueId: FighterId;
  winnerId?: FighterId;
  method: FinishMethod;
  /** Round the fight ended in, 1-indexed. */
  round: number;
  /** Seconds into `round`. */
  timeSeconds: number;
  /** Name of the finishing submission, when applicable. */
  submissionName?: string;
  events: readonly FightEvent[];
  scorecards: readonly Scorecard[];
  stats: Record<Corner, FightStats>;
  damage: Record<Corner, DamageReport>;
  /** Set when the referee's tendencies materially changed the result. Used by commentary. */
  refereeNote?: string;
}

export function emptyStats(): FightStats {
  return {
    significantStrikesLanded: 0,
    significantStrikesAttempted: 0,
    strikesByTarget: { head: 0, body: 0, legs: 0 },
    knockdowns: 0,
    takedownsLanded: 0,
    takedownsAttempted: 0,
    submissionAttempts: 0,
    controlSeconds: 0,
    distanceSeconds: 0,
    damageDealt: 0,
  };
}
