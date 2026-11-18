/**
 * Fight-engine audit harness. Measures diversity, ebb and flow, adjustment and variety
 * across style matchups. Run: npx vite-node tools/audit/fight-engine-audit.ts
 */
import {
  ARCHETYPES,
  makeFighter,
  simulateFight,
  planFor,
  type Fighter,
  type FightResult,
} from '@mmasim/engine';

const A = ARCHETYPES;
const pairs: [string, () => Fighter, () => Fighter][] = [
  [
    'even',
    () => makeFighter({ id: 'fighter_a', lastName: 'A' }),
    () => makeFighter({ id: 'fighter_b', lastName: 'B' }),
  ],
  ['striker-v-grinder', A.striker, A.grinder],
  ['bomber-v-journeyman', A.bomber, A.journeyman],
  ['contender-v-journeyman', A.contender, A.journeyman],
  ['guardPlayer-v-grinder', A.guardPlayer, A.grinder],
  ['olympicBoxer-v-pointKarateka', A.olympicBoxer, A.pointKarateka],
  ['southpawSniper-v-striker', A.southpawSniper, A.striker],
  ['smotherer-v-striker', A.smotherer, A.striker],
  ['guardPlayer-v-striker', A.guardPlayer, A.striker],
];

const N = Number(process.env.N ?? 300);
const inc = (m: Record<string, number>, k: string, v = 1) => (m[k] = (m[k] ?? 0) + v);
const pct = (x: number) => (100 * x).toFixed(1) + '%';
const fmt = (m: Record<string, number>, total?: number) => {
  const t = total ?? Object.values(m).reduce((a, b) => a + b, 0);
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${pct(v / t)}`)
    .join(', ');
};

function roundWinners(r: FightResult): ('red' | 'blue' | 'even')[] {
  const n = r.scorecards[0]?.rounds.length ?? 0;
  const out: ('red' | 'blue' | 'even')[] = [];
  for (let i = 0; i < n; i++) {
    let red = 0,
      blue = 0;
    for (const c of r.scorecards) {
      red += c.rounds[i]!.red;
      blue += c.rounds[i]!.blue;
    }
    out.push(red > blue ? 'red' : blue > red ? 'blue' : 'even');
  }
  return out;
}

for (const [name, mkR, mkB] of pairs) {
  const red = mkR(),
    blue = mkB();
  const agg: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  const methods: Record<string, number> = {};
  const subsByName: Record<string, number> = {};
  const strikeLines = new Set<string>();
  const tdEntries: Record<string, number> = {};
  const weapons: Record<string, number> = {};
  const burst: Record<string, number> = {};
  let fights5 = 0;
  let swingFights = 0,
    comebackWins = 0,
    r1Losers = 0;
  let bothDropped = 0,
    droppedThenWon = 0,
    droppedAny = 0,
    hurtThenWon = 0,
    hurtAny = 0;
  let leadChanges = 0,
    lcFights = 0;
  let chainTD = 0,
    chainTDopp = 0,
    tdAfterAny = 0,
    tdAfterAnyOpp = 0;
  let r1TdA = 0,
    r3TdA = 0,
    r1Strikes = 0,
    r3Strikes = 0;
  let positionChanges = 0;
  let sameSubRepeat = 0,
    subAttempts = 0;
  const stories: Record<string, number> = {};
  const STORY: [string, RegExp][] = [
    ['bodyFold', /folds —|doubles over/],
    ['legGone', /leg simply will not/],
    ['legHobbled', /lead leg is buckling|limping now/],
    ['checked', /checks the kick/],
    ['injury', /shaking out the hand|limping on the kicking foot|holding the ribs|eye swelling|favouring the arm|shoulder hanging|weight on that leg|damaged ankle|stiff in the neck/],
    ['secondWind', /second wind|walking forward again/],
    ['survivalClinch', /grabs hold to survive/],
    ['chainLink', /does not let go|chains it|Relentless from/],
    ['frontHeadlock', /front headlock/],
    ['matReturn', /Mat return|drags them straight back/],
    ['backExposed', /gives up the back|turtles to get up|turns away to stand/],
    ['scramble', /scramble/i],
    ['corner', /^In .* corner:/],
    ['guardRecovery', /shrimps out|works back to/],
    ['legEntry', /dives on a leg|entangles the legs/],
    ['combination', /./],
  ];
  const phaseTime = { distance: 0, clinch: 0, ground: 0 } as Record<string, number>;

  for (let i = 0; i < N; i++) {
    const r = simulateFight({
      boutId: `audit-${name}-${i}`,
      red: { fighter: red, plan: planFor(red, blue) },
      blue: { fighter: blue, plan: planFor(blue, red) },
      rounds: 3,
    });
    inc(methods, r.method);
    const ev = r.events;
    for (const e of ev) {
      for (const [k, re] of STORY) if ((k === 'combination' ? e.kind === 'combination' : e.kind !== 'combination') && re.test(e.text)) inc(stories, k);
      inc(kinds, e.kind);
      if (e.weapon) inc(weapons, `${e.weapon}/${e.target}`);
      if (
        (e.kind === 'strike' || e.kind === 'kick') &&
        !/swings|short|countered|slipped/.test(e.text)
      )
        strikeLines.add(
          e.text.replace(/^\S+ /, '').replace(/ — flush.*| clean\.|, but.*|\.$/g, ''),
        );
      if (e.takedown) inc(tdEntries, `${e.kind}:${e.takedown}`);
    }
    // Submissions by name + repeats
    const subNamesByCorner: Record<string, string[]> = { red: [], blue: [] };
    for (const e of ev)
      if (e.kind === 'submissionAttempt') {
        const m = e.text.match(/the (.+?) (locked|\.)/);
        const n = m?.[1] ?? '?';
        inc(subsByName, n);
        subAttempts++;
        if (subNamesByCorner[e.corner!]!.includes(n)) sameSubRepeat++;
        subNamesByCorner[e.corner!]!.push(n);
      }
    // Chain wrestling: after a stuffed TD by X, how often is X's *next* meaningful action another TD?
    const actionKinds = ['strike', 'kick', 'takedown', 'takedownStuffed', 'clinch', 'clinchBreak'];
    const acts = ev.filter((e) => actionKinds.includes(e.kind));
    for (let k = 0; k + 1 < acts.length; k++) {
      const a = acts[k]!, b = acts[k + 1]!;
      if (a.kind !== 'takedownStuffed') continue;
      // The stuffed event is told from the defender's corner; the shooter is the other one.
      const shooter = a.corner === 'red' ? 'blue' : 'red';
      chainTDopp++;
      const again = (b.kind === 'takedown' && b.corner === shooter) || (b.kind === 'takedownStuffed' && b.corner === a.corner);
      if (again) chainTD++;
    }
    // base rate: TD attempts / all distance actions
    for (const a of acts) {
      tdAfterAnyOpp++;
      if (a.takedown) tdAfterAny++;
    }
    // Position changes
    for (const e of ev)
      if (
        [
          'takedown',
          'clinch',
          'clinchBreak',
          'standUp',
          'refStandUp',
          'sweep',
          'positionAdvance',
        ].includes(e.kind)
      )
        positionChanges++;

    // Ebb and flow
    const rw = roundWinners(r);
    if (rw.length >= 2) {
      if (new Set(rw.filter((x) => x !== 'even')).size > 1) swingFights++;
      const winner = r.winnerId === red.id ? 'red' : r.winnerId === blue.id ? 'blue' : undefined;
      if (rw[0] !== 'even') {
        r1Losers++;
        if (winner && winner !== rw[0]) comebackWins++;
      }
    }
    // knockdowns
    const kdBy = { red: 0, blue: 0 } as Record<string, number>;
    const hurtVictim = { red: 0, blue: 0 } as Record<string, number>;
    for (const e of ev) {
      if (e.kind === 'knockdown') kdBy[e.corner!]!++;
      if (e.kind === 'hurt') hurtVictim[e.corner!]!++;
    }
    if (kdBy.red! > 0 && kdBy.blue! > 0) bothDropped++;
    for (const c of ['red', 'blue']) {
      const other = c === 'red' ? 'blue' : 'red';
      const cid = c === 'red' ? red.id : blue.id;
      if (kdBy[other]! > 0) {
        droppedAny++;
        if (r.winnerId === cid) droppedThenWon++;
      }
      if (hurtVictim[c]! > 0 || kdBy[other]! > 0) {
        hurtAny++;
        if (r.winnerId === cid) hurtThenWon++;
      }
    }
    // lead changes in cumulative damage within the fight
    let lead = 0,
      cum = 0,
      changes = 0;
    for (const e of ev) {
      if (
        (e.kind === 'strike' || e.kind === 'kick' || e.kind === 'groundStrikes') &&
        !/swings|short|countered|slipped/.test(e.text)
      ) {
        cum += e.corner === 'red' ? 1 : -1;
        const s = Math.sign(cum);
        if (s !== 0 && lead !== 0 && s !== lead) changes++;
        if (s !== 0) lead = s;
      }
    }
    leadChanges += changes;
    lcFights++;
    // adjustment proxy: takedown attempts and strikes R1 vs R3 (fights that went 3)
    if (r.roundStats && r.roundStats.length === 3) {
      fights5++;
      for (const c of ['red', 'blue'] as const) {
        r1Strikes += r.roundStats[0]![c].strikesAttempted;
        r3Strikes += r.roundStats[2]![c].strikesAttempted;
      }
      r1TdA += ev.filter((e) => e.round === 1 && e.takedown).length;
      r3TdA += ev.filter((e) => e.round === 3 && e.takedown).length;
    }
    for (const c of ['red', 'blue'] as const) {
      const s = r.stats[c];
      inc(agg, 'sigLanded', s.significantStrikesLanded);
      inc(agg, 'sigAtt', s.significantStrikesAttempted);
      inc(agg, 'tdL', s.takedownsLanded);
      inc(agg, 'tdA', s.takedownsAttempted);
      inc(agg, 'subA', s.submissionAttempts);
      inc(agg, 'kd', s.knockdowns);
      phaseTime.distance! += s.distanceSeconds / 2;
      phaseTime.clinch! += s.clinchControlSeconds;
      phaseTime.ground! += s.controlSeconds - s.clinchControlSeconds;
      for (const [k, v] of Object.entries(s.strikesByWeapon)) inc(burst, k, v);
    }
    inc(agg, 'minutes', ((r.round - 1) * 300 + r.timeSeconds) / 60);
  }

  console.log(
    `\n=== ${name}  (${N} fights, red=${red.lastName} ${red.stance}, blue=${blue.lastName} ${blue.stance}) ===`,
  );
  console.log('methods:', fmt(methods));
  console.log(
    `per fight-minute (both): sigLanded ${(agg.sigLanded! / agg.minutes!).toFixed(2)}  acc ${pct(agg.sigLanded! / agg.sigAtt!)}  TD ${agg.tdL}/${agg.tdA} (${pct(agg.tdL! / agg.tdA!)})  subAtt/fight ${(agg.subA! / N).toFixed(2)}  KD/fight ${(agg.kd! / N).toFixed(2)}`,
  );
  const pt = phaseTime.distance! + phaseTime.clinch! + phaseTime.ground!;
  console.log(
    `phase share (approx): distance ${pct(phaseTime.distance! / pt)} clinch ${pct(phaseTime.clinch! / pt)} ground ${pct(phaseTime.ground! / pt)}  position-changes/fight ${(positionChanges / N).toFixed(1)}`,
  );
  console.log('landed by weapon:', fmt(burst));
  console.log(
    `ebb/flow: fights with rounds split between fighters ${pct(swingFights / N)}; R1 loser wins fight ${pct(comebackWins / Math.max(1, r1Losers))}; damage-lead changes/fight ${(leadChanges / lcFights).toFixed(1)}`,
  );
  console.log(
    `  both fighters dropped ${pct(bothDropped / N)}; dropped-then-won ${pct(droppedThenWon / Math.max(1, droppedAny))} (n=${droppedAny}); hurt/dropped-then-won ${pct(hurtThenWon / Math.max(1, hurtAny))} (n=${hurtAny})`,
  );
  console.log(
    `adjustment proxy (3-round fights, n=${fights5}): strikesAtt R1 ${(r1Strikes / fights5).toFixed(1)} vs R3 ${(r3Strikes / fights5).toFixed(1)}; TD attempts R1 ${(r1TdA / fights5).toFixed(2)} vs R3 ${(r3TdA / fights5).toFixed(2)}`,
  );
  console.log(
    `chain wrestling: P(next action is TD by same man | his shot was just stuffed) ${pct(chainTD / Math.max(1, chainTDopp))} vs base TD share of standing actions ${pct(tdAfterAny / tdAfterAnyOpp)}`,
  );
  console.log(
    'subs by name:',
    fmt(subsByName),
    `| same sub repeated in fight ${pct(sameSubRepeat / Math.max(1, subAttempts))}`,
  );
  console.log('takedown entries:', fmt(tdEntries));
  console.log('stories per 100 fights:', Object.entries(stories).map(([k, v]) => `${k} ${(100 * v / N).toFixed(1)}`).join(', '));
  console.log(`distinct landed strike descriptions: ${strikeLines.size}`);
  console.log(
    'event kinds/fight:',
    Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${(v / N).toFixed(1)}`)
      .join(', '),
  );
}
