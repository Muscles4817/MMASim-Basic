/**
 * The tie-up gets an instruction of its own.
 *
 * The clinch was the only position in the engine whose *in-state* behaviour was read off
 * `preferredState` — the field that answers *where do I want the fight*. One instruction doing two
 * jobs, and the measurement said what that cost: the controlling clinch was the **lowest-authority
 * decision surface in the game**, 0.56 to 1.35 at full conviction against 2.11–4.82 at range, and a
 * clinch preference spent 64% of its beats striking against 13.9% holding. A player could ask for
 * the tie-up. He could not ask for anything to be done with it.
 *
 * `clinchIntent` is that instruction, and this file is what it bought. Three things travel with it
 * and are asserted here too, because the axis does not describe a complete strategy without them:
 *
 *  - **D13.** The man holding the tie-up could not let go of it — D2's hole, one position over.
 *  - **D15.** Being held on the fence cost exactly what holding it cost, so `control` would have
 *    bought clock and judges' points and no attrition, which is most of what pinning somebody is for.
 *  - And the exits stay on `preferredState` while the work moves to `clinchIntent`, which is the
 *    rule D2 established: *intents own what stays within or advances the grappling; `preferredState`
 *    owns the exits back to the feet.*
 *
 * Most of what follows is asserted on the decision itself rather than through a simulation, because
 * these are claims about what a fighter *chooses* and a fight only adds noise to them (docs/01,
 * "assert as close as possible to the mechanism"). The behavioural half is kept for the two things
 * arithmetic cannot show: that the release survives contact, and that success stayed with the
 * fighters.
 */

import { describe, expect, it } from 'vitest';
import {
  CLINCH_INTENTS,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  simulateFight,
  type ClinchIntent,
  type Fighter,
  type GamePlan,
  type PreferredState,
  type TacticalPlan,
} from '@mmasim/engine';
import { createCombatant, CLINCH_HELD_COST, GROUND_BOTTOM_COST, POSITION_COST } from '../../packages/engine/src/fight/profile.js';
import { stanceOf } from '../../packages/engine/src/fight/policy.js';
import { accrueFatigue } from '../../packages/engine/src/fight/stamina.js';
import { actionShares, intentAuthority } from '../../packages/engine/src/fight/decide.js';
import { controllingCandidates, heldWork } from '../../packages/engine/src/fight/simulate.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.9, ...t },
});

const BASE = {
  strikingOffence: 70, kicking: 58, strikingDefence: 68, power: 68, speed: 66,
  wrestling: 62, takedownDefence: 62, groundControl: 58, submissions: 50, scrambling: 58,
  cardio: 72, strength: 66, durability: 70, fightIq: 68, composure: 70,
};

const at = (over: Partial<typeof BASE> = {}): Fighter =>
  makeFighter({ id: `fighter_${JSON.stringify(over)}`, attributes: { ...BASE, ...over } });

const foe = at();

/** The controlling fighter's decision, with no fight attached. */
function controlling(p: GamePlan, fighter: Fighter = at()) {
  const a = createCombatant('red', fighter, p);
  const b = createCombatant('blue', foe, defaultGamePlan());
  return controllingCandidates(a, b, stanceOf(a, undefined, false));
}

/** And the held fighter's. */
function held(p: GamePlan, fighter: Fighter = at()) {
  const a = createCombatant('red', fighter, p);
  const b = createCombatant('blue', foe, defaultGamePlan());
  return heldWork(a, b, stanceOf(a, undefined, false), false);
}

const inClinch = (intent: ClinchIntent, state: PreferredState = 'clinch') =>
  plan({ preferredState: state, entry: state === 'clinch' ? 'clinchEntries' : 'movement', clinchIntent: intent });

