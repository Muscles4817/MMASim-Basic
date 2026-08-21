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
  ['standUp', plan({ preferredState: 'boxing', entry: 'lead', bottomIntent: 'standUp' })],
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
 * **Re-recorded once so far**, by the transition split. It failed on all three matchups, which is
 * what it is for, and the numbers below are that change's own measurement. What moved is small and
 * in the direction the change intended: a little more standing time and a few more takedowns as
 * fighters who used to do nothing after a failed escape now frame and hand-fight their way to a
 * referee restart. What did not move is the sport's shape — knockouts within 2 points, submissions
 * within 2, mean round within 0.03 on every matchup.
 */
const BASELINE: Readonly<Record<string, Fingerprint>> = {
  'striker-v-grinder': {
    punches: 20.63, kicks: 7.583, takedowns: 5.59, submissions: 7.43,
    clinchEntries: 1.9, getUps: 1.322, advances: 4.267, sweeps: 1.19,
    distanceSeconds: 282.26, clinchSeconds: 38.205, groundSeconds: 457.41,
    koRate: 0.235, submissionRate: 0.21, meanRound: 2.368,
  },
  'contender-v-canFodder': {
    punches: 12.343, kicks: 3.073, takedowns: 2.307, submissions: 4.813,
    clinchEntries: 0.888, getUps: 0.278, advances: 1.88, sweeps: 0.232,
    distanceSeconds: 118.62, clinchSeconds: 20.7, groundSeconds: 214.728,
    koRate: 0.573, submissionRate: 0.358, meanRound: 1.493,
  },
  'guardPlayer-v-smotherer': {
    punches: 17.183, kicks: 2.95, takedowns: 7.092, submissions: 12.022,
    clinchEntries: 3.035, getUps: 1.433, advances: 5.128, sweeps: 1.42,
    distanceSeconds: 265.953, clinchSeconds: 62.813, groundSeconds: 569.415,
    koRate: 0.052, submissionRate: 0.223, meanRound: 2.668,
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
