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

import { fighterAge, type Fighter } from './fighter.js';
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
  | 'titleShot'
  | 'worthyChallenger'
  | 'superfight'
  | 'rankedOpponent'
  | 'rematch'
  | 'activity'
  | 'money'
  | 'moneyFight'
  | 'oneLastRun'
  | 'anyWin'
  | 'stayBusy';

export interface WantRead {
  id: FighterWant;
  label: string;
  detail: string;
  /** For a rematch: who with. */
  opponentId?: Fighter['id'];
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

  /*
   * A rematch, after a loss they do not accept — close on the cards, and a fighter resilient and
   * ambitious enough to want it back rather than to move on.
   */
  const last = fighter.record[fighter.record.length - 1];
  if (
    last?.outcome === 'loss' &&
    (last.method === 'decisionSplit' || last.method === 'decisionMajority') &&
    fighter.personality.resilience >= 55 &&
    ambitious
  ) {
    return {
      id: 'rematch',
      label: 'The rematch',
      detail: 'Lost a close one and does not accept it. Wants it run back.',
      opponentId: last.opponentId,
    };
  }

  if (daysIdle > 240) {
    return {
      id: 'activity',
      label: 'To be booked',
      detail: `Nothing for ${Math.round(daysIdle / 30)} months. Every week off costs them.`,
    };
  }

  // Late in a career, with the hunger still there: the big fights, before it is over.
  if (
    fighterAge(fighter, input.day) >= 34 &&
    fighter.summary.wins + fighter.summary.losses >= 15 &&
    fighter.personality.ambition >= 50
  ) {
    return {
      id: 'oneLastRun',
      label: 'One last run',
      detail:
        'Knows the window is closing. Wants meaningful fights now, not another year of maybes.',
    };
  }

  /*
   * A payday: somebody with a name and a reason to cash it — the bank is empty, or money is
   * simply what they fight for.
   */
  if (fighter.starPower >= 45 && (fighter.bank < 0 || fighter.personality.loyalty < 35)) {
    return {
      id: 'moneyFight',
      label: 'A money fight',
      detail: 'Has a name worth cashing. Wants the fight that pays, more than the one that ranks.',
    };
  }

  if (streak <= -2) {
    return {
      id: 'anyWin',
      label: 'A win they can get',
      detail: 'On a bad run. A hard fight now probably ends them here.',
    };
  }

  /*
   * A champion is rank 0, and rank 0 used to fall through every branch above to "Somebody ranked" —
   * telling the promoter the best fighter in the division wanted to fight his way up it. What a
   * champion wants is a defence that means something, and the ambitious ones want it loudly.
   */
  if (rank === 0 && ambitious && fighter.personality.ambition >= 70 && fighter.starPower >= 55) {
    return {
      id: 'superfight',
      label: 'A superfight',
      detail:
        'Has the belt and the name, and wants the fight that is bigger than the division — another champion, or a move up.',
    };
  }

  if (rank === 0) {
    return {
      id: 'worthyChallenger',
      label: 'A worthy challenger',
      detail: ambitious
        ? 'Holds the belt and wants the defence that proves it — not a payday against a name nobody knows.'
        : 'Holds the belt. Wants defences that are worth the risk and paid like it.',
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

/**
 * Whether an offered fight gives a fighter what they want. Undefined when the want says nothing
 * about this fight either way.
 *
 * `acceptanceOf` reads this, so a fighter who wants a title shot is keener on the title fight and
 * cooler on anything else — which is what makes the want a thing to manage rather than a label.
 */
export function wantMet(
  want: WantRead,
  offer: {
    opponent: Pick<Fighter, 'id' | 'starPower'>;
    isTitleFight?: boolean;
    /** The opponent's rank in this promotion's division, when they have one. */
    opponentRank?: number;
    /** Positive when the opponent is the better fighter. */
    step: number;
  },
): boolean | undefined {
  const { opponent, isTitleFight = false, opponentRank, step } = offer;
  switch (want.id) {
    case 'titleShot':
    case 'worthyChallenger':
      return isTitleFight;
    case 'superfight':
      return isTitleFight || opponent.starPower >= 60;
    case 'rematch':
      return opponent.id === want.opponentId;
    case 'rankedOpponent':
      return opponentRank !== undefined && opponentRank <= 15;
    case 'moneyFight':
      return opponent.starPower >= 45 || isTitleFight;
    case 'oneLastRun':
      return isTitleFight || opponentRank !== undefined || opponent.starPower >= 45;
    case 'anyWin':
      return step <= 2;
    case 'activity':
      return true;
    default:
      return undefined;
  }
}
