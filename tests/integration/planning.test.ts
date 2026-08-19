/**
 * Planning a card, over game months.
 *
 * Replaces `promoting.test.ts`, which asserted the behaviour the rework removed: that a card is
 * assembled in one sitting from a matchmaker's nine choices, and that pressing one button both
 * books and runs the night. What is under test now is the shape that replaced it — a card is a
 * date with holes in it, filling a hole is the player's decision, and nothing is a fight until
 * both corners have said yes.
 *
 * The suite is deliberately about the *seams*: the matchmaker still has to be able to fill a
 * regional promotion's card, a suggestion still has to exclude anybody suspended or already
 * booked, and a plan still has to turn into a night with exactly the consequences a world card
 * has. Those are the properties that break silently.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  displayName,
  planProgress,
  plannedBouts,
  withSlot,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import {
  applySuggestion,
  createPlan,
  forecastPlan,
  issuesFor,
  opponentsFor,
  placeBout,
  plansFor,
  promoterContext,
  rollWithdrawals,
  runPlan,
  savePlan,
  sendOffer,
  subjectsFor,
  suggestFills,
  titleOptionsFor,
} from '../../packages/app/src/game/plans';
import { advanceWorld } from '../../packages/app/src/game/world';
import { agreed, filledPlan } from '../helpers/plans';

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const leader = (db: ReturnType<typeof game>) =>
  (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
const smallest = (db: ReturnType<typeof game>) =>
  (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => a.prestige - b.prestige)[0]!;

const TODAY = 2192;
const CARD_DAY = TODAY + 90;

const ctxFor = (db: ReturnType<typeof game>, promotion: Promotion) =>
  promoterContext({ db, promotion, day: TODAY });

describe('a card is a date first', () => {
  it('exists with nothing on it', () => {
    /*
     * The foundational claim. A promoter knows in January that they want a card in April; they
     * do not know who is on it, and the old model had nowhere to keep that.
     */
    const db = game();
    const plan = createPlan({ db, promotion: leader(db), day: CARD_DAY });

    expect(plan.status).toBe('planning');
    expect(plannedBouts(plan)).toHaveLength(0);
    expect(plan.slots.length).toBeGreaterThan(0);
  });

  it('survives being put down and picked up again', () => {
    // A plan is the one thing in the save the player *wrote*. If it does not persist, the whole
    // idea of planning ahead is a session-length fiction.
    const db = game();
    const promotion = leader(db);
    const plan = createPlan({ db, promotion, day: CARD_DAY });

    expect(plansFor(db, promotion.id as string).map((p) => p.id)).toContain(plan.id);
  });

  it('leads its issue list with the missing main event', () => {
    const db = game();
    const promotion = leader(db);
    const plan = createPlan({ db, promotion, day: CARD_DAY });
    expect(issuesFor({ ctx: ctxFor(db, promotion), plan })[0]?.kind).toBe('noMainEvent');
  });
});

