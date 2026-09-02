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
  describeOrigin,
  isAthleticOrigin,
  reconcileOrigin,
  resolveOrigin,
  secondaryOptionsFor,
  type Attainment,
  type CombatDiscipline,
  type Discipline,
  type FighterOrigin,
} from './origin.js';
import {
  createPlayerFighter,
  previewWeightFit,
  validateCreation,
  validateOrigin,
  type CreateFighterSpec,
} from './createFighter.js';
import { getDivision } from '../domain/divisions.js';
import { walkingWeightOf } from './body.js';

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
  const fighters = Array.from({ length: n }, (_, i) =>
    build(origin, `s:${JSON.stringify(origin)}:${i}`, age),
  );
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

/*
 * **The layer-1 describe that used to sit here is deleted with the layer.**
 *
 * It asserted three things about the talent tiers: that they ordered fighters by what they could
 * eventually become, that they showed in the body on debut and barely at all in the skills, and
 * that a tier never guaranteed anything because the roll was wide. All three were true and all
 * three were about a question the player should never have been asked — see the note in `origin.ts`
 * where the layer was. What survives of them is asserted against attainment instead, in
 * "attainment is what a career is evidence of" below.
 */

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
    expect(new Set(totals).size, `combat disciplines differ in total: ${totals.join(', ')}`).toBe(
      1,
    );
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
      const mine = sample({ discipline, attainment: 'regional' }, 60);
      for (const other of COMBAT_DISCIPLINES) {
        if (other === discipline) continue;
        if (signature[other] === signature[discipline]) continue;
        const theirs = sample({ discipline: other, attainment: 'regional' }, 60);
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
    const karate = sample({ discipline: 'karate', attainment: 'regional' });
    const kickboxer = sample({
      discipline: 'kickboxing',
      attainment: 'regional',
    });
    expect(karate.attribute('speed')).toBeGreaterThan(kickboxer.attribute('speed') + 4);
    expect(kickboxer.attribute('strikingOffence')).toBeGreaterThan(
      karate.attribute('strikingOffence') + 4,
    );
  });

  describe('the non-combat branch', () => {
    it('debuts with almost nothing technical', () => {
      const boxer = sample({ discipline: 'boxing', attainment: 'regional' });
      for (const athletic of ATHLETIC_ORIGINS) {
        const athlete = sample({ discipline: athletic, attainment: 'regional' });
        const gap =
          TECHNICAL.reduce((a, k) => a + boxer.attribute(k) - athlete.attribute(k), 0) /
          TECHNICAL.length;
        expect(gap, `${athletic} is not far enough behind a boxer technically`).toBeGreaterThan(4);
      }
    });

    it('has the highest ceilings in the game', () => {
      const bestCombat = Math.max(
        ...COMBAT_DISCIPLINES.map(
          (d) => sample({ discipline: d, attainment: 'regional' }, 80).ceilingOverall,
        ),
      );
      for (const athletic of ATHLETIC_ORIGINS) {
        const athlete = sample({ discipline: athletic, attainment: 'regional' }, 80);
        expect(
          athlete.ceilingOverall,
          `${athletic} does not out-ceiling every combat art`,
        ).toBeGreaterThan(bestCombat);
      }
    });

    it('is a real trade: worse today in exchange for that', () => {
      const boxer = sample({ discipline: 'boxing', attainment: 'regional' });
      const athlete = sample({
        discipline: 'sprints',
        attainment: 'regional',
      });
      expect(athlete.startOverall).toBeLessThan(boxer.startOverall);
      expect(athlete.ceilingOverall).toBeGreaterThan(boxer.ceilingOverall);
    });

    it('specialises in different physical qualities rather than being one option five times', () => {
      const at = (discipline: Discipline) => sample({ discipline, attainment: 'regional' });
      const sprint = at('sprints');
      const throwing = at('throws');
      const contact = at('contactSport');
      const row = at('rowing');
      const distance = at('distanceRunning');

      expect(sprint.ceiling('speed')).toBeGreaterThan(distance.ceiling('speed'));
      expect(distance.ceiling('cardio')).toBeGreaterThan(sprint.ceiling('cardio'));
      expect(contact.ceiling('durability')).toBeGreaterThan(sprint.ceiling('durability'));

      /*
       * The two splits doc 31 § 12 step 9 made, asserted as the separations that justify them.
       * Before `forceVelocityBias` and the body layer existed, each of these pairs was one menu
       * entry because the engine had no number that could tell them apart — so if either pair ever
       * collapses back together, the split has stopped being honest and should be undone rather
       * than left as a wider menu that means nothing.
       */
      expect(throwing.ceiling('strength')).toBeGreaterThan(sprint.ceiling('strength') + 8);
      expect(sprint.ceiling('speed')).toBeGreaterThan(throwing.ceiling('speed') + 8);
      expect(row.ceiling('strength')).toBeGreaterThan(distance.ceiling('strength') + 5);
    });

    it('is open to everybody, because the gate that closed it was a talent tier', () => {
      /*
       * This asserted the opposite until step 10: the athletic branch was hidden below Natural,
       * because it was the tier that made it good. With `talent` gone, what makes an athletic
       * origin worth taking is its own naturals lean, and what it costs is eighteen points of
       * skill against forty — a trade that is the same trade at every rung.
       */
      for (const athletic of ATHLETIC_ORIGINS) {
        expect(
          validateOrigin({ discipline: athletic, attainment: 'regional' }, 25),
          athletic,
        ).toHaveLength(0);
      }
      expect(DISCIPLINES.length).toBe(COMBAT_DISCIPLINES.length + ATHLETIC_ORIGINS.length);
    });
  });

  describe('the secondary discipline', () => {
    const wrestlerWhoBoxes: FighterOrigin = {
      discipline: 'wrestling',
      secondary: 'boxing',
      attainment: 'regional',
    };
    const boxerWhoWrestles: FighterOrigin = {
      discipline: 'boxing',
      secondary: 'wrestling',
      attainment: 'regional',
    };

    it('is worth roughly a third of the primary', () => {
      const resolved = resolveOrigin(wrestlerWhoBoxes);
      const pureWrestler = resolveOrigin({
        discipline: 'wrestling',
        attainment: 'regional',
      });
      const pureBoxer = resolveOrigin({
        discipline: 'boxing',
        attainment: 'regional',
      });

      const wrestlingShare =
        (resolved.attributes.wrestling ?? 0) / (pureWrestler.attributes.wrestling ?? 1);
      const boxingShare =
        (resolved.attributes.strikingOffence ?? 0) / (pureBoxer.attributes.strikingOffence ?? 1);
      expect(boxingShare / wrestlingShare).toBeCloseTo(1 / 3, 5);
      expect(boxingShare).toBeCloseTo(SECONDARY_WEIGHT, 5);
    });

    it('never makes a fighter better overall, because it is paid for out of the primary', () => {
      const total = (o: FighterOrigin) =>
        Object.values(resolveOrigin(o).attributes).reduce((a, v) => a + v, 0);
      expect(total(wrestlerWhoBoxes)).toBeCloseTo(
        total({ discipline: 'wrestling', attainment: 'regional' }),
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
      const pureWrestler = sample({
        discipline: 'wrestling',
        attainment: 'regional',
      });
      const pureBoxer = sample({ discipline: 'boxing', attainment: 'regional' });
      expect(blend.attribute('wrestling')).toBeLessThan(pureWrestler.attribute('wrestling'));
      expect(blend.attribute('wrestling')).toBeGreaterThan(pureBoxer.attribute('wrestling'));
      expect(blend.attribute('strikingOffence')).toBeGreaterThan(
        pureWrestler.attribute('strikingOffence'),
      );
      expect(blend.attribute('strikingOffence')).toBeLessThan(
        pureBoxer.attribute('strikingOffence'),
      );
    });

    it('refuses a second art that is the same one, or that is not an art at all', () => {
      expect(secondaryOptionsFor('boxing')).not.toContain('boxing');
      expect(secondaryOptionsFor('sprints')).toHaveLength(0);
      for (const d of DISCIPLINES) {
        for (const s of secondaryOptionsFor(d)) {
          expect(isAthleticOrigin(s)).toBe(false);
        }
      }
      expect(
        validateOrigin({
          discipline: 'boxing',
          secondary: 'boxing',
          attainment: 'regional',
        }).length,
      ).toBeGreaterThan(0);
      expect(
        validateOrigin({
          discipline: 'sprints',
          secondary: 'boxing',
          attainment: 'regional',
        }).length,
      ).toBeGreaterThan(0);
    });
  });
});

