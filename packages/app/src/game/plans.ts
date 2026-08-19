/**
 * Planning a card, over game months.
 *
 * The single biggest change to promoter mode. "Build a card" used to mean *generate an event
 * now*: the screen opened with nine fights the matchmaker had chosen, the player disagreed with
 * whichever ones they cared about, and pressing the button both booked and ran the night. Every
 * important thing about running a promotion happened somewhere between those two clicks and was
 * invisible.
 *
 * What replaces it is a plan that lives in the save. A promoter creates an April card in
 * January with nothing on it, books the champion in February, agrees a challenger in March and
 * fills the last prelim the week of the show. Slots are allowed to be empty for months, because
 * that is what forward planning is.
 *
 * Three rules hold this module together:
 *
 *  **Nothing is booked until both corners agree.** Placing a fighter in a slot is an intention
 *  (`draft`). Sending it is an offer, and the answer comes back with a name and a reason.
 *
 *  **Autofill is a tool, never the game.** Every autofill is scoped — this section, these
 *  remaining slots — and every one of them can be asked for *suggestions* instead, which the
 *  player approves individually. The matchmaker never books anything the player did not ask it
 *  to book.
 *
 *  **Every suggestion can explain itself.** `appraiseMatchup` comes back with tags, a risk read
 *  and a sentence. A proposal the player cannot interrogate is the game playing itself.
 */

import {
  GROUP_ORDER,
  acceptanceOf,
  appraiseMatchup,
  awardBonuses,
  bonusPoolFor,
  buildCard,
  createRng,
  describePullOut,
  displayName,
  drawWeight,
  eventName,
  eventRevenue,
  expectedDemand,
  getDivision,
  groupFor,
  inboxId,
  isActive,
  paperOdds,
  plannedBouts,
  planIssues,
  planProgress,
  pullOutRisk,
  rankDivision,
  rankOf,
  rematchCooldownFor,
  roundsFor,
  scoreForIntent,
  settleNight,
  slotsFor,
  venueFor,
  withSlot,
  DELIVERY_MEMORY,
  type BoutSeed,
  type CardPosition,
  type CornerAnswer,
  type EventPlan,
  type EventScale,
  type Fighter,
  type FightNight,
  type IntentAppraisal,
  type Manager,
  type MatchIntentId,
  type NewsItem,
  type OpponentGroup,
  type PlannedBout,
  type PlanIssue,
  type PlanSlot,
  type Promotion,
  type PromotionalAgreement,
  type RankedFighter,
  type TitleKind,
} from '@mmasim/engine';
import { getWorld, type Entity, type GameDb } from '@mmasim/data';
import { appendNews, runCardBout } from './world';
import { currentPurse } from './money';
import { raise, recordOfferOutcome } from './inbox';

/** How far ahead a brand-new card is pencilled in by default. Long enough to be a plan. */
export const DEFAULT_LEAD_DAYS = 84;

/** The soonest a card can be created. Anything less is not planning, it is panic. */
export const MINIMUM_LEAD_DAYS = 14;

type StoredPlan = EventPlan & Entity;

// --- Storage ------------------------------------------------------------------------------------

export const allPlans = (db: GameDb): EventPlan[] => db.plans.findAll() as StoredPlan[];

export function plansFor(db: GameDb, promotionId: string | undefined): EventPlan[] {
  if (!promotionId) return [];
  return allPlans(db)
    .filter((p) => p.promotionId === promotionId && p.status !== 'run' && p.status !== 'cancelled')
    .sort((a, b) => a.day - b.day);
}

export const planById = (db: GameDb, id: string): EventPlan | undefined =>
  db.plans.findById(id) as StoredPlan | undefined;

/** The next card the player has to deliver, which is what the dashboard leads with. */
export const nextPlan = (
  db: GameDb,
  promotionId: string | undefined,
  day: number,
): EventPlan | undefined => plansFor(db, promotionId).find((p) => p.day >= day);

export function savePlan(db: GameDb, plan: EventPlan): EventPlan {
  db.plans.upsert(plan as StoredPlan);
  db.save();
  return plan;
}

export function cancelPlan(db: GameDb, planId: string): void {
  const plan = planById(db, planId);
  if (!plan) return;
  // Kept rather than deleted: a cancelled card is a thing that happened, and the fighters who
  // were on it have a legitimate grievance the roster screen should be able to see.
  savePlan(db, { ...plan, status: 'cancelled' });
}

/**
 * A new, empty card on a chosen date.
 *
 * Named provisionally from the promotion and the date. A card two hundred days out has no main
 * event to be named after, and `eventName` needs one — so the plan carries a working title and
 * takes its real name on the night, when there is a headline to name it for.
 */
export function createPlan(input: {
  db: GameDb;
  promotion: Promotion;
  day: number;
  city?: string;
  country?: string;
  scale?: EventScale;
  name?: string;
}): EventPlan {
  const { db, promotion, day, scale = 'standard' } = input;
  const existing = allPlans(db).filter((p) => p.promotionId === promotion.id).length;

  const plan: EventPlan = {
    id: `plan_${promotion.id}_${day}_${existing}`,
    promotionId: promotion.id,
    day,
    name: input.name?.trim() || `${promotion.shortName} ${existing + 1}`,
    city: input.city ?? defaultMarket(promotion).city,
    country: input.country ?? defaultMarket(promotion).country,
    scale,
    broadcast: broadcastFor(promotion),
    status: 'planning',
    slots: slotsFor(scale),
  };

  return savePlan(db, plan);
}

/** Broadcast follows the promotion's platform, which is not yet a player decision. */
export const broadcastFor = (promotion: Promotion): FightNight['broadcast'] =>
  promotion.tier === 'global' ? 'ppv' : promotion.tier === 'major' ? 'televised' : 'streamed';

const defaultMarket = (promotion: Promotion): { city: string; country: string } => {
  const home = MARKETS.find((m) => m.country === promotion.baseCountry);
  return home ?? MARKETS[0]!;
};

/**
 * Where a card can be staged.
 *
 * Markets rather than buildings: the room is chosen on the night by `venueFor`, which sizes it
 * to the crowd the card will actually draw — booking an arena for a show that sells four
 * thousand seats is a decision no promoter makes and the model already knows it. What the
 * player is choosing here is the *audience*, which is a real decision because a local fighter
 * draws at home and nowhere else.
 */
export const MARKETS: readonly { city: string; country: string; note: string }[] = [
  {
    city: 'Las Vegas',
    country: 'USA',
    note: 'The sport’s shop window. Expensive, and everybody watches.',
  },
  {
    city: 'Sacramento',
    country: 'USA',
    note: 'A working fight town. Cheap to run, reliably full.',
  },
  { city: 'Manchester', country: 'UK', note: 'Loud, loyal, and it turns out for its own.' },
  {
    city: 'Tokyo',
    country: 'Japan',
    note: 'Enormous when it lands. Indifferent when it does not.',
  },
  {
    city: 'Rotterdam',
    country: 'Netherlands',
    note: 'A small room and a hard crowd. Where reputations start.',
  },
];

