/**
 * Building a generated world, with the player watching.
 *
 * `generatePyramid` in the data layer does the cheap half — the promotions, the divisions, the
 * rosters. This does the expensive one: eight years of the sport simulated before the player
 * arrives, so that every record has real opponents behind it, every win has a matching loss
 * somewhere, champions have reigns and the apex roster is people who climbed there.
 *
 * It lives here rather than beside `generatePyramid` because it needs `advanceWorld`, and the data
 * layer sits below the game loop. That is the right way round: the world's rules are the app's,
 * and the data layer only knows how to store them.
 *
 * **Asynchronous, and yielding between years**, because the alternative is a frozen tab. Doc 27
 * § 10.6 measured this at three seconds for a Small world and twenty-five for a Large one on a
 * desktop; a phone is three to five times slower. A number like that behind a synchronous call is
 * a bug report about the game being broken.
 */

import {
  DAY_2026,
  PREHISTORY_YEARS,
  STATISTICAL_BELOW_PRESTIGE,
  generatePyramid,
  getWorld,
  setWorld,
  type GameDb,
  type GenerateOptions,
  type GenerationProgress,
} from '@mmasim/data';
import { resolveFightByRound } from '@mmasim/engine';
import { advanceWorld } from './world';

/** Hand the browser a frame. Overridable so tests do not pay for one per simulated year. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export interface GenerateWorldOptions extends GenerateOptions {
  onProgress?: (progress: GenerationProgress) => void;
  /** Replaced in tests, where yielding to a frame that never comes is the whole test suite. */
  yieldToUi?: () => Promise<void>;
}

/**
 * Build a world and live eight years of it.
 *
 * The progress fractions are weighted by what the phases actually cost rather than split evenly:
 * the pyramid is a fraction of a second and the years are everything, so a bar that gave them
 * equal thirds would sit at 33% for the entire wait.
 */
export async function generateWorld(options: GenerateWorldOptions = {}): Promise<GameDb> {
  const { onProgress, yieldToUi = nextFrame, ...rest } = options;
  const report = (progress: GenerationProgress) => onProgress?.(progress);

  /*
   * The population is built *before* the start date, and pre-history runs up to it.
   *
   * Doc 27 § 4.2: "build the population at start-date minus N years, then run the sport at low
   * fidelity up to the start date". This used to build at the start date, run eight years past it,
   * and wind the clock back — and the clock was the only thing that wound back. Every date the run
   * stamped stayed where it was written, in what had become the future, and two of those broke the
   * game outright:
   *
   *  - `readinessDelay` stamps an absolute `readyOnDay` after every loss, so nine fighters in ten
   *    opened the game serving a medical suspension that ended years later. Every matchmaking path
   *    filters on it, which is why a fresh world staged two cards in four months and a promoter
   *    could not book anybody at all.
   *  - `birthDay` never moved, so a fighter who was 25 when the generator built them fought
   *    through to 33 and was 25 again afterwards. The ones who debuted *during* pre-history came
   *    out as children holding professional records.
   *
   * Simulating forward onto the start date makes all of it right by construction rather than by
   * correction: there is nothing to unwind, because nothing was ever written ahead of the clock.
   */
  const span = PREHISTORY_YEARS * 365;

  report({ phase: 'pyramid', done: 0, label: 'Founding the promotions' });
  const db = generatePyramid({
    ...rest,
    day: DAY_2026 - span,
    ageForwardYears: PREHISTORY_YEARS,
  });
  await yieldToUi();

  const start = getWorld(db).day;
  report({
    phase: 'history',
    done: 0.05,
    label: `Simulating ${PREHISTORY_YEARS} years of the sport`,
  });

  for (let year = 0; year < PREHISTORY_YEARS; year++) {
    advanceWorld(db, start + year * 365, start + (year + 1) * 365, {
      /*
       * Doc 27 § 5's Reduced fight and Bulk tick, and the base of the pyramid resolved from
       * ratings. Between them these are the difference between a Medium world taking eleven
       * seconds and taking eighty-three.
       */
      resolve: resolveFightByRound,
      detail: 'bulk',
      statisticalBelowPrestige: STATISTICAL_BELOW_PRESTIGE,
    });

    report({
      phase: 'history',
      done: 0.05 + (0.9 * (year + 1)) / PREHISTORY_YEARS,
      label: `Year ${year + 1} of ${PREHISTORY_YEARS}`,
    });
    await yieldToUi();
  }

  /*
   * The clock is already where it belongs; this only records it.
   *
   * Pre-history ran *up to* the era's start date rather than past it, so there is nothing to wind
   * back — which is the whole point of building the population before the start date. `advanceWorld`
   * does not own the world clock (`advanceTo` sets it for the same reason), so it is written here.
   *
   * `startedDay` is the day the player arrives, which is now the same day pre-history ends. The
   * promoter screens measure "how long have I left this person unbooked" from it, and it is what
   * lets them tell "never fought here" apart from "shelved for a year".
   */
  const arrived = start + span;
  setWorld(db, { day: arrived, startedDay: arrived });

  report({ phase: 'settling', done: 1, label: 'Ready' });
  db.save();
  return db;
}
