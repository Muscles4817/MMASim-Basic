/**
 * Fight week. Doc 34 A5.
 *
 * Nothing used to happen between signing a card and running it: withdrawals rolled on the night,
 * when nothing could be done but run a shorter card; there was no press, no build-up; and calling
 * a card off on the night was a free way round the cost of missing it. These pin what replaced
 * that.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  VOICE_POOLS,
  currentHeat,
  plannedBouts,
  pullOutRisk,
  withSlot,
  type EventPlan,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { readInbox } from '../../packages/app/src/game/inbox';
import { getRivalry } from '../../packages/app/src/game/rivalries';
import {
  FIGHT_WEEK_DAYS,
  MISSED_CARD_BUZZ,
  cancelPlan,
  cancellationCost,
  placeBout,
  planById,
  promoterContext,
  replacementsFor,
  savePlan,
  sendOffer,
  settleAlerts,
} from '../../packages/app/src/game/plans';
import {
  RUN_UP_DAYS,
  dailyPullOutRisk,
  holdPressConference,
  openWithdrawals,
  pressBlocker,
  rollRunUp,
  scanFightWeek,
} from '../../packages/app/src/game/fightWeek';
import { agreed, filledPlan } from '../helpers/plans';

const game = () => createNewGame({ adapter: undefined, era: '2026' });

function promoter() {
  const db = game();
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return { db, promotion, today: getWorld(db).day };
}

/** A fully signed card `away` days out. */
function signedCard(away: number) {
  const { db, promotion, today } = promoter();
  const plan = agreed(db, filledPlan({ db, promotion, day: today + away, today }));
  return { db, promotion, today, plan };
}

/** Roll every day of the run-up for one card, as the clock would. */
function rollTheRunUp(db: ReturnType<typeof game>, plan: EventPlan) {
  const out = [];
  for (let day = plan.day - RUN_UP_DAYS - 3; day <= plan.day + 1; day++) {
    out.push(...rollRunUp(db, day).map((w) => ({ ...w, rolledOn: day })));
  }
  return out;
}

describe('withdrawals in the run-up', () => {
  it('keep the whole-camp risk, spread over the run-up', () => {
    const { db, plan } = signedCard(60);
    for (const bout of plannedBouts(plan)) {
      const fighter = db.fighters.findById(bout.redId as string) as Fighter;
      const spread = 1 - Math.pow(1 - dailyPullOutRisk(fighter), RUN_UP_DAYS);
      expect(spread).toBeCloseTo(pullOutRisk(fighter), 10);
    }
  });

  it('happen on days before the card, inside the run-up, and never on the night', () => {
    // Several cards so the fixture is not one roll of the dice.
    const all = [40, 55, 70, 85].flatMap((away) => {
      const { db, plan } = signedCard(away);
      return rollTheRunUp(db, plan).map((w) => ({ ...w, cardDay: plan.day }));
    });
    expect(all.length).toBeGreaterThan(0);
    for (const w of all) {
      expect(w.rolledOn).toBeLessThan(w.cardDay);
      expect(w.cardDay - w.rolledOn).toBeLessThanOrEqual(RUN_UP_DAYS);
    }
  });

  it('empty the bout, leave the opponent waiting, and stop the clock until the slot is filled', () => {
    let found: { db: ReturnType<typeof game>; plan: EventPlan } | undefined;
    for (const away of [40, 55, 70, 85, 100]) {
      const { db, plan } = signedCard(away);
      if (rollTheRunUp(db, plan).length > 0) {
        found = { db, plan };
        break;
      }
    }
    expect(found).toBeDefined();
    const { db } = found!;
    const plan = planById(db, found!.plan.id)!;
    const w = plan.fightWeek!.withdrawals![0]!;

    expect(plan.slots.find((s) => s.id === w.slotId)?.bout).toBeUndefined();
    expect(openWithdrawals(plan).map((x) => x.slotId)).toContain(w.slotId);
    expect(w.opponentId).not.toBe(w.fighterId);

    const alert = readInbox(db).find(
      (i) => i.link?.slot === w.slotId || i.entries?.some((e) => e.key.includes(w.slotId)),
    );
    expect(alert?.priority).toBe('decision');
    expect(alert?.resolvedDay).toBeUndefined();

    // Same day, same news: rolled again, nothing new happens.
    expect(rollRunUp(db, w.day)).toEqual([]);

    // Fill the slot and the decision settles.
    const filled = placeBout({
      plan,
      slotId: w.slotId,
      redId: w.opponentId as string,
      blueId: w.fighterId as string,
      divisionId: w.divisionId as string,
    });
    savePlan(db, filled);
    settleAlerts(db, getWorld(db).day);
    expect(readInbox(db).find((i) => i.id === alert!.id)?.resolvedDay).toBeDefined();
    expect(openWithdrawals(planById(db, plan.id)!)).not.toContainEqual(
      expect.objectContaining({ slotId: w.slotId }),
    );
  });
});

