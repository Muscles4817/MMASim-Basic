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
 * Every name appears in exactly one pool, because `nicknamePoolOf` finds a taken name's
 * alternatives by looking it up — and the pools are long enough that a division can hand out a
 * dozen from one theme before `uniqueNickname` runs out and leaves somebody without one.
 */
const BY_ATTRIBUTE: Readonly<Partial<Record<AttributeKey, readonly string[]>>> = {
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
  ],
  kicking: [
    'The Axe',
    'The Scythe',
    'Roundhouse',
    'Thunderfoot',
    'The Whip',
    'Shin Bone',
    'The Sickle',
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
  ],
  strikingDefence: [
    'The Ghost',
    'Untouchable',
    'The Matador',
    'Slick',
    'Smoke',
    'Shadow',
    'Mirage',
  ],
  wrestling: [
    'The Bulldozer',
    'The Tractor',
    'The Freight Train',
    'The Plough',
    'The Snowplough',
    'Double Leg',
    'The Mule',
  ],
  groundControl: ['The Blanket', 'The Anvil', 'Gravity', 'Heavy Top', 'The Weight', 'Quicksand'],
  submissions: [
    'The Python',
    'The Anaconda',
    'The Boa',
    'The Strangler',
    'The Octopus',
    'Silk',
    'The Spider Monkey',
    'Lockjaw',
    'The Pretzel',
    'Tapout',
  ],
  scrambling: ['The Eel', 'Houdini', 'Slippery', 'The Cat', 'Rubber', 'The Ferret'],
  durability: ['Iron', 'Granite', 'Concrete', 'The Wall', 'Cast Iron', 'Teak', 'Oak', 'The Anchor'],
  cardio: [
    'The Engine',
    'Diesel',
    'The Motor',
    'Tireless',
    'Perpetual Motion',
    'Second Wind',
    'Clockwork',
  ],
  strength: ['The Ox', 'The Bull', 'The Crusher', 'Vice Grip', 'The Forklift', 'Iron Grip'],
  fightIq: [
    'The Professor',
    'The Architect',
    'The Surgeon',
    'The Scholar',
    'Chess',
    'The Accountant',
  ],
  composure: ['Ice Water', 'Cold Front', 'The Calm', 'Glacier', 'Zen', 'Stillwater'],
};

/** Names for where they came from. Only the more decorated rungs earn one. */
const BY_DISCIPLINE: Readonly<Record<Discipline, readonly string[]>> = {
  boxing: ['Golden Gloves', 'The Jab', 'Pug', 'The Counterpuncher', 'The Ring General'],
  kickboxing: ['Elbows', 'The Clinch', 'Muay Thai', 'Eight Limbs'],
  karate: ['Sensei', 'Kata', 'The Black Belt', 'Dojo'],
  wrestling: ['Singlet', 'The Grappler', 'Two Points', 'Headgear'],
  jiuJitsu: ['Black Belt', 'Gi', 'The Spiderweb', 'Guard'],
  judo: ['The Judoka', 'Ippon', 'The Throw', 'Uchi Mata'],
  sprints: ['Starting Gun', 'The Sprinter', 'Jet', 'Photo Finish'],
  throws: ['The Discus', 'Shot Put', 'The Hammer Thrower'],
  contactSport: ['The Linebacker', 'The Prop', 'Tackle', 'Blitz'],
  rowing: ['The Oar', 'Stroke', 'Coxswain'],
  distanceRunning: ['The Marathon', 'Long Distance', 'Miles', 'Twenty-Six'],
};

const LONG = ['Wingspan', 'Long Arm', 'The Rangefinder', 'Telescope'];
const THICK = ['The Tank', 'The Fridge', 'Brick House', 'The Boulder', 'The Vault'];
const LEFTY = ['Lefty', 'The Southpaw', 'Wrong Way', 'Port Side'];
const OLYMPIAN = ['The Olympian'];
const HOME = [(c: string) => `The Pride of ${c}`, (c: string) => `The ${c} Kid`];

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

  for (const [key, names] of Object.entries(BY_ATTRIBUTE) as [AttributeKey, string[]][]) {
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
    ? BY_ATTRIBUTE.power!
    : entry.method === 'submission'
      ? BY_ATTRIBUTE.submissions!
      : BY_ATTRIBUTE.cardio!;
  return rng.pick(pool);
}

// --- One of each per division ----------------------------------------------------------------

const POOLS: readonly (readonly string[])[] = [
  ...Object.values(BY_ATTRIBUTE),
  ...Object.values(BY_DISCIPLINE),
  LONG,
  THICK,
  LEFTY,
  OLYMPIAN,
];

/**
 * The theme a nickname came from, so a taken name can be swapped for its nearest neighbour.
 *
 * A hometown name's alternatives are the other ways of saying *that* city — two fighters from Hat
 * Yai in one division can be "The Pride of Hat Yai" and "The Hat Yai Kid", never two of either.
 * A name in no pool (one the player typed, or a seeded fighter's real one) has no alternatives.
 */
export function nicknamePoolOf(name: string): readonly string[] {
  const home = /^The Pride of (.+)$/.exec(name) ?? /^The (.+) Kid$/.exec(name);
  if (home) return HOME.map((h) => h(home[1]!));
  return POOLS.find((pool) => pool.includes(name)) ?? [name];
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

/**
 * The nickname a fighter keeps on arriving in a division: theirs, unless somebody there already
 * answers to it. Doc 34 C6 — a fighter moving division must not bring a name that is taken; the
 * one who was there first keeps it.
 */
export function nicknameOnArrival(
  nickname: string | undefined,
  taken: ReadonlySet<string>,
): string | undefined {
  return nickname !== undefined && taken.has(nickname) ? undefined : nickname;
}
