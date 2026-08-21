/**
 * Building a world instead of shipping one.
 *
 * Doc 27's central move: the game generates its own sport rather than loading a hand-authored
 * snapshot of the real one. The legal constraint is the actual driver — no real fighter, promotion
 * or venue can ship — but the design argument stands on its own, because a generated world is the
 * only kind that can be a *different* world the second time you play.
 *
 * Two halves, and the second is the expensive one:
 *
 *  1. **The pyramid.** Doc 26 § 2.2's five tiers — one apex, a few majors, a dozen or so nationals,
 *     a few dozen feeders, and a wide base of local shows — populated to the chosen size.
 *  2. **Pre-history.** Eight years of the sport simulated at doc 27 § 5's Bulk level, so that every
 *     record has real opponents behind it, every win has a matching loss somewhere, champions have
 *     reigns and the apex roster is people who climbed there.
 *
 * The second is why this is asynchronous. It is seconds of work, and the alternative to reporting
 * progress through it is a frozen tab.
 */

import { CURRENT_SCHEMA_VERSION } from '../db/migrations.js';
import { createGameDb, setWorld, type GameDb } from '../db/gameDb.js';
import { createMemoryAdapter } from '../db/adapters.js';
import type { Entity, StorageAdapter } from '../db/types.js';
import { buildDepthFighters, type DepthTarget } from '../seed/depth.js';
import { buildSeedWorld } from '../seed/index.js';
import {
  DIVISIONS,
  asFighterId,
  asPromotionId,
  championshipId,
  type Championship,
  type Coach,
  type Commentator,
  type Fighter,
  type Gym,
  type Judge,
  type Manager,
  type Promotion,
  type PromotionTier,
  type Referee,
} from '@mmasim/engine';

export const WORLD_SIZES = ['small', 'medium', 'large'] as const;
export type WorldSize = (typeof WORLD_SIZES)[number];

export interface WorldSizeMeta {
  id: WorldSize;
  name: string;
  /** Signed fighters the sport is built to hold. */
  fighters: number;
  blurb: string;
  /**
   * Roughly how long generation takes on a desktop, in seconds, measured.
   *
   * Stated so the UI can warn rather than guess. A mid-range phone is three to five times slower
   * and that multiplier is an assumption rather than a measurement — see doc 27 § 10.7.
   */
  seconds: number;
  /** Set on a size the player should be warned about before they pick it. */
  warning?: string;
}

/**
 * The three sizes, and the numbers are measured rather than round.
 *
 * `fighters` is a target the pyramid is scaled to hit; `seconds` is what eight years of bulk
 * pre-history actually cost on the machine this was developed on (doc 27 § 10.6).
 */
export const WORLD_SIZE_META: readonly WorldSizeMeta[] = [
  {
    id: 'small',
    name: 'Small',
    fighters: 850,
    blurb:
      'A compact sport — one leader, a couple of majors and a short regional circuit. Quick to build, and quick to reach the top of.',
    seconds: 3,
  },
  {
    id: 'medium',
    name: 'Medium',
    fighters: 2500,
    blurb:
      'The default. A full five-tier pyramid with real depth in every division and a regional scene deep enough to get lost in.',
    seconds: 11,
  },
  {
    id: 'large',
    name: 'Large',
    fighters: 5000,
    blurb:
      'The sport at something close to its real scale — the whole pyramid, and a regional circuit you will never see the bottom of.',
    seconds: 25,
    warning:
      'Takes around half a minute to build on a desktop and several minutes on a phone. Everything after that runs normally.',
  },
];

export const DEFAULT_WORLD_SIZE: WorldSize = 'medium';

export const worldSizeMeta = (id: WorldSize): WorldSizeMeta =>
  WORLD_SIZE_META.find((s) => s.id === id) ?? WORLD_SIZE_META[1]!;

/**
 * Years of the sport simulated before the player arrives.
 *
 * **Eight, measured.** The original fifteen was picked so that "a 35-year-old at the start date has
 * a full career behind them", and that reason does not hold: `generateFighter` already gives
 * everybody a synthetic `priorRecord`, so the deep past is covered whatever this is. What
 * pre-history has to produce is the part a player can open, and doc 27 § 10.5 measured that
 * saturating at six to eight years — after which the share of the roster with a real record
 * actually *falls*, because the intake keeps adding debutants.
 */
export const PREHISTORY_YEARS = 8;

/**
 * Below this prestige, pre-history resolves a promotion's fights from ratings.
 *
 * Doc 27 § 10.6. The base of the pyramid exists so that people can climb out of it; it does not
 * need eight years of individually simulated bouts to do that job, and against the real pyramid
 * shape skipping them is worth a quarter to a third of the whole run. It costs style — `paperOdds`
 * reads overall rating and nothing else — and it is only ever applied to promotions the player has
 * never heard of.
 */
