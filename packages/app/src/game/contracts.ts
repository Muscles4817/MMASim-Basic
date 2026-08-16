/**
 * Contracts and managers, as the game stores and moves them.
 *
 * The engine owns the rules (`business/contracts.ts`, `business/managers.ts`, and
 * `business/freeAgency.ts`); this owns when they are written down. Same split as everywhere
 * else: the rules stay testable without a database, the storage stays replaceable without
 * touching the rules.
 */

import {
  adviseOnBout,
  agreementStatus,
  consumeFight,
  contractFairness,
  createAgreement,
  createRng,
  defaultTerms,
  displayName,
  marketValue,
  offersFor,
  recordAdvice,
  acceptRepaper,
  repaperOffer,
  resentmentFrom,
  type RepaperOffer,
  settleAdvice,
  tollAgreement,
  willRepresent,
  type Fighter,
  type Gym,
  type Manager,
  type Offer,
  type OfferTerms,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';

type StoredAgreement = PromotionalAgreement & Entity;
type StoredManager = Manager & Entity;

export const agreementOf = (db: GameDb, fighter: Fighter): PromotionalAgreement | undefined =>
  fighter.agreementId
    ? (db.agreements.findById(fighter.agreementId as string) as StoredAgreement | undefined)
    : undefined;

export const managerOf = (db: GameDb, fighter: Fighter): Manager | undefined =>
  fighter.managerId
    ? (db.managers.findById(fighter.managerId as string) as StoredManager | undefined)
    : undefined;

/** Everything the hub needs to say about where a fighter stands contractually. */
export interface ContractStanding {
  agreement?: PromotionalAgreement;
  promotion?: Promotion;
  manager?: Manager;
  /** Fights left, expiry, and whether the belt is holding them. */
  status?: ReturnType<typeof agreementStatus>;
  /** Deliberately never displayed as a number. Drives the sentence. */
  fairness?: number;
  freeAgent: boolean;
}

export function contractStanding(db: GameDb, fighter: Fighter): ContractStanding {
  const agreement = agreementOf(db, fighter);
  const manager = managerOf(db, fighter);
  const promotion = agreement
    ? (db.promotions.findById(agreement.promotionId as string) as Promotion | undefined)
    : undefined;

  if (!agreement || !promotion) return { manager, freeAgent: true };

  const world = getWorld(db);
  const isChampion = promotion.champions[fighter.divisionId] === fighter.id;
  const status = agreementStatus(agreement, world.day, { isChampion });

  return {
    agreement,
    promotion,
    manager,
    status,
    fairness: contractFairness(agreement, fighter, promotion),
    freeAgent: status.expired,
  };
}

/** Put a fighter under contract. */
export function sign(
  db: GameDb,
  fighter: Fighter,
  promotion: Promotion,
  terms: OfferTerms,
): Fighter {
  const world = getWorld(db);
  const agreement = createAgreement({ fighter, promotion, terms, day: world.day });
  db.agreements.upsert(agreement as StoredAgreement);

  const updated: Fighter = {
    ...fighter,
    promotionId: promotion.id,
    agreementId: agreement.id,
    // Signing bonus is cash on the day, which is the fringe's one real weapon.
    bank: Math.round((fighter.bank + terms.signingBonus) * 10) / 10,
    resentment: 0,
  };
  db.fighters.upsert(updated as Fighter & { id: string });
  db.save();
  return updated;
}

/**
 * Burn a fight off the deal and re-read how aggrieved the fighter is.
 *
 * Resentment is recomputed rather than accumulated, because it is a *state* — what the deal
 * looks like against what you are now worth — not a running total. A fighter who signs a new
 * deal stops being aggrieved immediately, which is correct and would not happen if it were
 * a counter.
 */
export function afterFight(db: GameDb, fighter: Fighter): Fighter {
  const standing = contractStanding(db, fighter);
  if (!standing.agreement || !standing.promotion) return fighter;

  const next = consumeFight(standing.agreement);
  db.agreements.upsert(next as StoredAgreement);

  const updated: Fighter = {
    ...fighter,
    resentment: resentmentFrom(contractFairness(next, fighter, standing.promotion)),
  };
  db.fighters.upsert(updated as Fighter & { id: string });
  return updated;
}

/**
 * Stop the clock for days the fighter was not available.
 *
 * The correction that matters most in the whole design: a contract is tolled, so sitting out
 * extends captivity rather than running it down.
 */
export function toll(db: GameDb, fighter: Fighter, days: number): void {
  const agreement = agreementOf(db, fighter);
  if (!agreement || days <= 0) return;
  db.agreements.upsert(tollAgreement(agreement, days) as StoredAgreement);
}

// --- The market ---------------------------------------------------------------------------------

/** What is actually on the table, with each offer's future named from real world state. */
export function offersOnTheTable(db: GameDb, fighter: Fighter): Offer[] {
  const world = getWorld(db);
  const standing = contractStanding(db, fighter);
  const all = db.fighters.findAll() as Fighter[];
  const promotions = db.promotions.findAll() as unknown as Promotion[];

  return offersFor({
    fighter,
    promotions,
    incumbent: standing.promotion,
    manager: standing.manager,
    day: world.day,
    rng: createRng(`${world.seed}:offers:${fighter.id}:${world.day}`),
    depthOf: (promotionId) =>
      all.filter(
        (f) =>
          f.promotionId === promotionId &&
          f.divisionId === fighter.divisionId &&
          f.retiredDay === undefined,
      ).length,
    championOf: (promotionId) => {
      const promotion = promotions.find((p) => p.id === promotionId);
      const championId = promotion?.champions[fighter.divisionId];
      const champion = championId
        ? (db.fighters.findById(championId as string) as Fighter | undefined)
        : undefined;
      if (!champion) return undefined;
      return {
        name: displayName(champion),
        age: Math.floor((world.day - champion.birthDay) / 365),
      };
    },
    projectedRankOf: (promotionId) => {
      // Where they would slot in on ability, which is the honest answer to "what would I be
      // here" before anybody has seen them fight.
      const roster = all
        .filter(
          (f) =>
            f.promotionId === promotionId &&
            f.divisionId === fighter.divisionId &&
            f.retiredDay === undefined,
        )
        .map((f) => marketValue(f, promotions.find((p) => p.id === promotionId)!));
      const mine = marketValue(fighter, promotions.find((p) => p.id === promotionId)!);
      const above = roster.filter((v) => v > mine).length;
      return roster.length === 0 ? undefined : above + 1;
    },
  });
}

// --- Managers -----------------------------------------------------------------------------------

/** Managers who would actually take this fighter on. */
export function managersWillingToRepresent(db: GameDb, fighter: Fighter): Manager[] {
  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  // The realism correction: good managers speculate on *potential*, on a respected coach's
  // recommendation, long before a fighter is worth anything. So a good gym is the pitch, not
  // a reputation grind.
  const potential = Math.round(
    Object.values(fighter.potential).reduce((a, v) => a + v, 0) /
      Object.keys(fighter.potential).length,
  );

  return (db.managers.findAll() as StoredManager[]).filter((manager) =>
    willRepresent({
      manager,
      fighterReputation: fighter.reputation,
      fighterPotential: potential,
      gymPrestige: gym?.prestige ?? 20,
    }),
  );
}

export function hire(db: GameDb, fighter: Fighter, manager: Manager): Fighter {
  const previous = managerOf(db, fighter);
  if (previous) {
    db.managers.upsert({
      ...previous,
      clientIds: previous.clientIds.filter((id) => id !== fighter.id),
    } as StoredManager);
  }

  db.managers.upsert({
    ...manager,
    clientIds: [...manager.clientIds, fighter.id],
  } as StoredManager);

  const updated: Fighter = { ...fighter, managerId: manager.id };
  db.fighters.upsert(updated as Fighter & { id: string });
  db.save();
  return updated;
}

/**
 * What the manager says about a bout, recorded so it can be checked later.
 *
 * The mechanic that saves the role: the advice is falsifiable, the outcome is logged, and the
 * hub shows one number. Overruling him becomes a bet with a scoreboard.
 */
export interface ManagerAdvice {
  recommended: boolean;
  line: string;
}

/**
 * What the manager thinks of a proposed opponent.
 *
 * Pure and deterministic on the pairing, so the line shown on the offer row is the same line
 * that gets recorded if the fight is booked. A manager whose displayed opinion differed from
 * his logged one would make the advice record — the whole mechanism by which he is held to
 * account — quietly meaningless.
 */
export function adviceOn(
  db: GameDb,
  fighter: Fighter,
  opponentId: string,
  input: { merit: number; purse: number },
): ManagerAdvice {
  const world = getWorld(db);
  const standing = contractStanding(db, fighter);

  return adviseOnBout({
    manager: standing.manager,
    merit: input.merit,
    promotionId: standing.promotion?.id ?? (fighter.promotionId as never),
    purse: input.purse,
    rng: createRng(`${world.seed}:advice:${fighter.id}:${opponentId}`),
  });
}

/**
 * Write down what he said, at the moment the fight is booked.
 *
 * This is the half that was missing: the advice existed, was tested, and nothing ever called
 * it — so the manager took his percentage and never went on record. A prediction nobody
 * writes down cannot be checked, and the checking is the entire mechanic.
 */
export function recordAdviceFor(
  db: GameDb,
  fighter: Fighter,
  boutId: string,
  advice: ManagerAdvice,
): void {
  const manager = managerOf(db, fighter);
  if (!manager) return;
  if (manager.advice.some((a) => a.boutId === boutId)) return;

  const world = getWorld(db);
  db.managers.upsert(
    recordAdvice(manager, {
      day: world.day,
      boutId,
      recommended: advice.recommended,
      line: advice.line,
    }) as StoredManager,
  );
}

/**
 * How good an idea a fight is, −1 to +1.
 *
 * From the game's own appraisal rather than a second opinion: a big step up you are unlikely
 * to win is a bad idea, a favourable matchup against somebody ranked is a good one.
 */
export function boutMerit(appraisal: { winChance: number; step: number }): number {
  const odds = (appraisal.winChance - 0.5) * 1.6;
  const stretch = -appraisal.step / 14;
  return Math.max(-1, Math.min(1, odds + stretch));
}

/** Mark the manager right or wrong, once the fight has happened. */
export function settleManagerAdvice(
  db: GameDb,
  fighter: Fighter,
  boutId: string,
  fighterWon: boolean,
): void {
  const manager = managerOf(db, fighter);
  if (!manager) return;
  db.managers.upsert(settleAdvice(manager, boutId, { fighterWon }) as StoredManager);
}

/**
 * Give an unsigned fighter somewhere to start.
 *
 * Every created fighter begins unsigned and unmanaged, which is a real state and the honest
 * one — but a career needs a first rung, and the bottom of the sport is busy rather than
 * empty. Terms are the promotion's floor, take it or leave it, which is authentic.
 */
export function signFirstDeal(db: GameDb, fighter: Fighter): Fighter | undefined {
  const promotions = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => a.prestige - b.prestige);
  const bottom = promotions.find((p) => p.divisions.includes(fighter.divisionId));
  if (!bottom) return undefined;

  const base = defaultTerms(fighter, bottom);
  return sign(db, fighter, bottom, {
    showPurse: base.showPurse,
    winBonus: base.winBonus,
    signingBonus: 0,
    revenuePoints: 0,
    fightsOwed: 4,
    championshipExtension: 'none',
    matchingRights: false,
    exclusive: false,
    outsideBouts: 2,
  });
}

