/**
 * Fight week: the run-up to the player's own card. Doc 34 A5.
 *
 * Until now nothing happened between signing a card and running it. A fighter who was going to
 * fall out fell out on the night, in a modal, when nothing could be done but run a shorter card;
 * and the week of a show — the press, the build, the noise — did not exist at all. This is that
 * week, and the month before it:
 *
 *  - **Withdrawals in the run-up.** Each signed fighter's whole-camp pull-out risk is spread over
 *    the last `RUN_UP_DAYS`, rolled day by day as the clock passes, seeded so a reload brings the
 *    same news. A withdrawal empties the bout, leaves the opponent waiting, and stops the clock
 *    until the player has seen it — there is still time to find somebody.
 *  - **The short-notice market.** Replacements for the corner left waiting, offered inside fight
 *    week through C4's answer-on-the-spot path (`sendOffer`), so a phone call gets an answer.
 *  - **The press conference.** In the last `FIGHT_WEEK_DAYS`, once per card: keep it civil, talk
 *    trash, or stage a confrontation. More heat between the main event's corners — which the
 *    draw reads — and more buzz, against the chance of a scuffle and a commission fine. The
 *    fighters' words come from C3's `voiceFor`, in their own register.
 *
 * Two parts wait on work not merged yet, and have seams here rather than stand-ins:
 *  - marketing spend per card is B1's `marketingUplift` (#56);
 *  - the weigh-in is C6's (`PlannedBout.weighIn`, `resolveMissedWeight`), shown by
 *    `screens/FightWeekPanel.tsx`'s `WeighInPanel` once it lands.
 */

import {
  createRng,
  inboxId,
  currentHeat,
  describePullOut,
  displayName,
  newsId,
  pullOutRisk,
  stokeHeat,
  voiceFor,
  withSlot,
  type EventPlan,
  type Fighter,
  type PlanSlot,
  type PressChoice,
  type PressConference,
  type Promotion,
  type RunUpWithdrawal,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { appendNews } from './world';
import { getRivalry } from './rivalries';
import { raiseDecisions, type Alert } from './alerts';
import { raise, readInbox } from './inbox';
import { FIGHT_WEEK_DAYS, isLive, planById, planName, plansFor, savePlan } from './plans';

/** How long before a card its signed fighters can still fall out. A camp's last month. */
export const RUN_UP_DAYS = 28;

// --- Withdrawals in the run-up ------------------------------------------------------------------

/**
 * The chance a fighter falls out on any one day of the run-up.
 *
 * `pullOutRisk` is the chance across a whole camp. Spread evenly over the run-up, so a fighter
 * who would have pulled out one time in sixteen on the night still does, only now on a day the
 * promoter can do something about it.
 */
export const dailyPullOutRisk = (fighter: Fighter): number =>
  1 - Math.pow(1 - pullOutRisk(fighter), 1 / RUN_UP_DAYS);

const REASONS = ['injury', 'illness', 'weight', 'personal'] as const;

/**
 * Roll today's withdrawals on every live card of the player's in its run-up.
 *
 * Seeded on the world, the card, the slot, the fighter and the day, so the same day always brings
 * the same news. Fight night itself is not rolled: whoever is still in on the morning of the show
 * fights. Returns what happened, after writing it to the card, the news and the inbox.
 */
export function rollRunUp(db: GameDb, day: number): RunUpWithdrawal[] {
  const world = getWorld(db);
  if (world.playerRole !== 'promoter' || !world.playerPromotionId) return [];

  const out: RunUpWithdrawal[] = [];
  for (const plan of plansFor(db, world.playerPromotionId)) {
    const away = plan.day - day;
    if (away <= 0 || away > RUN_UP_DAYS) continue;

    let next = plan;
    const fresh: RunUpWithdrawal[] = [];
    for (const slot of plan.slots) {
      const bout = slot.bout;
      if (bout?.status !== 'agreed') continue;
      /*
       * Weighed in: past the point of falling out. Weigh-ins are read two days out (doc 34 C6), and
       * a withdrawal after the scales would leave a catchweight decision pointing at an empty slot.
       */
      if (bout.weighIn) continue;

      for (const id of [bout.redId, bout.blueId]) {
        const fighter = db.fighters.findById(id as string) as Fighter | undefined;
        if (!fighter) continue;
        const rng = createRng(`${world.seed}:runup:${plan.id}:${slot.id}:${id}:${day}`);
        if (!rng.chance(dailyPullOutRisk(fighter))) continue;

        const reason = rng.pickWeighted(REASONS, (r) =>
          r === 'injury' ? 6 : r === 'illness' ? 2 : r === 'weight' ? 2 : 1,
        );
        fresh.push({
          day: day as never,
          slotId: slot.id,
          fighterId: fighter.id,
          opponentId: id === bout.redId ? bout.blueId : bout.redId,
          divisionId: bout.divisionId,
          note: describePullOut(reason, fighter),
        });
        // The bout comes off, not the card. One withdrawal per bout: the fight is already off.
        next = withSlot(next, slot.id, undefined);
        break;
      }
    }
    if (fresh.length === 0) continue;

    next = {
      ...next,
      fightWeek: {
        ...next.fightWeek,
        withdrawals: [...(next.fightWeek?.withdrawals ?? []), ...fresh],
      },
    };
    savePlan(db, next);
    tellOf(db, next, fresh, day);
    out.push(...fresh);
  }
  return out;
}

/** The news line and the clock-stopping decision for a card's withdrawals. */
function tellOf(db: GameDb, plan: EventPlan, fresh: readonly RunUpWithdrawal[], day: number): void {
  const name = planName(db, plan);
  const away = plan.day - day;
  const nameOf = (id: string) => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : 'Somebody';
  };

  appendNews(
    db,
    fresh.map((w) => ({
      id: newsId(day as never, `runup:${plan.id}:${w.slotId}`),
      day: day as never,
      kind: 'cancellation' as const,
      weight: 'minor' as const,
      headline: `${nameOf(w.fighterId as string)} is off ${name}`,
      detail: `${w.note} ${nameOf(w.opponentId as string)} is still on the card and needs an opponent.`,
      fighterIds: [w.fighterId, w.opponentId],
      promotionId: plan.promotionId,
      involvesPlayer: true,
    })),
  );

  // A decision: there is still time to find somebody, and every day spent not knowing is a day of
  // the replacement's camp gone. Settled once the slot is filled again (`alertStillTrue`).
  raiseDecisions(
    db,
    day,
    fresh.map((w): Alert => ({
      key: `withdrawal:${plan.id}:${w.slotId}:${w.fighterId as string}`,
      kind: 'card',
      title: `${nameOf(w.fighterId as string)} has pulled out of ${name}, ${away} days out`,
      body: `${w.note} ${nameOf(w.opponentId as string)} needs a replacement, or the bout comes off the card.`,
      link: { route: 'plan', id: plan.id, slot: w.slotId },
      fighterId: w.fighterId,
      promotionId: plan.promotionId,
    })),
    {
      kind: 'withdrawal',
      title: (n) => `${n} fighters have pulled out of ${name}`,
      body: `${away} days out. Their opponents are still on the card and need replacements.`,
    },
  );
}

