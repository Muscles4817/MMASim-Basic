/**
 * Where a reputation was earned, and what it is worth somewhere else.
 *
 * `rankDivision` scored a fighter as `reputation * 1.6 + streak + starPower * 0.25`, with no
 * notion of where any of it came from — reputation banked beating regional opposition counted
 * identically to reputation banked beating contenders. Measured from play: a 58-rated light
 * heavyweight arriving from a feeder promotion entered the UFC's rankings at **#4**, in a
 * twenty-deep division whose best fighter is rated 79 and where that fighter's raw ability puts
 * them around eleventh.
 *
 * The fix is not to throw away what somebody did before they arrived. Outside credibility is
 * real, and the sport genuinely does fast-track it. It is that the credibility has to be
 * discounted by the gap between the rooms and then **fade as real results replace it** — which
 * produces the shape that was asked for: arrive with a name, start finishing people and taking
 * performance bonuses, and climb very fast indeed.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  boutValue,
  carryWeight,
  promotionStanding,
  rankDivision,
  standingScore,
  transferRate,
  type Fighter,
  type FightRecordEntry,
  type Promotion,
} from '@mmasim/engine';

const db = createNewGame({ adapter: undefined, era: '2026' });
const promotions = db.promotions.findAll() as unknown as Promotion[];
const named = (short: string) => promotions.find((p) => p.shortName === short)!;
const UFC = named('UFC');
const CW = named('CW');
const DAY = 3000;

const bout = (over: Partial<FightRecordEntry> = {}): FightRecordEntry =>
  ({
    boutId: `b${Math.round(over.day ?? 0)}`,
    opponentId: 'x',
    promotionId: UFC.id,
    day: DAY - 60,
    outcome: 'win',
    method: 'decisionUnanimous',
    round: 3,
    timeSeconds: 300,
    divisionId: 'mens-light-heavyweight',
    wasTitleFight: false,
    ...over,
  }) as FightRecordEntry;

describe('what a reputation is worth when you move', () => {
  it('carries almost nothing across the biggest step in the sport', () => {
    // A feeder against the biggest promotion: enough to be ranked, nowhere near enough to be
    // ranked highly. This is the number that stops a Cage Warriors record buying a top-five spot.
    expect(transferRate(CW, UFC)).toBeLessThan(0.4);
  });

  it('carries everything when you step down or sideways', () => {
    // Beating better people is never worth less than beating worse ones.
    expect(transferRate(UFC, CW)).toBe(1);
    expect(transferRate(UFC, UFC)).toBe(1);
  });

  it('scales with the gap rather than cliff-edging on tier', () => {
    const one = named('ONE');
    // A strong major against the leader is a real step but not the same step as a feeder's.
    expect(transferRate(one, UFC)).toBeGreaterThan(transferRate(CW, UFC));
  });

  it('gives a complete unknown very little', () => {
    expect(transferRate(undefined, UFC)).toBeLessThan(0.4);
  });
});

describe('what a night here is worth', () => {
  it('rates a finish well above a decision', () => {
    expect(boutValue(bout({ method: 'ko' }))).toBeGreaterThan(
      boutValue(bout({ method: 'decisionUnanimous' })) * 1.5,
    );
  });

  it('rates a performance bonus above the same finish without one', () => {
    /*
     * The promotion publicly calling your night one of the best on the card, which is exactly
     * what moves somebody up a queue faster than their bare record justifies — and which was
     * being paid out and then forgotten, never reaching the record at all.
     */
    expect(boutValue(bout({ method: 'ko', bonus: 'performance' }))).toBeGreaterThan(
      boutValue(bout({ method: 'ko' })),
    );
  });

  it('punishes being finished more than being outpointed', () => {
    expect(boutValue(bout({ outcome: 'loss', method: 'ko' }))).toBeLessThan(
      boutValue(bout({ outcome: 'loss', method: 'decisionUnanimous' })),
    );
  });

  it('counts only what happened at this promotion', () => {
    const record = [bout({ promotionId: UFC.id }), bout({ promotionId: CW.id })];
    const here = promotionStanding({ record, promotionId: UFC.id, day: DAY });
    const both = promotionStanding({ record, promotionId: CW.id, day: DAY });
    expect(here).toBeGreaterThan(0);
    expect(both).toBeGreaterThan(0);
    expect(here).toBe(boutValue(record[0]!) * (here / boutValue(record[0]!)));
  });

  it('discounts what happened years ago', () => {
    const recent = promotionStanding({
      record: [bout({ day: DAY - 30 })],
      promotionId: UFC.id,
      day: DAY,
    });
    const ancient = promotionStanding({
      record: [bout({ day: DAY - 1500 })],
      promotionId: UFC.id,
      day: DAY,
    });
    expect(ancient).toBeLessThan(recent * 0.5);
  });
});

