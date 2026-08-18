import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asCoachId, asGymId } from '../core/ids.js';
import type { Coach, Gym } from '../domain/organisations.js';
import { uniformPersonality } from '../domain/personality.js';
import { makeFighter, TEST_DAY } from '../testing/fixtures.js';
import { applyTraining, forecastTraining, TRAINING_FOCUSES } from './development.js';
import type { AttributeKey } from '../ratings/attributes.js';

const gym = (quality = 70): Gym => ({
  id: asGymId('g'),
  name: 'Test Gym',
  city: 'Nowhere',
  country: 'USA',
  quality,
  prestige: 60,
  specialisms: ['striking'],
  monthlyCost: 20,
});

const coach = (): Coach => ({
  id: asCoachId('c'),
  firstName: 'Test',
  lastName: 'Coach',
  nationality: 'USA',
  birthDay: 0,
  scouting: 70,
  gamePlanning: 70,
  development: 70,
  cornering: 70,
  specialisms: ['striking'],
  personality: uniformPersonality(50),
  reputation: 60,
  salary: 10,
});

/** A fighter with real room to grow, so a camp has something to work with. */
const prospect = () =>
  makeFighter({
    age: 23,
    attributes: { strikingOffence: 55, kicking: 50, speed: 55, wrestling: 50 },
    potential: { strikingOffence: 85, kicking: 82, speed: 78, wrestling: 80 },
    naturals: { motorLearning: 70 },
  });

describe('the forecast cannot lie', () => {
  /**
   * The whole point of sharing the arithmetic. If these ever diverge, the screen is telling
   * the player something the simulation will not honour.
   */
  it('brackets what the camp actually delivers, across many seeds', () => {
    const fighter = prospect();
    const forecast = forecastTraining({
      fighter,
      focuses: ['boxing'],
      weeks: 8,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });

    for (let seed = 0; seed < 300; seed++) {
      const actual = applyTraining({
        fighter,
        focuses: ['boxing'],
        weeks: 8,
        gym: gym(),
        coach: coach(),
        day: TEST_DAY,
        rng: createRng(`camp_${seed}`),
      });

      for (const [key, gained] of Object.entries(actual.gains) as [AttributeKey, number][]) {
        // Rounding to 2dp on both sides can put a value a hair outside; allow for that only.
        expect(gained, `${key} came in under the forecast floor on seed ${seed}`).toBeGreaterThanOrEqual(
          (forecast.low[key] ?? 0) - 0.02,
        );
        expect(gained, `${key} came in over the forecast ceiling on seed ${seed}`).toBeLessThanOrEqual(
          (forecast.high[key] ?? 0) + 0.02,
        );
      }
    }
  });

  it('forecasts every attribute the camp will actually touch', () => {
    const fighter = prospect();
    const actual = applyTraining({
      fighter,
      focuses: ['boxing'],
      weeks: 8,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
      rng: createRng('coverage'),
    });
    const forecast = forecastTraining({
      fighter,
      focuses: ['boxing'],
      weeks: 8,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });

    // No surprises: nothing may move that the player was not told about.
    for (const key of Object.keys(actual.gains)) {
      expect(forecast.expected[key as AttributeKey], `${key} moved unforecast`).toBeGreaterThan(0);
    }
  });

  it('sits its expectation between its own bounds', () => {
    const forecast = forecastTraining({
      fighter: prospect(),
      focuses: ['wrestling'],
      weeks: 8,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });
    for (const key of Object.keys(forecast.expected) as AttributeKey[]) {
      expect(forecast.low[key]!).toBeLessThanOrEqual(forecast.expected[key]!);
      expect(forecast.expected[key]!).toBeLessThanOrEqual(forecast.high[key]!);
    }
  });
});

