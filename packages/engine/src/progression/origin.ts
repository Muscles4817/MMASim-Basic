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

import type { AptitudeKey, AttributeKey } from '../ratings/attributes.js';

/**
 * The naturals an origin may lean.
 *
 * `injuryProneness` is deliberately outside anybody's control and is not biasable here — an origin
 * that could buy a good injury roll would make the one genuinely unfair number in the game a
 * purchase. `frame` used to be excluded for a different reason (it was derived from walking weight);
 * it no longer exists at all, and what it was standing in for is now the body prior below.
 *
 * `forceVelocityBias` joined the list at doc 31 § 12 step 9, and it is the natural this layer most
 * obviously needed. A sprinter and a shot putter are both explosive; what separates them is which
 * end of the force-velocity curve that explosiveness comes out of, and before step 6 there was no
 * number for that, which is precisely why the two of them had to share one `trackAndField` entry.
 */
export type OriginNaturalKey =
  'explosiveness' | 'forceVelocityBias' | 'engine' | 'constitution' | 'recovery' | 'motorLearning';

export type NaturalBias = Readonly<Partial<Record<OriginNaturalKey, number>>>;
export type AttributeBias = Readonly<Partial<Record<AttributeKey, number>>>;

/*
 * **Layer 1 was `talent`, and it was deleted at doc 31 § 12 step 10.**
 *
 * It was three tiers — freak, natural, grinder — that centred the rolled naturals at 76, 70 and 64,
 * gated which attainments and which disciplines were on the menu, and asked the player, in as many
 * words, how gifted they would like to be.
 *
 * Every one of those three jobs stopped being honest once the ladder landed.
 *
 *  - **Choosing your own genetics.** doc/06 and this screen's own footer say the player is never
 *    shown their naturals, because finding out what you got is what coaches, scouting and ten years
 *    of camps are for. A tier at the top of the screen that sets them is that promise broken before
 *    the first fight.
 *  - **Gating attainment.** "Nobody medals at a world championship without the body to do it" is
 *    true, and it is a *consequence* rather than a precondition. Selection ran the other way round:
 *    the medal is evidence about the athlete, so the athlete should follow from the medal.
 *  - **Centring the naturals.** That was the pre-ladder way of saying "you are a good athlete". The
 *    body says it directly now, and the player picks the body.
 *
 * What replaced it is `ATTAINMENT_META.naturals` below. Attainment was always the layer carrying
 * this information — it is a record of what somebody actually did — and it is self-balancing in a
 * way a tier could never be, through `minDebutAge`: you cannot medal at a world championship at
 * nineteen and also turn professional at nineteen. A player who wants the athlete pays for it in
 * the years it took, and `applyAgeing` charges them for the rest of the career.
 */

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
 * The non-combat branch. **Five since doc 31 § 12 step 9, and the reason it can be five now is
 * that the engine gained two numbers it did not have when it was three.**
 *
 * The old comment here justified the cap honestly and was right at the time: `trackAndField` and
 * `enduranceSport` each had to be one entry because a sprinter and a thrower, or a rower and a
 * marathoner, would have landed on *identical* numbers. Both of them read `explosiveness` or
 * `engine` and nothing else, and a menu choice whose two outcomes are the same fighter is a lie
 * told to the player — the same test doc/18 § 5 applies to a seventh martial art.
 *
 * Two things changed underneath it.
 *
 *  - **`forceVelocityBias` (step 6).** A sprinter and a shot putter are both explosive. What
 *    separates them is which end of the force-velocity curve that explosiveness comes out of, and
 *    until there was a number for that, "explosive" was all either of them could say.
 *  - **The body (step 4), and its prior (this step).** A thrower and a distance runner differ by
 *    more than twenty index points of muscle, twenty of body fat, and sixty pounds. Before the body
 *    was a layer there was nowhere to put that, because `frame` was `walkingWeight / 300` and the
 *    division had already decided it.
 *
 * So the split is not a widened menu. It is two pairs that were being averaged because the engine
 * could not tell them apart, separated on the day it could. The test is unchanged and still
 * binding: a sixth ("swimmer", "cycling") would land on `rowing` or `distanceRunning` and is
 * therefore not offered.
 */
export const ATHLETIC_ORIGINS = [
  'sprints',
  'throws',
  'contactSport',
  'rowing',
  'distanceRunning',
] as const;
export type AthleticOrigin = (typeof ATHLETIC_ORIGINS)[number];

