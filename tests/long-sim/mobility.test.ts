/**
 * Does the ladder run upward?
 *
 * A career mode's population is not a headcount, it is a *flow*, and the two look identical in a
 * snapshot while being opposite in motion. Doc 26 counted where fighters are; this counts where
 * they go, because the sport can hold a perfectly healthy roster distribution while every
 * individual movement inside it points the wrong way — which is precisely what it was doing.
 *
 * Measured before `50d1c1a` over ten years of the real `advanceWorld` loop: **311 up-moves against
 * 625 down**, with 65% of all tier movement purely lateral. Of 258 fighters who started on the
 * regional circuit and were still fighting a decade later, four had reached a major promotion and
 * **none** had reached the global one; of 152 who started at the global promotion, **82 had ended up
 * regional**. The cause was one line — `resolveFreeAgency` picked a fighter's next promotion with a
 * uniform draw over a pool that was five-eighths regional, so a lapsed contract at the top was a
 * dice roll that usually landed two tiers down.
 *
 * `50d1c1a` replaced the draw with a step-up branch, incumbent stickiness and a need-weighted
 * fallback, and the gate with the promotion's own signing standard. This file is what stops that
 * silently coming undone: the bounds below are deliberately far looser than the measured figures,
 * because their job is to catch an inversion rather than to pin a number.
 *
 * Companion to `tools/mobility-trace.ts`, which prints the full table for reading. See
 * docs/35-ways-to-build-doc-34.md § 0.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { advanceWorld } from '../../packages/app/src/game/world';
import type { Fighter } from '@mmasim/engine';

const YEAR = 365;
const START = 2192;
const YEARS = 10;

/** The tier ladder, as `ladder.ts` orders it. */
const TIER_ORDER = ['developmental', 'regional', 'major', 'global'];

interface Promo {
  id: string;
  tier: string;
}

interface Flow {
  up: number;
  down: number;
  lateral: number;
  /** Where each still-active fighter started, by tier, against where they ended. */
  cohort: Map<string, { started: number; endedAtOrAbove: number; endedGlobal: number }>;
}

/**
 * Ten years of the real world loop, counting every promotion change.
 *
 * Snapshots per year rather than at the end, because a fighter who goes regional → major →
 * regional has moved twice and a start/end comparison sees nothing at all.
 */
function decadeOfMovement(): Flow {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const all = (): Fighter[] => db.fighters.findAll() as Fighter[];
  const promos = db.promotions.findAll() as unknown as Promo[];
  const tierOf = new Map(promos.map((p) => [p.id, p.tier]));
  const rank = (id: string | undefined): number =>
    id === undefined ? -1 : TIER_ORDER.indexOf(tierOf.get(id) ?? '');

  const player = all()[0]!;
  const startTier = new Map<string, number>();
  for (const f of all()) startTier.set(f.id as string, rank(f.promotionId as string | undefined));

  let previous = new Map<string, string | undefined>(
    all().map((f) => [f.id as string, f.promotionId as string | undefined]),
  );

  let up = 0;
  let down = 0;
  let lateral = 0;

  for (let year = 0; year < YEARS; year++) {
    advanceWorld(db, START + year * YEAR, START + (year + 1) * YEAR, player.id);

    const next = new Map<string, string | undefined>();
    for (const f of all()) {
      const id = f.id as string;
      const now = f.promotionId as string | undefined;
      next.set(id, now);
      if (!previous.has(id)) continue; // generated this year — arriving is not moving
      if (f.retiredDay !== undefined) continue; // nor is retiring
      const was = previous.get(id);
      if (was === now || was === undefined || now === undefined) continue;

      const delta = rank(now) - rank(was);
      if (delta > 0) up++;
      else if (delta < 0) down++;
      else lateral++;
    }
    previous = next;
  }

  // Where the survivors of each starting tier ended up.
  const cohort = new Map<string, { started: number; endedAtOrAbove: number; endedGlobal: number }>();
  for (const f of all()) {
    if (f.retiredDay !== undefined || f.record.length === 0) continue;
    const from = startTier.get(f.id as string);
    if (from === undefined || from < 0) continue;
    const key = TIER_ORDER[from]!;
    const row = cohort.get(key) ?? { started: 0, endedAtOrAbove: 0, endedGlobal: 0 };
    row.started++;
    const to = rank(f.promotionId as string | undefined);
    if (to >= from) row.endedAtOrAbove++;
    if (TIER_ORDER[to] === 'global') row.endedGlobal++;
    cohort.set(key, row);
  }

  return { up, down, lateral, cohort };
}

describe('the ladder runs upward', () => {
  const flow = decadeOfMovement();

  it('moves more people up than down', () => {
    /*
     * Measured 311 up / 625 down before the fix, 1146 / 789 after. The bound is 1.0 rather than the
     * measured 0.69 because the *direction* is the invariant: a sport where more people fall than
     * climb has no ladder, whatever the exact ratio.
     */
    expect(
      flow.down / Math.max(1, flow.up),
      `${flow.up} up, ${flow.down} down over ${YEARS} years`,
    ).toBeLessThan(1);
  });

  it('does not churn sideways for no reason', () => {
    /*
     * 65% lateral before, 30% after. Lateral movement is not wrong in itself — a fighter genuinely
     * does move between promotions of the same size — but when it is most of all movement it means
     * the model is picking at random rather than deciding.
     */
    const total = flow.up + flow.down + flow.lateral;
    expect(
      flow.lateral / Math.max(1, total),
      `${flow.lateral} lateral of ${total} tier moves`,
    ).toBeLessThan(0.45);
  });

  it('lets somebody climb out of the regional circuit', () => {
    /*
     * The headline failure: four of 258 reached a major promotion in a decade and none reached the
     * global one, which is a sport with no route through it. 132 of 277 after the fix.
     */
    const regional = flow.cohort.get('regional');
    expect(regional, 'no regional starting cohort survived to be measured').toBeDefined();
    const climbed = regional!.endedAtOrAbove - (regional!.started - regional!.endedAtOrAbove);
    expect(
      regional!.endedGlobal,
      `${regional!.endedGlobal} of ${regional!.started} regional starters reached the global promotion`,
    ).toBeGreaterThan(10);
    expect(climbed).toBeGreaterThan(0);
  });

  it('does not drain the top of the sport downward', () => {
    /*
     * 26 of 152 held a global roster spot before the fix; 90 of 159 after. Some fall is correct —
     * under merit-based movement a fighter who declines *should* drop — so this bounds the drain
     * rather than demanding retention.
     */
    const global = flow.cohort.get('global');
    expect(global, 'no global starting cohort survived to be measured').toBeDefined();
    expect(
      global!.endedAtOrAbove / Math.max(1, global!.started),
      `${global!.endedAtOrAbove} of ${global!.started} global starters are still there`,
    ).toBeGreaterThan(0.4);
  });
});
