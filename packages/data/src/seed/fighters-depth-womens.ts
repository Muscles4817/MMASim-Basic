/**
 * Seed roster — women's divisional depth. Snapshot: 1 January 2020.
 *
 * The women's divisions were the thinnest part of the seed, and two of them were genuinely
 * shallow in 2020 — women's featherweight in particular had a handful of active fighters and
 * a champion who held two belts. That is modelled rather than papered over: the division is
 * small here because it was small.
 *
 * Ratings remain absolute (docs/02), so Power and Strength numbers sit lower than the men's
 * files by design. Skill, cardio and IQ are on exactly the same scale for everyone.
 */

import { attrs, type FighterSpec } from './builder.js';

const WSW = 'womens-strawweight';
const WFLW = 'womens-flyweight';
const WBW = 'womens-bantamweight';
const WFW = 'womens-featherweight';

export const WOMENS_DEPTH_SPECS: readonly FighterSpec[] = [
  // --- Women's Strawweight -------------------------------------------------------------------
  {
    id: 'f_suarez',
    first: 'Tatiana', last: 'Suarez', nat: 'USA', sex: 'female', age: 29, div: WSW,
    walk: 128, htIn: 65, reachIn: 66,
    attrs: attrs([54, 68, 76, 70, 84], [58, 46, 56], [88, 76, 84, 74, 70], [70, 74]),
    person: { discipline: 84, professionalism: 82, charisma: 40, ambition: 76 },
    traits: ['injuryProne'],
    record: '8-0-0', star: 18, rep: 52, upside: 6,
    notes:
      'Wrestling 88 in a division with no answer to it, attached to Injury Prone and a neck problem that has already cost her years. Striking Offence 58 is the hole nobody has been able to reach.',
  },
  {
    id: 'f_esparza',
    first: 'Carla', last: 'Esparza', nick: 'Cookie Monster', nat: 'USA', sex: 'female', age: 32, div: WSW,
    walk: 125, htIn: 61, reachIn: 63,
    attrs: attrs([44, 62, 74, 70, 78], [56, 44, 58], [82, 72, 78, 60, 66], [70, 72]),
    person: { discipline: 82, professionalism: 84, charisma: 38 },
    traits: [],
    record: '16-6-0', star: 14, rep: 46,
    notes:
      'A pure wrestler with Power 44 and Kicking 44 — she has to take you down and has no plan if she cannot.',
  },
  {
    id: 'f_waterson',
    first: 'Michelle', last: 'Waterson', nick: 'The Karate Hottie', nat: 'USA', sex: 'female', age: 33, div: WSW,
    walk: 122, htIn: 63, reachIn: 63,
    attrs: attrs([42, 72, 74, 62, 52], [66, 74, 68], [58, 62, 58, 70, 68], [70, 70]),
    person: { discipline: 76, professionalism: 82, charisma: 82, ambition: 62 },
    traits: [],
    record: '17-8-0', star: 44, rep: 44,
    notes:
      'Star Power 44 against Reputation 44 on a 17-8 record: a genuine draw and a mid-tier fighter. Power 42 and Strength 52 are the lowest physical pair in the division.',
  },
  {
    id: 'f_gadelha',
    first: 'Claudia', last: 'Gadelha', nat: 'Brazil', sex: 'female', age: 31, div: WSW,
    walk: 128, htIn: 62, reachIn: 64,
    attrs: attrs([56, 66, 68, 72, 80], [64, 52, 60], [80, 72, 76, 72, 66], [66, 68]),
    person: { discipline: 74, professionalism: 74, charisma: 44, aggression: 78 },
    traits: ['weightCutGambler'],
    record: '18-4-0', star: 20, rep: 50,
    notes:
      'Physically the strongest wrestler at 115 and a severe cut to get there. Cardio 68 is what the cut costs her in the championship rounds.',
  },
  {
    id: 'f_yan_x',
    first: 'Xiaonan', last: 'Yan', nat: 'China', sex: 'female', age: 30, div: WSW,
    walk: 125, htIn: 65, reachIn: 66,
    attrs: attrs([50, 70, 84, 70, 62], [76, 68, 68], [54, 68, 54, 50, 62], [70, 72]),
    person: { discipline: 82, professionalism: 84, charisma: 40 },
    traits: ['volumeMachine'],
    record: '11-1-0', star: 12, rep: 44, upside: 4,
    notes:
      'Enormous output and Power 50 — she wins rounds on volume and has never come close to finishing anyone.',
  },
  {
    id: 'f_rodriguez_m',
    first: 'Marina', last: 'Rodriguez', nat: 'Brazil', sex: 'female', age: 32, div: WSW,
    walk: 125, htIn: 66, reachIn: 66,
    attrs: attrs([52, 68, 78, 68, 58], [76, 72, 66], [46, 62, 48, 48, 58], [70, 70]),
    person: { discipline: 78, professionalism: 80, charisma: 46 },
    traits: [],
    record: '11-0-2', star: 10, rep: 42,
    notes:
      'Long, sharp Muay Thai and Wrestling 46. The two draws are what happens when a striker cannot stop a takedown or finish a fight.',
  },
  {
    id: 'f_ansaroff',
    first: 'Nina', last: 'Ansaroff', nat: 'USA', sex: 'female', age: 34, div: WSW,
    walk: 125, htIn: 65, reachIn: 67,
    attrs: attrs([46, 68, 78, 66, 58], [72, 66, 68], [52, 66, 52, 52, 60], [70, 68]),
    person: { discipline: 80, professionalism: 82, charisma: 44 },
    traits: [],
    record: '10-5-0', star: 14, rep: 42,
    notes:
      'A busy, technical striker with Power 46 who has never threatened a finish in the promotion.',
  },

  // --- Women's Flyweight ---------------------------------------------------------------------
  {
    id: 'f_eye',
    first: 'Jessica', last: 'Eye', nick: 'Evil', nat: 'USA', sex: 'female', age: 33, div: WFLW,
    walk: 132, htIn: 65, reachIn: 66,
    attrs: attrs([50, 68, 72, 58, 62], [72, 60, 64], [56, 66, 56, 48, 60], [68, 62]),
    person: { discipline: 72, professionalism: 74, charisma: 54 },
    traits: ['chinny'],
    record: '15-8-0', star: 22, rep: 44, trauma: 50,
    notes:
      'Durability 58 with the Chinny trait after a brutal knockout, and eight losses on the record. Competent boxing that is no longer enough.',
  },
  {
    id: 'f_murphy',
    first: 'Lauren', last: 'Murphy', nat: 'USA', sex: 'female', age: 36, div: WFLW,
    walk: 135, htIn: 65, reachIn: 66,
    attrs: attrs([48, 60, 76, 70, 70], [66, 54, 60], [70, 68, 68, 58, 64], [70, 76]),
    person: { discipline: 82, professionalism: 84, charisma: 44, resilience: 84 },
    traits: ['dog'],
    record: '12-4-0', star: 10, rep: 40,
    notes:
      'Grinds out decisions with pressure and a good gas tank. Power 48 and Speed 60 mean she never wins a fight quickly.',
  },
  {
    id: 'f_modafferi',
    first: 'Roxanne', last: 'Modafferi', nick: 'The Happy Warrior', nat: 'USA', sex: 'female', age: 37, div: WFLW,
    walk: 132, htIn: 65, reachIn: 65,
    attrs: attrs([42, 54, 74, 72, 62], [58, 50, 54], [64, 62, 68, 74, 70], [72, 86]),
    person: { discipline: 84, professionalism: 90, charisma: 68, resilience: 92, loyalty: 88 },
    traits: ['dog', 'companyMan'],
    record: '23-17-0', star: 18, rep: 38, trauma: 44,
    notes:
      'Seventeen career losses and Composure 86. Power 42 and Speed 54 are why she loses; Resilience 92 is why she is still here.',
  },
  {
    id: 'f_calderwood',
    first: 'Joanne', last: 'Calderwood', nat: 'Scotland', sex: 'female', age: 33, div: WFLW,
    walk: 132, htIn: 66, reachIn: 67,
    attrs: attrs([48, 66, 74, 62, 58], [74, 76, 60], [50, 58, 52, 54, 58], [62, 64]),
    person: { discipline: 74, professionalism: 76, charisma: 50 },
    traits: [],
    record: '14-4-0', star: 14, rep: 42,
    notes:
      'Elegant, high-volume Muay Thai with Takedown Defence 58 and Wrestling 50 — every loss came from being put on her back.',
  },
  {
    id: 'f_lee_a',
    first: 'Andrea', last: 'Lee', nick: 'KGB', nat: 'USA', sex: 'female', age: 31, div: WFLW,
    walk: 132, htIn: 66, reachIn: 68,
    attrs: attrs([50, 68, 74, 64, 60], [70, 70, 64], [58, 62, 58, 62, 62], [66, 66]),
    person: { discipline: 74, professionalism: 74, charisma: 52 },
    traits: [],
    record: '11-3-0', star: 12, rep: 40,
    notes:
      'Long and well-rounded with no elite attribute — the definition of a divisional middle.',
  },
  {
    id: 'f_shevchenko_a',
    first: 'Antonina', last: 'Shevchenko', nat: 'Kyrgyzstan', sex: 'female', age: 35, div: WFLW,
    walk: 132, htIn: 68, reachIn: 68,
    attrs: attrs([48, 62, 70, 62, 58], [70, 72, 62], [46, 58, 50, 52, 54], [64, 66]),
    person: { discipline: 80, professionalism: 82, charisma: 40 },
    traits: [],
    record: '8-1-0', star: 12, rep: 36,
    notes:
      'A decorated Muay Thai career and Wrestling 46. Rated as the fighter she is rather than as her sister’s surname.',
  },

  // --- Women's Bantamweight ------------------------------------------------------------------
  {
    id: 'f_de_randamie',
    first: 'Germaine', last: 'de Randamie', nick: 'The Iron Lady', nat: 'Netherlands', sex: 'female', age: 35, div: WBW,
    walk: 145, htIn: 69, reachIn: 71,
    attrs: attrs([66, 70, 66, 72, 68], [82, 76, 76], [48, 74, 50, 44, 56], [74, 72]),
    person: { discipline: 78, professionalism: 72, charisma: 44, ambition: 60 },
    traits: ['headhunter'],
    record: '9-4-0', star: 24, rep: 52, trauma: 30,
    notes:
      'The best pure striker in the division and Wrestling 48, Submissions 44. Cardio 66 at 35 is why the championship rounds have never gone her way.',
  },
  {
    id: 'f_vieira',
    first: 'Ketlen', last: 'Vieira', nat: 'Brazil', sex: 'female', age: 28, div: WBW,
    walk: 145, htIn: 67, reachIn: 68,
    attrs: attrs([56, 62, 74, 72, 78], [62, 52, 60], [76, 70, 74, 74, 66], [66, 68]),
    person: { discipline: 78, professionalism: 78, charisma: 36 },
    traits: ['injuryProne'],
    record: '10-1-0', star: 10, rep: 44, upside: 5,
    notes:
      'Strong, patient grappling and Striking Offence 62. A serious knee injury is already on the record and the trait reflects it.',
  },
  {
    id: 'f_aldana',
    first: 'Irene', last: 'Aldana', nat: 'Mexico', sex: 'female', age: 31, div: WBW,
    walk: 145, htIn: 69, reachIn: 69,
    attrs: attrs([64, 68, 76, 64, 60], [80, 62, 62], [46, 58, 50, 56, 58], [66, 70]),
    person: { discipline: 74, professionalism: 78, charisma: 54 },
    traits: ['volumeMachine'],
    record: '12-5-0', star: 18, rep: 46,
    notes:
      'Long, busy boxing with Wrestling 46 and Takedown Defence 58 — the book on her is one page and everyone has read it.',
  },
  {
    id: 'f_pena',
    first: 'Julianna', last: 'Pena', nick: 'The Venezuelan Vixen', nat: 'USA', sex: 'female', age: 30, div: WBW,
    walk: 148, htIn: 66, reachIn: 68,
    attrs: attrs([54, 62, 78, 72, 74], [62, 52, 52], [74, 66, 72, 74, 70], [62, 82]),
    person: { discipline: 62, professionalism: 66, charisma: 74, ego: 84, aggression: 84 },
    traits: ['dog', 'trashTalker'],
    record: '10-3-0', star: 26, rep: 42, trauma: 28,
    notes:
      'Composure 82 and a mouth that sells fights, attached to Striking Defence 52 and a long injury layoff. Star Power 26 well above Reputation 42.',
  },
  {
    id: 'f_ladd',
    first: 'Aspen', last: 'Ladd', nat: 'USA', sex: 'female', age: 24, div: WBW,
    walk: 150, htIn: 65, reachIn: 66,
    attrs: attrs([62, 66, 74, 66, 78], [66, 56, 54], [80, 68, 78, 66, 66], [62, 66]),
    person: { discipline: 60, professionalism: 50, charisma: 44, ambition: 70 },
    traits: ['weightCutGambler', 'injuryProne'],
    record: '9-1-0', star: 12, rep: 42, upside: 10,
    notes:
      'Wrestling 80 at 24, and Professionalism 50 for a documented history of catastrophic weight cuts that have already caused a fight to be cancelled at the scales.',
  },
  {
    id: 'f_kunitskaya',
    first: 'Yana', last: 'Kunitskaya', nat: 'Russia', sex: 'female', age: 30, div: WBW,
    walk: 145, htIn: 68, reachIn: 68,
    attrs: attrs([48, 56, 72, 66, 68], [68, 58, 54], [66, 62, 66, 70, 62], [64, 66]),
    person: { discipline: 74, professionalism: 74, charisma: 42 },
    traits: [],
    record: '13-5-0', star: 10, rep: 38,
    notes:
      'Adequate everywhere, notable nowhere. Power 48 and Speed 56 in a division where the champion hits like a welterweight, and Striking Defence 54 to go with it.',
  },

  // --- Women's Featherweight -------------------------------------------------------------------
  // Deliberately shallow. In January 2020 this division had barely enough active fighters to
  // make a card, and the seed reflects that rather than inventing a roster that did not exist.
  {
    id: 'f_anderson_m',
    first: 'Megan', last: 'Anderson', nat: 'Australia', sex: 'female', age: 29, div: WFW,
    walk: 155, htIn: 71, reachIn: 72,
    attrs: attrs([64, 62, 60, 58, 64], [66, 72, 54], [40, 52, 46, 52, 48], [56, 54]),
    person: { discipline: 62, professionalism: 66, charisma: 52, resilience: 46 },
    traits: ['glassCannon'],
    record: '9-4-0', star: 16, rep: 36, trauma: 30,
    notes:
      'Very long and genuinely dangerous with the knees, and Wrestling 40, Takedown Defence 52, Composure 54. Every loss looks the same.',
  },
  {
    id: 'f_dumont',
    first: 'Norma', last: 'Dumont', nat: 'Brazil', sex: 'female', age: 29, div: WFW,
    walk: 155, htIn: 68, reachIn: 69,
    attrs: attrs([48, 52, 70, 70, 66], [66, 56, 54], [58, 62, 60, 58, 56], [62, 66]),
    person: { discipline: 74, professionalism: 76, charisma: 34 },
    traits: [],
    record: '5-1-0', star: 6, rep: 28, upside: 8,
    notes:
      'A solid, unspectacular boxer with Speed 52 and Power 48 in a division with four active fighters. Star Power 6 and Reputation 28 are what obscurity actually looks like.',
  },
  {
    id: 'f_fairn',
    first: 'Zarah', last: 'Fairn', nat: 'France', sex: 'female', age: 33, div: WFW,
    walk: 155, htIn: 71, reachIn: 73,
    attrs: attrs([52, 52, 58, 58, 60], [56, 62, 46], [40, 48, 46, 50, 46], [50, 56]),
    person: { discipline: 66, professionalism: 70, charisma: 36 },
    traits: [],
    record: '6-4-0', star: 4, rep: 20,
    notes:
      'Rated bluntly below the level: nothing above 62 and a Striking Defence of 46. She is on this roster because the division needed bodies, and the ratings say so.',
  },
];
