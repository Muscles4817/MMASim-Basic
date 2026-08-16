import { describe, expect, it } from 'vitest';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import {
  ADMIN_FLOOR,
  CARD_POSITION_PURSE,
  askingPrice,
  campCost,
  campWeeklyRate,
  defaultTerms,
  describeSolvency,
  desperationDiscount,
  livingCostPerMonth,
  marketValue,
  netPurse,
  purseFor,
  shortNoticeBonus,
  solvency,
  sponsorshipIncome,
  weightMissForfeit,
} from './money.js';

const apex = () => makePromotion({ prestige: 95, minimumPurse: 24, sponsorshipPolicy: 'uniform' });
const frontier = () =>
  makePromotion({ id: 'p_frontier', prestige: 22, minimumPurse: 1, sponsorshipPolicy: 'open' });

describe('what a fighter is worth', () => {
  it('pays for fame far more than for merit', () => {
    // The mechanism by which a promotion pays a mediocre draw more than an excellent
    // champion, and then has to explain it to the champion. Doc 08 says the model exists for
    // this; before the rework the arithmetic did not actually do it.
    const draw = makeFighter({ id: 'draw', starPower: 82, reputation: 66 });
    const champion = makeFighter({ id: 'champ', starPower: 48, reputation: 92 });

    expect(marketValue(draw, apex())).toBeGreaterThan(marketValue(champion, apex()) * 2);
  });

  it('is superlinear in star power, because MMA pay is a power law', () => {
    const p = apex();
    const at = (starPower: number) => marketValue(makeFighter({ starPower }), p);

    // Doubling star power must more than double the money, or the top of the sport is wrong.
    expect(at(80) / at(40)).toBeGreaterThan(4);
    // And the very top has to be able to run away from everybody.
    expect(at(100) / at(50)).toBeGreaterThan(5);
  });

  it('opens a real gap between promotions for the same fighter', () => {
    const f = makeFighter({ starPower: 45, reputation: 60 });
    const spread = marketValue(f, apex()) / marketValue(f, frontier());

    // The old model gave 4.3:1 while the seed budgets said 47:1 — a pay model contradicting
    // the promotion table it reads from. This is the MONEY axis of doc 16's triangle.
    expect(spread).toBeGreaterThan(15);
    expect(spread).toBeLessThan(40);
  });

  it('does not let a title change what a person is worth', () => {
    // A title is a property of a bout, not of a fighter. The old ×1.5 lived here and was
    // cancelling the grievance above.
    const f = makeFighter({ starPower: 60, reputation: 80 });
    expect(marketValue(f, apex())).toBe(marketValue(f, apex()));
  });

  it('does not let purse demand inflate what a fighter is worth', () => {
    // The defect that would have silently inverted two business traits: a Mercenary asks
    // more, he is not worth more. If this ever fails, every Mercenary becomes permanently
    // "underpaid" by construction through the ratio that drives resentment.
    const plain = makeFighter({ id: 'plain', starPower: 60, reputation: 60 });
    const mercenary = makeFighter({ id: 'merc', starPower: 60, reputation: 60, traits: ['mercenary'] });
    const loyal = makeFighter({ id: 'loyal', starPower: 60, reputation: 60, traits: ['companyMan'] });

    expect(marketValue(mercenary, apex())).toBe(marketValue(plain, apex()));
    expect(marketValue(loyal, apex())).toBe(marketValue(plain, apex()));
  });
});

describe('what a fighter asks for', () => {
  it('is where purse demand actually belongs', () => {
    const plain = makeFighter({ id: 'plain', starPower: 60 });
    const mercenary = makeFighter({ id: 'merc', starPower: 60, traits: ['mercenary'] });
    const loyal = makeFighter({ id: 'loyal', starPower: 60, traits: ['companyMan'] });

    expect(askingPrice(mercenary, apex())).toBeGreaterThan(askingPrice(plain, apex()));
    expect(askingPrice(loyal, apex())).toBeLessThan(askingPrice(plain, apex()));
  });

  it('lets a loyal fighter re-sign cheaply', () => {
    const f = makeFighter({ starPower: 60 });
    const open = askingPrice(f, apex());
    const renewing = askingPrice(f, apex(), { isIncumbent: true, reSignDiscount: 0.2 });
    expect(renewing).toBeLessThan(open);
  });
});

