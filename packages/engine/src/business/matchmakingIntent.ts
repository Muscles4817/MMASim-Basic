/**
 * Why a promoter makes a fight.
 *
 * `offerOpponents` answers "who could fight this person", which is a question about eligibility.
 * It is not the question a matchmaker asks. A matchmaker asks *what am I trying to achieve*, and
 * the same two fighters are a good idea or a terrible one depending on the answer: giving a
 * 22-year-old prospect the #3 contender is either a disaster or exactly the test the division
 * needed, and nothing in the model could tell those apart.
 *
 * So this module has two halves. `MATCH_INTENTS` are the reasons — build, test, eliminate, cash
 * in, fill cheaply — and `appraiseOpponent` scores one pairing against all of them and hands
 * back the tags, the risks and the sentence explaining itself. The AI suggesting a fight has to
 * be able to say *why*, or the player is being asked to trust a black box, which is the whole
 * failure the old auto-fill embodied.
 *
 * Nothing here decides anything. It appraises, and the player disposes.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { Fighter } from '../domain/fighter.js';
import { fighterAge } from '../domain/fighter.js';
import { overallRating } from '../ratings/attributes.js';
import type { Promotion } from '../domain/organisations.js';
import { paperOdds } from './matchmaking.js';
import { careerArc, type CareerArcId } from './promoterRead.js';

// --- The reasons ------------------------------------------------------------------------------

export type MatchIntentId =
  | 'competitive'
  | 'buildProspect'
  | 'testProspect'
  | 'titleEliminator'
  | 'createStar'
  | 'veteranShowcase'
  | 'rebuild'
  | 'changingOfTheGuard'
  | 'fillCheaply'
  | 'localDraw';

export interface MatchIntent {
  id: MatchIntentId;
  label: string;
  /** What the promoter is actually trying to do, in their own words. */
  blurb: string;
}

export const MATCH_INTENTS: readonly MatchIntent[] = [
  {
    id: 'competitive',
    label: 'Make a fight',
    blurb: 'Two fighters of the same standard. Nobody knows who wins, which is the whole product.',
  },
  {
    id: 'buildProspect',
    label: 'Build a prospect',
    blurb: 'Credible opposition they should beat. The record grows and so does the name.',
  },
  {
    id: 'testProspect',
    label: 'Test a prospect',
    blurb: 'A real step up. You find out this year rather than in three.',
  },
  {
    id: 'titleEliminator',
    label: 'Title eliminator',
    blurb: 'Two of the top contenders, and the winner is next for the belt.',
  },
  {
    id: 'createStar',
    label: 'Build a star',
    blurb: 'A favourable style against a known name. Highlights, not hard rounds.',
  },
  {
    id: 'veteranShowcase',
    label: 'Veteran showcase',
    blurb: 'A recognisable fighter in front of the people who came to see them.',
  },
  {
    id: 'rebuild',
    label: 'Rebuild somebody',
    blurb: 'Coming off losses and needs a win they can actually get.',
  },
  {
    id: 'changingOfTheGuard',
    label: 'Changing of the guard',
    blurb: 'The name on the way down against the fighter on the way up. Reputation changes hands.',
  },
  {
    id: 'fillCheaply',
    label: 'Fill the card',
    blurb: 'Available, affordable, and it is a prelim. Nobody bought a ticket for this one.',
  },
  {
    id: 'localDraw',
    label: 'Sell the room',
    blurb: 'Somebody the local audience will actually turn up for.',
  },
];

export const matchIntent = (id: MatchIntentId): MatchIntent =>
  MATCH_INTENTS.find((i) => i.id === id) ?? MATCH_INTENTS[0]!;

// --- Appraising one pairing ---------------------------------------------------------------------

/** Short, scannable descriptions of what a matchup *is*. Rendered as chips. */
export type MatchTag =
  | 'rankingAppropriate'
  | 'competitive'
  | 'stepUp'
  | 'stepDown'
  | 'stylisticRisk'
  | 'commercial'
  | 'cheap'
  | 'titleEligible'
  | 'mismatch'
  | 'rematch'
  | 'shortNoticeReady';

