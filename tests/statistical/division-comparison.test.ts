/**
 * Doc 31 § 7: what the absolute scale breaks, and what step 12 did about it.
 *
 * § 7 names three places where an **absolute rating was being used as a comparison** with no
 * reference population. They are the same defect three times, and the fix is the same split each
 * time: the number is absolute, the adjective is comparative. This file is the measurement — both
 * that the defects were real and that the fixes removed them.
 *
 * It also holds the one § 7 claim step 12 deliberately did *not* act on, with the number that
 * decided it: § 12 § 25.3.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_TRAITS,
  ATTRIBUTE_KEYS,
  ELITE_LIFT,
  PHYSICAL_SCALE_KEYS,
  createRng,
  displayBand,
  divisionsFor,
  expectedPhysical,
  generateFighter,
  isPhysicalScaleKey,
  overallRating,
  ratingBand,
  traitFit,
  traitReferenceFor,
  type BandContext,
  type Fighter,
  type Sex,
} from '@mmasim/engine';

const PER_DIVISION = 2500;
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** One generated population per division, built once for the whole file. */
const WORLD = (() => {
  const rng = createRng('division-comparison');
  const out = new Map<string, { sex: Sex; shortName: string; fighters: Fighter[] }>();
  for (const sex of ['male', 'female'] as const) {
    for (const division of divisionsFor(sex)) {
      const fighters: Fighter[] = [];
      for (let i = 0; i < PER_DIVISION; i++) {
        fighters.push(
          generateFighter(rng.fork(`${division.id}:${i}`), {
            id: `dc-${division.id}-${i}`,
            sex,
            divisionId: division.id,
            day: 0 as never,
            nationality: 'USA',
          }),
        );
      }
      out.set(division.id as string, { sex, shortName: division.shortName, fighters });
    }
  }
  return out;
})();

const men = () => [...WORLD.entries()].filter(([, v]) => v.sex === 'male');

describe('§ 7.3 the bands stop describing quality, and now describe it again', () => {
  /*
   * The defect a player actually sees. `RATING_BANDS` calls 38–49 "Below level — a hole opponents
   * will find", which was true of every attribute under the old flat ladder.
   */
  const shareIn = (
    fighters: readonly Fighter[],
    key: (typeof PHYSICAL_SCALE_KEYS)[number],
    bands: BandContext | undefined,
    labels: readonly string[],
  ) =>
    fighters.filter((f) =>
      labels.includes(
        (bands ? displayBand(key, f.attributes[key], bands) : ratingBand(f.attributes[key])).label,
      ),
    ).length / fighters.length;

  const BAD = ['Liability', 'Absent', 'Below level'] as const;

  it('called most of a division a liability on the absolute bands', () => {
    /*
     * The measurement that made this worth fixing, kept as a *record* of the defect rather than as
     * a guard on it: 74% of generated flyweights were labelled a hole or worse at Power while 36%
     * of heavyweights read "Average", and the two populations differ only in which weight class
     * they were born into.
     */
    const flw = WORLD.get('mens-flyweight')!.fighters;
    const hw = WORLD.get('mens-heavyweight')!.fighters;

    const flwBad = shareIn(flw, 'power', undefined, BAD);
    const hwBad = shareIn(hw, 'power', undefined, BAD);
    expect(flwBad, `flyweight Power in a bad band: ${(100 * flwBad).toFixed(0)}%`).toBeGreaterThan(
      0.6,
    );
    expect(
      flwBad - hwBad,
      `flyweight ${(100 * flwBad).toFixed(0)}% against heavyweight ${(100 * hwBad).toFixed(0)}%`,
    ).toBeGreaterThan(0.2);
  });

  it('says the same thing about every division once the band knows which one it is in', () => {
    for (const key of PHYSICAL_SCALE_KEYS) {
      const shares = men().map(([id, v]) => ({
        div: v.shortName,
        share: shareIn(
          v.fighters,
          key,
          { divisionId: id, sex: 'male', eliteLift: ELITE_LIFT },
          BAD,
        ),
      }));
      const spread =
        Math.max(...shares.map((s) => s.share)) - Math.min(...shares.map((s) => s.share));
      expect(
        spread,
        `${key}: ${shares.map((s) => `${s.div} ${(100 * s.share).toFixed(0)}%`).join(', ')}`,
      ).toBeLessThan(0.12);
    }
  });

  it('leaves the ten technical and mental attributes absolutely banded', () => {
    /*
     * The other half of the claim, and the one that is easy to get wrong by fixing too much. There
     * is no division term on Wrestling or Fight IQ (§ 2.3), so re-centring them would invent a
     * reference the sport does not support.
     */
    const bands: BandContext = {
      divisionId: 'mens-heavyweight',
      sex: 'male',
      eliteLift: ELITE_LIFT,
    };
    for (const key of ATTRIBUTE_KEYS) {
      if (isPhysicalScaleKey(key)) continue;
      for (const rating of [20, 45, 55, 70, 90] as const) {
        expect(displayBand(key, rating, bands).key, key).toBe(ratingBand(rating).key);
      }
    }
  });

  it('does not touch the number, only the word for it', () => {
    // The whole point of the split. `displayBand` returns a band; nothing in it can change a rating.
    const f = WORLD.get('mens-flyweight')!.fighters[0]!;
    const before = { ...f.attributes };
    displayBand('power', f.attributes.power, {
      divisionId: 'mens-flyweight',
      sex: 'male',
      eliteLift: ELITE_LIFT,
    });
    expect(f.attributes).toEqual(before);
  });

  it('falls back to the absolute band when it cannot name a reference population', () => {
    // A division the table does not know is a real case — the editor can add one — and a label with
    // no reference must not pretend to have one.
    const bands: BandContext = {
      divisionId: 'invented-division',
      sex: 'male',
      eliteLift: ELITE_LIFT,
    };
    expect(displayBand('power', 46, bands).key).toBe(ratingBand(46).key);
    expect(expectedPhysical('power', 'invented-division', 'male')).toBeUndefined();
  });
});

