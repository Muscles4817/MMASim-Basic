/**
 * What a generated promotion is called.
 *
 * The generator used to name every promotion after its rung of the pyramid — `national 7`, short
 * name `NAT7` — so the new-game picker was eleven rows of "national N", every card on them was
 * called `NAT4 1`, and a promotion presented as *regional* was labelled national. Doc 33 records
 * that as the naming half of the identity defect; this is the fix for that half.
 *
 * A name says which rung a promotion stands on, the way the sport's own names do: the leader and
 * the majors have the grand, placeless names of a brand ("Titan Fighting Championship"), the
 * regional circuit is named after a region ("Gulf Coast Combat League", "Warpath West"), feeder
 * shows after a city, and the local shows after a town. The places are American because every
 * generated promotion is based in the USA — the name must not contradict `baseCountry`.
 *
 * Deterministic: the same seed names the same world, through one fork per rung so that a world
 * with more local shows does not rename its majors. No two promotions share a name or a short
 * name, and none takes a name or short name from either hand-authored era.
 */

import { createRng, hashSeed, type Rng } from '@mmasim/engine';
import { PROMOTIONS_2026 } from '../seed/organisations-2026.js';
import { SEED_PROMOTIONS } from '../seed/organisations.js';

/** The pyramid's rungs, as `generate.ts` labels them. */
export type PyramidRung = 'apex' | 'major' | 'national' | 'feeder' | 'local';

export interface PromotionIdentity {
  name: string;
  /** Initials, the way the sport abbreviates itself: what a card is numbered under. */
  shortName: string;
  /**
   * Where its cards are staged: the town a local show is named after, the hub of the region a
   * regional show is named for, a big city for the brands at the top.
   */
  homeCity: string;
}

/** The second half of a name, and what it abbreviates to. */
export interface Tail {
  text: string;
  abbr: string;
}

/** One way of building a name: any head, then any tail. */
export interface Form {
  heads: readonly string[];
  tails: readonly Tail[];
}

const t = (text: string, abbr: string): Tail => ({ text, abbr });

/** A regional brand that names its shows by territory: "Warpath North". */
const CIRCUIT_BRANDS = [
  'Iron Cage',
  'Warpath',
  'Redline',
  'Ironside',
  'Bloodline',
  'Wildfire',
  'Renegade',
];

/** A feeder that names itself for what it does rather than where it is. */
const DEVELOPMENT_BRANDS = [
  'Rising Star',
  'Next Level',
  'Hard Knocks',
  'New Blood',
  'Breakout',
  'Ground Zero',
];

/** The city a region's promotion stages its cards in. */
const REGION_HUB: Readonly<Record<string, string>> = {
  'Pacific Northwest': 'Seattle',
  'Gulf Coast': 'Houston',
  'Great Lakes': 'Chicago',
  'Rocky Mountain': 'Denver',
  'Lone Star': 'Dallas',
  Midwest: 'Kansas City',
  Southwest: 'Phoenix',
  Northeast: 'Boston',
  'Atlantic Coast': 'Norfolk',
  Heartland: 'Omaha',
  Bluegrass: 'Louisville',
  'Golden State': 'Sacramento',
  'Empire State': 'Albany',
  Keystone: 'Pittsburgh',
  'Sunshine State': 'Tampa',
  'Mid-Atlantic': 'Baltimore',
  'Great Plains': 'Wichita',
  Desert: 'Albuquerque',
  Bayou: 'New Orleans',
  Appalachian: 'Knoxville',
  'Big Sky': 'Billings',
  'Tri-State': 'Cincinnati',
  Cascade: 'Portland',
  Ozark: 'Springfield',
  'New England': 'Providence',
  'Mountain West': 'Salt Lake City',
  Carolina: 'Charlotte',
};

/** And a circuit brand's territory. */
const COMPASS_HUB: Readonly<Record<string, string>> = {
  North: 'Minneapolis',
  South: 'Atlanta',
  East: 'Philadelphia',
  West: 'Los Angeles',
};

/** Where a placeless brand lives: the big rooms, and the mid-sized ones below them. */
const BIG_CITIES = ['New York', 'Los Angeles', 'Chicago', 'Miami', 'Houston', 'Atlanta'];
const MID_CITIES = ['Sacramento', 'Kansas City', 'Nashville', 'Denver', 'Phoenix', 'Columbus'];

/** Picks from a list by the name, so it costs the random stream nothing. */
const byName = (name: string, cities: readonly string[]): string =>
  cities[hashSeed(name) % cities.length]!;

