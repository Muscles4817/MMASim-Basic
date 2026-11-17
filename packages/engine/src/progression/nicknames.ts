/**
 * Fight nicknames: who gets one, and what it says.
 *
 * `generateFighter` never set `nickname`, so the only fighters in a generated world with one were
 * the ones the player typed in — measured, none of 844. A nickname is a small thing and it is one
 * of the two or three things a fan actually knows about a fighter, which is why a roster without
 * any reads as a spreadsheet however well the people underneath were rolled.
 *
 * Two ways in, both deterministic:
 *
 *  - **Arrival.** `rollNickname` at generation gives a minority of debutants one, more of them the
 *    older and the more highly rated, built from whatever is most noticeable about them: the
 *    signature attribute, the sport they came out of, the body, or the city.
 *  - **Earned.** `earnedNickname` lets a fighter without one pick one up from a highlight finish,
 *    which is how most nicknames in the sport actually arrive — the crowd names you after the
 *    night it saw you do the thing. That is also what pushes the share up among veterans and stars
 *    without anybody having to be told they are one.
 *
 * Stored, unlike almost everything else the fighter page reads, because an earned name is history
 * rather than a function of the fighter now. It is a few bytes on a minority of fighters.
 *
 * The pools deliberately avoid the famous real nicknames of the sport.
 */

import { clamp } from '../core/math.js';
import { hashSeed, type Rng } from '../core/rng.js';
import type { Sex } from '../domain/divisions.js';
import { isFinish, isKoMethod, type Fighter, type FightRecordEntry } from '../domain/fighter.js';
import type { AttributeKey, Attributes } from '../ratings/attributes.js';
import type { FighterBackground } from './background.js';
import type { Discipline } from './origin.js';

/**
 * Names for the thing a fighter is most obviously good at.
 *
 * Every attribute has a theme, and every name in this table appears exactly once in it. The pools
 * are long because the whole sport draws from them: a nickname has to be rare enough across a
 * world of two and a half thousand fighters that a player scrolling the rankings does not meet
 * the same Hammer in three divisions.
 */
