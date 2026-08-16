import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { ATTRIBUTE_KEYS } from '../ratings/attributes.js';
import { makeFighter } from '../testing/fixtures.js';
import {
  INJURY_META,
  INJURY_TYPES,
  activeInjuries,
  aggravate,
  aggravationChance,
  campImpairment,
  campInjuryChance,
  describeInjury,
  fightInjuryChance,
  injuredAttributes,
  isActiveInjury,
  rollInjury,
  type Injury,
} from './injuries.js';

const fighter = () => makeFighter({ id: 'f', age: 28 });

/** Roll many injuries and report the distribution, so assertions are about behaviour. */
const rollMany = (count: number, source: Injury['source'], overrides = {}) => {
  const f = { ...fighter(), ...overrides };
  return Array.from({ length: count }, (_, i) =>
    rollInjury({ fighter: f, source, day: 0, rng: createRng(`i${i}`) }),
  );
};

describe('injury metadata', () => {
  it('describes every type with a duration and a consequence', () => {
    for (const type of INJURY_TYPES) {
      const meta = INJURY_META[type];
      expect(meta.type).toBe(type);
      expect(meta.blurb.length).toBeGreaterThan(20);
      expect(meta.weeks[0]).toBeGreaterThan(0);
      expect(meta.weeks[1]).toBeGreaterThan(meta.weeks[0]);
      expect(meta.recurrence).toBeGreaterThan(0);
      // Every injury must either cost attributes or cost time meaningfully.
      const suppresses = Object.keys(meta.suppresses).length;
      expect(suppresses > 0 || meta.weeks[0] >= 2).toBe(true);
    }
  });

  it('makes the knee the career-shaping one', () => {
    // If ligament damage is not the worst thing on this list, the list is wrong.
    const knee = INJURY_META.knee;
    for (const type of INJURY_TYPES) {
      if (type === 'knee') continue;
      expect(knee.weeks[1]).toBeGreaterThanOrEqual(INJURY_META[type].weeks[1]);
    }
  });

  it('never produces a cut in camp', () => {
    expect(INJURY_META.cut.campWeight).toBe(0);
    const rolled = rollMany(200, 'camp');
    expect(rolled.some((i) => i.type === 'cut')).toBe(false);
  });
});

describe('hazard rates', () => {
  it('makes camps the most common source of injury', () => {
    // Counter-intuitive and true: most withdrawals come from training, not from fights.
    expect(campInjuryChance(fighter(), 8, 0)).toBeGreaterThan(fightInjuryChance(fighter(), 40, 0));
  });

  it('rises with age, proneness, wear and camp length', () => {
    const base = campInjuryChance(fighter(), 8, 0);
    const older = campInjuryChance(makeFighter({ age: 38 }), 8, 0);
    const fragile = campInjuryChance(
      makeFighter({ age: 28, naturals: { injuryProneness: 90 } }),
      8,
      0,
    );
    const longCamp = campInjuryChance(fighter(), 14, 0);

    expect(older).toBeGreaterThan(base);
    expect(fragile).toBeGreaterThan(base);
    expect(longCamp).toBeGreaterThan(base);
  });

  it('makes the Injury Prone trait genuinely punishing', () => {
    const prone = makeFighter({ age: 28, traits: ['injuryProne'] });
    expect(campInjuryChance(prone, 8, 0)).toBeGreaterThan(campInjuryChance(fighter(), 8, 0) * 1.5);
  });

  it('rises with damage taken in a fight', () => {
    expect(fightInjuryChance(fighter(), 100, 0)).toBeGreaterThan(fightInjuryChance(fighter(), 0, 0));
  });

  it('stays a probability at every extreme', () => {
    const worst = makeFighter({
      age: 44,
      naturals: { injuryProneness: 99 },
      traits: ['injuryProne'],
    });
    expect(campInjuryChance(worst, 20, 0)).toBeLessThanOrEqual(1);
    expect(fightInjuryChance(worst, 500, 0)).toBeLessThanOrEqual(1);
  });
});

describe('rollInjury', () => {
  it('produces a healed date in the future', () => {
    for (const injury of rollMany(50, 'camp')) {
      expect(injury.healedDay).toBeGreaterThan(injury.day);
      expect(injury.severity).toBeGreaterThan(0);
      expect(injury.severity).toBeLessThanOrEqual(1);
    }
  });

  it('skews severity low — most injuries are a nuisance', () => {
    const severities = rollMany(300, 'camp').map((i) => i.severity);
    const serious = severities.filter((s) => s > 0.7).length / severities.length;
    expect(serious).toBeLessThan(0.3);
    expect(severities.some((s) => s > 0.7), 'no serious injuries at all').toBe(true);
  });

  it('heals a good recoverer faster', () => {
    const slow = rollInjury({
      fighter: makeFighter({ naturals: { recovery: 20 } }),
      source: 'camp',
      day: 0,
      rng: createRng('same'),
    });
    const fast = rollInjury({
      fighter: makeFighter({ naturals: { recovery: 95 } }),
      source: 'camp',
      day: 0,
      rng: createRng('same'),
    });
    expect(fast.healedDay).toBeLessThan(slow.healedDay);
  });

  it('heals a Quick Healer faster still', () => {
    const normal = rollInjury({
      fighter: makeFighter({}),
      source: 'camp',
      day: 0,
      rng: createRng('qh'),
    });
    const quick = rollInjury({
      fighter: makeFighter({ traits: ['quickHealer'] }),
      source: 'camp',
      day: 0,
      rng: createRng('qh'),
    });
    expect(quick.healedDay).toBeLessThan(normal.healedDay);
  });

  it('recurs: a prior injury makes the same one far more likely', () => {
    // This is what turns one bad injury into a career-shaping pattern.
    const withKnee: Injury[] = [
      {
        id: 'x' as Injury['id'],
        type: 'knee',
        day: -400,
        healedDay: -200,
        severity: 0.6,
        source: 'camp',
      },
    ];
    const f = fighter();
    const repeats = Array.from({ length: 300 }, (_, i) =>
      rollInjury({ fighter: f, source: 'camp', day: 0, rng: createRng(`r${i}`), history: withKnee }),
    ).filter((i) => i.type === 'knee').length;

    const fresh = rollMany(300, 'camp').filter((i) => i.type === 'knee').length;
    expect(repeats).toBeGreaterThan(fresh * 1.8);
  });
});

