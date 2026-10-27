/**
 * Rival promotions with intent. Doc 34 B4.
 *
 * Every AI promotion in the sport behaved identically apart from size: it booked by the rankings,
 * signed whoever free agency handed it, and never once did anything *to* the player. A promoter's
 * competition was a background process. This is what gives the rest of the sport intentions:
 *
 *  - a **posture** — Aggressor, Developer or Moneyball — read from who the promotion is;
 *  - **counter-programming**: an aggressive rival in the same market books its card against yours
 *    and takes a share of the gate;
 *  - **bids** on your expiring stars, chosen by posture, through C4's matching window;
 *  - **poaching**: a release-clause offer for a champion;
 *  - and, for the generated world, the **character** doc 33 found missing — where a promotion is
 *    from, how it books and how it treats the people it signs.
 *
 * Pure. The app decides when each of these is asked and what happens to the answer.
 */

import { clamp, clamp01 } from '../core/math.js';
import { createRng, hashSeed, type Rng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';
import type { Promotion, PromotionTier } from '../domain/organisations.js';
import type { OfferTerms } from './contracts.js';
import type { EventRevenue } from './events.js';
import type { MatchmakingStyleId } from './matchmakingStyle.js';
import type { SponsorshipPolicy } from './money.js';

// --- Posture -----------------------------------------------------------------------------------

export type PromotionPosture = 'aggressor' | 'developer' | 'moneyball';

export const POSTURES: readonly PromotionPosture[] = ['aggressor', 'developer', 'moneyball'];

export const POSTURE_META: Readonly<Record<PromotionPosture, { label: string; blurb: string }>> = {
  aggressor: {
    label: 'Aggressor',
    blurb: 'Goes after other promotions’ stars and dates. Spends to win the week.',
  },
  developer: {
    label: 'Developer',
    blurb: 'Builds its own. Signs young, protects them, and rarely picks a fight with anybody.',
  },
  moneyball: {
    label: 'Moneyball',
    blurb: 'Buys what the market undervalues and sells what it overrates. Never overpays.',
  },
};

/**
 * Who a promotion is, as a posture. Stored when a world was generated with one; otherwise read
 * from its identity — tier, money, matchmaking style — with a seeded tie-break on its id, so the
 * hand-authored eras have postures without anybody writing them down and the answer never
 * changes between reads.
 */
export function postureOf(
  promotion: Pick<
    Promotion,
    'id' | 'tier' | 'budget' | 'prestige' | 'matchmakingStyle' | 'matchmakingAggression'
  > & { posture?: PromotionPosture },
): PromotionPosture {
  if (promotion.posture) return promotion.posture;
  const weights = postureWeights(promotion.tier, promotion.matchmakingStyle);
  // Money pulls toward aggression: a rich promotion can afford to pick fights.
  weights.aggressor *= 0.6 + clamp01(promotion.budget / 20_000) * 0.8;
  weights.aggressor *= 0.7 + (promotion.matchmakingAggression ?? 50) / 160;
  return pickWeighted(weights, hashSeed(`posture:${promotion.id as string}`));
}

function postureWeights(
  tier: PromotionTier,
  style: MatchmakingStyleId | undefined,
): Record<PromotionPosture, number> {
  const byTier: Record<PromotionTier, Record<PromotionPosture, number>> = {
    global: { aggressor: 0.7, developer: 0.1, moneyball: 0.2 },
    major: { aggressor: 0.45, developer: 0.2, moneyball: 0.35 },
    regional: { aggressor: 0.3, developer: 0.35, moneyball: 0.35 },
    developmental: { aggressor: 0.1, developer: 0.65, moneyball: 0.25 },
  };
  const w = { ...byTier[tier] };
  if (style === 'proving' || style === 'narrative') w.developer *= 1.6;
  if (style === 'showman' || style === 'spectacle') w.aggressor *= 1.5;
  if (style === 'tournament') w.moneyball *= 1.4;
  return w;
}

function pickWeighted(weights: Record<PromotionPosture, number>, seed: number): PromotionPosture {
  const total = POSTURES.reduce((sum, p) => sum + weights[p], 0);
  let roll = ((seed % 10_000) / 10_000) * total;
  for (const p of POSTURES) {
    roll -= weights[p];
    if (roll < 0) return p;
  }
  return 'moneyball';
}

// --- Money-aware matchmaking ------------------------------------------------------------------

/**
 * How much a promotion's posture leans its choice of opponent toward money. Doc 34 B4 (routed).
 *
 * The world's matchmaker picked uniformly among the opponents the rankings offered, so no AI
 * promotion ever booked the fight that sold over the one that merely fitted. Each candidate is
 * weighted here: an aggressor by what the fight draws, a moneyball outfit by what it draws for
 * what it costs, a developer not at all — it books to build people, and the ranking-and-protection
 * logic that produced the candidates is already that.
 */
export function matchmakingWeights(
  posture: PromotionPosture,
  candidates: readonly { draw: number; cost: number }[],
): number[] {
  if (posture === 'developer' || candidates.length === 0) return candidates.map(() => 1);
  const score = candidates.map((c) =>
    posture === 'aggressor' ? c.draw : c.draw / Math.max(0.5, c.cost),
  );
  const best = Math.max(...score, 1e-9);
  return score.map((v) => 0.4 + v / best);
}

// --- Character for a generated promotion (doc 33) ----------------------------------------------

/**
 * Where generated promotions are from, weighted by how much of the sport each market holds at
 * each level. The top of the sport is American; the bottom is everywhere.
 */
const HOME_MARKETS: Readonly<Record<PromotionTier, readonly [string, number][]>> = {
  global: [['USA', 1]],
  major: [
    ['USA', 4],
    ['Singapore', 1],
    ['UK', 1],
    ['Japan', 1],
  ],
  regional: [
    ['USA', 4],
    ['Brazil', 2],
    ['UK', 2],
    ['Japan', 1.5],
    ['Poland', 1.5],
    ['Russia', 1.5],
    ['France', 1],
    ['Australia', 1],
    ['Canada', 1],
    ['Mexico', 1],
    ['Czechia', 0.6],
    ['Netherlands', 0.6],
  ],
  developmental: [
    ['USA', 4],
    ['Brazil', 2.5],
    ['UK', 2],
    ['Russia', 1.5],
    ['Poland', 1],
    ['Mexico', 1],
    ['Japan', 1],
    ['Australia', 1],
    ['Canada', 1],
    ['France', 1],
    ['Ireland', 0.6],
    ['Sweden', 0.5],
  ],
};

export interface PromotionCharacter {
  posture: PromotionPosture;
  baseCountry: string;
  matchmakingStyle: MatchmakingStyleId;
  matchmakingAggression: number;
  narrativeControl: number;
  sponsorshipPolicy: SponsorshipPolicy;
  activityGuarantee: number;
  notes: string;
}

/**
 * The character of a generated promotion, from its place in the pyramid and its own seed. Doc 33.
 *
 * Every generated promotion was a copy of the seed's leader at a different size. The fields that
 * decide how a promotion behaves — where it is, how it books, what it does for the people it
 * signs — are drawn here, from a stream of their own so nothing else in generation moves. The
 * posture leads and the rest leans on it: an aggressor books for the building and pays to keep
 * stars; a developer protects its prospects and guarantees them fights; a moneyball outfit books
 * by the numbers and lets fighters keep their sponsors because that costs it nothing.
 */
export function promotionCharacter(input: {
  id: string;
  tier: PromotionTier;
  prestige: number;
  seed: string;
}): PromotionCharacter {
  const rng = createRng(`${input.seed}:character:${input.id}`);
  const weights = postureWeights(input.tier, undefined);
  const posture = rng.pickWeighted([...POSTURES], (p) => weights[p]);
  const markets = HOME_MARKETS[input.tier];
  const baseCountry = rng.pickWeighted([...markets], ([, w]) => w)[0];

  const styles: Record<PromotionPosture, [MatchmakingStyleId, number][]> = {
    aggressor: [
      ['showman', 3],
      ['spectacle', 3],
      ['domestic', 1],
    ],
    developer: [
      ['proving', 3],
      ['narrative', 2],
      ['domestic', 1],
    ],
    moneyball: [
      ['tournament', 3],
      ['proving', 1],
      ['domestic', 1],
    ],
  };
  const matchmakingStyle = rng.pickWeighted(styles[posture], ([, w]) => w)[0];
  const around = (centre: number, spread: number) =>
    Math.round(clamp(rng.normalClamped(centre, spread, 5, 95), 5, 95));

  const matchmakingAggression =
    posture === 'aggressor'
      ? around(72, 10)
      : posture === 'developer'
        ? around(32, 10)
        : around(55, 10);
  const narrativeControl =
    posture === 'aggressor'
      ? around(62, 12)
      : posture === 'developer'
        ? around(58, 12)
        : around(28, 10);
  const sponsorshipPolicy: SponsorshipPolicy =
    input.tier === 'global' || (posture === 'aggressor' && rng.chance(0.5)) ? 'uniform' : 'open';
  // Developers guarantee fights because that is what they sell; moneyball outfits owe the minimum.
  const activityGuarantee =
    posture === 'developer' ? 3 : posture === 'moneyball' ? 2 : rng.int(2, 3);

  const notes =
    posture === 'aggressor'
      ? `${baseCountry}-based and loud about it. Books for the building and will come for other people’s stars.`
      : posture === 'developer'
        ? `Builds fighters in ${baseCountry} and moves them up. Protective, and guarantees its prospects dates.`
        : `Runs ${baseCountry}’s most careful books. Signs value, sells high, and never gets into a bidding war it can lose.`;

  return {
    posture,
    baseCountry,
    matchmakingStyle,
    matchmakingAggression,
    narrativeControl,
    sponsorshipPolicy,
    activityGuarantee,
    notes,
  };
}

// --- Counter-programming -----------------------------------------------------------------------

/** How much of the gate a card loses to a rival's card against it, at the least and the most. */
export const COUNTER_SPLIT_MIN = 0.2;
export const COUNTER_SPLIT_MAX = 0.35;

/**
 * The chance a rival books against a card it has heard about. Only a promotion in the same market
 * can split its audience; an aggressor does it on purpose, a moneyball outfit when it is cheap to,
 * a developer almost never. And only against a peer: the biggest promotion in the sport does not
 * go to war with a regional show, and a regional show does not pick that fight with it either —
 * the chance falls away as the two drift apart in standing, gone at three times the other's size.
 */
export function counterProgrammingChance(
  rival: Promotion & { posture?: PromotionPosture },
  target: Pick<Promotion, 'prestige'>,
  market: string,
): number {
  if (rival.baseCountry !== market) return 0;
  if (rival.tier === 'developmental') return 0;
  const base = { aggressor: 0.45, moneyball: 0.1, developer: 0.02 }[postureOf(rival)];
  const gap = Math.abs(Math.log(Math.max(1, rival.prestige) / Math.max(1, target.prestige)));
  const peers = clamp01(1 - gap / Math.log(3));
  return clamp01(base * peers);
}

/** The share of the gate a rival's card takes, 20–35%, larger the bigger the rival is. */
export function counterSplit(
  rival: Pick<Promotion, 'prestige'>,
  target: Pick<Promotion, 'prestige'>,
  rng: Rng,
): number {
  const weight = rival.prestige / Math.max(1, rival.prestige + target.prestige);
  const split = COUNTER_SPLIT_MIN + (COUNTER_SPLIT_MAX - COUNTER_SPLIT_MIN) * weight;
  return (
    Math.round(clamp(split + rng.range(-0.02, 0.02), COUNTER_SPLIT_MIN, COUNTER_SPLIT_MAX) * 100) /
    100
  );
}

/** A night's revenue after a rival took `split` of its walk-up crowd. */
export function afterCounterProgramming(revenue: EventRevenue, split: number): EventRevenue {
  const lostGate = Math.round(revenue.gate * split);
  return {
    ...revenue,
    gate: revenue.gate - lostGate,
    attendance: Math.round(revenue.attendance * (1 - split)),
    profit: revenue.profit - lostGate,
  };
}

// --- Bids on another promotion's fighters ------------------------------------------------------

/**
 * Whether this rival wants this fighter, by posture. An aggressor wants names; a developer wants
 * the young and improving; a moneyball outfit wants ability the market is not yet paying for.
 */
export function bidInterest(
  rival: Promotion & { posture?: PromotionPosture },
  fighter: Pick<Fighter, 'starPower' | 'reputation'>,
  read: { age: number; overall: number; ranked: boolean; champion: boolean },
): number {
  switch (postureOf(rival)) {
    case 'aggressor':
      return clamp01((fighter.starPower - 30) / 40) * (read.champion ? 1.3 : 1);
    case 'developer':
      return read.age <= 26 ? clamp01((read.overall - 40) / 25) : 0;
    case 'moneyball':
      // Good, and not yet priced like it: ability ahead of reputation.
      return clamp01((read.overall - fighter.reputation - 5) / 20) * (read.ranked ? 1.2 : 1);
  }
}

/** What a rival's bid looks like, from the terms the market would offer: shaped by posture. */
export function bidTerms(
  rival: Promotion & { posture?: PromotionPosture },
  market: OfferTerms,
): OfferTerms {
  switch (postureOf(rival)) {
    case 'aggressor':
      return {
        ...market,
        showPurse: round1(market.showPurse * 1.2),
        winBonus: round1(market.winBonus * 1.2),
        signingBonus: round1(Math.max(market.signingBonus, market.showPurse * 0.5)),
      };
    case 'developer':
      return { ...market, fightsOwed: Math.max(market.fightsOwed, 5) };
    case 'moneyball':
      return {
        ...market,
        showPurse: round1(market.showPurse * 0.95),
        winBonus: round1(market.winBonus * 1.15),
      };
  }
}

/** How many rivals at most bid on one fighter. */
export const MAX_BIDS = 3;

// --- Poaching champions ------------------------------------------------------------------------

export interface PoachOffer {
  /** Thousands, paid to the incumbent to release the champion. */
  releaseFee: number;
  /** What the poacher pays the champion. */
  terms: OfferTerms;
}

/**
 * The chance, this quarter, that a rival makes a release-clause offer for another promotion's
 * champion. Aggressors only, with the money to do it, and only for somebody worth the fight.
 */
export function poachChance(
  rival: Promotion & { posture?: PromotionPosture },
  champion: Pick<Fighter, 'starPower'>,
  fee: number,
): number {
  if (postureOf(rival) !== 'aggressor') return 0;
  if (fee > rival.budget * 0.25) return 0;
  return clamp01(POACH_PER_QUARTER * clamp01((champion.starPower - 25) / 45));
}

/** Calibrated against the poaching guardrail in `tests/long-sim/rivals.test.ts`. */
const POACH_PER_QUARTER = 0.06;

/**
 * The offer: a release fee the incumbent could not refuse lightly — a multiple of what the
 * champion is worth to them — and better terms for the champion than they are on.
 */
export function poachOffer(input: {
  marketValue: number;
  current: Pick<OfferTerms, 'showPurse' | 'winBonus'>;
  market: OfferTerms;
}): PoachOffer {
  const releaseFee = round1(Math.max(input.marketValue * 4, input.current.showPurse * 6));
  return {
    releaseFee,
    terms: {
      ...input.market,
      showPurse: round1(Math.max(input.market.showPurse, input.current.showPurse * 1.3)),
      winBonus: round1(Math.max(input.market.winBonus, input.current.winBonus * 1.3)),
      championshipExtension: 'standard',
    },
  };
}

/** Whether the champion wants to go, given the money: loyalty keeps them, ambition and money move them. */
export function championWantsToGo(
  champion: Pick<Fighter, 'personality' | 'resentment'>,
  raise: number,
  rng: Rng,
): boolean {
  const p = champion.personality;
  const pull = clamp01(0.25 + raise * 0.6 + champion.resentment / 200 + (60 - p.loyalty) / 150);
  return rng.chance(pull);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
