/**
 * Seed assembly.
 *
 * Builds the 1 January 2020 starting world: roster, promotions, gyms, coaches, officials,
 * and the contract/gym assignments that make it a world rather than a list.
 */

import {
  asGymId,
  asPromotionId,
  type Championship,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { buildFighter, SEED_DAY, type FighterSpec } from './builder.js';
import { SEED_MANAGERS } from './managers.js';
import { DEFAULT_ERA, type EraId } from './eras.js';
import { buildChampionships, championMapFor } from './championships.js';
import { buildFighters2026, DAY_2026 } from './world-2026.js';
import { PROMOTIONS_2026 } from './organisations-2026.js';
import { HEAVY_DIVISION_SPECS } from './fighters-heavy.js';
import { LIGHT_DIVISION_SPECS } from './fighters-light.js';
import { SMALL_DIVISION_SPECS } from './fighters-small.js';
import { MENS_DEPTH_SPECS } from './fighters-depth-mens.js';
import { WOMENS_DEPTH_SPECS } from './fighters-depth-womens.js';
import {
  SEED_COACHES,
  SEED_COMMENTATORS,
  SEED_GYMS,
  SEED_JUDGES,
  SEED_PROMOTIONS,
  SEED_REFEREES,
} from './organisations.js';

export const ALL_FIGHTER_SPECS: readonly FighterSpec[] = [
  ...HEAVY_DIVISION_SPECS,
  ...LIGHT_DIVISION_SPECS,
  ...SMALL_DIVISION_SPECS,
  ...MENS_DEPTH_SPECS,
  ...WOMENS_DEPTH_SPECS,
];

/**
 * Gym and promotion assignments.
 *
 * Kept out of the fighter specs so a roster edit does not have to think about the business
 * layer, and so the "who is a free agent" question has one obvious home. Anyone not listed
 * here is unattached, which is a legitimate and useful state.
 */
const GYM_ASSIGNMENTS: Readonly<Record<string, string>> = {
  f_khabib: 'g_red_star',
  f_yan: 'g_red_star',
  f_zabit: 'g_red_star',
  f_askarov: 'g_red_star',
  f_jones: 'g_summit',
  f_cormier: 'g_ironworks',
  f_cejudo: 'g_ironworks',
  f_dvalishvili: 'g_ironworks',
  f_sterling: 'g_ironworks',
  f_usman: 'g_summit',
  f_covington: 'g_summit',
  f_adesanya: 'g_blackwater',
  f_volkanovski: 'g_blackwater',
  f_oliveira: 'g_atlantic',
  f_burns: 'g_atlantic',
  f_figueiredo: 'g_atlantic',
  f_nunes: 'g_atlantic',
  f_till: 'g_northgate',
  f_edwards: 'g_northgate',
  f_walker: 'g_basement',
};

/** Fighters signed elsewhere. Everyone else starts on the major promotion's roster. */
const PROMOTION_OVERRIDES: Readonly<Record<string, string>> = {
  f_chandler: 'p_vanguard',
  f_jung: 'p_rising_sun',
};

export function buildSeedFighters(): Fighter[] {
  return ALL_FIGHTER_SPECS.map((spec) => {
    const fighter = buildFighter(spec);
    const gym = GYM_ASSIGNMENTS[spec.id];
    const promotion = PROMOTION_OVERRIDES[spec.id] ?? 'p_apex';
    return {
      ...fighter,
      gymId: gym ? asGymId(gym) : undefined,
      headCoachId: gym ? SEED_GYMS.find((g) => g.id === asGymId(gym))?.headCoachId : undefined,
      promotionId: asPromotionId(promotion),
    };
  });
}

export interface SeedWorld {
  day: number;
  fighters: readonly Fighter[];
  promotions: readonly Promotion[];
  gyms: typeof SEED_GYMS;
  coaches: typeof SEED_COACHES;
  referees: typeof SEED_REFEREES;
  judges: typeof SEED_JUDGES;
  commentators: typeof SEED_COMMENTATORS;
  managers: typeof SEED_MANAGERS;
  championships: readonly Championship[];
}

/**
 * Build a starting world.
 *
 * The era is a parameter rather than an assumption, which it was not until a second one
 * existed. `2020` is the original hand-authored world, unchanged; `2026` is a real-world
 * roster at a depth that can actually fill a card.
 */
export function buildSeedWorld(era: EraId = DEFAULT_ERA): SeedWorld {
  if (era === '2026') {
    const fighters = buildFighters2026();
    return {
      day: DAY_2026,
      fighters,
      ...withChampions(PROMOTIONS_2026, fighters, DAY_2026, 'era2026'),
      gyms: SEED_GYMS,
      coaches: SEED_COACHES,
      referees: SEED_REFEREES,
      judges: SEED_JUDGES,
      commentators: SEED_COMMENTATORS,
      managers: SEED_MANAGERS,
    };
  }

  const fighters2020 = buildSeedFighters();
  return {
    day: SEED_DAY,
    fighters: fighters2020,
    ...withChampions(SEED_PROMOTIONS, fighters2020, SEED_DAY, 'era2020'),
    gyms: SEED_GYMS,
    coaches: SEED_COACHES,
    referees: SEED_REFEREES,
    judges: SEED_JUDGES,
    commentators: SEED_COMMENTATORS,
    managers: SEED_MANAGERS,
  };
}

export * from './builder.js';
export * from './eras.js';
export * from './depth.js';
export * from './championships.js';
export { PROMOTIONS_2026 } from './organisations-2026.js';
export { buildFighters2026, DAY_2026 } from './world-2026.js';
export {
  SEED_COACHES,
  SEED_COMMENTATORS,
  SEED_GYMS,
  SEED_JUDGES,
  SEED_PROMOTIONS,
  SEED_REFEREES,
};
export { SEED_MANAGERS } from './managers.js';

/**
 * Give every promotion its belts, and its denormalised champion map.
 *
 * Returned together because they must not be built apart: the map is derived from the lineage,
 * and a caller that could seed one without the other is a caller that can ship a world where the
 * matchmaker and the history disagree about who is champion.
 */
function withChampions(
  promotions: readonly Promotion[],
  fighters: readonly Fighter[],
  day: number,
  seed: string,
): { promotions: readonly Promotion[]; championships: readonly Championship[] } {
  const championships = buildChampionships({ promotions, fighters, day, seed });
  return {
    championships,
    promotions: promotions.map((p) => ({ ...p, champions: championMapFor(p, championships) })),
  };
}
