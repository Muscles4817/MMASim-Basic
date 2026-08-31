import { describe, expect, it } from 'vitest';
import {
  EFFECT_PIVOT,
  attributeEffect,
  effect,
  effectRatio,
  effectToRating,
  fatigued,
  fatiguedEffect,
  REPERTOIRE_ABSENT,
  REPERTOIRE_OWNED,
  repertoire,
} from './curve.js';
import { ATTRIBUTE_KEYS, ATTRIBUTE_META, uniformAttributes } from './attributes.js';

describe('effect', () => {
  it('is exactly 1.0 at the pivot, for any convexity', () => {
    for (const k of [0.5, 0.9, 1.2, 1.6, 2.4]) {
      expect(effect(EFFECT_PIVOT, k)).toBe(1);
    }
  });

  it('is monotonically increasing', () => {
    for (let r = 2; r <= 100; r++) {
      expect(effect(r, 1.2)).toBeGreaterThan(effect(r - 1, 1.2));
    }
  });

  it('is convex — each step up is worth more than the last', () => {
    // This is the whole point of the curve: the gap from 89→99 must exceed the gap 50→60.
    const lowStep = effect(60, 1.6) - effect(50, 1.6);
    const highStep = effect(99, 1.6) - effect(89, 1.6);
    expect(highStep).toBeGreaterThan(lowStep * 2);
  });

  it('round-trips through effectToRating', () => {
    for (const r of [10, 35, 50, 72, 88, 99]) {
      expect(effectToRating(effect(r, 1.4), 1.4)).toBeCloseTo(r, 6);
    }
  });
});

describe('curve calibration (docs/02 table)', () => {
  // These are the published numbers in the design doc. If a re-tune changes them, the doc
  // must change in the same commit — that is the point of asserting them here.
  const cases: ReadonlyArray<[number, number, number, number, number]> = [
    // [K,   effect(50), effect(75), effect(90), effect(99)]
    [0.9, 1.0, 1.57, 2.05, 2.42],
    [1.2, 1.0, 1.82, 2.61, 3.24],
    [1.6, 1.0, 2.23, 3.6, 4.8],
  ];

  it.each(cases)('K=%s matches the documented table', (k, e50, e75, e90, e99) => {
    expect(effect(50, k)).toBeCloseTo(e50, 2);
    expect(effect(75, k)).toBeCloseTo(e75, 2);
    expect(effect(90, k)).toBeCloseTo(e90, 2);
    expect(effect(99, k)).toBeCloseTo(e99, 2);
  });
});

describe('outliers feel like outliers (design pillar 3)', () => {
  it('gives a Power-99 fighter a decisive edge over a Power-90 one', () => {
    // "Ngannou vs a very hard-hitting heavyweight" must not be a coin flip on power.
    const ratio = effectRatio(99, 90, 'power');
    expect(ratio).toBeGreaterThan(1.25);
  });

  it('makes Power 99 categorically different from Power 75', () => {
    expect(effectRatio(99, 75, 'power')).toBeGreaterThan(2);
  });

  it('makes a low-power fighter need many more clean landings', () => {
    expect(effectRatio(99, 40, 'power')).toBeGreaterThan(6);
  });

  it('uses a gentler curve for broad attributes so they do not double-count', () => {
    // Speed touches nearly every roll already; a Power-steep curve on top would swamp
    // everything else.
    expect(effectRatio(99, 50, 'speed')).toBeLessThan(effectRatio(99, 50, 'power'));
    expect(ATTRIBUTE_META.speed.convexity).toBeLessThan(ATTRIBUTE_META.power.convexity);
  });
});

describe('attributeEffect', () => {
  it('reads convexity from attribute metadata', () => {
    const attrs = uniformAttributes(80);
    for (const key of ATTRIBUTE_KEYS) {
      expect(attributeEffect(attrs, key)).toBeCloseTo(effect(80, ATTRIBUTE_META[key].convexity), 9);
    }
  });

  it('yields 1.0 across the board for a wholly average fighter', () => {
    const attrs = uniformAttributes(50);
    for (const key of ATTRIBUTE_KEYS) {
      expect(attributeEffect(attrs, key)).toBeCloseTo(1, 9);
    }
  });
});

