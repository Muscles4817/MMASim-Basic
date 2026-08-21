import { describe, expect, it } from 'vitest';
import {
  PERSONALITY_AXES,
  PERSONALITY_META,
  campGainMultiplier,
  gamePlanAdherence,
  idleDecayMultiplier,
  incidentRisk,
  lossImpactMultiplier,
  starPowerGrowthMultiplier,
  stepUpAcceptance,
  uniformPersonality,
  weightMissRiskMultiplier,
} from './personality.js';
import {
  ACQUIRABLE_TRAITS,
  ALL_TRAITS,
  TRAITS,
  TRAIT_IDS,
  findTraitConflicts,
  traitAdd,
  traitMul,
} from './traits.js';
import {
  DIVISIONS,
  cutSeverity,
  divisionAbove,
  divisionBelow,
  divisionsFor,
  getDivision,
  lightestViableDivision,
} from './divisions.js';
import { asDivisionId, asFighterId } from '../core/ids.js';
import {
  careerSummaryBefore,
  recordString,
  summariseRecord,
  type FightRecordEntry,
} from './fighter.js';

describe('personality axes', () => {
  it('documents all eight axes with the systems they drive', () => {
    expect(PERSONALITY_AXES).toHaveLength(8);
    for (const axis of PERSONALITY_AXES) {
      const meta = PERSONALITY_META[axis];
      expect(meta.key).toBe(axis);
      // Pillar: no axis exists as pure flavour.
      expect(meta.drives.length).toBeGreaterThan(0);
      expect(meta.low.length).toBeGreaterThan(5);
      expect(meta.high.length).toBeGreaterThan(5);
    }
  });

  it('gives an average personality neutral multipliers', () => {
    const p = uniformPersonality(50);
    expect(campGainMultiplier(p)).toBeCloseTo(1, 1);
    expect(idleDecayMultiplier(p)).toBeCloseTo(1, 1);
    expect(weightMissRiskMultiplier(p)).toBeCloseTo(1, 0);
  });
});

