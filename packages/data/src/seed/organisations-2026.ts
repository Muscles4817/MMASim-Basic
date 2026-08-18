/**
 * The sport's organisations, 2026.
 *
 * Real promotions rather than the 2020 world's fictionalised ones, and eight of them rather
 * than five — which matters mechanically as well as for recognition. Five promotions meant a
 * released fighter had four places to go and a free-agency market with almost no shape; the
 * real sport has a clear leader, two credible majors with different business models, and a
 * layer of regional promotions that genuinely feed the top.
 *
 * The numbers are set from the three things that actually change decisions in this engine —
 * budget, prestige, and how the promotion books — rather than from any attempt at real
 * accounts. `budget` is in thousands and is a per-card spending capacity rather than a
 * turnover figure, so the ratios between promotions are what carry meaning.
 *
 * **On accuracy.** This reflects the sport as of early 2026 to the best of my knowledge, and
 * the game ships an editor precisely because that will drift. Anything here is meant to be
 * corrected rather than treated as settled.
 */

import { asDivisionId, asPromotionId, type DivisionId, type Promotion } from '@mmasim/engine';

/** Every division. The leader runs all of them; the rest run a subset. */
const ALL: readonly DivisionId[] = [
  'mens-heavyweight',
  'mens-light-heavyweight',
  'mens-middleweight',
  'mens-welterweight',
  'mens-lightweight',
  'mens-featherweight',
  'mens-bantamweight',
  'mens-flyweight',
  'womens-strawweight',
  'womens-flyweight',
  'womens-bantamweight',
  'womens-featherweight',
].map(asDivisionId);

/** Men's only, which is how most regional promotions actually operate. */
const MENS: readonly DivisionId[] = ALL.filter((d) => !(d as string).startsWith('womens'));

/** No featherweight women — the division barely exists outside the leader. */
const NO_WFW: readonly DivisionId[] = ALL.filter((d) => d !== asDivisionId('womens-featherweight'));