/** The run-up withdrawals on a card whose slot is still empty: what the replacement market is for. */
export function openWithdrawals(plan: EventPlan): RunUpWithdrawal[] {
  return (plan.fightWeek?.withdrawals ?? []).filter(
    (w) => !plan.slots.find((s) => s.id === w.slotId)?.bout,
  );
}

// --- The press conference ---------------------------------------------------------------------

export interface PressOption {
  id: PressChoice;
  label: string;
  /** What it does and what it risks, in a sentence. */
  blurb: string;
}

export const PRESS_OPTIONS: readonly PressOption[] = [
  {
    id: 'civil',
    label: 'Keep it civil',
    blurb: 'A little coverage, no heat, no risk.',
  },
  {
    id: 'trashTalk',
    label: 'Let them talk',
    blurb: 'Real heat and more coverage. A small chance the commission fines somebody.',
  },
  {
    id: 'confrontation',
    label: 'Stage a face-off',
    blurb: 'The most heat and the most coverage, and a real chance it turns into a scuffle.',
  },
];

/** The chance each choice ends in a scuffle, and the fine range when it does (thousands). */
const PRESS_RISK: Readonly<Record<PressChoice, { scuffle: number; fine: [number, number] }>> = {
  civil: { scuffle: 0, fine: [0, 0] },
  trashTalk: { scuffle: 0.12, fine: [1, 3] },
  confrontation: { scuffle: 0.4, fine: [3, 8] },
};

/** Buzz from the coverage, before a scuffle adds its own. */
const PRESS_BUZZ: Readonly<Record<PressChoice, number>> = {
  civil: 1,
  trashTalk: 2,
  confrontation: 3,
};

/** The main event's slot, signed — the bout a press conference is about. */
const mainEventOf = (plan: EventPlan): PlanSlot | undefined =>
  plan.slots.find((s) => s.position === 'mainEvent' && s.bout?.status === 'agreed');

/**
 * Whether the card's press conference can be held today, and why not when it cannot.
 * Undefined means it can.
 */
export function pressBlocker(plan: EventPlan, day: number): string | undefined {
  if (!isLive(plan)) return 'This card is not going ahead.';
  if (plan.fightWeek?.press) return 'The press conference has been held.';
  const away = plan.day - day;
  if (away > FIGHT_WEEK_DAYS)
    return `It is held in fight week, ${away - FIGHT_WEEK_DAYS} days from now.`;
  if (away < 1) return 'It is fight night. The time for talking is over.';
  if (!mainEventOf(plan))
    return 'Nobody is signed for the main event to put in front of the press.';
  return undefined;
}

