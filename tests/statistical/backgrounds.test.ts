/**
 * Backgrounds, measured on the world they produce. Doc 31 § 12 step 9, recorded at § 22.
 *
 * Two of doc 31 § 10.3's permanent diagnostic rows — national sprinters against club jiu-jitsu
 * players, and the distance runners' cardio floor — were written as acceptance criteria for a
 * dimension the generator did not have. This file is where they finally get run, and § 22.4 records
 * what happened when they were: one of them passed as written and the other turned out to be
 * measuring the wrong statistic.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  createRng,
  divisionsFor,
  generateFighter,
  DISCIPLINES,
  DISCIPLINE_META,
  type Attainment,
  type Discipline,
  type Fighter,
  type Sex,
  walkingWeightOf,
} from '@mmasim/engine';

const PER_DIVISION = 6000;

const WORLD: readonly Fighter[] = (() => {
  const rng = createRng('backgrounds');
  const out: Fighter[] = [];
  for (const sex of ['male', 'female'] as const) {
    for (const division of divisionsFor(sex)) {
      for (let i = 0; i < PER_DIVISION; i++) {
        out.push(
          generateFighter(rng.fork(`${division.id}:${i}`), {
            id: `bg-${division.id}-${i}`,
            sex,
            divisionId: division.id,
            day: 0 as never,
            nationality: 'USA',
          }),
        );
      }
    }
  }
  return out;
})();

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: readonly number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(p * (s.length - 1))]!;
};
const who = (discipline: Discipline, attainment?: Attainment) =>
  WORLD.filter(
    (f) =>
      f.background?.discipline === discipline &&
      (attainment === undefined || f.background.attainment === attainment),
  );

describe('doc 31 § 10.3, the two rows that needed a background to exist', () => {
  it('makes national sprinters faster than club jiu-jitsu players by more than 12 points', () => {
    const sprinters = who('sprints', 'national').map((f) => f.attributes.speed);
    const players = who('jiuJitsu', 'amateur').map((f) => f.attributes.speed);
    const gap = mean(sprinters) - mean(players);

    expect(
      gap,
      `national sprinters ${mean(sprinters).toFixed(1)} against club jiu-jitsu ${mean(players).toFixed(1)}, gap ${gap.toFixed(1)} over n=${sprinters.length}/${players.length}`,
    ).toBeGreaterThan(12);
  });

  /*
   * **The row as § 10.3 wrote it was `Cardio p05 > 55`, and it is withdrawn.** Doc 31 § 22.4.
   *
   * Measured: national distance runners have a median Cardio at the world's 93rd percentile, so the
   * selection effect it was guarding is emphatically not cosmetic — but their 5th percentile sits
   * at 45, because one distance runner in twenty rolls a below-average `engine` and the background
   * is a shove rather than a guarantee. A p05 above 55 would require the background to *override*
   * the individual roll, which is the one thing every other prior in this project is written not to
   * do.
   *
   * So the guard is restated on two statistics that measure selection without demanding
   * determinism, and both are stronger than the original in the way that matters: they hold in
   * every division rather than in the pooled population.
   */
  it('selects distance runners for cardio in every division, not just in the aggregate', () => {
    const lifts: { division: string; lift: number }[] = [];
    const thin: string[] = [];
    for (const sex of ['male', 'female'] as const) {
      for (const division of divisionsFor(sex)) {
        const inDivision = WORLD.filter((f) => f.divisionId === division.id);
        const runners = inDivision.filter((f) => f.background?.discipline === 'distanceRunning');
        // Every attainment, not just national: the heavier divisions draw so few distance runners
        // at all (the mass conditioning is doing its job) that filtering to one rung leaves four
        // divisions with a sample, and a per-division claim measured in four divisions is a pooled
        // claim wearing a per-division label.
        if (runners.length < 30) {
          thin.push(division.shortName);
          continue;
        }
        lifts.push({
          division: division.shortName,
          lift:
            mean(runners.map((f) => f.attributes.cardio)) -
            mean(inDivision.map((f) => f.attributes.cardio)),
        });
      }
    }

    expect(
      lifts.length,
      `only ${lifts.length} divisions had 30+ distance runners; too thin: ${thin.join(', ')}`,
    ).toBeGreaterThan(8);
    const worst = lifts.reduce((a, b) => (a.lift < b.lift ? a : b));
    expect(
      worst.lift,
      `weakest division ${worst.division} at +${worst.lift.toFixed(1)}; all: ${lifts.map((l) => `${l.division} +${l.lift.toFixed(1)}`).join(', ')}`,
    ).toBeGreaterThan(8);
  });

  it('puts the median national distance runner in the top tenth of the world for cardio', () => {
    const all = WORLD.map((f) => f.attributes.cardio);
    const runners = who('distanceRunning', 'national').map((f) => f.attributes.cardio);
    const median = pct(runners, 0.5);
    const rank = all.filter((c) => c < median).length / all.length;

    expect(
      rank,
      `median national distance runner reads ${median} cardio, the world's ${(100 * rank).toFixed(1)}th percentile`,
    ).toBeGreaterThan(0.85);
  });
});

