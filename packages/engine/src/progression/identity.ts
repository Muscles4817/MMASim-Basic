/**
 * Where a generated fighter comes from, and the room they train in.
 *
 * The audit found a generated world of 844 fighters in which about one in twenty had a gym, and
 * the fighter page showed nobody's origin, gym or coach at all. A person in this sport is mostly
 * those three things before they are anything else — "a Dagestani wrestler out of a room in
 * Makhachkala" is a fighter, "lightweight, 26, 14-3" is a row.
 *
 * **Nothing here is stored.** A fighter who has a real `gymId` trains there and the page names it.
 * Everybody else — which is most of a generated world, because the world only has the handful of
 * gyms the seed carries — trains in what the development model has always given them: a room of
 * quality 40 and nobody running the camp who is better than a part-timer (`rawGain` reads that as
 * a coach factor of 0.55). That room was real and nameless. `localRoom` gives it a name, a city and
 * the person who runs it, derived from the fighter's id and nationality, and builds it so that the
 * arithmetic it implies is *exactly* the arithmetic the fighter already gets — `identity.test.ts`
 * asserts the forecast is identical to the penny. So the page can show the gym without the page and
 * the engine disagreeing about what that gym is worth, and without a single extra byte in a save.
 *
 * Seeded fighters are excluded on purpose, by the same rule doc 31 § 22.5 applies to backgrounds:
 * a hand-authored fighter is a documented person, and inventing where they train would be a second
 * opinion about somebody we already know the answer for. `localRoom` reads `background` as the
 * marker, because every generated fighter has one and no seeded fighter does.
 */

import { createRng, hashSeed, type Rng } from '../core/rng.js';
import { asCoachId, asGymId } from '../core/ids.js';
import { COACH_SPECIALISMS, type Coach, type Gym } from '../domain/organisations.js';
import type { Fighter } from '../domain/fighter.js';
import { uniformPersonality } from '../domain/personality.js';
import { generateName, poolFor } from './names.js';

