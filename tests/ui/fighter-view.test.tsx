/**
 * One fighter view, four framings.
 *
 * The facts about a fighter do not change with who is asking; the words and the actions do. The
 * old profile had one framing — a promoter scouting a stranger — and applied it to the player's
 * own character, so a fighter mode career described its protagonist as `WHERE THEY STAND` and
 * told them `WHAT THEY WANT`.
 *
 * These tests assert the boundary rather than the wording: that the self view is written in the
 * first person, that it discloses things only you would know, that it does not ask a buyer's
 * question about you, and that the shared half is genuinely shared.
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

describe('viewing yourself', () => {
  it('is written in the first person, not as a scouting report', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/me');

    await screen.findByTestId('fighter-view');
    const text = document.body.textContent ?? '';

    // The exact headings the audit quoted.
    expect(text).not.toMatch(/Where they stand/i);
    expect(text).not.toMatch(/How they decide/i);
    expect(text).toMatch(/Where you stand|How you decide/i);
  });

  it('leads with tabs about a career rather than about an asset', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/me');

    await screen.findByTestId('fighter-view');
    expect(screen.getByRole('tab', { name: /My deal/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /^Scouting$/i })).toBeNull();
  });

  it('does not ask whether you are available to yourself', async () => {
    // Availability is a booking question. A fighter reading their own page is not deciding
    // whether to book themselves.
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/me');

    const view = await screen.findByTestId('fighter-view');
    expect(view.textContent ?? '').not.toMatch(/Availability/i);
  });

  it('does not ask whether you are value for money', async () => {
    /*
     * The sharpest example of the wrong register. "Are they worth what they return" is a
     * buyer's question; asked about the player it is the game appraising its own protagonist.
     */
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/me');
    await screen.findByTestId('fighter-view');

    await user.click(screen.getByRole('tab', { name: /My deal/i }));
    expect(screen.queryByText(/Value for money/i)).toBeNull();
  });

  it('shows you your own physical ceilings, which nobody else can see', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/me');
    await screen.findByTestId('fighter-view');

    await user.click(screen.getByRole('tab', { name: /My skills/i }));
    await user.click(await screen.findByRole('button', { name: /What do these mean/i }));

    // `RatingRow` puts the scouted ceiling into the meter's accessible name. A promoter who
    // could read this would be scouting with certainty, which the model refuses.
    const meters = await screen.findAllByRole('meter');
    expect(meters.some((m) => /scouted ceiling/i.test(m.getAttribute('aria-label') ?? ''))).toBe(
      true,
    );
  });
});

describe('viewing somebody else', () => {
  it('keeps the third person, and the facts', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/fighter/f26_aspinall');

    await screen.findByTestId('fighter-view');
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/How they decide/i);
    // The shared half: the read, the record and the ratings are the same component.
    expect(text).toMatch(/Wins with/i);
  });

  it('does not show a stranger their own ceilings', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/fighter/f26_aspinall');
    await screen.findByTestId('fighter-view');

    await user.click(screen.getByRole('tab', { name: /^Skills$/i }));
    await user.click(await screen.findByRole('button', { name: /What do these mean/i }));

    const meters = await screen.findAllByRole('meter');
    expect(meters.some((m) => /scouted ceiling/i.test(m.getAttribute('aria-label') ?? ''))).toBe(
      false,
    );
  });

  it('sends your own id to your own page rather than rendering a second copy of it', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    // A ranking row, a fight record and a deep link can all name the player. All three should
    // land on the first-person version rather than on a scouting report about the player.
    goTo('#/hub');
    await screen.findByTestId('identity');
    await user.click(await screen.findByRole('button', { name: /My fighter/i }));

    await screen.findByTestId('fighter-view');
    expect(window.location.hash).toBe('#/me');
  });
});
