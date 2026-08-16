/** Statistics helpers for the test suites. Duplicated from the engine so the tests do not
 * assert against the same code they are validating. */

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, v) => a + v, 0) / values.length;
}

export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Linear-interpolated percentile. Sorts a copy; safe to call on shared arrays. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}
