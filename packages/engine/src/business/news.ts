/**
 * The news feed.
 *
 * A world that moves and never says so has not moved as far as the player is concerned. Up
 * to now the only events a player ever learned about were their own: rankings shifted with
 * nobody visibly fighting, and belts changed hands in silence. This module turns what the
 * simulation did into something a person can read.
 *
 * Pure by design — it takes finished results and returns sentences. Nothing here touches
 * storage, decides what happened, or knows there is a screen.
 *
 * The editorial rule, and it is a real one: **the feed reports, it does not congratulate.**
 * A player's own win gets the same register as anybody else's. The moment the feed starts
 * telling the player they are wonderful it stops being a world and becomes a scoreboard.
 */

import type { GameDay } from '../core/clock.js';
import type { DivisionId, FighterId, NewsId, PromotionId } from '../core/ids.js';
import { asId } from '../core/ids.js';
import type { FinishMethod } from '../domain/fighter.js';
import { isKoMethod } from '../domain/fighter.js';

export type NewsKind =
  | 'result'
  | 'upset'
  | 'titleChange'
  | 'titleDefence'
  | 'retirement'
  | 'debut'
  | 'injury'
  | 'rivalry'
  | 'streak'
  | 'signing';

/**
 * How loudly an item should be presented.
 *
 * Three tiers rather than a numeric score, because the feed's job is to let a player skim
 * three months of world history in ten seconds and stop at the two things that matter.
 */
export type NewsWeight = 'major' | 'normal' | 'minor';

export interface NewsItem {
  id: NewsId;
  day: GameDay;
  kind: NewsKind;
  weight: NewsWeight;
  /** One line. Reads on its own with no context. */
  headline: string;
  /** Optional second line with the detail. */
  detail?: string;
  /** Everyone involved, so the feed can link to them and filter by them. */
  fighterIds: readonly FighterId[];
  divisionId?: DivisionId;
  promotionId?: PromotionId;
  /** True when the player's own fighter is involved. Used for filtering, never for praise. */
  involvesPlayer?: boolean;
}

export const newsId = (day: GameDay, key: string): NewsId => asId<NewsId>(`news_${day}_${key}`);

/** How a result reads in a sentence. */
export function describeMethod(method: FinishMethod, round: number, submissionName?: string): string {
  if (method === 'ko') return `by knockout in round ${round}`;
  if (method === 'tko') return `by TKO in round ${round}`;
  if (method === 'doctorStoppage') return `on a doctor's stoppage in round ${round}`;
  if (method === 'submission') {
    return submissionName
      ? `by ${submissionName} in round ${round}`
      : `by submission in round ${round}`;
  }
  if (method === 'retirement') return `when the corner pulled him out after round ${round}`;
  if (method === 'decisionUnanimous') return 'by unanimous decision';
  if (method === 'decisionSplit') return 'by split decision';
  if (method === 'decisionMajority') return 'by majority decision';
  if (method === 'draw') return 'to a draw';
  if (method === 'noContest') return 'to a no contest';
  if (method === 'dq') return 'by disqualification';
  return '';
}

export interface FightNewsInput {
  day: GameDay;
  boutId: string;
  winnerName?: string;
  loserName?: string;
  winnerId?: FighterId;
  loserId?: FighterId;
  method: FinishMethod;
  round: number;
  submissionName?: string;
  divisionId: DivisionId;
  promotionId?: PromotionId;
  /** Ranks before the fight, 1-indexed. Undefined for the unranked. */
  winnerRank?: number;
  loserRank?: number;
  isTitleFight?: boolean;
  /** True when the belt actually moved. */
  titleChangedHands?: boolean;
  involvesPlayer?: boolean;
}

/**
 * The item a finished fight produces, or nothing.
 *
 * Deliberately returns `undefined` for the ordinary. A feed that reports every preliminary
 * decision between two unranked fighters is noise, and noise is how a player learns to stop
 * reading — which costs more than the handful of items it would have carried.
 */
