/**
 * Building a card, for tests that need one and are not about building one.
 *
 * Several suites want *a card that exists* so they can assert something else — that the clock
 * moves past it, that the calendar classifies it, that somebody withdraws from it. Before the
 * planning rework they reached for `autoFill` + `scheduleCard`, which produced a finished
 * `FightNight` in one call. A card is a plan now, filled over time, so the equivalent is two
 * steps: ask the matchmaker for suggestions, and write them in.
 *
 * `agreed` exists because acceptance is stochastic and most of these tests are not about
 * acceptance. A test that needs a runnable card and rolls the dice on nine offers is testing the
 * offer system by accident, and failing on it is a false alarm.
 */

import type { GameDb } from '@mmasim/data';
import type { EventPlan, EventScale, Promotion } from '@mmasim/engine';
import { withSlot } from '@mmasim/engine';
import {
  applySuggestion,
  createPlan,
  promoterContext,
  savePlan,
  suggestFills,
} from '../../packages/app/src/game/plans';

/** A card on `day` with the matchmaker's best suggestion pencilled into every slot. */
export function filledPlan(input: {
  db: GameDb;
  promotion: Promotion;
  day: number;
  scale?: EventScale;
  /** The world day the matchmaking is being done on. Defaults to the card being far out. */
  today?: number;
}): EventPlan {
  const { db, promotion, day, scale = 'standard', today } = input;
  const ctx = promoterContext({ db, promotion, day: today ?? Math.max(0, day - 60) });

  let plan = createPlan({ db, promotion, day, scale });
  for (const suggestion of suggestFills({ ctx, plan, scope: 'all' })) {
    plan = applySuggestion(plan, suggestion);
  }
  return savePlan(db, plan);
}

/** The same card with every bout signed, for tests that are not about whether anybody says yes. */
export function agreed(db: GameDb, plan: EventPlan): EventPlan {
  let next = plan;
  for (const slot of plan.slots) {
    if (!slot.bout) continue;
    next = withSlot(next, slot.id, { ...slot.bout, status: 'agreed' });
  }
  return savePlan(db, next);
}
