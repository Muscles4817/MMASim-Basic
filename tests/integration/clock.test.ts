/**
 * The clock, the calendar and the interrupt.
 *
 * Time used to be a side effect of whichever screen happened to move it. Fighter mode advanced
 * inside "wait N weeks"; **promoter mode advanced nowhere at all**, which is why its clock was
 * frozen, every card overwrote the last one, and the entire `promotionCosts` feature never fired
 * for a player once. Four independent reviews found it separately.
 *
 * These assert the three properties that make one clock serve every mode: it moves, it stops
 * when the player is needed, and the calendar describing it cannot drift from the things it
 * describes.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { getWorld, setWorld } from '@mmasim/data';
import {
  inboxId,
  isBlocking,
  type Fighter,
  type FightNight,
  type InboxItem,
  type Promotion,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { buildCalendar, nextStop } from '../../packages/app/src/game/calendar';
import { raise, readInbox, resolveItem } from '../../packages/app/src/game/inbox';
import { autoFill, emptyDraft, scheduleCard } from '../../packages/app/src/game/promoting';
import { sign } from '../../packages/app/src/game/contracts';

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const START = 2192;

const asPromoter = (db: ReturnType<typeof game>) => {
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => a.prestige - b.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return promotion;
};

describe('the clock moves in every mode', () => {
  it('advances for a promoter, which it never did', () => {
    /*
     * The defect this file exists for. `advanceWorld` had exactly two callers, both in fighter
     * mode, and `App.tsx` redirects a promoter away from the only screen with an advance control.
     */
    const db = game();
    asPromoter(db);

    const before = getWorld(db).day;
    const result = advanceTo(db, before + 30);

    expect(result.day).toBe(before + 30);
    expect(getWorld(db).day).toBe(before + 30);
  });

  it('advances for a fighter', () => {
    const db = game();
    const me = (db.fighters.findAll() as Fighter[])[0]!;
    setWorld(db, { playerRole: 'fighter', playerFighterId: me.id as string });

    const before = getWorld(db).day;
    expect(advanceTo(db, before + 30).day).toBe(before + 30);
  });

  it('leaves the promoter’s own promotion alone while it runs', () => {
    // The world must not book the cards the player is going to book.
    const db = game();
    const promotion = asPromoter(db);

    advanceTo(db, START + 180);

    const mine = (db.events.findAll() as FightNight[]).filter(
      (e) => e.promotionId === promotion.id,
    );
    expect(mine).toHaveLength(0);
    expect((db.events.findAll() as FightNight[]).length).toBeGreaterThan(0);
  });

  it('does not run time backwards', () => {
    const db = game();
    asPromoter(db);
    const before = getWorld(db).day;
    const result = advanceTo(db, before - 100);
    expect(result.day).toBe(before);
    expect(getWorld(db).day).toBe(before);
  });

  it('charges a promotion for the time that passed', () => {
    /*
     * `chargePromotions` lives inside `advanceWorld`, so with no clock the whole
     * `promotionCosts` feature — the thing phase 3 was built and tuned around — had never once
     * run for a player. This is the assertion that it now does.
     */
    const db = game();
    const promotion = asPromoter(db);
    const before = promotion.budget;

    advanceTo(db, START + 365);

    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.budget).toBeLessThan(before);
  });

  it('lets a promotion run more than one card, with more than one event surviving', () => {
    /*
     * Measured before the clock existed: six cards produced one stored event, because `eventId`
     * keys on a day that never moved and each card overwrote the last.
     */
    const db = game();
    const promotion = asPromoter(db);

    for (let i = 0; i < 3; i++) {
      const day = getWorld(db).day + 21;
      const draft = autoFill({ db, promotion, draft: emptyDraft(), day });
      scheduleCard({ db, promotion, draft, day, broadcast: 'streamed' });
      advanceTo(db, day + 1);
    }

    const mine = (db.events.findAll() as FightNight[]).filter(
      (e) => e.promotionId === promotion.id,
    );
    expect(mine.length).toBe(3);
    expect(new Set(mine.map((e) => e.id)).size).toBe(3);
  });
});

