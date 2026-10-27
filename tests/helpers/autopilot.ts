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
  createPlan,
  forecastPlan,
  promoterContext,
  rollWithdrawals,
  runPlan,
  savePlan,
  sendAllDrafts,
  suggestFills,
} from '../../packages/app/src/game/plans';

export type AutopilotPolicy = 'sloppy' | 'sensible';

export interface CardLog {
  day: number;
  agreed: number;
  slots: number;
  /** What the forecast said before the date, with the card as booked. */
  forecast: number;
  /** What the empty card forecast when it was created. */
  emptyForecast: number;
  profit: number;
  attendance: number;
  buzz: number;
  cash: number;
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

  for (const suggestion of suggestFills({ ctx, plan, scope: 'all' })) {
    plan = applySuggestion(plan, suggestion);
  }
  plan = savePlan(db, sendAllDrafts({ ctx, plan: savePlan(db, plan) }).plan);

  if (policy === 'sloppy') {
    for (const slot of plan.slots) {
      if (slot.bout?.answers?.some((a) => a.verdict === 'countered')) {
        plan = savePlan(db, acceptCounter({ ctx, plan, slotId: slot.id }));
      }
    }
  } else {
    // Pay a counter only when the fight is worth its price: the card with it paid has to forecast
    // better than the card without it. Paying repapers the contract, so a refused one is put back.
    for (const slot of plan.slots) {
      if (!slot.bout?.answers?.some((a) => a.verdict === 'countered')) continue;
      const without = forecastPlan({
        ctx,
        plan: withSlot(plan, slot.id, undefined),
      }).projectedProfit;
      const papers = new Map(
        slot.bout.answers.map((a) => {
          const fighter = db.fighters.findById(a.fighterId as string) as Fighter | undefined;
          return [
            fighter?.agreementId as string,
            db.agreements.findById(fighter?.agreementId as string),
          ];
        }),
      );
      const paid = acceptCounter({ ctx, plan, slotId: slot.id });
      if (forecastPlan({ ctx, plan: paid }).projectedProfit > without) {
        plan = savePlan(db, paid);
      } else {
        for (const agreement of papers.values()) if (agreement) db.agreements.upsert(agreement);
      }
    }
    for (const slot of plan.slots) {
      if (slot.bout && slot.bout.status !== 'agreed') plan = withSlot(plan, slot.id, undefined);
    }
    for (const suggestion of suggestFills({ ctx, plan, scope: 'all' })) {
      plan = applySuggestion(plan, suggestion);
    }
    plan = savePlan(db, sendAllDrafts({ ctx, plan }).plan);
  }

  const forecast = forecastPlan({ ctx, plan }).projectedProfit;
  advance(db, plan.day);

  plan = savePlan(db, rollWithdrawals({ db, plan: db.plans.findById(plan.id) as EventPlan }).plan);
  const agreed = plan.slots.filter((s) => s.bout?.status === 'agreed').length;
  const ran = runPlan({ db, plan });
  const after = db.promotions.findById(promotionId) as unknown as Promotion;

  return {
    day: plan.day,
    agreed,
    slots: plan.slots.length,
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
  while (getWorld(db).day < end) {
    const card = runOneCard({ db, promotionId, policy });
    cards.push(card);
    onCard?.(card);
  }
  return cards;
}
