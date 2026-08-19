/**
 * The judges, described to the player.
 *
 * `JUDGE_ARCHETYPES` has been in the seed since officials existed and the game never told
 * anybody which one was sitting cageside — so a card that went against the visible statistics
 * read as the game being arbitrary rather than as a fact about the person who wrote it.
 *
 * At this tier rather than in the engine's own unit suite because the claim is about the five
 * judges the game actually ships, and the engine cannot import the seed. The interesting case
 * is `balanced`: its largest single weight is damage, so the obvious implementation describes
 * the most even-handed judge in the sport as a damage judge — and the gap between its first and
 * second weights is 0.10, exactly the same as `controlFirst`'s, so no threshold on that gap can
 * separate them either.
 */

import { describe, expect, it } from 'vitest';
import { SEED_JUDGES } from '../../packages/data/src/seed/organisations';
import { describeJudge, judgeLeaning } from '../../packages/engine/src/domain/officials';

describe('a judge describes themselves', () => {
  it('gives every shipped archetype its own name, balanced included', () => {
    const byName = Object.fromEntries(SEED_JUDGES.map((j) => [j.name, judgeLeaning(j)]));
    expect(byName).toEqual({
      'Patricia Dunne': 'Damage',
      'Warren Holt': 'Control',
      'Luis Arroyo': 'Volume',
      'Sandra Bell': 'Balanced',
      'Doug Frawley': 'Pressure',
    });
  });

  it('warns about the judge everyone complains about', () => {
    // Consistency 42, and the seed comment says so: "cards nobody can explain, which is a real
    // feature of the sport and needs to exist in the pool." The player should be told before
    // the fight, not left to infer it from the card afterwards.
    const frawley = SEED_JUDGES.find((j) => j.name === 'Doug Frawley')!;
    expect(describeJudge(frawley)).toMatch(/erratic/i);
  });

  it('says when a judge applies their criteria the same way every time', () => {
    const bell = SEED_JUDGES.find((j) => j.name === 'Sandra Bell')!;
    expect(describeJudge(bell)).toMatch(/balanced card/i);
    expect(describeJudge(bell)).toMatch(/same way every time/i);
  });
});
