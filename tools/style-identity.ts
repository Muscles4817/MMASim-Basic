/**
 * **Does a fighter fight like himself?**
 *
 * The calibration table behind `tests/statistical/style-identity.test.ts`, in the manner of
 * `round-profile.ts`: every number the suite asserts is a column here rather than a value somebody
 * chose. Two halves, because the defect that produced it lived in both.
 *
 *  - **Surfaces** — at each of the six places a fighter picks an action, what share does each
 *    action hold and how much of that share did the corner decide (`intentAuthority`)?
 *  - **Fights** — what does that add up to over a card's worth of fights, at both levels of detail?
 *
 * Run: `npx vite-node tools/style-identity.ts [fights-per-pairing]`
 */
import {
  ARCHETYPES,
  defaultGamePlan,
  planFor,
  resolveFightByRound,
  simulateFight,
  strikeLean,
  type Fighter,
  type GamePlan,
} from '@mmasim/engine';
import { createCombatant } from '../packages/engine/src/fight/profile.js';
import {
  bottomExits,
  bottomWork,
  controllingCandidates,
  distanceCandidates,
  heldWork,
  topCandidates,
} from '../packages/engine/src/fight/simulate.js';
import { actionShares, intentAuthority } from '../packages/engine/src/fight/decide.js';
import { stanceOf, submissionOpportunity } from '../packages/engine/src/fight/policy.js';

/** The shapes a viewer would name on sight. See `ARCHETYPES` for what each one claims. */
const CAST: readonly (readonly [string, () => Fighter])[] = [
  ['olympic boxer', ARCHETYPES.olympicBoxer],
  ['southpaw sniper', ARCHETYPES.southpawSniper],
  ['point karateka', ARCHETYPES.pointKarateka],
  ['striker', ARCHETYPES.striker],
  ['chain wrestler', ARCHETYPES.smotherer],
  ['guard player', ARCHETYPES.guardPlayer],
  ['grinder', ARCHETYPES.grinder],
  ['journeyman', ARCHETYPES.journeyman],
];

const FIELD: readonly (() => Fighter)[] = [
  ARCHETYPES.journeyman,
  ARCHETYPES.grinder,
  ARCHETYPES.smotherer,
  ARCHETYPES.contender,
  ARCHETYPES.striker,
  ARCHETYPES.guardPlayer,
];

const N = Number(process.argv[2] ?? 250);
const foe = ARCHETYPES.journeyman();

// --- Half one: the decision surfaces --------------------------------------------------------

console.log("\n## The AI planner's reading of each fighter\n");
console.log(
  [
    'fighter'.padEnd(17),
    'sub',
    ' gc',
    ' lean',
    ' state'.padEnd(12),
    'entry'.padEnd(20),
    'top'.padEnd(15),
    'bottom'.padEnd(8),
    'clinch',
  ].join(''),
);
for (const [name, make] of CAST) {
  const f = make();
  const t = planFor(f, foe).tactics;
  console.log(
    [
      name.padEnd(17),
      String(f.attributes.submissions).padStart(3),
      String(f.attributes.groundControl).padStart(4),
      strikeLean(f).toFixed(2).padStart(6),
      ' ' + t.preferredState.padEnd(11),
      t.entry.padEnd(20),
      t.topIntent.padEnd(15),
      t.bottomIntent.padEnd(8),
      t.clinchIntent,
    ].join(''),
  );
}

console.log('\n## Submission share of the draw, at the two surfaces that offer one\n');
console.log(
  [
    'fighter'.padEnd(17),
    'plan'.padEnd(12),
    'urg',
    '  bottom sub%',
    ' auth',
    '   top sub%',
    ' auth',
  ].join(''),
);
for (const [name, make] of CAST) {
  const f = make();
  const t = createCombatant('blue', foe, planFor(foe, f));
  for (const [label, plan] of [
    ['AI (planFor)', planFor(f, foe)],
    ['none', defaultGamePlan()],
  ] as const) {
    const a = createCombatant('red', f, plan as GamePlan);
    const stance = stanceOf(a, undefined, true);
    const bottom = bottomWork(
      a,
      stance,
      'guard',
      submissionOpportunity(a, t, 'guard', false),
      false,
    );
    const top = topCandidates(a, t, stance, 0.5, submissionOpportunity(a, t, 'halfGuard', true));
    console.log(
      [
        name.padEnd(17),
        String(label).padEnd(12),
        stance.urgency.toFixed(2),
        (actionShares(bottom).submission * 100).toFixed(1).padStart(13),
        intentAuthority(bottom).toFixed(2).padStart(6),
        (actionShares(top).submission * 100).toFixed(1).padStart(11),
        intentAuthority(top).toFixed(2).padStart(6),
      ].join(''),
    );
  }
}

