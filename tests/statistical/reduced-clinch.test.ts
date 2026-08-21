/**
 * The tie-up, at round granularity.
 *
 * `resolveFightByRound` had one control number and no notion of *where* the control happened, so
 * `clinchControlSeconds` came back **0.00 for every fighter in every Reduced fight** — while Full
 * books 18% of an unplanned fighter's control time on the fence and 32% of a clinch fighter's. A
 * judoka and a wrestler were the same man to this resolver.
 *
 * That is not a cosmetic gap. `lessonFrom` reads `controlSeconds − clinchControlSeconds` to decide
 * whether a beaten fighter's hole is *scrambling*, so every career built in a Reduced-simulated
 * world was diagnosed on the assumption that all of it happened on the floor. And D3 — which gives
 * the clinch a behaviour axis of its own — would have had nothing to reach here at all.
 *
 * **What was added is a partition, not a phase.** `controlSeconds` is untouched and this is a share
 * of it, which is the whole of the honesty claim: nothing is created, and the takedowns and strikes
 * that same control already paid for are not counted twice. There is still no tie-up *state* at
 * round granularity, so clinch striking and clinch takedowns stay folded into the generic ones.
 * That limitation is a magnitude one and it is stated in doc 31 § D11 rather than papered over.
 *
 * The directional half of this — a clinch plan produces more tie-up, a range plan less, at both
 * levels — lives in `reduced-direction.test.ts` with the rest of invariant 6a. What is here is what
 * that file cannot say: that the partition is *sound*, and that the two halves of it are driven by
 * the right things.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  resolveFightByRound,
  simulateFight,
  type Fighter,
  type GamePlan,
  type TacticalPlan,
} from '@mmasim/engine';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import { clinchLean, clinchPersistence } from '../../packages/engine/src/fight/policy.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.9, ...t },
});

const NEUTRAL = defaultGamePlan();
const CLINCH = plan({ preferredState: 'clinch', entry: 'pressure' });
const TOP = plan({ preferredState: 'top', entry: 'proactiveWrestling' });
const OUTSIDE = plan({ preferredState: 'outside', entry: 'movement' });
const FOE = plan({ preferredState: 'boxing', entry: 'counter' });

const BASE = {
  strikingOffence: 70, kicking: 58, strikingDefence: 68, power: 68, speed: 66,
  wrestling: 60, takedownDefence: 62, groundControl: 58, submissions: 50, scrambling: 58,
  cardio: 72, strength: 60, durability: 70, fightIq: 68, composure: 70,
} as const;

const at = (strength: number): Fighter =>
  makeFighter({ id: `fighter_str_${strength}`, lastName: `S${strength}`, attributes: { ...BASE, strength } });

const FIGHTS = 500;

interface Sample {
  controlPerFight: number;
  clinchPerFight: number;
  opponentClinchPerFight: number;
  /** Of his control, how much stayed a tie-up. */
  clinchShareOfControl: number;
  /** Whose tie-up it was. The success half. */
  ownership: number;
  subsetViolations: number;
}

function sample(level: 'full' | 'reduced', label: string, red: Fighter, redPlan: GamePlan, blue: Fighter): Sample {
  const resolve = level === 'full' ? simulateFight : resolveFightByRound;
  let control = 0;
  let clinch = 0;
  let opponentClinch = 0;
  let subsetViolations = 0;

  for (let i = 0; i < FIGHTS; i++) {
    const r = resolve({
      boutId: `clinch:${label}:${i}`,
      red: { fighter: red, plan: redPlan },
      blue: { fighter: blue, plan: FOE },
      rounds: 3,
      seed: `clinch:${label}:${i}`,
    });
    for (const corner of ['red', 'blue'] as const) {
      const s = r.stats[corner];
      if (s.clinchControlSeconds > s.controlSeconds + 1e-9 || s.clinchControlSeconds < 0) {
        subsetViolations++;
      }
    }
    control += r.stats.red.controlSeconds;
    clinch += r.stats.red.clinchControlSeconds;
    opponentClinch += r.stats.blue.clinchControlSeconds;
  }

  return {
    controlPerFight: control / FIGHTS,
    clinchPerFight: clinch / FIGHTS,
    opponentClinchPerFight: opponentClinch / FIGHTS,
    clinchShareOfControl: control > 0 ? clinch / control : 0,
    ownership: opponentClinch > 0 ? clinch / opponentClinch : Infinity,
    subsetViolations,
  };
}

