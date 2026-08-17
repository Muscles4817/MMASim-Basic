/**
 * Origin — where the player's fighter came from, in three nested layers.
 *
 * The old creation screen offered one flat `background` picker, and it quietly conflated
 * three separate questions into a single choice: how good an athlete are you, what did you
 * train, and how far did you get at it. "Elite Athlete, New To This" was the tell — it is a
 * *talent* statement wearing a *discipline* label, which is why it had to be simultaneously
 * the best ceilings and the worst skills, and why nothing else on the list could ever be
 * both good and specialised.
 *
 * Splitting it into three layers works because each layer lands on a **different existing
 * system**, so none of them is a re-skin of another:
 *
 *   Layer 1  Talent      → hidden naturals   → ceilings          (progression/generation.ts)
 *   Layer 2  Discipline  → attributes        → tendencies/style  (fight/tendencies.ts)
 *   Layer 3  Attainment  → reputation        → promotion ranking (business/standing.ts)
 *
 * Two design decisions are load-bearing and are documented where they are implemented:
 *
 *  - **Six combat disciplines, not more.** doc/18 §4.1 enumerates exactly what the fight
 *    engine can tell apart from a ratio of attributes: boxer, kickboxer, karateka,
 *    wrestler, jiu-jitsu player, judoka. A seventh art would be a label over numbers
 *    identical to one of those six, and doc/18 §5 is explicit that a declared style the
 *    simulator branches on would be a step backwards.
 *
 *  - **Layer 3 is filtered by layer 1, not scaled by it.** An Olympic medallist *is* an
 *    elite athlete; offering "Olympic" under the lowest talent tier and then secretly
 *    discounting it would double-count the same fact and lie to the player about what they
 *    picked. Instead the elite attainments are simply not on the menu below the tier that
 *    earns them. Structural rather than a fudge factor.
 */

import type { AttributeKey } from '../ratings/attributes.js';

/**
 * The naturals an origin may lean.
 *
 * `frame` is derived from walking weight and `injuryProneness` is deliberately outside
 * anybody's control, so neither is biasable here — an origin that could buy a good injury
 * roll would make the one genuinely unfair number in the game a purchase.
 */
export type OriginNaturalKey =
  | 'explosiveness'
  | 'engine'
  | 'constitution'
  | 'recovery'
  | 'motorLearning';

export type NaturalBias = Readonly<Partial<Record<OriginNaturalKey, number>>>;
export type AttributeBias = Readonly<Partial<Record<AttributeKey, number>>>;

// --- Layer 1: talent ------------------------------------------------------------------

export const TALENT_TIERS = ['freak', 'natural', 'grinder'] as const;
export type TalentTier = (typeof TALENT_TIERS)[number];

export interface TalentMeta {
  key: TalentTier;
  label: string;
  /** What this means for the player, in fiction. Never states a ceiling. */
  blurb: string;
  /** The trade, said plainly, so the tier is a choice rather than a difficulty slider. */
  cost: string;
  /**
   * Where this tier centres the five rolled naturals, in rating points.
   *
   * `natural` sits at 73 because that is the value `createPlayerFighter` was tuned to and
   * measured at: at 66 a created fighter's ceiling was a ranked contender's and a good roll
   * was a champion's, and 73 moved that up one notch after the long-sim suite showed the
   * climb finishing short. Keeping the middle tier exactly there means the whole existing
   * balance envelope is the *middle* of the new range rather than one end of it.
   */
  naturalsCentre: number;
  /** Whether a non-combat sporting background is offered under this tier. */
  allowsAthleticOrigin: boolean;
}

