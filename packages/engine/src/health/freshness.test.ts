/**
 * How recovered a fighter is, and what puts them there.
 *
 * The claims worth holding are about *shape* rather than about any one constant: a camp digs a
 * hole, time fills it, the hole is deeper and the filling slower the more career a fighter has
 * behind them, and how hard a fight was decides what it cost. The specific numbers are calibrated
 * in doc 25 § 5 and re-derived when they move; these are the properties that must survive that.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import { applyAgeing, applyTraining } from '../progression/development.js';
import {
  FRESH,
  ageDrag,
  campFreshnessCost,
  describeFreshness,
  fightFreshnessCost,
  freshnessOf,
  recoveryRate,
} from './freshness.js';
import type { FightExposure } from './injuries.js';
import type { Fighter } from '../domain/fighter.js';

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

const QUICK = night({ headDamage: 2, minutes: 0.5, controlMinutes: 0.4 });
const WAR = night({
  headDamage: 90,
  bodyDamage: 25,
  legDamage: 20,
  knockdownsSuffered: 1,
  controlMinutes: 2,
  scrambles: 5,
});

/** A fighter with a given amount of mileage on them. `makeFighter` puts them at `age` on day 0. */
const worn = (age: number, bodyWear: number): Fighter => {
  const base = makeFighter({ age });
  return { ...base, condition: { ...base.condition, bodyWear } };
};

/** Run one camp and the days it took, which is what every caller in the game actually does. */
function camp(fighter: Fighter, weeks: number): Fighter {
  const trained = applyTraining({
    fighter,
    focuses: ['boxing'],
    weeks,
    day: 0,
    rng: createRng('c'),
  }).fighter;
  return applyAgeing(trained, 0, weeks * 7, createRng('a')).fighter;
}

describe('a fighter starts fresh, and old saves load fresh', () => {
  it('reads a missing field as fully recovered, not as empty', () => {
    /*
     * Every fighter in every save written before this existed has no `freshness`. Absent has to
     * mean *fresh* — the same rule `lastTrained` follows in doc 23 § 2.5 — or upgrading the game
     * opens a career with eight hundred exhausted fighters on the first tick.
     */
    const legacy = makeFighter({ age: 30 });
    const stripped = {
      ...legacy,
      condition: { ...legacy.condition, freshness: undefined },
    } as Fighter;
    expect(freshnessOf(stripped)).toBe(FRESH);
  });
});

describe('a camp digs a hole and time fills it', () => {
  it('leaves a fighter meaningfully down after a full camp', () => {
    const after = freshnessOf(camp(makeFighter({ age: 25 }), 8));
    expect(after).toBeLessThan(70);
    expect(after).toBeGreaterThan(30);
  });

  it('digs deeper the longer the camp', () => {
    const short = freshnessOf(camp(makeFighter({ age: 25 }), 4));
    const long = freshnessOf(camp(makeFighter({ age: 25 }), 12));
    expect(long).toBeLessThan(short);
  });

  it('fills back up when the fighter does nothing', () => {
    let f = camp(makeFighter({ age: 25 }), 8);
    const bottom = freshnessOf(f);
    f = applyAgeing(f, 56, 56 + 70, createRng('rest')).fighter;
    expect(freshnessOf(f)).toBeGreaterThan(bottom);
    expect(freshnessOf(f)).toBe(FRESH);
  });

  it('never goes above fully fresh, however long the rest', () => {
    const rested = applyAgeing(makeFighter({ age: 25 }), 0, 3000, createRng('r')).fighter;
    expect(freshnessOf(rested)).toBe(FRESH);
  });

  it('carries the overshoot of a very long camp instead of flooring it', () => {
    /*
     * The subtle one, and a bug that was in this for an afternoon. The load is charged by
     * `applyTraining` and the recovery for the same days by `applyAgeing`, because every caller
     * runs both — so clamping the intermediate at zero throws away everything a long camp spent
     * past 100 and then credits recovery against a floor. Measured, that put an eight-week camp's
     * end state at 67 where the arithmetic says 57, and it got worse the longer the camp.
     *
     * The test for it is that camp length keeps mattering well past the point where the naive
     * version would have bottomed out.
     */
    const twelve = freshnessOf(camp(makeFighter({ age: 25 }), 12));
    const sixteen = freshnessOf(camp(makeFighter({ age: 25 }), 16));
    expect(sixteen).toBeLessThan(twelve);
  });
});

describe('mileage is what makes it bite', () => {
  it('brings a young clean fighter back faster than a worn old one', () => {
    expect(recoveryRate(worn(25, 5), 25)).toBeGreaterThan(recoveryRate(worn(34, 60), 34) * 1.5);
  });

  it('slows with age even at identical wear', () => {
    expect(recoveryRate(worn(38, 20), 38)).toBeLessThan(recoveryRate(worn(25, 20), 25));
  });

  it('slows with wear even at identical age', () => {
    expect(recoveryRate(worn(28, 70), 28)).toBeLessThan(recoveryRate(worn(28, 5), 28));
  });

  it('costs a 34-year-old materially more camp than a 24-year-old', () => {
    // The whole point of putting this here rather than in a constant: an older fighter declines
    // faster partly *because* the same work costs them more and clears more slowly.
    expect(freshnessOf(camp(makeFighter({ age: 34 }), 8))).toBeLessThan(
      freshnessOf(camp(makeFighter({ age: 24 }), 8)),
    );
  });

  it('is bounded, so nobody stops recovering entirely', () => {
    expect(ageDrag(60)).toBeGreaterThan(0.5);
    expect(recoveryRate(worn(45, 100), 45)).toBeGreaterThan(0);
  });
});

describe('what a fight costs depends on the fight', () => {
  it('charges a war many times what a quick finish charges', () => {
    // Read off the same exposure the injury roll uses, which is the point: one night, one measure
    // of how hard it was, feeding both what it broke and how long it takes to come back from.
    expect(fightFreshnessCost(WAR)).toBeGreaterThan(fightFreshnessCost(QUICK) * 8);
  });

  it('never makes a fight free', () => {
    expect(fightFreshnessCost(QUICK)).toBeGreaterThan(0);
  });

  it('leaves a war costing about two months of recovery', () => {
    // The § 5 calibration target, stated where it will fail if somebody moves a constant.
    const weeks = fightFreshnessCost(WAR) / recoveryRate(worn(25, 5), 25) / 7;
    expect(weeks).toBeGreaterThan(6);
    expect(weeks).toBeLessThan(11);
  });

  it('leaves a quick finish costing about a week', () => {
    const weeks = fightFreshnessCost(QUICK) / recoveryRate(worn(25, 5), 25) / 7;
    expect(weeks).toBeLessThan(2);
  });
});

describe('the player can read it', () => {
  it('says something plain at every level', () => {
    expect(describeFreshness(100)).toBe('Fresh');
    expect(describeFreshness(10)).toBe('Running on empty');
    for (const value of [0, 25, 45, 65, 85, 100]) {
      expect(describeFreshness(value).length).toBeGreaterThan(3);
    }
  });

  it('never describes a fresh fighter as tired', () => {
    expect(describeFreshness(95)).not.toMatch(/flat|empty/i);
  });
});

describe('the arithmetic stays sane', () => {
  it('charges nothing for a camp of no days', () => {
    expect(campFreshnessCost(0)).toBe(0);
    expect(campFreshnessCost(-10)).toBe(0);
  });
});