console.log('\n## Every surface, on the AI plan\n');
for (const [name, make] of CAST) {
  const f = make();
  const plan = planFor(f, foe);
  const a = createCombatant('red', f, plan);
  const t = createCombatant('blue', foe, planFor(foe, f));
  const held = stanceOf(a, undefined, true);
  const own = stanceOf(a, undefined, false);
  console.log(`\n  ${name}`);
  const lists = [
    ['distance (boxing)', distanceCandidates(a, t, 'boxing', own)],
    ['clinch: held', heldWork(a, t, held, false)],
    ['clinch: holding', controllingCandidates(a, t, own)],
    ['bottom: route', bottomExits(a, held, 'guard')],
    [
      'bottom: work',
      bottomWork(a, held, 'guard', submissionOpportunity(a, t, 'guard', false), false),
    ],
    [
      'top: halfGuard',
      topCandidates(a, t, own, 0.5, submissionOpportunity(a, t, 'halfGuard', true)),
    ],
  ] as const;
  for (const [label, cands] of lists) {
    const shares = actionShares(cands as never) as Record<string, number>;
    const body = Object.entries(shares)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
      .join('  ');
    console.log(
      `    ${label.padEnd(18)} auth ${intentAuthority(cands as never)
        .toFixed(2)
        .padStart(6)}   ${body}`,
    );
  }
}

// --- Half two: what it adds up to over a card ------------------------------------------------

interface Tally {
  subs: number;
  tds: number;
  fights: number;
  rounds: number;
  withSub: number;
  subWins: number;
}

function fights(
  level: 'full' | 'reduced',
  make: () => Fighter,
  plan: (f: Fighter, o: Fighter) => GamePlan,
): Tally {
  const resolve = level === 'full' ? simulateFight : resolveFightByRound;
  const out: Tally = { subs: 0, tds: 0, fights: 0, rounds: 0, withSub: 0, subWins: 0 };
  for (const makeOpp of FIELD) {
    for (let i = 0; i < N; i++) {
      const me = make();
      const opp = makeOpp();
      if (me.id === opp.id) continue;
      const r = resolve({
        boutId: `si_${me.id}_${opp.id}_${i}`,
        seed: `si_${me.id}_${opp.id}_${i}`,
        rounds: 3,
        red: { fighter: me, plan: plan(me, opp) },
        blue: { fighter: opp, plan: planFor(opp, me) },
      });
      const s = r.stats.red;
      out.subs += s.submissionAttempts;
      out.tds += s.takedownsAttempted;
      out.fights++;
      out.rounds += r.round;
      if (s.submissionAttempts > 0) out.withSub++;
      if (r.method === 'submission' && r.winnerId === me.id) out.subWins++;
    }
  }
  return out;
}

console.log(`\n## Over ${N} fights per pairing, ${FIELD.length} opponents\n`);
console.log(
  [
    'fighter'.padEnd(17),
    'plan'.padEnd(6),
    'level'.padEnd(9),
    'sub/f',
    '  %f w/sub',
    ' sub/rnd',
    '   td/f',
    ' subWin%',
  ].join(''),
);
for (const [name, make] of CAST) {
  for (const [planLabel, plan] of [
    ['AI', (f: Fighter, o: Fighter) => planFor(f, o)],
    ['none', () => defaultGamePlan()],
  ] as const) {
    for (const level of ['full', 'reduced'] as const) {
      const t = fights(level, make, plan);
      console.log(
        [
          name.padEnd(17),
          planLabel.padEnd(6),
          level.padEnd(9),
          (t.subs / t.fights).toFixed(2).padStart(5),
          ((100 * t.withSub) / t.fights).toFixed(1).padStart(11),
          (t.subs / t.rounds).toFixed(3).padStart(9),
          (t.tds / t.fights).toFixed(2).padStart(8),
          ((100 * t.subWins) / t.fights).toFixed(1).padStart(9),
        ].join(''),
      );
    }
  }
}

// --- The controlled falsifier: which pair of attributes actually decides the share? ----------

console.log('\n## Bottom submission share, holding the plan fixed, varying the two attributes\n');
{
  const { makeFighter } = await import('@mmasim/engine');
  const p = {
    ...defaultGamePlan(),
    tactics: {
      ...defaultGamePlan().tactics,
      preferredState: 'boxing' as const,
      bottomIntent: 'defend' as const,
      conviction: 0.9,
    },
  };
  console.log(['submissions', ' scrambling', '  bottom sub%'].join(''));
  for (const [subs, scr] of [
    [30, 30],
    [30, 60],
    [30, 90],
    [50, 30],
    [50, 60],
    [50, 90],
    [70, 30],
    [70, 60],
    [70, 90],
    [90, 30],
    [90, 90],
  ] as const) {
    const f = makeFighter({
      id: `f_${subs}_${scr}`,
      attributes: { submissions: subs, scrambling: scr },
    });
    const a = createCombatant('red', f, p);
    const t = createCombatant('blue', foe, defaultGamePlan());
    const stance = stanceOf(a, undefined, true);
    const cands = bottomWork(
      a,
      stance,
      'guard',
      submissionOpportunity(a, t, 'guard', false),
      false,
    );
    console.log(
      [
        String(subs).padStart(11),
        String(scr).padStart(11),
        (actionShares(cands).submission * 100).toFixed(1).padStart(13),
      ].join(''),
    );
  }
}
