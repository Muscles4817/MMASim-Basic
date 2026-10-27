/**
 * Fight week on the card screen. Doc 34 A5.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewGame, getWorld, setWorld } from '@mmasim/data';
import type { Promotion } from '@mmasim/engine';
import { planById, promoterContext } from '../../packages/app/src/game/plans';
import { FightWeekPanel, WeighInPanel } from '../../packages/app/src/screens/FightWeekPanel';
import { agreed, filledPlan } from '../helpers/plans';

afterEach(cleanup);

function inFightWeek() {
  const db = createNewGame({ adapter: undefined, era: '2026' });
  const promotion = (db.promotions.findAll() as unknown as Promotion[])
    .slice()
    .sort((a, b) => b.prestige - a.prestige)[0]!;
  setWorld(db, { playerRole: 'promoter', playerPromotionId: promotion.id as string });
  const today = getWorld(db).day;
  const plan = agreed(db, filledPlan({ db, promotion, day: today + 30, today }));
  setWorld(db, { day: plan.day - 3 });
  const ctx = promoterContext({ db, promotion, day: plan.day - 3 });
  return { db, ctx, plan };
}

describe('the press conference', () => {
  it('offers three ways to play it, each saying what it risks', () => {
    const { ctx, plan } = inFightWeek();
    render(<FightWeekPanel ctx={ctx} plan={plan} onChange={() => {}} onPress={() => {}} />);
    expect(screen.getByText('The press conference')).toBeTruthy();
    for (const label of [/Keep it civil/, /Let them talk/, /Stage a face-off/]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByText(/chance it turns into a scuffle/)).toBeTruthy();
  });

  it('holds it once, and then shows what was said', async () => {
    const user = userEvent.setup();
    const { db, ctx, plan } = inFightWeek();
    const onPress = vi.fn();
    render(<FightWeekPanel ctx={ctx} plan={plan} onChange={() => {}} onPress={onPress} />);
    await user.click(screen.getByRole('button', { name: /Let them talk/ }));
    expect(onPress).toHaveBeenCalledOnce();

    cleanup();
    const held = planById(db, plan.id)!;
    render(<FightWeekPanel ctx={ctx} plan={held} onChange={() => {}} onPress={onPress} />);
    expect(screen.queryByRole('button', { name: /Let them talk/ })).toBeNull();
    for (const line of held.fightWeek!.press!.lines) expect(screen.getByText(line)).toBeTruthy();
  });

  it('is not there a month out on a card nobody fell out of', () => {
    const { ctx, plan } = inFightWeek();
    const far = { ...plan, day: ctx.day + 40 };
    const { container } = render(
      <FightWeekPanel ctx={ctx} plan={far} onChange={() => {}} onPress={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('the weigh-in (the seam C6 plugs into)', () => {
  const nameOf = (id: string) => (id === 'a' ? 'Ruiz' : 'Okafor');

  it('offers a catchweight or calling it off, and says who missed by how much', async () => {
    const user = userEvent.setup();
    const resolve = vi.fn();
    render(
      <WeighInPanel
        nameOf={nameOf}
        resolve={resolve}
        weighIn={{
          results: [
            { fighterId: 'a', weighed: 158.5, limit: 156, made: false },
            { fighterId: 'b', weighed: 155.5, limit: 156, made: true },
          ],
          opponentAccepts: true,
        }}
      />,
    );
    expect(screen.getByText(/Ruiz weighed 158.5 lb, 2.5 over the 156 lb limit/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Fight at a catchweight' }));
    expect(resolve).toHaveBeenCalledWith('catchweight');
  });

  it('leaves only calling it off when the opponent will not take it', () => {
    render(
      <WeighInPanel
        nameOf={nameOf}
        resolve={() => {}}
        weighIn={{
          results: [{ fighterId: 'a', weighed: 160, limit: 156, made: false }],
          opponentAccepts: false,
        }}
      />,
    );
    const catchweight = screen.getByRole('button', {
      name: 'Fight at a catchweight',
    }) as HTMLButtonElement;
    expect(catchweight.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Call the bout off' })).toBeTruthy();
  });
});
