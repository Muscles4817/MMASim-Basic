/**
 * The promotion's money, as an operator reads it.
 *
 * One balance is not a financial position. The header says the budget and the dashboard used to
 * repeat it, in a different unit, with a different rounding — £5.4m in one place and £5,400k in
 * the other — which is both a formatting bug and a sign that nobody had decided what the number
 * was *for*.
 *
 * What a promoter needs is the shape of the next few months: what is coming in, what is going
 * out whether or not a card happens, what is already committed to fighters who have signed, and
 * how long the money lasts if nothing changes. Every figure below is in thousands, like
 * everywhere else in the codebase, and every screen renders them through `ui/format.money` so
 * they cannot disagree with the header again.
 */

import {
  COST_PERIOD_DAYS,
  isActive,
  periodCosts,
  plannedBouts,
  type Fighter,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';
import { currentPurse } from './money';
import { plansFor } from './plans';

export interface FinancialSnapshot {
  /** Cash on hand, thousands. */
  cash: number;
  /** Thousands per 30 days, running the business with no cards at all. */
  monthlyBurn: number;
  overheads: number;
  rosterUpkeep: number;
  /** What the fighters currently under contract cost per bout, if every one of them fought. */
  contractedPurses: number;
  /** Purses already committed to bouts on planned cards. */
  committed: number;
  /** What the next card is forecast to return, purses and bonuses deducted. */
  projectedFromNextCard?: number;
  /** Months of overheads the cash covers with no income. Infinity when cards clear the burn. */
  runwayMonths: number;
  rosterSize: number;
  /** Fighters whose guaranteed pay lands whether or not they fight. */
  guaranteedNext: number;
}

const DAYS_PER_MONTH = 30;

export function financialSnapshot(input: {
  db: GameDb;
  promotion: Promotion;
  /** Forecast profit of the next planned card, when the caller already has one. */
  nextCardProfit?: number;
}): FinancialSnapshot {
  const { db, promotion, nextCardProfit } = input;
  const day = getWorld(db).day;

  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id && isActive(f, day),
  );

  const costs = periodCosts({ promotion, rosterSize: roster.length });
  const monthlyBurn = Math.round((costs.total * DAYS_PER_MONTH) / COST_PERIOD_DAYS);

  /*
   * What the roster would cost if you actually used it.
   *
   * Not a bill — it is the number that makes hoarding legible. A promotion carrying eighty
   * fighters it cannot afford to book has a problem that upkeep alone does not show, because
   * upkeep is small per head and the purses are not.
   */
  let contractedPurses = 0;
  let guaranteedNext = 0;
  for (const fighter of roster) {
    const purse = currentPurse(db, fighter, 'mainCard');
    if (purse) contractedPurses += purse.show;

    const agreement = fighter.agreementId
      ? (db.agreements.findById(fighter.agreementId as string) as PromotionalAgreement | undefined)
      : undefined;
    // A show purse is owed for turning up, win or lose. That is the guarantee.
    if (agreement) guaranteedNext += agreement.showPurse;
  }

  // Already promised to somebody on a card that exists.
  let committed = 0;
  for (const plan of plansFor(db, promotion.id as string)) {
    if (plan.day < day) continue;
    for (const slot of plan.slots) {
      if (!slot.bout || slot.bout.status !== 'agreed') continue;
      for (const id of [slot.bout.redId, slot.bout.blueId]) {
        const fighter = db.fighters.findById(id as string) as Fighter | undefined;
        if (!fighter) continue;
        const purse = currentPurse(db, fighter, slot.position);
        if (purse) committed += purse.show + purse.win * 0.5;
      }
    }
  }

  /*
   * Runway measured against the *net* month, not against overheads alone.
   *
   * A promotion whose cards make money is not on a clock, and reporting "eleven months" for one
   * that is comfortably profitable would be a lie that changes decisions. So a card that clears
   * the burn returns Infinity, which the screen renders as a sentence rather than a number.
   */
  const netMonth = monthlyBurn - (nextCardProfit ?? 0);
  const runwayMonths = netMonth <= 0 ? Infinity : Math.floor(promotion.budget / netMonth);

  return {
    cash: promotion.budget,
    monthlyBurn,
    overheads: Math.round((costs.overheads * DAYS_PER_MONTH) / COST_PERIOD_DAYS),
    rosterUpkeep: Math.round((costs.rosterUpkeep * DAYS_PER_MONTH) / COST_PERIOD_DAYS),
    contractedPurses: Math.round(contractedPurses),
    committed: Math.round(committed),
    projectedFromNextCard: nextCardProfit,
    runwayMonths,
    rosterSize: roster.length,
    guaranteedNext: Math.round(guaranteedNext),
  };
}

/** The runway as a sentence, because "Infinity months" is not a thing to show anybody. */
export function describeRunway(snapshot: FinancialSnapshot): string {
  if (!Number.isFinite(snapshot.runwayMonths)) {
    return 'Your cards more than cover what the business costs to run. The money is not the problem.';
  }
  if (snapshot.runwayMonths <= 0)
    return 'You cannot cover this month. Something has to change now.';
  if (snapshot.runwayMonths <= 6) {
    return `About ${snapshot.runwayMonths} months of cash at this burn. That is a problem you can still fix.`;
  }
  if (snapshot.runwayMonths <= 24) {
    return `Roughly ${snapshot.runwayMonths} months of cash at this burn.`;
  }
  return 'Comfortable. The bank is not what limits you.';
}

/** Everybody on a planned card, so the roster screen can say who is already spoken for. */
export function bookedOnPlans(
  db: GameDb,
  promotionId: string | undefined,
  day: number,
): Set<string> {
  const out = new Set<string>();
  for (const plan of plansFor(db, promotionId)) {
    if (plan.day < day) continue;
    for (const bout of plannedBouts(plan)) {
      out.add(bout.redId as string);
      out.add(bout.blueId as string);
    }
  }
  return out;
}