describe('personality → mechanics', () => {
  const at = (axis: keyof ReturnType<typeof uniformPersonality>, value: number) => ({
    ...uniformPersonality(50),
    [axis]: value,
  });

  it('makes discipline the dominant lever on camp gains', () => {
    expect(campGainMultiplier(at('discipline', 95))).toBeGreaterThan(
      campGainMultiplier(at('discipline', 10)) * 1.8,
    );
  });

  it('makes an undisciplined fighter rot between camps', () => {
    expect(idleDecayMultiplier(at('discipline', 5))).toBeGreaterThan(
      idleDecayMultiplier(at('discipline', 95)) * 3,
    );
  });

  it('makes high-ego fighters abandon the game plan', () => {
    expect(gamePlanAdherence(at('ego', 95))).toBeLessThan(gamePlanAdherence(at('ego', 5)));
  });

  it('lets discipline partially rescue a high-ego fighter’s adherence', () => {
    const undisciplinedEgomaniac = { ...uniformPersonality(50), ego: 90, discipline: 20 };
    const disciplinedEgomaniac = { ...uniformPersonality(50), ego: 90, discipline: 90 };
    expect(gamePlanAdherence(disciplinedEgomaniac)).toBeGreaterThan(
      gamePlanAdherence(undisciplinedEgomaniac),
    );
    // …but never all the way back to a coachable fighter.
    expect(gamePlanAdherence(disciplinedEgomaniac)).toBeLessThan(gamePlanAdherence(at('ego', 10)));
  });

  it('keeps adherence within sane bounds for every possible personality', () => {
    for (const ego of [1, 25, 50, 75, 100]) {
      for (const discipline of [1, 50, 100]) {
        const v = gamePlanAdherence({ ...uniformPersonality(50), ego, discipline });
        expect(v).toBeGreaterThanOrEqual(0.25);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes unprofessional fighters miss weight far more often', () => {
    const bad = { ...uniformPersonality(50), discipline: 10, professionalism: 10 };
    const good = { ...uniformPersonality(50), discipline: 90, professionalism: 90 };
    expect(weightMissRiskMultiplier(bad)).toBeGreaterThan(weightMissRiskMultiplier(good) * 8);
  });

  it('makes low-resilience fighters take losses much harder', () => {
    expect(lossImpactMultiplier(at('resilience', 5))).toBeGreaterThan(
      lossImpactMultiplier(at('resilience', 95)) * 3,
    );
  });

  it('decouples drawing power from fighting ability', () => {
    // A charismatic fighter grows their star far faster — regardless of their attributes,
    // which this function does not even see.
    expect(starPowerGrowthMultiplier(at('charisma', 95))).toBeGreaterThan(
      starPowerGrowthMultiplier(at('charisma', 5)) * 3,
    );
  });

  it('makes ambitious fighters take the hard fight and content ones duck it', () => {
    expect(stepUpAcceptance(at('ambition', 95))).toBeGreaterThan(0.8);
    expect(stepUpAcceptance(at('ambition', 5))).toBeLessThan(0.3);
  });

  it('keeps incident risk bounded even for the worst possible professional', () => {
    const worst = { ...uniformPersonality(50), professionalism: 1, discipline: 1 };
    expect(incidentRisk(worst)).toBeLessThanOrEqual(0.25);
    expect(incidentRisk(worst)).toBeGreaterThan(incidentRisk(uniformPersonality(95)) * 10);
  });
});

describe('traits', () => {
  it('defines every listed trait with a matching id', () => {
    for (const id of TRAIT_IDS) {
      const t = TRAITS[id];
      expect(t.id).toBe(id);
      expect(t.blurb.length).toBeGreaterThan(15);
      expect(t.visibility).toBeGreaterThanOrEqual(1);
      expect(t.visibility).toBeLessThanOrEqual(100);
    }
  });

  it('gives every trait at least one mechanical hook', () => {
    // Design rule: a trait that cannot change an outcome does not ship.
    for (const t of ALL_TRAITS) {
      const hookCount = Object.keys(t.mul ?? {}).length + Object.keys(t.add ?? {}).length;
      expect(hookCount, `${t.id} has no hooks`).toBeGreaterThan(0);
    }
  });

  it('makes double-edged the largest polarity group', () => {
    // Purely-good traits are a balance bug; the table should lean toward trade-offs.
    const counts = { positive: 0, negative: 0, doubleEdged: 0 };
    for (const t of ALL_TRAITS) counts[t.polarity]++;
    expect(counts.doubleEdged).toBeGreaterThanOrEqual(counts.positive);
    expect(counts.doubleEdged).toBeGreaterThanOrEqual(counts.negative);
  });

  it('keeps purely-positive traits modest', () => {
    // A no-downside trait may not also be a huge multiplier.
    for (const t of ALL_TRAITS) {
      if (t.polarity !== 'positive') continue;
      for (const v of Object.values(t.mul ?? {})) {
        expect(Math.abs(Math.log(v)), `${t.id} multiplier ${v} too strong`).toBeLessThan(
          Math.log(1.5),
        );
      }
    }
  });

  it('combines multiplicative hooks by multiplication', () => {
    expect(traitMul(['cardioMachine', 'weightCutGambler'], 'fatigueRate')).toBeCloseTo(
      0.78 * 1.3,
      6,
    );
  });

  it('returns the identity for unrelated traits', () => {
    expect(traitMul(['trashTalker'], 'fatigueRate')).toBe(1);
    expect(traitAdd(['trashTalker'], 'sizeAdvantage')).toBe(0);
    expect(traitMul([], 'campGain')).toBe(1);
    expect(traitAdd([], 'lateRoundBias')).toBe(0);
  });

  it('combines additive hooks by summation', () => {
    expect(traitAdd(['ironChin', 'glassCannon'], 'durabilityFloorShift')).toBe(10 - 14);
  });

  it('marks acquired traits as acquirable', () => {
    // These are the ones a career can *give* a fighter; the set must not be empty or the
    // career arc has no shape beyond ratings.
    expect(ACQUIRABLE_TRAITS).toContain('gunShy');
    expect(ACQUIRABLE_TRAITS).toContain('chinny');
    expect(ACQUIRABLE_TRAITS.length).toBeGreaterThanOrEqual(3);
  });

  describe('conflicts', () => {
    it('detects contradictory pairs in either order', () => {
      expect(findTraitConflicts(['ironChin', 'chinny'])).toHaveLength(1);
      expect(findTraitConflicts(['chinny', 'ironChin'])).toHaveLength(1);
    });

    it('accepts a coherent set', () => {
      expect(findTraitConflicts(['gymRat', 'cardioMachine', 'companyMan'])).toHaveLength(0);
    });

    it('reports every conflict in a badly-formed set', () => {
      expect(findTraitConflicts(['ironChin', 'chinny', 'gymRat', 'partyAnimal'])).toHaveLength(2);
    });

    it('only references traits that exist', () => {
      for (const [a, b] of findTraitConflicts(TRAIT_IDS)) {
        expect(TRAITS[a]).toBeDefined();
        expect(TRAITS[b]).toBeDefined();
      }
    });
  });
});

describe('divisions', () => {
  it('orders each sex’s divisions by ascending weight', () => {
    for (const sex of ['male', 'female'] as const) {
      const ds = divisionsFor(sex);
      for (let i = 1; i < ds.length; i++) {
        expect(ds[i]!.limitLbs).toBeGreaterThan(ds[i - 1]!.limitLbs);
        expect(ds[i]!.order).toBe(ds[i - 1]!.order + 1);
      }
    }
  });

  it('has unique ids', () => {
    expect(new Set(DIVISIONS.map((d) => d.id)).size).toBe(DIVISIONS.length);
  });

  it('navigates up and down the ladder', () => {
    const lw = asDivisionId('mens-lightweight');
    expect(divisionAbove(lw)?.shortName).toBe('WW');
    expect(divisionBelow(lw)?.shortName).toBe('FW');
  });

  it('has no division above heavyweight or below the lightest', () => {
    expect(divisionAbove(asDivisionId('mens-heavyweight'))).toBeUndefined();
    expect(divisionBelow(asDivisionId('mens-flyweight'))).toBeUndefined();
    expect(divisionBelow(asDivisionId('womens-strawweight'))).toBeUndefined();
  });

  it('throws on an unknown division rather than silently misbehaving', () => {
    expect(() => getDivision(asDivisionId('nope'))).toThrow(/Unknown division/);
  });

  describe('cut severity', () => {
    const lw = asDivisionId('mens-lightweight');

    it('is zero for a fighter already at the limit', () => {
      expect(cutSeverity(155, lw)).toBe(0);
      expect(cutSeverity(150, lw)).toBe(0);
    });

    it('rises with excess weight and saturates at 1', () => {
      expect(cutSeverity(165, lw)).toBeGreaterThan(0);
      expect(cutSeverity(180, lw)).toBeGreaterThan(cutSeverity(165, lw));
      expect(cutSeverity(230, lw)).toBe(1);
    });

    it('scales by body weight, not absolute pounds', () => {
      // Ten pounds is a much harder cut at flyweight than at heavyweight.
      const flw = cutSeverity(135, asDivisionId('mens-flyweight'));
      const hw = cutSeverity(275, asDivisionId('mens-heavyweight'));
      expect(flw).toBeGreaterThan(hw);
    });
  });

  describe('lightestViableDivision', () => {
    it('sends a big lightweight to lightweight, not flyweight', () => {
      expect(lightestViableDivision(175, 'male').shortName).toBe('LW');
    });

    it('never returns nothing, even for an enormous fighter', () => {
      expect(lightestViableDivision(400, 'male').shortName).toBe('HW');
    });

    it('respects sex when picking the ladder', () => {
      expect(lightestViableDivision(130, 'female').sex).toBe('female');
    });
  });
});

describe('record summary', () => {
  const entry = (
    outcome: FightRecordEntry['outcome'],
    method: FightRecordEntry['method'],
  ): FightRecordEntry => ({
    boutId: 'b',
    opponentId: asFighterId('f'),
    promotionId: 'p' as FightRecordEntry['promotionId'],
    day: 0,
    outcome,
    method,
    round: 1,
    timeSeconds: 60,
    divisionId: asDivisionId('mens-lightweight'),
    wasTitleFight: false,
  });

  it('counts an empty record as 0-0-0', () => {
    expect(recordString(summariseRecord([]))).toBe('0-0-0');
  });

  it('tallies outcomes and finish methods', () => {
    const s = summariseRecord([
      entry('win', 'ko'),
      entry('win', 'submission'),
      entry('win', 'decisionUnanimous'),
      entry('loss', 'tko'),
      entry('draw', 'draw'),
      entry('noContest', 'noContest'),
    ]);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(1);
    expect(s.koWins).toBe(1);
    expect(s.submissionWins).toBe(1);
    expect(s.decisionWins).toBe(1);
    expect(s.koLosses).toBe(1);
    expect(recordString(s)).toBe('3-1-1 (1 NC)');
  });

  it('counts a doctor stoppage as a knockout-type finish', () => {
    expect(summariseRecord([entry('win', 'doctorStoppage')]).koWins).toBe(1);
  });

  describe('streaks', () => {
    it('counts a current win streak', () => {
      const s = summariseRecord([entry('loss', 'ko'), entry('win', 'ko'), entry('win', 'ko')]);
      expect(s.streak).toBe(2);
    });

    it('counts a current losing streak as negative', () => {
      const s = summariseRecord([entry('win', 'ko'), entry('loss', 'ko'), entry('loss', 'ko')]);
      expect(s.streak).toBe(-2);
    });

    it('breaks on a draw without starting a new streak', () => {
      const s = summariseRecord([entry('win', 'ko'), entry('win', 'ko'), entry('draw', 'draw')]);
      expect(s.streak).toBe(0);
    });

    it('breaks on a no-contest', () => {
      const s = summariseRecord([entry('win', 'ko'), entry('noContest', 'noContest')]);
      expect(s.streak).toBe(0);
    });
  });
});

describe('the record as it stood before a bout', () => {
  /*
   * Fight night settles the whole result before the screen renders, which is what makes skipping
   * the playback instant and honest — and which meant the tale of the tape showed both fighters
   * carrying tonight's result while they were still walking out.
   */
  const bout = (id: string, outcome: FightRecordEntry['outcome']): FightRecordEntry => ({
    boutId: id,
    opponentId: asFighterId('f'),
    promotionId: 'p' as FightRecordEntry['promotionId'],
    day: 0,
    outcome,
    method: outcome === 'win' ? 'ko' : 'decisionUnanimous',
    round: 1,
    timeSeconds: 60,
    divisionId: asDivisionId('mens-lightweight'),
    wasTitleFight: false,
  });

  const record = [bout('b1', 'win'), bout('b2', 'win'), bout('b3', 'loss')];

  it('leaves tonight off the record', () => {
    const before = careerSummaryBefore({ record }, 'b3');
    expect(recordString(before)).toBe('2-0-0');
    expect(before.streak).toBe(2);
  });

  it('does not give away the finish either', () => {
    // A knockout that has not happened yet showed up in the finishes column.
    expect(careerSummaryBefore({ record }, 'b1').koWins).toBe(0);
    expect(careerSummaryBefore({ record }, 'b2').koWins).toBe(1);
  });

  it('keeps the seeded career behind it', () => {
    const prior = { ...summariseRecord([]), wins: 15, losses: 1 };
    expect(recordString(careerSummaryBefore({ record, priorRecord: prior }, 'b2'))).toBe('16-1-0');
  });

  it('is the whole career when the bout is not on it', () => {
    expect(recordString(careerSummaryBefore({ record }, 'never'))).toBe('2-1-0');
  });
});
