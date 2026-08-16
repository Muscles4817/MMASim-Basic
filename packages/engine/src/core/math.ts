/** Small numeric helpers shared across the engine. Pure, no RNG, no domain knowledge. */

/** Constrain `value` to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Constrain to [0, 1]. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Linear interpolation; `t` is clamped so callers cannot accidentally extrapolate. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Map `value` from [inMin, inMax] onto [outMin, outMax], clamped at both ends.
 * A degenerate input range collapses to `outMin` rather than dividing by zero.
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return lerp(outMin, outMax, (value - inMin) / (inMax - inMin));
}

/** Logistic curve. `steepness` is the change in `x` needed to move meaningfully off 0.5. */
export function logistic(x: number, midpoint = 0, steepness = 1): number {
  return 1 / (1 + Math.exp(-(x - midpoint) / steepness));
}

/**
 * Convert an advantage margin into a win probability.
 *
 * Used everywhere one rating is contested against another. `scale` is the margin at which
 * the favourite wins ~73% of contests; a smaller scale makes the attribute more decisive.
 */
export function contest(advantage: number, scale = 12): number {
  return logistic(advantage, 0, scale);
}

/** Sum of an array, or 0 when empty. */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Arithmetic mean, or 0 when empty. */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Weighted mean of `[value, weight]` pairs. Zero total weight yields 0. */
export function weightedMean(pairs: readonly (readonly [number, number])[]): number {
  let acc = 0;
  let weight = 0;
  for (const [value, w] of pairs) {
    acc += value * w;
    weight += w;
  }
  return weight === 0 ? 0 : acc / weight;
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * Linear-interpolated percentile of a *sorted ascending* array.
 * `p` is 0–1. Callers are responsible for sorting; this is called in hot paths.
 */
export function percentileOfSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo]! : lerp(sorted[lo]!, sorted[hi]!, idx - lo);
}

/** Round to `dp` decimal places. Guards against `-0` leaking into serialised state. */
export function round(value: number, dp = 0): number {
  const f = 10 ** dp;
  const r = Math.round(value * f) / f;
  return r === 0 ? 0 : r;
}