// --- The re-paper -------------------------------------------------------------------------------

/**
 * The offer on the table right now to tear up the current deal, if there is one.
 *
 * Read live from state rather than stored as a pending offer, for the same reason resentment
 * is: it is a *condition*, not an event. A fighter who loses their next fight stops having a
 * re-paper on the table, and that should happen because the condition lapsed rather than
 * because something remembered to withdraw it.
 */
export function repaperOnTheTable(db: GameDb, fighter: Fighter): RepaperOffer | undefined {
  const standing = contractStanding(db, fighter);
  if (!standing.agreement || !standing.promotion || standing.freeAgent) return undefined;

  const lastBout = fighter.record[fighter.record.length - 1];
  return repaperOffer({
    agreement: standing.agreement,
    fighter,
    promotion: standing.promotion,
    wasTitleFight: lastBout?.outcome === 'win' && lastBout.wasTitleFight,
  });
}

/**
 * Say yes: the old deal is torn up and a new one signed in its place.
 *
 * The signing bonus is nil by design — this is a raise, not a signing — and the fighter is
 * paid in show money rather than a lump, which is exactly why it is a better deal for the
 * promotion than it looks.
 */
export function acceptRepaperOffer(db: GameDb, fighter: Fighter, offer: RepaperOffer): Fighter {
  const standing = contractStanding(db, fighter);
  if (!standing.agreement || !standing.promotion) return fighter;

  const world = getWorld(db);
  const replacement = acceptRepaper({
    agreement: standing.agreement,
    offer,
    fighter,
    promotion: standing.promotion,
    day: world.day,
  });

  // Terminated rather than deleted: a career is worth being able to read back, and the
  // sequence of deals a fighter signed is the most legible record of how they were treated.
  db.agreements.upsert({ ...standing.agreement, status: 'terminated' } as never);
  db.agreements.upsert(replacement as StoredAgreement);

  const updated: Fighter = {
    ...fighter,
    agreementId: replacement.id,
    resentment: resentmentFrom(contractFairness(replacement, fighter, standing.promotion)),
  };
  db.fighters.upsert(updated as Fighter & { id: string });
  db.save();
  return updated;
}
