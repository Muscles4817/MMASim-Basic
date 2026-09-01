/**
 * Does the sport replace its own people?
 *
 * It did not. `replenish` exists and is called every quarter, but it topped each division up to
 * **9 fighters for men and 6 for women** — counted across *every promotion in the sport*. A
 * division holding seventy-odd fighters at the start of a save therefore had to lose sixty of
 * them before a single replacement was generated.
 *
 * Measured over ten simulated years before this: the active roster fell from 858 to 232, light
 * heavyweight from 74 to 19, fighters rated 70 or better from 48 to 12, and the intake produced
 * **one fighter in the entire decade**. Every downstream symptom followed — thin divisions,
 * repeated matchups, and a top five whose average ability fell year on year because the good
 * fighters aged out and nobody arrived behind them.
 *
 * Three separate faults were stacked on top of each other, and each one hid the next:
 *
 *  1. the target, so the intake essentially never ran;
 *  2. uniform promotion placement, so debutants were as likely to start at the biggest promotion
 *     in the sport as at a regional feeder;
 *  3. and — the one that survived fixing the first two — `replenish` created fighters with **no
 *     gym and no head coach**, and nothing ever gave them one, so every fighter generated during
 *     a save trained at roughly a quarter speed for their entire career. After ten years there
 *     were 327 of them alive, the best carrying a potential of 88, and not one had reached a
 *     rating of 70.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { advanceWorld } from '../../packages/app/src/game/world';
import { DIVISIONS, overallRating, type Fighter, type Gym } from '@mmasim/engine';

const YEAR = 365;
const START = 2192;

/** Ten years of world, which is where the collapse used to be unmistakable. */
const decade = (start = START) => {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const player = (db.fighters.findAll() as Fighter[])[0]!;
  const before = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);

  for (let year = 0; year < 10; year++) {
    advanceWorld(db, start + year * YEAR, start + (year + 1) * YEAR, player.id);
  }

  const after = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
  return { db, before, after };
};

