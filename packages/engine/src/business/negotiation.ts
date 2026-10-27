/**
 * Negotiating a contract, with the fighter's side of the table. Doc 34 C4.
 *
 * Every piece of a promotional deal already existed — `OfferTerms`, the championship clause,
 * matching rights, revenue points, `TERM_PRICING`, the manager's `negotiationMultiplier`, the
 * fighter's `askingPrice` — and promoter mode reached none of them: "Offer a deal" signed a free
 * agent on hard-coded terms the moment it was pressed. This is the table those pieces sit at.
 *
 * The shape is deliberately small. An offer is read against what the fighter (and whoever
 * represents them) will take; the read is a meter, never a number; and a fighter who is close says
 * what would close it — once, maybe twice, depending on who they are — before the talking stops.
 * What they will take is personal: their manager, their loyalty, how ambitious they are about the
 * length of the deal, how broke they are, and what they remember about this promotion.
 *
 * Pure. The caller owns the state (`Negotiation`) and where it is stored, if anywhere.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { Fighter } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';
import { reSignDiscount } from '../domain/personality.js';
import { relationshipWith } from '../domain/relationship.js';
import { voiceFor } from '../domain/voice.js';
import { MAX_FIGHTS_OWED, TERM_PRICING, type OfferTerms } from './contracts.js';
import { negotiationMultiplier, type Manager } from './managers.js';
import { askingPrice, defaultTerms } from './money.js';

// --- What they want out of a deal ------------------------------------------------------------

/**
 * How long a deal this fighter wants.
 *
 * The ambitious want short deals, because a short deal is a free agency sooner; the loyal will
 * sign long, because they were not planning to leave.
 */
export function preferredFights(fighter: Pick<Fighter, 'personality'>): number {
  const p = fighter.personality;
  if (p.ambition >= 65) return 3;
  if (p.loyalty >= 65) return 5;
  return 4;
}

/**
 * What a deal is worth to the fighter, in the same thousands as a purse.
 *
 * Every term is priced, per `TERM_PRICING`: the length away from what they want, matching rights
 * and the championship clause cost them; a signing bonus is spread over the fights; revenue
 * points are worth more the more they sell.
 */
export function termsValue(
  fighter: Pick<Fighter, 'personality' | 'starPower'>,
  terms: OfferTerms,
): number {
  const fights = clamp(Math.round(terms.fightsOwed), 1, MAX_FIGHTS_OWED);
  const purse = terms.showPurse + terms.winBonus * 0.6;
  const lengthCost = Math.abs(fights - preferredFights(fighter)) * TERM_PRICING.perExtraFight;
  const clauseCost =
    (terms.championshipExtension === 'standard' ? TERM_PRICING.extensionBuyout : 0) +
    (terms.matchingRights ? TERM_PRICING.matchingRights : 0) +
    (terms.exclusive ? 0 : -terms.outsideBouts * TERM_PRICING.perOutsideBout);
  const bonus = terms.signingBonus / fights;
  const points = terms.revenuePoints * (0.5 + fighter.starPower / 25);
  return purse * (1 - lengthCost - clauseCost) + bonus + points;
}

export interface TableContext {
  fighter: Fighter;
  promotion: Promotion;
  manager?: Manager;
  day: GameDay;
  /** True when this is the promotion they are already with — a re-sign. */
  incumbent?: boolean;
}

/**
 * What it takes, in `termsValue` terms.
 *
 * The asking price, through the manager (a good one gets more), the loyalty discount on a
 * re-sign, the bank (a fighter in the red takes less), and the ledger — a fighter who remembers
 * being skipped for a shot wants paying for it, one who was looked after gives a little back.
 */
export function reservation(ctx: TableContext): number {
  const { fighter, promotion, manager, day, incumbent = false } = ctx;
  const ask = askingPrice(fighter, promotion, {
    isIncumbent: incumbent,
    reSignDiscount: reSignDiscount(fighter.personality),
  });
  const agent = negotiationMultiplier(manager) / 0.85;
  const broke = fighter.bank < 0 ? 0.9 : 1;
  const memory = 1 - relationshipWith(fighter, promotion.id, day).score / 400;
  // The asking price as a standard deal of the length they like, split the way the market splits.
  const going = defaultTerms(fighter, promotion);
  const scale = ask / Math.max(0.1, going.showPurse + going.winBonus);
  const asked: OfferTerms = {
    ...STANDARD,
    showPurse: going.showPurse * scale,
    winBonus: going.winBonus * scale,
    fightsOwed: preferredFights(fighter),
  };
  return termsValue(fighter, asked) * agent * broke * memory;
}

const STANDARD: OfferTerms = {
  showPurse: 0,
  winBonus: 0,
  signingBonus: 0,
  revenuePoints: 0,
  fightsOwed: 4,
  championshipExtension: 'standard',
  matchingRights: false,
  exclusive: true,
  outsideBouts: 0,
};

const defaultTermsFor = (fighter: Fighter, promotion: Promotion) => {
  const t = defaultTerms(fighter, promotion);
  return { showPurse: t.showPurse, winBonus: t.winBonus };
};

/** A sensible opening offer: the going rate, on a standard deal of the length they like. */
export function openingTerms(fighter: Fighter, promotion: Promotion): OfferTerms {
  return {
    ...STANDARD,
    ...defaultTermsFor(fighter, promotion),
    fightsOwed: preferredFights(fighter),
  };
}

// --- The meter -------------------------------------------------------------------------------

