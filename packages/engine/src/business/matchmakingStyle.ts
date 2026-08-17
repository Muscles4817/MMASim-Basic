/**
 * How a promotion decides who is next.
 *
 * `rankDivision` has existed since the ladder shipped and **nothing has ever consulted it for
 * matchmaking**. `offerOpponents` works from `overallRating` and `baseHype`, so a title shot went
 * to whoever the die picked and a champion was not reliably the best fighter in their division —
 * which is why measured reigns had a median of 112 days against a real one to two years.
 *
 * But a single ranking rule would be just as wrong in the other direction, because promotions
 * genuinely do not agree about this. A season-format promotion books a bracket and the ranking
 * *is* the result. A spectacle promotion books the fight the building wants and treats the
 * ranking as a suggestion. And the biggest promotion in the sport sits between the two: rankings
 * matter up to a point, and past that point what matters is who sells and who is fun to watch —
 * a finisher on a run gets a shot ahead of a higher-ranked wrestler nobody wants to see, and gets
 * favourable stylistic matchmaking on the way there.
 *
 * So this is a *weighting*, per promotion, over a queue that always starts from merit. The
 * ranking is never ignored — it is the thing being weighted — which keeps the sport legible while
 * letting each promotion feel like itself.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { Fighter } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';
import { traitMul } from '../domain/traits.js';
import type { RankedFighter } from './ladder.js';

/**
 * The knobs. Deliberately three, and deliberately not a single "philosophy" enum.
 *
 * Real promotions are blends — KSW is domestic *and* narrative, RIZIN is spectacle *and*
 * domestic — and an enum would force each of them into one box and then need escape hatches.
 */
export interface MatchmakingStyle {
  /**
   * 0–100. How much the published ranking decides who is next.
   *
   * At 100 the queue is the ranking, full stop, which is what a tournament format produces. At 0
   * the ranking is decoration.
   */
  rankAdherence: number;
  /**
   * 0–100. How far being exciting moves a fighter up the queue.
   *
   * The Dana axis. Above the top few contenders the sport's biggest promotion stops sorting by
   * merit and starts sorting by who people will pay to watch — and it also books *toward* that,
   * giving a popular finisher the stylistic matchup that keeps them winning entertainingly.
   */
  entertainmentBias: number;
  /**
   * 0–100. How much a home-market fighter is favoured.
   *
   * The thing that makes a national promotion a national promotion. KSW's identity is Polish
   * fighters in front of Polish crowds, and a matchmaker who ignored that would be running a
   * different company.
   */
  domesticBias: number;
}

/**
 * How exciting this fighter is to watch, 0–1.
 *
 * Not how *good* they are — the two are famously different, and the gap between them is the
 * entire reason this axis exists. A grinding wrestler can be the best fighter in a division and
 * still be the one the promotion buries; a wild swinger with a bad chin can headline.
 *
 * Built from what the fighter actually does rather than from `starPower`, because star power is
 * the *result* of being watchable and using it here would make the model circular — the famous
 * get pushed because they are famous.
 */
export function entertainmentValue(fighter: Fighter): number {
  const a = fighter.attributes;

  // Finishing threat, which is the single biggest driver of whether a fight is fun.
  const finishing = (a.power * 0.6 + a.submissions * 0.4) / 100;

  // Willingness to be in a fight rather than to win one cleanly. A low striking defence with
  // high output is a brawler, and brawlers are entertaining.
  const recklessness = clamp01((a.strikingOffence + (100 - a.strikingDefence)) / 200);

  // Grinding is the opposite of this axis, and pretending otherwise would make the whole
  // measure meaningless.
  const grind = clamp01((a.groundControl * 0.6 + a.wrestling * 0.4) / 100);

  const style =
    finishing * 0.45 + recklessness * 0.3 + (fighter.personality.aggression / 100) * 0.25;

  return clamp01(
    style * (1 - grind * 0.35) * traitMul(fighter.traits, 'heatGeneration'),
  );
}

