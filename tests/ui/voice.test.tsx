/**
 * What a fighter says and remembers, on their page. Doc 34 C3.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewGame, getWorld } from '@mmasim/data';
import { withLedgerEntry, type Fighter } from '@mmasim/engine';
import { FighterView } from '../../packages/app/src/screens/FighterView';

afterEach(cleanup);

describe('the contract tab', () => {
  it('shows what they remember about the promotion, and why', async () => {
    const db = createNewGame({ era: '2026' });
    const day = getWorld(db).day;
    const fighter = (db.fighters.findAll() as Fighter[]).find((f) => f.promotionId)!;
    const wronged: Fighter = {
      ...fighter,
      ledger: withLedgerEntry(undefined, {
        day,
        promotionId: fighter.promotionId!,
        kind: 'cardCancelled',
      }),
    };
    render(<FighterView db={db} day={day} fighter={wronged} viewer="promoter" />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Contract' }));
    expect(screen.getByText('Relationship')).toBeTruthy();
    expect(
      screen.getByText(/not forgotten a camp wasted on a card that never happened/),
    ).toBeTruthy();
  });
});
