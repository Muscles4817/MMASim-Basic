/**
 * What happens when the device will not store the save.
 *
 * This is the suite for the bug that made the game stop starting on a phone. A fresh 2026 save
 * is 2.80 MB and `localStorage` gives an origin about 5 MB for every save put together, so a
 * player with one career in progress hit the ceiling — and the write that hit it happened
 * inside a React render, because the world is built in a `useState` initialiser. A quota
 * refusal therefore did not warn anybody: it unmounted the app into the error boundary, and
 * because the cause was persisted, it did so again on every reload.
 *
 * Saves live in IndexedDB now, which is a share of free disk rather than 5 MB. jsdom has no
 * IndexedDB, so what these tests exercise is the *fallback* path — and that is the point. Even
 * on the small store, and even when it is completely full, the game has to open and say so
 * rather than die.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
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

const realLocalStorage = globalThis.localStorage;

/**
 * A `localStorage` with a real ceiling, counted in UTF-16 bytes as a browser counts it.
 *
 * Large enough for the registry and the theme — a few hundred bytes — and nowhere near large
 * enough for a roster, which is exactly the state a phone reaches after one in-game year.
 */
function installFullStorage(limitBytes: number): void {
  const map = new Map<string, string>();
  const used = (): number =>
    [...map].reduce((n, [key, value]) => n + (key.length + value.length) * 2, 0);

  const store: Storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      const previous = map.get(key);
      map.delete(key);
      if (used() + (key.length + value.length) * 2 > limitBytes) {
        if (previous !== undefined) map.set(key, previous);
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(key, value);
    },
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: realLocalStorage,
    configurable: true,
    writable: true,
  });
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'localStorage', {
    value: realLocalStorage,
    configurable: true,
    writable: true,
  });
});

describe('a device that will not store the save', () => {
  it('still opens the game rather than crashing into the error boundary', async () => {
    const user = userEvent.setup();
    installFullStorage(64 * 1024);
    renderApp();

    await user.click(screen.getByRole('button', { name: /New game/i }));

    // The regression. This was "Something went wrong", on every load, forever.
    expect(
      await screen.findByText(/Or take over an existing fighter/i, {}, { timeout: 6000 }),
    ).toBeTruthy();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });

  it('tells the player their progress is not being saved', async () => {
    const user = userEvent.setup();
    installFullStorage(64 * 1024);
    renderApp();

    await user.click(screen.getByRole('button', { name: /New game/i }));

    // Loud, but survivable — which is the whole trade. A write-behind backend cannot report by
    // throwing, so this banner is the only thing standing between the player and hours of
    // progress they think is safe.
    expect(
      await screen.findByText(/Your progress is not being saved/i, {}, { timeout: 6000 }),
    ).toBeTruthy();
  });

  it('says nothing of the sort when storage is working', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /New game/i }));

    expect(
      await screen.findByText(/Or take over an existing fighter/i, {}, { timeout: 6000 }),
    ).toBeTruthy();
    expect(screen.queryByText(/Your progress is not being saved/i)).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });
});
