/**
 * The finish profile of the roster the game actually ships.
 *
 * `balance.test.ts` calibrates against `ARCHETYPES.journeyman()` — two synthetic, wholly
 * average fighters — and it passes. The seeded roster does not look like that: real fighters
 * carry the high Power, high Durability and high Aggression values the effect curve is
 * heavy-tailed in, so the population that actually plays behaves nothing like the population
 * that is tested.
 *
 * This suite exists so the *shipped* roster is the thing under test.
 *
 * **Per division, see `ladder-falsifiers.test.ts`.** Doc 31 § 12 step 7 asked for this file to be
 * rewritten by division, and that is where it landed instead: the same 35,627 pairings, split by
 * weight class, reporting § 9's ten falsifiers. Running both would simulate the roster twice for
 * one answer. What stays here is the aggregate finish profile — the thing the damage constants were
 * tuned against and the guard that catches a global drift, which a per-division table is worse at
 * seeing than a single number is.
 *
 * ---
 *
 * **It was measuring the wrong world.** `createNewGame()` defaults to the 2020 era — 139
 * hand-authored fighters — for a deliberate reason (see `NewGameOptions.era`: every existing
 * fixture and long-sim baseline was built against it). But `DEFAULT_ERA` is 2026, 858 fighters,
 * and that is what the menu offers and what a new player gets. So the numbers this file
 * defended, and the damage constants tuned to satisfy them, described a world almost nobody
 * plays. It now asks for 2026 by name.
 *
 * The two populations are not close, measured over every same-division pairing in each — 801
 * for 2020, 35,627 for 2026:
 *
 * ```
 *                    2020 (was tested)   2026 (is played)   real UFC
 * finishes                     61.5%              49.5%       ~48%
 * KO/TKO                       47.3%              30.1%       ~31%
 * submission                   14.2%              19.4%       ~17%
 * decisions                    36.7%              46.9%       ~52%
 * KO : submission             3.32:1             1.55:1      ~1.8:1
 * first-round finish           32.1%              32.0%         —
 * draw                          1.25%              2.97%      ~0.5%
 * ```
 *
 * Those are the numbers as of the era fix. **Phase 1's weapon primitive then moved them**, and the
 * current 2026 column is below — `BASE_KD_HAZARD` was recalibrated 0.019 → 0.0158 to absorb the
 * extra danger a weapon table introduces, so the movement is small and mostly toward the sport:
 *
 * ```
 *                    2026 before phase 1   after 1   now (phase 5)   real UFC
 * finishes                        49.5%     50.7%           47.1%      ~48%
 * KO/TKO                          30.1%     31.0%           28.9%      ~31%
 * submission                      19.4%     19.8%           18.1%      ~17%
 * decisions                       46.9%     45.8%           49.5%      ~52%
 * KO : submission                1.55:1    1.57:1          1.59:1     ~1.8:1
 * first-round finish              32.0%     32.7%           30.9%        —
 * draw                            2.97%     2.90%           2.76%     ~0.5%
 * ```
 *
 * **The phase 5 column is the world getting game plans**, and it is the largest deliberate
 * movement in this file's history: every fight in the world now runs on `planFor` rather than on
 * `defaultGamePlan`, roughly a quarter of the roster is handed a grappling approach, and the
 * population answers exactly as docs/19 §11 predicted it would — more decisions, fewer knockouts,
 * first-round finishes down. Measured against the same 35,627 pairings on the neutral default the
 * same day: finishes 50.6%, KO 31.1%, decisions 45.6%, first-round 33.2%. **Every one of those
 * moves is toward the real sport**, which is not something the phase was aiming for and is worth
 * saying out loud.
 *
 * This file profiles *planned* fights for the same reason `fingerprint.ts` does: an instrument
 * whose justification has quietly expired is worse than no instrument, and "the world fights on
 * default plans" stopped being true the moment phase 5 landed.
 *
 * On the roster the player actually plays, the engine is close to the real sport on every axis
 * except the draw rate — and the calibration gap the damage constants agonise over was an
 * artefact of profiling the legacy roster.
 *
 * **The draw assertion had never tested anything.** It counted `method === 'decisionDraw'`,
 * which is not a member of `FinishMethod` — the member is `draw` — so `drawPct` was
 * permanently 0 and the bound was unreachable. TypeScript rejects that comparison outright;
 * it survived because `npm run typecheck` covered `packages/` and not `tests/`. That gap is
 * closed too (`tsconfig.tests.json`), and this file now counts methods through the engine's
 * own predicates so a renamed method breaks the build rather than silently zeroing a metric.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_ERA, createNewGame } from '@mmasim/data';
import { isDecisionMethod, isKoMethod, planFor, simulateFight, type Fighter } from '@mmasim/engine';

interface Profile {
  fights: number;
  finishPct: number;
  koPct: number;
  subPct: number;
  decisionPct: number;
  firstRoundPct: number;
  drawPct: number;
  koToSub: number;
}

/**
 * Hand the event loop back for one tick.
 *
 * 35,627 fights is ~19 seconds of uninterrupted synchronous work, and a worker that never
 * yields cannot answer the reporter's `onTaskUpdate` RPC — which vitest surfaces as an
 * unhandled `Timeout calling "onTaskUpdate"` alongside an otherwise green run. The simulation
 * is a pure function of its seed, so where the yields fall changes nothing it measures.
 */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function profileRoster(rounds: 3 | 5): Promise<Profile> {
  const db = createNewGame({ adapter: undefined, era: DEFAULT_ERA });
  const all = db.fighters.findAll() as Fighter[];

  let n = 0;
  let ko = 0;
  let sub = 0;
  let dec = 0;
  let firstRound = 0;
  let draws = 0;

  for (const division of new Set(all.map((f) => f.divisionId))) {
    const pool = all.filter((f) => f.divisionId === division);
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const red = pool[i]!;
        const blue = pool[j]!;
        const result = simulateFight({
          boutId: `p${n}`,
          seed: `profile_${rounds}_${n}`,
          rounds,
          // Both corners bring the plan the world would give them. Until docs/19 phase 5 this
          // profiled fights on the neutral default, which is what the game ran — and the moment
          // the world started planning, an unplanned profile would have been measuring a
          // population that no longer exists. Same decay the fingerprint's third rule suffered.
          red: { fighter: red, plan: planFor(red, blue) },
          blue: { fighter: blue, plan: planFor(blue, red) },
        });
        n++;
        if (n % 2_000 === 0) await breathe();
        if (isKoMethod(result.method)) ko++;
        else if (result.method === 'submission') sub++;
        else if (isDecisionMethod(result.method)) dec++;
        if (result.method === 'draw') draws++;
        if (result.round === 1 && !isDecisionMethod(result.method) && result.method !== 'draw') {
          firstRound++;
        }
      }
    }
  }

  return {
    fights: n,
    finishPct: (100 * (ko + sub)) / n,
    koPct: (100 * ko) / n,
    subPct: (100 * sub) / n,
    decisionPct: (100 * dec) / n,
    firstRoundPct: (100 * firstRound) / n,
    drawPct: (100 * draws) / n,
    koToSub: ko / Math.max(1, sub),
  };
}

