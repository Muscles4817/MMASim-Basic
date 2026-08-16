/**
 * When the same fight can be made again.
 *
 * A flat two-year block on every rematch is the wrong shape, and it removed the sport's best
 * recurring storyline: a title changing hands on a split decision — the single most
 * rematchable event there is — was unbookable for two full years, by which time the belt had
 * usually moved on twice and the fight everybody wanted could never be made.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  REMATCH_COOLDOWN_DAYS,
  rematchCooldownFor,
  type FightRecordEntry,
  type Fighter,
} from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const entry = (over: Partial<FightRecordEntry>): FightRecordEntry =>
  ({
    boutId: 'b1',
    opponentId: 'f_other',
    promotionId: 'p_apex',
    day: 0,
    outcome: 'loss',
    method: 'decisionUnanimous',
    round: 3,
    timeSeconds: 900,
    divisionId: 'mens-lightweight',
    wasTitleFight: false,
    ...over,
  }) as FightRecordEntry;

describe('the rematch cooldown', () => {
  it('makes you wait two years for a fight nobody asked to see again', () => {
    // The case the cooldown exists for: a one-sided decision, run back for no reason.
    expect(rematchCooldownFor(entry({}))).toBe(REMATCH_COOLDOWN_DAYS);
    expect(rematchCooldownFor(entry({ method: 'ko' }))).toBe(REMATCH_COOLDOWN_DAYS);
  });

  it('runs a title fight back quickly', () => {
    // Close to standard when a belt changes hands, and written into some contracts outright.
    expect(rematchCooldownFor(entry({ wasTitleFight: true }))).toBeLessThanOrEqual(182);
  });

  it('runs an unfinished argument back quickly too', () => {
    // A split, a majority or a draw is an argument, and the promotion sells the argument.
    expect(rematchCooldownFor(entry({ method: 'decisionSplit' }))).toBeLessThan(
      REMATCH_COOLDOWN_DAYS,
    );
    expect(rematchCooldownFor(entry({ method: 'decisionMajority' }))).toBeLessThan(
      REMATCH_COOLDOWN_DAYS,
    );
    expect(rematchCooldownFor(entry({ outcome: 'draw' }))).toBeLessThan(REMATCH_COOLDOWN_DAYS);
  });

  it('rates a title fight more rematchable than a controversial one', () => {
    expect(rematchCooldownFor(entry({ wasTitleFight: true }))).toBeLessThan(
      rematchCooldownFor(entry({ method: 'decisionSplit' })),
    );
  });

  it('never lengthens a cooldown a caller asked to shorten', () => {
    // The exceptions clamp downward only. A caller passing a short cooldown - a promotion
    // with high matchmaking aggression, say - must not have it silently extended by a fight
    // being a title fight.
    expect(rematchCooldownFor(entry({ wasTitleFight: true }), 30)).toBe(30);
    expect(rematchCooldownFor(entry({ method: 'decisionSplit' }), 30)).toBe(30);
  });
});

describe('rematches actually happen', () => {
  it('lets a division produce at least one rematch over a decade', () => {
    // The end-to-end check. If the cooldown is still effectively absolute, nobody in the
    // world ever fights the same person twice and the sport has no history in it.
    const db = createNewGame({ adapter: undefined });
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    for (let year = 0; year < 10; year++) {
      advanceWorld(db, year * 365, (year + 1) * 365, player.id);
    }

    let rematches = 0;
    for (const fighter of db.fighters.findAll() as Fighter[]) {
      const seen = new Set<string>();
      for (const bout of fighter.record) {
        const key = bout.opponentId as string;
        if (seen.has(key)) rematches++;
        seen.add(key);
      }
    }
    expect(rematches, 'nobody fought the same opponent twice in ten years').toBeGreaterThan(0);
  });
});
