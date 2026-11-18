/**
 * What damage does to a fight beyond a number on a meter.
 *
 * The audit found that only head strikes could hurt or drop anybody (`knockdownHazard` returned 0
 * for every other target), that nothing broke during a fight, and that a fighter took every hurt
 * state the same way regardless of who he was (docs/reviews/19 §2, §7). Those are most of a fight's
 * stories: the liver shot that folds a man who was winning, the leg that stops holding him up, the
 * hand that breaks in the second round, the arm he refused to give up, the fighter who will not
 * stay down and the corner that saves him from himself.
 *
 * Everything here is *rare* by design and calibrated as a share of what already happens: body-shot
 * stoppages a few per cent of strike finishes, a broken hand in about one fight in a hundred. A
 * system that produced a story every fight would produce none.
 *
 * Doc 36 phase 3.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import { effect, fatiguedEffect, ratingEffect } from '../ratings/curve.js';
import { deriveRatings } from '../ratings/derived.js';
import type { AttributeKey } from '../ratings/attributes.js';
import { effectiveDurability, type Combatant } from './profile.js';
import type { StrikeOutcome } from './damage.js';
import type { Corner, FightEventKind, StrikeTarget, Weapon } from './types.js';
import type { SubmissionInjury } from './submissions.js';

// --- In-fight injuries --------------------------------------------------------------------

export const IN_FIGHT_INJURIES = [
  'hand',
  'foot',
  'rib',
  'eye',
  'elbow',
  'shoulder',
  'knee',
  'ankle',
  'neck',
] as const;
export type InFightInjuryKind = (typeof IN_FIGHT_INJURIES)[number];

export interface InFightInjury {
  kind: InFightInjuryKind;
  round: number;
  /** 0–1. How bad. Feeds both the in-fight penalty and the post-fight diagnosis. */
  severity: number;
}

/**
 * What an injury does for the rest of the fight, as the fraction of each attribute it takes at full
 * severity. A broken hand takes the hands; a knee taken in a heel hook takes the base.
 */
const INJURY_EFFECT: Readonly<Record<InFightInjuryKind, Partial<Record<AttributeKey, number>>>> = {
  hand: { strikingOffence: 0.22, power: 0.3 },
  foot: { kicking: 0.35, speed: 0.08 },
  rib: { cardio: 0.12, strikingDefence: 0.08, wrestling: 0.1, scrambling: 0.1 },
  eye: { strikingDefence: 0.16 },
  elbow: { strikingOffence: 0.15, power: 0.12, submissions: 0.15, groundControl: 0.1 },
  shoulder: { strikingOffence: 0.12, wrestling: 0.15, groundControl: 0.15, strength: 0.12 },
  knee: { kicking: 0.3, wrestling: 0.25, takedownDefence: 0.2, speed: 0.12, scrambling: 0.2 },
  ankle: { kicking: 0.2, speed: 0.1, scrambling: 0.12, takedownDefence: 0.1 },
  neck: { strength: 0.08, scrambling: 0.1 },
};

const INJURY_WORDS: Readonly<Record<InFightInjuryKind, string>> = {
  hand: 'shaking out the hand — something is wrong with it',
  foot: 'limping on the kicking foot',
  rib: 'holding the ribs between exchanges',
  eye: 'with one eye swelling shut',
  elbow: 'favouring the arm — that lock did damage',
  shoulder: 'with the shoulder hanging — that lock did damage',
  knee: 'unable to put weight on that leg properly',
  ankle: 'hobbling on a damaged ankle',
  neck: 'stiff in the neck after that crank',
};

export function hasInjury(c: Combatant, kind: InFightInjuryKind): boolean {
  for (const i of c.injuries) if (i.kind === kind) return true;
  return false;
}

/**
 * Give a fighter an injury for the rest of tonight. Mutates the combatant's own copy of his
 * attributes — `createCombatant` copies them for exactly this reason — and re-derives his ratings.
 */
