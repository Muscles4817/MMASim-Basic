/**
 * Seeding the belts.
 *
 * Every promotion shipped `champions: {}`, which meant no title fight was possible anywhere in
 * the game — `proposalsFor` and the world's matchmaker both require an existing champion, so no
 * champion meant no title fight meant no champion, permanently. Measured before this: zero title
 * fights across ninety-six cards, and twelve vacant belts at the biggest promotion in the sport
 * on day one.
 *
 * A vacant title is a *consequence* — somebody retired, got hurt, moved up, walked out. A
 * promotion that has been running for years does not have twelve empty divisions, and starting
 * one that way is not a neutral default, it is a claim that something catastrophic just happened
 * and then failing to say what.
 *
 * So every division a promotion actually runs starts with a champion, and each of them starts
 * with a reign already behind them, because a champion crowned on day one has no history and the
 * whole point of a lineage is that the sport has one before the player arrives.
 */

import {
  championshipId,
  createRng,
  overallRating,
  type Championship,
  type DivisionId,
  type Fighter,
  type Promotion,
  type Reign,
} from '@mmasim/engine';

/**
 * Who holds each belt at the start.
 *
 * Picked on merit rather than at random, and merit here is deliberately `overallRating` plus a
 * weighting on star power — a promotion's champion is usually its best fighter in the division
 * and occasionally its most marketable, and a pure rating sort would produce a roster of
 * champions nobody has heard of.
 *
 * Named fighters win ties, because a seeded world where the recognisable name is the contender
 * and a generated one holds the belt reads as broken even when the numbers justify it.
 */
export function buildChampionships(input: {
  promotions: readonly Promotion[];
  fighters: readonly Fighter[];
  day: number;
  seed: string;
}): Championship[] {
  const { promotions, fighters, day, seed } = input;
  const titles: Championship[] = [];

  for (const promotion of promotions) {
    for (const divisionId of promotion.divisions) {
      const contenders = fighters.filter(
        (f) => f.promotionId === promotion.id && f.divisionId === divisionId,
      );
      if (contenders.length < 2) continue;

      const rank = (f: Fighter) =>
        overallRating(f.attributes) + f.starPower * 0.12 + (isNamed(f) ? 3 : 0);

      const champion = contenders.slice().sort((a, b) => rank(b) - rank(a))[0]!;
      const rng = createRng(`${seed}:title:${promotion.id}:${divisionId}`);

      /*
       * A reign already under way.
       *
       * Length and defences are drawn rather than fixed so the sport has a shape on day one:
       * some divisions have a long-reigning champion the player has to solve, some have somebody
       * who just won it. A world where every belt changed hands on the same day is as unreal as
       * one where none of them has ever been contested.
       */
      const heldDays = Math.round(rng.normalClamped(400, 320, 40, 1600));
      const defences = Math.min(6, Math.floor(heldDays / 220) + (rng.chance(0.35) ? 1 : 0));

      const reign: Reign = {
        fighterId: champion.id,
        wonDay: day - heldDays,
        defences,
      };

      titles.push({
        id: championshipId(promotion.id, divisionId),
        promotionId: promotion.id,
        divisionId: divisionId as DivisionId,
        lineage: [reign],
      });
    }
  }

  return titles;
}

/** Hand-authored fighters carry an era prefix; generated ones do not. */
const isNamed = (f: Fighter): boolean =>
  (f.id as string).startsWith('f26_') || !(f.id as string).startsWith('f_gen_');

/** The denormalised map the matchmaker reads, rebuilt from the lineage. */
export function championMapFor(
  promotion: Promotion,
  titles: readonly Championship[],
): Promotion['champions'] {
  const champions: Record<string, string> = {};
  for (const title of titles) {
    if (title.promotionId !== promotion.id) continue;
    const reign = title.lineage[title.lineage.length - 1];
    if (reign && reign.lostDay === undefined) champions[title.divisionId as string] = reign.fighterId as string;
  }
  return champions as Promotion['champions'];
}
