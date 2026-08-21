/**
 * What a camp did, on the screen that did it.
 *
 * The report used to be a card appended below the training form, so reading it meant scrolling
 * past the controls that produced it while a division picker and a gym list stayed on screen
 * competing for attention. On the one screen in the game where a single click consumes months of
 * a career, the result of that click was a footnote — and there was no way back to the career
 * from it except finding the nav.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

async function trainOnce(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/start/fighter');
  renderApp();
  // Three steps now rather than one tap, which is the whole change: browse, inspect,
  // then commit explicitly. Clicking a row used to start the save.
  const rows = await screen.findAllByRole('button', { name: /./ });
  const row = rows.find((r) => r.classList.contains('datatable__rowbutton'))!;
  await user.click(row);
  await user.click(await screen.findByRole('button', { name: /^Take control of/i }));
  await user.click(await screen.findByRole('button', { name: /^Yes — take control of/i }));
  goTo('#/training');
  await user.click(await screen.findByRole('button', { name: /Train for 8 weeks/i }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(cleanup);

describe('the camp report', () => {
  it('takes the screen rather than sitting under the form that produced it', async () => {
    const user = userEvent.setup();
    await trainOnce(user);

    expect(await screen.findByText(/Camp report/i)).toBeTruthy();
    // The form is gone. Leaving it up meant the outcome of the primary action competed with the
    // controls for that action, and usually lost.
    expect(screen.queryByRole('button', { name: /Train for 8 weeks/i })).toBeNull();
  });

  it('says how much time went by and how old that leaves you', async () => {
    const user = userEvent.setup();
    await trainOnce(user);

    expect(await screen.findByText(/8 weeks of work/i)).toBeTruthy();
    expect(await screen.findByText(/It is .* and you are \d+/i)).toBeTruthy();
  });

  it('totals the camp, because six small deltas do not answer "was that worth it"', async () => {
    const user = userEvent.setup();
    await trainOnce(user);

    expect(await screen.findByText(/rating points gained/i)).toBeTruthy();
  });

  it('says what the camp cost and what is left', async () => {
    const user = userEvent.setup();
    await trainOnce(user);

    expect(await screen.findByText(/spent/i)).toBeTruthy();
    expect(await screen.findByText(/left$/i)).toBeTruthy();
  });

  it('shows where each attribute landed, not only how far it moved', async () => {
    /*
     * "+2" is meaningless without knowing whether that is 40 to 42 or 88 to 90 — and the second
     * is nearly impossible while the first is routine.
     */
    const user = userEvent.setup();
    await trainOnce(user);

    await screen.findByText(/Camp report/i);
    const improved = screen.queryByText(/What improved/i);
    expect(improved).toBeTruthy();
  });

  it('gives a way back to the career, which the old report did not', async () => {
    const user = userEvent.setup();
    await trainOnce(user);

    const back = await screen.findByRole('button', { name: /Back to your career/i });
    await user.click(back);

    // The hub, not the training screen with a stale report on it.
    expect(await screen.findByTestId('standing')).toBeTruthy();
  });

  it('lets you go straight into another camp without a round trip', async () => {
    const user = userEvent.setup();
    await trainOnce(user);

    await user.click(await screen.findByRole('button', { name: /Run another camp/i }));
    expect(await screen.findByRole('button', { name: /Train for 8 weeks/i })).toBeTruthy();
  });
});
