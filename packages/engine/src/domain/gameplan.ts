/**
 * Game plans and the scouting "reads" that make preparation a real system.
 *
 * The core idea (docs/05-prep-and-camps.md): a camp does not hand out flat stat bonuses. It
 * produces a *plan* — an approach, a targeting split, and a short list of specific things
 * you expect the opponent to do and have drilled the answer to. When the opponent actually
 * does a prepped thing, you get a large, localised advantage.
 *
 * Getting the read wrong is worse than having no plan, because you shifted your intents for
 * something that never came. That asymmetry is what makes a coach worth paying for and what
 * lets a technically inferior fighter win.
 */

import type { StrikeTarget } from '../fight/types.js';
import { clamp01 } from '../core/math.js';

/** The overall shape of the fight you are trying to have. */
export const APPROACHES = [
  'pressure',
  'counter',
  'wrestle',
  'grind',
  'pointFight',
  'submit',
  'finish',
] as const;
export type Approach = (typeof APPROACHES)[number];

export interface ApproachMeta {
  key: Approach;
  label: string;
  blurb: string;
}

export const APPROACH_META: Readonly<Record<Approach, ApproachMeta>> = {
  pressure: {
    key: 'pressure',
    label: 'Pressure',
    blurb: 'Walk them down, take the centre, never let them breathe.',
  },
  counter: {
    key: 'counter',
    label: 'Counter',
    blurb: 'Give them the centre and punish everything they throw.',
  },
  wrestle: {
    key: 'wrestle',
    label: 'Wrestle',
    blurb: 'Get it to the mat early and often. Chain the attempts.',
  },
  grind: {
    key: 'grind',
    label: 'Grind',
    blurb: 'Fence, clinch, control. Win ugly and drain them.',
  },
  pointFight: {
    key: 'pointFight',
    label: 'Point Fight',
    blurb: 'Bank rounds, take no risks, get out with the decision.',
  },
  submit: {
    key: 'submit',
    label: 'Hunt the Submission',
    blurb: 'Get it to the floor and go looking. Position first, but never for its own sake.',
  },
  finish: {
    key: 'finish',
    label: 'Hunt the Finish',
    blurb: 'Swing for it. Accept the damage that comes with that.',
  },
};

/**
 * Things a fighter can be *read* as doing — and therefore prepared for.
 *
 * Each read names both a threat and its counter, so the same key drives the opponent's
 * tendency profile and the defender's prepared answer.
 */
export const READ_KEYS = [
  'leadHook',
  'counterRight',
  'calfKick',
  'headKick',
  'bodyWork',
  'highVolume',
  'singleLeg',
  'doubleLeg',
  'fenceClinch',
  'bodyLock',
  'guillotine',
  'backTake',
  'groundAndPound',
  'guardPassing',
  'wallGetUp',
] as const;

export type ReadKey = (typeof READ_KEYS)[number];

export interface ReadMeta {
  key: ReadKey;
  /** What the opponent does. */
  threat: string;
  /** What you drilled to answer it. */
  counter: string;
  /** Which resolution phase the bonus applies in. */
  phase: 'striking' | 'takedown' | 'clinch' | 'ground' | 'submission';
}

