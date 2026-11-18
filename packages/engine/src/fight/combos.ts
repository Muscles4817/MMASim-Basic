/**
 * Combinations: why the second punch lands.
 *
 * A burst used to be one to seven independent shots, each with its own target, weapon and landing
 * roll (docs/reviews/19 §3, "Setups: absent"). Nothing in it set anything up: the jab did not open
 * the right hand, the body hook did not bring the guard down, and a feint was not a thing. The
 * `combination` event kind existed and was never emitted.
 *
 * Here a burst is a **pattern** the fighter has drilled (`style.ts`), unrolled into shots. Each shot
 * after the first gets a *setup* bonus on its landing roll when the shot before it was actually
 * thrown into the defence — landed or blocked, it made him react. How big that bonus is depends on
 * how drilled the pattern is and how well the fighter reads the moment (`fightIq`); how much of it
 * survives depends on how well the *defender* reads it (his `fightIq`, and whether he has seen the
 * pattern before tonight — `mind.ts`).
 *
 * **Level-neutral by construction.** The lead shot of every pattern carries `LEAD_DISCOUNT`, sized
 * so the population's landing rate is where it was. What a pattern changes is *which* shots land and
 * for *whom*: a sharp, drilled combination puncher lands more of the shots that come second, and a
 * dull single-shot fighter lands about what he did.
 *
 * Doc 36 phase 2.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { strikeSuitability } from './range.js';
import type { ComboKey, StyleProfile } from './style.js';
import { COMBO_KEYS } from './style.js';
import type { Range, StrikeTarget, Weapon } from './types.js';

/**
 * The individual shapes a pattern is built from. A technique is a weapon, a target, and which hand
 * or leg — the narrator names it, resolution only needs the first two.
 */
export const TECHNIQUES = [
  'jab',
  'straight',
  'hook',
  'uppercut',
  'overhand',
  'bodyHook',
  'bodyStraight',
  'lowKick',
  'calfKick',
  'bodyKick',
  'headKick',
  'teep',
  'feint',
] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const TECHNIQUE_SHAPE: Readonly<
  Record<Exclude<Technique, 'feint'>, { weapon: Weapon; target: StrikeTarget }>
> = {
  jab: { weapon: 'punch', target: 'head' },
  straight: { weapon: 'punch', target: 'head' },
  hook: { weapon: 'punch', target: 'head' },
  uppercut: { weapon: 'punch', target: 'head' },
  overhand: { weapon: 'punch', target: 'head' },
  bodyHook: { weapon: 'punch', target: 'body' },
  bodyStraight: { weapon: 'punch', target: 'body' },
  lowKick: { weapon: 'kick', target: 'legs' },
  calfKick: { weapon: 'kick', target: 'legs' },
  bodyKick: { weapon: 'kick', target: 'body' },
  headKick: { weapon: 'kick', target: 'head' },
  teep: { weapon: 'kick', target: 'body' },
};

/**
 * The patterns, as techniques. `undefined` in a slot means "whatever the fighter would throw here
 * anyway" — the free shot `pickShot` decides, which keeps targeting under the plan's control.
 */
export const PATTERNS: Readonly<Record<ComboKey, readonly (Technique | undefined)[]>> = {
  oneTwo: ['jab', 'straight'],
  doubleJab: ['jab', 'jab', undefined],
  oneTwoHook: ['jab', 'straight', 'hook'],
  bodyHead: ['bodyHook', 'hook'],
  headBody: ['jab', 'straight', 'bodyHook'],
  punchesToKick: ['jab', 'straight', 'lowKick'],
  kickToPunches: ['bodyKick', 'straight', 'hook'],
  feintShot: ['feint', undefined],
  // As a burst it is the hands; the level change itself is resolved by the takedown that follows.
  strikeToShot: ['jab', 'straight'],
  // One shot, whatever this fighter throws when he throws one: an overhand from a puncher, a head
  // kick from a kicker. Left free so a kicking exchange can be a single kick.
  single: [undefined],
  lowHigh: ['lowKick', 'headKick'],
  // Free slots, so a kick exchange keeps them kicks and the range picks which.
  kickFlurry: [undefined, undefined],
};

/** Human names for the pattern, for the `combination` line. */
export const PATTERN_NAMES: Readonly<Record<ComboKey, string>> = {
  oneTwo: 'the one-two',
  doubleJab: 'the double jab',
  oneTwoHook: 'one-two-hook',
  bodyHead: 'the body-head hook',
  headBody: 'the one-two to the body',
  punchesToKick: 'hands to the low kick',
  kickToPunches: 'the kick into the hands',
  feintShot: 'the feint',
  strikeToShot: 'the one-two',
  single: 'one big shot',
  lowHigh: 'the low kick to the high kick',
  kickFlurry: 'kick after kick',
};

