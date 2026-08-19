/**
 * One slot, agreed once.
 *
 * Card position decides three things — the purse multiplier, the running order, and how many
 * rounds are fought — and each of them used to work it out separately. `bookFight` gave every
 * non-title bout three rounds, settlement re-derived the slot from star power that had moved
 * during the camp, and `buildCard` re-derived it a third time and gave whatever topped the
 * night five rounds.
 *
 * So the world's own fighters headlined five-round cards, and the player never did: they were
 * paid a main event's purse, listed on the card as a five-rounder, and handed to the simulator
 * with `rounds: 3`. The bug was invisible until the pre-fight card printed the card's number
 * next to a fight that was about to run three rounds (docs/28).
 */

import { describe, expect, it } from 'vitest';
import { createMemoryAdapter, createNewGame, setWorld } from '@mmasim/data';
import { type Fighter } from '@mmasim/engine';
import { bookFight, isBoutOff, runBookedFight } from '../../packages/app/src/game/career';
import { nightFor, playerCardPosition } from '../../packages/app/src/game/night';

/** A world with the player installed in it, ready to be booked. */
function career(seed: string) {
  const db = createNewGame({ adapter: createMemoryAdapter(), seed });
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.retiredDay === undefined && f.promotionId,
  );
  // The biggest name available, so this exercises the main-event branch rather than a prelim.
  const me = [...roster].sort((a, b) => b.starPower - a.starPower)[0]!;
  const opponent = [...roster]
    .filter((f) => f.id !== me.id && f.divisionId === me.divisionId)
    .sort((a, b) => b.starPower - a.starPower)[0] as Fighter;
  setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });
  return { db, me, opponent };
}

describe('the card position a fight is booked at', () => {
  it('gives a main event five rounds, which the player could never get', () => {
    const { db, me, opponent } = career('rounds-main-event');
    const booking = bookFight(db, me, opponent);

    // These two are the sport's biggest names, so this is a main event or the test is not
    // testing what it says it is.
    expect(booking.bout.position).toBe('mainEvent');
    expect(booking.bout.rounds).toBe(5);
  });

  it('gives a main event a ten-week camp, not a normal one', () => {
    /*
     * Keyed on the slot rather than on the belt. While a title fight was the only five-round
     * bout a player could take, `isTitleFight ? 10 : 8` was the same rule; the moment main
     * events became five rounds for the player too, it left the longest fight in the sport
     * being prepared for in an ordinary camp.
     */
    const { db, me, opponent } = career('camp-main-event');
    const booking = bookFight(db, me, opponent);

    expect(booking.bout.position).toBe('mainEvent');
    expect(Math.round((booking.bout.day - booking.campStartDay) / 7)).toBe(10);
  });

  it('is agreed at booking rather than derived again later', () => {
    const { db, me, opponent } = career('position-agreed');
    const booking = bookFight(db, me, opponent);
    expect(booking.bout.position).toBe(playerCardPosition(me, opponent, false));
  });

  it('leaves the card and the fight saying the same number of rounds', () => {
    const { db, me, opponent } = career('rounds-agree');
    const booking = bookFight(db, me, opponent);
    const scheduled = booking.bout.rounds;

    const outcome = runBookedFight(db, booking);
    expect(isBoutOff(outcome)).toBe(false);
    if (isBoutOff(outcome)) return;

    const night = nightFor(db, booking.bout.id);
    const mine = night?.bouts.find((b) => b.boutId === booking.bout.id);
    expect(mine).toBeDefined();

    // The card used to apply its own rounds policy over the top of a fight that had already
    // happened, and print a number the fight never used.
    expect(mine!.rounds).toBe(scheduled);

    // And the fight itself cannot have run past what was scheduled.
    expect(outcome.result.round).toBeLessThanOrEqual(scheduled);
    expect(outcome.result.roundStats?.length ?? 0).toBeLessThanOrEqual(scheduled);
  });

  it('still gives an ordinary bout three rounds', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'rounds-prelim' });
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.retiredDay === undefined && f.promotionId,
    );
    // Two of the smallest names in the sport: nobody is headlining this.
    const me = [...roster].sort((a, b) => a.starPower - b.starPower)[0]!;
    const opponent = [...roster]
      .filter((f) => f.id !== me.id && f.divisionId === me.divisionId)
      .sort((a, b) => a.starPower - b.starPower)[0] as Fighter;
    setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });

    const booking = bookFight(db, me, opponent);
    expect(booking.bout.position).not.toBe('mainEvent');
    expect(booking.bout.rounds).toBe(3);
    expect(Math.round((booking.bout.day - booking.campStartDay) / 7)).toBe(8);
  });

  it('makes a title fight five rounds however small the names on it', () => {
    const db = createNewGame({ adapter: createMemoryAdapter(), seed: 'rounds-title' });
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.retiredDay === undefined && f.promotionId,
    );
    const me = [...roster].sort((a, b) => a.starPower - b.starPower)[0]!;
    const opponent = [...roster]
      .filter((f) => f.id !== me.id && f.divisionId === me.divisionId)
      .sort((a, b) => a.starPower - b.starPower)[0] as Fighter;
    setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });

    const booking = bookFight(db, me, opponent, { isTitleFight: true });
    expect(booking.bout.rounds).toBe(5);
  });
});
