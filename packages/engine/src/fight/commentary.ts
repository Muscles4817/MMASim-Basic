/**
 * Play-by-play text.
 *
 * Kept entirely separate from resolution: the simulator decides what happened, this module
 * decides how it reads. That separation means commentary can be rewritten, localised or
 * given a commentator's voice without any risk of changing an outcome.
 */

import type { Rng } from '../core/rng.js';
import { displayName } from '../domain/fighter.js';
import type { Combatant } from './profile.js';
import type { GroundPosition, StrikeTarget } from './types.js';

export const surname = (c: Combatant): string => c.fighter.lastName;
export const fullDisplayName = (c: Combatant): string => displayName(c.fighter);

const HEAD_STRIKES = [
  'a stiff jab',
  'a right hand down the pipe',
  'a short left hook',
  'an overhand right',
  'a check hook',
  'a straight left',
  'a lead uppercut',
  'a blistering 1-2',
];

const BODY_STRIKES = [
  'a hook to the liver',
  'a straight right to the ribs',
  'a knee to the midsection',
  'a chopping body kick',
  'a short shovel hook to the body',
];

const LEG_STRIKES = [
  'a calf kick',
  'a low kick to the thigh',
  'an inside leg kick',
  'a chopping leg kick',
];

const KICKS: Readonly<Record<StrikeTarget, readonly string[]>> = {
  head: ['a head kick', 'a switch high kick', 'a question-mark kick', 'a spinning back kick'],
  body: ['a body kick', 'a flying knee to the body', 'a teep to the midsection'],
  legs: LEG_STRIKES,
};

const STRIKES: Readonly<Record<StrikeTarget, readonly string[]>> = {
  head: HEAD_STRIKES,
  body: BODY_STRIKES,
  legs: LEG_STRIKES,
};

const MISS_VERBS = [
  'swings and misses with',
  'comes up short with',
  'is countered off',
  'has it slipped —',
];

const GROUND_POSITION_NAMES: Readonly<Record<GroundPosition, string>> = {
  guard: 'in guard',
  halfGuard: 'in half guard',
  sideControl: 'in side control',
  mount: 'in mount',
  back: 'on the back',
};

export const SUBMISSIONS: Readonly<Record<GroundPosition, readonly string[]>> = {
  guard: ['triangle', 'armbar', 'omoplata', 'guillotine'],
  halfGuard: ['kimura', 'arm-triangle', 'D’Arce'],
  sideControl: ['arm-triangle', 'kimura', 'north-south choke'],
  mount: ['armbar', 'arm-triangle', 'mounted guillotine'],
  back: ['rear-naked choke', 'body triangle to RNC', 'bulldog choke'],
};

export function strikeLanded(
  rng: Rng,
  attacker: Combatant,
  target: StrikeTarget,
  isKick: boolean,
  flushness: number,
): string {
  const move = rng.pick(isKick ? KICKS[target] : STRIKES[target]);
  const name = surname(attacker);
  if (flushness >= 2.0) return `${name} lands ${move} — flush, and that hurt.`;
  if (flushness >= 1.3) return `${name} lands ${move} clean.`;
  if (flushness <= 0.4) return `${name} gets ${move} through, but it was partially blocked.`;
  return `${name} lands ${move}.`;
}

export function strikeMissed(rng: Rng, attacker: Combatant, target: StrikeTarget): string {
  return `${surname(attacker)} ${rng.pick(MISS_VERBS)} ${rng.pick(STRIKES[target])}.`;
}

export function knockdownText(rng: Rng, attacker: Combatant, defender: Combatant): string {
  return rng.pick([
    `DOWN GOES ${surname(defender).toUpperCase()}! ${surname(attacker)} put them on the canvas!`,
    `${surname(defender)} is DROPPED — and ${surname(attacker)} is swarming!`,
    `That's a knockdown! ${surname(defender)} folded from that one.`,
  ]);
}

export function hurtText(rng: Rng, defender: Combatant): string {
  return rng.pick([
    `${surname(defender)} is hurt — the legs went for a second there.`,
    `${surname(defender)} is in trouble, backing straight up to the fence.`,
    `That rocked ${surname(defender)}. They're trying to hold on.`,
  ]);
}

export function recoveredText(defender: Combatant): string {
  return `${surname(defender)} has cleared their head and is fighting back.`;
}

