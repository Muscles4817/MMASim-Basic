/**
 * The promoter's hand on the belts. Doc 34 B6.
 *
 * Stripping a champion as a decision with a price, and champion-against-champion bouts across a
 * division, with a double champion keeping the belt they won.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  championshipId,
  crown,
  currentReign,
  divisionsFor,
  relationshipWith,
  type Championship,
  type DivisionId,
  type Fighter,
  type NewsItem,
  type Promotion,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { stripChampion, strippingReaction } from '../../packages/app/src/game/belts';
import {
  createPlan,
  placeBout,
  planById,
  promoterContext,
  savePlan,
  titleOptionsFor,
} from '../../packages/app/src/game/plans';

function promoter() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return { db, promotion, day: getWorld(db).day };
}

const fighter = (db: ReturnType<typeof promoter>['db'], id: string) =>
  db.fighters.findById(id) as Fighter;

/** Two of this promotion's champions in neighbouring divisions, heavier one first. */
function neighbouringChampions(promotion: Promotion) {
  const order = divisionsFor('male').map((d) => d.id as string);
  for (let i = order.length - 1; i > 0; i--) {
    const heavy = promotion.champions[order[i] as never];
    const light = promotion.champions[order[i - 1] as never];
    if (heavy && light) {
      return {
        heavyDiv: order[i] as DivisionId,
        heavy: heavy as string,
        lightDiv: order[i - 1] as DivisionId,
        light: light as string,
      };
    }
  }
  throw new Error('no neighbouring champions in the fixture');
}

describe('stripping a champion', () => {
  it('reads as overdue for an absent champion and as politics for an active star', () => {
    const { db, promotion, day } = promoter();
    const [, id] = Object.entries(promotion.champions).find(([, c]) => c)!;
    const champion = fighter(db, id as string);

    const absent = strippingReaction(
      { ...champion, record: [{ ...champion.record[0]!, day: day - 500 } as never] },
      day,
    );
    expect(absent.justified).toBe(true);
    expect(absent.buzzDelta).toBeGreaterThanOrEqual(-1);

    const active = strippingReaction(
      { ...champion, starPower: 80, record: [{ ...champion.record[0]!, day: day - 60 } as never] },
      day,
    );
    expect(active.justified).toBe(false);
    expect(active.buzzDelta).toBeLessThan(-1);
  });

  it('vacates the belt, is remembered, costs the buzz it said, and takes the title off their booked defence', () => {
    const { db, promotion, day } = promoter();
    const [division, champ] = Object.entries(promotion.champions).find(([, c]) => c)!;
    const divisionId = division as DivisionId;
    const championId = champ as string;
    const champion = fighter(db, championId);
    const challenger = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.divisionId === divisionId && f.id !== champion.id && f.promotionId === promotion.id,
    )!;
    const plan = createPlan({ db, promotion, day: day + 60 });
    const main = plan.slots.find((s) => s.position === 'mainEvent')!;
    savePlan(
      db,
      placeBout({
        plan,
        slotId: main.id,
        redId: champion.id as string,
        blueId: challenger.id as string,
        divisionId,
        titleKind: 'undisputed',
      }),
    );

    const expected = strippingReaction(champion, day);
    const done = stripChampion(db, divisionId)!;
    expect(done.buzzDelta).toBe(expected.buzzDelta);

    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.champions[divisionId]).toBeUndefined();
    expect(after.buzz).toBe(Math.max(1, promotion.buzz + expected.buzzDelta));

    const title = db.championships.findById(championshipId(promotion.id, divisionId)) as
      Championship | undefined;
    if (title) {
      expect(title.vacancy?.reason).toBe('stripped');
      expect(currentReign(title)).toBeUndefined();
    }

    const stripped = fighter(db, championId);
    expect(stripped.ledger?.slice(-1)[0]?.kind).toBe('stripped');
    expect(relationshipWith(stripped, promotion.id, day).score).toBeLessThan(0);

    const news = db.news.findAll() as NewsItem[];
    expect(news.some((n) => /strips/.test(n.headline))).toBe(true);

    const bout = planById(db, plan.id)!.slots.find((s) => s.id === main.id)!.bout!;
    expect(bout.titleKind).toBeUndefined();

    // Nobody left to strip.
    expect(stripChampion(db, divisionId)).toBeUndefined();
  });
});

describe('champion against champion', () => {
  it('can be for the red corner’s belt, a division apart, and not further', () => {
    const { db, promotion, day } = promoter();
    const pair = neighbouringChampions(promotion);
    const ctx = promoterContext({ db, promotion, day });
    const plan = createPlan({ db, promotion, day: day + 60 });
    const heavy = fighter(db, pair.heavy);
    const light = fighter(db, pair.light);

    const options = titleOptionsFor({ ctx, red: heavy, blue: light, plan });
    const undisputed = options.find((o) => o.kind === 'undisputed')!;
    expect(undisputed.available).toBe(true);
    expect(undisputed.label).toMatch(/Champion vs champion/);

    // A contender from the next division up is a superfight, bookable but not for a belt.
    const contender = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.divisionId === pair.lightDiv && f.id !== light.id && f.promotionId === promotion.id,
    )!;
    expect(
      titleOptionsFor({ ctx, red: heavy, blue: contender, plan }).find(
        (o) => o.kind === 'undisputed',
      )!.available,
    ).toBe(false);
  });

  it('leaves a double champion holding the belt they won, while they keep contesting it', () => {
    const { db, promotion, day } = promoter();
    const pair = neighbouringChampions(promotion);

    // The lighter champion has just beaten the heavier one for their belt.
    db.promotions.upsert({
      ...promotion,
      champions: { ...promotion.champions, [pair.heavyDiv]: pair.light },
    } as never);
    const title = db.championships.findById(championshipId(promotion.id, pair.heavyDiv)) as
      Championship | undefined;
    expect(title, 'the lineage is what the double champion keeps the belt by').toBeDefined();
    if (title) {
      db.championships.upsert(
        crown({ title, fighterId: pair.light as never, day: day as never }) as never,
      );
    }

    advanceTo(db, day + 10);
    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.champions[pair.heavyDiv]).toBe(pair.light);
    expect(after.champions[pair.lightDiv]).toBe(pair.light);
  });
});
