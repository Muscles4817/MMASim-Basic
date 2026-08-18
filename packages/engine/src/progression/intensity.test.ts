/**
 * Four settings, and every one of them somebody's right answer.
 *
 * Camp length was the only dial the game had, and measured on a 27-year-old its per-week return
 * varies by 1.2% between six and twelve weeks — so the choice collapsed to "how much time can I
 * afford". Adding a second magnitude slider would have produced one line with twelve labels on it,
 * which is why the two dials buy different things: length buys craft, intensity buys the body.
 *
 * The claim these tests exist to hold is that **no cell of the matrix is dominated** — that for
 * every intensity there is a situation where it is the correct choice. That is a stronger and more
 * honest test than "a greedy policy uses at least six of twelve", because a greedy policy only ever
 * measures its own objective function. Doc 25 § 5 asked for the second; § 12 records why the first
 * turned out to be the one worth asserting.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import { applyAgeing, applyTraining, forecastTraining } from './development.js';
import { INTENSITY_META, TRAINING_INTENSITIES, intensityGain } from './intensity.js';
import { STANDARD_LOAD_PER_DAY, freshnessOf, recoveryRate } from '../health/freshness.js';
import { campInjuryChance } from '../health/injuries.js';
import type { Fighter } from '../domain/fighter.js';
import type { TrainingIntensity } from './intensity.js';

/**
 * A fighter with real room in *both* halves.
 *
 * `makeFighter` defaults `potential` to `attributes`, which makes every physical gain exactly zero
 * — and the first version of the domination check used it, concluded that overreach was dominated
 * at every length, and was measuring a fighter who could not build a physical if he wanted to.
 */
const roomy = (age = 27): Fighter =>
  makeFighter({
    age,
    attributes: { cardio: 55, durability: 55, power: 55, speed: 55, strength: 55 },
    potential: { cardio: 85, durability: 85, power: 85, speed: 85, strength: 85 },
  });

const gainOf = (
  f: Fighter,
  weeks: number,
  intensity: TrainingIntensity,
  focus: 'conditioning' | 'strategy',
) =>
  Object.values(
    forecastTraining({ fighter: f, focuses: [focus], weeks, day: 0, intensity }).expected,
  ).reduce((a: number, v) => a + (v ?? 0), 0);

/** Net freshness across a block of this length at this intensity. */
const netFreshness = (f: Fighter, weeks: number, intensity: TrainingIntensity, age = 27) => {
  const days = weeks * 7;
  return (
    recoveryRate(f, age) * days - days * STANDARD_LOAD_PER_DAY * INTENSITY_META[intensity].load
  );
};

describe('the two dials buy different things', () => {
  it('makes intensity the physical dial', () => {
    const f = roomy();
    const light = gainOf(f, 8, 'light', 'conditioning');
    const overreach = gainOf(f, 8, 'overreach', 'conditioning');
    expect(overreach).toBeGreaterThan(light * 4);
  });

  it('leaves craft nearly flat across all four, because reps and sleep buy it', () => {
    const f = roomy();
    const spread = TRAINING_INTENSITIES.map((i) => gainOf(f, 8, i, 'strategy'));
    expect(Math.max(...spread) / Math.min(...spread)).toBeLessThan(1.3);
  });

  it('makes length the technical dial', () => {
    const f = roomy();
    expect(gainOf(f, 12, 'standard', 'strategy')).toBeGreaterThan(
      gainOf(f, 4, 'standard', 'strategy') * 2,
    );
  });
});

describe('the two rows that carry the design', () => {
  it('lets a light block hand freshness back rather than only costing less', () => {
    /*
     * Active recovery is a real thing, and it is what makes light an *option* rather than a worse
     * camp. It falls out of the load being below the recovery rate — there is no special case.
     */
    expect(netFreshness(roomy(), 8, 'light')).toBeGreaterThan(0);
    expect(netFreshness(roomy(), 8, 'standard')).toBeLessThan(0);
  });

  it('still resets the neglect clock, which is the veteran’s whole lever', () => {
    // Doc 23's `lastTrained` stamp does not care how hard a camp was, and it must not start:
    // holding your level cheaply is the thing a 38-year-old is buying.
    const after = applyTraining({
      fighter: roomy(38),
      focuses: ['wrestling'],
      weeks: 8,
      intensity: 'light',
      day: 1000,
      rng: createRng('l'),
    }).fighter;
    expect(after.lastTrained?.wrestling).toBe(1000);
  });

  it('makes overreach technically worse than hard, not strictly better', () => {
    /*
     * You do not learn well when you are wrecked. This is what stops the dial being a difficulty
     * slider — overreach is a specifically physical tool, right occasionally and wrong often.
     */
    const f = roomy();
    expect(gainOf(f, 8, 'overreach', 'strategy')).toBeLessThan(gainOf(f, 8, 'hard', 'strategy'));
    expect(gainOf(f, 8, 'overreach', 'conditioning')).toBeGreaterThan(
      gainOf(f, 8, 'hard', 'conditioning'),
    );
  });
});

