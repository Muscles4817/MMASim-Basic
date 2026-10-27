/**
 * Memory, wants and voice, wired into the world. Doc 34 C3.
 *
 * The engine tests pin each read; these pin that the reads reach the places that use them: a
 * bout on the player's card leaves the people on it remembering, a remembered slight makes the next
 * offer harder, a refusal arrives in the fighter's own words, and the news says whose rankings an
 * upset moved.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  acceptanceOf,
  fightNews,
  rankDivision,
  relationshipWith,
  withLedgerEntry,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { afterTheBout } from '../../packages/app/src/game/memory';

function world() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: promotion.id });
  const day = getWorld(db).day;
  const divisionId = Object.keys(promotion.champions)[0]!;
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id && f.divisionId === divisionId,
  );
  const ranked = rankDivision(
    roster,
    divisionId as never,
    promotion.id,
    day,
    promotion.champions[divisionId as never],
    [promotion],
  );
  return { db, promotion, day, ranked };
}

describe('a title fight on the player’s card', () => {
  it('leaves the challenger grateful and the passed-over contender bitter, and says so', () => {
    const { db, promotion, day, ranked } = world();
    const champion = ranked.find((r) => r.position === 0)!.fighter;
    const contender = ranked.find((r) => r.position === 1)!.fighter;
    const challenger = ranked.find((r) => r.position === 3)!.fighter;

    const out = afterTheBout({
      db,
      day,
      promotion,
      red: champion,
      blue: challenger,
      boutId: 'title_1',
      winnerId: champion.id,
      method: 'ko',
      isTitleFight: true,
      championId: champion.id,
      ranked,
      quiet: false,
    });

    expect(out.blue.ledger?.map((e) => e.kind)).toContain('titleShotGiven');
    const skipped = db.fighters.findById(contender.id as string) as Fighter;
    expect(skipped.ledger?.map((e) => e.kind)).toContain('titleShotSkipped');
    expect(relationshipWith(skipped, promotion.id, day).score).toBeLessThan(0);

    const voices = out.news.filter((n) => n.kind === 'voice');
    expect(voices.some((n) => n.fighterIds.includes(contender.id))).toBe(true);
    expect(voices.some((n) => n.fighterIds[0] === champion.id)).toBe(true);
    // Two quotes from one night are never the same sentence.
    expect(new Set(voices.map((n) => n.detail)).size).toBe(voices.length);
  });

  it('keeps no ledger for promotions the player does not run', () => {
    const { db, promotion, day, ranked } = world();
    setWorld(db, { ...getWorld(db), playerPromotionId: 'p_somebody_else' as never });
    const [a, b] = [ranked[1]!.fighter, ranked[2]!.fighter];
    const out = afterTheBout({
      db,
      day,
      promotion,
      red: a,
      blue: b,
      boutId: 'x',
      winnerId: a.id,
      method: 'ko',
      isTitleFight: false,
      ranked,
      quiet: true,
    });
    expect(out.red.ledger).toBeUndefined();
    expect(out.news).toEqual([]);
  });
});

describe('the next offer', () => {
  it('is harder to make to somebody who remembers being wronged, and they say why', () => {
    const { promotion, day, ranked } = world();
    const [fighter, opponent] = [ranked[2]!.fighter, ranked[4]!.fighter];
    const clean = acceptanceOf({ fighter, opponent, promotion, day });
    const wronged = {
      ...fighter,
      ledger: withLedgerEntry(
        withLedgerEntry(undefined, { day, promotionId: promotion.id, kind: 'cardCancelled' }),
        { day, promotionId: promotion.id, kind: 'titleShotSkipped' },
      ),
    };
    const read = acceptanceOf({ fighter: wronged, opponent, promotion, day, notice: 'short' });
    expect(read.chance).toBeLessThan(clean.chance);
    expect(read.concern).toBeTruthy();
    expect(read.quote).toMatch(new RegExp(`^${fighter.lastName}: “`));
  });
});

describe('upset news', () => {
  it('names whose rankings moved', () => {
    const item = fightNews({
      day: 1,
      boutId: 'u',
      winnerName: 'A',
      loserName: 'B',
      method: 'ko',
      round: 1,
      divisionId: 'mens-lightweight' as never,
      promotionName: 'NAT7',
      winnerRank: 6,
      loserRank: 2,
    })!;
    expect(item.kind).toBe('upset');
    expect(item.detail).toMatch(/in the NAT7 men's lightweight rankings/);
  });
});
