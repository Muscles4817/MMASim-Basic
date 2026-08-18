/**
 * Seed promotions, gyms, coaches and officials. Snapshot: 1 January 2020.
 *
 * Competing promotions are a first-class part of the world: the major promotion does not
 * own every good fighter, free agency is real, and a rival can outbid you. Each promotion
 * differs in the three things that actually change decisions — money, prestige, and how
 * willing they are to book a fight that damages one of their stars.
 */

import {
  asCoachId,
  asDivisionId,
  asFighterId,
  asGymId,
  asOfficialId,
  asPromotionId,
  isoToGameDay,
  uniformPersonality,
  JUDGE_ARCHETYPES,
  type Coach,
  type Commentator,
  type Gym,
  type Judge,
  type Promotion,
  type Referee,
} from '@mmasim/engine';

const MENS = [
  'mens-flyweight',
  'mens-bantamweight',
  'mens-featherweight',
  'mens-lightweight',
  'mens-welterweight',
  'mens-middleweight',
  'mens-light-heavyweight',
  'mens-heavyweight',
].map(asDivisionId);

const WOMENS = [
  'womens-strawweight',
  'womens-flyweight',
  'womens-bantamweight',
  'womens-featherweight',
].map(asDivisionId);

export const SEED_PROMOTIONS: readonly Promotion[] = [
  {
    id: asPromotionId('p_apex'),
    name: 'Apex Fighting Championship',
    shortName: 'AFC',
    // The market leader pays the best floor in the sport and takes your sponsors in exchange.
    minimumPurse: 24,
    sponsorshipPolicy: 'uniform',
    revenueShareCapable: true,
    // Two, not three. `MAX_BOUTS_PER_YEAR` in the world loop is 3, so a guarantee of 3 is a
    // promise to book every fighter the maximum the sport allows, every year — which is why 41%
    // of year-old deals sat in breach. Two is this world's measured median and the sport's.
    // See docs/21-activity-offers-and-patience.md § 3.4.
    activityGuarantee: 2,
    tier: 'global',
    baseCountry: 'USA',
    prestige: 95,
    budget: 42_000,
    buzz: 78,
    divisions: [...MENS, ...WOMENS],
    /**
     * The belts, as they actually sat in January 2020.
     *
     * These were all empty, which meant the world began with every title vacant — so no
     * title fight could ever be generated, the ladder had no top, and "climb to the top of
     * the mountain" was a climb toward nothing. A champion is also what `rankDivision`
     * ranks *around*, so without them the number-one contender was whoever happened to
     * sort first.
     */
    champions: {
      [asDivisionId('mens-heavyweight')]: asFighterId('f_miocic'),
      [asDivisionId('mens-light-heavyweight')]: asFighterId('f_jones'),
      [asDivisionId('mens-middleweight')]: asFighterId('f_adesanya'),
      [asDivisionId('mens-welterweight')]: asFighterId('f_usman'),
      [asDivisionId('mens-lightweight')]: asFighterId('f_khabib'),
      [asDivisionId('mens-featherweight')]: asFighterId('f_volkanovski'),
      [asDivisionId('mens-bantamweight')]: asFighterId('f_cejudo'),
      [asDivisionId('mens-flyweight')]: asFighterId('f_figueiredo'),
      [asDivisionId('womens-strawweight')]: asFighterId('f_zhang'),
      [asDivisionId('womens-flyweight')]: asFighterId('f_shevchenko'),
      [asDivisionId('womens-bantamweight')]: asFighterId('f_nunes'),
      [asDivisionId('womens-featherweight')]: asFighterId('f_nunes'),
    },
    // Books the fights that sell, including ones that damage their own stars.
    matchmakingAggression: 72,
    narrativeControl: 88,
    notes:
      'The market leader by a distance. Deep roster, punishing contracts, and a promotional machine that decides who the public thinks is good.',
  },
  {
    id: asPromotionId('p_vanguard'),
    name: 'Vanguard MMA',
    shortName: 'VMA',
    // Followed the leader on outfitting without the leader's money — the worst of both.
    minimumPurse: 8,
    sponsorshipPolicy: 'uniform',
    revenueShareCapable: true,
    activityGuarantee: 2,
    tier: 'major',
    baseCountry: 'USA',
    prestige: 66,
    budget: 14_000,
    buzz: 48,
    divisions: [...MENS.slice(1), ...WOMENS.slice(0, 3)],
    champions: {},
    // Protects its handful of names, because it cannot afford to lose them.
    matchmakingAggression: 40,
    narrativeControl: 62,
    notes:
      'The credible number two. Pays well above its prestige to poach names, and protects them carefully once signed.',
  },
  {
    id: asPromotionId('p_rising_sun'),
    name: 'Rising Sun Combat',
    shortName: 'RSC',
    // Keeps your sponsors, which in its home market is worth more than the difference in purse.
    minimumPurse: 8,
    sponsorshipPolicy: 'open',
    revenueShareCapable: true,
    activityGuarantee: 2,
    tier: 'major',
    baseCountry: 'Japan',
    prestige: 58,
    budget: 9_000,
    buzz: 44,
    divisions: [...MENS.slice(0, 6), ...WOMENS.slice(0, 2)],
    champions: {},
    matchmakingAggression: 78,
    narrativeControl: 54,
    notes:
      'Spectacle-first, with grand-prix tournaments and a crowd that rewards violence. Hard on fighters, excellent for careers that need attention.',
  },
  {
    id: asPromotionId('p_cage_circuit'),
    name: 'European Cage Circuit',
    shortName: 'ECC',
    // No broadcast platform of its own, so it cannot offer points however much it wants you.
    minimumPurse: 3,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'regional',
    baseCountry: 'England',
    prestige: 38,
    budget: 2_400,
    buzz: 26,
    divisions: MENS.slice(0, 7),
    champions: {},
    matchmakingAggression: 58,
    narrativeControl: 34,
    notes: 'The main European feeder. Winning the belt here gets you a call from Apex.',
  },
  {
    id: asPromotionId('p_frontier'),
    name: 'Frontier Fights',
    shortName: 'FF',
    // Pays almost nothing and books constantly. For a fighter with no money that is a real trade.
    minimumPurse: 1,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'developmental',
    baseCountry: 'USA',
    prestige: 22,
    budget: 900,
    buzz: 14,
    divisions: MENS,
    champions: {},
    matchmakingAggression: 66,
    narrativeControl: 20,
    notes: 'Regional shows and short-notice debuts. Where careers start and where they quietly end.',
  },
];

