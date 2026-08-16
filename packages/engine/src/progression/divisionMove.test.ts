import { describe, expect, it } from 'vitest';
import { asDivisionId } from '../core/ids.js';
import { cutSeverity } from '../domain/divisions.js';
import { overallRating } from '../ratings/attributes.js';
import { makeFighter, TEST_DAY } from '../testing/fixtures.js';
import {
  DANGEROUS_SEVERITY,
  MAX_MAKEABLE_SEVERITY,
  appraiseDivisionMove,
  massChangeEffect,
  moveDivision,
  settleWeight,
  settledWalkingWeight,
  viableDivisions,
} from './divisionMove.js';
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
    expect(cutSeverity(f.walkingWeightLbs, asDivisionId(WW))).toBe(0);
    expect(cutSeverity(f.walkingWeightLbs, asDivisionId(FW))).toBeGreaterThan(
      cutSeverity(f.walkingWeightLbs, asDivisionId(LW)),
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
    expect(appraisal.severity).toBeLessThanOrEqual(MAX_MAKEABLE_SEVERITY);
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
    const appraisal = appraiseDivisionMove(f, asDivisionId(FW), [40, 42, 38], overallRating(f.attributes));
    expect(appraisal.fieldGap).toBeGreaterThan(4);
    expect(appraisal.notes.join(' ')).toMatch(/above this division/i);
  });

  it('says plainly when moving up is a step up', () => {
    const f = lightweight();
    const appraisal = appraiseDivisionMove(f, asDivisionId(WW), [78, 80, 76], overallRating(f.attributes));
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

describe('the body follows, slowly', () => {
  it('makes mass a trade rather than an upgrade', () => {
    const gained = massChangeEffect(15);
    expect(gained.strength!).toBeGreaterThan(0);
    expect(gained.power!).toBeGreaterThan(0);
    expect(gained.speed!).toBeLessThan(0);
    expect(gained.cardio!).toBeLessThan(0);
  });

  it('reverses cleanly when weight comes off', () => {
    const up = massChangeEffect(15);
    const down = massChangeEffect(-15);
    expect(down.strength!).toBeCloseTo(-up.strength!, 5);
    expect(down.cardio!).toBeCloseTo(-up.cardio!, 5);
  });

  it('ignores a change too small to mean anything', () => {
    expect(massChangeEffect(3)).toEqual({});
    expect(massChangeEffect(-3)).toEqual({});
  });

  it('moves toward the settled weight without arriving in one camp', () => {
    const moved = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    const target = settledWalkingWeight(getDivision(asDivisionId(WW)));

    const afterOne = settleWeight(moved);
    expect(afterOne.walkingWeightLbs).toBeGreaterThan(moved.walkingWeightLbs);
    expect(afterOne.walkingWeightLbs).toBeLessThan(target);
  });

  it('gets there eventually', () => {
    let f = moveDivision(lightweight(), asDivisionId(WW), TEST_DAY);
    const target = settledWalkingWeight(getDivision(asDivisionId(WW)));
    for (let i = 0; i < 40; i++) f = settleWeight(f);
    expect(Math.abs(f.walkingWeightLbs - target)).toBeLessThanOrEqual(2);
  });

  it('takes weight off faster than it puts usable weight on', () => {
    // A diet is faster than a year in the weight room, and the rates say so.
    const up = settleWeight(moveDivision(lightweight(), asDivisionId(WW), TEST_DAY));
    const heavy = makeFighter({ divisionId: WW, walkingWeightLbs: 187 });
    const down = settleWeight(moveDivision(heavy, asDivisionId(LW), TEST_DAY));

    const upShare = (up.walkingWeightLbs - 165) / (settledWalkingWeight(getDivision(asDivisionId(WW))) - 165);
    const downShare =
      (187 - down.walkingWeightLbs) / (187 - settledWalkingWeight(getDivision(asDivisionId(LW))));

    expect(downShare).toBeGreaterThan(upShare);
  });

  it('never pushes an attribute past the fighter’s own ceiling', () => {
    // Ceilings are the spine of the development system. Mass must not be a way round them.
    const capped = makeFighter({
      divisionId: LW,
      walkingWeightLbs: 165,
      attributes: { strength: 60 },
      potential: { strength: 61 },
    });
    let f = moveDivision(capped, asDivisionId(HW), TEST_DAY);
    for (let i = 0; i < 40; i++) f = settleWeight(f);
    expect(f.attributes.strength).toBeLessThanOrEqual(61);
  });

  it('does nothing once the weight is already right', () => {
    const settled = makeFighter({
      divisionId: LW,
      walkingWeightLbs: settledWalkingWeight(getDivision(asDivisionId(LW))),
    });
    expect(settleWeight(settled)).toBe(settled);
  });
});

describe('what is on offer', () => {
  it('only lists divisions the fighter could actually make', () => {
    const f = lightweight();
    for (const d of viableDivisions(f)) {
      expect(cutSeverity(f.walkingWeightLbs, d.id)).toBeLessThanOrEqual(MAX_MAKEABLE_SEVERITY);
    }
  });

  it('always includes the one they already fight in', () => {
    const f = lightweight();
    expect(viableDivisions(f).map((d) => d.id)).toContain(LW);
  });

  it('never offers a woman a men’s division', () => {
    const f = makeFighter({ sex: 'female', divisionId: 'womens-strawweight', walkingWeightLbs: 125 });
    for (const d of viableDivisions(f)) {
      expect(d.id.startsWith('womens-')).toBe(true);
    }
  });
});
