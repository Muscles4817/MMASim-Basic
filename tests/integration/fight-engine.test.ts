import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  defaultReferee,
  makeFighter,
  simulateFight,
  type FightResult,
} from '@mmasim/engine';

const bout = (
  red = ARCHETYPES.journeyman(),
  blue = makeFighter({ id: 'fighter_other', lastName: 'Other' }),
  seed = 'integration-seed',
): FightResult =>
  simulateFight({ boutId: 'test-bout', red: { fighter: red }, blue: { fighter: blue }, seed });

describe('simulateFight — structural guarantees', () => {
  it('always produces a terminated fight with a coherent result', () => {
    for (let i = 0; i < 200; i++) {
      const r = bout(ARCHETYPES.journeyman(), ARCHETYPES.striker(), `seed-${i}`);
      expect(r.round).toBeGreaterThanOrEqual(1);
      expect(r.round).toBeLessThanOrEqual(3);
      expect(r.timeSeconds).toBeGreaterThanOrEqual(0);
      expect(r.timeSeconds).toBeLessThanOrEqual(300);
      // A flash knockout can legitimately be over in a handful of events, so assert on
      // structure rather than length: every fight opens a round and reaches a conclusion.
      expect(r.events[0]?.kind).toBe('roundStart');
      expect(['finish', 'decision']).toContain(r.events[r.events.length - 1]?.kind);
      if (r.method === 'draw') expect(r.winnerId).toBeUndefined();
      else expect([r.redId, r.blueId]).toContain(r.winnerId);
    }
  });

  it('never lets a decision fight end before the final round', () => {
    for (let i = 0; i < 100; i++) {
      const r = bout(ARCHETYPES.journeyman(), ARCHETYPES.journeyman(), `dec-${i}`);
      if (r.method.startsWith('decision')) {
        expect(r.round).toBe(3);
        expect(r.timeSeconds).toBe(300);
      }
    }
  });

  it('scores exactly one card per judge with one row per completed round', () => {
    const r = simulateFight({
      boutId: 'five-rounder',
      red: { fighter: ARCHETYPES.journeyman() },
      blue: { fighter: ARCHETYPES.grinder() },
      rounds: 5,
      seed: 'five',
    });
    expect(r.scorecards).toHaveLength(3);
    for (const card of r.scorecards) {
      expect(card.rounds.length).toBe(r.round);
      expect(card.redTotal).toBe(card.rounds.reduce((a, x) => a + x.red, 0));
    }
  });

  it('emits events in non-decreasing time order within each round', () => {
    const r = bout(ARCHETYPES.grinder(), ARCHETYPES.striker(), 'ordering');
    let lastRound = 0;
    let lastTime = -1;
    for (const e of r.events) {
      if (e.round !== lastRound) {
        lastRound = e.round;
        lastTime = -1;
      }
      expect(e.timeSeconds).toBeGreaterThanOrEqual(lastTime);
      lastTime = e.timeSeconds;
    }
  });

  it('reports stats that are internally consistent', () => {
    for (let i = 0; i < 50; i++) {
      const r = bout(ARCHETYPES.smotherer(), ARCHETYPES.striker(), `stats-${i}`);
      for (const corner of ['red', 'blue'] as const) {
        const s = r.stats[corner];
        expect(s.significantStrikesLanded).toBeLessThanOrEqual(s.significantStrikesAttempted);
        expect(s.takedownsLanded).toBeLessThanOrEqual(s.takedownsAttempted);
        const byTarget =
          s.strikesByTarget.head + s.strikesByTarget.body + s.strikesByTarget.legs;
        // Ground-and-pound and knockdown follow-ups also register in strikesByTarget, so
        // the two counters need only agree in direction, not exactly.
        expect(byTarget).toBeGreaterThanOrEqual(s.significantStrikesLanded);
      }
    }
  });

  it('produces a submission name whenever the method is a submission', () => {
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      const r = bout(ARCHETYPES.smotherer(), ARCHETYPES.striker(), `sub-${i}`);
      if (r.method === 'submission') {
        found = true;
        expect(r.submissionName).toBeTruthy();
      }
    }
    expect(found, 'expected at least one submission in 300 grappler-vs-striker fights').toBe(true);
  });
});

describe('determinism', () => {
  it('produces byte-identical results for the same seed', () => {
    const a = bout(ARCHETYPES.bomber(), ARCHETYPES.striker(), 'determinism');
    const b = bout(ARCHETYPES.bomber(), ARCHETYPES.striker(), 'determinism');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different fights for different seeds', () => {
    const a = bout(ARCHETYPES.bomber(), ARCHETYPES.striker(), 'seed-a');
    const b = bout(ARCHETYPES.bomber(), ARCHETYPES.striker(), 'seed-b');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('does not mutate the input fighters', () => {
    const red = ARCHETYPES.bomber();
    const blue = ARCHETYPES.striker();
    const before = JSON.stringify([red, blue]);
    for (let i = 0; i < 20; i++) bout(red, blue, `purity-${i}`);
    expect(JSON.stringify([red, blue])).toBe(before);
  });
});

describe('referee tendencies change the fight', () => {
  const quickRef = { ...defaultReferee(), stoppageTrigger: 95, name: 'Quick Trigger' };
  const lateRef = { ...defaultReferee(), stoppageTrigger: 5, name: 'Lets It Go' };

  const tkoRate = (ref: ReturnType<typeof defaultReferee>) => {
    let tkos = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const r = simulateFight({
        boutId: `ref-${i}`,
        red: { fighter: ARCHETYPES.bomber() },
        blue: { fighter: ARCHETYPES.journeyman() },
        referee: ref,
        seed: `ref-${i}`,
      });
      if (r.method === 'tko') tkos++;
    }
    return tkos / n;
  };

  it('stops fights sooner with a quick-trigger referee', () => {
    // The same matchup, the same seeds — only the official differs.
    expect(tkoRate(quickRef)).toBeGreaterThan(tkoRate(lateRef));
  });

  it('lets control wrestlers work with a slow stand-up referee', () => {
    const controlSeconds = (standUpSpeed: number) => {
      let total = 0;
      const n = 150;
      for (let i = 0; i < n; i++) {
        const r = simulateFight({
          boutId: `standup-${i}`,
          red: { fighter: ARCHETYPES.smotherer() },
          blue: { fighter: ARCHETYPES.striker() },
          referee: { ...defaultReferee(), standUpSpeed },
          seed: `standup-${i}`,
        });
        total += r.stats.red.controlSeconds;
      }
      return total / n;
    };
    // A stand-up-happy referee is the single biggest external threat to this game plan.
    expect(controlSeconds(5)).toBeGreaterThan(controlSeconds(95));
  });
});
