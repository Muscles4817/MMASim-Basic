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
import { overallRating, type Fighter, type Gym } from '@mmasim/engine';

const YEAR = 365;
const START = 2192;

/** Ten years of world, which is where the collapse used to be unmistakable. */
const decade = () => {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const player = (db.fighters.findAll() as Fighter[])[0]!;
  const before = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);

  for (let year = 0; year < 10; year++) {
    advanceWorld(db, START + year * YEAR, START + (year + 1) * YEAR, player.id);
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

  it('starts debutants at the bottom of the sport rather than the top', () => {
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

    const debutants = after.filter(
      (f) => (f.id as string).startsWith('gen_') && f.record.length === 0 && f.promotionId,
    );
    if (debutants.length < 10) return; // Too few to say anything; the counts above cover it.

    /*
     * The *leader* specifically, rather than "a major".
     *
     * Where a debutant ends up is not only where they were placed — free agency moves people
     * between promotions, and a fighter generated at a feeder being picked up by a mid-tier
     * promotion before their first bout is ordinary. What must not happen is somebody appearing
     * on the roster of the biggest promotion in the sport without having fought at all.
     */
    const leaderPrestige = Math.max(...promotions.values());
    const atTheVeryTop = debutants.filter(
      (f) => (promotions.get(f.promotionId as string) ?? 0) >= leaderPrestige,
    );
    expect(
      atTheVeryTop.length / debutants.length,
      `${atTheVeryTop.length} of ${debutants.length} winless fighters sit on the leader's roster`,
    ).toBeLessThan(0.1);

    // And as a population, debutants must sit below the sport's midpoint on prestige.
    const prestiges = [...promotions.values()].sort((a, b) => a - b);
    const midpoint = prestiges[Math.floor(prestiges.length / 2)]!;
    const median = debutants
      .map((f) => promotions.get(f.promotionId as string) ?? 0)
      .sort((a, b) => a - b)[Math.floor(debutants.length / 2)]!;
    expect(median, `debutants sit at median prestige ${median}, sport midpoint ${midpoint}`).toBeLessThan(
      midpoint + 1,
    );
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
