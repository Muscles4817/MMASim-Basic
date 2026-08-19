/**
 * How a fighter tends to decide, in the promoter's language.
 *
 * Traits are mechanical hooks and personality axes are hidden numbers, and neither of them
 * answers the question a promoter has when an offer is about to go out: *how is this person
 * likely to take it*. The fighter screen was showing trait blurbs written as though they were
 * simulation rules — "beats everyone below them and loses to everyone above, never changes" —
 * which is both untrue of the model and the wrong register. A promoter does not read rules, they
 * read a person, and the read is a tendency rather than a guarantee.
 *
 * So dispositions are **emergent, not stored**. Nothing anywhere sets "Money Motivated"; it is
 * what low loyalty and low ambition look like from the outside, and the same fighter's read
 * changes as the simulation moves them. That is the whole design rule from doc 13: the UX should
 * recognise an identity the world produced, not hand one out and then argue with the results.
 *
 * Every line here is hedged on purpose — "more willing", "prefers", "tends to". A player who can
 * read a fighter's answer off their profile is not making a decision when they offer them a
 * fight.
 */

import type { Fighter } from './fighter.js';
import type { Personality } from './personality.js';

export type DispositionId =
  | 'moneyMotivated'
  | 'legacyDriven'
  | 'independent'
  | 'coachable'
  | 'riskTaker'
  | 'protectiveOfRecord'
  | 'loyal'
  | 'unreliable'
  | 'promotable'
  | 'quiet';

export interface Disposition {
  id: DispositionId;
  label: string;
  /** A tendency, never a rule. Read by the fighter screen and the offer screen. */
  blurb: string;
  /** 0–1. How strongly this reads. Only the strongest few are shown. */
  strength: number;
}

/** Distance above a threshold, normalised — how *loudly* an axis is speaking. */
const above = (value: number, at: number): number => Math.max(0, (value - at) / (100 - at));
const below = (value: number, at: number): number => Math.max(0, (at - value) / at);

/**
 * Read a fighter's decision-making tendencies.
 *
 * Returns the strongest few, loudest first. Deliberately capped: eight hedged sentences is a
 * personality test, and the point is the two or three things that would actually change how you
 * approach them.
 */
export function dispositionsOf(fighter: Fighter, limit = 3): Disposition[] {
  const p: Personality = fighter.personality;
  const out: Disposition[] = [];

  const push = (id: DispositionId, label: string, blurb: string, strength: number) => {
    if (strength > 0.18) out.push({ id, label, blurb, strength });
  };

  push(
    'moneyMotivated',
    'Money Motivated',
    'Financial terms weigh more heavily than loyalty or prestige when they assess an offer.',
    (below(p.loyalty, 45) + below(p.ambition, 50)) / 2,
  );

  push(
    'legacyDriven',
    'Legacy Driven',
    'Tends to value rankings, belts and meaningful opponents over the easier money.',
    above(p.ambition, 62),
  );

  push(
    'independent',
    'Independent',
    'Less receptive to instruction. The corner’s plan is one input among several.',
    above(p.ego, 65),
  );

  push(
    'coachable',
    'Coachable',
    'Takes direction well and generally fights the fight they were asked to fight.',
    below(p.ego, 35),
  );

  push(
    'riskTaker',
    'Risk Taker',
    'More willing than most to take a dangerous opponent, or to take one at short notice.',
    (above(p.aggression, 60) + above(p.ambition, 55)) / 2,
  );

  push(
    'protectiveOfRecord',
    'Protective of Record',
    'Prefers lower-risk matchmaking and may push back on a significant step up.',
    (below(p.aggression, 40) + below(p.ambition, 45)) / 2,
  );

  push(
    'loyal',
    'Loyal',
    'Inclined to stay where they are, and cheaper to re-sign than the market would suggest.',
    above(p.loyalty, 68),
  );

  push(
    'unreliable',
    'Unreliable',
    'More likely than most to miss weight, miss a camp, or become somebody’s problem.',
    below(p.professionalism, 38),
  );

  push(
    'promotable',
    'Promotable',
    'Sells a fight. Puts more on the gate than their record on its own would.',
    above(p.charisma, 66),
  );

  push(
    'quiet',
    'Quiet',
    'Says little and sells little. What they are worth is whatever happens in the cage.',
    below(p.charisma, 30),
  );

  return out.sort((a, b) => b.strength - a.strength).slice(0, limit);
}

/**
 * What this fighter wants next, in one line.
 *
 * The promoter status block's most-read field, and until now the game had no answer to it at
 * all — the information existed as ambition, a rank and a streak, and nobody had joined them up.
 */
export type FighterWant =
  'titleShot' | 'rankedOpponent' | 'activity' | 'money' | 'anyWin' | 'stayBusy';

export interface WantRead {
  id: FighterWant;
  label: string;
  detail: string;
}

export function wantsOf(input: {
  fighter: Fighter;
  day: number;
  /** 0 champion, 1..n ranked, undefined unranked. */
  rank?: number;
  daysIdle: number;
  /** True when they are being paid well below their worth. */
  aggrieved?: boolean;
}): WantRead {
  const { fighter, rank, daysIdle, aggrieved = false } = input;
  const streak = fighter.summary.streak;
  const ambitious = fighter.personality.ambition >= 55;

  if (rank !== undefined && rank > 0 && rank <= 3 && streak >= 2 && ambitious) {
    return {
      id: 'titleShot',
      label: 'A title shot',
      detail: `Ranked #${rank} on a ${streak}-fight run, and they know what that usually buys.`,
    };
  }

  if (aggrieved || fighter.resentment > 55) {
    return {
      id: 'money',
      label: 'More money',
      detail:
        'They believe the deal has stopped matching the fighter, and they are not quiet about it.',
    };
  }

  if (daysIdle > 240) {
    return {
      id: 'activity',
      label: 'To be booked',
      detail: `Nothing for ${Math.round(daysIdle / 30)} months. Every week off costs them.`,
    };
  }

  if (streak <= -2) {
    return {
      id: 'anyWin',
      label: 'A win they can get',
      detail: 'On a bad run. A hard fight now probably ends them here.',
    };
  }

  if (rank !== undefined && streak >= 1 && ambitious) {
    return {
      id: 'rankedOpponent',
      label: 'Somebody ranked',
      detail: 'Winning is not enough any more — they want opponents who move them up.',
    };
  }

  return {
    id: 'stayBusy',
    label: 'To stay busy',
    detail: 'No particular demands. Give them a date and they will take it.',
  };
}