export const TALENT_META: Readonly<Record<TalentTier, TalentMeta>> = {
  freak: {
    key: 'freak',
    label: 'Freak',
    blurb:
      'Every coach who has ever watched you warm up has said the same thing to somebody. You are put together differently and everybody in the room knows it.',
    cost: 'Nothing has ever been hard, so nobody has found out yet whether you can be told anything.',
    // +5 on the tuned middle. Deliberately small: the roll around it has a standard
    // deviation of 11 to 16, so a tier is a shove rather than a guarantee — the same
    // principle `generateNaturals` uses for `tier`, and the reason a freak can still roll a
    // bad chin and a grinder can still roll a great engine.
    naturalsCentre: 78,
    allowsAthleticOrigin: true,
  },
  natural: {
    key: 'natural',
    label: 'Natural',
    blurb:
      'You picked things up faster than the people next to you and you were always in the better half of the room. Good, and not obviously special.',
    cost: 'You will have to be better than the people who are simply bigger and faster than you.',
    naturalsCentre: 73,
    allowsAthleticOrigin: true,
  },
  grinder: {
    key: 'grinder',
    label: 'Grinder',
    blurb:
      'Nobody ever picked you first. Everything you can do, you can do because you did it ten thousand times when the gym was empty.',
    cost: 'The people at the top of this sport were born with things you were not.',
    // −5 rather than the −7 first tried. Measured over 300 rolls per tier, −7 put the
    // grinder's mean potential-overall at 67.5 against a roster floor of 51.1 and a median
    // of 67.5 — and since a played-out career reaches roughly 85% of its own ceiling, that
    // is a fighter who cannot become a professional at all. −5 lands the mean at 70 and the
    // best roll at 87, which is the intended shape: an ordinary career is the likely
    // outcome and a title is a genuine long shot rather than an arithmetic impossibility.
    naturalsCentre: 68,
    allowsAthleticOrigin: false,
  },
};

// --- Layer 2: discipline --------------------------------------------------------------

/**
 * The six combat disciplines, and only six.
 *
 * This list is capped by the fight engine, not by ambition. doc/18 §4.2 lists what is
 * *not* distinguishable and why: Muay Thai and Dutch kickboxing land on the same numbers
 * because clinch striking reads `clinchOffence` (45% strength, 35% wrestling) and never
 * consults `kicking`; karate and taekwondo are both "`kicking` + `speed`" with no range or
 * blitz concept to separate them; judo, sambo and freestyle wrestling all resolve through
 * `chainWrestling`. Splitting any of those into two menu entries would give the player a
 * decision whose two outcomes are the same fighter.
 */
export const COMBAT_DISCIPLINES = [
  'boxing',
  'kickboxing',
  'karate',
  'wrestling',
  'jiuJitsu',
  'judo',
] as const;
export type CombatDiscipline = (typeof COMBAT_DISCIPLINES)[number];

/**
 * The non-combat branch.
 *
 * Three, because these are three genuinely different *physical* profiles and the engine
 * reads all three — explosiveness, constitution/frame and engine are separate naturals
 * feeding separate ceilings. That is the same honesty test the six combat disciplines had
 * to pass; a fourth ("swimmer", "basketball") would land on one of these three.
 */
export const ATHLETIC_ORIGINS = ['trackAndField', 'contactSport', 'enduranceSport'] as const;
export type AthleticOrigin = (typeof ATHLETIC_ORIGINS)[number];

export type Discipline = CombatDiscipline | AthleticOrigin;
export const DISCIPLINES: readonly Discipline[] = [...COMBAT_DISCIPLINES, ...ATHLETIC_ORIGINS];

export interface DisciplineMeta {
  key: Discipline;
  kind: 'combat' | 'athletic';
  label: string;
  blurb: string;
  /** The hole this discipline starts with, named plainly. */
  weakness: string;
  /**
   * Rating points on top of the debut baseline at the reference attainment (`regional`).
   *
   * Every combat discipline totals 40 points. Equal totals are the point: the choice is
   * *shape*, not quantity, so no discipline is the strong pick and the six are compared on
   * what kind of fighter they make. The athletic origins deliberately total far less — see
   * their entries.
   */
  attributes: AttributeBias;
  /** Which of the hidden physical qualities this life selected for. */
  naturals: NaturalBias;
}

