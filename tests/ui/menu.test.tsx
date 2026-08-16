/**
 * The main menu, as a player walks it.
 *
 * The game used to open straight into a single implicit save created on first load, so there
 * was no point at which anybody chose anything: no second career without destroying the first,
 * and no choice of which world you were entering because there was only one.
 *
 * These mount the real gate rather than the menu component alone, because the interesting part
 * is the seam — choosing a save has to actually produce a game built from that save's world,
 * and a component test of the menu would pass whether or not it did.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { listSaves } from '@mmasim/data';
import { App } from '../../packages/app/src/App';
import { SaveGate } from '../../packages/app/src/state/SaveGate';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';

function renderApp() {
  return render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <SaveGate>
            <RouterProvider>
              <App />
            </RouterProvider>
          </SaveGate>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('landing on the menu', () => {
  it('shows the menu rather than dropping you into a game', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /MMA Sim/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /New game/i })).toBeTruthy();
  });

  it('says there is nothing to continue when there is nothing to continue', () => {
    renderApp();
    expect(screen.getByText(/No saves yet/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Continue$/i })).toBeNull();
  });

  it('offers both worlds, and says what is different about them', () => {
    /*
     * The era is a choice about which world rather than a difficulty setting, so the menu has
     * to state what actually differs. `Segmented` renders its hints visibly, which is the only
     * reason this reads as a decision rather than two words.
     */
    renderApp();
    expect(screen.getByRole('radio', { name: /2026/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /2020/i })).toBeTruthy();
    expect(screen.getByText(/Real promotions and real fighters/i)).toBeTruthy();
  });

  it('is honest about where the save lives', () => {
    // Browser storage is genuinely fragile and the player should know before investing fifteen
    // simulated years in it.
    renderApp();
    expect(screen.getByText(/stored in this browser/i)).toBeTruthy();
  });
});

describe('starting a game', () => {
  it('creates a save and enters the world', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /New game/i }));

    // We are in the game now, not the menu.
    await waitFor(() => expect(screen.queryByRole('button', { name: /New game/i })).toBeNull());
    expect(listSaves(localStorage)).toHaveLength(1);
  });

  it('records which world the save was built from', async () => {
    /*
     * Recorded rather than inferred, because it is not recoverable afterwards: a 2026 save
     * played for six years and a 2020 save played for twelve are the same day number with
     * entirely different rosters.
     */
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('radio', { name: /2020/i }));
    await user.click(screen.getByRole('button', { name: /New game/i }));

    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));
    expect(listSaves(localStorage)[0]!.era).toBe('2020');
  });

  it('builds the world the save actually asked for', async () => {
    /*
     * The seam this suite exists for. Choosing 2026 has to produce the 2026 roster — a menu
     * that records an era and then builds the other one would pass every test that only looked
     * at the menu.
     */
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('radio', { name: /2026/i }));
    await user.click(screen.getByRole('button', { name: /New game/i }));

    window.location.hash = '#/roster';
    // A 2026-only fighter. The 2020 roster does not contain him.
    expect(await screen.findByText(/Aspinall/i, {}, { timeout: 4000 })).toBeTruthy();
  });
});

describe('coming back to it', () => {
  it('lists a save you have already started, and lets you continue it', async () => {
    const user = userEvent.setup();
    const first = renderApp();

    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));

    // A new session: the save survives, the "which save is open" pointer does not.
    first.unmount();
    sessionStorage.clear();
    renderApp();

    expect(screen.getByRole('button', { name: /^Continue$/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Continue$/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /New game/i })).toBeNull());
  });

  it('keeps two saves apart rather than overwriting one with the other', async () => {
    // The entire reason slots exist: starting a second career used to destroy the first.
    const user = userEvent.setup();
    const first = renderApp();

    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));

    first.unmount();
    sessionStorage.clear();
    const second = renderApp();
    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(2));

    second.unmount();
    sessionStorage.clear();
    renderApp();
    expect(screen.getByText(/2 saves/i)).toBeTruthy();
  });
});

describe('deleting a save', () => {
  it('does not delete on the first tap', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));

    first.unmount();
    sessionStorage.clear();
    renderApp();

    await user.click(screen.getByRole('button', { name: /^Delete/i }));
    expect(listSaves(localStorage)).toHaveLength(1);
  });

  it('names the save in the confirmation rather than asking “are you sure”', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));
    const name = listSaves(localStorage)[0]!.name;

    first.unmount();
    sessionStorage.clear();
    renderApp();

    await user.click(screen.getByRole('button', { name: /^Delete/i }));
    expect(screen.getByRole('button', { name: new RegExp(`Delete ${name}`, 'i') })).toBeTruthy();
  });

  it('deletes on the second, and the save is gone', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));

    first.unmount();
    sessionStorage.clear();
    renderApp();

    await user.click(screen.getByRole('button', { name: /^Delete/i }));
    const confirm = screen.getAllByRole('button', { name: /^Delete /i })[0]!;
    await user.click(confirm);

    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(0));
  });

  it('lets you back out', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(screen.getByRole('button', { name: /New game/i }));
    await waitFor(() => expect(listSaves(localStorage)).toHaveLength(1));

    first.unmount();
    sessionStorage.clear();
    renderApp();

    await user.click(screen.getByRole('button', { name: /^Delete/i }));
    await user.click(screen.getByRole('button', { name: /^Keep$/i }));
    expect(listSaves(localStorage)).toHaveLength(1);
  });
});
