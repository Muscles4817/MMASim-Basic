/**
 * The open-stance matchup.
 *
 * Lives in its own module because it is consulted from two places that cannot import each other:
 * the landing contest in `simulate.ts`, and the range contest in `range.ts`.
 */

import { clamp01, remap } from '../core/math.js';
import type { Combatant } from './profile.js';

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

export function stanceEdge(actor: Combatant, target: Combatant): number {
  if (actor.fighter.stance !== 'southpaw') return 1;
  if (target.fighter.stance !== 'orthodox') return 1;
  const solved = clamp01(remap(target.attrs.fightIq, 40, 90, 0, 0.68));
  return 1 + STANCE_EDGE * (1 - solved);
}
