/**
 * Colour commentary.
 *
 * Three commentators have been in the seed data since the world was first built and nothing
 * has ever read them. This is what makes them matter — and it matters more here than it
 * would in a game with a visual fight, because in a text sim **the commentary is the
 * player's only view of the fight.** What the commentator says is, for most players, what
 * happened.
 *
 * Which is exactly why the commentator is allowed to be wrong.
 *
 * A striking-biased, high-hype broadcaster will tell you the striker is running away with a
 * round the wrestler is quietly banking on the cards, because that is what commentary
 * actually does to an audience. A player who reads the *statistics* rather than the noise
 * has a real edge — and finding that out is a genuine moment of learning rather than a
 * tutorial popup. See `impressionAccuracy` for the honest measure of how misleading a given
 * booth is.
 *
 * This runs as a pure pass over a finished `FightResult`: the same fight can be re-called by
 * a different booth without re-simulating, and no commentary can ever change an outcome.
 */

import { clamp01 } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Commentator } from '../domain/officials.js';
import type { Corner, FightEvent, FightResult } from './types.js';
import { OTHER_CORNER } from './types.js';

/** Event kinds the booth reads as striking, and as grappling. Everything else is neutral. */
const STRIKING_KINDS = new Set(['strike', 'combination', 'kick', 'knockdown', 'hurt']);
const GRAPPLING_KINDS = new Set([
  'takedown',
  'positionAdvance',
  'sweep',
  'submissionAttempt',
  'groundStrikes',
]);

export interface RoundImpression {
  round: number;
  /** Who the commentator believes is winning. Not necessarily who is. */
  says?: Corner;
  /** 0–1. How strongly. Drives whether they say anything at all. */
  conviction: number;
  strikingBeats: number;
  grapplingBeats: number;
}

/**
 * What the booth thinks it just watched.
 *
 * The whole distortion lives in one number: `styleBias` reweights grappling beats against
 * striking beats before the comparison. A commentator at +0.7 counts a takedown as worth
 * about a third of what they count a landed combination, which is not a caricature — it is
 * a fair description of a great deal of real broadcasting.
 */
export function roundImpression(
  commentator: Commentator,
  events: readonly FightEvent[],
  round: number,
): RoundImpression {
  const inRound = events.filter((e) => e.round === round && e.corner);

  const weights: Record<Corner, { striking: number; grappling: number }> = {
    red: { striking: 0, grappling: 0 },
    blue: { striking: 0, grappling: 0 },
  };

  for (const e of inRound) {
    const corner = e.corner as Corner;
    // A knockdown is not one beat. Nothing else in a round moves an audience like it.
    const weight = e.kind === 'knockdown' ? 4 : e.emphasis === 'major' ? 2 : 1;
    if (STRIKING_KINDS.has(e.kind)) weights[corner].striking += weight;
    else if (GRAPPLING_KINDS.has(e.kind)) weights[corner].grappling += weight;
  }

  // styleBias −1 (loves grapplers) to +1 (loves strikers), mapped onto a multiplier pair.
  const strikingWeight = 1 + Math.max(0, commentator.styleBias) * 1.6;
  const grapplingWeight = 1 + Math.max(0, -commentator.styleBias) * 1.6;

  const score = (c: Corner) =>
    weights[c].striking * strikingWeight + weights[c].grappling * grapplingWeight;

  const red = score('red');
  const blue = score('blue');
  const total = red + blue;

  if (total === 0) {
    return { round, conviction: 0, strikingBeats: 0, grapplingBeats: 0 };
  }

  const margin = Math.abs(red - blue) / total;
  // Hype is certainty, not just volume. A hyped booth is sure about a round that was close.
  const conviction = clamp01(margin * (0.7 + (commentator.hype / 100) * 0.8));

  return {
    round,
    says: red === blue ? undefined : red > blue ? 'red' : 'blue',
    conviction,
    strikingBeats: weights.red.striking + weights.blue.striking,
    grapplingBeats: weights.red.grappling + weights.blue.grappling,
  };
}

/**
 * How often this booth's read of a round agrees with the judges', across a whole fight.
 *
 * The honest measure of a commentator, and deliberately exposed: a promotion that puts a
 * hype merchant on the microphone is choosing entertainment over information, and that
 * choice should be legible rather than hidden in the prose.
 */
export function impressionAccuracy(
  commentator: Commentator,
  result: FightResult,
): { agreed: number; rounds: number } {
  const card = result.scorecards[0];
  if (!card) return { agreed: 0, rounds: 0 };

  let agreed = 0;
  let rounds = 0;
  for (const scored of card.rounds) {
    if (scored.red === scored.blue) continue;
    const judgeSays: Corner = scored.red > scored.blue ? 'red' : 'blue';
    const impression = roundImpression(commentator, result.events, scored.round);
    if (!impression.says) continue;
    rounds++;
    if (impression.says === judgeSays) agreed++;
  }
  return { agreed, rounds };
}

// --- The lines ---------------------------------------------------------------------------

const GRAPPLING_DISMISSALS = [
  'Not a lot happening here — the crowd want them back on the feet.',
  'This is where the fight goes to sleep, if we are honest.',
  'Referee is looking at this. He should be.',
];

