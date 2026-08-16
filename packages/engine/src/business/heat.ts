/**
 * Heat, rivalries and money.
 *
 * Heat is **directional and per-pair**: how badly the audience wants to see *these two*
 * specifically. It is deliberately separate from either fighter's star power, because that
 * separation is what lets a heated fight between two mid-carders outdraw a title fight
 * nobody asked for — which is a real and frequent phenomenon the sport runs on.
 *
 * See docs/08-promotions-marketing-heat.md.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { GameDay } from '../core/clock.js';
import type { FighterId, RivalryId } from '../core/ids.js';
import { asId } from '../core/ids.js';
import type { Fighter } from '../domain/fighter.js';
import { rivalryIgnition, starPowerGrowthMultiplier } from '../domain/personality.js';
import { traitMul } from '../domain/traits.js';
import type { Promotion } from '../domain/organisations.js';
import { overallRating } from '../ratings/attributes.js';

/** A grudge between two specific fighters. Persists across promotions. */
export interface Rivalry {
  id: RivalryId;
  /** Sorted, so a pair has exactly one rivalry however it is looked up. */
  fighterIds: readonly [FighterId, FighterId];
  /** 0–100. How much the audience wants it. */
  heat: number;
  /** Day heat was last raised. Everything decays from here. */
  lastStokedDay: GameDay;
  /** True once it has crossed the threshold and become personal. */
  isRivalry: boolean;
  /** Human-readable history, newest last. Shown on the fight build-up. */
  beats: readonly string[];
}

export const pairKey = (a: FighterId, b: FighterId): [FighterId, FighterId] =>
  ((a as string) < (b as string) ? [a, b] : [b, a]) as [FighterId, FighterId];

export function rivalryId(a: FighterId, b: FighterId): RivalryId {
  const [x, y] = pairKey(a, b);
  return asId<RivalryId>(`riv_${x}_${y}`);
}

export function emptyRivalry(a: FighterId, b: FighterId, day: GameDay): Rivalry {
  return {
    id: rivalryId(a, b),
    fighterIds: pairKey(a, b),
    heat: 0,
    lastStokedDay: day,
    isRivalry: false,
    beats: [],
  };
}

/** Heat above which a pairing stops being a fight and becomes a grudge. */
export const RIVALRY_THRESHOLD = 55;

/** Ignition score below which a fighter never takes it personally, at any amount of heat. */
export const IGNITION_FLOOR = 0.15;

/** Heat decays toward zero at roughly this much per month with nothing stoking it. */
const HEAT_DECAY_PER_MONTH = 6;

/**
 * The share of its peak a confirmed rivalry never gives back.
 *
 * Interest cools to nothing — a fight nobody talked about is forgotten inside a year. A
 * grudge does not: three years on it still sells the rematch, which is the entire reason
 * `isRivalry` is a separate flag rather than just "a lot of heat".
 */
const RIVALRY_RESIDUAL = 0.4;

/** Heat as it stands today, after decay. Never mutates the stored value. */
export function currentHeat(rivalry: Rivalry, day: GameDay): number {
  const months = Math.max(0, (day - rivalry.lastStokedDay) / 30);
  // A confirmed rivalry decays far more slowly, and only ever down to its residual.
  const rate = rivalry.isRivalry ? HEAT_DECAY_PER_MONTH * 0.35 : HEAT_DECAY_PER_MONTH;
  const floor = rivalry.isRivalry ? rivalry.heat * RIVALRY_RESIDUAL : 0;
  return clamp(rivalry.heat - months * rate, floor, 100);
}

export type HeatSource =
  | 'trashTalk'
  | 'previousFight'
  | 'controversialFinish'
  | 'refusedFight'
  | 'styleClash'
  | 'titleStakes'
  | 'callout';

const HEAT_VALUE: Readonly<Record<HeatSource, number>> = {
  // The single biggest lever, and the one a fighter's personality controls.
  trashTalk: 16,
  previousFight: 20,
  // A robbery or a controversial stoppage is the best build-up money cannot buy.
  controversialFinish: 26,
  refusedFight: 12,
  styleClash: 6,
  titleStakes: 10,
  callout: 14,
};

export interface StokeInput {
  rivalry: Rivalry;
  source: HeatSource;
  day: GameDay;
  /** The fighter generating the heat, when one of them is responsible. */
  instigator?: Fighter;
  beat?: string;
  rng: Rng;
}

/**
 * Raise the heat on a pairing.
 *
 * The instigator's personality and traits scale it: a `Trash Talker` with Charisma 90
 * generates roughly twice what a quiet fighter does from the same act, which is exactly why
 * the trait is worth carrying despite what it does to promotion relationships.
 */
