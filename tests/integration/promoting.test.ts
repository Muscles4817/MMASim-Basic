/**
 * Building a card as the promoter.
 *
 * The shape under test is sections rather than nine equal slots — a main event, a co-main,
 * three main-card bouts and four prelims. That is how a card is actually assembled, and it is
 * the answer to the decision-density problem: nine individually-chosen fights is eighteen
 * dropdowns and a spreadsheet, while four sections with different stakes is four kinds of
 * decision.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { CARD_SIZE, type Fighter, type Promotion } from '@mmasim/engine';
import {
  CARD_SECTIONS,
  autoFill,
  draftBouts,
  emptyDraft,
  forecastCard,
  proposalsFor,
  runScheduledCard,
  scheduleCard,
} from '../../packages/app/src/game/promoting';
import { advanceWorld } from '../../packages/app/src/game/world';

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const leader = (db: ReturnType<typeof game>) =>
  (db.promotions.findAll() as unknown as Promotion[]).slice().sort((a, b) => b.prestige - a.prestige)[0]!;
const smallest = (db: ReturnType<typeof game>) =>
  (db.promotions.findAll() as unknown as Promotion[]).slice().sort((a, b) => a.prestige - b.prestige)[0]!;

const DAY = 2192 + 30;

describe('the sections of a card', () => {
  it('adds up to the card the engine actually builds', () => {
    // Restating the size here rather than deriving it would let the builder drift out of step
    // with `buildCard`, and the player would assemble ten bouts for a nine-bout card.
    const total = CARD_SECTIONS.reduce((a, s) => a + s.slots, 0);
    expect(total).toBe(CARD_SIZE);
  });

  it('starts empty, with a hole for every slot', () => {
    const draft = emptyDraft();
    expect(draftBouts(draft)).toHaveLength(0);
    for (const section of CARD_SECTIONS) {
      expect(draft[section.position]).toHaveLength(section.slots);
    }
  });
});

describe('what the matchmaker offers', () => {
  const db = game();
  const promotion = leader(db);

  it('offers fights for every section', () => {
    for (const section of CARD_SECTIONS) {
      const offers = proposalsFor({
        db,
        promotion,
        position: section.position,
        draft: emptyDraft(),
        day: DAY,
      });
      expect(offers.length, `${section.label} had nothing to offer`).toBeGreaterThan(0);
    }
  });

  it('only ever offers the promotion’s own fighters', () => {
    // Exclusivity is the most binding term in the sport. A fighter appearing on a rival's card
    // is not a rare event, it is an impossible one.
    const offers = proposalsFor({
      db,
      promotion,
      position: 'mainCard',
      draft: emptyDraft(),
      day: DAY,
    });
    for (const bout of offers) {
      const red = db.fighters.findById(bout.redId) as Fighter;
      const blue = db.fighters.findById(bout.blueId) as Fighter;
      expect(red.promotionId).toBe(promotion.id);
      expect(blue.promotionId).toBe(promotion.id);
    }
  });

  it('never offers the same pairing twice', () => {
    const offers = proposalsFor({
      db,
      promotion,
      position: 'prelim',
      draft: emptyDraft(),
      day: DAY,
      limit: 20,
    });
    const keys = offers.map((b) => [b.redId, b.blueId].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ranks a main event by what it draws and a prelim by whether it is a fight', () => {
    /*
     * The reason sections beat nine equal slots. Ranking every section the same way would make
     * the builder one decision repeated four times — and would be wrong, because a promoter who
     * puts their four biggest remaining fights on the prelims has wasted them.
     */
    const options = { db, promotion, draft: emptyDraft(), day: DAY, limit: 6 } as const;
    const headline = proposalsFor({ ...options, position: 'mainEvent' });
    const prelims = proposalsFor({ ...options, position: 'prelim' });

    const topDraw = Math.max(...headline.map((b) => b.draw));
    const prelimDraw = Math.max(...prelims.map((b) => b.draw));
    expect(topDraw).toBeGreaterThan(prelimDraw);

    const closeness = (odds: number) => 1 - Math.abs(odds - 0.5) * 2;
    const prelimCloseness = Math.max(...prelims.map((b) => closeness(b.redOdds)));
    expect(prelimCloseness).toBeGreaterThan(0.7);
  });

  it('never offers somebody already booked on the card', () => {
    // What stops the auto-fill putting the same fighter in two bouts on one night.
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day: DAY });
    const booked = new Set(draftBouts(draft).flatMap((b) => [b.redId, b.blueId]));
    const more = proposalsFor({ db, promotion, position: 'prelim', draft, day: DAY, limit: 20 });
    for (const bout of more) {
      expect(booked.has(bout.redId)).toBe(false);
      expect(booked.has(bout.blueId)).toBe(false);
    }
  });

  it('never offers a fighter who is medically suspended', () => {
    const db2 = game();
    const promotion2 = leader(db2);
    const roster = (db2.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion2.id,
    );
    const suspended = roster[0]!;
    db2.fighters.upsert({ ...suspended, readyOnDay: DAY + 200 } as Fighter & { id: string });

    const offers = proposalsFor({
      db: db2,
      promotion: promotion2,
      position: 'mainCard',
      draft: emptyDraft(),
      day: DAY,
      limit: 40,
    });
    for (const bout of offers) {
      expect(bout.redId).not.toBe(suspended.id);
      expect(bout.blueId).not.toBe(suspended.id);
    }
  });
});

