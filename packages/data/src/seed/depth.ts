/**
 * Roster depth, generated.
 *
 * The seeded 2020 world carries 139 hand-authored fighters across twelve divisions and five
 * promotions — an average of two or three per division per promotion. That is not enough
 * people to run the sport, and it showed up as a measured defect rather than a suspicion:
 * the world's cards averaged **1.8 to 3.1 bouts** against a designed card size of nine,
 * because `offerOpponents` needs two available fighters in the *same division on the same
 * promotion*, and there routinely were not two.
 *
 * Every downstream system inherited that. Card position was mostly meaningless because there
 * were only two positions to fill; the prelim tier did not exist; the depth term in
 * `eventRevenue` was permanently penalised; and doc 12's whole card structure was running on
 * stubs.
 *
 * The named fighters are the ones a player recognises and the ones whose ratings are worth
 * arguing about. Everybody else is generated — which is honest about what they are, and is
 * also how the real sport is shaped: a promotion's roster is a dozen people you can name and
 * a hundred you cannot.
 *
 * Determinism matters here as much as anywhere else in the engine: the same era seed always
 * produces the same filler, so two players comparing notes are talking about the same world.
 */

import {
  asPromotionId,
  createRng,
  DIVISIONS,
  generateFighter,
  type DivisionId,
  type Fighter,
} from '@mmasim/engine';

/**
 * How many fighters a promotion needs in one division for its cards to work.
 *
 * Derived from the constraint rather than picked: a nine-bout card needs eighteen fighters,
 * spread across the divisions the promotion runs. At any moment most of a roster is
 * unavailable — `MAX_BOUTS_PER_YEAR` caps everyone at three bouts a year and a stoppage
 * carries a medical suspension — so roughly a third of a division is bookable on any given
 * date. Two bookable fighters per division across nine or ten divisions is what fills a card,
 * which means six in the division.
 *
 * Exported because the generated world has to obey the same arithmetic and did not: it spread a
 * promotion's roster across a division count fixed by tier, so a national show ran nine divisions
 * four fighters deep and a local show ran five divisions with **one fighter in each**. A division
 * of four is not a thin division, it is a division where the same two people fight forever and
 * `offerOpponents` falls through to its cross-promotional last resort every time. A promotion
 * that cannot fill six per division runs fewer weight classes, which is also what small
 * promotions do in life.
 */
export const MIN_DIVISION_DEPTH = 6;

/**
 * The same floor for a women's division.
 *
 * Lower, because the real women's divisions are genuinely shallower — `DIVISION_FLOOR` in the
 * world loop already says six against nine for exactly this reason — but not zero, and that was
 * the other half of the defect: a generated promotion running nine divisions ran the eight men's
 * ones plus women's strawweight, and its target for women's divisions was **0**. It advertised a
 * division it had nobody in.
 */
export const MIN_WOMENS_DIVISION_DEPTH = 4;

/**
 * Set higher for the promotion at the top of the sport, because a global promotion's real
 * problem is the opposite one: it has more contenders than dates.
 */
export interface DepthTarget {
  promotionId: string;
  /** Fighters per men's division. */
  mens: number;
  /** Fighters per women's division. Real women's divisions are genuinely shallower. */
  womens: number;
  /**
   * 1–100. The average quality of generated fighters here, before variance.
   *
   * This is what makes the tiers of the sport mean something: a regional promotion is not a
   * small version of the global one, it is a different standard of fighter.
   */
  tier: number;
  /** Spread around `tier`. A promotion with a wide spread has genuine prospects on it. */
  spread: number;
  /**
   * The weight classes this promotion actually runs. Defaults to every division in the world.
   *
   * The default is what the hand-authored eras want — their promotions run the divisions the seed
   * says and the leftovers are harmless — and it is wrong for a generated pyramid, where a local
   * show runs one or two weight classes. Without it, `buildDepthFighters` filled all twelve for
   * every promotion in the world: a Small world came out at 2,504 fighters against a target of
   * 850, most of them signed to a promotion that does not stage their division and therefore
   * unbookable by anybody, forever.
   */
  divisions?: readonly DivisionId[];
}

export interface DepthOptions {
  targets: readonly DepthTarget[];
  /** Named fighters already on each promotion, so generation only fills the gap. */
  existing: readonly Fighter[];
  /** Seed day, for ages and birth dates. */
  day: number;
  /** RNG seed. The same string always produces the same filler. */
  seed: string;
  /** Divisions this world runs. Defaults to all of them. */
  divisions?: readonly DivisionId[];
  /**
   * Years of simulation this population is about to be aged through before anybody sees it.
   *
   * Zero for a world that opens on the day it is built, which is every seeded era. Non-zero for a
   * generated world, where doc 27 § 4.2 builds the population *before* the start date and
   * simulates forward to it — and a roster generated with the ages the player should eventually
   * see arrives eight years too old, because ageing is the one thing the run definitely does to
   * everybody.
   *
   * The right roster to build for 2018 is a younger one: the fighters in their prime when the
   * player arrives are the prospects of eight years earlier, and that year's veterans should have
   * retired by the time the game opens. Shifting the draw down by the span says exactly that, and
   * the professional floor below stops it saying anything sillier.
   */
  ageForwardYears?: number;
}

