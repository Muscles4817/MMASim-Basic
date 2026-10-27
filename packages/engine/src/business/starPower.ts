/**
 * Star power, read the way a promoter reads it. Doc 34 C2.
 *
 * `starPower` drives the gate, the purse, sponsorship, patience and leverage — it is the number the
 * business layer turns on more than any other — and the promoter's screens never showed it. A
 * matchmaker who cannot see who sells is booking blind, and the picker, the fighter page and the
 * card builder all had the same hole.
 *
 * Same rule as `abilityRead`: **a class and a sentence, never the number**. Two promoters should be
 * able to look at the same fighter and argue about whether they can headline, and an integer ends
 * that argument before it starts.
 *
 * Everything here is derived, nothing stored. The trend is read off the recent record using the
 * same weights `aftermath.ts` moves star power by, the persona off the personality axes, traits and
 * the record, the home market off nationality — so all three change as the simulation moves the
 * fighter, and none of them can drift out of step with what actually happened.
 */

import type { GameDay } from '../core/clock.js';
import {
  careerSummary,
  fighterAge,
  type Fighter,
  type FightRecordEntry,
} from '../domain/fighter.js';
import { starPerformanceValue } from './aftermath.js';

// --- How much they sell ----------------------------------------------------------------------------

export type DrawClass = 'headliner' | 'mainCard' | 'knownName' | 'following' | 'unknown';

const DRAW_BANDS: readonly { klass: DrawClass; floor: number; label: string; blurb: string }[] = [
  {
    klass: 'headliner',
    floor: 70,
    label: 'Headliner',
    blurb: 'Sells a card on their own name. People buy the night to see them.',
  },
  {
    klass: 'mainCard',
    floor: 50,
    label: 'Main-card draw',
    blurb: 'A name the audience recognises. Lifts any fight they are in.',
  },
  {
    klass: 'knownName',
    floor: 30,
    label: 'Known name',
    blurb: 'The hardcore know them. Worth something on a poster, not the top of it.',
  },
  {
    klass: 'following',
    floor: 15,
    label: 'Building a following',
    blurb: 'Starting to be noticed. A good night in front of people moves this quickly.',
  },
  {
    klass: 'unknown',
    floor: 0,
    label: 'Unknown',
    blurb: 'Nobody is buying a ticket for them yet.',
  },
];

/** Where an audience starts to exist at all: the floor of the "Building a following" band. */
const FOLLOWING_FLOOR = DRAW_BANDS.find((b) => b.klass === 'following')!.floor;

// --- Which way it is going -------------------------------------------------------------------------

export type StarTrendId = 'rising' | 'steady' | 'fading';

export interface StarTrend {
  id: StarTrendId;
  label: string;
  /** One line on why. */
  detail: string;
  /** A glyph for compact rows: ↑ → ↓. Always paired with `label` in an accessible name. */
  arrow: string;
}

/** How far back a fight still moves the crowd. */
const TREND_WINDOW_DAYS = 540;
/** Out of sight for this long and the audience starts forgetting. */
const FORGOTTEN_AFTER_DAYS = 365;

/**
 * Trend-only extras on top of what the aftermath moves star power by. A bonus and a title win are
 * the nights a following grows fastest, and the trend should read them as such; star power itself
 * gets them through the opponent's value and the card, so they are not added there.
 */
export const TREND_BONUS_EXTRA = 2;
export const TREND_TITLE_EXTRA = 3;

/**
 * What a result does to a following: `starPerformanceValue` — the one function `aftermath.ts`
 * moves `starPower` by — plus the trend-only extras for a winning bonus or title night. Read off
 * the record rather than stored as a history, so the trend follows what actually happened.
 */
export function starMomentum(entry: FightRecordEntry): number {
  const won = entry.outcome === 'win';
  const base = starPerformanceValue(won, entry.method);
  if (!won) return base;
  return (
    base + (entry.bonus ? TREND_BONUS_EXTRA : 0) + (entry.wasTitleFight ? TREND_TITLE_EXTRA : 0)
  );
}

