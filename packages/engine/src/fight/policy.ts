/**
 * The layer above the action menu: **why does this fighter want to do that?**
 *
 * Every decision in `simulate.ts` is an `rng.pickWeighted` over locally-reasonable actions, with
 * the weights built from attributes. That produces a fighter who is competent and has no plan,
 * and it produces exactly the defect this module was written for:
 *
 * > A striker with 32 submissions is put on his back. The bottom resolver offers stand-up,
 * > sweep and submission. Their weights come out near enough to each other that the draw picks
 * > the submission a fair share of the time. He hunts a guillotine he cannot finish, does not
 * > get up, and loses the round on control time — with the player's game plan sitting there
 * > saying *counter-strike*.
 *
 * Nothing about that is a *bad decision*. It is a fighter with **no decision to make**, because
 * intent was never in the room. `domain/tactics.ts` is the vocabulary for intent; this is where
 * it becomes behaviour.
 *
 * ### The rule
 *
 * > Never let a locally reasonable action override a strongly held strategic goal — unless the
 * > opportunity is genuinely exceptional.
 *
 * Both halves matter. The first half is what makes plans legible: a fighter who wants to be
 * standing should wall-walk, not settle. The second is what stops the first from producing
 * *stupid* instead of *coherent* — a man on his back with a fight-ending choke sitting there
 * takes the choke, plan or no plan, and a policy that cannot express that has replaced one
 * failure mode with a worse one.
 *
 * ### The shape
 *
 * Each candidate action gets an **alignment** in −1…+1: does doing this move me toward the fight
 * I am trying to have? That becomes a multiplier on the existing weight:
 *
 * ```
 *   bias = exp(alignment × STRENGTH × urgency)
 * ```
 *
 * Exponential rather than linear because the two ends must be *reciprocal*: at full urgency,
 * doubling the weight of the thing you want has to mean halving the thing you don't, or the
 * total keeps drifting and every plan quietly becomes "do more of everything". `exp` gives that
 * for free, and it cannot produce a negative weight.
 *
 * `urgency` is **derived, never a dial.** It is the plan's own conviction, scaled by whether
 * this fighter can actually execute a plan (discipline, fight IQ), by whether they have stopped
 * trying to (see `planIntegrity`), and by whether they are somewhere they did not choose to be.
 * A sixth slider reading "how much do you mean it?" is not a question anybody can answer.
 *
 * ### What this deliberately does not do
 *
 * It does not touch a single contest. Every takedown, strike, sweep and submission is still
 * resolved on attributes exactly as it was. A 25-wrestling fighter told to take the fight to the
 * floor now shoots constantly — and misses, and gets countered, and empties his tank. That is a
 * *failed game plan*, and it is the outcome this module exists to make possible: before it, the
 * engine quietly ignored him and produced a generic fight, so a plan that failed and a plan that
 * did not matter were indistinguishable.
 */

import { clamp, clamp01, remap } from '../core/math.js';
import { rangeChangeChance, rangeUrgencyScale, type RangeChange } from './range.js';
import { exitUrgency } from './decide.js';
import type {
  BottomIntent,
  PreferredState,
  SituationalResponse,
  Situation,
  TopIntent,
} from '../domain/tactics.js';
import { traitAdd } from '../domain/traits.js';
import type { Combatant } from './profile.js';
import type { Corner, GroundPosition, Range } from './types.js';

/**
 * How hard a fully-committed, fully-executed plan bends the action weights.
 *
 * At `urgency` 1 this makes a perfectly-aligned action **6.7× more likely** and a perfectly
 * opposed one **6.7× less** — a ratio of about 45 between the thing you came to do and the thing
 * you came to avoid. That is deliberately large: the complaint that produced this module was
 * that no plan changed any fight, and a timid constant reproduces it with more code.
 *
 * It is nonetheless bounded, and by three separate things. Real urgency rarely reaches 1
 * (`urgencyFor` multiplies four terms that are each below it), a suppressed action keeps its
 * exceptional-opportunity floor, and the *contest* the action leads to is untouched — so a plan
 * can make a fighter shoot every exchange and still not put anybody on the floor.
 */
const STRENGTH = 1.9;

/**
 * The alignment of every action a fighter can choose, against every fight they might want.
 *
 * Written as an explicit table rather than derived from some distance metric over states,
 * because MMA transitions are not a metric space and pretending otherwise would smuggle in
 * claims nobody checked. Every row is a sentence somebody could argue with, which is the point.
 *
 * Read a row as: *if this is the fight I want, how well does this action serve it?*
 */
export type StandingAction = 'strike' | 'kick' | 'takedown' | 'clinchUp';
export type HeldAction = 'breakAway' | 'clinchStrike' | 'reverse' | 'pummel';
export type ControllingAction = 'clinchTakedown' | 'clinchStrike' | 'clinchMaintain';

type Alignment = Readonly<Record<PreferredState, number>>;

