/**
 * Win-rate swing of one attribute moved 38 → 98 on the contender archetype against the contender,
 * the G4 probe from `tests/statistical/styles.test.ts`, for several attributes at once.
 * Run: npx vite-node tools/audit/attribute-swings.ts [keys...]
 */
import {
  ARCHETYPES,
  makeFighter,
  simulateFight,
  type AttributeKey,
  type Fighter,
} from '@mmasim/engine';

const N = Number(process.env.N ?? 3000);
const rate = (a: Fighter, b: Fighter, tag: string) => {
  let w = 0;
  let l = 0;
  for (let i = 0; i < N; i++) {
    const r = simulateFight({ boutId: `${tag}-${i}`, red: { fighter: a }, blue: { fighter: b } });
    if (r.winnerId === a.id) w++;
    else if (r.winnerId === b.id) l++;
  }
  return w / (w + l);
};
const keys = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
        'wrestling',
        'takedownDefence',
        'strikingOffence',
        'strikingDefence',
        'kicking',
        'scrambling',
        'cardio',
      ]
) as AttributeKey[];
for (const key of keys) {
  const at = (v: number) =>
    makeFighter({
      id: `fighter_swing_${key}`,
      lastName: 'S',
      attributes: { ...ARCHETYPES.contender().attributes, [key]: v },
    });
  const swing =
    100 *
    (rate(at(98), ARCHETYPES.contender(), `swing:${key}`) -
      rate(at(38), ARCHETYPES.contender(), `swing:${key}`));
  console.log(`${key.padEnd(16)} ${swing.toFixed(1)} pp`);
}
