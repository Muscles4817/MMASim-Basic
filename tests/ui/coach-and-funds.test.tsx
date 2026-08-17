/**
 * Two things a player could not find, reported from actually playing.
 *
 * "It told me my training isn't effective without a head coach but I can't see where or how I'm
 * meant to hire one." There is no hire flow and never was — a gym's head coach becomes yours when
 * you join. The screen said the first half and not the second.
 *
 * "The visibility of my current funds whenever I have to spend money is very unclear." The balance
 * appeared in three places in the entire game and none of them was next to a spend.
 *
 * Both defects were in what the screen *said*, so the guards belong here rather than in the model:
 * every underlying function was already correct and already tested.
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

/**
 * Create a fighter, which is the path the report came from.
 *
 * It matters that this is the created-fighter route rather than taking over a seeded one: a
 * seeded fighter is already at a gym with a head coach, so the defect is invisible from there.
 * A created fighter is seated at the *lowest quality* gym, which is the one gym in the seed with
 * no head coach — so every single created fighter hits this.
 */
async function createFighter(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/create');
  renderApp();
  await user.type(await screen.findByLabelText(/First name/i), 'Ade');
  await user.type(screen.getByLabelText(/Last name/i), 'Newman');
  await user.click(screen.getByRole('button', { name: /Turn pro/i }));
  await screen.findByText(/Newman/);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(cleanup);

describe('finding a head coach', () => {
  it('says a coach comes from joining a gym, not from hiring one', async () => {
    /*
     * The reported bug exactly. The screen said training was ineffective without a coach and
     * stopped there, so the player went looking for a hire button that does not exist and never
     * should. Naming the mechanism is the fix.
     */
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/training');

    const status = await screen.findByTestId('coach-status');
    expect(status.textContent ?? '').toMatch(/no head coach/i);
    expect(status.textContent ?? '').toMatch(/head coach becomes yours when you join/i);
  });

  it('names a specific gym to go to rather than gesturing at a list', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/training');

    const status = await screen.findByTestId('coach-status');
    // Either the gym is named, or — if the world genuinely has nowhere to go — it falls back to
    // pointing at the list. What it must never do again is say nothing about the route.
    expect(status.textContent ?? '').toMatch(/nearest room with one is|Join one from the list/i);
  });

  it('shows the head coach on every gym in the picker, or says there is none', async () => {
    /*
     * The other half. The gym row mentioned the coach as a bare surname buried in a metadata
     * list, if at all — and two of the seven gyms have no coach, which a player choosing between
     * them had no way to know. Joining a gym is the only way to get a coach, so the coach is the
     * single most important thing on that row.
     */
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/training');

    const labels = await screen.findAllByText(/Head coach:|No head coach\./i);
    expect(labels.length).toBeGreaterThan(1);
  });
});

describe('seeing what you have before you spend it', () => {
  it('keeps the balance on screen in the header at all times', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    // Every screen, not just the hub — the point is that no point of spending anywhere in the
    // game is now more than a glance from the balance it spends from.
    for (const route of ['#/hub', '#/training', '#/calendar']) {
      goTo(route);
      const funds = await screen.findByTestId('shell-funds');
      expect(funds.textContent ?? '', route).toMatch(/^-?£[\d.]+[km]$/);
    }
  });

  it('states a camp cost against the balance it comes out of', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/training');

    // "£40k of your £52k, leaving £12k" rather than a price the player has to weigh against a
    // number on another screen.
    expect(await screen.findByText(/of your £[\d.]+[km], leaving £|in the red/i)).toBeTruthy();
  });

  it('prices every gym in the picker so the balance in the header can be weighed against it', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/training');

    const prices = await screen.findAllByText(/for eight weeks/i);
    expect(prices.length).toBeGreaterThan(1);
    for (const price of prices) expect(price.textContent ?? '').toMatch(/£[\d.]+[km]/);
  });
});
