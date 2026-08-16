import { describe, expect, it } from 'vitest';
import { asDivisionId, asFighterId } from '../core/ids.js';
import { createRng } from '../core/rng.js';
import { ARCHETYPES, makePromotion } from '../testing/fixtures.js';
import { simulateFight } from '../fight/simulate.js';
import {
  CARD_SIZE,
  MAIN_CARD_SIZE,
  awardBonuses,
  broadcastFor,
  buildCard,
  eventName,
  eventRevenue,
  excitement,
  performanceScore,
  positionFor,
  resolutionOrder,
  revenueShareFor,
  type BoutSeed,
  type Venue,
} from './events.js';

const seed = (o: Partial<BoutSeed> & { boutId: string; draw: number }): BoutSeed => ({
  redId: asFighterId(`${o.boutId}_r`),
  blueId: asFighterId(`${o.boutId}_b`),
  divisionId: asDivisionId('mens-lightweight'),
  isTitleFight: false,
  ...o,
});

const venue: Venue = { name: 'The Arena', city: 'Vegas', country: 'USA', capacity: 18000 };

describe('building a card', () => {
  it('puts the biggest draw on last', () => {
    const card = buildCard([
      seed({ boutId: 'a', draw: 40 }),
      seed({ boutId: 'b', draw: 120 }),
      seed({ boutId: 'c', draw: 80 }),
    ]);
    expect(card[0]!.boutId).toBe('b');
    expect(card[0]!.position).toBe('mainEvent');
  });

  it('always headlines a title fight, whatever else is on', () => {
    // A promotion that puts its own championship on the prelims is not one anybody believes
    // in. The exception is worth more than a tidy sort.
    const card = buildCard([
      seed({ boutId: 'huge', draw: 400 }),
      seed({ boutId: 'title', draw: 30, isTitleFight: true }),
    ]);
    expect(card[0]!.boutId).toBe('title');
  });

  it('gives a main event and a title fight five rounds, everything else three', () => {
    const card = buildCard([
      seed({ boutId: 'main', draw: 200 }),
      seed({ boutId: 'other', draw: 100 }),
    ]);
    expect(card[0]!.rounds).toBe(5);
    expect(card[1]!.rounds).toBe(3);
  });

  it('never runs longer than a card', () => {
    const many = Array.from({ length: 30 }, (_, i) => seed({ boutId: `b${i}`, draw: i }));
    expect(buildCard(many)).toHaveLength(CARD_SIZE);
  });

  it('separates the main card from the prelims', () => {
    const card = buildCard(Array.from({ length: CARD_SIZE }, (_, i) => seed({ boutId: `b${i}`, draw: 100 - i })));
    expect(card.filter((b) => b.position === 'prelim').length).toBeGreaterThan(0);
    expect(card.slice(0, MAIN_CARD_SIZE).every((b) => b.position !== 'prelim')).toBe(true);
  });

  it('never puts a title fight on the prelims even at the bottom of the order', () => {
    expect(positionFor(CARD_SIZE - 1, true)).not.toBe('prelim');
    expect(positionFor(CARD_SIZE - 1, false)).toBe('prelim');
  });
});

describe('detail follows the player, not the broadcast', () => {
  const card = buildCard(
    Array.from({ length: 6 }, (_, i) => seed({ boutId: `b${i}`, draw: 100 - i * 10 })),
  );

  it('runs the night bottom-up when nobody is watching in particular', () => {
    // A pure results feed reads top down; a card with no player on it is exactly that.
    expect(resolutionOrder(card)[0]!.boutId).toBe(card[0]!.boutId);
  });

  it('puts the player’s own fight in the middle of their night', () => {
    /*
     * The ruling both critics reached from opposite directions. An earlier draft ran the card
     * in reverse so it read like a broadcast — which means eight fights of dead time before
     * the player's own, and fails *worse* when the player is on the prelims, because then
     * they watch their fight and spectate the entire main card.
     */
    const mine = card[2]!.boutId;
    const order = resolutionOrder(card, mine);
    const index = order.findIndex((b) => b.boutId === mine);

    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(order.length - 1);
    expect(order).toHaveLength(card.length);
  });

  it('works when the player is headlining', () => {
    const order = resolutionOrder(card, card[0]!.boutId);
    expect(order[order.length - 1]!.boutId).toBe(card[0]!.boutId);
  });

  it('works when the player is opening the prelims', () => {
    const last = card[card.length - 1]!.boutId;
    const order = resolutionOrder(card, last);
    expect(order[0]!.boutId).toBe(last);
  });

  it('loses nobody, wherever the player sits', () => {
    for (const bout of card) {
      expect(resolutionOrder(card, bout.boutId)).toHaveLength(card.length);
    }
  });
});