export const TAG_LABEL: Readonly<Record<MatchTag, string>> = {
  rankingAppropriate: 'Ranking appropriate',
  competitive: 'Competitive',
  stepUp: 'Step up',
  stepDown: 'Step down',
  stylisticRisk: 'Stylistic risk',
  commercial: 'Sells',
  cheap: 'Cheap',
  titleEligible: 'Title eligible',
  mismatch: 'One-sided',
  rematch: 'Rematch',
  shortNoticeReady: 'Ready now',
};

export interface MatchupIntentInput {
  subject: Fighter;
  opponent: Fighter;
  promotion: Promotion;
  day: GameDay;
  /** Divisional ranks, 0 for champion. Undefined for unranked. */
  subjectRank?: number;
  opponentRank?: number;
  /** Thousands, what the pairing would cost in purses. Drives the `cheap` read. */
  cost?: number;
  /** Where this would sit, which changes what "good" means entirely. */
  position?: 'mainEvent' | 'coMain' | 'mainCard' | 'prelim';
  /** True when the promotion's home market matches the opponent's. */
  localMarket?: boolean;
}

export interface IntentAppraisal {
  /** 0–1 chance the subject wins on paper. Near 0.5 is a fight. */
  redOdds: number;
  /** 0–100. Sporting merit: does this fight mean anything in the division. */
  sporting: number;
  /** 0–100. Commercial merit: will anybody care. */
  commercial: number;
  /** 0–100. Risk to the *subject*, which is what a promoter building somebody worries about. */
  risk: number;
  tags: readonly MatchTag[];
  /** The reasons this pairing serves, best first. */
  intents: readonly MatchIntentId[];
  /** One sentence saying why this was suggested. Never a number. */
  rationale: string;
}

const arcOf = (fighter: Fighter, day: GameDay, rank?: number): CareerArcId =>
  careerArc({ fighter, day, rank }).id;

/**
 * How much this fight costs the subject if it goes wrong.
 *
 * Not the same as the odds. A prospect losing to a contender costs them a year; a journeyman
 * losing to a contender costs them nothing anybody will remember. Risk is what the *loss* would
 * mean, not how likely it is — which is why a promoter protects an unbeaten 23-year-old from a
 * fight they would probably win.
 */
function riskTo(subject: Fighter, opponent: Fighter, day: GameDay, odds: number): number {
  const age = fighterAge(subject, day);
  const unbeaten = subject.summary.losses === 0 && subject.summary.wins >= 4;
  const young = age <= 26;

  // Losing chance is the base.
  let risk = (1 - odds) * 100;
  // What a loss would cost, on top of how likely it is.
  if (unbeaten) risk *= 1.35;
  if (young) risk *= 1.15;
  // A fighter who has already lost several has less to protect.
  if (subject.summary.losses >= 4) risk *= 0.8;
  // A dangerous opponent is dangerous beyond the odds: power and submissions end nights early,
  // and a knockout costs a career more than a decision does.
  const danger = (opponent.attributes.power + opponent.attributes.submissions) / 2;
  risk *= clamp(0.85 + danger / 200, 0.85, 1.35);

  return Math.round(clamp(risk, 0, 100));
}

