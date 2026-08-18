/**
 * When a career ends, and why.
 *
 * Untested until now, which is how it came to have two defects that only showed up when somebody
 * played whole careers and counted the endings. Measured across three twenty-year worlds — 525
 * retirements:
 *
 * - **31% happened before 28.** A five-fight skid with the confidence gone produced an identical
 *   urge at 23 and at 34, both landing on 23.2% per fight, because nothing in the function knew
 *   how much career was left to come back to. Doc 25 phase 1 made that far worse by giving careers
 *   real disruption — injuries, suspensions, cancelled fights — while leaving the skid as the only
 *   exit any of it could lead to.
 * - **Body wear was dead code.** `wearTerm` began at 50 and the highest body wear ever observed at
 *   retirement was 51. `traumaTerm` began at 45 against a 90th percentile of 63, so it fired for
 *   barely the top decile, and the sport's most characteristic ending — being told to stop — was
 *   arithmetically almost unreachable.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import { applyAgeing } from './development.js';
import {
  DRIFT_GRACE_DAYS,
  driftUrge,
  retirementDrivers,
  retirementReason,
  retirementUrge,
  shouldRetire,
} from './retirement.js';
import { confidenceBaseline } from '../domain/personality.js';
import type { Fighter } from '../domain/fighter.js';

const YEAR = 365;
const rng = () => createRng('retirement-test');

/** A fighter at a given point in a career, with the four things the decision reads. */
function at(o: {
  age: number;
  streak?: number;
  confidence?: number;
  headTrauma?: number;
  bodyWear?: number;
}): Fighter {
  const base = makeFighter({ age: o.age, headTrauma: o.headTrauma ?? 5 });
  return {
    ...base,
    condition: {
      ...base.condition,
      confidence: o.confidence ?? 60,
      bodyWear: o.bodyWear ?? 5,
    },
    summary: { ...base.summary, streak: o.streak ?? 0 },
  };
}

/** Urge is not a probability; `shouldRetire` squares it. This is what a fight actually costs. */
const perFight = (f: Fighter) => retirementUrge(f, 0) ** 2;

describe('a bad run means something different at 23 than at 35', () => {
  it('does not end a young fighter’s career over four losses', () => {
    /*
     * The sport is full of people who were 4-6 at 24 and 19-8 at 32. What a bad run at 23 gets you
     * is cut and dropped a level, not retired — and if the game cannot express that, then every
     * injury, suspension and cancelled fight doc 25 added routes to the same place.
     */
    expect(perFight(at({ age: 23, streak: -4, confidence: 10 }))).toBeLessThan(0.03);
  });

  it('ends a veteran’s over the same four', () => {
    expect(perFight(at({ age: 35, streak: -4, confidence: 10 }))).toBeGreaterThan(0.1);
  });

  it('weighs the identical skid several times harder late than early', () => {
    // The specific defect: these two were exactly equal, to three significant figures.
    const young = retirementUrge(at({ age: 23, streak: -5, confidence: 5 }), 0);
    const old = retirementUrge(at({ age: 34, streak: -5, confidence: 5 }), 0);
    expect(old).toBeGreaterThan(young * 2.5);
  });

  it('slides rather than switching, so nothing changes on a birthday', () => {
    const urges = [24, 27, 30, 33, 36].map((age) =>
      retirementUrge(at({ age, streak: -3, confidence: 20 }), 0),
    );
    for (let i = 1; i < urges.length; i++) {
      expect(urges[i], `${i}`).toBeGreaterThan(urges[i - 1]!);
    }
  });
});

describe('damage ends careers', () => {
  it('retires a badly damaged fighter who is winning and happy', () => {
    /*
     * No skid, no confidence problem, not old. Only the accumulated damage — which is exactly the
     * fighter the sport tells to stop, and which the old thresholds could not reach: `traumaTerm`
     * started at 45 against a measured 90th percentile of 63.
     */
    const damaged = at({ age: 30, headTrauma: 72, bodyWear: 55, confidence: 65 });
    const fresh = at({ age: 30, headTrauma: 5, bodyWear: 5, confidence: 65 });
    expect(perFight(damaged)).toBeGreaterThan(0.1);
    expect(perFight(damaged)).toBeGreaterThan(perFight(fresh) * 4);
  });

  it('reads body wear at all, which it did not', () => {
    // `wearTerm` began at 50 and the highest body wear ever seen at retirement was 51.
    const worn = at({ age: 30, bodyWear: 45 });
    const sound = at({ age: 30, bodyWear: 5 });
    expect(retirementUrge(worn, 0)).toBeGreaterThan(retirementUrge(sound, 0));
  });

  it('reads trauma from where trauma actually accumulates', () => {
    // p50 at retirement is 17 and p90 is 63, so a threshold above 45 is a threshold for nobody.
    expect(retirementUrge(at({ age: 30, headTrauma: 40 }), 0)).toBeGreaterThan(
      retirementUrge(at({ age: 30, headTrauma: 10 }), 0),
    );
  });

  it('still lets a clean fighter fight on into their thirties', () => {
    // The counterweight. If damage is the new exit it must not become an exit for everybody.
    expect(perFight(at({ age: 32, headTrauma: 8, bodyWear: 6, confidence: 70 }))).toBeLessThan(0.1);
  });
});

