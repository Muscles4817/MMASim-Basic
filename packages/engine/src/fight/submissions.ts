/**
 * The submission catalogue.
 *
 * Before this, a submission was a contest whose *name* was drawn afterwards from four strings per
 * position, so a guard specialist attacked the omoplata, triangle, armbar and guillotine in exactly
 * equal shares and nobody in the game had a signature (docs/reviews/19 §5). Here a submission is a
 * thing with a family, the positions it lives in, what it asks of the attacker, what it breaks when
 * the defender refuses to tap, and which attacks it chains into when it fails.
 *
 * It is chosen *before* the contest, from the fighter's repertoire (`style.ts`), and its profile
 * enters the contest. The narrator is told which one it was — it never picks.
 *
 * Doc 36 phase 6.
 */

import type { Rng } from '../core/rng.js';
import type { GroundPosition } from './types.js';

export const SUBMISSION_KEYS = [
  // Chokes
  'rearNaked',
  'guillotine',
  'darce',
  'anaconda',
  'armTriangle',
  'triangle',
  'northSouthChoke',
  'ezekiel',
  'vonFlue',
  'gogoplata',
  // Arm and shoulder locks
  'armbar',
  'kimura',
  'americana',
  'omoplata',
  // Leg locks
  'heelHook',
  'kneebar',
  'ankleLock',
  'toeHold',
  'calfSlicer',
  // The spine
  'twister',
] as const;
export type SubmissionKey = (typeof SUBMISSION_KEYS)[number];

export type SubmissionFamily = 'choke' | 'arm' | 'leg' | 'spine';

/** What a survived lock tends to break. Chokes break nothing — you go to sleep or you don't. */
export type SubmissionInjury = 'elbow' | 'shoulder' | 'knee' | 'ankle' | 'neck';

export interface SubmissionMeta {
  key: SubmissionKey;
  label: string;
  family: SubmissionFamily;
  /** Positions it can be attacked from *on top* (or behind). */
  fromTop: readonly GroundPosition[];
  /** Positions it can be attacked from *underneath*. */
  fromBottom: readonly GroundPosition[];
  /**
   * Can it be hit from the front headlock — off a sprawl, before anybody is on the floor? Doc 36
   * phase 5 gives the front headlock a beat of its own and these are what it offers.
   */
  frontHeadlock: boolean;
  /**
   * How often the sport sees it, before anybody's repertoire is applied. The RNC, the guillotine and
   * the arm-triangle are the bread and butter; the twister is a once-a-decade story.
   */
  commonness: number;
  /**
   * How much of the attack is technique rather than squeeze, 0–1. Read in the contest: a high value
   * leans on `submissions`, a low one lets `strength` carry part of it. An arm-triangle from side
   * control is half pressure; a gogoplata is all craft.
   */
  technicality: number;
  /** How much tighter it is than average once deep, around 1. Chokes from the back finish; kneebars get rolled out of. */
  finishing: number;
  /** What a refusal to tap costs, if anything. */
  injury?: SubmissionInjury;
  /** What a failed attempt flows into. The heart of a submission *chain*. */
  partners: readonly SubmissionKey[];
}

const M = (m: Omit<SubmissionMeta, 'key'> & { key: SubmissionKey }): SubmissionMeta => m;

