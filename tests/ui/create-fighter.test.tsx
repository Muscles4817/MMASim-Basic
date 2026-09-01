import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { App } from '../../packages/app/src/App';
import { GameProvider } from '../../packages/app/src/state/GameProvider';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';

/**
 * The creation screen: two origin questions, a body, and a live Weight Fit panel.
 *
 * **It asked three questions until doc 31 § 12 step 10** — the first being what kind of athlete you
 * were born as — and most of this file used to be about the seam that created. Nested pickers are
 * where creation screens go wrong: layer 1 could silently invalidate a choice already made on layer
 * 3, and the player found out on submit. Deleting the layer deleted the seam, and the tests that
 * guarded it went with it.
 *
 * What is left is what the screen is now for: that the two questions and the body reach "Turn pro",
 * that the panel tells the player what the cut costs before they commit to it, and the one hard
 * rule of the mode — no ceiling is ever rendered.
 */

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

async function openCreator(user: ReturnType<typeof userEvent.setup>) {
  window.location.hash = '#/create';
  renderApp();
  await user.type(await screen.findByLabelText(/First name/i), 'Ade');
  await user.type(screen.getByLabelText(/Last name/i), 'Origin');
}

/** The radiogroup for one layer, so "Boxing" cannot be confused across layers. */
const layer = (name: RegExp | string) => screen.getByRole('radiogroup', { name });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('the origin picker asks two questions', () => {
  it('shows both layers, in order, each explained', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    expect(screen.getByRole('radiogroup', { name: /What you trained/i })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: /How far you got/i })).toBeTruthy();
    expect(screen.getByText(/1\. What you trained/i)).toBeTruthy();
    expect(screen.getByText(/2\. How far you got/i)).toBeTruthy();
  });

  it('no longer asks the player how gifted they would like to be', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    expect(screen.queryByRole('radiogroup', { name: /athlete you are/i })).toBeNull();
    for (const tier of ['Freak', 'Natural', 'Grinder']) {
      expect(screen.queryByRole('radio', { name: tier }), tier).toBeNull();
    }
    // And it says why, rather than the question simply vanishing between versions.
    expect(screen.getByText(/not something anybody gets to choose/i)).toBeTruthy();
  });

  it('offers exactly the six combat disciplines the fight engine can tell apart', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    const trained = within(layer(/What you trained/i)).getAllByRole('radio');
    const names = trained.map((r) => r.getAttribute('aria-label'));
    expect(names).toContain('Boxing');
    expect(names).toContain('Kickboxing / Muay Thai');
    expect(names).toContain('Karate / Taekwondo');
    expect(names).toContain('Wrestling');
    expect(names).toContain('Brazilian Jiu-Jitsu');
    expect(names).toContain('Judo / Sambo');
    // Six arts plus five non-combat sports, all eleven open to everybody since step 10 deleted the
    // talent tier that used to gate the athletic branch. Three athletic entries until step 9 split
    // `trackAndField` and `enduranceSport` — see § 22.1 for why that stopped being a widened menu.
    expect(trained).toHaveLength(11);
  });
});

/*
 * **The `layer 1 filters layer 3` describe is deleted with layer 1.**
 *
 * Its four tests were all about the cascade: that a lesser tier dropped the elite rungs off the
 * menu, that a selection which stopped being legal was moved rather than left to fail on submit,
 * that the athletic branch was hidden from the tier with no athletic story, and that picking
 * Olympic raised the debut age. The first three tested a filter that no longer exists — every rung
 * and every discipline is open to everybody now.
 *
 * The fourth tested the thing that turned out to be the *whole* balance once the tier was gone, so
 * it survives here on its own.
 */
describe('what an attainment costs', () => {
  it('raises the debut age to match what you say you achieved', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/How far you got/i)).getByRole('radio', { name: /Olympic/i }));

    // You cannot medal at a world championship and also turn pro at nineteen. This is now the only
    // thing stopping the top rung being the automatic pick, which is why it gets its own test.
    const slider = screen.getByLabelText(/Debut age/i) as HTMLInputElement;
    await waitFor(() => expect(Number(slider.value)).toBeGreaterThanOrEqual(25));
    expect(Number(slider.min)).toBeGreaterThanOrEqual(25);
  });
});

describe('the body, and what making the weight would cost it', () => {
  it('lets the player state a body and shows what it weighs', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    const height = screen.getByLabelText(/Height:/i) as HTMLInputElement;
    expect(screen.getByLabelText(/Reach:/i)).toBeTruthy();
    expect(screen.getByLabelText(/Frame:/i)).toBeTruthy();

    const walkingWeight = () =>
      Number(
        screen.getByText(/You walk around at/i).parentElement!.textContent!.match(/(\d+) lb/)![1],
      );

    const before = walkingWeight();
    fireEvent.change(height, { target: { value: '76' } });
    await waitFor(() => expect(walkingWeight()).toBeGreaterThan(before + 15));
  });

  it('tells the player the cut is impossible rather than letting them find out later', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    // A very large man, still asking for the division the screen opens on.
    fireEvent.change(screen.getByLabelText(/Height:/i), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(/Frame:/i), { target: { value: '95' } });

    await waitFor(() => {
      expect(screen.getByText(/You cannot make this weight/i)).toBeTruthy();
    });
    // And it says which divisions would work, so the panel is a way forward rather than a wall.
    expect(screen.getByText(/Divisions open to this body/i)).toBeTruthy();
  });

  it('no longer offers the three-way build picker it replaced', async () => {
    const user = userEvent.setup();
    await openCreator(user);
    for (const label of ['Rangy', 'Powerful']) {
      expect(screen.queryByRole('radio', { name: label }), label).toBeNull();
    }
  });
});

