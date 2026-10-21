/**
 * **Functional ability: how good you are in the fight your opponent would choose — weighted by
 * whether they get to choose it.**
 *
 * `overallRating` is a flat weighted mean of fifteen attributes, and its own doc comment admits
 * the defect: "a single number cannot express that Khabib beats a striker of equal overall nine
 * times in ten". The comment is true and the function is still used to sort rankings, pick
 * champions, set star power, price contracts and tell a player how good their fighter is. A mean
 * cannot say any of the things that decide fights:
 *
 *  - Measured on the shipped roster, the five best men read 84.6, 81.3, 80.4, **79.3** and 78.4.
 *    The 79.3 is Nurmagomedov, with a 44 in the block — ranked *below* two men he would beat
 *    comfortably, because the mean charges him for a hole nobody is allowed to reach.
 *  - Nobody in the game reads above 85, so **the top fifteen points of a 1–99 scale are dead**. A
 *    rating that cannot produce a 93 is not a rating with a ceiling; it is a rating with a bug.
 *  - A hole and a strength cancel. Two fighters with the same mean, one of them unexploitable and
 *    one of them a single takedown away from losing, are the same number.
 *
 * ## The shape
 *
 * ```
 *   functional = base · (1 − wCardio − wDurability)
 *              + cardio      · wCardio
 *              + durability  · wDurability
 *
 *   base = control · imposed  +  (1 − control) · exposed
 * ```
 *
 * `imposed` is the fight you get when you are driving. `exposed` is the fight you get when they
 * are — your weakest context, weighted by whether they can actually reach it. `control` is who
 * drives. Four behaviours fall out of that one line, and they are the four the mean cannot give:
 *
 *  - **An all-rounder reads near their level.** `imposed ≈ exposed`, so `control` barely matters:
 *    there is nothing to target. This is the Jones/GSP shape, and the point the mean gets closest
 *    to getting right by accident.
 *  - **A specialist who imposes reads near their best.** Khabib's `control` is high because his
 *    one destination is one he can reach against almost anyone, so the 44 is charged at a few
 *    percent of its weight instead of a fifteenth.
 *  - **A specialist who cannot impose reads near their worst**, which is the whole of what being
 *    exploitable means and is nowhere in a mean.
 *  - **The nineties become reachable** — by being both unexploitable *and* able to drive, which is
 *    rare rather than impossible. A uniformly 99 fighter reads 99 (asserted), so the ceiling is
 *    the scale's and not the formula's.
 *
 * ## Imposition is a chain, and it is directional
 *
 * Two things this module refuses to do, both of which a weighted mean of `chainWrestling` and
 * `clinchOffence` would have done.
 *
 * **Imposition is a chain, not a mix,** because the simulator imposes in gates and each gate
 * admits the next. `ENTRY_EASE` in `fight/range.ts` is `outside 0.5 / boxing 1 / pocket 1.55`: a
 * takedown from two metres out costs three times what it costs from the chest. So chain wrestling
 * does not buy a takedown — it buys a takedown *once the range is won*. Multiplying through the
 * gates is what separates the pressure wrestler who can close from the one who cannot, and
 * averaging them is what made those two men the same number.
 *
 * **Imposition is directional,** because refusing to let the fight happen anywhere but your range
 * *is* imposition. A single Imposition scalar built out of wrestling and clinch scores Machida
 * zero, and Machida dictated fights for a decade. So imposition is computed toward each
 * destination — outside, boxing, pocket, clinch, ground top, ground bottom — which are the
 * engine's own states rather than a taxonomy invented here.
 *
 * ## Cardio and durability are not contexts. They are the bill the route runs up
 *
 * The first cut of this put cardio in a context and durability in another, and neither is a place
 * you fight. What they are is *conditional*, and the condition is the fighter's own game:
 *
 * > A pressure fighter with garbage cardio and no knockout power is going to suck. If he has
 * > outstanding knockout power he can compensate for his poor cardio, but great power and no
 * > pressure means his cardio comes back into effect.
 *
 * All three cases come out of one pair of weights. The cardio bill is the exertion of the places
 * the fight actually happens, discounted by the chance of ending it early — and that discount is
 * gated on `control`, not on power alone, which is precisely the third sentence: power only buys
 * you out of the cardio bill if you can make the exchange happen. The durability bill is the
 * hazard of those same places, charged harder the less of the fight you chose. Machida pays almost
 * nothing for a mediocre chin; Gaethje pays nearly double.
 *
 * `RANGE_EXERTION`, `RANGE_HAZARD` and `accrueFatigue` already charge pressure for its fuel and
 * the pocket for its risk, so the weights here are a reading of a bill the simulator issues rather
 * than a new claim about fighting.
 *
 * ## Style is derived, never declared
 *
 * `want` comes from attributes, the way `strikeLean` and `deriveTendencies` already do — and for
 * the reason `profile.ts` gives for those: a scouting report built from a separate authored source
 * "is never separately authored and therefore never separately wrong". `TacticalPlan` is the
 * *corner's* instruction, which is a choice. If this read the game plan, a fighter's rating would
 * change when his coach changed his mind, and a rating that moves without the fighter moving is
 * not a property of the fighter.
 *
 * ## What is deliberately absent
 *
 * **Reach.** `reachLeverage` is capped at ±12% in the simulator specifically so that long arms
 * cannot carry a fighter, and this function takes an `Attributes` block so that it is a drop-in
 * for `overallRating` at all forty-odd call sites. Paying a few tenths of a point to keep the
 * signature is the right trade; a `Fighter`-level variant can add the geometry later.
 *
 * **Traits and personality.** Same reason, and a weaker case for inclusion: a trait is a modifier
 * on behaviour, and the behaviour is already read through the attributes that drive it.
 *
 * **Forward pressure, as distinct from footwork.** The range gate is `distanceControl`, which is
 * footwork — and `range.ts` is emphatic that "range is also **not** pressure". In the engine
 * pressure is an entry style, a plan choice, and reading the plan is exactly what this module must
 * not do. So walking a man down reaches the rating only through the attributes that fund it, never
 * as itself. The clean fix is the one `range.ts` is already waiting for — a Footwork attribute,
 * and beside it something meaning forward pressure. Until one exists there is no honest attribute
 * to read, and a proxy would be worse than the gap.
 */

