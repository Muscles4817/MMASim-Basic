/**
 * Round scoring.
 *
 * Three judges score independently from the *same* round data using different bias vectors.
 * That is deliberately how genuine split decisions and genuine robberies arise here: not
 * from a random "controversy" roll, but from three people honestly weighting damage,
 * control and volume differently. See docs/03 § Scoring.
 */

import { clamp } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Judge } from '../domain/officials.js';
import { normaliseBias, judgeNoiseScale } from '../domain/officials.js';
import type { Corner, RoundScore, RoundTally, Scorecard } from './types.js';

/*
 * `RoundTally` and `emptyTally` moved to `types.ts` when `FightResult` gained `roundStats`.
 * They are re-exported here because this module is where the concept is *used* and every
 * existing import points at it — and because a judge's view of a round belongs beside the
 * code that scores one.
 */
export { emptyTally, type RoundTally } from './types.js';

/**
 * Normalised advantage for one input, −1 … +1.
 *
 * Share-of-total rather than raw difference, so a round with two strikes and a round with
 * two hundred are both scorable. A round where neither fighter did anything returns 0.
 */
function share(red: number, blue: number): number {
  const total = red + blue;
  return total <= 0 ? 0 : (red - blue) / total;
}

/** One judge's view of who won a round and by how much, as a margin in −1 … +1. */
export function roundMargin(judge: Judge, red: RoundTally, blue: RoundTally, rng: Rng): number {
  const bias = normaliseBias(judge.bias);

  // Knockdowns are folded into damage rather than scored separately: a knockdown is the
  // most legible evidence of damage there is, and every judge sees it.
  const redDamage = red.damageDealt + red.knockdowns * 18;
  const blueDamage = blue.damageDealt + blue.knockdowns * 18;

  const raw =
    bias.damage * share(redDamage, blueDamage) +
    bias.significantStrikes * share(red.significantStrikes, blue.significantStrikes) +
    bias.controlTime * share(red.controlSeconds, blue.controlSeconds) +
    bias.grappling *
      share(
        red.takedowns * 2 + red.submissionAttempts * 1.5,
        blue.takedowns * 2 + blue.submissionAttempts * 1.5,
      ) +
    bias.aggression * share(red.strikesAttempted, blue.strikesAttempted);

  // Inconsistent judges add noise. This is the mechanism behind cards nobody can explain.
  const noise = rng.normal() * judgeNoiseScale(judge);
  return clamp(raw + noise, -1, 1);
}

/**
 * Margin above which a judge awards 10-8, given corroborating dominance.
 *
 * Real 10-8 rounds are rare — a few percent of all rounds. Getting this wrong is not a
 * cosmetic scoring quirk: a 10-8 makes a card sum to 56 instead of 57, which is precisely
 * the arithmetic that produces tied cards, and therefore draws. A permissive threshold here
 * pushed the draw rate above 10%.
 */
const TEN_EIGHT_MARGIN = 0.82;
/** Margin above which a judge awards 10-7. Near-finishing dominance only. */
const TEN_SEVEN_MARGIN = 0.85;

/**
 * When a judge scores a round even.
 *
 * Only when *nothing at all* separated the fighters — not merely when the noisy margin
 * landed near zero. Judging on the noisy margin is the tempting version and it is wrong:
 * with realistic judge noise it produces a 10-10 in ~3% of rounds, which compounds into
 * roughly one drawn fight in seven. Real MMA draws sit under 1%.
 */
function isTrulyEven(red: RoundTally, blue: RoundTally): boolean {
  return (
    red.damageDealt === blue.damageDealt &&
    red.significantStrikes === blue.significantStrikes &&
    red.controlSeconds === blue.controlSeconds &&
    red.takedowns === blue.takedowns &&
    red.knockdowns === blue.knockdowns &&
    red.strikesAttempted === blue.strikesAttempted &&
    // Must cover every field roundMargin scores. Omitting this one made a round where one
    // fighter attempted four submissions and nothing else differed score 10-10 on all three
    // cards, and the fight a draw.
    red.submissionAttempts === blue.submissionAttempts
  );
}

/**
 * Convert a margin into a 10-point-must round score.
 *
 * A 10-8 needs a wide margin **and** corroboration — a knockdown or heavy control — so that
 * a merely busy round cannot produce one. This matters: 10-8s decide five-round fights.
 */
export function scoreRound(
  margin: number,
  winnerTally: RoundTally,
  loserTally: RoundTally,
  even = false,
): { red: number; blue: number } {
  if (even) return { red: 10, blue: 10 };
  const abs = Math.abs(margin);
  const dominant =
    winnerTally.knockdowns > 0 ||
    winnerTally.controlSeconds >= 255 ||
    winnerTally.damageDealt > loserTally.damageDealt * 5;

  let loserScore = 9;
  if (abs >= TEN_SEVEN_MARGIN && winnerTally.knockdowns >= 2) loserScore = 7;
  else if (abs >= TEN_EIGHT_MARGIN && dominant) loserScore = 8;

  return margin > 0 ? { red: 10, blue: loserScore } : { red: loserScore, blue: 10 };
}

export interface ScoringInput {
  judges: readonly Judge[];
  /** Per-round tallies, index 0 = round 1. */
  rounds: readonly Record<Corner, RoundTally>[];
  /** Point deductions, applied after the judges score. */
  deductions: Record<Corner, number>;
}

export function buildScorecards(input: ScoringInput, rng: Rng): readonly Scorecard[] {
  return input.judges.map((judge, judgeIndex) => {
    const judgeRng = rng.fork(`judge:${judgeIndex}`);
    const rounds: RoundScore[] = [];
    let redTotal = 0;
    let blueTotal = 0;

    input.rounds.forEach((tallies, i) => {
      const margin = roundMargin(judge, tallies.red, tallies.blue, judgeRng);
      const winner = margin > 0 ? tallies.red : tallies.blue;
      const loser = margin > 0 ? tallies.blue : tallies.red;
      const score = scoreRound(margin, winner, loser, isTrulyEven(tallies.red, tallies.blue));
      rounds.push({ round: i + 1, red: score.red, blue: score.blue });
      redTotal += score.red;
      blueTotal += score.blue;
    });

    return {
      judgeName: judge.name,
      rounds,
      redTotal: redTotal - input.deductions.red,
      blueTotal: blueTotal - input.deductions.blue,
    };
  });
}

export type DecisionType = 'unanimous' | 'split' | 'majority' | 'draw';

export interface DecisionResult {
  type: DecisionType;
  winner?: Corner;
}

/** Read the three cards. Handles unanimous, split, majority and every flavour of draw. */
export function readDecision(cards: readonly Scorecard[]): DecisionResult {
  let redCards = 0;
  let blueCards = 0;

  for (const card of cards) {
    if (card.redTotal > card.blueTotal) redCards++;
    else if (card.blueTotal > card.redTotal) blueCards++;
  }

  const majority = Math.floor(cards.length / 2) + 1;

  if (redCards === cards.length) return { type: 'unanimous', winner: 'red' };
  if (blueCards === cards.length) return { type: 'unanimous', winner: 'blue' };

  if (redCards >= majority) {
    // A card for the loser makes it split; a draw card makes it majority.
    return { type: blueCards > 0 ? 'split' : 'majority', winner: 'red' };
  }
  if (blueCards >= majority) {
    return { type: redCards > 0 ? 'split' : 'majority', winner: 'blue' };
  }

  return { type: 'draw' };
}
