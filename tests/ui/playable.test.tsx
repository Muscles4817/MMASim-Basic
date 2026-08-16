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
 * Is the game actually playable?
 *
 * "It compiles" and "the dev server returns 200" answer neither of the questions that
 * matter: does the UI render, and can a player get from a cold start to a finished fight?
 * This suite mounts the real app — real providers, real database, real engine, no mocks —
 * and drives it with real clicks.
 *
 * Rendered under StrictMode, so double-invoked effects and initialisers are exercised too.
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

/** The error boundary rendering means something threw during a render we care about. */
function expectNoCrash() {
  expect(screen.queryByText(/Something went wrong/i), 'the app crashed into its error boundary')
    .toBeNull();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('the game is playable', () => {
  it('boots to the fighter picker from a cold start', async () => {
    renderApp();
    expectNoCrash();
    expect(await screen.findByText(/Or take over an existing fighter/i)).toBeTruthy();
    // The seeded roster is actually on screen, not an empty list.
    expect(await screen.findByText(/Khabib/)).toBeTruthy();
  });

  it('offers to create your own fighter from the landing screen', async () => {
    // This was unreachable: App.tsx redirects the hub to this screen when there is no player
    // fighter, and the only link to the creator lived in the hub's empty state. Creating a
    // fighter and climbing with them is the point of the mode, so this guards the route.
    const user = userEvent.setup();
    renderApp();

    const create = await screen.findByRole('button', { name: /Create your own fighter/i });
    await user.click(create);

    expect(await screen.findByRole('button', { name: /Turn pro/i })).toBeTruthy();
    expectNoCrash();
  });

  it('explains why it will not let an unfinished fighter turn pro', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: /Create your own fighter/i }));

    // Nothing filled in. The button must stay reachable and say why rather than sit greyed
    // out and swallow the tap.
    const turnPro = await screen.findByRole('button', { name: /Turn pro/i });
    expect(turnPro.hasAttribute('disabled')).toBe(false);
    expect(turnPro.getAttribute('aria-disabled')).toBe('true');

    await user.click(turnPro);
    expect(await screen.findByText(/Not ready to turn pro yet/i)).toBeTruthy();
  });

  it('plays a full career loop: pick → book → camp → fight → result', async () => {
    const user = userEvent.setup();
    renderApp();

    // 1. Pick a fighter.
    const khabib = await screen.findByText(/Khabib/);
    await user.click(khabib);

    // 2. The career hub shows who we are and offers opponents.
    expect(await screen.findByText(/Nurmagomedov/)).toBeTruthy();
    const offersCard = await screen.findByText(/Choose your next fight/i);
    expect(offersCard).toBeTruthy();
    expectNoCrash();

    // 3. Expand an offer and accept it. Booking is deliberately two steps.
    const stepChips = await screen.findAllByText(/Step up|Even fight|Favourable/);
    await user.click(stepChips[0]!.closest('button')!);
    const accept = await screen.findByRole('button', { name: /Accept fight/i });
    await user.click(accept);

    // 4. Camp: the scouting report and the game plan are there to be used.
    //
    // Matched as a heading rather than by text: the camp screen now also sells a "Full
    // scouting report" as a purchase, so a bare text match finds two things and cannot tell
    // the section from the thing you can buy.
    expect(await screen.findByRole('heading', { name: /Scouting report/i })).toBeTruthy();
    expect(await screen.findByText(/Game plan/i)).toBeTruthy();
    expectNoCrash();

    // Drill a read, and pick an approach.
    const readButtons = screen
      .getAllByRole('button')
      .filter((b) => b.textContent?.startsWith('Drill:') || b.querySelector('span'));
    const drillable = screen.getAllByRole('button', { pressed: false });
    if (drillable.length > 0) await user.click(drillable[0]!);
    expect(readButtons.length).toBeGreaterThan(0);

    // 5. Fight — now a two-step commit, because walking out is irreversible and the button
    // sat at the bottom of a long scroll with no restatement of the plan above it.
    await user.click(await screen.findByRole('button', { name: /^Fight /i }));
    await user.click(await screen.findByRole('button', { name: /walk out/i }));

    // 6. The replay screen renders and reaches a conclusion.
    expect(await screen.findByText(/Play-by-play/i)).toBeTruthy();
    expectNoCrash();

    await user.click(await screen.findByRole('radio', { name: /Skip/i }));

    await waitFor(
      () => {
        expect(screen.getByText(/^Result$/i)).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // A real outcome, and the fight statistics that go with it. `getAllBy` because the
    // method legitimately appears twice: once as the result, once in the commentary.
    expect(screen.getByText(/Fight statistics/i)).toBeTruthy();
    expect(
      screen.getAllByText(
        /Knockout|TKO|Submission|Unanimous decision|Split decision|Majority decision|Doctor stoppage|Draw/i,
      ).length,
    ).toBeGreaterThan(0);
    expectNoCrash();

    // 7. Back to the career, with the fight now on the record.
    await user.click(await screen.findByRole('button', { name: /Back to career/i }));
    expect(await screen.findByText(/Nurmagomedov/)).toBeTruthy();
    expectNoCrash();
  }, 30_000);

  it('persists the career across a reload', async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(await screen.findByText(/Poirier/));
    expect(await screen.findByText(/Choose your next fight/i)).toBeTruthy();
    first.unmount();

    // A fresh mount over the same localStorage is what a page reload does.
    renderApp();
    expect(await screen.findByText(/Poirier/)).toBeTruthy();
    expectNoCrash();
  });
});

