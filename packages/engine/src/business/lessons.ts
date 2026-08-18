/**
 * What a fight told a fighter about themselves.
 *
 * The argument is docs/25 §2.4, and it is a claim about what a fight actually does. Being
 * outwrestled for fifteen minutes does not make anybody better at wrestling. It tells them —
 * loudly, expensively, in front of everybody — that their wrestling is the thing costing them
 * fights. The improvement comes from the camp that follows, and it comes because the fight said
 * where to point it.
 *
 * So a fight grants **direction**, not points, and this module is where the direction is read.
 * The signal is already recorded in full: `FightStats` carries takedowns, control time,
 * submission attempts, strikes and knockdowns for both corners, so the game can say truthfully
 * and specifically that he took you down nine times and held you there for eleven minutes.
 *
 * Two things it deliberately does not do. It does not fire on every fight — a bout in which
 * nothing was clearly exposed teaches nothing, and a lesson attached to every result is noise
 * rather than information. And it does not care who won: you can win a decision having been put
 * on your back six times, and that is still the thing to go and fix.
 */

import type { AttributeKey } from '../ratings/attributes.js';
import type { DamageReport, FightStats } from '../fight/types.js';
import type { FinishMethod } from '../domain/fighter.js';

/** Reference fight length, in seconds: three five-minute rounds. */
const FULL_FIGHT_SECONDS = 900;

/**
 * The shortest fight that can teach anything.
 *
 * A first-round blowout exposes nothing you could act on — it says the other man landed
 * something, not that you have a hole in your wrestling. Below this the answer is always
 * `undefined`, whatever the rates happen to work out to on a tiny denominator.
 */
const MIN_SECONDS_FOR_A_LESSON = 150;

export interface LessonInput {
  /** This fighter's own output. */
  mine: FightStats;
  /** What the opponent did to them. */
  theirs: FightStats;
  /** What this fighter took. */
  damage: DamageReport;
  method: FinishMethod;
  /** True when this fighter lost. A finish against you is a louder signal than a bad round. */
  lost: boolean;
  secondsFought: number;
}

interface Candidate {
  key: AttributeKey;
  /** How far past the threshold this signal is. Below 1 it is not a lesson. */
  score: number;
  /** What the camp report says about it. Written from the fighter's point of view. */
  note: string;
}

/**
 * The hole this fight exposed, or `undefined` when it exposed nothing clearly.
 *
 * Every candidate is scored as a **ratio to its own threshold**, which is what makes six
 * takedowns and four hundred absorbed strikes comparable at all. The highest ratio wins and has
 * to clear 1, so a clean night returns nothing.
 */
export function lessonFrom(input: LessonInput): { key: AttributeKey; note: string } | undefined {
  const { mine, theirs, damage, secondsFought } = input;
  if (secondsFought < MIN_SECONDS_FOR_A_LESSON) return undefined;

  // Everything below is expressed per full fight, so a five-round war and a short one are
  // measured on the same scale rather than the longer fight always looking worse.
  const per = FULL_FIGHT_SECONDS / secondsFought;
  const floorControl = Math.max(0, theirs.controlSeconds - theirs.clinchControlSeconds);
  const finishedByStrikes = input.lost && damage.wasFinishedByStrikes;
  const submitted = input.lost && input.method === 'submission';

  const candidates: Candidate[] = [
    {
      key: 'takedownDefence',
      // Three clean takedowns in a fight is a night spent on your back.
      score: (theirs.takedownsLanded * per) / 3,
      note: 'They put him on his back at will. The sprawl is the problem.',
    },
    {
      key: 'scrambling',
      // Five minutes held on the floor: the takedown was not the issue, getting up was.
      score: (floorControl * per) / 300,
      note: 'Once he was down he stayed down. Getting back up is the hole.',
    },
    {
      key: 'submissions',
      score: Math.max((theirs.submissionAttempts * per) / 3, submitted ? 1.6 : 0),
      note: 'He was in trouble on the floor and had no answer for it.',
    },
    {
      key: 'strikingDefence',
      score: Math.max(
        (theirs.significantStrikesLanded * per) / 75,
        damage.knockdownsSuffered * 0.7,
        finishedByStrikes ? 1.7 : 0,
      ),
      note: 'He was there to be hit all night. The defence has to come first.',
    },
    {
      key: 'wrestling',
      // Shooting repeatedly and getting nowhere is its own lesson, and an offensive one.
      score:
        mine.takedownsAttempted * per >= 4 &&
        mine.takedownsLanded / Math.max(1, mine.takedownsAttempted) < 0.25
          ? (mine.takedownsAttempted * per) / 4
          : 0,
      note: 'He kept shooting and kept coming up with nothing.',
    },
    {
      key: 'strikingOffence',
      score:
        mine.significantStrikesAttempted * per >= 40 &&
        mine.significantStrikesLanded / Math.max(1, mine.significantStrikesAttempted) < 0.28
          ? (mine.significantStrikesAttempted * per) / 40
          : 0,
      note: 'He threw plenty and hit nothing. That is technique, not volume.',
    },
  ];

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  return best.score >= 1 ? { key: best.key, note: best.note } : undefined;
}
