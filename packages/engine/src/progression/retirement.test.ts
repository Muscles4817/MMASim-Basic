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
import { retirementReason, retirementUrge, shouldRetire } from './retirement.js';
import type { Fighter } from '../domain/fighter.js';

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