import { clamp01, contest, remap, weightedMean } from '../core/math.js';
import { ATTRIBUTE_KEYS, toRating, type Attributes } from './attributes.js';
import { DERIVED_KEYS, deriveRatings, type DerivedKey, type DerivedRatings } from './derived.js';
import {
  COMPETITIVE_REFERENCE,
  competitiveAttributes,
  type CompetitiveContext,
} from './competitive.js';

// --- The places a fight can happen -----------------------------------------------------------

/**
 * The six states a fight can be in, which are the engine's own and not a taxonomy invented here.
 *
 * `Range` is `outside | boxing | pocket`, `Position` is `distance | clinch | ground`, and ground
 * is sided. Crossed, that is exactly this list, and it is also `PreferredState` minus the two
 * entries that name an intent rather than a place (`submission`, `adaptive`).
 */
export const FIGHT_CONTEXTS = [
  'outside',
  'boxing',
  'pocket',
  'clinch',
  'groundTop',
  'groundBottom',
] as const;

export type FightContext = (typeof FIGHT_CONTEXTS)[number];

/**
 * Where *you* are when your opponent gets the context he wanted.
 *
 * Standing states are shared — if he imposes the pocket, you are in the pocket with him — and the
 * ground is not: his top is your bottom. Getting this wrong was the first bug in the targeting
 * term, and it made elite guard players read as un-exploitable grapplers.
 */
export const OPPOSITE_CONTEXT: Readonly<Record<FightContext, FightContext>> = {
  outside: 'outside',
  boxing: 'boxing',
  pocket: 'pocket',
  clinch: 'clinch',
  groundTop: 'groundBottom',
  groundBottom: 'groundTop',
};

type ScoreKey = keyof Attributes | DerivedKey;

interface ContextSpec {
  label: string;
  /** How good you are here. Weights over attributes and derived ratings; must sum to 1. */
  score: readonly (readonly [ScoreKey, number])[];
  /** How much you want to be here. Unweighted mean of these, before the softmax. */
  want: readonly ScoreKey[];
  /**
   * The share of imposition available *without* winning the distance contest.
   *
   * `boxing` is high because it is where two men who impose nothing on each other end up, and
   * `outside`/`pocket` are near zero because they are the two ends of the distance axis and
   * reaching either one *is* winning that contest.
   */
  rangeFloor: number;
  /**
   * Gates after the range gate, each a contest of mine against theirs.
   *
   * These multiply, because the simulator's do: the range admits the entry, the entry admits the
   * hold. An average over them would say a wrestler who cannot close is half a wrestler.
   */
  chain: readonly (readonly [ScoreKey, ScoreKey])[];
  /** How hard this place is to work in, as a multiplier on the cardio bill. */
  exertion: number;
  /** How much damage this place invites, as a multiplier on the durability bill. */
  hazard: number;
}

