/**
 * The history book. Doc 34 B6.
 *
 * Lineages, the promotion's timeline, its hall of fame, and where the fighters it cut ended up —
 * including the news on the night one of them wins a belt somewhere else.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import {
  championshipId,
  createRng,
  crown,
  withLedgerEntry,
  type Championship,
  type DivisionId,
  type Fighter,
  type FightRecordEntry,
  type NewsItem,
  type Promotion,
} from '@mmasim/engine';
import {
  hallOfFame,
  HALL_OF_FAME_BAR,
  promotionTimeline,
  titleLineages,
  whereAreTheyNow,
} from '../../packages/app/src/game/history';
import { cancelPlan, createPlan, runPlan } from '../../packages/app/src/game/plans';
import { runCardBout } from '../../packages/app/src/game/world';
import { readInbox } from '../../packages/app/src/game/inbox';
import { agreed, filledPlan } from '../helpers/plans';

type Db = ReturnType<typeof createNewGame>;

function promoter() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const sorted = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige);
  const promotion = sorted[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  return { db, promotion, other: sorted[1]!, day: getWorld(db).day };
}

const firstBelt = (promotion: Promotion) => {
  const [divisionId, championId] = Object.entries(promotion.champions).find(([, c]) => c)!;
  return { divisionId: divisionId as DivisionId, championId: championId as string };
};

const titleOf = (db: Db, promotion: Promotion, divisionId: DivisionId) =>
  db.championships.findById(championshipId(promotion.id, divisionId)) as Championship;

let seq = 0;
const win = (promotionId: string, day: number, extra: Partial<FightRecordEntry> = {}) =>
  ({
    boutId: `h_${day}_${(seq += 1)}`,
    opponentId: 'x',
    promotionId,
    day,
    outcome: 'win',
    method: 'ko',
    round: 1,
    timeSeconds: 60,
    divisionId: 'mens-lightweight',
    wasTitleFight: false,
    ...extra,
  }) as FightRecordEntry;

describe('title lineage', () => {
  it('reads each belt reign by reign, newest first, with how each one ended', () => {
    const { db, promotion, day } = promoter();
    const { divisionId, championId } = firstBelt(promotion);
    const challenger = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.divisionId === divisionId && f.id !== championId,
    )!;
    db.championships.upsert(
      crown({
        title: titleOf(db, promotion, divisionId),
        fighterId: challenger.id,
        day: day as never,
        wonBy: { opponentId: championId as never, method: 'ko', round: 2 },
      }) as never,
    );

    const lineage = titleLineages(db, promotion).find((l) => l.divisionId === divisionId)!;
    expect(lineage.reigns[0]!.fighterId).toBe(challenger.id);
    expect(lineage.reigns[0]!.lostDay).toBeUndefined();
    expect(lineage.reigns[0]!.how).toMatch(/knockout in round 2/);
    expect(lineage.reigns[1]!.ended).toMatch(/^Lost to /);
    expect(lineage.championId).toBe(challenger.id);
  });
});

describe('the timeline', () => {
  it('has the nights the promotion ran and the cards it called off, newest first', () => {
    const { db, promotion, day } = promoter();
    const plan = agreed(db, filledPlan({ db, promotion, day: day + 21, today: day }));
    const ran = runPlan({ db, plan })!;
    const off = createPlan({ db, promotion, day: day + 90 });
    cancelPlan(db, off.id);

    const timeline = promotionTimeline(db, promotion);
    const night = timeline.find((e) => e.kind === 'night' && e.title === ran.night.name);
    expect(night?.detail).toMatch(/main event|draw/);
    expect(timeline.some((e) => e.kind === 'cancelled' && /called off/.test(e.title))).toBe(true);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1]!.day).toBeGreaterThanOrEqual(timeline[i]!.day);
    }
  });
});

describe('the hall of fame', () => {
  it('inducts a retired great, and has the active ones on course', () => {
    const { db, promotion, day } = promoter();
    const pid = promotion.id as string;
    const career = Array.from({ length: 14 }, (_, i) =>
      win(pid, day - 2000 + i * 100, {
        wasTitleFight: i > 9,
        bonus: i % 3 === 0 ? 'performance' : undefined,
      }),
    );
    const [a, b] = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id,
    );
    db.fighters.upsert({ ...a!, record: [...a!.record, ...career], retiredDay: day - 10 } as never);
    db.fighters.upsert({ ...b!, record: [...b!.record, ...career] } as never);

    const hall = hallOfFame(db, promotion, 50);
    const retired = hall.find((l) => l.fighterId === a!.id)!;
    const active = hall.find((l) => l.fighterId === b!.id)!;
    expect(retired.score).toBeGreaterThanOrEqual(HALL_OF_FAME_BAR);
    expect(retired.inducted).toBe(true);
    expect(active.inducted).toBe(false);
    expect(retired.line).toMatch(/here/);
  });
});

describe('where are they now', () => {
  it('follows the fighters you cut, champions elsewhere first', () => {
    const { db, promotion, other, day } = promoter();
    const [cutOne, cutTwo] = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id && f.retiredDay === undefined,
    );
    const cut = (f: Fighter, at: number) => ({
      ...f,
      promotionId: other.id,
      ledger: withLedgerEntry(f.ledger, {
        day: at as never,
        promotionId: promotion.id,
        kind: 'cut',
      }),
    });
    db.fighters.upsert({
      ...cut(cutOne!, day - 300),
      record: [...cutOne!.record, win(other.id as string, day - 100)],
    } as never);
    db.fighters.upsert(cut(cutTwo!, day - 50) as never);
    db.promotions.upsert({
      ...other,
      champions: { ...other.champions, [cutOne!.divisionId]: cutOne!.id },
    } as never);

    const former = whereAreTheyNow(db, promotion);
    expect(former[0]!.fighterId).toBe(cutOne!.id);
    expect(former[0]!.belts[0]).toMatch(new RegExp(`^${other.shortName} `));
    expect(former[0]!.now).toBe(`Fighting for ${other.shortName}`);
    expect(former[0]!.since).toMatch(/^1-0/);
    expect(former.find((f) => f.fighterId === cutTwo!.id)?.since).toBeUndefined();
  });

  it('makes the news on the night a fighter you cut wins a belt somewhere else', () => {
    const { db, promotion, other, day } = promoter();
    const { divisionId, championId } = firstBelt(other);
    const contender = (db.fighters.findAll() as Fighter[]).find(
      (f) =>
        f.promotionId === promotion.id && f.divisionId === divisionId && f.retiredDay === undefined,
    )!;
    // Cut by the player, signed by the rival, and — for the purposes of this — far better.
    const strong = Object.fromEntries(Object.keys(contender.attributes).map((k) => [k, 99]));
    db.fighters.upsert({
      ...contender,
      promotionId: other.id,
      attributes: strong,
      ledger: withLedgerEntry(contender.ledger, {
        day: (day - 30) as never,
        promotionId: promotion.id,
        kind: 'cut',
      }),
    } as never);

    let crowned = false;
    for (let i = 0; i < 6 && !crowned; i++) {
      const ran = runCardBout({
        db,
        day: day + i,
        rng: createRng(`history:${i}`),
        promotion: db.promotions.findById(other.id as string) as Promotion,
        bout: {
          boutId: `hist_${i}`,
          redId: championId as never,
          blueId: contender.id,
          divisionId,
          position: 'mainEvent',
          order: 0,
          rounds: 5,
          isTitleFight: true,
        },
        readyOn: new Map(),
        lastSeen: new Map(),
      });
      crowned = (ran?.news ?? []).some((n: NewsItem) => /cut by/.test(n.headline));
      if (crowned) {
        expect(readInbox(db).some((item) => /cut by/.test(item.title))).toBe(true);
      }
    }
    expect(crowned).toBe(true);
  });
});