describe('age still ends everything', () => {
  it('is close to certain past the hard age, whatever the fighter wants', () => {
    // Bodies do not negotiate: past `HARD_AGE` the personality discount stops applying.
    const stubborn = {
      ...at({ age: 50, confidence: 90 }),
      personality: { ...makeFighter().personality, ambition: 95, resilience: 95 },
    };
    expect(retirementUrge(stubborn, 0)).toBeGreaterThan(0.6);
  });

  it('leaves a 22-year-old with a clean record essentially untouched', () => {
    expect(perFight(at({ age: 22 }))).toBeLessThan(0.01);
  });
});

describe('the reason names the thing that actually decided it', () => {
  it('says medical where the urge came from damage', () => {
    /*
     * The threshold here was 70 while the urge starts reading trauma at 25, so a fighter genuinely
     * driven out by damage was told they had retired on a losing run — the skid being the only
     * label that fitted. Measured after aligning them: medical went from 5% of all retirements to
     * 20%, which is a sport rather than a rounding error.
     */
    expect(retirementReason(at({ age: 33, headTrauma: 60, streak: -3 }), 0)).toMatch(/medical/i);
  });

  it('says the losing run where that is what it was', () => {
    expect(retirementReason(at({ age: 33, headTrauma: 10, streak: -4 }), 0)).toMatch(/losing run/i);
  });

  it('says age past the hard age', () => {
    expect(retirementReason(at({ age: 47, headTrauma: 10 }), 0)).toMatch(/age/i);
  });
});

describe('the decision itself', () => {
  it('squares the urge, so thinking about it is not the same as doing it', () => {
    // Which is what keeps "one fight too many" available, and that is most of the drama.
    const thinking = at({ age: 34, streak: -2, confidence: 30 });
    const urge = retirementUrge(thinking, 0);
    // Genuinely considering it — not idle, not decided.
    expect(urge).toBeGreaterThan(0.15);
    expect(urge).toBeLessThan(0.5);

    const went = Array.from({ length: 400 }, (_, i) =>
      shouldRetire(thinking, 0, createRng(`r${i}`)),
    ).filter(Boolean).length;
    expect(went / 400).toBeLessThan(urge);
  });

  it('is permanent once taken', () => {
    const retired = { ...at({ age: 24 }), retiredDay: 0 };
    expect(shouldRetire(retired, 100, createRng('x'))).toBe(true);
  });
});

describe('damage takes the chin off the card, not just off the night', () => {
  /*
   * Doc 25 § 4. Trauma's entire effect used to be at fight time — `effectiveDurability` subtracted
   * up to 22 points of chin and `retirementUrge` read it — so the number on a fighter's card never
   * moved however many wars they had been in. Two fighters the same age, one with 39 head trauma
   * and one with 5, declined identically.
   *
   * Here rather than in its own file because it is the same question this suite already asks: what
   * a career costs, and what ends it.
   */
  const over = (years: number, headTrauma: number): number => {
    let f = makeFighter({
      age: 26,
      headTrauma,
      attributes: { durability: 70 },
      potential: { durability: 70 },
    }) as Fighter;
    for (let y = 0; y < years; y++) {
      f = applyAgeing(f, y * 365, (y + 1) * 365, createRng(`d${headTrauma}:${y}`)).fighter;
    }
    return 70 - f.attributes.durability;
  };

  it('costs a damaged fighter far more durability than a clean one', () => {
    expect(over(10, 80)).toBeGreaterThan(over(10, 0) * 2);
  });

  it('is convex, so the first twenty points of trauma are nearly free', () => {
    // How the real thing is understood: a little accumulated damage is not the same problem as a
    // lot, and a linear term would say it was.
    const early = over(10, 20) - over(10, 0);
    const late = over(10, 80) - over(10, 60);
    expect(late).toBeGreaterThan(early);
  });

  it('leaves an undamaged fighter exactly where age alone leaves them', () => {
    const clean = makeFighter({ age: 26, headTrauma: 0 }) as Fighter;
    const aged = applyAgeing(clean, 0, 365 * 5, createRng('clean')).fighter;
    const control = applyAgeing(clean, 0, 365 * 5, createRng('clean')).fighter;
    expect(aged.attributes.durability).toBe(control.attributes.durability);
  });

  it('does not evaporate a chin, however long the career', () => {
    // The same floor age decline observes. A former elite is diminished, not a novice.
    let f = makeFighter({
      age: 26,
      headTrauma: 95,
      attributes: { durability: 80 },
      potential: { durability: 80 },
    }) as Fighter;
    for (let y = 0; y < 20; y++) {
      f = applyAgeing(f, y * 365, (y + 1) * 365, createRng(`f${y}`)).fighter;
    }
    expect(f.attributes.durability).toBeGreaterThanOrEqual(Math.max(12, 80 * 0.4));
  });
});

