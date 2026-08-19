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
import type {
  BottomIntent,
  PreferredState,
  SituationalResponse,
  Situation,
  TopIntent,
} from '../domain/tactics.js';
import { traitAdd } from '../domain/traits.js';
import type { Combatant } from './profile.js';
import type { Corner, GroundPosition } from './types.js';

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
export type HeldAction = 'breakAway' | 'clinchStrike' | 'reverse';
export type ControllingAction = 'clinchTakedown' | 'clinchStrike' | 'clinchStall';

type Alignment = Readonly<Record<PreferredState, number>>;

const STANDING_ALIGNMENT: Readonly<Record<StandingAction, Alignment>> = {
  // Hands are the pocket's weapon. An outside fighter still jabs, which is why this is only
  // mildly positive at long range rather than negative.
  strike: { longRange: 0.3, pocket: 1, clinch: 0.1, top: -0.25, submission: -0.3, adaptive: 0 },
  // Kicks need room, and throwing them is how you keep it.
  kick: { longRange: 1, pocket: -0.15, clinch: -0.45, top: -0.35, submission: -0.35, adaptive: 0 },
  takedown: { longRange: -0.9, pocket: -0.7, clinch: 0.15, top: 1, submission: 0.9, adaptive: 0 },
  clinchUp: { longRange: -1, pocket: -0.55, clinch: 1, top: 0.45, submission: 0.25, adaptive: 0 },
};

const HELD_ALIGNMENT: Readonly<Record<HeldAction, Alignment>> = {
  breakAway: { longRange: 1, pocket: 0.8, clinch: -1, top: -0.1, submission: -0.2, adaptive: 0 },
  clinchStrike: {
    longRange: -0.35,
    pocket: 0.15,
    clinch: 0.7,
    top: -0.15,
    submission: -0.2,
    adaptive: 0,
  },
  reverse: { longRange: -0.4, pocket: -0.15, clinch: 1, top: 0.7, submission: 0.4, adaptive: 0 },
};

const CONTROLLING_ALIGNMENT: Readonly<Record<ControllingAction, Alignment>> = {
  clinchTakedown: {
    longRange: -0.6,
    pocket: -0.5,
    clinch: -0.1,
    top: 1,
    submission: 0.85,
    adaptive: 0,
  },
  clinchStrike: {
    longRange: -0.3,
    pocket: 0.2,
    clinch: 1,
    top: -0.2,
    submission: -0.25,
    adaptive: 0,
  },
  clinchStall: {
    longRange: -0.5,
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
export type TopAction = 'advancePosition' | 'groundStrike' | 'submission' | 'groundStall';
export type BottomAction = 'standUp' | 'sweep' | 'submission';

const TOP_ALIGNMENT: Readonly<Record<TopAction, Readonly<Record<TopIntent, number>>>> = {
  advancePosition: { control: 0.15, groundAndPound: -0.2, advance: 1, submit: 0.5 },
  groundStrike: { control: 0.1, groundAndPound: 1, advance: -0.1, submit: -0.2 },
  submission: { control: -0.6, groundAndPound: -0.3, advance: 0.2, submit: 1 },
  groundStall: { control: 1, groundAndPound: -0.4, advance: -0.5, submit: -0.7 },
};

const BOTTOM_ALIGNMENT: Readonly<Record<BottomAction, Readonly<Record<BottomIntent, number>>>> = {
  standUp: { standUp: 1, scramble: 0.5, playGuard: -0.6, recover: 0.15, attack: -0.5 },
  sweep: { standUp: -0.1, scramble: 1, playGuard: 0.2, recover: -0.35, attack: 0.2 },
  // The row this module exists for: a striker told to get up does not hunt a guillotine.
  submission: { standUp: -1, scramble: -0.2, playGuard: 0.7, recover: -0.8, attack: 1 },
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
function neutralStance(c: Combatant): Stance {
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
      return stance === 'longRange' || stance === 'pocket';
    case 'top':
      return stance === 'longRange' || stance === 'pocket';
    case 'bottom':
      return stance !== 'submission';
  }
}

export type { Corner };
