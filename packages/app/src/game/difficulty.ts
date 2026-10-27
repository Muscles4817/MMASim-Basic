/**
 * The difficulty dials a promoter save runs at. Doc 34 B6.
 *
 * Three, each a real lever rather than a label: how hard fighters push their money up, how hard
 * rivals come for your fighters, and how long an owner waits for results. Read from the save
 * (`WorldMeta.promoterSetup`), so a save made before they existed runs at normal, as it always
 * did. Kept free of other game imports so anything can read a dial without a cycle.
 */

import { getWorld, type DifficultyLevel, type GameDb, type PromoterSetup } from '@mmasim/data';

export const DIFFICULTY_LEVELS: readonly { id: DifficultyLevel; label: string }[] = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

const DEFAULTS: Omit<PromoterSetup, 'scenario'> = {
  purseInflation: 'normal',
  rivalAggression: 'normal',
  ownerPatience: 'normal',
};

const setupOf = (db: GameDb): Omit<PromoterSetup, 'scenario'> =>
  getWorld(db).promoterSetup ?? DEFAULTS;

/**
 * How much more a fighter asks when they counter, as a multiplier on what they would have asked.
 * Gentle fighters take a little less; hard ones want a fifth more.
 */
export function purseInflation(db: GameDb): number {
  return { gentle: 0.9, normal: 1, hard: 1.2 }[setupOf(db).purseInflation];
}

/**
 * How early rivals start bidding on a fighter whose deal is running down, as a multiplier on the
 * normal window. Gentle rivals turn up late; hard ones circle half as long again.
 */
export function rivalAggression(db: GameDb): number {
  return { gentle: 0.5, normal: 1, hard: 1.5 }[setupOf(db).rivalAggression];
}

/**
 * How long an owner waits for results, as a multiplier on B2's tolerance. B2's owner (#60) reads
 * this when it lands; nothing else does yet, and it is the hook rather than a stand-in.
 */
export function ownerPatience(db: GameDb): number {
  return { gentle: 1.4, normal: 1, hard: 0.7 }[setupOf(db).ownerPatience];
}
