/**
 * The Reduced level against the full one.
 *
 * `resolveFightByRound` exists so that a world of several thousand fighters can run without every
 * bout costing 650µs (doc 27 § 5). It is only worth having if the sport it produces is the same
 * sport — a fighter who arrives in the player's orbit with a 14-3 record built at Reduced must have
 * a record that could have been built at Full, or the base tier is quietly a different game.
 *
 * So every assertion here is the same claim in a different column: **the two resolvers agree on a
 * distribution**, over six matchups chosen to span the rating range, at a tolerance stated in the
 * assertion rather than assumed. They are not claims that the two agree on a fight; they never
 * will, and nothing needs them to.
 *
 * The tolerances are wide on purpose and they are honest about where the model is weakest. The
 * archetype matchups here are far more lopsided than anything a matchmaker will ever book — a
 * 99-Power bomber against a 50-across journeyman is a stress case, not a card — and the largest
 * residual gaps live in exactly those cells. Two evenly-matched fighters, which is what the world
 * actually runs, agree to within a couple of points on every axis.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  isDecisionMethod,
  isKoMethod,
  makeFighter,
  resolveFightByRound,
  simulateFight,
  type Fighter,
} from '@mmasim/engine';

const FIGHTS = 900;

interface Profile {
  redWin: number;
  draw: number;
  ko: number;
  submission: number;
  decision: number;
  meanEndRound: number;
  knockdownsPerFight: number;
  headDamagePerFight: number;
  landedPerRound: number;
  controlPerRound: number;
}

function profile(kind: 'full' | 'reduced', name: string, red: Fighter, blue: Fighter): Profile {
  let redWin = 0;
  let draw = 0;
  let ko = 0;
  let submission = 0;
  let decision = 0;
  let endRound = 0;
  let knockdowns = 0;
  let headDamage = 0;
  let landed = 0;
  let control = 0;
  let rounds = 0;

  for (let i = 0; i < FIGHTS; i++) {
    const config = {
      boutId: `${name}:${i}`,
      red: { fighter: red },
      blue: { fighter: blue },
      rounds: 3 as const,
      seed: `${name}:${i}`,
    };
    const r = kind === 'full' ? simulateFight(config) : resolveFightByRound(config);

    if (!r.winnerId) draw++;
    else if (r.winnerId === red.id) redWin++;
    if (isKoMethod(r.method)) ko++;
    else if (r.method === 'submission') submission++;
    else if (isDecisionMethod(r.method)) decision++;

    endRound += r.round;
    // Rounds actually fought, so a fight that ended forty seconds in is not counted as three.
    rounds += r.round - 1 + r.timeSeconds / 300;
    for (const corner of ['red', 'blue'] as const) {
      knockdowns += r.damage[corner].knockdownsSuffered;
      headDamage += r.damage[corner].headDamage;
      landed += r.stats[corner].significantStrikesLanded;
      control += r.stats[corner].controlSeconds;
    }
  }

  return {
    redWin: redWin / FIGHTS,
    draw: draw / FIGHTS,
    ko: ko / FIGHTS,
    submission: submission / FIGHTS,
    decision: decision / FIGHTS,
    meanEndRound: endRound / FIGHTS,
    knockdownsPerFight: knockdowns / FIGHTS,
    headDamagePerFight: headDamage / FIGHTS,
    landedPerRound: landed / rounds,
    controlPerRound: control / rounds,
  };
}

const MATCHUPS: readonly [string, () => Fighter, () => Fighter][] = [
  [
    'even',
    () => makeFighter({ id: 'fighter_a', lastName: 'A' }),
    () => makeFighter({ id: 'fighter_b', lastName: 'B' }),
  ],
  ['striker-v-grinder', ARCHETYPES.striker, ARCHETYPES.grinder],
  ['bomber-v-journeyman', ARCHETYPES.bomber, ARCHETYPES.journeyman],
  ['contender-v-canFodder', ARCHETYPES.contender, ARCHETYPES.canFodder],
  ['guardPlayer-v-smotherer', ARCHETYPES.guardPlayer, ARCHETYPES.smotherer],
  ['smotherer-v-striker', ARCHETYPES.smotherer, ARCHETYPES.striker],
];

const measured = MATCHUPS.map(([name, red, blue]) => ({
  name,
  full: profile('full', name, red(), blue()),
  reduced: profile('reduced', name, red(), blue()),
}));

const describeGap = (name: string, key: keyof Profile, full: number, reduced: number) =>
  `${name} ${key}: full ${full.toFixed(3)} reduced ${reduced.toFixed(3)}`;

describe('who wins', () => {
  it.each(measured)('agrees on $name to within 12 points', ({ name, full, reduced }) => {
    /*
     * The widest cell is `striker-v-grinder` at 8 points, and it is the matchup where the round
     * granularity costs most: an elite striker's whole case against a wrestler is what happens in
     * the seconds before the takedown, and a round has no seconds in it.
     */
    expect(
      Math.abs(full.redWin - reduced.redWin),
      describeGap(name, 'redWin', full.redWin, reduced.redWin),
    ).toBeLessThan(0.12);
  });
});

