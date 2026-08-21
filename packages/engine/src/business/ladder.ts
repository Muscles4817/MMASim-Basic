/**
 * The climb.
 *
 * A career mode needs somewhere to climb *to*, and rungs that are visibly hard to reach. This
 * module owns the ladder: divisional rankings, being signed up a tier, title eligibility, and
 * the belt itself.
 *
 * Rankings are computed from **results**, not from attributes. That gap is deliberate and is
 * the most exploitable thing in the game: a fighter can be badly underrated and stay that way
 * until they beat someone the rankings respect.
 */

import { clamp } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { DivisionId, FighterId, PromotionId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { isActive } from '../domain/fighter.js';
import { standingScore } from './standing.js';
import type { Promotion, PromotionTier } from '../domain/organisations.js';

export const TIER_ORDER: readonly PromotionTier[] = [
  'developmental',
  'regional',
  'major',
  'global',
];

export const tierRank = (tier: PromotionTier): number => TIER_ORDER.indexOf(tier);

export interface RankedFighter {
  fighter: Fighter;
  /** 0 is champion; 1..n are the ranked contenders. */
  position: number;
  score: number;
}

/**
 * Rank a division within a promotion.
 *
 * Reputation dominates, streaks matter, and star power counts for a little — because
 * rankings are a human judgement and humans are influenced by who is famous. Deliberately
 * *not* a function of attributes: what the sport believes is a different thing from what is
 * true, and the space between them is where an underrated fighter lives.
 */
export function rankDivision(
  fighters: readonly Fighter[],
  divisionId: DivisionId,
  promotionId: PromotionId,
  day: GameDay,
  championId?: FighterId,
  /**
   * Every promotion, so a fighter's outside standing can be discounted by the gap between the
   * room it was earned in and this one. Optional so existing callers keep working, at the cost
   * of the older and less informed score.
   */
  promotions?: readonly Promotion[],
): RankedFighter[] {
  /*
   * What you have done *here*, plus what is left of what you did elsewhere.
   *
   * This was `reputation * 1.6 + streak + starPower * 0.25`, which had no notion of where any of
   * it was earned: reputation banked beating regional opposition counted identically to
   * reputation banked beating contenders. Measured, a 58-rated light heavyweight arriving from a
   * feeder promotion entered the UFC's rankings at #4 without having fought anybody in the
   * division. See `standing.ts` for the model and why the carry-in fades rather than vanishes.
   *
   * Falls back to the old shape when the caller cannot supply the promotion — `rankDivision` is
   * called from several places and a ranking that silently returned nothing would be a far worse
   * failure than one that is merely less informed.
   */
  const promotion = promotions?.find((p) => p.id === promotionId);

  const score = (f: Fighter): number => {
    if (!promotion) {
      const streak = f.summary.streak;
      return (
        f.reputation * 1.6 +
        Math.max(0, streak) * 4 +
        Math.min(0, streak) * 7 +
        f.starPower * 0.25
      );
    }

    // Where their outside standing was built: the last promotion they fought for that is not
    // this one. Undefined for somebody who has never fought anywhere else.
    const elsewhere = f.record
      .filter((r) => r.promotionId !== promotionId)
      .sort((a, b) => b.day - a.day)[0];
    const previous = elsewhere
      ? promotions?.find((p) => p.id === elsewhere.promotionId)
      : undefined;

    return standingScore({ fighter: f, promotion, previous, day });
  };

  /**
   * You are not ranked until you have fought.
   *
   * Without this, signing to a thinly-populated developmental promotion makes a debutant the
   * "#1 contender" on day one purely because nobody else is on the roster — which reads as
   * nonsense and hands out a title shot for turning pro.
   */
  const hasCompeted = (f: Fighter): boolean =>
    f.record.length > 0 ||
    (f.priorRecord !== undefined && f.priorRecord.wins + f.priorRecord.losses > 0);

  const contenders = fighters
    .filter(
      (f) =>
        f.divisionId === divisionId &&
        f.promotionId === promotionId &&
        isActive(f, day) &&
        hasCompeted(f) &&
        f.id !== championId,
    )
    .map((fighter) => ({ fighter, score: score(fighter), position: 0 }))
    .sort((a, b) => b.score - a.score);

  const champion = championId ? fighters.find((f) => f.id === championId) : undefined;

  const ranked: RankedFighter[] = champion
    ? [{ fighter: champion, score: score(champion), position: 0 }]
    : [];

  contenders.forEach((c, i) => ranked.push({ ...c, position: i + 1 }));
  return ranked;
}

/** Where a fighter sits, or undefined if they are unranked in this division. */
export function rankOf(ranked: readonly RankedFighter[], id: FighterId): number | undefined {
  return ranked.find((r) => r.fighter.id === id)?.position;
}

/** How deep a promotion's ranked list goes before you are simply "on the roster". */
export const RANKED_DEPTH = 15;

export interface TitleShotVerdict {
  eligible: boolean;
  /** Plain-language explanation, shown on the hub whether eligible or not. */
  reason: string;
}

/**
 * Whether a fighter has earned a title shot.
 *
 * Three gates, and all three exist to stop the belt being a formality: you have to be near
 * the top of the division, you have to be winning right now, and there has to be a belt.
 * A promotion's `narrativeControl` lets a star jump the queue, which is both realistic and
 * a genuine annoyance to plan around.
 */
export function titleShotEligibility(
  fighter: Fighter,
  ranked: readonly RankedFighter[],
  promotion: Promotion,
): TitleShotVerdict {
  const position = rankOf(ranked, fighter.id);

  if (position === 0) {
    return { eligible: false, reason: 'You are the champion. Someone has to come and take it.' };
  }
  if (position === undefined) {
    return { eligible: false, reason: 'You are unranked in this division.' };
  }

  // Star power buys you a couple of places in a promotion that pushes its faces hard.
  const push = Math.round((promotion.narrativeControl / 100) * (fighter.starPower / 100) * 4);
  const effectivePosition = Math.max(1, position - push);

  if (effectivePosition > 3) {
    return {
      eligible: false,
      reason: `Ranked #${position}. Beat someone above you — the top three get the call.`,
    };
  }
  if (fighter.summary.streak < 2) {
    return {
      eligible: false,
      reason: `Ranked #${position}, but you need at least two straight wins to be next in line.`,
    };
  }

  return {
    eligible: true,
    reason: `Ranked #${position} on a ${fighter.summary.streak}-fight run. You are next in line.`,
  };
}

/**
 * A fighter's progress toward the top, 0–1.
 *
 * Tier is the coarse measure and rank the fine one, which is what lets the hub say something
 * more useful than a rank number: being #1 at a regional show and #12 in the global
 * promotion are very different places to be.
 */
export function careerProgress(
  fighter: Fighter,
  promotion: Promotion | undefined,
  position: number | undefined,
  isChampion: boolean,
): number {
  if (!promotion) return 0;
  if (isChampion && promotion.tier === 'global') return 1;

  const tierBase = tierRank(promotion.tier) / TIER_ORDER.length;
  const within =
    position === undefined
      ? 0
      : position === 0
        ? 1
        : clamp(1 - position / (RANKED_DEPTH + 1), 0, 0.9);

  return clamp(tierBase + within / TIER_ORDER.length, 0, 1);
}

/** Set or clear a divisional champion. Returns a new promotion; the input is untouched. */
export function setChampion(
  promotion: Promotion,
  divisionId: DivisionId,
  championId: FighterId | undefined,
): Promotion {
  const champions = { ...promotion.champions };
  if (championId) champions[divisionId] = championId;
  else delete champions[divisionId];
  return { ...promotion, champions };
}