export const SEED_GYMS: readonly Gym[] = [
  {
    id: asGymId('g_summit'),
    name: 'Summit Combat Academy',
    country: 'USA',
    city: 'Denver',
    quality: 92,
    prestige: 90,
    headCoachId: asCoachId('c_reyes_m'),
    specialisms: ['striking', 'wrestling', 'strategy'],
    monthlyCost: 140,
    foundedDay: isoToGameDay('2005-03-01'),
  },
  {
    id: asGymId('g_ironworks'),
    name: 'Ironworks MMA',
    country: 'USA',
    city: 'Sacramento',
    quality: 84,
    prestige: 78,
    headCoachId: asCoachId('c_delgado'),
    specialisms: ['wrestling', 'conditioning'],
    monthlyCost: 95,
    foundedDay: isoToGameDay('2002-09-01'),
  },
  {
    id: asGymId('g_red_star'),
    name: 'Red Star Combat',
    country: 'Russia',
    city: 'Makhachkala',
    quality: 88,
    prestige: 74,
    headCoachId: asCoachId('c_alikhanov'),
    specialisms: ['wrestling', 'submissions', 'conditioning'],
    monthlyCost: 55,
    foundedDay: isoToGameDay('1998-01-01'),
  },
  {
    id: asGymId('g_blackwater'),
    name: 'Blackwater Muay Thai',
    country: 'Thailand',
    city: 'Phuket',
    quality: 80,
    prestige: 72,
    headCoachId: asCoachId('c_saenchai_k'),
    specialisms: ['striking', 'conditioning'],
    monthlyCost: 60,
  },
  {
    id: asGymId('g_atlantic'),
    name: 'Atlantic Jiu-Jitsu',
    country: 'Brazil',
    city: 'Rio de Janeiro',
    quality: 82,
    prestige: 76,
    headCoachId: asCoachId('c_moreira'),
    specialisms: ['submissions', 'strategy'],
    monthlyCost: 45,
  },
  {
    id: asGymId('g_northgate'),
    name: 'Northgate Fight Club',
    country: 'England',
    city: 'Liverpool',
    quality: 62,
    prestige: 48,
    specialisms: ['striking'],
    monthlyCost: 28,
  },
  {
    id: asGymId('g_basement'),
    name: 'The Basement',
    country: 'USA',
    city: 'Albuquerque',
    quality: 44,
    prestige: 26,
    specialisms: ['wrestling'],
    monthlyCost: 9,
  },
];

