/**
 * Where you stand *here*, as opposed to how well known you are in general.
 *
 * `rankDivision` scored a fighter as `reputation * 1.6 + streak + starPower * 0.25`. Ability
 * appeared nowhere, which is defensible — real rankings are results-based — but neither did any
 * notion of *where the results happened*. Reputation banked beating regional opposition counted
 * identically to reputation banked beating contenders, so a fighter could arrive from a feeder
 * promotion and slot straight into the top five of the best division in the sport without having
 * fought anybody in it. Measured: a 58-rated light heavyweight entered the UFC at #4, in a
 * division twenty deep whose best fighter is rated 79 and where that fighter's raw ability puts
 * them eleventh.
 *
 * The fix is not to discard what somebody did before they arrived. Outside credibility is real —
 * a champion coming over from a major promotion is genuinely a bigger deal than a debutant, and
 * the sport does fast-track them. It is that the credibility has to be *discounted by the gap
 * between the rooms*, and that it has to **fade as real results replace it**.
 *
 * That gives the shape the request actually described. Somebody arriving with a serious outside
 * reputation who immediately starts finishing people and collecting performance bonuses climbs
 * very fast, because the carry-in gets them a foot in the door and the finishes do the rest —
 * which is precisely the Pereira path, four fights from debut to champion. Somebody arriving with
 * the same reputation who wins dull decisions climbs slowly. And somebody arriving from two tiers
 * below with nothing behind them starts at the bottom and has to earn all of it.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { PromotionId } from '../core/ids.js';
import { isDecisionMethod, type Fighter, type FightRecordEntry } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';

/**
 * How much of a reputation earned elsewhere is worth here, 0–1.
 *
 * Moving *up* costs you: the further the step, the less of your standing survives it, because
 * the room you built it in was easier than this one. Moving *down* or sideways carries almost
 * everything, since beating better people is never worth less than beating worse ones.
 */
export function transferRate(from: Promotion | undefined, to: Promotion): number {
  // Nothing behind you is nothing to discount. A debutant carries no standing either way.
  if (!from) return 0.25;
  if (from.id === to.id) return 1;

  // Prestige rather than tier, so the gap between a strong regional and a weak major is
  // small — which is true, and a tier enum would make it a cliff.
  const gap = to.prestige - from.prestige;
  if (gap <= 0) return 1;

  // At a 60-point gap — a feeder against the biggest promotion in the sport — roughly a fifth
  // of what you built survives the move. That is enough to be ranked, and nowhere near enough
  // to be ranked highly.
  return clamp(remap(gap, 0, 60, 1, 0.2), 0.2, 1);
}

/** Bouts this fighter has had inside this promotion, most recent first. */
export function boutsWith(
  record: readonly FightRecordEntry[],
  promotionId: PromotionId,
): FightRecordEntry[] {
  return record.filter((r) => r.promotionId === promotionId).sort((a, b) => b.day - a.day);
}

/**
 * How much a single night here was worth.
 *
 * A finish counts for roughly twice a decision, and a performance bonus counts for more again —
 * that is the promotion publicly saying this was one of the best things on the card, and it is
 * exactly what moves somebody up a queue faster than their record alone justifies.
 */
export function boutValue(
  bout: FightRecordEntry,
  /**
   * How highly the sport rated the opponent, 0–1 (doc 34 B6). A win over somebody respected is
   * worth more than a win over a name nobody knows, and a loss to them costs less. Half is par,
   * and par leaves the value exactly as it was, so a caller without the opponent changes nothing.
   */
  opponentQuality = 0.5,
): number {
  const q = clamp01(opponentQuality);
  // Being finished is worse than being outpointed, and the sport treats it that way.
  if (bout.outcome === 'loss') {
    return (isDecisionMethod(bout.method) ? -7 : -10) * (1.3 - 0.6 * q);
  }
  if (bout.outcome !== 'win') return 0.5;

  const finish = !isDecisionMethod(bout.method);
  let value = finish ? 9 : 5;

  // The promotion's own verdict on the night, which nothing was recording until now.
  if (bout.bonus === 'performance') value += 4;
  else if (bout.bonus === 'fight') value += 2;

  // Beating the champion, or winning the belt, is not just another win.
  if (bout.wasTitleFight) value += 5;

  // Taking a fight nobody had time to prepare for is credit in every promotion in the sport.
  if (bout.shortNotice) value += 2;

  return value * (0.7 + 0.6 * q);
}

/** Recency. Last year is what you are; three years ago is history. */
const recencyWeight = (daysAgo: number): number => clamp01(remap(daysAgo, 0, 1100, 1, 0.15));