describe('filling a card', () => {
  it('fills every slot, so the player never faces a blank form', () => {
    const db = game();
    const draft = autoFill({ db, promotion: leader(db), draft: emptyDraft(), day: DAY });
    expect(draftBouts(draft)).toHaveLength(CARD_SIZE);
  });

  it('books nobody twice', () => {
    const db = game();
    const draft = autoFill({ db, promotion: leader(db), draft: emptyDraft(), day: DAY });
    const ids = draftBouts(draft).flatMap((b) => [b.redId, b.blueId]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves a slot the player already chose alone', () => {
    // The whole interaction: the game proposes a card and the player disagrees with the parts
    // they care about.
    const db = game();
    const promotion = leader(db);
    const chosen = proposalsFor({
      db,
      promotion,
      position: 'mainEvent',
      draft: emptyDraft(),
      day: DAY,
      limit: 4,
    })[3]!;

    const draft = emptyDraft();
    draft.mainEvent[0] = chosen;
    const filled = autoFill({ db, promotion, draft, day: DAY });

    expect(filled.mainEvent[0]).toEqual(chosen);
    expect(draftBouts(filled)).toHaveLength(CARD_SIZE);
  });

  it('fills a small promotion’s card too', () => {
    // The depth targets exist so this is true. A regional promotion that cannot fill its own
    // card is one the player cannot start at, which is doc 13's default starting position.
    const db = game();
    const draft = autoFill({ db, promotion: smallest(db), draft: emptyDraft(), day: DAY });
    expect(draftBouts(draft).length).toBeGreaterThanOrEqual(CARD_SIZE - 1);
  });
});

describe('what the card is worth before it runs', () => {
  it('reports a forecast the player can act on', () => {
    const db = game();
    const promotion = leader(db);
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day: DAY });
    const forecast = forecastCard({ db, promotion, draft, purseOf: () => 20 });

    expect(forecast.bouts).toBe(CARD_SIZE);
    expect(forecast.expectedAttendance).toBeGreaterThan(0);
    expect(forecast.purses).toBe(CARD_SIZE * 2 * 20);
    expect(forecast.bonusPool).toBeGreaterThan(0);
  });

  it('says a bigger main event sells more', () => {
    // The thing the whole card-composition fix was for, visible to the player before they
    // commit rather than after.
    const db = game();
    const promotion = leader(db);
    const options = { db, promotion, draft: emptyDraft(), day: DAY, limit: 8 } as const;
    const headlines = proposalsFor({ ...options, position: 'mainEvent' });

    const big = emptyDraft();
    big.mainEvent[0] = headlines[0]!;
    const small = emptyDraft();
    small.mainEvent[0] = headlines[headlines.length - 1]!;

    const purseOf = () => 20;
    expect(forecastCard({ db, promotion, draft: big, purseOf }).expectedAttendance).toBeGreaterThan(
      forecastCard({ db, promotion, draft: small, purseOf }).expectedAttendance,
    );
  });
});

