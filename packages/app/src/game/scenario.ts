/**
 * Starting scenarios for a promoter save. Doc 34 B6.
 *
 * The standard start hands over a regional promotion as the world made it. A scenario starts the
 * same promotion inside a problem, so the first year has a shape:
 *
 *  - **Bankrupt rescue** — the money is nearly gone and the audience has drifted. Survive.
 *  - **Upstart vs giant** — a smaller name than the books say, and the biggest promotion in the
 *    region coming for your fighters harder than anybody else's.
 *  - **Champion wants out** — your biggest-name champion is unhappy, near the end of their deal,
 *    and listening to offers.
 *
 * Applied once, on the day the player takes over, and recorded on the save with the difficulty
 * so the rest of the game can read it. Nothing here runs again afterwards; a scenario is a
 * starting position, not a rule.
 */

import {
  displayName,
  inboxId,
  type DivisionId,
  type Fighter,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import {
  getWorld,
  setWorld,
  type DifficultyLevel,
  type Entity,
  type GameDb,
  type PromoterSetup,
} from '@mmasim/data';
import { raise } from './inbox';

export type ScenarioId = PromoterSetup['scenario'];

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** What it is, in a sentence, for the start screen. */
  blurb: string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'standard',
    label: 'As it is',
    blurb: 'The promotion as the sport made it: its money, its roster, its problems.',
  },
  {
    id: 'bankruptRescue',
    label: 'Bankrupt rescue',
    blurb: 'The money is nearly gone and the audience has drifted. Keep the doors open.',
  },
  {
    id: 'upstart',
    label: 'Upstart vs giant',
    blurb:
      'A smaller name than the books say, and the biggest promotion around coming for your fighters.',
  },
  {
    id: 'championWantsOut',
    label: 'Champion wants out',
    blurb: 'Your biggest champion is unhappy, near the end of the deal, and listening to offers.',
  },
];

/** What a bankrupt promotion has left, as a share of what the world gave it. */
const RESCUE_CASH_SHARE = 0.06;
const RESCUE_BUZZ = 15;
/** How much smaller an upstart's name is than its books. */
const UPSTART_PRESTIGE_CUT = 8;
const UPSTART_BUZZ = 25;
/** How long the unhappy champion's deal has left. Inside the window rivals bid in. */
const WANTS_OUT_DAYS = 60;
const WANTS_OUT_RESENTMENT = 70;

const round1 = (n: number): number => Math.round(n * 10) / 10;

const levelUp = (level: DifficultyLevel): DifficultyLevel =>
  level === 'gentle' ? 'normal' : 'hard';

/** The champion a "wants out" scenario is about: the one with the biggest name. */
export function wantsOutChampion(db: GameDb, promotion: Promotion): Fighter | undefined {
  return Object.values(promotion.champions)
    .map((id) => (id ? (db.fighters.findById(id as string) as Fighter | undefined) : undefined))
    .filter((f): f is Fighter => f !== undefined && f.retiredDay === undefined)
    .sort((a, b) => b.starPower - a.starPower)[0];
}

/** Why a scenario cannot be played with this promotion, or undefined when it can. */
export function scenarioBlocker(
  db: GameDb,
  promotion: Promotion,
  scenario: ScenarioId,
): string | undefined {
  if (scenario === 'championWantsOut' && !wantsOutChampion(db, promotion)) {
    return 'This promotion has no champion to lose.';
  }
  return undefined;
}

/** The biggest promotion an upstart is up against: the most prestigious one, nearest first. */
function giantFor(db: GameDb, promotion: Promotion): Promotion | undefined {
  return (db.promotions.findAll() as unknown as Promotion[])
    .filter((p) => p.id !== promotion.id)
    .sort(
      (a, b) =>
        Number(b.baseCountry === promotion.baseCountry) -
          Number(a.baseCountry === promotion.baseCountry) || b.prestige - a.prestige,
    )[0];
}

/**
 * Set the save up: apply the scenario to the promotion the player has taken over, and record it
 * with the difficulty. Returns what was recorded.
 */
