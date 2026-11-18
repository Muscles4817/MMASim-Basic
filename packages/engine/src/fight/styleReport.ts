/**
 * The repertoire, in words: what a player is told about how somebody fights.
 *
 * `style.ts` holds the numbers the simulator reads; none of them mean anything on a fighter screen.
 * This turns them into the handful of facts a scout would write down — how he stands and what that
 * costs him, what he throws, what he finishes with, what he does in the clinch — and, for a camp,
 * what drilling changed. Kept apart from `style.ts` because it names combinations and submissions,
 * and those modules already depend on it.
 *
 * Doc 36, surfacing the depth.
 */

import type { Fighter } from '../domain/fighter.js';
import { PATTERN_NAMES } from './combos.js';
import { styleOf, type ClinchGame, type ComboKey, type StanceStyle, type StyleProfile } from './style.js';
import { SUBMISSIONS } from './submissions.js';

export interface StanceDescription {
  label: string;
  /** What the shape buys. */
  pro: string;
  /** What it costs. */
  con: string;
}

export const STANCE_DESCRIPTIONS: Readonly<Record<StanceStyle, StanceDescription>> = {
  standard: {
    label: 'Standard MMA stance',
    pro: 'Balanced: ready to strike, sprawl or shoot.',
    con: 'No particular edge anywhere.',
  },
  bladed: {
    label: 'Bladed, side-on',
    pro: 'Long and linear, hard to reach and hard to time.',
    con: 'The lead leg eats calf kicks, and the hips are turned away from a sprawl.',
  },
  square: {
    label: 'Square, Muay Thai',
    pro: 'Checks kicks and lives in the clinch.',
    con: 'The centre line is open to the jab and right hand, and it is easy to shoot under.',
  },
  crouched: {
    label: "Crouched, wrestler's stance",
    pro: 'Low hips: hard to take down and a short route to the legs.',
    con: 'The head sits low, where uppercuts and knees find it.',
  },
};

export const CLINCH_DESCRIPTIONS: Readonly<Record<ClinchGame, { label: string; note: string }>> = {
  thai: { label: 'Thai clinch', note: 'Takes the plum and throws knees.' },
  dirtyBoxing: { label: 'Dirty boxing', note: 'Holds with one hand, punches with the other.' },
  greco: { label: 'Greco-Roman', note: 'Underhooks, pins to the fence, looks for trips.' },
  standard: { label: 'Ordinary', note: 'Ties up to stall or break away; no particular game there.' },
};

/** A 0–1 depth as a word, or `undefined` when there is nothing worth saying. */
function level(x: number): string | undefined {
  if (x >= 0.7) return 'Deep';
  if (x >= 0.45) return 'Solid';
  if (x >= 0.2) return 'Some';
  return undefined;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The strike patterns a fighter reaches for most, by name, signature first. */
function favouriteCombos(style: StyleProfile, n: number): ComboKey[] {
  return (Object.keys(style.combos) as ComboKey[])
    .filter((k) => k !== 'strikeToShot')
    .sort((a, b) => style.combos[b] - style.combos[a])
    .slice(0, n);
}

export interface StyleReport {
  stance: StanceDescription;
  /** Undefined unless switching is a real part of the game. */
  stanceSwitching?: string;
  signatureCombo?: string;
  /** What gets thrown most, by name. */
  favouriteCombos: string[];
  signatureSub?: string;
  /** The submissions attacked most, by name. */
  favouriteSubs: string[];
  clinch: { label: string; note: string };
  legLocks?: string;
  chainWrestling?: string;
}

export function describeFightingStyle(fighter: Fighter): StyleReport {
  const s = styleOf(fighter);
  const subs = (Object.keys(s.subs) as (keyof typeof s.subs)[])
    .sort((a, b) => (s.subs[b] ?? 0) - (s.subs[a] ?? 0))
    .slice(0, 3)
    .map((k) => SUBMISSIONS[k].label);
  const report: StyleReport = {
    stance: STANCE_DESCRIPTIONS[s.stanceStyle],
    favouriteCombos: favouriteCombos(s, 3).map((k) => capitalise(PATTERN_NAMES[k].replace(/^the /, ''))),
    favouriteSubs: subs.map(capitalise),
    clinch: CLINCH_DESCRIPTIONS[s.clinchGame],
  };
  const sw = level(s.stanceSwitching);
  if (sw) report.stanceSwitching = sw;
  if (s.signatureCombo) report.signatureCombo = capitalise(PATTERN_NAMES[s.signatureCombo].replace(/^the /, ''));
  if (s.signatureSub) report.signatureSub = capitalise(SUBMISSIONS[s.signatureSub].label);
  const legs = level(s.legLocks);
  if (legs) report.legLocks = legs;
  const chain = level(s.chainWrestling);
  if (chain) report.chainWrestling = chain;
  return report;
}

/**
 * What a camp drilled into the repertoire, as sentences. Empty when nothing moved that a player
 * would notice. Compares the profile before and after; drilling is small per camp by design, so a
 * pattern counts as "more his" on any increase.
 */
export function describeDrilling(before: Fighter, after: Fighter): string[] {
  const a = styleOf(before);
  const b = styleOf(after);
  const lines: string[] = [];
  const combo = (Object.keys(b.combos) as ComboKey[])
    .filter((k) => b.combos[k] > a.combos[k] + 1e-9)
    .sort((x, y) => b.combos[y] - a.combos[y] - (b.combos[x] - a.combos[x]))[0];
  if (combo) lines.push(`${capitalise(PATTERN_NAMES[combo].replace(/^the /, ''))} is more drilled now.`);
  if (b.signatureSub && b.signatureSub !== a.signatureSub) {
    lines.push(`The ${SUBMISSIONS[b.signatureSub].label} is the signature submission now.`);
  } else if (b.signatureSub && (b.subs[b.signatureSub] ?? 0) > (a.subs[b.signatureSub] ?? 0) + 1e-9) {
    lines.push(`The ${SUBMISSIONS[b.signatureSub].label} got sharper.`);
  }
  if (b.chainWrestling > a.chainWrestling + 1e-9) lines.push('The takedowns link together a little more.');
  return lines;
}
