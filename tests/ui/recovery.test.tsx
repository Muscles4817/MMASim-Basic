/**
 * Being hurt, and doing something about it, from the player's side of the screen.
 *
 * Three complaints, all of them about where things live rather than about the model underneath:
 *
 *  - "When I'm injured I think that really should show on the main page. It's hidden in Go
 *    Training right now." It was: `TrainingScreen` had the only injury alert in the game.
 *  - "I should be able to rest X amount of time from the main page as well instead of scrolling
 *    all the way down to Go Training then scrolling all the way down to the rest option."
 *  - "I get a lot of injuries and it's not clear how if at all I'm meant to avoid them." The
 *    hazard has always had three terms the player decides and showed none of them.
 *
 * Written at this tier because that is exactly where the defect was. What the numbers do is
 * measured in `injuries.test.ts` and `rest-and-recovery.test.ts`; the claim here is that the
 * screens say it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { asId, type Fighter, type InjuryId } from '@mmasim/engine';
import { getWorld, type GameDb } from '@mmasim/data';
import { App } from '../../packages/app/src/App';
import { GameProvider, useGame } from '../../packages/app/src/state/GameProvider';
import { RouterProvider } from '../../packages/app/src/state/router';
import { ThemeProvider } from '../../packages/app/src/state/theme';
import { ErrorBoundary } from '../../packages/app/src/shell/ErrorBoundary';
import { formatGameDay } from '../../packages/app/src/shell/Shell';

let db: GameDb | undefined;
let commit: (() => void) | undefined;

function Capture() {
  const game = useGame();
  db = game.db;
  commit = game.commit;
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
  commit = undefined;
});

afterEach(cleanup);

/** Take over a seeded fighter, which is the fastest route to a live career. */
async function takeOverAFighter(user: ReturnType<typeof userEvent.setup>) {
  goTo('#/start/fighter');
  renderApp();
  // Three steps now rather than one tap, which is the whole change: browse, inspect,
  // then commit explicitly. Clicking a row used to start the save.
  const rows = await screen.findAllByRole('button', { name: /./ });
  const row = rows.find((r) => r.classList.contains('datatable__rowbutton'))!;
  await user.click(row);
  await user.click(await screen.findByRole('button', { name: /^Take control of/i }));
  await user.click(await screen.findByRole('button', { name: /^Yes — take control of/i }));
}

const player = (): Fighter =>
  db!.fighters.getById(getWorld(db!).playerFighterId as string) as Fighter;

/** Put a serious knee on the player, the way a camp would. */
function injureThePlayer(weeks = 10, severity = 0.7) {
  const day = getWorld(db!).day;
  const me = player();
  db!.fighters.upsert({
    ...me,
    injuries: [
      {
        id: asId<InjuryId>('inj_test_knee'),
        type: 'knee',
        day,
        healedDay: day + weeks * 7,
        severity,
        source: 'camp',
      },
    ],
  } as Fighter & { id: string });
  db!.save();
  commit!();
}

describe('an injury is on the front page', () => {
  it('says you are hurt, and how long for, on the dashboard rather than three taps down', async () => {
    const user = userEvent.setup();
    await takeOverAFighter(user);
    injureThePlayer(10);

    goTo('#/hub');
    expect(await screen.findByText(/You are hurt/i)).toBeTruthy();
    expect(document.body.textContent ?? '').toMatch(/knee/i);
  });

  it('says what fighting on it would actually cost, which nothing ever did', async () => {
    /*
     * `injuredAttributes` applies the suppression silently at fight time and tells nobody. That is
     * the right rule for what an *opponent* knows and the wrong one for what a fighter knows about
     * their own knee.
     */
    const user = userEvent.setup();
    await takeOverAFighter(user);
    injureThePlayer(10);

    goTo('#/hub');
    await screen.findByText(/You are hurt/i);
    expect(document.body.textContent ?? '').toMatch(/Fighting like this costs you/i);
  });

  it('shows nothing at all when the fighter is fit', async () => {
    // A permanent "you are healthy" panel is a panel the player stops reading, which is exactly
    // the state you need them reading it in.
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    await screen.findByText(/Rest and recovery/i);
    expect(screen.queryByText(/You are hurt/i)).toBeNull();
  });
});

