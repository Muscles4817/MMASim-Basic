/**
 * Referees and judges.
 *
 * Officials are people, not constants. The assigned referee is visible before a bout and
 * materially changes what kind of fight it is; the three judges have independent bias
 * vectors, which is how the same fight data produces a genuine split decision.
 */

import type { OfficialId } from '../core/ids.js';
import { clamp } from '../core/math.js';

export interface Referee {
  id: OfficialId;
  name: string;
  /**
   * 1–100. How quickly they save a hurt fighter. Low saves careers and produces "he was
   * still in it!" complaints; high produces highlight reels and long-term damage.
   */
  stoppageTrigger: number;
  /** 1–100. How fast they stand up a stalled ground position. */
  standUpSpeed: number;
  /** 1–100. Tolerance for eye pokes, fence grabs, low blows. Low = quick to deduct. */
  foulTolerance: number;
  /** Short characterisation shown on the fight card. */
  reputation: string;
}

/** What a judge rewards. Weights over the five scoring inputs; normalised on use. */
export interface JudgeBias {
  damage: number;
  significantStrikes: number;
  controlTime: number;
  grappling: number;
  aggression: number;
}

export interface Judge {
  id: OfficialId;
  name: string;
  bias: JudgeBias;
  /**
   * 1–100. How reliably they apply their own criteria. Low means noisy cards — the
   * mechanism behind scores nobody can explain.
   */
  consistency: number;
}

export const JUDGE_ARCHETYPES: Readonly<Record<string, JudgeBias>> = {
  /** Rewards the fighter who did the visible harm. */
  damageFirst: {
    damage: 0.5,
    significantStrikes: 0.2,
    controlTime: 0.1,
    grappling: 0.15,
    aggression: 0.05,
  },
  /** Rewards positional dominance. Wrestlers love this judge. */
  controlFirst: {
    damage: 0.25,
    significantStrikes: 0.15,
    controlTime: 0.35,
    grappling: 0.2,
    aggression: 0.05,
  },
  /** Counts things. Volume strikers love this judge. */
  volumeFirst: {
    damage: 0.25,
    significantStrikes: 0.4,
    controlTime: 0.1,
    grappling: 0.15,
    aggression: 0.1,
  },
  /** Balanced, and rarer than it should be. */
  balanced: {
    damage: 0.34,
    significantStrikes: 0.24,
    controlTime: 0.18,
    grappling: 0.18,
    aggression: 0.06,
  },
  /** Rewards forward pressure almost irrespective of what it achieves. */
  aggressionFirst: {
    damage: 0.28,
    significantStrikes: 0.22,
    controlTime: 0.12,
    grappling: 0.13,
    aggression: 0.25,
  },
};

export function normaliseBias(bias: JudgeBias): JudgeBias {
  const total =
    bias.damage + bias.significantStrikes + bias.controlTime + bias.grappling + bias.aggression;
  if (total <= 0) return JUDGE_ARCHETYPES.balanced!;
  return {
    damage: bias.damage / total,
    significantStrikes: bias.significantStrikes / total,
    controlTime: bias.controlTime / total,
    grappling: bias.grappling / total,
    aggression: bias.aggression / total,
  };
}

/** A neutral referee, for tests and for bouts with no assigned official. */
export function defaultReferee(id: OfficialId = 'ref_default' as OfficialId): Referee {
  return {
    id,
    name: 'Unassigned Official',
    stoppageTrigger: 50,
    standUpSpeed: 50,
    foulTolerance: 50,
    reputation: 'Competent and unremarkable.',
  };
}

export function defaultJudges(): readonly Judge[] {
  return [
    {
      id: 'judge_default_1' as OfficialId,
      name: 'Judge A',
      bias: JUDGE_ARCHETYPES.balanced!,
      consistency: 78,
    },
    {
      id: 'judge_default_2' as OfficialId,
      name: 'Judge B',
      bias: JUDGE_ARCHETYPES.damageFirst!,
      consistency: 78,
    },
    {
      id: 'judge_default_3' as OfficialId,
      name: 'Judge C',
      bias: JUDGE_ARCHETYPES.controlFirst!,
      consistency: 78,
    },
  ];
}

