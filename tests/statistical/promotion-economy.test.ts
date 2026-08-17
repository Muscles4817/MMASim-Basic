/**
 * The economics of running a fight promotion.
 *
 * This suite exists because three separate bugs lived in this system for weeks with a full
 * green build, and every one of them was the kind that only shows up when you *measure the
 * shipped world* rather than test a function against a fixture:
 *
 * 1. **The card-composition inversion.** `eventRevenue` keyed demand off the *sum* of draw
 *    weight across a card. Since `marketValue` is a 2.6-power law in star power while
 *    `drawWeight` is linear in it, costs were superlinear and demand linear — so a card of
 *    nine anonymous mid-carders out-earned one built around a marquee main event, 3,573 to
 *    2,878. The correct strategy was to never sign anybody famous.
 *
 * 2. **The inverted delivery metric.** `settleNight` judged "did this card deliver" with
 *    `excitement()`, which is the Fight-of-the-Night metric. Against its par of 55 a
 *    first-round knockout scored 27 and a dull 44–30 decision scored 60 — so finishes lowered
 *    a promotion's standing and forgettable decisions raised it.
 *
 * 3. **The buzz ratchet.** Cards were judged against a fixed global par, so every promotion
 *    met it forever and pinned at 100. Measured across eight simulated years, the entire sport
 *    saturated and the only feedback signal in the model stopped discriminating at all.
 *
 * So the tests below are deliberately of two kinds, and the second kind is the point:
 *
 * - **Regression bounds** on the three specific defects, so they cannot come back quietly.
 * - **Invariants** — properties that must hold for *any* sane economy. These are written to
 *   fail loudly on problems nobody has thought of yet, which is the only kind of test that
 *   would have caught the three above. They report measured values in their failure messages
 *   rather than asserting bare numbers, so a failure tells you what the economy is doing.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  PAR_CARD_DELIVERY,
  createRng,
  deliveryScore,
  depthMultiplier,
  drawWeight,
  eventRevenue,
  expectedDemand,
  marketValue,
  settleNight,
  ticketPrice,
  VENUES,
  venueFor,
  type FightNight,
  type FightResult,
  type Fighter,
  type Promotion,
  type Venue,
} from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const ARENA: Venue = { name: 'Arena', city: 'Las Vegas', country: 'USA', capacity: 18000 };

const game = () => createNewGame({ adapter: undefined });
const promotions = (db: ReturnType<typeof game>) =>
  db.promotions.findAll() as unknown as Promotion[];

/** Run the world a year at a time. A single multi-year call is silently truncated. */
function runYears(db: ReturnType<typeof game>, years: number) {
  const player = (db.fighters.findAll() as Fighter[])[0]!;
  for (let y = 0; y < years; y++) advanceWorld(db, y * 365, (y + 1) * 365, player.id);
}

/** A result with the two properties `deliveryScore` actually reads: did it end, was it close. */
function result(o: {
  method: string;
  round?: number;
  red: number;
  blue: number;
  knockdowns?: number;
  subs?: number;
}): FightResult {
  return {
    method: o.method,
    round: o.round ?? 3,
    timeSeconds: 300,
    winnerId: 'f_red',
    stats: {
      red: {
        significantStrikesLanded: o.red,
        knockdowns: o.knockdowns ?? 0,
        submissionAttempts: o.subs ?? 0,
      },
      blue: { significantStrikesLanded: o.blue, knockdowns: 0, submissionAttempts: 0 },
    },
  } as unknown as FightResult;
}

// --- 1. A card is sold by its main event -------------------------------------------------------

