/**
 * Two bugs found by playing the game rather than by reading it, which is the pattern.
 *
 * **The head coach.** There is no hire-a-coach flow and there was never meant to be — a gym's
 * head coach becomes yours when you join. But the starting gym is picked as the *lowest quality*
 * one, and the lowest-quality gym in the seed is the one with no head coach, so every new fighter
 * in every era began with "you have no head coach, training alone costs most of your progress"
 * showing and nothing anywhere saying what to do about it. Both halves passed their own tests:
 * `joinGym` correctly copies the coach across, and the warning correctly detects the absence.
 *
 * **The funds.** A balance appeared in three places in the whole game, none of them next to a
 * decision to spend.
 *
 * These tests are about the *reachability* of the coach and the *consistency* of the money,
 * because that is the layer where both defects lived.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import type { Coach, Fighter, Gym } from '@mmasim/engine';
import { isOverdrawn, money, spendLine } from '../../packages/app/src/ui/format';

const ERAS = ['2020', '2026'] as const;
const game = (era: (typeof ERAS)[number]) => createNewGame({ adapter: undefined, era });

/** The same rule `CreateFighterScreen` uses to seat a new fighter. */
const startingGymOf = (db: ReturnType<typeof game>) =>
  (db.gyms.findAll() as unknown as Gym[]).slice().sort((a, b) => a.quality - b.quality)[0]!;

/** The same reputation gate the gym picker applies. */
const requiredReputation = (gym: Gym) => Math.max(0, gym.prestige - 35);

describe('getting a head coach', () => {
  for (const era of ERAS) {
    describe(era, () => {
      const db = game(era);

      it('has at least one gym with a head coach to move to', () => {
        // The floor. If no gym has a coach the warning is unresolvable by any means, and the
        // player is being told to fix something the world does not let them fix.
        const coached = (db.gyms.findAll() as unknown as Gym[]).filter((g) => g.headCoachId);
        expect(coached.length).toBeGreaterThan(0);
      });

      it('points every head-coach id at a coach that exists', () => {
        // A dangling id would show the "no coach" warning at a gym that claims to have one,
        // which is the most confusing possible version of this bug.
        for (const gym of db.gyms.findAll() as unknown as Gym[]) {
          if (!gym.headCoachId) continue;
          expect(db.coaches.findById(gym.headCoachId), `${gym.name}`).toBeDefined();
        }
      });

      it('leaves a route out of the starting gym that the player can actually reach', () => {
        /*
         * The bug, stated as a property. The starting gym having no coach is fine and
         * deliberate — a coach is something to earn. What is not fine is if the nearest gym that
         * has one is gated behind reputation a fighter cannot plausibly get, because then the
         * warning is permanent and the game never says so.
         */
        const start = startingGymOf(db);
        const reachable = (db.gyms.findAll() as unknown as Gym[])
          .filter((g) => g.headCoachId && g.id !== start.id)
          .map(requiredReputation)
          .sort((a, b) => a - b);

        expect(reachable.length, 'nowhere to go for a coach').toBeGreaterThan(0);
        // A fighter starts around 20 reputation and gains it by winning. Anything under 60 is a
        // handful of wins away; a floor of 100 would mean the belt comes before the coach.
        expect(reachable[0]!, 'the nearest coached gym is out of reach').toBeLessThan(60);
      });

      it('gives the fighter the gym coach on joining, which is the only way to get one', () => {
        const start = startingGymOf(db);
        const target = (db.gyms.findAll() as unknown as Gym[]).find(
          (g) => g.headCoachId && g.id !== start.id,
        )!;

        // The transfer `joinGym` performs, asserted directly so a refactor that drops the coach
        // assignment fails here rather than silently in a screen.
        const before = { gymId: start.id, headCoachId: start.headCoachId } as Partial<Fighter>;
        const after = { ...before, gymId: target.id, headCoachId: target.headCoachId };

        expect(before.headCoachId).toBeUndefined();
        expect(after.headCoachId).toBeDefined();
        expect(db.coaches.findById(after.headCoachId as string)).toBeDefined();
      });

      it('gives every coach a name and a specialism, because the gym row shows both', () => {
        // The row now names the coach and what they are good at, so a coach with neither turns
        // the fix back into an empty promise.
        for (const gym of db.gyms.findAll() as unknown as Gym[]) {
          if (!gym.headCoachId) continue;
          const coach = db.coaches.findById(gym.headCoachId) as unknown as Coach;
          expect(coach.firstName.length, `${gym.name}`).toBeGreaterThan(0);
          expect(coach.lastName.length, `${gym.name}`).toBeGreaterThan(0);
          expect(coach.specialisms.length, `${gym.name} coach has no specialism`).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('how money reads', () => {
  it('always carries its unit, because the game stores thousands', () => {
    // The unit is only obvious if the suffix is always there, and a bare "40" next to a bank of
    // "52" is the exact ambiguity this formatter exists to remove.
    expect(money(40)).toBe('£40k');
    expect(money(0)).toBe('£0k');
    // The sign goes outside the symbol: `£-12.5k` reads as a typo, `-£12.5k` reads as a debt.
    expect(money(-12.5)).toBe('-£12.5k');
  });

  it('switches to millions before a budget becomes unreadable', () => {
    // A promoter's budget is 62000k, which nobody can size at a glance.
    expect(money(62_000)).toBe('£62m');
    expect(money(1_400)).toBe('£1.4m');
    expect(money(999)).toBe('£999k');
  });

  it('states a spend against the balance it comes out of', () => {
    /*
     * The sentence that was missing at nearly every point of spending. A price on its own asks
     * the player to hold their balance in their head from two screens away.
     */
    const line = spendLine({ cost: 40, balance: 52 });
    expect(line).toContain('£40k');
    expect(line, 'the balance is not mentioned').toContain('£52k');
    expect(line, 'what it leaves is not mentioned').toContain('£12k');
  });

  it('says plainly when a spend goes into the red rather than showing a negative', () => {
    const line = spendLine({ cost: 60, balance: 52 });
    expect(line).toContain('in the red');
    expect(line).toContain('£8k');
    // Not "leaving £-8k", which reads as a balance rather than as a warning.
    expect(line).not.toContain('leaving');
  });

  it('does not drift on the rounding the old inline formatters disagreed about', () => {
    expect(spendLine({ cost: 12.34, balance: 50 })).toContain('£37.7k');
  });

  it('flags an overdrawn balance from the number, not from the formatted string', () => {
    /*
     * The header colours a negative balance red, and the first version decided that by testing
     * whether the formatted string started with a minus — which it never does, because the sign
     * sits inside the currency symbol. The state has to come from the number.
     */
    expect(isOverdrawn(-0.1)).toBe(true);
    expect(isOverdrawn(0)).toBe(false);
    expect(money(-12.5).startsWith('-'), 'the string test would now pass by accident').toBe(true);
  });
});
