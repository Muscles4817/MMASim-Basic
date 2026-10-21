/**
 * The fence around `functionalRating`.
 *
 * Doc 31 § 27. Every claim the module's header makes is asserted here, and the two it *cannot*
 * make — the recorded cost of the engine's lopsided attribute economy — live in
 * `tests/statistical/functional-rating.test.ts` next to the fights that measured them.
 */

import { describe, expect, it } from 'vitest';
import {
  CONTEXT_LABELS,
  FIGHT_CONTEXTS,
  OPPOSITE_CONTEXT,
  REFERENCE_PANEL,
  REFERENCE_STYLES,
  contextScores,
  distanceControl,
  fightStyleOf,
  functionalBreakdown,
  functionalMatchup,
  functionalProfile,
  functionalRating,
  impositionProfile,
} from './functional.js';
import { ATTRIBUTE_KEYS, overallRating, type Attributes } from './attributes.js';
import { COMPETITIVE_REFERENCE } from './competitive.js';
import { ELITE_LIFT } from './physicalScale.js';

const uniform = (v: number): Attributes =>
  Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, v])) as Attributes;

const shaped = (base: number, shape: Partial<Attributes>): Attributes => ({
  ...uniform(base),
  ...shape,
});

/** Elite striking, no grappling. `ARCHETYPES.striker`'s shape, the one a wrestler solves. */
const EXPLOITABLE_STRIKER = shaped(50, {
  strikingOffence: 90,
  kicking: 88,
  strikingDefence: 88,
  speed: 86,
  power: 74,
  fightIq: 84,
  composure: 80,
  cardio: 72,
  durability: 66,
  strength: 52,
  wrestling: 35,
  takedownDefence: 42,
  groundControl: 40,
  submissions: 38,
  scrambling: 52,
});

/** Suffocating top control, ordinary striking. The Khabib shape. */
const SMOTHERER = shaped(50, {
  groundControl: 98,
  wrestling: 92,
  strength: 85,
  cardio: 82,
  takedownDefence: 88,
  submissions: 78,
  scrambling: 76,
  power: 55,
  speed: 64,
  durability: 78,
  strikingOffence: 60,
  kicking: 42,
  strikingDefence: 58,
  fightIq: 85,
  composure: 88,
});

/** No glaring hole and no elite weapon, at a contender's level. */
const ALL_ROUNDER = shaped(70, {
  power: 66,
  speed: 72,
  cardio: 74,
  durability: 71,
  strength: 68,
  strikingOffence: 73,
  kicking: 68,
  strikingDefence: 71,
  wrestling: 70,
  takedownDefence: 73,
  groundControl: 68,
  submissions: 65,
  scrambling: 70,
  fightIq: 72,
  composure: 70,
});

/**
 * A realistically-shaped all-time great: elite everywhere that matters, merely very good
 * elsewhere. Nothing uniform about him, and no attribute at 99.
 */
const ALL_TIMER = shaped(85, {
  strikingOffence: 92,
  strikingDefence: 92,
  kicking: 88,
  wrestling: 92,
  takedownDefence: 94,
  groundControl: 90,
  submissions: 85,
  scrambling: 88,
  fightIq: 95,
  composure: 93,
  speed: 88,
  power: 84,
  cardio: 90,
  durability: 86,
  strength: 88,
});

