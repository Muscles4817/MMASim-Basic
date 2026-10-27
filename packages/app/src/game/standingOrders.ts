/**
 * Standing orders: busywork a promoter hands off. Doc 34 B6.
 *
 * Two, chosen because they are the jobs that repeat every week without a decision in them:
 *
 *  - **The matchmaker owns the prelims.** From six weeks out, any empty prelim on a card is filled
 *    with the matchmaker's suggestion and offered. The main card stays the promoter's. Drafts the
 *    promoter pencilled into the prelims themselves are sent, not replaced.
 *  - **Auto-renew.** As a fighter's deal runs into its last two months, re-sign them at the going
 *    rate — the best rival bid when somebody is bidding, their market terms when nobody is — if
 *    they are in the group the order covers: champions, fighters on a run, or everybody. A fighter
 *    who does not want to stay is not re-signed by an order; the promoter is told instead.
 *
 * Run by the clock each day. Every action is a normal one — `sendOffer`, `sign` — so an order can
 * do nothing a player could not have done by hand, and the answers come back the usual way.
 */

import {
  defaultTerms,
  displayName,
  inboxId,
  relationshipWith,
  type Fighter,
  type OfferTerms,
  type Promotion,
  type PromotionalAgreement,
} from '@mmasim/engine';
import { getWorld, type GameDb, type StandingOrders } from '@mmasim/data';
import {
  applySuggestion,
  plansFor,
  promoterContext,
  savePlan,
  sendOffer,
  suggestFills,
} from './plans';
import { rivalBidsFor, sign } from './contracts';
import { raise } from './inbox';

/** How far out the matchmaker takes over the prelims. */
export const PRELIMS_FROM_DAYS = 42;

/** How long before a deal ends an auto-renew order acts. */
export const RENEW_WITHIN_DAYS = 60;

export const AUTO_RENEW_OPTIONS: readonly {
  id: NonNullable<StandingOrders['autoRenew']>;
  label: string;
}[] = [
  { id: 'off', label: 'Nobody' },
  { id: 'champions', label: 'Champions' },
  { id: 'winners', label: 'On a run' },
  { id: 'everyone', label: 'Everybody' },
];

/** Run whatever orders are standing, for today. */
export function runStandingOrders(db: GameDb, day: number): void {
  const world = getWorld(db);
  const orders = world.standingOrders;
  if (!orders || world.playerRole !== 'promoter' || !world.playerPromotionId) return;
  const promotion = db.promotions.findById(world.playerPromotionId) as Promotion | undefined;
  if (!promotion) return;

  if (orders.matchmakerOwnsPrelims) fillPrelims(db, promotion, day);
  if (orders.autoRenew && orders.autoRenew !== 'off') renew(db, promotion, day, orders.autoRenew);
}

/** Fill and offer the prelims of every card inside the window. */
export function fillPrelims(db: GameDb, promotion: Promotion, day: number): number {
  let offered = 0;
  for (const card of plansFor(db, promotion.id as string)) {
    const away = card.day - day;
    if (away <= 1 || away > PRELIMS_FROM_DAYS) continue;

    const ctx = promoterContext({ db, promotion, day });
    let plan = card;
    for (const suggestion of suggestFills({ ctx, plan, scope: 'prelims' })) {
      plan = applySuggestion(plan, suggestion);
    }
    for (const slot of plan.slots) {
      if (slot.position !== 'prelim' || slot.bout?.status !== 'draft') continue;
      const sent = sendOffer({ ctx, plan, slotId: slot.id });
      if (!sent) continue;
      plan = sent.plan;
      offered += 1;
    }
    if (plan !== card) savePlan(db, plan);
  }
  return offered;
}

/** Whether the order covers this fighter. */
function covered(
  rule: NonNullable<StandingOrders['autoRenew']>,
  fighter: Fighter,
  promotion: Promotion,
): boolean {
  if (rule === 'everyone') return true;
  const champion = Object.values(promotion.champions).includes(fighter.id);
  if (rule === 'champions') return champion;
  return champion || fighter.summary.streak >= 2;
}

/** The going rate: the best bid a rival has made that the promotion can match, else market terms. */
function goingRate(db: GameDb, fighter: Fighter, promotion: Promotion): OfferTerms {
  const bids = rivalBidsFor(db, fighter, promotion).filter((b) => b.matchable);
  const best = bids.sort(
    (a, b) => b.terms.showPurse + b.terms.winBonus - (a.terms.showPurse + a.terms.winBonus),
  )[0];
  if (best) return best.terms;
  const base = defaultTerms(fighter, promotion);
  return {
    showPurse: base.showPurse,
    winBonus: base.winBonus,
    signingBonus: 0,
    revenuePoints: 0,
    fightsOwed: 3,
    championshipExtension:
      promotion.tier === 'global' || promotion.tier === 'major' ? 'standard' : 'none',
    matchingRights: false,
    exclusive: promotion.tier !== 'regional' && promotion.tier !== 'developmental',
    outsideBouts: promotion.tier === 'regional' || promotion.tier === 'developmental' ? 2 : 0,
  };
}

/** A fighter who wants out is not kept by an order. */
const RESENTFUL = 55;
const SOURED = -20;

/** Re-sign whoever the order covers, as their deal enters its last two months. */
export function renew(
  db: GameDb,
  promotion: Promotion,
  day: number,
  rule: NonNullable<StandingOrders['autoRenew']>,
): string[] {
  const renewed: string[] = [];
  for (const fighter of db.fighters.findAll() as Fighter[]) {
    if (fighter.promotionId !== promotion.id || fighter.retiredDay !== undefined) continue;
    const agreement = fighter.agreementId
      ? (db.agreements.findById(fighter.agreementId as string) as PromotionalAgreement | undefined)
      : undefined;
    if (!agreement) continue;
    const left = agreement.expiresDay - day;
    if (left <= 0 || left > RENEW_WITHIN_DAYS) continue;
    if (!covered(rule, fighter, promotion)) continue;

    const unwilling =
      fighter.resentment > RESENTFUL ||
      relationshipWith(fighter, promotion.id, day as never).score < SOURED;
    if (unwilling) {
      raise(db, {
        id: inboxId(day as never, `renew:refused:${fighter.id as string}:${agreement.expiresDay}`),
        day: day as never,
        kind: 'contract',
        priority: 'notable',
        title: `${displayName(fighter)} will not be re-signed by standing order`,
        body: `${left} days left on the deal, and they do not want to stay on the same terms. This one needs you.`,
        link: { route: 'fighter', id: fighter.id as string },
        fighterId: fighter.id,
        promotionId: promotion.id,
      });
      continue;
    }

    const terms = goingRate(db, fighter, promotion);
    const result = sign(db, fighter, promotion, terms);
    if (!result.ok) continue;
    renewed.push(fighter.id as string);
    raise(db, {
      id: inboxId(day as never, `renew:${fighter.id as string}`),
      day: day as never,
      kind: 'contract',
      priority: 'routine',
      title: `${displayName(fighter)} re-signed by standing order`,
      body: `${terms.fightsOwed} fights at the going rate, before the old deal ran out.`,
      link: { route: 'fighter', id: fighter.id as string },
      fighterId: fighter.id,
      promotionId: promotion.id,
    });
  }
  return renewed;
}