const BY_ATTRIBUTE: Readonly<Record<AttributeKey, readonly string[]>> = {
  power: [
    'Dynamite',
    'The Hammer',
    'Sledgehammer',
    'Thunder',
    'Lights Out',
    'Heavy Hands',
    'TNT',
    'The Wrecking Ball',
    'Haymaker',
    'The Demolisher',
    'Nitro',
    'Boomstick',
    'The Hatchet',
    'Bazooka',
    'Cannonball',
    'The Mallet',
    'Big Bang',
    'Kaboom',
    'The Detonator',
    'Megaton',
    'One Punch',
    'Heavy Artillery',
    'The Piledriver',
    'Avalanche',
    'Earthquake',
    'Iron Fist',
    'Payload',
    'Thud',
    'The Wrecker',
    'Bombs Away',
  ],
  speed: [
    'Lightning',
    'Quicksilver',
    'Blur',
    'Whiplash',
    'The Hummingbird',
    'Flash Point',
    'Hot Wire',
    'The Viper',
    'Mercury',
    'Short Fuse',
    'Zip',
    'Jackrabbit',
    'The Hare',
    'Greased Lightning',
    'Turbo',
    'Afterburner',
    'Slipstream',
    'Velocity',
    'Bullet',
    'Rocket',
    'Zoom',
    'The Dart',
    'Hotfoot',
    'The Comet',
    'Twitch',
  ],
  kicking: [
    'The Axe',
    'The Scythe',
    'Roundhouse',
    'Thunderfoot',
    'The Whip',
    'Shin Bone',
    'The Sickle',
    'The Crane',
    'The Pendulum',
    'Headhunter',
    'The Machete',
    'The Cleaver',
    'The Windmill',
    'Tornado',
    'The Stork',
    'The Sweeper',
    'Spin Cycle',
    'Long Leg',
    'The Blade',
  ],
  strikingOffence: [
    'Buzzsaw',
    'The Metronome',
    'Rapid Fire',
    'The Jackhammer',
    'Machine Gun',
    'The Drummer',
    'Volume',
    'The Typewriter',
    'The Sewing Machine',
    'Woodpecker',
    'Hailstorm',
    'The Blender',
    'Combo',
    'Overload',
    'The Barrage',
    'Pitter Patter',
    'Fireworks',
    'Downpour',
    'Shotgun',
    'Pressure Cooker',
    'Firecracker',
  ],
  strikingDefence: [
    'The Ghost',
    'Untouchable',
    'The Matador',
    'Slick',
    'Smoke',
    'Shadow',
    'Mirage',
    'The Phantom',
    'Teflon',
    'Vapour',
    'The Mist',
    'The Illusionist',
    'Fog',
    'Silhouette',
    'Willow',
  ],
  wrestling: [
    'The Tractor',
    'The Freight Train',
    'The Plough',
    'The Snowplough',
    'Double Leg',
    'The Mule',
    'The Combine',
    'Bulldog',
    'The Steamroller',
    'Ankle Pick',
    'The Backhoe',
    'The Excavator',
    'The Locomotive',
    'The Farmhand',
    'Snatch Single',
    'The Hoover',
    'Mat Rat',
    'The Bear Hug',
  ],
  takedownDefence: [
    'The Sprawl',
    'Kickstand',
    'Rooted',
    'Tree Trunk',
    'Unmovable',
    'The Lighthouse',
    'Bedrock',
    'The Statue',
    'The Monument',
    'The Pylon',
    'Iron Hips',
    'The Fencepost',
  ],
  groundControl: [
    'The Blanket',
    'The Anvil',
    'Gravity',
    'Heavy Top',
    'The Weight',
    'Quicksand',
    'Wet Blanket',
    'The Paperweight',
    'Smother',
    'The Mattress',
    'Lead Blanket',
    'The Press',
    'The Pin',
    'Ballast',
    'The Duvet',
    'Cement',
    'Sandbag',
    'Dead Weight',
    'The Lid',
  ],
  submissions: [
    'The Python',
    'The Anaconda',
    'The Boa',
    'The Strangler',
    'The Octopus',
    'Silk',
    'Lockjaw',
    'The Pretzel',
    'Tapout',
    'The Kraken',
    'The Vine',
    'The Noose',
    'Choke Artist',
    'Leg Lock',
    'The Locksmith',
    'The Corkscrew',
    'Knots',
    'The Constrictor',
    'Sleeper',
    'The Tarantula',
    'Origami',
    'The Contortionist',
  ],
  scrambling: [
    'The Eel',
    'Slippery',
    'Rubber',
    'The Ferret',
    'The Weasel',
    'Greasy',
    'Jellyfish',
    'Wriggle',
    'The Otter',
    'Escape Artist',
    'The Squirrel',
    'The Lizard',
    'Rubber Band',
    'Elastic',
    'Tumbleweed',
  ],
  durability: [
    'Iron',
    'Granite',
    'Concrete',
    'The Wall',
    'Cast Iron',
    'Teak',
    'Oak',
    'The Anchor',
    'Cinderblock',
    'Brick Wall',
    'Steel',
    'Bulletproof',
    'Gristle',
    'Rawhide',
    'Old Leather',
    'The Cockroach',
    'Unbreakable',
    'Tungsten',
    'Ironside',
    'Hardcase',
    'The Bollard',
  ],
  cardio: [
    'The Engine',
    'Diesel',
    'The Motor',
    'Tireless',
    'Perpetual Motion',
    'Second Wind',
    'Clockwork',
    'The Treadmill',
    'Endless',
    'The Hamster',
    'Overtime',
    'The Long Haul',
    'Steam Engine',
    'The Distance',
    'Iron Lung',
    'Five Rounds',
    'Bottomless',
  ],
  strength: [
    'The Ox',
    'The Bull',
    'The Crusher',
    'Vice Grip',
    'The Forklift',
    'Iron Grip',
    'The Gorilla',
    'Grizzly',
    'Brute',
    'Atlas',
    'The Strongman',
    'Deadlift',
    'The Moose',
    'Bison',
    'The Winch',
    'Samson',
  ],
  fightIq: [
    'The Professor',
    'The Architect',
    'The Scholar',
    'Chess',
    'The Accountant',
    'Grandmaster',
    'The Strategist',
    'Brains',
    'The Engineer',
    'The Mathematician',
    'The Tactician',
    'Doc',
    'The General',
    'The Detective',
    'The Librarian',
  ],
  composure: [
    'Ice Water',
    'Cold Front',
    'The Calm',
    'Glacier',
    'Zen',
    'Stillwater',
    'Cool Hand',
    'Steady',
    'Frost',
    'The Monk',
    'Easy',
    'The Iceberg',
    'Deadpan',
    'Poker Face',
    'The Sphinx',
    'Unbothered',
    'Slow Burn',
  ],
};

