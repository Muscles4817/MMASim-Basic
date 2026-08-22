/**
 * What generation actually produces.
 *
 * Doc 31 § 10.3. The permanent instrument. Every measurement in this file was a throwaway script
 * before it was a test, and the defects it caught had been shipping for as long as the generator had
 * existed — heights three to four inches short below heavyweight, an ape index of zero, a frame that
 * was a proxy for the division, and a Speed distribution identical at 136 lb and 255 lb.
 *
 * None of those would have failed a single test in the suite. That is the argument for this file:
 * **a generator with no population instrument is a generator nobody is checking.**
 *
 * Two rules it follows, from doc 31 § 10.
 *
 * **Every physical figure is reported twice** (§ 10.4) — the absolute rating, and its percentile
 * within the fighter's own sex and division. The absolute column is domain truth and the thing the
 * ladder is a claim about; the percentile column is what says whether a fighter is good *at his own
 * weight*, which is the only question matchmaking, the AI and the player ever actually ask. The whole
 * design rests on those not being the same number, and a report showing one of them lets the
 * distinction quietly rot.
 *
 * **Bounds are orderings and ratios wherever possible** (§ 10.2), because per-division samples are
 * noisier than pooled ones and a bound that breaks on roster churn gets deleted rather than fixed.
 * Every assertion carries its measured value in the failure message.
 *
 * Note what is deliberately *not* asserted yet: nothing about the physical ladder. Doc 31's
 * sequencing rule holds until body geometry is finished, and `ceilingsFromNaturals` has not been
 * rewritten. The division-versus-Speed and division-versus-Power correlations therefore still measure
 * today's defect rather than tomorrow's fix, and they are printed rather than bounded until step 6.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTES_BY_GROUP,
  asDivisionId,
  createRng,
  divisionsFor,
  generateFighter,
  sampleBodyForDivisionWithStats,
  type AttributeKey,
  type Fighter,
  type Sex,
} from '@mmasim/engine';

const PHYSICAL = ATTRIBUTES_BY_GROUP.physical;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

/** Pearson correlation. The diagnostics live or die on these. */
function correlation(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i]! - my)));
  return cov / (sd(xs) * sd(ys) || 1);
}

/** Where a value sits in its own division's distribution, 0–100. Doc 31 § 10.4's second reading. */
function percentileIn(value: number, population: number[]): number {
  const below = population.filter((v) => v < value).length;
  return Math.round((100 * below) / population.length);
}

interface Cohort {
  sex: Sex;
  division: string;
  order: number;
  limitLbs: number;
  fighters: Fighter[];
}

/**
 * A population generated exactly the way `world.ts:replenish` generates one.
 *
 * Including the talent draw: roughly one in twelve debutants comes from a much higher band, and a
 * profile taken without it measures a world nobody plays.
 */
function generate(perDivision = 700): Cohort[] {
  const cohorts: Cohort[] = [];
  for (const sex of ['male', 'female'] as const) {
    for (const division of divisionsFor(sex)) {
      const rng = createRng(`profile:${division.id}`);
      const fighters = Array.from({ length: perDivision }, (_, i) => {
        const gen = rng.fork(`f${i}`);
        const isProspect = gen.chance(0.085);
        return generateFighter(gen, {
          id: `profile_${division.id}_${i}`,
          divisionId: asDivisionId(division.id as string),
          sex,
          day: 0,
          tier: isProspect ? Math.round(gen.normalClamped(78, 9, 62, 97)) : undefined,
        });
      });
      cohorts.push({
        sex,
        division: division.shortName,
        order: division.order,
        limitLbs: division.limitLbs,
        fighters,
      });
    }
  }
  return cohorts;
}

const COHORTS = generate();
const men = () => COHORTS.filter((c) => c.sex === 'male');
const everyone = () => COHORTS.flatMap((c) => c.fighters);

const attr = (c: Cohort, key: AttributeKey) => c.fighters.map((f) => f.attributes[key]);

