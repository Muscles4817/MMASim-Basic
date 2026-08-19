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
  campRiskBreakdown,
  canFightOn,
  FIGHT_THROUGH_WEEKS,
  concussionFor,
  describeInjury,
  exposureScore,
  fightInjuryChance,
  injuredAttributes,
  isActiveInjury,
  fatigueFactor,
  riskBand,
  rollInjury,
  type FightExposure,
  type Injury,
} from './injuries.js';

const fighter = () => makeFighter({ id: 'f', age: 28 });

/**
 * A night, described the way `FightResult` describes one.
 *
 * The archetypes below are the ones doc 25 § 3.5 calibrates the band against, and they are named
 * rather than numbered because the whole point of the exposure model is that these are different
 * things that happen to different fighters.
 */
const night = (o: Partial<FightExposure> = {}): FightExposure => ({
  headDamage: 0,
  bodyDamage: 0,
  legDamage: 0,
  knockdownsSuffered: 0,
  wasFinishedByStrikes: false,
  minutes: 15,
  controlMinutes: 0,
  scrambles: 0,
  punchesThrown: 0,
  kicksThrown: 0,
  ...o,
});

/** Thirty seconds, an armbar, and nothing landed on you at all. */
const QUICK_SUBMISSION = night({ headDamage: 2, minutes: 0.5, controlMinutes: 0.4 });
/** Three rounds won from the top. You were in there the whole time and barely touched. */
const TOP_CONTROL = night({ headDamage: 10, bodyDamage: 3, legDamage: 2, controlMinutes: 11 });
/** The ordinary night the whole scale is read against. */
const DECISION = night({ headDamage: 30, bodyDamage: 10, legDamage: 5, controlMinutes: 3, scrambles: 3 });
/** Both of you needed the doctor afterwards. */
const WAR = night({
  headDamage: 90,
  bodyDamage: 25,
  legDamage: 20,
  knockdownsSuffered: 1,
  controlMinutes: 2,
  scrambles: 5,
});
/** Two rounds of being hit, and stopped in the third. */
const BEATING = night({
  headDamage: 130,
  bodyDamage: 30,
  legDamage: 15,
  knockdownsSuffered: 3,
  wasFinishedByStrikes: true,
  minutes: 12,
  controlMinutes: 0.5,
  scrambles: 2,
});

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
    // Counter-intuitive and true: most withdrawals come from training, not from fights. A camp is
    // eight weeks of hard sparring against one night, so it beats the *ordinary* night comfortably.
    expect(campInjuryChance(fighter(), 8, 0)).toBeGreaterThan(fightInjuryChance(fighter(), DECISION, 0));
  });

  it('but not the worst night of a career', () => {
    /*
     * The other half of the same claim, and it only became sayable once the fight roll started
     * reading the fight. A camp is more dangerous than a normal fight and less dangerous than a
     * beating, which is the true ordering and was previously unreachable — under the old flat
     * model the very worst night in the sport barely outscored a routine one.
     */
    expect(fightInjuryChance(fighter(), BEATING, 0)).toBeGreaterThan(
      campInjuryChance(fighter(), 8, 0),
    );
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
    expect(fightInjuryChance(fighter(), WAR, 0)).toBeGreaterThan(
      fightInjuryChance(fighter(), DECISION, 0),
    );
  });

  it('stays a probability at every extreme', () => {
    const worst = makeFighter({
      age: 44,
      naturals: { injuryProneness: 99 },
      traits: ['injuryProne'],
    });
    const apocalyptic = night({
      headDamage: 400,
      bodyDamage: 300,
      legDamage: 300,
      knockdownsSuffered: 12,
      wasFinishedByStrikes: true,
      minutes: 25,
      scrambles: 40,
    });
    expect(campInjuryChance(worst, 20, 0)).toBeLessThanOrEqual(1);
    expect(fightInjuryChance(worst, apocalyptic, 0)).toBeLessThanOrEqual(1);
  });
});