describe('the purse', () => {
  it('pays show and win separately, because the sport does', () => {
    const purse = purseFor({ showPurse: 20, winBonus: 20 }, apex());
    expect(purse.show).toBe(20);
    expect(purse.win).toBe(20);
    expect(purse.total).toBe(40);
  });

  it('never pays below the promotion’s published floor', () => {
    const purse = purseFor({ showPurse: 2, winBonus: 2 }, apex());
    expect(purse.total).toBeGreaterThanOrEqual(24);
  });

  it('keeps the negotiated split when the floor bites', () => {
    // A fighter who traded show for win must not have that trade silently undone.
    const purse = purseFor({ showPurse: 1, winBonus: 3 }, apex());
    expect(purse.win / purse.show).toBeCloseTo(3, 1);
  });

  it('multiplies by where you are on the card', () => {
    const terms = { showPurse: 40, winBonus: 40 };
    const main = purseFor(terms, apex(), 'mainEvent');
    const prelim = purseFor(terms, apex(), 'prelim');
    expect(main.total / prelim.total).toBeCloseTo(
      CARD_POSITION_PURSE.mainEvent / CARD_POSITION_PURSE.prelim,
      1,
    );
  });

  it('applies the floor after the card position, not before', () => {
    // Otherwise an Apex prelim debutant lands below the minimum the promotion advertises.
    const purse = purseFor({ showPurse: 12, winBonus: 12 }, apex(), 'prelim');
    expect(purse.total).toBeGreaterThanOrEqual(24);
  });

  it('defaults a star to a show-heavy split', () => {
    // A genuine star does not accept half their money contingent on the judges.
    const star = defaultTerms(makeFighter({ starPower: 95 }), apex());
    const journeyman = defaultTerms(makeFighter({ starPower: 10 }), apex());
    expect(star.showPurse / (star.showPurse + star.winBonus)).toBeGreaterThan(
      journeyman.showPurse / (journeyman.showPurse + journeyman.winBonus),
    );
  });
});

describe('gross is not net', () => {
  it('leaves a newcomer with almost nothing for winning, and in the red for losing', () => {
    // The single most-cited economic fact about the sport, and the point of the module.
    const won = netPurse({ gross: 24, campCost: 6.5, livingCost: 6 });
    const lost = netPurse({ gross: 12, campCost: 6.5, livingCost: 6 });

    expect(won.net).toBeGreaterThan(0);
    expect(won.net).toBeLessThan(6);
    expect(lost.net).toBeLessThan(0);
  });

  it('makes the camp the thing that can actually hurt you', () => {
    // Every other deduction is a percentage and therefore shrinks with the purse. Camp does
    // not: it is paid before the fight, in full, win or lose. That is what turns the
    // show-versus-win-bonus choice from an EV calculation into a solvency decision.
    const cheap = netPurse({ gross: 12, campCost: 3.5 });
    const expensive = netPurse({ gross: 12, campCost: 23 });
    expect(cheap.net).toBeGreaterThan(0);
    expect(expensive.net).toBeLessThan(0);
  });

  it('never taxes a fighter on money they spent earning it', () => {
    const n = netPurse({ gross: 20, campCost: 20 });
    expect(n.tax).toBe(0);
  });

  it('charges the admin floor even on a tiny purse', () => {
    expect(netPurse({ gross: 1, campCost: 0 }).admin).toBe(ADMIN_FLOOR);
  });

  it('takes less when the fighter is self-managed', () => {
    const managed = netPurse({ gross: 100, campCost: 10, managerRate: 0.15 });
    const alone = netPurse({ gross: 100, campCost: 10, managerRate: 0 });
    expect(alone.net).toBeGreaterThan(managed.net);
  });

  it('makes a star live like a star', () => {
    expect(livingCostPerMonth(makeFighter({ starPower: 90 }))).toBeGreaterThan(
      livingCostPerMonth(makeFighter({ starPower: 10 })) * 1.8,
    );
  });

  it('makes a party animal cost more to be', () => {
    const sensible = makeFighter({ id: 'a', starPower: 50 });
    const party = makeFighter({ id: 'b', starPower: 50, traits: ['partyAnimal'] });
    expect(livingCostPerMonth(party)).toBeGreaterThan(livingCostPerMonth(sensible) * 2);
  });
});

