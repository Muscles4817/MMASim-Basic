/**
 * Matchmaking that serves the promotion's open situations.
 *
 * The audit's findings: autofill put champions in three-round bouts with nothing on the line,
 * ignored the vacant belts and owed title shots the dashboard was nagging about, and a fighter who
 * asked for more money read "Turned down" on the card.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld } from '@mmasim/data';
import { type Fighter, type PlannedBout, type Promotion } from '@mmasim/engine';
import {
  boutStatusLabel,
  counterLabel,
  createPlan,
  promoterContext,
  suggestFills,
} from '../../packages/app/src/game/plans';

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const leader = (db: ReturnType<typeof game>) =>
  (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;

function setup(edit?: (db: ReturnType<typeof game>, promotion: Promotion) => Promotion) {
  const db = game();
  let promotion = leader(db);
  if (edit) {
    promotion = edit(db, promotion);
    db.promotions.upsert(promotion as never);
  }
  const today = getWorld(db).day;
  const plan = createPlan({ db, promotion, day: today + 84, scale: 'flagship' });
  const ctx = promoterContext({ db, promotion, day: today });
  return { db, promotion, plan, ctx, today };
}

describe('autofill and the belts', () => {
  it('never puts a champion in a bout that is not for the title', () => {
    const { promotion, plan, ctx } = setup();
    const champions = new Set(Object.values(promotion.champions) as string[]);
    const suggestions = suggestFills({ ctx, plan, scope: 'all' });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      if (champions.has(s.redId) || champions.has(s.blueId)) {
        expect(s.titleKind, `${s.redId} vs ${s.blueId}`).toBe('undisputed');
        expect(['mainEvent', 'coMain']).toContain(s.position);
      }
    }
  });

  it('tops the card with what the belts need, and says why', () => {
    const { plan, ctx } = setup();
    const main = suggestFills({ ctx, plan, scope: 'mainEvent' })[0]!;
    expect(main.titleKind).toBeDefined();
    expect(main.because).toBeTruthy();
  });

  it('reaches for a vacant belt before a defence', () => {
    let vacated = '';
    const { plan, ctx } = setup((_db, promotion) => {
      const [divisionId] = Object.keys(promotion.champions);
      vacated = divisionId!;
      const champions = { ...promotion.champions };
      delete champions[divisionId as never];
      return { ...promotion, champions };
    });
    const main = suggestFills({ ctx, plan, scope: 'mainEvent' })[0]!;
    expect(main.titleKind).toBe('vacant');
    expect(main.divisionId).toBe(vacated);
  });

  it('leaves out anybody who will not be cleared for the date', () => {
    const { db, plan, ctx, today } = setup();
    const before = suggestFills({ ctx, plan, scope: 'all' });
    const hurt = before[0]!.redId;
    const fighter = db.fighters.findById(hurt) as Fighter;
    db.fighters.upsert({ ...fighter, readyOnDay: today + 200 } as never);

    const after = suggestFills({
      ctx: promoterContext({ db, promotion: ctx.promotion, day: today }),
      plan,
      scope: 'all',
    });
    expect(after.flatMap((s) => [s.redId, s.blueId])).not.toContain(hurt);
  });
});

describe('a counter reads as a price', () => {
  const bout = (answers: PlannedBout['answers']): PlannedBout => ({
    redId: 'a' as never,
    blueId: 'b' as never,
    divisionId: 'lw' as never,
    status: 'declined',
    rounds: 3,
    answers,
  });

  it('says what they want, not that they said no', () => {
    const asking = bout([
      { fighterId: 'a' as never, verdict: 'countered', note: 'Pay me.', askingPurse: 8.5 },
    ]);
    expect(boutStatusLabel(asking)).toMatch(/^Wants £8\.5k$/);
    expect(counterLabel(asking.answers![0]!)).toBe(boutStatusLabel(asking));
  });

  it('still says turned down when somebody flatly declined', () => {
    const flat = bout([
      { fighterId: 'a' as never, verdict: 'countered', note: 'Pay me.', askingPurse: 8.5 },
      { fighterId: 'b' as never, verdict: 'declined', note: 'No.' },
    ]);
    expect(boutStatusLabel(flat)).toBe('Turned down');
  });
});