/**
 * A bout on the record, so the fighter reads as active.
 *
 * `retirementReason` answers "why did this career end", and `driftUrge` outranks the weighted
 * terms — correctly, because a fighter nobody has called in eighteen months did not stop for any
 * of the reasons below. Every test in the reason block is about somebody who has just fought, so
 * they need to look like it. The seeded roster ships with an empty record and is exempt for the
 * separate reason documented on `driftUrge`.
 */
const justFought = (f: Fighter, day = 0): Fighter => ({
  ...f,
  record: [
    {
      boutId: 'b',
      opponentId: 'other',
      promotionId: 'p',
      day,
      outcome: 'loss',
      method: 'decisionUnanimous',
      round: 3,
      timeSeconds: 300,
      divisionId: f.divisionId,
      wasTitleFight: false,
    },
  ] as unknown as Fighter['record'],
});

const withCondition = (o: Partial<Fighter['condition']>, overrides = {}): Fighter => {
  const f = makeFighter(overrides);
  return justFought({ ...f, condition: { ...f.condition, ...o } });
};

describe('time restores self-belief', () => {
  it('brings a beaten fighter up over a year out, rather than freezing them at their worst', () => {
    /*
     * The whole defect in one assertion. Confidence was written in exactly one place — the
     * post-fight path — so a fighter who lost three in a row and then took a year off came back
     * at precisely the number the last defeat left them on, forever.
     */
    const beaten = withCondition({ confidence: 12 }, { age: 24 });
    const after = applyAgeing(beaten, 0, YEAR, rng()).fighter;
    expect(after.condition.confidence).toBeGreaterThan(beaten.condition.confidence);
    expect(after.condition.confidence).toBeLessThan(confidenceBaseline(beaten.personality));
  });

  it('does it through a camp-length span too, not only through long layoffs', () => {
    const beaten = withCondition({ confidence: 20 }, { age: 24 });
    const after = applyAgeing(beaten, 0, 70, rng()).fighter;
    expect(after.condition.confidence).toBeGreaterThan(20);
  });

  it('takes the remaining retirement pressure off a young fighter on a bad run', () => {
    /*
     * Two independent fixes stack here, and it is worth saying which does what.
     *
     * The traced case was a 24-year-old at confidence 12 on a three-fight skid carrying an urge of
     * 0.36 — a 12.9% chance of walking away *per fight*, for being 24 and 0-3. `careerStage` now
     * weights the skid and confidence terms by how much career is left to go back to, which alone
     * takes that to 0.08 before anything else happens: losing is a setback at 23 and a verdict at
     * 35.
     *
     * Confidence recovery is the other half and works on the input rather than the weighting. The
     * skid does not heal here — it is still a three-fight losing run a year later and should still
     * weigh something — but the belief does, and what is left of the urge goes with it.
     */
    const f = makeFighter({ age: 24 });
    const young: Fighter = justFought({
      ...f,
      condition: { ...f.condition, confidence: 12 },
      summary: { ...f.summary, streak: -3 },
    });
    const before = retirementUrge(young, 0);

    // Already survivable on the weighting alone: nothing here should read as a finished career.
    expect(before ** 2).toBeLessThan(0.02);

    const recovered = applyAgeing(young, 0, YEAR, rng()).fighter;
    const after = retirementUrge(recovered, YEAR);
    expect(after).toBeLessThan(before * 0.8);
  });

  it('leaves a genuinely finished veteran finished', () => {
    // Recovery must not rescue everybody. Age, damage and wear are not moods.
    const veteran = withCondition({ confidence: 15, headTrauma: 80, bodyWear: 75 }, { age: 41 });
    expect(retirementUrge(veteran, 0)).toBeGreaterThan(0.4);
    const after = applyAgeing(veteran, 0, YEAR, rng()).fighter;
    expect(retirementUrge(after, YEAR)).toBeGreaterThan(0.4);
  });
});

