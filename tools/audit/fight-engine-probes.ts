/** Targeted probes for the fight-engine audit. Run: npx vite-node tools/audit/fight-engine-probes.ts */
import {
  ARCHETYPES,
  makeFighter,
  simulateFight,
  planFor,
  defaultGamePlan,
  type Fighter,
  type GamePlan,
} from '@mmasim/engine';

const N = Number(process.env.N ?? 2000);
const pct = (x: number) => (100 * x).toFixed(1) + '%';

// 1. Output by round, even matchup, fights that go the distance.
{
  const a = makeFighter({ id: 'fighter_a', lastName: 'A' });
  const b = makeFighter({ id: 'fighter_b', lastName: 'B' });
  const att = [0, 0, 0],
    lnd = [0, 0, 0],
    ctrl = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const r = simulateFight({
      boutId: `p1-${i}`,
      red: { fighter: a, plan: planFor(a, b) },
      blue: { fighter: b, plan: planFor(b, a) },
    });
    if (r.roundStats?.length !== 3 || !r.method.startsWith('decision')) continue;
    n++;
    r.roundStats.forEach((t, k) => {
      att[k] += t.red.strikesAttempted + t.blue.strikesAttempted;
      lnd[k] += t.red.significantStrikes + t.blue.significantStrikes;
      ctrl[k] += t.red.controlSeconds + t.blue.controlSeconds;
    });
  }
  console.log(
    `[output by round, even, decisions n=${n}] attempted ${att.map((x) => (x / n).toFixed(1)).join(' / ')}  landed ${lnd.map((x) => (x / n).toFixed(1)).join(' / ')}  control s ${ctrl.map((x) => (x / n).toFixed(0)).join(' / ')}`,
  );
}

// 2. Stance: identical fighters, red flipped between orthodox/southpaw/switch, blue orthodox, both IQ 45.
{
  const base = { attributes: { fightIq: 45 } };
  const blue = makeFighter({ id: 'fighter_b', lastName: 'B', ...base, stance: 'orthodox' });
  for (const st of ['orthodox', 'southpaw', 'switch'] as const) {
    const red = makeFighter({ id: 'fighter_a', lastName: 'A', ...base, stance: st });
    let w = 0,
      l = 0;
    for (let i = 0; i < N; i++) {
      const r = simulateFight({
        boutId: `st-${i}`,
        red: { fighter: red },
        blue: { fighter: blue },
      });
      if (r.winnerId === red.id) w++;
      else if (r.winnerId === blue.id) l++;
    }
    console.log(`[stance] red ${st} vs orthodox: red win ${pct(w / (w + l))}`);
  }
  const sp = makeFighter({ id: 'fighter_b', lastName: 'B', ...base, stance: 'southpaw' });
  const sp2 = makeFighter({ id: 'fighter_a', lastName: 'A', ...base, stance: 'southpaw' });
  let w = 0,
    l = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateFight({ boutId: `st2-${i}`, red: { fighter: sp2 }, blue: { fighter: sp } });
    if (r.winnerId === sp2.id) w++;
    else if (r.winnerId === sp.id) l++;
  }
  console.log(`[stance] southpaw vs southpaw: red win ${pct(w / (w + l))}`);
}

// 3. In-fight adaptation: grinder vs striker. Does the grinder's TD attempt rate in R3 depend on his R1 TD success?
{
  const g = ARCHETYPES.grinder(),
    s = ARCHETYPES.striker();
  const buckets: Record<string, { a: number; n: number }> = {
    'R1 0% success': { a: 0, n: 0 },
    'R1 100% success': { a: 0, n: 0 },
  };
  for (let i = 0; i < N; i++) {
    const r = simulateFight({
      boutId: `ad-${i}`,
      red: { fighter: g, plan: planFor(g, s) },
      blue: { fighter: s, plan: planFor(s, g) },
    });
    if (r.round < 3) continue;
    const r1 = r.events.filter(
      (e) =>
        e.round === 1 &&
        e.takedown &&
        ((e.kind === 'takedown' && e.corner === 'red') ||
          (e.kind === 'takedownStuffed' && e.corner === 'blue')),
    );
    if (r1.length < 2) continue;
    const ok = r1.filter((e) => e.kind === 'takedown').length;
    const key = ok === 0 ? 'R1 0% success' : ok === r1.length ? 'R1 100% success' : undefined;
    if (!key) continue;
    const r3 = r.events.filter(
      (e) =>
        e.round === 3 &&
        e.takedown &&
        ((e.kind === 'takedown' && e.corner === 'red') ||
          (e.kind === 'takedownStuffed' && e.corner === 'blue')),
    ).length;
    buckets[key]!.a += r3;
    buckets[key]!.n++;
  }
  for (const [k, v] of Object.entries(buckets))
    console.log(
      `[adaptation] grinder ${k}: R3 TD attempts ${(v.a / Math.max(1, v.n)).toFixed(2)} (n=${v.n})`,
    );
}

