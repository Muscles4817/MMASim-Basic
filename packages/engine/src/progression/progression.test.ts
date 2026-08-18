import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { ageOn } from '../core/clock.js';
import { asDivisionId } from '../core/ids.js';
import { ATTRIBUTES_BY_GROUP, ATTRIBUTE_KEYS, type AttributeKey } from '../ratings/attributes.js';
import { makeFighter } from '../testing/fixtures.js';
import type { Coach, Gym } from '../domain/organisations.js';
import { uniformPersonality } from '../domain/personality.js';
import {
  TRAINING_META,
  applyAgeing,
  applyIdleDecay,
  applyTraining,
  headroom,
  learningRate,
} from './development.js';
import {
  CREATION_POINTS,
  createPlayerFighter,
  validateCreation,
  type Background,
  type CreateFighterSpec,
} from './createFighter.js';

const gym: Gym = {
  id: 'g' as Gym['id'],
  name: 'Test Gym',
  country: 'USA',
  city: 'Test',
  quality: 85,
  prestige: 70,
  specialisms: ['striking', 'wrestling'],
  monthlyCost: 50,
};

const coach = (development = 85, specialisms: Coach['specialisms'] = ['striking']): Coach => ({
  id: 'c' as Coach['id'],
  firstName: 'Test',
  lastName: 'Coach',
  nationality: 'USA',
  birthDay: 0,
  scouting: 70,
  gamePlanning: 70,
  development,
  cornering: 70,
  specialisms,
  personality: uniformPersonality(50),
  reputation: 70,
  salary: 20,
});

const prospect = () =>
  makeFighter({
    id: 'fighter_prospect',
    age: 22,
    attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 40])) as never,
    potential: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 85])) as never,
    naturals: { motorLearning: 75, ageCurve: 'standard' },
  });

describe('headroom', () => {
  it('is zero at or above the ceiling', () => {
    expect(headroom(80, 80)).toBe(0);
    expect(headroom(90, 80)).toBe(0);
  });

  it('shrinks as a fighter approaches their ceiling', () => {
    // Asymptotic: 60→70 must be much easier than 80→85, or every long career converges on
    // its ceilings and the population flattens.
    expect(headroom(60, 90)).toBeGreaterThan(headroom(85, 90) * 2);
  });
});

describe('learningRate', () => {
  it('is highest for the young and never reaches zero', () => {
    expect(learningRate(19, 'standard')).toBeGreaterThan(learningRate(30, 'standard'));
    expect(learningRate(30, 'standard')).toBeGreaterThan(learningRate(40, 'standard'));
    expect(learningRate(42, 'standard')).toBeGreaterThan(0);
  });

  it('lets a late bloomer keep learning longer', () => {
    expect(learningRate(33, 'lateBloomer')).toBeGreaterThan(learningRate(33, 'earlyBloomer'));
  });
});