export function stokeHeat(input: StokeInput): Rivalry {
  const { rivalry, source, day, instigator, rng } = input;

  const base = HEAT_VALUE[source];
  const personality = instigator
    ? starPowerGrowthMultiplier(instigator.personality) *
      traitMul(instigator.traits, 'heatGeneration')
    : 1;

  const gained = base * personality * rng.range(0.8, 1.25);
  const heat = clamp(currentHeat(rivalry, day) + gained, 0, 100);

  const beats = input.beat ? [...rivalry.beats, input.beat] : rivalry.beats;

  // Ignition: heat alone is not enough. The fighter has to be the sort of person who takes
  // it personally, or it stays a fight the audience wants rather than a grudge.
  let isRivalry = rivalry.isRivalry;
  if (!isRivalry && heat >= RIVALRY_THRESHOLD && instigator) {
    const ignition = rivalryIgnition(instigator.personality);
    // A hard gate rather than a small chance, because a low chance rolled every week is
    // just a slow certainty — and a genuinely placid fighter should *never* end up in a
    // grudge, however loudly the other man shouts. Some people simply are not that guy.
    if (ignition >= IGNITION_FLOOR) {
      // Heat well past the threshold ignites more readily than heat that has just crossed it.
      const pressure = clamp01((heat - RIVALRY_THRESHOLD) / (100 - RIVALRY_THRESHOLD));
      isRivalry = rng.chance(ignition * (0.35 + 0.65 * pressure));
    }
  }

  return { ...rivalry, heat, lastStokedDay: day, isRivalry, beats };
}

/**
 * Heat generated automatically by a fight having happened.
 *
 * A close, controversial or brutal fight builds its own rematch. This is the mechanism by
 * which the world produces grudges without anybody having to script them.
 */
export function heatFromFight(options: {
  wasClose: boolean;
  wasControversial: boolean;
  wasTitleFight: boolean;
  finishWasBrutal: boolean;
}): HeatSource[] {
  const sources: HeatSource[] = ['previousFight'];
  if (options.wasControversial) sources.push('controversialFinish');
  if (options.wasTitleFight) sources.push('titleStakes');
  if (options.wasClose || options.finishWasBrutal) sources.push('callout');
  return sources;
}

// --- What heat does --------------------------------------------------------------------------

/**
 * How much a rivalry inflates what a fight is worth, as a multiplier on revenue.
 *
 * Deliberately large at the top end. A genuine grudge is the difference between a card that
 * breaks even and one that pays for the year.
 */
export function heatRevenueMultiplier(heat: number, isRivalry: boolean): number {
  return 1 + (heat / 100) * (isRivalry ? 1.4 : 0.7);
}

/**
 * In-fight effect of a grudge.
 *
 * Rivalry fights are more exciting *and* more costly: both fighters take more risks, which
 * raises finish rates and the damage they leave with. A rivalry that did not change how the
 * fight was fought would be flavour text, and flavour text does not ship.
 */
export function rivalryAggression(heat: number, isRivalry: boolean): number {
  if (!isRivalry) return 1;
  return 1 + (heat / 100) * 0.35;
}

/** How much harder a loss to a rival lands. */
export function rivalryLossMultiplier(isRivalry: boolean): number {
  return isRivalry ? 1.6 : 1;
}

// --- Money ------------------------------------------------------------------------------------

export interface BoutRevenueInput {
  promotion: Promotion;
  red: Fighter;
  blue: Fighter;
  heat: number;
  isRivalry: boolean;
  isTitleFight: boolean;
}

/**
 * What a single bout is worth to the promotion, in thousands.
 *
 * Star power dominates, quality contributes, and heat multiplies the whole thing. Note that
 * *competitiveness* is worth real money here: a coin-flip outdraws a mismatch of the same
 * names, which is the mechanism that stops "always book the safest fight" being correct.
 */
export function boutValue(input: BoutRevenueInput): number {
  const { promotion, red, blue, heat, isRivalry, isTitleFight } = input;

  const star = (red.starPower + blue.starPower) / 2;
  const quality = (overallRating(red.attributes) + overallRating(blue.attributes)) / 2;
  const gap = Math.abs(overallRating(red.attributes) - overallRating(blue.attributes));
  const competitiveness = clamp01(1 - gap / 25);

  const base =
    (star * 1.5 + quality * 0.5 + competitiveness * 25 + (isTitleFight ? 30 : 0)) *
    (promotion.prestige / 100);

  return Math.round(base * heatRevenueMultiplier(heat, isRivalry));
}

/**
 * What a fighter is owed, in thousands.
 *
 * Scales with star power far more than with reputation — which is the mechanism by which a
 * promotion ends up paying a mediocre draw more than an excellent champion, and then has to
 * explain it to the champion.
 */
export function purseFor(fighter: Fighter, promotion: Promotion, isTitleFight: boolean): number {
  const star = remap(fighter.starPower, 1, 100, 4, 250);
  const merit = remap(fighter.reputation, 1, 100, 2, 60);
  const tierFactor = promotion.prestige / 100;
  const titleFactor = isTitleFight ? 1.5 : 1;

  return Math.round(
    (star + merit) * tierFactor * titleFactor * traitMul(fighter.traits, 'purseDemand'),
  );
}

/** A short, plain-language reason the audience cares. Shown on the fight build-up. */
export function describeHeat(rivalry: Rivalry, day: GameDay): string {
  const heat = currentHeat(rivalry, day);
  if (rivalry.isRivalry) {
    return heat > 75
      ? 'This one is genuinely personal, and everybody knows it.'
      : 'There is real bad blood here.';
  }
  if (heat > 55) return 'The build-up has done its job — people want to see this.';
  if (heat > 30) return 'Some interest, mostly from the division.';
  return 'Nobody outside the rankings is talking about this.';
}