describe('choosing who fights', () => {
  it('offers the promotion’s own roster, most idle first', () => {
    /*
     * Sorted by who needs a fight rather than alphabetically, because a promoter filling a slot
     * is usually looking for somebody owed a bout — and when they want a specific person they
     * search.
     */
    const db = game();
    const promotion = leader(db);
    const plan = createPlan({ db, promotion, day: CARD_DAY });
    const subjects = subjectsFor({ ctx: ctxFor(db, promotion), plan, slotId: 'main' });

    expect(subjects.length).toBeGreaterThan(0);
    for (const option of subjects.slice(0, 20)) {
      expect(option.fighter.promotionId).toBe(promotion.id);
    }
  });

  it('finds a searched fighter by name', () => {
    const db = game();
    const promotion = leader(db);
    const plan = createPlan({ db, promotion, day: CARD_DAY });
    const ctx = ctxFor(db, promotion);
    const someone = ctx.roster[0]!;

    const found = subjectsFor({
      ctx,
      plan,
      slotId: 'main',
      search: someone.lastName,
    });
    expect(found.some((o) => o.fighter.id === someone.id)).toBe(true);
  });

  it('proposes opponents from the same division, and explains every one', () => {
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;

    const options = opponentsFor({ ctx, plan, slot: plan.slots[0]!, subject });
    expect(options.length).toBeGreaterThan(0);

    for (const option of options) {
      expect(option.fighter.divisionId).toBe(subject.divisionId);
      expect(option.fighter.promotionId).toBe(promotion.id);
      // A suggestion the player cannot interrogate is the game playing itself.
      expect(option.appraisal.rationale.length, displayName(option.fighter)).toBeGreaterThan(0);
    }
  });

  it('re-orders the same slate when the purpose changes', () => {
    // The whole reason the intent picker is a control rather than a label.
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;

    const forADraw = opponentsFor({
      ctx,
      plan,
      slot: plan.slots[0]!,
      subject,
      intent: 'createStar',
    });
    const forAFight = opponentsFor({
      ctx,
      plan,
      slot: plan.slots[0]!,
      subject,
      intent: 'competitive',
    });

    const topOf = (rows: typeof forADraw) =>
      rows.filter((r) => r.group === 'recommended').map((r) => r.fighter.id as string);
    // The pool is the same; which handful is recommended out of it is not.
    expect(new Set(forADraw.map((r) => r.fighter.id))).toEqual(
      new Set(forAFight.map((r) => r.fighter.id)),
    );
    expect(topOf(forADraw).length).toBeGreaterThan(0);
    expect(topOf(forAFight).length).toBeGreaterThan(0);
  });

  it('blocks somebody who will not be medically cleared in time', () => {
    const db = game();
    const promotion = leader(db);
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === promotion.id,
    );
    const suspended = roster[0]!;
    db.fighters.upsert({ ...suspended, readyOnDay: CARD_DAY + 200 } as Fighter & { id: string });

    const plan = createPlan({ db, promotion, day: CARD_DAY });
    const blocked = subjectsFor({ ctx: ctxFor(db, promotion), plan, slotId: 'main' }).find(
      (o) => o.fighter.id === suspended.id,
    );
    expect(blocked?.blocker).toMatch(/cleared/i);
  });

  it('blocks somebody already on this card', () => {
    // Easy to do across three months of filling and impossible to spot by reading nine rows.
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    let plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;
    const opponent = opponentsFor({ ctx, plan, slot: plan.slots[0]!, subject })[0]!.fighter;

    plan = placeBout({
      plan,
      slotId: 'co',
      redId: subject.id as string,
      blueId: opponent.id as string,
      divisionId: subject.divisionId as string,
    });

    const blocked = subjectsFor({ ctx, plan, slotId: 'main' }).find(
      (o) => o.fighter.id === subject.id,
    );
    expect(blocked?.blocker).toMatch(/Already booked/i);
  });
});

describe('title fights are designated, not inferred', () => {
  it('says a bout cannot be for the belt when the champion is not in it', () => {
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });

    // A division this promotion has a champion in.
    const divisionId = Object.keys(promotion.champions)[0];
    if (!divisionId) return;
    const championId = promotion.champions[divisionId as never];

    const contenders = ctx.roster.filter(
      (f) => (f.divisionId as string) === divisionId && f.id !== championId,
    );
    if (contenders.length < 2) return;

    const options = titleOptionsFor({ ctx, red: contenders[0]!, blue: contenders[1]!, plan });
    const undisputed = options.find((o) => o.kind === 'undisputed')!;
    expect(undisputed.available).toBe(false);
    expect(undisputed.reason).toMatch(/holds the belt/i);
  });

  it('does not hand out an interim belt while the champion is fit and available', () => {
    /*
     * An interim title exists *because* a champion cannot fight. Offering one otherwise turns it
     * into free prestige, which is precisely what makes real interim titles contentious.
     */
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });

    const divisionId = Object.keys(promotion.champions)[0];
    if (!divisionId) return;
    const championId = promotion.champions[divisionId as never];
    const contenders = ctx.roster.filter(
      (f) => (f.divisionId as string) === divisionId && f.id !== championId,
    );
    if (contenders.length < 2) return;

    const interim = titleOptionsFor({ ctx, red: contenders[0]!, blue: contenders[1]!, plan }).find(
      (o) => o.kind === 'interim',
    )!;
    expect(interim.reason.length).toBeGreaterThan(0);
  });
});