describe('training moves attributes', () => {
  it('improves the attributes the focus actually trains, and leaves the rest alone', () => {
    const before = prospect();
    const { fighter: after, gains } = applyTraining({
      fighter: before,
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('t1'),
    });

    expect(after.attributes.strikingOffence).toBeGreaterThan(before.attributes.strikingOffence);
    /*
     * **A boxing camp does not train kicks, and this assertion said it did until docs/19 phase 4.**
     *
     * There was one striking focus, and it trained `strikingOffence` at 1.0 and `kicking` at 0.85
     * in the same block — so the game offered "Kickboxing / Muay Thai" as an identity and then sold
     * that fighter a camp which moved them toward being a boxer. Splitting the focus is what makes
     * G3 assertable (`persistence.test.ts`), and this line is where the split is visible from the
     * training system's own side.
     */
    expect(after.attributes.kicking).toBe(before.attributes.kicking);
    // Wrestling is not part of a striking camp either.
    expect(after.attributes.wrestling).toBe(before.attributes.wrestling);
    expect(gains.strikingOffence).toBeGreaterThan(0);
    expect(gains.kicking).toBeUndefined();
    expect(gains.wrestling).toBeUndefined();
  });

  it('trains the kicks in the camp that is about kicks', () => {
    // The other half of the split, so neither block can quietly stop working.
    const before = prospect();
    const { fighter: after, gains } = applyTraining({
      fighter: before,
      focuses: ['kicking'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('t1-kicks'),
    });

    expect(after.attributes.kicking).toBeGreaterThan(before.attributes.kicking);
    expect(after.attributes.strikingOffence).toBe(before.attributes.strikingOffence);
    expect(gains.strikingOffence).toBeUndefined();
  });

  it('never lowers an attribute that was trained', () => {
    let fighter = prospect();
    for (let i = 0; i < 20; i++) {
      const before = fighter.attributes.wrestling;
      fighter = applyTraining({
        fighter,
        focuses: ['wrestling'],
        weeks: 8,
        gym,
        coach: coach(85, ['wrestling']),
        day: i * 90,
        rng: createRng(`n${i}`),
      }).fighter;
      expect(fighter.attributes.wrestling).toBeGreaterThanOrEqual(before);
    }
  });

  it('never exceeds a PHYSICAL ceiling, however many camps are run', () => {
    let fighter = prospect();
    for (let i = 0; i < 200; i++) {
      fighter = applyTraining({
        fighter,
        focuses: ['boxing'],
        weeks: 10,
        gym,
        coach: coach(),
        day: i * 90,
        rng: createRng(`c${i}`),
      }).fighter;
    }
    /*
     * Physicals only, and that split is doc 23 § 2.1 rather than a loosened assertion. A chin and
     * a fast-twitch profile are written down at birth and a ceiling is the right model for them.
     * A skill has no ceiling at all any more — see the test below, which asserts the opposite.
     */
    for (const key of ATTRIBUTES_BY_GROUP.physical) {
      expect(fighter.attributes[key], key).toBeLessThanOrEqual(fighter.potential[key]);
    }
    // And it should get genuinely close, or the ceiling is decorative.
    //
    // Expressed as the share of available room closed rather than as an absolute rating.
    // The old `> 78` was picked when gains were linear in camp weeks, so it sat on an
    // asymptote and moved the moment the block curve was tuned — measuring the thing the
    // claim is actually about survives that.
    const start = prospect();
    const closed =
      (fighter.attributes.strikingOffence - start.attributes.strikingOffence) /
      (start.potential.strikingOffence - start.attributes.strikingOffence);
    expect(closed).toBeGreaterThan(0.8);
  });

  it('lets a skill pass its projection, given a career of nothing else', () => {
    /*
     * The point of doc 23. `potential` for a skill is now where a fighter would *settle*, not a
     * wall — so two hundred camps of nothing but boxing must carry them past it. What stops
     * everybody reaching 99 is that the next point keeps getting slower and a career is finite,
     * not that somebody wrote a number on them before they ever trained.
     */
    let fighter = prospect();
    for (let i = 0; i < 200; i++) {
      fighter = applyTraining({
        fighter,
        focuses: ['boxing'],
        weeks: 10,
        gym,
        coach: coach(),
        day: i * 90,
        rng: createRng(`past${i}`),
      }).fighter;
    }
    expect(fighter.attributes.strikingOffence).toBeGreaterThan(fighter.potential.strikingOffence);
  });

  it('makes one camp a fraction of the journey and two years transformative', () => {
    const start = prospect();
    const oneCamp = applyTraining({
      fighter: start,
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('one'),
    }).fighter;

    /*
     * As a share of the room available, not as an absolute number of points.
     *
     * This fixture is deliberately extreme — every attribute at 40 with every ceiling at 85,
     * a forty-five point gap no real fighter carries — so an absolute bound here was really
     * a bound on the *most* any camp could ever give, and it pinned the gain constant so low
     * that a created fighter could not develop into anybody over an entire career. Measuring
     * the share keeps the claim ("a camp is a step, not a transformation") while letting the
     * rate be set by whether careers work, which is where it belongs.
     *
     * See tests/long-sim/created-career.test.ts for the bound on a fighter who actually exists.
     */
    // Measured against the distance to 100 rather than to a ceiling, because a skill no longer
    // has one. Same claim — a camp is a step, not a transformation.
    const room = 100 - start.attributes.strikingOffence;
    const closed = (oneCamp.attributes.strikingOffence - start.attributes.strikingOffence) / room;
    expect(closed, 'one camp closed most of the gap to the ceiling').toBeLessThan(0.35);

    let long = start;
    for (let i = 0; i < 8; i++) {
      long = applyTraining({
        fighter: long,
        focuses: ['boxing'],
        weeks: 8,
        gym,
        coach: coach(),
        day: i * 90,
        rng: createRng(`l${i}`),
      }).fighter;
    }
    expect(long.attributes.strikingOffence - start.attributes.strikingOffence).toBeGreaterThan(9);
  });

  it('rewards a better coach, a better gym and a better learner', () => {
    const run = (opts: { coachDev?: number; gymQuality?: number; motor?: number }) => {
      const f = makeFighter({
        age: 22,
        attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 40])) as never,
        potential: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 85])) as never,
        naturals: { motorLearning: opts.motor ?? 60 },
      });
      return applyTraining({
        fighter: f,
        focuses: ['boxing'],
        weeks: 8,
        gym: { ...gym, quality: opts.gymQuality ?? 60 },
        coach: coach(opts.coachDev ?? 60),
        day: 0,
        rng: createRng('fixed'),
      }).gains.strikingOffence!;
    };

    expect(run({ coachDev: 95 })).toBeGreaterThan(run({ coachDev: 30 }));
    expect(run({ gymQuality: 95 })).toBeGreaterThan(run({ gymQuality: 30 }));
    expect(run({ motor: 95 })).toBeGreaterThan(run({ motor: 25 }) * 1.5);
  });

  it('punishes training with no coach', () => {
    const withCoach = applyTraining({
      fighter: prospect(),
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('same'),
    }).gains.strikingOffence!;
    const alone = applyTraining({
      fighter: prospect(),
      focuses: ['boxing'],
      weeks: 8,
      gym,
      day: 0,
      rng: createRng('same'),
    }).gains.strikingOffence!;
    expect(alone).toBeLessThan(withCoach * 0.7);
  });

  it('splits effort across two focuses rather than doubling it', () => {
    const single = applyTraining({
      fighter: prospect(),
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('split'),
    });
    const double = applyTraining({
      fighter: prospect(),
      focuses: ['boxing', 'wrestling'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('split'),
    });
    expect(double.gains.strikingOffence!).toBeLessThan(single.gains.strikingOffence!);
    expect(double.gains.wrestling!).toBeGreaterThan(0);
  });

  it('makes a coach outside their specialism markedly less useful', () => {
    const specialist = applyTraining({
      fighter: prospect(),
      focuses: ['wrestling'],
      weeks: 8,
      gym,
      coach: coach(85, ['wrestling']),
      day: 0,
      rng: createRng('spec'),
    }).gains.wrestling!;
    const generalist = applyTraining({
      fighter: prospect(),
      focuses: ['wrestling'],
      weeks: 8,
      gym,
      coach: coach(85, ['striking']),
      day: 0,
      rng: createRng('spec'),
    }).gains.wrestling!;
    expect(generalist).toBeLessThan(specialist);
  });

  it('gives an older fighter far less from the same camp', () => {
    const young = applyTraining({
      fighter: makeFighter({
        age: 21,
        attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 45])) as never,
        potential: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 85])) as never,
      }),
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('age'),
    }).gains.strikingOffence!;

    const old = applyTraining({
      fighter: makeFighter({
        age: 37,
        attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 45])) as never,
        potential: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 85])) as never,
      }),
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('age'),
    }).gains.strikingOffence!;

    expect(old).toBeLessThan(young * 0.5);
  });

  it('says something useful when there is nothing left to learn', () => {
    /*
     * "Nothing left" is now a statement about the next few weeks rather than about the fighter:
     * a skill at 95 is not finished, it has become slow enough that a camp cannot show anything.
     * The fixture moved from 80 to 95 for exactly that reason.
     */
    const maxed = makeFighter({
      age: 26,
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 95])) as never,
      potential: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 95])) as never,
    });
    const result = applyTraining({
      fighter: maxed,
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('maxed'),
    });
    expect(result.notes.join(' ')).toMatch(/nothing left to learn/i);
  });

  it('does not mutate the fighter it was given', () => {
    const before = prospect();
    const snapshot = JSON.stringify(before);
    applyTraining({
      fighter: before,
      focuses: ['boxing'],
      weeks: 8,
      gym,
      coach: coach(),
      day: 0,
      rng: createRng('pure'),
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('covers every focus with at least one real attribute', () => {
    for (const meta of Object.values(TRAINING_META)) {
      expect(Object.keys(meta.attributes).length).toBeGreaterThan(1);
      expect(meta.blurb.length).toBeGreaterThan(15);
    }
  });
});

describe('ageing', () => {
  const veteran = (age: number) =>
    makeFighter({
      age,
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 75])) as never,
      potential: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 80])) as never,
      naturals: { ageCurve: 'standard' },
    });

  it('does nothing before peak', () => {
    const f = veteran(25);
    const { fighter, losses } = applyAgeing(f, 0, 365, createRng('a'));
    expect(losses).toEqual({});
    expect(fighter.attributes).toEqual(f.attributes);
  });

  it('takes the body before the craft', () => {
    const f = veteran(38);
    const { losses } = applyAgeing(f, 0, 365 * 2, createRng('b'));
    expect(losses.speed ?? 0).toBeGreaterThan(losses.submissions ?? 0);
    // Fight IQ and Composure never decline — a veteran can be smarter and slower at once.
    expect(losses.fightIq).toBeUndefined();
    expect(losses.composure).toBeUndefined();
  });

  it('accelerates the further past peak a fighter is', () => {
    const early = applyAgeing(veteran(31), 0, 365, createRng('c'));
    const late = applyAgeing(veteran(41), 0, 365, createRng('c'));
    const total = (l: Partial<Record<AttributeKey, number>>) =>
      Object.values(l).reduce((a, v) => a + v, 0);
    expect(total(late.losses)).toBeGreaterThan(total(early.losses) * 2);
  });

  it('never reduces a former elite to a novice', () => {
    let f = veteran(40);
    for (let year = 0; year < 10; year++) {
      f = applyAgeing(f, year * 365, (year + 1) * 365, createRng(`d${year}`)).fighter;
    }
    // Decline has a floor. A diminished 50-year-old wrestler is still a wrestler.
    expect(Math.min(...ATTRIBUTE_KEYS.map((k) => f.attributes[k]))).toBeGreaterThan(20);
  });

  it('lets a long-peak fighter hold on longer than an early bloomer', () => {
    const at = (curve: 'earlyBloomer' | 'longPeak') =>
      applyAgeing(
        makeFighter({
          age: 33,
          attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 75])) as never,
          naturals: { ageCurve: curve },
        }),
        0,
        365,
        createRng('e'),
      ).losses.speed ?? 0;
    expect(at('longPeak')).toBeLessThan(at('earlyBloomer'));
  });
});

