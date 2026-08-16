import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asFighterId } from '../core/ids.js';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import {
  RIVALRY_THRESHOLD,
  drawWeight,
  currentHeat,
  describeHeat,
  emptyRivalry,
  heatFromFight,
  heatRevenueMultiplier,
  pairKey,
  rivalryAggression,
  rivalryId,
  rivalryLossMultiplier,
  stokeHeat,
} from './heat.js';

const A = asFighterId('a');
const B = asFighterId('b');


describe('rivalry identity', () => {
  it('is order-independent, so a pair has exactly one rivalry', () => {
    expect(rivalryId(A, B)).toBe(rivalryId(B, A));
    expect(pairKey(B, A)).toEqual(pairKey(A, B));
  });
});

describe('heat accrues and decays', () => {
  it('starts at zero', () => {
    expect(currentHeat(emptyRivalry(A, B, 0), 0)).toBe(0);
  });

  it('rises when stoked', () => {
    const stoked = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'trashTalk',
      day: 0,
      rng: createRng('a'),
    });
    expect(stoked.heat).toBeGreaterThan(0);
  });

  it('decays with time, so a build-up has to be maintained', () => {
    const stoked = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'previousFight',
      day: 0,
      rng: createRng('b'),
    });
    expect(currentHeat(stoked, 180)).toBeLessThan(currentHeat(stoked, 0));
  });

  it('lets a confirmed rivalry keep far longer than mere interest', () => {
    const base = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'previousFight',
      day: 0,
      rng: createRng('c'),
    });
    const grudge = { ...base, isRivalry: true };
    // Grudges keep. Interest does not.
    expect(currentHeat(grudge, 365)).toBeGreaterThan(currentHeat(base, 365));
  });

  it('never leaves the 0–100 scale, however hard it is stoked', () => {
    let rivalry = emptyRivalry(A, B, 0);
    for (let i = 0; i < 40; i++) {
      rivalry = stokeHeat({
        rivalry,
        source: 'controversialFinish',
        day: 0,
        rng: createRng(`x${i}`),
      });
    }
    expect(rivalry.heat).toBeLessThanOrEqual(100);
    expect(currentHeat(rivalry, 9999)).toBeGreaterThanOrEqual(0);
  });
});

describe('who generates heat', () => {
  const stokeWith = (fighter: ReturnType<typeof makeFighter>) =>
    stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'trashTalk',
      day: 0,
      instigator: fighter,
      rng: createRng('same'),
    }).heat;

  it('rewards charisma and the Trash Talker trait', () => {
    const quiet = stokeWith(makeFighter({ personality: { charisma: 15, aggression: 30 } }));
    const loud = stokeWith(
      makeFighter({ personality: { charisma: 95, aggression: 85 }, traits: ['trashTalker'] }),
    );
    // Roughly double, which is what makes the trait worth its cost to the relationship.
    expect(loud).toBeGreaterThan(quiet * 1.8);
  });

  it('values a controversial finish above trash talk', () => {
    const talk = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'trashTalk',
      day: 0,
      rng: createRng('s'),
    }).heat;
    const robbery = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'controversialFinish',
      day: 0,
      rng: createRng('s'),
    }).heat;
    // The best build-up money cannot buy.
    expect(robbery).toBeGreaterThan(talk);
  });
});

describe('ignition into a rivalry', () => {
  it('needs heat and the right personalities', () => {
    // Heat alone is not enough: a placid fighter does not take it personally.
    let placid = emptyRivalry(A, B, 0);
    const calm = makeFighter({ personality: { aggression: 5, ego: 5 } });
    for (let i = 0; i < 10; i++) {
      placid = stokeHeat({
        rivalry: placid,
        source: 'callout',
        day: 0,
        instigator: calm,
        rng: createRng(`p${i}`),
      });
    }

    let volatile_ = emptyRivalry(A, B, 0);
    const hothead = makeFighter({ personality: { aggression: 95, ego: 95 } });
    for (let i = 0; i < 10; i++) {
      volatile_ = stokeHeat({
        rivalry: volatile_,
        source: 'callout',
        day: 0,
        instigator: hothead,
        rng: createRng(`v${i}`),
      });
    }

    expect(volatile_.heat).toBeGreaterThan(RIVALRY_THRESHOLD);
    expect(volatile_.isRivalry).toBe(true);
    expect(placid.isRivalry).toBe(false);
  });

  it('never ignites below the threshold', () => {
    const barely = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'styleClash',
      day: 0,
      instigator: makeFighter({ personality: { aggression: 99, ego: 99 } }),
      rng: createRng('low'),
    });
    expect(barely.heat).toBeLessThan(RIVALRY_THRESHOLD);
    expect(barely.isRivalry).toBe(false);
  });

  it('records the beats of the build-up', () => {
    const stoked = stokeHeat({
      rivalry: emptyRivalry(A, B, 0),
      source: 'trashTalk',
      day: 0,
      beat: 'Called him a coward at the press conference.',
      rng: createRng('beat'),
    });
    expect(stoked.beats).toHaveLength(1);
  });
});

