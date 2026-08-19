/**
 * `resolveFightByRound` against `simulateFight`, side by side.
 *
 * The calibration loop for doc 27 § 9's option C. Speed is one number; fidelity is the six
 * matchups of `round-profile.ts` compared column by column.
 */
import {
  ARCHETYPES,
  makeFighter,
  resolveFightByRound,
  simulateFight,
  type Fighter,
} from '@mmasim/engine';

const pairs: [string, Fighter, Fighter][] = [
  [
    'even',
    makeFighter({ id: 'fighter_a', lastName: 'A' }),
    makeFighter({ id: 'fighter_b', lastName: 'B' }),
  ],
  ['striker-v-grinder', ARCHETYPES.striker(), ARCHETYPES.grinder()],
  ['bomber-v-journeyman', ARCHETYPES.bomber(), ARCHETYPES.journeyman()],
  ['contender-v-canFodder', ARCHETYPES.contender(), ARCHETYPES.canFodder()],
  ['guardPlayer-v-smotherer', ARCHETYPES.guardPlayer(), ARCHETYPES.smotherer()],
  ['smotherer-v-striker', ARCHETYPES.smotherer(), ARCHETYPES.striker()],
];

const N = Number(process.env.N ?? 800);

interface Sum {
  redWin: number;
  draw: number;
  ko: number;
  sub: number;
  dec: number;
  endRd: number;
  r1: number;
  kd: number;
  headDmg: number;
  att: number;
  lnd: number;
  ctrl: number;
  rounds: number;
  corner: Record<
    'red' | 'blue',
    { att: number; lnd: number; dmg: number; ctrl: number; sub: number; kdTaken: number }
  >;
}
const zero = (): Sum => ({
  redWin: 0,
  draw: 0,
  ko: 0,
  sub: 0,
  dec: 0,
  endRd: 0,
  r1: 0,
  kd: 0,
  headDmg: 0,
  att: 0,
  lnd: 0,
  ctrl: 0,
  rounds: 0,
  corner: {
    red: { att: 0, lnd: 0, dmg: 0, ctrl: 0, sub: 0, kdTaken: 0 },
    blue: { att: 0, lnd: 0, dmg: 0, ctrl: 0, sub: 0, kdTaken: 0 },
  },
});

function run(kind: 'full' | 'reduced', name: string, red: Fighter, blue: Fighter): Sum {
  const s = zero();
  for (let i = 0; i < N; i++) {
    const cfg = {
      boutId: `${name}:${i}`,
      red: { fighter: red },
      blue: { fighter: blue },
      rounds: 3 as const,
      seed: `${name}:${i}`,
    };
    const r = kind === 'full' ? simulateFight(cfg) : resolveFightByRound(cfg);
    if (!r.winnerId) s.draw++;
    else if (r.winnerId === red.id) s.redWin++;
    if (r.method === 'ko' || r.method === 'tko') {
      s.ko++;
      if (r.round === 1) s.r1++;
    } else if (r.method === 'submission') {
      s.sub++;
      if (r.round === 1) s.r1++;
    } else if (r.method.startsWith('decision')) s.dec++;
    s.endRd += r.round;
    s.rounds += r.round - 1 + r.timeSeconds / 300;
    for (const c of ['red', 'blue'] as const) {
      s.kd += r.damage[c].knockdownsSuffered;
      s.headDmg += r.damage[c].headDamage;
      s.att += r.stats[c].significantStrikesAttempted;
      s.lnd += r.stats[c].significantStrikesLanded;
      s.ctrl += r.stats[c].controlSeconds;
      const k = s.corner[c];
      k.att += r.stats[c].significantStrikesAttempted;
      k.lnd += r.stats[c].significantStrikesLanded;
      k.dmg += r.stats[c].damageDealt;
      k.ctrl += r.stats[c].controlSeconds;
      k.sub += r.stats[c].submissionAttempts;
      k.kdTaken += r.damage[c].knockdownsSuffered;
    }
  }
  return s;
}

const pct = (x: number) => ((x / N) * 100).toFixed(1).padStart(5);
const num = (x: number, d = 2) => (x / N).toFixed(d).padStart(6);

console.log(
  [
    'matchup'.padEnd(25),
    'model'.padEnd(8),
    'redWin',
    ' draw',
    '   KO',
    '  SUB',
    '  DEC',
    ' endRd',
    '  r1Fin',
    '  kd/f',
    'headDmg',
    ' att/f',
    ' lnd/f',
    'ctrl/f',
  ].join(' '),
);

let worst = 0;
for (const [name, red, blue] of pairs) {
  const rows: Record<string, Sum> = {
    full: run('full', name, red, blue),
    reduced: run('reduced', name, red, blue),
  };
  for (const k of ['full', 'reduced']) {
    const s = rows[k]!;
    console.log(
      [
        name.padEnd(25),
        k.padEnd(8),
        pct(s.redWin),
        pct(s.draw),
        pct(s.ko),
        pct(s.sub),
        pct(s.dec),
        num(s.endRd),
        pct(s.r1),
        num(s.kd),
        num(s.headDmg, 1),
        num(s.att, 1),
        num(s.lnd, 1),
        num(s.ctrl, 0),
      ].join(' '),
    );
  }
  for (const c of ['red', 'blue'] as const) {
    const line = (k: string) => {
      const s = rows[k]!,
        a = s.corner[c],
        per = (x: number, d = 1) => (x / s.rounds).toFixed(d).padStart(6);
      return `${k.padEnd(8)} att${per(a.att)} lnd${per(a.lnd)} dmg${per(a.dmg)} ctrl${per(a.ctrl, 0)} sub${per(a.sub)} kdTaken${(a.kdTaken / N).toFixed(2)}`;
    };
    console.log(`      ${c.padEnd(5)} ${line('full')}`);
    console.log(`      ${''.padEnd(5)} ${line('reduced')}`);
  }
  const f = rows.full!,
    r = rows.reduced!;
  for (const [label, a, b] of [
    ['redWin', f.redWin, r.redWin],
    ['KO', f.ko, r.ko],
    ['SUB', f.sub, r.sub],
    ['DEC', f.dec, r.dec],
  ] as const) {
    const d = Math.abs(a - b) / N;
    if (d > worst) worst = d;
    if (d > 0.08) console.log(`    !! ${label} off by ${(d * 100).toFixed(1)}pp`);
  }
}
console.log(`\nworst method/win-rate gap: ${(worst * 100).toFixed(1)}pp`);

// --- speed ---------------------------------------------------------------------------------
const [, a, b] = pairs[0]!;
const bench = (kind: 'full' | 'reduced', reps: number) => {
  const t = performance.now();
  for (let i = 0; i < reps; i++) {
    const cfg = {
      boutId: `bench:${i}`,
      red: { fighter: a },
      blue: { fighter: b },
      rounds: 3 as const,
      seed: `bench:${i}`,
    };
    if (kind === 'full') simulateFight(cfg);
    else resolveFightByRound(cfg);
  }
  return ((performance.now() - t) * 1000) / reps;
};
bench('full', 500);
bench('reduced', 500);
const full = bench('full', 4000);
const reduced = bench('reduced', 40000);
console.log(
  `speed: full ${full.toFixed(0)}µs, reduced ${reduced.toFixed(1)}µs -> ${(full / reduced).toFixed(1)}x`,
);
