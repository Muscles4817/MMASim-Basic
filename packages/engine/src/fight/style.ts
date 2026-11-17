/**
 * What a fighter has *drilled*: the repertoire that turns ratings into a particular person.
 *
 * Ratings say how good somebody is at a family of things. They do not say which jab-cross-hook a
 * boxer throws when he is tired, that this jiu-jitsu black belt finishes with the arm-triangle and
 * that one with the heel hook, or that a Muay Thai fighter stands square and a karateka stands
 * side-on. Two fighters with identical numbers should still fight like two people, and before this
 * they could not (docs/reviews/19 §1, §5, §6).
 *
 * **Derived, never required.** `styleOf` builds a full profile from attributes, background and
 * traits, deterministically per fighter. `Fighter.style` may override any part of it — an authored
 * fighter whose signature is known, or a camp that drilled a new weapon — and the override is the
 * only thing a save ever stores. A save with no style field plays exactly as derived.
 *
 * **It never makes anybody better.** Every weight here is a *preference*: it moves what a fighter
 * reaches for, and every contest it leads to is still decided on ratings. A bigger submission
 * weight on the heel hook is a fighter who attacks heel hooks, not a fighter who finishes them.
 * The one exception is *familiarity* — a drilled technique is executed a little cleaner — and that
 * is bounded and level-neutral by construction (see `familiarity`).
 *
 * Doc 36 phase 1.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import { createRng } from '../core/rng.js';
import type { Fighter } from '../domain/fighter.js';
import { hasTrait } from '../domain/traits.js';
import { SUBMISSIONS, SUBMISSION_KEYS, type SubmissionKey } from './submissions.js';

// --- Stance styles ------------------------------------------------------------------------

/**
 * How a fighter stands, as distinct from which foot leads.
 *
 * `Fighter.stance` is orthodox/southpaw/switch — which side. This is *shape*, and every shape buys
 * something and costs something, which is the whole point (doc 36 phase 8):
 *
 *  - `standard` — the neutral MMA stance. No modifiers.
 *  - `bladed`   — side-on, karate/taekwondo. Long, linear, hard to reach; the lead leg is a sitting
 *                 target for calf kicks and the hips are turned away from a sprawl.
 *  - `square`   — Muay Thai. Checks kicks and lives in the clinch; the centre line is open to a jab
 *                 and a straight right, and it is easy to level-change under.
 *  - `crouched` — the wrestler's stance. Low hips, great takedown defence and a short route to the
 *                 legs; the head is low and uppercuts and knees find it.
 */
export const STANCE_STYLES = ['standard', 'bladed', 'square', 'crouched'] as const;
export type StanceStyle = (typeof STANCE_STYLES)[number];

// --- Combinations -------------------------------------------------------------------------

/**
 * The striking patterns a fighter has drilled.
 *
 * A pattern is a short sequence of shot *shapes*; `combos.ts` turns it into weapons and targets and
 * gives each link its setup bonus. The list is deliberately the sport's bread and butter rather
 * than a catalogue of named techniques — the narrator names the punches, the pattern says why the
 * second one landed.
 */
export const COMBO_KEYS = [
  /** Jab, then the right hand behind it. The first combination anybody learns. */
  'oneTwo',
  /** Double jab — range-finding, and a pressure fighter's walk-in. */
  'doubleJab',
  /** One-two-hook: the right hand opens the hook on the other side. */
  'oneTwoHook',
  /** Hook to the body, hook to the head: the guard comes down for the first. */
  'bodyHead',
  /** Hands upstairs to raise the guard, then the body. */
  'headBody',
  /** Punches to a low kick: the Dutch finish. */
  'punchesToKick',
  /** A kick first, then hands as they reset their feet. */
  'kickToPunches',
  /** A feint and the real shot behind it. Smart fighters' favourite pattern. */
  'feintShot',
  /** Feint the strike, change levels — the striking setup to a takedown. */
  'strikeToShot',
  /** Single heavy shot: the power puncher's one-and-done. */
  'single',
] as const;
export type ComboKey = (typeof COMBO_KEYS)[number];

// --- Clinch games -------------------------------------------------------------------------

/** What a fighter does once he has hold of somebody standing. Doc 36 phase 7. */
export const CLINCH_GAMES = ['thai', 'dirtyBoxing', 'greco', 'standard'] as const;
export type ClinchGame = (typeof CLINCH_GAMES)[number];

// --- The profile --------------------------------------------------------------------------

