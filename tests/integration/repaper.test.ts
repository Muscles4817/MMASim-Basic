/**
 * The ratchet.
 *
 * Doc 16 specifies the re-paper in full and nothing implemented it, which left the contract
 * layer with exactly one shape of decision: sign, then endure until it expires. The re-paper
 * is what turns captivity into something you agreed to repeatedly — more money today for more
 * captivity tomorrow, offered at the exact moment you feel invincible.
 *
 * It is also the honest near-neighbour of the champion's-clause sensation the fun brief asked
 * for. An automatic per-win extension is not a term that exists; tearing up a deal and
 * replacing it after a good win is everywhere in the sport, and unlike an automatic clause it
 * is a decision every time.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  MAX_FIGHTS_OWED,
  contractFairness,
  marketValue,
  repaperOffer,
  resentmentFrom,
  type Fighter,
  type PromotionalAgreement,
} from '@mmasim/engine';
import {
  acceptRepaperOffer,
  afterFight,
  repaperOnTheTable,
  sign,
} from '../../packages/app/src/game/contracts';
import { promotionOf } from '../../packages/app/src/game/money';

const game = () => createNewGame({ adapter: undefined });
const player = (db: ReturnType<typeof game>) => (db.fighters.findAll() as Fighter[])[0]!;

/**
 * A fighter whose deal has fallen behind, on a run — the case the mechanic exists for.
 *
 * Signed so show and win *together* come to 70% of what they are worth today — `fairness` is
 * `(showPurse + winBonus) / marketValue`, so each half is 35%, not 70%. An earlier
 * version of this fixture put a 92-rated star on £2k, which is not a deal any promotion
 * offers or any fighter signs, and it made the tests assert nonsense: a 40% raise on £2k is
 * still £2.7k, so the fighter stayed 30× underpaid and *more* aggrieved after re-papering
 * than before. The doc's +25–40% is premised on a deal that has drifted, not one that was
 * never plausible.
 */