export const PROMOTIONS_2026: readonly Promotion[] = [
  {
    id: asPromotionId('p_ufc'),
    name: 'Ultimate Fighting Championship',
    shortName: 'UFC',
    /*
     * The floor rose sharply with the Paramount deal — the promotion moved off pay-per-view
     * for its US audience from 2026, which is the largest structural change to its economics
     * in twenty years and the reason its budget here dwarfs everyone else's.
     */
    minimumPurse: 26,
    // The outfitting deal replaced individual sponsors in 2015 and never came back.
    sponsorshipPolicy: 'uniform',
    revenueShareCapable: true,
    // Two, not three. `MAX_BOUTS_PER_YEAR` in the world loop is 3, so a guarantee of 3 is a
    // promise to book every fighter the maximum the sport allows, every year — which is why 41%
    // of year-old deals sat in breach. Two is this world's measured median and the sport's.
    // See docs/21-activity-offers-and-patience.md § 3.4.
    activityGuarantee: 2,
    tier: 'global',
    baseCountry: 'USA',
    prestige: 97,
    budget: 62_000,
    buzz: 88,
    divisions: ALL,
    champions: {},
    /*
     * Books the fight that sells. Rankings matter to a point and then stop. Past the top two or three the
     * queue is whoever sells, a finisher on a run is fast-tracked, and the people being built get
     * the stylistic matchups that keep them looking good on the way up.
     */
    matchmakingStyle: 'showman',
    matchmakingAggression: 62,
    narrativeControl: 72,
    notes:
      'The only genuinely global promotion. Being cut from here is the fall the rest of the sport is measured against.',
  },
  {
    id: asPromotionId('p_pfl'),
    name: 'Professional Fighters League',
    shortName: 'PFL',
    minimumPurse: 10,
    // Fighters keep their own sponsors, which is a real recruiting argument against the UFC.
    sponsorshipPolicy: 'open',
    revenueShareCapable: true,
    activityGuarantee: 2,
    tier: 'major',
    baseCountry: 'USA',
    prestige: 68,
    budget: 15_000,
    buzz: 52,
    divisions: NO_WFW,
    champions: {},
    /*
     * The season format is the whole product: a regular season and a bracket.
     * Who is next is a matter of record rather than an opinion, and nobody gets a favour.
     */
    matchmakingStyle: 'tournament',
    matchmakingAggression: 78,
    narrativeControl: 48,
    notes:
      'Season and playoff format, and it absorbed Bellator. Fighters keep their sponsors, which is the argument it makes to anyone the leader underpays.',
  },
  {
    id: asPromotionId('p_one'),
    name: 'ONE Championship',
    shortName: 'ONE',
    minimumPurse: 9,
    sponsorshipPolicy: 'open',
    revenueShareCapable: true,
    activityGuarantee: 2,
    tier: 'major',
    baseCountry: 'Singapore',
    prestige: 64,
    budget: 12_000,
    buzz: 49,
    divisions: NO_WFW,
    champions: {},
    /*
     * Builds its own stars deliberately and matches them to keep building them,
     * which is a different thing from simply booking what sells.
     */
    matchmakingStyle: 'narrative',
    matchmakingAggression: 58,
    narrativeControl: 66,
    notes:
      'Asia’s major, and the only one that also runs striking. Hydration-tested weight classes mean its fighters walk around far closer to the limit.',
  },
  {
    id: asPromotionId('p_rizin'),
    name: 'RIZIN Fighting Federation',
    shortName: 'RIZIN',
    minimumPurse: 6,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'regional',
    baseCountry: 'Japan',
    prestige: 52,
    budget: 5_400,
    buzz: 44,
    divisions: MENS,
    champions: {},
    /*
     * Spectacle first: it books the fight the audience wants over the fight that is fair.
     * New Year's Eve is the biggest night of its year and the card is built for
     * the building. The rankings are a guide.
     */
    matchmakingStyle: 'spectacle',
    matchmakingAggression: 84,
    narrativeControl: 70,
    notes:
      'Japan’s biggest, strongest at the lighter weights, and unapologetically a spectacle promotion. New Year’s Eve is the biggest night of its year.',
  },
  {
    id: asPromotionId('p_ksw'),
    name: 'Konfrontacja Sztuk Walki',
    shortName: 'KSW',
    minimumPurse: 5,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'regional',
    baseCountry: 'Poland',
    prestige: 48,
    budget: 3_800,
    buzz: 38,
    divisions: MENS,
    champions: {},
    /*
     * Sells out arenas in Poland that most majors could not, and it does it with
     * Polish fighters in front of a Polish crowd.
     */
    matchmakingStyle: 'domestic',
    matchmakingAggression: 66,
    narrativeControl: 74,
    notes:
      'Sells out arenas in Poland that most majors could not. Builds domestic stars deliberately and keeps them.',
  },
  {
    id: asPromotionId('p_oktagon'),
    name: 'Oktagon MMA',
    shortName: 'OKT',
    minimumPurse: 4,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'regional',
    baseCountry: 'Czechia',
    prestige: 44,
    budget: 2_900,
    buzz: 34,
    divisions: MENS,
    champions: {},
    /*
     * The tournament format has become the thing it is known for.
     */
    matchmakingStyle: 'tournament',
    matchmakingAggression: 72,
    narrativeControl: 58,
    notes:
      'Central Europe’s fastest-growing promotion, and its tournament format has become the thing it is known for.',
  },
  {
    id: asPromotionId('p_cw'),
    name: 'Cage Warriors',
    shortName: 'CW',
    minimumPurse: 2,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'regional',
    baseCountry: 'UK',
    prestige: 38,
    budget: 1_400,
    buzz: 27,
    divisions: MENS,
    champions: {},
    /*
     * A feeder's job is to expose people. It books hard because a fighter who beats everyone
     * available gets a call from the leader, and that call is the product.
     */
    /*
     * A feeder's product is exposure. It books the hardest fight available,
     * because beating everybody here is what gets you the call.
     */
    matchmakingStyle: 'proving',
    matchmakingAggression: 80,
    narrativeControl: 30,
    notes:
      'The European feeder. Winning a belt here is how a British or Irish fighter gets the call, and everybody involved knows it.',
  },
  {
    id: asPromotionId('p_lfa'),
    name: 'Legacy Fighting Alliance',
    shortName: 'LFA',
    minimumPurse: 2,
    sponsorshipPolicy: 'open',
    revenueShareCapable: false,
    activityGuarantee: 2,
    tier: 'regional',
    baseCountry: 'USA',
    prestige: 36,
    budget: 1_200,
    buzz: 25,
    divisions: MENS,
    champions: {},
    /*
     * The most-scouted regional promotion in the sport, and it earns that by
     * booking hard.
     */
    matchmakingStyle: 'proving',
    matchmakingAggression: 82,
    narrativeControl: 28,
    notes:
      'The American feeder, and the most-scouted regional promotion in the sport. A good night here is watched by people who can change your life.',
  },
];