const GRAPPLING_APPRECIATIONS = [
  'People will call this quiet. It is not quiet — that is a fight-ending position being built.',
  'Watch the hips, not the hands. That is the whole exchange.',
  'This is the hardest work in the sport and almost nobody claps for it.',
];

const STRIKING_HYPE = [
  'The building is up! This has turned into a fight!',
  'They are trading in the pocket and neither of them will give an inch!',
  'You cannot look away from this one.',
];

const STRIKING_MEASURED = [
  'Sharp, economical work. Nothing wasted.',
  'That is the range he wants, and he has found it.',
];

const pick = (rng: Rng, lines: readonly string[]): string =>
  lines[Math.min(lines.length - 1, Math.floor(rng.next() * lines.length))]!;

export interface BroadcastInput {
  commentator: Commentator;
  result: FightResult;
  names: Record<Corner, string>;
  /**
   * The corner the promotion is pushing, if either.
   *
   * This is what `companyLine` reads, and it is the least flattering thing the module
   * models: a company man will explain why the favoured fighter is winning a round they are
   * losing, because that is the job they were hired for.
   */
  pushedCorner?: Corner;
  rng: Rng;
}

/**
 * Insert the booth's interjections into a finished fight's event stream.
 *
 * Returns a new array; the input is never mutated, and the returned events remain in
 * chronological order so the replay screen needs no changes beyond styling the new kind.
 */
export function callFight(input: BroadcastInput): readonly FightEvent[] {
  const { result } = input;
  const out: FightEvent[] = [];

  const rounds = new Set(result.events.map((e) => e.round));

  for (const event of result.events) {
    out.push(event);

    // React to the moments, in the voice of whoever is calling it.
    const reaction = reactTo(event, input);
    if (reaction) {
      out.push({
        round: event.round,
        timeSeconds: event.timeSeconds,
        kind: 'colour',
        text: reaction,
        emphasis: event.emphasis === 'critical' ? 'major' : undefined,
      });
    }

    // Sum up at the bell.
    if (event.kind === 'roundEnd' && rounds.has(event.round)) {
      const line = summariseRound(input, event.round);
      if (line) {
        out.push({
          round: event.round,
          timeSeconds: event.timeSeconds,
          kind: 'colour',
          text: line,
        });
      }
    }
  }

  return out;
}

function reactTo(event: FightEvent, input: BroadcastInput): string | undefined {
  const { commentator, names, rng } = input;
  const hyped = commentator.hype >= 70;

  switch (event.kind) {
    case 'knockdown':
      return hyped && commentator.catchphrases.length > 0
        ? pick(rng, commentator.catchphrases)
        : `${event.corner ? names[event.corner] : 'He'} put him down clean.`;

    case 'submissionAttempt':
      // The bias is at its sharpest here: the same submission attempt is either the most
      // dangerous moment of the fight or a lull, depending entirely on who is talking.
      if (commentator.styleBias > 0.4) return undefined;
      return commentator.styleBias < -0.3
        ? 'That is tight. He has the angle and the grip — this is seconds from over.'
        : undefined;

    case 'refStandUp':
      return commentator.styleBias > 0.3
        ? 'Thank you, referee. Nobody paid to watch that.'
        : 'Referee steps in, and that is a position somebody worked two rounds for, gone.';

    case 'foul':
    case 'pointDeduction':
      return commentator.companyLine > 70
        ? 'These things happen. Nobody is in there trying to foul anybody.'
        : 'That is the third time he has done that. It is not an accident any more.';

    default:
      return undefined;
  }
}

function summariseRound(input: BroadcastInput, round: number): string | undefined {
  const { commentator, result, names, pushedCorner, rng } = input;
  const impression = roundImpression(commentator, result.events, round);

  // Nothing decisive enough to be worth a line. Silence is a legitimate call.
  if (!impression.says || impression.conviction < 0.18) return undefined;

  // A company man narrates the fighter they were told to narrate, and reaches for the
  // conviction to do it. `narrativeControl` is what buys this on the promoter's side.
  const bent =
    pushedCorner !== undefined &&
    impression.says === OTHER_CORNER[pushedCorner] &&
    rng.chance(clamp01((commentator.companyLine / 100) * 0.75));

  const says = bent ? pushedCorner : impression.says;
  const name = names[says!];

  const grapplingRound = impression.grapplingBeats > impression.strikingBeats;

  if (grapplingRound) {
    const flavour =
      commentator.styleBias > 0.2
        ? pick(rng, GRAPPLING_DISMISSALS)
        : pick(rng, GRAPPLING_APPRECIATIONS);
    return `${flavour} ${name} takes the round, for me.`;
  }

  const flavour =
    commentator.hype >= 70 ? pick(rng, STRIKING_HYPE) : pick(rng, STRIKING_MEASURED);
  return `${flavour} Clear round for ${name}.`;
}

/** A one-line characterisation for the pre-fight card. */
export function describeCommentator(c: Commentator): string {
  const style =
    c.styleBias > 0.35
      ? 'a striking man through and through'
      : c.styleBias < -0.35
        ? 'a grappling obsessive who will explain the position'
        : 'even-handed about how a fight is won';
  const volume =
    c.hype >= 75 ? 'and permanently at maximum volume' : c.hype <= 40 ? 'and hard to excite' : '';
  const line = c.companyLine >= 80 ? ' Never off message.' : '';
  return `${style}${volume ? ` ${volume}` : ''}.${line}`;
}
