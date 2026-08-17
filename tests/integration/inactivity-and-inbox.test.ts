/**
 * Three things that were written and never ran.
 *
 * **The inbox.** For a fighter it raised two items, and one of them required
 * `readyOnDay === day` — an exact match against a clock that moves in fourteen-day steps, and in
 * twelve-week jumps whenever the player trains. `scanForInbox` is called **once**, at the end of
 * an advance, so an exact-day condition essentially never held. The other item needed an
 * unexpired agreement to exist. A fighter's inbox was therefore empty almost always, which is why
 * it reads as broken.
 *
 * **Free agency.** Losing your contract is the most consequential thing that can happen to a
 * fighter without them pressing a button, and nothing reported it. A player training through the
 * end of their deal found out by noticing their own hub had changed.
 *
 * **Ring rust.** `Condition.ringRust` was in the fighter model from the first commit, documented
 * as "sharpness from recent competition; decays during long layoffs", and no code anywhere wrote
 * it or read it. Time out of the cage cost nothing, which is why free agency never felt like a
 * threat — it was not one.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  daysSinceLastBout,
  describeRust,
  FULLY_RUSTED_DAYS,
  overallRating,
  rustFor,
  rustedAttributes,
  rustLabel,
  SHARP_DAYS,
  type Fighter,
} from '@mmasim/engine';
import { inboxCount, readInbox, scanForInbox } from '../../packages/app/src/game/inbox';

describe('ring rust', () => {
  it('costs nothing at an ordinary schedule', () => {
    // Two or three fights a year is normal and must be free, or every fighter in the game is
    // permanently penalised for existing.
    expect(rustFor(0)).toBe(0);
    expect(rustFor(120)).toBe(0);
    expect(rustFor(SHARP_DAYS)).toBe(0);
  });

  it('builds through the second year out, which is where careers actually go', () => {
    expect(rustFor(SHARP_DAYS + 1)).toBeGreaterThan(0);
    expect(rustFor(400)).toBeGreaterThan(rustFor(300));
    expect(rustFor(FULLY_RUSTED_DAYS)).toBe(1);
  });

  it('stops getting worse once somebody is as rusty as it is possible to be', () => {
    expect(rustFor(FULLY_RUSTED_DAYS * 3)).toBe(1);
  });

  it('takes timing, not ability', () => {
    /*
     * The distinction the whole model rests on. A fighter back after two years hits exactly as
     * hard — they are simply late, and being late is what gets you knocked out.
     */
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const base = (db.fighters.findAll() as Fighter[])[0]!.attributes;
    const rusty = rustedAttributes(base, 1);

    expect(rusty.power, 'rust took power').toBe(base.power);
    expect(rusty.strength, 'rust took strength').toBe(base.strength);
    expect(rusty.submissions, 'rust took craft').toBe(base.submissions);

    expect(rusty.speed).toBeLessThan(base.speed);
    expect(rusty.strikingDefence).toBeLessThan(base.strikingDefence);
    expect(rusty.scrambling).toBeLessThan(base.scrambling);
  });

  it('hurts enough to matter and not so much that a comeback is impossible', () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const base = (db.fighters.findAll() as Fighter[])[0]!.attributes;
    const drop = overallRating(base) - overallRating(rustedAttributes(base, 1));

    // A couple of rating points is noise; twenty makes a returning champion unwatchable.
    expect(drop).toBeGreaterThan(1.5);
    expect(drop).toBeLessThan(12);
  });

  it('counts from the most recent bout rather than the last one in the array', () => {
    // Records are not guaranteed sorted, and reading the tail would silently give the wrong
    // answer for anybody whose history was rebuilt or edited.
    expect(daysSinceLastBout([{ day: 100 }, { day: 400 }, { day: 250 }], 500)).toBe(100);
    expect(daysSinceLastBout([], 500)).toBeUndefined();
  });

  it('describes every band it can produce', () => {
    for (const rust of [0, 0.1, 0.4, 0.7, 1]) {
      expect(describeRust(rust).length).toBeGreaterThan(20);
      expect(rustLabel(rust).length).toBeGreaterThan(3);
    }
  });
});

describe('the inbox actually reaches a fighter', () => {
  const careerSave = () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const me = (db.fighters.findAll() as Fighter[]).find((f) => f.promotionId)!;
    db.world.upsert({
      ...(db.world.findById('world') as object),
      id: 'world',
      playerRole: 'fighter',
      playerFighterId: me.id as string,
    } as never);
    return { db, me };
  };

  it('tells a fighter with no contract that they are a free agent', () => {
    /*
     * The reported gap. The player was put into free agency while training and heard nothing
     * about it — and the old scan could not have told them, because its only contract item
     * required an agreement to exist.
     */
    const { db, me } = careerSave();
    db.fighters.upsert({ ...me, promotionId: undefined, agreementId: undefined } as never);

    scanForInbox(db, 2200);

    const items = readInbox(db);
    const freeAgent = items.find((i) => i.title.toLowerCase().includes('promotion'));
    expect(freeAgent, `raised: ${items.map((i) => i.title).join(' | ')}`).toBeDefined();
    // A decision, so it blocks: being a free agent and not knowing means sitting idle.
    expect(freeAgent!.priority).toBe('decision');
  });

  it('does not raise the same thing twice in a month of scanning', () => {
    // The scan runs on every advance, and an inbox that repeats itself is one nobody reads.
    const { db, me } = careerSave();
    db.fighters.upsert({ ...me, promotionId: undefined, agreementId: undefined } as never);

    scanForInbox(db, 2200);
    const first = inboxCount(db).unread;
    scanForInbox(db, 2201);
    scanForInbox(db, 2202);

    expect(inboxCount(db).unread).toBe(first);
  });

  it('clears a suspension however long the advance that passed it was', () => {
    /*
     * The exact-match bug, stated directly. `readyOnDay === day` was tested against a clock that
     * moves fourteen days at a time and jumps twelve weeks when the player trains, so this item
     * was unreachable in practice.
     */
    const { db, me } = careerSave();
    db.fighters.upsert({ ...me, readyOnDay: 2200 } as never);

    // The scan lands nowhere near the day the suspension ended, which is the normal case.
    scanForInbox(db, 2290);

    expect(readInbox(db).some((i) => i.title.includes('cleared'))).toBe(true);
  });

  it('raises the clearance exactly once even across repeated scans', () => {
    const { db, me } = careerSave();
    db.fighters.upsert({ ...me, readyOnDay: 2200 } as never);

    scanForInbox(db, 2290);
    scanForInbox(db, 2400);
    scanForInbox(db, 2600);

    expect(readInbox(db).filter((i) => i.title.includes('cleared')).length).toBe(1);
  });

  it('warns before the deal lapses rather than only after', () => {
    const { db, me } = careerSave();
    const agreement = {
      id: 'agr_test',
      fighterId: me.id,
      promotionId: me.promotionId,
      showPurse: 10,
      winBonus: 10,
      signingBonus: 0,
      revenuePoints: 0,
      fightsOwed: 4,
      fightsRemaining: 1,
      signedDay: 1900,
      expiresDay: 2240,
      tolledDays: 0,
      championshipExtension: 'none',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
      activityGuarantee: 3,
    };
    db.agreements.upsert(agreement as never);
    db.fighters.upsert({ ...me, agreementId: agreement.id } as never);

    scanForInbox(db, 2200);

    const warning = readInbox(db).find((i) => i.title.toLowerCase().includes('nearly up'));
    expect(warning).toBeDefined();
    expect(warning!.body).toMatch(/free agent/i);
  });
});