describe('what sells a card', () => {
  const build = (pairs: readonly (readonly [number, number])[]) => {
    const db = game();
    const promotion = promotions(db)[0]!;
    const base = (db.fighters.findAll() as Fighter[])[0]!;
    const at = (starPower: number) => ({ ...base, starPower, reputation: starPower });

    let purses = 0;
    const draws = pairs.map(([a, b]) => {
      const red = at(a);
      const blue = at(b);
      purses += marketValue(red, promotion) + marketValue(blue, promotion);
      return drawWeight({
        promotion,
        red,
        blue,
        heat: 0,
        isRivalry: false,
        isTitleFight: false,
      });
    });

    return eventRevenue({
      promotion,
      venue: ARENA,
      broadcast: 'ppv',
      headlineDraw: Math.max(...draws),
      bouts: pairs.length,
      purses: Math.round(purses),
      bonuses: 200,
    });
  };

  const STAR_HEADLINED = [[85, 82], ...Array.from({ length: 8 }, () => [20, 20] as const)] as const;
  const NINE_NOBODIES = Array.from({ length: 9 }, () => [40, 40] as const);

  it('pays for a marquee main event', () => {
    /*
     * The regression bound on the inversion. A card built around a genuine draw must out-earn
     * a card of interchangeable mid-carders, or the whole business layer rewards a strategy
     * no promoter has ever run and the game's central fantasy is a trap.
     */
    const marquee = build(STAR_HEADLINED);
    const filler = build(NINE_NOBODIES);
    expect(
      marquee.profit,
      `star-headlined ${JSON.stringify(marquee)} vs nine nobodies ${JSON.stringify(filler)}`,
    ).toBeGreaterThan(filler.profit);
  });

  it('does not merely tie — the gap has to be worth chasing', () => {
    // A 5% edge is not a reason to sign anybody. The decision has to pay for itself.
    const marquee = build(STAR_HEADLINED);
    const filler = build(NINE_NOBODIES);
    expect(marquee.profit).toBeGreaterThan(filler.profit * 1.5);
  });

  it('charges more for a ticket when the headline is bigger', () => {
    /*
     * `ticketPrice` is declared to take the *headline* draw and clamps it at 400, and was
     * being handed the card total — which is past the clamp for every real card, so the price
     * a promotion charged was a constant regardless of who was on top of the bill.
     */
    const db = game();
    const apex = promotions(db)[0]!;
    expect(ticketPrice(apex, 300)).toBeGreaterThan(ticketPrice(apex, 60));
  });

  it('discounts a thin card without letting depth become the whole product', () => {
    // Nobody buys a ticket because the card is nine fights rather than six; they refuse to buy
    // one because it is three. Depth prevents a discount, it does not create a gate.
    expect(depthMultiplier(2)).toBeLessThan(depthMultiplier(5));
    expect(depthMultiplier(5)).toBeLessThan(depthMultiplier(9));
    // Saturating: the fifth bout matters and the ninth does not.
    expect(depthMultiplier(9) - depthMultiplier(5)).toBeLessThan(
      depthMultiplier(5) - depthMultiplier(2),
    );
    expect(depthMultiplier(20)).toBeLessThanOrEqual(1);
  });
});

// --- 2. What a good night is -------------------------------------------------------------------

describe('what counts as a good card', () => {
  it('rates a finish above a promotion’s par', () => {
    // The regression bound. A first-round knockout scored 27 against a par of 55, so knockouts
    // actively damaged a promotion's standing.
    expect(deliveryScore(result({ method: 'ko', round: 1, red: 8, blue: 3, knockdowns: 1 }))).toBeGreaterThan(
      PAR_CARD_DELIVERY,
    );
    expect(
      deliveryScore(result({ method: 'submission', round: 1, red: 4, blue: 2, subs: 1 })),
    ).toBeGreaterThan(PAR_CARD_DELIVERY);
  });

  it('rates a competitive decision as a good night too', () => {
    // A fight people argue about afterwards is a good night even though nobody got finished.
    expect(
      deliveryScore(result({ method: 'decisionSplit', red: 78, blue: 71 })),
    ).toBeGreaterThan(PAR_CARD_DELIVERY);
  });

  it('rates a one-sided decision as a bad one', () => {
    // The thing this metric exists to stop rewarding.
    expect(
      deliveryScore(result({ method: 'decisionUnanimous', red: 95, blue: 11 })),
    ).toBeLessThan(PAR_CARD_DELIVERY / 2);
  });

  it('does not reward strike volume for its own sake', () => {
    /*
     * The specific shape of the old bug. `excitement()` is dominated by total strikes landed,
     * which is why a grinding decision beat a knockout. A close fight is a close fight at
     * twenty strikes or two hundred.
     */
    const busy = deliveryScore(result({ method: 'decisionUnanimous', red: 100, blue: 92 }));
    const quiet = deliveryScore(result({ method: 'decisionUnanimous', red: 25, blue: 23 }));
    expect(Math.abs(busy - quiet)).toBeLessThan(PAR_CARD_DELIVERY * 0.2);
  });

  it('never rates a shutout above a finish', () => {
    // The invariant behind all four above, stated once so it cannot be satisfied by accident.
    const worstFinish = deliveryScore(result({ method: 'tko', round: 1, red: 6, blue: 5 }));
    const bestShutout = deliveryScore(result({ method: 'decisionUnanimous', red: 200, blue: 12 }));
    expect(bestShutout).toBeLessThan(worstFinish);
  });
});