// --- Reading the world around a plan --------------------------------------------------------------

/**
 * Everything the matchmaking screens need, computed once.
 *
 * Rankings are the expensive part — `rankDivision` walks the whole roster per division — and the
 * builder asks for them on every keystroke of a filter. Computing them once per render and
 * passing the context down is the difference between a screen that responds and one that does
 * not on a phone.
 */
export interface PromoterContext {
  db: GameDb;
  promotion: Promotion;
  day: number;
  /** The day the save began, so "never fought here" can be measured against something real. */
  startedDay: number;
  roster: readonly Fighter[];
  /** Division id → ranked list, champion at position 0. */
  ranks: Map<string, readonly RankedFighter[]>;
  /** Fighter id → every plan day they are already committed to. */
  commitments: Map<string, number[]>;
}

export function promoterContext(input: {
  db: GameDb;
  promotion: Promotion;
  day: number;
}): PromoterContext {
  const { db, promotion, day } = input;
  const fighters = db.fighters.findAll() as Fighter[];
  const promotions = db.promotions.findAll() as unknown as Promotion[];

  const roster = fighters.filter((f) => f.promotionId === promotion.id && isActive(f, day));

  const ranks = new Map<string, readonly RankedFighter[]>();
  for (const divisionId of new Set(roster.map((f) => f.divisionId as string))) {
    ranks.set(
      divisionId,
      rankDivision(
        fighters,
        divisionId as never,
        promotion.id,
        day,
        promotion.champions[divisionId as never],
        promotions,
      ),
    );
  }

  // Who is already spoken for, and when. A fighter pencilled onto the April card is not
  // available for the March one, and three months of planning makes that impossible to hold in
  // your head.
  const commitments = new Map<string, number[]>();
  for (const plan of plansFor(db, promotion.id as string)) {
    for (const bout of plannedBouts(plan)) {
      for (const id of [bout.redId as string, bout.blueId as string]) {
        commitments.set(id, [...(commitments.get(id) ?? []), plan.day]);
      }
    }
  }

  return {
    db,
    promotion,
    day,
    startedDay: getWorld(db).startedDay ?? day,
    roster,
    ranks,
    commitments,
  };
}

export const rankOfFighter = (ctx: PromoterContext, fighter: Fighter): number | undefined =>
  rankOf(ctx.ranks.get(fighter.divisionId as string) ?? [], fighter.id);

export const championOfDivision = (
  ctx: PromoterContext,
  divisionId: string,
): Fighter | undefined => {
  const id = ctx.promotion.champions[divisionId as never];
  return id ? (ctx.db.fighters.findById(id as string) as Fighter | undefined) : undefined;
};

/**
 * Why this fighter cannot take this fight, if they cannot.
 *
 * Returned as a sentence rather than a boolean because a promoter's problem is rarely
 * "unavailable" — it is "suspended until March", which is a scheduling decision rather than a
 * refusal. Only a hard block returns a string; a soft concern belongs in the appraisal.
 */
export function blockerFor(input: {
  ctx: PromoterContext;
  fighter: Fighter;
  plan: EventPlan;
  /** Slot being filled, so a fighter already in *this* slot is not blocked by themselves. */
  ignoreSlotId?: string;
}): string | undefined {
  const { ctx, fighter, plan, ignoreSlotId } = input;

  if (fighter.retiredDay !== undefined) return 'Retired.';
  if ((fighter.readyOnDay ?? 0) > plan.day) {
    const days = (fighter.readyOnDay ?? 0) - plan.day;
    return `Not medically cleared until ${days} days after this card.`;
  }

  // On this card already, in another slot.
  for (const slot of plan.slots) {
    if (slot.id === ignoreSlotId || !slot.bout) continue;
    if (slot.bout.redId === fighter.id || slot.bout.blueId === fighter.id) {
      return 'Already booked on this card.';
    }
  }

  // On another card close enough that both cannot happen.
  const clash = (ctx.commitments.get(fighter.id as string) ?? []).find(
    (day) => day !== plan.day && Math.abs(day - plan.day) < 42,
  );
  if (clash !== undefined) return 'Booked on another card within six weeks.';

  return undefined;
}

// --- Choosing a fighter ---------------------------------------------------------------------------

export interface SubjectOption {
  fighter: Fighter;
  rank?: number;
  isChampion: boolean;
  blocker?: string;
  /** Days since their last bout. The number a promoter checks first. */
  daysIdle: number;
}

/**
 * Who could be the first name in this slot.
 *
 * Sorted by *who needs a fight*, not alphabetically, because the roster screen has already
 * established that the useful order is by who has a problem. A promoter opening a slot is
 * usually looking for somebody owed a bout, not for a specific person — and when they do want a
 * specific person, they search.
 */
export function subjectsFor(input: {
  ctx: PromoterContext;
  plan: EventPlan;
  slotId: string;
  divisionId?: string;
  search?: string;
}): SubjectOption[] {
  const { ctx, plan, slotId, divisionId, search } = input;
  const needle = search?.trim().toLowerCase();

  return ctx.roster
    .filter((f) => (divisionId ? (f.divisionId as string) === divisionId : true))
    .filter((f) => (needle ? displayName(f).toLowerCase().includes(needle) : true))
    .map<SubjectOption>((fighter) => ({
      fighter,
      rank: rankOfFighter(ctx, fighter),
      isChampion: ctx.promotion.champions[fighter.divisionId] === fighter.id,
      blocker: blockerFor({ ctx, fighter, plan, ignoreSlotId: slotId }),
      daysIdle: daysUnbookedBy(fighter, ctx.day, ctx.startedDay),
    }))
    .sort((a, b) => {
      // Available first, then whoever has been waiting longest.
      if (!!a.blocker !== !!b.blocker) return a.blocker ? 1 : -1;
      return b.daysIdle - a.daysIdle;
    });
}

/**
 * Days since this fighter last competed *in this simulation*.
 *
 * `undefined` when they have not fought since the save began, which is not the same as "a very
 * long layoff" and must not be treated as one. A seeded fighter's real career lives in
 * `priorRecord`, which carries no dates — so on day one the game genuinely does not know when
 * anybody last fought, and the honest answer is that it does not know.
 *
 * Getting this wrong is not cosmetic: measuring from the pro debut instead opens a fresh save
 * with every champion in the sport flagged as nine years inactive, which buries the things that
 * are actually true under six identical alarms.
 */
export function daysIdleOf(fighter: Fighter, day: number): number | undefined {
  const last = fighter.record[fighter.record.length - 1]?.day;
  return last === undefined ? undefined : day - last;
}

