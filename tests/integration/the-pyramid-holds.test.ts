/**
 * Does the sport keep its shape?
 *
 * It did not, and nothing asked. The 2026 world seeds a pyramid — 204 fighters on the leader, 124
 * at each major, 64 to 72 on each regional show — and **one simulated year turned it upside down**:
 *
 *   UFC   204 -> 56      RIZIN  72 -> 121
 *   PFL   124 -> 63      KSW    72 ->  93
 *   ONE   124 -> 128     LFA    64 -> 126
 *
 * Three separate causes, each of which had been correct in isolation:
 *
 *  - **No seeded fighter had a contract**, and free agency reads the contract to decide who is
 *    free — so on the first quarterly tick, every fighter in the sport who was not holding a belt
 *    was a free agent at once, and the whole roster was redistributed in one pass.
 *  - **The reputation gate excluded the top promotions' own rosters.** A fighter reached a
 *    promotion of prestige `42 + reputation × 0.9`, and reputation does not discriminate between
 *    the tiers of this sport at all — the median is 25 to 27 everywhere except the leader's 40. So
 *    only 50 of the leader's 204 could have re-signed with their own promotion, and every expiring
 *    contract at the top was a one-way ticket down.
 *  - **The intake only ever fed the bottom.** `replenish` holds the sport's headcount and puts
 *    every debutant on the regional circuit, which is right, and nothing pulled anybody back up.
 *
 * None of it was visible, because nothing downstream read roster size: cards came from a global
 * prestige-weighted lottery, so the leader kept running the most shows in the sport off a roster a
 * third the size of a regional's. Giving promotions schedules they have to fill is what surfaced
 * it, and this file is what stops it coming back.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { cardsPerYear, overallRating, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const YEARS = 10;

const db = createNewGame({ adapter: undefined, seed: 'pyramid', era: '2026' });
const player = (db.fighters.findAll() as Fighter[])[0]!;
const promotions = () => db.promotions.findAll() as unknown as Promotion[];
const rosterOf = (promotion: Promotion) =>
  (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
  );

const start = new Map(promotions().map((p) => [p.id as string, rosterOf(p).length]));
const startDay = 2192;
for (let year = 0; year < YEARS; year++) {
  advanceWorld(db, startDay + year * 365, startDay + (year + 1) * 365, player.id);
}

const byPrestige = promotions()
  .slice()
  .sort((a, b) => b.prestige - a.prestige);
const summary = byPrestige
  .map((p) => `${p.shortName} ${start.get(p.id as string)}→${rosterOf(p).length}`)
  .join(' | ');

describe('the sport keeps its shape', () => {
  it('leaves the leader with the biggest roster in the world', () => {
    const leader = byPrestige[0]!;
    for (const other of byPrestige.slice(1)) {
      expect(rosterOf(leader).length, `${summary}`).toBeGreaterThan(rosterOf(other).length);
    }
  });

  it('does not let any promotion drift far from the size it was designed at', () => {
    for (const p of byPrestige) {
      const target = start.get(p.id as string)!;
      const now = rosterOf(p).length;
      expect(now, `${p.shortName}: ${summary}`).toBeGreaterThan(target * 0.6);
      expect(now, `${p.shortName}: ${summary}`).toBeLessThan(target * 1.9);
    }
  });

  it('keeps the standard of the sport laddered, so climbing means something', () => {
    // The mean overall rating of each roster, which is the level free agency signs against.
    const standard = (p: Promotion) => {
      const roster = rosterOf(p);
      return roster.reduce((total, f) => total + overallRating(f.attributes), 0) / roster.length;
    };
    const leader = standard(byPrestige[0]!);

    /*
     * Against the regional *tier*, not against whichever single promotion happens to have the
     * lowest prestige. A regional roster is sixty-odd fighters and its mean swings two or three
     * points between runs on nothing at all — measured across two builds that left the leader at
     * 51.9 and 51.8, the bottom promotion read 42.1 and 45.8. Comparing one noisy sample against a
     * stable one is a coin flip dressed up as an assertion.
     *
     * Two claims, and together they say what "laddered" means: nobody out-rates the leader, and
     * the bottom tier is a clear step below it.
     */
    const regionals = byPrestige.filter((p) => p.tier === 'regional' || p.tier === 'developmental');
    const tierMean =
      regionals.reduce((total, p) => total + standard(p), 0) / Math.max(1, regionals.length);

    for (const other of byPrestige.slice(1)) {
      expect(leader, `${other.shortName} out-rates the leader: ${summary}`).toBeGreaterThan(
        standard(other),
      );
    }
    expect(leader, summary).toBeGreaterThan(tierMean + 5);
  });
});

describe('the schedule follows the roster', () => {
  it('runs the leader most often and a regional show least', () => {
    const cards = byPrestige.map((p) => cardsPerYear(p, rosterOf(p).length));
    expect(cards[0], summary).toBeGreaterThan(cards[cards.length - 1]!);
  });

  it('gives every promotion a calendar it can actually fill', () => {
    // Two fighters per bout, nine bouts a card, and nobody fights more than three times a year.
    for (const p of byPrestige) {
      const roster = rosterOf(p).length;
      const boutsNeeded = cardsPerYear(p, roster) * 9 * 2;
      expect(boutsNeeded / roster, `${p.shortName}: ${summary}`).toBeLessThan(3);
    }
  });
});
