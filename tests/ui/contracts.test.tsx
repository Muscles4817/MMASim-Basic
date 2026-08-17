/**
 * Contracts, managers and free agency, driven through the real UI.
 *
 * The point of these is that the contract layer is *visible on the fight-to-fight loop*
 * rather than behind a tab nobody opens. A contract counter that says "one fight left" is the
 * cheapest source of anticipation in the design, and it only works if it is where the player
 * already is.
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
          <GameProvider>
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
});

afterEach(cleanup);

async function createFighter(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/create');
  renderApp();
  await user.type(await screen.findByLabelText(/First name/i), 'Ade');
  await user.type(screen.getByLabelText(/Last name/i), 'Newman');
  await user.click(screen.getByRole('button', { name: /Turn pro/i }));
  await screen.findByText(/Newman/);
}

describe('a created fighter starts somewhere', () => {
  it('turns pro under a real contract rather than in limbo', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    // The counter. It makes free agency approach rather than arrive.
    expect(await screen.findByText(/fights left on the deal|One fight left/i)).toBeTruthy();
  });

  it('starts with nobody negotiating for them, and says what that costs', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    expect(
      await screen.findByText(/negotiating against people who do this for a living/i),
    ).toBeTruthy();
  });

  it('shows the bank, because it decides what camp you can run', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');
    // Two of them now, and deliberately: the hub's stat card, plus the permanent readout in the
    // shell header that put the balance next to every point of spending in the game.
    expect((await screen.findAllByText(/^Bank$/i)).length).toBeGreaterThan(0);
    expect(await screen.findByTestId('shell-funds')).toBeTruthy();
  });
});

describe('the contract is legible without opening anything', () => {
  it('says how the deal compares to what you are worth, in words not a ratio', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    // Never "0.68". A ratio needs a paragraph; a sentence does not.
    const sentence = await screen.findByText(
      /reflects what you are worth|outgrown this deal|paid like the fighter you were|insult/i,
    );
    expect(sentence).toBeTruthy();
    expect(screen.queryByText(/0\.\d\d/)).toBeNull();
  });
});

describe('free agency', () => {
  it('is reachable from the hub in one tap', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/hub');

    await user.click(await screen.findByRole('button', { name: /Contract/i }));
    expect(await screen.findByText(/Who negotiates for you/i)).toBeTruthy();
  });

  it('offers managers as shapes rather than as a ranked list', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    // Each is described by what kind of career they buy, never by a rating. A debutant with
    // no name is realistically offered only the bottom of that list — which is the point.
    const blurbs = await screen.findAllByText(
      /stable|speed dial|thirty years|contract properly|more money out of|cannot get a matchmaker/i,
    );
    expect(blurbs.length).toBeGreaterThan(0);
    // And no rating is ever shown for any of them.
    expect(screen.queryByText(/negotiation \d+|standing \d+/i)).toBeNull();
  });

  it('tells a contracted fighter they cannot sign anything yet', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    expect(await screen.findByText(/You are under contract/i)).toBeTruthy();
  });

  it('explains why nobody is calling rather than showing an empty list', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    // A debutant with no manager hears from almost nobody, and that is the monopsony
    // speaking rather than a bug. The screen has to say so.
    const empty = screen.queryByText(/one buyer that matters/i);
    const some = screen.queryByText(/on the table/i);
    expect(empty ?? some).toBeTruthy();
  });
});

/**
 * Hire the first manager on the offers screen.
 *
 * Two taps, not one: hiring takes a permanent cut of every purse from here on, which made it
 * the least reversible thing on the screen and the least guarded. The confirm names the rate
 * rather than saying "are you sure", so the second tap carries the information the first one
 * was missing.
 */
async function hireFirstManager(user: ReturnType<typeof userEvent.setup>) {
  const buttons = await screen.findAllByRole('button', { name: /^Sign with/i });
  await user.click(buttons[0]!);
  await user.click(await screen.findByRole('button', { name: /^Yes — \d+% of every purse/i }));
}

describe('hiring a manager', () => {
  it('changes who is negotiating, and says what they cost', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    // Managers appear before promotions on this screen, so the first is a manager.
    await hireFirstManager(user);

    goTo('#/hub');
    expect(await screen.findByText(/manages you, on \d+% of the purse/i)).toBeTruthy();
  });

  it('starts the advice record untested rather than at zero', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    await hireFirstManager(user);

    goTo('#/hub');
    expect(await screen.findByText(/has not been tested yet/i)).toBeTruthy();
  });
});

describe('nothing consequential happens on one tap', () => {
  /*
   * The rule this suite enforces: an action that cannot be undone gets two steps, and the
   * second step states what it costs rather than asking "are you sure". Accepting a fight,
   * committing a camp and resetting the save all did this already; the contract actions —
   * which are the most binding things in the game — did not.
   */

  it('does not hire a manager on the first tap', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    const buttons = await screen.findAllByRole('button', { name: /^Sign with/i });
    await user.click(buttons[0]!);

    // Still nobody managing them.
    goTo('#/hub');
    expect(screen.queryByText(/manages you, on \d+% of the purse/i)).toBeNull();
  });

  it('names the manager’s cut in the confirm, not just “are you sure”', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    const buttons = await screen.findAllByRole('button', { name: /^Sign with/i });
    await user.click(buttons[0]!);
    expect(await screen.findByRole('button', { name: /Yes — \d+% of every purse/i })).toBeTruthy();
  });

  it('lets you back out of hiring', async () => {
    const user = userEvent.setup();
    await createFighter(user);
    goTo('#/offers');
    renderApp();

    const buttons = await screen.findAllByRole('button', { name: /^Sign with/i });
    await user.click(buttons[0]!);
    await user.click(await screen.findByRole('button', { name: /^Cancel$/i }));

    goTo('#/hub');
    expect(screen.queryByText(/manages you, on \d+% of the purse/i)).toBeNull();
  });
});
