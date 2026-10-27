/**
 * Alert hygiene.
 *
 * The promoter audit counted what the inbox was doing: "X can walk in N days" raised afresh every
 * simulated day — 1,076 blocking stops in four years, thirteen in three weeks — including for
 * fighters already on a card; "put them on a card within 0 days" from the first day of a save; a
 * suspension measured against today rather than the bout; a counter that had been paid still
 * blocking the badge. These pin the rules that replaced it (see `game/alerts.ts`).
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  isBlocking,
  planHealth,
  plannedBouts,
  withSlot,
  type Fighter,
  type InboxItem,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { readInbox, recordOfferOutcome } from '../../packages/app/src/game/inbox';
import { attentionFor } from '../../packages/app/src/game/attention';
import { GRACE_DAYS, graceEnds, walkDay } from '../../packages/app/src/game/alerts';
import { bookingsFor, savePlan } from '../../packages/app/src/game/plans';
import { agreed, filledPlan } from '../helpers/plans';

const game = () => createNewGame({ adapter: undefined, era: '2026' });

function asPromoter() {
  const db = game();
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, {
    playerRole: 'promoter',
    playerPromotionId: promotion.id as string,
    startedDay: getWorld(db).day,
  });
  return { db, promotion, start: getWorld(db).day };
}

/** Every activity subject-and-stage key the inbox has ever carried, with how often. */
function activityKeys(items: readonly InboxItem[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (key: string) => out.set(key, (out.get(key) ?? 0) + 1);
  for (const item of items) {
    if (item.id.startsWith('alert:activity:')) add(item.id.slice('alert:'.length));
    for (const entry of item.entries ?? []) if (entry.key.startsWith('activity:')) add(entry.key);
  }
  return out;
}

const roster = (db: ReturnType<typeof game>, promotion: Promotion) =>
  (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
  );

const agreementOf = (db: ReturnType<typeof game>, f: Fighter) =>
  db.agreements.findById(f.agreementId as string) as PromotionalAgreement | undefined;

describe('the walk-out warning', () => {
  it('is raised once per fighter per stage, not every day', () => {
    const { db, start } = asPromoter();

    // A day at a time is the worst case: every day used to be a new item.
    for (let day = start + 1; day <= start + 120; day++) advanceTo(db, day);

    const keys = activityKeys(readInbox(db));
    expect(keys.size).toBeGreaterThan(0);
    for (const [key, count] of keys) expect(count, key).toBe(1);

    // Two stages at most for any one fighter and deadline.
    const perSubject = new Map<string, number>();
    for (const key of keys.keys()) {
      const subject = key.split(':').slice(0, 3).join(':');
      perSubject.set(subject, (perSubject.get(subject) ?? 0) + 1);
    }
    for (const [subject, stages] of perSubject) expect(stages, subject).toBeLessThanOrEqual(2);
  });

  it('stops the clock a handful of times a year, not every day', () => {
    const { db, start } = asPromoter();
    let stops = 0;
    while (getWorld(db).day < start + 365) {
      const result = advanceTo(db, getWorld(db).day + 30);
      if (result.interrupted) stops += 1;
      for (const item of readInbox(db).filter(isBlocking)) {
        db.inbox.upsert({ ...item, resolvedDay: getWorld(db).day, resolvedWith: 'ok' } as never);
      }
    }
    // Measured at 129 stops in two years before the rework; a few is the point.
    expect(stops).toBeLessThanOrEqual(6);
  });

  it('never counts down from a deadline that has already passed', () => {
    // "Put them on a card within 0 days" on day one, against a fourteen-day minimum lead.
    const { db, promotion } = asPromoter();
    for (const item of attentionFor(db, promotion)) {
      expect(item.detail).not.toMatch(/within 0 days/);
    }
    for (const fighter of roster(db, promotion)) {
      const agreement = agreementOf(db, fighter);
      if (agreement) expect(walkDay(db, fighter, agreement)).toBeGreaterThanOrEqual(graceEnds(db));
    }
  });

  it('is silent about, and cannot happen to, a fighter who is booked', () => {
    const { db, promotion, start } = asPromoter();
    const plan = agreed(
      db,
      filledPlan({ db, promotion, day: start + GRACE_DAYS + 60, today: start }),
    );
    const booked = new Set(
      plannedBouts(plan).flatMap((b) => [b.redId as string, b.blueId as string]),
    );

    for (let day = start + 7; day <= start + GRACE_DAYS + 50; day += 7) advanceTo(db, day);

    const warned = [...activityKeys(readInbox(db)).keys()].map((k) => k.split(':')[1]);
    expect(warned.filter((id) => booked.has(id!))).toEqual([]);
    for (const id of booked) {
      expect((db.fighters.findById(id) as Fighter).promotionId).toBe(promotion.id);
    }
  });
});

describe('a new save', () => {
  it('has a grace period in which nothing about the inherited roster stops the clock', () => {
    const { db, start } = asPromoter();
    const result = advanceTo(db, start + GRACE_DAYS - 1);
    expect(result.interrupted).toBe(false);
    expect(readInbox(db).filter(isBlocking)).toEqual([]);
  });

  it('cannot lose anybody to the walk-out rule inside the grace period', () => {
    const { db, promotion, start } = asPromoter();
    const before = new Set(roster(db, promotion).map((f) => f.id as string));
    advanceTo(db, start + GRACE_DAYS - 1);
    const walked = (db.news.findAll() as { headline: string; promotionId?: string }[]).filter(
      (n) => n.promotionId === promotion.id && /walks out/.test(n.headline),
    );
    expect(walked).toEqual([]);
    expect(before.size).toBeGreaterThan(0);
  });
});

describe('the dashboard', () => {
  it('measures a suspension against the bout, not against today', () => {
    const { db, promotion, start } = asPromoter();
    const plan = agreed(db, filledPlan({ db, promotion, day: start + 84, today: start }));
    const slot = plan.slots.find((s) => s.bout)!;
    const id = slot.bout!.redId as string;
    const fighter = db.fighters.findById(id) as Fighter;

    // Suspended for 27 more days, on a card 84 days away: no problem at all.
    db.fighters.upsert({ ...fighter, readyOnDay: start + 27 } as never);
    expect(attentionFor(db, promotion).some((i) => i.id === `medical:${id}`)).toBe(false);

    // Suspended past the card: a problem, and the row goes to that bout.
    db.fighters.upsert({ ...fighter, readyOnDay: start + 90 } as never);
    const item = attentionFor(db, promotion).find((i) => i.id === `medical:${id}`);
    expect(item?.action).toMatchObject({ route: 'plan', id: plan.id, slot: slot.id });
  });

  it('does not add a medical alert for every fighter put on a card', () => {
    const { db, promotion, start } = asPromoter();
    const before = attentionFor(db, promotion).length;
    agreed(db, filledPlan({ db, promotion, day: start + 84, today: start }));
    const after = attentionFor(db, promotion);
    expect(after.filter((i) => i.kind === 'medical')).toEqual([]);
    // A card replaces "nothing on the calendar"; it should not multiply the list.
    expect(after.length).toBeLessThanOrEqual(before + 2);
  });
});

describe('decisions settle themselves', () => {
  it('stops blocking once a counter has been paid', () => {
    const { db, promotion, start } = asPromoter();
    let plan = filledPlan({ db, promotion, day: start + 84, today: start });
    const slot = plan.slots.find((s) => s.bout)!;
    const bout = {
      ...slot.bout!,
      status: 'declined' as const,
      answers: [
        {
          fighterId: slot.bout!.redId,
          verdict: 'countered' as const,
          note: 'More.',
          askingPurse: 20,
        },
      ],
    };
    plan = savePlan(db, withSlot(plan, slot.id, bout));
    recordOfferOutcome({ db, plan, slotId: slot.id, bout, accepted: false, answers: bout.answers });
    expect(readInbox(db).filter(isBlocking)).toHaveLength(1);

    savePlan(db, withSlot(plan, slot.id, { ...bout, status: 'agreed' }));
    expect(readInbox(db).filter(isBlocking)).toHaveLength(0);
  });

  it('stops blocking once the fighter it was about is booked', () => {
    const { db, promotion, start } = asPromoter();
    let stoppedOn: InboxItem | undefined;
    for (let day = start + 7; day <= start + 365 && !stoppedOn; day += 7) {
      const result = advanceTo(db, day);
      stoppedOn = result.waiting.find((i) => i.id.startsWith('alert:activity:'));
    }
    if (!stoppedOn) return; // Nobody on this roster is owed a bout: nothing to settle.

    const fighterId = stoppedOn.id.split(':')[2]!;
    const today = getWorld(db).day;
    let plan = filledPlan({ db, promotion, day: today + 21, today });
    const slot = plan.slots.find((s) => s.bout && s.bout.redId !== fighterId)!;
    plan = withSlot(plan, slot.id, { ...slot.bout!, redId: fighterId as never, status: 'agreed' });
    savePlan(db, plan);

    expect(bookingsFor(db, promotion.id as string).has(fighterId)).toBe(true);
    expect(readInbox(db).find((i) => i.id === stoppedOn!.id)?.resolvedWith).toBe('settled');
  });
});

describe('a card’s state, said once', () => {
  it('reads a refusal as a refusal, not as a missing main event', () => {
    // The calendar row said "main event set" in its detail and "Needs a main event" on its chip.
    const { db, promotion, start } = asPromoter();
    let plan = agreed(db, filledPlan({ db, promotion, day: start + 84, today: start }));
    const prelim = plan.slots.filter((s) => s.bout).at(-1)!;
    plan = withSlot(plan, prelim.id, { ...prelim.bout!, status: 'declined' });
    expect(planHealth(plan)).toBe('turnedDown');
  });
});
