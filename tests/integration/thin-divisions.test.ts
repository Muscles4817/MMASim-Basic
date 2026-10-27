/**
 * A weight class a promotion runs but can no longer make a fight in.
 *
 * The quarterly intake is sized to the sport's headcount at each weight, so a division that was
 * full across the sport sent nobody to the one promotion where it had emptied, and that promotion
 * ran a weight class with one fighter in it for good. The world now refills it with local
 * debutants. Never the player's, though: who a promoter signs is theirs to decide, so their empty
 * weight class becomes a suggestion in the inbox.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld, type Entity } from '@mmasim/data';
import { createRng, type Fighter, type Promotion } from '@mmasim/engine';
import { fillHoles } from '../../packages/app/src/game/world';
import { readInbox } from '../../packages/app/src/game/inbox';

describe('a promotion whose weight class has emptied', () => {
  const db = createNewGame({ adapter: undefined, era: '2026', seed: 'thin' });
  const regionals = (db.promotions.findAll() as unknown as Promotion[])
    .filter((p) => p.tier === 'regional')
    .sort((a, b) => b.prestige - a.prestige);
  const player = regionals[0]!;
  const rival = regionals[1]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: player.id as string });

  /** Leave one fighter at a weight both promotions run; everybody else there retires. */
  const empty = (promotion: Promotion, division: string) => {
    const there = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id && f.divisionId === division && !f.retiredDay,
    );
    for (const f of there.slice(1)) {
      db.fighters.upsert({ ...f, retiredDay: getWorld(db).day } as Fighter & Entity);
    }
  };
  const division = player.divisions.find((d) => rival.divisions.includes(d))! as string;
  empty(player, division);
  empty(rival, division);

  const day = getWorld(db).day;
  fillHoles(db, day, createRng('thin'), db.promotions.findAll() as unknown as Promotion[]);

  const holeFilled = (promotion: Promotion) =>
    (db.fighters.findAll() as Fighter[]).filter(
      (f) =>
        f.promotionId === promotion.id &&
        f.divisionId === division &&
        (f.id as string).includes(`hole:${promotion.id as string}`),
    );

  it('signs local debutants for the world’s promotions until it can make a fight', () => {
    expect(holeFilled(rival).length).toBeGreaterThan(0);
  });

  it('signs nobody onto the player’s roster, and tells them instead', () => {
    expect(holeFilled(player)).toEqual([]);
    const told = readInbox(db).filter(
      (i) => i.promotionId === player.id && i.divisionId === division && i.kind === 'roster',
    );
    expect(told.length).toBeGreaterThan(0);
  });
});