const foe = at(60);

describe('the partition is sound', () => {
  it('never books more tie-up than control, at either level', () => {
    /*
     * The one claim that has to be exactly true rather than approximately: `clinchControlSeconds` is
     * defined as a subset of `controlSeconds`, and the post-fight screen subtracts one from the other
     * to draw the ground bar. A single violation would render a negative bar.
     */
    for (const level of ['full', 'reduced'] as const) {
      for (const [name, p] of [['neutral', NEUTRAL], ['clinch', CLINCH], ['top', TOP], ['outside', OUTSIDE]] as const) {
        const s = sample(level, `subset:${level}:${name}`, at(60), p, foe);
        expect(s.subsetViolations, `${level} / ${name}`).toBe(0);
      }
    }
  });

  it('leaves an unplanned fighter where Full leaves him', () => {
    /*
     * Invariant 9: the anchor is what the sport does with no instruction, measured, not a midpoint.
     * Full books 18.0% of an unplanned fighter's control time in a tie-up. Reduced now books 17.5%.
     */
    const full = sample('full', 'anchor:full', at(60), NEUTRAL, foe);
    const reduced = sample('reduced', 'anchor:reduced', at(60), NEUTRAL, foe);
    const message =
      `Full ${(full.clinchShareOfControl * 100).toFixed(1)}% | Reduced ${(reduced.clinchShareOfControl * 100).toFixed(1)}%`;
    expect(Math.abs(reduced.clinchShareOfControl - full.clinchShareOfControl), message).toBeLessThan(0.06);
  });

  it('is exactly 1 for a fighter with no plan, on both halves of the intent term', () => {
    /*
     * Asserted on the mechanism rather than through a simulation, because this is what makes the
     * whole change level-neutral: an unplanned fighter reads 1 on both tables, so `CLINCH_SHARE_OF_
     * CONTROL` is the only thing deciding him and the roster the other constants were measured on is
     * untouched.
     */
    const c = createCombatant('red', at(60), defaultGamePlan());
    expect(clinchLean(c)).toBeCloseTo(1, 10);
    expect(clinchPersistence(c)).toBeCloseTo(1, 10);
  });

  it('separates the two halves of the intent term, which is why both are there', () => {
    /*
     * `clinchLean` is the transition — of the grappling he wants, how much is aimed at the fence.
     * `clinchPersistence` is the in-state decision — having got there, does he keep it or convert
     * it. docs/01 § 8 says those are different questions, and the clinch is where that matters most:
     * a wrestler and a clinch fighter both route to the tie-up and only one of them is still there
     * ten seconds later.
     */
    const of = (p: GamePlan) => {
      const c = createCombatant('red', at(60), p);
      return { lean: clinchLean(c), persistence: clinchPersistence(c) };
    };
    const clinch = of(CLINCH);
    const top = of(TOP);
    const message =
      `clinch lean ${clinch.lean.toFixed(2)} / persistence ${clinch.persistence.toFixed(2)} | ` +
      `top lean ${top.lean.toFixed(2)} / persistence ${top.persistence.toFixed(2)}`;

    // Both plans want grappling; they differ on the route and, much more, on what they do there.
    expect(clinch.lean, message).toBeGreaterThan(top.lean);
    expect(clinch.persistence / top.persistence, message).toBeGreaterThan(clinch.lean / top.lean);
  });
});

