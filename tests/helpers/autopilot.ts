/**
 * A promoter on autopilot, for measuring the economy rather than playing it.
 *
 * Runs the player's promotion the way a player who is not paying attention would: a card every
 * eight weeks, filled by the matchmaker, every offer sent, the date run when it comes round, and
 * every inbox item waved through. The two policies differ in one decision, the one the audit found
 * the sloppy player making every time:
 *
 *  - `sloppy` pays every counter-offer, which reprices the fighter's contract for good.
 *  - `sensible` pays a counter only when the card forecasts better with that fight paid than
 *    without it, then refills whatever is still open from the matchmaker once and asks again.
 *
 * Shared by `tests/long-sim/promoter-economy.test.ts`, which pins the result, and by
 * `tools/economy-autopilot.ts`, which prints it.
 */

import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import {
  withSlot,
  type EventPlan,
  type EventScale,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { advanceTo } from '../../packages/app/src/game/clock';
import { resolveItem } from '../../packages/app/src/game/inbox';
import {
  acceptCounter,
  applySuggestion,
  cancelPlan,
  createPlan,
  forecastPlan,
  promoterContext,
  runPlan,
  savePlan,
  sendAllDrafts,
  suggestFills,
} from '../../packages/app/src/game/plans';

/** `idle` runs no cards at all: the baseline any way of running the promotion has to beat. */
export type AutopilotPolicy = 'sloppy' | 'sensible' | 'idle';

export interface CardLog {
  day: number;
  agreed: number;
  slots: number;
  /** Fights that came back with a counter-offer, and how many of those the policy paid. */
  countered: number;
  paid: number;
  /** What the forecast said before the date, with the card as booked. */
  forecast: number;
  /** What the empty card forecast when it was created. */
  emptyForecast: number;
  profit: number;
  attendance: number;
  buzz: number;
  cash: number;
  /** Called off before the night because it forecast a loss. */
  cancelled?: boolean;
}

const promotions = (db: GameDb) => db.promotions.findAll() as unknown as Promotion[];

/** Hand the player the strongest regional promotion in the world, as the picker would. */
export function takeTopRegional(db: GameDb): Promotion {
  const promotion = promotions(db)
    .filter((p) => p.tier === 'regional')
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, {
    playerRole: 'promoter',
    playerPromotionId: promotion.id as string,
    playerFighterId: undefined,
  });
  return promotion;
}

/** Move the clock to `target`, answering anything that stops it with its last action. */
function advance(db: GameDb, target: number): void {
  for (let guard = 0; getWorld(db).day < target && guard < 200; guard++) {
    const result = advanceTo(db, target);
    for (const item of result.waiting) {
      resolveItem(db, item.id, item.actions?.[item.actions.length - 1]?.id ?? 'dismiss');
    }
    if (result.fightNight) break;
  }
}

/** Long enough for every corner to have answered an offer. */
const REPLY_WAIT = 8;
/** A sensible promoter stops offering fights this close to the night. */
const LAST_ROUND_DAYS = 14;
/** And stops after this many rounds of offers, however far out the card is. */
const MAX_ROUNDS = 5;

/** Move the clock on until the replies are in, and read the card back. */
function awaitReplies(db: GameDb, plan: EventPlan, until: number): EventPlan {
  advance(db, until);
  return db.plans.findById(plan.id) as EventPlan;
}

/**
 * The matchmaker's suggestions, keeping only the fights that add to what the card forecasts.
 *
 * Every slot filled is not every slot worth filling: past five or six fights the gate and the
 * broadcast barely move, and a ninth fight's purses can cost more than it brings in. The
 * matchmaker fills the card; a promoter paying attention keeps the fights that pay their way.
 */
function fillWorthwhile(
  ctx: ReturnType<typeof promoterContext>,
  plan: EventPlan,
  exclude?: ReadonlySet<string>,
): EventPlan {
  let card = plan;
  for (const suggestion of suggestFills({ ctx, plan, scope: 'all', exclude })) {
    const withIt = applySuggestion(card, suggestion);
    if (
      forecastPlan({ ctx, plan: withIt }).projectedProfit >
      forecastPlan({ ctx, plan: card }).projectedProfit
    ) {
      card = withIt;
    }
  }
  return card;
}

