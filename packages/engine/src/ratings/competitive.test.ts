/**
 * The fence around § 7.1's comparator.
 *
 * `displayBand` carried this arithmetic privately from step 12 until the functional rating needed
 * it too, and the tests it had were tests of a *label*. These are tests of the shift itself.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPETITIVE_REFERENCE,
  competitiveAttributes,
  competitiveRating,
  isCompetitivelyRecentred,
} from './competitive.js';
import { ATTRIBUTE_KEYS, ratingBand, uniformAttributes, type Attributes } from './attributes.js';
import {
  ELITE_LIFT,
  PHYSICAL_SCALE_KEYS,
  expectedPhysical,
  isPhysicalScaleKey,
} from './physicalScale.js';
import { displayBand } from './displayBand.js';

const HEAVY = { divisionId: 'mens-heavyweight', sex: 'male' as const, eliteLift: ELITE_LIFT };
const FLY = { divisionId: 'mens-flyweight', sex: 'male' as const, eliteLift: ELITE_LIFT };

describe('competitiveRating', () => {
  /**
   * The whole purpose, in one assertion: a fighter at his division's rostered median reads the
   * reference whoever he is, so "is he good at this" has an answer that does not depend on which
   * weight class he was born into.
   */
  it('reads a divisional median as the reference, in every division', () => {
    for (const context of [HEAVY, FLY]) {
      for (const key of PHYSICAL_SCALE_KEYS) {
        const median = expectedPhysical(key, context.divisionId, context.sex)!;
        const rostered = median + ELITE_LIFT[key];
        expect(competitiveRating(key, rostered, context)).toBe(COMPETITIVE_REFERENCE);
      }
    }
  });

  /** The ladder is real: the same absolute Power is a worse Power for a heavyweight. */
  it('reads the same absolute physical differently in two divisions', () => {
    expect(competitiveRating('power', 70, FLY)).toBeGreaterThan(
      competitiveRating('power', 70, HEAVY),
    );
  });

  it('preserves gaps within a division', () => {
    const a = competitiveRating('power', 60, HEAVY);
    const b = competitiveRating('power', 80, HEAVY);
    expect(b - a).toBe(20);
  });

  it('falls back to the absolute rating for a division it does not know', () => {
    const unknown = { divisionId: 'mens-nonesuch', sex: 'male' as const, eliteLift: ELITE_LIFT };
    expect(competitiveRating('power', 64, unknown)).toBe(64);
  });
});

describe('competitiveAttributes', () => {
  /**
   * **Only the five physicals move**, which is not an omission but the other half of the claim:
   * there is no division term on Wrestling or Fight IQ (§ 2.3), so re-centring those would be
   * inventing a reference the sport does not support.
   */
  it('moves the five physicals and leaves the other ten alone', () => {
    const block = uniformAttributes(70) as Attributes;
    const out = competitiveAttributes(block, HEAVY);
    for (const key of ATTRIBUTE_KEYS) {
      if (isPhysicalScaleKey(key)) expect(out[key]).not.toBe(block[key]);
      else expect(out[key]).toBe(block[key]);
    }
    expect(PHYSICAL_SCALE_KEYS.every((k) => isCompetitivelyRecentred(k))).toBe(true);
  });

  /**
   * No context is the right failure rather than a fallback. A comparison that cannot name its
   * reference population should not invent one.
   */
  it('returns the block unchanged with no context', () => {
    const block = uniformAttributes(70) as Attributes;
    expect(competitiveAttributes(block)).toBe(block);
  });

  it('stays inside the rating range at both ends', () => {
    for (const v of [1, 100]) {
      const out = competitiveAttributes(uniformAttributes(v) as Attributes, HEAVY);
      for (const key of ATTRIBUTE_KEYS) {
        expect(out[key]).toBeGreaterThanOrEqual(1);
        expect(out[key]).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('displayBand still agrees with the shift it now imports', () => {
  it('bands a physical against the division and a technical absolutely', () => {
    const rating = 64;
    expect(displayBand('power', rating, HEAVY)).toBe(
      ratingBand(competitiveRating('power', rating, HEAVY)),
    );
    expect(displayBand('wrestling', rating, HEAVY)).toBe(ratingBand(rating));
    expect(displayBand('power', rating)).toBe(ratingBand(rating));
  });
});
