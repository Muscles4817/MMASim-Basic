/**
 * **Does a fighter reach for the things that are in his game?**
 *
 * The third engine-wide rule, alongside shape-not-level and intent authority, and it comes from
 * the same class of defect as both — a quantity nobody chose, that nothing measured:
 *
 * > **Repertoire gates choice.** How often a fighter *reaches for* an action must be gated by
 * > whether the action is part of his game at all — not only by how well he would do it, and not
 * > only by what his corner asked for.
 *
 * The report that produced this file: a created fighter, a former Olympic boxer with
 * `submissions: 12` and a game plan built entirely around staying on his feet, kept hunting
 * submissions. He does. The engine has three terms for a decision — `capability`, `intent`,
 * `opportunity` — and **none of them can say "this man does not do that"**:
 *
 *  - `capability` is `effect()`, which is a *multiplier*. Across the whole 1–100 submissions
 *    scale it spans about 13:1, and the bottom of it is 0.24 rather than 0.  Worse, the
 *    submission is not compared against nothing — it competes with `defend`, whose capability is
 *    `scrambling`, an attribute a converted boxer legitimately owns. Twelve against forty-eight
 *    comes out **3.2:1**, and that is the entire statement the engine can make about a man who
 *    has never drilled a submission in his life.
 *  - `intent` spans 45:1 at conviction 1 and about 3:1 at the conviction a real plan carries, so
 *    the corner can argue but not win.
 *  - `opportunity` only ever *lifts* suppression (`submissionOpportunity`), never applies it.
 *
 * So the suppression floor is structural, it is about 7–8% of his bottom beats, and no
 * instruction in the vocabulary can push it lower. That is the finding. This file is the fence
 * around it.
 *
 * **What is asserted and what is recorded.** In the manner of `intent-authority.test.ts` and
 * `DECLARED_LEVELS` in `shape-not-level.test.ts`: the claims the engine already honours are
 * asserted as claims, and the ones it violates are recorded as an explicit, bounded debt with the
 * measurement written down. Nothing here is a target. The bounds fail if the behaviour gets
 * *worse*, which is the regression worth catching while the fix is pending; fixing it will fail
 * these tests on purpose, and the comment on each says which direction that is.
 *
 * The cast is `ARCHETYPES`' three style exemplars plus the rating exemplars, chosen so that every
 * band of the `submissions` scale is represented by a fighter somebody could name:
 *
 * ```
 *   olympic boxer     12   never, under any circumstances
 *   point karateka    28   never, and he has the athleticism to have learned
 *   southpaw sniper   40   an ordinary fighter's rating, and still not his game
 *   journeyman        50   the control: no preference either way
 *   grinder           62   as a by-product of the position, not as a plan
 *   chain wrestler    78   the finish that follows the control
 *   guard player      92   the whole point of being there
 * ```
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  planFor,
  resolveFightByRound,
  simulateFight,
  type Fighter,
  type GamePlan,
  type TacticalPlan,
} from '@mmasim/engine';
import { TOP_INTENTS, repertoire } from '@mmasim/engine';
import { DEFAULT_ERA, createNewGame } from '@mmasim/data';
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import {
  stanceOf,
  submissionOpportunity,
  topControlFocus,
} from '../../packages/engine/src/fight/policy.js';
import { actionShares } from '../../packages/engine/src/fight/decide.js';
import { bottomWork, topCandidates } from '../../packages/engine/src/fight/simulate.js';

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.9, ...t },
});

/** The plan a player who wants to stay on his feet writes, as explicitly as the vocabulary allows. */
const STAY_STANDING = plan({
  preferredState: 'boxing',
  entry: 'counter',
  topIntent: 'control',
  bottomIntent: 'defend',
  clinchIntent: 'damage',
});

/** The same instruction with the tank-sparing bottom, which is the quietest the plan can be. */
const STAY_STANDING_RECOVER = plan({
  preferredState: 'boxing',
  entry: 'counter',
  topIntent: 'control',
  bottomIntent: 'recover',
  clinchIntent: 'damage',
});

/** The scale, bottom to top, and the fighter who owns each band. */
const CAST: readonly (readonly [string, () => Fighter])[] = [
  ['olympic boxer', ARCHETYPES.olympicBoxer],
  ['point karateka', ARCHETYPES.pointKarateka],
  ['southpaw sniper', ARCHETYPES.southpawSniper],
  ['journeyman', ARCHETYPES.journeyman],
  ['grinder', ARCHETYPES.grinder],
  ['chain wrestler', ARCHETYPES.smotherer],
  ['guard player', ARCHETYPES.guardPlayer],
];