export function takedownText(rng: Rng, attacker: Combatant, position: GroundPosition): string {
  const entry = rng.pick(['a double leg', 'a single leg', 'a body lock', 'a reactive shot', 'a trip']);
  return `${surname(attacker)} hits ${entry} — down they go, ${surname(attacker)} ${GROUND_POSITION_NAMES[position]}.`;
}

export function takedownStuffedText(rng: Rng, attacker: Combatant, defender: Combatant): string {
  return rng.pick([
    `${surname(attacker)} shoots — STUFFED. ${surname(defender)} sprawls and circles off.`,
    `${surname(defender)} sees the level change coming and defends it easily.`,
    `${surname(attacker)} gets in on the hips but ${surname(defender)} fights the grip and breaks free.`,
  ]);
}

export function clinchText(rng: Rng, attacker: Combatant): string {
  return rng.pick([
    `${surname(attacker)} closes the distance and gets the clinch against the fence.`,
    `${surname(attacker)} ties up and starts working on the body in the clinch.`,
    `${surname(attacker)} forces the tie-up and walks them back to the cage.`,
  ]);
}

export function clinchBreakText(rng: Rng, defender: Combatant): string {
  return rng.pick([
    `${surname(defender)} frames off and circles back out to open space.`,
    `${surname(defender)} gets the underhook and breaks away.`,
    `They separate — back to distance.`,
  ]);
}

export function advanceText(attacker: Combatant, to: GroundPosition): string {
  return `${surname(attacker)} advances — now ${GROUND_POSITION_NAMES[to]}.`;
}

export function sweepText(rng: Rng, attacker: Combatant): string {
  return rng.pick([
    `${surname(attacker)} sweeps and takes top position — huge reversal!`,
    `Beautiful reversal from ${surname(attacker)} — they're on top now.`,
  ]);
}

export function standUpText(rng: Rng, defender: Combatant): string {
  return rng.pick([
    `${surname(defender)} wall-walks back to their feet.`,
    `${surname(defender)} works back up and separates.`,
    `${surname(defender)} scrambles up — back to the feet.`,
  ]);
}

export function refStandUpText(): string {
  return `The referee stands them up — not enough work from the top.`;
}

export function groundStrikesText(rng: Rng, attacker: Combatant, heavy: boolean): string {
  if (heavy) {
    return `${surname(attacker)} is landing heavy ground-and-pound — the referee is watching closely.`;
  }
  return rng.pick([
    `${surname(attacker)} postures up and lands short shots.`,
    `${surname(attacker)} works elbows from the top.`,
    `${surname(attacker)} keeps busy with punches to the body and head.`,
  ]);
}

export function submissionAttemptText(
  attacker: Combatant,
  defender: Combatant,
  name: string,
  deep: boolean,
): string {
  return deep
    ? `${surname(attacker)} has the ${name} locked in DEEP — ${surname(defender)} is in real trouble!`
    : `${surname(attacker)} goes for the ${name}.`;
}

export function submissionEscapeText(rng: Rng, defender: Combatant): string {
  return rng.pick([
    `${surname(defender)} defends it and works their way free.`,
    `${surname(defender)} stays calm, hand-fights and survives.`,
    `${surname(defender)} pops their head out — that was close.`,
  ]);
}

export function finishText(
  method: 'ko' | 'tko' | 'submission' | 'doctorStoppage' | 'retirement',
  winner: Combatant,
  loser: Combatant,
  detail?: string,
): string {
  switch (method) {
    case 'ko':
      return `IT'S OVER! ${surname(loser)} is out cold — ${fullDisplayName(winner)} by knockout!`;
    case 'tko':
      return `The referee has seen enough! ${surname(loser)} could not defend themselves — TKO win for ${fullDisplayName(winner)}.`;
    case 'submission':
      return `${surname(loser)} TAPS! ${fullDisplayName(winner)} wins by ${detail ?? 'submission'}!`;
    case 'doctorStoppage':
      return `The doctor waves it off — that cut is too severe. ${fullDisplayName(winner)} wins by doctor stoppage.`;
    case 'retirement':
      return `${surname(loser)} cannot continue. ${fullDisplayName(winner)} wins.`;
  }
}

export function roundStartText(round: number, totalRounds: number): string {
  if (round === totalRounds && totalRounds === 5) return `Round ${round} — championship round.`;
  return `Round ${round}.`;
}
