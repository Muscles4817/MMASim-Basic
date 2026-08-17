/**
 * The behavioural fingerprint of a fighter.
 *
 * Everything else in the statistical tier measures *outcomes* — who won, how it ended, how
 * often it went to the cards. Nothing measured **style**, which meant no claim about stylistic
 * differentiation was falsifiable and every fight-engine change aimed at expressiveness had to
 * be argued rather than shown (docs/19 §1).
 *
 * A fingerprint is what an observer would write down watching a fighter's fights: how much of
 * their offence is kicks, how much of it is grappling, how much of the fight they spend at
 * range, how much of it they spend on top. The definition it serves:
 *
 * > A fight is style-expressive when an observer given only the play-by-play and the
 * > post-fight stats can name which discipline each fighter came from, better than chance.
 *
 * Three rules make the numbers comparable:
 *
 *  1. **A fixed control opponent.** A fingerprint measured across varied opposition is a
 *     property of the *matchups*, not of the fighter. Every measurement here runs against the
 *     same fighter, with the same game plan on both sides, so a difference between two prints
 *     is a difference between the two fighters and nothing else.
 *
 *  2. **Every axis is a natural 0–1 share**, never a rate divided by an invented ceiling. So
 *     a separation of 0.20 means the same thing on every axis, and can be compared against
 *     the scouting error term — `SCOUTING_ERROR` below — which is what makes the G1 target a
 *     claim about *perceptibility* rather than an arbitrary threshold.
 *
 *  3. **Default game plans**, because that is what ~99% of the fights the game produces use
 *     (doc 18 §2.5). Measuring style under hand-tuned plans would measure the plans.
 *
 * Known bias, recorded rather than corrected: `distanceShare` reads `stats.distanceSeconds`,
 * and the simulator credits an exchange's seconds to the position the exchange *ended* in. A
 * takedown or a clinch entry therefore books its whole duration to the ground or the clinch,
 * so distance time is systematically under-credited for whoever changes position. It is a
 * measurement defect in a stat the judges also read, and fixing it moves scorecards — so it
 * is out of scope for a phase whose whole point is to move nothing. Treat `distanceShare` as
 * "time spent not changing position at range" and prefer the other five axes when a claim can
 * be made without it.
 */

import {
  ARCHETYPES,
  COMBAT_DISCIPLINES,
  DISCIPLINE_META,
  makeFighter,
  simulateFight,
  uniformAttributes,
  type AttributeKey,
  type CombatDiscipline,
  type Fighter,
  type GamePlan,
} from '@mmasim/engine';

/**
 * The six axes.
 *
 * Chosen because each is visible in the play-by-play or on the post-fight stat line — the two
 * things the player actually sees — and because between them they cover the four questions
 * that distinguish one art from another: what do you throw, where do you throw it, do you want
 * this fight on the floor, and what do you do when you get it there.
 */
export const FINGERPRINT_AXES = [
  /** Share of this fighter's landed strikes that the play-by-play called a kick. */
  'kickShare',
  /** Share of their landed strikes that went to the legs. */
  'legTargetShare',
  /** Share of all their offensive attempts that were takedowns or submissions. */
  'grapplingShare',
  /** Of their grappling attempts, the share that were submissions rather than takedowns. */
  'submissionMix',
  /** Share of the fight they spent in a controlling position. */
  'controlShare',
  /** Share of the fight they spent at range. */
  'distanceShare',
] as const;

export type FingerprintAxis = (typeof FINGERPRINT_AXES)[number];
export type Fingerprint = Record<FingerprintAxis, number>;

/**
 * How far apart two prints must be on an axis for the difference to be perceptible.
 *
 * The scouting system reports a fighter's tendencies with noise whose standard deviation runs
 * roughly 0.10–0.14 of the 0–1 range at realistic coach ratings (doc 18 §4.3). A separation
 * inside that band is not a style difference the player could ever observe — it is two
 * fighters the scouting report describes identically. 0.20 is the first round number clear of
 * it, and G1 asks for it on two axes so that a pair is separated by a *shape*, not by one
 * number that could be noise.
 */
export const SEPARATION_TARGET = 0.2;
export const SCOUTING_ERROR = 0.14;

/** Axes on which two fingerprints differ by at least `threshold`. */
export function separatedAxes(
  a: Fingerprint,
  b: Fingerprint,
  threshold = SEPARATION_TARGET,
): FingerprintAxis[] {
  return FINGERPRINT_AXES.filter((axis) => Math.abs(a[axis] - b[axis]) >= threshold);
}

/** The widest single-axis gap between two fingerprints. */
export function maxSeparation(a: Fingerprint, b: Fingerprint): number {
  return Math.max(...FINGERPRINT_AXES.map((axis) => Math.abs(a[axis] - b[axis])));
}

/** Compact one-line description, so a failure message says what the fighter actually did. */
export function describeFingerprint(p: Fingerprint): string {
  return FINGERPRINT_AXES.map((axis) => `${axis}=${p[axis].toFixed(3)}`).join(' ');
}