describe('the body generation produces', () => {
  it('prints the anthropometry by sex and division', () => {
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — bodies ===`);
      console.log(
        'div'.padEnd(7) +
          'height'.padStart(16) +
          'reach'.padStart(9) +
          'ape'.padStart(6) +
          'walking wt'.padStart(19) +
          'cut %'.padStart(8),
      );
      for (const c of COHORTS.filter((x) => x.sex === sex)) {
        const ht = c.fighters.map((f) => f.heightInches);
        const reach = c.fighters.map((f) => f.reachInches);
        const walk = c.fighters.map((f) => f.walkingWeightLbs);
        const cut = c.fighters.map(
          (f) => (100 * (f.walkingWeightLbs - c.limitLbs)) / f.walkingWeightLbs,
        );
        console.log(
          c.division.padEnd(7) +
            `${mean(ht).toFixed(1)}" (${pct(ht, 0.05)}-${pct(ht, 0.95)})`.padStart(16) +
            `${mean(reach).toFixed(1)}"`.padStart(9) +
            `+${(mean(reach) - mean(ht)).toFixed(1)}`.padStart(6) +
            `${mean(walk).toFixed(0)} (${pct(walk, 0.05).toFixed(0)}-${pct(walk, 0.95).toFixed(0)})`.padStart(
              19,
            ) +
            `${mean(cut).toFixed(1)}`.padStart(8),
        );
      }
    }
  });

  it('gives every division a range of bodies rather than one body', () => {
    /*
     * The defect this file exists for. Walking weight used to be `limit × rng.range(1.04, 1.15)`, so
     * a division held an eleven per cent band of one shape and there was no such thing as a big
     * lightweight — which mattered because `frame`, derived from walking weight, feeds the Power,
     * Strength and Durability ceilings.
     */
    for (const c of COHORTS) {
      const walk = c.fighters.map((f) => f.walkingWeightLbs);
      const spread = pct(walk, 0.95) - pct(walk, 0.05);
      expect(
        spread,
        `${c.sex} ${c.division} walking-weight spread ${spread.toFixed(0)}lb`,
      ).toBeGreaterThan(12);

      const ht = c.fighters.map((f) => f.heightInches);
      const htSpread = pct(ht, 0.95) - pct(ht, 0.05);
      expect(htSpread, `${c.sex} ${c.division} height spread ${htSpread}"`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('keeps height climbing with division without the division dictating it', () => {
    for (const sex of ['male', 'female'] as const) {
      const ladder = COHORTS.filter((c) => c.sex === sex).sort((a, b) => a.order - b.order);
      let previous = 0;
      for (const c of ladder) {
        const h = mean(c.fighters.map((f) => f.heightInches));
        expect(h, `${sex} ${c.division} mean height ${h.toFixed(1)}"`).toBeGreaterThan(previous);
        previous = h;
      }
    }
  });

  it('produces a real ape index', () => {
    // Reach was height plus noise, so no generated fighter had ever had a reach advantage worth the
    // name. The hand-authored roster's per-division means run +1.3 to +3.1.
    const ape = everyone().map((f) => f.reachInches - f.heightInches);
    expect(mean(ape), `mean ape index ${mean(ape).toFixed(2)}"`).toBeGreaterThan(1.5);
    expect(mean(ape), `mean ape index ${mean(ape).toFixed(2)}"`).toBeLessThan(3.5);
    expect(Math.min(...ape)).toBeLessThan(0);
    expect(Math.max(...ape)).toBeGreaterThan(5);
  });

  it('lands bantamweights at a bantamweight height', () => {
    // The cheap tripwire that would have caught the three-inch defect on the day it shipped. Real
    // men's bantamweights average 67.0"; generation used to produce 64.7".
    const bw = men().find((c) => c.division === 'BW')!;
    const h = mean(bw.fighters.map((f) => f.heightInches));
    expect(h, `bantamweight mean height ${h.toFixed(1)}"`).toBeGreaterThan(65.5);
    expect(h, `bantamweight mean height ${h.toFixed(1)}"`).toBeLessThan(68.5);
  });

  it('ties walking weight to the body, not to the division', () => {
    /*
     * Three correlations that together say frame has stopped being a division proxy.
     *
     * Height against walking weight must be strong — bodies follow geometry. Division against
     * walking weight is *also* strong and always will be, because the division limit is a real
     * constraint. What matters is the third: within a single division, walking weight must still vary
     * with the body, which is precisely what the old model made impossible.
     */
    const all = everyone();
    const heightVsWeight = correlation(
      all.map((f) => f.heightInches),
      all.map((f) => f.walkingWeightLbs),
    );
    expect(
      heightVsWeight,
      `height ↔ walking weight ρ = ${heightVsWeight.toFixed(2)}`,
    ).toBeGreaterThan(0.5);

    for (const c of COHORTS) {
      const within = correlation(
        c.fighters.map((f) => f.heightInches),
        c.fighters.map((f) => f.walkingWeightLbs),
      );
      expect(
        within,
        `${c.sex} ${c.division} within-division height ↔ weight ρ = ${within.toFixed(2)}`,
      ).toBeGreaterThan(0.2);
    }
  });
});

describe('the physical attributes generated', () => {
  it('prints them absolute and as a within-division percentile', () => {
    /*
     * Doc 31 § 10.4: both readings, always, on the same line.
     *
     * Today the two columns say almost the same thing, and that is the finding rather than a bug in
     * the report — `ceilingsFromNaturals` has no mass term for Speed or Cardio, so a heavyweight's
     * absolute Speed and his Speed *for a heavyweight* are currently the same claim. Step 6 is where
     * they come apart, and this report is how that will be visible when it happens.
     */
    for (const sex of ['male', 'female'] as const) {
      console.log(
        `\n=== ${sex.toUpperCase()} — physicals, absolute (p50) and division percentile of the pooled p50 ===`,
      );
      const pooled = Object.fromEntries(
        PHYSICAL.map((k) => [k, COHORTS.filter((c) => c.sex === sex).flatMap((c) => attr(c, k))]),
      ) as Record<AttributeKey, number[]>;

      console.log('div'.padEnd(7) + PHYSICAL.map((k) => k.padStart(17)).join(''));
      for (const c of COHORTS.filter((x) => x.sex === sex)) {
        console.log(
          c.division.padEnd(7) +
            PHYSICAL.map((k) => {
              const values = attr(c, k);
              const median = pct(values, 0.5);
              // The absolute rating, then where the *sport's* median sits inside this division —
              // which is what makes the ladder visible at a glance.
              const where = percentileIn(pct(pooled[k]!, 0.5), values);
              return `${median} (sport p${where})`.padStart(17);
            }).join(''),
        );
      }
    }
  });

  it('prints the spread and the tails, which is where outliers live or die', () => {
    for (const sex of ['male', 'female'] as const) {
      console.log(`\n=== ${sex.toUpperCase()} — physical spread ===`);
      console.log('div'.padEnd(7) + PHYSICAL.map((k) => k.padStart(20)).join(''));
      for (const c of COHORTS.filter((x) => x.sex === sex)) {
        console.log(
          c.division.padEnd(7) +
            PHYSICAL.map((k) => {
              const v = attr(c, k);
              return `${pct(v, 0.05)}-${pct(v, 0.95)} sd${sd(v).toFixed(0)} hi${Math.max(...v)}`.padStart(
                20,
              );
            }).join(''),
        );
      }
    }
  });

  it('keeps a real spread rather than a population clustered on its own median', () => {
    /*
     * Doc 31 § 2.5 puts the professional population's standard deviation at 12 to 13.5 rating points
     * on every physical. The bound is loose on both sides — a compressed population is the failure
     * being watched for, and an exploded one would mean the naturals had come unmoored.
     */
    for (const c of COHORTS) {
      for (const key of PHYSICAL) {
        const s = sd(attr(c, key));
        expect(s, `${c.sex} ${c.division} ${key} sd ${s.toFixed(1)}`).toBeGreaterThan(6);
        expect(s, `${c.sex} ${c.division} ${key} sd ${s.toFixed(1)}`).toBeLessThan(20);
      }
    }
  });

  it('does not collapse the physicals onto one athletic scalar', () => {
    /*
     * Doc 31 § 12 step 3's guard, installed early — and it found something on its first run.
     *
     * **Power ↔ Strength measures ρ = 0.85, which is too high**, and the cause is visible in
     * `ceilingsFromNaturals`: the two are near-identical linear combinations of the same two
     * naturals.
     *
     * ```
     *   power    = explosiveness × 0.60 + frame × 0.25 + skill × 0.15
     *   strength = explosiveness × 0.45 + frame × 0.45 + skill × 0.10
     * ```
     *
     * So "explosive but not especially strong" and "very strong but not explosive" — two of the most
     * ordinary fighters in the sport — are both close to impossible for the generator to produce.
     * Doc 31 § 12 step 3 splits the talent axes and step 6 gives each attribute its own mass basis.
     *
     * **There is no longer a numeric target here, and doc 31 § 16.2 explains why the old one went.**
     * "Tighten to 0.7 at step 6" was written down before there was any evidence about the right
     * value, and keeping a placeholder because it had been written down is how it turns into a
     * specification. The calibration roster now supplies real evidence — the same pairs come out at
     * +0.34 and +0.30 across 115 hand-placed fighters — but that roster is a selected sample of
     * landmarks rather than a population, so its coefficients are not the replacement target either.
     *
     * What the design requires is that distinct physical archetypes are *common* rather than merely
     * possible: the explosive fighter who is not especially strong, the strong one who is not
     * explosive, the puncher with no gas tank. A step 6 that reaches ρ = 0.70 while still making
     * "strong but not explosive" rare has failed; one that lands at 0.55 with every archetype
     * populated has succeeded. Let the coefficient fall out of the physiology and then argue with
     * it.
     *
     * The bound below is therefore set where the code *is*, not where it should be. A test that
     * fails on an untouched checkout is a broken test, so this one guards against the correlation
     * getting worse and the comment carries the direction of travel.
     *
     * **Not touched by step 3.** The talent-axis split decoupled promotion level from the body; it
     * did nothing about the physicals' relationship to each other, on purpose, so the two changes
     * stay independently attributable. Measured after step 3: unchanged at 0.85.
     */
    const all = everyone();
    const of = (k: AttributeKey) => all.map((f) => f.attributes[k]);

    const pairs: [AttributeKey, AttributeKey, number, number][] = [
      ['power', 'strength', 0.25, 0.9],
      ['power', 'speed', 0.1, 0.9],
      ['cardio', 'power', -0.3, 0.5],
      ['durability', 'speed', -0.3, 0.6],
    ];
    console.log('\n=== physical correlations ===');
    for (const [a, b, lo, hi] of pairs) {
      const r = correlation(of(a), of(b));
      console.log(`${a} ↔ ${b}: ρ = ${r.toFixed(2)}   (bounds ${lo} to ${hi})`);
      expect(r, `${a} ↔ ${b} ρ = ${r.toFixed(2)}`).toBeGreaterThan(lo);
      expect(r, `${a} ↔ ${b} ρ = ${r.toFixed(2)}`).toBeLessThan(hi);
    }
  });

  it('reports where each physical stands against division, which step 6 has to move', () => {
    /*
     * The headline defect, printed rather than bounded.
     *
     * Doc 31 § 1: generated Speed is identical at every weight — mean 54 and p95 78 at flyweight and
     * at heavyweight alike — because `ceilingsFromNaturals` reads `cap(explosiveness, 0.25)` with no
     * mass term. On a scale doc 02 calls absolute, that is the central claim failing outright.
     *
     * It is **not asserted yet**, deliberately. Doc 31's sequencing rule says no fight-engine constant
     * and no rating equation moves until body geometry is finished, and this is the measurement that
     * will show step 6 landing: Power and Strength should climb steeply with division, Speed and
     * Cardio should fall clearly, Durability should stay nearly flat. Today only the first is true.
     */
    console.log('\n=== ρ(division order, attribute) — the ladder, or the lack of one ===');
    for (const sex of ['male', 'female'] as const) {
      const cohorts = COHORTS.filter((c) => c.sex === sex);
      const orders = cohorts.flatMap((c) => c.fighters.map(() => c.order));
      const row = PHYSICAL.map((k) => {
        const values = cohorts.flatMap((c) => attr(c, k));
        return `${k} ${correlation(orders, values).toFixed(2)}`;
      });
      console.log(`${sex.padEnd(7)} ${row.join('   ')}`);
    }
  });
});

describe('the body sampler', () => {
  /*
   * `sampleBodyForDivision` rejection-samples the forward model, which is what keeps a division's
   * population exactly the slice of the general population that belongs in it. When sixty draws all
   * miss, it gives up and *builds* a body around the division's mass instead — and that fallback
   * draws height from a tight normal rather than from the population, so it is narrower than the
   * distribution it replaces.
   *
   * A division where it fires often has therefore stopped being sampled from the forward model, and
   * nothing about the resulting fighter says so. Doc 31 § 10.3 asks for the rate as a permanent
   * report; this is it.
   *
   * **Background is not a dimension yet.** Nothing about a fighter's sporting history reaches the
   * body until doc 31 § 12 step 9 gives backgrounds a body prior — a rugby forward carrying more
   * mass for his height than a distance runner. When it does, this report gains a background column
   * and the rates below will diverge by it, because the thin corners of the ladder are exactly where
   * a background prior will start fighting the division it is being asked for.
   */
  const RATES = (() => {
    const rng = createRng('rejection');
    const rows: { sex: Sex; division: string; attempts: number[]; fallbacks: number; n: number }[] =
      [];
    for (const sex of ['male', 'female'] as const) {
      for (const division of divisionsFor(sex)) {
        const attempts: number[] = [];
        let fallbacks = 0;
        const n = 1500;
        for (let i = 0; i < n; i++) {
          const sample = sampleBodyForDivisionWithStats(
            rng,
            sex,
            asDivisionId(division.id as string),
          );
          attempts.push(sample.attempts);
          if (sample.fellBack) fallbacks++;
        }
        rows.push({ sex, division: division.shortName, attempts, fallbacks, n });
      }
    }
    return rows;
  })();

  it('reports the rejection and fallback rate by sex and division', () => {
    console.log('\n=== body sampling cost by sex and division ===');
    console.log(
      'sex'.padEnd(8) +
        'div'.padEnd(7) +
        'mean draws'.padStart(12) +
        'p95 draws'.padStart(11) +
        'fallback'.padStart(11) +
        'implied share of population'.padStart(29),
    );
    for (const row of RATES) {
      // One accepted draw in `mean` attempts, so the division's share of the forward population is
      // roughly its reciprocal — a second reading of the same measurement, and the one that says
      // whether the ladder is lopsided rather than whether the sampler is struggling.
      console.log(
        row.sex.padEnd(8) +
          row.division.padEnd(7) +
          mean(row.attempts).toFixed(1).padStart(12) +
          String(pct(row.attempts, 0.95)).padStart(11) +
          `${((100 * row.fallbacks) / row.n).toFixed(1)}%`.padStart(11) +
          `${(100 / mean(row.attempts)).toFixed(1)}%`.padStart(29),
      );
    }
  });

  it('keeps the fallback from becoming the generator in any division', () => {
    for (const row of RATES) {
      const rate = row.fallbacks / row.n;
      expect(
        rate,
        `${row.sex} ${row.division} falls back ${(rate * 100).toFixed(1)}% of the time, mean ${mean(row.attempts).toFixed(1)} draws`,
      ).toBeLessThan(0.15);
    }
  });

  it('keeps sampling cheap enough to run inside world generation', () => {
    /**
     * `replenish` calls this once per fighter it creates, while somebody waits for a screen. A draw
     * is four clamped normals and a division walk, so the number that matters here is latency and
     * the honest budget is generous.
     *
     * It was 25 and male heavyweight breached it at 26.2 when doc 31 § 14.6 lowered the weigh-in
     * floor — `chosenDivision` walks the ladder lightest-first and skips divisions the floor rules
     * out, so a lower floor makes bodies eligible for lighter divisions and heavyweight becomes a
     * rarer draw. That is the correction working rather than a regression, and the bound is raised
     * to match with the reason recorded rather than silently.
     *
     * The bound that actually guards the population is the fallback rate above, not this one: the
     * fallback replaces the forward model with a narrower distribution, where a slow draw only costs
     * microseconds. Male heavyweight went 9.1% → 13.0% against a 15% ceiling in the same change,
     * which is the number to watch, and step 6 will move it again when mass starts moving.
     */
    for (const row of RATES) {
      expect(
        mean(row.attempts),
        `${row.sex} ${row.division} needs ${mean(row.attempts).toFixed(1)} draws on average`,
      ).toBeLessThan(35);
    }
  });
});