/**
 * What each place is contested with, wanted for, reached by, and costs.
 *
 * **Cardio and durability appear in no `score` row.** They are charged once, in the route bill, and
 * putting them in a context as well would double-count the two attributes whose whole character is
 * that their value is conditional. `durability` does appear in `pocket`'s `want`, which is not an
 * inconsistency: a willingness to stand in the fire is a real reason to seek the fire, and is a
 * different claim from being good there.
 *
 * Cardio still reaches the base through `chainWrestling` (0.3 of it) and through `distanceControl`
 * (0.2), which is right and is the mechanism rather than a leak: a tank is how pressure and
 * chaining are paid for, and a man who cannot pay cannot impose.
 */
const CONTEXTS: Readonly<Record<FightContext, ContextSpec>> = {
  outside: {
    label: 'Long range',
    score: [
      ['kicking', 0.3],
      ['strikingDefence', 0.25],
      ['speed', 0.2],
      ['fightIq', 0.15],
      ['strikingOffence', 0.1],
    ],
    want: ['kicking', 'strikingDefence', 'speed'],
    rangeFloor: 0,
    chain: [],
    exertion: 0.6,
    hazard: 0.55,
  },
  boxing: {
    label: 'Boxing range',
    score: [
      ['strikingOffence', 0.35],
      ['strikingDefence', 0.25],
      ['speed', 0.2],
      ['power', 0.1],
      ['fightIq', 0.1],
    ],
    want: ['strikingOffence', 'strikingDefence'],
    // The one place nobody can be denied, because it is where two men who deny each other
    // everything else are standing. `BASE_CONVICTION` makes the same observation from the other
    // side: `boxing` is "the most forgiving preference in the list".
    rangeFloor: 0.6,
    chain: [],
    exertion: 0.9,
    hazard: 0.95,
  },
  pocket: {
    label: 'The pocket',
    score: [
      ['strikingOffence', 0.32],
      ['power', 0.28],
      ['strikingDefence', 0.18],
      ['fightIq', 0.12],
      ['composure', 0.1],
    ],
    want: ['strikingOffence', 'power', 'durability'],
    rangeFloor: 0.1,
    chain: [],
    exertion: 1.25,
    hazard: 1.45,
  },
  clinch: {
    label: 'The clinch',
    score: [
      ['clinchOffence', 0.5],
      ['clinchDefence', 0.28],
      ['strength', 0.22],
    ],
    want: ['clinchOffence', 'strength'],
    // A tie-up is available from boxing range as well as from the pocket, so the distance contest
    // matters less here than it does for a takedown and more than it does for a jab.
    rangeFloor: 0.45,
    chain: [['clinchOffence', 'clinchDefence']],
    exertion: 1.35,
    hazard: 0.9,
  },
  groundTop: {
    label: 'On top',
    score: [
      ['groundControl', 0.4],
      ['groundAndPound', 0.28],
      ['submissions', 0.2],
      ['strength', 0.12],
    ],
    want: ['wrestling', 'groundControl'],
    // Half of a takedown is available without winning the distance battle, because `boxing` is
    // where the distance battle ends when nobody wins it and a shot is live from there.
    rangeFloor: 0.5,
    // Close the distance, win the entry, keep what you took. Three gates, and the reason a man
    // with 92 wrestling and no way to get into range does not read as a wrestler.
    chain: [
      ['chainWrestling', 'takedownDefence'],
      ['groundControl', 'scrambling'],
    ],
    exertion: 1.2,
    hazard: 0.5,
  },
  groundBottom: {
    label: 'On the bottom',
    score: [
      ['scrambling', 0.38],
      ['submissions', 0.32],
      ['submissionDefence', 0.3],
    ],
    want: ['submissions', 'scrambling'],
    // Mostly a place you are *put*, which is why the floor is the highest on the board: a guard
    // player's own route there — inviting it, pulling guard — is real and is not his main one.
    rangeFloor: 0.5,
    chain: [['submissions', 'groundControl']],
    exertion: 1.3,
    hazard: 1.25,
  },
};

/** What each place is called, for a screen that wants to show the breakdown. */
export const CONTEXT_LABELS: Readonly<Record<FightContext, string>> = Object.freeze(
  Object.fromEntries(FIGHT_CONTEXTS.map((c) => [c, CONTEXTS[c].label])) as Record<
    FightContext,
    string
  >,
);

// --- Reading an attribute block --------------------------------------------------------------

type Block = Attributes & DerivedRatings;

function blockOf(attrs: Attributes): Block {
  return { ...attrs, ...deriveRatings(attrs) };
}

function read(block: Block, key: ScoreKey): number {
  return block[key];
}