export function injure(c: Combatant, kind: InFightInjuryKind, severity: number, round: number): boolean {
  if (hasInjury(c, kind)) return false;
  const s = clamp01(severity);
  c.injuries.push({ kind, round, severity: s });
  const eff = INJURY_EFFECT[kind];
  for (const key of Object.keys(eff) as AttributeKey[]) {
    c.attrs[key] = Math.max(1, Math.round(c.attrs[key] * (1 - (eff[key] ?? 0) * s)));
  }
  c.derived = deriveRatings(c.attrs);
  return true;
}

export function injuryText(c: Combatant, kind: InFightInjuryKind): string {
  return `${c.fighter.lastName} is ${INJURY_WORDS[kind]}.`;
}

/** The post-fight injury type each in-fight injury becomes. `health/injuries.ts` has no foot or elbow. */
export const POST_FIGHT_TYPE: Readonly<
  Record<InFightInjuryKind, 'hand' | 'knee' | 'shoulder' | 'rib' | 'cut' | 'ankle' | 'back'>
> = {
  hand: 'hand',
  foot: 'ankle',
  rib: 'rib',
  eye: 'cut',
  elbow: 'shoulder',
  shoulder: 'shoulder',
  knee: 'knee',
  ankle: 'ankle',
  neck: 'back',
};

export const SUB_INJURY: Readonly<Record<SubmissionInjury, InFightInjuryKind>> = {
  elbow: 'elbow',
  shoulder: 'shoulder',
  knee: 'knee',
  ankle: 'ankle',
  neck: 'neck',
};

// --- Story context ------------------------------------------------------------------------

export interface StoryContext {
  round: number;
  rng: Rng;
  emit: (
    kind: FightEventKind,
    text: string,
    corner?: Corner,
    emphasis?: 'minor' | 'major' | 'critical',
  ) => void;
}

// --- Body and legs ------------------------------------------------------------------------

/**
 * Per clean body shot, how often an average body shot from average power folds an average body.
 *
 * Sized so body-shot stoppages are a small share of strike finishes — the sport sees a liver-shot
 * finish every few cards, not every night — and so a fighter who invests in the body all fight
 * reaches the point where one more lands and he goes. The body damage term is what makes it an
 * *investment*: a fresh body almost never folds; the fortieth point of body damage is where it
 * starts to happen.
 */
const BODY_FOLD_BASE = 0.0022;
const BODY_WEAPON: Readonly<Record<Weapon, number>> = { punch: 1, kick: 1.7, knee: 1.8, elbow: 0.4 };

/** Leg damage at which a fighter stops being able to stand properly on the lead leg. */
const LEGS_COMPROMISED = 50;
/** And past which one more clean kick can end it. */
const LEGS_GONE = 76;

/**
 * Everything a landed strike sets off beyond its damage. Returns `'tko'` when the story ends the
 * fight; otherwise mutates the fighters and emits what the audience sees.
 */