describe('offers', () => {
  it('does not sign a fight simply by placing it', () => {
    /*
     * The change that turns the builder from a form into matchmaking. Placing a name is an
     * intention; a fight needs both corners.
     */
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    let plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;
    const opponent = opponentsFor({ ctx, plan, slot: plan.slots[0]!, subject })[0]!.fighter;

    plan = placeBout({
      plan,
      slotId: 'main',
      redId: subject.id as string,
      blueId: opponent.id as string,
      divisionId: subject.divisionId as string,
    });

    expect(plan.slots[0]!.bout!.status).toBe('draft');
    expect(planProgress(plan).agreed).toBe(0);
    expect(planProgress(plan).hasMainEvent).toBe(false);
  });

  it('comes back with an answer from each corner, in their own words', () => {
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    let plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;
    const opponent = opponentsFor({ ctx, plan, slot: plan.slots[0]!, subject })[0]!.fighter;

    plan = placeBout({
      plan,
      slotId: 'main',
      redId: subject.id as string,
      blueId: opponent.id as string,
      divisionId: subject.divisionId as string,
    });

    const result = sendOffer({ ctx, plan, slotId: 'main' })!;
    expect(result.outcome.answers.length).toBeGreaterThan(0);
    for (const answer of result.outcome.answers) {
      expect(answer.note.length).toBeGreaterThan(0);
    }
    expect(['agreed', 'declined']).toContain(result.plan.slots[0]!.bout!.status);
  });

  it('cannot be re-rolled by asking again', () => {
    /*
     * Seeded on the plan, the slot and both fighters. A promoter who could refresh until
     * everybody said yes is back to a card that always fills, which is the thing the whole
     * rework exists to stop.
     */
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    let plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;
    const opponent = opponentsFor({ ctx, plan, slot: plan.slots[0]!, subject })[0]!.fighter;

    plan = placeBout({
      plan,
      slotId: 'main',
      redId: subject.id as string,
      blueId: opponent.id as string,
      divisionId: subject.divisionId as string,
    });

    const first = sendOffer({ ctx, plan, slotId: 'main' })!;
    const second = sendOffer({ ctx, plan, slotId: 'main' })!;
    expect(second.outcome.accepted).toBe(first.outcome.accepted);
  });

  it('produces refusals across a whole roster rather than agreeing to everything', () => {
    // If nobody ever says no, `acceptanceOf` is decorative and the card always fills.
    const db = game();
    const promotion = leader(db);
    const ctx = promoterContext({ db, promotion, day: CARD_DAY - 10 });

    let refusals = 0;
    let offers = 0;
    for (let i = 0; i < 6; i++) {
      let plan = createPlan({ db, promotion, day: CARD_DAY + i });
      for (const suggestion of suggestFills({ ctx, plan, scope: 'all' })) {
        plan = applySuggestion(plan, suggestion);
      }
      for (const slot of plan.slots) {
        if (!slot.bout) continue;
        const result = sendOffer({ ctx, plan, slotId: slot.id });
        if (!result) continue;
        plan = result.plan;
        offers += 1;
        if (!result.outcome.accepted) refusals += 1;
      }
    }

    expect(offers).toBeGreaterThan(20);
    expect(refusals, 'nobody in the entire sport turned a fight down').toBeGreaterThan(0);
  });
});

