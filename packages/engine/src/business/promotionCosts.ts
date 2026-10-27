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

import type { Promotion } from '../domain/organisations.js';

/** Days one costing period covers. A fortnight, matching the world's simulation step. */
export const COST_PERIOD_DAYS = 14;

/**
 * The size of the organisation a promotion runs, from a town show's two people and a phone (1)
 * to the leader's building full of staff (5).
 *
 * What overheads are charged against. They used to be 0.15% of the bank balance a fortnight,
 * which made the cost of existing a function of how much money a promotion had: a promotion that
 * got rich paid more for the same offices, and one that went broke stopped paying for them
 * altogether. Staff and premises do not shrink with the balance.
 *
 * Read off prestige for now, because a promotion's standing is what its organisation has been
 * built to serve — and cut back when the money will not stretch to it. Investing in it as a decision of its own — a matchmaker, a medical team, a
 * marketing department — is doc 34's B5.
 */
export type StaffLevel = 1 | 2 | 3 | 4 | 5;

export function staffLevel(promotion: Promotion): StaffLevel {
  const p = promotion.prestige;
  const built: StaffLevel = p >= 85 ? 5 : p >= 56 ? 4 : p >= 44 ? 3 : p >= 28 ? 2 : 1;

  /*
   * Unless it cannot pay for it. A promotion that cannot cover its organisation for
   * `STAFF_RUNWAY_YEARS` lays people off down to one it can — the response a real promotion has,
   * and the only thing that stops a bad decade becoming a death spiral: with a fixed cost base, a
   * promotion short of money cannot sign, a promotion that cannot sign runs weaker cards, and
   * weaker cards make less money. Measured over a decade of the 2026 world, every promotion below
   * the leader went to zero without it.
   */
  let level = built;
  while (
    level > 1 &&
    yearOf(STAFF_LEVEL_OVERHEADS[level]) * STAFF_RUNWAY_YEARS > promotion.budget
  ) {
    level = (level - 1) as StaffLevel;
  }
  return level;
}

/**
 * Years of overheads a promotion keeps its organisation for. Below this, it downsizes. One, now
 * that a generated promotion starts with a couple of years of all its costs rather than decades.
 */
export const STAFF_RUNWAY_YEARS = 1;

/** A year of a cost charged every `COST_PERIOD_DAYS`. */
export const yearOf = (perPeriod: number): number => (perPeriod * 365) / COST_PERIOD_DAYS;

/**
 * A fortnight of overheads at each staff level, in thousands.
 *
 * About £5k a year for a town show, £26k for a feeder, £156k for a regional promotion, £339k for
 * the top of the regional tier and the majors, and £3.1m for the leader — the organisation between
 * cards. What a card itself costs to stage, the officials, medicals and crew, is charged per night
 * instead (`showCost`), so a promotion that runs cards pays for running them and one that does not
 * still pays for existing.
 *
 * Level 4 starts at prestige 56 rather than 60, so the strongest regionals — the promotions a
 * promoter is handed — carry an organisation built to grow into a major. Sized against that
 * promoter's first year once a generated promotion's bank came down to a couple of years of
 * costs: below it, paying every counter-offer still grew the promotion by a fifth, and no way of
 * running it could lose. The rest of the regional tier stays at level 3, where the 2026 era's
 * regionals can afford a decade. Each level costs between about 2 and 9 times the one below.
 * Level 4 was once twelve times level 3, which made a promotion crossing into the majors take on
 * overheads its cards could not yet pay for.
 */
export const STAFF_LEVEL_OVERHEADS: Readonly<Record<StaffLevel, number>> = {
  1: 0.2,
  2: 1,
  3: 6,
  4: 15,
  5: 120,
};

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
   * The organisation, not the bank balance — see `staffLevel`. Sized against what promotions
   * measurably net in the running world rather than against a forecast of an idealised card,
   * because the world's matchmaker picks from a spread of offers rather than always taking the
   * biggest fight available: a promotion running a normal schedule roughly stands still, and one
   * that stops running cards is visibly bleeding within a year.
   */
  const overheads = STAFF_LEVEL_OVERHEADS[staffLevel(promotion)];

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
/** A year of running costs at today's roster: overheads and upkeep, not cards. */
export const annualCosts = (input: { promotion: Promotion; rosterSize: number }): number =>
  yearOf(periodCosts(input).total);

export function chargeCosts(input: { promotion: Promotion; rosterSize: number; days: number }): {
  promotion: Promotion;
  charged: number;
} {
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
  const perCard = netPerCard + annualCosts({ promotion, rosterSize }) / Math.max(1, cardsPerYear);

  // Cards that make money mean the runway is not the binding constraint, and saying "infinite"
  // is more honest than a very large number the player would read as a target.
  if (perCard <= 0) return Infinity;
  return Math.floor(promotion.budget / perCard);
}
