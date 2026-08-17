/**
 * Belts, and who has held them.
 *
 * A championship was a single field: `Promotion.champions[divisionId]`, one fighter id, no
 * history. That is enough to answer "who is champion" and nothing else — no lineage, no reign
 * length, no defence count, no record of how a belt changed hands or why it went vacant. In a
 * sport where "the third-longest reign in the division's history" is a sentence people say, the
 * belt was the one object with no memory.
 *
 * It also produced a specific, visible failure: with no history there was nothing to seed, so
 * every promotion shipped `champions: {}` and **no title fight was possible anywhere in the
 * game**. Measured: zero across ninety-six cards.
 *
 * The map stays as the fast lookup, because "who holds this belt" is asked on every matchmaking
 * pass and walking a lineage for it would be absurd. This is the same denormalisation the
 * fighter carries between `record` and `summary`, with the same invariant: the map is derivable
 * from the lineage, and the lineage is the truth.
 */

import type { GameDay } from '../core/clock.js';
import type { DivisionId, FighterId, PromotionId } from '../core/ids.js';
import type { FinishMethod } from '../domain/fighter.js';

/**
 * Why a belt is not on somebody's waist.
 *
 * There is no `'unknown'`. A vacant title is always the *consequence* of something, and a
 * promotion with an unexplained empty division is a promotion that has forgotten its own
 * history — which is exactly the state the seed used to ship in.
 */
export type VacancyReason =
  | 'retired'
  | 'injured'
  | 'suspended'
  | 'leftPromotion'
  | 'movedDivision'
  | 'stripped'
  | 'newDivision';

/** One reign, closed or ongoing. */
export interface Reign {
  fighterId: FighterId;
  wonDay: GameDay;
  /** How they took it. Absent when the belt was awarded to fill a vacancy. */
  wonBy?: { opponentId?: FighterId; method: FinishMethod; round: number };
  /** Absent while the reign is ongoing. */
  lostDay?: GameDay;
  lostBy?: { opponentId?: FighterId; method?: FinishMethod; vacated?: VacancyReason };
  /** Successful title defences within this reign. */
  defences: number;
  /**
   * The last day this belt was contested, won or defended.
   *
   * Distinct from `wonDay` and the distinction is load-bearing. A defence interval measured from
   * when the reign *started* stops applying the moment a champion defends once — measured, that
   * left half of all reigns ending inside seventy days, because after a single defence the belt
   * was contestable on every card again.
   */
  lastContestedDay?: GameDay;
}

export interface Championship {
  id: string;
  promotionId: PromotionId;
  divisionId: DivisionId;
  /** Newest last. The current reign is the final entry when it has no `lostDay`. */
  lineage: readonly Reign[];
  /** Set only while the belt is genuinely unclaimed, with the reason it happened. */
  vacancy?: { since: GameDay; reason: VacancyReason };
}

export const championshipId = (promotionId: PromotionId, divisionId: DivisionId): string =>
  `title_${promotionId}_${divisionId}`;

/** The reign in progress, if there is one. */
export function currentReign(title: Championship): Reign | undefined {
  const last = title.lineage[title.lineage.length - 1];
  return last && last.lostDay === undefined ? last : undefined;
}

export const championOf = (title: Championship): FighterId | undefined =>
  currentReign(title)?.fighterId;

export const isVacant = (title: Championship): boolean => currentReign(title) === undefined;

/** How long the current reign has run, in days. */
export function reignLength(title: Championship, today: GameDay): number {
  const reign = currentReign(title);
  return reign ? Math.max(0, today - reign.wonDay) : 0;
}

/**
 * A new champion.
 *
 * Closes the outgoing reign and opens a new one in the same operation, because the two are the
 * same event and letting a caller do one without the other is how a lineage ends up with two
 * open reigns or none.
 */
export function crown(input: {
  title: Championship;
  fighterId: FighterId;
  day: GameDay;
  wonBy?: Reign['wonBy'];
}): Championship {
  const { title, fighterId, day, wonBy } = input;
  const outgoing = currentReign(title);

  const lineage: Reign[] = title.lineage.map((reign) =>
    reign === outgoing
      ? {
          ...reign,
          lostDay: day,
          lostBy: { opponentId: fighterId, method: wonBy?.method },
        }
      : reign,
  );

  lineage.push({ fighterId, wonDay: day, wonBy, defences: 0, lastContestedDay: day });
  return { ...title, lineage, vacancy: undefined };
}