const person = (o: Partial<ReturnType<typeof uniformPersonality>>) => ({
  ...uniformPersonality(50),
  ...o,
});

export const SEED_COACHES: readonly Coach[] = [
  {
    id: asCoachId('c_reyes_m'),
    firstName: 'Marcus',
    lastName: 'Reyes',
    nationality: 'USA',
    birthDay: isoToGameDay('1972-04-18'),
    gymId: asGymId('g_summit'),
    scouting: 92,
    gamePlanning: 94,
    development: 82,
    cornering: 88,
    specialisms: ['striking', 'strategy'],
    personality: person({ ego: 62, discipline: 88, professionalism: 86, charisma: 72, loyalty: 60 }),
    reputation: 92,
    salary: 38,
    notes:
      'The best game-planner in the sport and knows it. Ego 62 means he clashes with fighters who want to freelance, and his camps are famously inflexible once the plan is set.',
  },
  {
    id: asCoachId('c_delgado'),
    firstName: 'Ray',
    lastName: 'Delgado',
    nationality: 'USA',
    birthDay: isoToGameDay('1968-11-02'),
    gymId: asGymId('g_ironworks'),
    scouting: 70,
    gamePlanning: 68,
    development: 90,
    cornering: 72,
    specialisms: ['wrestling', 'conditioning'],
    personality: person({ ego: 34, discipline: 92, professionalism: 90, charisma: 44, loyalty: 88 }),
    reputation: 78,
    salary: 24,
    notes:
      'Develops fighters better than anyone and reads opponents worse than most. Scouting 70 means his fighters walk in prepared for the wrong fight more often than his results suggest.',
  },
  {
    id: asCoachId('c_alikhanov'),
    firstName: 'Ruslan',
    lastName: 'Alikhanov',
    nationality: 'Russia',
    birthDay: isoToGameDay('1965-06-30'),
    gymId: asGymId('g_red_star'),
    scouting: 76,
    gamePlanning: 80,
    development: 88,
    cornering: 74,
    specialisms: ['wrestling', 'submissions', 'conditioning'],
    personality: person({ ego: 70, discipline: 96, professionalism: 84, charisma: 38, loyalty: 96 }),
    reputation: 82,
    salary: 20,
    notes:
      'Brutal, effective camps and total loyalty in both directions. Discipline 96 makes his fighters relentless; Ego 70 makes him nearly impossible to bring in as a second voice.',
  },
  {
    id: asCoachId('c_saenchai_k'),
    firstName: 'Kiat',
    lastName: 'Saenchai',
    nationality: 'Thailand',
    birthDay: isoToGameDay('1975-02-11'),
    gymId: asGymId('g_blackwater'),
    scouting: 62,
    gamePlanning: 66,
    development: 86,
    cornering: 68,
    specialisms: ['striking', 'conditioning'],
    personality: person({ ego: 30, discipline: 90, professionalism: 88, charisma: 50, loyalty: 74 }),
    reputation: 70,
    salary: 16,
    notes:
      'Transforms strikers and does very little else. Scouting 62 and Game Planning 66 mean he should be a striking coach in a bigger room, not a head coach.',
  },
  {
    id: asCoachId('c_moreira'),
    firstName: 'Bruno',
    lastName: 'Moreira',
    nationality: 'Brazil',
    birthDay: isoToGameDay('1979-08-25'),
    gymId: asGymId('g_atlantic'),
    scouting: 84,
    gamePlanning: 78,
    development: 74,
    cornering: 80,
    specialisms: ['submissions', 'strategy'],
    personality: person({ ego: 48, discipline: 72, professionalism: 68, charisma: 66, loyalty: 52 }),
    reputation: 74,
    salary: 18,
    notes: 'Excellent eye for an opponent. Loyalty 52 — he has moved gyms three times for money.',
  },
  {
    id: asCoachId('c_bright'),
    firstName: 'Danny',
    lastName: 'Bright',
    nationality: 'England',
    birthDay: isoToGameDay('1988-01-14'),
    gymId: asGymId('g_northgate'),
    scouting: 58,
    gamePlanning: 54,
    development: 62,
    cornering: 46,
    specialisms: ['striking'],
    personality: person({ ego: 66, discipline: 54, professionalism: 50, charisma: 74, ambition: 88 }),
    reputation: 34,
    salary: 5,
    notes:
      'Ambitious, charismatic and not yet good at any of it. Cornering 46 costs his fighters rounds. The gamble is Ambition 88 and the room to grow.',
  },
];

