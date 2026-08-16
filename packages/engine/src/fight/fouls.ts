/**
 * Fouls, warnings and point deductions.
 *
 * The referee's `foulTolerance` has existed since the officials were written and has never
 * been read by anything, which meant a third of what makes a referee an individual was
 * decorative. This module is what makes it real.
 *
 * The design point worth understanding before changing any number here: **a foul stops the
 * fight, and stopping the fight is worth something.** A fighter who is hurt and about to be
 * finished, or gassed and drowning, gets up to five minutes to recover from an eye poke.
 * That is not a bug to be balanced away — it is one of the genuine injustices of the sport,
 * and it is why the fouler being *tired and careless* rather than *evil* is the right model.
 * Nobody chooses to foul here. It falls out of Discipline, Professionalism and fatigue.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Referee } from '../domain/officials.js';
import type { Personality } from '../domain/personality.js';
import type { Corner, Position } from './types.js';

export type FoulType =
  | 'eyePoke'
  | 'lowBlow'
  | 'fenceGrab'
  | 'illegalKnee'
  | 'backOfHead'
  | 'illegalUpkick';

export interface FoulMeta {
  label: string;
  /** Where in the fight it can happen at all. */
  positions: readonly Position[];
  /** Per-exchange chance for a wholly average fighter in a valid position. */
  baseChance: number;
  /**
   * Whether the referee reads it as deliberate.
   *
   * Cynical fouls are punished far harder for the same severity, because the sport punishes
   * *cheating* rather than *harm*. A fighter who grabs the fence to avoid a takedown loses a
   * point long before one who accidentally rakes an eye does.
   */
  cynical: boolean;
  /** Seconds of recovery the fouled fighter is given. 0 = the action barely pauses. */
  recoverySeconds: number;
  /** How badly it hurts, for deduction thresholds. 0–1. */
  severity: number;
  /** How likely a bad one is to end the night as a no contest. */
  noContestChance: number;
}

export const FOUL_META: Readonly<Record<FoulType, FoulMeta>> = {
  /** The most common foul in the sport by a distance, and the least punished. */
  eyePoke: {
    label: 'eye poke',
    positions: ['distance', 'clinch'],
    baseChance: 0.0034,
    cynical: false,
    recoverySeconds: 120,
    severity: 0.55,
    noContestChance: 0.02,
  },
  lowBlow: {
    label: 'low blow',
    positions: ['distance', 'clinch'],
    baseChance: 0.0028,
    cynical: false,
    // The full five minutes exists for exactly this, and a gassed fighter knows it.
    recoverySeconds: 180,
    severity: 0.5,
    noContestChance: 0.008,
  },
  /** Deliberate, cheap, and the referee is looking directly at it. */
  fenceGrab: {
    label: 'fence grab',
    positions: ['clinch', 'ground'],
    baseChance: 0.0042,
    cynical: true,
    recoverySeconds: 0,
    severity: 0.2,
    noContestChance: 0,
  },
  illegalKnee: {
    label: 'knee to a grounded opponent',
    positions: ['clinch'],
    baseChance: 0.0018,
    cynical: true,
    recoverySeconds: 90,
    severity: 0.8,
    noContestChance: 0.05,
  },
  backOfHead: {
    label: 'strike to the back of the head',
    positions: ['ground'],
    baseChance: 0.0036,
    cynical: false,
    recoverySeconds: 25,
    severity: 0.45,
    noContestChance: 0.012,
  },
  illegalUpkick: {
    label: 'upkick to a grounded opponent',
    positions: ['ground'],
    baseChance: 0.0015,
    cynical: true,
    recoverySeconds: 60,
    severity: 0.6,
    noContestChance: 0.015,
  },
};

export const FOUL_TYPES = Object.keys(FOUL_META) as readonly FoulType[];

/** A foul that actually happened, and what the referee did about it. */
export interface FoulIncident {
  type: FoulType;
  /** The corner that committed it. */
  by: Corner;
  round: number;
  timeSeconds: number;
  ruling: 'unseen' | 'warning' | 'pointDeduction' | 'disqualification';
  /** Seconds the fouled fighter was given to recover. */
  recoverySeconds: number;
}

/**
 * How prone a fighter is to fouling, as a multiplier on the base chance.
 *
 * Discipline is the main driver, Professionalism a secondary one — and fatigue matters a
 * great deal, because tired hands are open hands and tired fighters grab things. A
 * well-drilled fighter at 20% fatigue fouls about a fifth as often as an undisciplined one
 * who is drowning.
 */
export function carelessness(personality: Personality, fatigue: number): number {
  const discipline = 1.7 - (personality.discipline / 100) * 1.4;
  const professionalism = 1.15 - (personality.professionalism / 100) * 0.3;
  // Fatigue is deliberately superlinear: it is the last two minutes that produce the fence
  // grabs, not a uniform sprinkling across the fight.
  const tired = 1 + Math.pow(clamp01(fatigue), 1.6) * 1.1;
  return discipline * professionalism * tired;
}

/**
 * Extra likelihood of a *cynical* foul when losing the position.
 *
 * Nobody grabs the fence while winning. This is what makes a fence grab read as desperation
 * rather than noise, and it is why the same fighter fouls in the third round of a fight they
 * are losing and not in the first round of one they are not.
 */
