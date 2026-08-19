/**
 * Promoter mode, as a player walks it.
 *
 * Rewritten wholesale for the planning rework. The old suite asserted the behaviour that rework
 * removed: that the card builder "opens with a full card rather than a blank form", that nine of
 * nine slots are filled before the player has done anything, that prelims are collapsed. Every
 * one of those was a true description of a screen whose central problem was that the matchmaker
 * had already made the only interesting decision.
 *
 * What is asserted now is the shape that replaced it:
 *
 *  - the dashboard leads with what needs the player rather than with a roster count;
 *  - a card is a **date**, created ahead of time, and starts empty;
 *  - filling a slot is fighter → opponent → designate → offer, and the opponent list is grouped
 *    by what kind of fight it would be and explains itself;
 *  - autofill exists, is scoped, and suggests before it books;
 *  - nothing is signed until both corners agree.
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

/** Create a card from the calendar and land on it. */
async function planACard(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/calendar');
  await user.click(await screen.findByRole('button', { name: /New card/i }));
  await user.click(await screen.findByRole('button', { name: /Put it in the diary/i }));
}

describe('choosing to run a promotion', () => {
  it('lands you on your own dashboard rather than a fighter’s', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('heading', { name: /Needs you/i })).toBeTruthy();
  });

  it('does not bounce a promoter to the fighter start screen', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/hub');
    expect(await screen.findByRole('heading', { name: /Needs you/i })).toBeTruthy();
  });

  it('changes the tab bar to the promoter’s places', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('link', { name: /Promotion/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Career$/i })).toBeNull();
  });

  it('puts the promotion’s other systems one tap away rather than burying them', async () => {
    // Five tabs cannot name events, championships, contracts and the world at once, and the old
    // answer — hide them inside Roster and Calendar — is where nobody found them.
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('link', { name: /Championships/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Roster & contracts/i })).toBeTruthy();
  });
});