export const READ_META: Readonly<Record<ReadKey, ReadMeta>> = {
  leadHook: {
    key: 'leadHook',
    threat: 'Leads with the hook off the jab',
    counter: 'Roll under and answer over the top',
    phase: 'striking',
  },
  counterRight: {
    key: 'counterRight',
    threat: 'Sits on the counter right hand',
    counter: 'Feint first, never enter square',
    phase: 'striking',
  },
  calfKick: {
    key: 'calfKick',
    threat: 'Attacks the lead calf relentlessly',
    counter: 'Check it, switch stance, take the leg away',
    phase: 'striking',
  },
  headKick: {
    key: 'headKick',
    threat: 'Hides a head kick behind the jab',
    counter: 'Hands high on the exit, never circle into it',
    phase: 'striking',
  },
  bodyWork: {
    key: 'bodyWork',
    threat: 'Invests in the body early',
    counter: 'Elbow tight, break the rhythm before it compounds',
    phase: 'striking',
  },
  highVolume: {
    key: 'highVolume',
    threat: 'Drowns opponents in output',
    counter: 'Frame, reset, refuse to trade in the pocket',
    phase: 'striking',
  },
  singleLeg: {
    key: 'singleLeg',
    threat: 'Chains single legs off the fence',
    counter: 'Limp-leg and whizzer drilled to exhaustion',
    phase: 'takedown',
  },
  doubleLeg: {
    key: 'doubleLeg',
    threat: 'Explosive reactive double leg',
    counter: 'Sprawl early, hips heavy, never square up',
    phase: 'takedown',
  },
  fenceClinch: {
    key: 'fenceClinch',
    threat: 'Forces the clinch and works the fence',
    counter: 'Underhook and circle out before the back hits the cage',
    phase: 'clinch',
  },
  bodyLock: {
    key: 'bodyLock',
    threat: 'Body lock takedowns from the clinch',
    counter: 'Break the grip at the wrist, drop the level',
    phase: 'clinch',
  },
  guillotine: {
    key: 'guillotine',
    threat: 'Hunts the guillotine on every entry',
    counter: 'Shoot with the head outside, hand-fight on entry',
    phase: 'submission',
  },
  backTake: {
    key: 'backTake',
    threat: 'Takes the back in every scramble',
    counter: 'Never turn away, fight the hooks immediately',
    phase: 'ground',
  },
  groundAndPound: {
    key: 'groundAndPound',
    threat: 'Punishing ground-and-pound from top',
    counter: 'Stay active off the bottom, force the stand-up',
    phase: 'ground',
  },
  guardPassing: {
    key: 'guardPassing',
    threat: 'Passes guard quickly and settles',
    counter: 'Frames and hip escapes, recover guard on contact',
    phase: 'ground',
  },
  wallGetUp: {
    key: 'wallGetUp',
    threat: 'Wall-walks back to the feet immediately',
    counter: 'Kill the hip, take the back as they turn in',
    phase: 'ground',
  },
};

/** One prepared answer. `confidence` is how sure the camp is the read is correct. */
export interface PreppedRead {
  read: ReadKey;
  /** 0–1. How well-drilled the answer is. Set by camp time and coach quality. */
  drillQuality: number;
  /**
   * 0–1. The camp's *belief* in this read. Critically, this can be high and still wrong —
   * scouting accuracy determines whether the read matches reality, not this number.
   */
  confidence: number;
}

/** Maximum number of reads a camp can meaningfully drill. Preparation is a scarce resource. */
export const MAX_PREPPED_READS = 4;

export interface GamePlan {
  approach: Approach;
  /** Weights over strike targets. Normalised on construction. */
  targeting: Record<StrikeTarget, number>;
  /** 0 (risk-averse) to 1 (reckless). Trades damage output against damage taken. */
  riskLevel: number;
  /**
   * 0 (keep it standing at all costs) to 1 (put it on the floor and keep it there).
   *
   * The plan's second axis, and the one `approach` never had. See {@link phaseProfile}.
   *
   * Optional because a `GamePlan` outlives the process that made it — a booking saved before
   * this existed carries no value — and `phaseProfile` reads 0.5 for `undefined`, which is
   * exactly the behaviour that save already had.
   */
  groundIntent?: number;
  preppedReads: readonly PreppedRead[];
  /** 0–1 overall camp quality. Scales every prep bonus. */
  campQuality: number;
}

/** A neutral plan, used for fighters with no camp (short notice, AI filler bouts). */
export function defaultGamePlan(): GamePlan {
  return {
    approach: 'pressure',
    targeting: { head: 0.6, body: 0.25, legs: 0.15 },
    riskLevel: 0.5,
    groundIntent: NEUTRAL_GROUND_INTENT,
    preppedReads: [],
    campQuality: 0.5,
  };
}

export function normaliseTargeting(t: Record<StrikeTarget, number>): Record<StrikeTarget, number> {
  const total = t.head + t.body + t.legs;
  if (total <= 0) return { head: 0.6, body: 0.25, legs: 0.15 };
  return { head: t.head / total, body: t.body / total, legs: t.legs / total };
}

export function normaliseGamePlan(plan: GamePlan): GamePlan {
  return {
    ...plan,
    targeting: normaliseTargeting(plan.targeting),
    riskLevel: clamp01(plan.riskLevel),
    groundIntent: clamp01(plan.groundIntent ?? NEUTRAL_GROUND_INTENT),
    campQuality: clamp01(plan.campQuality),
    preppedReads: plan.preppedReads.slice(0, MAX_PREPPED_READS),
  };
}

/**
 * A fighter's *actual* tendencies: how likely they are to do each readable thing.
 *
 * Built from attributes and traits, so it is always consistent with the fighter rather than
 * being separately authored (and therefore separately wrong).
 */
export type TendencyProfile = Record<ReadKey, number>;

/**
 * How much a correct, fully-drilled read is worth in its phase.
 *
 * Deliberately large. Preparation beating a rating gap is the point of the system; the
 * counterweight is that reads are scarce (4), can be wrong, and decay with adherence.
 */