/**
 * A fighter's ability to manage distance, on the rating scale.
 *
 * **The same mix `rangeControl` uses in the simulator, and the same seam.** `fight/range.ts` is
 * explicit that this function is where a future Footwork attribute lands "and nowhere else", so
 * there must be exactly one of it — `rangeControl` delegates here. Quickness to move, anticipation
 * to know when, and the tank to keep doing it for fifteen minutes.
 *
 * Reach is deliberately not a term, for the reason `rangeControl` gives: long arms are threat
 * geometry, not footwork, and somebody can have an eighty-inch reach and terrible feet.
 */
export function distanceControl(attrs: Attributes): number {
  return (
    remap(attrs.speed, 25, 95, 25, 95) * 0.5 +
    remap(attrs.fightIq, 25, 95, 25, 95) * 0.3 +
    remap(attrs.cardio, 25, 95, 25, 95) * 0.2
  );
}

/** How good this fighter is in each place, 1–100, on the same scale as an attribute. */
export function contextScores(attrs: Attributes): Record<FightContext, number> {
  const block = blockOf(attrs);
  const out = {} as Record<FightContext, number>;
  for (const c of FIGHT_CONTEXTS) {
    out[c] = weightedMean(CONTEXTS[c].score.map(([k, w]) => [read(block, k), w] as const));
  }
  return out;
}

/**
 * How sharply a fighter's preferences concentrate, in rating points.
 *
 * A fighter whose best place is ten points clear of the next one wants it about 2.3× as much. Much
 * tighter than this and every fighter reads as a pure specialist; much looser and Khabib wants to
 * kickbox as much as he wants to wrestle.
 */
const WANT_TAU = 10;

/**
 * What fight this fighter is looking for: a distribution over the six places.
 *
 * Derived from attributes, for the reason in the module header. The softmax is over the *gap* from
 * the best place rather than over absolute levels, so this is a claim about shape — a 50-rated
 * journeyman and a 90-rated version of the same fighter want the same fight.
 */
export function fightStyleOf(attrs: Attributes): Record<FightContext, number> {
  const block = blockOf(attrs);
  const raw = {} as Record<FightContext, number>;
  let best = -Infinity;
  for (const c of FIGHT_CONTEXTS) {
    const keys = CONTEXTS[c].want;
    raw[c] = keys.reduce((acc, k) => acc + read(block, k), 0) / keys.length;
    if (raw[c] > best) best = raw[c];
  }
  const out = {} as Record<FightContext, number>;
  let total = 0;
  for (const c of FIGHT_CONTEXTS) {
    out[c] = Math.exp((raw[c] - best) / WANT_TAU);
    total += out[c];
  }
  for (const c of FIGHT_CONTEXTS) out[c] /= total;
  return out;
}

// --- Imposition ------------------------------------------------------------------------------

/**
 * How much of the fight this fighter can make happen in each place, against this opponent.
 *
 * The range gate first, then the chain, multiplied. `contest` is the engine's standard conversion
 * of a rating margin into a probability — a twelve-point edge is 73% — so an imposition number
 * here is commensurable with the ones the simulator computes beat by beat.
 */
/**
 * How decisive the distance contest is, in rating points of `distanceControl`.
 *
 * Wider than the engine's default 12, because this one gate sits in front of every other and
 * `distanceControl` is a *broad* mix — speed, fight IQ and cardio, three attributes an athletic
 * fighter owns together. At 12 an elite mover beat an ordinary one 90–10 on footwork alone, which
 * cut the whole takedown chain to 0.17 before the wrestling contest even ran and made 42 takedown
 * defence cost nothing. Real wrestlers close on better movers; they just pay for it.
 */
const RANGE_GATE_SCALE = 18;

export function impositionProfile(
  attrs: Attributes,
  against: Attributes,
): Record<FightContext, number> {
  const mine = blockOf(attrs);
  const theirs = blockOf(against);
  const range = contest(distanceControl(attrs) - distanceControl(against), RANGE_GATE_SCALE);
  const out = {} as Record<FightContext, number>;
  for (const c of FIGHT_CONTEXTS) {
    const spec = CONTEXTS[c];
    let value = spec.rangeFloor + (1 - spec.rangeFloor) * range;
    for (const [mineKey, theirKey] of spec.chain) {
      value *= contest(read(mine, mineKey) - read(theirs, theirKey));
    }
    out[c] = clamp01(value);
  }
  return out;
}

/**
 * How much of a fighter's weakest places the opponent can actually reach, in rating points.
 *
 * Ten points means a context five points worse than another is picked about 1.6× as often. This is
 * the knob that decides how brutally a hole is punished, and it is the one most worth being
 * nervous about: at 4 the rating is almost a minimum over contexts, and at 30 it is almost a mean.
 */
const TARGET_TAU = 10;

// --- The rating ------------------------------------------------------------------------------

