/**
 * The promoter's hand on the belts. Doc 34 B6.
 *
 * A belt could only change hands in a fight or be vacated by the world — retirement, a move, a
 * year out injured. The one thing a promoter actually does with a belt and could not do here was
 * take it off somebody: the champion who will not defend, who is holding the division hostage for
 * a money fight, who has been out for ten months with no date. Stripping is that decision, and it
 * has two prices, both of which the screen states before the button is pressed:
 *
 *  - **the audience**, who read it by whether it looks earned. A champion who has not fought in a
 *    year being stripped is overdue; a popular champion with a defence in the last six months
 *    being stripped looks like politics, and costs buzz in proportion to how popular they were;
 *  - **the champion**, who remembers it (`stripped` in C3's relationship ledger), and keeps
 *    remembering it if they leave — like being cut, it is not part of the working relationship
 *    that ends with the job.
 */

import {
  championshipId,
  displayName,
  getDivision,
  newsId,
  setChampion,
  vacate,
  withLedgerEntry,
  withSlot,
  type Championship,
  type DivisionId,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { appendNews } from './world';
import { plansFor, savePlan } from './plans';

/** How long without a fight before stripping a champion looks overdue rather than political. */
export const OVERDUE_DAYS = 365;

/** Out injured this long, a champion holding the belt is holding the division up. */
const LONG_INJURY_DAYS = 180;

export interface StripReaction {
  /** What the buzz moves by. Zero or negative. */
  buzzDelta: number;
  /** Whether the sport will read it as earned. */
  justified: boolean;
  /** One sentence: how it will be received, for the confirmation and the news. */
  verdict: string;
}

/**
 * How stripping this champion would land, today. Read before the decision, applied by it.
 *
 * Star power decides how loud the objection is, and whether the champion has been fighting
 * decides whether there is one: a popular champion stripped for no visible reason is the most
 * expensive thing a promoter can do with a belt, and an absent one is the cheapest.
 */
export function strippingReaction(champion: Fighter, day: number): StripReaction {
  const lastFight = champion.record.reduce((latest, r) => Math.max(latest, r.day), -Infinity);
  const idle = Number.isFinite(lastFight) ? day - lastFight : Infinity;
  const injuredFor = (champion.readyOnDay ?? 0) - day;
  const justified = idle > OVERDUE_DAYS || injuredFor > LONG_INJURY_DAYS;

  if (justified) {
    return {
      buzzDelta: champion.starPower >= 60 ? -1 : 0,
      justified,
      verdict:
        injuredFor > LONG_INJURY_DAYS
          ? 'Most of the sport will call it the right decision: the division cannot wait that long.'
          : 'Most of the sport will say it was overdue. A belt nobody defends is not a belt.',
    };
  }
  return {
    buzzDelta: -Math.min(8, Math.round(2 + champion.starPower / 15)),
    justified,
    verdict:
      champion.starPower >= 60
        ? 'The fans will see it as politics. They paid to watch this champion, and they will say so.'
        : 'It will look like the promotion picking a fight with its own champion.',
  };
}

/**
 * Take the belt off this promotion's champion in the division.
 *
 * Vacates the lineage (reason `stripped`), clears the champion, writes the memory, moves the buzz
 * and tells the sport. A title fight on a live card with the champion in it is no longer for the
 * title — they are not the champion — so it goes back to being a fight. Undefined when there is
 * nobody to strip.
 */
export function stripChampion(
  db: GameDb,
  divisionId: DivisionId,
): (StripReaction & { championId: string }) | undefined {
  const world = getWorld(db);
  const promotion = db.promotions.findById(world.playerPromotionId as string) as
    Promotion | undefined;
  const championId = promotion?.champions[divisionId] as string | undefined;
  if (!promotion || !championId) return undefined;
  const champion = db.fighters.findById(championId) as Fighter | undefined;
  if (!champion) return undefined;
  const day = world.day;
  const reaction = strippingReaction(champion, day);

  db.promotions.upsert({
    ...setChampion(promotion, divisionId, undefined),
    buzz: Math.max(1, promotion.buzz + reaction.buzzDelta),
  } as Promotion & Entity);

  const title = db.championships.findById(championshipId(promotion.id, divisionId)) as
    Championship | undefined;
  if (title) {
    db.championships.upsert(
      vacate({ title, day: day as never, reason: 'stripped' }) as Championship & Entity,
    );
  }

  db.fighters.upsert({
    ...champion,
    ledger: withLedgerEntry(champion.ledger, {
      day: day as never,
      promotionId: promotion.id,
      kind: 'stripped',
    }),
  } as Fighter & Entity);

  for (const plan of plansFor(db, promotion.id as string)) {
    let next = plan;
    for (const slot of plan.slots) {
      const bout = slot.bout;
      if (
        bout?.titleKind === 'undisputed' &&
        bout.divisionId === divisionId &&
        (bout.redId === champion.id || bout.blueId === champion.id)
      ) {
        next = withSlot(next, slot.id, { ...bout, titleKind: undefined });
      }
    }
    if (next !== plan) savePlan(db, next);
  }

  appendNews(db, [
    {
      id: newsId(day as never, `stripped:${promotion.id}:${divisionId as string}`),
      day: day as never,
      kind: 'titleChange',
      weight: 'major',
      headline: `${promotion.shortName} strips ${displayName(champion)} of the ${getDivision(divisionId).name} title`,
      detail: reaction.verdict,
      fighterIds: [champion.id],
      divisionId,
      promotionId: promotion.id,
      involvesPlayer: true,
    },
  ]);
  db.save();
  return { ...reaction, championId };
}