/**
 * The youngest a generated fighter can be, whatever the shift.
 *
 * Professional debuts happen at eighteen and essentially never before it. Without a floor, a large
 * `ageForwardYears` would put children on the roster — and, worse, give them a record, because
 * pre-history books whoever is there.
 */
const MINIMUM_PRO_AGE = 18;

/**
 * Fill every promotion up to its depth target.
 *
 * Counts what is already there per promotion per division and generates only the shortfall,
 * so adding a named fighter to the roster reduces the filler rather than adding to it. That
 * keeps the total stable as the hand-authored roster grows.
 */
export function buildDepthFighters(options: DepthOptions): Fighter[] {
  const { targets, existing, day, seed } = options;
  const divisions = options.divisions ?? DIVISIONS.map((d) => d.id);
  const shift = Math.max(0, options.ageForwardYears ?? 0);
  const generated: Fighter[] = [];

  for (const target of targets) {
    const promotionId = asPromotionId(target.promotionId);

    for (const divisionId of divisions) {
      const division = DIVISIONS.find((d) => d.id === divisionId);
      if (!division) continue;

      if (target.divisions && !target.divisions.includes(divisionId)) continue;

      const want = division.sex === 'female' ? target.womens : target.mens;
      const have = existing.filter(
        (f) => f.promotionId === promotionId && f.divisionId === divisionId,
      ).length;

      for (let i = have; i < want; i++) {
        /*
         * Seeded per slot rather than per promotion, so a change to one division's target
         * does not reshuffle every other fighter in the world. A save built before the change
         * and one built after should differ only where the numbers actually differ.
         */
        const rng = createRng(`${seed}:depth:${target.promotionId}:${divisionId}:${i}`);

        /*
         * Age is drawn rather than fixed, and skewed young, because a roster that is entirely
         * 27-year-olds has no shape: nobody is retiring, nobody is a prospect, and the world
         * cannot tell a story about a division turning over.
         */
        /*
         * Drawn rather than fixed, and skewed young, because a roster that is entirely
         * 27-year-olds has no shape: nobody is retiring, nobody is a prospect, and the world
         * cannot tell a story about a division turning over.
         *
         * The whole draw slides down by `ageForwardYears`, so that a population about to be aged
         * through pre-history arrives at the start date looking like the one this line describes
         * rather than eight years past it.
         */
        const age = Math.round(
          rng.normalClamped(
            27 - shift,
            4.5,
            Math.max(MINIMUM_PRO_AGE, 20 - shift),
            Math.max(MINIMUM_PRO_AGE + 1, 39 - shift),
          ),
        );

        generated.push(
          generateFighter(rng, {
            id: `f_gen_${target.promotionId}_${divisionId}_${i}`,
            divisionId,
            sex: division.sex,
            day,
            age,
            tier: Math.round(rng.normalClamped(target.tier, target.spread, 8, 96)),
            promotionId,
          }),
        );
      }
    }
  }

  return generated;
}

/**
 * Free agents, so the market is not empty.
 *
 * Doc 16's free agency is a near-monopsony, which only reads as one if there are people
 * outside it. Without unattached fighters, "signed" is the only state anybody is ever in and
 * a promotion cutting somebody has nowhere to put them.
 */
export function buildFreeAgents(input: {
  count: number;
  day: number;
  seed: string;
  tier: number;
  spread: number;
  divisions?: readonly DivisionId[];
}): Fighter[] {
  const divisions = input.divisions ?? DIVISIONS.map((d) => d.id);
  const out: Fighter[] = [];

  for (let i = 0; i < input.count; i++) {
    const rng = createRng(`${input.seed}:free:${i}`);
    const divisionId = rng.pick(divisions);
    const division = DIVISIONS.find((d) => d.id === divisionId);
    if (!division) continue;

    out.push(
      generateFighter(rng, {
        id: `f_free_${i}`,
        divisionId,
        sex: division.sex,
        day: input.day,
        // Skewed younger than a contracted roster: the unattached pool is mostly people on
        // the way up, plus a tail of people on the way back down.
        age: Math.round(rng.normalClamped(25, 4, 20, 38)),
        tier: Math.round(rng.normalClamped(input.tier, input.spread, 5, 80)),
      }),
    );
  }

  return out;
}
