/**
 * A plan that crossed a `JSON.parse` is not a `TacticalPlan`, whatever the type says.
 *
 * `normaliseTactics` is the single funnel every plan goes through before a fight reads it — the
 * camp screen, the editor, a booking written by an older build, and `tacticsFromApproach` migrating
 * a save from before the tactical layer existed. Three of those four cross serialisation, where the
 * compiler stops helping.
 *
 * The failure that matters is not a wrong fight. `entriesFor` indexes `PREFERRED_STATE_META`
 * directly, so a `preferredState` this build has never heard of throws on the way into the cage
 * rather than producing a bad game plan, and it throws inside the simulator where there is nothing
 * useful to say about it.
 */

import { describe, expect, it } from 'vitest';
import {
  BOTTOM_INTENTS,
  PREFERRED_STATES,
  TOP_INTENTS,
  defaultTactics,
  entriesFor,
  normaliseTactics,
  type TacticalPlan,
} from './tactics.js';

/** A plan as it comes back off a save: shape unchecked, fields possibly from another era. */
const asPlan = (raw: Record<string, unknown>): TacticalPlan =>
  ({ ...defaultTactics(), ...raw }) as TacticalPlan;

describe('normalising a plan that came from outside the type system', () => {
  it('keeps a plan that is already valid exactly as it is', () => {
    // The guard must not be a rewrite. Anything it changes about a good plan is an instruction the
    // player chose being quietly replaced.
    const plan: TacticalPlan = {
      ...defaultTactics(),
      preferredState: 'pocket',
      entry: 'pressure',
      topIntent: 'groundAndPound',
      bottomIntent: 'standUp',
      finishing: 'huntFinish',
      conviction: 0.85,
    };
    expect(normaliseTactics(plan)).toEqual(plan);
  });

  it('survives a preferred state this build has never heard of', () => {
    // Not a hypothetical shape: the standing states were rewritten once already, when `outside`
    // and `pocket` gained `boxing` between them.
    const plan = asPlan({ preferredState: 'longRange', conviction: 0.9 });
    expect(() => normaliseTactics(plan)).not.toThrow();
    expect(normaliseTactics(plan).preferredState).toBe('adaptive');
  });

  it('falls back to no opinion rather than to a guess', () => {
    /*
     * The direction of the fallback is the decision. A plan that has lost a field should apply no
     * bias on that axis, because inventing one hands a fighter an instruction nobody gave — which
     * is the same defect as a modifier that applies itself to somebody who does not mean it.
     */
    const neutral = defaultTactics();
    const plan = asPlan({ topIntent: 'ridePosition', bottomIntent: 'rubberGuard', finishing: 'go' });
    const fixed = normaliseTactics(plan);

    expect(fixed.topIntent).toBe(neutral.topIntent);
    expect(fixed.bottomIntent).toBe(neutral.bottomIntent);
    expect(fixed.finishing).toBe(neutral.finishing);
  });

  it('refuses a conviction that is not a number, rather than propagating NaN into every bias', () => {
    // `conviction` multiplies through `exp(alignment × strength × urgency)`. A NaN there does not
    // fail loudly, it makes every weighted draw in the fight `NaN` and the fighter picks the first
    // action in the list all night.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      const fixed = normaliseTactics(asPlan({ conviction: bad }));
      expect(Number.isFinite(fixed.conviction), `conviction from ${String(bad)}`).toBe(true);
    }
    expect(normaliseTactics(asPlan({ conviction: 4 })).conviction).toBe(1);
    expect(normaliseTactics(asPlan({ conviction: -2 })).conviction).toBe(0);
  });

  it('re-picks an entry style that belongs to the previous preference', () => {
    // A grappling entry left on a striking plan is not a plan, it is a stale control — the case
    // this function was originally written for.
    const fixed = normaliseTactics(asPlan({ preferredState: 'outside', entry: 'tripsAndThrows' }));
    expect(entriesFor('outside')).toContain(fixed.entry);
  });

  it('accepts every value the vocabulary actually offers', () => {
    /*
     * The other half of the guard, and the one that stops it rotting: a new state added to
     * `PREFERRED_STATES` without a matching entry in `PREFERRED_STATE_META` would be silently
     * normalised away to `adaptive`, and the symptom would be a plan the player picked doing
     * nothing at all.
     */
    for (const state of PREFERRED_STATES) {
      expect(normaliseTactics(asPlan({ preferredState: state })).preferredState).toBe(state);
    }
    for (const intent of TOP_INTENTS) {
      expect(normaliseTactics(asPlan({ topIntent: intent })).topIntent).toBe(intent);
    }
    for (const intent of BOTTOM_INTENTS) {
      expect(normaliseTactics(asPlan({ bottomIntent: intent })).bottomIntent).toBe(intent);
    }
  });

  it('replaces missing situational instructions with none of them', () => {
    // `situational` is read with `?.` in some places and indexed in others; an absent object from
    // an older save has to become an empty one here so the difference never reaches the engine.
    expect(normaliseTactics(asPlan({ situational: undefined })).situational).toEqual({});
  });
});
