/**
 * Unit tests for the doc 36 modules that are pure enough to test without running a fight:
 * the ground graph, wrestling sequences, clinch games, stories, the mind and stance styles.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.js';
import { ARCHETYPES, makeFighter } from '../testing/fixtures.js';
import { defaultGamePlan } from '../domain/gameplan.js';
import { createCombatant, type Combatant } from './profile.js';
import { legEntryChance, passTarget, recoverGuard } from './groundGraph.js';
import { chainChance, chainedEntry, frontHeadlockChance, scramble } from './wrestling.js';
import { clinchShot } from './clinch.js';
import { cornerStops, hasInjury, injure, survivalRoute } from './stories.js';
import { familyLean, inFightRead, selfAdjustment } from './mind.js';
import { remember } from './memory.js';
import { stanceNow, stanceStyleDefence, stanceStyleTakedownDefence, wantsToSwitch } from './stance.js';
import { emptyTally } from './types.js';
import { cornerAdvice } from './mind.js';
import type { Fighter } from '../domain/fighter.js';

const combatant = (f: Fighter, corner: 'red' | 'blue' = 'red'): Combatant =>
  createCombatant(corner, f, defaultGamePlan());

describe('the ground graph', () => {
  it('lets a great passer skip rungs and an average one mostly not', () => {
    const rng = createRng('pass');
    const great = combatant(makeFighter({ id: 'fighter_g', attributes: { groundControl: 95 } }));
    const average = combatant(makeFighter({ id: 'fighter_a', attributes: { groundControl: 50 } }));
    const skip = (c: Combatant) => {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (passTarget(rng, 'guard', c) !== 'halfGuard') n++;
      return n / 4000;
    };
    expect(skip(great)).toBeGreaterThan(skip(average) * 1.8);
  });

  it('never advances from the back, and always reaches the back from mount', () => {
    const rng = createRng('back');
    const c = combatant(makeFighter({ id: 'fighter_x' }));
    expect(passTarget(rng, 'back', c)).toBeUndefined();
    expect(passTarget(rng, 'mount', c)).toBe('back');
  });

  it('recovers guard toward a guard, never further from one', () => {
    const rng = createRng('recover');
    const bottom = combatant(makeFighter({ id: 'fighter_b', attributes: { scrambling: 95 } }), 'blue');
    const top = combatant(makeFighter({ id: 'fighter_t', attributes: { groundControl: 30 } }));
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const to = recoverGuard(rng, 'mount', bottom, top);
      if (to) seen.add(to);
    }
    expect([...seen]).toEqual(['halfGuard']);
  });

  it('only dives on legs with a leg-lock game, and only from the guards', () => {
    const none = combatant({ ...makeFighter({ id: 'fighter_n' }), style: { legLocks: 0 } });
    const ll = combatant({ ...makeFighter({ id: 'fighter_l' }), style: { legLocks: 0.8 } });
    expect(legEntryChance(none, 'guard')).toBe(0);
    expect(legEntryChance(ll, 'openGuard')).toBeGreaterThan(legEntryChance(ll, 'guard'));
    expect(legEntryChance(ll, 'mount')).toBe(0);
  });
});

describe('wrestling sequences', () => {
  it('chains more for a chain wrestler, less when tired, less on the second link', () => {
    const grinder = combatant(ARCHETYPES.grinder());
    const boxer = combatant(ARCHETYPES.olympicBoxer());
    expect(chainChance(grinder, 0)).toBeGreaterThan(chainChance(boxer, 0) * 3);
    expect(chainChance(grinder, 1)).toBeLessThan(chainChance(grinder, 0));
    const tired = combatant(ARCHETYPES.grinder());
    tired.fatigue = 0.85;
    expect(chainChance(tired, 0)).toBeLessThan(chainChance(grinder, 0) * 0.5);
  });

  it('switches entry on the next link', () => {
    const rng = createRng('entry');
    for (let i = 0; i < 50; i++) expect(chainedEntry(rng, 'singleLeg')).not.toBe('singleLeg');
  });

  it('gives the sprawl-and-brawler fewer front headlocks than a wrestler with a choke game', () => {
    const sprawl = combatant(makeFighter({ id: 'fighter_s', attributes: { wrestling: 75, submissions: 70 }, traits: ['sprawlAndBrawl'] }));
    const wrestler = combatant(makeFighter({ id: 'fighter_w', attributes: { wrestling: 75, submissions: 70 } }));
    expect(frontHeadlockChance(sprawl)).toBeLessThan(frontHeadlockChance(wrestler));
  });

  it('lets the better scrambler win more scrambles', () => {
    const rng = createRng('scr');
    const good = combatant(makeFighter({ id: 'fighter_g', attributes: { scrambling: 92 } }), 'blue');
    const bad = combatant(makeFighter({ id: 'fighter_b', attributes: { scrambling: 35 } }));
    let reversed = 0;
    let taken = 0;
    for (let i = 0; i < 4000; i++) {
      const o = scramble(rng, good, bad);
      if (o === 'reversed') reversed++;
      if (o === 'backTaken') taken++;
    }
    expect(reversed).toBeGreaterThan(taken * 2);
  });
});

describe('clinch games', () => {
  it('throws knees in a Thai clinch and hands in a boxer’s', () => {
    const rng = createRng('clinch');
    const thai = combatant({ ...makeFighter({ id: 'fighter_t' }), style: { clinchGame: 'thai' } });
    const boxer = combatant({ ...makeFighter({ id: 'fighter_b' }), style: { clinchGame: 'dirtyBoxing' } });
    const share = (c: Combatant, w: string) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (clinchShot(rng, c).weapon === w) n++;
      return n / 2000;
    };
    expect(share(thai, 'knee')).toBeGreaterThan(0.7);
    expect(share(boxer, 'punch')).toBeGreaterThan(0.55);
  });
});

describe('stories', () => {
  it('lowers tonight’s numbers without touching the fighter', () => {
    const f = makeFighter({ id: 'fighter_h', attributes: { strikingOffence: 80, power: 80 } });
    const c = combatant(f);
    expect(injure(c, 'hand', 1, 2)).toBe(true);
    expect(injure(c, 'hand', 1, 2)).toBe(false);
    expect(hasInjury(c, 'hand')).toBe(true);
    expect(c.attrs.strikingOffence).toBeLessThan(80);
    expect(f.attributes.strikingOffence).toBe(80);
  });

  it('has a composed fighter tie up and a rattled aggressive one fire back', () => {
    const rng = createRng('surv');
    const vet = combatant(makeFighter({ id: 'fighter_v', attributes: { composure: 92, strength: 80 }, personality: { aggression: 30 } }));
    const hothead = combatant(makeFighter({ id: 'fighter_h', attributes: { composure: 30 }, personality: { aggression: 95 } }));
    const count = (c: Combatant, r: string) => {
      let n = 0;
      for (let i = 0; i < 3000; i++) if (survivalRoute(rng, c) === r) n++;
      return n;
    };
    expect(count(vet, 'tieUp')).toBeGreaterThan(count(hothead, 'tieUp'));
    expect(count(hothead, 'fireBack')).toBeGreaterThan(count(vet, 'fireBack') * 2);
  });

  it('never has a corner pull out an undamaged fighter', () => {
    const rng = createRng('corner');
    const c = combatant(makeFighter({ id: 'fighter_c' }));
    for (let i = 0; i < 500; i++) expect(cornerStops(rng, c)).toBe(false);
    c.damage.head = 98;
    c.knockdownsSuffered = 3;
    let stopped = 0;
    for (let i = 0; i < 500; i++) if (cornerStops(rng, c)) stopped++;
    expect(stopped).toBeGreaterThan(0);
  });
});

describe('the mind', () => {
  it('reads a one-trick opponent and not a mixed one, and a smart fighter reads better', () => {
    const smart = combatant(makeFighter({ id: 'fighter_s', attributes: { fightIq: 92 } }), 'blue');
    const dull = combatant(makeFighter({ id: 'fighter_d', attributes: { fightIq: 35 } }), 'blue');
    const oneTrick = combatant(makeFighter({ id: 'fighter_o' }));
    for (const d of [smart, dull]) for (let i = 0; i < 12; i++) remember(oneTrick, d, 'takedown', false, i);
    for (const d of [smart, dull]) for (let i = 0; i < 4; i++) remember(oneTrick, d, 'punch', false, i);
    expect(inFightRead(smart, 'takedown')).toBeGreaterThan(inFightRead(dull, 'takedown') * 2);
    expect(inFightRead(smart, 'punch')).toBe(0);
  });

  it('backs off a failing family, more for a smart humble fighter than an arrogant dull one', () => {
    const smart = combatant(makeFighter({ id: 'fighter_s', attributes: { fightIq: 92 }, personality: { ego: 20 } }));
    const dull = combatant(makeFighter({ id: 'fighter_d', attributes: { fightIq: 35 }, personality: { ego: 90 } }));
    const other = combatant(makeFighter({ id: 'fighter_o' }), 'blue');
    for (const c of [smart, dull]) for (let i = 0; i < 6; i++) remember(c, other, 'takedown', false, i);
    expect(selfAdjustment(smart, 'takedown')).toBeLessThan(selfAdjustment(dull, 'takedown'));
    expect(familyLean(smart, 'takedown')).toBeLessThan(1);
  });

  it('tells a fighter whose shots are being stuffed to stop shooting', () => {
    const rng = createRng('advice');
    const c = combatant(makeFighter({ id: 'fighter_c', personality: { ego: 10, discipline: 90 } }));
    c.plan = { ...c.plan, campQuality: 1 };
    const o = combatant(makeFighter({ id: 'fighter_o' }), 'blue');
    for (let i = 0; i < 3; i++) remember(c, o, 'takedown', false, i);
    let said = '';
    for (let i = 0; i < 20 && !said; i++) said = cornerAdvice(rng, c, o, emptyTally(), emptyTally())?.text ?? '';
    expect(said).toMatch(/Stop shooting/);
    expect(c.mem.lean.takedown).toBeLessThan(1);
  });
});

describe('stance styles', () => {
  it('gives each shape a pro and a con', () => {
    const shape = (s: 'bladed' | 'square' | 'crouched') =>
      combatant({ ...makeFighter({ id: `fighter_${s}` }), style: { stanceStyle: s } });
    const bladed = shape('bladed');
    const square = shape('square');
    const crouched = shape('crouched');
    expect(stanceStyleDefence(bladed, 'punch', 'head', 'outside')).toBeGreaterThan(1);
    expect(stanceStyleDefence(bladed, 'kick', 'legs', 'outside')).toBeLessThan(1);
    expect(stanceStyleDefence(square, 'kick', 'body', 'boxing')).toBeGreaterThan(1);
    expect(stanceStyleDefence(square, 'punch', 'head', 'boxing')).toBeLessThan(1);
    expect(stanceStyleTakedownDefence(crouched)).toBeGreaterThan(1);
    expect(stanceStyleDefence(crouched, 'kick', 'head', 'outside')).toBeLessThan(1);
  });

  it('switches the lead foot when a fighter switches stance, and leaves switch-hitters alone', () => {
    const o = combatant(makeFighter({ id: 'fighter_o', stance: 'orthodox' }));
    o.stanceSwitched = true;
    expect(stanceNow(o)).toBe('southpaw');
    const sw = combatant(makeFighter({ id: 'fighter_sw', stance: 'switch' }));
    const rng = createRng('sw');
    for (let i = 0; i < 200; i++) expect(wantsToSwitch(rng, sw, o)).toBe(false);
  });
});
