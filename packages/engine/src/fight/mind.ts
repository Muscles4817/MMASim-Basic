/**
 * The fighter's head: reading the man in front of him, and changing what he does about it.
 *
 * Doc 36 phases 2 and 4. Everything here reads `memory.ts`; the simulator asks it questions at the
 * moment of choosing or defending, and the corner writes into it between rounds.
 *
 * Three abilities, and each belongs to a different part of the fighter:
 *
 *  - **Reading** (`fightIq`). Seeing that the opponent leans on something and defending it a little
 *    better each time it comes. Built gradually from what he has actually seen, never as large as a
 *    drilled camp read (`PREP_MAX_BONUS`), and a dull fighter barely builds one at all. It is a read on
 *    *predictability*: a fighter who mixes it up is hard to read, and a one-trick fighter is read by
 *    anybody smart enough to look. That is the sport's oldest argument for being well-rounded.
 *  - **Adjusting** (`fightIq`, slowed by `ego`). Doing less of what keeps failing and more of what
 *    works — the in-cage half of what a corner does. A dull or arrogant fighter keeps shooting into
 *    a sprawl; a smart, coachable one stops after the third.
 *  - **Being coached** (`ego`, `discipline`, camp quality). Between rounds the corner reads the round
 *    and gives one instruction. Whether it is heard is the fighter.
 *
 * All of it is computed from counts on demand — nothing to update every exchange, nothing allocated.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Combatant } from './profile.js';
import type { ComboKey } from './style.js';
import type { Family } from './memory.js';
import type { RoundTally } from './scoring.js';

/** How much defensive edge a fully-formed in-fight read is worth. About half a drilled camp read. */
export const IN_FIGHT_READ_MAX = 0.2;

/** How much of a fighter's in-fight learning his `fightIq` allows, 0.1–1. */
function learning(c: Combatant): number {
  return remap(c.attrs.fightIq, 30, 95, 0.1, 1);
}

/** How familiar this defender is with this combination, 0–1, given his ability to learn it. */
export function patternFamiliarity(defender: Combatant, pattern: ComboKey): number {
  const seen = defender.mem.patternsSeen[pattern];
  if (seen <= 0) return 0;
  return clamp01((1 - Math.exp(-seen / 5)) * learning(defender));
}

export function notePattern(_actor: Combatant, defender: Combatant, pattern: ComboKey): void {
  defender.mem.patternsSeen[pattern]++;
}

/**
 * What share of an ordinary fighter's attempts each family makes up, so a read is a read on
 * *leaning* on something rather than on doing it at all. Everybody throws punches; a fighter who
 * throws nothing else is readable. Measured off the audit harness's even matchup and rounded.
 */
const ORDINARY_SHARE: Readonly<Partial<Record<Family, number>>> = {
  punch: 0.62,
  kick: 0.22,
  takedown: 0.08,
  clinchEntry: 0.06,
  submission: 0.4,
};

const READABLE: readonly Family[] = ['punch', 'kick', 'takedown', 'clinchEntry'];

/** The defensive bonus this fighter has earned tonight against a family of attack. */
export function inFightRead(defender: Combatant, family: Family): number {
  const seen = defender.mem.seen;
  const n = seen[family];
  if (n < 3) return 0;
  let total = 0;
  for (const f of READABLE) total += seen[f];
  const base = ORDINARY_SHARE[family];
  if (!base || total <= 0) return 0;
  // Leaning: 1 at an ordinary share, 2 at twice it. The read starts once he leans a little.
  const lean = n / total / base;
  const predictable = clamp01((lean - 1.1) / 1.4);
  const exposure = 1 - Math.exp(-n / (family === 'punch' ? 30 : 6));
  return IN_FIGHT_READ_MAX * learning(defender) * predictable * exposure;
}

/** How often each family succeeds for an ordinary fighter, as the yardstick for "not working". */
const ORDINARY_SUCCESS: Readonly<Partial<Record<Family, number>>> = {
  punch: 0.52,
  kick: 0.5,
  takedown: 0.5,
  clinchEntry: 0.55,
};

/**
 * How much a fighter has moved off what he planned in this family, on his own, tonight.
 *
 * Needs a few attempts before it moves at all, and moves both ways: three stuffed shots make a
 * smart fighter shoot less, three landed make him shoot more. Ego slows it — the arrogant fighter
 * keeps trying to prove the thing he came to do.
 */
export function selfAdjustment(c: Combatant, family: Family): number {
  const m = c.mem;
  const tried = m.tried[family];
  if (tried < 3) return 1;
  const ordinary = ORDINARY_SUCCESS[family] ?? 0.5;
  const rate = (m.landed[family] + ordinary * 2) / (tried + 2);
  const adapt = learning(c) * remap(c.fighter.personality.ego, 20, 95, 1, 0.45);
  return clamp(1 + adapt * clamp((rate - ordinary) / ordinary, -0.7, 0.7), 0.45, 1.6);
}

/** What the plan, the corner and the fighter's own adjustments together make of a family. */
export function familyLean(c: Combatant, family: Family): number {
  return c.mem.lean[family] * selfAdjustment(c, family);
}

// --- The corner -------------------------------------------------------------------------------

export interface CornerAdvice {
  text: string;
  /** Whether the fighter took it on board. */
  heard: boolean;
}

/**
 * One instruction between rounds, from what the corner saw.
 *
 * The corner reads the same evidence the judges do and the fighter's own ledger, picks the single
 * most important thing, and says it. Coachability decides whether it lands: an egotist half-hears,
 * a disciplined fighter does it. A good camp (`campQuality`) reads the round better and is more
 * likely to say something useful at all.
 *
 * Mutates the fighter's leans and, for targeting, his own copy of the plan.
 */