describe('fatigue', () => {
  it('does not change a rating when fresh', () => {
    for (const key of ATTRIBUTE_KEYS) expect(fatigued(80, key, 0)).toBe(80);
  });

  it('clamps fatigue outside [0, 1]', () => {
    expect(fatigued(80, 'speed', -5)).toBe(fatigued(80, 'speed', 0));
    expect(fatigued(80, 'speed', 5)).toBe(fatigued(80, 'speed', 1));
  });

  it('never drains Cardio itself', () => {
    expect(fatigued(90, 'cardio', 1)).toBe(90);
  });

  it('drains explosive attributes faster than technical ones', () => {
    const exhausted = 1;
    const speedLoss = 80 - fatigued(80, 'speed', exhausted);
    const subsLoss = 80 - fatigued(80, 'submissions', exhausted);
    const iqLoss = 80 - fatigued(80, 'fightIq', exhausted);
    expect(speedLoss).toBeGreaterThan(subsLoss);
    expect(subsLoss).toBeGreaterThan(iqLoss);
  });

  it('takes the kicks away before it takes the hands away', () => {
    expect(fatigued(80, 'kicking', 0.8)).toBeLessThan(fatigued(80, 'strikingOffence', 0.8));
  });

  it('compounds through the convex curve', () => {
    // A gassed power puncher loses far more *effect* than the linear rating drop suggests.
    const fresh = fatiguedEffect(95, 'power', 0);
    const gassed = fatiguedEffect(95, 'power', 1);
    const ratingDrop = 1 - fatigued(95, 'power', 1) / 95;
    const effectDrop = 1 - gassed / fresh;
    expect(effectDrop).toBeGreaterThan(ratingDrop);
  });
});

/**
 * The repertoire gate — doc 31 § D16, and doc 02's scale bands finally read by something.
 *
 * `effect` answers *how well would it go*; this answers *would he reach for it*. The unit claims
 * are here; what it does to a fight is `tests/statistical/style-identity.test.ts`.
 */
describe('repertoire', () => {
  it('is exactly 1 from the rating doc 02 calls a technique he has, upward', () => {
    /*
     * **An exact-equality claim, deliberately.** Every decision surface in the engine multiplies by
     * this, so anything other than a hard 1 above the threshold would move the last bits of every
     * candidate weight in the game — and `pickWeighted` is deterministic on exactly those bits.
     * `0.03 + 0.97 * 1 === 1` is a fact about IEEE 754 rather than about arithmetic, so it is
     * asserted rather than assumed.
     */
    for (let r = REPERTOIRE_OWNED; r <= 100; r++) {
      expect(repertoire(r), `rating ${r}`).toBe(1);
    }
  });

  it('is one value across the whole band doc 02 calls effectively absent', () => {
    // 1–19 is a single claim in the doc, so it is a single value here: a fighter with 3 and a
    // fighter with 18 are the same fighter for the purpose of "does he reach for this".
    for (let r = 1; r <= REPERTOIRE_ABSENT; r++) {
      expect(repertoire(r), `rating ${r}`).toBe(repertoire(1));
    }
  });

  it('never reaches zero, because nothing in a fight is strictly impossible', () => {
    /*
     * Three reasons, in ascending order of how badly zero breaks things: a boxer who grabs a neck
     * in a scramble is a real fight; a zero-weight candidate cannot be told from an *unavailable*
     * one, which `intentAuthority` depends on; and a fighter terrible at everything on a list would
     * hand `pickWeighted` a total of zero, which is a crash rather than a fight.
     */
    expect(repertoire(1)).toBeGreaterThan(0);
    expect(repertoire(1)).toBeLessThan(0.05);
  });

  it('rises monotonically and convexly through the liability band', () => {
    for (let r = 2; r <= 100; r++) {
      expect(repertoire(r), `rating ${r}`).toBeGreaterThanOrEqual(repertoire(r - 1));
    }
    // Convex rather than linear: the doc's 20–37 band is not one claim end to end, so its midpoint
    // must not read as half. A straight ramp would put 28 at 0.50 and 32 at 0.71.
    expect(repertoire(28)).toBeLessThan(0.3);
    expect(repertoire(32)).toBeLessThan(0.55);
    expect(repertoire(36)).toBeGreaterThan(0.7);
  });

  it('does not read fatigue, which effect already prices', () => {
    /*
     * There is no fatigued form of this and the first cut had one. Repertoire is what a fighter
     * knows and that does not change in round three; what he loses is the ability to finish the
     * thing, which is `fatiguedEffect`'s job. Reading fatigue here charged it twice — and quietly
     * broke the inertness above, because `FATIGUE_SENSITIVITY` for wrestling is 0.35, so a
     * `wrestling: 40` fighter dropped through the gate by the second round.
     */
    expect(repertoire(fatigued(40, 'wrestling', 0.5))).toBeLessThan(1);
    expect(repertoire(40)).toBe(1);
  });
});
