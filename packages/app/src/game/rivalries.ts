/**
 * Rivalries, as the game actually stores and reads them.
 *
 * The engine owns what heat *is* and how it decays (`business/heat.ts`); this owns where it
 * lives and when it is raised. Keeping the split means the heat rules stay testable without
 * a database and the storage stays replaceable without touching the rules.
 */

import {
  currentHeat,
  describeHeat,
  emptyRivalry,
  heatFromFight,
  isDecisionMethod,
  pairKey,
  rivalryId,
  stokeHeat,
  createRng,
  type Fighter,
  type FighterId,
  type FightResult,
  type HeatSource,
  type Rivalry,
} from '@mmasim/engine';
import type { Entity, GameDb } from '@mmasim/data';

type StoredRivalry = Rivalry & Entity;

/** The rivalry between two fighters, or a fresh empty one. Never returns undefined. */
export function getRivalry(db: GameDb, a: FighterId, b: FighterId, day: number): Rivalry {
  const existing = db.rivalries.findById(rivalryId(a, b) as string) as StoredRivalry | undefined;
  return existing ?? emptyRivalry(a, b, day);
}

/** Every rivalry a fighter is part of, hottest first. Cold ones are filtered out. */
export function rivalriesFor(
  db: GameDb,
  fighterId: FighterId,
  day: number,
  minimumHeat = 12,
): { rivalry: Rivalry; heat: number; otherId: FighterId }[] {
  return (db.rivalries.findAll() as StoredRivalry[])
    .filter((r) => r.fighterIds.includes(fighterId))
    .map((rivalry) => ({
      rivalry,
      heat: currentHeat(rivalry, day),
      otherId: rivalry.fighterIds.find((id) => id !== fighterId)!,
    }))
    .filter((r) => r.heat >= minimumHeat || r.rivalry.isRivalry)
    .sort((a, b) => b.heat - a.heat);
}

export interface HeatFromFightInput {
  /** The events are not read, so the world's reduced result will do. */
  result: Omit<FightResult, 'events'>;
  red: Fighter;
  blue: Fighter;
  day: number;
  isTitleFight: boolean;
  seed: string;
}

/**
 * Raise the heat a fight generated, and say so if it produced a grudge.
 *
 * The instigator is the *loser*, which is the deliberate choice here: heat after a fight
 * comes from the man who thinks he was robbed, not from the man holding the belt. A loser
 * with high Ego and Aggression turns a decision into a feud; a gracious one shakes hands and
 * the pairing cools inside a year.
 */
export function accrueHeatFromFight(db: GameDb, input: HeatFromFightInput): string[] {
  const { result, red, blue, day, isTitleFight, seed } = input;
  const rng = createRng(seed);

  const wasDecision = isDecisionMethod(result.method);
  const card = result.scorecards[0];
  const margin = card ? Math.abs(card.redTotal - card.blueTotal) : 99;
  const wasClose = wasDecision && margin <= 1;

  const sources = heatFromFight({
    wasClose,
    // A split decision or a stoppage nobody agrees with is the best build-up money cannot
    // buy, and the game should be capable of producing one by accident.
    wasControversial: result.method === 'decisionSplit' || result.method === 'noContest',
    wasTitleFight: isTitleFight,
    finishWasBrutal:
      result.damage.red.knockdownsSuffered + result.damage.blue.knockdownsSuffered >= 2,
  });

  const loser = result.winnerId === undefined ? undefined : result.winnerId === red.id ? blue : red;

  let rivalry = getRivalry(db, red.id, blue.id, day);
  const wasAlreadyRivalry = rivalry.isRivalry;

  for (const source of sources) {
    rivalry = stokeHeat({
      rivalry,
      source,
      day,
      instigator: loser,
      rng: rng.fork(source),
    });
  }

  db.rivalries.upsert({ ...rivalry, id: rivalry.id as string } as unknown as StoredRivalry);

  const notes: string[] = [];
  if (!wasAlreadyRivalry && rivalry.isRivalry) {
    notes.push(
      `This one is not finished. ${loser?.lastName ?? 'The loser'} wants it back, and the audience wants to see it.`,
    );
  } else if (currentHeat(rivalry, day) > 45) {
    notes.push(describeHeat(rivalry, day));
  }
  return notes;
}

/** Whether these two have met before, and how it went. Shown when picking an opponent. */
export function previousMeetings(
  fighter: Fighter,
  opponentId: FighterId,
): { wins: number; losses: number; draws: number; total: number } {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const bout of fighter.record) {
    if (bout.opponentId !== opponentId) continue;
    if (bout.outcome === 'win') wins++;
    else if (bout.outcome === 'loss') losses++;
    else if (bout.outcome === 'draw') draws++;
  }
  return { wins, losses, draws, total: wins + losses + draws };
}

/** Stable key for a pair, for anything that needs to group by matchup. */
export const matchupKey = (a: FighterId, b: FighterId): string => pairKey(a, b).join('|');

/**
 * Raise the heat between two fighters from something one of them did or something that happened,
 * and say whether it just became a grudge. Doc 34 C6 — the world's own bouts, trilogies and
 * callouts, which until now raised no heat at all: only fighter mode's own bouts did.
 */
export function stokeBetween(
  db: GameDb,
  input: {
    a: Fighter;
    b: Fighter;
    source: HeatSource;
    day: number;
    instigator?: Fighter;
    beat?: string;
    seed: string;
  },
): { rivalry: Rivalry; ignited: boolean } {
  const before = getRivalry(db, input.a.id, input.b.id, input.day);
  const rivalry = stokeHeat({
    rivalry: before,
    source: input.source,
    day: input.day as never,
    instigator: input.instigator,
    beat: input.beat,
    rng: createRng(input.seed),
  });
  db.rivalries.upsert({ ...rivalry, id: rivalry.id as string } as unknown as StoredRivalry);
  return { rivalry, ignited: !before.isRivalry && rivalry.isRivalry };
}

/** The heat and grudge between two fighters today, for what a bout between them draws. */
export function heatBetween(
  db: GameDb,
  a: FighterId,
  b: FighterId,
  day: number,
): { heat: number; isRivalry: boolean } {
  const existing = db.rivalries.findById(rivalryId(a, b) as string) as StoredRivalry | undefined;
  return existing
    ? { heat: currentHeat(existing, day as never), isRivalry: existing.isRivalry }
    : { heat: 0, isRivalry: false };
}

/** How many times these two have fought, from either one's record. */
export const meetings = (fighter: Fighter, opponentId: FighterId): number =>
  fighter.record.filter((r) => r.opponentId === opponentId).length;

/**
 * Drop pairings that have gone completely cold. Doc 34 C6: the world's bouts now raise heat, so
 * every pair that fights writes a rivalry row, and one nobody will ever read again — never a
 * grudge, and its heat decayed to nothing — only costs the save its bytes. A confirmed grudge is
 * kept whatever its heat, because it never fully cools.
 */
export function pruneColdRivalries(db: GameDb, day: number): number {
  let removed = 0;
  for (const r of db.rivalries.findAll() as StoredRivalry[]) {
    if (r.isRivalry || currentHeat(r, day as never) >= 1) continue;
    db.rivalries.remove(r.id as string);
    removed += 1;
  }
  return removed;
}