// 4. Setups: does body/leg work change later head-shot outcomes? Compare striker vs journeyman with targeting head-only vs body-heavy.
{
  const s = ARCHETYPES.striker(),
    j = ARCHETYPES.journeyman();
  for (const [label, targeting] of [
    ['head-hunt', { head: 0.9, body: 0.05, legs: 0.05 }],
    ['body-first', { head: 0.3, body: 0.6, legs: 0.1 }],
    ['legs-first', { head: 0.3, body: 0.1, legs: 0.6 }],
  ] as const) {
    const plan: GamePlan = { ...planFor(s, j), targeting: { ...targeting } };
    let r3HeadL = 0,
      r3HeadA = 0,
      wins = 0,
      ko = 0,
      n = 0;
    for (let i = 0; i < N / 2; i++) {
      const r = simulateFight({
        boutId: `tg-${i}`,
        red: { fighter: s, plan },
        blue: { fighter: j, plan: planFor(j, s) },
      });
      n++;
      if (r.winnerId === s.id) wins++;
      if (r.winnerId === s.id && (r.method === 'ko' || r.method === 'tko')) ko++;
      for (const e of r.events)
        if (e.round === 3 && e.corner === 'red' && e.target === 'head' && e.weapon === 'punch') {
          r3HeadA++;
          if (!/swings|short|countered|slipped/.test(e.text)) r3HeadL++;
        }
    }
    console.log(`[targeting] striker ${label}: win ${pct(wins / n)}, KO/TKO ${pct(ko / n)}`);
  }
}

// 5. Burst shape: how many strikes per exchange, and how much of it is narrated?
{
  const a = ARCHETYPES.striker(),
    b = ARCHETYPES.olympicBoxer();
  let att = 0,
    narrated = 0,
    fights = 0;
  for (let i = 0; i < 200; i++) {
    const r = simulateFight({ boutId: `bs-${i}`, red: { fighter: a }, blue: { fighter: b } });
    fights++;
    att += r.stats.red.significantStrikesAttempted + r.stats.blue.significantStrikesAttempted;
    narrated += r.events.filter((e) => e.weapon).length;
  }
  console.log(
    `[narration] strike attempts per fight ${(att / fights).toFixed(0)}, strike lines per fight ${(narrated / fights).toFixed(0)} → ${pct(narrated / att)} of thrown strikes appear in the play-by-play`,
  );
}

// 6. Sub selection vs specialist: guard player (subs 90+) vs grinder, what submissions does the guard player attempt?
{
  const gp = ARCHETYPES.guardPlayer(),
    gr = ARCHETYPES.grinder();
  const names: Record<string, number> = {};
  const fromBottom = { b: 0, t: 0 };
  for (let i = 0; i < 400; i++) {
    const r = simulateFight({
      boutId: `sb-${i}`,
      red: { fighter: gp, plan: planFor(gp, gr) },
      blue: { fighter: gr, plan: planFor(gr, gp) },
    });
    for (const e of r.events)
      if (e.kind === 'submissionAttempt' && e.corner === 'red') {
        const n = e.text.match(/the (.+?)(?: locked|\.$)/)?.[1] ?? '?';
        names[n] = (names[n] ?? 0) + 1;
      }
  }
  const t = Object.values(names).reduce((x, y) => x + y, 0);
  console.log(
    '[subs] guard player attempts:',
    Object.entries(names)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v / t)}`)
      .join(', '),
  );
}

// 7. Leg kicks: does leg damage change the victim's behaviour (stance switch, fewer kicks, more TDs)?
{
  const k = makeFighter({
    id: 'fighter_k',
    lastName: 'K',
    attributes: { kicking: 90, strikingOffence: 60 },
  });
  const b = makeFighter({ id: 'fighter_b', lastName: 'B', attributes: { kicking: 70 } });
  const plan: GamePlan = { ...defaultGamePlan(), targeting: { head: 0.2, body: 0.1, legs: 0.7 } };
  const kicksByRound = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const r = simulateFight({ boutId: `lk-${i}`, red: { fighter: k, plan }, blue: { fighter: b } });
    if (r.round < 3) continue;
    n++;
    for (const e of r.events)
      if (e.corner === 'blue' && e.weapon === 'kick') kicksByRound[e.round - 1]!++;
  }
  console.log(
    `[leg kicks] victim's own kick lines per round R1/R2/R3 ${kicksByRound.map((x) => (x / n).toFixed(2)).join(' / ')} (n=${n})`,
  );
}