describe('what the fighter does with a tie-up he means to keep', () => {
  const shares = (intent: ClinchIntent) => actionShares(controlling(inClinch(intent)));

  it('holds it when told to control it', () => {
    // 50.6% against the 13.9% a clinch preference could manage before the axis existed.
    const s = shares('control');
    expect(s.maintainPosition, `maintain ${(s.maintainPosition * 100).toFixed(1)}%`).toBeGreaterThan(0.4);
    expect(s.maintainPosition).toBeGreaterThan(shares('damage').maintainPosition * 5);
    expect(s.maintainPosition).toBeGreaterThan(shares('takedown').maintainPosition * 5);
  });

  it('hits from it when told to do damage', () => {
    const s = shares('damage');
    expect(s.clinchStrike, `strike ${(s.clinchStrike * 100).toFixed(1)}%`).toBeGreaterThan(0.6);
    expect(s.clinchStrike).toBeGreaterThan(shares('control').clinchStrike * 2.5);
  });

  it('takes it to the floor when told to', () => {
    const s = shares('takedown');
    expect(s.takedown, `takedown ${(s.takedown * 100).toFixed(1)}%`).toBeGreaterThan(0.7);
    expect(s.takedown).toBeGreaterThan(shares('control').takedown * 2.5);
  });

  it('reads `control` as *this tie-up*, which is decision A and is deliberate', () => {
    /*
     * The semantic question the design put up, settled here in a number so the screen's wording can
     * be checked against it. `control` is **A — keep this tie-up** — not B, *prioritise position over
     * damage, takedowns included*. The first draft implemented B by accident at 36% takedowns
     * against 46% holding, and it was rejected because three intents that overlap are three intents
     * that do not separate.
     *
     * It is not zero and should not be: 25.4% of a controlling fighter's beats are still a takedown,
     * because the takedown's *capability* is in the draw and a good wrestler is a good wrestler
     * whatever he was told. That is invariant 1, not a leak. What the instruction buys is the
     * emphasis, and holding outweighs shooting two to one.
     */
    const s = shares('control');
    const message = `maintain ${(s.maintainPosition * 100).toFixed(1)}% against takedown ${(s.takedown * 100).toFixed(1)}%`;
    expect(s.maintainPosition, message).toBeGreaterThan(s.takedown * 1.6);
    expect(s.takedown, message).toBeLessThan(shares('takedown').takedown * 0.45);
  });
});

describe('and from the wrong end of it', () => {
  it('stays coherent: the same instruction, read from underneath', () => {
    /*
     * One field, two tables. `reverse` is the held man's route to both control and a takedown —
     * he cannot shoot from underneath a tie-up, he has to take the position first — and `pummel` is
     * the hand-fighting that keeps a tie-up alive without spending it.
     */
    const s = (i: ClinchIntent) => actionShares(held(inClinch(i)));
    const control = s('control');
    const damage = s('damage');
    const takedown = s('takedown');
    const message =
      `control ${(control.reverse * 100).toFixed(0)}% reverse / ${(control.pummel * 100).toFixed(0)}% pummel | ` +
      `damage ${(damage.clinchStrike * 100).toFixed(0)}% strike | takedown ${(takedown.reverse * 100).toFixed(0)}% reverse`;

    expect(damage.clinchStrike, message).toBeGreaterThan(0.5);
    expect(damage.clinchStrike, message).toBeGreaterThan(control.clinchStrike * 4);
    expect(takedown.reverse, message).toBeGreaterThan(control.reverse);
    expect(control.pummel, message).toBeGreaterThan(damage.pummel);
  });
});

