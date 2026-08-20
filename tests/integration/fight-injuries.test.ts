/**
 * Everybody gets hurt, and how you win decides how much.
 *
 * Three defects of the same family, all found by playing whole careers through the real game
 * rather than by reading the code:
 *
 * 1. `world.ts` never called `rollInjury` — not for camps, not for bouts. Eight hundred
 *    professional fighters went through entire careers of wars and knockouts and picked up
 *    nothing at all. The player and whoever they had just fought were the only people in the sport
 *    who could be injured.
 * 2. The camp inside `runBookedFight` — the one that runs before every fight the player takes, and
 *    therefore the majority of all the training they ever do — rolled no injury either. A player
 *    who never opened the training screen was immune to camp injury.
 * 3. `pullOutRisk` was called only from promoter mode, so in fighter mode every booked fight
 *    happened, always.
 *
 * The unit tier covers the arithmetic. This covers the wiring, which is where all three lived.
 */

import { describe, expect, it } from 'vitest';
import { createMemoryAdapter, createNewGame, getWorld, setWorld } from '@mmasim/data';
import { INJURY_META, INJURY_TYPES, canFightOn, weeksUntilFit, type Fighter } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';
import {
  bookFight,
  getOffers,
  isBoutOff,
  runBookedFight,
} from '../../packages/app/src/game/career';
import { FIGHT_THROUGH_WEEKS } from '../../packages/app/src/game/withdrawals';

/** A world with the player installed in it, on the bottom rung, ready to be booked. */
function career(seed: string) {
  const db = createNewGame({ adapter: createMemoryAdapter(), seed });
  const day = getWorld(db).day;
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.retiredDay === undefined && f.promotionId,
  );
  const me = roster.find((f) => day - f.birthDay < 28 * 365) ?? roster[0]!;
  const opponent = roster.find((f) => f.id !== me.id && f.divisionId === me.divisionId) as Fighter;
  setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });
  return { db, me, opponent };
}

const injuryCount = (roster: readonly Fighter[]) =>
  roster.reduce((n, f) => n + (f.injuries?.length ?? 0), 0);

