/**
 * Test fixtures.
 *
 * Shipped in `src` rather than a test folder because the statistical, integration and
 * long-sim suites all live outside this package and need the same builders. Keeping one
 * definition of "a valid fighter" is worth the handful of bytes.
 */

import { birthDayForAge, type GameDay } from '../core/clock.js';
import { asDivisionId, asFighterId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { emptyRecordSummary, freshCondition } from '../domain/fighter.js';
import type { Personality } from '../domain/personality.js';
import { uniformPersonality } from '../domain/personality.js';
import type { TraitId } from '../domain/traits.js';
import type { Attributes, Naturals } from '../ratings/attributes.js';
import { uniformAttributes } from '../ratings/attributes.js';

export interface FighterOverrides {
  id?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  age?: number;
  attributes?: Partial<Attributes>;
  naturals?: Partial<Naturals>;
  potential?: Partial<Attributes>;
  personality?: Partial<Personality>;
  traits?: readonly TraitId[];
  divisionId?: string;
  walkingWeightLbs?: number;
  headTrauma?: number;
  starPower?: number;
  reputation?: number;
  sex?: 'male' | 'female';
}

export const TEST_DAY: GameDay = 0;

export function makeNaturals(overrides: Partial<Naturals> = {}): Naturals {
  return {
    frame: 50,
    explosiveness: 50,
    engine: 50,
    constitution: 50,
    recovery: 50,
    motorLearning: 50,
    injuryProneness: 50,
    ageCurve: 'standard',
    ...overrides,
  };
}

/** A wholly average fighter. Every override is applied on top of a coherent baseline. */
export function makeFighter(o: FighterOverrides = {}): Fighter {
  const attributes = { ...uniformAttributes(50), ...o.attributes };
  const age = o.age ?? 28;
  const divisionId = asDivisionId(o.divisionId ?? 'mens-lightweight');

  return {
    id: asFighterId(o.id ?? 'fighter_test'),
    firstName: o.firstName ?? 'Test',
    lastName: o.lastName ?? 'Fighter',
    nickname: o.nickname,
    nationality: 'USA',
    sex: o.sex ?? 'male',
    birthDay: birthDayForAge(age, TEST_DAY, 6, 15),
    walkingWeightLbs: o.walkingWeightLbs ?? 170,
    heightInches: 70,
    reachInches: 72,
    stance: 'orthodox',

    divisionId,
    divisionHistory: [divisionId],

    attributes,
    naturals: makeNaturals(o.naturals),
    potential: { ...attributes, ...o.potential },
    personality: { ...uniformPersonality(50), ...o.personality },
    traits: o.traits ?? [],

    condition: { ...freshCondition(), headTrauma: o.headTrauma ?? 0 },
    record: [],
    summary: emptyRecordSummary(),

    starPower: o.starPower ?? 30,
    reputation: o.reputation ?? 40,

    proDebutDay: birthDayForAge(age - 6, TEST_DAY, 6, 15),
  };
}

/**
 * Named archetypes used across the test suites.
 *
 * These exist so that balance assertions read as claims about the *game* ("a pure wrestler
 * beats a pure striker who cannot defend takedowns") rather than as claims about a pile of
 * anonymous numbers.
 */
export const ARCHETYPES = {
  /** All-time power, nothing else. The Ngannou shape. */
  bomber: (): Fighter =>
    makeFighter({
      id: 'fighter_bomber',
      lastName: 'Bomber',
      attributes: {
        power: 99,
        strikingOffence: 62,
        speed: 66,
        durability: 68,
        strength: 88,
        cardio: 42,
        kicking: 45,
        strikingDefence: 48,
        wrestling: 40,
        takedownDefence: 55,
        groundControl: 45,
        submissions: 30,
        scrambling: 35,
        fightIq: 52,
        composure: 55,
      },
      traits: ['headhunter', 'fastStarter'],
    }),

  /** Bottomless gas tank plus chain wrestling. The Merab shape. */
  grinder: (): Fighter =>
    makeFighter({
      id: 'fighter_grinder',
      lastName: 'Grinder',
      attributes: {
        cardio: 97,
        wrestling: 88,
        strength: 76,
        groundControl: 78,
        takedownDefence: 74,
        scrambling: 80,
        power: 48,
        speed: 62,
        durability: 72,
        strikingOffence: 58,
        kicking: 50,
        strikingDefence: 55,
        submissions: 62,
        fightIq: 74,
        composure: 78,
      },
      naturals: { engine: 97, recovery: 85 },
      traits: ['cardioMachine', 'gymRat'],
    }),

  /** Suffocating top control. The Khabib shape. */
  smotherer: (): Fighter =>
    makeFighter({
      id: 'fighter_smotherer',
      lastName: 'Smotherer',
      attributes: {
        groundControl: 98,
        wrestling: 92,
        strength: 85,
        cardio: 82,
        takedownDefence: 88,
        submissions: 78,
        scrambling: 76,
        power: 55,
        speed: 64,
        durability: 78,
        strikingOffence: 60,
        kicking: 42,
        strikingDefence: 58,
        fightIq: 85,
        composure: 88,
      },
      traits: ['finisher'],
    }),

  /** Elite striking, no wrestling. The classic exploitable striker. */
  striker: (): Fighter =>
    makeFighter({
      id: 'fighter_striker',
      lastName: 'Striker',
      attributes: {
        strikingOffence: 90,
        kicking: 88,
        strikingDefence: 88,
        speed: 86,
        power: 74,
        fightIq: 84,
        composure: 80,
        cardio: 72,
        durability: 66,
        strength: 52,
        wrestling: 35,
        takedownDefence: 42,
        groundControl: 40,
        submissions: 38,
        scrambling: 52,
      },
    }),

  /** Deliberately, uniformly average. The control in every experiment. */
  journeyman: (): Fighter =>
    makeFighter({ id: 'fighter_journeyman', lastName: 'Journeyman' }),

  /**
   * A well-rounded top-15 fighter with no glaring hole and no elite weapon.
   *
   * This is the archetype most balance properties should be tested against, because it is
   * the level a real matchmaker actually books against a contender. Asserting upset rates
   * in elite-vs-average fights tests a matchup the game will never generate.
   */
  contender: (): Fighter =>
    makeFighter({
      id: 'fighter_contender',
      lastName: 'Contender',
      attributes: {
        power: 66,
        speed: 72,
        cardio: 74,
        durability: 71,
        strength: 68,
        strikingOffence: 73,
        kicking: 68,
        strikingDefence: 71,
        wrestling: 70,
        takedownDefence: 73,
        groundControl: 68,
        submissions: 65,
        scrambling: 70,
        fightIq: 72,
        composure: 70,
      },
    }),

  /**
   * Bottom of the roster. Below level everywhere — but note the Power, which sits well
   * above the rest of the card: cans are dangerous for exactly ninety seconds, and that is
   * a real phenomenon rather than a charity balance tweak.
   */
  canFodder: (): Fighter =>
    makeFighter({
      id: 'fighter_can',
      lastName: 'Fodder',
      attributes: {
        power: 52,
        speed: 38,
        cardio: 38,
        durability: 42,
        strength: 46,
        strikingOffence: 38,
        kicking: 34,
        strikingDefence: 34,
        wrestling: 38,
        takedownDefence: 36,
        groundControl: 36,
        submissions: 32,
        scrambling: 36,
        fightIq: 36,
        composure: 38,
      },
      traits: ['fastStarter'],
    }),

  /**
   * A second wholly-average fighter with a distinct identity.
   *
   * Exists so symmetry and even-matchup tests can pit two identical-but-distinguishable
   * fighters against each other — using the same archetype twice gives both corners the
   * same id and silently breaks win-rate accounting.
   */
  journeyman2: (): Fighter =>
    makeFighter({ id: 'fighter_journeyman_2', lastName: 'Everyman' }),
} as const;
