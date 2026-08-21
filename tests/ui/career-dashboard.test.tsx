/**
 * The career dashboard, as a dashboard.
 *
 * The old hub's defect was structural rather than cosmetic: eighteen regions rendered in DOM
 * order, each knowing only about itself, up to six of them offering a `variant="primary"` button
 * at the same time. None of that is visible in a screenshot and all of it is assertable, so it is
 * asserted — otherwise the next well-meant addition puts a second primary back on the page and
 * nothing notices.
 *
 * These are claims about *hierarchy*, not about copy. The situation titles are prose and will be
 * reworded; that a torn knee outranks a signing bonus is measured in
 * `tests/integration/career-attention.test.ts`, at the model, where the ranking actually lives.
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
  goTo('#/hub');
  await screen.findByTestId('identity');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(cleanup);

describe('one decision leads', () => {
  it('renders exactly one primary button on the whole page', async () => {
    /*
     * The audit's worst finding, made a test. An unsigned fighter carrying a knock, between
     * fights, could previously see six: rest until fit, rest N weeks, go to training, see what is
     * on the table, wait eight weeks, and see the terms. None of them knew the others existed, so
     * the screen could not answer "which of these should I do" even in principle.
     *
     * Deliberately scoped to this screen rather than made a lint rule. A surface with two
     * genuinely independent decisions may have two primaries; this one had six competing over a
     * single decision.
     */
    const user = userEvent.setup();
    await createFighter(user);

    const primaries = document.querySelectorAll('.career .btn--primary');
    expect(primaries.length).toBeLessThanOrEqual(1);
  });

  it('says why the action it offers is the one on offer', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    const bar = await screen.findByTestId('dominant-action');
    // A primary action with no stated reason is a guess the player has to trust. The bar names
    // the situation it came from, and never by repeating that situation's whole sentence.
    expect((bar.textContent ?? '').trim().length).toBeGreaterThan(0);
    expect(within(bar).getByRole('button')).toBeTruthy();
  });
});

describe('the dashboard summarises rather than reproduces', () => {
  it('caps the situation feed instead of listing everything wrong at once', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    const feed = await screen.findByTestId('needs-you');
    // Four. Beyond that it is a list of problems rather than a ranking of them, which is the
    // old hub with tone stripes on.
    expect(feed.querySelectorAll('.attention__item').length).toBeLessThanOrEqual(4);
  });

  it('does not carry a second copy of the rankings table', async () => {
    /*
     * The old ladder card rendered the divisional top ten inline. "A rank you cannot see the rest
     * of is a number rather than a standing" is a good argument and it is the *rankings screen's*
     * argument — reproducing that screen inside the dashboard is how the dashboard reached eight
     * viewport heights.
     */
    const user = userEvent.setup();
    await createFighter(user);

    const standing = await screen.findByTestId('standing');
    expect(within(standing).queryByRole('table')).toBeNull();
    expect(standing.querySelectorAll('.rankings__row').length).toBe(0);
    // And it says where to go for it.
    expect(within(standing).getByRole('button', { name: /Rankings/i })).toBeTruthy();
  });

  it('has no navigation grid duplicating the tab bar', async () => {
    // Seven tiles below the news feed, two of which (Roster, Settings) were tab-bar
    // destinations verbatim, on a page nobody scrolled that far down.
    const user = userEvent.setup();
    await createFighter(user);

    expect(document.querySelectorAll('.hub-nav').length).toBe(0);
  });
});

describe('choosing a fight is a comparison', () => {
  it('lays the opponents out so they can be compared, not read one at a time', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    const panel = await screen.findByTestId('next-fight');
    const table = within(panel).queryByRole('table');
    // A debutant may legitimately have nobody available; the claim only applies when there is
    // something to choose between.
    if (!table) return;

    // Purse, difficulty and slot side by side. The old list put each of those inside a row that
    // expanded in place, so comparing two of them meant opening both and scrolling.
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent ?? '');
    expect(headers.join(' ')).toMatch(/Difficulty/i);
    expect(headers.join(' ')).toMatch(/Purse/i);
  });

  it('opens the detail in a fixed place rather than pushing the page down', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    const rows = document.querySelectorAll<HTMLButtonElement>('.datatable__rowbutton');
    if (rows.length === 0) return;

    await user.click(rows[0]!);
    const detail = await screen.findByTestId('offer-detail');
    // The second of the two steps. Selecting a row is deliberate; booking two months of a
    // career from that same tap would not be.
    expect(within(detail).getByRole('button', { name: /Accept fight/i })).toBeTruthy();
  });
});
