import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeFighter } from '../testing/fixtures.js';
import { defaultGamePlan } from '../domain/gameplan.js';
import { MAX_STARTING_FATIGUE, createCombatant, deriveTendencies, startingFatigue } from './profile.js';
import type { Fighter } from '../domain/fighter.js';

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

  it('does not scout a pure guard player as the busier striker', () => {
    /*
     * **The fourth tripwire, inverted by docs/19 phase 2a.** History, because the number is the
     * argument for the fix:
     *
     * `strikeLean` weighed striking against `(wrestling + groundControl) / 2` and never read
     * `submissions` or `scrambling` at all, so a fighter whose entire game is those two read
     * 0.529 — striker-leaning. `highVolume` was the clearest casualty: **0.333 for the guard
     * player against 0.117 for a control wrestler who has twelve more points of cardio.** The
     * scouting report said the submission specialist was nearly three times likelier to be the
     * volume striker in the room.
     *
     * Now 0.094 against 0.117, and the guard player is the quieter of the two despite the
     * cardio deficit pointing the other way — which is the honest reading, because his hands
     * (48/42) are *worse* than the wrestler's (60/42) as well as his grappling being better.
     * Both sit near the 0.15 floor, as two grapplers should.
     */
    const guard = deriveTendencies(ARCHETYPES.guardPlayer());
    const wrestler = deriveTendencies(ARCHETYPES.smotherer());

    expect(
      guard.highVolume,
      `guard player highVolume ${guard.highVolume.toFixed(3)} vs wrestler ${wrestler.highVolume.toFixed(3)}`,
    ).toBeLessThan(wrestler.highVolume);
  });

  it('reads a guard player’s grappling off the game he actually plays', () => {
    /*
     * The positive statement of the same fix, so a future regression to a four-way mean fails
     * something that says why rather than only the inverted tripwire above.
     *
     * A guard player and a top wrestler are both grapplers and must both read as grapplers,
     * arriving there by different routes: 88.5 of bottom game against the wrestler's 95 of top
     * game. `singleLeg` is the read that separates *how* — the wrestler shoots and the guard
     * player does not, and that is an attribute difference, not a lean difference.
     */
    const guard = deriveTendencies(ARCHETYPES.guardPlayer());
    const wrestler = deriveTendencies(ARCHETYPES.smotherer());

    expect(wrestler.singleLeg).toBeGreaterThan(guard.singleLeg * 2);
    // Both read as grapplers: neither is a volume striker.
    expect(Math.max(guard.highVolume, wrestler.highVolume)).toBeLessThan(0.2);
  });
});

describe('you start the fight in the state your camp left you', () => {
  /*
   * `createCombatant` set `fatigue: 0` flatly, so a fighter who had just overreached for twelve
   * weeks and one who had tapered walked to the cage identically. Doc 25 § 3.4.
   *
   * Deliberately gentle and capped: freshness must change *where you begin*, not how fast you
   * tire, or it becomes a second hidden cardio attribute deciding fights from a menu.
   */
  const at = (freshness: number): Fighter => {
    const base = makeFighter({ age: 27 });
    return { ...base, condition: { ...base.condition, freshness } };
  };

  it('starts a fresh fighter at nothing, exactly as before', () => {
    expect(startingFatigue(at(100))).toBe(0);
  });

  it('starts a flat fighter already carrying some', () => {
    expect(startingFatigue(at(20))).toBeGreaterThan(0);
  });

  it('slides with freshness rather than switching at a threshold', () => {
    const values = [100, 75, 50, 25, 0].map(at).map(startingFatigue);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
  });

  it('never starts anybody more than a quarter of the way to gassed', () => {
    // The cap is the guard against this becoming the thing that decides fights.
    expect(startingFatigue(at(0))).toBeLessThanOrEqual(MAX_STARTING_FATIGUE);
    expect(MAX_STARTING_FATIGUE).toBeLessThanOrEqual(0.3);
  });

  it('treats a fighter from a save without the field as fresh', () => {
    const base = makeFighter({ age: 27 });
    const legacy = { ...base, condition: { ...base.condition, freshness: undefined } } as Fighter;
    expect(startingFatigue(legacy)).toBe(0);
  });

  it('is what the combatant actually walks in with', () => {
    const flat = createCombatant('red', at(20), defaultGamePlan());
    const fresh = createCombatant('red', at(100), defaultGamePlan());
    expect(flat.fatigue).toBeGreaterThan(fresh.fatigue);
  });
});