describe('the carry-in fades as real results arrive', () => {
  it('is full on debut and gone by the sixth fight', () => {
    expect(carryWeight(0)).toBe(1);
    expect(carryWeight(3)).toBeGreaterThan(0);
    expect(carryWeight(3)).toBeLessThan(1);
    expect(carryWeight(6)).toBe(0);
  });

  it('means a big name who goes 1-4 is ranked on the 1-4', () => {
    const base = (db.fighters.findAll() as Fighter[])[0]!;
    const losses = [1, 2, 3, 4].map((i) =>
      bout({ day: DAY - i * 90, outcome: 'loss', method: 'ko' }),
    );
    const famous: Fighter = {
      ...base,
      reputation: 90,
      record: [bout({ day: DAY - 450 }), ...losses],
      summary: { ...base.summary, streak: -4 },
    };

    const score = standingScore({ fighter: famous, promotion: UFC, previous: CW, day: DAY });
    expect(score, 'a 1-4 run still outranks people who are winning').toBeLessThan(20);
  });
});

describe('the arrival, end to end', () => {
  const base = (db.fighters.findAll() as Fighter[])[0]!;

  /** Somebody who has never fought at this promotion, arriving from a feeder. */
  const debutant = (reputation: number): Fighter => ({
    ...base,
    reputation,
    starPower: 30,
    record: [1, 2, 3, 4].map((i) =>
      bout({ day: DAY - 200 - i * 90, promotionId: CW.id, method: 'ko' }),
    ),
    summary: { ...base.summary, streak: 4 },
  });

  it('does not put a regional standout straight into contention', () => {
    /*
     * The reported bug, stated as a bound. A big fish from a small pond arrives ranked — they
     * have genuinely done something — but nowhere near the people who have been beating
     * contenders in this division.
     */
    const arriving = standingScore({
      fighter: debutant(70),
      promotion: UFC,
      previous: CW,
      day: DAY,
    });

    const established = standingScore({
      fighter: {
        ...base,
        reputation: 60,
        record: [1, 2, 3].map((i) => bout({ day: DAY - i * 140, method: 'decisionUnanimous' })),
        summary: { ...base.summary, streak: 3 },
      },
      promotion: UFC,
      previous: undefined,
      day: DAY,
    });

    expect(arriving, 'the newcomer outranked somebody 3-0 in the division').toBeLessThan(
      established,
    );
  });

  it('lets somebody who arrives and immediately lights it up climb very fast', () => {
    /*
     * The Pereira shape, which is the whole point of not simply zeroing outside reputation.
     * Two fights, both finishes, both worth a performance bonus, and a fighter is past people
     * who have been grinding out decisions here for years.
     */
    const pereira: Fighter = {
      ...debutant(70),
      record: [
        ...debutant(70).record,
        bout({ day: DAY - 150, method: 'ko', bonus: 'performance' }),
        bout({ day: DAY - 40, method: 'ko', bonus: 'performance' }),
      ],
      summary: { ...base.summary, streak: 6 },
    };

    const grinder: Fighter = {
      ...base,
      reputation: 60,
      record: [1, 2, 3, 4].map((i) =>
        bout({ day: DAY - i * 200, method: 'decisionUnanimous' }),
      ),
      summary: { ...base.summary, streak: 4 },
    };

    expect(
      standingScore({ fighter: pereira, promotion: UFC, previous: CW, day: DAY }),
      'two bonus-winning finishes did not beat four old decisions',
    ).toBeGreaterThan(standingScore({ fighter: grinder, promotion: UFC, previous: undefined, day: DAY }));
  });

  it('does not let the same arrival climb on dull wins', () => {
    // The other half of the shape. The fast-track is earned by *how* you win, not by turning up.
    const dull: Fighter = {
      ...debutant(70),
      record: [
        ...debutant(70).record,
        bout({ day: DAY - 150, method: 'decisionSplit' }),
        bout({ day: DAY - 40, method: 'decisionSplit' }),
      ],
      summary: { ...base.summary, streak: 6 },
    };
    const spectacular: Fighter = {
      ...dull,
      record: [
        ...debutant(70).record,
        bout({ day: DAY - 150, method: 'ko', bonus: 'performance' }),
        bout({ day: DAY - 40, method: 'ko', bonus: 'performance' }),
      ],
    };

    expect(standingScore({ fighter: dull, promotion: UFC, previous: CW, day: DAY })).toBeLessThan(
      standingScore({ fighter: spectacular, promotion: UFC, previous: CW, day: DAY }),
    );
  });
});

describe('the division that comes out of it', () => {
  it('no longer ranks a newcomer above the people already in it', () => {
    const all = db.fighters.findAll() as Fighter[];
    const division = 'mens-light-heavyweight' as never;

    const roster = all.filter((f) => f.promotionId === UFC.id && f.divisionId === division);
    const newcomer: Fighter = {
      ...roster[0]!,
      id: 'f_newcomer' as never,
      firstName: 'New',
      lastName: 'Arrival',
      promotionId: UFC.id,
      reputation: 72,
      starPower: 25,
      record: [1, 2, 3, 4, 5].map((i) =>
        bout({ day: DAY - 150 - i * 90, promotionId: CW.id, method: 'ko' }),
      ),
    };

    const ranked = rankDivision(
      [...all, newcomer],
      division,
      UFC.id,
      DAY,
      UFC.champions[division],
      promotions,
    );

    const place = ranked.findIndex((r) => r.fighter.id === newcomer.id) + 1;
    expect(place, 'the newcomer is not ranked at all').toBeGreaterThan(0);
    // Ranked, because five straight knockouts anywhere means something. Not near the belt.
    expect(place, `newcomer entered at #${place}`).toBeGreaterThan(5);
  });
});