/**
 * Names that fit more than one kind of fighter.
 *
 * Plenty of the best nicknames describe a *way of moving* rather than one skill: a Spider Monkey
 * could be a submission specialist who climbs all over people, a scrambler nobody can hold, or
 * just somebody very fast. Forcing each into one theme meant a fast grappler could never be one.
 * Each of these is offered to a fighter who stands out in *any* of its themes, and only in those —
 * so it still always says something true about whoever carries it.
 */
const CROSSOVER: readonly { name: string; themes: readonly AttributeKey[] }[] = [
  { name: 'The Spider Monkey', themes: ['submissions', 'scrambling', 'speed'] },
  { name: 'Houdini', themes: ['scrambling', 'strikingDefence'] },
  { name: 'The Cat', themes: ['scrambling', 'speed'] },
  { name: 'The Mongoose', themes: ['speed', 'strikingDefence'] },
  { name: 'The Cobra', themes: ['speed', 'power'] },
  { name: 'The Barracuda', themes: ['speed', 'power'] },
  { name: 'The Panther', themes: ['speed', 'power', 'kicking'] },
  { name: 'The Mantis', themes: ['kicking', 'strikingDefence'] },
  { name: 'The Scorpion', themes: ['kicking', 'submissions'] },
  { name: 'The Bulldozer', themes: ['wrestling', 'strength'] },
  { name: 'The Rhino', themes: ['strength', 'durability'] },
  { name: 'The Honey Badger', themes: ['durability', 'cardio'] },
  { name: 'The Wolverine', themes: ['durability', 'scrambling'] },
  { name: 'The Tortoise', themes: ['durability', 'cardio', 'composure'] },
  { name: 'The Grinder', themes: ['cardio', 'wrestling'] },
  { name: 'The Surgeon', themes: ['fightIq', 'strikingOffence'] },
  { name: 'The Sniper', themes: ['strikingOffence', 'fightIq', 'composure'] },
  { name: 'The Boa Constrictor', themes: ['submissions', 'groundControl'] },
  { name: 'Velcro', themes: ['groundControl', 'wrestling'] },
  { name: 'The Glue', themes: ['groundControl', 'scrambling'] },
  { name: 'The Chameleon', themes: ['fightIq', 'scrambling'] },
  { name: 'Rattlesnake', themes: ['speed', 'submissions'] },
  { name: 'The Oak Tree', themes: ['takedownDefence', 'durability'] },
  { name: 'The Badger', themes: ['wrestling', 'durability'] },
  { name: 'Ice Pick', themes: ['composure', 'power'] },
];

/**
 * Every name offered for one attribute: its own theme plus the crossovers that list it.
 *
 * Built once. A crossover sits in several of these, which is the point — and why
 * `nicknamePoolOf` takes the union rather than "the" pool a name belongs to.
 */
const ATTRIBUTE_POOLS: ReadonlyMap<AttributeKey, readonly string[]> = new Map(
  (Object.keys(BY_ATTRIBUTE) as AttributeKey[]).map((key) => [
    key,
    [...BY_ATTRIBUTE[key], ...CROSSOVER.filter((c) => c.themes.includes(key)).map((c) => c.name)],
  ]),
);

/** The names offered for one attribute. Every key is in the map; the fallback is for the type. */
const attributePool = (key: AttributeKey): readonly string[] =>
  ATTRIBUTE_POOLS.get(key) ?? BY_ATTRIBUTE[key];