const STANDING_ALIGNMENT: Readonly<Record<StandingAction, Alignment>> = {
  /*
   * These are *intent* weights and no longer the whole story about weapons.
   *
   * `range.ts` decides which strikes are suitable where, so a fighter at kicking range throws
   * kicks because he is at kicking range, not because his plan says so. What is left here is the
   * plan's own lean — what he reaches for when the range gives him a choice — which is why the
   * hands/feet split is much flatter than it was before range existed. Leaving it steep would
   * charge for the same preference twice.
   */
  strike: {
    outside: 0.15,
    boxing: 0.5,
    pocket: 0.7,
    clinch: 0.1,
    top: -0.25,
    submission: -0.3,
    adaptive: 0,
  },
  kick: {
    outside: 0.6,
    boxing: 0.2,
    pocket: -0.2,
    clinch: -0.45,
    top: -0.35,
    submission: -0.35,
    adaptive: 0,
  },
  takedown: {
    outside: -0.9,
    boxing: -0.75,
    pocket: -0.6,
    clinch: 0.15,
    top: 1,
    submission: 0.9,
    adaptive: 0,
  },
  clinchUp: {
    outside: -1,
    boxing: -0.7,
    pocket: -0.45,
    clinch: 1,
    top: 0.45,
    submission: 0.25,
    adaptive: 0,
  },
};

const HELD_ALIGNMENT: Readonly<Record<HeldAction, Alignment>> = {
  breakAway: {
    outside: 1,
    boxing: 0.9,
    pocket: 0.65,
    clinch: -1,
    top: -0.1,
    submission: -0.2,
    adaptive: 0,
  },
  clinchStrike: {
    outside: -0.35,
    boxing: -0.1,
    pocket: 0.25,
    clinch: 0.7,
    top: -0.15,
    submission: -0.2,
    adaptive: 0,
  },
  reverse: {
    outside: -0.4,
    boxing: -0.25,
    pocket: -0.1,
    clinch: 1,
    top: 0.7,
    submission: 0.4,
    adaptive: 0,
  },
  /*
   * Hand-fighting: the work a fighter does in a tie-up he wants no part of.
   *
   * Added with the transition split, and for the same reason `defend` was added underneath. Once
   * `breakAway` stopped competing for the same draw, the only things left in the held fighter's
   * in-state list were a short strike and a reversal — so an outside fighter whose break failed
   * *took over the clinch* 59% of the time, which is the opposite of what he was told and cost the
   * striking swing 1.6 points of win rate.
   *
   * Reversing a tie-up is a grappler's answer to being held. A striker's answer is to fight the
   * hands and force the referee to look at it, which is what this row says.
   */
  pummel: {
    outside: 0.9,
    boxing: 0.8,
    pocket: 0.5,
    clinch: -0.2,
    top: -0.15,
    submission: -0.2,
    adaptive: 0,
  },
};

const CONTROLLING_ALIGNMENT: Readonly<Record<ControllingAction, Alignment>> = {
  clinchTakedown: {
    outside: -0.6,
    boxing: -0.55,
    pocket: -0.5,
    clinch: -0.1,
    top: 1,
    submission: 0.85,
    adaptive: 0,
  },
  clinchStrike: {
    outside: -0.3,
    boxing: -0.05,
    pocket: 0.2,
    clinch: 1,
    top: -0.2,
    submission: -0.25,
    adaptive: 0,
  },
  /*
   * Pinning a man on the fence and keeping him there. Renamed from `clinchStall`, because what a
   * fighter *chooses* here is positional maintenance — a real thing to do with a tie-up — and
   * calling it stalling conflated it with the inactivity that arrives when other actions fail.
   * See doc 31 § D1.
   */
  clinchMaintain: {
    outside: -0.5,
    boxing: -0.45,
    pocket: -0.4,
    clinch: 0.55,
    top: -0.1,
    submission: -0.35,
    adaptive: 0,
  },
};

/**
 * On the floor, a different question governs.
 *
 * `preferredState` says *where you want the fight*; once the fight is already there, what
 * matters is `topIntent` / `bottomIntent` — the layer that says what you do having arrived.
 * Keeping them separate is what lets a wrestler who wants top position also be told to hunt
 * from it, or to sit on it, without those being different game plans.
 */
export type TopAction = 'advancePosition' | 'groundStrike' | 'submission' | 'maintainPosition';

export type BottomAction = 'standUp' | 'sweep' | 'submission' | 'defend';

const TOP_ALIGNMENT: Readonly<Record<TopAction, Readonly<Record<TopIntent, number>>>> = {
  advancePosition: { control: 0.15, groundAndPound: -0.2, advance: 1, submit: 0.5 },
  groundStrike: { control: 0.1, groundAndPound: 1, advance: -0.1, submit: -0.2 },
  submission: { control: -0.6, groundAndPound: -0.3, advance: 0.2, submit: 1 },
  /*
   * Riding the position. Renamed from `groundStall` for the reason above: a fighter who elects to
   * hold somebody down is doing something, and the residual inactivity that used to share this row
   * is produced by the failure branches of every other action instead.
   */
  maintainPosition: { control: 1, groundAndPound: -0.4, advance: -0.5, submit: -0.7 },
};

/**
 * Standing back up out of somebody's guard, and it is keyed on `preferredState` rather than on
 * `topIntent` — which is the whole reason it needed a table of its own.
 *
 * Everything else a fighter does on top is *in-state behaviour*, and in-state behaviour is what
 * `topIntent` is for. Getting off the floor is a **transition**, and transitions are answered by
 * where the fighter wants the fight, exactly as `breakAway` is in the clinch (docs/01 § 8). A
 * striker who wants the fight at range wants it at range whether he is standing over somebody or
 * not, and nothing in `topIntent`'s four values can say that.
 *
 * The negative rows matter as much as the positive ones. A fighter who came for top position does
 * not give it back because the option exists, and this is where that is stated.
 */