describe('every screen renders', () => {
  const screens: ReadonlyArray<[string, 'text' | 'placeholder', RegExp]> = [
    ['#/roster', 'placeholder', /Search all divisions/i],
    ['#/rankings', 'text', /Choose a division/i],
    ['#/editor', 'placeholder', /Find a fighter/i],
    ['#/settings', 'text', /Appearance/i],
    ['#/editor/f_ngannou', 'text', /Walking weight/i],
  ];

  it.each(screens)('%s renders without crashing', async (hash, kind, expected) => {
    window.location.hash = hash;
    renderApp();
    if (kind === 'placeholder') {
      expect(await screen.findByPlaceholderText(expected)).toBeTruthy();
    } else {
      expect(await screen.findByText(expected)).toBeTruthy();
    }
    expectNoCrash();
  });

  it('names the fighter in the page heading, not just the category', async () => {
    // The h1 used to be the literal word "Fighter", so heading navigation and the shell's
    // own route-change announcement told a screen-reader user nothing about whose page it is.
    window.location.hash = '#/fighter/f_ngannou';
    renderApp();
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Ngannou/i);
    expectNoCrash();
  });

  it('shows a dead-end screen no way forward is never reached', async () => {
    // The fight screen with no stored result must offer a route out, not a blank page.
    window.location.hash = '#/fight/nonexistent';
    renderApp();
    expect(await screen.findByRole('button', { name: /Back to career/i })).toBeTruthy();
    expectNoCrash();
  });
});

describe('the editor writes through to the world', () => {
  it('saves an edited rating and shows it on the fighter profile', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/editor/f_ngannou';
    renderApp();

    const power = await screen.findByLabelText(/^Power value$/i);
    await user.clear(power);
    await user.type(power, '80');

    await user.click(await screen.findByRole('button', { name: /Save changes/i }));
    expect(await screen.findByRole('button', { name: /Saved/i })).toBeTruthy();
    expectNoCrash();
  }, 20_000);
});

describe('theme switching works in both directions', () => {
  it('applies and clears the data-theme attribute', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    renderApp();

    await user.click(await screen.findByRole('radio', { name: /^Dark$/i }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));

    await user.click(screen.getByRole('radio', { name: /^Light$/i }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));

    // "System" must remove the attribute entirely so the OS preference takes over again.
    await user.click(screen.getByRole('radio', { name: /^System$/i }));
    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false));
  });
});

