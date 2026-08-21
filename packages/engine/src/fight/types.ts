/**
 * Fight simulation types.
 *
 * See docs/03-fight-engine.md. Position is the spine of the model: every resolution is
 * conditioned on it, and the ground sub-position ladder is what makes Ground Control and
 * Submissions mean different things.
 */

import type { FighterId } from '../core/ids.js';
import type { FinishMethod } from '../domain/fighter.js';
import type { FoulIncident } from './fouls.js';

export type Corner = 'red' | 'blue';

export const OTHER_CORNER: Readonly<Record<Corner, Corner>> = { red: 'blue', blue: 'red' };

export type Position = 'distance' | 'clinch' | 'ground';

/**
 * How far apart two standing fighters are.
 *
 * `distance` was one undifferentiated bucket holding everything from a karateka bouncing at
 * kicking range to two boxers chest-to-chest throwing hooks — and a simulator that cannot tell
 * those apart cannot model reach, pressure, movement or range management, which is why
 * `reachInches` sat authored on every fighter in both seed rosters and read by nothing.
 *
 * Three states rather than two, deliberately. The two-state version of this landed on "at long
 * range you may only jab", which is false — a rear straight is not a pocket-only weapon — and
 * that falsity was the signal that two states were being stretched to cover three. `boxing` is
 * where most conventional MMA striking happens: hands work normally, kicks still exist, and it
 * is neither the range you have to *enter* from nor the one you have to *survive* in.
 *
 * A sub-state of `distance` rather than three more `Position` values, so everything that reads
 * `position === 'distance'` — the fatigue table, the judges' `distanceSeconds`, the clinch entry
 * path — keeps working untouched.
 */
export const RANGES = ['outside', 'boxing', 'pocket'] as const;
export type Range = (typeof RANGES)[number];

/** How far apart each range is, 0 (chest to chest) … 1 (kicking range). Ordering, not geometry. */
export const RANGE_SEPARATION: Readonly<Record<Range, number>> = {
  outside: 1,
  boxing: 0.5,
  pocket: 0,
};

/** Ground sub-position ladder, ascending in dominance for the top fighter. */
export const GROUND_POSITIONS = ['guard', 'halfGuard', 'sideControl', 'mount', 'back'] as const;
export type GroundPosition = (typeof GROUND_POSITIONS)[number];

/** Dominance value of a ground position for the controlling fighter, 0–1. */
export const GROUND_DOMINANCE: Readonly<Record<GroundPosition, number>> = {
  guard: 0.3,
  halfGuard: 0.5,
  sideControl: 0.7,
  mount: 0.88,
  back: 1.0,
};

export const STRIKE_TARGETS = ['head', 'body', 'legs'] as const;
export type StrikeTarget = (typeof STRIKE_TARGETS)[number];

export type DamageRegion = StrikeTarget;

/**
 * What a strike was thrown with.
 *
 * The primitive the engine was missing (doc 19 §0 F2). Before this, striking carried a single
 * `isKick` boolean, and it sat at the wrong scope in three separate ways: it was chosen per
 * *exchange* while targets were chosen per *shot*, so a "punch" exchange that rolled `legs`
 * applied leg damage off `strikingOffence` and was then narrated as a calf kick; damage,
 * flushness and knockdown hazard never saw it at all, so a head kick from a Kicking-95 fighter
 * landed as flush and hurt as much as their jab; and the clinch knee and the ground elbow had
 * no name anywhere, being hardcoded prose over a `strength` contest.
 *
 * A weapon is per *shot*, chosen with its target rather than independently of it, and carried
 * through resolution into the play-by-play — which is what makes commentary parity testable
 * (doc 19 §4 D2). It is deliberately not an attribute: `WEAPON_PROFILE` in `damage.ts` is the
 * only place a weapon means anything, and every fighter's ability to use one still comes from
 * the ratings they can train, age out of and be injured in.
 */
export const WEAPONS = ['punch', 'kick', 'knee', 'elbow'] as const;
export type Weapon = (typeof WEAPONS)[number];