function homeCityFor(rung: PyramidRung, head: string, name: string): string {
  if (rung === 'apex') return 'Las Vegas';
  if (rung === 'major') return byName(name, BIG_CITIES);
  if (rung === 'national') {
    return REGION_HUB[head] ?? COMPASS_HUB[name.split(' ').pop()!] ?? byName(name, MID_CITIES);
  }
  if (DEVELOPMENT_BRANDS.includes(head)) return byName(name, MID_CITIES);
  return head;
}

const CHAMPIONSHIP_TAILS: readonly Tail[] = [
  t('Fighting Championship', 'FC'),
  t('Fighting Championships', 'FC'),
  t('Combat League', 'CL'),
  t('Fight League', 'FL'),
  t('Fighting Alliance', 'FA'),
  t('Combat Championship', 'CC'),
];

/** Placeless brand words: a promotion that has outgrown its home town. */
const BRANDS = [
  'Titan',
  'Sovereign',
  'Dominion',
  'Zenith',
  'Pinnacle',
  'Olympus',
  'Imperial',
  'Monarch',
  'Colossus',
  'Legion',
  'Valor',
  'Crown',
  'Empire',
  'Ironclad',
  'Spartan',
  'Centurion',
  'Meridian',
  'Paragon',
];

/** Exported for the tests, which need to tell a place from its ending. */
export const FORMS: Readonly<Record<PyramidRung, readonly Form[]>> = {
  apex: [
    { heads: ['World', 'Global', 'Premier', 'Universal', ...BRANDS], tails: CHAMPIONSHIP_TAILS },
  ],
  major: [
    { heads: BRANDS, tails: CHAMPIONSHIP_TAILS },
    {
      heads: ['Pacific', 'Atlantic', 'Continental', 'Americas', 'Global'],
      tails: CHAMPIONSHIP_TAILS,
    },
  ],
  national: [
    {
      heads: [
        'Pacific Northwest',
        'Gulf Coast',
        'Great Lakes',
        'Rocky Mountain',
        'Lone Star',
        'Midwest',
        'Southwest',
        'Northeast',
        'Atlantic Coast',
        'Heartland',
        'Bluegrass',
        'Golden State',
        'Empire State',
        'Keystone',
        'Sunshine State',
        'Mid-Atlantic',
        'Great Plains',
        'Desert',
        'Bayou',
        'Appalachian',
        'Big Sky',
        'Tri-State',
        'Cascade',
        'Ozark',
        'New England',
        'Mountain West',
        'Carolina',
      ],
      tails: [
        t('Fighting Championship', 'FC'),
        t('Combat League', 'CL'),
        t('Cage Fighting', 'CF'),
        t('Fight Alliance', 'FA'),
        t('Combat Championships', 'CC'),
        t('Fight Series', 'FS'),
      ],
    },
    // A regional brand with a territory, the way a circuit names its second and third shows.
    {
      heads: CIRCUIT_BRANDS,
      tails: [t('North', 'N'), t('South', 'S'), t('East', 'E'), t('West', 'W')],
    },
  ],
  feeder: [
    {
      heads: [
        'Tulsa',
        'Albuquerque',
        'Spokane',
        'Boise',
        'Omaha',
        'Fresno',
        'Tacoma',
        'Wichita',
        'Toledo',
        'Reno',
        'Des Moines',
        'Knoxville',
        'Chattanooga',
        'El Paso',
        'Lubbock',
        'Savannah',
        'Charleston',
        'Richmond',
        'Buffalo',
        'Rochester',
        'Akron',
        'Dayton',
        'Lexington',
        'Little Rock',
        'Baton Rouge',
        'Shreveport',
        'Pensacola',
        'Tallahassee',
        'Duluth',
        'Fargo',
        'Sioux Falls',
        'Billings',
        'Cheyenne',
        'Tucson',
        'Bakersfield',
        'Stockton',
        'Eugene',
        'Anchorage',
        'Corpus Christi',
        'Amarillo',
        'Madison',
        'Grand Rapids',
      ],
      tails: [
        t('Fight Series', 'FS'),
        t('Combat Series', 'CS'),
        t('Cage Wars', 'CW'),
        t('Fighting Championship', 'FC'),
        t('Proving Ground', 'PG'),
      ],
    },
    // Development brands: shows that exist to send people up the ladder, and say so.
    {
      heads: DEVELOPMENT_BRANDS,
      tails: [t('Fight Series', 'FS'), t('Fighting Championship', 'FC'), t('Combat', 'C')],
    },
  ],
  local: [
    {
      heads: [
        'Bend',
        'Yuma',
        'Laredo',
        'Odessa',
        'Abilene',
        'Joplin',
        'Muncie',
        'Peoria',
        'Erie',
        'Scranton',
        'Altoona',
        'Utica',
        'Bangor',
        'Burlington',
        'Casper',
        'Missoula',
        'Bozeman',
        'Pueblo',
        'Durango',
        'Las Cruces',
        'Roswell',
        'Flagstaff',
        'Prescott',
        'Redding',
        'Chico',
        'Medford',
        'Yakima',
        'Pocatello',
        'Twin Falls',
        'Rapid City',
        'Bismarck',
        'Minot',
        'Grand Forks',
        'Mankato',
        'Eau Claire',
        'Green Bay',
        'Kalamazoo',
        'Flint',
        'Saginaw',
        'Youngstown',
        'Wheeling',
        'Huntington',
        'Roanoke',
        'Lynchburg',
        'Asheville',
        'Greenville',
        'Macon',
        'Dothan',
        'Tupelo',
        'Biloxi',
        'Lafayette',
        'Lake Charles',
        'Texarkana',
        'Tyler',
        'Waco',
        'Killeen',
        'Beaumont',
        'Midland',
        'San Angelo',
        'Enid',
        'Lawton',
        'Salina',
        'Topeka',
        'Davenport',
        'Dubuque',
        'Cedar Rapids',
        'Rockford',
        'Fort Wayne',
        'Evansville',
        'Terre Haute',
        'Bowling Green',
        'Paducah',
        'Ocala',
        'Gainesville',
        'Daytona',
        'Fort Myers',
        'Valdosta',
        'Augusta',
        'Hagerstown',
        'Wilmington',
        'Lancaster',
        'Allentown',
        'Binghamton',
        'Elmira',
        'Sheboygan',
        'Oshkosh',
        'Wausau',
        'La Crosse',
        'Sioux City',
        'Council Bluffs',
        'Grand Island',
        'Kearney',
        'Hutchinson',
        'Joliet',
        'Kankakee',
        'Decatur',
        'Bloomington',
        'Kokomo',
        'Mansfield',
        'Zanesville',
        'Parkersburg',
        'Morgantown',
        'Cumberland',
        'Frederick',
        'Dover',
        'Pittsfield',
        'Nashua',
        'Lewiston',
        'Plattsburgh',
        'Watertown',
        'Ithaca',
        'Williamsport',
        'Johnstown',
        'Danville',
        'Spartanburg',
        'Hattiesburg',
        'Monroe',
        'Houma',
        'Brownsville',
        'McAllen',
        'Wichita Falls',
        'Stillwater',
        'Muskogee',
        'Garden City',
        'Grand Junction',
        'Greeley',
        'Laramie',
        'Rock Springs',
        'Idaho Falls',
        'Helena',
        'Great Falls',
        'Kalispell',
        'Klamath Falls',
        'Eureka',
        'Visalia',
        'Merced',
        'Barstow',
        'Kingman',
        'Gallup',
        'Farmington',
        'Santa Fe',
        'Carlsbad',
        'Ames',
        'Owensboro',
        'Clarksville',
        'Jonesboro',
        'Hot Springs',
        'Fort Smith',
        'Pine Bluff',
        'Ardmore',
        'Bartlesville',
        'Sedalia',
        'Cape Girardeau',
        'Carbondale',
        'Quincy',
        'Galesburg',
        'Logansport',
        'Muskegon',
        'Marquette',
        'Escanaba',
        'Brainerd',
        'Bemidji',
        'Aberdeen',
        'Dickinson',
        'Williston',
        'Sheridan',
        'Gillette',
        'Riverton',
        'Ogden',
        'Elko',
        'Roseburg',
        'Astoria',
        'Walla Walla',
        'Wenatchee',
        'Kennewick',
        'Pendleton',
        'Hilo',
      ],
      tails: [
        // Thirty-odd, so that a Medium world's seventy local shows rarely share an ending.
        t('Fight Night', 'FN'),
        t('Cage Classic', 'CC'),
        t('Throwdown', 'TD'),
        t('Fight Club', 'FC'),
        t('Cage Night', 'CN'),
        t('Showdown', 'SD'),
        t('Brawl', 'B'),
        t('Rumble', 'R'),
        t('Fight Factory', 'FF'),
        t('Cage Wars', 'CW'),
        t('Combat Series', 'CS'),
        t('Fight Series', 'FS'),
        t('Cage Fights', 'CF'),
        t('Combat Club', 'CC'),
        t('Fight League', 'FL'),
        t('Cage Series', 'CS'),
        t('Combat Night', 'CN'),
        t('Knockout Night', 'KN'),
        t('Combat Sports', 'CS'),
        t('Cage Masters', 'CM'),
        t('Cage Challenge', 'CC'),
        t('Combat Challenge', 'CC'),
        t('Fight Challenge', 'FC'),
        t('Cage Showdown', 'CS'),
        t('Combat Showcase', 'CS'),
        t('Cage Invitational', 'CI'),
        t('Combat Classic', 'CC'),
        t('Cage Brawl', 'CB'),
        t('Grudge Match', 'GM'),
        t('Combat League', 'CL'),
        t('Fighting Championship', 'FC'),
        t('MMA', 'MMA'),
      ],
    },
  ],
};