describe('a fight builds its own rematch', () => {
  it('always generates heat from having happened', () => {
    expect(
      heatFromFight({
        wasClose: false,
        wasControversial: false,
        wasTitleFight: false,
        finishWasBrutal: false,
      }),
    ).toContain('previousFight');
  });

  it('generates far more from a controversial title fight', () => {
    const sources = heatFromFight({
      wasClose: true,
      wasControversial: true,
      wasTitleFight: true,
      finishWasBrutal: false,
    });
    expect(sources).toContain('controversialFinish');
    expect(sources).toContain('titleStakes');
    expect(sources.length).toBeGreaterThan(2);
  });
});

describe('what heat does', () => {
  it('multiplies revenue, and a grudge multiplies it more', () => {
    expect(heatRevenueMultiplier(0, false)).toBe(1);
    expect(heatRevenueMultiplier(100, false)).toBeGreaterThan(1.5);
    expect(heatRevenueMultiplier(100, true)).toBeGreaterThan(heatRevenueMultiplier(100, false));
  });

  it('changes how the fight is actually fought', () => {
    // A rivalry that did not change the fight would be flavour text.
    expect(rivalryAggression(80, false)).toBe(1);
    expect(rivalryAggression(80, true)).toBeGreaterThan(1);
  });

  it('makes losing to a rival hurt more', () => {
    expect(rivalryLossMultiplier(true)).toBeGreaterThan(rivalryLossMultiplier(false));
  });

  it('says plainly why the audience cares, or does not', () => {
    const cold = emptyRivalry(A, B, 0);
    expect(describeHeat(cold, 0)).toMatch(/nobody/i);

    const hot = { ...emptyRivalry(A, B, 0), heat: 90, isRivalry: true };
    expect(describeHeat(hot, 0)).toMatch(/personal/i);
  });
});

describe('draw weight', () => {
  it('values a competitive fight above a mismatch of the same names', () => {
    // What stops "always book the safest fight" being correct.
    const even = drawWeight({
      promotion: makePromotion(),
      red: makeFighter({ id: 'a', starPower: 70 }),
      blue: makeFighter({ id: 'b', starPower: 70 }),
      heat: 0,
      isRivalry: false,
      isTitleFight: false,
    });
    const mismatch = drawWeight({
      promotion: makePromotion(),
      red: makeFighter({ id: 'a', starPower: 70, attributes: { power: 90, speed: 90, cardio: 90 } }),
      blue: makeFighter({ id: 'b', starPower: 70, attributes: { power: 25, speed: 25, cardio: 25 } }),
      heat: 0,
      isRivalry: false,
      isTitleFight: false,
    });
    expect(even).toBeGreaterThan(mismatch);
  });

  it('makes a heated mid-card fight draw better than a cold title fight', () => {
    // The whole reason heat is a separate number from star power.
    const grudge = drawWeight({
      promotion: makePromotion(),
      red: makeFighter({ id: 'a', starPower: 40 }),
      blue: makeFighter({ id: 'b', starPower: 40 }),
      heat: 95,
      isRivalry: true,
      isTitleFight: false,
    });
    const cold = drawWeight({
      promotion: makePromotion(),
      red: makeFighter({ id: 'a', starPower: 40 }),
      blue: makeFighter({ id: 'b', starPower: 40 }),
      heat: 0,
      isRivalry: false,
      isTitleFight: true,
    });
    expect(grudge).toBeGreaterThan(cold);
  });

  it('is not money, and must never be compared to a purse', () => {
    // It used to return thousands, which made the promotion lose money on its marquee fights
    // and profit on its prelims. It is a unitless share of an event's demand.
    const weight = drawWeight({
      promotion: makePromotion(),
      red: makeFighter({ id: 'a', starPower: 100 }),
      blue: makeFighter({ id: 'b', starPower: 100 }),
      heat: 100,
      isRivalry: true,
      isTitleFight: true,
    });
    expect(Number.isFinite(weight)).toBe(true);
    expect(weight).toBeGreaterThan(0);
  });
});
