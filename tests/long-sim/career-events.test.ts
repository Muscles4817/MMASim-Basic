/**
 * Career events over years: guardrails. Doc 34 C6.
 *
 * The world's fighters now change division, ask for farewells and come back from retirement. Each
 * of those is easy to overdo — a sport where a fifth of the roster changes weight every year, or
 * where half of retirements are reversed, is not the sport. These hold the rates inside what the
 * real one does.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame, getWorld } from '@mmasim/data';
import { fighterAge, type Fighter } from '@mmasim/engine';
import { advanceWorld } from '../../packages/app/src/game/world';

const YEAR = 365;
const YEARS = 6;

describe('career events over six years', () => {
  it('stay inside the sport’s own rates', () => {
    const db = createNewGame({ adapter: undefined, era: '2026' });
    const start = getWorld(db).day;
    const activeAtStart = (db.fighters.findAll() as Fighter[]).filter(
      (f) => f.retiredDay === undefined,
    ).length;
    for (let y = 0; y < YEARS; y++) advanceWorld(db, start + y * YEAR, start + (y + 1) * YEAR, {});

    const all = db.fighters.findAll() as Fighter[];

    // Division moves: a few percent of the sport a year, not nobody and not a fifth of it.
    const moved = all.filter(
      (f) => f.lastDivisionChangeDay !== undefined && f.lastDivisionChangeDay >= start,
    ).length;
    const perYear = moved / YEARS / activeAtStart;
    expect(perYear, 'share of the sport changing division a year').toBeGreaterThan(0.01);
    expect(perYear).toBeLessThan(0.1);

    // Retirement ages: the middle of the sport's thirties, with a spread.
    const retired = all.filter((f) => f.retiredDay !== undefined && f.retiredDay >= start);
    const ages = retired.map((f) => fighterAge(f, f.retiredDay!)).sort((a, b) => a - b);
    const median = ages[Math.floor(ages.length / 2)]!;
    expect(retired.length).toBeGreaterThan(50);
    expect(median, 'median retirement age').toBeGreaterThanOrEqual(32);
    expect(median).toBeLessThanOrEqual(38);

    // Farewells: a real share of how careers end, not the usual way.
    const farewells = retired.filter((f) => (f.notes ?? '').includes('farewell')).length;
    expect(farewells / retired.length, 'share of retirements that were farewells').toBeLessThan(
      0.4,
    );

    // Comebacks: some, never most.
    const comebacks = all.filter((f) => f.comebackDay !== undefined && f.comebackDay >= start);
    const rate = comebacks.length / (retired.length + comebacks.length);
    expect(rate, 'comebacks against retirements').toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.25);
  }, 900_000);
});
