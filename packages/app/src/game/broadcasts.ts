/**
 * The tapes from the player's own fight night.
 *
 * `FightScreen` plays back a stored `FightResult` — the playback is presentation, not
 * simulation, which is what makes "skip" honest and re-watching free. Until now the only result it
 * could ever be handed was the fighter-mode player's own last bout, so a promoter who had just
 * run a twelve-fight card could see none of it: the screen existed, and nothing on the card
 * linked to it.
 *
 * So the promoter's night keeps its tapes here, in the same session-scoped storage and the same
 * `StoredResult` shape the fighter's broadcast uses, and `broadcastFor` answers for either. Like
 * the fighter's, they last as long as the session: every bout is in the fighters' records for
 * good, but the play-by-play of a whole card is too large to be worth a place in the save (doc
 * 20), and only the night just run is kept.
 */

import type { FightNight, FightResult } from '@mmasim/engine';
import { getLastBroadcast, type StoredResult } from './career';

const NIGHT_KEY = 'mmasim:nightTapes';

interface NightTapes {
  nightId: string;
  bouts: Record<string, StoredResult>;
}

const read = (): NightTapes | undefined => {
  try {
    const raw = sessionStorage.getItem(NIGHT_KEY);
    return raw ? (JSON.parse(raw) as NightTapes) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Keep the night's bouts for playback.
 *
 * `undercard` is the card's results as `FightScreen` lists them under its own bout, so every tape
 * shows the rest of the night around it. A storage refusal costs the replays, not the night.
 */
export function rememberNight(input: {
  night: FightNight;
  results: readonly FightResult[];
  commentatorId?: string;
  nameOf(id: string): string | undefined;
}): void {
  const { night, results, commentatorId, nameOf } = input;
  const undercard = results.map((r) => ({
    boutId: r.boutId,
    winnerName: r.winnerId ? nameOf(r.winnerId as string) : undefined,
    method: r.method,
    round: r.round,
  }));

  const bouts: Record<string, StoredResult> = {};
  for (const result of results) {
    const bout = night.bouts.find((b) => b.boutId === result.boutId);
    bouts[result.boutId] = { result, commentatorId, undercard, rounds: bout?.rounds };
  }

  try {
    sessionStorage.setItem(NIGHT_KEY, JSON.stringify({ nightId: night.id, bouts }));
  } catch {
    /* The replays are a convenience. The results are in the records either way. */
  }
}

/** The tape for a bout, whoever's it is: the player-fighter's own, or one from their card. */
export function broadcastFor(boutId: string | undefined): StoredResult | undefined {
  const own = getLastBroadcast();
  if (boutId === undefined || own?.result.boutId === boutId) return own;
  return read()?.bouts[boutId];
}

/** Whether a bout can be watched back this session. */
export const hasTape = (boutId: string): boolean => read()?.bouts[boutId] !== undefined;
