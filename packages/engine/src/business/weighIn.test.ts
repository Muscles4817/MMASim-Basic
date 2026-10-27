/**
 * The weigh-in roll. Doc 34 C6.
 */

import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import { generateFighter } from '../progression/generation.js';
import { appraiseDivisionMove, weightMissRisk } from '../progression/divisionMove.js';
import {
  EGREGIOUS_MISS_LBS,
  catchweightFor,
  opponentTakesCatchweight,
  rollWeighIn,
} from './weighIn.js';

const fighter = (division: string, i = 0) =>
  generateFighter(createRng(`weighin:${division}:${i}`), {
    id: `w_${division}_${i}`,
    divisionId: asDivisionId(division),
    sex: 'male',
    day: 0,
  });

/** A stream whose every chance comes up. */
const always = (rng: Rng): Rng => ({ ...rng, chance: () => true });

describe('the risk', () => {
  it('is the one the division-move appraisal shows', () => {
    const f = fighter('mens-welterweight');
    const target = asDivisionId('mens-lightweight');
    expect(appraiseDivisionMove(f, target, [50], 50).weightMissRisk).toBe(
      weightMissRisk(f, target),
    );
  });

  it('is far higher for a body that belongs two divisions up', () => {
    const f = fighter('mens-middleweight');
    expect(weightMissRisk(f, asDivisionId('mens-lightweight'))).toBeGreaterThan(
      weightMissRisk(f, asDivisionId('mens-middleweight')) + 0.2,
    );
  });
});

describe('the scale', () => {
  it('forfeits a fifth of the show purse for a miss, three tenths for an egregious one', () => {
    let saw = { normal: false, egregious: false };
    for (let i = 0; i < 60; i++) {
      const r = rollWeighIn({
        fighter: fighter('mens-middleweight', i),
        divisionId: asDivisionId('mens-featherweight'),
        showPurse: 100,
        rng: always(createRng(`scale:${i}`)),
      });
      expect(r.made).toBe(false);
      expect(r.overLbs).toBeGreaterThan(0);
      expect(r.egregious).toBe((r.overLbs ?? 0) > EGREGIOUS_MISS_LBS);
      expect(r.forfeit).toBe(r.egregious ? 30 : 20);
      saw = { normal: saw.normal || !r.egregious, egregious: saw.egregious || r.egregious };
    }
    expect(saw).toEqual({ normal: true, egregious: true });
  });

  it('costs nothing when they make it', () => {
    const r = rollWeighIn({
      fighter: fighter('mens-lightweight'),
      divisionId: asDivisionId('mens-lightweight'),
      showPurse: 100,
      rng: { ...createRng('make'), chance: () => false },
    });
    expect(r).toMatchObject({ made: true, forfeit: 0, egregious: false });
  });

  it('sets the catchweight at the heaviest scale weight, rounded up', () => {
    expect(
      catchweightFor([
        {
          fighterId: 'a' as never,
          made: false,
          limitLbs: 155,
          overLbs: 2.4,
          egregious: false,
          forfeit: 2,
        },
        { fighterId: 'b' as never, made: true, limitLbs: 155, egregious: false, forfeit: 0 },
      ]),
    ).toBe(158);
    expect(catchweightFor([])).toBeUndefined();
  });
});

describe('the opponent', () => {
  it('takes most small misses and refuses more of the big ones', () => {
    const opponent = fighter('mens-lightweight', 1);
    const rate = (overLbs: number) => {
      let yes = 0;
      for (let i = 0; i < 400; i++) {
        const missed = {
          fighterId: 'x' as never,
          made: false,
          limitLbs: 155,
          overLbs,
          egregious: overLbs > EGREGIOUS_MISS_LBS,
          forfeit: 1,
        };
        if (opponentTakesCatchweight({ opponent, missed, rng: createRng(`opp:${overLbs}:${i}`) })) {
          yes += 1;
        }
      }
      return yes / 400;
    };
    expect(rate(0.8)).toBeGreaterThan(0.7);
    expect(rate(6)).toBeLessThan(rate(0.8) - 0.2);
  });
});
