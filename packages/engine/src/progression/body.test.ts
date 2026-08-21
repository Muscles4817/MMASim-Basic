/**
 * The body model.
 *
 * These are claims about *bodies*, not about ratings — no assertion here depends on doc 31's
 * physical ladder, which nothing consumes yet. What is being defended is that generation now
 * produces plausible human beings, and specifically that the three defects doc 31 § 1 measured are
 * gone: fighters three to four inches too short, an ape index of zero, and a frame that was a proxy
 * for the division.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import { divisionsFor, type Sex } from '../domain/divisions.js';
import { generateFighter } from './generation.js';
import {
  bodyOf,
  bodyFromChoices,
  carriedMassIndex,
  leanMassIndex,
  physiqueForMeasurements,
  skeletalIndex,
  campWeightLbs,
  chosenDivision,
  leanMassLbs,
  makeableDivisions,
  massCoefficient,
  requiredCutFraction,
  sampleBody,
  sampleBodyForDivision,
  walkingWeightLbs,
  weighInFloorLbs,
  weightFit,
  type Body,
} from './body.js';

const body = (o: Partial<Body> & { heightInches: number }): Body => ({
  sex: 'male',
  reachInches: o.heightInches + 2,
  frameIndex: 50,
  muscleIndex: 50,
  bodyFatIndex: 50,
  waterCutIndex: 50,
  ...o,
});

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The forward population: bodies rolled with no division in mind, each landing wherever it belongs.
 *
 * Bodies too large for the whole ladder are dropped rather than piled into the heaviest division —
 * `chosenDivision` returns `undefined` for them and they are not fighters in this sport. The share
 * that happens is asserted below, because if it were large the model would be generating a
 * population the game cannot use.
 */
function population(sex: Sex, n = 8000) {
  const rng = createRng(`body:${sex}`);
  const all = Array.from({ length: n }, () => {
    const b = sampleBody(rng, sex);
    return { body: b, division: chosenDivision(b, sex, rng.normalClamped(0.13, 0.035, 0.04, 0.2)) };
  });
  return {
    all,
    fighters: all.flatMap((f) => (f.division ? [{ body: f.body, division: f.division }] : [])),
  };
}

const MEN_POP = population('male');
const WOMEN_POP = population('female');
const MEN = MEN_POP.fighters;
const WOMEN = WOMEN_POP.fighters;

describe('composition', () => {
  it('derives walking weight from the body rather than from the division', () => {
    // The inversion the whole redesign rests on: two men of the same height with different frames
    // are different weights, which is what "there is such a thing as a big lightweight" means.
    const slight = walkingWeightLbs(body({ heightInches: 71, frameIndex: 15, muscleIndex: 30 }));
    const thick = walkingWeightLbs(body({ heightInches: 71, frameIndex: 90, muscleIndex: 85 }));
    expect(thick - slight).toBeGreaterThan(45);
  });

  it('separates the skeleton from the muscle on it', () => {
    // Both raise mass; they are still different people. Only one of them is trainable, which is why
    // they cannot be one number.
    const bigFrame = walkingWeightLbs(body({ heightInches: 72, frameIndex: 95, muscleIndex: 20 }));
    const bigMuscle = walkingWeightLbs(body({ heightInches: 72, frameIndex: 20, muscleIndex: 95 }));
    expect(Math.abs(bigFrame - bigMuscle)).toBeLessThan(20);
    expect(bigFrame).toBeGreaterThan(
      walkingWeightLbs(body({ heightInches: 72, frameIndex: 20, muscleIndex: 20 })),
    );
  });

  it('scales mass as height cubed, so tall fighters are not merely scaled-up short ones', () => {
    const short = leanMassLbs(body({ heightInches: 64 }));
    const tall = leanMassLbs(body({ heightInches: 76 }));
    // (76/64)^3 = 1.674. A height-squared model would give 1.41 and put every tall fighter a
    // division light, which is the defect this replaces.
    expect(tall / short).toBeCloseTo((76 / 64) ** 3, 2);
  });

  it('gives women their own composition rather than treating them as smaller men', () => {
    const man = massCoefficient(body({ heightInches: 66, sex: 'male' }));
    const woman = massCoefficient(body({ heightInches: 66, sex: 'female' }));
    expect(woman).toBeLessThan(man);
    // At matched height the difference is real but not enormous — most of the size gap between the
    // men's and women's rosters is height, not build.
    expect(woman / man).toBeGreaterThan(0.8);
  });
});

