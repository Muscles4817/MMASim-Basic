/**
 * The physical ladder, printed.
 *
 * Doc 31 § 10.5. The percentile tables in that document's § 4.1 and § 4.3 are **output**, not text —
 * this file computes them from the ten parameters in `physicalScale.ts` and prints them on every
 * run, for both sexes and both populations.
 *
 * Two reasons that matters more than it looks. A hand-typed table drifts from the parameters the
 * moment one of them moves, and then the document lies — which is exactly how a scale ends up
 * justified by a table that was justified by the scale. And when a calibration-sensitive parameter
 * (doc 31 § 8.4) does move, the tables move with it in the same commit, so a reviewer sees the
 * consequence of the change rather than the change alone.
 *
 * The assertions are deliberately **structural** rather than numeric. They fail when the ladder
 * becomes incoherent — a division strictly dominating another, a value off the end of the scale, the
 * spread collapsing — and not merely when it is retuned, because retuning it is the plan.
 *
 * Nothing here touches the fight engine. Doc 31's sequencing rule holds until body geometry is
 * finished: the ladder cannot be judged against a half-built body model.
 */

import { describe, expect, it } from 'vitest';
import {
  ELITE_LIFT,
  PIVOT_LEAN_FRACTION,
  PHYSICAL_SCALE_KEYS,
  calibrationSensitiveParameters,
  divisionsFor,
  medianRatingAtMass,
  quantityMultiple,
  ratingSd,
  type PhysicalScaleKey,
  type Sex,
} from '@mmasim/engine';

/**
 * Walking weight the median professional of each division carries.
 *
 * Measured off the forward body model in `body.ts` rather than assumed — see
 * `generation-profile.test.ts`, which prints what generation actually produces. Rounded here because
 * a table is being drawn, not a simulation run.
 */
const WALKING: Readonly<Record<string, number>> = {
  FLW: 133,
  BW: 147,
  FW: 158,
  LW: 169,
  WW: 183,
  MW: 199,
  LHW: 217,
  HW: 242,
  WSW: 121,
  WFLW: 136,
  WBW: 147,
  WFW: 163,
};

/**
 * Lean fraction of a division's median fighter.
 *
 * Anchored on `PIVOT_LEAN_FRACTION`, which is where the scale measures from, and nudged down at the
 * top of the men's ladder because heavyweight is the one division with no ceiling and its fighters
 * carry some of their extra mass as fat.
 */
const leanFraction = (walkingLbs: number, sex: Sex): number =>
  sex === 'male' && walkingLbs > 210 ? PIVOT_LEAN_FRACTION.male - 0.03 : PIVOT_LEAN_FRACTION[sex];

const Z = { p05: -1.645, p25: -0.674, p50: 0, p75: 0.674, p95: 1.645, bestOfDivision: 2.04 };

function ratings(key: PhysicalScaleKey, sex: Sex, walking: number, elite: boolean) {
  const lean = walking * leanFraction(walking, sex);
  const mu = medianRatingAtMass(key, sex, walking, lean) + (elite ? ELITE_LIFT[key] : 0);
  const sd = ratingSd(key);
  return {
    mu,
    sd,
    at: (z: number) => mu + z * sd,
  };
}

function printLadder(sex: Sex, elite: boolean) {
  const label = `${sex === 'male' ? 'MEN' : 'WOMEN'} — ${elite ? 'major-promotion level' : 'whole professional population'}`;
  const lines: string[] = [`\n=== ${label} ===`];
  lines.push(
    'division'.padEnd(10) +
      'walks'.padStart(6) +
      PHYSICAL_SCALE_KEYS.map((k) => k.padStart(12)).join(''),
  );
  for (const division of divisionsFor(sex)) {
    const walking = WALKING[division.shortName];
    if (walking === undefined) continue;
    lines.push(
      division.shortName.padEnd(10) +
        String(walking).padStart(6) +
        PHYSICAL_SCALE_KEYS.map((k) =>
          String(Math.round(ratings(k, sex, walking, elite).mu)).padStart(12),
        ).join(''),
    );
  }
  return lines.join('\n');
}

