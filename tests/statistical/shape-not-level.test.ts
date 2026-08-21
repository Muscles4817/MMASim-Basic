/**
 * Shape, not level.
 *
 * Four times in one change a table of multipliers meant to say *which matchup is which* quietly
 * said *how dangerous the sport is* instead, and every one of them was found by accident — by a
 * roster knockout rate moving when nothing about knockouts had been touched. They are the same
 * bug wearing four hats:
 *
 *  - `BASE_INTENT` folded a hidden 1.25× striking bias into the engine, and every statistical
 *    bound in the repo had been calibrated on it.
 *  - `ENTRY_EASE` had a mean of 0.84 under the range mix, so grappling got 16% harder everywhere
 *    rather than harder at kicking range and easier in the pocket.
 *  - The Reduced resolver's kick-hazard blend read `1.0` for a puncher and `1.5` for a kicker and
 *    was divided by nothing at all, handing the entire roster a hazard bonus.
 *  - `REFERENCE_KICK_SHARE` was computed at an even target mix — a third of shots to the legs,
 *    which are always kicks — so it sat at 0.563 and taxed every head-hunter in the game.
 *
 * The rule this file enforces, and it is a rule about the whole engine rather than about range:
 *
 * > **A modifier that shapes matchups must not move the sport.** It has to be tested for both —
 * > that it makes a difference *between* fighters, and that it makes none *to the population* —
 * > unless moving the population is the explicit, named purpose of the thing.
 *
 * Both halves are load-bearing. A modifier that fails differentiation is dead code with a
 * comment. A modifier that fails neutrality is a global recalibration disguised as a feature, and
 * it will be found the way all four of these were: months later, by something unrelated breaking.
 *
 * The two describes below are the two halves of the rule at two altitudes. The first is arithmetic
 * on the tables themselves and costs nothing. The second runs populations and is the one that
 * would have caught `BASE_INTENT`, which was never a table.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  RANGES,
  simulateFight,
  STRIKE_TARGETS,
  defaultGamePlan,
  defaultTactics,
  type Fighter,
  type GamePlan,
  type PreferredState,
  type Range,
  type TacticalPlan,
} from '@mmasim/engine';
import * as range from '../../packages/engine/src/fight/range.js';
import { stanceEdge } from '../../packages/engine/src/fight/stance.js';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import { runMatchup, type MatchupSummary } from '../helpers/sim.js';

/* ---------------------------------------------------------------------------------------------
 * Half one — the tables
 * ------------------------------------------------------------------------------------------- */

/**
 * Tables indexed by range that are *deliberately* not mean-1, with the reason.
 *
 * The list is the point. Anything indexed by range and exported from `range.ts` that is not named
 * here has to be a shape, and a new one added without thinking fails this file rather than the
 * roster profile six months later.
 */
const DECLARED_LEVELS: Readonly<Record<string, string>> = {
  REFERENCE_MIX:
    'a probability distribution over the three ranges, not a multiplier — it sums to 1 by ' +
    'definition and is the weighting every shape below is normalised against',
};

type NumberByRange = Record<Range, number>;

const isRangeTable = (value: unknown): value is NumberByRange => {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  return (
    keys.length === RANGES.length &&
    RANGES.every((r) => typeof (value as Record<string, unknown>)[r] === 'number')
  );
};

const rangeTables = Object.entries(range).filter(([, v]) => isRangeTable(v)) as [
  string,
  NumberByRange,
][];

