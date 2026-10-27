/**
 * Career events in the world and on the player's side of it. Doc 34 C6.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import { createRng, type Fighter, type Promotion } from '@mmasim/engine';
import { comebacks, moveDivisions } from '../../packages/app/src/game/world';
import { scanCareerEvents, takeTimeOff } from '../../packages/app/src/game/careerEvents';
import { blockerFor, createPlan, promoterContext } from '../../packages/app/src/game/plans';
import { heatBetween, stokeBetween } from '../../packages/app/src/game/rivalries';

function world() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: promotion.id });
  const active = (db.fighters.findAll() as Fighter[]).filter((f) => f.retiredDay === undefined);
  return { db, promotion, active, day: getWorld(db).day };
}

describe('division moves in the world', () => {
  it('moves the overweight up, and leaves a nickname already taken there behind', () => {
    const { db, active, day } = world();
    const welter = active.find((f) => f.divisionId === 'mens-welterweight' && f.nickname)!;
    // A middleweight's body at lightweight, wearing a nickname a welterweight already has.
    // A free agent and no champion, so nothing but the cut decides it.
    const champions = new Set(
      (db.promotions.findAll() as unknown as Promotion[]).flatMap((p) =>
        Object.values(p.champions).map(String),
      ),
    );
    const heavy = active.find(
      (f) => f.divisionId === 'mens-middleweight' && !champions.has(f.id as string),
    )!;
    db.fighters.upsert({
      ...heavy,
      promotionId: undefined,
      agreementId: undefined,
      divisionId: 'mens-lightweight',
      nickname: welter.nickname,
      lastDivisionChangeDay: undefined,
    } as never);
    let moved: Fighter | undefined;
    for (let year = 1; year <= 8 && !moved; year++) {
      moveDivisions(db, day + year * 365, createRng(`moves:${year}`), undefined);
      const now = db.fighters.findById(heavy.id as string) as Fighter;
      if (now.divisionId !== 'mens-lightweight') moved = now;
    }
    expect(moved?.divisionId).toBe('mens-welterweight');
    expect(moved?.nickname).toBeUndefined();
    expect(moved?.divisionHistory).toContain('mens-welterweight');
  });
});

describe('comebacks', () => {
  it('bring a retired fighter back as a free agent, in their own words', () => {
    const { db, active, day } = world();
    const f = active.find((x) => x.condition.headTrauma < 30)!;
    // Somebody still active in the division has since taken their nickname.
    const holder = active.find((x) => x.divisionId === f.divisionId && x.id !== f.id)!;
    db.fighters.upsert({ ...holder, nickname: 'The Comeback Test' } as never);
    db.fighters.upsert({
      ...f,
      nickname: 'The Comeback Test',
      retiredDay: day - 365,
      bank: -50,
      birthDay: day - 31 * 365,
      personality: { ...f.personality, ego: 95 },
    } as never);
    let news: ReturnType<typeof comebacks> = [];
    for (let q = 0; q < 40 && news.length === 0; q++) {
      news = comebacks(db, day + q, createRng(`cb:${q}`), undefined).filter((n) =>
        n.fighterIds.includes(f.id),
      );
    }
    expect(news[0]?.kind).toBe('comeback');
    const back = db.fighters.findById(f.id as string) as Fighter;
    expect(back.retiredDay).toBeUndefined();
    expect(back.promotionId).toBeUndefined();
    expect(back.comebackDay).toBeDefined();
    expect(back.nickname, 'a nickname taken while they were away').toBeUndefined();
  });
});

describe('time off for the head', () => {
  it('makes them unbookable for the break and helps the confidence', () => {
    const { db, promotion, active, day } = world();
    const f = active.find((x) => x.promotionId === promotion.id)!;
    db.fighters.upsert({ ...f, condition: { ...f.condition, confidence: 20 } } as never);
    const rested = takeTimeOff(db, f.id as string)!;
    expect(rested.condition.confidence).toBeGreaterThan(20);
    const ctx = promoterContext({ db, promotion, day });
    const soon = createPlan({ db, promotion, day: day + 20 });
    const later = createPlan({ db, promotion, day: day + 90 });
    expect(blockerFor({ ctx, fighter: rested, plan: soon })).toMatch(/time away/);
    expect(blockerFor({ ctx, fighter: rested, plan: later })).toBeUndefined();
  });
});

describe('the promoter hears about it', () => {
  it('when one of theirs is thinking about retirement', () => {
    const { db, promotion, active, day } = world();
    const f = active.find((x) => x.promotionId === promotion.id)!;
    db.fighters.upsert({
      ...f,
      birthDay: day - 40 * 365,
      starPower: 60,
      personality: { ...f.personality, ego: 70 },
      condition: { ...f.condition, confidence: 15, bodyWear: 50, headTrauma: 40 },
      summary: { ...f.summary, wins: 22, losses: 10, streak: -3 },
    } as never);
    scanCareerEvents(db, day);
    scanCareerEvents(db, day + 1);
    const items = db.inbox.findAll().filter((i) => String(i.id).includes(`considering:${f.id}`));
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toMatch(/farewell|retirement/);
  });
});

describe('heat between two fighters', () => {
  it('is raised by a callout and read back for what a bout draws', () => {
    const { db, active, day } = world();
    const [a, b] = active;
    expect(heatBetween(db, a!.id, b!.id, day).heat).toBe(0);
    stokeBetween(db, { a: a!, b: b!, source: 'callout', day, instigator: a, seed: 'x' });
    expect(heatBetween(db, a!.id, b!.id, day).heat).toBeGreaterThan(0);
  });
});
