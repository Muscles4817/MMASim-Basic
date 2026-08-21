/**
 * Career progression, wired to the database.
 *
 * Training, ageing, signing and title shots. The engine owns every rule; this module reads
 * the world out of repositories, applies the rule, and writes the result back.
 */

import {
  applyAgeing,
  applyIdleDecay,
  DEFAULT_INTENSITY,
  INTENSITY_META,
  applyTraining,
  type TrainingIntensity,
  campImpairment,
  campInjuryChance,
  careerProgress,
  createRng,
  moveDivision,
  overallRating,
  settleWeight,
  describeInjury,
  rankDivision,
  rankOf,
  rollInjury,
  setChampion,
  titleShotEligibility,
  type AttributeKey,
  type Coach,
  type DivisionId,
  type Fighter,
  type FighterId,
  type Gym,
  type Injury,
  type Promotion,
  type RankedFighter,
  type TitleShotVerdict,
  type TrainingFocus,
  isPhysical,
  ATTRIBUTE_META,
  activeInjuries,
  weeksUntilFit,
  type InboxItem,
} from '@mmasim/engine';
import { getWorld, setWorld, type GameDb } from '@mmasim/data';
import { advanceWorld } from './world';
import { advanceTo } from './clock';
import { campCostFor, payForCamp } from './money';
import { toll } from './contracts';

/** How much an existing injury is blunting a camp, 0-1. Surfaced on the training screen. */
export function currentCampImpairment(fighter: Fighter, day: number): number {
  return campImpairment(fighter.injuries ?? [], day);
}

/** Everything the hub needs to say where a fighter is on the ladder. */
export interface LadderStatus {
  promotion?: Promotion;
  ranked: readonly RankedFighter[];
  /** 0 = champion, 1..n = contender, undefined = unranked. */
  position?: number;
  isChampion: boolean;
  /** The reigning champion, if there is one. The opponent in a title fight. */
  champion?: Fighter;
  titleShot: TitleShotVerdict;
  /** True when the belt is vacant and the top contender can claim it. */
  titleVacant: boolean;
  /** 0–1 toward being global champion. Drives the progress bar. */
  progress: number;
}

export function getLadderStatus(db: GameDb, fighter: Fighter): LadderStatus {
  const world = getWorld(db);
  const promotion = fighter.promotionId
    ? (db.promotions.findById(fighter.promotionId) as Promotion | undefined)
    : undefined;

  const fighters = db.fighters.findAll() as Fighter[];
  const championId = promotion?.champions[fighter.divisionId];

  const ranked = promotion
    ? rankDivision(
        fighters,
        fighter.divisionId,
        promotion.id,
        world.day,
        championId,
        db.promotions.findAll() as unknown as Promotion[],
      )
    : [];

  const position = rankOf(ranked, fighter.id);
  const isChampion = championId === fighter.id;
  const champion = championId
    ? (db.fighters.findById(championId) as Fighter | undefined)
    : undefined;

  const titleShot = promotion
    ? titleShotEligibility(fighter, ranked, promotion)
    : { eligible: false, reason: 'You are not signed to a promotion.' };

  return {
    promotion,
    ranked,
    position,
    isChampion,
    champion,
    titleVacant: champion === undefined,
    titleShot,
    progress: careerProgress(fighter, promotion, position, isChampion),
  };
}

export interface TrainingOutcome {
  gains: Partial<Record<AttributeKey, number>>;
  notes: readonly string[];
  /** Days the calendar advanced. */
  days: number;
  /** Set when this block produced a new injury. The camp report leads with it. */
  injury?: Injury;
  /*
    Everything below exists so the camp report can say what a camp *did* rather than only what
    it added. A list of deltas answers "what changed" and none of "where am I now", which on the
    screen that consumes months of a career at a time is most of what the player wants to know.
  */
  /** Ratings before and after, so the report can show 68 → 71 rather than a bare +3. */
  before?: Partial<Record<AttributeKey, number>>;
  after?: Partial<Record<AttributeKey, number>>;
  /** How much room is left to the ceiling, per attribute trained. Why a camp stopped paying. */
  headroom?: Partial<Record<AttributeKey, number>>;
  /** Injuries that healed while the camp ran, which is a real benefit and was never reported. */
  healed?: readonly string[];
  /** Age on the way in and on the way out. A long camp can cross a birthday. */
  ageBefore?: number;
  ageAfter?: number;
  /** What the camp cost and what is left, kept structured so the screen can format it. */
  cost?: number;
  bankAfter?: number;
}

