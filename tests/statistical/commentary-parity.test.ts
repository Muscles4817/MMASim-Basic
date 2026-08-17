/**
 * Does the play-by-play describe the fight that was simulated?
 *
 * Per `broadcast.ts`'s own comment: *"in a text sim the commentary is the player's only view of the
 * fight."* Which cuts both ways, and doc 18 §4.6 only stated the first half. A distinction the prose
 * cannot carry does not exist for the player — and **a distinction the prose carries that the
 * simulation did not make is a lie**. Nothing in the suite compared the two.
 *
 * This is the gate doc 19 calls for, and the reason decision D2 went the way it did. The narrator
 * is *told* what was thrown: resolution picks the weapon, records it on the `FightEvent`, and
 * `commentary.ts` selects prose from a table keyed by it. Had the narrator kept choosing its own
 * technique — the arrangement every review assumed — there would be two independent draws with no
 * ground truth between them, and this file could not be written at all. That is a structural
 * argument rather than an aesthetic one, and it is the whole of D2.
 *
 * The test is deliberately a *contradiction* check rather than a vocabulary whitelist. It does not
 * assert that a kick event says the word "kick"; it asserts that a kick event never says "jab", and
 * that a punch event never says "kick" or "knee". A whitelist would have to be edited every time a
 * writer adds a line, and a suite that punishes writing is a suite that gets deleted.
 *
 * What it caught on the first run is the reason it exists. The old tables had *"a knee to the
 * midsection"* and *"a chopping body kick"* in the **punch** list and *"a flying knee to the body"*
 * in the **kick** list, and `groundStrikesText` offered *"works elbows from the top"* on a branch
 * that had never resolved an elbow. None of those lines was wrong on its own terms. Nothing was
 * comparing them.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  TAKEDOWN_ENTRIES,
  WEAPONS,
  makeFighter,
  simulateFight,
  type Corner,
  type FightEvent,
  type FightResult,
  type TakedownEntry,
  type Weapon,
} from '@mmasim/engine';
import { disciplineExemplar } from '../helpers/fingerprint.js';

/**
 * Words that can only mean one weapon.
 *
 * Kept narrow on purpose: every entry has to be a word no honest line about another weapon could
 * contain. "Shot", "strike" and "hands" are all excluded because they are legitimately generic.
 */
const TELLS: Readonly<Record<Weapon, readonly string[]>> = {
  punch: ['jab', 'hook', 'uppercut', 'overhand', 'straight left', 'straight right', '1-2', 'cross'],
  kick: ['kick', 'teep', 'roundhouse', 'shin'],
  knee: ['knee'],
  elbow: ['elbow'],
};

/**
 * Words that can only mean one takedown entry.
 *
 * Same rule as `TELLS`: every entry has to be a word no honest line about another entry could
 * contain. "Shot" is excluded — every takedown is a shot — and so is "drives", which a single leg
 * and a body lock both do.
 */
const ENTRY_TELLS: Readonly<Record<TakedownEntry, readonly string[]>> = {
  doubleLeg: ['double'],
  // Not "the leg": a trip line ("hooks the leg and trips them down") contains it honestly, which
  // this test reported as 149 contradictions on its first run. The tell was wrong, not the prose —
  // a distinction worth keeping in view, because a parity test that cries wolf gets deleted.
  singleLeg: ['single'],
  reactiveShot: ['times the shot', 'ducks under', 'changes levels'],
  bodyLock: ['body lock', 'lock the body', 'locks the body'],
  trip: ['trip', 'throw'],
};

/**
 * Fighter names are stripped before any text is scanned.
 *
 * `disciplineExemplar` names a fighter after their art, so the kickboxing exemplar's surname is
 * literally "Kickboxing / Muay Thai" — and the first run of this test reported 1,815 punches
 * "narrated as kicks" because the word was in the name rather than the description. A parity check
 * that reads the fighter's name is measuring the fixture, not the prose.
 */
function description(event: FightEvent, names: readonly string[]): string {
  let text = event.text.toLowerCase();
  for (const name of names) text = text.split(name.toLowerCase()).join(' ');
  return text;
}

