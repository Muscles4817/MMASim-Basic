/**
 * Money.
 *
 * See docs/17-money.md. The short version of why this module exists: `purseFor()` used to
 * live in `heat.ts`, was called in exactly two places, and both of them printed a number on
 * a screen. Nothing accumulated it and nothing spent it — so every contract term in doc 16
 * negotiated the allocation of a figure that never left the display, and the most-cited
 * economic fact about the sport (that a fighter on £12k/£12k nets a few thousand for three
 * months' work) was not expressible at all.
 *
 * The rule that keeps this honest: **money must have a sink, and the sink is camp quality.**
 * Money buys better rooms; better rooms buy attributes; attributes are the whole game. Every
 * figure in this file eventually resolves to that.
 *
 * Everything is in **thousands**, everywhere, without exception. Two functions in different
 * units of the same currency is a bug waiting to be found by whoever builds promoter mode.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { Fighter } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';
import type { Personality } from '../domain/personality.js';
import { traitMul } from '../domain/traits.js';

// --- What a fighter is worth ------------------------------------------------------------------

/**
 * Superlinearity of the star term.
 *
 * MMA pay is a power law, not a ramp. The old model was linear — `remap(starPower, 1, 100,
 * 4, 250)` — which gave 62:1 from bottom to top in a straight line and made it literally
 * impossible to express a fighter who earns twenty times what the champion earns, which is a
 * thing that happens.
 */
const STAR_EXPONENT = 2.6;
const STAR_CEILING = 700;

/**
 * Superlinearity of the promotion tier.
 *
 * `prestige / 100` gave a 4.3× spread between a developmental show and the global promotion
 * for the *same fighter* — while the seed file it reads from gives those promotions budgets
 * of 900 and 42,000, a 47:1 spread. A pay model that contradicts its own promotion table is
 * an oversight rather than a decision. 2.2 gives 25:1, and that gap is the MONEY axis of doc
 * 16's triangle: it is what makes taking the smaller cheque at the bigger promotion hurt.
 */
const TIER_EXPONENT = 2.2;

/**
 * What a fighter is **worth** to a promotion for one bout, in thousands. Show plus win.
 *
 * Deliberately carries no demand modifier and no title modifier.
 *
 * `purseDemand` is what a fighter *asks*, not what they are *worth*. A `Mercenary` (×1.35) is
 * not worth 35% more than an identical fighter; he holds out for more. Baking it in here
 * would make every Mercenary permanently "underpaid" and every `Company Man` permanently
 * "overpaid" by construction — through the exact ratio that drives resentment, relationship
 * and willingness to re-sign. It belongs in the negotiation, and that is where it now lives.
 *
 * A title is a property of a *bout*, not of a person, so it is not here either. The old ×1.5
 * title factor was quietly cancelling the grievance doc 08 says the pay model exists to
 * produce: run the seed roster's deliberately-constructed pair and the mediocre draw earned
 * 233 against the excellent champion's 249. The champion out-earned him. With the title
 * factor moved out to card position and revenue points, it is 410 against 142.
 */
export function marketValue(fighter: Fighter, promotion: Promotion): number {
  const star = 3 + STAR_CEILING * Math.pow(clamp01(fighter.starPower / 100), STAR_EXPONENT);
  // Merit stays near-linear and deliberately small: being respected is worth about a tenth of
  // being famous, which is the sport's least comfortable truth and the reason doc 08 works.
  const merit = 2 + 55 * clamp01(fighter.reputation / 100);
  const tier = Math.pow(clamp01(promotion.prestige / 100), TIER_EXPONENT);

  return round1((star + merit) * tier);
}

/** Where a bout sits on the card, and what that multiplies the purse by. See doc 12. */
export type CardPosition = 'mainEvent' | 'coMain' | 'mainCard' | 'prelim';

export const CARD_POSITION_PURSE: Readonly<Record<CardPosition, number>> = {
  mainEvent: 2.5,
  coMain: 1.6,
  mainCard: 1.0,
  prelim: 0.5,
};

export interface Purse {
  /** Paid win or lose. */
  show: number;
  /** Paid only on a win. */
  win: number;
  /** show + win. What the headline number would be. */
  total: number;
}

export interface PurseTerms {
  /** Contracted show purse at main-card position, in thousands. */
  showPurse: number;
  /** Contracted win bonus at main-card position, in thousands. */
  winBonus: number;
}

