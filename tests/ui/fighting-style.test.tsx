/**
 * The depth the engine gained in doc 36, where a player can see it: how a fighter fights, what got
 * hurt during a fight, and what a camp drilled.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createNewGame, getWorld, type GameDb } from '@mmasim/data';
import { describeDrilling, describeFightingStyle, type Fighter, type FightResult } from '@mmasim/engine';
import { FighterView } from '../../packages/app/src/screens/FighterView';
import { InjuryList } from '../../packages/app/src/screens/FightScreen';
import { CampReport } from '../../packages/app/src/screens/CampReport';

afterEach(cleanup);

const db: GameDb = createNewGame({ era: '2026' });
const day = getWorld(db).day;
const fighters = db.fighters.findAll() as Fighter[];

describe('how they fight', () => {
  it('shows the stance shape with what it buys and costs, the combinations and the clinch game', () => {
    const fighter = fighters.find((f) => f.background)!;
    const style = describeFightingStyle(fighter);
    render(<FighterView db={db} day={day} fighter={fighter} viewer="promoter" />);
    const card = screen.getByText('How they fight').closest('section, .card, div')!.parentElement!;
    const text = card.textContent ?? '';
    expect(text).toContain(style.stance.label);
    expect(text).toContain(style.stance.pro);
    expect(text).toContain(style.stance.con);
    expect(within(card).getByText('Combinations')).toBeTruthy();
    expect(within(card).getByText('Clinch')).toBeTruthy();
  });

  it('speaks to the player about their own fighter', () => {
    render(<FighterView db={db} day={day} fighter={fighters[0]!} viewer="self" />);
    expect(screen.getByText('How you fight')).toBeTruthy();
  });

  it('names a specialist’s signature submission', () => {
    const specialist = fighters.find((f) => describeFightingStyle(f).signatureSub)!;
    expect(specialist).toBeTruthy();
    render(<FighterView db={db} day={day} fighter={specialist} viewer="none" />);
    expect(document.body.textContent).toContain(`${describeFightingStyle(specialist).signatureSub} (signature)`);
  });

  it('describes different fighters differently', () => {
    const stances = new Set(fighters.map((f) => describeFightingStyle(f).stance.label));
    const clinch = new Set(fighters.map((f) => describeFightingStyle(f).clinch.label));
    expect(stances.size).toBeGreaterThanOrEqual(3);
    expect(clinch.size).toBeGreaterThanOrEqual(3);
  });
});

describe('what got hurt during the fight', () => {
  it('lists each injury with its corner and round', () => {
    const result = {
      injuries: {
        red: [{ kind: 'hand', round: 2, severity: 0.7 }],
        blue: [{ kind: 'rib', round: 3, severity: 0.3 }],
      },
    } as unknown as FightResult;
    render(<InjuryList result={result} redName="Alpha" blueName="Bravo" />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Alpha: badly injured hand\s*\(round 2\)/);
    expect(text).toMatch(/Bravo: injured ribs\s*\(round 3\)/);
  });

  it('says nothing when nobody was hurt, including on results saved before injuries existed', () => {
    const { container } = render(
      <InjuryList result={{} as FightResult} redName="Alpha" blueName="Bravo" />,
    );
    expect(container.textContent).toBe('');
  });
});

describe('what a camp drilled', () => {
  it('reports a drilled pattern and a new signature submission', () => {
    const before = fighters.find((f) => f.attributes.submissions >= 62 && !describeFightingStyle(f).signatureSub)!;
    const after: Fighter = { ...before, style: { signatureSub: 'heelHook', combos: { oneTwo: 3 } } };
    const lines = describeDrilling(before, after);
    expect(lines.some((l) => /more drilled/.test(l))).toBe(true);
    expect(lines.some((l) => /heel hook.*signature submission/i.test(l))).toBe(true);

    render(
      <CampReport
        outcome={{ gains: {}, notes: [], days: 56, drilled: lines }}
        day={day}
        onDone={() => {}}
        onAgain={() => {}}
      />,
    );
    expect(screen.getByText('What got drilled')).toBeTruthy();
    expect(screen.getByText(lines[0]!)).toBeTruthy();
  });

  it('reports nothing when a camp drilled nothing', () => {
    expect(describeDrilling(fighters[0]!, fighters[0]!)).toEqual([]);
  });
});
