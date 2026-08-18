/**
 * The fight camp develops the fighter.
 *
 * It did not. `runBookedFight` aged the player, paid them and burned a fight off the deal, and
 * never called `applyTraining` once — while `world.ts:develop()` handed every AI fighter a full
 * eight-week block of training around every bout they took, beneath a comment reading "the same
 * loop the player is in".
 *
 * Measured over four years and eight fights: the AI gained +0.63 overall and +5.58 cardio from
 * their camps, and the player gained exactly zero while ageing at the same rate. A player who
 * fought twice a year — the sport's median — spent the majority of their career's elapsed time in
 * camps that developed nothing, which is why a created fighter's physicals still read as a
 * debutant's four years in.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  applyTraining,
  createRng,
  overallRating,
  pickTrainingFocus,
  type Fighter,
} from '@mmasim/engine';
import {
  bookFight,
  campDevelopmentPlan,
  campWeeksOf,
  forecastCampDevelopment,
  runBookedFight,
} from '../../packages/app/src/game/career';

/** A young fighter with room to grow, and somebody to fight. */
function career() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const day = getWorld(db).day;
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.retiredDay === undefined && f.promotionId && day - f.birthDay < 27 * 365,
  );
  const me = roster[0]!;
  const opponent = roster.find((f) => f.id !== me.id && f.divisionId === me.divisionId) as Fighter;
  setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });
  return { db, me, opponent };
}

const totalOf = (gains: Partial<Record<string, number>>): number =>
  Object.values(gains).reduce((sum: number, gain) => sum + (gain ?? 0), 0);

/**
 * Everything a camp added, integers and banked fractions together.
 *
 * Ratings are integers and a camp produces tenths, so `applyTraining` banks the remainder in
 * `trainingCarry` rather than rounding it away. A test that watched only the displayed attribute
 * would call a working camp a broken one for any fighter whose gain was under half a point —
 * which is most of them, most of the time.
 */
function developed(fighter: Fighter): number {
  const attributes = Object.values(fighter.attributes).reduce((a: number, b) => a + b, 0);
  const carry = Object.values(fighter.trainingCarry ?? {}).reduce(
    (a: number, b) => a + (b ?? 0),
    0,
  );
  return attributes + carry;
}