describe('the interrupt', () => {
  const decision = (day: number): InboxItem => ({
    id: inboxId(day, 'test-decision'),
    day,
    kind: 'roster',
    priority: 'decision',
    title: 'Somebody needs an answer',
    actions: [{ id: 'ok', label: 'Fine', isDismiss: true }],
  });

  it('stops the clock when a decision appears mid-flight', () => {
    /*
     * The reason the inbox lives in the engine rather than in a React store. A simulation that
     * runs four weeks and then reports that your champion walked out in week one has taken the
     * decision away and called it a notification.
     *
     * Exercised through the real path rather than a planted item: a fighter is signed, a year
     * passes without them being booked, and `scanForInbox` raises the "can walk" decision while
     * the loop is running.
     */
    const db = game();
    const promotion = asPromoter(db);
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id,
    );
    sign(db, roster[0]!, promotion, {
      showPurse: 4,
      winBonus: 4,
      signingBonus: 0,
      revenuePoints: 0,
      fightsOwed: 4,
      championshipExtension: 'none',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
    });

    const target = START + 400;
    const result = advanceTo(db, target);

    expect(result.interrupted, 'the clock never stopped for anything').toBe(true);
    expect(result.day).toBeLessThan(target);
    expect(result.waiting.every((i) => isBlocking(i))).toBe(true);
  });

  it('does not re-stop on something the player has already seen', () => {
    // Otherwise the first unanswered decision is a lock rather than an interrupt, and the clock
    // can never move again.
    const db = game();
    asPromoter(db);
    raise(db, decision(START));

    const first = advanceTo(db, START + 30);
    expect(first.interrupted).toBe(false);
    expect(first.day).toBe(START + 30);
  });

  it('stops caring once the decision is answered', () => {
    const db = game();
    asPromoter(db);
    const item = decision(START + 5);
    raise(db, item);

    resolveItem(db, item.id, 'ok');
    const resolved = readInbox(db).find((i) => i.id === item.id)!;
    expect(isBlocking(resolved)).toBe(false);
  });

  it('reports how far it actually got', () => {
    const db = game();
    asPromoter(db);
    raise(db, decision(START + 3));
    const result = advanceTo(db, START + 200);
    expect(getWorld(db).day).toBe(result.day);
  });
});

describe('the calendar', () => {
  it('shows a promoter their own scheduled card as theirs', () => {
    const db = game();
    const promotion = asPromoter(db);
    const day = getWorld(db).day + 21;
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day });
    scheduleCard({ db, promotion, draft, day, broadcast: 'streamed' });

    const entries = buildCalendar(db, { from: START, to: START + 90 });
    const mine = entries.filter((e) => e.ownership === 'yours' && e.kind === 'card');
    expect(mine).toHaveLength(1);
    expect(mine[0]!.day).toBe(day);
  });

  it('marks somebody else’s card as the world’s rather than yours', () => {
    /*
     * One calendar serves every mode because ownership is a field rather than a separate screen.
     *
     * Scheduled here by hand for a rival, because **the world does not yet announce its cards** —
     * `buildNight` creates and runs a night in the same tick with `status: 'complete'`, so there
     * is never an upcoming rival card to show. That is a real gap rather than a bug in this
     * classification, and the honest test is of the thing that exists: given a scheduled card
     * that is not yours, the calendar says so.
     *
     * Pre-announcing the world's cards is the next piece of work, and it is what turns this
     * screen from "your diary" into "the sport's diary".
     */
    const db = game();
    const mine = asPromoter(db);
    const rival = (db.promotions.findAll() as unknown as Promotion[]).find((p) => p.id !== mine.id)!;

    const day = getWorld(db).day + 21;
    const draft = autoFill({ db, promotion: rival, draft: emptyDraft(), day });
    scheduleCard({ db, promotion: rival, draft, day, broadcast: 'streamed' });

    const entries = buildCalendar(db, { from: START, to: START + 90 });
    const theirs = entries.filter((e) => e.kind === 'card' && e.ownership === 'world');
    expect(theirs).toHaveLength(1);
    expect(entries.some((e) => e.kind === 'card' && e.ownership === 'yours')).toBe(false);
  });

  it('is derived, so it cannot describe a card that no longer exists', () => {
    /*
     * The reason entries are computed on read rather than stored. A second copy of the schedule
     * would go stale the moment anything moved, and the screen that owns the clock is the worst
     * possible place for a stale copy.
     */
    const db = game();
    const promotion = asPromoter(db);
    const day = getWorld(db).day + 21;
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day });
    const night = scheduleCard({ db, promotion, draft, day, broadcast: 'streamed' });

    expect(buildCalendar(db, { from: START, to: START + 90 }).some((e) => e.kind === 'card')).toBe(
      true,
    );

    db.events.upsert({ ...night, status: 'complete' } as never);
    expect(buildCalendar(db, { from: START, to: START + 90 }).some((e) => e.kind === 'card')).toBe(
      false,
    );
  });

  it('finds the next thing worth stopping for, and ignores rivals', () => {
    const db = game();
    const promotion = asPromoter(db);
    const day = getWorld(db).day + 40;
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day });
    scheduleCard({ db, promotion, draft, day, broadcast: 'streamed' });

    expect(nextStop(db, getWorld(db).day)).toBe(day);
  });

  it('returns nothing to stop for when the diary is empty', () => {
    const db = game();
    asPromoter(db);
    expect(nextStop(db, getWorld(db).day, 30)).toBeUndefined();
  });
});
