/**
 * Offering a fight, and being told no.
 *
 * Doc 16 specifies `BoutAgreement` in full and nothing implemented it, which left a hole
 * underneath the whole of promoter mode: **offering a bout was a command**. The card builder
 * was eighteen dropdowns that always said yes, which is precisely the spreadsheet doc 13's
 * "what must never happen" section forbids.
 *
 * Three pieces of the model were already written and unreachable, and this is what they were
 * for:
 *
 * - `stepUpAcceptance()` — referenced only by its own unit test since the day it was written.
 * - `shortNoticeWillingness` — a trait hook with two traits pointing at it and no reader.
 * - `TollReason: 'refusedBout'` — a type-level fiction, because nothing could refuse a bout.
 *
 * The realism this buys is the thing every fan knows and no version of this game could
 * previously express: fighters duck each other, managers hold out for a title shot, and the
 * fight you want is not always the fight you can make.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { FighterId, PromotionId } from '../core/ids.js';
import { hashSeed } from '../core/rng.js';
import type { CardPosition } from './money.js';
import type { Fighter } from '../domain/fighter.js';
import type { Promotion } from '../domain/organisations.js';
import { stepUpAcceptance } from '../domain/personality.js';
import { traitAdd, traitMul } from '../domain/traits.js';
import { overallRating } from '../ratings/attributes.js';
import { connectionTo, priority, stableConflictCost, type Manager } from './managers.js';
import { isAboveTheirWeight, wantMet, wantsOf, type WantRead } from '../domain/disposition.js';
import { describeLedger, relationshipWith } from '../domain/relationship.js';
import { voiceFor, wantVoice, type VoiceSituation } from '../domain/voice.js';
import { isHoldingOut } from './negotiation.js';

export type BoutAgreementStatus = 'offered' | 'signed' | 'refused';

export interface BoutAgreement {
  boutId: string;
  fighterId: FighterId;
  promotionId: PromotionId;
  status: BoutAgreementStatus;
  /** Why they said no, in the fighter's own terms. Empty when signed. */
  reason?: string;
  offeredDay: GameDay;
}

/** How much notice a fighter is being given, which changes everything about the answer. */
export type Notice = 'full' | 'short';

/**
 * Whether this fighter takes this fight.
 *
 * Returned as a probability rather than a verdict so the caller owns the roll and the UI can
 * *show the number before asking*. A promoter who cannot see that a fight is a long shot before
 * offering it is playing a slot machine, and doc 13's requirement is explicit: the game must
 * tell you what a fight is worth before you book it.
 *
 * The terms are multiplicative because they compound in reality. A big step up, on short
 * notice, for a manager who has a better offer, is not three small problems — it is a no.
 */
export interface AcceptanceRead {
  chance: number;
  /** The single biggest reason it is not higher. Shown to the player. */
  concern?: string;
  /**
   * The same reason in the fighter's own words, when `day` was given. Doc 34 C3: a refusal that
   * arrives as a sentence from a person reads as a negotiation; one that arrives as a probability
   * reads as a dice roll.
   */
  quote?: string;
  /** True when the answer is no because they are holding out for a new deal. */
  holdout?: boolean;
}

/** Doc 34 C3: the offer is the fight they want (×1.15), or plainly is not (×0.9). */
export const WANT_MET = 1.15;
export const WANT_UNMET = 0.9;
/**
 * Doc 34 C3: a fighter in the red takes fights more readily (docs/17); one sitting on more than
 * `RICH_BANK` thousand can afford to be choosy about a step up of more than `RICH_STEP` overall.
 */
export const BANK_BROKE = 1.12;
export const BANK_RICH = 0.92;
export const RICH_BANK = 250;
export const RICH_STEP = 4;

