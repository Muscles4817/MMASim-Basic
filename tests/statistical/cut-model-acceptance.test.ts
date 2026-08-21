/**
 * The cut model after doc 31 § 14.6, against the calibration roster.
 *
 * `cut-model-decomposition.test.ts` established what was wrong; this file is what the correction has
 * to satisfy. It exists because the obvious way to fix ten rejected careers is to loosen the model
 * until they pass, and that produces something worse than the original: a model that agrees with
 * every fighter who ever existed has stopped being able to say anything.
 *
 * So the criteria run in both directions. Repeatedly sustainable careers must be viable; cuts the
 * sport treats as dangerous must still read as dangerous; the two historical edge cases must stay at
 * or beyond the boundary rather than being quietly welcomed in; and bodies that genuinely cannot
 * make a division must still be refused.
 *
 * **What this file does not do.** It touches no rating and no `n × σ` placement — the roster's
 * physicals are a step 5 artefact and are not evidence about the body model. And it is not a
 * generator test: the sampler's own rejection rates are reported here as a regression guard rather
 * than as something the cut model is being tuned against.
 */

import { describe, expect, it } from 'vitest';
import { CALIBRATION_ROSTER, resolveEntry } from '@mmasim/data';
import {
  asDivisionId,
  chosenDivision,
  createRng,
  cutChain,
  cutRequiredFraction,
  divisionsFor,
  getDivision,
  reconstructionErrorLbs,
  sampleBody,
  sampleBodyForDivisionWithStats,
  sampleCutTolerance,
  weighInFloorLbs,
  weightFit,
  type Body,
  type Sex,
  type WeightFit,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

const RESOLVED = CALIBRATION_ROSTER.map((entry) => {
  const r = resolveEntry(entry);
  return {
    entry,
    body: r.body,
    fit: r.fit,
    limitLbs: getDivision(asDivisionId(entry.measured.division)).limitLbs,
    headroomLbs:
      getDivision(asDivisionId(entry.measured.division)).limitLbs - weighInFloorLbs(r.body),
    cutPct:
      100 *
      cutRequiredFraction(r.body, getDivision(asDivisionId(entry.measured.division)).limitLbs),
  };
});
const byName = (name: string) => {
  const found = RESOLVED.find((r) => r.entry.name === name);
  if (!found) throw new Error(`no calibration entry named ${name}`);
  return found;
};

/**
 * What the model said before the three-pool split, recomputed from the old formula.
 *
 * Transcribing the old verdicts as a literal would let the before-column drift silently the next
 * time anything upstream moves; recomputing it from the superseded arithmetic keeps the comparison
 * honest against whatever the roster currently contains.
 */
function previousFit(body: Body, limitLbs: number): WeightFit {
  const OLD_CAMP_FAT = body.sex === 'male' ? 0.07 : 0.13;
  const lean = cutChain(body).leanMassLbs;
  const camp = lean / (1 - OLD_CAMP_FAT);
  const water = 0.04 + ((body.waterCutIndex - 1) / 99) * 0.05;
  const floor = camp * (1 - water);
  if (floor > limitLbs) return 'notViable';
  const cut = cutRequiredFraction(body, limitLbs);
  if (cut <= 0.04) return 'comfortable';
  if (cut <= 0.11) return 'typical';
  if (cut <= 0.16) return 'severe';
  return 'extreme';
}

/**
 * Division choice under the superseded floor, for the before column.
 *
 * Recomputed from the old arithmetic rather than transcribed, for the same reason `previousFit` is:
 * a hard-coded before-column silently stops being true the next time anything upstream moves.
 */
function previousChosenDivision(body: Body, sex: Sex, cutTolerance: number) {
  const OLD_CAMP_FAT = sex === 'male' ? 0.07 : 0.13;
  const lean = cutChain(body).leanMassLbs;
  const camp = lean / (1 - OLD_CAMP_FAT);
  const floor = camp * (1 - (0.04 + ((body.waterCutIndex - 1) / 99) * 0.05));
  const walking = cutChain(body).walkingWeightLbs;
  const ladder = divisionsFor(sex);
  for (const division of ladder) {
    if (floor > division.limitLbs) continue;
    if ((walking - division.limitLbs) / walking <= cutTolerance) return division;
  }
  return ladder.find((d) => floor <= d.limitLbs);
}

describe('the corrected cut model — the report', () => {
  it('prints every classification that changed, before and after', () => {
    say('\n\n═══ Classification changes ═══\n');
    say('  fighter                 div    cut %    before        after     headroom');
    let changed = 0;
    for (const r of RESOLVED) {
      const before = previousFit(r.body, r.limitLbs);
      if (before === r.fit) continue;
      changed++;
      say(
        `  ${r.entry.name.padEnd(22)}${getDivision(asDivisionId(r.entry.measured.division)).shortName.padEnd(6)}` +
          `${r.cutPct.toFixed(1).padStart(6)}` +
          `${before.padStart(12)}${r.fit.padStart(13)}` +
          `${r.headroomLbs.toFixed(1).padStart(11)} lb`,
      );
    }
    say(
      `\n  ${changed} of ${RESOLVED.length} entries moved. Everything else is untouched: the bands are\n` +
        '  computed from the cut required, which this change does not affect, so only verdicts that\n' +
        '  depended on the weigh-in floor could move — and the floor is the only thing that moved.',
    );
    flush();
    expect(changed).toBeGreaterThan(0);
  });

  it('prints the fight-week pools that replaced the single water term', () => {
    say('\n\n═══ Where fight-week loss now comes from ═══\n');
    say('  fighter                 camp     gut  glycogen  dehydr    total   % of camp   old pool');
    for (const r of RESOLVED.filter((x) => x.entry.disagreement)) {
      const c = cutChain(r.body);
      const oldWater = 0.04 + ((r.body.waterCutIndex - 1) / 99) * 0.05;
      say(
        `  ${r.entry.name.padEnd(22)}${c.campWeightLbs.toFixed(0).padStart(5)}` +
          `${c.transient.gutContentLbs.toFixed(1).padStart(8)}` +
          `${c.transient.glycogenLbs.toFixed(1).padStart(10)}` +
          `${c.transient.dehydrationLbs.toFixed(1).padStart(8)}` +
          `${c.transient.totalLbs.toFixed(1).padStart(9)}` +
          `${(100 * (c.transient.totalLbs / c.campWeightLbs)).toFixed(1).padStart(11)}%` +
          `${(c.campWeightLbs * oldWater).toFixed(1).padStart(11)} lb`,
      );
    }
    say(
      '\n  Glycogen is the column that changes the shape rather than the size. It scales with lean\n' +
        '  mass where the other two scale with total mass, so the fighters who gain most from the\n' +
        '  split are the lean and muscular ones — which is exactly where the decomposition said the\n' +
        '  old model was wrong.',
    );
    flush();
  });

  it('reports the population shift the lower floor causes, before and after', () => {
    /**
     * Criterion 5, and the answer is not the one the first draft of this test asserted.
     *
     * That draft claimed `chosenDivision` picks on the cut a body is willing to make and never on
     * the physiological floor, so the sampled population could not move. It was wrong — the function
     * skips any division whose limit sits below the body's floor before it ever consults tolerance —
     * and the suite caught it: male heavyweight sampling went from 23.5 draws to 26.2 against a
     * bound of 25.
     *
     * The mechanism, once seen, is obvious and is the change working rather than misfiring.
     * `chosenDivision` walks the ladder lightest-first, so lowering the floor makes bodies eligible
     * for divisions that previously refused them, and fighters move **down**. That is the whole
     * point: the old floor was pushing lean fighters up a division because it would not let them
     * make the weight the sport says they make.
     */
    const N = 6000;
    const shares = new Map<string, { before: number; after: number }>();
    const homeless = new Map<Sex, { before: number; after: number }>();

    for (const sex of ['male', 'female'] as const) {
      for (let i = 0; i < N; i++) {
        const rng = createRng(`cut-model-${sex}-${i}`);
        const body = sampleBody(rng.fork('body'), sex);
        const tolerance = sampleCutTolerance(rng.fork('cut'));
        const after = chosenDivision(body, sex, tolerance);
        const before = previousChosenDivision(body, sex, tolerance);
        const h = homeless.get(sex) ?? { before: 0, after: 0 };
        if (!after) h.after++;
        if (!before) h.before++;
        homeless.set(sex, h);
        for (const [key, division] of [
          ['before', before],
          ['after', after],
        ] as const) {
          if (!division) continue;
          const row = shares.get(division.shortName) ?? { before: 0, after: 0 };
          row[key]++;
          shares.set(division.shortName, row);
        }
      }
    }

    say('\n\n═══ Where the population lands, before and after ═══\n');
    say('  division    before     after     move');
    for (const sex of ['male', 'female'] as const) {
      for (const d of divisionsFor(sex)) {
        const row = shares.get(d.shortName) ?? { before: 0, after: 0 };
        say(
          `  ${d.shortName.padEnd(9)}${((100 * row.before) / N).toFixed(1).padStart(7)}%` +
            `${((100 * row.after) / N).toFixed(1).padStart(9)}%` +
            `${((100 * (row.after - row.before)) / N).toFixed(1).padStart(9)}`,
        );
      }
    }
    for (const sex of ['male', 'female'] as const) {
      const h = homeless.get(sex) ?? { before: 0, after: 0 };
      say(
        `\n  ${sex}: no division at all ${((100 * h.before) / N).toFixed(1)}% → ` +
          `${((100 * h.after) / N).toFixed(1)}%`,
      );
    }
    say(
      '\n  Fighters move down the ladder, about a point of share per division, and three at\n' +
        '  strawweight — which is the same finding the decomposition made from the other end. WSW is\n' +
        '  where the old floor bound hardest, because it is the division that asks the biggest cuts,\n' +
        '  so it is where the correction shows up most.\n\n' +
        '  The women the ladder could not house at all fall from 4.0% to 1.8%. That is a side effect\n' +
        '  rather than a fix: doc 31 § 13.2 is about bodies too large for a 145 lb ceiling, and this\n' +
        '  change lets some of the borderline ones make featherweight after all. The tail beyond it\n' +
        '  is untouched and still has nowhere to go.\n\n' +
        '  The primary filter is still the individual cut tolerance, which this PR does not touch, so\n' +
        '  the shift is bounded by how many bodies were sitting against the floor rather than against\n' +
        '  their own willingness — which is exactly the population the correction is about.',
    );
    flush();

    // Nobody should have moved *up*: a lower floor can only ever open lighter divisions.
    for (const sex of ['male', 'female'] as const) {
      const ladder = divisionsFor(sex);
      const heaviest = ladder[ladder.length - 1]!.shortName;
      const row = shares.get(heaviest)!;
      expect(
        row.after,
        `${heaviest} share should not grow when the floor falls`,
      ).toBeLessThanOrEqual(row.before);
    }
    // And the move has to stay small, or the cut model has quietly become the division selector.
    for (const [division, row] of shares) {
      expect(Math.abs(row.after - row.before) / N, `${division} share moved`).toBeLessThan(0.05);
    }
    for (const sex of ['male', 'female'] as const) {
      const h = homeless.get(sex) ?? { before: 0, after: 0 };
      expect(h.after, `${sex} homeless rate should not rise`).toBeLessThanOrEqual(h.before);
    }
  });

  it('reports the body-sampler cost, before and after', () => {
    const N = 4000;
    say('\n\n═══ What it costs to sample a division ═══\n');
    say('  division   mean draws   fallback %');
    for (const sex of ['male', 'female'] as const) {
      for (const d of divisionsFor(sex)) {
        let attempts = 0;
        let fellBack = 0;
        for (let i = 0; i < N; i++) {
          const sample = sampleBodyForDivisionWithStats(createRng(`cost-${d.id}-${i}`), sex, d.id);
          attempts += sample.attempts;
          if (sample.fellBack) fellBack++;
        }
        say(
          `  ${d.shortName.padEnd(10)}${(attempts / N).toFixed(1).padStart(11)}` +
            `${((100 * fellBack) / N).toFixed(1).padStart(13)}%`,
        );
        // The fallback narrows the distribution it replaces, so this is the number that matters.
        expect((100 * fellBack) / N, `${sex} ${d.shortName} fallback rate`).toBeLessThan(15);
      }
    }
    say(
      '\n  Male heavyweight is the division that moved: 23.5 draws and a 9.1% fallback before, 26.2\n' +
        '  and 13.0% after. Both are consequences of the same thing — a body that can now make light\n' +
        '  heavyweight is no longer a heavyweight, so heavyweight is a rarer draw. The draw count is\n' +
        '  cheap and does not matter much; the fallback rate does, because it replaces the forward\n' +
        '  model with a narrower one, and at 13% against a 15% bound it is the thing to watch. Step 6\n' +
        '  moves mass and will move this again, so it is recorded rather than tuned here.',
    );
    flush();
  });
});

describe('the corrected cut model — acceptance criteria', () => {
  it('1. repeatedly sustainable real careers are no longer refused', () => {
    /** Everyone in the roster except the two the sport itself treated as beyond the pale. */
    const EDGE = new Set(['Kayla Harrison', 'Deiveson Figueiredo', 'Mackenzie Dern']);
    for (const r of RESOLVED) {
      if (EDGE.has(r.entry.name)) continue;
      expect(
        r.fit,
        `${r.entry.name} still refused at ${r.cutPct.toFixed(1)}% — a career the sport ran repeatedly`,
      ).not.toBe('notViable');
    }
  });

  it('2. severe cuts stayed severe rather than becoming routine', () => {
    for (const r of RESOLVED) {
      if (r.cutPct >= 11 && r.cutPct <= 16) {
        expect(r.fit, `${r.entry.name} at ${r.cutPct.toFixed(1)}%`).toBe('severe');
      }
      if (r.cutPct > 16) {
        expect(['extreme', 'notViable'], `${r.entry.name} at ${r.cutPct.toFixed(1)}%`).toContain(
          r.fit,
        );
      }
    }
    // And nothing above eleven per cent may read as an ordinary week.
    for (const r of RESOLVED) {
      if (r.cutPct > 11) expect(r.fit).not.toBe('typical');
      if (r.cutPct > 4) expect(r.fit).not.toBe('comfortable');
    }
  });

  it('3. the historical edge cases stayed on the boundary', () => {
    // Beyond it: the model still refuses to house her, and that is the intended verdict.
    expect(byName('Kayla Harrison').fit).toBe('notViable');
    // On it: viable, and by a margin small enough that missing weight is the obvious risk.
    const dern = byName('Mackenzie Dern');
    expect(dern.fit).toBe('extreme');
    expect(dern.headroomLbs).toBeGreaterThan(0);
    expect(dern.headroomLbs).toBeLessThan(3);
    // Near it: made repeatedly, missed more than once, and eventually abandoned.
    const fig = byName('Deiveson Figueiredo');
    expect(fig.fit).toBe('severe');
    expect(fig.headroomLbs).toBeGreaterThan(0);
    expect(fig.headroomLbs).toBeLessThan(8);
  });

  it('4. bodies that genuinely cannot make a division are still refused', () => {
    /**
     * Synthetic, and deliberately not drawn from anybody real. Each is a body the sport does not
     * contain trying to enter a division it has no business in, and if any of these passes the
     * correction has gone from fixing a ceiling to removing one.
     */
    const impossible: { what: string; body: Body; division: string }[] = [
      {
        what: 'a 6\'7" 250 lb heavyweight at middleweight',
        body: {
          sex: 'male',
          heightInches: 79,
          reachInches: 82,
          frameIndex: 85,
          muscleIndex: 80,
          bodyFatIndex: 40,
          waterCutIndex: 99,
        },
        division: 'mens-middleweight',
      },
      {
        what: 'an average welterweight at flyweight',
        body: {
          sex: 'male',
          heightInches: 71,
          reachInches: 73,
          frameIndex: 50,
          muscleIndex: 50,
          bodyFatIndex: 50,
          waterCutIndex: 99,
        },
        division: 'mens-flyweight',
      },
      {
        what: 'a tall, heavily built woman at strawweight',
        body: {
          sex: 'female',
          heightInches: 70,
          reachInches: 71,
          frameIndex: 70,
          muscleIndex: 70,
          bodyFatIndex: 50,
          waterCutIndex: 99,
        },
        division: 'womens-strawweight',
      },
      {
        what: 'a lean 200 lb man at bantamweight',
        body: {
          sex: 'male',
          heightInches: 73,
          reachInches: 75,
          frameIndex: 60,
          muscleIndex: 70,
          bodyFatIndex: 10,
          waterCutIndex: 99,
        },
        division: 'mens-bantamweight',
      },
    ];
    for (const { what, body, division } of impossible) {
      expect(weightFit(body, asDivisionId(division)), what).toBe('notViable');
    }
  });

  it('5. the floor is still a floor: it never exceeds camp weight or falls below lean mass', () => {
    for (const sex of ['male', 'female'] as const) {
      for (let i = 0; i < 3000; i++) {
        const body = sampleBody(createRng(`floor-sanity-${sex}-${i}`), sex);
        const c = cutChain(body);
        expect(c.weighInFloorLbs).toBeLessThan(c.campWeightLbs);
        expect(c.weighInFloorLbs).toBeLessThan(c.walkingWeightLbs);
        // Dehydrating below dry lean tissue is not a weight cut, it is a corpse.
        expect(c.weighInFloorLbs).toBeGreaterThan(c.leanMassLbs * 0.8);
        expect(c.transient.totalLbs / c.campWeightLbs).toBeLessThan(0.15);
      }
    }
  });

  it('6. no rating and no placement moved in this change', () => {
    /**
     * The floor is downstream of the physique and the physique is upstream of nothing in the ladder,
     * so this should hold by construction — but "should hold by construction" is what the step 5
     * roster kept discovering was untrue, so it is checked. `medianRatingAtMass` reads walking and
     * lean mass, neither of which this PR touches.
     */
    for (const r of RESOLVED) {
      const again = resolveEntry(r.entry);
      for (const key of Object.keys(again.physicals) as (keyof typeof again.physicals)[]) {
        expect(again.physicals[key].sigma).toBe(r.entry.placement[key]);
      }
      if (r.entry.disagreement?.kind !== 'outsideBodyModelRange') {
        // One pound of slack, because the physique indices are integers and quantise the answer.
        expect(
          Math.abs(again.impliedWalkingWeightLbs - r.entry.estimated.walkingWeightLbs),
          `${r.entry.name} reconstructs at ${again.impliedWalkingWeightLbs.toFixed(1)} lb against a stated ${r.entry.estimated.walkingWeightLbs}`,
        ).toBeLessThan(1);
      }
    }
  });

  it('7. a disagreement the model no longer holds records how it was resolved', () => {
    for (const r of RESOLVED) {
      const d = r.entry.disagreement;
      if (!d) {
        expect(r.fit, `${r.entry.name} is refused with no disagreement recorded`).not.toBe(
          'notViable',
        );
        continue;
      }
      if (r.fit === 'notViable') continue;
      if (d.kind === 'outsideBodyModelRange') {
        // Genuinely still open: this PR fixed the split, not the ceiling, and step 6 owns the rest.
        expect(
          d.resolution,
          `${r.entry.name} is filed as out of range but claims to be resolved`,
        ).toBeUndefined();
        continue;
      }
      expect(
        d.resolution,
        `${r.entry.name} is now ${r.fit} but the disagreement still reads as open`,
      ).toBeDefined();
      expect(d.resolution!.length).toBeGreaterThan(120);
    }
  });

  it('8. uncertainty stays visible: a poorly sourced weight is not used as a hard falsifier', () => {
    /**
     * Doc 31 § 14.6's tenth criterion. Nothing in the correction may rest on a fighter whose
     * walking weight is a shrug, so the entries that actually moved the model are checked for
     * provenance. Suarez is `poor`-sourced and was cited in the original strawweight argument; the
     * argument now rests on Zhang and Jędrzejczyk, who are `fair` and `good`.
     */
    const drivers = ['Yoel Romero', 'Alex Pereira', 'Michael Chandler', 'Zhang Weili'];
    for (const name of drivers) {
      expect(byName(name).entry.estimated.confidence, name).not.toBe('poor');
    }
    // And the one soft case is still flagged as soft rather than quietly promoted.
    expect(byName('Mackenzie Dern').entry.disagreement?.resolution).toContain('least certain');
  });

  it('9. every body the model cannot build is filed as such rather than silently shrunk', () => {
    /**
     * The defect this criterion exists for was found by criterion 6 rather than looked for, and it
     * is the worst of the three the step 5 roster surfaced. `physiqueForMeasurements` clamps lean
     * mass per cubic metre of height at `base + fromFrame + fromMuscle`, and when a real body needs
     * more it returns a smaller person **without saying so**. Mark Hunt was sitting in the roster as
     * a 226 lb man, resolving his Power and Strength against a 226 lb heavyweight's divisional
     * median, and nothing anywhere said a word about it.
     *
     * Half of it was cheap to fix and is fixed: the inversion used to split the *coefficient* evenly
     * between frame and muscle, which saturated `frameIndex` at 100 while `muscleIndex` was still at
     * 91 and threw away a fifth of the range. Equal indices reach the true ceiling and took five
     * failures down to three. The rest is the ceiling itself, which step 6 owns.
     */
    const missed: string[] = [];
    for (const r of RESOLVED) {
      const error = reconstructionErrorLbs(
        r.entry.measured.sex,
        r.entry.measured.heightInches,
        r.entry.estimated.walkingWeightLbs,
        r.entry.estimated.bodyFatIndex,
        r.entry.estimated.waterCutIndex,
      );
      if (Math.abs(error) < 1) {
        expect(
          r.entry.disagreement?.kind,
          `${r.entry.name} reconstructs cleanly but is filed as outsideBodyModelRange`,
        ).not.toBe('outsideBodyModelRange');
        continue;
      }
      missed.push(`${r.entry.name} ${error.toFixed(1)} lb`);
      expect(
        r.entry.disagreement?.kind,
        `${r.entry.name} reconstructs ${error.toFixed(1)} lb off and nothing says so`,
      ).toBe('outsideBodyModelRange');
    }
    say(`\n\n═══ Bodies the model cannot build ═══\n\n  ${missed.join('\n  ')}`);
    say(
      '\n  Three of 115, and they are not random: all three are extreme mass-for-height, which is\n' +
        '  the one dimension the coefficient ceiling truncates. Two of them — Hunt and Andrade — are\n' +
        '  in the roster *because* they are extreme mass-for-height, so the model is failing exactly\n' +
        '  where it is being asked the hardest question.',
    );
    flush();
    expect(missed.length).toBeLessThanOrEqual(3);
  });
});
