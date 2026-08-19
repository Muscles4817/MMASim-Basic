/**
 * How to say "this body is older than this fighter" on a screen.
 *
 * Doc 27 §12 made a career cost something beyond the birthdays — years as a professional, bouts,
 * wear and trauma all push decline forward — and §13.3 recorded that none of it was visible. A
 * player could not tell a worn thirty-year-old from a fresh one, which is the single distinction
 * the mechanic exists to draw.
 *
 * The arithmetic stays in the engine. This only decides the words, and it lives here rather than
 * on one screen so the profile and the hub cannot end up describing the same fighter differently —
 * which is exactly what the trauma thresholds were doing before §13.2.
 *
 * Written without pronouns: the sport in this game has women's divisions, and copy that assumes
 * otherwise is wrong on a third of the roster.
 */

import { bodyAge, fighterAge, mileageBreakdown, type Fighter } from '@mmasim/engine';

export interface MileageRead {
  /** Real age, in years. */
  age: number;
  /** What the body is carrying, rounded for display. */
  body: number;
  /** Years the miles have added. */
  added: number;
  /** Worth drawing attention to at all. */
  notable: boolean;
  /** Enough that it is the story of this fighter. */
  heavy: boolean;
  /** One sentence naming what did it. */
  because: string;
}

/**
 * Two years is roughly what an ordinary professional carries by their late twenties, so below it
 * there is nothing to say. Five is a fighter whose career is visibly ahead of their birthday.
 */
const NOTABLE = 2;
const HEAVY = 5;

export function readMileage(fighter: Fighter, day: number): MileageRead {
  const age = fighterAge(fighter, day);
  const parts = mileageBreakdown(fighter, day);
  const added = parts.years;

  // Name the largest single cause, because "you are worn out" is not actionable and "thirty-five
  // fights" is. Ties break toward the more concrete thing.
  const ranked: [number, string][] = [
    [parts.bouts, `${fighter.record.length} professional bouts`],
    [parts.trauma, 'the damage taken to the head'],
    [parts.wear, 'the miles on the body — the cuts, the camps, the injuries'],
    [parts.career, `${Math.round((day - fighter.proDebutDay) / 365)} years as a professional`],
  ];
  const [, cause] = ranked.reduce((a, b) => (b[0] > a[0] ? b : a));

  return {
    age,
    body: Math.round(age + added),
    added,
    notable: added >= NOTABLE,
    heavy: added >= HEAVY,
    because:
      added < NOTABLE
        ? `Little wear for ${age}. The body has not been asked for much yet.`
        : `${age} years old, but the body is nearer ${Math.round(bodyAge(fighter, day))} — mostly ${cause}. Decline runs on this number rather than on the birthday.`,
  };
}