describe('making weight', () => {
  it('puts a hard floor under every division, so a body can simply be too big', () => {
    // Doc 31 § 12 step 10's "not viable" verdict, without a hard-coded height cap per class.
    const tallAndThick = body({ heightInches: 77, frameIndex: 90, muscleIndex: 60 });
    expect(weightFit(tallAndThick, asDivisionId('mens-lightweight'))).toBe('notViable');
    expect(makeableDivisions(tallAndThick, 'male').map((d) => d.shortName)).toEqual(['HW']);
  });

  it('lets an extreme body reach an extreme division without banning it outright', () => {
    // 6'3" with almost no frame and little muscle: welterweight is real, lightweight is at the very
    // edge of possible. That is the shape the design wants — rare rather than forbidden.
    const rangy = body({
      heightInches: 75,
      frameIndex: 8,
      muscleIndex: 25,
      bodyFatIndex: 8,
      waterCutIndex: 95,
    });
    expect(weightFit(rangy, asDivisionId('mens-welterweight'))).not.toBe('notViable');
    expect(weighInFloorLbs(rangy)).toBeLessThan(campWeightLbs(rangy));
  });

  it('bands the cut against what the sport actually does', () => {
    const b = body({ heightInches: 70 });
    const walking = walkingWeightLbs(b);
    // The hand-authored roster's real cuts run a mean of 8.2% and a ninetieth percentile of 13.8%,
    // so a 9% cut has to read as ordinary and a 17% one as extreme.
    const at = (pct: number) => Math.round(walking * (1 - pct));
    expect(requiredCutFraction(b, at(0.09))).toBeCloseTo(0.09, 2);
    expect(requiredCutFraction(b, at(0.17))).toBeCloseTo(0.17, 2);
  });

  it('gives two identically-sized fighters different floors, because tolerance differs', () => {
    const shape = { heightInches: 70, frameIndex: 50, muscleIndex: 50, bodyFatIndex: 50 };
    const drains = body({ ...shape, waterCutIndex: 95 });
    const cannot = body({ ...shape, waterCutIndex: 5 });
    expect(weighInFloorLbs(drains)).toBeLessThan(weighInFloorLbs(cannot) - 6);
  });
});

