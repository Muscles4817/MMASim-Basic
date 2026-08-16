import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTES_BY_GROUP,
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  RATING_BANDS,
  overallRating,
  ratingBand,
  toRating,
  uniformAttributes,
} from './attributes.js';
import { deriveRatings, DERIVED_KEYS, DERIVED_META } from './derived.js';

describe('attribute metadata', () => {
  it('has exactly 15 attributes (design pillar 1: simple surface)', () => {
    expect(ATTRIBUTE_KEYS).toHaveLength(15);
  });

  it('describes every attribute', () => {
    for (const key of ATTRIBUTE_KEYS) {
      const meta = ATTRIBUTE_META[key];
      expect(meta.key).toBe(key);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.blurb.length).toBeGreaterThan(10);
      expect(meta.convexity).toBeGreaterThan(0);
    }
  });

  it('partitions every attribute into exactly one group', () => {
    const grouped = ATTRIBUTE_GROUPS.flatMap((g) => ATTRIBUTES_BY_GROUP[g]);
    expect(grouped).toHaveLength(ATTRIBUTE_KEYS.length);
    expect(new Set(grouped)).toEqual(new Set(ATTRIBUTE_KEYS));
  });

  it('agrees with each attribute’s declared group', () => {
    for (const group of ATTRIBUTE_GROUPS) {
      for (const key of ATTRIBUTES_BY_GROUP[group]) {
        expect(ATTRIBUTE_META[key].group).toBe(group);
      }
    }
  });
});

describe('toRating', () => {
  it.each([
    [-10, 1],
    [0, 1],
    [1, 1],
    [50.4, 50],
    [50.6, 51],
    [100, 100],
    [140, 100],
  ])('clamps and rounds %s → %s', (input, expected) => {
    expect(toRating(input)).toBe(expected);
  });
});

describe('ratingBand', () => {
  it('is ordered descending and covers the whole scale', () => {
    for (let i = 1; i < RATING_BANDS.length; i++) {
      expect(RATING_BANDS[i]!.min).toBeLessThan(RATING_BANDS[i - 1]!.min);
    }
    for (let r = 1; r <= 100; r++) {
      expect(ratingBand(r)).toBeDefined();
    }
  });

  it.each([
    [99, 'allTime'],
    [96, 'allTime'],
    [95, 'worldBest'],
    [82, 'elite'],
    [72, 'veryGood'],
    [62, 'solid'],
    [50, 'average'],
    [38, 'belowLevel'],
    [20, 'liability'],
    [1, 'absent'],
  ])('places %s in band %s', (rating, key) => {
    expect(ratingBand(rating).key).toBe(key);
  });
});

describe('overallRating', () => {
  it('returns the input value for a uniform fighter', () => {
    for (const v of [30, 50, 75, 90]) {
      expect(overallRating(uniformAttributes(v))).toBeCloseTo(v, 5);
    }
  });

  it('is monotonic in every attribute', () => {
    const base = uniformAttributes(50);
    for (const key of ATTRIBUTE_KEYS) {
      const better = { ...base, [key]: 90 };
      expect(overallRating(better)).toBeGreaterThan(overallRating(base));
    }
  });

  it('stays within the rating scale', () => {
    expect(overallRating(uniformAttributes(1))).toBeGreaterThanOrEqual(1);
    expect(overallRating(uniformAttributes(100))).toBeLessThanOrEqual(100);
  });
});

describe('derived ratings', () => {
  it('describes every derived rating with weights summing to 1', () => {
    for (const key of DERIVED_KEYS) {
      const meta = DERIVED_META[key];
      const total = meta.inputs.reduce((acc, [, w]) => acc + w, 0);
      expect(total).toBeCloseTo(1, 6);
      expect(meta.inputs.length).toBeGreaterThan(1);
    }
  });

  it('matches the input value for a uniform fighter', () => {
    const derived = deriveRatings(uniformAttributes(70));
    for (const key of DERIVED_KEYS) expect(derived[key]).toBe(70);
  });

  it('cannot produce an incoherent fighter (the reason these are not stored)', () => {
    // A weak, non-wrestling fighter must not be able to have an elite clinch.
    const weak = { ...uniformAttributes(70), strength: 25, wrestling: 25 };
    expect(deriveRatings(weak).clinchOffence).toBeLessThan(45);
  });

  describe('named archetypes behave as designed', () => {
    it('a huge, powerful, low-technique grappler still hits hard from top', () => {
      const attrs = { ...uniformAttributes(40), groundControl: 60, power: 95 };
      expect(deriveRatings(attrs).groundAndPound).toBeGreaterThan(70);
    });

    it('a slick, low-strength guard player defends submissions well', () => {
      const attrs = { ...uniformAttributes(45), scrambling: 90, submissions: 90, fightIq: 80 };
      expect(deriveRatings(attrs).submissionDefence).toBeGreaterThan(80);
    });

    it('an elite wrestler with an elite gas tank chains takedowns', () => {
      const attrs = { ...uniformAttributes(55), wrestling: 88, cardio: 97, strength: 75 };
      expect(deriveRatings(attrs).chainWrestling).toBeGreaterThan(85);
    });

    it('an elite wrestler with a bad gas tank cannot chain them', () => {
      const attrs = { ...uniformAttributes(55), wrestling: 88, cardio: 40, strength: 75 };
      expect(deriveRatings(attrs).chainWrestling).toBeLessThan(72);
    });
  });
});