export const STATISTICAL_BELOW_PRESTIGE = 44;

interface TierSpec {
  label: string;
  tier: PromotionTier;
  count: number;
  /** Signed fighters per promotion. */
  roster: number;
  prestige: [number, number];
  /** Divisions this tier runs. The bottom of the sport does not have twelve weight classes. */
  divisions: number;
  /** Average quality of the fighters on it, before spread. The ladder, in one column. */
  quality: number;
}

/**
 * Doc 26 § 2.2's pyramid, with the two bottom tiers collapsed.
 *
 * The design has five tiers and `PromotionTier` has four — doc 26 § 4.2 is the item that fixes
 * that — so feeder and local shows share a tier and are separated by prestige.
 *
 * **There is only one apex.** That is the most important structural fact in doc 26 and the easiest
 * to get wrong: the leader is not the biggest of several majors, it is a different category.
 */
const PYRAMID: readonly TierSpec[] = [
  {
    label: 'apex',
    tier: 'global',
    count: 1,
    roster: 400,
    prestige: [96, 96],
    divisions: 12,
    quality: 64,
  },
  {
    label: 'major',
    tier: 'major',
    count: 4,
    roster: 200,
    prestige: [62, 72],
    divisions: 11,
    quality: 52,
  },
  {
    label: 'national',
    tier: 'regional',
    count: 15,
    roster: 100,
    prestige: [46, 58],
    divisions: 9,
    quality: 45,
  },
  {
    label: 'feeder',
    tier: 'developmental',
    count: 30,
    roster: 50,
    prestige: [30, 43],
    divisions: 7,
    quality: 38,
  },
  {
    label: 'local',
    tier: 'developmental',
    count: 0,
    roster: 8,
    prestige: [8, 26],
    divisions: 5,
    quality: 30,
  },
];

/**
 * Doc 26's pyramid has a floor, and it is higher than "Small".
 *
 * Its top four tiers are 4,072 signed fighters before a single local show exists. So a world of 850
 * cannot have that shape by adding fewer local promotions; it has to be a *smaller pyramid*, with
 * fewer promotions per tier and thinner rosters on each.
 *
 * Rosters shrink faster than counts, which is what a smaller sport actually looks like: the same
 * ladder with thinner rungs rather than a ladder with rungs missing.
 */
function scaled(spec: TierSpec, factor: number): { count: number; roster: number } {
  if (factor >= 1) return { count: spec.count, roster: spec.roster };
  return {
    count: spec.label === 'apex' ? 1 : Math.max(1, Math.round(spec.count * factor ** 0.4)),
    roster: Math.max(6, Math.round(spec.roster * factor ** 0.6)),
  };
}

export interface GenerateOptions {
  size?: WorldSize;
  /** Same seed, same world, always. */
  seed?: string;
  playerRole?: 'fighter' | 'coach' | 'promoter';
  adapter?: StorageAdapter;
  createdAtIso?: string;
  /**
   * The day to build the population on. Defaults to the era's start date.
   *
   * `generateWorld` passes the start date **minus the pre-history span**, because doc 27 § 4.2's
   * whole method is "build the population at start-date minus N years, then run the sport at low
   * fidelity up to the start date". Building at the start date and simulating *past* it leaves
   * every date the run stamps — every record entry, every medical suspension, every reign — in the
   * player's future.
   */
  day?: number;
  /**
   * Years of simulation the population will be aged through before the player sees it.
   *
   * `generateWorld` passes the pre-history span. See `DepthOptions.ageForwardYears`: a roster
   * built with the ages the player should end up seeing arrives that many years too old, because
   * ageing is the one thing the run does to everybody.
   */
  ageForwardYears?: number;
}

export type GenerationPhase = 'pyramid' | 'history' | 'settling';

export interface GenerationProgress {
  phase: GenerationPhase;
  /** 0–1 across the whole job. */
  done: number;
  /** Something to put next to the bar. */
  label: string;
}

