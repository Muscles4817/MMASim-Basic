import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeFighter } from '../testing/fixtures.js';
import { drillStyle, styleOf } from './style.js';
import { chooseSubmission, submissionsFrom, SUBMISSIONS } from './submissions.js';
import { createMemory, remember, resetRoundMemory, successRate } from './memory.js';
import { createRng } from '../core/rng.js';

describe('styleOf', () => {
  it('is deterministic per fighter and differs between identical-numbered fighters', () => {
    const a = makeFighter({ id: 'fighter_x' });
    const a2 = makeFighter({ id: 'fighter_x' });
    const b = makeFighter({ id: 'fighter_y' });
    expect(styleOf(a)).toEqual(styleOf(a2));
    expect(styleOf(a).combos).not.toEqual(styleOf(b).combos);
  });

  it('gives a submission specialist a signature and a non-grappler none', () => {
    expect(styleOf(ARCHETYPES.guardPlayer()).signatureSub).toBeDefined();
    expect(styleOf(ARCHETYPES.olympicBoxer()).signatureSub).toBeUndefined();
  });

  it('reads stance style off the background', () => {
    const karateka = makeFighter({ id: 'fighter_k' });
    const k = { ...karateka, background: { discipline: 'karate' as const, attainment: 'national' as never } };
    expect(styleOf(k).stanceStyle).toBe('bladed');
    const thai = { ...karateka, id: karateka.id, background: { discipline: 'kickboxing' as const, attainment: 'national' as never } };
    expect(styleOf(thai).stanceStyle).toBe('square');
    expect(styleOf(thai).clinchGame).toBe('thai');
  });

  it('lets an override name a signature and always weights it', () => {
    const f = { ...makeFighter({ id: 'fighter_o' }), style: { signatureSub: 'twister' as const } };
    const s = styleOf(f);
    expect(s.signatureSub).toBe('twister');
    expect(s.subs.twister).toBeGreaterThanOrEqual(3.5);
  });

  it('gates leg locks behind a leg-lock game', () => {
    const wrestler = makeFighter({ id: 'fighter_w', attributes: { wrestling: 90, submissions: 40 } });
    expect(styleOf(wrestler).subs.heelHook ?? 0).toBeLessThan(0.2);
  });
});

describe('submission choice', () => {
  it('only offers what the position offers', () => {
    for (const k of submissionsFrom('back', true)) expect(SUBMISSIONS[k].fromTop).toContain('back');
    expect(submissionsFrom('back', true)).toContain('rearNaked');
    expect(submissionsFrom('guard', false)).toContain('triangle');
  });

  it('chains into a partner after a failure', () => {
    const rng = createRng('chain');
    const rep = { armbar: 1, triangle: 1, omoplata: 1, guillotine: 1, kimura: 1 };
    const avail = submissionsFrom('guard', false);
    let partner = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const k = chooseSubmission(rng, rep, avail, 'armbar');
      if (k === 'triangle' || k === 'omoplata') partner++;
    }
    expect(partner / n).toBeGreaterThan(0.6);
  });
});

describe('memory', () => {
  it('writes both sides and resets per round', () => {
    const a = { mem: createMemory() };
    const b = { mem: createMemory() };
    remember(a, b, 'takedown', false, 10);
    remember(a, b, 'takedown', true, 20);
    expect(a.mem.tried.takedown).toBe(2);
    expect(a.mem.landed.takedown).toBe(1);
    expect(b.mem.seen.takedown).toBe(2);
    expect(b.mem.seenLanded.takedown).toBe(1);
    expect(a.mem.last).toMatchObject({ family: 'takedown', landed: true, at: 20 });
    resetRoundMemory(a);
    expect(a.mem.roundTried.takedown).toBe(0);
    expect(a.mem.tried.takedown).toBe(2);
    expect(successRate(a.mem, 'takedown')).toBeCloseTo((1 + 1.2) / 5);
  });
});

describe('drilling', () => {
  it('makes what a camp drilled more of the repertoire, a little at a time', () => {
    const f = makeFighter({ id: 'fighter_drill', attributes: { strikingOffence: 80 } });
    const before = styleOf(f);
    const drilled = { ...f, style: drillStyle(f, ['boxing'], 8) };
    const after = styleOf(drilled);
    const changed = (Object.keys(after.combos) as (keyof typeof after.combos)[]).filter(
      (k) => after.combos[k] !== before.combos[k],
    );
    expect(changed.length).toBe(1);
    expect(after.combos[changed[0]!]).toBeGreaterThan(before.combos[changed[0]!]);
    expect(after.combos[changed[0]!]).toBeLessThan(before.combos[changed[0]!] * 1.1);
  });

  it('links a wrestler’s shots and gives a good grappler a signature', () => {
    const w = makeFighter({ id: 'fighter_dw', attributes: { wrestling: 70 } });
    expect(styleOf({ ...w, style: drillStyle(w, ['wrestling'], 8) }).chainWrestling).toBeGreaterThan(styleOf(w).chainWrestling);
    const g = makeFighter({ id: 'fighter_dg', attributes: { submissions: 64 } });
    expect(styleOf(g).signatureSub).toBeUndefined();
    expect(drillStyle(g, ['submissions'], 8)?.signatureSub).toBeDefined();
  });

  it('leaves the style alone when the camp drilled nothing it can hold', () => {
    const f = makeFighter({ id: 'fighter_dc' });
    expect(drillStyle(f, ['conditioning'], 8)).toBeUndefined();
  });
});