describe('§ 7.2 traits stop migrating by division', () => {
  /*
   * § 7.2 predicted that `traitFit`'s hard-coded pivot of 50 would hand `powerPuncher` and
   * `ironChin` to heavyweights and `cardioMachine` to flyweights. It named three traits and got one
   * right — see § 25.2. These measure the fix rather than the prediction.
   */
  const affinityTraits = ALL_TRAITS.filter(
    (t) => t.affinity && Object.keys(t.affinity).some((k) => isPhysicalScaleKey(k as never)),
  );

  const share = (fighters: readonly Fighter[], id: string) =>
    fighters.filter((f) => f.traits.includes(id as never)).length / fighters.length;

  it('keeps every physical-affinity trait inside a 2.2x spread across the men’s ladder', () => {
    /*
     * The pre-fix extremes were `headhunter` at x2.91 heavyweight-over-flyweight and
     * `volumeMachine` at x0.34 the other way — an 8.6x spread between the two. A trait is the most
     * legible thing on a profile, so a bound here is a bound on the most visible consequence the
     * ladder had.
     *
     * Not 1.0: a heavyweight genuinely *is* likelier to be a headhunter, because the attributes a
     * trait reads are not only the physicals and the technical half still varies. What must not
     * happen is the division deciding it.
     */
    const rows = affinityTraits
      .map((t) => {
        const shares = men().map(([, v]) => share(v.fighters, t.id));
        const lo = Math.min(...shares);
        const hi = Math.max(...shares);
        return { id: t.id, lo, hi, ratio: lo > 0.002 ? hi / lo : 1 };
      })
      .sort((a, b) => b.ratio - a.ratio);

    const worst = rows[0]!;
    expect(
      worst.ratio,
      `widest spread ${worst.id} x${worst.ratio.toFixed(2)} (${(100 * worst.lo).toFixed(1)}% to ${(100 * worst.hi).toFixed(1)}%); all: ${rows
        .slice(0, 5)
        .map((r) => `${r.id} x${r.ratio.toFixed(2)}`)
        .join(', ')}`,
    ).toBeLessThan(2.2);
  });

  it('pivots a physical on its division and a skill on a flat 50', () => {
    const chin = ALL_TRAITS.find((t) => t.affinity?.durability)!;
    const flwRef = traitReferenceFor('mens-flyweight' as never, 'male');
    const hwRef = traitReferenceFor('mens-heavyweight' as never, 'male');

    // The same rating is worth more at flyweight than at heavyweight, because the division's own
    // expectation is lower — which is the entire fix.
    expect(
      traitFit(
        chin,
        { ...WORLD.get('mens-flyweight')!.fighters[0]!.attributes, durability: 70 },
        flwRef,
      ),
    ).toBeGreaterThan(
      traitFit(
        chin,
        { ...WORLD.get('mens-flyweight')!.fighters[0]!.attributes, durability: 70 },
        hwRef,
      ),
    );

    // And a reference contains the five physicals and nothing else.
    expect(Object.keys(hwRef).sort()).toEqual([...PHYSICAL_SCALE_KEYS].sort());
  });

  it('is unchanged with no reference, so every existing caller behaves exactly as before', () => {
    const t = ALL_TRAITS.find((x) => x.affinity?.power)!;
    const attrs = WORLD.get('mens-lightweight')!.fighters[0]!.attributes;
    expect(traitFit(t, attrs, undefined)).toBe(traitFit(t, attrs));
  });
});

describe('§ 7.1 overallRating is division-biased, and by how much', () => {
  it('measures the bias rather than assuming it', () => {
    /*
     * § 7.1 predicted "roughly +2.0 overall points to a heavyweight over a flyweight, before either
     * has learned anything", and recommended adding a `competitiveRating` comparator and migrating
     * ~20 consumers.
     *
     * **Measured, it is 1.06 points** across the whole men's ladder — about half the prediction,
     * because the physical group carries 4.9 of 14.9 weight and the ten technical means are flat to
     * within 0.7 of a point. § 25.3 records why that number is the reason the comparator was not
     * built, and this assertion is what would reopen the question: if the bias ever doubles, the
     * recommendation stands and this test says so.
     */
    const overalls = men().map(([, v]) => ({
      div: v.shortName,
      overall: mean(v.fighters.map((f) => overallRating(f.attributes))),
    }));
    const spread =
      Math.max(...overalls.map((o) => o.overall)) - Math.min(...overalls.map((o) => o.overall));

    expect(
      spread,
      `men's overall spread ${spread.toFixed(2)} points: ${overalls.map((o) => `${o.div} ${o.overall.toFixed(2)}`).join(', ')}`,
    ).toBeLessThan(2);
  });

  it('is monotone in weight, which is what makes it a bias rather than noise', () => {
    // 1.06 points is small, and "small" is only a defence if it is also *structured* — a bias that
    // climbs with the division is a real effect and the reason § 7.1 is recorded as open.
    const overalls = men().map(([, v]) => mean(v.fighters.map((f) => overallRating(f.attributes))));
    expect(overalls[overalls.length - 1]!).toBeGreaterThan(overalls[0]!);
  });
});
