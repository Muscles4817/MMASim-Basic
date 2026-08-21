/**
 * Reading a fighter.
 *
 * The fighter screen's problem was never that it lacked numbers. It had forty-four of them and
 * no answer to the only question anybody is actually asking, which is *what does this person
 * mean to me*. Two fighters with the same overall rating can be a 23-year-old worth building and
 * a 36-year-old worth one more payday, and nothing on the page said so.
 *
 * This was `promoterRead.ts`, and the name was the mistake doc 32 § 6 records: none of it is a
 * promoter concept. "How good are they, what kind of fighter are they, what has the career cost,
 * are they available" are the same questions a fighter asks about an opponent, a coach asks about
 * a prospect and a promoter asks about a signing. What differs is the *framing* and the actions,
 * and both of those belong in the UI layer rather than in a filename here.
 *
 * Three reads live here, and they are deliberately different kinds of thing:
 *
 *  - `abilityRead` — how good they are, **as a class rather than as a number**. See below; this
 *    is the single most important judgement in the file.
 *  - `scoutingRead` — what kind of fighter they are, in a sentence, synthesised from the ratings
 *    rather than from a script.
 *  - `careerArc` — where they are in a career, which is what decides whether a fight is a step
 *    up, a showcase or a retirement.
 *
 * All three are pure functions of the fighter. None of them is stored, for the usual reason: a
 * stored read would be wrong the day after the fighter changed.
 */

import { clamp, clamp01 } from '../core/math.js';
import type { GameDay } from '../core/clock.js';
import type { Fighter } from '../domain/fighter.js';
import { fighterAge } from '../domain/fighter.js';
import { ATTRIBUTE_META, overallRating, ratingBand } from '../ratings/attributes.js';
import type { AttributeKey, Attributes } from '../ratings/attributes.js';
import { TRAUMA_CONCERN, TRAUMA_MEDICAL, WEAR_CONCERN } from '../progression/retirement.js';

// --- Ability, as a class rather than a number --------------------------------------------------

/**
 * How good this fighter is, banded.
 *
 * The rule doc 13 asks for and the game was breaking: **the promoter is not omniscient.** An
 * exact "Overall 34" collapses scouting, matchmaking judgement and career interpretation into a
 * comparison of two integers, and a game where the right answer is visible is a game with no
 * decisions in it. Two players looking at the same fighter should be able to reach different
 * conclusions about what to do with him, and they cannot if the screen has already told them he
 * is a 34 and the other man is a 47.
 *
 * So the number does not leave this function. What leaves is a class — six of them, wide enough
 * that the fighters inside one are genuinely arguable against each other — plus the sentence a
 * matchmaker would actually say. The underlying ratings are all still on the page; a player who
 * wants to form their own view has everything they need to, which is the point.
 */
export type AbilityClass =
  'championship' | 'contender' | 'divisional' | 'roster' | 'developmental' | 'outclassed';

export interface AbilityRead {
  klass: AbilityClass;
  label: string;
  /** What a matchmaker would say about the level, not about the number. */
  blurb: string;
  /** 0–1, for a bar. Coarse on purpose — it is a band, not a score. */
  fill: number;
}

const ABILITY_BANDS: readonly {
  klass: AbilityClass;
  floor: number;
  label: string;
  blurb: string;
}[] = [
  {
    klass: 'championship',
    floor: 78,
    label: 'Championship level',
    blurb:
      'Beats anybody in the division on the right night. This is a main event wherever they go.',
  },
  {
    klass: 'contender',
    floor: 66,
    label: 'Contender level',
    blurb: 'Live against the top of the division. Wins most of what is put in front of them.',
  },
  {
    klass: 'divisional',
    floor: 54,
    label: 'Divisional level',
    blurb: 'Belongs on the main card and can beat anybody outside the top few.',
  },
  {
    klass: 'roster',
    floor: 42,
    label: 'Roster level',
    blurb: 'Holds their own on a card. Not troubling the ranked fighters.',
  },
  {
    klass: 'developmental',
    floor: 30,
    label: 'Developmental',
    blurb: 'Still learning the job. Needs building, not testing.',
  },
  {
    klass: 'outclassed',
    floor: 0,
    label: 'Outclassed here',
    blurb: 'Out of their depth at this level. Every step up is a risk to them.',
  },
];

