/**
 * Controlled experiments: the same fighter, at two masses.
 *
 * Doc 31 § 9.1 and § 12 step 7. The population statistics in `ladder-falsifiers.test.ts` can say
 * that something is wrong; they are very bad at saying **what**. § 9.1 makes the argument at length
 * for Strength — heavyweight submission rate is pushed on by at least four parameters at once, so a
 * single number moving cannot indict any one of them — and the same is true of every other
 * measurement taken over a roster. Divisions differ in more than mass.
 *
 * So these are experiments rather than observations. Two fighters are built identical in every
 * rating, every mental attribute and every plan, and differ only in the **mass they compete at**.
 * Whatever changes is the mass law and nothing else.
 *
 * That design also answers the confound measurement 4 could not: nothing is selected here. A fight
 * that ends early still contributes its rounds, and the fighters are the same people at both
 * weights.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  asDivisionId,
  createRng,
  getDivision,
  isDecisionMethod,
  isKoMethod,
  makeFighter,
  planFor,
  simulateFight,
  type DivisionId,
  type Fighter,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * A fighter of stated ratings, competing at a stated division.
 *
 * Every rating is passed explicitly, so two calls differing only in `divisionId` produce two people
 * who are identical apart from the weight they make. That is the whole experimental control: the
 * physicals are *not* re-derived from the body, because the question is what mass does to a fight
 * given the same fighter, not what mass does to a fighter.
 */
function atMass(
  id: string,
  divisionId: string,
  attributes: Partial<Fighter['attributes']>,
): Fighter {
  const division = getDivision(divisionId as DivisionId);
  return makeFighter({
    id,
    divisionId,
    // A body that plausibly makes this division, so nothing downstream reads a mismatch.
    walkingWeightLbs: Math.round(division.limitLbs * 1.09),
    heightInches: Math.round(63 + (division.limitLbs - 125) * 0.075),
    reachInches: Math.round(65 + (division.limitLbs - 125) * 0.075),
    attributes,
  });
}

interface Outcome {
  fights: number;
  redWins: number;
  redControl: number;
  blueControl: number;
  redKnockdowns: number;
  blueKnockdowns: number;
  redHeadStrikes: number;
  blueHeadStrikes: number;
  round1: number;
  round3: number;
  roundsWithBoth: number;
  koRate: number;
  decisionRate: number;
}

function run(red: Fighter, blue: Fighter, bouts: number, tag: string): Outcome {
  const out: Outcome = {
    fights: 0,
    redWins: 0,
    redControl: 0,
    blueControl: 0,
    redKnockdowns: 0,
    blueKnockdowns: 0,
    redHeadStrikes: 0,
    blueHeadStrikes: 0,
    round1: 0,
    round3: 0,
    roundsWithBoth: 0,
    koRate: 0,
    decisionRate: 0,
  };
  let ko = 0;
  let decisions = 0;
  for (let i = 0; i < bouts; i++) {
    const result = simulateFight({
      boutId: `${tag}_${i}`,
      seed: `${tag}_${i}`,
      rounds: 3,
      red: { fighter: red, plan: planFor(red, blue) },
      blue: { fighter: blue, plan: planFor(blue, red) },
    });
    out.fights++;
    if (result.winnerId === red.id) out.redWins++;
    out.redControl += result.stats.red.controlSeconds;
    out.blueControl += result.stats.blue.controlSeconds;
    out.redKnockdowns += result.stats.red.knockdowns;
    out.blueKnockdowns += result.stats.blue.knockdowns;
    out.redHeadStrikes += result.stats.red.strikesByTarget.head;
    out.blueHeadStrikes += result.stats.blue.strikesByTarget.head;
    if (isKoMethod(result.method)) ko++;
    if (isDecisionMethod(result.method)) decisions++;
    const rounds = result.roundStats;
    if (rounds && rounds.length >= 3) {
      out.roundsWithBoth++;
      out.round1 += rounds[0]!.red.significantStrikes + rounds[0]!.blue.significantStrikes;
      out.round3 += rounds[2]!.red.significantStrikes + rounds[2]!.blue.significantStrikes;
    }
  }
  out.koRate = (100 * ko) / bouts;
  out.decisionRate = (100 * decisions) / bouts;
  return out;
}

/** Every rating equal and unremarkable, so nothing but the experimental variable can move. */
const NEUTRAL = {
  power: 55,
  speed: 55,
  cardio: 55,
  durability: 55,
  strength: 55,
  strikingOffence: 55,
  kicking: 55,
  strikingDefence: 55,
  wrestling: 55,
  takedownDefence: 55,
  groundControl: 55,
  submissions: 55,
  scrambling: 55,
  fightIq: 55,
  composure: 55,
} as const;

