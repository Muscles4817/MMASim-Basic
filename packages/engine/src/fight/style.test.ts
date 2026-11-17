import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeFighter } from '../testing/fixtures.js';
import { styleOf } from './style.js';
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