const FOE = ARCHETYPES.journeyman();

/* ---------------------------------------------------------------------------------------------
 * Part one — the decision, which is where the claim actually lives.
 *
 * Asserted on shares rather than through fights wherever it can be, for the reason
 * `bottom-vocabulary.test.ts` gives: these are claims about what a fighter *chooses*, and a
 * simulation only adds noise to them.
 * ------------------------------------------------------------------------------------------ */

/** The submission's share of the draw at both surfaces that offer one, in per cent. */
function submissionShares(f: Fighter, p: GamePlan): { bottom: number; top: number } {
  const a = createCombatant('red', f, p);
  const t = createCombatant('blue', FOE, planFor(FOE, f));
  // Displaced, fresh and unhurt: the most favourable case there is for the plan being obeyed, so
  // any suppression that survives here survives everywhere.
  const stance = stanceOf(a, undefined, true);
  const bottom = bottomWork(a, stance, 'guard', submissionOpportunity(a, t, 'guard', false), false);
  const top = topCandidates(a, t, stance, 0.5, submissionOpportunity(a, t, 'halfGuard', true));
  return {
    bottom: actionShares(bottom).submission * 100,
    top: actionShares(top).submission * 100,
  };
}

describe('the gate itself', () => {
  it('is exactly inert at and above the rating doc 02 calls a technique he has', () => {
    /*
     * **The property the whole term rests on, and it is an exact-equality claim rather than an
     * approximate one.** `repertoire` returns a hard 1 for any rating of 38 or better, so on the
     * bulk of any roster the candidate weight is multiplied by exactly 1.0 and the fight is
     * bit-for-bit the fight it was. That is what lets a new factor be added to every decision
     * surface in the engine without recalibrating the sport — and it is checked here rather than
     * assumed, because `0.03 + 0.97 * 1` being exactly 1.0 is a fact about IEEE 754 and not about
     * arithmetic.
     *
     * `intent-authority.test.ts` is the other half: two of its three recorded matchups are
     * unchanged to three decimal places, and the third is the one fixture built to be bad.
     */
    for (const rating of [38, 44, 50, 62, 75, 88, 99]) {
      expect(repertoire(rating), `rating ${rating}`).toBe(1);
    }
  });

  it('reaches its floor across the whole band doc 02 calls effectively absent', () => {
    // 1–19 is one claim in the doc — *effectively absent from their game* — so it is one value
    // here. A fighter with 3 and a fighter with 18 are the same fighter for this purpose.
    for (const rating of [1, 8, 15, 19]) {
      expect(repertoire(rating), `rating ${rating}`).toBeCloseTo(repertoire(1), 10);
    }
    expect(repertoire(12)).toBeLessThan(0.05);
    // Never zero: a boxer who grabs a neck in a scramble is a real fight, and a zero-weight
    // candidate cannot be told from an unavailable one.
    expect(repertoire(1)).toBeGreaterThan(0);
  });

  it('rises monotonically through the band between them, and only there', () => {
    let previous = -1;
    for (let r = 1; r <= 100; r++) {
      const v = repertoire(r);
      expect(v, `rating ${r}`).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
    // Convex through the liability band rather than linear: see REPERTOIRE_CONVEXITY.
    expect(repertoire(28), 'midpoint of "a genuine liability"').toBeLessThan(0.3);
    expect(repertoire(36), 'the top of it').toBeGreaterThan(0.7);
  });
});

describe('repertoire gates choice — the submission', () => {
  it('no longer lets the wrong pair of attributes decide it', () => {
    /*
     * **The falsifier that defined D16, now failing to falsify.**
     *
     * The bottom in-state list is a submission at `effect(submissions)` against a `defend` at
     * `effect(scrambling)`. A weighted draw is a softmax over the logs, so before the gate the
     * share was a function of the *gap between two ratings* and `submissions` had no absolute
     * reading at all. Held at one plan, varying only the two attributes:
     *
     * ```
     *                        scrambling 30   scrambling 60   scrambling 90
     *   submissions 30   was      17.0%            9.1%            4.6%
     *                    now       6.2%            3.1%            1.5%
     *   submissions 70   was      43.0%           26.8%           15.1%
     *                    now      43.0%           26.8%           15.1%     (unchanged: 70 > 38)
     * ```
     *
     * The inversion was that the 70/90 fighter reached for it *less often* than the 30/30 one.
     * The gate does not remove the dependence on `scrambling` — that is `effect` doing its job,
     * and a better scrambler genuinely does have a better alternative — it removes the case where
     * that dependence outruns the rating that names the action.
     */
    const controlled = (submissions: number, scrambling: number) =>
      submissionShares(
        makeFighter({
          id: `fighter_ctl_${submissions}_${scrambling}`,
          attributes: { submissions, scrambling },
        }),
        STAY_STANDING,
      ).bottom;

    const weakGrappler = controlled(30, 30);
    const goodSubmitter = controlled(70, 90);
    const report = `submissions 30/scrambling 30 → ${weakGrappler.toFixed(1)}%, submissions 70/scrambling 90 → ${goodSubmitter.toFixed(1)}%`;

    expect(goodSubmitter, report).toBeGreaterThan(weakGrappler);
    // And not marginally: 15.1% against 6.2%, where it used to be 15.1% against 17.0%.
    expect(goodSubmitter / weakGrappler, report).toBeGreaterThan(2);
  });

  it('leaves every fighter with a real submission game exactly where he was', () => {
    /*
     * The other half of the same claim, and the one that makes the fix safe to ship. Every
     * capability read at or above 38 is multiplied by a hard 1, so the fighters the sport is
     * calibrated on do not move at all — measured to the tenth of a per cent, before and after:
     *
     * ```
     *   journeyman (50)   32.9%  →  32.9%      grinder (62)       16.7%  →  16.7%
     *   chain wrestler (78)  25.7%  →  25.7%   guard player (92)  92.0%  →  92.0%
     * ```
     */
    const shares = Object.fromEntries(
      CAST.map(([name, make]) => [name, submissionShares(make(), STAY_STANDING).bottom]),
    );
    const report = JSON.stringify(shares);

    expect(shares['journeyman'], report).toBeCloseTo(19.392, 2);
    expect(shares['grinder'], report).toBeCloseTo(10.649, 2);
    expect(shares['chain wrestler'], report).toBeCloseTo(16.7, 1);
    expect(shares['guard player'], report).toBeCloseTo(23.2, 1);
  });

  it('takes the fighter with no submission game to effectively never', () => {
    /*
     * **The report, answered.** A fighter with `submissions: 12` told to stay on his feet:
     *
     * ```
     *                      before   after
     *   bottomIntent defend   3.9%    0.12%
     *   top position          2.3%    0.07%
     *   bottomIntent recover  1.3%    0.04%
     * ```
     *
     * The karateka's `submissions: 28` — doc 02's *genuine liability* rather than *absent* — lands
     * an order of magnitude above him at 1.0% and still round to nothing over a career, which is
     * the separation the two bands are supposed to have.
     */
    const boxer = ARCHETYPES.olympicBoxer();
    const defend = submissionShares(boxer, STAY_STANDING);
    const recover = submissionShares(boxer, STAY_STANDING_RECOVER);
    const karateka = submissionShares(ARCHETYPES.pointKarateka(), STAY_STANDING);
    const report =
      `boxer defend: bottom ${defend.bottom.toFixed(2)}% top ${defend.top.toFixed(2)}%, ` +
      `recover ${recover.bottom.toFixed(2)}%, karateka ${karateka.bottom.toFixed(2)}%`;

    expect(defend.bottom, report).toBeLessThan(0.3);
    expect(defend.top, report).toBeLessThan(0.2);
    expect(recover.bottom, report).toBeLessThan(0.1);
    expect(karateka.bottom, report).toBeLessThan(2);
    // Ordered, and by a real margin: absent is not the same claim as liability.
    expect(karateka.bottom / defend.bottom, report).toBeGreaterThan(3);
  });

  it('does not pretend to answer the question intent owns — the remaining debt', () => {
    /*
     * **What the gate deliberately does not fix, stated so nobody assumes it did.**
     *
     * `southpawSniper` has `submissions: 40`. That is doc 02's *below major-promotion level, a
     * hole opponents will find* — which is a submission game, a bad one, and the gate is inert
     * there by design. He measures **8.3% of his bottom beats before and after**, and 0.20
     * submission attempts a fight against the boxer's 0.01.
     *
     * That is the right division of labour and not a gap: **repertoire answers absence, intent
     * answers preference.** A fighter who owns a poor submission game and chooses not to use it is
     * exactly what `bottomIntent` is for, and it moves him — `recover` takes the same fighter to
     * 2.9%. Making the gate reach 40 would be re-litigating the anchor, and the anchor is what
     * keeps the term inert on three quarters of the roster.
     *
     * If a future report is about *this* fighter rather than the boxer, the fix is a planner that
     * gives him `recover`, not a wider gate.
     */
    const sniper = ARCHETYPES.southpawSniper();
    const asked = submissionShares(sniper, STAY_STANDING).bottom;
    const quiet = submissionShares(sniper, STAY_STANDING_RECOVER).bottom;
    const report = `defend ${asked.toFixed(1)}%, recover ${quiet.toFixed(1)}%`;

    // Recorded, not endorsed: an ordinary rating still reaches for it on one beat in twelve.
    expect(asked, report).toBeGreaterThan(5);
    expect(asked, report).toBeLessThan(14);
    // And the instruction is what moves him, which is the point of leaving him to it.
    expect(asked / quiet, report).toBeGreaterThan(2);
  });

  it('is something the corner can still move, which the gate must not have flattened', () => {
    /*
     * The risk a gate introduces: suppress an action hard enough and the plan stops mattering,
     * which would trade D16 for a worse version of the problem the tactical layer exists to fix.
     * It does not — on a fighter who *has* the technique the instruction is worth what it always
     * was, and on one who does not the plan can still move him by the same ratio, from
     * almost-never to almost-never.
     */
    const boxer = ARCHETYPES.olympicBoxer();
    const attack = submissionShares(
      boxer,
      plan({ preferredState: 'submission', bottomIntent: 'attack' }),
    );
    const recover = submissionShares(boxer, STAY_STANDING_RECOVER);
    const report = `attack ${attack.bottom.toFixed(2)}% against recover ${recover.bottom.toFixed(2)}%`;

    expect(attack.bottom / recover.bottom, report).toBeGreaterThan(5);
  });
});

/* ---------------------------------------------------------------------------------------------
 * Part two — the AI planner, which is where the world's fighters get their instructions.
 * ------------------------------------------------------------------------------------------ */

describe('the corner reads the fighter it has', () => {
  /** A striker with the two ground ratings set where the caller asks. */
  const strikerWith = (submissions: number, groundControl: number): Fighter =>
    makeFighter({
      id: `fighter_sg_${submissions}_${groundControl}`,
      attributes: {
        strikingOffence: 90,
        kicking: 85,
        strikingDefence: 85,
        speed: 85,
        power: 75,
        cardio: 72,
        durability: 68,
        strength: 55,
        fightIq: 80,
        composure: 78,
        wrestling: 30,
        takedownDefence: 50,
        scrambling: 50,
        submissions,
        groundControl,
      },
    });

  it('gives the three style exemplars three different fights', () => {
    /*
     * Before anything is claimed about submissions: the tactical layer does separate these men.
     * The boxer is put in the pocket, the karateka at kicking range, the wrestler on the floor —
     * and if that stopped being true, every other assertion in this file would be measuring a
     * planner that had collapsed rather than an engine that had.
     */
    const state = (f: Fighter) => planFor(f, FOE).tactics.preferredState;
    expect(state(ARCHETYPES.pointKarateka())).toBe('outside');
    expect(state(ARCHETYPES.olympicBoxer())).toBe('pocket');
    expect(state(ARCHETYPES.smotherer())).toBe('top');
    expect(state(ARCHETYPES.guardPlayer())).toBe('bottom');
  });

  it('no longer tells a man who cannot submit anybody to hunt submissions', () => {
    /*
     * **D17, fixed.** `pickTopIntent`'s first line was a relative read with no floor —
     *
     * ```ts
     *   if (a.submissions > a.groundControl + 2) return 'submit';
     * ```
     *
     * — so it asked *which of your two ground ratings is the better one* and handed `submit`,
     * "expose yourself to attack the finish", to anybody whose answer was `submissions`, including
     * strikers who had dumped points out of both. It now carries `SUBMIT_FROM_TOP_FLOOR`, which is
     * `pickBottomIntent`'s own lower bar reused rather than chosen: the two functions ask the same
     * question about the same attribute, and answering it two ways was the whole finding.
     */
    for (const [subs, gc] of [
      [20, 15],
      [30, 25],
      [45, 30],
      [55, 20],
    ] as const) {
      const got = planFor(strikerWith(subs, gc), FOE).tactics.topIntent;
      expect(got, `submissions ${subs} / groundControl ${gc}`).not.toBe('submit');
    }
  });

  it('still tells a genuine submission grappler to hunt, which the floor must not have cost', () => {
    /*
     * The other half, and the reason the floor sits under the relative test rather than replacing
     * it. An earlier absolute-only bar of `submissions > 68` handed almost everybody `control` and
     * took the sport's submission rate from 19.6% to 16.1%; the relative comparison is what tells a
     * submission-leaning grappler from a control-leaning one, and it survives.
     */
    expect(planFor(strikerWith(75, 40), FOE).tactics.topIntent).toBe('submit');
    expect(planFor(ARCHETYPES.guardPlayer(), FOE).tactics.topIntent).toBe('submit');
    // ...and a man whose top game is his control is still a controller, whatever his submissions.
    expect(planFor(ARCHETYPES.smotherer(), FOE).tactics.topIntent).not.toBe('submit');
  });

  it('costs the sport almost nothing, because those fighters never finished anybody — the measurement', () => {
    /*
     * **The measurement the original removal of the absolute bar did not take**, and the reason
     * this change is safe. Taking the instruction off a quarter of the roster moves the sport by
     * less than a point, measured over every same-division pairing on the shipped 2026 world:
     *
     * ```
     *                   submit%  control%   KO%    sub%   KO:sub
     *   before            34.5      56.7   39.7    13.9     2.85
     *   floor 56          13.7      77.7   40.0    13.0     3.08
     * ```
     *
     * A fighter with `submissions: 30` told to hunt was not producing submissions; he was paying
     * `topControlFocus` 0.7 — the worst hold in the game — for nothing. `roster-profile.test.ts`
     * holds the population bounds; this asserts the mechanism, that a fighter who loses the
     * instruction lands on `control` and therefore gets his position back.
     */
    const displaced = strikerWith(45, 30);
    expect(planFor(displaced, FOE).tactics.topIntent).toBe('control');
    expect(topControlFocus(createCombatant('red', displaced, planFor(displaced, FOE)))).toBe(1);
  });

  it('gives every top instruction to somebody, on the roster that actually ships', () => {
    /*
     * **D20.** The other two branches of `pickTopIntent` were the same defect as D17 wearing an
     * absolute bar instead of no bar at all — `power + groundControl > 150` and `groundControl >
     * 68`, both set for a stronger population than the one that ships. The 2026 roster's medians
     * are 49 power and 44 ground control, so *"pass, mount, take the back"* and *"posture up and
     * hit them"* were instructions almost nobody was ever given:
     *
     * ```
     *              control   ground and pound   advance   submit
     *   before        77.8%               5.1%      3.5%    13.6%
     *   after         53.8%              17.9%     14.7%    13.6%
     * ```
     *
     * Asserted as a floor per intent rather than as the measured split, because what is being
     * defended is *every instruction reaches somebody* — a four-value vocabulary in which two
     * values are unused is three values and a decoration. The bounds are wide on purpose; the
     * population bounds live in `roster-profile.test.ts`, which is what would catch a change to
     * this one moving the sport.
     */
    const db = createNewGame({ adapter: undefined, era: DEFAULT_ERA });
    const active = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
    const byDivision = new Map<string, Fighter[]>();
    for (const f of active)
      byDivision.set(f.divisionId, [...(byDivision.get(f.divisionId) ?? []), f]);

    const share: Record<string, number> = {};
    let pairings = 0;
    for (const list of byDivision.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const intent = planFor(list[i]!, list[j]!).tactics.topIntent;
          share[intent] = (share[intent] ?? 0) + 1;
          pairings++;
        }
      }
    }
    const pct = (k: string) => ((share[k] ?? 0) * 100) / pairings;
    const report = TOP_INTENTS.map((k) => `${k} ${pct(k).toFixed(1)}%`).join(', ');

    // The guard on the fixture: if the world stops pairing, every bound below passes vacuously.
    expect(pairings, report).toBeGreaterThan(30_000);

    for (const intent of TOP_INTENTS) {
      expect(pct(intent), `${intent} is unreachable — ${report}`).toBeGreaterThan(8);
    }
    // And riding the position stays the honest default without swallowing the vocabulary.
    expect(pct('control'), report).toBeGreaterThan(40);
    expect(pct('control'), report).toBeLessThan(70);
  });

  it('reads which way a fighter spends a position, not merely that he has one', () => {
    /*
     * The mechanism behind the distribution above, on controlled fighters rather than on a
     * population: given the same position to spend, the man who hits harder than he holds postures
     * up and the technician passes. `power > groundControl` is the whole of that separation, and
     * `derivedRating(a, 'groundAndPound')` — the rating the engine uses for the damage itself — is
     * the floor under it, so the instruction is keyed on what it produces rather than on a sum.
     */
    const onTop = (power: number, groundControl: number): Fighter =>
      makeFighter({
        id: `fighter_top_${power}_${groundControl}`,
        // Low enough that the `submit` branch above never fires and this measures the two below it.
        attributes: { power, groundControl, submissions: 30 },
      });

    // Hits harder than he holds, and hits hard enough for it to be worth the position.
    expect(planFor(onTop(75, 55), FOE).tactics.topIntent).toBe('groundAndPound');
    // The same edge, and nothing behind it — posturing up is not worth giving the position back.
    expect(planFor(onTop(40, 30), FOE).tactics.topIntent).toBe('control');
    // Holds better than he hits, and well enough to pass rather than sit.
    expect(planFor(onTop(50, 70), FOE).tactics.topIntent).toBe('advance');
    // Holds better than he hits and cannot pass anybody, so he rides it. The honest default.
    expect(planFor(onTop(40, 48), FOE).tactics.topIntent).toBe('control');
  });

  it('never tells one of the style exemplars to hunt from the bottom', () => {
    /*
     * `pickBottomIntent` reads `strikeLean`, which is a *relative* read too and gets this right
     * where `pickTopIntent` gets it wrong — because it has an absolute floor beneath it
     * (`submissions > 66`, `submissions > 56`) before `attack` is reachable at all. It is the
     * shape the top intent needs and does not have, and it is asserted here so that the two
     * cannot be brought into line by loosening this one.
     */
    for (const make of [
      ARCHETYPES.olympicBoxer,
      ARCHETYPES.southpawSniper,
      ARCHETYPES.pointKarateka,
    ]) {
      const f = make();
      expect(planFor(f, FOE).tactics.bottomIntent, f.lastName).not.toBe('attack');
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * Part three — what it adds up to over a card, at both levels of detail.
 * ------------------------------------------------------------------------------------------ */

const FIELD: readonly (() => Fighter)[] = [
  ARCHETYPES.journeyman,
  ARCHETYPES.grinder,
  ARCHETYPES.smotherer,
  ARCHETYPES.contender,
  ARCHETYPES.striker,
  ARCHETYPES.guardPlayer,
];

const FIGHTS = 120;

interface Sample {
  /** Submission attempts per fight. */
  perFight: number;
  /** Share of fights in which at least one submission was attempted, 0–1. */
  shareOfFights: number;
  /** Takedown attempts per fight, so this file covers more than one action. */
  takedownsPerFight: number;
}

function card(
  level: 'full' | 'reduced',
  make: () => Fighter,
  planOf: (f: Fighter, o: Fighter) => GamePlan,
): Sample {
  const resolve = level === 'full' ? simulateFight : resolveFightByRound;
  let subs = 0;
  let tds = 0;
  let withSub = 0;
  let n = 0;
  for (const makeOpp of FIELD) {
    for (let i = 0; i < FIGHTS; i++) {
      const me = make();
      const opp = makeOpp();
      if (me.id === opp.id) continue;
      const r = resolve({
        boutId: `si_${me.id}_${opp.id}_${i}`,
        seed: `si_${me.id}_${opp.id}_${i}`,
        rounds: 3,
        red: { fighter: me, plan: planOf(me, opp) },
        blue: { fighter: opp, plan: planFor(opp, me) },
      });
      subs += r.stats.red.submissionAttempts;
      tds += r.stats.red.takedownsAttempted;
      if (r.stats.red.submissionAttempts > 0) withSub++;
      n++;
    }
  }
  return { perFight: subs / n, shareOfFights: withSub / n, takedownsPerFight: tds / n };
}

describe('over a card', () => {
  it('takes a striker from several submissions a career to none', () => {
    /*
     * **The report, answered at the level the player actually experiences it.** A 7% share of
     * beats is a small number with a long reach, and this is the reach. Measured over 1,200 fights
     * apiece against a six-man field, at Full detail, on the planner's own instructions:
     *
     * ```
     *                     before   after     over a 20-fight career
     *   olympic boxer       0.25    0.01      5 attempts  →  0.2
     *   point karateka      0.16    0.03      3 attempts  →  0.6
     *   southpaw sniper     0.26    0.20      unchanged, and deliberately so (see above)
     * ```
     *
     * The boxer now attempts a submission in about one fight in a hundred, which is a career with
     * one scramble in it that got away from him. That is the fight the report described wanting.
     */
    const boxer = card('full', ARCHETYPES.olympicBoxer, (f, o) => planFor(f, o));
    const karateka = card('full', ARCHETYPES.pointKarateka, (f, o) => planFor(f, o));
    const report = `boxer ${boxer.perFight.toFixed(3)}/fight in ${(boxer.shareOfFights * 100).toFixed(1)}% of fights, karateka ${karateka.perFight.toFixed(3)}/fight`;

    expect(boxer.perFight, report).toBeLessThan(0.05);
    expect(boxer.shareOfFights, report).toBeLessThan(0.03);
    expect(karateka.perFight, report).toBeLessThan(0.1);
  });

  it('leaves the fighters whose game it is completely alone', () => {
    /*
     * The guard that stops the fix from being a submission nerf. Every one of these reads 50 or
     * better on `submissions`, so the gate is a hard 1 and the only thing that could move them is
     * a bug. Measured before and after, per fight:
     *
     * ```
     *   chain wrestler   3.44 → 3.51      guard player   5.47 → 5.46
     *   grinder          7.47 → 7.50      journeyman     0.32 → 0.30
     * ```
     *
     * The residual movement is sampling noise on the opponents' side of the field — `canFodder`
     * and other low-rated opponents *are* gated, so a specialist's fights against them differ
     * slightly. Nothing about the specialist himself moved.
     */
    const wrestler = card('full', ARCHETYPES.smotherer, (f, o) => planFor(f, o));
    const guard = card('full', ARCHETYPES.guardPlayer, (f, o) => planFor(f, o));
    const grinder = card('full', ARCHETYPES.grinder, (f, o) => planFor(f, o));
    const report = `wrestler ${wrestler.perFight.toFixed(2)}, guard ${guard.perFight.toFixed(2)}, grinder ${grinder.perFight.toFixed(2)}`;

    expect(wrestler.perFight, report).toBeGreaterThan(3);
    expect(guard.perFight, report).toBeGreaterThan(5);
    expect(grinder.perFight, report).toBeGreaterThan(7);
  });

  it('is why an unplanned fighter is a worse fighter, which is what D19 was about', () => {
    /*
     * **The measurement that motivated D19, kept now that D19 is fixed** — because it is a claim
     * about the *engine* and remains true, and because it is the evidence for why the app's default
     * mattered so much.
     *
     * `defaultGamePlan()` is `adaptive` at conviction 0, which by construction makes every term in
     * `policy.ts` exactly 1.0. That is not a mild plan, it is *no plan*: the same fighter attempts
     * roughly three times the submissions with no instructions as he does on his own corner's
     * reading of him, 0.75 a fight against 0.25 before the repertoire gate and the same ratio after.
     *
     * What changed is who gets handed it. `bookFight` used to create the player's booking with
     * this exact plan, so a player who tapped through the camp screen fought the whole of their
     * career unplanned; it now books `planFor`, and `tests/integration/booking-plan.test.ts` is the
     * assertion for that. The neutral plan is still correct for a fighter nobody planned for, and
     * every calibrated number in the statistical tier is still measured against it — which is
     * exactly why it must stay this quiet.
     */
    const planned = card('full', ARCHETYPES.olympicBoxer, (f, o) => planFor(f, o));
    const unplanned = card('full', ARCHETYPES.olympicBoxer, () => defaultGamePlan());
    const report = `planned ${planned.perFight.toFixed(3)}/fight against unplanned ${unplanned.perFight.toFixed(3)}/fight`;

    expect(unplanned.perFight / planned.perFight, report).toBeGreaterThan(2);
    // And the neutral plan is genuinely neutral, which is the property the tier rests on.
    expect(defaultGamePlan().tactics.conviction).toBe(0);
  });

  it('narrows the gap between the two resolvers without closing it — the remaining debt', () => {
    /*
     * **D18, half fixed, and the half that is left is not what the first measurement said it was.**
     *
     * `resolveFightByRound` built submission attempts as `SUBMISSION_FLOOR + SUBMISSION_PER_CONTROL
     * × control share × appetite`, and `SUBMISSION_FLOOR` was 0.2 per round paid by **every fighter
     * in every round**, unconditionally. The same gate Full applies at the moment of choosing is
     * now applied to that whole expression, floor included — a floor that survives the gate is a
     * floor that says a boxer hunts chokes. Per fight, against a six-man field:
     *
     * ```
     *                    Full before → after     Reduced before → after
     *   olympic boxer        0.25 → 0.01             0.76 → 0.04
     *   point karateka       0.16 → 0.03             0.89 → 0.22
     * ```
     *
     * **A correction to the original D18 report, which overstated one number.** It said ~97% of
     * Reduced fights contained a submission attempt against 13–21% at Full. That comparison was
     * not sound: Reduced writes a **fractional** `submissionAttempts` into `stats` — it is an
     * expected value, not a count of events, where Full increments an integer — so "share of
     * fights with a non-zero total" is close to 1 whenever the mean is above zero, and measures the
     * resolver's arithmetic rather than the sport. That is a real and separate finding about the
     * Reduced resolver's statistics, it is pre-existing, and it is not what this change fixes. The
     * per-fight totals were and are the sound comparison, and they were genuinely 3–6× apart.
     *
     * What is left is a ratio that still looks large on a base that is now nearly zero: Reduced
     * runs about 4× Full on the boxer, which is 0.03 attempts a fight. Doc 31 § D10's rule is that
     * the two resolvers must agree on **sign and not size**, and they now do — both say *this man
     * does not attempt submissions*. Closing the last of it means giving Reduced a position model
     * it does not have, which is D14's territory rather than this one's.
     */
    for (const [name, make] of [
      ['olympic boxer', ARCHETYPES.olympicBoxer],
      ['point karateka', ARCHETYPES.pointKarateka],
    ] as const) {
      const full = card('full', make, (f, o) => planFor(f, o));
      const reduced = card('reduced', make, (f, o) => planFor(f, o));
      const report = `${name}: full ${full.perFight.toFixed(3)}/fight, reduced ${reduced.perFight.toFixed(3)}/fight`;

      // Both resolvers now say "effectively never", which is the agreement that matters.
      expect(full.perFight, report).toBeLessThan(0.1);
      expect(reduced.perFight, report).toBeLessThan(0.35);
      // Recorded, not endorsed: Reduced is still the hotter of the two on a near-zero base.
      expect(reduced.perFight, report).toBeGreaterThan(full.perFight);
    }
  });

  it('keeps a striker off the takedowns, so the defect is specific rather than general', () => {
    /*
     * The control, and it is the reason this file is not simply "the engine ignores attributes".
     *
     * The same three terms decide whether a fighter shoots, and there the engine gets it right —
     * a 25-wrestling boxer attempts well under one takedown a fight against a six-man field. The
     * difference is `opportunity`: the takedown candidate carries `entryWeight × ENTRY_EASE ×
     * exploitFactor`, three terms that all *suppress*, and the submission candidate carries an
     * opportunity term that only ever lifts suppression. **That asymmetry is the mechanism**, and
     * it is what a fix should reach for rather than the alignment tables.
     */
    const boxer = card('full', ARCHETYPES.olympicBoxer, (f, o) => planFor(f, o));
    const wrestler = card('full', ARCHETYPES.smotherer, (f, o) => planFor(f, o));
    const report = `boxer ${boxer.takedownsPerFight.toFixed(2)}/fight against wrestler ${wrestler.takedownsPerFight.toFixed(2)}/fight`;

    expect(boxer.takedownsPerFight, report).toBeLessThan(1);
    expect(wrestler.takedownsPerFight / boxer.takedownsPerFight, report).toBeGreaterThan(5);
  });
});
