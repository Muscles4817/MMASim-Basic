import { describe, expect, it } from 'vitest';
import { asDivisionId } from '../core/ids.js';
import { ATTRIBUTE_KEYS, overallRating, toRating } from '../ratings/attributes.js';
import { makeFighter, TEST_DAY } from '../testing/fixtures.js';
import {
  DANGEROUS_SEVERITY,
  appraiseDivisionMove,
  cutSeverityOf,
  moveDivision,
  settleWeight,
  viableDivisions,
} from './divisionMove.js';
import {
  bodyOf,
  massExpressionShift,
  settledBody,
  walkingWeightLbs,
  walkingWeightOf,
  weighInFloorLbs,
} from './body.js';
import { isPhysicalScaleKey } from '../ratings/physicalScale.js';
import { getDivision } from '../domain/divisions.js';

const LW = 'mens-lightweight';
const WW = 'mens-welterweight';
const FW = 'mens-featherweight';
const HW = 'mens-heavyweight';

/** A lightweight who walks around at a routine 165lb. */
const lightweight = () => makeFighter({ divisionId: LW, walkingWeightLbs: 165 });

describe('the point of absolute ratings', () => {
  it('does not touch a single attribute when the division changes', () => {
    // The whole design bet. Moving up must change what they are facing, never who they are.
    const before = lightweight();
    const after = moveDivision(before, asDivisionId(WW), TEST_DAY);
    expect(after.attributes).toEqual(before.attributes);
    expect(after.naturals).toEqual(before.naturals);
    expect(after.potential).toEqual(before.potential);
  });

  it('records the move in the division history', () => {
    const after = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    expect(after.divisionId).toBe(WW);
    expect(after.divisionHistory).toContain(WW);
    expect(after.lastDivisionChangeDay).toBe(TEST_DAY);
  });

  it('does not duplicate a division already in the history', () => {
    const up = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    const back = moveDivision(up, asDivisionId(LW), TEST_DAY);
    const again = moveDivision(back, asDivisionId(WW), TEST_DAY);
    expect(again.divisionHistory.filter((d) => d === WW)).toHaveLength(1);
  });

  it('is a no-op when moving to the division already fought in', () => {
    const f = lightweight();
    expect(moveDivision(f, asDivisionId(LW), TEST_DAY)).toBe(f);
  });
});

describe('what the move actually costs', () => {
  it('reads a move up as no cut and a move down as a hard one', () => {
    const f = lightweight();
    expect(cutSeverityOf(bodyOf(f), asDivisionId(WW))).toBe(0);
    expect(cutSeverityOf(bodyOf(f), asDivisionId(FW))).toBeGreaterThan(
      cutSeverityOf(bodyOf(f), asDivisionId(LW)),
    );
  });

  it('refuses a cut nobody could make', () => {
    const heavy = makeFighter({ divisionId: HW, walkingWeightLbs: 260 });
    const appraisal = appraiseDivisionMove(heavy, asDivisionId(FW), [50], 50);
    expect(appraisal.makeable).toBe(false);
    expect(appraisal.notes.join(' ')).toMatch(/cannot make/i);
  });

  it('warns before a dangerous cut without forbidding it', () => {
    // 168lb down to 145 is a 23lb cut — severity ~0.88, which is inside the band between
    // "the game says something" (0.72) and "nobody could do this" (0.95). That band is
    // narrow on purpose: past it the answer is no, not a warning.
    const f = makeFighter({ divisionId: LW, walkingWeightLbs: 168 });
    const appraisal = appraiseDivisionMove(f, asDivisionId(FW), [50], 50);

    expect(appraisal.severity).toBeGreaterThan(DANGEROUS_SEVERITY);
    expect(appraisal.severity).toBeLessThanOrEqual(1);
    expect(appraisal.makeable).toBe(true);
    expect(appraisal.notes.join(' ')).toMatch(/dangerous cut/i);
  });

  it('raises the weight-miss risk for an undisciplined fighter making the same cut', () => {
    const weight = 176;
    const pro = makeFighter({
      divisionId: LW,
      walkingWeightLbs: weight,
      personality: { discipline: 95, professionalism: 95 },
    });
    const shambles = makeFighter({
      divisionId: LW,
      walkingWeightLbs: weight,
      personality: { discipline: 8, professionalism: 8 },
      traits: ['weightCutGambler'],
    });

    const proRisk = appraiseDivisionMove(pro, asDivisionId(FW), [50], 50).weightMissRisk;
    const shamblesRisk = appraiseDivisionMove(shambles, asDivisionId(FW), [50], 50).weightMissRisk;

    expect(shamblesRisk).toBeGreaterThan(proRisk * 2);
  });

  it('never reports a risk outside 0–1', () => {
    const extreme = makeFighter({
      divisionId: HW,
      walkingWeightLbs: 250,
      personality: { discipline: 1, professionalism: 1 },
      traits: ['weightCutGambler', 'partyAnimal'],
    });
    for (const target of viableDivisions(extreme)) {
      const risk = appraiseDivisionMove(extreme, target.id, [50], 50).weightMissRisk;
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(1);
    }
  });
});