// --- 3. Buzz has to be able to fall ------------------------------------------------------------

describe('a promotion’s standing', () => {
  const apex = () => promotions(game())[0]!;
  const revenue = (profit: number) => ({
    gate: profit,
    broadcast: 0,
    costs: 0,
    profit,
    attendance: 1000,
  });

  it('rises on a card that beats what the promotion usually does', () => {
    const settled = settleNight({
      promotion: apex(),
      revenue: revenue(0),
      results: [result({ method: 'ko', round: 2, red: 22, blue: 14, knockdowns: 1 })],
      recentDelivery: [40, 45, 38],
    });
    expect(settled.buzzDelta).toBeGreaterThan(0);
  });

  it('falls on a card that does not', () => {
    const settled = settleNight({
      promotion: apex(),
      revenue: revenue(0),
      results: [result({ method: 'decisionUnanimous', red: 95, blue: 11 })],
      recentDelivery: [90, 88, 95],
    });
    expect(settled.buzzDelta).toBeLessThan(0);
  });

  it('gives no credit for merely meeting your own standard', () => {
    /*
     * The heart of the ratchet fix. Under a fixed global par, a promotion that had been putting
     * on great cards for two years kept being rewarded for putting on another one, so buzz
     * climbed forever. You are only as good as your last card, measured against your last six.
     */
    const same = result({ method: 'decisionSplit', red: 78, blue: 71 });
    const score = deliveryScore(same);
    const settled = settleNight({
      promotion: apex(),
      revenue: revenue(0),
      results: [same],
      recentDelivery: [score, score, score],
    });
    expect(Math.abs(settled.buzzDelta)).toBeLessThan(0.2);
  });

  it('judges a promotion with no history against par rather than against nothing', () => {
    const settled = settleNight({ promotion: apex(), revenue: revenue(0), results: [] });
    expect(settled.buzzDelta).toBe(0);
  });

  it('reports what the card scored so the caller can remember it', () => {
    // Without this the relative baseline has nothing to be built from.
    const settled = settleNight({
      promotion: apex(),
      revenue: revenue(0),
      results: [result({ method: 'ko', round: 2, red: 22, blue: 14, knockdowns: 1 })],
    });
    expect(settled.delivered).toBeGreaterThan(0);
  });
});

// --- 4. Venues -------------------------------------------------------------------------------

describe('booking a building', () => {
  it('does not put a regional show in an arena', () => {
    /*
     * Both card runners kept their own copy of the venue list and picked from it uniformly, so
     * the smallest promotion in the game booked an 18,000-seat arena as often as the global
     * one — and since production cost scales with capacity, it paid arena overheads to put a
     * few hundred people in the building.
     */
    const db = game();
    const all = promotions(db).slice().sort((a, b) => a.prestige - b.prestige);
    const smallest = all[0]!;
    const venue = venueFor(smallest, expectedDemand(smallest, 40, 3), createRng('v'));
    expect(venue.capacity, `${smallest.shortName} booked a ${venue.capacity}-seat room`).toBeLessThan(
      10000,
    );
  });

  it('gives a promotion room to grow into', () => {
    const db = game();
    const apex = promotions(db)[0]!;
    const small = venueFor(apex, 2000, createRng('a'));
    const big = venueFor(apex, 14000, createRng('b'));
    expect(big.capacity).toBeGreaterThan(small.capacity);
  });

  it('never books a room far bigger than the crowd it expects', () => {
    /*
     * The invariant: a building is chosen for the crowd. Exempts the case where the smallest
     * venue in the game is already too big — a promotion drawing four hundred people has
     * nowhere smaller to go, and that is a gap in the venue list rather than a bad choice.
     */
    const db = game();
    const smallest = Math.min(...VENUES.map((v) => v.capacity));
    for (const promotion of promotions(db)) {
      for (const demand of [500, 4000, 20000]) {
        const venue = venueFor(promotion, demand, createRng(`${promotion.id}:${demand}`));
        if (venue.capacity === smallest) continue;
        const filled = Math.min(venue.capacity, demand) / venue.capacity;
        expect(
          filled,
          `${promotion.shortName} at demand ${demand} booked ${venue.capacity} and filled ${(filled * 100).toFixed(0)}%`,
        ).toBeGreaterThan(0.5);
      }
    }
  });
});

