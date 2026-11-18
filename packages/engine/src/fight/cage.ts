/**
 * The cage: where in it the fight is happening, and what the fence does.
 *
 * Every mechanism before this knew how far apart two fighters were and nothing about *where* they
 * were. So a pressure fighter could close the distance but never trap anybody, a counter-striker
 * could retreat forever, nobody could cut off the cage, and "against the fence" was a phrase in the
 * clinch prose with nothing behind it (docs/reviews/19 "Still open"; the clinch and ground disengage
 * resolvers both carried a note saying this belonged with whatever gave the cage a geography).
 *
 * ## The model
 *
 * One number and one name: **how close one fighter's back is to the fence**, 0 (the centre) to 1
 * (pinned), and **whose back it is**. A full two-dimensional position would let a fighter circle,
 * but circling is a *contest*, not a coordinate, and the contest is what this models: the man near
 * the fence gets off it laterally or he does not.
 *
 *  - **Closing pushes.** A successful step in drives the other man back. Pressure fighters push
 *    further — it is what pressure *is* (`range.ts` notes that pressure is not footwork; here it is
 *    finally something).
 *  - **Retreating straight back spends cage.** A fighter who backs out of range without circling is
 *    walking himself toward the fence.
 *  - **Cutting off the cage.** Near the fence a fighter cannot step straight back, so his retreat
 *    turns into a lateral escape, contested on footwork (`distanceControl`'s mix: speed, fight IQ,
 *    cardio) against the presser's ability to cut the angle — the same mix, plus aggression.
 *  - **The fence changes what works.** No kicking range with your back on it; less room to slip
 *    (a small striking-defence cost); easier to tie up; and on the floor, the cage is what a fighter
 *    wall-walks up — but also what a top fighter pins him against.
 *
 * Small effects by design. The cage changes *where* fights happen and who controls them more than it
 * changes how often anybody is finished, and the statistical tier holds the latter.
 *
 * Doc 36, cage geography.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { distanceControl } from '../ratings/functional.js';
import { fatigued } from '../ratings/curve.js';
import type { Combatant } from './profile.js';
import type { Corner } from './types.js';

export interface CageState {
  /** Whose back is nearest the fence, if anybody's. */
  backed: Corner | undefined;
  /** 0 (centre) to 1 (pinned against the fence). */
  depth: number;
}

export function centre(cage: CageState): void {
  cage.backed = undefined;
  cage.depth = 0;
}

/** Depth at which a fighter is *on* the fence rather than near it. */
export const ON_FENCE = 0.75;

/** How far the given fighter's back is from the fence, as his own depth (0 when it is not his back). */
export function depthOf(cage: CageState, corner: Corner): number {
  return cage.backed === corner ? cage.depth : 0;
}

export function onFence(cage: CageState, corner: Corner): boolean {
  return depthOf(cage, corner) >= ON_FENCE;
}

/**
 * Move the fight toward `victim`'s fence by `amount`. If the other man's back was the one near the
 * fence, the fight first walks back through the centre.
 */
export function push(cage: CageState, victim: Corner, amount: number): void {
  if (amount <= 0) return;
  if (cage.backed === undefined || cage.backed === victim) {
    cage.backed = victim;
    cage.depth = clamp01(cage.depth + amount);
    return;
  }
  const left = cage.depth - amount;
  if (left >= 0) {
    cage.depth = left;
    if (left === 0) cage.backed = undefined;
  } else {
    cage.backed = victim;
    cage.depth = clamp01(-left);
  }
}

/** Footwork, on the effect scale: `distanceControl`'s mix, fatigued. */
function footwork(c: Combatant): number {
  const a = c.attrs;
  const tired = {
    ...a,
    speed: fatigued(a.speed, 'speed', c.fatigue),
    fightIq: fatigued(a.fightIq, 'fightIq', c.fatigue),
  };
  return distanceControl(tired) * (c.legsCompromised ? 0.8 : 1);
}

/**
 * How far a successful step in drives the other man back. A pressure plan and an aggressive
 * temperament walk people down; a fighter who merely closed the gap to throw moves them less.
 */
export function pushOnClose(presser: Combatant): number {
  const plan = presser.plan.tactics.entry === 'pressure' ? 1.6 : 1;
  const temperament = remap(presser.fighter.personality.aggression, 20, 95, 0.75, 1.3);
  return 0.18 * plan * temperament;
}

/** How much cage a fighter spends backing straight out of range. */
export const RETREAT_COST = 0.14;

/**
 * Near the fence, a retreat is a lateral escape: does he circle off, or is the angle cut?
 *
 * Returns the chance he gets off it. Contested on footwork against the presser's footwork, with the
 * presser's fight IQ (reading which way he will go) and aggression (willingness to commit to the
 * cut) on his side. Deeper is harder.
 */
export function circleOutChance(escaper: Combatant, presser: Combatant, depth: number): number {
  const out = footwork(escaper);
  const cut =
    footwork(presser) *
    remap(presser.attrs.fightIq, 30, 95, 0.85, 1.15) *
    remap(presser.fighter.personality.aggression, 20, 95, 0.9, 1.15);
  const contest = out / (out + cut);
  return clamp(contest * (1.25 - depth * 0.55), 0.05, 0.9);
}

export function circleOut(
  rng: Rng,
  escaper: Combatant,
  presser: Combatant,
  cage: CageState,
): boolean {
  if (!rng.chance(circleOutChance(escaper, presser, cage.depth))) return false;
  // Off the fence and back toward the centre, not all the way: he has made room, not taken it.
  cage.depth = clamp01(cage.depth - 0.5);
  if (cage.depth < 0.05) centre(cage);
  return true;
}

/** Striking defence for a fighter with his back to the fence: less room to roll and step off. */
export function fenceDefence(cage: CageState, corner: Corner): number {
  return 1 - depthOf(cage, corner) * 0.07;
}

/** How much easier a tie-up is against a man on the fence. */
export function fenceClinchEase(cage: CageState, target: Corner): number {
  return 1 + depthOf(cage, target) * 0.3;
}

/**
 * The bottom fighter on the floor near the fence can wall-walk; a fighter in the open has nothing
 * to climb. A takedown taken against the fence lands there.
 */
export function wallWalkEase(nearFence: boolean): number {
  return nearFence ? 1.25 : 1;
}