describe('the fight decides what the fight costs', () => {
  /*
   * The defect this whole model exists for. `fightInjuryChance` took the sum of head, body and leg
   * damage and turned it into `1 + clamp01(damage / 120)` — a term that could at most double the
   * hazard. Measured on a 28-year-old, that priced a thirty-second armbar at 11.0% and a
   * two-round beating at 21.1%: a 1.9x spread across everything that can happen in a cage, where
   * `injuryProneness` alone spans 2.8x. Who you were mattered more than what happened to you.
   */
  it('separates the nights that hurt you from the ones that did not', () => {
    const f = fighter();
    const quick = fightInjuryChance(f, QUICK_SUBMISSION, 0);
    const beating = fightInjuryChance(f, BEATING, 0);
    expect(beating / quick, 'the spread collapsed back toward a flat rate').toBeGreaterThan(8);
  });

  it('orders every archetype the way the sport does', () => {
    const f = fighter();
    const chances = [QUICK_SUBMISSION, TOP_CONTROL, DECISION, WAR, BEATING].map((e) =>
      fightInjuryChance(f, e, 0),
    );
    for (let i = 1; i < chances.length; i++) {
      expect(chances[i], `archetype ${i} was not worse than ${i - 1}`).toBeGreaterThan(
        chances[i - 1]!,
      );
    }
  });

  it('rewards winning from the top, which is the grappler’s whole bargain', () => {
    // Same fifteen minutes, same fight length. The difference is entirely where it was spent.
    const f = fighter();
    const onTop = fightInjuryChance(f, TOP_CONTROL, 0);
    const atDistance = fightInjuryChance(f, DECISION, 0);
    expect(onTop).toBeLessThan(atDistance * 0.5);
  });

  it('never makes a fight free, however fast it ended', () => {
    // Two people tried to hurt each other. Somebody can still land awkwardly in thirty seconds,
    // and a floor of zero would make one style risk-free rather than merely cheap.
    expect(fightInjuryChance(fighter(), QUICK_SUBMISSION, 0)).toBeGreaterThan(0.005);
  });

  it('charges being dropped and being finished on top of the damage', () => {
    const plain = night({ headDamage: 100 });
    const dropped = night({ headDamage: 100, knockdownsSuffered: 3 });
    const stopped = night({ headDamage: 100, knockdownsSuffered: 3, wasFinishedByStrikes: true });
    expect(exposureScore(dropped)).toBeGreaterThan(exposureScore(plain));
    expect(exposureScore(stopped)).toBeGreaterThan(exposureScore(dropped));
  });

  it('costs more per point to the head and the legs than to the body', () => {
    // A chopped-out leg is the classic limp-off, and the head is dearer than either because of
    // what it does to the rest of the model.
    expect(exposureScore(night({ headDamage: 50 }))).toBeGreaterThan(
      exposureScore(night({ bodyDamage: 50 })),
    );
    expect(exposureScore(night({ legDamage: 50 }))).toBeGreaterThan(
      exposureScore(night({ bodyDamage: 50 })),
    );
  });
});

describe('what kind of injury it turns out to be', () => {
  const typesFrom = (exposure: FightExposure, count = 400) =>
    Array.from({ length: count }, (_, i) =>
      rollInjury({ fighter: fighter(), source: 'fight', day: 0, rng: createRng(`t${i}`), exposure }),
    ).map((i) => i.type);

  const share = (types: string[], type: string) =>
    types.filter((t) => t === type).length / types.length;

  it('breaks the hand of the man doing the punching, not the man being punched', () => {
    /*
     * The detail that makes this worth doing. You break your hand on somebody's skull, and
     * `strikesByWeapon` has always recorded who was throwing — so this reads the fighter's own
     * output rather than what they absorbed. A heavy-handed brawler breaking his hand is one of
     * the sport's signature injuries and it was previously unreachable.
     */
    const puncher = typesFrom(night({ punchesThrown: 120, headDamage: 20 }));
    const grappler = typesFrom(night({ punchesThrown: 2, controlMinutes: 12 }));
    expect(share(puncher, 'hand')).toBeGreaterThan(share(grappler, 'hand') * 2);
  });

  it('leaves a concussion with the fighter who was actually hit in the head', () => {
    const battered = typesFrom(BEATING);
    const untouched = typesFrom(QUICK_SUBMISSION);
    expect(share(battered, 'concussion')).toBeGreaterThan(share(untouched, 'concussion') * 2);
  });

  it('takes the legs of somebody whose legs were kicked out', () => {
    const chopped = typesFrom(night({ legDamage: 60 }));
    const untouched = typesFrom(night({ headDamage: 40 }));
    const lower = (t: string[]) => share(t, 'ankle') + share(t, 'knee');
    expect(lower(chopped)).toBeGreaterThan(lower(untouched));
  });

  it('wears the joints of somebody in a long scramble', () => {
    const wrestled = typesFrom(night({ scrambles: 14, minutes: 15 }));
    const sniped = typesFrom(night({ headDamage: 40, minutes: 3 }));
    const joints = (t: string[]) => share(t, 'shoulder') + share(t, 'back') + share(t, 'knee');
    expect(joints(wrestled)).toBeGreaterThan(joints(sniped));
  });

  it('still allows the unlikely one, because people do turn an ankle in a boxing match', () => {
    // A zero floor would make the type table a lookup rather than a distribution, which is a
    // worse model wearing a more confident face.
    const types = new Set(typesFrom(night({ headDamage: 80 }), 600));
    expect(types.size).toBeGreaterThan(4);
  });
});

