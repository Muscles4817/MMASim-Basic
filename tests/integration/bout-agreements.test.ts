/**
 * Fights that can be refused, and fights that fall apart.
 *
 * Doc 16 specifies `BoutAgreement` in full and nothing implemented it, which left a hole under
 * the whole of promoter mode: **offering a bout was a command**. The card builder was eighteen
 * dropdowns that always said yes, which is precisely what doc 13's "what must never happen"
 * section forbids.
 *
 * Three pieces of the model existed and were unreachable, and this is what they were for:
 * `stepUpAcceptance()` had no caller outside its own unit test, `shortNoticeWillingness` was a
 * trait hook with two traits pointing at it and no reader, and `TollReason: 'refusedBout'` was a
 * type-level fiction because nothing could refuse a bout.
 *
 * Scoped to the **model** since the planning rework. Sending a card out, rolling withdrawals and
 * finding replacements are now properties of an `EventPlan` and are exercised end to end in
 * `planning.test.ts`; what remains here is the arithmetic underneath them, which is worth
 * testing in isolation because it is what the screens read before they ask anybody anything.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  acceptanceOf,
  describeAcceptance,
  pullOutRisk,
  type Fighter,
  type Manager,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { sign, toll } from '../../packages/app/src/game/contracts';

/**
 * `sign` returns a result rather than a fighter, because it now refuses when the fighter is
 * still under contract elsewhere — a rule that did not exist when these tests were written and
 * that they all satisfy, since each signs with the fighter's own promotion.
 */
const mustSign = (result: ReturnType<typeof sign>): Fighter => {
  if (!result.ok) throw new Error(`sign refused: ${result.reason}`);
  return result.fighter;
};

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const leader = (db: ReturnType<typeof game>) =>
  (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;

/** Two fighters from the same division, so a bout between them is legal. */
function pair(db: ReturnType<typeof game>, promotion: Promotion) {
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.promotionId === promotion.id,
  );
  const division = roster[0]!.divisionId;
  const inDivision = roster.filter((f) => f.divisionId === division);
  return { a: inDivision[0]!, b: inDivision[1]! };
}

describe('whether a fighter takes the fight', () => {
  const db = game();
  const promotion = leader(db);
  const { a, b } = pair(db, promotion);

  it('is a probability the player can be shown, not a verdict', () => {
    /*
     * Returned as a chance rather than a yes/no so the UI can show it *before* asking. A
     * promoter who cannot see that a fight is a long shot before offering it is playing a slot
     * machine, and doc 13 requires the game to say what a fight is worth before you book it.
     */
    const read = acceptanceOf({ fighter: a, opponent: b, promotion });
    expect(read.chance).toBeGreaterThan(0);
    expect(read.chance).toBeLessThanOrEqual(1);
  });

  it('makes a big step up harder to sell than a fight they should win', () => {
    // The whole reason ducking is a strategy rather than a personality flaw.
    const weak = { ...b, attributes: scale(b.attributes, -18) };
    const strong = { ...b, attributes: scale(b.attributes, 18) };

    const easy = acceptanceOf({ fighter: a, opponent: weak, promotion }).chance;
    const hard = acceptanceOf({ fighter: a, opponent: strong, promotion }).chance;
    expect(hard).toBeLessThan(easy);
  });

  it('lets ambition decide who takes the hard one', () => {
    // `stepUpAcceptance` has existed since the domain was written with no caller but a test.
    const strong = { ...b, attributes: scale(b.attributes, 20) };
    const hungry = {
      ...a,
      personality: { ...a.personality, ambition: 95, ego: 80 },
    };
    const content = {
      ...a,
      personality: { ...a.personality, ambition: 8, ego: 30 },
    };

    expect(acceptanceOf({ fighter: hungry, opponent: strong, promotion }).chance).toBeGreaterThan(
      acceptanceOf({ fighter: content, opponent: strong, promotion }).chance,
    );
  });

  it('makes short notice much harder than a full camp', () => {
    expect(acceptanceOf({ fighter: a, opponent: b, promotion, notice: 'short' }).chance).toBeLessThan(
      acceptanceOf({ fighter: a, opponent: b, promotion, notice: 'full' }).chance,
    );
  });

  it('lets a trait decide who will step in at short notice', () => {
    /*
     * `shortNoticeWillingness` has been a trait hook with two traits pointing at it and no
     * reader in the codebase. A fighter who stays in the gym is worth more to a promoter in an
     * emergency than a better one who cannot make weight in eleven days.
     */
    // `companyMan` and `mercenary` are the two traits that carry this hook.
    const ready = { ...a, traits: ['companyMan' as const] };
    const not = { ...a, traits: ['mercenary' as const] };
    expect(
      acceptanceOf({ fighter: ready, opponent: b, promotion, notice: 'short' }).chance,
    ).toBeGreaterThan(
      acceptanceOf({ fighter: not, opponent: b, promotion, notice: 'short' }).chance,
    );
  });

  it('makes almost nobody turn down a belt', () => {
    const strong = { ...b, attributes: scale(b.attributes, 22) };
    const forTheBelt = acceptanceOf({
      fighter: a,
      opponent: strong,
      promotion,
      isTitleFight: true,
    }).chance;
    const forNothing = acceptanceOf({ fighter: a, opponent: strong, promotion }).chance;
    expect(forTheBelt).toBeGreaterThan(forNothing);
    expect(forTheBelt).toBeGreaterThan(0.7);
  });

  it('makes an aggrieved fighter harder to book', () => {
    /*
     * The last unclosed loop in doc 16's grievance chain. `contractFairness` fed `resentment`
     * and `resentment` fed nothing at all — a fighter could be furious about their deal and it
     * changed nothing they did.
     */
    const content = { ...a, resentment: 0 };
    const furious = { ...a, resentment: 95 };
    expect(acceptanceOf({ fighter: furious, opponent: b, promotion }).chance).toBeLessThan(
      acceptanceOf({ fighter: content, opponent: b, promotion }).chance,
    );
  });

  it('gives the player a reason rather than only a number', () => {
    const strong = { ...b, attributes: scale(b.attributes, 22) };
    const read = acceptanceOf({ fighter: a, opponent: strong, promotion });
    expect(read.concern, JSON.stringify(read)).toBeTruthy();
  });

  it('says the answer in words, because a promoter hears a person', () => {
    expect(describeAcceptance(0.95)).toMatch(/will take it/i);
    expect(describeAcceptance(0.05)).toMatch(/will not take/i);
  });
});

