/**
 * Negotiation, wired into promoter mode. Doc 34 C4.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  BID_WINDOW_DAYS,
  canNegotiate,
  matchBid,
  recordTalks,
  rivalBidsFor,
  sign,
  tableFor,
  talksWith,
} from '../../packages/app/src/game/contracts';
import {
  acceptCounter,
  championOfDivision,
  createPlan,
  placeBout,
  plansFor,
  promoterContext,
  savePlan,
  sendOffer,
  settleReplies,
} from '../../packages/app/src/game/plans';
import { advanceTo } from '../../packages/app/src/game/clock';
import { advanceWorld } from '../../packages/app/src/game/world';
import {
  TALKS_COOLDOWN_DAYS,
  counterLimit,
  isFinalCounter,
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

describe('talks that were left', () => {
  /*
   * Review of #55: the negotiation lived only in the component, so walking out of the room and
   * back in started it again — the player could ask until the answer was yes.
   */
  const lowball = (fighter: Fighter, promotion: Promotion) => {
    const t = openingTerms(fighter, promotion);
    return { ...t, showPurse: t.showPurse * 0.2, winBonus: t.winBonus * 0.2 };
  };

  it('a walk-out holds for the cooldown, through any number of returns to the table', () => {
    const { db, promotion, roster, day } = world();
    const fighter = roster[0]!;
    const walked = makeOffer(
      tableFor(db, fighter, promotion),
      undefined,
      lowball(fighter, promotion),
    );
    expect(walked.state).toBe('walked');
    recordTalks(db, fighter, walked);

    // Back at the table — a fresh screen, a fresh copy of the fighter — and nothing has moved.
    const back = talksWith(db, fighter, promotion);
    expect(back?.state).toBe('walked');
    const generous = openingTerms(fighter, promotion);
    const again = makeOffer(tableFor(db, fighter, promotion), back, {
      ...generous,
      showPurse: generous.showPurse * 3,
    });
    expect(again.state, 'a better offer reopened talks they had walked out of').toBe('walked');

    setWorld(db, { day: day + TALKS_COOLDOWN_DAYS - 1 });
    expect(talksWith(db, fighter, promotion)?.state).toBe('walked');
    setWorld(db, { day: day + TALKS_COOLDOWN_DAYS });
    expect(talksWith(db, fighter, promotion)).toBeUndefined();
  });

  it('keeps a last word on the table, and spending it walks them', () => {
    const { db, promotion, roster } = world();
    // Somebody who counters once, so the first counter is the last word.
    const fighter = roster.find((f) => counterLimit(f) === 1)!;
    const table = tableFor(db, fighter, promotion);
    const opening = openingTerms(fighter, promotion);
    let talks: ReturnType<typeof makeOffer> | undefined;
    for (const share of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6]) {
      talks = makeOffer(table, undefined, { ...opening, showPurse: opening.showPurse * share });
      if (talks.state === 'countered') break;
    }
    expect(talks?.state).toBe('countered');
    expect(isFinalCounter(talks!, fighter)).toBe(true);
    recordTalks(db, fighter, talks!);

    const back = talksWith(db, fighter, promotion)!;
    expect(back.ask).toEqual(talks!.ask);
    expect(back.counters).toBe(1);
    expect(makeOffer(table, back, lowball(fighter, promotion)).state).toBe('walked');
  });

  it('is cleared by a signature', () => {
    const { db, promotion, roster } = world();
    const fighter = roster[0]!;
    recordTalks(
      db,
      fighter,
      makeOffer(tableFor(db, fighter, promotion), undefined, lowball(fighter, promotion)),
    );
    const signed = sign(db, fighter, promotion, openingTerms(fighter, promotion));
    expect(signed.ok).toBe(true);
    expect((db.fighters.findById(fighter.id as string) as Fighter).talks).toBeUndefined();
  });

  it('is dropped from the save once the cooldown has passed, signed or not', () => {
    const { db, promotion, roster, day } = world();
    const fighter = roster[0]!;
    recordTalks(
      db,
      fighter,
      makeOffer(tableFor(db, fighter, promotion), undefined, lowball(fighter, promotion)),
    );
    const stored = () => (db.fighters.findById(fighter.id as string) as Fighter).talks;
    advanceWorld(db, day, day + 30, {});
    expect(stored(), 'dropped while it still stands').toBeDefined();
    advanceWorld(db, day + 30, day + TALKS_COOLDOWN_DAYS + 1, {});
    expect(stored()).toBeUndefined();
  });
});