export const SEED_REFEREES: readonly Referee[] = [
  {
    id: asOfficialId('r_marek'),
    name: 'Alan Marek',
    stoppageTrigger: 22,
    standUpSpeed: 30,
    foulTolerance: 62,
    reputation:
      'Lets fights go a long way. Fighters have been saved by their own corner in his bouts.',
  },
  {
    id: asOfficialId('r_okafor'),
    name: 'Grace Okafor',
    stoppageTrigger: 82,
    standUpSpeed: 58,
    foulTolerance: 30,
    reputation:
      'Quick to step in and quick to deduct a point. Beloved by fighters, hated by highlight reels.',
  },
  {
    id: asOfficialId('r_tanaka'),
    name: 'Kenji Tanaka',
    stoppageTrigger: 52,
    standUpSpeed: 88,
    foulTolerance: 48,
    reputation:
      'Stands fighters up faster than anyone in the sport. A control wrestler drawing him has a problem.',
  },
  {
    id: asOfficialId('r_valdez'),
    name: 'Hector Valdez',
    stoppageTrigger: 50,
    standUpSpeed: 44,
    foulTolerance: 54,
    reputation: 'Unremarkable in every direction, which is the highest compliment available.',
  },
];

export const SEED_JUDGES: readonly Judge[] = [
  {
    id: asOfficialId('j_dunne'),
    name: 'Patricia Dunne',
    bias: JUDGE_ARCHETYPES.damageFirst!,
    consistency: 86,
  },
  {
    id: asOfficialId('j_holt'),
    name: 'Warren Holt',
    bias: JUDGE_ARCHETYPES.controlFirst!,
    consistency: 74,
  },
  {
    id: asOfficialId('j_arroyo'),
    name: 'Luis Arroyo',
    bias: JUDGE_ARCHETYPES.volumeFirst!,
    consistency: 80,
  },
  {
    id: asOfficialId('j_bell'),
    name: 'Sandra Bell',
    bias: JUDGE_ARCHETYPES.balanced!,
    consistency: 90,
  },
  {
    id: asOfficialId('j_frawley'),
    name: 'Doug Frawley',
    bias: JUDGE_ARCHETYPES.aggressionFirst!,
    // The judge everyone complains about. Consistency 42 produces cards nobody can explain,
    // which is a real feature of the sport and needs to exist in the pool.
    consistency: 42,
  },
];

export const SEED_COMMENTATORS: readonly Commentator[] = [
  {
    id: asOfficialId('cm_shaw'),
    name: 'Eddie Shaw',
    styleBias: 0.7,
    hype: 88,
    companyLine: 76,
    catchphrases: ['Oh he is HURT!', 'This place is coming apart!', 'Don’t blink!'],
  },
  {
    id: asOfficialId('cm_lang'),
    name: 'Marisa Lang',
    styleBias: -0.6,
    hype: 44,
    companyLine: 30,
    catchphrases: [
      'Watch the hip — that is the whole position.',
      'She is three seconds ahead of him here.',
    ],
  },
  {
    id: asOfficialId('cm_pryce'),
    name: 'Gordon Pryce',
    styleBias: 0.1,
    hype: 60,
    companyLine: 92,
    catchphrases: ['A future champion, no question.', 'Exactly the fight we all wanted.'],
  },
];