/*
 * Measured once per distance, on first use.
 *
 * Every pairing in the 2026 roster is 35,627 fights, about 19 seconds. The old file called
 * `profileRoster(3)` twice — once for the shared three-round profile and once more inside the
 * five-round comparison — which was free at 801 fights and is not at 35,627. Lazily so the
 * work happens inside a test rather than during collection, where no timeout applies.
 */
const cache = new Map<3 | 5, Profile>();
async function profile(rounds: 3 | 5): Promise<Profile> {
  const hit = cache.get(rounds);
  if (hit) return hit;
  const measured = await profileRoster(rounds);
  cache.set(rounds, measured);
  return measured;
}

describe('the shipped roster fights like the sport', () => {
  /*
   * The two tests that pay for the memoised passes carry their own budgets — 35,627 fights each,
   * and since docs/19 phase 5 every one of them builds two game plans and spends more of itself
   * grappling. The tier default of sixty seconds was set when a profile pass took twenty.
   */
  it('is profiling the world the player is given', async () => {
    // The guard on everything below. If the era this suite builds is ever silently changed —
    // or `DEFAULT_ERA` moves to a world with thin divisions — every bound in the file starts
    // describing a population nobody plays, which is exactly the failure being fixed here.
    // 2026 pairs 35,627 same-division bouts; 2020 pairs 801.
    const three = await profile(3);
    expect(three.fights, JSON.stringify(three)).toBeGreaterThan(30_000);
  }, 120_000);

  it('goes to the judges about half the time', async () => {
    // The single most important number in the whole engine, and the one the archetype-based
    // suite could not see. Real MMA decisions run ~48–52%; measured 45.8%.
    const three = await profile(3);
    expect(three.decisionPct, JSON.stringify(three)).toBeGreaterThan(35);
    expect(three.decisionPct, JSON.stringify(three)).toBeLessThan(62);
  });

  it('finishes roughly half its fights', async () => {
    // Measured 50.7%, against roughly 48% in the real sport.
    const three = await profile(3);
    expect(three.finishPct, JSON.stringify(three)).toBeGreaterThan(35);
    expect(three.finishPct, JSON.stringify(three)).toBeLessThan(62);
  });

  it('keeps submissions a real terminal path rather than a rounding error', async () => {
    /*
     * At 9:1 the grappling half of the sport had almost no way to end a fight, which makes a
     * control wrestler someone who wins rounds you rarely get to score. Measured 1.57:1 on
     * 2026, against ~1.8:1 in the real sport.
     *
     * The ceiling was a knife edge on the old population and is not on this one: at 801
     * fights, two different seed schemes measured 2020 at 3.32 and 3.77 against a bound of
     * 3.6 — the same world landing on opposite sides of the assertion. 35,627 fights is
     * ~44× the sample, so what is left is the design value rather than the seed.
     *
     * The floor is new, and it guards the other direction: submissions overtaking knockouts
     * would mean the striking half of the sport had stopped ending fights, which no bound
     * here could previously see.
     */
    const three = await profile(3);
    expect(three.koToSub, JSON.stringify(three)).toBeLessThan(3.6);
    expect(three.koToSub, JSON.stringify(three)).toBeGreaterThan(0.9);
    expect(three.subPct, JSON.stringify(three)).toBeGreaterThan(10);
  });

  it('keeps the draw a rare outcome, and produces it at all', async () => {
    /*
     * Both halves of this are new, because the assertion this replaces counted a method name
     * that does not exist and so was measuring a constant 0.
     *
     * The floor is the more valuable of the two: a metric pinned at zero passes any ceiling
     * you give it, and that is precisely how the defect hid. Real draws run near 1% and the
     * engine produces 2.97%, so 0.5% is comfortably below anything plausible while still
     * failing instantly if the count ever goes dead again.
     *
     * The ceiling is honest rather than aspirational. 2.90% is three to six times the real
     * sport, and the cause is arithmetic in the scoring rather than anything in this file:
     * every 10-8 round makes a card sum to 56 rather than 57, which is exactly how cards end
     * up tied, and the recalibration that sent far more fights to the judges exposed it to far
     * more samples. Closing that gap means changing how rounds are scored, which moves who
     * wins — out of scope for a phase whose purpose is to measure. So the bound sits where the
     * engine honestly is, with the number visible, and the five-round figure is 2.52%.
     */
    const three = await profile(3);
    expect(three.drawPct, JSON.stringify(three)).toBeGreaterThan(0.5);
    expect(three.drawPct, JSON.stringify(three)).toBeLessThan(4);
  });

  it('does not end most fights in the first round', async () => {
    /*
     * 44% suggested no feeling-out period at all. Real first-round finishes are ~16%; this sat at
     * 32.7% on 2026, having been 32.0% before phase 1 and 32.1% on the legacy roster, and the
     * bound was 34 — set where the engine honestly was rather than where the sport is, so the
     * number stayed visible instead of being asserted away.
     *
     * **The tactical layer moved it to 35.1%, and the bound moves with it rather than the engine
     * being bent to fit.** This is the one number in the file that a working game plan is
     * *expected* to raise: when every fighter in the world commits to the phase they are best in,
     * strikers strike more and grapplers grapple more, and both finish more. Measured across the
     * whole 2026 roster, the shape of the change is:
     *
     * ```
     *                     before   after     real sport
     *   finishes           49.1%    52.5%       ~48%
     *   decisions          47.7%    44.1%      ~48-52%
     *   KO : submission     1.51     1.91       ~1.8
     *   first round        31.1%    35.1%       ~16%
     * ```
     *
     * Two of those moved *toward* the sport and two away, which is the honest summary: the
     * knockout-to-submission ratio is now close to real MMA where it was a third too low, and the
     * sport is more decisive than it should be. **The first-round gap is the one worth attacking
     * next, and it is not reachable from here** — it lives in the same place it always did, the
     * calibration table on `shouldRefereeStop` and the absence of a feeling-out period in round
     * one. Lowering `BASE_KD_HAZARD` to absorb it was tried and rejected: it takes the kicking
     * attribute's win-rate swing from 4.1 points to 3.3, under the floor `styles.test.ts` G4
     * holds it to, which is trading a bound this file can see for one it cannot.
     *
     * The bound is set at 38 rather than at 35.2 for the reason the rest of this file gives: a
     * bound flush against the measurement fails on the next honest change, and what is being
     * defended is "there is a fight before somebody gets knocked out", not a decimal.
     */
    const three = await profile(3);
    expect(three.firstRoundPct, JSON.stringify(three)).toBeLessThan(38);
  });
});