/** Names for where they came from. Only the more decorated rungs earn one. */
const BY_DISCIPLINE: Readonly<Record<Discipline, readonly string[]>> = {
  boxing: [
    'Golden Gloves',
    'The Jab',
    'Pug',
    'The Counterpuncher',
    'The Ring General',
    'Southside',
    'Stiff Jab',
    'Body Shot',
    'The Uppercut',
  ],
  kickboxing: ['Elbows', 'The Clinch', 'Muay Thai', 'Eight Limbs', 'Knees', 'Teep', 'The Nak Muay'],
  karate: ['Sensei', 'Kata', 'The Black Belt', 'Dojo', 'Kumite', 'Kiai', 'The Point Fighter'],
  wrestling: ['Singlet', 'The Grappler', 'Two Points', 'Headgear', 'Mat Burn', 'The Varsity'],
  jiuJitsu: ['Black Belt', 'Gi', 'The Spiderweb', 'Guard', 'Berimbolo', 'The Rubber Guard'],
  judo: ['The Judoka', 'Ippon', 'The Throw', 'Uchi Mata', 'Seoi Nage', 'Tatami'],
  sprints: ['Starting Gun', 'The Sprinter', 'Jet', 'Photo Finish', 'The Blocks', 'Hundred Metres'],
  throws: ['The Discus', 'Shot Put', 'The Hammer Thrower', 'The Javelin'],
  contactSport: ['The Linebacker', 'The Prop', 'Tackle', 'Blitz', 'The Scrum', 'Touchdown'],
  rowing: ['The Oar', 'Stroke', 'Coxswain', 'The Regatta'],
  distanceRunning: ['The Marathon', 'Long Distance', 'Miles', 'Twenty-Six', 'The Harrier'],
};

const LONG = [
  'Wingspan',
  'Long Arm',
  'The Rangefinder',
  'Telescope',
  'Spider Arms',
  'The Albatross',
  'Stretch',
  'The Giraffe',
  'Daddy Longlegs',
  'The Yardstick',
  'Tentacles',
  'The Boom',
  'Lanky',
  'The Rake',
];
const THICK = [
  'The Tank',
  'The Fridge',
  'Brick House',
  'The Boulder',
  'The Vault',
  'The Wardrobe',
  'The Safe',
  'Big Unit',
  'The Bunker',
  'Barrel',
  'The Silo',
  'Fortress',
  'The Dumpster',
  'Double Wide',
];
const LEFTY = [
  'Lefty',
  'The Southpaw',
  'Wrong Way',
  'Port Side',
  'Mirror Image',
  'Lefthander',
  'Sinister',
  'Backwards',
  'Upside Down',
  'The Odd Angle',
  'Left Field',
  'Opposite Lock',
];
/** For the fighters still going in their mid-thirties. A name the sport gives out of respect. */
const VETERAN = [
  'Old School',
  'The Veteran',
  'Silverback',
  'Grey Wolf',
  'The Elder',
  'Old Faithful',
];
const OLYMPIAN = ['The Olympian', 'Gold Medal', 'The Flag Bearer'];
const HOME = [
  (c: string) => `The Pride of ${c}`,
  (c: string) => `The ${c} Kid`,
  (c: string) => `${c}'s Finest`,
];

export interface NicknameInput {
  attributes: Attributes;
  /** What "ordinary" is for each attribute, as `traitReferenceFor` gives it. Defaults to 50. */
  reference?: Readonly<Partial<Record<AttributeKey, number>>>;
  background?: FighterBackground;
  heightInches: number;
  reachInches: number;
  /** Muscle index from `Physique`, ~N(50, 16). */
  muscleIndex: number;
  stance: Fighter['stance'];
  /** `hometownOf(fighter)`, so a city name agrees with the origin line on the fighter page. */
  hometown?: string;
  sex: Sex;
  age: number;
  /** The generator's 1–100 prospect tier, when known. */
  tier?: number;
}