export function applyScenario(
  db: GameDb,
  promotionId: string,
  choice: Pick<PromoterSetup, 'scenario' | 'purseInflation' | 'rivalAggression' | 'ownerPatience'>,
): PromoterSetup {
  const promotion = db.promotions.findById(promotionId) as Promotion | undefined;
  const day = getWorld(db).day;
  let setup: PromoterSetup = { ...choice };
  if (!promotion || scenarioBlocker(db, promotion, choice.scenario)) {
    setup = { ...choice, scenario: 'standard' };
    setWorld(db, { promoterSetup: setup });
    return setup;
  }

  if (choice.scenario === 'bankruptRescue') {
    db.promotions.upsert({
      ...promotion,
      budget: round1(promotion.budget * RESCUE_CASH_SHARE),
      buzz: Math.min(promotion.buzz, RESCUE_BUZZ),
    } as Promotion & Entity);
    raise(db, {
      id: inboxId(day as never, 'scenario:rescue'),
      day: day as never,
      kind: 'money',
      priority: 'notable',
      title: `${promotion.shortName} is nearly broke`,
      body: 'The last owners spent it. There is enough for a card or two, and the audience has stopped expecting much. Run cheap, run often, and do not miss a date.',
      promotionId: promotion.id,
    });
  }

  if (choice.scenario === 'upstart') {
    const giant = giantFor(db, promotion);
    db.promotions.upsert({
      ...promotion,
      prestige: Math.max(10, promotion.prestige - UPSTART_PRESTIGE_CUT),
      buzz: Math.min(promotion.buzz, UPSTART_BUZZ),
    } as Promotion & Entity);
    // The giant is why rivals come harder: one step up the dial, whatever was chosen.
    setup = {
      ...setup,
      rivalId: giant?.id as string | undefined,
      rivalAggression: levelUp(choice.rivalAggression),
    };
    raise(db, {
      id: inboxId(day as never, 'scenario:upstart'),
      day: day as never,
      kind: 'roster',
      priority: 'notable',
      title: giant
        ? `${giant.shortName} has noticed you, and not kindly`
        : 'The big promotions have noticed you',
      body: 'Anybody you build will be offered more to leave the moment their deal runs down. Sign people long, and give them reasons to stay.',
      promotionId: promotion.id,
    });
  }

  if (choice.scenario === 'championWantsOut') {
    const champion = wantsOutChampion(db, promotion)!;
    const agreement = champion.agreementId
      ? (db.agreements.findById(champion.agreementId as string) as PromotionalAgreement | undefined)
      : undefined;
    if (agreement) {
      db.agreements.upsert({
        ...agreement,
        expiresDay: Math.min(agreement.expiresDay, day + WANTS_OUT_DAYS),
      } as PromotionalAgreement & Entity);
    }
    db.fighters.upsert({
      ...champion,
      resentment: Math.max(champion.resentment, WANTS_OUT_RESENTMENT),
    } as Fighter & Entity);
    const division = Object.entries(promotion.champions).find(
      ([, id]) => id === champion.id,
    )?.[0] as DivisionId | undefined;
    setup = { ...setup, championId: champion.id as string };
    raise(db, {
      id: inboxId(day as never, 'scenario:wantsout'),
      day: day as never,
      kind: 'contract',
      priority: 'decision',
      title: `${displayName(champion)} wants out`,
      body: `Your ${division ? 'champion' : 'star'} is unhappy, has ${WANTS_OUT_DAYS} days left on the deal, and rivals will be calling. Keep them, trade the belt for something, or let them walk.`,
      actions: [
        {
          id: 'acknowledge',
          label: 'Understood',
          detail: 'Deal with it yourself.',
          isDismiss: true,
        },
      ],
      link: { route: 'fighter', id: champion.id as string },
      fighterId: champion.id,
      promotionId: promotion.id,
    });
  }

  setWorld(db, { promoterSetup: setup });
  db.save();
  return setup;
}