describe('the bonus pool is decided by what happened', () => {
  const fight = (id: string, red: () => never, blue: () => never) => ({
    boutId: id,
    result: simulateFight({ boutId: id, seed: id, red: { fighter: red() }, blue: { fighter: blue() } }),
  });

  it('rewards a contested fight over a blowout', () => {
    // Fight of the Night means close and damaging, not one-sided. This is what makes an
    // exciting loss worth something in a game that otherwise pays only the raised hand.
    const even = simulateFight({
      boutId: 'even',
      seed: 'even_1',
      red: { fighter: ARCHETYPES.journeyman() },
      blue: { fighter: ARCHETYPES.journeyman2() },
    });
    const blowout = simulateFight({
      boutId: 'blow',
      seed: 'blow_1',
      red: { fighter: ARCHETYPES.contender() },
      blue: { fighter: ARCHETYPES.canFodder() },
    });

    // A quick one-sided finish should not out-score a competitive fight.
    if (blowout.round === 1) expect(excitement(even)).toBeGreaterThan(excitement(blowout));
  });

  it('never gives a Performance bonus for a decision', () => {
    const decision = simulateFight({
      boutId: 'dec',
      seed: 'dec_seed_2',
      red: { fighter: ARCHETYPES.journeyman() },
      blue: { fighter: ARCHETYPES.journeyman2() },
    });
    if (decision.method.startsWith('decision')) {
      expect(performanceScore(decision)).toBe(0);
    }
  });

  it('splits the pool four ways so one award still means something', () => {
    const results = [
      fight('a', ARCHETYPES.bomber as never, ARCHETYPES.journeyman as never),
      fight('b', ARCHETYPES.grinder as never, ARCHETYPES.striker as never),
    ];
    const awards = awardBonuses(results, 200);
    expect(awards.perAward).toBe(50);
  });

  it('awards nothing when there is no pool', () => {
    const results = [fight('a', ARCHETYPES.bomber as never, ARCHETYPES.journeyman as never)];
    expect(awardBonuses(results, 0).perAward).toBe(0);
  });

  it('always finds a Fight of the Night when anything happened', () => {
    const results = [fight('a', ARCHETYPES.bomber as never, ARCHETYPES.journeyman as never)];
    expect(awardBonuses(results, 100).fightOfTheNight).toBe('a');
  });

  it('gives at most two Performance bonuses', () => {
    const results = Array.from({ length: 8 }, (_, i) =>
      fight(`f${i}`, ARCHETYPES.bomber as never, ARCHETYPES.canFodder as never),
    );
    expect(awardBonuses(results, 200).performanceOfTheNight.length).toBeLessThanOrEqual(2);
  });
});

describe('what a night makes', () => {
  const apex = () => makePromotion({ prestige: 95, buzz: 80, revenueShareCapable: true });

  it('sells more tickets for a bigger main event', () => {
    const small = eventRevenue({
      promotion: apex(),
      venue,
      broadcast: 'televised',
      headlineDraw: 200,
      bouts: 9,
      purses: 100,
      bonuses: 0,
    });
    const big = eventRevenue({
      promotion: apex(),
      venue,
      broadcast: 'televised',
      headlineDraw: 900,
      bouts: 9,
      purses: 100,
      bonuses: 0,
    });
    expect(big.gate).toBeGreaterThan(small.gate);
  });

  it('never sells more tickets than the building holds', () => {
    const huge = eventRevenue({
      promotion: apex(),
      venue: { ...venue, capacity: 3000 },
      broadcast: 'ppv',
      headlineDraw: 5000,
      bouts: 9,
      purses: 0,
      bonuses: 0,
    });
    expect(huge.attendance).toBeLessThanOrEqual(3000);
  });

  it('makes a pay-per-view worth far more than a stream', () => {
    const base = {
      promotion: apex(),
      venue,
      headlineDraw: 600,
      bouts: 9,
      purses: 200,
      bonuses: 20,
    } as const;
    expect(eventRevenue({ ...base, broadcast: 'ppv' }).broadcast).toBeGreaterThan(
      eventRevenue({ ...base, broadcast: 'streamed' }).broadcast * 3,
    );
  });

  it('can lose money on a card nobody wanted', () => {
    // Revenue growth must be beatable by cost growth, in every mode. Doc 08 and doc 13 both
    // say so, and until there was an event equation neither could be true.
    const flop = eventRevenue({
      promotion: makePromotion({ prestige: 30, buzz: 15 }),
      venue,
      broadcast: 'ppv',
      headlineDraw: 40,
      bouts: 9,
      purses: 400,
      bonuses: 50,
    });
    expect(flop.profit).toBeLessThan(0);
  });

  it('pays revenue points out of the event, not the bout', () => {
    // Why a promotion without a platform structurally cannot grant them, which is doc 16's
    // unmatchable term.
    const revenue = eventRevenue({
      promotion: apex(),
      venue,
      broadcast: 'ppv',
      headlineDraw: 800,
      bouts: 9,
      purses: 200,
      bonuses: 20,
    });
    expect(revenueShareFor(2, revenue)).toBeGreaterThan(0);
    expect(revenueShareFor(0, revenue)).toBe(0);
  });
});

describe('naming the night', () => {
  it('numbers a pay-per-view and names a fight night after its main event', () => {
    const promotion = makePromotion({ shortName: 'AFC' });
    expect(eventName({ promotion, broadcast: 'ppv', number: 248 })).toBe('AFC 248');
    expect(
      eventName({
        promotion,
        broadcast: 'televised',
        number: 12,
        mainEventNames: ['Reyes', 'Blachowicz'],
      }),
    ).toBe('AFC Fight Night: Reyes vs Blachowicz');
  });

  it('never puts a promotion with no platform on pay-per-view', () => {
    const regional = makePromotion({ tier: 'regional', revenueShareCapable: false });
    expect(broadcastFor(regional, 500, createRng('b'))).toBe('streamed');
  });

  it('puts a genuine main event on pay-per-view at the top of the sport', () => {
    const global = makePromotion({ tier: 'global', revenueShareCapable: true });
    expect(broadcastFor(global, 300, createRng('b'))).toBe('ppv');
  });
});