export interface StyleProfile {
  stanceStyle: StanceStyle;
  /** Relative preference over combination patterns. Not normalised; read as weights. */
  combos: Readonly<Record<ComboKey, number>>;
  /** Relative preference over submissions. Absent keys are never chosen. */
  subs: Readonly<Partial<Record<SubmissionKey, number>>>;
  /** The submission this fighter is known for, if any. Weighted heavily in `subs` already. */
  signatureSub?: SubmissionKey;
  /** The pattern this fighter is known for, if any. */
  signatureCombo?: ComboKey;
  clinchGame: ClinchGame;
  /**
   * 0–1. How much of a leg-lock game this fighter has. Gates the `legEntangle` entries entirely:
   * a wrestler with 80 submissions does not dive on heel hooks because the number is high.
   */
  legLocks: number;
  /**
   * 0–1. How much of his wrestling is *linked*: re-shots off a sprawl, single to double, mat
   * returns. Doc 36 phase 5.
   */
  chainWrestling: number;
  /** 0–1. Comfort switching stance on purpose. Separate from `Fighter.stance === 'switch'`, which is identity. */
  stanceSwitching: number;
}

/** What a stored override may set. Anything absent is derived. */
export type StyleOverride = Partial<StyleProfile>;

/**
 * Derive the full repertoire for a fighter.
 *
 * Memoised per fighter object: the simulator calls this once per fight, the UI may call it on every
 * render, and a fighter is immutable data in this engine (a change is a new object).
 */
export function styleOf(fighter: Fighter): StyleProfile {
  const hit = CACHE.get(fighter);
  if (hit) return hit;
  const derived = deriveStyle(fighter);
  const o = fighter.style;
  const merged: StyleProfile = o
    ? {
        ...derived,
        ...o,
        combos: { ...derived.combos, ...(o.combos ?? {}) },
        subs: { ...derived.subs, ...(o.subs ?? {}) },
      }
    : derived;
  // A named signature always carries the weight that makes it a signature.
  if (o?.signatureSub) {
    merged.subs = { ...merged.subs, [o.signatureSub]: Math.max(merged.subs[o.signatureSub] ?? 0, SIGNATURE_WEIGHT) };
  }
  if (o?.signatureCombo) {
    merged.combos = {
      ...merged.combos,
      [o.signatureCombo]: Math.max(merged.combos[o.signatureCombo], SIGNATURE_WEIGHT),
    };
  }
  CACHE.set(fighter, merged);
  return merged;
}

const CACHE = new WeakMap<Fighter, StyleProfile>();

/** How heavily a signature is weighted against an ordinary preference of about 1. */
const SIGNATURE_WEIGHT = 3.5;