/**
 * What this fighter has actually done inside this promotion.
 *
 * Unbounded above rather than clamped to 0–100, because it is compared against other people's
 * rather than read as a percentage, and clamping would flatten the top of a deep division.
 *
 * Recency is measured back from their **latest fight here**, not from today (doc 34 B6). Measured
 * from today, a contender's standing leaked away every day they waited for their next fight, so
 * the #1 contender dropped out of the spot while doing exactly what a #1 contender does — waiting
 * for the title shot. Standing now moves when somebody fights; sitting out is charged separately,
 * and only once it is genuinely too long (`inactivityPenalty`).
 */
export function promotionStanding(input: {
  record: readonly FightRecordEntry[];
  promotionId: PromotionId;
  day: GameDay;
  /** The opponent's quality, 0–1, for weighing each result. Par when not supplied. */
  opponentQuality?: (opponentId: FightRecordEntry['opponentId']) => number;
}): number {
  const { record, promotionId, day, opponentQuality } = input;
  const bouts = boutsWith(record, promotionId);
  const latest = bouts[0]?.day ?? day;
  return bouts.reduce(
    (total, bout) =>
      total +
      boutValue(bout, opponentQuality?.(bout.opponentId)) * recencyWeight(latest - bout.day),
    0,
  );
}

/** A year out is a normal gap between big fights. Past it, the ranking starts to move on. */
export const INACTIVITY_GRACE_DAYS = 365;

/**
 * What sitting out costs, in ranking points: nothing for a year, then two points a month, capped.
 * Measured from the last fight anywhere, because a fighter busy elsewhere is not inactive.
 */
export function inactivityPenalty(record: readonly FightRecordEntry[], day: GameDay): number {
  if (record.length === 0) return 0;
  const last = record.reduce((latest, r) => Math.max(latest, r.day), -Infinity);
  const idle = day - last - INACTIVITY_GRACE_DAYS;
  return idle <= 0 ? 0 : Math.min(30, (idle / 30) * 2);
}

/**
 * The run that earns a title shot: wins since the last loss.
 *
 * A draw or a no contest pauses a run rather than ending it (doc 34 B6). `summary.streak` resets
 * on a draw, which is right for the record line and wrong for the queue: a 10-0 fighter who draws
 * once is not back at the start of the line. A career that exists only as a prior record has no
 * bouts to read, and falls back to its streak.
 */
export function winningRun(fighter: Pick<Fighter, 'record' | 'summary'>): number {
  if (fighter.record.length === 0) return Math.max(0, fighter.summary.streak);
  return currentRun(fighter.record).length;
}

/** The wins since the last loss, most recent first; draws and no contests are passed over. */
function currentRun(record: readonly FightRecordEntry[]): FightRecordEntry[] {
  const wins: FightRecordEntry[] = [];
  for (let i = record.length - 1; i >= 0; i--) {
    const entry = record[i]!;
    if (entry.outcome === 'loss') break;
    if (entry.outcome === 'win') wins.push(entry);
  }
  return wins;
}

/**
 * How fast the carry-in fades.
 *
 * Full weight on debut, essentially gone by the fifth or sixth fight in the promotion. Somebody
 * who arrived with a huge name and then went 1-4 should be ranked on the 1-4, and somebody who
 * arrived unknown and went 4-0 should not still be carrying their debut discount.
 */
export function carryWeight(boutsHere: number): number {
  return clamp01(1 - boutsHere / 6);
}

/**
 * The ranking score: what you did here, plus what is left of what you did elsewhere.
 *
 * `starPower` still contributes, and deliberately only a little. Promotions do rank draws
 * generously and pretending otherwise would make the matchmaking philosophies meaningless, but
 * it must not be possible to be ranked purely for being famous.
 */
export function standingScore(input: {
  fighter: Fighter;
  promotion: Promotion;
  /** Where their outside reputation was built. Undefined for a genuine unknown. */
  previous?: Promotion;
  day: GameDay;
  /** The opponent's quality, 0–1, so a win over somebody respected counts for more. */
  opponentQuality?: (opponentId: FightRecordEntry['opponentId']) => number;
}): number {
  const { fighter, promotion, previous, day, opponentQuality } = input;

  const here = boutsWith(fighter.record, promotion.id);
  const earned = promotionStanding({
    record: fighter.record,
    promotionId: promotion.id,
    day,
    opponentQuality,
  });

  const carried =
    fighter.reputation * transferRate(previous, promotion) * carryWeight(here.length) * 0.9;

  // The run a draw pauses rather than ends; a losing streak still costs what it did. Only the
  // run's wins *here* count: wins elsewhere are already in the carried reputation, discounted for
  // the room they came from, and counting them again let a streak built two tiers down buy a
  // place near the top. A career that exists only as a prior record falls back to its streak.
  const run =
    fighter.record.length === 0
      ? winningRun(fighter)
      : currentRun(fighter.record).filter((r) => r.promotionId === promotion.id).length;
  const losing = Math.min(0, fighter.summary.streak);

  return (
    earned +
    carried +
    run * 3 +
    losing * 5 +
    fighter.starPower * 0.15 -
    inactivityPenalty(fighter.record, day)
  );
}
