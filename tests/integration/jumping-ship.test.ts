/**
 * Changing promotions while you still owe fights.
 *
 * Reported from play: signed with a new promotion, started getting the new promotion's
 * opponents, and the hub went on saying three fights were left with the old one.
 *
 * It was not a display bug. There were **two signing paths**. The offers screen called `sign`,
 * which does the job properly and was already gated on being a free agent. The hub's ladder card
 * called `signWith`, which was three lines long and set `promotionId` and nothing else — so the
 * fighter moved promotion while `agreementId` went on pointing at the old promotion's contract.
 * Measured consequences of one click: new opponents, old purse, old fights-remaining on the hub,
 * no new agreement, and the signing bonus the button advertised never paid.
 *
 * Underneath that was the real hole: `AgreementStatus.expired` has always been documented as
 * "true when the fighter is free to sign elsewhere" and **no signing path consulted it**, so the
 * countdown was a number with nothing attached to it.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  releaseDecision,
  signingEligibility,
  type AgreementStatus,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import {
  afterFight,
  canSignWith,
  contractStanding,
  requestRelease,
  sign,
} from '../../packages/app/src/game/contracts';
import { promotionOf, termsFor } from '../../packages/app/src/game/money';

const status = (over: Partial<AgreementStatus> = {}): AgreementStatus => ({
  expired: false,
  daysRemaining: 400,
  fightsRemaining: 3,
  heldByBelt: false,
  summary: '',
  ...over,
});

const TERMS = {
  showPurse: 12,
  winBonus: 12,
  signingBonus: 25,
  revenuePoints: 0,
  fightsOwed: 4,
  championshipExtension: 'none' as const,
  matchingRights: false,
  exclusive: true,
  outsideBouts: 0,
};

describe('whether you are allowed to sign at all', () => {
  it('holds a fighter who still owes fights', () => {
    const check = signingEligibility({ status: status({ fightsRemaining: 3 }), incumbentName: 'CW' });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('CW');
    expect(check.reason).toContain('3 more fights');
  });

  it('reads naturally on the last fight rather than saying "1 more fights"', () => {
    const check = signingEligibility({ status: status({ fightsRemaining: 1 }) });
    expect(check.reason).toContain('one more fight');
  });

  it('lets a fighter go once the deal is done', () => {
    expect(signingEligibility({ status: status({ expired: true }) }).allowed).toBe(true);
  });

  it('lets a fighter with no deal at all sign anywhere', () => {
    // Every created fighter starts here, so a rule that caught them would break the opening
    // minutes of the game.
    expect(signingEligibility({}).allowed).toBe(true);
  });

  it('always allows re-signing with your own promotion, which is a renewal not a jump', () => {
    const check = signingEligibility({ status: status(), targetIsIncumbent: true });
    expect(check.allowed).toBe(true);
  });

  it('treats the belt as a separate and stronger hold than the term', () => {
    const check = signingEligibility({ status: status({ heldByBelt: true }), incumbentName: 'UFC' });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('belt');
    // And there is no point offering a release button they will never get.
    expect(check.releasable).toBe(false);
  });
});

describe('asking to be let out', () => {
  it('never releases a champion', () => {
    const call = releaseDecision({ standing: 5, status: status(), isChampion: true });
    expect(call.released).toBe(false);
    expect(call.reason).toContain('Champion');
  });

  it('does not tear up a deal with one fight left when it could just book it', () => {
    expect(releaseDecision({ standing: 2, status: status({ fightsRemaining: 1 }) }).released).toBe(
      false,
    );
  });

  it('lets go of somebody it has no plans for', () => {
    expect(releaseDecision({ standing: 10, status: status({ fightsRemaining: 3 }) }).released).toBe(
      true,
    );
  });

  it('keeps somebody it is building', () => {
    expect(releaseDecision({ standing: 85, status: status({ fightsRemaining: 3 }) }).released).toBe(
      false,
    );
  });

  it('is harder to get out of a longer deal, because more is being written off', () => {
    // The same fighter, the same standing, different amounts left on the deal.
    const short = releaseDecision({ standing: 45, status: status({ fightsRemaining: 2 }) });
    const long = releaseDecision({ standing: 45, status: status({ fightsRemaining: 6 }) });
    expect(short.released).toBe(false);
    expect(long.released).toBe(true);
  });
});

describe('what actually happens in a save', () => {
  const setup = () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const promotions = db.promotions.findAll() as unknown as Promotion[];
    const small = promotions.find((p) => p.shortName === 'CW')!;
    const big = promotions.find((p) => p.shortName === 'UFC')!;
    const fighter = (db.fighters.findAll() as Fighter[]).find((f) => f.promotionId === small.id)!;
    return { db, small, big, fighter };
  };

  it('refuses the jump while the deal is live, and changes nothing at all', () => {
    /*
     * The regression that matters. The old path left a fighter at the new promotion on the old
     * promotion's contract; the new one either does the whole thing or none of it.
     */
    const { db, small, big, fighter } = setup();
    const signed = sign(db, fighter, small, TERMS);
    expect(signed.ok).toBe(true);
    const under = (signed as { ok: true; fighter: Fighter }).fighter;

    const before = {
      promotion: promotionOf(db, under)?.id,
      agreement: under.agreementId,
      bank: under.bank,
    };

    const jump = sign(db, under, big, TERMS);
    expect(jump.ok, 'signed with a second promotion while under contract').toBe(false);

    const after = db.fighters.findById(under.id as string) as Fighter;
    expect(after.promotionId, 'promotion moved anyway').toBe(before.promotion);
    expect(after.agreementId, 'agreement changed').toBe(before.agreement);
    expect(after.bank, 'a bonus was paid for a signing that did not happen').toBe(before.bank);
  });

  it('says who is holding them and what they owe, not just "no"', () => {
    const { db, small, big, fighter } = setup();
    const signed = sign(db, fighter, small, TERMS) as { ok: true; fighter: Fighter };
    const check = canSignWith(db, signed.fighter, big);

    expect(check.allowed).toBe(false);
    expect(check.reason, 'the refusal does not name the promotion').toContain(small.shortName);
    expect(check.releasable).toBe(true);
  });

  /**
   * A fighter at the end of their deal.
   *
   * `createAgreement` clamps `fightsOwed` to a minimum of one, so no deal is ever born already
   * finished — the last fight has to be burned off the way the game burns it.
   */
  const freeAgentAt = (db: ReturnType<typeof setup>['db'], promotion: Promotion, f: Fighter) => {
    const signed = sign(db, f, promotion, { ...TERMS, fightsOwed: 1 }) as {
      ok: true;
      fighter: Fighter;
    };
    const spent = afterFight(db, signed.fighter);
    expect(contractStanding(db, spent).freeAgent, 'setup failed to free the fighter').toBe(true);
    return spent;
  };

  it('moves everything together once the fighter is genuinely free', () => {
    const { db, small, big, fighter } = setup();
    const free = freeAgentAt(db, small, fighter);

    const jump = sign(db, free, big, { ...TERMS, showPurse: 90, winBonus: 90 });
    expect(jump.ok).toBe(true);
    const moved = (jump as { ok: true; fighter: Fighter }).fighter;

    // All four of these moved as one, where the old path moved only the first.
    expect(promotionOf(db, moved)?.id).toBe(big.id);
    expect(moved.agreementId).not.toBe(free.agreementId);
    expect(termsFor(db, moved)?.showPurse, 'still on the old promotion’s money').toBe(90);
    expect(moved.bank, 'signing bonus was not paid').toBeGreaterThan(free.bank);
  });

  it('closes the old deal instead of leaving it open in the database', () => {
    const { db, small, big, fighter } = setup();
    const free = freeAgentAt(db, small, fighter);
    const oldId = free.agreementId as string;

    expect(sign(db, free, big, TERMS).ok).toBe(true);

    const old = db.agreements.findById(oldId) as { fightsRemaining: number } | undefined;
    expect(old, 'the old agreement vanished rather than being closed').toBeDefined();
    expect(old!.fightsRemaining, 'the old deal is still open').toBe(0);
  });

  it('frees a released fighter to sign, which is the way out of the lock', () => {
    const { db, small, big } = setup();
    // Somebody the promotion has no reason to hold: no name, no run.
    const nobody = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.promotionId === small.id && f.starPower < 20,
    );
    if (!nobody) return; // No such fighter in this seed; the unit tests above cover the rule.

    const signed = sign(db, nobody, small, { ...TERMS, fightsOwed: 4 }) as {
      ok: true;
      fighter: Fighter;
    };
    expect(canSignWith(db, signed.fighter, big).allowed).toBe(false);

    const outcome = requestRelease(db, signed.fighter);
    if (!outcome.released) {
      // A refusal is a legitimate answer, and it has to cost something or asking is free.
      expect(outcome.fighter.resentment).toBeGreaterThan(signed.fighter.resentment);
      return;
    }

    expect(contractStanding(db, outcome.fighter).freeAgent).toBe(true);
    expect(canSignWith(db, outcome.fighter, big).allowed).toBe(true);
  });
});
