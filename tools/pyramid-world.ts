/**
 * A world shaped like doc 26 § 2.2's pyramid, rather than like the shipped plateau.
 *
 * The shipped 2026 era is eight promotions between prestige 36 and 97 — a plateau with a spike on
 * it. Every cost measurement taken against a *scaled* version of that (six copies of the tail) was
 * therefore measuring the wrong world: it had 74 promotions of which two thirds sat in the middle
 * of the pyramid, where the real sport has hundreds at the bottom.
 *
 * That matters for one decision in particular. Doc 27 § 10.6's largest remaining lever is
 * "generate the base tier's records rather than simulating them", and how much that is worth
 * depends entirely on how much of the sport *is* the base tier. Against a plateau it looked like
 * 11%. Against the real shape it should be far more, and if it is not then the lever is not there.
 *
 * Doc 26 § 2.2, with the two bottom tiers collapsed because `PromotionTier` has four values and the
 * pyramid has five (doc 26 § 4.2 is the design item that fixes that):
 *
 *   Apex        1     40+ events/yr    ~400 signed
 *   Major       4     15-25            ~200 each
 *   National   15      8-15            ~100 each
 *   Feeder     30     10-24             ~50 each
 *   Local     ...      2-8               ~8 each — doc 26 § 2.3: "a promoter with a phone book"
 */

import { buildDepthFighters, createNewGame, getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  DIVISIONS,
  asFighterId,
  asPromotionId,
  type Fighter,
  type Promotion,
  type PromotionTier,
} from '@mmasim/engine';

interface TierSpec {
  label: string;
  tier: PromotionTier;
  count: number;
  /** Fighters signed per promotion. */
  roster: number;
  prestige: [number, number];
  /** Divisions this tier runs. The bottom of the sport does not have twelve weight classes. */
  divisions: number;
}

/** Doc 26 § 2.2, as a shape. `local.count` is whatever is left of the fighter budget. */
const PYRAMID: readonly TierSpec[] = [
  { label: 'apex', tier: 'global', count: 1, roster: 400, prestige: [96, 96], divisions: 12 },
  { label: 'major', tier: 'major', count: 4, roster: 200, prestige: [62, 72], divisions: 11 },
  { label: 'national', tier: 'regional', count: 15, roster: 100, prestige: [44, 58], divisions: 9 },
  {
    label: 'feeder',
    tier: 'developmental',
    count: 30,
    roster: 50,
    prestige: [30, 42],
    divisions: 7,
  },
  { label: 'local', tier: 'developmental', count: 0, roster: 8, prestige: [8, 26], divisions: 5 },
];

/** Quality by tier, for `buildDepthFighters`. The ladder the sport is climbed up. */
const TIER_QUALITY: Readonly<Record<string, number>> = {
  apex: 64,
  major: 52,
  national: 45,
  feeder: 38,
  local: 30,
};

/**
 * Doc 26's pyramid has a floor, and it is higher than "Small".
 *
 * Its top four tiers are one apex of 400, four majors of 200, fifteen nationals of 100 and thirty
 * feeders of 50 — **4,072 signed fighters before a single local show exists.** So a world of 850
 * cannot have this shape by adding fewer local promotions; it has to be a smaller pyramid, with
 * fewer promotions per tier *and* smaller rosters on each.
 *
 * Split between the two so the shape survives the scaling: rosters shrink faster than counts, which
 * is what a smaller sport actually looks like — the same ladder with thinner rungs rather than a
 * ladder with rungs missing.
 */
function scaled(spec: TierSpec, factor: number): { count: number; roster: number } {
  if (factor >= 1) return { count: spec.count, roster: spec.roster };
  return {
    count: spec.label === 'apex' ? 1 : Math.max(1, Math.round(spec.count * factor ** 0.4)),
    roster: Math.max(6, Math.round(spec.roster * factor ** 0.6)),
  };
}