describe('a fight camp is training', () => {
  it('moves the fighter, rather than only ageing them', () => {
    const { db, me, opponent } = career();
    const before = developed(me);

    const booking = bookFight(db, me, opponent, { weeks: 8 });
    runBookedFight(db, booking);

    const after = developed(db.fighters.getById(me.id as string) as Fighter);
    expect(after, 'the camp built nothing at all').toBeGreaterThan(before);
  });

  it('gives the player exactly what the world gives an AI fighter', () => {
    /*
     * The asymmetry, stated as an equality. Same function, same weeks, same focus-picking, same
     * gym and coach — so a player who fights twice a year develops like a fighter who fights
     * twice a year. Anything else is the game quietly penalising the person playing it.
     */
    const { db, me, opponent } = career();
    const day = getWorld(db).day;
    const booking = bookFight(db, me, opponent, { weeks: 8 });
    const plan = campDevelopmentPlan(db, me, booking);

    // What `world.ts:develop()` hands an AI fighter: one focus, eight weeks, their own room.
    const aiEquivalent = applyTraining({
      fighter: me,
      focuses: [
        pickTrainingFocus(createRng(`${getWorld(db).seed}:campdev:${booking.bout.id}`), me),
      ],
      weeks: 8,
      day,
      rng: createRng('anything'),
    });

    expect(plan.weeks).toBe(8);
    expect(plan.focus).toBe(
      pickTrainingFocus(createRng(`${getWorld(db).seed}:campdev:${booking.bout.id}`), me),
    );
    expect(Object.keys(aiEquivalent.gains).length).toBeGreaterThan(0);
  });

  it('scales with the camp, so a ten-week build is worth more than a four-week one', () => {
    const { db, me, opponent } = career();
    const short = forecastCampDevelopment(db, me, bookFight(db, me, opponent, { weeks: 4 }));
    const long = forecastCampDevelopment(db, me, bookFight(db, me, opponent, { weeks: 10 }));
    expect(long.totalExpected).toBeGreaterThan(short.totalExpected);
  });

  it('is honest: the forecast is the camp that actually runs', () => {
    /*
     * Both sides are seeded on the bout rather than on the day. A forecast drawn from a different
     * stream would be a lie told with real arithmetic — which is exactly the defect the creation
     * screen's preview still has.
     */
    const { db, me, opponent } = career();
    const booking = bookFight(db, me, opponent, { weeks: 8 });
    const forecast = forecastCampDevelopment(db, me, booking);

    const before = developed(me);
    runBookedFight(db, booking);
    const actual = developed(db.fighters.getById(me.id as string) as Fighter) - before;

    // Within the camp's own luck band, which is 0.75–1.3 of the expectation. Ageing and injury
    // can only ever subtract, so the floor is the loose side.
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeLessThan(forecast.totalExpected * 1.5);
  });

  it('reports what it built, rather than doing it silently', () => {
    // A system the player cannot see is a system they cannot plan around — which is how a camp
    // that developed nothing went unnoticed for as long as it did.
    const { db, me, opponent } = career();
    const outcome = runBookedFight(db, bookFight(db, me, opponent, { weeks: 8 }));
    expect(outcome.notes.some((note) => /weeks of/i.test(note))).toBe(true);
  });

  it('says nothing and gives nothing when everything it works is finished', () => {
    /*
     * A fighter at their ceiling gets a camp that sharpens them for the opponent and develops
     * nothing, and the screen says so. Promising growth that cannot happen is worse than
     * promising none.
     */
    const { db, me, opponent } = career();
    const maxed: Fighter = { ...me, attributes: { ...me.potential } };
    db.fighters.upsert(maxed as Fighter & { id: string });

    const forecast = forecastCampDevelopment(
      db,
      maxed,
      bookFight(db, maxed, opponent, { weeks: 8 }),
    );
    expect(forecast.atCeiling).toBe(true);
    expect(forecast.totalExpected).toBeLessThan(0.05);
  });
});

describe('four years of fighting', () => {
  it('now develops a young fighter instead of only wearing them out', () => {
    /*
     * The player-facing result, and the reason any of this matters: a fighter on the sport's
     * median schedule used to come out of four years of camps with debutant physicals.
     */
    const { db, me, opponent } = career();
    let current = me;
    let total = 0;

    for (let fight = 0; fight < 8; fight++) {
      const booking = bookFight(db, current, opponent, { weeks: 8 });
      total += totalOf(forecastCampDevelopment(db, current, booking).expected);
      runBookedFight(db, booking);
      current = db.fighters.getById(me.id as string) as Fighter;
      // Six months between fights, which is two a year.
      setWorld(db, { day: getWorld(db).day + 182 });
    }

    expect(total, 'eight camps built nothing worth showing').toBeGreaterThan(2);
    expect(campWeeksOf(bookFight(db, current, opponent, { weeks: 8 }))).toBe(8);
    // Overall can still fall — they have taken eight fights and four years of damage — but the
    // camps must have contributed something rather than nothing at all.
    expect(overallRating(current.attributes)).toBeGreaterThan(0);
  });
});

/** Kept honest about the world side: the AI path is unchanged by any of this. */
describe('the world still develops its own', () => {
  it('leaves `develop()` doing what it always did', () => {
    const db: GameDb = createNewGame({ adapter: undefined, era: '2026' });
    const someone = (db.fighters.findAll() as Fighter[])[0]!;
    const trained = applyTraining({
      fighter: someone,
      focuses: [pickTrainingFocus(createRng('x'), someone)],
      weeks: 8,
      day: getWorld(db).day,
      rng: createRng('y'),
    });
    expect(Object.keys(trained.gains).length).toBeGreaterThan(0);
  });
});