/** "Mid-Atlantic" → "MA", "Lone Star" → "LS". */
const initials = (words: string): string =>
  words
    .split(/[\s-]+/)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function candidate(
  rng: Rng,
  rung: PyramidRung,
): Omit<PromotionIdentity, 'homeCity'> & { head: string; ending: string } {
  const forms = FORMS[rung];
  const form = rng.pickWeighted(forms, (f) => f.heads.length * f.tails.length);
  const head = rng.pick(form.heads);
  const tail = rng.pick(form.tails);
  return {
    head,
    ending: tail.text,
    name: `${head} ${tail.text}`,
    shortName: initials(head) + tail.abbr,
  };
}

/**
 * Initials that already mean something else.
 *
 * "Lancaster Showdown" abbreviates to a drug and "Salina Throwdown" to a disease, and a card
 * billed as `STD 12` is a joke the generator should not be telling. Also the agencies and leagues
 * a reader would take the letters for first.
 */
const TAKEN_INITIALS = new Set([
  'ASS',
  'ATF',
  'CIA',
  'DEA',
  'DUI',
  'FBI',
  'ICE',
  'IRS',
  'KKK',
  'LSD',
  'MLB',
  'MMA',
  'NBA',
  'NFL',
  'NHL',
  'NSA',
  'OMG',
  'STD',
  'WTF',
  'WWE',
]);

