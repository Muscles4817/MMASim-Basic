/**
 * Free agency.
 *
 * See docs/16-contracts-free-agency-managers.md, Part 2. The single most important thing to
 * understand before changing anything here:
 *
 *   **MMA free agency is a near-monopsony. It is escaping, not being courted.**
 *
 * The first draft described an efficient auction where "every promotion that can afford them"
 * bids. That market does not exist in this sport, and the game's own seed data already said
 * so — Apex carries a budget of 42,000 against Frontier's 900. One structurally dominant
 * buyer, and a fringe who cannot compete on prestige and mostly sign three populations:
 * fighters the leader cut, fighters whose price the leader declined to match, and regional
 * specialists the leader never wanted.
 *
 * The non-obvious consequence, and the reason this is *better* rather than merely more
 * accurate: **an efficient auction collapses doc 16's money/opportunity/level triangle**,
 * because the richest buyer wins all three axes at once. Monopsony forces the axes apart
 * permanently, because the fringe's only strategy is offering what the leader structurally
 * will not. Fewer bidders is also what pays for naming each offer's future in specifics —
 * three lines of world-state per offer is affordable at two offers and impossible at nine.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { PromotionId } from '../core/ids.js';
import type { Rng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';
import { reSignDiscount } from '../domain/personality.js';
import { tierRank } from './ladder.js';
import { marketValue } from './money.js';
import { MAX_FIGHTS_OWED, TERM_PRICING, type ChampionshipExtension, type OfferTerms } from './contracts.js';
import { connectionTo, negotiationMultiplier, type Manager } from './managers.js';

/** Why a promotion is at the table at all. */
export type OfferMotive = 'ascend' | 'lateral' | 'fall' | 'reach';

export interface Offer {
  promotion: Promotion;
  terms: OfferTerms;
  motive: OfferMotive;
  /**
   * The three lines that make this a *future* rather than a number.
   *
   * The fun brief's requirement, made affordable by the realism brief's market structure:
   * naming who the champion is and how old he is tells a player the belt is available in two
   * years, which is the lean-in moment. All of it comes out of world state already computed.
   */
  money: string;
  route: string;
  level: string;
  /**
   * Terms the incumbent structurally cannot match. The fighter's real move.
   *
   * A matching right can only match what the incumbent is *capable* of matching — revenue
   * points on a platform they do not operate, a signing bonus a promotion with a 900 budget
   * cannot cover. This converts the scene from "your choice is deleted" into "engineer an
   * offer they cannot match", which is a puzzle with visible pieces.
   */
  unmatchable: readonly string[];
}

/** Whether this promotion could even physically honour these terms. */
export function canMatch(promotion: Promotion, terms: OfferTerms): boolean {
  if (terms.revenuePoints > 0 && !promotion.revenueShareCapable) return false;
  // A signing bonus is cash out of the door on the day. A promotion cannot pay one it does
  // not have, whatever it would like to do about losing the fighter.
  if (terms.signingBonus > promotion.budget * 0.08) return false;
  return true;
}

/** What about this offer the incumbent cannot replicate, said in plain words. */
export function unmatchableTerms(incumbent: Promotion | undefined, terms: OfferTerms): string[] {
  if (!incumbent) return [];
  const out: string[] = [];

  if (terms.revenuePoints > 0 && !incumbent.revenueShareCapable) {
    out.push(
      `${incumbent.shortName} has no platform of its own, so it cannot match points on the revenue however much it wants to.`,
    );
  }
  if (terms.signingBonus > incumbent.budget * 0.08) {
    out.push(`${incumbent.shortName} cannot put £${Math.round(terms.signingBonus)}k on the table on the day.`);
  }
  if (terms.outsideBouts > 0 && incumbent.tier === 'global') {
    out.push(`${incumbent.shortName} does not let anybody fight elsewhere, at any price.`);
  }
  return out;
}

/**
 * How badly a promotion wants a fighter, 0–1.
 *
 * Deliberately not just "how good are they": a promotion thin at 155 pays over the odds, and
 * a regional show signing a global name pays a premium it cannot really afford, which is how
 * promotions overextend.
 */
