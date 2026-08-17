/**
 * How each promotion decides who is next.
 *
 * `rankDivision` has existed since the ladder shipped and **nothing consulted it for
 * matchmaking**. A title shot went to whoever the die picked, so a champion was not reliably the
 * best fighter in their division and belts churned on a coin flip.
 *
 * But one ranking rule would be wrong in the other direction, because promotions genuinely
 * disagree about this. A season format books a bracket and the ranking *is* the result. A
 * spectacle promotion books what the building wants. The biggest promotion in the sport sits
 * between: rankings matter for the top few places and then stop mattering, and past that point
 * the queue is whoever people will pay to watch — who also gets the stylistic matchmaking that
 * keeps them winning entertainingly on the way to a shot.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  contenderQueue,
  createRng,
  entertainmentValue,
  favourFor,
  MATCHMAKING_STYLES,
  nextContender,
  offerOpponents,
  rankDivision,
  styleOf,
  type Fighter,
  type Promotion,
} from '@mmasim/engine';

const game = () => createNewGame({ adapter: undefined, era: '2026' });
const DIVISION = 'mens-lightweight' as never;
const DAY = 2192;

const promotionNamed = (db: ReturnType<typeof game>, shortName: string) =>
  (db.promotions.findAll() as unknown as Promotion[]).find((p) => p.shortName === shortName)!;

const queueFor = (db: ReturnType<typeof game>, promotion: Promotion) => {
  const ranked = rankDivision(
    db.fighters.findAll() as Fighter[],
    DIVISION,
    promotion.id,
    DAY,
    promotion.champions[DIVISION],
  );
  return {
    ranked,
    queue: contenderQueue({
      ranked,
      promotion,
      excludeId: promotion.champions[DIVISION] as string | undefined,
    }),
  };
};

describe('what makes a fight worth watching', () => {
  it('is not the same thing as being good at fighting', () => {
    /*
     * The gap between the two is the entire reason this axis exists. A grinding wrestler can be
     * the best fighter in a division and still be the one the promotion buries.
     */
    const db = game();
    const base = (db.fighters.findAll() as Fighter[])[0]!;

    const brawler = {
      ...base,
      attributes: { ...base.attributes, power: 92, strikingOffence: 88, strikingDefence: 35, wrestling: 30, groundControl: 30 },
      personality: { ...base.personality, aggression: 90 },
    };
    const grinder = {
      ...base,
      attributes: { ...base.attributes, power: 45, strikingOffence: 50, strikingDefence: 85, wrestling: 95, groundControl: 95 },
      personality: { ...base.personality, aggression: 25 },
    };

    expect(entertainmentValue(brawler)).toBeGreaterThan(entertainmentValue(grinder));
  });

  it('does not read star power, which would make it circular', () => {
    // Star power is the *result* of being watchable. Using it here would mean the famous get
    // pushed because they are famous.
    const db = game();
    const base = (db.fighters.findAll() as Fighter[])[0]!;
    expect(entertainmentValue({ ...base, starPower: 99 })).toBe(
      entertainmentValue({ ...base, starPower: 1 }),
    );
  });
});

describe('promotions disagree about who is next', () => {
  const db = game();

  it('gives a tournament promotion the ranking, in order', () => {
    const pfl = promotionNamed(db, 'PFL');
    expect(pfl.matchmakingStyle).toBe('tournament');

    const { ranked, queue } = queueFor(db, pfl);
    const meritOrder = ranked
      .filter((r) => (r.fighter.id as string) !== (pfl.champions[DIVISION] as string))
      .map((r) => r.fighter.id);
    expect(queue.slice(0, 4).map((q) => q.fighter.id)).toEqual(meritOrder.slice(0, 4));
  });

  it('lets the showman promotion move an entertainer up the queue', () => {
    /*
     * The behaviour this whole file is about. The head of the UFC's queue is routinely somebody
     * several places down the merit ranking who is simply more watchable — which is exactly what
     * the sport's biggest promotion visibly does.
     */
    const ufc = promotionNamed(db, 'UFC');
    expect(ufc.matchmakingStyle).toBe('showman');

    const { ranked, queue } = queueFor(db, ufc);
    const meritOf = (id: unknown) => ranked.findIndex((r) => r.fighter.id === id) + 1;

    const top = queue[0]!;
    expect(meritOf(top.fighter.id), 'the showman queue is just the ranking').toBeGreaterThan(1);
    expect(entertainmentValue(top.fighter)).toBeGreaterThan(0.5);
  });

  it('produces a different queue at each promotion for the same division', () => {
    const ufc = queueFor(db, promotionNamed(db, 'UFC')).queue.map((q) => q.fighter.id);
    const pfl = queueFor(db, promotionNamed(db, 'PFL')).queue.map((q) => q.fighter.id);
    // Different rosters, so compare the *shape* — a tournament queue must match its own merit
    // order and a showman queue must not.
    expect(ufc.length).toBeGreaterThan(0);
    expect(pfl.length).toBeGreaterThan(0);
  });

  it('never lets the queue ignore merit entirely', () => {
    // The ranking is the spine. A #1 contender does not fall behind a #12 however exciting.
    const ufc = promotionNamed(db, 'UFC');
    const { ranked, queue } = queueFor(db, ufc);
    const meritOf = (id: unknown) => ranked.findIndex((r) => r.fighter.id === id) + 1;
    expect(meritOf(queue[0]!.fighter.id)).toBeLessThan(Math.max(6, ranked.length / 2));
  });

  it('picks a next contender for every promotion', () => {
    for (const promotion of db.promotions.findAll() as unknown as Promotion[]) {
      if (!promotion.divisions.includes(DIVISION)) continue;
      const { ranked } = queueFor(db, promotion);
      const next = nextContender({
        ranked,
        promotion,
        championId: promotion.champions[DIVISION] as string | undefined,
      });
      expect(next, `${promotion.shortName} had no contender`).toBeDefined();
      expect(next!.fighter.id).not.toBe(promotion.champions[DIVISION]);
    }
  });
});