export function appraiseMatchup(input: MatchupIntentInput): IntentAppraisal {
  const {
    subject,
    opponent,
    promotion,
    day,
    subjectRank,
    opponentRank,
    cost,
    position = 'mainCard',
    localMarket = false,
  } = input;

  const redOdds = paperOdds(subject, opponent);
  const closeness = 1 - Math.abs(redOdds - 0.5) * 2;
  const step = overallRating(opponent.attributes) - overallRating(subject.attributes);

  const tags: MatchTag[] = [];
  const intents: MatchIntentId[] = [];

  // --- Sporting merit ----------------------------------------------------------------------
  //
  // Where the two sit in the division and how close the fight is. A #1 against a #2 means
  // something whatever else is true; two unranked fighters mean very little however good the
  // fight is.
  const rankMerit =
    subjectRank !== undefined && opponentRank !== undefined
      ? clamp01(1 - (subjectRank + opponentRank) / 24) * 60
      : subjectRank !== undefined || opponentRank !== undefined
        ? 20
        : 8;
  const sporting = Math.round(clamp(rankMerit + closeness * 40, 0, 100));

  // --- Commercial merit ---------------------------------------------------------------------
  const star = (subject.starPower + opponent.starPower) / 2;
  const commercial = Math.round(
    clamp(star * 0.75 + closeness * 15 + (localMarket ? 12 : 0) + promotion.buzz * 0.1, 0, 100),
  );

  const risk = riskTo(subject, opponent, day, redOdds);

  // --- Tags ----------------------------------------------------------------------------------
  if (
    subjectRank !== undefined &&
    opponentRank !== undefined &&
    Math.abs(subjectRank - opponentRank) <= 4
  ) {
    tags.push('rankingAppropriate');
  }
  if (closeness > 0.7) tags.push('competitive');
  else if (Math.abs(redOdds - 0.5) > 0.3) tags.push('mismatch');
  if (step >= 5) tags.push('stepUp');
  if (step <= -5) tags.push('stepDown');
  if (risk >= 62) tags.push('stylisticRisk');
  if (star >= 55) tags.push('commercial');
  if (cost !== undefined && cost <= promotion.minimumPurse * 6) tags.push('cheap');
  if ((subjectRank ?? 99) <= 3 && (opponentRank ?? 99) <= 3) tags.push('titleEligible');
  if (subject.record.some((r) => r.opponentId === opponent.id)) tags.push('rematch');
  if ((opponent.readyOnDay ?? 0) <= day) tags.push('shortNoticeReady');

  // --- Intents this pairing serves ------------------------------------------------------------
  const subjectArc = arcOf(subject, day, subjectRank);
  const opponentArc = arcOf(opponent, day, opponentRank);

  if (closeness > 0.72) intents.push('competitive');
  if ((subjectArc === 'prospect' || subjectArc === 'hotProspect') && step <= -4) {
    intents.push('buildProspect');
  }
  if ((subjectArc === 'prospect' || subjectArc === 'hotProspect') && step >= 4) {
    intents.push('testProspect');
  }
  if ((subjectRank ?? 99) <= 4 && (opponentRank ?? 99) <= 4) intents.push('titleEliminator');
  if (subject.starPower >= 45 && step <= -3 && risk < 55) intents.push('createStar');
  if (subjectArc === 'decliningStar' || subjectArc === 'formerChampion') {
    intents.push('veteranShowcase');
  }
  if (subject.summary.streak <= -2 && step <= -4) intents.push('rebuild');
  if (
    (opponentArc === 'decliningStar' || opponentArc === 'agingContender') &&
    (subjectArc === 'hotProspect' || subjectArc === 'prospect' || subjectArc === 'contender')
  ) {
    intents.push('changingOfTheGuard');
  }
  if (position === 'prelim' && tags.includes('cheap')) intents.push('fillCheaply');
  if (localMarket) intents.push('localDraw');

  return {
    redOdds,
    sporting,
    commercial,
    risk,
    tags,
    intents,
    rationale: explain({ intents, tags, sporting, commercial, risk, opponent }),
  };
}

/**
 * Why this was suggested, as a sentence.
 *
 * The requirement the old auto-fill could not meet: the system proposed nine fights and could
 * not say a word about any of them. A suggestion the player cannot interrogate is not a
 * suggestion, it is the game playing itself.
 */
function explain(input: {
  intents: readonly MatchIntentId[];
  tags: readonly MatchTag[];
  sporting: number;
  commercial: number;
  risk: number;
  opponent: Fighter;
}): string {
  const { intents, tags, sporting, commercial, risk, opponent } = input;

  const lead = intents[0] ? matchIntent(intents[0]).blurb : undefined;
  if (lead) return lead;

  if (tags.includes('titleEligible')) return 'Two of the top contenders. The winner is next.';
  if (tags.includes('competitive') && commercial >= 55) {
    return 'Close fight between two people the audience knows. This sells and it delivers.';
  }
  if (tags.includes('competitive')) return 'A genuine fifty-fifty. Nobody knows how this goes.';
  if (risk >= 70)
    return `${opponent.lastName} is a serious problem stylistically. This is a gamble.`;
  if (sporting < 25 && commercial < 30) return 'Neither meaningful nor commercial — a card-filler.';
  return 'Makes sense on the card, without being the reason anybody turns up.';
}

