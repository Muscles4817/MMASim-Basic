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

  report({ phase: 'pyramid', done: 0, label: 'Founding the promotions' });
  const db = generatePyramid(rest);
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
   * Back to the start date.
   *
   * Pre-history runs *forward* from the world's own start day, so when it finishes the clock is
   * eight years past where the player is supposed to begin. Winding it back is what makes those
   * eight years history rather than a game that started without them — every record, reign and
   * ranking stays, and the date on the calendar is the one the era says it is.
   *
   * The alternative — generating the population eight years younger and letting the clock run up
   * to the start date — is the same thing said backwards, and it costs a generator that has to
   * reason about who would have existed in 2018. This does not.
   */
  /*
   * `startedDay` moves with the clock, because it is the day the *player* arrives rather than the
   * day the generator ran. Pre-history has just written eight years of records, and the promoter
   * screens measure "how long have I left this person unbooked" from here — anchoring it to the
   * generation day instead would tell a new player they had already shelved the entire roster for
   * eight years.
   */
  setWorld(db, { day: start, startedDay: start });

  report({ phase: 'settling', done: 1, label: 'Ready' });
  db.save();
  return db;
}