export function appetite(input: {
  fighter: Fighter;
  promotion: Promotion;
  /** How many active fighters they already have in the division. */
  divisionDepth: number;
  manager?: Manager;
}): number {
  const { fighter, promotion, divisionDepth, manager } = input;

  const worth = marketValue(fighter, promotion);
  const affordable = clamp01(worth / Math.max(1, promotion.budget * 0.05));
  // Thin divisions pay over the odds. Deep ones do not need you.
  const need = clamp01(1 - divisionDepth / 12);
  // Whether the manager can get them on the phone at all.
  const access = clamp01(connectionTo(manager, promotion.id) / 100);
  const marketability = clamp01(fighter.starPower / 100);

  return clamp01(
    (0.35 + need * 0.4 + marketability * 0.5) * (1 - affordable * 0.5) * (0.4 + access * 0.9),
  );
}

export interface OfferInput {
  fighter: Fighter;
  promotions: readonly Promotion[];
  /** Who they are with now, if anybody. Undefined for a free agent or somebody just cut. */
  incumbent?: Promotion;
  /** Active fighters per division per promotion, for divisional need. */
  depthOf: (promotionId: PromotionId, fighter: Fighter) => number;
  manager?: Manager;
  day: GameDay;
  rng: Rng;
  /** Named futures need the world. Champion name and age per promotion. */
  championOf?: (promotionId: PromotionId, fighter: Fighter) => { name: string; age: number } | undefined;
  /** Where they would slot in, 1-indexed, per promotion. */
  projectedRankOf?: (promotionId: PromotionId, fighter: Fighter) => number | undefined;
}

/**
 * Who is actually at the table.
 *
 * Replaces `promotionOffers()`'s two hard filters, both of which were rules about *signings*
 * wrongly applied to *free agency*:
 *
 *  - `step !== 1` meant you could only ever be offered exactly one tier up. Lateral moves are
 *    the everyday free-agency case, and a step down is the entire content of the fall after
 *    being cut.
 *  - `streak < 2` returned nothing at all while losing, which made being cut a dead end
 *    rather than a fall — no offers, no purse, no title path, nothing.
 */
export function offersFor(input: OfferInput): Offer[] {
  const { fighter, promotions, incumbent, depthOf, manager, rng } = input;
  const currentTier = incumbent ? tierRank(incumbent.tier) : -1;
  const streak = fighter.summary.streak;

  const offers: Offer[] = [];

  for (const promotion of promotions) {
    if (incumbent && promotion.id === incumbent.id) continue;
    if (!promotion.divisions.includes(fighter.divisionId)) continue;

    const step = tierRank(promotion.tier) - currentTier;
    const motive: OfferMotive =
      step > 1 ? 'reach' : step === 1 ? 'ascend' : step === 0 ? 'lateral' : 'fall';

    // A genuine leap of two tiers happens, and it is rare and reserved for somebody who
    // sells tickets rather than somebody with a good record.
    if (motive === 'reach' && fighter.starPower < 70) continue;

    const depth = depthOf(promotion.id, fighter);
    const want = appetite({ fighter, promotion, divisionDepth: depth, manager });

    // The bar rises steeply with tier. A promotion falling *below* you does not need to be
    // impressed — that is the whole point of the fall being survivable.
    const bar =
      motive === 'fall' ? 0.05 : motive === 'lateral' ? 0.22 : motive === 'ascend' ? 0.4 : 0.62;
    if (want < bar) continue;

    const worth = marketValue(fighter, promotion);
    const negotiated = worth * negotiationMultiplier(manager) * rng.range(0.92, 1.08);

    // A promotion buying somebody else's problem pays less; one buying a name pays more, and
    // a fighter arriving on a skid is a discount everybody can see.
    const eagerness = 0.75 + want * 0.5 + clamp(streak, -3, 3) * 0.04;
    const base = Math.max(promotion.minimumPurse, negotiated * eagerness);

    // Show-heavy for a star, because a genuine draw does not accept half their money
    // contingent on the judges.
    const showShare = clamp(0.5 + (fighter.starPower / 100) * 0.25, 0.5, 0.8);

    const fightsOwed = clamp(rng.int(3, 5) + (want > 0.7 ? 1 : 0), 1, MAX_FIGHTS_OWED);
    const matchingRights = rng.chance(0.5);
    const outsideBouts =
      promotion.tier === 'regional' || promotion.tier === 'developmental' ? 2 : 0;

    /*
     * Every term is priced, which was the fun brief's central complaint about the draft: an
     * unpriced term is not a decision, it is a slider with one correct setting.
     *
     * Length is worth something to the promotion, so they pay for it. Matching rights are
     * *sold* rather than assumed, which is both better design and how consideration works.
     * Outside bouts cost the fighter, because the promotion is giving up exclusivity.
     */
    const lengthPremium = 1 + (fightsOwed - 1) * TERM_PRICING.perExtraFight;
    const matchingPremium = matchingRights ? 1 + TERM_PRICING.matchingRights : 1;
    const outsideDiscount = 1 - outsideBouts * TERM_PRICING.perOutsideBout;
    const total = base * lengthPremium * matchingPremium * outsideDiscount;

    const terms: OfferTerms = {
      showPurse: round1(total * showShare),
      winBonus: round1(total * (1 - showShare)),
      // The fringe's weapon: cash on the day, which a bigger promotion often will not bother
      // with and a poorer one cannot afford.
      signingBonus: round1(
        clamp(promotion.budget * 0.02 * want, 0, promotion.budget * 0.07) * rng.range(0.8, 1.3),
      ),
      revenuePoints: promotion.revenueShareCapable && fighter.starPower > 65 ? rng.int(1, 3) : 0,
      fightsOwed,
      // A promotion only asks for it if it might plausibly matter to them.
      championshipExtension: promotion.tier === 'global' || promotion.tier === 'major'
        ? 'standard'
        : ('none' as ChampionshipExtension),
      matchingRights,
      exclusive: promotion.tier !== 'regional' && promotion.tier !== 'developmental',
      outsideBouts,
    };

    const champion = input.championOf?.(promotion.id, fighter);
    const rank = input.projectedRankOf?.(promotion.id, fighter);

    offers.push({
      promotion,
      terms,
      motive,
      money: `£${terms.showPurse}k to show, £${terms.winBonus}k to win${
        terms.signingBonus > 0 ? `, £${terms.signingBonus}k on signing` : ''
      }.`,
      route: champion
        ? `You would be around ${rank ? `#${rank}` : 'unranked'}. The champion is ${champion.name}, ${champion.age}.`
        : rank
          ? `You would be around #${rank}. The belt is vacant.`
          : 'Nobody here is ranked yet. You would be starting the division.',
      level: describeLevel(motive, promotion),
      unmatchable: unmatchableTerms(incumbent, terms),
    });
  }

  // Best money first. A monopsony produces few offers, which is what makes naming each
  // future in specifics affordable in the first place.
  return offers.sort(
    (a, b) => b.terms.showPurse + b.terms.winBonus - (a.terms.showPurse + a.terms.winBonus),
  );
}

