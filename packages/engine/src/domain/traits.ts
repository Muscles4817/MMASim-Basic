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
  'takedownRate',
  'finishingUrge',
  'starPowerGrowth',
  'heatGeneration',
  'developmentRate',
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
}

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
  },
  frontrunner: {
    id: 'frontrunner',
    label: 'Frontrunner',
    blurb: 'Electric in front. Folds the moment it turns.',
    category: 'mental',
    polarity: 'doubleEdged',
    visibility: 35,
    add: { momentumSensitivity: 0.45 },
  },
  dog: {
    id: 'dog',
    label: 'Dog',
    blurb: 'Better hurt than fresh. Will not stop coming.',
    category: 'mental',
    polarity: 'doubleEdged',
    visibility: 45,
    mul: { fightInjuryRisk: 1.2, headTraumaRate: 1.25 },
    add: { momentumSensitivity: -0.35, compositionUnderFire: 14 },
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
  },
  gunShy: {
    id: 'gunShy',
    label: 'Gun-Shy',
    blurb: 'Has been badly hurt and has not forgotten it.',
    category: 'mental',
    polarity: 'negative',
    visibility: 50,
    acquirable: true,
    mul: { strikeOutput: 0.75, finishingUrge: 0.6 },
  },
  fragileEgo: {
    id: 'fragileEgo',
    label: 'Fragile Ego',
    blurb: 'Losses cut deep. Corrections cut deeper.',
    category: 'mental',
    polarity: 'negative',
    visibility: 30,
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
  },
  cardioMachine: {
    id: 'cardioMachine',
    label: 'Cardio Machine',
    blurb: 'Round five looks like round one. It is genuinely demoralising.',
    category: 'camp',
    polarity: 'positive',
    visibility: 70,
    mul: { fatigueRate: 0.78, recoveryRate: 1.25 },
  },
  gatekeeperMentality: {
    id: 'gatekeeperMentality',
    label: 'Gatekeeper Mentality',
    blurb: 'Beats everyone below them and loses to everyone above. Never changes.',
    category: 'mental',
    polarity: 'negative',
    visibility: 25,
    mul: { developmentRate: 0.5 },
  },
  volumeMachine: {
    id: 'volumeMachine',
    label: 'Volume Machine',
    blurb: 'Throws more than anyone. Lands a smaller share of it.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 85,
    mul: { strikeOutput: 1.3, strikeAccuracy: 0.88, fatigueRate: 1.1 },
  },
  headhunter: {
    id: 'headhunter',
    label: 'Headhunter',
    blurb: 'Looking for the one shot. Ignores the body, ignores the legs.',
    category: 'fight',
    polarity: 'doubleEdged',
    visibility: 75,
    mul: { finishingUrge: 1.35, strikeOutput: 0.85 },
  },
  finisher: {
    id: 'finisher',
    label: 'Finisher',
    blurb: 'Smells blood and closes. Does not let hurt opponents recover.',
    category: 'fight',
    polarity: 'positive',
    visibility: 80,
    mul: { finishingUrge: 1.4 },
  },
  durableMind: {
    id: 'durableMind',
    label: 'Durable Mind',
    blurb: 'Has been knocked out and came back exactly the same fighter.',
    category: 'mental',
    polarity: 'positive',
    visibility: 40,
    add: { compositionUnderFire: 10 },
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
];

/** Any conflicting pairs present in `traits`. Empty means coherent. */
export function findTraitConflicts(
  traits: readonly TraitId[],
): readonly (readonly [TraitId, TraitId])[] {
  return CONFLICTING_TRAITS.filter(([a, b]) => traits.includes(a) && traits.includes(b));
}