describe('the corner can be heard in the one position where it could not', () => {
  it('raises the controlling clinch off the floor of the authority table', () => {
    /*
     * Not calibrated to a universal value — docs/01 § 7 is explicit that comparability is D7's job
     * and this change is not it. What is asserted is the two things D3 owns: the surface is no
     * longer the quietest in the engine, and its authority no longer depends on *which* plan is set,
     * which is the subtler half. Before: 0.56 to 1.35 across five preferences, the low end being a
     * fighter who wanted the fight standing. After: 1.28 to 1.90.
     */
    const readings = CLINCH_INTENTS.flatMap((intent) =>
      (['clinch', 'outside', 'boxing', 'top'] as PreferredState[]).map((state) => ({
        label: `${state}/${intent}`,
        authority: intentAuthority(controlling(inClinch(intent, state))),
      })),
    );
    const lo = Math.min(...readings.map((r) => r.authority));
    const hi = Math.max(...readings.map((r) => r.authority));
    const message = readings.map((r) => `${r.label} ${r.authority.toFixed(2)}`).join(', ');

    expect(lo, message).toBeGreaterThan(1);
    expect(hi / lo, message).toBeLessThan(2);
  });

  it('and says nothing at all to a fighter who was given no instruction', () => {
    /*
     * The property that makes every one of these changes level-neutral: `bias` returns exactly 1 at
     * zero urgency, so the roster the sport is calibrated on is untouched by a new table.
     */
    const s = actionShares(controlling(defaultGamePlan()));
    expect(intentAuthority(controlling(defaultGamePlan()))).toBe(0);
    // The four candidates in their bare capability ratio, which is what the engine did before.
    expect(s.takedown).toBeGreaterThan(s.clinchStrike);
    expect(s.clinchStrike).toBeGreaterThan(s.maintainPosition);
  });

  it('leaves whether it works to the two fighters', () => {
    /*
     * Invariant 1. At a fixed instruction, sweeping strength across the whole roster moves the
     * *share* by four points — the plan owns the attempt. Whether the takedown comes off is
     * `resolveTakedown`, whether the knee lands is `throwClinchStrike`, and neither was touched.
     */
    const spread = [30, 60, 90].map((strength) =>
      actionShares(controlling(inClinch('takedown'), at({ strength }))).takedown,
    );
    const message = spread.map((v) => `${(v * 100).toFixed(1)}%`).join(' → ');
    expect(Math.max(...spread) / Math.min(...spread), message).toBeLessThan(1.15);
  });
});

/* ---------------------------------------------------------------------------------------------
 * D13 — the man holding the tie-up can let go of it
 * ------------------------------------------------------------------------------------------- */

describe('and he can let go, which he could not before', () => {
  const releaseShare = (state: PreferredState, intent: ClinchIntent = 'damage') =>
    actionShares(controlling(inClinch(intent, state))).clinchDisengage;

  it('is owned by where he wants the fight, not by what he is doing in the tie-up', () => {
    /*
     * D2's rule, and the reason `clinchDisengage` is keyed on `preferredState` while everything
     * beside it in the list is keyed on `clinchIntent`. *Do I want a tie-up at all* is not a question
     * the in-state field can answer, and a striker who ends up with the grips wants out of them
     * whether his corner told him to knee, hold or shoot.
     */
    const outsideSpread = CLINCH_INTENTS.map((i) => releaseShare('outside', i));
    const clinchSpread = CLINCH_INTENTS.map((i) => releaseShare('clinch', i));
    const message =
      `outside ${outsideSpread.map((v) => (v * 100).toFixed(1)).join('/')}% | ` +
      `clinch ${clinchSpread.map((v) => (v * 100).toFixed(1)).join('/')}%`;

    expect(Math.min(...outsideSpread), message).toBeGreaterThan(Math.max(...clinchSpread) * 3);
  });

  it('has a standing-oriented fighter releasing materially more often', () => {
    const message = `outside ${(releaseShare('outside') * 100).toFixed(1)}% against clinch ${(releaseShare('clinch') * 100).toFixed(1)}%`;
    expect(releaseShare('outside'), message).toBeGreaterThan(0.15);
    expect(releaseShare('outside'), message).toBeGreaterThan(releaseShare('clinch') * 5);
  });

  it('and a fighter who came for the tie-up almost never doing it', () => {
    expect(releaseShare('clinch', 'control')).toBeLessThan(0.06);
    expect(releaseShare('top', 'takedown')).toBeLessThan(0.08);
  });

  it('does not suppress the clinch work of a fighter who wants to stay', () => {
    /*
     * The bound that makes "no material suppression" checkable rather than rhetorical, and the same
     * one D2 used: whatever the new candidate takes off the other three it takes exactly its own
     * share, so asserting the share is small *is* asserting the suppression is small.
     */
    for (const intent of CLINCH_INTENTS) {
      const s = actionShares(controlling(inClinch(intent)));
      const message = `${intent}: release ${(s.clinchDisengage * 100).toFixed(1)}%`;
      expect(s.clinchDisengage, message).toBeLessThan(0.05);
      expect(s.takedown + s.clinchStrike + s.maintainPosition, message).toBeGreaterThan(0.95);
    }
  });

  it('leaves whether he shakes him off to the two of them', () => {
    /*
     * The decision is damped at an exponent of 0.25 (invariant 1a) so `clinchDefence` barely moves
     * the *choice*; it weighs at full strength in the contest, which is where a 6.8:1 rating spread
     * belongs. Measured through fights below.
     */
    const spread = [30, 60, 90].map(
      (strength) => actionShares(controlling(inClinch('damage', 'outside'), at({ strength }))).clinchDisengage,
    );
    const message = spread.map((v) => `${(v * 100).toFixed(1)}%`).join(' → ');
    expect(Math.max(...spread) / Math.min(...spread), message).toBeLessThan(1.4);
  });
});