export function abilityRead(attributes: Attributes): AbilityRead {
  const rating = overallRating(attributes);
  const band =
    ABILITY_BANDS.find((b) => rating >= b.floor) ?? ABILITY_BANDS[ABILITY_BANDS.length - 1]!;
  const index = ABILITY_BANDS.indexOf(band);
  return {
    klass: band.klass,
    label: band.label,
    blurb: band.blurb,
    // Coarse by construction: every fighter in a class draws the same bar, so the bar cannot be
    // read back as a hidden number.
    fill: (ABILITY_BANDS.length - index) / ABILITY_BANDS.length,
  };
}

// --- The scouting read -------------------------------------------------------------------------

export interface AttributeCall {
  key: AttributeKey;
  value: number;
  label: string;
}

export interface ScoutingRead {
  /** Two or three sentences. The thing a player should be able to read in five seconds. */
  summary: string;
  strengths: readonly AttributeCall[];
  weaknesses: readonly AttributeCall[];
  /** Short phrases for chips: 'Finisher', 'Goes the distance', 'Grappler'. */
  tags: readonly string[];
}

const call = (attributes: Attributes, key: AttributeKey): AttributeCall => ({
  key,
  value: attributes[key],
  label: ATTRIBUTE_META[key].label,
});

const STRIKING_KEYS: readonly AttributeKey[] = ['strikingOffence', 'kicking', 'strikingDefence'];
const GRAPPLING_KEYS: readonly AttributeKey[] = [
  'wrestling',
  'takedownDefence',
  'groundControl',
  'submissions',
  'scrambling',
];

const mean = (attributes: Attributes, keys: readonly AttributeKey[]): number =>
  keys.reduce((sum, key) => sum + attributes[key], 0) / keys.length;

/**
 * "a, b and c" rather than "a and b and c".
 *
 * The attribute labels keep their own capitalisation — several are initialisms (`TD Defence`,
 * `Fight IQ`) that a blanket `toLowerCase()` turns into something that reads as a typo.
 */
const listOf = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * What kind of fighter this is, written out.
 *
 * Synthesised from the ratings and the record together, because neither alone says anything
 * interesting. "22-4" is not a fighter and neither is "power 71". What a promoter wants is the
 * sentence that joins them: *a record built on durability and volume against opposition that
 * could not put him away*.
 */