describe('idle decay', () => {
  it('treats a short layoff as rest', () => {
    const f = prospect();
    expect(applyIdleDecay(f, 21, createRng('r')).attributes).toEqual(f.attributes);
  });

  it('erodes conditioning fastest over a long layoff', () => {
    const f = prospect();
    const after = applyIdleDecay(f, 365, createRng('r'));
    expect(after.attributes.cardio).toBeLessThan(f.attributes.cardio);
    expect(f.attributes.cardio - after.attributes.cardio).toBeGreaterThan(
      f.attributes.submissions - after.attributes.submissions,
    );
  });

  it('punishes an undisciplined fighter far more', () => {
    const base = { age: 26, attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 60])) as never };
    const pro = applyIdleDecay(
      makeFighter({ ...base, personality: { discipline: 95 } }),
      300,
      createRng('x'),
    );
    const slob = applyIdleDecay(
      makeFighter({ ...base, personality: { discipline: 10 } }),
      300,
      createRng('x'),
    );
    expect(slob.attributes.cardio).toBeLessThan(pro.attributes.cardio);
  });
});

describe('creating a fighter', () => {
  const spec = (overrides: Partial<CreateFighterSpec> = {}): CreateFighterSpec => ({
    id: 'player_1',
    firstName: 'Test',
    lastName: 'Player',
    nationality: 'USA',
    sex: 'male',
    age: 22,
    divisionId: asDivisionId('mens-lightweight'),
    background: 'wrestler',
    build: 'balanced',
    day: 0,
    ...overrides,
  });

  it('produces a coherent, valid fighter', () => {
    const f = createPlayerFighter(spec(), createRng('c1'));
    for (const key of ATTRIBUTE_KEYS) {
      expect(f.attributes[key]).toBeGreaterThanOrEqual(1);
      expect(f.attributes[key]).toBeLessThanOrEqual(100);
      // The invariant everything else depends on.
      expect(f.attributes[key], key).toBeLessThanOrEqual(f.potential[key]);
    }
    expect(f.record).toHaveLength(0);
    expect(f.summary.wins).toBe(0);
    expect(ageOn(f.birthDay, 0)).toBe(22);
  });

  it('starts nobody: no star power, no reputation, no record', () => {
    const f = createPlayerFighter(spec(), createRng('c2'));
    expect(f.starPower).toBeLessThanOrEqual(5);
    expect(f.reputation).toBeLessThanOrEqual(10);
  });

  it('starts below major-promotion level, because the game is the climb', () => {
    const f = createPlayerFighter(spec(), createRng('c3'));
    const mean = ATTRIBUTE_KEYS.reduce((a, k) => a + f.attributes[k], 0) / ATTRIBUTE_KEYS.length;
    expect(mean).toBeLessThan(52);
  });

  it('gives every created fighter a real hole', () => {
    for (let i = 0; i < 40; i++) {
      const f = createPlayerFighter(spec({ id: `p${i}` }), createRng(`hole${i}`));
      expect(Math.min(...ATTRIBUTE_KEYS.map((k) => f.attributes[k]))).toBeLessThan(50);
    }
  });

  it('makes the background actually shape the fighter', () => {
    const wrestler = createPlayerFighter(spec({ background: 'wrestler' }), createRng('same'));
    const boxer = createPlayerFighter(spec({ background: 'boxer' }), createRng('same'));
    expect(wrestler.attributes.wrestling).toBeGreaterThan(boxer.attributes.wrestling + 8);
    expect(boxer.attributes.strikingOffence).toBeGreaterThan(wrestler.attributes.strikingOffence + 8);
  });

  it('gives the raw athlete the highest ceilings and the lowest skills', () => {
    const totals = (bg: Background) => {
      const f = createPlayerFighter(spec({ background: bg }), createRng('ceil'));
      return {
        skill: f.attributes.strikingOffence + f.attributes.wrestling + f.attributes.submissions,
        ceiling: ATTRIBUTE_KEYS.reduce((a, k) => a + f.potential[k], 0),
      };
    };
    const athlete = totals('athlete');
    const grappler = totals('grappler');
    expect(athlete.ceiling).toBeGreaterThan(grappler.ceiling);
    expect(athlete.skill).toBeLessThan(grappler.skill);
  });

  it('applies the discretionary allocation', () => {
    const plain = createPlayerFighter(spec(), createRng('alloc'));
    const boosted = createPlayerFighter(
      spec({ allocation: { power: 8, cardio: 8 } }),
      createRng('alloc'),
    );
    expect(boosted.attributes.power).toBeGreaterThan(plain.attributes.power);
    expect(boosted.attributes.cardio).toBeGreaterThan(plain.attributes.cardio);
  });

  it('makes a powerful build heavier and a rangy one longer', () => {
    const powerful = createPlayerFighter(spec({ build: 'powerful' }), createRng('b'));
    const rangy = createPlayerFighter(spec({ build: 'rangy' }), createRng('b'));
    expect(powerful.walkingWeightLbs).toBeGreaterThan(rangy.walkingWeightLbs);
    expect(rangy.reachInches).toBeGreaterThan(powerful.reachInches);
  });

  describe('validation', () => {
    it('accepts a well-formed spec', () => {
      expect(validateCreation(spec())).toHaveLength(0);
    });

    it('requires a name', () => {
      expect(validateCreation(spec({ firstName: '  ' }))).toHaveLength(1);
    });

    it('bounds the debut age', () => {
      expect(validateCreation(spec({ age: 16 })).length).toBeGreaterThan(0);
      expect(validateCreation(spec({ age: 44 })).length).toBeGreaterThan(0);
    });

    it('enforces the points budget and the per-attribute cap', () => {
      expect(
        validateCreation(spec({ allocation: { power: 8, cardio: 8, speed: 8, wrestling: 8 } })).length,
      ).toBeGreaterThan(0);
      expect(validateCreation(spec({ allocation: { power: 20 } })).length).toBeGreaterThan(0);
    });

    it('rejects contradictory traits', () => {
      expect(validateCreation(spec({ traits: ['ironChin', 'chinny'] })).length).toBeGreaterThan(0);
    });

    it('refuses to build an invalid fighter', () => {
      expect(() => createPlayerFighter(spec({ firstName: '' }), createRng('x'))).toThrow();
    });

    it('keeps the points budget meaningful relative to the baseline', () => {
      // Big enough to express an identity, small enough that training still decides the
      // fighter. If this ever exceeds the baseline the creation screen becomes the game.
      expect(CREATION_POINTS).toBeLessThan(32);
    });
  });
});
