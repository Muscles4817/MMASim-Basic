/**
 * Does a biased commentator actually mislead anybody?
 *
 * This is the load-bearing claim of `broadcast.ts`, and it is a population property rather
 * than a per-fight one: a single fight tells you nothing, because a booth that is wrong
 * about one round may be wrong by luck. The first version of this check lived in the unit
 * suite at 150 fights and measured a 4.3-point gap against a 5-point assertion — the effect
 * was real and the sample simply could not resolve it. That is what this tier is for.
 *
 * The property asserted is **monotonicity**, not a magnitude: agreement with the judges
 * should fall as the booth's style bias grows, in both directions, because the judges sit
 * between the two extremes. A threshold on a single number would be an arbitrary line; a
 * monotone trend is the actual design claim.
 */

import { describe, expect, it } from 'vitest';
import { ARCHETYPES, asOfficialId, impressionAccuracy, simulateFight } from '@mmasim/engine';
import type { Commentator, FightResult } from '@mmasim/engine';

const booth = (styleBias: number): Commentator => ({
  id: asOfficialId('cm_sweep'),
  name: 'Sweep',
  styleBias,
  hype: 50,
  companyLine: 50,
  catchphrases: [],
});

/**
 * A control wrestler against a pure striker.
 *
 * Deliberately the matchup that most divides a real broadcast: one man is winning on the
 * cards and the other is winning the highlight reel.
 */
function fights(n: number): FightResult[] {
  return Array.from({ length: n }, (_, i) =>
    simulateFight({
      boutId: `bias_${i}`,
      seed: `bias_${i}`,
      red: { fighter: ARCHETYPES.smotherer() },
      blue: { fighter: ARCHETYPES.striker() },
    }),
  );
}

function agreementRate(styleBias: number, results: readonly FightResult[]): number {
  let agreed = 0;
  let rounds = 0;
  for (const result of results) {
    const x = impressionAccuracy(booth(styleBias), result);
    agreed += x.agreed;
    rounds += x.rounds;
  }
  return agreed / rounds;
}

describe('a biased booth misleads the audience', () => {
  /*
   * 1,600 fights, up from 400, and for the reason this file's own header describes happening to
   * its 150-fight ancestor: the effect is real and the sample could not resolve it.
   *
   * Measured across bias levels 0 / 0.3 / 0.6 / 0.9 — at n=400, agreement runs 0.8519 / 0.8586 /
   * 0.8473 / 0.8416, so the first two are *inverted* and the monotone chain below was passing on
   * luck. At 1,600 it is 0.8576 / 0.8487 / 0.8366 / 0.8273 and at 4,000 it is 0.8652 / 0.8531 /
   * 0.8395 / 0.8282 — clean, and the same ordering both times. Adjacent bias levels differ by
   * about a point of agreement, which 400 fights cannot see.
   *
   * Found when phase 1's weapon primitive shifted the seeded stream and the inversion surfaced.
   * The change did not break this property; it exposed a sample that was too small to state it.
   */
  const results = fights(1600);

  it('agrees with the judges less the more biased it is', () => {
    const neutral = agreementRate(0, results);
    const mild = agreementRate(0.3, results);
    const strong = agreementRate(0.6, results);
    const extreme = agreementRate(0.9, results);

    expect(neutral).toBeGreaterThan(mild);
    expect(mild).toBeGreaterThan(strong);
    expect(strong).toBeGreaterThan(extreme);
  });

  it('misleads in both directions, because the judges sit in the middle', () => {
    // A grappling obsessive is not a *better* commentator, only a differently wrong one.
    expect(agreementRate(0, results)).toBeGreaterThan(agreementRate(-0.9, results));
  });

  it('is wrong often enough for a player to notice, and not so often it is useless', () => {
    // A booth that agrees with the judges 99% of the time is decoration; one that agrees
    // 60% of the time is noise nobody would listen to twice.
    const extreme = agreementRate(0.9, results);
    expect(extreme).toBeGreaterThan(0.7);
    expect(extreme).toBeLessThan(0.88);
  });

  it('still gets an even-handed read broadly right', () => {
    expect(agreementRate(0, results)).toBeGreaterThan(0.85);
  });
});