describe('a bout offer that is out', () => {
  function offerOut(cardIn = 60) {
    const w = world();
    const ctx = promoterContext({ db: w.db, promotion: w.promotion, day: w.day });
    const [a, b] = w.roster.filter((f) => f.divisionId === w.roster[0]!.divisionId);
    let plan = createPlan({ db: w.db, promotion: w.promotion, day: w.day + cardIn });
    plan = placeBout({
      plan,
      slotId: 'main',
      redId: a!.id as string,
      blueId: b!.id as string,
      divisionId: a!.divisionId as string,
    });
    const result = sendOffer({ ctx, plan, slotId: 'main' })!;
    savePlan(w.db, result.plan);
    return { ...w, a: a!, b: b!, plan: result.plan, result };
  }
  const boutOf = (db: ReturnType<typeof world>['db'], planId: string, promotionId: string) =>
    plansFor(db, promotionId)
      .find((p) => p.id === planId)!
      .slots.find((s) => s.id === 'main')!.bout!;
  const offerItems = (db: ReturnType<typeof world>['db'], planId: string) =>
    db.inbox.findAll().filter((i) => String(i.id).includes(`offer:${planId}:main`));

  it('settles once when the clock jumps straight past the reply day, and never again', () => {
    const { db, promotion, plan, result } = offerOut();
    const replyDay = result.outcome.replyDay!;
    expect(boutOf(db, plan.id, promotion.id as string).status).toBe('offered');

    // The clock does not stop on the reply day: a jump lands days past it.
    advanceTo(db, replyDay + 5);
    expect(getWorld(db).day).toBeGreaterThanOrEqual(replyDay);
    const settled = boutOf(db, plan.id, promotion.id as string);
    expect(['agreed', 'declined']).toContain(settled.status);
    expect(settled.pending).toBeUndefined();
    expect(settled.answers).toEqual(result.plan.slots.find((s) => s.id === 'main')!.bout!.pending);
    expect(offerItems(db, plan.id)).toHaveLength(1);

    // Asked again, later: nothing left to settle, and no second letter about the same fight.
    expect(settleReplies(db, replyDay + 20)).toBe(0);
    expect(offerItems(db, plan.id)).toHaveLength(1);
    expect(boutOf(db, plan.id, promotion.id as string)).toEqual(settled);
  });

  it('counts a corner who was cut while it was out as a refusal', () => {
    const { db, promotion, plan, result, b } = offerOut();
    const stored = db.fighters.findById(b.id as string) as Fighter;
    db.fighters.upsert({ ...stored, promotionId: undefined, agreementId: undefined } as never);

    expect(settleReplies(db, result.outcome.replyDay!)).toBe(1);
    const bout = boutOf(db, plan.id, promotion.id as string);
    expect(bout.status).toBe('declined');
    const theirs = bout.answers!.find((x) => x.fighterId === b.id)!;
    expect(theirs.verdict).toBe('declined');
    expect(theirs.note).toMatch(/no longer under contract/);
  });

  it('counts a corner who signed elsewhere while it was out as a refusal', () => {
    const { db, promotion, plan, result, a } = offerOut();
    const rival = (db.promotions.findAll() as unknown as Promotion[]).find(
      (p) => p.id !== promotion.id,
    )!;
    const stored = db.fighters.findById(a.id as string) as Fighter;
    db.fighters.upsert({ ...stored, promotionId: rival.id } as never);

    settleReplies(db, result.outcome.replyDay!);
    const bout = boutOf(db, plan.id, promotion.id as string);
    expect(bout.status).toBe('declined');
    expect(bout.answers!.find((x) => x.fighterId === a.id)!.verdict).toBe('declined');
  });

  it('is answered before the card, never on fight night', () => {
    for (const cardIn of [3, 4, 5, 6]) {
      const { plan, result, day } = offerOut(cardIn);
      if (result.outcome.replyDay === undefined) continue;
      expect(result.outcome.replyDay).toBeLessThanOrEqual(plan.day - 1);
      expect(result.outcome.replyDay).toBeGreaterThan(day);
    }
  });

  it('is answered on the spot when the card is tomorrow', () => {
    const { db, plan, result } = offerOut(1);
    const bout = plan.slots.find((s) => s.id === 'main')!.bout!;
    expect(result.outcome.replyDay).toBeUndefined();
    expect(['agreed', 'declined']).toContain(bout.status);
    expect(bout.pending).toBeUndefined();
    expect(result.outcome.answers.length).toBe(2);
    expect(offerItems(db, plan.id)).toHaveLength(1);
  });
});

describe('a champion holding out', () => {
  it('turns down the title fight until re-signed, and takes it after', () => {
    const { db, promotion, day } = world();
    const titled = Object.entries(promotion.champions).find(([, id]) => id !== undefined)!;
    const divisionId = titled[0];
    const ctx0 = promoterContext({ db, promotion, day });
    const champion = championOfDivision(ctx0, divisionId)!;
    const contender = ctx0.roster.find((f) => f.divisionId === divisionId && f.id !== champion.id)!;

    // Underpaid and proud: the grievance chain's last link.
    db.fighters.upsert({
      ...champion,
      resentment: 85,
      personality: { ...champion.personality, ego: 75 },
    } as never);

    const offerTitle = (cardDay: number) => {
      const ctx = promoterContext({ db, promotion, day: getWorld(db).day });
      let plan = createPlan({ db, promotion, day: cardDay });
      plan = placeBout({
        plan,
        slotId: 'main',
        redId: champion.id as string,
        blueId: contender.id as string,
        divisionId,
        titleKind: 'undisputed',
      });
      const out = sendOffer({ ctx, plan, slotId: 'main' })!;
      return out.plan.slots
        .find((s) => s.id === 'main')!
        .bout!.pending!.find((x) => x.fighterId === champion.id)!;
    };

    const before = offerTitle(day + 60);
    expect(before.verdict).toBe('declined');
    expect(before.note).toMatch(/Holding out/);

    // The deal redone, at the table: generous enough to close on the first offer.
    const holdout = db.fighters.findById(champion.id as string) as Fighter;
    const terms = openingTerms(holdout, promotion);
    const talks = makeOffer(tableFor(db, holdout, promotion), undefined, {
      ...terms,
      showPurse: terms.showPurse * 2,
      winBonus: terms.winBonus * 2,
    });
    expect(talks.state).toBe('agreed');
    const signed = sign(db, holdout, promotion, talks.agreed!);
    expect(signed.ok).toBe(true);
    expect((db.fighters.findById(champion.id as string) as Fighter).resentment).toBe(0);

    const after = offerTitle(day + 61);
    expect(after.note).not.toMatch(/Holding out/);
    expect(after.verdict).toBe('accepted');
  });
});
