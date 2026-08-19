/**
 * Money, as the game actually moves it.
 *
 * The engine owns what things *cost* and what a fighter is *worth* (`business/money.ts`);
 * this owns when the bank is debited and credited. Keeping the split means the economics stay
 * testable without a database and the bookkeeping stays replaceable without touching them.
 *
 * Before this existed, `purseFor()` was called twice and both calls printed a number on a
 * screen. Nothing accumulated it, nothing spent it. See docs/17-money.md.
 */

import {
  campCost as engineCampCost,
  defaultTerms,
  livingCostPerMonth,
  marketValue,
  netPurse,
  championshipId,
  currentReign,
  purseFor,
  purseRateOf,
  solvency,
  sponsorshipIncome,
  type CardPosition,
  type Championship,
  type Fighter,
  type Gym,
  type Manager,
  type NetPurse,
  type PromotionalAgreement,
  type PurseTerms,
  type Promotion,
  type Purse,
  type Solvency,
} from '@mmasim/engine';
import type { GameDb } from '@mmasim/data';
import { money } from '../ui/format';

/** The promotion a fighter is signed to, or undefined if they are a free agent. */
export function promotionOf(db: GameDb, fighter: Fighter): Promotion | undefined {
  return fighter.promotionId
    ? (db.promotions.findById(fighter.promotionId) as Promotion | undefined)
    : undefined;
}

/** What this fighter would be paid for a bout right now. */
/**
 * The terms a fighter is actually on.
 *
 * The signed agreement, not what they are worth today. This was the single biggest hole in
 * the business layer: `settleFight` computed the purse from current market value and never
 * read the contract, so every fighter was always paid exactly what they were worth — which
 * means the hub could correctly say "this deal is now an insult" while the bank quietly paid
 * the market rate anyway.
 *
 * The entire economic grievance of the sport is that terms are fixed while worth is not.
 * `contractFairness`, `resentment`, renegotiation and free agency all derive from that gap,
 * and none of them meant anything while the ledger ignored the contract.
 */
export function termsFor(db: GameDb, fighter: Fighter): PurseTerms | undefined {
  const promotion = promotionOf(db, fighter);
  if (!promotion) return undefined;

  const agreement = fighter.agreementId
    ? (db.agreements.findById(fighter.agreementId as string) as PromotionalAgreement | undefined)
    : undefined;

  // A genuine free agent has no terms, so what they are worth is the only answer available.
  return agreement
    ? { showPurse: agreement.showPurse, winBonus: agreement.winBonus }
    : defaultTerms(fighter, promotion);
}

/**
 * What the belt is worth, for whoever is holding it.
 *
 * Read from the lineage rather than the denormalised map because the defence count only exists
 * there — and a defence is worth money, which is the point.
 */
export function championStatus(
  db: GameDb,
  fighter: Fighter,
): { isChampion: boolean; defences: number } {
  const promotion = promotionOf(db, fighter);
  if (!promotion) return { isChampion: false, defences: 0 };

  const title = db.championships.findById(
    championshipId(promotion.id, fighter.divisionId),
  ) as Championship | undefined;
  const reign = title ? currentReign(title) : undefined;

  return reign?.fighterId === fighter.id
    ? { isChampion: true, defences: reign.defences }
    : { isChampion: false, defences: 0 };
}

export function currentPurse(
  db: GameDb,
  fighter: Fighter,
  position: CardPosition = 'mainCard',
): Purse | undefined {
  const promotion = promotionOf(db, fighter);
  const terms = termsFor(db, fighter);
  if (!promotion || !terms) return undefined;
  return purseFor(terms, promotion, position, championStatus(db, fighter));
}

/** What a camp of this length at this gym costs. */
export function campCostFor(gym: Gym | undefined, weeks: number): number {
  return engineCampCost(weeks, gym?.quality ?? 40);
}

/** Whether the fighter can fund a given camp, and what it would leave them with. */
export function canFund(fighter: Fighter, cost: number): boolean {
  return fighter.bank >= cost;
}

/** How the bank is reading right now, against the camp they are about to run. */
export function solvencyOf(fighter: Fighter, nextCampCost: number): Solvency {
  return solvency(fighter.bank, nextCampCost);
}