export function fightNews(input: FightNewsInput): NewsItem | undefined {
  const {
    day,
    boutId,
    winnerName,
    loserName,
    method,
    round,
    submissionName,
    divisionId,
    promotionId,
    winnerRank,
    loserRank,
    isTitleFight,
    titleChangedHands,
    involvesPlayer,
  } = input;

  const fighterIds = [input.winnerId, input.loserId].filter((id): id is FighterId => !!id);
  const how = describeMethod(method, round, submissionName);
  const base = { day, fighterIds, divisionId, promotionId, involvesPlayer };

  if (isTitleFight) {
    return titleChangedHands
      ? {
          ...base,
          id: newsId(day, `title_${boutId}`),
          kind: 'titleChange',
          weight: 'major',
          headline: `${winnerName} is the new champion.`,
          detail: `Beat ${loserName} ${how} to take the title.`,
        }
      : {
          ...base,
          id: newsId(day, `defence_${boutId}`),
          kind: 'titleDefence',
          weight: 'major',
          headline: `${winnerName} keeps the belt.`,
          detail: `Turned back ${loserName} ${how}.`,
        };
  }

  // An upset is a ranking inversion, and the size of the gap decides how loudly it reads.
  const isUpset =
    winnerRank !== undefined && loserRank !== undefined
      ? winnerRank > loserRank + 3
      : winnerRank === undefined && loserRank !== undefined && loserRank <= 10;

  if (isUpset) {
    const gap = winnerRank !== undefined && loserRank !== undefined ? winnerRank - loserRank : 99;
    return {
      ...base,
      id: newsId(day, `upset_${boutId}`),
      kind: 'upset',
      weight: gap > 6 || (loserRank ?? 99) <= 3 ? 'major' : 'normal',
      headline: `${winnerName} upsets ${loserName}.`,
      detail:
        winnerRank === undefined
          ? `An unranked fighter beats the number ${loserRank} ${how}. Somebody has some explaining to do.`
          : `Number ${winnerRank} beats number ${loserRank} ${how}.`,
    };
  }

  // A ranked fighter losing, or a clean finish, is worth a line. Everything else is not.
  const ranked = (winnerRank ?? 99) <= 10 || (loserRank ?? 99) <= 10;
  const decisive = isKoMethod(method) || method === 'submission';

  if (!ranked && !decisive && !involvesPlayer) return undefined;

  return {
    ...base,
    id: newsId(day, `result_${boutId}`),
    kind: 'result',
    weight: ranked && decisive ? 'normal' : 'minor',
    headline: `${winnerName} beats ${loserName}.`,
    detail: `${how.charAt(0).toUpperCase()}${how.slice(1)}${
      winnerRank !== undefined ? ` · ranked ${winnerRank}` : ''
    }.`,
  };
}

export function retirementNews(input: {
  day: GameDay;
  fighterId: FighterId;
  name: string;
  reason: string;
  divisionId: DivisionId;
  record: string;
  wasChampion?: boolean;
  involvesPlayer?: boolean;
}): NewsItem {
  return {
    id: newsId(input.day, `retire_${input.fighterId}`),
    day: input.day,
    kind: 'retirement',
    // A former champion walking away is a moment; a journeyman quietly stopping is a line.
    weight: input.wasChampion ? 'major' : 'minor',
    headline: `${input.name} retires.`,
    detail: `${input.record}. ${input.reason}`,
    fighterIds: [input.fighterId],
    divisionId: input.divisionId,
    involvesPlayer: input.involvesPlayer,
  };
}

export function debutNews(input: {
  day: GameDay;
  fighterId: FighterId;
  name: string;
  divisionId: DivisionId;
  promotionId?: PromotionId;
  promotionName?: string;
}): NewsItem {
  return {
    id: newsId(input.day, `debut_${input.fighterId}`),
    day: input.day,
    kind: 'signing',
    weight: 'minor',
    headline: `${input.name} signs${input.promotionName ? ` with ${input.promotionName}` : ''}.`,
    fighterIds: [input.fighterId],
    divisionId: input.divisionId,
    promotionId: input.promotionId,
  };
}

