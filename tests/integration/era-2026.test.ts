/**
 * The 2026 world, and the depth problem it exists to solve.
 *
 * The 2020 roster carried 139 hand-authored fighters across twelve divisions and five
 * promotions, which sounds like a lot and is not: it works out at two or three per division
 * per promotion, and `offerOpponents` needs two *available* fighters in the same division on
 * the same promotion. Measured, the world's cards averaged **1.8 to 3.1 bouts** against a
 * designed card size of nine.
 *
 * Everything downstream inherited it. Card position barely existed because there were only two
 * or three positions to fill; the prelim tier never happened; the depth term in `eventRevenue`
 * was permanently penalised; and doc 12's whole card structure was running on stubs. It was
 * not a tuning problem and could not be fixed by tuning — it needed people.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { DIVISIONS, type FightNight, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const world2026 = () => createNewGame({ adapter: undefined, era: '2026' });
const fighters = (db: ReturnType<typeof world2026>) => db.fighters.findAll() as Fighter[];
const promotions = (db: ReturnType<typeof world2026>) =>
  db.promotions.findAll() as unknown as Promotion[];

describe('the 2026 roster has enough people in it', () => {
  const db = world2026();
  const all = fighters(db);

  it('is a sport rather than a shortlist', () => {
    expect(all.length).toBeGreaterThan(600);
  });

  it('gives every promotion enough fighters in every division it runs to make a fight', () => {
    /*
     * The invariant the whole era exists for. A promotion that runs a division must be able to
     * pair people inside it — and with three bouts a year per fighter and medical suspensions,
     * roughly a third of a division is bookable on any given date, so six is the floor for
     * "can reliably make one fight here".
     */
    for (const promotion of promotions(db)) {
      for (const divisionId of promotion.divisions) {
        const depth = all.filter(
          (f) => f.promotionId === promotion.id && f.divisionId === divisionId,
        ).length;
        expect(
          depth,
          `${promotion.shortName} has ${depth} fighters at ${divisionId}`,
        ).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('keeps a real market of unattached fighters', () => {
    // Free agency is a near-monopsony, which only reads as one if there are people outside it.
    const free = all.filter((f) => f.promotionId === undefined);
    expect(free.length).toBeGreaterThan(40);
  });

  it('makes the sport a ladder rather than eight copies of itself', () => {
    /*
     * A regional promotion is not a small version of the leader, it is a different standard of
     * fighter — and that gap is what a fighter climbing the sport is actually climbing.
     */
    const averageTier = (p: Promotion) => {
      const roster = all.filter((f) => f.promotionId === p.id);
      const total = roster.reduce(
        (a, f) => a + Object.values(f.attributes).reduce((x, n) => x + n, 0) / 15,
        0,
      );
      return total / Math.max(1, roster.length);
    };

    const ranked = promotions(db).slice().sort((a, b) => b.prestige - a.prestige);
    const top = averageTier(ranked[0]!);
    const bottom = averageTier(ranked[ranked.length - 1]!);
    expect(
      top,
      `${ranked[0]!.shortName} averages ${top.toFixed(1)}, ${ranked[ranked.length - 1]!.shortName} averages ${bottom.toFixed(1)}`,
    ).toBeGreaterThan(bottom + 6);
  });

  it('carries the fighters a player would actually recognise', () => {
    // The named roster is the reason the era exists at all — generated depth around real
    // people, not a world of strangers.
    const named = all.filter((f) => (f.id as string).startsWith('f26_'));
    expect(named.length).toBeGreaterThan(60);
    // And they carry the authored `notes`, which is the roster's own quality bar.
    for (const fighter of named) {
      expect(fighter.notes, `${fighter.lastName} has no notes`).toBeTruthy();
    }
  });

  it('spreads the named fighters across every division rather than stacking one', () => {
    for (const division of DIVISIONS) {
      const named = all.filter(
        (f) => (f.id as string).startsWith('f26_') && f.divisionId === division.id,
      );
      expect(named.length, `${division.id} has ${named.length} named fighters`).toBeGreaterThan(0);
    }
  });
});

describe('the 2026 world runs a real schedule', () => {
  const db = world2026();
  const player = fighters(db)[0]!;
  for (let year = 0; year < 3; year++) {
    advanceWorld(db, year * 365, (year + 1) * 365, player.id);
  }
  const events = db.events.findAll() as FightNight[];

  it('runs full cards rather than stubs', () => {
    /*
     * The measured regression bound. This averaged 1.8–3.1 on the 2020 roster, which meant
     * every card in the game was really a mini-card and the whole events layer was untested in
     * the shape it was designed for.
     */
    const bouts = events.reduce((a, e) => a + e.bouts.length, 0);
    const average = bouts / Math.max(1, events.length);
    expect(average, `${events.length} cards averaging ${average.toFixed(1)} bouts`).toBeGreaterThan(
      7,
    );
  });

  it('gives the leader something like a real calendar', () => {
    // Doc 12 asks for roughly two cards a month at the top of the sport.
    const leader = promotions(db).slice().sort((a, b) => b.prestige - a.prestige)[0]!;
    const perYear = events.filter((e) => e.promotionId === leader.id).length / 3;
    expect(perYear, `${leader.shortName} ran ${perYear.toFixed(1)} cards a year`).toBeGreaterThan(
      12,
    );
  });

  it('keeps every promotion solvent', () => {
    /*
     * The 2020 world bankrupted its two smallest promotions inside eight years and then left
     * them running cards forever at a floored budget of zero. A world where the bottom of the
     * sport cannot survive is one where a player starting there has no game.
     */
    for (const promotion of promotions(db)) {
      expect(promotion.budget, `${promotion.shortName} went broke`).toBeGreaterThan(0);
    }
  });

  it('fills every card position, including the prelims', () => {
    // Card position is the second axis of a career, and it did not exist when a card was three
    // bouts long — there was no prelim tier to get off.
    const positions = new Set(events.flatMap((e) => e.bouts.map((b) => b.position)));
    expect([...positions].sort()).toEqual(['coMain', 'mainCard', 'mainEvent', 'prelim']);
  });
});
