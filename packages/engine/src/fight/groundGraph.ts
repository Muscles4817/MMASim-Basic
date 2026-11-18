/**
 * The floor as a graph rather than a ladder.
 *
 * Before this every pass went exactly one rung — guard, half guard, side control, mount, back — so a
 * back-take could only come from mount, a judoka's throw could never land in north-south, nobody
 * ever recovered guard, and a pass that skipped half guard was impossible (docs/reviews/19 §1.4).
 * Here a successful pass lands somewhere drawn from what the position connects to, weighted by how
 * good the passer is; a defending fighter can climb back down; and the leg-lock game has a place to
 * happen.
 *
 * Doc 36 phase 6.
 */

import { clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { fatiguedEffect } from '../ratings/curve.js';
import type { Combatant } from './profile.js';
import type { GroundPosition } from './types.js';

type Edge = readonly [GroundPosition, number, 'skill' | 'plain'];

/**
 * Where a successful pass can land, from each position. `skill` edges are scaled by how good a
 * passer the top fighter is — a world-class top player goes from guard to mount; an average one to
 * half guard.
 */
const PASSES: Readonly<Record<GroundPosition, readonly Edge[]>> = {
  legEntangle: [
    ['halfGuard', 1, 'plain'],
    ['sideControl', 0.5, 'skill'],
  ],
  openGuard: [
    ['halfGuard', 0.7, 'plain'],
    ['sideControl', 0.8, 'skill'],
    ['mount', 0.08, 'skill'],
  ],
  guard: [
    ['halfGuard', 1, 'plain'],
    ['sideControl', 0.25, 'skill'],
    ['mount', 0.04, 'skill'],
  ],
  halfGuard: [
    ['sideControl', 1, 'plain'],
    ['mount', 0.3, 'skill'],
    ['back', 0.12, 'skill'],
  ],
  turtle: [
    ['back', 1, 'plain'],
    ['sideControl', 0.35, 'plain'],
  ],
  sideControl: [
    ['mount', 1, 'plain'],
    ['northSouth', 0.35, 'plain'],
    ['back', 0.15, 'skill'],
  ],
  northSouth: [
    ['mount', 0.6, 'plain'],
    ['back', 0.25, 'skill'],
  ],
  mount: [['back', 1, 'plain']],
  back: [],
};

export function passTarget(rng: Rng, from: GroundPosition, passer: Combatant): GroundPosition | undefined {
  const edges = PASSES[from];
  if (edges.length === 0) return undefined;
  const skill = remap(passer.attrs.groundControl, 45, 95, 0.5, 1.8);
  return rng.pickWeighted(edges, (e) => e[1] * (e[2] === 'skill' ? skill : 1))[0];
}

/**
 * Where a defending fighter recovers to when his framing works. One step back toward a guard, and
 * from the back, out to the turtle or straight to guard if he is good enough to turn in.
 */
const RECOVERY: Readonly<Partial<Record<GroundPosition, readonly GroundPosition[]>>> = {
  mount: ['halfGuard'],
  sideControl: ['halfGuard', 'guard'],
  northSouth: ['sideControl', 'turtle'],
  halfGuard: ['guard', 'openGuard'],
  back: ['turtle', 'guard'],
  turtle: ['guard', 'halfGuard'],
};

/**
 * Guard recovery: framing that works does not only stall him, it *gives back position*. The chance
 * is the bottom fighter's scrambling against the top fighter's control.
 */
export function recoverGuard(
  rng: Rng,
  from: GroundPosition,
  bottom: Combatant,
  top: Combatant,
): GroundPosition | undefined {
  const options = RECOVERY[from];
  if (!options) return undefined;
  const hips = fatiguedEffect(bottom.attrs.scrambling, 'scrambling', bottom.fatigue);
  const weight = fatiguedEffect(top.attrs.groundControl, 'groundControl', top.fatigue);
  if (!rng.chance(clamp01(0.32 * (hips / (hips + weight)) * 2))) return undefined;
  return rng.pick(options);
}

/**
 * Diving on a leg. Only fighters with a leg-lock game do it, and only from the guards; it is
 * contested on scrambling against the top man's base.
 */
export function legEntryChance(bottom: Combatant, from: GroundPosition): number {
  if (bottom.style.legLocks < 0.12) return 0;
  if (from !== 'guard' && from !== 'openGuard' && from !== 'halfGuard') return 0;
  return clamp01(bottom.style.legLocks * (from === 'openGuard' ? 0.9 : 0.55));
}

/** When a closed guard is worked on and holds, it often opens rather than staying closed. */
export const GUARD_OPENS = 0.3;