export function scoutingRead(fighter: Fighter, day: GameDay): ScoutingRead {
  const a = fighter.attributes;
  const entries = (Object.keys(a) as AttributeKey[]).map((key) => call(a, key));
  const sorted = [...entries].sort((x, y) => y.value - x.value);

  const strengths = sorted.slice(0, 3);
  // Only genuine holes count. A lowest-of-fifteen at 72 is not a weakness, and calling it one
  // teaches the player to distrust the label.
  const weaknesses = sorted
    .slice(-3)
    .reverse()
    .filter((c) => c.value < 62);

  const striking = mean(a, STRIKING_KEYS);
  const grappling = mean(a, GRAPPLING_KEYS);
  const summaryRecord = fighter.summary;
  const bouts = summaryRecord.wins + summaryRecord.losses + summaryRecord.draws;
  const finishes = summaryRecord.koWins + summaryRecord.submissionWins;
  const finishRate = summaryRecord.wins > 0 ? finishes / summaryRecord.wins : 0;
  const age = fighterAge(fighter, day);
  const overall = overallRating(a);

  const tags: string[] = [];
  if (striking - grappling > 8) tags.push('Striker');
  else if (grappling - striking > 8) tags.push('Grappler');
  else tags.push('Mixed');

  if (finishRate > 0.6 && summaryRecord.wins >= 3) tags.push('Finisher');
  else if (finishRate < 0.25 && summaryRecord.wins >= 4) tags.push('Goes the distance');
  if (a.cardio >= 75) tags.push('Never tires');
  if (a.durability >= 78) tags.push('Hard to hurt');
  if (a.durability < 45) tags.push('Can be hurt');
  if (a.power >= 78) tags.push('One-shot power');
  if (a.fightIq >= 78) tags.push('Reads a fight');

  // --- The sentence -----------------------------------------------------------------------
  //
  // Built rather than templated per fighter, so it stays true after six years of simulation.
  const shape =
    striking - grappling > 8
      ? 'striker'
      : grappling - striking > 8
        ? 'grappler'
        : 'well-rounded fighter';

  const engine =
    finishRate > 0.6 && summaryRecord.wins >= 3
      ? 'who ends fights early'
      : finishRate < 0.25 && summaryRecord.wins >= 4
        ? 'who wins on the cards'
        : a.durability >= 72
          ? 'who is very hard to put away'
          : 'without an obvious way to end a fight';

  /*
   * Whether the record flatters them, which is the single most useful thing a matchmaker can be
   * told and the thing no roster screen has ever said. Reputation is what the sport believes;
   * ability is what is true. The gap between them is the whole of scouting.
   */
  const believed = fighter.reputation;
  const gap = believed - overall;
  const standing =
    bouts < 5
      ? 'Too few fights to know much yet.'
      : gap > 12
        ? 'The record reads better than the fighter does — the level has flattered them.'
        : gap < -12
          ? 'Better than the record suggests. They have been matched hard, or unlucky.'
          : 'The record is an honest reflection of the level.';

  const decline =
    age >= 34 &&
    (fighter.condition.bodyWear >= WEAR_CONCERN || fighter.condition.headTrauma >= TRAUMA_CONCERN)
      ? ' There is visible mileage on them now, and it is the kind that does not come back.'
      : '';

  const hole =
    weaknesses.length > 0
      ? ` The hole is ${listOf(weaknesses.map((w) => w.label))}, and anybody good enough will find it.`
      : ' No obvious hole to attack, which is rare and expensive.';

  return {
    summary: `A ${shape} ${engine}. ${standing}${hole}${decline}`,
    strengths,
    weaknesses,
    tags,
  };
}

// --- Where they are in a career ------------------------------------------------------------------

/**
 * The career identities a promoter thinks in.
 *
 * Emergent rather than a class on the fighter: nothing anywhere stores "gatekeeper", and the
 * same fighter is a hot prospect at 24 and a gatekeeper at 31 without anything having been
 * written. That is the requirement — the UX should *recognise* an identity the simulation
 * produced, not hand one out at generation and then argue with the results.
 */
export type CareerArcId =
  | 'champion'
  | 'formerChampion'
  | 'contender'
  | 'hotProspect'
  | 'prospect'
  | 'gatekeeper'
  | 'journeyman'
  | 'agingContender'
  | 'decliningStar'
  | 'rebuilding'
  | 'attraction'
  | 'unproven';