/**
 * How a takedown was entered.
 *
 * The same argument as `Weapon`, in the phase of the fight that argument had not reached. The
 * narrator was picking the entry itself — `rng.pick(['a double leg', 'a single leg', 'a body
 * lock', 'a reactive shot', 'a trip'])` — which meant a judoka's throws and a wrestler's doubles
 * were the same uniform draw, a shot taken from the clinch could be narrated as a reactive shot
 * from range, and nothing could tell any of it was wrong (docs/19 §8c). Resolution picks it now,
 * from the fighter's own tendencies and from where the shot started, and the play-by-play is told.
 *
 * Descriptive on purpose: the entry names what happened and does not change the odds of it
 * happening or where it lands. Giving a trip a different landing position than a double leg is a
 * real idea and a distribution move, which makes it somebody else's phase.
 */
export const TAKEDOWN_ENTRIES = [
  'doubleLeg',
  'singleLeg',
  'reactiveShot',
  'bodyLock',
  'trip',
] as const;
export type TakedownEntry = (typeof TAKEDOWN_ENTRIES)[number];

/** What a fighter is trying to do this exchange. */
export type Intent =
  | 'strike'
  | 'counter'
  | 'kick'
  | 'clinchUp'
  | 'takedown'
  | 'clinchStrike'
  | 'breakAway'
  | 'advancePosition'
  | 'groundStrike'
  | 'submission'
  | 'escape'
  | 'sweep'
  | 'standUp'
  | 'stall'
  | 'recover';

/** A timestamped play-by-play line. The permanent record of the fight. */
export interface FightEvent {
  round: number;
  /** Seconds elapsed within the round. */
  timeSeconds: number;
  /** Corner the event is *about*, when there is one. */
  corner?: Corner;
  kind: FightEventKind;
  text: string;
  /** Set for significant moments the UI should emphasise. */
  emphasis?: 'minor' | 'major' | 'critical';
  /**
   * What the strike was thrown with, when this event is about one.
   *
   * The ground truth the prose is checked against. `commentary.ts` is handed the weapon rather
   * than choosing a technique itself, so a line that names a knee is a line where a knee was
   * resolved — and `tests/statistical/commentary-parity.test.ts` can prove it. Two independent
   * draws, one in the resolver and one in the narrator, would make that test unwritable.
   */
  weapon?: Weapon;
  /** Where it landed, when this event is about a strike. */
  target?: StrikeTarget;
  /** How the takedown was entered, when this event is about one — landed or stuffed. */
  takedown?: TakedownEntry;
}

export type FightEventKind =
  | 'roundStart'
  | 'roundEnd'
  | 'strike'
  | 'combination'
  | 'kick'
  | 'knockdown'
  | 'hurt'
  | 'recovered'
  | 'takedown'
  | 'takedownStuffed'
  | 'clinch'
  | 'clinchBreak'
  | 'range'
  | 'positionAdvance'
  | 'sweep'
  | 'standUp'
  | 'refStandUp'
  | 'submissionAttempt'
  | 'submissionEscape'
  | 'groundStrikes'
  | 'foul'
  | 'pointDeduction'
  | 'doctorCheck'
  | 'finish'
  | 'decision'
  /** Colour commentary, inserted after the fact by `broadcast.ts`. Never affects a result. */
  | 'colour'
  | 'note';