describe('a table indexed by range is a shape', () => {
  it('finds the tables at all, so an empty sweep cannot pass silently', () => {
    // The failure mode of every reflective test: the filter stops matching, nothing is checked,
    // and the file goes green for the rest of its life.
    expect(
      rangeTables.map(([name]) => name).sort(),
      'no range-indexed tables found — has the export shape changed?',
    ).toEqual(['ENTRY_EASE', 'RANGE_COUNTER', 'RANGE_EXERTION', 'RANGE_HAZARD', 'REFERENCE_MIX']);
  });

  it.each(rangeTables.filter(([name]) => !(name in DECLARED_LEVELS)))(
    '%s has a mean of 1 under the reference range mix',
    (name, table) => {
      const mean = RANGES.reduce((total, r) => total + table[r] * range.REFERENCE_MIX[r], 0);
      const spread = Math.max(...RANGES.map((r) => table[r])) / Math.min(...RANGES.map((r) => table[r]));

      // Mean-1 says it is not a level. The spread says it is not *nothing* — a table of all 1.0s
      // would pass the first assertion perfectly and do no work at all.
      expect(mean, `${name} mean ${mean.toFixed(4)}: this is a level, not a shape`).toBeCloseTo(1, 3);
      expect(spread, `${name} is flat and therefore inert`).toBeGreaterThan(1.05);
    },
  );

  it('keeps the target table mean-1 at every range independently', () => {
    /*
     * `targetFitness` is normalised per range rather than across the whole table, because it
     * answers "where should this fighter aim *from here*" — so each range's column has to be
     * mean-1 on its own or standing somewhere becomes a reason to throw more shots overall. The
     * pocket column summing to more than the outside column would be a volume bonus for pressure
     * fighters that nobody wrote and nobody could find.
     */
    for (const r of RANGES) {
      const mean =
        STRIKE_TARGETS.reduce((total, t) => total + range.targetFitness(t, r), 0) /
        STRIKE_TARGETS.length;
      expect(mean, `targetFitness at ${r} means ${mean.toFixed(4)}`).toBeCloseTo(1, 6);
    }
  });

  it('lets suitability be a level, because it is arbitrated rather than applied', () => {
    /*
     * The exception that proves the rule is a real distinction and not a slogan.
     *
     * `SUITABILITY` is emphatically *not* mean-1 — a head kick in the pocket reads 0.25 and a low
     * kick outside reads 1.3 — and that is correct, because it is never multiplied into anything.
     * `pickShot` uses it as a *ratio* between the two weapons available for one target, so the
     * level cancels inside the division. What would break is if it started being used as a
     * damage or hazard multiplier, and this assertion is the tripwire for that: the day
     * somebody reaches for `strikeSuitability` as a scale, it has to be normalised first.
     */
    const ratio = (t: 'head' | 'legs', r: Range) =>
      range.strikeSuitability('kick', t, r) / range.strikeSuitability('punch', t, r);

    // A head kick is a far worse idea in the pocket than at range; a low kick barely cares.
    expect(ratio('head', 'pocket')).toBeLessThan(ratio('head', 'outside') * 0.4);
    expect(ratio('legs', 'pocket')).toBeGreaterThan(ratio('head', 'pocket') * 2);
  });
});

/* ---------------------------------------------------------------------------------------------
 * Half two — the populations
 * ------------------------------------------------------------------------------------------- */

const POOL: readonly (() => Fighter)[] = [
  ARCHETYPES.striker,
  ARCHETYPES.grinder,
  ARCHETYPES.contender,
  ARCHETYPES.guardPlayer,
  ARCHETYPES.smotherer,
  ARCHETYPES.journeyman,
  ARCHETYPES.bomber,
  ARCHETYPES.canFodder,
];

const FIGHTS_PER_PAIR = 320;

interface SportProfile {
  ko: number;
  submission: number;
  decision: number;
  meanRound: number;
}

const describeSport = (p: SportProfile) =>
  `ko ${(p.ko * 100).toFixed(1)}% sub ${(p.submission * 100).toFixed(1)}% ` +
  `dec ${(p.decision * 100).toFixed(1)}% round ${p.meanRound.toFixed(2)}`;

/** One entry per fighter in the pool: who they are, and what they were told. */
type Corner = { fighter: Fighter; plan?: GamePlan };

/**
 * What the sport looks like when this population fights itself.
 *
 * Every fighter meets the next one round-robin-style on a seed prefix that does *not* mention the
 * variation being tested, so the flattened population fights the same fights with one thing
 * changed. That pairing is what makes a two-point tolerance meaningful at this sample size: the
 * comparison is paired, not two independent draws.
 */
function sport(corners: readonly Corner[]): SportProfile {
  const totals = { ko: 0, submission: 0, decision: 0, meanRound: 0 };
  let pairs = 0;

  for (let i = 0; i < corners.length; i++) {
    const red = corners[i]!;
    const blue = corners[(i + 1) % corners.length]!;
    const summary: MatchupSummary = runMatchup(red.fighter, blue.fighter, {
      fights: FIGHTS_PER_PAIR,
      redPlan: red.plan,
      bluePlan: blue.plan,
      seedPrefix: `neutrality:${i}`,
    });
    totals.ko += summary.koRate;
    totals.submission += summary.submissionRate;
    totals.decision += summary.decisionRate;
    totals.meanRound += summary.meanRound;
    pairs++;
  }

  return {
    ko: totals.ko / pairs,
    submission: totals.submission / pairs,
    decision: totals.decision / pairs,
    meanRound: totals.meanRound / pairs,
  };
}

