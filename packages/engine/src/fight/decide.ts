/**
 * One way to choose an action, and one way to measure how much the plan got to say about it.
 *
 * Every decision in a fight had the same shape and none of them said so. Five weighted draws —
 * at range, holding the clinch, held in it, on top, underneath — each built its candidates as a
 * chain of multiplications with the plan's bias somewhere in the middle, and each chain mixed
 * three different kinds of number without naming any of them:
 *
 *  - **capability**, what this fighter can physically do — an attribute read through
 *    `fatiguedEffect`, which returns a multiplier near 1 rather than a rating
 *  - **intent**, `exp(alignment × strength × urgency)` from the policy layer
 *  - **opportunity**, what is actually available right now — how far away he is, how dominant the
 *    position is, whether the man in front of him has a hole in his defence
 *
 * That they were indistinguishable is doc 31 § F4. A draw is a softmax over `ln(capability) +
 * alignment × strength × urgency`, so **the plan's authority over a decision is the size of its
 * span relative to the spread of the capability terms it is arguing against** — and that spread
 * was set per list by whatever coefficients happened to be written there. Bottom submissions are
 * `submissions × 0.8` in guard, which reads about 1.29, and the literal `0.05` outside it: sixteen
 * to one against a `standUp` at 0.82, where a plan's entire range is about seven to one. Nobody
 * could tell which instructions were strong and which were decorative, because the answer was
 * never written down anywhere.
 *
 * (An earlier version of this comment said capability was "on the 25–95 scale" and put that gap at
 * 900:1. It is not and it is not: `fatiguedEffect` returns `effect()`, which is
 * `exp(convexity × (rating − 50) / 50)`, so a 70-rated attribute reads about 1.5. The measurements
 * were always right because they read the real values; the prose was invented.)
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
 * Four fields, multiplied. Three of them — `capability`, `opportunity`, `repertoire` — are facts
 * about the fighter and the fight; `intent` is the only one his corner owns, which is what makes
 * `intentAuthority` a meaningful ratio rather than an arbitrary one.
 *
 * `repertoire` is the newest and is doc 31 § D16: without it a candidate's share was decided by
 * the *ratio* between the attribute naming it and whatever attribute named the candidate beside
 * it, so nothing could say that a technique was not in a fighter's game. It is `undefined`
 * wherever there is no technique to have.
 */
export interface Candidate<K extends string> {
  key: K;
  /**
   * What this fighter brings to this action, before anybody's plan or the state of the fight.
   *
   * Usually a fatigued attribute, which lands near 1. Sometimes a declared constant — a fighter
   * holding somebody against the fence and doing nothing is not expressing an attribute — and
   * those constants are the ones worth being suspicious of, not because they are small but because
   * they are arbitrary: unrelated to anything about the fighter, and therefore a baseline nobody
   * chose on purpose.
   */
  capability: number;
  /** `exp(alignment × strength × urgency)`. What the corner asked for, and how much they meant it. */
  intent: number;
  /** What the fight itself offers: position, distance, dominance, an opening in the other man. */
  opportunity?: number;
  /**
   * **Is this technique in his game at all?** 0–1, `undefined` meaning "not a question here".
   *
   * The fourth term, and the one whose absence was doc 31 § D16. `capability` says how well an
   * action would go and is a multiplier that never reaches zero; this says whether he would reach
   * for it, and it is a gate. Keeping them apart is the same argument that separated the first
   * three: a draw is a softmax over the log of everything on the capability side, so a candidate's
   * share was decided by the *ratio* between the attribute naming it and whatever attribute named
   * the candidate beside it — and a fighter with `submissions: 70` reached for a submission less
   * often than one with `submissions: 30` who scrambled worse.
   *
   * It lives on the capability side of the draw and of `intentAuthority`, because it is a fact
   * about the fighter rather than about his corner. `repertoire` in `ratings/curve.ts` computes it,
   * anchored on doc 02's own scale bands, and is exactly 1 for any rating of 50 or better — so on
   * an average-or-better fighter this field changes nothing at all.
   *
   * ### Exactly one candidate in every list must be left ungated, and it is not a convention
   *
   * **A weighted draw renormalises**, so a gate applied to every row of a list cancels out of the
   * shares entirely — and worse than cancels, because the rows are gated by *different* amounts. It
   * was tried that way first: gating `defend` alongside `submission` took a fighter with
   * `submissions: 50` and `scrambling: 30` from 28% of his beats hunting a submission to **75%**,
   * because crushing his framing left the submission the only thing on the list. The man least able
   * to defend became the man most committed to attacking, which is the relativity this whole term
   * exists to remove, reproduced with an extra factor.
   *
   * So each list has a **residual** — the thing a fighter does when he is not electing to do
   * something else — and the residual carries no gate. Throwing hands at range, hand-fighting in a
   * tie-up you are held in, keeping the grips in one you own, framing off your back, riding the
   * position on top. The elective actions are gated *against* it, which means the gate can only
   * ever move share **toward** the basic thing and never away from it. That monotonicity is the
   * property that makes it safe: a hole can make a fighter simpler, never busier.
   *
   * Left `undefined` in two other places: on a bare positional constant, which is not something a
   * fighter can be bad at, and on every **exit** — see `standUpFromTop` in `simulate.ts` for why
   * gating the door would charge a fighter for the same hole twice.
   */
  repertoire?: number;
}

