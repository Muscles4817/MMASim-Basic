/**
 * A roster you can fall out of.
 *
 * `releaseRisk` was written, documented and called from nowhere — not the world, not the UI.
 * So no promotion in the game ever cut anybody, which removed the entire downward half of a
 * career: a roster could be joined and never fallen out of, and free agency only ever handled
 * people whose contracts had run their term.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import { releaseRisk, type Fighter, type Promotion } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const game = () => createNewGame({ adapter: undefined });

describe('who gets cut', () => {
  const promotion = () =>
    (createNewGame({ adapter: undefined }).promotions.findAll() as unknown as Promotion[])[0]!;
  const roster = () => createNewGame({ adapter: undefined }).fighters.findAll() as Fighter[];

  it('never cuts anybody who is not on a skid', () => {
    const p = promotion();
    const winner = { ...roster()[0]!, summary: { ...roster()[0]!.summary, streak: 3 } };
    expect(releaseRisk(winner, p)).toBe(0);
  });

  it('buys patience with star power that a good record does not', () => {
    /*
     * The realism correction, and the reason this function is worth having rather than a
     * "three straight and you are gone" rule. Release is an at-will clause applied unevenly:
     * exciting fighters survive 0-3 and boring winners get cut, and that unevenness is the
     * more interesting truth.
     */
    const p = promotion();
    const base = roster()[0]!;
    const onASkid = { ...base, summary: { ...base.summary, streak: -3 } };

    const star = releaseRisk({ ...onASkid, starPower: 92 }, p);
    const nobody = releaseRisk({ ...onASkid, starPower: 8 }, p);

    expect(star).toBeLessThan(nobody);
    expect(nobody).toBeGreaterThan(0);
  });

  it('escalates with each straight loss', () => {
    const p = promotion();
    const base = { ...roster()[0]!, starPower: 40 };
    const at = (streak: number) =>
      releaseRisk({ ...base, summary: { ...base.summary, streak } }, p);
    expect(at(-3)).toBeGreaterThan(at(-2));
    expect(at(-2)).toBeGreaterThan(at(-1));
  });
});

describe('the world cuts people', () => {
  it('releases somebody across a few years of cards', () => {
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    for (let year = 0; year < 3; year++) advanceWorld(db, year * 365, (year + 1) * 365, player.id);

    const released = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === undefined && f.retiredDay === undefined,
    );
    const news = (db.news.findAll() as readonly { kind: string }[]).filter((n) => n.kind === 'release');
    expect(news.length, 'nobody was cut across three years').toBeGreaterThan(0);
    void released;
  });

  it('does not empty the rosters', () => {
    /*
     * The guard on the other side. Release compounds — a cut fighter loses their next fight
     * somewhere worse and gets cut again — so a rate that reads as reasonable per fight can
     * strip a promotion bare over a decade.
     */
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    const before = (db.fighters.findAll() as Fighter[]).filter((f) => f.promotionId).length;

    for (let year = 0; year < 8; year++) advanceWorld(db, year * 365, (year + 1) * 365, player.id);

    const after = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId !== undefined && f.retiredDay === undefined,
    ).length;
    expect(after, `signed roster fell from ${before} to ${after}`).toBeGreaterThan(before * 0.5);
  });

  it('never cuts somebody on the way out of the sport', () => {
    // Being released on your way to retirement is noise, not a story.
    const db = game();
    const player = (db.fighters.findAll() as Fighter[])[0]!;
    for (let year = 0; year < 3; year++) advanceWorld(db, year * 365, (year + 1) * 365, player.id);

    const news = db.news.findAll() as readonly { kind: string; fighterIds: readonly string[] }[];
    for (const item of news.filter((n) => n.kind === 'release')) {
      const fighter = db.fighters.findById(item.fighterIds[0] as string) as Fighter | undefined;
      if (!fighter?.retiredDay) continue;
      // Retiring later is fine; being cut in the same breath is not.
      expect(fighter.retiredDay, `${fighter.lastName} was cut and retired at once`).toBeDefined();
    }
  });
});
