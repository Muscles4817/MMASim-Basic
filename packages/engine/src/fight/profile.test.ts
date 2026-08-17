import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../testing/fixtures.js';
import { deriveTendencies } from './profile.js';

/**
 * What a scouting report says about a fighter.
 *
 * `deriveTendencies` is the only place a fighter's *style* is written down in a form anything
 * else can read, and it is read at exactly one site — the opponent's prepared-read bonus. So
 * these are assertions about **scoutability**, not about behaviour (doc 18 §2.4).
 *
 * The suite exists because the fixture set had no submission specialist, and the gap hid a
 * live defect. See `ARCHETYPES.guardPlayer`.
 */

describe('a scouting report reads the fighter it is looking at', () => {
  it('puts a guard player’s danger where it actually is — on his back', () => {
    const guard = deriveTendencies(ARCHETYPES.guardPlayer());
    const wrestler = deriveTendencies(ARCHETYPES.smotherer());

    // `backTake` and `guillotine` read `submissions` and `scrambling` directly, so the part of
    // the profile that comes straight off an attribute is right: the guard player is the more
    // likely of the two to be hunting a strangle, despite the wrestler's 78 submissions.
    expect(guard.backTake).toBeGreaterThan(wrestler.backTake);
    expect(guard.guillotine).toBeGreaterThan(wrestler.guillotine);
  });

  it('separates a pure striker from a pure wrestler', () => {
    // Non-vacuousness check for the two tests around it: `strikeLean` does its job on the axis
    // it was written for. A test that only measured the defect below could not tell a broken
    // formula from a broken fixture.
    const striker = deriveTendencies(ARCHETYPES.striker());
    const wrestler = deriveTendencies(ARCHETYPES.smotherer());

    expect(striker.highVolume).toBeGreaterThan(wrestler.highVolume);
    expect(wrestler.singleLeg).toBeGreaterThan(striker.singleLeg);
  });

  it('scouts a pure guard player as the busier striker of the two — which is wrong', () => {
    /*
     * A tripwire, asserting a defect rather than a design.
     *
     * `strikeLean` (profile.ts) is `(strikingOffence + kicking) / 2` against `(wrestling +
     * groundControl) / 2`. It never reads `submissions` or `scrambling`, so a fighter whose
     * entire game is those two attributes reads 0.529 — striker-leaning — and every read
     * scaled by that scalar is scaled the wrong way. `highVolume` is the clearest of them:
     * measured 0.333 for the guard player against 0.117 for a control wrestler who has
     * *twelve more points of cardio*. The report says the submission specialist is nearly
     * three times likelier to be the volume striker in the room.
     *
     * When docs/19 phase 2 puts `submissions` and `scrambling` into `strikeLean`, this
     * assertion breaks. That is the fix landing: invert it to `toBeLessThan` and move the
     * measured numbers into the comment above it.
     */
    const guard = deriveTendencies(ARCHETYPES.guardPlayer());
    const wrestler = deriveTendencies(ARCHETYPES.smotherer());

    expect(
      guard.highVolume,
      `guard player highVolume ${guard.highVolume.toFixed(3)} vs wrestler ${wrestler.highVolume.toFixed(3)}`,
    ).toBeGreaterThan(wrestler.highVolume);
  });
});