export interface CareerArc {
  id: CareerArcId;
  label: string;
  /** One line: what this identity means for matchmaking. */
  blurb: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface CareerArcInput {
  fighter: Fighter;
  day: GameDay;
  /** 0 for champion, 1..n ranked, undefined for unranked. */
  rank?: number;
  isChampion?: boolean;
  /** Whether they have ever held a belt anywhere. */
  wasChampion?: boolean;
}

/**
 * Read a career.
 *
 * Ordered most-specific first and returns the first match, which is the honest shape for this:
 * a declining former champion is a declining former champion, not four overlapping labels.
 */
export function careerArc(input: CareerArcInput): CareerArc {
  const { fighter, day, rank, isChampion = false, wasChampion = false } = input;
  const age = fighterAge(fighter, day);
  const bouts = fighter.summary.wins + fighter.summary.losses + fighter.summary.draws;
  const streak = fighter.summary.streak;
  const worn =
    fighter.condition.bodyWear >= WEAR_CONCERN || fighter.condition.headTrauma >= TRAUMA_CONCERN;
  const overall = overallRating(fighter.attributes);

  if (isChampion) {
    return {
      id: 'champion',
      label: 'Champion',
      blurb: 'Holds the belt. Every card they are on is built around them.',
      tone: 'good',
    };
  }

  if (fighter.starPower >= 60 && (streak <= -2 || (age >= 34 && worn))) {
    return {
      id: 'decliningStar',
      label: 'Declining star',
      blurb:
        'Still sells tickets. No longer beats the people they used to. Worth money for a while yet.',
      tone: 'warn',
    };
  }

  if (wasChampion) {
    return {
      id: 'formerChampion',
      label: 'Former champion',
      blurb: 'The name still means something. Whether the fighter does is the question.',
      tone: 'neutral',
    };
  }

  if (streak <= -2) {
    return {
      id: 'rebuilding',
      label: 'Rebuilding',
      blurb: 'On a bad run. Needs a winnable fight or they are gone.',
      tone: 'bad',
    };
  }

  if (age >= 33 && rank !== undefined && rank <= 8) {
    return {
      id: 'agingContender',
      label: 'Aging contender',
      blurb: 'Near the top and running out of time. Their biggest fight should happen now.',
      tone: 'warn',
    };
  }

  if (rank !== undefined && rank <= 5 && streak >= 1) {
    return {
      id: 'contender',
      label: 'Contender',
      blurb: 'In the title picture. Beating the right person makes them next.',
      tone: 'good',
    };
  }

  if (age <= 26 && bouts <= 14 && streak >= 4) {
    return {
      id: 'hotProspect',
      label: 'Hot prospect',
      blurb:
        'Winning and young. Ready for a real test — or one more build-up if you want to be careful.',
      tone: 'good',
    };
  }

  if (age <= 26 && bouts <= 14) {
    return {
      id: 'prospect',
      label: 'Prospect',
      blurb: 'Young and unfinished. Matched carefully, they are next year’s main event.',
      tone: 'neutral',
    };
  }

  if (fighter.starPower >= 55 && overall < 60) {
    return {
      id: 'attraction',
      label: 'Attraction',
      blurb: 'Sells more than they win. Put them in front of people, not in front of contenders.',
      tone: 'neutral',
    };
  }

  if (bouts >= 12 && Math.abs(fighter.summary.wins - fighter.summary.losses) <= 3) {
    return {
      id: 'journeyman',
      label: 'Journeyman',
      blurb: 'Always available, always competitive, rarely spectacular. The spine of a card.',
      tone: 'neutral',
    };
  }

  if (bouts >= 10 && rank !== undefined && rank > 5) {
    return {
      id: 'gatekeeper',
      label: 'Gatekeeper',
      blurb:
        'The measuring stick. Beating them means something; losing to them says something too.',
      tone: 'neutral',
    };
  }

  return {
    id: 'unproven',
    label: 'Unproven',
    blurb: 'Not enough has happened yet to say what they are.',
    tone: 'neutral',
  };
}

// --- Availability ---------------------------------------------------------------------------

export type AvailabilityState = 'ready' | 'recovering' | 'suspended' | 'booked' | 'retired';

export interface Availability {
  state: AvailabilityState;
  label: string;
  /** Plain sentence. Empty when simply ready. */
  detail: string;
  /** Day they can next be booked, if not now. */
  readyOn?: GameDay;
}

/**
 * Whether this fighter can take a fight, and when.
 *
 * Collapses the three separate things a promoter has to check — suspension, injury, existing
 * booking — into the one answer they were checking them for. The screens asked all three
 * separately and each of them phrased it differently.
 */
export function availabilityOf(input: {
  fighter: Fighter;
  day: GameDay;
  /** True when they already have a bout on a card. */
  booked?: boolean;
  /** The day of the card being planned, when there is one. */
  forDay?: GameDay;
}): Availability {
  const { fighter, day, booked = false, forDay } = input;

  if (fighter.retiredDay !== undefined) {
    return { state: 'retired', label: 'Retired', detail: 'They have stopped fighting.' };
  }

  if (booked) {
    return { state: 'booked', label: 'Booked', detail: 'Already on a card.' };
  }

  const readyOn = fighter.readyOnDay ?? 0;
  const target = forDay ?? day;

  if (readyOn > target) {
    const days = readyOn - target;
    // A medical suspension and a body that is not ready are different problems, and only one of
    // them is negotiable.
    const medical = fighter.record[fighter.record.length - 1]?.outcome === 'loss';
    return {
      state: medical ? 'suspended' : 'recovering',
      label: medical ? 'Suspended' : 'Recovering',
      detail: `Not cleared for another ${days} day${days === 1 ? '' : 's'}.`,
      readyOn,
    };
  }

  return { state: 'ready', label: 'Ready', detail: '' };
}

// --- Condition, as a promoter reads it ----------------------------------------------------------

export interface ConditionRead {
  /** 0–100. How much career is left in the body, high is good. */
  integrity: number;
  label: string;
  detail: string;
  tone: 'good' | 'warn' | 'bad';
}

/**
 * What the career has cost, in one line.
 *
 * The fighter screen had this at the bottom, under thirty ratings, which is exactly backwards
 * for a promoter: a 36-year-old with a body age of 41 and 67 points of trauma is a completely
 * different asset from a fresh 24-year-old, and that is a contract decision rather than a
 * curiosity.
 */
export function conditionRead(fighter: Fighter, day: GameDay): ConditionRead {
  const { headTrauma, bodyWear, confidence } = fighter.condition;
  const age = fighterAge(fighter, day);

  const integrity = Math.round(
    clamp(100 - headTrauma * 0.55 - bodyWear * 0.45 - Math.max(0, age - 32) * 3, 0, 100),
  );

  if (headTrauma >= TRAUMA_MEDICAL) {
    return {
      integrity,
      label: 'The chin has gone',
      detail:
        'Accumulated trauma has permanently lowered what they can absorb. Match them accordingly.',
      tone: 'bad',
    };
  }
  if (integrity < 45) {
    return {
      integrity,
      label: 'Heavy mileage',
      detail:
        'The body is well past its best. Every hard fight from here costs more than it returns.',
      tone: 'bad',
    };
  }
  if (integrity < 68 || headTrauma >= TRAUMA_CONCERN || bodyWear >= WEAR_CONCERN) {
    return {
      integrity,
      label: 'Wearing',
      detail: 'Damage is accumulating. Still competitive, but the decline has started.',
      tone: 'warn',
    };
  }
  if (confidence < 40) {
    return {
      integrity,
      label: 'Physically fine, mentally not',
      detail:
        'The body is intact and the belief is not. A win they can get is worth more than a big fight.',
      tone: 'warn',
    };
  }
  return {
    integrity,
    label: 'Fresh',
    detail: 'Nothing on the clock yet. This is an asset with years in it.',
    tone: 'good',
  };
}

// --- Value for money ---------------------------------------------------------------------------

/**
 * Whether this fighter is worth what they are being paid, in words.
 *
 * Deliberately not the `contractFairness` ratio, which is the fighter's side of the same
 * question. This is the promoter's: a fighter paid *under* their worth is a bargain here and a
 * grievance there, and the two screens should not read the same number the same way.
 */
export function valueRead(input: { paid: number; worth: number }): {
  label: string;
  detail: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
} {
  const { paid, worth } = input;
  if (worth <= 0)
    return { label: 'Unpriced', detail: 'Nothing to compare the deal to yet.', tone: 'neutral' };
  const ratio = paid / worth;

  if (ratio <= 0.6) {
    return {
      label: 'Bargain',
      detail: 'Paid well under what they are worth. Expect them to notice.',
      tone: 'good',
    };
  }
  if (ratio <= 1.1) {
    return { label: 'Fair', detail: 'Paid about what they are worth.', tone: 'neutral' };
  }
  if (ratio <= 1.6) {
    return {
      label: 'Expensive',
      detail: 'Costing more than they return at the gate.',
      tone: 'warn',
    };
  }
  return {
    label: 'Overpaid',
    detail:
      'The deal is well ahead of what they now bring in. This is money you are not getting back.',
    tone: 'bad',
  };
}

/** 0–1, how confident a read on this fighter is. Fewer fights means less is actually known. */
export function readConfidence(fighter: Fighter): number {
  const bouts = fighter.summary.wins + fighter.summary.losses + fighter.summary.draws;
  return clamp01(bouts / 12);
}

/** The band word for a rating, kept here so screens never re-derive it. */
export const bandWord = (rating: number): string => ratingBand(rating).short;
