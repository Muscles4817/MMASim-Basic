/**
 * Personality axes — the hidden, continuous layer beneath discrete traits.
 *
 * See docs/04-personality.md. Every axis here drives at least one mechanic; nothing in this
 * file exists purely as flavour.
 */

import { clamp, remap } from '../core/math.js';

export const PERSONALITY_AXES = [
  'discipline',
  'ego',
  'aggression',
  'resilience',
  'professionalism',
  'ambition',
  'loyalty',
  'charisma',
] as const;

export type PersonalityAxis = (typeof PERSONALITY_AXES)[number];

/** 1–100 per axis. Never shown to the player as a number. */
export type Personality = Record<PersonalityAxis, number>;

export interface PersonalityAxisMeta {
  key: PersonalityAxis;
  label: string;
  /** What the extreme low end looks like, in plain language. */
  low: string;
  /** What the extreme high end looks like. */
  high: string;
  /** Which systems read this axis — kept honest by a test. */
  drives: readonly string[];
}

export const PERSONALITY_META: Readonly<Record<PersonalityAxis, PersonalityAxisMeta>> = {
  discipline: {
    key: 'discipline',
    label: 'Discipline',
    low: 'Shows up out of shape',
    high: 'Lives like a professional',
    drives: ['camp', 'weightCut', 'decay', 'injury'],
  },
  ego: {
    key: 'ego',
    label: 'Ego',
    low: 'Genuinely coachable',
    high: 'Knows better than the coach',
    drives: ['gamePlan', 'relationships', 'gymSwitching'],
  },
  aggression: {
    key: 'aggression',
    label: 'Aggression',
    low: 'Patient, point-conscious',
    high: 'Comes to hurt people',
    drives: ['fightPace', 'risk', 'rivalry'],
  },
  resilience: {
    key: 'resilience',
    label: 'Resilience',
    low: 'One bad loss derails a career',
    high: 'Bounces back and rebuilds',
    drives: ['confidence', 'retirement', 'adversity'],
  },
  professionalism: {
    key: 'professionalism',
    label: 'Professionalism',
    low: 'Missed weight, missed tests',
    high: 'Never a problem, never late',
    drives: ['weightCut', 'pullOuts', 'contracts', 'discipline'],
  },
  ambition: {
    key: 'ambition',
    label: 'Ambition',
    low: 'Content banking cheques',
    high: 'Wants the belt at any weight',
    drives: ['fightAcceptance', 'weightMoves', 'titlePush'],
  },
  loyalty: {
    key: 'loyalty',
    label: 'Loyalty',
    low: 'Gone for the next offer',
    high: 'Dies with the gym that made them',
    drives: ['gymSwitching', 'reSigning', 'freeAgency'],
  },
  charisma: {
    key: 'charisma',
    label: 'Charisma',
    low: 'Cannot sell a fight',
    high: 'Sells a fight nobody asked for',
    drives: ['starPower', 'gate', 'promos'],
  },
};

export function uniformPersonality(value = 50): Personality {
  const out = {} as Personality;
  for (const axis of PERSONALITY_AXES) out[axis] = value;
  return out;
}

export function normalisePersonality(p: Personality): Personality {
  const out = {} as Personality;
  for (const axis of PERSONALITY_AXES) out[axis] = clamp(Math.round(p[axis]), 1, 100);
  return out;
}

// --- Axis-derived modifiers -------------------------------------------------------------
// Each of these is the single place a given axis turns into a number the sim uses. Keeping
// them here (rather than inline at call sites) means re-balancing a personality axis is one
// diff, and makes the "every axis drives something" test possible.

/**
 * Map an axis value onto a modifier, pivoting **exactly at 50**.
 *
 * A plain `remap(v, 1, 100, low, high)` puts its midpoint at 50.5 and, unless `low` and
 * `high` happen to straddle the neutral value symmetrically, silently shifts the whole
 * population away from neutral. Piecewise-linear around an explicit pivot means an average
 * fighter is genuinely average, and `low`/`high` can be asymmetric on purpose.
 */
export function axisCurve(value: number, atLow: number, atNeutral: number, atHigh: number): number {
  const v = clamp(value, 1, 100);
  return v <= 50
    ? remap(v, 1, 50, atLow, atNeutral)
    : remap(v, 50, 100, atNeutral, atHigh);
}

/** Multiplier on attribute gains during a training camp. Discipline is the big lever. */
export function campGainMultiplier(p: Personality): number {
  const disciplineTerm = axisCurve(p.discipline, 0.55, 1, 1.4);
  // Professionalism matters less than discipline here, but a chaotic camp still costs you.
  const professionalismTerm = axisCurve(p.professionalism, 0.85, 1, 1.1);
  return disciplineTerm * professionalismTerm;
}

/** How much of the coach's game plan the fighter actually executes, 0–1. */
export function gamePlanAdherence(p: Personality): number {
  // High ego fighters freelance. Discipline partially compensates: a disciplined egomaniac
  // still drills the thing, they just abandon it the moment it stops working.
  const egoPenalty = axisCurve(p.ego, 0, 0.2, 0.45);
  const disciplineRecovery = axisCurve(p.discipline, 0, 0.1, 0.2);
  return clamp(1 - egoPenalty + disciplineRecovery, 0.25, 1);
}