export interface TermsRead {
  /** 0–1. For a bar; the screen says a sentence, never a percentage. */
  chance: number;
  label: string;
  /** The biggest thing between this offer and a yes. */
  concern?: string;
}

export function readTerms(ctx: TableContext, terms: OfferTerms): TermsRead {
  const ratio = termsValue(ctx.fighter, terms) / Math.max(0.1, reservation(ctx));
  const chance = clamp01((ratio - 0.8) / 0.25);
  const label =
    chance >= 0.9
      ? 'They will sign this'
      : chance >= 0.6
        ? 'Close'
        : chance >= 0.25
          ? 'Some way apart'
          : 'Not worth their time';
  const want = preferredFights(ctx.fighter);
  const concern =
    chance >= 0.9
      ? undefined
      : terms.fightsOwed > want + 1
        ? `Too long — they want ${want} fights, not ${terms.fightsOwed}`
        : terms.championshipExtension === 'standard' && ctx.fighter.personality.ambition >= 65
          ? 'They will not be held by the belt clause'
          : 'The money is short of what they are worth';
  return { chance, label, concern };
}

// --- The talking -----------------------------------------------------------------------------

export type NegotiationState = 'open' | 'countered' | 'agreed' | 'walked';

export interface Negotiation {
  fighterId: Fighter['id'];
  promotionId: Promotion['id'];
  state: NegotiationState;
  /** How many counters they have made. They make one or two, by temperament. */
  counters: number;
  /** Their last counter, when they have made one. Accepting it closes the deal. */
  ask?: OfferTerms;
  /** In their own words. */
  quote?: string;
  /** The terms that were agreed, when `state` is `agreed`. */
  agreed?: OfferTerms;
}

/** How many times this fighter comes back with a number before they stop talking. */
export function counterLimit(fighter: Pick<Fighter, 'personality'>): number {
  const p = fighter.personality;
  return p.ego >= 65 || p.professionalism < 35 ? 1 : 2;
}

/**
 * The counter a fighter makes to an offer they will not take as it stands.
 *
 * Shaped by who they are: everyone wants the money up to what they are worth; the ambitious also
 * want the deal short and the belt clause gone; the money-minded want a signing bonus; a fighter
 * who sells and knows it asks for points where the promotion can grant them.
 */
export function counterTerms(ctx: TableContext, offer: OfferTerms): OfferTerms {
  const { fighter, promotion } = ctx;
  const p = fighter.personality;
  const out: OfferTerms = { ...offer, fightsOwed: preferredFights(fighter) };
  if (p.ambition >= 65) out.championshipExtension = 'none';
  if (fighter.starPower >= 55 && promotion.revenueShareCapable && p.ego >= 55) {
    out.revenuePoints = Math.max(out.revenuePoints, 1);
  }
  // Whatever is left of the gap goes on the purse, keeping the split the offer chose.
  const gap = reservation(ctx) * 1.04 - termsValue(fighter, out);
  if (gap > 0) {
    const purse = out.showPurse + out.winBonus * 0.6;
    const scale = 1 + gap / Math.max(0.1, purse);
    out.showPurse = round1(out.showPurse * scale);
    out.winBonus = round1(out.winBonus * scale);
  }
  if (p.loyalty < 40) out.signingBonus = Math.max(out.signingBonus, round1(out.showPurse * 0.5));
  return out;
}

/**
 * Put an offer on the table and hear the answer.
 *
 * A clear yes closes it. A clear no, or one counter too many, ends it — they walk, and will not
 * talk again at that table soon (the caller decides how soon). Anything between gets a counter,
 * which the player can accept outright with `takeCounter`.
 */
export function makeOffer(
  ctx: TableContext,
  current: Negotiation | undefined,
  offer: OfferTerms,
): Negotiation {
  const base: Negotiation = current ?? {
    fighterId: ctx.fighter.id,
    promotionId: ctx.promotion.id,
    state: 'open',
    counters: 0,
  };
  const read = readTerms(ctx, offer);
  if (read.chance >= 0.9)
    return { ...base, state: 'agreed', agreed: offer, ask: undefined, quote: undefined };

  if (read.chance < 0.25 || base.counters >= counterLimit(ctx.fighter)) {
    return {
      ...base,
      state: 'walked',
      ask: undefined,
      quote: voiceFor(ctx.fighter, 'refusesPay', ctx.day).text,
    };
  }
  return {
    ...base,
    state: 'countered',
    counters: base.counters + 1,
    ask: counterTerms(ctx, offer),
    quote: voiceFor(ctx.fighter, 'wantsMoney', ctx.day + base.counters).text,
  };
}

/** Take their counter as it stands. */
export function takeCounter(current: Negotiation): Negotiation {
  if (current.state !== 'countered' || !current.ask) return current;
  return { ...current, state: 'agreed', agreed: current.ask };
}

// --- Holding out -----------------------------------------------------------------------------

/**
 * Whether a fighter is refusing to fight until the deal is redone.
 *
 * The grievance chain's last link: `contractFairness` feeds `resentment`, and past a point a
 * proud or ambitious fighter stops taking bouts at all. Fixed by renegotiating — a new deal resets
 * the resentment — and by nothing else.
 */
export function isHoldingOut(fighter: Pick<Fighter, 'resentment' | 'personality'>): boolean {
  return (
    fighter.resentment >= 65 &&
    (fighter.personality.ego >= 50 || fighter.personality.ambition >= 60)
  );
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