/**
 * Run a training block and advance the calendar.
 *
 * Ageing is applied over the same span, so a fighter who trains for a year ages a year. That
 * ordering matters: training then ageing means a 38-year-old can gain craft and lose speed in
 * the same block, which is exactly the late-career shape the design calls for.
 */
export function runTraining(
  db: GameDb,
  fighter: Fighter,
  focuses: readonly TrainingFocus[],
  weeks: number,
  intensity: TrainingIntensity = DEFAULT_INTENSITY,
): TrainingOutcome {
  const world = getWorld(db);
  const days = weeks * 7;
  const toDay = world.day + days;

  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const coach = fighter.headCoachId
    ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
    : undefined;

  const rng = createRng(`${world.seed}:train:${fighter.id}:${world.day}`);

  // The camp is paid for before it is run, in full, win or lose. That fixed cost is what
  // turns money from a scoreboard into a constraint — see docs/17-money.md.
  const cost = campCostFor(gym, weeks);
  const paid = payForCamp(db, fighter, cost);

  const trained = applyTraining({
    fighter: paid,
    focuses,
    weeks,
    intensity,
    gym,
    coach,
    day: world.day,
    rng,
  });

  // Camps are where most injuries actually happen, which is the opposite of most players'
  // intuition and worth the system stating plainly.
  const existing = fighter.injuries ?? [];
  let injury: Injury | undefined;
  if (rng.chance(campInjuryChance(fighter, weeks, world.day, INTENSITY_META[intensity].injury))) {
    injury = rollInjury({
      fighter,
      source: 'camp',
      day: toDay,
      rng: rng.fork('injury'),
      history: existing,
    });
  }

  const aged = applyAgeing(
    trained.fighter,
    world.day,
    toDay,
    createRng(`${world.seed}:age:${fighter.id}:${world.day}`),
  );

  const withInjury: Fighter = injury
    ? { ...aged.fighter, injuries: [...existing, injury] }
    : aged.fighter;

  db.fighters.upsert(withInjury);
  setWorld(db, { day: toDay });
  advanceRoster(db, world.day, toDay, fighter.id);
  db.save();

  /*
   * The before-and-after picture, assembled here because this is the only place that holds both
   * ends of it. `applyTraining` returns deltas and `applyAgeing` runs after it, so neither knows
   * what the fighter looked like when the camp started.
   */
  const before: Partial<Record<AttributeKey, number>> = {};
  const after: Partial<Record<AttributeKey, number>> = {};
  const headroom: Partial<Record<AttributeKey, number>> = {};
  for (const key of Object.keys(trained.gains) as AttributeKey[]) {
    before[key] = fighter.attributes[key];
    after[key] = withInjury.attributes[key];
    /*
     * Physicals only. A skill has no ceiling to be near — `potential[key]` is a projection the
     * gain arithmetic never reads — and reporting it as one told a fighter with fight IQ 92 and a
     * stated ceiling of 27 that they were "at your ceiling" for the thing they were still
     * improving fastest at. Left undefined for skills, which the report renders as nothing.
     */
    if (isPhysical(key)) {
      headroom[key] = Math.max(0, fighter.potential[key] - withInjury.attributes[key]);
    }
  }

  // Healing is a benefit of time passing and the report never mentioned it, so a fighter came
  // out of a twelve-week camp with a knee that had quietly mended and no acknowledgement of it.
  const healedNow = existing
    .filter((i) => i.healedDay > world.day && i.healedDay <= toDay)
    .map((i) => describeInjury(i, toDay));

  return {
    gains: trained.gains,
    notes: [...(injury ? [describeInjury(injury, toDay)] : []), ...trained.notes, ...aged.notes],
    days,
    injury,
    before,
    after,
    headroom,
    healed: healedNow,
    ageBefore: Math.floor((world.day - fighter.birthDay) / 365),
    ageAfter: Math.floor((toDay - fighter.birthDay) / 365),
    cost,
    bankAfter: Math.round(paid.bank * 10) / 10,
  };
}

/**
 * Sit out without training.
 *
 * Not a free rest: skills decay out of camp at a rate set by Discipline, so waiting has a
 * real cost and an undisciplined fighter pays far more of it.
 */