export const DISCIPLINE_META: Readonly<Record<Discipline, DisciplineMeta>> = {
  // Striking has three attributes to grappling's five (doc/18 §2.1), so the three striking
  // arts are separated on which of the three they load and on which *physical* attribute
  // comes with them — that is the only honest resolution available.
  boxing: {
    key: 'boxing',
    kind: 'combat',
    label: 'Boxing',
    blurb:
      'Hands, footwork, and a head that moves. You have been hit properly by people who meant it, and you did not fall apart.',
    weakness: 'Everything below the waist is a mystery, and the first double leg will be a shock.',
    attributes: { strikingOffence: 17, strikingDefence: 12, speed: 6, power: 5 },
    naturals: { explosiveness: 5 },
  },
  kickboxing: {
    key: 'kickboxing',
    kind: 'combat',
    label: 'Kickboxing / Muay Thai',
    blurb:
      'Long weapons and shins that were conditioned the hard way. You are comfortable at a range most people find frightening.',
    weakness: 'You have spent your life being allowed to stand up. Nobody has ever taken you down.',
    attributes: { kicking: 16, strikingOffence: 10, strikingDefence: 7, durability: 5, strength: 2 },
    naturals: { explosiveness: 4, constitution: 4 },
  },
  karate: {
    key: 'karate',
    kind: 'combat',
    label: 'Karate / Taekwondo',
    blurb:
      'Distance and timing. You are in and out before the exchange starts, and you throw very few things very fast.',
    weakness: 'Low output and no answer at all once somebody closes the gap and holds you there.',
    // Lower `strikingOffence` than the other two strikers on purpose: `strikeLean` averages
    // strikingOffence and kicking, so a karateka who matched a boxer's hands would simply be
    // a better boxer. The identity is speed and selection, not volume.
    attributes: { kicking: 15, speed: 11, strikingDefence: 8, fightIq: 4, strikingOffence: 2 },
    naturals: { explosiveness: 6 },
  },
  wrestling: {
    key: 'wrestling',
    kind: 'combat',
    label: 'Wrestling',
    blurb:
      'Years on the mat. You already know how to make a grown man go where you want him to go, and how to stop him doing it to you.',
    weakness: 'You have never been punched in the face properly.',
    attributes: { wrestling: 15, takedownDefence: 12, strength: 7, groundControl: 4, cardio: 2 },
    naturals: { explosiveness: 5, engine: 5 },
  },
  jiuJitsu: {
    key: 'jiuJitsu',
    kind: 'combat',
    label: 'Brazilian Jiu-Jitsu',
    blurb:
      'Dangerous everywhere on the ground, including off your back. Position is a language you already speak.',
    weakness: 'You have to get it there first, and standing up you are a target.',
    attributes: { submissions: 16, scrambling: 11, groundControl: 8, fightIq: 3, composure: 2 },
    naturals: { recovery: 5, motorLearning: 3 },
  },
  judo: {
    key: 'judo',
    kind: 'combat',
    label: 'Judo / Sambo',
    blurb:
      'Grips, throws and the strangle that follows. You take people off their feet from a position they thought was safe.',
    weakness: 'Everything you know starts from a grip nobody in a cage is obliged to give you.',
    attributes: { wrestling: 11, submissions: 10, groundControl: 7, strength: 6, scrambling: 6 },
    naturals: { explosiveness: 4, recovery: 3 },
  },

  /*
   * The athletic branch: eighteen points of skill against forty, and the biggest naturals
   * leanings in the game.
   *
   * This is the most mechanically distinct choice available and it is meant to be. Every
   * combat origin is a bet on what you already are; this is a bet on what you could become,
   * paid for by turning pro genuinely unable to fight. The old `athlete` background was the
   * same idea, but it had to be a *background*, so it competed with the six arts on their
   * own axis. Here it is a different branch of a different layer, which is what lets it be
   * this lopsided without being either a trap or a dominant pick.
   */
  trackAndField: {
    key: 'trackAndField',
    kind: 'athletic',
    label: 'Track & Field',
    blurb:
      'Sprints, jumps, throws. You are explosive in a way that cannot be taught and you have never thrown a punch at a person.',
    weakness: 'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { speed: 9, power: 6, strength: 3 },
    naturals: { explosiveness: 11, motorLearning: 5, engine: 3, recovery: 2 },
  },
  contactSport: {
    key: 'contactSport',
    kind: 'athletic',
    label: 'Rugby / American Football',
    blurb:
      'Big, strong, and entirely used to collisions. Somebody has been running into you at speed since you were twelve.',
    weakness: 'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { strength: 8, durability: 6, power: 4 },
    naturals: { constitution: 9, explosiveness: 7, engine: 4, motorLearning: 4 },
  },
  enduranceSport: {
    key: 'enduranceSport',
    kind: 'athletic',
    label: 'Rowing / Distance Running',
    blurb:
      'An engine nobody in this sport can match and a tolerance for suffering that was built over years.',
    weakness: 'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { cardio: 11, composure: 4, strength: 3 },
    naturals: { engine: 11, recovery: 6, motorLearning: 4, explosiveness: 1 },
  },
};

