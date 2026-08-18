/**
 * Why a career ends, and whether the game can say so honestly.
 *
 * Two things are under test. That elapsed time actually restores self-belief — the omission
 * docs/25 §1 traced to careers ending at twenty-four — and that the reason a fighter is given
 * is read off the same arithmetic that made the decision, rather than from a separate ladder of
 * thresholds the decision never consulted.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import { applyAgeing } from './development.js';
import {
  DRIFT_GRACE_DAYS,
  driftUrge,
  retirementDrivers,
  retirementReason,
  retirementUrge,
} from './retirement.js';
import { confidenceBaseline } from '../domain/personality.js';
import type { Fighter } from '../domain/fighter.js';

const YEAR = 365;
const rng = () => createRng('retirement-test');

/**
 * A bout on the record, so the fighter reads as active.
 *
 * `retirementReason` answers "why did this career end", and `driftUrge` outranks the weighted
 * terms — correctly, because a fighter nobody has called in eighteen months did not stop for any
 * of the reasons below. Every test in the reason block is about somebody who has just fought, so
 * they need to look like it. The seeded roster ships with an empty record and is exempt for the
 * separate reason documented on `driftUrge`.
 */
const justFought = (f: Fighter, day = 0): Fighter => ({
  ...f,
  record: [
    {
      boutId: 'b',
      opponentId: 'other',
      promotionId: 'p',
      day,
      outcome: 'loss',
      method: 'decisionUnanimous',
      round: 3,
      timeSeconds: 300,
      divisionId: f.divisionId,
      wasTitleFight: false,
    },
  ] as unknown as Fighter['record'],
});

const withCondition = (o: Partial<Fighter['condition']>, overrides = {}): Fighter => {
  const f = makeFighter(overrides);
  return justFought({ ...f, condition: { ...f.condition, ...o } });
};

describe('time restores self-belief', () => {
  it('brings a beaten fighter up over a year out, rather than freezing them at their worst', () => {
    /*
     * The whole defect in one assertion. Confidence was written in exactly one place — the
     * post-fight path — so a fighter who lost three in a row and then took a year off came back
     * at precisely the number the last defeat left them on, forever.
     */
    const beaten = withCondition({ confidence: 12 }, { age: 24 });
    const after = applyAgeing(beaten, 0, YEAR, rng()).fighter;
    expect(after.condition.confidence).toBeGreaterThan(beaten.condition.confidence);
    expect(after.condition.confidence).toBeLessThan(confidenceBaseline(beaten.personality));
  });

  it('does it through a camp-length span too, not only through long layoffs', () => {
    const beaten = withCondition({ confidence: 20 }, { age: 24 });
    const after = applyAgeing(beaten, 0, 70, rng()).fighter;
    expect(after.condition.confidence).toBeGreaterThan(20);
  });

  it('takes most of the retirement pressure off a young fighter on a bad run', () => {
    /*
     * The traced case, exactly: a 24-year-old at confidence 12 on a three-fight skid carried an
     * urge of 0.36, which `shouldRetire` squares into a **12.9% chance of walking away per
     * fight**. Nothing about being 24 and 0-3 should read as a finished career.
     *
     * The skid itself is not a mood and does not heal here — it is still a three-fight losing
     * run a year later, and it should still weigh something. What lifts is the confidence half:
     * a year takes the urge from 0.360 to 0.194, which is a **3.4x** fall in the per-fight odds
     * of walking away. A year is also not full recovery — the time constant is longer than that
     * for a neutral personality — which is why this asserts a large fall rather than a floor.
     */
    const f = makeFighter({ age: 24 });
    const young: Fighter = justFought({
      ...f,
      condition: { ...f.condition, confidence: 12 },
      summary: { ...f.summary, streak: -3 },
    });
    const before = retirementUrge(young, 0);
    expect(before).toBeGreaterThan(0.3);

    const recovered = applyAgeing(young, 0, YEAR, rng()).fighter;
    const after = retirementUrge(recovered, YEAR);
    expect(after).toBeLessThan(before * 0.6);
    expect(after ** 2).toBeLessThan(before ** 2 / 3);
  });

  it('leaves a genuinely finished veteran finished', () => {
    // Recovery must not rescue everybody. Age, damage and wear are not moods.
    const veteran = withCondition({ confidence: 15, headTrauma: 80, bodyWear: 75 }, { age: 41 });
    expect(retirementUrge(veteran, 0)).toBeGreaterThan(0.4);
    const after = applyAgeing(veteran, 0, YEAR, rng()).fighter;
    expect(retirementUrge(after, YEAR)).toBeGreaterThan(0.4);
  });
});

