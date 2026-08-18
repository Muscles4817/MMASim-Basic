/**
 * Traits — the discrete, discoverable, mechanically-hooked layer of personality.
 *
 * Traits are **data, not code**. A trait declares multiplicative and/or additive hooks;
 * systems ask for a hook value and get the combined effect of everything a fighter carries.
 * Adding a trait that reuses existing hooks requires no simulator change at all.
 *
 * See docs/04-personality.md.
 */

/** Multiplicative hooks. Absent = 1.0. Combined by multiplication. */
export const MUL_HOOKS = [
  'campGain',
  'campInjuryRisk',
  'fightInjuryRisk',
  'idleDecay',
  'weightMissRisk',
  'fatigueRate',
  'recoveryRate',
  'durabilityDecay',
  'headTraumaRate',
  'strikeOutput',
  'strikeAccuracy',
  /**
   * How often this fighter reaches for a takedown, relative to everything else they could do.
   *
   * Read at the *intent* weight rather than at the takedown contest, so it means what it is
   * called: a `chainWrestler` shoots more, and whether the shot lands is still their wrestling
   * against the other man's defence. It sat on the contest instead until docs/19 phase 3, where
   * it would have paid twice for one trait — more shots *and* better ones — and it sat there
   * with no trait setting it at all, which is why nobody noticed.
   */
  'takedownRate',
  'finishingUrge',
  'starPowerGrowth',
  'heatGeneration',
  'developmentRate',
  /**
   * Multiplier on confidence lost to a defeat. See docs/25 §1.4.
   *
   * The trait table has carried the vocabulary for this since it was written — `fragileEgo`
   * ("Losses cut deep"), `durableMind` ("came back exactly the same fighter"), `gunShy` — and
   * none of it reached the one line that actually decided what a loss did to somebody.
   * `durableMind` is the sharpest case: it is *acquired by surviving a knockout* and then had no
   * bearing on what that knockout cost.
   */
  'confidenceLoss',
  'purseDemand',
  /** How expensively they live between fights. See docs/17-money.md. */
  'livingCost',
] as const;

/** Additive hooks. Absent = 0. Combined by summation. Units are documented per hook. */
export const ADD_HOOKS = [
  /** Rating points added to the floor Durability can decay to. */
  'durabilityFloorShift',
  /** Rating points of effective Power/Strength from carrying extra mass into the cage. */
  'sizeAdvantage',
  /** 0–1. How much momentum swings amplify performance (frontrunner/dog behaviour). */
  'momentumSensitivity',
  /** 0–1 added to game-plan adherence. Negative for freelancers. */
  'gamePlanAdherence',
  /** 0–1. Shifts output distribution from early rounds to late rounds. */
  'lateRoundBias',
  /** Rating points of effective Composure when hurt. */
  'compositionUnderFire',
  /** 0–1 probability per fight of a short-notice acceptance. */
  'shortNoticeWillingness',
] as const;

export type MulHook = (typeof MUL_HOOKS)[number];
export type AddHook = (typeof ADD_HOOKS)[number];

export type TraitCategory = 'camp' | 'fight' | 'mental' | 'business' | 'health';
export type TraitPolarity = 'positive' | 'negative' | 'doubleEdged';

export interface TraitDef {
  id: TraitId;
  label: string;
  blurb: string;
  category: TraitCategory;
  polarity: TraitPolarity;
  /** How obvious this trait is to an observer, 1–100. Drives scouting discovery. */
  visibility: number;
  /** True if the trait can be gained or lost during play rather than only at generation. */
  acquirable?: boolean;
  mul?: Partial<Record<MulHook, number>>;
  add?: Partial<Record<AddHook, number>>;
  /**
   * Which ratings this trait implies, and in which direction.
   *
   * `+1` means the trait belongs on somebody strong in that attribute, `-1` on somebody weak, and
   * the magnitude scales how hard generation leans. Data rather than code, like every other part
   * of a trait: `generateTraits` weights its pool by this and nothing else needs to know.
   *
   * The point is coherence, not balance. Generation picked uniformly from the whole table before
   * docs/19 phase 3, so a `cardioMachine` with 30 `cardio` and a `headhunter` who cannot punch
   * arrived at exactly the rate chance produces them, and a fighter's own numbers argued with the
   * labels on their profile screen.
   *
   * Absent means the trait says nothing about ratings — a `mercenary` or a `partyAnimal` can be
   * anybody, and pretending otherwise would invent a correlation the design does not claim.
   */
  affinity?: Partial<Record<AffinityAttribute, number>>;
}

/**
 * The attributes a trait is allowed to imply.
 *
 * The stored attribute keys, restated here rather than imported: `traits.ts` is domain data and
 * `ratings/` is the numeric layer, and an import in that direction would put the trait table
 * downstream of every future rating change.
 */