describe('a bout that has weighed in', () => {
  it('cannot lose a fighter in the run-up any more (#63: a catchweight decision with nobody in it)', () => {
    // The same cards that produce withdrawals above, every bout already through the scales.
    const all = [40, 55, 70, 85].flatMap((away) => {
      const { db, plan } = signedCard(away);
      let weighed = plan;
      for (const slot of plan.slots) {
        if (slot.bout?.status !== 'agreed') continue;
        weighed = withSlot(weighed, slot.id, {
          ...slot.bout,
          weighIn: { results: [], opponentAccepts: true },
        });
      }
      savePlan(db, weighed);
      return rollTheRunUp(db, weighed);
    });
    expect(all).toEqual([]);
  });
});

describe('the short-notice market', () => {
  it('answers on the spot inside fight week, and over days before it', () => {
    const { db, promotion, plan } = signedCard(60);
    const slot = plan.slots.find((s) => s.position === 'prelim' && s.bout)!;
    const opponent = db.fighters.findById(slot.bout!.redId as string) as Fighter;
    const emptied = savePlan(db, {
      ...plan,
      slots: plan.slots.map((s) => (s.id === slot.id ? { ...s, bout: undefined } : s)),
    });

    const offerOn = (day: number) => {
      const ctx = promoterContext({ db, promotion, day });
      const [replacement] = replacementsFor({ ctx, plan: emptied, slot, opponent });
      expect(replacement).toBeDefined();
      const placed = placeBout({
        plan: emptied,
        slotId: slot.id,
        redId: opponent.id as string,
        blueId: replacement!.fighter.id as string,
        divisionId: slot.bout!.divisionId as string,
      });
      return sendOffer({ ctx, plan: placed, slotId: slot.id })!.outcome;
    };

    const inside = offerOn(plan.day - FIGHT_WEEK_DAYS);
    expect(inside.replyDay).toBeUndefined();
    expect(inside.answers.length).toBeGreaterThan(0);

    const before = offerOn(plan.day - 30);
    expect(before.replyDay).toBeGreaterThan(plan.day - 30);
  });
});

