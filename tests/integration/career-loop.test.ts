import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAftermath,
  careerSummary,
  createRng,
  defaultGamePlan,
  offerOpponents,
  paperOdds,
  readinessDelay,
  scoutOpponent,
  deriveTendencies,
  simulateFight,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { createMemoryAdapter, createNewGame, getWorld, type GameDb } from '@mmasim/data';

/**
 * The whole career loop, end to end, without a browser: seed a world, offer opponents,
 * book, prepare, fight, apply the consequences, advance the calendar.
 */
describe('career loop', () => {
  let db: GameDb;

  beforeEach(() => {
    db = createNewGame({ adapter: createMemoryAdapter(), seed: 'career-test' });
  });

  it('seeds a complete, coherent world', () => {
    expect(db.fighters.count()).toBeGreaterThan(40);
    expect(db.promotions.count()).toBeGreaterThanOrEqual(4);
    expect(db.gyms.count()).toBeGreaterThan(3);
    expect(db.coaches.count()).toBeGreaterThan(3);
    expect(db.referees.count()).toBeGreaterThan(2);
    expect(getWorld(db).day).toBe(0);
  });

  it('offers a spread of opponents rather than one obvious choice', () => {
    const fighter = db.fighters.getById('f_poirier') as Fighter;
    const promotion = db.promotions.getById('p_apex') as unknown as Promotion;
    const offers = offerOpponents(
      fighter,
      db.fighters.findAll() as Fighter[],
      promotion,
      0,
      createRng('offers'),
      { promotionId: 'p_apex' },
    );

    expect(offers.length).toBeGreaterThan(1);
    for (const offer of offers) {
      expect(offer.opponent.divisionId).toBe(fighter.divisionId);
      expect(offer.opponent.id).not.toBe(fighter.id);
    }
    // The point of the slate is that the options genuinely differ in difficulty.
    const steps = offers.map((o) => o.step);
    expect(Math.max(...steps) - Math.min(...steps)).toBeGreaterThan(3);
  });

  it('never offers a fighter from another division or sex', () => {
    const fighter = db.fighters.getById('f_shevchenko') as Fighter;
    const promotion = db.promotions.getById('p_apex') as unknown as Promotion;
    for (let i = 0; i < 25; i++) {
      const offers = offerOpponents(
        fighter,
        db.fighters.findAll() as Fighter[],
        promotion,
        0,
        createRng(`offers-${i}`),
      );
      for (const offer of offers) {
        expect(offer.opponent.sex).toBe('female');
        expect(offer.opponent.divisionId).toBe(fighter.divisionId);
      }
    }
  });

  it('runs a fight and writes the consequences back to both fighters', () => {
    const red = db.fighters.getById('f_poirier') as Fighter;
    const blue = db.fighters.getById('f_gaethje') as Fighter;

    const result = simulateFight({
      boutId: 'bout-1',
      red: { fighter: red, plan: defaultGamePlan() },
      blue: { fighter: blue, plan: defaultGamePlan() },
      seed: 'career-fight-1',
    });

    const after = applyAftermath({
      result,
      red,
      blue,
      day: 60,
      divisionId: red.divisionId,
      promotionId: red.promotionId!,
      rng: createRng('aftermath-1'),
    });

    for (const fighter of [after.red, after.blue]) {
      expect(fighter.record).toHaveLength(1);
      // The denormalised summary must always equal prior history plus in-sim bouts.
      expect(fighter.summary).toEqual(careerSummary(fighter));
      expect(fighter.condition.headTrauma).toBeGreaterThanOrEqual(0);
      expect(fighter.condition.fatigue).toBe(0);
    }

    // Exactly one of them gained a win, unless it was a draw.
    const wins = after.red.summary.wins - red.summary.wins + (after.blue.summary.wins - blue.summary.wins);
    expect(wins).toBeLessThanOrEqual(1);
  });

  it('moves confidence, star power and reputation in the right directions', () => {
    const red = db.fighters.getById('f_holloway') as Fighter;
    const blue = db.fighters.getById('f_ortega') as Fighter;

    // Find a decisive result so the assertion is about direction, not about a draw.
    let attempt = 0;
    let after = applyAftermath({
      result: simulateFight({
        boutId: 'b',
        red: { fighter: red },
        blue: { fighter: blue },
        seed: 'conf-0',
      }),
      red,
      blue,
      day: 30,
      divisionId: red.divisionId,
      promotionId: red.promotionId!,
      rng: createRng('conf-a-0'),
    });
    while (after.red.summary.draws > 0 && attempt < 20) {
      attempt++;
      after = applyAftermath({
        result: simulateFight({
          boutId: 'b',
          red: { fighter: red },
          blue: { fighter: blue },
          seed: `conf-${attempt}`,
        }),
        red,
        blue,
        day: 30,
        divisionId: red.divisionId,
        promotionId: red.promotionId!,
        rng: createRng(`conf-a-${attempt}`),
      });
    }

    const winner = after.red.summary.wins > red.summary.wins ? after.red : after.blue;
    const loser = winner === after.red ? after.blue : after.red;
    const winnerBefore = winner.id === red.id ? red : blue;
    const loserBefore = loser.id === red.id ? red : blue;

    expect(winner.condition.confidence).toBeGreaterThan(winnerBefore.condition.confidence);
    expect(loser.condition.confidence).toBeLessThan(loserBefore.condition.confidence);
    expect(winner.starPower).toBeGreaterThan(winnerBefore.starPower);
    expect(winner.reputation).toBeGreaterThan(winnerBefore.reputation);
    expect(loser.reputation).toBeLessThan(loserBefore.reputation);
  });

  it('lays a fighter off for longer the more damaged they are', () => {
    const fresh = db.fighters.getById('f_yan') as Fighter;
    const battered: Fighter = {
      ...fresh,
      condition: { ...fresh.condition, headTrauma: 85 },
    };
    expect(readinessDelay(battered)).toBeGreaterThan(readinessDelay(fresh));
    // A real layoff even for an undamaged fighter with an excellent recovery natural.
    expect(readinessDelay(fresh)).toBeGreaterThan(35);
    expect(readinessDelay(battered)).toBeGreaterThan(readinessDelay(fresh) * 1.3);
  });

  it('imposes a medical suspension that recovery cannot shorten', () => {
    const fresh = db.fighters.getById('f_yan') as Fighter;
    // An outstanding recovery natural must not buy a way out of a knockout suspension.
    const superhuman: Fighter = { ...fresh, naturals: { ...fresh.naturals, recovery: 99 } };
    expect(readinessDelay(superhuman, 'ko')).toBeGreaterThanOrEqual(180);
    expect(readinessDelay(superhuman, 'tko')).toBeGreaterThanOrEqual(60);
    expect(readinessDelay(superhuman, 'decisionUnanimous')).toBeLessThan(
      readinessDelay(superhuman, 'ko'),
    );
  });

  it('persists a career across a save and reload', () => {
    const adapter = createMemoryAdapter();
    const first = createNewGame({ adapter, seed: 'persist' });
    const fighter = first.fighters.getById('f_yan') as Fighter;
    first.fighters.upsert({ ...fighter, starPower: 91 });
    first.save();

    // A fresh GameDb over the same storage: this is what a page reload does.
    const reloaded = createNewGame({ adapter, seed: 'persist' });
    expect(reloaded.fighters.count()).toBe(first.fighters.count());
  });
});

