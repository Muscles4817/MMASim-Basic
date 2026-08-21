/**
 * The fight that does not happen, from the player's side of the screen.
 *
 * Roughly one booked bout in eight collapses before it is fought — that is deliberate, it is
 * swept against the sport's own withdrawal rate in `withdrawals.ts`, and the engine tier already
 * proves the outcome is the right shape and that the inbox is written.
 *
 * What no test covered was what the player experiences. `CampScreen` answered a withdrawal by
 * navigating to the career hub and discarding `outcome.notes`, so pressing "Yes — walk out" put
 * the player back on the home screen with no fight, no message and their booking gone. Reported,
 * correctly, as "sometimes when I click to start the fight it just takes me back to the main
 * page". The camp screen has to say what happened.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import type { Fighter } from '@mmasim/engine';
import type { GameDb } from '@mmasim/data';
import { App } from '../../packages/app/src/App';
import { GameProvider, useGame } from '../../packages/app/src/state/GameProvider';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';
import { getBooking } from '../../packages/app/src/game/career';

/** The live database, so a test can reach into the world the way the world itself does. */
let db: GameDb | undefined;

function Capture() {
  db = useGame().db;
  return null;
}

function renderApp() {
  return render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <GameProvider>
            <RouterProvider>
              <Capture />
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
  db = undefined;
});

afterEach(cleanup);

/** Take over a seeded fighter and accept the first offer, which lands us in fight camp. */
async function bookAFight(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/start/fighter');
  renderApp();
  // Three steps now rather than one tap, which is the whole change: browse, inspect,
  // then commit explicitly. Clicking a row used to start the save.
  const rows = await screen.findAllByRole('button', { name: /./ });
  const row = rows.find((r) => r.classList.contains('datatable__rowbutton'))!;
  await user.click(row);
  await user.click(await screen.findByRole('button', { name: /^Take control of/i }));
  await user.click(await screen.findByRole('button', { name: /^Yes — take control of/i }));

  goTo('#/hub');
  const offers = await screen.findAllByRole('button', { name: /Even fight|Step up|Favourable/i });
  await user.click(offers[0]!);
  await user.click(await screen.findByRole('button', { name: /Accept fight/i }));
}

/**
 * Put the opponent on the shelf for the best part of a year.
 *
 * A withdrawal that will not have healed by fight day is the one deterministic route into this
 * branch — everything else goes through `pullOutRisk`, which is a seeded roll and would make the
 * test a coin flip. `weeksUntilFit` is read against the *bout* day, so the injury has to outlast
 * the camp as well as start before it.
 */
function shelveTheOpponent() {
  const booking = getBooking();
  expect(booking, 'no fight was booked, so there is nothing to withdraw from').toBeTruthy();
  const opponent = db!.fighters.getById(booking!.opponentId) as Fighter;
  db!.fighters.upsert({
    ...opponent,
    injuries: [
      {
        id: 'inj_shelved' as never,
        type: 'knee',
        day: booking!.campStartDay,
        healedDay: booking!.bout.day + 300,
        severity: 0.9,
        source: 'camp',
      },
    ],
  } as Fighter & { id: string });
}

/** Walk out — or try to. */
async function walkOut(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/camp');
  await user.click(await screen.findByRole('button', { name: /^Fight /i }));
  await user.click(await screen.findByRole('button', { name: /Yes — walk out/i }));
}

describe('a fight that falls apart', () => {
  it('says the fight is off instead of returning the player to the career hub', async () => {
    const user = userEvent.setup();
    await bookAFight(user);
    shelveTheOpponent();
    await walkOut(user);

    expect(await screen.findByText(/The fight is off/i)).toBeTruthy();
    // The specific reason, not just that something went wrong. It is the difference between
    // "your opponent got hurt" and "the app lost your fight".
    expect(document.body.textContent ?? '').toMatch(/out with an injury/i);
    // And emphatically not the home screen the bug report described.
    expect(window.location.hash).not.toMatch(/#\/hub/);
  });

  it('shows what the camp still bought, which was computed and thrown away', async () => {
    const user = userEvent.setup();
    await bookAFight(user);
    shelveTheOpponent();
    await walkOut(user);

    await screen.findByText(/The fight is off/i);
    expect(document.body.textContent ?? '').toMatch(/weeks of work you keep/i);
  });

  it('leaves the player somewhere to go, under their own steam', async () => {
    const user = userEvent.setup();
    await bookAFight(user);
    shelveTheOpponent();
    await walkOut(user);

    await screen.findByText(/The fight is off/i);
    await user.click(screen.getByRole('button', { name: /Back to career/i }));
    expect(window.location.hash).toMatch(/#\/hub/);
  });
});