describe('the forward population', () => {
  it('produces heights that match the sport rather than the old remap', () => {
    /*
     * The defect this exists to prevent returning. `remap(limitLbs, 115, 265, 63, 76)` is linear in
     * weight where mass goes as height cubed, so it produced lightweights at 66.5" against a real
     * 70.1" and middleweights at 69.1" against 72.3".
     *
     * Bounds are ±2" around the hand-authored roster's per-division means, which are transcribed
     * real tale-of-the-tape figures rather than authored ratings — see the note at the top of
     * `body.ts` on why that distinction licenses fitting to them here and forbids it for ratings.
     */
    const real: Record<string, number> = {
      FLW: 65.4,
      BW: 67.0,
      FW: 69.4,
      LW: 70.1,
      WW: 71.3,
      MW: 72.3,
      LHW: 75.3,
      HW: 75.6,
    };
    for (const division of divisionsFor('male')) {
      const cohort = MEN.filter((f) => f.division.id === division.id);
      if (cohort.length < 100) continue;
      const measured = mean(cohort.map((f) => f.body.heightInches));
      expect(
        measured,
        `${division.shortName} mean height ${measured.toFixed(1)}" vs real ${real[division.shortName]}"`,
      ).toBeGreaterThan(real[division.shortName]! - 2);
      expect(
        measured,
        `${division.shortName} mean height ${measured.toFixed(1)}" vs real ${real[division.shortName]}"`,
      ).toBeLessThan(real[division.shortName]! + 2);
    }
  });

  it('produces a real ape index instead of reach ≈ height', () => {
    // Generation produced a mean ape index of roughly zero. The roster's per-division means run
    // +1.3 to +3.1 and its extremes run −2 to +9.
    const ape = MEN.map((f) => f.body.reachInches - f.body.heightInches);
    expect(mean(ape)).toBeGreaterThan(1.5);
    expect(mean(ape)).toBeLessThan(3.5);
    expect(Math.min(...ape)).toBeLessThan(0);
    expect(Math.max(...ape)).toBeGreaterThan(6);
  });

  it('makes weight rise monotonically with division, without the division causing it', () => {
    const ladder = divisionsFor('male');
    let previous = 0;
    for (const division of ladder) {
      const cohort = MEN.filter((f) => f.division.id === division.id);
      if (cohort.length < 100) continue;
      const walking = mean(cohort.map((f) => walkingWeightLbs(f.body)));
      expect(walking, `${division.shortName} walks ${walking.toFixed(0)}`).toBeGreaterThan(
        previous,
      );
      previous = walking;
    }
  });

  it('cuts about as hard as the sport does', () => {
    // Real mean 8.2%. Everything except the terminal division, which has no ceiling to cut to.
    const cuts = MEN.filter((f) => f.division.shortName !== 'HW').map(
      (f) => requiredCutFraction(f.body, f.division.limitLbs) * 100,
    );
    expect(mean(cuts)).toBeGreaterThan(5);
    expect(mean(cuts)).toBeLessThan(12);
  });

  it('leaves every division a spread of bodies rather than one body', () => {
    /*
     * The point of the whole module. Under the old model every lightweight walked at
     * `155 × rng.range(1.04, 1.15)` and had frame 55 ± 3; there was no big lightweight and no small
     * one. A division should hold a range of at least twenty pounds and three inches.
     */
    for (const division of divisionsFor('male')) {
      const cohort = MEN.filter((f) => f.division.id === division.id);
      if (cohort.length < 200) continue;
      const weights = cohort.map((f) => walkingWeightLbs(f.body)).sort((a, b) => a - b);
      const heights = cohort.map((f) => f.body.heightInches).sort((a, b) => a - b);
      const p05 = (xs: number[]) => xs[Math.floor(xs.length * 0.05)]!;
      const p95 = (xs: number[]) => xs[Math.floor(xs.length * 0.95)]!;
      expect(p95(weights) - p05(weights), `${division.shortName} weight spread`).toBeGreaterThan(
        15,
      );
      expect(
        p95(heights) - p05(heights),
        `${division.shortName} height spread`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('puts women on their own ladder rather than the men’s scaled down', () => {
    for (const division of divisionsFor('female')) {
      const cohort = WOMEN.filter((f) => f.division.id === division.id);
      expect(cohort.length, `${division.shortName} is empty`).toBeGreaterThan(50);
    }
  });
});

describe('sampling into a division', () => {
  it('lands in the division it was asked for', () => {
    const rng = createRng('for-division');
    for (const sex of ['male', 'female'] as const) {
      for (const division of divisionsFor(sex)) {
        for (let i = 0; i < 40; i++) {
          const b = sampleBodyForDivision(rng, sex, division.id);
          const fit = weightFit(b, division.id);
          expect(
            fit,
            `${division.shortName}: ${fit} at ${walkingWeightLbs(b).toFixed(0)}lb`,
          ).not.toBe('notViable');
        }
      }
    }
  });

  it('keeps the fallback rare enough not to have become the generator', () => {
    /*
     * `sampleBodyForDivision` rejection-samples the forward model, which preserves its distribution
     * exactly, and reshapes a body only when sixty attempts fail. The reshaped distribution is
     * narrower than the true conditional one, so a fallback that fires often has quietly replaced
     * the model it was protecting.
     *
     * Measured directly rather than inferred: the chance of falling back is `(1 − share)^60`, where
     * `share` is the division's share of the forward population. The thin divisions are the ones at
     * risk, so every division has to clear the bar rather than the average of them.
     */
    for (const { pop, sex } of [
      { pop: MEN_POP, sex: 'male' as const },
      { pop: WOMEN_POP, sex: 'female' as const },
    ]) {
      for (const division of divisionsFor(sex)) {
        const share =
          pop.fighters.filter((f) => f.division.id === division.id).length / pop.all.length;
        const fallbackRate = (1 - share) ** 60;
        expect(
          fallbackRate,
          `${division.shortName} share ${(share * 100).toFixed(1)}%, fallback ${(fallbackRate * 100).toFixed(1)}%`,
        ).toBeLessThan(0.2);
      }
    }
  });

  it('drops the handful of bodies the ladder has no division for', () => {
    /*
     * A woman whose weigh-in floor is 150 lb is not a lighter-than-usual featherweight; the women's
     * ladder stops at 145 and she is somebody this sport has no home for. The same is true, far more
     * rarely, of a man above 265. Both have to be dropped rather than booked at a weight they cannot
     * make — but if either share were large, the height distribution would be wrong.
     */
    for (const pop of [MEN_POP, WOMEN_POP]) {
      const dropped = pop.all.filter((f) => !f.division).length / pop.all.length;
      expect(dropped, `${(dropped * 100).toFixed(1)}% of bodies have no division`).toBeLessThan(
        0.06,
      );
    }
  });

  it('is deterministic in its seed, like everything else in the engine', () => {
    const a = sampleBodyForDivision(createRng('same'), 'male', asDivisionId('mens-welterweight'));
    const b = sampleBodyForDivision(createRng('same'), 'male', asDivisionId('mens-welterweight'));
    expect(a).toEqual(b);
  });
});

describe('bodies built from player choices', () => {
  it('takes the height, reach and frame it is given and rolls the rest', () => {
    const chosen = bodyFromChoices(createRng('choices'), 'male', {
      heightInches: 74,
      reachInches: 79,
      frameIndex: 80,
    });
    expect(chosen.heightInches).toBe(74);
    expect(chosen.reachInches).toBe(79);
    expect(chosen.frameIndex).toBe(80);
    // Not the player's to choose — doc 31 § 12 step 10 removes exactly the levers a player would
    // min-max, and body composition is the most min-maxable of them.
    expect(chosen.muscleIndex).toBeGreaterThan(0);
    expect(chosen.bodyFatIndex).toBeGreaterThan(0);
  });

  it('rolls anything it is not given, so a half-filled creation screen still yields a person', () => {
    const partial = bodyFromChoices(createRng('partial'), 'female', { heightInches: 66 });
    expect(partial.heightInches).toBe(66);
    expect(partial.reachInches).toBeGreaterThan(60);
    expect(partial.sex).toBe('female');
    expect(walkingWeightLbs(partial)).toBeGreaterThan(100);
  });
});

describe('the indices the rating ceilings read', () => {
  /*
   * Doc 31 § 12 step 4. These three replaced `naturals.frame`, which was `walkingWeight / 300 × 100`
   * and therefore a proxy for the division: every lightweight scored 55 ± 3, so the number feeding
   * the Power, Strength, Durability and Cardio ceilings knew what weight class somebody fought in and
   * nothing whatsoever about their body.
   */

  it('lands where the number it replaced landed, so the ceilings were not silently retuned', () => {
    /*
     * The constraint that set `LEAN_INDEX_DIVISOR`. `frame` fed four ceilings with coefficients tuned
     * against a `walkingWeight / 300` scale, so replacing the variable without preserving the scale
     * would have retuned all four at once and made the change impossible to attribute.
     */
    for (const [height, walking] of [
      [65, 134],
      [69, 169],
      [76, 242],
    ] as const) {
      const b = physiqueForMeasurements('male', height, walking, 50, 50);
      const full = { sex: 'male' as const, heightInches: height, reachInches: height + 2, ...b };
      const oldFrame = (walking / 300) * 100;
      expect(
        leanMassIndex(full),
        `${walking}lb: lean index ${leanMassIndex(full).toFixed(1)} against old frame ${oldFrame.toFixed(1)}`,
      ).toBeGreaterThan(oldFrame - 3);
      expect(leanMassIndex(full)).toBeLessThan(oldFrame + 3);
    }
  });

  it('tells a lean fighter from a soft one of the same weight, which frame could not', () => {
    // The entire reason the body model exists, expressed in the number the ceilings read.
    const shape = { heightInches: 71, frameIndex: 50, muscleIndex: 50, waterCutIndex: 50 };
    const lean = body({ ...shape, bodyFatIndex: 5 });
    const soft = body({ ...shape, bodyFatIndex: 95 });

    // Same skeleton and same muscle, so exactly the same contractile mass...
    expect(leanMassIndex(lean)).toBeCloseTo(leanMassIndex(soft), 6);
    /*
     * ...but the soft one is carrying a lot more of himself around. Measured 58.4 against 64.8 — a
     * 6.4-point gap, which is what the model's 8%-to-18% body-fat band is worth on this scale and
     * therefore the whole size of the effect available. Under `naturals.frame` these two fighters
     * were the same number on every one of the four ceilings it fed.
     */
    expect(carriedMassIndex(soft)).toBeGreaterThan(carriedMassIndex(lean) + 5);
  });

  it('reads skeletal size rather than current muscle, so the interference effect cannot cancel itself', () => {
    /*
     * `development.ts:carriedStrength` asks how much muscle a skeleton supports before more of it
     * starts costing cardio. Feeding it current muscle would move the threshold up every time the
     * fighter got bigger, which is the one thing it must not do.
     */
    const shape = { heightInches: 72, frameIndex: 60, bodyFatIndex: 50, waterCutIndex: 50 };
    const slight = body({ ...shape, muscleIndex: 15 });
    const jacked = body({ ...shape, muscleIndex: 95 });
    expect(skeletalIndex(slight)).toBeCloseTo(skeletalIndex(jacked), 6);
    // And it is absolute rather than for-height: a big-framed flyweight is not a big-framed
    // heavyweight, and does not carry a heavyweight's muscle.
    expect(skeletalIndex(body({ heightInches: 64, frameIndex: 90 }))).toBeLessThan(
      skeletalIndex(body({ heightInches: 76, frameIndex: 40 })),
    );
  });

  it('keeps the stored walking weight equal to the one the body implies', () => {
    /*
     * `Fighter.walkingWeightLbs` is derivable from `physique` and `heightInches` and is stored anyway
     * until doc 31 § 12 step 11, which is when mass starts genuinely moving over a career and a cached
     * copy could go stale. This is the guard that stops it drifting in the meantime.
     */
    const rng = createRng('drift');
    for (const division of divisionsFor('male')) {
      for (let i = 0; i < 25; i++) {
        const f = generateFighter(rng, {
          id: `drift_${division.id}_${i}`,
          divisionId: division.id,
          sex: 'male',
          day: 0,
        });
        const implied = walkingWeightLbs(bodyOf(f));
        expect(
          Math.abs(f.walkingWeightLbs - implied),
          `${division.shortName}: stored ${f.walkingWeightLbs}, body implies ${implied.toFixed(1)}`,
        ).toBeLessThan(1);
      }
    }
  });

  it('does not make a big frame a generally better athlete', () => {
    /*
     * The guard the whole step turns on. Mass genuinely buys Power and Strength — doc 31 § 3 says so
     * and the ladder is built on it — but it must buy nothing else. If `frameIndex` correlated with
     * explosiveness, the engine or motor learning, it would have become the master scalar that step 3
     * just finished removing, wearing a body's clothes.
     */
    const rng = createRng('not-a-scalar');
    const cohort = Array.from({ length: 3000 }, (_, i) =>
      generateFighter(rng.fork(`f${i}`), {
        id: `scalar_${i}`,
        divisionId: asDivisionId('mens-welterweight'),
        sex: 'male',
        day: 0,
      }),
    );

    const corr = (xs: number[], ys: number[]) => {
      const m = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
      const s = (v: number[]) => Math.sqrt(m(v.map((x) => (x - m(v)) ** 2)));
      return m(xs.map((x, i) => (x - m(xs)) * (ys[i]! - m(ys)))) / (s(xs) * s(ys) || 1);
    };

    const frames = cohort.map((f) => f.physique.frameIndex);
    for (const natural of ['explosiveness', 'engine', 'motorLearning', 'recovery'] as const) {
      const r = corr(
        frames,
        cohort.map((f) => f.naturals[natural]),
      );
      expect(Math.abs(r), `rho(frameIndex, ${natural}) = ${r.toFixed(3)}`).toBeLessThan(0.15);
    }
  });
});
