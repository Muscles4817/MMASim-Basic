/** Cage geography probes. Run: npx vite-node tools/audit/fight-engine-cage.ts */
import {
  ARCHETYPES,
  makeFighter,
  simulateFight,
  defaultGamePlan,
  defaultTactics,
  convictionFor,
  planFor,
  type GamePlan,
  type Fighter,
} from '@mmasim/engine';
const N = Number(process.env.N ?? 1000);
const plan = (
  state: 'pocket' | 'outside' | 'boxing',
  entry: 'pressure' | 'movement' | 'lead',
): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), preferredState: state, entry, conviction: convictionFor(state) },
});
function run(
  label: string,
  a: Fighter,
  pa: GamePlan | undefined,
  b: Fighter,
  pb: GamePlan | undefined,
) {
  let fenceA = 0,
    fenceB = 0,
    wins = 0,
    losses = 0,
    cut = 0,
    circled = 0,
    backed = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateFight({
      boutId: `cage-${label}-${i}`,
      red: { fighter: a, plan: pa },
      blue: { fighter: b, plan: pb },
    });
    fenceA += r.stats.red.fenceSeconds;
    fenceB += r.stats.blue.fenceSeconds;
    if (r.winnerId === a.id) wins++;
    else if (r.winnerId === b.id) losses++;
    for (const e of r.events) {
      if (/cuts off the cage|steps across to cut/.test(e.text)) cut++;
      if (/circles off the fence|pivoting off the cage/.test(e.text)) circled++;
      if (/onto the fence|on the cage\.|touches the fence/.test(e.text)) backed++;
    }
  }
  console.log(
    `${label.padEnd(40)} red fence ${(fenceA / N).toFixed(0)}s  blue fence ${(fenceB / N).toFixed(0)}s  red win ${((100 * wins) / (wins + losses)).toFixed(1)}%  per fight: backed ${(backed / N).toFixed(1)} cut-off ${(cut / N).toFixed(1)} circled ${(circled / N).toFixed(1)}`,
  );
}
const a = makeFighter({ id: 'fighter_a', lastName: 'A' });
const b = makeFighter({ id: 'fighter_b', lastName: 'B' });
run('even, no plans', a, undefined, b, undefined);
run(
  'pressure (pocket) v movement (outside)',
  a,
  plan('pocket', 'pressure'),
  b,
  plan('outside', 'movement'),
);
run(
  'pressure (pocket) v lead (outside)',
  a,
  plan('pocket', 'pressure'),
  b,
  plan('outside', 'lead'),
);
const quick = makeFighter({
  id: 'fighter_q',
  lastName: 'Q',
  attributes: { speed: 85, fightIq: 80 },
});
run(
  'pressure v quick high-IQ mover',
  a,
  plan('pocket', 'pressure'),
  quick,
  plan('outside', 'movement'),
);
const g = ARCHETYPES.grinder(),
  s = ARCHETYPES.striker();
run('grinder v striker (AI plans)', g, planFor(g, s), s, planFor(s, g));
