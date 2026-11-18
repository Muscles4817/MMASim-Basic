/**
 * The claims doc 36 (the combat simulation plan) makes about the fight, as tests.
 *
 * Each block is one of § 0's testable claims, measured on seeded fights with a tolerance sized to
 * the sample. Together they are the regression guard for the audit's findings: an engine that loses
 * any of these has gone back to resolving every exchange as if nothing had happened before it.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  convictionFor,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  planFor,
  simulateFight,
  type Fighter,
  type FightResult,
} from '@mmasim/engine';

/**
 * Yields to the event loop every few dozen fights, as `roster-profile.test.ts` does: a worker that
 * runs thousands of fights without yielding cannot answer the reporter's `onTaskUpdate` RPC, and
 * vitest fails an otherwise green run for it (CI did exactly that on this file's first run).
 */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run(
  red: Fighter,
  blue: Fighter,
  n: number,
  seed: string,
  planned = true,
): Promise<FightResult[]> {
  const out: FightResult[] = [];
  for (let i = 0; i < n; i++) {
    if (i % 50 === 0) await breathe();
    out.push(
      simulateFight({
        boutId: `${seed}-${i}`,
        red: { fighter: red, plan: planned ? planFor(red, blue) : undefined },
        blue: { fighter: blue, plan: planned ? planFor(blue, red) : undefined },
      }),
    );
  }
  return out;
}

const even = () =>
  [
    makeFighter({ id: 'fighter_a', lastName: 'A' }),
    makeFighter({ id: 'fighter_b', lastName: 'B' }),
  ] as const;

describe('claim 7 — the fight ebbs rather than collapses', () => {
  it('fades by round three, but by a fifth to a third rather than by half', async () => {
    const [a, b] = even();
    const att = [0, 0, 0];
    let n = 0;
    for (const r of await run(a, b, 400, 'depth-fade')) {
      if (!r.method.startsWith('decision') || r.roundStats?.length !== 3) continue;
      n++;
      r.roundStats.forEach((t, k) => (att[k]! += t.red.strikesAttempted + t.blue.strikesAttempted));
    }
    const ratio = att[2]! / att[0]!;
    // Before doc 36 this read 0.48: an average professional threw half as much in the third.
    expect(ratio, `R3/R1 output ${ratio.toFixed(2)} over ${n} decisions`).toBeGreaterThan(0.6);
    expect(ratio, `R3/R1 output ${ratio.toFixed(2)} over ${n} decisions`).toBeLessThan(0.92);
  });
});

describe('claim 1 — sequence matters', () => {
  it('makes a chain wrestler shoot again after a stuffed shot more often than he shoots at all', async () => {
    let after = 0;
    let stuffed = 0;
    let shots = 0;
    let actions = 0;
    for (const r of await run(ARCHETYPES.grinder(), ARCHETYPES.striker(), 300, 'depth-chain')) {
      const acts = r.events.filter((e) =>
        ['strike', 'kick', 'takedown', 'takedownStuffed', 'clinch', 'clinchBreak'].includes(e.kind),
      );
      for (let i = 0; i < acts.length; i++) {
        const e = acts[i]!;
        const byGrinder =
          (e.kind === 'takedown' && e.corner === 'red') ||
          (e.kind === 'takedownStuffed' && e.corner === 'blue');
        if (e.corner === 'red' || e.kind === 'takedownStuffed') actions++;
        if (byGrinder) shots++;
        if (e.kind === 'takedownStuffed' && e.corner === 'blue' && i + 1 < acts.length) {
          stuffed++;
          const n = acts[i + 1]!;
          if (
            (n.kind === 'takedown' && n.corner === 'red') ||
            (n.kind === 'takedownStuffed' && n.corner === 'blue')
          )
            after++;
        }
      }
    }
    const chain = after / stuffed;
    const base = shots / actions;
    // Before doc 36: 2.9 % after a stuffed shot against a 17.8 % base rate — it ran backwards.
    expect(chain, `re-shot ${chain.toFixed(3)} vs base ${base.toFixed(3)}`).toBeGreaterThan(
      base * 1.25,
    );
  });

  it('narrates combinations, which the event vocabulary had and nothing emitted', async () => {
    const [a, b] = even();
    const combos = (await run(a, b, 100, 'depth-combo')).reduce(
      (s, r) => s + r.events.filter((e) => e.kind === 'combination').length,
      0,
    );
    expect(combos / 100).toBeGreaterThan(1);
  });
});