describe('the field, which is the thing that actually changed', () => {
  it('says plainly when a fighter is above the division they are dropping into', () => {
    const f = lightweight();
    const appraisal = appraiseDivisionMove(
      f,
      asDivisionId(FW),
      [40, 42, 38],
      overallRating(f.attributes),
    );
    expect(appraisal.fieldGap).toBeGreaterThan(4);
    expect(appraisal.notes.join(' ')).toMatch(/above this division/i);
  });

  it('says plainly when moving up is a step up', () => {
    const f = lightweight();
    const appraisal = appraiseDivisionMove(
      f,
      asDivisionId(WW),
      [78, 80, 76],
      overallRating(f.attributes),
    );
    expect(appraisal.fieldGap).toBeLessThan(-4);
    expect(appraisal.notes.join(' ')).toMatch(/step up/i);
  });

  it('treats two divisions as a different proposition from one', () => {
    const f = lightweight();
    const one = appraiseDivisionMove(f, asDivisionId(WW), [60], 60);
    expect(one.steps).toBe(1);

    const two = appraiseDivisionMove(f, asDivisionId('mens-middleweight'), [60], 60);
    expect(two.steps).toBe(2);
    expect(two.notes.join(' ')).toMatch(/not one twice/i);
  });

  it('falls back to "about level" rather than inventing a gap with no field', () => {
    const f = lightweight();
    const appraisal = appraiseDivisionMove(f, asDivisionId(WW), [], overallRating(f.attributes));
    expect(appraisal.fieldGap).toBe(0);
  });
});