/** Every fight this suite looks at, across styles that throw different things. */
function manyFights(): FightResult[] {
  const out: FightResult[] = [];
  const corners = [
    disciplineExemplar('karate'),
    disciplineExemplar('kickboxing'),
    disciplineExemplar('boxing'),
    disciplineExemplar('judo'),
    ARCHETYPES.smotherer(),
    ARCHETYPES.striker(),
    ARCHETYPES.guardPlayer(),
    // A fighter who can do everything, so no weapon is starved by the matchup.
    makeFighter({ id: 'fighter_allrounder', lastName: 'Allrounder', attributes: { kicking: 88, strikingOffence: 88, wrestling: 80, groundControl: 82, submissions: 78, strength: 80 } }),
  ];

  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      for (let fight = 0; fight < 30; fight++) {
        const result = simulateFight({
          boutId: `parity:${i}:${j}:${fight}`,
          seed: `parity:${i}:${j}:${fight}`,
          rounds: fight % 5 === 0 ? 5 : 3,
          red: { fighter: corners[i]! },
          blue: { fighter: corners[j]! },
        });
        out.push(result);
      }
    }
  }
  return out;
}

const fights = manyFights();
const NAMES = [
  ...new Set(fights.flatMap((f) => [f.redId, f.blueId].map((id) => String(id)))),
  'Kickboxing / Muay Thai',
  'Karate / Taekwondo',
  'Brazilian Jiu-Jitsu',
  'Judo / Sambo',
  'Boxing',
  'Wrestling',
];
const strikeEvents: FightEvent[] = fights.flatMap((f) =>
  f.events.filter((e) => e.weapon !== undefined),
);

