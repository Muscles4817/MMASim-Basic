/**
 * Are distinct physical archetypes common?
 *
 * Doc 31 § 16.2 and § 19. This is step 6's acceptance criterion, and it deliberately is not a
 * correlation coefficient. The old target — "tighten Power × Strength to ρ ≈ 0.7" — was written down
 * before there was any evidence about the right value, and a coefficient is the wrong shape of
 * answer anyway: a generator could hit 0.70 exactly while still making "strong but not explosive"
 * a once-a-decade fighter, and it would have failed at the thing the number was standing in for.
 *
 * So what is measured here is the population directly. Six shapes that the sport obviously contains
 * have to be **common** rather than merely possible, and every one of them was impossible or nearly
 * so under the pre-step-6 model, where Power, Speed and Strength were three rescalings of
 * `explosiveness`.
 *
 * Everything is measured as a **within-division percentile**, because the question is about the
 * fighter rather than his weight class. A heavyweight is more powerful than a flyweight and that is
 * the ladder working; it says nothing about whether he is powerful *for a heavyweight*.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTES_BY_GROUP,
  asDivisionId,
  createRng,
  divisionsFor,
  generateFighter,
  type AttributeKey,
  type Fighter,
} from '@mmasim/engine';

const pending: string[] = [];
const say = (line: string) => pending.push(line);
const flush = () => {
  if (pending.length > 0) console.log(pending.join('\n'));
  pending.length = 0;
};

const PHYSICAL = ATTRIBUTES_BY_GROUP.physical;
const TECHNICAL = [
  ...ATTRIBUTES_BY_GROUP.striking,
  ...ATTRIBUTES_BY_GROUP.grappling,
  ...ATTRIBUTES_BY_GROUP.mental,
];

/** A fighter, plus where each of his attributes sits inside his own division. */
interface Placed {
  fighter: Fighter;
  pct: Record<AttributeKey, number>;
}

function population(perDivision = 600): Placed[] {
  const out: Placed[] = [];
  for (const sex of ['male', 'female'] as const) {
    for (const division of divisionsFor(sex)) {
      const rng = createRng(`archetype:${division.id}`);
      const fighters = Array.from({ length: perDivision }, (_, i) => {
        const gen = rng.fork(`f${i}`);
        const isProspect = gen.chance(0.085);
        return generateFighter(gen, {
          id: `arch_${division.id}_${i}`,
          divisionId: asDivisionId(division.id as string),
          sex,
          day: 0,
          tier: isProspect ? Math.round(gen.normalClamped(78, 9, 62, 97)) : undefined,
        });
      });
      const sorted = {} as Record<AttributeKey, number[]>;
      for (const key of [...PHYSICAL, ...TECHNICAL]) {
        sorted[key] = fighters.map((f) => f.potential[key]).sort((a, b) => a - b);
      }
      for (const fighter of fighters) {
        const pct = {} as Record<AttributeKey, number>;
        for (const key of [...PHYSICAL, ...TECHNICAL]) {
          const list = sorted[key];
          const below = list.filter((v) => v < fighter.potential[key]).length;
          pct[key] = (100 * below) / list.length;
        }
        out.push({ fighter, pct });
      }
    }
  }
  return out;
}

const POPULATION = population();

interface Archetype {
  name: string;
  /** What the sport calls this person, so the test reads as a claim about fighters. */
  gloss: string;
  matches: (p: Placed) => boolean;
  /** Share of the population, as a percentage, below which the shape is not really available. */
  floorPct: number;
}

const ARCHETYPES: Archetype[] = [
  {
    name: 'powerful, not especially fast',
    gloss: 'the heavy-handed pressure fighter who gets beaten to the punch',
    matches: (p) => p.pct.power >= 80 && p.pct.speed <= 50,
    floorPct: 3,
  },
  {
    name: 'fast, not especially powerful',
    gloss: 'the volume striker who lands first and never hurts anybody',
    matches: (p) => p.pct.speed >= 80 && p.pct.power <= 50,
    floorPct: 3,
  },
  {
    name: 'strong, not explosive',
    gloss: 'the grinding wrestler who controls without ever threatening',
    matches: (p) => p.pct.strength >= 80 && p.pct.power <= 50,
    floorPct: 3,
  },
  {
    name: 'powerful, poor cardio',
    gloss: 'dangerous for ten minutes and finished after that',
    matches: (p) => p.pct.power >= 80 && p.pct.cardio <= 30,
    floorPct: 2,
  },
  {
    name: 'technically gifted, physically ordinary',
    gloss: 'the craftsman whose body is nothing special — Demian Maia',
    matches: (p) =>
      Math.max(...TECHNICAL.map((k) => p.pct[k])) >= 80 &&
      PHYSICAL.every((k) => p.pct[k] >= 25 && p.pct[k] <= 75),
    floorPct: 1,
  },
  {
    name: 'freakish and uneven',
    gloss: 'an outlier at one thing and a liability at another',
    matches: (p) => PHYSICAL.some((k) => p.pct[k] >= 95) && PHYSICAL.some((k) => p.pct[k] <= 25),
    floorPct: 5,
  },
];

describe('the physical archetypes the sport contains', () => {
  it('finds every one of them at a rate a division would actually show', () => {
    say('\n\n═══ Archetype frequency ═══\n');
    say(
      '  Share of the generated population matching each shape, on within-division percentiles.\n' +
        '  "per 30" is what a division-sized roster would hold — the number that says whether a\n' +
        '  shape is part of the sport or a curiosity.\n',
    );
    say('  archetype                              share   per 30   floor');
    const results = ARCHETYPES.map((a) => {
      const share = (100 * POPULATION.filter(a.matches).length) / POPULATION.length;
      say(
        `  ${a.name.padEnd(38)}${share.toFixed(1).padStart(5)}%` +
          `${((share * 30) / 100).toFixed(1).padStart(9)}${a.floorPct.toFixed(0).padStart(8)}%`,
      );
      return { a, share };
    });
    say('');
    for (const { a } of ARCHETYPES.map((a) => ({ a }))) say(`  ${a.name} — ${a.gloss}`);
    flush();
    for (const { a, share } of results) {
      expect(share, `${a.name} is ${share.toFixed(1)}% of the population`).toBeGreaterThanOrEqual(
        a.floorPct,
      );
    }
  });

  it('does not manufacture them by making everybody uneven', () => {
    /**
     * The other half, and the reason the floors above are not simply set to zero and forgotten. A
     * model can produce every archetype trivially by making the five physicals independent noise,
     * and that would be worse than the master scalar it replaced — shared physiology is real, and a
     * world where the best athlete in a division is routinely its worst at something else is not
     * the sport either.
     */
    const evenlyGood = POPULATION.filter((p) => PHYSICAL.every((k) => p.pct[k] >= 70)).length;
    const evenlyPoor = POPULATION.filter((p) => PHYSICAL.every((k) => p.pct[k] <= 30)).length;
    const share = (100 * (evenlyGood + evenlyPoor)) / POPULATION.length;
    say(
      `\n\n  Uniformly strong or uniformly weak across all five: ${share.toFixed(1)}% of the\n` +
        '  population. Under five independent attributes it would be 0.5%; under one shared scalar\n' +
        '  it would be most of the roster. Shared physiology is supposed to be visible here.',
    );
    flush();
    expect(share, 'nobody is athletic across the board any more').toBeGreaterThan(2);
    expect(share, 'the physicals have collapsed back onto one scalar').toBeLessThan(25);
  });
});