const TOP_EXIT: Alignment = {
  outside: 1,
  boxing: 0.85,
  pocket: 0.5,
  clinch: -0.35,
  top: -1,
  submission: -0.9,
  adaptive: 0,
};

const BOTTOM_ALIGNMENT: Readonly<Record<BottomAction, Readonly<Record<BottomIntent, number>>>> = {
  standUp: { standUp: 1, scramble: 0.5, playGuard: -0.6, recover: 0.15, attack: -0.5 },
  sweep: { standUp: -0.1, scramble: 1, playGuard: 0.2, recover: -0.35, attack: 0.2 },
  // The row this module exists for: a striker told to get up does not hunt a guillotine.
  submission: { standUp: -1, scramble: -0.2, playGuard: 0.7, recover: -0.8, attack: 1 },
  /*
   * Framing, hand-fighting, denying the pass — the in-state work that was missing entirely, and
   * without which "get up" had nothing to mean but "attempt an escape or do nothing".
   *
   * `recover` is its natural home and reads highest. `standUp` is positive because a fighter
   * working for the exit stays busy while he does it — that is the whole invariant. `attack` is
   * the only strongly negative column: a fighter hunting a finish off his back is not the one
   * playing it safe.
   */
  defend: { standUp: 0.35, scramble: 0.1, playGuard: 0.5, recover: 1, attack: -0.6 },
};

/**
 * How urgently a fighter wants to *leave* the floor at all, by bottom intent.
 *
 * Separate from the alignment table because it scales the whole bottom decision rather than
 * ranking within it: a guard player is not merely choosing differently from a wrestler
 * underneath, he is *less bothered*, and that shows up as a smaller bias in every direction.
 */
const BOTTOM_CONVICTION: Readonly<Record<BottomIntent, number>> = {
  standUp: 1,
  scramble: 0.8,
  playGuard: 0.85,
  recover: 0.7,
  attack: 0.95,
};

// --- Urgency -------------------------------------------------------------------------------

export interface Stance {
  desired: PreferredState;
  /** 0–1. How hard `bias` bends the weights right now. */
  urgency: number;
  /** The situational rule in force, if any. */
  response: SituationalResponse;
}

/**
 * How well this fighter executes a plan at all, before the fight has had its say.
 *
 * Two terms, and they are different questions. `adherence` is *will* — already computed on the
 * combatant from discipline and traits — and `comprehension` is *skill*: reading which moment
 * the plan was written for. A disciplined fighter with no fight IQ follows the plan into
 * situations it was not meant for; a smart undisciplined one knows better and does it anyway.
 */
function execution(c: Combatant): number {
  const comprehension = clamp(remap(c.attrs.fightIq, 30, 90, 0.55, 1), 0.4, 1);
  return clamp01(c.adherence) * comprehension;
}

/**
 * Whether the fighter is still fighting the fight they came to fight.
 *
 * The best structural thing in the design sketch this came from: *a natural brawler told to stay
 * outside sticks to it for three minutes, then gets clipped, then says fuck this.* `planIntegrity`
 * is that, as a number on the combatant — it erodes when they are hurt, badly behind or taking
 * damage, recovers slowly between rounds, and multiplies straight into urgency here.
 *
 * It is what stops a game plan being a costume. You can materially change what a fighter tries
 * to do; you cannot turn a brawler into a point fighter for fifteen minutes by picking a button.
 */
function urgencyFor(c: Combatant, stance: Omit<Stance, 'urgency'>, displaced: boolean): number {
  const base = c.plan.tactics.conviction;
  if (base <= 0) return 0;

  // Being put somewhere you did not choose is the sharpest version of wanting to leave it.
  // A fighter who *walked* into the clinch and one who was *put* there are not in the same
  // position, and the engine has always known which of them did it.
  const displacement = displaced ? 1.15 : 1;

  return clamp01(
    base * execution(c) * c.planIntegrity * displacement * responseScale(stance.response),
  );
}

/** Situational rules that change how hard the plan is pushed, rather than what it says. */
function responseScale(response: SituationalResponse): number {
  switch (response) {
    // Survival and discipline both mean "hold the shape you are in" — one from fear, one from
    // instruction — and both read as a firmer grip on the plan.
    case 'survive':
      return 1.2;
    case 'secureControl':
      return 1.15;
    case 'lowerRisk':
      return 1.1;
    // Chasing something means being willing to leave the plan to get it.
    case 'huntFinish':
      return 0.6;
    case 'raiseRisk':
      return 0.75;
    case 'forceGrappling':
      return 0.85;
    default:
      return 1;
  }
}

export interface SituationInput {
  /** True when this fighter is behind on the unofficial cards. */
  losing: boolean;
  /** True when they are ahead. */
  winning: boolean;
  /** Seconds left in the round. */
  secondsRemaining: number;
  hurt: boolean;
  opponentHurt: boolean;
}

