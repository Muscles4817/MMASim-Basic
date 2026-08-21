/**
 * Fight night, as a night rather than as a text feed.
 *
 * The screen used to open straight onto a play-by-play already dripping: no card, no venue, no
 * house, no officials, and the two fighters reduced to a pair of surnames. Everything it needed
 * had been computed for the promotion's books and thrown away before it reached a screen — the
 * running order most of all, since `resolutionOrder()` was written, tested and never called.
 *
 * These drive the real app to a real fight and assert on what the player is actually shown.
 * See docs/28.
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

/** Take over a seeded fighter, accept the first offer, and commit to the fight. */
async function toFightNight(user: ReturnType<typeof userEvent.setup>) {
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

  goTo('#/camp');
  await user.click(await screen.findByRole('button', { name: /^Fight /i }));
  await user.click(await screen.findByRole('button', { name: /Yes — walk out/i }));
  await screen.findByText(/Tale of the tape/i);
}

/** Walk out and skip to the end of the playback. */
async function watchIt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Make the walk/i }));
  await user.click(await screen.findByRole('radio', { name: /Skip/i }));
  await waitFor(() => expect(screen.getByText(/^Result$/i)).toBeTruthy(), { timeout: 5000 });
}

describe('before the bell', () => {
  it('opens on the card rather than on a feed already running', async () => {
    const user = userEvent.setup();
    await toFightNight(user);

    // The play-by-play has not started, and nothing has been spoiled.
    expect(screen.queryByText(/Play-by-play/i)).toBeNull();
    expect(screen.queryByText(/^Result$/i)).toBeNull();
    expect(await screen.findByRole('button', { name: /Make the walk/i })).toBeTruthy();
  });

  it('shows the tale of the tape, which was on the fighters all along', async () => {
    const user = userEvent.setup();
    await toFightNight(user);

    const text = document.body.textContent ?? '';
    // Reach and stance have been on every fighter since the domain was written and had never
    // once been put in front of the player at the moment they decide anything.
    expect(text).toMatch(/Reach/i);
    expect(text).toMatch(/Height/i);
    expect(text).toMatch(/Stance/i);
    expect(text).toMatch(/Record/i);
  });

  it('names the night and says how full the building is', async () => {
    const user = userEvent.setup();
    await toFightNight(user);

    expect(await screen.findByText(/Tonight/i)).toBeTruthy();
    // `eventRevenue` has computed attendance on every card ever run and it reached the gate
    // receipt and nothing else.
    expect(document.body.textContent ?? '').toMatch(/in the building/i);
  });

  it('promises the number of rounds the engine is actually going to fight', async () => {
    const user = userEvent.setup();
    await toFightNight(user);

    /*
     * `buildCard` gives whatever tops the night five rounds; `runBookedFight` fights three
     * unless it is for a title. Nothing read either number until this screen existed, so the
     * disagreement was invisible — and the first thing the pre-fight card did was promise five
     * rounds of a fight that was scheduled for three.
     */
    const text = document.body.textContent ?? '';
    const promised = /(\d) rounds/.exec(text)?.[1];
    expect(promised).toBeDefined();

    await watchIt(user);
    // The result cannot have run past what was scheduled.
    const reached = /Round (\d)/.exec(document.body.textContent ?? '')?.[1];
    expect(Number(reached)).toBeLessThanOrEqual(Number(promised));
  });

  it('introduces the judges before they score anything', async () => {
    const user = userEvent.setup();
    await toFightNight(user);

    const officials = (await screen.findByText(/Officials/i)).closest('section, div');
    expect(officials).toBeTruthy();
    const text = officials?.textContent ?? '';
    expect(text).toMatch(/Judge/);
    expect(text).toMatch(/Referee/);
    // What each of them rewards, which is the difference between "the game robbed me" and
    // "that was Frawley".
    expect(text).toMatch(/rewards|balanced card/i);
  });

  it('runs the card in the order the night happens, not the order it was advertised', async () => {
    const user = userEvent.setup();
    await toFightNight(user);

    const card = (await screen.findByText(/^The card$/i)).closest('section, div') as HTMLElement;
    expect(within(card).getByText(/You, next/i)).toBeTruthy();

    const rows = [...card.querySelectorAll('.card-row')];
    const mine = rows.findIndex((r) => /You, next/i.test(r.textContent ?? ''));

    /*
     * The whole difference between a poster and a night.
     *
     * A poster is sorted by draw, so the main event is the first row — and the player is very
     * often in it. A night runs the other way: the fights below you have already happened by
     * the time you walk, so your row cannot be the first thing on this list. That is
     * `resolutionOrder()`, and this is the assertion that it is actually being called.
     */
    expect(rows.length).toBeGreaterThan(1);
    expect(mine).toBeGreaterThan(0);

    // Everything before you has a result on it; everything after you has not happened yet.
    for (const row of rows.slice(0, mine)) {
      expect(row.textContent ?? '').toMatch(/, R\d|Draw|—/);
    }
    for (const row of rows.slice(mine + 1)) {
      expect(row.textContent ?? '').toMatch(/Later tonight/i);
    }
  });
});