export function afterStrikeStory(
  ctx: StoryContext,
  actor: Combatant,
  target: Combatant,
  strikeTarget: StrikeTarget,
  weapon: Weapon,
  result: StrikeOutcome,
): 'tko' | undefined {
  const { rng, emit } = ctx;

  if (strikeTarget === 'body' && !result.knockdown) {
    const power =
      fatiguedEffect(actor.attrs.power, 'power', actor.fatigue) ** 1.2 /
      ratingEffect(effectiveDurability(target), 'durability');
    const investment = 1 + (target.damage.body / 40) ** 2;
    const hazard = clamp01(
      BODY_FOLD_BASE * BODY_WEAPON[weapon] * power * result.flushness * investment * (target.hurtSeconds > 0 ? 1.5 : 1),
    );
    if (rng.chance(hazard)) {
      // He folds. Whether he gets back up is the composure and the conditioning.
      const recover = effect(target.attrs.composure, 0.9) * effect(target.attrs.cardio, 1.2) ** 0.5;
      const stayDown = clamp(0.45 - recover * 0.15 + (target.damage.body / 100) * 0.3, 0.1, 0.7);
      emit(
        'hurt',
        rng.pick([
          `${target.fighter.lastName} folds — that shot to the liver has taken everything out of them!`,
          `${target.fighter.lastName} doubles over from the body shot and turns away!`,
        ]),
        target.corner,
        'major',
      );
      if (rng.chance(stayDown)) return 'tko';
      target.hurtSeconds = Math.max(target.hurtSeconds, 9);
      target.fatigue = clamp01(target.fatigue + 0.08);
    }
    // The rib that cracks rather than the liver that shuts down.
    if (result.flushness >= 1.5 && target.damage.body > 45 && rng.chance(0.012 * BODY_WEAPON[weapon])) {
      if (injure(target, 'rib', 0.4 + rng.next() * 0.5, ctx.round)) {
        emit('note', injuryText(target, 'rib'), target.corner, 'minor');
      }
    }
  }

  if (strikeTarget === 'legs') {
    if (!target.legsCompromised && target.damage.legs >= LEGS_COMPROMISED) {
      target.legsCompromised = true;
      emit(
        'note',
        rng.pick([
          `${target.fighter.lastName}'s lead leg is buckling — those kicks are adding up.`,
          `${target.fighter.lastName} is limping now. ${actor.fighter.lastName} has chopped that leg down.`,
        ]),
        target.corner,
        'major',
      );
      // A compromised lead leg is the most common reason anybody switches stance in a fight.
      target.stanceSwitched = !target.stanceSwitched;
      emit('note', `${target.fighter.lastName} switches stance to protect the leg.`, target.corner);
    }
    if (target.damage.legs >= LEGS_GONE && result.flushness >= 1.2 && rng.chance(0.12)) {
      emit(
        'hurt',
        `${target.fighter.lastName} goes down off the leg kick — the leg simply will not hold them!`,
        target.corner,
        'critical',
      );
      return 'tko';
    }
  }

  if (strikeTarget === 'head') {
    // A hand breaks on a skull. The flusher the punch, the likelier — and a power puncher hits harder.
    if (
      weapon === 'punch' &&
      result.flushness >= 1.4 &&
      rng.chance(0.0016 * remap(actor.attrs.power, 40, 99, 0.7, 1.6))
    ) {
      if (injure(actor, 'hand', 0.35 + rng.next() * 0.6, ctx.round)) {
        emit('note', injuryText(actor, 'hand'), actor.corner, 'minor');
      }
    }
    // An eye closes once enough has landed around it.
    if (target.damage.head > 55 && result.flushness >= 1.2 && rng.chance(0.012)) {
      if (injure(target, 'eye', 0.5 + rng.next() * 0.5, ctx.round)) {
        emit('note', injuryText(target, 'eye'), target.corner, 'minor');
      }
    }
  }

  return undefined;
}


/**
 * A low kick that did not land cleanly may have been *checked* — shin into shin — and that costs the
 * kicker. A square Muay Thai stance checks most; a bladed one, whose lead leg is turned out, least.
 *
 * Returns true when it was checked, so the caller can narrate it.
 */
export function checkedKick(ctx: StoryContext, kicker: Combatant, checker: Combatant): boolean {
  const style = checker.style.stanceStyle;
  const base = style === 'square' ? 0.42 : style === 'bladed' ? 0.12 : style === 'crouched' ? 0.18 : 0.24;
  const skill = remap((checker.attrs.kicking + checker.attrs.strikingDefence) / 2, 30, 95, 0.6, 1.35);
  if (!ctx.rng.chance(clamp01(base * skill * (checker.legsCompromised ? 0.5 : 1)))) return false;
  kicker.damage.legs = clamp(kicker.damage.legs + 3 + ctx.rng.next() * 4, 0, 100);
  if (ctx.rng.chance(0.02)) {
    if (injure(kicker, 'foot', 0.4 + ctx.rng.next() * 0.5, ctx.round)) {
      ctx.emit('note', injuryText(kicker, 'foot'), kicker.corner, 'minor');
    }
  }
  return true;
}

/**
 * A lock the defender refused to give up. Survived, which is the point: the hold is gone and the
 * joint went with it. Refusing to tap is a personality — resilience and ego — as much as a defence.
 */