describe('attainment is standing, and what a career is evidence of', () => {
  it('offers every rung to everybody, and charges for the top ones in years', () => {
    /*
     * `attainmentsForTalent` used to remove rungs from the top: Olympic below Freak was a
     * contradiction, so it simply was not on the menu. The claim was right and the mechanism was a
     * talent tier, so step 10 took both. What stops "Olympic" being the free pick now is the thing
     * that was always the real balance — you cannot medal at a world championship at nineteen and
     * turn professional at nineteen.
     */
    for (const attainment of ATTAINMENTS) {
      const min = ATTAINMENT_META[attainment].minDebutAge;
      expect(
        validateOrigin({ discipline: 'boxing', attainment }, min),
        `${attainment} at ${min}`,
      ).toHaveLength(0);
      expect(
        validateOrigin({ discipline: 'boxing', attainment }, min - 1).length,
        `${attainment} at ${min - 1}`,
      ).toBeGreaterThan(0);
    }
  });

  it('is what a career is evidence of, which is the job the talent tier used to do', () => {
    /*
     * The replacement for layer 1, and the assertion that it is a *shove* rather than a guarantee —
     * which is exactly what the deleted "never lets a tier guarantee anything" test asserted about
     * the thing this replaces.
     */
    const medallist = sample({ discipline: 'boxing', attainment: 'world' }, 200, 26);
    const clubman = sample({ discipline: 'boxing', attainment: 'amateur' }, 200, 26);

    expect(medallist.ceilingOverall).toBeGreaterThan(clubman.ceilingOverall + 3);

    const worst = Math.min(...medallist.fighters.map((f) => overallRating(f.potential)));
    const best = Math.max(...clubman.fighters.map((f) => overallRating(f.potential)));
    expect(best, 'the roll has to be able to beat the rung').toBeGreaterThan(worst);
  });

  it('starts a bigger name further up the queue', () => {
    const rep = (attainment: Attainment) =>
      build({ discipline: 'wrestling', attainment }, `rep:${attainment}`, 30);
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
      validateOrigin({ discipline: 'wrestling', attainment: 'world' }, 21).some(
        (i) => i.field === 'age',
      ),
    ).toBe(true);
  });

  it('moves the ceiling, which is exactly what it refused to do before step 10', () => {
    /*
     * This test asserted the opposite until step 10, and the inversion is the step.
     *
     * The old claim was that attainment must not touch naturals, because layer 1 already said how
     * good an athlete you were and letting a second layer say it would double-count. With layer 1
     * deleted there is no double to count — and refusing to let attainment speak would mean nothing
     * in the game says it at all, so a world medallist and a club amateur would roll identical
     * bodies.
     */
    const medallist = resolveOrigin({ discipline: 'wrestling', attainment: 'world' });
    const clubman = resolveOrigin({ discipline: 'wrestling', attainment: 'amateur' });

    expect(medallist.naturals.motorLearning!).toBeGreaterThan(clubman.naturals.motorLearning!);
    expect(medallist.naturals.explosiveness!).toBeGreaterThan(clubman.naturals.explosiveness!);

    // What it still must not do: change what the discipline itself said. A world-level wrestler is
    // a wrestler with better raw material, not a differently-shaped fighter.
    const shape = (r: ReturnType<typeof resolveOrigin>) =>
      (r.attributes.wrestling ?? 0) / (r.attributes.takedownDefence ?? 1);
    expect(shape(medallist)).toBeCloseTo(shape(clubman), 5);
  });

  it('keeps the naturals lean the size the deleted tiers were, and no larger', () => {
    /*
     * The tiers spanned 12 points of naturals centre, 64 to 76, and the roll around them has a
     * standard deviation of 11 to 16. Attainment inherits the job and should inherit the scale: an
     * evidence term that out-pulled the roll would be a talent dial wearing a career label, which
     * is the exact failure the old comment here was guarding against from the other side.
     */
    const spread = (key: 'explosiveness' | 'motorLearning') =>
      (ATTAINMENT_META.world.naturals[key] ?? 0) - (ATTAINMENT_META.amateur.naturals[key] ?? 0);
    expect(spread('explosiveness')).toBeGreaterThan(0);
    expect(spread('motorLearning')).toBeLessThanOrEqual(13);
    expect(ATTAINMENT_META.world.skill - ATTAINMENT_META.amateur.skill).toBeLessThan(1);
  });
});

