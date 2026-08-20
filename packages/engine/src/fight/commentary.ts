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
import type { GroundPosition, Range, StrikeTarget, TakedownEntry, Weapon } from './types.js';

export const surname = (c: Combatant): string => c.fighter.lastName;
export const fullDisplayName = (c: Combatant): string => displayName(c.fighter);

/**
 * What each weapon looks like, per target.
 *
 * **Resolution decides, records, and passes; this module reports.** That is decision D2 in doc 19,
 * and it is a structural claim rather than a stylistic one: if the narrator picked the technique
 * *and* the resolver picked the technique, they would be two independent draws that can disagree,
 * with no ground truth anywhere — and a test that commentary never names a technique the resolver
 * did not use becomes literally unwritable. The felt outcome is identical; the difference is that
 * `tests/statistical/commentary-parity.test.ts` can now prove the prose.
 *
 * Which required cleaning these tables, because the old ones could not have passed such a test.
 * The punch list contained *"a knee to the midsection"* and *"a chopping body kick"*, and the kick
 * list contained *"a flying knee to the body"* — so a resolved punch was regularly narrated as a
 * knee, and neither the strike nor the prose was wrong on its own terms. Nothing could tell,
 * because nothing was comparing them.
 */
const VOCABULARY: Readonly<Record<Weapon, Readonly<Record<StrikeTarget, readonly string[]>>>> = {
  punch: {
    head: [
      'a stiff jab',
      'a right hand down the pipe',
      'a short left hook',
      'an overhand right',
      'a check hook',
      'a straight left',
      'a lead uppercut',
      'a blistering 1-2',
    ],
    body: [
      'a hook to the liver',
      'a straight right to the ribs',
      'a short shovel hook to the body',
      'a digging left to the body',
    ],
    // Nobody punches a leg, and `pickShot` will never ask for this — but a total table is worth
    // more than a clever one, and if it ever *is* asked the answer must not be a kick.
    legs: ['a chopping right to the thigh'],
  },
  kick: {
    head: ['a head kick', 'a switch high kick', 'a question-mark kick', 'a spinning back kick'],
    body: ['a body kick', 'a teep to the midsection', 'a roundhouse to the ribs'],
    legs: ['a calf kick', 'a low kick to the thigh', 'an inside leg kick', 'a chopping leg kick'],
  },
  knee: {
    head: ['a knee up the middle', 'a jumping knee to the head'],
    body: ['a knee to the midsection', 'a knee to the ribs in the clinch'],
    legs: ['a knee to the thigh'],
  },
  elbow: {
    head: ['a short elbow', 'a slicing elbow', 'a downward elbow'],
    body: ['an elbow to the ribs'],
    legs: ['an elbow to the thigh'],
  },
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
  weapon: Weapon,
  flushness: number,
): string {
  const move = rng.pick(VOCABULARY[weapon][target]);
  const name = surname(attacker);
  if (flushness >= 2.0) return `${name} lands ${move} — flush, and that hurt.`;
  if (flushness >= 1.3) return `${name} lands ${move} clean.`;
  if (flushness <= 0.4) return `${name} gets ${move} through, but it was partially blocked.`;
  return `${name} lands ${move}.`;
}

export function strikeMissed(
  rng: Rng,
  attacker: Combatant,
  target: StrikeTarget,
  weapon: Weapon,
): string {
  // Takes the weapon, which it never used to. `strikeMissed` was called without `isKick`, so
  // every missed kick in the game was narrated as a missed punch.
  return `${surname(attacker)} ${rng.pick(MISS_VERBS)} ${rng.pick(VOCABULARY[weapon][target])}.`;
}

/**
 * A knee in the clinch.
 *
 * Every clinch strike in the game used to be the same hardcoded sentence, built in `simulate.ts`
 * where no other line lives. It is prose, so it belongs here, and it varies like everything else.
 */
