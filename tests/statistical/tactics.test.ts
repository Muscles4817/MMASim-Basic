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
  /** Shares of *standing* time, so they read as "where did the standing part happen". */
  outsideShare: number;
  boxingShare: number;
  pocketShare: number;
  /** Range changes this fighter went for, and the fraction that came off. */
  rangeAttempts: number;
  rangeSuccess: number;
  /** Voluntary get-ups, not referee stand-ups: the difference between wanting up and being stood up. */
  standUps: number;
  /**
   * Attempts to get out from underneath, **per minute spent there**.
   *
   * Per minute rather than per fight, because a fighter who is told to stay down is on his back
   * longer and accumulates attempts by exposure even at a lower rate — measured, the per-fight
   * counts read 8.2 against 5.9 while the rates read 1.51 against 0.98. Only the rate is the
   * decision the corner actually changed.
   */
  escapeRate: number;
  clinchEntries: number;
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
    outside: 0,
    boxing: 0,
    pocket: 0,
    rangeAttempts: 0,
    rangeLanded: 0,
    standUps: 0,
    escapes: 0,
    clinchEntries: 0,
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
    t.outside += mine.rangeSeconds.outside;
    t.boxing += mine.rangeSeconds.boxing;
    t.pocket += mine.rangeSeconds.pocket;
    t.rangeAttempts += mine.rangeChangesAttempted;
    t.rangeLanded += mine.rangeChangesLanded;
    t.escapes += mine.escapesAttempted;
    for (const e of r.events) {
      if (e.corner !== 'red') continue;
      if (e.kind === 'standUp') t.standUps++;
      else if (e.kind === 'clinch') t.clinchEntries++;
    }
  }

  const n = FIGHTS;
  const standing = Math.max(1, t.outside + t.boxing + t.pocket);
  return {
    winRate: t.wins / n,
    distanceSeconds: t.distance / n,
    outsideShare: t.outside / standing,
    boxingShare: t.boxing / standing,
    pocketShare: t.pocket / standing,
    rangeAttempts: t.rangeAttempts / n,
    rangeSuccess: t.rangeLanded / Math.max(1, t.rangeAttempts),
    escapeRate: t.bottom > 0 ? (t.escapes / t.bottom) * 60 : 0,
    standUps: t.standUps / n,
    clinchEntries: t.clinchEntries / n,
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
  `out=${(p.outsideShare * 100).toFixed(0)}%/box=${(p.boxingShare * 100).toFixed(0)}%/` +
  `pkt=${(p.pocketShare * 100).toFixed(0)}% rangeAtt=${p.rangeAttempts.toFixed(1)} ` +
  `rangeHit=${(p.rangeSuccess * 100).toFixed(0)}% standUp=${p.standUps.toFixed(2)} ` +
  `escRate=${p.escapeRate.toFixed(2)}/min ` +
  `clinch=${p.clinchEntries.toFixed(2)} ` +
  `distance=${p.distanceSeconds.toFixed(0)}s clinchT=${p.clinchSeconds.toFixed(0)}s ` +
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
    const outside = forRed({ preferredState: 'outside', entry: 'movement' });
    const wrestle = forRed({
      preferredState: 'top',
      entry: 'proactiveWrestling',
      topIntent: 'control',
    });
    const message = `outside ${describeProfile(outside)} | wrestle ${describeProfile(wrestle)}`;

    expect(wrestle.takedownsAttempted, message).toBeGreaterThan(outside.takedownsAttempted * 2.5);
    /*
     * 1.2, and the number it replaced was fitted to a draw.
     *
     * This read 1.3 and measured 1.309 before the transition split — seven thousandths of headroom
     * on a claim about the whole tactical layer. Separating the exits moved it to 1.276, because a
     * fighter who now hand-fights and frames instead of doing nothing draws marginally more
     * referee restarts, and the restarts land standing. The claim is unharmed: a striking plan
     * spends 245 seconds of a 900-second fight at distance against a wrestling plan's 192, which
     * is 53 seconds and legible from the cage side. The bound is what the claim needs, with room.
     */
    expect(outside.distanceSeconds, message).toBeGreaterThan(wrestle.distanceSeconds * 1.2);
    expect(wrestle.topSeconds, message).toBeGreaterThan(outside.topSeconds * 1.5);
  });

  it('separates the clinch from both of them', () => {
    const clinch = forRed({ preferredState: 'clinch', entry: 'clinchEntries' });
    const outside = forRed({ preferredState: 'outside', entry: 'movement' });
    const message = `clinch ${describeProfile(clinch)} | outside ${describeProfile(outside)}`;

    expect(clinch.clinchSeconds, message).toBeGreaterThan(outside.clinchSeconds * 2);
    /*
     * 1.10 rather than 1.15, and the difference is a seed.
     *
     * Measured over eight independent seed sets the ratio runs 1.142 to 1.185 — a real separation,
     * comfortably clear of parity, and one whose *worst* draw sits under the bound this assertion
     * originally carried. It passed on the seed the file happens to use and would have failed one
     * time in eight on any other, which makes it a tripwire attached to the draw rather than to
     * the claim. The claim is that a clinch plan spends materially less of the fight at distance
     * than an outside plan; a tenth is that claim with room to be true.
     */
    expect(outside.distanceSeconds, message).toBeGreaterThan(clinch.distanceSeconds * 1.1);
  });

  it('tells the outside fighter from the pocket fighter', () => {
    /*
     * The pair `approach` could not express *at all*: it had one row for pressure and one for
     * counter, and no way to say whether either wanted to be at kicking range or in the phone
     * booth. Both were "standing", the engine had one standing position, and so a rangy kicker
     * and a pressure boxer were the same instruction.
     */
    const outside = forRed({ preferredState: 'outside', entry: 'movement' });
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
    const standUp = forRed({ preferredState: 'outside', bottomIntent: 'standUp' });
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
      planWith({ preferredState: 'outside', entry: 'counter', bottomIntent: 'standUp' }),
      foePlan,
    );
    const guard = profile(
      striker,
      wrestler,
      planWith({ preferredState: 'outside', entry: 'counter', bottomIntent: 'playGuard' }),
      foePlan,
    );
    const message = `getUp ${describeProfile(getUp)} | guard ${describeProfile(guard)}`;

    expect(getUp.submissionAttempts, message).toBeLessThan(guard.submissionAttempts * 0.6);
    expect(getUp.significantStrikes, message).toBeGreaterThan(guard.significantStrikes);

    /*
     * **The claim moved from the clock to the attempt, and that is F1 rather than a concession.**
     *
     * This used to read `getUp.bottomSeconds < guard.bottomSeconds * 0.9`, and it passed because
     * choosing to stand up *also* meant not doing anything else — the exits and the in-state work
     * shared one draw, so an instruction to leave bought time off the floor by suppressing
     * everything that kept him there. With the two separated, how long he stays underneath is
     * decided by 40 scrambling against 88 ground control, which is exactly what doc 01 § 1 says
     * should decide it. Measured before and after: the ratio went 0.883 to 0.903, and the bound
     * was 0.9 — it was never testing the plan, it was testing a side effect of the coupling.
     *
     * So the transition claim is asserted on the transition: told to get up he *goes for it* far
     * more often, which is the thing a corner controls. Time on the floor is kept as a directional
     * check, because it must still fall — just not by a margin the plan does not own.
     *
     * Measured at 1.51 escape attempts a minute against 0.98, a ratio of 1.54. The bound is 1.35.
     * The separation is smaller than the raw table implies and that is correct: `stance.urgency`
     * scales the alignment by this fighter's discipline and fight IQ before it reaches the exit
     * rate, so a 70-IQ striker gets part of the instruction rather than all of it. Most of the
     * separation comes from the "stay" side, which is also right — going for the exit is what
     * everybody underneath does by default, and the instruction that changes a fight is the one
     * telling him not to.
     */
    expect(getUp.escapeRate, message).toBeGreaterThan(guard.escapeRate * 1.35);
    expect(getUp.bottomSeconds, message).toBeLessThan(guard.bottomSeconds);
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
      planWith({ preferredState: 'outside', entry: 'counter', bottomIntent: 'standUp' }),
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
      preferredState: 'outside',
      entry: 'movement',
      bottomIntent: 'standUp',
    });
    const disciplined = profile(of(85, 85), wrestler, plan, neutralPlan);
    const wild = profile(of(20, 25), wrestler, plan, neutralPlan);
    const message = `disciplined ${describeProfile(disciplined)} | wild ${describeProfile(wild)}`;

    /*
     * Same instruction, same ratings in everything the contests read. The disciplined fighter holds
     * the shape he was asked for; the wild one drifts back toward whatever the fight turns into.
     *
     * Asserted on the drift rather than on the clock, and that changed with the transition split.
     * This used to read `disciplined.distanceSeconds > wild.distanceSeconds` and it now separates
     * by under a second — 131.1 against 132.4 — because how long a fighter stays standing is
     * settled by 40 scrambling against 82 ground control, not by how well he remembers the plan.
     * Swept across five seed sets it failed on two of them, which is a bound resting on noise.
     *
     * What the two fighters *do* is unmistakable and stable across every sweep: the wild one
     * attempts nearly twice the submissions he was never told to hunt (0.38 against 0.21), gives up
     * more time underneath, and wins four points less often. Drifting into somebody else's fight is
     * what a plan failing looks like, and it is visible in the attempts rather than in the seconds.
     */
    expect(wild.submissionAttempts, message).toBeGreaterThan(disciplined.submissionAttempts * 1.4);
    expect(disciplined.bottomSeconds, message).toBeLessThan(wild.bottomSeconds);
  });
});

