/**
 * Plan parity: does any game plan win between two identical fighters?
 *
 * Two uniformly rated clones. One keeps the plan `planFor` gives him (a top-position game for an
 * all-rounder); the other is handed each preferred state in turn. If the sport is balanced at the
 * level of *plans*, every row reads near 50 %. Doc 36's attribute-economy pass found it does not —
 * the top game beats every alternative about 58–42 — and that this is why a striking skill is worth
 * so little at a fixed budget: using it means leaving the game that wins.
 *
 * Run: npx vite-node tools/audit/plan-parity.ts [LEVEL=60 N=800 via env]
 */
import {
  ATTRIBUTE_KEYS,
  makeFighter,
  planFor,
  simulateFight,
  type Attributes,
  type GamePlan,
} from '@mmasim/engine';

const level = Number(process.env.LEVEL ?? 60);
const N = Number(process.env.N ?? 800);
const attrs = {} as Attributes;
for (const k of ATTRIBUTE_KEYS) attrs[k] = level;
const me = makeFighter({ id: 'me', lastName: 'M', attributes: attrs });
const opp = makeFighter({ id: 'opp', lastName: 'O', attributes: attrs });
const base = planFor(me, opp);

const STATES = ['top', 'clinch', 'outside', 'boxing', 'pocket', 'submission'] as const;
console.log(
  `level ${level}, ${N} fights each, against ${base.tactics.preferredState}/${base.tactics.entry}:`,
);
for (const state of STATES) {
  const entry =
    state === 'outside' ? 'counter' : state === 'pocket' ? 'pressure' : base.tactics.entry;
  const plan: GamePlan = { ...base, tactics: { ...base.tactics, preferredState: state, entry } };
  let wins = 0;
  let decisions = 0;
  let finishes = 0;
  for (let i = 0; i < N; i++) {
    const [red, blue] = i % 2 ? [me, opp] : [opp, me];
    const seed = `parity:${state}:${i}`;
    const r = simulateFight({
      boutId: seed,
      seed,
      rounds: 3,
      red: { fighter: red, plan: red === me ? plan : base },
      blue: { fighter: blue, plan: blue === me ? plan : base },
    });
    if (r.winnerId === 'me') {
      wins++;
      if (r.method.startsWith('decision')) decisions++;
      else finishes++;
    } else if (!r.winnerId) wins += 0.5;
  }
  console.log(
    `  ${state.padEnd(11)} ${((100 * wins) / N).toFixed(1).padStart(5)} %   by decision ${decisions}, by finish ${finishes}`,
  );
}
