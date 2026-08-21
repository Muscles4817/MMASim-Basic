/**
 * Two decisions, not one.
 *
 * > **Wanting to leave a state must not automatically suppress all useful behaviour within it.**
 *
 * That is docs/01 § 8, and before the transition split the engine could not honour it anywhere.
 * Every position drew *what am I doing here* against *how am I getting out* in a single weighted
 * list, so the two traded against each other by arithmetic: an 88-submissions fighter told to
 * stand up went from 4.96 submission attempts to 2.17 and from 0.63 get-ups to 1.96, and nothing
 * in the model had chosen that trade. Worse, a *failed* exit produced nothing at all — a fighter
 * who tried to stand and did not spent the whole beat achieving zero.
 *
 * The file is deliberately mechanism-first. Most of what follows calls the policy functions
 * directly with no fight attached, because the claims are about the decision and a simulation only
 * adds noise to them. The behavioural half is kept for the two things arithmetic cannot show: that
 * the split survives contact, and that success stayed where it belongs.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  simulateFight,
  type BottomIntent,
  type Fighter,
  type GamePlan,
  type PreferredState,
  type TacticalPlan,
} from '@mmasim/engine';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import { bottomExitUrgency, clinchExitUrgency, stanceOf } from '../../packages/engine/src/fight/policy.js';
import { actionShares } from '../../packages/engine/src/fight/decide.js';
import { bottomWork } from '../../packages/engine/src/fight/simulate.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 1, ...t },
});

const of = (t: Partial<TacticalPlan>, fighter: Fighter = ARCHETYPES.contender()) => {
  const c = createCombatant('red', fighter, plan(t));
  return { c, stance: stanceOf(c, undefined, false) };
};

const exitRate = (intent: BottomIntent, fighter?: Fighter) => {
  const { c, stance } = of({ bottomIntent: intent }, fighter);
  return bottomExitUrgency(c, stance);
};

describe('how hard a fighter is trying to leave', () => {
  it('is set by the plan and by nothing else about him', () => {
    /*
     * Invariant 1 in its purest form: two fighters who could not be more different physically,
     * given the same instruction, try to leave at exactly the same rate. What separates them is
     * whether it works, and that is resolved somewhere else entirely.
     */
    const wrestler = makeFighter({
      id: 'f_w',
      attributes: { ...ARCHETYPES.contender().attributes, scrambling: 95, wrestling: 95 },
    });
    const stone = makeFighter({
      id: 'f_s',
      attributes: { ...ARCHETYPES.contender().attributes, scrambling: 25, wrestling: 25 },
    });

    for (const intent of ['standUp', 'playGuard'] as const) {
      expect(exitRate(intent, wrestler), intent).toBeCloseTo(exitRate(intent, stone), 10);
    }
  });

  it('moves materially between the instruction to leave and the instruction to stay', () => {
    // Measured at full conviction: 0.94 against 0.25, which is the whole span the bounds allow.
    const out = exitRate('standUp');
    const stay = exitRate('attack');
    const message = `standUp ${out.toFixed(3)} against attack ${stay.toFixed(3)}`;

    expect(out, message).toBeGreaterThan(stay * 2);
  });

  it('never reaches nought or one, because both ends break the invariant', () => {
    /*
     * The floor is what stops "stay and work" meaning a fighter who *cannot* leave a position that
     * has become untenable. The ceiling is what stops "get up" meaning a fighter who does nothing
     * else while failing to. Neither is a tuning knob for how much the plan is worth.
     */
    for (const intent of ['standUp', 'scramble', 'recover', 'playGuard', 'attack'] as const) {
      expect(exitRate(intent), intent).toBeGreaterThan(0.1);
      expect(exitRate(intent), intent).toBeLessThan(0.96);
    }
  });

  it('leaves an unplanned fighter doing what the sport does', () => {
    /*
     * The lesson `rangeUrgency` records about its floor, in the other half of the fight: getting up
     * off your back is a property of fighting rather than of planning. A first cut centred the
     * scale at a half, every unplanned fighter in the game stopped trying to stand, and the sport
     * lost two points of striking win-rate swing to the extra time on the floor.
     */
    const c = createCombatant('red', ARCHETYPES.contender(), defaultGamePlan());
    const rate = bottomExitUrgency(c, stanceOf(c, undefined, false));
    expect(rate).toBeGreaterThan(0.7);
    expect(rate).toBeLessThan(0.9);
  });

  it('asks the clinch the same question from the desired state', () => {
    const held = (state: PreferredState) => {
      const { c, stance } = of({ preferredState: state });
      void c;
      return clinchExitUrgency(stance);
    };
    // A man who wants to be at range fights to get out of a tie-up; a clinch fighter does not.
    expect(held('outside')).toBeGreaterThan(held('clinch') * 2);
    expect(held('clinch')).toBeGreaterThan(0.1);
  });
});

