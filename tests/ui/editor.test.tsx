/**
 * The editor, driven by real clicks.
 *
 * The generic editor is schema-driven, which is good for consistency and bad for confidence:
 * a mistyped field key produces a control that renders perfectly and silently edits nothing.
 * Only actually saving through the UI and reading the value back out of the database catches
 * that, so that is what these do.
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
import { EDITOR_TYPES } from '../../packages/app/src/game/editorSchema';

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
  goTo('#/editor');
});

afterEach(cleanup);

describe('the editor covers the world, not just the fighters', () => {
  it('offers every editable type from the index', async () => {
    renderApp();
    for (const type of EDITOR_TYPES) {
      expect(
        await screen.findByText(type.label),
        `the editor index does not offer ${type.label}`,
      ).toBeTruthy();
    }
  });

  it.each(EDITOR_TYPES.map((t) => t.kind))('lists %s without crashing', async (kind) => {
    goTo(`#/edit/${kind}`);
    renderApp();

    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).toBeNull();
      expect(screen.queryByText(/Nothing to edit here/i)).toBeNull();
    });

    // An empty collection would be a seeding bug, not an empty state.
    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects a hand-typed kind it has no schema for', async () => {
    goTo('#/edit/dragons');
    renderApp();
    // Falls back to the editor index rather than rendering a broken form.
    expect(await screen.findByText(/Everything else in the world/i)).toBeTruthy();
  });
});

describe('editing a referee', () => {
  it('saves a change and reads it back', async () => {
    const user = userEvent.setup();
    goTo('#/edit/referees');
    renderApp();

    const first = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(first[0]!);

    // The exact-value box beside the slider is the one a person actually types into.
    const exact = await screen.findByLabelText(/Stoppage trigger, exact value/i);
    await user.clear(exact);
    await user.type(exact, '77');

    const save = await screen.findByRole('button', { name: /Save changes/i });
    expect(save.hasAttribute('disabled')).toBe(false);
    await user.click(save);

    /*
     * Matched as a button, because the alert now says "Saved" too.
     *
     * `original` was memoised on deps that never change, so it stayed pinned to the pre-save
     * snapshot: the screen rendered a green "Saved" alert beside a button still reading "Save
     * changes", and Revert stayed live and restored pre-save values over a world that already
     * held the new ones. Now that both agree, a bare text match finds two.
     */
    expect(await screen.findByRole('button', { name: /^Saved$/ })).toBeTruthy();

    // And the value survives a full remount from storage, which is the actual claim.
    cleanup();
    renderApp();
    const reloaded = await screen.findByLabelText(/Stoppage trigger, exact value/i);
    expect((reloaded as HTMLInputElement).value).toBe('77');
  });

  it('marks Save unavailable until something actually changes, without removing it', async () => {
    const user = userEvent.setup();
    goTo('#/edit/referees');
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(rows[0]!);

    // aria-disabled, not disabled: a real `disabled` would drop the button out of the tab
    // order the instant it was pressed, throwing focus to the document mid-save.
    const save = await screen.findByRole('button', { name: /^Saved$/ });
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.hasAttribute('disabled')).toBe(false);

    // And pressing it while unavailable must do nothing at all.
    await user.click(save);
    expect(screen.queryByText(/The change is live in the world/i)).toBeNull();
  });
});

describe('editing a commentator', () => {
  it('round-trips the style bias through its −100..100 form representation', async () => {
    const user = userEvent.setup();
    goTo('#/edit/commentators');
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(rows[0]!);

    // Stored as a −1..1 float, edited as an integer. A broken transform here would show up
    // as the value snapping to 0 or 100 on reload.
    const exact = await screen.findByLabelText(/Style bias, exact value/i);
    await user.clear(exact);
    await user.type(exact, '-45');
    await user.click(await screen.findByRole('button', { name: /Save changes/i }));

    cleanup();
    renderApp();
    const reloaded = await screen.findByLabelText(/Style bias, exact value/i);
    expect((reloaded as HTMLInputElement).value).toBe('-45');
  });
});

