/**
 * Promotions, gyms and coaches.
 *
 * The business layer's nouns. Behaviour (matchmaking, contracts, heat) lives in
 * `business/`; this file is types and invariants only.
 */

import type { GameDay } from '../core/clock.js';
import type { CoachId, DivisionId, FighterId, GymId, PromotionId } from '../core/ids.js';
import type { Personality } from './personality.js';

/** Where a promotion sits in the market. Drives budget, reach and talent pull. */
export type PromotionTier = 'global' | 'major' | 'regional' | 'developmental';

export interface Promotion {
  id: PromotionId;
  name: string;
  shortName: string;
  tier: PromotionTier;
  /** Home market, e.g. `USA`, `Japan`. Affects gate, travel and talent access. */
  baseCountry: string;
  /** 1–100. Brand strength: what a fight is worth simply for happening here. */
  prestige: number;
  /** Cash on hand, in thousands. */
  budget: number;
  /** 1–100. Current audience attention. Moves with cards delivered and stars built. */
  buzz: number;
  /** Divisions this promotion actually runs. */
  divisions: readonly DivisionId[];
  /** Reigning champion per division. Absent = vacant. */
  champions: Partial<Record<DivisionId, FighterId>>;
  /** 1–100. Willingness to book a fight that damages a star. Low = protective. */
  matchmakingAggression: number;
  /** 1–100. How hard they push their chosen faces regardless of results. */
  narrativeControl: number;
  /** Signature ruleset differences, shown on the promotion screen. */
  notes?: string;
}

export interface Gym {
  id: GymId;
  name: string;
  country: string;
  city: string;
  /** 1–100. Facilities, staff depth, sparring quality. Caps development speed. */
  quality: number;
  /** 1–100. Draw for free-agent fighters and coaches. */
  prestige: number;
  headCoachId?: CoachId;
  /** Disciplines this gym is genuinely known for. */
  specialisms: readonly CoachSpecialism[];
  /** Monthly running cost in thousands. Relevant in coach mode. */
  monthlyCost: number;
  foundedDay?: GameDay;
}

export const COACH_SPECIALISMS = [
  'striking',
  'wrestling',
  'submissions',
  'conditioning',
  'strategy',
] as const;
export type CoachSpecialism = (typeof COACH_SPECIALISMS)[number];

export interface Coach {
  id: CoachId;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDay: GameDay;
  gymId?: GymId;

  /**
   * Visible competencies. Unlike fighter naturals these *are* shown — you are hiring them,
   * and hiring blind is not an interesting decision.
   */
  /** 1–100. How accurately they read an opponent. Gates every prepped read. */
  scouting: number;
  /** 1–100. Quality of the plan built from that read. */
  gamePlanning: number;
  /** 1–100. How much they can move a fighter's attributes in camp. */
  development: number;
  /** 1–100. In-fight corner advice between rounds. */
  cornering: number;

  specialisms: readonly CoachSpecialism[];
  personality: Personality;
  /** 1–100. Reputation in the sport. Drives hiring cost and fighter willingness to join. */
  reputation: number;
  /** Monthly salary in thousands. */
  salary: number;
  notes?: string;
}

/**
 * A coach's effectiveness in one discipline.
 *
 * A specialist is markedly better inside their discipline and markedly worse outside it —
 * which is why gyms with complementary coaching staff beat gyms with one famous name.
 */
export function coachEffectiveness(coach: Coach, specialism: CoachSpecialism): number {
  const isSpecialist = coach.specialisms.includes(specialism);
  return coach.development * (isSpecialist ? 1 : 0.6);
}

export const coachFullName = (c: Pick<Coach, 'firstName' | 'lastName'>): string =>
  `${c.firstName} ${c.lastName}`;
