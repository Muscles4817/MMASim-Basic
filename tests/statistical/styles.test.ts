/**
 * Can the simulator tell two martial arts apart?
 *
 * This is the instrument docs/19 phase 0 exists to build. Every other statistical suite
 * measures outcomes — who won, how it ended, how often it went to the cards — so before this
 * file, **nothing in the codebase asserted stylistic differentiation at all**, and every
 * proposed expressiveness change was therefore unfalsifiable.
 *
 * The four goals from docs/19 §1, and where each is asserted:
 *
 *  - **G1 separation** — discipline pairs differ by more than the scouting error term. Here.
 *  - **G2 legibility** — no commentary line names a technique the resolver did not resolve.
 *    Phase 1, as a parity test, because the resolver must record the technique first.
 *  - **G3 persistence** — a fingerprint at 34 still resembles the one at 24. Phase 4, in the
 *    long-sim tier, because it is a claim about careers rather than about fights.
 *  - **G4 consequence** — style changes *whether* you win, not just how. Here.
 *
 * ---
 *
 * **The baseline this file records, measured against `ARCHETYPES.contender()` over 400 fights
 * per exemplar with default game plans on both sides:**
 *
 * ```
 *              kickShare  legTarget  grappling  subMix  control  distance
 * boxing           0.161      0.030      0.181   0.692    0.194     0.280
 * kickboxing       0.423      0.130      0.190   0.710    0.172     0.260
 * karate           0.471      0.142      0.192   0.640    0.236     0.285
 * wrestling        0.244      0.043      0.298   0.393    0.420     0.308
 * jiuJitsu         0.381      0.070      0.175   0.489    0.258     0.372
 * judo             0.240      0.042      0.340   0.473    0.374     0.278
 * ```
 *
 * `distanceShare` is trustworthy for the first time in this table: step 6.0 stopped the simulator
 * booking a transition's seconds against the position it landed in, which lifted the column by
 * 0.017–0.022 and cost `controlShare` about 0.005. Nothing else moved — the separations are the
 * same to three decimal places, which is what a measurement fix should look like.
 *
 * **Measured under the plans the world gives these fighters**, which is `planFor` on both corners
 * since docs/19 phase 5. That is a change of instrument as well as of engine, and both moved at
 * once — the previous table, measured on the neutral default that every AI fight used to run on,
 * is in the git history and in doc 19 §8.1.
 *
 * **Phase 1 moved one axis and one goal.** `kickShare` roughly doubled everywhere and spread out
 * (boxing 0.081 → 0.163, karate 0.358 → 0.430), and G4 is met (see below).
 *
 * **Phase 2 moved the second axis as far as it can go, which is not far enough.** Targeting is no
 * longer one table for the whole roster — a boxer aims low on 2.6% of shots against a karateka's
 * 10.6%, where at the phase 0 baseline every fighter sat at 0.115 because the plan sent 15% of
 * *everybody's* shots at the legs. The separation on that axis went 0.044 → 0.080 between those
 * two, and the mechanism responds to attributes far harder than the disciplines exercise it:
 * probed across the plausible range, a hands-only fighter reads 0.003 and a pure kicker 0.132.
 *
 * **Phase 5 broke G1 open, and it was the cheapest phase in the programme.** Giving the world real
 * game plans took `approachWeight` from a table the whole roster read one row of to a table each
 * art reads its own row of, and **four of the fifteen pairs now meet G1** — boxing/wrestling,
 * kickboxing/wrestling, kickboxing/judo and karate/wrestling — against zero from the weapon
 * primitive, the targeting rewrite and the trait work put together.
 *
 * What came alive is what phase 2 predicted would have to: `submissionMix` and `controlShare`,
 * the *position* axes. `grapplingShare` spread from 0.13–0.23 to 0.18–0.34 and `controlShare` from
 * 0.17–0.34 to 0.18–0.42, because a quarter of the roster is now told to wrestle or grind and the
 * rest are told not to. `legTargetShare` also cleared its old ceiling — kickboxing 0.080 → 0.128,
 * karate 0.106 → 0.144 — because the plan's `legs` weight is no longer 0.15 for everybody, which
 * is exactly the cap phase 2 measured and could not lift from inside the engine.
 *
 * **The eleven pairs that remain are a shape, not a list.** Every one of them is a pair from the
 * *same family*: the three striking arts against each other, the three grappling arts against each
 * other. Plans separate families. Only positions separate members of a family — which is the case
 * for phase 6, now stated by measurement rather than by argument.
 *
 * Two assertions below are **tripwires**: they assert a defect rather than a design, and they
 * are supposed to break when the phase that fixes them lands. Each says so at the site.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  COMBAT_DISCIPLINES,
  makeFighter,
  type AttributeKey,
  type CombatDiscipline,
  type Fighter,
} from '@mmasim/engine';
import {
  SCOUTING_ERROR,
  SEPARATION_TARGET,
  describeFingerprint,
  disciplineExemplar,
  maxSeparation,
  measureFingerprint,
  separatedAxes,
  type Fingerprint,
} from '../helpers/fingerprint.js';
import { describeSummary, runMatchup } from '../helpers/sim.js';

/** Measured once and shared: six exemplars at 400 fights each. */
let cached: Map<CombatDiscipline, Fingerprint> | undefined;
function prints(): Map<CombatDiscipline, Fingerprint> {
  cached ??= new Map(
    COMBAT_DISCIPLINES.map((d) => [d, measureFingerprint(disciplineExemplar(d))] as const),
  );
  return cached;
}

