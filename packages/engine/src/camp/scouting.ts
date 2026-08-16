/**
 * Scouting.
 *
 * The player never sees an opponent's true tendencies — they see a *report*, and the report
 * can be wrong. This is the mechanism that makes a coach worth hiring and makes preparation
 * a decision rather than a checkbox: with a weak scout you are choosing what to drill on
 * the basis of information that may be fiction.
 *
 * See docs/05-prep-and-camps.md.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { ReadKey, TendencyProfile } from '../domain/gameplan.js';
import { READ_KEYS, READ_META } from '../domain/gameplan.js';

export interface ScoutedRead {
  read: ReadKey;
  /** The report's estimate of how often the opponent does this, 0–1. May be wrong. */
  estimate: number;
  /** 0–1. How sure the camp is. Drives the confidence wording, not the accuracy. */
  confidence: number;
  /** Plain-language threat line for the report. */
  threat: string;
  counter: string;
}

export interface ScoutingReport {
  reads: readonly ScoutedRead[];
  /** 0–1. Overall accuracy of this report. Not shown to the player as a number. */
  accuracy: number;
  /** One-line summary the coach gives you. */
  summary: string;
}

/**
 * Produce a scouting report on an opponent.
 *
 * `scoutingSkill` is the coach's Scouting rating, 1–100. `footage` is how much tape exists —
 * a debutant with three regional fights is genuinely hard to prepare for, which is why
 * short-notice replacements are dangerous out of proportion to their ratings.
 */
export function scoutOpponent(
  truth: TendencyProfile,
  scoutingSkill: number,
  footage: number,
  rng: Rng,
): ScoutingReport {
  // Accuracy is dominated by the coach but capped by how much there is to watch.
  const skillTerm = clamp01(remap(scoutingSkill, 20, 95, 0.35, 0.97));
  const footageTerm = clamp01(remap(footage, 0, 15, 0.45, 1));
  const accuracy = clamp01(skillTerm * footageTerm);

  // Error scales inversely with accuracy: a poor report is not merely vaguer, it is wrong.
  const errorSd = (1 - accuracy) * 0.35;

  const reads: ScoutedRead[] = READ_KEYS.map((read) => {
    const actual = truth[read];
    const estimate = clamp01(actual + rng.normal() * errorSd);
    return {
      read,
      estimate,
      // Confidence deliberately tracks accuracy only *loosely*, and the two ranges overlap
      // heavily on purpose. A bad coach who is sure of himself is a real and dangerous
      // thing, and the player has to learn to distrust the confidence rather than read it
      // as a second accuracy rating. Weight the random term heavily enough that a weak
      // scout can genuinely present a wrong read as a certainty.
      confidence: clamp01(0.35 + accuracy * 0.35 + rng.range(0, 0.45)),
      threat: READ_META[read].threat,
      counter: READ_META[read].counter,
    };
  });

  reads.sort((a, b) => b.estimate - a.estimate);

  return { reads, accuracy, summary: summarise(accuracy, reads) };
}

function summarise(accuracy: number, reads: readonly ScoutedRead[]): string {
  const top = reads[0];
  if (!top) return 'No usable footage.';
  if (accuracy >= 0.8) {
    return `We have him figured out. ${top.threat.toLowerCase()} — that is where this fight is won.`;
  }
  if (accuracy >= 0.55) {
    return `Decent tape. Best guess is ${top.threat.toLowerCase()}, but he has looked different fight to fight.`;
  }
  return `Honestly? Not much to go on. ${top.threat} is a guess more than a read.`;
}

/**
 * How much footage exists on a fighter, in "fights worth of tape".
 *
 * Prior-record bouts count for less than fights the scout could actually watch closely.
 */
export function footageAvailable(proBouts: number, recentBouts: number): number {
  return clamp(proBouts * 0.3 + recentBouts * 1.2, 0, 20);
}

/**
 * Quality of a training camp, 0–1.
 *
 * Weeks matter with diminishing returns — a twelve-week camp is not twice a six-week one —
 * and a short-notice fight is genuinely punishing rather than a small modifier.
 */
export function campQuality(
  weeks: number,
  gymQuality: number,
  coachDevelopment: number,
  discipline: number,
): number {
  const timeTerm = clamp01(Math.sqrt(clamp(weeks, 0, 16) / 10));
  const facilityTerm = clamp01(remap(gymQuality, 20, 95, 0.5, 1));
  const coachTerm = clamp01(remap(coachDevelopment, 20, 95, 0.55, 1));
  const disciplineTerm = clamp01(remap(discipline, 10, 95, 0.6, 1.05));
  return clamp01(timeTerm * facilityTerm * coachTerm * disciplineTerm);
}

/**
 * How well a read can be drilled, 0–1.
 *
 * Falls off with the number of reads attempted: a camp that tries to prepare for six things
 * prepares properly for none of them. This is what makes the four-read cap meaningful even
 * before it binds.
 */
export function drillQuality(
  campQualityValue: number,
  readsAttempted: number,
  coachGamePlanning: number,
): number {
  const spread = 1 / (1 + Math.max(0, readsAttempted - 1) * 0.22);
  const coachTerm = clamp01(remap(coachGamePlanning, 20, 95, 0.5, 1));
  return clamp01(campQualityValue * spread * coachTerm);
}
