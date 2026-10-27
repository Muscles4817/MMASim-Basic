/**
 * The scales, the day before. Doc 34 C6.
 *
 * Missing weight existed for the player's own fighter in fighter mode (`career.ts`) and nowhere
 * else: a promoter's card never had a fighter come in heavy, so the decision every promoter in the
 * sport actually faces in fight week — go ahead at a catchweight, or pull the bout — never came
 * up. This is the roll and the parts of the decision that are rules. When the roll happens and who
 * decides is the app's business (`rollWeighIns` / `resolveMissedWeight` in `plans.ts`), and A5's
 * fight-week screen wraps the decision.
 *
 * Pure: the caller passes the stream.
 */

import { clamp01 } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { DivisionId, FighterId } from '../core/ids.js';
import { getDivision } from '../domain/divisions.js';
import type { Fighter } from '../domain/fighter.js';
import { bodyOf } from '../progression/body.js';
import { cutSeverityOf, weightMissRisk } from '../progression/divisionMove.js';
import { weightMissForfeit } from './money.js';

/** Pounds over the limit past which a miss is egregious, and the forfeit rises. */
export const EGREGIOUS_MISS_LBS = 3;

export interface WeighInResult {
  fighterId: FighterId;
  made: boolean;
  limitLbs: number;
  /** How far over, when they missed. One decimal place, as a commission reads the scale. */
  overLbs?: number;
  /** More than `EGREGIOUS_MISS_LBS` over. */
  egregious: boolean;
  /** Thousands, from their show purse to the opponent. Zero when they made it. */
  forfeit: number;
}

/**
 * Step on the scale.
 *
 * How far over follows how hard the cut was: a fighter a whisker from the limit misses by a pound,
 * and one whose body never belonged at the weight misses by several.
 */
export function rollWeighIn(input: {
  fighter: Pick<Fighter, 'id' | 'personality' | 'traits'> & Parameters<typeof bodyOf>[0];
  divisionId: DivisionId;
  /** Thousands. */
  showPurse: number;
  rng: Rng;
  cutPenalty?: number;
}): WeighInResult {
  const { fighter, divisionId, showPurse, rng, cutPenalty } = input;
  const limitLbs = getDivision(divisionId).limitLbs;
  const risk = weightMissRisk(fighter, divisionId, cutPenalty);
  if (!rng.chance(risk)) {
    return { fighterId: fighter.id, made: true, limitLbs, egregious: false, forfeit: 0 };
  }
  const severity = cutSeverityOf(bodyOf(fighter), divisionId);
  const overLbs = Math.round(rng.range(0.4, 1.2 + 4 * clamp01(severity)) * 10) / 10;
  const egregious = overLbs > EGREGIOUS_MISS_LBS;
  return {
    fighterId: fighter.id,
    made: false,
    limitLbs,
    overLbs,
    egregious,
    forfeit: weightMissForfeit(showPurse, egregious),
  };
}

export type WeighInChoice = 'catchweight' | 'cancel';

/**
 * Whether the opponent who made weight will still fight somebody heavier.
 *
 * Most do, because they cut for this and the forfeit is theirs. The proud refuse a big miss, the
 * cautious refuse a body that is already bigger than theirs, and nobody takes an egregious miss
 * lightly.
 */
export function opponentTakesCatchweight(input: {
  opponent: Pick<Fighter, 'personality'>;
  missed: WeighInResult;
  rng: Rng;
}): boolean {
  const { opponent, missed, rng } = input;
  const over = missed.overLbs ?? 0;
  const p = opponent.personality;
  const chance = clamp01(
    0.92 -
      over * 0.07 -
      (missed.egregious ? 0.2 : 0) -
      Math.max(0, p.ego - 60) / 200 +
      Math.max(0, p.aggression - 50) / 250,
  );
  return rng.chance(chance);
}

/** The catchweight a bout goes ahead at: the heavier fighter's scale weight, rounded up. */
export function catchweightFor(results: readonly WeighInResult[]): number | undefined {
  const misses = results.filter((r) => !r.made);
  if (misses.length === 0) return undefined;
  return Math.ceil(Math.max(...misses.map((r) => r.limitLbs + (r.overLbs ?? 0))));
}

/** What a promoter is told, in a line. */
export function describeMiss(name: string, result: WeighInResult): string {
  if (result.made) return `${name} made weight.`;
  return `${name} missed weight by ${result.overLbs} lb${result.egregious ? ' — a long way over' : ''}.`;
}