/**
 * Which contingency is in force, in priority order.
 *
 * Ordered rather than blended because a corner does not say "you are slightly hurt and slightly
 * behind, so do 40% of one thing". Being badly hurt overrides everything; a hurt opponent
 * overrides the scorecards; the clock overrides nothing else.
 */
export function situationOf(input: SituationInput): Situation | undefined {
  if (input.hurt) return 'badlyHurt';
  if (input.opponentHurt) return 'opponentHurt';
  if (input.secondsRemaining <= 60) return 'finalMinute';
  if (input.losing) return 'losingRound';
  if (input.winning) return 'winningRound';
  return undefined;
}

/**
 * What this fighter is trying to do right now.
 *
 * The situational rules can *redirect* the plan, not merely scale it: told to force the
 * grappling when behind, a striker's desired state genuinely becomes the clinch for as long as
 * that holds. That is the difference between a contingency and a mood.
 */
export function stanceOf(
  c: Combatant,
  situation: Situation | undefined,
  displaced: boolean,
): Stance {
  const tactics = c.plan.tactics;
  const response = (situation && tactics.situational[situation]) ?? 'holdThePlan';

  let desired = tactics.preferredState;
  if (response === 'forceGrappling') desired = 'clinch';
  else if (response === 'survive' && desired !== 'submission') {
    // Surviving means getting out of range or getting hold of somebody, and the tie-up is the
    // one a hurt fighter can reach from anywhere.
    desired = 'clinch';
  }

  const partial: Omit<Stance, 'urgency'> = { desired, response };
  return { ...partial, urgency: urgencyFor(c, partial, displaced) };
}

// --- The bias itself -----------------------------------------------------------------------

/**
 * Turn an alignment into a weight multiplier, honouring the exception that keeps it sane.
 *
 * `opportunity` is 0–1 and describes how exceptional *this particular* chance is — not how good
 * the fighter is at it. At 1 the suppression is lifted entirely, which is the "unless there is a
 * good contextual reason" half of the rule. It never *adds* to an already-aligned action: a
 * wrestler does not shoot harder because a choke happened to be available.
 */
export function bias(alignment: number, urgency: number, opportunity = 0): number {
  if (urgency <= 0) return 1;
  const raw = Math.exp(clamp(alignment, -1, 1) * STRENGTH * urgency);
  if (raw >= 1) return raw;
  return raw + (1 - raw) * clamp01(opportunity);
}

export const standingBias = (stance: Stance, action: StandingAction, opportunity = 0): number =>
  bias(STANDING_ALIGNMENT[action][stance.desired], stance.urgency, opportunity);

export const heldBias = (stance: Stance, action: HeldAction, opportunity = 0): number =>
  bias(HELD_ALIGNMENT[action][stance.desired], stance.urgency, opportunity);

export const controllingBias = (
  stance: Stance,
  action: ControllingAction,
  opportunity = 0,
): number => bias(CONTROLLING_ALIGNMENT[action][stance.desired], stance.urgency, opportunity);

export const topBias = (c: Combatant, stance: Stance, action: TopAction, opportunity = 0): number =>
  bias(TOP_ALIGNMENT[action][c.plan.tactics.topIntent], stance.urgency, opportunity);

/** How much this plan wants the fight back on the feet, read from the top position. */
export const topExitBias = (stance: Stance): number => bias(TOP_EXIT[stance.desired], stance.urgency);

/**
 * The bottom of the fight, where the reported defect lived.
 *
 * Scaled by `BOTTOM_CONVICTION` on top of the shared urgency, because how much a fighter minds
 * being underneath is a property of their bottom game and not of their game plan's conviction:
 * a guard player and a wrestler both underneath are not equally unhappy about it.
 */
export const bottomBias = (
  c: Combatant,
  stance: Stance,
  action: BottomAction,
  opportunity = 0,
): number => {
  const intent = c.plan.tactics.bottomIntent;
  return bias(
    BOTTOM_ALIGNMENT[action][intent],
    stance.urgency * BOTTOM_CONVICTION[intent],
    opportunity,
  );
};

/**
 * What a top intent costs in position — the other half of choosing one.
 *
 * Without this, `groundAndPound` strictly dominated `control`: measured on identical fighters it
 * held top position for the same 336 seconds and landed 21.0 significant strikes against 13.6,
 * for a **63.3% win rate against 53.3%**. A menu option that is never right is worse than no
 * menu, and the reason it happened is that the engine let a fighter posture up and hit without
 * charging him for it.
 *
 * Posturing up to punch is how you get swept, and reaching for an arm is how you lose the back.
 * Returns a multiplier on how well this fighter *holds* what they have, which the man underneath
 * divides into every escape, sweep and submission he tries. `control` is now genuinely the
 * choice for a fighter who is ahead, tired, or on top of somebody dangerous off their back.
 *
 * **Anchored at `control` = 1.0 rather than centred**, because `control` is the default top
 * intent and every calibrated number in the statistical tier was measured with the engine's
 * existing hold. Centring the scale would have quietly made *everybody* 15% harder to escape at
 * the neutral setting, which is the same class of hidden baseline shift that `BASE_INTENT` in
 * `simulate.ts` exists to document. A new term must cost nothing at the default or it is not a
 * new term, it is a rebalance wearing one.
 */
