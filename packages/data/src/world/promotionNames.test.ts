import { describe, expect, it } from 'vitest';
import { PROMOTIONS_2026 } from '../seed/organisations-2026.js';
import { SEED_PROMOTIONS } from '../seed/organisations.js';
import {
  FORMS,
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
    // Each rung draws from its own stream, so the majors do not depend on how many local shows
    // were named before them. Only the draws are independent: the used-name sets are shared, so a
    // clash can still change a later name — which is why `generate.ts` names the rungs top-down,
    // and a bigger base can never rename the top of the sport.
    const a = [small('local'), small('major')];
    const b = [big('local'), big('local'), big('local'), big('major')];
    expect(a[1]).toEqual(b[3]);
  });

  /** The pyramid shapes a Medium and a Large world actually build. */
  const SHAPES: readonly (readonly [PyramidRung, number][])[] = [
    [
      ['apex', 1],
      ['major', 3],
      ['national', 11],
      ['feeder', 22],
      ['local', 75],
    ],
    [
      ['apex', 1],
      ['major', 4],
      ['national', 15],
      ['feeder', 29],
      ['local', 126],
    ],
  ];

  /** A name split into its place and its ending, longest ending first. */
  const split = (rung: PyramidRung, name: string): { place: string; ending: string } => {
    const endings = FORMS[rung]
      .flatMap((f) => f.tails.map((tail) => tail.text))
      .sort((a, b) => b.length - a.length);
    const ending = endings.find((e) => name.endsWith(` ${e}`))!;
    return { place: name.slice(0, -ending.length - 1), ending };
  };

  const nameShape = (seed: string, shape: (typeof SHAPES)[number]) => {
    const nameFor = createPromotionNamer(seed);
    return shape.flatMap(([rung, count]) =>
      Array.from({ length: count }, () => ({ rung, ...nameFor(rung) })),
    );
  };

  it('never names two town shows after the same place', () => {
    // "Wichita Fighting Championship" beside "Wichita Falls Showdown" is one town counted twice.
    for (const seed of SEEDS) {
      for (const shape of SHAPES) {
        const seen = new Map<string, string>();
        for (const p of nameShape(seed, shape)) {
          if (p.rung !== 'feeder' && p.rung !== 'local') continue;
          const place = split(p.rung, p.name).place.split(' ');
          for (const word of place) {
            expect(seen.get(word), `${p.name} shares "${word}" with ${seen.get(word)}`).toBe(
              undefined,
            );
          }
          for (const word of place) seen.set(word, p.name);
        }
      }
    }
  });

  it('gives a Medium world’s local shows endings that rarely repeat', () => {
    for (const seed of SEEDS) {
      const locals = nameShape(seed, SHAPES[0]!).filter((p) => p.rung === 'local');
      const endings = new Map<string, number>();
      for (const p of locals) {
        const { ending } = split(p.rung, p.name);
        endings.set(ending, (endings.get(ending) ?? 0) + 1);
      }
      expect(Math.max(...endings.values())).toBeLessThanOrEqual(6);
    }
  });

  it('never leaks the pyramid rung into a name', () => {
    for (const seed of SEEDS) {
      for (const { identity } of nameWorld(seed)) {
        expect(identity.name).not.toMatch(/\b(apex|major|national|feeder|local)\b/i);
        expect(identity.shortName).not.toMatch(/\d|^(APE|MAJ|NAT|FEE|LOC)/);
        expect(identity.shortName).toMatch(/^[A-Z]{2,6}$/);
        expect(identity.shortName).not.toMatch(/^(LSD|STD|KKK|WTF)$/);
      }
    }
  });
});
