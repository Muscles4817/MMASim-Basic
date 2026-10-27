/**
 * Rivals poaching champions. Doc 34 B4.
 *
 * A champion could never leave: free agency skips anybody holding a belt, which is doc 16's
 * championship clause and right as far as it goes. But the sport's biggest moves are exactly the
 * ones that clause does not stop — a rival with money buys the champion out of the deal. This is
 * that: an aggressor with the budget makes a release-clause offer (`poachOffer`), the champion
 * decides whether they want to go, and the incumbent decides whether to take the money. When the
 * incumbent is the player, that last decision is theirs, in the inbox.
 *
 * The belt is not handled here: a champion who has left is vacated by the world's own sweep
 * (`vacateAbandonedBelts`, reason `leftPromotion`), with its own news item.
 */

import {
  championWantsToGo,
  createAgreement,
  displayName,
  inboxId,
  marketValue,
  newsId,
  openingTerms,
  poachChance,
  poachOffer,
  postureOf,
  type Fighter,
  type FighterId,
  type InboxItem,
  type NewsItem,
  type Promotion,
  type PromotionalAgreement,
  type Rng,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { agreementOf } from './contracts';
import { raise } from './inbox';
import { money } from '../ui/format';

/**
 * This quarter's poaching attempts, across the sport. Run by the world quarterly. Returns news.
 */
export function poachChampions(
  db: GameDb,
  day: number,
  rng: Rng,
  exceptId: FighterId | undefined,
): NewsItem[] {
  const world = getWorld(db);
  const promotions = db.promotions.findAll() as unknown as Promotion[];
  const news: NewsItem[] = [];

  for (const incumbent of promotions) {
    for (const [divisionId, championId] of Object.entries(incumbent.champions)) {
      if (!championId || championId === exceptId) continue;
      const champion = db.fighters.findById(championId as string) as Fighter | undefined;
      if (!champion || champion.retiredDay !== undefined || champion.promotionId !== incumbent.id) {
        continue;
      }
      const current = agreementOf(db, champion) ?? openingTerms(champion, incumbent);
      for (const rival of promotions) {
        if (rival.id === incumbent.id || !rival.divisions.includes(divisionId as never)) continue;
        const offer = poachOffer({
          marketValue: marketValue(champion, rival),
          current,
          market: openingTerms(champion, rival),
        });
        const roll = rng.fork(`${rival.id}:${champion.id}`);
        if (!roll.chance(poachChance(rival, champion, offer.releaseFee))) continue;

        // The champion first: no amount of money moves somebody who does not want to go.
        const raiseShare = offer.terms.showPurse / Math.max(0.1, current.showPurse) - 1;
        if (!championWantsToGo(champion, raiseShare, roll.fork('champion'))) break;

        if (incumbent.id === world.playerPromotionId) {
          raise(db, {
            id: inboxId(day as never, `poach:${champion.id}`),
            day: day as never,
            kind: 'roster',
            priority: 'decision',
            title: `${rival.shortName} wants to buy out ${displayName(champion)}`,
            body: `${rival.shortName} will pay ${money(offer.releaseFee)} to release your champion, and ${displayName(champion)} wants to go. Take the money and the belt is vacant; refuse and you keep a champion who knows what they were offered.`,
            actions: [
              {
                id: `poach:accept:${rival.id as string}:${offer.releaseFee}`,
                label: `Take ${money(offer.releaseFee)}`,
                detail: 'They leave, and the belt is vacated.',
              },
              {
                id: 'poach:refuse',
                label: 'Refuse',
                detail: 'They stay, and resent it.',
                isDismiss: true,
              },
            ],
            link: { route: 'fighter', id: champion.id as string },
            fighterId: champion.id,
            promotionId: rival.id,
          });
          break;
        }

        // An AI incumbent takes the money more readily the less it is itself an aggressor.
        const takes = roll
          .fork('incumbent')
          .chance(postureOf(incumbent) === 'aggressor' ? 0.25 : 0.65);
        if (!takes) break;
        news.push(executePoach(db, champion, incumbent, rival, offer, day));
        break;
      }
    }
  }
  return news;
}

/** The move itself: the fee crosses, the old deal is spent, and the champion signs. */
function executePoach(
  db: GameDb,
  champion: Fighter,
  incumbent: Promotion,
  rival: Promotion,
  offer: ReturnType<typeof poachOffer>,
  day: number,
): NewsItem {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  db.promotions.upsert({
    ...incumbent,
    budget: round1(incumbent.budget + offer.releaseFee),
  } as never);
  const freshRival = (db.promotions.findById(rival.id as string) as Promotion | undefined) ?? rival;
  db.promotions.upsert({
    ...freshRival,
    budget: round1(freshRival.budget - offer.releaseFee),
  } as never);

  const outgoing = agreementOf(db, champion);
  if (outgoing) {
    db.agreements.upsert({
      ...outgoing,
      fightsRemaining: 0,
      expiresDay: Math.min(outgoing.expiresDay, day),
    } as PromotionalAgreement & Entity);
  }
  const agreement = createAgreement({
    fighter: champion,
    promotion: rival,
    terms: offer.terms,
    day: day as never,
  });
  db.agreements.upsert(agreement as PromotionalAgreement & Entity);
  db.fighters.upsert({
    ...champion,
    promotionId: rival.id,
    agreementId: agreement.id,
    resentment: 0,
  } as Fighter & Entity);

  return {
    id: newsId(day as never, `poach:${champion.id}`),
    day: day as never,
    kind: 'rival',
    weight: 'major',
    headline: `${rival.shortName} buys ${displayName(champion)} out of ${incumbent.shortName}`,
    detail: `${money(offer.releaseFee)} to ${incumbent.shortName} for the release. The ${incumbent.shortName} belt goes vacant.`,
    fighterIds: [champion.id],
    divisionId: champion.divisionId,
    promotionId: rival.id,
    involvesPlayer: incumbent.id === getWorld(db).playerPromotionId,
  };
}

/** Answer a poaching offer from the inbox. True when it was one. */
export function answerPoach(db: GameDb, item: InboxItem, actionId: string): boolean {
  if (!actionId.startsWith('poach:') || !item.fighterId) return false;
  const champion = db.fighters.findById(item.fighterId as string) as Fighter | undefined;
  const world = getWorld(db);
  const incumbent = world.playerPromotionId
    ? (db.promotions.findById(world.playerPromotionId) as Promotion | undefined)
    : undefined;
  if (!champion || !incumbent || champion.promotionId !== incumbent.id) return true;

  if (actionId === 'poach:refuse') {
    db.fighters.upsert({
      ...champion,
      resentment: Math.min(100, champion.resentment + 15),
    } as Fighter & Entity);
    db.save();
    return true;
  }
  const [, , rivalId, fee] = actionId.split(':');
  const rival = db.promotions.findById(rivalId ?? '') as Promotion | undefined;
  if (!rival) return true;
  const offer = poachOffer({
    marketValue: marketValue(champion, rival),
    current: agreementOf(db, champion) ?? openingTerms(champion, incumbent),
    market: openingTerms(champion, rival),
  });
  const news = executePoach(
    db,
    champion,
    incumbent,
    rival,
    { ...offer, releaseFee: Number(fee) || offer.releaseFee },
    world.day,
  );
  db.news.upsert(news as never);
  db.save();
  return true;
}
