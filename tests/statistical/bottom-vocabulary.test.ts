/**
 * The last position where one field answered three questions.
 *
 * `bottomIntent` used to set how urgently a fighter wanted off the floor, *which way* he went when
 * he went, **and** what he did while he stayed. One instruction answering *where do I want the
 * fight*, *how do I get there* and *what do I do here* — the defect D3 removed from the clinch, and
 * the bottom had it worse because it had three jobs rather than two.
 *
 * D4 gives the bottom a `preferredState` of its own, which is what makes the first two sayable
 * anywhere else, and D6 leaves `bottomIntent` as an in-state axis with something to say. The two
 * findings are one change: you cannot move the exit off the field without somewhere for it to go,
 * and you cannot un-bunch the vocabulary while three of its five values differ only on the axis that
 * is leaving.
 *
 * Asserted on the decisions rather than through fights, because these are claims about what a
 * fighter *chooses* and a simulation only adds noise to them. The behavioural half is kept for the
 * one thing arithmetic cannot show: that a fighter who asks to be underneath actually gets to stay.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  BOTTOM_INTENTS,
  PREFERRED_STATES,
  bottomIntentFor,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  normaliseTactics,
  simulateFight,
  type BottomIntent,
  type GamePlan,
  type PreferredState,
  type TacticalPlan,
} from '@mmasim/engine';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import {
  bottomExitUrgency,
  recoveryIntensity,
  stanceOf,
} from '../../packages/engine/src/fight/policy.js';
import { actionShares, intentAuthority } from '../../packages/engine/src/fight/decide.js';
import { bottomExits, bottomWork } from '../../packages/engine/src/fight/simulate.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 1, ...t },
});

const entryFor = (state: PreferredState) =>
  (['outside', 'boxing', 'pocket', 'adaptive'] as PreferredState[]).includes(state)
    ? ('movement' as const)
    : ('reactiveShot' as const);

const forState = (state: PreferredState, over: Partial<TacticalPlan> = {}) =>
  state === 'adaptive'
    ? defaultGamePlan()
    : plan({ preferredState: state, entry: entryFor(state), ...over });

const fighter = ARCHETYPES.contender();

const stanceFor = (p: GamePlan) => {
  const c = createCombatant('red', fighter, p);
  return { c, stance: stanceOf(c, undefined, false) };
};

describe('where he wants the fight decides how hard he works to get there', () => {
  const urgency = (state: PreferredState) => bottomExitUrgency(stanceFor(forState(state)).stance);

  it('separates the fighters who asked to be underneath from the ones who did not', () => {
    /*
     * The claim D4 exists for. Before it, the only field that could say "I mean to be down here"
     * was `bottomIntent`, which was also saying what he did with his hands — so a guard player and
     * a striker who both wanted to attack off their backs were given the same urge to leave.
     */
    const wantsToBeThere = Math.max(urgency('bottom'), urgency('submission'));
    const wantsOut = Math.min(urgency('outside'), urgency('boxing'), urgency('top'));
    const message = `stay ${wantsToBeThere.toFixed(3)} against leave ${wantsOut.toFixed(3)}`;
    expect(wantsOut, message).toBeGreaterThan(wantsToBeThere * 1.6);
  });

  it('and is a property of the plan and of nothing else about him', () => {
    // Invariant 1, unchanged from F1 and re-asserted on the field that carries it now.
    const wrestler = makeFighter({
      id: 'f_w',
      attributes: { ...fighter.attributes, scrambling: 95, wrestling: 95 },
    });
    const stone = makeFighter({
      id: 'f_s',
      attributes: { ...fighter.attributes, scrambling: 25, wrestling: 25 },
    });
    for (const state of ['outside', 'bottom'] as PreferredState[]) {
      const of = (f: typeof wrestler) =>
        bottomExitUrgency(stanceOf(createCombatant('red', f, forState(state)), undefined, false));
      expect(of(wrestler), state).toBeCloseTo(of(stone), 10);
    }
  });

  it('never reaches nought or one, for any preference in the vocabulary', () => {
    for (const state of PREFERRED_STATES) {
      expect(urgency(state), state).toBeGreaterThan(0.1);
      expect(urgency(state), state).toBeLessThan(0.96);
    }
  });

  it('leaves an unplanned fighter exactly where the sport had him', () => {
    // The neutral F1 measured, preserved through a change of field: 0.80.
    expect(urgency('adaptive')).toBeCloseTo(0.8, 10);
  });
});