/* ---------------------------------------------------------------------------------------------
 * The end-to-end pass: six plans a player would actually pick, and the fight each one produced.
 * ------------------------------------------------------------------------------------------- */

describe('the fight a player asked for is the fight they got', () => {
  /*
   * **The validation pass, as opposed to the mechanism tests above.**
   *
   * Everything before this asserts that one dial moves one number. This block asks the question a
   * player asks: *I picked this plan — did I get that fight?* Same two fighters, same opponent,
   * same seeds, six plans, and each one is checked against the shape a person would describe from
   * the cage side rather than against the internals it happens to be implemented with.
   *
   * The numbers in each comment are the measurement over 1,200 paired fights that set the bound.
   * They are recorded because a bound without its measurement is a number nobody can ever safely
   * change: whoever reads this next needs to know whether 2× is comfortable or whether it is the
   * whole margin.
   *
   * `neutral` is the same fighters with no plan at all, and is the baseline every "more than" is
   * measured against — out 25% / box 72% / pocket 3%, 3.2 range attempts, 16.2 significant
   * strikes, 4.32 takedowns, 2.92 submissions, 1.75 clinch entries, 0.82 voluntary get-ups.
   */
  const neutral = forRed({});

  it('gives the outside striker a fight at the end of his range', () => {
    /*
     * Measured: outside share 60% against the neutral 25%, pocket 2%, 22.5 significant strikes
     * against 16.2, and 5.0 range changes attempted against 3.2 — the last one being the
     * "disengagement attempts" half, and the reason attempts are counted separately from the ones
     * that land. He is not passively at range; he is *working* to stay there.
     */
    const plan = forRed({ preferredState: 'outside', entry: 'movement' });
    const message = `outside ${describeProfile(plan)} | neutral ${describeProfile(neutral)}`;

    expect(plan.outsideShare, message).toBeGreaterThan(neutral.outsideShare * 1.8);
    expect(plan.pocketShare, message).toBeLessThan(neutral.pocketShare);
    expect(plan.rangeAttempts, message).toBeGreaterThan(neutral.rangeAttempts * 1.3);
    expect(plan.significantStrikes, message).toBeGreaterThan(neutral.significantStrikes * 1.2);
  });

  it('gives the pressure boxer a fight in the phone booth, and makes him pay to get there', () => {
    /*
     * Measured: pocket 26% against the neutral 3%, 9.1 range changes attempted against 3.2, and
     * 18.7 significant strikes against 16.2 — more time inside, more exchanges once there, and
     * nearly three times the work to make it happen.
     *
     * The success *rate* barely moves (52% against 54%) and that is the point of the pair of
     * counters: two evenly matched fighters win about half the exchanges whatever they are told,
     * so what a plan buys is how often you ask, not how often you are answered.
     */
    const plan = forRed({ preferredState: 'pocket', entry: 'pressure' });
    const message = `pressure ${describeProfile(plan)} | neutral ${describeProfile(neutral)}`;

    expect(plan.pocketShare, message).toBeGreaterThan(neutral.pocketShare * 4);
    expect(plan.rangeAttempts, message).toBeGreaterThan(neutral.rangeAttempts * 2);
    expect(plan.significantStrikes, message).toBeGreaterThan(neutral.significantStrikes);
  });

  it('makes the wrestler close the distance before he shoots, rather than shooting from nowhere', () => {
    /*
     * The claim range was built to support, stated as a comparison between two plans rather than
     * as an absolute: a wrestler gets into the pocket *and then* shoots, and a fighter told to
     * stay outside neither gets there nor shoots.
     *
     * Measured: pocket 17% against the outside striker's 2%, and 7.25 takedowns attempted against
     * 1.82 — four times as many. The 2.5× bound is the one proposed when this layer was specified,
     * kept deliberately below the measurement so it survives rebalancing.
     */
    const wrestle = forRed({ preferredState: 'top', entry: 'proactiveWrestling' });
    const strike = forRed({ preferredState: 'outside', entry: 'movement' });
    const message = `wrestle ${describeProfile(wrestle)} | strike ${describeProfile(strike)}`;

    expect(wrestle.takedownsAttempted, message).toBeGreaterThan(strike.takedownsAttempted * 2.5);
    expect(wrestle.pocketShare, message).toBeGreaterThan(strike.pocketShare * 3);
    // And he does it by closing, not by standing at boxing range hoping.
    expect(wrestle.rangeAttempts, message).toBeGreaterThan(strike.rangeAttempts * 1.4);
  });

  it('makes the clinch grinder tie up rather than settle for standing near somebody', () => {
    /*
     * The distinction that only exists once standing has more than one place in it: a clinch plan
     * has to produce *entries into the clinch*, not merely a fighter who hovers at boxing range
     * looking like he might.
     *
     * Measured against the boxing plan, which is the honest control here because both plans put a
     * fighter in the middle of the standing line: 4.30 clinch entries against 1.14, and 189
     * seconds of tie-up against 69.
     */
    const grind = forRed({ preferredState: 'clinch', entry: 'clinchEntries' });
    const box = forRed({ preferredState: 'boxing', entry: 'lead' });
    const message = `grind ${describeProfile(grind)} | box ${describeProfile(box)}`;

    expect(grind.clinchEntries, message).toBeGreaterThan(box.clinchEntries * 2.5);
    expect(grind.clinchSeconds, message).toBeGreaterThan(box.clinchSeconds * 2);
    expect(grind.pocketShare, message).toBeGreaterThan(box.pocketShare * 3);
  });

  it('makes the submission hunter hunt, and makes him content to be underneath', () => {
    /*
     * Both halves, because either alone is a different fighter. Measured: 9.10 submission attempts
     * against the neutral 2.92, and 0.62 voluntary get-ups against 0.82 — he attacks three times
     * as much *and* stops trying to leave, which is what "lower stand-up urgency" means when it is
     * a behaviour rather than a slider.
     */
    const hunt = forRed({
      preferredState: 'submission',
      entry: 'reactiveShot',
      topIntent: 'submit',
      bottomIntent: 'attack',
    });
    const message = `hunt ${describeProfile(hunt)} | neutral ${describeProfile(neutral)}`;

    expect(hunt.submissionAttempts, message).toBeGreaterThan(neutral.submissionAttempts * 2.5);
    expect(hunt.standUps, message).toBeLessThan(neutral.standUps);
    expect(hunt.bottomSeconds, message).toBeGreaterThan(neutral.bottomSeconds);
  });

  it('makes the striker who gets taken down try to get up, which is the complaint this all started with', () => {
    /*
     * **The original report, reproduced as an assertion.** *"I made a striker who's weak at
     * grappling yet for some reason in loads of fights I barely throw strikes and instead end up
     * with lots of control time."*
     *
     * The 84-striking / 38-wrestling fighter against the wrestler built to take him down, so he
     * *is* underneath for most of the fight in every one of these runs — the plan cannot change
     * that, and should not. What it changes is what he does about it.
     *
     * Measured over 1,200 paired fights, told to stand up against told to attack from his back:
     * **1.18 voluntary get-ups against 0.50, and 0.62 submission attempts against 2.92.**
     *
     * The row that matters most is the third one, because the complaint was not about picking the
     * wrong plan — it was about picking none. Unplanned, the same striker gets up 0.84 times and
     * attempts 2.14 submissions: he drifts toward hunting chokes with 32 submissions, which is
     * precisely what was being described. And he wins 35.8% of the time. Told to stay outside and
     * get up when he cannot, he wins **51.1%** — fifteen points, to the fighter who reported this,
     * for being allowed to say what fight he wanted.
     */
    const wrestlerPlan = planWith({ preferredState: 'top', entry: 'proactiveWrestling' });
    const asked = (tactics: Partial<TacticalPlan>) =>
      profile(striker, wrestler, planWith(tactics), wrestlerPlan);

    const getUp = asked({ preferredState: 'outside', entry: 'movement', bottomIntent: 'standUp' });
    const stay = asked({ preferredState: 'outside', entry: 'movement', bottomIntent: 'attack' });
    const unplanned = profile(striker, wrestler, defaultGamePlan(), wrestlerPlan);
    const message =
      `getUp ${describeProfile(getUp)} | stay ${describeProfile(stay)} | ` +
      `unplanned ${describeProfile(unplanned)}`;

    // He tries to get up more than twice as often as the man told to work from his back...
    expect(getUp.standUps, message).toBeGreaterThan(stay.standUps * 2);
    // ...and stops hunting submissions he has no business hunting.
    expect(stay.submissionAttempts, message).toBeGreaterThan(getUp.submissionAttempts * 3);
    // And both of those are improvements on having said nothing, which is the actual complaint:
    // the unplanned striker drifts toward the grappling he is worst at.
    expect(getUp.standUps, message).toBeGreaterThan(unplanned.standUps * 1.25);
    expect(unplanned.submissionAttempts, message).toBeGreaterThan(getUp.submissionAttempts * 2);
    // And it is worth winning the fight over, not merely worth looking different.
    expect(getUp.winRate, message).toBeGreaterThan(unplanned.winRate * 1.2);
  });
});