export function clinchStrikeText(rng: Rng, attacker: Combatant, target: StrikeTarget): string {
  return `${surname(attacker)} ${rng.pick(['digs', 'drives', 'thuds'])} ${rng.pick(VOCABULARY.knee[target])} in against the fence.`;
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

/**
 * What each takedown entry looks like, landed and stuffed.
 *
 * The same table shape as `VOCABULARY` and for the same reason. This function used to open with
 * `rng.pick(['a double leg', 'a single leg', 'a body lock', 'a reactive shot', 'a trip'])`, which
 * is D2's defect surviving in the phase D2 never audited: the narrator drew the entry, the
 * resolver knew nothing about it, and so a judoka and a wrestler shot the same five takedowns in
 * the same proportions while a shot taken from inside the clinch could be narrated as a double leg
 * from range. Resolution picks it now (`pickTakedownEntry`) and passes it here.
 */
const TAKEDOWN_VOCABULARY: Readonly<
  Record<TakedownEntry, { readonly landed: readonly string[]; readonly stuffed: readonly string[] }>
> = {
  doubleLeg: {
    landed: ['drops levels and hits a double leg', 'blasts through on a double leg'],
    stuffed: [
      'shoots the double — STUFFED',
      'dives on the double and gets nothing but air',
    ],
  },
  singleLeg: {
    landed: ['gets in deep on a single leg and runs the pipe', 'picks up the single and drives'],
    stuffed: ['gets in on the single but loses the leg', 'reaches for the single and is shrugged off'],
  },
  reactiveShot: {
    landed: [
      'times the shot off the strike beautifully',
      'ducks under the counter and takes the hips',
    ],
    stuffed: ['times the shot badly and eats a sprawl', 'changes levels early and is read'],
  },
  bodyLock: {
    landed: ['locks the body up and walks them down', 'gets the body lock and dumps them'],
    stuffed: ['tries to lock the body but the grip breaks', 'cannot close the body lock'],
  },
  trip: {
    landed: ['hooks the leg and trips them down', 'gets the grip and throws them over the hip'],
    stuffed: ['goes for the trip and cannot get the angle', 'tries the throw and is posted on'],
  },
};

export function takedownText(
  rng: Rng,
  attacker: Combatant,
  position: GroundPosition,
  entry: TakedownEntry,
): string {
  const action = rng.pick(TAKEDOWN_VOCABULARY[entry].landed);
  return `${surname(attacker)} ${action} — down they go, ${surname(attacker)} ${GROUND_POSITION_NAMES[position]}.`;
}

export function takedownStuffedText(
  rng: Rng,
  attacker: Combatant,
  defender: Combatant,
  entry: TakedownEntry,
): string {
  const action = rng.pick(TAKEDOWN_VOCABULARY[entry].stuffed);
  return rng.pick([
    `${surname(attacker)} ${action}. ${surname(defender)} sprawls and circles off.`,
    `${surname(attacker)} ${action} — ${surname(defender)} defends it and resets.`,
    `${surname(attacker)} ${action}, and ${surname(defender)} breaks free.`,
  ]);
}

export function clinchText(rng: Rng, attacker: Combatant): string {
  return rng.pick([
    `${surname(attacker)} closes the distance and gets the clinch against the fence.`,
    `${surname(attacker)} ties up and starts working on the body in the clinch.`,
    `${surname(attacker)} forces the tie-up and walks them back to the cage.`,
  ]);
}

/**
 * The tie-up changes hands.
 *
 * New with the two-sided clinch (docs/19 §13.6): before it, control could only be won on entry and
 * lost by the fight leaving the position, so there was no such moment to narrate.
 */
export function clinchReversalText(rng: Rng, attacker: Combatant, defender: Combatant): string {
  return rng.pick([
    `${surname(attacker)} switches the underhook and turns ${surname(defender)} into the fence.`,
    `${surname(attacker)} fights the grip, gets the angle, and now it is ${surname(defender)} with their back to the cage.`,
    `Reversed — ${surname(attacker)} takes over in the tie-up.`,
  ]);
}

/** The referee separating a clinch nobody is working in. */
export function clinchSeparationText(): string {
  return 'The referee has seen enough of that — they are separated and brought back to the centre.';
}

/** How each range reads in the play-by-play. */
const RANGE_NAMES: Readonly<Record<Range, string>> = {
  outside: 'kicking range',
  boxing: 'boxing range',
  pocket: 'the pocket',
};

export function clinchBreakText(rng: Rng, defender: Combatant): string {
  return rng.pick([
    `${surname(defender)} frames off and circles back out to open space.`,
    `${surname(defender)} gets the underhook and breaks away.`,
    `They separate — back to distance.`,
  ]);
}

/**
 * Somebody has changed the distance, and it is said out loud.
 *
 * A mechanic the player cannot see is a number, not a mechanic — and range is the one they most
 * need to see, because it is how you tell a fighter who *chose* to trade in the pocket from one
 * who was walked into it and could not get out. The post-fight range breakdown answers the same
 * question in aggregate; this is what makes the fight itself legible while it happens.
 */
export function rangeChangeText(
  rng: Rng,
  mover: Combatant,
  other: Combatant,
  change: 'close' | 'retreat',
  to: Range,
): string {
  if (change === 'close') {
    return rng.pick([
      `${surname(mover)} closes the gap — ${RANGE_NAMES[to]} now.`,
      `${surname(mover)} walks through the jab and gets inside. ${RANGE_NAMES[to]}.`,
      `${surname(mover)} steps in on ${surname(other)}, cutting the distance to ${RANGE_NAMES[to]}.`,
    ]);
  }
  return rng.pick([
    `${surname(mover)} circles off and resets to ${RANGE_NAMES[to]}.`,
    `${surname(mover)} steps back out — he wants no part of that exchange. ${RANGE_NAMES[to]}.`,
    `${surname(mover)} pivots away from ${surname(other)} and re-establishes ${RANGE_NAMES[to]}.`,
  ]);
}

/** The entry or the exit that did not come off, and what it cost. */
export function rangeFailText(
  rng: Rng,
  mover: Combatant,
  other: Combatant,
  change: 'close' | 'retreat',
): string {
  if (change === 'close') {
    return rng.pick([
      `${surname(mover)} tries to march in and eats a shot on the way.`,
      `${surname(other)} times ${surname(mover)}'s entry and makes him pay for it.`,
      `${surname(mover)} can't find a way inside — ${surname(other)} keeps him on the end of it.`,
    ]);
  }
  return rng.pick([
    `${surname(mover)} wants out and ${surname(other)} will not let him go.`,
    `${surname(mover)} tries to step off; ${surname(other)} stays glued to him.`,
    `No escape — ${surname(other)} cuts the angle off and keeps him there.`,
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

export function groundStrikesText(
  rng: Rng,
  attacker: Combatant,
  heavy: boolean,
  landedElbow = false,
): string {
  /*
   * One line summarises a burst of up to four shots, which is why this is the one strike line
   * that does not name a specific technique — it is a claim about a sequence rather than about a
   * strike. But it is still *told*: the old list offered "works elbows from the top" at random,
   * on a branch that had never resolved an elbow in its life, and now the elbow is only mentioned
   * when an elbow actually landed. Without that, elbows would be invisible to the player, and a
   * distinction the prose cannot carry does not exist for them (doc 18 §4.6).
   */
  if (heavy) {
    return landedElbow
      ? `${surname(attacker)} is dropping elbows from the top — the referee is watching closely.`
      : `${surname(attacker)} is landing heavy ground-and-pound — the referee is watching closely.`;
  }
  if (landedElbow) {
    return rng.pick([
      `${surname(attacker)} works short elbows from the top.`,
      `${surname(attacker)} posts up and slices an elbow down.`,
    ]);
  }
  return rng.pick([
    `${surname(attacker)} postures up and lands short shots.`,
    `${surname(attacker)} keeps busy from the top, working to the body and head.`,
    `${surname(attacker)} stays heavy and picks his shots from above.`,
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
