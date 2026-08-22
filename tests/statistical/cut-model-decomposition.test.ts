/**
 * Why the body model rejects fighters who demonstrably made the weight.
 *
 * Doc 31 § 14.6. Step 5's calibration roster returned ten `notViable` verdicts on real careers, and
 * the rule the correction runs under is that **a reliably documented fighter successfully making a
 * division is evidence against the model** — so the first job is not to loosen anything, it is to
 * find out which term is doing the rejecting.
 *
 * This file changes nothing. It prints the chain — walking weight → fat → lean → camp → transient →
 * floor — for every entry the model refuses, and beside it asks each assumption in turn what it
 * would have to become for the fighter to pass. That is the question a scalar floor cannot answer:
 * `weighInFloorLbs` says 187.1 against a limit of 185, which tells you the model is wrong by 2.1 lb
 * and nothing whatever about whether the fault is the camp body-fat constant, the water allowance,
 * the composition inference, or the walking weight somebody guessed.
 *
 * The counter-examples matter as much as the rejections and are printed with them. If the answer
 * were simply "the ceiling is too low everywhere", the fighters the model *accepts* at 11–12% would
 * look no different from the ones it refuses at 9.8%, and they do.
 */

import { describe, expect, it } from 'vitest';
import { CALIBRATION_ROSTER, resolveEntry } from '@mmasim/data';
import {
  asDivisionId,
  cutChain,
  cutRequiredFraction,
  cutRequirement,
  getDivision,
  massCoefficient,
  type Body,
  type Sex,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

interface Case {
  name: string;
  sex: Sex;
  division: string;
  limitLbs: number;
  body: Body;
  fit: string;
  confidence: string;
  disagreement?: string;
}

const CASES: Case[] = CALIBRATION_ROSTER.map((entry) => {
  const resolved = resolveEntry(entry);
  return {
    name: entry.name,
    sex: entry.measured.sex,
    division: entry.measured.division,
    limitLbs: getDivision(asDivisionId(entry.measured.division)).limitLbs,
    body: resolved.body,
    fit: resolved.fit,
    confidence: entry.estimated.confidence,
    disagreement: entry.disagreement?.kind,
  };
});

const rejected = CASES.filter((c) => c.fit === 'notViable');
const nearMiss = CASES.filter((c) => c.fit === 'severe' || c.fit === 'extreme');

function chainBlock(c: Case): string[] {
  const chain = cutChain(c.body);
  const need = cutRequirement(c.body, c.limitLbs);
  const div = getDivision(asDivisionId(c.division));
  const cut = 100 * cutRequiredFraction(c.body, c.limitLbs);
  const lines = [
    `\n${c.name}  —  ${div.shortName} ${c.limitLbs} lb  ·  needs ${cut.toFixed(1)}%  ·  ${c.fit}` +
      `  ·  walking weight ${c.confidence}-sourced` +
      (c.disagreement ? `  ·  filed as ${c.disagreement}` : ''),
    `    walking          ${chain.walkingWeightLbs.toFixed(1).padStart(6)} lb` +
      `   at ${(100 * chain.bodyFatFraction).toFixed(1)}% body fat`,
    `      fat            ${chain.fatMassLbs.toFixed(1).padStart(6)} lb`,
    `      lean           ${chain.leanMassLbs.toFixed(1).padStart(6)} lb`,
    `    − dietable fat   ${chain.dietableFatLbs.toFixed(1).padStart(6)} lb   (down to camp fat)`,
    `    = camp           ${chain.campWeightLbs.toFixed(1).padStart(6)} lb` +
      `   retaining ${chain.retainedFatLbs.toFixed(1)} lb of fat`,
    `    − gut content    ${chain.transient.gutContentLbs.toFixed(1).padStart(6)} lb`,
    `    − glycogen       ${chain.transient.glycogenLbs.toFixed(1).padStart(6)} lb   (and the water bound to it, off lean mass)`,
    `    − dehydration    ${chain.transient.dehydrationLbs.toFixed(1).padStart(6)} lb   (${(100 * (chain.transient.dehydrationLbs / chain.campWeightLbs)).toFixed(1)}% of camp)`,
    `      fight week     ${chain.transient.totalLbs.toFixed(1).padStart(6)} lb   total`,
    `    = floor          ${chain.weighInFloorLbs.toFixed(1).padStart(6)} lb` +
      `   against a ${c.limitLbs} lb limit  →  ${need.shortfallLbs > 0 ? `SHORT BY ${need.shortfallLbs.toFixed(1)} lb` : `${(-need.shortfallLbs).toFixed(1)} lb of headroom`}`,
  ];
  if (need.shortfallLbs > 0) {
    lines.push(
      `    to pass, holding everything else:`,
      `      camp body fat  ${(100 * need.campBodyFat).toFixed(1).padStart(6)}%` +
        `   (model says ${c.sex === 'male' ? '7.0' : '13.0'}%)`,
      `      dehydration    ${(100 * need.dehydrationFraction).toFixed(1).padStart(6)}%` +
        `   (model ceiling 8.0%)`,
      `      walking        ${need.walkingWeightLbs.toFixed(1).padStart(6)} lb` +
        `   (estimated ${chain.walkingWeightLbs.toFixed(0)} lb, ${(chain.walkingWeightLbs - need.walkingWeightLbs).toFixed(1)} lb lighter)`,
      `      body fat       ${(100 * need.bodyFatFraction).toFixed(1).padStart(6)}%` +
        `   (inferred ${(100 * chain.bodyFatFraction).toFixed(1)}%)`,
    );
  }
  return lines;
}

describe('the cut model, taken apart', () => {
  it('prints the full chain for every fighter the model refuses', () => {
    say('\n\n═══ Rejected by the body model ═══');
    say(
      '\n  Each of these is a career that happened. The chain below is the model, not the fighter.\n' +
        '  Run against the current model this list is empty except for the one intended control, and\n' +
        '  that is the point — §15 and §18 emptied it. The chain itself is still worth printing,\n' +
        '  because it is how the next disagreement will be diagnosed.',
    );
    for (const c of rejected) for (const line of chainBlock(c)) say(line);
    flush();
    expect(rejected.length).toBeLessThanOrEqual(1);
  });

  it('prints the same chain for the fighters it accepts at comparable cuts', () => {
    say('\n\n═══ Accepted at severe or extreme — the controls ═══');
    say(
      '\n  If the ceiling were simply too low everywhere, these would look like the rejections.\n' +
        '  They do not, and the difference between the two groups is the finding.',
    );
    for (const c of nearMiss) for (const line of chainBlock(c)) say(line);
    flush();
    expect(nearMiss.length).toBeGreaterThan(0);
  });

  it('prints the ceiling the superseded model imposed, as a fraction of walking weight', () => {
    /**
     * **Historical, and computed from the old constants on purpose.** This block is the measurement
     * that justified the change, so it has to keep showing what the model looked like when the
     * change was made — recomputing it against the current constants would erase the evidence and
     * leave a table that proves nothing. The live ceiling lives in `cut-model-acceptance.test.ts`.
     */
    say('\n\n═══ What the superseded model would let anybody lose ═══');
    say(
      '\n  Under the single-pool model, floor / walking = (1 − bodyFat) / (1 − campFat) ×\n' +
        '  (1 − transient), so the maximum cut a body could make depended on exactly two of its own\n' +
        '  numbers: how fat it was, and how much water it tolerated losing. Nothing else moved it.\n',
    );
    say('  sex     body fat   transient   max cut % of walking weight');
    for (const sex of ['male', 'female'] as const) {
      const campFat = sex === 'male' ? 0.07 : 0.13;
      const [floorFat, ceilFat] = sex === 'male' ? [0.08, 0.18] : [0.15, 0.25];
      for (const fat of [floorFat, (floorFat + ceilFat) / 2, ceilFat]) {
        for (const water of [0.04, 0.065, 0.09]) {
          const ratio = ((1 - fat) / (1 - campFat)) * (1 - water);
          say(
            `  ${sex.padEnd(8)}${(100 * fat).toFixed(1).padStart(6)}%` +
              `${(100 * water).toFixed(1).padStart(11)}%` +
              `${(100 * (1 - ratio)).toFixed(1).padStart(14)}%`,
          );
        }
      }
    }
    say(
      '\n  Read the leanest rows. A male fighter at 8% body fat cannot lose more than 10.0% of his\n' +
        '  walking weight even at the most tolerant water setting the model contains, because his\n' +
        '  only fat pool above camp fat is one per cent of his body. The hand-authored roster the\n' +
        '  bands were measured against has a 90th-percentile cut of 13.8% and a maximum of 20.7%, so\n' +
        '  the model is telling the leanest fighters in the sport that they cannot do what the sport\n' +
        '  demonstrably does — and the fighters who perform the biggest cuts are not the fat ones.\n\n' +
        '  Note also that the two sexes are not ordered the way the step 5 report assumed. At their\n' +
        '  respective leanest, a woman can lose 11.1% and a man 10.0%; at mid-band, 16.3% against\n' +
        '  14.9%. The female constants are not harsher than the male ones. See the next block.',
    );
    flush();
  });

  it('shows the required cut is a property of the division ladder, not of the sexes', () => {
    // This one is still live: required cut is a property of the ladder and the bodies, and neither
    // §15 nor §18 touched it.
    say('\n\n═══ How big a cut each division asks for ═══');
    say(
      '\n  The step 5 report read four rejected strawweights as evidence that the female cut model\n' +
        '  was systematically stricter. The table above says otherwise — so the pattern needs a\n' +
        "  different explanation, and this is it. The women's ladder runs 115/125/135/145, and a ten\n" +
        '  pound step at 115 lb is 8.7% of the limit where a fifteen pound step at 155 lb is 9.7%\n' +
        '  spread over a much larger body. Strawweights are simply asked for bigger cuts.\n',
    );
    say('  division   n   mean cut %   max cut %   rejected');
    const byDivision = new Map<string, Case[]>();
    for (const c of CASES) {
      const list = byDivision.get(c.division) ?? [];
      list.push(c);
      byDivision.set(c.division, list);
    }
    for (const [division, list] of byDivision) {
      const cuts = list.map((c) => 100 * cutRequiredFraction(c.body, c.limitLbs));
      const short = list.filter((c) => c.fit === 'notViable').length;
      say(
        `  ${getDivision(asDivisionId(division)).shortName.padEnd(9)}${String(list.length).padStart(3)}` +
          `${(cuts.reduce((a, b) => a + b, 0) / cuts.length).toFixed(1).padStart(13)}` +
          `${Math.max(...cuts)
            .toFixed(1)
            .padStart(12)}` +
          `${String(short).padStart(11)}`,
      );
    }
    flush();
  });

  it('exonerates the composition inference: the split cannot move the floor at fixed size', () => {
    /**
     * Two of the step 5 disagreements — Pereira and Chandler — were filed as `compositionInference`,
     * on the reasoning that `physiqueForMeasurements` splits lean mass between frame and muscle and
     * that a short dense fighter is mis-served by it. This settles the question rather than arguing
     * it, and two earlier drafts of the check were themselves wrong in instructive ways.
     *
     * The first raised `frameIndex` to 90 and asserted the floor did not budge; it moved forty
     * pounds, and of course it did — lean mass is *derived* from frame and muscle, so raising one
     * builds a different, larger man whose floor should move. The second built alternative splits
     * with linear arithmetic, which stopped preserving the total the moment doc 31 § 18 gave the
     * index scale a curve. This one asks `massCoefficient` itself for the alternatives and so cannot
     * go stale when the scale changes shape again.
     *
     * The claim that actually matters is narrow. Hold the fighter's **measured** height and walking
     * weight, which is what a calibration entry states, and redistribute lean mass between frame and
     * muscle at constant total. The floor does not move at all, because
     * `floor = lean / (1 − campFat) − fightWeekLoss` and lean is pinned by the measurements. So
     * `compositionInference` cannot be why anybody is rejected, and those two filings were wrong.
     */
    const c = CASES.find((x) => x.name === 'Alex Pereira')!;
    const target = massCoefficient(c.body);

    /** The muscle index that restores `target` for a given frame index, by bisection. */
    const muscleFor = (frameIndex: number): number | undefined => {
      const at = (muscleIndex: number) => massCoefficient({ ...c.body, frameIndex, muscleIndex });
      if (at(100) < target || at(0) > target) return undefined;
      let lo = 0;
      let hi = 100;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid) < target) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };

    let checked = 0;
    for (const frameIndex of [0, 20, 40, 60, 80, 100]) {
      const muscleIndex = muscleFor(frameIndex);
      if (muscleIndex === undefined) continue;
      const split = { ...c.body, frameIndex, muscleIndex } as Body;
      expect(massCoefficient(split)).toBeCloseTo(target, 9);
      expect(cutChain(split).weighInFloorLbs).toBeCloseTo(cutChain(c.body).weighInFloorLbs, 6);
      expect(cutChain(split).walkingWeightLbs).toBeCloseTo(cutChain(c.body).walkingWeightLbs, 6);
      checked++;
    }
    expect(checked, 'no alternative split was reachable').toBeGreaterThan(2);
  });

  it('summarises which term each rejection indicts', () => {
    say('\n\n═══ Which assumption is doing the rejecting ═══\n');
    say(
      '  Read the shortfall column first. Eight of the ten rejections miss by under two and a half\n' +
        '  pounds, and three miss by under one — Pereira by 0.4 lb on a 230 lb man, which is under\n' +
        '  two parts in a thousand. Every input to that verdict is inferred, the walking weight most\n' +
        '  of all, so declaring a career physiologically impossible on that margin is the model\n' +
        '  claiming a precision it does not have.\n\n' +
        '  Then read across. No single term is badly wrong anywhere: the camp body fat these men\n' +
        '  would need runs 5.9–6.8% against an assumed 7.0%, and the walking weights are within two\n' +
        '  pounds of the estimate. That is the shape of a model that is slightly short everywhere\n' +
        '  rather than wrong in one place, and it is why the fix cannot be to move one constant\n' +
        '  until the examples pass.\n',
    );
    say(
      '  fighter                 short   needs camp fat   needs dehydration   needs walking      filed as',
    );
    for (const c of rejected) {
      const need = cutRequirement(c.body, c.limitLbs);
      const chain = cutChain(c.body);
      say(
        `  ${c.name.padEnd(22)}${need.shortfallLbs.toFixed(1).padStart(5)} lb` +
          `${(100 * need.campBodyFat).toFixed(1).padStart(14)}%` +
          `${(100 * need.dehydrationFraction).toFixed(1).padStart(17)}%` +
          `${need.walkingWeightLbs.toFixed(0).padStart(15)} lb` +
          `   (−${(chain.walkingWeightLbs - need.walkingWeightLbs).toFixed(0)})` +
          `  ${c.disagreement ?? ''}`,
      );
    }
    flush();
  });
});
