/**
 * The 2026 world, assembled.
 *
 * Named fighters where a player would recognise the name, generated depth everywhere else.
 * That split is not a shortcut — it is the shape of the real sport, where a promotion's roster
 * is a dozen people you can name and a hundred you cannot, and it is what fixes the measured
 * defect the 2020 world could not escape: cards averaging under three bouts against a designed
 * size of nine, because two available fighters in the same division on the same promotion
 * frequently did not exist.
 */

import { asPromotionId, isoToGameDay, type Fighter } from '@mmasim/engine';
import { buildFighter, type FighterSpec } from './builder.js';
import { buildDepthFighters, buildFreeAgents, type DepthTarget } from './depth.js';
import { HEAVY_2026_SPECS } from './fighters-2026-heavy.js';
import { LIGHT_2026_SPECS } from './fighters-2026-light.js';
import { SMALL_2026_SPECS } from './fighters-2026-small.js';
import { PROMOTIONS_2026 } from './organisations-2026.js';

export const DAY_2026 = isoToGameDay('2026-01-01');

const NAMED_2026: readonly FighterSpec[] = [
  ...HEAVY_2026_SPECS,
  ...LIGHT_2026_SPECS,
  ...SMALL_2026_SPECS,
];

/**
 * Which promotion each named fighter is signed to.
 *
 * Everyone not listed is on the leader's roster, because that is where almost all of the
 * recognisable names actually are — and stating the exceptions is far less error-prone than
 * stating the rule two hundred times.
 */
const SIGNED_ELSEWHERE: Readonly<Record<string, string>> = {
  // Nobody yet: the named roster is the leader's. Contenders from elsewhere arrive as the
  // world runs, through free agency, which is the honest way for them to arrive.
};

/**
 * How deep each promotion's divisions run.
 *
 * The leader is set at twenty per men's division deliberately: a nine-bout card needs eighteen
 * fighters available on the night, most of a roster is unavailable at any moment because of
 * the three-bouts-a-year cap and medical suspensions, and the leader has to be able to run two
 * cards a month without booking the same people every time.
 *
 * The tier numbers are what makes the sport a ladder rather than five copies of itself. A
 * regional promotion is not a smaller version of the leader; it is a different standard of
 * fighter, and the gap between tier 62 and tier 30 is what a fighter is climbing.
 */
const DEPTH_TARGETS: readonly DepthTarget[] = [
  { promotionId: 'p_ufc', mens: 20, womens: 11, tier: 62, spread: 13 },
  { promotionId: 'p_pfl', mens: 12, womens: 7, tier: 50, spread: 12 },
  { promotionId: 'p_one', mens: 12, womens: 7, tier: 48, spread: 12 },
  { promotionId: 'p_rizin', mens: 9, womens: 0, tier: 42, spread: 12 },
  { promotionId: 'p_ksw', mens: 9, womens: 0, tier: 40, spread: 11 },
  { promotionId: 'p_oktagon', mens: 8, womens: 0, tier: 37, spread: 11 },
  { promotionId: 'p_cw', mens: 8, womens: 0, tier: 32, spread: 12 },
  { promotionId: 'p_lfa', mens: 8, womens: 0, tier: 31, spread: 12 },
];

/** Unattached fighters, so free agency has a market and a cut fighter has somewhere to land. */
const FREE_AGENT_COUNT = 70;

export function buildFighters2026(): Fighter[] {
  const named = NAMED_2026.map((spec) => ({
    ...buildFighter(spec, DAY_2026),
    promotionId: asPromotionId(SIGNED_ELSEWHERE[spec.id] ?? 'p_ufc'),
  }));

  const depth = buildDepthFighters({
    targets: DEPTH_TARGETS,
    existing: named,
    day: DAY_2026,
    seed: 'era2026',
  });

  const free = buildFreeAgents({
    count: FREE_AGENT_COUNT,
    day: DAY_2026,
    seed: 'era2026',
    // Below every contracted promotion's tier: the unattached pool is people on the way up and
    // people on the way back down, not people the sport has overlooked.
    tier: 30,
    spread: 12,
  });

  return [...named, ...depth, ...free];
}

export { PROMOTIONS_2026 };
