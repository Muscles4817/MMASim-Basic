/**
 * How often a promotion puts on a show.
 *
 * There was no answer to this anywhere in the engine, and the absence had a shape. `advanceWorld`
 * ran a fixed **three cards a fortnight across the entire sport** and decided whose night it was
 * with a prestige-weighted draw — so a promotion's calendar was a share of a global quota rather
 * than a property of the promotion. Three things followed from that, and the third is the one that
 * matters:
 *
 *  - **A promotion's schedule depended on its competitors.** Founding a regional show in Poland
 *    took dates off the promotion at the top of the sport, because the draw is relative. Nothing
 *    about the real sport works that way.
 *  - **The sport could not get bigger.** Doc 26 § 2's pyramid is seventy-odd promotions; handed the
 *    same seventy-eight cards a year, each of them runs two. Measured, a 74-promotion world
 *    produced 0.86 bouts per fighter per year — a generated world that looks right and is inert.
 *  - **The schedule had no relationship to the roster.** A promotion with two hundred fighters and
 *    one with twenty drew from the same prestige lottery, so a promotion could be handed dates it
 *    had nobody to fill and denied dates it could easily have staged.
 *
 * The answer here is derived rather than tabled: **a promotion runs as many cards as its roster can
 * fill, up to what a promotion of its size actually stages.** That is the real constraint in both
 * directions — the leader runs a show most weekends because it has six hundred fighters under
 * contract, and a regional runs one every six weeks because it has sixty and they cannot fight
 * more often than the sport lets them.
 */

import { clamp } from '../core/math.js';
import type { Promotion, PromotionTier } from '../domain/organisations.js';
import { CARD_SIZE } from './events.js';
import { periodCosts, COST_PERIOD_DAYS } from './promotionCosts.js';

/**
 * Cards a promotion of this tier stages in a year when its roster is no constraint.
 *
 * The ambition, not the outcome. Anchored on what real promotions of each size run: a global
 * leader is close to a show a week, a major international runs roughly one a fortnight, a national
 * or regional show runs monthly, and a developmental circuit runs a handful.
 *
 * Almost nothing in the shipped world is actually limited by this — the roster ceiling below binds
 * first for every promotion in the 2026 era. It exists so that a *generated* world with a
 * six-hundred-fighter apex promotion does not conclude that the apex should run seventy shows a
 * year, which is the shape the roster rule alone would produce.
 */
const TIER_AMBITION: Readonly<Record<PromotionTier, number>> = {
  global: 44,
  major: 26,
  regional: 16,
  developmental: 10,
};

/**
 * Bouts a fighter on this tier's roster takes in a year.
 *
 * Inverted from the top of the sport on purpose, and this is the whole reason the model is roster-
 * driven rather than prestige-driven. A champion fights twice a year; a prospect on a regional
 * circuit fights four or five times, because that is how you build a record. So the *fighters* at
 * the bottom are busier even though the *promotions* at the bottom are not.
 *
 * `MAX_BOUTS_PER_YEAR` in the world tick is the hard ceiling on any individual; these are averages
 * across a roster in which most people are also injured, suspended, in camp or between contracts.
 *
 * **The level is calibrated against the economy, not against the sport.** These numbers put the
 * shipped 2026 world at about seventy cards a year, which is what it ran under the global quota
 * this replaced and therefore what `promotion-costs.test.ts` and the rest of the business layer
 * were tuned against. A first cut used 1.9 to 2.4 — closer to what fighters actually average — and
 * it ran the sport 60% busier than the economy could carry: measured over ten years, the
 * fourth-smallest promotion in the world went insolvent, and over twelve, two of them did. That is
 * a real finding about the *cost* model rather than about the schedule, and changing the schedule
 * is not the place to bank a fix for it. Raising these is the single knob for a busier sport, and
 * doing it needs the card economics looked at first.
 */
const TIER_BOUTS_PER_FIGHTER: Readonly<Record<PromotionTier, number>> = {
  global: 1.5,
  major: 1.55,
  regional: 1.7,
  developmental: 1.9,
};

/**
 * A promotion that cannot pay for a card runs a shorter season.
 *
 * Gentle, and gentler than the first version of it, because the measurement said something
 * counter-intuitive. A promotion's overheads are driven by its **roster**, not by its calendar —
 * `periodCosts` bills for staff, premises and a contracted roster whether or not anybody fights —
 * so cutting a struggling promotion's schedule takes away its income and leaves its costs alone.
 * Steepening this from a 0.45 floor to a 0.25 floor, on the theory that a promotion in trouble
 * runs fewer shows, **killed a second promotion**: the two smallest in the 2026 world both reached
 * zero inside twelve simulated years instead of one of them.
 *
 * So it exists as a brake on a promotion spending itself to death rather than as a death spiral,
 * and the real lever on whether the bottom of the sport survives is `TIER_BOUTS_PER_FIGHTER`
 * above — how busy the sport is at all.
 */
function solvency(promotion: Promotion, rosterSize: number): number {
  const annualCosts = (periodCosts({ promotion, rosterSize }).total * 365) / COST_PERIOD_DAYS;
  if (annualCosts <= 0) return 1;
  return clamp(0.45 + (promotion.budget / annualCosts) * 0.9, 0.45, 1);
}

/**
 * Cards this promotion runs in a year.
 *
 * `rosterSize` is its *active* fighters — retired ones cannot fill a card, and counting them makes
 * a dying promotion look busy right up until nobody turns up.
 */
export function cardsPerYear(promotion: Promotion, rosterSize: number): number {
  // Two fighters per bout, so a roster of N supports N × bouts-per-fighter ÷ 2 bouts a year.
  const boutsSupported = (rosterSize * TIER_BOUTS_PER_FIGHTER[promotion.tier]) / 2;
  const fromRoster = boutsSupported / CARD_SIZE;
  const ceiling = Math.min(TIER_AMBITION[promotion.tier], fromRoster);
  return Math.max(0, ceiling * solvency(promotion, rosterSize));
}

/**
 * The busiest schedule any promotion can have, whatever its roster.
 *
 * Exported so the world tick can size its truncation backstop from the schedule rather than from a
 * second constant that would have to be kept in step with this one.
 */
export const MAX_CARDS_PER_YEAR = Math.max(...Object.values(TIER_AMBITION));

/** Days between this promotion's cards. `Infinity` when it cannot stage any. */
export function daysBetweenCards(promotion: Promotion, rosterSize: number): number {
  const perYear = cardsPerYear(promotion, rosterSize);
  return perYear <= 0 ? Infinity : 365 / perYear;
}