describe('the world gets hurt too', () => {
  it('injures fighters the player has never met', () => {
    /*
     * The headline. `advanceWorld` runs the whole sport — cards, camps, ageing, retirement — and
     * across a year of it not one fighter could previously be injured, because the only two calls
     * to `rollInjury` in the codebase were both inside the player's own bout.
     */
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'world-hurt' });
    const before = injuryCount(db.fighters.findAll() as Fighter[]);
    expect(before, 'the seed already ships injured fighters, so this proves nothing').toBe(0);

    let day = getWorld(db).day;
    for (let step = 0; step < 26; step++) {
      advanceWorld(db, day, day + 14, {});
      day += 14;
      setWorld(db, { day });
    }

    const after = injuryCount(db.fighters.findAll() as Fighter[]);
    expect(after, 'a year of professional fighting hurt nobody').toBeGreaterThan(0);
  });

  it('does not accumulate chronic injuries nobody could ever have', () => {
    /*
     * The compounding, caught where it happens rather than in the arithmetic.
     *
     * `available` gated on `readyOnDay`, which is a *medical suspension* — a function of how the
     * last fight ended — and knows nothing about injuries. So the world matched fighters with torn
     * knees, they fought on them, and `settleFightInjuries` ran `aggravate`, which multiplies the
     * remaining layoff. Once per bout, with nothing stopping the next booking.
     *
     * Measured over eight years of generated pre-history before the gate existed: 76% of the
     * roster carrying something, the worst a knee **995 weeks** — nineteen years — from healed.
     * A world in that state is not a harsher world, it is a broken one: those fighters take
     * `injuredAttributes` into the cage and the ones the player is offered withdraw.
     *
     * The bound is stated against the model's own worst case rather than as a round number, so it
     * keeps meaning something if the injury table changes.
     */
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'world-chronic' });
    let day = getWorld(db).day;
    for (let step = 0; step < 78; step++) {
      advanceWorld(db, day, day + 14, {});
      day += 14;
      setWorld(db, { day });
    }

    const roster = db.fighters.findAll() as Fighter[];
    const worstNatural = Math.max(...INJURY_TYPES.map((t) => INJURY_META[t].weeks[1]));
    const spans = roster.flatMap((f) => f.injuries ?? []).map((i) => (i.healedDay - i.day) / 7);

    expect(spans.length, 'nobody was injured, so this proves nothing').toBeGreaterThan(10);
    expect(
      Math.max(...spans),
      `an injury ran to ${Math.max(...spans).toFixed(0)} weeks against a worst natural case of ${worstNatural}`,
    ).toBeLessThanOrEqual(worstNatural * 2);
  });

  it('leaves the roster mostly fit, rather than mostly on the shelf', () => {
    /*
     * The population consequence of the same gate, and the one a player actually meets.
     *
     * Stated as a share rather than per fighter because the per-fighter version is unmeasurable
     * after the fact: `aggravate` rewrites `healedDay` and leaves `day` alone, so a fighter who
     * walked in with six weeks left and walked out with twelve is indistinguishable from one who
     * should never have been booked. What is measurable is where the sport ends up.
     *
     * Measured on this scenario across the three fixes, which is worth recording because each one
     * is a different defect: **42%** shelved with none of them, 36% once the world stopped booking
     * fighters who would pull out, and **17%** once the ambient injury roll was charged against
     * elapsed time rather than once per call. The bound sits above the last of those with room for
     * seed variance, because it is a claim about the sport rather than a lock on the measurement.
     *
     * The pathology it replaces: eight years of generated pre-history left **76%** of the roster
     * carrying something and only 71 of 824 active fighters bookable at all.
     */
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'world-gate' });
    let day = getWorld(db).day;
    for (let step = 0; step < 52; step++) {
      advanceWorld(db, day, day + 14, {});
      day += 14;
      setWorld(db, { day });
    }

    const roster = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
    const shelved = roster.filter((f) => !canFightOn(f.injuries ?? [], day));

    expect(
      shelved.length / roster.length,
      `${shelved.length} of ${roster.length} are too hurt to be booked`,
    ).toBeLessThan(0.25);
  });

  it('gives them the kinds of injuries the fights produced', () => {
    // Not a uniform draw from the table: a roster that has been fighting should carry concussions
    // and cuts, which are the fight injuries, rather than only the camp ones.
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'world-kinds' });
    let day = getWorld(db).day;
    for (let step = 0; step < 52; step++) {
      advanceWorld(db, day, day + 14, {});
      day += 14;
      setWorld(db, { day });
    }
    const types = new Set(
      (db.fighters.findAll() as Fighter[]).flatMap((f) => (f.injuries ?? []).map((i) => i.type)),
    );
    expect(types.size, 'every injury in the world was the same thing').toBeGreaterThan(2);
  });
});

describe('a knockout leaves a record', () => {
  it('concusses the fighter who was knocked out, every time', () => {
    /*
     * `readinessDelay` has always floored a KO loss at 180 days, which is what commissions do. The
     * injury was a separate 12-18% roll that then picked a type by weight, so the overwhelming
     * majority of knockouts left nothing whatsoever on the medical record: the suspension happened
     * and the diagnosis did not.
     *
     * Run enough real fights to collect some knockouts, then check every one.
     */
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'ko-record' });
    let day = getWorld(db).day;
    for (let step = 0; step < 52; step++) {
      advanceWorld(db, day, day + 14, {});
      day += 14;
      setWorld(db, { day });
    }

    const roster = db.fighters.findAll() as Fighter[];
    const koLosers = roster.filter((f) => f.summary.koLosses > 0);
    expect(koLosers.length, 'no knockouts happened, so this proves nothing').toBeGreaterThan(3);

    const concussed = koLosers.filter((f) =>
      (f.injuries ?? []).some((i) => i.type === 'concussion'),
    );
    expect(
      concussed.length / koLosers.length,
      'fighters are being knocked out and walking away with a clean medical record',
    ).toBeGreaterThan(0.7);
  });
});