/**
 * How much a well-set-up shot is easier to land, before either fighter's reading of it.
 *
 * About a fifth: a jab that makes the guard flinch is the difference between a right hand that
 * lands one time in two and one that lands three times in five. The *feint* is worth more because
 * it costs a beat and throws nothing.
 */
const SETUP_BONUS = 0.2;
const FEINT_BONUS = 0.3;

/**
 * What the first shot of a pattern pays for the shots behind it.
 *
 * The level-neutrality term. A lead jab is thrown to be seen — it finds range and draws a reaction —
 * and lands a little less than a shot thrown on its own. Measured against the audit harness's even
 * matchup so the population's significant-strike accuracy is unchanged (51.8 % before).
 */
export const LEAD_DISCOUNT = 0.9;

/**
 * Body and head shots trade setups. A body shot that lands *draws the elbows down*; a head shot
 * draws them up. The second part of the bonus is the target change itself.
 */
function crossLevel(prev: StrikeTarget, next: StrikeTarget): number {
  return prev !== next ? 1.25 : 1;
}

export interface PlannedShot {
  technique: Technique | undefined;
  weapon: Weapon | undefined;
  target: StrikeTarget | undefined;
}

/**
 * Pick a pattern for this burst.
 *
 * Weighted by the fighter's repertoire, by whether the exchange is a kicking one, by how well the
 * pattern's techniques suit the range, and by what the corner asked for: a body-first plan throws
 * body-first patterns.
 */
export function choosePattern(
  rng: Rng,
  style: StyleProfile,
  prefersKick: boolean,
  range: Range,
  targeting: Readonly<Record<StrikeTarget, number>>,
  /** `kickLean`: how much of this fighter's striking goes to the feet, 0–1. */
  lean: number,
): ComboKey {
  return rng.pickWeighted(COMBO_KEYS, (k) => {
    if (k === 'strikeToShot') return 0; // only chosen by the takedown branch
    const techs = PATTERNS[k];
    let fit = 1;
    let kicks = 0;
    let body = 0;
    let legs = 0;
    for (const t of techs) {
      if (!t || t === 'feint') continue;
      const shape = TECHNIQUE_SHAPE[t];
      fit *= strikeSuitability(shape.weapon, shape.target, range) ** 0.5;
      if (shape.weapon === 'kick') kicks++;
      if (shape.target === 'body') body++;
      if (shape.target === 'legs') legs++;
    }
    // A kicking exchange is led by the feet: the patterns that kick, or a single free shot that will
    // itself be a kick. The hand patterns are mostly a punching exchange's.
    const free = techs.every((t) => t === undefined);
    if (free && techs.length > 1 && !prefersKick) return 0;
    const kickFit = prefersKick
      ? kicks > 0
        ? 2
        : free
          ? 2.5
          : 0.12
      : kicks > 0
        ? 0.15 + lean * 1.4
        : 1;
    // A plan that wants the body throws body patterns; one that wants the legs throws leg patterns.
    const planFit =
      (body > 0 ? remap(targeting.body, 0.1, 0.6, 0.6, 2.2) : 1) *
      (legs > 0 ? remap(targeting.legs, 0.05, 0.6, 0.6, 2.2) : 1);
    return style.combos[k] * fit * kickFit * planFit;
  });
}

/**
 * The setup bonus a shot earns from the one before it, as a multiplier on offence.
 *
 * `drilled` is the pattern's weight in the fighter's repertoire, read relative to an ordinary
 * preference of about 1; `actorIq` and `defenderIq` are `fightIq` ratings; `familiar` is how much of
 * this exact pattern the defender has already seen tonight, 0–1 (`mind.ts`).
 */
export function setupMultiplier(input: {
  prev: StrikeTarget | 'feint';
  next: StrikeTarget;
  drilled: number;
  actorIq: number;
  defenderIq: number;
  familiar: number;
}): number {
  const craft = clamp(input.drilled, 0.4, 2.5) ** 0.4 * remap(input.actorIq, 30, 95, 0.65, 1.3);
  const seen = clamp01(remap(input.defenderIq, 30, 95, 0.05, 0.45) + input.familiar * 0.5);
  if (input.prev === 'feint') return 1 + FEINT_BONUS * craft * (1 - seen);
  return 1 + SETUP_BONUS * craft * crossLevel(input.prev, input.next) * (1 - seen * 0.7);
}

/** Seconds a shot takes, so each line of a burst has its own timestamp. */
export function shotSeconds(rng: Rng): number {
  return 0.4 + rng.next() * 0.9;
}
