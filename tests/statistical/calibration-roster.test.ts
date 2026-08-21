/**
 * The calibration roster, audited against the ladder it is supposed to calibrate.
 *
 * Doc 31 § 12 step 5 and § 13.8. This file has two jobs and they are worth separating in the reader's
 * head before anything below makes sense.
 *
 * **The report.** Most of what runs here prints. Every entry's five physicals are shown as the
 * arithmetic that produced them — division median, authored sigma, resulting rating, quantity
 * multiple, within-division percentile — because the deliverable of step 5 is a set of *judgements*
 * that a person can disagree with, and a judgement that only appears as a rating cannot be argued
 * with. If somebody thinks Holly Holm is not a −0.9σ puncher, the report is where they see the claim.
 *
 * **The acceptance criteria.** The assertions at the bottom are § 13.8's six, plus the eight added
 * when step 5 was approved. They check that the roster is *coherent* — that it spans its space, that
 * nothing clipped by accident, that the five attributes were assessed independently enough not to
 * reproduce the master-archetype problem. They deliberately do **not** check the roster against the
 * generator: `ceilingsFromNaturals` is still on the pre-ladder equations because the mass law is step
 * 6, so the generator cannot yet produce what this roster states. That gap is the point of the roster
 * rather than a defect in it, and closing it is step 6's work and step 7's measurement.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  CALIBRATION_ROSTER,
  MEN_CALIBRATION,
  WOMEN_CALIBRATION,
  describeEntry,
  resolveEntry,
  type CalibrationEntry,
  type ResolvedEntry,
} from '@mmasim/data';
import {
  ELITE_LIFT,
  PHYSICAL_SCALE_KEYS,
  asDivisionId,
  chosenDivision,
  createRng,
  cutRequiredFraction,
  divisionsFor,
  getDivision,
  leanMassLbs,
  medianRatingAtMass,
  ratingSd,
  sampleBody,
  sampleCutTolerance,
  underLimitLbs,
  walkingWeightLbs,
  type PhysicalScaleKey,
  type Sex,
} from '@mmasim/engine';

/**
 * Report lines are collected and emitted once per test rather than line by line.
 *
 * Not cosmetic. This file prints something like eight hundred lines, and every `console.log` inside
 * a vitest worker is an RPC back to the reporter — enough of them and the run ends with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"`, which looks exactly like a broken test and is
 * not one. One call per test keeps the same output and stops the reporter drowning.
 */
const pending: string[] = [];
const say = (line: string) => pending.push(line);
afterEach(() => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
});

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** Pearson correlation, for the archetype check. */
function correlation(a: number[], b: number[]): number {
  const [ma, mb] = [mean(a), mean(b)];
  const cov = mean(a.map((x, i) => (x - ma) * (b[i]! - mb)));
  const denom = sd(a) * sd(b);
  return denom === 0 ? 0 : cov / denom;
}

const resolved: ResolvedEntry[] = CALIBRATION_ROSTER.map(resolveEntry);
const byId = new Map(resolved.map((r) => [r.entry.id, r]));
const get = (id: string): ResolvedEntry => {
  const r = byId.get(id);
  if (!r) throw new Error(`no calibration entry ${id}`);
  return r;
};
const inDivision = (division: string) =>
  resolved.filter((r) => r.entry.measured.division === division);
const maxSigma = (entry: CalibrationEntry) =>
  Math.max(...PHYSICAL_SCALE_KEYS.map((k) => Math.abs(entry.placement[k])));

/** Divisions in roster order: heaviest first, men then women. */
const DIVISIONS: { sex: Sex; id: string }[] = [
  ...divisionsFor('male')
    .slice()
    .reverse()
    .map((d) => ({ sex: 'male' as const, id: d.id })),
  ...divisionsFor('female')
    .slice()
    .reverse()
    .map((d) => ({ sex: 'female' as const, id: d.id })),
];

/**
 * The § 4.3 major-promotion p50 for each division, transcribed.
 *
 * Kept here rather than imported because it is the *doc's* table, and the point of criterion 4 is to
 * check that the authored roster has not drifted away from what the document says the sport looks
 * like. Reading it out of the same function the roster is built on would make the check circular.
 */