describe('what he does while he is still there', () => {
  it('is a separate decision, unchanged by how badly he wants out', () => {
    /*
     * **The heart of it.** `bottomWork` never sees the exit urgency, so the in-state distribution
     * is a function of the plan's in-state axis alone. Two fighters told to attack from the bottom
     * attack identically whether or not they are also told to work for the exit — which is the
     * thing that was impossible when one list held both.
     */
    const shares = (intent: BottomIntent) => {
      const { c, stance } = of({ bottomIntent: intent });
      return actionShares(bottomWork(c, stance, 'guard', 0, false));
    };

    const attack = shares('attack');
    const guard = shares('playGuard');
    const stand = shares('standUp');

    // A fighter told to attack attacks; one told to get up frames instead of hunting a choke.
    expect(attack.submission).toBeGreaterThan(0.7);
    expect(stand.submission).toBeLessThan(0.3);
    expect(stand.defend).toBeGreaterThan(0.7);
    // And playing guard is not the same instruction as standing up, on this axis.
    expect(guard.submission).toBeGreaterThan(stand.submission * 2);
  });

  it('gives a fighter who wants out something to do that is not a submission', () => {
    /*
     * Before the split, the only in-state action underneath was `submission`. So a striker with 32
     * submissions who wanted to stand had a choice between attempting an escape and hunting a choke
     * he cannot finish — and when the escape failed, which is most of the time, he did nothing.
     */
    const striker = makeFighter({
      id: 'f_str',
      attributes: { ...ARCHETYPES.striker().attributes, submissions: 32, scrambling: 40 },
    });
    const { c, stance } = of({ preferredState: 'outside', bottomIntent: 'standUp' }, striker);
    const shares = actionShares(bottomWork(c, stance, 'guard', 0, true));

    expect(shares.defend, `defend share ${shares.defend.toFixed(2)}`).toBeGreaterThan(0.75);
  });
});

/* ---------------------------------------------------------------------------------------------
 * And the same claims once the fights are actually run
 * ------------------------------------------------------------------------------------------- */

const striker = makeFighter({
  id: 'fighter_striker',
  lastName: 'Striker',
  attributes: {
    strikingOffence: 84, kicking: 80, strikingDefence: 78, power: 80, speed: 78,
    wrestling: 38, takedownDefence: 44, groundControl: 35, submissions: 32, scrambling: 40,
    cardio: 70, strength: 60, durability: 70, fightIq: 70, composure: 70,
  },
});

const wrestler = makeFighter({
  id: 'fighter_wrestler',
  lastName: 'Wrestler',
  attributes: {
    strikingOffence: 58, kicking: 50, strikingDefence: 60, power: 60, speed: 62,
    wrestling: 84, takedownDefence: 80, groundControl: 82, submissions: 60, scrambling: 72,
    cardio: 76, strength: 74, durability: 72, fightIq: 68, composure: 68,
  },
});

const FIGHTS = 1200;

function underneath(bottomIntent: BottomIntent) {
  const p = plan({ preferredState: 'outside', entry: 'counter', bottomIntent, conviction: 0.85 });
  const foe = plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control', conviction: 0.85 });
  let attempted = 0;
  let landed = 0;
  let work = 0;
  let bottomSeconds = 0;

  for (let i = 0; i < FIGHTS; i++) {
    const r = simulateFight({
      boutId: `transition:${i}`,
      red: { fighter: striker, plan: p },
      blue: { fighter: wrestler, plan: foe },
      rounds: 3,
      seed: `transition:${i}`,
    });
    attempted += r.stats.red.escapesAttempted;
    landed += r.stats.red.escapesLanded;
    work += r.stats.red.bottomWorkBeats;
    bottomSeconds += r.stats.blue.controlSeconds - r.stats.blue.clinchControlSeconds;
  }

  const minutes = bottomSeconds / 60;
  return {
    attemptsPerMinute: attempted / minutes,
    workPerMinute: work / minutes,
    successRate: attempted > 0 ? landed / attempted : 0,
  };
}

describe('and it survives contact', () => {
  const stand = underneath('standUp');
  const stay = underneath('attack');
  const message =
    `standUp ${stand.attemptsPerMinute.toFixed(2)} att/min, ${stand.workPerMinute.toFixed(2)} work/min, ` +
    `${(stand.successRate * 100).toFixed(1)}% | attack ${stay.attemptsPerMinute.toFixed(2)} att/min, ` +
    `${stay.workPerMinute.toFixed(2)} work/min, ${(stay.successRate * 100).toFixed(1)}%`;

  it('changes how often he goes for the exit', () => {
    expect(stand.attemptsPerMinute, message).toBeGreaterThan(stay.attemptsPerMinute * 1.35);
  });

  it('does not make him passive for it, which is the whole invariant', () => {
    /*
     * The number this file exists for. A striker told to stand up is going for the exit on nearly
     * every beat and still doing in-state work on nearly every beat, because most exits fail and a
     * failed exit no longer costs him the rest of it.
     *
     * Asserted as a ratio against the fighter told to stay, so it survives rebalancing: telling
     * somebody to leave may reasonably cost him *some* of the work he would otherwise do, and must
     * not cost him most of it.
     */
    expect(stand.workPerMinute, message).toBeGreaterThan(stay.workPerMinute * 0.7);
  });

  it('leaves whether it works to the two fighters', () => {
    /*
     * Invariant 1, measured where it matters most. The plan bought him three times the attempts
     * and not one point of success: 40 scrambling against 82 ground control decides that, and no
     * instruction changes it. This is the same result range reports — a pressure plan nearly
     * triples range-change attempts and moves the success rate by two points.
     */
    const gap = Math.abs(stand.successRate - stay.successRate);
    expect(gap, message).toBeLessThan(0.06);
  });
});