/**
 * The neutrality assertion itself.
 *
 * Tolerances are two points on each method share and a tenth of a round on length. That is wider
 * than the paired sampling noise and far narrower than any of the four defects this file exists
 * for: `ENTRY_EASE` at a mean of 0.84 moved the roster's knockout rate by eight points, and
 * `BASE_INTENT` moved it by eight as well.
 */
function expectSameSport(varied: SportProfile, flat: SportProfile, what: string): void {
  const message = `${what}: varied ${describeSport(varied)} | flat ${describeSport(flat)}`;
  expect(Math.abs(varied.ko - flat.ko), message).toBeLessThan(0.02);
  expect(Math.abs(varied.submission - flat.submission), message).toBeLessThan(0.02);
  expect(Math.abs(varied.decision - flat.decision), message).toBeLessThan(0.02);
  expect(Math.abs(varied.meanRound - flat.meanRound), message).toBeLessThan(0.1);
}

const withStance = (f: Fighter, stance: Fighter['stance']): Fighter => ({ ...f, stance });
const withReach = (f: Fighter, reachInches: number): Fighter => ({ ...f, reachInches });

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.85, ...t },
});

const STATES: readonly PreferredState[] = ['outside', 'boxing', 'pocket', 'clinch', 'top', 'submission'];
const STRIKING: readonly PreferredState[] = ['outside', 'boxing', 'pocket'];
const GRAPPLING: readonly PreferredState[] = ['clinch', 'top', 'submission'];