export function topControlFocus(c: Combatant): number {
  switch (c.plan.tactics.topIntent) {
    case 'control':
      return 1;
    case 'advance':
      return 0.87;
    case 'groundAndPound':
      return 0.74;
    case 'submit':
      return 0.7;
  }
}

// --- Exceptional opportunities ---------------------------------------------------------------

/**
 * How exceptional a submission chance is, 0–1 — the escape hatch in the rule.
 *
 * Deliberately built from the *gap* rather than the rating: a 90-submissions fighter does not
 * get a permanent exemption from his own game plan, he gets one when the position and the man in
 * front of him actually offer something. Back mount against a fading opponent is exceptional;
 * closed guard against a composed one is not, whoever is playing it.
 *
 * The threshold is high on purpose. This is the override that stops "keep it standing" producing
 * a fighter who passes up a fight-ending choke; it is not a general-purpose licence to ignore
 * the plan whenever a submission is technically available.
 */
export function submissionOpportunity(
  actor: Combatant,
  target: Combatant,
  position: GroundPosition,
  fromTop: boolean,
): number {
  const offence = actor.attrs.submissions;
  const defence = (target.attrs.scrambling + target.attrs.composure) / 2;
  const edge = clamp01(remap(offence - defence, 15, 55, 0, 1));
  // The back is the position that finishes fights; guard from underneath is where submissions
  // are *attempted* and rarely land, which is exactly the case this must not exempt.
  const positional = fromTop
    ? position === 'back'
      ? 1
      : position === 'mount'
        ? 0.7
        : 0.3
    : position === 'guard'
      ? 0.45
      : 0.15;
  // A gassed or hurt opponent is a real opening, and it is the one a striker underneath is
  // entitled to take regardless of what the corner asked for.
  const vulnerable = clamp01(target.fatigue * 0.6 + (target.hurtSeconds > 0 ? 0.5 : 0));

  return clamp01(edge * positional * (0.7 + vulnerable));
}

/**
 * How exceptional a striking opportunity is. Compact, because there is only one that counts.
 *
 * A hurt opponent is the moment every game plan in the sport is written to be abandoned for, and
 * `finishing` is where the player says how far. A disciplined fighter still steps off.
 */
export function finishOpportunity(actor: Combatant, target: Combatant): number {
  if (target.hurtSeconds <= 0) return 0;
  switch (actor.plan.tactics.finishing) {
    case 'huntFinish':
      return 0.85;
    case 'pressAdvantage':
      return 0.5;
    default:
      return 0.15;
  }
}

// --- Range ------------------------------------------------------------------------------------

/**
 * Which range this fighter's plan is asking for.
 *
 * **`entry` is deliberately absent from this function**, and that absence is the whole point.
 * Walking somebody backwards and closing the gap on them are related and not identical: a
 * pressure kickboxer wants you retreating *at kicking range*, and a model that reads `pressure`
 * as "get into the pocket" has quietly rebuilt the conflation that made the old `approach`
 * control useless — where initiative and desired position were one control and neither could be
 * stated without the other.
 *
 * So the plan's preferred *state* decides the range, and the entry style acts elsewhere: on who
 * is able to give ground (`groundDenial`). `outside` + `pressure` is a fighter walking you down
 * while refusing to come in with you, which is a real and common fighter this could not describe
 * an hour ago.
 *
 * The grappling preferences want the pocket, because that is where entries live — but as a route
 * rather than a destination, which `rangeUrgencyScale` prices.
 */
export function rangeForState(state: PreferredState): Range {
  switch (state) {
    case 'outside':
      return 'outside';
    case 'boxing':
      return 'boxing';
    case 'pocket':
    case 'clinch':
    case 'top':
    case 'submission':
      return 'pocket';
    case 'adaptive':
      return 'boxing';
  }
}

export function desiredRangeOf(c: Combatant): Range {
  return rangeForState(c.plan.tactics.preferredState);
}

const GRAPPLING_STATES: readonly PreferredState[] = ['clinch', 'top', 'submission'];

/**
 * How hard this fighter pushes for the range they want, 0–1.
 *
 * The same `urgency` every other policy decision reads, so a fighter whose plan has come apart
 * stops managing range as well as everything else — and scaled by how much the plan is *about*
 * range, because a wrestler wanting the pocket wants it far less specifically than an outside
 * fighter wants kicking distance.
 */
export function rangeUrgency(c: Combatant, stance: Stance): number {
  const desired = desiredRangeOf(c);
  const grappling = GRAPPLING_STATES.includes(c.plan.tactics.preferredState);
  /*
   * A floor, because **managing distance is a property of fighting rather than of planning**.
   *
   * Every other policy term is zero for an unplanned fighter, and that is right: without a plan
   * he has no preference about whether the fight goes to the floor. Range is not like that. A
   * fighter with no instructions still drifts toward where his own skills work, and one who never
   * moves at all is not neutral — he is a man standing at whatever distance the last reset left
   * him at, which measured as **63% of every unplanned fight at kicking range** with the range
   * beat never firing once.
   *
   * So the floor is what a fighter does by himself, and the plan is what a corner adds to it.
   */
  return clamp(stance.urgency * rangeUrgencyScale(desired, grappling), 0.3, 1);
}

