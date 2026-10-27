/**
 * How a career goes, beyond how old the fighter is. Doc 34 C5.
 *
 * Development read every fighter off one curve: the same learning rate at the same age, scaled by
 * gym, coach and temperament. That produced a sport in which nobody broke out and nobody stalled.
 * Every prospect rated 70 at 23 was rated about the same at 27 as every other one, and the only
 * way a fighter surprised anybody was in the cage. Real careers do not look like that. A fighter
 * has a year in which everything clicks, or a year in which nothing does. Some learn faster than
 * their tools suggest, and some never quite turn talent into skill.
 *
 * Two pieces, both derived and neither stored:
 *  - **pace**: how fast this person learns, for a whole career. Lognormal around 1, so the
 *    population's mean rate is unchanged.
 *  - **the year**: most years are ordinary. About one in twelve is a breakout and about one in
 *    twelve stalls. The roll is keyed to the fighter and their age in whole years, so a breakout
 *    lasts the year and cannot be rerolled by asking again.
 *
 * Keyed on the fighter's id through `createRng` rather than drawn from the caller's stream, so
 * adding it moves no other draw in the simulation.
 */

import { ageOn, type GameDay } from '../core/clock.js';
import { createRng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';
import { learningRate, mileageYears, peakAgeOf } from './development.js';

export type TrajectoryPhase = 'breakout' | 'stalled' | 'steady';

export interface Trajectory {
  /** This fighter's career-long learning pace, around 1. */
  pace: number;
  /** What this year of their career is. */
  phase: TrajectoryPhase;
  /** The multiplier on training this year: pace × the year. */
  rate: number;
}

/** The spread of career pace. 0.2 puts nine in ten fighters between roughly 0.7× and 1.35×. */
const PACE_SD = 0.2;
export const BREAKOUT_CHANCE = 0.08;
export const STALL_CHANCE = 0.08;
const BREAKOUT_RATE = 2;
const STALL_RATE = 0.35;
/**
 * An ordinary year, set so that the mean over all years is 1 and the trajectories add variation
 * without moving the population: 0.08 × 2 + 0.08 × 0.35 + 0.84 × 0.975 = 1.007, and the pace has
 * a mean of exactly 1. Retune any of these four together, or the trajectories start moving the
 * whole sport's development rate rather than only spreading it.
 */
const STEADY_RATE = 0.975;

export function trajectoryOf(fighter: Pick<Fighter, 'id' | 'birthDay'>, day: GameDay): Trajectory {
  const id = fighter.id as string;
  // Lognormal with mean 1: exp(N(0, σ) − σ²/2).
  const pace = Math.exp(createRng(`trajectory:${id}`).normal() * PACE_SD - PACE_SD ** 2 / 2);
  const year = Math.floor(ageOn(fighter.birthDay, day));
  const roll = createRng(`trajectory:${id}:${year}`).next();
  const phase: TrajectoryPhase =
    roll < BREAKOUT_CHANCE
      ? 'breakout'
      : roll < BREAKOUT_CHANCE + STALL_CHANCE
        ? 'stalled'
        : 'steady';
  const yearRate =
    phase === 'breakout' ? BREAKOUT_RATE : phase === 'stalled' ? STALL_RATE : STEADY_RATE;
  return { pace, phase, rate: pace * yearRate };
}

// --- What a scout sees ------------------------------------------------------------------------

export type DevelopmentTrendId = 'improvingFast' | 'improving' | 'plateaued' | 'slipping';

export interface DevelopmentTrend {
  id: DevelopmentTrendId;
  /** For a chip: "Improving fast". */
  label: string;
  /** For the scouting sentence. */
  sentence: string;
}

const TREND: Readonly<Record<DevelopmentTrendId, Omit<DevelopmentTrend, 'id'>>> = {
  improvingFast: {
    label: 'Improving fast',
    sentence: 'Getting better quickly — whatever they were last year, they are more now.',
  },
  improving: { label: 'Still improving', sentence: 'Still adding to their game.' },
  plateaued: {
    label: 'Plateaued',
    sentence: 'They look about the same as they did a year ago.',
  },
  slipping: {
    label: 'Slipping',
    sentence: 'The body is starting to give ground, and the skills are not making it back.',
  },
};

/**
 * Which way a fighter is heading: the read a scout gets from watching them train and fight over a
 * year, not from a single tape. Doc 34 C5.
 *
 * Read off the same things that move them: the age against their own peak (with the body's
 * mileage, the way `applyAgeing` reads it), how fast someone of that age still learns, and this
 * fighter's trajectory this year.
 */
export function developmentTrend(fighter: Fighter, day: GameDay): DevelopmentTrend {
  const age = ageOn(fighter.birthDay, day);
  const worn = age + mileageYears(fighter, day);
  const peak = peakAgeOf(fighter.naturals.ageCurve);
  const pace = trajectoryOf(fighter, day).rate * learningRate(age, fighter.naturals.ageCurve);

  const id: DevelopmentTrendId =
    worn >= peak + 5
      ? 'slipping'
      : pace >= 1.6 && worn < peak
        ? 'improvingFast'
        : worn >= peak + 1 || pace < 0.6
          ? 'plateaued'
          : 'improving';
  return { id, ...TREND[id] };
}
