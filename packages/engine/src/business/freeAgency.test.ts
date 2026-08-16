import { describe, expect, it } from 'vitest';
import { asManagerId, asPromotionId } from '../core/ids.js';
import { createRng } from '../core/rng.js';
import { uniformPersonality } from '../domain/personality.js';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import type { OfferTerms } from './contracts.js';
import { canMatch, matchResponse, offersFor, unmatchableTerms, type Offer } from './freeAgency.js';
import type { Manager } from './managers.js';

const apex = () =>
  makePromotion({
    id: 'p_apex',
    tier: 'global',
    prestige: 95,
    budget: 42_000,
    minimumPurse: 24,
    revenueShareCapable: true,
  });
const major = () =>
  makePromotion({ id: 'p_van', tier: 'major', prestige: 66, budget: 14_000, minimumPurse: 8 });
const regional = () =>
  makePromotion({
    id: 'p_ecc',
    tier: 'regional',
    prestige: 38,
    budget: 2_400,
    minimumPurse: 3,
    revenueShareCapable: false,
  });
const developmental = () =>
  makePromotion({
    id: 'p_ff',
    tier: 'developmental',
    prestige: 22,
    budget: 900,
    minimumPurse: 1,
    revenueShareCapable: false,
  });

/** A second major, because a lateral move needs a peer to move to. The seed world has two. */
const major2 = () =>
  makePromotion({ id: 'p_rsc', tier: 'major', prestige: 61, budget: 11_000, minimumPurse: 8 });

const ALL = () => [apex(), major(), major2(), regional(), developmental()];

const manager = (o: Partial<Manager> = {}): Manager => ({
  id: asManagerId('m'),
  name: 'M',
  negotiation: 60,
  standing: 50,
  integrity: 70,
  connections: Object.fromEntries(ALL().map((p) => [p.id, 70])),
  favour: {},
  purseRate: 0.1,
  sponsorshipRate: 0.17,
  clientIds: [],
  personality: uniformPersonality(50),
  advice: [],
  blurb: 'A manager.',
  ...o,
});

const run = (o: Partial<Parameters<typeof offersFor>[0]> = {}) =>
  offersFor({
    fighter: makeFighter({ starPower: 45, reputation: 55 }),
    promotions: ALL(),
    depthOf: () => 8,
    manager: manager(),
    day: 0,
    rng: createRng('offers'),
    ...o,
  });