/**
 * The same question, measured from the start of the save for somebody who has never fought here.
 *
 * The right answer for "have I left this person on the shelf", which is about the *promoter's*
 * conduct rather than the fighter's history. A fighter you have not booked since you took over
 * has been idle for exactly as long as you have been in charge.
 */
export function daysUnbookedBy(fighter: Fighter, day: number, startedDay: number): number {
  return daysIdleOf(fighter, day) ?? day - startedDay;
}

// --- Choosing an opponent --------------------------------------------------------------------------

export interface OpponentOption {
  fighter: Fighter;
  rank?: number;
  appraisal: IntentAppraisal;
  group: OpponentGroup;
  /** 0–1 chance they take it, before the offer goes out. */
  acceptance: number;
  /** Their single biggest reservation, if they have one. */
  concern?: string;
  blocker?: string;
  /** Thousands. What this pairing commits the promotion to. */
  cost: number;
  /** Contract state worth knowing before booking them. */
  contractNote?: string;
}

/**
 * The opponents worth considering for a chosen fighter, grouped by what kind of fight it is.
 *
 * Deliberately not an alphabetical roster with a search box. A promoter picking an opponent is
 * choosing between *kinds of fight* — a title eliminator, a build-up, a step up they might lose
 * — and the list has to be organised around that decision or it is a database query with a
 * button on it.
 *
 * Every row carries the context the choice actually needs: the rank, whether they will say yes,
 * what it costs, what is left on their deal, and one sentence saying why this pairing is here.
 */
export function opponentsFor(input: {
  ctx: PromoterContext;
  plan: EventPlan;
  slot: PlanSlot;
  subject: Fighter;
  intent?: MatchIntentId;
  /** Include fighters outside the subject's division, for a catchweight. */
  crossDivision?: boolean;
  search?: string;
  limit?: number;
}): OpponentOption[] {
  const { ctx, plan, slot, subject, intent, crossDivision = false, search, limit = 40 } = input;
  const needle = search?.trim().toLowerCase();
  const subjectRank = rankOfFighter(ctx, subject);

  const recent = new Set(
    subject.record
      .filter((r) => ctx.day - r.day <= rematchCooldownFor(r))
      .map((r) => r.opponentId as string),
  );

  const pool = ctx.roster.filter(
    (f) =>
      f.id !== subject.id &&
      f.sex === subject.sex &&
      (crossDivision || f.divisionId === subject.divisionId) &&
      (needle ? displayName(f).toLowerCase().includes(needle) : true),
  );

  const options = pool.map<OpponentOption>((fighter) => {
    const cost = pairCost(ctx.db, subject, fighter, slot.position);
    const appraisal = appraiseMatchup({
      subject,
      opponent: fighter,
      promotion: ctx.promotion,
      day: ctx.day,
      subjectRank,
      opponentRank: rankOfFighter(ctx, fighter),
      cost,
      position: slot.position,
      localMarket: fighter.nationality === plan.country,
    });

    const read = acceptanceOf({
      fighter,
      opponent: subject,
      promotion: ctx.promotion,
      manager: managerOf(ctx.db, fighter),
      notice: plan.day - ctx.day < 35 ? 'short' : 'full',
      isTitleFight: slot.bout?.titleKind !== undefined,
    });

    return {
      fighter,
      rank: rankOfFighter(ctx, fighter),
      appraisal,
      group: groupFor(appraisal, false),
      acceptance: read.chance,
      concern: read.concern,
      blocker:
        recent.has(fighter.id as string) && !appraisal.tags.includes('rematch')
          ? 'They fought too recently to run it back.'
          : blockerFor({ ctx, fighter, plan, ignoreSlotId: slot.id }),
      cost,
      contractNote: contractNoteFor(ctx.db, fighter),
    };
  });

  /*
   * The top few by the chosen purpose become "Recommended", and everything else keeps its
   * natural category. That is what makes the intent picker a real control: the list does not
   * change, the *order and the headline* do, which is exactly how a matchmaker's thinking works.
   */
  const purpose = intent ?? defaultIntentFor(slot.position);
  const scored = options
    .filter((o) => !o.blocker)
    .map((o) => ({ o, score: scoreForIntent(o.appraisal, purpose) * (0.35 + o.acceptance * 0.65) }))
    .sort((a, b) => b.score - a.score);

  const recommended = new Set(scored.slice(0, 3).map((s) => s.o.fighter.id as string));
  for (const option of options) {
    if (recommended.has(option.fighter.id as string)) option.group = 'recommended';
  }

  return options
    .sort((a, b) => {
      if (!!a.blocker !== !!b.blocker) return a.blocker ? 1 : -1;
      const groupGap = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
      if (groupGap !== 0) return groupGap;
      return b.acceptance - a.acceptance;
    })
    .slice(0, limit);
}

/** What each slot is for, when the player has not said otherwise. */
export const defaultIntentFor = (position: CardPosition): MatchIntentId =>
  position === 'mainEvent'
    ? 'titleEliminator'
    : position === 'coMain'
      ? 'competitive'
      : position === 'mainCard'
        ? 'competitive'
        : 'fillCheaply';

function pairCost(db: GameDb, red: Fighter, blue: Fighter, position: CardPosition): number {
  let total = 0;
  for (const fighter of [red, blue]) {
    const purse = currentPurse(db, fighter, position);
    if (purse) total += purse.show + purse.win * 0.5;
  }
  return Math.round(total);
}

const managerOf = (db: GameDb, fighter: Fighter): Manager | undefined =>
  fighter.managerId
    ? (db.managers.findById(fighter.managerId as string) as Manager | undefined)
    : undefined;

function contractNoteFor(db: GameDb, fighter: Fighter): string | undefined {
  const agreement = fighter.agreementId
    ? (db.agreements.findById(fighter.agreementId as string) as PromotionalAgreement | undefined)
    : undefined;
  if (!agreement) return 'No written deal — a free agent in all but name.';
  if (agreement.fightsRemaining <= 0) return 'Obligations met. Free to talk to anybody.';
  if (agreement.fightsRemaining === 1) return 'One fight left on the deal.';
  return undefined;
}

// --- Title fights -------------------------------------------------------------------------------

export interface TitleOption {
  kind: TitleKind;
  label: string;
  /** Why this is or is not available, in plain words. */
  reason: string;
  available: boolean;
}

/**
 * Which kind of championship bout, if any, this pairing could be.
 *
 * The three cases are genuinely different decisions and the model had none of them: an interim
 * belt exists *because* the champion cannot fight, a vacant one because there is no champion,
 * and an undisputed one needs the champion in it. Letting the player designate the bout rather
 * than having the game decide arbitrarily is doc 13's own requirement.
 */
