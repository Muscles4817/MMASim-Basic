/** Stance-style trade-offs: the same fighter in each stance style against three kinds of opponent. Run: npx vite-node tools/audit/fight-engine-stances.ts */
import { makeFighter, simulateFight, type Fighter } from '@mmasim/engine';
const N = Number(process.env.N ?? 2500);
const opponents: [string, Fighter][] = [
  ['leg-kicker', makeFighter({ id: 'fighter_k', lastName: 'K', attributes: { kicking: 85, strikingOffence: 60 } })],
  ['wrestler', makeFighter({ id: 'fighter_w', lastName: 'W', attributes: { wrestling: 82, groundControl: 75, strikingOffence: 45 } })],
  ['boxer', makeFighter({ id: 'fighter_b', lastName: 'B', attributes: { strikingOffence: 82, kicking: 35 } })],
];
const styles = ['standard', 'bladed', 'square', 'crouched'] as const;
const rows: string[] = [];
for (const st of styles) {
  const me = { ...makeFighter({ id: 'fighter_me', lastName: 'Me' }), style: { stanceStyle: st } };
  const cells: string[] = [];
  for (const [label, opp] of opponents) {
    let w = 0, l = 0, legs = 0, head = 0, tdA = 0, tdL = 0;
    for (let i = 0; i < N; i++) {
      const r = simulateFight({ boutId: `st-${label}-${i}`, red: { fighter: me }, blue: { fighter: opp } });
      if (r.winnerId === me.id) w++; else if (r.winnerId === opp.id) l++;
      legs += r.stats.blue.strikesByTarget.legs; head += r.stats.blue.strikesByTarget.head;
      tdA += r.stats.blue.takedownsAttempted; tdL += r.stats.blue.takedownsLanded;
    }
    const mech = label === 'leg-kicker' ? `legs absorbed ${(legs / N).toFixed(1)}` : label === 'wrestler' ? `TD against ${(100 * tdL / tdA).toFixed(0)}%` : `head absorbed ${(head / N).toFixed(1)}`;
    cells.push(`${label}: win ${(100 * w / (w + l)).toFixed(1)}%, ${mech}`);
  }
  rows.push(`${st.padEnd(9)} ${cells.join('   ')}`);
}
console.log(rows.join('\n'));
