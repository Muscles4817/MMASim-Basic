/**
 * Deterministic pseudo-random number generation.
 *
 * The engine never touches `Math.random`. Every stochastic decision flows through an `Rng`
 * created from an explicit seed, which is what makes fights re-watchable, game plans
 * A/B-comparable against identical draws, and the long-sim regression suite meaningful.
 *
 * Algorithm is sfc32 — small, fast, passes PractRand, and trivially portable if we ever
 * need to reproduce a fight outside JS.
 */

/** A seeded random source. Cheap to create; fork liberally. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability `p`. `p <= 0` is never, `p >= 1` is always. */
  chance(p: number): boolean;
  /** Uniformly pick one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Pick one element, where `weightOf` returns a non-negative weight. */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T;
  /** A new copy of `items` in random order (Fisher–Yates). Does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** Standard-normal sample, mean 0, sd 1 (Box–Muller). */
  normal(): number;
  /** Normal sample clamped to [min, max], resampled rather than pinned at the bounds. */
  normalClamped(mean: number, sd: number, min: number, max: number): number;
  /**
   * A derived, independent stream. Two forks with different labels never correlate.
   *
   * Fork per subsystem so that adding a random call in one system does not shift every
   * downstream result — this is what keeps regression baselines stable across unrelated
   * changes.
   */
  fork(label: string): Rng;
}

/** Turn an arbitrary string into a well-mixed 32-bit seed (FNV-1a + avalanche). */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Final avalanche so that similar strings ("fight:1" / "fight:2") diverge immediately.
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Create an RNG from a numeric or string seed. */
export function createRng(seed: number | string): Rng {
  const s = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;

  // sfc32 state, spread from the single seed via distinct mixing constants.
  let a = (s ^ 0x9e3779b9) >>> 0;
  let b = (s ^ 0x243f6a88) >>> 0;
  let c = (s ^ 0xb7e15162) >>> 0;
  let d = 1;

  const nextUint32 = (): number => {
    const t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    d = (d + 0x9e3779b9) >>> 0;
    return (t + d) >>> 0;
  };

  // Discard the first few outputs so low-entropy seeds (0, 1, 2…) are well separated.
  for (let i = 0; i < 12; i++) nextUint32();

  // Box–Muller produces two normals per pair of uniforms; cache the spare.
  let spareNormal: number | null = null;

  const rng: Rng = {
    next: () => nextUint32() / 4294967296,

    int: (min, max) => {
      if (max < min) throw new RangeError(`rng.int: max (${max}) < min (${min})`);
      return min + Math.floor(rng.next() * (max - min + 1));
    },

    range: (min, max) => min + rng.next() * (max - min),

    chance: (p) => rng.next() < p,

    pick: (items) => {
      if (items.length === 0) throw new RangeError('rng.pick: empty array');
      return items[rng.int(0, items.length - 1)]!;
    },

    pickWeighted: (items, weightOf) => {
      if (items.length === 0) throw new RangeError('rng.pickWeighted: empty array');
      let total = 0;
      for (const item of items) {
        const w = weightOf(item);
        if (w > 0) total += w;
      }
      // All-zero weights degrade to a uniform pick rather than throwing; callers routinely
      // build weight functions that can legitimately zero out (e.g. no valid strikes).
      if (total <= 0) return rng.pick(items);

      let roll = rng.next() * total;
      for (const item of items) {
        const w = weightOf(item);
        if (w <= 0) continue;
        roll -= w;
        if (roll < 0) return item;
      }
      return items[items.length - 1]!;
    },

    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },

    normal: () => {
      if (spareNormal !== null) {
        const v = spareNormal;
        spareNormal = null;
        return v;
      }
      // Guard against log(0); next() can return exactly 0.
      let u = rng.next();
      while (u === 0) u = rng.next();
      const v = rng.next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spareNormal = mag * Math.sin(2 * Math.PI * v);
      return mag * Math.cos(2 * Math.PI * v);
    },

    normalClamped: (mean, sd, min, max) => {
      // Resample rather than clamp: pinning piles probability mass on the bounds, which
      // shows up as an implausible number of exactly-min-rated fighters in generation.
      for (let attempt = 0; attempt < 16; attempt++) {
        const v = mean + rng.normal() * sd;
        if (v >= min && v <= max) return v;
      }
      return Math.min(max, Math.max(min, mean));
    },

    fork: (label) => createRng(hashSeed(`${s}:${label}`)),
  };

  return rng;
}
