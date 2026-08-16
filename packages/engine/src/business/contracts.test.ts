import { describe, expect, it } from 'vitest';
import { makeFighter, makePromotion } from '../testing/fixtures.js';
import { marketValue } from './money.js';
import {
  MAX_FIGHTS_OWED,
  TERM_DAYS,
  agreementStatus,
  activityBreach,
  consumeFight,
  contractFairness,
  createAgreement,
  describeFairness,
  describeReleaseRisk,
  describeTrigger,
  releaseRisk,
  renegotiationTriggers,
  resentmentFrom,
  tollAgreement,
  type OfferTerms,
} from './contracts.js';

const terms = (o: Partial<OfferTerms> = {}): OfferTerms => ({
  showPurse: 20,
  winBonus: 20,
  signingBonus: 0,
  revenuePoints: 0,
  fightsOwed: 4,
  championshipExtension: 'none',
  matchingRights: false,
  exclusive: true,
  outsideBouts: 0,
  ...o,
});

const sign = (o: Partial<OfferTerms> = {}, day = 0) =>
  createAgreement({
    fighter: makeFighter({ starPower: 30, reputation: 30 }),
    promotion: makePromotion(),
    terms: terms(o),
    day,
  });

describe('signing a deal', () => {
  it('snapshots what the fighter was worth on the day', () => {
    // The key field in the whole design: everything about grievance is this number against
    // what they are worth now, which means the sport's most recurring story is arithmetic
    // rather than a script.
    const fighter = makeFighter({ starPower: 30, reputation: 30 });
    const promotion = makePromotion();
    const agreement = createAgreement({ fighter, promotion, terms: terms(), day: 0 });

    expect(agreement.valueAtSigning).toBe(marketValue(fighter, promotion));
  });

  it('caps how long a deal can be', () => {
    // Longer than this stops being regret and becomes a debuff with a timer.
    expect(sign({ fightsOwed: 20 }).fightsOwed).toBe(MAX_FIGHTS_OWED);
  });

  it('refuses to grant points a promotion structurally cannot pay', () => {
    // The unmatchable term, from the other side: a promotion with no broadcast platform
    // cannot share broadcast revenue however much it wants the fighter.
    const noPlatform = createAgreement({
      fighter: makeFighter(),
      promotion: makePromotion({ revenueShareCapable: false }),
      terms: terms({ revenuePoints: 3 }),
      day: 0,
    });
    expect(noPlatform.revenuePoints).toBe(0);
  });

  it('takes the activity guarantee from the promotion, not the negotiation', () => {
    const agreement = createAgreement({
      fighter: makeFighter(),
      promotion: makePromotion({ activityGuarantee: 4 }),
      terms: terms(),
      day: 0,
    });
    expect(agreement.activityGuarantee).toBe(4);
  });
});

describe('the clock is tolled, which is the whole correction', () => {
  it('pushes expiry out day for day when the fighter is not fighting', () => {
    // The single most consequential fix from the review. The draft had term expiry
    // "protecting the fighter who spent a year injured"; the sport does the opposite.
    const agreement = sign();
    const tolled = tollAgreement(agreement, 200);

    expect(tolled.expiresDay).toBe(agreement.expiresDay + 200);
    expect(tolled.tolledDays).toBe(200);
  });

  it('makes sitting out extend captivity rather than shorten it', () => {
    // This is what kills the dominant strategy the draft would have shipped: waiting out a
    // bad deal. A year of holding out leaves you exactly as far from freedom as before.
    const agreement = sign();
    const afterAYear = tollAgreement(agreement, 365);

    const stillOwed = agreementStatus(afterAYear, 365);
    expect(stillOwed.expired).toBe(false);
    expect(stillOwed.daysRemaining).toBe(TERM_DAYS);
  });

  it('does nothing for a fighter who is actually competing', () => {
    const agreement = sign();
    expect(tollAgreement(agreement, 0)).toBe(agreement);
  });
});

