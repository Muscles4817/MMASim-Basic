/**
 * The rule this module lives or dies by is that **a background is a shape, not a bonus**, and it is
 * the one thing in `background.ts` that cannot be verified by reading the table. Every prior in
 * `DISCIPLINE_META` is a positive-looking number; whether the population is inflated by them
 * depends entirely on whether the re-centring is right, and that is arithmetic over eleven
 * disciplines weighted by a division-conditioned intake.
 *
 * So the zero-sum property is asserted directly, per division, on every field a background touches.
 */

import { describe, expect, it } from 'vitest';
import { asDivisionId } from '../core/ids.js';
import { divisionsFor } from '../domain/divisions.js';
import {
  aptitudeLeanFor,
  attainmentWeightsFor,
  bodyPriorFor,
  naturalsLeanFor,
  realisationFor,
  sampleBackground,
  weightsFor,
  type FighterBackground,
} from './background.js';
import { createRng } from '../core/rng.js';
import { ATTAINMENTS, ATTAINMENT_META, DISCIPLINES, DISCIPLINE_META } from './origin.js';

const ALL_DIVISIONS = [...divisionsFor('male'), ...divisionsFor('female')];

/** Every background a division can produce, with the intake weight it produces it at. */
function population(divisionId: ReturnType<typeof asDivisionId>, age: number) {
  const disciplines = weightsFor(divisionId);
  const attainments = attainmentWeightsFor(age);
  const out: { background: FighterBackground; weight: number }[] = [];
  for (const [discipline, dw] of disciplines) {
    for (const [attainment, aw] of attainments) {
      out.push({ background: { discipline, attainment }, weight: dw * aw });
    }
  }
  return out;
}

describe('a background is a shape, not a bonus', () => {
  /*
   * The tolerance is 1e-9 rather than "small": this is exact arithmetic, not a sampled statistic.
   * A drifting mean here would mean the intake weights used to centre the prior are not the ones
   * used to draw it, which is a bug that would be invisible in every other test — the world would
   * simply get slowly better and every bound that noticed would be re-baselined.
   */
  const EXACT = 1e-9;

  it.each(ALL_DIVISIONS.map((d) => [d.shortName, d.id] as const))(
    'leaves the mean body untouched in %s',
    (_name, divisionId) => {
      const pop = population(divisionId, 25);
      for (const key of ['frameIndex', 'muscleIndex', 'bodyFatIndex', 'heightInches'] as const) {
        const mean = pop.reduce(
          (acc, p) => acc + p.weight * (bodyPriorFor(p.background, divisionId)[key] ?? 0),
          0,
        );
        expect(mean, `${key} mean prior`).toBeCloseTo(0, 9);
      }
      void EXACT;
    },
  );

  it.each(ALL_DIVISIONS.map((d) => [d.shortName, d.id] as const))(
    'leaves the mean naturals untouched in %s',
    (_name, divisionId) => {
      const pop = population(divisionId, 25);
      const keys = [
        'explosiveness',
        'forceVelocityBias',
        'engine',
        'constitution',
        'recovery',
        'motorLearning',
      ] as const;
      for (const key of keys) {
        const mean = pop.reduce(
          (acc, p) => acc + p.weight * (naturalsLeanFor(p.background, divisionId, 25)[key] ?? 0),
          0,
        );
        expect(mean, `${key} mean lean`).toBeCloseTo(0, 9);
      }
    },
  );

  it.each(ALL_DIVISIONS.map((d) => [d.shortName, d.id] as const))(
    'leaves the mean realisation and aptitude untouched in %s',
    (_name, divisionId) => {
      const pop = population(divisionId, 25);
      const attributeKeys = new Set<string>();
      for (const d of DISCIPLINES) {
        for (const k of Object.keys(DISCIPLINE_META[d].realises)) attributeKeys.add(k);
      }
      for (const key of attributeKeys) {
        const mean = pop.reduce(
          (acc, p) =>
            acc +
            p.weight *
              ((realisationFor(p.background, divisionId, 25) as Record<string, number>)[key] ?? 0),
          0,
        );
        expect(mean, `${key} mean realisation`).toBeCloseTo(0, 9);
      }
      for (const key of ['striking', 'grappling', 'conditioning', 'strategy'] as const) {
        const mean = pop.reduce(
          (acc, p) => acc + p.weight * (aptitudeLeanFor(p.background, divisionId)[key] ?? 0),
          0,
        );
        expect(mean, `${key} mean aptitude lean`).toBeCloseTo(0, 9);
      }
    },
  );
});