/**
 * How hard a fighter is to move away from — the job `entry` actually has.
 *
 * `pressure` is space-taking: you are being walked backwards, so stepping off is harder and
 * closing on you is easier. `movement` is the opposite. Neither says a word about which range
 * either man wants, which is the separation this whole module is careful about.
 *
 * Returned as a multiplier on the *holder's* resistance, so a pressure fighter denies the retreat
 * whether or not he is the one trying to change anything.
 */
export function groundDenial(c: Combatant, against: 'retreat' | 'close'): number {
  switch (c.plan.tactics.entry) {
    case 'pressure':
      return against === 'retreat' ? 1.35 : 0.85;
    case 'movement':
      return against === 'retreat' ? 0.8 : 1.3;
    case 'clinchEntries':
      return against === 'retreat' ? 1.25 : 0.9;
    default:
      return 1;
  }
}

// --- The same plan, at round granularity ------------------------------------------------------

/**
 * The tactical plan collapsed into three scalars, for the round-level resolver.
 *
 * `round.ts` resolves a whole round at once, so it cannot ask "what does he reach for *now*" —
 * it needs "how much of the round does this add up to". The obvious way to give it one is to
 * write a second, coarser table, and that is exactly what must not happen: a fighter promoted
 * from Reduced to Full mid-career would walk into a different sport, and the two tables would
 * drift apart on the first change to either.
 *
 * So these are computed from **the same alignment tables and the same urgency** as the
 * exchange-level decisions, at a neutral situation. Measured before they existed, the Reduced
 * resolver was *completely flat* across plans — 266 seconds of control for every one of them —
 * while Full ranged from 119 for an outside striker to 349 for a wrestler, and `bulk-tick` caught
 * it as a world whose pyramid came out a different shape depending on how it was simulated.
 */
export function neutralStance(c: Combatant): Stance {
  return stanceOf(c, undefined, false);
}

/** How much of the round this fighter's plan wants spent grappling. */
export function grapplingAppetite(c: Combatant): number {
  const stance = neutralStance(c);
  return (standingBias(stance, 'takedown') + standingBias(stance, 'clinchUp')) / 2;
}

/** How hard they work to not be held there. Reads the bottom instruction, as `simulate.ts` does. */
export function controlResistance(c: Combatant): number {
  const stance = neutralStance(c);
  return bottomBias(c, stance, 'standUp');
}

/**
 * Of the grappling this plan wants, how much of it is aimed at the fence rather than the floor.
 *
 * `grapplingAppetite` averages `takedown` and `clinchUp` to say *how much* grappling a plan wants.
 * This is the other half of the same pair — *which route* — and it is deliberately built from the
 * same two numbers, so the two functions cannot drift apart or double-count. **1 means no
 * preference either way**, which is what an unplanned fighter has.
 *
 * The form is `2x / (x + y)`, the same share-of-the-pair D10 gave the round resolver's contests:
 * bounded in (0, 2), exactly 1 when the two are equal.
 */
export function clinchLean(c: Combatant): number {
  const stance = neutralStance(c);
  const fence = standingBias(stance, 'clinchUp');
  const floor = standingBias(stance, 'takedown');
  return (2 * fence) / (fence + floor);
}

/**
 * And having got there, how much of the tie-up this plan wants **kept** rather than converted.
 *
 * A separate question from the one above and answered by a separate table, because getting to the
 * fence and staying on it are separate decisions — docs/01 § 8, applied at round granularity. It is
 * what separates a clinch fighter from a wrestler who uses the fence as a handrail on the way to a
 * takedown: both route to the tie-up, and only one of them is still there ten seconds later.
 *
 * Measured at Full detail, this term is the larger half of the difference. A top-position plan reads
 * 0.65 on `clinchLean` and 0.38 here; without it Reduced put 4.4% of a top-position fighter's
 * control in the tie-up against Full's 6.4%, and the shape of the plan table was doing none of the
 * work that separates the two styles.
 */
export function clinchPersistence(c: Combatant): number {
  const stance = neutralStance(c);
  const keep = controllingBias(stance, 'clinchMaintain');
  const convert = controllingBias(stance, 'clinchTakedown');
  return (2 * keep) / (keep + convert);
}

/**
 * How much of his time on top the plan wants spent hitting, for the round-level resolver.
 *
 * The third of these, and it exists because `topIntent` reached Reduced through exactly one term —
 * submission attempts — and through nothing else. A fighter told to ride for control and one told
 * to posture up and hit threw the *same* number of strikes a round at this level of detail, while
 * at Full detail they threw 2.83 a minute against 1.03. Reduced was not quantitatively looser about
 * that instruction; it could not see it (doc 31 § D10).
 *
 * Read off `TOP_ALIGNMENT` at a neutral situation, which is the same table and the same urgency
 * `simulate.ts` weighs `groundStrike` with, so an unplanned fighter reads exactly 1 and nothing
 * about the calibrated round moves.
 */
export function groundStrikeAppetite(c: Combatant): number {
  const stance = neutralStance(c);
  return topBias(c, stance, 'groundStrike');
}

