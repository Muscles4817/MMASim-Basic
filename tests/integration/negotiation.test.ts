/**
 * Negotiation, wired into promoter mode. Doc 34 C4.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  BID_WINDOW_DAYS,
  canNegotiate,
  matchBid,
  rivalBidsFor,
  sign,
  tableFor,
} from '../../packages/app/src/game/contracts';
import {
  acceptCounter,
  createPlan,
  placeBout,
  promoterContext,
} from '../../packages/app/src/game/plans';
import {
  makeOffer,
  openingTerms,
  withSlot,
  type CornerAnswer,
  type Fighter,
  type PromotionalAgreement,
  type Promotion,
} from '@mmasim/engine';

function world() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: promotion.id });
  const roster = (db.fighters.findAll() as Fighter[]).filter((f) => f.promotionId === promotion.id);
  return { db, promotion, roster, day: getWorld(db).day };
}

describe('the table', () => {
  it('opens for your own fighters and for free agents, not for somebody under contract elsewhere', () => {
    const { db, promotion, roster } = world();
    expect(canNegotiate(db, roster[0]!, promotion)).toMatchObject({ open: true, mode: 'resign' });
    const free = { ...roster[1]!, promotionId: undefined, agreementId: undefined };
    expect(canNegotiate(db, free as Fighter, promotion)).toMatchObject({
      open: true,
      mode: 'sign',
    });
  });

  it('signs what was agreed, on exactly those terms', () => {
    const { db, promotion, roster } = world();
    const fighter = roster[0]!;
    const table = tableFor(db, fighter, promotion);
    const generous = openingTerms(fighter, promotion);
    const talks = makeOffer(table, undefined, {
      ...generous,
      showPurse: generous.showPurse * 2,
      winBonus: generous.winBonus * 2,
    });
    expect(talks.state).toBe('agreed');
    const signed = sign(db, fighter, promotion, talks.agreed!);
    expect(signed.ok).toBe(true);
    const agreement = db.agreements.findById(
      (signed.ok ? signed.fighter.agreementId : '') as string,
    ) as PromotionalAgreement;
    expect(agreement.showPurse).toBe(talks.agreed!.showPurse);
    expect(agreement.fightsOwed).toBe(talks.agreed!.fightsOwed);
  });
});

describe('rival bids', () => {
  it('arrive only in the last months of a deal, and can be matched when the terms allow', () => {
    const { db, promotion, roster, day } = world();
    const fighter = roster[0]!;
    const signed = sign(db, fighter, promotion, openingTerms(fighter, promotion));
    if (!signed.ok) throw new Error(signed.reason);
    expect(rivalBidsFor(db, signed.fighter, promotion)).toEqual([]);

    const agreement = db.agreements.findById(
      signed.fighter.agreementId as string,
    ) as PromotionalAgreement;
    db.agreements.upsert({ ...agreement, expiresDay: day + BID_WINDOW_DAYS - 10 } as never);
    const bids = rivalBidsFor(db, signed.fighter, promotion);
    for (const bid of bids) expect(bid.promotion.id).not.toBe(promotion.id);
    const matchable = bids.find((b) => b.matchable);
    if (matchable) expect(matchBid(db, signed.fighter, promotion, matchable).ok).toBe(true);
  });
});

describe('meeting a bout counter', () => {
  function counterOn(kind: CornerAnswer['counter']) {
    const { db, promotion, roster, day } = world();
    const ctx = promoterContext({ db, promotion, day });
    const [a, b] = roster.filter((f) => f.divisionId === roster[0]!.divisionId);
    let plan = createPlan({ db, promotion, day: day + 60 });
    plan = placeBout({
      plan,
      slotId: 'main',
      redId: a!.id as string,
      blueId: b!.id as string,
      divisionId: a!.divisionId as string,
    });
    const slot = plan.slots.find((s) => s.id === 'main')!;
    plan = withSlot(plan, 'main', {
      ...slot.bout!,
      rounds: 3,
      status: 'declined',
      answers: [
        { fighterId: a!.id, verdict: 'accepted', note: 'Yes.' },
        { fighterId: b!.id, verdict: 'countered', note: 'Ask.', counter: kind },
      ],
    });
    return { ctx, plan, after: acceptCounter({ ctx, plan, slotId: 'main' }) };
  }

  it('grants five rounds on the spot', () => {
    const { after } = counterOn({ kind: 'rounds', rounds: 5 });
    const bout = after.slots.find((s) => s.id === 'main')!.bout!;
    expect(bout.status).toBe('agreed');
    expect(bout.rounds).toBe(5);
  });

  it('cannot grant a different opponent — that is a re-booking', () => {
    const { plan, after } = counterOn({
      kind: 'opponent',
      preferredId: 'somebody' as never,
      reason: 'Wants somebody else.',
    });
    expect(after).toBe(plan);
  });
});