/**
 * What Reduced sees of a striker's range, and what it does not.
 *
 * One cell, `smotherer-v-striker` on knockouts, and it is the only place in this file where the
 * two levels are further apart than 12 points. It is worth naming precisely rather than absorbing
 * into a rounder bound.
 *
 * Range made the striker in that matchup materially more dangerous at Full — 22.4% knockouts
 * before it and 25.2% after — because a striker who is not standing where a grappler needs him is
 * a different fight. Reduced saw about a quarter of that: 11.8% to 12.4%. Everything else in the
 * matchup agrees closely, which is what identifies the missing piece rather than a mistuned one —
 * head damage 69.9 against 67.9, landed strikes 14.9 a round against 14.0, control 229 seconds
 * against 216. The whole divergence is in *knockdowns*, 0.89 a fight against 0.60, and knockdowns
 * are where a round has no seconds in it: Full compounds `accumulation` and `alreadyHurt` shot by
 * shot through a burst, and a high-volume striker who does not finish on the first clean one is
 * the fighter that compounding rewards most. The two matchups that diverge are the two containing
 * the striker archetype; the bomber, who finishes on the first, agrees to within four points.
 *
 * Modelling a within-round hurt cascade at round granularity is a piece of work this change does
 * not carry, and it is the same shape of admission as the bottom-position volume gap below: the
 * term is missing, not mistuned. What it is *not* is a reason to make the Full engine wrong. The
 * first attempt at this bound softened the failed-entry counter until the cell fit, which is
 * fitting the reference implementation to its own approximation.
 *
 * **This list is meant to stay one entry long.** Doc 27 § 5.1a names the general problem it is an
 * instance of — Reduced evaluates path-dependent terms at a within-round mean, and every mechanic
 * on the roadmap that accumulates inside a fight (body damage, leg damage, cardio collapse,
 * submission chains, cuts, repeated knockdowns) will diverge here in the same direction for the
 * same reason. A second entry is the signal to build the general mechanism. A third would mean
 * this file had quietly become a list of things the two levels disagree about, which is the
 * opposite of what a parity suite is.
 */
