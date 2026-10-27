/**
 * Fighters talking, relationships remembered, people changing. Doc 34 C3.
 */

import { describe, expect, it } from 'vitest';
import { calloutFor, toneOf, voiceFor, VOICE_POOLS, type VoiceSituation } from './voice.js';
import {
  boutMemories,
  ledgerWeight,
  LEDGER_CAP,
  relationshipWith,
  stayChance,
  withLedgerEntry,
  type LedgerEntry,
} from './relationship.js';
import { driftAfter, milestonesOf, uniformPersonality } from './personality.js';
import { wantMet, wantsOf } from './disposition.js';
import { makeFighter } from '../testing/fixtures.js';
import { uniformAttributes } from '../ratings/attributes.js';
import type { FighterId, PromotionId } from '../core/ids.js';

const P = 'p_home' as PromotionId;
const brash = makeFighter({ id: 'brash', lastName: 'Loud', traits: ['trashTalker'] });
const quiet = makeFighter({ id: 'quiet', lastName: 'Still', personality: { charisma: 20 } });
const champ = makeFighter({ id: 'champ', firstName: 'Big', lastName: 'Champ' });

describe('the voice', () => {
  it('speaks in a register that follows the person', () => {
    expect(toneOf(brash)).toBe('brash');
    expect(toneOf(quiet)).toBe('cold');
    expect(toneOf(makeFighter({ personality: { ego: 20, professionalism: 80 } }))).toBe(
      'respectful',
    );
  });

  it('calls out the first target who is not tonight’s opponent, and names them', () => {
    const line = calloutFor({
      winner: brash,
      loser: quiet,
      method: 'ko',
      day: 100,
      targets: [quiet, champ],
    })!;
    expect(line.targetId).toBe(champ.id);
    expect(line.quote).toContain('Big Champ');
    expect(line.text.startsWith('Loud: “')).toBe(true);
  });

  it('says the same thing about the same night every time', () => {
    const args = { winner: brash, loser: quiet, method: 'ko' as const, day: 100, targets: [champ] };
    expect(calloutFor(args)).toEqual(calloutFor(args));
  });

  it('never says the same sentence twice in a row', () => {
    for (const situation of Object.keys(VOICE_POOLS.SAYS) as VoiceSituation[]) {
      for (let day = 0; day < 40; day++) {
        const first = voiceFor(brash, situation, day).quote;
        expect(voiceFor(brash, situation, day, first).quote).not.toBe(first);
      }
    }
  });

  it('stays quiet after a draw', () => {
    expect(calloutFor({ winner: brash, loser: quiet, method: 'draw', day: 1 })).toBeUndefined();
  });
});