describe('no cell of the matrix is dominated', () => {
  it('leaves every intensity and length on the frontier', () => {
    /*
     * A cell is dominated if some other cell delivers at least as much of *both* kinds of gain,
     * for no more calendar, no more injury risk and no more freshness. A dominated cell can never
     * be anybody's right answer, whatever they are optimising — which makes this the test that
     * does not depend on inventing an objective.
     */
    const f = roomy();
    const cells = [4, 8, 12].flatMap((weeks) =>
      TRAINING_INTENSITIES.map((intensity) => ({
        weeks,
        intensity,
        tech: gainOf(f, weeks, intensity, 'strategy'),
        phys: gainOf(f, weeks, intensity, 'conditioning'),
        risk: campInjuryChance(f, weeks, 0, INTENSITY_META[intensity].injury),
        fresh: netFreshness(f, weeks, intensity),
      })),
    );

    for (const a of cells) {
      const dominator = cells.find(
        (b) =>
          b !== a &&
          b.tech >= a.tech &&
          b.phys >= a.phys &&
          b.weeks <= a.weeks &&
          b.risk <= a.risk &&
          b.fresh >= a.fresh,
      );
      expect(
        dominator,
        `${a.weeks}wk ${a.intensity} is dominated by ${dominator?.weeks}wk ${dominator?.intensity}`,
      ).toBeUndefined();
    }
  });
});

describe('it costs what it says it costs', () => {
  it('charges more freshness the harder the camp', () => {
    const spent = TRAINING_INTENSITIES.map((intensity) =>
      freshnessOf(
        applyTraining({
          fighter: roomy(),
          focuses: ['boxing'],
          weeks: 8,
          intensity,
          day: 0,
          rng: createRng('f'),
        }).fighter,
      ),
    );
    for (let i = 1; i < spent.length; i++) expect(spent[i]!).toBeLessThanOrEqual(spent[i - 1]!);
  });

  it('hurts people more often the harder the camp', () => {
    const f = roomy();
    expect(campInjuryChance(f, 8, 0, INTENSITY_META.overreach.injury)).toBeGreaterThan(
      campInjuryChance(f, 8, 0, INTENSITY_META.light.injury) * 3,
    );
  });

  it('leaves an eight-week light block net positive even for a worn veteran', () => {
    // The lever has to still work for the person it is for. If a light camp costs a 38-year-old
    // freshness, there is nothing they can do that does not dig the hole deeper.
    const veteran = {
      ...roomy(38),
      condition: { ...roomy(38).condition, bodyWear: 45 },
    } as Fighter;
    expect(netFreshness(veteran, 8, 'light', 38)).toBeGreaterThan(0);
  });
});

describe('the forecast obeys every dial the camp obeys', () => {
  it('shows the intensity the camp will actually run at', () => {
    /*
     * `forecastTraining` did not read `intensity` when it was added, which would have made the
     * camp screen promise a standard camp's gains and deliver an overreach camp's — the exact
     * class of defect doc 24 recorded against the creation-screen preview.
     */
    const f = roomy();
    const forecast = gainOf(f, 8, 'overreach', 'conditioning');
    const actual = applyTraining({
      fighter: f,
      focuses: ['conditioning'],
      weeks: 8,
      intensity: 'overreach',
      day: 0,
      rng: createRng('a'),
    });
    const built = Object.values(actual.gains).reduce((a: number, v) => a + (v ?? 0), 0);
    // Within the camp's own luck band, which is 0.75-1.3 of the expectation.
    expect(built).toBeGreaterThan(forecast * 0.6);
    expect(built).toBeLessThan(forecast * 1.6);
  });
});

describe('nothing changes for a caller that does not ask', () => {
  it('defaults to standard, so every existing call site behaves identically', () => {
    const f = roomy();
    const withOut = applyTraining({
      fighter: f,
      focuses: ['boxing'],
      weeks: 8,
      day: 0,
      rng: createRng('x'),
    });
    const withStandard = applyTraining({
      fighter: f,
      focuses: ['boxing'],
      weeks: 8,
      intensity: 'standard',
      day: 0,
      rng: createRng('x'),
    });
    expect(withOut.gains).toEqual(withStandard.gains);
  });

  it('leaves the multiplier at 1 for standard, in both halves', () => {
    expect(intensityGain('standard', 'cardio')).toBe(1);
    expect(intensityGain('standard', 'fightIq')).toBe(1);
  });
});

describe('a camp and the days it took, together', () => {
  it('lets a veteran hold his level on light without digging a hole', () => {
    // The end-to-end version of the lever: run the block, age over the same days, come out ahead.
    let f = roomy(38);
    for (let block = 0; block < 3; block++) {
      const day = block * 56;
      f = applyTraining({
        fighter: f,
        focuses: ['wrestling'],
        weeks: 8,
        intensity: 'light',
        day,
        rng: createRng(`b${block}`),
      }).fighter;
      f = applyAgeing(f, day, day + 56, createRng(`a${block}`)).fighter;
    }
    expect(freshnessOf(f)).toBeGreaterThan(80);
  });

  it('and floors him if he runs the same three hard', () => {
    let f = roomy(38);
    for (let block = 0; block < 3; block++) {
      const day = block * 56;
      f = applyTraining({
        fighter: f,
        focuses: ['wrestling'],
        weeks: 8,
        intensity: 'hard',
        day,
        rng: createRng(`b${block}`),
      }).fighter;
      f = applyAgeing(f, day, day + 56, createRng(`a${block}`)).fighter;
    }
    expect(freshnessOf(f)).toBeLessThan(20);
  });
});
