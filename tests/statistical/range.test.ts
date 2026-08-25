/**
 * **Where two standing fighters are, and who decided it.**
 *
 * `distance` used to be one bucket holding a karateka at kicking range and two boxers in each
 * other's chest. Three things were impossible because of it, and this file is the falsification
 * of all three:
 *
 *  - Two game plans naming opposite fights produced 267 and 268 seconds of "distance" apiece.
 *  - `reachInches` was authored on every fighter in both seed rosters and read by nothing.
 *  - Boxing, kickboxing and karate could differ only on "do you kick".
 *
 * The claim the whole system rests on, and the one most of these tests are really about:
 *
 * > **The plan says which range you want. Skill says whether you get it.**
 *
 * A fighter told to stay outside against an elite pressure fighter must come out having *tried
 * all night and failed*, not having been handed the range by the instruction. Several assertions
 * below therefore separate **attempts** from **achievement** deliberately — a test that only ever
 * measured outcome could not tell an obeyed plan from an effective one.
 */

import { describe, expect, it } from 'vitest';
import {
  RANGES,
  defaultGamePlan,
  defaultTactics,
  makeFighter,
  simulateFight,
  type Fighter,
  type GamePlan,
  type Range,
  type TacticalPlan,
} from '@mmasim/engine';

const FIGHTS = 900;

const plan = (t: Partial<TacticalPlan>): GamePlan => ({
  ...defaultGamePlan(),
  tactics: { ...defaultTactics(), conviction: 0.85, ...t },
});

interface RangeProfile {
  /** Share of standing time at each range. */
  mix: Record<Range, number>;
  /** Range-change events per fight — attempts that resolved, either way. */
  events: number;
  winRate: number;
  kickShare: number;
  takedownsAttempted: number;
  significantStrikes: number;
}

function profile(red: Fighter, blue: Fighter, redPlan: GamePlan, bluePlan: GamePlan): RangeProfile {
  const seconds: Record<Range, number> = { outside: 0, boxing: 0, pocket: 0 };
  let distance = 0;
  let events = 0;
  let wins = 0;
  let kicks = 0;
  let landed = 0;
  let takedowns = 0;

  for (let i = 0; i < FIGHTS; i++) {
    const result = simulateFight({
      boutId: `range:${i}`,
      red: { fighter: red, plan: redPlan },
      blue: { fighter: blue, plan: bluePlan },
      rounds: 3,
      seed: `range:${i}`,
    });
    const mine = result.stats.red;
    for (const r of RANGES) seconds[r] += mine.rangeSeconds[r];
    distance += mine.distanceSeconds;
    events += result.events.filter((e) => e.kind === 'range').length;
    if (result.winnerId === red.id) wins++;
    kicks += mine.strikesByWeapon.kick;
    landed += mine.significantStrikesLanded;
    takedowns += mine.takedownsAttempted;
  }

  const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);
  return {
    mix: {
      outside: safe(seconds.outside, distance),
      boxing: safe(seconds.boxing, distance),
      pocket: safe(seconds.pocket, distance),
    },
    events: events / FIGHTS,
    winRate: wins / FIGHTS,
    kickShare: safe(kicks, landed),
    takedownsAttempted: takedowns / FIGHTS,
    significantStrikes: landed / FIGHTS,
  };
}

const describeMix = (p: RangeProfile) =>
  `outside=${(p.mix.outside * 100).toFixed(0)}% boxing=${(p.mix.boxing * 100).toFixed(0)}% ` +
  `pocket=${(p.mix.pocket * 100).toFixed(0)}% events=${p.events.toFixed(1)} ` +
  `kick=${(p.kickShare * 100).toFixed(0)}% td=${p.takedownsAttempted.toFixed(2)} ` +
  `win=${(p.winRate * 100).toFixed(1)}%`;

/** A generic athlete, so nothing but the named difference can explain a result. */
const base = (id: string, overrides: Partial<Fighter['attributes']> = {}, reach = 72): Fighter =>
  makeFighter({
    id,
    lastName: id,
    reachInches: reach,
    attributes: {
      strikingOffence: 70,
      kicking: 70,
      strikingDefence: 70,
      power: 68,
      speed: 68,
      wrestling: 68,
      takedownDefence: 68,
      groundControl: 68,
      submissions: 66,
      scrambling: 68,
      cardio: 72,
      strength: 68,
      durability: 70,
      fightIq: 70,
      composure: 70,
      ...overrides,
    },
  });

const OUTSIDE = plan({ preferredState: 'outside', entry: 'movement', bottomIntent: 'defend' });
const POCKET = plan({ preferredState: 'pocket', entry: 'pressure', bottomIntent: 'defend' });
const NEUTRAL = defaultGamePlan();