describe('carrying an injury', () => {
  const knee: Injury = {
    id: 'k' as Injury['id'],
    type: 'knee',
    day: 0,
    healedDay: 200,
    severity: 1,
    source: 'camp',
  };

  it('knows what is still active', () => {
    expect(isActiveInjury(knee, 100)).toBe(true);
    expect(isActiveInjury(knee, 300)).toBe(false);
    expect(activeInjuries([knee], 100)).toHaveLength(1);
    expect(activeInjuries([knee], 300)).toHaveLength(0);
  });

  it('suppresses only the attributes the injury actually affects', () => {
    const base = fighter().attributes;
    const hurt = injuredAttributes(base, [knee], 100);
    expect(hurt.wrestling).toBeLessThan(base.wrestling);
    expect(hurt.speed).toBeLessThan(base.speed);
    // A knee does not affect your jab.
    expect(hurt.strikingOffence).toBe(base.strikingOffence);
  });

  it('does nothing once healed', () => {
    const base = fighter().attributes;
    expect(injuredAttributes(base, [knee], 300)).toEqual(base);
  });

  it('scales with severity', () => {
    const base = fighter().attributes;
    const minor = injuredAttributes(base, [{ ...knee, severity: 0.2 }], 100);
    const severe = injuredAttributes(base, [knee], 100);
    expect(severe.wrestling).toBeLessThan(minor.wrestling);
  });

  it('stacks multiple injuries', () => {
    const hand: Injury = { ...knee, id: 'h' as Injury['id'], type: 'hand' };
    const base = fighter().attributes;
    const both = injuredAttributes(base, [knee, hand], 100);
    expect(both.wrestling).toBeLessThan(base.wrestling);
    expect(both.strikingOffence).toBeLessThan(base.strikingOffence);
  });

  it('never drives an attribute out of range', () => {
    const all: Injury[] = INJURY_TYPES.map((type, i) => ({
      ...knee,
      id: `i${i}` as Injury['id'],
      type,
      severity: 1,
    }));
    const hurt = injuredAttributes(fighter().attributes, all, 100);
    for (const key of ATTRIBUTE_KEYS) {
      expect(hurt[key]).toBeGreaterThanOrEqual(1);
      expect(hurt[key]).toBeLessThanOrEqual(100);
    }
  });

  it('compromises a camp in proportion to severity', () => {
    expect(campImpairment([], 100)).toBe(1);
    expect(campImpairment([{ ...knee, severity: 0.3 }], 100)).toBeGreaterThan(
      campImpairment([knee], 100),
    );
    expect(campImpairment([knee], 100)).toBeGreaterThan(0.25);
  });
});

describe('fighting hurt', () => {
  const hand: Injury = {
    id: 'h' as Injury['id'],
    type: 'hand',
    day: 0,
    healedDay: 100,
    severity: 0.5,
    source: 'camp',
  };

  it('is a genuine gamble, not a small modifier', () => {
    // If this were 5% nobody would ever pull out, and the decision would be fake.
    expect(aggravationChance(hand, 40)).toBeGreaterThan(0.25);
    expect(aggravationChance(hand, 40)).toBeLessThan(1);
  });

  it('gets riskier with severity and with damage taken', () => {
    expect(aggravationChance({ ...hand, severity: 0.9 }, 40)).toBeGreaterThan(
      aggravationChance({ ...hand, severity: 0.1 }, 40),
    );
    expect(aggravationChance(hand, 150)).toBeGreaterThan(aggravationChance(hand, 0));
  });

  it('roughly doubles the remaining layoff when it goes wrong', () => {
    const worse = aggravate(hand, 50, createRng('agg'));
    const remainingBefore = hand.healedDay - 50;
    const remainingAfter = worse.healedDay - 50;
    expect(remainingAfter).toBeGreaterThan(remainingBefore * 1.5);
    expect(worse.severity).toBeGreaterThan(hand.severity);
    expect(worse.foughtThrough).toBe(true);
  });
});

describe('describeInjury', () => {
  it('states severity, time remaining and what it means', () => {
    const text = describeInjury(
      { id: 'x' as Injury['id'], type: 'knee', day: 0, healedDay: 140, severity: 0.8, source: 'camp' },
      0,
    );
    expect(text).toMatch(/Serious/);
    expect(text).toMatch(/20 weeks/);
    expect(text.length).toBeGreaterThan(40);
  });

  it('says so when it is healed', () => {
    const text = describeInjury(
      { id: 'x' as Injury['id'], type: 'rib', day: 0, healedDay: 10, severity: 0.3, source: 'fight' },
      50,
    );
    expect(text).toMatch(/healed/i);
  });
});