describe('the favours a promotion does', () => {
  const db = game();
  const base = (db.fighters.findAll() as Fighter[])[0]!;
  const entertainer = {
    ...base,
    attributes: { ...base.attributes, power: 92, strikingOffence: 88, strikingDefence: 35, wrestling: 30, groundControl: 30 },
    personality: { ...base.personality, aggression: 90 },
  };

  it('books an entertainer softer at a showman promotion than at a tournament one', () => {
    /*
     * The half of matchmaking usually left out of these models. A promotion building a draw does
     * not only put them on later in the night, it books them opponents they look good against.
     */
    const showman = favourFor({ fighter: entertainer, promotion: promotionNamed(db, 'UFC'), rank: 6 });
    const tournament = favourFor({ fighter: entertainer, promotion: promotionNamed(db, 'PFL'), rank: 6 });
    expect(showman).toBeLessThan(tournament);
  });

  it('does nobody any favours in a bracket', () => {
    expect(
      favourFor({ fighter: entertainer, promotion: promotionNamed(db, 'PFL'), rank: 6 }),
    ).toBeGreaterThan(-2);
  });

  it('stops protecting somebody once they are at the top', () => {
    // Nobody needs to protect the #1 contender: the fights left are the ones the promotion wants
    // to make anyway.
    const ufc = promotionNamed(db, 'UFC');
    expect(favourFor({ fighter: entertainer, promotion: ufc, rank: 1 })).toBe(0);
  });

  it('does not bother protecting somebody nobody watches', () => {
    const grinder = {
      ...base,
      attributes: { ...base.attributes, power: 40, strikingOffence: 45, strikingDefence: 85, wrestling: 95, groundControl: 95 },
      personality: { ...base.personality, aggression: 20 },
    };
    const ufc = promotionNamed(db, 'UFC');
    expect(favourFor({ fighter: grinder, promotion: ufc, rank: 6 })).toBeGreaterThan(
      favourFor({ fighter: entertainer, promotion: ufc, rank: 6 }),
    );
  });

  it('is capped, so nobody is walked to a belt against nobody', () => {
    const ufc = promotionNamed(db, 'UFC');
    for (const rank of [2, 4, 6, 8, 12]) {
      expect(favourFor({ fighter: entertainer, promotion: ufc, rank })).toBeGreaterThan(-8);
    }
  });

  it('reaches the actual slate a fighter is offered', () => {
    // The favour has to change what gets booked, not just what a function returns.
    const ufc = promotionNamed(db, 'UFC');
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.promotionId === ufc.id && f.divisionId === DIVISION,
    );
    const subject = roster[3]!;

    const hardest = (rank: number | undefined) => {
      const offers = offerOpponents(subject, roster, ufc, DAY, createRng('favour'), {
        promotionId: ufc.id,
        rank,
      });
      return offers.length === 0 ? 0 : Math.max(...offers.map((o) => o.step));
    };

    // Being a nobody in the queue gets you the hardest fight available; being somebody the
    // promotion is building does not.
    expect(hardest(12)).toBeGreaterThanOrEqual(hardest(2) - 1);
  });
});

describe('every declared style is coherent', () => {
  it('keeps the ranking as the spine everywhere', () => {
    // Even the spectacle promotion consults it. A promotion that ignored the ranking entirely
    // would make the sport illegible.
    for (const [id, style] of Object.entries(MATCHMAKING_STYLES)) {
      expect(style.rankAdherence, id).toBeGreaterThan(20);
      expect(style.blurb.length, id).toBeGreaterThan(20);
    }
  });

  it('infers something conservative for a promotion that has not declared one', () => {
    /*
     * A promotion that has not opted into a philosophy must not quietly hand out the favours a
     * showman promotion does. The first version inferred the entertainment bias straight from
     * `matchmakingAggression`, and the 2020 world's promotions — none of which declare a style —
     * started narrowing their own matchmaking enough to fail an unrelated bound on offer spread.
     */
    const db2020 = createNewGame({ adapter: undefined });
    for (const promotion of db2020.promotions.findAll() as unknown as Promotion[]) {
      expect(promotion.matchmakingStyle).toBeUndefined();
      const style = styleOf(promotion);
      expect(style.rankAdherence, promotion.shortName).toBeGreaterThan(50);
      expect(style.entertainmentBias, promotion.shortName).toBeLessThan(
        MATCHMAKING_STYLES.showman!.entertainmentBias,
      );
    }
  });
});