export function acceptanceOf(input: {
  fighter: Fighter;
  opponent: Fighter;
  promotion: Promotion;
  manager?: Manager;
  notice?: Notice;
  /** True when this fight is for a belt, which almost nobody turns down. */
  isTitleFight?: boolean;
  /**
   * Today. Turns on what the fighter remembers about this promotion (`relationshipWith`) and what
   * they want next (`wantsOf`), and lets the answer be said in their own words. Without it the
   * answer is the history-blind one this function always gave.
   */
  day?: GameDay;
  /** The fighter's own rank here, and the opponent's, for the wants. 0 is the champion. */
  rank?: number;
  opponentRank?: number;
}): AcceptanceRead {
  const { fighter, opponent, promotion, manager, notice = 'full', isTitleFight, day } = input;

  /*
   * Holding out. Doc 34 C4: past a point, an underpaid fighter with the pride or the ambition to
   * do it stops taking fights at all until the deal is redone — and no fight, title or not, moves
   * them. Renegotiating is the only answer, which is the point.
   */
  if (isHoldingOut(fighter)) {
    return {
      chance: 0,
      concern: 'Holding out — will not fight again until the deal is renegotiated',
      quote: day !== undefined ? voiceFor(fighter, 'wantsMoney', day).text : undefined,
      holdout: true,
    };
  }

  const concerns: { label: string; weight: number; situation?: VoiceSituation }[] = [];

  /*
   * How big a step this is. Positive means the opponent is better.
   *
   * Overall rating rather than ranking, because a fighter and their manager are assessing the
   * person opposite rather than a number the promotion publishes — and the two genuinely
   * diverge, which is what makes a protected prospect possible.
   */
  const step = overallRating(opponent.attributes) - overallRating(fighter.attributes);
  const appetite = stepUpAcceptance(fighter.personality);

  /*
   * Only a *step up* is discounted by appetite. A fighter with no ambition still happily takes
   * a fight they should win, which is the whole reason ducking is a strategy rather than a
   * personality flaw.
   */
  const stepTerm =
    step <= 0
      ? clamp(1 + Math.min(-step, 20) / 60, 1, 1.3)
      : clamp(1 - (step / 30) * (1 - appetite), 0.15, 1);
  if (step > 4 && stepTerm < 0.98) {
    concerns.push({
      label: `A clear step up, and ${fighter.lastName} knows it`,
      weight: 1 - stepTerm,
      situation: 'refusesStepUp',
    });
  }

  /*
   * Short notice. The sport's defining operational fact, and the reason `shortNoticeWillingness`
   * exists as a trait hook — a `Gym Rat` who stays ready takes fights a `Party Animal` cannot.
   */
  // An *additive* hook, which is how the trait table declares it: `Gym Rat` shifts a fighter's
  // short-notice willingness by +0.45 and `Party Animal` by −0.25, against a base of 0.45.
  const noticeTerm =
    notice === 'short'
      ? clamp(0.45 + traitAdd(fighter.traits, 'shortNoticeWillingness'), 0.05, 1)
      : 1;
  if (notice === 'short' && noticeTerm < 0.7) {
    concerns.push({
      label: 'Not enough notice to be ready',
      weight: 1 - noticeTerm,
      situation: 'refusesShortNotice',
    });
  }

  /*
   * The manager. Doc 16 made them the counterparty, and this is where that becomes true: a
   * manager who rates this fighter as their priority holds out for more, and one with a
   * teammate in the other corner has a problem money does not solve.
   */
  const standing = connectionTo(manager, promotion.id);
  const connectionTerm = clamp(0.7 + standing * 0.5, 0.7, 1.2);
  if (standing < 0.35 && manager) {
    concerns.push({
      label: `${manager.name} does not owe this promotion any favours`,
      weight: 0.3,
    });
  }

  /*
   * Amplified, deliberately. `stableConflictCost` returns 0.05 and is documented as a *cost* —
   * what the promotion pays to get it done anyway, used against purses elsewhere. The question
   * here is different and much larger: whether the fight can be made at all. A manager does not
   * want their two clients taking money off each other, and it is one of the commonest real
   * reasons a fight nobody can explain the absence of simply never happens.
   */
  const conflict = stableConflictCost(manager, opponent.id) * 6;
  const conflictTerm = clamp(1 - conflict, 0.1, 1);
  if (conflict > 0.05 && manager) {
    concerns.push({ label: `${manager.name} manages both of them`, weight: conflict });
  }

  /*
   * A priority fighter's manager pushes back harder on anything that is not clearly worth it —
   * they have a plan for this career and your card is not necessarily in it.
   */
  const priorityTerm = clamp(1 - priority(manager, fighter.id) * 0.18, 0.8, 1);

  /*
   * Being aggrieved makes a fighter harder to book, which is the last unclosed loop in doc 16's
   * grievance chain: `contractFairness` fed `resentment` and `resentment` fed nothing.
   */
  const resentmentTerm = clamp(1 - (fighter.resentment / 100) * 0.35, 0.65, 1);
  if (fighter.resentment > 55) {
    concerns.push({
      label: 'Unhappy with the deal, and in no hurry to do you a favour',
      weight: 0.35,
      situation: 'refusesPay',
    });
  }

  // A belt is a belt. Almost nobody turns one down, whatever else is true.
  const titleTerm = isTitleFight ? 2.2 : 1;

  /*
   * What they remember about this promotion. Doc 34 C3. A fighter who was skipped for a shot or
   * had a card cancelled on them answers more coolly; one who was given their chance, more warmly.
   * Bounded tighter than the belt, because memory shades an answer rather than deciding it.
   */
  const relationship = day !== undefined ? relationshipWith(fighter, promotion.id, day) : undefined;
  const relationshipTerm = relationship ? clamp(1 + relationship.score / 300, 0.7, 1.15) : 1;
  if (relationship?.worst && relationship.score <= -10) {
    concerns.push({
      label: `Has not forgotten ${describeLedger(relationship.worst.kind)}`,
      weight: clamp(-relationship.score / 100, 0.1, 0.5),
      situation: relationship.worst.kind === 'cardCancelled' ? 'cardCancelled' : 'refusesGrudge',
    });
  }

  /*
   * What they want next, and whether this is it. A fighter chasing a title shot is keener on the
   * belt fight and cooler on everything else; one who needs any win is wary of a step up.
   */
  const lastBout = fighter.record[fighter.record.length - 1];
  const want =
    day !== undefined
      ? wantsOf({
          fighter,
          day,
          rank: input.rank,
          daysIdle: lastBout ? day - lastBout.day : 0,
        })
      : undefined;
  const met = want
    ? wantMet(want, {
        opponent,
        isTitleFight,
        opponentRank: input.opponentRank,
        step,
        // The heavier of the two corners' divisions is the weight the bout is fought at.
        aboveTheirWeight: isAboveTheirWeight(fighter, opponent.divisionId),
      })
    : undefined;
  const wantTerm = met === true ? WANT_MET : met === false ? WANT_UNMET : 1;
  if (met === false && want) {
    concerns.push({
      label: `Not the fight they are after — they want ${want.label.toLowerCase()}`,
      weight: 0.1,
      situation: wantVoice(want.id),
    });
  }

  /*
   * The bank. A fighter in the red takes fights they otherwise would not (docs/17), and one
   * sitting on a fortune can afford to be choosy about a step up.
   */
  const bankTerm =
    fighter.bank < 0 ? BANK_BROKE : fighter.bank > RICH_BANK && step > RICH_STEP ? BANK_RICH : 1;

  const chance = clamp01(
    0.9 *
      stepTerm *
      noticeTerm *
      connectionTerm *
      conflictTerm *
      priorityTerm *
      resentmentTerm *
      titleTerm *
      relationshipTerm *
      wantTerm *
      bankTerm,
  );

  /*
   * A concern whenever the answer is not a clear yes.
   *
   * The threshold sits at the chance rather than at any one term's size, because the point of
   * the field is to answer "why might they say no" — and a fighter at 0.6 who is worried about
   * four small things is exactly the case where the player most needs to be told something.
   */
  const worst = concerns.sort((a, b) => b.weight - a.weight)[0];
  if (chance >= 0.85) return { chance };
  const quote =
    day !== undefined && worst?.situation
      ? voiceFor(fighter, worst.situation, day).text
      : undefined;
  return { chance, concern: worst?.label, quote };
}

