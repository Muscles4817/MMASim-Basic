/**
 * The night the player fights on.
 *
 * A player's bout used to happen in a vacuum: no card, no position, no undercard, no bonus
 * pool. That made three things impossible at once — card position could not multiply their
 * purse, they could never be given the experience of headlining or opening the prelims, and
 * the night had no other results to report.
 *
 * This builds a real card around the player's fight. The supporting bouts are simulated as
 * results rather than watched, which is the ruling from the design review: **detail follows
 * the player, not the broadcast.**
 */

import {
  applyAftermath,
  awardBonuses,
  bonusPoolFor,
  broadcastFor,
  buildCard,
  createRng,
  planFor,
  displayName,
  drawWeight,
  eventId,
  eventName,
  DELIVERY_MEMORY,
  eventRevenue,
  expectedDemand,
  venueFor,
  settleNight,
  offerOpponents,
  readinessDelay,
  simulateFight,
  type BoutSeed,
  type CardBout,
  type CardPosition,
  type Fighter,
  type FightNight,
  type FightResult,
  type Promotion,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { currentPurse } from './money';
import { settleFightInjuries } from './fightInjuries';

/**
 * Where the player sits on the card, decided before the night rather than after.
 *
 * This is the second axis of a career beside the record, and the reason it matters: being a
 * 12-0 prelim fighter is a real and frustrating situation, and getting off the prelims is a
 * genuine milestone. It is driven by draw and stakes, which is exactly what a matchmaker
 * uses.
 */
export function playerCardPosition(
  fighter: Fighter,
  opponent: Fighter,
  isTitleFight: boolean,
): CardPosition {
  if (isTitleFight) return 'mainEvent';
  const draw = (fighter.starPower + opponent.starPower) / 2;
  if (draw >= 62) return 'mainEvent';
  if (draw >= 45) return 'coMain';
  if (draw >= 24) return 'mainCard';
  return 'prelim';
}

export interface NightOutcome {
  night: FightNight;
  /** Every supporting bout's result, for the card's results feed. */
  undercard: readonly { bout: CardBout; result: FightResult }[];
  /** What the player was awarded, if anything. */
  playerBonus: number;
  notes: readonly string[];
}

/**
 * Build and run the rest of the card the player's fight sat on.
 *
 * Called *after* the player's bout has resolved, because the bonus pool is decided by what
 * actually happened across the whole night and the player's fight is part of that comparison.
 */
export function runSupportingCard(
  db: GameDb,
  input: {
    playerBoutId: string;
    player: Fighter;
    opponent: Fighter;
    playerResult: FightResult;
    promotion: Promotion;
    day: number;
    isTitleFight: boolean;
  },
): NightOutcome | undefined {
  const { playerBoutId, player, opponent, playerResult, promotion, day, isTitleFight } = input;
  const world = getWorld(db);
  const rng = createRng(`${world.seed}:night:${playerBoutId}`);

  const position = playerCardPosition(player, opponent, isTitleFight);
  const playerDraw = drawWeight({
    promotion,
    red: player,
    blue: opponent,
    heat: 0,
    isRivalry: false,
    isTitleFight,
  });

  // --- The rest of the card ------------------------------------------------------------------
  const available = (db.fighters.findAll() as Fighter[]).filter(
    (f) =>
      f.retiredDay === undefined &&
      f.id !== player.id &&
      f.id !== opponent.id &&
      f.promotionId === promotion.id,
  );

  const seeds: BoutSeed[] = [
    {
      boutId: playerBoutId,
      redId: player.id,
      blueId: opponent.id,
      divisionId: player.divisionId,
      isTitleFight,
      // Nudged so the player lands at the position the matchmaker decided, rather than
      // wherever a pure draw sort happens to put them.
      draw: playerDraw + positionBias(position),
    },
  ];

  const used = new Set<string>([player.id as string, opponent.id as string]);
  for (let i = 0; i < 12 && seeds.length < 6; i++) {
    const pool = available.filter((f) => !used.has(f.id as string));
    if (pool.length < 2) break;

    const subject = rng.pick(pool);
    const offers = offerOpponents(subject, pool, promotion, day, rng.fork(`m${i}`));
    if (offers.length === 0) continue;
    const other = offers[0]!.opponent;
    if (used.has(other.id as string)) continue;

    used.add(subject.id as string);
    used.add(other.id as string);
    seeds.push({
      boutId: `under:${playerBoutId}:${i}`,
      redId: subject.id,
      blueId: other.id,
      divisionId: subject.divisionId,
      isTitleFight: false,
      draw: drawWeight({
        promotion,
        red: subject,
        blue: other,
        heat: 0,
        isRivalry: false,
        isTitleFight: false,
      }),
    });
  }

  const card = buildCard(seeds);
  const broadcast = broadcastFor(promotion, playerDraw, rng.fork('broadcast'));

  // --- Run the undercard as results -----------------------------------------------------------
  const undercard: { bout: CardBout; result: FightResult }[] = [];
  const results: { boutId: string; result: FightResult }[] = [
    { boutId: playerBoutId, result: playerResult },
  ];

  for (const bout of card) {
    if (bout.boutId === playerBoutId) continue;
    const red = db.fighters.findById(bout.redId as string) as Fighter | undefined;
    const blue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;
    if (!red || !blue) continue;

    const result = simulateFight({
      boutId: bout.boutId,
      // The rest of the card gets the same treatment the player's opponent always got.
      red: { fighter: red, plan: planFor(red, blue) },
      blue: { fighter: blue, plan: planFor(blue, red) },
      rounds: bout.rounds,
      seed: `${world.seed}:${bout.boutId}`,
    });

    const after = applyAftermath({
      result,
      red,
      blue,
      day,
      divisionId: red.divisionId,
      promotionId: promotion.id,
      promotionPrestige: promotion.prestige,
      isTitleFight: bout.isTitleFight,
      rng: rng.fork(`a:${bout.boutId}`),
    });
    // The undercard is a real fight for the people in it. Same settlement as the main event.
    const hurtRed = settleFightInjuries({
      fighter: after.red,
      result,
      corner: 'red',
      day,
      rng: rng.fork(`hurt:${bout.boutId}:red`),
    }).fighter;
    const hurtBlue = settleFightInjuries({
      fighter: after.blue,
      result,
      corner: 'blue',
      day,
      rng: rng.fork(`hurt:${bout.boutId}:blue`),
    }).fighter;
    db.fighters.upsert(hurtRed as Fighter & Entity);
    db.fighters.upsert(hurtBlue as Fighter & Entity);

    // The suspension the undercard used to throw away outright.
    const loserId = result.winnerId !== undefined && result.winnerId === red.id ? blue.id : red.id;
    for (const f of [hurtRed, hurtBlue]) {
      const stored = db.fighters.findById(f.id as string) as Fighter | undefined;
      if (!stored) continue;
      db.fighters.upsert({
        ...stored,
        readyOnDay:
          day + readinessDelay(f, f.id === loserId && result.winnerId !== undefined ? result.method : undefined),
      } as Fighter & Entity);
    }

    undercard.push({ bout, result });
    results.push({ boutId: bout.boutId, result });
  }

  // --- The bonuses ------------------------------------------------------------------------------
  const bonusPool = bonusPoolFor(promotion);
  const awards = awardBonuses(results, bonusPool);

  const notes: string[] = [];
  let playerBonus = 0;

  if (awards.fightOfTheNight === playerBoutId) {
    playerBonus += awards.perAward;
    notes.push(
      `Fight of the Night. £${awards.perAward}k, and the kind of fight people remember losing.`,
    );
  }
  if (awards.performanceOfTheNight.includes(player.id)) {
    playerBonus += awards.perAward;
    notes.push(`Performance of the Night. £${awards.perAward}k for the finish.`);
  }

  if (playerBonus > 0) {
    const current = db.fighters.getById(player.id as string) as Fighter;

    /*
     * Stamp the award on the record, not only on the bank.
     *
     * `awardBonuses` has picked Performance and Fight of the Night since the events layer
     * shipped, and the award was paid and then forgotten — it reached the purse and never the
     * fight record, so nothing downstream could know a fighter had ever won one. It is the
     * promotion publicly calling a night one of the best on the card, which is exactly what
     * should move somebody up a queue faster than their bare record justifies. See
     * `standing.ts`, which now reads it.
     */
    const bonusKind: 'performance' | 'fight' = awards.performanceOfTheNight.includes(player.id)
      ? 'performance'
      : 'fight';

    const record = current.record.map((entry, index) =>
      index === current.record.length - 1 ? { ...entry, bonus: bonusKind } : entry,
    );

    db.fighters.upsert({
      ...current,
      record,
      bank: round1(current.bank + playerBonus),
      lifetimeGross: round1(current.lifetimeGross + playerBonus),
      lifetimeNet: round1(current.lifetimeNet + playerBonus * 0.6),
    } as Fighter & Entity);
  }

  const headlineDraw = headlineDrawOf(card, seeds, playerDraw);
  const venue = venueFor(
    promotion,
    expectedDemand(promotion, headlineDraw, card.length),
    rng.fork('venue'),
  );

  /*
   * Revenue first, because the night wants one number out of it.
   *
   * `attendance` is the only thing separating "you fought at Riverside Hall" from "you fought
   * in front of 9,412 people at Riverside Hall", and the second is the sentence that makes a
   * card position feel like anything. Computed here rather than inside `settleNight` below so
   * the stored night carries it; `settleNight` is handed the same object, so nothing is
   * computed twice and no number can disagree with itself.
   */
  const revenue = eventRevenue({
    promotion,
    venue,
    broadcast,
    // The player's own bout is not necessarily the headline — `playerCardPosition` decides
    // that — so this reads the draw of whatever actually tops the card.
    headlineDraw,
    bouts: card.length,
    purses: cardPurses(db, card),
    bonuses: bonusPool,
  });

  const night: FightNight = {
    id: eventId(promotion.id, day),
    promotionId: promotion.id,
    day,
    name: eventName({
      promotion,
      broadcast,
      number: Math.floor(day / 14) + 1,
      mainEventNames: [displayName(player), displayName(opponent)],
    }),
    venue,
    broadcast,
    status: 'complete',
    bouts: card,
    bonusPool,
    attendance: revenue.attendance,
  };
  db.events.upsert(night as FightNight & Entity);

  /*
   * What the night did to the promotion. The revenue was computed here and discarded
   * (`void revenue`), so the player's own cards — the ones they headline, the ones that sell
   * — were the only events in the game with no effect on the promotion running them.
   *
   * Which meant a player could main-event a promotion for a decade and its budget, and so
   * every purse it paid including their own, would not have moved once.
   */
  /*
   * Re-read rather than reusing the `promotion` captured at the top of this function.
   *
   * Bouts on this card may have changed a title, and `finalise` writes that to the stored
   * promotion. Settling against the stale object and upserting it would silently roll the new
   * champion back — which is exactly what happened when this was first written, and it showed
   * up as belts that never changed hands across five simulated years.
   */
  const current =
    (db.promotions.findById(promotion.id as string) as Promotion | undefined) ?? promotion;

  const settled = settleNight({
    promotion: current,
    revenue,
    results: results.map((r) => r.result),
    recentDelivery: current.recentDelivery,
  });
  db.promotions.upsert({
    ...settled.promotion,
    recentDelivery: [...(current.recentDelivery ?? []), settled.delivered].slice(-DELIVERY_MEMORY),
  } as Promotion & Entity);

  return { night, undercard, playerBonus, notes };
}

/** Nudge so the matchmaker's chosen position survives the draw-weight sort. */
function positionBias(position: CardPosition): number {
  switch (position) {
    case 'mainEvent':
      return 400;
    case 'coMain':
      return 200;
    case 'mainCard':
      return 60;
    case 'prelim':
      return -60;
  }
}

/** The night a bout belongs to, for the event screen. */
export function nightFor(db: GameDb, boutId: string): FightNight | undefined {
  return (db.events.findAll() as (FightNight & Entity)[]).find((night) =>
    night.bouts.some((b) => b.boutId === boutId),
  );
}

export const positionLabel = (position: CardPosition): string =>
  position === 'mainEvent'
    ? 'Main event'
    : position === 'coMain'
      ? 'Co-main event'
      : position === 'mainCard'
        ? 'Main card'
        : 'Preliminary card';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** What the promotion paid the card. Mirrors the world's card runner. */
function cardPurses(db: GameDb, card: readonly CardBout[]): number {
  let total = 0;
  for (const bout of card) {
    for (const id of [bout.redId, bout.blueId]) {
      const fighter = db.fighters.findById(id as string) as Fighter | undefined;
      if (!fighter) continue;
      const purse = currentPurse(db, fighter, bout.position);
      if (purse) total += purse.show + purse.win * 0.5;
    }
  }
  return Math.round(total);
}

/** Draw weight of whatever bout actually tops the card. */
function headlineDrawOf(
  card: readonly CardBout[],
  seeds: readonly BoutSeed[],
  fallback: number,
): number {
  const top = card[0];
  if (!top) return fallback;
  return seeds.find((s) => s.boutId === top.boutId)?.draw ?? fallback;
}
