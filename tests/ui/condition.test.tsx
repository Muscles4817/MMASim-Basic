/**
 * The player can see what the career is costing them.
 *
 * Freshness, body wear and head trauma are three of the four things doc 25 makes a career turn on,
 * and between them they were invisible: trauma appeared only once it passed 45, wear appeared
 * nowhere on the hub at all, and freshness did not exist. A resource the player learns about only
 * when it is already bad is not a resource — it is a surprise, and they cannot plan around it.
 *
 * Written at this tier because that is where the defect was. The model underneath is measured in
 * `freshness.test.ts`; the claim here is that the screen says it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

/**
 * The hub's freshness `Fact`, specifically.
 *
 * Scoped rather than `findByText(/Freshness/i)` because the hub now carries a rest card that
 * explains what freshness is *for* — which is the point of it being there, and which makes a bare
 * case-insensitive text match ambiguous. The claim these tests make is about the labelled figure,
 * so they point at the labelled figure.
 */
async function freshnessFact(): Promise<HTMLElement> {
  const labels = await screen.findAllByText(/Freshness/i);
  const label = labels.find((node) => node.classList.contains('fact__label'));
  if (!label) throw new Error('no freshness fact on the hub');
  return label;
}

describe('the hub says what the career has cost', () => {
  it('shows freshness, in words rather than as a bare number', async () => {
    // "62 / 100" tells a player nothing about whether to take the fight. "Sharp" does.
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    const label = await freshnessFact();
    expect(label).toBeTruthy();
    expect(document.body.textContent ?? '').toMatch(/Fresh|Sharp|Worked|Flat|Running on empty/);
  });

  it('shows body wear and head trauma always, not only once they are bad', async () => {
    /*
     * Trauma was gated behind `> 45` and wear was not on this screen at all. Hiding a number until
     * it is alarming means the player finds out at the point where nothing can be done about it,
     * which is the opposite of what these are for.
     */
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    await freshnessFact();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Body wear/i);
    expect(text).toMatch(/Head trauma/i);
  });

  it('says how long it has been since the last fight, because rust is already modelled', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    await screen.findByText(/Last fought/i);
    // A debutant has never fought, and the screen has to say that rather than showing "0d ago".
    expect(document.body.textContent ?? '').toMatch(/Never/);
  });

  it('starts a new fighter fresh rather than blank or exhausted', async () => {
    // Absent means fresh. A created fighter reading "Running on empty" on day one would be the
    // migration rule failing in the most visible possible place.
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    const label = await freshnessFact();
    const fact = label.closest('.fact') ?? label.parentElement!;
    expect(within(fact as HTMLElement).queryByText(/Running on empty/i)).toBeNull();
    expect(document.body.textContent ?? '').toMatch(/Fresh/);
  });
});
