/**
 * **Where `SUBMISSION_PER_CONTROL` comes from** — the fit behind `round.ts`'s submission model, in
 * the manner of `round-profile.ts`: the constant is a column of this table rather than a number
 * somebody chose. Doc 31 § D18.
 *
 * Re-run it after any change that moves Full's submission behaviour. D16's repertoire gate moved it
 * materially and these constants were *not* refitted at the time — the gate was multiplied over the
 * top of them, which is a different operation — and the stale intercept was the whole of what was
 * left of D18.
 *
 * Run: `npx vite-node tools/submission-fit.ts`
 *
 * The expression is `attempts = (FLOOR + PER_CONTROL × X) × B`, where
 *   X = own × appetite(top) + under × 0.15 × appetite(bottom)
 *   B = (0.75 + backTake × 0.5) × repertoire(submissions)
 * so `attempts / B = FLOOR + PER_CONTROL × X` is a straight line and the two constants are its
 * intercept and slope.
 *
 * **X is built from Full's control shares, not Reduced's.** Fitting against Reduced's own shares
 * would bake its control error (D21) into the submission constants — compensating one defect with
 * another and leaving both invisible.
 */
import { ARCHETYPES, planFor, simulateFight, repertoire, type Fighter } from '@mmasim/engine';
import { createCombatant } from '../packages/engine/src/fight/profile.js';
import { submissionAppetite } from '../packages/engine/src/fight/policy.js';

const CAST: [string, () => Fighter][] = [
  ['olympicBoxer', ARCHETYPES.olympicBoxer],
  ['pointKarateka', ARCHETYPES.pointKarateka],
  ['southpawSniper', ARCHETYPES.southpawSniper],
  ['striker', ARCHETYPES.striker],
  ['canFodder', ARCHETYPES.canFodder],
  ['journeyman', ARCHETYPES.journeyman],
  ['bomber', ARCHETYPES.bomber],
  ['contender', ARCHETYPES.contender],
  ['grinder', ARCHETYPES.grinder],
  ['smotherer', ARCHETYPES.smotherer],
  ['guardPlayer', ARCHETYPES.guardPlayer],
];
const N = 150;
const ROUND_SECONDS = 300;

interface Point {
  label: string;
  x: number;
  y: number;
  weight: number;
}
const points: Point[] = [];

for (const [name, make] of CAST) {
  for (const [oname, mk] of CAST) {
    if (name === oname) continue;
    let subs = 0,
      own = 0,
      under = 0,
      rounds = 0;
    for (let i = 0; i < N; i++) {
      const me = make();
      const opp = mk();
      const cfg = {
        boutId: `fit:${me.id}:${opp.id}:${i}`,
        seed: `fit:${me.id}:${opp.id}:${i}`,
        rounds: 3 as const,
        red: { fighter: me, plan: planFor(me, opp) },
        blue: { fighter: opp, plan: planFor(opp, me) },
      };
      const f = simulateFight(cfg);
      subs += f.stats.red.submissionAttempts;
      own += f.stats.red.controlSeconds - f.stats.red.clinchControlSeconds;
      under += f.stats.blue.controlSeconds - f.stats.blue.clinchControlSeconds;
      rounds += f.round;
    }
    const me = make();
    const opp = mk();
    const c = createCombatant('red', me, planFor(me, opp));
    const B = (0.75 + c.tendencies.backTake * 0.5) * repertoire(me.attributes.submissions);
    const ownShare = own / (rounds * ROUND_SECONDS);
    const underShare = under / (rounds * ROUND_SECONDS);
    const x =
      ownShare * submissionAppetite(c, true) + underShare * 0.15 * submissionAppetite(c, false);
    points.push({ label: `${name} v ${oname}`, x, y: subs / rounds / B, weight: rounds });
  }
}

// Weighted least squares on y = a + b·x.
const W = points.reduce((s, p) => s + p.weight, 0);
const mx = points.reduce((s, p) => s + p.weight * p.x, 0) / W;
const my = points.reduce((s, p) => s + p.weight * p.y, 0) / W;
const cov = points.reduce((s, p) => s + p.weight * (p.x - mx) * (p.y - my), 0);
const varx = points.reduce((s, p) => s + p.weight * (p.x - mx) ** 2, 0);
const slope = cov / varx;
const intercept = my - slope * mx;

// And the slope-only fit, forcing the intercept through zero.
const slopeThroughZero =
  points.reduce((s, p) => s + p.weight * p.x * p.y, 0) /
  points.reduce((s, p) => s + p.weight * p.x * p.x, 0);

const rss = (a: number, b: number) =>
  points.reduce((s, p) => s + p.weight * (p.y - (a + b * p.x)) ** 2, 0);
const tss = points.reduce((s, p) => s + p.weight * (p.y - my) ** 2, 0);

console.log(`${points.length} matchups, ${N} fights each\n`);
console.log(
  `free fit         intercept ${intercept.toFixed(4)}  slope ${slope.toFixed(3)}   R² ${(1 - rss(intercept, slope) / tss).toFixed(4)}`,
);
console.log(
  `through zero     intercept 0        slope ${slopeThroughZero.toFixed(3)}   R² ${(1 - rss(0, slopeThroughZero) / tss).toFixed(4)}`,
);
console.log(
  `shipped today    intercept 0.2000  slope 3.800   R² ${(1 - rss(0.2, 3.8) / tss).toFixed(4)}`,
);

console.log('\nthe low-control end, where the intercept is the whole prediction:');
for (const p of points
  .filter((q) => q.x < 0.03)
  .sort((a, b) => a.x - b.x)
  .slice(0, 8)) {
  console.log(
    `  ${p.label.padEnd(30)} x ${p.x.toFixed(4)}  measured ${p.y.toFixed(3)}  shipped predicts ${(0.2 + 3.8 * p.x).toFixed(3)}  fit predicts ${(intercept + slope * p.x).toFixed(3)}`,
  );
}