// --- 5. The world's economy, measured -----------------------------------------------------------

describe('the sport over eight years', () => {
  /*
   * The invariant tests. These run the shipped world and assert properties of the *outcome*
   * rather than of any function, because all three of the bugs this suite exists for were
   * invisible at the function level and obvious the moment anybody ran the world and looked.
   *
   * Run a year at a time on purpose: a single multi-year call is silently truncated by
   * MAX_FIGHTS_PER_CALL, which is exactly how an earlier measurement of this economy came back
   * looking healthy when it was not.
   */
  const db = game();
  runYears(db, 8);
  const after = promotions(db);
  const before = new Map(promotions(game()).map((p) => [p.id as string, p]));
  const summary = after
    .map((p) => `${p.shortName} ${Math.round(p.budget)}k buzz ${p.buzz}`)
    .join(' | ');

  it('does not let attention saturate', () => {
    /*
     * The ratchet regression bound. Every promotion's buzz used to climb monotonically to 100
     * and stay there, at which point the sole feedback signal in the whole model stopped
     * distinguishing the best promotion in the sport from the worst.
     */
    const pinned = after.filter((p) => p.buzz >= 99);
    expect(pinned.length, `pinned at maximum: ${summary}`).toBe(0);
  });

  it('keeps the sport spread out rather than converging', () => {
    // A world where every promotion ends up equally famous is one where none of the player's
    // choices about who to fight for mattered.
    const buzzes = after.map((p) => p.buzz);
    const spread = Math.max(...buzzes) - Math.min(...buzzes);
    expect(spread, `buzz spread only ${spread.toFixed(1)}: ${summary}`).toBeGreaterThan(20);
  });

  it('runs more cards for a bigger promotion than a smaller one', () => {
    /*
     * `rng.pick(promotions)` was uniform, so a developmental promotion put on as many shows a
     * year as the global one — which is not a thing that happens, and drained the bottom of
     * the sport on a schedule it could never have afforded.
     */
    const events = db.events.findAll() as FightNight[];
    const countFor = (p: Promotion) => events.filter((e) => e.promotionId === p.id).length;
    const ranked = after.slice().sort((a, b) => b.prestige - a.prestige);
    expect(
      countFor(ranked[0]!),
      `${ranked[0]!.shortName} ran ${countFor(ranked[0]!)} cards, ${ranked[ranked.length - 1]!.shortName} ran ${countFor(ranked[ranked.length - 1]!)}`,
    ).toBeGreaterThan(countFor(ranked[ranked.length - 1]!) * 1.5);
  });

  it('does not let the biggest promotion run away with the sport', () => {
    /*
     * Revenue growth must be beatable by cost growth. A market leader that compounds without
     * limit makes every other promotion cosmetic within a decade.
     *
     * Raised from 3x to 3.5x, and the reason is worth recording rather than hiding. This bound
     * was calibrated against a world whose roster was quietly collapsing — the intake generated
     * one fighter in a decade, so the sport ran out of talent, draws shrank, and the leader's
     * pay-per-view revenue shrank with them. With the intake fixed the talent pool holds, the
     * draws are bigger, and the leader earns more from them. That is the correct behaviour and
     * the old number was measuring a broken world.
     *
     * **Still open, and deliberately not papered over here:** in the 2020 world the bottom of the
     * sport does not survive this. Measured over the same eight years, the smallest promotion
     * falls to roughly a third of its starting budget while the leader triples, and the gap
     * between them widens from about 47x to about 400x. Flattening promotion sponsorship helped
     * and did not solve it. The 2026 world holds up far better — every promotion inside 0.55x to
     * 1.94x — so this is specific to the 2020 world's much steeper prestige spread.
     */
    const biggest = after.slice().sort((a, b) => b.budget - a.budget)[0]!;
    const started = before.get(biggest.id as string)!.budget;
    const growth = biggest.budget / started;
    expect(growth, `${biggest.shortName} grew ${growth.toFixed(1)}x in eight years`).toBeLessThan(
      3.5,
    );
  });
});