export function titleOptionsFor(input: {
  ctx: PromoterContext;
  red: Fighter;
  blue: Fighter;
  plan: EventPlan;
}): TitleOption[] {
  const { ctx, red, blue, plan } = input;
  const divisionId = red.divisionId as string;
  const champion = championOfDivision(ctx, divisionId);
  const sameDivision = red.divisionId === blue.divisionId;
  const championInvolved = champion?.id === red.id || champion?.id === blue.id;

  const contenderish = (f: Fighter) => {
    const rank = rankOfFighter(ctx, f);
    return rank !== undefined && rank <= 6;
  };

  const options: TitleOption[] = [];

  options.push({
    kind: 'undisputed',
    label: 'For the title',
    available: sameDivision && championInvolved,
    reason: !sameDivision
      ? 'Two different divisions. There is no belt this could be for.'
      : !champion
        ? 'The belt is vacant — this would be a vacant title fight.'
        : championInvolved
          ? `${displayName(champion)} defends.`
          : `${displayName(champion)} holds the belt, and is not in this fight.`,
  });

  options.push({
    kind: 'vacant',
    label: 'For the vacant title',
    available: sameDivision && champion === undefined && contenderish(red) && contenderish(blue),
    reason:
      champion !== undefined
        ? 'The belt is not vacant.'
        : contenderish(red) && contenderish(blue)
          ? 'Nobody holds it. The winner does.'
          : 'A vacant belt goes to two ranked contenders, not to whoever is available.',
  });

  /*
   * An interim belt is not a cosmetic upgrade — it exists for one reason, which is a champion
   * who cannot defend. Offering it while the champion is fit and available would turn it into
   * free prestige, which is exactly what makes real interim titles contentious.
   */
  const championUnavailable =
    champion !== undefined &&
    ((champion.readyOnDay ?? 0) > plan.day ||
      daysUnbookedBy(champion, ctx.day, ctx.startedDay) > 300);

  options.push({
    kind: 'interim',
    label: 'For the interim title',
    available:
      sameDivision &&
      championUnavailable &&
      !championInvolved &&
      contenderish(red) &&
      contenderish(blue),
    reason: !champion
      ? 'There is no champion to stand in for. This would be for the vacant belt.'
      : championInvolved
        ? 'The champion is in this fight. It is for the real belt.'
        : championUnavailable
          ? `${displayName(champion)} cannot defend. The division needs somebody to fight.`
          : `${displayName(champion)} is fit and available, so there is nothing to be interim about.`,
  });

  return options;
}

// --- Placing, offering and answering ----------------------------------------------------------------

export function placeBout(input: {
  plan: EventPlan;
  slotId: string;
  redId: string;
  blueId: string;
  divisionId: string;
  titleKind?: TitleKind;
  catchweightLbs?: number;
}): EventPlan {
  const { plan, slotId, redId, blueId, divisionId, titleKind, catchweightLbs } = input;
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!slot) return plan;

  const bout: PlannedBout = {
    redId: redId as never,
    blueId: blueId as never,
    divisionId: divisionId as never,
    status: 'draft',
    titleKind,
    catchweightLbs,
    rounds: roundsFor(slot.position, titleKind),
  };

  return withSlot(plan, slotId, bout);
}

export const clearSlot = (plan: EventPlan, slotId: string): EventPlan =>
  withSlot(plan, slotId, undefined);

export interface OfferOutcome {
  slotId: string;
  bout: PlannedBout;
  accepted: boolean;
  /** Each corner's answer, in their own words. */
  answers: readonly CornerAnswer[];
}

/**
 * Put an offer in front of both corners and find out.
 *
 * Seeded on the bout and the card day rather than on the call, so re-reading an offer cannot
 * reroll it. A promoter who could refresh until everybody said yes is back to a card that always
 * fills, which is the thing this whole rework exists to stop.
 *
 * A refusal is not always final: a fighter who wants more money says so, and what comes back is
 * a price rather than a door closing. That is the difference between matchmaking and a dice
 * roll.
 */
export function sendOffer(input: {
  ctx: PromoterContext;
  plan: EventPlan;
  slotId: string;
}): { plan: EventPlan; outcome: OfferOutcome } | undefined {
  const { ctx, plan, slotId } = input;
  const db = ctx.db;
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!slot?.bout) return undefined;

  const world = getWorld(db);
  const bout = slot.bout;
  const red = ctx.db.fighters.findById(bout.redId as string) as Fighter | undefined;
  const blue = ctx.db.fighters.findById(bout.blueId as string) as Fighter | undefined;
  if (!red || !blue) return undefined;

  const notice = plan.day - ctx.day < 35 ? 'short' : 'full';
  const answers: CornerAnswer[] = [];
  let accepted = true;

  for (const [fighter, opponent] of [
    [red, blue],
    [blue, red],
  ] as const) {
    const read = acceptanceOf({
      fighter,
      opponent,
      promotion: ctx.promotion,
      manager: managerOf(ctx.db, fighter),
      notice,
      isTitleFight: bout.titleKind !== undefined,
    });

    const rng = createRng(
      `${world.seed}:offer:${plan.id}:${slotId}:${bout.redId}:${bout.blueId}:${fighter.id}`,
    );

    if (rng.chance(read.chance)) {
      answers.push({ fighterId: fighter.id, verdict: 'accepted', note: 'They will take it.' });
      continue;
    }

    accepted = false;

    /*
     * A counter rather than a refusal when money is the problem.
     *
     * Whether somebody can be bought is a question about them, not about the fight: a fighter
     * who rates the money above everything else names a price, and one who has decided the
     * opponent is wrong for them does not. `purseDemand` and the loyalty axis already encode
     * that, and this is the first thing in the game to ask them.
     */
    const buyable = fighter.personality.loyalty < 55 && read.chance > 0.18;
    if (buyable) {
      const base = currentPurse(ctx.db, fighter, slot.position);
      const show = base?.show ?? ctx.promotion.minimumPurse;
      // The ask scales with how reluctant they are: a near-yes is cheap to close.
      const multiplier = 1.25 + (1 - read.chance) * 1.1;
      answers.push({
        fighterId: fighter.id,
        verdict: 'countered',
        note: read.concern
          ? `${read.concern} They will do it for the right money.`
          : 'They want paying properly for this one.',
        askingPurse: Math.round(show * multiplier * 10) / 10,
      });
    } else {
      answers.push({
        fighterId: fighter.id,
        verdict: 'declined',
        note: read.concern ?? 'Not interested in this one.',
      });
    }
  }

  const next: PlannedBout = {
    ...bout,
    status: accepted ? 'agreed' : 'declined',
    answers,
    offeredDay: ctx.day as never,
  };

  /*
   * The answer goes to the inbox as well as onto the card.
   *
   * An answer that exists only as a chip on the builder is an answer the player loses the moment
   * they navigate — and a counter-offer nobody reads is a fight that quietly does not happen.
   * The inbox is where things wait until they are dealt with, which is exactly what an
   * unanswered price is.
   */
  recordOfferOutcome({ db, plan, slotId, bout: next, accepted, answers });

  return {
    plan: withSlot(plan, slotId, next),
    outcome: { slotId, bout: next, accepted, answers },
  };
}

