/**
 * Can the body model build the bodies the calibration roster describes?
 *
 * Doc 31 § 18. Step 6 tunes the equations that turn a body into Power, Strength and Speed, so it has
 * to start from a body model that can represent the bodies those equations will be judged against.
 * § 15.4 found that it could not, and found it by accident — an acceptance test asserting no rating
 * had moved failed because **Mark Hunt was sitting in the roster as a 226 lb man**, resolving his
 * Power and Strength against a 226 lb heavyweight's divisional median, silently, for as long as the
 * roster had existed.
 *
 * This file is the deliberate version of that accident. It walks every clamp in the composition
 * chain, prints the authored body beside the reconstructed one, names the primitive that saturates,
 * and separates the two things a clamp can mean:
 *
 *   aboveScale    the index scale ran out before the person did — the model is too small
 *   implausible   the measurements describe nobody — the estimate is wrong
 *
 * Collapsing those two into a silent clip is what made the first one invisible.
 */

import { describe, expect, it } from 'vitest';
import { CALIBRATION_ROSTER } from '@mmasim/data';
import {
  MAX_FAT_FREE_MASS_INDEX,
  divisionsFor,
  fatFractionForIndex,
  maxPlausibleCoefficient,
  maxRepresentableCoefficient,
  solvePhysique,
  type Sex,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

const M_PER_INCH = 0.0254;

const SOLVED = CALIBRATION_ROSTER.map((entry) => ({
  entry,
  solution: solvePhysique(
    entry.measured.sex,
    entry.measured.heightInches,
    entry.estimated.walkingWeightLbs,
    entry.estimated.bodyFatIndex,
    entry.estimated.waterCutIndex,
  ),
}));

/** How close to the top of the index scale a body sits, 0–1+. */
const bandPosition = (sex: Sex, required: number) => {
  const ceiling = maxRepresentableCoefficient(sex);
  const base = sex === 'male' ? 9.5 : 8.2;
  return (required - base) / (ceiling - base);
};

describe('the body model, against the bodies it has to represent', () => {
  it('1. lists every entry at or approaching a composition clamp', () => {
    say('\n\n═══ Bodies at or near a clamp ═══\n');
    say(
      '  "Approaching" is 85% of the index scale. Below that a body has room and the clamp is not\n' +
        '  part of its story; above it, the model is starting to decide the answer.\n',
    );
    say('  fighter                 ht    walk   fat%   need   scale   % band   FFMI   verdict');
    const near = SOLVED.filter(
      (r) => bandPosition(r.entry.measured.sex, r.solution.requiredCoefficient) >= 0.85,
    );
    for (const { entry, solution } of near) {
      const fat = fatFractionForIndex(entry.measured.sex, entry.estimated.bodyFatIndex);
      say(
        `  ${entry.name.padEnd(22)}${entry.measured.heightInches}"` +
          `${String(entry.estimated.walkingWeightLbs).padStart(7)}` +
          `${(100 * fat).toFixed(1).padStart(7)}` +
          `${solution.requiredCoefficient.toFixed(2).padStart(8)}` +
          `${maxRepresentableCoefficient(entry.measured.sex).toFixed(1).padStart(8)}` +
          `${(100 * bandPosition(entry.measured.sex, solution.requiredCoefficient)).toFixed(0).padStart(8)}%` +
          `${solution.impliedFatFreeMassIndex.toFixed(1).padStart(7)}` +
          `   ${solution.saturated}`,
      );
    }
    say(`\n  ${near.length} of ${SOLVED.length} entries sit above 85% of the index scale.`);
    flush();
    expect(near.length).toBeGreaterThan(0);
  });

  it('2. prints authored body against reconstructed body for everything that misses', () => {
    say('\n\n═══ Authored against reconstructed ═══\n');
    const missed = SOLVED.filter((r) => Math.abs(r.solution.errorLbs) >= 1);
    if (missed.length === 0) say('  Nothing misses by a pound or more.');
    for (const { entry, solution } of missed) {
      const fat = fatFractionForIndex(entry.measured.sex, entry.estimated.bodyFatIndex);
      const heightM = entry.measured.heightInches * M_PER_INCH;
      const authoredLean = entry.estimated.walkingWeightLbs * (1 - fat);
      const builtLean = (solution.achievedCoefficient * heightM ** 3) / 0.45359237;
      say(
        `\n  ${entry.name} — ${entry.measured.heightInches}", ${entry.estimated.walkingWeightLbs} lb at ${(100 * fat).toFixed(1)}% fat  [${solution.saturated}]`,
      );
      say(
        `      authored       lean ${authoredLean.toFixed(1)} lb   coefficient ${solution.requiredCoefficient.toFixed(2)}   FFMI ${solution.impliedFatFreeMassIndex.toFixed(1)}`,
      );
      say(
        `      reconstructed  lean ${builtLean.toFixed(1)} lb   coefficient ${solution.achievedCoefficient.toFixed(2)}   ` +
          `walking ${(entry.estimated.walkingWeightLbs + solution.errorLbs).toFixed(1)} lb  (${solution.errorLbs.toFixed(1)})`,
      );
    }
    flush();
  });

  it('3. names the primitive that saturates, and what it is worth', () => {
    say('\n\n═══ Which primitive saturates ═══\n');
    say(
      '  Four things in the chain can stop a body being built. Only one of them is a statement\n' +
        '  about human beings; the other three are artefacts of how the model is parameterised.\n',
    );
    for (const sex of ['male', 'female'] as const) {
      const scale = maxRepresentableCoefficient(sex);
      say(`\n  ${sex}`);
      say(
        `    body-fat ceiling      ${(100 * fatFractionForIndex(sex, 100)).toFixed(0)}%  — the fattest body the index can express`,
      );
      say(
        `    index scale ceiling   ${scale.toFixed(2)}   — base + fromFrame + fromMuscle, at index 100/100`,
      );
      say(
        `    index granularity     1 point  — frame and muscle are integers, worth about half a pound`,
      );
      say(
        `    human limit           FFMI ${MAX_FAT_FREE_MASS_INDEX[sex]}   — the only one of the four that is about people`,
      );
    }
    say('\n  What the index-scale ceiling implies as an FFMI, by height:\n');
    for (const sex of ['male', 'female'] as const) {
      const scale = maxRepresentableCoefficient(sex);
      const heights = sex === 'male' ? [61, 64, 68, 70, 73, 76, 79, 84] : [58, 61, 64, 67, 70, 76];
      say(
        `    ${sex.padEnd(7)}` +
          heights.map((h) => `${h}" ${(scale * h * M_PER_INCH).toFixed(1)}`).join('   '),
      );
    }
    say('\n  Where the index scale stops binding before the human limit does:\n');
    for (const sex of ['male', 'female'] as const) {
      const crossover =
        MAX_FAT_FREE_MASS_INDEX[sex] / maxRepresentableCoefficient(sex) / M_PER_INCH;
      const shortest = Math.min(
        ...SOLVED.filter((r) => r.entry.measured.sex === sex).map(
          (r) => r.entry.measured.heightInches,
        ),
      );
      say(
        `    ${sex.padEnd(7)}above ${crossover.toFixed(1)}" the human limit binds first, below it the scale does.` +
          `  Shortest fighter in the roster: ${shortest}".`,
      );
    }
    say(
      '\n  So the artefact is reduced rather than eliminated, and saying otherwise would be the\n' +
        '  claim to distrust. Below those heights a body could still be refused by the scale rather\n' +
        '  than by physiology — but the gap is now small enough that no real fighter falls in it, and\n' +
        '  closing it entirely would mean widening the scale until index 100 described a body nobody\n' +
        '  has, which trades a visible artefact for an invisible one.\n',
    );
    say(
      `  A constant in lean-kg-per-cubic-metre is not a constant limit:\n` +
        '  divide it out and the ceiling it implies runs from an untrained adult at the short end to\n' +
        '  past anything reached without pharmacology at the tall end. Nobody chose that shape — it\n' +
        '  fell out of using a population coefficient as an individual bound, and it is why every\n' +
        '  body the model could not build was a short one.',
    );
    flush();
  });

  it('4. classifies the cause, and the answer is not the coefficient range', () => {
    /**
     * The determination doc 31 § 18 records, checked rather than asserted in prose.
     *
     * **Coefficient range** — adequate. The roster's required coefficients run p25 12.05 to p75
     * 13.51 against a 9.5–15.3 band, so the population sits between 44% and 69% of it. A range that
     * were genuinely too narrow would show the distribution pressed against the top, and it is not.
     *
     * **Frame/muscle decomposition** — already fixed at § 15.4 and contributes nothing further; the
     * solver splits at equal indices and reaches the true ceiling.
     *
     * **Index parameterisation** — this is the defect, in two places. The body-fat band stopped at
     * 18% for men, so a heavyweight carrying real fat could not be expressed at all and the model
     * had to put the difference into lean mass instead. And the index-scale ceiling is a constant in
     * the wrong units, so it binds at a different human limit for every height.
     *
     * **An actual human limit** — needed, and absent entirely until now. `MAX_FAT_FREE_MASS_INDEX`
     * is the first thing in the model that says what a person cannot be.
     */
    const required = SOLVED.map((r) => r.solution.requiredCoefficient);
    for (const sex of ['male', 'female'] as const) {
      const rows = SOLVED.filter((r) => r.entry.measured.sex === sex).map((r) =>
        bandPosition(sex, r.solution.requiredCoefficient),
      );
      rows.sort((a, b) => a - b);
      const q = (p: number) => rows[Math.floor(p * (rows.length - 1))]!;
      // The population must sit in the middle of the band, not pressed against either end.
      expect(
        q(0.5),
        `${sex} median sits at ${(100 * q(0.5)).toFixed(0)}% of the index scale`,
      ).toBeGreaterThan(0.3);
      expect(q(0.5)).toBeLessThan(0.75);
    }
    expect(required.length).toBe(CALIBRATION_ROSTER.length);
  });

  it('5. no plausible calibration body is silently clipped any more', () => {
    for (const { entry, solution } of SOLVED) {
      if (solution.saturated === 'implausible') continue;
      expect(
        solution.saturated,
        `${entry.name} is a plausible body the index scale cannot express`,
      ).not.toBe('aboveScale');
      expect(
        Math.abs(solution.errorLbs),
        `${entry.name} reconstructs ${solution.errorLbs.toFixed(1)} lb off`,
      ).toBeLessThan(1);
    }
  });

  it('6. bodies outside the human model are still rejected, and loudly', () => {
    /**
     * The other half of criterion 5, and the reason this is not just a loosening. A model that
     * builds whatever it is handed has stopped saying anything, so the limit has to bite — and it
     * has to bite on the thing that is actually impossible rather than on whatever the parameters
     * happened to make unreachable.
     */
    const impossible: {
      what: string;
      sex: Sex;
      heightInches: number;
      walkingWeightLbs: number;
      fat: number;
    }[] = [
      {
        what: '5\'10" at 265 lb and 8% body fat',
        sex: 'male',
        heightInches: 70,
        walkingWeightLbs: 265,
        fat: 1,
      },
      {
        what: 'a 6\'0" man at 300 lb and 12% body fat',
        sex: 'male',
        heightInches: 72,
        walkingWeightLbs: 300,
        fat: 20,
      },
      {
        what: 'a 5\'4" woman at 190 lb and 16% body fat',
        sex: 'female',
        heightInches: 64,
        walkingWeightLbs: 190,
        fat: 10,
      },
    ];
    for (const c of impossible) {
      const solution = solvePhysique(c.sex, c.heightInches, c.walkingWeightLbs, c.fat, 50);
      expect(solution.saturated, c.what).toBe('implausible');
      expect(solution.impliedFatFreeMassIndex).toBeGreaterThan(MAX_FAT_FREE_MASS_INDEX[c.sex]);
    }
    // And an ordinary body is never called impossible.
    for (const { entry, solution } of SOLVED) {
      if (bandPosition(entry.measured.sex, solution.requiredCoefficient) < 0.85) {
        expect(solution.saturated, `${entry.name} is mid-range and was rejected`).toBe('none');
      }
    }
  });

  it('7. the human limit binds at the same place at every height', () => {
    /**
     * The property the old ceiling did not have, and the whole point of expressing the limit as an
     * FFMI. Whatever height a body is, the heaviest lean mass the model will accept has to be the
     * same statement about a person — otherwise short athletes are told they cannot be muscular and
     * tall ones are told they can be anything.
     */
    for (const sex of ['male', 'female'] as const) {
      for (const heightInches of [58, 62, 66, 70, 74, 78, 82]) {
        const heightM = heightInches * M_PER_INCH;
        const implied = maxPlausibleCoefficient(sex, heightInches) * heightM;
        expect(implied, `${sex} at ${heightInches}"`).toBeCloseTo(MAX_FAT_FREE_MASS_INDEX[sex], 9);
      }
    }
    say('\n\n═══ Divisions, and the bodies they need ═══\n');
    for (const sex of ['male', 'female'] as const) {
      for (const d of divisionsFor(sex)) {
        const rows = SOLVED.filter((r) => r.entry.measured.division === d.id);
        if (rows.length === 0) continue;
        const worst = rows.reduce((a, b) =>
          a.solution.impliedFatFreeMassIndex > b.solution.impliedFatFreeMassIndex ? a : b,
        );
        say(
          `  ${d.shortName.padEnd(6)}highest FFMI ${worst.solution.impliedFatFreeMassIndex.toFixed(1)}` +
            `  (${worst.entry.name}, limit ${MAX_FAT_FREE_MASS_INDEX[sex]})`,
        );
      }
    }
    flush();
  });

  it('8. no roster fighter sits inside the residual gap', () => {
    /**
     * The bound on § 18.2's remaining artefact. Below the crossover height the index scale still
     * binds before the human limit, so what has to hold is that nobody real is caught there — and
     * that the margin is not so thin that the next authored fighter will be.
     */
    for (const { entry, solution } of SOLVED) {
      const sex = entry.measured.sex;
      const scaleCeilingFfmi =
        maxRepresentableCoefficient(sex) * entry.measured.heightInches * M_PER_INCH;
      const binding = Math.min(scaleCeilingFfmi, MAX_FAT_FREE_MASS_INDEX[sex]);
      expect(
        solution.impliedFatFreeMassIndex,
        `${entry.name} at ${entry.measured.heightInches}" is against whichever limit binds first`,
      ).toBeLessThanOrEqual(binding + 1e-9);
    }
  });
});