export const PREP_MAX_BONUS = 0.42;

/**
 * The value of a prepared read against an opponent who actually does that thing.
 *
 * Returns a 0–1 multiplier applied to `PREP_MAX_BONUS` at the point of resolution.
 */
export function prepValue(
  prepped: PreppedRead,
  opponentTendency: number,
  adherence: number,
  campQuality: number,
): number {
  // The bonus is only worth what the opponent actually gives you. Drilling a calf-kick
  // answer against someone who never kicks is wasted camp time, by design.
  return clamp01(opponentTendency) * prepped.drillQuality * clamp01(adherence) * clamp01(campQuality);
}

// --- Risk ---------------------------------------------------------------------------------

/**
 * What `riskLevel` actually does in a fight.
 *
 * The field existed on `GamePlan` from the start and was read exactly zero times by the
 * simulator, while both the camp screen and the AI hardcoded it to 0.5. A dial the player
 * cannot turn and the fight does not read is worse than no dial: it advertises a decision
 * that is not being made.
 *
 * The trade it encodes is the oldest one in the sport — *you cannot hit hard without being
 * hittable*. A fighter sitting down on their shots lands flusher and finishes more; they are
 * also stationary at the moment of the counter, and the counter is where fights turn.
 *
 * Four effects, because three was not a trade. The first version moved commitment, exposure
 * and exertion only — which gave the risk-averse setting no cost whatsoever, and it measured
 * exactly as you would expect: careful won 53% against reckless 38.7%. Playing safe was
 * simply correct, and the slider was a tax on anyone who moved it.
 *
 * `output` is the missing leg and the real one. A fighter hitting and moving throws less,
 * lands less and *loses rounds*, which matters enormously in an engine where ~70% of even
 * matchups reach the judges. Safety costs you on the scorecards; that is what makes it a
 * decision.
 *
 * Deliberately kept to four effects and modest coefficients. Risk multiplies with Power,
 * which is already superlinear, and flushness feeds knockdown hazard which feeds the hurt
 * state which feeds hazard again — so a large number here compounds into "reckless always
 * wins" or "reckless always dies" rather than a choice. At the extremes this is roughly a
 * ±15% swing on how hard you land and ±30% on how much you throw, against a ±20% swing on
 * how open you are and ±8% on what it costs you in the tank.
 *
 * That last coefficient is small for a measured reason. At ±20% the fatigue penalty was the
 * dominant term by a distance: a reckless fighter was ahead on knockouts and still lost
 * overall, because they were empty by the third and dropped both of the later rounds. In an
 * engine where most fights reach the judges, anything that quietly costs rounds outweighs
 * everything that ends fights. That makes recklessness a
 * genuine gamble rather than a strictly better or worse setting — which
 * tests/statistical/risk.test.ts asserts directly, by measuring both extremes against an
 * identical neutral opponent and requiring neither to pull decisively ahead.
 *
 * The neutral 0.5 leaves every multiplier at exactly 1.0, so an unset plan behaves exactly
 * as it did before this existed.
 */
export interface RiskProfile {
  /** Multiplier on how flush this fighter's strikes land. */
  commitment: number;
  /** Multiplier on the opponent's counter opportunity against them. */
  exposure: number;
  /** Multiplier on the fatigue cost of throwing. Swinging hard is expensive. */
  exertion: number;
  /** Multiplier on how much this fighter throws. Staying safe means staying busy-less. */
  output: number;
}

export function riskProfile(riskLevel: number): RiskProfile {
  // −1 at fully risk-averse, 0 at neutral, +1 at reckless.
  const r = clamp01(riskLevel) * 2 - 1;
  return {
    commitment: 1 + r * 0.15,
    exposure: 1 + r * 0.20,
    exertion: 1 + r * 0.08,
    output: 1 + r * 0.30,
  };
}

// --- Where the fight happens --------------------------------------------------------------

/**
 * The neutral setting: every multiplier in {@link phaseProfile} is exactly 1.0.
 *
 * A plan with no `groundIntent` — an old save, an AI filler bout, `defaultGamePlan` — behaves
 * exactly as it did before this axis existed.
 */
export const NEUTRAL_GROUND_INTENT = 0.5;