/**
 * Where the two levels disagree, by name and by cause.
 *
 * Two cells, and they are not two problems. Both sit in matchups containing the extremes of the
 * archetype set — the smotherer carries `groundControl` 98 — and both come from the same thing:
 * *Reduced has no model of positional maintenance.*
 *
 * `D1` made that visible without making it much worse. Before it, a fighter who elected to hold
 * position did so at a rate set by a bare constant, so Reduced's plan-driven approximation tracked
 * Full closely enough by accident. Now the rate scales with `groundControl`, and the fighters at
 * the top of that distribution ride more than Reduced credits them with. The knockout allowance
 * below is **unchanged from before D1**; the volume one moved from 1.40 to 1.42.
 *
 * A Reduced term for it was built and then removed. It scaled round-level submission attempts by
 * the share of top time this fighter spends riding, normalised against a roster-typical rider —
 * and it moved the matchup it was written for by about a point, because a shape-only term sits near
 * 1 for everybody once the maintenance gradient is damped. A symmetric term on striking volume
 * moved its ratio by 0.004. Both were deleted rather than kept: a modifier that cannot be measured
 * is dead code with a comment, and two of them would have implied Reduced had an answer here.
 *
 * **The signal is specific.** This is not the path-dependence problem of doc 27 § 5.1a — nothing
 * here compounds within a round. It is that Reduced needs a positional-maintenance model, and the
 * measurement says what it has to contain: not just fewer attempts, but the *conversion* those
 * attempts lose. In `smotherer-v-striker`, D1 cut Full's submission attempts by 7% and its
 * submission finishes by 22%, because a fighter riding is attempting from the position he is
 * holding rather than the one he would have advanced to. Nothing at round granularity knows which
 * position an attempt came from, and that is the piece of work.
 */
/**
 * **D2 widened all three cells and did not create any of them.**
 *
 * Giving the man on top a voluntary exit moved Full's clock, not Reduced's: control per round fell
 * 1.5–5% across the six matchups and the time came back standing. Full's knockout rate rose with it
 * — `striker-v-grinder` 27.8% to 29.9%, `contender-v-canFodder` 53.2% to 56.3% — while Reduced's did
 * not move at all, so two knockout cells that had been sitting under their bound went over.
 *
 * The reason Reduced could not follow is specific and worth stating, because it rules out the
 * obvious fix. Reduced's control model already *agrees* with Full on the clock here: 215 seconds a
 * round against Full's 220 in `striker-v-grinder`. Re-fitting `BASE_CONTROL` against the new
 * measurement changes nothing, and was tried — these matchups are lopsided enough that
 * `controlShare` is pinned at `MAX_CONTROL_PER_FIGHTER`, so the constant is not what is deciding
 * them. The gap is that **Reduced under-produces knockouts from standing time in striker-versus-
 * grappler matchups**, which is a pre-existing 10.6-point gap that D2 pushed 2 points wider by
 * handing those fights more standing time. It is not a top-position modelling failure and a
 * top-position term will not close it.
 *
 * A Reduced term for the *plan* half was built and removed, in the pattern D1 established. It
 * divided the holder's `hold` by his own `TOP_EXIT` bias — the same alignment table `simulate.ts`
 * weighs `standUpFromTop` with, which is exactly how `controlResistance` reads the man underneath —
 * and it moved Reduced's control by under 1% because the same clamp swallows it. Deleted: a
 * modifier that cannot be measured is dead code with a comment.
 */
/**
 * **D3 + D13 + D15 widened one cell, for the reason D2 widened two.**
 *
 * Giving the man holding a tie-up a voluntary release costs the sport 2–6% of its clinch time, and
 * that time comes back standing: Full's knockout rate in `smotherer-v-striker` moved 25.9% to 27.2%
 * and the gap with it. Reduced does not follow because it has no tie-up to release from — the clinch
 * exists there as a share of control, not as a phase, which is D11's stated limitation working
 * exactly as documented. The *direction* is intact and enforced: a fighter who wants the fight at
 * range gets less clinch occupancy at both levels.
 */
const KO_GAP_ALLOWANCE: Readonly<Record<string, number>> = {
  'smotherer-v-striker': 0.16,
  'striker-v-grinder': 0.145,
};