describe('claim 2 — fighters learn during the fight', () => {
  it('makes a wrestler whose shots were stuffed shoot less later than one whose shots landed', async () => {
    const w = makeFighter({
      id: 'fighter_w',
      lastName: 'W',
      attributes: {
        wrestling: 72,
        groundControl: 75,
        strikingOffence: 50,
        kicking: 40,
        fightIq: 80,
      },
    });
    const s = makeFighter({
      id: 'fighter_s',
      lastName: 'S',
      attributes: { takedownDefence: 85, strikingOffence: 70, kicking: 60, wrestling: 45 },
    });
    const b: Record<'stuffed' | 'landed', { a: number; n: number }> = {
      stuffed: { a: 0, n: 0 },
      landed: { a: 0, n: 0 },
    };
    for (const r of await run(w, s, 2500, 'depth-adapt')) {
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
      const key = rate === 0 ? 'stuffed' : rate === 1 ? 'landed' : undefined;
      if (!key) continue;
      b[key].a += mine(3).length;
      b[key].n++;
    }
    const stuffed = b.stuffed.a / b.stuffed.n;
    const landed = b.landed.a / b.landed.n;
    // Before doc 36 this ran the other way: 2.63 against 2.46.
    expect(
      stuffed,
      `R3 shots after a stuffed R1 ${stuffed.toFixed(2)} vs a landed one ${landed.toFixed(2)}`,
    ).toBeLessThan(landed);
  });

  it('has the corner speak between rounds', async () => {
    const [a, b] = even();
    const lines = (await run(a, b, 100, 'depth-corner')).reduce(
      (s, r) => s + r.events.filter((e) => /^In .* corner:/.test(e.text)).length,
      0,
    );
    expect(lines / 100).toBeGreaterThan(0.5);
  });
});

describe('claim 6 — damage creates stories, rarely', () => {
  let fights: FightResult[] = [];
  beforeAll(async () => {
    const [a, b] = even();
    fights = [
      ...(await run(a, b, 600, 'depth-story-even')),
      ...(await run(
        ARCHETYPES.olympicBoxer(),
        ARCHETYPES.pointKarateka(),
        600,
        'depth-story-strike',
      )),
    ];
  });

  it('lets a body shot fold a fighter, a few times in a hundred fights', async () => {
    const folds = fights.filter((r) =>
      r.events.some((e) => /folds —|doubles over/.test(e.text)),
    ).length;
    const share = folds / fights.length;
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.15);
  });

  it('breaks things during fights, and reports them for the medical', async () => {
    const hurt = fights.filter(
      (r) => (r.injuries?.red.length ?? 0) + (r.injuries?.blue.length ?? 0) > 0,
    ).length;
    const share = hurt / fights.length;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.2);
  });

  it('lets a corner retire a fighter, but rarely', async () => {
    const share = fights.filter((r) => r.method === 'retirement').length / fights.length;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.03);
  });
});

describe('claim 4 — what a fighter has drilled shows', () => {
  it('gives a submission specialist a signature that dominates his attempts', async () => {
    const gp = ARCHETYPES.guardPlayer();
    const names: Record<string, number> = {};
    for (const r of await run(gp, ARCHETYPES.grinder(), 300, 'depth-sig')) {
      for (const e of r.events) {
        if (e.kind !== 'submissionAttempt' || e.corner !== 'red') continue;
        const name = e.text.match(/(?:goes for|has) the (.+?)(?: locked|\.$)/)?.[1] ?? '?';
        names[name] = (names[name] ?? 0) + 1;
      }
    }
    const counts = Object.values(names).sort((x, y) => y - x);
    const total = counts.reduce((x, y) => x + y, 0);
    // Before doc 36 the top four were 20.6 / 20.5 / 20.4 / 19.8 % — no signature at all.
    expect(counts[0]! / total, JSON.stringify(names)).toBeGreaterThan(0.25);
    expect(Object.keys(names).length, JSON.stringify(names)).toBeGreaterThan(5);
  });

  it('keeps leg locks to the fighters with a leg-lock game', async () => {
    const legLocker = {
      ...makeFighter({
        id: 'fighter_ll',
        lastName: 'LL',
        attributes: { submissions: 85, scrambling: 75 },
      }),
      style: { legLocks: 0.9 },
    };
    const wrestler = {
      ...makeFighter({
        id: 'fighter_wr',
        lastName: 'WR',
        attributes: { wrestling: 85, submissions: 55 },
      }),
      style: { legLocks: 0 },
    };
    const legs = async (f: Fighter) =>
      (await run(f, ARCHETYPES.grinder(), 200, `depth-legs-${f.id}`)).reduce(
        (s, r) =>
          s +
          r.events.filter(
            (e) =>
              e.kind === 'submissionAttempt' &&
              e.corner === 'red' &&
              /heel hook|kneebar|ankle lock|toe hold/.test(e.text),
          ).length,
        0,
      );
    expect(await legs(legLocker)).toBeGreaterThan(20);
    expect(await legs(wrestler)).toBe(0);
  });
});