describe('the press conference', () => {
  it('is held in fight week, once, with a signed main event', () => {
    const { db, plan } = signedCard(30);
    expect(pressBlocker(plan, plan.day - 10)).toMatch(/fight week/);
    expect(pressBlocker(plan, plan.day)).toMatch(/fight night/i);
    expect(pressBlocker(plan, plan.day - 3)).toBeUndefined();

    setWorld(db, { day: plan.day - 3 });
    expect(holdPressConference(db, plan.id, 'civil')).toBeDefined();
    expect(holdPressConference(db, plan.id, 'confrontation')).toBeUndefined();
    expect(pressBlocker(planById(db, plan.id)!, plan.day - 2)).toMatch(/held/);
  });

  it('turns heat up for talking, not for keeping it civil, and speaks in the fighters’ voices', () => {
    const heatAfter = (choice: 'civil' | 'trashTalk' | 'confrontation') => {
      const { db, plan } = signedCard(30);
      setWorld(db, { day: plan.day - 3 });
      const press = holdPressConference(db, plan.id, choice)!;
      const main = plan.slots.find((s) => s.position === 'mainEvent')!.bout!;
      const heat = currentHeat(
        getRivalry(db, main.redId, main.blueId, plan.day - 3),
        (plan.day - 3) as never,
      );
      return { press, heat };
    };

    const civil = heatAfter('civil');
    const talk = heatAfter('trashTalk');
    const faceOff = heatAfter('confrontation');
    expect(civil.press.heatGained).toBe(0);
    expect(talk.press.heatGained).toBeGreaterThan(0);
    expect(faceOff.press.heatGained).toBeGreaterThan(talk.press.heatGained);
    expect(faceOff.heat).toBeGreaterThan(civil.heat);

    const said = new Set(Object.values(VOICE_POOLS.SAYS.pressTrashTalk).flat());
    expect(talk.press.lines).toHaveLength(2);
    for (const line of talk.press.lines) {
      expect(said.has(/“(.*)”$/.exec(line)![1]!)).toBe(true);
    }
  });

  it('pays the fine and banks the buzz', () => {
    const { db, promotion, plan } = signedCard(30);
    setWorld(db, { day: plan.day - 3 });
    const before = db.promotions.findById(promotion.id as string) as Promotion;
    const press = holdPressConference(db, plan.id, 'confrontation')!;
    const after = db.promotions.findById(promotion.id as string) as Promotion;

    expect(after.buzz).toBe(Math.min(100, before.buzz + press.buzzDelta));
    expect(after.budget).toBeCloseTo(before.budget - press.fine, 1);
    expect(press.fine > 0).toBe(press.scuffle);
  });

  it('is put in front of the player once, as fight week starts', () => {
    const { db, plan } = signedCard(30);
    scanFightWeek(db, plan.day - 10);
    const asked = () => readInbox(db).filter((i) => i.id.endsWith(`_press:${plan.id}`));
    expect(asked()).toHaveLength(0);

    scanFightWeek(db, plan.day - FIGHT_WEEK_DAYS);
    scanFightWeek(db, plan.day - FIGHT_WEEK_DAYS + 1);
    expect(asked()).toHaveLength(1);
    expect(asked()[0]!.priority).toBe('notable');
  });
});

describe('calling a card off', () => {
  it('costs as much as missing it inside fight week, less further out', () => {
    const { plan } = signedCard(60);
    expect(cancellationCost(plan, plan.day - 3).buzz).toBe(MISSED_CARD_BUZZ);
    expect(cancellationCost(plan, plan.day - 20).buzz).toBe(Math.ceil(MISSED_CARD_BUZZ / 2));
    expect(cancellationCost(plan, plan.day - 50).buzz).toBe(1);
    expect(
      cancellationCost(
        { ...plan, slots: plan.slots.map((s) => ({ ...s, bout: undefined })) },
        plan.day - 50,
      ).buzz,
    ).toBe(0);
  });

  it('is no way round the missed-card penalty on the night', () => {
    const { db, promotion, plan } = signedCard(30);
    setWorld(db, { day: plan.day });
    const signedId = plannedBouts(plan)[0]!.redId as string;
    const before = db.promotions.findById(promotion.id as string) as Promotion;

    const cost = cancelPlan(db, plan.id)!;
    expect(cost.buzz).toBe(MISSED_CARD_BUZZ);
    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.buzz).toBe(Math.max(1, before.buzz - MISSED_CARD_BUZZ));
    const fighter = db.fighters.findById(signedId) as Fighter;
    expect(fighter.ledger?.slice(-1)[0]?.kind).toBe('cardCancelled');
    expect(planById(db, plan.id)!.cancelled?.reason).toBe('calledOff');

    // Once.
    expect(cancelPlan(db, plan.id)).toBeUndefined();
  });
});
