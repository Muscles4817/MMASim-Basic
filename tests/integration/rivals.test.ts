/**
 * Rival promotions with intent, in a running world. Doc 34 B4.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  createRng,
  openingTerms,
  postureOf,
  type Fighter,
  type PromotionalAgreement,
  type Promotion,
} from '@mmasim/engine';
import { createPlan, plansFor } from '../../packages/app/src/game/plans';
import { considerCounterProgramming } from '../../packages/app/src/game/counterProgramming';
import { rivalBidsFor, sign } from '../../packages/app/src/game/contracts';
import { answerPoach, poachChampions } from '../../packages/app/src/game/rivalMoves';
import { runCardBout } from '../../packages/app/src/game/world';

/** The 2026 world, playing as the named promotion. */
function as(shortName: string) {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const mine = promotions.find((p) => p.shortName === shortName)!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: mine.id });
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === mine.id && f.retiredDay === undefined,
  );
  return { db, mine, promotions, roster, day: getWorld(db).day };
}

describe('counter-programming', () => {
  it('has rivals in the same market book against some of your dates, once each, a month out', () => {
    const { db, mine, day } = as('LFA');
    const plans = Array.from({ length: 24 }, (_, i) =>
      createPlan({ db, promotion: mine, day: day + 40 + i * 21 }),
    );
    for (let d = day; d <= day + 40 + 24 * 21; d += 1) considerCounterProgramming(db, d);
    const after = plansFor(db, mine.id as string).filter((p) => plans.some((x) => x.id === p.id));
    expect(after.every((p) => p.rivalsConsidered)).toBe(true);
    const countered = after.filter((p) => p.rivalCard);
    expect(countered.length).toBeGreaterThan(0);
    expect(countered.length).toBeLessThan(after.length);
    for (const p of countered) {
      const rival = db.promotions.findById(p.rivalCard!.promotionId as string) as Promotion;
      expect(rival.baseCountry).toBe(p.country);
      expect(p.rivalCard!.split).toBeGreaterThanOrEqual(0.2);
      expect(p.rivalCard!.split).toBeLessThanOrEqual(0.35);
    }
    // The rival's card is on the calendar for that day.
    const cards = getWorld(db).rivalCards ?? [];
    expect(cards.some((c) => countered.some((p) => p.day === c.day))).toBe(true);
    expect(db.inbox.findAll().some((i) => String(i.id).includes('counter:'))).toBe(true);
  });
});

describe('bids on your stars', () => {
  it('come from rivals by posture, are stable between reads, and only in the window', () => {
    const { db, mine, roster, day } = as('UFC');
    const star = roster.slice().sort((a, b) => b.starPower - a.starPower)[0]!;
    const signed = sign(db, star, mine, openingTerms(star, mine));
    if (!signed.ok) throw new Error(signed.reason);
    expect(rivalBidsFor(db, signed.fighter, mine)).toEqual([]);
    const agreement = db.agreements.findById(
      signed.fighter.agreementId as string,
    ) as PromotionalAgreement;
    db.agreements.upsert({ ...agreement, expiresDay: day + 30 } as never);
    const bids = rivalBidsFor(db, signed.fighter, mine);
    expect(bids.length).toBeGreaterThan(0);
    expect(bids.length).toBeLessThanOrEqual(3);
    expect(rivalBidsFor(db, signed.fighter, mine)).toEqual(bids);
    for (const bid of bids) {
      expect(bid.promotion.id).not.toBe(mine.id);
      expect(bid.promotion.divisions).toContain(star.divisionId);
    }
  });
});

describe('poaching champions', () => {
  it('puts a release-clause offer for your champion in front of you, and taking it moves them', () => {
    const { db, mine, day } = as('UFC');
    const champions = Object.values(mine.champions).filter(Boolean);
    expect(champions.length).toBeGreaterThan(0);
    let item: ReturnType<typeof db.inbox.findAll>[number] | undefined;
    for (let q = 0; q < 200 && !item; q++) {
      poachChampions(db, day + q * 91, createRng(`poach:${q}`), undefined);
      item = db.inbox.findAll().find((i) => String(i.id).includes('poach:'));
    }
    expect(item, 'no rival ever made an offer for a UFC champion').toBeDefined();
    const accept = item!.actions!.find((a) => a.id.startsWith('poach:accept'))!;
    const before = (db.promotions.findById(mine.id as string) as Promotion).budget;
    expect(answerPoach(db, item as never, accept.id)).toBe(true);
    const moved = db.fighters.findById(item!.fighterId as string) as Fighter;
    expect(moved.promotionId).not.toBe(mine.id);
    expect((db.promotions.findById(mine.id as string) as Promotion).budget).toBeGreaterThan(before);
    expect(postureOf(db.promotions.findById(moved.promotionId as string) as Promotion)).toBe(
      'aggressor',
    );
  });
});

describe('the one that got away', () => {
  it('is news when a fighter you cut wins a belt somewhere else', () => {
    const { db, mine, promotions, day } = as('LFA');
    const ufc = promotions.find((p) => p.shortName === 'UFC')!;
    const [divisionId, championId] = Object.entries(ufc.champions).find(([, id]) => id)!;
    const challenger = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.promotionId === ufc.id && f.divisionId === divisionId && f.id !== championId,
    )!;
    db.fighters.upsert({
      ...challenger,
      ledger: [{ day: day - 400, promotionId: mine.id, kind: 'cut' }],
    } as never);

    let headline: string | undefined;
    for (let i = 0; i < 40 && !headline; i++) {
      const current = db.promotions.findById(ufc.id as string) as Promotion;
      const champ = current.champions[divisionId as never];
      if (champ === challenger.id) break;
      const out = runCardBout({
        db,
        day: day + i * 120,
        rng: createRng(`gotaway:${i}`),
        promotion: current,
        bout: {
          boutId: `gotaway:${i}`,
          redId: champ as never,
          blueId: challenger.id,
          divisionId: divisionId as never,
          position: 'mainEvent',
          order: 0,
          rounds: 5,
          isTitleFight: true,
        },
        readyOn: new Map(),
        lastSeen: new Map(),
      });
      headline = out?.news.find((n) => n.headline.startsWith('The fighter you cut'))?.headline;
    }
    expect(headline, 'the challenger never won the belt in forty tries').toBeDefined();
    expect(headline).toMatch(/UFC belt/);
  });
});
