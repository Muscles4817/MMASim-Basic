/**
 * One way to choose an action, and one way to measure how much the plan got to say about it.
 *
 * Every decision in a fight had the same shape and none of them said so. Five weighted draws —
 * at range, holding the clinch, held in it, on top, underneath — each built its candidates as a
 * chain of multiplications with the plan's bias somewhere in the middle, and each chain mixed
 * three different kinds of number without naming any of them:
 *
 *  - **capability**, what this fighter can physically do, on the 25–95 attribute scale
 *  - **intent**, `exp(alignment × strength × urgency)` from the policy layer
 *  - **opportunity**, what is actually available right now — how far away he is, how dominant the
 *    position is, whether the man in front of him has a hole in his defence
 *
 * That they were indistinguishable is doc 31 § F4. A draw is a softmax over `ln(capability) +
 * alignment × strength × urgency`, so **the plan's authority over a decision is the size of its
 * span relative to the spread of the capability terms it is arguing against** — and that spread
 * was set per list by whatever coefficients happened to be written there. Bottom submissions were
 * `submissions × 0.8` in guard and the literal `0.05` outside it, a spread of about 900:1 against
 * a plan whose entire range is 6.7:1; the same plan at range argues against a spread nearer 2:1
 * and wins easily. Nobody could tell which instructions were strong and which were decorative,
 * because the answer was never written down anywhere.
 *
 * This module does not change any of those numbers. It gives them names, puts every list on one
 * code path, and makes the authority a fighter's corner has over each decision a value that can be
 * computed and asserted. Choosing the baselines deliberately is the next piece of work and it is a
 * behaviour change; this one is not.
 *
 * See docs/01 § Intent authority for the rule this exists to make enforceable.
 */

import type { Rng } from '../core/rng.js';

/**
 * One thing a fighter could do next.
 *
 * The three fields are multiplied in the order they are declared, which is the order the original
 * expressions used — a candidate is `capability × intent × opportunity` and nothing else. Keeping
 * the order is what makes this refactor arithmetically identical rather than merely equivalent.
 */
export interface Candidate<K extends string> {
  key: K;
  /**
   * What this fighter brings to this action, before anybody's plan or the state of the fight.
   *
   * Usually a fatigued attribute. Sometimes a declared constant — a fighter holding somebody
   * against the fence and doing nothing is not expressing an attribute — and those constants are
   * the ones worth being suspicious of, because a bare number competing against a 25–95 scale is
   * a baseline nobody chose on purpose.
   */
  capability: number;
  /** `exp(alignment × strength × urgency)`. What the corner asked for, and how much they meant it. */
  intent: number;
  /** What the fight itself offers: position, distance, dominance, an opening in the other man. */
  opportunity?: number;
}

/** The weight a candidate actually draws with. */
const weigh = <K extends string>(c: Candidate<K>): number =>
  c.opportunity === undefined ? c.capability * c.intent : c.capability * c.intent * c.opportunity;

/**
 * Pick one, weighted.
 *
 * A thin wrapper on `pickWeighted` on purpose: it consumes exactly one random value in exactly the
 * same order as the code it replaces, so a fight resolves identically before and after.
 */
export function chooseAction<K extends string>(rng: Rng, candidates: readonly Candidate<K>[]): K {
  return rng.pickWeighted(candidates, weigh).key;
}

/** What each candidate's share of the draw actually is. For diagnosis, never for the draw itself. */
export function actionShares<K extends string>(
  candidates: readonly Candidate<K>[],
): Record<K, number> {
  const weights = candidates.map(weigh);
  const total = weights.reduce((a, b) => a + b, 0);
  const out = {} as Record<K, number>;
  candidates.forEach((c, i) => {
    out[c.key] = total <= 0 ? 0 : weights[i]! / total;
  });
  return out;
}

/** The multiplicative spread of a set of positive numbers, in log space. Zero means "all equal". */
const logSpan = (values: readonly number[]): number =>
  values.length < 2 ? 0 : Math.log(Math.max(...values) / Math.min(...values));

/**
 * How much the plan is allowed to matter here, as a single comparable number.
 *
 * A weighted draw is a softmax, so the argument each candidate carries is
 * `ln(capability × opportunity) + ln(intent)`, and the two terms are directly comparable in that
 * space. The ratio of their spans is therefore the honest answer to "can this corner out-argue
 * this fighter's own attributes at this decision":
 *
 *  - **above 1** — a fully convinced plan can reorder the list. The instruction is real.
 *  - **around 1** — the plan and the fighter are arguing at similar volume, which is usually what
 *    is wanted: intent bends behaviour without overriding who somebody is.
 *  - **near 0** — the instruction is decorative. Whatever the corner said, this decision was
 *    already made by the numbers.
 *
 * `Infinity` is a real answer and means the capability terms are identical, so the plan decides
 * the whole thing — which is correct for a list whose candidates are equally available.
 *
 * This is deliberately a property of *one* decision at *one* moment rather than an average over a
 * fight: authority varies with position and fatigue, and a mean would hide exactly the moments
 * where an instruction quietly stops applying.
 */
export function intentAuthority<K extends string>(candidates: readonly Candidate<K>[]): number {
  /*
   * Only the actions that are actually on the menu.
   *
   * A zero-weight candidate means "not available", not "the most suppressed thing in this fight",
   * and it has to leave *both* sums or the metric contradicts itself — the first cut dropped it
   * from the capability span and kept it in the intent span, so an impossible action with a strong
   * instruction behind it read as the plan having more authority than it did.
   */
  const drawable = candidates.filter((c) => weigh(c) > 0);
  const capabilitySpan = logSpan(
    drawable.map((c) => (c.opportunity === undefined ? c.capability : c.capability * c.opportunity)),
  );
  const intentSpan = logSpan(drawable.map((c) => c.intent));
  if (capabilitySpan <= 0) return intentSpan > 0 ? Number.POSITIVE_INFINITY : 0;
  return intentSpan / capabilitySpan;
}