describe('keeping an origin legal as the discipline changes', () => {
  /*
   * Two of the three tests that lived here are deleted with the layer that made them necessary.
   *
   * They asserted that dropping to a lower talent tier pulled an Olympic attainment down to the
   * highest rung that tier could reach, and swapped out a discipline the tier no longer offered.
   * Neither cascade exists now: attainment is open to everybody and so is the athletic branch, so
   * the only field another can invalidate is the secondary art.
   */

  it('drops a secondary that stopped being legal, and keeps one that did not', () => {
    expect(
      reconcileOrigin({
        discipline: 'sprints',
        secondary: 'boxing',
        attainment: 'world',
      }).secondary,
    ).toBeUndefined();
    expect(
      reconcileOrigin({
        discipline: 'wrestling',
        secondary: 'boxing',
        attainment: 'world',
      }).secondary,
    ).toBe('boxing');
  });

  it('produces something valid from anything', () => {
    for (const discipline of DISCIPLINES) {
      for (const attainment of ATTAINMENTS) {
        for (const secondary of [undefined, 'boxing' as CombatDiscipline]) {
          const fixed = reconcileOrigin({ discipline, secondary, attainment });
          expect(
            validateOrigin(fixed, ATTAINMENT_META[fixed.attainment].minDebutAge),
            `${discipline}/${secondary}/${attainment}`,
          ).toHaveLength(0);
        }
      }
    }
  });
});