describe('range is state, and the plan only asks for it', () => {
  it('puts two fighters who both want the pocket in the pocket', () => {
    const both = profile(base('a'), base('b'), POCKET, POCKET);
    const neither = profile(base('a'), base('b'), OUTSIDE, OUTSIDE);
    const message = `both pocket ${describeMix(both)} | both outside ${describeMix(neither)}`;

    expect(both.mix.pocket, message).toBeGreaterThan(neither.mix.pocket * 4);
    expect(neither.mix.outside, message).toBeGreaterThan(both.mix.outside * 1.8);
  });

  it('makes a disagreement a contest rather than a coin flip', () => {
    /*
     * The load-bearing shape. When one man wants the pocket and the other wants kicking range,
     * neither should get their way outright — the fight should live somewhere in between, with
     * the better range manager getting more of what he asked for.
     */
    const contested = profile(base('a'), base('b'), POCKET, OUTSIDE);
    const message = describeMix(contested);

    expect(contested.mix.outside, message).toBeGreaterThan(0.2);
    expect(contested.mix.outside, message).toBeLessThan(0.85);
    expect(contested.mix.pocket, message).toBeGreaterThan(0.03);
    // And they are genuinely fighting over it, not settling.
    expect(contested.events, message).toBeGreaterThan(5);
  });

  it('lets a fighter with no plan at all still manage distance', () => {
    /*
     * Range is a property of *fighting*, not of planning, and a first cut got this wrong: every
     * other policy term is zero for an unplanned fighter — correctly, since without instructions
     * he has no view on whether the fight goes to the floor — and applying the same rule to range
     * left **63% of every unplanned fight at kicking range with the range beat never firing.**
     * That is not neutrality, it is a man standing wherever the last reset left him.
     */
    const unplanned = profile(base('a'), base('b'), NEUTRAL, NEUTRAL);
    const message = describeMix(unplanned);

    expect(unplanned.events, message).toBeGreaterThan(2);
    expect(unplanned.mix.boxing, message).toBeGreaterThan(unplanned.mix.outside);
  });
});

describe('reach means something, and it is not everything', () => {
  it('is worth range control, which is the only thing it was ever going to be worth', () => {
    /*
     * **The first test of `reachInches` in this repo.** It has been authored on every fighter in
     * both seed rosters and rendered on the fighter screen since the beginning, and until range
     * existed the simulator did not read it once — because there was no spatial contest for it to
     * affect (docs/19 §4 D6 said exactly this and left it).
     *
     * Identical fighters, six inches apart, and the reach has to be *contested* to be measured:
     * a first cut put both men on the same plan, so neither ever tried to change anything and the
     * two orderings came back identical to twelve decimal places. Reach is worth something only
     * when somebody is trying to close on you.
     */
    const long = base('long', {}, 76);
    const short = base('short', {}, 70);
    const longKeepsItOut = profile(long, short, OUTSIDE, POCKET);
    const shortKeepsItOut = profile(short, long, OUTSIDE, POCKET);
    const message = `long holds ${describeMix(longKeepsItOut)} | short holds ${describeMix(shortKeepsItOut)}`;

    expect(longKeepsItOut.mix.outside, message).toBeGreaterThan(shortKeepsItOut.mix.outside);
  });

  it('does not let reach beat feet', () => {
    /*
     * The guard on the above, and the reason `reachLeverage` is capped at ±12% while
     * `rangeControl` is a full attribute sum. Reach is threat geometry — it makes closing on you
     * dangerous — and that is a different claim from being good at maintaining distance. Somebody
     * can have freakishly long arms and atrocious footwork, and if the model cannot say so then
     * reach quietly becomes the best attribute in the game, bought free at generation.
     */
    const rangyPlodder = base('plodder', { speed: 48, fightIq: 45, cardio: 55 }, 78);
    const shortMover = base('mover', { speed: 88, fightIq: 88, cardio: 85 }, 69);
    const plodderTries = profile(rangyPlodder, shortMover, OUTSIDE, POCKET);
    const message = describeMix(plodderTries);

    // The short excellent mover takes the range off the long poor one, nine inches or not.
    expect(plodderTries.mix.pocket, message).toBeGreaterThan(plodderTries.mix.outside);
  });

  it('moves strongly on skill at equal reach', () => {
    // The complement: hold reach fixed and change the feet. If this is flat, `rangeControl` is
    // not doing the work and reach is carrying a contest it was only supposed to lean on.
    const good = base('good', { speed: 88, fightIq: 88, cardio: 85 });
    const poor = base('poor', { speed: 48, fightIq: 45, cardio: 55 });
    const goodHolds = profile(good, poor, OUTSIDE, POCKET);
    const poorHolds = profile(poor, good, OUTSIDE, POCKET);
    const message = `good ${describeMix(goodHolds)} | poor ${describeMix(poorHolds)}`;

    expect(goodHolds.mix.outside, message).toBeGreaterThan(poorHolds.mix.outside * 1.3);
  });
});