export const isAthleticOrigin = (d: Discipline): d is AthleticOrigin =>
  DISCIPLINE_META[d].kind === 'athletic';

/**
 * What a secondary discipline is worth relative to the primary, and what it costs.
 *
 * A secondary is **paid for out of the primary**, not added on top: with one selected the
 * primary drops to 0.75 and the secondary comes in at 0.25, so the total bias is exactly
 * the same 40 points either way.
 *
 * Both halves of that matter. The 3:1 ratio is what makes "a wrestler who can box" and "a
 * boxer who can wrestle" different fighters rather than two names for one blend. Conserving
 * the total is what stops the secondary being a free upgrade that every player takes for
 * the same reason — and it is why a third pick is not offered at all: with three free picks
 * either each is too weak to feel or taking all three is strictly correct, and conserving
 * the total across three would leave nobody specialised in anything.
 */
export const SECONDARY_WEIGHT = 0.25;
export const PRIMARY_WEIGHT_WITH_SECONDARY = 1 - SECONDARY_WEIGHT;

// --- Layer 3: attainment ---------------------------------------------------------------

export const ATTAINMENTS = ['amateur', 'regional', 'national', 'world'] as const;
export type Attainment = (typeof ATTAINMENTS)[number];

export interface AttainmentMeta {
  key: Attainment;
  /** Combat wording. */
  label: string;
  /** The same rung, said the way a non-combat sport says it. */
  athleticLabel: string;
  blurb: string;
  athleticBlurb: string;
  /**
   * Multiplier on the discipline's attribute bias. `regional` is the reference at 1.0.
   *
   * Kept in a narrow band on purpose. Attainment's real job is `reputation`, not ratings:
   * a national champion wrestler is not twice the wrestler a regional one is, but he is
   * somebody promoters have heard of, and that is a thing the game already models properly
   * through `standingScore`. Widening this instead would just be a second, redundant talent
   * dial sitting next to layer 1.
   */
  skill: number;
  /**
   * Starting `reputation`, which `standingScore` carries into promotion rankings at
   * `transferRate(undefined) = 0.25`, fading over the first six bouts (`carryWeight`).
   *
   * So a world-level amateur debuts about nine ranking points up on a nobody and has six
   * fights to convert that into results before it is gone. That is the Pereira shape the
   * standing module was written for, and it is the whole reason this layer is worth having.
   */
  reputation: number;
  starPower: number;
  /**
   * The floor on debut age, in years.
   *
   * This is the balance for the whole layer and it is self-balancing rather than arbitrary:
   * you cannot medal at a world championship at nineteen and also turn pro at nineteen. A
   * fighter who arrives with a name arrives having spent the years it took to build it, and
   * ageing (`applyAgeing`) then charges them for it for the rest of the career.
   */
  minDebutAge: number;
}