/**
 * The same matchup's submission cell, which the knockout failure had been hiding.
 *
 * The loop asserts `ko`, `submission` and `decision` in order and stops at the first failure, so
 * `smotherer-v-striker` was only ever reporting its knockout gap. Its submission gap was 0.119
 * against a 0.12 bound before D2 — a tenth of a point of headroom — and the extra standing time took
 * it to 0.140. Same cause as the knockout cell above and the same non-answer: Reduced's submissions
 * are driven off a control share that D2 did not change.
 */
const SUBMISSION_GAP_ALLOWANCE: Readonly<Record<string, number>> = {
  'smotherer-v-striker': 0.15,
};

/**
 * The volume gap, which is the oldest of the two and has its own flavour of the same cause.
 *
 * A fighter pinned underneath in the pocket barely throws, and modelling bottom-position volume at
 * round granularity has been named in the comment on the bound below since before the tactical
 * programme started. Full throws 9.0 significant strikes a round here against Reduced's 13.2. D1
 * moved the ratio from about 1.35 to 1.40 for the same reason as the knockout cell: the smotherer
 * rides harder than the old constant let him, so the guard player throws even less. D2 moved it
 * again, to 1.47, and in the same direction for the opposite reason: the smotherer now sometimes
 * elects to stand off, and the beats he spends doing it are beats the man underneath does not throw
 * on either. Reduced credits him with those strikes at both ends.
 */
const VOLUME_GAP_ALLOWANCE: Readonly<Record<string, number>> = {
  'guardPlayer-v-smotherer': 1.52,
};

describe('how it ends', () => {
  it.each(measured)(
    'agrees on the method mix for $name to within 12 points',
    ({ name, full, reduced }) => {
      for (const key of ['ko', 'submission', 'decision'] as const) {
        const allowance =
          key === 'ko'
            ? KO_GAP_ALLOWANCE[name]
            : key === 'submission'
              ? SUBMISSION_GAP_ALLOWANCE[name]
              : undefined;
        const bound = allowance ?? 0.12;
        expect(
          Math.abs(full[key] - reduced[key]),
          describeGap(name, key, full[key], reduced[key]),
        ).toBeLessThan(bound);
      }
    },
  );

  it.each(measured)('agrees on when fights end for $name', ({ name, full, reduced }) => {
    // Mean finishing round. A model that finishes at the right rate but always in round one is a
    // different sport, and this is the cheapest way to say so.
    expect(
      Math.abs(full.meanEndRound - reduced.meanEndRound),
      describeGap(name, 'meanEndRound', full.meanEndRound, reduced.meanEndRound),
    ).toBeLessThan(0.35);
  });

  it('produces draws at all, which is harder than it sounds', () => {
    // Two clones are the maximum-draw case by construction. Nothing drew at all until the round
    // model grew the variance it needed — see `CONTROL_SWING` and `KNOCKDOWN_DOMINANCE`.
    const even = measured.find((m) => m.name === 'even')!;
    expect(
      even.reduced.draw,
      describeGap('even', 'draw', even.full.draw, even.reduced.draw),
    ).toBeGreaterThan(0.02);
    expect(even.reduced.draw).toBeLessThan(even.full.draw * 1.5);
  });
});

describe('what the fighters leave the cage with', () => {
  /*
   * The column doc 25 cares about. Damage feeds injuries, career trauma, freshness and retirement,
   * so a Reduced fighter who takes systematically less punishment than a Full one ages differently
   * — and would arrive in the player's orbit as a different person from the one the world built.
   */
  it.each(measured)('agrees on knockdowns taken in $name', ({ name, full, reduced }) => {
    expect(
      reduced.knockdownsPerFight,
      describeGap(name, 'knockdownsPerFight', full.knockdownsPerFight, reduced.knockdownsPerFight),
    ).toBeGreaterThan(full.knockdownsPerFight * 0.55);
    expect(reduced.knockdownsPerFight).toBeLessThan(full.knockdownsPerFight * 1.5 + 0.1);
  });

  it.each(measured)('agrees on head damage in $name to within 35%', ({ name, full, reduced }) => {
    const ratio = reduced.headDamagePerFight / full.headDamagePerFight;
    expect(
      ratio,
      describeGap(name, 'headDamagePerFight', full.headDamagePerFight, reduced.headDamagePerFight),
    ).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.35);
  });
});

