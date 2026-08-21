/**
 * Does an instruction point the same way at both levels of detail?
 *
 * `reduced-compare.ts` puts the two resolvers side by side on *unplanned* fighters, which is what
 * calibrates the level — and is exactly the fixture that cannot see D10. Every archetype matchup in
 * that table uses `defaultGamePlan()`, so a resolver could invert every instruction in the game and
 * still match it column for column. This is the other half: the same two fighters, twice, under two
 * opposed instructions, decomposed far enough to see *where* the two levels stop agreeing.
 *
 * The columns follow the causal chain a control-time claim actually passes through, because the
 * question is never "is the final number wrong" — it is which link first has the wrong sign:
 *
 *   1. appetite        what the plan asks for            (`grapplingAppetite`, shared by both)
 *   2. entry frequency takedown attempts per standing minute
 *   3. entry rate      how many of them land
 *   4. time per entry  control seconds bought per landed takedown
 *   5. what he does up there — submissions, ground volume
 *   6. escape          how much of it the other man takes back
 *
 * Reduced runs 2, 3 and 4 *backwards*: it computes the control share first and derives takedown
 * attempts from it (`grapple = own / BASE_CONTROL`). That is not a defect on its own — it is what
 * resolving a round at a time means — but it does mean the plan has exactly one way into this
 * resolver, through `controlPull`, and anything that flattens that term flattens the instruction.
 *
 * `tests/statistical/reduced-direction.test.ts` is the permanent guard. This is the instrument you
 * reach for when it fails.
 *
 *   npx vite-node tools/reduced-direction.ts
 */
import {
  ARCHETYPES,
  defaultGamePlan,
  defaultTactics,
  isKoMethod,
  makeFighter,
  resolveFightByRound,
  simulateFight,
  type Fighter,
  type GamePlan,
  type TacticalPlan,
} from '@mmasim/engine';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.9, ...t },
});

const STANDING = plan({
  preferredState: 'outside',
  entry: 'reactiveShot',
  topIntent: 'groundAndPound',
  bottomIntent: 'standUp',
});
const TOP = plan({
  preferredState: 'top',
  entry: 'proactiveWrestling',
  topIntent: 'control',
  bottomIntent: 'scramble',
});
const FOE = plan({
  preferredState: 'submission',
  entry: 'reactiveShot',
  topIntent: 'submit',
  bottomIntent: 'attack',
});

const N = Number(process.env.N ?? 800);

interface Row {
  fights: number;
  seconds: number;
  control: number;
  opponentControl: number;
  distance: number;
  takedownsAttempted: number;
  takedownsLanded: number;
  submissionAttempts: number;
  landed: number;
  ko: number;
  endRound: number;
}

const zero = (): Row => ({
  fights: 0, seconds: 0, control: 0, opponentControl: 0, distance: 0,
  takedownsAttempted: 0, takedownsLanded: 0, submissionAttempts: 0, landed: 0, ko: 0, endRound: 0,
});

function run(level: 'full' | 'reduced', label: string, red: Fighter, p: GamePlan, blue: Fighter): Row {
  const resolve = level === 'full' ? simulateFight : resolveFightByRound;
  const row = zero();
  for (let i = 0; i < N; i++) {
    const r = resolve({
      boutId: `direction:${label}:${i}`,
      red: { fighter: red, plan: p },
      blue: { fighter: blue, plan: FOE },
      rounds: 3,
      seed: `direction:${label}:${i}`,
    });
    row.fights++;
    row.seconds += (r.round - 1) * 300 + r.timeSeconds;
    row.control += r.stats.red.controlSeconds;
    row.opponentControl += r.stats.blue.controlSeconds;
    row.distance += r.stats.red.distanceSeconds;
    row.takedownsAttempted += r.stats.red.takedownsAttempted;
    row.takedownsLanded += r.stats.red.takedownsLanded;
    row.submissionAttempts += r.stats.red.submissionAttempts;
    row.landed += r.stats.red.significantStrikesLanded;
    if (isKoMethod(r.method)) row.ko++;
    row.endRound += r.round;
  }
  return row;
}

const AXES: readonly (readonly [string, (r: Row) => number])[] = [
  ['2 takedown attempts / standing-min', (r) => r.takedownsAttempted / (r.distance / 60)],
  ['3 takedown success rate', (r) => (r.takedownsAttempted > 0 ? r.takedownsLanded / r.takedownsAttempted : 0)],
  ['4 control sec / landed takedown', (r) => (r.takedownsLanded > 0 ? r.control / r.takedownsLanded : 0)],
  ['  control sec / round', (r) => r.control / (r.seconds / 300)],
  ['6 opponent control sec / round', (r) => r.opponentControl / (r.seconds / 300)],
  ['  distance sec / round', (r) => r.distance / (r.seconds / 300)],
  ['5 submission attempts / fight', (r) => r.submissionAttempts / r.fights],
  ['  strikes landed / min', (r) => r.landed / (r.seconds / 60)],
  ['  KO%', (r) => (r.ko / r.fights) * 100],
  ['  mean end round', (r) => r.endRound / r.fights],
];

function report(name: string, red: Fighter, blue: Fighter): void {
  console.log(`\n=== ${name} — stand-and-strike against take-it-down ===`);
  const cell = {
    fullFrom: run('full', `${name}:ff`, red, STANDING, blue),
    fullTo: run('full', `${name}:ft`, red, TOP, blue),
    reducedFrom: run('reduced', `${name}:rf`, red, STANDING, blue),
    reducedTo: run('reduced', `${name}:rt`, red, TOP, blue),
  };
  console.log(
    'axis'.padEnd(36) +
      'FULL stand'.padStart(11) + 'FULL top'.padStart(11) + '  ' +
      'RED stand'.padStart(11) + 'RED top'.padStart(11) + '   verdict',
  );
  for (const [label, read] of AXES) {
    const ff = read(cell.fullFrom);
    const ft = read(cell.fullTo);
    const rf = read(cell.reducedFrom);
    const rt = read(cell.reducedTo);
    const sign = (a: number, b: number) => (Math.abs(b - a) < 1e-9 ? 0 : b > a ? 1 : -1);
    const agree = sign(ff, ft) === sign(rf, rt) ? '' : '   <<< OPPOSITE';
    console.log(
      label.padEnd(36) +
        ff.toFixed(2).padStart(11) + ft.toFixed(2).padStart(11) + '  ' +
        rf.toFixed(2).padStart(11) + rt.toFixed(2).padStart(11) + agree,
    );
  }
}

report('grinder v guardPlayer', ARCHETYPES.grinder(), ARCHETYPES.guardPlayer());
report('clone v clone', makeFighter({ id: 'fighter_clone_a' }), makeFighter({ id: 'fighter_clone_b' }));