describe('autofill, scoped', () => {
  it('suggests without booking anything', () => {
    /*
     * The distinction the rework is built around: autofill is a convenience, not the gameplay.
     * Asking for suggestions must leave the card exactly as it was.
     */
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });

    const suggestions = suggestFills({ ctx, plan, scope: 'all' });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(plannedBouts(plan)).toHaveLength(0);
  });

  it('touches only the section it was asked about', () => {
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });

    const prelims = suggestFills({ ctx, plan, scope: 'prelims' });
    expect(prelims.length).toBeGreaterThan(0);
    for (const suggestion of prelims) {
      expect(suggestion.position).toBe('prelim');
    }
  });

  it('never books anybody twice inside one pass', () => {
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY });

    const ids = suggestFills({ ctx, plan, scope: 'all' }).flatMap((s) => [s.redId, s.blueId]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves a slot the player already filled alone', () => {
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    let plan = createPlan({ db, promotion, day: CARD_DAY });
    const subject = ctx.roster[0]!;
    const opponent = opponentsFor({ ctx, plan, slot: plan.slots[0]!, subject })[0]!.fighter;

    plan = placeBout({
      plan,
      slotId: 'main',
      redId: subject.id as string,
      blueId: opponent.id as string,
      divisionId: subject.divisionId as string,
    });

    expect(suggestFills({ ctx, plan, scope: 'all' }).some((s) => s.slotId === 'main')).toBe(false);
  });

  it('spreads its suggestions across divisions rather than off the top of the table', () => {
    /*
     * On a fresh save nobody has fought in this simulation yet, so every fighter's layoff is
     * identical and a naive "take the first forty" shortlist collapses to whatever order the
     * table happens to be in — the same people every time, and whole divisions that can never be
     * autofilled at all.
     */
    const db = game();
    const promotion = leader(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY, scale: 'flagship' });

    const divisions = new Set(suggestFills({ ctx, plan, scope: 'all' }).map((s) => s.divisionId));
    expect(
      divisions.size,
      'every suggested fight came from the same corner of the roster',
    ).toBeGreaterThan(2);
  });

  it('can fill a regional promotion’s card, which is where a player starts', () => {
    // The depth targets exist so this is true. A promotion that cannot fill its own card is one
    // nobody can play.
    const db = game();
    const promotion = smallest(db);
    const ctx = ctxFor(db, promotion);
    const plan = createPlan({ db, promotion, day: CARD_DAY, scale: 'club' });

    expect(suggestFills({ ctx, plan, scope: 'all' }).length).toBeGreaterThanOrEqual(4);
  });
});

describe('what the card is worth before it runs', () => {
  it('reports a forecast the player can act on', () => {
    const db = game();
    const promotion = leader(db);
    const plan = filledPlan({ db, promotion, day: CARD_DAY, today: TODAY });
    const forecast = forecastPlan({ ctx: ctxFor(db, promotion), plan });

    expect(forecast.bouts).toBeGreaterThan(0);
    expect(forecast.expectedAttendance).toBeGreaterThan(0);
    expect(forecast.purses).toBeGreaterThan(0);
    expect(forecast.bonusPool).toBeGreaterThan(0);
  });

  it('is worth less with a thinner card', () => {
    const db = game();
    const promotion = leader(db);
    const full = filledPlan({ db, promotion, day: CARD_DAY, today: TODAY });
    const thin = withSlot(
      { ...full, id: `${full.id}_thin` },
      'main',
      full.slots.find((s) => s.id === 'main')!.bout,
    );

    const emptied = thin.slots.reduce(
      (acc, slot) => (slot.position === 'prelim' ? withSlot(acc, slot.id, undefined) : acc),
      thin,
    );

    const ctx = ctxFor(db, promotion);
    expect(forecastPlan({ ctx, plan: emptied }).expectedAttendance).toBeLessThanOrEqual(
      forecastPlan({ ctx, plan: full }).expectedAttendance,
    );
  });
});