function describeLevel(motive: OfferMotive, promotion: Promotion): string {
  switch (motive) {
    case 'reach':
      return `A leap. ${promotion.shortName} do not normally take somebody at your stage, and their bottom half would be your top half.`;
    case 'ascend':
      return `A step up. You would start near the bottom and everybody here has been somewhere.`;
    case 'lateral':
      return `About your level. You would be competitive here immediately, which is both the appeal and the problem.`;
    case 'fall':
      return `Beneath where you have been. You would beat most of this roster, and nobody who matters would notice.`;
  }
}

/**
 * What the incumbent comes back with when they hold matching rights.
 *
 * Returns undefined when they cannot match — which is the interesting branch and the reason
 * offer *structure* rather than offer *size* is the fighter's move.
 */
export function matchResponse(input: {
  incumbent: Promotion;
  fighter: Fighter;
  rival: Offer;
  hasMatchingRights: boolean;
}): { matched: boolean; terms?: OfferTerms; reason: string } {
  const { incumbent, fighter, rival, hasMatchingRights } = input;

  if (!hasMatchingRights) {
    return { matched: false, reason: `${incumbent.shortName} has no right to match. You are free to go.` };
  }

  if (!canMatch(incumbent, rival.terms)) {
    return {
      matched: false,
      reason:
        rival.unmatchable[0] ??
        `${incumbent.shortName} cannot put those terms together, and they know it.`,
    };
  }

  // They can match, but they still have to want to. A loyal fighter is cheaper to keep.
  const discount = reSignDiscount(fighter.personality);
  const cost = (rival.terms.showPurse + rival.terms.winBonus) * (1 - discount);
  const willing = cost <= incumbent.budget * 0.06;

  return willing
    ? {
        matched: true,
        terms: { ...rival.terms, signingBonus: rival.terms.signingBonus * 0.6 },
        reason: `${incumbent.shortName} matched it. You are staying whether you like it or not.`,
      }
    : {
        matched: false,
        reason: `${incumbent.shortName} looked at the number and let you walk.`,
      };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