/**
 * Every theme that genuinely applies to this fighter, weighted by how strongly it does.
 *
 * The signature attribute dominates because that is what fans name people after; the others are
 * there so the roster is not forty Hammers and an Anaconda.
 */
function themes(input: NicknameInput): { names: readonly string[]; weight: number }[] {
  const out: { names: readonly string[]; weight: number }[] = [];

  for (const [key, names] of ATTRIBUTE_POOLS) {
    const lead = input.attributes[key] - (input.reference?.[key] ?? 50);
    if (lead >= 10) out.push({ names, weight: lead });
  }

  const bg = input.background;
  if (bg && (bg.attainment === 'national' || bg.attainment === 'world')) {
    out.push({ names: BY_DISCIPLINE[bg.discipline], weight: bg.attainment === 'world' ? 24 : 12 });
    if (bg.attainment === 'world') out.push({ names: OLYMPIAN, weight: 10 });
  }

  if (input.reachInches - input.heightInches >= 4) out.push({ names: LONG, weight: 12 });
  if (input.muscleIndex >= 72) out.push({ names: THICK, weight: 10 });
  if (input.stance === 'southpaw') out.push({ names: LEFTY, weight: 4 });
  if (input.age >= 34) out.push({ names: VETERAN, weight: 8 });

  if (input.hometown) out.push({ names: HOME.map((h) => h(input.hometown!)), weight: 6 });
  return out;
}

function pickFromThemes(rng: Rng, input: NicknameInput): string | undefined {
  const options = themes(input);
  if (options.length === 0) return undefined;
  return rng.pick(rng.pickWeighted(options, (t) => t.weight).names);
}

/**
 * How likely a fighter is to arrive already carrying a name.
 *
 * Three in ten 22-year-olds and over two in five 30-year-olds, a little more for the highly
 * rated, capped. The earned path tops this up over a career.
 */
export function nicknameChance(age: number, tier = 45): number {
  return clamp(0.3 + 0.02 * (age - 22) + Math.max(0, tier - 60) * 0.005, 0.2, 0.6);
}

/** A nickname for a debutant, or undefined. Pass a forked stream: the draw count varies. */
export function rollNickname(rng: Rng, input: NicknameInput): string | undefined {
  if (!rng.chance(nicknameChance(input.age, input.tier))) return undefined;
  return pickFromThemes(rng, input);
}

/** Whether a result is the kind of night a crowd names somebody after. */
export function isHighlightFinish(entry: FightRecordEntry): boolean {
  if (entry.outcome !== 'win' || !isFinish(entry.method)) return false;
  return (
    entry.wasTitleFight ||
    entry.bonus === 'performance' ||
    (entry.round === 1 && entry.timeSeconds <= 90)
  );
}

/**
 * The nickname a highlight finish earns, if it earns one.
 *
 * Named after what the crowd just saw — a knockout earns a power name, a submission a grappler's —
 * and more likely for somebody people were already watching. Undefined for anybody who already has
 * a name: a fighter keeps the one they arrived with.
 */
export function earnedNickname(
  fighter: Pick<Fighter, 'nickname' | 'starPower'>,
  entry: FightRecordEntry,
  rng: Rng,
): string | undefined {
  if (fighter.nickname || !isHighlightFinish(entry)) return undefined;
  if (!rng.chance(clamp(0.3 + fighter.starPower / 200, 0.3, 0.75))) return undefined;
  const pool = isKoMethod(entry.method)
    ? attributePool('power')
    : entry.method === 'submission'
      ? attributePool('submissions')
      : attributePool('cardio');
  return rng.pick(pool);
}

// --- One of each per division ----------------------------------------------------------------

const POOLS: readonly (readonly string[])[] = [
  ...ATTRIBUTE_POOLS.values(),
  ...Object.values(BY_DISCIPLINE),
  LONG,
  THICK,
  LEFTY,
  VETERAN,
  OLYMPIAN,
];

/**
 * Every name a theme table can produce, each once — so a test can hold the tables to "no name in
 * two places" and to staying clear of the sport's famous real nicknames.
 */
