/**
 * The plan a corner brings, and whether it is about the fight in front of them.
 *
 * `planFor` is what every fight in the game runs on except the player's own, so the claims here
 * are about the *world's* behaviour rather than about one bout: does a fighter's plan change when
 * the man across from them changes, and does it change in the direction a corner would change it.
 *
 * The defects this file was written after all had the same shape — a decision that looked
 * personalised and was not. Reads ranked by raw tendency gave **every opponent in the game** the
 * same three drills, because three of the fifteen formulas simply return larger numbers than the
 * rest; the first cut of `pickApproach` gated `counter` behind `pressure`, which handed the
 * approach to 0.5% of the roster; and when `pickApproach` became `pickTactics`, a first cut
 * handed **the boxing, kickboxing, karate and wrestling exemplars all the same bottom instruction
 * — play guard** — which is the player's original complaint reproduced by the function written to
 * fix it. None of those is visible in a fight. All of them are obvious the moment something
 * prints what the planner actually chose.
 */

import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../testing/fixtures.js';
import { MAX_PREPPED_READS, type GamePlan } from '../domain/gameplan.js';
import { PREFERRED_STATE_META } from '../domain/tactics.js';
import { planFor } from './planner.js';

const readsOf = (plan: GamePlan) => plan.preppedReads.map((r) => r.read);

describe('the plan reads the opponent', () => {
  it('drills the strangles against a submission specialist and the shots against a wrestler', () => {
    /*
     * The claim that makes preparation worth having, and the one the app's version got wrong by
     * ranking reads off attributes: a guard player's danger is his tendency, not his `wrestling`.
     */
    const vsGuardPlayer = readsOf(planFor(ARCHETYPES.contender(), ARCHETYPES.guardPlayer()));
    const vsWrestler = readsOf(planFor(ARCHETYPES.contender(), ARCHETYPES.smotherer()));

    expect(vsGuardPlayer, `drilled ${vsGuardPlayer.join(', ')}`).toContain('guillotine');
    expect(vsWrestler, `drilled ${vsWrestler.join(', ')}`).toEqual(
      expect.arrayContaining(['singleLeg', 'doubleLeg']),
    );
    // And the two camps are not the same camp, which is the whole point.
    expect(vsGuardPlayer).not.toEqual(vsWrestler);
  });

  it('drills the kicks against a kicker', () => {
    const vsStriker = readsOf(planFor(ARCHETYPES.contender(), ARCHETYPES.striker()));
    expect(
      vsStriker.some((r) => r === 'calfKick' || r === 'headKick'),
      vsStriker.join(', '),
    ).toBe(true);
  });

  it('never drills more than a camp can hold', () => {
    for (const opponent of [
      ARCHETYPES.striker(),
      ARCHETYPES.smotherer(),
      ARCHETYPES.guardPlayer(),
    ]) {
      expect(planFor(ARCHETYPES.contender(), opponent).preppedReads.length).toBeLessThanOrEqual(
        MAX_PREPPED_READS,
      );
    }
  });
});

describe('the plan reads the fighter', () => {
  it('sends a wrestler to the floor and a striker to the feet, against the same opponent', () => {
    const wrestler = planFor(ARCHETYPES.smotherer(), ARCHETYPES.contender()).tactics;
    const striker = planFor(ARCHETYPES.striker(), ARCHETYPES.contender()).tactics;

    expect(
      PREFERRED_STATE_META[wrestler.preferredState].standing,
      `wrestler got ${wrestler.preferredState}`,
    ).toBe(false);
    expect(
      PREFERRED_STATE_META[striker.preferredState].standing,
      `striker got ${striker.preferredState}`,
    ).toBe(true);
  });

  it('does not tell a striker to be comfortable on his back', () => {
    /*
     * **The player's complaint, as a unit test on the thing that causes it.**
     *
     * A striker taken down should be trying to get up, not settling into guard to threaten a
     * submission he cannot finish. A first cut of `pickBottomIntent` read absolute thresholds —
     * `submissions > 58 && scrambling > 55` — which at exemplar level is most of the roster, and
     * handed `playGuard` to every striking discipline in the game.
     */
    for (const archetype of [ARCHETYPES.striker(), ARCHETYPES.bomber()]) {
      const plan = planFor(archetype, ARCHETYPES.smotherer()).tactics;
      expect(
        ['standUp', 'scramble'],
        `${archetype.lastName} was told to ${plan.bottomIntent} underneath`,
      ).toContain(plan.bottomIntent);
    }
  });

  it('lets a submission specialist stay there, because that is his fight', () => {
    // The other side of the same claim: the instruction has to be able to say "you are fine
    // there" or it is not an instruction, it is a global rule about strikers.
    const guard = planFor(ARCHETYPES.guardPlayer(), ARCHETYPES.smotherer()).tactics;
    expect(['attack', 'playGuard'], `guard player got ${guard.bottomIntent}`).toContain(
      guard.bottomIntent,
    );
  });

  it('gives the route as well as the destination', () => {
    /*
     * `(preferredState, entry)` is where the expressiveness lives, and a planner that always
     * picked the same route would have replaced one axis with one axis. A fighter better from
     * grips than in space should be routed through the tie-up.
     */
    const throwers = planFor(ARCHETYPES.smotherer(), ARCHETYPES.contender()).tactics;
    expect(throwers.entry, `smotherer routed via ${throwers.entry}`).not.toBe('lead');
  });

  it('does not tell a fighter who cannot kick to attack the legs', () => {
    // `pickTarget` bends this at resolution time anyway (docs/19 §8b), but a corner that writes
    // "chop the legs" on the board for a boxer is a corner that has not watched their fighter.
    const boxerish = planFor(ARCHETYPES.striker(), ARCHETYPES.smotherer()).targeting;
    const nonKicker = planFor(ARCHETYPES.guardPlayer(), ARCHETYPES.smotherer()).targeting;
    expect(nonKicker.legs).toBeLessThan(boxerish.legs);
  });

  it('turns the risk dial with the fighter’s temperament, inside a band', () => {
    /*
     * `riskLevel` was 0.5 for every fighter in the world — a dial `risk.test.ts` proves is live and
     * that nobody except the player ever turned. The band is deliberate: `risk.test.ts` measures
     * recklessness as mildly *correct* at even money, so handing the world its maximum would be a
     * silent buff to everybody rather than a characterisation.
     */
    const reckless = planFor(
      {
        ...ARCHETYPES.contender(),
        personality: { ...ARCHETYPES.contender().personality, aggression: 95, discipline: 20 },
      },
      ARCHETYPES.contender(),
    ).riskLevel;
    const careful = planFor(
      {
        ...ARCHETYPES.contender(),
        personality: { ...ARCHETYPES.contender().personality, aggression: 20, discipline: 95 },
      },
      ARCHETYPES.contender(),
    ).riskLevel;

    expect(reckless).toBeGreaterThan(careful);
    expect(reckless).toBeLessThanOrEqual(0.7);
    expect(careful).toBeGreaterThanOrEqual(0.3);
  });

  it('is deterministic, because two identical matchups must produce two identical fights', () => {
    const a = planFor(ARCHETYPES.contender(), ARCHETYPES.striker());
    const b = planFor(ARCHETYPES.contender(), ARCHETYPES.striker());
    expect(a).toEqual(b);
  });
});