/**
 * Debit a camp.
 *
 * Deliberately allows the bank to go negative rather than refusing. Nothing in this design
 * blocks: being broke changes what a fighter is willing to accept, and that is a pressure
 * rather than a prohibition. The UI warns; the engine lets it happen.
 */
export function payForCamp(db: GameDb, fighter: Fighter, cost: number): Fighter {
  const updated: Fighter = { ...fighter, bank: round1(fighter.bank - cost) };
  db.fighters.upsert(updated as Fighter & { id: string });
  return updated;
}

export interface FightEarnings {
  purse: Purse;
  /** Show, plus win if they won. */
  gross: number;
  sponsorship: number;
  breakdown: NetPurse;
  /** Plain-language lines for the post-fight report. */
  notes: readonly string[];
}

/**
 * Settle a fight: pay the fighter, take everybody's cut, and move the bank.
 *
 * The camp cost is passed in rather than recomputed because it was already committed and
 * debited when the camp ran — paying it twice would be the classic double-charge bug, and
 * netting it here is only so the report can show the fighter what the fight actually
 * *earned* them after the money they had already spent to be ready for it.
 */
export function settleFight(
  db: GameDb,
  fighter: Fighter,
  options: {
    won: boolean;
    campCost: number;
    campWeeks: number;
    position?: CardPosition;
    isChampion?: boolean;
    managerRate?: number;
  },
): FightEarnings | undefined {
  const promotion = promotionOf(db, fighter);
  if (!promotion) return undefined;

  const purse = purseFor(
    termsFor(db, fighter) ?? defaultTerms(fighter, promotion),
    promotion,
    options.position,
    championStatus(db, fighter),
  );
  const sponsorship = sponsorshipIncome(fighter, promotion, {
    boutsWithPromotion: fighter.record.length,
    isChampion: options.isChampion,
    inHomeCountry: fighter.nationality === promotion.baseCountry,
  });

  const gross = round1(purse.show + (options.won ? purse.win : 0) + sponsorship);
  const months = Math.max(1, Math.round(options.campWeeks / 4));

  const manager = fighter.managerId
    ? (db.managers.findById(fighter.managerId as string) as Manager | undefined)
    : undefined;

  const breakdown = netPurse({
    gross,
    // `purseRateOf` had no callers, so Danny Rourke's 0% — the entire point of the family
    // manager archetype — never reached the ledger, and a self-managed fighter still paid a
    // manager who did not exist.
    managerRate: options.managerRate ?? purseRateOf(manager),
    // Already paid, and shown here so the fighter can see what the night actually cleared.
    campCost: options.campCost,
    livingCost: round1(livingCostPerMonth(fighter) * months),
  });

  // The camp was debited when it ran, so crediting the full net here would give it back.
  const toBank = round1(breakdown.net + options.campCost);

  const updated: Fighter = {
    ...fighter,
    bank: round1(fighter.bank + toBank),
    lifetimeGross: round1(fighter.lifetimeGross + gross),
    lifetimeNet: round1(fighter.lifetimeNet + breakdown.net),
  };
  db.fighters.upsert(updated as Fighter & { id: string });

  const notes: string[] = [];
  notes.push(
    options.won
      ? `${money(gross)} gross — ${money(purse.show)} to show, ${money(purse.win)} to win${sponsorship > 0 ? `, ${money(sponsorship)} from sponsors` : ''}.`
      : `${money(gross)} gross — the win bonus was ${money(purse.win)} and you did not get it.`,
  );
  if (breakdown.net < 0) {
    notes.push(
      `You are ${money(Math.abs(breakdown.net))} down on the fight once the camp, the corner and the taxman are paid. That is the sport, and it is why the bottom of a roster is poor.`,
    );
  }

  return { purse, gross, sponsorship, breakdown, notes };
}

/** What the fighter is worth today, for the contract layer and the grievance it produces. */
export function worthNow(db: GameDb, fighter: Fighter): number | undefined {
  const promotion = promotionOf(db, fighter);
  return promotion ? marketValue(fighter, promotion) : undefined;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
