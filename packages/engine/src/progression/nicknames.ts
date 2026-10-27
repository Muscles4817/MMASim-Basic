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
import type { Rng } from '../core/rng.js';
import type { Sex } from '../domain/divisions.js';
import { isFinish, isKoMethod, type Fighter, type FightRecordEntry } from '../domain/fighter.js';
import type { AttributeKey, Attributes } from '../ratings/attributes.js';
import type { FighterBackground } from './background.js';
import type { Discipline } from './origin.js';

/** Names for the thing a fighter is most obviously good at. */
const BY_ATTRIBUTE: Readonly<Partial<Record<AttributeKey, readonly string[]>>> = {
  power: ['Dynamite', 'The Hammer', 'Sledgehammer', 'Thunder', 'Lights Out', 'Heavy Hands', 'TNT'],
  speed: ['Lightning', 'Quicksilver', 'Blur', 'Whiplash', 'The Hummingbird', 'Jet'],
  kicking: ['The Axe', 'The Scythe', 'Roundhouse', 'Thunderfoot', 'The Whip'],
  strikingOffence: ['Buzzsaw', 'The Metronome', 'Rapid Fire', 'The Jackhammer', 'Machine Gun'],
  strikingDefence: ['The Ghost', 'Untouchable', 'The Matador', 'Slick', 'Smoke'],
  wrestling: ['The Bulldozer', 'The Tractor', 'The Freight Train', 'The Plough'],
  groundControl: ['The Blanket', 'The Anvil', 'Gravity', 'Heavy Top'],
  submissions: ['The Python', 'The Anaconda', 'The Boa', 'The Strangler', 'The Octopus', 'Silk'],
  scrambling: ['The Eel', 'Houdini', 'Slippery', 'The Cat'],
  durability: ['Iron', 'Granite', 'Concrete', 'The Wall', 'Cast Iron', 'Teak'],
  cardio: ['The Engine', 'Diesel', 'The Motor', 'Tireless', 'Perpetual Motion'],
  strength: ['The Ox', 'The Bull', 'The Crusher', 'Vice Grip'],
  fightIq: ['The Professor', 'The Architect', 'The Surgeon', 'The Scholar', 'Chess'],
  composure: ['Ice Water', 'Cold Front', 'The Calm', 'Glacier', 'Zen'],
};

/** Names for where they came from. Only the more decorated rungs earn one. */
const BY_DISCIPLINE: Readonly<Record<Discipline, readonly string[]>> = {
  boxing: ['Golden Gloves', 'The Jab', 'Pug'],
  kickboxing: ['Elbows', 'The Clinch', 'Muay Thai'],
  karate: ['Sensei', 'Kata', 'Black Belt'],
  wrestling: ['Singlet', 'The Grappler', 'Two Points'],
  jiuJitsu: ['Black Belt', 'Gi', 'The Spiderweb'],
  judo: ['The Judoka', 'Ippon', 'The Throw'],
  sprints: ['Starting Gun', 'The Sprinter', 'Jet'],
  throws: ['The Discus', 'Shot Put'],
  contactSport: ['The Linebacker', 'The Prop', 'Tackle', 'The Tank'],
  rowing: ['The Oar', 'Stroke'],
  distanceRunning: ['The Marathon', 'Long Distance', 'Miles'],
};

const LONG = ['Wingspan', 'Long Arm', 'Stretch', 'The Tower'];
const THICK = ['The Tank', 'The Fridge', 'Brick House', 'The Boulder'];
const LEFTY = ['Lefty', 'The Southpaw'];
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
    if (bg.attainment === 'world') out.push({ names: ['The Olympian'], weight: 10 });
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