describe('a manager who has both of them', () => {
  it('makes the fight far harder to make', () => {
    /*
     * `stableConflictCost` existed and was read only for a display string on the fighter's own
     * hub. A manager with a teammate in the other corner has a problem money does not solve,
     * and it is one of the most common real reasons a fight cannot be made.
     */
    const db = game();
    const promotion = leader(db);
    const { a, b } = pair(db, promotion);
    const manager = (db.managers.findAll() as unknown as Manager[])[0]!;

    const stabled: Manager = { ...manager, clientIds: [a.id, b.id] as never };
    const unrelated: Manager = { ...manager, clientIds: [a.id] as never };

    // Against a genuinely hard fight, so neither side saturates at a certain yes and the
    // difference the conflict makes is actually visible.
    const strong = { ...b, attributes: scale(b.attributes, 12) };
    expect(
      acceptanceOf({ fighter: a, opponent: strong, promotion, manager: stabled }).chance,
    ).toBeLessThan(
      acceptanceOf({ fighter: a, opponent: strong, promotion, manager: unrelated }).chance,
    );
  });
});

describe('what saying no costs', () => {
  it('stops the contract clock', () => {
    /*
     * `TollReason: 'refusedBout'` has been in the type since contracts shipped and nothing could
     * ever produce it. A refused fight leaves the fighter a fight *further* from free agency
     * rather than a day closer, which is the entire design of a tolled contract and the reason
     * holding out is a decision rather than a free move.
     */
    const db = game();
    const promotion = leader(db);
    const { a } = pair(db, promotion);

    // The seed puts nobody under a written agreement — those arrive through free agency as the
    // world runs — so the test signs one rather than hunting for a fighter who happens to have
    // it and silently passing when nobody does.
    const signed = mustSign(sign(db, a, promotion, {
      showPurse: 20,
      winBonus: 20,
      signingBonus: 0,
      revenuePoints: 0,
      fightsOwed: 4,
      championshipExtension: 'none',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
    }));
    const before = db.agreements.findById(signed.agreementId as string) as PromotionalAgreement;

    toll(db, signed, 30);

    const after = db.agreements.findById(signed.agreementId as string) as PromotionalAgreement;
    expect(after.tolledDays).toBe(before.tolledDays + 30);
    expect(after.expiresDay).toBeGreaterThan(before.expiresDay);
  });
});

describe('fights falling apart', () => {
  it('puts a withdrawal within reach of a real camp', () => {
    // Around one bout in eight loses a fighter in reality — high enough that a promoter plans
    // for it, low enough that it is an event rather than a tax.
    const db = game();
    const promotion = leader(db);
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id,
    );
    const average = roster.reduce((a, f) => a + pullOutRisk(f), 0) / roster.length;
    expect(average, `average pull-out risk ${(average * 100).toFixed(1)}%`).toBeGreaterThan(0.01);
    expect(average, `average pull-out risk ${(average * 100).toFixed(1)}%`).toBeLessThan(0.16);
  });

  it('makes an injury-prone, undisciplined fighter the likeliest to withdraw', () => {
    // The causes are the fighter's own attributes rather than a flat die roll.
    const db = game();
    const promotion = leader(db);
    const { a } = pair(db, promotion);

    const fragile = {
      ...a,
      traits: [...a.traits, 'injuryProne' as const],
      personality: { ...a.personality, discipline: 10 },
    };
    const reliable = { ...a, personality: { ...a.personality, discipline: 95 } };
    expect(pullOutRisk(fragile)).toBeGreaterThan(pullOutRisk(reliable));
  });

});

/** Shift a whole attribute block, for building a clearly better or worse opponent. */
function scale(attributes: Fighter['attributes'], by: number): Fighter['attributes'] {
  const out = { ...attributes };
  for (const key of Object.keys(out) as (keyof typeof out)[]) {
    out[key] = Math.max(1, Math.min(100, out[key] + by)) as never;
  }
  return out;
}