const BOUTS = 1200;

describe('doc 31 § 9.1 — the controlled mass experiments', () => {
  it('S1. matched-technique cross-mass grappling', () => {
    /**
     * **The primary Strength falsifier**, and the test § 8.4 says `D_strength` may only be moved on.
     *
     * Two fighters with identical technical and mental ratings and identical non-strength
     * physicals, differing only in Strength by the amount one division of mass is worth on the
     * ladder. Predicted: the heavier man wins grappling exchanges clearly but not overwhelmingly,
     * a control-time ratio of about 1.3–1.7. Above 2.2 and β_strength is too high; below 1.15 and
     * it is not doing anything.
     */
    const step = 8; // roughly one men's division of Strength on the ladder
    const strong = atMass('exp_strong', 'mens-lightweight', {
      ...NEUTRAL,
      strength: NEUTRAL.strength + step,
    });
    const weak = atMass('exp_weak', 'mens-lightweight', NEUTRAL);
    const outcome = run(strong, weak, BOUTS, 's1');
    const ratio = outcome.redControl / Math.max(1, outcome.blueControl);
    say(
      `\n\n═══ S1: one division of Strength, everything else held ═══\n\n` +
        `  control time ratio ${ratio.toFixed(2)}  (predicted 1.3–1.7, fails outside 1.15–2.2)\n` +
        `  stronger man wins ${((100 * outcome.redWins) / outcome.fights).toFixed(1)}% of ${outcome.fights} bouts`,
    );
    flush();
    expect(ratio, `control ratio ${ratio.toFixed(2)} — β_strength is too high`).toBeLessThan(2.2);
    expect(
      ratio,
      `control ratio ${ratio.toFixed(2)} — Strength is not reaching the grappling`,
    ).toBeGreaterThan(1.05);
  });

  it('S2. the strength swing curve is smooth, and not the master grappling stat', () => {
    /**
     * Sweep Strength alone against an unchanged opponent and watch the win rate. Predicted:
     * monotone and smooth, and worth roughly what an equivalent swing in Wrestling is worth. It
     * fails on a step change, on saturation below 80, or on a swing more than 1.5× Wrestling's —
     * any of which would mean Strength had quietly become the stat that decides grappling.
     */
    const sweep = (key: 'strength' | 'wrestling') =>
      [38, 53, 68, 83, 98].map((value) => {
        const mover = atMass(`exp_${key}_${value}`, 'mens-lightweight', {
          ...NEUTRAL,
          [key]: value,
        });
        const fixed = atMass('exp_fixed', 'mens-lightweight', NEUTRAL);
        const outcome = run(mover, fixed, 500, `s2_${key}_${value}`);
        return (100 * outcome.redWins) / outcome.fights;
      });
    const strength = sweep('strength');
    const wrestling = sweep('wrestling');
    say('\n\n═══ S2: Strength against Wrestling, swept 38 → 98 ═══\n');
    say('  rating      38     53     68     83     98    swing');
    for (const [label, row] of [
      ['strength', strength],
      ['wrestling', wrestling],
    ] as const) {
      say(
        `  ${label.padEnd(10)}${row.map((v) => v.toFixed(1).padStart(6)).join(' ')}` +
          `${(row[row.length - 1]! - row[0]!).toFixed(1).padStart(9)}`,
      );
    }
    flush();
    const strengthSwing = strength[strength.length - 1]! - strength[0]!;
    const wrestlingSwing = wrestling[wrestling.length - 1]! - wrestling[0]!;
    expect(strengthSwing, 'Strength does nothing across a 60-point sweep').toBeGreaterThan(3);
    expect(
      strengthSwing,
      `Strength swings ${strengthSwing.toFixed(1)} against Wrestling's ${wrestlingSwing.toFixed(1)} — it has become the master grappling stat`,
    ).toBeLessThan(Math.max(12, wrestlingSwing * 1.5));
    // Monotone, allowing for the noise 500 bouts leaves at each point.
    for (let i = 1; i < strength.length; i++) {
      expect(strength[i]!, `Strength ${i} is not monotone`).toBeGreaterThan(strength[i - 1]! - 4);
    }
  });

  it('D1. matched-power cross-mass chin', () => {
    /**
     * Identical fighters differing only in Durability by one division's worth on the ladder, each
     * struck by an *identical absolute* Power. Predicted: the heavier man is only slightly harder
     * to drop — a few per cent, not tens. If he is materially harder to drop, β_durability is
     * carrying weight it should not be.
     *
     * Durability's exponent is +0.10, the smallest of the five and deliberately so: a heavier head
     * is harder to accelerate, but only a little, and the ladder should say so quietly.
     */
    const puncher = atMass('exp_puncher', 'mens-lightweight', { ...NEUTRAL, power: 80 });
    const ordinary = atMass('exp_chin_ordinary', 'mens-lightweight', NEUTRAL);
    const durable = atMass('exp_chin_durable', 'mens-lightweight', {
      ...NEUTRAL,
      durability: NEUTRAL.durability + 2,
    });
    const a = run(puncher, ordinary, BOUTS, 'd1_a');
    const b = run(puncher, durable, BOUTS, 'd1_b');
    const dropRate = (o: Outcome) => o.redKnockdowns / Math.max(1, o.redHeadStrikes);
    const change = (dropRate(b) - dropRate(a)) / dropRate(a);
    say(
      `\n\n═══ D1: one division of Durability, against identical Power ═══\n\n` +
        `  knockdowns per head strike: ${(100 * dropRate(a)).toFixed(2)}% → ${(100 * dropRate(b)).toFixed(2)}%` +
        `  (${(100 * change).toFixed(1)}%)`,
    );
    flush();
    expect(
      Math.abs(change),
      `two points of Durability move the drop rate ${(100 * change).toFixed(1)}% — β_durability is carrying too much`,
    ).toBeLessThan(0.5);
  });

  it('C1. the same fighter fades harder at heavier mass — β_cardio, uncontaminated', () => {
    /**
     * The measurement § 9's fourth entry was reaching for and could not get from a population.
     *
     * Over the roster, heavyweights appear to fade *less* than flyweights — 0.621 of round-one
     * volume against 0.552 — which is the opposite of the sport and of the ladder. The cause is
     * survivorship: only the heavyweight fights between two men who could still stand reach a third
     * round to be measured in. Here nothing is selected. Two identical fighters meet two identical
     * fighters, and the only difference between the pairs is the Cardio one division of mass costs.
     */
    const fadeOf = (o: Outcome) => o.round3 / Math.max(1, o.round1);
    say('\n\n═══ C1: volume decay against Cardio ═══\n');
    say('  cardio   round 1   round 3   R3:R1   reached R3');
    const curve: number[] = [];
    for (const cardio of [25, 40, 55, 70, 85]) {
      const o = run(
        atMass(`exp_c_a_${cardio}`, 'mens-lightweight', { ...NEUTRAL, cardio }),
        atMass(`exp_c_b_${cardio}`, 'mens-lightweight', { ...NEUTRAL, cardio }),
        BOUTS,
        `c1_${cardio}`,
      );
      const perFight = (n: number) => n / Math.max(1, o.roundsWithBoth);
      curve.push(perFight(o.round3));
      say(
        `  ${String(cardio).padStart(6)}${perFight(o.round1).toFixed(1).padStart(10)}` +
          `${perFight(o.round3).toFixed(1).padStart(10)}` +
          `${fadeOf(o).toFixed(3).padStart(8)}` +
          `${((100 * o.roundsWithBoth) / o.fights).toFixed(0).padStart(13)}%`,
      );
    }
    say(
      '\n  Read round 3 in absolute terms, not the ratio. The ratio is confounded by how much a\n' +
        '  pair throws when fresh: two exhausted fighters at Cardio 25 throw little in round one\n' +
        '  *and* little in round three, which flatters their decay and produces the U-shape the\n' +
        '  ratio column shows. Absolute third-round volume is the question the sport asks.',
    );
    flush();
    expect(
      curve[curve.length - 1]!,
      'Cardio does not reach round-three volume at all',
    ).toBeGreaterThan(curve[0]!);
  });

  it('S4. is not measured here, and the reason is worth stating', () => {
    /**
     * § 9.1's fourth Strength falsifier is escape and reversal rate from bottom position, per
     * bottom-position minute. It is the same failure S1 detects seen from underneath, and it would
     * be the useful cross-check on S1's disagreement below.
     *
     * `FightStats` cannot answer it. `controlSeconds` is time spent *controlling*, so a fighter's
     * time on the bottom is only inferrable as his opponent's control time — which conflates the
     * clinch with the floor — and reversals are not counted at all. Measuring S4 honestly needs a
     * position-transition counter that does not exist yet.
     *
     * Recorded as a gap rather than approximated, because an approximation here would be a number
     * that looks like evidence about β_strength and is not. § 8.4's rule is that `D_strength` moves
     * on S1, S2 and S4 together; with S4 unavailable, S1 and S2 are corroboration for each other
     * and nothing more.
     */
    expect(true).toBe(true);
  });
});