/**
 * What a fighter is actually **paid** for one bout.
 *
 * The floor applies last, after the card-position multiplier — otherwise an Apex prelim
 * debutant lands below the minimum the promotion publicly advertises, which is a thing no
 * promotion does.
 */
export function purseFor(
  terms: PurseTerms,
  promotion: Promotion,
  position: CardPosition = 'mainCard',
): Purse {
  const mul = CARD_POSITION_PURSE[position];
  let show = terms.showPurse * mul;
  let win = terms.winBonus * mul;

  const floor = promotion.minimumPurse ?? 0;
  const total = show + win;
  if (total > 0 && total < floor) {
    // Raise to the floor while keeping the negotiated split, so a fighter who traded show
    // for win does not silently have that trade undone by the minimum.
    const scale = floor / total;
    show *= scale;
    win *= scale;
  } else if (total === 0) {
    show = floor / 2;
    win = floor / 2;
  }

  return { show: round1(show), win: round1(win), total: round1(show + win) };
}

/**
 * Default terms for a fighter with no contract, so the rest of the game keeps working.
 *
 * 50/50 is the historic convention, drifting show-heavy at the top because a genuine star
 * does not accept half their money contingent on the judges.
 */
export function defaultTerms(fighter: Fighter, promotion: Promotion): PurseTerms {
  const value = marketValue(fighter, promotion);
  const showShare = clamp(0.5 + (fighter.starPower / 100) * 0.25, 0.5, 0.8);
  return { showPurse: round1(value * showShare), winBonus: round1(value * (1 - showShare)) };
}

/**
 * What a fighter asks for, against what they are worth.
 *
 * This is where `purseDemand` belongs — and where `reSignDiscount()` finally gets a caller,
 * having sat in `personality.ts` since the domain was written with nothing reading it.
 */
export function askingPrice(
  fighter: Fighter,
  promotion: Promotion,
  options: { isIncumbent?: boolean; reSignDiscount?: number } = {},
): number {
  const base = marketValue(fighter, promotion) * traitMul(fighter.traits, 'purseDemand');
  // A loyal fighter takes less to stay; a mercenary charges a premium for the privilege.
  const loyalty = options.isIncumbent ? 1 - (options.reSignDiscount ?? 0) : 1;
  return round1(base * loyalty);
}

// --- Gross is not net -------------------------------------------------------------------------

/**
 * Deduction rates.
 *
 * Every one of these is a percentage *except camp*, and that exception is the load-bearing
 * part of the whole document: percentages cannot bankrupt you, because they shrink when the
 * purse shrinks. Camp does not. It is paid before the fight, in full, win or lose — which is
 * what turns doc 16's show-versus-win-bonus choice from an expected-value calculation into a
 * solvency decision.
 */
export const MANAGER_RATE_DEFAULT = 0.1;
export const CORNER_RATE = 0.1;
export const ADMIN_RATE = 0.04;
export const ADMIN_FLOOR = 0.5;
export const TAX_RATE = 0.3;

export interface NetPurseInput {
  /** Gross actually earned this bout — show, plus win if they won, plus bonuses. */
  gross: number;
  /** Camp cost already committed for this fight. Fixed, and paid either way. */
  campCost: number;
  /** Manager's contracted share of purse, 0.08–0.15. Zero if self-managed. */
  managerRate?: number;
  /** Living costs across the camp. */
  livingCost?: number;
}

export interface NetPurse {
  gross: number;
  manager: number;
  corner: number;
  camp: number;
  admin: number;
  tax: number;
  living: number;
  /** What actually reaches the bank. Frequently negative, which is the point. */
  net: number;
}

/** Break a bout's earnings down into what a fighter actually keeps. */
export function netPurse(input: NetPurseInput): NetPurse {
  const gross = Math.max(0, input.gross);
  const manager = gross * (input.managerRate ?? MANAGER_RATE_DEFAULT);
  const corner = gross * CORNER_RATE;
  const camp = Math.max(0, input.campCost);
  const admin = Math.max(ADMIN_FLOOR, gross * ADMIN_RATE);
  const living = Math.max(0, input.livingCost ?? 0);

  // Tax is on the purse less the costs of earning it. Self-employment, one line.
  const taxable = Math.max(0, gross - manager - corner - camp - admin);
  const tax = taxable * TAX_RATE;

  return {
    gross: round1(gross),
    manager: round1(manager),
    corner: round1(corner),
    camp: round1(camp),
    admin: round1(admin),
    tax: round1(tax),
    living: round1(living),
    net: round1(gross - manager - corner - camp - admin - tax - living),
  };
}