/** Noise added to a judge's round margin, in margin units. Low consistency = wild cards. */
/**
 * What a judge rewards, measured against what a balanced judge rewards.
 *
 * Not simply "their largest weight", which is the tempting version and is wrong: the balanced
 * archetype's largest weight is damage, so a straight argmax describes the most even-handed
 * judge in the pool as a damage judge. Worse, the gap between first and second is 0.10 for
 * `balanced` and 0.10 for `controlFirst` — identical — so no threshold on that gap can
 * separate them either.
 *
 * Deviation from the balanced vector does separate them, and it is the honest question anyway:
 * a judge is not "a control judge" because control is 35% of their card, they are one because
 * that is more control than a reasonable person would weight. Balanced deviates from itself by
 * nothing, and every other archetype lands squarely on its own name.
 *
 * The archetypes have been in the seed since officials existed and the player has never been
 * told which one is sitting cageside. That is most of the difference between "the game robbed
 * me" and "that was Frawley": a card only reads as arbitrary when you do not know who wrote it.
 */
function judgeEmphasis(judge: Judge): { key: keyof JudgeBias; deviation: number } | undefined {
  const bias = normaliseBias(judge.bias);
  const baseline = normaliseBias(JUDGE_ARCHETYPES.balanced!);
  const keys: readonly (keyof JudgeBias)[] = [
    'damage',
    'significantStrikes',
    'controlTime',
    'grappling',
    'aggression',
  ];

  let best: { key: keyof JudgeBias; deviation: number } | undefined;
  for (const key of keys) {
    const deviation = bias[key] - baseline[key];
    if (!best || deviation > best.deviation) best = { key, deviation };
  }
  // Below this the judge simply is balanced, whatever their largest single weight happens to be.
  return best && best.deviation >= 0.06 ? best : undefined;
}

const JUDGE_REWARDS: Readonly<Record<keyof JudgeBias, string>> = {
  damage: 'the fighter who did the visible harm',
  significantStrikes: 'volume — they count what lands',
  controlTime: 'control and position',
  grappling: 'the grappling exchanges',
  aggression: 'forward pressure, whatever it achieves',
};

const JUDGE_LEANINGS: Readonly<Record<keyof JudgeBias, string>> = {
  damage: 'Damage',
  significantStrikes: 'Volume',
  controlTime: 'Control',
  grappling: 'Grappling',
  aggression: 'Pressure',
};

/** What this judge rewards, in the words a corner would use. */
export function describeJudge(judge: Judge): string {
  const emphasis = judgeEmphasis(judge);
  const rewards = emphasis ? `rewards ${JUDGE_REWARDS[emphasis.key]}` : 'scores a balanced card';

  if (judge.consistency < 55) {
    return `${rewards} — and is erratic enough that nobody can predict the card`;
  }
  if (judge.consistency >= 85) return `${rewards}, and applies it the same way every time`;
  return rewards;
}

/** The single word for what a judge rewards, for a table column. */
export function judgeLeaning(judge: Judge): string {
  const emphasis = judgeEmphasis(judge);
  return emphasis ? JUDGE_LEANINGS[emphasis.key] : 'Balanced';
}

export function judgeNoiseScale(judge: Judge): number {
  return clamp((100 - judge.consistency) / 100, 0, 1) * 0.5;
}

// --- Commentators -----------------------------------------------------------------------

export interface Commentator {
  id: OfficialId;
  name: string;
  /** −1 (loves grapplers) to +1 (loves strikers). */
  styleBias: number;
  /** 1–100. How much they inflate what they are watching. */
  hype: number;
  /** 1–100. How readily they carry the promotion's chosen narrative. */
  companyLine: number;
  catchphrases: readonly string[];
}