describe('a knockout is a concussion', () => {
  /*
   * `readinessDelay` already floors a KO loss at 180 days, which is what commissions do — but the
   * injury was a separate 12-18% roll that then picked a type by weight, so the overwhelming
   * majority of knockouts left nothing at all on the medical record. The suspension happened and
   * the diagnosis did not, which is backwards: the suspension exists *because* of the diagnosis.
   */
  const ko = (o: Parameters<typeof concussionFor>[0] extends never ? never : Partial<Parameters<typeof concussionFor>[0]> = {}) =>
    concussionFor({
      fighter: fighter(),
      method: 'ko',
      lost: true,
      exposure: BEATING,
      day: 0,
      rng: createRng('k'),
      ...o,
    });

  it('always, rather than one time in six', () => {
    expect(ko()?.type).toBe('concussion');
  });

  it('is not given to the man who did the knocking out', () => {
    expect(ko({ lost: false })).toBeUndefined();
  });

  it('is not given for a submission, or a decision', () => {
    expect(ko({ method: 'submission' })).toBeUndefined();
    expect(ko({ method: 'decisionUnanimous' })).toBeUndefined();
  });

  it('reads a TKO only when the fighter was actually being hit', () => {
    // A corner throwing in the towel over a cut, or somebody turning away from leg kicks, is a
    // TKO and is not a head injury. `wasFinishedByStrikes` is what separates them.
    expect(ko({ method: 'tko', exposure: BEATING })?.type).toBe('concussion');
    expect(
      ko({ method: 'tko', exposure: night({ legDamage: 90, wasFinishedByStrikes: false }) }),
    ).toBeUndefined();
  });

  it('is worse for being starched cold than for being worn down', () => {
    const cold = ko({ method: 'ko', exposure: night({ headDamage: 120 }) })!;
    const late = ko({ method: 'tko', exposure: night({ headDamage: 60, wasFinishedByStrikes: true }) })!;
    expect(cold.severity).toBeGreaterThan(late.severity);
    expect(cold.healedDay).toBeGreaterThan(late.healedDay);
  });

  it('costs months, not weeks', () => {
    // The point of the whole rule: a knockout has to be the thing that takes a chunk out of a
    // career, and eight to twenty-four weeks is what `INJURY_META.concussion` says it is.
    const injury = ko()!;
    expect(injury.healedDay).toBeGreaterThan(8 * 7);
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

/**
 * The lever.
 *
 * Every other term in the hazard is a fact about the fighter that a player cannot move this
 * month — how old they are, how many miles are on them, how fragile they were born. Freshness is
 * the one input they can change today, by resting, and until it entered the roll the honest
 * answer to "how do I avoid these" was *fight less and get younger*.
 */
describe('being flat is what gets people hurt', () => {
  const flat = (value: number) =>
    makeFighter({ id: 'f', age: 28, condition: { freshness: value } });

  it('makes a rested fighter meaningfully safer in camp than a wrecked one', () => {
    const fresh = campInjuryChance(flat(100), 8, 0);
    const wrecked = campInjuryChance(flat(15), 8, 0);
    // Better than a coin-flip's worth of difference, or the rest button is a rounding error.
    expect(wrecked).toBeGreaterThan(fresh * 1.8);
  });

  it('applies the same term on fight night, so a hard camp costs you twice', () => {
    expect(fightInjuryChance(flat(20), DECISION, 0)).toBeGreaterThan(
      fightInjuryChance(flat(95), DECISION, 0),
    );
  });

  it('is neutral where a fighter between camps actually lives, not at a perfect hundred', () => {
    /*
     * Anchoring the multiplier at 100 would have made it a blanket nerf wearing a mechanic's
     * clothes: nobody is ever at 100, a camp ends in the fifties, so every fighter would sit
     * permanently on the punitive side of a term that claims to be neutral.
     */
    expect(fatigueFactor(70)).toBeGreaterThan(0.95);
    expect(fatigueFactor(70)).toBeLessThan(1.05);
  });

  it('never lets the term run away in either direction', () => {
    expect(fatigueFactor(0)).toBeLessThanOrEqual(1.55);
    expect(fatigueFactor(100)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('a short block is genuinely a short block', () => {
  it('charges a fortnight far less than a full camp', () => {
    /*
     * The old floor was `clamp(weeks / 8, 0.5, 1.6)`, which said one week of drilling carried half
     * the risk of an eight-week camp — so shortening a block bought almost nothing and "train
     * less" was not an answer to anything.
     */
    const fortnight = campInjuryChance(fighter(), 2, 0);
    const full = campInjuryChance(fighter(), 8, 0);
    expect(fortnight).toBeLessThan(full * 0.4);
  });
});

describe('the risk breakdown', () => {
  const flat = makeFighter({ id: 'f', age: 36, condition: { freshness: 20 } });

  it('reports exactly the number the roll uses', () => {
    // A screen that quotes a different figure from the one the camp rolls is worse than a screen
    // that quotes nothing.
    expect(campRiskBreakdown(fighter(), 8, 0, 1.5).chance).toBeCloseTo(
      campInjuryChance(fighter(), 8, 0, 1.5),
      10,
    );
  });

  it('separates what a player can still decide from what they cannot', () => {
    const risk = campRiskBreakdown(flat, 12, 0, 2.3);
    const movable = risk.drivers.filter((d) => d.movable).map((d) => d.label);
    const fixed = risk.drivers.filter((d) => !d.movable).map((d) => d.label);

    expect(movable).toContain('Freshness');
    expect(movable).toContain('Block length');
    // Being 36 is worth knowing and is not advice.
    expect(fixed).toContain('Age');
  });

  it('names resting first when being flat is the biggest thing wrong', () => {
    expect(campRiskBreakdown(flat, 4, 0, 1).advice).toMatch(/rest/i);
  });

  it('calls an ordinary camp ordinary rather than alarming', () => {
    // A fresh 28-year-old running a standard eight-week camp is the common case, and a screen
    // that calls the common case "high" is a screen the player learns to ignore.
    const ordinary = makeFighter({ id: 'f', age: 28, condition: { freshness: 100 } });
    expect(riskBand(campInjuryChance(ordinary, 8, 0))).toBe('fair');
  });

  it('says so plainly when nothing left to decide would help', () => {
    const careful = makeFighter({ id: 'f', age: 24, condition: { freshness: 100 } });
    const risk = campRiskBreakdown(careful, 2, 0, 0.5);
    expect(riskBand(risk.chance)).toBe('low');
    expect(risk.advice).toMatch(/safe|nothing/i);
  });

  it('bands the number, so a screen is not left colouring a bare percentage', () => {
    expect(riskBand(0.02)).toBe('low');
    expect(riskBand(0.11)).toBe('fair');
    expect(riskBand(0.17)).toBe('high');
    expect(riskBand(0.4)).toBe('severe');
  });
});

/**
 * The runaway.
 *
 * `aggravate` multiplies the *remaining* layoff by 1.6-2.4, and nothing bounded it. A fighter who
 * is repeatedly matched while hurt therefore has that layoff doubled once per bout — measured over
 * eight years of generated pre-history, a torn knee reached **995 weeks** and three quarters of
 * the roster was carrying something. Every one of the worst cases was `severity: 1` and
 * `foughtThrough: true`, which is the compounding signature rather than bad luck.
 */
describe('an injury made worse is worse, not unbounded', () => {
  const knee = (healedIn: number): Injury => ({
    id: 'i' as Injury['id'],
    type: 'knee',
    day: 0,
    healedDay: healedIn * 7,
    severity: 0.8,
    source: 'fight',
  });

  it('still costs a great deal the first time', () => {
    const before = knee(20);
    const after = aggravate(before, 0, createRng('agg'));
    expect(after.healedDay).toBeGreaterThan(before.healedDay * 1.5);
    expect(after.foughtThrough).toBe(true);
  });

  it('cannot be driven past twice its own worst natural case, however many times it happens', () => {
    let injury = knee(30);
    for (let i = 0; i < 12; i++) injury = aggravate(injury, 0, createRng(`agg${i}`));
    // A knee's worst natural case is forty weeks, so eighty is the wall. That still ends careers.
    expect(injury.healedDay / 7).toBeLessThanOrEqual(INJURY_META.knee.weeks[1] * 2);
  });

  it('holds for every injury type', () => {
    for (const type of INJURY_TYPES) {
      let injury: Injury = { ...knee(INJURY_META[type].weeks[1]), type };
      for (let i = 0; i < 8; i++) injury = aggravate(injury, 0, createRng(`${type}${i}`));
      expect(injury.healedDay / 7, type).toBeLessThanOrEqual(INJURY_META[type].weeks[1] * 2);
    }
  });
});

describe('who is fit to take a fight', () => {
  const carrying = (weeks: number): Injury[] => [
    {
      id: 'i' as Injury['id'],
      type: 'knee',
      day: 0,
      healedDay: weeks * 7,
      severity: 0.5,
      source: 'camp',
    },
  ];

  it('lets a fighter take one on something that will be gone by the night', () => {
    // The mechanic worth keeping: people fight with broken hands, and nobody is told.
    expect(canFightOn(carrying(FIGHT_THROUGH_WEEKS - 1), 0)).toBe(true);
  });

  it('does not, once it will still be badly there', () => {
    expect(canFightOn(carrying(FIGHT_THROUGH_WEEKS + 4), 0)).toBe(false);
  });

  it('says yes to a fighter carrying nothing', () => {
    expect(canFightOn([], 0)).toBe(true);
  });
});
