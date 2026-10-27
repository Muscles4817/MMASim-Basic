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
  acceptCounter,
  boutStatusLabel,
  counterLabel,
  counterTerms,
  createPlan,
  promoterContext,
  suggestFills,
  whatItSells,
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

describe('what a pairing sells', () => {
  it('puts the belt first when this promotion’s champion is in it', () => {
    const { db, plan, ctx } = setup();
    const [divisionId, championId] = Object.entries(ctx.promotion.champions).find(
      ([, id]) => id !== undefined,
    )!;
    const champion = db.fighters.findById(championId as string) as Fighter;
    const challenger = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.divisionId === divisionId && f.id !== champion.id && f.retiredDay === undefined,
    )!;
    expect(whatItSells({ ctx, plan, a: challenger, b: champion })).toBe('A belt on the line');

    // Not across divisions, where the belt cannot be on the line.
    const elsewhere = (db.fighters.findAll() as Fighter[]).find(
      (f) => f.divisionId !== divisionId && f.retiredDay === undefined,
    )!;
    expect(whatItSells({ ctx, plan, a: elsewhere, b: champion })).not.toBe('A belt on the line');
  });
});

describe('a counter that is not money', () => {
  type Answer = NonNullable<PlannedBout['answers']>[number];
  const answer = (counter: Answer['counter'], extra: Partial<Answer> = {}): Answer => ({
    fighterId: 'a' as never,
    verdict: 'countered',
    note: 'Not like this.',
    counter,
    ...extra,
  });
  const NAMES: Record<string, string> = { a: 'Ruiz', b: 'Okafor', c: 'Lindqvist' };
  const names = (id: string) => NAMES[id] ?? id;

  /** A card with the bout in its main event, and every other slot filled or left empty. */
  function card(answers: PlannedBout['answers'], fillTheRest: boolean) {
    const { plan } = setup();
    const main = plan.slots.find((s) => s.position === 'mainEvent')!;
    return {
      ...plan,
      slots: plan.slots.map((s, i) =>
        s.id === main.id
          ? {
              ...s,
              bout: {
                redId: 'a' as never,
                blueId: 'b' as never,
                divisionId: 'lw' as never,
                status: 'declined' as const,
                rounds: 3 as const,
                answers,
              },
            }
          : fillTheRest
            ? {
                ...s,
                bout: {
                  redId: `x${i}` as never,
                  blueId: `y${i}` as never,
                  divisionId: 'lw' as never,
                  status: 'agreed' as const,
                  rounds: 3 as const,
                },
              }
            : s,
      ),
      main: main.id,
    };
  }

  it('gets its own words on the card', () => {
    expect(counterLabel(answer({ kind: 'slot', position: 'coMain' }))).toBe('Wants the co-main');
    expect(counterLabel(answer({ kind: 'slot', position: 'mainCard' }))).toBe(
      'Wants the main card',
    );
    expect(counterLabel(answer({ kind: 'rounds', rounds: 5 }))).toBe('Wants five rounds');
    expect(
      counterLabel(answer({ kind: 'opponent', preferredId: 'c' as never, reason: 'Wants C.' })),
    ).toBe('Wants another opponent');
  });

  it('says what agreeing would take, and can be agreed when all of it can be granted', () => {
    const plan = card(
      [
        answer({ kind: 'rounds', rounds: 5 }),
        answer(undefined, { fighterId: 'b' as never, askingPurse: 12 }),
      ],
      false,
    );
    const terms = counterTerms(plan, plan.main, names)!;
    expect(terms.terms.map((t) => t.text)).toEqual([
      'Make it five rounds',
      expect.stringMatching(/^Pay Okafor .*12.* to show$/),
    ]);
    expect(terms.pay).toBe(12);
    expect(terms.blocked).toBeUndefined();
  });

  it('says why a better slot cannot be given when the card has none free', () => {
    const ask = [answer({ kind: 'slot', position: 'coMain' })];
    const open = card(ask, false);
    expect(open.slots.some((s) => s.position === 'coMain')).toBe(true);
    expect(counterTerms(open, open.main, names)!.blocked).toBeUndefined();
    const full = card(ask, true);
    expect(counterTerms(full, full.main, names)!.blocked).toMatch(/^Nothing is free/);
  });

  it('treats a different opponent as a new fight, and names it', () => {
    const plan = card(
      [answer({ kind: 'opponent', preferredId: 'c' as never, reason: 'Wants C.' })],
      false,
    );
    const terms = counterTerms(plan, plan.main, names)!;
    expect(terms.terms[0]!.text).toBe('Ruiz wants Lindqvist instead');
    expect(terms.instead).toEqual({ fighterId: 'a', preferredId: 'c' });
    expect(terms.blocked).toMatch(/new fight/);
  });

  it('cannot be met when the other corner flatly declined', () => {
    const plan = card(
      [
        answer(undefined, { askingPurse: 9 }),
        { fighterId: 'b' as never, verdict: 'declined', note: 'No.' },
      ],
      false,
    );
    expect(counterTerms(plan, plan.main, names)!.blocked).toBe(
      'Okafor said no outright, and no terms change that.',
    );
  });

  it('is exactly what accepting does, for every kind of counter', () => {
    // The screen's promise and the tap's effect come from one set of rules.
    const { ctx } = setup();
    const cases: { name: string; answers: PlannedBout['answers']; fill: boolean }[] = [
      {
        name: 'money',
        answers: [answer({ kind: 'money', askingPurse: 9 }, { askingPurse: 9 })],
        fill: false,
      },
      { name: 'rounds', answers: [answer({ kind: 'rounds', rounds: 5 })], fill: false },
      { name: 'slot, free', answers: [answer({ kind: 'slot', position: 'coMain' })], fill: false },
      { name: 'slot, taken', answers: [answer({ kind: 'slot', position: 'coMain' })], fill: true },
      {
        name: 'opponent',
        answers: [answer({ kind: 'opponent', preferredId: 'c' as never, reason: 'Wants C.' })],
        fill: false,
      },
      {
        name: 'refused',
        answers: [
          answer(undefined, { askingPurse: 9 }),
          { fighterId: 'b' as never, verdict: 'declined', note: 'No.' },
        ],
        fill: false,
      },
    ];

    for (const c of cases) {
      const plan = card(c.answers, c.fill);
      const terms = counterTerms(plan, plan.main, names)!;
      const after = acceptCounter({ ctx, plan, slotId: plan.main });

      if (terms.blocked !== undefined) {
        expect(after, c.name).toBe(plan);
        continue;
      }
      expect(after, c.name).not.toBe(plan);
      const bout = after.slots.find((s) => s.id === terms.targetSlotId)!.bout!;
      expect(bout.status, c.name).toBe('agreed');
      expect(bout.rounds, c.name).toBe(terms.rounds);
      if (terms.targetSlotId !== plan.main) {
        expect(after.slots.find((s) => s.id === plan.main)!.bout, c.name).toBeUndefined();
      }
    }
  });
});
