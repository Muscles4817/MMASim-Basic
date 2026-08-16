import { describe, expect, it } from 'vitest';
import { asFighterId, asManagerId, asPromotionId } from '../core/ids.js';
import { createRng } from '../core/rng.js';
import { uniformPersonality } from '../domain/personality.js';
import {
  adviceRecord,
  adviseOnBout,
  connectionTo,
  describeAdviceRecord,
  describeStable,
  negotiationMultiplier,
  placementSummary,
  priority,
  purseRateOf,
  recordAdvice,
  settleAdvice,
  stableConflictCost,
  willRepresent,
  type Manager,
} from './managers.js';

const APEX = asPromotionId('p_apex');
const FRONTIER = asPromotionId('p_frontier');

const manager = (o: Partial<Manager> = {}): Manager => ({
  id: asManagerId('m_test'),
  name: 'Test Manager',
  negotiation: 60,
  standing: 50,
  integrity: 70,
  connections: { [APEX]: 50, [FRONTIER]: 50 },
  favour: {},
  purseRate: 0.1,
  sponsorshipRate: 0.17,
  clientIds: [],
  personality: uniformPersonality(50),
  advice: [],
  blurb: 'A manager.',
  ...o,
});

describe('what the percentage buys', () => {
  it('gets a better manager more of what a fighter is worth', () => {
    expect(negotiationMultiplier(manager({ negotiation: 95 }))).toBeGreaterThan(
      negotiationMultiplier(manager({ negotiation: 20 })),
    );
  });

  it('must be able to more than pay for itself', () => {
    // If self-managing is always better, the role has failed — which the fun brief named as
    // the failure state for the whole feature.
    const good = manager({ negotiation: 90, purseRate: 0.12 });
    const keptWithManager = negotiationMultiplier(good) * (1 - good.purseRate);
    expect(keptWithManager).toBeGreaterThan(negotiationMultiplier(undefined));
  });

  it('leaves a bad manager genuinely worse than nobody', () => {
    // And a real decision needs the other end to exist too.
    const poor = manager({ negotiation: 10, purseRate: 0.15 });
    const kept = negotiationMultiplier(poor) * (1 - poor.purseRate);
    expect(kept).toBeLessThan(negotiationMultiplier(undefined));
  });
});

describe('connections are per-promotion, which is the whole fix', () => {
  it('cannot be ordered, so there is no best manager', () => {
    // A scalar collapses into a tier gate; a vector cannot be ranked. There is only a
    // manager who is good for the career you are trying to have.
    const companyMan = manager({ connections: { [APEX]: 90, [FRONTIER]: 20 } });
    const regionalGuy = manager({ connections: { [APEX]: 20, [FRONTIER]: 90 } });

    expect(connectionTo(companyMan, APEX)).toBeGreaterThan(connectionTo(regionalGuy, APEX));
    expect(connectionTo(regionalGuy, FRONTIER)).toBeGreaterThan(connectionTo(companyMan, FRONTIER));
  });

  it('gives an unmanaged fighter only the promotions that already know them', () => {
    expect(connectionTo(undefined, APEX)).toBeLessThan(50);
  });

  it('treats a promotion he has no relationship with as nearly a closed door', () => {
    expect(connectionTo(manager({ connections: {} }), APEX)).toBeLessThan(20);
  });
});

describe('the stable', () => {
  it('makes a big stable mean portfolio indifference, not divided attention', () => {
    const me = asFighterId('me');
    const boutique = manager({ clientIds: [me] });
    const agency = manager({
      clientIds: [me, ...Array.from({ length: 29 }, (_, i) => asFighterId(`c${i}`))],
    });
    expect(priority(agency, me)).toBeLessThan(priority(boutique, me) * 0.4);
  });

  it('says it in a sentence, never as a stat', () => {
    const many = manager({ clientIds: Array.from({ length: 14 }, (_, i) => asFighterId(`c${i}`)) });
    expect(describeStable(many)).toMatch(/not the priority/i);
    expect(describeStable(manager({ clientIds: [asFighterId('a')] }))).toMatch(/only fighter/i);
  });

  it('prices a stable conflict rather than forbidding it', () => {
    // Always a price, never a wall. A removed option with no counterplay is exactly the
    // intermediary problem that makes a manager feel like a tax.
    const other = asFighterId('teammate');
    const withConflict = manager({ clientIds: [asFighterId('me'), other] });
    expect(stableConflictCost(withConflict, other)).toBeGreaterThan(0);
    expect(stableConflictCost(withConflict, asFighterId('stranger'))).toBe(0);
  });
});