/** A handful of places per country, so a division reads as somewhere rather than everywhere. */
export const HOMETOWNS: Readonly<Record<string, readonly string[]>> = {
  USA: ['Albuquerque', 'Sacramento', 'Tampa', 'Milwaukee', 'Las Vegas', 'Philadelphia', 'Dallas'],
  Brazil: ['Curitiba', 'Rio de Janeiro', 'Manaus', 'Belo Horizonte', 'Natal', 'Porto Alegre'],
  Russia: ['Makhachkala', 'Novosibirsk', 'Kazan', 'Grozny', 'Yekaterinburg', 'Omsk'],
  England: ['Liverpool', 'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Bristol'],
  Mexico: ['Tijuana', 'Guadalajara', 'Monterrey', 'Puebla', 'Hermosillo', 'León'],
  Japan: ['Osaka', 'Saitama', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe'],
  Poland: ['Gdańsk', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Lublin'],
  Nigeria: ['Lagos', 'Ibadan', 'Port Harcourt', 'Enugu', 'Abuja'],
  Australia: ['Perth', 'Brisbane', 'Gold Coast', 'Adelaide', 'Newcastle', 'Geelong'],
  France: ['Marseille', 'Lyon', 'Lille', 'Toulouse', 'Nice', 'Bordeaux'],
  Georgia: ['Tbilisi', 'Kutaisi', 'Batumi', 'Rustavi'],
  'South Korea': ['Busan', 'Incheon', 'Daegu', 'Gwangju', 'Suwon'],
  Sweden: ['Gothenburg', 'Malmö', 'Uppsala', 'Örebro'],
  Canada: ['Montreal', 'Winnipeg', 'Calgary', 'Halifax', 'Hamilton'],
  Kazakhstan: ['Almaty', 'Shymkent', 'Karaganda', 'Aktobe'],
  Ireland: ['Dublin', 'Cork', 'Limerick', 'Galway'],
  Netherlands: ['Rotterdam', 'Utrecht', 'Eindhoven', 'Breda'],
  China: ['Chengdu', 'Guangzhou', 'Kunming', 'Harbin', 'Xi’an'],
  Ukraine: ['Kharkiv', 'Odesa', 'Dnipro', 'Lviv', 'Zaporizhzhia'],
  Czechia: ['Brno', 'Ostrava', 'Plzeň', 'Liberec'],
  Thailand: ['Chiang Mai', 'Pattaya', 'Khon Kaen', 'Hat Yai'],
  Kyrgyzstan: ['Bishkek', 'Osh', 'Karakol'],
  Argentina: ['Rosario', 'Córdoba', 'Mendoza', 'La Plata'],
  Cuba: ['Havana', 'Santiago de Cuba', 'Camagüey', 'Holguín'],
};

/** How many local rooms each country has. Enough for teammates; few enough to share them. */
const ROOMS_PER_COUNTRY = 8;

/**
 * What the development model gives a fighter with no gym, stated as a gym and a coach.
 *
 * `rawGain` reads `gym?.quality ?? 40` and, with no coach, a flat factor of 0.55. A coach with
 * development 33 who covers every specialism has an effectiveness of 33 in every focus, and
 * `clamp(33 / 60, 0.4, 1.6)` is 0.55 — so naming the room changes nothing it does.
 */
export const LOCAL_ROOM_QUALITY = 40;
export const LOCAL_COACH_DEVELOPMENT = 33;

const ROOM_WORDS = ['Forge', 'Foundry', 'Engine Room', 'Boiler Room', 'Garage', 'Warehouse'];

function roomName(rng: Rng, city: string | undefined, coachSurname: string): string {
  const patterns: readonly ((c: string) => string)[] = city
    ? [
        (c) => `${c} Combat Club`,
        (c) => `${c} MMA`,
        (c) => `${c} Fight Factory`,
        () => `Team ${coachSurname}`,
        () => `${coachSurname} Fight Academy`,
        () => `The ${rng.pick(ROOM_WORDS)}`,
      ]
    : [() => `Team ${coachSurname}`, () => `${coachSurname} Fight Academy`];
  return rng.pick(patterns)(city ?? '');
}

export interface LocalRoom {
  gym: Gym;
  coach: Coach;
}

/** Which of a country's local rooms a fighter belongs to. Stable for the life of the fighter. */
const roomKey = (fighter: Pick<Fighter, 'id' | 'nationality'>): string =>
  `${fighter.nationality}:${hashSeed(fighter.id as string) % ROOMS_PER_COUNTRY}`;

/**
 * The local room a generated fighter trains in when the world has given them no gym.
 *
 * Undefined for a fighter with a real gym, and for a seeded fighter (see the module comment).
 * Two fighters from the same country can land in the same room, which is the point: teammates.
 */
export function localRoom(
  fighter: Pick<Fighter, 'id' | 'nationality' | 'gymId' | 'background'>,
): LocalRoom | undefined {
  if (fighter.gymId !== undefined || fighter.background === undefined) return undefined;

  const key = roomKey(fighter);
  const rng = createRng(`room:${key}`);
  const cities = HOMETOWNS[fighter.nationality];
  const city = cities ? rng.pick(cities) : undefined;
  // A coach from the same country, when the table knows the country. Mostly men, as the sport is.
  const named = generateName(
    rng,
    rng.chance(0.15) ? 'female' : 'male',
    poolFor(fighter.nationality) ? fighter.nationality : undefined,
  );

  const gymId = asGymId(`local_${key}`);
  const coachId = asCoachId(`local_coach_${key}`);
  return {
    gym: {
      id: gymId,
      name: roomName(rng, city, named.lastName),
      country: fighter.nationality,
      city: city ?? '',
      quality: LOCAL_ROOM_QUALITY,
      prestige: 10,
      headCoachId: coachId,
      specialisms: [],
      monthlyCost: 4,
    },
    coach: {
      id: coachId,
      firstName: named.firstName,
      lastName: named.lastName,
      nationality: named.nationality,
      birthDay: 0,
      gymId,
      scouting: LOCAL_COACH_DEVELOPMENT,
      gamePlanning: LOCAL_COACH_DEVELOPMENT,
      development: LOCAL_COACH_DEVELOPMENT,
      cornering: LOCAL_COACH_DEVELOPMENT,
      // Every specialism at the same low level: a generalist who runs the whole room, which is
      // what makes the coach factor identical in every focus.
      specialisms: COACH_SPECIALISMS,
      personality: uniformPersonality(50),
      reputation: 5,
      salary: 1,
    },
  };
}

/**
 * Where a fighter is from, as a place rather than only a flag.
 *
 * The local room's city when they have one, otherwise a city drawn from their own id. Undefined for
 * seeded fighters and for countries the table does not cover, rather than an invented place.
 */
export function hometownOf(
  fighter: Pick<Fighter, 'id' | 'nationality' | 'background'>,
): string | undefined {
  if (fighter.background === undefined) return undefined;
  const cities = HOMETOWNS[fighter.nationality];
  if (!cities) return undefined;
  return createRng(`hometown:${fighter.id as string}`).pick(cities);
}
