/**
 * The three-layer origin system.
 *
 * Each layer claims to do a different job — talent moves ceilings, discipline moves shape,
 * attainment moves standing — and the whole design rests on those three claims being true
 * *and separate*. So this suite is organised as one describe per claim, and every assertion
 * is against a sampled distribution rather than a single seeded roll, because a single roll
 * of `normalClamped(centre, 11–16)` says nothing about where the centre is.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_KEYS,
  overallRating,
  type AttributeKey,
} from '../ratings/attributes.js';
import type { Fighter } from '../domain/fighter.js';
import {
  ATHLETIC_ORIGINS,
  ATTAINMENTS,
  ATTAINMENT_META,
  COMBAT_DISCIPLINES,
  DISCIPLINE_META,
  DISCIPLINES,
  SECONDARY_WEIGHT,
  TALENT_META,
  TALENT_TIERS,
  attainmentsForTalent,
  describeOrigin,
  disciplinesForTalent,
  isAthleticOrigin,
  reconcileOrigin,
  resolveOrigin,
  secondaryOptionsFor,
  type Attainment,
  type CombatDiscipline,
  type Discipline,
  type FighterOrigin,
  type TalentTier,
} from './origin.js';
import { createPlayerFighter, validateCreation, validateOrigin } from './createFighter.js';

const build = (origin: FighterOrigin, seed: string, age = 25): Fighter =>
  createPlayerFighter(
    {
      id: seed,
      firstName: 'Test',
      lastName: 'Player',
      nationality: 'USA',
      sex: 'male',
      age,
      divisionId: asDivisionId('mens-lightweight'),
      origin,
      day: 0,
    },
    createRng(seed),
  );

/** Averages over enough rolls that a 11–16 point standard deviation stops being the signal. */
function sample(origin: FighterOrigin, n = 200, age = 25) {
  const fighters = Array.from({ length: n }, (_, i) => build(origin, `s:${JSON.stringify(origin)}:${i}`, age));
  const avg = (f: (x: Fighter) => number) => fighters.reduce((a, x) => a + f(x), 0) / n;
  return {
    fighters,
    startOverall: avg((f) => overallRating(f.attributes)),
    ceilingOverall: avg((f) => overallRating(f.potential)),
    attribute: (key: AttributeKey) => avg((f) => f.attributes[key]),
    ceiling: (key: AttributeKey) => avg((f) => f.potential[key]),
  };
}

/** The three attributes no non-combat athlete has ever trained. */
const TECHNICAL: readonly AttributeKey[] = ['strikingOffence', 'wrestling', 'submissions'];

/** Arithmetic mean, for the population claims below. */
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('layer 1 — talent moves ceilings and only ceilings', () => {
  it('orders the tiers by what a fighter can eventually become', () => {
    const ceiling = (talent: TalentTier) =>
      sample({ talent, discipline: 'wrestling', attainment: 'regional' }).ceilingOverall;

    // Measured with these tiers: 69.9 / 73.6 / 77.0 against a roster median of 67.5 and a
    // champion bar of 78.4. A grinder's median career is a roster fighter, a freak's median
    // career is a contender, and only the tail of either is a champion.
    expect(ceiling('grinder')).toBeLessThan(ceiling('natural'));
    expect(ceiling('natural')).toBeLessThan(ceiling('freak'));
    expect(ceiling('freak') - ceiling('grinder')).toBeGreaterThan(4);
  });

  it('shows in the body on debut, and barely at all in the skills', () => {
    /*
     * Reversed since doc 23, and the reversal is the point.
     *
     * This used to assert that a freak and a grinder debut identically — talent being "potential,
     * not skill". Half of that is right and half of it was a claim about physiology that the sport
     * disagrees with: explosive power is 74–84% heritable, so being put together differently is
     * exactly the thing that is visible at twenty-two. What a freak has *not* got on debut is
     * technique, because technique is hours and nobody has done more hours than their age allows.
     *
     * So the tier now shows in the physicals and stays almost invisible in the skills, which is
     * also what "you are put together differently and everybody in the room knows it" claims.
     */
    const physicalOf = (talent: TalentTier) => {
      const { fighters } = sample({ talent, discipline: 'wrestling', attainment: 'regional' });
      return mean(
        fighters.map((f) => mean(ATTRIBUTES_BY_GROUP.physical.map((k) => f.attributes[k]))),
      );
    };
    const skillOf = (talent: TalentTier) => {
      const { fighters } = sample({ talent, discipline: 'wrestling', attainment: 'regional' });
      const skills = ATTRIBUTE_KEYS.filter((k) => !ATTRIBUTES_BY_GROUP.physical.includes(k));
      return mean(fighters.map((f) => mean(skills.map((k) => f.attributes[k]))));
    };

    expect(physicalOf('freak') - physicalOf('grinder')).toBeGreaterThan(4);
    expect(Math.abs(skillOf('freak') - skillOf('grinder'))).toBeLessThan(1.5);
  });

  it('never lets a tier guarantee anything, because the roll is wide', () => {
    const grinders = sample({ talent: 'grinder', discipline: 'boxing', attainment: 'regional' });
    const freaks = sample({ talent: 'freak', discipline: 'boxing', attainment: 'regional' });
    const best = (s: ReturnType<typeof sample>) =>
      Math.max(...s.fighters.map((f) => overallRating(f.potential)));
    const worst = (s: ReturnType<typeof sample>) =>
      Math.min(...s.fighters.map((f) => overallRating(f.potential)));
    // The distributions overlap: an unlucky freak has a worse ceiling than a lucky grinder.
    expect(best(grinders)).toBeGreaterThan(worst(freaks));
  });
});