describe('the relationship ledger', () => {
  const entry = (kind: LedgerEntry['kind'], day = 1000): LedgerEntry => ({
    day,
    promotionId: P,
    kind,
  });

  it('keeps a bounded history', () => {
    let ledger: LedgerEntry[] = [];
    for (let i = 0; i < LEDGER_CAP + 5; i++) ledger = withLedgerEntry(ledger, entry('mismatch', i));
    expect(ledger).toHaveLength(LEDGER_CAP);
    expect(ledger[ledger.length - 1]!.day).toBe(LEDGER_CAP + 4);
  });

  it('reads the same history through the personality', () => {
    const skipped = [entry('titleShotSkipped')];
    const hungry = relationshipWith(
      { ledger: skipped, personality: { ...uniformPersonality(50), ambition: 90, ego: 80 } },
      P,
      1000,
    );
    const loyal = relationshipWith(
      { ledger: skipped, personality: { ...uniformPersonality(50), ambition: 30, loyalty: 95 } },
      P,
      1000,
    );
    expect(hungry.score).toBeLessThan(loyal.score);
    expect(hungry.worst?.kind).toBe('titleShotSkipped');
    // An ambitious fighter does not thank you for protecting them.
    expect(ledgerWeight('protected', { ...uniformPersonality(50), ambition: 90 })).toBeLessThan(0);
    expect(ledgerWeight('protected', { ...uniformPersonality(50), ambition: 20 })).toBeGreaterThan(
      0,
    );
  });

  it('lets old grudges fade, and keeps each promotion’s history to itself', () => {
    const fighter = { ledger: [entry('cut', 0)], personality: uniformPersonality(50) };
    const fresh = relationshipWith(fighter, P, 0).score;
    const later = relationshipWith(fighter, P, 1440).score;
    expect(later).toBeGreaterThan(fresh);
    expect(Math.abs(later)).toBeCloseTo(Math.abs(fresh) / 4, 5);
    expect(relationshipWith(fighter, 'p_other' as PromotionId, 0).score).toBe(0);
  });

  it('remembers a mismatch, a title shot and a rematch from the bout itself', () => {
    const weak = makeFighter({ id: 'weak', attributes: uniformAttributes(40) });
    const strong = makeFighter({ id: 'strong', attributes: uniformAttributes(70) });
    expect(
      boutMemories({
        fighter: weak,
        opponent: strong,
        boutId: 'b2',
        winnerId: strong.id,
        method: 'ko',
        isTitleFight: true,
        championId: strong.id,
      }),
    ).toEqual(['titleShotGiven', 'mismatch']);

    const owed = {
      ...weak,
      record: [
        {
          boutId: 'b1',
          opponentId: strong.id,
          outcome: 'loss',
        } as never,
      ],
    };
    expect(
      boutMemories({
        fighter: owed,
        opponent: strong,
        boutId: 'b2',
        winnerId: weak.id,
        method: 'decisionUnanimous',
        isTitleFight: false,
      }),
    ).toContain('rematchGiven');
  });
});

describe('people change', () => {
  it('drifts a few points at a milestone, and only then', () => {
    const p = uniformPersonality(50);
    expect(driftAfter(p, [])).toBe(p);
    const crowned = driftAfter(
      p,
      milestonesOf({ won: true, knockedOut: false, wonTitle: true, lostTitle: false, streak: 1 }),
    );
    expect(crowned.ego).toBeGreaterThan(p.ego);
    expect(Math.abs(crowned.ego - p.ego)).toBeLessThanOrEqual(5);
    const slump = milestonesOf({
      won: false,
      knockedOut: true,
      wonTitle: false,
      lostTitle: false,
      streak: -3,
    });
    expect(slump).toEqual(['knockedOut', 'losingRun']);
  });
});

describe('richer wants', () => {
  it('wants the rematch after a close loss, and knows who with', () => {
    const f = {
      ...makeFighter({ personality: { ambition: 80, resilience: 80 } }),
      record: [
        {
          boutId: 'b',
          opponentId: 'rival' as FighterId,
          outcome: 'loss',
          method: 'decisionSplit',
          day: 900,
        } as never,
      ],
    };
    const want = wantsOf({ fighter: f, day: 1000, daysIdle: 100 });
    expect(want.id).toBe('rematch');
    expect(want.opponentId).toBe('rival');
    expect(wantMet(want, { opponent: { id: 'rival' as FighterId, starPower: 10 }, step: 0 })).toBe(
      true,
    );
    expect(wantMet(want, { opponent: { id: 'other' as FighterId, starPower: 10 }, step: 0 })).toBe(
      false,
    );
  });

  it('wants a superfight with the belt and a name', () => {
    const f = { ...makeFighter({ personality: { ambition: 85 } }), starPower: 70 };
    expect(wantsOf({ fighter: f, day: 0, rank: 0, daysIdle: 30 }).id).toBe('superfight');
  });
});

describe('re-signing', () => {
  it('stays more readily where they were treated well, and less where they were not', () => {
    const p = uniformPersonality(50);
    const at = (kind: LedgerEntry['kind']) =>
      stayChance({ ledger: [{ day: 0, promotionId: P, kind }], personality: p }, P, 0);
    expect(stayChance({ personality: p }, P, 0)).toBe(0.7);
    expect(at('titleShotGiven')).toBeGreaterThan(0.7);
    expect(at('cut')).toBeLessThan(0.7);
  });
});