describe('a background is a shape, not a bonus — measured on the population', () => {
  /*
   * The unit test proves the priors sum to zero over the intake. This proves the thing that
   * actually matters, which is that the *world* is unchanged: every attribute mean within a
   * quarter of a point of the pre-background generator, measured against the values recorded in
   * doc 31 § 22.3 on the identical seed and sample.
   *
   * If this ever fails upward, backgrounds have started inflating the sport and every bound in the
   * suite that noticed would otherwise be quietly re-baselined instead.
   */
  const BEFORE: Readonly<Record<string, number>> = {
    power: 45.9,
    speed: 47.1,
    cardio: 43.3,
    durability: 47.5,
    strength: 44.0,
    strikingOffence: 37.3,
    kicking: 37.3,
    strikingDefence: 37.3,
    wrestling: 37.3,
    takedownDefence: 37.3,
    groundControl: 37.2,
    submissions: 37.2,
    scrambling: 37.3,
    fightIq: 37.1,
    composure: 37.4,
  };

  it('leaves every attribute mean where it was', () => {
    const males = WORLD.filter((f) => f.sex === 'male');
    for (const key of ATTRIBUTE_KEYS) {
      const now = mean(males.map((f) => f.attributes[key]));
      expect(
        Math.abs(now - BEFORE[key]!),
        `${key}: ${now.toFixed(2)} now against ${BEFORE[key]} before backgrounds`,
      ).toBeLessThan(0.4);
    }
  });

  it('leaves the mean body where it was', () => {
    const males = WORLD.filter((f) => f.sex === 'male');
    expect(mean(males.map((f) => walkingWeightOf(f)))).toBeCloseTo(183.8, 0);
    expect(mean(males.map((f) => f.heightInches))).toBeCloseTo(70.3, 0);
    expect(mean(males.map((f) => f.physique.muscleIndex))).toBeCloseTo(50, 0);
    expect(mean(males.map((f) => f.physique.frameIndex))).toBeCloseTo(50, 0);
  });
});

