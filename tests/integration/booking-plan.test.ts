/**
 * **What plan a player who has not opened the game-plan screen goes to the cage with.**
 *
 * Doc 31 § D19. A booking was created with `defaultGamePlan()`, which is `adaptive` at conviction
 * 0 and therefore — by construction, not by accident — makes every term in `fight/policy.ts`
 * exactly 1.0. That is the correct neutral for a fighter nobody planned for, and it was the wrong
 * default for the player's own, because the game-plan screen is the only place an intent like
 * *stay on your feet* can be expressed at all.
 *
 * So a player who booked a fight and tapped through was handed a fighter with no instructions.
 * Measured against the same fighter on his own corner's reading of him, that was **three times the
 * submission attempts** — 0.75 a fight against 0.25 — and it was the single largest term in the
 * report that produced the whole D16–D19 register.
 *
 * The engine was never wrong here, which is why this file is in the integration tier rather than
 * the statistical one: the claim is about what the *app* hands the engine, and it is checked by
 * booking a fight rather than by simulating one.
 */

import { describe, expect, it } from 'vitest';
import { createMemoryAdapter, createNewGame, setWorld } from '@mmasim/data';
import { defaultGamePlan, planFor, type Fighter } from '@mmasim/engine';
import { bookFight, saveBookingPlan } from '../../packages/app/src/game/career';

function career(seed: string) {
  const db = createNewGame({ adapter: createMemoryAdapter(), seed });
  const roster = (db.fighters.findAll() as Fighter[]).filter(
    (f) => f.retiredDay === undefined && f.promotionId,
  );
  const me = [...roster].sort((a, b) => b.starPower - a.starPower)[0]!;
  const opponent = [...roster]
    .filter((f) => f.id !== me.id && f.divisionId === me.divisionId)
    .sort((a, b) => b.starPower - a.starPower)[0] as Fighter;
  setWorld(db, { playerRole: 'fighter', playerFighterId: me.id });
  return { db, me, opponent };
}

describe('the plan a fight is booked with', () => {
  it('is the corner reading this opponent, not the neutral default', () => {
    const { db, me, opponent } = career('booking-plan-default');
    const booking = bookFight(db, me, opponent);

    expect(booking.plan.tactics).toEqual(planFor(me, opponent).tactics);
  });

  it('carries a real conviction, so the tactical layer is actually consulted', () => {
    /*
     * The half that matters mechanically. `conviction: 0` is not a mild preference — `urgencyFor`
     * returns 0 for it and every bias in `policy.ts` collapses to exactly 1.0, so a plan at zero is
     * not a quiet plan, it is *no plan*. Anything above zero means the corner is in the room.
     */
    const { db, me, opponent } = career('booking-plan-conviction');
    const booking = bookFight(db, me, opponent);

    expect(defaultGamePlan().tactics.conviction).toBe(0);
    expect(booking.plan.tactics.conviction).toBeGreaterThan(0);
    expect(booking.plan.tactics.preferredState).not.toBe('adaptive');
  });

  it('reads the opponent, so two different opponents are two different plans', () => {
    /*
     * `planFor` takes both fighters, and this is what distinguishes it from any per-fighter
     * default: booking the same player against a wrestler and against a striker has to produce
     * different instructions or the corner is not reading anything.
     */
    const { db, me } = career('booking-plan-opponent');
    const roster = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.retiredDay === undefined && f.id !== me.id && f.divisionId === me.divisionId,
    );
    const grapplers = [...roster].sort((a, b) => b.attributes.wrestling - a.attributes.wrestling);
    const wrestler = grapplers[0]!;
    const striker = [...roster].sort(
      (a, b) => b.attributes.strikingOffence - a.attributes.strikingOffence,
    )[0]!;

    // The fixture guard: if the roster hands us the same man twice there is nothing to compare.
    expect(wrestler.id).not.toBe(striker.id);

    const vsWrestler = bookFight(db, me, wrestler).plan;
    const vsStriker = bookFight(db, me, striker).plan;
    expect(vsWrestler.tactics).toEqual(planFor(me, wrestler).tactics);
    expect(vsStriker.tactics).toEqual(planFor(me, striker).tactics);
  });

  it("does not spend the player's camp for them", () => {
    /*
     * **The boundary of the fix, and it was found by breaking it.** Seeding the booking with the
     * whole of `planFor` handed the player three drilled `preppedReads` — a scarce resource, four
     * at most, sharing one camp's `drillQuality` between them — that they never chose and never
     * paid for, and it silently switched off the camp screen's "You have drilled nothing" warning,
     * which is the only thing that tells a player they have not spent it. `campQuality` came across
     * as `AI_CAMP_QUALITY`, a flat 0.7 standing in for a camp nobody simulates.
     *
     * So only `tactics` is taken. The corner has an opinion about the fight; it does not get to
     * run the camp.
     */
    const { db, me, opponent } = career('booking-plan-reads');
    const booking = bookFight(db, me, opponent);
    const neutral = defaultGamePlan();

    expect(booking.plan.preppedReads).toEqual([]);
    expect(booking.plan.campQuality).toBe(neutral.campQuality);
    expect(booking.plan.riskLevel).toBe(neutral.riskLevel);
    expect(booking.plan.targeting).toEqual(neutral.targeting);

    // ...and the corner's own plan really does carry those, so this is a difference and not a
    // coincidence of two functions happening to agree.
    expect(planFor(me, opponent).preppedReads.length).toBeGreaterThan(0);
  });

  it('is still only a starting point, which the player overwrites wholesale', () => {
    /*
     * The guard on the change: a default the player cannot get out from under would be worse than
     * the neutral one it replaced. `saveBookingPlan` replaces the plan entirely rather than merging
     * into it, so nothing the corner suggested survives a player who disagrees.
     */
    const { db, me, opponent } = career('booking-plan-override');
    const booking = bookFight(db, me, opponent);
    const mine = defaultGamePlan();

    expect(saveBookingPlan(booking, mine).plan).toEqual(mine);
  });
});