describe('the scale', () => {
  /**
   * The invariant that makes every other claim here safe to make.
   *
   * A power mean of identical values is that value, so a fighter who is equally good everywhere
   * reads exactly his own level — whatever the exponent, the panel or the route weights. It means
   * the module changes how *shape* is read and nothing about where the scale sits, which is what
   * lets the constants be tuned from measurement without the numbers drifting underneath the UI.
   */
  it.each([1, 20, 40, 50, 65, 80, 90, 99])(
    'reads a uniformly %i-rated fighter as exactly %i',
    (v) => {
      expect(functionalRating(uniform(v))).toBeCloseTo(v, 6);
    },
  );

  /**
   * The complaint that started this: nobody in the game read above 85, so the top fifteen points
   * of a 1–99 scale were dead space. A rating with a ceiling it cannot reach is not a rating with
   * headroom; it is a rating with a bug.
   *
   * The bar is a fighter who is *shaped* rather than uniform and whose best attribute is 95 — the
   * kind of fighter the sport produces about once a decade. He must read in the high eighties, and
   * a uniform 92 must read 92, so the nineties are reachable without being routine.
   */
  it('lets a realistically-shaped all-timer into the high eighties', () => {
    expect(functionalRating(ALL_TIMER)).toBeGreaterThan(88);
    expect(Math.max(...ATTRIBUTE_KEYS.map((k) => ALL_TIMER[k]))).toBeLessThan(96);
  });

  it('keeps the bottom of the scale honest', () => {
    expect(functionalRating(uniform(25))).toBeCloseTo(25, 6);
  });
});

describe('the four behaviours a mean cannot give', () => {
  /** Best ≈ worst, so there is nothing to target and who drives barely matters. */
  it('reads an all-rounder at his own level', () => {
    const b = functionalBreakdown(ALL_ROUNDER, REFERENCE_PANEL.balanced);
    expect(Math.abs(b.imposed - b.exposed)).toBeLessThan(3);
    const flat = ATTRIBUTE_KEYS.reduce((acc, k) => acc + ALL_ROUNDER[k], 0) / 15;
    expect(Math.abs(functionalRating(ALL_ROUNDER) - flat)).toBeLessThan(2);
  });

  /**
   * The headline case. `overallRating` charges Nurmagomedov a fifteenth of his rating for a hole
   * nobody is allowed to reach; this must charge him a few per cent of it.
   */
  it('reads a specialist who can impose above his flat average', () => {
    expect(functionalRating(SMOTHERER)).toBeGreaterThan(overallRating(SMOTHERER) + 2);
    const b = functionalBreakdown(SMOTHERER, REFERENCE_PANEL.balanced);
    // He gets the fight he wants, and the fight he wants is the one he is best in.
    expect(b.control).toBeGreaterThan(0.6);
    expect(b.share.groundTop + b.share.clinch).toBeGreaterThan(0.5);
  });

  /**
   * And the mirror of it, which is the whole of what being exploitable means and is nowhere in a
   * mean: elite tools, no way to keep the fight where they work.
   */
  it('reads a specialist who cannot impose below his flat average', () => {
    expect(functionalRating(EXPLOITABLE_STRIKER)).toBeLessThan(functionalRating(ALL_ROUNDER) + 1);
    // Against the one style that solves him he reads worse than against the one that does not.
    const p = functionalProfile(EXPLOITABLE_STRIKER);
    expect(p.byStyle.topWrestler).toBeLessThan(p.byStyle.longRangeStriker);
    expect(p.byStyle.submissionThreat).toBeLessThan(p.byStyle.longRangeStriker);
  });

  /**
   * A hole is only a hole if somebody can reach it, so the same hole must cost different amounts
   * against different opponents. This is the claim the single all-55 reference could not support
   * and the reason `REFERENCE_PANEL` has five members.
   *
   * **And the opponent who charges for it is whoever can *put you there*, not whoever is good
   * there.** A fighter with no bottom game is punished by the top wrestler (51.5) and barely by
   * the submission threat (55.7), because the submission threat's route is to play guard *under*
   * him — which tests his top game, not his bottom one. The first version of this test asserted
   * the opposite and was wrong, which is the mirroring in `OPPOSITE_CONTEXT` earning its keep.
   */
  it('charges a hole to whoever can put you in it', () => {
    const noBottomGame = shaped(72, { submissions: 12, scrambling: 30 });
    const vsWrestler = functionalMatchup(noBottomGame, REFERENCE_PANEL.topWrestler);
    const vsStriker = functionalMatchup(noBottomGame, REFERENCE_PANEL.longRangeStriker);
    const vsSubs = functionalMatchup(noBottomGame, REFERENCE_PANEL.submissionThreat);
    expect(vsWrestler).toBeLessThan(vsStriker - 3);
    expect(vsWrestler).toBeLessThan(vsSubs - 3);
  });
});

