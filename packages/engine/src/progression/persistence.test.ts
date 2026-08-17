/**
 * G3 — is a fighter still recognisably themselves after a career of camps?
 *
 * The third of the four goals in docs/19 §1, and the only one that is a claim about *careers*
 * rather than about fights:
 *
 * > A fight is style-expressive when an observer given only the play-by-play and the post-fight
 * > stats can name which discipline each fighter came from — **and when that identification still
 * > works twelve years into the fighter's career.**
 *
 * It was unassertable until phase 4, and two mechanisms were flattening everybody: one striking
 * focus that trained `strikingOffence` at 1.0 and `kicking` at 0.85 in the same block, so a
 * kickboxer's own camp moved them toward being a boxer; and a uniformly random focus draw in
 * `world.ts`, so nobody in the world trained what they were anyway.
 *
 * **Measured, and the headline claim in docs/19 §1 does not survive the measurement.** That table
 * lists G3's current state as "a kickboxer's striking/kicking gap closes to 0 in 24 camps". On this
 * fighter — 30 points of kicking lead, room left in both — the same twenty-four camps run:
 *
 * ```
 * old table, random focus (what the world did)      gap 30 → 27
 * old table, striking every single camp             gap 30 → 22
 * phase 4                                           gap 30 → 30
 * ```
 *
 * So the direction was real and the magnitude was argued rather than measured: the merged block
 * *does* erode a kicker, and it erodes them by about a quarter of their identity over eight years
 * rather than all of it. The convergence is much faster for a fighter whose kicking is already at
 * its ceiling, which is the case the old table punished hardest — every striking camp they took
 * could only move their hands. Worth stating plainly, because a goal defended by a number nobody
 * has reproduced is the failure mode this repo keeps finding in its own tests.
 *
 * Twenty-four camps is the horizon on purpose: eight-week blocks, three a year, so this is the
 * eight years between a debut at 24 and a fighter at 32 — the span doc §1 asks the identification
 * to survive.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { makeFighter } from '../testing/fixtures.js';
import { uniformAttributes } from '../ratings/attributes.js';
import { applyTraining } from './development.js';
import { pickTrainingFocus } from './trainingPlan.js';
import type { Fighter } from '../domain/fighter.js';

const CAMPS = 24;

/** A fighter with a shape and the room to keep it: 30 points of kicking over their hands. */
function kickboxer(): Fighter {
  return makeFighter({
    id: 'fighter_persistence_kicker',
    lastName: 'Kicker',
    attributes: { ...uniformAttributes(55), kicking: 80, strikingOffence: 50 },
    potential: { ...uniformAttributes(88), kicking: 95, strikingOffence: 80 },
  });
}

/** A wrestler, for the same claim on the other side of the sport. */
function wrestler(): Fighter {
  return makeFighter({
    id: 'fighter_persistence_wrestler',
    lastName: 'Wrestler',
    attributes: { ...uniformAttributes(55), wrestling: 82, strikingOffence: 50 },
    potential: { ...uniformAttributes(88), wrestling: 95, strikingOffence: 80 },
  });
}

/** Run a career of camps, choosing each block the way the world does. */
function career(fighter: Fighter, seed: string): Fighter {
  const rng = createRng(seed);
  let f = fighter;
  for (let camp = 0; camp < CAMPS; camp++) {
    const campRng = rng.fork(`camp:${camp}`);
    f = applyTraining({
      fighter: f,
      focuses: [pickTrainingFocus(campRng, f)],
      weeks: 8,
      day: camp * 84,
      rng: campRng,
    }).fighter;
  }
  return f;
}

describe('G3 — a fighter is still themselves twenty-four camps later', () => {
  it('keeps a kickboxer a kickboxer', () => {
    /*
     * The assertion the whole goal comes down to, and the one the old table could not pass.
     *
     * Measured: the 30-point lead is **still 30 points** after twenty-four camps — kicking 80 → 84
     * against hands 50 → 54 — where the old merged block left it at 27 with a random focus draw
     * and at 22 if the fighter took a striking camp every time. The career mix behind that is
     * kicks 11, hands 5, and eight camps spread across the rest of the sport.
     *
     * The bound is two thirds of the original gap rather than the whole of it, because a fighter's
     * holes *should* close somewhat — a camp is where you fix things, and a system where nobody
     * ever improves a weakness is as wrong as one where everybody converges.
     */
    const before = kickboxer();
    const after = career(before, 'g3:kicker');

    const gapBefore = before.attributes.kicking - before.attributes.strikingOffence;
    const gapAfter = after.attributes.kicking - after.attributes.strikingOffence;

    expect(
      gapAfter,
      `kicking ${after.attributes.kicking} vs hands ${after.attributes.strikingOffence} (started ${before.attributes.kicking}/${before.attributes.strikingOffence})`,
    ).toBeGreaterThan(gapBefore * 0.66);
  });

  it('keeps a wrestler a wrestler', () => {
    // 32 points of wrestling over hands at the start, 33 after. The grappling half of the sport
    // was never merged the way striking was, so this is the control for the *other* half of the
    // phase: it isolates `pickTrainingFocus`, because no table changed underneath it.
    const before = wrestler();
    const after = career(before, 'g3:wrestler');

    const gapBefore = before.attributes.wrestling - before.attributes.strikingOffence;
    const gapAfter = after.attributes.wrestling - after.attributes.strikingOffence;

    expect(
      gapAfter,
      `wrestling ${after.attributes.wrestling} vs hands ${after.attributes.strikingOffence}`,
    ).toBeGreaterThan(gapBefore * 0.66);
  });

  it('still lets a fighter improve the thing they are worst at', () => {
    /*
     * The other side, and the reason `IDENTITY_WEIGHT` is 0.7 rather than 1.
     *
     * Persistence must not mean stasis. A career where the hole everybody exploits never closes is
     * not a career, and the shape of this system — a weighted draw rather than a decision — is what
     * buys both: the kickboxer takes five hands camps across the twenty-four and their striking
     * offence goes 50 → 54, they just never overtake the shins.
     *
     * Four points in eight years looks small and is: these careers run with **no gym and no coach**,
     * which is the floor of the development system rather than a real camp. The claim being
     * defended is the sign, not the size.
     */
    const before = kickboxer();
    const after = career(before, 'g3:kicker');
    expect(
      after.attributes.strikingOffence - before.attributes.strikingOffence,
      `hands went ${before.attributes.strikingOffence} → ${after.attributes.strikingOffence}`,
    ).toBeGreaterThan(2);
  });
});