describe('the play-by-play describes the fight that happened', () => {
  it('produces enough strikes across enough styles to be worth checking', () => {
    // Guard against the whole file passing because it measured nothing — the failure mode this
    // repo has now found twice (docs/19 §7.4 F4, F6).
    expect(strikeEvents.length).toBeGreaterThan(5_000);
  });

  it('resolves every weapon at least once, so no branch is checked vacuously', () => {
    const thrown = new Set<Weapon>();
    for (const fight of fights) {
      for (const corner of ['red', 'blue'] as Corner[]) {
        for (const weapon of WEAPONS) {
          if (fight.stats[corner].strikesByWeapon[weapon] > 0) thrown.add(weapon);
        }
      }
    }
    for (const weapon of WEAPONS) {
      expect(thrown.has(weapon), `no ${weapon} was ever resolved`).toBe(true);
    }
  });

  it('never names a technique the resolver did not throw', () => {
    const offences: string[] = [];

    for (const event of strikeEvents) {
      const weapon = event.weapon!;
      const text = description(event, NAMES);
      for (const other of WEAPONS) {
        if (other === weapon) continue;
        for (const tell of TELLS[other]) {
          // A knee is not an elbow, but "knee" appearing in an elbow line is only a contradiction
          // if it is describing the strike — and every line here describes exactly one strike.
          if (text.includes(tell)) {
            offences.push(`${weapon} narrated as ${other} ("${tell}"): ${event.text}`);
          }
        }
      }
    }

    expect(offences.slice(0, 10), `${offences.length} contradictions`).toEqual([]);
  });

  it('describes where a strike landed as the resolver landed it', () => {
    // The second half of the same claim, and the one that would have caught the original defect
    // doc 18 §4.1 names: a punch that rolled `legs` resolved on `strikingOffence`, applied leg
    // damage, and was narrated as a calf kick.
    const offences: string[] = [];
    const legWords = ['thigh', 'calf', 'leg kick', 'low kick'];
    const headWords = ['head', 'chin', 'jaw', 'temple'];

    for (const event of strikeEvents) {
      const text = description(event, NAMES);
      if (event.target !== 'legs' && legWords.some((w) => text.includes(w))) {
        offences.push(`${event.target} strike described as a leg strike: ${event.text}`);
      }
      if (event.target === 'legs' && headWords.some((w) => text.includes(w))) {
        offences.push(`leg strike described as a head strike: ${event.text}`);
      }
    }

    expect(offences.slice(0, 10), `${offences.length} contradictions`).toEqual([]);
  });

  it('only claims a weapon the fighter it is talking about actually landed', () => {
    /*
     * The check that covers the lines which summarise a *sequence* rather than a strike, and the
     * one that caught the original defect: `groundStrikesText` offered "works elbows from the top"
     * at random on a branch that had never resolved an elbow in its life. Per fight and per corner,
     * so it is a real claim rather than a roster-wide average.
     *
     * Knees and elbows only, because they are the two weapons whose *availability* is positional —
     * a knee exists in the clinch and an elbow on the ground — which makes a false mention of
     * either a claim about a phase of the fight that did not happen.
     */
    const offences: string[] = [];

    for (const fight of fights) {
      for (const corner of ['red', 'blue'] as Corner[]) {
        for (const weapon of ['knee', 'elbow'] as Weapon[]) {
          if (fight.stats[corner].strikesByWeapon[weapon] > 0) continue;
          const claimed = fight.events.filter(
            (e) =>
              e.corner === corner &&
              // Fouls are excluded, and finding out why is the test doing its job: an illegal knee
              // to a grounded opponent is narrated by `fouls.ts`, resolved by the foul system, and
              // never passes through `applyStrike` — so it is a real knee that correctly never
              // reaches `strikesByWeapon`. The claim being checked is about *scored* strikes.
              e.kind !== 'foul' &&
              e.kind !== 'pointDeduction' &&
              description(e, NAMES).includes(weapon),
          );
          for (const event of claimed) {
            offences.push(`${corner} landed no ${weapon} but the prose says: ${event.text}`);
          }
        }
      }
    }

    expect(offences.slice(0, 10), `${offences.length} false claims`).toEqual([]);
  });

  it('names the takedown the resolver actually shot', () => {
    /*
     * The same claim as the weapon check, in the phase D2 never audited.
     *
     * `takedownText` opened with `rng.pick(['a double leg', 'a single leg', 'a body lock', 'a
     * reactive shot', 'a trip'])` — the narrator drawing a technique the resolver knew nothing
     * about, which is exactly the arrangement docs/19 §4 D2 rejected for strikes and which
     * survived here because phase 1's parity test only ever looked at strikes. Two consequences,
     * both invisible until something compared them: a judoka and a wrestler shot the same five
     * takedowns in the same proportions, and a shot taken from inside the clinch could be
     * narrated as a double leg from range.
     */
    const offences: string[] = [];
    const takedownEvents = fights.flatMap((f) => f.events.filter((e) => e.takedown !== undefined));

    for (const event of takedownEvents) {
      const text = description(event, NAMES);
      for (const other of TAKEDOWN_ENTRIES) {
        if (other === event.takedown) continue;
        for (const tell of ENTRY_TELLS[other]) {
          if (text.includes(tell)) {
            offences.push(`${event.takedown} narrated as ${other} ("${tell}"): ${event.text}`);
          }
        }
      }
    }

    expect(takedownEvents.length, 'no takedown was ever attempted').toBeGreaterThan(500);
    expect(offences.slice(0, 10), `${offences.length} contradictions`).toEqual([]);
  });

  it('shoots the entries that exist from where the fighter is standing', () => {
    /*
     * A double leg from inside a body lock is not a prose problem, it is a resolver problem, and
     * this is the assertion that keeps the entry table honest about position. The clinch offers
     * the body lock, the trip and the single; range offers the double, the single and the
     * reactive shot. `bodyLock` and `trip` are the two that could only ever come from a tie-up.
     *
     * Stated as a distribution rather than per-event because the event does not record where the
     * shot started — the two clinch-only entries simply must be rarer than the range entries
     * across a population that spends most of its time at range, and a resolver that ignored
     * `from` would produce them at the same rate as everything else.
     */
    const counts = new Map<string, number>();
    for (const fight of fights) {
      for (const event of fight.events) {
        if (event.takedown) counts.set(event.takedown, (counts.get(event.takedown) ?? 0) + 1);
      }
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const clinchOnly = (counts.get('bodyLock') ?? 0) + (counts.get('trip') ?? 0);

    // Every entry has to be reachable, or the table is decoration.
    for (const entry of TAKEDOWN_ENTRIES) {
      expect(counts.get(entry) ?? 0, `${entry} was never shot`).toBeGreaterThan(0);
    }
    expect(clinchOnly / total, `entry mix ${JSON.stringify(Object.fromEntries(counts))}`).toBeLessThan(0.4);
  });

  it('keeps knees in the clinch, where the only knees in the game are thrown', () => {
    // Weapon availability is a property of position, and this keeps it so. A knee at range would
    // be entirely plausible *prose*, which is exactly why the resolver has to be what decides.
    const knees = strikeEvents.filter((e) => e.weapon === 'knee');
    expect(knees.length).toBeGreaterThan(0);
    for (const event of knees) {
      expect(description(event, NAMES)).toContain('fence');
    }
  });
});