/** Everything behind a functional rating, for a screen that has to explain the number. */
export interface FunctionalBreakdown {
  rating: number;
  /** How good you are in each place. */
  scores: Record<FightContext, number>;
  /** What fight you are looking for. */
  want: Record<FightContext, number>;
  /** What fight you can get. */
  imposition: Record<FightContext, number>;
  /** What fight *they* can get, which is what decides whether your hole is reachable. */
  opponentImposition: Record<FightContext, number>;
  /** Where the fight actually spends its time. */
  share: Record<FightContext, number>;
  /** 0 = they pick the fight, 1 = you do. */
  control: number;
  /** Your reading in the fight you would choose. */
  imposed: number;
  /** Your reading in the fight they would choose. */
  exposed: number;
  /** The contextual reading, before the route bill. */
  base: number;
  /** How much your cardio is worth to you, given the fight your game requires. */
  cardioWeight: number;
  /** How much your chin is worth to you, given the fight your game invites. */
  durabilityWeight: number;
}

/**
 * The largest share of the rating cardio and durability can claim.
 *
 * Much smaller than the 1/15th a flat mean gives them at the *bottom* of their range and much
 * larger at the top, which is the entire content of calling them conditional. The asymmetry
 * between the two is not taste: a tank is load-bearing for every second of a fight, a chin for the
 * three that matter.
 *
 * ## These two numbers are a compromise, and the measurement that forced it is worth writing down
 *
 * Swept against ~59,000 simulated fights (the two populations `functional-rating.test.ts` builds),
 * rank correlation with win rate climbs monotonically as the cardio weight rises, and keeps
 * climbing to a **mean weight near 0.60** — at which point two thirds of a pressure fighter's
 * rating would be his gas tank.
 *
 * It climbs because **the engine's attribute economy is lopsided, not because cardio is two thirds
 * of a fighter.** Measured orthogonally — one attribute moved ±24 against an even spread of the
 * other fourteen, so nothing is confounded with anything — the marginal value of 48 rating points
 * is, in win-rate points and stable across three levels:
 *
 * ```
 *   cardio          +62 … +68      strikingDefence    0 … +4
 *   power           +19 … +33      wrestling         −6 … +4
 *   speed           +20 … +32      durability        −4 … +4
 *   fightIq          +7 … +13      strength          −7 … −2
 *   takedownDefence  −3 … +6       composure        −13 … −7
 *   submissions      −1 … +7       kicking          −14 … −4
 *   groundControl    −3 … +4       strikingOffence  −13 … −5
 * ```
 *
 * A fighter at +24 cardio wins **82–88%** of his bouts; the same fighter at −24 wins **14–26%**.
 * Meanwhile `strikingOffence`, `kicking` and `composure` have *negative* marginal value: at a
 * fixed budget the engine pays you to take points out of them. That is a defect in the simulator's
 * balance, recorded in doc 31 § 27.6, and **a rating must not enshrine it**. Fitted to the last
 * decimal this module would output "cardio, plus a little power and speed", pass its own
 * acceptance test, and be worthless as a description of a fighter.
 *
 * So the weights take the part of the measurement that is also a defensible claim about fighting —
 * a tank is the most load-bearing physical there is, and worth far more to a man whose game is
 * pressure than to a counter-striker — and stop there. At 0.40 the mean weight is 0.20 and the
 * maximum 0.27, which is roughly a quarter of a pressure wrestler's rating and three times what
 * `overallRating` allowed.
 *
 * **The compromise is nearly free.** On a general roster, 0.40 scores 0.943 against win rate and
 * the fully-fitted 0.60 scores 0.948 — five thousandths, for a claim that would have been four
 * times too strong. The fit only pays off on the pathological population that is *built* out of
 * the imbalance, and there the rating loses on purpose.
 *
 * **If the engine's cardio dependence is ever retuned, this constant must be re-measured.** It is
 * a reading of a particular simulator at a particular calibration, not a constant of nature.
 */
const CARDIO_WEIGHT_MAX = 0.4;
const DURABILITY_WEIGHT_MAX = 0.18;

/**
 * How much of an opponent's drive is scouting rather than taste.
 *
 * A corner game-plans against the hole in front of it whatever its own fighter prefers, and that
 * asymmetry is the difference between a rating that punishes an exploitable fighter and one that
 * hopes nobody notices. Not 1, because a fighter is still himself: a kickboxer who finds a
 * wrestler's chin does not become a wrestler for the night.
 */
const GAME_PLANNING = 0.45;