describe('free agency is escaping, not being courted', () => {
  it('offers a lateral move, which the old code made impossible', () => {
    // promotionOffers() hard-filtered `step !== 1`, so you could only ever be offered exactly
    // one tier up. A lateral move is the everyday free-agency case.
    const offers = run({ incumbent: major() });
    expect(offers.some((o) => o.motive === 'lateral')).toBe(true);
  });

  it('offers a way down, so being cut is a fall rather than a dead end', () => {
    // The old code also returned nothing at all while `streak < 2`, which left a cut fighter
    // with no offers, no purse and no title path.
    const cut = makeFighter({ starPower: 35, reputation: 45 });
    cut.summary.streak = -3;
    const offers = offersFor({
      fighter: cut,
      promotions: ALL(),
      incumbent: apex(),
      depthOf: () => 8,
      manager: manager(),
      day: 0,
      rng: createRng('fall'),
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.some((o) => o.motive === 'fall')).toBe(true);
  });

  it('still makes a two-tier leap something only a draw gets', () => {
    const nobody = makeFighter({ starPower: 20, reputation: 40 });
    const offers = offersFor({
      fighter: nobody,
      promotions: ALL(),
      incumbent: developmental(),
      depthOf: () => 8,
      manager: manager(),
      day: 0,
      rng: createRng('leap'),
    });
    expect(offers.some((o) => o.motive === 'reach')).toBe(false);
  });

  it('is not an auction — the offers do not compete with each other', () => {
    /*
     * The right test of a monopsony is not how *many* promotions call. Plenty will. It is
     * that they are not bidding against one another: the money is stratified by tier, so the
     * top offer dwarfs the bottom rather than several promotions converging on a price.
     *
     * That stratification is exactly what keeps doc 16's money/opportunity/level triangle
     * apart. An efficient auction would collapse it, because the richest buyer would win all
     * three axes at once.
     */
    const offers = run({ incumbent: major() });
    expect(offers.length).toBeGreaterThan(1);

    const total = (o: (typeof offers)[number]) => o.terms.showPurse + o.terms.winBonus;
    expect(total(offers[0]!) / total(offers[offers.length - 1]!)).toBeGreaterThan(4);
  });

  it('never offers a division a promotion does not run', () => {
    const offers = run({
      promotions: [makePromotion({ id: 'p_x', divisions: [] })],
      incumbent: undefined,
    });
    expect(offers).toHaveLength(0);
  });
});

describe('an offer is a future, not a number', () => {
  it('names the champion and his age, so the player can see the window', () => {
    // "The champion is 34" tells a player the belt is available in two years. That is the
    // lean-in moment, and it comes out of world state already computed.
    const offers = run({
      incumbent: regional(),
      championOf: () => ({ name: 'Adebayo', age: 34 }),
      projectedRankOf: () => 6,
    });
    expect(offers[0]!.route).toMatch(/Adebayo, 34/);
    expect(offers[0]!.route).toMatch(/#6/);
  });

  it('says what the level would actually be like', () => {
    for (const offer of run({ incumbent: regional() })) {
      expect(offer.level.length).toBeGreaterThan(30);
      expect(offer.money).toMatch(/to show/);
    }
  });

  it('handles a division with nobody ranked in it', () => {
    const offers = run({ incumbent: regional(), championOf: () => undefined });
    expect(offers[0]!.route.length).toBeGreaterThan(10);
  });
});

describe('unmatchable terms are the fighter’s real move', () => {
  const withPoints: OfferTerms = {
    showPurse: 100,
    winBonus: 100,
    signingBonus: 10,
    revenuePoints: 2,
    fightsOwed: 4,
    championshipExtension: 'none',
    matchingRights: false,
    exclusive: true,
    outsideBouts: 0,
  };

  it('cannot be matched by a promotion with no platform', () => {
    // Alvarez/Bellator, in one assertion: a matching right can only match what the incumbent
    // is *capable* of matching.
    expect(canMatch(regional(), withPoints)).toBe(false);
    expect(canMatch(apex(), withPoints)).toBe(true);
  });

  it('cannot be matched when the cash is not there on the day', () => {
    const bigBonus: OfferTerms = { ...withPoints, revenuePoints: 0, signingBonus: 500 };
    expect(canMatch(developmental(), bigBonus)).toBe(false);
  });

  it('says in plain words what the incumbent cannot do', () => {
    const reasons = unmatchableTerms(regional(), withPoints);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons[0]).toMatch(/no platform/i);
  });

  it('has nothing to say when the incumbent can match everything', () => {
    expect(unmatchableTerms(apex(), { ...withPoints, signingBonus: 5 })).toHaveLength(0);
  });
});

describe('matching rights', () => {
  const offer = (terms: Partial<OfferTerms> = {}): Offer => ({
    promotion: apex(),
    terms: {
      showPurse: 40,
      winBonus: 40,
      signingBonus: 5,
      revenuePoints: 0,
      fightsOwed: 4,
      championshipExtension: 'none',
      matchingRights: false,
      exclusive: true,
      outsideBouts: 0,
      ...terms,
    },
    motive: 'ascend',
    money: '',
    route: '',
    level: '',
    unmatchable: [],
  });

  it('lets a fighter walk when the incumbent has no right to match', () => {
    const r = matchResponse({
      incumbent: major(),
      fighter: makeFighter(),
      rival: offer(),
      hasMatchingRights: false,
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toMatch(/free to go/i);
  });

  it('lets a fighter walk when the incumbent physically cannot match', () => {
    // The whole point of structuring the offer rather than merely maximising it.
    const r = matchResponse({
      incumbent: regional(),
      fighter: makeFighter(),
      rival: offer({ revenuePoints: 3 }),
      hasMatchingRights: true,
    });
    expect(r.matched).toBe(false);
  });

  it('keeps a fighter when the incumbent can and will', () => {
    const r = matchResponse({
      incumbent: apex(),
      fighter: makeFighter(),
      rival: offer(),
      hasMatchingRights: true,
    });
    expect(r.matched).toBe(true);
    expect(r.terms).toBeDefined();
  });

  it('lets them walk when the number is simply too big', () => {
    const r = matchResponse({
      incumbent: regional(),
      fighter: makeFighter(),
      rival: offer({ showPurse: 900, winBonus: 900, signingBonus: 1 }),
      hasMatchingRights: true,
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toMatch(/let you walk/i);
  });

  it('makes a loyal fighter cheaper to keep', () => {
    // reSignDiscount finally has a caller, having sat unused since the domain was written.
    const loyal = makeFighter({ id: 'loyal', personality: { loyalty: 95 } });
    const mercenary = makeFighter({ id: 'merc', personality: { loyalty: 5 } });
    const big = offer({ showPurse: 300, winBonus: 300 });

    const keptLoyal = matchResponse({
      incumbent: major(),
      fighter: loyal,
      rival: big,
      hasMatchingRights: true,
    }).matched;
    const keptMerc = matchResponse({
      incumbent: major(),
      fighter: mercenary,
      rival: big,
      hasMatchingRights: true,
    }).matched;

    expect(keptLoyal || !keptMerc).toBe(true);
  });
});

describe('who is willing to pay', () => {
  it('pays over the odds for a thin division', () => {
    const thin = run({ incumbent: regional(), depthOf: () => 2 });
    const deep = run({ incumbent: regional(), depthOf: () => 14 });
    expect(thin.length).toBeGreaterThanOrEqual(deep.length);
  });

  it('gets a fighter nowhere without a manager who can make the call', () => {
    const unconnected = manager({ connections: { [asPromotionId('p_apex')]: 2 } });
    const connected = manager();
    const few = run({ incumbent: regional(), manager: unconnected });
    const many = run({ incumbent: regional(), manager: connected });
    expect(many.length).toBeGreaterThanOrEqual(few.length);
  });

  it('never offers less than a promotion’s published floor', () => {
    for (const offer of run({ incumbent: undefined })) {
      expect(offer.terms.showPurse + offer.terms.winBonus).toBeGreaterThanOrEqual(
        offer.promotion.minimumPurse - 0.5,
      );
    }
  });

  it('only grants points where they can actually be paid', () => {
    for (const offer of run({ incumbent: undefined, fighter: makeFighter({ starPower: 90 }) })) {
      if (offer.terms.revenuePoints > 0) {
        expect(offer.promotion.revenueShareCapable).toBe(true);
      }
    }
  });

  it('lets the small promotions offer what the big ones will not', () => {
    // The fringe's only strategy, and what keeps doc 16's triangle from collapsing.
    const offers = run({ incumbent: undefined });
    const small = offers.filter((o) => o.promotion.tier === 'regional' || o.promotion.tier === 'developmental');
    for (const o of small) expect(o.terms.outsideBouts).toBeGreaterThan(0);
  });
});