describe('intent and capability are different things', () => {
  it('makes a poor range manager try hard and get nowhere', () => {
    /*
     * **The single most important assertion in the file**, and the one that separates a tactical
     * layer from a cheat code. A weak athlete told to stay outside against an elite pressure
     * fighter must produce a man *visibly failing to disengage* — lots of attempts, little
     * outside time — rather than one handed the range by his corner's instruction.
     *
     * Measured on attempts (`range` events) against achievement (`mix.outside`), because a suite
     * that only reads outcome cannot tell an obeyed plan from an effective one, and those are the
     * two things this engine most needs to keep apart.
     */
    const presser = base('presser', { speed: 82, fightIq: 80, cardio: 84 }, 72);
    const weak = base('weak', { speed: 45, fightIq: 45, cardio: 52 }, 72);
    const capable = base('capable', { speed: 88, fightIq: 86, cardio: 86 }, 72);

    // Same instruction, same opponent, same reach. Only the feet differ.
    const weakTries = profile(weak, presser, OUTSIDE, POCKET);
    const capableDoes = profile(capable, presser, OUTSIDE, POCKET);
    const message = `weak ${describeMix(weakTries)} | capable ${describeMix(capableDoes)}`;

    // Both are working at it — the plan is being followed by both of them.
    expect(weakTries.events, message).toBeGreaterThan(4);
    // And only one of them gets the fight he asked for.
    expect(capableDoes.mix.outside, message).toBeGreaterThan(weakTries.mix.outside * 1.4);
    expect(weakTries.mix.pocket, message).toBeGreaterThan(weakTries.mix.outside);
  });

  it('punishes the entry that does not come off', () => {
    /*
     * A failed range change must cost something, or a fighter with the wrong plan and no feet
     * simply retries until the dice oblige and a poor range manager is indistinguishable from a
     * good one on everything except the count of attempts. Getting caught coming in is how the
     * sport charges for a bad entry.
     */
    const poorCloser = base('poorCloser', { speed: 45, fightIq: 45 });
    const goodCloser = base('goodCloser', { speed: 88, fightIq: 86 });
    const sniper = base('sniper', { strikingOffence: 84, kicking: 84, speed: 82, fightIq: 84 }, 75);

    const poor = profile(poorCloser, sniper, POCKET, OUTSIDE);
    const good = profile(goodCloser, sniper, POCKET, OUTSIDE);
    const message = `poor ${describeMix(poor)} | good ${describeMix(good)}`;

    // The one who cannot get in spends longer being hit at the end of a jab, and wins less.
    expect(poor.winRate, message).toBeLessThan(good.winRate);
    expect(poor.mix.pocket, message).toBeLessThan(good.mix.pocket);
  });
});

describe('range decides what a fighter can throw and whether they can grapple', () => {
  it('puts the kicks at kicking range and the hands in close', () => {
    const out = profile(base('a'), base('b'), OUTSIDE, OUTSIDE);
    const inside = profile(base('a'), base('b'), POCKET, POCKET);
    const message = `outside ${describeMix(out)} | pocket ${describeMix(inside)}`;

    expect(out.kickShare, message).toBeGreaterThan(inside.kickShare * 1.3);
  });

  it('makes a wrestler get close enough to shoot', () => {
    /*
     * The payoff that needed no arguing for. The engine had no concept of needing to *be near
     * somebody* to grapple them, so a shot cost the same from two metres away as from their
     * chest. A wrestler kept at kicking range should now visibly struggle to enter.
     */
    const wrestlerPlan = plan({ preferredState: 'top', entry: 'proactiveWrestling' });
    const rangy = base('rangy', { speed: 84, fightIq: 84, kicking: 82 }, 77);
    const stubby = base('stubby', { speed: 55, fightIq: 55 }, 68);

    const againstRangy = profile(base('w'), rangy, wrestlerPlan, OUTSIDE);
    const againstStubby = profile(base('w'), stubby, wrestlerPlan, plan({ preferredState: 'boxing', entry: 'lead' }));
    const message = `vs rangy ${describeMix(againstRangy)} | vs stubby ${describeMix(againstStubby)}`;

    expect(againstStubby.takedownsAttempted, message).toBeGreaterThan(
      againstRangy.takedownsAttempted * 1.2,
    );
  });
});