/**
 * **How much worse a bad context is than its share of the clock.**
 *
 * The exponent of the power mean over contexts, and the single most important number in this file.
 *
 * A fight is not won on average performance across places; it is *lost* in the place you cannot
 * survive. Measured, an arithmetic mean over time share could not see that: `ARCHETYPES.striker`
 * read **73.5** against the panel's top wrestler, who reaches top position against him 44% of the
 * time and outscores him 70 to 48 once there — 0.9 of a point worse than against an opponent who
 * cannot wrestle at all. Nineteen per cent of a fight on the bottom is not nineteen per cent of a
 * cost, and no amount of re-weighting a linear average says so.
 *
 * A negative power mean does. At −2 the same striker reads **66.9** against the wrestler and
 * **72.5** against the kickboxer — a 5.6-point spread where the arithmetic mean produced 0.9 — on
 * 17% of the fight spent on the bottom at a context score of 48 against his 87 at long range. It
 * is the same move `ATTRIBUTE_META.convexity` makes on a single attribute, applied to a
 * distribution over places instead of a point on a scale.
 *
 * **The anchor is exact at any exponent**, which is why this is safe: a power mean of identical
 * values is that value, so a uniformly `v`-rated fighter still reads exactly `v`. The exponent
 * changes how holes are charged and nothing about the scale.
 */
const CONTEXT_POWER = -2;

/**
 * The share-weighted power mean of a fighter's context scores.
 *
 * Ratings are integers in [1, 100] so the reciprocal is always defined, but the floor is explicit
 * rather than assumed: a zero here would be an infinity propagating silently into a rating.
 */
function contextMean(
  scores: Record<FightContext, number>,
  share: Record<FightContext, number>,
): number {
  let acc = 0;
  for (const c of FIGHT_CONTEXTS) acc += share[c] * Math.pow(Math.max(scores[c], 1), CONTEXT_POWER);
  return Math.pow(acc, 1 / CONTEXT_POWER);
}

function normalise(values: Record<FightContext, number>): Record<FightContext, number> {
  let total = 0;
  for (const c of FIGHT_CONTEXTS) total += values[c];
  const out = {} as Record<FightContext, number>;
  if (total <= 0) {
    for (const c of FIGHT_CONTEXTS) out[c] = 1 / FIGHT_CONTEXTS.length;
    return out;
  }
  for (const c of FIGHT_CONTEXTS) out[c] = values[c] / total;
  return out;
}

/**
 * A fighter's functional reading against one specific opponent.
 *
 * The pairwise form, and the one the acceptance test uses: a rating that claims to predict fights
 * has to be checkable against fights. `functionalRating` is this against a generic professional.
 */
export function functionalBreakdown(attrs: Attributes, against: Attributes): FunctionalBreakdown {
  const scores = contextScores(attrs);
  const want = fightStyleOf(attrs);
  const imposition = impositionProfile(attrs, against);
  const opponentImposition = impositionProfile(against, attrs);
  const opponentWant = fightStyleOf(against);

  // Where he pulls the fight: what he wants, weighted by whether he can get it. No second softmax
  // over `scores` — `want` is already derived from what he owns, and soft-maxing twice would make
  // every fighter read as his single best context.
  const drive = {} as Record<FightContext, number>;
  // Where they pull it: partly their own preference, partly the hole in front of them.
  const theirPreference = {} as Record<FightContext, number>;
  const theirGamePlan = {} as Record<FightContext, number>;
  for (const c of FIGHT_CONTEXTS) {
    drive[c] = want[c] * imposition[c];
    theirPreference[c] = opponentWant[c] * opponentImposition[c];
    theirGamePlan[c] = opponentImposition[c] * Math.exp(-scores[OPPOSITE_CONTEXT[c]] / TARGET_TAU);
  }

  const myPull = FIGHT_CONTEXTS.reduce((acc, c) => acc + drive[c], 0);
  const theirPull = FIGHT_CONTEXTS.reduce((acc, c) => acc + theirPreference[c], 0);
  const control = myPull + theirPull <= 0 ? 0.5 : myPull / (myPull + theirPull);

  // Their drive, in their frame: preference and scouting mixed.
  const preferenceShare = normalise(theirPreference);
  const gamePlanShare = normalise(theirGamePlan);
  const theirDrive = {} as Record<FightContext, number>;
  for (const c of FIGHT_CONTEXTS) {
    theirDrive[c] =
      theirPull * ((1 - GAME_PLANNING) * preferenceShare[c] + GAME_PLANNING * gamePlanShare[c]);
  }

  // Where the fight actually spends its time, in *his* frame: his pull plus theirs, and theirs
  // lands him in the mirror of what they wanted.
  const raw = {} as Record<FightContext, number>;
  for (const c of FIGHT_CONTEXTS) raw[c] = drive[c] + theirDrive[OPPOSITE_CONTEXT[c]];
  const share = normalise(raw);

  // The two readings worth showing a player, and the two this used to be built from: the fight he
  // would choose, and the fight they would. Reported rather than combined, because a linear blend
  // of them is exactly what could not see a hole (see `CONTEXT_POWER`).
  const driveShare = normalise(drive);
  const targetShare = gamePlanShare;
  let imposed = 0;
  let exposed = 0;
  for (const c of FIGHT_CONTEXTS) {
    imposed += driveShare[c] * scores[c];
    exposed += targetShare[c] * scores[OPPOSITE_CONTEXT[c]];
  }

  const base = contextMean(scores, share);

  let workload = 0;
  let exposure = 0;
  for (const c of FIGHT_CONTEXTS) {
    workload += share[c] * CONTEXTS[c].exertion;
    exposure += share[c] * CONTEXTS[c].hazard;
  }

  // Power only buys you out of the cardio bill if you can make the exchange happen. A man with a
  // bomb who cannot force a fight is still in a long one, by the other man's choice.
  const derived = deriveRatings(attrs);
  const finishShare = clamp01(control * (derived.finishingInstinct / 100));
  const cardioWeight =
    CARDIO_WEIGHT_MAX * clamp01(remap(workload, 0.7, 1.3, 0.15, 1)) * (1 - finishShare);
  // Charged harder the less of the fight you chose, and never to zero: everyone gets hit sometimes.
  const durabilityWeight =
    DURABILITY_WEIGHT_MAX *
    clamp01(remap(exposure, 0.6, 1.3, 0.15, 1)) *
    (0.45 + 0.55 * (1 - control));

  const rating =
    base * (1 - cardioWeight - durabilityWeight) +
    attrs.cardio * cardioWeight +
    attrs.durability * durabilityWeight;

  return {
    rating,
    scores,
    want,
    imposition,
    opponentImposition,
    share,
    control,
    imposed,
    exposed,
    base,
    cardioWeight,
    durabilityWeight,
  };
}