describe('the sport replaces its own people', () => {
  const { db, before, after } = decade();

  it('still has a roster after ten years', () => {
    // 858 → 232 before. A world that loses three-quarters of its fighters is not a sport.
    expect(
      after.length,
      `roster went ${before.length} → ${after.length}`,
    ).toBeGreaterThan(before.length * 0.6);
  });

  it('actually generates people rather than waiting for a division to empty', () => {
    const generated = after.filter((f) => (f.id as string).startsWith('gen_'));
    // One in the entire decade before this.
    expect(generated.length, 'the intake barely ran').toBeGreaterThan(100);
  });

  it('keeps every division deep enough to make cards without endless rematches', () => {
    const divisions = new Map<string, number>();
    for (const f of after) {
      const key = f.divisionId as string;
      divisions.set(key, (divisions.get(key) ?? 0) + 1);
    }

    for (const [division, count] of divisions) {
      expect(count, `${division} has ${count} active fighters`).toBeGreaterThan(12);
    }
  });

  it('starts debutants at the bottom of the sport rather than the top', async () => {
    /*
     * Uniform `rng.pick` made a 21-year-old with four amateur fights as likely to début at the
     * biggest promotion in the sport as at a regional one — which fills the top with people who
     * have not earned a place and leaves the feeders, whose entire function is to produce the
     * next generation, empty.
     */
    const promotions = new Map(
      (db.promotions.findAll() as unknown as { id: string; prestige: number }[]).map((p) => [
        p.id,
        p.prestige,
      ]),
    );

    const isDebutant = (f: Fighter) =>
      (f.id as string).startsWith('gen_') && f.record.length === 0 && !!f.promotionId;
    const debutants = after.filter(isDebutant);
    if (debutants.length < 10) return; // Too few to say anything; the counts above cover it.

    /*
     * The *leader* specifically, rather than "a major".
     *
     * Where a debutant ends up is not only where they were placed — free agency moves people
     * between promotions, and a fighter generated at a feeder being picked up by a mid-tier
     * promotion before their first bout is ordinary. What must not happen is somebody appearing
     * on the roster of the biggest promotion in the sport without having fought at all.
     */
    /*
     * **Pooled over four decades, and against the uniform rate rather than a round number.**
     *
     * This assertion used to read one decade against `< 0.1`, and it could not support that.
     * There are eight promotions, so *uniform* placement — the defect being defended against —
     * puts 12.5% of debutants on the leader's roster, and a single decade produces only 17 to 39
     * debutants. Measured across six nearby start days on the code this bound was written for,
     * the ratio ran 0.059, 0.115, 0.087, 0.128, 0.083, 0.077: **three of the six breach the
     * bound.** It passed on the one start day the file happens to use, and any change anywhere in
     * the engine that reshuffled the decade's fights had an even chance of tripping it — which is
     * a tripwire attached to the seed rather than to the sport.
     *
     * **Eight decades**, and the count went up because four was not enough either. Four pooled
     * gave 11/105 = 0.105 against a uniform 0.125 — a pass, but by a margin thinner than the
     * quantity it was measuring, and the failure mode showed up the first time an engine change
     * reshuffled the decades: the same 11 fighters against a denominator that had dropped to 89,
     * which reads 0.124 and breaches. The numerator never moved. A ratio whose verdict turns on
     * how many debutants a draw happened to produce is not measuring placement.
     *
     * Eight gives 191 debutants and a real signal: 13/191 = 0.068, against 0.125 for uniform.
     * Placement is weighted to roughly half the uniform rate, which is a claim worth asserting and
     * was invisible at either smaller pool. `arrival.ts` is where the weighting lives if the sport
     * ever wants debutants further from the top than they currently land.
     *
     * **A division only one promotion runs is not a placement decision, and is excluded.** Doc 31
     * § 23.7. This assertion went red after doc 31 § 12 step 9 — 21 of 149 against a bound of
     * 0.115 — and the weighting turned out to be working exactly as designed. Measured by
     * division: **women's featherweight is run by a single promotion, the leader**, so every
     * fighter who turns professional at 145 lb is on the leader's roster by arithmetic rather than
     * by being signed early. Seven of the twelve top placements across four decades were that one
     * division. Strip it out and the remainder read 5 of 69, in line with the 0.068 this bound was
     * written against.
     *
     * Step 9 did not break placement; it changed the *intake mix*, and this ratio was quietly
     * measuring division coverage alongside the thing it meant to measure. Excluding the divisions
     * with no choice in them is what makes it measure placement — and if the sport ever wants
     * women's featherweight to have somewhere else to debut, that is a promotion-roster question
     * rather than an intake-weighting one.
     */
    const leaderPrestige = Math.max(...promotions.values());
    const contested = new Set(
      DIVISIONS.map((d) => d.id as string).filter(
        (id) =>
          (db.promotions.findAll() as unknown as { divisions: string[] }[]).filter((p) =>
            p.divisions.includes(id),
          ).length > 1,
      ),
    );
    const atTheTop = (fighters: readonly Fighter[]) =>
      fighters.filter((f) => (promotions.get(f.promotionId as string) ?? 0) >= leaderPrestige);

    const contestedOnly = (fs: readonly Fighter[]) =>
      fs.filter((f) => contested.has(f.divisionId as string));

    let top = atTheTop(contestedOnly(debutants)).length;
    let total = contestedOnly(debutants).length;
    const prestigeSeen: number[] = contestedOnly(debutants).map(
      (f) => promotions.get(f.promotionId as string) ?? 0,
    );
    for (const start of [START + 1, START + 2, START + 3, START + 4, START + 5, START + 6, START + 7]) {
      // Eight decades is over a minute of solid synchronous work, and a worker that never yields
      // starves Vitest's own reporter heartbeat — which surfaces as an unhandled `onTaskUpdate`
      // timeout and a run that says it caught an error while every assertion passed.
      await new Promise((resolve) => setImmediate(resolve));
      const run = decade(start);
      const more = contestedOnly(run.after.filter(isDebutant));
      const prestigeOf = (f: Fighter) =>
        (run.db.promotions.findById(f.promotionId as string) as unknown as { prestige: number })
          .prestige;
      top += more.filter((f) => prestigeOf(f) >= leaderPrestige).length;
      total += more.length;
      prestigeSeen.push(...more.map(prestigeOf));
    }

    const uniform = 1 / promotions.size;
    expect(
      top / total,
      `${top} of ${total} winless fighters sit on the leader's roster, against ${uniform.toFixed(3)} for uniform placement`,
    ).toBeLessThan(uniform * 0.92);

    /*
     * And as a population, debutants must sit below the sport's midpoint on prestige.
     *
     * **Pooled over the same eight decades as the ratio above, and over the same contested
     * divisions.** It read a single decade until doc 31 § 23.7, which is a median over about
     * twelve fighters — the sixth value of twelve decides it — and the long comment above already
     * explains at length why one decade cannot support a claim about placement. It survived that
     * long because nothing had reshuffled the first decade's draw; step 9 did.
     */
    const prestiges = [...promotions.values()].sort((a, b) => a - b);
    const midpoint = prestiges[Math.floor(prestiges.length / 2)]!;
    const sorted = [...prestigeSeen].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    expect(
      median,
      `debutants sit at median prestige ${median} over ${sorted.length} placements, sport midpoint ${midpoint}`,
    ).toBeLessThan(midpoint + 1);
  });

  it('gives every generated fighter a gym to train in', () => {
    /*
     * The fault that survived fixing the other two, and the most consequential: no gym means the
     * no-gym default of quality 40 and no head coach, which is a development multiplier of about
     * 0.4 against roughly 1.9 in a good room. A quarter speed, for an entire career.
     */
    const generated = after.filter((f) => (f.id as string).startsWith('gen_'));
    const homeless = generated.filter((f) => !f.gymId);
    expect(
      homeless.length,
      `${homeless.length} of ${generated.length} generated fighters have no gym`,
    ).toBe(0);
  });

  it('points those gyms at real rooms with real coaches', () => {
    const gyms = new Map(
      (db.gyms.findAll() as unknown as Gym[]).map((g) => [g.id as string, g]),
    );
    for (const f of after.filter((x) => (x.id as string).startsWith('gen_'))) {
      const gym = gyms.get(f.gymId as string);
      expect(gym, `${f.firstName} ${f.lastName} points at a gym that does not exist`).toBeDefined();
      // The coach has to match the room, or joining it later would silently change nothing.
      if (gym?.headCoachId) expect(f.headCoachId).toBe(gym.headCoachId);
    }
  });

  it('lets a generated fighter actually develop toward their ceiling', () => {
    /*
     * The measurement that exposed the missing gym. Prospects were arriving with genuine
     * potential and going nowhere: 327 alive, best potential 88, best *rating* 67, none at 70.
     */
    const grown = after.filter(
      (f) => (f.id as string).startsWith('gen_') && f.record.length >= 4,
    );
    if (grown.length === 0) return;

    const best = Math.max(...grown.map((f) => overallRating(f.attributes)));
    expect(best, `the best developed newcomer is rated ${Math.round(best)}`).toBeGreaterThan(68);
  });

  it('keeps a recognisable elite at the top of the sport', () => {
    // Not that the sport never ages — it should — but that there is always somebody worth
    // watching at the top of it.
    const ratings = after.map((f) => overallRating(f.attributes)).sort((a, b) => b - a);
    const top20 = ratings.slice(0, 20).reduce((a, b) => a + b, 0) / 20;

    expect(ratings[0], `best fighter is rated ${Math.round(ratings[0] ?? 0)}`).toBeGreaterThan(74);
    expect(top20, `top twenty average ${top20.toFixed(1)}`).toBeGreaterThan(65);
  });
});