describe('the reason a fighter is given', () => {
  it('names lost belief when that is what was actually pushing them', () => {
    /*
     * `retirementReason` used to require `confidence <= 20` while the decision fired on the
     * urge, which is meaningfully non-zero long before that. Traced: a fighter who quit at
     * confidence 24 was told they "retired on their own terms".
     */
    const shaken = withCondition({ confidence: 24 }, { age: 27 });
    expect(retirementReason(shaken, 0)).toMatch(/desire/i);
  });

  it('still puts the body first, because that outranks how anybody feels', () => {
    const hurt = withCondition({ confidence: 10, headTrauma: 78 }, { age: 34 });
    expect(retirementReason(hurt, 0)).toMatch(/medical advice/i);
  });

  it('names accumulated mileage, which previously had no reason at all', () => {
    const worn = withCondition({ confidence: 70, bodyWear: 95, headTrauma: 20 }, { age: 30 });
    const drivers = retirementDrivers(worn, 0);
    expect(drivers.wear).toBeGreaterThan(drivers.confidence);
    expect(retirementReason(worn, 0)).toMatch(/body stopped answering/i);
  });

  it('says "own terms" only when nothing was really pushing them', () => {
    const content = withCondition({ confidence: 75 }, { age: 30 });
    expect(retirementReason(content, 0)).toMatch(/own terms/i);
  });

  it('agrees with the urge it was derived from', () => {
    const f = withCondition({ confidence: 30, headTrauma: 50 }, { age: 35 });
    expect(retirementDrivers(f, 0).urge).toBe(retirementUrge(f, 0));
  });
});

describe('the careers nobody announces the end of', () => {
  const active = (o: Partial<Fighter['condition']> = {}, overrides = {}) =>
    withCondition(o, overrides);

  it('leaves a fighter who is still competing alone', () => {
    expect(driftUrge(active({}, { age: 28 }), 200)).toBe(0);
  });

  it('starts only once they are genuinely idle, not merely between fights', () => {
    // The world books the average fighter about once every eleven months. A year out is a
    // trough; the mechanic must not read it as a career ending.
    const f = active({}, { age: 28 });
    expect(driftUrge(f, 365)).toBe(0);
    expect(driftUrge(f, DRIFT_GRACE_DAYS + 400)).toBeGreaterThan(0);
  });

  it('treats an empty record as fresh rather than as never', () => {
    /*
     * Both seeded worlds ship every fighter with an empty `record` — their history is backstory,
     * not rows — while `proDebutDay` runs back nineteen years before the save starts. Measured
     * against the 2026 seed when this read the debut day instead: 811 of 858 fighters had a
     * non-zero drift urge on day one of a new game.
     */
    const neverFought = makeFighter({ age: 30 });
    expect(neverFought.record.length).toBe(0);
    expect(driftUrge(neverFought, 5000)).toBe(0);
  });

  it('keeps calling the people who sell tickets', () => {
    const idleDay = DRIFT_GRACE_DAYS + 500;
    const nobody = { ...active({}, { age: 30 }), reputation: 20 };
    const contender = { ...active({}, { age: 30 }), reputation: 85 };
    expect(driftUrge(contender, idleDay)).toBeLessThan(driftUrge(nobody, idleDay));
  });

  it('lets an ambitious fighter keep answering the phone longer', () => {
    const idleDay = DRIFT_GRACE_DAYS + 500;
    const driven = active({}, { age: 30, personality: { ambition: 95 } });
    const content = active({}, { age: 30, personality: { ambition: 5 } });
    expect(driftUrge(driven, idleDay)).toBeLessThan(driftUrge(content, idleDay));
  });

  it('says so plainly, because it is not the same ending as walking away', () => {
    expect(retirementReason(active({}, { age: 31 }), DRIFT_GRACE_DAYS + 500)).toMatch(/drifted/i);
  });

  it('never fires on somebody already retired', () => {
    const gone = { ...active({}, { age: 31 }), retiredDay: 100 };
    expect(driftUrge(gone, DRIFT_GRACE_DAYS + 900)).toBe(0);
  });
});