/** Per-fighter accumulated statistics for one fight. */
export interface FightStats {
  significantStrikesLanded: number;
  significantStrikesAttempted: number;
  strikesByTarget: Record<StrikeTarget, number>;
  /**
   * Landed strikes by what they were thrown with.
   *
   * Two one-dimensional projections rather than the full weapon × target matrix, because these
   * are the two questions anything downstream actually asks — "how much of this fighter's offence
   * was kicks" and "where did they aim" — and twelve counters would be read as three. Neither is
   * persisted: `FightStats` lives on a `FightResult`, which no save writes.
   */
  strikesByWeapon: Record<Weapon, number>;
  knockdowns: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  submissionAttempts: number;
  /** Seconds of controlling position (top ground or dominant clinch). */
  controlSeconds: number;
  /**
   * Of that, the seconds spent controlling the *clinch* rather than the floor.
   *
   * The fence and the floor are different places to be winning, and until step 6B gave the clinch
   * a second side they were close enough to one number. A fighter who lives in the tie-up and one
   * who lives in top position both read as "controlling" on a single counter, which is exactly the
   * resolution a judoka and a wrestler need distinguishing at (docs/19 §13.6).
   */
  clinchControlSeconds: number;
  /** Seconds spent at distance. Used by judges assessing octagon control. */
  distanceSeconds: number;
  /**
   * Of that, the seconds spent at each range.
   *
   * Sums to `distanceSeconds`. Kept as its own breakdown rather than folded into it because
   * `distanceSeconds` answers a judge's question — was this fight standing — and this answers the
   * player's: *did my game plan actually happen*. Without it, a plan that failed can only be
   * diagnosed by reading several hundred play-by-play events, which is not diagnosis.
   */
  rangeSeconds: Record<Range, number>;
  /**
   * Attempts to change the range, and the ones that came off.
   *
   * Two counters rather than one because the difference between them *is* range control, and it
   * is the difference a single number cannot show. A fighter who tried eleven times and got there
   * twice and a fighter who tried three times and got there twice have the same `rangeSeconds` and
   * are not remotely the same fighter — the first one is being beaten to the punch every time he
   * steps in, and that is the diagnosis a player needs when a game plan did not happen.
   */
  rangeChangesAttempted: number;
  rangeChangesLanded: number;
  /**
   * Attempts to get out from underneath, and the ones that worked.
   *
   * The same pair as the range counters and for the same reason: the plan sets how often a fighter
   * goes for the exit, his attributes and the other man's decide whether it opens, and only both
   * numbers together can tell "he was told to stand up and could not" from "he was never trying".
   */
  escapesAttempted: number;
  escapesLanded: number;
  /**
   * Beats spent doing something useful while still underneath — attacking, framing, hand-fighting.
   *
   * The counter that makes the transition invariant checkable. Wanting out of a position must not
   * suppress the work done in it, and the only way to see that is to count the work: a fighter told
   * to stand up who never does anything but fail to stand up is the defect, and he looks identical
   * on every other statistic to one who is busy.
   */
  bottomWorkBeats: number;
  /**
   * Deliberate disengagements from top position, and the ones that came off.
   *
   * The third attempt/landed pair, for the third transition, and for the same reason as the other
   * two: the plan owns how often a fighter tries to stand back up, and the two fighters own whether
   * he manages it. Only both numbers together tell "he wanted the fight standing and was held down"
   * from "he was happy where he was".
   */
  topExitsAttempted: number;
  topExitsLanded: number;
  /**
   * Beats resolved from top position, whatever was chosen on them.
   *
   * The denominator `bottomWorkBeats` is for the other half of the floor, and it exists for the
   * same reason: a share of the fighter's *decisions* is not recoverable from a share of the
   * *clock*, and docs/01 forbids inferring either from the other. Without it, "he stopped throwing
   * because he was busy standing up" and "he stopped throwing because he was on top for less of
   * the fight" are the same statistic.
   */
  topBeats: number;
  /** Cumulative damage dealt, in the same units as the opponent's damage meters. */
  damageDealt: number;
}

/** Damage a fighter leaves the cage with. Feeds injuries and permanent career wear. */
export interface DamageReport {
  headDamage: number;
  bodyDamage: number;
  legDamage: number;
  knockdownsSuffered: number;
  /** True if the fight ended with them unconscious or unable to intelligently defend. */
  wasFinishedByStrikes: boolean;
  /** Career head-trauma increment produced by this fight. */
  traumaIncrement: number;
}

