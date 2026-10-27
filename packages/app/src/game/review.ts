/**
 * What happened while the clock ran: the promoter's week in review.
 *
 * An advance used to report one thing — "82 fights happened across the sport while you waited"
 * — which is a fact about everybody else. A promoter coming back from a fortnight wants to know
 * what it did to *them*: how the money moved, how their fighters got on, who came and went. All
 * of it is already in the save; this only reads it back over the span the clock covered.
 */

import { displayName, type Fighter, type NewsItem } from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';
import { readNews } from './world';

export interface RosterResult {
  fighterId: string;
  name: string;
  opponent: string;
  outcome: 'win' | 'loss' | 'draw' | 'noContest';
  method: string;
  round: number;
  day: number;
}

export interface SpanReview {
  from: number;
  to: number;
  /** Thousands. Absent when the caller did not know the balance before. */
  moneyDelta?: number;
  results: RosterResult[];
  /** Signings and departures on the player's own roster, newest first. */
  comings: NewsItem[];
}

/**
 * Read back `[from, to)` for the player's promotion.
 *
 * Results are the roster's own record lines in the window — from the player's cards and anybody
 * else's — and comings and goings are the feed's signing and release items about the promotion.
 */
export function reviewSpan(
  db: GameDb,
  from: number,
  to: number,
  budgetBefore?: number,
): SpanReview {
  const world = getWorld(db);
  const promotionId = world.playerPromotionId;
  const promotion = promotionId
    ? (db.promotions.findById(promotionId) as { budget: number } | undefined)
    : undefined;

  const results: RosterResult[] = [];
  for (const fighter of db.fighters.findAll() as Fighter[]) {
    if (fighter.promotionId !== promotionId) continue;
    for (const entry of fighter.record) {
      if (entry.day < from || entry.day >= to) continue;
      const opponent = db.fighters.findById(entry.opponentId as string) as Fighter | undefined;
      results.push({
        fighterId: fighter.id as string,
        name: displayName(fighter),
        opponent: opponent ? displayName(opponent) : 'an opponent',
        outcome: entry.outcome,
        method: entry.method,
        round: entry.round,
        day: entry.day,
      });
    }
  }
  results.sort((a, b) => b.day - a.day || a.name.localeCompare(b.name));

  const comings = readNews(db).filter(
    (n) =>
      n.promotionId === promotionId &&
      n.day >= from &&
      n.day < to &&
      (n.kind === 'signing' || n.kind === 'release'),
  );

  return {
    from,
    to,
    moneyDelta:
      budgetBefore !== undefined && promotion ? promotion.budget - budgetBefore : undefined,
    results,
    comings,
  };
}