describe('the offer that would headline', () => {
  it('says so, and says what the camp costs, before the player commits', async () => {
    const user = userEvent.setup();
    goTo('#/start/fighter');
    renderApp();
    const rows = await screen.findAllByRole('button', { name: /./ });
    const row = rows.find((r) => r.classList.contains('datatable__rowbutton'))!;
    await user.click(row);
    await user.click(await screen.findByRole('button', { name: /^Take control of/i }));
    await user.click(await screen.findByRole('button', { name: /^Yes — take control of/i }));

    goTo('#/hub');
    const offers = await screen.findAllByRole('button', {
      name: /Even fight|Step up|Favourable/i,
    });
    await user.click(offers[0]!);

    /*
     * The copy said "eight weeks time" unconditionally. It was already wrong for a title fight,
     * and became wrong for every main event once those went to five rounds and a ten-week camp
     * — on the sentence a player reads before committing two months of a career.
     */
    const text = document.body.textContent ?? '';
    const headlining = /You would headline/i.test(text);
    expect(text).toMatch(headlining ? /ten weeks time/i : /eight weeks time/i);
    if (headlining) expect(text).toMatch(/Five rounds, and a ten-week camp/i);
  });
});

describe('after it', () => {
  it('shows damage, the one judging input the statistics panel omitted', async () => {
    const user = userEvent.setup();
    await toFightNight(user);
    await watchIt(user);

    const stats = (await screen.findByText(/Fight statistics/i)).closest('section, div');
    expect(stats?.textContent ?? '').toMatch(/Damage/i);
  });

  it('breaks the fight down by round, so a card can be reconciled with the numbers', async () => {
    const user = userEvent.setup();
    await toFightNight(user);
    await watchIt(user);

    // Every fight has rounds; only a fight that goes to the cards has scorecards, so this is
    // the assertion that holds whatever the seed produces.
    expect(await screen.findByText(/Round by round/i)).toBeTruthy();
    expect(document.body.textContent ?? '').toMatch(/Round 1/i);
  });

  it('says where the fight happened, and whether that is where it was asked to happen', async () => {
    /*
     * The panel that turns a statistic into a diagnosis.
     *
     * "Distance 61%" is not an answer to the only question a player has after a plan did not
     * work — sixty-one per cent standing *where*, and was that the plan? The inspector has to
     * name all five places a fight can be, say which one was asked for, and show the range
     * contest as attempts against arrivals, because a fighter who tried eleven times and got
     * there twice is a completely different problem from one who never tried.
     */
    const user = userEvent.setup();
    await toFightNight(user);
    await watchIt(user);

    const panel = (await screen.findByText(/Where the fight happened/i)).closest('div');
    const text = panel?.textContent ?? '';

    // All five states, not the three standing ones — a clinch plan and a pocket plan are
    // neighbours and reading them off separate widgets hides that.
    for (const place of [/Kicking range/i, /Boxing range/i, /The pocket/i, /Clinch/i, /Ground/i]) {
      expect(text, `missing ${place} from: ${text}`).toMatch(place);
    }

    // Asked for against got, and the contest that decided it.
    expect(text).toMatch(/You asked for/i);
    expect(text).toMatch(/of the standing time/i);
    expect(text).toMatch(/Range changes won/i);
  });

  it('says how the building took it', async () => {
    const user = userEvent.setup();
    await toFightNight(user);
    await watchIt(user);

    const crowd = (await screen.findByText(/^The crowd$/i)).closest('section, div');
    expect(crowd).toBeTruthy();
    expect((crowd?.textContent ?? '').length).toBeGreaterThan(20);
  });

  it('never claims the judges disagreed when they did not', async () => {
    const user = userEvent.setup();
    await toFightNight(user);
    await watchIt(user);

    const text = document.body.textContent ?? '';
    // The old copy asserted disagreement unconditionally, printed under three identical cards.
    if (/Scorecards/i.test(text)) {
      const sawEveryRound = /all three saw every round the same way/i.test(text);
      const splitOn = /They split on round/i.test(text);
      expect(sawEveryRound || splitOn).toBe(true);
    }
  });
});