describe('what the player is told', () => {
  it('describes the fiction and never a number', () => {
    const line = describeOrigin({
      discipline: 'wrestling',
      secondary: 'boxing',
      attainment: 'world',
    });
    expect(line).toContain('Wrestling');
    expect(line).toContain('Boxing');
    expect(line).toMatch(/olympic|world/i);
    // No ceilings, no naturals, no ratings: doc/06's rule is that hiding potential is what
    // makes coaches, scouting and camps worth anything, and a summary line is the easiest
    // place in the game to leak it.
    expect(line).not.toMatch(/\d/);
  });

  it('says "club level" rather than "amateur boxing" for somebody who played rugby', () => {
    const line = describeOrigin({
      discipline: 'contactSport',
      attainment: 'world',
    });
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
    for (const attainment of ATTAINMENTS) {
      const meta = ATTAINMENT_META[attainment];
      expect(meta.blurb.length, attainment).toBeGreaterThan(20);
      expect(meta.athleticBlurb.length, attainment).toBeGreaterThan(20);
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
  const speedOf = (
    origin: FighterOrigin,
    extra: Partial<Parameters<typeof createPlayerFighter>[0]> = {},
  ) => {
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

  const karate: FighterOrigin = { discipline: 'karate', attainment: 'regional' };

  it('debuts a fast fighter fast, rather than at the middle of the scale', () => {
    /*
     * The headline number from doc 30 § 4. A fighter out of a speed discipline measured 66 before
     * that work and 77 after it, and the sport agrees with the second one: explosive power is
     * overwhelmingly heritable and a twenty-two-year-old is as quick as they are ever going to be.
     * What they have not got is hands, and they still have not got hands.
     *
     * **The five allocated points that used to be in this call are gone**, and the number holds
     * without them, which is the step-10 claim: the discipline and the body were always doing the
     * work, and the points were a fourth channel saying the same thing a fourth time.
     */
    const { speed } = speedOf(karate, {});
    expect(speed).toBeGreaterThan(73);
  });

  it('scales it by attainment, so a world-level athlete reads as one', () => {
    const medallist = speedOf({ ...karate, attainment: 'world' }, { age: 26 });
    const clubman = speedOf({ ...karate, attainment: 'amateur' }, { age: 26 });

    /*
     * The replacement for the deleted "scales it by talent" test, and it is the same claim with the
     * lever moved: the fighter who actually got somewhere in a speed sport reads faster than the
     * one who did not, because getting somewhere in a speed sport is evidence about the athlete.
     *
     * The gap is smaller than the talent tiers' was, deliberately. A tier was a direct statement
     * about genetics; this is an inference from a career, and an inference should be worth less
     * than the thing it is about.
     */
    expect(medallist.speed).toBeGreaterThan(clubman.speed + 2);
  });

  it('leaves room above the fighter, so nothing is finished at debut', () => {
    /*
     * The reading that made the old behaviour feel like a verdict. Points spent on a physical used
     * to be added to the rating and then have the ceiling dragged up onto them, so a player who
     * chose speed was told they were at their limit for the thing they had just chosen. Physical
     * allocation is gone; the invariant it broke is asserted anyway, because the discipline's own
     * bias still moves the ceiling and could break it the same way.
     */
    const { speed, ceiling } = speedOf(karate, {});
    expect(ceiling - speed).toBeGreaterThan(3);
  });

  it('makes the body decide the physical, which is the whole point of the ladder', () => {
    /*
     * Replaces "makes spending points on a physical raise the ceiling", and replaces it with the
     * larger lever that took its place. A karateka who states a long light body is faster than one
     * who states a heavy one, and the difference is bigger than eight allocated points ever bought.
     */
    const light = speedOf(karate, { physique: { heightInches: 68, frameIndex: 25 } });
    const heavy = speedOf(karate, { physique: { heightInches: 74, frameIndex: 85 } });
    expect(light.speed).toBeGreaterThan(heavy.speed + 4);
    expect(light.ceiling).toBeGreaterThan(heavy.ceiling + 4);
  });

  it('does not quietly make a long fighter a slow one', () => {
    /*
     * "Long and light for the weight" is not a speed penalty in any sport, and `build`'s label
     * never claimed it was — it cost four points of explosiveness anyway (doc 30 § 4.1). `build` is
     * deleted, so the claim is now asserted on the thing that replaced it: at a fixed frame, extra
     * height must not make somebody slower than the reach it buys them is worth.
     */
    const long = speedOf(karate, {
      physique: { heightInches: 73, reachInches: 79, frameIndex: 40 },
    });
    const short = speedOf(karate, {
      physique: { heightInches: 69, reachInches: 71, frameIndex: 40 },
    });
    expect(long.speed).toBeGreaterThan(short.speed - 4);
  });

  it('arrives near the body and nowhere near the technique', () => {
    /*
     * The shape of a debutant, stated as a single claim: the physicals are most of the way to
     * their ceilings and the skills are not. This is what makes the climb technical, which is
     * where a career's growth is supposed to come from.
     */
    const f = build({ discipline: 'wrestling', attainment: 'regional' }, 'shape', 22);
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
    for (const discipline of DISCIPLINES) {
      for (const attainment of ATTAINMENTS) {
        const age = Math.max(25, ATTAINMENT_META[attainment].minDebutAge);
        const s = sample({ discipline, attainment }, 40, age);
        expect(s.startOverall, `${discipline}/${attainment}`).toBeLessThan(58);
      }
    }
  });

  it('always has somewhere left to grow, in every attribute', () => {
    const corners: FighterOrigin[] = [
      { discipline: 'wrestling', secondary: 'boxing', attainment: 'world' },
      { discipline: 'jiuJitsu', attainment: 'amateur' },
      { discipline: 'distanceRunning', attainment: 'national' },
    ];
    for (const origin of corners) {
      for (let i = 0; i < 40; i++) {
        const f = build(origin, `room:${origin.discipline}:${i}`, 25);
        for (const key of ATTRIBUTE_KEYS) {
          expect(f.potential[key], `${origin.discipline} ${key}`).toBeGreaterThan(
            f.attributes[key],
          );
        }
      }
    }
  });

  it('still has a real hole, like everybody else on the roster', () => {
    for (const discipline of DISCIPLINES as readonly Discipline[]) {
      for (let i = 0; i < 10; i++) {
        const f = build({ discipline, attainment: 'regional' }, `hole:${discipline}:${i}`);
        expect(Math.min(...ATTRIBUTE_KEYS.map((k) => f.attributes[k])), discipline).toBeLessThan(
          52,
        );
      }
    }
  });
});

/*
 * **The `describe` for the deprecated flat background is deleted with the path it tested.**
 *
 * It asserted that a `background: 'wrestler'` spec built the exact fighter it built before the
 * origin system existed, bit for bit, which was the right guard while anything still sent one.
 * Nothing has since the origin layers landed, and step 10 removed the code — a second creation
 * model with no callers is a disagreement waiting to happen rather than compatibility.
 */

describe('the body the player states, and what it costs to make the weight', () => {
  const spec = (over: Partial<CreateFighterSpec> = {}): CreateFighterSpec => ({
    id: 'wf',
    firstName: 'Test',
    lastName: 'Player',
    nationality: 'USA',
    sex: 'male',
    age: 25,
    divisionId: asDivisionId('mens-lightweight'),
    origin: { discipline: 'wrestling', attainment: 'regional' },
    day: 0,
    ...over,
  });

  it("is the player's, not the division's", () => {
    /*
     * The inversion step 10 exists for. `sampleBodyForDivision` rejection-samples until it finds a
     * body that belongs in the division the player picked, so the division chose the body: a player
     * who said "lightweight" got handed a lightweight-shaped person whatever else they said.
     */
    const f = createPlayerFighter(
      spec({ physique: { heightInches: 74, frameIndex: 70 } }),
      createRng('a'),
    );
    expect(f.heightInches).toBe(74);
    expect(walkingWeightOf(f)).toBeGreaterThan(
      getDivision(asDivisionId('mens-lightweight')).limitLbs,
    );
  });

  it('rolls anything the player has not said yet, so a half-filled screen is still valid', () => {
    expect(validateCreation(spec({ physique: {} }))).toHaveLength(0);
    expect(validateCreation(spec({ physique: { heightInches: 71 } }))).toHaveLength(0);
    const f = createPlayerFighter(spec({ physique: { heightInches: 71 } }), createRng('b'));
    expect(f.heightInches).toBe(71);
    expect(f.physique.frameIndex).toBeGreaterThan(0);
  });

  it('refuses a height nobody in the world could have', () => {
    expect(validateCreation(spec({ physique: { heightInches: 90 } })).length).toBeGreaterThan(0);
    expect(validateCreation(spec({ physique: { heightInches: 50 } })).length).toBeGreaterThan(0);
  });

  it('tells the player what the cut costs, and which divisions are open at all', () => {
    /*
     * The live Weight Fit panel, which is the payoff of the ladder on this screen: the division is
     * a consequence of the body rather than a free dropdown, and the player can see the cut they
     * are signing up for before they sign up for it.
     */
    const small = previewWeightFit(
      spec({ physique: { heightInches: 66, frameIndex: 30 } }),
      createRng('fit-small'),
    );
    const large = previewWeightFit(
      spec({ physique: { heightInches: 76, frameIndex: 90 } }),
      createRng('fit-large'),
    );

    expect(large.walkingWeightLbs).toBeGreaterThan(small.walkingWeightLbs + 40);
    expect(large.weighInFloorLbs).toBeGreaterThan(small.weighInFloorLbs);
    expect(large.cutFraction).toBeGreaterThan(small.cutFraction);
    // A big man has fewer divisions available to him, and lightweight is not one of them.
    expect(large.makeable.length).toBeLessThan(small.makeable.length);
    expect(large.fit).toBe('notViable');
    expect(small.fit).not.toBe('notViable');
  });

  it('itemises the cut rather than quoting one number', () => {
    const fit = previewWeightFit(
      spec({ physique: { heightInches: 71, frameIndex: 55 } }),
      createRng('c'),
    );
    expect(fit.campWeightLbs).toBeLessThan(fit.walkingWeightLbs);
    expect(fit.weighInFloorLbs).toBeLessThan(fit.campWeightLbs);
    expect(fit.campWeightLbs - fit.weighInFloorLbs).toBeCloseTo(fit.fightWeekLossLbs, 0);
  });
});