export const ATTAINMENT_META: Readonly<Record<Attainment, AttainmentMeta>> = {
  amateur: {
    key: 'amateur',
    label: 'Club level',
    athleticLabel: 'Club level',
    blurb: 'A few smokers and a local tournament. Nobody outside the gym knows your name.',
    athleticBlurb: 'You played, and you were good for the club. That is as far as it went.',
    skill: 0.8,
    // The same 5 / 1 a created fighter has always debuted with, so the entry rung of the
    // new system is exactly the old starting point.
    reputation: 5,
    starPower: 1,
    minDebutAge: 18,
  },
  regional: {
    key: 'regional',
    label: 'Regional',
    athleticLabel: 'Semi-professional',
    blurb: 'State titles, regional circuit, a small write-up somewhere. Matchmakers in one region know you.',
    athleticBlurb: 'Paid a little, trained properly, and were plainly better than the amateurs around you.',
    skill: 1,
    reputation: 14,
    starPower: 3,
    minDebutAge: 19,
  },
  national: {
    key: 'national',
    label: 'National team',
    athleticLabel: 'Professional',
    blurb: 'You made the national squad and you medalled at it. People in the sport argue about you.',
    athleticBlurb: 'A full professional career in another sport, with a following that came with it.',
    skill: 1.15,
    reputation: 26,
    starPower: 7,
    minDebutAge: 22,
  },
  world: {
    key: 'world',
    label: 'Olympic / World level',
    athleticLabel: 'International',
    blurb: 'You stood on a podium with the flag behind you. Promoters have wanted this phone call for years.',
    athleticBlurb: 'You represented your country at the top of your sport. Everybody already knows the name.',
    skill: 1.3,
    reputation: 40,
    starPower: 14,
    minDebutAge: 25,
  },
};

/**
 * Which attainments layer 1 allows.
 *
 * The filter is a ceiling, not a window: a freak who never left the local amateurs is a
 * real and interesting person (the undiscovered one), whereas a world medallist who is not
 * an elite athlete is a contradiction. So talent removes rungs from the top, never from the
 * bottom.
 */
export function attainmentsForTalent(talent: TalentTier): readonly Attainment[] {
  const highest: Record<TalentTier, Attainment> = {
    freak: 'world',
    natural: 'national',
    grinder: 'regional',
  };
  const cut = ATTAINMENTS.indexOf(highest[talent]);
  return ATTAINMENTS.slice(0, cut + 1);
}

/** Which disciplines layer 1 allows. Only the non-combat branch is ever gated. */
export function disciplinesForTalent(talent: TalentTier): readonly Discipline[] {
  return TALENT_META[talent].allowsAthleticOrigin ? DISCIPLINES : COMBAT_DISCIPLINES;
}

/**
 * Which disciplines may be taken as a second art.
 *
 * Never the primary, and never a non-combat sport. The latter is what protects the athletic
 * branch's whole identity: if "rugby" could be bolted onto a boxer it would be a naturals
 * bonus with no downside, every player would take it, and the branch would stop being the
 * lopsided bet it exists to be.
 */
export function secondaryOptionsFor(primary: Discipline): readonly CombatDiscipline[] {
  if (isAthleticOrigin(primary)) return [];
  return COMBAT_DISCIPLINES.filter((d) => d !== primary);
}

// --- The origin itself -------------------------------------------------------------------

export interface FighterOrigin {
  talent: TalentTier;
  discipline: Discipline;
  /** Optional second art, worth a third of the primary and paid for out of it. */
  secondary?: CombatDiscipline;
  attainment: Attainment;
}

/** A sensible, always-legal starting point for the creation screen. */
export const DEFAULT_ORIGIN: FighterOrigin = {
  talent: 'natural',
  discipline: 'wrestling',
  attainment: 'regional',
};

/**
 * Force an origin back into legality after a layer above it changed.
 *
 * The creation screen needs this because the layers cascade: dropping from Freak to Grinder
 * has to do something with the Olympic attainment and the rugby background that are no
 * longer on offer. Silently keeping them would let the UI submit a spec that validation
 * rejects; clearing everything would throw away choices the player did not change. So each
 * illegal field falls to the nearest legal one and everything else survives.
 */
export function reconcileOrigin(origin: FighterOrigin): FighterOrigin {
  const disciplines = disciplinesForTalent(origin.talent);
  const discipline = disciplines.includes(origin.discipline)
    ? origin.discipline
    : // Only ever reached by an athletic origin losing its tier, and a raw athlete's nearest
      // combat neighbour is not meaningful — so land on the default rather than pretend.
      DEFAULT_ORIGIN.discipline;

  const allowed = attainmentsForTalent(origin.talent);
  const attainment = allowed.includes(origin.attainment)
    ? origin.attainment
    : allowed[allowed.length - 1]!;

  const secondary =
    origin.secondary && secondaryOptionsFor(discipline).includes(origin.secondary)
      ? origin.secondary
      : undefined;

  return { talent: origin.talent, discipline, secondary, attainment };
}