/*
 * Rest moved from the dashboard to the training screen.
 *
 * Doc 32 § 5.2: training and resting are the same decision taken from opposite ends — spend
 * condition or restore it — and a player weighing an eight-week camp against being flat should
 * see both answers at once. The dashboard still *diagnoses* it ("Flat — 34" in the condition
 * strip, and a ranked situation row) and sends them here to act.
 */
describe('resting is a decision on the training screen', () => {
  it('offers spans from a few days upward', async () => {
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    expect(await screen.findByText(/Rest and recovery/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^3 days$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1 week$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^8 weeks$/ })).toBeTruthy();
  });

  it('moves the clock by the days asked for, not by the month the game used to insist on', async () => {
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    await screen.findByText(/Rest and recovery/i);
    const before = getWorld(db!).day;

    await user.click(screen.getByRole('button', { name: /^1 week$/ }));

    expect(getWorld(db!).day).toBe(before + 7);
    expect((await screen.findByTestId('rest-summary')).textContent ?? '').toMatch(/7 days off/);
  });

  it('walks the block day by day rather than jumping it', async () => {
    /*
     * The complaint verbatim: "because the game forces me to jump 4 weeks at a time the Freshness
     * system looks like it jumps massively every time. I want the game to tick by day by day in
     * some more visible manner."
     *
     * The readout starts at the front of the block and arrives at the end of it, so what the
     * player watches is the block being lived through. It is not a decoration over the result —
     * the values come from the same per-day recovery rate the model charges once over the span,
     * which is why the walk and the jump agree about the fighter they leave behind.
     */
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    await screen.findByText(/Rest and recovery/i);
    const before = getWorld(db!).day;

    await user.click(screen.getByRole('button', { name: /^4 weeks$/ }));

    // Mid-flight: the card is showing a day inside the block, not the day it ends on.
    const midFlight = screen.getByTestId('rest-day').textContent;
    expect(midFlight).not.toBe(formatGameDay(before + 28));
    expect(midFlight).not.toBe(formatGameDay(before));

    // And it settles on the last day of the block rather than wherever the tick happened to be.
    await expect
      .poll(() => screen.getByTestId('rest-day').textContent, { timeout: 5000 })
      .toBe(formatGameDay(before + 28));
  });

  it('offers to rest exactly as long as the injury needs', async () => {
    const user = userEvent.setup();
    await takeOverAFighter(user);
    injureThePlayer(6);

    goTo('#/training');
    const untilFit = await screen.findByRole('button', { name: /^Until fit \(/i });
    await user.click(untilFit);

    // Healed, and the screen stops saying you are hurt.
    await expect.poll(() => screen.queryByText(/You are hurt/i)).toBeNull();
  });
});

describe('the injury risk of a camp is quoted before it is run', () => {
  it('puts a number on the training screen, where the decision is made', async () => {
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    const risk = await screen.findByTestId('injury-risk');
    expect(risk.textContent ?? '').toMatch(/Injury risk over this block/i);
    expect(risk.textContent ?? '').toMatch(/\d+%/);
  });

  it('falls when the player backs off, which is the whole point of showing it', async () => {
    /*
     * "It's not clear how if at all I'm meant to avoid them." Intensity, block length and rest all
     * move this number and none of them said so anywhere in the game.
     */
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    const read = () =>
      Number(/(\d+)%/.exec(screen.getByTestId('injury-risk').textContent ?? '')?.[1] ?? '0');

    await screen.findByTestId('injury-risk');
    const standard = read();

    await user.click(screen.getByRole('radio', { name: /Light/i }));
    const light = read();

    expect(light).toBeLessThan(standard);
  });

  it('gets cheaper again on a shorter block', async () => {
    const user = userEvent.setup();
    await takeOverAFighter(user);

    goTo('#/training');
    const read = () =>
      Number(/(\d+)%/.exec(screen.getByTestId('injury-risk').textContent ?? '')?.[1] ?? '0');

    await screen.findByTestId('injury-risk');
    const eightWeeks = read();

    // Anchored, because "12 weeks" contains "2 weeks".
    await user.click(screen.getByRole('radio', { name: /^2 weeks/i }));
    expect(read()).toBeLessThan(eightWeeks);
  });
});