export function survivedLock(
  ctx: StoryContext,
  defender: Combatant,
  injury: SubmissionInjury | undefined,
  edge: number,
): void {
  if (!injury) return;
  const p = defender.fighter.personality;
  const stubborn = remap((p.resilience + p.ego) / 2, 20, 95, 0.6, 1.5);
  if (!ctx.rng.chance(clamp01(0.06 * edge * stubborn))) return;
  const kind = SUB_INJURY[injury];
  if (injure(defender, kind, 0.3 + ctx.rng.next() * 0.6, ctx.round)) {
    ctx.emit('note', injuryText(defender, kind), defender.corner, 'major');
  }
}

// --- Character under fire -----------------------------------------------------------------

/** What a hurt fighter does when the other man comes for him. */
export type SurvivalRoute = 'tieUp' | 'shoot' | 'shell' | 'fireBack' | 'run';

/**
 * Chosen by who he is, not by what is optimal. A composed veteran grabs a leg or a body; an
 * aggressive, rattled one throws back; a frightened one covers up — which is the route most likely
 * to get the fight stopped, because the referee is watching for exactly that.
 */
export function survivalRoute(rng: Rng, c: Combatant): SurvivalRoute {
  const p = c.fighter.personality;
  const comp = c.attrs.composure;
  const iq = c.attrs.fightIq;
  const weights: Record<SurvivalRoute, number> = {
    tieUp: remap(c.derived.clinchOffence, 30, 90, 0.3, 1.3) * remap(comp, 30, 95, 0.6, 1.4),
    shoot: remap(c.attrs.wrestling, 30, 90, 0.05, 1.2) * remap(iq, 30, 95, 0.6, 1.3),
    shell: remap(100 - comp, 5, 70, 0.3, 1.4),
    fireBack: remap(p.aggression, 20, 95, 0.2, 1.5) * remap(100 - comp, 5, 70, 0.6, 1.3),
    run: remap(c.attrs.speed, 30, 90, 0.2, 1) * remap(iq, 30, 95, 0.5, 1.2) * (c.legsCompromised ? 0.3 : 1),
  };
  return rng.pickWeighted(['tieUp', 'shoot', 'shell', 'fireBack', 'run'] as const, (k) => weights[k]);
}

/**
 * A second wind: the fighter who was losing badly and comes out of the corner different.
 *
 * Once a fight, and only for fighters with the heart for it. It does not undo damage — nothing
 * does — it gives back some of the tank and all of the belief, which is what a rally is.
 */
export function maybeSecondWind(ctx: StoryContext, c: Combatant, lostRound: boolean): void {
  if (c.secondWindUsed || !lostRound || c.momentum > -0.15) return;
  const p = c.fighter.personality;
  const heart = remap((p.resilience * 2 + c.attrs.composure) / 3, 30, 95, 0.01, 0.18);
  if (!ctx.rng.chance(heart)) return;
  c.secondWindUsed = true;
  c.fatigue = clamp01(c.fatigue - 0.07);
  c.momentum = 0.25;
  c.planIntegrity = Math.min(1, c.planIntegrity + 0.2);
  ctx.emit(
    'note',
    ctx.rng.pick([
      `${c.fighter.lastName} comes out of the corner like a different fighter — a second wind!`,
      `Something has changed in ${c.fighter.lastName}. They are walking forward again.`,
    ]),
    c.corner,
    'major',
  );
}

/**
 * The corner pulls him out between rounds. Rare, and mostly a mercy: a fighter who has been dropped
 * repeatedly, whose face is ruined, or whose leg is gone. A stubborn fighter's corner has a harder
 * conversation — the fighter's resilience argues against it.
 */
export function cornerStops(rng: Rng, c: Combatant): boolean {
  const head = Math.max(0, c.damage.head - 62) / 38;
  const drops = c.knockdownsSuffered >= 3 ? 0.5 : c.knockdownsSuffered === 2 ? 0.15 : 0;
  const legs = c.damage.legs >= LEGS_GONE ? 0.35 : 0;
  const hurts = c.injuries.reduce((s, i) => s + (i.kind === 'hand' || i.kind === 'eye' ? 0 : i.severity * 0.25), 0);
  const risk = head * 0.45 + drops + legs + hurts;
  if (risk <= 0.05) return false;
  const stubborn = remap(c.fighter.personality.resilience, 20, 95, 1.3, 0.55);
  return rng.chance(clamp01(risk * 0.09 * stubborn));
}
