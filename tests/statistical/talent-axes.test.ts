/**
 * Athletic talent and skill-learning talent are two different things.
 *
 * Doc 31 § 12 step 3. Generation used one `tier` scalar to centre all five hidden naturals at once,
 * so a single number made a fighter simultaneously explosive, durable, coachable **and** worthy of a
 * bigger promotion. Measured over 12,000 fighters drawn the way `depth.ts` draws them:
 *
 * ```
 *   rho(tier, athletic naturals)  0.841
 *   rho(tier, current ability)    0.699
 * ```
 *
 * **A fighter's promotion predicted his genetics better than it predicted his fighting ability.**
 * That is the defect stated as plainly as it can be, and its consequence is the row that matters:
 * of fighters at local-show level, **0.8%** had any physical ceiling of 80 or better. The freak who
 * cannot fight — one of the most ordinary people in the sport — could not be generated.
 *
 * This file is the acceptance criteria for the fix, and it is deliberately a *separate* file from
 * `generation-profile.test.ts`. Step 3 is one change and must be measurable on its own; the
 * physiology decoupling that step 6 will do to Power, Speed and Strength is a different change with
 * different evidence, and folding the two together would make neither of them attributable.
 *
 * ---
 *
 * **What is explicitly not asserted here.** Power and Strength still correlate at rho = 0.85 because
 * `ceilingsFromNaturals` builds them from near-identical combinations of `explosiveness` and
 * `frame`. Doc 31 § 13.1 records it; step 6 owns it; and the target of rho ≈ 0.7 that step will aim
 * at is **provisional**. The requirement is that distinct plausible physical archetypes exist, not
 * that any particular correlation coefficient is correct — the coefficients get calibrated when the
 * ladder is exercised, not now.
 */

import { describe, expect, it } from 'vitest';
import {
  ATHLETIC_TIER_LOADING,
  ATTRIBUTES_BY_GROUP,
  asDivisionId,
  createRng,
  generateFighter,
  overallRating,
  type AttributeKey,
  type Fighter,
} from '@mmasim/engine';

