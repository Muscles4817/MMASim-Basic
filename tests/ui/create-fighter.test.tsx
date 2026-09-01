import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { App } from '../../packages/app/src/App';
import { GameProvider } from '../../packages/app/src/state/GameProvider';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';

/**
 * The three-layer origin picker.
 *
 * Nested pickers are where creation screens go wrong: the layers cascade, so a choice made
 * on layer 1 can silently invalidate one already made on layer 3, and the player finds out
 * on submit. Every test here is about that seam — that the filter is visible rather than
 * enforced only at validation time, that a selection which stops being legal is *moved*
 * rather than left to fail, and that the whole thing still reaches "Turn pro".
 *
 * The other thing it guards is the one hard rule of the mode: no ceiling is ever rendered.
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

describe('the origin picker asks three questions', () => {
  it('shows all three layers, in order, each explained', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    expect(screen.getByRole('radiogroup', { name: /What kind of athlete you are/i })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: /What you trained/i })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: /How far you got/i })).toBeTruthy();
    // Numbered, because three nested layers with no ordering read as three unrelated menus.
    expect(screen.getByText(/1\. What kind of athlete you are/i)).toBeTruthy();
    expect(screen.getByText(/3\. How far you got/i)).toBeTruthy();
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
    // Six arts plus the five non-combat sports the default tier allows. Three until doc 31 § 12
    // step 9 split `trackAndField` into sprints and throws and `enduranceSport` into rowing and
    // distance running — see § 22.1 for why that stopped being a widened menu.
    expect(trained).toHaveLength(11);
  });
});

describe('layer 1 filters layer 3', () => {
  it('drops the elite rungs off the menu entirely under a lesser talent', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Freak' }));
    expect(within(layer(/How far you got/i)).getByRole('radio', { name: /Olympic/i })).toBeTruthy();

    // Not offered-and-discounted: not offered. An Olympic medallist *is* an elite athlete,
    // so scaling it down under a lesser tier would count the same fact twice.
    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Grinder' }));
    await waitFor(() => {
      expect(
        within(layer(/How far you got/i)).queryByRole('radio', { name: /Olympic/i }),
      ).toBeNull();
    });
    expect(
      within(layer(/How far you got/i)).queryByRole('radio', { name: /National/i }),
    ).toBeNull();
    expect(screen.getByText(/rungs above this open up if you are a better athlete/i)).toBeTruthy();
  });

  it('moves a selection that stopped being legal rather than letting it fail on submit', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Freak' }));
    const olympic = within(layer(/How far you got/i)).getByRole('radio', { name: /Olympic/i });
    await user.click(olympic);
    expect(olympic.getAttribute('aria-checked')).toBe('true');

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Grinder' }));

    // Fell to the highest rung a grinder can reach, and the form is still submittable.
    await waitFor(() => {
      const chosen = within(layer(/How far you got/i))
        .getAllByRole('radio')
        .filter((r) => r.getAttribute('aria-checked') === 'true');
      expect(chosen).toHaveLength(1);
      expect(chosen[0]!.getAttribute('aria-label')).toMatch(/Regional/i);
    });
    expect(screen.getByRole('button', { name: /Turn pro/i }).getAttribute('aria-disabled')).toBe(
      'false',
    );
  });

  it('hides the non-combat sports from the tier with no athletic story to tell', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Grinder' }));
    await waitFor(() => {
      expect(within(layer(/What you trained/i)).getAllByRole('radio')).toHaveLength(6);
    });
    expect(
      within(layer(/What you trained/i)).queryByRole('radio', { name: /Sprints & Jumps/i }),
    ).toBeNull();
  });

  it('raises the debut age to match what you say you achieved', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Freak' }));
    await user.click(within(layer(/How far you got/i)).getByRole('radio', { name: /Olympic/i }));

    // You cannot medal at a world championship and also turn pro at nineteen. The slider
    // moves rather than the form quietly becoming invalid.
    const slider = screen.getByLabelText(/Debut age/i) as HTMLInputElement;
    await waitFor(() => expect(Number(slider.value)).toBeGreaterThanOrEqual(25));
    expect(Number(slider.min)).toBeGreaterThanOrEqual(25);
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

    for (const name of ['Freak', 'Grinder']) {
      await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name }));
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

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Freak' }));
    await user.click(within(layer(/What you trained/i)).getByRole('radio', { name: 'Wrestling' }));
    await user.selectOptions(screen.getByLabelText(/second discipline/i), 'boxing');

    const summary = await screen.findByText(/A freak out of Wrestling/i);
    expect(summary.textContent).toMatch(/Boxing/);
    expect(summary.textContent).not.toMatch(/\d/);
  });
});

describe('the whole thing still gets you into a career', () => {
  it('turns pro from a fully specified three-layer origin', async () => {
    const user = userEvent.setup();
    await openCreator(user);

    await user.click(within(layer(/athlete you are/i)).getByRole('radio', { name: 'Freak' }));
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