/**
 * The weight a candidate actually draws with.
 *
 * **The multiplication order is load-bearing and must stay `capability × intent × opportunity ×
 * repertoire`.** Floating-point multiplication is not associative, so reordering these moves the
 * last bits of a weight, and `pickWeighted` is deterministic on exactly those bits — a reorder
 * silently reshuffles every draw in every fight in the game. The original three are in the order
 * the pre-`decide.ts` expressions used, which is what made that refactor arithmetically identical
 * rather than merely equivalent; `repertoire` is appended rather than inserted for the same reason,
 * and the ternaries keep an absent field from contributing a `× 1` that would do the same thing.
 */
const weigh = <K extends string>(c: Candidate<K>): number => {
  const base =
    c.opportunity === undefined ? c.capability * c.intent : c.capability * c.intent * c.opportunity;
  return c.repertoire === undefined ? base : base * c.repertoire;
};

/**
 * Everything on the fighter-and-fight side of the draw: what he brings, what is available to him,
 * and whether it is in his game. Everything except his corner, which is what `intent` is.
 */
const available = <K extends string>(c: Candidate<K>): number =>
  c.capability * (c.opportunity ?? 1) * (c.repertoire ?? 1);

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
  const capabilitySpan = logSpan(drawable.map(available));
  const intentSpan = logSpan(drawable.map((c) => c.intent));
  if (capabilitySpan <= 0) return intentSpan > 0 ? Number.POSITIVE_INFINITY : 0;
  return intentSpan / capabilitySpan;
}

/**
 * How hard a fighter is trying to leave, as a probability that this beat is spent on the exit.
 *
 * The other half of the tactical hierarchy, and the reason it is a separate function rather than
 * two more entries in one list: *what am I doing while I am here* and *how urgently am I trying to
 * stop being here* are different questions on different clocks, and drawing them together makes
 * the second one crowd out the first (docs/01 § 8, doc 31 § F1).
 *
 * It takes an **alignment** — how much this plan wants out of this state, in −1…+1 — and the
 * fighter's own conviction, and nothing else. Capability does not appear, which is the point: the
 * plan decides how often a fighter goes for the door, and his attributes against the other man's
 * decide whether it opens. That is the same division range already draws.
 *
 * **`neutral` is what a fighter with no instructions does**, and it is not 0.5. This is the same
 * lesson `rangeUrgency` records about its floor: getting up off your back is a property of
 * fighting, not of planning, and a man told nothing still wants out from underneath. A first cut
 * centred the scale at a half and every unplanned fighter in the game stopped trying to stand —
 * bottom exits fell from about 85% of beats to 50%, the sport spent longer on the floor, and the
 * striking attributes lost two points of win-rate swing. The neutral is measured from what the
 * engine did before the split, and the plan moves it from there.
 *
 * A first cut derived the urgency from the *sum of intents* over the exit actions against the sum
 * over the in-state actions, and it was wrong in a way worth recording: adding a third in-state
 * action diluted it. Introducing `pummel` to the held clinch — an action that helps a striker
 * leave — dropped his break attempts from 91% of beats to 51%, because the new candidate landed on
 * the "staying" side of a ratio it had no business being in. **How much you want out cannot be a
 * function of how many things there are to do while you are in.**
 *
 * Floored and capped, because both ends have to remain possible:
 *
 *  - the floor is what stops "stay and work" meaning a fighter who *cannot* leave a position that
 *    has become untenable;
 *  - the cap is what stops "get up" meaning a fighter who does nothing else while failing to.
 *
 * Neither bound is a tuning knob for how much the plan is worth. They are the two ways the
 * invariant fails.
 */
export function exitUrgency(
  alignment: number,
  conviction: number,
  bounds: { neutral: number; floor: number; ceiling: number },
): number {
  const a = Math.max(-1, Math.min(1, alignment));
  const c = Math.max(0, Math.min(1, conviction));
  const span = a >= 0 ? bounds.ceiling - bounds.neutral : bounds.neutral - bounds.floor;
  return Math.min(bounds.ceiling, Math.max(bounds.floor, bounds.neutral + a * c * span));
}
