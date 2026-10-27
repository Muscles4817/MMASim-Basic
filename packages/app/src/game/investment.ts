/**
 * The departments a promotion funds, as the game stores and reads them. Doc 34 B5.
 *
 * The engine owns what each department costs and does (`business/investment.ts`); this is where
 * the decision is written down and where the rest of the app asks about it.
 */

import {
  investmentLevel,
  medicalFactor,
  scoutingAccuracy,
  withInvestment,
  type Fighter,
  type InvestmentId,
  type InvestmentLevel,
  type Promotion,
} from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';

const promotionById = (db: GameDb, id: string | undefined): Promotion | undefined =>
  id ? (db.promotions.findById(id) as Promotion | undefined) : undefined;

/** The player's promotion, when they run one. */
export const playerPromotion = (db: GameDb): Promotion | undefined =>
  promotionById(db, getWorld(db).playerPromotionId);

/** Fund a department at a level (0 closes it). Returns the updated promotion. */
export function setInvestment(
  db: GameDb,
  promotionId: string,
  id: InvestmentId,
  level: InvestmentLevel,
): Promotion | undefined {
  const promotion = promotionById(db, promotionId);
  if (!promotion) return undefined;
  const next = withInvestment(promotion, id, level);
  db.promotions.upsert(next as never);
  db.save();
  return next;
}

/** How good the player's scouting is, for the scouted ranges on a fighter's page. */
export const scoutingAccuracyOf = (db: GameDb): number => {
  const mine = playerPromotion(db);
  return scoutingAccuracy(mine ? investmentLevel(mine, 'scouting') : 0);
};

/** What a fighter's promotion's medical staff do to their injury and withdrawal risk. */
export const medicalFactorFor = (db: GameDb, fighter: Pick<Fighter, 'promotionId'>): number => {
  const promotion = promotionById(db, fighter.promotionId as string | undefined);
  return medicalFactor(promotion ? investmentLevel(promotion, 'medical') : 0);
};
