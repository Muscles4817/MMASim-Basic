/**
 * Career events on the fighter page. Doc 34 C6.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewGame, getWorld } from '@mmasim/data';
import type { Fighter } from '@mmasim/engine';
import { FighterView } from '../../packages/app/src/screens/FighterView';

afterEach(cleanup);

function setup(patch: (f: Fighter, day: number) => Partial<Fighter>) {
  const db = createNewGame({ era: '2026' });
  const day = getWorld(db).day;
  const base = (db.fighters.findAll() as Fighter[]).find((f) => f.retiredDay === undefined)!;
  const opponent = (db.fighters.findAll() as Fighter[]).find((f) => f.id !== base.id)!;
  const fighter = { ...base, ...patch(base, day) } as Fighter;
  db.fighters.upsert(fighter as never);
  return { db, day, fighter, opponent };
}

describe('the fighter page', () => {
  it('names the fight in their head and offers time off to the promoter', async () => {
    const { db, day, fighter, opponent } = setup(() => ({}));
    const shaken: Fighter = {
      ...fighter,
      condition: { ...fighter.condition, confidence: 20 },
      record: [
        ...fighter.record,
        {
          boutId: 'b1',
          opponentId: opponent.id,
          promotionId: fighter.promotionId!,
          day: day - 60,
          outcome: 'loss',
          method: 'ko',
          round: 1,
          timeSeconds: 60,
          divisionId: fighter.divisionId,
          wasTitleFight: false,
        } as never,
      ],
    };
    let rested = 0;
    render(
      <FighterView
        db={db}
        day={day}
        fighter={shaken}
        viewer="promoter"
        onTimeOff={() => (rested += 1)}
      />,
    );
    expect(screen.getByText('Head space')).toBeTruthy();
    expect(screen.getByText(new RegExp(`knockout against .*${opponent.lastName}`))).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Time off' }));
    expect(rested).toBe(1);
    expect(
      (screen.getByRole('button', { name: 'A sports psychologist' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the medical history, with what keeps coming back', async () => {
    const { db, day, fighter } = setup((_, d) => ({
      injuries: [
        {
          id: 'i1',
          type: 'hand',
          day: d - 700,
          healedDay: d - 640,
          severity: 0.5,
          source: 'fight',
        },
        { id: 'i2', type: 'hand', day: d - 300, healedDay: d - 230, severity: 0.5, source: 'camp' },
      ] as never,
    }));
    render(<FighterView db={db} day={day} fighter={fighter} viewer="promoter" />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /Career/ }));
    expect(screen.getByText('Medical history')).toBeTruthy();
    expect(screen.getByText(/Hand \(2 times\)/)).toBeTruthy();
  });
});
