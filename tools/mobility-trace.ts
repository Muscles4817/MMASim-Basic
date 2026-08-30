/**
 * Who moves between promotions, and which way.
 *
 * The measurement doc 28 never took. Doc 26 counted where fighters *are*; this counts where they
 * *go* — because a career ladder is not a population, it is a flow, and the two can look identical
 * in a snapshot while being opposite in motion.
 *
 * It plays the real world loop: `createNewGame` on the player-facing default era, then
 * `advanceWorld` a year at a time with the player excluded, exactly as the app does. Nothing here
 * decides anything; every move it counts was made by `resolveFreeAgency` and `releaseIfCut`.
 *
 * Not a test. It asserts nothing. Run it when anything in the signing path changes and read what
 * came out:
 *
 *     npx vite-node tools/mobility-trace.ts
 *
 * Deterministic: same seed in, same table out, so a diff of the output is a diff of the model.
 */

import { createMemoryAdapter, createNewGame, getWorld, type GameDb } from '../packages/data/src/index.js';
import type { Fighter } from '../packages/engine/src/index.js';
import { advanceWorld } from '../packages/app/src/game/world.js';

const YEARS = 10;
const SEED = 'mobility';

const db: GameDb = createNewGame({ adapter: createMemoryAdapter(), seed: SEED, era: '2026' });
const all = (): Fighter[] => db.fighters.findAll() as Fighter[];

interface Promo {
  id: string;
  shortName: string;
  tier: string;
  prestige: number;
  budget: number;
}
const promos = db.promotions.findAll() as unknown as Promo[];
const byId = new Map(promos.map((p) => [p.id, p]));

/** The tier ladder, as `ladder.ts` orders it. */
const TIER_ORDER = ['developmental', 'regional', 'major', 'global'];
const rankOf = (tier: string | undefined): number => (tier ? TIER_ORDER.indexOf(tier) : -1);

// --- The gate every signing runs through -------------------------------------------------------
//
// `world.ts:resolveFreeAgency` admits a promotion when `prestige <= 42 + reputation * 0.9`, then
// picks from the survivors *uniformly*. Both halves matter, so both are printed.

console.log('# Promotion mobility\n');
console.log('## The board\n');
console.log('| Promotion | Tier | Prestige | Budget | Reputation needed to reach it |');
console.log('|---|---|---:|---:|---:|');
for (const p of [...promos].sort((a, b) => b.prestige - a.prestige)) {
  console.log(
    `| ${p.shortName} | ${p.tier} | ${p.prestige} | ${p.budget} | ${Math.max(0, (p.prestige - 42) / 0.9).toFixed(0)} |`,
  );
}

const quantiles = (fighters: readonly Fighter[]): string => {
  const v = fighters.map((f) => f.reputation).sort((a, b) => a - b);
  const q = (n: number) => (v[Math.floor(v.length * n)] ?? 0).toFixed(0);
  return `p10 ${q(0.1)}, p50 ${q(0.5)}, p90 ${q(0.9)}`;
};

const player = all()[0]!;
const startPromotion = new Map<string, string | undefined>();
const startTier = new Map<string, string>();
for (const f of all()) {
  startPromotion.set(f.id as string, f.promotionId as string | undefined);
  startTier.set(f.id as string, f.promotionId ? (byId.get(f.promotionId)?.tier ?? '?') : 'unsigned');
}

console.log(`\n## Start state\n`);
console.log(`- Fighters: **${all().length}**`);
console.log(`- Holding a written agreement: **${all().filter((f) => f.agreementId !== undefined).length}**`);
console.log(`- Unsigned: **${all().filter((f) => f.promotionId === undefined).length}**`);
console.log(`- Reputation: ${quantiles(all())}`);

// --- The flow ----------------------------------------------------------------------------------

let previous = new Map(startPromotion);
console.log(`\n## Moves per year\n`);
console.log('| Year | Moves | Up a tier | Down a tier | Lateral | Cut loose | Signed from unsigned |');
console.log('|---:|---:|---:|---:|---:|---:|---:|');

let totalUp = 0;
let totalDown = 0;
let totalLateral = 0;

for (let year = 0; year < YEARS; year++) {
  advanceWorld(db, year * 365, (year + 1) * 365, player.id);

  let moves = 0;
  let up = 0;
  let down = 0;
  let lateral = 0;
  let loose = 0;
  let signed = 0;
  const next = new Map<string, string | undefined>();

  for (const f of all()) {
    const id = f.id as string;
    const now = f.promotionId as string | undefined;
    next.set(id, now);
    if (!previous.has(id)) continue; // generated this year — not a move
    if (f.retiredDay !== undefined) continue; // retiring is not a move
    const was = previous.get(id);
    if (was === now) continue;

    moves++;
    if (was === undefined) {
      signed++;
    } else if (now === undefined) {
      loose++;
    } else {
      const delta = rankOf(byId.get(now)?.tier) - rankOf(byId.get(was)?.tier);
      if (delta > 0) up++;
      else if (delta < 0) down++;
      else lateral++;
    }
  }

  totalUp += up;
  totalDown += down;
  totalLateral += lateral;
  console.log(`| ${year + 1} | ${moves} | ${up} | ${down} | ${lateral} | ${loose} | ${signed} |`);
  previous = next;
}

console.log(`\n**Ten-year totals:** ${totalUp} up, ${totalDown} down, ${totalLateral} lateral.`);
console.log(`Down-to-up ratio: **${(totalDown / Math.max(1, totalUp)).toFixed(2)}:1**.`);

// --- Where each starting cohort ended up -------------------------------------------------------

const active = all().filter((f) => f.retiredDay === undefined && f.record.length > 0);
const moved = active.filter((f) => startPromotion.get(f.id as string) !== f.promotionId);

console.log(`\n## Where each cohort ended up\n`);
console.log(`Active with at least one bout: **${active.length}**, of whom **${moved.length}** ` +
  `(${Math.round((moved.length / Math.max(1, active.length)) * 100)}%) are somewhere other than where they started.\n`);
console.log('| Started | Still active | Ended global | major | regional | unsigned |');
console.log('|---|---:|---:|---:|---:|---:|');

for (const tier of ['unsigned', ...TIER_ORDER]) {
  const cohort = active.filter((f) => startTier.get(f.id as string) === tier);
  if (cohort.length === 0) continue;
  const count = (t: string) =>
    cohort.filter((f) => (f.promotionId ? byId.get(f.promotionId)?.tier : 'unsigned') === t).length;
  console.log(
    `| ${tier} | ${cohort.length} | ${count('global')} | ${count('major')} | ${count('regional')} | ${count('unsigned')} |`,
  );
}

const top = Math.max(...promos.map((p) => p.prestige));
const canReachTop = active.filter((f) => 42 + f.reputation * 0.9 >= top);
console.log(`\nReputation at year ${YEARS}: ${quantiles(active)}`);
console.log(
  `Active fighters clearing the top promotion's gate (prestige ${top}, needs reputation ` +
    `${((top - 42) / 0.9).toFixed(0)}): **${canReachTop.length} of ${active.length}**.`,
);
console.log(`\nWorld day ${getWorld(db).day}. Retired so far: ${all().filter((f) => f.retiredDay !== undefined).length}.`);
