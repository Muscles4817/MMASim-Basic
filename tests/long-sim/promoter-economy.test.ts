/**
 * Running a regional promotion is a business, not a money printer.
 *
 * The promoter audit ran an autopilot over a generated world and the economy could not be lost:
 * cash went from £3.6m to £12.0m in four years, 26 of 27 cards made money, cards with two of their
 * nine bouts signed still made money, one three-fight regional card in front of 4,461 people
 * cleared £481k, an empty card forecast a profit, and every promotion in the sport grew — the
 * leader from £19m to £133m. Doc 34's B1 rebuilt the money underneath that; this pins what it is
 * meant to produce.
 *
 * Eight worlds, and every claim is about their mean. A year of the running world is chaotic: the
 * same policy measured anywhere from −20% to +50% depending on the world, so a bound on any single
 * world tests the seed as much as the design. The same eight for every policy, so the comparison
 * is the decisions and nothing else.
 *
 * A generated promotion starts with a couple of years of running costs in the bank, so a year's
 * cards are a visible share of it: doing nothing loses a third, and how the cards are run decides
 * whether the rest of the year wins it back.
 */

import { describe, expect, it } from 'vitest';
import type { GameDb } from '@mmasim/data';
import type { Promotion } from '@mmasim/engine';
import { generateWorld } from '../../packages/app/src/game/newWorld';
import {
  runAutopilot,
  takeTopRegional,
  type AutopilotPolicy,
  type CardLog,
} from '../helpers/autopilot';

const SEEDS = [
  'economy-a',
  'economy-b',
  'economy-c',
  'economy-d',
  'economy-e',
  'economy-f',
  'economy-g',
  'economy-h',
] as const;
const YEAR = 365;

interface Run {
  seed: string;
  policy: AutopilotPolicy;
  cards: CardLog[];
  /** The player's cash after a year, against what they started with. */
  growth: number;
  /** Every other promotion's cash after the year, against its start. */
  sport: { promotion: Promotion; growth: number }[];
}

async function run(seed: string, policy: AutopilotPolicy): Promise<Run> {
  const db: GameDb = await generateWorld({ size: 'small', seed, yieldToUi: async () => {} });
  const player = takeTopRegional(db);
  const start = new Map(
    (db.promotions.findAll() as unknown as Promotion[]).map((p) => [p.id as string, p.budget]),
  );
  const cards = runAutopilot({ db, promotionId: player.id as string, policy, days: YEAR });
  const after = db.promotions.findAll() as unknown as Promotion[];
  const growthOf = (p: Promotion) => p.budget / start.get(p.id as string)! - 1;
  return {
    seed,
    policy,
    cards,
    growth: growthOf(after.find((p) => p.id === player.id)!),
    sport: after
      .filter((p) => p.id !== player.id)
      .map((p) => ({ promotion: p, growth: growthOf(p) })),
  };
}

const idle = await Promise.all(SEEDS.map((seed) => run(seed, 'idle')));
const sloppy = await Promise.all(SEEDS.map((seed) => run(seed, 'sloppy')));
const sensible = await Promise.all(SEEDS.map((seed) => run(seed, 'sensible')));

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: readonly number[]) =>
  xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const summary = (runs: readonly Run[]) =>
  runs.map((r) => `${r.seed} ${r.policy} ${pct(r.growth)}`).join(', ');

describe('a year on autopilot', () => {
  it('loses a promoter who runs nothing a large part of what they started with', () => {
    expect(mean(idle.map((r) => r.growth)), summary(idle)).toBeLessThan(-0.25);
  });

  it('pays a promoter who runs good cards, clearly ahead of running none', () => {
    const good = mean(sensible.map((r) => r.growth));
    expect(good, summary(sensible)).toBeGreaterThan(0.12);
    expect(good - mean(idle.map((r) => r.growth)), summary(sensible)).toBeGreaterThan(0.3);
  });

  it('costs a sloppy promoter a little, rather than making them rich', () => {
    /*
     * Paying every counter-offer and running whatever the matchmaker hands you should end the
     * first year between flat and a tenth down: a business being run badly, not one being run
     * into the ground and not one that cannot be lost. Averaged over the eight worlds; one world
     * on its own swings several points either way on who happened to counter.
     */
    const growth = mean(sloppy.map((r) => r.growth));
    expect(growth, summary(sloppy)).toBeLessThanOrEqual(0);
    expect(growth, summary(sloppy)).toBeGreaterThanOrEqual(-0.1);
  });

  it('rewards running the cards well: pricing counters, keeping fights that pay, calling off losers', () => {
    /*
     * Same worlds, a few decisions different, and it has to show in the bank. On the mean: a single
     * world can still go the other way, because the rest of the sport reacts to the player's
     * cards as well, and the spread between two policies in one world was measured at up to thirty
     * points either way.
     */
    expect(
      mean(sensible.map((r) => r.growth)) - mean(sloppy.map((r) => r.growth)),
      `${summary(sloppy)} || ${summary(sensible)}`,
    ).toBeGreaterThan(0.15);
  });

  it('makes a regional night worth tens of thousands, not hundreds', () => {
    /*
     * A typical night tens of thousands either way, and the best of the year a few hundred
     * thousand at most. Nowhere near the audit's £481k three-fight card. The top regional now
     * carries a major-sized organisation, so its best nights have to clear more to pay for it.
     */
    const profits = sensible.flatMap((r) => r.cards.map((c) => c.profit));
    const sorted = profits.slice().sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    expect(Math.abs(median(profits)), `card profits ${profits.join(', ')}`).toBeLessThan(150);
    expect(p90, `card profits ${profits.join(', ')}`).toBeLessThan(250);
    expect(Math.max(...profits), `card profits ${profits.join(', ')}`).toBeLessThan(400);
  });

  it('forecasts a loss for a card with nothing on it', () => {
    for (const card of [...sloppy, ...sensible].flatMap((r) => r.cards)) {
      expect(card.emptyForecast).toBeLessThan(0);
    }
  });
});

describe('the rest of the sport faces the same curve', () => {
  it('shrinks a good part of the sport, rather than growing all of it', () => {
    /*
     * The audit's world grew every promotion in it. A quarter of the sport below the leader
     * ending the year poorer is the floor on "faces the same curve". Nobody collapses in a year:
     * a promotion in trouble stops staging the cards that lose it money, and the decade-long
     * version of this — who survives — is `promotion-costs.test.ts`.
     */
    for (const run of sloppy) {
      const below = run.sport.filter((p) => p.promotion.tier !== 'global');
      const shrinking = below.filter((p) => p.growth < 0);
      expect(
        shrinking.length,
        `${run.seed}: ${shrinking.length} of ${below.length} shrank`,
      ).toBeGreaterThanOrEqual(below.length / 4);
    }
  });

  it('does not let the leader run away in a year', () => {
    for (const run of sloppy) {
      const leader = run.sport.find((p) => p.promotion.tier === 'global')!;
      expect(leader.growth, `${run.seed}: the leader grew ${pct(leader.growth)}`).toBeLessThan(0.4);
    }
  });

  it('keeps regional attention in the tier’s range', () => {
    for (const run of sloppy) {
      const regional = run.sport
        .filter((p) => p.promotion.tier === 'regional')
        .map((p) => p.promotion.buzz);
      expect(median(regional), `${run.seed}: regional buzz ${regional.join(', ')}`).toBeGreaterThan(
        20,
      );
      expect(median(regional), `${run.seed}: regional buzz ${regional.join(', ')}`).toBeLessThan(
        50,
      );
    }
  });
});
