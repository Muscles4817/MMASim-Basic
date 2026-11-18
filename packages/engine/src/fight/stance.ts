/**
 * The open-stance matchup.
 *
 * Lives in its own module because it is consulted from two places that cannot import each other:
 * the landing contest in `simulate.ts`, and the range contest in `range.ts`.
 */

import { clamp01, remap } from '../core/math.js';
import type { Rng } from '../core/rng.js';
import type { Combatant } from './profile.js';
import type { Range, StrikeTarget, Weapon } from './types.js';

/**
 * The open-stance edge, as a multiplier on both contests a fight is decided in.
 *
 * `Fighter.stance` was stored, hand-authored on the real fighters in both seed rosters, rendered
 * on the fighter screen — and read by nothing at all (docs/19 §9c). A southpaw across from an
 * orthodox fighter is the one genuinely *discrete* physical matchup the data already carries, and
 * it is why §4 D6 refused `reachInches` the same treatment: reach has no contest to win until a
 * range concept exists, and a stance mismatch is a contest today.
 *
 * Three claims, and each is why the shape is what it is:
 *
 *  - **The edge is the southpaw's**, because the mechanism is unfamiliarity rather than geometry —
 *    roughly one fighter in seven leads with the other foot and has spent their whole life
 *    training against the other six, while the other six rarely train against them.
 *  - **A smart opponent solves it.** It is scaled down by the orthodox fighter's `fightIq`, from
 *    its full value at 40 to about a third at 90. An elite fighter adjusts inside a round; a dull
 *    one never does.
 *  - **A switch-stance fighter neither takes it nor gives it.** They are comfortable in both, and
 *    that comfort *is* the trait — it costs them the edge as well as sparing them it, which is
 *    what stops `switch` from being strictly the best stance to be generated with.
 *
 * The edge is spent in **two** contests, and the second is new. The note above about
 * `reachInches` — that reach "has no contest to win until a range concept exists" — turned out to
 * apply to the lead foot as well, and more sharply: where a southpaw and an orthodox fighter can
 * stand relative to one another *is* the southpaw matchup, at least as much as any individual
 * punch is. While the landing contest was the only channel in the engine, all of it had to be
 * expressed there. It no longer is, so it is not: `rangeChangeChance` consults this too.
 *
 * `STANCE_EDGE` is the magnitude docs/19 §3 called "the variable", and it was set by measurement
 * rather than by argument: **1.5 points of win rate against a dull orthodox opponent, 1.1 against
 * an average one and 0.5 against a smart one** over paired seeds. That target is the design
 * quantity. The constant is not — 6% was tried first and read 0.90 / 0.63 / 0.30, which is inside
 * the noise of anything cheaper than six thousand fights, and an edge nobody can measure is a
 * field that is still dead.
 *
 * 10% hit the target while the landing contest was the whole fight. Range diluted it, and the
 * measurement is worth recording because the *reason* is not obvious: adding the range contest
 * did not take anything away from the landing contest, but it added a second way for a fight to
 * be decided that a landing-contest edge has no purchase on, and a fixed edge on one channel of
 * two is worth less than the same edge on one channel of one. Measured over 12,000 paired fights
 * against the dull opponent: 1.33 points before range, 0.82 after, 0.93 once the range contest
 * consulted the stance as well. 14% reads 1.36 / 1.52 / 1.61 at 2,500 / 6,000 / 12,000 — the
 * original target, restored by retuning the constant rather than by inflating the mechanism.
 *
 * Retuning is safe here in a way it is not elsewhere in this engine. The edge cannot move the
 * population's outcome distribution, whatever the value: a stance mismatch is symmetric across the
 * roster, so it decides *who* wins rather than how fights end. That is the property that makes
 * this safe to tune and the reason it is allowed a number this size at all.
 */
const STANCE_EDGE = 0.14;

/**
 * Which foot leads *right now*. A fighter who has switched tonight — a chopped-up lead leg, or a
 * switch-hitter's choice (doc 36 phases 3 and 8) — stands the other way round.
 */