describe('the body follows, slowly, and the ratings are re-read from it', () => {
  const walking = (f: ReturnType<typeof makeFighter>) => walkingWeightOf(f);

  it('makes mass a trade rather than an upgrade', () => {
    let f = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    const before = { ...f.attributes };
    for (let i = 0; i < 40; i++) f = settleWeight(f);

    expect(f.attributes.strength).toBeGreaterThan(before.strength);
    expect(f.attributes.power).toBeGreaterThan(before.power);
    expect(f.attributes.speed).toBeLessThan(before.speed);
    expect(f.attributes.cardio).toBeLessThan(before.cardio);
  });

  it('reads the same ratings for the same body, however it got there', () => {
    /*
     * The property `massChangeEffect` could not have, and the reason the replacement is a
     * *difference of medians* rather than a table. Doc 31 § 24.
     *
     * The old table was a one-off delta added to the current rating, so two half-steps did not
     * equal one whole step and reversing a move did not reverse the ratings. `massExpressionShift`
     * composes and inverts exactly, because it only ever asks what the median is at a mass.
     */
    const a = bodyOf(lightweight());
    const b = { ...a, muscleIndex: toRating(a.muscleIndex + 20) };
    const half = { ...a, muscleIndex: toRating(a.muscleIndex + 10) };

    for (const key of ['power', 'speed', 'cardio', 'strength', 'durability'] as const) {
      // Two half-steps equal one whole step.
      expect(
        massExpressionShift(a, half)[key] + massExpressionShift(half, b)[key],
        key,
      ).toBeCloseTo(massExpressionShift(a, b)[key], 10);
      // And the reverse is the negative.
      expect(massExpressionShift(b, a)[key], key).toBeCloseTo(-massExpressionShift(a, b)[key], 10);
    }
  });

  it('leaves a fighter who went up and came back a different person, on purpose', () => {
    /*
     * A career round trip is **not** reversible, and asserting that it was is the first thing this
     * test did before it was measured. The asymmetry in `settledBody` is the reason and it is
     * physiological: going up adds muscle, and coming back down sheds fat first. So a lightweight
     * who spends two years at welterweight and returns is leaner and more muscular at the same
     * weight than the man who left.
     *
     * That is the right answer and it is one of the few things in the game that rewards a decision
     * years later. What must not drift is the *ratings for a given body*, which the test above
     * pins exactly.
     */
    // Two divisions, so there is enough mass in the round trip for the asymmetry to show on an
    // integer index. One division from a fighter already inside the target band moves nothing at
    // all, which is itself correct and is asserted separately above.
    const start = lightweight();
    let up = moveDivision(start, asDivisionId('mens-middleweight'), TEST_DAY);
    for (let i = 0; i < 80; i++) up = settleWeight(up);
    let back = moveDivision(up, asDivisionId(LW), TEST_DAY);
    for (let i = 0; i < 80; i++) back = settleWeight(back);

    expect(back.physique.muscleIndex).toBeGreaterThan(start.physique.muscleIndex);
    expect(back.physique.bodyFatIndex).toBeLessThan(start.physique.bodyFatIndex);
  });

  it('does not touch capability, in either direction', () => {
    /*
     * "Capability never moves" is the plan's own wording for this step, and this is what it means.
     * The old table paid out `+1.1 takedownDefence, +0.7 wrestling` per fifteen pounds — a size
     * effect wearing a skill's name, and the engine already reads size through Strength.
     */
    let f = moveDivision(lightweight(), asDivisionId(HW), TEST_DAY);
    const before = { ...f.attributes };
    const naturals = { ...f.naturals };
    for (let i = 0; i < 60; i++) f = settleWeight(f);

    for (const key of ATTRIBUTE_KEYS) {
      if (isPhysicalScaleKey(key)) continue;
      expect(f.attributes[key], key).toBe(before[key]);
    }
    expect(f.naturals).toEqual(naturals);
    expect(f.aptitudes).toEqual(lightweight().aptitudes);
  });

  it('moves toward the settled weight without arriving in one camp', () => {
    const moved = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    const settled = settledBody(bodyOf(moved), getDivision(asDivisionId(WW)).limitLbs);

    const afterOne = settleWeight(moved);
    expect(walking(afterOne)).toBeGreaterThan(walking(moved));
    expect(walking(afterOne)).toBeLessThan(Math.round(walkingWeightLbs(settled)));
  });

  it('gets there eventually', () => {
    let f = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    const settled = settledBody(bodyOf(f), getDivision(asDivisionId(WW)).limitLbs);
    for (let i = 0; i < 60; i++) f = settleWeight(f);
    expect(Math.abs(walking(f) - walkingWeightLbs(settled))).toBeLessThanOrEqual(2);
  });

  it('settles a body its own size rather than the division’s', () => {
    /*
     * The reason `settledWalkingWeight` had to go. It was `limit * 1.07`, so every fighter moving
     * to welterweight settled at exactly 182 lb whatever they were built like — two men eight
     * inches apart, the same number.
     */
    const short = makeFighter({ divisionId: WW, heightInches: 66, walkingWeightLbs: 170 });
    const tall = makeFighter({ divisionId: WW, heightInches: 76, walkingWeightLbs: 200 });

    const shortSettled = walkingWeightLbs(settledBody(bodyOf(short), 170));
    const tallSettled = walkingWeightLbs(settledBody(bodyOf(tall), 170));

    // Both make the weight, and neither is the same person as the other.
    expect(weighInFloorLbs(settledBody(bodyOf(short), 170))).toBeLessThanOrEqual(170);
    expect(weighInFloorLbs(settledBody(bodyOf(tall), 170))).toBeLessThanOrEqual(170);
    expect(Math.abs(shortSettled - tallSettled)).toBeGreaterThan(0);
  });

  it('takes weight off faster than it puts usable weight on', () => {
    // A diet is faster than a year in the weight room, and the rates say so.
    const up = lightweight();
    const upOne = settleWeight(moveDivision(up, asDivisionId(WW), TEST_DAY));
    const upTarget = walkingWeightLbs(
      settledBody(bodyOf(up), getDivision(asDivisionId(WW)).limitLbs),
    );

    const heavy = makeFighter({ divisionId: WW, walkingWeightLbs: 187 });
    const downOne = settleWeight(moveDivision(heavy, asDivisionId(LW), TEST_DAY));
    const downTarget = walkingWeightLbs(
      settledBody(bodyOf(heavy), getDivision(asDivisionId(LW)).limitLbs),
    );

    const upShare = (walking(upOne) - walking(up)) / (upTarget - walking(up));
    const downShare = (walking(heavy) - walking(downOne)) / (walking(heavy) - downTarget);

    expect(downShare).toBeGreaterThan(upShare);
  });

  it('moves the ceiling with the rating, so mass is never a way round a limit', () => {
    /*
     * Both halves matter, and the old code only had the second.
     *
     * It clamped the gain to a ceiling that had not moved, so a fighter already at their Strength
     * limit gained nothing from fifteen pounds — exactly the fighter it should have paid the most.
     * The ceiling is a reading at a mass just as the rating is, so it takes the same shift, and the
     * rating still never passes it.
     */
    const capped = makeFighter({
      divisionId: LW,
      walkingWeightLbs: 165,
      attributes: { strength: 60 },
      potential: { strength: 61 },
    });
    let f = moveDivision(capped, asDivisionId(HW), TEST_DAY);
    for (let i = 0; i < 60; i++) f = settleWeight(f);

    expect(f.attributes.strength).toBeLessThanOrEqual(f.potential.strength);
    expect(f.potential.strength).toBeGreaterThan(61);
    expect(f.attributes.strength).toBeGreaterThan(60);
  });

  it('does nothing once the weight is already right', () => {
    const settled = makeFighter({ divisionId: LW, walkingWeightLbs: 167 });
    const once = settleWeight(settled);
    expect(walking(once)).toBe(walking(settled));
  });
});

describe('what is on offer', () => {
  it('only lists divisions the fighter could actually make', () => {
    /*
     * The bound is the weigh-in floor rather than a severity threshold. `MAX_MAKEABLE_SEVERITY` was
     * 0.95 on a percentage-of-limit scale — a proxy for "could this body ever weigh that", which the
     * cut model answers exactly. Doc 31 § 24.
     */
    const f = lightweight();
    for (const d of viableDivisions(f)) {
      expect(weighInFloorLbs(bodyOf(f)), d.id).toBeLessThanOrEqual(d.limitLbs);
    }
  });

  it('always includes the one they already fight in', () => {
    const f = lightweight();
    expect(viableDivisions(f).map((d) => d.id)).toContain(LW);
  });

  it('never offers a woman a men’s division', () => {
    const f = makeFighter({
      sex: 'female',
      divisionId: 'womens-strawweight',
      walkingWeightLbs: 125,
    });
    for (const d of viableDivisions(f)) {
      expect(d.id.startsWith('womens-')).toBe(true);
    }
  });
});
