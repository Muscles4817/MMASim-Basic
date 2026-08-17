/**
 * Can a fighter you built actually get to the top?
 *
 * Nothing in the repo asked this before. The closest coverage was a single eight-week camp
 * in the UI suite asserting the camp report contained a `+`, and a set of creation-time
 * invariants that never called `applyTraining` at all. So the central promise of the mode —
 * build somebody from nothing and climb — was completely untested, and it turned out to be
 * *arithmetically impossible*: a created fighter's potential-overall topped out at 71.2
 * across 2000 rolls while the seeded champions rate 78.4 to 84.6.
 *
 * This suite is the guard against that ever being true again. It plays whole careers, and it
 * asserts a *distribution* rather than a single outcome, because the right answer is not
 * "the player always becomes champion" — it is that the belt is a hard, uncertain target
 * that a good roll played well can reach and a poor one cannot.
 *
 * Deliberately pessimistic about play: the simulated player rotates focus to whatever has
 * the most room rather than specialising, which is the *worst* sensible strategy. A player
 * who commits to two areas does better than these numbers.
 */

import { describe, expect, it } from 'vitest';
import { createNewGame } from '@mmasim/data';
import {
  applyAgeing,
  applyTraining,
  asDivisionId,
  createPlayerFighter,
  createRng,
  headroom,
  overallRating,
  TRAINING_FOCUSES,
  TRAINING_META,
  type AttributeKey,
  type Background,
  type Coach,
  type Fighter,
  type Gym,
  type TrainingFocus,
} from '@mmasim/engine';

const db = createNewGame({ adapter: undefined });
const gyms = (db.gyms.findAll() as unknown as Gym[]).slice().sort((a, b) => a.quality - b.quality);
const roster = db.fighters.findAll() as Fighter[];
const coachFor = (g: Gym) =>
  g.headCoachId ? (db.coaches.findById(g.headCoachId) as Coach | undefined) : undefined;

/** What the sport actually looks like, computed rather than assumed. */
const rosterOveralls = roster.map((f) => overallRating(f.attributes)).sort((a, b) => a - b);
const ROSTER_MEDIAN = rosterOveralls[Math.floor(rosterOveralls.length / 2)]!;
const CHAMPION_BAR = rosterOveralls[rosterOveralls.length - 5]!;
const ROSTER_FLOOR = rosterOveralls[0]!;

function bestFocus(f: Fighter): TrainingFocus {
  let best: TrainingFocus = 'striking';
  let bestRoom = -1;
  for (const focus of TRAINING_FOCUSES) {
    const keys = Object.keys(TRAINING_META[focus].attributes) as AttributeKey[];
    const room =
      keys.reduce((a, k) => a + headroom(f.attributes[k], f.potential[k]), 0) / keys.length;
    if (room > bestRoom) {
      bestRoom = room;
      best = focus;
    }
  }
  return best;
}

function create(seed: string, background: Background = 'athlete'): Fighter {
  return createPlayerFighter(
    {
      id: seed,
      firstName: 'Player',
      lastName: 'Fighter',
      nationality: 'USA',
      sex: 'male',
      divisionId: asDivisionId('mens-lightweight'),
      age: 22,
      background,
      build: 'balanced',
      allocation: {},
      day: 0,
    },
    createRng(seed),
  );
}

interface CareerResult {
  start: number;
  ceiling: number;
  peak: number;
  peakAge: number;
  end: number;
}

/**
 * Sixteen years, three camps a year, climbing the gym ladder as a successful fighter would.
 */
function runCareer(seed: string, options: { train?: boolean } = {}): CareerResult {
  const train = options.train ?? true;
  let f = create(seed);
  const start = overallRating(f.attributes);
  const ceiling = overallRating(f.potential);
  let peak = start;
  let peakAge = 22;

  for (let year = 0; year < 16; year++) {
    const gym =
      year < 2 ? gyms[0]! : year < 5 ? gyms[Math.floor(gyms.length / 2)]! : gyms[gyms.length - 1]!;

    if (train) {
      for (let camp = 0; camp < 3; camp++) {
        f = applyTraining({
          fighter: f,
          focuses: [bestFocus(f)],
          weeks: 10,
          gym,
          coach: coachFor(gym),
          day: year * 365 + camp * 120,
          rng: createRng(`${seed}:${year}:${camp}`),
        }).fighter;
      }
    }

    f = applyAgeing(f, year * 365, (year + 1) * 365, createRng(`${seed}:age:${year}`)).fighter;

    const ovr = overallRating(f.attributes);
    if (ovr > peak) {
      peak = ovr;
      peakAge = 22 + year;
    }
  }

  return { start, ceiling, peak, peakAge, end: overallRating(f.attributes) };
}

const CAREERS = Array.from({ length: 40 }, (_, i) => runCareer(`career_${i}`));
const peaks = CAREERS.map((c) => c.peak).sort((a, b) => a - b);
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('where a created fighter starts', () => {
  it('turns pro below every professional on the roster, because the climb is the game', () => {
    expect(mean(CAREERS.map((c) => c.start))).toBeLessThan(ROSTER_FLOOR + 2);
  });

  it('is nonetheless recognisably a professional, not an amateur', () => {
    // Debuting thirty points below the roster median made the climb unclosable in a career.
    expect(mean(CAREERS.map((c) => c.start))).toBeGreaterThan(ROSTER_MEDIAN - 22);
  });

  it('always has somewhere to grow in every single attribute', () => {
    for (let i = 0; i < 200; i++) {
      const f = create(`headroom_${i}`);
      for (const key of Object.keys(f.attributes) as AttributeKey[]) {
        expect(f.potential[key], `${key} has no room at debut`).toBeGreaterThan(f.attributes[key]);
      }
    }
  });
});