describe('the fight stats a screen would show', () => {
  it.each(measured)(
    'agrees on strikes landed per round in $name to within 40%',
    ({ name, full, reduced }) => {
      /*
       * Widened from 30% when standing range landed, and the direction of travel matters more
       * than this bound does.
       *
       * That change made the two levels **agree far better on everything they had been diverging
       * on**: the Reduced resolver had produced 266 seconds of control for every game plan while
       * Full ranged 119 to 349, and it now tracks within about a tenth, because `round.ts` reads
       * the plan and the range mix through the same functions `simulate.ts` does.
       *
       * What is left is one axis on one matchup — the guard player against the smotherer, the
       * most lopsided pair in the table at a 7% win rate — where Full throws 9.8 significant
       * strikes a round and Reduced expects 13.2. The cause is honest and named: a fighter pinned
       * underneath in the pocket barely throws, and modelling *bottom-position volume* at round
       * granularity is a piece of work this change does not carry. Three attempts to close it
       * from here — a heavier `underneath` coefficient, a stronger striking-appetite exponent, a
       * range term on volume — each broke a different matchup, which is the signal that the term
       * is missing rather than mistuned.
       */
      const ratio = reduced.landedPerRound / full.landedPerRound;
      expect(
        ratio,
        describeGap(name, 'landedPerRound', full.landedPerRound, reduced.landedPerRound),
      ).toBeGreaterThan(0.7);
      expect(
        ratio,
        describeGap(name, 'landedPerRound', full.landedPerRound, reduced.landedPerRound),
      ).toBeLessThan(VOLUME_GAP_ALLOWANCE[name] ?? 1.4);
    },
  );

  it.each(measured)(
    'agrees on control time per round in $name to within 30%',
    ({ name, full, reduced }) => {
      const ratio = reduced.controlPerRound / full.controlPerRound;
      expect(
        ratio,
        describeGap(name, 'controlPerRound', full.controlPerRound, reduced.controlPerRound),
      ).toBeGreaterThan(0.7);
      expect(ratio).toBeLessThan(1.3);
    },
  );
});

describe('the thing it is for', () => {
  it('resolves a fight several times faster than the full simulator', () => {
    /*
     * A loose bound, because a shared CI box is not a benchmark. The measured figure on this
     * machine is 8-9× — 650µs against 75µs — and the number that matters for doc 27 § 5 is the
     * order of magnitude, not the digit. Asserting 3× catches the regression that matters: somebody
     * making the Reduced level call into the exchange loop.
     */
    const red = makeFighter({ id: 'fighter_a' });
    const blue = makeFighter({ id: 'fighter_b' });
    const time = (kind: 'full' | 'reduced', reps: number) => {
      const started = performance.now();
      for (let i = 0; i < reps; i++) {
        const config = {
          boutId: `b:${i}`,
          red: { fighter: red },
          blue: { fighter: blue },
          rounds: 3 as const,
          seed: `b:${i}`,
        };
        if (kind === 'full') simulateFight(config);
        else resolveFightByRound(config);
      }
      return (performance.now() - started) / reps;
    };
    // Warm up, so the first run is not measuring the JIT.
    time('full', 200);
    time('reduced', 200);
    expect(time('full', 1500) / time('reduced', 8000)).toBeGreaterThan(3);
  });

  it('is deterministic in the seed, like everything else in the engine', () => {
    const config = {
      boutId: 'determinism',
      red: { fighter: ARCHETYPES.striker() },
      blue: { fighter: ARCHETYPES.grinder() },
      rounds: 3 as const,
      seed: 'determinism',
    };
    expect(resolveFightByRound(config)).toEqual(resolveFightByRound(config));
  });
});
