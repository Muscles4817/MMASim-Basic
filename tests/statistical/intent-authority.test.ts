/**
 * How much the corner gets to say, and whether it is the same amount everywhere.
 *
 * The second engine-wide rule, alongside shape-not-level, and it came out of the same class of
 * defect — a quantity that varied for reasons nobody chose and that nothing measured:
 *
 * > **Intent authority must be comparable across decision surfaces.** A given conviction should
 * > not become dominant or irrelevant merely because one action list happens to be expressed in
 * > 0.05 constants and another in 25–95 capability weights.
 *
 * A weighted draw is a softmax over `ln(capability × opportunity) + alignment × strength ×
 * urgency`, so the two terms are directly comparable in log space and their ratio is the honest
 * answer to *can this corner out-argue this fighter's own attributes here*. `intentAuthority`
 * computes it. This file measures it at every decision surface in the engine.
 *
 * **It does not yet pass its own rule, and that is deliberate.** Making the authority comparable
 * means choosing the baselines, which changes behaviour; this pass was a strictly
 * behaviour-preserving refactor that put every list on one code path so the numbers could be seen
 * at all. What is asserted here is the *measured* range with every violation named, in the manner
 * of `DECLARED_LEVELS` in `shape-not-level.test.ts`: the debt is explicit, bounded, and cannot
 * grow without a test failing.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  defaultGamePlan,
  defaultTactics,
  isKoMethod,
  simulateFight,
  type Fighter,
  type GamePlan,
  type TacticalPlan,
} from '@mmasim/engine';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import { stanceOf } from '../../packages/engine/src/fight/policy.js';
import { actionShares, intentAuthority } from '../../packages/engine/src/fight/decide.js';
import {
  bottomExits,
  bottomWork,
  controllingCandidates,
  distanceCandidates,
  heldWork,
  topCandidates,
} from '../../packages/engine/src/fight/simulate.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 1, ...t },
});

/** Full conviction throughout: this measures the *ceiling* of what an instruction can buy. */
const PLANS: readonly (readonly [string, GamePlan])[] = [
  ['outside', plan({ preferredState: 'outside', entry: 'movement' })],
  ['top', plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control' })],
  [
    'submission',
    plan({
      preferredState: 'submission',
      entry: 'reactiveShot',
      topIntent: 'submit',
      bottomIntent: 'attack',
    }),
  ],
  ['standUp', plan({ preferredState: 'boxing', entry: 'lead', bottomIntent: 'defend' })],
  ['clinch', plan({ preferredState: 'clinch', entry: 'clinchEntries' })],
];

/** Every place in the engine where a fighter picks between actions. */
function surfaces(p: GamePlan): { name: string; authority: number; shares: string }[] {
  const actor = createCombatant('red', ARCHETYPES.contender(), p);
  const foe = createCombatant('blue', ARCHETYPES.grinder(), defaultGamePlan());
  const stance = stanceOf(actor, undefined, false);

  const lists = [
    ['distance', distanceCandidates(actor, foe, 'boxing', stance)],
    ['clinch (held, work)', heldWork(actor, foe, stance, false)],
    ['clinch (controlling)', controllingCandidates(actor, foe, stance)],
    ['bottom (guard, work)', bottomWork(actor, stance, 'guard', 0, false)],
    ['bottom (side control, work)', bottomWork(actor, stance, 'sideControl', 0, false)],
    ['bottom (exits)', bottomExits(actor, stance, 'guard')],
    ['top (guard)', topCandidates(actor, foe, stance, 0.2, 0)],
    ['top (mount)', topCandidates(actor, foe, stance, 0.8, 0)],
  ] as const;

  return lists.map(([name, candidates]) => ({
    name,
    authority: intentAuthority(candidates),
    shares: Object.entries(actionShares(candidates))
      .map(([k, v]) => `${k} ${Math.round((v as number) * 100)}%`)
      .join(', '),
  }));
}

const measured = PLANS.flatMap(([label, p]) =>
  surfaces(p).map((s) => ({ label, ...s })),
);

const report = () =>
  measured
    .map((m) => `${m.label}/${m.name}: ${m.authority.toFixed(2)} (${m.shares})`)
    .join(' | ');

describe('what a fully convinced corner can buy, by decision', () => {
  it('has an opinion everywhere, so no instruction is silently inert', () => {
    // The floor half of the rule. Authority of zero means the plan is not consulted at all, which
    // would be a decision surface the whole tactical layer cannot reach.
    for (const m of measured) {
      expect(m.authority, `${m.label} at ${m.name} — the plan says nothing here`).toBeGreaterThan(0);
    }
  });

  it('is not yet comparable across surfaces, and the gap is bounded and named', () => {
    /*
     * **The measurement, and the debt.**
     *
     * Measured at full conviction across the engine's decision surfaces, the finite readings run
     * from **0.11 to 5.94** — a fifty-fold spread in what the same conviction is worth depending
     * only on which decision it lands on. Several lists read `Infinity`, which is a real answer and
     * means the candidates carry identical capability so the plan decides the whole thing.
     *
     * The two ends:
     *
     *  - **0.11, a fighter's in-state work under side control.** The list is a submission at the
     *    literal `0.05` beside a frame at 1.29 — twenty-six to one, against an intent range of
     *    about seven to one end to end. Whatever he was told, he frames.
     *  - **5.94, an outside striker at range.** Strike, kick, takedown and clinch are all things he
     *    can do, so nothing but the instruction separates them and the instruction decides.
     *
     * **The transition split moved this landscape and did not try to fix it**, which was the plan:
     * before it the spread was 0.32 to 10.28. Both ends moved for the same structural reason — the
     * lists got shorter. Bottom in-state work is now two candidates rather than three, so the 0.05
     * sits beside a larger companion and the ratio widens; the bottom exits are two rather than
     * three, so their internal spread narrows. Neither is a judgement about the constants, which
     * are untouched.
     *
     * The bound is the measurement plus headroom, not a target. It fails if the spread *widens*,
     * which is the regression worth catching while the fix is pending; narrowing it is the work,
     * and narrowing it will fail this test on purpose.
     */
    const finite = measured.filter((m) => Number.isFinite(m.authority));
    const lo = Math.min(...finite.map((m) => m.authority));
    const hi = Math.max(...finite.map((m) => m.authority));

    expect(lo, report()).toBeGreaterThan(0.08);
    expect(hi, report()).toBeLessThan(7);
    // The spread itself, which is the quantity the rule is actually about.
    expect(hi / lo, report()).toBeLessThan(80);
  });

  it('gives the same instruction the same authority regardless of where the opponent put them', () => {
    /*
     * The half of the rule that can be asserted properly today, because it compares a surface with
     * itself. A fighter told to attack from his back is told the same thing whether he is in guard
     * or under side control — the position changes what is *available*, which is `opportunity` and
     * belongs on the capability side, but it must not change how loudly his corner is allowed to
     * speak.
     *
     * It currently does, by roughly ten to one, and this is the assertion that will go green when
     * the bottom baselines are chosen deliberately. Until then it records the size of the gap.
     */
    const hunt = plan({ preferredState: 'submission', bottomIntent: 'attack' });
    // A guard player rather than the all-rounder: the contender's `submissions` and `scrambling`
    // are the same rating, so both in-state candidates carry identical capability and the metric
    // correctly reads infinite authority — true, and useless for measuring a gap.
    const actor = createCombatant('red', ARCHETYPES.guardPlayer(), hunt);
    const stance = stanceOf(actor, undefined, false);

    const inGuard = intentAuthority(bottomWork(actor, stance, 'guard', 0, false));
    const passed = intentAuthority(bottomWork(actor, stance, 'sideControl', 0, false));
    const message = `guard ${inGuard.toFixed(2)} against side control ${passed.toFixed(2)}`;

    // Recorded, not endorsed: 7.33 against 0.71.
    expect(inGuard / passed, message).toBeGreaterThan(5);
    expect(inGuard / passed, message).toBeLessThan(15);
  });
});

/* ---------------------------------------------------------------------------------------------
 * The equivalence guard
 * ------------------------------------------------------------------------------------------- */

interface Fingerprint {
  punches: number;
  kicks: number;
  takedowns: number;
  submissions: number;
  clinchEntries: number;
  getUps: number;
  advances: number;
  sweeps: number;
  distanceSeconds: number;
  clinchSeconds: number;
  groundSeconds: number;
  koRate: number;
  submissionRate: number;
  meanRound: number;
}

/**
 * What three matchups do, in the three currencies a tactical change could move without meaning to.
 *
 * Action frequencies, positional distribution and outcome mix — recorded from the engine *before*
 * the decision layer was refactored, and asserted after. The refactor was verified against a wider
 * version of this at the time: 7,500 fights across five matchups and 223 counters, every one of
 * them bit-identical, which is a stronger statement than any tolerance. This is the durable form
 * of that check, kept small enough to run every commit.
 *
 * **This is a golden test, not a statistical one, and the distinction matters.** Everything else in
 * this directory asserts a claim about a distribution with a tolerance, and is swept across seed
 * salts precisely so that no bound is ever fitted to one draw. This one is fitted to one draw on
 * purpose: the engine is deterministic, so the same seeds must give the same numbers exactly, and
 * *exactly* is a stronger and clearer statement than any tolerance.
 *
 * The first cut allowed 3%, which was worse than useless — at 600 fights the sampling noise on
 * these counters runs to 9%, so the tolerance was not measuring "did behaviour change", it was
 * measuring "are these the same seeds". Re-seeding it, which is the right instinct for every other
 * file here, is a category error for this one: it would compare two different samples and call the
 * difference a regression. If a future change needs more statistical power, the answer is more
 * fights, not a wider bound.
 *
 * A tactical change that moves these on purpose *should* fail this test and rewrite the numbers
 * with its own measurement. That is the guard working, not the guard being in the way.
 *
 * **Re-recorded four times so far**, by the transition split, by rebasing positional maintenance
 * onto control capability, by giving the man on top a voluntary exit, and by giving the tie-up an
 * instruction of its own. Every time it failed on all three matchups, which is what it is for.
 *
 * The fourth re-recording, by D3 + D13 + D15, and it is the smallest of the four: **only `punches`
 * failed**, by 0.3%, 1.1% and 1.1%. Everything else was already inside the recorded precision. That
 * is the shape a change should have when its three parts are each level-neutral for a fighter with
 * no plan — every new alignment reads exactly 1 at zero urgency, and the archetypes here have no
 * plan. What moved is the clinch: 42.2 seconds a fight to 39.7, 25.3 to 24.0 and 74.4 to 71.8, as
 * the man holding a tie-up gained the option of letting go of it, with the punches following the
 * time back out to range.
 *
 *
 * The third re-recording, by D2. The largest movement the fingerprint has recorded, and every part
 * of it is the new action: standing time up 12%, 8% and 12% across the three matchups, ground time
 * down 2–4%, get-ups up by about half again — 1.29 to 2.01 in `striker-v-grinder`, because a
 * get-up is now something either man can produce. The outcome mix moved with it and was allowed to:
 * knockouts 23.3% to 24.7% and 55.8% to 60.5%, submissions down about four points in the matchup
 * where the exit gets used most. That is a real shift in the sport, not a rounding error, and it is
 * the intended price of a position that had no door in it. Doc 31 § D2 carries the level reasoning.
 * The second re-recording moved advances and submissions down and standing time up, which
 * is the change doing exactly what it was built to do: fighters below the top of the control
 * distribution now ride *less* than the old constant made them, so more of the fight is spent
 * working. Knockouts moved by under two points on every matchup and mean round by under 0.04.
 *
 * The first re-recording, by the transition split. It failed on all three matchups, which is
 * what it is for, and the numbers below are that change's own measurement. What moved is small and
 * in the direction the change intended: a little more standing time and a few more takedowns as
 * fighters who used to do nothing after a failed escape now frame and hand-fight their way to a
 * referee restart. What did not move is the sport's shape — knockouts within 2 points, submissions
 * within 2, mean round within 0.03 on every matchup.
 */
const BASELINE: Readonly<Record<string, Fingerprint>> = {
  'striker-v-grinder': {
    punches: 20.382, kicks: 8.53, takedowns: 6.412, submissions: 5.972,
    clinchEntries: 2.105, getUps: 1.955, advances: 3.685, sweeps: 1.087,
    distanceSeconds: 330.867, clinchSeconds: 39.68, groundSeconds: 424.123,
    koRate: 0.27, submissionRate: 0.18, meanRound: 2.355,
  },
  /*
   * **Re-recorded by the repertoire gate (doc 31 § D16), and this is the only matchup it moved.**
   *
   * The other two are byte-identical, which is the result worth recording rather than the numbers
   * below: `repertoire` returns exactly 1 for any rating of 38 or better, so every fighter in them
   * multiplies by a hard 1.0 and the arithmetic is untouched. `canFodder` is the one fixture in the
   * file who sits inside doc 02's *genuine liability* band on the attributes that matter —
   * `kicking: 34`, `submissions: 32`, `groundControl: 36`, `scrambling: 36` — so he is the one
   * fighter the gate is supposed to reach, and it reaches him and nobody else.
   *
   * What moved, and it is small and in the direction the gate intends: he throws marginally more
   * punches and fewer of everything else (submissions 4.142 → 4.020, and the standing time up about
   * four seconds), because a fighter with no technique he owns falls back on the thing every list
   * leaves ungated. Knockouts moved 1.2 points, submission rate 0.2, mean round 0.003 — the sport's
   * shape is where it was.
   */
  'contender-v-canFodder': {
    punches: 12.878,
    kicks: 3.767,
    takedowns: 3.07,
    submissions: 4.02,
    clinchEntries: 1.242,
    getUps: 0.785,
    advances: 1.932,
    sweeps: 0.268,
    distanceSeconds: 160.947,
    clinchSeconds: 24.705,
    groundSeconds: 209.728,
    koRate: 0.618,
    submissionRate: 0.29,
    meanRound: 1.563,
  },
  'guardPlayer-v-smotherer': {
    punches: 16.093, kicks: 3.528, takedowns: 8.452, submissions: 10.098,
    clinchEntries: 3.702, getUps: 2.072, advances: 4.782, sweeps: 1.517,
    distanceSeconds: 334.35, clinchSeconds: 71.802, groundSeconds: 551.758,
    koRate: 0.032, submissionRate: 0.205, meanRound: 2.735,
  },
};

const MATCHUPS: readonly (readonly [string, () => Fighter, () => Fighter])[] = [
  ['striker-v-grinder', ARCHETYPES.striker, ARCHETYPES.grinder],
  ['contender-v-canFodder', ARCHETYPES.contender, ARCHETYPES.canFodder],
  ['guardPlayer-v-smotherer', ARCHETYPES.guardPlayer, ARCHETYPES.smotherer],
];

const FIGHTS = 600;

function fingerprint(name: string, red: Fighter, blue: Fighter): Fingerprint {
  const t = {
    punches: 0, kicks: 0, takedowns: 0, submissions: 0, clinchEntries: 0, getUps: 0,
    advances: 0, sweeps: 0, distanceSeconds: 0, clinchSeconds: 0, groundSeconds: 0,
    koRate: 0, submissionRate: 0, meanRound: 0,
  };

  for (let i = 0; i < FIGHTS; i++) {
    const r = simulateFight({
      boutId: `fp:${name}:${i}`,
      red: { fighter: red },
      blue: { fighter: blue },
      rounds: 3,
      seed: `fp:${name}:${i}`,
    });
    for (const corner of ['red', 'blue'] as const) {
      const s = r.stats[corner];
      t.punches += s.strikesByWeapon.punch;
      t.kicks += s.strikesByWeapon.kick;
      t.takedowns += s.takedownsAttempted;
      t.submissions += s.submissionAttempts;
      t.distanceSeconds += s.distanceSeconds;
      t.clinchSeconds += s.clinchControlSeconds;
      t.groundSeconds += s.controlSeconds - s.clinchControlSeconds;
    }
    for (const e of r.events) {
      if (e.kind === 'clinch') t.clinchEntries++;
      else if (e.kind === 'standUp') t.getUps++;
      else if (e.kind === 'positionAdvance') t.advances++;
      else if (e.kind === 'sweep') t.sweeps++;
    }
    if (isKoMethod(r.method)) t.koRate++;
    else if (r.method === 'submission') t.submissionRate++;
    t.meanRound += r.round;
  }

  const out = {} as Record<keyof Fingerprint, number>;
  for (const key of Object.keys(t) as (keyof Fingerprint)[]) out[key] = t[key] / FIGHTS;
  return out as Fingerprint;
}

describe('rearranging the decision layer changed nothing about the fights', () => {
  it.each(MATCHUPS)('holds %s to its recorded action and position profile', (name, mkRed, mkBlue) => {
    const actual = fingerprint(name, mkRed(), mkBlue());
    const expected = BASELINE[name]!;

    for (const key of Object.keys(expected) as (keyof Fingerprint)[]) {
      // Rounded to the precision the baseline was recorded at, then compared exactly.
      expect(
        Number(actual[key].toFixed(3)),
        `${name} ${key}: recorded ${expected[key]}, now ${actual[key].toFixed(3)}`,
      ).toBe(expected[key]);
    }
  });
});