export type AffinityAttribute =
  | 'power'
  | 'speed'
  | 'cardio'
  | 'durability'
  | 'strength'
  | 'strikingOffence'
  | 'kicking'
  | 'strikingDefence'
  | 'wrestling'
  | 'takedownDefence'
  | 'groundControl'
  | 'submissions'
  | 'scrambling'
  | 'fightIq'
  | 'composure';

export const TRAIT_IDS = [
  'gymRat',
  'loneWolf',
  'weightCutGambler',
  'frontrunner',
  'dog',
  'trashTalker',
  'ironChin',
  'glassCannon',
  'gunShy',
  'fragileEgo',
  'partyAnimal',
  'companyMan',
  'mercenary',
  'lateStarter',
  'fastStarter',
  'chinny',
  'cardioMachine',
  'gatekeeperMentality',
  'volumeMachine',
  'headhunter',
  'finisher',
  'chainWrestler',
  'sprawlAndBrawl',
  'durableMind',
  'injuryProne',
  'quickHealer',
  'hypeMerchant',
  'protectedProspect',
] as const;

export type TraitId = (typeof TRAIT_IDS)[number];

/**
 * The trait table.
 *
 * Design rule: `doubleEdged` should be the largest category. A trait that is purely good
 * with no cost is a balance bug, and a test asserts the ratio.
 */