/**
 * What `groundIntent` does in a fight, and why `approach` could not do it.
 *
 * `approach` is a table of **offensive intents**: it says what a fighter reaches for when they
 * have the initiative. Every row of it — `pressure`, `counter`, `finish` — answers "what do I
 * throw", and not one of them answers "where is this fight happening". So a striker who picks
 * `counter` is not saying *keep it standing*; they are saying *when I am standing, counter*.
 *
 * Measured, that is the whole of the player's complaint. An 84-striking, 38-wrestling striker
 * across from a wrestler spent **138 of 900 seconds at distance and 368 being controlled**, and
 * the seven approaches moved that number between 133 and 143. The one decision the player most
 * wants to make about a fight — *which fight is this going to be* — was the one the plan did not
 * carry, on either side of it: nothing in `approach` reads on the takedown they are defending,
 * on the tie-up they are trying to leave, or on the floor they are trying to get up off.
 *
 * Six effects, and **four of them are one-sided**. That asymmetry is the whole design, and it was
 * arrived at by watching symmetric versions fail.
 *
 * **The lever.** `entry` is how hard they look for the takedown and the tie-up themselves, and it
 * is the only term that moves both ways — wanting the floor and refusing it are genuinely
 * opposite intents. `sprawl` is what their takedown defence is worth when somebody shoots on
 * them, and `escape` is how urgently they leave the fence and the floor. Both are bought only by
 * the fighter *refusing* the floor:
 *
 *  - A wrestler who commits to taking you down is still a wrestler when you shoot back. Making
 *    `sprawl` symmetric took 18% off every world grappler's takedown defence and flattened the
 *    striker/grappler control-time gap `styles.test.ts` G1 protects.
 *  - And **nobody wants to be underneath.** Wanting the fight on the floor is not the same as
 *    wanting to be on the bottom of it; a symmetric `escape` had wrestlers content to lie there,
 *    which is not a style, it is a bug with a rationale.
 *
 * `escape` is intent rather than ability, which is why `simulate.ts` gives the whole of it to the
 * intent weights and a damped power of it to the contests. A fighter who insists on staying up
 * gets up more often *because he is trying to*, on exactly the same scrambling rating.
 *
 * **The price.** `output` is charged only to the fighter chasing the floor: he throws less
 * because he is shooting. `exposure` and `exertion` are charged to both, because deciding the
 * shape of a fight in advance means not reading the man in front of you, and holding a decision
 * against what the fight wants to be is work.
 *
 * **There is deliberately no flat tax on the refusing half, and four attempts to add one is how
 * that was learned.** Charging `output`, `commitment` or `exertion` against it each cancelled
 * exactly what the plan was buying — less volume and softer shots undo the striking fight, and
 * faster fatigue degrades, through `fatiguedEffect`, the very takedown defence the plan was
 * bought for. A penalty that compounds against its own lever is not a price. What makes this a
 * decision is structural: picking the wrong end means choosing to fight in the phase where the
 * other man is better, and `ground-intent.test.ts` measures that at 15 to 21 points of win rate
 * for a striker who asks for the floor and 13 for a wrestler who refuses it. Against that, the
 * cost of guessing your opponent wrong is small on purpose — half a point — because the *shape*
 * of the fight still changes enormously either way, and that is what the dial is for.
 *
 * Deliberately modest coefficients, for the same reason `riskProfile`'s are. `sprawl` divides
 * into a contest that already runs through the convex effect curve, and `escape` compounds with
 * itself every time a fighter stands back up, so a large number here does not produce a stronger
 * decision — it produces a dominant one.
 */
export interface PhaseProfile {
  /** Multiplier on how hard this fighter looks for the takedown and the tie-up. */
  entry: number;
  /** Multiplier on their takedown defence when somebody shoots on them. */
  sprawl: number;
  /** Multiplier on how urgently they leave the fence and the floor. */
  escape: number;
  /** Multiplier on how much they throw. Chasing the takedown costs volume. */
  output: number;
  /** Multiplier on the opponent's counter opportunity against them. */
  exposure: number;
  /** Multiplier on the fatigue cost of working. Deciding the shape in advance is work. */
  exertion: number;
}

export function phaseProfile(groundIntent: number | undefined): PhaseProfile {
  // −1 at "keep it standing", 0 at neutral, +1 at "put it on the floor".
  const r = clamp01(groundIntent ?? NEUTRAL_GROUND_INTENT) * 2 - 1;
  const committed = Math.abs(r);
  const refusing = Math.max(0, -r);
  const chasing = Math.max(0, r);
  return {
    entry: 1 + r * 0.4,
    sprawl: 1 + refusing * 0.5,
    escape: 1 + refusing * 0.7,
    output: 1 - chasing * 0.16,
    exposure: 1 + committed * 0.3,
    exertion: 1 + committed * 0.1,
  };
}