describe('and it survives contact', () => {
  const FIGHTS = 1200;

  function fights(redPlan: GamePlan, red: Fighter, blue: Fighter) {
    let attempted = 0;
    let landed = 0;
    let clinchSeconds = 0;
    for (let i = 0; i < FIGHTS; i++) {
      const r = simulateFight({
        boutId: `clinchintent:${i}`,
        red: { fighter: red, plan: redPlan },
        blue: { fighter: blue, plan: plan({ preferredState: 'clinch', entry: 'clinchEntries', clinchIntent: 'control' }) },
        rounds: 3,
        seed: `clinchintent:${i}`,
      });
      attempted += r.stats.red.clinchExitsAttempted;
      landed += r.stats.red.clinchExitsLanded;
      clinchSeconds += r.stats.red.clinchControlSeconds;
    }
    return {
      attemptsPerClinchMinute: clinchSeconds > 0 ? attempted / (clinchSeconds / 60) : 0,
      successRate: attempted > 0 ? landed / attempted : 0,
      attempts: attempted,
    };
  }

  const wantsOut = fights(inClinch('damage', 'outside'), at(), foe);
  const wantsIn = fights(inClinch('control', 'clinch'), at(), foe);

  it('a striker who ends up with the grips actually gets rid of them', () => {
    const message =
      `outside plan ${wantsOut.attemptsPerClinchMinute.toFixed(2)} att/clinch-min at ` +
      `${(wantsOut.successRate * 100).toFixed(1)}% (n=${wantsOut.attempts}) | ` +
      `clinch plan ${wantsIn.attemptsPerClinchMinute.toFixed(2)} at ${(wantsIn.successRate * 100).toFixed(1)}%`;
    expect(wantsOut.attemptsPerClinchMinute, message).toBeGreaterThan(wantsIn.attemptsPerClinchMinute * 3);
    expect(wantsOut.successRate, message).toBeGreaterThan(0.3);
  });

  it('and the capability gap shows up in whether it works, not in how often he tries', () => {
    // The three ratings `clinchDefence` is built from, swept end to end, because a release is a
    // few hundred attempts even over twelve hundred fights and a narrow sweep measures the sample.
    const weak = fights(inClinch('damage', 'outside'), at({ strength: 25, takedownDefence: 30, strikingDefence: 35 }), foe);
    const strong = fights(inClinch('damage', 'outside'), at({ strength: 92, takedownDefence: 90, strikingDefence: 85 }), foe);
    const message =
      `weak ${weak.attemptsPerClinchMinute.toFixed(2)} att/min at ${(weak.successRate * 100).toFixed(1)}% | ` +
      `strong ${strong.attemptsPerClinchMinute.toFixed(2)} at ${(strong.successRate * 100).toFixed(1)}%`;
    // Measured 1.29 across a 30/40 against 90/85 sweep of the two ratings `clinchDefence` is built
    // from. The bound is under it because the sample is thin — a release is a few hundred attempts
    // over four hundred fights — not because the effect is.
    expect(strong.successRate / weak.successRate, message).toBeGreaterThan(1.2);
  });
});

