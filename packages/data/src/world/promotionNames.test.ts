import { describe, expect, it } from 'vitest';
import { PROMOTIONS_2026 } from '../seed/organisations-2026.js';
import { SEED_PROMOTIONS } from '../seed/organisations.js';
import {
  createPromotionNamer,
  type PromotionIdentity,
  type PyramidRung,
} from './promotionNames.js';

/** A Large world's pyramid with room to spare: one apex, four majors, 15, 30 and 160 local shows. */
const LARGE: readonly [PyramidRung, number][] = [
  ['apex', 1],
  ['major', 4],
  ['national', 15],
  ['feeder', 30],
  ['local', 160],
];

function nameWorld(seed: string): { rung: PyramidRung; identity: PromotionIdentity }[] {
  const nameFor = createPromotionNamer(seed);
  return LARGE.flatMap(([rung, count]) =>
    Array.from({ length: count }, () => ({ rung, identity: nameFor(rung) })),
  );
}

const SEEDS = ['generated-small', 'generated-medium', 'generated-large', 'a', 'b', 'c', 'd', 'e'];

describe('generated promotion names', () => {
  it('never gives two promotions the same name or short name', () => {
    for (const seed of SEEDS) {
      const names = nameWorld(seed).map((n) => n.identity);
      expect(new Set(names.map((n) => n.name)).size).toBe(names.length);
      expect(new Set(names.map((n) => n.shortName)).size).toBe(names.length);
    }
  });

  it('never takes a name from a hand-authored era', () => {
    const real = [...PROMOTIONS_2026, ...SEED_PROMOTIONS];
    const realNames = new Set(real.map((p) => p.name));
    const realShorts = new Set(real.map((p) => p.shortName));
    for (const seed of SEEDS) {
      for (const { identity } of nameWorld(seed)) {
        expect(realNames.has(identity.name)).toBe(false);
        expect(realShorts.has(identity.shortName)).toBe(false);
      }
    }
  });

  it('names the same world the same way every time', () => {
    expect(nameWorld('generated-medium')).toEqual(nameWorld('generated-medium'));
    expect(nameWorld('generated-medium')).not.toEqual(nameWorld('generated-large'));
  });

  it('does not rename the top of the sport when the base gets bigger', () => {
    const small = createPromotionNamer('s');
    const big = createPromotionNamer('s');
    // Interleaved differently: the majors must not depend on how many local shows came first.
    const a = [small('local'), small('major')];
    const b = [big('local'), big('local'), big('local'), big('major')];
    expect(a[1]).toEqual(b[3]);
  });

  it('never leaks the pyramid rung into a name', () => {
    for (const seed of SEEDS) {
      for (const { identity } of nameWorld(seed)) {
        expect(identity.name).not.toMatch(/\b(apex|major|national|feeder|local)\b/i);
        expect(identity.shortName).not.toMatch(/\d|^(APE|MAJ|NAT|FEE|LOC)/);
        expect(identity.shortName).toMatch(/^[A-Z]{2,6}$/);
      }
    }
  });
});