describe('a booked fight can fall apart', () => {
  it('does not offer the player somebody who is currently out', () => {
    /*
     * The moment the world could be injured, matchmaking started booking people in casts —
     * measured at 15 of 121 bouts collapsing because the opponent was already hurt on the day the
     * offer was made. That is not a withdrawal rate, it is a matchmaker who does not check.
     */
    const { db, me } = career('offers-fit');
    const hurt = (db.fighters.findAll() as Fighter[]).filter((f) => f.id !== me.id)[0]!;
    db.fighters.upsert({
      ...hurt,
      injuries: [
        {
          id: 'inj_test' as never,
          type: 'knee',
          day: getWorld(db).day,
          healedDay: getWorld(db).day + 200,
          severity: 0.8,
          source: 'camp',
        },
      ],
    } as Fighter & { id: string });

    const offered = getOffers(db, db.fighters.getById(me.id as string) as Fighter);
    expect(offered.some((o) => o.opponent.id === hurt.id)).toBe(false);
  });

  it('still offers somebody carrying a knock they would fight through', () => {
    // The other half. Fighting hurt is modelled properly and is the best thing in the health
    // system; a filter that excluded anyone with a scratch would delete it.
    const { db, me } = career('offers-carry');
    const day = getWorld(db).day;
    const pool = (db.fighters.findAll() as Fighter[]).filter(
      (f) =>
        f.id !== me.id &&
        f.divisionId === (db.fighters.getById(me.id as string) as Fighter).divisionId,
    );
    for (const f of pool) {
      db.fighters.upsert({
        ...f,
        injuries: [
          {
            id: `inj_${f.id}` as never,
            type: 'cut',
            day,
            healedDay: day + 10,
            severity: 0.2,
            source: 'fight',
          },
        ],
      } as Fighter & { id: string });
      expect(
        weeksUntilFit((db.fighters.getById(f.id as string) as Fighter).injuries ?? [], day),
      ).toBeLessThanOrEqual(FIGHT_THROUGH_WEEKS);
    }

    expect(getOffers(db, db.fighters.getById(me.id as string) as Fighter).length).toBeGreaterThan(
      0,
    );
  });

  it('reports the bout being off rather than simulating a fight nobody turned up to', () => {
    /*
     * The player keeps the camp and loses the payday, which is what a cancelled fight costs a real
     * fighter — and the outcome is a different *shape*, so no caller can accidentally read a
     * result that does not exist.
     */
    const { db, me, opponent } = career('pullout-shape');
    const day = getWorld(db).day;
    db.fighters.upsert({
      ...opponent,
      injuries: [
        {
          id: 'inj_out' as never,
          type: 'knee',
          day,
          healedDay: day + 300,
          severity: 0.9,
          source: 'camp',
        },
      ],
    } as Fighter & { id: string });

    const outcome = runBookedFight(
      db,
      bookFight(db, db.fighters.getById(me.id as string) as Fighter, opponent, { weeks: 8 }),
    );

    expect(isBoutOff(outcome)).toBe(true);
    if (!isBoutOff(outcome)) return;
    expect(outcome.pullOut.reason).toBe('injury');
    expect(outcome.notes.join(' ')).toMatch(/withdrawn|out with an injury/i);
  });

  it('tells the player, in the inbox, rather than silently unbooking them', () => {
    const { db, me, opponent } = career('pullout-inbox');
    const day = getWorld(db).day;
    db.fighters.upsert({
      ...opponent,
      injuries: [
        {
          id: 'inj_out2' as never,
          type: 'knee',
          day,
          healedDay: day + 300,
          severity: 0.9,
          source: 'camp',
        },
      ],
    } as Fighter & { id: string });

    runBookedFight(
      db,
      bookFight(db, db.fighters.getById(me.id as string) as Fighter, opponent, { weeks: 8 }),
    );

    const inbox = db.inbox.findAll() as readonly { title: string }[];
    expect(inbox.some((i) => /fight is off/i.test(i.title))).toBe(true);
  });

  it('still pays the camp forward, because the work happened', () => {
    // Checked through `trainingCarry` as well as the attributes, because a camp produces tenths
    // and banks the remainder — a test watching only integers would call a working camp broken.
    const { db, me, opponent } = career('pullout-camp');
    const day = getWorld(db).day;
    db.fighters.upsert({
      ...opponent,
      injuries: [
        {
          id: 'inj_out3' as never,
          type: 'knee',
          day,
          healedDay: day + 300,
          severity: 0.9,
          source: 'camp',
        },
      ],
    } as Fighter & { id: string });

    const developed = (f: Fighter) =>
      Object.values(f.attributes).reduce((a: number, b) => a + b, 0) +
      Object.values(f.trainingCarry ?? {}).reduce((a: number, b) => a + (b ?? 0), 0);

    const before = developed(db.fighters.getById(me.id as string) as Fighter);
    runBookedFight(
      db,
      bookFight(db, db.fighters.getById(me.id as string) as Fighter, opponent, { weeks: 8 }),
    );
    const after = developed(db.fighters.getById(me.id as string) as Fighter);

    expect(after, 'the camp ran and bought nothing').toBeGreaterThan(before);
  });
});

