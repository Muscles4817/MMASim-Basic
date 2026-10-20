import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_KEYS,
  DIVISIONS,
  careerSummary,
  cutSeverityOf,
  bodyOf,
  findTraitConflicts,
  overallRating,
  ratingBand,
  type Fighter,
} from '@mmasim/engine';
import { ALL_FIGHTER_SPECS, buildSeedFighters } from './index.js';
import {
  SEED_COACHES,
  SEED_GYMS,
  SEED_JUDGES,
  SEED_PROMOTIONS,
  SEED_REFEREES,
} from './organisations.js';

const fighters = buildSeedFighters();
const byId = new Map(fighters.map((f) => [f.id as string, f]));
const get = (id: string): Fighter => {
  const f = byId.get(id);
  if (!f) throw new Error(`No seeded fighter "${id}"`);
  return f;
};

describe('seed roster integrity', () => {
  it('builds every spec with a unique id', () => {
    expect(fighters).toHaveLength(ALL_FIGHTER_SPECS.length);
    expect(new Set(fighters.map((f) => f.id)).size).toBe(fighters.length);
  });

  it('covers every division', () => {
    const covered = new Set(fighters.map((f) => f.divisionId as string));
    for (const division of DIVISIONS) {
      expect(covered, `no fighters seeded in ${division.name}`).toContain(division.id as string);
    }
  });

  it('places every fighter in a division matching their sex', () => {
    for (const f of fighters) {
      const division = DIVISIONS.find((d) => d.id === f.divisionId)!;
      expect(division.sex, `${f.lastName} is in the wrong division`).toBe(f.sex);
    }
  });

  it('gives every fighter valid ratings', () => {
    for (const f of fighters) {
      for (const key of ATTRIBUTE_KEYS) {
        const v = f.attributes[key];
        expect(Number.isInteger(v), `${f.lastName}.${key} is not an integer`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('gives nobody a set of contradictory traits', () => {
    for (const f of fighters) {
      expect(findTraitConflicts(f.traits), `${f.lastName} has conflicting traits`).toHaveLength(0);
    }
  });

  it('sets a potential ceiling at or above every current rating', () => {
    for (const f of fighters) {
      for (const key of ATTRIBUTE_KEYS) {
        expect(f.potential[key], `${f.lastName}.${key}`).toBeGreaterThanOrEqual(f.attributes[key]);
      }
    }
  });

  it('gives fighters over 33 essentially no remaining upside', () => {
    for (const f of fighters) {
      const spec = ALL_FIGHTER_SPECS.find((s) => s.id === (f.id as string))!;
      if (spec.age < 34 || spec.upside !== undefined) continue;
      const totalUpside = ATTRIBUTE_KEYS.reduce(
        (acc, key) => acc + (f.potential[key] - f.attributes[key]),
        0,
      );
      expect(totalUpside, `${f.lastName} is ${spec.age} with upside left`).toBe(0);
    }
  });

  it('records a career that survives the record round-trip', () => {
    for (const f of fighters) {
      const career = careerSummary(f);
      expect(career.wins + career.losses).toBeGreaterThan(0);
      expect(career).toEqual(f.summary);
    }
  });

  it('assigns everyone to a promotion that exists', () => {
    const promotionIds = new Set(SEED_PROMOTIONS.map((p) => p.id as string));
    for (const f of fighters) {
      expect(promotionIds).toContain(f.promotionId as string);
    }
  });

  it('assigns gym members to gyms that exist, with that gym’s head coach', () => {
    const gyms = new Map(SEED_GYMS.map((g) => [g.id as string, g]));
    for (const f of fighters) {
      if (!f.gymId) continue;
      const gym = gyms.get(f.gymId as string);
      expect(gym, `${f.lastName} is at an unknown gym`).toBeDefined();
      expect(f.headCoachId).toBe(gym!.headCoachId);
    }
  });
});

describe('honest ratings (docs/02 § Rating the seed roster honestly)', () => {
  /** A fighter's weakest attribute relative to their best. Flat fighters are unexploitable. */
  const spread = (f: Fighter): number => {
    const values = ATTRIBUTE_KEYS.map((k) => f.attributes[k]);
    return Math.max(...values) - Math.min(...values);
  };

  it('gives every fighter something an opponent can build a game plan around', () => {
    // "If a seeded fighter has no exploitable weakness, the rating is wrong."
    //
    // Stated as *spread* rather than an absolute floor, because both halves matter and the
    // absolute version is wrong. Robert Whittaker's lowest rating is 56 and he is correctly
    // rated: a well-rounded champion whose weakest area is merely average is still someone
    // you attack there. What must not exist is a fighter who is uniformly excellent, since
    // there is no fight to plan against them.
    //
    // Fighters with no in-cage gap at all — Jon Jones' lowest rating is Power 70 — qualify
    // through a flaw outside the cage, which for him is every bit as career-defining.
    // Inventing a fake attribute hole for those fighters would be as dishonest as inflating
    // everyone else.
    for (const f of fighters) {
      const hasCharacterFlaw =
        f.personality.professionalism <= 35 ||
        f.personality.discipline <= 35 ||
        f.personality.resilience <= 45;
      const hasNegativeTrait = f.traits.some((t) =>
        (
          [
            'chinny',
            'glassCannon',
            'gunShy',
            'fragileEgo',
            'partyAnimal',
            'mercenary',
            'gatekeeperMentality',
            'injuryProne',
          ] as const
        ).includes(t as never),
      );

      expect(
        spread(f) >= 22 || hasCharacterFlaw || hasNegativeTrait,
        `${f.lastName} is too flat to plan against (spread ${spread(f)})`,
      ).toBe(true);
    }
  });

  it('gives most of the roster an outright below-level hole', () => {
    // Spread alone would let the whole roster drift upward together. Most fighters — even
    // ranked ones — should have at least one area that is genuinely below the level.
    const withHole = fighters.filter(
      (f) => Math.min(...ATTRIBUTE_KEYS.map((k) => f.attributes[k])) < 55,
    );
    expect(withHole.length / fighters.length, 'too few fighters with a real hole').toBeGreaterThan(
      0.6,
    );
  });

  it('contains nobody who is uniformly excellent', () => {
    for (const f of fighters) {
      const lowest = Math.min(...ATTRIBUTE_KEYS.map((k) => f.attributes[k]));
      expect(lowest, `${f.lastName} has no rated weakness at all`).toBeLessThan(75);
    }
  });

  it('justifies every fighter’s ratings in a note', () => {
    for (const f of fighters) {
      expect(f.notes, `${f.lastName} has no rating justification`).toBeTruthy();
      expect(f.notes!.length, `${f.lastName}'s note is too thin`).toBeGreaterThan(80);
    }
  });

  it('keeps the rating distribution sane for a top-of-division seed', () => {
    // Guards against the slow inflation that eventually makes every rating meaningless.
    //
    // The thresholds are looser than the population bands in docs/02 on purpose: this seed
    // is deliberately a snapshot of ranked fighters, not a full roster. A pool that is
    // almost entirely champions and contenders *should* be elite-heavy. What must not
    // happen is all-time ratings becoming common or weaknesses disappearing.
    const all = fighters.flatMap((f) => ATTRIBUTE_KEYS.map((k) => f.attributes[k]));
    const atgShare = all.filter((v) => v >= 96).length / all.length;
    const eliteShare = all.filter((v) => v >= 82).length / all.length;
    const weakShare = all.filter((v) => v < 55).length / all.length;

    expect(atgShare, 'too many all-time ratings').toBeLessThan(0.005);
    expect(eliteShare, 'too many elite ratings even for a ranked-only seed').toBeLessThan(0.24);
    // The per-fighter flaw assertion above is the real guard; this is the population-level
    // backstop against everyone drifting upward together.
    expect(weakShare, 'not enough genuine weaknesses').toBeGreaterThan(0.1);
  });

  it('does not launder reputation — star power and ability are decoupled', () => {
    // The roster must contain both draws who are mediocre fighters and excellent fighters
    // nobody pays to watch, or Star Power is just a second ability rating.
    const bigDrawMediocre = fighters.filter(
      (f) => f.starPower >= 60 && overallRating(f.attributes) < 68,
    );
    const eliteNoDraw = fighters.filter(
      (f) => f.starPower <= 45 && overallRating(f.attributes) >= 75,
    );
    expect(bigDrawMediocre.length, 'no draws who are mediocre fighters').toBeGreaterThan(0);
    expect(eliteNoDraw.length, 'no elite fighters the market ignores').toBeGreaterThan(2);
  });

  it('does not sanitise personality — the roster contains real problems', () => {
    const unprofessional = fighters.filter((f) => f.personality.professionalism <= 45);
    const undisciplined = fighters.filter((f) => f.personality.discipline <= 45);
    expect(unprofessional.length, 'nobody has a professionalism problem').toBeGreaterThan(4);
    expect(undisciplined.length, 'nobody has a discipline problem').toBeGreaterThan(3);
  });

  it('gives the biggest names their real flaws rather than muting them', () => {
    // Named assertions, because "the distribution looks fine" is exactly how the specific
    // cases get quietly softened over time.
    expect(get('f_mcgregor').personality.professionalism).toBeLessThanOrEqual(25);
    expect(get('f_jones').personality.professionalism).toBeLessThanOrEqual(30);
    expect(get('f_ngannou').attributes.cardio).toBeLessThan(55);
    expect(get('f_lewis').attributes.cardio).toBeLessThan(40);
    expect(get('f_adesanya').attributes.wrestling).toBeLessThan(45);
    expect(get('f_covington').attributes.power).toBeLessThan(50);
    expect(get('f_thompson').attributes.wrestling).toBeLessThan(35);
    expect(get('f_overeem').attributes.durability).toBeLessThan(50);
    expect(get('f_khabib').attributes.kicking).toBeLessThan(50);
  });
});

describe('absolute ratings across divisions (design pillar 2)', () => {
  it('makes heavyweight power genuinely larger than flyweight power', () => {
    const hw = fighters.filter((f) => f.divisionId === 'mens-heavyweight');
    const flw = fighters.filter((f) => f.divisionId === 'mens-flyweight');
    const avg = (fs: Fighter[]) => fs.reduce((a, f) => a + f.attributes.power, 0) / fs.length;
    expect(avg(hw)).toBeGreaterThan(avg(flw) + 20);
  });

  it('keeps skill and mental ratings on the same scale for everyone', () => {
    // Absolute physical ratings must not bleed into skill: a flyweight can be the best
    // technical fighter alive.
    const hw = fighters.filter((f) => f.divisionId === 'mens-heavyweight');
    const small = fighters.filter(
      (f) => f.divisionId === 'mens-flyweight' || f.divisionId === 'mens-bantamweight',
    );
    const avgIq = (fs: Fighter[]) => fs.reduce((a, f) => a + f.attributes.fightIq, 0) / fs.length;
    expect(Math.abs(avgIq(hw) - avgIq(small))).toBeLessThan(12);
  });

  it('rates a division-best small fighter above an average heavyweight in skill', () => {
    expect(get('f_shevchenko').attributes.fightIq).toBeGreaterThan(
      get('f_rozenstruik').attributes.fightIq,
    );
  });

  it('makes the outliers actually outliers', () => {
    expect(get('f_ngannou').attributes.power).toBe(99);
    expect(get('f_khabib').attributes.groundControl).toBe(99);
    expect(get('f_dvalishvili').attributes.cardio).toBe(97);
  });

  it('gives every fighter a realistic weight cut for their division', () => {
    for (const f of fighters) {
      const severity = cutSeverityOf(bodyOf(f), f.divisionId);
      expect(severity, `${f.lastName}'s cut is impossible`).toBeLessThanOrEqual(1);
    }
  });

  it('flags the known weight-cut gamblers with genuinely severe cuts', () => {
    for (const f of fighters.filter((x) => x.traits.includes('weightCutGambler'))) {
      expect(cutSeverityOf(bodyOf(f), f.divisionId), `${f.lastName}`).toBeGreaterThan(0.2);
    }
  });
});

describe('seed organisations', () => {
  it('creates competing promotions across the market', () => {
    expect(SEED_PROMOTIONS.length).toBeGreaterThanOrEqual(4);
    const tiers = new Set(SEED_PROMOTIONS.map((p) => p.tier));
    expect(tiers).toContain('global');
    expect(tiers).toContain('major');
    expect(tiers).toContain('regional');
    // A single dominant promotion must have real competition or free agency is meaningless.
    expect(SEED_PROMOTIONS.filter((p) => p.tier === 'major').length).toBeGreaterThanOrEqual(2);
  });

  it('runs only divisions that exist', () => {
    const ids = new Set(DIVISIONS.map((d) => d.id as string));
    for (const p of SEED_PROMOTIONS) {
      for (const d of p.divisions) expect(ids).toContain(d as string);
    }
  });

  it('gives gyms head coaches that exist', () => {
    const coachIds = new Set(SEED_COACHES.map((c) => c.id as string));
    for (const gym of SEED_GYMS) {
      if (gym.headCoachId) expect(coachIds).toContain(gym.headCoachId as string);
    }
  });

  it('makes coaches specialists rather than uniformly good', () => {
    for (const c of SEED_COACHES) {
      const spread =
        Math.max(c.scouting, c.gamePlanning, c.development, c.cornering) -
        Math.min(c.scouting, c.gamePlanning, c.development, c.cornering);
      expect(spread, `${c.lastName} is uniformly rated`).toBeGreaterThan(8);
      expect(c.specialisms.length).toBeGreaterThan(0);
    }
  });

  it('gives referees genuinely different tendencies', () => {
    const triggers = SEED_REFEREES.map((r) => r.stoppageTrigger);
    expect(Math.max(...triggers) - Math.min(...triggers)).toBeGreaterThan(40);
    const standUps = SEED_REFEREES.map((r) => r.standUpSpeed);
    expect(Math.max(...standUps) - Math.min(...standUps)).toBeGreaterThan(40);
  });

  it('includes at least one genuinely unreliable judge', () => {
    // Cards nobody can explain are a real feature of the sport; the pool needs one.
    expect(SEED_JUDGES.some((j) => j.consistency < 50)).toBe(true);
    expect(new Set(SEED_JUDGES.map((j) => JSON.stringify(j.bias))).size).toBeGreaterThan(3);
  });
});

describe('rating bands are used as documented', () => {
  it('places the roster’s best ratings in the top bands', () => {
    expect(ratingBand(get('f_ngannou').attributes.power).key).toBe('allTime');
    expect(ratingBand(get('f_adesanya').attributes.strikingOffence).key).toBe('worldBest');
    expect(ratingBand(get('f_pennington').attributes.power).key).toBe('average');
  });
});