describe('the forecast answers the question the screen asks', () => {
  it('shows longer camps giving more, with a real sweet spot in the middle', () => {
    const fighter = prospect();
    const run = (weeks: number) =>
      forecastTraining({
        fighter,
        focuses: ['boxing'],
        weeks,
        gym: gym(),
        coach: coach(),
        day: TEST_DAY,
      }).totalExpected;

    const four = run(4);
    const eight = run(8);
    const twelve = run(12);

    expect(eight).toBeGreaterThan(four);
    expect(twelve).toBeGreaterThan(eight);

    /*
     * The shape changed with `CAMP_RAMP_WEEKS`, and changed for the better.
     *
     * It used to be monotonically diminishing per week, which made short camps the most
     * efficient and — since nothing charged you for starting one — made splitting strictly
     * correct. Now a camp has a fixed overhead at the front and diminishing returns at the
     * back, so value per week rises, peaks and falls.
     *
     * It peaks at eight weeks. That falls out of the arithmetic rather than being chosen:
     * maximising ((w−2)/4)^0.75 / w gives w = 8 exactly. That the model's optimum is the
     * sport's standard camp length is a good sign it is the right model.
     */
    expect(eight / 8, 'eight weeks should be the most efficient camp').toBeGreaterThan(four / 4);
    expect(eight / 8, 'eight weeks should be the most efficient camp').toBeGreaterThan(twelve / 12);
    // Past the peak the returns still diminish, which is the claim the screen makes in prose.
    expect(twelve / 12).toBeLessThan(eight / 8);
  });

  it('shows splitting focus costing both of them', () => {
    const fighter = prospect();
    const single = forecastTraining({
      fighter,
      focuses: ['boxing'],
      weeks: 8,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });
    const split = forecastTraining({
      fighter,
      focuses: ['boxing', 'wrestling'],
      weeks: 8,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });

    const strikingSingle = single.expected.strikingOffence ?? 0;
    const strikingSplit = split.expected.strikingOffence ?? 0;
    expect(strikingSplit).toBeLessThan(strikingSingle);
  });

  it('shows a coach and a good room being worth something', () => {
    const fighter = prospect();
    const base = { fighter, focuses: ['boxing'] as const, weeks: 8, day: TEST_DAY };

    const alone = forecastTraining({ ...base, gym: gym(30) }).totalExpected;
    const supported = forecastTraining({ ...base, gym: gym(90), coach: coach() }).totalExpected;
    expect(supported).toBeGreaterThan(alone * 1.5);
  });

  it('says plainly when there is nothing left to gain', () => {
    /*
     * "Nothing left" means two different things since doc 23, and this fixture has to satisfy both.
     * `speed` and `power` are physical and genuinely finish — they reach a ceiling and stop. The
     * two striking attributes never finish; they only become slow enough that a camp cannot show
     * anything, which is why they sit at 96 rather than at some ceiling.
     *
     * And the total is no longer exactly zero, deliberately. A skill's gain approaches zero and
     * never arrives, because the alternative is a wall — which is the thing this model exists to
     * remove. What the screen needs to know is that a camp here is not worth the weeks.
     */
    const finished = makeFighter({
      attributes: { strikingOffence: 96, strikingDefence: 96, speed: 96, power: 96 },
      potential: { strikingOffence: 96, strikingDefence: 96, speed: 96, power: 96 },
    });
    const forecast = forecastTraining({
      fighter: finished,
      focuses: ['boxing'],
      weeks: 12,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });
    // Relative to the same camp for a developing fighter, rather than an absolute bound — the
    // claim is "this is not worth the weeks", and that survives the gain constant being retuned.
    const developing = forecastTraining({
      fighter: prospect(),
      focuses: ['boxing'],
      weeks: 12,
      gym: gym(),
      coach: coach(),
      day: TEST_DAY,
    });

    expect(forecast.atCeiling).toBe(true);
    expect(forecast.totalExpected).toBeLessThan(developing.totalExpected * 0.05);
  });

  it('never forecasts a loss — a camp can be wasted but not harmful', () => {
    for (const focus of TRAINING_FOCUSES) {
      const forecast = forecastTraining({
        fighter: makeFighter({ age: 38 }),
        focuses: [focus],
        weeks: 12,
        day: TEST_DAY,
      });
      for (const value of Object.values(forecast.expected)) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