describe('a career actually goes somewhere', () => {
  it('improves a fighter substantially over a career', () => {
    const growth = mean(CAREERS.map((c) => c.peak - c.start));
    expect(growth, 'a whole career barely moved the fighter').toBeGreaterThan(12);
  });

  it('peaks in the late twenties or early thirties, then declines', () => {
    const age = mean(CAREERS.map((c) => c.peakAge));
    expect(age).toBeGreaterThan(27);
    expect(age).toBeLessThan(36);
    // And the decline is real: nobody finishes at their peak.
    expect(mean(CAREERS.map((c) => c.end))).toBeLessThan(mean(peaks));
  });

  it('gets most of the way to the fighter’s own ceiling, but never all of it', () => {
    const share = mean(CAREERS.map((c) => c.peak / c.ceiling));
    expect(share, 'training cannot approach the ceiling').toBeGreaterThan(0.75);
    expect(share, 'the ceiling has stopped being a constraint').toBeLessThan(0.97);
  });

  it('makes training the difference between a career and a decline', () => {
    const trained = mean(CAREERS.map((c) => c.peak));
    const untrained = mean(
      Array.from({ length: 10 }, (_, i) => runCareer(`idle_${i}`, { train: false }).peak),
    );
    expect(trained).toBeGreaterThan(untrained + 10);
  });
});

describe('the top of the mountain is reachable, and not guaranteed', () => {
  it('lets a typical career reach the professional roster', () => {
    // The median created fighter, played sensibly, becomes a real roster fighter.
    expect(mean(peaks)).toBeGreaterThan(ROSTER_MEDIAN - 4);
  });

  it('lets the best rolls reach champion level', () => {
    // This is the assertion that would have caught the original defect: with naturals
    // centred at 52 the maximum *possible* created ceiling was below the champion bar, so
    // no amount of play could ever have passed this.
    expect(
      peaks[peaks.length - 1],
      `best of 40 careers peaked at ${peaks[peaks.length - 1]!.toFixed(1)} against a champion bar of ${CHAMPION_BAR.toFixed(1)}`,
    ).toBeGreaterThan(CHAMPION_BAR - 1);
  });

  it('does not hand the belt to everybody', () => {
    const championCalibre = CAREERS.filter((c) => c.peak >= CHAMPION_BAR).length;
    expect(championCalibre / CAREERS.length, 'almost everybody is champion material').toBeLessThan(
      0.35,
    );
  });

  it('leaves some careers that were never going anywhere', () => {
    // A hidden roll the player cannot see has to be able to go badly, or it is not a roll.
    expect(peaks[0]).toBeLessThan(ROSTER_MEDIAN);
  });
});

describe('what a single camp is worth depends on who is in it', () => {
  const elite = gyms[gyms.length - 1]!;
  const oneCamp = (f: Fighter, seed: string, age = 0) =>
    applyTraining({
      fighter: f,
      focuses: ['striking'],
      weeks: 10,
      gym: elite,
      coach: coachFor(elite),
      day: age * 365,
      rng: createRng(seed),
    }).fighter.attributes.strikingOffence - f.attributes.strikingOffence;

  it('transforms a raw prospect, because that is what a first real camp does', () => {
    // The old bound here was a flat "under four points", measured against a synthetic
    // fixture carrying a forty-five-point gap to its ceiling that no real fighter has. It
    // is the assertion that pinned the gain constant far too low for a career to go
    // anywhere, and it was asking the wrong question: a raw twenty-two-year-old's first
    // camp at the best gym in the sport *should* be visible. What must not be visible is
    // the same camp for a thirty-four-year-old who has already arrived.
    // Averaged over rolls rather than measured on one, so the bound describes the system
    // and not whichever seed happened to be lucky.
    const moved = mean(
      Array.from({ length: 25 }, (_, i) => oneCamp(create(`raw_${i}`), `raw_run_${i}`)),
    );
    expect(moved, 'the best room in the sport did nothing for a raw prospect').toBeGreaterThan(2);
    expect(moved, 'one camp rewrote the fighter').toBeLessThan(11);
  });

  it('barely moves a fighter who has already got there', () => {
    // Run a full career first, then take one more camp. This is the case the "barely
    // visible" principle is actually about.
    let veteran = create('veteran');
    for (let i = 0; i < 30; i++) {
      veteran = applyTraining({
        fighter: veteran,
        focuses: ['striking'],
        weeks: 10,
        gym: elite,
        coach: coachFor(elite),
        day: i * 120,
        rng: createRng(`vet_${i}`),
      }).fighter;
    }
    expect(oneCamp(veteran, 'vet_last', 12), 'a plateaued fighter is still improving fast').toBeLessThan(2);
  });

  it('does something even in a poor room, rather than nothing at all', () => {
    // The starting gym has quality 44 and no head coach. Before the fractional carry, four
    // camps in five there moved nothing whatsoever — the opening hours of the game were
    // inert, which no player would ever have been told.
    let f = create('poor_room');
    const before = overallRating(f.attributes);
    for (let i = 0; i < 6; i++) {
      f = applyTraining({
        fighter: f,
        focuses: ['striking'],
        weeks: 8,
        gym: gyms[0]!,
        day: 0,
        rng: createRng(`poor_${i}`),
      }).fighter;
    }
    expect(overallRating(f.attributes)).toBeGreaterThan(before);
  });
});