export function stanceNow(c: Combatant): 'orthodox' | 'southpaw' | 'switch' {
  const base = c.fighter.stance;
  if (!c.stanceSwitched || base === 'switch') return base;
  return base === 'orthodox' ? 'southpaw' : 'orthodox';
}

export function stanceEdge(actor: Combatant, target: Combatant): number {
  if (stanceNow(actor) !== 'southpaw') return 1;
  if (stanceNow(target) !== 'orthodox') return 1;
  const solved = clamp01(remap(target.attrs.fightIq, 40, 90, 0, 0.68));
  return 1 + STANCE_EDGE * (1 - solved);
}

// --- Stance styles (doc 36 phase 8) -----------------------------------------------------------

/**
 * What a stance *shape* buys and costs, as a multiplier on the defender's striking defence against
 * this shot. See `StanceStyle` in `style.ts` for the four shapes and why each trade is what it is.
 *
 * Every row has a pro and a con, and the magnitudes are small on purpose — a stance is a lean, not a
 * superpower, and the style it belongs to already lives in the fighter's ratings.
 */
export function stanceStyleDefence(
  defender: Combatant,
  weapon: Weapon,
  target: StrikeTarget,
  range: Range,
): number {
  switch (defender.style.stanceStyle) {
    case 'bladed':
      // Side-on: the head and body are far away down a straight line, and the lead leg is a gift.
      if (target === 'legs') return 0.72;
      if (weapon === 'punch' && range !== 'pocket') return 1.2;
      return 1;
    case 'square':
      // Squared up: kicks get checked (`checkedKick`) and the clinch is home, but the centre line is
      // open to the jab and the straight.
      if (weapon === 'punch' && target === 'head' && range !== 'pocket') return 0.82;
      if (weapon === 'kick') return 1.12;
      return 1;
    case 'crouched':
      // Low and wide: the body and legs are hard to find; the head is low and a kick or an uppercut finds it.
      if (target === 'body') return 1.15;
      if (weapon === 'kick' && target === 'head') return 0.75;
      if (weapon === 'punch' && target === 'head' && range === 'pocket') return 0.84;
      return 1;
    default:
      return 1;
  }
}

/** And against the takedown: the crouch sprawls best, a bladed stance turns its hips away worst. */
export function stanceStyleTakedownDefence(defender: Combatant): number {
  switch (defender.style.stanceStyle) {
    case 'crouched':
      return 1.3;
    case 'bladed':
      return 0.82;
    case 'square':
      return 0.9;
    default:
      return 1;
  }
}

/** The bladed stance's linear attack: kicks from the outside arrive sooner. */
export function stanceStyleOffence(actor: Combatant, weapon: Weapon, range: Range): number {
  if (actor.style.stanceStyle === 'bladed' && weapon === 'kick' && range === 'outside') return 1.08;
  if (actor.style.stanceStyle === 'crouched' && weapon === 'kick') return 0.9;
  return 1;
}

/**
 * Whether a fighter switches stance this exchange, on purpose.
 *
 * Two reasons, and only fighters comfortable doing it act on them (`stanceSwitching`): to *take*
 * the open-stance edge from an orthodox opponent by going southpaw, and to switch back once the
 * opponent has adjusted. A compromised lead leg is the third reason and is handled in `stories.ts`.
 */
export function wantsToSwitch(rng: Rng, c: Combatant, opponent: Combatant): boolean {
  const now = stanceNow(c);
  const opp = stanceNow(opponent);
  const gain = now === 'orthodox' && opp === 'orthodox' ? 1 : now === 'southpaw' && opp === 'southpaw' ? 0.6 : 0.25;
  const p =
    c.fighter.stance === 'switch' || c.legsCompromised ? 0 : c.style.stanceSwitching * 0.05 * gain;
  // One draw whatever the answer, so a switch-hitter and his mirror stay on the same random stream —
  // `stance.test.ts` compares them on paired seeds and requires them identical.
  return rng.next() < p;
}
