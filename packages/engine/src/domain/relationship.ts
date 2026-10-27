/**
 * What a fighter remembers about a promotion. Doc 34 C3.
 *
 * The bout-acceptance model knew the step up, the notice, the manager and the money, and nothing
 * about history: a fighter skipped for a title shot last spring and booked into a mismatch in the
 * summer answered the next offer exactly as warmly as one who had been looked after. People do not
 * work like that and promoters know it — the relationship is the thing a promoter manages most and
 * the model held none of it.
 *
 * The ledger is the record of what happened, and so it is stored: a handful of dated events per
 * fighter, capped. What those events *mean* is not stored — `relationshipWith` reads them through
 * the fighter's personality on the day it is asked, with old grievances fading, so the same history
 * weighs differently on an ambitious fighter and a loyal one and keeps weighing differently as the
 * personality drifts.
 */

import type { GameDay } from '../core/clock.js';
import type { PromotionId } from '../core/ids.js';
import { clamp } from '../core/math.js';
import type { Personality } from './personality.js';
import { isKoMethod, type Fighter, type FinishMethod } from './fighter.js';
import { overallRating } from '../ratings/attributes.js';

export type LedgerKind =
  | 'titleShotGiven'
  | 'titleShotSkipped'
  | 'rematchGiven'
  | 'mismatch'
  | 'protected'
  | 'cardCancelled'
  | 'cut'
  /** Their belt taken off them by the promotion. Doc 34 B6. */
  | 'stripped';

export interface LedgerEntry {
  day: GameDay;
  promotionId: PromotionId;
  kind: LedgerKind;
}

/** How many events a fighter keeps. Enough for a career's grudges, small enough for the save. */
export const LEDGER_CAP = 8;

/** Old history fades: an event is worth half as much after this many days. */
export const LEDGER_HALF_LIFE_DAYS = 720;

const META: Readonly<Record<LedgerKind, { base: number; label: string }>> = {
  titleShotGiven: { base: 25, label: 'the title shot they were given' },
  titleShotSkipped: { base: -20, label: 'being passed over for a title shot' },
  rematchGiven: { base: 10, label: 'getting the rematch they asked for' },
  mismatch: { base: -15, label: 'being fed to somebody far better' },
  protected: { base: 6, label: 'being brought along carefully' },
  cardCancelled: { base: -12, label: 'a camp wasted on a card that never happened' },
  cut: { base: -30, label: 'being cut' },
  stripped: { base: -35, label: 'having the belt taken off them' },
};

export const describeLedger = (kind: LedgerKind): string => META[kind].label;

/**
 * What one event is worth to this person.
 *
 * Ambition makes title shots matter more both ways, and turns careful matchmaking from a kindness
 * into an insult — an ambitious fighter wants to be tested. Ego magnifies a slight. Loyalty softens
 * slights and warms favours, which is what loyalty is.
 */
export function ledgerWeight(kind: LedgerKind, p: Personality): number {
  const base = META[kind].base;
  if (kind === 'protected') return base * (1 - p.ambition / 60);
  const ambitionScale =
    kind === 'titleShotGiven' || kind === 'titleShotSkipped' ? 0.5 + p.ambition / 100 : 1;
  const sign = base >= 0 ? 1 : -1;
  const temper = sign < 0 ? (0.7 + p.ego / 150) * (1.3 - p.loyalty / 100) : 0.8 + p.loyalty / 250;
  return base * ambitionScale * temper;
}

/**
 * How old an event can be before it is pruned: the age at which it weighs under 5% of what it did
 * on the day (`0.5 ** (age / half-life) < 0.05`). Past that it changes no answer and only costs
 * the save its bytes.
 */
export const LEDGER_FORGOTTEN_DAYS = Math.ceil(LEDGER_HALF_LIFE_DAYS * Math.log2(20));

/**
 * Add an event, dropping anything already forgotten as of its day and keeping the newest
 * `LEDGER_CAP`. Returns a new array.
 */
export function withLedgerEntry(
  ledger: readonly LedgerEntry[] | undefined,
  entry: LedgerEntry,
): LedgerEntry[] {
  return [...(ledger ?? []), entry]
    .filter((e) => entry.day - e.day < LEDGER_FORGOTTEN_DAYS)
    .slice(-LEDGER_CAP);
}