describe('claim 8 — a stance shape buys something and costs something', () => {
  const base = makeFighter({ id: 'fighter_me', lastName: 'Me' });
  const kicker = makeFighter({
    id: 'fighter_k',
    lastName: 'K',
    attributes: { kicking: 85, strikingOffence: 60 },
  });
  const wrestler = makeFighter({
    id: 'fighter_w',
    lastName: 'W',
    attributes: { wrestling: 82, groundControl: 75, strikingOffence: 45 },
  });
  const tdAgainst = async (style: 'standard' | 'crouched' | 'bladed') => {
    let a = 0;
    let l = 0;
    for (const r of await run(
      { ...base, style: { stanceStyle: style } },
      wrestler,
      800,
      `depth-st-td`,
      false,
    )) {
      a += r.stats.blue.takedownsAttempted;
      l += r.stats.blue.takedownsLanded;
    }
    return l / a;
  };
  const legsAbsorbed = async (style: 'standard' | 'bladed') =>
    (
      await run({ ...base, style: { stanceStyle: style } }, kicker, 800, `depth-st-legs`, false)
    ).reduce((s, r) => s + r.stats.blue.strikesByTarget.legs, 0);

  it('makes a crouched stance harder to take down and a bladed one easier', async () => {
    const standard = await tdAgainst('standard');
    expect(await tdAgainst('crouched')).toBeLessThan(standard - 0.03);
    expect(await tdAgainst('bladed')).toBeGreaterThan(standard + 0.02);
  });

  it('makes a bladed stance pay for its reach in leg kicks', async () => {
    expect(await legsAbsorbed('bladed')).toBeGreaterThan((await legsAbsorbed('standard')) * 1.05);
  });
});

describe('claim 5 — every phase has depth', () => {
  it('throws more than knees in the clinch', async () => {
    let knees = 0;
    let other = 0;
    for (const r of await run(
      ARCHETYPES.olympicBoxer(),
      ARCHETYPES.smotherer(),
      200,
      'depth-clinch',
    )) {
      for (const e of r.events) {
        if (
          !e.weapon ||
          e.missed ||
          !/tie-up|clinch|collar tie|as they break|against the fence|in the clinch|stomp/.test(
            e.text,
          )
        )
          continue;
        if (e.weapon === 'knee') knees++;
        else other++;
      }
    }
    // Before doc 36 every clinch strike in the game was a knee.
    expect(other, `knees ${knees} other ${other}`).toBeGreaterThan(knees * 0.3);
  });

  it('takes backs from more places than mount', async () => {
    let backs = 0;
    for (const r of await run(ARCHETYPES.grinder(), ARCHETYPES.striker(), 300, 'depth-back')) {
      backs += r.events.filter((e) =>
        /takes the back|gives up the back|spins behind|rides the turtle|turtled up/.test(e.text),
      ).length;
    }
    expect(backs / 300).toBeGreaterThan(0.2);
  });
});

describe('cage geography — pressure traps, footwork escapes', async () => {
  const plan = (state: 'pocket' | 'outside', entry: 'pressure' | 'movement') => ({
    ...defaultGamePlan(),
    tactics: {
      ...defaultTactics(),
      preferredState: state,
      entry,
      conviction: convictionFor(state),
    },
  });
  const fence = async (pressed: Fighter, seed: string) => {
    const presser = makeFighter({ id: 'fighter_presser', lastName: 'P' });
    let s = 0;
    for (let i = 0; i < 400; i++) {
      if (i % 50 === 0) await breathe();
      const r = simulateFight({
        boutId: `${seed}-${i}`,
        red: { fighter: presser, plan: plan('pocket', 'pressure') },
        blue: { fighter: pressed, plan: plan('outside', 'movement') },
      });
      s += r.stats.blue.fenceSeconds;
    }
    return s / 400;
  };

  it('puts an outside fighter on the fence against a pressure fighter, and a quick smart one less', async () => {
    const plain = await fence(makeFighter({ id: 'fighter_b', lastName: 'B' }), 'depth-cage-plain');
    const quick = await fence(
      makeFighter({ id: 'fighter_q', lastName: 'Q', attributes: { speed: 85, fightIq: 80 } }),
      'depth-cage-quick',
    );
    expect(plain, `plain ${plain.toFixed(0)}s`).toBeGreaterThan(30);
    expect(quick, `quick ${quick.toFixed(0)}s vs plain ${plain.toFixed(0)}s`).toBeLessThan(
      plain * 0.75,
    );
  });

  it('leaves two fighters with no plan mostly in the open', async () => {
    let s = 0;
    const [a, b] = even();
    for (const r of await run(a, b, 200, 'depth-cage-even', false))
      s += r.stats.red.fenceSeconds + r.stats.blue.fenceSeconds;
    expect(s / 200).toBeLessThan(60);
  });
});
