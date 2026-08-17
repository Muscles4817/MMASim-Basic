/**
 * Does a generated fighter's label agree with their numbers?
 *
 * Traits are the most *legible* thing about a fighter — the scouting report leads with them and
 * the profile screen puts them above the ratings — and until docs/19 phase 3 they were drawn
 * uniformly from the table with no reference to the person they were being attached to. A
 * `cardioMachine` who gasses and a `headhunter` who cannot punch arrived at exactly the rate
 * chance produces them, which is often.
 *
 * These are assertions about *coherence*, not balance: nothing here claims a trait should be rare
 * or common, only that it should land on somebody it describes.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { asDivisionId } from '../core/ids.js';
import { TRAITS, type TraitId } from '../domain/traits.js';
import { uniformAttributes } from '../ratings/attributes.js';
import { generateFighter, generateTraits, traitFit } from './generation.js';

/** A roster big enough for a correlation to mean something. */
function roster(count: number) {
  const rng = createRng('generation-test');
  return Array.from({ length: count }, (_, i) =>
    generateFighter(rng.fork(`f${i}`), {
      id: `fighter_gen_${i}`,
      divisionId: asDivisionId('mens-lightweight'),
      sex: 'male',
      day: 0,
    }),
  );
}

/**
 * Two thousand, because six hundred could not resolve the effect it is asserting.
 *
 * At 600 the `ironChin` split read +2.2 points of durability against a standard error of 1.8 —
 * a real effect the sample could not see, which is the failure mode this repo has now hit three
 * times (docs/19 §7.4 F4 and F6, §8.1 F8). Two thousand costs a second and reads +6.5.
 */
const FIGHTERS = roster(2000);

/** Mean rating among fighters who carry the trait, against everybody else. */
function split(trait: TraitId, key: 'cardio' | 'durability' | 'power' | 'wrestling') {
  const withTrait = FIGHTERS.filter((f) => f.traits.includes(trait));
  const without = FIGHTERS.filter((f) => !f.traits.includes(trait));
  const mean = (xs: typeof FIGHTERS) => xs.reduce((a, f) => a + f.attributes[key], 0) / xs.length;
  return { n: withTrait.length, with: mean(withTrait), without: mean(without) };
}

describe('traitFit', () => {
  it('is neutral for a trait that says nothing about ratings', () => {
    // Most business and camp traits are like this, and it matters that they stay uniform: a
    // `mercenary` can be anybody, and inventing a correlation would be worse than no weighting.
    expect(TRAITS.mercenary.affinity).toBeUndefined();
    expect(traitFit(TRAITS.mercenary, uniformAttributes(20))).toBe(1);
    expect(traitFit(TRAITS.mercenary, uniformAttributes(90))).toBe(1);
  });

  it('reads the attribute the trait is about, in the direction it is about it', () => {
    const strong = { ...uniformAttributes(50), cardio: 90 };
    const weak = { ...uniformAttributes(50), cardio: 20 };
    expect(traitFit(TRAITS.cardioMachine, strong)).toBeGreaterThan(
      traitFit(TRAITS.cardioMachine, weak),
    );
    // `chinny` inverts: it belongs on the fighter whose durability is gone.
    expect(traitFit(TRAITS.chinny, { ...uniformAttributes(50), durability: 20 })).toBeGreaterThan(
      traitFit(TRAITS.chinny, { ...uniformAttributes(50), durability: 90 }),
    );
  });

  it('never rules a trait out completely', () => {
    /*
     * The floor is the point of the design rather than a safety valve. A heavyweight with no
     * engine who fights like a cardio machine anyway is a fighter worth meeting, and a generator
     * that can only produce coherent people produces a roster with no texture at all.
     */
    expect(traitFit(TRAITS.cardioMachine, { ...uniformAttributes(50), cardio: 5 })).toBeGreaterThan(
      0,
    );
    expect(traitFit(TRAITS.ironChin, { ...uniformAttributes(50), durability: 5 })).toBeGreaterThan(
      0,
    );
  });
});

describe('generated fighters wear traits that describe them', () => {
  it('gives the cardio traits to the fighters with the engine', () => {
    // Measured over 2,000 generated fighters: carriers average 50.2 cardio against 41.8 for
    // everybody else, on a population whose standard deviation is 11.3. Before the weighting the
    // two were the same number, because the draw could not see the fighter.
    const cardio = split('cardioMachine', 'cardio');
    expect(cardio.n, 'nobody was generated with the trait').toBeGreaterThan(40);
    expect(cardio.with, JSON.stringify(cardio)).toBeGreaterThan(cardio.without + 3);
  });

  it('gives the chin traits to the fighters with the chin, and takes them off the ones without', () => {
    // Iron Chin 48.4 against 42.0, and Glass Cannon — the same attribute, the other direction —
    // 38.3 against 42.8. The pair is the sharper test: an affinity table that only ever pushed
    // upward would pass half of this.
    const iron = split('ironChin', 'durability');
    const glass = split('glassCannon', 'durability');
    expect(iron.n, 'nobody was generated with the trait').toBeGreaterThan(40);
    expect(iron.with, JSON.stringify(iron)).toBeGreaterThan(iron.without + 3);
    expect(glass.with, JSON.stringify(glass)).toBeLessThan(glass.without - 2);
  });

  it('gives the wrestling traits to wrestlers', () => {
    // 43.3 against 36.7. The trait that gave `takedownRate` its first writer should land on
    // somebody who can wrestle, or the hook is being pulled by the wrong hand.
    const chain = split('chainWrestler', 'wrestling');
    expect(chain.n, 'nobody was generated with the trait').toBeGreaterThan(30);
    expect(chain.with, JSON.stringify(chain)).toBeGreaterThan(chain.without + 3);
  });

  it('still produces the unlikely combination sometimes', () => {
    /*
     * The other half of the claim, and the one a coherence change is most likely to break: a
     * roster where every label is earned is a roster with no surprises in it. Measured, 176 of the
     * 2,000 carry one of these three traits against ratings that argue with it — about one fighter
     * in eleven, which is the texture the floor exists to preserve.
     */
    const contradictions = FIGHTERS.filter(
      (f) =>
        (f.traits.includes('cardioMachine') && f.attributes.cardio < 50) ||
        (f.traits.includes('ironChin') && f.attributes.durability < 50) ||
        (f.traits.includes('chainWrestler') && f.attributes.wrestling < 50),
    );
    expect(contradictions.length, 'the generator has become too tidy').toBeGreaterThan(0);
  });

  it('leaves the unweighted call unweighted, so the editor and tests are unaffected', () => {
    // `generateTraits` without attributes is still the uniform draw. Callers that have no fighter
    // yet — the editor's randomiser, fixtures — must not be forced to invent one.
    const rng = createRng('unweighted');
    expect(generateTraits(rng.fork('a'), 2)).toHaveLength(2);
  });
});