describe('layer 2 — discipline shapes the fighter', () => {
  it('offers exactly the six arts the fight engine can tell apart', () => {
    // doc/18 §4.1 enumerates six and §4.2 explains why a seventh would be a label over
    // numbers identical to one of them. This assertion exists so that adding one is a
    // deliberate act with a failing test attached, not a quiet menu edit.
    expect(COMBAT_DISCIPLINES).toHaveLength(6);
    expect([...COMBAT_DISCIPLINES]).toEqual([
      'boxing',
      'kickboxing',
      'karate',
      'wrestling',
      'jiuJitsu',
      'judo',
    ]);
  });

  it('gives every combat discipline the same total bias, so the choice is shape not quantity', () => {
    const totals = COMBAT_DISCIPLINES.map((d) =>
      Object.values(DISCIPLINE_META[d].attributes).reduce((a, v) => a + v, 0),
    );
    expect(new Set(totals).size, `combat disciplines differ in total: ${totals.join(', ')}`).toBe(1);
  });

  it('makes each art strongest in the attribute the engine reads it through', () => {
    const signature: Record<CombatDiscipline, AttributeKey> = {
      boxing: 'strikingOffence',
      kickboxing: 'kicking',
      karate: 'kicking',
      wrestling: 'wrestling',
      jiuJitsu: 'submissions',
      judo: 'wrestling',
    };
    for (const discipline of COMBAT_DISCIPLINES) {
      const mine = sample({ talent: 'natural', discipline, attainment: 'regional' }, 60);
      for (const other of COMBAT_DISCIPLINES) {
        if (other === discipline) continue;
        if (signature[other] === signature[discipline]) continue;
        const theirs = sample({ talent: 'natural', discipline: other, attainment: 'regional' }, 60);
        expect(
          mine.attribute(signature[discipline]),
          `${discipline} is not better than ${other} at ${signature[discipline]}`,
        ).toBeGreaterThan(theirs.attribute(signature[discipline]));
      }
    }
  });

  it('separates the two kicking arts on speed rather than on kicking', () => {
    // doc/18 §4.2: karate and taekwondo are both "kicking + speed" with nothing to separate
    // them, so karate is separated from *kickboxing* instead — fast and selective against
    // heavy and constant. If these ever converge the two menu entries stop being a choice.
    const karate = sample({ talent: 'natural', discipline: 'karate', attainment: 'regional' });
    const kickboxer = sample({ talent: 'natural', discipline: 'kickboxing', attainment: 'regional' });
    expect(karate.attribute('speed')).toBeGreaterThan(kickboxer.attribute('speed') + 4);
    expect(kickboxer.attribute('strikingOffence')).toBeGreaterThan(karate.attribute('strikingOffence') + 4);
  });

  describe('the non-combat branch', () => {
    it('debuts with almost nothing technical', () => {
      const boxer = sample({ talent: 'natural', discipline: 'boxing', attainment: 'regional' });
      for (const athletic of ATHLETIC_ORIGINS) {
        const athlete = sample({ talent: 'natural', discipline: athletic, attainment: 'regional' });
        const gap =
          TECHNICAL.reduce((a, k) => a + boxer.attribute(k) - athlete.attribute(k), 0) /
          TECHNICAL.length;
        expect(gap, `${athletic} is not far enough behind a boxer technically`).toBeGreaterThan(4);
      }
    });

    it('has the highest ceilings in the game', () => {
      const bestCombat = Math.max(
        ...COMBAT_DISCIPLINES.map(
          (d) => sample({ talent: 'freak', discipline: d, attainment: 'regional' }, 80).ceilingOverall,
        ),
      );
      for (const athletic of ATHLETIC_ORIGINS) {
        const athlete = sample({ talent: 'freak', discipline: athletic, attainment: 'regional' }, 80);
        expect(athlete.ceilingOverall, `${athletic} does not out-ceiling every combat art`).toBeGreaterThan(
          bestCombat,
        );
      }
    });

    it('is a real trade: worse today in exchange for that', () => {
      const boxer = sample({ talent: 'freak', discipline: 'boxing', attainment: 'regional' });
      const athlete = sample({ talent: 'freak', discipline: 'trackAndField', attainment: 'regional' });
      expect(athlete.startOverall).toBeLessThan(boxer.startOverall);
      expect(athlete.ceilingOverall).toBeGreaterThan(boxer.ceilingOverall);
    });

    it('specialises in different physical qualities rather than being one option three times', () => {
      const track = sample({ talent: 'natural', discipline: 'trackAndField', attainment: 'regional' });
      const contact = sample({ talent: 'natural', discipline: 'contactSport', attainment: 'regional' });
      const endurance = sample({ talent: 'natural', discipline: 'enduranceSport', attainment: 'regional' });
      expect(track.ceiling('speed')).toBeGreaterThan(endurance.ceiling('speed'));
      expect(endurance.ceiling('cardio')).toBeGreaterThan(track.ceiling('cardio'));
      expect(contact.ceiling('durability')).toBeGreaterThan(track.ceiling('durability'));
    });

    it('is not offered to the tier that has no athletic story to tell', () => {
      expect(disciplinesForTalent('grinder')).toEqual(COMBAT_DISCIPLINES);
      expect(disciplinesForTalent('freak')).toEqual(DISCIPLINES);
      for (const athletic of ATHLETIC_ORIGINS) {
        expect(
          validateOrigin({ talent: 'grinder', discipline: athletic, attainment: 'regional' }).length,
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('the secondary discipline', () => {
    const wrestlerWhoBoxes: FighterOrigin = {
      talent: 'natural',
      discipline: 'wrestling',
      secondary: 'boxing',
      attainment: 'regional',
    };
    const boxerWhoWrestles: FighterOrigin = {
      talent: 'natural',
      discipline: 'boxing',
      secondary: 'wrestling',
      attainment: 'regional',
    };

    it('is worth roughly a third of the primary', () => {
      const resolved = resolveOrigin(wrestlerWhoBoxes);
      const pureWrestler = resolveOrigin({ talent: 'natural', discipline: 'wrestling', attainment: 'regional' });
      const pureBoxer = resolveOrigin({ talent: 'natural', discipline: 'boxing', attainment: 'regional' });

      const wrestlingShare = (resolved.attributes.wrestling ?? 0) / (pureWrestler.attributes.wrestling ?? 1);
      const boxingShare =
        (resolved.attributes.strikingOffence ?? 0) / (pureBoxer.attributes.strikingOffence ?? 1);
      expect(boxingShare / wrestlingShare).toBeCloseTo(1 / 3, 5);
      expect(boxingShare).toBeCloseTo(SECONDARY_WEIGHT, 5);
    });

    it('never makes a fighter better overall, because it is paid for out of the primary', () => {
      const total = (o: FighterOrigin) =>
        Object.values(resolveOrigin(o).attributes).reduce((a, v) => a + v, 0);
      expect(total(wrestlerWhoBoxes)).toBeCloseTo(
        total({ talent: 'natural', discipline: 'wrestling', attainment: 'regional' }),
        5,
      );
    });

    it('makes "a wrestler who boxes" and "a boxer who wrestles" genuinely different fighters', () => {
      const a = sample(wrestlerWhoBoxes);
      const b = sample(boxerWhoWrestles);
      expect(a.attribute('wrestling')).toBeGreaterThan(b.attribute('wrestling') + 6);
      expect(b.attribute('strikingOffence')).toBeGreaterThan(a.attribute('strikingOffence') + 6);
    });

    it('sits strictly between the two pure fighters it blends', () => {
      const blend = sample(wrestlerWhoBoxes);
      const pureWrestler = sample({ talent: 'natural', discipline: 'wrestling', attainment: 'regional' });
      const pureBoxer = sample({ talent: 'natural', discipline: 'boxing', attainment: 'regional' });
      expect(blend.attribute('wrestling')).toBeLessThan(pureWrestler.attribute('wrestling'));
      expect(blend.attribute('wrestling')).toBeGreaterThan(pureBoxer.attribute('wrestling'));
      expect(blend.attribute('strikingOffence')).toBeGreaterThan(pureWrestler.attribute('strikingOffence'));
      expect(blend.attribute('strikingOffence')).toBeLessThan(pureBoxer.attribute('strikingOffence'));
    });

    it('refuses a second art that is the same one, or that is not an art at all', () => {
      expect(secondaryOptionsFor('boxing')).not.toContain('boxing');
      expect(secondaryOptionsFor('trackAndField')).toHaveLength(0);
      for (const d of DISCIPLINES) {
        for (const s of secondaryOptionsFor(d)) {
          expect(isAthleticOrigin(s)).toBe(false);
        }
      }
      expect(
        validateOrigin({
          talent: 'natural',
          discipline: 'boxing',
          secondary: 'boxing',
          attainment: 'regional',
        }).length,
      ).toBeGreaterThan(0);
      expect(
        validateOrigin({
          talent: 'freak',
          discipline: 'trackAndField',
          secondary: 'boxing',
          attainment: 'regional',
        }).length,
      ).toBeGreaterThan(0);
    });
  });
});

describe('layer 3 — attainment is standing, filtered by talent', () => {
  it('only offers the rungs the talent tier could plausibly have reached', () => {
    // The design's central claim: an Olympic medallist *is* an elite athlete, so the way to
    // avoid counting that twice is not to offer it and scale it down, it is not to offer it.
    expect(attainmentsForTalent('freak')).toEqual(ATTAINMENTS);
    expect(attainmentsForTalent('natural')).toEqual(['amateur', 'regional', 'national']);
    expect(attainmentsForTalent('grinder')).toEqual(['amateur', 'regional']);
  });

  it('leaves the bottom rungs open to everybody, because an undiscovered freak is a real person', () => {
    for (const talent of TALENT_TIERS) {
      expect(attainmentsForTalent(talent)).toContain('amateur');
    }
    expect(
      validateOrigin({ talent: 'freak', discipline: 'boxing', attainment: 'amateur' }, 22),
    ).toHaveLength(0);
  });

  it('rejects an attainment the tier does not reach', () => {
    expect(
      validateOrigin({ talent: 'grinder', discipline: 'wrestling', attainment: 'world' }).length,
    ).toBeGreaterThan(0);
    expect(
      validateOrigin({ talent: 'natural', discipline: 'wrestling', attainment: 'world' }).length,
    ).toBeGreaterThan(0);
    expect(
      validateOrigin({ talent: 'freak', discipline: 'wrestling', attainment: 'world' }, 30),
    ).toHaveLength(0);
  });

  it('starts a bigger name further up the queue', () => {
    const rep = (attainment: Attainment) =>
      build({ talent: 'freak', discipline: 'wrestling', attainment }, `rep:${attainment}`, 30);
    let previousRep = -1;
    let previousStar = -1;
    for (const attainment of ATTAINMENTS) {
      const f = rep(attainment);
      expect(f.reputation).toBeGreaterThan(previousRep);
      expect(f.starPower).toBeGreaterThan(previousStar);
      previousRep = f.reputation;
      previousStar = f.starPower;
    }
    // Still nobody at the bottom: the entry rung is exactly where every created fighter
    // used to start, which is what keeps "you start unknown" true for the default path.
    expect(rep('amateur').reputation).toBe(5);
    expect(rep('amateur').starPower).toBe(1);
  });

  it('charges for the name in years rather than in ratings', () => {
    // The self-balancing part. You cannot medal at a world championship and also turn pro
    // at nineteen, and `applyAgeing` then bills the fighter for the difference forever.
    let previous = 0;
    for (const attainment of ATTAINMENTS) {
      const min = ATTAINMENT_META[attainment].minDebutAge;
      expect(min).toBeGreaterThanOrEqual(previous);
      previous = min;
    }
    expect(ATTAINMENT_META.world.minDebutAge).toBeGreaterThan(ATTAINMENT_META.amateur.minDebutAge);
    expect(
      validateOrigin({ talent: 'freak', discipline: 'wrestling', attainment: 'world' }, 21).some(
        (i) => i.field === 'age',
      ),
    ).toBe(true);
  });

  it('does not secretly move ceilings, which would put the double-count straight back', () => {
    const centres = ATTAINMENTS.map(
      (attainment) => resolveOrigin({ talent: 'freak', discipline: 'wrestling', attainment }).naturalsCentre,
    );
    expect(new Set(centres).size).toBe(1);
    for (const attainment of ATTAINMENTS) {
      expect(resolveOrigin({ talent: 'freak', discipline: 'wrestling', attainment }).naturals).toEqual(
        resolveOrigin({ talent: 'freak', discipline: 'wrestling', attainment: 'amateur' }).naturals,
      );
    }
  });

  it('moves skill less than talent moves ceilings', () => {
    // Attainment is deliberately the weakest of the three levers on ratings. If it ever
    // out-pulls layer 1 it has become a second talent dial wearing a career label.
    const skillSpread = ATTAINMENT_META.world.skill - ATTAINMENT_META.amateur.skill;
    const talentSpread =
      (TALENT_META.freak.naturalsCentre - TALENT_META.grinder.naturalsCentre) / 40;
    expect(skillSpread).toBeLessThan(1);
    expect(talentSpread).toBeGreaterThan(0);
  });
});

describe('keeping an origin legal as the layers above it change', () => {
  it('drops an attainment the new tier cannot reach to the highest it can', () => {
    const reconciled = reconcileOrigin({
      talent: 'grinder',
      discipline: 'boxing',
      attainment: 'world',
    });
    expect(reconciled.attainment).toBe('regional');
    expect(reconciled.discipline).toBe('boxing');
  });

  it('replaces a discipline the new tier does not offer', () => {
    const reconciled = reconcileOrigin({
      talent: 'grinder',
      discipline: 'trackAndField',
      attainment: 'amateur',
    });
    expect(isAthleticOrigin(reconciled.discipline)).toBe(false);
  });

  it('drops a secondary that stopped being legal, and keeps one that did not', () => {
    expect(
      reconcileOrigin({ talent: 'freak', discipline: 'trackAndField', secondary: 'boxing', attainment: 'world' })
        .secondary,
    ).toBeUndefined();
    expect(
      reconcileOrigin({ talent: 'freak', discipline: 'wrestling', secondary: 'boxing', attainment: 'world' })
        .secondary,
    ).toBe('boxing');
  });

  it('produces something valid from anything', () => {
    for (const talent of TALENT_TIERS) {
      for (const discipline of DISCIPLINES) {
        for (const attainment of ATTAINMENTS) {
          for (const secondary of [undefined, 'boxing' as CombatDiscipline]) {
            const fixed = reconcileOrigin({ talent, discipline, secondary, attainment });
            expect(
              validateOrigin(fixed, ATTAINMENT_META[fixed.attainment].minDebutAge),
              `${talent}/${discipline}/${secondary}/${attainment}`,
            ).toHaveLength(0);
          }
        }
      }
    }
  });
});

describe('what the player is told', () => {
  it('describes the fiction and never a number', () => {
    const line = describeOrigin({
      talent: 'freak',
      discipline: 'wrestling',
      secondary: 'boxing',
      attainment: 'world',
    });
    expect(line).toContain('Wrestling');
    expect(line).toContain('Boxing');
    expect(line).toMatch(/freak/i);
    // No ceilings, no naturals, no ratings: doc/06's rule is that hiding potential is what
    // makes coaches, scouting and camps worth anything, and a summary line is the easiest
    // place in the game to leak it.
    expect(line).not.toMatch(/\d/);
  });

  it('says "club level" rather than "amateur boxing" for somebody who played rugby', () => {
    const line = describeOrigin({ talent: 'freak', discipline: 'contactSport', attainment: 'world' });
    expect(line).toMatch(/international/i);
    expect(line).toMatch(/no fighting/i);
  });

  it('gives every discipline and tier a blurb and a named weakness', () => {
    for (const discipline of DISCIPLINES) {
      const meta = DISCIPLINE_META[discipline];
      expect(meta.label.length, discipline).toBeGreaterThan(2);
      expect(meta.blurb.length, discipline).toBeGreaterThan(20);
      expect(meta.weakness.length, discipline).toBeGreaterThan(20);
    }
    for (const talent of TALENT_TIERS) {
      expect(TALENT_META[talent].blurb.length).toBeGreaterThan(20);
      expect(TALENT_META[talent].cost.length).toBeGreaterThan(20);
    }
  });
});

/**
 * The body you said you were building.
 *
 * The complaint that produced these: a player built a rangy taekwondo fighter, spent discretionary
 * points on speed, and was shown a speed of 66 against a ceiling of 70 — a fighter the game had
 * already decided was not going to be quick, built by somebody who had chosen nothing else.
 *
 * Three separate things were doing it, and each has an assertion here. Rangy secretly cost four
 * points of explosiveness, which is the driver of speed. The discipline's bias and the allocated
 * points were added to the *current* rating and then used to raise the ceiling onto it, so
 * investing closed the door above you. And every physical carried an 18% discount that no
 * generated fighter of the same age pays.
 */
describe('what a created fighter is physically', () => {
  const speedOf = (origin: FighterOrigin, extra: Partial<Parameters<typeof createPlayerFighter>[0]> = {}) => {
    const values: number[] = [];
    const ceilings: number[] = [];
    for (let i = 0; i < 150; i++) {
      const f = createPlayerFighter(
        {
          id: `phys_${i}`,
          firstName: 'Test',
          lastName: 'Player',
          nationality: 'USA',
          sex: 'male',
          age: 22,
          divisionId: asDivisionId('mens-lightweight'),
          origin,
          day: 0,
          ...extra,
        },
        createRng(`phys:${JSON.stringify(origin)}:${JSON.stringify(extra)}:${i}`),
      );
      values.push(f.attributes.speed);
      ceilings.push(f.potential.speed);
    }
    return { speed: mean(values), ceiling: mean(ceilings) };
  };

  const karate: FighterOrigin = { talent: 'natural', discipline: 'karate', attainment: 'regional' };

  it('debuts a fast fighter fast, rather than at the middle of the scale', () => {
    /*
     * The headline number. A natural out of a speed discipline who spent points on speed measured
     * 66 before this and 77 after it, and the sport agrees with the second one: explosive power is
     * overwhelmingly heritable and a twenty-two-year-old is as quick as they are ever going to be.
     * What they have not got is hands, and they still have not got hands.
     */
    const { speed } = speedOf(karate, { build: 'rangy', allocation: { speed: 5 } });
    expect(speed).toBeGreaterThan(73);
  });

  it('scales it by talent, so a freak reads as one and a grinder does not', () => {
    const freak = speedOf({ ...karate, talent: 'freak' }, { build: 'rangy', allocation: { speed: 5 } });
    const grinder = speedOf(
      { ...karate, talent: 'grinder' },
      { build: 'rangy', allocation: { speed: 5 } },
    );
    // Measured 81 / 77 / 72 across the three tiers. Every one of them is a quick fighter, and
    // they are quick to visibly different degrees.
    expect(freak.speed).toBeGreaterThan(79);
    expect(grinder.speed).toBeLessThan(freak.speed - 5);
  });

  it('leaves room above the fighter, so investing does not close the door', () => {
    /*
     * The reading that made the old behaviour feel like a verdict. Points spent on a physical
     * used to be added to the rating and then have the ceiling dragged up onto them, so a player
     * who chose speed was told they were at their limit for the thing they had just chosen.
     */
    const { speed, ceiling } = speedOf(karate, { build: 'rangy', allocation: { speed: 8 } });
    expect(ceiling - speed).toBeGreaterThan(3);
  });

  it('makes spending points on a physical raise the ceiling, not just the number', () => {
    const spent = speedOf(karate, { allocation: { speed: 8 } });
    const unspent = speedOf(karate, { allocation: {} });
    expect(spent.ceiling).toBeGreaterThan(unspent.ceiling + 2);
    expect(spent.speed).toBeGreaterThan(unspent.speed + 1);
  });

  it('does not quietly make a rangy fighter a slow one', () => {
    // "Long and light for the weight" is not a speed penalty in any sport, and the label never
    // claimed it was. It used to cost four points of explosiveness.
    const rangy = speedOf(karate, { build: 'rangy' });
    const balanced = speedOf(karate, { build: 'balanced' });
    expect(rangy.speed).toBeGreaterThan(balanced.speed - 1.5);
  });

  it('arrives near the body and nowhere near the technique', () => {
    /*
     * The shape of a debutant, stated as a single claim: the physicals are most of the way to
     * their ceilings and the skills are not. This is what makes the climb technical, which is
     * where a career's growth is supposed to come from.
     */
    const f = build({ talent: 'natural', discipline: 'wrestling', attainment: 'regional' }, 'shape', 22);
    const physicalShare = mean(
      ATTRIBUTES_BY_GROUP.physical.map((k) => f.attributes[k] / f.potential[k]),
    );
    const skills = ATTRIBUTE_KEYS.filter((k) => !ATTRIBUTES_BY_GROUP.physical.includes(k));
    const skillShare = mean(skills.map((k) => f.attributes[k] / f.potential[k]));

    expect(physicalShare).toBeGreaterThan(0.85);
    expect(skillShare).toBeLessThan(physicalShare);
  });
});

describe('a created fighter is still a prospect, whatever the origin', () => {
  it('debuts below the professional roster from every corner of the design', () => {
    /*
     * The strongest corner is a freak who medalled at world level and therefore debuts at 25 with
     * three extra years of `experience` in the baseline. Measured at 56.0 against a seed-roster
     * floor of 51.1 and a median of 67.5: better than the worst professional alive, and eleven
     * points off the middle of the roster. That is the right answer — an Olympic medallist is not
     * worse than every pro — and the bound here is that it stays a debut rather than becoming a
     * head start.
     *
     * Re-baselined from 56 with the physical rewrite in `createFighter.ts`. A created fighter's
     * five physicals now arrive on the same age curve every generated fighter uses instead of
     * carrying an extra 18% discount nobody else paid, which is worth about three points of
     * overall; the skill baseline came down two points against it, so the debut moved by one. The
     * bound moved by two so it is measuring the claim rather than tracking the measurement.
     */
    for (const talent of TALENT_TIERS) {
      for (const discipline of disciplinesForTalent(talent)) {
        for (const attainment of attainmentsForTalent(talent)) {
          const age = Math.max(25, ATTAINMENT_META[attainment].minDebutAge);
          const s = sample({ talent, discipline, attainment }, 40, age);
          expect(s.startOverall, `${talent}/${discipline}/${attainment}`).toBeLessThan(58);
        }
      }
    }
  });

  it('always has somewhere left to grow, in every attribute', () => {
    const corners: FighterOrigin[] = [
      { talent: 'freak', discipline: 'wrestling', secondary: 'boxing', attainment: 'world' },
      { talent: 'grinder', discipline: 'jiuJitsu', attainment: 'amateur' },
      { talent: 'natural', discipline: 'enduranceSport', attainment: 'national' },
    ];
    for (const origin of corners) {
      for (let i = 0; i < 40; i++) {
        const f = build(origin, `room:${origin.discipline}:${i}`, 25);
        for (const key of ATTRIBUTE_KEYS) {
          expect(f.potential[key], `${origin.discipline} ${key}`).toBeGreaterThan(f.attributes[key]);
        }
      }
    }
  });

  it('still has a real hole, like everybody else on the roster', () => {
    for (const discipline of DISCIPLINES as readonly Discipline[]) {
      for (let i = 0; i < 10; i++) {
        const f = build({ talent: 'freak', discipline, attainment: 'regional' }, `hole:${discipline}:${i}`);
        expect(Math.min(...ATTRIBUTE_KEYS.map((k) => f.attributes[k])), discipline).toBeLessThan(52);
      }
    }
  });
});

describe('the deprecated flat background still works', () => {
  const legacy = () =>
    createPlayerFighter(
      {
        id: 'p',
        firstName: 'A',
        lastName: 'B',
        nationality: 'USA',
        sex: 'male',
        age: 22,
        divisionId: asDivisionId('mens-lightweight'),
        background: 'wrestler',
        build: 'balanced',
        day: 0,
      },
      createRng('legacy-golden'),
    );

  it('builds the exact fighter it built before the origin system existed', () => {
    /*
     * A golden record, not a property.
     *
     * The long-sim career suite asserts a *distribution* over forty seeded careers built
     * through this path — start, peak, peak age, share of ceiling reached, how many turn out
     * champion-calibre — and every one of those bounds was measured against these numbers.
     * A property test would pass while quietly shifting all of them, so this pins the actual
     * output for one seed: if the legacy route ever stops being bit-identical, it fails here
     * rather than in a fifteen-minute suite nobody runs on a commit.
     *
     * **Re-baselined at doc 23.** The first five entries are the physicals and they moved a long
     * way on purpose: they used to be a flat 46 plus an age term and are now derived from this
     * fighter's own body, so a 22-year-old with explosiveness 78 finally debuts with the speed
     * and chin that implies rather than with 49 and 47. The ten skills are essentially unchanged,
     * which is the other half of the claim — a debutant has a body and no technique.
     *
     * **Re-baselined again with the physical arrival rewrite.** The physicals moved up a second
     * time and for the same reason one layer down: a created fighter was paying an 18% discount
     * on top of the age curve that no generated fighter pays, so an identical body was slower
     * through the create screen than through the generator. Speed 66 → 80 and durability 63 → 77
     * on this seed, which is simply what explosiveness 78 and motor learning 86 have always
     * implied. The skills came down two points with `BASELINE`, which is the deliberate other
     * half: the debut overall is where it was, and the fighter underneath it is an athlete with
     * a novice's hands rather than somebody uniformly mediocre.
     *
     * **Re-baselined a third time for the body model** (doc 31 § 12 step 2), and this one barely
     * moved the ratings at all: **strength 57 → 56, and nothing else.** Walking weight is now
     * derived from a rolled body rather than from `division.limitLbs × 1.07`, which put this
     * fighter at 163 lb instead of 166, and `frame` — still walking weight on a 0–100 scale until
     * step 4 replaces it — carries that single point into strength.
     *
     * The *body* moved a long way, which is the actual point of the change and is why it is now
     * asserted here. This fighter was 5'6" with a 67" reach, three to four inches shorter than any
     * real lightweight and with no reach advantage at all, because height came from a remap linear
     * in the division limit. He is now 5'9" with a 73" reach.
     */
    const f = legacy();
    expect(ATTRIBUTE_KEYS.map((k) => f.attributes[k])).toEqual([
      62, 80, 65, 77, 56, 46, 44, 47, 61, 60, 51, 44, 44, 47, 45,
    ]);
    expect(f.naturals.explosiveness).toBe(78);
    expect(f.naturals.motorLearning).toBe(86);
    expect(f.reputation).toBe(5);
    expect(f.starPower).toBe(1);
    // The body, pinned for the same reason the ratings are: it is what the change was for.
    expect([f.heightInches, f.reachInches, f.walkingWeightLbs]).toEqual([69, 73, 163]);
  });

  it('accepts a spec with no build, which used to be required', () => {
    expect(() =>
      createPlayerFighter(
        {
          id: 'p',
          firstName: 'A',
          lastName: 'B',
          nationality: 'USA',
          sex: 'male',
          age: 22,
          divisionId: asDivisionId('mens-lightweight'),
          background: 'boxer',
          day: 0,
        },
        createRng('nobuild'),
      ),
    ).not.toThrow();
  });

  it('prefers the origin when a spec carries both', () => {
    const both = createPlayerFighter(
      {
        id: 'p',
        firstName: 'A',
        lastName: 'B',
        nationality: 'USA',
        sex: 'male',
        age: 25,
        divisionId: asDivisionId('mens-lightweight'),
        background: 'wrestler',
        origin: { talent: 'natural', discipline: 'boxing', attainment: 'regional' },
        day: 0,
      },
      createRng('both'),
    );
    expect(both.attributes.strikingOffence).toBeGreaterThan(both.attributes.wrestling);
  });

  it('refuses a spec that says nothing about where the fighter came from', () => {
    expect(
      validateCreation({
        id: 'p',
        firstName: 'A',
        lastName: 'B',
        nationality: 'USA',
        sex: 'male',
        age: 22,
        divisionId: asDivisionId('mens-lightweight'),
        day: 0,
      }).some((i) => i.field === 'origin'),
    ).toBe(true);
  });
});