function printPercentiles(sex: Sex) {
  const lines: string[] = [
    `\n=== ${sex === 'male' ? 'MEN' : 'WOMEN'} — major-promotion percentiles ===`,
  ];
  for (const key of PHYSICAL_SCALE_KEYS) {
    lines.push(
      `\n${key.toUpperCase()}  (sd ${ratingSd(key).toFixed(1)}, lift +${ELITE_LIFT[key]})`,
    );
    lines.push(
      'div'.padEnd(7) +
        ['p05', 'p25', 'p50', 'p75', 'p95', 'best/div'].map((s) => s.padStart(10)).join(''),
    );
    for (const division of divisionsFor(sex)) {
      const walking = WALKING[division.shortName];
      if (walking === undefined) continue;
      const r = ratings(key, sex, walking, true);
      lines.push(
        division.shortName.padEnd(7) +
          Object.values(Z)
            .map((z) => String(Math.round(r.at(z))).padStart(10))
            .join(''),
      );
    }
  }
  return lines.join('\n');
}

describe('the physical ladder', () => {
  it('prints itself, so the document cannot drift from the parameters', () => {
    console.log(printLadder('male', false));
    console.log(printLadder('female', false));
    console.log(printLadder('male', true));
    console.log(printLadder('female', true));
    console.log(printPercentiles('male'));
    console.log(printPercentiles('female'));

    console.log('\n=== landmark ratings, as a multiple of the median professional ===');
    console.log('rating'.padEnd(8) + PHYSICAL_SCALE_KEYS.map((k) => k.padStart(12)).join(''));
    for (const r of [0, 25, 50, 75, 90, 95, 99, 100]) {
      console.log(
        String(r).padEnd(8) +
          PHYSICAL_SCALE_KEYS.map((k) => `${quantityMultiple(k, r).toFixed(2)}x`.padStart(12)).join(
            '',
          ),
      );
    }

    console.log('\n=== held as hypotheses (doc 31 § 8.4) ===');
    for (const { key, why } of calibrationSensitiveParameters()) console.log(`${key}: ${why}`);
  });

  it('keeps one standard deviation near ten points on every attribute', () => {
    /*
     * Nobody chose this and it is the document's best internal consistency check: `D` was set per
     * attribute from range and knockout evidence, `CV` comes from the underlying physiological
     * variation, and `D · log₂(1 + CV)` lands within 1.6 points across all five.
     *
     * It is what makes the scale readable — +10 is notably better, +20 is best in the division, +30
     * is one of the best in the sport, on any attribute anywhere — so if a retune breaks the
     * agreement, that property is quietly gone and somebody should have to say so out loud.
     */
    const sds = PHYSICAL_SCALE_KEYS.map(ratingSd);
    for (const [i, sd] of sds.entries()) {
      expect(sd, `${PHYSICAL_SCALE_KEYS[i]} sd ${sd.toFixed(1)}`).toBeGreaterThan(8);
      expect(sd, `${PHYSICAL_SCALE_KEYS[i]} sd ${sd.toFixed(1)}`).toBeLessThan(14);
    }
    expect(Math.max(...sds) - Math.min(...sds)).toBeLessThan(4);
  });

  it('never lets a division strictly dominate another on any attribute', () => {
    /*
     * The line between a ladder and a lookup table. Heavyweights should dominate the Power tail and
     * flyweights the Speed tail, and it must still be possible for a freakish heavyweight to be
     * quicker than an ordinary lightweight. If every featherweight is faster than every middleweight,
     * the model has stopped describing people.
     */
    for (const sex of ['male', 'female'] as const) {
      const divisions = divisionsFor(sex).filter((d) => WALKING[d.shortName] !== undefined);
      for (const key of PHYSICAL_SCALE_KEYS) {
        for (const lighter of divisions) {
          for (const heavier of divisions) {
            if (lighter.order >= heavier.order) continue;
            const a = ratings(key, sex, WALKING[lighter.shortName]!, true);
            const b = ratings(key, sex, WALKING[heavier.shortName]!, true);
            const overlap = Math.min(a.at(Z.p95), b.at(Z.p95)) - Math.max(a.at(Z.p05), b.at(Z.p05));
            expect(
              overlap,
              `${key}: ${lighter.shortName} and ${heavier.shortName} do not overlap`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('fits the whole sport inside the scale, with the top of it reserved', () => {
    /*
     * The constraint that set `D_strength` at 46 rather than 50: at 50 the expected strongest
     * heavyweight landed at 100.3, so the scale overflowed at exactly the point it is meant to top
     * out. The best of a thirty-fighter division must stay under 96, leaving 96–100 for the one or
     * two fighters a generation who genuinely belong there.
     */
    for (const sex of ['male', 'female'] as const) {
      for (const division of divisionsFor(sex)) {
        const walking = WALKING[division.shortName];
        if (walking === undefined) continue;
        for (const key of PHYSICAL_SCALE_KEYS) {
          const r = ratings(key, sex, walking, true);
          const best = r.at(Z.bestOfDivision);
          expect(best, `${sex} ${division.shortName} best ${key} ${best.toFixed(0)}`).toBeLessThan(
            96,
          );
          const worst = r.at(Z.p05);
          expect(
            worst,
            `${sex} ${division.shortName} p05 ${key} ${worst.toFixed(0)}`,
          ).toBeGreaterThan(1);
        }
      }
    }
  });

  it('keeps the sexes on their own pivots and the technical attributes off them', () => {
    // Doc 31 § 2.3. Within a sex the scale is strictly absolute across every division; sex is the one
    // deliberate exception, and it applies to these five attributes and to nothing else.
    expect(PHYSICAL_SCALE_KEYS).toHaveLength(5);
    for (const key of PHYSICAL_SCALE_KEYS) {
      const menAtPivot = medianRatingAtMass(key, 'male', 180, 180 * PIVOT_LEAN_FRACTION.male);
      const womenAtPivot = medianRatingAtMass(key, 'female', 140, 140 * PIVOT_LEAN_FRACTION.female);
      expect(menAtPivot).toBeCloseTo(50, 6);
      expect(womenAtPivot).toBeCloseTo(50, 6);
    }
  });

  it('still marks the strength and durability parameters as hypotheses', () => {
    // Doc 31 § 8.4. If somebody settles one of these, they should have to delete the marker
    // deliberately rather than let it lapse.
    const held = calibrationSensitiveParameters().map((p) => p.key);
    expect(held).toContain('strength');
    expect(held).toContain('durability');
  });

  it('holds the strength spread at the value the sign-off froze it at', () => {
    /*
     * 28 points from flyweight to heavyweight. Doc 31 § 8.4 is explicit that this is a hypothesis and
     * that it may only move on the controlled experiments in § 9.1 — never against the hand-authored
     * roster, whose 11 points were authored on a division-relative reading of the scale.
     *
     * The bound is therefore not a claim that 28 is right. It is a tripwire: a change that shrinks
     * the spread has to edit this line, and editing this line means saying which experiment moved it.
     */
    const flw = medianRatingAtMass(
      'strength',
      'male',
      WALKING.FLW!,
      WALKING.FLW! * leanFraction(WALKING.FLW!, 'male'),
    );
    const hw = medianRatingAtMass(
      'strength',
      'male',
      WALKING.HW!,
      WALKING.HW! * leanFraction(WALKING.HW!, 'male'),
    );
    const spread = hw - flw;
    expect(spread, `strength spread ${spread.toFixed(1)} points`).toBeGreaterThan(25);
    expect(spread, `strength spread ${spread.toFixed(1)} points`).toBeLessThan(31);
  });
});
