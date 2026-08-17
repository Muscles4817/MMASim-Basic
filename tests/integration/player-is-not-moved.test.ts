/**
 * The world does not decide who the player fights for.
 *
 * Reported from play, and it reads as absurdly as it is: signed with one promotion while owing
 * another three fights, took a fight, trained for thirty-six weeks, and came out of camp **ranked
 * fourth in the UFC with a title shot** — a promotion they had never signed with, never spoken to,
 * and never appeared on a card for.
 *
 * `advanceWorld` takes an exclusion whose whole purpose is "this fighter is the player's, leave
 * them alone". Matchmaking took it. Ageing took it. `resolveFreeAgency` — the loop that picks a
 * promotion for every out-of-contract fighter in the game and signs them to it — **did not**, so
 * any advance long enough to reach a quarterly tick would relocate the player at random. Who you
 * fight for is the single decision career mode is about, and the simulation was making it every
 * three months.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { advanceWorld } from '../../packages/app/src/game/world';
import type { Fighter } from '@mmasim/engine';

const YEAR = 365;

describe('advancing the world around the player', () => {
  const subject = (era: '2020' | '2026') => {
    const db = createNewGame({ adapter: undefined, era });
    const fighters = db.fighters.findAll() as Fighter[];
    // Somebody genuinely at risk: signed, but with no agreement, which is the state every seeded
    // fighter is in and the one free agency acts on.
    const me = fighters.find((f) => f.promotionId && !f.agreementId)!;
    return { db, me };
  };

  for (const era of ['2020', '2026'] as const) {
    it(`never moves the excluded fighter between promotions in ${era}`, () => {
      const { db, me } = subject(era);
      const startedAt = me.promotionId;

      // Three years, which is far more than the thirty-six weeks that produced the report and
      // crosses many quarterly free-agency ticks.
      advanceWorld(db, 0, YEAR * 3, me.id);

      const after = db.fighters.findById(me.id as string) as Fighter;
      expect(after.promotionId, 'the world moved the player').toBe(startedAt);
    });

    it(`never signs the excluded fighter to a contract they did not agree to in ${era}`, () => {
      const { db, me } = subject(era);
      expect(me.agreementId).toBeUndefined();

      advanceWorld(db, 0, YEAR * 3, me.id);

      const after = db.fighters.findById(me.id as string) as Fighter;
      expect(after.agreementId, 'the world signed a contract for the player').toBeUndefined();
    });

    it(`still moves everybody else, so the exclusion is not just switching free agency off in ${era}`, () => {
      /*
       * The half that makes the test mean something. A fix that stopped free agency running at
       * all would pass the two above and quietly freeze the transfer market for the whole sport.
       */
      const { db, me } = subject(era);
      const before = new Map(
        (db.fighters.findAll() as Fighter[]).map((f) => [f.id as string, f.promotionId]),
      );

      advanceWorld(db, 0, YEAR * 3, me.id);

      const moved = (db.fighters.findAll() as Fighter[]).filter(
        (f) => f.id !== me.id && f.promotionId !== before.get(f.id as string),
      );
      expect(moved.length, 'nobody in the world changed promotion in three years').toBeGreaterThan(
        0,
      );
    });
  }

  it('leaves the player where they are even across a long advance with no contract at all', () => {
    // The worst case for the old code: a genuine free agent is exactly who `resolveFreeAgency`
    // exists to place, so the player being one made them the most likely person to be moved.
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const fighters = db.fighters.findAll() as Fighter[];
    const me = { ...fighters[0]!, promotionId: undefined, agreementId: undefined };
    db.fighters.upsert(me as Fighter & { id: string });

    advanceWorld(db, 0, YEAR * 5, me.id);

    const after = db.fighters.findById(me.id as string) as Fighter;
    expect(after.promotionId, 'the world found the player a promotion').toBeUndefined();
  });
});

describe('a fighter is only ever at the promotion they are signed to', () => {
  it('keeps promotionId and the agreement in agreement across a long sim', () => {
    /*
     * The invariant behind the whole report. `promotionId` drives matchmaking and rankings;
     * `agreementId` points at the signed deal. When they disagree you get precisely what was
     * reported — ranked and matched by one promotion while owing fights to another.
     */
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const me = (db.fighters.findAll() as Fighter[])[0]!;

    advanceWorld(db, 0, YEAR * 4, me.id);

    const mismatched = (db.fighters.findAll() as Fighter[]).filter((f) => {
      if (!f.agreementId) return false;
      const agreement = db.agreements.findById(f.agreementId as string) as
        | { promotionId?: string }
        | undefined;
      return agreement?.promotionId !== undefined && agreement.promotionId !== f.promotionId;
    });

    expect(mismatched.map((f) => `${f.firstName} ${f.lastName}`)).toEqual([]);
  });
});