describe('the error boundary catches a corrupt save', () => {
  it('offers recovery instead of a blank page', async () => {
    localStorage.setItem('mmasim:fighters', '{ this is not json');
    renderApp();
    expect(await screen.findByText(/Something went wrong/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Clear saved data and start again/i }),
    ).toBeTruthy();
  });
});

describe('accessibility basics hold on the rendered app', () => {
  it('exposes navigation as links with a current page', async () => {
    renderApp();
    const nav = await screen.findByRole('navigation', { name: /Main/i });
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(5);
    expect(links.some((l) => l.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('provides a skip link and a focusable main region', async () => {
    renderApp();
    expect(await screen.findByText(/Skip to content/i)).toBeTruthy();
    const main = document.querySelector('main#main');
    expect(main).toBeTruthy();
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('labels every form control', async () => {
    window.location.hash = '#/roster';
    renderApp();
    await screen.findByRole('searchbox');
    for (const control of document.querySelectorAll('input, select, textarea')) {
      const labelled =
        control.getAttribute('aria-label') ||
        control.closest('label') ||
        document.querySelector(`label[for="${control.id}"]`);
      expect(labelled, `unlabelled ${control.tagName}`).toBeTruthy();
    }
  });
});

describe('the career is a career, not a sequence of fights', () => {
  /** Fill in the create-a-fighter form and turn pro. */
  async function createFighter(user: ReturnType<typeof userEvent.setup>, last = 'Newman') {
    window.location.hash = '#/create';
    renderApp();
    await user.type(await screen.findByLabelText(/First name/i), 'Ade');
    await user.type(screen.getByLabelText(/Last name/i), last);
    await user.click(screen.getByRole('button', { name: /Turn pro/i }));
    expect(await screen.findByText(new RegExp(last))).toBeTruthy();
  }

  it('creates your own fighter, starting from nothing', async () => {
    const user = userEvent.setup();
    await createFighter(user);

    // Unknown, unranked, and on the smallest show in the sport. That is the starting point.
    const climb = (await screen.findByText(/The climb/i)).closest('section')!;
    expect(within(climb).getAllByText(/Unranked/i).length).toBeGreaterThan(0);
    expect(within(climb).getByText(/developmental/i)).toBeTruthy();
    expectNoCrash();
  }, 30_000);

  it('lets the background choice actually change the fighter you get', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/create';
    renderApp();
    // The preview only appears once the spec is valid, which needs a name.
    await user.type(await screen.findByLabelText(/First name/i), 'Ade');
    await user.type(screen.getByLabelText(/Last name/i), 'Preview');

    // `radio`, not `button`: the six backgrounds are mutually exclusive, so they announce
    // "selected, 1 of 6" rather than "toggle button, pressed".
    await user.click(screen.getByRole('radio', { name: /Collegiate Wrestler/i }));
    const wrestlingRow = await screen.findByRole('meter', { name: /^Wrestling:/i });
    const asWrestler = Number(wrestlingRow.getAttribute('aria-valuenow'));

    await user.click(screen.getByRole('radio', { name: /Amateur Boxer/i }));
    const asBoxer = Number(
      (await screen.findByRole('meter', { name: /^Wrestling:/i })).getAttribute('aria-valuenow'),
    );

    expect(asWrestler).toBeGreaterThan(asBoxer);
    expectNoCrash();
  }, 30_000);

  it('improves the fighter through training, and the improvement persists', async () => {
    const user = userEvent.setup();
    await createFighter(user, 'Trainee');

    await user.click(await screen.findByRole('link', { name: /Career/i }));
    await user.click(await screen.findByRole('button', { name: /Go to training/i }));

    expect(await screen.findByText(/What to work on/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Wrestling/i }));
    await user.click(screen.getByRole('button', { name: /Train for 8 weeks/i }));

    // The camp report is the proof the numbers moved.
    expect(await screen.findByText(/Camp report/i)).toBeTruthy();
    const report = screen.getByText(/Camp report/i).closest('section')!;
    expect(within(report).getAllByText(/^\+\d/).length).toBeGreaterThan(0);
    expectNoCrash();
  }, 40_000);

  it('advances the calendar when time is spent training', async () => {
    const user = userEvent.setup();
    await createFighter(user, 'Clockwatcher');

    const dateBefore = document.querySelector('.shell__subtitle')?.textContent;
    await user.click(await screen.findByRole('link', { name: /Career/i }));
    await user.click(await screen.findByRole('button', { name: /Go to training/i }));
    await user.click(await screen.findByRole('button', { name: /Train for 8 weeks/i }));

    await waitFor(() => {
      expect(document.querySelector('.shell__subtitle')?.textContent).not.toBe(dateBefore);
    });
    expectNoCrash();
  }, 40_000);

  it('shows the climb, and what it will take to get a title shot', async () => {
    const user = userEvent.setup();
    await createFighter(user, 'Climber');

    const climb = (await screen.findByText(/The climb/i)).closest('section')!;
    expect(within(climb).getByRole('meter', { name: /Career progress/i })).toBeTruthy();
    // Always says what is standing between you and the belt, eligible or not.
    expect(climb.textContent).toMatch(/unranked|ranked|top three|two straight wins|not signed/i);
    expectNoCrash();
  }, 30_000);
});

describe('the interface says what matters', () => {
  it('leads a profile with the read, not with fifteen equal bars', async () => {
    window.location.hash = '#/fighter/f_ngannou';
    renderApp();
    // "Wins with Power 99" is actionable. A wall of bars is homework.
    expect(await screen.findByText(/Wins with/i)).toBeTruthy();
    expect(screen.getByText(/Vulnerable to/i)).toBeTruthy();
    expectNoCrash();
  });

  it('gives every colour-coded signal a text equivalent', async () => {
    window.location.hash = '#/fighter/f_ngannou';
    renderApp();
    await screen.findByText(/Wins with/i);

    // Attribute badges carry the band name for anyone who cannot use the colour.
    const badges = document.querySelectorAll('.attr-badge');
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent, 'a badge with no readable band').toMatch(
        /All-time|Best in the world|Elite|Very good|Solid|Average|Below level|Liability|Absent/i,
      );
    }
  });

  it('never renders a decorative icon without an accessible name nearby', async () => {
    window.location.hash = '#/fighter/f_ngannou';
    renderApp();
    await screen.findByText(/Wins with/i);
    // Every icon is aria-hidden; meaning is carried by the text beside it.
    for (const icon of document.querySelectorAll('.keystat__icon, .alert__icon')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('surfaces accumulated damage as a warning rather than a number in a row', async () => {
    // Arlovski carries the highest head trauma in the game; it must be impossible to miss.
    window.location.hash = '#/fighter/f_arlovski';
    renderApp();
    expect(await screen.findByText(/chin has gone|Damage is accumulating/i)).toBeTruthy();
    expectNoCrash();
  });

  it('marks a rating’s band on the bar, not only its number', async () => {
    window.location.hash = '#/fighter/f_ngannou';
    renderApp();
    await screen.findByText(/Wins with/i);
    // Power 99 must be visibly a different class of rating from an average one.
    const elite = document.querySelectorAll('.rating--elite');
    const weak = document.querySelectorAll('.rating--weak');
    expect(elite.length, 'no rating marked elite on a fighter with a 99').toBeGreaterThan(0);
    expect(weak.length, 'no rating marked weak on a fighter with a 26').toBeGreaterThan(0);
  });

  it('shows a title fight and a champion with more than a word', async () => {
    window.location.hash = '#/rankings';
    renderApp();
    // The champion row is marked with a crown and the word, not a bare "C".
    //
    // Matched exactly rather than loosely: a promotion in the picker is called "Apex
    // Fighting Championship", which a /Champion/i regex also matches.
    expect(await screen.findByText('Champion', { exact: true })).toBeTruthy();
    expectNoCrash();
  });
});