/** A successful defence. Counted on the reign rather than derived, so it survives a rebuild. */
export function defend(title: Championship, day: GameDay): Championship {
  const reign = currentReign(title);
  if (!reign) return title;
  return {
    ...title,
    lineage: title.lineage.map((r) =>
      r === reign ? { ...r, defences: r.defences + 1, lastContestedDay: day } : r,
    ),
  };
}

/** When this belt was last on the line, however that turned out. */
export const lastContested = (title: Championship): GameDay =>
  currentReign(title)?.lastContestedDay ?? currentReign(title)?.wonDay ?? 0;

/**
 * Take the belt off somebody without anybody beating them.
 *
 * Always carries a reason, and the reason is what the news item is made of. "The belt is vacant"
 * is not a story; "he is out for a year and they have stripped him" is.
 */
export function vacate(input: {
  title: Championship;
  day: GameDay;
  reason: VacancyReason;
}): Championship {
  const { title, day, reason } = input;
  const reign = currentReign(title);
  if (!reign) return title;

  return {
    ...title,
    lineage: title.lineage.map((r) =>
      r === reign ? { ...r, lostDay: day, lostBy: { vacated: reason } } : r,
    ),
    vacancy: { since: day, reason },
  };
}

/** How a vacancy reads in a sentence, from the promotion's side. */
export function describeVacancy(reason: VacancyReason): string {
  switch (reason) {
    case 'retired':
      return 'vacated on retirement';
    case 'injured':
      return 'stripped after a long lay-off';
    case 'suspended':
      return 'stripped while suspended';
    case 'leftPromotion':
      return 'vacated on leaving the promotion';
    case 'movedDivision':
      return 'vacated to move weight';
    case 'stripped':
      return 'stripped for inactivity';
    case 'newDivision':
      return 'never yet contested';
  }
}

/**
 * How a reign reads, which is the whole reason the lineage exists.
 *
 * The sport talks about belts in exactly these terms — how long, how many defences — and none
 * of it could be said when a championship was one id in a map.
 */
export function describeReign(title: Championship, today: GameDay): string {
  const reign = currentReign(title);
  if (!reign) {
    return title.vacancy ? `Vacant — ${describeVacancy(title.vacancy.reason)}.` : 'Vacant.';
  }

  const days = today - reign.wonDay;
  const months = Math.floor(days / 30);
  const held =
    days < 60 ? `${days} days` : months < 24 ? `${months} months` : `${Math.floor(days / 365)} years`;

  if (reign.defences === 0) return `Champion for ${held}, no defences yet.`;
  return `Champion for ${held}, ${reign.defences} defence${reign.defences === 1 ? '' : 's'}.`;
}

/** Every completed reign, longest first. The division's own history. */
export function longestReigns(
  title: Championship,
  today: GameDay,
): { fighterId: FighterId; days: number; defences: number }[] {
  return title.lineage
    .map((r) => ({
      fighterId: r.fighterId,
      days: (r.lostDay ?? today) - r.wonDay,
      defences: r.defences,
    }))
    .sort((a, b) => b.days - a.days);
}

/**
 * What a champion is paid on top of the contract.
 *
 * Champions are paid materially more than contenders, and the model had no way to express it:
 * `purseFor` read the agreement and the card position and stopped. A belt changed a fighter's
 * ranking, their `starPower` growth and nothing in their bank account.
 *
 * Applied as a multiplier on the whole purse rather than a fixed bonus so it scales with the
 * promotion, and kept below the card-position multiplier for the main event deliberately: being
 * the champion is worth a great deal, and being the fight people bought the night for is worth
 * more. That ordering is what makes a champion who cannot sell tickets an interesting problem
 * rather than a contradiction.
 */
export const CHAMPION_PURSE_MULTIPLIER = 1.6;

/** And a defence is worth more than the night you won it, because now you are the draw. */
export function championPurseMultiplier(input: {
  isChampion: boolean;
  defences: number;
}): number {
  if (!input.isChampion) return 1;
  return CHAMPION_PURSE_MULTIPLIER + Math.min(0.4, input.defences * 0.08);
}