function pairs(): [CombatDiscipline, CombatDiscipline][] {
  const out: [CombatDiscipline, CombatDiscipline][] = [];
  for (let i = 0; i < COMBAT_DISCIPLINES.length; i++) {
    for (let j = i + 1; j < COMBAT_DISCIPLINES.length; j++) {
      out.push([COMBAT_DISCIPLINES[i]!, COMBAT_DISCIPLINES[j]!]);
    }
  }
  return out;
}

describe('the instrument works before it is trusted', () => {
  it('gives the same fighter the same fingerprint twice', () => {
    // The whole suite is a comparison of measurements, so a measurement that wanders is worse
    // than no measurement. Cheap sample: this is asserting determinism, not a distribution.
    const boxer = disciplineExemplar('boxing');
    const a = measureFingerprint(boxer, { fights: 40 });
    const b = measureFingerprint(boxer, { fights: 40 });
    expect(a).toEqual(b);
  });

  it('tells two fighters apart when they really are different', () => {
    /*
     * Non-vacuousness. Every claim below is of the form "these two are not far enough apart",
     * and a broken instrument would satisfy all of them by reading flat for everybody. So:
     * the most extreme pair the fixtures contain — an elite striker with no takedown defence
     * against a suffocating top-control wrestler — must separate loudly.
     *
     * Measured: kickShare 0.282 vs 0.028, grapplingShare 0.072 vs 0.276, controlShare 0.157
     * vs 0.625. Three axes clear of the target, so the instrument can see a style when the
     * engine actually produces one.
     */
    const striker = measureFingerprint(ARCHETYPES.striker());
    const smotherer = measureFingerprint(ARCHETYPES.smotherer());
    const axes = separatedAxes(striker, smotherer);

    expect(
      axes.length,
      `striker ${describeFingerprint(striker)} vs smotherer ${describeFingerprint(smotherer)}`,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('G1 — separation between the six disciplines', () => {
  it('gives every pair some daylight rather than none at all', () => {
    /*
     * The floor, set where the engine honestly is: the closest pair (jiu-jitsu against judo)
     * differs by 0.066 on its widest axis. That is well inside the scouting error term and so
     * carries no meaning for a player — but it is not zero, and it must never become zero.
     *
     * This is the assertion that catches a change which *flattens* the world: a rebalance
     * that quietly made two arts identical would otherwise be invisible.
     */
    for (const [a, b] of pairs()) {
      const separation = maxSeparation(prints().get(a)!, prints().get(b)!);
      expect(separation, `${a} vs ${b}: ${describeFingerprint(prints().get(a)!)}`).toBeGreaterThan(
        0.05,
      );
    }
  });

  it('keeps shot selection genuinely different between hands and feet', () => {
    // The one axis on which the engine expresses style clear of the error term, and therefore
    // the one this suite must protect while everything else is being changed. Measured 0.308,
    // and the only axis in the fingerprint with the dynamic range to reach the target at all:
    // probed across the plausible attribute range it runs 0.070 to 0.663.
    const boxing = prints().get('boxing')!;
    const karate = prints().get('karate')!;
    expect(
      Math.abs(boxing.kickShare - karate.kickShare),
      `boxing ${describeFingerprint(boxing)} vs karate ${describeFingerprint(karate)}`,
    ).toBeGreaterThanOrEqual(SEPARATION_TARGET);
  });

  it('separates the striking arts from the grappling arts on a shape, not a number', () => {
    /*
     * **This was the sharpest tripwire in the file and phase 5 broke it, which is the whole point
     * of the programme.** It asserted, for three phases, that not one of the fifteen pairs met G1.
     *
     * Four do now: boxing/wrestling, kickboxing/wrestling, kickboxing/judo and karate/wrestling.
     * The bound is set at three rather than at four, because what is being defended is "the engine
     * can tell a striker from a grappler by their shape", not the exact count — and the count is
     * the number most likely to move by a tenth on any honest change to the world's plans.
     *
     * Every one of the four is a striker against a grappler. The eleven that remain are pairs from
     * the same family, and the axes they would need are positional. That is the case for phase 6,
     * and this assertion is where it will be proved: when positions land, this should read
     * fifteen and become the G1 target itself.
     */
    const met = pairs().filter(
      ([a, b]) => separatedAxes(prints().get(a)!, prints().get(b)!).length >= 2,
    );

    expect(
      met.map(([a, b]) => `${a}/${b}`).length,
      `pairs meeting G1: ${met.map(([a, b]) => `${a}/${b}`).join(', ') || 'none'}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('has not separated a single same-family pair, which is what phase 6 is for', () => {
    /*
     * **Tripwire**, and the successor to the one above: the *complement* of what phase 5 achieved.
     *
     * Boxing against kickboxing against karate; wrestling against judo against jiu-jitsu. Six
     * pairs, none of them meeting G1, and the reason is structural rather than tuned — two arts
     * that want the same phase of the fight and reach for it with the same intents can only be
     * told apart by *where inside that phase* they operate, and the engine has one standing
     * position and one clinch. Kickboxing against karate is 0.073 at its widest, jiu-jitsu against
     * judo 0.165, wrestling against judo 0.077.
     *
     * When phase 6's positions land this breaks. Invert it then to the G1 target for every pair.
     */
    const striking: CombatDiscipline[] = ['boxing', 'kickboxing', 'karate'];
    const grappling: CombatDiscipline[] = ['wrestling', 'jiuJitsu', 'judo'];
    const sameFamily = pairs().filter(
      ([a, b]) =>
        (striking.includes(a) && striking.includes(b)) ||
        (grappling.includes(a) && grappling.includes(b)),
    );

    const met = sameFamily.filter(
      ([a, b]) => separatedAxes(prints().get(a)!, prints().get(b)!).length >= 2,
    );
    expect(
      met.map(([a, b]) => `${a}/${b}`),
      `same-family pairs now meeting G1 — phase 6 has landed, raise this`,
    ).toEqual([]);
  });

  it('can finally tell the two grappling arts apart, but not clearly enough', () => {
    /*
     * Jiu-jitsu against judo was the sharpest single number in this file: **0.058 at its widest,
     * less than half the scouting error term** — two disciplines the creation screen offers as
     * different choices and the simulator played identically. It survived phases 1, 2 and 3
     * untouched, and the file said plainly that nothing short of positions would move it.
     *
     * Phase 5 moved it to **0.165**, which is past the scouting error term and still short of the
     * 0.20 target. Game plans did it: the planner sends judo to `wrestle` or `grind` and jiu-jitsu
     * to a striking approach, because a jiu-jitsu exemplar's `chainWrestling` cannot get the fight
     * to the floor against a contender — which is both a real property of the art in MMA and an
     * accident of the exemplar. So it is bounded from *both* sides here: above the error term, and
     * short of the target, because the remaining gap is the positional one and claiming otherwise
     * would be claiming phase 6 had already happened.
     */
    const jiuJitsu = prints().get('jiuJitsu')!;
    const judo = prints().get('judo')!;
    const separation = maxSeparation(jiuJitsu, judo);
    expect(
      separation,
      `jiuJitsu ${describeFingerprint(jiuJitsu)} vs judo ${describeFingerprint(judo)}`,
    ).toBeGreaterThan(SCOUTING_ERROR);
    expect(separation).toBeLessThan(SEPARATION_TARGET);
  });
});

describe('G4 — style decides whether you win, not just how', () => {
  /**
   * A 60-point swing on one attribute, everything else held at contender level.
   *
   * Both corners get the same seed sequence, so the only difference between the two runs is
   * the attribute — the same controlled-comparison trick the preparation tests use.
   */
  function swing(key: AttributeKey, fights = 3000): { low: number; high: number; pp: number } {
    const at = (value: number): Fighter =>
      makeFighter({
        id: `fighter_swing_${key}`,
        lastName: 'Swing',
        attributes: { ...ARCHETYPES.contender().attributes, [key]: value },
      });

    const low = runMatchup(at(38), ARCHETYPES.contender(), { fights, seedPrefix: `swing:${key}` });
    const high = runMatchup(at(98), ARCHETYPES.contender(), { fights, seedPrefix: `swing:${key}` });
    return {
      low: low.redWinRate,
      high: high.redWinRate,
      pp: (high.redWinRate - low.redWinRate) * 100,
    };
  }

  it('makes being a far better wrestler worth winning fights', () => {
    // The yardstick G4 is measured against: 41.1% → 54.7%, a 13.6-point swing, and the largest
    // of the four. 13.6 at the phase 0 baseline, 10.9 after phase 1 gave the striking half of
    // the sport more danger, and 12.5 on this same probe immediately before phase 2 — so the
    // 1.1 points between that and the number above are inside the measurement's own noise and
    // should be read as unchanged rather than as phase 2 moving it.
    const wrestling = swing('wrestling');
    expect(wrestling.pp, `wrestling swing ${wrestling.pp.toFixed(1)}pp`).toBeGreaterThan(8);
  });

  it('makes being a far better striker worth winning fights', () => {
    /*
     * 44.0% → 54.2%: a 10.2-point swing, from 12.1 after phase 1.
     *
     * The bound came down from 10 with it, and deliberately not to just under the measurement:
     * what is being defended is "the hands are a real attribute", and a bound set at the current
     * number would fail on the next honest change that spends a point of it somewhere else. The
     * assertion that hands stay *ahead of the feet* is the one that carries the design promise,
     * and it is stated separately below.
     */
    const striking = swing('strikingOffence');
    expect(striking.pp, `strikingOffence swing ${striking.pp.toFixed(1)}pp`).toBeGreaterThan(8);
  });

  it('makes being a far better kicker worth winning fights, like every other weapon', () => {
    /*
     * **This was the sharpest tripwire in the file and phase 1 broke it, which is the point.**
     *
     * Before `WEAPON_PROFILE`, sixty rating points of `kicking` — the difference between somebody
     * who cannot kick and an all-time kicker — moved the win rate by **−1.3 points**: not small,
     * *zero*, and if anything the wrong way. The kicks landed more often and then did exactly what
     * a jab does, because `rollFlushness`, `strikeDamage` and `knockdownHazard` never asked what
     * was thrown.
     *
     * Phase 1: 45.6% → 55.3%, a **+9.7-point** swing, against `wrestling`'s 10.9. G4 asked for
     * "variance comparable to `wrestling`'s" and that was it.
     *
     * Phase 2: 47.0% → 55.2%, **+8.2 points**, against `wrestling`'s 13.6. Still a real
     * attribute, no longer a comparable one — and the reason is worth stating, because it is a
     * deliberate trade rather than a regression. Targeting now reads the fighter, so a fighter
     * who cannot kick **stops aiming at the legs** instead of throwing kicks they are bad at:
     * the low end of this swing rose by 1.4 points while the high end barely moved. Playing to
     * your strengths is worth about a point and a half of the penalty for having a weakness, and
     * that is true of any adaptive behaviour an engine grows. The alternative — measured, not
     * assumed — is to drop the gate, which returns `kicking` to 9.5 and drops `strikingOffence`
     * to 8.6, i.e. it buys the number back by making the feet beat the hands. Not worth it.
     *
     * The bound stays below the measured value rather than at it, because the claim being
     * defended is "kicking is a real attribute", not "kicking is worth 8.2 points".
     */
    const kicking = swing('kicking');
    expect(
      kicking.pp,
      `kicking swing ${kicking.pp.toFixed(1)}pp (low ${(kicking.low * 100).toFixed(1)}% high ${(kicking.high * 100).toFixed(1)}%)`,
    ).toBeGreaterThan(6);
  });

  it('does not make the feet worth more than the hands', () => {
    /*
     * The guard on overcorrecting, and it has now caught two.
     *
     * Phase 1: the first cut of `pickShot` resolved every leg-targeted shot as a kick — correct in
     * itself, since nobody punches a leg — but `GamePlan.targeting` aims 15% of *everybody's* shots
     * at the legs and every AI fight in the game uses the default plan. So a sixth of a boxer's
     * offence was moved onto an attribute they are bad at: `strikingOffence` fell to 8.1pp while
     * `kicking` rose to 10.3.
     *
     * Phase 2: the same thing, one level up. Weighting the targeting split by `calfKick` alone —
     * how much this fighter kicks legs, in absolute terms — reads 8.6pp against 9.5 and inverts
     * this again, because a boxer with a competent-by-default 66 `kicking` still aims low. Adding
     * the relative term (`kickLean`: are your feet better than your hands?) is what holds it, at
     * 10.2 against 8.2. Hands are ~65% of the landed strikes in this engine and about 70% in the
     * real sport; they should be the most consequential striking attribute.
     */
    const striking = swing('strikingOffence');
    const kicking = swing('kicking');
    expect(
      striking.pp,
      `hands ${striking.pp.toFixed(1)}pp vs feet ${kicking.pp.toFixed(1)}pp`,
    ).toBeGreaterThan(kicking.pp);
  });

  it('charges the same forty points for every discipline and does not deliver the same fighter', () => {
    /*
     * **Tripwire**, and the plainest statement of what the kicking defect costs the game.
     *
     * `DISCIPLINE_META` gives every combat discipline **exactly forty rating points**, and
     * `origin.ts` says why in as many words: "Equal totals are the point: the choice is
     * *shape*, not quantity, so no discipline is the strong pick." The exemplars here are
     * built from that table and are level with each other to the point.
     *
     * Measured round-robin, 400 fights per cell, mean win rate against the other five:
     *
     * ```
     * boxing 56.8%   karate 51.6%   wrestling 50.4%
     * jiuJitsu 48.5%   judo 43.8%   kickboxing 34.5%
     * ```
     *
     * A 22-point spread across six choices the design intends to be equal, and the art at the
     * bottom is the one that spends the most of its forty points on `kicking` — sixteen, where
     * karate spends fifteen but recovers most of it through eleven points of `speed`, which the
     * engine reads everywhere. Head to head, boxing beats kickboxing 66.5% to 30.5%: the
     * creation screen offers "Kickboxing / Muay Thai" as a peer of "Boxing" and delivers a
     * fighter who loses two out of three.
     *
     * This is the character-creation half of the same bug the swing tests price: sixty points
     * of kicking are worth nothing, so a discipline that buys them is buying nothing. Phase 1
     * should break this assertion — when it does, tighten it toward parity rather than deleting
     * it, because "no discipline is the strong pick" is a promise the game makes to the player.
     */
    const s = runMatchup(disciplineExemplar('boxing'), disciplineExemplar('kickboxing'), {
      fights: 800,
      seedPrefix: 'equal-cost',
    });
    expect(s.redWinRate, `boxing vs kickboxing ${describeSummary(s)}`).toBeGreaterThan(0.6);
  });
});
