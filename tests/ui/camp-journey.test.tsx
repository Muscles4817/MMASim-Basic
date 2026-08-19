/**
 * The training and fight-camp journey, as a player actually walks it.
 *
 * These exist because a UX pass over those two screens turned up two failures that no
 * component test would ever catch, because both are about what happens *between* screens:
 * training could walk the world clock straight past a booked fight, and the fight plan was
 * only written down when you pressed Fight, so leaving the screen for any reason silently
 * discarded it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

/** Take over a seeded fighter, which is the shortest route to a live career. */
async function startCareer(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/start');
  renderApp();
  const rows = await screen.findAllByRole('button', { name: /Star power/i });
  await user.click(rows[0]!);
  await screen.findByText(/Next fight|No opponents|Choose your next/i).catch(() => undefined);
}

/** Accept the first offer on the hub, which lands us in fight camp. */
async function bookAFight(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/hub');
  const offers = await screen.findAllByRole('button', { name: /Even fight|Step up|Favourable/i });
  await user.click(offers[0]!);
  await user.click(await screen.findByRole('button', { name: /Accept fight/i }));
}

describe('the training screen shows what the decision is about', () => {
  it('shows the fighter their own game, not just a coach rating', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    goTo('#/training');

    // FighterRead's captions. Choosing what to train without seeing what you have was the
    // central failure of this screen.
    expect(await screen.findByText(/Wins with/i)).toBeTruthy();
  });

  it('forecasts what a camp is worth before it is run', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    goTo('#/training');

    expect(await screen.findByText(/Expected from this camp/i)).toBeTruthy();
  });

  it('says what the calendar will do, not just what the attributes will', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    goTo('#/training');

    expect(await screen.findByText(/You return on/i)).toBeTruthy();
  });

  it('explains what resting actually does', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    goTo('#/training');

    // Rest is skill decay for a healthy fighter, and it used to be an unexplained button
    // labelled "Rest instead" that a player would reasonably read as recovery.
    expect(await screen.findByText(/nothing to heal|until you are fully healed/i)).toBeTruthy();
  });

  it('reports how much time passed after a camp', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    goTo('#/training');

    await user.click(await screen.findByRole('button', { name: /Train for 8 weeks/i }));
    // The camp report is its own screen now rather than a card under the form, and it leads with
    // the work done rather than with the clock — the date and the fighter's new age sit under it.
    expect(await screen.findByText(/8 weeks of work/i)).toBeTruthy();
  });
});

describe('training cannot walk past a booked fight', () => {
  it('warns, and refuses, when the block runs past fight night', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    goTo('#/training');
    // A fight is booked eight weeks out. Twelve weeks would run past it.
    await user.click(await screen.findByRole('radio', { name: /12 weeks/i }));

    expect(await screen.findByText(/longer than you have/i)).toBeTruthy();

    const train = await screen.findByRole('button', { name: /Train for 12 weeks/i });
    expect(train.getAttribute('aria-disabled')).toBe('true');

    // And pressing it must genuinely do nothing.
    await user.click(train);
    expect(screen.queryByText(/weeks passed/i)).toBeNull();
  });

  it('allows a block that fits inside the camp', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    goTo('#/training');
    await user.click(await screen.findByRole('radio', { name: /^4 weeks/i }));

    expect(screen.queryByText(/longer than you have/i)).toBeNull();
    const train = await screen.findByRole('button', { name: /Train for 4 weeks/i });
    expect(train.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('tells the player a fight is booked at all', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    goTo('#/training');
    expect(await screen.findByText(/Fight in/i)).toBeTruthy();
  });
});