/** The named styles, so a promotion's identity is a sentence rather than three numbers. */
export const MATCHMAKING_STYLES: Readonly<Record<string, MatchmakingStyle & { blurb: string }>> = {
  /** A bracket. The ranking is the result of the season, not an opinion about it. */
  tournament: {
    rankAdherence: 92,
    entertainmentBias: 12,
    domesticBias: 10,
    blurb: 'Books the bracket. Who is next is a matter of record, not taste.',
  },
  /**
   * The biggest promotion in the sport, and the one the player will recognise.
   *
   * High but not absolute rank adherence — the top two or three contenders are genuinely the
   * top two or three — combined with a strong entertainment bias that decides everything below
   * that, and that will fast-track somebody who sells.
   */
  showman: {
    rankAdherence: 58,
    entertainmentBias: 74,
    domesticBias: 18,
    blurb:
      'Rankings matter until they stop being interesting. Past the top few it is whoever sells, and a finisher on a run jumps the queue.',
  },
  /** Builds heroes and protects them, which is a different thing from selling fights. */
  narrative: {
    rankAdherence: 50,
    entertainmentBias: 44,
    domesticBias: 46,
    blurb: 'Builds its own stars deliberately and matches them to keep building them.',
  },
  /** The building wants a spectacle and the ranking is a suggestion. */
  spectacle: {
    rankAdherence: 26,
    entertainmentBias: 88,
    domesticBias: 40,
    blurb: 'Books what the arena wants to see. The rankings are a guide, not a queue.',
  },
  /** A national promotion whose identity is its own fighters in front of their own crowd. */
  domestic: {
    rankAdherence: 62,
    entertainmentBias: 46,
    domesticBias: 84,
    blurb: 'Domestic stars first, in front of a home crowd that came to see them.',
  },
  /**
   * A feeder, and its product is exposure.
   *
   * Books hard and by merit, because a fighter who beats everyone available gets the call — and
   * that call is what the promotion sells.
   */
  proving: {
    rankAdherence: 84,
    entertainmentBias: 30,
    domesticBias: 30,
    blurb: 'Books the hardest fight available. Beating everybody here is how you get the call.',
  },
};

export type MatchmakingStyleId = keyof typeof MATCHMAKING_STYLES;

/** A promotion's style, falling back to something sane for one that has not declared it. */
export function styleOf(promotion: Promotion): MatchmakingStyle {
  const named = promotion.matchmakingStyle
    ? MATCHMAKING_STYLES[promotion.matchmakingStyle]
    : undefined;
  if (named) return named;

  /*
   * Derived from what the promotion already says about itself rather than defaulting to a
   * constant, so an edited or custom promotion still behaves like something.
   *
   * Deliberately conservative — merit-leaning, with the entertainment and domestic biases well
   * below what a promotion that has *declared* a style gets. A promotion that has not opted into
   * a philosophy should not be quietly handing out the favours a showman promotion does: the
   * first version inferred `entertainmentBias` straight from `matchmakingAggression`, and the
   * 2020 world's promotions — none of which declare a style — started narrowing their own
   * matchmaking enough to fail a bound on offer spread that had nothing to do with this feature.
   */
  return {
    rankAdherence: clamp(100 - promotion.matchmakingAggression * 0.3, 55, 92),
    entertainmentBias: promotion.matchmakingAggression * 0.45,
    domesticBias: promotion.narrativeControl * 0.25,
  };
}

/**
 * The contender queue, in the order this promotion would actually work through it.
 *
 * Starts from the ranking and re-sorts by the promotion's own priorities. The score keeps the
 * ranking as the spine — a #1 contender is never going to fall behind a #12 no matter how
 * exciting — while letting a promotion that cares about entertainment reorder everybody in
 * between, which is what the sport's biggest promotion visibly does.
 */
