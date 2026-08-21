/**
 * The two resolvers may disagree about how much. They may not disagree about which way.
 *
 * > **For any tactical instruction with a clearly directional mechanism, Full and Reduced must
 * > agree on the sign of its effect under controlled fighters.**
 *
 * That is docs/01 § 10, and until D10 the engine broke it in the place it mattered most. A grinder
 * told to take the fight to the floor got *less* control time at Reduced detail than the same
 * grinder told to stand and strike — 168 seconds a round against 152, where Full gave 137 against
 * 217. A world simulated at Reduced is where the player's opponents come from, so a resolver that
 * pays a wrestler for not asking for the floor builds careers under tactical incentives that do not
 * exist in the game the player is shown. Invariant 6 says Full is the reference; this is the sharp
 * edge of it.
 *
 * **Why the sign and not the size.** Reduced resolves a round at a time and gives up path, so it
 * will never reproduce Full's magnitudes and nothing needs it to — `reduced-fidelity.test.ts` is
 * where the quantitative tolerances live, and they are wide on purpose. What cannot be given up is
 * causality. A quantitative gap makes Reduced a coarser version of the same sport. A sign flip makes
 * it a different one.
 *
 * **Each claim carries its own fixture guard**, and that is not decoration. The first draft asserted
 * the stand-up instruction against a smotherer who was already pinned at the control ceiling, so
 * *Full's* own response was 0.09% and the sign it produced was a coin toss. A directional test whose
 * reference barely moves is testing the fixture. So every claim states the minimum response Full has
 * to show before its sign is allowed to mean anything, and fails loudly if the fixture goes flat.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  defaultGamePlan,
  defaultTactics,
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

const NEUTRAL = defaultGamePlan();
const FIGHTS = 500;

interface Sample {
  /** Seconds red spent in a controlling position, per round of fight. */
  controlPerRound: number;
  /** Seconds blue spent controlling red, per round. */
  opponentControlPerRound: number;
  /** Seconds red spent at distance, per round. */
  distancePerRound: number;
  submissionAttempts: number;
  strikesLandedPerMinute: number;
}

function sample(
  level: 'full' | 'reduced',
  label: string,
  red: Fighter,
  redPlan: GamePlan,
  blue: Fighter,
  bluePlan: GamePlan,
): Sample {
  const resolve = level === 'full' ? simulateFight : resolveFightByRound;
  let seconds = 0;
  let control = 0;
  let opponentControl = 0;
  let distance = 0;
  let submissions = 0;
  let landed = 0;

  for (let i = 0; i < FIGHTS; i++) {
    const r = resolve({
      boutId: `direction:${label}:${i}`,
      red: { fighter: red, plan: redPlan },
      blue: { fighter: blue, plan: bluePlan },
      rounds: 3,
      seed: `direction:${label}:${i}`,
    });
    seconds += (r.round - 1) * 300 + r.timeSeconds;
    control += r.stats.red.controlSeconds;
    opponentControl += r.stats.blue.controlSeconds;
    distance += r.stats.red.distanceSeconds;
    submissions += r.stats.red.submissionAttempts;
    landed += r.stats.red.significantStrikesLanded;
  }

  const rounds = seconds / 300;
  return {
    controlPerRound: control / rounds,
    opponentControlPerRound: opponentControl / rounds,
    distancePerRound: distance / rounds,
    submissionAttempts: submissions / FIGHTS,
    strikesLandedPerMinute: landed / (seconds / 60),
  };
}

interface Claim {
  /** What the instruction is, in a sentence somebody could argue with. */
  what: string;
  red: Fighter;
  blue: Fighter;
  bluePlan?: GamePlan;
  /** The two opposed instructions. The claim is about moving from `from` to `to`. */
  from: GamePlan;
  to: GamePlan;
  read: (s: Sample) => number;
  /** Which way it must move. */
  direction: 'up' | 'down';
  /**
   * How much Full has to move before its sign is evidence of anything. Guards the fixture, not the
   * engine — see the header.
   */
  fullMovesAtLeast: number;
}

const clone = () => makeFighter({ id: 'fighter_clone_red', lastName: 'Red' });
const cloneOpponent = makeFighter({ id: 'fighter_clone_blue', lastName: 'Blue' });

const GUARD_FOE = plan({
  preferredState: 'submission',
  entry: 'reactiveShot',
  topIntent: 'submit',
  bottomIntent: 'attack',
});
const TOP_FOE = plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control' });

