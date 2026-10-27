/**
 * Who a promoter answers to (doc 34 B2).
 *
 * Doc 13's failure state: a promotion does not go bankrupt the way a shop does. It loses its
 * television deal, and then it gets bought, or it shrinks. A promoter is not the owner either.
 * The owner sets three objectives a year, and at zero confidence the promoter is out and takes a
 * job somewhere smaller. These pin the wiring: the deal and the owner arrive with the job, a card
 * is rated, years end, a promoter can be fired and hired, and a promotion with no money is bought.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld, type Entity, type GameDb } from '@mmasim/data';
import {
  CONFIDENCE_FOR_LOST_DEAL,
  REVIEW_CARDS,
  STREAMING_SHARE,
  type Fighter,
  type InboxItem,
  type Promotion,
} from '@mmasim/engine';
import {
  boardroom,
  buyOutTheBroke,
  jobOffers,
  rateCard,
  tickBoardroom,
} from '../../packages/app/src/game/boardroom';
import { advanceTo } from '../../packages/app/src/game/clock';
import { readInbox, resolveItem } from '../../packages/app/src/game/inbox';
import { createPlan, plansFor } from '../../packages/app/src/game/plans';
import { runOneCard, takeTopRegional } from '../helpers/autopilot';

const promotionOf = (db: GameDb, id: string) => db.promotions.findById(id) as unknown as Promotion;
const save = (db: GameDb, promotion: Promotion) =>
  db.promotions.upsert(promotion as Promotion & Entity);

function promoterGame(): { db: GameDb; id: string } {
  const db = createNewGame({ adapter: undefined, era: '2026', seed: 'boardroom' });
  const id = takeTopRegional(db).id as string;
  tickBoardroom(db, getWorld(db).day);
  return { db, id };
}

describe('the job comes with a broadcaster and an owner', () => {
  const { db, id } = promoterGame();

  it('opens both for the player, and leaves the rest of the sport alone', () => {
    const promotion = promotionOf(db, id);
    expect(promotion.rightsDeal?.feePerCard).toBeGreaterThan(0);
    expect(promotion.owner?.objectives).toHaveLength(3);
    const others = (db.promotions.findAll() as unknown as Promotion[]).filter((p) => p.id !== id);
    expect(others.every((p) => p.rightsDeal === undefined && p.owner === undefined)).toBe(true);
  });

  it('shows the objectives and the deal on the dashboard', () => {
    const board = boardroom(db, promotionOf(db, id), getWorld(db).day)!;
    expect(board.owner.objectives).toHaveLength(3);
    expect(board.deal.health).toBe('healthy');
    expect(board.deal.cardsThisYear).toBe(0);
  });

  it('rates a card the player runs, and counts it towards the deal year', () => {
    const before = promotionOf(db, id).rightsDeal!.satisfaction;
    runOneCard({ db, promotionId: id, policy: 'sloppy' });
    const after = promotionOf(db, id).rightsDeal!;
    expect(after.satisfaction).not.toBe(before);
    expect(boardroom(db, promotionOf(db, id), getWorld(db).day)!.deal.cardsThisYear).toBe(1);
  });
});

describe('a broadcaster that stops watching', () => {
  const { db, id } = promoterGame();

  it('reviews the deal, drops it to streaming, and the owner hears about it', () => {
    const start = promotionOf(db, id);
    const confidence = start.owner!.confidence;
    const fee = start.rightsDeal!.feePerCard;
    save(db, { ...start, rightsDeal: { ...start.rightsDeal!, satisfaction: 41 } });

    const day = getWorld(db).day;
    const news = [];
    for (let i = 0; i <= REVIEW_CARDS + 1; i++) {
      news.push(...rateCard(db, { promotionId: id, day, headlineDraw: 0, bouts: 2, titles: 0 }));
    }

    const after = promotionOf(db, id);
    expect(after.rightsDeal!.streamingOnly).toBe(true);
    expect(after.rightsDeal!.feePerCard).toBeCloseTo(fee * STREAMING_SHARE, 0);
    expect(after.owner!.confidence).toBe(confidence - CONFIDENCE_FOR_LOST_DEAL);
    expect(news.some((n) => n.kind === 'business')).toBe(true);
    const titles = readInbox(db).map((i) => i.title);
    expect(titles.some((t) => t.includes('under review'))).toBe(true);
    expect(titles.some((t) => t.includes('streaming'))).toBe(true);
  });
});

describe('the end of a year', () => {
  const { db, id } = promoterGame();

  it('renews the deal and gives the owner’s verdict, with next year’s objectives', () => {
    const day = getWorld(db).day;
    const promotion = promotionOf(db, id);
    save(db, {
      ...promotion,
      rightsDeal: { ...promotion.rightsDeal!, startedDay: (day - 366) as never },
      owner: { ...promotion.owner!, yearStartDay: (day - 366) as never },
    });
    tickBoardroom(db, day);

    const after = promotionOf(db, id);
    expect(after.rightsDeal!.startedDay).toBe(day - 1);
    expect(after.owner!.yearStartDay).toBe(day - 1);
    // Nothing ran in that year, so the schedule objective, at least, was missed.
    expect(after.owner!.confidence).toBeLessThan(promotion.owner!.confidence);
    const titles = readInbox(db).map((i) => i.title);
    expect(titles.some((t) => t.includes('verdict on the year'))).toBe(true);
    expect(titles.some((t) => t.includes('renew'))).toBe(true);
  });
});

describe('fired, and hired somewhere smaller', () => {
  const { db, id } = promoterGame();
  const before = promotionOf(db, id);
  createPlan({ db, promotion: before, day: getWorld(db).day + 60 });

  it('lets the promoter go at zero confidence, with offers from promotions below', () => {
    save(db, { ...before, owner: { ...before.owner!, confidence: 0 } });
    tickBoardroom(db, getWorld(db).day);

    const letter = readInbox(db).find((i) => i.title.includes('let you go')) as InboxItem;
    expect(letter.priority).toBe('decision');
    expect(letter.actions!.length).toBeGreaterThan(0);
    for (const offer of jobOffers(db, id)) expect(offer.prestige).toBeLessThan(before.prestige);
  });

  it('moves the save to the job taken, and calls off the old cards', () => {
    const letter = readInbox(db).find((i) => i.title.includes('let you go')) as InboxItem;
    const job = letter.actions![0]!.id;
    resolveItem(db, letter.id, job);
    advanceTo(db, getWorld(db).day + 1);

    const now = getWorld(db).playerPromotionId as string;
    expect(now).toBe(job.slice('job:'.length));
    expect(promotionOf(db, now).owner?.confidence).toBeGreaterThan(0);
    expect(promotionOf(db, now).rightsDeal).toBeDefined();
    expect(promotionOf(db, id).owner).toBeUndefined();
    expect(plansFor(db, id).every((p) => p.status === 'cancelled')).toBe(true);
  });
});

describe('a promotion with no money left is bought', () => {
  const db = createNewGame({ adapter: undefined, era: '2026', seed: 'buyout' });
  setWorld(db, { playerRole: 'promoter' });
  const victim = (db.promotions.findAll() as unknown as Promotion[])
    .filter((p) => p.tier === 'regional')
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  const rosterOf = (pid: string) =>
    (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === pid && f.retiredDay === undefined,
    );
  const before = rosterOf(victim.id as string).map((f) => f.id as string);
  save(db, { ...victim, budget: 0 });
  const news = buyOutTheBroke(db, getWorld(db).day);

  it('sells its best three fighters to pay the debts', () => {
    const after = new Set(rosterOf(victim.id as string).map((f) => f.id as string));
    const gone = before.filter((f) => !after.has(f));
    expect(gone).toHaveLength(3);
    for (const fid of gone) {
      // Sold with the contract: whatever deal they had now names the buyer.
      const fighter = db.fighters.findById(fid) as Fighter;
      if (!fighter.agreementId) continue;
      const agreement = db.agreements.findById(fighter.agreementId as string) as
        { promotionId: string } | undefined;
      expect(agreement?.promotionId).toBe(fighter.promotionId);
    }
  });

  it('carries on, smaller, with money in the bank — and it is news', () => {
    expect(promotionOf(db, victim.id as string).budget).toBeGreaterThan(0);
    expect(news.some((n) => n.kind === 'business' && n.weight === 'major')).toBe(true);
  });
});