export function starTrend(fighter: Pick<Fighter, 'record'>, day: GameDay): StarTrend {
  const last = fighter.record[fighter.record.length - 1];
  if (!last) {
    return {
      id: 'steady',
      label: 'Steady',
      detail: 'Nothing fought here yet to read a direction from.',
      arrow: '→',
    };
  }
  if (day - last.day > FORGOTTEN_AFTER_DAYS) {
    return {
      id: 'fading',
      label: 'Fading',
      detail: `Out of sight for ${Math.round((day - last.day) / 30)} months. The audience moves on.`,
      arrow: '↓',
    };
  }
  const recent = fighter.record.filter((r) => day - r.day <= TREND_WINDOW_DAYS).slice(-3);
  const momentum = recent.reduce((sum, r) => sum + starMomentum(r), 0);
  if (momentum >= 14) {
    return {
      id: 'rising',
      label: 'Rising',
      detail: 'Winning in a way people remember. The following is growing fight by fight.',
      arrow: '↑',
    };
  }
  if (momentum < 0) {
    return {
      id: 'fading',
      label: 'Fading',
      detail: 'Recent losses are costing them the audience they had.',
      arrow: '↓',
    };
  }
  return {
    id: 'steady',
    label: 'Steady',
    detail: 'Holding the following they have. Nothing lately has moved it much.',
    arrow: '→',
  };
}

// --- Who they are to the crowd ---------------------------------------------------------------------

export type PersonaId =
  'heel' | 'fanFavourite' | 'quietKiller' | 'showman' | 'grinder' | 'warhorse' | 'professional';

export interface Persona {
  id: PersonaId;
  label: string;
  blurb: string;
}

const PERSONAS: Readonly<Record<PersonaId, Omit<Persona, 'id'>>> = {
  heel: {
    label: 'Heel',
    blurb: 'People buy tickets hoping to see them lose. That still sells.',
  },
  fanFavourite: {
    label: 'Fan favourite',
    blurb: 'Likeable and easy to back. The crowd is on their side before the bell.',
  },
  quietKiller: {
    label: 'Quiet killer',
    blurb: 'Says nothing and finishes people. Sells on highlight reels, not microphones.',
  },
  showman: {
    label: 'Showman',
    blurb: 'Knows where the cameras are. Makes any fight feel bigger than it is.',
  },
  grinder: {
    label: 'Grinder',
    blurb: 'Wins rounds rather than fans. Hard to beat and harder to sell.',
  },
  warhorse: {
    label: 'Old warhorse',
    blurb: 'Been in with everybody. The name is worth something even when the legs are not.',
  },
  professional: {
    label: 'Professional',
    blurb: 'No act. Turns up, fights, goes home — the audience takes them as they find them.',
  },
};

const persona = (id: PersonaId): Persona => ({ id, ...PERSONAS[id] });

/** Where each persona starts. Axis values are the 1–100 personality scale. */
export const PERSONA_THRESHOLDS = {
  heelEgo: 65,
  heelCharisma: 60,
  heelAggression: 55,
  /** Charisma that sells on its own: fan favourite if humble, showman if not. */
  magnetic: 62,
  humbleEgo: 55,
  /** Charisma below which somebody says nothing anyone remembers. */
  quiet: 40,
  /** Charisma below which a grinder does not sell. */
  plain: 50,
  finisherWins: 4,
  finishRate: 0.6,
  grinderWins: 5,
  decisionRate: 0.6,
  warhorseAge: 34,
  warhorseBouts: 20,
} as const;

/**
 * Who this fighter is to an audience.
 *
 * Emergent like `dispositionsOf`: nothing sets "Heel", the axes and the record produce it. Ordered
 * most-specific first, returning the first that fits.
 */
export function personaOf(
  fighter: Pick<Fighter, 'personality' | 'traits' | 'record' | 'priorRecord' | 'birthDay'>,
  day: GameDay,
): Persona {
  const p = fighter.personality;
  const s = careerSummary(fighter);
  const bouts = s.wins + s.losses + s.draws;
  const finishRate = s.wins > 0 ? (s.koWins + s.submissionWins) / s.wins : 0;
  const decisionRate = s.wins > 0 ? s.decisionWins / s.wins : 0;

  const t = PERSONA_THRESHOLDS;
  if (
    fighter.traits.includes('trashTalker') ||
    (p.ego >= t.heelEgo && p.charisma >= t.heelCharisma && p.aggression >= t.heelAggression)
  ) {
    return persona('heel');
  }
  if (p.charisma >= t.magnetic && p.ego < t.humbleEgo) return persona('fanFavourite');
  if (p.charisma < t.quiet && s.wins >= t.finisherWins && finishRate >= t.finishRate) {
    return persona('quietKiller');
  }
  if (p.charisma >= t.magnetic) return persona('showman');
  if (s.wins >= t.grinderWins && decisionRate >= t.decisionRate && p.charisma < t.plain) {
    return persona('grinder');
  }
  if (fighterAge(fighter, day) >= t.warhorseAge && bouts >= t.warhorseBouts) {
    return persona('warhorse');
  }
  return persona('professional');
}

// --- The whole read --------------------------------------------------------------------------------

