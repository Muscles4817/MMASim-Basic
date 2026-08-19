/**
 * **Does the game plan produce a different fight?**
 *
 * Every other statistical file here measures whether the *fighters* differ. This one holds the
 * fighters fixed and the seeds fixed and changes only the plan, because that is the claim the
 * tactical layer makes and the one the old model failed silently:
 *
 * > Measured before the rework, an 84-striking / 38-wrestling fighter across from a wrestler
 * > spent 138 seconds of a 900-second fight at distance — and all seven `approach` values moved
 * > that number between **133 and 143**. The plan was a rounding error.
 *
 * The failure mode that made that possible is the reason this file exists at all. When every
 * plan settles on the same positional distribution, you cannot tell **"the plan failed"** from
 * **"the plan did not matter"** — and those are the two most different things a fight simulator
 * can be doing. Every assertion below is a *ratio between two plans*, never an absolute, so it
 * survives rebalancing and still catches the regression.
 *
 * Paired seeds throughout: both runs of a comparison use the same bout ids and the same opponent,
 * so the only difference between them is the instruction.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultGamePlan,
  defaultTactics,
  isKoMethod,
  makeFighter,
  simulateFight,
  type Fighter,
  type FightConfig,
  type GamePlan,
  type TacticalPlan,
} from '@mmasim/engine';

/**
 * Big, and it has to be.
 *
 * The positional axes below — time at distance, seconds underneath, takedown attempts — are far
 * tighter than win rate, but a first cut of a sibling file ran 400 fights and read the same
 * comparison as +3.6 points on one seed prefix and −1.2 on another. Anything asserted on a
 * *rate* needs the count; anything asserted on a *share of the clock* would be fine at a
 * quarter of it.
 */
const FIGHTS = 1200;

/** Well-rounded on purpose: the plan has to be what makes these fights differ, not the ratings. */
const balanced = (id: string, overrides: Partial<Fighter['attributes']> = {}): Fighter =>
  makeFighter({
    id,
    lastName: id,
    attributes: {
      strikingOffence: 70,
      kicking: 68,
      strikingDefence: 70,
      power: 68,
      speed: 68,
      wrestling: 70,
      takedownDefence: 68,
      groundControl: 70,
      submissions: 68,
      scrambling: 68,
      cardio: 72,
      strength: 68,
      durability: 70,
      fightIq: 70,
      composure: 70,
      ...overrides,
    },
  });

const red = balanced('fighter_red');
const blue = balanced('fighter_blue');

/** The fighter from the complaint: a real striker with a real hole. */
const striker = makeFighter({
  id: 'fighter_striker',
  lastName: 'Striker',
  attributes: {
    strikingOffence: 84,
    kicking: 80,
    strikingDefence: 78,
    power: 80,
    speed: 78,
    wrestling: 38,
    takedownDefence: 44,
    groundControl: 35,
    submissions: 32,
    scrambling: 40,
    cardio: 70,
    strength: 60,
    durability: 70,
    fightIq: 70,
    composure: 70,
  },
});

const wrestler = makeFighter({
  id: 'fighter_wrestler',
  lastName: 'Wrestler',
  attributes: {
    strikingOffence: 58,
    kicking: 50,
    strikingDefence: 60,
    power: 60,
    speed: 62,
    wrestling: 84,
    takedownDefence: 80,
    groundControl: 82,
    submissions: 60,
    scrambling: 72,
    cardio: 76,
    strength: 74,
    durability: 72,
    fightIq: 68,
    composure: 68,
  },
});

function planWith(tactics: Partial<TacticalPlan>): GamePlan {
  return {
    ...defaultGamePlan(),
    tactics: { ...defaultTactics(), conviction: 0.85, ...tactics },
  };
}

interface Profile {
  winRate: number;
  distanceSeconds: number;
  clinchSeconds: number;
  topSeconds: number;
  bottomSeconds: number;
  takedownsAttempted: number;
  takedownsLanded: number;
  submissionAttempts: number;
  significantStrikes: number;
  kickShare: number;
  finishRate: number;
}

/**
 * One plan against one opponent, averaged.
 *
 * `bottomSeconds` is the opponent's ground control time — seconds this fighter spent underneath —
 * and it is the single most load-bearing number in the file, because "he got taken down and then
 * stayed there hunting a guillotine" is what the whole layer was built to stop.
 */