export function desperation(personality: Personality, momentum: number): number {
  if (momentum >= 0) return 1;
  const losing = Math.min(1, -momentum);
  // Ego resists losing; discipline resists cheating. They pull in opposite directions.
  const willingness = 0.5 + (personality.ego / 100) * 0.5 - (personality.discipline / 100) * 0.35;
  return 1 + losing * Math.max(0, willingness) * 1.6;
}

export interface FoulRollInput {
  rng: Rng;
  position: Position;
  /** The fighter who might foul. */
  actorPersonality: Personality;
  actorFatigue: number;
  actorMomentum: number;
  /** Seconds this exchange took, so the hazard scales with time rather than with call count. */
  seconds: number;
}

/**
 * Roll for a foul in one exchange.
 *
 * Returns the foul type, or `undefined` — which is the overwhelmingly common case, and has
 * to stay that way. Fouls are texture and occasional injustice, not a mechanic the fight
 * revolves around.
 */
export function rollFoul(input: FoulRollInput): FoulType | undefined {
  const { rng, position, actorPersonality, actorFatigue, actorMomentum, seconds } = input;

  const careless = carelessness(actorPersonality, actorFatigue);
  const desperate = desperation(actorPersonality, actorMomentum);
  // Normalised against a ~12-second exchange so exchange length does not change foul rates.
  const timeScale = seconds / 12;

  for (const type of FOUL_TYPES) {
    const meta = FOUL_META[type];
    if (!meta.positions.includes(position)) continue;

    const chance = meta.baseChance * careless * (meta.cynical ? desperate : 1) * timeScale;
    if (rng.chance(chance)) return type;
  }
  return undefined;
}

/**
 * What the referee does about it.
 *
 * `foulTolerance` is the whole of this function. A strict referee (low tolerance) warns on
 * sight and takes a point on the second offence; a permissive one misses fouls outright,
 * which is the mechanism behind "how did he not see that?" — a complaint the game should
 * absolutely be capable of generating.
 */
export function refereeRuling(input: {
  rng: Rng;
  referee: Referee;
  type: FoulType;
  /** How many fouls this fighter has already had *called* in this fight. */
  priorCalled: number;
}): FoulIncident['ruling'] {
  const { rng, referee, type, priorCalled } = input;
  const meta = FOUL_META[type];

  // Did the referee even see it? Severity and cynicism both make it harder to miss.
  const missBase = (referee.foulTolerance / 100) * 0.55;
  const conspicuous = meta.severity * 0.6 + (meta.cynical ? 0.3 : 0);
  if (rng.chance(clamp01(missBase * (1 - conspicuous)))) return 'unseen';

  // A disqualification needs a severe foul, a repeat offender and a strict official. It
  // should be rare enough that seeing one is a story.
  if (
    meta.severity > 0.7 &&
    priorCalled >= 2 &&
    rng.chance(0.35 * (1 - referee.foulTolerance / 100))
  ) {
    return 'disqualification';
  }

  // Cynical fouls are punished on cheating, not on harm — a fence grab costs a point long
  // before an accidental eye poke of twice the severity does.
  // The subtracted constant is what makes a *first* foul essentially always a warning,
  // which is the single most important thing about this function: referees talk before they
  // take points, and a game where the first fence grab costs a point reads as a bug.
  const deductPressure =
    priorCalled * 0.34 + meta.severity * 0.45 + (meta.cynical ? 0.25 : 0) - 0.38;
  const strictness = 1.35 - (referee.foulTolerance / 100) * 0.9;

  return rng.chance(clamp01(deductPressure * strictness)) ? 'pointDeduction' : 'warning';
}

/**
 * Whether a foul ends the night without a result.
 *
 * Only possible once the fight is far enough along that a technical decision is not
 * available — before that the judges' cards stand, which the caller handles.
 */
export function rollNoContest(rng: Rng, type: FoulType, ruling: FoulIncident['ruling']): boolean {
  if (ruling === 'unseen') return false;
  return rng.chance(FOUL_META[type].noContestChance);
}

/**
 * How much of the recovery a fighter actually converts into being fresher.
 *
 * A five-minute break is not five minutes of rest — it is a fighter bent double while a
 * doctor asks questions. The `recovery` natural decides how much of it is worth having,
 * which gives that hidden stat a second visible consequence.
 */
export function recoveryBenefit(recoveryNatural: number, seconds: number): number {
  const share = clamp(seconds / 300, 0, 1);
  const quality = 0.35 + (recoveryNatural / 100) * 0.45;
  return share * quality;
}

/** Plain-language line for the play-by-play. */
export function describeFoul(
  type: FoulType,
  foulerName: string,
  fouledName: string,
  ruling: FoulIncident['ruling'],
): string {
  const meta = FOUL_META[type];
  switch (ruling) {
    case 'unseen':
      return `${foulerName} catches ${fouledName} with a ${meta.label} — and the referee misses it completely.`;
    case 'warning':
      return `${meta.label.charAt(0).toUpperCase() + meta.label.slice(1)} from ${foulerName}. The referee steps in and warns him.`;
    case 'pointDeduction':
      return `Another ${meta.label} from ${foulerName} — and that is a point. The referee has seen enough.`;
    case 'disqualification':
      return `${foulerName} lands a ${meta.label} and the referee waves it off. He is disqualified.`;
  }
}