// --- Ranking a slate against an intent ----------------------------------------------------------

/**
 * How well one appraisal serves one purpose, 0–1.
 *
 * Separated from the appraisal itself so the same slate can be re-sorted when the player changes
 * their mind about what the fight is for, which is the interaction the matchmaking screen is
 * built around: the list does not change, the *order* does.
 */
export function scoreForIntent(appraisal: IntentAppraisal, intent: MatchIntentId): number {
  const closeness = 1 - Math.abs(appraisal.redOdds - 0.5) * 2;
  const explicit = appraisal.intents.includes(intent) ? 0.35 : 0;

  switch (intent) {
    case 'competitive':
      return clamp01(explicit + closeness * 0.65);
    case 'buildProspect':
      return clamp01(explicit + (1 - appraisal.risk / 100) * 0.4 + appraisal.redOdds * 0.25);
    case 'testProspect':
      return clamp01(explicit + (appraisal.risk / 100) * 0.35 + closeness * 0.3);
    case 'titleEliminator':
      return clamp01(explicit + (appraisal.sporting / 100) * 0.65);
    case 'createStar':
      return clamp01(
        explicit + (appraisal.commercial / 100) * 0.4 + (1 - appraisal.risk / 100) * 0.25,
      );
    case 'veteranShowcase':
      return clamp01(explicit + (appraisal.commercial / 100) * 0.45 + appraisal.redOdds * 0.2);
    case 'rebuild':
      return clamp01(explicit + appraisal.redOdds * 0.45 + (1 - appraisal.risk / 100) * 0.2);
    case 'changingOfTheGuard':
      return clamp01(explicit + (appraisal.commercial / 100) * 0.3 + closeness * 0.35);
    case 'fillCheaply':
      return clamp01(explicit + (appraisal.tags.includes('cheap') ? 0.4 : 0) + closeness * 0.25);
    case 'localDraw':
      return clamp01(explicit + (appraisal.commercial / 100) * 0.65);
  }
}

/**
 * Which category a suggestion belongs under, for the grouped opponent list.
 *
 * The screen groups rather than sorts because a flat list ranked by a hidden score is the same
 * black box in a different shape. Groups say *what kind of fight this is*, and let the player
 * pick the kind before they pick the person.
 */
export type OpponentGroup =
  | 'recommended'
  | 'rankingAppropriate'
  | 'competitive'
  | 'prospectTest'
  | 'buildUp'
  | 'commercial'
  | 'risky'
  | 'other';

export const GROUP_LABEL: Readonly<Record<OpponentGroup, string>> = {
  recommended: 'Recommended',
  rankingAppropriate: 'Ranking appropriate',
  competitive: 'Competitive matchup',
  prospectTest: 'Prospect test',
  buildUp: 'Build-up fight',
  commercial: 'Commercially attractive',
  risky: 'High risk',
  other: 'Everybody else',
};

export const GROUP_ORDER: readonly OpponentGroup[] = [
  'recommended',
  'rankingAppropriate',
  'competitive',
  'prospectTest',
  'buildUp',
  'commercial',
  'risky',
  'other',
];

export function groupFor(appraisal: IntentAppraisal, recommended: boolean): OpponentGroup {
  if (recommended) return 'recommended';
  if (appraisal.tags.includes('rankingAppropriate')) return 'rankingAppropriate';
  if (appraisal.tags.includes('competitive')) return 'competitive';
  if (appraisal.intents.includes('testProspect')) return 'prospectTest';
  if (appraisal.intents.includes('buildProspect')) return 'buildUp';
  if (appraisal.tags.includes('commercial')) return 'commercial';
  if (appraisal.tags.includes('stylisticRisk')) return 'risky';
  return 'other';
}
