/**
 * Promoter mode, as a player walks it.
 *
 * `playerRole` has been in the data layer since the first commit, written twice — both times to
 * `'fighter'` — and read nowhere. These exist to prove it finally decides something, end to end:
 * choosing a promotion has to change what the app is, not just what a field says.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

/** Take over the first promotion on offer, which is the shortest route into the mode. */
async function becomePromoter(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/start');
  renderApp();
  const heading = await screen.findByRole('heading', { name: /Or run a promotion/i });
  const card = heading.closest('.card') as HTMLElement;
  const promotions = within(card).getAllByRole('button');
  await user.click(promotions[0]!);
}

describe('choosing to run a promotion', () => {
  it('offers promotions a player could plausibly start at', async () => {
    goTo('#/start');
    renderApp();
    expect(await screen.findByRole('heading', { name: /Or run a promotion/i })).toBeTruthy();
    // Named as a choice about which problem you want, not as a difficulty.
    expect(screen.getByText(/Make money or make the sport/i)).toBeTruthy();
  });

  it('lands you on your own hub rather than a fighter’s', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByText(/Who would come to your next card/i)).toBeTruthy();
  });

  it('does not bounce a promoter to the fighter start screen', async () => {
    /*
     * A promoter has no fighter, so the fighter hub's "you need to pick somebody" redirect
     * would have bounced them to the start screen forever — the exact failure that made
     * `playerRole` unreadable in practice.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/hub');
    expect(await screen.findByText(/Who would come to your next card/i)).toBeTruthy();
  });

  it('changes the tab bar to the promoter’s places', async () => {
    // The shell is shared and only the tab array differs — forking it would mean fixing every
    // future accessibility bug twice.
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('link', { name: /Promotion/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Career$/i })).toBeNull();
  });
});

describe('building a card', () => {
  it('opens with a full card rather than a blank form', async () => {
    /*
     * The rule that makes the builder work on a phone. A player's job is to disagree with the
     * parts of a card they care about, not to assemble nine fights from nothing.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    // Matched as a heading: "Main event" also appears as a position label on the bout rows.
    expect(await screen.findByRole('heading', { name: /^Main event$/i })).toBeTruthy();
    expect(await screen.findByText(/9 of 9 slots filled/i)).toBeTruthy();
  });

  it('says what each section is for', async () => {
    // Four sections with different jobs is what stops this being one decision repeated nine
    // times, and the player has to be told what the jobs are.
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    expect((await screen.findAllByText(/Sells the night/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/If the main event falls apart/i)).toBeTruthy();
  });

  it('collapses the prelims, because four of nine rows is where a phone loses', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    // Summarised rather than hidden: the player always knows they exist and how many are on.
    expect(await screen.findByRole('button', { name: /4 of 4 booked — open/i })).toBeTruthy();
  });

  it('tells the player what the card is worth before they commit', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    expect(await screen.findByText(/Expected attendance/i)).toBeTruthy();
    expect(screen.getByText(/Purses committed/i)).toBeTruthy();
  });

  it('describes a fight in words rather than in draw weights', async () => {
    // A draw weight of 147 means nothing to anybody. What a promoter needs is whether it sells
    // the building and whether it is a fight.
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    const described = await screen.findAllByText(/Sells it|Big draw|Modest|Small/);
    expect(described.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Coin flip|Competitive|One-sided|A gimme/).length).toBeGreaterThan(0);
  });

  it('lets a slot be swapped for another fight', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    // The main event slot is the first bout row on the screen.
    const rows = document.querySelectorAll('.bout');
    await user.click(rows[0] as HTMLElement);

    // Now showing options, with a way back out.
    expect(await screen.findByRole('button', { name: /Keep what I had/i })).toBeTruthy();
    expect(document.querySelectorAll('.bout--option').length).toBeGreaterThan(0);
  });
});

describe('sending the card out', () => {
  it('does not simply run it — both corners have to agree', async () => {
    /*
     * The change that turns the builder from a form into matchmaking. Offering a bout used to
     * be a command and every slot said yes, which is exactly what doc 13's "what must never
     * happen" section forbids.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));

    expect(await screen.findByRole('button', { name: /Send it out/i })).toBeTruthy();
    expect(screen.getByText(/Both corners have to agree/i)).toBeTruthy();
  });

  /**
   * Walk a card all the way to a result, handling whatever the card throws up on the way.
   *
   * Deliberately tolerant of the middle: refusals and pull-outs are *supposed* to happen and
   * are seeded per bout, so a test that demanded a clean run would be asserting that the
   * feature does not work.
   */
  async function runToCompletion(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /Send it out/i }));

    for (let attempt = 0; attempt < 12; attempt++) {
      // Somebody has pulled out: take the first replacement offered, or scratch it.
      const replacement = document.querySelector('.bout--option') as HTMLElement | null;
      if (screen.queryByText(/You have lost a fighter/i)) {
        if (replacement) await user.click(replacement);
        else
          await user.click(
            screen.getByRole('button', { name: /Scratch the fight and run a shorter card/i }),
          );
        continue;
      }

      const run = screen.queryByRole('button', { name: /^Run the card$/i });
      if (run) {
        await user.click(run);
        continue;
      }

      // Somebody refused: the slots emptied, so refill and send it again.
      const send = screen.queryByRole('button', { name: /Send it out/i });
      if (send) {
        await user.click(send);
        continue;
      }

      if (screen.queryByText(/The night (made|lost) money/i)) return;
    }
  }

  it('reports what the night did once it actually happens', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));
    await runToCompletion(user);

    await waitFor(() => expect(screen.getByText(/The night (made|lost) money/i)).toBeTruthy(), {
      timeout: 8000,
    });
    expect(screen.getByText(/What happened/i)).toBeTruthy();
  });

  it('shows every fight on the card, with where it sat', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await user.click(await screen.findByRole('button', { name: /Build a card/i }));
    await runToCompletion(user);

    await waitFor(() => expect(screen.getByText(/What happened/i)).toBeTruthy(), {
      timeout: 8000,
    });
    // Card position finally means something: before the 2026 roster there were never enough
    // fighters to fill more than two or three positions.
    expect(screen.getAllByText(/^Prelim$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Main event$/).length).toBeGreaterThan(0);
  });
});