/**
 * Everything that happened to one fighter in one round, from a judge's point of view.
 *
 * Lives here rather than in `scoring.ts` so `FightResult.roundStats` can name it without
 * `types.ts` importing from a module that already imports `types.ts`. `scoring.ts` re-exports
 * both, so every existing import keeps working.
 */
export interface RoundTally {
  damageDealt: number;
  significantStrikes: number;
  controlSeconds: number;
  takedowns: number;
  submissionAttempts: number;
  knockdowns: number;
  /** Strikes thrown — a proxy for forward pressure and octagon control. */
  strikesAttempted: number;
}

export function emptyTally(): RoundTally {
  return {
    damageDealt: 0,
    significantStrikes: 0,
    controlSeconds: 0,
    takedowns: 0,
    submissionAttempts: 0,
    knockdowns: 0,
    strikesAttempted: 0,
  };
}

export interface RoundScore {
  round: number;
  red: number;
  blue: number;
}

export interface Scorecard {
  judgeName: string;
  rounds: readonly RoundScore[];
  redTotal: number;
  blueTotal: number;
}

export interface FightResult {
  boutId: string;
  redId: FighterId;
  blueId: FighterId;
  winnerId?: FighterId;
  method: FinishMethod;
  /** Round the fight ended in, 1-indexed. */
  round: number;
  /** Seconds into `round`. */
  timeSeconds: number;
  /** Name of the finishing submission, when applicable. */
  submissionName?: string;
  events: readonly FightEvent[];
  scorecards: readonly Scorecard[];
  stats: Record<Corner, FightStats>;
  /**
   * The same statistics, split by round — index 0 is round one.
   *
   * `simulateFight` has always built these: they are what the judges score, and the fighters
   * themselves read them mid-fight to know whether they are behind. They were then dropped on
   * the floor when the function returned, which left the app in the impossible position of
   * showing whole-fight totals beside per-round scorecards and inviting the player to
   * reconcile them. A fighter who banked eighty strikes in round three and lost the first two
   * looks robbed in aggregate and is not, and there was no way to see it.
   *
   * Optional because a `FightResult` outlives the process that made it — the last one sits in
   * session storage — and a result written before this existed has none.
   */
  roundStats?: readonly Record<Corner, RoundTally>[];
  damage: Record<Corner, DamageReport>;
  /** Every foul called or missed, in order. Empty in the overwhelming majority of fights. */
  fouls: readonly FoulIncident[];
  /** Points deducted per corner, already applied to the scorecards. */
  deductions: Record<Corner, number>;
  /** Set when the referee's tendencies materially changed the result. Used by commentary. */
  refereeNote?: string;
}

/**
 * A fight without its play-by-play.
 *
 * What doc 27 § 5's **Reduced** level of detail produces: everything a career, a promotion, a
 * ranking and a health model read, and nothing a reader would read. A full `FightResult` is
 * assignable to this and not the reverse, so a screen that renders a transcript cannot silently be
 * handed a fight that has none — while every system that only ever wanted the *result* can say so
 * in its own signature. Measured across the engine and the app, that is all of them except
 * `broadcast.ts` and the fight screen.
 */
export type ReducedFightResult = Omit<FightResult, 'events'>;

export function emptyStats(): FightStats {
  return {
    significantStrikesLanded: 0,
    significantStrikesAttempted: 0,
    strikesByTarget: { head: 0, body: 0, legs: 0 },
    strikesByWeapon: { punch: 0, kick: 0, knee: 0, elbow: 0 },
    knockdowns: 0,
    takedownsLanded: 0,
    takedownsAttempted: 0,
    submissionAttempts: 0,
    controlSeconds: 0,
    clinchControlSeconds: 0,
    distanceSeconds: 0,
    rangeSeconds: { outside: 0, boxing: 0, pocket: 0 },
    rangeChangesAttempted: 0,
    rangeChangesLanded: 0,
    escapesAttempted: 0,
    escapesLanded: 0,
    bottomWorkBeats: 0,
    topExitsAttempted: 0,
    topExitsLanded: 0,
    topBeats: 0,
    damageDealt: 0,
  };
}