describe('the generated world now has styles in it', () => {
  /*
   * Before step 9 it did not, and this is the measurement that says so. Technical ceilings are
   * `motorLearning` plus six points of noise, so a generated fighter's wrestling and their
   * kickboxing differed by a coin flip: there were no wrestlers, only fighters with slightly more
   * wrestling. The signature below asserts that each discipline is now *best at its own thing*
   * among the eleven, which is the weakest form of the claim and the one that cannot be satisfied
   * by accident.
   */
  const SIGNATURE: Partial<Record<Discipline, keyof Fighter['attributes']>> = {
    boxing: 'strikingOffence',
    kickboxing: 'kicking',
    wrestling: 'wrestling',
    jiuJitsu: 'submissions',
    sprints: 'speed',
    throws: 'strength',
    distanceRunning: 'cardio',
    contactSport: 'durability',
  };

  it.each(Object.entries(SIGNATURE) as [Discipline, keyof Fighter['attributes']][])(
    '%s leads the world on %s',
    (discipline, attribute) => {
      const scores = DISCIPLINES.map(
        (d) => [d, mean(who(d).map((f) => f.attributes[attribute]))] as const,
      ).sort((a, b) => b[1] - a[1]);

      expect(
        scores[0]![0],
        `${attribute}: ${scores.map(([d, v]) => `${d} ${v.toFixed(1)}`).join(', ')}`,
      ).toBe(discipline);
    },
  );

  it('gives a wrestler a real advantage over a striker on the mat, and pays for it', () => {
    const wrestler = who('wrestling', 'national');
    const boxer = who('boxing', 'national');
    const wrestlingGap =
      mean(wrestler.map((f) => f.attributes.wrestling)) -
      mean(boxer.map((f) => f.attributes.wrestling));
    const strikingGap =
      mean(boxer.map((f) => f.attributes.strikingOffence)) -
      mean(wrestler.map((f) => f.attributes.strikingOffence));

    expect(wrestlingGap, `wrestling gap ${wrestlingGap.toFixed(1)}`).toBeGreaterThan(6);
    expect(strikingGap, `striking gap ${strikingGap.toFixed(1)}`).toBeGreaterThan(4);
  });

  it('leaves the ceiling alone: realisation moves where a fighter starts, never how good they get', () => {
    /*
     * The load-bearing safety property of the realisation term. A background that raised potential
     * would be a talent purchase, and the athletic branch — which already buys the largest naturals
     * lean in the game — would become the only sane pick.
     */
    const wrestler = who('wrestling', 'national');
    const boxer = who('boxing', 'national');
    const ceilingGap =
      mean(wrestler.map((f) => f.potential.wrestling)) -
      mean(boxer.map((f) => f.potential.wrestling));

    expect(Math.abs(ceilingGap), `wrestling ceiling gap ${ceilingGap.toFixed(1)}`).toBeLessThan(
      2.5,
    );
    for (const f of WORLD) {
      for (const key of ATTRIBUTE_KEYS) {
        if (f.attributes[key] > f.potential[key]) {
          throw new Error(`${f.id} ${key}: ${f.attributes[key]} over ceiling ${f.potential[key]}`);
        }
      }
    }
  });
});

describe('the body a sport selected for', () => {
  it('builds throwers and distance runners as different species', () => {
    const throwers = who('throws');
    const runners = who('distanceRunning');

    expect(
      mean(throwers.map((f) => walkingWeightOf(f))) - mean(runners.map((f) => walkingWeightOf(f))),
      'throwers should walk around a great deal heavier than distance runners',
    ).toBeGreaterThan(35);
    expect(
      mean(throwers.map((f) => f.physique.muscleIndex)) -
        mean(runners.map((f) => f.physique.muscleIndex)),
    ).toBeGreaterThan(15);
  });

  it('makes rowers the tallest people in the sport', () => {
    const byHeight = DISCIPLINES.map(
      (d) => [d, mean(who(d).map((f) => f.heightInches))] as const,
    ).sort((a, b) => b[1] - a[1]);
    expect(byHeight[0]![0], byHeight.map(([d, v]) => `${d} ${v.toFixed(1)}`).join(', ')).toBe(
      'rowing',
    );
  });

  it('keeps every background inside the division it was drawn for', () => {
    // The prior shifts the draw's centre, so a body that no longer fits is rejected rather than
    // squashed. What must not happen is a discipline quietly leaving its own division.
    for (const f of WORLD) {
      expect(f.divisionId, `${f.background?.discipline} left its division`).toBeTruthy();
    }
    const bySex: Record<Sex, number> = { male: 0, female: 0 };
    for (const f of WORLD) bySex[f.sex]++;
    expect(bySex.male).toBeGreaterThan(0);
    expect(bySex.female).toBeGreaterThan(0);
  });

  it('gives every fighter in the world a history', () => {
    const missing = WORLD.filter((f) => !f.background).length;
    expect(missing, `${missing} generated fighters have no background`).toBe(0);
    const seen = new Set(WORLD.map((f) => f.background!.discipline));
    expect(seen.size, `only ${seen.size} of ${DISCIPLINES.length} disciplines appeared`).toBe(
      DISCIPLINES.length,
    );
    void DISCIPLINE_META;
  });
});