/**
 * Meet a counter-offer and close the fight.
 *
 * The negotiation the mode was missing entirely. A fighter who asked for more money used to be
 * an unfillable slot; now the answer is a number and the player can decide whether the fight is
 * worth it. Paying the ask is treated as agreement rather than as a second roll, because a
 * fighter who names a price and then refuses it is not negotiating.
 */
export function acceptCounter(input: {
  ctx: PromoterContext;
  plan: EventPlan;
  slotId: string;
}): EventPlan {
  const { ctx, plan, slotId } = input;
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!slot?.bout) return plan;

  const counters = (slot.bout.answers ?? []).filter((a) => a.verdict === 'countered');
  if (counters.length === 0) return plan;
  // A corner that flatly declined cannot be bought, so the fight is still off.
  if ((slot.bout.answers ?? []).some((a) => a.verdict === 'declined')) return plan;

  /*
   * The extra money comes off the budget when the card is settled rather than now, but the
   * agreement is repapered immediately — a promoter who agrees a purse and does not write it
   * down is the reason `showPurse` exists.
   */
  for (const counter of counters) {
    const fighter = ctx.db.fighters.findById(counter.fighterId as string) as Fighter | undefined;
    if (!fighter?.agreementId || counter.askingPurse === undefined) continue;
    const agreement = ctx.db.agreements.findById(fighter.agreementId as string) as
      PromotionalAgreement | undefined;
    if (!agreement) continue;
    ctx.db.agreements.upsert({
      ...agreement,
      showPurse: Math.max(agreement.showPurse, counter.askingPurse),
    } as PromotionalAgreement & Entity);
  }

  return withSlot(plan, slotId, {
    ...slot.bout,
    status: 'agreed',
    answers: counters.map((c) => ({ ...c, verdict: 'accepted' as const, note: 'Paid, and in.' })),
  });
}

/** Send every draft bout on the card at once. The convenience, not the mechanism. */
export function sendAllDrafts(input: { ctx: PromoterContext; plan: EventPlan }): {
  plan: EventPlan;
  outcomes: OfferOutcome[];
} {
  let plan = input.plan;
  const outcomes: OfferOutcome[] = [];

  for (const slot of plan.slots) {
    if (slot.bout?.status !== 'draft') continue;
    const result = sendOffer({ ctx: input.ctx, plan, slotId: slot.id });
    if (!result) continue;
    plan = result.plan;
    outcomes.push(result.outcome);
  }

  return { plan, outcomes };
}

// --- Autofill, scoped ----------------------------------------------------------------------------

/**
 * How many fighters an autofill pass considers as the first name in a slot.
 *
 * Bounded because the search is quadratic: every candidate subject is appraised against every
 * eligible opponent in their division. Forty is comfortably more than a card needs and keeps a
 * whole-card fill inside a frame or two on a phone.
 */
const AUTOFILL_SUBJECTS = 40;

/**
 * Who the matchmaker considers as the first name in a slot.
 *
 * Sorted by who has been waiting longest — which is the right priority and also the sort a
 * promoter would apply — and then taken **round-robin across divisions** rather than straight off
 * the top.
 *
 * The round-robin is not a nicety. On a fresh save nobody has fought in this simulation yet, so
 * every fighter's layoff is identical and a plain `slice(0, 40)` reduces to "the first forty rows
 * in the table": the same forty people every time, and whole divisions that can never be
 * autofilled at all. Interleaving guarantees every division the promotion runs is represented in
 * the pool.
 */
function shortlistFor(ctx: PromoterContext, plan: EventPlan, taken: Set<string>): Fighter[] {
  const byDivision = new Map<string, Fighter[]>();

  for (const fighter of ctx.roster) {
    if (taken.has(fighter.id as string)) continue;
    if (blockerFor({ ctx, fighter, plan })) continue;
    const key = fighter.divisionId as string;
    byDivision.set(key, [...(byDivision.get(key) ?? []), fighter]);
  }

  for (const list of byDivision.values()) {
    list.sort(
      (a, b) =>
        daysUnbookedBy(b, ctx.day, ctx.startedDay) - daysUnbookedBy(a, ctx.day, ctx.startedDay) ||
        b.starPower - a.starPower,
    );
  }

  const queues = [...byDivision.values()];
  const out: Fighter[] = [];
  for (let round = 0; out.length < AUTOFILL_SUBJECTS; round++) {
    let added = false;
    for (const queue of queues) {
      const next = queue[round];
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= AUTOFILL_SUBJECTS) break;
    }
    if (!added) break;
  }

  return out;
}

/** Which slots an autofill is allowed to touch. Never "all of them" unless asked. */
export type FillScope = 'all' | 'mainEvent' | 'coMain' | 'mainCard' | 'prelims';

export const FILL_SCOPES: readonly { id: FillScope; label: string; blurb: string }[] = [
  { id: 'all', label: 'Everything left', blurb: 'Every empty slot on the card.' },
  { id: 'mainEvent', label: 'Main event', blurb: 'Suggest the fight that sells the night.' },
  { id: 'coMain', label: 'Co-main', blurb: 'The insurance underneath the headline.' },
  { id: 'mainCard', label: 'Main card', blurb: 'The bouts above the prelims.' },
  { id: 'prelims', label: 'Prelims', blurb: 'The undercard, which nobody bought a ticket for.' },
];

const scopeMatches = (scope: FillScope, position: CardPosition): boolean =>
  scope === 'all' ||
  (scope === 'prelims' && position === 'prelim') ||
  (scope === 'mainCard' && position === 'mainCard') ||
  (scope === 'mainEvent' && position === 'mainEvent') ||
  (scope === 'coMain' && position === 'coMain');

export interface Suggestion {
  slotId: string;
  position: CardPosition;
  redId: string;
  blueId: string;
  divisionId: string;
  appraisal: IntentAppraisal;
  /** 0–1, before the offer goes out. */
  acceptance: number;
  cost: number;
}

/**
 * What the matchmaker would put in the empty slots.
 *
 * **Returns suggestions; books nothing.** That separation is the whole point of the rework: the
 * player can take the lot with one press, take them one at a time, or ignore them. The old
 * autofill wrote nine fights into the card before the screen had even rendered, which is not a
 * convenience — it is the game making the only interesting decision on the player's behalf and
 * then asking them to disagree with it.
 */