const CLAIMS: readonly Claim[] = [
  {
    what: 'wanting the fight on the floor buys time on the floor',
    red: ARCHETYPES.grinder(),
    blue: ARCHETYPES.guardPlayer(),
    bluePlan: GUARD_FOE,
    from: plan({ preferredState: 'outside', entry: 'reactiveShot', topIntent: 'groundAndPound', bottomIntent: 'standUp' }),
    to: plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control', bottomIntent: 'scramble' }),
    read: (s) => s.controlPerRound,
    direction: 'up',
    fullMovesAtLeast: 0.2,
  },
  {
    what: 'and it buys it for a fighter with no particular talent for it too',
    red: clone(),
    blue: cloneOpponent,
    from: NEUTRAL,
    to: plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control' }),
    read: (s) => s.controlPerRound,
    direction: 'up',
    fullMovesAtLeast: 0.15,
  },
  {
    what: 'wanting the fight standing costs time on the floor',
    red: ARCHETYPES.grinder(),
    blue: ARCHETYPES.guardPlayer(),
    bluePlan: GUARD_FOE,
    from: NEUTRAL,
    to: plan({ preferredState: 'outside', entry: 'movement', topIntent: 'groundAndPound' }),
    read: (s) => s.controlPerRound,
    direction: 'down',
    fullMovesAtLeast: 0.15,
  },
  {
    what: 'being told to get up costs the man on top his control time',
    red: clone(),
    blue: ARCHETYPES.journeyman(),
    bluePlan: TOP_FOE,
    from: plan({ bottomIntent: 'playGuard', conviction: 1 }),
    to: plan({ bottomIntent: 'standUp', conviction: 1 }),
    read: (s) => s.opponentControlPerRound,
    direction: 'down',
    fullMovesAtLeast: 0.05,
  },
  {
    what: 'hunting submissions produces submission attempts',
    red: ARCHETYPES.guardPlayer(),
    blue: ARCHETYPES.smotherer(),
    bluePlan: TOP_FOE,
    from: plan({ preferredState: 'outside', topIntent: 'groundAndPound', bottomIntent: 'standUp' }),
    to: plan({ preferredState: 'submission', topIntent: 'submit', bottomIntent: 'attack' }),
    read: (s) => s.submissionAttempts,
    direction: 'up',
    fullMovesAtLeast: 0.5,
  },
  {
    what: 'pressing forward rather than moving costs time at distance',
    red: clone(),
    blue: cloneOpponent,
    from: plan({ preferredState: 'outside', entry: 'movement' }),
    to: plan({ preferredState: 'pocket', entry: 'pressure' }),
    read: (s) => s.distancePerRound,
    direction: 'down',
    fullMovesAtLeast: 0.1,
  },
  {
    what: 'riding for control rather than hitting costs striking volume',
    red: ARCHETYPES.grinder(),
    blue: ARCHETYPES.guardPlayer(),
    bluePlan: GUARD_FOE,
    from: plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'groundAndPound' }),
    to: plan({ preferredState: 'top', entry: 'proactiveWrestling', topIntent: 'control' }),
    read: (s) => s.strikesLandedPerMinute,
    direction: 'down',
    fullMovesAtLeast: 0.2,
  },
];

/**
 * How far Reduced is allowed to under-react before "looser" becomes "flat".
 *
 * A tenth of Full's relative response. That is not a magnitude bound — the measured ratios run from
 * 0.47 to 4.2, and both ends are fine — it is the line under which a sign is no longer a claim about
 * causality but about which way the sampling noise fell. `topIntent` reached Reduced through
 * submission attempts and nothing else before D10, and the resulting 0.5% wobble in striking volume
 * changed sign from salt to salt.
 */
const MIN_RELATIVE_RESPONSE = 0.1;

describe('Full and Reduced never disagree about which way an instruction points', () => {
  it.each(CLAIMS.map((c) => [c.what, c] as const))('%s', (_what, claim) => {
    const bluePlan = claim.bluePlan ?? NEUTRAL;
    const of = (level: 'full' | 'reduced', which: 'from' | 'to') =>
      claim.read(
        sample(level, `${_what}:${level}:${which}`, claim.red, claim[which], claim.blue, bluePlan),
      );

    const full = { from: of('full', 'from'), to: of('full', 'to') };
    const reduced = { from: of('reduced', 'from'), to: of('reduced', 'to') };
    const relative = (x: { from: number; to: number }) => (x.to - x.from) / Math.abs(x.from);
    const fullMove = relative(full);
    const reducedMove = relative(reduced);
    const message =
      `Full ${full.from.toFixed(2)} → ${full.to.toFixed(2)} (${(fullMove * 100).toFixed(1)}%) | ` +
      `Reduced ${reduced.from.toFixed(2)} → ${reduced.to.toFixed(2)} (${(reducedMove * 100).toFixed(1)}%)`;

    // The fixture guard: if the reference barely moved, its sign is not evidence.
    expect(Math.abs(fullMove), `fixture went flat at Full detail — ${message}`).toBeGreaterThan(
      claim.fullMovesAtLeast,
    );
    expect(Math.sign(fullMove), `Full moved the wrong way — ${message}`).toBe(
      claim.direction === 'up' ? 1 : -1,
    );

    // The invariant.
    expect(Math.sign(reducedMove), `Reduced disagrees on direction — ${message}`).toBe(
      Math.sign(fullMove),
    );
    expect(
      Math.abs(reducedMove) / Math.abs(fullMove),
      `Reduced is directionally right but effectively flat — ${message}`,
    ).toBeGreaterThan(MIN_RELATIVE_RESPONSE);
  });
});
