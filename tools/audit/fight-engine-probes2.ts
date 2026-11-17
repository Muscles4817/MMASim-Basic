import {
  ARCHETYPES,
  makeFighter,
  simulateFight,
  planFor,
  defaultGamePlan,
  type GamePlan,
} from '@mmasim/engine';
const pct = (x: number) => (100 * x).toFixed(1) + '%';
const N = 3000;
// Adaptation with a real failure sample: wrestler vs elite-TDD striker
{
  const w = makeFighter({
    id: 'fighter_w',
    lastName: 'W',
    attributes: { wrestling: 80, groundControl: 75, strikingOffence: 50, kicking: 40 },
  });
  const s = makeFighter({
    id: 'fighter_s',
    lastName: 'S',
    attributes: { takedownDefence: 85, strikingOffence: 70, kicking: 60, wrestling: 45 },
  });
  const b: Record<string, { a: number; n: number; w: number }> = {};
  for (let i = 0; i < N; i++) {
    const r = simulateFight({
      boutId: `ad2-${i}`,
      red: { fighter: w, plan: planFor(w, s) },
      blue: { fighter: s, plan: planFor(s, w) },
    });
    if (r.round < 3) continue;
    const mine = (rd: number) =>
      r.events.filter(
        (e) =>
          e.round === rd &&
          e.takedown &&
          ((e.kind === 'takedown' && e.corner === 'red') ||
            (e.kind === 'takedownStuffed' && e.corner === 'blue')),
      );
    const r1 = mine(1);
    if (r1.length < 2) continue;
    const rate = r1.filter((e) => e.kind === 'takedown').length / r1.length;
    const key =
      rate === 0 ? 'stuffed every R1 shot' : rate >= 0.99 ? 'landed every R1 shot' : 'mixed';
    b[key] ??= { a: 0, n: 0, w: 0 };
    b[key].a += mine(3).length;
    b[key].n++;
  }
  for (const [k, v] of Object.entries(b))
    console.log(`[adaptation] wrestler ${k}: R3 TD attempts ${(v.a / v.n).toFixed(2)} (n=${v.n})`);
}
// Targeting on an even pair
{
  const a = makeFighter({ id: 'fighter_a', lastName: 'A', attributes: { kicking: 65 } });
  const b = makeFighter({ id: 'fighter_b', lastName: 'B', attributes: { kicking: 65 } });
  for (const [label, targeting] of [
    ['head-hunt', { head: 0.9, body: 0.05, legs: 0.05 }],
    ['default', { head: 0.6, body: 0.25, legs: 0.15 }],
    ['body-first', { head: 0.3, body: 0.6, legs: 0.1 }],
    ['legs-first', { head: 0.3, body: 0.1, legs: 0.6 }],
  ] as const) {
    const plan: GamePlan = { ...defaultGamePlan(), targeting: { ...targeting } };
    let wins = 0,
      losses = 0,
      ko = 0,
      r3ko = 0;
    for (let i = 0; i < N; i++) {
      const r = simulateFight({
        boutId: `tg2-${i}`,
        red: { fighter: a, plan },
        blue: { fighter: b },
      });
      if (r.winnerId === a.id) {
        wins++;
        if (r.method === 'ko' || r.method === 'tko') {
          ko++;
          if (r.round === 3) r3ko++;
        }
      } else if (r.winnerId === b.id) losses++;
    }
    console.log(
      `[targeting even] ${label}: win ${pct(wins / (wins + losses))}, red KO/TKO ${pct(ko / N)}, of which R3 ${pct(r3ko / Math.max(1, ko))}`,
    );
  }
}
// Stance, bigger N, dull opponent
{
  const base = { attributes: { fightIq: 40 } };
  const blue = makeFighter({ id: 'fighter_b', lastName: 'B', ...base, stance: 'orthodox' });
  for (const st of ['orthodox', 'southpaw'] as const) {
    const red = makeFighter({ id: 'fighter_a', lastName: 'A', ...base, stance: st });
    let w = 0,
      l = 0;
    for (let i = 0; i < 8000; i++) {
      const r = simulateFight({
        boutId: `st3-${i}`,
        red: { fighter: red },
        blue: { fighter: blue },
      });
      if (r.winnerId === red.id) w++;
      else if (r.winnerId === blue.id) l++;
    }
    console.log(`[stance N=8000, IQ40 opp] ${st}: ${pct(w / (w + l))}`);
  }
}
// Hurt dynamics: what does a hurt fighter do? (even pair) clinch-ups / TDs by the hurt man within 30s of being hurt
{
  const a = makeFighter({ id: 'fighter_a', lastName: 'A', attributes: { power: 75 } });
  const b = makeFighter({ id: 'fighter_b', lastName: 'B', attributes: { power: 75 } });
  const after: Record<string, number> = {};
  let hurts = 0;
  for (let i = 0; i < 1500; i++) {
    const r = simulateFight({
      boutId: `hd-${i}`,
      red: { fighter: a, plan: planFor(a, b) },
      blue: { fighter: b, plan: planFor(b, a) },
    });
    const ev = r.events;
    ev.forEach((e, k) => {
      if (e.kind !== 'hurt' && e.kind !== 'knockdown') return;
      const victim = e.kind === 'hurt' ? e.corner : e.corner === 'red' ? 'blue' : 'red';
      hurts++;
      for (
        let j = k + 1;
        j < ev.length && ev[j]!.round === e.round && ev[j]!.timeSeconds - e.timeSeconds <= 30;
        j++
      ) {
        const x = ev[j]!;
        if (x.corner !== victim) continue;
        if (['clinch', 'takedown', 'strike', 'kick', 'range'].includes(x.kind))
          after[x.kind] = (after[x.kind] ?? 0) + 1;
      }
    });
  }
  console.log(
    `[hurt] per hurt/KD (n=${hurts}), victim's actions in next 30s:`,
    Object.entries(after)
      .map(([k, v]) => `${k} ${(v / hurts).toFixed(2)}`)
      .join(', '),
  );
}