/** The label an attainment wears under this discipline. */
export function attainmentLabel(attainment: Attainment, discipline: Discipline): string {
  const meta = ATTAINMENT_META[attainment];
  return isAthleticOrigin(discipline) ? meta.athleticLabel : meta.label;
}

/** The blurb an attainment wears under this discipline. */
export function attainmentBlurb(attainment: Attainment, discipline: Discipline): string {
  const meta = ATTAINMENT_META[attainment];
  return isAthleticOrigin(discipline) ? meta.athleticBlurb : meta.blurb;
}

/**
 * The origin as one sentence of fiction.
 *
 * The only summary of the three layers the player ever gets, and it names the fiction —
 * what you did — rather than any of the numbers it set. Ceilings stay hidden (doc/06); the
 * point of hiding them is that coaches, scouting and camps are the things that reveal them.
 */
export function describeOrigin(origin: FighterOrigin): string {
  const discipline = DISCIPLINE_META[origin.discipline];
  const attainment = attainmentLabel(origin.attainment, origin.discipline);
  const talent = TALENT_META[origin.talent].label.toLowerCase();

  const art = origin.secondary
    ? `${discipline.label} with a serious grounding in ${DISCIPLINE_META[origin.secondary].label}`
    : discipline.label;

  return isAthleticOrigin(origin.discipline)
    ? `A ${talent} out of ${art} — ${attainment} — with no fighting behind you at all.`
    : `A ${talent} out of ${art} — ${attainment}.`;
}

/**
 * The three layers collapsed into the numbers `createPlayerFighter` actually consumes.
 *
 * Deliberately a pure function of the origin with no `Rng` argument: everything stochastic
 * stays in `createPlayerFighter`, so this can be unit-tested by reading it rather than by
 * sampling it, and so the origin cannot change the *order* of random draws — which is what
 * keeps existing seeded fixtures and the long-sim baselines stable.
 */
export interface ResolvedOrigin {
  naturalsCentre: number;
  naturals: Readonly<Partial<Record<OriginNaturalKey, number>>>;
  attributes: Readonly<Partial<Record<AttributeKey, number>>>;
  reputation: number;
  starPower: number;
}

export function resolveOrigin(origin: FighterOrigin): ResolvedOrigin {
  const talent = TALENT_META[origin.talent];
  const attainment = ATTAINMENT_META[origin.attainment];
  const primary = DISCIPLINE_META[origin.discipline];
  const secondary = origin.secondary ? DISCIPLINE_META[origin.secondary] : undefined;

  const primaryWeight = secondary ? PRIMARY_WEIGHT_WITH_SECONDARY : 1;

  const attributes: Partial<Record<AttributeKey, number>> = {};
  const add = (bias: AttributeBias, weight: number) => {
    for (const [key, value] of Object.entries(bias) as [AttributeKey, number][]) {
      attributes[key] = (attributes[key] ?? 0) + value * weight * attainment.skill;
    }
  };
  add(primary.attributes, primaryWeight);
  if (secondary) add(secondary.attributes, SECONDARY_WEIGHT);

  /*
   * Naturals are *not* scaled by attainment.
   *
   * How far you got is a fact about your career; what your body is made of is a fact about
   * your body, and the whole reason layer 1 exists is that the old flat picker let those two
   * be the same lever. Attainment already moves skill and reputation; letting it also move
   * ceilings would put the double-count straight back in.
   */
  const naturals: Partial<Record<OriginNaturalKey, number>> = {};
  const lean = (bias: NaturalBias, weight: number) => {
    for (const [key, value] of Object.entries(bias) as [OriginNaturalKey, number][]) {
      naturals[key] = (naturals[key] ?? 0) + value * weight;
    }
  };
  lean(primary.naturals, primaryWeight);
  if (secondary) lean(secondary.naturals, SECONDARY_WEIGHT);

  return {
    naturalsCentre: talent.naturalsCentre,
    naturals,
    attributes,
    reputation: attainment.reputation,
    starPower: attainment.starPower,
  };
}