describe('the advice record, which is what saves the role', () => {
  it('starts untested and says so', () => {
    expect(describeAdviceRecord(manager())).toMatch(/not been tested/i);
  });

  it('counts only advice that has actually been settled', () => {
    let m = manager();
    m = recordAdvice(m, { day: 0, boutId: 'b1', recommended: true, line: 'Take it.' });
    m = recordAdvice(m, { day: 0, boutId: 'b2', recommended: false, line: 'Sit this one out.' });
    expect(adviceRecord(m).total).toBe(0);

    m = settleAdvice(m, 'b1', { fighterWon: true });
    expect(adviceRecord(m)).toEqual({ right: 1, total: 1 });
  });

  it('marks him wrong when he was', () => {
    let m = recordAdvice(manager(), { day: 0, boutId: 'b1', recommended: true, line: 'Take it.' });
    m = settleAdvice(m, 'b1', { fighterWon: false });
    expect(adviceRecord(m)).toEqual({ right: 0, total: 1 });
  });

  it('counts telling you to avoid a fight you would have lost as being right', () => {
    let m = recordAdvice(manager(), { day: 0, boutId: 'b1', recommended: false, line: 'No.' });
    m = settleAdvice(m, 'b1', { fighterWon: false });
    expect(adviceRecord(m).right).toBe(1);
  });

  it('gives the hub one number that is also the relationship', () => {
    let m = manager();
    for (let i = 0; i < 10; i++) {
      m = recordAdvice(m, { day: i, boutId: `b${i}`, recommended: true, line: 'Take it.' });
      m = settleAdvice(m, `b${i}`, { fighterWon: i < 7 });
    }
    expect(describeAdviceRecord(m)).toBe('He has been right 7 of 10 times.');
  });

  it('never settles the same prediction twice', () => {
    let m = recordAdvice(manager(), { day: 0, boutId: 'b1', recommended: true, line: 'Take it.' });
    m = settleAdvice(m, 'b1', { fighterWon: true });
    m = settleAdvice(m, 'b1', { fighterWon: false });
    expect(adviceRecord(m)).toEqual({ right: 1, total: 1 });
  });
});

describe('whose interests the advice serves', () => {
  const rng = () => createRng('advice');

  it('lets an honest manager tell a fighter not to take a bad fight', () => {
    const honest = manager({ integrity: 95 });
    const { recommended } = adviseOnBout({
      manager: honest,
      merit: -0.6,
      promotionId: APEX,
      purse: 40,
      rng: rng(),
    });
    expect(recommended).toBe(false);
  });

  it('makes a dishonest manager push a payday that is a bad idea', () => {
    // The misalignment, expressed as a number rather than as a personality trait.
    const shark = manager({ integrity: 5 });
    const { recommended } = adviseOnBout({
      manager: shark,
      merit: -0.6,
      promotionId: APEX,
      purse: 200,
      rng: rng(),
    });
    expect(recommended).toBe(true);
  });

  it('leaves an unmanaged fighter to make their own call, and says so', () => {
    const { line } = adviseOnBout({
      manager: undefined,
      merit: 0.5,
      promotionId: APEX,
      purse: 20,
      rng: rng(),
    });
    expect(line).toMatch(/your call/i);
  });

  it('always says something falsifiable', () => {
    for (const merit of [-1, -0.3, 0, 0.4, 1]) {
      const { line } = adviseOnBout({
        manager: manager(),
        merit,
        promotionId: APEX,
        purse: 30,
        rng: rng(),
      });
      expect(line.length).toBeGreaterThan(15);
    }
  });
});

describe('placements make the hidden favour readable', () => {
  const nameOf = (id: typeof APEX) => (id === APEX ? 'Apex' : 'Frontier');

  it('says plainly where he keeps putting people', () => {
    const placements = [APEX, APEX, APEX, APEX, APEX, APEX, APEX, APEX, APEX, FRONTIER, FRONTIER, FRONTIER];
    expect(placementSummary(placements, nameOf)).toBe(
      'He has placed 9 of his last 12 fighters at Apex.',
    );
  });

  it('says so when he genuinely spreads them around', () => {
    expect(placementSummary([APEX, FRONTIER, APEX, FRONTIER], nameOf)).toMatch(/across 2 promotions/i);
  });

  it('handles a manager who has placed nobody', () => {
    expect(placementSummary([], nameOf)).toMatch(/not placed anybody/i);
  });
});

describe('who a manager will take on', () => {
  it('speculates on a prospect a good gym vouches for', () => {
    // The realism correction to "a debutant gets whoever will take them". Good managers bet
    // on potential, early, on a coach's recommendation — which is also a far better reward
    // for having chosen a good gym than a reputation grind.
    expect(
      willRepresent({
        manager: manager({ negotiation: 80, standing: 70 }),
        fighterReputation: 5,
        fighterPotential: 85,
        gymPrestige: 88,
      }),
    ).toBe(true);
  });

  it('will not take an unremarkable fighter out of an unknown gym', () => {
    expect(
      willRepresent({
        manager: manager({ negotiation: 90, standing: 85 }),
        fighterReputation: 5,
        fighterPotential: 35,
        gymPrestige: 20,
      }),
    ).toBe(false);
  });

  it('lets a modest manager take almost anybody', () => {
    expect(
      willRepresent({
        manager: manager({ negotiation: 25, standing: 15 }),
        fighterReputation: 10,
        fighterPotential: 45,
        gymPrestige: 30,
      }),
    ).toBe(true);
  });
});

describe('what it costs', () => {
  it('charges nothing when there is nobody to charge', () => {
    expect(purseRateOf(undefined)).toBe(0);
  });

  it('stays inside the honest range', () => {
    // 20% is an outlier and regarded as predatory. The first draft's 10-20% was skewed high.
    expect(purseRateOf(manager())).toBeGreaterThanOrEqual(0.08);
    expect(purseRateOf(manager())).toBeLessThanOrEqual(0.15);
  });
});