export function contenderQueue(input: {
  ranked: readonly RankedFighter[];
  promotion: Promotion;
  /** Excluded from the queue, normally because they are the champion. */
  excludeId?: string;
}): RankedFighter[] {
  const { ranked, promotion, excludeId } = input;
  const style = styleOf(promotion);
  const eligible = ranked.filter((r) => (r.fighter.id as string) !== excludeId);
  if (eligible.length === 0) return [];

  const score = (entry: RankedFighter, index: number) => {
    // Merit, as a 0–1 position in the queue. First is 1.
    const meritPosition = 1 - index / Math.max(1, eligible.length - 1);

    const entertainment = entertainmentValue(entry.fighter);
    const home = entry.fighter.nationality === promotion.baseCountry ? 1 : 0;

    /*
     * Weights normalised so a promotion with a high bias on one axis is not simply louder than
     * one with a high bias on another — the *shape* of the priorities is what differs, not the
     * total volume.
     */
    const wRank = style.rankAdherence;
    const wFun = style.entertainmentBias;
    const wHome = style.domesticBias;
    const total = wRank + wFun + wHome;

    return (meritPosition * wRank + entertainment * wFun + home * wHome) / Math.max(1, total);
  };

  return eligible
    .map((entry, index) => ({ entry, score: score(entry, index) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.entry);
}

/**
 * Who gets the next title shot.
 *
 * The head of the queue, which for a tournament promotion is the #1 contender and for a
 * spectacle promotion may be somebody several places down who happens to be must-watch.
 */
export function nextContender(input: {
  ranked: readonly RankedFighter[];
  promotion: Promotion;
  championId?: string;
}): RankedFighter | undefined {
  return contenderQueue({
    ranked: input.ranked,
    promotion: input.promotion,
    excludeId: input.championId,
  })[0];
}

/**
 * How favourably this promotion would match a given fighter.
 *
 * Returns a step adjustment: negative means "find them somebody easier". This is the *stylistic
 * favour* half of the Dana axis, and it is the part that is usually left out of these models —
 * a promotion building a draw does not only put them on later, it books them opponents they
 * look good against.
 *
 * Applies to fighters who are worth building: entertaining, and not already at the top. Nobody
 * needs to protect the #1 contender, and nobody bothers protecting somebody nobody watches.
 */
export function favourFor(input: {
  fighter: Fighter;
  promotion: Promotion;
  /** Their place in the merit ranking, 1-indexed. Undefined if unranked. */
  rank?: number;
}): number {
  const { fighter, promotion, rank } = input;
  const style = styleOf(promotion);

  const entertainment = entertainmentValue(fighter);
  const home = fighter.nationality === promotion.baseCountry ? 1 : 0;

  // Being already at the top removes the reason to protect them: the fights left are the ones
  // the promotion wants to make anyway.
  const roomToBuild = rank === undefined ? 0.5 : clamp01((rank - 1) / 8);

  const favour =
    (entertainment * (style.entertainmentBias / 100) + home * (style.domesticBias / 100)) *
    roomToBuild;

  // Capped so this shades matchmaking rather than replacing it. A protected fighter still has to
  // beat somebody, and the cap is what stops a promotion walking a favourite to a belt unbeaten
  // against nobody.
  // `|| 0` normalises negative zero, which `-Math.round(0)` produces and which compares unequal
  // to 0 under Object.is — a wart that would otherwise surface in every caller's tests.
  return -Math.round(favour * 7) || 0;
}

/** How a promotion's approach reads, for the screen. */
export function describeStyle(promotion: Promotion): string {
  const named = promotion.matchmakingStyle
    ? MATCHMAKING_STYLES[promotion.matchmakingStyle]
    : undefined;
  if (named) return named.blurb;

  const style = styleOf(promotion);
  if (style.rankAdherence > 70) return 'Books by the rankings.';
  if (style.entertainmentBias > 70) return 'Books the fight people want to see.';
  return 'Balances the rankings against what sells.';
}

/** Fighters this promotion is actively building, for the promoter's roster screen. */
export function buildingUp(input: {
  ranked: readonly RankedFighter[];
  promotion: Promotion;
  limit?: number;
}): RankedFighter[] {
  const { ranked, promotion, limit = 3 } = input;
  const style = styleOf(promotion);
  if (style.entertainmentBias < 40) return [];

  return ranked
    .slice(2)
    .filter((r) => entertainmentValue(r.fighter) > 0.55)
    .slice(0, limit);
}