/** How the answer reads on screen. Never a percentage — a promoter hears a person, not a number. */
export function describeAcceptance(chance: number): string {
  if (chance >= 0.85) return 'They will take it';
  if (chance >= 0.65) return 'Probably yes';
  if (chance >= 0.4) return 'They might';
  if (chance >= 0.2) return 'Unlikely';
  return 'They will not take this';
}

/**
 * Why a booked fight falls apart before the card.
 *
 * The most authentic recurring event in the sport and the one the game could not produce.
 * Weighted by the things already modelled — an injury-prone fighter with a hard cut, deep in a
 * camp, is exactly who withdraws — so the causes are the fighter's own attributes rather than
 * a flat die roll.
 */
export type PullOutReason = 'injury' | 'illness' | 'weight' | 'personal';

export interface PullOut {
  fighterId: FighterId;
  boutId: string;
  reason: PullOutReason;
  /** One line, for the news and for the promoter's inbox. */
  note: string;
}

/** Per-fighter probability of withdrawing from a booked bout, across a whole camp. */
export function pullOutRisk(fighter: Fighter): number {
  /*
   * The real rate is around one bout in eight losing a fighter — high enough that a promoter
   * plans for it and low enough that it is an event rather than a tax. Everything below scales
   * that base rather than replacing it.
   */
  const base = 0.055;
  // Camp injury risk specifically: a pull-out is something that happens *during* camp, which
  // is a different hook from the one that governs getting hurt in a fight.
  const injury = traitMul(fighter.traits, 'campInjuryRisk');
  const wear = 1 + (fighter.condition.bodyWear / 100) * 0.6;
  const discipline = clamp(1.35 - (fighter.personality.discipline / 100) * 0.7, 0.65, 1.35);
  // A hard cut is the other common cause, and the trait that governs it already exists.
  const cut = traitMul(fighter.traits, 'weightMissRisk');
  return clamp01(base * injury * wear * discipline * Math.max(1, cut * 0.6 + 0.4));
}