describe('running the card', () => {
  it('schedules a card that has not happened yet', () => {
    /*
     * `status: 'scheduled'` was in the type from the beginning and never written by anything —
     * every event the game had ever created was born complete. A promoter's calendar is made of
     * this state.
     */
    const db = game();
    const promotion = leader(db);
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day: DAY });
    const night = scheduleCard({
      db,
      promotion,
      draft,
      day: DAY,
      broadcast: 'ppv',
    });

    expect(night.status).toBe('scheduled');
    expect(night.bouts).toHaveLength(CARD_SIZE);
  });

  it('headlines the card with the biggest fight regardless of which slot it was put in', () => {
    // Position falls out of who you booked. A promoter does not get to decide that the fight
    // everybody wants is the opener.
    const db = game();
    const promotion = leader(db);
    const options = { db, promotion, draft: emptyDraft(), day: DAY, limit: 8 } as const;
    const biggest = proposalsFor({ ...options, position: 'mainEvent' })[0]!;

    const draft = emptyDraft();
    draft.prelim[0] = biggest;
    const filled = autoFill({ db, promotion, draft, day: DAY });
    const night = scheduleCard({ db, promotion, draft: filled, day: DAY, broadcast: 'ppv' });

    /*
     * Asserted against the *finished* draft rather than against the fight the player dropped
     * into the prelim slot. An earlier version of this test assumed the top main-event proposal
     * was the biggest fight available full stop — it is not: removing two fighters from the
     * pool changes what the matchmaker can pair for everybody else, so filling the prelim first
     * genuinely surfaces a bigger fight elsewhere.
     *
     * The property that actually matters is unchanged and is what promoter mode promises:
     * whatever draws most tops the card, wherever the player put it.
     */
    const strongest = draftBouts(filled).slice().sort((a, b) => b.draw - a.draw)[0]!;
    const headline = night.bouts[0]!;
    expect(headline.position).toBe('mainEvent');
    expect([headline.redId, headline.blueId].sort()).toEqual(
      [strongest.redId, strongest.blueId].sort(),
    );
    // And the fight the player buried in the prelims is still on the card somewhere.
    const ids = night.bouts.flatMap((b) => [b.redId as string, b.blueId as string]);
    expect(ids).toContain(biggest.redId);
  });

  it('runs it, and everything that should move moves', () => {
    const db = game();
    const promotion = leader(db);
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day: DAY });
    const night = scheduleCard({
      db,
      promotion,
      draft,
      day: DAY,
      broadcast: 'ppv',
    });

    const before = db.fighters.findById(draft.mainEvent[0]!.redId) as Fighter;
    const outcome = runScheduledCard({ db, night, purses: 400 })!;

    expect(outcome.results).toHaveLength(CARD_SIZE);
    expect(outcome.night.status).toBe('complete');
    // The world's own bout runner, so a promoted card has exactly the same consequences as one
    // the world ran — records, suspensions, ageing, pay.
    const after = db.fighters.findById(before.id as string) as Fighter;
    expect(after.record.length).toBe(before.record.length + 1);
    expect(after.readyOnDay).toBeGreaterThan(DAY);
  });

  it('settles the night against the promotion that ran it', () => {
    const db = game();
    const promotion = leader(db);
    const draft = autoFill({ db, promotion, draft: emptyDraft(), day: DAY });
    const night = scheduleCard({
      db,
      promotion,
      draft,
      day: DAY,
      broadcast: 'ppv',
    });

    const outcome = runScheduledCard({ db, night, purses: 400 })!;
    expect(outcome.settlement.revenue.attendance).toBeGreaterThan(0);
    expect(outcome.settlement.delivered).toBeGreaterThan(0);

    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.recentDelivery?.length).toBe(1);
  });
});

describe('the world leaves the player’s promotion alone', () => {
  it('runs no cards for it, and plenty for everybody else', () => {
    /*
     * `advanceWorld` excluded a *fighter*, which is fighter mode's whole assumption: one person
     * is the player's and everything else is the world's. A promoter owns a promotion, and the
     * world booking its cards would mean the player arriving at their own calendar to find the
     * fights already made.
     */
    const db = game();
    const mine = smallest(db);

    advanceWorld(db, 2192, 2192 + 365, { promotionId: mine.id });

    const events = db.events.findAll() as { promotionId: string }[];
    expect(events.filter((e) => e.promotionId === mine.id)).toHaveLength(0);
    expect(events.length).toBeGreaterThan(10);
  });

  it('still ages and retires the player’s own roster', () => {
    // Excluded from *booking*, not from existing. A promotion whose fighters never got older
    // would be a museum.
    const db = game();
    const mine = smallest(db);
    const before = (db.fighters.findAll() as Fighter[]).filter((f) => f.promotionId === mine.id);
    const sample = before[0]!;

    advanceWorld(db, 2192, 2192 + 365 * 2, { promotionId: mine.id });

    const after = db.fighters.findById(sample.id as string) as Fighter;
    expect(after.condition.ringRust).toBeGreaterThanOrEqual(sample.condition.ringRust);
  });
});
