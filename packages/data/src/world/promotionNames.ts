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

import { createRng, type Rng } from '@mmasim/engine';
import { PROMOTIONS_2026 } from '../seed/organisations-2026.js';
import { SEED_PROMOTIONS } from '../seed/organisations.js';

/** The pyramid's rungs, as `generate.ts` labels them. */
export type PyramidRung = 'apex' | 'major' | 'national' | 'feeder' | 'local';

export interface PromotionIdentity {
  name: string;
  /** Initials, the way the sport abbreviates itself: what a card is numbered under. */
  shortName: string;
}

/** The second half of a name, and what it abbreviates to. */
interface Tail {
  text: string;
  abbr: string;
}

/** One way of building a name: any head, then any tail. */
interface Form {
  heads: readonly string[];
  tails: readonly Tail[];
}

const t = (text: string, abbr: string): Tail => ({ text, abbr });

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

const FORMS: Readonly<Record<PyramidRung, readonly Form[]>> = {
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
      heads: ['Iron Cage', 'Warpath', 'Redline', 'Ironside', 'Bloodline', 'Wildfire', 'Renegade'],
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
      heads: ['Rising Star', 'Next Level', 'Hard Knocks', 'New Blood', 'Breakout', 'Ground Zero'],
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
      ],
      tails: [
        t('Fight Night', 'FN'),
        t('Cage Classic', 'CC'),
        t('Throwdown', 'TD'),
        t('Fight Club', 'FC'),
        t('Cage Night', 'CN'),
        t('Showdown', 'SD'),
        t('Brawl', 'B'),
        t('Rumble', 'R'),
        t('Fight Factory', 'FF'),
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

function candidate(rng: Rng, rung: PyramidRung): PromotionIdentity & { head: string } {
  const forms = FORMS[rung];
  const form = rng.pickWeighted(forms, (f) => f.heads.length * f.tails.length);
  const head = rng.pick(form.heads);
  const tail = rng.pick(form.tails);
  return { head, name: `${head} ${tail.text}`, shortName: initials(head) + tail.abbr };
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
    for (let i = 0; i < ATTEMPTS; i++) {
      const { head, ...identity } = candidate(rng, rung);
      if (names.has(identity.name) || shortNames.has(identity.shortName)) continue;
      if (heads.has(head) && i < ATTEMPTS / 2) continue;
      names.add(identity.name);
      shortNames.add(identity.shortName);
      heads.add(head);
      return identity;
    }
    throw new Error(`Ran out of ${rung} promotion names for seed ${seed}`);
  };
}