export type Discipline = CombatDiscipline | AthleticOrigin;
export const DISCIPLINES: readonly Discipline[] = [...COMBAT_DISCIPLINES, ...ATHLETIC_ORIGINS];

/**
 * What a life in a sport did to the body, in index points on the primitives in `body.ts`.
 *
 * Doc 31 § 12 step 9. Every index is drawn N(50, 16-18), so eight points is about half a standard
 * deviation and is a shove rather than a decision — the same principle the talent tiers use.
 *
 * **These are re-centred before they are applied, not added.** See `background.ts`: within any
 * division the population-weighted mean of every prior is subtracted, so a background moves a
 * fighter's body *relative to their division* and cannot move the division. A prior that was added
 * raw would mean whichever backgrounds happen to be common quietly inflate everybody.
 */
export interface BodyPrior {
  frameIndex?: number;
  muscleIndex?: number;
  bodyFatIndex?: number;
  /** In inches, not index points. Rowers are tall; that is a fact about rowers, not about frames. */
  heightInches?: number;
}

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
   *
   * **Player-created fighters only.** The generated world gets its shape from `realises` and
   * `aptitude` below instead, because those are claims about *where a fighter is on their own
   * curve* rather than flat additions, and a flat addition applied to 40,000 newgens is
   * indistinguishable from raising the world's ratings.
   */
  attributes: AttributeBias;
  /** Which of the hidden physical qualities this life selected for. */
  naturals: NaturalBias;
  /** What the sport selected for physically. Doc 31 § 22.2. */
  body: BodyPrior;
  /**
   * Extra share of their own ceiling this fighter has already reached at debut, per attribute, at
   * the reference attainment (`regional`).
   *
   * This is the "realisation" half of step 9 and it is why `arrivalFactor` now takes a history. A
   * national-team wrestler debuting at 24 is not a generic 24-year-old — he has spent a decade
   * doing one of the fifteen things on the card and none of the other fourteen. The ceiling is
   * untouched: realisation moves where a fighter *starts*, never how good they can become, so a
   * background can never be bought as potential.
   */
  realises: Readonly<Partial<Record<AttributeKey, number>>>;
  /**
   * Which family of skill this life leaves a fighter learning fastest, in rating points on the
   * aptitude roll. Doc 23 § 2.2.
   *
   * Realisation alone would be a debut artefact that washes out over a career — everybody
   * converges on the same flat technical ceilings, so the wrestler stops being a wrestler by
   * thirty. The aptitude lean is what makes a background durable without making it a ceiling.
   */
  aptitude: Readonly<Partial<Record<AptitudeKey, number>>>;
  /**
   * How far from the median professional this sport's people sit on mass, in standard deviations.
   *
   * Used only to condition which backgrounds turn up in which division: throwers are common at
   * heavyweight and absent at flyweight, and distance runners the reverse. Without this the body
   * prior would spend its life fighting the division the sampler was asked for.
   */
  massAffinity: number;
  /** Share of the professional intake from this background, before division conditioning. */
  intake: number;
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
    naturals: { explosiveness: 5, forceVelocityBias: 3 },
    body: { muscleIndex: 2, bodyFatIndex: -3 },
    realises: { strikingOffence: 0.11, strikingDefence: 0.07, speed: 0.03 },
    aptitude: { striking: 6 },
    massAffinity: 0,
    intake: 0.15,
  },
  kickboxing: {
    key: 'kickboxing',
    kind: 'combat',
    label: 'Kickboxing / Muay Thai',
    blurb:
      'Long weapons and shins that were conditioned the hard way. You are comfortable at a range most people find frightening.',
    weakness: 'You have spent your life being allowed to stand up. Nobody has ever taken you down.',
    attributes: {
      kicking: 16,
      strikingOffence: 10,
      strikingDefence: 7,
      durability: 5,
      strength: 2,
    },
    naturals: { explosiveness: 4, constitution: 4 },
    body: { heightInches: 0.8, frameIndex: -2, bodyFatIndex: -3 },
    realises: { kicking: 0.11, strikingOffence: 0.06, durability: 0.04 },
    aptitude: { striking: 6 },
    massAffinity: 0,
    intake: 0.18,
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
    naturals: { explosiveness: 6, forceVelocityBias: 5 },
    body: { heightInches: 0.5, muscleIndex: -4, bodyFatIndex: -5 },
    realises: { kicking: 0.09, speed: 0.05, strikingDefence: 0.05 },
    aptitude: { striking: 5, strategy: 2 },
    massAffinity: -0.3,
    intake: 0.06,
  },
  wrestling: {
    key: 'wrestling',
    kind: 'combat',
    label: 'Wrestling',
    blurb:
      'Years on the mat. You already know how to make a grown man go where you want him to go, and how to stop him doing it to you.',
    weakness: 'You have never been punched in the face properly.',
    attributes: { wrestling: 15, takedownDefence: 12, strength: 7, groundControl: 4, cardio: 2 },
    naturals: { explosiveness: 5, engine: 5, forceVelocityBias: -3 },
    body: { frameIndex: 4, muscleIndex: 7, bodyFatIndex: -4 },
    realises: { wrestling: 0.12, takedownDefence: 0.08, strength: 0.04 },
    aptitude: { grappling: 6, conditioning: 3 },
    massAffinity: 0.3,
    intake: 0.24,
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
    body: { muscleIndex: -2 },
    realises: { submissions: 0.12, scrambling: 0.08, groundControl: 0.05 },
    aptitude: { grappling: 6 },
    massAffinity: -0.2,
    intake: 0.17,
  },
  judo: {
    key: 'judo',
    kind: 'combat',
    label: 'Judo / Sambo',
    blurb:
      'Grips, throws and the strangle that follows. You take people off their feet from a position they thought was safe.',
    weakness: 'Everything you know starts from a grip nobody in a cage is obliged to give you.',
    attributes: { wrestling: 11, submissions: 10, groundControl: 7, strength: 6, scrambling: 6 },
    naturals: { explosiveness: 4, recovery: 3, forceVelocityBias: -2 },
    body: { frameIndex: 4, muscleIndex: 5 },
    realises: { wrestling: 0.07, submissions: 0.06, groundControl: 0.05, strength: 0.03 },
    aptitude: { grappling: 6 },
    massAffinity: 0.2,
    intake: 0.08,
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
  sprints: {
    key: 'sprints',
    kind: 'athletic',
    label: 'Sprints & Jumps',
    blurb:
      'Ten seconds of work at a time, for fifteen years. You are explosive in a way that cannot be taught and you have never thrown a punch at a person.',
    weakness:
      'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { speed: 10, power: 6, strength: 2 },
    naturals: { explosiveness: 12, forceVelocityBias: 8, motorLearning: 5, engine: 2, recovery: 2 },
    // Lean and dense rather than large. A 100m finalist is not a big man; he is a man with almost
    // no fat on him, which is a body-fat statement and not a mass one.
    body: { muscleIndex: 8, bodyFatIndex: -10, frameIndex: -2 },
    realises: { speed: 0.1, power: 0.05 },
    aptitude: { conditioning: 4, striking: 2 },
    massAffinity: 0,
    intake: 0.022,
  },
  throws: {
    key: 'throws',
    kind: 'athletic',
    label: 'Throws',
    blurb:
      'Shot, discus, hammer. You are one of the largest and strongest people most rooms have ever had in them, and none of it was for show.',
    weakness:
      'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { strength: 10, power: 7, speed: 1 },
    naturals: { explosiveness: 10, forceVelocityBias: -9, motorLearning: 4, constitution: 3 },
    // The largest prior in the game, and the one that most needs the division conditioning below:
    // a thrower belongs at heavyweight and the sampler should almost never be asked for one at
    // flyweight.
    body: { frameIndex: 12, muscleIndex: 12, bodyFatIndex: 6, heightInches: 1.5 },
    realises: { strength: 0.1, power: 0.05 },
    aptitude: { grappling: 3, conditioning: 2 },
    massAffinity: 1.4,
    intake: 0.012,
  },
  contactSport: {
    key: 'contactSport',
    kind: 'athletic',
    label: 'Rugby / American Football',
    blurb:
      'Big, strong, and entirely used to collisions. Somebody has been running into you at speed since you were twelve.',
    weakness:
      'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { strength: 8, durability: 6, power: 4 },
    naturals: { constitution: 9, explosiveness: 7, engine: 4, motorLearning: 4 },
    body: { frameIndex: 8, muscleIndex: 7, bodyFatIndex: 4 },
    realises: { durability: 0.06, strength: 0.05 },
    aptitude: { grappling: 3, conditioning: 3 },
    massAffinity: 0.9,
    intake: 0.026,
  },
  rowing: {
    key: 'rowing',
    kind: 'athletic',
    label: 'Rowing',
    blurb:
      'Tall, long, and built by six years of the most miserable training in sport. You are strong in a way that lasts all afternoon.',
    weakness:
      'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { cardio: 9, strength: 6, composure: 3 },
    // 11 and 6 rather than 10 and 5. `origin.test.ts` asserts that every athletic origin
    // out-ceilings every combat art — that is the whole identity of the branch, and it is the
    // price paid for debuting unable to fight — and the first draft of this entry landed 0.03
    // under it. Splitting `enduranceSport` should not have cost the half of it that stayed.
    naturals: {
      engine: 11,
      recovery: 6,
      forceVelocityBias: -4,
      motorLearning: 4,
      explosiveness: 2,
    },
    // The tallest prior in the game. Rowing selects on height harder than any sport here — leverage
    // on an oar is length — and that is a claim the old shared `enduranceSport` entry could not
    // make, because it had to be true of marathoners at the same time.
    body: { heightInches: 2.5, frameIndex: 7, muscleIndex: 5, bodyFatIndex: -5 },
    realises: { cardio: 0.09, strength: 0.04 },
    aptitude: { conditioning: 6 },
    massAffinity: 0.8,
    intake: 0.012,
  },
  distanceRunning: {
    key: 'distanceRunning',
    kind: 'athletic',
    label: 'Distance Running',
    blurb:
      'An engine nobody in this sport can match, on a frame that carries nothing it does not need. You have suffered for longer at a time than anybody you will meet in a cage.',
    weakness:
      'You are an athlete pretending to be a fighter. Everything technical is ahead of you.',
    attributes: { cardio: 12, composure: 4, speed: 2 },
    naturals: { engine: 13, recovery: 6, motorLearning: 4 },
    // The mirror of `throws`, and the pair is the argument for the split: these two were one entry
    // called `trackAndField` and `enduranceSport` respectively averaged with their opposites, and
    // between them they now span 24 index points of muscle and 20 of fat.
    body: { muscleIndex: -11, bodyFatIndex: -14, frameIndex: -7 },
    realises: { cardio: 0.12, composure: 0.04 },
    aptitude: { conditioning: 7 },
    massAffinity: -1.3,
    intake: 0.008,
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

// --- Layer 2 (was 3): attainment -------------------------------------------------------

/**
 * Where a created fighter's rolled naturals centre, for everybody.
 *
 * One number since step 10 deleted the talent tiers, and it is the middle one they had: `natural`
 * sat at 70, which is the value `createPlayerFighter` was tuned and measured at. Keeping the old
 * middle as the new universal centre means the balance envelope the long-sim suite already asserts
 * is unchanged for the median created fighter, and the spread around it now comes from attainment
 * and from the roll rather than from a dial.
 */
export const NATURALS_CENTRE = 70;

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
  /**
   * What this rung is evidence of about the athlete, in rating points on the naturals.
   *
   * The replacement for the deleted talent tier — see the note where layer 1 used to be. The spread
   * is +/-6 against a roll with a standard deviation of 11 to 16, so it is the same size of shove
   * the tiers were, arriving through something the player actually did rather than through a
   * question about their genetics.
   *
   * `motorLearning` is deliberately the largest term and `constitution` the smallest. Getting to a
   * world final is mostly evidence that you learn faster than the people who did not, and it is
   * almost no evidence at all about your chin — nothing in athletics tests one.
   */
  naturals: NaturalBias;
  /**
   * Multiplier on the discipline's `realises` shares. `regional` is the reference at 1.0.
   *
   * Deliberately wider than `skill`, and for a reason that is the opposite of the one that keeps
   * `skill` narrow. `skill` is a claim about *ceilings*, where attainment must not be a second
   * talent dial. This is a claim about how much of an existing ceiling somebody has already
   * reached, and there the difference between a club player and a national squad member is
   * genuinely large: it is the difference between six years of training and sixteen.
   *
   * It buys nothing at the top. A fighter who arrives at 0.95 of a mediocre ceiling is still
   * mediocre, and has less left to gain than the club fighter next to him — which is the trade
   * this layer is supposed to make and the reason it is not simply better to be a world medallist.
   */
  realisation: number;
  /** Share of the professional intake at this attainment, before the debut-age filter. */
  intake: number;
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
    realisation: 0.45,
    naturals: { explosiveness: -3, engine: -3, motorLearning: -5, recovery: -2 },
    intake: 0.4,
  },
  regional: {
    key: 'regional',
    label: 'Regional',
    athleticLabel: 'Semi-professional',
    blurb:
      'State titles, regional circuit, a small write-up somewhere. Matchmakers in one region know you.',
    athleticBlurb:
      'Paid a little, trained properly, and were plainly better than the amateurs around you.',
    skill: 1,
    reputation: 14,
    starPower: 3,
    minDebutAge: 19,
    realisation: 1,
    naturals: {},
    intake: 0.38,
  },
  national: {
    key: 'national',
    label: 'National team',
    athleticLabel: 'Professional',
    blurb:
      'You made the national squad and you medalled at it. People in the sport argue about you.',
    athleticBlurb:
      'A full professional career in another sport, with a following that came with it.',
    skill: 1.15,
    reputation: 26,
    starPower: 7,
    minDebutAge: 22,
    realisation: 1.55,
    naturals: { explosiveness: 3, engine: 3, motorLearning: 5, recovery: 2, constitution: 1 },
    intake: 0.18,
  },
  world: {
    key: 'world',
    label: 'Olympic / World level',
    athleticLabel: 'International',
    blurb:
      'You stood on a podium with the flag behind you. Promoters have wanted this phone call for years.',
    athleticBlurb:
      'You represented your country at the top of your sport. Everybody already knows the name.',
    skill: 1.3,
    reputation: 40,
    starPower: 14,
    minDebutAge: 25,
    realisation: 2,
    naturals: { explosiveness: 5, engine: 5, motorLearning: 8, recovery: 3, constitution: 2 },
    intake: 0.04,
  },
};

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
  discipline: Discipline;
  /** Optional second art, worth a third of the primary and paid for out of it. */
  secondary?: CombatDiscipline;
  attainment: Attainment;
}