describe('and which way out he goes for', () => {
  const route = (state: PreferredState) =>
    actionShares(bottomExits(stanceFor(forState(state)).c, stanceFor(forState(state)).stance, 'guard'));

  it('is a different question from how badly he wants out, and now has a different answer', () => {
    /*
     * The half that was invisible while one field did both. A striker and a wrestler underneath are
     * equally keen to leave — 0.909 against 0.887 — and they are not going to the same place. Before
     * D4 the only way to say *turn him over* was `scramble`, which also meant *and I do not mind
     * being here much*, so a wrestler could not be given a wrestler's exit at a striker's urgency.
     */
    const striker = route('outside');
    const wrestler = route('top');
    const message =
      `outside ${(striker.standUp * 100).toFixed(0)}% up / ${(striker.sweep * 100).toFixed(0)}% sweep | ` +
      `top ${(wrestler.standUp * 100).toFixed(0)}% up / ${(wrestler.sweep * 100).toFixed(0)}% sweep`;

    expect(striker.standUp, message).toBeGreaterThan(0.75);
    expect(wrestler.sweep, message).toBeGreaterThan(0.75);
    // And they are equally keen to be going, which is the point of splitting them.
    const urgency = (s: PreferredState) => bottomExitUrgency(stanceFor(forState(s)).stance);
    expect(Math.abs(urgency('outside') - urgency('top')), message).toBeLessThan(0.06);
  });

  it('sends the man who likes it down there the way that keeps him there', () => {
    // Read only once the exit roll has said he is going: asked *given that you are leaving, how*,
    // he turns it over rather than standing up.
    expect(route('bottom').sweep).toBeGreaterThan(0.7);
  });
});

describe('what he does while he is still there', () => {
  const work = (intent: BottomIntent) => {
    const { c, stance } = stanceFor(plan({ bottomIntent: intent }));
    return actionShares(bottomWork(c, stance, 'guard', 0.15, false));
  };

  it('spans the vocabulary instead of bunching in the middle of it', () => {
    /*
     * D6. The old five sat in an exit band of 0.816 to 0.909 — three instructions separated by nine
     * hundredths on an axis that has since moved out of this field entirely. Three values now, and
     * they span the work axis end to end.
     */
    const attack = work('attack');
    const defend = work('defend');
    const recover = work('recover');
    const message =
      `attack ${(attack.submission * 100).toFixed(0)}% sub | defend ${(defend.submission * 100).toFixed(0)}% | ` +
      `recover ${(recover.submission * 100).toFixed(0)}%`;

    expect(attack.submission, message).toBeGreaterThan(0.8);
    expect(defend.defend, message).toBeGreaterThan(0.7);
    expect(recover.defend, message).toBeGreaterThan(defend.defend);
    expect(attack.submission / recover.submission, message).toBeGreaterThan(5);
  });

  it('gives `recover` something to be that is not a quieter `defend`', () => {
    /*
     * The reason the value survived the cut from five to three. It used to be a softer `standUp` —
     * 0.816 exit urgency against 0.909 and within a point of it on everything else — so it was a
     * word rather than an instruction, and D4 took the only axis it differed on away.
     *
     * It now buys what the word means: a cheaper beat. `accrueFatigue` has taken an intensity since
     * it was written and nothing had ever asked a *plan* for one.
     */
    expect(recoveryIntensity(stanceFor(plan({ bottomIntent: 'recover' })).c)).toBeLessThan(1);
    for (const intent of ['attack', 'defend'] as BottomIntent[]) {
      expect(recoveryIntensity(stanceFor(plan({ bottomIntent: intent })).c)).toBe(1);
    }
  });

  it('says nothing at all to a fighter who was given no instruction', () => {
    const { c, stance } = stanceFor(defaultGamePlan());
    expect(intentAuthority(bottomWork(c, stance, 'guard', 0, false))).toBe(0);
    expect(recoveryIntensity(c)).toBe(1);
  });

  it('and is heard better under side control than it used to be', () => {
    /*
     * D7's worst surface, measured. `bottomWork` reads `submissions × 0.8` in guard and the literal
     * 0.05 everywhere else, so under side control a 20-to-30:1 capability gap faced an intent range
     * of about seven to one and the plan was inaudible at **0.11**. Three intents spanning the work
     * axis end to end lift it to 0.52–0.82 without touching a capability.
     *
     * Not fixed — D7 is where the `0.05` gets dealt with. Bounded, so a regression is visible.
     */
    const readings = BOTTOM_INTENTS.map((intent) => {
      const { c, stance } = stanceFor(plan({ bottomIntent: intent }));
      return { intent, authority: intentAuthority(bottomWork(c, stance, 'sideControl', 0, false)) };
    });
    const message = readings.map((r) => `${r.intent} ${r.authority.toFixed(2)}`).join(', ');
    expect(Math.min(...readings.map((r) => r.authority)), message).toBeGreaterThan(0.4);
  });
});

