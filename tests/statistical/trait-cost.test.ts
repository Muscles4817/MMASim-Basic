/**
 * What is a trait worth, in fights?
 *
 * Nothing in the repo had ever asked. Traits are rolled 1–3 per generated fighter, hand-authored
 * on the seed roster, and hooked into the simulator through `traitMul`/`traitAdd` — and their
 * magnitudes were set by argument, one trait at a time, with no common scale. This file is the
 * instrument, built the same way and for the same reason as the style fingerprint in docs/19
 * phase 0: **the baseline it records is a defect, and recording it is the point.**
 *
 * Measured against an identical control over paired seeds, at contender level:
 *
 * ```
 * cardioMachine     +23.4pp        chainWrestler      −1.1pp
 * volumeMachine     +14.6pp        lateStarter        −8.2pp
 * sprawlAndBrawl     +0.6pp        fastStarter       −10.5pp
 * ironChin           +0.6pp        headhunter        −16.1pp
 * finisher           +0.4pp        weightCutGambler  −16.5pp
 * ```
 *
 * For scale: **sixty rating points of `wrestling` — the difference between a fighter who cannot
 * wrestle and an all-time great — is worth 13.6 points of win rate** (`styles.test.ts`). One trait
 * is worth nearly twice that, in both directions, and a fighter can be generated carrying three.
 *
 * The two hooks doing it are `fatigueRate` and `strikeOutput`, and the sensitivity is brutal:
 * `fatigueRate` 1.12 measured −11 points, and 1.05 still measured −5.8. Every trait carrying one
 * of those as its "cost" is paying far more than its designer can have intended, and the traits
 * that read as strong buffs are the ones that carry them the other way.
 *
 * **This file does not fix any of that.** Re-scaling the hooks moves every population distribution
 * in the game and it would land in the middle of a style programme that depends on attribution
 * (docs/19 §5). It is recorded, bounded where the engine honestly is, and left for the phase that
 * owns it — with two tripwires that will fail loudly when somebody does the work.
 */

import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeFighter, type TraitId } from '@mmasim/engine';
import { runMatchup } from '../helpers/sim.js';

/**
 * Win rate for a contender carrying one trait, against an identical contender carrying none.
 *
 * Paired seeds and a fixed id, so the trait is the only thing that differs between two calls.
 */
function priceOf(trait: TraitId | 'none'): number {
  const red = makeFighter({
    id: 'fighter_trait_price',
    lastName: 'Priced',
    attributes: ARCHETYPES.contender().attributes,
    traits: trait === 'none' ? [] : [trait],
  });
  return runMatchup(red, ARCHETYPES.contender(), { fights: 1200, seedPrefix: 'trait-price' })
    .redWinRate;
}

const CONTROL = priceOf('none');
const price = (trait: TraitId) => (priceOf(trait) - CONTROL) * 100;

describe('what a trait is worth', () => {
  it('prices the two takedown traits close to neutral, which is what a fight trait should be', () => {
    /*
     * The two traits docs/19 phase 3 added, and the only two in the table whose magnitudes were
     * set by measuring rather than by argument: `chainWrestler` reads −1.1 and `sprawlAndBrawl`
     * +0.6 against the control.
     *
     * Their double edge is *situational* rather than flat — measured on the archetypes,
     * `sprawlAndBrawl` is worth +4.7 to a pure striker and −2.3 to a wrestler, which is a trait
     * doing its job. A fight trait worth twenty points in either direction is not a trait, it is
     * a rating the player cannot see.
     */
    expect(Math.abs(price('chainWrestler')), `chainWrestler ${price('chainWrestler')}`).toBeLessThan(
      5,
    );
    expect(
      Math.abs(price('sprawlAndBrawl')),
      `sprawlAndBrawl ${price('sprawlAndBrawl')}`,
    ).toBeLessThan(5);
  });

  it('is a bigger deal than any attribute, which it should not be', () => {
    /*
     * **Tripwire.** This asserts the defect rather than the design.
     *
     * `cardioMachine` is worth more than sixty rating points of anything — measured +23.4 against
     * `wrestling`'s 13.6 — because `fatigueRate` 0.78 and `recoveryRate` 1.25 are both enormous
     * and neither has a cost attached. When the hook scales are re-fitted, this breaks, and the
     * fix is to invert it to an upper bound in line with the attribute yardstick rather than to
     * delete it.
     */
    expect(price('cardioMachine'), `cardioMachine ${price('cardioMachine')}pp`).toBeGreaterThan(15);
  });

  it('charges more for a headhunter than for being a worse fighter', () => {
    /*
     * **Tripwire**, the other end of the same defect. `headhunter` measures −16.1: a trait whose
     * blurb is "looking for the one shot" costs more win rate than sixty points of `strikingOffence`
     * buys, through `strikeOutput` 0.85 alone. `weightCutGambler` is the same story at −16.5 and is
     * arguably worse, because the size advantage it pays for is real and still nowhere near enough.
     *
     * A generated fighter can carry three of these. Nothing in generation prices them.
     */
    expect(price('headhunter'), `headhunter ${price('headhunter')}pp`).toBeLessThan(-8);
  });
});