/**
 * The rungs named after a town, which must not share a place word.
 *
 * "Wichita Fighting Championship" and "Wichita Falls Showdown", or "Sioux Falls" and "Twin Falls"
 * in one world, read as one place counted twice — so a word of a place used by one feeder or local
 * show is off the table for the rest.
 */
const PLACE_RUNGS: ReadonlySet<PyramidRung> = new Set(['feeder', 'local']);

/** Enough draws that a clash on the last local show of a Large world is still vanishingly rare. */
const ATTEMPTS = 400;

/**
 * A namer for one world.
 *
 * Call it once per promotion, in pyramid order, with that promotion's rung. It remembers every
 * name it has handed out, which is how it keeps them unique.
 *
 * It also avoids reusing a place or a brand while it has fresh ones to draw: three shows called
 * "El Paso something" read as a generator, not as a city with a fight scene. Only once half the
 * attempts are spent may a head repeat, which is the base of a Large world running out of towns.
 */
export function createPromotionNamer(seed: string): (rung: PyramidRung) => PromotionIdentity {
  const root = createRng(`${seed}:promotion-names`);
  const streams = new Map<PyramidRung, Rng>();
  const names = new Set<string>();
  const shortNames = new Set<string>(TAKEN_INITIALS);
  const heads = new Set<string>();
  const placeWords = new Set<string>();
  const uses = new Map<string, number>();
  const leastUsed = (rung: PyramidRung): number =>
    Math.min(
      ...FORMS[rung].flatMap((f) => f.tails.map((tail) => uses.get(`${rung}:${tail.text}`) ?? 0)),
    );
  for (const real of [...PROMOTIONS_2026, ...SEED_PROMOTIONS]) {
    names.add(real.name);
    shortNames.add(real.shortName);
  }

  return (rung) => {
    let rng = streams.get(rung);
    if (!rng) {
      rng = root.fork(rung);
      streams.set(rung, rng);
    }
    const isPlace = PLACE_RUNGS.has(rung);
    for (let i = 0; i < ATTEMPTS; i++) {
      const { head, ending, ...identity } = candidate(rng, rung);
      if (names.has(identity.name) || shortNames.has(identity.shortName)) continue;
      const words = head.split(' ');
      const reused = heads.has(head) || (isPlace && words.some((w) => placeWords.has(w)));
      // Endings are dealt round evenly, so seventy local shows do not land on one word seven times.
      const key = `${rung}:${ending}`;
      const worn = (uses.get(key) ?? 0) > leastUsed(rung) + 1;
      if (worn && i < ATTEMPTS / 4) continue;
      if (reused && i < ATTEMPTS / 2) continue;
      uses.set(key, (uses.get(key) ?? 0) + 1);
      names.add(identity.name);
      shortNames.add(identity.shortName);
      heads.add(head);
      if (isPlace) for (const w of words) placeWords.add(w);
      return { ...identity, homeCity: homeCityFor(rung, head, identity.name) };
    }
    throw new Error(`Ran out of ${rung} promotion names for seed ${seed}`);
  };
}