export interface FingerprintOptions {
  /**
   * How many fights to average over.
   *
   * 400 by default. Measured: doubling from 200 to 400 moves five of the six axes by at most
   * 0.005 and `submissionMix` by 0.024 — an order of magnitude below `SEPARATION_TARGET`, so a
   * separation this suite reports is a property of the fighters rather than of the sample.
   */
  fights?: number;
  rounds?: 3 | 5;
  /** The control. Defaults to `ARCHETYPES.contender()` — the level a matchmaker really books. */
  opponent?: Fighter;
  /** Given to both corners, so the plan is never what is being measured. */
  plan?: GamePlan;
  seedPrefix?: string;
}

/**
 * How pronounced a discipline is in an exemplar, in multiples of its debut bias.
 *
 * `DISCIPLINE_META` biases are what a *debutant* carries out of the gym, on top of a baseline
 * of 46. An exemplar has to be a professional instead, or the fingerprint is measuring two
 * amateurs. 1.5× puts a discipline's signature attribute in the low 90s and its neglected ones
 * at the baseline — the shape of somebody who has spent a career in one art.
 *
 * The baseline is 66 for a specific reason: `15 × 66 + 40 × 1.5 = 1050` rating points, which is
 * `ARCHETYPES.contender()`'s total to within one point. So an exemplar is the *same fighter's
 * worth* of ability as the control, distributed differently — and a win rate against the
 * control becomes a statement about shape rather than about level. At the 60 first tried, all
 * six exemplars carried 91 points less than the control and lost 88–95% of their fights, which
 * measures nothing except that they were worse.
 */
const EXEMPLAR_SCALE = 1.5;
const EXEMPLAR_BASELINE = 66;

/**
 * A fighter who is nothing but their discipline.
 *
 * Derived from `DISCIPLINE_META` rather than hand-authored, deliberately: the suite then
 * measures **the six disciplines the game actually offers**, and `origin.ts` stays the single
 * statement of what each art is. Hand-written exemplars would let the fixtures and the
 * character-creation screen drift apart, and the fingerprint would slowly start measuring
 * fighters nobody can create.
 *
 * Every combat discipline biases exactly 40 rating points (`DisciplineMeta.attributes`), so
 * all six exemplars are the same *level* and differ only in *shape* — which is the only way a
 * separation number means anything.
 */
export function disciplineExemplar(discipline: CombatDiscipline): Fighter {
  const attributes = uniformAttributes(EXEMPLAR_BASELINE);
  for (const [key, bias] of Object.entries(DISCIPLINE_META[discipline].attributes) as [
    AttributeKey,
    number,
  ][]) {
    attributes[key] = Math.round(EXEMPLAR_BASELINE + bias * EXEMPLAR_SCALE);
  }
  return makeFighter({
    id: `fighter_${discipline}`,
    lastName: DISCIPLINE_META[discipline].label,
    attributes,
  });
}

/** Every combat discipline's exemplar, keyed by discipline. */
export function disciplineExemplars(): Map<CombatDiscipline, Fighter> {
  return new Map(COMBAT_DISCIPLINES.map((d) => [d, disciplineExemplar(d)]));
}

/** Run `fights` bouts against the control and average what the fighter did in them. */
export function measureFingerprint(fighter: Fighter, opts: FingerprintOptions = {}): Fingerprint {
  const fights = opts.fights ?? 400;
  const opponent = opts.opponent ?? ARCHETYPES.contender();
  const prefix = opts.seedPrefix ?? `fp:${fighter.id}`;

  let landed = 0;
  let kicks = 0;
  let legs = 0;
  let targeted = 0;
  let strikeAttempts = 0;
  let takedowns = 0;
  let submissions = 0;
  let controlSeconds = 0;
  let distanceSeconds = 0;
  let seconds = 0;

  for (let i = 0; i < fights; i++) {
    const result = simulateFight({
      boutId: `${prefix}:${i}`,
      seed: `${prefix}:${i}`,
      rounds: opts.rounds ?? 3,
      red: { fighter, plan: opts.plan },
      blue: { fighter: opponent, plan: opts.plan },
    });

    const stats = result.stats.red;
    landed += stats.significantStrikesLanded;
    // The play-by-play is the ground truth for *what was thrown*, because nothing on the stat
    // line records it — which is exactly the gap docs/19 phase 1 closes with a `Weapon` on the
    // strike. Note the known undercount: a missed kick is narrated as a missed punch
    // (`strikeMissed` never receives `isKick`), so only landed kicks are countable, which is
    // why the axis is a share of *landed* strikes rather than of attempts.
    for (const event of result.events) {
      if (event.kind === 'kick' && event.corner === 'red') kicks++;
    }
    legs += stats.strikesByTarget.legs;
    targeted +=
      stats.strikesByTarget.head + stats.strikesByTarget.body + stats.strikesByTarget.legs;
    strikeAttempts += stats.significantStrikesAttempted;
    takedowns += stats.takedownsAttempted;
    submissions += stats.submissionAttempts;
    controlSeconds += stats.controlSeconds;
    distanceSeconds += stats.distanceSeconds;
    seconds += (result.round - 1) * 300 + result.timeSeconds;
  }

  const grappling = takedowns + submissions;
  const safe = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : numerator / denominator;

  return {
    kickShare: safe(kicks, landed),
    legTargetShare: safe(legs, targeted),
    grapplingShare: safe(grappling, grappling + strikeAttempts),
    submissionMix: safe(submissions, grappling),
    controlShare: safe(controlSeconds, seconds),
    distanceShare: safe(distanceSeconds, seconds),
  };
}
