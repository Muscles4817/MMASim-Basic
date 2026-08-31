/**
 * The decision primitive, and the metric that makes the tactical rule enforceable.
 *
 * `chooseAction` has one job that is easy to get wrong on a refactor: draw *exactly* as the
 * hand-written weighted picks it replaced did, from the same random stream in the same order. The
 * first test is that, because an engine whose fights change when nothing about fighting changed is
 * an engine nobody can rebalance.
 *
 * The rest are about `intentAuthority`, which is a new number and therefore one nobody has
 * intuitions about yet. Its semantics need pinning down before anything is asserted with it.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { actionShares, chooseAction, intentAuthority, type Candidate } from './decide.js';

type Key = 'a' | 'b' | 'c';

const candidates = (
  spec: readonly [Key, number, number, number?][],
): Candidate<Key>[] =>
  spec.map(([key, capability, intent, opportunity]) => ({ key, capability, intent, opportunity }));

describe('choosing an action', () => {
  it('draws identically to the weighted pick it replaced', () => {
    /*
     * The guard on the whole refactor. Five hand-written `pickWeighted` calls became one helper,
     * and the only acceptable outcome was that no fight anywhere resolved differently — verified
     * across 7,500 fights and 223 counters at the time, and pinned here so it stays true.
     *
     * Same stream, same items, same order, same number of draws.
     */
    const spec: [Key, number, number, number?][] = [
      ['a', 70, 1.4, 0.9],
      ['b', 35, 0.6],
      ['c', 0.35, 6.7],
    ];
    const list = candidates(spec);

    const viaHelper = createRng('decide');
    const viaHand = createRng('decide');
    for (let i = 0; i < 500; i++) {
      const helper = chooseAction(viaHelper, list);
      const hand = viaHand.pickWeighted(
        spec.map(([key]) => key),
        (key) => {
          const [, capability, intent, opportunity] = spec.find(([k]) => k === key)!;
          return opportunity === undefined
            ? capability * intent
            : capability * intent * opportunity;
        },
      );
      expect(helper, `draw ${i}`).toBe(hand);
    }
  });

  it('reports the shares it actually drew with', () => {
    // `actionShares` is diagnosis, so it has to be the same arithmetic as the draw and not a
    // second opinion about it.
    const shares = actionShares(candidates([['a', 10, 2], ['b', 10, 1], ['c', 5, 2]]));
    expect(shares.a).toBeCloseTo(20 / 40, 10);
    expect(shares.b).toBeCloseTo(10 / 40, 10);
    expect(shares.c).toBeCloseTo(10 / 40, 10);
  });

  it('treats a missing opportunity as no opinion rather than as zero', () => {
    const withOne = actionShares(candidates([['a', 10, 1, 1], ['b', 10, 1]]));
    expect(withOne.a).toBeCloseTo(withOne.b, 10);
  });

  it('treats a missing repertoire the same way, and an absent one as a gate', () => {
    // The fourth term, doc 31 § D16. Same contract as `opportunity` when it is not there...
    const withOne = actionShares([
      { key: 'a', capability: 10, intent: 1, repertoire: 1 },
      { key: 'b', capability: 10, intent: 1 },
    ]);
    expect(withOne.a).toBeCloseTo(withOne.b, 10);

    // ...and a plain multiplier on the capability side when it is.
    const gated = actionShares([
      { key: 'a', capability: 10, intent: 1, repertoire: 0.1 },
      { key: 'b', capability: 10, intent: 1 },
    ]);
    expect(gated.a).toBeCloseTo(1 / 11, 10);
  });

  it('leaves the weight bit-for-bit unchanged when no candidate declares a repertoire', () => {
    /*
     * **The property the gate's safety rests on, asserted as exact equality.**
     *
     * Floating-point multiplication is not associative and `pickWeighted` is deterministic on the
     * last bits of a weight, so adding a fourth factor to `weigh` had to leave the three-factor
     * path arithmetically identical — not merely equivalent — or every draw in every fight in the
     * game would silently reshuffle. `repertoire` is therefore appended rather than inserted, and
     * skipped entirely when absent.
     */
    const withField = actionShares([
      { key: 'a', capability: 0.7, intent: 1.3, opportunity: 0.9, repertoire: 1 },
      { key: 'b', capability: 1.1, intent: 0.6, opportunity: 1.7, repertoire: 1 },
    ]);
    const without = actionShares([
      { key: 'a', capability: 0.7, intent: 1.3, opportunity: 0.9 },
      { key: 'b', capability: 1.1, intent: 0.6, opportunity: 1.7 },
    ]);
    expect(withField.a).toBe(without.a);
    expect(withField.b).toBe(without.b);
  });
});

describe('measuring how much the plan got to say', () => {
  it('is 1 when the plan and the fighter argue at the same volume', () => {
    /*
     * The definition, stated as a case. A draw is a softmax over `ln(capability) + ln(intent)`, so
     * authority is the ratio of the two spans in that space: matching spans means a fully
     * convinced corner can exactly cancel the fighter's own preference and no more.
     */
    const list = candidates([
      ['a', 10, 1],
      ['b', 20, 0.5],
    ]);
    // ln(20/10) against ln(1/0.5) — the same span, opposite directions.
    expect(intentAuthority(list)).toBeCloseTo(1, 10);
  });

  it('rises when the actions are equally available and falls when they are not', () => {
    const even = candidates([['a', 50, 3], ['b', 50, 1]]);
    const lopsided = candidates([['a', 5, 3], ['b', 500, 1]]);

    // Nothing separates the two actions but the instruction, so the instruction decides.
    expect(intentAuthority(even)).toBe(Number.POSITIVE_INFINITY);
    // A hundred to one on capability against three to one on intent: the corner is a passenger.
    expect(intentAuthority(lopsided)).toBeLessThan(0.25);
  });

  it('counts opportunity against the plan, because that is what the plan argues with', () => {
    /*
     * `opportunity` belongs on the capability side of the ledger even though it is not a skill.
     * A submission that is only available from guard and a fighter who cannot submit anybody are
     * the same obstacle from the plan's point of view: both are reasons the instruction loses.
     */
    const free = candidates([['a', 10, 2], ['b', 10, 1]]);
    const blocked = candidates([['a', 10, 2, 0.01], ['b', 10, 1]]);

    expect(intentAuthority(free)).toBe(Number.POSITIVE_INFINITY);
    expect(intentAuthority(blocked)).toBeLessThan(1);
  });

  it('reads zero when nobody has an opinion about anything', () => {
    expect(intentAuthority(candidates([['a', 10, 1], ['b', 10, 1]]))).toBe(0);
  });

  it('ignores an action nobody can take rather than reading it as infinitely unavailable', () => {
    // A zero weight is "not on the menu", not "the most suppressed thing in the fight". Letting it
    // into the span would make every list containing an impossible action read as authority zero.
    const withImpossible = candidates([['a', 10, 2], ['b', 20, 1], ['c', 0, 5]]);
    const without = candidates([['a', 10, 2], ['b', 20, 1]]);
    expect(intentAuthority(withImpossible)).toBeCloseTo(intentAuthority(without), 10);
  });
});
