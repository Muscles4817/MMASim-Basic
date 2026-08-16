/**
 * Seed roster — men's divisional depth. Snapshot: 1 January 2020.
 *
 * The named contenders live in `fighters-heavy.ts` and `fighters-light.ts`; this file is the
 * rest of the division — the ranked fighters, the gatekeepers and the prospects who make a
 * division a division rather than a top five.
 *
 * Same rating rules, and the same refusal to flatter: notes are shorter here only because
 * these fighters have fewer contested ratings, not because the standard is lower.
 */

import { attrs, type FighterSpec } from './builder.js';

const HW = 'mens-heavyweight';
const LHW = 'mens-light-heavyweight';
const MW = 'mens-middleweight';
const WW = 'mens-welterweight';
const LW = 'mens-lightweight';
const FW = 'mens-featherweight';
const BW = 'mens-bantamweight';
const FLW = 'mens-flyweight';

export const MENS_DEPTH_SPECS: readonly FighterSpec[] = [
  // --- Heavyweight ------------------------------------------------------------------------
  {
    id: 'f_harris',
    first: 'Walt', last: 'Harris', nick: 'The Big Ticket', nat: 'USA', age: 36, div: HW,
    walk: 250, htIn: 74, reachIn: 77,
    attrs: attrs([88, 72, 44, 62, 76], [66, 58, 50], [42, 60, 44, 30, 40], [52, 58]),
    person: { discipline: 62, professionalism: 70, charisma: 54, ambition: 62 },
    traits: ['fastStarter', 'headhunter'],
    record: '13-7-0', star: 26, rep: 48, trauma: 34,
    notes:
      'Explosive for ninety seconds and then finished: Cardio 44 with Power 88 is the entire fighter. Seven losses, most of them after the first round.',
  },
  {
    id: 'f_struve',
    first: 'Stefan', last: 'Struve', nick: 'Skyscraper', nat: 'Netherlands', age: 31, div: HW,
    walk: 260, htIn: 83, reachIn: 84,
    attrs: attrs([64, 50, 58, 40, 60], [62, 64, 48], [46, 48, 60, 76, 50], [58, 54]),
    person: { discipline: 58, professionalism: 66, charisma: 48, resilience: 44 },
    traits: ['chinny', 'injuryProne'],
    record: '32-11-0', star: 22, rep: 42, trauma: 62,
    notes:
      'The tallest fighter in the sport and Durability 40, which is the lowest chin rating in this file. Long limbs and a genuine guard game cannot compensate for being dropped by everyone.',
  },
  {
    id: 'f_ivanov',
    first: 'Blagoy', last: 'Ivanov', nick: 'Baga', nat: 'Bulgaria', age: 33, div: HW,
    walk: 265, htIn: 71, reachIn: 74,
    attrs: attrs([72, 54, 66, 82, 84], [66, 44, 58], [74, 76, 66, 60, 54], [64, 76]),
    person: { discipline: 74, professionalism: 78, charisma: 32 },
    traits: ['ironChin'],
    record: '18-3-0', star: 14, rep: 46,
    notes:
      'A world-champion sambist with a genuinely excellent chin and almost no offensive threat. Kicking 44 and Star Power 14 mark him as a permanent gatekeeper.',
  },
  {
    id: 'f_pavlovich',
    first: 'Sergei', last: 'Pavlovich', nat: 'Russia', age: 27, div: HW,
    walk: 264, htIn: 75, reachIn: 84,
    attrs: attrs([90, 64, 50, 68, 80], [70, 50, 52], [48, 62, 50, 34, 40], [54, 58]),
    person: { discipline: 76, professionalism: 80, charisma: 24, ambition: 70 },
    traits: ['headhunter'],
    record: '13-1-0', star: 12, rep: 44, upside: 6,
    notes:
      'Enormous power and very little else yet. Cardio 50 and Submissions 34 are the holes, and Star Power 12 reflects a fighter nobody outside the division has heard of.',
  },
  {
    id: 'f_tybura',
    first: 'Marcin', last: 'Tybura', nat: 'Poland', age: 34, div: HW,
    walk: 250, htIn: 75, reachIn: 78,
    attrs: attrs([62, 48, 70, 66, 74], [62, 58, 60], [70, 70, 68, 62, 58], [66, 68]),
    person: { discipline: 78, professionalism: 82, charisma: 28 },
    traits: [],
    record: '18-6-0', star: 10, rep: 44,
    notes:
      'Competent everywhere, dangerous nowhere — nothing above 74, with Speed 48 and Power 62 the reasons he will never trouble the top five. Exactly the kind of fighter a division needs and nobody buys a ticket for.',
  },
  {
    id: 'f_tuivasa',
    first: 'Tai', last: 'Tuivasa', nick: 'Bam Bam', nat: 'Australia', age: 26, div: HW,
    walk: 264, htIn: 74, reachIn: 75,
    attrs: attrs([88, 62, 46, 74, 76], [68, 50, 46], [44, 54, 48, 32, 42], [50, 62]),
    person: { discipline: 40, professionalism: 54, charisma: 88, ambition: 60 },
    traits: ['partyAnimal', 'headhunter', 'fastStarter'],
    record: '8-3-0', star: 40, rep: 36, upside: 5,
    notes:
      'Star Power 40 against Reputation 36 on an 8-3 record: he is already a bigger draw than a fighter. Discipline 40 and Cardio 46 are why the three losses came.',
  },
  {
    id: 'f_arlovski',
    first: 'Andrei', last: 'Arlovski', nick: 'The Pit Bull', nat: 'Belarus', age: 40, div: HW,
    walk: 245, htIn: 76, reachIn: 77,
    attrs: attrs([68, 56, 62, 42, 62], [70, 52, 58], [52, 66, 50, 46, 48], [66, 56]),
    person: { discipline: 76, professionalism: 84, charisma: 46, ambition: 44, loyalty: 70 },
    traits: ['chinny', 'companyMan'],
    record: '28-19-0', star: 24, rep: 38, trauma: 78,
    notes:
      'Head Trauma 78 is the highest in the roster and Durability 42 follows from it. A former champion who is now a name on the record of whoever beats him.',
  },

  // --- Light Heavyweight -------------------------------------------------------------------
  {
    id: 'f_blachowicz',
    first: 'Jan', last: 'Blachowicz', nat: 'Poland', age: 36, div: LHW,
    walk: 220, htIn: 74, reachIn: 78,
    attrs: attrs([84, 64, 70, 74, 76], [76, 74, 70], [66, 74, 70, 68, 62], [76, 80]),
    person: { discipline: 80, professionalism: 84, charisma: 52, ambition: 74, resilience: 82 },
    traits: [],
    record: '25-8-0', star: 30, rep: 62, trauma: 28,
    notes:
      'A late bloomer who quietly became the most complete fighter in the division. Speed 64 is the limit, and eight losses say how long it took him to get here.',
  },
  {
    id: 'f_rakic',
    first: 'Aleksandar', last: 'Rakic', nat: 'Austria', age: 27, div: LHW,
    walk: 225, htIn: 77, reachIn: 78,
    attrs: attrs([82, 72, 68, 70, 74], [74, 82, 70], [58, 70, 58, 48, 58], [66, 66]),
    person: { discipline: 78, professionalism: 80, charisma: 44, ambition: 76 },
    traits: [],
    record: '13-1-0', star: 16, rep: 48, upside: 7,
    notes:
      'Long, powerful and technically clean on the feet, with Submissions 48 and a grappling game nobody has properly tested yet.',
  },
  {
    id: 'f_oezdemir',
    first: 'Volkan', last: 'Oezdemir', nick: 'No Time', nat: 'Switzerland', age: 30, div: LHW,
    walk: 220, htIn: 74, reachIn: 75,
    attrs: attrs([86, 66, 52, 68, 72], [72, 58, 56], [50, 68, 52, 40, 50], [58, 64]),
    person: { discipline: 60, professionalism: 62, charisma: 56, aggression: 82 },
    traits: ['fastStarter', 'headhunter'],
    record: '16-4-0', star: 26, rep: 46, trauma: 32,
    notes:
      'Frightening in round one and gone by round two — Cardio 52 decides every fight he loses.',
  },
  {
    id: 'f_krylov',
    first: 'Nikita', last: 'Krylov', nick: 'The Miner', nat: 'Ukraine', age: 27, div: LHW,
    walk: 220, htIn: 75, reachIn: 77,
    attrs: attrs([78, 70, 62, 62, 70], [66, 72, 54], [62, 60, 66, 78, 66], [58, 62]),
    person: { discipline: 66, professionalism: 70, charisma: 40, aggression: 84 },
    traits: ['finisher', 'glassCannon'],
    record: '26-7-0', star: 14, rep: 44, trauma: 34,
    notes:
      'Everything he does ends the fight one way or the other: 26 wins and 7 losses with almost nothing on the cards. Striking Defence 54 is why.',
  },
  {
    id: 'f_crute',
    first: 'Jimmy', last: 'Crute', nat: 'Australia', age: 23, div: LHW,
    walk: 218, htIn: 74, reachIn: 76,
    attrs: attrs([70, 64, 58, 64, 70], [62, 60, 54], [66, 62, 70, 76, 64], [62, 64]),
    person: { discipline: 76, professionalism: 78, charisma: 46, ambition: 78 },
    traits: [],
    record: '11-1-0', star: 10, rep: 34, upside: 12,
    notes:
      'Twenty-three with a real submission game and no elite attribute yet. Cardio 58 and Striking Defence 54 are the holes a step up will find. The interesting question about him is entirely about the ceiling, not the current card.',
  },

  // --- Middleweight -------------------------------------------------------------------------
  {
    id: 'f_hermansson',
    first: 'Jack', last: 'Hermansson', nick: 'The Joker', nat: 'Sweden', age: 31, div: MW,
    walk: 200, htIn: 73, reachIn: 77,
    attrs: attrs([64, 68, 74, 66, 74], [70, 66, 56], [74, 70, 74, 82, 68], [72, 70]),
    person: { discipline: 80, professionalism: 82, charisma: 50, ambition: 74 },
    traits: ['finisher'],
    record: '20-5-0', star: 18, rep: 56,
    notes:
      'A genuinely nasty grappler with Submissions 82 and Power 64. Striking Defence 56 is why every one of his losses came on the feet, and why the game plan against him writes itself.',
  },
  {
    id: 'f_brunson',
    first: 'Derek', last: 'Brunson', nat: 'USA', age: 36, div: MW,
    walk: 200, htIn: 73, reachIn: 77,
    attrs: attrs([80, 68, 70, 58, 82], [64, 52, 50], [82, 74, 78, 56, 66], [58, 60]),
    person: { discipline: 74, professionalism: 78, charisma: 42, aggression: 78 },
    traits: ['fastStarter'],
    record: '20-7-0', star: 18, rep: 52, trauma: 42,
    notes:
      'Elite wrestling attached to Durability 58 and Fight IQ 58: he abandons the thing that wins him fights the moment someone hurts him, and it has cost him every big fight.',
  },
  {
    id: 'f_hall',
    first: 'Uriah', last: 'Hall', nat: 'Jamaica', age: 35, div: MW,
    walk: 195, htIn: 73, reachIn: 79,
    attrs: attrs([84, 78, 62, 66, 66], [76, 86, 72], [46, 64, 50, 46, 58], [62, 48]),
    person: { discipline: 58, professionalism: 66, charisma: 60, resilience: 34, ambition: 48 },
    traits: ['fragileEgo', 'headhunter'],
    record: '15-9-0', star: 30, rep: 44, trauma: 40,
    notes:
      'Some of the most spectacular tools in the division attached to Composure 48 and Resilience 34. Nine losses from a fighter who could beat anyone on his night.',
  },
  {
    id: 'f_vettori',
    first: 'Marvin', last: 'Vettori', nick: 'The Italian Dream', nat: 'Italy', age: 26, div: MW,
    walk: 200, htIn: 72, reachIn: 74,
    attrs: attrs([66, 66, 84, 76, 78], [70, 60, 64], [74, 76, 70, 62, 68], [68, 78]),
    person: { discipline: 82, professionalism: 76, charisma: 58, aggression: 80, ego: 78 },
    traits: ['cardioMachine'],
    record: '14-4-1', star: 16, rep: 48, upside: 7,
    notes:
      'A pressure fighter with a real gas tank and Power 66 — he wins rounds and never ends fights.',
  },
  {
    id: 'f_shahbazyan',
    first: 'Edmen', last: 'Shahbazyan', nat: 'USA', age: 22, div: MW,
    walk: 195, htIn: 74, reachIn: 76,
    attrs: attrs([80, 74, 58, 62, 66], [72, 70, 60], [58, 58, 62, 60, 58], [56, 58]),
    person: { discipline: 74, professionalism: 76, charisma: 50, ambition: 82 },
    traits: ['protectedProspect', 'fastStarter'],
    record: '11-0-0', star: 18, rep: 40, upside: 13,
    notes:
      'Twenty-two, unbeaten, and carefully matched — the Protected Prospect trait is on him for a reason. Cardio 58 and Fight IQ 56 are what a real step up will find.',
  },
  {
    id: 'f_tavares',
    first: 'Brad', last: 'Tavares', nat: 'USA', age: 32, div: MW,
    walk: 195, htIn: 71, reachIn: 74,
    attrs: attrs([64, 66, 76, 78, 68], [72, 68, 68], [58, 74, 58, 46, 60], [70, 74]),
    person: { discipline: 80, professionalism: 84, charisma: 34 },
    traits: ['ironChin'],
    record: '17-6-0', star: 12, rep: 46, trauma: 40,
    notes:
      'Durable, technically sound and utterly unable to finish anyone: Power 64 and Submissions 46 mean every fight goes to the cards.',
  },

  // --- Welterweight -------------------------------------------------------------------------
  {
    id: 'f_luque',
    first: 'Vicente', last: 'Luque', nat: 'Brazil', age: 28, div: WW,
    walk: 185, htIn: 71, reachIn: 76,
    attrs: attrs([82, 70, 72, 74, 72], [78, 70, 56], [60, 66, 66, 80, 64], [64, 76]),
    person: { discipline: 76, professionalism: 80, charisma: 48, aggression: 84 },
    traits: ['finisher', 'dog'],
    record: '17-6-1', star: 20, rep: 52, trauma: 36,
    notes:
      'Power and submissions in the same fighter, with Striking Defence 56 the price of it. Almost none of his fights reach the judges, in either direction.',
  },
  {
    id: 'f_magny',
    first: 'Neil', last: 'Magny', nick: 'The Haitian Sensation', nat: 'USA', age: 32, div: WW,
    walk: 185, htIn: 75, reachIn: 80,
    attrs: attrs([56, 64, 84, 70, 70], [68, 62, 64], [70, 72, 68, 56, 66], [70, 72]),
    person: { discipline: 84, professionalism: 88, charisma: 36, loyalty: 80 },
    traits: ['companyMan', 'cardioMachine'],
    record: '22-7-0', star: 14, rep: 50,
    notes:
      'Enormous reach, an enormous gas tank and Power 56. He out-works people and has never once threatened to finish one.',
  },
  {
    id: 'f_dos_anjos',
    first: 'Rafael', last: 'dos Anjos', nat: 'Brazil', age: 35, div: WW,
    walk: 185, htIn: 68, reachIn: 70,
    attrs: attrs([58, 68, 80, 74, 58], [76, 78, 68], [70, 70, 72, 76, 70], [80, 78]),
    person: { discipline: 86, professionalism: 88, charisma: 44, loyalty: 74 },
    traits: ['cardioMachine'],
    record: '29-12-0', star: 26, rep: 60, trauma: 40,
    notes:
      'A former lightweight champion who is physically the smallest man in the division — Strength 58 and Power 58 at 170 are why the move up stalled against anyone who could hold him. Everything else is still excellent.',
  },
  {
    id: 'f_neal',
    first: 'Geoff', last: 'Neal', nick: 'Handz of Steel', nat: 'USA', age: 29, div: WW,
    walk: 185, htIn: 71, reachIn: 75,
    attrs: attrs([84, 74, 66, 70, 70], [80, 70, 66], [52, 66, 54, 48, 58], [64, 66]),
    person: { discipline: 70, professionalism: 74, charisma: 46, ambition: 74 },
    traits: ['finisher'],
    record: '13-2-0', star: 16, rep: 46, upside: 5,
    notes:
      'Genuine one-punch power and a wrestling game rated 52 that nobody has yet made him use.',
  },
  {
    id: 'f_chiesa',
    first: 'Michael', last: 'Chiesa', nick: 'Maverick', nat: 'USA', age: 32, div: WW,
    walk: 185, htIn: 73, reachIn: 75,
    attrs: attrs([54, 62, 76, 70, 78], [58, 48, 58], [80, 68, 78, 74, 68], [70, 70]),
    person: { discipline: 78, professionalism: 80, charisma: 56 },
    traits: [],
    record: '16-4-0', star: 18, rep: 48,
    notes:
      'A large, effective grappler with Power 54 and Kicking 48 — he has to get it to the mat, and everybody knows it.',
  },
  {
    id: 'f_maia',
    first: 'Demian', last: 'Maia', nat: 'Brazil', age: 42, div: WW,
    walk: 185, htIn: 71, reachIn: 72,
    attrs: attrs([48, 50, 60, 62, 70], [50, 40, 52], [72, 62, 88, 96, 74], [78, 78]),
    person: { discipline: 88, professionalism: 92, charisma: 44, loyalty: 86 },
    traits: [],
    record: '27-10-0', star: 24, rep: 58, trauma: 30,
    notes:
      'Submissions 96 is the second-highest in the game and the only elite thing left. Power 48, Kicking 40 and Speed 50 at 42 years old make him a one-trick fighter whose one trick is still world-class.',
  },
  {
    id: 'f_ponzinibbio',
    first: 'Santiago', last: 'Ponzinibbio', nat: 'Argentina', age: 33, div: WW,
    walk: 185, htIn: 72, reachIn: 74,
    attrs: attrs([76, 70, 74, 68, 68], [78, 74, 64], [56, 68, 56, 50, 60], [68, 70]),
    person: { discipline: 72, professionalism: 70, charisma: 54 },
    traits: ['injuryProne'],
    record: '27-3-0', star: 18, rep: 54,
    notes:
      'A seven-fight win streak stalled entirely by injury — the Injury Prone trait is doing more damage to this career than any opponent has.',
  },

  // --- Lightweight ---------------------------------------------------------------------------
  {
    id: 'f_makhachev',
    first: 'Islam', last: 'Makhachev', nat: 'Russia', age: 28, div: LW,
    walk: 175, htIn: 70, reachIn: 70,
    attrs: attrs([60, 70, 82, 74, 84], [66, 58, 66], [86, 80, 84, 78, 74], [78, 76]),
    person: { discipline: 90, professionalism: 82, charisma: 38, ambition: 76, loyalty: 92 },
    traits: ['gymRat'],
    record: '17-1-0', star: 14, rep: 46, upside: 8,
    notes:
      'The same system as his training partner and not yet the same fighter. Power 60 and Star Power 14 are honest for January 2020, when he was a name only inside the division.',
  },
  {
    id: 'f_dariush',
    first: 'Beneil', last: 'Dariush', nat: 'Iran', age: 30, div: LW,
    walk: 172, htIn: 70, reachIn: 72,
    attrs: attrs([66, 68, 74, 68, 74], [72, 68, 58], [70, 72, 72, 84, 70], [72, 74]),
    person: { discipline: 82, professionalism: 84, charisma: 40 },
    traits: [],
    record: '16-4-1', star: 10, rep: 44,
    notes:
      'Excellent on the mat and hittable on the feet: Striking Defence 58 with Submissions 84. Star Power 10 for a top-15 fighter is the harshest number in this file and it is accurate.',
  },
  {
    id: 'f_felder',
    first: 'Paul', last: 'Felder', nick: 'The Irish Dragon', nat: 'USA', age: 35, div: LW,
    walk: 172, htIn: 71, reachIn: 72,
    attrs: attrs([76, 70, 72, 74, 66], [74, 80, 62], [54, 68, 56, 52, 60], [70, 82]),
    person: { discipline: 76, professionalism: 84, charisma: 74, aggression: 80 },
    traits: ['dog'],
    record: '17-4-0', star: 32, rep: 50, trauma: 44,
    notes:
      'Spectacular elbows and spinning attacks, Wrestling 54, and a willingness to be hit that has left him with real accumulated damage at 35.',
  },
  {
    id: 'f_lee_k',
    first: 'Kevin', last: 'Lee', nick: 'The Motown Phenom', nat: 'USA', age: 27, div: LW,
    walk: 180, htIn: 71, reachIn: 77,
    attrs: attrs([70, 76, 58, 66, 80], [68, 62, 60], [82, 70, 78, 70, 66], [58, 54]),
    person: { discipline: 52, professionalism: 56, charisma: 68, ego: 86 },
    traits: ['weightCutGambler', 'frontrunner'],
    record: '18-5-0', star: 34, rep: 48,
    notes:
      'Elite wrestling and Cardio 58, on a body that cuts dangerously to make 155. Composure 54 and Frontrunner explain every fight he has led and then lost.',
  },
  {
    id: 'f_gillespie',
    first: 'Gregor', last: 'Gillespie', nick: 'The Gift', nat: 'USA', age: 32, div: LW,
    walk: 172, htIn: 68, reachIn: 70,
    attrs: attrs([64, 68, 76, 56, 80], [62, 50, 52], [86, 72, 82, 74, 70], [68, 62]),
    person: { discipline: 82, professionalism: 82, charisma: 36 },
    traits: [],
    record: '13-1-0', star: 12, rep: 44, trauma: 26,
    notes:
      'Wrestling 86 and Durability 56. The single loss was a head kick, and the profile says plainly that it will happen again against anyone who can strike.',
  },
  {
    id: 'f_ferreira',
    first: 'Diego', last: 'Ferreira', nat: 'Brazil', age: 34, div: LW,
    walk: 172, htIn: 71, reachIn: 74,
    attrs: attrs([64, 66, 76, 62, 68], [72, 64, 56], [62, 66, 66, 78, 68], [66, 70]),
    person: { discipline: 78, professionalism: 78, charisma: 40 },
    traits: [],
    record: '16-2-0', star: 8, rep: 40,
    notes:
      'A long, quiet win streak nobody noticed. Striking Defence 56 and Durability 62 are why it will end. Star Power 8 is the lowest in the division and the reason he will never headline anything.',
  },
  {
    id: 'f_iaquinta',
    first: 'Al', last: 'Iaquinta', nick: 'Raging', nat: 'USA', age: 32, div: LW,
    walk: 172, htIn: 70, reachIn: 70,
    attrs: attrs([74, 68, 66, 74, 70], [76, 56, 66], [62, 74, 58, 46, 58], [66, 70]),
    person: { discipline: 54, professionalism: 48, charisma: 62, ambition: 44, loyalty: 30 },
    traits: ['mercenary'],
    record: '14-6-1', star: 26, rep: 44, trauma: 34,
    notes:
      'Good boxing, a solid chin and a well-documented history of contract disputes and half-hearted camps — Professionalism 48 and Ambition 44 are the career.',
  },

  // --- Featherweight ------------------------------------------------------------------------
  {
    id: 'f_kattar',
    first: 'Calvin', last: 'Kattar', nick: 'The Boston Finisher', nat: 'USA', age: 31, div: FW,
    walk: 165, htIn: 71, reachIn: 72,
    attrs: attrs([76, 70, 72, 80, 66], [84, 60, 70], [48, 70, 52, 44, 56], [72, 78]),
    person: { discipline: 80, professionalism: 84, charisma: 44 },
    traits: ['ironChin'],
    record: '20-4-0', star: 16, rep: 50, trauma: 32,
    notes:
      'One of the best jabs in the sport and a chin that lets him use it. Wrestling 48 and Kicking 60 are the whole game plan against him.',
  },
  {
    id: 'f_allen',
    first: 'Arnold', last: 'Allen', nick: 'Almighty', nat: 'England', age: 26, div: FW,
    walk: 165, htIn: 69, reachIn: 71,
    attrs: attrs([62, 74, 76, 74, 60], [76, 66, 74], [54, 72, 58, 62, 68], [74, 72]),
    person: { discipline: 78, professionalism: 80, charisma: 38 },
    traits: [],
    record: '15-1-0', star: 8, rep: 40, upside: 9,
    notes:
      'Unbeaten in the promotion and completely anonymous. Wrestling 54 and Strength 60 are what a genuine grappler will find. Star Power 8 with a top-15 skill set is a test of whether the game rewards results without marketing.',
  },
  {
    id: 'f_ige',
    first: 'Dan', last: 'Ige', nick: '50K', nat: 'USA', age: 28, div: FW,
    walk: 165, htIn: 67, reachIn: 70,
    attrs: attrs([76, 70, 74, 70, 72], [70, 52, 56], [66, 68, 64, 50, 62], [64, 68]),
    person: { discipline: 76, professionalism: 78, charisma: 48, ambition: 74 },
    traits: [],
    record: '13-2-0', star: 12, rep: 42, upside: 5,
    notes:
      'Short, powerful and busy, with Kicking 52, Submissions 50 and no reach at all. Wins by being harder to discourage than the other man, and loses to anyone who can keep him at distance.',
  },
  {
    id: 'f_burgos',
    first: 'Shane', last: 'Burgos', nick: 'Hurricane', nat: 'USA', age: 29, div: FW,
    walk: 165, htIn: 71, reachIn: 72,
    attrs: attrs([72, 70, 84, 78, 64], [78, 62, 54], [50, 62, 52, 50, 60], [62, 82]),
    person: { discipline: 78, professionalism: 80, charisma: 56, aggression: 88 },
    traits: ['dog', 'volumeMachine'],
    record: '13-1-0', star: 18, rep: 46, trauma: 38,
    notes:
      'Striking Defence 54 with Composure 82 and the Dog trait: he wins wars he did not need to be in, and Head Trauma 38 at 29 is the bill arriving.',
  },
  {
    id: 'f_moicano',
    first: 'Renato', last: 'Moicano', nat: 'Brazil', age: 30, div: FW,
    walk: 165, htIn: 71, reachIn: 74,
    attrs: attrs([58, 68, 72, 58, 64], [74, 68, 74], [58, 66, 66, 80, 66], [72, 60]),
    person: { discipline: 74, professionalism: 76, charisma: 52 },
    traits: ['glassCannon'],
    record: '13-3-1', star: 12, rep: 44, trauma: 34,
    notes:
      'A slick technician with Durability 58 and Power 58 — he out-points people until someone touches him cleanly.',
  },

  // --- Bantamweight --------------------------------------------------------------------------
  {
    id: 'f_aldo',
    first: 'Jose', last: 'Aldo', nick: 'Junior', nat: 'Brazil', age: 33, div: BW,
    walk: 155, htIn: 67, reachIn: 70,
    attrs: attrs([76, 74, 62, 70, 70], [84, 82, 82], [58, 88, 60, 58, 66], [84, 80]),
    person: { discipline: 76, professionalism: 78, charisma: 56, resilience: 70, loyalty: 84 },
    traits: ['weightCutGambler'],
    record: '28-6-0', star: 52, rep: 74, trauma: 48,
    notes:
      'Takedown Defence 88 and one of the great striking games, on a 33-year-old body cutting to a division below the one that already drained him. Cardio 62 is the number that ends his fights now.',
  },
  {
    id: 'f_edgar',
    first: 'Frankie', last: 'Edgar', nick: 'The Answer', nat: 'USA', age: 38, div: BW,
    walk: 150, htIn: 66, reachIn: 68,
    attrs: attrs([54, 72, 84, 66, 66], [72, 52, 68], [78, 74, 66, 56, 74], [82, 88]),
    person: { discipline: 88, professionalism: 90, charisma: 58, resilience: 92, loyalty: 88 },
    traits: ['dog', 'cardioMachine'],
    record: '23-8-1', star: 40, rep: 64, trauma: 64,
    notes:
      'Composure 88 and Cardio 84 at 38, with Head Trauma 64 and a chin that has started to go. The most admirable fighter on the roster and one who should have stopped.',
  },
  {
    id: 'f_font',
    first: 'Rob', last: 'Font', nat: 'USA', age: 32, div: BW,
    walk: 145, htIn: 68, reachIn: 71,
    attrs: attrs([70, 74, 76, 68, 62], [82, 62, 70], [56, 66, 58, 56, 62], [70, 68]),
    person: { discipline: 76, professionalism: 80, charisma: 40 },
    traits: ['volumeMachine'],
    record: '16-4-0', star: 10, rep: 44,
    notes:
      'An outstanding jab behind a long reach for the weight, with Wrestling 56 and Strength 62 that any grappler will find immediately.',
  },
  {
    id: 'f_munhoz',
    first: 'Pedro', last: 'Munhoz', nick: 'The Young Punisher', nat: 'Brazil', age: 33, div: BW,
    walk: 145, htIn: 66, reachIn: 67,
    attrs: attrs([66, 58, 78, 82, 70], [70, 62, 56], [60, 70, 66, 82, 66], [66, 78]),
    person: { discipline: 78, professionalism: 80, charisma: 46, aggression: 82 },
    traits: ['ironChin'],
    record: '18-4-0', star: 14, rep: 48, trauma: 36,
    notes:
      'A guillotine specialist with a very good chin, Speed 58 and Power 66. He is hit a great deal on the way in and has never troubled anyone standing.',
  },
  {
    id: 'f_vera_m',
    first: 'Marlon', last: 'Vera', nick: 'Chito', nat: 'Ecuador', age: 27, div: BW,
    walk: 148, htIn: 68, reachIn: 70,
    attrs: attrs([70, 62, 80, 82, 68], [68, 74, 58], [56, 62, 64, 78, 70], [64, 84]),
    person: { discipline: 74, professionalism: 76, charisma: 62, resilience: 88 },
    traits: ['dog', 'lateStarter'],
    record: '15-6-1', star: 20, rep: 44, trauma: 32,
    notes:
      'Composure 84 and a genuine third-round fighter — he loses the first ten minutes of almost every fight he wins. Speed 62 is why.',
  },
  {
    id: 'f_garbrandt',
    first: 'Cody', last: 'Garbrandt', nick: 'No Love', nat: 'USA', age: 28, div: BW,
    walk: 145, htIn: 68, reachIn: 66,
    attrs: attrs([84, 82, 60, 50, 66], [80, 56, 58], [66, 68, 58, 44, 58], [54, 46]),
    person: { discipline: 58, professionalism: 62, charisma: 66, ego: 88, resilience: 32 },
    traits: ['glassCannon', 'frontrunner', 'fragileEgo'],
    record: '11-3-0', star: 44, rep: 46, trauma: 58,
    notes:
      'Elite speed and power on a chin rated 50 after three consecutive knockout losses. Composure 46 and Resilience 32 are the harshest pair in this file, and the fights they describe are on tape.',
  },
  {
    id: 'f_song',
    first: 'Yadong', last: 'Song', nat: 'China', age: 22, div: BW,
    walk: 145, htIn: 67, reachIn: 69,
    attrs: attrs([74, 72, 70, 70, 68], [74, 64, 64], [62, 66, 60, 52, 62], [62, 64]),
    person: { discipline: 78, professionalism: 78, charisma: 44, ambition: 76 },
    traits: [],
    record: '14-4-1', star: 10, rep: 36, upside: 13,
    notes:
      'Twenty-two with no glaring hole and no elite weapon. The whole profile is the ceiling.',
  },

  // --- Flyweight ------------------------------------------------------------------------------
  {
    id: 'f_pantoja',
    first: 'Alexandre', last: 'Pantoja', nat: 'Brazil', age: 29, div: FLW,
    walk: 135, htIn: 65, reachIn: 68,
    attrs: attrs([56, 72, 80, 72, 68], [68, 64, 64], [70, 70, 74, 84, 76], [70, 74]),
    person: { discipline: 80, professionalism: 80, charisma: 42, aggression: 78 },
    traits: ['finisher'],
    record: '20-3-0', star: 12, rep: 46,
    notes:
      'A relentless back-taker with Power 56 — he has to choke people, and against anyone who defends the neck he is out of ideas.',
  },
  {
    id: 'f_kara_france',
    first: 'Kai', last: 'Kara-France', nat: 'New Zealand', age: 26, div: FLW,
    walk: 135, htIn: 63, reachIn: 65,
    attrs: attrs([64, 76, 76, 70, 64], [74, 62, 66], [58, 70, 56, 44, 62], [66, 68]),
    person: { discipline: 76, professionalism: 78, charisma: 56, ambition: 74 },
    traits: ['fastStarter'],
    record: '20-8-0', star: 12, rep: 40, upside: 6,
    notes:
      'Quick hands and short arms. Submissions 44 and Reach 65 mean he has to be inside, and the eight losses came from being there.',
  },
  {
    id: 'f_perez',
    first: 'Alex', last: 'Perez', nat: 'USA', age: 27, div: FLW,
    walk: 135, htIn: 66, reachIn: 68,
    attrs: attrs([54, 70, 78, 68, 72], [64, 60, 56], [74, 68, 70, 54, 66], [66, 66]),
    person: { discipline: 78, professionalism: 78, charisma: 34 },
    traits: [],
    record: '23-5-0', star: 8, rep: 38, upside: 5,
    notes:
      'A capable wrestler with Power 54, Striking Defence 56 and Star Power 8. The division needs a dozen of him and can market none of them.',
  },
  {
    id: 'f_formiga',
    first: 'Jussier', last: 'Formiga', nat: 'Brazil', age: 34, div: FLW,
    walk: 132, htIn: 65, reachIn: 66,
    attrs: attrs([46, 62, 72, 62, 64], [56, 50, 60], [72, 70, 76, 86, 72], [76, 70]),
    person: { discipline: 84, professionalism: 86, charisma: 26 },
    traits: [],
    record: '23-7-0', star: 6, rep: 44,
    notes:
      'Submissions 86 and Power 46. Star Power 6 is the floor of the roster and matches a career of excellent, invisible grappling.',
  },
  {
    id: 'f_elliott',
    first: 'Tim', last: 'Elliott', nat: 'USA', age: 33, div: FLW,
    walk: 132, htIn: 67, reachIn: 68,
    attrs: attrs([54, 68, 78, 70, 64], [58, 56, 46], [72, 62, 68, 76, 84], [58, 76]),
    person: { discipline: 66, professionalism: 70, charisma: 58, aggression: 80 },
    traits: ['dog', 'loneWolf'],
    record: '16-10-1', star: 12, rep: 38, trauma: 40,
    notes:
      'Scrambling 84 and Striking Defence 46: chaotic, awkward, and hit constantly. Ten losses from a fighter nobody enjoys facing.',
  },
  {
    id: 'f_schnell',
    first: 'Matt', last: 'Schnell', nick: 'Danger', nat: 'USA', age: 30, div: FLW,
    walk: 132, htIn: 68, reachIn: 71,
    attrs: attrs([56, 66, 72, 54, 58], [64, 60, 58], [56, 60, 58, 74, 66], [62, 70]),
    person: { discipline: 72, professionalism: 76, charisma: 44 },
    traits: ['glassCannon'],
    record: '14-5-0', star: 6, rep: 34,
    notes:
      'Long for the division with a real submission game and Durability 54 — every one of his losses is a knockout.',
  },
];