/**
 * Monthly living cost.
 *
 * You live like the fighter people think you are, which is why star power drives this and
 * ability does not. A `Party Animal` lives like a bigger one than that.
 */
export function livingCostPerMonth(fighter: Fighter): number {
  const base = 1.5 + 2.5 * clamp01(fighter.starPower / 100);
  return round1(base * traitMul(fighter.traits, 'livingCost'));
}

// --- The sink ---------------------------------------------------------------------------------

/**
 * What a camp costs per week at a given room.
 *
 * Superlinear in quality on purpose: the best rooms must be *out of reach* rather than merely
 * expensive, or the money has no teeth. A created fighter starts at The Basement — quality 44,
 * no head coach — signed to a promotion paying around £1k a bout. Getting to Summit is a
 * project, and it should take years.
 */
export function campWeeklyRate(gymQuality: number): number {
  return round2(0.15 + 2.2 * Math.pow(clamp01(gymQuality / 100), 2.5));
}

export function campCost(weeks: number, gymQuality: number): number {
  return round1(Math.max(0, weeks) * campWeeklyRate(gymQuality));
}

/**
 * Purchasable one-shots, bought per camp.
 *
 * This table sat here with no callers and no effects — a price list for things that did not
 * happen. It is worth having rather than deleting because it is the only place the player
 * spends money on anything other than a gym, and a career where money can only be earned and
 * never *used* is a scoreboard rather than a resource.
 *
 * Each one deliberately plugs into a system that already exists rather than adding a new
 * mechanic, and each targets a different failure the player can actually feel: a camp that
 * did not develop them, a read that turned out wrong, a fighter who arrived already worn, a
 * game plan that was not drilled enough, a weight cut that emptied them.
 *
 * Priced against a camp rather than against a purse. The full set costs 58, which is more
 * than a mid-tier eight-week camp — so buying everything every time is not affordable at the
 * bottom of the sport, which is exactly where they would help most. That is the intended
 * pressure and it is the same one doc 17 builds the whole money layer around.
 */
export const PURCHASES = {
  specialistCoach: {
    cost: 25,
    label: 'Specialist coach for this camp',
    effect: 'A better room for eight weeks. Raises what the camp develops.',
  },
  scoutingReport: {
    cost: 8,
    label: 'Full scouting report',
    effect: 'Somebody watches all their tape. Your reads are far more likely to be right.',
  },
  recoveryBlock: {
    cost: 15,
    label: 'Recovery block',
    effect: 'Physios, soft tissue work, time. You arrive fresher than you should be.',
  },
  sparringPartner: {
    cost: 6,
    label: 'Imported sparring partner',
    effect: 'Somebody who actually moves like them. Your drilled answers hold up better.',
  },
  nutritionist: {
    cost: 4,
    label: 'Nutritionist for the cut',
    effect: 'The cheapest thing on this list and the one most fighters skip. Softens the cut.',
  },
} as const;

export type PurchaseKey = keyof typeof PURCHASES;

export const PURCHASE_KEYS = Object.keys(PURCHASES) as readonly PurchaseKey[];

/** What a set of purchases costs, in thousands. */
export function purchaseCost(bought: readonly PurchaseKey[]): number {
  return round1(bought.reduce((total, key) => total + PURCHASES[key].cost, 0));
}

/**
 * What the purchases actually do, as multipliers on things the camp already computes.
 *
 * Returned as one object rather than applied piecemeal so there is a single place to read
 * what money buys — and so the camp screen can show the player the effect before they commit
 * rather than after, which is the difference between a decision and a slot machine.
 *
 * The magnitudes are deliberately modest. Every one of these multiplies something that is
 * already the product of gym, coach, discipline and weeks, so a large coefficient here turns
 * "did you buy the thing" into the dominant term and makes the four systems underneath it
 * decorative.
 */
export interface CampPurchaseEffects {
  /** Multiplier on camp quality, which drives development. */
  campQuality: number;
  /** Multiplier on drill quality, which drives how well a prepped read holds up. */
  drillQuality: number;
  /** Multiplier on scouting confidence — how likely a read is to be correct. */
  scoutingAccuracy: number;
  /** Multiplier on fatigue and wear carried into the fight. Below 1 is fresher. */
  wear: number;
  /** Multiplier on the weight-cut penalty. Below 1 is a softer cut. */
  cutPenalty: number;
}

