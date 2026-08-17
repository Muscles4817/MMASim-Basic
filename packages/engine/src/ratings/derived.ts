/**
 * Derived ratings.
 *
 * These are real, fight-relevant capabilities that are *not* stored on a fighter, because
 * they are genuinely functions of the 15 stored attributes. Storing them would let the
 * editor produce incoherent fighters (Strength 30 with Clinch 90) and would guarantee that
 * the two drift apart over time.
 *
 * **Every key here must be read by something.** `cageIq` — `fightIq` 0.6 against `composure` 0.4 —
 * was computed for both corners of every fight in the game and read by nothing, for the reason it
 * was never going to be: both of its inputs are already read *directly* at four separate sites, so
 * it was a name for a thing the engine does twice rather than a capability of its own. Deleted in
 * docs/19 phase 3. A derived rating that nothing consumes is not an abstraction, it is a claim the
 * player can read on a screen and the simulator does not honour.
 *
 * See docs/02-attributes-and-ratings.md § "Why not more?".
 */

import { weightedMean } from '../core/math.js';
import { toRating, type Attributes, type Rating } from './attributes.js';

export const DERIVED_KEYS = [
  'clinchOffence',
  'clinchDefence',
  'submissionDefence',
  'groundAndPound',
  'finishingInstinct',
  'chainWrestling',
] as const;

export type DerivedKey = (typeof DERIVED_KEYS)[number];

export type DerivedRatings = Record<DerivedKey, Rating>;

export interface DerivedMeta {
  key: DerivedKey;
  label: string;
  blurb: string;
  /** Which stored attributes feed it, for the UI's "why is this number what it is?" panel. */
  inputs: readonly (readonly [keyof Attributes, number])[];
}

export const DERIVED_META: Readonly<Record<DerivedKey, DerivedMeta>> = {
  clinchOffence: {
    key: 'clinchOffence',
    label: 'Clinch Offence',
    blurb: 'Winning the tie-up: grips, pinning, dirty boxing, working from the fence.',
    /*
     * **A tie-up is a grip fight, not a strength contest.** This was 0.45 `strength` + 0.35
     * `wrestling` + 0.2 `strikingOffence`, which made the clinch a near-copy of `chainWrestling`
     * (0.5 `wrestling` + 0.3 `cardio` + 0.2 `strength`) — the same two attributes deciding both,
     * so **the engine could not tell a clinch grappler from a shot grappler** whatever the
     * discipline table said. Measured, that was the whole reason step 6B could not separate judo
     * from wrestling: their derived clinch and wrestling ratings sat within three points of each
     * other (docs/19 §13.6).
     *
     * `scrambling` and `submissions` are hand-fighting and what follows from a grip, which is what
     * a tie-up is actually contested with. Strength still leads it — you cannot hold somebody you
     * cannot hold — but it no longer *is* it.
     *
     * The exact split was set by a guard rather than by taste: `attributes.test.ts` asserts that a
     * fighter with 25 `strength` and 25 `wrestling` cannot have a clinch worth anything, and a
     * first cut at 0.3/0.25/0.25/0.2 let that fighter reach 45 and broke it. Grip skill is worth
     * real points in a tie-up and it is not worth as much as being able to hold somebody.
     */
    inputs: [
      ['strength', 0.35],
      ['wrestling', 0.25],
      ['scrambling', 0.22],
      ['submissions', 0.18],
    ],
  },
  clinchDefence: {
    key: 'clinchDefence',
    label: 'Clinch Defence',
    blurb: 'Framing off, breaking grips, circling out before the fence traps you.',
    inputs: [
      ['strength', 0.45],
      ['takedownDefence', 0.4],
      ['strikingDefence', 0.15],
    ],
  },
  submissionDefence: {
    key: 'submissionDefence',
    label: 'Submission Defence',
    blurb: 'Surviving the squeeze: posture, hand-fighting, recognising it early.',
    inputs: [
      ['scrambling', 0.4],
      ['submissions', 0.3],
      ['fightIq', 0.2],
      ['strength', 0.1],
    ],
  },
  groundAndPound: {
    key: 'groundAndPound',
    label: 'Ground & Pound',
    blurb: 'Damage from top position — the reason control time can end a fight.',
    inputs: [
      ['groundControl', 0.55],
      ['power', 0.45],
    ],
  },
  finishingInstinct: {
    key: 'finishingInstinct',
    label: 'Finishing Instinct',
    blurb: 'Recognising a hurt opponent and closing the show rather than resetting.',
    inputs: [
      ['fightIq', 0.4],
      ['power', 0.3],
      ['submissions', 0.15],
      ['composure', 0.15],
    ],
  },
  chainWrestling: {
    key: 'chainWrestling',
    label: 'Chain Wrestling',
    blurb: 'Attempt #23 arriving with the same intent as attempt #1.',
    inputs: [
      ['wrestling', 0.5],
      ['cardio', 0.3],
      ['strength', 0.2],
    ],
  },
};

function derive(attrs: Attributes, key: DerivedKey): Rating {
  return toRating(
    weightedMean(DERIVED_META[key].inputs.map(([attr, w]) => [attrs[attr], w] as const)),
  );
}

/** Compute every derived rating. Cheap; call freely rather than caching. */
export function deriveRatings(attrs: Attributes): DerivedRatings {
  const out = {} as DerivedRatings;
  for (const key of DERIVED_KEYS) out[key] = derive(attrs, key);
  return out;
}

export function derivedRating(attrs: Attributes, key: DerivedKey): Rating {
  return derive(attrs, key);
}