/**
 * A reference opponent: every attribute at `COMPETITIVE_REFERENCE`, then shaped.
 *
 * `COMPETITIVE_REFERENCE` is the band table's own reference population — "average for a
 * major-promotion roster" — so using that constant rather than inventing a second one means the
 * sentence "he reads 74" has exactly one meaning in the codebase: *this is how he looks against
 * ordinary rostered professionals*, which is what a scouting number is for.
 */
function referenceOpponent(shape: Partial<Record<keyof Attributes, number>>): Attributes {
  const out = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) out[k] = toRating(COMPETITIVE_REFERENCE + (shape[k] ?? 0));
  // Frozen because these are module-level shared state read by every rating in the game, and a
  // caller that treated one as a scratch block would quietly re-rate the entire world.
  return Object.freeze(out);
}

/** The styles a fighter is read against. */
export const REFERENCE_STYLES = [
  'balanced',
  'longRangeStriker',
  'pressureFighter',
  'topWrestler',
  'submissionThreat',
] as const;

export type ReferenceStyle = (typeof REFERENCE_STYLES)[number];

/**
 * **The field, as five opponents rather than one.**
 *
 * The first cut of this module read every fighter against a single all-55 opponent, and the
 * measurement killed it: `ARCHETYPES.striker` — whose own docstring calls him "the classic
 * exploitable striker", 90/88/88 striking against 35 wrestling and 42 takedown defence — read
 * **77.9**, above the grinder and almost level with the smotherer. The formula was not wrong. The
 * reference was. **An opponent with no teeth in any direction cannot punish a hole**, and a
 * fighter is exploitable *by a style*, not by an average.
 *
 * So the reading is taken five times and combined pessimistically. Being unanswerable to four
 * shapes and helpless against the fifth is not the same as being good, because matchmakers book
 * the fifth — which is the whole of what the sport does to a one-dimensional fighter and the
 * thing a mean of fifteen numbers can never see.
 *
 * **Every member has the same mean, 55.** They differ in shape and not in level, which is the
 * engine-wide rule `shape-not-level.test.ts` exists to enforce and is asserted here too. A panel
 * whose wrestler were also its best fighter would measure level and report it as vulnerability.
 *
 * The five are chosen to reach all six contexts between them: the striker owns `outside` and
 * `boxing`, the pressure fighter `pocket` and `clinch`, the wrestler `groundTop`, the submission
 * threat `groundBottom`. A hole anywhere on the board is somebody's route in.
 */