describe('the second discipline', () => {
  it('makes a wrestler who boxes into a different fighter from a boxer who wrestles', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    const read = async (attribute: RegExp) =>
      Number((await screen.findByRole('meter', { name: attribute })).getAttribute('aria-valuenow'));

    await user.click(within(layer(/What you trained/i)).getByRole('radio', { name: 'Wrestling' }));
    await user.selectOptions(screen.getByLabelText(/second discipline/i), 'boxing');
    const wrestlerWhoBoxes = {
      wrestling: await read(/^Wrestling:/i),
      striking: await read(/^Striking:/i),
    };

    await user.click(within(layer(/What you trained/i)).getByRole('radio', { name: 'Boxing' }));
    await user.selectOptions(screen.getByLabelText(/second discipline/i), 'wrestling');
    const boxerWhoWrestles = {
      wrestling: await read(/^Wrestling:/i),
      striking: await read(/^Striking:/i),
    };

    expect(wrestlerWhoBoxes.wrestling).toBeGreaterThan(boxerWhoWrestles.wrestling);
    expect(boxerWhoWrestles.striking).toBeGreaterThan(wrestlerWhoBoxes.striking);
  });

  it('cannot be the same art twice, and is closed off entirely to a non-fighter', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/What you trained/i)).getByRole('radio', { name: 'Boxing' }));
    const select = screen.getByLabelText(/second discipline/i) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).not.toContain('boxing');

    await user.click(
      within(layer(/What you trained/i)).getByRole('radio', { name: 'Sprints & Jumps' }),
    );
    await waitFor(() => {
      expect((screen.getByLabelText(/second discipline/i) as HTMLSelectElement).disabled).toBe(
        true,
      );
    });
    expect(screen.getByText(/never trained a martial art/i)).toBeTruthy();
  });
});

describe('the non-combat branch is the most distinct thing on the screen', () => {
  it('starts with visibly less fighting skill than an art does', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    const read = async (attribute: RegExp) =>
      Number((await screen.findByRole('meter', { name: attribute })).getAttribute('aria-valuenow'));

    await user.click(within(layer(/What you trained/i)).getByRole('radio', { name: 'Boxing' }));
    const boxer = await read(/^Striking:/i);

    await user.click(
      within(layer(/What you trained/i)).getByRole('radio', { name: 'Sprints & Jumps' }),
    );
    const sprinter = await read(/^Striking:/i);

    expect(sprinter).toBeLessThan(boxer - 8);
    // And it says so in plain language rather than leaving the player to read the bars.
    expect(screen.getByText(/everything technical is still ahead of you/i)).toBeTruthy();
  });
});

describe('what the screen refuses to tell you', () => {
  it('never renders a ceiling, on any origin', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    for (const name of ['Wrestling', 'Sprints & Jumps']) {
      await user.click(within(layer(/What you trained/i)).getByRole('radio', { name }));
      const meters = await screen.findAllByRole('meter');
      expect(meters.length).toBeGreaterThan(10);
      for (const meter of meters) {
        // `RatingRow` puts the scouted ceiling in the meter's accessible name when it draws
        // one. Hiding potential is what makes coaches, scouting and camps worth anything,
        // and the creation preview is the easiest place in the game to leak it.
        expect(meter.getAttribute('aria-label')).not.toMatch(/ceiling/i);
      }
    }
  });

  it('summarises the origin as fiction, with no numbers in it', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/What you trained/i)).getByRole('radio', { name: 'Wrestling' }));
    await user.selectOptions(screen.getByLabelText(/second discipline/i), 'boxing');

    const summary = await screen.findByText(/Out of Wrestling/i);
    expect(summary.textContent).toMatch(/Boxing/);
    expect(summary.textContent).not.toMatch(/\d/);
  });
});

describe('the whole thing still gets you into a career', () => {
  it('turns pro from a fully specified origin and body', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    fireEvent.change(screen.getByLabelText(/Height:/i), { target: { value: '73' } });
    fireEvent.change(screen.getByLabelText(/Frame:/i), { target: { value: '62' } });
    await user.click(
      within(layer(/What you trained/i)).getByRole('radio', { name: 'Rugby / American Football' }),
    );
    await user.click(
      within(layer(/How far you got/i)).getByRole('radio', { name: /International/i }),
    );
    await user.click(screen.getByRole('button', { name: /Turn pro/i }));

    expect(await screen.findByText(/Origin/)).toBeTruthy();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  }, 30_000);
});
