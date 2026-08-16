/**
 * Promotions, gyms and coaches.
 *
 * The business layer's nouns. Behaviour (matchmaking, contracts, heat) lives in
 * `business/`; this file is types and invariants only.
 */

import type { GameDay } from '../core/clock.js';
import type { CoachId, DivisionId, FighterId, GymId, PromotionId } from '../core/ids.js';
import type { SponsorshipPolicy } from '../business/money.js';
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
  /**
   * Lowest total package (show + win) this promotion will pay, in thousands.
   *
   * Real promotions publish a floor and honour it. Without one the pay formula produced
   * debutant purses below the minimum the promotion advertises, which is a thing that does
   * not happen. Also a promoter-mode lever: raising it is expensive, visible, buys
   * relationship across the whole roster, and is exactly what a promotion under pressure
   * quietly does not do.
   */
  minimumPurse: number;
  /**
   * Whether fighters keep their own sponsors.
   *
   * `open` — individual in-cage sponsors, worth more than the purse at the bottom of the
   * sport. `uniform` — a single outfitting deal replaces them with a fixed tier by bout
   * count. Real promotions have switched from one to the other and repriced a whole roster
   * overnight; it is the second edge on doc 16's money-versus-level trade.
   */
  sponsorshipPolicy: SponsorshipPolicy;
  /**
   * Whether this promotion can grant revenue points at all.
   *
   * A promotion with no broadcast platform structurally cannot share broadcast revenue —
   * which is exactly what makes points doc 16's *unmatchable term*.
   */
  revenueShareCapable: boolean;
  /** Bouts the promotion owes a contracted fighter per 12 months. See doc 16. */
  activityGuarantee: number;
  /** 1–100. Current audience attention. Moves with cards delivered and stars built. */
  buzz: number;
  /**
   * Delivery scores of this promotion's last few cards, newest last.
   *
   * The memory that makes `buzz` a judgement rather than a ratchet. Without it every
   * promotion was measured against a fixed global par, met it forever, and pinned at 100 —
   * measured across eight simulated years, the whole sport saturated and the signal stopped
   * telling the player anything. A promotion is judged against its own recent standard, which
   * is both how an audience actually works and the only version where a good night at the
   * bottom of the sport counts for something.
   *
   * Absent for a promotion that has not run a card yet. Capped at `DELIVERY_MEMORY`.
   */
  recentDelivery?: readonly number[];
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