export const NICKNAME_SOURCES: readonly string[] = [
  ...Object.values(BY_ATTRIBUTE).flat(),
  ...CROSSOVER.map((c) => c.name),
  ...Object.values(BY_DISCIPLINE).flat(),
  ...LONG,
  ...THICK,
  ...LEFTY,
  ...VETERAN,
  ...OLYMPIAN,
];

/** The attribute themes a crossover name is offered under. Empty for every other name. */
export function crossoverThemesOf(name: string): readonly AttributeKey[] {
  return CROSSOVER.find((c) => c.name === name)?.themes ?? [];
}

/**
 * The theme a nickname came from, so a taken name can be swapped for its nearest neighbour.
 *
 * A hometown name's alternatives are the other ways of saying *that* city — two fighters from Hat
 * Yai in one division can be "The Pride of Hat Yai", "The Hat Yai Kid" and "Hat Yai's Finest",
 * never two of any. A crossover's alternatives are every theme it belongs to, merged: a taken
 * Spider Monkey can become another grappler's name or another speedster's. A name in no pool (one
 * the player typed, or a seeded fighter's real one) has no alternatives.
 */
export function nicknamePoolOf(name: string): readonly string[] {
  const home =
    /^The Pride of (.+)$/.exec(name) ?? /^The (.+) Kid$/.exec(name) ?? /^(.+)'s Finest$/.exec(name);
  if (home) return HOME.map((h) => h(home[1]!));
  const pools = POOLS.filter((pool) => pool.includes(name));
  return pools.length === 0 ? [name] : [...new Set(pools.flat())];
}

/**
 * This name if nobody it would be confused with has it, else a free one from the same theme.
 *
 * Undefined when the theme is spent, which is the right answer: a fighter without a nickname is
 * ordinary, and two well-known fighters in one division called "TNT" breaks the illusion. The walk
 * starts at a point fixed by the fighter's id, so it is deterministic and does not hand every
 * collision the same second choice.
 */
export function uniqueNickname(
  name: string,
  fighterId: string,
  taken: ReadonlySet<string>,
): string | undefined {
  if (!taken.has(name)) return name;
  const pool = nicknamePoolOf(name);
  const start = hashSeed(fighterId) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length]!;
    if (!taken.has(candidate)) return candidate;
  }
  return undefined;
}

/** Nicknames already worn by active fighters in a division. What `uniqueNickname` checks against. */
export function nicknamesTaken(
  fighters: readonly Pick<Fighter, 'nickname' | 'divisionId' | 'retiredDay'>[],
  divisionId: Fighter['divisionId'],
): Set<string> {
  const out = new Set<string>();
  for (const f of fighters) {
    if (f.nickname && f.divisionId === divisionId && f.retiredDay === undefined)
      out.add(f.nickname);
  }
  return out;
}

/**
 * Make every active fighter's nickname unique within their division.
 *
 * Generation rolls each fighter alone, so it cannot know who else is in the room — this is the pass
 * that does, run once over a roster as it is assembled. Order is deterministic: hand-authored
 * fighters (no generated background) keep theirs first, because a real fighter's real nickname is a
 * fact, then everybody else in id order. Stored rather than derived on read for the same reason the
 * nickname itself is: an earned name is history, and the de-duplicated one has to be the one the
 * news already printed.
 */
export function dedupeNicknames<F extends Fighter>(fighters: readonly F[]): F[] {
  const order = fighters
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.nickname && f.retiredDay === undefined)
    .sort(
      (a, b) =>
        Number(a.f.background !== undefined) - Number(b.f.background !== undefined) ||
        (a.f.id < b.f.id ? -1 : a.f.id > b.f.id ? 1 : 0),
    );

  const taken = new Map<string, Set<string>>();
  const out = [...fighters];
  for (const { f, i } of order) {
    const division = f.divisionId as string;
    const names = taken.get(division) ?? new Set<string>();
    taken.set(division, names);
    const name = uniqueNickname(f.nickname!, f.id as string, names);
    if (name) names.add(name);
    if (name === f.nickname) continue;
    out[i] = { ...f, nickname: name };
    if (!name) delete out[i]!.nickname;
  }
  return out;
}