describe('how the fight went decides what it cost', () => {
  it('leaves the fighter who was stopped worse off than the one who finished them', () => {
    /*
     * The end-to-end statement of the exposure model. Run a year of a real world and compare the
     * people who have been knocked out with the people who have not: under the flat rate these two
     * populations were nearly indistinguishable, because a thirty-second finish and a two-round
     * beating differed by a factor of 1.9.
     */
    /*
     * **Three worlds rather than one, since doc 31 § 12 step 3.** A single year of a single world
     * compares two subpopulations of seventy-odd fighters each, and the gap between them is a
     * fraction of an injury — so which seed it is decides the result about as often as the exposure
     * model does. Measured over six seeds on an untouched checkout the property held on all six; a
     * generation change elsewhere then moved one of them to 4.53 against 4.79 while the other five
     * kept a clear gap, and a test that a body-model change can flip is not testing exposure.
     *
     * Same repair `promotion-costs.test.ts` made for the same reason. Each world is still a full
     * year, and the claim is now about the design rather than about the draw.
     */
    const mean = (xs: readonly Fighter[]) =>
      xs.reduce((a, f) => a + (f.injuries?.length ?? 0), 0) / Math.max(1, xs.length);

    const gaps = ['exposure-end', 'exposure-b', 'exposure-c'].map((seed) => {
      const db = createNewGame({ adapter: createMemoryAdapter(), seed });
      let day = getWorld(db).day;
      for (let step = 0; step < 52; step++) {
        advanceWorld(db, day, day + 14, {});
        day += 14;
        setWorld(db, { day });
      }

      const fought = (db.fighters.findAll() as Fighter[]).filter((f) => f.record.length > 0);
      const stopped = fought.filter((f) => f.summary.koLosses > 0);
      const never = fought.filter((f) => f.summary.koLosses === 0 && f.record.length > 1);
      expect(stopped.length, `${seed} produced almost nobody who was stopped`).toBeGreaterThan(2);
      expect(never.length, `${seed} produced almost nobody who was not`).toBeGreaterThan(2);
      return {
        seed,
        gap: mean(stopped) - mean(never),
        summary: `${seed}: stopped ${mean(stopped).toFixed(2)} vs never ${mean(never).toFixed(2)}`,
      };
    });

    const context = gaps.map((g) => g.summary).join(' | ');
    const average = gaps.reduce((a, g) => a + g.gap, 0) / gaps.length;
    expect(average, `being knocked out cost no more than not being. ${context}`).toBeGreaterThan(0);
  });
});

/** Kept honest: none of this may make the world non-deterministic. */
describe('still reproducible', () => {
  it('produces the same injured world from the same seed', () => {
    const run = () => {
      const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'determinism' });
      let day = getWorld(db).day;
      for (let step = 0; step < 20; step++) {
        advanceWorld(db, day, day + 14, {});
        day += 14;
        setWorld(db, { day });
      }
      return (db.fighters.findAll() as Fighter[])
        .map(
          (f) => `${f.id}:${(f.injuries ?? []).map((i) => `${i.type}@${i.healedDay}`).join(',')}`,
        )
        .sort()
        .join('|');
    };
    expect(run()).toBe(run());
  });
});