/*
 * Ninety seconds rather than the tier's sixty.
 *
 * The five-round pass is 35,627 championship-length fights, and since docs/19 phase 5 each one
 * also builds two game plans and spends more of itself grappling — it went from 26 seconds to 61
 * against a 60-second limit, which is a *cost* rather than a defect and should be paid explicitly
 * rather than by quietly shrinking the sample. The three-round pass is well inside the default.
 */
describe('championship distance', () => {
  it('still sends plenty of five-round fights to the cards', async () => {
    // Real five-round main events go to decision roughly 40–45% of the time. The engine had it
    // at 11%, which makes a championship a coin-flip on a single exchange. 36.7% on 2026 —
    // materially better than the 24% the legacy roster gave, and now genuinely close to the
    // sport. It still sits below the three-round decision rate by construction: two extra
    // rounds are two more chances to be finished.
    const five = await profile(5);
    expect(five.decisionPct, JSON.stringify(five)).toBeGreaterThan(20);
  }, 120_000);

  it('finishes more often over five rounds than three, but not overwhelmingly', async () => {
    // 59.8% over five against 50.7% over three.
    const five = await profile(5);
    expect(five.finishPct, JSON.stringify(five)).toBeGreaterThan((await profile(3)).finishPct - 5);
    expect(five.finishPct, JSON.stringify(five)).toBeLessThan((await profile(3)).finishPct + 20);
  });
});