function deriveStyle(f: Fighter): StyleProfile {
  const a = f.attributes;
  const disc = f.background?.discipline;
  const second = f.background?.secondary;
  const art = (d: string) => disc === d || second === d;
  // Per-fighter idiosyncrasy. Two fighters with identical numbers still drilled different things.
  const rng = createRng(`style:${f.id}`);
  const quirk = () => 0.75 + rng.next() * 0.5;

  const hands = a.strikingOffence;
  const feet = a.kicking;

  // ---- Stance style
  let stanceStyle: StanceStyle = 'standard';
  if (art('karate')) stanceStyle = 'bladed';
  else if (art('kickboxing')) stanceStyle = 'square';
  else if (art('wrestling') && a.wrestling >= 60) stanceStyle = 'crouched';
  else if (!disc) {
    // No recorded background: read it off the numbers, conservatively. Most fighters are standard.
    if (a.wrestling >= 75 && a.wrestling > hands + 12) stanceStyle = 'crouched';
    else if (feet >= 72 && feet > hands + 8 && a.strikingDefence >= 60) stanceStyle = 'bladed';
    else if (feet >= 70 && a.strength >= 65 && feet >= hands) stanceStyle = 'square';
  }

  // ---- Combos
  const iq = a.fightIq;
  const w = (x: number) => clamp(x, 0.05, 3) * quirk();
  const combos: Record<ComboKey, number> = {
    oneTwo: w(remap(hands, 30, 90, 0.6, 1.6)),
    doubleJab: w(remap(hands, 30, 90, 0.3, 0.9) * (art('boxing') ? 1.4 : 1)),
    oneTwoHook: w(remap(hands, 40, 95, 0.2, 1.3) * (art('boxing') ? 1.5 : 1)),
    bodyHead: w(remap((hands + iq) / 2, 40, 90, 0.2, 1.1) * (art('boxing') ? 1.3 : 1)),
    headBody: w(remap((hands + iq) / 2, 40, 90, 0.2, 0.9)),
    punchesToKick: w(remap(feet, 35, 95, 0.1, 1.5) * (art('kickboxing') ? 1.6 : 1)),
    kickToPunches: w(remap(feet, 35, 95, 0.1, 1.0) * (art('karate') ? 1.4 : 1)),
    feintShot: w(remap(iq, 40, 95, 0.1, 1.3)),
    strikeToShot: w(remap(a.wrestling - 20, 20, 80, 0.05, 1.2)),
    single: w(remap(a.power, 50, 99, 0.3, 1.4)),
  };
  if (hasTrait(f.traits, 'headhunter')) combos.single *= 1.3;
  if (hasTrait(f.traits, 'volumeMachine')) {
    combos.oneTwoHook *= 1.4;
    combos.single *= 0.6;
  }
  const signatureCombo = argmaxStable(combos, 1.35);

  // ---- Submissions
  const legLocks = clamp01(
    (art('jiuJitsu') ? 0.35 : 0) +
      remap(a.submissions, 55, 95, 0, 0.45) * (art('wrestling') ? 0.4 : 1) +
      (rng.next() < 0.25 ? 0.2 : 0),
  );
  const subs: Partial<Record<SubmissionKey, number>> = {};
  for (const key of SUBMISSION_KEYS) {
    const meta = SUBMISSIONS[key];
    let weight = meta.commonness;
    if (meta.family === 'leg') weight *= legLocks * 2.2;
    // Technical submissions are attacked by technicians; pressure chokes by strong top players.
    weight *= remap(meta.technicality, 0.3, 1, 1, 0.3 + clamp01((a.submissions - 30) / 60) * 1.4);
    if (meta.fromTop.length > 0 && meta.fromBottom.length === 0) {
      weight *= remap(a.groundControl - a.scrambling, -30, 30, 0.7, 1.3);
    }
    if (meta.fromBottom.length > 0 && meta.fromTop.length === 0) {
      weight *= remap(a.scrambling - a.groundControl, -30, 30, 0.7, 1.3);
    }
    if (meta.frontHeadlock && (art('wrestling') || a.wrestling >= 70)) weight *= 1.3;
    if (key === 'darce' || key === 'anaconda') weight *= art('wrestling') ? 1.5 : 1;
    if (art('judo') && (key === 'armbar' || key === 'kimura')) weight *= 1.4;
    if (weight > 0.01) subs[key] = weight * quirk();
  }
  // A real specialist has a signature: one hold above the rest, and sometimes an odd one.
  let signatureSub: SubmissionKey | undefined;
  if (a.submissions >= 68) {
    const pool = SUBMISSION_KEYS.filter((k) => (subs[k] ?? 0) > 0);
    signatureSub = rng.pickWeighted(pool, (k) => (subs[k] ?? 0) ** 1.5);
    subs[signatureSub] = Math.max(subs[signatureSub] ?? 0, SIGNATURE_WEIGHT * remap(a.submissions, 68, 95, 0.7, 1.2));
  }

  // ---- Clinch game
  let clinchGame: ClinchGame = 'standard';
  if (art('kickboxing') || (feet >= 70 && a.strength >= 62 && !art('wrestling'))) clinchGame = 'thai';
  else if (art('wrestling') || art('judo') || a.wrestling >= 72) clinchGame = 'greco';
  else if (art('boxing') || (hands >= 72 && hands > feet + 10)) clinchGame = 'dirtyBoxing';

  // ---- Chain wrestling
  const chainWrestling = clamp01(
    remap(a.wrestling, 45, 92, 0, 0.7) * remap(a.cardio, 40, 90, 0.7, 1.15) +
      (hasTrait(f.traits, 'chainWrestler') ? 0.3 : 0) +
      (art('wrestling') ? 0.1 : 0),
  );

  // ---- Stance switching
  const stanceSwitching = clamp01(
    (f.stance === 'switch' ? 0.75 : 0.08) + remap(iq, 50, 95, 0, 0.15) + (art('karate') ? 0.1 : 0),
  );

  return {
    stanceStyle,
    combos,
    subs,
    signatureSub,
    signatureCombo,
    clinchGame,
    legLocks,
    chainWrestling,
    stanceSwitching,
  };
}

/** The key with the largest weight, but only if it clearly stands out. Otherwise no signature. */
function argmaxStable<K extends string>(weights: Readonly<Record<K, number>>, margin: number): K | undefined {
  let best: K | undefined;
  let bestW = 0;
  let second = 0;
  for (const k of Object.keys(weights) as K[]) {
    const v = weights[k];
    if (v > bestW) {
      second = bestW;
      bestW = v;
      best = k;
    } else if (v > second) second = v;
  }
  return best && bestW >= second * margin ? best : undefined;
}