/**
 * What a fighter keeps when they leave a promotion: being cut, or stripped. The rest was the working
 * relationship, and it ends with the job — but a promoter who cut somebody and comes back for
 * them later should find that remembered. Undefined when nothing is left, so a fighter with no
 * history carries no empty array in the save.
 */
export function leavingPromotion(
  ledger: readonly LedgerEntry[] | undefined,
  promotionId: PromotionId,
): LedgerEntry[] | undefined {
  const kept = (ledger ?? []).filter(
    (e) => e.promotionId !== promotionId || e.kind === 'cut' || e.kind === 'stripped',
  );
  return kept.length > 0 ? kept : undefined;
}

export interface RelationshipRead {
  /** −100 to 100. Never shown as a number; drives acceptance and the sentence. */
  score: number;
  /** The event weighing most against them right now, for the "why". */
  worst?: LedgerEntry;
  /** The event weighing most in their favour. */
  best?: LedgerEntry;
  label: string;
}

export function relationshipWith(
  fighter: { ledger?: readonly LedgerEntry[]; personality: Personality },
  promotionId: PromotionId,
  day: GameDay,
): RelationshipRead {
  let score = 0;
  let worst: { entry: LedgerEntry; value: number } | undefined;
  let best: { entry: LedgerEntry; value: number } | undefined;
  for (const entry of fighter.ledger ?? []) {
    if (entry.promotionId !== promotionId) continue;
    const age = Math.max(0, day - entry.day);
    const value =
      ledgerWeight(entry.kind, fighter.personality) * 0.5 ** (age / LEDGER_HALF_LIFE_DAYS);
    score += value;
    if (value < 0 && (!worst || value < worst.value)) worst = { entry, value };
    if (value > 0 && (!best || value > best.value)) best = { entry, value };
  }
  score = clamp(score, -100, 100);
  const label =
    score <= -30
      ? 'Bitter'
      : score <= -10
        ? 'Strained'
        : score >= 30
          ? 'Grateful'
          : score >= 10
            ? 'Warm'
            : 'Neutral';
  return { score, worst: worst?.entry, best: best?.entry, label };
}

/** Overall-rating gap that makes a fight a mismatch, either way. */
export const MISMATCH_GAP = 12;

/**
 * What a bout leaves a fighter remembering about the promotion that made it.
 *
 * Pure: the caller decides whose ledger it lands in. The two-sided ones are judged on ratings,
 * not on the result alone — a mismatch is being fed to somebody far better and being finished,
 * and being protected is being handed somebody far worse.
 */
export function boutMemories(input: {
  fighter: Pick<Fighter, 'id' | 'attributes' | 'record'>;
  opponent: Pick<Fighter, 'id' | 'attributes'>;
  boutId: string;
  winnerId?: Fighter['id'];
  method: FinishMethod;
  isTitleFight: boolean;
  championId?: Fighter['id'];
}): LedgerKind[] {
  const { fighter, opponent, boutId, winnerId, method, isTitleFight, championId } = input;
  const out: LedgerKind[] = [];
  if (isTitleFight && fighter.id !== championId) out.push('titleShotGiven');

  const gap = overallRating(opponent.attributes) - overallRating(fighter.attributes);
  const finished = isKoMethod(method) || method === 'submission';
  if (winnerId === opponent.id && finished && gap >= MISMATCH_GAP) out.push('mismatch');
  if (winnerId === fighter.id && gap <= -MISMATCH_GAP) out.push('protected');

  // A rematch they were owed: the last time they met before tonight, this fighter lost.
  const earlier = fighter.record.filter((r) => r.opponentId === opponent.id && r.boutId !== boutId);
  if (earlier[earlier.length - 1]?.outcome === 'loss') out.push('rematchGiven');
  return out;
}

/**
 * How likely a fighter out of contract is to stay where they are, given what they remember.
 *
 * `base` is the world's ordinary loyalty to the incumbent (0.7). A grateful fighter is likelier to
 * stay and a bitter one likelier to walk — the re-signing half of the relationship, which is where
 * a promoter's history with somebody actually costs or saves them a fighter.
 */
export function stayChance(
  fighter: { ledger?: readonly LedgerEntry[]; personality: Personality },
  promotionId: PromotionId,
  day: GameDay,
  base = 0.7,
): number {
  if (!fighter.ledger?.length) return base;
  return clamp(base + relationshipWith(fighter, promotionId, day).score / 200, 0.3, 0.92);
}