export function suggestFills(input: {
  ctx: PromoterContext;
  plan: EventPlan;
  scope: FillScope;
  intent?: MatchIntentId;
}): Suggestion[] {
  const { ctx, plan, scope, intent } = input;
  const out: Suggestion[] = [];

  // Names already used, including by earlier suggestions in this same pass — otherwise the
  // matchmaker cheerfully books one fighter into four slots.
  const taken = new Set<string>();
  for (const bout of plannedBouts(plan)) {
    taken.add(bout.redId as string);
    taken.add(bout.blueId as string);
  }

  for (const slot of plan.slots) {
    if (slot.bout || !scopeMatches(scope, slot.position)) continue;

    const purpose = intent ?? defaultIntentFor(slot.position);
    let best: { suggestion: Suggestion; score: number } | undefined;

    /*
     * A shortlist rather than the whole roster.
     *
     * Appraising every fighter against every possible opponent is quadratic in roster size, and a
     * global promotion's roster is in the hundreds — a full pass would take seconds on a phone
     * for a convenience feature. Whoever has been waiting longest is also the *right* shortlist:
     * a matchmaker filling a card starts with the people owed a fight, not with the alphabet.
     */
    const shortlist = shortlistFor(ctx, plan, taken);

    for (const subject of shortlist) {
      const options = opponentsFor({
        ctx,
        plan,
        slot,
        subject,
        intent: purpose,
        limit: 4,
      }).filter((o) => !o.blocker && !taken.has(o.fighter.id as string));

      for (const option of options) {
        /*
         * Scored on what the section is *for*, weighted by whether the fight can actually be
         * made. The main event is scored on what it draws because that is the only thing a main
         * event has to do; a prelim is scored on whether it is a good fight, because nobody
         * bought a ticket for it.
         */
        const fit = scoreForIntent(option.appraisal, purpose);
        const pull =
          slot.position === 'mainEvent' || slot.position === 'coMain'
            ? option.appraisal.commercial / 100
            : 0.35;
        const score = (fit * 0.55 + pull * 0.45) * (0.4 + option.acceptance * 0.6);

        if (!best || score > best.score) {
          best = {
            score,
            suggestion: {
              slotId: slot.id,
              position: slot.position,
              redId: subject.id as string,
              blueId: option.fighter.id as string,
              divisionId: subject.divisionId as string,
              appraisal: option.appraisal,
              acceptance: option.acceptance,
              cost: option.cost,
            },
          };
        }
      }
    }

    if (!best) continue;
    out.push(best.suggestion);
    taken.add(best.suggestion.redId);
    taken.add(best.suggestion.blueId);
  }

  return out;
}

/** Write one suggestion into the plan as a draft. Still not an offer. */
export function applySuggestion(plan: EventPlan, suggestion: Suggestion): EventPlan {
  return placeBout({
    plan,
    slotId: suggestion.slotId,
    redId: suggestion.redId,
    blueId: suggestion.blueId,
    divisionId: suggestion.divisionId,
  });
}

// --- What the card is worth --------------------------------------------------------------------

export interface PlanForecast {
  bouts: number;
  agreed: number;
  headlineDraw: number;
  expectedAttendance: number;
  /** Thousands. */
  purses: number;
  bonusPool: number;
  /** Thousands. Best guess at what the night returns, purses and bonuses deducted. */
  projectedProfit: number;
}

export function forecastPlan(input: { ctx: PromoterContext; plan: EventPlan }): PlanForecast {
  const { ctx, plan } = input;
  const bouts = plannedBouts(plan);
  const progress = planProgress(plan);

  let purses = 0;
  let headlineDraw = 0;

  for (const slot of plan.slots) {
    if (!slot.bout) continue;
    const red = ctx.db.fighters.findById(slot.bout.redId as string) as Fighter | undefined;
    const blue = ctx.db.fighters.findById(slot.bout.blueId as string) as Fighter | undefined;
    if (!red || !blue) continue;

    purses += pairCost(ctx.db, red, blue, slot.position);

    const draw = drawWeight({
      promotion: ctx.promotion,
      red,
      blue,
      heat: 0,
      isRivalry: false,
      isTitleFight: slot.bout.titleKind !== undefined,
    });
    if (draw > headlineDraw) headlineDraw = draw;
  }

  const bonusPool = bonusPoolFor(ctx.promotion);
  const expectedAttendance = expectedDemand(ctx.promotion, headlineDraw, bouts.length);
  const venue = venueFor(
    ctx.promotion,
    expectedAttendance,
    createRng(`${getWorld(ctx.db).seed}:venue:${plan.id}`),
  );

  const revenue = eventRevenue({
    promotion: ctx.promotion,
    venue,
    broadcast: plan.broadcast,
    headlineDraw,
    bouts: Math.max(1, bouts.length),
    purses: Math.round(purses),
    bonuses: bonusPool,
  });

  return {
    bouts: bouts.length,
    agreed: progress.agreed,
    headlineDraw,
    expectedAttendance,
    purses: Math.round(purses),
    bonusPool,
    projectedProfit: Math.round(revenue.profit),
  };
}

/**
 * Everything wrong with this card, plan-level and world-level together.
 *
 * `planIssues` answers what is answerable from the plan alone, which keeps it pure and testable.
 * This adds the half that needs the world: who has been hurt since you booked them, whose deal
 * runs out first, who is fighting somewhere else that month.
 */
export function issuesFor(input: { ctx: PromoterContext; plan: EventPlan }): PlanIssue[] {
  const { ctx, plan } = input;
  const issues = [...planIssues(plan)];

  for (const slot of plan.slots) {
    if (!slot.bout) continue;
    for (const id of [slot.bout.redId, slot.bout.blueId]) {
      const fighter = ctx.db.fighters.findById(id as string) as Fighter | undefined;
      if (!fighter) continue;

      if ((fighter.readyOnDay ?? 0) > plan.day) {
        issues.push({
          kind: 'doubleBooked',
          urgency: 98,
          message: `${displayName(fighter)} will not be medically cleared in time.`,
        });
      } else if (fighter.retiredDay !== undefined) {
        issues.push({
          kind: 'declined',
          urgency: 97,
          message: `${displayName(fighter)} has retired.`,
        });
      }
    }
  }

  return issues.sort((a, b) => b.urgency - a.urgency);
}

// --- Withdrawals ---------------------------------------------------------------------------------

export interface Withdrawal {
  slotId: string;
  fighterId: string;
  /** One line, for the alert and the inbox. */
  note: string;
}

/**
 * Who has fallen out between the offer and the night.
 *
 * The sport's defining operational fact and the mode's signature scene: a main event losing a
 * man at six weeks. Under the old one-sitting builder this had to be a modal scramble bolted
 * onto the announce button, because there was no card sitting in the save for anybody to fall
 * out of. Now there is — so a withdrawal simply empties the corner it happened in and the player
 * fixes it in the same matchmaking screen they built the card with, which is both simpler and
 * closer to the job.
 *
 * Seeded per bout and per card so re-reading the screen cannot reroll it, and so a player who
 * reloads gets the same bad news.
 */
