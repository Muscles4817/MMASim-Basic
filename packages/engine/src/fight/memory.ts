/**
 * What a fighter remembers about the fight so far.
 *
 * The audit's central finding was that the engine had no memory: every exchange re-drew who acted
 * and what they did, so nothing that happened earlier could change what a fighter *chose* next —
 * no chain wrestling, no setups, no reads, no adjustments (docs/reviews/19, "Verdict"). This is the
 * record that makes all of those expressible.
 *
 * Three things, and they answer three different questions:
 *
 *  - **ledger** (`tried` / `landed`, per fight and per round) — *what is working for me?* Read by
 *    the fighter's own adjustments and by the corner between rounds.
 *  - **seen** — *what does he keep doing?* The opponent's attempts and successes, from this
 *    fighter's side. Read by in-fight reads: a smart fighter defends better against a pattern.
 *  - **last** — *what just happened?* The one beat of context that sequencing needs: a stuffed shot
 *    to chain off, a body shot that dropped the guard, a failed armbar to flow into the triangle.
 *
 * Allocated once per fighter per fight and mutated in place, like the rest of `Combatant` — the
 * fight loop does not allocate.
 *
 * Doc 36 phase 1.
 */

import type { StrikeTarget, Weapon } from './types.js';
import type { SubmissionKey } from './submissions.js';
import { COMBO_KEYS, type ComboKey } from './style.js';

export const FAMILIES = [
  'punch',
  'kick',
  'takedown',
  'clinchEntry',
  'clinchStrike',
  'groundStrike',
  'submission',
  'pass',
  'escape',
  'rangeClose',
  'rangeRetreat',
] as const;
export type Family = (typeof FAMILIES)[number];

export type FamilyCounts = Record<Family, number>;

export function emptyCounts(): FamilyCounts {
  return {
    punch: 0,
    kick: 0,
    takedown: 0,
    clinchEntry: 0,
    clinchStrike: 0,
    groundStrike: 0,
    submission: 0,
    pass: 0,
    escape: 0,
    rangeClose: 0,
    rangeRetreat: 0,
  };
}

export interface LastBeat {
  family: Family | undefined;
  landed: boolean;
  target: StrikeTarget | undefined;
  weapon: Weapon | undefined;
  /** Fight clock in absolute seconds (round offset included) when it happened. */
  at: number;
}

export interface FightMemory {
  tried: FamilyCounts;
  landed: FamilyCounts;
  roundTried: FamilyCounts;
  roundLanded: FamilyCounts;
  /** The opponent's attempts, seen from this side. */
  seen: FamilyCounts;
  /** The opponent's successes against this fighter. */
  seenLanded: FamilyCounts;
  /**
   * 0–1 per family: how well this fighter has the opponent's pattern read. Built during the fight
   * by `mind.ts`; applied as a defensive bonus exactly like a prepared camp read, but earned.
   */
  read: FamilyCounts;
  /**
   * Multipliers on this fighter's own intent per family, set by in-fight learning and the corner.
   * 1 is "as planned". Doc 36 phase 4.
   */
  lean: FamilyCounts;
  last: LastBeat;
  /** A submission that just failed, to chain off. Cleared once used or once position changes. */
  lastSubFailed: SubmissionKey | undefined;
  /** Consecutive linked wrestling attempts in the current chain. */
  chainDepth: number;
  /** How many times the opponent has thrown each combination pattern at this fighter. */
  patternsSeen: Record<ComboKey, number>;
}

export function createMemory(): FightMemory {
  const lean = emptyCounts();
  for (const k of FAMILIES) lean[k] = 1;
  return {
    tried: emptyCounts(),
    landed: emptyCounts(),
    roundTried: emptyCounts(),
    roundLanded: emptyCounts(),
    seen: emptyCounts(),
    seenLanded: emptyCounts(),
    read: emptyCounts(),
    lean,
    last: { family: undefined, landed: false, target: undefined, weapon: undefined, at: -1 },
    lastSubFailed: undefined,
    chainDepth: 0,
    patternsSeen: Object.fromEntries(COMBO_KEYS.map((k) => [k, 0])) as Record<ComboKey, number>,
  };
}

/** Anything with a memory. Structural so this module need not import `Combatant`. */
export interface Remembers {
  mem: FightMemory;
}

/**
 * Write one attempt into both fighters' memories.
 *
 * `at` is the absolute fight clock. Strike families are recorded per shot; everything else per
 * attempt.
 */
export function remember(
  actor: Remembers,
  other: Remembers,
  family: Family,
  landed: boolean,
  at: number,
  target?: StrikeTarget,
  weapon?: Weapon,
): void {
  const m = actor.mem;
  m.tried[family]++;
  m.roundTried[family]++;
  if (landed) {
    m.landed[family]++;
    m.roundLanded[family]++;
  }
  const last = m.last;
  last.family = family;
  last.landed = landed;
  last.target = target;
  last.weapon = weapon;
  last.at = at;

  const o = other.mem;
  o.seen[family]++;
  if (landed) o.seenLanded[family]++;
}

/** Start of a round: the per-round ledger empties, nothing else does. */
export function resetRoundMemory(c: Remembers): void {
  const m = c.mem;
  for (const k of FAMILIES) {
    m.roundTried[k] = 0;
    m.roundLanded[k] = 0;
  }
  m.chainDepth = 0;
  m.lastSubFailed = undefined;
  m.last.family = undefined;
}

/** Success rate in a family with a weak prior, so two attempts do not read as a verdict. */
export function successRate(m: FightMemory, family: Family, prior = 0.4, weight = 3): number {
  return (m.landed[family] + prior * weight) / (m.tried[family] + weight);
}