export function runLayoff(db: GameDb, fighter: Fighter, weeks: number): TrainingOutcome {
  const world = getWorld(db);
  const days = weeks * 7;
  const toDay = world.day + days;
  const rng = createRng(`${world.seed}:idle:${fighter.id}:${world.day}`);

  // Sitting out does not run a contract down. It stops the clock, which is the correction
  // that turns the holdout from a reliable lever into a genuine gamble.
  toll(db, fighter, days);

  const decayed = applyIdleDecay(fighter, days, rng);
  const aged = applyAgeing(decayed, world.day, toDay, rng);

  const losses: Partial<Record<AttributeKey, number>> = {};
  for (const key of Object.keys(fighter.attributes) as AttributeKey[]) {
    const delta = aged.fighter.attributes[key] - fighter.attributes[key];
    if (delta < 0) losses[key] = delta;
  }

  db.fighters.upsert(aged.fighter);
  setWorld(db, { day: toDay });
  advanceRoster(db, world.day, toDay, fighter.id);
  db.save();

  return {
    gains: losses,
    notes:
      Object.keys(losses).length > 0
        ? ['Time off the mats. Some sharpness has gone.']
        : ['A quiet few weeks.'],
    days,
  };
}

/**
 * One day of a rest block, as the player watches it go by.
 *
 * The reason this exists at all is that the fighter career could only move in months. Every
 * control that touched the clock — the hub's "wait eight weeks", the training screen's shortest
 * block — consumed four weeks or more in a single press, so freshness went from 48 to 96 between
 * one frame and the next and read as a number the game was making up rather than one it was
 * keeping. A resource nobody sees accrue is a resource nobody believes in.
 *
 * The values here are not an animation of the result: they are the model. Freshness recovers at a
 * flat `recoveryRate` per day (see `applyAgeing`, which charges exactly this rate once over the
 * whole span), and an injury heals on the day its `healedDay` arrives. So walking the timeline and
 * jumping to the end give the same fighter, which is the property that makes showing the walk
 * honest rather than decorative.
 */
export interface RestDay {
  day: number;
  freshness: number;
  /** Injuries that reached full fitness on this day, described. */
  healed: readonly string[];
}

export interface RestOutcome {
  from: number;
  /** Where the clock actually stopped, which is not always where it was asked to. */
  to: number;
  days: number;
  /** True when something needed the player and the clock stopped early to say so. */
  interrupted: boolean;
  waiting: readonly InboxItem[];
  timeline: readonly RestDay[];
  freshnessBefore: number;
  freshnessAfter: number;
  /** What the time off cost, if anything. Rest is recovery *and* decay. */
  losses: Partial<Record<AttributeKey, number>>;
  notes: readonly string[];
  /** Everything that finished healing across the whole block. */
  healed: readonly string[];
  /** Weeks until fully fit at the end of it. 0 when there is nothing left to heal. */
  weeksToFit: number;
}

/**
 * Sit out for a number of **days**, and say what happened on each of them.
 *
 * `runLayoff` is the same idea in weeks and stays for the training screen, which genuinely thinks
 * in camp-length blocks. This is the one the hub uses, and it differs in two ways that matter.
 *
 * It stops when the player is needed. The hub's old wait ran `advanceWorld` directly and therefore
 * skipped straight past anything that arrived mid-span — an offer, a release, a title becoming
 * vacant — which is exactly the class of thing `advanceTo` exists to catch. Sitting out was the
 * only route through the game that could not be interrupted.
 *
 * And it charges the player for the days. The old wait excluded them from the world tick and then
 * moved the calendar, so nobody aged, nothing decayed, and **freshness did not come back at all**:
 * the single most common reason to sit out did not work. That is why this runs `applyAgeing` over
 * the span the clock actually covered rather than the span it was asked for.
 */
