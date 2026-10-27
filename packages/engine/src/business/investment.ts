/**
 * What a promotion spends on itself between cards. Doc 34 B5.
 *
 * A promotion's organisation was a single number (`periodCosts`' overheads) that bought nothing
 * the player could see. These are the departments a promoter actually chooses to fund, each a
 * fortnightly cost with an effect the player can point at:
 *
 *  - a **matchmaker** — corners say yes more often, and autofill looks further;
 *  - a **scouting network** — the scouted estimate of a fighter is closer to the truth;
 *  - **medical staff** — fewer camp injuries and fewer fighters falling out in fight week;
 *  - a **marketing department** — the promotion's buzz has a floor it cannot fall through;
 *  - a **sports psychologist** — the head-space card's third option (doc 34 C6).
 *
 * Priced as a share of the promotion's own overheads (`periodCosts`), so a department costs what
 * an organisation of that size pays for one: a town show's scout is not the leader's scouting
 * network, and there is no second cost model to drift from the first. Levels 0–3; 0 is none.
 *
 * Pure. Stored on the promotion as a decision (`Promotion.investments`); everything here is read
 * from that.
 */

import { clamp } from '../core/math.js';
import type { Promotion } from '../domain/organisations.js';

export const INVESTMENTS = [
  'matchmaker',
  'scouting',
  'medical',
  'marketing',
  'psychologist',
] as const;
export type InvestmentId = (typeof INVESTMENTS)[number];
export type InvestmentLevel = 0 | 1 | 2 | 3;
export const INVESTMENT_LEVELS: readonly InvestmentLevel[] = [0, 1, 2, 3];

export const INVESTMENT_META: Readonly<
  Record<InvestmentId, { label: string; blurb: string; share: number }>
> = {
  matchmaker: {
    label: 'Matchmaker',
    blurb:
      'Knows every manager in the sport. Corners say yes more often, and autofill looks further.',
    share: 0.25,
  },
  scouting: {
    label: 'Scouting network',
    blurb: 'Eyes in every gym. What you think a fighter is gets closer to what they are.',
    share: 0.2,
  },
  medical: {
    label: 'Medical staff',
    blurb:
      'Physios, a doctor at every camp. Fewer injuries, fewer fighters pulling out in fight week.',
    share: 0.3,
  },
  marketing: {
    label: 'Marketing department',
    blurb: 'Keeps the promotion in the conversation between cards. Buzz cannot fall below a floor.',
    share: 0.35,
  },
  psychologist: {
    label: 'Sports psychologist',
    blurb: 'Somebody who works on a fighter’s head when a loss is still in it.',
    share: 0.1,
  },
};

/**
 * The least a department costs at each level, per fortnight, in thousands — so the smallest
 * promotion in the sport still pays something real for a scout rather than a rounding error.
 */
const MINIMUM_PER_LEVEL = 0.15;

export type Investments = Partial<Record<InvestmentId, InvestmentLevel>>;

export const investmentLevel = (
  promotion: { investments?: Investments },
  id: InvestmentId,
): InvestmentLevel => promotion.investments?.[id] ?? 0;

/** One department's fortnightly cost at a level, against the promotion's own overheads. */
export function departmentCost(
  id: InvestmentId,
  level: InvestmentLevel,
  overheads: number,
): number {
  if (level === 0) return 0;
  const cost = Math.max(MINIMUM_PER_LEVEL, overheads * INVESTMENT_META[id].share) * level;
  return Math.round(cost * 10) / 10;
}

/** Everything the promotion has chosen to fund, per fortnight, in thousands. */
export function investmentCost(
  promotion: { investments?: Investments },
  overheads: number,
): number {
  return (
    Math.round(
      INVESTMENTS.reduce(
        (sum, id) => sum + departmentCost(id, investmentLevel(promotion, id), overheads),
        0,
      ) * 10,
    ) / 10
  );
}

// --- The effects ---------------------------------------------------------------------------------

/** How wide a scout's error is, as a share of an unscouted promotion's. */
export const scoutingAccuracy = (level: InvestmentLevel): number => [1, 0.75, 0.55, 0.4][level]!;

/** Camp injuries and fight-week withdrawals, as a share of the unstaffed rate. */
export const medicalFactor = (level: InvestmentLevel): number => [1, 0.85, 0.72, 0.6][level]!;

/** The buzz a marketing department will not let the promotion fall below. */
export const marketingFloor = (level: InvestmentLevel): number => [0, 15, 25, 35][level]!;

/** What a matchmaker does to the chance a corner says yes, as a multiplier. */
export const matchmakerAcceptance = (level: InvestmentLevel): number =>
  [1, 1.05, 1.1, 1.15][level]!;

/** How many fighters autofill considers as the first name in a slot. */
export const matchmakerReach = (level: InvestmentLevel): number => 40 + 20 * level;

/** Whether the head-space card's third option is open (doc 34 C6). */
export const hasPsychologist = (promotion: { investments?: Investments }): boolean =>
  investmentLevel(promotion, 'psychologist') > 0;

/** A promotion with one department set to a level, the rest unchanged. */
export function withInvestment(
  promotion: Promotion,
  id: InvestmentId,
  level: InvestmentLevel,
): Promotion {
  const investments: Investments = {
    ...promotion.investments,
    [id]: clamp(level, 0, 3) as InvestmentLevel,
  };
  if (level === 0) delete investments[id];
  return {
    ...promotion,
    investments: Object.keys(investments).length > 0 ? investments : undefined,
  };
}

/** A line saying what a level buys, for the screen. */
export function describeEffect(id: InvestmentId, level: InvestmentLevel): string {
  if (level === 0) return 'None.';
  switch (id) {
    case 'matchmaker':
      return `Corners about ${Math.round((matchmakerAcceptance(level) - 1) * 100)}% likelier to say yes; autofill weighs ${matchmakerReach(level)} fighters a slot.`;
    case 'scouting':
      return `Scouted ratings ${Math.round((1 - scoutingAccuracy(level)) * 100)}% closer to the truth.`;
    case 'medical':
      return `About ${Math.round((1 - medicalFactor(level)) * 100)}% fewer camp injuries and fight-week withdrawals.`;
    case 'marketing':
      return `Buzz never falls below ${marketingFloor(level)}.`;
    case 'psychologist':
      return 'A sports psychologist is available to any fighter whose head is not right.';
  }
}