describe('the reason a fighter is given', () => {
  it('names lost belief when that is what was actually pushing them', () => {
    /*
     * `retirementReason` used to require `confidence <= 20` while the decision fired on the
     * urge, which is meaningfully non-zero long before that. Traced: a fighter who quit at
     * confidence 24 was told they "retired on their own terms".
     */
    const shaken = withCondition({ confidence: 24 }, { age: 27 });
    expect(retirementReason(shaken, 0)).toMatch(/desire/i);
  });

  it('names the losing run when the skid outweighs everything else', () => {
    const f = makeFighter({ age: 29 });
    const skidding: Fighter = justFought({
      ...f,
      condition: { ...f.condition, confidence: confidenceBaseline(f.personality) },
      summary: { ...f.summary, streak: -5 },
    });
    expect(retirementReason(skidding, 0)).toMatch(/losing run/i);
  });

  it('still puts the body first, because that outranks how anybody feels', () => {
    const hurt = withCondition({ confidence: 10, headTrauma: 78 }, { age: 34 });
    expect(retirementReason(hurt, 0)).toMatch(/medical advice/i);
  });

  it('names accumulated mileage, which previously had no reason at all', () => {
    const worn = withCondition({ confidence: 70, bodyWear: 95, headTrauma: 20 }, { age: 30 });
    const drivers = retirementDrivers(worn, 0);
    expect(drivers.wear).toBeGreaterThan(drivers.confidence);
    expect(retirementReason(worn, 0)).toMatch(/body stopped answering/i);
  });

  it('says "own terms" only when nothing was really pushing them', () => {
    const content = withCondition({ confidence: 75 }, { age: 30 });
    expect(retirementReason(content, 0)).toMatch(/own terms/i);
  });

  it('agrees with the urge it was derived from', () => {
    const f = withCondition({ confidence: 30, headTrauma: 50 }, { age: 35 });
    expect(retirementDrivers(f, 0).urge).toBe(retirementUrge(f, 0));
  });
});

describe('the careers nobody announces the end of', () => {
  const active = (o: Partial<Fighter['condition']> = {}, overrides = {}) =>
    withCondition(o, overrides);

  it('leaves a fighter who is still competing alone', () => {
    expect(driftUrge(active({}, { age: 28 }), 200)).toBe(0);
  });

  it('starts only once they are genuinely idle, not merely between fights', () => {
    // The world books the average fighter about once every eleven months. A year out is a
    // trough; the mechanic must not read it as a career ending.
    const f = active({}, { age: 28 });
    expect(driftUrge(f, 365)).toBe(0);
    expect(driftUrge(f, DRIFT_GRACE_DAYS + 400)).toBeGreaterThan(0);
  });

  it('treats an empty record as fresh rather than as never', () => {
    /*
     * Both seeded worlds ship every fighter with an empty `record` — their history is backstory,
     * not rows — while `proDebutDay` runs back nineteen years before the save starts. Measured
     * against the 2026 seed when this read the debut day instead: 811 of 858 fighters had a
     * non-zero drift urge on day one of a new game.
     */
    const neverFought = makeFighter({ age: 30 });
    expect(neverFought.record.length).toBe(0);
    expect(driftUrge(neverFought, 5000)).toBe(0);
  });

  it('keeps calling the people who sell tickets', () => {
    const idleDay = DRIFT_GRACE_DAYS + 500;
    const nobody = { ...active({}, { age: 30 }), reputation: 20 };
    const contender = { ...active({}, { age: 30 }), reputation: 85 };
    expect(driftUrge(contender, idleDay)).toBeLessThan(driftUrge(nobody, idleDay));
  });

  it('lets an ambitious fighter keep answering the phone longer', () => {
    const idleDay = DRIFT_GRACE_DAYS + 500;
    const driven = active({}, { age: 30, personality: { ambition: 95 } });
    const content = active({}, { age: 30, personality: { ambition: 5 } });
    expect(driftUrge(driven, idleDay)).toBeLessThan(driftUrge(content, idleDay));
  });

  it('says so plainly, because it is not the same ending as walking away', () => {
    expect(retirementReason(active({}, { age: 31 }), DRIFT_GRACE_DAYS + 500)).toMatch(/drifted/i);
  });

  it('never fires on somebody already retired', () => {
    const gone = { ...active({}, { age: 31 }), retiredDay: 100 };
    expect(driftUrge(gone, DRIFT_GRACE_DAYS + 900)).toBe(0);
  });
});