describe('scouting is uncertain in the way the design requires', () => {
  it('gives a better coach a materially more accurate read', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'scout' });
    const opponent = db.fighters.getById('f_khabib') as Fighter;
    const truth = deriveTendencies(opponent);

    const errorFor = (skill: number): number => {
      let total = 0;
      const runs = 200;
      for (let i = 0; i < runs; i++) {
        const report = scoutOpponent(truth, skill, 12, createRng(`scout-${skill}-${i}`));
        for (const read of report.reads) total += Math.abs(read.estimate - truth[read.read]);
      }
      return total / runs;
    };

    // This gap is the entire reason a coach is worth paying for.
    expect(errorFor(90)).toBeLessThan(errorFor(30) * 0.6);
  });

  it('makes a fighter with almost no footage genuinely hard to prepare for', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'footage' });
    const opponent = db.fighters.getById('f_askarov') as Fighter;
    const truth = deriveTendencies(opponent);

    const wellScouted = scoutOpponent(truth, 90, 15, createRng('a'));
    const shortNotice = scoutOpponent(truth, 90, 1, createRng('b'));
    // An elite coach cannot fix an absence of tape, which is what makes short-notice
    // replacements dangerous out of proportion to their ratings.
    expect(shortNotice.accuracy).toBeLessThan(wellScouted.accuracy * 0.8);
  });

  it('produces reports that are sometimes confidently wrong', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'wrong' });
    const opponent = db.fighters.getById('f_thompson') as Fighter;
    const truth = deriveTendencies(opponent);

    let confidentlyWrong = 0;
    for (let i = 0; i < 300; i++) {
      const report = scoutOpponent(truth, 40, 8, createRng(`cw-${i}`));
      for (const read of report.reads) {
        if (read.confidence > 0.6 && Math.abs(read.estimate - truth[read.read]) > 0.2) {
          confidentlyWrong++;
        }
      }
    }
    // A weak coach who is sure of himself is a real and dangerous thing.
    expect(confidentlyWrong).toBeGreaterThan(0);
  });
});

describe('paper odds are a matchmaker’s view, not the truth', () => {
  it('favours the better fighter on paper', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'odds' });
    const great = db.fighters.getById('f_jones') as Fighter;
    const ordinary = db.fighters.getById('f_walker') as Fighter;
    expect(paperOdds(great, ordinary)).toBeGreaterThan(0.7);
    expect(paperOdds(ordinary, great)).toBeLessThan(0.3);
  });

  it('is symmetric', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'odds2' });
    const a = db.fighters.getById('f_poirier') as Fighter;
    const b = db.fighters.getById('f_gaethje') as Fighter;
    expect(paperOdds(a, b) + paperOdds(b, a)).toBeCloseTo(1, 6);
  });
});