const DOC_P50: Record<string, Record<PhysicalScaleKey, number>> = {
  'mens-heavyweight': { power: 70, speed: 51, cardio: 52, durability: 61, strength: 72 },
  'mens-light-heavyweight': { power: 65, speed: 54, cardio: 55, durability: 60, strength: 66 },
  'mens-middleweight': { power: 61, speed: 56, cardio: 57, durability: 58, strength: 61 },
  'mens-welterweight': { power: 58, speed: 57, cardio: 58, durability: 57, strength: 57 },
  'mens-lightweight': { power: 55, speed: 59, cardio: 60, durability: 56, strength: 53 },
  'mens-featherweight': { power: 52, speed: 61, cardio: 62, durability: 55, strength: 49 },
  'mens-bantamweight': { power: 49, speed: 62, cardio: 63, durability: 54, strength: 45 },
  'mens-flyweight': { power: 47, speed: 64, cardio: 65, durability: 53, strength: 42 },
};

describe('calibration roster — the report', () => {
  it('prints every entry as the arithmetic that produced it', () => {
    for (const { sex, id } of DIVISIONS) {
      const entries = inDivision(id);
      if (entries.length === 0) continue;
      const division = getDivision(asDivisionId(id));
      say(
        `\n\n═══ ${division.name} (${division.limitLbs} lb, ${sex}) — ${entries.length} entries ═══`,
      );
      for (const r of entries) say(`\n${describeEntry(r)}`);
    }
    expect(resolved.length).toBeGreaterThan(90);
  });

  it('prints the per-division percentile tables the roster implies', () => {
    say('\n\n═══ Authored ratings by division ═══');
    say('       n   attribute    min  p25  p50  p75  max   |  doc §4.3 p50   drift');
    for (const { id } of DIVISIONS) {
      const entries = inDivision(id);
      if (entries.length === 0) continue;
      const division = getDivision(asDivisionId(id));
      say(`\n  ${division.name}`);
      for (const key of PHYSICAL_SCALE_KEYS) {
        const rs = entries.map((r) => r.physicals[key].rating).sort((a, b) => a - b);
        const q = (p: number) => rs[Math.min(rs.length - 1, Math.floor(p * rs.length))]!;
        const doc = DOC_P50[id]?.[key];
        const drift = doc === undefined ? '' : (median(rs) - doc).toFixed(0).padStart(6);
        say(
          `      ${String(rs.length).padStart(2)}   ${key.padEnd(11)}` +
            [rs[0]!, q(0.25), median(rs), q(0.75), rs[rs.length - 1]!]
              .map((v) => String(v).padStart(4))
              .join(' ') +
            `   |  ${doc === undefined ? '   —' : String(doc).padStart(4)}       ${drift}`,
        );
      }
    }
  });

  it('prints the authored sigma distribution, which is the actual human input', () => {
    say('\n\n═══ Authored σ placements ═══');
    say('  attribute     mean     sd     min     max   |  share |σ|>1.5');
    for (const key of PHYSICAL_SCALE_KEYS) {
      const ss = CALIBRATION_ROSTER.map((e) => e.placement[key]);
      const extreme = ss.filter((s) => Math.abs(s) > 1.5).length / ss.length;
      say(
        `  ${key.padEnd(11)}` +
          [mean(ss), sd(ss), Math.min(...ss), Math.max(...ss)]
            .map((v) => v.toFixed(2).padStart(7))
            .join(' ') +
          `   |  ${(100 * extreme).toFixed(0)}%`,
      );
    }
    const all = CALIBRATION_ROSTER.flatMap((e) => PHYSICAL_SCALE_KEYS.map((k) => e.placement[k]));
    say(
      `  ${'all five'.padEnd(11)}${mean(all).toFixed(2).padStart(7)} ${sd(all).toFixed(2).padStart(6)}`,
    );
  });

  it('prints cross-division comparisons, which is what absoluteness means', () => {
    say('\n\n═══ Cross-division comparisons ═══');
    say('\n  The claim absoluteness makes: a rating means the same thing everywhere.\n');
    const rows: [string, PhysicalScaleKey, string, PhysicalScaleKey][] = [
      ['cal_ngannou', 'power', 'cal_moreno', 'power'],
      ['cal_pantoja', 'power', 'cal_lewis', 'power'],
      ['cal_moreno', 'speed', 'cal_ngannou', 'speed'],
      ['cal_hunt', 'speed', 'cal_figueiredo', 'speed'],
      ['cal_harrison', 'strength', 'cal_waterson', 'strength'],
      ['cal_cyborg', 'power', 'cal_namajunas', 'power'],
    ];
    for (const [aId, aKey, bId, bKey] of rows) {
      const a = byId.get(aId);
      const b = byId.get(bId);
      if (!a || !b) continue;
      const pa = a.physicals[aKey];
      const pb = b.physicals[bKey];
      say(
        `  ${a.entry.name} ${aKey} ${pa.rating} (${pa.quantityMultiple.toFixed(2)}×)` +
          `  vs  ${b.entry.name} ${bKey} ${pb.rating} (${pb.quantityMultiple.toFixed(2)}×)` +
          `  →  ${(pa.quantityMultiple / pb.quantityMultiple).toFixed(2)}× the quantity`,
      );
    }

    say('\n  Every division, top and bottom of the authored range:\n');
    for (const key of PHYSICAL_SCALE_KEYS) {
      say(`    ${key}`);
      for (const { id } of DIVISIONS) {
        const entries = inDivision(id);
        if (entries.length === 0) continue;
        const sorted = [...entries].sort(
          (a, b) => a.physicals[key].rating - b.physicals[key].rating,
        );
        const lo = sorted[0]!;
        const hi = sorted[sorted.length - 1]!;
        say(
          `      ${getDivision(asDivisionId(id)).shortName.padEnd(5)}` +
            `${String(lo.physicals[key].rating).padStart(3)} ${lo.entry.name.padEnd(22)}` +
            ` … ${String(hi.physicals[key].rating).padStart(3)} ${hi.entry.name}`,
        );
      }
    }
  });

  it('prints the body-model and weight-fit exceptions rather than hiding them', () => {
    say('\n\n═══ Body model vs. careers that really happened ═══');
    say(
      '\n  A real fighter the model rejects is evidence about the model. Nothing here was\n' +
        '  trimmed to make the model comfortable; the disagreements are classified instead.\n',
    );
    say('  fighter                  div    walk  implied   lean   cut/under      fit');
    const flagged = resolved.filter(
      (r) =>
        r.fit === 'severe' || r.fit === 'extreme' || r.fit === 'notViable' || r.entry.disagreement,
    );
    for (const r of flagged) {
      const limit = getDivision(asDivisionId(r.entry.measured.division)).limitLbs;
      const cut = cutRequiredFraction(r.body, limit);
      const under = underLimitLbs(r.body, limit);
      say(
        `  ${r.entry.name.padEnd(24)}${getDivision(asDivisionId(r.entry.measured.division)).shortName.padEnd(6)}` +
          `${String(r.entry.estimated.walkingWeightLbs).padStart(4)}` +
          `${r.impliedWalkingWeightLbs.toFixed(0).padStart(9)}` +
          `${r.leanMassLbs.toFixed(0).padStart(7)}` +
          `${(cut > 0 ? `  cut ${(100 * cut).toFixed(1)}%` : `  under ${under.toFixed(0)} lb`).padEnd(14)}` +
          `${r.fit}`,
      );
    }
    say('\n  Classified disagreements:\n');
    for (const r of resolved) {
      if (!r.entry.disagreement) continue;
      say(`  ${r.entry.name} — ${r.entry.disagreement.kind} (model says: ${r.fit})`);
      say(`      ${r.entry.disagreement.note}\n`);
    }
    const counts = new Map<string, number>();
    for (const r of resolved) counts.set(r.fit, (counts.get(r.fit) ?? 0) + 1);
    say(`  fit distribution: ${[...counts].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  });

  it('prints the implied male and female physical distributions', () => {
    say('\n\n═══ Implied distributions by sex ═══');
    for (const [label, list] of [
      ['men', MEN_CALIBRATION],
      ['women', WOMEN_CALIBRATION],
    ] as const) {
      say(`\n  ${label} — ${list.length} entries`);
      say('    attribute     mean     sd     min     max');
      for (const key of PHYSICAL_SCALE_KEYS) {
        const rs = list.map((e) => get(e.id).physicals[key].rating);
        say(
          `    ${key.padEnd(11)}` +
            [mean(rs), sd(rs), Math.min(...rs), Math.max(...rs)]
              .map((v) => v.toFixed(1).padStart(7))
              .join(' '),
        );
      }
    }
    say(
      '\n  These are not comparable across the two blocks and are not meant to be. The female\n' +
        '  ladder pivots on the median female professional, so a woman at rating 70 for Power is\n' +
        '  claiming a position among women. Doc 31 § 3 is explicit that no cross-sex quantity\n' +
        '  comparison is being asserted by these numbers.',
    );
  });

  it('reports the female no-division rate as context, without solving it', () => {
    const N = 4000;
    let homeless = 0;
    for (let i = 0; i < N; i++) {
      const rng = createRng(`cal-women-${i}`);
      const body = sampleBody(rng.fork('body'), 'female');
      if (!chosenDivision(body, 'female', sampleCutTolerance(rng.fork('cut')))) homeless++;
    }
    say(
      `\n\n═══ Context: women the ladder has no division for ═══\n\n` +
        `  ${((100 * homeless) / N).toFixed(1)}% of ${N} sampled female bodies are larger than the\n` +
        `  145 lb ceiling of the heaviest women's division the promotion runs, and chosenDivision\n` +
        `  correctly returns undefined for them rather than inventing a home.\n\n` +
        `  Reported here because it bounds what the women's half of this roster can calibrate: the\n` +
        `  authored entries all live under 145, so nothing in this file says anything about the tail\n` +
        `  the sport does not currently have a class for. Doc 31 § 14 owns the question; step 5 does\n` +
        `  not touch it.`,
    );
    expect(homeless / N).toBeLessThan(0.15);
  });
});