describe('running the night', () => {
  it('puts only agreed fights on the card', () => {
    /*
     * A draft nobody was offered and a bout somebody turned down are both *not fights*. Putting
     * them on anyway would make the entire offer system decorative.
     */
    const db = game();
    const promotion = leader(db);
    const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY, today: TODAY }));

    // One slot reverted to a draft: it must not reach the night.
    const draftSlot = plan.slots.find((s) => s.bout)!;
    const withDraft = savePlan(
      db,
      withSlot(plan, draftSlot.id, { ...draftSlot.bout!, status: 'draft' }),
    );

    const outcome = runPlan({ db, plan: withDraft })!;
    const onCard = outcome.night.bouts.flatMap((b) => [b.redId as string, b.blueId as string]);
    expect(onCard).not.toContain(draftSlot.bout!.redId as string);
    expect(outcome.night.bouts).toHaveLength(planProgress(withDraft).agreed);
  });

  it('runs, and everything that should move moves', () => {
    const db = game();
    const promotion = leader(db);
    const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY, today: TODAY }));
    const headline = plan.slots.find((s) => s.bout)!.bout!;
    const before = db.fighters.findById(headline.redId as string) as Fighter;

    const outcome = runPlan({ db, plan })!;

    expect(outcome.night.status).toBe('complete');
    expect(outcome.attendance).toBeGreaterThan(0);

    // The world's own bout runner, so a promoted card has exactly the same consequences as one
    // the world ran — records, suspensions, ageing, pay.
    const after = db.fighters.findById(before.id as string) as Fighter;
    expect(after.record.length).toBe(before.record.length + 1);
    expect(after.readyOnDay).toBeGreaterThan(CARD_DAY);
  });

  it('settles the night against the promotion that ran it', () => {
    const db = game();
    const promotion = leader(db);
    const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY, today: TODAY }));

    runPlan({ db, plan });

    const after = db.promotions.findById(promotion.id as string) as Promotion;
    expect(after.recentDelivery?.length).toBe(1);
  });

  it('takes the plan off the pipeline once it has happened', () => {
    const db = game();
    const promotion = leader(db);
    const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY, today: TODAY }));

    runPlan({ db, plan });
    expect(plansFor(db, promotion.id as string).map((p) => p.id)).not.toContain(plan.id);
  });

  it('headlines whatever draws most, wherever the player put it', () => {
    // Position falls out of who you booked. A promoter does not get to decide that the fight
    // everybody wants is the opener.
    const db = game();
    const promotion = leader(db);
    const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY, today: TODAY }));

    const outcome = runPlan({ db, plan })!;
    expect(outcome.night.bouts[0]!.position).toBe('mainEvent');
  });
});

describe('withdrawals', () => {
  it('empties the corner it happened in rather than scratching the whole card', () => {
    /*
     * The sport's defining operational emergency, and now it happens to a card that exists in
     * the save — so the player fixes it in the same matchmaking screen they built it with.
     */
    const db = game();
    const promotion = leader(db);

    let broken = 0;
    for (let i = 0; i < 8; i++) {
      const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY + i, today: TODAY }));
      const rolled = rollWithdrawals({ db, plan });
      broken += rolled.withdrawals.length;
      for (const withdrawal of rolled.withdrawals) {
        expect(rolled.plan.slots.find((s) => s.id === withdrawal.slotId)?.bout).toBeUndefined();
      }
    }

    expect(broken, 'across eight full cards nobody at all fell out').toBeGreaterThan(0);
  });

  it('gives the same answer twice, so a reload is not a second roll', () => {
    const db = game();
    const promotion = leader(db);
    const plan = agreed(db, filledPlan({ db, promotion, day: CARD_DAY, today: TODAY }));

    const first = rollWithdrawals({ db, plan }).withdrawals.map((w) => w.slotId);
    const second = rollWithdrawals({ db, plan }).withdrawals.map((w) => w.slotId);
    expect(second).toEqual(first);
  });
});

describe('the world leaves the player’s promotion alone', () => {
  it('runs no cards for it, and plenty for everybody else', () => {
    const db = game();
    const mine = smallest(db);

    advanceWorld(db, 2192, 2192 + 365, { promotionId: mine.id });

    const events = db.events.findAll() as readonly { promotionId: string }[];
    expect(events.filter((e) => e.promotionId === mine.id)).toHaveLength(0);
    expect(events.length).toBeGreaterThan(10);
  });

  it('still ages the player’s own roster', () => {
    // Excluded from *booking*, not from existing. A promotion whose fighters never got older
    // would be a museum.
    const db = game();
    const mine = smallest(db);
    const before = (db.fighters.findAll() as Fighter[]).filter((f) => f.promotionId === mine.id);
    const sample = before[0]!;

    advanceWorld(db, 2192, 2192 + 365 * 2, { promotionId: mine.id });

    const after = db.fighters.findById(sample.id as string) as Fighter;
    expect(after.condition.ringRust).toBeGreaterThanOrEqual(sample.condition.ringRust);
  });
});