function profile(fighter: Fighter, opponent: Fighter, plan: GamePlan, foePlan: GamePlan): Profile {
  const t = {
    wins: 0,
    distance: 0,
    clinch: 0,
    top: 0,
    bottom: 0,
    tdAttempted: 0,
    tdLanded: 0,
    subs: 0,
    strikes: 0,
    kicks: 0,
    finishes: 0,
  };

  for (let i = 0; i < FIGHTS; i++) {
    const config: FightConfig = {
      boutId: `tactics:${i}`,
      red: { fighter, plan },
      blue: { fighter: opponent, plan: foePlan },
      rounds: 3,
      seed: `tactics:${i}`,
    };
    const r = simulateFight(config);
    const mine = r.stats.red;
    const theirs = r.stats.blue;
    if (r.winnerId === fighter.id) t.wins++;
    if (isKoMethod(r.method) || r.method === 'submission') t.finishes++;
    t.distance += mine.distanceSeconds;
    t.clinch += mine.clinchControlSeconds + theirs.clinchControlSeconds;
    t.top += mine.controlSeconds - mine.clinchControlSeconds;
    t.bottom += theirs.controlSeconds - theirs.clinchControlSeconds;
    t.tdAttempted += mine.takedownsAttempted;
    t.tdLanded += mine.takedownsLanded;
    t.subs += mine.submissionAttempts;
    t.strikes += mine.significantStrikesLanded;
    t.kicks += mine.strikesByWeapon.kick;
  }

  const n = FIGHTS;
  return {
    winRate: t.wins / n,
    distanceSeconds: t.distance / n,
    clinchSeconds: t.clinch / n,
    topSeconds: t.top / n,
    bottomSeconds: t.bottom / n,
    takedownsAttempted: t.tdAttempted / n,
    takedownsLanded: t.tdLanded / n,
    submissionAttempts: t.subs / n,
    significantStrikes: t.strikes / n,
    kickShare: t.kicks / Math.max(1, t.strikes),
    finishRate: t.finishes / n,
  };
}

const describeProfile = (p: Profile) =>
  `distance=${p.distanceSeconds.toFixed(0)}s clinch=${p.clinchSeconds.toFixed(0)}s ` +
  `top=${p.topSeconds.toFixed(0)}s bottom=${p.bottomSeconds.toFixed(0)}s ` +
  `tdAtt=${p.takedownsAttempted.toFixed(2)} subAtt=${p.submissionAttempts.toFixed(2)} ` +
  `sig=${p.significantStrikes.toFixed(1)} kickShare=${p.kickShare.toFixed(2)} ` +
  `win=${(p.winRate * 100).toFixed(1)}%`;

/** Both corners neutral, so the opponent is never the thing that changed. */
const neutralPlan = defaultGamePlan();

const forRed = (tactics: Partial<TacticalPlan>) =>
  profile(red, blue, planWith(tactics), neutralPlan);