describe('a plan written before any of this still means something', () => {
  it('reads the old five-value instruction for what it said about the work', () => {
    expect(bottomIntentFor('attack')).toBe('attack');
    expect(bottomIntentFor('recover')).toBe('recover');
    for (const legacy of ['standUp', 'scramble', 'playGuard']) {
      expect(bottomIntentFor(legacy), legacy).toBe('defend');
    }
  });

  it('and survives arriving off a save as a value this build has never heard of', () => {
    const migrated = normaliseTactics({
      ...defaultTactics(),
      bottomIntent: 'playGuard',
    } as unknown as TacticalPlan);
    expect(BOTTOM_INTENTS).toContain(migrated.bottomIntent);
    expect(migrated.bottomIntent).toBe('defend');
  });
});

describe('and a fighter who asks to be underneath gets to stay there', () => {
  const FIGHTS = 500;
  const wrestler = makeFighter({
    id: 'f_wrestler',
    attributes: {
      strikingOffence: 58, kicking: 50, strikingDefence: 60, power: 60, speed: 62,
      wrestling: 84, takedownDefence: 80, groundControl: 82, submissions: 60, scrambling: 72,
      cardio: 76, strength: 74, durability: 72, fightIq: 68, composure: 68,
    },
  });
  const guardPlayer = makeFighter({
    id: 'f_guard',
    attributes: {
      strikingOffence: 55, kicking: 52, strikingDefence: 58, power: 52, speed: 60,
      wrestling: 55, takedownDefence: 45, groundControl: 60, submissions: 86, scrambling: 74,
      cardio: 72, strength: 58, durability: 68, fightIq: 72, composure: 74,
    },
  });

  function run(p: GamePlan) {
    let bottomSeconds = 0;
    let escapes = 0;
    let submissions = 0;
    let seconds = 0;
    let episodes = 0;
    for (let i = 0; i < FIGHTS; i++) {
      const r = simulateFight({
        boutId: `bottomvocab:${i}`,
        red: { fighter: guardPlayer, plan: p },
        blue: {
          fighter: wrestler,
          plan: plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control' }),
        },
        rounds: 3,
        seed: `bottomvocab:${i}`,
      });
      bottomSeconds += r.stats.blue.controlSeconds - r.stats.blue.clinchControlSeconds;
      escapes += r.stats.red.escapesAttempted;
      submissions += r.stats.red.submissionAttempts;
      episodes += r.stats.blue.takedownsLanded;
      seconds += (r.round - 1) * 300 + r.timeSeconds;
    }
    return {
      bottomShare: bottomSeconds / seconds,
      /** Seconds underneath per takedown he conceded — how long an episode lasts. */
      secondsPerEpisode: episodes > 0 ? bottomSeconds / episodes : 0,
      escapesPerBottomMinute: escapes / (bottomSeconds / 60),
      submissionsPerFight: submissions / FIGHTS,
    };
  }

  const asking = run(forState('bottom', { bottomIntent: 'attack' }));
  const refusing = run(forState('outside', { bottomIntent: 'attack' }));
  const message =
    `bottom plan ${asking.secondsPerEpisode.toFixed(1)}s/episode, ${asking.escapesPerBottomMinute.toFixed(2)} escapes/min, ` +
    `${asking.submissionsPerFight.toFixed(2)} subs, ${(asking.bottomShare * 100).toFixed(1)}% of the fight | ` +
    `outside plan ${refusing.secondsPerEpisode.toFixed(1)}s/episode, ${refusing.escapesPerBottomMinute.toFixed(2)}/min, ` +
    `${refusing.submissionsPerFight.toFixed(2)} subs, ${(refusing.bottomShare * 100).toFixed(1)}%`;

  it('stops fighting to get up', () => {
    expect(refusing.escapesPerBottomMinute, message).toBeGreaterThan(
      asking.escapesPerBottomMinute * 1.5,
    );
  });

  it('and stays there longer once he is there', () => {
    /*
     * **Asserted per episode, not as a share of the fight, and the first draft got that wrong.**
     *
     * The obvious clock claim — *a man who asks to be underneath spends more of the fight
     * underneath* — is false, measured: 59.8% against 62.3% the other way. Two mechanisms pull on
     * that number and only one of them is this instruction. Fewer escapes make each episode longer;
     * but a bottom preference also reads `takedown` 0.35 and `clinchUp` 0.15 on the *standing* list,
     * so he shoots more, and shooting lands him on top or at distance. The second effect is the
     * larger one.
     *
     * That is docs/01's rule biting on a test rather than on the engine: the mechanism links this
     * instruction to *episode length*, and the fight-clock share is downstream of a second mechanism
     * that has its own opinion. Per episode is where the claim lives.
     */
    expect(asking.secondsPerEpisode, message).toBeGreaterThan(refusing.secondsPerEpisode * 1.15);
  });

  it('with the same instruction about what to do with the time', () => {
    // Both arms are told to attack. The exit moved; the work did not, which is the split.
    expect(asking.submissionsPerFight, message).toBeGreaterThan(refusing.submissionsPerFight);
  });
});
