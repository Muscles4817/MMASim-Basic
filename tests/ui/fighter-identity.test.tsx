/**
 * The fighter page as a person, and a page that agrees with itself. Doc 34 C1.
 *
 * Rendered directly against a 2026 database rather than through the whole app, because each of
 * these is a fact about one fighter in one state — an expired deal, a belt, an injury — and the
 * cheapest honest way to put a fighter in that state is to write it down.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewGame, getWorld, type GameDb } from '@mmasim/data';
import {
  createAgreement,
  defaultTerms,
  type Fighter,
  type FightRecordEntry,
  type Promotion,
} from '@mmasim/engine';
import { FighterView } from '../../packages/app/src/screens/FighterView';

afterEach(cleanup);

const db: GameDb = createNewGame({ era: '2026' });
const day = getWorld(db).day;
const fighters = db.fighters.findAll() as Fighter[];
const promotions = db.promotions.findAll() as unknown as Promotion[];

/** A generated depth fighter: they carry a background, which is what the identity strip reads. */
const generated = fighters.find((f) => f.background && f.promotionId && !f.gymId)!;

const view = (fighter: Fighter, viewer: 'promoter' | 'self' = 'promoter') =>
  render(<FighterView db={db} day={day} fighter={fighter} viewer={viewer} />);

describe('identity', () => {
  it('shows where they are from, what they came out of, where they train and the body', () => {
    view(generated);
    const strip = within(screen.getByTestId('identity-strip'));
    expect(strip.getByText('From')).toBeTruthy();
    expect(strip.getByText('Came up in')).toBeTruthy();
    expect(strip.getByText(/Head coach /)).toBeTruthy();
    expect(strip.getByText('Reach')).toBeTruthy();
    expect(strip.getByText(/ lb$/)).toBeTruthy();
    expect(strip.getByRole('img', { name: /silhouette/i })).toBeTruthy();
  });
});

describe('a page that does not contradict itself', () => {
  it('says Champion once, and never calls a champion beneath the ranked fighters', () => {
    const promotion = promotions.find((p) => Object.keys(p.champions).length > 0)!;
    const [divisionId, championId] = Object.entries(promotion.champions)[0]!;
    const champion = db.fighters.findById(championId as string) as Fighter;
    expect(champion.divisionId).toBe(divisionId);

    view(champion);
    const header = screen.getByTestId('fighter-view');
    // Chips only: the ledger's "Expected level: Champion" row is a different statement.
    const chips = [...header.querySelectorAll('.chip')].filter((c) =>
      /^\W*Champion$/.test(c.textContent?.trim() ?? ''),
    );
    expect(chips).toHaveLength(1);
    expect(header.textContent).not.toMatch(/not troubling the ranked fighters/i);
    expect(header.textContent).not.toMatch(/Somebody ranked/);
  });

  it('agrees with itself about an expired deal on both tabs', async () => {
    const promotion = promotions.find((p) => p.id === generated.promotionId)!;
    const agreement = {
      ...createAgreement({
        fighter: generated,
        promotion,
        terms: { ...defaultTerms(generated, promotion), fightsOwed: 4 } as never,
        day: day - 2000,
      }),
    };
    db.agreements.upsert(agreement as never);
    const signed = { ...generated, agreementId: agreement.id };

    view(signed);
    expect(screen.getAllByText(/deal expired/i).length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Contract' }));
    expect(screen.getAllByText(/deal expired/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Fights remaining')).toBeNull();
    // The purse the overview quotes is on this tab too, labelled for what it is.
    expect(screen.getByText('Main-card purse')).toBeTruthy();
  });

  it('shows the last few fights as recent form, not the whole career', () => {
    const entry = (i: number, outcome: FightRecordEntry['outcome']): FightRecordEntry => ({
      boutId: `b${i}`,
      opponentId: fighters[0]!.id,
      promotionId: generated.promotionId!,
      day: day - 400 + i * 30,
      outcome,
      method: 'decisionUnanimous',
      round: 3,
      timeSeconds: 300,
      divisionId: generated.divisionId,
      wasTitleFight: false,
    });
    const record = [
      ...Array.from({ length: 6 }, (_, i) => entry(i, 'win')),
      ...Array.from({ length: 3 }, (_, i) => entry(6 + i, 'loss')),
    ];
    view({ ...generated, record });
    const form = screen.getByText(/Recent form · last 5/i).closest('section, div')!;
    expect(form.textContent).toMatch(/2W3L/);
  });

  it('shows a promoter scouted ranges rather than the true ratings', async () => {
    view(generated);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Skills' }));
    const meters = screen.getAllByRole('meter');
    expect(
      meters.every((m) => /scouted at \d+ to \d+/.test(m.getAttribute('aria-label') ?? '')),
    ).toBe(true);
  });

  it('shows you your own ratings exactly', async () => {
    view(generated, 'self');
    await userEvent.setup().click(screen.getByRole('tab', { name: 'My skills' }));
    const meters = screen.getAllByRole('meter');
    expect(meters.some((m) => /scouted/.test(m.getAttribute('aria-label') ?? ''))).toBe(false);
  });
});