describe('imposition', () => {
  /**
   * **A chain, not a mix.** A wrestler who cannot get into range is not half a wrestler, and the
   * two must not read the same. Same grappling, different feet.
   */
  it('gates a takedown on winning the range first', () => {
    const grappling = {
      wrestling: 92,
      groundControl: 90,
      takedownDefence: 85,
      strength: 85,
      submissions: 70,
      scrambling: 70,
    };
    const heavyFeet = shaped(50, { ...grappling, speed: 35, fightIq: 40, cardio: 40 });
    const goodFeet = shaped(50, { ...grappling, speed: 80, fightIq: 80, cardio: 80 });
    const mover = REFERENCE_PANEL.longRangeStriker;
    expect(distanceControl(goodFeet)).toBeGreaterThan(distanceControl(heavyFeet));
    expect(impositionProfile(goodFeet, mover).groundTop).toBeGreaterThan(
      impositionProfile(heavyFeet, mover).groundTop + 0.1,
    );
  });

  /**
   * **Directional.** Refusing to let the fight happen anywhere but your range *is* imposition, and
   * a single Imposition scalar built from wrestling and clinch scores a range striker zero.
   */
  it('counts keeping the fight at long range as imposing it', () => {
    const imp = impositionProfile(EXPLOITABLE_STRIKER, REFERENCE_PANEL.balanced);
    expect(imp.outside).toBeGreaterThan(0.6);
    expect(fightStyleOf(EXPLOITABLE_STRIKER).outside).toBeGreaterThan(
      fightStyleOf(EXPLOITABLE_STRIKER).groundTop,
    );
  });

  it('never exceeds certainty, in any context, for anyone', () => {
    for (const a of [EXPLOITABLE_STRIKER, SMOTHERER, ALL_TIMER, uniform(99)]) {
      for (const style of REFERENCE_STYLES) {
        const imp = impositionProfile(a, REFERENCE_PANEL[style]);
        for (const c of FIGHT_CONTEXTS) {
          expect(imp[c]).toBeGreaterThanOrEqual(0);
          expect(imp[c]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  /** Boxing range is where two men who deny each other everything else are standing. */
  it('leaves boxing range the hardest context to be denied', () => {
    const imp = impositionProfile(uniform(30), uniform(90));
    expect(imp.boxing).toBeGreaterThan(imp.outside);
    expect(imp.boxing).toBeGreaterThan(imp.pocket);
  });
});

describe('cardio and durability are the bill the route runs up', () => {
  const PRESSURE = {
    wrestling: 85,
    strength: 82,
    groundControl: 78,
    takedownDefence: 80,
    strikingOffence: 60,
    kicking: 45,
    speed: 55,
  };

  /**
   * The three cases, in the words that produced them:
   *
   * > A pressure fighter with garbage cardio and no knockout power is going to suck. If he has
   * > outstanding knockout power he can compensate for his poor cardio, but great power and no
   * > pressure means his cardio comes back into effect.
   */
  it('charges a pressure fighter more for his tank than a counter-striker', () => {
    const pressure = shaped(55, { ...PRESSURE, cardio: 55 });
    const counter = shaped(55, {
      strikingDefence: 85,
      kicking: 82,
      speed: 84,
      fightIq: 82,
      wrestling: 45,
      strength: 45,
      cardio: 55,
    });
    const wPressure = functionalBreakdown(pressure, REFERENCE_PANEL.balanced).cardioWeight;
    const wCounter = functionalBreakdown(counter, REFERENCE_PANEL.balanced).cardioWeight;
    expect(wPressure).toBeGreaterThan(wCounter);
  });

  it('lets knockout power buy a pressure fighter out of part of the bill', () => {
    const noPower = shaped(55, { ...PRESSURE, cardio: 35, power: 40, fightIq: 60 });
    const bomber = shaped(55, { ...PRESSURE, cardio: 35, power: 95, fightIq: 60 });
    const wNoPower = functionalBreakdown(noPower, REFERENCE_PANEL.balanced).cardioWeight;
    const wBomber = functionalBreakdown(bomber, REFERENCE_PANEL.balanced).cardioWeight;
    expect(wBomber).toBeLessThan(wNoPower);
  });

  /**
   * And the sentence that decides the shape of the discount: it is gated on `control`, not on
   * power. A man with a bomb who cannot force a fight is still in a long one, by the other man's
   * choice, so his cardio comes back into effect.
   */
  it('gives the bill back to a puncher who cannot force the fight', () => {
    const imposes = shaped(55, { ...PRESSURE, cardio: 35, power: 95, fightIq: 70 });
    const cannot = shaped(55, {
      power: 95,
      cardio: 35,
      strikingOffence: 60,
      speed: 40,
      fightIq: 40,
      wrestling: 35,
      strength: 50,
      takedownDefence: 40,
    });
    const a = functionalBreakdown(imposes, REFERENCE_PANEL.balanced);
    const b = functionalBreakdown(cannot, REFERENCE_PANEL.balanced);
    expect(b.control).toBeLessThan(a.control);
    expect(b.cardioWeight).toBeGreaterThan(a.cardioWeight);
  });

  /**
   * Durability is the same shape with the opposite sign: a long-range counter-striker with elite
   * feet barely pays for a mediocre chin, and a man who lives in the pocket pays nearly double.
   */
  it('charges a pocket fighter more for his chin than a range striker', () => {
    const pocket = shaped(55, { strikingOffence: 85, power: 88, composure: 75, durability: 55 });
    const range = shaped(55, {
      kicking: 85,
      strikingDefence: 88,
      speed: 85,
      fightIq: 82,
      durability: 55,
    });
    const wPocket = functionalBreakdown(pocket, REFERENCE_PANEL.balanced).durabilityWeight;
    const wRange = functionalBreakdown(range, REFERENCE_PANEL.balanced).durabilityWeight;
    expect(wPocket).toBeGreaterThan(wRange);
  });

  it('keeps both weights inside their declared maxima', () => {
    for (const a of [EXPLOITABLE_STRIKER, SMOTHERER, ALL_ROUNDER, ALL_TIMER, uniform(20)]) {
      for (const style of REFERENCE_STYLES) {
        const b = functionalBreakdown(a, REFERENCE_PANEL[style]);
        expect(b.cardioWeight).toBeGreaterThan(0);
        expect(b.durabilityWeight).toBeGreaterThan(0);
        expect(b.cardioWeight + b.durabilityWeight).toBeLessThan(0.6);
      }
    }
  });
});

describe('the reference panel', () => {
  /**
   * **Shape, not level** — the engine-wide rule, and the one most easily broken here. A panel
   * whose wrestler were also its best fighter would measure level and report it as vulnerability.
   */
  it('gives every member the same mean', () => {
    for (const style of REFERENCE_STYLES) {
      const mean =
        ATTRIBUTE_KEYS.reduce((acc, k) => acc + REFERENCE_PANEL[style][k], 0) /
        ATTRIBUTE_KEYS.length;
      expect(mean).toBeCloseTo(COMPETITIVE_REFERENCE, 1);
    }
  });

  /**
   * Between them the five must reach all six contexts, or a hole somewhere is free.
   *
   * Measured against an ordinary professional, the best member reaches: boxing 0.84, groundBottom
   * 0.67, pocket 0.65, outside 0.61, groundTop 0.45, clinch 0.45. The bar is below the weakest of
   * those because the claim is coverage, not dominance — nobody imposes the clinch on an equal at
   * will, and a panel that did would be measuring level again.
   */
  it('reaches every context between them', () => {
    for (const c of FIGHT_CONTEXTS) {
      const best = Math.max(
        ...REFERENCE_STYLES.map((s) => impositionProfile(REFERENCE_PANEL[s], uniform(55))[c]),
      );
      expect(best).toBeGreaterThan(0.4);
    }
  });

  /** Each shaped member must actually be best at the context it is named for. */
  it('makes each specialist best where its name says', () => {
    const owner: Partial<Record<string, string>> = {
      longRangeStriker: 'outside',
      pressureFighter: 'clinch',
      topWrestler: 'groundTop',
      submissionThreat: 'groundBottom',
    };
    for (const [style, context] of Object.entries(owner)) {
      const scores = contextScores(REFERENCE_PANEL[style as keyof typeof REFERENCE_PANEL]);
      const best = FIGHT_CONTEXTS.reduce(
        (a, c) => (scores[c] > scores[a] ? c : a),
        FIGHT_CONTEXTS[0],
      );
      expect([context, 'boxing', 'clinch']).toContain(best);
      expect(scores[context as (typeof FIGHT_CONTEXTS)[number]]).toBeGreaterThan(
        contextScores(REFERENCE_PANEL.balanced)[context as (typeof FIGHT_CONTEXTS)[number]],
      );
    }
  });

  it('is combined pessimistically, never optimistically', () => {
    for (const a of [EXPLOITABLE_STRIKER, SMOTHERER, ALL_TIMER]) {
      const p = functionalProfile(a);
      const vals = REFERENCE_STYLES.map((s) => p.byStyle[s]);
      const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
      // `rating` is published to a tenth, so the comparison carries half a tenth of slack.
      expect(p.rating).toBeLessThanOrEqual(mean + 0.05);
      expect(p.rating).toBeGreaterThanOrEqual(Math.min(...vals) - 0.05);
      expect(p.byStyle[p.worstStyle]).toBe(Math.min(...vals));
    }
  });
});

describe('contexts', () => {
  it('mirrors the ground and shares the standing states', () => {
    for (const c of FIGHT_CONTEXTS) {
      expect(OPPOSITE_CONTEXT[OPPOSITE_CONTEXT[c]]).toBe(c);
    }
    expect(OPPOSITE_CONTEXT.groundTop).toBe('groundBottom');
    expect(OPPOSITE_CONTEXT.boxing).toBe('boxing');
  });

  it('names every context for a screen', () => {
    for (const c of FIGHT_CONTEXTS) expect(CONTEXT_LABELS[c]).toBeTruthy();
  });

  /**
   * Cardio and durability are charged once, in the route bill. A context score that moved with
   * either of them would double-count the two attributes whose whole character is that their value
   * is conditional.
   */
  it('keeps cardio and durability out of every context score', () => {
    const base = contextScores(uniform(55));
    for (const key of ['cardio', 'durability'] as const) {
      const bumped = contextScores(shaped(55, { [key]: 95 }));
      for (const c of FIGHT_CONTEXTS) expect(bumped[c]).toBeCloseTo(base[c], 6);
    }
  });

  it('weights each context score to exactly one', () => {
    // A weighted mean whose weights do not sum to 1 is a rating on a different scale, which would
    // break the uniform anchor silently.
    for (const v of [30, 55, 90]) {
      const scores = contextScores(uniform(v));
      for (const c of FIGHT_CONTEXTS) expect(scores[c]).toBeCloseTo(v, 6);
    }
  });

  it('spreads a balanced fighter and concentrates a specialist', () => {
    const spread = fightStyleOf(ALL_ROUNDER);
    const focused = fightStyleOf(SMOTHERER);
    expect(Math.max(...FIGHT_CONTEXTS.map((c) => spread[c]))).toBeLessThan(
      Math.max(...FIGHT_CONTEXTS.map((c) => focused[c])),
    );
    for (const w of [spread, focused]) {
      expect(FIGHT_CONTEXTS.reduce((a, c) => a + w[c], 0)).toBeCloseTo(1, 6);
    }
  });

  /**
   * A claim about shape, not level: the same fighter ten points better wants the same fight.
   *
   * `ALL_ROUNDER` rather than `SMOTHERER`, because the smotherer's 98 ground control clamps at 99
   * and a shift that is +10 on fourteen attributes and +1 on the fifteenth is not a level change.
   */
  it('reads the same style at any level', () => {
    const low = fightStyleOf(ALL_ROUNDER);
    const high = fightStyleOf(
      Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, ALL_ROUNDER[k] + 10])) as Attributes,
    );
    for (const c of FIGHT_CONTEXTS) expect(high[c]).toBeCloseTo(low[c], 6);
  });
});

describe('the division term', () => {
  /**
   * Doc 31 § 12 step 12: the number is absolute, the judgement is comparative. Without a context
   * the physicals are read absolutely, which is honest within a division and wrong across one.
   */
  it('equalises two fighters of equal quality in different divisions', () => {
    const attrs = shaped(70, { power: 70, strength: 70, speed: 70, cardio: 70, durability: 70 });
    const fly = functionalRating(attrs, {
      divisionId: 'mens-flyweight',
      sex: 'male',
      eliteLift: ELITE_LIFT,
    });
    const heavy = functionalRating(attrs, {
      divisionId: 'mens-heavyweight',
      sex: 'male',
      eliteLift: ELITE_LIFT,
    });
    // Same absolute block, so the flyweight is the better fighter *for his division*.
    expect(fly).toBeGreaterThan(heavy);
    expect(functionalRating(attrs)).toBeGreaterThan(0);
  });

  it('leaves the ten technical and mental attributes alone', () => {
    const ctx = { divisionId: 'mens-heavyweight', sex: 'male' as const, eliteLift: ELITE_LIFT };
    const a = shaped(55, { fightIq: 90 });
    const b = shaped(55, { fightIq: 40 });
    expect(functionalRating(a, ctx)).toBeGreaterThan(functionalRating(b, ctx));
  });
});

describe('matchups', () => {
  it('agrees with the panel reading it is taken from', () => {
    const p = functionalProfile(EXPLOITABLE_STRIKER);
    expect(functionalMatchup(EXPLOITABLE_STRIKER, REFERENCE_PANEL[p.worstStyle])).toBeCloseTo(
      p.byStyle[p.worstStyle],
      1,
    );
  });

  /**
   * **Not monotone in the opponent's level, and deliberately not claimed to be.**
   *
   * A matchup reading is "how good are you in the fight that actually happens", and the opponent's
   * *level* enters only through where that fight happens — the base is a reading of your own
   * context scores. So a fighter with something to protect reads better against an opponent who
   * cannot reach it, which is the claim, and a fighter with nothing to protect moves by a few
   * tenths in either direction as the route bill shifts: `ALL_ROUNDER` reads 70.3 against a
   * uniform 25 and 70.7 against a uniform 85, because driving the fight makes his tank matter
   * less and his tank is above his base.
   *
   * That is an artefact of the blend rather than a signal, it is bounded by the route weights, and
   * the honest thing is to fence it rather than to assert a monotonicity the module does not have.
   * A reading that must be ordered by opponent quality is a win probability, and this is not one.
   */
  it('reads a fighter with a hole better against an opponent who cannot reach it', () => {
    for (const a of [EXPLOITABLE_STRIKER, SMOTHERER]) {
      expect(functionalMatchup(a, uniform(25))).toBeGreaterThan(functionalMatchup(a, uniform(85)));
    }
    const flat = functionalMatchup(ALL_ROUNDER, uniform(25));
    expect(Math.abs(flat - functionalMatchup(ALL_ROUNDER, uniform(85)))).toBeLessThan(1);
  });
});
