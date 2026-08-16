import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asOfficialId } from '../core/ids.js';
import type { Referee } from '../domain/officials.js';
import { uniformPersonality } from '../domain/personality.js';
import {
  FOUL_META,
  carelessness,
  describeFoul,
  desperation,
  recoveryBenefit,
  refereeRuling,
  rollFoul,
  rollNoContest,
  type FoulType,
} from './fouls.js';

const referee = (foulTolerance: number): Referee => ({
  id: asOfficialId('ref'),
  name: 'Test Official',
  stoppageTrigger: 50,
  standUpSpeed: 50,
  foulTolerance,
  reputation: 'Test.',
});

describe('who fouls', () => {
  it('punishes indiscipline far more than unprofessionalism', () => {
    const base = uniformPersonality(50);
    const sloppy = carelessness({ ...base, discipline: 5 }, 0);
    const unprofessional = carelessness({ ...base, professionalism: 5 }, 0);
    const drilled = carelessness({ ...base, discipline: 95 }, 0);

    expect(sloppy).toBeGreaterThan(unprofessional);
    expect(drilled).toBeLessThan(sloppy * 0.5);
  });

  it('makes tired hands careless hands', () => {
    const p = uniformPersonality(50);
    expect(carelessness(p, 0.9)).toBeGreaterThan(carelessness(p, 0.1) * 1.5);
  });

  it('only makes a fighter desperate when they are losing', () => {
    const hothead = { ...uniformPersonality(50), ego: 95, discipline: 10 };
    // Nobody grabs the fence while winning.
    expect(desperation(hothead, 0.8)).toBe(1);
    expect(desperation(hothead, 0)).toBe(1);
    expect(desperation(hothead, -1)).toBeGreaterThan(1.5);
  });

  it('lets discipline hold a losing fighter honest', () => {
    const honest = { ...uniformPersonality(50), ego: 95, discipline: 95 };
    const cheat = { ...uniformPersonality(50), ego: 95, discipline: 10 };
    expect(desperation(honest, -1)).toBeLessThan(desperation(cheat, -1));
  });
});

describe('foul rates', () => {
  /** Fouls are texture. A fight full of them is a broken fight. */
  const rateOver = (exchanges: number, p = uniformPersonality(50), fatigue = 0.4) => {
    const rng = createRng('fouls');
    let count = 0;
    for (let i = 0; i < exchanges; i++) {
      if (
        rollFoul({
          rng,
          position: 'distance',
          actorPersonality: p,
          actorFatigue: fatigue,
          actorMomentum: 0,
          seconds: 12,
        })
      ) {
        count++;
      }
    }
    return count / exchanges;
  };

  it('stays rare for an average fighter', () => {
    // A three-round fight is roughly 60-70 exchanges across both corners. At this rate the
    // typical fight has no fouls at all and a minority have one, which is the sport.
    const rate = rateOver(20_000);
    expect(rate).toBeGreaterThan(0.005);
    expect(rate).toBeLessThan(0.05);
  });

  it('rises sharply for an undisciplined fighter who is exhausted', () => {
    const sloppy = { ...uniformPersonality(50), discipline: 8, professionalism: 15 };
    expect(rateOver(20_000, sloppy, 0.95)).toBeGreaterThan(rateOver(20_000) * 2.5);
  });

  it('never produces a ground foul on the feet, or vice versa', () => {
    const rng = createRng('positions');
    const seen = new Set<FoulType>();
    for (let i = 0; i < 30_000; i++) {
      const foul = rollFoul({
        rng,
        position: 'ground',
        actorPersonality: { ...uniformPersonality(50), discipline: 5 },
        actorFatigue: 0.9,
        actorMomentum: -1,
        seconds: 12,
      });
      if (foul) seen.add(foul);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const type of seen) {
      expect(FOUL_META[type].positions).toContain('ground');
    }
  });
});

describe('the referee', () => {
  const rulingsOver = (tolerance: number, type: FoulType, priorCalled: number, n = 4000) => {
    const rng = createRng('ruling');
    const counts = { unseen: 0, warning: 0, pointDeduction: 0, disqualification: 0 };
    for (let i = 0; i < n; i++) {
      counts[refereeRuling({ rng, referee: referee(tolerance), type, priorCalled })]++;
    }
    return counts;
  };

  it('lets a permissive referee miss things a strict one calls', () => {
    const lenient = rulingsOver(95, 'eyePoke', 0);
    const strict = rulingsOver(5, 'eyePoke', 0);
    expect(lenient.unseen).toBeGreaterThan(strict.unseen * 3);
  });

  it('escalates: the second offence costs a point far more often than the first', () => {
    const first = rulingsOver(30, 'fenceGrab', 0);
    const third = rulingsOver(30, 'fenceGrab', 2);
    expect(third.pointDeduction).toBeGreaterThan(first.pointDeduction * 1.5);
  });

  it('punishes cheating harder than harm', () => {
    // A fence grab is a trivial foul and a deliberate one; an eye poke is the reverse.
    const cynical = rulingsOver(50, 'fenceGrab', 1);
    const accidental = rulingsOver(50, 'eyePoke', 1);
    expect(FOUL_META.fenceGrab.severity).toBeLessThan(FOUL_META.eyePoke.severity);
    expect(cynical.pointDeduction).toBeGreaterThan(accidental.pointDeduction);
  });

  it('disqualifies only for something severe, repeated, in front of a strict official', () => {
    expect(rulingsOver(90, 'fenceGrab', 0).disqualification).toBe(0);
    expect(rulingsOver(5, 'illegalKnee', 3).disqualification).toBeGreaterThan(0);
  });
});

describe('what a stoppage is worth', () => {
  it('gives back more to a fighter who recovers well', () => {
    expect(recoveryBenefit(90, 300)).toBeGreaterThan(recoveryBenefit(20, 300));
  });

  it('scales with the time actually given', () => {
    expect(recoveryBenefit(50, 300)).toBeGreaterThan(recoveryBenefit(50, 30));
    expect(recoveryBenefit(50, 0)).toBe(0);
  });

  it('never hands back more than the break was worth', () => {
    // The five-minute low-blow break is the biggest gift in the sport and it is still not
    // a full reset — otherwise being fouled while hurt would be strictly better than not.
    expect(recoveryBenefit(100, 300)).toBeLessThan(1);
  });
});

describe('no contests', () => {
  it('cannot happen from a foul the referee never saw', () => {
    const rng = createRng('nc');
    for (let i = 0; i < 500; i++) {
      expect(rollNoContest(rng, 'eyePoke', 'unseen')).toBe(false);
    }
  });

  it('stays rare enough to be a story', () => {
    const rng = createRng('nc2');
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (rollNoContest(rng, 'eyePoke', 'warning')) n++;
    expect(n / 10_000).toBeLessThan(0.15);
  });
});

describe('commentary', () => {
  it('says what happened and what the referee did about it', () => {
    expect(describeFoul('eyePoke', 'Jones', 'Smith', 'unseen')).toMatch(/misses it/i);
    expect(describeFoul('fenceGrab', 'Jones', 'Smith', 'warning')).toMatch(/warns/i);
    expect(describeFoul('lowBlow', 'Jones', 'Smith', 'pointDeduction')).toMatch(/that is a point/i);
    expect(describeFoul('illegalKnee', 'Jones', 'Smith', 'disqualification')).toMatch(
      /disqualified/i,
    );
  });
});
