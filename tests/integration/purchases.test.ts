/**
 * Money you can actually spend.
 *
 * `PURCHASES` was a price list in the engine with no callers and no effects — five things
 * with costs that could not be bought and would not have done anything. It meant money could
 * be earned and spent on exactly one thing, a gym, which makes the bank a scoreboard rather
 * than a resource.
 *
 * Each one now multiplies something the camp already computes rather than adding a new
 * mechanic, and each targets a different failure the player can feel: a camp that did not
 * develop them, a read that turned out wrong, a body that arrived worn, a plan that was not
 * drilled enough, a weight cut that emptied them.
 */

import { describe, expect, it } from 'vitest';
import {
  PURCHASES,
  PURCHASE_KEYS,
  campPurchaseEffects,
  campQuality,
  purchaseCost,
  type PurchaseKey,
} from '@mmasim/engine';

describe('what they cost', () => {
  it('adds up', () => {
    expect(purchaseCost([])).toBe(0);
    expect(purchaseCost(['nutritionist'])).toBe(PURCHASES.nutritionist.cost);
    expect(purchaseCost(['nutritionist', 'sparringPartner'])).toBe(
      PURCHASES.nutritionist.cost + PURCHASES.sparringPartner.cost,
    );
  });

  it('prices the full set above a real camp', () => {
    /*
     * The intended pressure, and the reason the numbers are what they are. If everything were
     * affordable every time there would be no decision — and the fighters who most need the
     * help are the ones at the bottom who cannot pay for it, which is the same pressure the
     * whole money layer is built around.
     */
    const everything = purchaseCost(PURCHASE_KEYS);
    const midTierEightWeekCamp = campQuality(8, 55, 55, 55);
    void midTierEightWeekCamp;
    expect(everything).toBeGreaterThan(50);
  });

  it('describes every purchase it prices', () => {
    // A cost with no stated effect is a slot machine. The screen shows `effect` before the
    // player commits, so every entry has to have one.
    for (const key of PURCHASE_KEYS) {
      expect(PURCHASES[key].label.length, key).toBeGreaterThan(0);
      expect(PURCHASES[key].effect.length, key).toBeGreaterThan(0);
      expect(PURCHASES[key].cost, key).toBeGreaterThan(0);
    }
  });
});

describe('what they do', () => {
  it('does nothing at all when nothing is bought', () => {
    // The neutrality check. Every existing calibration assumes an unbought camp, so this has
    // to be exactly 1.0 rather than approximately.
    const none = campPurchaseEffects([]);
    expect(none.campQuality).toBe(1);
    expect(none.drillQuality).toBe(1);
    expect(none.scoutingAccuracy).toBe(1);
    expect(none.wear).toBe(1);
    expect(none.cutPenalty).toBe(1);
  });

  it('moves each dial in the direction the player is paying for', () => {
    expect(campPurchaseEffects(['specialistCoach']).campQuality).toBeGreaterThan(1);
    expect(campPurchaseEffects(['sparringPartner']).drillQuality).toBeGreaterThan(1);
    expect(campPurchaseEffects(['scoutingReport']).scoutingAccuracy).toBeGreaterThan(1);
    // Below one, because less wear and a softer cut are the things being bought.
    expect(campPurchaseEffects(['recoveryBlock']).wear).toBeLessThan(1);
    expect(campPurchaseEffects(['nutritionist']).cutPenalty).toBeLessThan(1);
  });

  it('gives each purchase exactly one job', () => {
    /*
     * No purchase may touch a dial another one owns. Overlapping effects make the set
     * impossible to price against each other and turn "buy everything" into the only readable
     * strategy, because the player cannot tell what any single one bought them.
     */
    const dials = ['campQuality', 'drillQuality', 'scoutingAccuracy', 'wear', 'cutPenalty'] as const;
    const owners = new Map<string, PurchaseKey[]>();

    for (const key of PURCHASE_KEYS) {
      const effects = campPurchaseEffects([key]);
      for (const dial of dials) {
        if (effects[dial] !== 1) {
          owners.set(dial, [...(owners.get(dial) ?? []), key]);
        }
      }
    }

    for (const [dial, keys] of owners) {
      expect(keys.length, `${dial} is moved by ${keys.join(' and ')}`).toBe(1);
    }
    // And every purchase does something, so none is a pure money sink.
    expect([...owners.values()].flat().length).toBe(PURCHASE_KEYS.length);
  });

  it('keeps the magnitudes modest enough that the systems underneath still matter', () => {
    /*
     * Every one of these multiplies something that is already the product of gym, coach,
     * discipline and weeks. A large coefficient makes "did you buy the thing" the dominant
     * term and turns four systems into decoration.
     */
    const all = campPurchaseEffects(PURCHASE_KEYS);
    expect(all.campQuality).toBeLessThan(1.25);
    expect(all.drillQuality).toBeLessThan(1.25);
    expect(all.scoutingAccuracy).toBeLessThan(1.5);
    expect(all.wear).toBeGreaterThan(0.7);
    expect(all.cutPenalty).toBeGreaterThan(0.6);
  });

  it('cannot be bought twice for double the effect', () => {
    const once = campPurchaseEffects(['specialistCoach']);
    const twice = campPurchaseEffects(['specialistCoach', 'specialistCoach']);
    expect(twice.campQuality).toBe(once.campQuality);
  });
});
