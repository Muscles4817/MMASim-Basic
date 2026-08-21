/**
 * The body model, as a single canonical snapshot.
 *
 * Taken immediately after doc 31 § 12 step 4 landed and before step 5 begins, for one reason: the
 * next layers of the plan change **how the body is fed** rather than what the body model does. Step
 * 9 gives sporting backgrounds a body prior — a rugby forward carrying more mass for his height than
 * a distance runner — and step 11 makes mass move over a career. Both act on this model through
 * inputs it does not currently have, so without a reading taken while nothing else is moving there
 * is no way to attribute what they change.
 *
 * `generation-profile.test.ts` reports what *generation* produces and asserts that it is sane; this
 * file reports what the **body model itself** produces and asserts almost nothing. That division is
 * deliberate. A baseline whose bounds fail every time the model is deliberately improved stops being
 * a baseline and becomes an obstacle, so what is asserted here is only the handful of invariants
 * that would mean the model had become incoherent rather than merely different — mass rising with
 * height, lean never exceeding carried, the weigh-in floor never above camp weight.
 *
 * The numbers themselves live in the run output, and the table in doc 31 § 13.7 is a transcription
 * of one run of it. When a later step moves them, the honest thing is to re-run this, paste the new
 * table beside the old one, and say which change did it.
 */

import { describe, expect, it } from 'vitest';
import {
  bodyFatFraction,
  campWeightLbs,
  carriedMassIndex,
  chosenDivision,
  createRng,
  divisionsFor,
  leanMassIndex,
  leanMassLbs,
  massCoefficient,
  cutRequiredFraction,
  underLimitLbs,
  sampleBody,
  sampleCutTolerance,
  skeletalIndex,
  walkingWeightLbs,
  weighInFloorLbs,
  type Body,
  type Division,
  type Sex,
} from '@mmasim/engine';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
const band = (xs: number[]) => `${pct(xs, 0.05).toFixed(0)}-${pct(xs, 0.95).toFixed(0)}`;

/**
 * The forward population: bodies rolled with no division in mind, each landing where it belongs.
 *
 * The same construction `body.test.ts` uses, because this has to be a reading of the model rather
 * than of a second model that happens to live in a test file. Bodies the ladder has no division for
 * are dropped — see `chosenDivision`.
 */
function population(sex: Sex, n = 40_000) {
  const rng = createRng(`baseline:${sex}`);
  const rows: { body: Body; division: Division }[] = [];
  let orphaned = 0;
  for (let i = 0; i < n; i++) {
    const body = sampleBody(rng, sex);
    const division = chosenDivision(body, sex, sampleCutTolerance(rng));
    if (division) rows.push({ body, division });
    else orphaned++;
  }
  return { rows, orphaned, n };
}

const POPULATIONS = {
  male: population('male'),
  female: population('female'),
} as const;

const cohort = (sex: Sex, division: Division) =>
  POPULATIONS[sex].rows.filter((r) => r.division.id === division.id).map((r) => r.body);

