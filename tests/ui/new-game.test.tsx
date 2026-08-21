/**
 * Starting a save.
 *
 * The rule under test is doc 32 § 11.7's, and it is one line: **selection is never a side effect
 * of navigation.** Clicking a candidate opens a preview and changes nothing; a career begins only
 * when a named control is pressed.
 *
 * The old flow broke it in the worst possible place. `takeOver` called `updateWorld` and
 * navigated with no confirmation at all, and the fighter path's confirmation only fired when
 * `playerFighterId` was already set — which on a fresh save, the flow the screen exists for, is
 * never. So one tap on any of hundreds of rows in a list the screen invited you to browse started
 * the save.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { getWorld } from '@mmasim/data';
import { App } from '../../packages/app/src/App';
import { GameProvider, useGame } from '../../packages/app/src/state/GameProvider';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';
import type { GameDb } from '@mmasim/data';

let db: GameDb | undefined;

/**
 * Reaches into the provider for the live database.
 *
 * The assertions here are about *world state* rather than about what rendered — "clicking a row
 * did not start a save" cannot be checked by looking at the screen, because the screen looks
 * exactly the same either way. That is precisely why the old bug survived.
 */
function Probe() {
  db = useGame().db;
  return null;
}

function renderApp() {
  return render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <GameProvider era="2026">
            <RouterProvider>
              <Probe />
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

/** The row button in the table composition, which is the one a pointer would hit on a desktop. */
const firstRow = () => {
  const rows = document.querySelectorAll<HTMLButtonElement>('.datatable__rowbutton');
  return rows[0]!;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  db = undefined;
});

afterEach(cleanup);

describe('choosing who to be is a step of its own', () => {
  it('asks for a mode before it asks for anybody in particular', async () => {
    renderApp();
    const picker = await screen.findByTestId('new-career');
    expect(within(picker).getByTestId('mode-fighter')).toBeTruthy();
    expect(within(picker).getByTestId('mode-promoter')).toBeTruthy();
    // No candidates on this screen at all: mode first, identity second.
    expect(document.querySelectorAll('.datatable__rowbutton').length).toBe(0);
  });

  it('keeps Coach visible so the flow does not need tearing apart when it lands', async () => {
    renderApp();
    const coach = await screen.findByTestId('mode-coach');
    expect(within(coach).getByRole('button').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('browsing a fighter is not choosing one', () => {
  it('changes nothing when a row is clicked', async () => {
    const user = userEvent.setup();
    goTo('#/start/fighter');
    renderApp();

    await screen.findByTestId('choose-fighter');
    expect(getWorld(db!).playerFighterId).toBeUndefined();

    await user.click(firstRow());

    // A preview appeared and the save did not start. That is the entire fix.
    expect(await screen.findByTestId('take-control')).toBeTruthy();
    expect(getWorld(db!).playerFighterId).toBeUndefined();
    expect(getWorld(db!).playerRole).toBeUndefined();
  });

  it('says out loud that nothing has happened yet', async () => {
    const user = userEvent.setup();
    goTo('#/start/fighter');
    renderApp();
    await screen.findByTestId('choose-fighter');
    await user.click(firstRow());

    const panel = await screen.findByTestId('take-control');
    expect(within(panel).getByText(/browsing/i)).toBeTruthy();
  });

  it('gives the whole profile to inspect, not a row of chips', async () => {
    const user = userEvent.setup();
    goTo('#/start/fighter');
    renderApp();
    await screen.findByTestId('choose-fighter');
    await user.click(firstRow());

    // The real `FighterView`, at `viewer="none"` — the same page the career uses, with no
    // career behind it. That reuse is why `useGame` came out of it.
    const view = await screen.findByTestId('fighter-view');
    expect(within(view).getByText(/Wins with/i)).toBeTruthy();
    expect(within(view).getByRole('tab', { name: /^Career$/i })).toBeTruthy();
    // And none of the promoter framing, because nobody is a promoter yet.
    expect(within(view).queryByText(/Put them on a card/i)).toBeNull();
  });

  it('starts the career only on the second, named press', async () => {
    const user = userEvent.setup();
    goTo('#/start/fighter');
    renderApp();
    await screen.findByTestId('choose-fighter');
    await user.click(firstRow());

    await user.click(await screen.findByRole('button', { name: /^Take control of/i }));
    // Still nothing: the first press asks, the second commits.
    expect(getWorld(db!).playerFighterId).toBeUndefined();

    await user.click(await screen.findByRole('button', { name: /^Yes — take control of/i }));
    expect(getWorld(db!).playerFighterId).toBeDefined();
    expect(getWorld(db!).playerRole).toBe('fighter');
  });
});

describe('browsing a promotion is not choosing one', () => {
  it('changes nothing when a row is clicked — the path that had no guard at all', async () => {
    const user = userEvent.setup();
    goTo('#/start/promoter');
    renderApp();

    await screen.findByTestId('choose-promotion');
    await user.click(firstRow());

    expect(await screen.findByTestId('take-control')).toBeTruthy();
    expect(getWorld(db!).playerPromotionId).toBeUndefined();
    expect(getWorld(db!).playerRole).toBeUndefined();
  });

  it('says what you would be inheriting rather than what you would be spending', async () => {
    /*
     * The old row was `national 11 · USA · £3.1m to spend · ` and nothing else — the last field
     * is `notes`, which generated promotions do not have. `attentionFor` has always accepted any
     * promotion and was only ever asked about the player's own, so "what problem am I taking on"
     * was computable from the day it shipped and never on screen.
     */
    const user = userEvent.setup();
    goTo('#/start/promoter');
    renderApp();
    await screen.findByTestId('choose-promotion');
    await user.click(firstRow());

    await screen.findByTestId('take-control');
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/The business/i);
    expect(text).toMatch(/The belts/i);
    expect(text).toMatch(/would inherit|Nothing outstanding/i);
  });

  it('starts the promotion only on the second, named press', async () => {
    const user = userEvent.setup();
    goTo('#/start/promoter');
    renderApp();
    await screen.findByTestId('choose-promotion');
    await user.click(firstRow());

    await user.click(await screen.findByRole('button', { name: /^Run /i }));
    expect(getWorld(db!).playerPromotionId).toBeUndefined();

    await user.click(await screen.findByRole('button', { name: /^Yes — run /i }));
    expect(getWorld(db!).playerPromotionId).toBeDefined();
    expect(getWorld(db!).playerRole).toBe('promoter');
  });
});
