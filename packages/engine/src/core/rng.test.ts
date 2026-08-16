import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from './rng.js';
import { mean, stdDev } from './math.js';

describe('hashSeed', () => {
  it('is stable across calls', () => {
    expect(hashSeed('fight:0001')).toBe(hashSeed('fight:0001'));
  });

  it('avalanches on near-identical inputs', () => {
    // Sequential IDs are the common case; if these correlate, consecutive fights on a card
    // share randomness and the whole event feels samey.
    const a = hashSeed('fight:0001');
    const b = hashSeed('fight:0002');
    expect(a).not.toBe(b);
    // Expect roughly half the bits to differ.
    const differingBits = ((a ^ b) >>> 0).toString(2).replace(/0/g, '').length;
    expect(differingBits).toBeGreaterThan(8);
  });
});

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-a');
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.next())(createRng('a')));
    const b = Array.from({ length: 20 }, ((r) => () => r.next())(createRng('b')));
    expect(a).not.toEqual(b);
  });

  it('separates low-entropy numeric seeds', () => {
    // Naive LCG-style generators produce visibly similar streams for seeds 0/1/2.
    const first = [0, 1, 2, 3].map((s) => createRng(s).next());
    expect(new Set(first).size).toBe(4);
    expect(stdDev(first)).toBeGreaterThan(0.05);
  });

  it('produces uniform values in [0, 1)', () => {
    const rng = createRng('uniformity');
    const samples = Array.from({ length: 100_000 }, () => rng.next());
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    expect(mean(samples)).toBeCloseTo(0.5, 2);
    // Uniform[0,1) has sd = 1/sqrt(12) ≈ 0.2887.
    expect(stdDev(samples)).toBeCloseTo(0.2887, 2);
  });

  describe('int', () => {
    it('covers the inclusive range', () => {
      const rng = createRng('int');
      const seen = new Set(Array.from({ length: 2000 }, () => rng.int(3, 7)));
      expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    });

    it('handles a single-value range', () => {
      expect(createRng('x').int(5, 5)).toBe(5);
    });

    it('rejects an inverted range', () => {
      expect(() => createRng('x').int(7, 3)).toThrow(RangeError);
    });
  });

  describe('chance', () => {
    it('matches the requested probability', () => {
      const rng = createRng('chance');
      const hits = Array.from({ length: 40_000 }, () => rng.chance(0.25)).filter(Boolean).length;
      expect(hits / 40_000).toBeCloseTo(0.25, 2);
    });

    it('treats out-of-range probabilities as never/always', () => {
      const rng = createRng('bounds');
      expect(Array.from({ length: 500 }, () => rng.chance(0)).some(Boolean)).toBe(false);
      expect(Array.from({ length: 500 }, () => rng.chance(1)).every(Boolean)).toBe(true);
    });
  });

  describe('pickWeighted', () => {
    it('respects weights', () => {
      const rng = createRng('weights');
      const items = [
        { id: 'a', w: 1 },
        { id: 'b', w: 3 },
      ];
      const picks = Array.from({ length: 20_000 }, () => rng.pickWeighted(items, (i) => i.w).id);
      const bShare = picks.filter((p) => p === 'b').length / picks.length;
      expect(bShare).toBeCloseTo(0.75, 2);
    });

    it('ignores non-positive weights', () => {
      const rng = createRng('zero-weights');
      const items = ['a', 'b', 'c'];
      const picks = Array.from({ length: 500 }, () =>
        rng.pickWeighted(items, (i) => (i === 'b' ? 1 : 0)),
      );
      expect(new Set(picks)).toEqual(new Set(['b']));
    });

    it('falls back to a uniform pick when every weight is zero', () => {
      // Callers legitimately build weight functions that can zero out entirely (e.g. no
      // legal strike from this position); throwing there would be hostile.
      const rng = createRng('all-zero');
      const picks = Array.from({ length: 300 }, () => rng.pickWeighted(['a', 'b'], () => 0));
      expect(new Set(picks).size).toBe(2);
    });
  });

  describe('shuffle', () => {
    it('does not mutate the input and preserves membership', () => {
      const rng = createRng('shuffle');
      const input = [1, 2, 3, 4, 5];
      const out = rng.shuffle(input);
      expect(input).toEqual([1, 2, 3, 4, 5]);
      expect([...out].sort()).toEqual(input);
    });

    it('actually reorders', () => {
      const rng = createRng('shuffle-2');
      const input = Array.from({ length: 20 }, (_, i) => i);
      const shuffles = Array.from({ length: 10 }, () => rng.shuffle(input).join(','));
      expect(new Set(shuffles).size).toBeGreaterThan(8);
    });
  });

  describe('normal', () => {
    it('has mean 0 and sd 1', () => {
      const rng = createRng('normal');
      const samples = Array.from({ length: 100_000 }, () => rng.normal());
      expect(mean(samples)).toBeCloseTo(0, 1);
      expect(stdDev(samples)).toBeCloseTo(1, 1);
    });

    it('is finite even when the underlying uniform hits zero', () => {
      const rng = createRng('normal-finite');
      const samples = Array.from({ length: 50_000 }, () => rng.normal());
      expect(samples.every(Number.isFinite)).toBe(true);
    });
  });

  describe('normalClamped', () => {
    it('stays within bounds', () => {
      const rng = createRng('clamped');
      const samples = Array.from({ length: 20_000 }, () => rng.normalClamped(50, 15, 20, 80));
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(20);
      expect(Math.max(...samples)).toBeLessThanOrEqual(80);
    });

    it('does not pile mass on the bounds', () => {
      // Clamping (rather than resampling) would produce a visible spike at each bound,
      // which shows up in fighter generation as implausibly many identical ratings.
      const rng = createRng('no-pile');
      const n = 20_000;
      const samples = Array.from({ length: n }, () => rng.normalClamped(50, 30, 40, 60));
      const atBound = samples.filter((s) => s <= 40.01 || s >= 59.99).length;
      expect(atBound / n).toBeLessThan(0.01);
    });
  });

  describe('fork', () => {
    it('produces independent streams per label', () => {
      const root = createRng('root');
      const a = root.fork('fight').next();
      const b = root.fork('camp').next();
      expect(a).not.toBe(b);
    });

    it('is reproducible from the same root and label', () => {
      const a = createRng('root').fork('fight:001');
      const b = createRng('root').fork('fight:001');
      expect(Array.from({ length: 10 }, () => a.next())).toEqual(
        Array.from({ length: 10 }, () => b.next()),
      );
    });

    it('is unaffected by consumption of the parent stream', () => {
      // This is the property that keeps regression baselines stable: adding a random call
      // to an unrelated subsystem must not shift every downstream fight.
      const rootA = createRng('root');
      const forkA = rootA.fork('fight:001').next();

      const rootB = createRng('root');
      for (let i = 0; i < 100; i++) rootB.next();
      const forkB = rootB.fork('fight:001').next();

      expect(forkA).toBe(forkB);
    });
  });
});
