/**
 * What one round of `simulateFight` actually looks like, per corner.
 *
 * The calibration target for the round-level resolver (doc 27 § 9's option C). Every constant in
 * `resolveRound` is set from a column of this table rather than chosen, and the same numbers are
 * what the agreement test asserts against.
 */
import { ARCHETYPES, makeFighter, simulateFight, type Fighter } from '@mmasim/engine';

interface Corner {
  att: number;
  lnd: number;
  dmg: number;
  tdL: number;
  tdA: number;
  sub: number;
  ctrl: number;
  dist: number;
  kd: number;
}

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

const N = 600;

const head = [
  'matchup/corner'.padEnd(30),
  'win%',
  'att/r',
  'lnd/r',
  'acc%',
  'dmg/r',
  'tdL/r',
  'tdA/r',
  'sub/r',
  'ctrl/r',
  'dist/r',
  'kd/f',
];
console.log(head.join('\t'));

for (const [name, red, blue] of pairs) {
  let draws = 0,
    ko = 0,
    sub = 0,
    dec = 0,
    endRd = 0,
    rounds = 0;
  const wins = { red: 0, blue: 0 };
  const acc: Record<'red' | 'blue', Corner> = {
    red: { att: 0, lnd: 0, dmg: 0, tdL: 0, tdA: 0, sub: 0, ctrl: 0, dist: 0, kd: 0 },
    blue: { att: 0, lnd: 0, dmg: 0, tdL: 0, tdA: 0, sub: 0, ctrl: 0, dist: 0, kd: 0 },
  };
  for (let i = 0; i < N; i++) {
    const r = simulateFight({
      boutId: `${name}:${i}`,
      red: { fighter: red },
      blue: { fighter: blue },
      rounds: 3,
      seed: `${name}:${i}`,
    });
    if (!r.winnerId) draws++;
    else if (r.winnerId === red.id) wins.red++;
    else wins.blue++;
    if (r.method === 'ko' || r.method === 'tko') ko++;
    else if (r.method === 'submission') sub++;
    else if (r.method.startsWith('decision')) dec++;
    endRd += r.round;
    rounds += r.round - 1 + r.timeSeconds / 300;
    for (const c of ['red', 'blue'] as const) {
      const s = r.stats[c],
        a = acc[c];
      a.att += s.significantStrikesAttempted;
      a.lnd += s.significantStrikesLanded;
      a.dmg += s.damageDealt;
      a.tdL += s.takedownsLanded;
      a.tdA += s.takedownsAttempted;
      a.sub += s.submissionAttempts;
      a.ctrl += s.controlSeconds;
      a.dist += s.distanceSeconds;
      a.kd += r.damage[c].knockdownsSuffered;
    }
  }
  console.log(
    `${name}  draw=${((draws / N) * 100).toFixed(1)}% KO=${((ko / N) * 100).toFixed(1)}% ` +
      `SUB=${((sub / N) * 100).toFixed(1)}% DEC=${((dec / N) * 100).toFixed(1)}% endRd=${(endRd / N).toFixed(2)}`,
  );
  for (const c of ['red', 'blue'] as const) {
    const a = acc[c],
      per = (x: number) => (x / rounds).toFixed(2);
    console.log(
      [
        `  ${c}`.padEnd(30),
        ((wins[c] / N) * 100).toFixed(1),
        per(a.att),
        per(a.lnd),
        ((a.lnd / a.att) * 100).toFixed(1),
        per(a.dmg),
        per(a.tdL),
        per(a.tdA),
        per(a.sub),
        per(a.ctrl),
        per(a.dist),
        (a.kd / N).toFixed(2),
      ].join('\t'),
    );
  }
}