/** Builds the pyramid. Synchronous and fast; the years are the expensive half. */
export function generatePyramid(options: GenerateOptions = {}): GameDb {
  const size = options.size ?? DEFAULT_WORLD_SIZE;
  const seed = options.seed ?? `generated-${size}`;
  const target = worldSizeMeta(size).fighters;

  const db = createGameDb(options.adapter ?? createMemoryAdapter(), true);

  /*
   * The officials, gyms and coaches come from the seed for now.
   *
   * Doc 27 § 6 wants them generated from the talent map alongside everything else, and that is a
   * later step: they carry no real people's names, so they are not what the legal constraint is
   * about, and generating a judge is a much smaller problem than generating a sport.
   */
  const scaffolding = buildSeedWorld('2026');
  db.gyms.upsertMany(scaffolding.gyms as unknown as (Gym & Entity)[]);
  db.coaches.upsertMany(scaffolding.coaches as unknown as (Coach & Entity)[]);
  db.referees.upsertMany(scaffolding.referees as unknown as (Referee & Entity)[]);
  db.judges.upsertMany(scaffolding.judges as unknown as (Judge & Entity)[]);
  db.commentators.upsertMany(scaffolding.commentators as unknown as (Commentator & Entity)[]);
  db.managers.upsertMany(scaffolding.managers as unknown as (Manager & Entity)[]);

  const day = options.day ?? scaffolding.day;
  const template = scaffolding.promotions[0]!;

  const natural = PYRAMID.filter((t) => t.label !== 'local').reduce(
    (total, t) => total + t.count * t.roster,
    0,
  );
  // The top four tiers get 80% of the budget; local shows are the rest.
  const factor = Math.min(1, (target * 0.8) / natural);
  const sizes = new Map(PYRAMID.map((spec) => [spec.label, scaled(spec, factor)]));
  const spentAbove = PYRAMID.filter((t) => t.label !== 'local').reduce(
    (total, t) => total + sizes.get(t.label)!.count * sizes.get(t.label)!.roster,
    0,
  );
  const localSize = sizes.get('local')!.roster;
  const localCount = Math.max(1, Math.round((target - spentAbove) / localSize));

  const promotions: Promotion[] = [];
  const targets: DepthTarget[] = [];

  for (const spec of PYRAMID) {
    const shape = sizes.get(spec.label)!;
    const count = spec.label === 'local' ? localCount : shape.count;
    for (let i = 0; i < count; i++) {
      const id = `p_${spec.label}_${i}`;
      const span = spec.prestige[1] - spec.prestige[0];
      const prestige =
        spec.prestige[0] + (count <= 1 ? span : Math.round((span * i) / (count - 1)));

      promotions.push({
        ...template,
        id: asPromotionId(id),
        name: `${spec.label} ${i + 1}`,
        shortName: `${spec.label.slice(0, 3).toUpperCase()}${i + 1}`,
        tier: spec.tier,
        prestige,
        // Scaled to the operation, so `solvency` and `chargeCosts` see a plausible business.
        budget: Math.round(shape.roster * prestige * 3),
        divisions: DIVISIONS.slice(0, spec.divisions).map((d) => d.id),
        champions: {},
      });

      const mens = Math.max(1, Math.round(shape.roster / Math.max(1, spec.divisions)));
      targets.push({
        promotionId: id,
        mens,
        womens: spec.divisions >= 10 ? Math.round(mens * 0.55) : 0,
        tier: spec.quality,
        spread: 11,
      });
    }
  }

  db.promotions.upsertMany(promotions as unknown as (Promotion & Entity)[]);

  // A belt for every division a promotion runs, so pre-history has something to fight over.
  const titles: Championship[] = [];
  for (const promotion of promotions) {
    for (const divisionId of promotion.divisions) {
      titles.push({
        id: championshipId(promotion.id, divisionId),
        promotionId: promotion.id,
        divisionId,
        lineage: [],
        vacancy: { since: day, reason: 'newDivision' },
      });
    }
  }
  db.championships.upsertMany(titles as unknown as (Championship & Entity)[]);

  const fighters = buildDepthFighters({
    targets,
    existing: [],
    day,
    seed: `${seed}:depth`,
    ageForwardYears: options.ageForwardYears,
  }).map((f, i) => ({ ...f, id: asFighterId(`${f.id}_${i}`) }));
  db.fighters.upsertMany(fighters as (Fighter & Entity)[]);

  const divisionTargets: Record<string, number> = {};
  const rosterTargets: Record<string, number> = {};
  for (const f of fighters) {
    divisionTargets[f.divisionId] = (divisionTargets[f.divisionId] ?? 0) + 1;
    if (f.promotionId) rosterTargets[f.promotionId] = (rosterTargets[f.promotionId] ?? 0) + 1;
  }

  setWorld(db, {
    day,
    /*
     * Where the player's involvement begins.
     *
     * The same day the world is built on, here. `generateWorld` then simulates *forward* to the
     * era's start date and moves both, which is the point: the player arrives when pre-history
     * ends, not when the generator ran. Without an anchor at all, "days since this fighter was
     * last booked" falls back to today and somebody nobody has touched in a year reads as freshly
     * signed.
     */
    startedDay: day,
    divisionTargets,
    rosterTargets,
    seed,
    era: '2026',
    generatedSize: size,
    playerRole: options.playerRole,
    createdAtIso: options.createdAtIso,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  return db;
}
