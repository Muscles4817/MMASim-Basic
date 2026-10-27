/**
 * What a card is called.
 *
 * A card's name is derived, not stored: the promotion's short name and the card's number, then the
 * main event once both corners sign — `GCFC 12`, `GCFC 12: Reyes vs Hill`. That makes it cheap to
 * get right and easy to get wrong in ways nothing else would catch, because every one of these
 * properties is a promise a player can see break: two cards with one number, a card that renames
 * itself after it ran, a headline for a fight nobody agreed to.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import { withSlot, type EventPlan, type Fighter, type Promotion } from '@mmasim/engine';
import {
  cancelPlan,
  createPlan,
  planById,
  planName,
  runPlan,
  savePlan,
} from '../../packages/app/src/game/plans';
import { headlineNames, nextEventNumber } from '../../packages/app/src/game/world';
import { agreed, filledPlan } from '../helpers/plans';

function setup() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const [promotion, other] = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige);
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion!.id as string });
  return { db, promotion: promotion!, other: other!, today: getWorld(db).day };
}

const fresh = (db: GameDb, plan: EventPlan): EventPlan => planById(db, plan.id)!;

/** A stored night, which is all `nextEventNumber` counts. */
const storeNight = (db: GameDb, promotion: Promotion, day: number, key: string) =>
  db.events.upsert({
    id: `night_${key}`,
    promotionId: promotion.id,
    day,
    name: `${promotion.shortName} test night`,
  } as never);

/** The main event's surnames, as the card is billed. */
const mainEventOf = (db: GameDb, plan: EventPlan): string => {
  const bout = plan.slots.find((s) => s.position === 'mainEvent')!.bout!;
  const [red, blue] = [bout.redId, bout.blueId].map(
    (id) => db.fighters.findById(id as string) as Fighter,
  );
  return `${red!.lastName} vs ${blue!.lastName}`;
};

describe('a card’s number', () => {
  it('follows the calendar, not the order the cards were created in', () => {
    const { db, promotion, today } = setup();
    const base = nextEventNumber(db, promotion);
    const later = createPlan({ db, promotion, day: today + 60 });
    const sooner = createPlan({ db, promotion, day: today + 30 });

    expect(planName(db, sooner)).toBe(`${promotion.shortName} ${base}`);
    expect(planName(db, later)).toBe(`${promotion.shortName} ${base + 1}`);
  });

  it('moves the later cards down when an earlier one is cancelled, and the cancelled one keeps its name', () => {
    const { db, promotion, today } = setup();
    const base = nextEventNumber(db, promotion);
    const first = createPlan({ db, promotion, day: today + 30 });
    const second = createPlan({ db, promotion, day: today + 60 });
    const firstName = planName(db, first);

    cancelPlan(db, first.id);

    expect(planName(db, fresh(db, second))).toBe(`${promotion.shortName} ${base}`);
    // Derived afterwards it would collide with the live card it just made room for.
    expect(planName(db, fresh(db, first))).toBe(firstName);
  });

  it('is fixed for good once the card has run', () => {
    const { db, promotion, today } = setup();
    const base = nextEventNumber(db, promotion);
    const ran = agreed(db, filledPlan({ db, promotion, day: today + 21, today }));
    const next = createPlan({ db, promotion, day: today + 50 });
    const nextName = planName(db, next);

    runPlan({ db, plan: ran });
    const name = planName(db, fresh(db, ran));
    expect(name.startsWith(`${promotion.shortName} ${base}: `)).toBe(true);
    // The card after it was already the next number, and running this one does not move it.
    expect(planName(db, fresh(db, next))).toBe(nextName);

    // Nothing that happens afterwards renames it: more nights, more cards, a cancellation.
    storeNight(db, promotion, today + 30, 'after');
    const another = createPlan({ db, promotion, day: today + 25 });
    cancelPlan(db, next.id);
    cancelPlan(db, another.id);
    expect(planName(db, fresh(db, ran))).toBe(name);
  });
});

describe('a card’s headline', () => {
  it('appears only once both corners of the main event have signed', () => {
    const { db, promotion, today } = setup();
    const pencilled = filledPlan({ db, promotion, day: today + 40, today });
    const number = `${promotion.shortName} ${nextEventNumber(db, promotion)}`;
    expect(planName(db, pencilled)).toBe(number);

    const main = pencilled.slots.find((s) => s.position === 'mainEvent')!;
    const offered = savePlan(
      db,
      withSlot(pencilled, main.id, { ...main.bout!, status: 'offered' }),
    );
    expect(planName(db, offered)).toBe(number);

    const signed = savePlan(db, withSlot(offered, main.id, { ...main.bout!, status: 'agreed' }));
    expect(planName(db, signed)).toBe(`${number}: ${mainEventOf(db, signed)}`);
    expect(headlineNames(db, main.bout)?.join(' vs ')).toBe(mainEventOf(db, signed));
  });

  it('goes after a title the promoter typed, which takes the number’s place', () => {
    const { db, promotion, today } = setup();
    const titled = createPlan({ db, promotion, day: today + 40, name: '  Summer Slam ' });
    expect(planName(db, titled)).toBe('Summer Slam');

    const signed = agreed(db, {
      ...filledPlan({ db, promotion, day: today + 40, today }),
      name: 'Summer Slam',
    });
    expect(planName(db, signed)).toBe(`Summer Slam: ${mainEventOf(db, signed)}`);
  });
});

describe('the promotion’s numbering', () => {
  it('goes up by one for each night it stages, and not for anybody else’s', () => {
    const { db, promotion, other, today } = setup();
    const base = nextEventNumber(db, promotion);
    const theirs = nextEventNumber(db, other);

    storeNight(db, promotion, today, 'mine');
    expect(nextEventNumber(db, promotion)).toBe(base + 1);
    expect(nextEventNumber(db, other)).toBe(theirs);

    storeNight(db, other, today, 'theirs');
    expect(nextEventNumber(db, promotion)).toBe(base + 1);
    expect(nextEventNumber(db, other)).toBe(theirs + 1);
  });
});
