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
  type NewsItem,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { readInbox, recordOfferOutcome } from '../../packages/app/src/game/inbox';
import { attentionFor } from '../../packages/app/src/game/attention';
import { GRACE_DAYS, graceEnds, raiseDecisions, walkDay } from '../../packages/app/src/game/alerts';
import { bookingsFor, createPlan, presentAlert, savePlan } from '../../packages/app/src/game/plans';
import { bookedOnPlans } from '../../packages/app/src/game/finances';
import { agreed, filledPlan } from '../helpers/plans';
import { sign } from '../../packages/app/src/game/contracts';

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

const TERMS = {
  showPurse: 4,
  winBonus: 4,
  signingBonus: 0,
  revenuePoints: 0,
  fightsOwed: 4,
  championshipExtension: 'none',
  matchingRights: false,
  exclusive: true,
  outsideBouts: 0,
} as const;

const agreementOf = (db: ReturnType<typeof game>, f: Fighter) =>
  db.agreements.findById(f.agreementId as string) as PromotionalAgreement | undefined;

describe('the walk-out warning', () => {
  it('is raised once per fighter per stage, not every day', () => {
    const { db, promotion, start } = asPromoter();

    /*
     * A digest-worthy situation set up on purpose: a deal running out a hundred days in, which
     * is worth knowing at thirty days and at seven and is never a reason to stop the clock. This
     * test used to lean on the world happening to produce one — a single #1 contender on a run —
     * and a change to how generated fighters are made was enough to take it away.
     */
    const expiring = roster(db, promotion).find((f) => !holdsBelt(promotion, f))!;
    sign(db, expiring, promotion, TERMS);
    const deal = agreementOf(db, db.fighters.findById(expiring.id as string) as Fighter)!;
    db.agreements.upsert({ ...deal, expiresDay: start + 100 } as never);

    /*
     * Two years in weekly hops. The scan runs on every simulated day inside each hop, so this is
     * the case that used to write a new item per fighter per day. Two years, because the seeded
     * roster's deals do not come due until well into the second.
     */
    for (let day = start + 7; day <= start + 730; day += 7) {
      advanceTo(db, day);
      for (const item of readInbox(db).filter(isBlocking)) {
        db.inbox.upsert({ ...item, resolvedDay: day, resolvedWith: 'ok' } as never);
      }
    }

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

    // What does not stop the clock is folded into a weekly digest, and every line goes somewhere.
    const digests = readInbox(db).filter((i) => i.id.endsWith('_digest'));
    expect(digests.length).toBeGreaterThan(0);
    for (const digest of digests) {
      expect(isBlocking(digest)).toBe(false);
      for (const entry of digest.entries ?? []) expect(entry.link, entry.title).toBeDefined();
    }

    // The deal set up above landed there, once at each stage, and nowhere that blocks.
    const lines = digests.flatMap((d) => d.entries ?? []).map((e) => e.key);
    for (const stage of [30, 7]) {
      const key = `expiring:${expiring.id}:${start + 100}:${stage}`;
      expect(
        lines.filter((k) => k === key),
        key,
      ).toHaveLength(1);
    }
    // On priority, not `isBlocking`: the loop above resolves every stop, so a contract raised as
    // a decision would no longer be blocking by now and could not fail that check.
    expect(
      readInbox(db).some(
        (i) =>
          i.priority === 'decision' &&
          (i.id.includes('expiring:') ||
            (i.entries ?? []).some((e) => e.key.startsWith('expiring:'))),
      ),
    ).toBe(false);
  });

  it('stops the clock a handful of times a year, not every day', () => {
    const { db, start } = asPromoter();
    let stops = 0;
    while (getWorld(db).day < start + 730) {
      const result = advanceTo(db, getWorld(db).day + 30);
      if (result.interrupted) stops += 1;
      for (const item of readInbox(db).filter(isBlocking)) {
        db.inbox.upsert({ ...item, resolvedDay: getWorld(db).day, resolvedWith: 'ok' } as never);
      }
    }
    // Measured at 129 stops in two years before the rework; a few is the point.
    expect(stops).toBeGreaterThan(0);
    expect(stops).toBeLessThanOrEqual(12);
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
  it('opens quietly: nothing stops the clock until the walk-out warnings are due', () => {
    // The warnings are allowed thirty days before the grace period lifts, so they can still be
    // thirty-day warnings; before that, nothing.
    const { db, start } = asPromoter();
    const result = advanceTo(db, start + GRACE_DAYS - 31);
    expect(result.interrupted).toBe(false);
    expect(readInbox(db).filter(isBlocking)).toEqual([]);
  });

  /*
   * A controlled pair, because "nobody walked" proves nothing unless somebody would have.
   * Shelved fighters are stars on two-year-old deals with no fights on their record: every one
   * of them in breach, and with the most leverage the walk-out rule recognises.
   */
  it('is quiet about the inherited roster, not about the player’s own cards', () => {
    const { db, promotion, start } = asPromoter();
    const plan = createPlan({ db, promotion, day: start + 20 });
    const result = advanceTo(db, start + 2);
    expect(result.waiting.some((i) => i.id === `alert:mainevent:${plan.id}:30`)).toBe(true);
  });

  it('loses shelved stars without the grace period, and none with it', () => {
    const walkedOver = (graceOver: boolean) => {
      const { db, promotion, start } = asPromoter();
      if (graceOver) setWorld(db, { startedDay: start - 400 });
      const shelved = shelve(db, promotion, start, 200);
      advanceThrough(db, start + GRACE_DAYS - 1);
      return walkedOut(db, promotion, shelved);
    };

    expect(walkedOver(true), 'the control: without a grace period, somebody walks').toBeGreaterThan(
      0,
    );
    expect(walkedOver(false)).toBe(0);
  });
});

describe('an open decision', () => {
  it('counts down as the days pass rather than keeping the day it was raised', () => {
    const { db, promotion, start } = asPromoter();
    const fighter = roster(db, promotion)[0]!;
    const deadline = start + 60;
    raiseDecisions(
      db,
      start + 53,
      [
        {
          key: `activity:${fighter.id}:${deadline}:7`,
          kind: 'roster',
          title: 'frozen',
          fighterId: fighter.id,
        },
      ],
      { kind: 'activity', title: () => '', body: '' },
    );
    const item = readInbox(db).find((i) => i.id.startsWith('alert:activity:'))!;
    expect(presentAlert(db, item, start + 57).title).toMatch(/can walk in 3 days$/);
    expect(presentAlert(db, item, start + 59).title).toMatch(/can walk in 1 day$/);
    expect(presentAlert(db, item, start + 60).title).toMatch(/can walk now$/);
    // Answered, it is history and keeps its words.
    const answered = { ...item, resolvedDay: start + 55, resolvedWith: 'ok' };
    expect(presentAlert(db, answered, start + 60).title).toBe('frozen');
  });
});

describe('the grace period ends on its day', () => {
  it('even when one advance runs straight through it', () => {
    /*
     * The hold used to be decided once per advance, from the day it started: an advance that
     * began inside the grace period held the whole inherited roster for its entire length, so a
     * long one carried the grace period weeks or months past its end.
     */
    const { db, promotion, start } = asPromoter();
    const shelved = shelve(db, promotion, start, 200);
    advanceThrough(db, start + GRACE_DAYS + 200);
    expect(walkedOut(db, promotion, shelved)).toBeGreaterThan(0);
  });
});

describe('what holds a fighter', () => {
  /*
   * Only a signed bout. Pencilling the whole roster onto a card a year out must not stop anybody
   * leaving, or the walk-out rule is a formality.
   */
  const holdOver = (status: 'draft' | 'agreed') => {
    const { db, promotion, start } = asPromoter();
    setWorld(db, { startedDay: start - 400 });
    const shelved = shelve(db, promotion, start, 24);

    let plan = createPlan({ db, promotion, day: start + 400, scale: 'flagship' });
    const onCard: Fighter[] = [];
    plan.slots.forEach((slot, i) => {
      const [red, blue] = [shelved[i * 2], shelved[i * 2 + 1]];
      if (!red || !blue) return;
      onCard.push(red, blue);
      plan = withSlot(plan, slot.id, {
        redId: red.id,
        blueId: blue.id,
        divisionId: red.divisionId,
        status,
        rounds: 3,
      });
    });
    savePlan(db, plan);

    advanceThrough(db, start + 365);
    return walkedOut(db, promotion, onCard);
  };

  it('is not a pencilled bout', () => {
    expect(holdOver('draft')).toBeGreaterThan(0);
  });

  it('is a signed one', () => {
    expect(holdOver('agreed')).toBe(0);
  });

  it('is the same answer on the roster as in the inbox', () => {
    const { db, promotion, start } = asPromoter();
    const plan = filledPlan({ db, promotion, day: start + 84, today: start });
    const slot = plan.slots.find((s) => s.bout)!;
    savePlan(db, withSlot(plan, slot.id, { ...slot.bout!, status: 'declined' }));
    const roster = bookedOnPlans(db, promotion.id as string);
    expect(roster.has(slot.bout!.redId as string)).toBe(false);
    // Pencilled is not booked either: the roster and the walk-out warning agree.
    const pencilled = plan.slots.find((s) => s.id !== slot.id && s.bout)!.bout!;
    expect(roster.has(pencilled.redId as string)).toBe(false);
  });
});

/** `n` of the roster as shelved stars: signed two years ago, nothing fought, and famous. */
function shelve(
  db: ReturnType<typeof game>,
  promotion: Promotion,
  start: number,
  n: number,
): Fighter[] {
  const out: Fighter[] = [];
  for (const fighter of roster(db, promotion).slice(0, n)) {
    if (holdsBelt(promotion, fighter)) continue;
    sign(db, fighter, promotion, TERMS);
    const signed = db.fighters.findById(fighter.id as string) as Fighter;
    db.agreements.upsert({ ...agreementOf(db, signed)!, signedDay: start - 730 } as never);
    db.fighters.upsert({ ...signed, record: [], starPower: 100 } as never);
    out.push(db.fighters.findById(fighter.id as string) as Fighter);
  }
  return out;
}

const holdsBelt = (promotion: Promotion, fighter: Fighter) =>
  promotion.champions[fighter.divisionId] === fighter.id;

/** Advance to `day`, answering every stop on the way, as a player who reads and moves on. */
function advanceThrough(db: ReturnType<typeof game>, day: number) {
  while (getWorld(db).day < day) {
    const before = getWorld(db).day;
    advanceTo(db, day);
    for (const item of readInbox(db).filter(isBlocking)) {
      db.inbox.upsert({ ...item, resolvedDay: getWorld(db).day, resolvedWith: 'ok' } as never);
    }
    if (getWorld(db).day === before) break;
  }
}

/**
 * How many of `fighters` walked out over the activity guarantee — read from the walk-out news
 * rather than from who left, because a year also ends contracts and careers for other reasons.
 */
const walkedOut = (db: ReturnType<typeof game>, promotion: Promotion, fighters: Fighter[]) => {
  const ids = new Set(fighters.map((f) => f.id as string));
  // The raw table rather than `readNews`, which trims the minor items a walk-out is filed as.
  return (db.news.findAll() as readonly NewsItem[]).filter(
    (n) =>
      n.promotionId === promotion.id &&
      /walks out/.test(n.headline) &&
      n.fighterIds.some((id) => ids.has(id)),
  ).length;
};

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

  it('opens a save on a handful of rows, with one fact about the roster said once', () => {
    const { db, promotion } = asPromoter();
    const items = attentionFor(db, promotion);
    expect(items.filter((i) => i.id.startsWith('decline:')).length).toBeLessThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(6);
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
    recordOfferOutcome({
      db,
      plan,
      cardName: 'Test card',
      slotId: slot.id,
      bout,
      accepted: false,
      answers: bout.answers,
    });
    expect(readInbox(db).filter(isBlocking)).toHaveLength(1);

    savePlan(db, withSlot(plan, slot.id, { ...bout, status: 'agreed' }));
    expect(readInbox(db).filter(isBlocking)).toHaveLength(0);
  });

  it('stops blocking once the fighter it was about is booked', () => {
    const { db, promotion } = asPromoter();
    // Somebody with a deal, warned at the thirty-day stage, twenty days out.
    sign(db, roster(db, promotion)[0]!, promotion, TERMS);
    const fighter = roster(db, promotion).find((f) => f.agreementId)!;
    const deadline = walkDay(db, fighter, agreementOf(db, fighter)!);
    const today = deadline - 20;
    setWorld(db, { day: today });
    raiseDecisions(
      db,
      today,
      [
        {
          key: `activity:${fighter.id}:${deadline}:30`,
          kind: 'roster',
          title: 'Can walk',
          fighterId: fighter.id,
        },
      ],
      { kind: 'activity', title: () => '', body: '' },
    );
    expect(readInbox(db).filter(isBlocking)).toHaveLength(1);
    // Saving a card that does not involve them changes nothing.
    createPlan({ db, promotion, day: today + 60 });
    expect(readInbox(db).filter(isBlocking)).toHaveLength(1);

    // Put them on a card: the warning has nothing left to say.
    let plan = filledPlan({ db, promotion, day: today + 30, today });
    const slot = plan.slots.find((s) => s.bout && s.bout.blueId !== fighter.id)!;
    plan = withSlot(plan, slot.id, { ...slot.bout!, redId: fighter.id, status: 'agreed' });
    savePlan(db, plan);

    expect(bookingsFor(db, promotion.id as string).has(fighter.id as string)).toBe(true);
    expect(readInbox(db).filter(isBlocking)).toHaveLength(0);
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