describe('calibration roster — acceptance criteria (doc 31 § 13.8)', () => {
  it('1. every rating reproduces from its stated placement and body', () => {
    for (const r of resolved) {
      const lean = leanMassLbs(r.body);
      const walking = walkingWeightLbs(r.body);
      for (const key of PHYSICAL_SCALE_KEYS) {
        const expected =
          medianRatingAtMass(key, r.entry.measured.sex, walking, lean) +
          ELITE_LIFT[key] +
          r.entry.placement[key] * ratingSd(key);
        expect(r.physicals[key].unclippedRating).toBeCloseTo(expected, 6);
      }
    }
  });

  it('2. every entry the model rejects carries a classified disagreement', () => {
    const rejected = resolved.filter((r) => r.fit === 'notViable');
    for (const r of rejected) {
      expect(
        r.entry.disagreement,
        `${r.entry.name} is notViable at ${r.entry.measured.division} with no disagreement recorded`,
      ).toBeDefined();
    }
    // And the roster must contain at least one, or it has only calibrated cases the model already
    // agreed with, which calibrates nothing.
    expect(resolved.some((r) => r.entry.disagreement)).toBe(true);
  });

  it('3a. heavyweight has two athletic freaks and two plodders on Speed', () => {
    const hw = inDivision('mens-heavyweight');
    expect(hw.filter((r) => r.physicals.speed.rating >= 62).length).toBeGreaterThanOrEqual(2);
    expect(hw.filter((r) => r.physicals.speed.rating <= 44).length).toBeGreaterThanOrEqual(2);
  });

  it('3b. a flyweight reaches the top of his division for Power', () => {
    const flw = inDivision('mens-flyweight');
    const best = Math.max(...flw.map((r) => r.physicals.power.rating));
    expect(best).toBeGreaterThanOrEqual(62);
    // …and remains far below an ordinary heavyweight, which is the whole point of absoluteness.
    expect(best).toBeLessThan(
      median(inDivision('mens-heavyweight').map((r) => r.physicals.power.rating)),
    );
  });

  it('3c. Cardio has outliers at both ends so § 5’s comparison is testable', () => {
    const sigmas = CALIBRATION_ROSTER.map((e) => e.placement.cardio);
    expect(Math.max(...sigmas)).toBeGreaterThanOrEqual(1.8);
    expect(Math.min(...sigmas)).toBeLessThanOrEqual(-1.5);
  });

  it('3d. every weight band has a physically ordinary elite technician', () => {
    const bands: [string, string[]][] = [
      ['heavy', ['mens-heavyweight', 'mens-light-heavyweight']],
      ['middle', ['mens-middleweight', 'mens-welterweight']],
      ['light', ['mens-lightweight', 'mens-featherweight']],
      ['small', ['mens-bantamweight', 'mens-flyweight']],
      [
        'women',
        ['womens-bantamweight', 'womens-flyweight', 'womens-strawweight', 'womens-featherweight'],
      ],
    ];
    for (const [label, divisions] of bands) {
      const ordinary = resolved.filter(
        (r) => divisions.includes(r.entry.measured.division) && maxSigma(r.entry) <= 1.0,
      );
      expect(
        ordinary.length,
        `${label} band has no physically ordinary entry`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('3e. a huge lightweight with a brutal cut and a small welterweight with none', () => {
    const lw = inDivision('mens-lightweight');
    const ww = inDivision('mens-welterweight');
    expect(lw.some((r) => r.fit === 'severe' || r.fit === 'extreme' || r.fit === 'notViable')).toBe(
      true,
    );
    expect(ww.some((r) => r.fit === 'comfortable' || r.fit === 'typical')).toBe(true);
  });

  it('3f. an unusually strong grappler at 145 and an unusually weak one at 205', () => {
    expect(
      Math.max(...inDivision('mens-featherweight').map((r) => r.entry.placement.strength)),
    ).toBeGreaterThanOrEqual(1.3);
    expect(
      Math.min(...inDivision('mens-light-heavyweight').map((r) => r.entry.placement.strength)),
    ).toBeLessThanOrEqual(-1.0);
  });

  it('3g. every division contains a profile that contradicts its median shape', () => {
    // A heavy division's shape is power-and-strength-up, speed-and-cardio-down; a light one's is the
    // reverse. A contradicting entry is one whose placements run against that gradient.
    for (const { id } of DIVISIONS) {
      const entries = inDivision(id);
      if (entries.length === 0) continue;
      const heavy = getDivision(asDivisionId(id)).limitLbs >= 170;
      const contradicts = entries.some((r) =>
        heavy
          ? r.entry.placement.speed > 0.6 || r.entry.placement.cardio > 0.9
          : r.entry.placement.power > 0.9 || r.entry.placement.strength > 0.9,
      );
      expect(contradicts, `${id} has no counter-shape entry`).toBe(true);
    }
  });

  it('4. per-division medians stay near the doc § 4.3 major-promotion p50', () => {
    /**
     * This criterion caught the one substantive authoring error in step 5 and is worth reading with
     * that in mind. The first draft of the roster ran a mean drift of **+8.7 rating points**, with
     * Power at **+1.2σ to +1.5σ in every men's division** — the roster's median heavyweight was
     * being placed at his division's 95th percentile for punching force. The cause was a specific
     * confusion rather than a general optimism: *famous finisher* was being read as *hardest
     * hitter*, when knockouts come from timing, accuracy and the opponent's chin at least as much as
     * from force. Two corrections followed. Placements were re-authored downward where the evidence
     * was a highlight reel rather than a physical fact, and thirteen fighters were **added** —
     * Volkov, Gane, Tybura, Formiga, Font and the rest — because the sample itself was drawn from
     * the fighters people remember, which selects hardest on Power.
     *
     * The residual is the honest part. A calibration roster cannot sit *at* its divisions' medians,
     * because a landmark is by definition somebody worth watching, so a few points of positive drift
     * is the correct answer rather than a tolerated one. The bound below is set where the corrected
     * roster actually lands, and a future roster that drifts past it should be re-authored, not
     * re-bounded.
     */
    const drifts: number[] = [];
    for (const [id, p50] of Object.entries(DOC_P50)) {
      const entries = inDivision(id);
      if (entries.length === 0) continue;
      for (const key of PHYSICAL_SCALE_KEYS) {
        const drift = median(entries.map((r) => r.physicals[key].rating)) - p50[key];
        drifts.push(drift);
        expect(
          Math.abs(drift),
          `${id} ${key} drifted ${drift.toFixed(1)} from doc §4.3`,
        ).toBeLessThan(10);
      }
    }
    expect(mean(drifts)).toBeGreaterThan(-2);
    expect(mean(drifts)).toBeLessThan(6);
    say(`\n  mean drift from doc §4.3 p50: ${mean(drifts).toFixed(1)} rating points`);
  });

  it('5. nothing exceeds the scale, and the top band belongs to +2.4σ draws', () => {
    for (const r of resolved) {
      for (const key of PHYSICAL_SCALE_KEYS) {
        const p = r.physicals[key];
        expect(p.rating, `${r.entry.name} ${key}`).toBeLessThanOrEqual(100);
        if (p.rating >= 96) {
          expect(
            p.sigma,
            `${r.entry.name} ${key} is ${p.rating} at only ${p.sigma}σ`,
          ).toBeGreaterThanOrEqual(2.0);
        }
      }
    }
  });

  it('6. every notes field justifies its placements', () => {
    for (const e of CALIBRATION_ROSTER) {
      expect(e.notes.length, `${e.name} note is too short to justify anything`).toBeGreaterThan(
        180,
      );
      const named = PHYSICAL_SCALE_KEYS.filter((k) => e.notes.toLowerCase().includes(k)).length;
      expect(
        named,
        `${e.name} note names only ${named} of the five physicals`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('6b. and every sigma the prose quotes is the sigma the entry actually holds', () => {
    /**
     * The other half of criterion 6, and the one that keeps it honest over time. A note reading
     * "Power +1.7 against Durability −0.9 is precisely the profile a correlated model cannot
     * produce" is only a justification while those are still the numbers; once somebody re-places
     * the fighter and leaves the prose alone, the file is asserting something it no longer contains
     * and the reader has no way to tell. Step 5 rebalanced 187 placements in one pass and this is
     * what caught the prose that did not move with them.
     */
    for (const e of CALIBRATION_ROSTER) {
      for (const m of e.notes.matchAll(
        /\b(Power|Speed|Cardio|Durability|Strength) ([+−-])(\d\.\d)/g,
      )) {
        const key = m[1]!.toLowerCase() as PhysicalScaleKey;
        const quoted = Number(m[3]) * (m[2] === '+' ? 1 : -1);
        expect(e.placement[key], `${e.name}: note quotes ${m[1]} ${m[2]}${m[3]}`).toBeCloseTo(
          quoted,
          6,
        );
      }
    }
  });
});

describe('calibration roster — acceptance criteria added at step 5 approval', () => {
  it('1. every physical is an nσ judgement, never a typed rating', () => {
    const allowed = new Set([
      'id',
      'name',
      'measured',
      'estimated',
      'placement',
      'alsoFought',
      'notes',
      'disagreement',
    ]);
    for (const e of CALIBRATION_ROSTER) {
      for (const key of Object.keys(e))
        expect(allowed.has(key), `${e.name} has field ${key}`).toBe(true);
      for (const key of PHYSICAL_SCALE_KEYS) {
        const s = e.placement[key];
        expect(Number.isFinite(s), `${e.name} ${key}`).toBe(true);
        expect(
          Math.abs(s),
          `${e.name} ${key} at ${s}σ is past what a human population contains`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  it('2. no rating clips, except deliberate near-human-limit anchors', () => {
    /** The one place the scale is allowed to be pressed against its ceiling, and why. */
    const ANCHORS = new Set<string>([]);
    for (const r of resolved) {
      for (const key of PHYSICAL_SCALE_KEYS) {
        const p = r.physicals[key];
        const clipped = Math.abs(p.unclippedRating - p.rating) > 0.5;
        if (clipped) {
          expect(
            ANCHORS.has(`${r.entry.id}:${key}`),
            `${r.entry.name} ${key} clipped from ${p.unclippedRating.toFixed(1)} without being a declared anchor`,
          ).toBe(true);
        }
      }
    }
  });

  it('3. every division has ordinary cases as well as exceptional ones', () => {
    for (const { id } of DIVISIONS) {
      const entries = inDivision(id);
      expect(entries.length, `${id} has no calibration entries`).toBeGreaterThanOrEqual(4);
      const ordinary = entries.filter((r) => maxSigma(r.entry) <= 1.2).length;
      const exceptional = entries.filter((r) => maxSigma(r.entry) >= 1.5).length;
      expect(ordinary, `${id} has no ordinary athletes — only freaks`).toBeGreaterThanOrEqual(1);
      expect(exceptional, `${id} has no exceptional athletes`).toBeGreaterThanOrEqual(1);
    }
  });

  it('4. cross-division comparisons read the way absoluteness requires', () => {
    const powerMedian = (id: string) => median(inDivision(id).map((r) => r.physicals.power.rating));
    const speedMedian = (id: string) => median(inDivision(id).map((r) => r.physicals.speed.rating));
    const mens = divisionsFor('male').map((d) => d.id);
    /**
     * Power rises with the division limit and Speed falls — as *medians*, and non-strictly.
     *
     * The first draft demanded a strict increase at every rung and failed on a featherweight and a
     * bantamweight whose Speed medians were both 66. That was the assertion being wrong rather than
     * the roster: these are integer medians of nine or ten authored entries, so two adjacent
     * divisions tying is an ordinary sampling outcome and says nothing about the ladder. What
     * absoluteness actually claims is the direction over the whole ladder, which is what the span
     * check below tests, and the per-rung check is here only to catch an inversion.
     */
    for (let i = 1; i < mens.length; i++) {
      expect(
        powerMedian(mens[i]!),
        `power median ${mens[i]} vs ${mens[i - 1]}`,
      ).toBeGreaterThanOrEqual(powerMedian(mens[i - 1]!));
      expect(
        speedMedian(mens[i]!),
        `speed median ${mens[i]} vs ${mens[i - 1]}`,
      ).toBeLessThanOrEqual(speedMedian(mens[i - 1]!));
    }
    const first = mens[0]!;
    const last = mens[mens.length - 1]!;
    expect(powerMedian(last) - powerMedian(first)).toBeGreaterThan(20);
    expect(speedMedian(first) - speedMedian(last)).toBeGreaterThan(10);
    // And the strongest man in the lightest division is still weaker than the median heavyweight.
    expect(
      Math.max(...inDivision('mens-flyweight').map((r) => r.physicals.strength.rating)),
    ).toBeLessThan(median(inDivision('mens-heavyweight').map((r) => r.physicals.strength.rating)));
  });

  it('5. enough multi-division fighters for step 7 to test the mass law', () => {
    const movers = CALIBRATION_ROSTER.filter((e) => (e.alsoFought?.length ?? 0) > 0);
    expect(movers.length).toBeGreaterThanOrEqual(10);
    expect(movers.filter((e) => e.measured.sex === 'female').length).toBeGreaterThanOrEqual(2);
    say('\n\n═══ Cross-division movers (step 7’s controlled comparison) ═══\n');
    for (const e of movers) {
      const all = [e.measured.division, ...(e.alsoFought ?? [])]
        .map((d) => getDivision(asDivisionId(d)).shortName)
        .join(' / ');
      say(`  ${e.name.padEnd(24)}${all}`);
    }
  });

  it('6. body-model disagreements are surfaced with a classification, not normalised away', () => {
    const disagreements = CALIBRATION_ROSTER.filter((e) => e.disagreement);
    expect(disagreements.length).toBeGreaterThanOrEqual(2);
    for (const e of disagreements) {
      expect(
        e.disagreement!.note.length,
        `${e.name} disagreement note is too thin`,
      ).toBeGreaterThan(120);
    }
  });

  it('7. the five physicals were assessed independently enough to break the archetype', () => {
    say('\n\n═══ Placement correlations (the archetype check) ═══\n');
    let worst = 0;
    for (let i = 0; i < PHYSICAL_SCALE_KEYS.length; i++) {
      for (let j = i + 1; j < PHYSICAL_SCALE_KEYS.length; j++) {
        const a = PHYSICAL_SCALE_KEYS[i]!;
        const b = PHYSICAL_SCALE_KEYS[j]!;
        const rho = correlation(
          CALIBRATION_ROSTER.map((e) => e.placement[a]),
          CALIBRATION_ROSTER.map((e) => e.placement[b]),
        );
        worst = Math.max(worst, Math.abs(rho));
        say(`  ${a.padEnd(11)}× ${b.padEnd(11)} ρ = ${rho.toFixed(2)}`);
      }
    }
    say(
      '\n  The generated population currently sits at ρ = 0.85 for Power × Strength (doc 31 § 13.1).\n' +
        '  These are the placements a person made attribute by attribute, so they are what step 6 is\n' +
        '  aiming at rather than a description of what the generator does today.',
    );
    expect(worst).toBeLessThan(0.7);
  });

  it('8. the roster is completely separate from the step 3 talent axes', () => {
    // The hand-authored path never consults `tier`, `athleticTier` or the naturals, so this roster
    // answers a different question from `talent-axes.test.ts` and the two must not be read together.
    const allowed = new Set([
      'id',
      'name',
      'measured',
      'estimated',
      'placement',
      'alsoFought',
      'notes',
      'disagreement',
    ]);
    const forbidden = ['tier', 'naturals', 'attributes', 'potential', 'aptitude', 'motorLearning'];
    for (const e of CALIBRATION_ROSTER) {
      for (const key of Object.keys(e)) {
        expect(allowed.has(key)).toBe(true);
        expect(forbidden).not.toContain(key);
      }
    }
  });
});