/**
 * How much of the round the plan wants spent throwing.
 *
 * `attemptsFor` builds volume from work rate and position, which is right for a fighter with no
 * preference and wrong for one who spends his exchanges changing levels instead of punching.
 * Measured: a wrestler's Full-detail volume falls from 17.4 significant strikes to 14.7 when he
 * commits to the takedown, and the Reduced resolver had him still throwing 18.9.
 */
export function strikingAppetite(c: Combatant): number {
  const stance = neutralStance(c);
  return (standingBias(stance, 'strike') + standingBias(stance, 'kick')) / 2;
}

/**
 * The range mix a matchup is expected to settle at, for the round-level resolver.
 *
 * `round.ts` resolves a whole round at once, so it cannot ask "where are they *now*" — it needs
 * the share of the round each range accounts for. Computed from the same `rangeChangeChance`
 * contest the full simulator runs, at neutral stickiness, so the two levels cannot disagree about
 * who wins a range: a fighter promoted from Reduced to Full mid-career must not walk into a
 * different sport, and that has already caught this engine once, when the Reduced resolver
 * produced 266 seconds of control for every game plan while Full ranged 119 to 349.
 *
 * A two-fighter stationary distribution rather than a simulation: each man pulls toward his own
 * desired range with the strength his contest wins, and the mix is where that tug-of-war sits.
 */
export function expectedRangeMix(a: Combatant, d: Combatant): Record<Range, number> {
  const stanceA = stanceOf(a, undefined, false);
  const stanceD = stanceOf(d, undefined, false);
  const pull = (c: Combatant, other: Combatant, stance: Stance): number =>
    rangeChangeChance({
      mover: c,
      holder: other,
      change: 'close',
      stickiness: 0,
      intent: 0.75 + rangeUrgency(c, stance) * 1.15,
      denial: groundDenial(other, 'close'),
    });

  const wantA = desiredRangeOf(a);
  const wantD = desiredRangeOf(d);
  const strengthA = pull(a, d, stanceA);
  const strengthD = pull(d, a, stanceD);

  /*
   * Time nobody chose, before any of the above.
   *
   * Every round starts at `outside` and every referee reset returns there, and getting off it
   * costs a beat — more than a beat, for somebody who cannot win the range contest. Without this
   * term the model said two fighters who both wanted the boxing range spent *all* of the fight
   * there, which is not a small error: measured over 400 fights on each of the parity suite's
   * five matchups, Full spends 0.29–0.41 of its standing time at `outside` in exactly those
   * matchups, because that is where the fight keeps being put back.
   *
   * Sized against how fast the two of them get off it, so a pair who both close well spend less
   * of the fight walking in than a pair who cannot.
   */
  const reset = clamp(0.66 * (1 - (strengthA + strengthD) / 2), 0.1, 0.5);
  const contested = 1 - reset;

  // Each fighter's share of the *remaining* standing time is spent at the range he wants; the
  // residual sits in the middle, which is where two fighters who want opposite things meet.
  const total = strengthA + strengthD;
  const shareA = total <= 0 ? 0.5 : strengthA / total;
  const mix: Record<Range, number> = { outside: reset, boxing: 0, pocket: 0 };
  mix[wantA] += shareA * contested * 0.62;
  mix[wantD] += (1 - shareA) * contested * 0.62;
  mix.boxing += contested * 0.38;
  const sum = mix.outside + mix.boxing + mix.pocket;
  return { outside: mix.outside / sum, boxing: mix.boxing / sum, pocket: mix.pocket / sum };
}

/**
 * How often a fighter's attempt to change range comes up short, per exchange.
 *
 * Full hands the *other* man a bigger counter when an entry fails — a fighter who lunged and did
 * not arrive is mid-stride with his feet crossed, and that is the moment fights turn. Reduced has
 * no concept of an entry, so without this it cannot see the danger at all.
 *
 * It is not an even cost across the sport, which is why it needs saying rather than absorbing
 * into a constant: it falls almost entirely on matchups where the two men want *opposite* ranges
 * and spend the fight failing to impose them on each other. Two fighters who both want the pocket
 * meet there and this term is near zero for both.
 *
 * The probability is the product of two things Reduced already knows how to estimate — how often
 * this fighter is somewhere he does not want to be, and how often he fails to fix it.
 */
export function expectedRangeFailure(c: Combatant, other: Combatant): number {
  const want = desiredRangeOf(c);
  const away = 1 - expectedRangeMix(c, other)[want];
  if (away <= 0) return 0;

  const stance = stanceOf(c, undefined, false);
  const change: RangeChange = want === 'outside' ? 'retreat' : 'close';
  const chance = rangeChangeChance({
    mover: c,
    holder: other,
    change,
    // The mid-fight average rather than a clean break: by the time somebody is trying to leave a
    // range, that range has had time to set.
    stickiness: 0.35,
    intent: 0.75 + rangeUrgency(c, stance) * 1.15,
    denial: groundDenial(other, change === 'close' ? 'close' : 'retreat'),
  });

  return away * (1 - chance);
}

/**
 * How much a plan wants *out* of a state it is in, in −1…+1, before conviction scales it.
 *
 * The `B` axis of the tactical hierarchy, kept as its own table rather than inferred from the
 * action lists. Inferring it was tried and does not work: the urgency to leave a position cannot
 * depend on how many things the vocabulary happens to offer while you are in it (see
 * `exitUrgency`).
 *
 * The clinch row is the `breakAway` alignment, which was already exactly this quantity wearing a
 * different hat. The bottom row is new and is the honest reading of the five bottom instructions
 * as a single question: how much does this fighter want to be somewhere else?
 */