describe('the division conditions which backgrounds turn up in it', () => {
  it('puts throwers at heavyweight and distance runners at flyweight', () => {
    const hw = weightsFor(asDivisionId('mens-heavyweight'));
    const flw = weightsFor(asDivisionId('mens-flyweight'));

    expect(hw.get('throws')! / flw.get('throws')!).toBeGreaterThan(5);
    expect(flw.get('distanceRunning')! / hw.get('distanceRunning')!).toBeGreaterThan(5);
  });

  it('barely moves the combat disciplines, which is the check on the coupling', () => {
    /*
     * The mass coupling exists to say "throwers are big". If it also re-sorted the six combat
     * arts by weight class it would be asserting something the sport does not support — that
     * heavyweights are wrestlers and flyweights are jiu-jitsu players — through a parameter that
     * was tuned for a different purpose entirely.
     */
    const hw = weightsFor(asDivisionId('mens-heavyweight'));
    const flw = weightsFor(asDivisionId('mens-flyweight'));
    const swing = (d: (typeof DISCIPLINES)[number]) => {
      const ratio = hw.get(d)! / flw.get(d)!;
      return ratio >= 1 ? ratio : 1 / ratio;
    };
    /*
     * The axis is `massAffinity`, not combat-against-athletic — `sprints` sits at 0 and correctly
     * barely moves at all, because a 100m runner is a normal-sized man. So the bound is stated on
     * the affinity: everything the table calls mid-sized stays mid-sized, and the two deliberate
     * extremes separate hard. Measured, the widest swing among the mid-sized is karate at 2.1x,
     * which is real and about what the sport looks like.
     */
    for (const d of DISCIPLINES) {
      if (Math.abs(DISCIPLINE_META[d].massAffinity) > 0.3) continue;
      expect(swing(d), `${d} swings ${swing(d).toFixed(2)}x across the ladder`).toBeLessThan(2.4);
    }
    for (const d of ['throws', 'distanceRunning'] as const) {
      expect(swing(d), `${d} swings only ${swing(d).toFixed(2)}x`).toBeGreaterThan(5);
    }
  });

  it('sums to one everywhere', () => {
    for (const division of ALL_DIVISIONS) {
      const total = [...weightsFor(division.id).values()].reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });
});

describe('attainment is filtered by the age somebody debuts at', () => {
  it('offers no world medallist a debut before they could have earned it', () => {
    for (const attainment of ATTAINMENTS) {
      const min = ATTAINMENT_META[attainment].minDebutAge;
      expect(attainmentWeightsFor(min - 1).has(attainment)).toBe(false);
      expect(attainmentWeightsFor(min).has(attainment)).toBe(true);
    }
  });

  it('renormalises rather than leaving a hole', () => {
    for (const age of [18, 21, 24, 27, 33]) {
      const total = [...attainmentWeightsFor(age).values()].reduce((a, b) => a + b, 0);
      expect(total, `age ${age}`).toBeCloseTo(1, 12);
    }
  });

  it('draws only legal attainments', () => {
    const rng = createRng('attainment');
    for (let i = 0; i < 400; i++) {
      const age = 20 + (i % 8);
      const drawn = sampleBackground(rng.fork(`f${i}`), asDivisionId('mens-lightweight'), age);
      expect(age, `${drawn.attainment} at ${age}`).toBeGreaterThanOrEqual(
        ATTAINMENT_META[drawn.attainment].minDebutAge,
      );
    }
  });
});

describe('the two athletic splits are real separations', () => {
  /*
   * Doc 31 § 22.1. `trackAndField` and `enduranceSport` were single entries because the engine had
   * no number that could tell a sprinter from a thrower or a rower from a marathoner. If either
   * pair ever collapses back together the split has stopped being honest and the right response is
   * to merge them again, not to leave a wider menu that means nothing.
   */
  it('separates sprints from throws on the force-velocity curve and on the body', () => {
    const sprint = DISCIPLINE_META.sprints;
    const throwing = DISCIPLINE_META.throws;
    expect(
      sprint.naturals.forceVelocityBias! - throwing.naturals.forceVelocityBias!,
    ).toBeGreaterThan(12);
    expect(throwing.body.muscleIndex! - sprint.body.muscleIndex!).toBeGreaterThan(3);
    expect(throwing.massAffinity - sprint.massAffinity).toBeGreaterThan(1);
  });

  it('separates rowing from distance running on mass and on strength', () => {
    const row = DISCIPLINE_META.rowing;
    const run = DISCIPLINE_META.distanceRunning;
    expect(row.massAffinity - run.massAffinity).toBeGreaterThan(1.5);
    expect(row.body.frameIndex! - run.body.frameIndex!).toBeGreaterThan(10);
    expect((row.realises.strength ?? 0) - (run.realises.strength ?? 0)).toBeGreaterThan(0.03);
  });
});

describe('a secondary art is paid for out of the primary', () => {
  it('never adds to the total', () => {
    const division = asDivisionId('mens-lightweight');
    const pure: FighterBackground = { discipline: 'wrestling', attainment: 'regional' };
    const mixed: FighterBackground = {
      discipline: 'wrestling',
      secondary: 'boxing',
      attainment: 'regional',
    };
    const total = (b: FighterBackground) =>
      Object.values(realisationFor(b, division, 25)).reduce((a, v) => a + Math.abs(v), 0);
    // The mixed fighter's realisation is spread over more attributes and is smaller on wrestling.
    expect(realisationFor(mixed, division, 25).wrestling!).toBeLessThan(
      realisationFor(pure, division, 25).wrestling!,
    );
    expect(realisationFor(mixed, division, 25).strikingOffence!).toBeGreaterThan(
      realisationFor(pure, division, 25).strikingOffence!,
    );
    expect(total(mixed)).toBeGreaterThan(0);
  });
});
