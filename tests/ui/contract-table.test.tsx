/**
 * The contract table on the fighter page. Doc 34 C4.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import type { Fighter, Promotion } from '@mmasim/engine';
import { FighterView } from '../../packages/app/src/screens/FighterView';
import { ContractTable } from '../../packages/app/src/screens/ContractTable';

afterEach(cleanup);

function setup() {
  const db = createNewGame({ era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { ...getWorld(db), playerRole: 'promoter', playerPromotionId: promotion.id });
  const fighter = (db.fighters.findAll() as Fighter[]).find((f) => f.promotionId === promotion.id)!;
  return { db, promotion, fighter, day: getWorld(db).day };
}

describe('talking terms', () => {
  it('opens from the header, with a meter and an offer to make', async () => {
    const { db, promotion, fighter, day } = setup();
    let signed = 0;
    render(
      <FighterView
        db={db}
        day={day}
        fighter={fighter}
        viewer="promoter"
        negotiationLabel="Re-sign"
        negotiation={
          <ContractTable
            db={db}
            fighter={fighter}
            promotion={promotion}
            mode="resign"
            onSigned={() => (signed += 1)}
          />
        }
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Re-sign' }));
    expect(screen.getByRole('meter', { name: /How close/ })).toBeTruthy();
    expect(screen.getByLabelText(/Show purse/)).toBeTruthy();
    expect(screen.getByText('Matching rights')).toBeTruthy();

    // The opening offer is the going rate: they either take it or say what would close it.
    await user.click(screen.getByRole('button', { name: 'Make the offer' }));
    const answered =
      signed > 0 ||
      screen.queryByText(/came back with/) !== null ||
      screen.queryByText(/walked away/) !== null;
    expect(answered).toBe(true);
  });

  it('signs a generous offer and says so', async () => {
    const { db, promotion, fighter } = setup();
    let signed = 0;
    render(
      <ContractTable
        db={db}
        fighter={fighter}
        promotion={promotion}
        mode="resign"
        onSigned={() => (signed += 1)}
      />,
    );
    const user = userEvent.setup();
    const show = screen.getByLabelText(/Show purse/) as HTMLInputElement;
    await user.clear(show);
    await user.type(show, String(Math.round(Number(show.defaultValue || '10') * 3 + 50)));
    await user.click(screen.getByRole('button', { name: 'Make the offer' }));
    expect(signed).toBe(1);
    expect(screen.getByRole('status').textContent).toMatch(/Signed/);
  });
});