export function campPurchaseEffects(bought: readonly PurchaseKey[]): CampPurchaseEffects {
  const has = (key: PurchaseKey) => bought.includes(key);
  return {
    campQuality: has('specialistCoach') ? 1.18 : 1,
    drillQuality: has('sparringPartner') ? 1.15 : 1,
    scoutingAccuracy: has('scoutingReport') ? 1.35 : 1,
    wear: has('recoveryBlock') ? 0.78 : 1,
    cutPenalty: has('nutritionist') ? 0.7 : 1,
  };
}

// --- Sponsorship ------------------------------------------------------------------------------

export type SponsorshipPolicy = 'open' | 'uniform';

/**
 * Uniform-policy payment tiers, in thousands per bout, by number of bouts with the promotion.
 *
 * A single uniform deal abolishing individual sponsors repriced an entire roster overnight
 * and cut real income for most of it. Doc 15 rejected modelling the *detail* of outfitting,
 * correctly; it rejected the *event*, which was wrong. This is the event, in one table.
 */
const UNIFORM_TIERS: readonly (readonly [bouts: number, pay: number])[] = [
  [3, 2.5],
  [5, 5],
  [10, 10],
  [15, 16],
  [20, 21],
  [Infinity, 26],
];

const UNIFORM_CHAMPION_PAY = 40;

export function sponsorshipIncome(
  fighter: Fighter,
  promotion: Promotion,
  options: { boutsWithPromotion: number; isChampion?: boolean; inHomeCountry?: boolean } = {
    boutsWithPromotion: 0,
  },
): number {
  if ((promotion.sponsorshipPolicy ?? 'open') === 'uniform') {
    if (options.isChampion) return UNIFORM_CHAMPION_PAY;
    const tier = UNIFORM_TIERS.find(([bouts]) => options.boutsWithPromotion < bouts);
    return tier ? tier[1] : UNIFORM_TIERS[UNIFORM_TIERS.length - 1]![1];
  }

  // Open policy: your own sponsors, scaling with how marketable you are, and worth markedly
  // more at home where the brands actually know who you are.
  const base = 0.5 + 60 * Math.pow(clamp01(fighter.starPower / 100), 1.6);
  return round1(base * (options.inHomeCountry ? 1.8 : 1));
}

/** Purse forfeited to the opponent for missing weight. Doc 07 warned; nothing happened. */
export const WEIGHT_MISS_FORFEIT = 0.2;
export const WEIGHT_MISS_FORFEIT_EGREGIOUS = 0.3;

export function weightMissForfeit(showPurse: number, egregious = false): number {
  return round1(showPurse * (egregious ? WEIGHT_MISS_FORFEIT_EGREGIOUS : WEIGHT_MISS_FORFEIT));
}

// --- Solvency ---------------------------------------------------------------------------------

export type Solvency = 'comfortable' | 'tight' | 'broke' | 'desperate';

/**
 * How the bank changes what a fighter is willing to do.
 *
 * Nothing here blocks anything. Everything gets slightly worse and the player can watch it
 * happening — because being broke is how a fighter ends up taking the fight that ruins them,
 * and that is a pressure rather than a prohibition.
 */
export function solvency(bank: number, nextCampCost: number): Solvency {
  if (bank < -20) return 'desperate';
  if (bank < 0) return 'broke';
  if (bank < nextCampCost) return 'tight';
  return 'comfortable';
}

/** How much a fighter's reservation price drops when they need the money. */
export function desperationDiscount(state: Solvency): number {
  return state === 'desperate' ? 0.4 : state === 'broke' ? 0.25 : state === 'tight' ? 0.1 : 0;
}

/** How much more willing they are to take a fight on short notice. */
export function shortNoticeBonus(state: Solvency): number {
  return state === 'desperate' ? 0.45 : state === 'broke' ? 0.3 : state === 'tight' ? 0.12 : 0;
}

export function describeSolvency(state: Solvency): string {
  switch (state) {
    case 'comfortable':
      return 'You can fund the camp you want.';
    case 'tight':
      return 'You cannot afford the room you have been using. Something has to give.';
    case 'broke':
      return 'You are in the red. You will take fights you would otherwise turn down.';
    case 'desperate':
      return 'You need a payday, and everybody you deal with knows it.';
  }
}

/** Applied to `reSignDiscount` so a broke fighter re-signs cheap. Personality still leads. */
export const solvencyReSignPressure = (state: Solvency): number => desperationDiscount(state);

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Kept so the personality module's loyalty curve has an obvious home in the money layer. */
export type { Personality };