describe('the fight plan survives leaving the screen', () => {
  it('keeps drilled reads across a navigation', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    // Drill something.
    const reads = await screen.findAllByRole('button', { name: /Drill:/i });
    await user.click(reads[0]!);
    await waitFor(() =>
      expect(reads[0]!.getAttribute('aria-pressed')).toBe('true'),
    );

    // Wander off — checking the rankings is an entirely reasonable thing to do mid-camp —
    // and come back. This used to reset the whole plan to a default nobody chose.
    goTo('#/rankings');
    await screen.findByText(/not on ability/i);
    goTo('#/camp');

    const after = await screen.findAllByRole('button', { name: /Drill:/i });
    expect(after[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the chosen game plan across a navigation', async () => {
    /*
     * The plan is five decisions now rather than one, and each is a separate writer into the
     * saved booking — which is exactly the shape of the defect this block was written for. A
     * stale spread erasing whatever the last writer wrote reappears one field at a time.
     */
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    // Where the fight happens: pick something that is not the default.
    const states = await screen.findAllByRole('button', { name: /Ground — Top|Clinch|Outside/i });
    const notSelected = states.find((b) => b.getAttribute('aria-pressed') === 'false');
    expect(notSelected, 'no unselected preference to switch to').toBeTruthy();
    const label = notSelected!.textContent ?? '';
    await user.click(notSelected!);

    goTo('#/rankings');
    await screen.findByText(/not on ability/i);
    goTo('#/camp');

    const after = await screen.findAllByRole('button', { name: /Ground — Top|Clinch|Outside/i });
    const stillSelected = after.find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(stillSelected?.textContent).toBe(label);
  });

  it('asks what to do underneath, which the old plan never did', async () => {
    /*
     * The control the whole rework exists for. A striker on his back used to hunt guillotines he
     * could not finish because the engine drew from three near-equal weights and the plan was not
     * in the room; this is the instruction that stops it, and it has to be *on the screen* or the
     * engine work is unreachable.
     */
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    expect(await screen.findByText(/When you are underneath/i)).toBeTruthy();
    const standUp = await screen.findByRole('button', { name: /Stand up/i });
    await user.click(standUp);
    await waitFor(() => expect(standUp.getAttribute('aria-pressed')).toBe('true'));

    // And it survives the round trip, like everything else on this screen.
    goTo('#/rankings');
    await screen.findByText(/not on ability/i);
    goTo('#/camp');
    const again = await screen.findByRole('button', { name: /Stand up/i });
    expect(again.getAttribute('aria-pressed')).toBe('true');
  });

  it('offers the entry styles that go with the fight you asked for', async () => {
    // `(preferredState, entry)` is the pair that carries the expressiveness, and an entry left
    // over from a previous preference is a stale control rather than a plan.
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    const top = await screen.findByRole('button', { name: /Ground — Top/i });
    await user.click(top);
    expect(await screen.findByRole('button', { name: /Chain wrestling/i })).toBeTruthy();

    const outside = await screen.findByRole('button', { name: /Outside/i });
    await user.click(outside);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Chain wrestling/i })).toBeNull());
    expect(await screen.findByRole('button', { name: /Circle, reset/i })).toBeTruthy();
  });
});

describe('fight camp tells the player what is at stake and who they are', () => {
  it('shows both fighters, not just the opponent', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    // Two FighterRead blocks, headed Him and You.
    expect(await screen.findByText(/^Him$/)).toBeTruthy();
    expect(await screen.findByText(/^You$/)).toBeTruthy();
  });

  it('relates each threat to the player’s own defence', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    // "Your takedown defence is …" — the line that turns a scouting report into a decision.
    expect(await screen.findAllByText(/Your .* is/i)).not.toHaveLength(0);
  });

  it('makes walking out a two-step commit with the plan restated', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    expect(await screen.findByText(/^Ready\?$/i)).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: /^Fight / }));
    expect(await screen.findByRole('button', { name: /walk out/i })).toBeTruthy();

    // And backing out must be possible.
    await user.click(await screen.findByRole('button', { name: /Not yet/i }));
    expect(await screen.findByRole('button', { name: /^Fight / })).toBeTruthy();
  });

  it('warns when walking out having drilled nothing', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    expect(await screen.findByText(/You have drilled nothing/i)).toBeTruthy();
  });
});

describe('the camp screen does not lose what you built', () => {
  it('keeps a purchase when the plan is changed afterwards', async () => {
    /*
     * `booking` was a mount-time snapshot with no setter, and the screen has two writers —
     * the plan and the purchases. Each spread that stale object over the whole stored record,
     * so whichever was written second erased the other.
     *
     * Harmless while the plan was the only writer; introduced the moment purchases landed.
     */
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    const nutritionist = await screen.findByRole('checkbox', { name: /Nutritionist/i });
    await user.click(nutritionist);
    expect((nutritionist as HTMLInputElement).checked).toBe(true);

    // Now touch the plan, which is the other writer.
    const approach = await screen.findAllByRole('button', { name: /Counter|Grind|Pressure/i });
    await user.click(approach[0]!);

    const stored = JSON.parse(sessionStorage.getItem('mmasim:booking') ?? '{}');
    expect(stored.purchases, 'the purchase was erased by writing the plan').toContain(
      'nutritionist',
    );
  });

  it('keeps the plan when a purchase is ticked afterwards', async () => {
    const user = userEvent.setup();
    await startCareer(user);
    await bookAFight(user);

    // Drill a read first, which writes the plan.
    const reads = await screen.findAllByRole('button', { name: /Drill/i });
    await user.click(reads[0]!);
    const afterRead = JSON.parse(sessionStorage.getItem('mmasim:booking') ?? '{}');
    expect(afterRead.plan.preppedReads.length).toBeGreaterThan(0);

    // Then buy something, which is the other writer.
    await user.click(await screen.findByRole('checkbox', { name: /Nutritionist/i }));

    const stored = JSON.parse(sessionStorage.getItem('mmasim:booking') ?? '{}');
    expect(stored.plan.preppedReads.length, 'the drilled read was erased by a purchase').toBe(
      afterRead.plan.preppedReads.length,
    );
  });
});