describe('the body model, as it stands after step 4', () => {
  it('prints geometry by sex and division', () => {
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — geometry ===`);
      console.log(
        'div'.padEnd(7) +
          'share'.padStart(7) +
          'height'.padStart(15) +
          'reach'.padStart(15) +
          'ape'.padStart(13),
      );
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length === 0) continue;
        const ht = bodies.map((b) => b.heightInches);
        const reach = bodies.map((b) => b.reachInches);
        const ape = bodies.map((b) => b.reachInches - b.heightInches);
        console.log(
          division.shortName.padEnd(7) +
            `${((100 * bodies.length) / POPULATIONS[sex].n).toFixed(1)}%`.padStart(7) +
            `${mean(ht).toFixed(1)} (${band(ht)})`.padStart(15) +
            `${mean(reach).toFixed(1)} (${band(reach)})`.padStart(15) +
            `+${mean(ape).toFixed(1)} (${band(ape)})`.padStart(13),
        );
      }
    }
  });

  it('prints the physique indices by sex and division', () => {
    /*
     * The four stored primitives.
     *
     * `frameIndex` and `muscleIndex` both climb with the division — 41 to 60 across the men's ladder,
     * identically — and that is selection rather than a defect. Division is chosen on mass, and mass
     * is height, frame and muscle together, so conditioning on division selects on all three. A model
     * where frame did *not* ladder would be one where frame contributed nothing to how heavy somebody
     * is.
     *
     * What says it is still a body variable rather than a division label is the spread beside each
     * mean: 16 to 17 points of standard deviation against a population 18, so selection has barely
     * narrowed it. Under `naturals.frame` every lightweight scored 55 ± 3. The assertion below is on
     * the spread, not on the gradient — the first draft of it had that backwards, and this snapshot
     * is what caught it.
     */
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — physique (mean, p05-p95) ===`);
      console.log(
        'div'.padEnd(7) +
          'frame'.padStart(15) +
          'muscle'.padStart(15) +
          'body fat'.padStart(15) +
          'water cut'.padStart(15) +
          'coefficient'.padStart(13),
      );
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length === 0) continue;
        const col = (pick: (b: Body) => number) => {
          const v = bodies.map(pick);
          return `${mean(v).toFixed(0)} (${band(v)})`.padStart(15);
        };
        console.log(
          division.shortName.padEnd(7) +
            col((b) => b.frameIndex) +
            col((b) => b.muscleIndex) +
            col((b) => b.bodyFatIndex) +
            col((b) => b.waterCutIndex) +
            mean(bodies.map(massCoefficient)).toFixed(2).padStart(13),
        );
      }
    }
  });

  it('prints mass, lean against carried, and what making weight costs', () => {
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — mass and the cut ===`);
      console.log(
        'div'.padEnd(7) +
          'walking'.padStart(16) +
          'lean'.padStart(16) +
          'body fat %'.padStart(12) +
          'camp'.padStart(8) +
          'floor'.padStart(8) +
          'cut req %'.padStart(11) +
          'under limit'.padStart(13),
      );
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length === 0) continue;
        const walk = bodies.map(walkingWeightLbs);
        const lean = bodies.map(leanMassLbs);
        /*
         * Two columns rather than one signed number. A heavyweight walking 243 lb against a 265 lb
         * ceiling is not cutting −9%; he is walking 22 lb under the maximum, and a diagnostic that
         * says the first thing invites somebody to read a biologically strange event into an
         * ordinary one.
         */
        const cut = bodies.map((b) => 100 * cutRequiredFraction(b, division.limitLbs));
        const under = bodies.map((b) => underLimitLbs(b, division.limitLbs));
        console.log(
          division.shortName.padEnd(7) +
            `${mean(walk).toFixed(0)} (${band(walk)})`.padStart(16) +
            `${mean(lean).toFixed(0)} (${band(lean)})`.padStart(16) +
            `${(100 * mean(bodies.map(bodyFatFraction))).toFixed(1)}`.padStart(12) +
            mean(bodies.map(campWeightLbs)).toFixed(0).padStart(8) +
            mean(bodies.map(weighInFloorLbs)).toFixed(0).padStart(8) +
            mean(cut).toFixed(1).padStart(11) +
            (mean(under) > 0.05 ? `${mean(under).toFixed(0)} lb` : '—').padStart(13),
        );
      }
    }
  });

  it('prints the three indices the rating ceilings read', () => {
    /*
     * The step 4 substitution, seen at population scale. `lean` and `carried` are the two halves of
     * the distinction `naturals.frame` could not make, and `skeletal` is the structural one the
     * strength/cardio interference reads.
     */
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — ceiling inputs (mean, p05-p95) ===`);
      console.log(
        'div'.padEnd(7) +
          'lean index'.padStart(16) +
          'carried index'.padStart(16) +
          'skeletal index'.padStart(16) +
          'carried − lean'.padStart(15),
      );
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length === 0) continue;
        const lean = bodies.map(leanMassIndex);
        const carried = bodies.map(carriedMassIndex);
        const skeletal = bodies.map(skeletalIndex);
        console.log(
          division.shortName.padEnd(7) +
            `${mean(lean).toFixed(1)} (${band(lean)})`.padStart(16) +
            `${mean(carried).toFixed(1)} (${band(carried)})`.padStart(16) +
            `${mean(skeletal).toFixed(1)} (${band(skeletal)})`.padStart(16) +
            (mean(carried) - mean(lean)).toFixed(1).padStart(15),
        );
      }
    }

    console.log(
      `\nbodies with no division on the ladder: male ${POPULATIONS.male.orphaned} of ${POPULATIONS.male.n}, female ${POPULATIONS.female.orphaned} of ${POPULATIONS.female.n}`,
    );
  });

  it('prints how much of each division is one body and how much is a range', () => {
    // The measure step 2 existed to move. Under the old model a division held an eleven per cent
    // band of one shape; this is what says whether it still holds a population.
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — spread within a division ===`);
      console.log(
        'div'.padEnd(7) +
          'height sd'.padStart(11) +
          'walking sd'.padStart(12) +
          'lean sd'.padStart(10) +
          'frame sd'.padStart(10) +
          'walking p05-p95'.padStart(18),
      );
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length === 0) continue;
        const walk = bodies.map(walkingWeightLbs);
        console.log(
          division.shortName.padEnd(7) +
            sd(bodies.map((b) => b.heightInches))
              .toFixed(2)
              .padStart(11) +
            sd(walk).toFixed(1).padStart(12) +
            sd(bodies.map(leanMassLbs)).toFixed(1).padStart(10) +
            sd(bodies.map((b) => b.frameIndex))
              .toFixed(1)
              .padStart(10) +
            `${(pct(walk, 0.95) - pct(walk, 0.05)).toFixed(0)} lb`.padStart(18),
        );
      }
    }
  });
});

describe('the invariants a baseline may still assert', () => {
  /*
   * Only the things that would mean the model had become *incoherent*, never merely different. A
   * baseline that fails whenever the model is deliberately improved has stopped being a baseline.
   */

  it('never lets lean mass exceed what the fighter actually weighs', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const { body } of POPULATIONS[sex].rows) {
        expect(leanMassLbs(body)).toBeLessThan(walkingWeightLbs(body));
      }
    }
  });

  it('keeps the weigh-in floor under camp weight, and camp weight under walking weight', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const { body } of POPULATIONS[sex].rows) {
        expect(weighInFloorLbs(body)).toBeLessThan(campWeightLbs(body));
        expect(campWeightLbs(body)).toBeLessThan(walkingWeightLbs(body));
      }
    }
  });

  it('never puts a fighter in a division their own floor rules out', () => {
    // The viability logic step 4 was required to leave alone, asserted at population scale.
    for (const sex of ['male', 'female'] as const) {
      for (const { body, division } of POPULATIONS[sex].rows) {
        expect(
          weighInFloorLbs(body),
          `${sex} ${division.shortName}: floor ${weighInFloorLbs(body).toFixed(0)} against a ${division.limitLbs} limit`,
        ).toBeLessThanOrEqual(division.limitLbs);
      }
    }
  });

  it('keeps mass rising with height and with the divisions', () => {
    for (const sex of ['male', 'female'] as const) {
      let previousHeight = 0;
      let previousWalking = 0;
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length < 100) continue;
        const height = mean(bodies.map((b) => b.heightInches));
        const walking = mean(bodies.map(walkingWeightLbs));
        expect(height, `${sex} ${division.shortName} height ${height.toFixed(1)}`).toBeGreaterThan(
          previousHeight,
        );
        expect(
          walking,
          `${sex} ${division.shortName} walking ${walking.toFixed(0)}`,
        ).toBeGreaterThan(previousWalking);
        previousHeight = height;
        previousWalking = walking;
      }
    }
  });

  it('keeps skeletal frame a body variable rather than a division label', () => {
    /*
     * **The first draft of this test asserted the wrong thing, and the snapshot caught it.** It
     * bounded the *gradient* in `frameIndex` across divisions at twelve points, on the reasoning that
     * frame is skeletal size for height and a large-framed flyweight should be as common as a
     * large-framed heavyweight. Measured, the gradient is nineteen points — 41 at flyweight to 60 at
     * heavyweight — and the assertion was the thing in error.
     *
     * It has to be there. Division is selected on *mass*, and mass is height, frame and muscle
     * together, so conditioning on division necessarily selects on frame as well. A model where it
     * did not would be one where frame contributed nothing to how heavy somebody is.
     *
     * What actually distinguishes a body variable from a division label is **overlap**. Under
     * `naturals.frame` every lightweight scored 55 ± 3 and the number carried no information beyond
     * the weight class. Measured now, the within-division standard deviation is 16.4 to 17.1 against
     * a population 18 — barely narrowed by selection at all — and flyweight frames span 14 to 70
     * against heavyweight's 33 to 86. That is the property, and it is what this asserts.
     */
    for (const sex of ['male', 'female'] as const) {
      for (const division of divisionsFor(sex)) {
        const bodies = cohort(sex, division);
        if (bodies.length < 100) continue;
        const frames = bodies.map((b) => b.frameIndex);
        const spread = sd(frames);
        expect(
          spread,
          `${sex} ${division.shortName} frameIndex sd ${spread.toFixed(1)}, p05-p95 ${band(frames)}`,
        ).toBeGreaterThan(12);
      }

      // And the divisions overlap: the lightest division's large frames reach past the heaviest
      // division's small ones, which is what "not a label" means when stated as a comparison.
      const ladder = divisionsFor(sex)
        .map((d) => cohort(sex, d))
        .filter((bodies) => bodies.length >= 100);
      const lightest = ladder[0]!.map((b) => b.frameIndex);
      const heaviest = ladder[ladder.length - 1]!.map((b) => b.frameIndex);
      expect(
        pct(lightest, 0.95),
        `${sex}: lightest p95 ${pct(lightest, 0.95)} against heaviest p05 ${pct(heaviest, 0.05)}`,
      ).toBeGreaterThan(pct(heaviest, 0.05));
    }
  });

  it('leaves only a handful of bodies with nowhere to fight', () => {
    for (const sex of ['male', 'female'] as const) {
      const share = POPULATIONS[sex].orphaned / POPULATIONS[sex].n;
      expect(share, `${sex}: ${(share * 100).toFixed(1)}% of bodies have no division`).toBeLessThan(
        0.06,
      );
    }
  });
});