export const TRAITS: Readonly<Record<TraitId, TraitDef>> = {
  gymRat: {
    id: 'gymRat',
    label: 'Gym Rat',
    blurb: 'Never leaves the gym. Improves fast — and breaks down doing it.',
    category: 'camp',
    polarity: 'doubleEdged',
    visibility: 55,
    mul: { campGain: 1.35, developmentRate: 1.2, campInjuryRisk: 1.4, idleDecay: 0.7 },
  },
  loneWolf: {
    id: 'loneWolf',
    label: 'Lone Wolf',
    blurb: 'Fights their own fight. The plan is a suggestion.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 60,
    add: { gamePlanAdherence: -0.35 },
  },
  weightCutGambler: {
    id: 'weightCutGambler',
    label: 'Weight-Cut Gambler',
    blurb: 'Cuts more than is sane. Bigger in the cage, emptier by round two.',
    category: 'camp',
    polarity: 'doubleEdged',
    visibility: 40,
    mul: { weightMissRisk: 2.6, fatigueRate: 1.3 },
    add: { sizeAdvantage: 6 },
    affinity: { strength: 0.6 },
  },
  frontrunner: {
    id: 'frontrunner',
    label: 'Frontrunner',
    blurb: 'Electric in front. Folds the moment it turns.',
    category: 'mental',
    polarity: 'doubleEdged',
    visibility: 35,
    mul: { confidenceLoss: 1.25 },
    add: { momentumSensitivity: 0.45 },
  },
  dog: {
    id: 'dog',
    label: 'Dog',
    blurb: 'Better hurt than fresh. Will not stop coming.',
    category: 'mental',
    polarity: 'doubleEdged',
    visibility: 45,
    mul: { fightInjuryRisk: 1.2, headTraumaRate: 1.25, confidenceLoss: 0.75 },
    add: { momentumSensitivity: -0.35, compositionUnderFire: 14 },
    affinity: { composure: 0.8, durability: 0.5 },
  },
  trashTalker: {
    id: 'trashTalker',
    label: 'Trash Talker',
    blurb: 'Sells fights nobody asked for. Makes enemies doing it.',
    category: 'business',
    polarity: 'doubleEdged',
    visibility: 95,
    mul: { heatGeneration: 1.9, starPowerGrowth: 1.35, purseDemand: 1.2 },
  },
  ironChin: {
    id: 'ironChin',
    label: 'Iron Chin',
    blurb: 'Takes shots that end other people and asks for more. Nobody saves them from it.',
    category: 'health',
    // Double-edged, not positive: the fighters who can absorb the most are precisely the
    // ones who stay in fights they should have been pulled out of. The chin buys them
    // years of wins and costs them the back half of their career.
    polarity: 'doubleEdged',
    visibility: 70,
    mul: { durabilityDecay: 0.6, headTraumaRate: 1.4 },
    add: { durabilityFloorShift: 10 },
    affinity: { durability: 1 },
  },
  glassCannon: {
    id: 'glassCannon',
    label: 'Glass Cannon',
    blurb: 'Ends fights early — one way or the other.',
    category: 'health',
    polarity: 'doubleEdged',
    visibility: 65,
    mul: { finishingUrge: 1.3 },
    add: { durabilityFloorShift: -14 },
    affinity: { power: 0.8, durability: -1 },
  },
  gunShy: {
    id: 'gunShy',
    label: 'Gun-Shy',
    blurb: 'Has been badly hurt and has not forgotten it.',
    category: 'mental',
    polarity: 'negative',
    visibility: 50,
    acquirable: true,
    mul: { strikeOutput: 0.75, finishingUrge: 0.6, confidenceLoss: 1.3 },
    affinity: { composure: -0.8 },
  },
  fragileEgo: {
    id: 'fragileEgo',
    label: 'Fragile Ego',
    blurb: 'Losses cut deep. Corrections cut deeper.',
    category: 'mental',
    polarity: 'negative',
    visibility: 30,
    mul: { confidenceLoss: 1.45 },
    add: { gamePlanAdherence: -0.15, momentumSensitivity: 0.2 },
  },
  partyAnimal: {
    id: 'partyAnimal',
    label: 'Party Animal',
    blurb: 'Trains hard for six weeks a year and lives hard for the other forty-six.',
    category: 'camp',
    polarity: 'negative',
    visibility: 60,
    mul: { campGain: 0.72, idleDecay: 1.7, weightMissRisk: 1.8, livingCost: 2.2 },
  },
  companyMan: {
    id: 'companyMan',
    label: 'Company Man',
    blurb: 'Takes the fight, makes the weight, never a headache.',
    category: 'business',
    polarity: 'positive',
    visibility: 50,
    // Lives within his means as well as fighting within them.
    mul: { purseDemand: 0.85, livingCost: 0.8 },
    add: { shortNoticeWillingness: 0.45 },
  },
  mercenary: {
    id: 'mercenary',
    label: 'Mercenary',
    blurb: 'Goes wherever the cheque is biggest and holds out until it is.',
    category: 'business',
    polarity: 'negative',
    visibility: 55,
    mul: { purseDemand: 1.35 },
    add: { shortNoticeWillingness: -0.25 },
  },
  lateStarter: {
    id: 'lateStarter',
    label: 'Late Starter',
    blurb: 'Gives away the first round and takes the last two.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 45,
    add: { lateRoundBias: 0.35 },
    affinity: { cardio: 0.8 },
  },
  fastStarter: {
    id: 'fastStarter',
    label: 'Fast Starter',
    blurb: 'Comes out to end it. Has less to give if it goes long.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 50,
    mul: { fatigueRate: 1.15 },
    add: { lateRoundBias: -0.3 },
    affinity: { cardio: -0.6, power: 0.5 },
  },
  chinny: {
    id: 'chinny',
    label: 'Chinny',
    blurb: 'The lights go out early now. Everyone in the division knows it.',
    category: 'health',
    polarity: 'negative',
    visibility: 75,
    acquirable: true,
    mul: { durabilityDecay: 1.5 },
    add: { durabilityFloorShift: -18 },
    affinity: { durability: -1.2 },
  },
  cardioMachine: {
    id: 'cardioMachine',
    label: 'Cardio Machine',
    blurb: 'Round five looks like round one. It is genuinely demoralising.',
    category: 'camp',
    polarity: 'positive',
    visibility: 70,
    mul: { fatigueRate: 0.78, recoveryRate: 1.25 },
    affinity: { cardio: 1.2 },
  },
  gatekeeperMentality: {
    id: 'gatekeeperMentality',
    label: 'Gatekeeper Mentality',
    blurb: 'Beats everyone below them and loses to everyone above. Never changes.',
    category: 'mental',
    polarity: 'negative',
    visibility: 25,
    // Losing to everyone above them is not a crisis, it is the plan. Nothing about a defeat at
    // that level tells a gatekeeper anything they had not already settled for.
    mul: { developmentRate: 0.5, confidenceLoss: 0.7 },
  },
  volumeMachine: {
    id: 'volumeMachine',
    label: 'Volume Machine',
    blurb: 'Throws more than anyone. Lands a smaller share of it.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 85,
    mul: { strikeOutput: 1.3, strikeAccuracy: 0.88, fatigueRate: 1.1 },
    affinity: { cardio: 1, strikingOffence: 0.6, power: -0.4 },
  },
  headhunter: {
    id: 'headhunter',
    label: 'Headhunter',
    blurb: 'Looking for the one shot. Ignores the body, ignores the legs.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 75,
    mul: { finishingUrge: 1.35, strikeOutput: 0.85 },
    affinity: { power: 1.1, fightIq: -0.4 },
  },
  chainWrestler: {
    id: 'chainWrestler',
    label: 'Chain Wrestler',
    blurb: 'Shoots, gets stuffed, shoots again. The twelfth one goes in as hard as the first.',
    category: 'fight',
    polarity: 'doubleEdged',
    // The most visible thing a fighter can do: everybody in the building knows what is coming.
    visibility: 85,
    mul: { takedownRate: 1.45, fatigueRate: 1.05 },
    affinity: { wrestling: 1.2, cardio: 0.5 },
  },
  sprawlAndBrawl: {
    id: 'sprawlAndBrawl',
    label: 'Sprawl and Brawl',
    blurb: 'Wants no part of the floor and fights like it. Will trade all night to stay up.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 70,
    mul: { takedownRate: 0.5, strikeOutput: 1.05 },
    affinity: { takedownDefence: 1, strikingOffence: 0.8, wrestling: -0.5 },
  },
  finisher: {
    id: 'finisher',
    label: 'Finisher',
    blurb: 'Smells blood and closes. Does not let hurt opponents recover.',
    category: 'fight',
    polarity: 'positive',
    visibility: 80,
    mul: { finishingUrge: 1.4 },
    affinity: { power: 0.7, submissions: 0.5 },
  },
  durableMind: {
    id: 'durableMind',
    label: 'Durable Mind',
    blurb: 'Has been knocked out and came back exactly the same fighter.',
    category: 'mental',
    polarity: 'positive',
    visibility: 40,
    mul: { confidenceLoss: 0.7 },
    add: { compositionUnderFire: 10 },
    affinity: { composure: 1 },
  },
  injuryProne: {
    id: 'injuryProne',
    label: 'Injury Prone',
    blurb: 'Something always goes. Camps get cut short, fights get pulled.',
    category: 'health',
    polarity: 'negative',
    visibility: 65,
    mul: { campInjuryRisk: 1.8, fightInjuryRisk: 1.5 },
  },
  quickHealer: {
    id: 'quickHealer',
    label: 'Quick Healer',
    blurb: 'Back in the gym while the stitches are still in.',
    category: 'health',
    polarity: 'positive',
    visibility: 45,
    mul: { recoveryRate: 1.45 },
  },
  hypeMerchant: {
    id: 'hypeMerchant',
    label: 'Hype Merchant',
    blurb: 'The narrative runs several fights ahead of the résumé.',
    category: 'business',
    polarity: 'doubleEdged',
    visibility: 80,
    acquirable: true,
    mul: { starPowerGrowth: 1.6, heatGeneration: 1.3, purseDemand: 1.3 },
  },
  protectedProspect: {
    id: 'protectedProspect',
    label: 'Protected Prospect',
    blurb: 'Matched carefully. The record is real; the level has not been.',
    category: 'business',
    polarity: 'doubleEdged',
    visibility: 35,
    acquirable: true,
    mul: { starPowerGrowth: 1.25, developmentRate: 0.85 },
  },
};

