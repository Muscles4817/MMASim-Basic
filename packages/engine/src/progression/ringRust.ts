/**
 * What sitting out costs you.
 *
 * `Condition.ringRust` has existed since the fighter model was written, documented as "sharpness
 * from recent competition; decays during long layoffs" — and **nothing in the game ever wrote it
 * or read it**. It was initialised to zero, reset to zero after every fight, and referenced
 * nowhere else in the codebase. Being inactive cost a fighter precisely nothing.
 *
 * That is the reason free agency did not feel like a threat: it was not one. A fighter with no
 * promotion simply waited, at no cost, until something turned up. Every pressure the contract
 * layer is built to create — take the bad deal, take the short-notice fight, take the opponent
 * you would rather avoid — depends on time out of the cage being expensive, and it was free.
 *
 * Rust is deliberately not a penalty on how *good* you are. It suppresses the attributes that
 * depend on timing and live reps — speed, defensive reactions, scrambling, composure under fire —
 * and leaves strength, power and craft alone. That is the shape of the real thing: a fighter back
 * after two years hits just as hard and sees it coming much later.
 */

import { clamp01, remap } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { Attributes, AttributeKey } from '../ratings/attributes.js';

/** Below this, you are simply a fighter between fights. Nobody is rusty at four months. */
export const SHARP_DAYS = 210;

/** Past this, more time away stops making it meaningfully worse. */
export const FULLY_RUSTED_DAYS = 900;

/**
 * How rusty a layoff of this length leaves somebody, 0–1.
 *
 * The curve is deliberately flat then steep: two fights a year is an ordinary schedule and must
 * cost nothing at all, while the second year away is where a career actually goes.
 */
export function rustFor(daysSinceLastBout: number): number {
  if (daysSinceLastBout <= SHARP_DAYS) return 0;
  return clamp01(remap(daysSinceLastBout, SHARP_DAYS, FULLY_RUSTED_DAYS, 0, 1));
}

/** Days since this fighter last competed. `undefined` when they never have. */
export function daysSinceLastBout(
  record: readonly { day: GameDay }[],
  day: GameDay,
): number | undefined {
  if (record.length === 0) return undefined;
  const last = record.reduce((latest, bout) => Math.max(latest, bout.day), 0);
  return Math.max(0, day - last);
}

/**
 * What rust takes away, as a fraction removed at full rust.
 *
 * Timing and reactions only. A rusty fighter is not weaker or less skilled — they are late, and
 * being late is what gets you knocked out.
 */
const RUST_SUPPRESSES: Readonly<Partial<Record<AttributeKey, number>>> = {
  speed: 0.14,
  strikingDefence: 0.16,
  takedownDefence: 0.12,
  scrambling: 0.13,
  composure: 0.1,
  cardio: 0.08,
};

/** The attributes a rusty fighter actually brings to the cage. */
export function rustedAttributes(attributes: Attributes, rust: number): Attributes {
  if (rust <= 0) return attributes;

  const out = { ...attributes };
  for (const [key, share] of Object.entries(RUST_SUPPRESSES) as [AttributeKey, number][]) {
    out[key] = Math.round(attributes[key] * (1 - share * rust));
  }
  return out;
}

/** How it reads on the hub, which is the only reason a player will ever act on it. */
export function describeRust(rust: number): string {
  if (rust <= 0) return 'You are sharp. You have competed recently enough for it not to be a question.';
  if (rust < 0.25) return 'You are a little off the pace. Nothing a camp and a fight will not fix.';
  if (rust < 0.55)
    return 'You have been out long enough for it to show. Your timing is the first thing to go and it has started.';
  if (rust < 0.8)
    return 'You are badly rusty. You will be late on everything you used to see coming.';
  return 'You have been away so long you are effectively starting again. Getting hit is what happens next.';
}

/** A short label for a chip, where the sentence is too long. */
export function rustLabel(rust: number): string {
  if (rust <= 0) return 'Sharp';
  if (rust < 0.25) return 'Slightly rusty';
  if (rust < 0.55) return 'Rusty';
  if (rust < 0.8) return 'Badly rusty';
  return 'Shot to pieces';
}
