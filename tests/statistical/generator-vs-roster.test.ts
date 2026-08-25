/**
 * The generated population against the calibration roster.
 *
 * Doc 31 § 19. Step 5 authored 115 fighters as `division median + n × σ` and step 6 put the
 * generator on the same ladder, so for the first time the two can be asked the same question. This
 * is the comparison § 13.8 said step 5 could not make and step 7 would have to.
 *
 * **What it is not.** It is not a fit. Doc 31 § 16.1 is explicit that the roster is a set of
 * landmarks drawn from fighters people have watched — it selects hard for being worth watching and
 * sits above its divisions by construction, at about +0.51σ. A generator matching the roster's mean
 * would be wrong. § 4.3's percentile tables are what the population is measured against; the roster
 * answers the different question of whether a rating of 88 means what somebody thinks it means.
 *
 * So the assertions here are about **shape and overlap**, never about central tendency: does the
 * generator reach where the roster's landmarks are, does it place them where a person would, and
 * does it agree about which way each attribute moves with mass.
 */

import { describe, expect, it } from 'vitest';
import { CALIBRATION_ROSTER, resolveEntry } from '@mmasim/data';
import {
  PHYSICAL_SCALE_KEYS,
  asDivisionId,
  createRng,
  divisionsFor,
  generateFighter,
  type PhysicalScaleKey,
  type Sex,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Generated potentials, keyed by division. */
const GENERATED = new Map<string, Record<PhysicalScaleKey, number[]>>();
for (const sex of ['male', 'female'] as const) {
  for (const division of divisionsFor(sex)) {
    const rng = createRng(`gvr:${division.id}`);
    const fighters = Array.from({ length: 600 }, (_, i) => {
      const gen = rng.fork(`f${i}`);
      const isProspect = gen.chance(0.085);
      return generateFighter(gen, {
        id: `gvr_${division.id}_${i}`,
        divisionId: asDivisionId(division.id as string),
        sex,
        day: 0,
        tier: isProspect ? Math.round(gen.normalClamped(78, 9, 62, 97)) : undefined,
      });
    });
    const byKey = {} as Record<PhysicalScaleKey, number[]>;
    for (const key of PHYSICAL_SCALE_KEYS) byKey[key] = fighters.map((f) => f.potential[key]);
    GENERATED.set(division.id as string, byKey);
  }
}

const ROSTER = CALIBRATION_ROSTER.map(resolveEntry);

describe('the generator against the calibration roster', () => {
  it("reports how extreme each landmark is on the generator's own scale", () => {
    /**
     * The first draft of this asserted that every roster rating fell inside the range of a
     * 600-fighter generated division, and it failed on eleven entries — nine of them Cardio. The
     * assertion was wrong rather than the generator. A roster entry is placed in sigmas above his
     * *major-promotion* division, and the generated division is everybody, so a landmark like
     * Dvalishvili at +2.9σ over the UFC median sits near four sigma over the population one. That
     * is rarer than one in six hundred by construction, and a sample of six hundred not containing
     * him is arithmetic rather than a defect.
     *
     * So the question is asked properly: **how far into its own tail would the generator have to
     * reach?** Under four sigma is a fighter the world will produce given enough of them; past that
     * is a landmark the generator cannot make at any population size, which would be a real hole.
     */
    const extremes: { name: string; key: PhysicalScaleKey; sigma: number }[] = [];
    for (const resolved of ROSTER) {
      const generated = GENERATED.get(resolved.entry.measured.division);
      if (!generated) continue;
      for (const key of PHYSICAL_SCALE_KEYS) {
        const list = generated[key];
        const centre = mean(list);
        const spread = Math.sqrt(mean(list.map((v) => (v - centre) ** 2)));
        extremes.push({
          name: resolved.entry.name,
          key,
          sigma: (resolved.physicals[key].rating - centre) / spread,
        });
      }
    }
    extremes.sort((a, b) => b.sigma - a.sigma);
    say('\n\n═══ The landmarks, in generated sigmas ═══\n');
    say(
      "  How far into the generated division's own tail each authored rating sits. A UFC roster is\n" +
        '  the top of a much larger population, so every one of these should be positive and the\n' +
        '  best of them well past two.\n',
    );
    for (const e of extremes.slice(0, 10)) {
      say(`  ${e.name.padEnd(24)}${e.key.padEnd(12)}+${e.sigma.toFixed(2)}σ`);
    }
    say('  …');
    for (const e of extremes.slice(-4)) {
      say(`  ${e.name.padEnd(24)}${e.key.padEnd(12)}${e.sigma.toFixed(2)}σ`);
    }
    flush();

    const worst = extremes[0]!;
    expect(
      worst.sigma,
      `${worst.name}'s ${worst.key} needs ${worst.sigma.toFixed(2)} generated sigmas — past what any population size reaches`,
    ).toBeLessThan(4.5);
    // And the roster must genuinely be the top of the population, not a slice through its middle.
    expect(mean(extremes.map((e) => e.sigma))).toBeGreaterThan(0.2);
  });

  it('agrees with the roster about where each landmark sits in his division', () => {
    say('\n\n═══ Authored fighters, as percentiles of their generated division ═══\n');
    say(
      '  A roster entry was placed at n sigmas above his division by a person. This is where the\n' +
        '  generator actually puts that rating. The two are different populations — the roster is a\n' +
        '  major-promotion landmark set and the generated division is everybody — so the generated\n' +
        '  percentile should sit *above* the authored one, consistently and not enormously.\n',
    );
    say('  attribute     authored pct   generated pct   gap');
    const gaps: number[] = [];
    for (const key of PHYSICAL_SCALE_KEYS) {
      const authored: number[] = [];
      const generatedPct: number[] = [];
      for (const resolved of ROSTER) {
        const generated = GENERATED.get(resolved.entry.measured.division);
        if (!generated) continue;
        authored.push(resolved.physicals[key].divisionPercentile);
        const list = generated[key];
        generatedPct.push(
          (100 * list.filter((v) => v < resolved.physicals[key].rating).length) / list.length,
        );
      }
      const gap = mean(generatedPct) - mean(authored);
      gaps.push(gap);
      say(
        `  ${key.padEnd(13)}${mean(authored).toFixed(1).padStart(9)}` +
          `${mean(generatedPct).toFixed(1).padStart(16)}` +
          `${gap.toFixed(1).padStart(8)}`,
      );
    }
    flush();
    for (const gap of gaps) {
      // Above, because the roster is elite-selected; not far above, or the ladder has drifted.
      expect(gap).toBeGreaterThan(-10);
      expect(gap).toBeLessThan(45);
    }
  });

  it('agrees about which way each physical moves with mass', () => {
    /**
     * The strongest single claim the ladder makes, and the one the pre-step-6 generator got wrong
     * for three of the five. Both populations should say that Power and Strength rise across the
     * divisions, that Speed and Cardio fall, and that Durability barely moves — because those are
     * `PHYSICAL_SCALE`'s exponents, and the roster was authored without ever consulting them.
     */
    say('\n\n═══ Direction of travel across the divisions ═══\n');
    say('  attribute     roster    generated');
    for (const key of PHYSICAL_SCALE_KEYS) {
      const mens = divisionsFor('male');
      const rosterBy = mens.map((d) =>
        mean(
          ROSTER.filter((r) => r.entry.measured.division === (d.id as string)).map(
            (r) => r.physicals[key].rating,
          ),
        ),
      );
      const generatedBy = mens.map((d) => mean(GENERATED.get(d.id as string)![key]));
      const rosterSlope = rosterBy[rosterBy.length - 1]! - rosterBy[0]!;
      const generatedSlope = generatedBy[generatedBy.length - 1]! - generatedBy[0]!;
      say(
        `  ${key.padEnd(13)}${rosterSlope.toFixed(1).padStart(7)}${generatedSlope.toFixed(1).padStart(13)}`,
      );
      expect(
        Math.sign(rosterSlope),
        `${key}: roster ${rosterSlope.toFixed(1)}, generated ${generatedSlope.toFixed(1)}`,
      ).toBe(Math.sign(generatedSlope));
    }
    flush();
  });

  it('puts the female ladder on the female pivot, in generation and not only in the roster', () => {
    /**
     * Step 6 is where `medianRatingAtMass`'s sex argument first reaches the generator. Before it,
     * generation had no sex term at all in the physicals: a 135 lb woman and a 135 lb man got the
     * same Power ceiling from the same explosiveness, which doc 31 § 2.3 spends a section saying is
     * wrong. The check is that a woman at her sex's pivot weight and a man at his land in the same
     * place — that is what a per-sex pivot *means*.
     */
    const centreOf = (sex: Sex, key: PhysicalScaleKey) => {
      const divisions = divisionsFor(sex);
      const middle = divisions[Math.floor(divisions.length / 2)]!;
      return mean(GENERATED.get(middle.id as string)![key]);
    };
    say('\n\n═══ The sexes, each on their own pivot ═══\n');
    say('  attribute     mid-division male   mid-division female   gap');
    for (const key of PHYSICAL_SCALE_KEYS) {
      const male = centreOf('male', key);
      const female = centreOf('female', key);
      say(
        `  ${key.padEnd(13)}${male.toFixed(1).padStart(15)}${female.toFixed(1).padStart(22)}` +
          `${(male - female).toFixed(1).padStart(8)}`,
      );
      // Not identical — the middle division of each ladder is not each sex's pivot weight — but
      // nothing like the gap an unpivoted scale would show, where a 135 lb woman reads as a male
      // bantamweight and every female division sits far below its own median.
      expect(Math.abs(male - female), `${key} across the sexes`).toBeLessThan(20);
    }
    flush();
  });

  it('reports the correlation matrix beside the roster, without fitting to it', () => {
    const corr = (a: number[], b: number[]) => {
      const [ma, mb] = [mean(a), mean(b)];
      const cov = mean(a.map((x, i) => (x - ma) * (b[i]! - mb)));
      const sa = Math.sqrt(mean(a.map((x) => (x - ma) ** 2)));
      const sb = Math.sqrt(mean(b.map((x) => (x - mb) ** 2)));
      return cov / (sa * sb);
    };
    const flat = {} as Record<PhysicalScaleKey, number[]>;
    for (const key of PHYSICAL_SCALE_KEYS) {
      flat[key] = [...GENERATED.values()].flatMap((byKey) => byKey[key]);
    }
    say('\n\n═══ Correlations, generated against roster ═══\n');
    say(
      '  The roster column is its **resolved ratings**, not its sigma placements — doc 31 § 13.9.3\n' +
        '  quoted the placements, which exclude the mass term and are therefore not comparable with\n' +
        '  a generated population at all. Reading those two side by side was a mistake worth naming.\n\n' +
        '  Neither column is a target. What matters is direction and rough magnitude.\n',
    );
    say('  pair                     generated   roster');
    for (let i = 0; i < PHYSICAL_SCALE_KEYS.length; i++) {
      for (let j = i + 1; j < PHYSICAL_SCALE_KEYS.length; j++) {
        const a = PHYSICAL_SCALE_KEYS[i]!;
        const b = PHYSICAL_SCALE_KEYS[j]!;
        const generated = corr(flat[a], flat[b]);
        const roster = corr(
          ROSTER.map((r) => r.physicals[a].rating),
          ROSTER.map((r) => r.physicals[b].rating),
        );
        say(
          `  ${`${a} × ${b}`.padEnd(25)}${generated.toFixed(2).padStart(8)}${roster.toFixed(2).padStart(9)}`,
        );
      }
    }
    say(
      '\n  The one that still disagrees in sign is Power × Cardio: the roster says −0.65 and the\n' +
        '  generator +0.21. Both are explicable and the gap is composition. In the roster the mass\n' +
        '  law dominates, because it holds nine to fourteen fighters in every division; in the\n' +
        '  generated world a quarter of the men are welterweights, so mass varies less and the\n' +
        '  shared athletic centre — which the roster has no equivalent of — shows through. It is\n' +
        '  recorded rather than tuned away, because "powerful with poor cardio" is measured directly\n' +
        '  in physical-archetypes.test.ts and is 3.6% of the population.',
    );
    flush();
  });
});