export interface DrawRead {
  klass: DrawClass;
  label: string;
  blurb: string;
  /** 0–1, coarse by construction — one value per class, so it cannot be read back as a number. */
  fill: number;
  trend: StarTrend;
  persona: Persona;
  /** Where they sell best. */
  homeMarket: string;
  /**
   * True when the market being asked about is their own: sponsorship pays 1.8× at home
   * (`sponsorshipIncome`) and a home fighter is keener on the date (`localMarket` in the plans).
   */
  atHome?: boolean;
}

/** The parts of a fighter the draw reads. */
export type SellingFighter = Pick<
  Fighter,
  | 'starPower'
  | 'nationality'
  | 'personality'
  | 'traits'
  | 'record'
  | 'priorRecord'
  | 'birthDay'
  | 'lastName'
>;

export function drawRead(
  fighter: Omit<SellingFighter, 'lastName'>,
  day: GameDay,
  /** The country of the card or promotion being asked about, if there is one. */
  market?: string,
): DrawRead {
  const band =
    DRAW_BANDS.find((b) => fighter.starPower >= b.floor) ?? DRAW_BANDS[DRAW_BANDS.length - 1]!;
  const index = DRAW_BANDS.indexOf(band);
  return {
    klass: band.klass,
    label: band.label,
    blurb: band.blurb,
    fill: (DRAW_BANDS.length - index) / DRAW_BANDS.length,
    trend: starTrend(fighter, day),
    persona: personaOf(fighter, day),
    homeMarket: fighter.nationality,
    atHome: market === undefined ? undefined : market === fighter.nationality,
  };
}

// --- What a fight sells ----------------------------------------------------------------------------

export interface FightSell {
  /** The one line for a picker row. */
  headline: string;
  /** Every hook that applies, strongest first. */
  hooks: readonly string[];
}

/**
 * What putting these two in a cage sells, in words.
 *
 * Written for the matchmaking picker: the promoter is choosing an opponent and the question on
 * every row is not "who is better" — the ability band answers that — but "what am I selling". So
 * this names the hook rather than scoring it: a belt, bad blood, a name, a villain, a hometown.
 * The draw itself is `drawWeight`'s business; this is the sentence on the poster.
 */
export function fightSells(input: {
  a: SellingFighter;
  b: SellingFighter;
  day: GameDay;
  market?: string;
  isTitleFight?: boolean;
  /** 0–100 rivalry heat between them, when there is any. */
  heat?: number;
}): FightSell {
  const { a, b, day, market, isTitleFight = false, heat = 0 } = input;
  const ra = drawRead(a, day, market);
  const rb = drawRead(b, day, market);
  const hooks: string[] = [];

  if (isTitleFight) hooks.push('A belt on the line');
  if (heat >= 60) hooks.push('Genuine bad blood');
  else if (heat >= 35) hooks.push('Some history between them');

  const names = [ra, rb].filter((r) => r.klass === 'headliner' || r.klass === 'mainCard').length;
  if (names === 2) hooks.push('Two names people know');
  else if (names === 1) {
    const [star] = ra.klass === 'headliner' || ra.klass === 'mainCard' ? [a] : [b];
    hooks.push(`${star.lastName}’s name carries it`);
  }

  const heel = [ra, rb].some((r) => r.persona.id === 'heel');
  const hero = [ra, rb].some((r) => r.persona.id === 'fanFavourite');
  if (heel && hero) hooks.push('A villain to boo and a favourite to back');
  else if (heel) hooks.push('Somebody the crowd wants beaten');

  const finishers = [a, b].filter((f) => {
    const s = careerSummary(f);
    return (
      s.wins >= PERSONA_THRESHOLDS.finisherWins &&
      (s.koWins + s.submissionWins) / s.wins >= PERSONA_THRESHOLDS.finishRate
    );
  }).length;
  if (finishers === 2) hooks.push('Two finishers — unlikely to go the distance');

  if (
    (ra.trend.id === 'rising' && rb.trend.id === 'fading') ||
    (rb.trend.id === 'rising' && ra.trend.id === 'fading')
  ) {
    hooks.push('The one coming up against the one on the way down');
  } else if (ra.trend.id === 'rising' && rb.trend.id === 'rising') {
    hooks.push('Two on the rise — one of them stops here');
  }

  if (ra.atHome || rb.atHome) hooks.push('A home fighter in front of their own crowd');

  const headline =
    hooks[0] ??
    // Below the floor of the "Building a following" band, nobody on the poster sells anything.
    ((a.starPower + b.starPower) / 2 < FOLLOWING_FLOOR
      ? 'Sells to the hardcore, and that is about it'
      : 'A fair fight between two people still making names');
  return { headline, hooks };
}
