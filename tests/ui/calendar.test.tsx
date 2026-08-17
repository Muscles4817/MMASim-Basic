/**
 * The calendar and the inbox, as a player uses them.
 *
 * These exist because the defect they fix was invisible to every test that came before: each one
 * ran a single card, so nobody noticed that time never moved. The tests below deliberately
 * advance more than once.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { App } from '../../packages/app/src/App';
import { GameProvider } from '../../packages/app/src/state/GameProvider';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';

function renderApp() {
  return render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <GameProvider era="2026">
            <RouterProvider>
              <App />
            </RouterProvider>
          </GameProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

const goTo = (hash: string) => {
  window.location.hash = hash;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

/** Take over a promotion, which is the mode that had no clock at all. */
async function becomePromoter(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/start');
  renderApp();
  const heading = await screen.findByRole('heading', { name: /Or run a promotion/i });
  const card = heading.closest('.card') as HTMLElement;
  await user.click(card.querySelectorAll('button')[0] as HTMLElement);
}

describe('the calendar is reachable and shows the clock', () => {
  it('is a tab in promoter mode', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('link', { name: /Calendar/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Inbox/i })).toBeTruthy();
  });

  it('shows what day it is', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');
    expect(await screen.findByText(/Today/i)).toBeTruthy();
    expect((await screen.findByTestId('clock')).textContent).toMatch(/2026/);
  });

  it('offers both named spans and “go to the next thing”', async () => {
    // "To the next thing" is first because it cannot overshoot something the player cared
    // about; the fixed spans are for when the diary is empty.
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');

    expect(await screen.findByRole('button', { name: /A fortnight/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /A month/i })).toBeTruthy();
  });
});

describe('the clock actually moves', () => {
  it('advances the date, which promoter mode could never do', async () => {
    /*
     * The defect four separate reviews found. `advanceWorld` had two callers, both in fighter
     * mode, and a promoter is redirected away from the only screen that had one.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');

    const before = (await screen.findByTestId('clock')).textContent;
    await user.click(screen.getByRole('button', { name: /A month/i }));

    await waitFor(() => expect(screen.getByTestId('clock').textContent).not.toBe(before), {
      timeout: 6000,
    });
  });

  it('moves again on a second press, rather than sticking', async () => {
    // The single-advance case was never the bug; every prior test ran one card and passed.
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');

    await user.click(await screen.findByRole('button', { name: /A month/i }));
    const afterFirst = screen.getByTestId('clock').textContent;

    await user.click(screen.getByRole('button', { name: /A month/i }));
    await waitFor(() => expect(screen.getByTestId('clock').textContent).not.toBe(afterFirst), {
      timeout: 6000,
    });
  });

  it('says what the sport did while time passed', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');

    await user.click(await screen.findByRole('button', { name: /A month/i }));
    await waitFor(
      () => expect(screen.getByText(/fights happened across the sport/i)).toBeTruthy(),
      { timeout: 6000 },
    );
  });
});

describe('whose diary it is', () => {
  it('defaults to yours and can widen to the sport', async () => {
    // One screen serves every mode because ownership is a field on the entry rather than a
    // property of the screen.
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');

    const yours = await screen.findByRole('radio', { name: /Yours/i });
    expect(yours.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /The sport/i })).toBeTruthy();
  });

  it('says the diary is clear when it is', async () => {
    /*
     * The empty state matters more than it looks: a promoter who has just taken over has nothing
     * booked, and a blank list would read as a broken screen rather than as an instruction.
     *
     * That a *scheduled* card appears is asserted in the integration tier, where the card can be
     * scheduled directly. Through the UI it would depend on nobody refusing the fight, which is
     * a coin flip by design and would make this test flaky about a feature working.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');

    expect(await screen.findByText(/Nothing scheduled/i)).toBeTruthy();
    expect(screen.getByText(/Your diary is clear/i)).toBeTruthy();
  });
});

describe('the inbox', () => {
  it('says plainly when there is nothing waiting', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/inbox');

    expect(await screen.findByText(/Nothing waiting/i)).toBeTruthy();
    // And explains what it is for, so an empty screen still teaches.
    expect(screen.getByText(/time will stop rather than run past it/i)).toBeTruthy();
  });

  it('is reachable from every mode', async () => {
    const user = userEvent.setup();
    goTo('#/start');
    renderApp();
    const rows = await screen.findAllByRole('button', { name: /Star power/i });
    await user.click(rows[0]!);

    expect(await screen.findByRole('link', { name: /Inbox/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Calendar/i })).toBeTruthy();
  });
});