function underpaidStar(db: ReturnType<typeof game>) {
  const me = player(db);
  const promotion = promotionOf(db, me)!;
  const worth = marketValue(me, promotion);
  const signed = sign(db, { ...me, bank: 0 }, promotion, {
    showPurse: round1(worth * 0.35),
    winBonus: round1(worth * 0.35),
    signingBonus: 0,
    revenuePoints: 0,
    fightsOwed: 4,
    championshipExtension: 'none',
    matchingRights: false,
    exclusive: true,
    outsideBouts: 0,
  });
  // And then they grew. Modestly — enough that `valueAtSigning` is genuinely a different
  // number when the deal is restamped, without reopening the implausible-gap problem above.
  const star = {
    ...signed,
    starPower: Math.min(100, signed.starPower + 8),
    summary: { ...signed.summary, streak: 4 },
  };
  db.fighters.upsert(star as Fighter & { id: string });
  // One fight burnt off the deal, because a promotion does not tear up a contract nobody has
  // fought on yet. See `repaperOffer`.
  const withFightGone = afterFight(db, star);
  return { fighter: withFightGone, promotion };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const agreementFor = (db: ReturnType<typeof game>, fighter: Fighter) =>
  db.agreements.findById(fighter.agreementId as string) as PromotionalAgreement;

describe('when a promotion tears a deal up', () => {
  it('does not offer to a fighter who has not been winning', () => {
    const db = game();
    const { fighter, promotion } = underpaidStar(db);
    const agreement = agreementFor(db, fighter);
    const flat = { ...fighter, summary: { ...fighter.summary, streak: 0 } };
    expect(repaperOffer({ agreement, fighter: flat, promotion })).toBeUndefined();
  });

  it('does not reopen a deal that is still fair', () => {
    // However long the streak. A promotion re-papers because the gap became embarrassing
    // enough that somebody else would pay it, not as a reward for winning.
    const db = game();
    const me = player(db);
    const promotion = promotionOf(db, me)!;
    // Paid what they are actually worth today, rather than a number that looks large. The
    // subject is a seeded star, so "60" is not a fair deal for them and the fixture has to
    // ask the same question the mechanic does.
    const worth = marketValue(me, promotion);
    const fair = sign(db, me, promotion, {
      showPurse: round1(worth / 2),
      winBonus: round1(worth / 2),
      signingBonus: 0,
      revenuePoints: 0,
      fightsOwed: 4,
      championshipExtension: 'none',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
    });
    const winning = { ...fair, summary: { ...fair.summary, streak: 5 } };
    expect(
      repaperOffer({ agreement: agreementFor(db, fair), fighter: winning, promotion }),
    ).toBeUndefined();
  });

  it('offers to an underpaid fighter on a run', () => {
    const db = game();
    const { fighter, promotion } = underpaidStar(db);
    const agreement = agreementFor(db, fighter);
    const offer = repaperOffer({ agreement, fighter, promotion });
    expect(offer).toBeDefined();
    expect(offer!.terms.showPurse).toBeGreaterThan(agreement.showPurse);
  });

  it('reopens for a champion regardless of the streak', () => {
    const db = game();
    const { fighter, promotion } = underpaidStar(db);
    const agreement = agreementFor(db, fighter);
    const oneWin = { ...fighter, summary: { ...fighter.summary, streak: 1 } };
    expect(repaperOffer({ agreement, fighter: oneWin, promotion })).toBeUndefined();
    expect(
      repaperOffer({ agreement, fighter: oneWin, promotion, wasTitleFight: true }),
    ).toBeDefined();
  });
});

describe('what the offer actually is', () => {
  const setup = () => {
    const db = game();
    const { fighter, promotion } = underpaidStar(db);
    const agreement = agreementFor(db, fighter);
    return {
      db,
      fighter,
      promotion,
      agreement,
      offer: repaperOffer({ agreement, fighter, promotion })!,
    };
  };

  it('pays between 25 and 40 per cent more', () => {
    const { offer } = setup();
    expect(offer.uplift).toBeGreaterThanOrEqual(0.25);
    expect(offer.uplift).toBeLessThanOrEqual(0.4);
  });

  it('scales the raise with how far behind the deal had fallen', () => {
    // The size of the offer is a readout of how underpaid you already were.
    const { fighter, promotion, agreement } = setup();
    const veryBehind = repaperOffer({ agreement, fighter, promotion })!;
    // Deliberately a *better* deal than the fixture's, not a worse one. An earlier version
    // used a flat 30/30, which is below the fixture's own purse — so "lessBehind" was further
    // behind and the assertion was testing its own inverse.
    const lessBehind = repaperOffer({
      agreement: {
        ...agreement,
        showPurse: agreement.showPurse * 1.4,
        winBonus: agreement.winBonus * 1.4,
      },
      fighter,
      promotion,
    })!;
    expect(veryBehind.uplift).toBeGreaterThan(lessBehind.uplift);
  });

  it('costs you captivity, which is the whole trade', () => {
    const { offer, agreement } = setup();
    expect(offer.terms.fightsOwed).toBeGreaterThan(agreement.fightsRemaining);
    expect(offer.terms.fightsOwed).toBeLessThanOrEqual(MAX_FIGHTS_OWED);
  });

  it('reattaches the championship extension rather than quietly dropping it', () => {
    // Dropping it would make this a free raise, which is not the deal being offered.
    const { offer } = setup();
    expect(offer.terms.championshipExtension).not.toBe('none');
  });

  it('pays no signing bonus, because this is a raise and not a signing', () => {
    const { offer } = setup();
    expect(offer.terms.signingBonus).toBe(0);
  });
});

describe('accepting one', () => {
  it('replaces the deal and restamps what you were worth', () => {
    /*
     * A genuinely new agreement rather than an edit, because `valueAtSigning` is what every
     * future grievance is measured against. Carrying the old one forward would leave a fighter
     * who re-papered at 90 still nursing a grudge calibrated to what they were worth at 30 —
     * they would sign a big raise and stay exactly as aggrieved as before.
     */
    const db = game();
    const { fighter, promotion } = underpaidStar(db);
    const before = agreementFor(db, fighter);
    const offer = repaperOnTheTable(db, fighter)!;

    const after = acceptRepaperOffer(db, fighter, offer);
    const replacement = agreementFor(db, after);

    expect(replacement.id).not.toBe(before.id);
    expect(replacement.showPurse).toBeGreaterThan(before.showPurse);
    expect(replacement.valueAtSigning).toBeGreaterThan(before.valueAtSigning);
    // Measured against what the old deal implied, not the fixture's stale field. The point of
    // restamping is that the grievance is recomputed, so signing a real raise has to lower it.
    const wasAggrieved = resentmentFrom(contractFairness(before, fighter, promotion));
    expect(after.resentment).toBeLessThan(wasAggrieved);
  });

  it('takes the offer off the table once signed', () => {
    // Because the condition has lapsed, not because anything remembered to withdraw it.
    const db = game();
    const { fighter } = underpaidStar(db);
    const after = acceptRepaperOffer(db, fighter, repaperOnTheTable(db, fighter)!);
    expect(repaperOnTheTable(db, after)).toBeUndefined();
  });

  it('leaves the old deal readable rather than deleting it', () => {
    // A career is worth being able to read back, and the sequence of deals a fighter signed
    // is the most legible record of how they were treated.
    const db = game();
    const { fighter } = underpaidStar(db);
    const oldId = fighter.agreementId as string;
    acceptRepaperOffer(db, fighter, repaperOnTheTable(db, fighter)!);
    expect(db.agreements.findById(oldId)).toBeDefined();
  });
});
