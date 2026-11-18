/**
 * What a landed strike does to the fight beyond the damage number: the body shot that folds him,
 * the leg that will not hold him up, the hand that breaks on a skull. Doc 36 phase 3.
 */

import type { StrikeOutcome } from './damage.js';
import type { Combatant } from './profile.js';
import type { StrikeTarget, Weapon } from './types.js';

export interface StoryContext {
  round: number;
}

/** Returns a finish when the story ends the fight; otherwise mutates the fighters and returns nothing. */
export function afterStrikeStory(
  ctx: StoryContext,
  actor: Combatant,
  target: Combatant,
  strikeTarget: StrikeTarget,
  weapon: Weapon,
  result: StrikeOutcome,
): 'tko' | undefined {
  void ctx;
  void actor;
  void target;
  void strikeTarget;
  void weapon;
  void result;
  return undefined;
}