export const ALL_TRAITS: readonly TraitDef[] = TRAIT_IDS.map((id) => TRAITS[id]);

/** Combined multiplicative hook value for a set of traits. Absent hooks yield 1.0. */
export function traitMul(traits: readonly TraitId[], hook: MulHook): number {
  let value = 1;
  for (const id of traits) {
    const m = TRAITS[id]?.mul?.[hook];
    if (m !== undefined) value *= m;
  }
  return value;
}

/** Combined additive hook value for a set of traits. Absent hooks yield 0. */
export function traitAdd(traits: readonly TraitId[], hook: AddHook): number {
  let value = 0;
  for (const id of traits) {
    const a = TRAITS[id]?.add?.[hook];
    if (a !== undefined) value += a;
  }
  return value;
}

export function hasTrait(traits: readonly TraitId[], id: TraitId): boolean {
  return traits.includes(id);
}

/** Traits that can be gained or lost during play, rather than only at generation. */
export const ACQUIRABLE_TRAITS: readonly TraitId[] = TRAIT_IDS.filter(
  (id) => TRAITS[id].acquirable === true,
);

/**
 * Traits that should never coexist. The editor warns on these; generation refuses them.
 * Ordered pairs are treated as unordered.
 */
export const CONFLICTING_TRAITS: readonly (readonly [TraitId, TraitId])[] = [
  ['ironChin', 'chinny'],
  ['ironChin', 'glassCannon'],
  ['gymRat', 'partyAnimal'],
  ['companyMan', 'mercenary'],
  ['fastStarter', 'lateStarter'],
  ['frontrunner', 'dog'],
  ['durableMind', 'gunShy'],
  ['durableMind', 'fragileEgo'],
  ['injuryProne', 'quickHealer'],
  ['volumeMachine', 'headhunter'],
  ['chainWrestler', 'sprawlAndBrawl'],
];

/** Any conflicting pairs present in `traits`. Empty means coherent. */
export function findTraitConflicts(
  traits: readonly TraitId[],
): readonly (readonly [TraitId, TraitId])[] {
  return CONFLICTING_TRAITS.filter(([a, b]) => traits.includes(a) && traits.includes(b));
}