/* ---------------------------------------------------------------------------------------------
 * D15 — a tie-up stops costing both men the same
 * ------------------------------------------------------------------------------------------- */

describe('being held on the fence costs more than holding it', () => {
  const after = (position: 'clinch' | 'ground', isControlled: boolean) => {
    const c = createCombatant('red', at(), defaultGamePlan());
    accrueFatigue(c, {
      position,
      groundPosition: position === 'ground' ? 'sideControl' : undefined,
      isControlled,
      intensity: 1.15,
      seconds: 60,
    });
    return c.fatigue;
  };

  it('which the engine computed and then ignored', () => {
    /*
     * `accrueFatigue` has taken `isControlled` for the clinch since the tie-up got two sides, and
     * read it only on the floor. A man pinned against the cage paid exactly what the man pinning him
     * paid, so `clinchIntent: 'control'` would have bought clock and judges' points and no attrition
     * — which is most of what holding somebody there is for.
     */
    const holding = after('clinch', false);
    const beingHeld = after('clinch', true);
    const message = `holding ${holding.toFixed(5)} against held ${beingHeld.toFixed(5)}`;
    expect(beingHeld, message).toBeGreaterThan(holding * 1.25);
  });

  it('and the man doing the holding still pays for it', () => {
    // The tie-up is the most expensive place in the fight for *both* men, and was before this.
    expect(after('clinch', false)).toBeGreaterThan(after('ground', false));
  });

  it('in a relationship that is not absurd next to the floor', () => {
    /*
     * Calibrated against the analogous ground distinction rather than chosen: side control charges
     * the man underneath 1.5× the man on top, and the fence charges 1.4× — a little less, because a
     * man on the fence still has his feet under him and can hand-fight, which is more than a man
     * under side control has.
     */
    const fenceRatio = after('clinch', true) / after('clinch', false);
    const floorRatio = after('ground', true) / after('ground', false);
    const message = `fence ${fenceRatio.toFixed(2)}× against floor ${floorRatio.toFixed(2)}×`;
    expect(fenceRatio, message).toBeLessThan(floorRatio);
    expect(fenceRatio, message).toBeGreaterThan(floorRatio * 0.8);
    expect(CLINCH_HELD_COST).toBeLessThan(GROUND_BOTTOM_COST.sideControl);
    // And no sport-wide stamina constant moved to get there.
    expect(POSITION_COST).toEqual({ distance: 0.75, clinch: 1.45, ground: 1.15 });
  });

  it('so holding somebody there is finally worth something beyond the clock', () => {
    /*
     * The payoff, and it is asserted here on the mechanism rather than through fights because the
     * behavioural half cannot be separated from everything else in a single suite — the honest
     * experiment is to toggle the constant, which a test cannot do.
     *
     * Toggled during development, over 800 fights of a 84-strength clinch fighter against a better
     * boxer, `CLINCH_HELD_COST` 1.0 against 1.4:
     *
     *   clinch / control      72.5% → **78.0%** win rate
     *   clinch / damage       78.8% → 81.0%
     *   boxing / counter      74.0% → 74.9%
     *   outside / movement    60.9% → 61.6%
     *
     * Five and a half points to the plan that holds people and under a point to the plans that do
     * not, which is the shape a positional attrition term should have. The opponent's *first*-round
     * output falls with it, 17.5 to 16.4, because he is carrying weight from the opening minute.
     *
     * What is asserted is the thing that makes all of that true: a second of being held costs more
     * than a second of holding, and the fighter doing the holding is not being paid for free.
     */
    const holding = after('clinch', false);
    const beingHeld = after('clinch', true);
    expect(beingHeld / holding).toBeCloseTo(CLINCH_HELD_COST, 6);
    expect(holding).toBeGreaterThan(0);
  });
});
