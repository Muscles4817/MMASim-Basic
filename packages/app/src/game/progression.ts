/**
 * Career progression, wired to the database.
 *
 * Training, ageing, signing and title shots. The engine owns every rule; this module reads
 * the world out of repositories, applies the rule, and writes the result back.
 */

import {
  applyAgeing,
  applyIdleDecay,
  applyTraining,
  campImpairment,
  campInjuryChance,
  careerProgress,
  createRng,
  promotionOffers,
  describeInjury,
  rankDivision,
  rankOf,
  rollInjury,
  setChampion,
  titleShotEligibility,
  type AttributeKey,
  type Coach,
  type Fighter,
  type FighterId,
  type Gym,
  type Injury,
  type Promotion,
  type PromotionOffer,
  type RankedFighter,
  type TitleShotVerdict,
  type TrainingFocus,
} from '@mmasim/engine';
import { getWorld, setWorld, type GameDb } from '@mmasim/data';

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
  offers: readonly PromotionOffer[];
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
    ? rankDivision(fighters, fighter.divisionId, promotion.id, world.day, championId)
    : [];

  const position = rankOf(ranked, fighter.id);
  const isChampion = championId === fighter.id;
  const champion = championId
    ? (db.fighters.findById(championId) as Fighter | undefined)
    : undefined;

  const titleShot = promotion
    ? titleShotEligibility(fighter, ranked, promotion)
    : { eligible: false, reason: 'You are not signed to a promotion.' };

  const offers = promotionOffers(
    fighter,
    db.promotions.findAll() as unknown as Promotion[],
    promotion,
    createRng(`${world.seed}:offers:${fighter.id}:${world.day}`),
  );

  return {
    promotion,
    ranked,
    position,
    isChampion,
    champion,
    titleVacant: champion === undefined,
    titleShot,
    offers,
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
): TrainingOutcome {
  const world = getWorld(db);
  const days = weeks * 7;
  const toDay = world.day + days;

  const gym = fighter.gymId ? (db.gyms.findById(fighter.gymId) as Gym | undefined) : undefined;
  const coach = fighter.headCoachId
    ? (db.coaches.findById(fighter.headCoachId) as Coach | undefined)
    : undefined;

  const rng = createRng(`${world.seed}:train:${fighter.id}:${world.day}`);

  const trained = applyTraining({
    fighter,
    focuses,
    weeks,
    gym,
    coach,
    day: world.day,
    rng,
  });

  // Camps are where most injuries actually happen, which is the opposite of most players'
  // intuition and worth the system stating plainly.
  const existing = fighter.injuries ?? [];
  let injury: Injury | undefined;
  if (rng.chance(campInjuryChance(fighter, weeks, world.day))) {
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

  return {
    gains: trained.gains,
    notes: [
      ...(injury ? [describeInjury(injury, toDay)] : []),
      ...trained.notes,
      ...aged.notes,
    ],
    days,
    injury,
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
 * Age the rest of the roster alongside the player.
 *
 * Without this the player is the only person in the world who gets older, and after ten
 * in-game years they are competing against a division frozen in 2020. Skipped for the player
 * themselves, who is aged explicitly by the caller.
 */
function advanceRoster(db: GameDb, fromDay: number, toDay: number, exceptId: FighterId): void {
  const world = getWorld(db);
  // Only worth doing over a meaningful span; a two-week block moves nobody measurably.
  if (toDay - fromDay < 30) return;

  for (const fighter of db.fighters.findAll() as Fighter[]) {
    if (fighter.id === exceptId || fighter.retiredDay !== undefined) continue;
    const rng = createRng(`${world.seed}:roster:${fighter.id}:${fromDay}`);
    const aged = applyAgeing(fighter, fromDay, toDay, rng);
    if (aged.fighter !== fighter) db.fighters.upsert(aged.fighter);
  }
}

/** Accept a promotional offer. Returns the updated fighter. */
export function signWith(db: GameDb, fighter: Fighter, promotion: Promotion): Fighter {
  const updated: Fighter = { ...fighter, promotionId: promotion.id };
  db.fighters.upsert(updated);
  db.save();
  return updated;
}

/**
 * Award a title after a win.
 *
 * Called by the career loop when the bout was for a belt. Vacates nothing else: a champion
 * who loses simply stops being one.
 */
export function awardTitle(db: GameDb, winner: Fighter, promotion: Promotion): void {
  db.promotions.upsert(
    setChampion(promotion, winner.divisionId, winner.id) as never,
  );
  db.save();
}

/** Join a gym, taking on its head coach. */
export function joinGym(db: GameDb, fighter: Fighter, gym: Gym): Fighter {
  const updated: Fighter = { ...fighter, gymId: gym.id, headCoachId: gym.headCoachId };
  db.fighters.upsert(updated);
  db.save();
  return updated;
}