const PHYSICAL = ATTRIBUTES_BY_GROUP.physical;
const TECHNICAL: readonly AttributeKey[] = [
  ...ATTRIBUTES_BY_GROUP.striking,
  ...ATTRIBUTES_BY_GROUP.grappling,
  ...ATTRIBUTES_BY_GROUP.mental,
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

function correlation(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  return mean(xs.map((x, i) => (x - mx) * (ys[i]! - my))) / (sd(xs) * sd(ys) || 1);
}

/**
 * The athletic axis, as an observable: the four naturals the body is made of.
 *
 * `frame` is excluded on purpose — it comes from the body model rather than from talent, and
 * including it would measure how heavy somebody is rather than how gifted.
 */
const athleticism = (f: Fighter) =>
  mean([f.naturals.explosiveness, f.naturals.engine, f.naturals.constitution, f.naturals.recovery]);

/** The learning axis, as an observable. */
const learning = (f: Fighter) => f.naturals.motorLearning;

const physicalPotential = (f: Fighter) => mean(PHYSICAL.map((k) => f.potential[k]));
const technicalNow = (f: Fighter) => mean(TECHNICAL.map((k) => f.attributes[k]));

/**
 * A cross-section of the sport, drawn the way the world is actually seeded.
 *
 * `depth.ts` gives each promotion a tier and a spread and ages its roster across a career, so a
 * population sampled only from fresh debutants at one tier would answer a question nobody is asking.
 */
const POPULATION = (() => {
  const rng = createRng('talent-axes');
  return Array.from({ length: 12_000 }, (_, i) => {
    const gen = rng.fork(`f${i}`);
    const tier = Math.round(gen.normalClamped(45, 20, 5, 96));
    const age = Math.round(gen.normalClamped(28, 4.5, 20, 39));
    return {
      tier,
      fighter: generateFighter(gen, {
        id: `axes_${i}`,
        divisionId: asDivisionId('mens-lightweight'),
        sex: 'male',
        day: 0,
        tier,
        age,
      }),
    };
  });
})();

const tiers = POPULATION.map((p) => p.tier);
const fighters = POPULATION.map((p) => p.fighter);

/** Promotion levels, as bands of the tier scale. The shape `depth.ts` gives the pyramid. */
const BANDS = [
  { label: 'local', lo: 5, hi: 30 },
  { label: 'regional', lo: 30, hi: 50 },
  { label: 'national', lo: 50, hi: 70 },
  { label: 'major', lo: 70, hi: 85 },
  { label: 'global', lo: 85, hi: 97 },
] as const;

const inBand = (b: (typeof BANDS)[number]) =>
  POPULATION.filter((p) => p.tier >= b.lo && p.tier < b.hi).map((p) => p.fighter);

describe('athletic talent is not skill-learning talent', () => {
  it('keeps the two axes weakly linked rather than fused into one scalar', () => {
    /*
     * Was 0.459 and is now 0.157. Weak but deliberately not zero: coordination and coachability do
     * share substrate with athleticism, and a model where the two were independent would be as
     * wrong as one where they were the same number, just in the other direction.
     *
     * The band is wide because the *shape* is what matters. A tight bound here would be a claim
     * about a coefficient nobody has measured in the real sport.
     */
    const r = correlation(fighters.map(athleticism), fighters.map(learning));
    expect(r, `rho(athletic, learning) = ${r.toFixed(3)}`).toBeGreaterThan(0.02);
    expect(r, `rho(athletic, learning) = ${r.toFixed(3)}`).toBeLessThan(0.5);
  });

  it('makes promotion level say more about fighting ability than about the body', () => {
    /*
     * **The criterion this step exists for**, and it is comparative on purpose.
     *
     * The absolute value of `rho(tier, ability)` is capped near 0.54 by a design decision this step
     * deliberately does not touch: `motorLearning` is rolled with a standard deviation of 16 because
     * it is meant to be the thing scouts get wrong most, and everything downstream of it inherits
     * that noise. Asserting a high absolute correlation would quietly be asserting that scouting is
     * easy.
     *
     * What was wrong before was the *ordering*: tier predicted the body (0.841) better than it
     * predicted ability (0.699), so the sport's hierarchy was a genetics hierarchy wearing a
     * results hierarchy's clothes. It now reads 0.518 against 0.281.
     */
    const ability = correlation(tiers, fighters.map(overallRating2));
    const body = correlation(tiers, fighters.map(athleticism));
    const context = `rho(tier, ability) = ${ability.toFixed(3)}, rho(tier, body) = ${body.toFixed(3)}`;

    expect(ability, context).toBeGreaterThan(0.4);
    expect(body, context).toBeLessThan(0.45);
    // The ordering, with room to spare, because that is the claim rather than either number alone.
    expect(ability - body, context).toBeGreaterThan(0.15);
  });

  it('reaches the body only through the loading it declares', () => {
    // A guard on the mechanism rather than the outcome: if somebody sets the loading to 1 the tests
    // above should fail, and if somebody removes the loading entirely this one says so.
    expect(ATHLETIC_TIER_LOADING).toBeGreaterThan(0);
    expect(ATHLETIC_TIER_LOADING).toBeLessThan(0.7);
  });
});

describe('every kind of fighter the sport contains can be generated', () => {
  it('fills all four athletic/learning quadrants', () => {
    /*
     * The freak who cannot fight, the technician in an ordinary body, and the two ordinary corners.
     * Split at the population median of each axis, so a perfectly independent pair would give 25%
     * each and a perfectly fused one would give 50/0/0/50.
     *
     * Before: 33.5 / 16.7 / 16.7 / 33.2 — the off-diagonals were half the diagonals.
     * After:  28.1 / 22.1 / 22.8 / 27.0.
     */
    const aMedian = pct(fighters.map(athleticism), 0.5);
    const lMedian = pct(fighters.map(learning), 0.5);
    const share = (athleticHigh: boolean, learningHigh: boolean) =>
      fighters.filter(
        (f) =>
          athleticism(f) >= aMedian === athleticHigh && learning(f) >= lMedian === learningHigh,
      ).length / fighters.length;

    const quadrants = {
      'gifted body, gifted learner': share(true, true),
      'gifted body, poor learner': share(true, false),
      'ordinary body, gifted learner': share(false, true),
      'ordinary body, poor learner': share(false, false),
    };
    const context = Object.entries(quadrants)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
      .join(' | ');

    for (const [name, value] of Object.entries(quadrants)) {
      expect(value, `${name}: ${context}`).toBeGreaterThan(0.15);
    }
  });

  it('leaves elite physical outliers on the worst cards in the sport', () => {
    /*
     * Doc 31 § 15's headline requirement: extreme athletes rare but real, **at every level**. A
     * regional show that cannot contain a genuine freak is a regional show where nobody is worth
     * scouting, and the whole prospect-discovery half of the game has nothing to discover.
     *
     * Measured at local level, share with any physical ceiling of 80 or better:
     * **0.8% before, 6.8% after** — one in a hundred and twenty-five, to one in fifteen.
     */
    const local = inBand(BANDS[0]);
    const elite =
      local.filter((f) => PHYSICAL.some((k) => f.potential[k] >= 80)).length / local.length;
    expect(
      elite,
      `${(elite * 100).toFixed(1)}% of local-level fighters have an elite physical ceiling`,
    ).toBeGreaterThan(0.03);
    // And still rare, or "elite" has stopped meaning anything.
    expect(
      elite,
      `${(elite * 100).toFixed(1)}% of local-level fighters have an elite physical ceiling`,
    ).toBeLessThan(0.2);
  });

  it('still puts the best bodies disproportionately at the top', () => {
    // Decoupling is not levelling. The gradient has to survive — it is simply no longer the whole
    // story. Measured: 6.8% at local level against 48.0% at global.
    const rate = (b: (typeof BANDS)[number]) => {
      const band = inBand(b);
      return band.filter((f) => PHYSICAL.some((k) => f.potential[k] >= 80)).length / band.length;
    };
    expect(rate(BANDS[4])).toBeGreaterThan(rate(BANDS[0]) * 2);
  });

  it('reports the physical tail by promotion level', () => {
    console.log('\n=== physical tail by promotion level ===');
    console.log(
      'band'.padEnd(10) +
        'n'.padStart(6) +
        'mean ceil'.padStart(11) +
        'p95 ceil'.padStart(10) +
        'any ceil>=80'.padStart(14) +
        'any now>=75'.padStart(13) +
        'mean now'.padStart(10),
    );
    for (const band of BANDS) {
      const cohort = inBand(band);
      if (cohort.length < 50) continue;
      const ceilings = cohort.map(physicalPotential);
      const anyCeiling = cohort.filter((f) => PHYSICAL.some((k) => f.potential[k] >= 80)).length;
      const anyNow = cohort.filter((f) => PHYSICAL.some((k) => f.attributes[k] >= 75)).length;
      console.log(
        band.label.padEnd(10) +
          String(cohort.length).padStart(6) +
          mean(ceilings).toFixed(1).padStart(11) +
          pct(ceilings, 0.95).toFixed(0).padStart(10) +
          `${((100 * anyCeiling) / cohort.length).toFixed(1)}%`.padStart(14) +
          `${((100 * anyNow) / cohort.length).toFixed(1)}%`.padStart(13) +
          mean(cohort.map((f) => mean(PHYSICAL.map((k) => f.attributes[k]))))
            .toFixed(1)
            .padStart(10),
      );
    }

    console.log('\n=== the axes ===');
    console.log(
      `rho(athletic, learning)     ${correlation(fighters.map(athleticism), fighters.map(learning)).toFixed(3)}`,
    );
    console.log(
      `rho(tier, current ability)  ${correlation(tiers, fighters.map(overallRating2)).toFixed(3)}`,
    );
    console.log(
      `rho(tier, athletic naturals)${correlation(tiers, fighters.map(athleticism)).toFixed(3)}`,
    );
    console.log(
      `rho(tier, physical ceiling) ${correlation(tiers, fighters.map(physicalPotential)).toFixed(3)}`,
    );
    console.log(
      `rho(tier, technical now)    ${correlation(tiers, fighters.map(technicalNow)).toFixed(3)}`,
    );
    console.log(
      `rho(tier, motor learning)   ${correlation(tiers, fighters.map(learning)).toFixed(3)}`,
    );
  });
});

describe('the split did not narrow physical diversity', () => {
  /*
   * The failure mode a decoupling can hide. Removing a driver from a distribution normally shrinks
   * it, and a population that is beautifully independent and uniformly average would satisfy every
   * other test in this file while making the world less interesting than it was.
   *
   * Measured across the men's ladder, standard deviation of each physical attribute before and after
   * the split — the split adds variance rather than removing it, because the athletic axis carries
   * its own spread on top of the per-natural rolls:
   *
   * ```
   *            power   speed  cardio  durability  strength
   *   before    11.2    14.2    13.8       13.0       8.7
   *   after     11.4    14.4    14.2       13.7       8.9
   * ```
   */
  it('keeps every physical attribute at least as spread as it was', () => {
    const BEFORE: Record<string, number> = {
      power: 11.2,
      speed: 14.2,
      cardio: 13.8,
      durability: 13.0,
      strength: 8.7,
    };
    for (const key of PHYSICAL) {
      const spread = sd(fighters.map((f) => f.attributes[key]));
      expect(
        spread,
        `${key} sd ${spread.toFixed(2)} against ${BEFORE[key]} before the split`,
      ).toBeGreaterThan(BEFORE[key]! * 0.9);
    }
  });

  it('keeps the extremes reachable at both ends', () => {
    /*
     * A narrowed population loses its tails first, so the tails are what to watch — but measured
     * against each attribute's own spread rather than against a shared number.
     *
     * A flat bound would have encoded an artefact rather than a property. `strength` tops out at 80
     * in this cohort because its ceiling is `cap((explosiveness + frame) / 2, 0.1)` and `frame` sits
     * near 56 for every lightweight, so no amount of talent reaches higher: even explosiveness 97
     * lands at (97 + 56) / 2. That is the `frame` dependency doc 31 § 12 step 4 removes, not a
     * failure of this step, and asserting `max > 80` would have made this test fail for a reason it
     * is not about. Speed, which reads no `frame` at all, reaches 97 in the same cohort.
     */
    for (const key of PHYSICAL) {
      const values = fighters.map((f) => f.attributes[key]);
      const spread = sd(values);
      const median = pct(values, 0.5);
      const high = Math.max(...values);
      const low = pct(values, 0.02);
      expect(
        high,
        `${key} max ${high}, median ${median.toFixed(0)}, sd ${spread.toFixed(1)}`,
      ).toBeGreaterThan(median + 2 * spread);
      expect(
        low,
        `${key} p02 ${low}, median ${median.toFixed(0)}, sd ${spread.toFixed(1)}`,
      ).toBeLessThan(median - 1.5 * spread);
    }
  });
});

/** `overallRating` takes an attribute block; this is the fighter-shaped version of it. */
function overallRating2(f: Fighter): number {
  return overallRating(f.attributes);
}