export const REFERENCE_PANEL: Readonly<Record<ReferenceStyle, Attributes>> = Object.freeze({
  balanced: referenceOpponent({}),
  longRangeStriker: referenceOpponent({
    kicking: 18,
    strikingDefence: 16,
    strikingOffence: 14,
    speed: 12,
    fightIq: 6,
    wrestling: -16,
    groundControl: -14,
    submissions: -12,
    takedownDefence: -10,
    scrambling: -8,
    strength: -6,
  }),
  pressureFighter: referenceOpponent({
    cardio: 18,
    strength: 12,
    wrestling: 12,
    durability: 12,
    composure: 8,
    groundControl: 6,
    kicking: -16,
    speed: -14,
    strikingDefence: -12,
    power: -10,
    submissions: -10,
    fightIq: -6,
  }),
  topWrestler: referenceOpponent({
    wrestling: 20,
    groundControl: 18,
    takedownDefence: 14,
    strength: 10,
    cardio: 8,
    kicking: -18,
    strikingOffence: -12,
    strikingDefence: -12,
    speed: -10,
    power: -10,
    submissions: -8,
  }),
  submissionThreat: referenceOpponent({
    submissions: 22,
    scrambling: 18,
    groundControl: 8,
    fightIq: 6,
    speed: 4,
    power: -14,
    strength: -12,
    kicking: -12,
    strikingOffence: -10,
    durability: -10,
  }),
});

/**
 * How pessimistically the panel is combined, in rating points.
 *
 * A soft minimum: at 12, a fighter who reads 85 against four styles and 60 against the fifth comes
 * out at 68 — elite, and discounted hard for the one matchup that beats him. Much tighter and the
 * rating *is* the worst matchup, which punishes every specialist out of existence; much looser and
 * it is a mean of the panel, which is the flat average this module exists to replace, one level up.
 */
const PANEL_TAU = 12;

/** A fighter's reading against each style, and the pessimistic combination of them. */
export interface FunctionalProfile {
  rating: number;
  /** The reading against each reference style, before they are combined. */
  byStyle: Record<ReferenceStyle, number>;
  /** The style that reads worst, which is the fight a matchmaker would look for. */
  worstStyle: ReferenceStyle;
  /** The full breakdown against that worst style, for a screen that has to explain why. */
  worst: FunctionalBreakdown;
}

/** A fighter's reading against each reference style, combined into one number. */
export function functionalProfile(
  attrs: Attributes,
  context?: CompetitiveContext,
): FunctionalProfile {
  const mine = competitiveAttributes(attrs, context);
  const byStyle = {} as Record<ReferenceStyle, number>;
  let worstStyle: ReferenceStyle = REFERENCE_STYLES[0];
  let worstBreakdown = functionalBreakdown(mine, REFERENCE_PANEL[worstStyle]);
  byStyle[worstStyle] = worstBreakdown.rating;
  for (const style of REFERENCE_STYLES.slice(1)) {
    const b = functionalBreakdown(mine, REFERENCE_PANEL[style]);
    byStyle[style] = b.rating;
    if (b.rating < worstBreakdown.rating) {
      worstStyle = style;
      worstBreakdown = b;
    }
  }

  // Soft minimum. Subtracting the worst reading before exponentiating keeps the weights in a sane
  // numeric range — `exp(-85/12)` is 8e-4 and the arithmetic is fine, but the shifted form is the
  // one that stays fine if the scale ever moves.
  let weighted = 0;
  let total = 0;
  for (const style of REFERENCE_STYLES) {
    const w = Math.exp(-(byStyle[style] - worstBreakdown.rating) / PANEL_TAU);
    weighted += byStyle[style] * w;
    total += w;
  }

  return {
    rating: Math.round((weighted / total) * 10) / 10,
    byStyle,
    worstStyle,
    worst: worstBreakdown,
  };
}

/**
 * **A fighter's functional ability, 1–100.** The replacement for `overallRating`.
 *
 * With a `context`, the five physicals are read against the division first (`competitive.ts`), so
 * a flyweight and a heavyweight of equal quality read the same — without it they are read
 * absolutely, which is honest for a within-division sort and wrong for a cross-division one. Doc
 * 31 § 12 step 12 is the reason the parameter exists at all.
 */
export function functionalRating(attrs: Attributes, context?: CompetitiveContext): number {
  return functionalProfile(attrs, context).rating;
}

/**
 * A fighter's functional reading against a *named* opponent, 1–100.
 *
 * Not a win probability and not a substitute for simulating the fight — it is the same question
 * `functionalRating` answers with the panel replaced by one real opponent, which is what makes the
 * whole thing falsifiable.
 */
export function functionalMatchup(
  attrs: Attributes,
  against: Attributes,
  context?: CompetitiveContext,
): number {
  const mine = competitiveAttributes(attrs, context);
  const theirs = competitiveAttributes(against, context);
  return Math.round(functionalBreakdown(mine, theirs).rating * 10) / 10;
}

/** Every derived rating this module reads, for a UI that wants to show its working. */
export const FUNCTIONAL_DERIVED_INPUTS: readonly DerivedKey[] = DERIVED_KEYS;
