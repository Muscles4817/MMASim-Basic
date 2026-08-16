/**
 * Matchmaking.
 *
 * Picking an opponent is a promotional decision, not a fairness calculation. A promotion
 * weighs how competitive a fight is, how much money it makes, and how much it risks — and
 * the balance between those three is what makes promotions feel different from each other.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { GameDay } from '../core/clock.js';
import type { DivisionId, FighterId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { isActive } from '../domain/fighter.js';
import type { FinishMethod } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';
import { overallRating } from '../ratings/attributes.js';

export interface Bout {
  id: string;
  redId: FighterId;
  blueId: FighterId;
  divisionId: DivisionId;
  promotionId: string;
  day: GameDay;
  rounds: 3 | 5;
  isTitleFight: boolean;
  refereeId?: string;
  judgeIds?: readonly string[];
  /** Who is calling it. Assigned at booking, because the booth is part of the card. */
  commentatorId?: string;
  /** 0–100. How much the audience cares. Drives revenue and star-power movement. */
  hype: number;
  /** Set once simulated, so a card can be replayed without re-running it. */
  resultId?: string;
}

export interface MatchupAppraisal {
  opponent: Fighter;
  /** 0–1. Estimated chance the *subject* wins, from ratings alone. */
  winChance: number;
  /** 0–100. How much interest the fight generates before any rivalry heat. */
  baseHype: number;
  /** How much of a step up or down this is, in overall rating points. */
  step: number;
}

/**
 * A quick, ratings-only estimate of who wins.
 *
 * Explicitly *not* the fight simulator: this is what a matchmaker sees on paper, and it is
 * supposed to be wrong sometimes. Style, preparation and the tail of the power curve are
 * exactly the things it cannot see, which is why upsets happen.
 */
export function paperOdds(subject: Fighter, opponent: Fighter): number {
  const gap = overallRating(subject.attributes) - overallRating(opponent.attributes);
  return clamp01(1 / (1 + Math.exp(-gap / 7)));
}

/** How interesting a fight is before rivalry heat, 0–100. */
export function baseHype(a: Fighter, b: Fighter, isTitleFight: boolean): number {
  const star = (a.starPower + b.starPower) / 2;
  const quality = (overallRating(a.attributes) + overallRating(b.attributes)) / 2;
  // Competitiveness sells: a coin-flip matters more than a mismatch of the same names.
  const closeness = 1 - Math.abs(paperOdds(a, b) - 0.5) * 2;
  return clamp(
    star * 0.55 + quality * 0.25 + closeness * 20 + (isTitleFight ? 15 : 0),
    1,
    100,
  );
}

export interface OpponentOptions {
  /** Exclude anyone the subject has already fought this many days ago or less. */
  rematchCooldownDays?: number;
  /** How many options to return. */
  count?: number;
  /** Only consider fighters signed to this promotion. */
  promotionId?: string;
}

/**
 * Offer a slate of opponents.
 *
 * Returns a *spread* rather than the single best match: a clear step up, a level fight and
 * a safer name. That is the decision the player should be making — the game gets much
 * duller if the matchmaker has already made it for them.
 */
export function offerOpponents(
  subject: Fighter,
  pool: readonly Fighter[],
  promotion: Promotion,
  day: GameDay,
  rng: Rng,
  options: OpponentOptions = {},
): MatchupAppraisal[] {
  const cooldown = options.rematchCooldownDays ?? 365 * 2;
  const recentOpponents = new Set(
    subject.record.filter((r) => day - r.day <= cooldown).map((r) => r.opponentId as string),
  );

  const eligible = pool.filter(
    (f) =>
      f.id !== subject.id &&
      f.divisionId === subject.divisionId &&
      f.sex === subject.sex &&
      isActive(f, day) &&
      !recentOpponents.has(f.id as string) &&
      (options.promotionId === undefined || f.promotionId === options.promotionId),
  );

  if (eligible.length === 0) return [];

  const appraise = (opponent: Fighter): MatchupAppraisal => ({
    opponent,
    winChance: paperOdds(subject, opponent),
    baseHype: baseHype(subject, opponent, false),
    step: overallRating(opponent.attributes) - overallRating(subject.attributes),
  });

  const appraised = eligible.map(appraise);

  // A protective promotion shades every offer toward safety; an aggressive one toward the
  // fight that sells. This is the single number that makes promotions feel different.
  const riskAppetite = promotion.matchmakingAggression / 100;

  const pick = (predicate: (m: MatchupAppraisal) => boolean): MatchupAppraisal | undefined => {
    const candidates = appraised.filter(predicate);
    if (candidates.length === 0) return undefined;
    return rng.pickWeighted(candidates, (m) => m.baseHype ** (1 + riskAppetite));
  };

  const offers = [
    pick((m) => m.step >= 4),
    pick((m) => Math.abs(m.step) < 4),
    pick((m) => m.step <= -4),
  ].filter((m): m is MatchupAppraisal => m !== undefined);

  // Backfill from the rest of the pool when a tier has nobody in it — a thin division must
  // still produce a card.
  const chosen = new Set(offers.map((m) => m.opponent.id));
  const remaining = appraised.filter((m) => !chosen.has(m.opponent.id));
  const wanted = options.count ?? 3;
  while (offers.length < wanted && remaining.length > 0) {
    const next = rng.pickWeighted(remaining, (m) => m.baseHype);
    offers.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return offers.sort((a, b) => b.step - a.step).slice(0, wanted);
}

/**
 * Days until a fighter is ready to compete again.
 *
 * A knockout loss carries a **mandatory medical suspension** — a floor that ignores how good
 * the fighter's recovery is and how they feel, because that is how the sport works and it is
 * what stops a career being a treadmill. Pass the method they lost by; omit it for a fighter
 * who was not stopped.
 */
export function readinessDelay(fighter: Fighter, lostBy?: FinishMethod): number {
  const base = 70;
  const traumaDrag = (fighter.condition.headTrauma / 100) * 40;
  const recovery = fighter.naturals.recovery / 50;
  const natural = (base + traumaDrag) / recovery;

  // Suspension floors. Applied after the recovery divisor precisely so recovery cannot
  // shorten them.
  const floor = lostBy === 'ko' ? 180 : lostBy === 'tko' || lostBy === 'doctorStoppage' ? 60 : 35;

  return Math.round(clamp(Math.max(natural, floor), 35, 260));
}