describe('a modifier that shapes matchups does not move the sport', () => {
  /*
   * Each case is a pair of populations differing in exactly one input, and each gets both halves
   * of the rule asserted: the modifier does something between two fighters, and it does nothing
   * to the sport those fighters make up.
   */

  it('stance decides who wins without deciding how fights end', () => {
    /*
     * The claim `stance.ts` has always made in prose — "it cannot move the population's outcome
     * distribution, whatever the value, so it decides *who* wins rather than how fights end" —
     * and which was the stated justification for it being safe to tune. It had never been
     * asserted, and it was tuned twice.
     */
    const varied = POOL.map((make, i) => ({
      fighter: withStance(make(), i % 3 === 0 ? 'southpaw' : i % 3 === 1 ? 'switch' : 'orthodox'),
    }));
    const flat = POOL.map((make) => ({ fighter: withStance(make(), 'orthodox') }));

    /*
     * Differentiation asserted on the modifier rather than on a win rate, deliberately.
     *
     * `stance.test.ts` owns the *magnitude* — 1.36 / 1.52 / 1.61 points at 2,500 / 6,000 / 12,000
     * paired fights — and it costs six thousand fights to state that with a straight face. A cheap
     * copy of it here reads anywhere between −0.32 and +0.48 depending on the seed, which is not a
     * weaker version of the same claim, it is a coin flip wearing its clothes.
     *
     * What this half of the rule actually needs to establish is that the modifier is not inert,
     * and that is a property of the function. Asserting it here means the neutrality half below
     * can never pass by the modifier having quietly stopped doing anything.
     */
    const combatant = (f: Fighter) => createCombatant('red', f, defaultGamePlan());
    const edge = (mover: Fighter['stance'], holder: Fighter['stance']) =>
      stanceEdge(combatant(withStance(ARCHETYPES.striker(), mover)), combatant(withStance(ARCHETYPES.grinder(), holder)));

    expect(edge('southpaw', 'orthodox')).toBeGreaterThan(1);
    // And in none of the three directions that are not the open-stance matchup.
    expect(edge('orthodox', 'orthodox')).toBe(1);
    expect(edge('orthodox', 'southpaw')).toBe(1);
    expect(edge('southpaw', 'switch')).toBe(1);

    expectSameSport(sport(varied), sport(flat), 'stance');
  });

  it('reach decides who controls the range without making the sport more violent', () => {
    /*
     * Reach is the modifier most likely to fail this test, because it is the one that reaches
     * furthest into the engine: it tilts `rangeChangeChance`, which decides where the fight
     * happens, which decides which weapons are available, which decides the hazard each shot
     * carries. A level hiding in `reachLeverage` would look exactly like the sport getting more
     * knockout-heavy for no reason — and being capped at ±12% is what stops it, not luck.
     */
    const varied = POOL.map((make, i) => ({ fighter: withReach(make(), 72 + (i % 2 === 0 ? 4 : -4)) }));
    const flat = POOL.map((make) => ({ fighter: withReach(make(), 72) }));

    /*
     * Differentiation measured on **where the fight happened**, not on who won it.
     *
     * Both are downstream of `reachLeverage`, and only one of them is measurable. Reach is capped
     * at ±12% on a single contest by design, so the win rate it buys across a six-inch difference
     * ran +0.67 to +1.22 points over eight independent seed sets at 4,000 fights each and −0.08 to
     * +1.58 at 1,200 — an effect that needs four thousand fights to have a sign. The share of
     * standing time spent at kicking range, which is the thing reach actually acts on, ran +2.35
     * to +3.14 points over the same eight seed sets at 900 fights and never once came out
     * negative.
     *
     * Measuring the mechanism instead of its consequence is cheaper *and* stricter, and it is what
     * `tactics.test.ts` means when it says positional axes are far tighter than win rate.
     */
    const opponent = withReach(ARCHETYPES.grinder(), 72);
    const outside = plan({ preferredState: 'outside', entry: 'movement' });
    const pocket = plan({ preferredState: 'pocket', entry: 'pressure' });
    const outsideShareAt = (inches: number) => {
      const seconds = { outside: 0, boxing: 0, pocket: 0 };
      let distance = 0;
      for (let i = 0; i < 900; i++) {
        const r = simulateFight({
          boutId: `neutrality:reach:${i}`,
          red: { fighter: withReach(ARCHETYPES.striker(), inches), plan: outside },
          blue: { fighter: opponent, plan: pocket },
          rounds: 3,
          seed: `neutrality:reach:${i}`,
        });
        for (const k of RANGES) seconds[k] += r.stats.red.rangeSeconds[k];
        distance += r.stats.red.distanceSeconds;
      }
      return seconds.outside / Math.max(1, distance);
    };
    const long = outsideShareAt(78);
    const short = outsideShareAt(66);
    expect(
      long - short,
      `78in holds it outside ${(long * 100).toFixed(1)}% against 66in ${(short * 100).toFixed(1)}%`,
    ).toBeGreaterThan(0.015);

    expectSameSport(sport(varied), sport(flat), 'reach');
  });

  it('applies nothing at all when nobody means it', () => {
    /*
     * **The assertion `BASE_INTENT` would have failed, and the tables could never have caught it.**
     * It was not indexed by anything — it was a 1.25× striking bias folded into the engine on
     * behalf of a default plan that no longer existed, applied whether or not the fighter meant
     * anything by it. It moved the roster's first-round finish rate by eight points while looking,
     * in the diff, like tidying up.
     *
     * `tactics.ts` states the invariant in prose: *"`adaptive` with conviction 0 makes every term
     * in `policy.ts` exactly 1.0."* Exactly is the word that matters, and it holds — the two
     * populations below do not merely agree within tolerance, they produce identical numbers,
     * because they are running identical arithmetic. Any bias that survives zero conviction is by
     * definition a bias nobody asked for.
     */
    const planned = POOL.map((make) => ({
      fighter: make(),
      plan: plan({ preferredState: 'adaptive', conviction: 0 }),
    }));
    const unplanned = POOL.map((make) => ({ fighter: make() }));

    const a = sport(planned);
    const b = sport(unplanned);
    const message = `planned ${describeSport(a)} | unplanned ${describeSport(b)}`;
    expect(a.ko, message).toBeCloseTo(b.ko, 6);
    expect(a.submission, message).toBeCloseTo(b.submission, 6);
    expect(a.decision, message).toBeCloseTo(b.decision, 6);
    expect(a.meanRound, message).toBeCloseTo(b.meanRound, 6);
  });

  it('leaks only the range floor when a preference is stated but not meant', () => {
    /*
     * The one deliberate exception, bounded so it stays deliberate.
     *
     * `rangeUrgency` has a floor of 0.3 that no amount of indifference removes, because managing
     * distance is a property of fighting rather than of planning — a fighter with no plan still
     * has feet, and without the floor two thirds of unplanned fights sat at kicking range for
     * fifteen minutes with no range event in them at all.
     *
     * The cost of that decision is measurable and this is the measurement, over eight independent
     * seed sets: the population that states a preference at zero conviction comes out **+0.5 to
     * +3.2 points** more knockout-heavy than the one that states none, and never comes out less.
     * Everything else stays inside the shared tolerance — submissions within ±2.0 points,
     * decisions within 2.3, length within 0.07 of a round.
     *
     * A first cut of this bound read the default seed alone, measured 1.4 points, and asserted
     * two. It failed on four seed sets in five, which is the same defect the promotion-costs and
     * debutant-placement assertions were rewritten for: a bound fitted to one draw is not a claim
     * about the engine, it is a recording of a coincidence.
     *
     * The knockout bound is therefore its own number with its own reason. If it starts failing,
     * something *other* than the floor has learned to apply itself to a fighter who does not mean
     * it — and that is exactly the class of defect this file exists to catch.
     */
    const statedPopulation = POOL.map((make, i) => ({
      fighter: make(),
      plan: plan({ preferredState: STATES[i % STATES.length]!, conviction: 0 }),
    }));
    const silentPopulation = POOL.map((make) => ({ fighter: make() }));

    const stated = sport(statedPopulation);
    const silent = sport(silentPopulation);
    const message = `stated ${describeSport(stated)} | silent ${describeSport(silent)}`;

    expect(stated.ko - silent.ko, message).toBeLessThan(0.045);
    expect(stated.ko - silent.ko, message).toBeGreaterThan(-0.01);
    expect(Math.abs(stated.submission - silent.submission), message).toBeLessThan(0.03);
    expect(Math.abs(stated.decision - silent.decision), message).toBeLessThan(0.035);
    expect(Math.abs(stated.meanRound - silent.meanRound), message).toBeLessThan(0.1);
  });

  it('is a shape across the plan space rather than a level on top of it', () => {
    /*
     * The differentiation half, and the reason it is phrased as a *shape* rather than as "plans
     * do something".
     *
     * A world told to strike and a world told to grapple must move away from the unplanned
     * baseline in opposite directions and by comparable amounts. If both moved the same way, the
     * plan layer would be handing out a general bonus for having an opinion — which is precisely
     * what `BASE_INTENT` did, and what it looked like from the outside was every fighter in the
     * game becoming slightly more dangerous.
     *
     * Measured on finish rate, because that is the axis both directions actually share: knockouts
     * and submissions trade against each other between the two, and only their sum says whether
     * the sport got more decisive overall. Striking plans read +8.4 points against the unplanned
     * baseline and grappling plans −10.0, which is a see-saw. The bound asks each side to be at
     * least half the other, so a genuine asymmetry is allowed and a one-way push is not.
     */
    const finishRate = (p: SportProfile) => p.ko + p.submission;
    const baseline = finishRate(sport(POOL.map((make) => ({ fighter: make() }))));
    const striking = finishRate(
      sport(POOL.map((make, i) => ({ fighter: make(), plan: plan({ preferredState: STRIKING[i % STRIKING.length]! }) }))),
    );
    const grappling = finishRate(
      sport(POOL.map((make, i) => ({ fighter: make(), plan: plan({ preferredState: GRAPPLING[i % GRAPPLING.length]! }) }))),
    );

    const message =
      `unplanned ${(baseline * 100).toFixed(1)}% | striking ${(striking * 100).toFixed(1)}% | ` +
      `grappling ${(grappling * 100).toFixed(1)}%`;

    // Opposite directions, which is what makes it a shape.
    expect(striking, message).toBeGreaterThan(baseline);
    expect(grappling, message).toBeLessThan(baseline);

    /*
     * And both magnitudes real, which is what stops a see-saw from being a ramp with a dip in it.
     *
     * The bound was 0.5 and is now 0.2, because `D1` made the asymmetry a fact about the sport
     * rather than a defect in the test. Rebasing positional maintenance onto `groundControl` means
     * a plan whose top intent is `control` — which is the default, and which every grappling plan
     * here carries — now genuinely suppresses finishes: it is an instruction to hold somebody down
     * rather than to finish them, and it used to be capped by a bare constant. Grappling plans
     * therefore move further from the baseline than striking plans do.
     *
     * Measured before and after: striking +8.4 / grappling −10.0, ratio 0.84; now striking +4.2 /
     * grappling −14.7, ratio 0.29. What the assertion is defending is unchanged — a modifier that
     * pushes only one way is a level in a shape's clothes — and a one-way push still reads at or
     * below zero here, nowhere near 0.2.
     */
    const up = striking - baseline;
    const down = baseline - grappling;
    expect(Math.min(up, down) / Math.max(up, down), message).toBeGreaterThan(0.2);
  });
});