const CLINCH_EXIT: Alignment = {
  outside: 1,
  boxing: 0.9,
  pocket: 0.65,
  clinch: -1,
  top: -0.1,
  submission: -0.2,
  adaptive: 0,
};

const BOTTOM_EXIT: Readonly<Record<BottomIntent, number>> = {
  standUp: 1,
  scramble: 0.7,
  recover: 0.15,
  /*
   * The two "stay" rows read close to the full negative on purpose.
   *
   * Anchoring the scale at what an unplanned fighter does costs the plan some of its reach in the
   * downward direction — the neutral is 0.8, so a mild negative barely moves it. Measured, -0.6
   * for `playGuard` left a guard player attempting the exit on 52% of beats against a stand-up
   * plan's 94%, and the difference in time spent underneath came out at 7%, where it needs to be
   * the difference between two recognisable fighters. At -0.9 it reads 38% against 92%.
   */
  playGuard: -0.9,
  attack: -1,
};

/*
 * The neutral rates, measured from what the engine did before the transition split rather than
 * chosen. With the exits and the in-state work drawn from one list, an unplanned fighter went for
 * the door on about 85% of bottom beats and 56% of held-clinch beats — those are the rates the
 * sport is calibrated around, and a fighter with no instructions has to keep producing them.
 */
const BOTTOM_EXIT_RATE = { neutral: 0.8, floor: 0.25, ceiling: 0.94 };
const CLINCH_EXIT_RATE = { neutral: 0.56, floor: 0.18, ceiling: 0.92 };

/** How hard this fighter is working to get out from underneath, as a probability per beat. */
export function bottomExitUrgency(c: Combatant, stance: Stance): number {
  return exitUrgency(BOTTOM_EXIT[c.plan.tactics.bottomIntent], stance.urgency, BOTTOM_EXIT_RATE);
}

/** The same, for a fighter being held in a tie-up he may or may not want. */
export function clinchExitUrgency(stance: Stance): number {
  return exitUrgency(CLINCH_EXIT[stance.desired], stance.urgency, CLINCH_EXIT_RATE);
}

/** How much they go looking for the finish once the fight is on the floor. */
export function submissionAppetite(c: Combatant, fromTop: boolean): number {
  const stance = neutralStance(c);
  return fromTop ? topBias(c, stance, 'submission') : bottomBias(c, stance, 'submission');
}

// --- Plan integrity --------------------------------------------------------------------------

/**
 * How much of the plan survives contact, updated once per exchange.
 *
 * Erodes with what actually makes fighters abandon plans — being hurt, accumulated head damage,
 * and the fight going against them — and is held together by Composure and Discipline. It
 * recovers between rounds but never fully: a fighter who has already binned the plan once is
 * more likely to bin it again, which is what a corner shouting into a cage sounds like.
 *
 * `planDiscipline` on traits is the hook a `Lone Wolf` or a natural brawler writes to.
 */
export function erodePlanIntegrity(c: Combatant, seconds: number): void {
  const hold = clamp(
    remap((c.attrs.composure + c.fighter.personality.discipline) / 2, 30, 90, 0.35, 1) +
      traitAdd(c.fighter.traits, 'gamePlanAdherence'),
    0.2,
    1.3,
  );

  const stress =
    (c.hurtSeconds > 0 ? 0.05 : 0) + (c.damage.head / 100) * 0.02 + (c.momentum < -0.3 ? 0.012 : 0);

  if (stress <= 0) return;
  c.planIntegrity = clamp(c.planIntegrity - (stress * seconds) / (10 * hold), 0.25, 1);
}

/** Between rounds a corner gets a minute to put it back together. Never all of it. */
export function restorePlanIntegrity(c: Combatant): void {
  const hold = clamp(remap(c.attrs.composure, 30, 90, 0.3, 1), 0.2, 1);
  c.planIntegrity = clamp(c.planIntegrity + 0.18 * hold, 0.25, 1);
}

// --- Displacement ------------------------------------------------------------------------------

/**
 * Is this fighter somewhere they did not put themselves?
 *
 * The distinction the design sketch was right to insist on: *I chose to come here* and *he put
 * me here* are different positions with the same name. The simulator has always known which —
 * every transition is caused by somebody — it simply never wrote it down.
 */
export function isDisplaced(
  stance: PreferredState,
  where: 'distance' | 'clinch' | 'top' | 'bottom',
  causedByOpponent: boolean,
): boolean {
  if (!causedByOpponent) return false;
  switch (where) {
    case 'distance':
      return stance === 'top' || stance === 'submission' || stance === 'clinch';
    case 'clinch':
      // The pocket is a step from the tie-up, so a pocket fighter dragged into it is less
      // displaced than an outside fighter who has been walked all the way across the cage.
      return stance === 'outside' || stance === 'boxing';
    case 'top':
      return stance === 'outside' || stance === 'boxing' || stance === 'pocket';
    case 'bottom':
      return stance !== 'submission';
  }
}

export type { Corner };