describe('the dashboard', () => {
  it('opens on what needs the promoter, not on a roster preview', async () => {
    /*
     * The core principle of the mode: the simulation produces enormous amounts of state and the
     * UX's job is to turn it into situations. A promoter who has to open twenty screens to find
     * out their champion has no defence booked is being handed a database.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('heading', { name: /Needs you/i })).toBeTruthy();
    // A brand-new save has no cards, which is itself the first thing to fix.
    expect(screen.getByText(/Nothing on the calendar/i)).toBeTruthy();
  });

  it('says why each row is being shown', async () => {
    // Every attention row answers "why am I looking at this", or it is a notification.
    const user = userEvent.setup();
    await becomePromoter(user);
    await screen.findByRole('heading', { name: /Needs you/i });
    expect(document.querySelectorAll('.attention__detail').length).toBeGreaterThan(0);
  });

  it('reports the money as an operating position rather than one balance', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByText(/Monthly burn/i)).toBeTruthy();
    expect(screen.getByText(/Committed to booked fights/i)).toBeTruthy();
  });

  it('uses one money notation everywhere', async () => {
    /*
     * The header said £5.4m and the dashboard said £5,400k for the same number. Both now go
     * through `ui/format.money`, so a five-digit thousands figure is a regression rather than a
     * style choice.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    await screen.findByRole('heading', { name: /Needs you/i });
    const withThousands = screen.queryAllByText(/£[\d,]{5,}k/).map((el) => el.textContent);
    expect(withThousands, 'a five-digit £…k figure escaped the formatter').toEqual([]);
  });

  it('shows the champions and who is behind them', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    expect(await screen.findByRole('heading', { name: /^Champions$/i })).toBeTruthy();
  });
});

describe('planning a card', () => {
  it('creates an event on a future date with nothing on it', async () => {
    /*
     * The foundational act of the mode, and the thing the old builder could not express: a card
     * exists as a date months before anybody knows who is fighting.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    expect(await screen.findByRole('heading', { name: /^Main event$/i })).toBeTruthy();
    // Empty slots are a legitimate state, not a failure.
    expect(screen.getAllByText(/^Empty$/).length).toBeGreaterThan(0);
  });

  it('says what each section of the card is for', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    expect((await screen.findAllByText(/Sells the night/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/If the main event falls apart/i)).toBeTruthy();
  });

  it('puts the planned card on the calendar with its state on the row', async () => {
    // The six-month view has to answer "what does my year look like" without opening anything.
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    goTo('#/calendar');
    expect(await screen.findByText(/Nothing booked|Needs a main event/i)).toBeTruthy();
  });

  it('offers a market to run it in', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/calendar');
    await user.click(await screen.findByRole('button', { name: /New card/i }));
    expect(await screen.findByText(/The sport’s shop window/i)).toBeTruthy();
  });
});

describe('matchmaking', () => {
  /** Open the main event slot on a freshly planned card. */
  async function openMainEvent(user: ReturnType<typeof userEvent.setup>) {
    await becomePromoter(user);
    await planACard(user);
    const slots = document.querySelectorAll('.slot');
    await user.click(slots[0] as HTMLElement);
  }

  it('asks who you want before it asks anything else', async () => {
    /*
     * The whole rework in one assertion. The player chooses the fighter; the game does not
     * choose for them and ask them to disagree.
     */
    const user = userEvent.setup();
    await openMainEvent(user);
    expect(await screen.findByRole('heading', { name: /who do you want\?/i })).toBeTruthy();
  });

  it('groups the opponents by what kind of fight it would be', async () => {
    // Not an alphabetical roster with a search box: a promoter is choosing between kinds of
    // fight before they are choosing between names.
    const user = userEvent.setup();
    await openMainEvent(user);
    const candidates = await screen.findAllByRole('button', { name: /Unranked|#\d+/ });
    await user.click(candidates[0]!);

    expect(await screen.findByRole('heading', { name: /Who fights/i })).toBeTruthy();
    expect(document.querySelectorAll('.picker__group-title').length).toBeGreaterThan(0);
  });

  it('explains why each opponent is being suggested', async () => {
    // A suggestion the player cannot interrogate is the game playing itself.
    const user = userEvent.setup();
    await openMainEvent(user);
    const candidates = await screen.findAllByRole('button', { name: /Unranked|#\d+/ });
    await user.click(candidates[0]!);

    await screen.findByRole('heading', { name: /Who fights/i });
    expect(document.querySelectorAll('.candidate__why').length).toBeGreaterThan(0);
  });

  it('lets the promoter say what the fight is for, and re-ranks on it', async () => {
    const user = userEvent.setup();
    await openMainEvent(user);
    const candidates = await screen.findAllByRole('button', { name: /Unranked|#\d+/ });
    await user.click(candidates[0]!);

    await screen.findByRole('heading', { name: /Who fights/i });
    expect(screen.getByText(/What is this fight for\?/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Build a prospect$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Title eliminator$/i })).toBeTruthy();
  });

  it('separates pencilling a fight in from offering it', async () => {
    /*
     * A card is planned over months. Writing a name into a slot in January and asking the man in
     * March are different acts, and the old builder — where placing a fight *was* booking it —
     * could not express either half of that.
     */
    const user = userEvent.setup();
    await openMainEvent(user);
    const candidates = await screen.findAllByRole('button', { name: /Unranked|#\d+/ });
    await user.click(candidates[0]!);

    await screen.findByRole('heading', { name: /Who fights/i });
    const opponents = document.querySelectorAll('.candidate');
    await user.click(opponents[0] as HTMLElement);

    expect(await screen.findByRole('button', { name: /Pencil it in/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send the offer now/i })).toBeTruthy();
  });

  it('says whether a bout could be for a belt, and why not when it could not', async () => {
    const user = userEvent.setup();
    await openMainEvent(user);
    const candidates = await screen.findAllByRole('button', { name: /Unranked|#\d+/ });
    await user.click(candidates[0]!);

    await screen.findByRole('heading', { name: /Who fights/i });
    const opponents = document.querySelectorAll('.candidate');
    await user.click(opponents[0] as HTMLElement);

    expect(await screen.findByText(/Is this for a belt\?/i)).toBeTruthy();
    expect(screen.getByText(/For the title/i)).toBeTruthy();
  });

  it('marks a pencilled fight as unsigned until both corners agree', async () => {
    const user = userEvent.setup();
    await openMainEvent(user);
    const candidates = await screen.findAllByRole('button', { name: /Unranked|#\d+/ });
    await user.click(candidates[0]!);

    await screen.findByRole('heading', { name: /Who fights/i });
    const opponents = document.querySelectorAll('.candidate');
    await user.click(opponents[0] as HTMLElement);
    await user.click(await screen.findByRole('button', { name: /Pencil it in/i }));

    // More than one match is correct: the slot carries the chip and the review panel repeats it.
    expect((await screen.findAllByText(/Pencilled in/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Send every pencilled fight/i })).toBeTruthy();
  });
});

describe('autofill', () => {
  it('is scoped rather than all-or-nothing', async () => {
    /*
     * The distinction the brief is explicit about: autofill is a convenience, not the gameplay.
     * A promoter who books the main event, the co-main and two prospect fights themselves and
     * lets the matchmaker handle the undercard is doing the actual job.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    const prelims = await screen.findByRole('button', { name: /^Prelims$/i });
    expect(screen.getByRole('button', { name: /^Main card$/i })).toBeTruthy();

    // Picking a scope says what it will touch, so "autofill" is never an unexplained button.
    await user.click(prelims);
    expect(
      await screen.findByText(/The undercard, which nobody bought a ticket for/i),
    ).toBeTruthy();
  });

  it('suggests without booking', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    await user.click(await screen.findByRole('button', { name: /Suggest fights/i }));
    // Suggestions arrive as options to approve, and the card is still empty underneath them.
    await waitFor(
      () => expect(document.querySelectorAll('.bout--option').length).toBeGreaterThan(0),
      {
        timeout: 8000,
      },
    );
    expect(screen.getByRole('button', { name: /Dismiss these/i })).toBeTruthy();
  });

  it('fills a whole card when asked to', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    await user.click(await screen.findByRole('button', { name: /Fill them in/i }));
    await waitFor(() => expect(screen.queryAllByText(/Pencilled in/i).length).toBeGreaterThan(0), {
      timeout: 8000,
    });
  });
});

describe('sending the card out', () => {
  it('needs both corners, and reports who said what', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    await planACard(user);

    await user.click(await screen.findByRole('button', { name: /Fill them in/i }));
    await screen.findByRole('button', { name: /Send every pencilled fight/i });
    await user.click(screen.getByRole('button', { name: /Send every pencilled fight/i }));

    // Some say yes and some do not — the point is that the answer is theirs, so both outcomes
    // are a pass and an unchanged card is not.
    await waitFor(
      () =>
        expect(
          screen.queryAllByText(/Signed|Turned down/i).length,
          'nobody answered the offer',
        ).toBeGreaterThan(0),
      { timeout: 10000 },
    );
  });
});

describe('championships', () => {
  it('shows every belt, its holder and the queue behind them', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/champions');

    // One heading per division, so several is the pass condition rather than a collision.
    expect((await screen.findAllByText(/Next in line/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Eligible for the shot|Not yet/).length).toBeGreaterThan(0);
  });
});

describe('the roster, from the promotion’s chair', () => {
  it('opens on who needs a decision rather than on an alphabetical list', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/stable');

    expect(await screen.findByText(/Under contract/i)).toBeTruthy();
    expect(screen.getByText(/Need a decision/i)).toBeTruthy();
  });

  it('says what a roster costs to keep, whether or not it is fighting', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/stable');

    expect(await screen.findByText(/to keep on the books, fighting or not/i)).toBeTruthy();
  });

  it('offers the unsigned pool as a population you can act on', async () => {
    // A roster is not a fixed set, and until now the only way anybody joined one was the
    // world's own signing pass.
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/stable');

    await user.click(await screen.findByRole('radio', { name: /Free agents/i }));
    expect(
      await screen.findByRole('heading', { name: /Free agents in your divisions/i }),
    ).toBeTruthy();
  });

  it('does not flag the whole roster on the day you take over', async () => {
    /*
     * A seeded fighter's real career lives in `priorRecord`, which carries no dates, so treating
     * an empty in-simulation record as an infinite layoff flagged all seventy-two of them at
     * once — which is not a list sorted by who needs a decision, it is a list.
     */
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/stable');

    await screen.findByText(/Need a decision/i);
    expect(screen.getByText(/Nothing on fire/i)).toBeTruthy();
  });

  it('lets a fighter be pushed, tested or protected', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/stable');

    await user.click(await screen.findByRole('radio', { name: /Everybody/i }));
    expect((await screen.findAllByRole('radio', { name: /^Push/i })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('radio', { name: /^Protect/i }).length).toBeGreaterThan(0);
  });

  it('does not release anybody on the first tap', async () => {
    const user = userEvent.setup();
    await becomePromoter(user);
    goTo('#/stable');

    await user.click(await screen.findByRole('radio', { name: /Everybody/i }));
    const release = (await screen.findAllByRole('button', { name: /^Release$/i }))[0]!;
    await user.click(release);
    expect(screen.getAllByRole('button', { name: /^Yes — release /i }).length).toBeGreaterThan(0);
  });
});
