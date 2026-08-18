/**
 * How hard a camp is, as opposed to how long.
 *
 * Camp length was the only dial the game had, and measured on a 27-year-old its per-week return
 * varies by **1.2%** between six and twelve weeks — so the choice collapsed to "how much time can I
 * afford", which is a scheduling question rather than a training one. Doc 25 § 1.5.
 *
 * The fix is not a second magnitude slider. If both dials scaled the same number the matrix would
 * be one line with twelve labels on it. They buy different things:
 *
 * - **Length** buys volume and *technical* adaptation. Motor learning is reps and sleep, not
 *   maximal effort. It costs money and calendar.
 * - **Intensity** buys *physical* adaptation. You do not build a gas tank or explosive strength by
 *   going easy for twelve weeks. It costs freshness and injury risk.
 *
 * Two rows carry the design. **Light is freshness-positive** — active recovery is a real and widely
 * used thing, and it makes a light block a genuine option rather than a worse camp; it also resets
 * the neglect clock in full, because doc 23's `lastTrained` stamp does not care how hard a camp
 * was. That is the veteran's lever: at 38, when `learningRate` has made development nearly
 * worthless, a light camp holds your level *and* gives freshness back.
 *
 * And **overreach is technically worse than hard**. You do not learn well when you are wrecked.
 * That is what stops the dial being a difficulty slider and makes overreach a specifically physical
 * tool — right occasionally, wrong often.
 */

import { ATTRIBUTES_BY_GROUP, type AttributeKey } from '../ratings/attributes.js';

/*
 * Read from `ratings` rather than reusing `development.ts`'s `isPhysical`.
 *
 * That import compiled and would very probably have worked, but `development.ts` imports this
 * module, so it is a cycle — and a cycle whose safety depends on nobody ever moving a call from
 * function body to module initialisation. The canonical list lives in `ratings` anyway.
 */
const PHYSICAL = new Set<AttributeKey>(ATTRIBUTES_BY_GROUP.physical);

export const TRAINING_INTENSITIES = ['light', 'standard', 'hard', 'overreach'] as const;
export type TrainingIntensity = (typeof TRAINING_INTENSITIES)[number];

export interface IntensityMeta {
  key: TrainingIntensity;
  label: string;
  /** What it is for, in the player's language. One line, no numbers. */
  blurb: string;
  /** Multiplier on gains to skills — flat by design. Craft is bought with time, not effort. */
  technical: number;
  /** Multiplier on gains to physicals — steep by design. This is what intensity is for. */
  physical: number;
  /**
   * Multiplier on `STANDARD_LOAD_PER_DAY`.
   *
   * Light's 0.35 puts it at roughly 0.74 points a day against a healthy 25-year-old's recovery of
   * 1.30, so a light block *returns* freshness while it trains. That is not a special case in the
   * code — it falls out of the load being below the recovery rate.
   */
  load: number;
  /** Multiplier on `campInjuryChance`. Hard training hurts people; easy training mostly does not. */
  injury: number;
}

export const INTENSITY_META: Readonly<Record<TrainingIntensity, IntensityMeta>> = {
  light: {
    key: 'light',
    label: 'Light',
    blurb: 'Drilling and movement. Keeps everything ticking over and lets the body catch up.',
    technical: 0.85,
    physical: 0.35,
    load: 0.35,
    injury: 0.5,
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    blurb: 'A normal camp. Hard rounds, honest work, nothing heroic.',
    technical: 1.0,
    physical: 1.0,
    load: 1.0,
    injury: 1.0,
  },
  hard: {
    key: 'hard',
    label: 'Hard',
    blurb: 'A real build. You will get better and you will feel every week of it.',
    technical: 1.05,
    physical: 1.5,
    load: 1.5,
    injury: 1.5,
  },
  overreach: {
    key: 'overreach',
    label: 'Overreach',
    blurb: 'Everything, now. Sometimes that is the right call. Usually it is not.',
    // Below `hard`: you do not learn well when you are wrecked, and that is the whole reason this
    // is a choice rather than a strictly better version of the row above it.
    technical: 0.9,
    physical: 1.9,
    load: 2.0,
    injury: 2.3,
  },
};

/** What this intensity does to a gain in this attribute. */
export function intensityGain(intensity: TrainingIntensity, key: AttributeKey): number {
  const meta = INTENSITY_META[intensity];
  return PHYSICAL.has(key) ? meta.physical : meta.technical;
}

/** The default, so every existing caller and every existing save keeps behaving identically. */
export const DEFAULT_INTENSITY: TrainingIntensity = 'standard';
