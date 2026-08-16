/**
 * What a promotion costs to exist.
 *
 * `budget` was written in exactly one place in the entire codebase — inside `settleNight`,
 * from a card's profit. A promotion that ran no cards therefore had no outgoings at all, which
 * made **doing nothing strictly correct under pressure** and made hoarding a roster free. Both
 * were dominant strategies sitting in the design review's list, and both have the same root:
 * every cost in the model was incurred by *doing something*.
 *
 * The fix is deliberately not a payroll. MMA fighters are paid per bout, not salaried, and a
 * monthly wage bill would be the wrong model dressed up as realism. What a promotion actually
 * pays between cards is overheads — staff, offices, matchmakers, the medical and legal side,
 * marketing that runs whether or not there is a show — and those scale with how big the
 * operation is rather than with how busy it is.
 *
 * That produces the right pressure without inventing anything: a promotion that stops running
 * cards still bleeds, and one carrying a roster it never books is paying to keep people it is
 * not using.
 */

import { clamp } from '../core/math.js';
import type { Promotion } from '../domain/organisations.js';

/** Days one costing period covers. A fortnight, matching the world's simulation step. */
export const COST_PERIOD_DAYS = 14;

export interface PromotionCosts {
  /** Staff, premises, the parts of a promotion that exist between cards. */
  overheads: number;
  /** What it costs to keep a contracted fighter on the books, whether or not they fight. */
  rosterUpkeep: number;
  total: number;
}

/**
 * A fortnight of running the business, in thousands.
 *
 * Overheads scale with prestige rather than with budget, so they cannot be escaped by going
 * broke — a promotion at the top of the sport has an organisation to pay for, and shrinking the
 * bank account does not shrink the offices. That is what makes the failure state in phase 4
 * possible: a promoter who stops spending still has a cost base crushing them.
 *
 * Roster upkeep is small per head and large in aggregate, which is exactly the shape that makes
 * hoarding a bad idea without making signing anybody feel punitive. Medical suspensions,
 * insurance, testing and the administration of a contract cost the same whether the fighter is
 * booked or shelved.
 */
export function periodCosts(input: {
  promotion: Promotion;
  /** Fighters under contract right now. */
  rosterSize: number;
}): PromotionCosts {
  const { promotion, rosterSize } = input;

  /*
   * Scaled to the size of the operation, which `budget` is the model's measure of — every purse
   * in the game derives from it, so it is what "how big is this promotion" means here.
   *
   * Sized against what promotions *measurably* net in the running world rather than against a
   * forecast of an idealised card — the two diverge sharply, because the world's matchmaker
   * picks from a spread of offers rather than always taking the biggest fight available. A first
   * pass tuned against the forecast charged the leader 14,950k a year against a real card income
   * nearer 8,600k, and bankrupted the entire sport inside six years.
   *
   * At this rate a promotion running a normal schedule clears its overheads with something left,
   * and one that stops running cards is visibly bleeding within a year — which is the whole
   * point, and the only thing that stops "do nothing" being correct under pressure.
   */
  const overheads = Math.round(clamp(promotion.budget, 0, 1_000_000) * 0.0015);

  /*
   * Scaled by the promotion's own minimum purse, so upkeep is proportionate to the standard of
   * fighter being carried. A regional promotion's roster genuinely is cheaper to hold than a
   * global one's, and using a flat per-head figure would make the bottom of the sport
   * unplayable while the top would not notice.
   */
  const rosterUpkeep = Math.round(rosterSize * Math.max(0.05, promotion.minimumPurse * 0.015));

  return { overheads, rosterUpkeep, total: overheads + rosterUpkeep };
}

/**
 * Charge a promotion for a span of days.
 *
 * Returns the promotion rather than mutating, matching `settleNight`. Floored at zero for the
 * same reason it is there: an insolvent promotion is a different feature — it folds, and its
 * roster hits free agency — and inventing it silently as a negative number would produce
 * nonsense purses across the whole roster, since every purse derives from the budget.
 */
export function chargeCosts(input: {
  promotion: Promotion;
  rosterSize: number;
  days: number;
}): { promotion: Promotion; charged: number } {
  const { promotion, rosterSize, days } = input;
  if (days <= 0) return { promotion, charged: 0 };

  const periods = days / COST_PERIOD_DAYS;
  const charged = Math.round(periodCosts({ promotion, rosterSize }).total * periods);

  return {
    promotion: { ...promotion, budget: Math.max(0, Math.round(promotion.budget - charged)) },
    charged,
  };
}

/**
 * How many cards a promotion could run before the money is gone, at its current burn.
 *
 * The form a budget has to take to be actionable. A bank balance tells a player nothing about
 * whether it is a lot; "four more cards" tells them what decision they are about to face.
 */
export function runwayCards(input: {
  promotion: Promotion;
  rosterSize: number;
  /** Typical net cost of one card, in thousands. Negative if cards make money. */
  netPerCard: number;
  /** Cards per year this promotion runs. */
  cardsPerYear: number;
}): number {
  const { promotion, rosterSize, netPerCard, cardsPerYear } = input;
  const annualCosts = (periodCosts({ promotion, rosterSize }).total * 365) / COST_PERIOD_DAYS;
  const perCard = netPerCard + annualCosts / Math.max(1, cardsPerYear);

  // Cards that make money mean the runway is not the binding constraint, and saying "infinite"
  // is more honest than a very large number the player would read as a target.
  if (perCard <= 0) return Infinity;
  return Math.floor(promotion.budget / perCard);
}