describe('the plan decides where the fight happens', () => {
  it('separates the two standing plans from the two grappling ones', () => {
    /*
     * The headline claim, and the one the old model could not make on any axis at all.
     *
     * Identical fighters — 70 across, no hole to exploit — so nothing but the instruction can
     * produce the difference. If this ever collapses, the tactical layer has stopped exerting
     * force on the engine and every plan is producing the same fight again.
     */
    const outside = forRed({ preferredState: 'longRange', entry: 'movement' });
    const wrestle = forRed({
      preferredState: 'top',
      entry: 'proactiveWrestling',
      topIntent: 'control',
    });
    const message = `outside ${describeProfile(outside)} | wrestle ${describeProfile(wrestle)}`;

    expect(wrestle.takedownsAttempted, message).toBeGreaterThan(outside.takedownsAttempted * 2.5);
    expect(outside.distanceSeconds, message).toBeGreaterThan(wrestle.distanceSeconds * 1.3);
    expect(wrestle.topSeconds, message).toBeGreaterThan(outside.topSeconds * 1.5);
  });

  it('separates the clinch from both of them', () => {
    const clinch = forRed({ preferredState: 'clinch', entry: 'clinchEntries' });
    const outside = forRed({ preferredState: 'longRange', entry: 'movement' });
    const message = `clinch ${describeProfile(clinch)} | outside ${describeProfile(outside)}`;

    expect(clinch.clinchSeconds, message).toBeGreaterThan(outside.clinchSeconds * 2);
    expect(outside.distanceSeconds, message).toBeGreaterThan(clinch.distanceSeconds * 1.15);
  });

  it('tells the outside fighter from the pocket fighter', () => {
    /*
     * The pair `approach` could not express *at all*: it had one row for pressure and one for
     * counter, and no way to say whether either wanted to be at kicking range or in the phone
     * booth. Both were "standing", the engine had one standing position, and so a rangy kicker
     * and a pressure boxer were the same instruction.
     */
    const outside = forRed({ preferredState: 'longRange', entry: 'movement' });
    const pocket = forRed({ preferredState: 'pocket', entry: 'pressure' });
    const message = `outside ${describeProfile(outside)} | pocket ${describeProfile(pocket)}`;

    expect(outside.kickShare, message).toBeGreaterThan(pocket.kickShare * 1.4);
    expect(pocket.clinchSeconds, message).toBeGreaterThan(outside.clinchSeconds);
  });

  it('routes a grappler through the tie-up or through the shot, as instructed', () => {
    // `top` + `proactiveWrestling` and `top` + `clinchEntries` want the same fight and get there
    // two different ways — which is the distinction that made judo and wrestling produce
    // identical fingerprints when the plan had one axis (docs/19 §13.6).
    const shots = forRed({ preferredState: 'top', entry: 'proactiveWrestling' });
    const grips = forRed({ preferredState: 'top', entry: 'clinchEntries' });
    const message = `shots ${describeProfile(shots)} | grips ${describeProfile(grips)}`;

    expect(shots.takedownsAttempted, message).toBeGreaterThan(grips.takedownsAttempted * 1.2);
    expect(grips.clinchSeconds, message).toBeGreaterThan(shots.clinchSeconds * 1.5);
  });
});

describe('the plan decides what happens once it is there', () => {
  it('makes a controller and a hunter do different things from the same top position', () => {
    const control = forRed({
      preferredState: 'top',
      entry: 'proactiveWrestling',
      topIntent: 'control',
    });
    const submit = forRed({
      preferredState: 'top',
      entry: 'proactiveWrestling',
      topIntent: 'submit',
    });
    const message = `control ${describeProfile(control)} | submit ${describeProfile(submit)}`;

    expect(submit.submissionAttempts, message).toBeGreaterThan(control.submissionAttempts * 2);
    expect(control.topSeconds, message).toBeGreaterThan(submit.topSeconds);
  });

  it('makes a fighter told to get up get up, and one told to attack stay there', () => {
    /*
     * **The assertion this whole rework exists for.**
     *
     * Same fighter, same opponent, same seeds, underneath in both. One is told to stand up and
     * one to hunt from his back. Before the policy layer these produced the same fight, because
     * the three bottom actions were drawn from weights that happened to be close together and
     * nothing in the plan was in the room.
     */
    const standUp = forRed({ preferredState: 'longRange', bottomIntent: 'standUp' });
    const attack = forRed({ preferredState: 'submission', bottomIntent: 'attack' });
    const message = `standUp ${describeProfile(standUp)} | attack ${describeProfile(attack)}`;

    expect(attack.submissionAttempts, message).toBeGreaterThan(standUp.submissionAttempts * 2);
    expect(standUp.bottomSeconds, message).toBeLessThan(attack.bottomSeconds);
  });

  it('stops a striker hunting submissions he cannot finish', () => {
    /*
     * The complaint, stated as a test. A striker with 32 submissions, taken down by a wrestler,
     * told to get up: his submission attempts must be a small fraction of the same striker told
     * to play guard — and he must spend visibly less of the fight on his back for it.
     */
    const foePlan = planWith({
      preferredState: 'top',
      entry: 'proactiveWrestling',
      topIntent: 'control',
    });
    const getUp = profile(
      striker,
      wrestler,
      planWith({ preferredState: 'longRange', entry: 'counter', bottomIntent: 'standUp' }),
      foePlan,
    );
    const guard = profile(
      striker,
      wrestler,
      planWith({ preferredState: 'longRange', entry: 'counter', bottomIntent: 'playGuard' }),
      foePlan,
    );
    const message = `getUp ${describeProfile(getUp)} | guard ${describeProfile(guard)}`;

    expect(getUp.submissionAttempts, message).toBeLessThan(guard.submissionAttempts * 0.6);
    expect(getUp.bottomSeconds, message).toBeLessThan(guard.bottomSeconds * 0.9);
    expect(getUp.significantStrikes, message).toBeGreaterThan(guard.significantStrikes);
  });
});

