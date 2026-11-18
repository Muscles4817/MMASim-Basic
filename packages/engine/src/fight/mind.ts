/**
 * The fighter's head: reading the man in front of him, and changing what he does about it.
 *
 * Doc 36 phases 2 and 4. Everything here reads `memory.ts` and writes back into it; the simulator
 * asks it questions at the moment of choosing or defending.
 *
 * Three abilities, and each belongs to a different part of the fighter:
 *
 *  - **Reading** (`fightIq`). Seeing the opponent's pattern and defending it a little better each
 *    time it comes. Built gradually, never as large as a drilled camp read (`PREP_MAX_BONUS`), and a
 *    dull fighter barely builds one at all.
 *  - **Adjusting** (`fightIq`, slowed by `ego`, held by `discipline`). Doing less of what keeps
 *    failing and more of what works — the in-cage half of what a corner does between rounds.
 *  - **Keeping his head** (`composure`). Decision quality under pressure lives here; physical output
 *    under pressure lives where it always did.
 */

import { clamp01, remap } from '../core/math.js';
import type { Combatant } from './profile.js';
import type { ComboKey } from './style.js';
import type { Family } from './memory.js';

/** How much defensive edge a fully-formed in-fight read is worth. About half a drilled camp read. */
export const IN_FIGHT_READ_MAX = 0.2;

/** How familiar this defender is with this combination, 0–1, given his ability to learn it. */
export function patternFamiliarity(defender: Combatant, pattern: ComboKey): number {
  const seen = defender.mem.patternsSeen[pattern];
  if (seen <= 0) return 0;
  const learn = remap(defender.attrs.fightIq, 30, 95, 0.15, 1);
  return clamp01((1 - Math.exp(-seen / 5)) * learn);
}

export function notePattern(actor: Combatant, defender: Combatant, pattern: ComboKey): void {
  void actor;
  defender.mem.patternsSeen[pattern]++;
}

/** The defensive bonus this fighter has earned tonight against a family of attack. */
export function inFightRead(defender: Combatant, family: Family): number {
  return defender.mem.read[family] * IN_FIGHT_READ_MAX;
}