describe('when a deal ends', () => {
  it('ends when the fights are used up', () => {
    let agreement = sign({ fightsOwed: 2 });
    agreement = consumeFight(consumeFight(agreement));
    expect(agreementStatus(agreement, 100).expired).toBe(true);
  });

  it('ends on the calendar even with fights left', () => {
    const agreement = sign({ fightsOwed: 6 });
    expect(agreementStatus(agreement, TERM_DAYS + 1).expired).toBe(true);
  });

  it('never runs a fight below zero', () => {
    let agreement = sign({ fightsOwed: 1 });
    agreement = consumeFight(consumeFight(consumeFight(agreement)));
    expect(agreement.fightsRemaining).toBe(0);
  });

  it('counts down out loud, so free agency approaches rather than arrives', () => {
    const agreement = sign({ fightsOwed: 2 });
    expect(agreementStatus(consumeFight(agreement), 10).summary).toMatch(/One fight left/i);
  });
});

describe('the championship extension', () => {
  it('holds a champion in place, and says so in one plain sentence', () => {
    const agreement = sign({ fightsOwed: 1, championshipExtension: 'standard' });
    const used = consumeFight(agreement);
    const status = agreementStatus(used, 100, { isChampion: true });

    expect(status.expired).toBe(false);
    expect(status.heldByBelt).toBe(true);
    expect(status.summary).toBe('You cannot leave while you hold the belt.');
  });

  it('is bounded — it lets go after the tail', () => {
    // Indefinite regret is punishment rather than regret. Both critics reached this, one
    // from pacing and one from the paperwork.
    const agreement = consumeFight(sign({ fightsOwed: 1, championshipExtension: 'standard' }));
    const longAfter = agreementStatus(agreement, 1000, { isChampion: false, beltLostDay: 200 });
    expect(longAfter.heldByBelt).toBe(false);
    expect(longAfter.expired).toBe(true);
  });

  it('does not hold anybody who did not sign for it', () => {
    const agreement = consumeFight(sign({ fightsOwed: 1, championshipExtension: 'none' }));
    expect(agreementStatus(agreement, 100, { isChampion: true }).expired).toBe(true);
  });
});

describe('the deal drifts and the fighter notices', () => {
  it('is fair on the day it is signed', () => {
    const fighter = makeFighter({ starPower: 30, reputation: 30 });
    const promotion = makePromotion();
    const value = marketValue(fighter, promotion);
    const agreement = createAgreement({
      fighter,
      promotion,
      terms: terms({ showPurse: value / 2, winBonus: value / 2 }),
      day: 0,
    });

    expect(contractFairness(agreement, fighter, promotion)).toBeCloseTo(1, 1);
  });

  it('sours as the fighter outgrows it', () => {
    // Signed at 22, honoured at 27 after three finishes. The recurring grievance of the
    // sport, generated by arithmetic.
    const promotion = makePromotion();
    const young = makeFighter({ starPower: 20, reputation: 20 });
    const value = marketValue(young, promotion);
    const agreement = createAgreement({
      fighter: young,
      promotion,
      terms: terms({ showPurse: value / 2, winBonus: value / 2 }),
      day: 0,
    });

    const grown = makeFighter({ starPower: 70, reputation: 75 });
    expect(contractFairness(agreement, grown, promotion)).toBeLessThan(0.4);
  });

  it('turns unfairness into resentment, steeply', () => {
    expect(resentmentFrom(1.0)).toBe(0);
    expect(resentmentFrom(0.8)).toBeGreaterThan(0);
    expect(resentmentFrom(0.4)).toBeGreaterThan(resentmentFrom(0.7));
    expect(resentmentFrom(0.1)).toBeLessThanOrEqual(100);
  });

  it('says it in words rather than as a ratio', () => {
    // The number is never shown. A ratio needs a paragraph; a sentence does not.
    expect(describeFairness(1.3)).toMatch(/more than you are currently worth/i);
    expect(describeFairness(0.3)).toMatch(/insult/i);
    for (const f of [1.5, 1.0, 0.8, 0.5, 0.2]) {
      expect(describeFairness(f).length).toBeGreaterThan(20);
    }
  });
});