export function rollWithdrawals(input: { db: GameDb; plan: EventPlan }): {
  plan: EventPlan;
  withdrawals: Withdrawal[];
} {
  const { db } = input;
  const world = getWorld(db);
  let plan = input.plan;
  const withdrawals: Withdrawal[] = [];

  for (const slot of plan.slots) {
    if (slot.bout?.status !== 'agreed') continue;

    for (const id of [slot.bout.redId, slot.bout.blueId]) {
      const fighter = db.fighters.findById(id as string) as Fighter | undefined;
      if (!fighter) continue;

      const rng = createRng(`${world.seed}:pullout:${plan.id}:${slot.id}:${id}`);
      if (!rng.chance(pullOutRisk(fighter))) continue;

      const reason = rng.pickWeighted(['injury', 'illness', 'weight', 'personal'] as const, (r) =>
        r === 'injury' ? 6 : r === 'illness' ? 2 : r === 'weight' ? 2 : 1,
      );

      withdrawals.push({
        slotId: slot.id,
        fighterId: id as string,
        note: describePullOut(reason, fighter),
      });

      // The bout comes off, not the whole card. The opponent is still ready and still wants a
      // fight, which is exactly the position the player has to solve.
      plan = withSlot(plan, slot.id, undefined);
      // One withdrawal per bout: the fight is already off, and a second is noise.
      break;
    }
  }

  return { plan, withdrawals };
}

/**
 * Somebody who would step in on this notice.
 *
 * Ranked by whether they will actually say yes rather than by how good the fight is, which is
 * the correct priority in an emergency: a fighter who stays ready is worth more to a promoter
 * eleven days out than a better one who cannot make the weight.
 */
export function replacementsFor(input: {
  ctx: PromoterContext;
  plan: EventPlan;
  slot: PlanSlot;
  opponent: Fighter;
  limit?: number;
}): OpponentOption[] {
  const { ctx, plan, slot, opponent, limit = 6 } = input;
  return opponentsFor({ ctx, plan, slot, subject: opponent, limit: 60 })
    .filter((o) => !o.blocker)
    .sort((a, b) => b.acceptance - a.acceptance)
    .slice(0, limit);
}

// --- Running the night ------------------------------------------------------------------------

/**
 * Turn the plan into a night and run it.
 *
 * Only agreed bouts make it onto the card. A draft nobody was ever offered and a bout somebody
 * turned down are both *not fights*, and putting them on anyway would make the whole offer
 * system decorative.
 */
export function runPlan(input: {
  db: GameDb;
  plan: EventPlan;
}): { night: FightNight; profit: number; buzz: number; attendance: number } | undefined {
  const { db, plan } = input;
  const promotion = db.promotions.findById(plan.promotionId as string) as Promotion | undefined;
  if (!promotion) return undefined;

  const world = getWorld(db);
  const agreed = plan.slots
    .filter((s) => s.bout?.status === 'agreed')
    .map((s) => s.bout as PlannedBout);
  if (agreed.length === 0) return undefined;

  const seeds: BoutSeed[] = agreed.map((bout, i) => {
    const red = db.fighters.findById(bout.redId as string) as Fighter | undefined;
    const blue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;
    return {
      boutId: `${plan.id}:${i}`,
      redId: bout.redId,
      blueId: bout.blueId,
      divisionId: bout.divisionId,
      isTitleFight: bout.titleKind !== undefined,
      draw:
        red && blue
          ? drawWeight({
              promotion,
              red,
              blue,
              heat: 0,
              isRivalry: false,
              isTitleFight: bout.titleKind !== undefined,
            })
          : 0,
    };
  });

  const card = buildCard(seeds);
  const rng = createRng(`${world.seed}:card:${plan.id}`);
  const headline = card[0];
  const headlineRed = headline
    ? (db.fighters.findById(headline.redId as string) as Fighter | undefined)
    : undefined;
  const headlineBlue = headline
    ? (db.fighters.findById(headline.blueId as string) as Fighter | undefined)
    : undefined;

  const headlineDraw = Math.max(0, ...seeds.map((s) => s.draw));
  const attendanceEstimate = expectedDemand(promotion, headlineDraw, card.length);

  const night: FightNight = {
    id: `${plan.id}_night` as never,
    promotionId: promotion.id,
    day: plan.day as never,
    name:
      headlineRed && headlineBlue
        ? eventName({
            promotion,
            broadcast: plan.broadcast,
            number: Math.floor(plan.day / 14) + 1,
            mainEventNames: [headlineRed.lastName, headlineBlue.lastName],
          })
        : plan.name,
    venue: {
      ...venueFor(promotion, attendanceEstimate, rng.fork('venue')),
      city: plan.city,
      country: plan.country,
      ...(plan.venueName ? { name: plan.venueName } : {}),
    },
    broadcast: plan.broadcast,
    status: 'scheduled',
    bouts: card,
    bonusPool: bonusPoolFor(promotion),
  };

  const outcome = runNight({ db, night, promotion });
  if (!outcome) return undefined;

  savePlan(db, { ...plan, status: 'run', nightId: night.id as string });
  return outcome;
}

/**
 * Run one assembled night.
 *
 * Uses the world's own `runCardBout` rather than a promoter-specific copy, because a card the
 * player promoted has to have exactly the same consequences as one the world ran — ranks, belts,
 * ageing, retirement, medical suspensions and pay. Two implementations of that would drift
 * within a week and the divergence would be invisible until somebody noticed the player's
 * champions never aged.
 */