describe('intent is not ability', () => {
  it('lets a plan fail loudly instead of being quietly ignored', () => {
    /*
     * The other half of the design, and the reason this file can tell a failed plan from an
     * irrelevant one: a fighter with no wrestling who is told to take the fight to the floor must
     * **visibly try and visibly fail**. Lots of attempts, few takedowns, and a worse night for it.
     *
     * If the engine were still quietly reverting him to generic MMA — the behaviour this rework
     * replaced — his attempt count would look like everybody else's and his win rate would be
     * unharmed, which is precisely the state that made the original complaint unfalsifiable.
     */
    const asked = profile(
      striker,
      wrestler,
      planWith({ preferredState: 'top', entry: 'proactiveWrestling' }),
      neutralPlan,
    );
    const sensible = profile(
      striker,
      wrestler,
      planWith({ preferredState: 'longRange', entry: 'counter', bottomIntent: 'standUp' }),
      neutralPlan,
    );
    const message = `asked ${describeProfile(asked)} | sensible ${describeProfile(sensible)}`;

    // He tries.
    expect(asked.takedownsAttempted, message).toBeGreaterThan(sensible.takedownsAttempted * 2);
    // He fails: his success rate is poor, so attempts buy far less than they cost.
    expect(asked.takedownsLanded / Math.max(0.01, asked.takedownsAttempted), message).toBeLessThan(
      0.45,
    );
    // And it costs him the fight he could have had.
    expect(asked.winRate, message).toBeLessThan(sensible.winRate - 0.04);
  });

  it('leaves an unplanned fight exactly as it was', () => {
    /*
     * The calibration guard. `adaptive` with conviction 0 makes every term in `policy.ts` exactly
     * 1.0, which is what lets the rest of the statistical tier keep its numbers: a fight nobody
     * planned must resolve precisely as it did before the tactical layer existed.
     */
    const unplanned = profile(red, blue, defaultGamePlan(), defaultGamePlan());
    const alsoUnplanned = profile(
      red,
      blue,
      planWith({ preferredState: 'adaptive', conviction: 0 }),
      defaultGamePlan(),
    );
    expect(alsoUnplanned.distanceSeconds).toBeCloseTo(unplanned.distanceSeconds, 5);
    expect(alsoUnplanned.takedownsAttempted).toBeCloseTo(unplanned.takedownsAttempted, 5);
    expect(alsoUnplanned.winRate).toBeCloseTo(unplanned.winRate, 5);
  });
});

describe('the fighter, not just the plan', () => {
  it('does not let a plan override who somebody is entirely', () => {
    /*
     * You cannot turn Gaethje into Maia by picking a button, and `planIntegrity` is why. Two
     * copies of the same fighter differing only in the personality that holds a plan together —
     * discipline and the composure to keep thinking while being hit — given the identical
     * instruction against an opponent built to make the night uncomfortable.
     *
     * The disciplined one should end up closer to what he was told.
     */
    const of = (discipline: number, composure: number) =>
      makeFighter({
        id: 'fighter_will',
        lastName: 'Will',
        attributes: { ...striker.attributes, composure },
        personality: { discipline },
      });

    const plan = planWith({
      preferredState: 'longRange',
      entry: 'movement',
      bottomIntent: 'standUp',
    });
    const disciplined = profile(of(85, 85), wrestler, plan, neutralPlan);
    const wild = profile(of(20, 25), wrestler, plan, neutralPlan);
    const message = `disciplined ${describeProfile(disciplined)} | wild ${describeProfile(wild)}`;

    // Same instruction, same ratings in everything the contests read. The disciplined fighter
    // holds the shape he was asked for; the wild one drifts back toward whatever the fight
    // turns into.
    expect(disciplined.distanceSeconds, message).toBeGreaterThan(wild.distanceSeconds);
  });
});