describe('warnings, not walls', () => {
  it('lets an incoherent entity be saved anyway', async () => {
    const user = userEvent.setup();
    goTo('#/edit/gyms');
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(rows[0]!);

    // Far more famous than it is good — the schema warns about exactly this.
    const prestige = await screen.findByLabelText(/Prestige, exact value/i);
    await user.clear(prestige);
    await user.type(prestige, '100');
    const quality = await screen.findByLabelText(/Quality, exact value/i);
    await user.clear(quality);
    await user.type(quality, '10');

    const alert = await screen.findByText(/does not quite add up/i);
    expect(alert).toBeTruthy();

    // The warning must not disable saving. Deliberately incoherent gyms are allowed.
    const save = await screen.findByRole('button', { name: /Save changes/i });
    expect(save.hasAttribute('disabled')).toBe(false);
    await user.click(save);
    expect(await screen.findByRole('button', { name: /^Saved$/ })).toBeTruthy();
  });

  it('stops offering to revert once the change is saved', async () => {
    /*
     * The other half of the stale-`original` bug. `original` was memoised on `[repo, id]`,
     * neither of which ever changes — the repository keeps its identity for the life of the
     * session — so it stayed pinned to the pre-save snapshot and `dirty` never went false.
     *
     * Revert therefore stayed live after saving and would restore the *pre-save* values into
     * a form whose world already held the new ones, with nothing on screen to tell the player
     * which was real.
     */
    const user = userEvent.setup();
    goTo('#/edit/gyms');
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(rows[0]!);

    const prestige = await screen.findByLabelText(/Prestige, exact value/i);
    await user.clear(prestige);
    await user.type(prestige, '77');

    const revert = await screen.findByRole('button', { name: /^Revert$/ });
    expect(revert.getAttribute('aria-disabled'), 'revert should be live while dirty').toBe(
      'false',
    );

    await user.click(await screen.findByRole('button', { name: /Save changes/i }));

    // aria-disabled rather than disabled, so it keeps its place in the tab order and can
    // still explain itself — the same rule the Save button follows.
    expect(
      (await screen.findByRole('button', { name: /^Revert$/ })).getAttribute('aria-disabled'),
      'revert should go inert once the draft matches the world',
    ).toBe('true');
  });
});

describe('every numeric control is reachable and labelled', () => {
  it.each(EDITOR_TYPES.map((t) => t.kind))('labels every field for %s', async (kind) => {
    const user = userEvent.setup();
    goTo(`#/edit/${kind}`);
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(rows[0]!);

    const meta = EDITOR_TYPES.find((t) => t.kind === kind)!;
    for (const field of meta.fields) {
      // Labels contain regex metacharacters — "Budget ($k)" is three of them.
      const escaped = field.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const control = screen.queryByLabelText(new RegExp(`^${escaped}$`, 'i'));
      expect(control, `${kind}.${field.key} has no labelled control`).toBeTruthy();
    }
  });
});

describe('no dead ends', () => {
  it('always offers a way back out of an entity', async () => {
    const user = userEvent.setup();
    goTo('#/edit/judges');
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    await user.click(rows[0]!);

    const back = await screen.findAllByRole('button', { name: /^Back$/i });
    expect(back.length).toBeGreaterThan(0);
    await user.click(back[0]!);
    await waitFor(() => expect(screen.queryByText(/Something went wrong/i)).toBeNull());
  });
});

/** Guards against a list row that renders as a blank strip. */
describe('list rows say something', () => {
  it.each(EDITOR_TYPES.map((t) => t.kind))('gives %s rows a primary label', async (kind) => {
    goTo(`#/edit/${kind}`);
    renderApp();

    const rows = await screen.findAllByRole('button', { name: /^Edit / });
    for (const row of rows.slice(0, 5)) {
      const primary = within(row).getAllByText(/\S/)[0];
      expect(primary?.textContent?.trim(), `a ${kind} row rendered with no text`).toBeTruthy();
    }
  });
});
