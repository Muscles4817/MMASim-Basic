/**
 * Rivals booking against the player's cards. Doc 34 B4.
 *
 * A promoter's dates used to belong to them alone: nobody in the sport ever ran a show the same
 * weekend in the same market, so a card's gate depended on the card and nothing else. Here, a
 * rival in the market who hears about a date — a month out, when it is announced — may book its
 * own card against it, chosen by posture (`counterProgrammingChance`). If it does, the rival runs
 * a show that day and the player's gate loses 20–35% of its walk-up (`counterSplit`).
 */

import {
  COUNTER_SPLIT_MAX,
  counterProgrammingChance,
  counterSplit,
  createRng,
  inboxId,
  newsId,
  postureOf,
  POSTURE_META,
  type EventPlan,
  type Promotion,
} from '@mmasim/engine';
import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import { isLive, planName, plansFor, savePlan } from './plans';
import { appendNews } from './world';
import { raise } from './inbox';

/** How far ahead a date is known to the rest of the sport. */
export const COUNTER_NOTICE_DAYS = 30;

/**
 * Let the rivals look at the player's dates that have come into view, once each. Run by the clock
 * each day. Returns how many cards were countered.
 */
export function considerCounterProgramming(db: GameDb, day: number): number {
  const world = getWorld(db);
  const promotionId = world.playerPromotionId;
  if (!promotionId) return 0;
  const mine = db.promotions.findById(promotionId) as Promotion | undefined;
  if (!mine) return 0;
  const rivals = (db.promotions.findAll() as unknown as Promotion[])
    .filter((p) => p.id !== promotionId)
    .sort((a, b) => b.prestige - a.prestige);

  let countered = 0;
  for (const plan of plansFor(db, promotionId)) {
    if (!isLive(plan) || plan.rivalsConsidered || plan.day - day > COUNTER_NOTICE_DAYS) continue;
    if (plan.day <= day) {
      savePlan(db, { ...plan, rivalsConsidered: true });
      continue;
    }
    const rival = rivals.find((r) =>
      createRng(`${world.seed}:counter:${plan.id}:${r.id}`).chance(
        counterProgrammingChance(r, mine, plan.country),
      ),
    );
    if (!rival) {
      savePlan(db, { ...plan, rivalsConsidered: true });
      continue;
    }
    const split = counterSplit(rival, mine, createRng(`${world.seed}:split:${plan.id}`));
    const next: EventPlan = {
      ...plan,
      rivalsConsidered: true,
      rivalCard: { promotionId: rival.id, split },
    };
    savePlan(db, next);
    setWorld(db, {
      rivalCards: [
        ...(getWorld(db).rivalCards ?? []).filter((c) => c.day >= day),
        { promotionId: rival.id as string, day: plan.day },
      ],
    });
    countered += 1;
    announce(db, next, rival, split, day);
  }
  return countered;
}

function announce(db: GameDb, plan: EventPlan, rival: Promotion, split: number, day: number) {
  const name = planName(db, plan);
  const posture = POSTURE_META[postureOf(rival)].label;
  appendNews(db, [
    {
      id: newsId(day as never, `counter:${plan.id}`),
      day: day as never,
      kind: 'rival',
      weight: 'normal',
      headline: `${rival.shortName} books a card against ${name} in ${plan.city}`,
      detail: `Same weekend, same market. ${rival.shortName} (${posture.toLowerCase()}) is going after the walk-up crowd.`,
      fighterIds: [],
      promotionId: rival.id,
    },
  ]);
  raise(db, {
    id: inboxId(day as never, `counter:${plan.id}`),
    day: day as never,
    kind: 'card',
    priority: 'notable',
    title: `${rival.shortName} is running a card against ${name}`,
    body: `Same weekend in ${plan.city}. Expect about ${Math.round(split * 100)}% of the walk-up crowd to go to them instead (the most any rival takes is ${Math.round(COUNTER_SPLIT_MAX * 100)}%). The answer is a card good enough to win the weekend anyway.`,
    link: { route: 'plan', id: plan.id },
    promotionId: rival.id,
  });
}
