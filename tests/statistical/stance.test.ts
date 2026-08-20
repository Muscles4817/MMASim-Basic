/**
 * Is being a southpaw worth anything, and is it worth too much?
 *
 * `Fighter.stance` was stored on every fighter, hand-authored on the real ones in both seed
 * rosters, rendered on the fighter screen — and read by nothing in the simulator (docs/19 §9c).
 * The same defect class as `riskLevel` before `risk.test.ts` existed: a field the player can see
 * and the fight does not consult.
 *
 * The mechanism is unfamiliarity rather than geometry, so the shape follows from that. A southpaw
 * gets a small edge in the landing contest against an orthodox fighter; a smart orthodox fighter
 * solves it; a switch-stance fighter neither gets it nor gives it, which is what stops `switch`
 * from being the strictly correct stance to be born with.
 *
 * The bounds are two-sided on purpose. An edge nobody can measure is a field that is still dead,
 * and an edge large enough to decide fights would be a hidden tax on three quarters of a world
 * where nobody chooses their stance.
 */

import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeFighter, type Fighter } from '@mmasim/engine';
import { runMatchup } from '../helpers/sim.js';

type Stance = Fighter['stance'];

function at(stance: Stance, fightIq: number, corner: 'red' | 'blue'): Fighter {
  return makeFighter({
    id: `fighter_stance_${corner}`,
    lastName: 'Stance',
    attributes: { ...ARCHETYPES.contender().attributes, fightIq },
    stance,
  });
}

/**
 * Red's win rate, over seeds that do not move when the stance does.
 *
 * The prefix excludes the stances and the ids are fixed, so two calls differing only in `red` are
 * the *same fights* with one foot swapped — the paired comparison `styles.test.ts` uses for its
 * attribute swings. The first cut of this file put the stance in the seed prefix, which reseeded
 * every fight and buried the effect under resampling noise: it measured −0.1 points while the
 * mechanism was working perfectly.
 */
function winRate(red: Stance, blue: Stance, blueIq: number): number {
  return runMatchup(at(red, 66, 'red'), at(blue, blueIq, 'blue'), {
    fights: 2500,
    seedPrefix: `stance:${blueIq}`,
  }).redWinRate;
}

/** Measured once. Every assertion below is a comparison between two of these. */
const MIRROR_DULL = winRate('orthodox', 'orthodox', 40);
const SOUTHPAW_DULL = winRate('southpaw', 'orthodox', 40);
const MIRROR = winRate('orthodox', 'orthodox', 66);
const SOUTHPAW = winRate('southpaw', 'orthodox', 66);
const SOUTHPAW_SMART = winRate('southpaw', 'orthodox', 90);
const MIRROR_SMART = winRate('orthodox', 'orthodox', 90);
const SWITCH = winRate('switch', 'orthodox', 66);
const SOUTHPAW_VS_SWITCH = winRate('southpaw', 'switch', 66);

const report = () =>
  `dull ${(SOUTHPAW_DULL * 100).toFixed(2)} vs ${(MIRROR_DULL * 100).toFixed(2)}, ` +
  `average ${(SOUTHPAW * 100).toFixed(2)} vs ${(MIRROR * 100).toFixed(2)}, ` +
  `smart ${(SOUTHPAW_SMART * 100).toFixed(2)} vs ${(MIRROR_SMART * 100).toFixed(2)}`;

describe('the open-stance matchup', () => {
  it('is worth something to the southpaw', () => {
    /*
     * The same fighter with the same ratings, standing the other way round. Asserted against the
     * dull opponent because that is where the mechanism is unsolved and therefore where it is
     * largest and cleanest.
     *
     * Re-measured when range landed, because range moved it. A landing-contest edge is worth less
     * once part of the fight is decided somewhere else, and this read +1.33 points before range
     * and +0.82 after over 12,000 paired fights — a real dilution rather than a drift, and the
     * exact level `stance.ts` records as too small to measure below six thousand fights. It is
     * back at +1.36 / +1.52 / +1.61 (2,500 / 6,000 / 12,000) now that `STANCE_EDGE` is spent in
     * the range contest too and sized against what that leaves.
     *
     * The bound stays where it was. It is a floor on the design claim, not a record of the
     * measurement — the measurement is in the comment precisely so the two do not get confused.
     */
    expect(SOUTHPAW_DULL, report()).toBeGreaterThan(MIRROR_DULL + 0.008);
  });

  it('is not worth so much that the stance becomes the fighter', () => {
    /*
     * The side that matters more. Nobody chooses their stance — it is rolled at generation and
     * hand-authored on the seed roster — so an edge large enough to decide fights would be a
     * hidden tax on everybody who was rolled orthodox. Real southpaws are overrepresented at the
     * top of combat sports by roughly this much, not by more.
     */
    expect(SOUTHPAW_DULL - MIRROR_DULL, report()).toBeLessThan(0.05);
  });

  it('is solved by a fighter smart enough to solve it', () => {
    // The whole justification for the mechanism existing: it is unfamiliarity, and unfamiliarity
    // is what studying fixes. A dull opponent gives up nearly two points; a smart one gives up
    // almost nothing.
    expect(SOUTHPAW_DULL - MIRROR_DULL, report()).toBeGreaterThan(SOUTHPAW_SMART - MIRROR_SMART);
  });

  it('gives a switch-stance fighter neither the edge nor the exposure', () => {
    /*
     * Both halves in one test, because they are one decision. A switch fighter is comfortable in
     * either stance, so the unfamiliarity does not apply in either direction — measured, both of
     * these are *identical* to the mirror matchup rather than merely close to it, which is the
     * signature of a branch that returns 1 rather than of an effect that happens to be small.
     *
     * If only the first half held, `switch` would be strictly the best stance and generation would
     * be handing 5% of the world a free advantage nobody asked for.
     */
    expect(Math.abs(SWITCH - MIRROR)).toBeLessThan(0.005);
    expect(Math.abs(SOUTHPAW_VS_SWITCH - MIRROR)).toBeLessThan(0.005);
  });
});
