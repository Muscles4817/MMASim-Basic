/**
 * The calibration roster — a hundred fighters somebody actually watched, placed on the ladder.
 *
 * Doc 31 § 12 step 5. This is **not** a roster the game ships and not a replacement for the seed
 * data. It is a measuring instrument: a population whose physicals were authored deliberately, in
 * sigmas against a divisional median, so that the parameters in `physicalScale.ts` can be checked
 * against human judgement instead of against their own output.
 *
 * Read `entry.ts` first — it explains why an entry states a placement rather than a rating, and why
 * the body model does not get the last word when it disagrees with a career that really happened.
 */

export * from './entry.js';
export { MEN_CALIBRATION } from './men.js';
export { WOMEN_CALIBRATION } from './women.js';

import type { CalibrationEntry } from './entry.js';
import { MEN_CALIBRATION } from './men.js';
import { WOMEN_CALIBRATION } from './women.js';

/** Both sexes, in one list. Order is heaviest-division-first within each sex, men then women. */
export const CALIBRATION_ROSTER: readonly CalibrationEntry[] = [
  ...MEN_CALIBRATION,
  ...WOMEN_CALIBRATION,
];