/** A sensible, always-legal starting point for the creation screen. */
export const DEFAULT_ORIGIN: FighterOrigin = {
  discipline: 'wrestling',
  attainment: 'regional',
};

/**
 * Force an origin back into legality after the discipline changed.
 *
 * Two layers rather than three since step 10, and only one of them can now be made illegal by
 * the other: a secondary art has to be a *different* combat art, and switching the primary to an
 * athletic origin removes the secondary entirely. Attainment is no longer gated by anything —
 * every rung is open to everybody, and what stops "Olympic" being the automatic pick is
 * `minDebutAge` rather than a filter.
 */
export function reconcileOrigin(origin: FighterOrigin): FighterOrigin {
  const secondary =
    origin.secondary && secondaryOptionsFor(origin.discipline).includes(origin.secondary)
      ? origin.secondary
      : undefined;

  return { discipline: origin.discipline, secondary, attainment: origin.attainment };
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

  const art = origin.secondary
    ? `${discipline.label} with a serious grounding in ${DISCIPLINE_META[origin.secondary].label}`
    : discipline.label;

  return isAthleticOrigin(origin.discipline)
    ? `Out of ${art} — ${attainment} — with no fighting behind you at all.`
    : `Out of ${art} — ${attainment}.`;
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
   * **Attainment now leans the naturals, and until step 10 it deliberately did not.**
   *
   * The old comment here said: how far you got is a fact about your career, what your body is made
   * of is a fact about your body, and letting attainment move ceilings would double-count against
   * layer 1. That reasoning was sound *while layer 1 existed*. With `talent` deleted, refusing to
   * let attainment say anything about the athlete does not avoid a double count — it means nothing
   * in the game says it at all, and a world medallist and a club amateur roll identical bodies.
   *
   * Selection is real and it runs one way: standing on a world podium is *evidence* about the
   * athlete, which is exactly what the old `attainmentsForTalent` gate was trying to express by
   * refusing to offer the rung. Stating it as a consequence is the honest form of the same claim,
   * and it is a shove rather than a guarantee — `NATURALS_ROLL_SD` is wide enough that a world
   * medallist can still roll a bad chin.
   */
  const naturals: Partial<Record<OriginNaturalKey, number>> = {};
  for (const [key, value] of Object.entries(attainment.naturals) as [OriginNaturalKey, number][]) {
    naturals[key] = value;
  }
  const lean = (bias: NaturalBias, weight: number) => {
    for (const [key, value] of Object.entries(bias) as [OriginNaturalKey, number][]) {
      naturals[key] = (naturals[key] ?? 0) + value * weight;
    }
  };
  lean(primary.naturals, primaryWeight);
  if (secondary) lean(secondary.naturals, SECONDARY_WEIGHT);

  return {
    naturalsCentre: NATURALS_CENTRE,
    naturals,
    attributes,
    reputation: attainment.reputation,
    starPower: attainment.starPower,
  };
}
