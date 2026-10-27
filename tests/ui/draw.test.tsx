/**
 * Star power on the page, and the badge the matchmaking picker will reuse. Doc 34 C2.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createNewGame, getWorld } from '@mmasim/data';
import type { Fighter } from '@mmasim/engine';
import { FighterView } from '../../packages/app/src/screens/FighterView';
import { DrawBadge } from '../../packages/app/src/ui/DrawBadge';

afterEach(cleanup);

const db = createNewGame({ era: '2026' });
const day = getWorld(db).day;
const fighters = db.fighters.findAll() as Fighter[];
const star = fighters.slice().sort((a, b) => b.starPower - a.starPower)[0]!;

describe('the draw on the fighter page', () => {
  it('says how much they sell, which way it is going, and who they are to a crowd', () => {
    render(<FighterView db={db} day={day} fighter={star} viewer="promoter" />);
    const card = screen.getByText('Draw').closest('section, div, article')!.parentElement!;
    expect(within(card).getByText(/Draw: Headliner|Draw: Main-card draw/)).toBeTruthy();
    expect(card.textContent).toMatch(/Sells best in/);
    // The number itself never reaches the page.
    expect(card.textContent).not.toContain(String(Math.round(star.starPower)));
  });

  it('speaks to you in the first person on your own page', () => {
    render(<FighterView db={db} day={day} fighter={star} viewer="self" />);
    expect(screen.getByText('Your draw')).toBeTruthy();
  });
});

describe('DrawBadge', () => {
  it('names the class and the trend for a screen reader, and marks a home fighter', () => {
    render(<DrawBadge fighter={star} day={day} market={star.nationality} detail />);
    expect(screen.getByText(/^Draw: .+, (rising|steady|fading)$/)).toBeTruthy();
    expect(screen.getByText('Home fighter')).toBeTruthy();
  });
});
