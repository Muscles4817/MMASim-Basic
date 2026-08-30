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
import { createCombatant } from '../../packages/engine/src/fight/profile.js';
import { stanceOf, submissionOpportunity } from '../../packages/engine/src/fight/policy.js';
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

describe('repertoire gates choice — the submission', () => {
  it('is decided by the wrong pair of attributes — the debt', () => {
    /*
     * **The sharpest single statement of the defect, and the one that survives every plan.**
     *
     * The bottom in-state list is two candidates: a submission whose capability is
     * `effect(submissions)`, and a `defend` whose capability is `effect(scrambling)`. A weighted
     * draw is a softmax over the log of those, so the share is a function of the *gap between the
     * two ratings* and of nothing else about the fighter. `submissions` has no absolute reading at
     * the point of choosing at all.
     *
     * Held at one plan, varying only the two attributes:
     *
     * ```
     *                     scrambling 30   scrambling 60   scrambling 90
     *   submissions 30            17.0%            9.1%            4.6%
     *   submissions 50            28.0%           15.9%            8.4%
     *   submissions 70            43.0%           26.8%           15.1%
     *   submissions 90            60.7%              —            26.8%
     * ```
     *
     * Read the diagonal. **A fighter with `submissions: 70` attempts fewer submissions than one
     * with `submissions: 30`**, provided he is the better scrambler — and `submissions: 90` with
     * `scrambling: 90` lands on exactly the same 26.8% as `submissions: 70` with `scrambling: 60`.
     * Two fighters eighty points apart on the rating that names the action choose it equally often.
     *
     * This is why the Olympic boxer hunts chokes and why no instruction stops him. His
     * `scrambling: 48` is not a hole — getting up is the first grappling skill a converted boxer
     * trains, and it is the whole of "always looks to get back up" — so the gap that decides his
     * submission rate is 12 against 48 rather than 12 against nothing, and the engine reads a
     * modest gap where the truth is a categorical absence.
     *
     * **The bound fails if the inversion widens. Removing it is the work, and removing it will
     * fail this test on purpose.**
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

    // Recorded, not endorsed: 17.0% against 15.1%. The rating that names the action loses to the
    // rating it happens to be compared with.
    expect(weakGrappler, report).toBeGreaterThan(goodSubmitter);

    // And the same reading from the other side: eighty points of `submissions` bought by eighty
    // points of `scrambling` is worth nothing at all.
    const a = controlled(70, 60);
    const b = controlled(90, 90);
    expect(Math.abs(a - b), `70/60 → ${a.toFixed(1)}%, 90/90 → ${b.toFixed(1)}%`).toBeLessThan(1);
  });

  it('is nonetheless ordered by the rating across the shipped cast', () => {
    /*
     * The half that holds, and it has to be asserted or the fix could break it: within the cast the
     * engine actually ships, the ordering is broadly right — the boxer is at the bottom and the
     * guard player at the top. The inversion above needs contrived fixtures to expose because real
     * fighters' `submissions` and `scrambling` are correlated. That is luck rather than design, and
     * this assertion is what stops the fix trading the ordering away for the floor.
     */
    const measured = CAST.map(([name, make]) => {
      const f = make();
      return { name, subs: f.attributes.submissions, ...submissionShares(f, STAY_STANDING) };
    });
    const report = measured.map((m) => `${m.name} (${m.subs}) ${m.bottom.toFixed(1)}%`).join(', ');

    const boxer = measured.find((m) => m.name === 'olympic boxer')!;
    const specialist = measured.find((m) => m.name === 'guard player')!;
    expect(boxer.bottom, report).toBe(Math.min(...measured.map((m) => m.bottom)));
    expect(specialist.bottom, report).toBe(Math.max(...measured.map((m) => m.bottom)));

    /*
     * Except here, and it is the same inversion in the shipped roster rather than a contrived one:
     * the grinder's `submissions: 62` reaches for a submission less often than the journeyman's
     * `submissions: 50`, because the grinder's `scrambling: 80` argues against it.
     */
    const grinder = measured.find((m) => m.name === 'grinder')!;
    const journeyman = measured.find((m) => m.name === 'journeyman')!;
    expect(grinder.bottom, report).toBeLessThan(journeyman.bottom);
  });

  it('never falls to nothing, however low the rating and however firm the plan — the debt', () => {
    /*
     * **The floor, measured.** A fighter with `submissions: 12` — near the bottom of a 1–100
     * scale, a quarter of an average fighter's — told as plainly as the vocabulary allows to stay
     * on his feet and give nothing away, still spends this share of his beats hunting a submission:
     *
     * ```
     *   bottomIntent: defend    bottom 3.9%   top 2.3%
     *   bottomIntent: recover   bottom 1.3%
     * ```
     *
     * Nothing reaches zero, because none of the three terms is *about* whether a submission is in
     * his game. `defend`'s capability is his `scrambling`, so the plan argues against a hill it
     * cannot clear, and `submissionOpportunity` — the only term that reads the position — can only
     * ever *lift* the suppression, never deepen it.
     *
     * These are shares of *beats*, so they are small numbers with a long reach: the card-level
     * assertions below are what they add up to.
     *
     * The bounds are the measurement plus headroom rather than a target. **They fail if the floor
     * rises. Lowering it is the work, and lowering it will fail this test on purpose.**
     */
    const boxer = ARCHETYPES.olympicBoxer();
    const defend = submissionShares(boxer, STAY_STANDING);
    const recover = submissionShares(boxer, STAY_STANDING_RECOVER);
    const report =
      `defend: bottom ${defend.bottom.toFixed(1)}% top ${defend.top.toFixed(1)}%, ` +
      `recover: bottom ${recover.bottom.toFixed(1)}%`;

    // Recorded, not endorsed. A former Olympic boxer should be at or near zero on all three.
    expect(defend.bottom, report).toBeGreaterThan(2);
    expect(defend.bottom, report).toBeLessThan(6);
    expect(defend.top, report).toBeGreaterThan(1);
    expect(defend.top, report).toBeLessThan(4);
    // The quietest instruction in the vocabulary still cannot switch it off.
    expect(recover.bottom, report).toBeGreaterThan(0.8);
  });

  it('separates a specialist from a man who merely has the attribute — the debt', () => {
    /*
     * The claim `southpawSniper` exists for, and the version of the rule the alignment tables
     * cannot reach.
     *
     * A `submissions: 40` striker has an *ordinary* rating and it is still not his game: he does
     * not reach for a choke because a position happened to offer one. A `submissions: 92` guard
     * player does nothing else. Under the same stay-standing instruction the engine separates them
     * by **2.8:1**, when the honest answer is a category difference — and 2.8:1 read the other way
     * puts the striker at better than a third of a world-class specialist's rate.
     */
    const sniper = submissionShares(ARCHETYPES.southpawSniper(), STAY_STANDING);
    const specialist = submissionShares(ARCHETYPES.guardPlayer(), STAY_STANDING);
    const ratio = specialist.bottom / sniper.bottom;
    const report = `sniper ${sniper.bottom.toFixed(1)}% against specialist ${specialist.bottom.toFixed(1)}% — ${ratio.toFixed(1)}:1`;

    // Recorded, not endorsed: 2.8:1. It fails if the separation narrows; widening it is the work.
    expect(ratio, report).toBeGreaterThan(2);
    expect(ratio, report).toBeLessThan(6);
  });

  it('is something the corner can move, which is the half that works', () => {
    /*
     * The plan is not decorative here and it is important to say so, because the fix must not be
     * "turn the intent up". Against the same fighter, `attack` and `recover` are a real spread —
     * the tactical layer is doing its job. It is simply arguing on the wrong axis: no amount of
     * instruction can express *this technique is not in his repertoire*, because instruction is
     * about what a fighter wants and repertoire is about what he has.
     */
    const boxer = ARCHETYPES.olympicBoxer();
    const attack = submissionShares(
      boxer,
      plan({ preferredState: 'submission', bottomIntent: 'attack' }),
    );
    const recover = submissionShares(boxer, STAY_STANDING_RECOVER);
    const report = `attack ${attack.bottom.toFixed(1)}% against recover ${recover.bottom.toFixed(1)}%`;

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

  it('tells a man who cannot submit anybody to hunt submissions — the debt', () => {
    /*
     * **`pickTopIntent`'s first line, and it is the clearest single defect in this file.**
     *
     * ```ts
     *   if (a.submissions > a.groundControl + 2) return 'submit';
     * ```
     *
     * A relative read with no floor under it. It asks *which of your two ground ratings is the
     * better one*, and hands `submit` — "expose yourself to attack the finish" — to anybody whose
     * answer is `submissions`, **including a striker who dumped points out of both**:
     *
     * ```
     *   submissions 20, groundControl 15   →   submit
     *   submissions 30, groundControl 25   →   submit
     *   submissions 45, groundControl 30   →   submit
     *   submissions 12, groundControl 22   →   control   (only because he is even worse at it)
     * ```
     *
     * The comment on that line records why the absolute bar was removed — `submissions > 68` was
     * rare enough that almost everybody got `control`, and the sport's submission rate fell from
     * 19.6% to 16.1%. That diagnosis was right and the remedy reached for the wrong lever: it
     * raised the sport's submission rate by handing the *instruction* to people who should never
     * receive it, rather than by letting genuine specialists hunt harder. A fighter with 20
     * submissions being told to attack the finish is a worse fighter than one told to hold
     * position, so this is not only a legibility problem — it is a plan that loses fights.
     *
     * **Fixing it will fail this test on purpose**, and it will move the sport's finish mix, which
     * is why `roster-profile.test.ts` and `balance.test.ts` are the other half of the change.
     */
    const cases: readonly (readonly [number, number])[] = [
      [20, 15],
      [30, 25],
      [45, 30],
    ];
    const got = cases.map(
      ([s, g]) => `${s}/${g} → ${planFor(strikerWith(s, g), FOE).tactics.topIntent}`,
    );

    for (const [s, g] of cases) {
      expect(planFor(strikerWith(s, g), FOE).tactics.topIntent, got.join(', ')).toBe('submit');
    }
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
  it('leaves a striker attempting several submissions a career — the debt', () => {
    /*
     * The number the report was actually about, and the reason a 7% share matters: it is a share
     * of *beats*, and a career is a great many beats. Measured over 720 fights apiece against a
     * six-man field, at Full detail:
     *
     * ```
     *                     AI plan   no plan set
     *   olympic boxer        0.25          0.75
     *   point karateka       0.16          1.05
     *   southpaw sniper      0.26          0.66
     * ```
     *
     * A twenty-fight career is five submission attempts for a man with `submissions: 12` on the
     * planner's own instructions, and fifteen for one whose player never opened the game-plan
     * screen. Each of them is narrated in the play-by-play, which is why the player sees it long
     * before any statistic would show it.
     */
    const boxer = card('full', ARCHETYPES.olympicBoxer, (f, o) => planFor(f, o));
    const karateka = card('full', ARCHETYPES.pointKarateka, (f, o) => planFor(f, o));
    const report = `boxer ${boxer.perFight.toFixed(2)}/fight, karateka ${karateka.perFight.toFixed(2)}/fight`;

    // Recorded, not endorsed. Both should round to roughly nothing.
    expect(boxer.perFight, report).toBeGreaterThan(0.1);
    expect(boxer.perFight, report).toBeLessThan(0.45);
    expect(karateka.perFight, report).toBeLessThan(0.35);
  });

  it('punishes the player who never opened the game-plan screen — the debt', () => {
    /*
     * **The finding with the shortest route to a fix, and it is not in the engine.**
     *
     * A new booking is created with `defaultGamePlan()` (`packages/app/src/game/career.ts`), which
     * is `adaptive` at conviction 0 — by construction, *every policy term is exactly 1.0*. That is
     * the correct neutral for a fighter nobody planned for, and it is the wrong default for the
     * player's own fighter, because the game-plan screen is the only place the intent to stay
     * standing can be expressed. A player who books a fight and taps through gets a striker who
     * behaves like a man with no instructions.
     *
     * Measured, it is the single largest term in the complaint: **three times** the submission
     * attempts of the same fighter on the planner's own reading of him, and the planner is not
     * even trying to keep him off the floor.
     *
     * The engine is behaving correctly here. The defect is that the default is neutral rather than
     * the corner's honest reading of the fighter — `planFor` is right there, is deterministic, and
     * is already what every other fighter in the world gets.
     */
    const planned = card('full', ARCHETYPES.olympicBoxer, (f, o) => planFor(f, o));
    const unplanned = card('full', ARCHETYPES.olympicBoxer, () => defaultGamePlan());
    const report = `planned ${planned.perFight.toFixed(2)}/fight against unplanned ${unplanned.perFight.toFixed(2)}/fight`;

    expect(unplanned.perFight / planned.perFight, report).toBeGreaterThan(2);
  });

  it('has the two resolvers disagreeing about who attempts submissions at all — the debt', () => {
    /*
     * **Invariant 6 says Full is the reference, and here Reduced is describing a different sport.**
     *
     * `resolveFightByRound` builds submission attempts as
     *
     * ```
     *   SUBMISSION_FLOOR + SUBMISSION_PER_CONTROL × control share × appetite   (× a backTake term)
     * ```
     *
     * and `SUBMISSION_FLOOR` is **0.2 per round, unconditional** — paid by every fighter in every
     * round regardless of control time, position, plan, or whether he has ever attempted a
     * submission in his life. Over three rounds that is 0.6 attempts before anything about the
     * fighter is consulted, and the jitter around it rounds up often enough that **essentially
     * every fighter in a Reduced world attempts at least one submission in essentially every
     * fight**:
     *
     * ```
     *                    Full: per fight / % of fights     Reduced: per fight / % of fights
     *   olympic boxer         0.25   18.4%                     0.76   96.8%
     *   point karateka        0.16   12.8%                     0.89   97.7%
     *   journeyman            0.32   20.8%                     1.28   99.9%
     * ```
     *
     * The only rating-sensitive term in the whole expression is `tendencies.backTake`, which
     * spans about 1.5:1 between a 12-submissions boxer and a 92-submissions specialist. The
     * comment above the constants argues that attempts are bought with position and the rating
     * buys conversion, and that is right about *position* and silent about *identity*: it explains
     * why a guard player attempts fewer than a smotherer, and not why a boxer attempts any.
     *
     * This matters beyond the resolver's own fidelity, because **the world's entire pre-history is
     * simulated at Reduced detail** (`newWorld.ts`), so every record the player is matched against
     * was built in this sport rather than the one they are shown.
     */
    for (const [name, make] of [
      ['olympic boxer', ARCHETYPES.olympicBoxer],
      ['point karateka', ARCHETYPES.pointKarateka],
    ] as const) {
      const full = card('full', make, (f, o) => planFor(f, o));
      const reduced = card('reduced', make, (f, o) => planFor(f, o));
      const report =
        `${name}: full ${full.perFight.toFixed(2)}/fight in ${(full.shareOfFights * 100).toFixed(1)}% of fights, ` +
        `reduced ${reduced.perFight.toFixed(2)}/fight in ${(reduced.shareOfFights * 100).toFixed(1)}% of fights`;

      // Recorded, not endorsed: Reduced runs 3–6× hotter and puts an attempt in almost every fight.
      expect(reduced.perFight / full.perFight, report).toBeGreaterThan(2);
      expect(reduced.shareOfFights, report).toBeGreaterThan(0.9);
      // The bound that fails if it gets worse.
      expect(reduced.perFight / full.perFight, report).toBeLessThan(8);
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