/**
 * Somebody changed promotions.
 *
 * Worth a line because it is the visible half of free agency: a division thinning out, a
 * rival picking up somebody the leader let go, and — when it is a fighter the player just
 * lost to — a reason to care where they went.
 */
export function signingNews(input: {
  day: GameDay;
  fighterId: FighterId;
  name: string;
  divisionId: DivisionId;
  promotionId: PromotionId;
  fromName: string;
  toName: string;
}): NewsItem {
  return {
    id: newsId(input.day, `move_${input.fighterId}`),
    day: input.day,
    kind: 'signing',
    weight: 'minor',
    headline: `${input.name} leaves ${input.fromName} for ${input.toName}.`,
    fighterIds: [input.fighterId],
    divisionId: input.divisionId,
    promotionId: input.promotionId,
  };
}

export function streakNews(input: {
  day: GameDay;
  fighterId: FighterId;
  name: string;
  streak: number;
  divisionId: DivisionId;
  involvesPlayer?: boolean;
}): NewsItem | undefined {
  // Only at the milestones somebody would actually remark on.
  if (input.streak !== 3 && input.streak !== 5 && input.streak !== 8 && input.streak < 10) {
    return undefined;
  }
  return {
    id: newsId(input.day, `streak_${input.fighterId}_${input.streak}`),
    day: input.day,
    kind: 'streak',
    weight: input.streak >= 5 ? 'normal' : 'minor',
    headline: `${input.name} makes it ${input.streak} in a row.`,
    detail:
      input.streak >= 8
        ? 'At this point the division is running out of people to put in front of him.'
        : 'The run is starting to get noticed.',
    fighterIds: [input.fighterId],
    divisionId: input.divisionId,
    involvesPlayer: input.involvesPlayer,
  };
}

export function rivalryNews(input: {
  day: GameDay;
  fighterIds: readonly [FighterId, FighterId];
  names: readonly [string, string];
  divisionId: DivisionId;
  involvesPlayer?: boolean;
}): NewsItem {
  return {
    id: newsId(input.day, `rivalry_${input.fighterIds.join('_')}`),
    day: input.day,
    kind: 'rivalry',
    weight: 'normal',
    headline: `${input.names[0]} and ${input.names[1]} is personal now.`,
    detail: 'Whatever this was, it is a grudge from here on — and grudges sell.',
    fighterIds: input.fighterIds,
    divisionId: input.divisionId,
    involvesPlayer: input.involvesPlayer,
  };
}

/**
 * How many items of each weight the feed keeps.
 *
 * Per-weight rather than one flat cap, and that distinction matters more than it looks. A
 * simulated year produces roughly 3 major items, 25 normal and 135 minor; under a single
 * cap of 200 the minor results would push a title change out of the feed inside eighteen
 * months, so the *history* of the world would be evicted by its noise. Majors are the spine
 * — belts moving, champions retiring — and they keep for years.
 */
const FEED_CAPS: Readonly<Record<NewsWeight, number>> = {
  major: 80,
  normal: 120,
  minor: 100,
};

/**
 * Trim a feed to what a person will actually read.
 *
 * Newest first within each weight, then merged back into one chronological list. An uncapped
 * feed grows without bound across a twenty-year career and turns the home screen into a
 * scrolling wall.
 */
export function trimFeed(items: readonly NewsItem[]): NewsItem[] {
  const weightRank: Record<NewsWeight, number> = { major: 0, normal: 1, minor: 2 };
  const kept: NewsItem[] = [];

  for (const weight of ['major', 'normal', 'minor'] as const) {
    kept.push(
      ...items
        .filter((i) => i.weight === weight)
        .sort((a, b) => b.day - a.day)
        .slice(0, FEED_CAPS[weight]),
    );
  }

  return kept.sort((a, b) => b.day - a.day || weightRank[a.weight] - weightRank[b.weight]);
}

/** Everything in the feed that touches a given fighter. */
export const newsAbout = (items: readonly NewsItem[], fighterId: FighterId): NewsItem[] =>
  items.filter((item) => item.fighterIds.includes(fighterId));