describe('the route out of a bad deal', () => {
  it('gives a champion standing to reopen', () => {
    const promotion = makePromotion();
    const fighter = makeFighter({ starPower: 60 });
    const triggers = renegotiationTriggers(sign(), fighter, promotion, { isChampion: true });
    expect(triggers).toContain('wonTitle');
  });

  it('gives a long streak standing', () => {
    const promotion = makePromotion();
    const fighter = makeFighter({ starPower: 60 });
    fighter.summary.streak = 6;
    expect(renegotiationTriggers(sign(), fighter, promotion)).toContain('longStreak');
  });

  it('gives a badly underpaid fighter standing on the money alone', () => {
    const promotion = makePromotion();
    const underpaid = createAgreement({
      fighter: makeFighter({ starPower: 5, reputation: 5 }),
      promotion,
      terms: terms({ showPurse: 1, winBonus: 1 }),
      day: 0,
    });
    const nowAStar = makeFighter({ starPower: 85, reputation: 85 });
    expect(renegotiationTriggers(underpaid, nowAStar, promotion)).toContain('grievance');
  });

  it('gives a shelved fighter standing, which is the only answer to contract jail', () => {
    const promotion = makePromotion({ activityGuarantee: 3 });
    const agreement = createAgreement({
      fighter: makeFighter(),
      promotion,
      terms: terms(),
      day: 0,
    });
    expect(
      renegotiationTriggers(agreement, makeFighter(), promotion, { boutsInLastYear: 0 }),
    ).toContain('activityBreach');
    expect(activityBreach(agreement, 0)).toBe(true);
    expect(activityBreach(agreement, 4)).toBe(false);
  });

  it('gives a fighter with none of those nothing at all', () => {
    const promotion = makePromotion();
    const fighter = makeFighter({ starPower: 30, reputation: 30 });
    const fair = createAgreement({
      fighter,
      promotion,
      terms: terms({
        showPurse: marketValue(fighter, promotion) / 2,
        winBonus: marketValue(fighter, promotion) / 2,
      }),
      day: 0,
    });
    expect(renegotiationTriggers(fair, fighter, promotion, { boutsInLastYear: 3 })).toHaveLength(0);
  });

  it('explains every trigger it can produce', () => {
    for (const t of ['wonTitle', 'threeFinishes', 'longStreak', 'grievance', 'activityBreach'] as const) {
      expect(describeTrigger(t).length).toBeGreaterThan(20);
    }
  });
});

describe('being cut', () => {
  it('does not threaten a fighter who is winning', () => {
    const f = makeFighter({ starPower: 40 });
    f.summary.streak = 3;
    expect(releaseRisk(f, makePromotion())).toBe(0);
  });

  it('rises with a losing skid', () => {
    const one = makeFighter({ id: 'a', starPower: 40 });
    one.summary.streak = -1;
    const three = makeFighter({ id: 'b', starPower: 40 });
    three.summary.streak = -3;
    expect(releaseRisk(three, makePromotion())).toBeGreaterThan(releaseRisk(one, makePromotion()));
  });

  it('buys patience with star power rather than with a good record', () => {
    // The realism correction: release is at-will, and the convention is applied unevenly.
    // Exciting fighters survive 0-3 and boring winners get cut, and that unevenness is the
    // more interesting truth.
    const draw = makeFighter({ id: 'draw', starPower: 90 });
    draw.summary.streak = -3;
    const nobody = makeFighter({ id: 'nobody', starPower: 10 });
    nobody.summary.streak = -3;

    expect(releaseRisk(draw, makePromotion())).toBeLessThan(releaseRisk(nobody, makePromotion()));
  });

  it('never becomes a certainty', () => {
    const f = makeFighter({ starPower: 1 });
    f.summary.streak = -10;
    expect(releaseRisk(f, makePromotion())).toBeLessThan(1);
  });

  it('warns before it happens', () => {
    expect(describeReleaseRisk(0)).toMatch(/not in question/i);
    expect(describeReleaseRisk(0.6)).toMatch(/gone/i);
  });
});