/** Rate of attribute decay while not in camp, as a multiplier on the baseline. */
export function idleDecayMultiplier(p: Personality): number {
  return axisCurve(p.discipline, 1.6, 1, 0.45);
}

/** Probability multiplier on missing weight. */
export function weightMissRiskMultiplier(p: Personality): number {
  return axisCurve(p.discipline, 2.2, 1, 0.35) * axisCurve(p.professionalism, 1.6, 1, 0.5);
}

/** Baseline pace/aggression dial fed into the fight simulator, 0–1. */
export function basePaceDial(p: Personality): number {
  return axisCurve(p.aggression, 0.3, 0.65, 1.0);
}

/** How much confidence is lost per defeat, as a multiplier on the baseline hit. */
export function lossImpactMultiplier(p: Personality): number {
  return axisCurve(p.resilience, 1.7, 1, 0.4);
}

/**
 * How much of a defeat the ego deflects.
 *
 * Resilience is the capacity to sit with a loss; ego is the refusal to accept it was one. They
 * are different mechanisms with the same sign, which is why both belong here: the fighter who
 * bounces back has processed it, and the fighter who blames the judges never started. High ego
 * is not free — `gamePlanAdherence` already charges it in the cage — so this is the other half
 * of a trade rather than a bonus.
 */
export function egoDeflectionMultiplier(p: Personality): number {
  return axisCurve(p.ego, 1.15, 1, 0.72);
}

/**
 * Multiplier on confidence *gained* from a win.
 *
 * Ego again, pointing the other way: the same fighter who shrugs off a defeat reads a win as
 * confirmation of what they already knew. Deliberately a much smaller spread than the loss
 * side, because belief is easier to damage than to build and the asymmetry is the point.
 */
export function confidenceGainMultiplier(p: Personality): number {
  return axisCurve(p.ego, 0.88, 1, 1.15);
}

/**
 * The self-belief this fighter returns to when nothing is happening to them.
 *
 * Confidence had no baseline at all: it was initialised to 60, moved only when a fight ended,
 * and stayed wherever the last result left it forever. That made it an injury rather than a
 * mood — see docs/27 §1.1.1 — and it is what killed careers at twenty-four, because three
 * losses put a fighter at 12 and nothing in the game could ever bring them back up.
 *
 * Centred on 60 so a neutral personality returns exactly to `initialCondition`. The spread is
 * modest on purpose: this is where a fighter *rests*, not how good they think they are, and a
 * range wide enough to be interesting at the extremes is wide enough to be noise in the middle.
 */
export function confidenceBaseline(p: Personality): number {
  return clamp(
    60 +
      axisCurve(p.resilience, -9, 0, 6) +
      axisCurve(p.ambition, -6, 0, 5) +
      axisCurve(p.ego, -4, 0, 5),
    38,
    76,
  );
}

/**
 * Time constant for the drift back to {@link confidenceBaseline}, in years.
 *
 * Fed to an exponential rather than a per-tick step so that the result does not depend on how
 * often the caller happens to age somebody — a camp is a fifth of a year and the world tick is
 * a fortnight, and both must produce the same fighter after the same elapsed time.
 *
 * Resilience dominates, which is the axis's whole documented purpose ("one bad loss derails a
 * career" against "bounces back and rebuilds"). Ambition is the smaller term and belongs on the
 * recovery rather than on the hit: wanting it back is what brings you back.
 */
export function confidenceRecoveryYears(p: Personality): number {
  return axisCurve(p.resilience, 3.4, 1.7, 0.8) * axisCurve(p.ambition, 1.3, 1, 0.85);
}

/** Multiplier on star-power growth from a given performance. */
export function starPowerGrowthMultiplier(p: Personality): number {
  // Charisma dominates, but aggression sells too — a violent fighter draws without a mic.
  return axisCurve(p.charisma, 0.45, 1, 1.9) * axisCurve(p.aggression, 0.9, 1, 1.15);
}

/** Probability a fighter accepts a fight that is a clear step up in difficulty, 0–1. */
export function stepUpAcceptance(p: Personality): number {
  return clamp(axisCurve(p.ambition, 0.15, 0.5, 0.95) * axisCurve(p.ego, 0.85, 1, 1.15), 0.05, 0.98);
}

/** Discount (0–1) a fighter accepts to re-sign with a promotion they are loyal to. */
export function reSignDiscount(p: Personality): number {
  return axisCurve(p.loyalty, -0.15, 0.05, 0.3);
}

/** Per-fight probability of a professionalism incident (missed test, no-show, arrest). */
export function incidentRisk(p: Personality): number {
  const base = axisCurve(p.professionalism, 0.14, 0.02, 0.002);
  return clamp(base * axisCurve(p.discipline, 1.5, 1, 0.7), 0, 0.25);
}

/** How readily this fighter ignites a rivalry when provoked, 0–1. */
export function rivalryIgnition(p: Personality): number {
  return clamp(
    axisCurve(p.aggression, 0.1, 0.4, 0.8) * 0.6 + axisCurve(p.ego, 0.1, 0.45, 0.9) * 0.4,
    0,
    1,
  );
}
