/**
 * The promotion's patience.
 *
 * These pin the ladder itself. The thing worth defending is not any single threshold but the
 * shape: that an ordinary schedule is silent, that being asked comes before being dropped, and
 * that time alone almost never ends a deal — refusing does. Doc 21 § 3.
 */

import { describe, expect, it } from 'vitest';
import {
  PATIENCE,
  REFUSALS_BEFORE_CUT,
  chaseUplift,
  daysIdle,
  hasEscalated,
  promotionPatience,
  type PatienceStage,
} from './patience.js';

/** A fighter nobody is selling tickets to, so the ladder runs at close to its stated lengths. */
const nobody = (daysIdle: number, refusals = 0) =>
  promotionPatience({ daysIdle, refusals, starPower: 20 });

const stageAt = (days: number, refusals = 0): PatienceStage => nobody(days, refusals).stage;

describe('an ordinary schedule', () => {
  it('says nothing at all between fights', () => {
    /*
     * The measurement this whole document turns on: the modern UFC average is 1.69 bouts per
     * active fighter-year and the median is 2, so five months between fights is not a lapse —
     * it is the middle of the distribution. A game that speaks here is nagging.
     */
    expect(stageAt(0)).toBe('content');
    expect(stageAt(90)).toBe('content');
    expect(stageAt(150)).toBe('content');
  });

  it('stays silent through a full twelve-week camp', () => {
    // A long build is 84 days and the fight itself is weeks after that. None of it may register.
    expect(stageAt(84)).toBe('content');
  });

  it('is silent for somebody who already has a fight booked, however long they have been out', () => {
    // Being in camp *is* the answer to "when are you fighting". Chasing somebody for a bout they
    // have already taken is the kind of detail that makes a simulation feel unaware of itself.
    const inCamp = promotionPatience({
      daysIdle: 900,
      refusals: 3,
      starPower: 20,
      hasBookedFight: true,
    });
    expect(inCamp.stage).toBe('content');
  });
});

describe('the ladder', () => {
  it('nudges before it presses, and presses before it is final', () => {
    expect(stageAt(PATIENCE.nudge)).toBe('nudged');
    expect(stageAt(PATIENCE.press)).toBe('pressing');
    expect(stageAt(PATIENCE.final)).toBe('final');
  });

  it('gives a reason at every rung past the first', () => {
    // Every one of these is shown to the player verbatim. An empty string is a blank inbox item.
    for (const days of [PATIENCE.nudge, PATIENCE.press, PATIENCE.final, PATIENCE.hardCut]) {
      expect(nobody(days).reason.length, `no reason at ${days} days`).toBeGreaterThan(0);
    }
    expect(nobody(0).reason).toBe('');
  });
});

describe('what actually ends a deal', () => {
  it('does not cut a fighter who has refused nothing, however long they have been out', () => {
    /*
     * The regression that started all of this. A player who trains rather than fights has not
     * done anything to anybody: they have taken no offers because — until this landed — none
     * were ever made. Eighteen months of that is a quiet career, not a sackable offence.
     */
    expect(stageAt(PATIENCE.cut, 0)).not.toBe('cut');
    expect(stageAt(PATIENCE.cut + 100, 0)).not.toBe('cut');
  });

  it('cuts a fighter who has been out that long and turned fights down', () => {
    expect(stageAt(PATIENCE.cut, REFUSALS_BEFORE_CUT)).toBe('cut');
  });

  it('does not cut on refusals alone, however many', () => {
    // Turning down three fights in a busy year is a fighter with opinions about matchmaking,
    // not one who has stopped fighting.
    expect(stageAt(PATIENCE.press, 5)).not.toBe('cut');
  });

  it('cuts at two years regardless, because that is no longer a fighter', () => {
    expect(stageAt(PATIENCE.hardCut, 0)).toBe('cut');
  });

  it('never cuts a champion for being inactive', () => {
    /*
     * Not an exemption from being *asked* — a champion is chased hardest of anybody. It is an
     * exemption from being dropped, because a promotion does not release the holder of its own
     * belt for inactivity. It books them a defence, which is what the offers are.
     */
    const champ = promotionPatience({
      daysIdle: PATIENCE.hardCut * 2,
      refusals: 9,
      starPower: 20,
      isChampion: true,
    });
    expect(champ.stage).toBe('final');
  });
});

describe('star power buys patience', () => {
  it('stretches every rung for a draw', () => {
    // The same unevenness `releaseRisk` already encodes: patience is a commercial decision.
    const star = promotionPatience({ daysIdle: PATIENCE.press, refusals: 0, starPower: 95 });
    const journeyman = promotionPatience({ daysIdle: PATIENCE.press, refusals: 0, starPower: 5 });

    expect(journeyman.stage).toBe('pressing');
    expect(star.stage).toBe('nudged');
  });

  it('still runs out for a star eventually', () => {
    const star = promotionPatience({
      daysIdle: PATIENCE.hardCut * 2,
      refusals: 0,
      starPower: 100,
    });
    expect(star.stage).toBe('cut');
  });

  it('never stretches to the point where an unknown is cut inside a normal year', () => {
    // The floor on the stretch factor exists for this: a fighter with no star power at all must
    // still get the whole ladder, not a shortcut to the end of it.
    expect(stageAt(300, 5)).not.toBe('cut');
  });
});

describe('escalation', () => {
  it('is true the first time anything is said', () => {
    expect(hasEscalated(undefined, 'nudged')).toBe(true);
    expect(hasEscalated(undefined, 'content')).toBe(false);
  });

  it('is false for standing still, and for going backwards', () => {
    // Going backwards happens: a fighter fights, and the whole ladder resets under them.
    expect(hasEscalated('pressing', 'pressing')).toBe(false);
    expect(hasEscalated('final', 'nudged')).toBe(false);
  });

  it('is true for moving up', () => {
    expect(hasEscalated('nudged', 'pressing')).toBe(true);
    expect(hasEscalated('final', 'cut')).toBe(true);
  });
});

describe('measuring idleness', () => {
  it('counts from the last bout', () => {
    expect(daysIdle(100, 0, 250)).toBe(150);
  });

  it('counts from the signing day for somebody who has never fought', () => {
    /*
     * Not from zero, and not from the start of time. A fighter who has never fought is as idle
     * as their deal is old — that is the only span anybody could reasonably hold against them,
     * and it is also when the promotion started waiting.
     */
    expect(daysIdle(undefined, 200, 300)).toBe(100);
  });

  it('never goes negative on a bout in the future', () => {
    // A booked bout can sit ahead of today, and a negative idleness would read as content
    // forever — which is right, but by accident rather than by construction.
    expect(daysIdle(400, 0, 300)).toBe(0);
  });
});

describe('the sweetener on a chased fight', () => {
  it('rises as they get keener, and stays small', () => {
    // Small on purpose. This is a promotion trying to get somebody into a cage, not a
    // renegotiation — it must not read as the re-paper, which pays 25–40%.
    expect(chaseUplift('content')).toBe(0);
    expect(chaseUplift('final')).toBeGreaterThan(chaseUplift('pressing'));
    expect(chaseUplift('final')).toBeLessThan(0.25);
  });
});