describe('desire decides how much tie-up there is; the two fighters decide whose it is', () => {
  /*
   * The clearest statement of invariant 1 this file can make, and it needed measuring at Full before
   * it could be asserted anywhere — because the obvious phrasing is not what Full does.
   *
   * On **how much** clinch happens, intent wins at both levels and always did: 15.7 seconds a fight
   * on a range plan against 88.3 on a clinch plan is 5.6:1, where sweeping strength across the whole
   * roster is worth 1.9:1. That is the ordinary shape — the plan owns the attempt.
   *
   * On **whose tie-up it is**, capability wins, and by more than intent: his own strength moves the
   * ratio 0.78 to 2.88 and the opponent's moves it 4.85 to 1.44, against intent's 0.78 to 2.55.
   * Twelve to one against three to one. That is the half a plan cannot buy.
   */
  const clinchPlan = { full: sample('full', 'auth:f:clinch', at(60), CLINCH, foe), reduced: sample('reduced', 'auth:r:clinch', at(60), CLINCH, foe) };
  const rangePlan = { full: sample('full', 'auth:f:range', at(60), OUTSIDE, foe), reduced: sample('reduced', 'auth:r:range', at(60), OUTSIDE, foe) };

  it('lets the plan decide how much of the fight is a tie-up', () => {
    for (const level of ['full', 'reduced'] as const) {
      const message =
        `${level}: clinch plan ${clinchPlan[level].clinchPerFight.toFixed(1)}s ` +
        `against range plan ${rangePlan[level].clinchPerFight.toFixed(1)}s`;
      expect(clinchPlan[level].clinchPerFight, message).toBeGreaterThan(
        rangePlan[level].clinchPerFight * 2,
      );
    }
  });

  it('and does not let it decide how much of it he keeps', () => {
    /*
     * Asserted on the **share of his control that stayed a tie-up**, which is the quantity the
     * partition actually computes, rather than on the ownership ratio. The ratio is the more
     * intuitive number and the wrong one to bound: it multiplies this mechanism by how much total
     * control each plan bought, which is D10's machinery and where Reduced's remaining magnitude gap
     * lives — a clinch plan buys Reduced more total control than it buys Full. Bounding the compound
     * measures that gap and calls it this one. docs/01: assert on the quantity that carries the
     * claim.
     *
     * The bound is a ratio against the intent span rather than an absolute, so it survives
     * rebalancing: whatever the plan is worth here, the two fighters between them must be worth more.
     */
    for (const level of ['full', 'reduced'] as const) {
      const weak = sample(level, `own:${level}:weak`, at(30), CLINCH, foe);
      const strong = sample(level, `own:${level}:strong`, at(90), CLINCH, foe);
      const stubborn = sample(level, `own:${level}:stubborn`, at(60), CLINCH, at(90));
      const soft = sample(level, `own:${level}:soft`, at(60), CLINCH, at(30));

      const intentSpan = clinchPlan[level].clinchShareOfControl / rangePlan[level].clinchShareOfControl;
      const hisSpan = strong.clinchShareOfControl / weak.clinchShareOfControl;
      const theirsSpan = soft.clinchShareOfControl / stubborn.clinchShareOfControl;
      const message =
        `${level}: intent ${intentSpan.toFixed(2)}:1, his capability ${hisSpan.toFixed(2)}:1, ` +
        `opposition ${theirsSpan.toFixed(2)}:1`;

      expect(hisSpan, message).toBeGreaterThan(1.1);
      expect(theirsSpan, message).toBeGreaterThan(1.1);
      expect(hisSpan * theirsSpan, message).toBeGreaterThan(intentSpan);
    }
  });

  it('and the tie-up belongs to whoever is better in it', () => {
    // The same claim in the number a player would read, kept directional for the reason above.
    for (const level of ['full', 'reduced'] as const) {
      const stubborn = sample(level, `edge:${level}:stubborn`, at(60), CLINCH, at(90));
      const soft = sample(level, `edge:${level}:soft`, at(60), CLINCH, at(30));
      const message =
        `${level}: against a 30-strength foe ${soft.ownership.toFixed(2)}:1, ` +
        `against a 90 ${stubborn.ownership.toFixed(2)}:1`;
      expect(soft.ownership, message).toBeGreaterThan(stubborn.ownership * 1.5);
    }
  });

  it('so a fighter who cannot hold a tie-up does not get one by asking', () => {
    for (const level of ['full', 'reduced'] as const) {
      const weak = sample(level, `ask:${level}:weak`, at(30), CLINCH, at(90));
      const strong = sample(level, `ask:${level}:strong`, at(90), NEUTRAL, at(30));
      const message =
        `${level}: weak-but-willing ${weak.clinchPerFight.toFixed(1)}s at ${weak.ownership.toFixed(2)}:1, ` +
        `strong-but-unasked ${strong.clinchPerFight.toFixed(1)}s at ${strong.ownership.toFixed(2)}:1`;
      // He may well spend more of the fight in a tie-up — he is asking for it. It is not his.
      expect(weak.ownership, message).toBeLessThan(strong.ownership);
    }
  });
});