/**
 * Hold the press conference, once, the way the promoter chose to play it.
 *
 * The heat goes onto the main event's rivalry — the instigator is the brasher of the two, who
 * would have started it — where the draw and the build-up both read it. A scuffle costs a fine the
 * promotion pays and buys a little more coverage; nobody is hurt, because a press conference that
 * could injure a fighter would be a second withdrawal roll with a worse name.
 */
export function holdPressConference(
  db: GameDb,
  planId: string,
  choice: PressChoice,
): PressConference | undefined {
  const plan = planById(db, planId);
  const day = getWorld(db).day;
  if (!plan || pressBlocker(plan, day) !== undefined) return undefined;
  const bout = mainEventOf(plan)!.bout!;
  const red = db.fighters.findById(bout.redId as string) as Fighter | undefined;
  const blue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;
  if (!red || !blue) return undefined;

  const rng = createRng(`${getWorld(db).seed}:press:${plan.id}`);
  const situation =
    choice === 'civil'
      ? 'pressCivil'
      : choice === 'trashTalk'
        ? 'pressTrashTalk'
        : 'pressConfrontation';
  const first = voiceFor(red, situation, day as never);
  const second = voiceFor(blue, situation, day as never, first.quote);

  // The heat. Civil adds none; talking adds a round of trash talk; a face-off adds a callout on
  // top, with the louder of the two as the one who started it.
  const instigator =
    red.personality.ego + red.personality.charisma >=
    blue.personality.ego + blue.personality.charisma
      ? red
      : blue;
  const before = getRivalry(db, red.id, blue.id, day);
  let rivalry = before;
  const sources =
    choice === 'civil'
      ? []
      : choice === 'trashTalk'
        ? (['trashTalk'] as const)
        : (['trashTalk', 'callout'] as const);
  for (const source of sources) {
    rivalry = stokeHeat({
      rivalry,
      source,
      day: day as never,
      instigator,
      beat: source === 'trashTalk' ? `Press conference before ${planName(db, plan)}` : undefined,
      rng: rng.fork(source),
    });
  }
  if (rivalry !== before) {
    db.rivalries.upsert({ ...rivalry, id: rivalry.id as string } as never);
  }
  const heatGained = Math.round(
    currentHeat(rivalry, day as never) - currentHeat(before, day as never),
  );

  const risk = PRESS_RISK[choice];
  const scuffle = risk.scuffle > 0 && rng.fork('scuffle').chance(risk.scuffle);
  const fine = scuffle
    ? Math.round(rng.fork('fine').range(risk.fine[0], risk.fine[1]) * 10) / 10
    : 0;
  const buzzDelta = PRESS_BUZZ[choice] + (scuffle ? 1 : 0);

  const promotion = db.promotions.findById(plan.promotionId as string) as Promotion | undefined;
  if (promotion) {
    db.promotions.upsert({
      ...promotion,
      buzz: Math.min(100, promotion.buzz + buzzDelta),
      budget: Math.round((promotion.budget - fine) * 10) / 10,
    } as Promotion & Entity);
  }

  const press: PressConference = {
    day: day as never,
    choice,
    lines: [first.text, second.text],
    heatGained,
    buzzDelta,
    scuffle,
    fine,
  };
  savePlan(db, { ...plan, fightWeek: { ...plan.fightWeek, press } });

  const name = planName(db, plan);
  appendNews(db, [
    {
      id: newsId(day as never, `press:${plan.id}`),
      day: day as never,
      kind: 'voice',
      weight: scuffle ? 'major' : 'minor',
      headline: scuffle
        ? `Scuffle at the ${name} press conference`
        : `${displayName(red)} and ${displayName(blue)} face the press`,
      detail: `${first.text} ${second.text}`,
      fighterIds: [red.id, blue.id],
      promotionId: plan.promotionId,
      involvesPlayer: true,
    },
  ]);
  db.save();
  return press;
}

/**
 * Fight week, as the clock passes a day: the run-up's withdrawals, and the press conference put
 * in front of the player once a card enters its last week. Called by `advanceTo` each day.
 */
export function scanFightWeek(db: GameDb, day: number): void {
  rollRunUp(db, day);

  const world = getWorld(db);
  if (world.playerRole !== 'promoter' || !world.playerPromotionId) return;
  for (const plan of plansFor(db, world.playerPromotionId)) {
    if (pressBlocker(plan, day) !== undefined) continue;
    // Worth knowing, not a stop: a card whose press conference is never held simply goes without
    // the build-up, which is its own cost. Keyed on the card, so it is raised once.
    if (readInbox(db).some((i) => i.id.endsWith(`_press:${plan.id}`))) continue;
    raise(db, {
      id: inboxId(day as never, `press:${plan.id}`),
      day: day as never,
      kind: 'card',
      priority: 'notable',
      title: `Fight week for ${planName(db, plan)}: hold the press conference`,
      body: 'Keep it civil, let them talk, or stage a face-off. More heat sells more tickets, and costs more when it goes wrong.',
      link: { route: 'plan', id: plan.id },
      promotionId: plan.promotionId,
    });
  }
}
