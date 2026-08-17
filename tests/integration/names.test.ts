/**
 * Names that match the fighter wearing them.
 *
 * The old generator held one flat array of thirty first names — twenty male, ten female, with
 * nothing marking which was which — and twenty-four surnames, and `rng.pick` read neither the
 * fighter's sex nor their nationality. Measured on a generated roster: **231 of 661 men carried
 * women's first names**, 302 fighters shared a full name with somebody else, and nationality was
 * drawn from a separate list entirely so a Hiroshi Kowalski could be from Nigeria.
 *
 * None of that was catchable by the tests that existed, because every one of them asked whether a
 * fighter was *valid* rather than whether they were *plausible*. These ask the second question.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  createRng,
  flagOf,
  findNationality,
  generateName,
  NAME_POOLS,
  NATIONALITIES,
  poolFor,
  type Fighter,
} from '@mmasim/engine';

describe('the name pools themselves', () => {
  it('never lets a name appear as both a male and a female given name in one country', () => {
    // The exact ambiguity that made the old flat list unfixable: with no separation there was no
    // way to ask what sex a name belonged to.
    for (const pool of NAME_POOLS) {
      const overlap = pool.male.filter((n) => pool.female.includes(n));
      expect(overlap, `${pool.nationality} has ambiguous names: ${overlap.join(', ')}`).toEqual([]);
    }
  });

  it('gives every country enough names to fill a division without repeating itself', () => {
    for (const pool of NAME_POOLS) {
      expect(pool.male.length, pool.nationality).toBeGreaterThanOrEqual(14);
      expect(pool.female.length, pool.nationality).toBeGreaterThanOrEqual(12);
      expect(pool.surnames.length, pool.nationality).toBeGreaterThanOrEqual(18);
    }
  });

  it('holds no duplicates within any one list', () => {
    for (const pool of NAME_POOLS) {
      for (const [label, list] of [
        ['male', pool.male],
        ['female', pool.female],
        ['surnames', pool.surnames],
      ] as const) {
        expect(new Set(list).size, `${pool.nationality} ${label}`).toBe(list.length);
      }
    }
  });

  it('offers enough distinct full names that a roster is not mostly collisions', () => {
    const combinations = NAME_POOLS.reduce(
      (sum, p) => sum + (p.male.length + p.female.length) * p.surnames.length,
      0,
    );
    // The old pools allowed 30 x 24 = 720 for a world of 858 fighters, which guaranteed the
    // duplicates rather than merely risking them.
    expect(combinations).toBeGreaterThan(20_000);
  });

  it('names a country the nationality list also knows about', () => {
    // Otherwise a generated fighter gets no flag, which is a silent failure.
    for (const pool of NAME_POOLS) {
      expect(findNationality(pool.nationality), pool.nationality).toBeDefined();
    }
  });
});

describe('generating one name', () => {
  it('gives a man a man’s name and a woman a woman’s name', () => {
    const rng = createRng('names');
    for (let i = 0; i < 400; i++) {
      const male = generateName(rng, 'male');
      const female = generateName(rng, 'female');
      expect(poolFor(male.nationality)!.male).toContain(male.firstName);
      expect(poolFor(female.nationality)!.female).toContain(female.firstName);
    }
  });

  it('draws the name from the country it says the fighter is from', () => {
    const rng = createRng('nat');
    for (let i = 0; i < 300; i++) {
      const person = generateName(rng, 'male');
      const pool = poolFor(person.nationality)!;
      expect(pool.male).toContain(person.firstName);
      expect(pool.surnames).toContain(person.lastName);
    }
  });

  it('honours a nationality the caller has already decided', () => {
    const rng = createRng('fixed');
    for (let i = 0; i < 50; i++) {
      const person = generateName(rng, 'male', 'Japan');
      expect(person.nationality).toBe('Japan');
      expect(poolFor('Japan')!.male).toContain(person.firstName);
    }
  });

  it('does not relocate somebody from a country the table does not cover', () => {
    // A caller seeding a real fighter from somewhere unusual must keep their nationality even
    // though there is no pool to draw a name from.
    const person = generateName(createRng('x'), 'male', 'Iceland');
    expect(person.nationality).toBe('Iceland');
  });
});

describe('the world that comes out of it', () => {
  for (const era of ['2020', '2026'] as const) {
    it(`gives no man a woman's name in ${era}`, () => {
      /*
       * The reported bug, asked of the actual roster rather than of the generator. This is the
       * assertion that would have caught it: 231 of 661 men failed it before.
       */
      const db = createNewGame({ adapter: undefined, era });
      const wrong = (db.fighters.findAll() as Fighter[]).filter((f) => {
        const pool = poolFor(f.nationality);
        if (!pool) return false; // Hand-authored fighter from an uncovered country.
        const own = f.sex === 'female' ? pool.female : pool.male;
        const other = f.sex === 'female' ? pool.male : pool.female;
        return !own.includes(f.firstName) && other.includes(f.firstName);
      });

      expect(
        wrong.map((f) => `${f.firstName} ${f.lastName} (${f.sex}, ${f.nationality})`),
      ).toEqual([]);
    });

    it(`keeps duplicate full names rare in ${era}`, () => {
      const db = createNewGame({ adapter: undefined, era });
      const fighters = db.fighters.findAll() as Fighter[];
      const seen = new Map<string, number>();
      for (const f of fighters) {
        const key = `${f.firstName} ${f.lastName}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const duplicated = [...seen.values()].filter((n) => n > 1).length;

      // 302 before. A handful is realistic — the sport has more than one Silva — but it must be
      // a handful rather than a third of the roster.
      expect(duplicated / fighters.length).toBeLessThan(0.05);
    });

    it(`spreads across more than a token set of countries in ${era}`, () => {
      const db = createNewGame({ adapter: undefined, era });
      const nations = new Set((db.fighters.findAll() as Fighter[]).map((f) => f.nationality));
      expect(nations.size).toBeGreaterThan(12);
    });
  }
});

describe('flags', () => {
  it('gives every listed nationality one', () => {
    for (const nation of NATIONALITIES) {
      expect(flagOf(nation.name), nation.name).not.toBe('');
    }
  });

  it('builds the right regional-indicator pair for a normal country', () => {
    expect(flagOf('Japan')).toBe('\u{1F1EF}\u{1F1F5}');
    expect(flagOf('Brazil')).toBe('\u{1F1E7}\u{1F1F7}');
  });

  it('builds the tag sequence the home nations need', () => {
    // England is a black flag plus 'gbeng' in tag characters plus a cancel tag — the only way to
    // express it, and nothing like the two-letter form.
    expect(flagOf('England')).toBe('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}');
  });

  it('returns nothing rather than a broken glyph for something it does not know', () => {
    // Callers show the country name beside the flag, so an empty string degrades to plain text.
    expect(flagOf('Atlantis')).toBe('');
    expect(flagOf('')).toBe('');
  });

  it('is case and whitespace forgiving, since these come from stored saves', () => {
    expect(flagOf('  japan ')).toBe(flagOf('Japan'));
  });
});