/** One card, from an empty date to the night. */
export function runOneCard(input: {
  db: GameDb;
  promotionId: string;
  policy: AutopilotPolicy;
  /** Days ahead the card is dated. */
  gap?: number;
  scale?: EventScale;
}): CardLog {
  const { db, promotionId, policy, gap = 56, scale = 'standard' } = input;
  const day = getWorld(db).day;
  const promotion = db.promotions.findById(promotionId) as unknown as Promotion;
  const ctx = promoterContext({ db, promotion, day });

  let plan: EventPlan = createPlan({ db, promotion, day: day + gap, scale });
  const emptyForecast = forecastPlan({ ctx, plan }).projectedProfit;

  if (policy === 'sensible') {
    plan = fillWorthwhile(ctx, plan);
  } else {
    for (const suggestion of suggestFills({ ctx, plan, scope: 'all' })) {
      plan = applySuggestion(plan, suggestion);
    }
  }
  plan = savePlan(db, sendAllDrafts({ ctx, plan: savePlan(db, plan) }).plan);
  // Answers come back over a few days (doc 34's C4), so wait for them before deciding anything.
  plan = awaitReplies(db, plan, day + REPLY_WAIT);
  const countered = plan.slots.filter((s) =>
    s.bout?.answers?.some((a) => a.verdict === 'countered'),
  ).length;
  let paid = 0;

  if (policy === 'sloppy') {
    for (const slot of plan.slots) {
      if (slot.bout?.answers?.some((a) => a.verdict === 'countered')) {
        plan = savePlan(db, acceptCounter({ ctx, plan, slotId: slot.id }));
        paid++;
      }
    }
  } else {
    /*
     * Pay a counter only when the fight is worth its price: the card with it paid has to forecast
     * better than the card without it. Paying repapers the contract, so a refused one is put back.
     *
     * Against the card as signed, not as offered. A forecast counts every fight still out for an
     * answer as if it will happen, and on a nine-fight card the ninth adds little to the gate, so
     * against that card every counter looked like a loss and a sensible promoter turned all of them
     * down. What a fight is worth is what it adds to the fights actually agreed.
     *
     * Then whatever is still open is refilled from the matchmaker and offered again, round after
     * round, until the card is full or a fortnight out. One refill left a sensible promoter
     * running two-fight cards whenever the second round came back declined.
     */
    const signedOnly = (p: EventPlan): EventPlan =>
      p.slots.reduce(
        (card, s) =>
          s.bout && s.bout.status !== 'agreed' ? withSlot(card, s.id, undefined) : card,
        p,
      );
    const refused = new Set<string>();
    for (let round = 1; ; round++) {
      const now = promoterContext({
        db,
        promotion: db.promotions.findById(promotionId) as unknown as Promotion,
        day: getWorld(db).day,
      });
      for (const slot of plan.slots) {
        if (!slot.bout?.answers?.some((a) => a.verdict === 'countered')) continue;
        const without = forecastPlan({ ctx: now, plan: signedOnly(plan) }).projectedProfit;
        const papers = new Map(
          slot.bout.answers.map((a) => {
            const fighter = db.fighters.findById(a.fighterId as string) as Fighter | undefined;
            return [
              fighter?.agreementId as string,
              db.agreements.findById(fighter?.agreementId as string),
            ];
          }),
        );
        const paidPlan = acceptCounter({ ctx: now, plan, slotId: slot.id });
        if (forecastPlan({ ctx: now, plan: signedOnly(paidPlan) }).projectedProfit > without) {
          plan = savePlan(db, paidPlan);
          paid++;
        } else {
          for (const agreement of papers.values()) if (agreement) db.agreements.upsert(agreement);
        }
      }
      // Whoever said no, or asked more than the fight was worth, is not asked again for this card.
      for (const slot of plan.slots) {
        if (slot.bout?.status === 'agreed') continue;
        for (const a of slot.bout?.answers ?? []) {
          if (a.verdict === 'declined' || a.verdict === 'countered')
            refused.add(a.fighterId as string);
        }
      }
      plan = savePlan(db, signedOnly(plan));
      const full = plan.slots.every((s) => s.bout?.status === 'agreed');
      const nextAnswers = getWorld(db).day + REPLY_WAIT;
      if (full || nextAnswers > plan.day - LAST_ROUND_DAYS || round >= MAX_ROUNDS) break;

      plan = savePlan(
        db,
        sendAllDrafts({ ctx: now, plan: fillWorthwhile(now, plan, refused) }).plan,
      );
      plan = awaitReplies(db, plan, nextAnswers);
    }
  }

  const forecast = forecastPlan({
    ctx: promoterContext({
      db,
      promotion: db.promotions.findById(promotionId) as unknown as Promotion,
      day: getWorld(db).day,
    }),
    plan,
  }).projectedProfit;

  /*
   * A card that is going to lose money is called off, a fortnight out, rather than run: what a
   * promoter who looked at the forecast would do. Calling it off costs attention; running it
   * costs the room, the crew and the purses for a night nobody is coming to.
   */
  const called = policy === 'sensible' && forecast < 0;
  if (called) cancelPlan(db, plan.id as string);
  advance(db, plan.day);
  if (called) {
    const after = db.promotions.findById(promotionId) as unknown as Promotion;
    return {
      day: plan.day,
      agreed: 0,
      slots: plan.slots.length,
      countered,
      paid,
      forecast,
      emptyForecast,
      profit: 0,
      attendance: 0,
      buzz: after.buzz,
      cash: after.budget,
      cancelled: true,
    };
  }

  // As it stands on the night: withdrawals have already rolled during fight week (doc 34 A5).
  plan = db.plans.findById(plan.id) as EventPlan;
  const agreed = plan.slots.filter((s) => s.bout?.status === 'agreed').length;
  const ran = runPlan({ db, plan });
  const after = db.promotions.findById(promotionId) as unknown as Promotion;

  return {
    day: plan.day,
    agreed,
    slots: plan.slots.length,
    countered,
    paid,
    forecast,
    emptyForecast,
    profit: ran?.profit ?? 0,
    attendance: ran?.attendance ?? 0,
    buzz: after.buzz,
    cash: after.budget,
  };
}

/** Run cards back to back until `days` have passed. */
export function runAutopilot(input: {
  db: GameDb;
  promotionId: string;
  policy: AutopilotPolicy;
  days: number;
  onCard?: (card: CardLog) => void;
}): CardLog[] {
  const { db, promotionId, policy, days, onCard } = input;
  const end = getWorld(db).day + days;
  const cards: CardLog[] = [];
  if (policy === 'idle') {
    advance(db, end);
    return cards;
  }
  while (getWorld(db).day < end) {
    const card = runOneCard({ db, promotionId, policy });
    cards.push(card);
    onCard?.(card);
  }
  return cards;
}