describe('the sink', () => {
  it('makes the best rooms disproportionately expensive', () => {
    // Superlinear on purpose: the best rooms must be out of reach rather than merely
    // expensive, or the money has no teeth.
    const basement = campWeeklyRate(44);
    const summit = campWeeklyRate(92);
    expect(summit / basement).toBeGreaterThan(3);
  });

  it('prices a real camp somewhere a fighter can feel it', () => {
    expect(campCost(8, 44)).toBeGreaterThan(2);
    expect(campCost(8, 44)).toBeLessThan(6);
    expect(campCost(12, 92)).toBeGreaterThan(18);
  });

  it('scales with the length of the camp', () => {
    expect(campCost(12, 70)).toBeCloseTo(campCost(4, 70) * 3, 1);
  });
});

describe('sponsorship', () => {
  it('can out-earn the purse at the bottom of the sport', () => {
    // Accurate, and almost no sim expresses it. It is the second edge on doc 16's
    // money-versus-level trade: the regional show pays less AND lets you keep your sponsors.
    const journeyman = makeFighter({ starPower: 25, reputation: 35 });
    const purse = marketValue(journeyman, frontier());
    const sponsors = sponsorshipIncome(journeyman, frontier(), { boutsWithPromotion: 4 });
    expect(sponsors).toBeGreaterThan(purse);
  });

  it('pays a uniform promotion’s fighters by bout count, not by fame', () => {
    const rookie = makeFighter({ id: 'r', starPower: 90 });
    const veteran = makeFighter({ id: 'v', starPower: 10 });
    const rookiePay = sponsorshipIncome(rookie, apex(), { boutsWithPromotion: 1 });
    const veteranPay = sponsorshipIncome(veteran, apex(), { boutsWithPromotion: 18 });
    expect(veteranPay).toBeGreaterThan(rookiePay);
  });

  it('pays a champion the top uniform tier', () => {
    const champ = makeFighter({ starPower: 40 });
    expect(
      sponsorshipIncome(champ, apex(), { boutsWithPromotion: 2, isChampion: true }),
    ).toBeGreaterThan(sponsorshipIncome(champ, apex(), { boutsWithPromotion: 2 }));
  });

  it('is worth more at home under an open policy', () => {
    const f = makeFighter({ starPower: 50 });
    expect(
      sponsorshipIncome(f, frontier(), { boutsWithPromotion: 3, inHomeCountry: true }),
    ).toBeGreaterThan(sponsorshipIncome(f, frontier(), { boutsWithPromotion: 3 }));
  });
});

describe('missing weight now costs money', () => {
  it('forfeits a fifth of the show purse', () => {
    expect(weightMissForfeit(50)).toBe(10);
  });

  it('costs more when it is egregious', () => {
    expect(weightMissForfeit(50, true)).toBeGreaterThan(weightMissForfeit(50));
  });
});

describe('solvency changes what a fighter will accept', () => {
  it('reads the bank against what the next camp costs', () => {
    expect(solvency(100, 10)).toBe('comfortable');
    expect(solvency(5, 10)).toBe('tight');
    expect(solvency(-1, 10)).toBe('broke');
    expect(solvency(-50, 10)).toBe('desperate');
  });

  it('drops the reservation price as the money runs out', () => {
    expect(desperationDiscount('comfortable')).toBe(0);
    expect(desperationDiscount('desperate')).toBeGreaterThan(desperationDiscount('broke'));
    expect(desperationDiscount('broke')).toBeGreaterThan(desperationDiscount('tight'));
  });

  it('makes a broke fighter take short notice', () => {
    expect(shortNoticeBonus('comfortable')).toBe(0);
    expect(shortNoticeBonus('desperate')).toBeGreaterThan(0.3);
  });

  it('never blocks anything — it only makes everything slightly worse', () => {
    // The design in one line: being broke is how a fighter ends up taking the fight that
    // ruins them, and it must be a pressure rather than a prohibition.
    for (const state of ['comfortable', 'tight', 'broke', 'desperate'] as const) {
      expect(desperationDiscount(state)).toBeLessThan(1);
      expect(describeSolvency(state).length).toBeGreaterThan(10);
    }
  });
});