export function buildPyramidWorld(targetFighters: number): GameDb {
  const db = createNewGame({ era: '2026', seed: `pyramid:${targetFighters}` });
  const day = getWorld(db).day;

  // Out with the shipped eight. This is a generated world, not a scaled seed.
  for (const row of db.promotions.findAll()) db.promotions.remove(row.id as string);
  for (const row of db.fighters.findAll()) db.fighters.remove(row.id as string);
  for (const row of db.championships.findAll()) db.championships.remove(row.id as string);

  const template = createNewGame({
    era: '2026',
    seed: 'template',
  }).promotions.findAll()[0] as unknown as Promotion;

  const promotions: Promotion[] = [];
  const targets: {
    promotionId: string;
    mens: number;
    womens: number;
    tier: number;
    spread: number;
  }[] = [];

  const natural = PYRAMID.filter((t) => t.label !== 'local').reduce(
    (total, t) => total + t.count * t.roster,
    0,
  );
  // Leave room for a base: the top four tiers get 80% of the budget, local shows the rest.
  const factor = Math.min(1, (targetFighters * 0.8) / natural);
  const sizes = new Map(PYRAMID.map((spec) => [spec.label, scaled(spec, factor)]));
  const spentAbove = PYRAMID.filter((t) => t.label !== 'local').reduce(
    (total, t) => total + sizes.get(t.label)!.count * sizes.get(t.label)!.roster,
    0,
  );
  const localSize = sizes.get('local')!.roster;
  const localCount = Math.max(1, Math.round((targetFighters - spentAbove) / localSize));

  for (const spec of PYRAMID) {
    const size = sizes.get(spec.label)!;
    const count = spec.label === 'local' ? localCount : size.count;
    for (let i = 0; i < count; i++) {
      const id = `p_${spec.label}_${i}`;
      const span = spec.prestige[1] - spec.prestige[0];
      const prestige =
        spec.prestige[0] + (count <= 1 ? span : Math.round((span * i) / (count - 1)));
      const divisions = DIVISIONS.slice(0, spec.divisions).map((d) => d.id);

      promotions.push({
        ...template,
        id: asPromotionId(id),
        name: `${spec.label} ${i + 1}`,
        shortName: `${spec.label.slice(0, 3).toUpperCase()}${i + 1}`,
        tier: spec.tier,
        prestige,
        // Scaled to the operation, so `solvency` and `chargeCosts` see a plausible business.
        budget: Math.round(size.roster * prestige * 3),
        divisions,
        champions: {},
      });

      // `buildDepthFighters` splits its target between men's and women's divisions.
      const mens = Math.max(1, Math.round(size.roster / Math.max(1, spec.divisions)));
      targets.push({
        promotionId: id,
        mens,
        womens: spec.divisions >= 10 ? Math.round(mens * 0.55) : 0,
        tier: TIER_QUALITY[spec.label]!,
        spread: 11,
      });
    }
  }

  db.promotions.upsertMany(promotions as never[]);

  const fighters = buildDepthFighters({
    targets,
    existing: [],
    day,
    seed: `pyramid:${targetFighters}`,
  }).map((f, i) => ({ ...f, id: asFighterId(`${f.id}_${i}`) }));
  db.fighters.upsertMany(fighters as never[]);

  const divisionTargets: Record<string, number> = {};
  const rosterTargets: Record<string, number> = {};
  for (const f of fighters as Fighter[]) {
    divisionTargets[f.divisionId] = (divisionTargets[f.divisionId] ?? 0) + 1;
    if (f.promotionId) rosterTargets[f.promotionId] = (rosterTargets[f.promotionId] ?? 0) + 1;
  }
  setWorld(db, { divisionTargets, rosterTargets });
  return db;
}

/** What actually got built, for a harness that wants to print it. */
export function describePyramid(db: GameDb): string {
  const fighters = db.fighters.findAll() as Fighter[];
  const byTier = new Map<string, { promotions: number; fighters: number }>();
  for (const row of db.promotions.findAll()) {
    const p = row as unknown as Promotion;
    const label = (p.id as string).split('_')[1] ?? '?';
    const entry = byTier.get(label) ?? { promotions: 0, fighters: 0 };
    entry.promotions++;
    entry.fighters += fighters.filter((f) => f.promotionId === p.id).length;
    byTier.set(label, entry);
  }
  return [...byTier].map(([label, v]) => `${label} ${v.promotions}p/${v.fighters}f`).join('  ');
}