function runNight(input: {
  db: GameDb;
  night: FightNight;
  promotion: Promotion;
}): { night: FightNight; profit: number; buzz: number; attendance: number } | undefined {
  const { db, night, promotion } = input;
  const world = getWorld(db);
  const rng = createRng(`${world.seed}:run:${night.id}`);
  const readyOn = new Map<string, number>();
  const lastSeen = new Map<string, number>();

  const results: { boutId: string; result: ReturnType<typeof runCardBout> }[] = [];
  const news: NewsItem[] = [];
  let purses = 0;

  // Prelims first, main event last: a promoter watching their own show wants the night to build
  // the way a night builds, and there is no player bout here to follow instead.
  for (const bout of [...night.bouts].reverse()) {
    const red = db.fighters.findById(bout.redId as string) as Fighter | undefined;
    const blue = db.fighters.findById(bout.blueId as string) as Fighter | undefined;
    if (red && blue) purses += pairCost(db, red, blue, bout.position);

    const outcome = runCardBout({
      db,
      day: night.day,
      rng: rng.fork(bout.boutId),
      promotion,
      bout,
      readyOn,
      lastSeen,
    });
    if (!outcome) continue;
    results.push({ boutId: bout.boutId, result: outcome });
    news.push(...outcome.news);
  }

  const awards = awardBonuses(
    results.map((r) => ({ boutId: r.boutId, result: r.result!.result })),
    night.bonusPool,
  );
  const bonusRecipients = new Set<string>([
    ...awards.performanceOfTheNight.map((f) => f as string),
    ...(awards.fightOfTheNight
      ? [
          night.bouts.find((b) => b.boutId === awards.fightOfTheNight)?.redId as string,
          night.bouts.find((b) => b.boutId === awards.fightOfTheNight)?.blueId as string,
        ]
      : []),
  ]);
  for (const id of bonusRecipients) {
    const fighter = id ? (db.fighters.findById(id) as Fighter | undefined) : undefined;
    if (!fighter) continue;
    db.fighters.upsert({
      ...fighter,
      bank: Math.round((fighter.bank + awards.perAward) * 10) / 10,
      lifetimeGross: Math.round((fighter.lifetimeGross + awards.perAward) * 10) / 10,
    } as Fighter & Entity);
  }

  // Re-read: bouts on this card may have changed a title, and settling against the promotion
  // captured above would silently roll the new champion back.
  const current =
    (db.promotions.findById(promotion.id as string) as Promotion | undefined) ?? promotion;

  const top = night.bouts[0];
  const topRed = top
    ? (db.fighters.findById(top.redId as string) as Fighter | undefined)
    : undefined;
  const topBlue = top
    ? (db.fighters.findById(top.blueId as string) as Fighter | undefined)
    : undefined;
  const headlineDraw =
    topRed && topBlue
      ? drawWeight({
          promotion: current,
          red: topRed,
          blue: topBlue,
          heat: 0,
          isRivalry: false,
          isTitleFight: top!.isTitleFight,
        })
      : 0;

  const revenue = eventRevenue({
    promotion: current,
    venue: night.venue,
    broadcast: night.broadcast,
    headlineDraw,
    bouts: night.bouts.length,
    purses: Math.round(purses),
    bonuses: night.bonusPool,
  });

  const settlement = settleNight({
    promotion: current,
    revenue,
    results: results.map((r) => r.result!.result),
    recentDelivery: current.recentDelivery,
  });

  db.promotions.upsert({
    ...settlement.promotion,
    recentDelivery: [...(current.recentDelivery ?? []), settlement.delivered].slice(
      -DELIVERY_MEMORY,
    ),
  } as Promotion & Entity);

  const ran: FightNight = { ...night, status: 'complete', attendance: revenue.attendance };
  db.events.upsert(ran as FightNight & Entity);
  appendNews(db, news);
  db.save();

  return {
    night: ran,
    profit: settlement.revenue.profit,
    buzz: settlement.buzzDelta,
    attendance: revenue.attendance,
  };
}

/** Odds as words. A promoter hears a fight, not a probability. */
export const describeOdds = (redOdds: number): string => {
  const gap = Math.abs(redOdds - 0.5);
  return gap < 0.08
    ? 'Coin flip'
    : gap < 0.2
      ? 'Competitive'
      : gap < 0.32
        ? 'One-sided'
        : 'A gimme';
};

export { paperOdds };

// --- What the promoter is told while time passes -------------------------------------------

/**
 * Promoter-side situations, raised while time passes.
 *
 * Kept narrow on the same principle the fighter's half runs on: things that are **about the
 * player** and that they can do something about. A rival's contract trouble is news; a card of
 * yours three weeks out with nothing topping it is an inbox item.
 */
export function scanPromoterInbox(db: GameDb, day: number): number {
  const world = getWorld(db);
  if (world.playerRole !== 'promoter' || !world.playerPromotionId) return 0;

  const promotion = db.promotions.findById(world.playerPromotionId) as Promotion | undefined;
  if (!promotion) return 0;

  let raised = 0;
  const plans = plansFor(db, promotion.id as string).filter((p) => p.day >= day);

  const booked = new Set<string>();
  for (const plan of plans) {
    for (const bout of plannedBouts(plan)) {
      booked.add(bout.redId as string);
      booked.add(bout.blueId as string);
    }
  }

  for (const plan of plans) {
    const away = plan.day - day;
    const progress = planProgress(plan);

    /*
     * A card inside a month with nothing topping it. A decision rather than a notice: the whole
     * gate hangs off the main event, and finding out on the night is not a thing that should be
     * possible.
     */
    if (away <= 28 && !progress.hasMainEvent) {
      raised += raise(db, {
        id: inboxId(Math.floor(day / 7) * 7, `mainevent:${plan.id}`),
        day,
        kind: 'card',
        priority: 'decision',
        title: `${plan.name} still has no main event`,
        body: `${away} days out. The main event sells the night, and there is nothing on it.`,
        actions: [
          {
            id: 'acknowledge',
            label: 'Understood',
            detail: 'Deal with it yourself.',
            isDismiss: true,
          },
        ],
        link: { route: 'plan', id: plan.id },
        promotionId: promotion.id,
      })
        ? 1
        : 0;
    }

    if (away <= 14 && progress.filled < progress.slots) {
      raised += raise(db, {
        id: inboxId(Math.floor(day / 7) * 7, `thin:${plan.id}`),
        day,
        kind: 'card',
        priority: 'notable',
        title: `${plan.name} is ${progress.slots - progress.filled} fights short`,
        body: 'Two weeks out. What is not booked now is a short card, and a short card is worth less at the gate.',
        link: { route: 'plan', id: plan.id },
        promotionId: promotion.id,
      })
        ? 1
        : 0;
    }
  }

  /*
   * A contender who has earned the call and has nothing booked. The request a manager actually
   * makes, and the sport's most recurring political problem: a #1 who keeps winning and keeps
   * not being given the fight becomes somebody else's champion.
   */
  const fighters = db.fighters.findAll() as Fighter[];
  for (const divisionId of promotion.divisions) {
    const championId = promotion.champions[divisionId];
    const ranked = rankDivision(fighters, divisionId, promotion.id, day, championId);
    const top = ranked.find((r) => r.position === 1);
    if (!top) continue;
    if (booked.has(top.fighter.id as string)) continue;
    if (top.fighter.summary.streak < 3) continue;

    raised += raise(db, {
      id: inboxId(Math.floor(day / 30) * 30, `titleshot:${top.fighter.id}`),
      day,
      kind: 'roster',
      priority: 'notable',
      title: `${displayName(top.fighter)} has asked for a title shot`,
      body: `#1 at ${getDivision(divisionId).name} on a ${top.fighter.summary.streak}-fight run, and nothing booked. They have done what you asked of them.`,
      link: { route: 'fighter', id: top.fighter.id as string },
      fighterId: top.fighter.id,
      promotionId: promotion.id,
      divisionId,
    })
      ? 1
      : 0;
  }

  return raised;
}