export function describePullOut(reason: PullOutReason, fighter: Fighter): string {
  switch (reason) {
    case 'injury':
      return `${fighter.lastName} is out with an injury picked up in camp.`;
    case 'illness':
      return `${fighter.lastName} has withdrawn ill.`;
    case 'weight':
      return `${fighter.lastName} will not make the weight and has pulled out.`;
    case 'personal':
      return `${fighter.lastName} has withdrawn for personal reasons.`;
  }
}

// --- Answering over days, and what a counter asks for --------------------------------------------

/**
 * What a corner asks for instead of a yes. Doc 34 C4.
 *
 * Money was the only counter the game could make, so every reluctant fighter was a price. People
 * hold out for other things, and a promoter can often give them something cheaper than cash: the
 * slot ("put me on the main card"), the distance ("five rounds or nothing"), or a different
 * opponent ("I want the champion, not him").
 */
export type BoutCounter =
  | { kind: 'money'; askingPurse: number }
  | { kind: 'slot'; position: CardPosition }
  | { kind: 'rounds'; rounds: 5 }
  | { kind: 'opponent'; preferredId: FighterId; reason: string };

/** A counter in a sentence, for the card and the inbox. */
export function describeCounter(counter: BoutCounter): string {
  switch (counter.kind) {
    case 'money':
      return `Wants ${Math.round(counter.askingPurse * 10) / 10}k to show to take it.`;
    case 'slot':
      return counter.position === 'coMain'
        ? 'Will take it as the co-main event, not lower.'
        : 'Will take it on the main card, not the prelims.';
    case 'rounds':
      return 'Will take it over five rounds, not three.';
    case 'opponent':
      return counter.reason;
  }
}

/**
 * How many days a corner takes to answer: two to seven.
 *
 * A professional with a manager who prizes this promotion answers fast; one whose manager has
 * thirty clients and other calls to take does not. Deterministic on the offer's key so re-reading
 * an offer cannot move the day.
 */
export function replyDelayDays(
  fighter: Pick<Fighter, 'personality'>,
  manager: Manager | undefined,
  promotionId: PromotionId,
  key: string,
): number {
  const jitter = hashSeed(key) % 3;
  const slow = fighter.personality.professionalism < 40 ? 2 : 0;
  const busy = manager && connectionTo(manager, promotionId) < 40 ? 1 : 0;
  return clamp(2 + jitter + slow + busy, 2, 7);
}

/**
 * The counter a reluctant corner makes, shaped by who they are and what they want.
 *
 * Undefined means they are simply not interested. The order is the order a fighter would raise
 * things in: who they are fighting first, then where on the card, then the distance, and money
 * last — because money is what everybody asks for when nothing else is the problem.
 */
export function shapeBoutCounter(input: {
  fighter: Fighter;
  read: AcceptanceRead;
  position: CardPosition;
  rounds: 3 | 5;
  /** What they want next, from `wantsOf`. */
  want?: WantRead;
  /** Who they would rather fight, when the want names somebody: the champion, a rematch. */
  preferred?: Pick<Fighter, 'id' | 'firstName' | 'lastName'>;
  /** The show purse they are on now, for a money counter. */
  show: number;
  /** Whether money can buy them at all. */
  buyable: boolean;
}): BoutCounter | undefined {
  const { fighter, read, position, rounds, want, preferred, show, buyable } = input;
  const p = fighter.personality;

  if (preferred && want && (want.id === 'rematch' || want.id === 'titleShot')) {
    return {
      kind: 'opponent',
      preferredId: preferred.id,
      reason:
        want.id === 'rematch'
          ? `Wants ${preferred.firstName} ${preferred.lastName} again, not this.`
          : `Wants ${preferred.firstName} ${preferred.lastName} and the belt, not this.`,
    };
  }
  if (
    fighter.starPower >= 50 &&
    (position === 'prelim' || position === 'mainCard') &&
    p.ego >= 55
  ) {
    return { kind: 'slot', position: position === 'prelim' ? 'mainCard' : 'coMain' };
  }
  if (rounds === 3 && (position === 'mainEvent' || position === 'coMain') && p.ambition >= 65) {
    return { kind: 'rounds', rounds: 5 };
  }
  if (!buyable) return undefined;
  // The ask scales with how reluctant they are: a near-yes is cheap to close.
  return {
    kind: 'money',
    askingPurse: Math.round(show * (1.25 + (1 - read.chance) * 1.1) * 10) / 10,
  };
}