export function cornerAdvice(
  rng: Rng,
  c: Combatant,
  opponent: Combatant,
  mine: RoundTally,
  theirs: RoundTally,
): CornerAdvice | undefined {
  const quality = clamp01(c.plan.campQuality);
  if (!rng.chance(0.35 + quality * 0.55)) return undefined;

  const p = c.fighter.personality;
  const coachable = clamp01(remap(100 - p.ego, 5, 80, 0.3, 1) * 0.7 + remap(p.discipline, 20, 95, 0.4, 1) * 0.3);
  const heard = rng.chance(coachable);
  const scale = heard ? 1 : 0.35;
  const name = c.fighter.lastName;
  const m = c.mem;
  const scoreOf = (t: RoundTally) => t.damageDealt + t.significantStrikes + t.controlSeconds * 0.15;
  const losing = scoreOf(theirs) > scoreOf(mine) * 1.25;

  const tdTried = m.roundTried.takedown;
  const tdLanded = m.roundLanded.takedown;
  const theirTd = opponent.mem.roundLanded.takedown;

  let text: string | undefined;
  const adjust = (family: Family, factor: number) => {
    m.lean[family] = clamp(m.lean[family] * (1 + (factor - 1) * scale), 0.3, 2.5);
  };

  if (tdTried >= 2 && tdLanded === 0) {
    text = `"Stop shooting from out there — he's seeing it coming. Set it up first."`;
    adjust('takedown', 0.6);
  } else if (theirTd >= 2) {
    text = `"Get your back off the fence and keep your hips back — he's living on those takedowns."`;
    adjust('clinchEntry', 0.75);
    adjust('rangeRetreat', 1.4);
    // Wrestling defence is not trainable between rounds; awareness is.
    m.lean.escape = clamp(m.lean.escape * (1 + 0.3 * scale), 0.3, 2.5);
  } else if (losing && c.attrs.wrestling >= opponent.attrs.takedownDefence + 8) {
    text = `"You're losing the standup. Change levels — take him down."`;
    adjust('takedown', 1.5);
  } else if (tdTried >= 2 && tdLanded / tdTried >= 0.6) {
    text = `"He can't stop the shot. Keep taking him down."`;
    adjust('takedown', 1.25);
  } else if (opponent.damage.legs >= 30 && c.attrs.kicking >= 55) {
    text = `"The leg is going. Keep chopping it."`;
    retarget(c, 'legs', 1 + 0.6 * scale);
  } else if (opponent.damage.body >= 30) {
    text = `"He's hurt to the body. Go downstairs."`;
    retarget(c, 'body', 1 + 0.6 * scale);
  } else if (losing && c.attrs.strikingOffence > opponent.attrs.strikingOffence) {
    text = `"Let your hands go! You're the better striker — stop waiting."`;
    adjust('punch', 1.25);
  } else if (!losing && scoreOf(mine) > scoreOf(theirs) * 1.5) {
    text = `"That's the round. Same again."`;
  }

  if (!text) return undefined;
  return {
    text: heard ? `In ${name}'s corner: ${text}` : `In ${name}'s corner: ${text} — but ${name} looks like they are not listening.`,
    heard,
  };
}

/** Shift the fighter's own copy of the plan's targeting toward a region. */
function retarget(c: Combatant, region: 'legs' | 'body', factor: number): void {
  const t = c.plan.targeting;
  const next = { head: t.head, body: t.body, legs: t.legs };
  next[region] *= factor;
  const sum = next.head + next.body + next.legs;
  c.plan = { ...c.plan, targeting: { head: next.head / sum, body: next.body / sum, legs: next.legs / sum } };
}

// --- Making the head visible -----------------------------------------------------------------

const READ_LINES: Partial<Record<Family, (me: string, him: string) => string>> = {
  takedown: (me, him) => `${me} is timing ${him}'s shot now — the sprawl is arriving before the shot does.`,
  punch: (me, him) => `${me} has ${him}'s hands figured out, slipping and making them miss.`,
  kick: (me) => `${me} is reading the kicks now, stepping out of range of every one.`,
  clinchEntry: (me, him) => `${me} sees ${him} coming for the clinch and is circling off before the tie-up.`,
};

const ABANDON_LINES: Partial<Record<Family, (me: string) => string>> = {
  takedown: (me) => `${me} has stopped shooting — the takedowns were not working.`,
  kick: (me) => `${me} has gone back to the hands; the kicks were not landing.`,
  clinchEntry: (me) => `${me} has given up on the tie-up.`,
};

/**
 * A line, once per family per fight, when a read has formed or a fighter has visibly given up on
 * something. What makes adjustment legible: without it, a smart fighter's learning happens and the
 * player never knows. Returns the text and records that it was told.
 */
export function adjustmentLine(defender: Combatant, attacker: Combatant, family: Family): string | undefined {
  const told = defender.mem.told[family];
  const readFormed = inFightRead(defender, family) >= IN_FIGHT_READ_MAX * 0.45;
  if (readFormed && told !== 'read' && told !== 'both') {
    defender.mem.told[family] = told === 'abandoned' ? 'both' : 'read';
    return READ_LINES[family]?.(defender.fighter.lastName, attacker.fighter.lastName);
  }
  const mine = attacker.mem.told[family];
  if (selfAdjustment(attacker, family) <= 0.72 && mine !== 'abandoned' && mine !== 'both') {
    attacker.mem.told[family] = mine === 'read' ? 'both' : 'abandoned';
    return ABANDON_LINES[family]?.(attacker.fighter.lastName);
  }
  return undefined;
}