export const SUBMISSIONS: Readonly<Record<SubmissionKey, SubmissionMeta>> = {
  rearNaked: M({
    key: 'rearNaked',
    label: 'rear-naked choke',
    family: 'choke',
    fromTop: ['back'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 4.2,
    technicality: 0.6,
    finishing: 1.35,
    partners: ['armbar'],
  }),
  guillotine: M({
    key: 'guillotine',
    label: 'guillotine',
    family: 'choke',
    fromTop: ['turtle'],
    fromBottom: ['guard', 'openGuard', 'halfGuard'],
    frontHeadlock: true,
    commonness: 1.0,
    technicality: 0.45,
    finishing: 1.05,
    injury: 'neck',
    partners: ['darce', 'anaconda'],
  }),
  darce: M({
    key: 'darce',
    label: 'D’Arce',
    family: 'choke',
    fromTop: ['halfGuard', 'turtle', 'sideControl'],
    fromBottom: [],
    frontHeadlock: true,
    commonness: 1.0,
    technicality: 0.7,
    finishing: 1.1,
    partners: ['anaconda', 'guillotine'],
  }),
  anaconda: M({
    key: 'anaconda',
    label: 'anaconda choke',
    family: 'choke',
    fromTop: ['turtle'],
    fromBottom: [],
    frontHeadlock: true,
    commonness: 0.6,
    technicality: 0.7,
    finishing: 1.05,
    partners: ['darce', 'guillotine'],
  }),
  armTriangle: M({
    key: 'armTriangle',
    label: 'arm-triangle',
    family: 'choke',
    fromTop: ['halfGuard', 'sideControl', 'mount'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 2.0,
    technicality: 0.4,
    finishing: 1.1,
    partners: ['americana', 'kimura'],
  }),
  triangle: M({
    key: 'triangle',
    label: 'triangle choke',
    family: 'choke',
    fromTop: ['mount'],
    fromBottom: ['guard', 'openGuard'],
    frontHeadlock: false,
    commonness: 1.8,
    technicality: 0.75,
    finishing: 1.05,
    partners: ['armbar', 'omoplata'],
  }),
  northSouthChoke: M({
    key: 'northSouthChoke',
    label: 'north-south choke',
    family: 'choke',
    fromTop: ['northSouth'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 0.6,
    technicality: 0.6,
    finishing: 1.1,
    partners: ['kimura'],
  }),
  ezekiel: M({
    key: 'ezekiel',
    label: 'Ezekiel choke',
    family: 'choke',
    fromTop: ['mount'],
    fromBottom: ['guard'],
    frontHeadlock: false,
    commonness: 0.25,
    technicality: 0.65,
    finishing: 0.95,
    partners: ['armTriangle'],
  }),
  vonFlue: M({
    key: 'vonFlue',
    label: 'von Flue choke',
    family: 'choke',
    fromTop: ['sideControl'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 0.2,
    technicality: 0.55,
    finishing: 1.0,
    partners: ['armTriangle'],
  }),
  gogoplata: M({
    key: 'gogoplata',
    label: 'gogoplata',
    family: 'choke',
    fromTop: [],
    fromBottom: ['guard'],
    frontHeadlock: false,
    commonness: 0.12,
    technicality: 0.95,
    finishing: 0.95,
    partners: ['omoplata', 'triangle'],
  }),
  armbar: M({
    key: 'armbar',
    label: 'armbar',
    family: 'arm',
    fromTop: ['mount', 'back', 'sideControl'],
    fromBottom: ['guard', 'openGuard'],
    frontHeadlock: false,
    commonness: 2.2,
    technicality: 0.7,
    finishing: 1.0,
    injury: 'elbow',
    partners: ['triangle', 'omoplata'],
  }),
  kimura: M({
    key: 'kimura',
    label: 'kimura',
    family: 'arm',
    fromTop: ['sideControl', 'northSouth', 'halfGuard', 'turtle'],
    fromBottom: ['guard', 'halfGuard'],
    frontHeadlock: false,
    commonness: 1.5,
    technicality: 0.5,
    finishing: 0.9,
    injury: 'shoulder',
    partners: ['armbar', 'americana'],
  }),
  americana: M({
    key: 'americana',
    label: 'Americana',
    family: 'arm',
    fromTop: ['sideControl', 'mount'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 0.6,
    technicality: 0.4,
    finishing: 0.9,
    injury: 'shoulder',
    partners: ['kimura', 'armTriangle'],
  }),
  omoplata: M({
    key: 'omoplata',
    label: 'omoplata',
    family: 'arm',
    fromTop: [],
    fromBottom: ['guard', 'openGuard'],
    frontHeadlock: false,
    commonness: 0.6,
    technicality: 0.85,
    finishing: 0.75,
    injury: 'shoulder',
    partners: ['triangle', 'armbar'],
  }),
  heelHook: M({
    key: 'heelHook',
    label: 'heel hook',
    family: 'leg',
    fromTop: [],
    fromBottom: ['legEntangle'],
    frontHeadlock: false,
    commonness: 0.9,
    technicality: 0.85,
    finishing: 1.25,
    injury: 'knee',
    partners: ['kneebar', 'toeHold'],
  }),
  kneebar: M({
    key: 'kneebar',
    label: 'kneebar',
    family: 'leg',
    fromTop: [],
    fromBottom: ['legEntangle'],
    frontHeadlock: false,
    commonness: 0.5,
    technicality: 0.7,
    finishing: 0.9,
    injury: 'knee',
    partners: ['heelHook', 'toeHold'],
  }),
  ankleLock: M({
    key: 'ankleLock',
    label: 'ankle lock',
    family: 'leg',
    fromTop: [],
    fromBottom: ['legEntangle', 'openGuard'],
    frontHeadlock: false,
    commonness: 0.7,
    technicality: 0.55,
    finishing: 0.8,
    injury: 'ankle',
    partners: ['heelHook', 'kneebar'],
  }),
  toeHold: M({
    key: 'toeHold',
    label: 'toe hold',
    family: 'leg',
    fromTop: [],
    fromBottom: ['legEntangle'],
    frontHeadlock: false,
    commonness: 0.3,
    technicality: 0.6,
    finishing: 0.85,
    injury: 'ankle',
    partners: ['kneebar', 'ankleLock'],
  }),
  calfSlicer: M({
    key: 'calfSlicer',
    label: 'calf slicer',
    family: 'leg',
    fromTop: ['back', 'turtle'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 0.12,
    technicality: 0.8,
    finishing: 0.9,
    injury: 'knee',
    partners: ['rearNaked'],
  }),
  twister: M({
    key: 'twister',
    label: 'twister',
    family: 'spine',
    fromTop: ['back', 'turtle'],
    fromBottom: [],
    frontHeadlock: false,
    commonness: 0.06,
    technicality: 0.95,
    finishing: 1.0,
    injury: 'neck',
    partners: ['rearNaked'],
  }),
};

/** Every submission available from `position`, from the given end of it. */
export function submissionsFrom(position: GroundPosition, fromTop: boolean): readonly SubmissionKey[] {
  const cache = fromTop ? TOP_CACHE : BOTTOM_CACHE;
  let hit = cache.get(position);
  if (!hit) {
    hit = SUBMISSION_KEYS.filter((k) =>
      (fromTop ? SUBMISSIONS[k].fromTop : SUBMISSIONS[k].fromBottom).includes(position),
    );
    cache.set(position, hit);
  }
  return hit;
}

/** Everything a front headlock offers. */
export const FRONT_HEADLOCK_SUBMISSIONS: readonly SubmissionKey[] = SUBMISSION_KEYS.filter(
  (k) => SUBMISSIONS[k].frontHeadlock,
);

const TOP_CACHE = new Map<GroundPosition, readonly SubmissionKey[]>();
const BOTTOM_CACHE = new Map<GroundPosition, readonly SubmissionKey[]>();

/**
 * Which submission this fighter goes for, from here.
 *
 * Chosen from the fighter's repertoire, restricted to what the position offers. `prefer` is the
 * chain: a hold that just failed makes its partners the natural next attack, and a fighter who has
 * drilled the chain takes it. Falls back to the sport's commonness if the repertoire has nothing
 * here — a wrestler who never attacks from his back still knows a guillotine exists.
 */
export function chooseSubmission(
  rng: Rng,
  repertoire: Readonly<Partial<Record<SubmissionKey, number>>>,
  available: readonly SubmissionKey[],
  prefer?: SubmissionKey,
): SubmissionKey | undefined {
  if (available.length === 0) return undefined;
  const partners = prefer ? SUBMISSIONS[prefer].partners : undefined;
  let total = 0;
  for (const k of available) total += repertoire[k] ?? 0;
  const weigh = (k: SubmissionKey): number => {
    const base = total > 0 ? (repertoire[k] ?? 0) : SUBMISSIONS[k].commonness;
    // The chain: a partner of the hold that just failed is where the hips already are.
    const chained = partners && partners.includes(k) ? 3 : 1;
    // And the same hold again straight away is the least likely thing to work.
    const repeat = prefer === k ? 0.35 : 1;
    return base * chained * repeat;
  };
  return rng.pickWeighted(available, weigh);
}
