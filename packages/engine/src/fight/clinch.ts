/**
 * The clinch, filled out: what each clinch game throws, and what each stance gives up in a tie-up.
 *
 * Before this the clinch had one weapon — a knee, aimed at the body 60 % of the time — whoever was
 * throwing it, and knees were 0.2–3.3 % of landed strikes (docs/reviews/19 §1). The sport's clinch is
 * three different places: the Thai plum, where knees go to the head; the boxer's tie-up, where short
 * hooks, uppercuts and elbows live; and the wrestler's body lock, where the strikes are a means to
 * the trip.
 *
 * Doc 36 phase 7.
 */

import type { Rng } from '../core/rng.js';
import type { Combatant } from './profile.js';
import type { ClinchGame } from './style.js';
import type { StrikeTarget, Weapon } from './types.js';

type Shot = readonly [Weapon, StrikeTarget, number];

const MENU: Readonly<Record<ClinchGame, readonly Shot[]>> = {
  thai: [
    ['knee', 'head', 0.32],
    ['knee', 'body', 0.42],
    ['elbow', 'head', 0.12],
    ['punch', 'head', 0.08],
    ['knee', 'legs', 0.06],
  ],
  dirtyBoxing: [
    ['punch', 'head', 0.42],
    ['punch', 'body', 0.22],
    ['elbow', 'head', 0.18],
    ['knee', 'body', 0.18],
  ],
  greco: [
    ['knee', 'body', 0.32],
    ['knee', 'legs', 0.24],
    ['punch', 'head', 0.26],
    ['punch', 'body', 0.12],
    ['kick', 'legs', 0.06],
  ],
  standard: [
    ['knee', 'body', 0.45],
    ['knee', 'head', 0.12],
    ['punch', 'head', 0.25],
    ['punch', 'body', 0.12],
    ['elbow', 'head', 0.06],
  ],
};

export function clinchShot(rng: Rng, c: Combatant): { weapon: Weapon; target: StrikeTarget } {
  const shot = rng.pickWeighted(MENU[c.style.clinchGame], (s) => s[2]);
  return { weapon: shot[0], target: shot[1] };
}

/** A Thai fighter in the plum and a boxer on the inside are better at it than a generalist. */
export function clinchStyleOffence(c: Combatant): number {
  return c.style.clinchGame === 'standard' ? 1 : 1.06;
}

/**
 * The crouched wrestler's head is low and a knee finds it; the square Thai fighter is already
 * posture-up and hard to knee. Doc 36 phase 8's clinch half.
 */
export function clinchStyleDefence(c: Combatant, weapon: Weapon, target: StrikeTarget): number {
  const style = c.style.stanceStyle;
  if (style === 'crouched' && weapon === 'knee' && target === 'head') return 0.82;
  if (style === 'square') return 1.06;
  return 1;
}

/** A Greco game takes people down from the tie-up; a Thai game wants to stay standing in it. */
export function clinchTakedownEdge(c: Combatant): number {
  return c.style.clinchGame === 'greco' ? 1.2 : c.style.clinchGame === 'thai' ? 0.8 : 1;
}
