/**
 * Managers.
 *
 * See docs/16-contracts-free-agency-managers.md, Part 3. The design problem, stated by the
 * fun brief and solved by the realism brief: the first draft gave a manager four monotone
 * numbers and one hidden coin-flip, which makes "choosing a manager" identical to "pick the
 * biggest number the gate allows" — the same non-decision the gym picker already offers.
 *
 * The fix is a data-shape fix, and the two critics arrived at it from opposite ends.
 * `connections` is **per-promotion**, not a scalar. A scalar collapses into a tier ordering;
 * a vector cannot be ordered at all, so there is no best manager — only one who is good for
 * the career you are trying to have. The realism brief wanted it because the real thing is a
 * relationship with a specific matchmaker; the fun brief wanted managers to be shapes rather
 * than tiers. Same change.
 *
 * The house rule this module exists to honour:
 *
 *   **Any hidden number must have a derived observable.**
 *
 * `integrity` is hidden and readable through the advice record. `favour` is hidden and
 * readable through where he actually places people. A hidden number with no observable is
 * not depth; it is a coin-flip the player cannot play around.
 */

import { clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { FighterId, ManagerId, PromotionId } from '../core/ids.js';
import type { Personality } from '../domain/personality.js';
import type { Rng } from '../core/rng.js';

/** One falsifiable prediction, and whether it came true. */
export interface AdviceRecord {
  day: GameDay;
  boutId: string;
  /** What he said: take it, or do not. */
  recommended: boolean;
  /** Set once the fight has happened. Undefined while it is still pending. */
  wasRight?: boolean;
  /** The line he actually said, kept so the hub can quote him back. */
  line: string;
}

export interface Manager {
  id: ManagerId;
  name: string;

  /** 1–100. Purse achieved against market value. Monotone, and that is fine — it is the price of the percentage. */
  negotiation: number;
  /** 1–100. Whether a promotion fears annoying them. Drives short-notice and favourable matchmaking. */
  standing: number;
  /** 1–100, hidden. Whether they will lie to you. Never shown; readable through the advice record. */
  integrity: number;

  /** 0–100 per promotion. Who takes their call. The whole point of the type. */
  connections: Partial<Record<PromotionId, number>>;
  /** Hidden. How soft they are on a promotion that feeds them bookings. Readable through placements. */
  favour: Partial<Record<PromotionId, number>>;

  /** 0.08–0.15 of purse. 20% is an outlier and regarded as predatory. */
  purseRate: number;
  /** 0.15–0.20 of sponsorship. The higher rate lives here, which is the quiet misalignment. */
  sponsorshipRate: number;

  clientIds: readonly FighterId[];
  personality: Personality;
  advice: readonly AdviceRecord[];
  /** One line, shown instead of any of the numbers above. */
  blurb: string;
}

// --- What a manager actually does ---------------------------------------------------------------

/**
 * How much of market value they get, 0.8× to 1.3×.
 *
 * This is what the percentage buys, and it has to be able to more than pay for itself or the
 * optimal play is to self-manage — which the fun brief correctly identified as the failure
 * state for the whole role.
 */
export function negotiationMultiplier(manager: Manager | undefined): number {
  if (!manager) {
    // Self-managed. Doc 16 keeps this as a legitimate hard mode: you keep 100% and you are
    // negotiating against people who do this for a living.
    return 0.85;
  }
  return 0.8 + clamp01(manager.negotiation / 100) * 0.5;
}

/** Whether this manager can get you in the door at all. */
export function connectionTo(manager: Manager | undefined, promotionId: PromotionId): number {
  if (!manager) {
    // Unmanaged fighters only hear from promotions that already know them.
    return 20;
  }
  return manager.connections[promotionId] ?? 10;
}

/**
 * Portfolio indifference.
 *
 * The realism correction to the draft, which had stable size diluting *attention*. The real
 * effect is worse and more interesting: a manager with thirty clients is running a portfolio,
 * any individual fighter is expendable, and taking the short-notice fight for client #22 is
 * entirely rational even if it ends him.
 *
 * Returns 0–1, where 1 is "you are the only one he has".
 */
export function priority(manager: Manager | undefined, fighterId: FighterId): number {
  if (!manager) return 1;
  const size = Math.max(1, manager.clientIds.length);
  const isClient = manager.clientIds.includes(fighterId);
  if (!isClient) return 0;
  return clamp01(1 / Math.sqrt(size));
}

/** Said in a sentence, never as a stat. */
export function describeStable(manager: Manager): string {
  const n = manager.clientIds.length;
  if (n <= 1) return 'You are the only fighter he has.';
  if (n <= 4) return `He has ${n} fighters. You get his attention.`;
  if (n <= 12) return `He has ${n} fighters. You are one of the ones he thinks about.`;
  return `He has ${n} fighters. You are not the priority.`;
}

/**
 * Whether he will put two of his own in against each other.
 *
 * The fun brief's rule, adopted: **always a price, never a wall.** A removed option with no
 * counterplay is precisely the intermediary problem that makes managers feel like a tax. So
 * this returns a cost, not a refusal.
 */
export function stableConflictCost(manager: Manager | undefined, opponentId: FighterId): number {
  if (!manager) return 0;
  return manager.clientIds.includes(opponentId) ? 0.05 : 0;
}

// --- The advice record, which is the mechanic that saves the role -------------------------------

/**
 * How often he has been right, and how many times he has said anything.
 *
 * One number, and it does four jobs: it makes overruling him a bet with a scoreboard, it
 * makes `integrity` observable without ever displaying it, it *is* the relationship, and it
 * turns "my manager told me not to take that fight" into a story a player tells somebody.
 */
export function adviceRecord(manager: Manager | undefined): { right: number; total: number } {
  if (!manager) return { right: 0, total: 0 };
  const settled = manager.advice.filter((a) => a.wasRight !== undefined);
  return { right: settled.filter((a) => a.wasRight).length, total: settled.length };
}

export function describeAdviceRecord(manager: Manager | undefined): string {
  const { right, total } = adviceRecord(manager);
  if (!manager) return 'You have nobody advising you.';
  if (total === 0) return 'He has not been tested yet.';
  return `He has been right ${right} of ${total} times.`;
}

/**
 * Whether he recommends taking a bout, and what he says about it.
 *
 * The recommendation is honest *in proportion to integrity*, and biased by two things a
 * fighter cannot see: how much he needs the cheque, and how soft he is on this promotion.
 * A low-integrity manager with a big stable pushes fights that should not be taken.
 */
export function adviseOnBout(input: {
  manager: Manager | undefined;
  /** −1 (a terrible idea) to +1 (a clear opportunity), from the game's own appraisal. */
  merit: number;
  promotionId: PromotionId;
  purse: number;
  rng: Rng;
}): { recommended: boolean; line: string } {
  const { manager, merit, promotionId, purse, rng } = input;

  if (!manager) {
    return {
      recommended: merit >= 0,
      line: 'Nobody is advising you. This is entirely your call.',
    };
  }

  const honesty = clamp01(manager.integrity / 100);
  const favour = clamp01((manager.favour[promotionId] ?? 0) / 100);
  // What is in it for him: his cut, weighted by how little he cares about this particular
  // client. This is the misalignment, expressed as a number.
  const selfInterest = clamp01(purse / 200) * (1 - honesty) + favour * 0.3 * (1 - honesty);

  const adjusted = merit + selfInterest * 1.2;
  const recommended = adjusted > 0;

  const line = recommended
    ? merit < -0.2
      ? 'Take it. The money is right and you are ready for him.'
      : 'This is a good fight for you. Take it.'
    : merit > 0.2
      ? 'I would sit this one out. There is a better one coming.'
      : 'Do not take this one. He is too big for you right now.';

  void rng;
  return { recommended, line };
}

/** Log the outcome against what he said, once the fight has happened. */
export function settleAdvice(
  manager: Manager,
  boutId: string,
  outcome: { fighterWon: boolean },
): Manager {
  return {
    ...manager,
    advice: manager.advice.map((a) =>
      a.boutId === boutId && a.wasRight === undefined
        ? { ...a, wasRight: a.recommended === outcome.fighterWon }
        : a,
    ),
  };
}

/** Record a prediction at the moment it is made. */
export function recordAdvice(manager: Manager, entry: Omit<AdviceRecord, 'wasRight'>): Manager {
  return { ...manager, advice: [...manager.advice, entry] };
}

// --- Placement history, which is how `favour` becomes observable ---------------------------------

/**
 * Where he has actually put people.
 *
 * The derived observable for the hidden `favour` vector: *"he has placed nine of his last
 * twelve fighters at Apex"* tells a player everything the hidden number means without ever
 * showing it, and lets them work out for themselves whose interests are being served.
 */
export function placementSummary(
  placements: readonly PromotionId[],
  nameOf: (id: PromotionId) => string,
): string {
  if (placements.length === 0) return 'He has not placed anybody yet.';
  const counts = new Map<PromotionId, number>();
  for (const id of placements) counts.set(id, (counts.get(id) ?? 0) + 1);

  const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  // A genuine majority, not merely the largest share — an even split between two promotions
  // is not a favourite, and calling it one would be the observable lying about the hidden
  // number it exists to expose.
  if (topCount / placements.length <= 0.5) {
    return `He has placed fighters across ${counts.size} promotions.`;
  }
  return `He has placed ${topCount} of his last ${placements.length} fighters at ${nameOf(topId)}.`;
}

// --- What a manager costs -----------------------------------------------------------------------

export const MANAGER_PURSE_RATE_RANGE: readonly [number, number] = [0.08, 0.15];
export const MANAGER_SPONSORSHIP_RATE_RANGE: readonly [number, number] = [0.15, 0.2];

/**
 * Whether a manager will take a fighter on.
 *
 * The realism correction to "a debutant gets whoever will take them, which is nobody good":
 * good managers **speculate on prospects**, early, on a respected coach's recommendation,
 * long before the fighter is worth anything. So the gate is hidden potential filtered through
 * the credibility of the room, not a reputation grind — which is also a far better reward for
 * having chosen a good gym.
 */
export function willRepresent(input: {
  manager: Manager;
  fighterReputation: number;
  /** Hidden. The manager is betting on this, not on the record. */
  fighterPotential: number;
  /** Prestige of the gym vouching for them. */
  gymPrestige: number;
}): boolean {
  const { manager, fighterReputation, fighterPotential, gymPrestige } = input;
  // How choosy he can afford to be.
  const bar = 20 + manager.negotiation * 0.35 + manager.standing * 0.2;
  const pitch = fighterReputation * 0.4 + fighterPotential * 0.4 + gymPrestige * 0.35;
  return pitch >= bar;
}

export function describeManager(manager: Manager): string {
  return manager.blurb;
}

/** The rate the fighter actually pays, for the money layer. */
export const purseRateOf = (manager: Manager | undefined): number => manager?.purseRate ?? 0;
export const sponsorshipRateOf = (manager: Manager | undefined): number =>
  manager?.sponsorshipRate ?? 0;
