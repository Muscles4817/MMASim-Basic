/**
 * Wrestling as a *sequence*: the chain, the sprawl and what comes off it, the mat return, the
 * scramble.
 *
 * The audit measured chain wrestling running backwards — after a stuffed shot the same man shot
 * again 3–7 % of the time against a baseline of 13–43 % — because a stuffed shot handed momentum to
 * the defender, re-drew initiative and put everybody back at range (docs/reviews/19 §3). Real chain
 * wrestling is the opposite: the first shot is the setup for the second, the defender's sprawl is
 * the moment the single becomes a double, and the man who stands up from the bottom is the man the
 * wrestler drags back down.
 *
 * And the other side of the sprawl had no game at all. A wrestler who stuffs a shot is holding a
 * head: the snap-down, the go-behind, the guillotine and the D'Arce all live there.
 *
 * Pure numbers here; `simulate.ts` resolves the beats.
 *
 * Doc 36 phase 5.
 */

import { clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { fatiguedEffect } from '../ratings/curve.js';
import type { Combatant } from './profile.js';
import type { TakedownEntry } from './types.js';
import { FRONT_HEADLOCK_SUBMISSIONS, type SubmissionKey } from './submissions.js';

/** The most links a chain runs before somebody has to reset. */
export const MAX_CHAIN = 2;

/**
 * Does the shooter keep going after a stuffed shot?
 *
 * Owned by the repertoire (`chainWrestling`, which already reads wrestling, cardio and the
 * `chainWrestler` trait) and the plan's lean on takedowns, and paid for in the tank: a gassed
 * wrestler stops chaining before he stops shooting.
 */
export function chainChance(c: Combatant, depth: number): number {
  const tank = remap(c.fatigue, 0.2, 0.85, 1, 0.35);
  const plan = c.plan.tactics.entry === 'proactiveWrestling' ? 1.35 : 1;
  return clamp01(c.style.chainWrestling * 0.62 * tank * plan * (depth === 0 ? 1 : 0.6));
}

/** How much the defender is behind on the second and third link — his weight is already committed. */
export function chainEdge(c: Combatant, depth: number): number {
  return 1 + depth * (0.1 + c.style.chainWrestling * 0.15);
}

/** The next entry in a chain is a different one: the single becomes a double, the double a single. */
export function chainedEntry(rng: Rng, last: TakedownEntry): TakedownEntry {
  switch (last) {
    case 'singleLeg':
      return rng.chance(0.6) ? 'doubleLeg' : 'bodyLock';
    case 'doubleLeg':
      return rng.chance(0.6) ? 'singleLeg' : 'bodyLock';
    case 'reactiveShot':
      return 'doubleLeg';
    case 'bodyLock':
      return 'trip';
    case 'trip':
      return 'bodyLock';
  }
}

/**
 * Does the man who sprawled come up holding a head?
 *
 * The sprawl-and-brawler stuffs and lets go; the wrestler with a submission game snaps and attacks.
 */
export function frontHeadlockChance(holder: Combatant): number {
  const game = (holder.attrs.wrestling + holder.attrs.submissions) / 2;
  const trait = holder.fighter.traits.includes('sprawlAndBrawl') ? 0.6 : 1;
  return clamp01(0.16 * remap(game, 40, 90, 0.35, 1.45) * trait);
}

export type HeadlockOption = 'goBehind' | 'choke' | 'snapReset';

/** What he does with the head. A choke needs a choke in the repertoire. */
export function headlockOption(rng: Rng, holder: Combatant): HeadlockOption {
  let chokes = 0;
  for (const k of FRONT_HEADLOCK_SUBMISSIONS) chokes += holder.style.subs[k] ?? 0;
  return rng.pickWeighted(['goBehind', 'choke', 'snapReset'] as const, (o) =>
    o === 'goBehind'
      ? remap((holder.attrs.wrestling + holder.attrs.scrambling) / 2, 40, 90, 0.4, 1.4)
      : o === 'choke'
        ? remap(holder.attrs.submissions, 40, 90, 0.05, 0.9) * Math.min(1.5, chokes / 3)
        : 1,
  );
}

export function headlockChoke(rng: Rng, holder: Combatant): SubmissionKey {
  return rng.pickWeighted(FRONT_HEADLOCK_SUBMISSIONS, (k) => (holder.style.subs[k] ?? 0) + 0.05);
}

/**
 * The man underneath got back to his feet. Does the wrestler drag him straight back down?
 *
 * The contest is the wrestler's chain against the get-up's base; a man who wall-walked on a
 * chewed-up leg goes back down more easily.
 */
export function matReturnChance(top: Combatant, bottom: Combatant): number {
  const attack = fatiguedEffect(top.derived.chainWrestling, 'wrestling', top.fatigue) * top.style.chainWrestling;
  const base = fatiguedEffect(bottom.attrs.takedownDefence, 'takedownDefence', bottom.fatigue);
  return clamp01(0.55 * (attack / (attack + base * 0.6)) * (bottom.legsCompromised ? 1.3 : 1) * top.mem.lean.takedown);
}

/**
 * Getting up the hard way: turning to the knees gives up the back if the man on top is quick.
 */
export function backExposureChance(top: Combatant): number {
  return clamp01(0.1 * remap(top.attrs.scrambling, 40, 90, 0.5, 1.4));
}

export type ScrambleOutcome = 'bothUp' | 'reversed' | 'backTaken' | 'held';

/** A failed sweep that turns into a scramble, decided on scrambling against scrambling. */
export function scramble(rng: Rng, bottom: Combatant, top: Combatant): ScrambleOutcome {
  const b = fatiguedEffect(bottom.attrs.scrambling, 'scrambling', bottom.fatigue);
  const t = fatiguedEffect(top.attrs.scrambling, 'scrambling', top.fatigue);
  const edge = b / (b + t);
  return rng.pickWeighted(['bothUp', 'reversed', 'backTaken', 'held'] as const, (o) =>
    o === 'bothUp' ? 0.9 : o === 'reversed' ? edge * 1.1 : o === 'backTaken' ? (1 - edge) * 0.55 : 1.2,
  );
}