export function restDays(db: GameDb, fighter: Fighter, days: number): RestOutcome {
  const from = getWorld(db).day;
  const advance = advanceTo(db, from + Math.max(1, Math.round(days)));
  const to = advance.day;

  /*
   * Everything the fighter actually experienced comes back from the clock.
   *
   * Deliberately not recomputed here. `advanceTo` charges the days — decline, decay, contract
   * tolling, freshness — for *every* route through the clock, so a second implementation on this
   * one would be the exact defect this whole change is about: two ways of spending time that
   * disagree about what time costs.
   */
  const elapsed = advance.player;
  const before = elapsed?.freshnessBefore ?? 0;
  const rate = elapsed?.recoveryPerDay ?? 0;
  const healedOn = elapsed?.healedOn ?? new Map<number, readonly string[]>();

  const timeline: RestDay[] = [];
  for (let i = 1; i <= (elapsed?.days ?? 0); i++) {
    const day = from + i;
    timeline.push({
      day,
      freshness: Math.max(0, Math.min(100, before + rate * i)),
      healed: healedOn.get(day) ?? [],
    });
  }

  const healed = [...healedOn.values()].flat();
  const losses = elapsed?.losses ?? {};
  const current = (db.fighters.findById(fighter.id as string) as Fighter | undefined) ?? fighter;

  /*
   * What the time off actually did, named rather than gestured at.
   *
   * The first version said "Time off the mats. Some sharpness has gone." whenever `losses` was
   * non-empty, and `losses` picks up anything `applyAgeing` took — which over a fortnight is a
   * point of neglect on something nobody has worked in months. So a two-week rest reported a cost
   * it had barely incurred, on the screen whose whole job is to make resting a legible decision.
   *
   * A point is the bar, because ratings are integers and anything under one is the carry ledger
   * rather than a change the player can see on their card. Past it, the thing that faded is named:
   * "some sharpness has gone" is not actionable and "your cardio faded" is.
   */
  const faded = (Object.entries(losses) as [AttributeKey, number][])
    .filter(([, delta]) => delta <= -1)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([key]) => ATTRIBUTE_META[key].label.toLowerCase());

  const notes: string[] = [];
  if (healed.length > 0) notes.push(`${healed.join(' and ')} healed up.`);
  if (faded.length > 0) {
    notes.push(`Time off the mats: ${faded.join(' and ')} faded while you were away.`);
  }
  if (notes.length === 0) notes.push('A quiet stretch. Nothing happened, which is the point.');

  return {
    from,
    to,
    days: to - from,
    interrupted: advance.interrupted,
    waiting: advance.waiting,
    timeline,
    freshnessBefore: before,
    freshnessAfter: elapsed?.freshnessAfter ?? before,
    losses,
    notes,
    healed,
    weeksToFit: weeksUntilFit(current.injuries ?? [], to),
  };
}

/**
 * How long a fighter would have to sit out to be fully fit, in days.
 *
 * Zero when there is nothing to heal, which the caller should read as "there is no rest button
 * to offer here" rather than as "rest for no days".
 */
export function daysUntilFit(fighter: Fighter, day: number): number {
  const active = activeInjuries(fighter.injuries ?? [], day);
  if (active.length === 0) return 0;
  return Math.max(...active.map((i) => i.healedDay)) - day;
}

/**
 * Age the rest of the roster alongside the player.
 *
 * Without this the player is the only person in the world who gets older, and after ten
 * in-game years they are competing against a division frozen in 2020. Skipped for the player
 * themselves, who is aged explicitly by the caller.
 */
/**
 * Move everyone else on.
 *
 * This used to age the roster and nothing else, which left the division the player was
 * climbing frozen at its seeded state forever. It now runs the world: other fighters are
 * matched, fight, win, lose, improve, decline, take belts and retire while the player is in
 * camp. See `world.ts` for why that loop is the long-sim's, moved rather than rewritten.
 */
function advanceRoster(db: GameDb, fromDay: number, toDay: number, exceptId: FighterId): void {
  advanceWorld(db, fromDay, toDay, exceptId);
}

/**
 * Award a title after a win.
 *
 * Called by the career loop when the bout was for a belt. Vacates nothing else: a champion
 * who loses simply stops being one.
 */
export function awardTitle(db: GameDb, winner: Fighter, promotion: Promotion): void {
  db.promotions.upsert(setChampion(promotion, winner.divisionId, winner.id) as never);
  db.save();
}

/** Join a gym, taking on its head coach. */
export function joinGym(db: GameDb, fighter: Fighter, gym: Gym): Fighter {
  const updated: Fighter = { ...fighter, gymId: gym.id, headCoachId: gym.headCoachId };
  db.fighters.upsert(updated);
  db.save();
  return updated;
}

/**
 * Move the player's fighter to another weight class.
 *
 * The engine decides what the move means; this decides when the body starts catching up.
 * One settle step is applied immediately so the change is visible rather than theoretical,
 * and `runTraining` applies another each camp — a fighter who moves up is a different size
 * six months later, not the same afternoon.
 */
export function changeDivision(db: GameDb, fighter: Fighter, divisionId: DivisionId): Fighter {
  const moved = settleWeight(moveDivision(fighter, divisionId, getWorld(db).day));
  db.fighters.upsert(moved as Fighter & { id: string });
  return moved;
}

/** Everyone already in a division, for the honest "what am I walking into" appraisal. */
export function divisionField(db: GameDb, divisionId: DivisionId, exclude: string): number[] {
  return (db.fighters.findAll() as Fighter[])
    .filter((f) => f.divisionId === divisionId && (f.id as string) !== exclude && !f.retiredDay)
    .map((f) => overallRating(f.attributes));
}
